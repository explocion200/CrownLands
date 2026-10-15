import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


p = load("publisher")
pack = load("pack")
COMMIT = "a" * 40
APPROVED = {"backend": {"serverSourceHash": "b" * 64, "contractHash": "c" * 64,
                       "releaseId": "live", "worldId": "world", "resetGeneration": "current"},
            "firebaseConfigHash": p.digest(b"config"), "firebaseDeploymentHash": p.digest(b"{}")}


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.host = self.root / "host"
        self.state = self.root / "state"
        self.state.mkdir()
        self.previous = self.host / "releases" / "previous"
        (self.previous / "website").mkdir(parents=True)
        (self.previous / "website/index.html").write_text("homepage")
        (self.host / "current").symlink_to("releases/previous")
        self.stage = self.host / "releases" / ".stage"
        self.stage.mkdir()
        self.package = self.root / "package.tar.gz"

    def archive(self, edit=None):
        files = {name: b"fixture" for name in ["index.html", "release-manifest.js",
                 "manifest.webmanifest", "app-entry.js", "firebaseClient.js"]}
        files.update({"play/index.html": COMMIT.encode(), "firebase-config.js": b"config",
                      "service-worker.js": ('const CACHE_VERSION = "' + COMMIT + '";').encode(),
                      "local-deployment.json": json.dumps({"commit": COMMIT}).encode()})
        meta = {"schemaVersion": 1, "repository": p.REPO, "channel": "local-live",
                "commit": COMMIT, **APPROVED,
                "files": {n: {"bytes": len(v), "sha256": p.digest(v)} for n, v in files.items()}}
        entries = [("game/" + n, data, tarfile.REGTYPE) for n, data in files.items()]
        if edit:
            edit(meta, entries)
        with tarfile.open(self.package, "w:gz") as tar:
            data = json.dumps(meta).encode()
            for name, data, kind in [("deployment.json", data, tarfile.REGTYPE)] + entries:
                info = tarfile.TarInfo(name)
                info.type = kind
                info.linkname = "/etc/passwd" if kind == tarfile.SYMTYPE else ""
                info.size = len(data) if kind == tarfile.REGTYPE else 0
                tar.addfile(info, io.BytesIO(data) if info.size else None)
        return meta

    def unpack(self):
        return p.unpack(self.package, self.stage, COMMIT, APPROVED)

    def test_valid_package_activates_and_preserves_website(self):
        self.archive()
        meta = self.unpack()
        p.activate(self.host, self.state, self.stage, meta, lambda *_: None, lambda: COMMIT)
        active = p.current_release(self.host)
        self.assertEqual(active.name, "auto-" + COMMIT)
        self.assertEqual((active / "website/index.html").read_text(), "homepage")
        self.assertTrue(self.previous.exists())
        self.assertEqual(active.stat().st_mode & 0o777, 0o755)

    def test_health_failure_rolls_back_and_blocks_retry(self):
        self.archive()
        meta = self.unpack()
        def fail(*_):
            raise ValueError("unhealthy")
        with self.assertRaisesRegex(ValueError, "unhealthy"):
            p.activate(self.host, self.state, self.stage, meta, fail, lambda: COMMIT)
        self.assertEqual(p.current_release(self.host), self.previous)
        self.assertEqual(json.loads((self.state / "blocked.json").read_text())["commit"], COMMIT)

    def test_power_loss_rolls_back(self):
        candidate = self.host / "releases" / ("auto-" + COMMIT)
        candidate.mkdir()
        p.atomic_json(self.state / "transaction.json", {
            "previous": "previous", "candidate": candidate.name, "commit": COMMIT})
        p.swap(self.host / "current", candidate)
        p.recover(self.host, self.state)
        self.assertEqual(p.current_release(self.host), self.previous)
        self.assertTrue((self.state / "blocked.json").exists())

    def test_newer_commit_holds_stale_build(self):
        self.archive()
        with self.assertRaisesRegex(ValueError, "newer main"):
            p.activate(self.host, self.state, self.stage, self.unpack(), lambda *_: None, lambda: "d" * 40)
        self.assertEqual(p.current_release(self.host), self.previous)

    def test_backend_change_is_held(self):
        self.archive(lambda meta, _: meta.update(backend={}))
        with self.assertRaisesRegex(ValueError, "Backend change held"):
            self.unpack()
        self.assertEqual(p.current_release(self.host), self.previous)

    def test_traversal_rejected(self):
        self.archive(lambda _, entries: entries.append(("game/../../escape", b"bad", tarfile.REGTYPE)))
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            self.unpack()
        self.assertFalse((self.host / "escape").exists())

    def test_symlink_rejected(self):
        self.archive(lambda _, entries: entries.append(("game/link", b"", tarfile.SYMTYPE)))
        with self.assertRaisesRegex(ValueError, "regular"):
            self.unpack()

    def test_duplicate_missing_and_corrupt_files_rejected(self):
        for mode in ("duplicate", "missing", "corrupt"):
            with self.subTest(mode=mode):
                folder = self.root / mode
                folder.mkdir()
                def edit(_, entries):
                    if mode == "duplicate": entries.append(entries[0])
                    if mode == "missing": entries.pop()
                    if mode == "corrupt":
                        n, data, kind = entries[0]
                        entries[0] = (n, b"x" * len(data), kind)
                self.archive(edit)
                with self.assertRaises(ValueError):
                    p.unpack(self.package, folder, COMMIT, APPROVED)

    def test_wrong_commit_and_oversized_release_rejected(self):
        self.archive(lambda meta, _: meta.update(commit="d" * 40))
        with self.assertRaisesRegex(ValueError, "identity"):
            self.unpack()
        self.archive(lambda meta, _: meta["files"]["index.html"].update(bytes=p.MAX_CONTENT + 1))
        with self.assertRaisesRegex(ValueError, "size limit"):
            self.unpack()

    def test_live_smoke_detects_stale_service_worker(self):
        self.archive()
        meta = self.unpack()
        def fetch(url):
            if url.endswith("/service-worker.js"): return b"old worker"
            return (self.stage / "game/play/index.html").read_bytes()
        with self.assertRaisesRegex(ValueError, "service-worker"):
            p.smoke(self.host, meta, fetch)

    def test_signature_verification_enforces_all_trust_constraints(self):
        with patch.object(p.subprocess, "run") as run:
            run.return_value.returncode = 0
            p.verify_signature(self.package, self.root / "bundle.json", COMMIT, "/trusted/gh")
            args = run.call_args.args[0]
            for flag, value in (("--repo", p.REPO), ("--source-digest", COMMIT),
                                ("--source-ref", "refs/heads/main"), ("--signer-workflow", p.WORKFLOW)):
                self.assertEqual(args[args.index(flag) + 1], value)
            self.assertIn("--deny-self-hosted-runners", args)
            run.return_value.returncode = 1
            run.return_value.stderr = "bad signature"
            with self.assertRaisesRegex(ValueError, "signature"):
                p.verify_signature(self.package, self.root / "bundle.json", COMMIT, "/trusted/gh")

    def test_redirects_reject_credentials_and_untrusted_hosts(self):
        for url in ("http://github.com/file", "https://evil.example/file",
                    "https://github.com.evil.example/file", "https://user@github.com/file"):
            with self.assertRaises(ValueError): p.check_url(url)
        self.assertEqual(p.check_url("https://release-assets.githubusercontent.com/file"),
                         "https://release-assets.githubusercontent.com/file")

    def test_packaging_round_trip(self):
        self.archive()
        meta = self.unpack()
        source = self.root / "source"
        (source / "functions").mkdir(parents=True)
        (source / "firebase.json").write_bytes(b"{}")
        (source / "functions/release-manifest.json").write_text(
            json.dumps({**meta["backend"], "buildId": COMMIT}))
        (self.stage / "game").rename(source / "dist")
        package = self.root / "roundtrip.tar.gz"
        packed = pack.package(source, package, COMMIT)
        extracted = self.root / "roundtrip"
        extracted.mkdir()
        self.assertEqual(p.unpack(package, extracted, COMMIT, APPROVED)["files"], packed["files"])


if __name__ == "__main__":
    unittest.main()
