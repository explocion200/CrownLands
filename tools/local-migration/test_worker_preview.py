import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from pathlib import Path
import tempfile
import install_worker_preview as worker


class WorkerInstallerTests(unittest.TestCase):
    def test_private_preparation_directory_can_be_traversed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); app = root / "app"; config = root / "config"
            app.mkdir(mode=0o700); config.mkdir(mode=0o700)
            worker.make_app_traversable(app)
            self.assertEqual(app.stat().st_mode & 0o777, 0o755)
            self.assertEqual(config.stat().st_mode & 0o777, 0o700)
            link = root / "link"; link.symlink_to(config)
            with self.assertRaises(RuntimeError):
                worker.make_app_traversable(link)

    def test_grants_only_private_game(self):
        schema = "migration_game_preview_012345abcdef"
        sql = worker.grants(schema)
        self.assertIn("GRANT UPDATE(dispatched_at)", sql)
        self.assertIn("NOSUPERUSER NOCREATEDB NOCREATEROLE", sql)
        self.assertNotIn("GRANT CREATE", sql)
        self.assertNotIn("ALL TABLES", sql)
        self.assertNotIn("auth_sessions", sql)
        self.assertNotIn("accounts", sql)
        self.assertNotIn("GRANT DELETE ON", sql)
        for bad in ["public", "migration_20261015", schema + ";SELECT 1", "migration_game_preview_short"]:
            with self.assertRaises(RuntimeError):
                worker.grants(bad)

    def test_health_requires_fresh_restart_and_no_failures(self):
        now = 2000000000
        with patch.object(worker.time, "time", return_value=now):
            good = {"rehearsal": True, "stopped": False, "lastSuccessfulTick": datetime.fromtimestamp(now-1, timezone.utc).isoformat(),
                    "operationalFailures": 0, "jobs": {"dead": 0}, "handlerLogs": {"counts": {"error": 0}}}
            self.assertTrue(worker.healthy(good, now-2))
            self.assertFalse(worker.healthy(good, now))
            for bad in [{}, {**good, "stopped": True}, {**good, "operationalFailures": 1}, {**good, "jobs": {"dead": 1}},
                        {**good, "handlerLogs": {"counts": {"error": 1}}}, {**good, "lastSuccessfulTick": None}]:
                self.assertFalse(worker.healthy(bad, now-2))


if __name__ == "__main__":
    unittest.main()
