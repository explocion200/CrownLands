import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import update_translation_preview as update


class TranslationUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.app, self.conf, self.bundle = [root / name for name in ['app', 'conf', 'bundle']]
        self.conf.mkdir()
        self.bundle.mkdir()
        self.unit, self.caddy = root / 'service', root / 'Caddyfile'
        self.unit_before = b'[Unit]\n[Service]\nLoadCredential=secrets:/etc/private/secrets\n'
        self.unit.write_bytes(self.unit_before)
        self.caddy.write_text('unchanged routing')
        config = {'schema': 'migration_game_preview_0123456789ab', 'ownerUid': 'synthetic-owner', 'expiresAt': '2026-10-17T13:00:00Z'}
        self.before = json.dumps(config).encode()
        (self.conf / 'config.json').write_bytes(self.before)
        scope = {'version': 1, 'projectId': update.PROJECT, 'clientEmail': update.ACCOUNT, **config,
                 'reservationId': 'a' * 32, 'month': '2026-10', 'characterLimit': 1000}
        self.manifest = {'scope': scope, 'files': {}, 'configBeforeHash': update.digest(self.before),
                         'unitBeforeHash': update.digest(self.unit_before), 'caddyHash': update.digest(self.caddy.read_bytes())}
        for name in update.FILES:
            target = self.bundle / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'new fixture')
            old = self.app / name
            old.parent.mkdir(parents=True, exist_ok=True)
            exists = not name.endswith('chat-translation-rehearsal.js')
            if exists:
                old.write_bytes(b'old fixture')
                old.chmod(0o640)
            self.manifest['files'][name] = {'before': update.digest(b'old fixture') if exists else None, 'after': update.digest(b'new fixture')}
        for name, content in [('manifest.json', self.manifest), ('scope.json', scope), ('source-reservation.json', scope),
            ('translation.json', {'scope': scope, 'serviceAccount': {'type': 'service_account', 'project_id': update.PROJECT, 'client_email': update.ACCOUNT}})]:
            target = self.bundle / name
            target.write_text(json.dumps(content))
            target.chmod(0o600)
        self.patches = [patch.object(update, key, value) for key, value in {'APP': self.app, 'CONF': self.conf, 'UNIT': self.unit,
            'CADDY': self.caddy, 'BACKUPS': root / 'backups'}.items()]
        self.patches += [patch.object(update.os, 'geteuid', return_value=0)]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def test_install_and_restart_without_public_route_changes(self):
        with patch.object(update, 'run', return_value='') as command, patch.object(update, 'healthy') as health, contextlib.redirect_stdout(io.StringIO()):
            update.install(self.bundle)
        self.assertEqual(health.call_count, 2)
        self.assertIn(['systemctl', 'restart', update.SERVICE], [item.args[0] for item in command.call_args_list])
        self.assertEqual(self.caddy.read_text(), 'unchanged routing')
        self.assertTrue(json.loads((self.conf / 'config.json').read_bytes())['allowTranslationTest'])
        self.assertEqual((self.conf / 'translation.json').stat().st_mode & 0o777, 0o600)
        self.assertTrue((self.conf / 'translation-repair.json').exists())
        with self.assertRaisesRegex(RuntimeError, 'already installed'):
            update.check(self.bundle)

    def test_failure_restores_files_config_and_unit(self):
        with patch.object(update, 'run', return_value=''), patch.object(update.subprocess, 'run'), patch.object(update, 'healthy', side_effect=RuntimeError('synthetic startup failure')):
            with self.assertRaisesRegex(RuntimeError, 'startup failure'):
                update.install(self.bundle)
        self.assertEqual((self.conf / 'config.json').read_bytes(), self.before)
        self.assertEqual(self.unit.read_bytes(), self.unit_before)
        self.assertFalse((self.conf / 'translation.json').exists())
        self.assertFalse((self.conf / 'translation-repair.json').exists())
        for name in update.FILES:
            if name.endswith('chat-translation-rehearsal.js'):
                self.assertFalse((self.app / name).exists())
            else:
                self.assertEqual((self.app / name).read_bytes(), b'old fixture')
                self.assertEqual((self.app / name).stat().st_mode & 0o777, 0o640)

    def test_configuration_drift_is_preserved(self):
        self.caddy.write_text('unrelated change')
        with patch.object(update, 'run') as command, self.assertRaisesRegex(RuntimeError, 'configuration changed'):
            update.install(self.bundle)
        command.assert_not_called()
        self.assertEqual(self.caddy.read_text(), 'unrelated change')

    def test_refuse_credential_scope_and_permissions(self):
        target = self.bundle / 'translation.json'
        data = json.loads(target.read_bytes())
        data['scope']['ownerUid'] = 'another-owner'
        target.write_text(json.dumps(data))
        with self.assertRaisesRegex(RuntimeError, 'scope changed'):
            update.check(self.bundle)
        target.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, 'Private translation credential'):
            update.check(self.bundle)

    def test_refuse_tampering_and_missing_approval_receipt(self):
        (self.bundle / update.FILES[0]).write_text('tampered')
        with self.assertRaisesRegex(RuntimeError, 'checksum'):
            update.check(self.bundle)
        (self.bundle / 'source-reservation.json').unlink()
        with self.assertRaises(FileNotFoundError):
            update.check(self.bundle)


if __name__ == '__main__':
    unittest.main()
