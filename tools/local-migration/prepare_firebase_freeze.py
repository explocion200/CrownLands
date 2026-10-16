#!/usr/bin/env python3
"""Read-only transfer preflight. Prepare exact reversible source-writer controls.

This command never pauses jobs, changes IAM/rules/keys, or activates the local
game. A plan is not evidence that the source has actually stopped writing.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

PROJECT = "crown-land-b15e0"
NUMBER = "542378516435"
REGION = "us-central1"
RUNTIME = NUMBER + "-compute@developer.gserviceaccount.com"
TRANSLATOR = "crownlands-local-translation@" + PROJECT + ".iam.gserviceaccount.com"
WRITER_ACCOUNTS = [RUNTIME, PROJECT + "@appspot.gserviceaccount.com",
                   "firebase-adminsdk-fbsvc@" + PROJECT + ".iam.gserviceaccount.com"]
HOSTS = {"cloudfunctions.googleapis.com", "cloudscheduler.googleapis.com", "apikeys.googleapis.com",
         "firebaserules.googleapis.com", "cloudresourcemanager.googleapis.com", "iam.googleapis.com",
         "firestore.googleapis.com", "identitytoolkit.googleapis.com", "run.googleapis.com"}
PERMISSIONS = ["resourcemanager.projects.setIamPolicy", "iam.serviceAccounts.get",
               "iam.serviceAccounts.disable", "iam.serviceAccounts.enable",
               "serviceusage.apiKeys.update", "cloudscheduler.jobs.pause", "cloudscheduler.jobs.enable",
               "firebaserules.rulesets.create", "firebaserules.releases.update",
               "run.services.getIamPolicy", "run.services.setIamPolicy"]
DENY_RULES = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} { allow read, write: if false; }\n  }\n}\n"


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()


def digest(value):
    return hashlib.sha256(encode(value)).hexdigest()


class Reader:
    def __init__(self):
        result = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
        if result.returncode or not result.stdout.strip():
            raise ValueError("Google Cloud sign-in is required")
        self.token = result.stdout.strip()

    def __call__(self, url, body=None):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname not in HOSTS or parsed.username or parsed.port or parsed.fragment:
            raise ValueError("Unapproved preflight API destination")
        # POST is used solely for these documented read-only IAM methods.
        if body is not None and not parsed.path.endswith((":getIamPolicy", ":testIamPermissions")):
            raise ValueError("Preflight must remain read-only")
        headers = {"Authorization": "Bearer " + self.token, "Content-Type": "application/json"}
        # API Keys is enabled for the existing Cloud SDK quota project, while
        # Firebase Rules uses this Firebase project's enabled API. Do not enable
        # a new service merely to read existing key metadata.
        if parsed.hostname != "apikeys.googleapis.com":
            headers["x-goog-user-project"] = PROJECT
        request = urllib.request.Request(url, data=encode(body) if body is not None else None, headers=headers)
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=45) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise ValueError("Preflight response exceeded its bound")
            return json.loads(raw)
        except urllib.error.HTTPError as error:
            raise ValueError("Preflight API refused request (HTTP " + str(error.code) + ")") from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            raise ValueError("Preflight API did not return a complete response") from None


def listed(read, url, field):
    output, seen, token = [], set(), None
    for _ in range(30):
        page = read(url + ("&pageToken=" + urllib.parse.quote(token, safe="") if token else ""))
        if page.get("unreachable") or not isinstance(page.get(field, []), list):
            raise ValueError("Incomplete transfer inventory")
        output.extend(page.get(field, []))
        token = page.get("nextPageToken")
        if not token:
            names = [item.get("name") for item in output]
            if len(set(names)) != len(names) or any(not isinstance(name, str) for name in names):
                raise ValueError("Duplicate or missing inventory identity")
            return output
        if token in seen:
            raise ValueError("Repeated transfer inventory cursor")
        seen.add(token)
    raise ValueError("Transfer inventory exceeds its page limit")


def blocked_key(key):
    if not re.fullmatch(r"projects/" + NUMBER + r"/locations/global/keys/[a-f0-9-]{36}", key.get("name", "")) or not key.get("etag"):
        raise ValueError("Review unexpected API key identity or missing concurrency version")
    if key.get("deleteTime") or "keyString" in key:
        raise ValueError("Only active key metadata may enter the transfer plan")
    restrictions = json.loads(json.dumps(key.get("restrictions", {})))
    targets = restrictions.get("apiTargets")
    if not targets or any(not isinstance(t.get("service"), str) or "*" in t["service"] for t in targets):
        raise ValueError("Unrestricted or wildcard API key requires explicit review")
    restrictions["apiTargets"] = [t for t in targets if t["service"] not in {"identitytoolkit.googleapis.com", "securetoken.googleapis.com"}]
    if not restrictions["apiTargets"]:
        raise ValueError("An empty API allowlist would remove the intended restriction")
    return {"name": key["name"], "etag": key["etag"], "restrictions": restrictions}


def block_public_invocation(policy):
    if not policy.get("etag"):
        raise ValueError("Cloud Run policy has no concurrency version")
    result = json.loads(json.dumps(policy))
    for binding in result.get("bindings", []):
        public = set(binding.get("members", [])) & {"allUsers", "allAuthenticatedUsers"}
        if public and binding.get("role") != "roles/run.invoker":
            raise ValueError("Review unexpected public Cloud Run role")
        binding["members"] = [m for m in binding.get("members", []) if m not in public]
    result["bindings"] = [b for b in result.get("bindings", []) if b["members"]]
    return result


def plan(read, epoch):
    if not re.fullmatch(r"[a-f0-9]{32}", epoch):
        raise ValueError("The installed permanent epoch is required")
    project_url = "https://cloudresourcemanager.googleapis.com/v1/projects/" + PROJECT
    project = read(project_url)
    if str(project.get("projectNumber")) != NUMBER or project.get("lifecycleState") != "ACTIVE":
        raise ValueError("Unexpected project identity or state")
    prefix = "projects/" + PROJECT + "/locations/" + REGION
    functions = listed(read, "https://cloudfunctions.googleapis.com/v2/" + prefix + "/functions?pageSize=1000", "functions")
    jobs = listed(read, "https://cloudscheduler.googleapis.com/v1/" + prefix + "/jobs?pageSize=500", "jobs")
    if len(functions) != 150 or len(jobs) != 16:
        raise ValueError("Review changed deployed function or scheduler inventory")
    if any(f.get("state") != "ACTIVE" or f.get("serviceConfig", {}).get("serviceAccountEmail") != RUNTIME for f in functions):
        raise ValueError("Review inactive functions or additional runtime identities")
    if any(j.get("state") not in {"ENABLED", "PAUSED"} or not j["name"].startswith(prefix + "/jobs/firebase-schedule-") for j in jobs):
        raise ValueError("Review unrelated, running or changed scheduler jobs")
    maximum = max(f.get("serviceConfig", {}).get("timeoutSeconds", 0) for f in functions)
    if not isinstance(maximum, int) or maximum < 1 or maximum > 540:
        raise ValueError("Review changed function drain deadline")
    keys = listed(read, "https://apikeys.googleapis.com/v2/projects/" + NUMBER + "/locations/global/keys?pageSize=300", "keys")
    if not keys:
        raise ValueError("Account API key inventory is missing")
    key_after = [blocked_key(k) for k in keys]
    release = read("https://firebaserules.googleapis.com/v1/projects/" + PROJECT + "/releases/cloud.firestore")
    if not re.fullmatch(r"projects/" + PROJECT + r"/rulesets/[a-zA-Z0-9-]+", release.get("rulesetName", "")):
        raise ValueError("Published Firestore ruleset identity is missing")
    ruleset = read("https://firebaserules.googleapis.com/v1/" + release["rulesetName"])
    policy = read(project_url + ":getIamPolicy", {"options": {"requestedPolicyVersion": 3}})
    if any(set(b.get("members", [])) & {"allUsers", "allAuthenticatedUsers"} for b in policy.get("bindings", [])):
        raise ValueError("Review inherited public project permissions before blocking function invocation")
    services = listed(read, "https://run.googleapis.com/v2/" + prefix + "/services?pageSize=1000&fields=services(name,invokerIamDisabled,etag,uid),nextPageToken", "services")
    if {s["name"] for s in services} != {f.get("serviceConfig", {}).get("service") for f in functions} or any(s.get("invokerIamDisabled") for s in services):
        raise ValueError("Review changed Cloud Run services or bypassed invocation checks")
    def run_policy(service):
        before = read("https://run.googleapis.com/v2/" + service["name"] + ":getIamPolicy?options.requestedPolicyVersion=3")
        return {"name": service["name"], "before": before, "blocked": block_public_invocation(before)}
    with ThreadPoolExecutor(max_workers=8) as executor:
        invocation = list(executor.map(run_policy, sorted(services, key=lambda s: s["name"])))
    granted = read(project_url + ":testIamPermissions", {"permissions": PERMISSIONS}).get("permissions", [])
    # The broad Auth administrators must be reviewed too; checking just the
    # function runtime would miss a still-authorized Admin SDK credential.
    auth_admins = sorted({member for binding in policy.get("bindings", [])
        if binding["role"] in {"roles/editor", "roles/owner", "roles/firebaseauth.admin", "roles/firebase.admin"}
        for member in binding.get("members", [])})
    accounts = [read("https://iam.googleapis.com/v1/projects/" + PROJECT + "/serviceAccounts/" + email)
                for email in WRITER_ACCOUNTS]
    if any(a.get("email") != email or a.get("projectId") != PROJECT or not a.get("uniqueId")
           or a.get("disabled") for a, email in zip(accounts, WRITER_ACCOUNTS)):
        raise ValueError("Review missing, disabled or changed source writer identities")
    translator = [b for b in policy.get("bindings", []) if b["role"] == "projects/" + PROJECT + "/roles/crownlandsLocalTranslation"
                  and "serviceAccount:" + TRANSLATOR in b.get("members", [])]
    if len(translator) != 1 or translator[0].get("members") != ["serviceAccount:" + TRANSLATOR]:
        raise ValueError("Review the retained Translation-only binding")
    return {"version": 1, "project": PROJECT, "projectNumber": NUMBER, "epoch": epoch,
            "preparedAt": datetime.now(timezone.utc).isoformat(), "mode": "prepared-only", "sourceFrozen": False,
            "organizationParent": project.get("parent"),
            "writerFreezeStrategy": "reviewed-service-identities-and-client-controls",
            "iamDenyAlternative": {"requiresOrganizationGrant": True, "availableForStandaloneOwner": False},
            "functions": functions, "jobsBefore": jobs, "keysBefore": keys, "keysBlocked": key_after,
            "invocationPolicies": invocation,
            "rulesReleaseBefore": release, "rulesetBefore": ruleset,
            "rulesetBlocked": {"source": {"files": [{"name": "firestore.rules", "content": DENY_RULES}]}},
            "iamBefore": policy, "writerAccountsBefore": accounts,
            "accountAdministratorsForReview": auth_admins, "runtimeServiceAccount": RUNTIME,
            "retainedTranslationBinding": translator[0], "minimumDrainSeconds": maximum,
            "permissionsMissing": sorted(set(PERMISSIONS) - set(granted)),
            "requirements": ["root local maintenance and publisher pause", "payment ingress drained",
              "account API restrictions tested", "all account administrators reviewed",
              "Firestore client rules and all reviewed service identities frozen", "scheduler and runtime drain verified",
              "pending trigger and payment reconciliation", "post-freeze PITR minute and stable full Auth export",
              "exact typed-data import and independent recovery test", "one matching local authority activation"]}


def write_private(directory, name, value):
    raw = encode(value)
    fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(raw); handle.flush(); os.fsync(handle.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    directory = args.directory.absolute()
    private_root = Path.home() / ".local/share/crownlands"
    if directory.exists() or not directory.resolve().is_relative_to(private_root.resolve()):
        raise ValueError("Use a new private Crownlands preparation directory")
    control = json.loads(Path("/etc/crownlands-runtime/activation.json").read_text())
    if control.get("phase") != "standby":
        raise ValueError("This preparation requires the installed services to remain in standby")
    result = plan(Reader(), control["epoch"])
    directory.mkdir(mode=0o700)
    write_private(directory, "freeze-plan.json", result)
    summary = {"preparedOnly": True, "sourceFrozen": False, "functions": len(result["functions"]),
               "schedulers": len(result["jobsBefore"]), "apiKeys": len(result["keysBefore"]),
               "minimumDrainSeconds": result["minimumDrainSeconds"], "permissionsMissing": result["permissionsMissing"],
               "planSha256": digest(result)}
    write_private(directory, "summary.json", summary)
    print(json.dumps(summary))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        if type(error) is ValueError:
            raise SystemExit(str(error)) from None
        raise SystemExit("Transfer preflight did not complete; private details were not logged") from None
