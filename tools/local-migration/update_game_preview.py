#!/usr/bin/python3
"""Prepare/apply a checked runtime repair to the existing private preview only."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

APP = Path('/usr/local/lib/crownlands-game-rehearsal/app')
CONF = Path('/etc/crownlands-game-rehearsal')
CADDY = Path('/etc/caddy/Caddyfile')
BACKUPS = Path('/var/backups/crownlands')
UNIT = 'crownlands-game-rehearsal.service'
FILES = ('local-backend/game-http.js', 'local-backend/game-rehearsal-server.js', 'client/local-client.js', 'client/crownlands-palette.css')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Preview repair check failed: ' + Path(args[0]).name)
    return result.stdout.strip()


def repair_caddy(source):
    start = source.index('\t\thandle /api/local-game/* {')
    end = source.index('\t\thandle /local-auth/* {', start)
    block = source[start:end]
    if block.count('max_size 2097152') == 1 and 'max_size 256KB' not in block:
        return source
    if block.count('max_size 256KB') != 1:
        raise RuntimeError('Existing preview body limit requires review')
    return source[:start] + block.replace('max_size 256KB', 'max_size 2097152') + source[end:]


def prepare(original, bundle, previous_repair=None):
    repo = Path(__file__).resolve().parents[2]
    if not bundle.is_absolute() or bundle.exists():
        raise RuntimeError('A new absolute private output path is required')
    if run(['git', '-C', str(repo), 'status', '--porcelain']):
        raise RuntimeError('Commit and validate the repair first')
    old = (original / 'manifest.json').read_bytes()
    prior = json.loads(old)
    repair_bytes = (previous_repair / 'manifest.json').read_bytes() if previous_repair else None
    previous = json.loads(repair_bytes) if repair_bytes else None
    before = CADDY.read_bytes()
    manifest = {'commit': run(['git', '-C', str(repo), 'rev-parse', 'HEAD']),
                'previousCommit': previous['commit'] if previous else prior['commit'], 'installedManifestHash': digest(old),
                'previousRepairHash': digest(repair_bytes) if repair_bytes else None,
                'caddyBeforeHash': digest(before), 'files': {}}
    bundle.mkdir(mode=0o700)
    for filename in FILES:
        current = (APP / filename).read_bytes()
        expected = previous['files'][filename]['after'] if previous and filename in previous['files'] else digest((original / 'app' / filename).read_bytes())
        if digest(current) != expected:
            raise RuntimeError('Installed runtime changed; preserved for review')
        data = (repo / filename.removeprefix('client/')).read_bytes()
        target = bundle / filename
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(0o600)
        manifest['files'][filename] = {'before': digest(current), 'after': digest(data)}
    caddy = repair_caddy(before.decode()).encode()
    (bundle / 'Caddyfile').write_bytes(caddy)
    manifest['caddyAfterHash'] = digest(caddy)
    (bundle / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    shutil.copyfile(__file__, bundle / 'update.py')
    print('Private preview repair prepared. Only the reviewed preview runtime, browser adapter, palette and private request limit can change.')


def install(bundle):
    if os.geteuid() != 0:
        raise RuntimeError('Ubuntu administrator authentication is required')
    manifest = json.loads((bundle / 'manifest.json').read_text())
    if set(manifest['files']) != set(FILES):
        raise RuntimeError('Unexpected runtime repair files')
    if digest((CONF / 'manifest.json').read_bytes()) != manifest['installedManifestHash']:
        raise RuntimeError('Installed preview identity changed')
    receipt = CONF / 'repair.json'
    if (digest(receipt.read_bytes()) if receipt.exists() else None) != manifest.get('previousRepairHash'):
        raise RuntimeError('Installed preview repair changed')
    before = CADDY.read_bytes()
    if digest(before) != manifest['caddyBeforeHash']:
        raise RuntimeError('Caddy changed; preserved for review')
    after = (bundle / 'Caddyfile').read_bytes()
    if digest(after) != manifest['caddyAfterHash'] or after != repair_caddy(before.decode()).encode():
        raise RuntimeError('Unexpected route change')
    replacements = {}
    for filename in FILES:
        target = APP / filename
        if target.is_symlink() or digest(target.read_bytes()) != manifest['files'][filename]['before']:
            raise RuntimeError('Installed runtime changed')
        replacements[filename] = (bundle / filename).read_bytes()
        if digest(replacements[filename]) != manifest['files'][filename]['after']:
            raise RuntimeError('Prepared runtime checksum failed')
    run(['caddy', 'validate', '--config', str(bundle / 'Caddyfile'), '--adapter', 'caddyfile'])
    run(['systemctl', 'is-active', UNIT])
    backup = BACKUPS / ('game-preview-repair-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    (backup / 'Caddyfile').write_bytes(before)
    for filename in FILES:
        saved = backup / filename
        saved.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        shutil.copy2(APP / filename, saved)
    run(['systemctl', 'stop', UNIT])
    try:
        for filename, data in replacements.items():
            (APP / filename).write_bytes(data)
        CADDY.write_bytes(after)
        run(['systemctl', 'start', UNIT])
        for attempt in range(40):
            check = subprocess.run(['curl', '--silent', '--fail', '--max-time', '2', '-H', 'Host: playcrownlands.com', '-H', 'X-Crownlands-Client-IP: 127.0.0.1', 'http://127.0.0.1:9191/api/local-game/health'], capture_output=True)
            if check.returncode == 0:
                break
            time.sleep(0.3)
        else:
            raise RuntimeError('Repaired preview health check failed')
        run(['systemctl', 'reload', 'caddy'])
        for endpoint in ['/api/local-game/health', '/local-auth/health', '/healthz']:
            run(['curl', '--silent', '--fail', '--max-time', '10', '--resolve', 'playcrownlands.com:443:192.168.1.145', 'https://playcrownlands.com' + endpoint])
    except Exception:
        for filename in FILES:
            shutil.copy2(backup / filename, APP / filename)
        CADDY.write_bytes(before)
        subprocess.run(['systemctl', 'restart', UNIT], capture_output=True)
        subprocess.run(['systemctl', 'reload', 'caddy'], capture_output=True)
        raise
    receipt.write_text(json.dumps(manifest, indent=2))
    receipt.chmod(0o600)
    print('Private preview repair installed and HTTPS health verified. Live Firebase routing is unchanged.')
    print('Rollback files: ' + str(backup))


if __name__ == '__main__':
    try:
        if len(sys.argv) in [4, 5] and sys.argv[1] == 'prepare':
            prepare(Path(sys.argv[2]).resolve(), Path(sys.argv[3]), Path(sys.argv[4]).resolve() if len(sys.argv) == 5 else None)
        elif len(sys.argv) == 3 and sys.argv[1] == 'install':
            install(Path(sys.argv[2]).resolve())
        else:
            raise RuntimeError('Use prepare ORIGINAL_BUNDLE NEW_BUNDLE [PREVIOUS_REPAIR] or install BUNDLE')
    except Exception as error:
        print('Private preview repair stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
