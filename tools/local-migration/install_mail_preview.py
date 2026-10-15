#!/usr/bin/python3
"""Install an expiring, owner-allowlisted account-outbox service; no test email."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

ROLE = 'crownlands-mail-rehearsal'
UNIT = ROLE + '.service'
APP = Path('/usr/local/lib') / ROLE
CONF = Path('/etc') / ROLE
STATE = Path('/var/lib') / ROLE
UNIT_FILE = Path('/etc/systemd/system') / UNIT
SOURCES = Path('/etc/crownlands-backup/sources.txt')


def run(args, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Private mail installation check failed: ' + Path(args[0]).name)
    return result.stdout.strip()


def sql(statement):
    return run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-h', '/var/run/postgresql',
                '-d', 'crownlands_migration', '-qAt', '-v', 'ON_ERROR_STOP=1'], statement)


def grants(schema):
    if not re.fullmatch(r'migration_auth_preview_[a-f0-9]{12}', schema):
        raise RuntimeError('Invalid private mail schema')
    return f'''BEGIN;
      CREATE ROLE "{ROLE}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 3;
      GRANT CONNECT ON DATABASE crownlands_migration TO "{ROLE}";
      GRANT USAGE ON SCHEMA {schema} TO "{ROLE}";
      GRANT SELECT ON {schema}.auth_mail_accounts TO "{ROLE}";
      GRANT SELECT(uid,token_hash,purpose,expires_at) ON {schema}.auth_actions TO "{ROLE}";
      GRANT SELECT,UPDATE(status,action_url) ON {schema}.auth_mail TO "{ROLE}";
      GRANT SELECT,INSERT,UPDATE ON {schema}.auth_mail_delivery TO "{ROLE}";
      COMMIT;'''


def validate(config, expected, installed, manifest):
    if installed != expected or installed.get('allowEmailActionTest') is not True or installed.get('origin') != 'https://playcrownlands.com':
        raise RuntimeError('Protected account preview changed; preserved')
    if set(config) != {'schema', 'expiresAt', 'allowedRecipients'} or config['schema'] != installed['schema'] or config['expiresAt'] != installed['expiresAt']:
        raise RuntimeError('Mail and account preview configuration differ')
    grants(config['schema'])
    expires = datetime.fromisoformat(config['expiresAt'].replace('Z', '+00:00'))
    recipients = config['allowedRecipients']
    if not 3600 < (expires - datetime.now(timezone.utc)).total_seconds() <= 7 * 86400 or not isinstance(recipients, list) or len(recipients) != 1 or not isinstance(recipients[0], str):
        raise RuntimeError('Unexpired one-owner mail configuration required')
    if manifest.get('role') != ROLE or not re.fullmatch('[a-f0-9]{40}', manifest.get('commit', '')):
        raise RuntimeError('Reviewed mail commit required')


def healthy(value, after):
    try:
        recent = datetime.fromisoformat(value['lastSuccessfulTick'].replace('Z', '+00:00')).timestamp()
        return (value['rehearsal'] is True and value['healthy'] is True and value['stopped'] is False
                and recent > after and 0 <= time.time() - recent < 15 and value['queue']['pending'] == 0
                and value['queue']['failed'] == 0 and value['operationalFailures'] == 0)
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def start_and_verify():
    for action in ['start', 'restart']:
        after = time.time(); run(['systemctl', action, UNIT])
        for _ in range(40):
            time.sleep(0.5)
            status = STATE / 'status.json'
            if status.exists() and healthy(json.loads(status.read_text()), after):
                break
        else:
            raise RuntimeError('Private mail startup/restart did not pass')
    run(['systemctl', 'enable', UNIT])


def install(bundle):
    if os.geteuid() != 0:
        raise RuntimeError('Ubuntu administrator authentication is required for the protected mail service')
    os.umask(0o077)
    if any(item.exists() for item in [APP, CONF, STATE, UNIT_FILE]):
        raise RuntimeError('Existing private mail files preserved')
    run(['sha256sum', '--check', '--quiet', str(bundle / 'SHA256SUMS')])
    config = json.loads((bundle / 'config.json').read_text())
    installed = json.loads(Path('/etc/crownlands-auth-rehearsal/config.json').read_text())
    validate(config, json.loads((bundle / 'expected-auth.json').read_text()), installed,
             json.loads((bundle / 'manifest.json').read_text()))
    schema = config['schema']
    if sql(f"SELECT count(*) FROM pg_roles WHERE rolname='{ROLE}';") != '0' or subprocess.run(['getent', 'passwd', ROLE], capture_output=True).returncode == 0:
        raise RuntimeError('Existing private mail identity preserved')
    recipient_hex = config['allowedRecipients'][0].encode().hex()
    if sql(f"SELECT count(*)=1 AND bool_and(body->>'email'=convert_from(decode('{recipient_hex}','hex'),'UTF8')) FROM {schema}.accounts;") != 't':
        raise RuntimeError('The single copied owner changed')
    if sql(f"SELECT count(*) FROM {schema}.auth_mail WHERE status='pending';") != '0':
        raise RuntimeError('Pending account mail requires review before installation')
    run(['systemctl', 'is-active', 'crownlands-auth-rehearsal.service'])
    backup = Path('/var/backups/crownlands') / ('mail-preview-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    # Existing schema snapshots include mail tables/views. Add only the new
    # runtime, credential and unit paths to the existing encrypted host backup.
    with open('/run/lock/crownlands-backup.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = SOURCES.read_text()
        after = before.rstrip() + '\n' + ''.join(str(item) + '\n' for item in [APP, CONF, UNIT_FILE] if str(item) not in before.splitlines())
        (backup / 'sources.txt').write_text(before)
        created_user = created_role = False
        try:
            run(['useradd', '--system', '--user-group', '--no-create-home', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', ROLE]); created_user = True
            sql(grants(schema)); created_role = True
            APP.mkdir(mode=0o755)
            shutil.copytree(bundle / 'app', APP / 'app', symlinks=True)
            # Never copy umask-077 directory modes into the service runtime.
            for directory, dirs, files in os.walk(APP / 'app'):
                Path(directory).chmod(0o755)
                for filename in files:
                    file = Path(directory) / filename
                    if not file.is_symlink():
                        file.chmod(0o755 if os.access(file, os.X_OK) else 0o644)
            shutil.copyfile(bundle / 'node', APP / 'node'); (APP / 'node').chmod(0o755)
            CONF.mkdir(mode=0o700)
            for name in ['config.json', 'resend-api-key', 'manifest.json']:
                shutil.copyfile(bundle / name, CONF / name); (CONF / name).chmod(0o600)
            shutil.copyfile(bundle / UNIT, UNIT_FILE); UNIT_FILE.chmod(0o644)
            run(['systemctl', 'daemon-reload'])
            start_and_verify()
            if SOURCES.read_text() != before:
                raise RuntimeError('Backup sources changed during installation; preserved')
            SOURCES.write_text(after); SOURCES.chmod(0o600)
        except Exception:
            subprocess.run(['systemctl', 'disable', '--now', UNIT], capture_output=True)
            if UNIT_FILE.exists():
                UNIT_FILE.unlink()
            subprocess.run(['systemctl', 'daemon-reload'], capture_output=True)
            for item in [APP, CONF, STATE]:
                if item.exists():
                    shutil.rmtree(item)
            if created_role:
                sql(f'DROP OWNED BY "{ROLE}"; DROP ROLE "{ROLE}";')
            if created_user:
                run(['userdel', ROLE])
            if SOURCES.read_text() == after:
                SOURCES.write_text(before); SOURCES.chmod(0o600)
            raise
    print('Private account mail service passed startup and restart with an empty queue. No email was sent.')
    print('Existing encrypted backups include the new service; live Firebase and uptime monitoring remain unchanged.')


if __name__ == '__main__':
    private_bundle = Path(__file__).resolve().parent
    os.chdir(private_bundle)
    try:
        install(private_bundle)
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Private mail installation stopped; sensitive diagnostics suppressed.', file=sys.stderr)
        sys.exit(1)
