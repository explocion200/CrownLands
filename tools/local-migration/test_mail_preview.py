import json
import os
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import install_mail_preview as mail


class MailInstallerTests(unittest.TestCase):
    def test_runtime_traversable_under_actual_private_umask(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); bundle = root / 'bundle'; bundle.mkdir()
            (bundle / 'app').mkdir(mode=0o700)
            (bundle / 'app' / 'nested').mkdir(mode=0o700)
            (bundle / 'app' / 'nested' / 'program.js').write_text('synthetic')
            (bundle / 'node').write_text('synthetic')
            private = root / 'credentials'; private.mkdir(mode=0o700)
            app = root / 'installed'
            previous = os.umask(0o077)
            try:
                with patch.object(mail, 'APP', app):
                    mail.copy_runtime(bundle)
            finally:
                os.umask(previous)
            for folder in [app, app / 'app', app / 'app' / 'nested']:
                self.assertEqual(folder.stat().st_mode & 0o777, 0o755)
            self.assertEqual((app / 'node').stat().st_mode & 0o777, 0o755)
            self.assertEqual((app / 'app' / 'nested' / 'program.js').stat().st_mode & 0o777, 0o644)
            self.assertEqual(private.stat().st_mode & 0o777, 0o700)

    def config(self):
        config = {'schema': 'migration_auth_preview_012345abcdef', 'expiresAt': (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(), 'allowedRecipients': ['fixture@example.test']}
        auth = {'schema': config['schema'], 'expiresAt': config['expiresAt'], 'origin': 'https://playcrownlands.com', 'allowEmailActionTest': True}
        return config, auth, {'role': mail.ROLE, 'commit': 'a' * 40}

    def test_grants_and_changed_config(self):
        config, auth, manifest = self.config()
        mail.validate(config, auth, auth, manifest)
        sql = mail.grants(config['schema'])
        self.assertIn('UPDATE(status,action_url)', sql)
        self.assertIn('SELECT(uid,token_hash,purpose,expires_at)', sql)
        for forbidden in ['GRANT CREATE', '.accounts ', '.auth_sessions ', 'GRANT DELETE', 'ALL TABLES']:
            self.assertNotIn(forbidden, sql)
        for schema in ['public', 'migration_20261015', config['schema'] + ';SELECT 1']:
            with self.assertRaises(RuntimeError):
                mail.grants(schema)
        with self.assertRaises(RuntimeError):
            mail.validate(config, auth, {**auth, 'allowEmailActionTest': False}, manifest)
        for bad in [{**config, 'allowedRecipients': []}, {**config, 'expiresAt': '2000-01-01T00:00:00Z'}, {**config, 'schema': 'public'}]:
            with self.assertRaises(RuntimeError):
                mail.validate(bad, auth, auth, manifest)

    def test_health(self):
        now = 2000000000
        good = {'rehearsal': True, 'healthy': True, 'stopped': False, 'operationalFailures': 0,
                'lastSuccessfulTick': datetime.fromtimestamp(now-1, timezone.utc).isoformat(), 'queue': {'pending': 0, 'failed': 0}}
        with patch.object(mail.time, 'time', return_value=now):
            self.assertTrue(mail.healthy(good, now-2))
            self.assertFalse(mail.healthy(good, now))
            for bad in [{}, {**good, 'healthy': False}, {**good, 'operationalFailures': 1}, {**good, 'queue': {'pending': 1, 'failed': 0}}]:
                self.assertFalse(mail.healthy(bad, now-2))

    def test_restart_failure_removes_only_new_service(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); bundle = root / 'bundle'; bundle.mkdir()
            config, auth, manifest = self.config()
            for name, value in [('config.json', config), ('expected-auth.json', auth), ('manifest.json', manifest)]:
                (bundle / name).write_text(json.dumps(value))
            (bundle / 'app').mkdir(mode=0o700); (bundle / 'app' / 'fixture.js').write_text('fixture')
            (bundle / 'resend-api-key').write_text('synthetic'); (bundle / 'node').write_text('fixture')
            (bundle / mail.UNIT).write_text('fixture')
            sources = root / 'sources.txt'; sources.write_text('/existing/source\n')
            paths = {name: root / name for name in ['APP', 'CONF', 'STATE', 'UNIT_FILE']}
            commands = []; statements = []
            original_read = Path.read_text; original_mkdir = Path.mkdir; original_open = open
            def read(p, *a, **k):
                if str(p) == '/etc/crownlands-auth-rehearsal/config.json':
                    return json.dumps(auth)
                return original_read(p, *a, **k)
            def mkdir(p, *a, **k):
                if str(p).startswith('/var/backups/crownlands/mail-preview-'):
                    return original_mkdir(root / 'backup', *a, **k)
                return original_mkdir(p, *a, **k)
            original_write = Path.write_text
            def write(p, data, *a, **k):
                if str(p).startswith('/var/backups/crownlands/mail-preview-'):
                    return original_write(root / 'backup' / p.name, data, *a, **k)
                return original_write(p, data, *a, **k)
            def open_lock(p, *a, **k):
                return original_open(root / 'lock' if p == '/run/lock/crownlands-backup.lock' else p, *a, **k)
            def sql(statement):
                statements.append(statement)
                if 'bool_and' in statement:
                    return 't'
                return '0'
            with patch.multiple(mail, **paths, SOURCES=sources), patch.object(mail.os, 'geteuid', return_value=0), \
                 patch.object(mail.os, 'umask'), patch.object(mail, 'run', side_effect=lambda args: commands.append(args)), \
                 patch.object(mail, 'sql', side_effect=sql), patch.object(mail.subprocess, 'run', return_value=SimpleNamespace(returncode=2)), \
                 patch.object(mail, 'start_and_verify', side_effect=RuntimeError('synthetic restart failure')), \
                 patch.object(Path, 'read_text', read), patch.object(Path, 'write_text', write), patch.object(Path, 'mkdir', mkdir), \
                 patch('builtins.open', open_lock):
                with self.assertRaisesRegex(RuntimeError, 'restart failure'):
                    mail.install(bundle)
            for item in paths.values():
                self.assertFalse(item.exists())
            self.assertEqual(sources.read_text(), '/existing/source\n')
            self.assertTrue(any('DROP OWNED BY' in statement for statement in statements))
            self.assertIn(['userdel', mail.ROLE], commands)


if __name__ == '__main__':
    unittest.main()
