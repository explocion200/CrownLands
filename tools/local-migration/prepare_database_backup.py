#!/usr/bin/python3
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import install_database_backup as installer
import postgres_backup as backup


def prepare(game_bundle, bundle):
    repo = Path(__file__).resolve().parents[2]
    if not bundle.is_absolute() or bundle.exists() or subprocess.check_output(["git", "status", "--porcelain"], cwd=repo).strip():
        raise RuntimeError("A clean validated workspace and new absolute private bundle are required")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    game = json.loads((game_bundle / "config.json").read_text())
    schemas = backup.validate_schemas([game["authSchema"], game["schema"]])
    before = installer.PROGRAM.read_bytes()
    installer.updated_program(before.decode())
    bundle.mkdir(mode=0o700)
    for source, name in [("postgres_backup.py", "postgres_backup.py"), ("install_database_backup.py", "install.py")]:
        shutil.copyfile(Path(__file__).with_name(source), bundle / name); (bundle / name).chmod(0o600)
    manifest = {"commit": commit, "schemas": schemas, "backupProgramBeforeSha256": hashlib.sha256(before).hexdigest()}
    (bundle / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n"); (bundle / "manifest.json").chmod(0o600)
    lines = [hashlib.sha256(file.read_bytes()).hexdigest() + "  " + file.name for file in sorted(bundle.iterdir())]
    (bundle / "SHA256SUMS").write_text("\n".join(lines) + "\n"); (bundle / "SHA256SUMS").chmod(0o600)
    print("Prepared consistent database backup and restricted restore check from " + commit)


if __name__ == "__main__":
    try:
        prepare(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
    except Exception:
        raise SystemExit("Database backup preparation stopped; existing backups and partial files were preserved. Private details were not logged.") from None
