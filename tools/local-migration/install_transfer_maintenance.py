#!/usr/bin/python3
"""Install reviewed transfer tooling and protocol updates in standby only.

This installation does not enter maintenance, change Firebase or publish a game.
An explicit later begin command is needed after the entire transfer is ready.
"""
import json
import fcntl
import os
from pathlib import Path
import re
import shutil
import sys
import time
import transfer_maintenance as transfer

CONF = transfer.CONF
STATE = transfer.STATE
APP = transfer.APP
PROGRAM = Path('/usr/local/lib/crownlands-transfer')
UNITS = Path('/etc/systemd/system')
BACKUPS = Path('/var/backups/crownlands')
SOURCES = Path('/etc/crownlands-backup/sources.txt')
BACKUP_LOCK = Path('/run/lock/crownlands-backup.lock')
FILES = ['local-backend/auth-http.js','local-backend/game-http.js',
         'local-backend/permanent-services.js','local-backend/deployment-policy.js']
SERVICE = '''[Unit]
Description=Verify Crownlands pre-activation maintenance and payment drain
After=postgresql.service caddy.service crownlands-payment-ingress.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/lib/crownlands-transfer/transfer_maintenance.py check
TimeoutStartSec=45
UMask=0077
Environment=PYTHONDONTWRITEBYTECODE=1
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectKernelLogs=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ReadWritePaths=/var/lib/crownlands-transfer /run/lock
'''
TIMER = '''[Unit]
Description=Refresh verified Crownlands maintenance receipts

[Timer]
OnBootSec=20s
OnUnitInactiveSec=15s
AccuracySec=1s
Unit=crownlands-transfer-check.service

[Install]
WantedBy=timers.target
'''


def prepare(candidate, bundle):
    repo = Path(__file__).resolve().parents[2]
    if bundle.exists() or not bundle.is_absolute():
        raise ValueError('Use a new private absolute bundle directory')
    if transfer.run(['git','-C',str(repo),'status','--porcelain']):
        raise ValueError('Commit and validate the complete transfer preparation first')
    revision = transfer.run(['git','-C',str(repo),'rev-parse','HEAD'])
    # The protocol candidate is independently built and validated. Only its
    # four reviewed server updates are installed here; its client stays private.
    manifest = json.loads((candidate/'runtime-update-manifest.json').read_text())
    if (manifest.get('version') != 1 or manifest.get('phase') != 'standby'
        or set(manifest.get('files',{})) != set(FILES)
        or manifest.get('requiresReviewedRootInstallation') is not True):
        raise ValueError('Reviewed standby runtime candidate required')
    control = json.loads(transfer.CONTROL.read_text())
    if control.get('phase') != 'standby' or not re.fullmatch('[a-f0-9]{32}',control.get('epoch','')):
        raise ValueError('Installed services must remain in initial standby')
    before = transfer.CADDY.read_bytes()
    route_script = "process.stdout.write(JSON.stringify(require('./tools/local-migration/prepare_cutover_routes').prepare(require('node:fs').readFileSync('/etc/caddy/Caddyfile','utf8'))));"
    import subprocess
    routes = subprocess.run(['node','-e',route_script],cwd=repo,capture_output=True,text=True,check=True)
    maintenance = json.loads(routes.stdout)['maintenance'].encode()
    payload = {'transfer_maintenance.py':Path(__file__).with_name('transfer_maintenance.py').read_bytes(),
               'install_transfer_maintenance.py':Path(__file__).read_bytes(),
               'Caddyfile.before':before,'Caddyfile.maintenance':maintenance,
               'crownlands-transfer-check.service':SERVICE.encode(),
               'crownlands-transfer-check.timer':TIMER.encode()}
    for filename in FILES:
        source = (candidate/'runtime'/filename).read_bytes()
        if (transfer.digest(source) != manifest['files'][filename]['after']
            or source != (repo/filename).read_bytes()
            or transfer.digest((APP/filename).read_bytes()) != manifest['files'][filename]['before']):
            raise ValueError('Reviewed candidate or installed runtime changed')
        payload['runtime/'+filename] = source
    config = {'version':1,'epoch':control['epoch'],'commit':revision,'candidateCommit':manifest['commit'],
              'caddyBefore':transfer.digest(before),'caddyMaintenance':transfer.digest(maintenance),
              'runtime':{name:manifest['files'][name]['after'] for name in FILES}}
    payload['config.json'] = transfer.encode(config)
    receipt = {'version':1,'phase':'standby','commit':revision,'epoch':control['epoch'],
               'runtimeBefore':{name:manifest['files'][name]['before'] for name in FILES},
               'files':{name:transfer.digest(data) for name,data in payload.items()}}
    bundle.mkdir(mode=0o700)
    for name,data in {**payload,'manifest.json':transfer.encode(receipt)}.items():
        destination = bundle/name
        destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        transfer.atomic(destination,data)
    transfer.run(['caddy','validate','--config',str(bundle/'Caddyfile.maintenance'),'--adapter','caddyfile'])
    print('Standby transfer installation prepared. Maintenance and Firebase controls are not activated.')


