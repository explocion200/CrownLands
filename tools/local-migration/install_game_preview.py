#!/usr/bin/python3
"""Install the reviewed LAN-only game copy. Never change the live backend."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

ROLE = "crownlands-game-rehearsal"
UNIT = ROLE + ".service"
APP = Path("/usr/local/lib") / ROLE
CONF = Path("/etc") / ROLE
CADDY = Path("/etc/caddy/Caddyfile")


def run(args, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError("Installation check failed: " + Path(args[0]).name)
    return result.stdout.strip()


def sql(statement):
    return run(["runuser", "-u", "postgres", "--", "psql", "-X", "-h", "/var/run/postgresql", "-d", "crownlands_migration", "-At", "-v", "ON_ERROR_STOP=1"], statement)


def install(bundle):
    if os.geteuid() != 0:
        raise RuntimeError("Use the Ubuntu administrator prompt for this reviewed installation")
    if APP.exists() or CONF.exists() or Path("/etc/systemd/system", UNIT).exists():
        raise RuntimeError("Existing game preview preserved; inspect before retrying")
    run(["sha256sum", "--check", "--quiet", str(bundle / "SHA256SUMS")])
    manifest = json.loads((bundle / "manifest.json").read_text())
    schema, auth_schema = manifest["schema"], manifest["authSchema"]
    if not re.fullmatch(r"migration_game_preview_[a-f0-9]{12}", schema) or not re.fullmatch(r"migration_auth_preview_[a-f0-9]{12}", auth_schema) or manifest["role"] != ROLE:
        raise RuntimeError("Invalid private game target")
    if hashlib.sha256(CADDY.read_bytes()).hexdigest() != manifest["caddyBeforeHash"]:
        raise RuntimeError("Caddy changed since preparation; preserved without modification")
    if hashlib.sha256(Path("/etc/crownlands-auth-rehearsal/config.json").read_bytes()).hexdigest() != manifest["authConfigHash"]:
        raise RuntimeError("Private account configuration changed; review the new account target")
    run(["systemctl", "is-active", "crownlands-auth-rehearsal.service"])
    if sql(f"SELECT count(*) FROM pg_roles WHERE rolname='{ROLE}';") != "0":
        raise RuntimeError("Existing database role preserved")
    if sql(f"SELECT count(*) FROM {auth_schema}.accounts;") != "1" or sql(f"SELECT count(*) FROM {schema}.documents;") != str(manifest["documents"]):
        raise RuntimeError("Prepared data copy changed; inspect before installation")
    run(["caddy", "validate", "--config", str(bundle / "Caddyfile"), "--adapter", "caddyfile"])
    backup = Path("/var/backups/crownlands") / ("game-preview-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    shutil.copy2(CADDY, backup / "Caddyfile")
    run(["useradd", "--system", "--user-group", "--no-create-home", "--home-dir", "/nonexistent", "--shell", "/usr/sbin/nologin", ROLE])
    sql(f'''BEGIN;
      CREATE ROLE "{ROLE}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 16;
      GRANT CONNECT ON DATABASE crownlands_migration TO "{ROLE}";
      GRANT USAGE ON SCHEMA {schema},{auth_schema} TO "{ROLE}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.documents TO "{ROLE}";
      GRANT SELECT,INSERT ON {schema}.changes TO "{ROLE}";
      GRANT USAGE ON SEQUENCE {schema}.changes_id_seq TO "{ROLE}";
      GRANT SELECT ON {auth_schema}.accounts,{auth_schema}.auth_sessions TO "{ROLE}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON {auth_schema}.auth_limits TO "{ROLE}";
      COMMIT;''')
    APP.mkdir(mode=0o755)
    shutil.copytree(bundle / "app", APP / "app", symlinks=True)
    shutil.copy2(bundle / "node", APP / "node")
    os.chmod(APP / "node", 0o755)
    run(["chown", "-R", "root:root", str(APP)])
    CONF.mkdir(mode=0o700)
    for name in ["config.json", "secrets.json", "manifest.json"]:
        shutil.copyfile(bundle / name, CONF / name)
        os.chmod(CONF / name, 0o600)
    shutil.copyfile(bundle / UNIT, Path("/etc/systemd/system", UNIT))
    os.chmod(Path("/etc/systemd/system", UNIT), 0o644)
    run(["systemctl", "daemon-reload"])
    routed = False
    try:
        run(["systemctl", "start", UNIT])
        for attempt in range(40):
            result = subprocess.run(["curl", "--silent", "--fail", "--max-time", "2", "-H", "Host: playcrownlands.com", "-H", "X-Crownlands-Client-IP: 127.0.0.1", "http://127.0.0.1:9191/api/local-game/health"], capture_output=True)
            if result.returncode == 0:
                break
            time.sleep(0.3)
        else:
            raise RuntimeError("Private game health check failed")
        if hashlib.sha256(CADDY.read_bytes()).hexdigest() != manifest["caddyBeforeHash"]:
            raise RuntimeError("Caddy changed during installation; preserved")
        shutil.copyfile(bundle / "Caddyfile", CADDY)
        routed = True
        run(["systemctl", "reload", "caddy"])
        for endpoint in ["/api/local-game/health", "/local-auth/health", "/healthz"]:
            run(["curl", "--silent", "--fail", "--max-time", "10", "--resolve", "playcrownlands.com:443:192.168.1.145", "https://playcrownlands.com" + endpoint])
        run(["systemctl", "enable", UNIT])
    except Exception:
        if routed:
            shutil.copy2(backup / "Caddyfile", CADDY)
            subprocess.run(["systemctl", "reload", "caddy"], capture_output=True)
        subprocess.run(["systemctl", "stop", UNIT], capture_output=True)
        raise
    print("Private game preview installed and HTTPS health verified. Live Firebase game, monitoring and backups unchanged. Preview workers are disabled.")
    print("Configuration backup: " + str(backup))


if __name__ == "__main__":
    private_bundle = Path(__file__).resolve().parent
    os.chdir(private_bundle)
    try:
        install(private_bundle)
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Installation stopped; preserve the prepared files and inspect service status. Private details were not logged.", file=sys.stderr)
        sys.exit(1)
