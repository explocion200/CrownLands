#!/usr/bin/python3
"""Consistent private game/account dump with same-snapshot row fingerprints."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid

DATABASE = "crownlands_migration"
SOCKET = "/var/run/postgresql"
CONFIGS = [Path("/etc/crownlands-auth-rehearsal/config.json"), Path("/etc/crownlands-game-rehearsal/config.json")]


def validate_schemas(schemas):
    if not isinstance(schemas, list) or len(schemas) != 2 or len(set(schemas)) != 2:
        raise ValueError("Exactly one private account and game schema are required")
    if sorted(re.sub(r"[a-f0-9]{12}$", "", name) for name in schemas) != ["migration_auth_preview_", "migration_game_preview_"]:
        raise ValueError("Unexpected database backup target")
    return sorted(schemas)


def connection(database):
    if database != DATABASE and not re.fullmatch(r"crownlands_restore_check_[a-f0-9]{12}", database):
        raise ValueError("Only the local migration database or a disposable restore check is allowed")
    return ["-h", SOCKET, "-d", database]


def psql(database=DATABASE, prefix=()):
    return [*prefix, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", *connection(database)]


def query(statement, database=DATABASE, prefix=()):
    result = subprocess.run(psql(database, prefix), input=statement, text=True, capture_output=True, timeout=900)
    if result.returncode:
        raise RuntimeError("Private backup SQL failed; no private SQL diagnostics were logged")
    return result.stdout.strip()


@contextmanager
def exported_snapshot(prefix=()):
    process = subprocess.Popen(psql(prefix=prefix), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    try:
        process.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL idle_in_transaction_session_timeout='30min'; SELECT pg_export_snapshot();\n")
        process.stdin.flush()
        snapshot = process.stdout.readline().strip()
        if not re.fullmatch(r"[A-F0-9]{8}-[A-F0-9]{8}-[0-9]+", snapshot):
            raise RuntimeError("Could not retain a consistent private database snapshot")
        yield snapshot
    finally:
        if process.poll() is None:
            try:
                process.stdin.write("ROLLBACK;\n"); process.stdin.close(); process.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                process.kill(); process.wait()
        process.stdout.close()


def transaction_prefix(snapshot=None):
    if snapshot is not None and not re.fullmatch(r"[A-F0-9]{8}-[A-F0-9]{8}-[0-9]+", snapshot):
        raise ValueError("Invalid exported snapshot")
    return "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; " + (f"SET TRANSACTION SNAPSHOT '{snapshot}'; " if snapshot else "") + "SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='15min'; "


def fingerprints(schemas, snapshot=None, database=DATABASE, prefix=()):
    schemas = validate_schemas(schemas)
    names = ",".join("'" + name + "'" for name in schemas)
    catalog = query(transaction_prefix(snapshot) + f"""
      SELECT coalesce(json_agg(item ORDER BY item.schema,item.name),'[]') FROM (
        SELECT n.nspname AS schema,c.relname AS name,
          (SELECT json_agg(json_build_object('name',a.attname,'text',t.typcategory='S') ORDER BY k.ordinality)
           FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
           JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
           JOIN pg_type t ON t.oid=a.atttypid WHERE i.indrelid=c.oid AND i.indisprimary) AS keys
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ({names}) AND c.relkind='r') AS item; ROLLBACK;""", database, prefix)
    tables = json.loads(catalog)
    if {table["schema"] for table in tables} != set(schemas):
        raise RuntimeError("A required backup schema is empty or missing")
    result = []
    for table in tables:
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", table["name"]) or not table["keys"]:
            raise RuntimeError("Review new tables before including them in consistent backups")
        order = []
        for key in table["keys"]:
            if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", key["name"]):
                raise RuntimeError("Review changed backup primary keys")
            order.append('"' + key["name"] + '"' + (' COLLATE "C"' if key["text"] else ''))
        statement = transaction_prefix(snapshot) + f"COPY (SELECT encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') FROM {table['schema']}.{table['name']} t ORDER BY {','.join(order)}) TO STDOUT; ROLLBACK;"
        process = subprocess.Popen(psql(database, prefix), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        count, digest = 0, hashlib.sha256()
        try:
            process.stdin.write(statement.encode()); process.stdin.close()
            for line in process.stdout:
                if not re.fullmatch(rb"[a-f0-9]{64}\n", line):
                    raise RuntimeError("Unexpected private fingerprint output")
                digest.update(line); count += 1
            if process.wait(timeout=10):
                raise RuntimeError("Private table fingerprint failed")
        finally:
            if process.poll() is None:
                process.kill(); process.wait()
            process.stdout.close()
        result.append({"schema": table["schema"], "table": table["name"], "rows": count, "sha256": digest.hexdigest()})
    return result


def capture(destination, schemas, prefix=(), after_snapshot=None):
    schemas = validate_schemas(schemas)
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    if destination.is_symlink() or destination.stat().st_mode & 0o077:
        raise ValueError("Private backup directory required")
    temporary = destination / ("database-" + uuid.uuid4().hex + ".pending")
    try:
        with exported_snapshot(prefix) as snapshot:
            if after_snapshot:
                after_snapshot()
            tables = fingerprints(schemas, snapshot, prefix=prefix)
            with temporary.open("xb") as output:
                temporary.chmod(0o600)
                command = [*prefix, "pg_dump", *connection(DATABASE), "--format=custom", "--strict-names", "--snapshot=" + snapshot]
                for schema in schemas:
                    command.extend(["--schema", schema])
                dumped = subprocess.run(command, stdout=output, stderr=subprocess.PIPE, timeout=900)
                output.flush(); os.fsync(output.fileno())
            if dumped.returncode or dumped.stderr:
                raise RuntimeError("Private database dump failed or reported a warning")
        listed = subprocess.run(["pg_restore", "--list", str(temporary)], capture_output=True, timeout=60)
        if listed.returncode or not listed.stdout:
            raise RuntimeError("Private database archive could not be read")
        with temporary.open("rb") as archive:
            checksum = hashlib.file_digest(archive, "sha256").hexdigest()
        manifest = {"formatVersion": 1, "database": DATABASE, "schemas": schemas, "tables": tables,
                    "sha256": checksum, "bytes": temporary.stat().st_size, "completedAt": datetime.now(timezone.utc).isoformat()}
        manifest_temp = destination / "manifest.json.next"
        with manifest_temp.open("w") as output:
            manifest_temp.chmod(0o600); json.dump(manifest, output, indent=2); output.write("\n"); output.flush(); os.fsync(output.fileno())
        temporary.replace(destination / "database.dump"); manifest_temp.replace(destination / "manifest.json")
        return manifest
    finally:
        temporary.unlink(missing_ok=True)


def verify_archive(destination):
    manifest = json.loads((destination / "manifest.json").read_text())
    validate_schemas(manifest["schemas"])
    if manifest["formatVersion"] != 1 or manifest["database"] != DATABASE:
        raise ValueError("Unsupported recovery manifest")
    with (destination / "database.dump").open("rb") as archive:
        digest = hashlib.file_digest(archive, "sha256").hexdigest()
    if digest != manifest["sha256"] or (destination / "database.dump").stat().st_size != manifest["bytes"]:
        raise ValueError("Database archive checksum differs from its recovery manifest")
    return manifest


def installed_schemas():
    original = [file.read_bytes() for file in CONFIGS]
    auth, game = [json.loads(value) for value in original]
    if game["authSchema"] != auth["schema"]:
        raise RuntimeError("Installed account and game targets disagree")
    return validate_schemas([auth["schema"], game["schema"]]), original


def main(destination):
    if os.geteuid() != 0:
        raise RuntimeError("The scheduled database backup requires the protected backup service")
    schemas, original = installed_schemas()
    capture(destination, schemas, prefix=["runuser", "-u", "postgres", "--"])
    if original != [file.read_bytes() for file in CONFIGS]:
        raise RuntimeError("Installed database configuration changed during backup")
    print("Consistent private account/game database snapshot prepared and fingerprinted.")


if __name__ == "__main__":
    try:
        main(Path(sys.argv[1]))
    except Exception:
        raise SystemExit("Consistent database backup failed; private details were not logged. Existing encrypted snapshots were preserved.") from None
