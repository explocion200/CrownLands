import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import install_database_backup as installer


class BackupInstallerTests(unittest.TestCase):
    def test_preserve_host_backup_and_propagate_database_failure(self):
        original = "def main():\n    if True:\n" + installer.MARKER + "        restic('existing encrypted destination')\n"
        updated = installer.updated_program(original)
        self.assertIn(original.splitlines()[-1], updated)
        self.assertEqual(updated.count("postgres_backup.py"), 1)
        self.assertLess(updated.index("postgres_backup.py"), updated.index("restic("))
        for changed in [updated, original + installer.MARKER, "unexpected backup source"]:
            with self.assertRaises(RuntimeError):
                installer.updated_program(changed)

    def test_add_sources_without_changing_existing_lines(self):
        original = "# custom source\n/srv/crownlands\n/important-existing-data\n/etc/postgresql\n"
        updated = installer.updated_sources(original)
        self.assertTrue(updated.startswith(original))
        self.assertEqual(updated.count("/etc/postgresql\n"), 1)
        self.assertEqual(installer.updated_sources(updated), updated)

    def test_restore_as_restricted_owner_and_preserve_failed_copy(self):
        class FixtureModule:
            SOCKET = "/var/run/postgresql"
            def verify_archive(self, stage):
                return {"schemas": [], "tables": [{"rows": 2}], "sha256": "synthetic-checksum"}
            def query(self, statement, **kwargs):
                return "project-server" if "pg_get_userbyid" in statement else "f"
            def connection(self, target):
                return ["-h", self.SOCKET, "-d", target]
            def fingerprints(self, *args, **kwargs):
                return [{"rows": 2}]
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp); (stage / "database.dump").write_bytes(b"synthetic archive")
            calls = []
            with patch.object(installer, "command", side_effect=lambda args, **kwargs: calls.append(args)):
                receipt = installer.verify_restore(FixtureModule(), stage)
                self.assertTrue(receipt["allRowsCompared"])
                restore = next(call for call in calls if "pg_restore" in call)
                self.assertEqual(restore[:4], ["runuser", "-u", "project-server", "--"])
                self.assertTrue(any("dropdb" in call for call in calls))
            calls.clear(); broken = FixtureModule(); broken.fingerprints = lambda *args, **kwargs: []
            with patch.object(installer, "command", side_effect=lambda args, **kwargs: calls.append(args)):
                with self.assertRaises(RuntimeError):
                    installer.verify_restore(broken, stage)
            self.assertFalse(any("dropdb" in call for call in calls))
            self.assertRegex((stage / "failed-restore-target.txt").read_text(), r"^crownlands_restore_check_[a-f0-9]{12}\n$")
            self.assertEqual(json.loads((stage / "restore-check.json").read_text())["rows"], 2)


if __name__ == "__main__":
    unittest.main()
