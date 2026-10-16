from pathlib import Path
import json
import subprocess
import tempfile
import uuid
import postgres_backup as backup


def main():
    suffix = uuid.uuid4().hex[:12]
    auth = "migration_auth_preview_" + suffix
    game = "migration_game_preview_" + suffix
    schemas = [auth, game]
    with tempfile.TemporaryDirectory(prefix="crownlands-database-backup-test-") as temp:
        directory = Path(temp)
        try:
            backup.query(f'''CREATE SCHEMA {auth}; CREATE SCHEMA {game};
              CREATE TABLE {auth}.accounts(uid text PRIMARY KEY, body jsonb NOT NULL);
              CREATE TABLE {auth}.sessions(id text PRIMARY KEY, uid text REFERENCES {auth}.accounts(uid), expires timestamptz);
              CREATE TABLE {game}.documents(path text PRIMARY KEY, body jsonb NOT NULL);
              CREATE TABLE {game}.jobs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event jsonb NOT NULL);
              INSERT INTO {auth}.accounts VALUES('synthetic-owner','{{"verified":true}}');
              INSERT INTO {auth}.sessions VALUES('synthetic-token-hash','synthetic-owner','2026-10-17T10:20:30.123456Z');
              INSERT INTO {game}.documents VALUES('players/synthetic-owner','{{"gold":50,"unicode":"👑","integer":"9223372036854775807"}}');
              INSERT INTO {game}.jobs(event) VALUES('{{"fixture":true}}');''')

            def concurrent_change():
                backup.query(f'''BEGIN; UPDATE {game}.documents SET body='{{"gold":900}}';
                  INSERT INTO {auth}.accounts VALUES('after-snapshot','{{}}');
                  INSERT INTO {game}.jobs(event) VALUES('{{"afterSnapshot":true}}'); COMMIT;''')

            manifest = backup.capture(directory, schemas, after_snapshot=concurrent_change)
            assert all(row["rows"] == 1 for row in manifest["tables"])
            assert backup.verify_archive(directory) == manifest
            assert (directory / "database.dump").stat().st_mode & 0o077 == 0
            assert (directory / "manifest.json").stat().st_mode & 0o077 == 0
            backup.query(f"ALTER SCHEMA {auth} RENAME TO {auth}_before; ALTER SCHEMA {game} RENAME TO {game}_before;")
            restored = subprocess.run(["pg_restore", *backup.connection(backup.DATABASE), "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", str(directory / "database.dump")], capture_output=True)
            assert restored.returncode == 0, "Synthetic restore failed"
            assert backup.fingerprints(schemas) == manifest["tables"], "Restored rows differed from the retained shared snapshot"
            assert json.loads(backup.query(f"SELECT body FROM {game}.documents;"))["gold"] == 50
            assert json.loads(backup.query(f"SELECT body FROM {game}_before.documents;"))["gold"] == 900
            assert backup.query(f"SELECT count(*) FROM {auth}_before.accounts;") == "2"
            assert int(backup.query(f"INSERT INTO {game}.jobs(event) VALUES('{{}}') RETURNING id;")) >= 2
            for bad in [[auth], [auth, auth], [auth, "public"], [auth, game + ";SELECT 1"]]:
                try:
                    backup.capture(directory, bad)
                    raise AssertionError("Unsafe backup target accepted")
                except ValueError:
                    pass
            (directory / "database.dump").write_bytes(b"damaged archive")
            try:
                backup.verify_archive(directory)
                raise AssertionError("Corrupt archive accepted")
            except ValueError:
                pass
            print("Consistent database backup: shared snapshot across concurrent account/game writes, private archive, all-row fingerprints, real restore, preserved later source writes, sequences and corruption/target rejection passed.")
        finally:
            for schema in schemas:
                backup.query(f"DROP SCHEMA IF EXISTS {schema} CASCADE; DROP SCHEMA IF EXISTS {schema}_before CASCADE;")


if __name__ == "__main__":
    main()
