#!/usr/bin/python3
"""Install a bounded, expiring owner-only Web Push preview and private client."""
import fcntl
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

ROLE = 'crownlands-push-rehearsal'
UNIT = ROLE + '.service'
APP = Path('/usr/local/lib') / ROLE
CONF = Path('/etc') / ROLE
STATE = Path('/var/lib') / ROLE
UNIT_FILE = Path('/etc/systemd/system') / UNIT
CLIENT = Path('/usr/local/lib/crownlands-game-rehearsal/app/client')
SOURCES = Path('/etc/crownlands-backup/sources.txt')
CLIENT_FILES = ['firebaseClient.js', 'local-client.js', 'local-web-push.js', 'local-push-worker.js', 'local-preview.js']


def run(args, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Private notification installation check failed: ' + Path(args[0]).name)
    return result.stdout.strip()


def sql(statement):
    return run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-h', '/var/run/postgresql', '-d', 'crownlands_migration', '-qAt', '-v', 'ON_ERROR_STOP=1'], statement)


def grants(schema):
    if not re.fullmatch(r'migration_game_preview_[a-f0-9]{12}', schema):
        raise RuntimeError('Invalid private notification schema')
    # Same document adapter as the isolated workers; no account schema, DDL,
    # scheduler, cloud credential, translation credential or job-queue access.
    return f'''BEGIN;
      CREATE ROLE "{ROLE}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 3;
      GRANT CONNECT ON DATABASE crownlands_migration TO "{ROLE}";
      GRANT USAGE ON SCHEMA {schema} TO "{ROLE}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.documents TO "{ROLE}";
      GRANT INSERT ON {schema}.changes TO "{ROLE}";
      GRANT USAGE ON SEQUENCE {schema}.changes_id_seq TO "{ROLE}";
      COMMIT;'''


def validate(config, game, manifest, client):
    grants(config['schema'])
    if set(config) != {'schema', 'ownerUid', 'notBefore', 'expiresAt', 'attemptLimit', 'reservationId', 'publicKey'}:
        raise RuntimeError('Unexpected private notification scope')
    if any(config[key] != game[key] for key in ['schema', 'ownerUid', 'expiresAt']) or game.get('origin') != 'https://playcrownlands.com':
        raise RuntimeError('Private game changed; preserved')
    expires = datetime.fromisoformat(config['expiresAt'].replace('Z', '+00:00'))
    if not 3600 < (expires - datetime.now(timezone.utc)).total_seconds() <= 7 * 86400 or config['attemptLimit'] != 5:
        raise RuntimeError('Unexpired bounded private test required')
    if not isinstance(config['notBefore'], int) or not time.time()*1000-7*86400000 <= config['notBefore'] <= time.time()*1000:
        raise RuntimeError('Invalid private test activation boundary')
    if not re.fullmatch('[a-f0-9]{32}', config['reservationId']) or not re.fullmatch('[A-Za-z0-9_-]{87}', config['publicKey']):
        raise RuntimeError('Invalid private test identity')
    if manifest.get('role') != ROLE or not re.fullmatch('[a-f0-9]{40}', manifest.get('commit', '')) or set(manifest.get('clientBefore', {})) != set(CLIENT_FILES):
        raise RuntimeError('Reviewed notification commit required')
    for name, expected in manifest['clientBefore'].items():
        file = client / name
        if file.is_symlink() or (hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None) != expected:
            raise RuntimeError('Private client changed; preserved')


def healthy(value, after):
    try:
        recent = datetime.fromisoformat(value['lastSuccessfulTick'].replace('Z', '+00:00')).timestamp()
        return (value['rehearsal'] is True and value['healthy'] is True and value['stopped'] is False
                and recent > after and 0 <= time.time()-recent < 15 and value['attempts'] == 0 and value['operationalFailures'] == 0)
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def start_and_verify():
    for action in ['start', 'restart']:
        after = time.time(); run(['systemctl', action, UNIT])
        for _ in range(40):
            time.sleep(0.5)
            file = STATE / 'status.json'
            if file.exists() and healthy(json.loads(file.read_text()), after):
                break
        else:
            raise RuntimeError('Private notification startup/restart check failed')
    run(['systemctl', 'enable', UNIT])


def copy_runtime(bundle):
    APP.mkdir(mode=0o755); APP.chmod(0o755)
    shutil.copytree(bundle / 'app', APP / 'app', symlinks=True)
    for directory, dirs, files in os.walk(APP / 'app'):
        Path(directory).chmod(0o755)
        for name in files:
            file = Path(directory) / name
            if not file.is_symlink():
                file.chmod(0o644)
    shutil.copyfile(bundle / 'node', APP / 'node'); (APP / 'node').chmod(0o755)


def restore_client(backup, manifest):
    for name, original in manifest['clientBefore'].items():
        file = CLIENT / name
        if original is None:
            file.unlink(missing_ok=True)
        else:
            shutil.copy2(backup / name, file)


def install(bundle):
    if os.geteuid() != 0:
        raise RuntimeError('Ubuntu administrator authentication is required for the protected notification service')
    os.umask(0o077)
    if any(item.exists() for item in [APP, CONF, STATE, UNIT_FILE]):
        raise RuntimeError('Existing private notification files preserved')
    run(['sha256sum', '--check', '--quiet', str(bundle / 'SHA256SUMS')])
    config = json.loads((bundle / 'config.json').read_text()); manifest = json.loads((bundle / 'manifest.json').read_text())
    game_bytes = Path('/etc/crownlands-game-rehearsal/config.json').read_bytes()
    if json.loads(game_bytes) != json.loads((bundle / 'expected-game.json').read_text()):
        raise RuntimeError('Protected game configuration changed; preserved')
    validate(config, json.loads(game_bytes), manifest, CLIENT)
    if sql(f"SELECT count(*) FROM pg_roles WHERE rolname='{ROLE}';") != '0' or subprocess.run(['getent', 'passwd', ROLE], capture_output=True).returncode == 0:
        raise RuntimeError('Existing notification identity preserved')
    run(['systemctl', 'is-active', 'crownlands-game-rehearsal.service'])
    backup = Path('/var/backups/crownlands') / ('push-preview-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name, original in manifest['clientBefore'].items():
        if original is not None:
            shutil.copy2(CLIENT / name, backup / name)
    with open('/run/lock/crownlands-backup.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = SOURCES.read_text(); (backup / 'sources.txt').write_text(before)
        created_user = created_role = client_changed = False
        try:
            run(['useradd', '--system', '--user-group', '--no-create-home', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', ROLE]); created_user = True
            sql(grants(config['schema'])); created_role = True
            copy_runtime(bundle); CONF.mkdir(mode=0o700)
            for name in ['config.json', 'vapid.json', 'manifest.json']:
                shutil.copyfile(bundle / name, CONF / name); (CONF / name).chmod(0o600)
            shutil.copyfile(bundle / UNIT, UNIT_FILE); UNIT_FILE.chmod(0o644)
            run(['systemctl', 'daemon-reload']); start_and_verify()
            validate(config, json.loads(game_bytes), manifest, CLIENT)
            client_changed = True
            for name in CLIENT_FILES:
                shutil.copyfile(bundle / 'client' / name, CLIENT / name); (CLIENT / name).chmod(0o644)
            if SOURCES.read_text() != before:
                raise RuntimeError('Backup configuration changed during installation')
            temporary = SOURCES.with_suffix('.push-next')
            with temporary.open('x') as output:
                output.write(before.rstrip() + '\n' + ''.join(str(p) + '\n' for p in [APP, CONF, UNIT_FILE] if str(p) not in before.splitlines()))
            temporary.chmod(0o600); temporary.replace(SOURCES)
        except Exception:
            subprocess.run(['systemctl', 'disable', '--now', UNIT], capture_output=True)
            if client_changed:
                restore_client(backup, manifest)
            for item in [APP, CONF, STATE]:
                if item.exists():
                    shutil.rmtree(item)
            UNIT_FILE.unlink(missing_ok=True); subprocess.run(['systemctl', 'daemon-reload'], capture_output=True)
            if created_role:
                sql(f'DROP OWNED BY "{ROLE}"; DROP ROLE "{ROLE}";')
            if created_user:
                subprocess.run(['userdel', ROLE], capture_output=True)
            raise
    print('Private notification service installed; startup/restart passed. No test notification was sent.')
    print('Rollback files: ' + str(backup))


if __name__ == '__main__':
    bundle = Path(__file__).resolve().parent; os.chdir(bundle)
    try:
        install(bundle)
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Private notification installation stopped; sensitive details suppressed.', file=sys.stderr)
        sys.exit(1)
