import copy
from datetime import datetime,timezone
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
import verify_source_handover as v
import test_handover_checks as fixtures
from test_handover_checks import current,REALM,timestamp


class SourceHandoverTests(unittest.TestCase):
    def test_independent_denial_probes(self):
        responses=[(403,b'Forbidden'),(503,b'{"error":"Season rankings are temporarily unavailable."}'),
            (403,b'{"error":{"details":[{"reason":"API_KEY_SERVICE_BLOCKED","metadata":{"service":"identitytoolkit.googleapis.com"}}]}}')]
        with patch.object(v,'request',side_effect=responses):self.assertEqual(v.public_probes('synthetic','synthetic')['runtimeReadStatus'],503)
        for index,replacement in [(0,(200,b'ok')),(1,(403,b'Forbidden')),(1,(503,b'{"error":"unrelated"}')),(2,(403,b'{"error":{}}'))]:
            bad=copy.deepcopy(responses);bad[index]=replacement
            with patch.object(v,'request',side_effect=bad),self.assertRaises((ValueError,json.JSONDecodeError)):
                v.public_probes('synthetic','synthetic')

    def fixture(self,root):
        for name in ['plan','snapshot','verification','baseline']:(root/name).mkdir(mode=0o700)
        now=datetime.now(timezone.utc).timestamp();closed=now-1200
        jobs,routes=fixtures.HandoverTests().schedules()
        for job in jobs:job.update(lastAttemptTime=timestamp(closed-60),scheduleTime=timestamp(closed+60))
        epoch='a'*32;plan={'epoch':epoch,'jobsBefore':copy.deepcopy(jobs)}
        journal={'closedAt':timestamp(closed),'controlsAppliedAt':timestamp(closed+600)}
        page=[current('realmConfig/current')]
        manifest={'expectedDocuments':1,'pages':[{'file':'documents-000000.json'}]}
        def save(folder,name,value):
            raw=v.snapshot.encode(value);(root/folder/name).write_bytes(raw);return raw
        raw=save('snapshot','manifest.json',manifest);save('snapshot','documents-000000.json',page)
        proof={'exactSnapshotVerified':True,'epoch':epoch,'planSha256':v.freeze.digest(plan),'documents':1,
            'snapshotManifestSha256':v.snapshot.checksum(raw)}
        save('verification','receipt.json',proof);save('plan','freeze-plan.json',plan);save('plan','controls-journal.json',journal)
        save('baseline','baseline.json',{'runtimeStatus':200,'accountStatus':200,'epoch':epoch,'recordedAt':timestamp(closed-60)})
        save('baseline','browser-denial.json',{'epoch':epoch,'planSha256':v.freeze.digest(plan),'authenticatedFirebaseReadDenied':True,
            'firebaseErrorCode':'permission-denied','recordedAt':timestamp(now-30)})
        save('baseline','final-payments.json',{'snapshotManifestSha256':v.snapshot.checksum(raw),'orders':0,'unsettled':0,
            'endpointsVerified':['live','test'],'recordedAt':timestamp(now-30)})
        save('baseline','local-schedules.json',routes)
        rows,names=fixtures.HandoverTests().series()
        for row in rows:
            for point,at in zip(row['points'],[now-60,now-120]):point['interval']['endTime']=timestamp(at)
        subscriptions=[{'name':'projects/'+v.freeze.PROJECT+'/subscriptions/'+name} for name in names]
        save('baseline','event-subscriptions.json',subscriptions)
        return jobs,subscriptions,{'timeSeries':rows}

    def run_fixture(self,root,*,late_failure=False):
        jobs,subscriptions,metrics=self.fixture(root)
        original_read=Path.read_text
        def read(path,*args,**kwargs):
            if str(path)=='/srv/crownlands/current/game/firebase-config.js':return 'const config={apiKey:"synthetic"};'
            return original_read(path,*args,**kwargs)
        observations=[]
        def controls(*args):
            args[-1]();observations.append(1)
            if late_failure and len(observations)==2:raise ValueError('Late source drift')
        with patch.object(v.controls,'API',return_value=SimpleNamespace(reader=SimpleNamespace(token='synthetic'),read=lambda url:{})),\
             patch.object(v.controls,'local_guard'),patch.object(v.final,'verify_controls',side_effect=controls),\
             patch.object(v.snapshot,'verify_files'),patch.object(v.freeze,'listed',side_effect=[jobs,subscriptions]),\
             patch.object(v,'api_read',return_value=metrics),patch.object(v,'public_probes',return_value={'runtimeReadStatus':503}),\
             patch.object(v.subprocess,'run',return_value=SimpleNamespace(stdout='synthetic')),patch.object(Path,'read_text',read):
            return v.collect(root/'plan',root/'snapshot',root/'verification',root/'baseline',root/'baseline/final-payments.json',root/'output')

    def test_success_binds_plan_snapshot_and_cursor_without_activation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);result=self.run_fixture(root)
            self.assertTrue(result['sourceFrozen']);self.assertFalse(result['localAuthorityActivated'])
            self.assertEqual(result['documents'],1);self.assertEqual(len(result['schedulers']),16)
            self.assertTrue((root/'output/event-metrics.json').exists());self.assertTrue((root/'output/receipt.json').exists())

    def test_late_source_drift_leaves_no_success_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            with self.assertRaises(ValueError):self.run_fixture(root,late_failure=True)
            self.assertFalse((root/'output/receipt.json').exists())

    def test_previous_output_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);(root/'output').mkdir();(root/'output/keep').write_text('preserve')
            with self.assertRaises(ValueError):v.collect(root/'plan',root/'snapshot',root/'verification',root/'baseline',root/'baseline/final-payments.json',root/'output')
            self.assertEqual((root/'output/keep').read_text(),'preserve')

if __name__=='__main__':unittest.main()
