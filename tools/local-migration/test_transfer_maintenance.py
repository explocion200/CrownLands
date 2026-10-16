import copy
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import transfer_maintenance as transfer
import install_transfer_maintenance as installer
import firebase_transfer_controls as controls

EPOCH = 'a'*32


def plan():
    return {'version':1,'project':'crown-land-b15e0','projectNumber':'542378516435','epoch':EPOCH,
            'mode':'prepared-only','sourceFrozen':False,'permissionsMissing':[],
            'functions':[{}]*150,'jobsBefore':[{}]*16,'invocationPolicies':[{}]*150,'writerAccountsBefore':[{}]*3,
            'preparedAt':transfer.stamp(),'writerFreezeStrategy':'reviewed-service-identities-and-client-controls'}


class FakeHost:
    def __init__(self):
        self.config = {'epoch':EPOCH,'caddyMaintenance':'b'*64}
        self.root = {'version':1,'phase':'standby','epoch':EPOCH}
        self.db = {'phase':'standby','epoch':EPOCH,'activated_at':None}
        self.saved = None
        self.states = {'timer':'active','service':'inactive'}
        self.events = []
        self.proof = None
        self.payment = {'ready':True,'inFlight':0,'journalOverflow':False,'pendingFailures':[]}
        self.inject = None
        self.occupied = False

    def event(self,name):
        self.events.append(name)
        if self.inject == name:
            raise ValueError('Synthetic interruption')

    def session(self): return copy.deepcopy(self.saved)
    def control(self): return self.root
    def save(self,value): self.saved = copy.deepcopy(value);self.event('save')
    def publisher_state(self): return dict(self.states)
    def database(self,**kwargs):
        self.event('database')
        if self.db['activated_at'] or self.db['phase'] == 'active' or (kwargs.get('empty') and self.occupied):
            raise ValueError('Existing data preserved')
        return dict(self.db)

    def pause_publisher(self): self.states['timer']='inactive';self.event('pause')

    @contextmanager
    def publisher_lock(self):
        self.event('publisher-lock')
        if self.states['service'] != 'inactive':
            raise ValueError('Publisher still active')
        yield

    def enter(self,value):
        self.db['phase'] = 'maintenance';self.event('database-maintenance')
        value['enteredAt'] = transfer.stamp();self.save(value)
        self.root['phase'] = 'maintenance';self.event('root-maintenance')
        self.event('proxy-maintenance');self.event('services-maintenance')
        value['phase'] = 'maintenance';self.save(value)
        self.event('timer')
        self.payment['recordedAt'] = transfer.stamp()

    def verify_runtime(self): self.event('runtime')
    def check_proxy(self): self.event('proxy')
    def services(self): self.event('services')
    def ingress(self): self.event('ingress');return dict(self.payment)
    def receipts(self,a,b): self.event('receipts');self.proof=(a,b)
    def invalidate(self): self.proof=None;self.event('invalidate')


