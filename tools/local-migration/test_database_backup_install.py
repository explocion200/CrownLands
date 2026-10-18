import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import install_database_backup as installer
import postgres_backup as backup


class BackupInstallerTests(unittest.TestCase):
    def test_scope_dependency_exclusion_without_changing_credentials_or_caches(self):
        before = "# Existing policy\nnode_modules\n.cache\n/private/*password*\n/private/*key*.json\n"
        after = installer.updated_excludes(before)
        self.assertEqual(after, before.replace("node_modules", "/home/project-server/**/node_modules"))
        self.assertEqual(installer.updated_excludes(after), after)
        for invalid in ["", "node_modules\nnode_modules\n", "**/node_modules\n"]:
            with self.assertRaises(RuntimeError):
                installer.updated_excludes(invalid)

    @unittest.skipUnless(shutil.which("restic"), "Installed restic required for archive integration")
    def test_real_restic_recovers_runtime_dependencies_and_preserves_exclusions(self):
        with tempfile.TemporaryDirectory(prefix="crownlands-backup-runtime-") as temp, tempfile.TemporaryDirectory(prefix="crownlands-backup-dev-", dir=Path.home()) as dev:
            root, development = Path(temp), Path(dev)
            runtime = root / "installed-service"
            for directory in [runtime, development]:
                for relative in ["app.js", "node_modules/pg/index.js", "node_modules/pg/node_modules/helper/index.js", "credential-test.json"]:
                    target = directory / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text("synthetic fixture only")
            exclude = root / "exclude.txt"
            exclude.write_text(installer.updated_excludes("node_modules\ncredential-test.json\n", development_home=Path.home()))
            env = {**os.environ, "RESTIC_PASSWORD": secrets.token_hex(32)}
            common = ["restic", "--repo", str(root / "repository"), "--no-cache"]
            for args in [["init"], ["backup", "--exclude-file", str(exclude), str(runtime), str(development)], ["restore", "latest", "--target", str(root / "restored"), "--verify"]]:
                result = subprocess.run([*common, *args], env=env, capture_output=True, timeout=60)
                self.assertEqual(result.returncode, 0, "Synthetic encrypted backup/restore failed")
            restored = root / "restored"
            for relative in ["app.js", "node_modules/pg/index.js", "node_modules/pg/node_modules/helper/index.js"]:
                target = runtime / relative
                self.assertEqual((restored / str(target).lstrip("/")).read_bytes(), target.read_bytes())
            self.assertFalse((restored / str(development / "node_modules").lstrip("/")).exists())
            for directory in [runtime, development]:
                self.assertFalse((restored / str(directory / "credential-test.json").lstrip("/")).exists())

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
            ARCHIVE_TIMEOUT_SECONDS = backup.ARCHIVE_TIMEOUT_SECONDS
            backup_phase = staticmethod(backup.backup_phase)
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
            def command(args, **kwargs):
                calls.append(args)
                if "pg_restore" in args:
                    self.assertEqual(kwargs["timeout"], backup.ARCHIVE_TIMEOUT_SECONDS)
            with patch.object(installer, "command", side_effect=command):
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
