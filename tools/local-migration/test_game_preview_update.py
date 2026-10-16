import contextlib
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import update_game_preview as repair


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.app, self.conf, self.bundle = [self.root / name for name in ['app', 'conf', 'bundle']]
        self.conf.mkdir()
        self.bundle.mkdir()
        self.caddy = self.root / 'Caddyfile'
        self.before = 'other max_size 16KB\n\t\thandle /api/local-game/* {\n max_size 256KB\n}\n\t\thandle /local-auth/* {\n max_size 16KB\n}\n'
        self.caddy.write_text(self.before)
        (self.conf / 'manifest.json').write_text('{"commit":"fixture"}')
        self.manifest = {'installedManifestHash': repair.digest((self.conf / 'manifest.json').read_bytes()), 'caddyBeforeHash': repair.digest(self.before.encode()), 'files': {}}
        after = repair.repair_caddy(self.before)
        (self.bundle / 'Caddyfile').write_text(after)
        self.manifest['caddyAfterHash'] = repair.digest(after.encode())
        for filename in repair.FILES:
            for parent, content in [(self.app, b'old fixture'), (self.bundle, b'new fixture')]:
                target = parent / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            self.manifest['files'][filename] = {'before': repair.digest(b'old fixture'), 'after': repair.digest(b'new fixture')}
        self.save_manifest()
        self.patches = [patch.object(repair, key, value) for key, value in {'APP': self.app, 'CONF': self.conf, 'CADDY': self.caddy, 'BACKUPS': self.root / 'backups'}.items()]
        self.patches += [patch.object(repair.os, 'geteuid', return_value=0), patch.object(repair.subprocess, 'run', return_value=SimpleNamespace(returncode=0))]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def save_manifest(self):
        (self.bundle / 'manifest.json').write_text(json.dumps(self.manifest))

    def test_scoped_route_and_install(self):
        self.assertEqual(repair.repair_caddy(self.before).count('max_size 16KB'), 2)
        self.assertEqual(repair.repair_caddy(repair.repair_caddy(self.before)), repair.repair_caddy(self.before))
        with patch.object(repair, 'run', return_value=''), contextlib.redirect_stdout(io.StringIO()):
            repair.install(self.bundle)
        for filename in repair.FILES:
            self.assertEqual((self.app / filename).read_bytes(), b'new fixture')
        self.assertEqual(self.caddy.read_text(), repair.repair_caddy(self.before))
        self.assertTrue((self.conf / 'repair.json').exists())

    def test_refuse_changed_runtime(self):
        (self.app / repair.FILES[0]).write_bytes(b'other update')
        with patch.object(repair, 'run') as command, self.assertRaisesRegex(RuntimeError, 'runtime changed'):
            repair.install(self.bundle)
        command.assert_not_called()
        self.assertEqual(self.caddy.read_text(), self.before)

    def test_refuse_extra_route(self):
        data = repair.repair_caddy(self.before) + '\npublic-extra-route\n'
        (self.bundle / 'Caddyfile').write_text(data)
        self.manifest['caddyAfterHash'] = repair.digest(data.encode())
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, 'Unexpected route'):
            repair.install(self.bundle)

    def test_failed_reload_restores_runtime_and_routes(self):
        def command(args):
            if args == ['systemctl', 'reload', 'caddy']:
                raise RuntimeError('fixture reload failure')
            return ''
        with patch.object(repair, 'run', side_effect=command), self.assertRaisesRegex(RuntimeError, 'reload failure'):
            repair.install(self.bundle)
        self.assertEqual(self.caddy.read_text(), self.before)
        for filename in repair.FILES:
            self.assertEqual((self.app / filename).read_bytes(), b'old fixture')
        self.assertFalse((self.conf / 'repair.json').exists())


if __name__ == '__main__':
    unittest.main()
