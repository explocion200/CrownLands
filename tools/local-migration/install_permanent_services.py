#!/usr/bin/python3
"""One protected installation, in standby. Never change Stripe destinations."""
import hashlib
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

APP=Path('/usr/local/lib/crownlands-runtime')
CONF=Path('/etc/crownlands-runtime')
CADDY=Path('/etc/caddy/Caddyfile')
HELPER=Path('/usr/local/lib/crownlands-backup/postgres_backup.py')
ROLES=['auth','game','worker','mail','push','payments','payment-ingress','operations']

def run(args,input=None):
    p=subprocess.run(args,input=input,text=True,capture_output=True,timeout=180)
    if p.returncode:
        raise RuntimeError('Installation check failed: '+Path(args[0]).name)
    return p.stdout.strip()

def sql(statement):
    return run(['runuser','-u','postgres','--','psql','-X','-h','/var/run/postgresql','-d','crownlands_migration','-At','-v','ON_ERROR_STOP=1'],statement)

def health(url):
    return run(['curl','--fail','--silent','--show-error','--max-time','5','-H','Host: playcrownlands.com',url])

def install(bundle):
    if os.geteuid()!=0:raise RuntimeError('Ubuntu administrator authentication required')
    if APP.exists() or CONF.exists():raise RuntimeError('Existing permanent installation preserved; inspect before retrying')
    manifest=json.loads((bundle/'manifest.json').read_text())
    if manifest.get('activation')!='standby' or manifest.get('version')!=1:raise RuntimeError('Standby-only installer required')
    run(['sha256sum','--check','--quiet',str(bundle/'SHA256SUMS')])
    for relative in ['app/tools/local-migration/initialize_permanent_schema.js','app/local-backend/permanent-services.js','node','postgres_backup.py','install_database_backup.py']:
        if not (bundle/relative).is_file():raise RuntimeError('Required installation input missing')
    if json.loads((bundle/'activation.json').read_text()).get('phase')!='standby':raise RuntimeError('Activation input must remain standby')
    if hashlib.sha256(CADDY.read_bytes()).hexdigest()!=manifest['caddyBeforeHash']:raise RuntimeError('Caddy changed; preserved')
    if hashlib.sha256(HELPER.read_bytes()).hexdigest()!=manifest['backupHelperBeforeHash']:raise RuntimeError('Backup helper changed; preserved')
    run(['caddy','validate','--config',str(bundle/'Caddyfile'),'--adapter','caddyfile'])
    for role in ROLES:
        name='crownlands-'+role
        if Path('/etc/systemd/system',name+'.service').exists() or subprocess.run(['id',name],capture_output=True).returncode==0:raise RuntimeError('Existing service identity preserved')
        if sql("SELECT count(*) FROM pg_roles WHERE rolname='"+name+"';")!='0':raise RuntimeError('Existing database identity preserved')
    backup=Path('/var/backups/crownlands')/('permanent-services-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
    backup.mkdir(parents=True,mode=0o700,exist_ok=False)
    shutil.copy2(CADDY,backup/'Caddyfile');shutil.copy2(HELPER,backup/'postgres_backup.py')
    sources=Path('/etc/crownlands-backup/sources.txt');shutil.copy2(sources,backup/'sources.txt')
    started=[];routed=False
    try:
        APP.mkdir(mode=0o755);shutil.copytree(bundle/'app',APP/'app',symlinks=True)
        for root,dirs,files in os.walk(APP/'app'):
            os.chmod(root,0o755)
            for name in files:
                target=Path(root)/name
                if not target.is_symlink():target.chmod(0o644)
        shutil.copy2(bundle/'node',APP/'node');(APP/'node').chmod(0o755)
        for name in ['collect_operations.py','initialize_permanent_schema.js']:
            source=bundle/name
            if source.exists():shutil.copy2(source,APP/name)
        CONF.mkdir(mode=0o711)
        for name in [*(role+'.json' for role in ROLES if role!='operations'),'activation.json','monitoring.json','manifest.json']:
            shutil.copyfile(bundle/name,CONF/name);(CONF/name).chmod(0o644 if name=='activation.json' else 0o600)
        for role in ROLES:
            name='crownlands-'+role
            run(['useradd','--system','--user-group','--no-create-home','--home-dir','/nonexistent','--shell','/usr/sbin/nologin',name])
            if role in ROLES[:6]:sql(f'CREATE ROLE "{name}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 16;')
        # Bootstrap source lives under the installed app so dependency paths are fixed.
        run(['runuser','-u','postgres','--',str(APP/'node'),str(APP/'app/tools/local-migration/initialize_permanent_schema.js'),'--empty-only'])
        for item in bundle.glob('crownlands-*.service'):
            shutil.copyfile(item,Path('/etc/systemd/system')/item.name);(Path('/etc/systemd/system')/item.name).chmod(0o644)
        timer='crownlands-operations-collect.timer';shutil.copyfile(bundle/timer,Path('/etc/systemd/system')/timer)
        (Path('/etc/systemd/system')/timer).chmod(0o644)
        run(['systemctl','daemon-reload'])
        for role in ROLES:
            unit='crownlands-'+role+'.service';run(['systemctl','start',unit]);started.append(unit)
        for attempt in range(40):
            try:
                if all(json.loads((Path('/var/lib')/('crownlands-'+r)/'status.json').read_text()).get('phase')=='standby' for r in ROLES[:6]):
                    health('http://127.0.0.1:9294/internal/health');break
            except Exception:pass
            time.sleep(.3)
        else:raise RuntimeError('Permanent standby startup failed')
        run(['systemctl','start','crownlands-operations-collect.service'])
        for component in ['database','workers','email','notifications','payments','services']:
            health('http://127.0.0.1:9295/service-healthz/'+component)
        if hashlib.sha256(CADDY.read_bytes()).hexdigest()!=manifest['caddyBeforeHash']:raise RuntimeError('Caddy changed during installation')
        shutil.copyfile(bundle/'Caddyfile',CADDY);routed=True;run(['systemctl','reload','caddy'])
        for endpoint in ['/healthz','/backup-healthz','/service-healthz/services','/service-healthz/payments']:
            health('https://playcrownlands.com'+endpoint)
        for unit in started:run(['systemctl','restart',unit])
        time.sleep(2);run(['systemctl','start','crownlands-operations-collect.service'])
        for component in ['database','workers','email','notifications','payments','services']:health('http://127.0.0.1:9295/service-healthz/'+component)
        original=sources.read_text().splitlines();extra=[str(APP),str(CONF),*(str(Path('/etc/systemd/system')/('crownlands-'+r+'.service')) for r in ROLES),'/etc/systemd/system/crownlands-operations-collect.service','/etc/systemd/system/crownlands-operations-collect.timer']
        with open('/run/lock/crownlands-backup.lock','w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            def module(name):
                spec=importlib.util.spec_from_file_location(name,bundle/(name+'.py'));value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
            capture=module('postgres_backup');restore=module('install_database_backup')
            stage=backup/'database-restore-test';stage.mkdir(mode=0o700)
            print('Testing consistent backup and restore of permanent and preview databases.',flush=True)
            capture.main(stage);receipt=restore.verify_restore(capture,stage)
            print(f"Backup restore passed: {receipt['tables']} tables; {receipt['rows']} rows compared.",flush=True)
            if hashlib.sha256(HELPER.read_bytes()).hexdigest()!=manifest['backupHelperBeforeHash']:raise RuntimeError('Backup helper changed during installation')
            shutil.copyfile(bundle/'postgres_backup.py',HELPER);HELPER.chmod(0o644)
            sources.write_text('\n'.join(dict.fromkeys(original+extra))+'\n')
        run(['systemctl','enable',*started]);run(['systemctl','enable','--now',timer])
    except Exception:
        if routed:shutil.copy2(backup/'Caddyfile',CADDY);subprocess.run(['systemctl','reload','caddy'],capture_output=True)
        shutil.copy2(backup/'sources.txt',sources);shutil.copy2(backup/'postgres_backup.py',HELPER)
        for unit in started:subprocess.run(['systemctl','stop',unit],capture_output=True)
        # Keep any empty schemas and files for inspection; never delete account data.
        raise
    run(['systemctl','start','--no-block','crownlands-backup.service'])
    print('Permanent services installed in standby; startup/restart and HTTPS health passed. Stripe destinations and live player authority are unchanged.')
    print('Rollback directory: '+str(backup))

if __name__=='__main__':
    bundle=Path(__file__).resolve().parent;os.chdir(bundle)
    try:install(bundle)
    except Exception as e:
        print(str(e) if isinstance(e,RuntimeError) else 'Installation stopped; partial files preserved; private details suppressed.',file=sys.stderr);sys.exit(1)
