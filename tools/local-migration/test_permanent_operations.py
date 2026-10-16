import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import collect_operations as collector
import postgres_backup as backup


class OperationsTests(unittest.TestCase):
    def test_installation_sources_parse(self):
        for name in ['install_permanent_services.py','collect_operations.py','postgres_backup.py']:
            compile(Path(__file__).with_name(name).read_text(),name,'exec')

    def test_health_fails_for_database_job_mail_and_payment_faults(self):
        stamp = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        values = {'phase': 'standby', 'recordedAt': stamp, 'lastSuccessfulTick': stamp,
                  'healthy': True, 'ready': True, 'pendingFailures': []}
        def sql(args, input=None):
            if 'pg_isready' in args:
                return 'ready'
            if 'json_build_object' in input:
                return json.dumps({'dead': 0, 'overdue': 0, 'stalled': 0})
            return '0'
        with patch.object(Path, 'read_text', return_value=json.dumps({'phase': 'standby'})), \
             patch.object(collector, 'run', side_effect=sql), \
             patch.object(collector, 'state', side_effect=lambda name: dict(values)), \
             patch.object(collector, 'loopback', return_value=True), \
             patch.object(collector.shutil, 'disk_usage', return_value=type('Disk', (), {'free': 10*1024**3, 'total': 100*1024**3})()):
            config = {'previewGameSchema': 'migration_game_preview_abcdef123456'}
            result = collector.collect(config)
            self.assertTrue(all(item['healthy'] for item in result['components'].values()))
            values['pendingFailures'] = ['a'*64]
            values['healthy'] = False
            values['lastSuccessfulTick'] = '2000-01-01T00:00:00Z'
            result = collector.collect(config)
            for item in ['workers', 'email', 'notifications', 'payments']:
                self.assertFalse(result['components'][item]['healthy'])
            self.assertNotIn('a'*64, json.dumps(result))
            with patch.object(collector, 'run', side_effect=RuntimeError('private SQL')):
                result = collector.collect(config)
                self.assertFalse(result['components']['database']['healthy'])
                self.assertNotIn('private', json.dumps(result))

    def test_backup_includes_both_installed_targets_and_fence(self):
        preview = ['migration_auth_preview_abcdef123456', 'migration_game_preview_abcdef123456']
        self.assertEqual(backup.validate_schemas(backup.PERMANENT), sorted(backup.PERMANENT))
        self.assertEqual(len(backup.validate_schemas(preview + backup.PERMANENT)), 5)
        for bad in [backup.PERMANENT + ['public'], preview + ['migration_game_live'], backup.PERMANENT * 2]:
            with self.assertRaises(ValueError):
                backup.validate_schemas(bad)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            auth, game, control = [root/name for name in ['auth', 'game', 'activation']]
            auth.write_text(json.dumps({'schema': preview[0]}))
            game.write_text(json.dumps({'schema': preview[1], 'authSchema': preview[0]}))
            with patch.object(backup, 'CONFIGS', [auth, game]), patch.object(backup, 'CONTROL', control):
                self.assertEqual(backup.installed_schemas()[0], preview)
                control.write_text(json.dumps({'version': 1, 'phase': 'standby'}))
                self.assertEqual(len(backup.installed_schemas()[0]), 5)
                control.write_text(json.dumps({'version': 1, 'phase': 'wrong'}))
                with self.assertRaises(RuntimeError):
                    backup.installed_schemas()


if __name__ == '__main__':
    unittest.main()
