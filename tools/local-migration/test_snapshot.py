#!/usr/bin/env python3
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("snapshot", Path(__file__).with_name("export_snapshot.py"))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


def document(path):
    return {"name": snapshot.ROOT + "/" + path, "createTime": "2026-10-01T00:00:00Z", "updateTime": "2026-10-01T00:00:00Z",
            "fields": {"large": {"integerValue": "9223372036854775807"}, "nan": {"doubleValue": "NaN"},
                       "timestamp": {"timestampValue": "2026-10-01T00:00:00.123456789Z"}, "bytes": {"bytesValue": "AAH/"},
                       "reference": {"referenceValue": snapshot.ROOT + "/missing/parent"}}}


class Fixture:
    def __init__(self):
        self.docs = [document("parents/missing/children/one"), document("players/two")]
        self.requests = []
        self.fail_once = False

    def __call__(self, url, body=None):
        self.requests.append((url, copy.deepcopy(body)))
        if url == snapshot.BASE:
            return {"databaseEdition": "STANDARD", "pointInTimeRecoveryEnablement": "POINT_IN_TIME_RECOVERY_ENABLED"}
        if url.endswith(":runAggregationQuery"):
            return [{"result": {"aggregateFields": {"total": {"integerValue": str(len(self.docs))}}}}]
        if url.endswith(":runQuery"):
            if self.fail_once:
                self.fail_once = False
                raise ValueError("synthetic interruption")
            query = body["structuredQuery"]
            cursor = query.get("startAt", {}).get("values", [{}])[0].get("referenceValue", "")
            rows = [{"document": d, "readTime": body["readTime"]} for d in self.docs if snapshot.reference_order(d["name"]) > snapshot.reference_order(cursor)][:query["limit"]]
            return rows or [{"readTime": body["readTime"]}]
        if "/config?" in url:
            return {"signIn": {"hashConfig": {"algorithm": "SCRYPT", "signerKey": "fixture", "saltSeparator": "Bw==", "rounds": 8, "memoryCost": 14}}}
        if "accounts:batchGet" in url:
            return {"users": [{"localId": "fixture-uid", "emailVerified": False, "disabled": True,
                               "passwordHash": "fixture-hash", "salt": "fixture-salt", "customAttributes": '{"admin":false}',
                               "providerUserInfo": [{"providerId": "password"}, {"providerId": "google.com", "rawId": "provider-subject"}]}]}
        if "/defaultSupportedIdpConfigs/" in url:
            return {"enabled": True, "clientId": "fixture-client", "clientSecret": "fixture-secret"}
        raise AssertionError("Unexpected network request")


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)
        self.fixture = Fixture()
        self.page_size = snapshot.PAGE_SIZE
        snapshot.PAGE_SIZE = 1

    def tearDown(self):
        snapshot.PAGE_SIZE = self.page_size
        self.tmp.cleanup()

    def test_nested_missing_parent_and_lossless_types(self):
        result = snapshot.export_firestore(self.directory, self.fixture)
        self.assertTrue(result["firestoreComplete"])
        self.assertEqual(result["exportedDocuments"], 2)
        docs = [d for p in result["pages"] for d in json.loads((self.directory / p["file"]).read_text())]
        self.assertEqual(docs, self.fixture.docs)
        reads = [body for url, body in self.fixture.requests if url.endswith(":runQuery")]
        self.assertEqual({b["readTime"] for b in reads}, {result["readTime"]})
        self.assertTrue(all(b["structuredQuery"]["from"] == [{"allDescendants": True}] for b in reads))
        self.assertTrue(all(p.stat().st_mode & 0o077 == 0 for p in self.directory.iterdir()))

    def test_completed_snapshot_resume_makes_no_document_requests(self):
        result = snapshot.export_firestore(self.directory, self.fixture)
        self.fixture.requests.clear()
        self.assertEqual(snapshot.export_firestore(self.directory, self.fixture), result)
        self.assertEqual(self.fixture.requests, [])

    def test_explicit_post_freeze_minute_is_preserved_and_cannot_be_changed(self):
        minute = (datetime.now(timezone.utc) - timedelta(minutes=1)).replace(second=0, microsecond=0)
        value = minute.isoformat().replace("+00:00", "Z")
        result = snapshot.export_firestore(self.directory, self.fixture, read_time=value)
        self.assertEqual(result["readTime"], value)
        self.assertTrue(all(body["readTime"] == value for url, body in self.fixture.requests if url.endswith(":runQuery")))
        other = (minute - timedelta(minutes=1)).isoformat().replace("+00:00", "Z")
        with self.assertRaisesRegex(ValueError, "different read time"):
            snapshot.export_firestore(self.directory, self.fixture, read_time=other)
        for invalid in ["not-a-time", value.replace(":00Z", ":01Z"), "2999-01-01T00:00:00Z", "2000-01-01T00:00:00Z"]:
            with self.assertRaises(ValueError):
                snapshot.checked_read_time(invalid)

    def test_reference_component_order_handles_parent_prefixes(self):
        self.fixture.docs = [document("parents/p"), document("parents/p/children/a"), document("parents/p-2")]
        result = snapshot.export_firestore(self.directory, self.fixture)
        self.assertEqual(result["exportedDocuments"], 3)
        self.assertTrue(result["firestoreComplete"])

    def test_oversize_page_reduces_batch_without_skipping_documents(self):
        snapshot.PAGE_SIZE = 8
        def bounded(url, body=None):
            if url.endswith(":runQuery") and body["structuredQuery"]["limit"] > 1:
                raise snapshot.PageTooLarge("bounded fixture")
            return self.fixture(url, body)
        result = snapshot.export_firestore(self.directory, bounded)
        self.assertEqual(result["exportedDocuments"], 2)
        self.assertEqual(result["pageSize"], 1)
        self.assertTrue(result["firestoreComplete"])

    def test_interrupted_snapshot_resumes_fixed_read_time(self):
        def interrupted(url, body=None):
            if url.endswith(":runQuery") and body["structuredQuery"].get("startAt"):
                raise ValueError("stop after first page commit")
            return self.fixture(url, body)
        with self.assertRaises(ValueError):
            snapshot.export_firestore(self.directory, interrupted)
        partial = json.loads((self.directory / "manifest.json").read_text())
        self.assertEqual(partial["exportedDocuments"], 1)
        self.assertFalse(partial["firestoreComplete"])
        result = snapshot.export_firestore(self.directory, self.fixture)
        self.assertTrue(result["firestoreComplete"])
        self.assertEqual(result["exportedDocuments"], 2)
        self.assertEqual(result["readTime"], partial["readTime"])

    def test_corrupt_page_fails_on_resume(self):
        result = snapshot.export_firestore(self.directory, self.fixture)
        (self.directory / result["pages"][0]["file"]).write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "integrity"):
            snapshot.export_firestore(self.directory, self.fixture)

    def test_changed_read_time_and_repeated_cursor_rejected(self):
        read_time = "2026-10-15T11:00:00Z"
        with self.assertRaisesRegex(ValueError, "read time"):
            snapshot.query_page(lambda *args: [{"document": self.fixture.docs[0], "readTime": "2026-10-15T11:01:00Z"}], read_time)
        with self.assertRaisesRegex(ValueError, "cursor"):
            snapshot.query_page(lambda *args: [{"document": self.fixture.docs[0]}], read_time, self.fixture.docs[0]["name"])

    def test_partial_stream_error_and_wrong_project_rejected(self):
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            snapshot.query_page(lambda *args: [{"error": {"message": "private"}}], "2026-10-15T11:00:00Z")
        doc = document("players/a")
        doc["name"] = doc["name"].replace(snapshot.PROJECT, "wrong-project")
        with self.assertRaisesRegex(ValueError, "outside"):
            snapshot.query_page(lambda *args: [{"document": doc}], "2026-10-15T11:00:00Z")

    def test_auth_preserves_identity_and_hashes_privately(self):
        manifest = snapshot.export_firestore(self.directory, self.fixture)
        result = snapshot.export_auth(self.directory, self.fixture, manifest)
        self.assertEqual(result["authAccounts"], 1)
        self.assertFalse(result["authSnapshotAtomicWithFirestore"])
        users = json.loads((self.directory / "auth-users.json").read_text())
        self.assertEqual(users[0]["localId"], "fixture-uid")
        self.assertTrue(users[0]["disabled"])
        self.assertEqual(users[0]["providerUserInfo"][1]["rawId"], "provider-subject")
        snapshot.verify_files(self.directory, result)

    def test_missing_hash_and_multi_tenant_fail_closed(self):
        manifest = snapshot.export_firestore(self.directory, self.fixture)
        def no_hash(url, body=None):
            data = self.fixture(url, body)
            if "accounts:batchGet" in url:
                del data["users"][0]["passwordHash"]
            return data
        with self.assertRaisesRegex(ValueError, "hash"):
            snapshot.export_auth(self.directory, no_hash, manifest)
        def tenant(url, body=None):
            return {"multiTenant": {"allowTenants": True}}
        with self.assertRaisesRegex(ValueError, "Tenant"):
            snapshot.export_auth(self.directory, tenant, manifest)

    def test_nonprivate_and_symlink_destinations_rejected(self):
        path = self.directory / "public"
        path.mkdir(mode=0o755)
        with self.assertRaisesRegex(ValueError, "0700"):
            snapshot.private_directory(path)
        link = self.directory / "link"
        link.symlink_to(self.directory, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            snapshot.private_directory(link)


if __name__ == "__main__":
    unittest.main()
