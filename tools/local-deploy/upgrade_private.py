#!/usr/bin/env python3
"""Operator-only private publisher upgrade; fixed destinations, preconditions, rollback.

Run from a reviewed private bundle containing upgrade.json and the five inputs.
This is never downloaded or executed by the automatic publisher.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

FILES = {
    'publisher.py': ('/usr/local/lib/crownlands-deploy/publisher.py', 0o644),
    'github_access.py': ('/usr/local/lib/crownlands-deploy/github_access.py', 0o644),
    'config.json': ('/etc/crownlands-deploy/config.json', 0o644),
    'github-app.pem': ('/etc/crownlands-deploy/github-app.pem', 0o600),
    'publish-signing-public.pem': ('/etc/crownlands-deploy/publish-signing-public.pem', 0o644),
}


def digest(path):
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError('Regular upgrade files required')
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def validate(bundle, destinations):
    plan = json.loads((bundle/'upgrade.json').read_bytes())
    if set(plan) != {'before', 'after'} or any(set(plan[k]) != set(FILES) for k in ('before', 'after')):
        raise ValueError('Exact reviewed publisher upgrade inventory required')
    for name in FILES:
        if digest(destinations[name]) != plan['before'][name] or digest(bundle/name) != plan['after'][name] or plan['after'][name] is None:
            raise ValueError('Publisher upgrade precondition changed: ' + name)
    old = json.loads(destinations['config.json'].read_bytes())
    new = json.loads((bundle/'config.json').read_bytes())
    if 'githubApp' in old or set(new) != set(old) | {'githubApp'} or any(new[k] != v for k, v in old.items()):
        raise ValueError('Upgrade may only add private GitHub access; preserve backend and authority policy')
    return plan


def write(path, data, mode):
    fd, temporary = tempfile.mkstemp(prefix='.private-publisher-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as file:
            os.fchmod(file.fileno(), mode)
            file.write(data); file.flush(); os.fsync(file.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def apply(bundle, destinations, backup, checker):
    validate(bundle, destinations)
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    originals = {}
    for name, path in destinations.items():
        originals[name] = (path.read_bytes(), path.stat().st_mode & 0o777) if path.exists() else None
        if originals[name]:
            write(backup/name, originals[name][0], 0o600)
    shutil.copyfile(bundle/'upgrade.json', backup/'upgrade.json')
    changed = []
    try:
        for name, path in destinations.items():
            changed.append(name)
            write(path, (bundle/name).read_bytes(), FILES[name][1])
        checker()
    except Exception:
        for name in reversed(changed):
            if originals[name]: write(destinations[name], *originals[name])
            else: destinations[name].unlink(missing_ok=True)
        raise


def main():
    if os.geteuid() != 0:
        raise ValueError('Ubuntu administrator authentication is required')
    bundle = Path(__file__).resolve().parent
    destinations = {name: Path(value[0]) for name, value in FILES.items()}
    validate(bundle, destinations)
    timer = subprocess.run(['systemctl', 'is-active', '--quiet', 'crownlands-deploy.timer']).returncode == 0
    subprocess.run(['systemctl', 'stop', 'crownlands-deploy.timer'], check=True)
    try:
        with Path('/var/lib/crownlands-deploy/lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if Path('/var/lib/crownlands-deploy/transaction.json').exists() or Path('/etc/crownlands-deploy/paused').exists():
                raise ValueError('Resolve pending publication/maintenance before upgrading')
            previous = Path('/srv/crownlands/current').resolve()
            backup = Path('/var/backups/crownlands')/('private-publisher-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
            def check():
                code = "import json,sys;from pathlib import Path;sys.path.insert(0,'/usr/local/lib/crownlands-deploy');import publisher;p=publisher.run(json.loads(Path('/etc/crownlands-deploy/config.json').read_text()),Path('/srv/crownlands'),Path('/var/lib/crownlands-deploy'),True);assert p['status'] in ('current','verified-ready','waiting-for-github-build');print(json.dumps(p))"
                result = subprocess.run(['/usr/bin/python3', '-B', '-c', code], capture_output=True, timeout=360,
                                        env={'PATH': '/usr/bin:/bin', 'HOME': '/root'})
                if result.returncode:
                    raise ValueError('Installed private publisher verification failed; previous installation restored')
                if Path('/srv/crownlands/current').resolve() != previous:
                    raise ValueError('Unexpected active release change during read-only upgrade check')
                print(result.stdout.decode().strip())
            apply(bundle, destinations, backup, check)
            print('Private publisher installed and verified. Backup: ' + str(backup))
    finally:
        if timer: subprocess.run(['systemctl', 'start', 'crownlands-deploy.timer'], check=True)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
