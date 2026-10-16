#!/usr/bin/env python3
"""Import a verified private snapshot into an isolated PostgreSQL rehearsal schema.

This is typed Firestore staging data, not a running game backend. It cannot target
production or any TCP host, and it never overwrites an existing schema.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

spec = importlib.util.spec_from_file_location("snapshot", Path(__file__).with_name("export_snapshot.py"))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)

DATABASE = "crownlands_migration"


def schema_name(value):
    if not re.fullmatch(r"migration_[a-z0-9_]{1,40}", value):
        raise ValueError("Invalid isolated rehearsal schema")
    return value


def copy_value(value):
    return str(value).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def psql_command():
    return ["psql", "-X", "-h", "/var/run/postgresql", "-d", DATABASE, "-v", "ON_ERROR_STOP=1", "-At"]


def sql(text):
    result = subprocess.run(psql_command(), input=text, text=True, capture_output=True)
    if result.returncode:
        raise ValueError("PostgreSQL rehearsal operation failed; no private SQL error was logged")
    return result.stdout.strip()


def import_snapshot(directory, schema):
    schema = schema_name(schema)
    directory = snapshot.private_directory(directory)
    manifest = json.loads((directory / "manifest.json").read_text())
    if (manifest.get("schemaVersion") != 1 or manifest.get("project") != snapshot.PROJECT
            or not manifest.get("firestoreComplete") or not manifest.get("authComplete")):
        raise ValueError("Only a complete Firestore and account rehearsal snapshot can be imported")
    snapshot.verify_files(directory, manifest)
    if manifest["expectedDocuments"] != manifest["exportedDocuments"]:
        raise ValueError("Snapshot document totals disagree")
    if sql("SELECT count(*) FROM pg_namespace WHERE nspname = '" + schema + "';") != "0":
        raise ValueError("The rehearsal schema already exists; it was preserved")
    if sql("SELECT current_database();") != DATABASE:
        raise ValueError("Unexpected rehearsal database")
    # Capture server diagnostics privately; never print values included in SQL errors.
    log_path = directory / (schema + "-import.log")
    log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(log_fd, "wb") as log:
        process = subprocess.Popen(psql_command(), stdin=subprocess.PIPE, stdout=log, stderr=log, text=True)
        def write(text):
            process.stdin.write(text)
        try:
            write("BEGIN;\nCREATE SCHEMA " + schema + ";\nREVOKE ALL ON SCHEMA " + schema + " FROM PUBLIC;\n")
            write("CREATE TABLE " + schema + ".documents (path text PRIMARY KEY, collection_id text NOT NULL, parent_path text NOT NULL, body jsonb NOT NULL, source_sha256 text NOT NULL);\n")
            write("CREATE TABLE " + schema + ".accounts (uid text PRIMARY KEY, body jsonb NOT NULL);\n")
            write("CREATE TABLE " + schema + ".receipt (body jsonb NOT NULL);\n")
            write("COPY " + schema + ".documents FROM STDIN;\n")
            count = 0
            previous = ""
            collections = {}
            realm = None
            for page in manifest["pages"]:
                docs = json.loads((directory / page["file"]).read_text())
                if len(docs) != page["documents"]:
                    raise ValueError("Snapshot page count differs from manifest")
                for doc in docs:
                    name = doc.get("name", "")
                    if not name.startswith(snapshot.ROOT + "/") or snapshot.reference_order(name) <= snapshot.reference_order(previous):
                        raise ValueError("Snapshot contains duplicate, unordered or foreign documents")
                    previous = name
                    path = name[len(snapshot.ROOT) + 1:]
                    parts = path.split("/")
                    if len(parts) % 2:
                        raise ValueError("Invalid document path")
                    raw = snapshot.encode(doc)
                    write("\t".join(map(copy_value, [path, parts[-2], "/".join(parts[:-2]), raw.decode().strip(), snapshot.checksum(raw)])) + "\n")
                    count += 1
                    collections[parts[-2]] = collections.get(parts[-2], 0) + 1
                    if path == "realmConfig/current":
                        realm = {key: doc.get("fields", {}).get(key, {}).get("stringValue") for key in ("worldId", "resetGeneration", "sharedRealmId")}
            if count != manifest["expectedDocuments"] or not realm or not all(realm.values()):
                raise ValueError("Imported snapshot totals or current realm are incomplete")
            write("\\.\nCOPY " + schema + ".accounts FROM STDIN;\n")
            users = json.loads((directory / manifest["privateFiles"]["auth-users"]["file"]).read_text())
            if len(users) != manifest["authAccounts"]:
                raise ValueError("Snapshot account totals disagree")
            seen = set()
            for user in users:
                uid = user.get("localId")
                if not isinstance(uid, str) or not uid or uid in seen:
                    raise ValueError("Snapshot contains invalid or duplicate accounts")
                seen.add(uid)
                write(copy_value(uid) + "\t" + copy_value(snapshot.encode(user).decode().strip()) + "\n")
            receipt = {"sourceProject": manifest["project"], "readTime": manifest["readTime"], "documents": count,
                       "snapshotManifestSha256": snapshot.checksum((directory / "manifest.json").read_bytes()),
                       "accounts": len(users), "collections": collections, "realm": realm,
                       "rehearsalOnly": True, "authAtomicWithFirestore": False,
                       "importedAt": datetime.now(timezone.utc).isoformat()}
            write("\\.\nCOPY " + schema + ".receipt FROM STDIN;\n" + copy_value(snapshot.encode(receipt).decode().strip()) + "\n\\.\n")
            write("CREATE INDEX ON " + schema + ".documents (collection_id, path);\n")
            write("CREATE INDEX ON " + schema + ".documents (parent_path, collection_id, path);\n")
            write("REVOKE ALL ON ALL TABLES IN SCHEMA " + schema + " FROM PUBLIC;\nCOMMIT;\n")
            process.stdin.close()
            if process.wait() != 0:
                raise ValueError("Rehearsal import failed and rolled back; diagnostics are private")
        except BaseException:
            process.stdin.close()
            process.wait()
            raise
    actual = sql("SELECT (SELECT count(*) FROM " + schema + ".documents)||','||(SELECT count(*) FROM " + schema + ".accounts);")
    if actual != str(count) + "," + str(len(users)):
        raise ValueError("Post-import database totals differ")
    snapshot.atomic_private(directory / (schema + "-receipt.json"), snapshot.encode(receipt))
    return receipt


def restore_rehearsal(directory, schema):
    """Retain the original schema; restore the dump into its original name."""
    schema = schema_name(schema)
    preserved = schema + "_before_restore"
    if len(preserved) > 63:
        raise ValueError("Schema name is too long for restore rehearsal")
    dump = directory / (schema + ".dump")
    fd = os.open(dump, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as handle:
        result = subprocess.run(["pg_dump", "-h", "/var/run/postgresql", "-d", DATABASE, "--format=custom", "--schema=" + schema], stdout=handle, stderr=subprocess.PIPE)
    if result.returncode:
        raise ValueError("Consistent rehearsal database dump failed")
    # This schema has no running application. Preserve rather than drop its data.
    sql("ALTER SCHEMA " + schema + " RENAME TO " + preserved + ";")
    result = subprocess.run(["pg_restore", "-h", "/var/run/postgresql", "-d", DATABASE, "--exit-on-error", "--single-transaction", str(dump)], capture_output=True)
    if result.returncode:
        sql("ALTER SCHEMA " + preserved + " RENAME TO " + schema + ";")
        raise ValueError("Restore failed; the original rehearsal schema was restored")
    for table in ("documents", "accounts", "receipt"):
        difference = sql("SELECT count(*) FROM ((SELECT * FROM " + schema + "." + table + " EXCEPT ALL SELECT * FROM " + preserved + "." + table + ") UNION ALL (SELECT * FROM " + preserved + "." + table + " EXCEPT ALL SELECT * FROM " + schema + "." + table + ")) AS differences;")
        if difference != "0":
            raise ValueError("Restored data differs; both rehearsal schemas were preserved")
    result = {"schema": schema, "originalPreservedAs": preserved, "restoreVerified": True,
              "compared": ["documents", "accounts", "receipt"], "dumpBytes": dump.stat().st_size,
              "completedAt": datetime.now(timezone.utc).isoformat()}
    snapshot.atomic_private(directory / (schema + "-restore.json"), snapshot.encode(result))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--schema", required=True)
    parser.add_argument("--verify-restore", action="store_true")
    args = parser.parse_args()
    try:
        receipt = import_snapshot(args.directory, args.schema)
        print(json.dumps({"rehearsalImported": True, "documents": receipt["documents"], "accounts": receipt["accounts"], "realm": receipt["realm"]}))
        if args.verify_restore:
            print(json.dumps(restore_rehearsal(args.directory, args.schema)))
    except Exception:
        raise SystemExit("Rehearsal import/restore did not complete; inspect its private receipt and log before retrying") from None
