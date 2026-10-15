#!/usr/bin/env python3
"""Explicit integration test against the isolated local rehearsal database."""
import importlib.util
import json
from pathlib import Path
import tempfile
import uuid

spec = importlib.util.spec_from_file_location("rehearsal", Path(__file__).with_name("import_rehearsal.py"))
rehearsal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rehearsal)
snapshot = rehearsal.snapshot


def main():
    schema = "migration_test_" + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix="crownlands-postgres-test-") as temp:
        directory = Path(temp)
        docs = [
            {"name": snapshot.ROOT + "/parents/missing/children/fixture", "fields": {
                "large": {"integerValue": "9223372036854775807"}, "small": {"integerValue": "-9223372036854775808"},
                "bytes": {"bytesValue": "AAH/"}, "nan": {"doubleValue": "NaN"},
                "stamp": {"timestampValue": "2026-10-01T00:00:00.123456789Z"},
                "text": {"stringValue": "Unicode 🔑 and COPY escapes: \\N\t\n\\."}},
                "createTime": "2026-10-01T00:00:00Z", "updateTime": "2026-10-01T00:00:00Z"},
            {"name": snapshot.ROOT + "/realmConfig/current", "fields": {
                "worldId": {"stringValue": "fixture-world"}, "resetGeneration": {"stringValue": "fixture-reset"},
                "sharedRealmId": {"stringValue": "fixture-shard"}},
                "createTime": "2026-10-01T00:00:00Z", "updateTime": "2026-10-01T00:00:00Z"}]
        users = [{"localId": "synthetic-only", "emailVerified": True, "passwordHash": "synthetic-not-real",
                  "providerUserInfo": [{"providerId": "google.com", "rawId": "fixture-subject"}]}]
        files = {}
        for name, value in (("documents-000000.json", docs), ("auth-users.json", users)):
            raw = snapshot.encode(value)
            snapshot.atomic_private(directory / name, raw)
            files[name] = {"file": name, "sha256": snapshot.checksum(raw), "bytes": len(raw)}
        manifest = {"schemaVersion": 1, "project": snapshot.PROJECT, "readTime": "2026-10-15T00:00:00Z",
                    "firestoreComplete": True, "authComplete": True, "expectedDocuments": 2, "exportedDocuments": 2,
                    "authAccounts": 1, "pages": [{**files["documents-000000.json"], "documents": 2}],
                    "privateFiles": {"auth-users": files["auth-users.json"]}}
        snapshot.atomic_private(directory / "manifest.json", snapshot.encode(manifest))
        try:
            receipt = rehearsal.import_snapshot(directory, schema)
            assert receipt["documents"] == 2 and receipt["accounts"] == 1
            actual = json.loads(rehearsal.sql("SELECT body FROM " + schema + ".documents WHERE path='parents/missing/children/fixture';"))
            assert actual == docs[0], "Typed data changed during import"
            try:
                rehearsal.import_snapshot(directory, schema)
                raise AssertionError("Existing schema was overwritten")
            except ValueError as error:
                assert "already exists" in str(error)
            restored = rehearsal.restore_rehearsal(directory, schema)
            assert restored["restoreVerified"]
            print("PostgreSQL synthetic import, typed-value preservation, overwrite refusal and complete dump/restore comparison passed.")
        finally:
            # Only explicitly generated synthetic schemas from this invocation.
            rehearsal.sql("DROP SCHEMA IF EXISTS " + schema + " CASCADE; DROP SCHEMA IF EXISTS " + schema + "_before_restore CASCADE;")


if __name__ == "__main__":
    main()
