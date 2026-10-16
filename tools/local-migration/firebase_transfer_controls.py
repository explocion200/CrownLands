#!/usr/bin/env python3
"""Apply reviewed source controls only behind a root-owned local maintenance gate.

This does not import or activate a game, and successful control-plane changes
are NOT proof of data-plane quiescence. Retain the journal until reconciliation
and final authority activation have been independently verified.
"""
import argparse
import copy
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import urllib.error
import urllib.request
import urllib.parse

import prepare_firebase_freeze as preflight
from export_snapshot import atomic_private


def stamp():
    return datetime.now(timezone.utc).isoformat()


def seconds_since(value):
    return time.time() - datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def key_operation_name(value):
    # API Keys returns opaque IDs such as operations/akmf.p10-... .
    # Accept that documented dot without allowing URLs, traversal or queries.
    return isinstance(value, str) and re.fullmatch(r"operations/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}", value) is not None


def normalized(kind, value):
    if kind == "job":
        return value.get("state")
    if kind == "key":
        return value.get("restrictions")
    if kind == "rules":
        return value.get("rulesetName")
    if kind == "account":
        return {"uniqueId": value.get("uniqueId"), "disabled": value.get("disabled", False)}
    if kind == "invoker":
        result = copy.deepcopy(value)
        result.pop("etag", None)
        # Google may elide version 1 and reorder bindings or principals.
        result.setdefault("version", 1)
        for item in result.get("bindings", []):
            item["members"] = sorted(item["members"])
        result["bindings"] = sorted(result.get("bindings", []), key=preflight.encode)
        return result
    raise ValueError("Unknown source control")


class API:
    def __init__(self):
        self.reader = preflight.Reader()

    def read(self, url):
        return self.reader(url)

    def mutate(self, method, url, body):
        # Exact service/resource allowlist. Never enable APIs, delete resources,
        # grant project IAM, or touch monitoring, storage or Translation here.
        p, n = preflight.PROJECT, preflight.NUMBER
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname not in preflight.HOSTS or parsed.username or parsed.port or parsed.fragment:
            raise ValueError("Unapproved source-control destination")
        patterns = [
            ("POST", rf"https://cloudscheduler.googleapis.com/v1/projects/{p}/locations/us-central1/jobs/firebase-schedule-[A-Za-z0-9-]+:(pause|resume)"),
            ("PATCH", rf"https://apikeys.googleapis.com/v2/projects/{n}/locations/global/keys/[a-f0-9-]{{36}}\?updateMask=restrictions"),
            ("POST", rf"https://run.googleapis.com/v2/projects/{p}/locations/us-central1/services/[a-z0-9-]+:setIamPolicy"),
            ("POST", rf"https://firebaserules.googleapis.com/v1/projects/{p}/rulesets"),
            ("PATCH", rf"https://firebaserules.googleapis.com/v1/projects/{p}/releases/cloud.firestore"),
        ]
        patterns += [("POST", "https://iam.googleapis.com/v1/projects/" + p + "/serviceAccounts/" + re.escape(email) + ":(disable|enable)")
                     for email in preflight.WRITER_ACCOUNTS]
        if not any(method == verb and re.fullmatch(pattern, url) for verb, pattern in patterns):
            raise ValueError("Unapproved source-control mutation")
        headers = {"Authorization": "Bearer " + self.reader.token, "Content-Type": "application/json"}
        if not url.startswith("https://apikeys.googleapis.com/"):
            headers["x-goog-user-project"] = p
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        try:
            request = urllib.request.Request(url, data=preflight.encode(body), headers=headers, method=method)
            with urllib.request.build_opener(NoRedirect).open(request, timeout=45) as response:
                raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError("Source-control response exceeded its bound")
            return json.loads(raw or b"{}")
        except Exception:
            # Never retry an ambiguous mutation. The journal and a subsequent
            # read decide whether it happened; provider payloads stay private.
            raise ValueError("Source-control outcome needs reconciliation; no mutation was retried") from None


