import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
import activate_local_transfer as a


class Fixture:
    def __init__(self,fail=None):
        self.fail=fail;self.calls=[];self.records=[];self.activated=False;self.local_open=False;self.firebase_closed=True
    def step(self,name):
        self.calls.append(name)
        if name==self.fail:raise ValueError('synthetic interruption')
    def preflight(self):self.step('preflight')
    def record(self,name,**kwargs):self.records.append(name)
    def source(self,label):self.step('source-'+label);return {'sourceFrozen':True}
    def copy(self):self.step('copy')
    def prepare(self,source):self.step('prepare');return {'authorityActivated':False}
    def release(self):self.step('release')
    def backup(self):self.step('backup')
    def activate(self,source,prepared):
        self.activated=True # A lost response can follow a successful commit.
        self.step('activate');self.local_open=True
    def start(self):self.step('start')
    def publish(self):self.step('publish')
    def smoke(self):self.step('smoke')
    def resume(self):self.step('resume')
    def close(self):self.calls.append('close');self.local_open=False


class ActivationTests(unittest.TestCase):
    def test_complete_sequence_has_recovery_and_fresh_source_before_activation(self):
        f=Fixture();a.Activation(f).run()
        self.assertEqual(f.calls,['preflight','source-before','copy','prepare','release','backup','source-after','activate','start','publish','smoke','resume'])
        self.assertEqual(f.records[-1],'complete');self.assertTrue(f.local_open);self.assertTrue(f.firebase_closed)

    def test_every_interruption_closes_without_reopening_or_clearing_activation(self):
        steps=['source-before','copy','prepare','release','backup','source-after','activate','start','publish','smoke','resume']
        for name in steps:
            with self.subTest(name=name):
                f=Fixture(name)
                with self.assertRaises(ValueError):a.Activation(f).run()
                self.assertFalse(f.local_open);self.assertTrue(f.firebase_closed)
                self.assertEqual(f.calls[-1],'close');self.assertEqual(f.records[-1],'needs-reconciliation')
                self.assertEqual(f.activated,steps.index(name)>=steps.index('activate'))
                self.assertNotIn('complete',f.records)

    def test_preflight_refusal_never_changes_prior_state(self):
        f=Fixture('preflight')
        with self.assertRaises(ValueError):a.Activation(f).run()
        self.assertEqual(f.calls,['preflight']);self.assertEqual(f.records,[])

    def test_protected_failure_path_retains_irreversible_marks(self):
        host=object.__new__(a.Host);host.epoch='a'*32
        commands=[];writes=[]
        with patch.object(a.t,'run',side_effect=lambda args,input=None,**kwargs:commands.append((args,input))),\
             patch.object(a.t,'atomic',side_effect=lambda path,data,*args:writes.append((path,data))),\
             patch.object(a.t,'read_file',return_value=b'prepared maintenance'):
            host.close()
        sql=[text for args,text in commands if 'psql' in args]
        self.assertEqual(sql,["UPDATE crownlands_control.deployment SET phase='maintenance' WHERE singleton;"])
        self.assertFalse(any('firebase' in ' '.join(args).lower() for args,text in commands))
        self.assertTrue(any(path==a.t.CONTROL and b'"phase":"maintenance"' in raw for path,raw in writes))

if __name__=='__main__':unittest.main()
