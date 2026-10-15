import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import install_push_preview as push


class PushInstallerTests(unittest.TestCase):
    def fixture(self, client):
        config = {'schema': 'migration_game_preview_012345abcdef', 'ownerUid': 'fixture', 'notBefore': int(push.time.time()*1000),
                  'expiresAt': (datetime.now(timezone.utc)+timedelta(hours=2)).isoformat(), 'attemptLimit': 5,
                  'publicKey': 'a'*87, 'reservationId': 'b'*32}
        game = {**{key: config[key] for key in ['schema', 'ownerUid', 'expiresAt']}, 'origin': 'https://playcrownlands.com'}
        for name in push.CLIENT_FILES[:2] + ['local-preview.js']:
            (client / name).write_text('original ' + name)
        manifest = {'role': push.ROLE, 'commit': 'a'*40, 'clientBefore': {name: hashlib.sha256((client/name).read_bytes()).hexdigest() if (client/name).exists() else None for name in push.CLIENT_FILES},
                    'gameConfigHash': hashlib.sha256(json.dumps(game).encode()).hexdigest()}
        return config, game, manifest

    def test_validate_and_rollback_client(self):
        with tempfile.TemporaryDirectory() as folder:
            client = Path(folder)/'client'; client.mkdir(); backup = Path(folder)/'backup'; backup.mkdir()
            config, game, manifest = self.fixture(client)
            push.validate(config, game, manifest, client)
            for patch_value in [{'schema': 'public'}, {'attemptLimit': 6}, {'ownerUid': 'different'}, {'expiresAt': '2000-01-01T00:00:00Z'}]:
                with self.assertRaises(RuntimeError):
                    push.validate({**config, **patch_value}, game, manifest, client)
            for name, original in manifest['clientBefore'].items():
                if original is not None:
                    push.shutil.copy2(client/name, backup/name)
                (client/name).write_text('new')
            with self.assertRaises(RuntimeError):
                push.validate(config, game, manifest, client)
            with patch.object(push, 'CLIENT', client):
                push.restore_client(backup, manifest)
            push.validate(config, game, manifest, client)
            self.assertFalse((client/'local-push-worker.js').exists())

    def test_runtime_modes_and_grants(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); bundle = root/'bundle'; bundle.mkdir(); (bundle/'app').mkdir(mode=0o700)
            (bundle/'app'/'program.js').write_text('fixture'); (bundle/'node').write_text('fixture')
            previous = os.umask(0o077)
            try:
                with patch.object(push, 'APP', root/'installed'):
                    push.copy_runtime(bundle)
            finally:
                os.umask(previous)
            self.assertEqual((root/'installed'/'app').stat().st_mode & 0o777, 0o755)
            self.assertEqual((root/'installed'/'app'/'program.js').stat().st_mode & 0o777, 0o644)
            self.assertEqual((root/'installed'/'node').stat().st_mode & 0o777, 0o755)
        grants = push.grants('migration_game_preview_012345abcdef')
        for denied in ['accounts', 'auth_sessions', 'GRANT CREATE', 'work_jobs', 'ALL TABLES']:
            self.assertNotIn(denied, grants)
        with self.assertRaises(RuntimeError):
            push.grants('public;select 1')

    def test_health(self):
        now = push.time.time()
        good = {'rehearsal': True, 'healthy': True, 'stopped': False, 'attempts': 0, 'operationalFailures': 0,
                'lastSuccessfulTick': datetime.fromtimestamp(now-1, timezone.utc).isoformat()}
        self.assertTrue(push.healthy(good, now-2))
        for value in [{}, {**good, 'attempts': 1}, {**good, 'healthy': False}, {**good, 'stopped': True}, {**good, 'operationalFailures': 1}]:
            self.assertFalse(push.healthy(value, now-2))


if __name__ == '__main__':
    unittest.main()