class Controls:
    def __init__(self, plan, api, journal, save, guard):
        self.plan, self.api, self.journal, self.save, self.guard = plan, api, journal, save, guard
        if plan.get("project") != preflight.PROJECT or plan.get("permissionsMissing"):
            raise ValueError("A complete permitted source plan is required")
        if journal.get("planSha256") != preflight.digest(plan):
            raise ValueError("Source plan changed; preserve the journal")
        expected = {"serviceAccount:" + a for a in preflight.WRITER_ACCOUNTS}
        expected |= {"user:RicMontalvan@gmail.com", "serviceAccount:" + preflight.NUMBER + "@cloudservices.gserviceaccount.com"}
        if set(plan["accountAdministratorsForReview"]) != expected:
            raise ValueError("Review changed source administrators before applying controls")
        # The owner and Google-managed orchestration identity are intentionally
        # retained. They must not be used to run deployments/imports during the
        # transfer. Quiescence must still be independently established.

    def persist(self):
        self.save(copy.deepcopy(self.journal))

    def apply(self, name, kind, url, before, wanted, action):
        self.guard()
        entry = self.journal.setdefault("controls", {}).get(name)
        current = self.api.read(url)
        if entry:
            if entry.get("rollbackSubmittedAt") or entry["status"] == "restored":
                raise ValueError("A reversed transfer cannot be resumed as a new freeze")
            if entry.get("operation"):
                operation = self.api.read("https://apikeys.googleapis.com/v2/" + entry["operation"])
                if not operation.get("done") or operation.get("error"):
                    raise ValueError("Prior key operation is not complete")
            elif kind == "key" and entry["status"] == "submitted":
                raise ValueError("Resolve the unacknowledged API key operation before continuing")
            if normalized(kind, current) == normalized(kind, entry["wanted"]):
                entry.update(status="verified", observed=current, verifiedAt=stamp())
                self.persist()
                return
            # A request might still be in flight, even if GET returns the old
            # state. Do not blindly repeat it after a crash or timeout.
            raise ValueError("Prior source-control request needs reconciliation; no retry was sent")
        if normalized(kind, current) != normalized(kind, before):
            raise ValueError("Source resource changed after review")
        if normalized(kind, current) == normalized(kind, wanted):
            self.journal["controls"][name] = {"kind": kind, "url": url, "before": current,
                "wanted": wanted, "status": "unchanged", "verifiedAt": stamp()}
            self.persist()
            return
        entry = {"kind": kind, "url": url, "before": current, "wanted": wanted,
                 "status": "submitted", "submittedAt": stamp()}
        self.journal["controls"][name] = entry
        self.persist()  # Durably record intent before any network mutation.
        method, target, body = action(current)
        self.guard()
        result = self.api.mutate(method, target, body)
        if kind == "key":
            operation = result.get("name", "")
            if not key_operation_name(operation):
                raise ValueError("API key operation identity requires review")
            entry["operation"] = operation
            self.persist()
            # A bounded wait; failed/slow operations remain resumable by reads.
            for _ in range(15):
                if result.get("done"):
                    break
                time.sleep(1)
                result = self.api.read("https://apikeys.googleapis.com/v2/" + operation)
            if not result.get("done") or result.get("error"):
                raise ValueError("API key operation is not verified complete")
        current = self.api.read(url)
        if normalized(kind, current) != normalized(kind, wanted):
            raise ValueError("Source control has not reached its reviewed state")
        entry.update(status="verified", observed=current, verifiedAt=stamp())
        self.persist()

    def close(self):
        self.guard()
        if self.journal.get("controlsRestoredAt") or any(e.get("rollbackSubmittedAt") or e["status"] == "restored" for e in self.journal.get("controls", {}).values()):
            raise ValueError("Preserve this reversed attempt and prepare a new transfer")
        if not self.journal.get("controls") and not -5 <= seconds_since(self.plan["preparedAt"]) <= 1800:
            raise ValueError("Refresh the source preflight before closing traffic")
        actual = self.api.reader("https://cloudresourcemanager.googleapis.com/v1/projects/" + preflight.PROJECT + ":getIamPolicy",
                                 {"options": {"requestedPolicyVersion": 3}})
        if actual != self.plan["iamBefore"]:
            raise ValueError("Project permissions changed after review")
        for job in self.plan["jobsBefore"]:
            url = "https://cloudscheduler.googleapis.com/v1/" + job["name"]
            self.apply(job["name"], "job", url, job, {**job, "state": "PAUSED"}, lambda current: ("POST", url + ":pause", {}))
        for before, wanted in zip(self.plan["keysBefore"], self.plan["keysBlocked"]):
            url = "https://apikeys.googleapis.com/v2/" + before["name"]
            self.apply(before["name"], "key", url, before, wanted, lambda current: ("PATCH", url + "?updateMask=restrictions",
                {"name": before["name"], "etag": current["etag"], "restrictions": wanted["restrictions"]}))
        if "rulesetCreated" not in self.journal:
            if self.journal.get("rulesetSubmittedAt"):
                raise ValueError("Ruleset creation outcome requires inspection")
            self.guard()
            self.journal["rulesetSubmittedAt"] = stamp(); self.persist()
            rules = self.api.mutate("POST", "https://firebaserules.googleapis.com/v1/projects/" + preflight.PROJECT + "/rulesets", self.plan["rulesetBlocked"])
            if not re.fullmatch(r"projects/" + preflight.PROJECT + r"/rulesets/[A-Za-z0-9-]+", rules.get("name", "")):
                raise ValueError("Created ruleset identity requires inspection")
            self.journal["rulesetCreated"] = rules["name"]; self.persist()
        before = self.plan["rulesReleaseBefore"]
        wanted = {"name": before["name"], "rulesetName": self.journal["rulesetCreated"]}
        url = "https://firebaserules.googleapis.com/v1/" + before["name"]
        self.apply("firestore-rules", "rules", url, before, wanted,
                   lambda current: ("PATCH", url, {"release": wanted, "updateMask": "rulesetName"}))
        for invocation in self.plan["invocationPolicies"]:
            url = "https://run.googleapis.com/v2/" + invocation["name"]
            self.apply(invocation["name"], "invoker", url + ":getIamPolicy?options.requestedPolicyVersion=3",
                invocation["before"], invocation["blocked"], lambda current: ("POST", url + ":setIamPolicy",
                    {"policy": {**invocation["blocked"], "etag": current["etag"]}, "updateMask": "bindings,etag"}))
        # Re-running close can reconcile a lost acknowledgement. It cannot move
        # the drain boundary earlier than the first fully verified pass.
        self.journal.setdefault("closedAt", stamp()); self.persist()

    def fence(self):
        self.guard()
        if not self.journal.get("closedAt") or seconds_since(self.journal["closedAt"]) < max(600, self.plan["minimumDrainSeconds"]):
            raise ValueError("Client closure and at least ten minutes of drain are required")
        # Verify every closed control again before disabling runtime identities.
        self.close()
        for account in self.plan["writerAccountsBefore"]:
            url = "https://iam.googleapis.com/v1/projects/" + preflight.PROJECT + "/serviceAccounts/" + account["email"]
            self.apply(account["email"], "account", url, account, {**account, "disabled": True},
                       lambda current: ("POST", url + ":disable", {}))
        self.journal.update(controlsAppliedAt=stamp(), sourceFrozen=False,
            outstanding=["Verify actual client/runtime denials and stable accounts/data after propagation",
                         "Reconcile pending trigger and Stripe work before choosing the final snapshot minute"])
        self.persist()

    def rollback(self):
        """Restore only this attempt's controls, before ANY local activation.

        This never resumes local publishing or changes the proxy/authority gate.
        Restore credentials first, then invocation/rules/keys, schedulers last.
        Each inverse request is also journaled before mutation.
        """
        self.guard()
        ordered = sorted(list(self.journal.get("controls", {}).items()),
                         key=lambda pair: {"account": 0, "invoker": 1, "rules": 2, "key": 3, "job": 4}[pair[1]["kind"]])
        for name, entry in ordered:
            self.guard()
            kind, url = entry["kind"], entry["url"]
            if kind == "key":
                if entry["status"] == "submitted" and not entry.get("operation"):
                    raise ValueError("Resolve the outstanding API key request before rollback")
                if entry.get("rollbackSubmittedAt") and not entry.get("rollbackOperation"):
                    raise ValueError("Resolve the unacknowledged key rollback before continuing")
                for label in ["operation", "rollbackOperation"]:
                    if entry.get(label):
                        operation = self.api.read("https://apikeys.googleapis.com/v2/" + entry[label])
                        if not operation.get("done") or operation.get("error"):
                            raise ValueError("An API key operation is still unresolved")
            current = self.api.read(url)
            if normalized(kind, current) == normalized(kind, entry["before"]):
                # An unacknowledged forward request might still apply later.
                if entry["status"] == "submitted" and not entry.get("rollbackSubmittedAt"):
                    raise ValueError("Resolve the outstanding forward request before rollback")
                entry.update(status="restored", restoredAt=stamp()); self.persist()
                continue
            if normalized(kind, current) != normalized(kind, entry["wanted"]) or entry.get("rollbackSubmittedAt"):
                raise ValueError("Rollback found drift or an unresolved inverse request; original data preserved")
            entry["rollbackSubmittedAt"] = stamp(); self.persist()
            if kind == "account":
                method, target, body = "POST", url + ":enable", {}
            elif kind == "job":
                if entry["before"]["state"] != "ENABLED":
                    raise ValueError("A previously paused schedule must remain paused")
                method, target, body = "POST", url + ":resume", {}
            elif kind == "rules":
                method, target, body = "PATCH", url, {"release": {"name": entry["before"]["name"],
                    "rulesetName": entry["before"]["rulesetName"]}, "updateMask": "rulesetName"}
            elif kind == "invoker":
                method, target, body = "POST", url.split(":getIamPolicy")[0] + ":setIamPolicy", {
                    "policy": {**entry["before"], "etag": current["etag"]}, "updateMask": "bindings,etag"}
            elif kind == "key":
                method, target, body = "PATCH", url + "?updateMask=restrictions", {
                    "name": entry["before"]["name"], "etag": current["etag"], "restrictions": entry["before"]["restrictions"]}
            self.guard()
            result = self.api.mutate(method, target, body)
            if kind == "key":
                operation = result.get("name", "")
                if not key_operation_name(operation):
                    raise ValueError("Rollback operation identity requires inspection")
                entry["rollbackOperation"] = operation; self.persist()
                for _ in range(15):
                    if result.get("done"):
                        break
                    time.sleep(1)
                    result = self.api.read("https://apikeys.googleapis.com/v2/" + operation)
                if not result.get("done") or result.get("error"):
                    raise ValueError("Rollback API key operation remains unverified")
            if normalized(kind, self.api.read(url)) != normalized(kind, entry["before"]):
                raise ValueError("Rollback control has not reached its original state")
            entry.update(status="restored", restoredAt=stamp()); self.persist()
        self.journal["controlsRestoredAt"] = stamp(); self.persist()


