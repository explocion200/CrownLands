#!/usr/bin/env python3
"""Read-only second-pass verification of a post-fence Firestore/Auth snapshot.

This proves exact data equality at two selected instants. It does not establish
runtime denial, reconcile queued events/payments, import data or activate it.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import fcntl
import hashlib
import itertools
import json
import os
from pathlib import Path

import export_snapshot as snapshot
import prepare_firebase_freeze as freeze
import firebase_transfer_controls as controls


def instant(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timezone-qualified transfer times required")
    return parsed.timestamp()


def verify_controls(plan, journal, api, guard):
    """Read all controls, with exact coverage; never call Controls.close()."""
    guard()
    controls.Controls(plan, api, journal, lambda value: None, guard)
    if (journal.get("planSha256") != freeze.digest(plan) or not journal.get("closedAt")
            or not journal.get("controlsAppliedAt") or journal.get("controlsRestoredAt")):
        raise ValueError("A completed unreversed source-control journal is required")
    if instant(journal["controlsAppliedAt"]) - instant(journal["closedAt"]) < max(600, plan["minimumDrainSeconds"]):
        raise ValueError("Source drain boundary is incomplete")
    # Construct expected coverage from the reviewed plan, not from the journal.
    expected = {}
    for job in plan["jobsBefore"]:
        expected[job["name"]] = ("job", "https://cloudscheduler.googleapis.com/v1/" + job["name"], {**job, "state": "PAUSED"})
    for key in plan["keysBlocked"]:
        expected[key["name"]] = ("key", "https://apikeys.googleapis.com/v2/" + key["name"], key)
    rules = {"name": plan["rulesReleaseBefore"]["name"], "rulesetName": journal.get("rulesetCreated")}
    if not rules["rulesetName"]:
        raise ValueError("Published deny rules are missing")
    expected["firestore-rules"] = ("rules", "https://firebaserules.googleapis.com/v1/" + rules["name"], rules)
    for item in plan["invocationPolicies"]:
        expected[item["name"]] = ("invoker", "https://run.googleapis.com/v2/" + item["name"] + ":getIamPolicy?options.requestedPolicyVersion=3", item["blocked"])
    for account in plan["writerAccountsBefore"]:
        expected[account["email"]] = ("account", "https://iam.googleapis.com/v1/projects/" + freeze.PROJECT + "/serviceAccounts/" + account["email"], {**account, "disabled": True})
    if set(journal.get("controls", {})) != set(expected):
        raise ValueError("Source-control journal has incomplete or extra controls")

    def check(pair):
        name, (kind, url, wanted) = pair
        entry = journal["controls"][name]
        if (entry.get("kind") != kind or entry.get("url") != url
                or entry.get("status") not in {"verified", "unchanged"} or entry.get("rollbackSubmittedAt")
                or controls.normalized(kind, entry.get("wanted", {})) != controls.normalized(kind, wanted)):
            raise ValueError("Source-control journal contains an unresolved operation")
        if kind == "key" and entry["status"] != "unchanged":
            if not entry.get("operation"):
                raise ValueError("API key operation acknowledgement is required")
            operation = api.read("https://apikeys.googleapis.com/v2/" + entry["operation"])
            if not operation.get("done") or operation.get("error"):
                raise ValueError("API key operation is unresolved")
        if controls.normalized(kind, api.read(url)) != controls.normalized(kind, wanted):
            raise ValueError("Source control drifted after fencing")

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(check, expected.items()))
    policy = api.reader("https://cloudresourcemanager.googleapis.com/v1/projects/" + freeze.PROJECT + ":getIamPolicy", {"options": {"requestedPolicyVersion": 3}})
    if controls.normalized("invoker", policy) != controls.normalized("invoker", plan["iamBefore"]):
        raise ValueError("Project permissions changed during transfer")
    prefix = "projects/" + freeze.PROJECT + "/locations/" + freeze.REGION
    functions = freeze.listed(api.read, "https://cloudfunctions.googleapis.com/v2/" + prefix + "/functions?pageSize=1000", "functions")
    if sorted(functions, key=lambda f: f["name"]) != sorted(plan["functions"], key=lambda f: f["name"]):
        raise ValueError("Function deployment changed during transfer")
    services = freeze.listed(api.read, "https://run.googleapis.com/v2/" + prefix + "/services?pageSize=1000&fields=services(name,invokerIamDisabled),nextPageToken", "services")
    if ({s["name"] for s in services} != {s["name"] for s in plan["invocationPolicies"]}
            or any(s.get("invokerIamDisabled") for s in services)):
        raise ValueError("Cloud Run inventory or invocation enforcement changed")
    for url, field, planned in [
        ("https://cloudscheduler.googleapis.com/v1/" + prefix + "/jobs?pageSize=500", "jobs", plan["jobsBefore"]),
        ("https://apikeys.googleapis.com/v2/projects/" + freeze.NUMBER + "/locations/global/keys?pageSize=300", "keys", plan["keysBefore"]),
    ]:
        if {x["name"] for x in freeze.listed(api.read, url, field)} != {x["name"] for x in planned}:
            raise ValueError("Source writer inventory changed")
    ruleset = api.read("https://firebaserules.googleapis.com/v1/" + rules["rulesetName"])
    if ruleset.get("source") != plan["rulesetBlocked"]["source"]:
        raise ValueError("Published rules do not match the reviewed deny rules")
    ttl = freeze.listed(api.read, snapshot.BASE + "/collectionGroups/-/fields?filter=ttlConfig:*&pageSize=1000", "fields")
    if ttl:
        raise ValueError("Automatic TTL deletion requires separate reconciliation")
    guard()
    return len(expected)


def source_documents(directory, manifest):
    prior, count = None, 0
    for page in manifest["pages"]:
        documents = json.loads((directory / page["file"]).read_text())
        if len(documents) != page["documents"]:
            raise ValueError("Snapshot page count differs")
        for document in documents:
            name = document.get("name", "")
            if (not name.startswith(snapshot.ROOT + "/") or not document.get("updateTime")
                    or not document.get("createTime") or (prior and snapshot.reference_order(name) <= snapshot.reference_order(prior))):
                raise ValueError("Snapshot document identity or version is incomplete")
            prior = name
            count += 1
            yield document
    if count != manifest["expectedDocuments"]:
        raise ValueError("Snapshot page totals differ")


def current_documents(read, read_time, guard):
    cursor, size = None, snapshot.PAGE_SIZE
    while True:
        guard()
        try:
            page = snapshot.query_page(read, read_time, cursor, size)
        except snapshot.PageTooLarge:
            if size == 1:
                raise
            size = max(1, size // 4)
            continue
        yield from page
        if len(page) < size:
            break
        cursor = page[-1]["name"]


def canonical_accounts(value):
    if not isinstance(value, list) or any(not isinstance(u.get("localId"), str) or not u["localId"] for u in value):
        raise ValueError("Invalid account identities")
    if len({u["localId"] for u in value}) != len(value):
        raise ValueError("Duplicate account identities")
    return sorted(value, key=lambda u: u["localId"])


def compare(directory, manifest, read, read_time, guard, auth_directory, progress=None):
    snapshot.checked_read_time(read_time)
    snapshot.verify_files(directory, manifest)
    if snapshot.snapshot_count(read, read_time) != manifest["expectedDocuments"]:
        raise ValueError("Source document count changed after the snapshot")
    count, checksum = 0, hashlib.sha256()
    for before, after in itertools.zip_longest(source_documents(directory, manifest), current_documents(read, read_time, guard)):
        if before is None or after is None or snapshot.encode(before) != snapshot.encode(after):
            raise ValueError("Source document content or version changed after the snapshot")
        checksum.update(snapshot.encode(before))
        count += 1
        if progress and count % 25000 == 0:
            progress(count, manifest["expectedDocuments"])
    if count != manifest["expectedDocuments"]:
        raise ValueError("Source comparison is incomplete")
    guard()
    second = snapshot.export_auth(auth_directory, read, {"privateFiles": {}})
    for label in ("auth-users", "auth-config", "google-oauth"):
        before = json.loads((directory / manifest["privateFiles"][label]["file"]).read_text())
        after = json.loads((auth_directory / second["privateFiles"][label]["file"]).read_text())
        if label == "auth-users":
            before, after = canonical_accounts(before), canonical_accounts(after)
        if snapshot.encode(before) != snapshot.encode(after):
            raise ValueError("Source accounts or sign-in configuration changed after the snapshot")
    if second["authAccounts"] != manifest["authAccounts"]:
        raise ValueError("Source account count differs")
    guard()
    return {"documents": count, "accounts": second["authAccounts"], "documentDigest": checksum.hexdigest(),
            "authManifestSha256": snapshot.checksum(snapshot.encode(second))}


def verify(directory, plan, journal, output, read_time, read, api_factory, guard, progress=None):
    if output.exists():
        raise ValueError("Preserve the prior verification and choose a new output directory")
    manifest_raw = (directory / "manifest.json").read_bytes()
    manifest = json.loads(manifest_raw)
    if (manifest.get("schemaVersion") != 1 or manifest.get("project") != freeze.PROJECT
            or manifest.get("firestoreComplete") is not True or manifest.get("authComplete") is not True
            or manifest.get("expectedDocuments") != manifest.get("exportedDocuments")
            or set(manifest.get("privateFiles", {})) != {"auth-users", "auth-config", "google-oauth"}):
        raise ValueError("Complete final snapshot required")
    # Two minutes is only an observation separation; never a token-revocation guarantee.
    snapshot.checked_read_time(manifest["readTime"])
    snapshot.checked_read_time(read_time)
    fence = instant(journal["controlsAppliedAt"])
    if (instant(manifest["readTime"]) < fence + 120 or instant(manifest["authStartedAt"]) < fence + 120
            or instant(read_time) < instant(manifest["readTime"]) + 120
            or instant(read_time) < instant(manifest["authCompletedAt"])):
        raise ValueError("Fresh post-fence snapshot and later verification minute required")
    control_count = verify_controls(plan, journal, api_factory(), guard)
    output.mkdir(mode=0o700)
    auth_directory = snapshot.private_directory(output / "accounts")
    compared = compare(directory, manifest, read, read_time, guard, auth_directory, progress)
    verify_controls(plan, journal, api_factory(), guard)
    if (directory / "manifest.json").read_bytes() != manifest_raw:
        raise ValueError("Snapshot manifest changed during verification")
    snapshot.verify_files(directory, manifest)
    receipt = {"version": 1, "project": freeze.PROJECT, "epoch": plan["epoch"],
               "planSha256": freeze.digest(plan), "snapshotManifestSha256": snapshot.checksum(manifest_raw),
               "sourceReadTime": manifest["readTime"], "verificationReadTime": read_time,
               "verifiedControls": control_count, **compared, "exactSnapshotVerified": True,
               "sourceFrozen": False, "activationAuthorized": False,
               "remaining": ["Actual runtime and client denial", "Pending trigger and payment reconciliation",
                             "Final import, independent recovery and protected activation"],
               "verifiedAt": datetime.now(timezone.utc).isoformat()}
    snapshot.atomic_private(output / "receipt.json", snapshot.encode(receipt))
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan_directory", type=Path)
    parser.add_argument("snapshot_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    parser.add_argument("--read-time", required=True)
    args = parser.parse_args()
    private = (Path.home() / ".local/share/crownlands").resolve()
    for directory in (args.plan_directory, args.snapshot_directory, args.output_directory):
        if not directory.is_absolute() or directory.is_symlink() or not directory.resolve().is_relative_to(private):
            raise ValueError("Absolute private Crownlands directories required")
    for directory in (args.plan_directory, args.snapshot_directory):
        snapshot.private_directory(directory)
    with os.fdopen(os.open(args.plan_directory / "controls.lock", os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600), "wb") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        plan = json.loads((args.plan_directory / "freeze-plan.json").read_text())
        journal = json.loads((args.plan_directory / "controls-journal.json").read_text())
        result = verify(args.snapshot_directory, plan, journal, args.output_directory, args.read_time,
            snapshot.GoogleReader(), controls.API, lambda: controls.local_guard(plan),
            lambda done, total: print(f"Source comparison: {done}/{total} documents", flush=True))
        print(json.dumps({key: result[key] for key in ("exactSnapshotVerified", "documents", "accounts", "sourceFrozen", "activationAuthorized")}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("Final snapshot verification stopped; private evidence was preserved. No import, source mutation or activation was performed.") from None
