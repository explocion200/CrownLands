#!/usr/bin/python3
"""Add consistent PostgreSQL snapshots to the existing encrypted host backup."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid

PROGRAM = Path("/usr/local/lib/crownlands-backup/crownlands-backup.py")
HELPER = PROGRAM.with_name("postgres_backup.py")
SOURCES = Path("/etc/crownlands-backup/sources.txt")
STAGE = Path("/var/lib/crownlands-backup/recovery-metadata/postgres")
EXTRA_SOURCES = ["/etc/postgresql", *[base + name for base in ["/etc/", "/usr/local/lib/"] for name in
                 ["crownlands-auth-rehearsal", "crownlands-game-rehearsal", "crownlands-worker-rehearsal"]]]
MARKER = "        (metadata / 'release.txt').write_text(str(Path('/srv/crownlands/current').resolve()) + '\\n')\n"


def updated_program(before):
    if before.count(MARKER) != 1 or "postgres_backup.py" in before:
        raise RuntimeError("The host backup program changed; inspect it before installation")
    after = before.replace(MARKER, MARKER + "        run(['/usr/bin/python3', '/usr/local/lib/crownlands-backup/postgres_backup.py', str(metadata / 'postgres')])\n")
    compile(after, "crownlands-backup.py", "exec")
    return after


def updated_sources(before):
    existing = {line.strip() for line in before.splitlines() if line.strip() and not line.startswith("#")}
    return before.rstrip() + "\n" + "".join(name + "\n" for name in EXTRA_SOURCES if name not in existing)


def command(args, **kwargs):
    result = subprocess.run(args, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError("Database backup installation check failed: " + Path(args[0]).name)
    return result


def verify_restore(module, stage):
    manifest = module.verify_archive(stage)
    prefix = ["runuser", "-u", "postgres", "--"]
    owner = module.query("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database();", prefix=prefix)
    # Restore as the existing unprivileged database owner, not a superuser.
    if owner != "project-server" or module.query("SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname='project-server';", prefix=prefix) != "f":
        raise RuntimeError("Expected restricted migration database owner")
    target = "crownlands_restore_check_" + uuid.uuid4().hex[:12]
    command([*prefix, "createdb", "-h", module.SOCKET, "--template=template0", "--owner=" + owner, target])
    module.query(f'REVOKE ALL ON DATABASE "{target}" FROM PUBLIC;', database=target, prefix=prefix)
    # Preserve a failed target for inspection. Only this invocation's fresh,
    # successfully verified disposable database is removed.
    try:
        with (stage / "database.dump").open("rb") as archive:
            command(["runuser", "-u", owner, "--", "pg_restore", *module.connection(target), "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl"], stdin=archive, timeout=900)
        actual = module.fingerprints(manifest["schemas"], database=target, prefix=["runuser", "-u", owner, "--"])
        if actual != manifest["tables"]:
            raise RuntimeError("Restored database rows differ from the shared snapshot")
    except Exception:
        (stage / "failed-restore-target.txt").write_text(target + "\n")
        (stage / "failed-restore-target.txt").chmod(0o600)
        raise
    command([*prefix, "dropdb", "-h", module.SOCKET, target])
    receipt = {"verifiedAt": time.time(), "tables": len(actual), "rows": sum(table["rows"] for table in actual),
               "archiveSha256": manifest["sha256"], "allRowsCompared": True, "disposableTargetRemoved": True}
    (stage / "restore-check.json").write_text(json.dumps(receipt, indent=2) + "\n")
    (stage / "restore-check.json").chmod(0o600)
    return receipt


def install(bundle):
    if os.geteuid() != 0:
        raise RuntimeError("Ubuntu administrator authentication is required to extend the protected backup service")
    os.umask(0o077)
    command(["sha256sum", "--check", "--quiet", str(bundle / "SHA256SUMS")])
    manifest = json.loads((bundle / "manifest.json").read_text())
    if HELPER.exists() or hashlib.sha256(PROGRAM.read_bytes()).hexdigest() != manifest["backupProgramBeforeSha256"]:
        raise RuntimeError("Existing backup installation changed; preserved")
    for source in EXTRA_SOURCES:
        if not Path(source).is_dir():
            raise RuntimeError("A required private runtime backup source is missing")
    spec = importlib.util.spec_from_file_location("postgres_backup", bundle / "postgres_backup.py")
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    schemas, _ = module.installed_schemas()
    if schemas != manifest["schemas"]:
        raise RuntimeError("Installed database targets changed since preparation")
    with open("/run/lock/crownlands-backup.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = PROGRAM.read_text(); sources_before = SOURCES.read_text()
        after = updated_program(before); sources_after = updated_sources(sources_before)
        print("Preparing a consistent account/game backup while private workers continue running.", flush=True)
        module.main(STAGE)
        print("Restoring the backup into a separate restricted test database and comparing every row.", flush=True)
        receipt = verify_restore(module, STAGE)
        print(f"Database restore passed: {receipt['tables']} tables; {receipt['rows']} rows matched.", flush=True)
        backup = Path("/var/backups/crownlands") / ("database-backup-install-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()))
        backup.mkdir(mode=0o700, parents=True)
        shutil.copy2(PROGRAM, backup / "crownlands-backup.py"); shutil.copy2(SOURCES, backup / "sources.txt")
        if PROGRAM.read_text() != before or SOURCES.read_text() != sources_before:
            raise RuntimeError("Host backup files changed during restore validation; preserved")
        try:
            shutil.copyfile(bundle / "postgres_backup.py", HELPER); HELPER.chmod(0o644)
            PROGRAM.write_text(after); PROGRAM.chmod(0o755)
            SOURCES.write_text(sources_after); SOURCES.chmod(0o600)
        except Exception:
            shutil.copy2(backup / "crownlands-backup.py", PROGRAM); shutil.copy2(backup / "sources.txt", SOURCES)
            raise
    # The existing unit, encryption, cloud destination, retention and failure
    # alert stay in charge. Starting it also tests its actual systemd sandbox.
    command(["systemctl", "start", "--no-block", "crownlands-backup.service"])
    print("Consistent database snapshots added to the existing encrypted backup. The first full local/off-site backup is running; verify its completion before claiming off-site coverage.")


if __name__ == "__main__":
    private_bundle = Path(__file__).resolve().parent
    os.chdir(private_bundle)
    try:
        install(private_bundle)
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Database backup installation stopped. Existing data and encrypted snapshots were preserved; private details were not logged.", file=sys.stderr)
        sys.exit(1)