def read_root_json(path, maximum=65536):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > maximum:
            raise ValueError("A protected local maintenance receipt is required")
        return json.load(handle)


def local_guard(plan):
    control = read_root_json("/etc/crownlands-runtime/activation.json")
    receipt = read_root_json("/var/lib/crownlands-transfer/maintenance.json")
    if control != {"version": 1, "phase": "maintenance", "epoch": plan["epoch"]} or receipt.get("epoch") != plan["epoch"]:
        raise ValueError("Matching root-owned local maintenance is required")
    if receipt.get("localNeverActivated") is not True or receipt.get("planSha256") != preflight.digest(plan):
        raise ValueError("Fresh import may only follow the reviewed initial transfer")
    if not -5 <= seconds_since(receipt["recordedAt"]) <= 60:
        raise ValueError("Refresh the protected pre-activation maintenance check")
    if receipt.get("caddySha256") != hashlib.sha256(Path("/etc/caddy/Caddyfile").read_bytes()).hexdigest():
        raise ValueError("Maintenance proxy changed")
    for unit in ["crownlands-deploy.timer", "crownlands-deploy.service"]:
        status = subprocess.run(["systemctl", "show", unit, "--property=ActiveState", "--value"], capture_output=True, text=True)
        if status.returncode or status.stdout.strip() != "inactive":
            raise ValueError("Automatic publishing must be stopped before source controls")
    state = read_root_json("/var/lib/crownlands-transfer/ingress-drained.json")
    if (state.get("epoch") != plan["epoch"] or state.get("planSha256") != preflight.digest(plan)
        or state.get("drained") is not True or not -5 <= seconds_since(state["recordedAt"]) <= 60):
        raise ValueError("A fresh root payment-drain check is required")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("action", choices=["close", "fence", "rollback"])
    args = parser.parse_args()
    directory = args.directory.absolute()
    if directory.is_symlink() or not directory.resolve().is_relative_to(Path.home() / ".local/share/crownlands"):
        raise ValueError("Private reviewed source-plan directory required")
    if directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077:
        raise ValueError("Source-plan directory must remain private")
    with os.fdopen(os.open(directory / "controls.lock", os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600), "wb") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        plan = json.loads((directory / "freeze-plan.json").read_text())
        guard = lambda: local_guard(plan)
        guard()
        target = directory / "controls-journal.json"
        journal = json.loads(target.read_text()) if target.exists() else {"version": 1, "planSha256": preflight.digest(plan), "controls": {}}
        control = Controls(plan, API(), journal, lambda value: atomic_private(target, preflight.encode(value)), guard)
        getattr(control, args.action)()
        print(json.dumps({"phase": args.action, "verifiedControls": len(journal["controls"]), "sourceFrozen": False,
                          "dataPlaneVerificationStillRequired": True}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("Source-control step stopped; maintenance and private recovery journal were preserved. No automatic retry or activation was performed.") from None
