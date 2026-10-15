import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
import update_auth_action_preview as update


class ActionPreviewTests(unittest.TestCase):
    def config(self):
        return {'schema': 'migration_auth_preview_0123456789ab', 'origin': 'https://playcrownlands.com',
                'expiresAt': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(), 'privateFixture': 'preserved'}

    def test_configuration_scope_and_expiry(self):
        original = self.config(); updated = update.updated_config(json.dumps(original))
        self.assertEqual(updated, {**original, 'allowEmailActionTest': True})
        for changed in [{**original, 'schema': 'production'}, {**original, 'origin': 'https://other.example'},
                        {**original, 'allowEmailActionTest': True}, {**original, 'expiresAt': '2000-01-01T00:00:00Z'}]:
            with self.assertRaises(RuntimeError):
                update.updated_config(json.dumps(changed))

    def test_failed_restart_restores_source_config_and_privileges(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); app = root / 'app'; conf = root / 'conf'; bundle = root / 'bundle'; backups = root / 'backups'
            for path in [app, conf, bundle, backups]:
                path.mkdir()
            before = json.dumps(self.config()).encode(); (conf / 'config.json').write_bytes(before)
            manifest = {'configBefore': update.digest(before), 'files': {}}
            for filename in update.FILES:
                (app / filename).write_text('original'); (bundle / filename).write_text('replacement')
                manifest['files'][filename] = {'before': update.digest(b'original'), 'after': update.digest(b'replacement')}
            (bundle / 'manifest.json').write_text(json.dumps(manifest))
            calls = []
            def fake_run(args):
                calls.append(args)
                if args[:2] == ['systemctl', 'start']:
                    raise RuntimeError('synthetic startup failure')
                return ''
            statements = []
            def fake_sql(statement):
                statements.append(statement)
                if 'count(*)' in statement:
                    return '1'
                if 'has_table_privilege' in statement:
                    return 'f'
                return ''
            original_stat = Path.stat
            def root_stat(path, *args, **kwargs):
                result = list(original_stat(path, *args, **kwargs)); result[4] = 0
                return os.stat_result(result)
            with patch.object(update, 'APP', app), patch.object(update, 'CONF', conf), patch.object(update, 'BACKUPS', backups), \
                 patch.object(update.os, 'geteuid', return_value=0), patch.object(update, 'run', side_effect=fake_run), \
                 patch.object(update, 'sql', side_effect=fake_sql), patch.object(Path, 'stat', root_stat), \
                 patch.object(update.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as service:
                with self.assertRaisesRegex(RuntimeError, 'synthetic startup failure'):
                    update.install(bundle)
                self.assertEqual((conf / 'config.json').read_bytes(), before)
                self.assertFalse((conf / 'action-test.json').exists())
                for filename in update.FILES:
                    self.assertEqual((app / filename).read_text(), 'original')
                self.assertTrue(any(s.startswith('GRANT SELECT,DELETE ON ') for s in statements))
                self.assertTrue(any(s.startswith('REVOKE SELECT,DELETE ON ') for s in statements))
                service.assert_called_with(['systemctl', 'restart', update.UNIT], capture_output=True)
                self.assertTrue(any(backups.iterdir()))


if __name__ == '__main__':
    unittest.main()
