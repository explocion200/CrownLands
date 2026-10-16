import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest

import export_snapshot as snapshot
import verify_final_snapshot as verify
from test_snapshot import Fixture
from test_firebase_transfer_controls import setup


class FinalCloud:
    def __init__(self, cloud, journal):
        self.cloud, self.journal = cloud, journal
        self.extra = {}
        self.reads = []

    def reader(self, *args):
        return self.cloud.reader(*args)

    def read(self, url):
        self.reads.append(url)
        if url in self.extra:
            return copy.deepcopy(self.extra[url])
        plan = self.cloud.plan
        if '/functions?' in url:
            return {'functions': copy.deepcopy(plan['functions'])}
        if '/services?' in url:
            return {'services': [{'name': s['name']} for s in plan['invocationPolicies']]}
        if '/jobs?' in url:
            return {'jobs': copy.deepcopy(plan['jobsBefore'])}
        if '/keys?' in url:
            return {'keys': copy.deepcopy(plan['keysBefore'])}
        if '/fields?' in url:
            return {}
        if url.endswith(self.journal['rulesetCreated']):
            return copy.deepcopy(plan['rulesetBlocked'])
        return self.cloud.read(url)


class FinalSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.directory = snapshot.private_directory(self.root/'snapshot')
        self.read = Fixture()
        minute = (datetime.now(timezone.utc)-timedelta(minutes=10)).replace(second=0,microsecond=0)
        self.at = minute.isoformat().replace('+00:00','Z')
        self.later = (minute+timedelta(minutes=5)).isoformat().replace('+00:00','Z')
        self.manifest = snapshot.export_auth(self.directory,self.read,snapshot.export_firestore(self.directory,self.read,read_time=self.at))
        self.manifest.update(authStartedAt=self.at,authCompletedAt=self.at)
        snapshot.atomic_private(self.directory/'manifest.json',snapshot.encode(self.manifest))
        controller, cloud, self.journal, _ = setup()
        controller.close()
        self.journal['closedAt'] = (minute-timedelta(hours=1)).isoformat()
        controller.fence()
        self.journal['controlsAppliedAt'] = (minute-timedelta(minutes=5)).isoformat()
        self.plan = controller.plan
        self.cloud = FinalCloud(cloud,self.journal)
        self.mutations = len(cloud.calls)
        self.output = self.root/'verification'
        self.guards = 0

    def tearDown(self):
        self.temp.cleanup()

    def guard(self):
        self.guards += 1

    def run_verify(self):
        return verify.verify(self.directory,self.plan,self.journal,self.output,self.later,self.read,lambda:self.cloud,self.guard)

    def test_exact_typed_comparison_has_no_source_mutations_or_activation_claim(self):
        result = self.run_verify()
        self.assertTrue(result['exactSnapshotVerified'])
        self.assertFalse(result['sourceFrozen'])
        self.assertFalse(result['activationAuthorized'])
        self.assertEqual(result['documents'],2)
        self.assertEqual(result['accounts'],1)
        self.assertEqual(result['verifiedControls'],171)
        self.assertEqual(len(self.cloud.cloud.calls),self.mutations)
        self.assertEqual(result['snapshotManifestSha256'],snapshot.checksum((self.directory/'manifest.json').read_bytes()))
        self.assertGreater(self.guards,4)
        for file in self.output.rglob('*'):
            self.assertEqual(file.stat().st_mode&0o077,0)

    def test_same_count_changed_field_or_version_is_rejected(self):
        for change in [lambda d:d['fields'].update(new={'stringValue':'private'}),lambda d:d.update(updateTime='2026-10-02T00:00:00Z')]:
            with self.subTest(change=change):
                self.read = Fixture();change(self.read.docs[0]);self.output=self.root/('v'+str(len(list(self.root.iterdir()))))
                with self.assertRaisesRegex(ValueError,'content or version'):
                    self.run_verify()
                self.assertFalse((self.output/'receipt.json').exists())

    def test_deleted_or_added_document_is_rejected(self):
        self.read.docs.pop()
        with self.assertRaisesRegex(ValueError,'count changed'):
            self.run_verify()

    def test_stream_checks_count_even_if_aggregate_is_stale(self):
        original=self.read
        def read(url,body=None):
            if url.endswith(':runAggregationQuery'):
                return [{'result':{'aggregateFields':{'total':{'integerValue':'2'}}}}]
            return original(url,body)
        original.docs.pop();self.read=read
        with self.assertRaisesRegex(ValueError,'content or version'):
            self.run_verify()

    def test_auth_hash_provider_disable_and_configuration_changes_stop(self):
        original=self.read
        for label,mutation in [('accounts:batchGet',lambda x:x['users'][0].update(passwordHash='changed')),
                ('accounts:batchGet',lambda x:x['users'][0].update(disabled=False)),
                ('accounts:batchGet',lambda x:x['users'][0]['providerUserInfo'].pop()),
                ('/config?',lambda x:x['signIn']['hashConfig'].update(signerKey='changed')),
                ('/defaultSupportedIdpConfigs/',lambda x:x.update(clientSecret='changed'))]:
            def read(url,body=None):
                result=copy.deepcopy(original(url,body))
                if label in url:mutation(result)
                return result
            self.read=read;self.output=self.root/('v'+str(len(list(self.root.iterdir()))))
            with self.assertRaisesRegex(ValueError,'accounts or sign-in'):
                self.run_verify()
            self.assertFalse((self.output/'receipt.json').exists())

    def test_account_pagination_order_is_irrelevant_but_duplicates_are_not(self):
        users=[{'localId':'z','disabled':True},{'localId':'a','passwordHash':'hash'}]
        self.assertEqual(verify.canonical_accounts(users),verify.canonical_accounts(users[::-1]))
        with self.assertRaises(ValueError):verify.canonical_accounts(users+[users[0]])

    def test_changed_control_and_incomplete_journal_stop_before_data_read(self):
        key=next(iter(self.journal['controls']))
        self.journal['controls'].pop(key)
        self.read.requests.clear()
        with self.assertRaisesRegex(ValueError,'incomplete or extra'):
            self.run_verify()
        self.assertEqual(self.read.requests,[])
        self.assertFalse(self.output.exists())

    def test_pending_key_operation_and_restored_control_are_rejected(self):
        key=next(e for e in self.journal['controls'].values() if e['kind']=='key')
        url='https://apikeys.googleapis.com/v2/'+key['operation']
        self.cloud.extra[url]={'done':False}
        with self.assertRaisesRegex(ValueError,'unresolved'):
            self.run_verify()
        self.cloud.extra.clear();key['rollbackSubmittedAt']=self.at
        with self.assertRaisesRegex(ValueError,'unresolved'):
            self.run_verify()

    def test_disabled_account_drift_is_rejected(self):
        account=next(e for e in self.journal['controls'].values() if e['kind']=='account')
        self.cloud.cloud.resources[account['url']]['disabled']=False
        with self.assertRaisesRegex(ValueError,'drifted'):
            self.run_verify()

    def test_new_ttl_job_and_function_version_are_rejected(self):
        prefix='projects/'+verify.freeze.PROJECT+'/locations/'+verify.freeze.REGION
        cases=[(snapshot.BASE+'/collectionGroups/-/fields?filter=ttlConfig:*',{'fields':[{'name':'ttl'}]}),
            ('https://cloudfunctions.googleapis.com/v2/'+prefix+'/functions?pageSize=1000',{'functions':[]}),
            ('https://cloudscheduler.googleapis.com/v1/'+prefix+'/jobs?pageSize=500',{'jobs':self.plan['jobsBefore']+[{'name':'new'}]}),
            ('https://run.googleapis.com/v2/'+prefix+'/services?pageSize=1000&fields=services(name,invokerIamDisabled),nextPageToken',
             {'services':[{'name':s['name'],'invokerIamDisabled':True} for s in self.plan['invocationPolicies']]})]
        for url,value in cases:
            self.cloud.extra={url:value}
            with self.assertRaises(ValueError):self.run_verify()
            self.assertFalse(self.output.exists())

    def test_ttl_uses_provider_default_and_rejects_later_page(self):
        url = snapshot.BASE+'/collectionGroups/-/fields?filter=ttlConfig:*'
        self.cloud.extra[url] = {'nextPageToken':'next'}
        self.cloud.extra[url+'&pageToken=next'] = {'fields':[{'name':'ttl','ttlConfig':{'state':'ACTIVE'}}]}
        with self.assertRaisesRegex(ValueError,'TTL'):
            self.run_verify()
        self.assertIn(url+'&pageToken=next',self.cloud.reads)
        self.assertFalse(self.output.exists())

    def test_filter_order_is_irrelevant_but_filter_and_deployment_changes_stop(self):
        filters = [{'attribute':'database','value':'(default)'},
                   {'attribute':'document','value':'events/{id}','operator':'match-path-pattern'}]
        self.plan['functions'][0]['eventTrigger'] = {'eventFilters':copy.deepcopy(filters)}
        self.journal['planSha256'] = verify.freeze.digest(self.plan)
        functions = copy.deepcopy(self.plan['functions'])
        functions[0]['eventTrigger']['eventFilters'].reverse()
        url = ('https://cloudfunctions.googleapis.com/v2/projects/'+verify.freeze.PROJECT+
               '/locations/'+verify.freeze.REGION+'/functions?pageSize=1000')
        self.cloud.extra[url] = {'functions':functions}
        self.assertEqual(verify.verify_controls(self.plan,self.journal,self.cloud,self.guard),171)
        self.assertEqual(self.plan['functions'][0]['eventTrigger']['eventFilters'],filters)
        mutations = [lambda f:f['eventTrigger']['eventFilters'][0].update(value='other'),
                     lambda f:f['eventTrigger']['eventFilters'][0].update(operator='other'),
                     lambda f:f['eventTrigger']['eventFilters'].pop(),
                     lambda f:f['eventTrigger']['eventFilters'].append(copy.deepcopy(filters[0])),
                     lambda f:f.update(updateTime='changed'),
                     lambda f:f['serviceConfig'].update(serviceAccountEmail='other')]
        for mutate in mutations:
            changed = copy.deepcopy(functions)
            mutate(changed[0]);self.cloud.extra[url] = {'functions':changed}
            with self.assertRaisesRegex(ValueError,'deployment changed'):
                verify.verify_controls(self.plan,self.journal,self.cloud,self.guard)

    def test_corrupt_snapshot_and_pre_fence_snapshot_do_not_produce_receipt(self):
        self.journal['controlsAppliedAt']=self.at
        with self.assertRaisesRegex(ValueError,'post-fence'):
            self.run_verify()
        self.journal['controlsAppliedAt']=(datetime.fromisoformat(self.at.replace('Z','+00:00'))-timedelta(minutes=5)).isoformat()
        (self.directory/self.manifest['pages'][0]['file']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'integrity'):
            self.run_verify()
        self.assertFalse((self.output/'receipt.json').exists())

    def test_gate_loss_and_after_comparison_drift_withdraw_success(self):
        def closed():raise ValueError('fixture gate expired')
        self.guard=closed
        with self.assertRaisesRegex(ValueError,'gate expired'):self.run_verify()
        self.assertFalse(self.output.exists())
        self.guard=lambda:None
        original=self.cloud.read
        total=0
        def read(url):
            nonlocal total
            if '/functions?' in url:
                total+=1
                if total==2:return {'functions':[]}
            return original(url)
        self.cloud.read=read
        with self.assertRaisesRegex(ValueError,'deployment changed'):self.run_verify()
        self.assertFalse((self.output/'receipt.json').exists())

    def test_page_sizes_can_differ_and_oversize_reads_shrink_without_omission(self):
        original=self.read
        def read(url,body=None):
            if url.endswith(':runQuery') and body['structuredQuery']['limit']>1:
                raise snapshot.PageTooLarge('fixture page limit')
            return original(url,body)
        self.read=read
        self.assertEqual(self.run_verify()['documents'],2)

    def test_previous_evidence_is_preserved(self):
        self.run_verify()
        before=(self.output/'receipt.json').read_bytes()
        with self.assertRaisesRegex(ValueError,'prior verification'):self.run_verify()
        self.assertEqual((self.output/'receipt.json').read_bytes(),before)


if __name__=='__main__':unittest.main()
