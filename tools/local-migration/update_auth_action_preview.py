#!/usr/bin/python3
"""Enable only one-use account actions in the existing private owner preview."""
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

APP = Path('/usr/local/lib/crownlands-auth-rehearsal/app')
CONF = Path('/etc/crownlands-auth-rehearsal')
BACKUPS = Path('/var/backups/crownlands')
UNIT = 'crownlands-auth-rehearsal.service'
ROLE = 'crownlands-auth-rehearsal'
FILES = ('auth-http.js', 'rehearsal-server.js')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Private account-action check failed: ' + Path(args[0]).name)
    return result.stdout.strip()


def sql(statement):
    return run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-h', '/var/run/postgresql', '-d',
                'crownlands_migration', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', statement])


def updated_config(before):
    config = json.loads(before)
    if not re.fullmatch(r'migration_auth_preview_[a-f0-9]{12}', config['schema']) or config['origin'] != 'https://playcrownlands.com':
        raise RuntimeError('Unexpected private account target')
    if config.get('allowEmailActionTest') or datetime.fromisoformat(config['expiresAt'].replace('Z', '+00:00')) <= datetime.now(timezone.utc):
        raise RuntimeError('Account-action preview is already enabled or expired')
    config['allowEmailActionTest'] = True
    return config


def prepare(original, bundle):
    repo = Path(__file__).resolve().parents[2]
    if not bundle.is_absolute() or bundle.exists() or run(['git', '-C', str(repo), 'status', '--porcelain']):
        raise RuntimeError('A clean validated commit and new private bundle are required')
    config = (original / 'config.json').read_bytes()
    updated_config(config)
    bundle.mkdir(mode=0o700)
    manifest = {'commit': run(['git', '-C', str(repo), 'rev-parse', 'HEAD']), 'configBefore': digest(config), 'files': {}}
    for filename in FILES:
        before = (APP / filename).read_bytes()
        if digest(before) != digest((original / 'app' / filename).read_bytes()):
            raise RuntimeError('Installed account runtime changed; preserved')
        after = (repo / 'local-backend' / filename).read_bytes()
        (bundle / filename).write_bytes(after)
        manifest['files'][filename] = {'before': digest(before), 'after': digest(after)}
    (bundle / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    shutil.copyfile(__file__, bundle / 'update.py')
    for file in bundle.iterdir():
        file.chmod(0o600)
    (bundle / 'SHA256SUMS').write_text(''.join(digest(file.read_bytes()) + '  ' + file.name + '\n' for file in sorted(bundle.iterdir())))
    (bundle / 'SHA256SUMS').chmod(0o600)
    print('Prepared private account-action preview; no email or account change has been performed.')


def install(bundle):
    if os.geteuid() != 0:
        raise RuntimeError('Ubuntu administrator authentication is required for the protected account service')
    os.umask(0o077)
    run(['sha256sum', '--check', '--quiet', str(bundle / 'SHA256SUMS')])
    manifest = json.loads((bundle / 'manifest.json').read_text())
    before = (CONF / 'config.json').read_bytes()
    if digest(before) != manifest['configBefore'] or (CONF / 'action-test.json').exists() or set(manifest['files']) != set(FILES):
        raise RuntimeError('Installed account configuration or repair state changed; preserved')
    config = updated_config(before)
    replacements = {}
    for filename in FILES:
        target = APP / filename
        if target.is_symlink() or target.stat().st_uid != 0 or digest(target.read_bytes()) != manifest['files'][filename]['before']:
            raise RuntimeError('Installed account source changed; preserved')
        replacements[filename] = (bundle / filename).read_bytes()
        if digest(replacements[filename]) != manifest['files'][filename]['after']:
            raise RuntimeError('Prepared account source checksum failed')
    schema = config['schema']
    if sql(f'SELECT count(*) FROM {schema}.accounts;') != '1':
        raise RuntimeError('Account actions require exactly one copied owner account')
    if sql(f"SELECT has_table_privilege('{ROLE}','{schema}.auth_actions','SELECT') OR has_table_privilege('{ROLE}','{schema}.auth_actions','DELETE');") != 'f':
        raise RuntimeError('Existing action privileges require review')
    run(['systemctl', 'is-active', UNIT])
    backup = BACKUPS / ('auth-action-preview-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    (backup / 'config.json').write_bytes(before)
    for filename in FILES:
        shutil.copy2(APP / filename, backup / filename)
    run(['systemctl', 'stop', UNIT])
    try:
        sql(f'GRANT SELECT,DELETE ON {schema}.auth_actions TO "{ROLE}";')
        for filename, data in replacements.items():
            (APP / filename).write_bytes(data); (APP / filename).chmod(0o644)
        (CONF / 'config.json').write_text(json.dumps(config) + '\n'); (CONF / 'config.json').chmod(0o600)
        run(['systemctl', 'start', UNIT])
        base = ['curl', '--silent', '--fail', '--max-time', '2', '-H', 'Host: playcrownlands.com', '-H', 'X-Crownlands-Client-IP: 127.0.0.1']
        for attempt in range(40):
            result = subprocess.run([*base, 'http://127.0.0.1:9190/local-auth/health'], capture_output=True)
            if result.returncode == 0:
                break
            time.sleep(0.3)
        else:
            raise RuntimeError('Private account service did not recover')
        page = run([*base, 'http://127.0.0.1:9190/local-auth/action'])
        if 'live Firebase password is unchanged' not in page:
            raise RuntimeError('Private account-action warning was not served')
        external = run(['curl', '--silent', '--max-time', '2', '-o', '/dev/null', '-w', '%{http_code}', '-H',
                        'Host: playcrownlands.com', '-H', 'X-Crownlands-Client-IP: 8.8.8.8', 'http://127.0.0.1:9190/local-auth/action'])
        if external != '404':
            raise RuntimeError('Private account-action network restriction failed')
        for endpoint in ['/local-auth/action', '/local-auth/health', '/api/local-game/health', '/healthz', '/backup-healthz']:
            run(['curl', '--silent', '--fail', '--max-time', '10', '--resolve', 'playcrownlands.com:443:192.168.1.145', 'https://playcrownlands.com' + endpoint])
    except Exception:
        for filename in FILES:
            shutil.copy2(backup / filename, APP / filename)
        (CONF / 'config.json').write_bytes(before)
        try:
            sql(f'REVOKE SELECT,DELETE ON {schema}.auth_actions FROM "{ROLE}";')
        finally:
            subprocess.run(['systemctl', 'restart', UNIT], capture_output=True)
        raise
    (CONF / 'action-test.json').write_text(json.dumps(manifest, indent=2) + '\n'); (CONF / 'action-test.json').chmod(0o600)
    print('Private one-use account actions enabled and HTTPS/network checks passed. No email was sent; live accounts and monitoring remain unchanged.')


if __name__ == '__main__':
    try:
        if len(sys.argv) == 4 and sys.argv[1] == 'prepare':
            prepare(Path(sys.argv[2]).resolve(), Path(sys.argv[3]))
        elif len(sys.argv) == 3 and sys.argv[1] == 'install':
            private_bundle = Path(sys.argv[2]).resolve(); os.chdir(private_bundle); install(private_bundle)
        else:
            raise RuntimeError('Use prepare ORIGINAL_BUNDLE NEW_BUNDLE or install BUNDLE')
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Private account-action preparation stopped; sensitive diagnostics suppressed.', file=sys.stderr)
        sys.exit(1)
