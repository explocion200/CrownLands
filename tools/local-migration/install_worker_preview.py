#!/usr/bin/python3
"""Install only the expiring copied-game worker; no routes or cloud delivery."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

ROLE = "crownlands-worker-rehearsal"
UNIT = ROLE + ".service"
APP = Path("/usr/local/lib") / ROLE
CONF = Path("/etc") / ROLE
STATE = Path("/var/lib") / ROLE


def run(args, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError("Private worker installation check failed: " + Path(args[0]).name)
    return result.stdout.strip()


def sql(statement):
    return run(["runuser", "-u", "postgres", "--", "psql", "-X", "-h", "/var/run/postgresql", "-d", "crownlands_migration", "-At", "-v", "ON_ERROR_STOP=1"], statement)


def grants(schema):
    if not re.fullmatch(r"migration_game_preview_[a-f0-9]{12}", schema):
        raise RuntimeError("Invalid private worker target")
    return f'''BEGIN;
      CREATE ROLE "{ROLE}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 16;
      GRANT CONNECT ON DATABASE crownlands_migration TO "{ROLE}";
      GRANT USAGE ON SCHEMA {schema} TO "{ROLE}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.documents TO "{ROLE}";
      GRANT SELECT,INSERT ON {schema}.changes TO "{ROLE}";
      GRANT UPDATE(dispatched_at) ON {schema}.changes TO "{ROLE}";
      GRANT SELECT,INSERT,UPDATE ON {schema}.work_jobs,{schema}.work_schedules TO "{ROLE}";
      GRANT USAGE ON SEQUENCE {schema}.changes_id_seq,{schema}.work_jobs_id_seq TO "{ROLE}";
      COMMIT;'''


def healthy(value, after):
    try:
        recent = datetime.fromisoformat(value["lastSuccessfulTick"].replace("Z", "+00:00")).timestamp()
        return value["rehearsal"] is True and value["stopped"] is False and recent > after and 0 <= time.time() - recent < 15 and value["operationalFailures"] == 0 and value["jobs"]["dead"] == 0 and value["handlerLogs"]["counts"]["error"] == 0
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def install(bundle):
    if os.geteuid() != 0:
        raise RuntimeError("Use Ubuntu administrator authentication for the prepared worker service")
    if any(p.exists() for p in [APP, CONF, STATE, Path("/etc/systemd/system", UNIT)]):
        raise RuntimeError("Existing worker files preserved; inspect before retrying")
    run(["sha256sum", "--check", "--quiet", str(bundle / "SHA256SUMS")])
    manifest = json.loads((bundle / "manifest.json").read_text())
    config = json.loads((bundle / "config.json").read_text())
    schema = manifest["schema"]
    statement = grants(schema)
    expires = datetime.fromisoformat(manifest["expiresAt"].replace("Z", "+00:00"))
    if config != {"schema": schema, "expiresAt": manifest["expiresAt"]} or manifest["role"] != ROLE or not 3600 < (expires - datetime.now(timezone.utc)).total_seconds() <= 7 * 86400:
        raise RuntimeError("Review expired or changed private worker configuration")
    for name, expected in [("config.json", manifest["gameConfigHash"]), ("secrets.json", manifest["gameSecretsHash"])]:
        if hashlib.sha256((Path("/etc/crownlands-game-rehearsal") / name).read_bytes()).hexdigest() != expected:
            raise RuntimeError("Installed game copy changed since worker preparation")
    run(["systemctl", "is-active", "crownlands-game-rehearsal.service"])
    if sql(f"SELECT count(*) FROM pg_roles WHERE rolname='{ROLE}';") != "0":
        raise RuntimeError("Existing worker database role preserved")
    if sql(f"SELECT count(*) FROM {schema}.work_jobs WHERE status IN ('running','dead');") != "0":
        raise RuntimeError("Inspect existing rehearsal jobs before installation")
    backup = Path("/var/backups/crownlands") / ("worker-preview-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()))
    backup.mkdir(parents=True, mode=0o700, exist_ok=False)
    with (backup / "before-workers.dump").open("xb") as output:
        os.chmod(output.name, 0o600)
        result = subprocess.run(["runuser", "-u", "postgres", "--", "pg_dump", "-h", "/var/run/postgresql", "-d", "crownlands_migration", "-Fc", "-n", schema], stdout=output, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError("Consistent private worker backup failed")
    run(["useradd", "--system", "--user-group", "--no-create-home", "--home-dir", "/nonexistent", "--shell", "/usr/sbin/nologin", ROLE])
    sql(statement)
    if sql(f"SELECT coalesce(bool_or(has_schema_privilege('{ROLE}',oid,'USAGE')),false) FROM pg_namespace WHERE nspname LIKE 'migration_%' AND nspname<>'{schema}';") != "f":
        raise RuntimeError("Private worker unexpectedly has access to another migration schema")
    APP.mkdir(mode=0o755)
    shutil.copytree(bundle / "app", APP / "app", symlinks=True)
    shutil.copy2(bundle / "node", APP / "node"); os.chmod(APP / "node", 0o755)
    run(["chown", "-R", "root:root", str(APP)])
    CONF.mkdir(mode=0o700)
    for name in ["config.json", "secrets.json", "manifest.json"]:
        shutil.copyfile(bundle / name, CONF / name); os.chmod(CONF / name, 0o600)
    unit_file = Path("/etc/systemd/system", UNIT)
    shutil.copyfile(bundle / UNIT, unit_file); os.chmod(unit_file, 0o644)
    run(["systemctl", "daemon-reload"])
    try:
        # Verify startup and restart with the actual restricted role and unit.
        for action in ["start", "restart"]:
            after = time.time(); run(["systemctl", action, UNIT])
            for _ in range(40):
                time.sleep(0.5)
                status = STATE / "status.json"
                if status.exists() and healthy(json.loads(status.read_text()), after):
                    break
            else:
                raise RuntimeError("Private worker did not pass its restricted startup/restart check")
        run(["systemctl", "enable", UNIT])
    except Exception:
        subprocess.run(["systemctl", "stop", UNIT], capture_output=True)
        raise
    print("Private copied-game workers started and restarted successfully. Public routes, live Firebase authority and uptime monitoring are unchanged.")
    print("Consistent pre-worker backup: " + str(backup))


if __name__ == "__main__":
    private_bundle = Path(__file__).resolve().parent
    os.chdir(private_bundle)
    try:
        install(private_bundle)
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Worker installation stopped; retained files and private copy were preserved. Private details were not logged.", file=sys.stderr)
        sys.exit(1)
