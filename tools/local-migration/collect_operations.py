#!/usr/bin/python3
"""Root-only collector; public health output contains no account or event data."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

ROLES = ['auth', 'game', 'worker', 'mail', 'push', 'payments']

def run(args, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True, timeout=10)
    if result.returncode:
        raise RuntimeError('check failed')
    return result.stdout.strip()

def active(unit):
    try:
        return run(['systemctl', 'is-active', unit]) == 'active'
    except Exception:
        return False

def fresh(value, field='recordedAt', seconds=60):
    from datetime import datetime
    try:
        age = time.time()-datetime.fromisoformat(value[field].replace('Z', '+00:00')).timestamp()
        return -5 <= age < seconds
    except Exception:
        return False

def state(role):
    value = json.loads((Path('/var/lib') / role / 'status.json').read_text())
    if not active(role+'.service') or not fresh(value, 'recordedAt' if 'recordedAt' in value else 'lastSuccessfulTick'):
        raise RuntimeError('stale service')
    return value

def loopback(port, endpoint):
    request = urllib.request.Request(f'http://127.0.0.1:{port}{endpoint}', headers={
        'Host': 'playcrownlands.com', 'X-Crownlands-Client-IP': '127.0.0.1'})
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.status == 200

def collect(config):
    control = json.loads(Path('/etc/crownlands-runtime/activation.json').read_text())
    phase = control.get('phase')
    if phase not in ['standby', 'active', 'maintenance']:
        raise RuntimeError('invalid authority')
    live = phase == 'active'
    prefix = lambda name: 'crownlands-'+name+('' if live else '-rehearsal')
    schema = 'migration_game_live' if live else config['previewGameSchema']
    if not re.fullmatch(r'migration_game_(?:live|preview_[a-f0-9]{12})', schema):
        raise RuntimeError('invalid database scope')
    result = {'recordedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'phase': phase, 'components': {}}
    def check(name, callback):
        try:
            details = callback()
            result['components'][name] = {'healthy': bool(details.pop('healthy', True)), **details}
        except Exception:
            result['components'][name] = {'healthy': False}
    def database():
        run(['pg_isready', '-h', '/var/run/postgresql', '-d', 'crownlands_migration'])
        disk = shutil.disk_usage('/var/lib/postgresql')
        return {'healthy': disk.free > max(5*1024**3, disk.total*.05), 'freeGiB': disk.free//1024**3}
    def workers():
        value = state(prefix('worker'))
        raw = run(['runuser','-u','postgres','--','psql','-X','-h','/var/run/postgresql','-d','crownlands_migration','-At','-v','ON_ERROR_STOP=1'],
            f"BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT json_build_object('dead',count(*) FILTER(WHERE status='dead'),'overdue',count(*) FILTER(WHERE status='pending' AND available_at<clock_timestamp()-interval '5 minutes'),'stalled',count(*) FILTER(WHERE status='running' AND lease_until<clock_timestamp()-interval '30 seconds')) FROM {schema}.work_jobs; COMMIT;")
        rows = [line for line in raw.splitlines() if line.startswith('{')]
        counts = json.loads(rows[0])
        lag_raw = run(['runuser','-u','postgres','--','psql','-X','-h','/var/run/postgresql','-d','crownlands_migration','-At','-v','ON_ERROR_STOP=1'],
            f"SELECT coalesce(max(floor(extract(epoch from clock_timestamp())/60)-last_minute),0)::int FROM {schema}.work_schedules;")
        lag = int(lag_raw)
        errors = value.get('handlerLogs',{}).get('counts',{}).get('error',0)
        failed_outcomes = sum(event.get('outcomes',{}).get('failed',0) for event in value.get('handlerLogs',{}).get('events',[]))
        return {'healthy': not errors and not failed_outcomes and fresh(value, 'lastSuccessfulTick') and not value.get('stopped') and not any(counts.values()) and lag < 3, **counts, 'scheduleLagMinutes': lag, 'handlerErrors': errors, 'failedOutcomes': failed_outcomes}
    def mail():
        value = state(prefix('mail'))
        return {'healthy': value.get('healthy') is True, 'pending': value.get('queue', {}).get('pending', 0), 'failed': value.get('queue', {}).get('failed', 0)}
    def notifications():
        value = state(prefix('push'))
        return {'healthy': value.get('healthy') is True}
    def payments():
        value = state('crownlands-payment-ingress')
        pending = value.get('pendingFailures')
        return {'healthy': value.get('ready') is True and isinstance(pending,list) and not pending and not value.get('journalOverflow'), 'failedDeliveries': value.get('failed', 0), 'pendingDeliveries': len(pending) if isinstance(pending,list) else -1}
    def services():
        prepared = all(state('crownlands-'+role).get('phase') == phase for role in ROLES)
        a, g = (9290, 9291) if live else (9190, 9191)
        return {'healthy': phase != 'maintenance' and prepared and loopback(a, '/local-auth/health') and loopback(g, '/api/local-game/health')}
    for name, callback in [('database',database),('workers',workers),('email',mail),('notifications',notifications),('payments',payments),('services',services)]:
        check(name, callback)
    return result

def main():
    target = Path('/var/lib/crownlands-operations/status.json')
    try:
        result = collect(json.loads(Path('/etc/crownlands-runtime/monitoring.json').read_text()))
    except Exception:
        result = {'recordedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'components': {}}
    temporary = target.with_suffix('.next')
    temporary.write_text(json.dumps(result)+'\n')
    temporary.chmod(0o644)
    os.replace(temporary, target)

if __name__ == '__main__':
    main()