class MaintenanceTests(unittest.TestCase):
    def test_standby_does_not_authorize_controls_or_touch_authorities(self):
        host = FakeHost()
        result = transfer.Maintenance(host).check()
        self.assertFalse(result['maintenanceVerified'])
        self.assertEqual(host.events,['invalidate'])
        self.assertEqual(host.root['phase'],'standby')

    def test_begin_attests_actual_state_and_retains_pending_payments(self):
        host = FakeHost();source = plan()
        host.payment['pendingFailures'] = ['c'*64]
        result = transfer.Maintenance(host).begin(source)
        self.assertTrue(result['maintenanceVerified']);self.assertFalse(result['sourceFrozen'])
        self.assertEqual(host.proof[0]['planSha256'],transfer.digest(transfer.encode(source)))
        self.assertEqual(host.proof[1]['pendingDeliveries'],1)
        self.assertNotIn('c'*64,json.dumps(host.proof))
        self.assertLess(host.events.index('pause'),host.events.index('database-maintenance'))
        self.assertLess(host.events.index('database-maintenance'),host.events.index('root-maintenance'))
        self.assertLess(host.events.index('root-maintenance'),host.events.index('receipts'))
        self.assertEqual(host.root['phase'],'maintenance')

    def test_never_start_with_existing_data_stale_inventory_or_wrong_epoch(self):
        for fault in ['data','activated','old','epoch','permissions']:
            with self.subTest(fault=fault):
                host = FakeHost();source=plan()
                if fault=='data':host.occupied=True
                if fault=='activated':host.db['activated_at']=transfer.stamp()
                if fault=='old':source['preparedAt']='2000-01-01T00:00:00Z'
                if fault=='epoch':source['epoch']='d'*32
                if fault=='permissions':source['permissionsMissing']=['required']
                with self.assertRaises(ValueError):transfer.Maintenance(host).begin(source)
                self.assertNotIn('pause',host.events);self.assertIsNone(host.proof)

    def test_in_progress_publisher_finishes_before_any_authority_change(self):
        host=FakeHost();source=plan();host.states['service']='active'
        with self.assertRaises(ValueError):transfer.Maintenance(host).begin(source)
        self.assertEqual(host.root['phase'],'standby');self.assertEqual(host.db['phase'],'standby')
        self.assertIsNone(host.proof)
        host.states['service']='inactive'
        self.assertTrue(transfer.Maintenance(host).begin(source)['maintenanceVerified'])

    def test_interruptions_never_issue_receipts_or_reopen_authority(self):
        for step in ['publisher-lock','database-maintenance','root-maintenance','proxy-maintenance','services-maintenance','timer','runtime','proxy','services','ingress','receipts']:
            with self.subTest(step=step):
                host=FakeHost();host.inject=step
                with self.assertRaises(ValueError):transfer.Maintenance(host).begin(plan())
                self.assertIsNone(host.proof)
                self.assertNotEqual(host.root['phase'],'active');self.assertNotEqual(host.db['phase'],'active')
                if step not in ['publisher-lock','database-maintenance']:
                    self.assertEqual(host.root['phase'],'maintenance')

    def test_receipts_disappear_on_drift_and_return_only_after_verified_drain(self):
        for fault in ['root','database','activated','publisher','runtime','proxy','services','inflight','stale','before','overflow','notready']:
            with self.subTest(fault=fault):
                host=FakeHost();manager=transfer.Maintenance(host);manager.begin(plan())
                if fault=='root':host.root['phase']='active'
                elif fault=='database':host.db['phase']='standby'
                elif fault=='activated':host.db['activated_at']=transfer.stamp()
                elif fault=='publisher':host.states['timer']='active'
                elif fault in ['runtime','proxy','services']:host.inject=fault
                elif fault=='inflight':host.payment['inFlight']=1
                elif fault=='stale':host.payment['recordedAt']='2000-01-01T00:00:00Z'
                elif fault=='before':
                    host.payment['recordedAt']=(datetime.fromisoformat(host.saved['enteredAt'])-timedelta(seconds=1)).isoformat()
                elif fault=='overflow':host.payment['journalOverflow']=True
                elif fault=='notready':host.payment['ready']=False
                with self.assertRaises(ValueError):manager.check()
                self.assertIsNone(host.proof)
        host=FakeHost();manager=transfer.Maintenance(host);manager.begin(plan())
        host.payment['inFlight']=1
        with self.assertRaises(ValueError):manager.check()
        host.payment.update(inFlight=0,recordedAt=transfer.stamp())
        self.assertTrue(manager.check()['maintenanceVerified'])

    def test_existing_attempt_cannot_bind_a_different_source_inventory(self):
        host=FakeHost();source=plan();manager=transfer.Maintenance(host);manager.begin(source)
        changed=copy.deepcopy(source);changed['functions'][0]={'changed':True}
        with self.assertRaises(ValueError):manager.begin(changed)
        self.assertEqual(host.root['phase'],'maintenance')
        self.assertTrue(manager.begin(source)['maintenanceVerified'])

    def test_protected_file_and_atomic_boundaries(self):
        with tempfile.TemporaryDirectory() as root:
            folder=Path(root);target=folder/'receipt'
            previous=os.umask(0o077)
            try:
                transfer.atomic(target,b'{}',0o644)
                self.assertEqual(target.stat().st_mode & 0o777,0o644)
                private=folder/'private';transfer.atomic(private,b'private')
                self.assertEqual(private.stat().st_mode & 0o777,0o600)
            finally:
                os.umask(previous)
            self.assertEqual(transfer.read_json(target,uid=os.getuid()),{})
            with self.assertRaises(ValueError):transfer.read_file(target,uid=os.getuid(),maximum=1)
            target.chmod(0o666)
            with self.assertRaises(ValueError):transfer.read_file(target,uid=os.getuid())
            target.chmod(0o644)
            link=folder/'link';link.symlink_to(target)
            with self.assertRaises(OSError):transfer.read_file(link,uid=os.getuid())
            target.with_name('receipt.next').symlink_to(target)
            with self.assertRaises(FileExistsError):transfer.atomic(target,b'changed')
            self.assertEqual(target.read_bytes(),b'{}')

    def test_real_https_response_contract_not_only_caddy_hash(self):
        with patch.object(transfer,'read_json',return_value={'version':1,'epoch':EPOCH,'caddyMaintenance':transfer.digest(b'config')}):
            host=transfer.Host()
        good='HTTP/2 503\ncache-control: no-store\nretry-after: 300\n\n'+transfer.MESSAGE
        with patch.object(transfer,'read_file',return_value=b'config'),patch.object(transfer,'run',return_value=good) as run:
            host.check_proxy();self.assertEqual(run.call_count,4)
            for call in run.call_args_list:
                args=call.args[0]
                self.assertEqual(args[args.index('--resolve')+1],'playcrownlands.com:443:192.168.1.145')
                self.assertNotIn('--insecure',args)
            for bad in [good.replace('503','200'),good.replace('no-store','public'),good.replace('300','1'),good.replace(transfer.MESSAGE,'ordinary page')]:
                run.return_value=bad
                with self.assertRaises(ValueError):host.check_proxy()

    def test_bundle_hashes_and_allowed_paths(self):
        with tempfile.TemporaryDirectory() as root:
            folder=Path(root)
            payload={'transfer_maintenance.py':b'checked helper','install_transfer_maintenance.py':b'checked installer',
                     'Caddyfile.before':b'before','Caddyfile.maintenance':b'maintenance',
                     'crownlands-transfer-check.service':installer.SERVICE.encode(),'crownlands-transfer-check.timer':installer.TIMER.encode()}
            for name in installer.FILES:payload['runtime/'+name]=b'validated runtime'
            config={'version':1,'commit':'c'*40,'epoch':EPOCH,'caddyBefore':transfer.digest(b'before'),
                    'caddyMaintenance':transfer.digest(b'maintenance'),'runtime':{n:transfer.digest(payload['runtime/'+n]) for n in installer.FILES}}
            payload['config.json']=transfer.encode(config)
            manifest={'version':1,'phase':'standby','commit':'c'*40,'epoch':EPOCH,
                      'runtimeBefore':{n:'d'*64 for n in installer.FILES},'files':{n:transfer.digest(b) for n,b in payload.items()}}
            for name,data in {**payload,'manifest.json':transfer.encode(manifest)}.items():
                p=folder/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);p.chmod(0o600)
            self.assertEqual(installer.verify_payload(folder)[1],config)
            (folder/'runtime'/installer.FILES[0]).write_bytes(b'changed')
            with self.assertRaises(ValueError):installer.verify_payload(folder)
            manifest['files']['../unexpected']='e'*64
            (folder/'manifest.json').write_bytes(transfer.encode(manifest))
            with self.assertRaises(ValueError):installer.verify_payload(folder)

    def test_receipts_are_consumed_by_the_actual_source_guard(self):
        source=plan();host=FakeHost();transfer.Maintenance(host).begin(source)
        # The real guard independently checks both receipt identities and age.
        caddy=b'reviewed proxy';host.proof[0]['caddySha256']=transfer.digest(caddy)
        def read(path):
            return host.root if path.endswith('activation.json') else host.proof[1] if path.endswith('ingress-drained.json') else host.proof[0]
        with patch.object(controls,'read_root_json',side_effect=read),patch.object(Path,'read_bytes',return_value=caddy), \
             patch.object(controls.subprocess,'run',return_value=type('Result',(),{'returncode':0,'stdout':'inactive\n'})()):
            controls.local_guard(source)
            host.proof[1]['planSha256']='d'*64
            with self.assertRaises(ValueError):controls.local_guard(source)

    def test_standby_installation_and_failure_restore_only_reviewed_runtime(self):
        from contextlib import ExitStack
        for failure in [None,'start','health','receipt']:
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as root,ExitStack() as stack:
                previous=os.umask(0o077);stack.callback(os.umask,previous)
                base=Path(root);app=base/'app';units=base/'units';units.mkdir();backups=base/'backups';backups.mkdir()
                conf,state,program=[base/n for n in ['config','state','program']]
                sourcefile=base/'sources';sourcefile.write_bytes(b'existing-source\n');sourcefile.chmod(0o600)
                proxy=base/'Caddyfile';proxy.write_bytes(b'live-routes');proxy.chmod(0o644)
                for name in installer.FILES:
                    p=app/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'previous runtime');p.chmod(0o644)
                config={'epoch':EPOCH,'caddyBefore':transfer.digest(b'live-routes')}
                manifest={'runtimeBefore':{n:transfer.digest(b'previous runtime') for n in installer.FILES}}
                payload={n:b'prepared' for n in ['config.json','Caddyfile.before','Caddyfile.maintenance','transfer_maintenance.py',
                                              'crownlands-transfer-check.service','crownlands-transfer-check.timer']}
                payload.update({'runtime/'+n:b'new runtime' for n in installer.FILES})
                stack.enter_context(patch.object(installer,'verify_payload',return_value=(manifest,config,payload)))
                for name,value in {'APP':app,'CONF':conf,'STATE':state,'PROGRAM':program,'UNITS':units,'BACKUPS':backups,
                                   'SOURCES':sourcefile,'BACKUP_LOCK':base/'backup-lock'}.items():
                    stack.enter_context(patch.object(installer,name,value))
                stack.enter_context(patch.object(transfer,'CADDY',proxy))
                stack.enter_context(patch.object(installer.os,'geteuid',return_value=0))
                stack.enter_context(patch.object(installer,'standby'))
                stack.enter_context(patch.object(installer,'services_ready'))
                stack.enter_context(patch('builtins.print'))
                original_read=transfer.read_file
                stack.enter_context(patch.object(transfer,'read_file',side_effect=lambda p,**k:original_read(p,uid=os.getuid())))
                calls=[];failed=False
                def command(args,*a,**kw):
                    nonlocal failed
                    calls.append(args)
                    if not failed and ((failure=='start' and args[:2]==['systemctl','start']) or (failure=='health' and args[0]=='curl')):
                        failed=True;raise ValueError('Synthetic installer failure')
                    return 'inactive'
                stack.enter_context(patch.object(transfer,'run',side_effect=command))
                original_atomic=transfer.atomic
                def atomic(path,data,*a,**kw):
                    if failure=='receipt' and path==conf/'installation.json':raise ValueError('Synthetic receipt failure')
                    return original_atomic(path,data,*a,**kw)
                stack.enter_context(patch.object(transfer,'atomic',side_effect=atomic))
                if failure:
                    with self.assertRaises(ValueError):installer.install(base/'bundle')
                    self.assertEqual(sourcefile.read_bytes(),b'existing-source\n')
                    self.assertFalse(conf.exists());self.assertFalse(state.exists());self.assertFalse(program.exists())
                else:
                    installer.install(base/'bundle');self.assertTrue((conf/'installation.json').exists())
                    self.assertIn(str(conf),sourcefile.read_text())
                    self.assertEqual(conf.stat().st_mode & 0o777,0o700)
                    for directory in [state,program]:self.assertEqual(directory.stat().st_mode & 0o777,0o755)
                    for name in ['crownlands-transfer-check.service','crownlands-transfer-check.timer']:
                        self.assertEqual((units/name).stat().st_mode & 0o777,0o644)
                for name in installer.FILES:self.assertEqual((app/name).read_bytes(),b'previous runtime' if failure else b'new runtime')
                for name in installer.FILES:self.assertEqual((app/name).stat().st_mode & 0o777,0o644)
                self.assertEqual(proxy.read_bytes(),b'live-routes')
                self.assertFalse(any('enable' in cmd or 'caddy' in cmd[1:] for cmd in calls if cmd[0]=='systemctl'))
                self.assertFalse((state/'maintenance.json').exists())


if __name__ == '__main__':
    unittest.main()
