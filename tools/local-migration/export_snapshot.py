#!/usr/bin/env python3
"""Read-only, resumable Firestore PITR snapshot and private Auth export.

No downloaded values, account identifiers, credentials or API response errors
are printed. Production remains the sole writer throughout this rehearsal.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "crown-land-b15e0"
BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)"
ROOT = "projects/" + PROJECT + "/databases/(default)/documents"
PAGE_SIZE = 500
MAX_DOCUMENTS = 3000000
MAX_BYTES = 12 * 1024 ** 3


class PageTooLarge(ValueError):
    pass


def encode(value):
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def reference_order(name):
    # Firestore compares reference path components, not slash-joined text.
    # A parent's descendants precede a sibling whose ID extends that parent's ID.
    return tuple(part.encode("utf8") for part in name.split("/"))


def private_directory(path):
    path = Path(path).absolute()
    if path.is_symlink():
        raise ValueError("Snapshot directory must not be a symlink")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    st = path.stat()
    if st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise ValueError("Snapshot directory must be owned by this account and mode 0700")
    return path


def atomic_private(path, data):
    temporary = path.with_name(path.name + ".next")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class GoogleReader:
    def __init__(self):
        self.token = None
        self.refreshed = 0

    def __call__(self, url, body=None):
        if not url.startswith((BASE, "https://identitytoolkit.googleapis.com/")):
            raise ValueError("Unapproved Google API")
        for attempt in range(5):
            if not self.token or time.monotonic() - self.refreshed > 2700:
                result = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
                if result.returncode or not result.stdout.strip():
                    raise ValueError("Google Cloud sign-in is required")
                self.token = result.stdout.strip()
                self.refreshed = time.monotonic()
            request = urllib.request.Request(url, data=encode(body) if body is not None else None,
                headers={"Authorization": "Bearer " + self.token, "x-goog-user-project": PROJECT,
                         "Content-Type": "application/json"})
            try:
                # Google API URLs are fixed; never forward credentials via redirects.
                class NoRedirect(urllib.request.HTTPRedirectHandler):
                    def redirect_request(self, *args, **kwargs):
                        return None
                with urllib.request.build_opener(NoRedirect).open(request, timeout=90) as response:
                    raw = response.read(64 * 1024 ** 2 + 1)
                if len(raw) > 64 * 1024 ** 2:
                    raise PageTooLarge("Snapshot page exceeds the bounded response size")
                return json.loads(raw)
            except urllib.error.HTTPError as error:
                if error.code == 401:
                    self.token = None
                elif error.code not in (429, 500, 502, 503, 504):
                    raise ValueError("Google API rejected snapshot request (HTTP " + str(error.code) + ")") from None
            except (urllib.error.URLError, TimeoutError):
                pass
            if attempt < 4:
                time.sleep(min(2 ** attempt, 8))
        raise ValueError("Google API snapshot read failed after bounded retries")


def query_page(read, read_time, cursor=None, page_size=None):
    page_size = page_size or PAGE_SIZE
    query = {"from": [{"allDescendants": True}],
             "orderBy": [{"field": {"fieldPath": "__name__"}, "direction": "ASCENDING"}],
             "limit": page_size}
    if cursor:
        query["startAt"] = {"values": [{"referenceValue": cursor}], "before": False}
    rows = read(BASE + "/documents:runQuery", {"structuredQuery": query, "readTime": read_time})
    if not isinstance(rows, list) or not rows or any("error" in row for row in rows):
        raise ValueError("Incomplete Firestore query response")
    documents = []
    previous = cursor
    for row in rows:
        if row.get("readTime") and datetime.fromisoformat(row["readTime"].replace("Z", "+00:00")) != datetime.fromisoformat(read_time.replace("Z", "+00:00")):
            raise ValueError("Firestore snapshot read time changed")
        if "document" not in row:
            continue
        document = row["document"]
        name = document.get("name", "")
        if not name.startswith(ROOT + "/") or len(name[len(ROOT) + 1:].split("/")) % 2:
            raise ValueError("Document path is outside the selected database")
        if previous and reference_order(name) <= reference_order(previous):
            raise ValueError("Firestore cursor repeated or returned unordered documents")
        if not document.get("updateTime") or not document.get("createTime"):
            raise ValueError("Snapshot document has no version metadata")
        previous = name
        documents.append(document)
    if len(documents) > page_size:
        raise ValueError("Firestore page exceeded the requested bound")
    return documents


def snapshot_count(read, read_time):
    rows = read(BASE + "/documents:runAggregationQuery", {
        "structuredAggregationQuery": {"structuredQuery": {"from": [{"allDescendants": True}]},
                                       "aggregations": [{"alias": "total", "count": {}}]},
        "readTime": read_time})
    counts = [row.get("result", {}).get("aggregateFields", {}).get("total", {}).get("integerValue") for row in rows]
    counts = [value for value in counts if value is not None]
    if len(counts) != 1 or not re.fullmatch(r"\d+", counts[0]):
        raise ValueError("Snapshot total could not be verified")
    return int(counts[0])


def verify_files(directory, manifest):
    for item in manifest["pages"] + list(manifest.get("privateFiles", {}).values()):
        if not re.fullmatch(r"(?:documents-\d{6}|auth-users|auth-config|google-oauth)\.json", item["file"]):
            raise ValueError("Invalid snapshot filename")
        path = directory / item["file"]
        if path.is_symlink() or path.stat().st_mode & 0o077:
            raise ValueError("Snapshot file is not private")
        raw = path.read_bytes()
        if len(raw) != item["bytes"] or checksum(raw) != item["sha256"]:
            raise ValueError("Snapshot file integrity check failed")


def export_firestore(directory, read, progress=None):
    manifest_path = directory / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if manifest.get("project") != PROJECT or manifest.get("schemaVersion") != 1:
            raise ValueError("Snapshot identity differs from this migration")
        verify_files(directory, manifest)
    else:
        database = read(BASE)
        if database.get("databaseEdition") != "STANDARD" or database.get("pointInTimeRecoveryEnablement") != "POINT_IN_TIME_RECOVERY_ENABLED":
            raise ValueError("This exporter requires Standard Firestore with PITR enabled")
        read_time = (datetime.now(timezone.utc) - timedelta(minutes=2)).replace(second=0, microsecond=0).isoformat().replace("+00:00", "Z")
        count = snapshot_count(read, read_time)
        if count > MAX_DOCUMENTS:
            raise ValueError("Snapshot exceeds the reviewed document bound")
        manifest = {"schemaVersion": 1, "project": PROJECT, "readTime": read_time,
                    "expectedDocuments": count, "exportedDocuments": 0, "bytes": 0,
                    "pages": [], "cursor": None, "firestoreComplete": False,
                    "authSnapshotAtomicWithFirestore": False, "privateFiles": {}}
        atomic_private(manifest_path, encode(manifest))
    while not manifest["firestoreComplete"]:
        page_size = manifest.get("pageSize", PAGE_SIZE)
        try:
            documents = query_page(read, manifest["readTime"], manifest["cursor"], page_size)
        except PageTooLarge:
            if page_size == 1:
                raise
            manifest["pageSize"] = max(1, page_size // 4)
            atomic_private(manifest_path, encode(manifest))
            continue
        if documents:
            raw = encode(documents)
            if manifest["bytes"] + len(raw) > MAX_BYTES or manifest["exportedDocuments"] + len(documents) > manifest["expectedDocuments"]:
                raise ValueError("Snapshot exceeded its checked bound")
            filename = "documents-" + str(len(manifest["pages"])).zfill(6) + ".json"
            target = directory / filename
            if target.exists():
                if target.is_symlink() or target.read_bytes() != raw:
                    raise ValueError("Uncommitted snapshot page differs; preserve it for inspection")
            else:
                atomic_private(target, raw)
            manifest["pages"].append({"file": filename, "bytes": len(raw), "sha256": checksum(raw), "documents": len(documents)})
            manifest["bytes"] += len(raw)
            manifest["exportedDocuments"] += len(documents)
            manifest["cursor"] = documents[-1]["name"]
        if len(documents) < page_size:
            if manifest["exportedDocuments"] != manifest["expectedDocuments"]:
                raise ValueError("Snapshot count mismatch; partial export is not complete")
            manifest["firestoreComplete"] = True
        atomic_private(manifest_path, encode(manifest))
        if progress and (len(manifest["pages"]) % 50 == 0 or manifest["firestoreComplete"]):
            progress(manifest["exportedDocuments"], manifest["expectedDocuments"])
    return manifest


def export_auth(directory, read, manifest):
    if manifest.get("authComplete"):
        return manifest
    auth_base = "https://identitytoolkit.googleapis.com/"
    config = read(auth_base + "admin/v2/projects/" + PROJECT + "/config?fields=signIn(hashConfig),multiTenant(allowTenants)")
    if config.get("multiTenant", {}).get("allowTenants"):
        raise ValueError("Tenant accounts require a separate migration")
    hash_config = config.get("signIn", {}).get("hashConfig", {})
    if hash_config.get("algorithm") != "SCRYPT" or not hash_config.get("signerKey") or not all(key in hash_config for key in ("saltSeparator", "rounds", "memoryCost")):
        raise ValueError("Complete password hash parameters are required")
    started = datetime.now(timezone.utc).isoformat()
    users, seen_tokens, seen_ids, token = [], set(), set(), None
    for _ in range(10000):
        suffix = "?maxResults=1000" + ("&nextPageToken=" + urllib.parse.quote(token, safe="") if token else "")
        page = read(auth_base + "v1/projects/" + PROJECT + "/accounts:batchGet" + suffix)
        for user in page.get("users", []):
            uid = user.get("localId")
            if not isinstance(uid, str) or not uid or uid in seen_ids:
                raise ValueError("Invalid or duplicate account identity")
            if any(provider.get("providerId") == "password" for provider in user.get("providerUserInfo", [])) and not (user.get("passwordHash") and user.get("salt")):
                raise ValueError("Password account export is missing its hash or salt")
            users.append(user)
            seen_ids.add(uid)
        token = page.get("nextPageToken")
        if not token:
            break
        if token in seen_tokens:
            raise ValueError("Account pagination repeated")
        seen_tokens.add(token)
    else:
        raise ValueError("Account export limit reached")
    oauth = read(auth_base + "admin/v2/projects/" + PROJECT + "/defaultSupportedIdpConfigs/google.com")
    if oauth.get("enabled") and not (oauth.get("clientId") and oauth.get("clientSecret")):
        raise ValueError("Google sign-in configuration is incomplete")
    for label, value in (("auth-users", users), ("auth-config", config), ("google-oauth", oauth)):
        filename = label + ".json"
        raw = encode(value)
        atomic_private(directory / filename, raw)
        manifest["privateFiles"][label] = {"file": filename, "bytes": len(raw), "sha256": checksum(raw)}
    manifest.update({"authComplete": True, "authAccounts": len(users), "authStartedAt": started,
                     "authCompletedAt": datetime.now(timezone.utc).isoformat(),
                     "authSnapshotAtomicWithFirestore": False})
    atomic_private(directory / "manifest.json", encode(manifest))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    directory = private_directory(args.directory)
    # Reject repository/web-root destinations even if their permissions change.
    resolved = directory.resolve()
    repo = Path(__file__).resolve().parents[2]
    if resolved.is_relative_to(repo) or resolved.is_relative_to(Path("/srv")):
        raise ValueError("Private exports must stay outside source and web roots")
    read = GoogleReader()
    manifest = export_firestore(directory, read, lambda done, total: print(f"Snapshot progress: {done}/{total} documents", flush=True))
    manifest = export_auth(directory, read, manifest)
    print(json.dumps({"firestoreComplete": manifest["firestoreComplete"], "documents": manifest["exportedDocuments"],
                      "accounts": manifest["authAccounts"], "readTime": manifest["readTime"],
                      "authAtomicWithFirestore": False}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Print only fixed operator messages, not arbitrary OS/API/data errors.
        if type(error) is ValueError and not isinstance(error, json.JSONDecodeError):
            raise SystemExit(str(error)) from None
        raise SystemExit("Snapshot failed; private partial output was preserved for inspection") from None
