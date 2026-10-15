#!/usr/bin/env python3
"""Package an already-validated static build; no credentials or server source."""
import hashlib
import json
import os
from pathlib import Path
import re
import tarfile
import io


def digest(data):
    return hashlib.sha256(data).hexdigest()


def package(root, output, sha):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("An exact source commit is required")
    dist = root / "dist"
    backend = json.loads((root / "functions/release-manifest.json").read_text())
    if backend["buildId"] != sha or sha not in (dist / "play/index.html").read_text():
        raise ValueError("Build identity does not match source commit")
    public = {"schemaVersion": 1, "commit": sha,
              "repository": "explocion200/CrownLands", "channel": "local-live"}
    (dist / "local-deployment.json").write_text(json.dumps(public, indent=2) + "\n")
    files = {}
    for path in sorted(dist.rglob("*")):
        if path.is_symlink():
            raise ValueError("Symlinks are not deployable")
        if not path.is_file():
            continue
        name = path.relative_to(dist).as_posix()
        if any(part.startswith(".") for part in path.relative_to(dist).parts):
            raise ValueError("Hidden files are not deployable")
        files[name] = {"sha256": digest(path.read_bytes()), "bytes": path.stat().st_size}
    metadata = {**public, "backend": {key: backend[key] for key in
                ("serverSourceHash", "contractHash", "releaseId", "worldId", "resetGeneration")},
                "firebaseConfigHash": digest((dist / "firebase-config.js").read_bytes()),
                "firebaseDeploymentHash": digest((root / "firebase.json").read_bytes()),
                "files": files}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output, "w:gz") as archive:
        data = (json.dumps(metadata, sort_keys=True) + "\n").encode()
        entry = tarfile.TarInfo("deployment.json")
        entry.size = len(data)
        entry.mode = 0o644
        archive.addfile(entry, io.BytesIO(data))
        for name in files:
            archive.add(dist / name, arcname="game/" + name, recursive=False)
    return metadata


if __name__ == "__main__":
    package(Path(__file__).resolve().parents[2], Path("release-artifacts/local-game.tar.gz"),
            os.environ.get("GITHUB_SHA", ""))
    print("Packaged validated local game release.")
