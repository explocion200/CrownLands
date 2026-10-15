import copy
from datetime import datetime, timezone, timedelta
import unittest
from unittest.mock import patch

import firebase_transfer_controls as controls
import prepare_firebase_freeze as freeze
from test_firebase_freeze_plan import Fixture


class Cloud:
    def __init__(self, plan, journal):
        self.plan, self.journal = plan, journal
        self.resources, self.calls = {}, []
        self.fail_after = self.fail_before = None
        for job in plan["jobsBefore"]:
            self.resources["https://cloudscheduler.googleapis.com/v1/" + job["name"]] = copy.deepcopy(job)
        for key in plan["keysBefore"]:
            self.resources["https://apikeys.googleapis.com/v2/" + key["name"]] = copy.deepcopy(key)
        for item in plan["invocationPolicies"]:
            self.resources["https://run.googleapis.com/v2/" + item["name"] + ":getIamPolicy?options.requestedPolicyVersion=3"] = copy.deepcopy(item["before"])
        self.resources["https://firebaserules.googleapis.com/v1/" + plan["rulesReleaseBefore"]["name"]] = copy.deepcopy(plan["rulesReleaseBefore"])
        for account in plan["writerAccountsBefore"]:
            self.resources["https://iam.googleapis.com/v1/projects/" + freeze.PROJECT + "/serviceAccounts/" + account["email"]] = copy.deepcopy(account)

    def reader(self, url, body=None):
        assert url.endswith(":getIamPolicy")
        return copy.deepcopy(self.plan["iamBefore"])

    def read(self, url):
        if "/operations/" in url:
            return {"done": True}
        return copy.deepcopy(self.resources[url])

    def mutate(self, method, url, body):
        # Every request must already have durable intent, including inverses.
        assert self.journal.get("controls") or self.journal.get("rulesetSubmittedAt")
        self.calls.append((method, url, copy.deepcopy(body)))
        if self.fail_before == len(self.calls):
            raise ValueError("Synthetic ambiguous request before acceptance")
        response = {}
        if url.endswith(":pause") or url.endswith(":resume"):
            self.resources[url.rsplit(":", 1)[0]]["state"] = "PAUSED" if url.endswith(":pause") else "ENABLED"
        elif url.endswith("?updateMask=restrictions"):
            key = self.resources[url.split("?")[0]]
            assert key["etag"] == body["etag"]
            key.update(restrictions=copy.deepcopy(body["restrictions"]), etag="next")
            response = {"name": "operations/key_fixture", "done": True}
        elif url.endswith("/rulesets"):
            response = {"name": "projects/" + freeze.PROJECT + "/rulesets/new-fixture"}
        elif "/releases/" in url:
            self.resources[url] = copy.deepcopy(body["release"])
        elif url.endswith(":setIamPolicy"):
            key = url.removesuffix(":setIamPolicy") + ":getIamPolicy?options.requestedPolicyVersion=3"
            assert self.resources[key]["etag"] == body["policy"]["etag"]
            self.resources[key] = {**copy.deepcopy(body["policy"]), "etag": "new-iam"}
        elif url.endswith(":disable") or url.endswith(":enable"):
            self.resources[url.rsplit(":", 1)[0]]["disabled"] = url.endswith(":disable")
        else:
            raise AssertionError("Unmodeled operation")
        if self.fail_after == len(self.calls):
            raise ValueError("Synthetic acknowledgement loss after acceptance")
        return response


def setup():
    fixture = Fixture()
    fixture.jobs[-1]["state"] = "PAUSED"
    plan = freeze.plan(fixture, "a" * 32)
    plan["permissionsMissing"] = []
    plan["rulesReleaseBefore"]["name"] = "projects/" + freeze.PROJECT + "/releases/cloud.firestore"
    plan["accountAdministratorsForReview"] = ["user:RicMontalvan@gmail.com", "serviceAccount:" + freeze.NUMBER + "@cloudservices.gserviceaccount.com"] + ["serviceAccount:" + a for a in freeze.WRITER_ACCOUNTS]
    journal = {"planSha256": freeze.digest(plan), "controls": {}}
    cloud = Cloud(plan, journal)
    saved = []
    controller = controls.Controls(plan, cloud, journal, lambda value: saved.append(value), lambda: None)
    return controller, cloud, journal, saved


