#!/usr/bin/python3
"""Protected pre-activation maintenance. Never contacts Google or activates a game.

Install in standby first. `begin PLAN` is a separate, explicit maintenance action.
The periodic `check` attests actual local state; failure removes both receipts.
No automatic reopening is safe after a source-control request may have started.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import time

CONF = Path('/etc/crownlands-transfer')
STATE = Path('/var/lib/crownlands-transfer')
CONTROL = Path('/etc/crownlands-runtime/activation.json')
CADDY = Path('/etc/caddy/Caddyfile')
APP = Path('/usr/local/lib/crownlands-runtime/app')
PUBLISHER = Path('/var/lib/crownlands-deploy')
PAUSED = Path('/etc/crownlands-deploy/paused')
COMPONENTS = ['auth', 'game', 'worker', 'mail', 'push', 'payments']
MESSAGE = 'Crownlands is moving to its new server. Your progress is being preserved. Please try again shortly.'


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)+'\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def stamp():
    return datetime.now(timezone.utc).isoformat()


def age(value):
    return time.time()-datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def read_file(path, uid=0, maximum=4*1024*1024):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_mode & 0o022 or info.st_size > maximum:
            raise ValueError('Protected file ownership, permissions or size changed')
        data = handle.read(maximum+1)
        if len(data) > maximum:
            raise ValueError('Protected file exceeded its bound')
        return data


def read_json(path, **kwargs):
    return json.loads(read_file(path, **kwargs))


def atomic(path, data, mode=0o600):
    # Never follow an unexpected .next file; leave interrupted work for review.
    temporary = path.with_name(path.name+'.next')
    with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode), 'wb') as handle:
        # pkexec and the installer intentionally inherit umask 077. Explicit
        # public program/receipt modes must survive that private default.
        os.fchmod(handle.fileno(), mode)
        handle.write(data); handle.flush(); os.fsync(handle.fileno())
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def run(args, input=None, timeout=30):
    result = subprocess.run(args, input=input, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise ValueError('Protected transfer check failed: '+Path(args[0]).name)
    return result.stdout.strip()


def validate_plan(plan, epoch):
    if (plan.get('version') != 1 or plan.get('project') != 'crown-land-b15e0'
        or str(plan.get('projectNumber')) != '542378516435' or plan.get('epoch') != epoch
        or plan.get('mode') != 'prepared-only' or plan.get('sourceFrozen') is not False
        or plan.get('permissionsMissing') != [] or len(plan.get('functions', [])) != 150
        or len(plan.get('jobsBefore', [])) != 16 or len(plan.get('invocationPolicies', [])) != 150
        or len(plan.get('writerAccountsBefore', [])) != 3
        or plan.get('writerFreezeStrategy') != 'reviewed-service-identities-and-client-controls'):
        raise ValueError('Matching complete initial-transfer plan required')


def database_sql(epoch, *, empty=False, maintenance=False):
    if not re.fullmatch('[a-f0-9]{32}', epoch):
        raise ValueError('Invalid authority epoch')
    # The exclusive row lock waits for any existing assert_active shared locks.
    # Never clear receipts or activated_at: a prior activation cannot be undone.
    guard = f"""BEGIN; SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='5s';
    SELECT singleton FROM crownlands_control.deployment WHERE singleton=true FOR UPDATE;
    DO $check$ DECLARE d record; t record; occupied boolean; BEGIN
      SELECT * INTO STRICT d FROM crownlands_control.deployment WHERE singleton=true;
      IF d.epoch <> '{epoch}' OR d.phase NOT IN ('standby','maintenance') OR d.activated_at IS NOT NULL THEN
        RAISE EXCEPTION 'Initial authority required'; END IF;
    """
    if empty:
        guard += """IF d.snapshot_receipt IS NOT NULL OR d.firebase_fence_receipt IS NOT NULL THEN
          RAISE EXCEPTION 'Empty initial targets required'; END IF;
        IF (SELECT count(*) FROM pg_tables WHERE schemaname IN ('migration_game_live','migration_auth_live')) < 10 THEN
          RAISE EXCEPTION 'Permanent schemas incomplete'; END IF;
        FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('migration_game_live','migration_auth_live') LOOP
          EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I LIMIT 1)',t.schemaname,t.tablename) INTO occupied;
          IF occupied THEN RAISE EXCEPTION 'Existing permanent data preserved'; END IF;
        END LOOP;
        """
    guard += 'END $check$;\n'
    if maintenance:
        guard += "UPDATE crownlands_control.deployment SET phase='maintenance' WHERE singleton=true;\n"
    guard += 'SELECT row_to_json(d) FROM crownlands_control.deployment d WHERE singleton=true; COMMIT;'
    return guard


class Host:
    def __init__(self):
        self.config = read_json(CONF/'config.json')
        if self.config.get('version') != 1 or not re.fullmatch('[a-f0-9]{32}', self.config.get('epoch', '')):
            raise ValueError('Invalid installed transfer configuration')

    def control(self):
        return read_json(CONTROL, maximum=1024)

    def session(self):
        return read_json(STATE/'session.json') if (STATE/'session.json').exists() else None

    def save(self, value):
        atomic(STATE/'session.json', encode(value))

    def database(self, **kwargs):
        raw = run(['runuser','-u','postgres','--','psql','-X','-h','/var/run/postgresql','-d','crownlands_migration',
                   '-At','-v','ON_ERROR_STOP=1'], database_sql(self.config['epoch'], **kwargs))
        return json.loads(next(line for line in raw.splitlines() if line.startswith('{')))

    def publisher_state(self):
        return {name: run(['systemctl','show','crownlands-deploy.'+name,'--property=ActiveState','--value'])
                for name in ['timer','service']}

    def pause_publisher(self):
        if not PAUSED.exists():
            atomic(PAUSED, b'Local game transfer in progress. Keep paused until the local publisher is reviewed.\n', 0o644)
        read_file(PAUSED, maximum=4096)
        # Do not terminate an in-progress publication. The lock and inactive
        # service check below require it to finish before any authority change.
        run(['systemctl','disable','--now','crownlands-deploy.timer'])

    @contextmanager
    def publisher_lock(self):
        with os.fdopen(os.open(PUBLISHER/'lock', os.O_WRONLY | os.O_NOFOLLOW), 'wb') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if self.publisher_state() != {'timer':'inactive','service':'inactive'} or (PUBLISHER/'transaction.json').exists():
                raise ValueError('Wait for publication to finish or reconcile its transaction first')
            yield

    def verify_runtime(self):
        for name, checksum in self.config['runtime'].items():
            if digest(read_file(APP/name)) != checksum:
                raise ValueError('Installed transfer runtime changed')

    def enter(self, session):
        self.verify_runtime()
        if self.control() not in [{'version':1,'phase':phase,'epoch':self.config['epoch']} for phase in ['standby','maintenance']]:
            raise ValueError('Unexpected root authority preserved')
        before = digest(read_file(CADDY))
        if before not in [self.config['caddyBefore'], self.config['caddyMaintenance']]:
            raise ValueError('Existing proxy configuration changed')
        route = read_file(CONF/'Caddyfile.maintenance')
        if digest(route) != self.config['caddyMaintenance']:
            raise ValueError('Prepared maintenance route changed')
        run(['caddy','validate','--config',str(CONF/'Caddyfile.maintenance'),'--adapter','caddyfile'])
        self.database(empty=True, maintenance=True)
        # Persist intent before closing payment ingress. A crash leaves a
        # resumable maintenance operation; it never reopens either authority.
        session['enteredAt'] = stamp(); self.save(session)
        atomic(CONTROL, encode({'version':1,'phase':'maintenance','epoch':self.config['epoch']}), 0o644)
        if before != self.config['caddyMaintenance']:
            atomic(CADDY, route, 0o644)
        run(['systemctl','reload','caddy'])
        run(['systemctl','restart',*['crownlands-'+r+'.service' for r in COMPONENTS]], timeout=60)
        session['phase'] = 'maintenance'; self.save(session)
        run(['systemctl','enable','--now','crownlands-transfer-check.timer'])

    def check_proxy(self):
        if digest(read_file(CADDY)) != self.config['caddyMaintenance']:
            raise ValueError('Maintenance proxy changed')
        for endpoint in ['/play/','/local-auth/health','/api/local-game/health','/api/season-rankings']:
            response = run(['curl','--silent','--show-error','--max-time','3','--noproxy','*',
                '--resolve','playcrownlands.com:443:127.0.0.1','--include','https://playcrownlands.com'+endpoint])
            header, body = response.split('\r\n\r\n' if '\r\n\r\n' in response else '\n\n', 1)
            if (not re.match(r'HTTP/[\d.]+ 503\b', header) or body != MESSAGE
                or not re.search(r'(?im)^cache-control: no-store\s*$', header)
                or not re.search(r'(?im)^retry-after: 300\s*$', header)):
                raise ValueError('Actual HTTPS maintenance response is not verified')

    def services(self):
        for role in COMPONENTS:
            unit = 'crownlands-'+role
            value = read_json(Path('/var/lib')/unit/'status.json', uid=pwd.getpwnam(unit).pw_uid)
            if (run(['systemctl','is-active',unit+'.service']) != 'active'
                or value.get('phase') != 'maintenance' or not -5 <= age(value['recordedAt']) <= 30):
                raise ValueError('Permanent service maintenance is not verified')

    def ingress(self):
        unit = 'crownlands-payment-ingress'
        if run(['systemctl','is-active',unit+'.service']) != 'active':
            raise ValueError('Payment ingress is not running')
        return read_json(Path('/var/lib')/unit/'status.json', uid=pwd.getpwnam(unit).pw_uid, maximum=1000000)

    def receipts(self, maintenance, ingress):
        # Write the prerequisite first. The controller requires both files.
        atomic(STATE/'ingress-drained.json', encode(ingress), 0o644)
        atomic(STATE/'maintenance.json', encode(maintenance), 0o644)

    def invalidate(self):
        for name in ['maintenance.json','ingress-drained.json']:
            (STATE/name).unlink(missing_ok=True)


class Maintenance:
    def __init__(self, host):
        self.host = host

    def begin(self, plan):
        h = self.host
        validate_plan(plan, h.config['epoch'])
        plan_hash = digest(encode(plan))
        session = h.session()
        if not session:
            if not -5 <= age(plan['preparedAt']) <= 1800:
                raise ValueError('Refresh the source inventory before starting maintenance')
            if h.control() != {'version':1,'phase':'standby','epoch':h.config['epoch']}:
                raise ValueError('Initial standby authority required')
            h.database(empty=True)
            session = {'version':1,'phase':'preparing','epoch':h.config['epoch'],'planSha256':plan_hash,
                       'startedAt':stamp(), 'publisherBefore':h.publisher_state()}
            h.save(session)
        if (session.get('planSha256') != plan_hash or session.get('epoch') != h.config['epoch']
            or session.get('phase') not in ['preparing','maintenance']):
            raise ValueError('Preserve and reconcile the existing transfer attempt')
        h.invalidate()
        h.pause_publisher()
        with h.publisher_lock():
            if session['phase'] == 'preparing':
                h.enter(session)
            # No receipt until the real proxy, database, services and ingress
            # agree. A later timer check can complete a slow request drain.
            return self.check()

    def check(self):
        h = self.host
        try:
            session = h.session()
            if not session:
                h.invalidate()
                return {'phase':'standby','maintenanceVerified':False}
            if session.get('phase') != 'maintenance' or session.get('epoch') != h.config['epoch']:
                raise ValueError('Maintenance transition is incomplete')
            if h.control() != {'version':1,'phase':'maintenance','epoch':h.config['epoch']}:
                raise ValueError('Root authority changed')
            d = h.database()
            if d.get('phase') != 'maintenance' or d.get('epoch') != h.config['epoch'] or d.get('activated_at') is not None:
                raise ValueError('Database has been activated or left maintenance')
            if h.publisher_state() != {'timer':'inactive','service':'inactive'}:
                raise ValueError('Automatic publisher is not stopped')
            h.verify_runtime(); h.check_proxy(); h.services()
            ingress = h.ingress()
            if (ingress.get('ready') is not True or ingress.get('inFlight') != 0 or ingress.get('journalOverflow') is not False
                or not isinstance(ingress.get('pendingFailures'), list) or not -5 <= age(ingress['recordedAt']) <= 15
                or datetime.fromisoformat(ingress['recordedAt'].replace('Z','+00:00')) < datetime.fromisoformat(session['enteredAt'].replace('Z','+00:00'))):
                raise ValueError('Payment ingress has not verifiably drained')
            checked = stamp()
            common = {'version':1,'epoch':h.config['epoch'],'planSha256':session['planSha256'],'recordedAt':checked}
            h.receipts({**common,'localNeverActivated':True,'caddySha256':h.config['caddyMaintenance']},
                       {**common,'drained':True,'pendingDeliveries':len(ingress['pendingFailures'])})
            return {'phase':'maintenance','maintenanceVerified':True,'sourceFrozen':False}
        except Exception:
            h.invalidate()
            raise


def main():
    if os.geteuid() != 0:
        raise ValueError('Ubuntu administrator authentication required')
    with os.fdopen(os.open('/run/lock/crownlands-transfer.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600),'wb') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manager = Maintenance(Host())
        if len(sys.argv) == 2 and sys.argv[1] == 'check':
            result = manager.check()
        elif len(sys.argv) == 3 and sys.argv[1] == 'begin':
            # Read a bounded, regular operator-owned plan once, then retain its
            # digest in root-owned state. No path or program is taken from it.
            path = Path(sys.argv[2]).absolute()
            operator = int(os.environ.get('PKEXEC_UID', os.getuid()))
            result = manager.begin(read_json(path, uid=operator))
        else:
            raise ValueError('Use check or begin PLAN; this helper cannot activate or reopen a game')
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        if os.geteuid() == 0:
            for name in ['maintenance.json','ingress-drained.json']:
                try:
                    (STATE/name).unlink(missing_ok=True)
                except OSError:
                    pass
        raise SystemExit('Protected transfer check stopped. Preserve maintenance, pause and journals; inspect before proceeding. No source controls or game activation were attempted.') from None
