#!/usr/bin/python3
"""Protected one-way initial handover after source freeze and staging restore.

This never changes Google source controls, erases a target, or reopens Firebase.
An interruption leaves a durable journal for operator reconciliation. A failed
activation closes local service access and retains all data and activation marks.
"""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import sys
import time
import uuid

import transfer_maintenance as t
import import_final_schema as importer

TRANSFER=Path('/usr/local/lib/crownlands-transfer')
DEPLOY=Path('/usr/local/lib/crownlands-deploy')
NODE=Path('/usr/local/lib/crownlands-runtime/node')
SCRIPTS=t.APP/'tools/local-migration'
ROOT=Path('/srv/crownlands')
JOURNAL=t.STATE/'activation-session.json'


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);result=importlib.util.module_from_spec(spec)
    sys.modules[name]=result;spec.loader.exec_module(result);return result


class Activation:
    def __init__(self,host):self.host=host
    def run(self):
        h=self.host
        h.preflight()
        h.record('checking-source')
        try:
            before=h.source('before');h.record('importing')
            h.copy();h.record('preparing-database')
            prepared=h.prepare(before);h.record('preparing-release',prepared=prepared)
            h.release();h.record('checking-recovery')
            h.backup();h.record('rechecking-source')
            after=h.source('after');h.record('activating-database')
            h.activate(after,prepared);h.record('starting-local-services')
            h.start();h.record('publishing-local-routes')
            h.publish();h.record('checking-live')
            h.smoke();h.record('resuming-publisher')
            h.resume();h.record('complete')
        except BaseException:
            # This path deliberately cannot restore old Firebase routing/data.
            # Even a lost COMMIT response may mean local authority was active.
            try:h.close()
            finally:h.record('needs-reconciliation')
            raise


