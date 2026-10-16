#!/usr/bin/python3
"""Install a prepared, owner-only sign-in rehearsal; never switch the game backend."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

ROLE = "crownlands-auth-rehearsal"
UNIT = ROLE + ".service"
APP = Path("/usr/local/lib") / ROLE
CONF = Path("/etc") / ROLE
CADDY = Path("/etc/caddy/Caddyfile")


def run(args, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True)
    if result.returncode:
        # Database diagnostics and service configuration can contain private values.
        raise RuntimeError("Installation check failed: " + Path(args[0]).name)
    return result.stdout.strip()


def sql(statement):
    return run(["runuser", "-u", "postgres", "--", "psql", "-X", "-h", "/var/run/postgresql", "-d", "crownlands_migration", "-At", "-v", "ON_ERROR_STOP=1"], statement)


def install(bundle):
    if os.geteuid() != 0:
        raise RuntimeError("Run the reviewed installer through the Ubuntu administrator prompt")
    if APP.exists() or CONF.exists() or Path("/etc/systemd/system", UNIT).exists():
        raise RuntimeError("An existing rehearsal installation was preserved; inspect it before retrying")
    run(["sha256sum", "--check", "--quiet", str(bundle / "SHA256SUMS")])
    manifest = json.loads((bundle / "manifest.json").read_text())
    schema = manifest["schema"]
    if not re.fullmatch(r"migration_auth_preview_[a-f0-9]{12}", schema) or manifest["role"] != ROLE:
        raise RuntimeError("Invalid isolated schema or service role")
    if hashlib.sha256(CADDY.read_bytes()).hexdigest() != manifest["caddyBeforeHash"]:
        raise RuntimeError("Caddy changed since preparation; configuration was preserved")
    if sql("SELECT count(*) FROM pg_roles WHERE rolname='" + ROLE + "';") != "0":
        raise RuntimeError("Existing database role was preserved")
    if sql(f"SELECT count(*) FROM {schema}.accounts;") != "1":
        raise RuntimeError("The rehearsal must contain exactly one copied owner account")
    run(["caddy", "validate", "--config", str(bundle / "Caddyfile"), "--adapter", "caddyfile"])
    backup = Path("/var/backups/crownlands") / ("auth-preview-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    shutil.copy2(CADDY, backup / "Caddyfile")
    # This fixed service account cannot sign in interactively or own database objects.
    run(["useradd", "--system", "--user-group", "--no-create-home", "--home-dir", "/nonexistent", "--shell", "/usr/sbin/nologin", ROLE])
    sql(f'''BEGIN;
      CREATE ROLE "{ROLE}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 8;
      GRANT CONNECT ON DATABASE crownlands_migration TO "{ROLE}";
      GRANT USAGE ON SCHEMA {schema} TO "{ROLE}";
      GRANT SELECT,UPDATE ON {schema}.accounts TO "{ROLE}";
      GRANT SELECT ON {schema}.rehearsal_identity TO "{ROLE}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.auth_sessions,{schema}.auth_limits,{schema}.auth_oauth TO "{ROLE}";
      COMMIT;''')
    APP.mkdir(mode=0o755)
    shutil.copytree(bundle / "app", APP / "app", symlinks=True)
    shutil.copy2(bundle / "node", APP / "node")
    os.chmod(APP / "node", 0o755)
    run(["chown", "-R", "root:root", str(APP)])
    CONF.mkdir(mode=0o700)
    shutil.copyfile(bundle / "config.json", CONF / "config.json")
    os.chmod(CONF / "config.json", 0o600)
    shutil.copyfile(bundle / "manifest.json", CONF / "manifest.json")
    os.chmod(CONF / "manifest.json", 0o600)
    shutil.copyfile(bundle / UNIT, Path("/etc/systemd/system", UNIT))
    os.chmod(Path("/etc/systemd/system", UNIT), 0o644)
    run(["systemctl", "daemon-reload"])
    route_installed = False
    try:
        run(["systemctl", "start", UNIT])
        # No private tokens or bodies are printed. Allow Node's startup hash to finish.
        for attempt in range(30):
            response = subprocess.run(["curl", "--silent", "--fail", "--max-time", "2", "-H", "Host: playcrownlands.com", "-H", "X-Crownlands-Client-IP: 127.0.0.1", "http://127.0.0.1:9190/local-auth/health"], capture_output=True)
            if response.returncode == 0:
                break
            time.sleep(0.3)
        else:
            raise RuntimeError("Private sign-in health check did not pass")
        # Recheck immediately before replacing the active file.
        if hashlib.sha256(CADDY.read_bytes()).hexdigest() != manifest["caddyBeforeHash"]:
            raise RuntimeError("Caddy changed during installation; the live configuration was preserved")
        shutil.copyfile(bundle / "Caddyfile", CADDY)
        route_installed = True
        run(["systemctl", "reload", "caddy"])
        run(["curl", "--silent", "--fail", "--max-time", "10", "--resolve", "playcrownlands.com:443:192.168.1.145", "https://playcrownlands.com/local-auth/health"])
        run(["curl", "--silent", "--fail", "--max-time", "10", "https://playcrownlands.com/healthz"])
        run(["systemctl", "enable", UNIT])
    except Exception:
        if route_installed:
            shutil.copy2(backup / "Caddyfile", CADDY)
            subprocess.run(["systemctl", "reload", "caddy"], capture_output=True)
        subprocess.run(["systemctl", "stop", UNIT], capture_output=True)
        raise
    print("Private account rehearsal installed and HTTPS health verified. Live game, Firebase and uptime monitoring were preserved.")
    print("Configuration backup: " + str(backup))


if __name__ == "__main__":
    bundle = Path(__file__).resolve().parent
    os.chdir(bundle)
    try:
        install(bundle)
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Installation stopped; private details were not printed. Preserve the bundle and inspect the service state.", file=sys.stderr)
        sys.exit(1)
