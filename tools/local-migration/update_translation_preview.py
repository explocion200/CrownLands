#!/usr/bin/python3
"""Prepare a bounded translation update; installing requires an approved receipt."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

APP = Path('/usr/local/lib/crownlands-game-rehearsal/app')
CONF = Path('/etc/crownlands-game-rehearsal')
UNIT = Path('/etc/systemd/system/crownlands-game-rehearsal.service')
CADDY = Path('/etc/caddy/Caddyfile')
BACKUPS = Path('/var/backups/crownlands')
SERVICE = UNIT.name
FILES = ('functions/index.js', 'local-backend/platform.js', 'local-backend/game-rehearsal-server.js', 'local-backend/chat-translation-rehearsal.js')
CREDENTIAL = 'LoadCredential=translation:/etc/crownlands-game-rehearsal/translation.json\n'
PROJECT = 'crown-land-b15e0'
ACCOUNT = 'crownlands-local-translation@' + PROJECT + '.iam.gserviceaccount.com'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Private translation check failed: ' + Path(args[0]).name)
    return result.stdout.strip()


def write_private(path, data):
    with path.open('xb') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(data)


def prepare(original, previous, bundle):
    repo = Path(__file__).resolve().parents[2]
    if not bundle.is_absolute() or bundle.exists() or run(['git', '-C', str(repo), 'status', '--porcelain']):
        raise RuntimeError('A new private output directory and clean validated commit are required')
    game_bytes = (original / 'config.json').read_bytes()
    game = json.loads(game_bytes)
    if (original / 'config.json').stat().st_mode & 0o077 or game.get('allowTranslationTest') is not None:
        raise RuntimeError('Original private game configuration required')
    expiry = datetime.fromisoformat(game['expiresAt'].replace('Z', '+00:00'))
    current = datetime.now(timezone.utc)
    if expiry.timestamp() < current.timestamp() + 3600 or expiry.strftime('%Y-%m') != current.strftime('%Y-%m'):
        raise RuntimeError('Existing preview expiry must leave one hour within this UTC month')
    scope = {'version': 1, 'projectId': PROJECT, 'clientEmail': ACCOUNT, 'schema': game['schema'], 'ownerUid': game['ownerUid'],
             'reservationId': secrets.token_hex(16), 'month': current.strftime('%Y-%m'), 'characterLimit': 1000, 'expiresAt': game['expiresAt']}
    old_repair = json.loads((previous / 'manifest.json').read_bytes())
    manifest = {'commit': run(['git', '-C', str(repo), 'rev-parse', 'HEAD']), 'scope': scope, 'configBeforeHash': digest(game_bytes),
                'unitBeforeHash': digest(UNIT.read_bytes()), 'caddyHash': digest(CADDY.read_bytes()), 'files': {}}
    bundle.mkdir(mode=0o700)
    for name in FILES:
        installed = APP / name
        before = installed.read_bytes() if installed.exists() else None
        expected = old_repair['files'][name]['after'] if name in old_repair['files'] else digest((original / 'app' / name).read_bytes()) if (original / 'app' / name).exists() else None
        if installed.is_symlink() or (digest(before) if before is not None else None) != expected:
            raise RuntimeError('Installed runtime changed; preserve it for review')
        after = (repo / name).read_bytes()
        target = bundle / name
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        write_private(target, after)
        manifest['files'][name] = {'before': expected, 'after': digest(after)}
    if 'LoadCredential=translation:' in UNIT.read_text():
        raise RuntimeError('Translation is already configured; review its existing allowance')
    for name, data in [('scope.json', scope), ('manifest.json', manifest)]:
        write_private(bundle / name, (json.dumps(data, indent=2) + '\n').encode())
    shutil.copyfile(__file__, bundle / 'update.py')
    (bundle / 'update.py').chmod(0o600)
    print('Translation update prepared: 1,000 characters from the existing shared limit; unchanged preview expiry, owner and public routing. No cloud access or live writes performed.')


def check(bundle):
    if os.geteuid() != 0:
        raise RuntimeError('Ubuntu administrator authentication required')
    manifest = json.loads((bundle / 'manifest.json').read_bytes())
    if set(manifest['files']) != set(FILES) or (CONF / 'translation.json').exists() or (CONF / 'translation-repair.json').exists():
        raise RuntimeError('Unexpected or already installed translation update')
    before = (CONF / 'config.json').read_bytes()
    unit = UNIT.read_bytes()
    if digest(before) != manifest['configBeforeHash'] or digest(unit) != manifest['unitBeforeHash'] or digest(CADDY.read_bytes()) != manifest['caddyHash']:
        raise RuntimeError('Installed configuration changed; preserved for review')
    game = json.loads(before)
    scope = json.loads((bundle / 'scope.json').read_bytes())
    if scope != manifest['scope'] or scope['schema'] != game['schema'] or scope['ownerUid'] != game['ownerUid'] or scope['expiresAt'] != game['expiresAt']:
        raise RuntimeError('Translation preview identity changed')
    credential_file = bundle / 'translation.json'
    if credential_file.is_symlink() or credential_file.stat().st_mode & 0o077 or credential_file.stat().st_size > 16384:
        raise RuntimeError('Private translation credential required')
    translation_bytes = credential_file.read_bytes()
    translation = json.loads(translation_bytes)
    if set(translation) != {'scope', 'serviceAccount'} or translation['scope'] != scope:
        raise RuntimeError('Translation credential scope changed')
    key = translation['serviceAccount']
    if key.get('type') != 'service_account' or key.get('project_id') != PROJECT or key.get('client_email') != ACCOUNT:
        raise RuntimeError('Dedicated translation identity required')
    receipt = json.loads((bundle / 'source-reservation.json').read_bytes())
    if any(receipt.get(name) != value for name, value in scope.items()):
        raise RuntimeError('Approved project allowance receipt required')
    if 'LoadCredential=translation:' in unit.decode() or unit.count(b'LoadCredential=secrets:') != 1:
        raise RuntimeError('Unexpected service credential configuration')
    after_unit = unit.replace(b'[Service]\n', ('[Service]\n' + CREDENTIAL).encode())
    if after_unit == unit:
        raise RuntimeError('Service unit requires review')
    replacements = {}
    for name in FILES:
        target = APP / name
        content = target.read_bytes() if target.exists() else None
        if target.is_symlink() or (digest(content) if content is not None else None) != manifest['files'][name]['before']:
            raise RuntimeError('Installed runtime changed')
        replacements[name] = (bundle / name).read_bytes()
        if digest(replacements[name]) != manifest['files'][name]['after']:
            raise RuntimeError('Prepared runtime checksum failed')
    game['allowTranslationTest'] = True
    return manifest, before, unit, after_unit, (json.dumps(game) + '\n').encode(), translation_bytes, replacements


def healthy():
    for attempt in range(40):
        check = subprocess.run(['curl', '--silent', '--fail', '--max-time', '2', '-H', 'Host: playcrownlands.com',
            '-H', 'X-Crownlands-Client-IP: 127.0.0.1', 'http://127.0.0.1:9191/api/local-game/health'], capture_output=True)
        if check.returncode == 0:
            return
        time.sleep(0.25)
    raise RuntimeError('Private translation startup failed')


def install(bundle):
    manifest, config_before, unit_before, unit_after, config_after, translation, replacements = check(bundle)
    run(['systemctl', 'is-active', SERVICE])
    backup = BACKUPS / ('translation-preview-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    write_private(backup / 'config.json', config_before)
    write_private(backup / SERVICE, unit_before)
    for name in FILES:
        if (APP / name).exists():
            target = backup / name
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            shutil.copy2(APP / name, target)
    run(['systemctl', 'stop', SERVICE])
    try:
        for name, content in replacements.items():
            (APP / name).write_bytes(content)
            (APP / name).chmod(0o644)
        (CONF / 'config.json').write_bytes(config_after)
        write_private(CONF / 'translation.json', translation)
        UNIT.write_bytes(unit_after)
        run(['systemctl', 'daemon-reload'])
        run(['systemctl', 'start', SERVICE])
        healthy()
        run(['systemctl', 'restart', SERVICE])
        healthy()
        for endpoint in ['/api/local-game/health', '/local-auth/health', '/healthz']:
            run(['curl', '--silent', '--fail', '--max-time', '10', '--resolve', 'playcrownlands.com:443:192.168.1.145', 'https://playcrownlands.com' + endpoint])
        if digest(CADDY.read_bytes()) != manifest['caddyHash']:
            raise RuntimeError('Routing changed during verification')
        write_private(CONF / 'translation-repair.json', (json.dumps(manifest, indent=2) + '\n').encode())
    except Exception:
        subprocess.run(['systemctl', 'stop', SERVICE], capture_output=True)
        for name in FILES:
            if (backup / name).exists():
                shutil.copy2(backup / name, APP / name)
            else:
                (APP / name).unlink(missing_ok=True)
        (CONF / 'config.json').write_bytes(config_before)
        (CONF / 'translation.json').unlink(missing_ok=True)
        (CONF / 'translation-repair.json').unlink(missing_ok=True)
        UNIT.write_bytes(unit_before)
        subprocess.run(['systemctl', 'daemon-reload'], capture_output=True)
        subprocess.run(['systemctl', 'start', SERVICE], capture_output=True)
        raise
    print('Private translation installed; startup/restart and HTTPS health passed. Public routing unchanged. Source allowance is retained even if later rolled back.')
    print('Rollback files: ' + str(backup))


if __name__ == '__main__':
    try:
        if len(sys.argv) == 5 and sys.argv[1] == 'prepare':
            prepare(Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve(), Path(sys.argv[4]))
        elif len(sys.argv) == 3 and sys.argv[1] == 'install':
            install(Path(sys.argv[2]).resolve())
        else:
            raise RuntimeError('Use prepare ORIGINAL_GAME_BUNDLE PREVIOUS_REPAIR NEW_BUNDLE or install BUNDLE')
    except Exception:
        print('Private translation update stopped; preserve the bundle and rollback files. Credentials and account details were not logged.', file=sys.stderr)
        sys.exit(1)