class Host:
    def __init__(self,args):
        self.args=args;self.owner=pwd.getpwnam('project-server');self.maintenance=t.Host()
        self.epoch=self.maintenance.config['epoch'];self.plan=t.read_json(args.plan_directory/'freeze-plan.json',uid=self.owner.pw_uid)
        self.proof=t.read_json(args.verification_directory/'receipt.json',uid=self.owner.pw_uid)
        self.preparation=t.read_json(t.STATE/'final-preparation.json')
        self.policy=t.read_json(t.CONF/'local-publisher.json')
        self.journal={'version':1,'epoch':self.epoch,'startedAt':t.stamp(),'attempt':uuid.uuid4().hex,'steps':[]}
        self.root_release=ROOT/'releases'/('local-initial-'+self.preparation['commit'])
        sys.path.insert(0,str(DEPLOY));import local_runtime,publisher
        self.runtime=local_runtime;self.publisher=publisher

    def record(self,phase,**values):
        self.journal.update(phase=phase,**values);self.journal['steps'].append({'phase':phase,'at':t.stamp()})
        t.atomic(JOURNAL,t.encode(self.journal));print('Transfer: '+phase,flush=True)

    def preflight(self):
        if JOURNAL.exists() or self.root_release.exists():raise ValueError('Prior activation attempt preserved for reconciliation')
        if not re.fullmatch('[a-f0-9]{40}',self.preparation.get('commit','')):raise ValueError('Prepared client identity required')
        t.Maintenance(self.maintenance).check()
        importer.inputs(self.args.snapshot_directory,self.args.verification_directory,self.args.schema,self.epoch,self.owner.pw_uid)
        session=self.maintenance.session()
        if (session['planSha256']!=self.proof['planSha256'] or self.preparation['epoch']!=self.epoch
                or t.digest(t.read_file(t.CONF/'local-publisher.json'))!=self.preparation['futurePublisherSha256']):raise ValueError('Preparation identities differ')
        candidate=Path(self.preparation['candidate'])
        if candidate!=t.STATE/('candidate-'+self.preparation['commit']):raise ValueError('Unexpected prepared client path')
        metadata=t.read_file(candidate/'deployment.json',maximum=4*1024*1024)
        if t.digest(metadata)!=self.preparation['candidateMetadataSha256']:raise ValueError('Prepared client metadata changed')
        self.meta=json.loads(metadata)
        if self.runtime.inventory(candidate/'game')!=self.meta['files']:raise ValueError('Prepared client changed')
        self.runtime.require_local_release(candidate,self.policy['localBackend'],self.policy['approved'])
        if self.runtime.runtime_hash(t.APP)!=self.policy['localBackend']['runtimeHash']:raise ValueError('Installed runtime changed')
        self.before_release=self.publisher.current_release(ROOT)

    def operator(self,args,timeout=900):
        return t.run(['runuser','-u','project-server','--','env','PATH='+self.owner.pw_dir+'/.local/bin:/usr/bin:/bin',*map(str,args)],timeout=timeout)

    def source(self,label):
        prefix=self.args.baseline_directory/('activation-'+self.journal['attempt']+'-'+label)
        payments=prefix.with_name(prefix.name+'-payments.json')
        self.operator([NODE,SCRIPTS/'verify_handover_payments.js',self.args.snapshot_directory,payments],timeout=900)
        self.operator(['/usr/bin/python3','-B',TRANSFER/'verify_source_handover.py',self.args.plan_directory,
            self.args.snapshot_directory,self.args.verification_directory,self.args.baseline_directory,payments,prefix],timeout=1500)
        raw=t.read_file(prefix/'receipt.json',uid=self.owner.pw_uid)
        result=json.loads(raw)
        if (result.get('sourceFrozen') is not True or result.get('localAuthorityActivated') is not False
                or result.get('epoch')!=self.epoch or result.get('planSha256')!=self.proof['planSha256']
                or result.get('snapshotManifestSha256')!=self.proof['snapshotManifestSha256']
                or result.get('verificationSha256')!=t.digest(t.read_file(self.args.verification_directory/'receipt.json',uid=self.owner.pw_uid))
                or not -5<=t.age(result['recordedAt'])<=300):raise ValueError('Fresh matching source handover required')
        t.atomic(t.STATE/('source-'+label+'.json'),raw)
        if label=='before':
            # Keep the rollback metadata and exact comparison identity in the
            # already backed-up protected state directory before the cloud copy.
            for name,path in [('source-plan.json',self.args.plan_directory/'freeze-plan.json'),
                    ('source-controls.json',self.args.plan_directory/'controls-journal.json'),
                    ('snapshot-manifest.json',self.args.snapshot_directory/'manifest.json'),
                    ('snapshot-comparison.json',self.args.verification_directory/'receipt.json')]:
                t.atomic(t.STATE/name,t.read_file(path,uid=self.owner.pw_uid))
        return {**result,'sourceFenceSha256':t.digest(raw),'accounts':self.proof['accounts']}

    def copy(self):
        t.run(['/usr/bin/python3','-B',str(TRANSFER/'import_final_schema.py'),str(self.args.snapshot_directory),
            str(self.args.verification_directory),'--schema',self.args.schema],timeout=1500)

    def database(self,action,value):
        raw=t.run(['runuser','-u','postgres','--',str(NODE),str(SCRIPTS/'prepare_live_handover.js'),action],
            input=json.dumps(value),timeout=180)
        return json.loads(raw)

    def prepare(self,source):return self.database('prepare',source)

    def release(self):
        self.root_release.mkdir(mode=0o755);self.root_release.chmod(0o755)
        shutil.copytree(Path(self.preparation['candidate'])/'game',self.root_release/'game')
        self.publisher.copy_website(self.before_release/'website',self.root_release/'website')
        t.atomic(self.root_release/'deployment.json',t.encode(self.meta),0o644)
        for path in self.root_release.rglob('*'):
            if path.is_symlink():raise ValueError('Unexpected prepared release link')
            path.chmod(0o755 if path.is_dir() else 0o644)
        if self.runtime.inventory(self.root_release/'game')!=self.meta['files']:raise ValueError('Prepared release copy changed')
        self.runtime.require_local_release(self.root_release,self.policy['localBackend'],self.policy['approved'])
        code="const fs=require('node:fs');const r=require(process.argv[1]).prepare(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(r));"
        routes=json.loads(t.run([str(NODE),'-e',code,str(SCRIPTS/'prepare_cutover_routes.js')],t.read_file(t.CONF/'Caddyfile.before').decode()))
        if t.digest(routes['maintenance'].encode())!=self.maintenance.config['caddyMaintenance']:raise ValueError('Prepared routes changed')
        t.atomic(t.CONF/'Caddyfile.active',routes['active'].encode(),0o600)
        t.run(['caddy','validate','--config',str(t.CONF/'Caddyfile.active'),'--adapter','caddyfile'])

    def backup(self):
        started=time.time();t.run(['systemctl','start','crownlands-backup.service'],timeout=7200)
        status=t.read_json(Path('/var/lib/crownlands-backup/status.json'))
        if status.get('last_result')!='success' or status.get('offsite_success_at',0)<started:raise ValueError('Fresh off-site backup required')
        backup=module('handover_backup',Path('/usr/local/lib/crownlands-backup/postgres_backup.py'))
        restore=module('handover_restore',TRANSFER/'install_database_backup.py')
        stage=Path('/var/lib/crownlands-backup/recovery-metadata/postgres')
        receipt=restore.verify_restore(backup,stage)
        expected=backup.verify_archive(stage)
        permanent=[table for table in expected['tables'] if table['schema'] in backup.PERMANENT]
        if backup.fingerprints(backup.PERMANENT,prefix=['runuser','-u','postgres','--'])!=permanent:raise ValueError('Permanent data changed after backup')
        t.atomic(t.STATE/'handover-recovery.json',t.encode(receipt))

    def activate(self,source,prepared):
        t.Maintenance(self.maintenance).check()
        t.run(['systemctl','disable','--now','crownlands-transfer-check.timer'])
        if self.publisher.current_release(ROOT)!=self.before_release:raise ValueError('Current website release changed')
        self.publisher.swap(ROOT/'current',self.root_release)
        t.atomic(Path('/etc/crownlands-deploy/config.json'),t.encode(self.policy),0o644)
        self.database('activate',{**source,'prepared':prepared})
        t.atomic(t.CONTROL,t.encode({'version':1,'phase':'active','epoch':self.epoch}),0o644)

    def start(self):
        t.run(['systemctl','restart',*['crownlands-'+role+'.service' for role in t.COMPONENTS]],timeout=90)
        deadline=time.monotonic()+600
        while time.monotonic()<deadline:
            t.run(['systemctl','start','crownlands-operations-collect.service'],timeout=100)
            try:
                for component in ['database','workers','email','notifications','payments','services']:
                    t.run(['curl','--fail','--silent','--show-error','--max-time','5','--header','Host: playcrownlands.com','http://127.0.0.1:9295/service-healthz/'+component])
                return
            except ValueError:time.sleep(5)
        raise ValueError('Local services did not become healthy')

    def publish(self):
        t.atomic(t.CADDY,t.read_file(t.CONF/'Caddyfile.active'),0o644);t.run(['systemctl','reload','caddy'])

    def smoke(self):self.publisher.smoke(ROOT,self.meta)

    def resume(self):
        self.runtime.authority(self.policy)
        t.PAUSED.unlink();t.run(['systemctl','enable','--now','crownlands-deploy.timer'])

    def close(self):
        t.atomic(t.PAUSED,b'Local transfer requires reconciliation. Do not reopen Firebase.\n',0o644)
        t.run(['systemctl','disable','--now','crownlands-deploy.timer'])
        t.atomic(t.CONTROL,t.encode({'version':1,'phase':'maintenance','epoch':self.epoch}),0o644)
        # Retain snapshot/fence receipts and activated_at even after a lost
        # response. These make the old source rollback refuse automatically.
        t.run(['runuser','-u','postgres','--','psql','-X','-h','/var/run/postgresql','-d','crownlands_migration','-v','ON_ERROR_STOP=1'],
            "UPDATE crownlands_control.deployment SET phase='maintenance' WHERE singleton;",timeout=90)
        t.atomic(t.CADDY,t.read_file(t.CONF/'Caddyfile.maintenance'),0o644);t.run(['systemctl','reload','caddy'])
        t.run(['systemctl','restart',*['crownlands-'+role+'.service' for role in t.COMPONENTS]],timeout=90)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['plan_directory','snapshot_directory','verification_directory','baseline_directory']:p.add_argument(name,type=Path)
    p.add_argument('--schema',required=True);args=p.parse_args()
    if os.geteuid()!=0 or not re.fullmatch('migration_final_[a-f0-9]{12}',args.schema):raise ValueError('Administrator final schema required')
    owner=pwd.getpwnam('project-server');base=Path(owner.pw_dir)/'.local/share/crownlands'
    for key,path in vars(args).items():
        if key=='schema':continue
        if not path.is_absolute() or path.is_symlink() or not path.resolve().is_relative_to(base.resolve()) or path.stat().st_uid!=owner.pw_uid or path.stat().st_mode&0o077:raise ValueError('Private operator evidence directories required')
    os.umask(0o077)
    with open(t.STATE/'activation.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        Activation(Host(args)).run()
    print('Local authority and routes activated. Production browser acceptance and observation remain required.',flush=True)


if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Transfer stopped. Preserve the protected journal and both data copies; do not reopen Firebase. Private error details were not printed.') from None
