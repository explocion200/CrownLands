#!/usr/bin/python3
"""Prepare/revoke the expiring local owner view; never edit game documents."""
import argparse
import json
import os
from pathlib import Path
import pwd
import secrets
import subprocess
import time

ROLE = 'crownlands-world-reader'

def query(sql):
    result = subprocess.run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-d', 'crownlands_migration', '-At', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError('Private reader database setup failed; no private output printed')
    return result.stdout.strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--user', required=True)
    parser.add_argument('--email')
    parser.add_argument('--remove', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Administrator authentication required for the restricted read role')
    account = pwd.getpwnam(args.user)
    if account.pw_uid < 1000 or '"' in args.user:
        raise RuntimeError('A local desktop account is required')
    folder = Path(account.pw_dir) / '.local/share/crownlands-world-reader'
    file = folder / 'grant.json'
    if args.remove:
        # Do not terminate or alter game services. Stop the separate reader
        # before cleanup; any active reader connection causes DROP to fail.
        file.unlink(missing_ok=True)
        query(f'''REVOKE "{ROLE}" FROM "{args.user}";
            REVOKE ALL ON migration_game_live.documents FROM "{ROLE}";
            REVOKE ALL ON SCHEMA migration_game_live FROM "{ROLE}";
            DROP ROLE "{ROLE}";''')
        print('Private owner grant and read role removed.')
        return
    if file.exists() or not args.email or len(args.email) > 254:
        raise RuntimeError('Remove the previous grant first; owner email is required')
    control = json.loads(Path('/etc/crownlands-runtime/activation.json').read_text())
    if control.get('phase') != 'active':
        raise RuntimeError('Current local game must be active')
    email = args.email.lower().replace("'", "''")
    uid = query(f"SELECT uid FROM migration_auth_live.accounts WHERE lower(body->>'email')='{email}' AND COALESCE(body->>'disabled','false')='false' AND body->>'emailVerified'='true';")
    if not uid or '\n' in uid or '/' in uid:
        raise RuntimeError('Exactly one verified owner account is required')
    # NOLOGIN and noninheriting membership: the preview must explicitly select
    # the role. Even after READ ONLY is disabled, this role has no game writes.
    query(f'''BEGIN;
        CREATE ROLE "{ROLE}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        GRANT USAGE ON SCHEMA migration_game_live TO "{ROLE}";
        GRANT SELECT ON migration_game_live.documents TO "{ROLE}";
        GRANT "{ROLE}" TO "{args.user}" WITH INHERIT FALSE;
        COMMIT;''')
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(folder, 0o700)
    os.chown(folder, account.pw_uid, account.pw_gid)
    grant = {'version': 1, 'uid': uid, 'key': secrets.token_urlsafe(32), 'expiresAt': int(time.time()*1000)+7200000}
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(grant, output)
    os.chown(file, account.pw_uid, account.pw_gid)
    print('Restricted read role prepared. Owner grant expires in two hours; no account or game records changed.')

if __name__ == '__main__':
    main()