class SourceControlTests(unittest.TestCase):
    def test_complete_pause_drain_fence_and_exact_rollback(self):
        controller, cloud, journal, saved = setup()
        original = copy.deepcopy(cloud.resources)
        controller.close()
        self.assertEqual(len(journal["controls"]), 168)  # 16 schedules, key, rules, 150 services
        self.assertEqual(len(cloud.calls), 168)  # One pre-paused schedule, one new ruleset
        self.assertTrue(saved)
        with self.assertRaises(ValueError):
            controller.fence()
        self.assertFalse(any(url.endswith(":disable") for _, url, _ in cloud.calls))
        journal["closedAt"] = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat()
        controller.fence()
        self.assertEqual(len(journal["controls"]), 171)
        self.assertFalse(journal["sourceFrozen"], "Control-plane changes alone cannot prove quiescence")
        self.assertTrue(all(cloud.read(url)["disabled"] for url in cloud.resources if "/serviceAccounts/" in url))
        controller.rollback()
        for url, value in original.items():
            if "/serviceAccounts/" in url:
                kind = "account"
            elif "/services/" in url:
                kind = "invoker"
            elif "/jobs/" in url:
                kind = "job"
            elif "/keys/" in url:
                kind = "key"
            else:
                kind = "rules"
            self.assertEqual(controls.normalized(kind, cloud.resources[url]), controls.normalized(kind, value))
        self.assertFalse(any(cloud.plan["jobsBefore"][-1]["name"] + ":resume" in url for _, url, _ in cloud.calls))
        self.assertFalse(any("translation" in url or "monitoring" in url or "storage" in url for _, url, _ in cloud.calls))
        self.assertFalse(any("setIamPolicy" in url and "cloudresourcemanager" in url for _, url, _ in cloud.calls))
        with self.assertRaises(ValueError):
            controller.close()

    def test_lost_acknowledgement_is_read_back_without_duplicate_mutation(self):
        controller, cloud, journal, _ = setup()
        cloud.fail_after = 4
        with self.assertRaises(ValueError):
            controller.close()
        self.assertEqual(list(journal["controls"].values())[-1]["status"], "submitted")
        cloud.fail_after = None
        controller.close()
        self.assertEqual(len(cloud.calls), 168)
        controller.rollback()

    def test_unknown_request_and_concurrent_changes_never_overwritten(self):
        controller, cloud, journal, _ = setup()
        cloud.fail_before = 4
        with self.assertRaises(ValueError):
            controller.close()
        cloud.fail_before = None
        for operation in [controller.close, controller.rollback]:
            count = len(cloud.calls)
            with self.assertRaises(ValueError):
                operation()
            # Rollback may restore earlier known controls, but cannot retry the
            # ambiguous forward request or touch resources not in its journal.
            self.assertFalse(any(url == cloud.calls[3][1] for _, url, _ in cloud.calls[count:]))
        controller, cloud, journal, _ = setup()
        controller.close()
        url = next(url for url in cloud.resources if "/services/" in url)
        cloud.resources[url]["bindings"].append({"role": "roles/run.invoker", "members": ["user:new@example.test"]})
        with self.assertRaises(ValueError):
            controller.rollback()
        self.assertIn("user:new@example.test", str(cloud.resources[url]))

    def test_maintenance_gate_failure_halts_before_network_mutation(self):
        controller, cloud, _, _ = setup()
        def fail():
            raise ValueError("Synthetic gate closed")
        controller.guard = fail
        for operation in [controller.close, controller.fence, controller.rollback]:
            with self.assertRaises(ValueError):
                operation()
        self.assertEqual(cloud.calls, [])

    def test_lost_long_running_key_operation_requires_reconciliation(self):
        controller, cloud, journal, _ = setup()
        cloud.fail_after = 16  # Fifteen enabled schedules, then the API key.
        with self.assertRaises(ValueError):
            controller.close()
        cloud.fail_after = None
        self.assertEqual(list(journal["controls"].values())[-1]["kind"], "key")
        with self.assertRaises(ValueError):
            controller.close()
        self.assertEqual(len(cloud.calls), 16)

    def test_writer_and_plan_drift_refused(self):
        controller, cloud, journal, _ = setup()
        plan = copy.deepcopy(controller.plan)
        plan["accountAdministratorsForReview"].append("user:unexpected@example.test")
        journal["planSha256"] = freeze.digest(plan)
        with self.assertRaises(ValueError):
            controls.Controls(plan, cloud, journal, lambda x: None, lambda: None)
        journal["planSha256"] = "different"
        with self.assertRaises(ValueError):
            controls.Controls(controller.plan, cloud, journal, lambda x: None, lambda: None)

    def test_mutator_disallows_new_roles_translation_or_foreign_destinations(self):
        api = object.__new__(controls.API)
        with patch("urllib.request.build_opener", side_effect=AssertionError("No network allowed")):
            for method, url in [("POST", "https://evil.example/"),
                ("POST", "https://cloudresourcemanager.googleapis.com/v1/projects/" + freeze.PROJECT + ":setIamPolicy"),
                ("POST", "https://iam.googleapis.com/v1/projects/" + freeze.PROJECT + "/serviceAccounts/" + freeze.TRANSLATOR + ":disable"),
                ("POST", "https://runXgoogleapis.com/v2/projects/" + freeze.PROJECT + "/locations/us-central1/services/fixture:setIamPolicy")]:
                with self.assertRaises(ValueError):
                    api.mutate(method, url, {})


if __name__ == "__main__":
    unittest.main()
