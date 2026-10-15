#!/usr/bin/env python3
"""Root-owned static publisher. Never executes downloaded game/repository code."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

REPO = "explocion200/CrownLands"
WORKFLOW = REPO + "/.github/workflows/crownlands-local-publish.yml"
MAX_PACKAGE = 160 * 1024 * 1024
MAX_CONTENT = 400 * 1024 * 1024
MAX_FILES = 10000
SHA = re.compile(r"[0-9a-f]{40}")
HOSTS = {"api.github.com", "github.com", "release-assets.githubusercontent.com",
         "objects.githubusercontent.com"}


class BackendHold(ValueError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(name):
    parts = PurePosixPath(name).parts
    if (not parts or name.startswith("/") or "\\" in name or "\0" in name
            or any(p in ("", ".", "..") or p.startswith(".") for p in name.split("/"))
            or any(ord(c) < 32 for c in name)):
        raise ValueError("Unsafe package path")
    return name


def check_url(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname not in HOSTS
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise ValueError("Unapproved download destination")
    return url


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url, limit):
    check_url(url)
    opener = urllib.request.build_opener(SafeRedirect)
    request = urllib.request.Request(url, headers={"User-Agent": "Crownlands-local-publisher/1",
                                                 "Accept": "application/vnd.github+json"})
    with opener.open(request, timeout=45) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Download exceeds size limit")
    return data


def main_head():
    data = json.loads(download("https://api.github.com/repos/" + REPO + "/commits/main", 2 * 1024 * 1024))
    sha = data.get("sha", "")
    if not SHA.fullmatch(sha):
        raise ValueError("Invalid main commit")
    return sha


def verify_signature(package, bundle, sha, gh):
    # A local bundle works without a GitHub credential. Enforce repository,
    # workflow, main ref, source commit, artifact digest and GitHub-hosted runner.
    result = subprocess.run([
        str(gh), "attestation", "verify", str(package), "--bundle", str(bundle),
        "--repo", REPO, "--signer-workflow", WORKFLOW, "--source-ref", "refs/heads/main",
        "--source-digest", sha, "--deny-self-hosted-runners",
    ], capture_output=True, text=True, timeout=120,
        env={"PATH": "/usr/bin:/bin", "HOME": str(package.parent),
             "GH_CONFIG_DIR": str(package.parent / "gh-config")})
    if result.returncode:
        raise ValueError("GitHub package signature/provenance verification failed: "
                         + (result.stderr or result.stdout)[-1500:])


def unpack(package, destination, sha, approved):
    """Extract regular files only, with explicit inventory, bounds and hashes."""
    with tarfile.open(package, "r|gz") as archive:
        entries = iter(archive)
        first = next(entries, None)
        if not first or first.name != "deployment.json" or not first.isfile() or first.size > 2 * 1024 * 1024:
            raise ValueError("Missing bounded release metadata")
        meta = json.load(archive.extractfile(first))
        if (meta.get("schemaVersion") != 1 or meta.get("commit") != sha
                or meta.get("repository") != REPO or meta.get("channel") != "local-live"):
            raise ValueError("Release identity mismatch")
        for key in ("backend", "firebaseConfigHash", "firebaseDeploymentHash"):
            if meta.get(key) != approved.get(key):
                raise BackendHold("Backend change held for migration: " + key)
        files = meta.get("files")
        if not isinstance(files, dict) or not 1 <= len(files) <= MAX_FILES:
            raise ValueError("Invalid file inventory")
        total = 0
        for name, item in files.items():
            safe_path(name)
            if (not isinstance(item.get("bytes"), int) or item["bytes"] < 0
                    or not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", ""))):
                raise ValueError("Invalid file metadata")
            total += item["bytes"]
        if total > MAX_CONTENT:
            raise ValueError("Unpacked release exceeds size limit")
        required = {"play/index.html", "index.html", "service-worker.js", "firebase-config.js",
                    "release-manifest.js", "manifest.webmanifest", "app-entry.js",
                    "firebaseClient.js", "local-deployment.json"}
        if not required.issubset(files):
            raise ValueError("Missing required game entry files")
        seen = set()
        for entry in entries:
            if entry.name == "deployment.json":
                raise ValueError("Duplicate metadata")
            if not entry.name.startswith("game/") or not entry.isfile():
                raise ValueError("Only regular game files may be extracted")
            name = safe_path(entry.name[5:])
            if name not in files or name in seen or entry.size != files[name]["bytes"]:
                raise ValueError("Archive differs from signed file inventory")
            data = archive.extractfile(entry).read(entry.size + 1)
            if len(data) != entry.size or digest(data) != files[name]["sha256"]:
                raise ValueError("File checksum mismatch")
            output = destination / "game" / name
            output.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with output.open("xb") as handle:
                handle.write(data)
            output.chmod(0o644)
            seen.add(name)
        if seen != set(files):
            raise ValueError("Incomplete release")
    public = json.loads((destination / "game/local-deployment.json").read_text())
    if public.get("commit") != sha:
        raise ValueError("Public build identity mismatch")
    if sha not in (destination / "game/play/index.html").read_text():
        raise ValueError("Game HTML has wrong build identity")
    if ('const CACHE_VERSION = "' + sha + '";') not in (destination / "game/service-worker.js").read_text():
        raise ValueError("Service worker has wrong build identity")
    (destination / "deployment.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def atomic_json(path, value):
    tmp = path.with_suffix(".next")
    with tmp.open("w") as handle:
        handle.write(json.dumps(value, indent=2) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    tmp.chmod(0o644)
    os.replace(tmp, path)
    sync_directory(path.parent)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def swap(current, target):
    pending = current.with_name("current.next")
    if pending.exists() or pending.is_symlink():
        pending.unlink()
    pending.symlink_to(os.path.relpath(target, current.parent))
    os.replace(pending, current)
    sync_directory(current.parent)


def current_release(root):
    current = root / "current"
    resolved = current.resolve(strict=True)
    if not current.is_symlink() or resolved.parent != (root / "releases").resolve():
        raise ValueError("Unexpected current release location")
    return resolved


def copy_website(source, target):
    if source.is_symlink() or not source.is_dir():
        raise ValueError("Unexpected website directory")
    for item in source.rglob("*"):
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            raise ValueError("Unexpected website entry")
    shutil.copytree(source, target)


def smoke(root, meta, fetch=None):
    if fetch is None:
        def fetch(url):
            with urllib.request.urlopen(url, timeout=30) as response:
                if response.status != 200:
                    raise ValueError("HTTP smoke test failed")
                return response.read(MAX_CONTENT + 1)
    expected = {"/play/": "play/index.html", "/service-worker.js": "service-worker.js",
                "/release-manifest.js": "release-manifest.js", "/app-entry.js": "app-entry.js",
                "/firebaseClient.js": "firebaseClient.js", "/manifest.webmanifest": "manifest.webmanifest",
                "/local-deployment.json": "local-deployment.json"}
    for host in ("https://playcrownlands.com", "https://game.playcrownlands.com"):
        for url, name in expected.items():
            if digest(fetch(host + url)) != meta["files"][name]["sha256"]:
                raise ValueError("Live file mismatch: " + host + url)
    website = current_release(root) / "website/index.html"
    if digest(fetch("https://playcrownlands.com/")) != digest(website.read_bytes()):
        raise ValueError("Public website changed unexpectedly")


def activate(root, state, staged, meta, smoke_fn=smoke, head_fn=main_head):
    if head_fn() != meta["commit"]:
        raise ValueError("A newer main commit arrived; stale package held")
    previous = current_release(root)
    destination = root / "releases" / ("auto-" + meta["commit"])
    if destination.exists():
        raise ValueError("Release already exists; inspect before retry")
    copy_website(previous / "website", staged / "website")
    staged.chmod(0o755)
    os.replace(staged, destination)
    sync_directory(destination.parent)
    # Persist recovery BEFORE the atomic symlink change, including power-loss recovery.
    transaction = {"previous": previous.name, "candidate": destination.name, "commit": meta["commit"]}
    atomic_json(state / "transaction.json", transaction)
    swap(root / "current", destination)
    try:
        smoke_fn(root, meta)
    except Exception:
        swap(root / "current", previous)
        atomic_json(state / "blocked.json", {"commit": meta["commit"], "reason": "Live smoke check failed"})
        (state / "transaction.json").unlink()
        raise
    atomic_json(state / "last-success.json", {**transaction, "activatedAt": now()})
    (state / "transaction.json").unlink()


def recover(root, state):
    path = state / "transaction.json"
    if not path.exists():
        return
    transaction = json.loads(path.read_text())
    for key in ("previous", "candidate"):
        safe_path(transaction[key])
        if "/" in transaction[key]:
            raise ValueError("Invalid recovery target")
    previous = root / "releases" / transaction["previous"]
    candidate = root / "releases" / transaction["candidate"]
    active = current_release(root)
    if active == candidate and previous.is_dir():
        swap(root / "current", previous)
    elif active != previous:
        raise ValueError("Recovery needs operator review; current release changed")
    atomic_json(state / "blocked.json", {"commit": transaction["commit"],
                                       "reason": "Interrupted activation rolled back"})
    path.unlink()


def run(config, root, state, check_only=False):
    recover(root, state)
    if (Path("/etc/crownlands-deploy") / "paused").exists():
        return {"status": "paused"}
    sha = main_head()
    active = current_release(root)
    if active.name == "auto-" + sha:
        return {"status": "current", "commit": sha}
    blocked = state / "blocked.json"
    if blocked.exists() and json.loads(blocked.read_text()).get("commit") == sha:
        return {"status": "held", **json.loads(blocked.read_text())}
    if shutil.disk_usage(root).free < 1024 * 1024 * 1024:
        raise ValueError("Less than 1 GiB free; publication held to protect the live server")
    base = "https://github.com/" + REPO + "/releases/download/local-game-" + sha + "/"
    with tempfile.TemporaryDirectory(prefix="download-", dir=state) as tmp:
        folder = Path(tmp)
        package = folder / "local-game.tar.gz"
        bundle = folder / "provenance.json"
        try:
            package.write_bytes(download(base + package.name, MAX_PACKAGE))
            bundle.write_bytes(download(base + bundle.name, 2 * 1024 * 1024))
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return {"status": "waiting-for-github-build", "commit": sha}
            raise
        verify_signature(package, bundle, sha, "/usr/local/lib/crownlands-deploy/gh")
        staged = Path(tempfile.mkdtemp(prefix=".stage-", dir=root / "releases"))
        try:
            try:
                meta = unpack(package, staged, sha, config["approved"])
            except BackendHold as error:
                held = {"commit": sha, "reason": str(error)}
                atomic_json(state / "blocked.json", held)
                return {"status": "held", **held}
            if check_only:
                return {"status": "verified-ready", "commit": sha, "fileCount": len(meta["files"])}
            activate(root, state, staged, meta)
        finally:
            if staged.exists():
                shutil.rmtree(staged)
    return {"status": "deployed", "commit": sha}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Verify candidate without activating it")
    args = parser.parse_args()
    root = Path("/srv/crownlands")
    state = Path("/var/lib/crownlands-deploy")
    config = json.loads(Path("/etc/crownlands-deploy/config.json").read_text())
    with (state / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            result = run(config, root, state, args.check)
            atomic_json(state / "status.json", {**result, "checkedAt": now()})
            print(json.dumps(result))
        except Exception as error:
            atomic_json(state / "status.json", {"status": "error", "checkedAt": now(), "reason": str(error)})
            raise


if __name__ == "__main__":
    main()
