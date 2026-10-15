#!/usr/bin/env python3
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("freeze", Path(__file__).with_name("prepare_firebase_freeze.py"))
freeze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(freeze)


class Fixture:
    def __init__(self):
        p, n = freeze.PROJECT, freeze.NUMBER
        self.functions = [{"name": f"projects/{p}/locations/us-central1/functions/fixture{i}", "state": "ACTIVE",
                           "serviceConfig": {"service": f"projects/{p}/locations/us-central1/services/fixture{i}",
                                             "serviceAccountEmail": freeze.RUNTIME, "timeoutSeconds": 540}} for i in range(150)]
        self.jobs = [{"name": f"projects/{p}/locations/us-central1/jobs/firebase-schedule-fixture{i}", "state": "ENABLED"} for i in range(16)]
        self.key = {"name": f"projects/{n}/locations/global/keys/00000000-0000-0000-0000-000000000000", "etag": "fixture-version",
                    "restrictions": {"browserKeyRestrictions": {"allowedReferrers": ["https://playcrownlands.com/*"]},
                       "apiTargets": [{"service": s} for s in ["identitytoolkit.googleapis.com", "securetoken.googleapis.com", "firestore.googleapis.com"]]}}
        self.calls = []

    def __call__(self, url, body=None):
        self.calls.append((url, body))
        if "/functions?" in url:
            return {"functions": copy.deepcopy(self.functions)}
        if "/jobs?" in url:
            return {"jobs": copy.deepcopy(self.jobs)}
        if "/keys?" in url:
            return {"keys": [copy.deepcopy(self.key)]}
        if "/services?" in url:
            return {"services": [{"name": f["serviceConfig"]["service"]} for f in self.functions]}
        if ":getIamPolicy?" in url:
            return {"etag": "fixture-version", "bindings": [{"role": "roles/run.invoker", "members": ["allUsers", "serviceAccount:" + freeze.RUNTIME]}]}
        if "/releases/" in url:
            return {"rulesetName": f"projects/{freeze.PROJECT}/rulesets/fixture", "name": "fixture-release"}
        if "/rulesets/" in url:
            return {"source": {"files": [{"name": "firestore.rules", "content": "original"}]}}
        if "/serviceAccounts/" in url:
            return {"email": url.rsplit("/", 1)[-1], "projectId": freeze.PROJECT, "uniqueId": url.rsplit("/", 1)[-1]}
        if url.endswith(":getIamPolicy"):
            return {"etag": "old", "bindings": [{"role": f"projects/{freeze.PROJECT}/roles/crownlandsLocalTranslation",
                "members": ["serviceAccount:" + freeze.TRANSLATOR], "condition": {"expression": "fixture-expiry"}},
                {"role": "roles/firebaseauth.admin", "members": ["serviceAccount:additional-admin@example.test"]}]}
        if url.endswith(":testIamPermissions"):
            return {"permissions": [p for p in body["permissions"] if p != "iam.serviceAccounts.disable"]}
        return {"projectNumber": freeze.NUMBER, "lifecycleState": "ACTIVE"}


class FreezePlanTests(unittest.TestCase):
    def test_read_only_preserves_restrictions_and_rollback_inputs(self):
        fixture = Fixture()
        result = freeze.plan(fixture, "a" * 32)
        self.assertFalse(result["sourceFrozen"])
        self.assertEqual(result["minimumDrainSeconds"], 540)
        self.assertEqual(result["keysBefore"], [fixture.key])
        self.assertEqual(result["keysBlocked"][0]["restrictions"]["apiTargets"], [{"service": "firestore.googleapis.com"}])
        self.assertEqual(result["keysBlocked"][0]["restrictions"]["browserKeyRestrictions"], fixture.key["restrictions"]["browserKeyRestrictions"])
        self.assertIn("serviceAccount:additional-admin@example.test", result["accountAdministratorsForReview"])
        self.assertEqual(result["rulesetBefore"]["source"]["files"][0]["content"], "original")
        self.assertIn("iam.serviceAccounts.disable", result["permissionsMissing"])
        self.assertFalse(result["iamDenyAlternative"]["availableForStandaloneOwner"])
        self.assertEqual(len(result["invocationPolicies"]), 150)
        self.assertEqual(result["invocationPolicies"][0]["blocked"]["bindings"][0]["members"], ["serviceAccount:" + freeze.RUNTIME])
        self.assertTrue(all(body is None or url.endswith((":getIamPolicy", ":testIamPermissions")) for url, body in fixture.calls))
        self.assertEqual([a["email"] for a in result["writerAccountsBefore"]], freeze.WRITER_ACCOUNTS)
        self.assertNotIn(freeze.TRANSLATOR, [a["email"] for a in result["writerAccountsBefore"]])
        self.assertNotIn("denyPolicy", result)

    def test_drift_and_unknown_runtime_require_review(self):
        for change in [lambda f: f.functions.pop(), lambda f: f.functions[0]["serviceConfig"].update(serviceAccountEmail="unexpected@example.test"),
                       lambda f: f.jobs[0].update(state="UPDATE_FAILED"), lambda f: f.functions[0]["serviceConfig"].update(timeoutSeconds=3600)]:
            fixture = Fixture(); change(fixture)
            with self.assertRaises(ValueError):
                freeze.plan(fixture, "a" * 32)

    def test_keys_cannot_become_unrestricted_or_export_secrets(self):
        original = Fixture().key
        for update in [{"etag": ""}, {"keyString": "synthetic-secret"}, {"restrictions": {}},
                       {"restrictions": {"apiTargets": [{"service": "identitytoolkit.googleapis.com"}]}},
                       {"restrictions": {"apiTargets": [{"service": "*"}]}}]:
            with self.assertRaises(ValueError):
                freeze.blocked_key({**original, **update})

    def test_pagination_failures_never_silently_omit_resources(self):
        for page in [{"unreachable": ["region"]}, {"items": [{"name": "same"}, {"name": "same"}]}, {"nextPageToken": "repeated"}]:
            with self.assertRaises(ValueError):
                freeze.listed(lambda url: page, "https://example.test/?pageSize=1", "items")

    def test_public_invocation_requires_exact_supported_iam_policy(self):
        with self.assertRaises(ValueError):
            freeze.block_public_invocation({"bindings": []})
        with self.assertRaises(ValueError):
            freeze.block_public_invocation({"etag": "v", "bindings": [{"role": "customRole", "members": ["allUsers"]}]})
        policy = {"etag": "v", "version": 3, "bindings": [{"role": "roles/run.invoker", "members": ["allAuthenticatedUsers"]}]}
        self.assertEqual(freeze.block_public_invocation(policy)["bindings"], [])
        self.assertEqual(policy["bindings"][0]["members"], ["allAuthenticatedUsers"])

    def test_reader_rejects_mutations_and_credential_redirect_destinations(self):
        reader = object.__new__(freeze.Reader); reader.token = "fixture"
        with patch("urllib.request.build_opener", side_effect=AssertionError("No request should be sent")):
            for url, body in [("https://evil.example/", None), ("http://iam.googleapis.com/", None),
                              ("https://iam.googleapis.com:443/", None), ("https://iam.googleapis.com/v1/serviceAccounts/x:disable", {})]:
                with self.assertRaises(ValueError):
                    reader(url, body)


if __name__ == "__main__":
    unittest.main()