def verify_payload(bundle):
    manifest = json.loads((bundle/'manifest.json').read_text())
    expected = {'transfer_maintenance.py','install_transfer_maintenance.py','Caddyfile.before','Caddyfile.maintenance',
                'config.json','crownlands-transfer-check.service','crownlands-transfer-check.timer'} | {'runtime/'+n for n in FILES}
    if (manifest.get('version') != 1 or manifest.get('phase') != 'standby'
        or set(manifest.get('runtimeBefore',{})) != set(FILES) or set(manifest.get('files',{})) != expected):
        raise ValueError('Unexpected transfer installation payload')
    payload = {}
    owner = bundle.stat().st_uid
    for name,checksum in manifest['files'].items():
        data = transfer.read_file(bundle/name,uid=owner)
        if transfer.digest(data) != checksum:
            raise ValueError('Transfer installation checksum mismatch')
        payload[name] = data
    config = json.loads(payload['config.json'])
    if (config.get('version') != 1 or config.get('commit') != manifest.get('commit') or config.get('epoch') != manifest.get('epoch')
        or not re.fullmatch('[a-f0-9]{32}', config.get('epoch','')) or set(config.get('runtime',{})) != set(FILES)
        or config.get('caddyBefore') != transfer.digest(payload['Caddyfile.before'])
        or config.get('caddyMaintenance') != transfer.digest(payload['Caddyfile.maintenance'])
        or payload['crownlands-transfer-check.service'] != SERVICE.encode()
        or payload['crownlands-transfer-check.timer'] != TIMER.encode()):
        raise ValueError('Invalid transfer configuration')
    for name in FILES:
        if config['runtime'][name] != transfer.digest(payload['runtime/'+name]):
            raise ValueError('Runtime and transfer configuration disagree')
    return manifest,config,payload


def standby(epoch):
    if transfer.read_json(transfer.CONTROL) != {'version':1,'phase':'standby','epoch':epoch}:
        raise ValueError('Existing game authority changed; preserved')
    transfer.run(['runuser','-u','postgres','--','psql','-X','-h','/var/run/postgresql','-d','crownlands_migration',
                  '-At','-v','ON_ERROR_STOP=1'],transfer.database_sql(epoch,empty=True))


def services_ready():
    import pwd
    for role in transfer.COMPONENTS:
        name = 'crownlands-'+role
        value = transfer.read_json(Path('/var/lib')/name/'status.json',uid=pwd.getpwnam(name).pw_uid)
        if transfer.run(['systemctl','is-active',name+'.service']) != 'active' or value.get('phase') != 'standby' or not -5 <= transfer.age(value['recordedAt']) <= 30:
            raise ValueError('Standby service health is not verified')


def install(bundle):
    if os.geteuid() != 0:
        raise ValueError('Ubuntu administrator authentication required')
    # A daily backup must not capture a mixture of old/new runtime files.
    with open(BACKUP_LOCK,'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
        install_locked(bundle)


def install_locked(bundle):
    if any(p.exists() for p in [CONF,STATE,PROGRAM,UNITS/'crownlands-transfer-check.service',UNITS/'crownlands-transfer-check.timer']):
        raise ValueError('Existing transfer installation preserved; inspect before retrying')
    manifest,config,payload = verify_payload(bundle)
    standby(config['epoch'])
    if transfer.digest(transfer.read_file(transfer.CADDY)) != config['caddyBefore']:
        raise ValueError('Existing proxy changed')
    original = {name:transfer.read_file(APP/name) for name in FILES}
    if any(transfer.digest(data) != manifest['runtimeBefore'][name] for name,data in original.items()):
        raise ValueError('Installed runtime changed; preserved')
    services_ready()
    transfer.run(['caddy','validate','--config',str(bundle/'Caddyfile.maintenance'),'--adapter','caddyfile'])
    backup = BACKUPS/('transfer-preparation-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
    backup.mkdir(mode=0o700,exist_ok=False)
    for name,data in original.items():
        dest = backup/name;dest.parent.mkdir(mode=0o700,parents=True,exist_ok=True);transfer.atomic(dest,data)
    transfer.atomic(backup/'manifest.json',transfer.encode(manifest))
    sources = SOURCES
    original_sources = transfer.read_file(sources)
    transfer.atomic(backup/'sources.txt',original_sources)
    units = ['crownlands-'+r+'.service' for r in transfer.COMPONENTS]
    created = []
    installed_sources = None
    try:
        # The live website, Firebase and forwarding payment ingress keep running.
        transfer.run(['systemctl','stop',*units],timeout=60)
        standby(config['epoch'])
        for name in FILES:
            transfer.atomic(APP/name,payload['runtime/'+name],0o644)
        for folder,mode in [(CONF,0o700),(STATE,0o755),(PROGRAM,0o755)]:
            folder.mkdir(mode=mode);created.append(folder);folder.chmod(mode)
        for name in ['config.json','Caddyfile.before','Caddyfile.maintenance']:
            transfer.atomic(CONF/name,payload[name])
        transfer.atomic(PROGRAM/'transfer_maintenance.py',payload['transfer_maintenance.py'],0o644)
        for name in ['crownlands-transfer-check.service','crownlands-transfer-check.timer']:
            transfer.atomic(UNITS/name,payload[name],0o644);created.append(UNITS/name)
        for role in transfer.COMPONENTS:
            for name in FILES:
                transfer.run(['runuser','-u','crownlands-'+role,'--','test','-r',str(APP/name)])
        transfer.run(['systemctl','daemon-reload'])
        transfer.run(['systemctl','start',*units],timeout=60)
        for attempt in range(40):
            try:
                services_ready();break
            except Exception:
                time.sleep(.3)
        else:
            raise ValueError('Updated standby services did not start')
        transfer.run(['systemctl','start','crownlands-transfer-check.service'])
        if (STATE/'maintenance.json').exists() or (STATE/'ingress-drained.json').exists():
            raise ValueError('Standby installation must not produce maintenance receipts')
        if transfer.run(['systemctl','show','crownlands-transfer-check.timer','--property=ActiveState','--value']) != 'inactive':
            raise ValueError('Maintenance timer must remain inactive until begin')
        standby(config['epoch'])
        if transfer.digest(transfer.read_file(transfer.CADDY)) != config['caddyBefore']:
            raise ValueError('Proxy changed during standby installation')
        transfer.run(['systemctl','start','crownlands-operations-collect.service'])
        for component in ['database','workers','email','notifications','payments','services']:
            transfer.run(['curl','--silent','--show-error','--fail','--max-time','5','-H','Host: playcrownlands.com',
                          'http://127.0.0.1:9295/service-healthz/'+component])
        if transfer.read_file(sources) != original_sources:
            raise ValueError('Backup sources changed during installation')
        additions = [str(CONF),str(STATE),str(PROGRAM),*(str(UNITS/n) for n in ['crownlands-transfer-check.service','crownlands-transfer-check.timer'])]
        new_sources = ('\n'.join(dict.fromkeys(original_sources.decode().splitlines()+additions))+'\n').encode()
        transfer.atomic(sources,new_sources)
        installed_sources = new_sources
        transfer.atomic(CONF/'installation.json',transfer.encode(manifest))
    except Exception:
        # This rollback is valid only while no migration has begun. Never
        # change activation.json or Caddy, nor delete any database content.
        standby(config['epoch'])
        transfer.run(['systemctl','stop',*units],timeout=60)
        for name,data in original.items():
            transfer.atomic(APP/name,data,0o644)
        if installed_sources is not None:
            if transfer.read_file(sources) != installed_sources:
                raise ValueError('Backup sources changed; preserve partial installation for review')
            transfer.atomic(sources,original_sources)
        for item in reversed(created):
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink(missing_ok=True)
        transfer.run(['systemctl','daemon-reload'])
        transfer.run(['systemctl','start',*units],timeout=60)
        raise
    print('Transfer tooling installed and all six service checks passed. Live Firebase authority and web routes are unchanged; maintenance is not active.')
    print('Rollback directory: '+str(backup))


if __name__ == '__main__':
    try:
        if len(sys.argv) == 4 and sys.argv[1] == 'prepare':
            prepare(Path(sys.argv[2]).absolute(),Path(sys.argv[3]).absolute())
        elif len(sys.argv) == 3 and sys.argv[1] == 'install':
            install(Path(sys.argv[2]).absolute())
        else:
            raise ValueError('Use prepare CANDIDATE NEW_BUNDLE or install BUNDLE')
    except Exception as error:
        detail = str(error) if type(error) is ValueError else type(error).__name__
        raise SystemExit('Standby transfer installation stopped: '+detail+'. Preserve its private bundle and rollback directory for inspection. No Firebase controls or game activation were attempted.') from None
