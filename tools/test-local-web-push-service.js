"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const { privateFile, assertPushRole, writeStatus } = require("../local-backend/web-push-rehearsal");
const { validateScope } = require("../local-backend/web-push-loop");
(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-push-")), file = path.join(folder, "config");
  try {
    fs.writeFileSync(file, JSON.stringify({ synthetic: true }), { mode: 0o600 }); assert.deepEqual(privateFile(file), { synthetic: true });
    fs.chmodSync(file, 0o640); assert.throws(() => privateFile(file)); fs.chmodSync(file, 0o600);
    fs.symlinkSync(file, file + "-link"); assert.throws(() => privateFile(file + "-link"));
    fs.writeFileSync(file, "x".repeat(9000)); assert.throws(() => privateFile(file));
    const scope = { schema: "migration_game_preview_012345abcdef", ownerUid: "fixture", notBefore: Date.now(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
      reservationId: "a".repeat(32), publicKey: "a".repeat(87), attemptLimit: 5 };
    validateScope(scope);
    for (const patch of [{ schema: "public" }, { ownerUid: "../other" }, { attemptLimit: 6 }, { notBefore: Date.now() + 600000 }, { expiresAt: "2000-01-01" }, { extra: true }]) assert.throws(() => validateScope({ ...scope, ...patch }));
    const row = { name: "crownlands-push-rehearsal", rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, creates: false, other_schemas: false };
    const fake = { schema: scope.schema, pool: { query: async () => ({ rows: [row] }) } };
    await assertPushRole(fake);
    for (const flag of Object.keys(row).filter(key => key !== "name")) { row[flag] = true; await assert.rejects(assertPushRole(fake)); row[flag] = false; }
    writeStatus(folder, { rehearsal: true }); assert.equal(fs.statSync(path.join(folder, "status.json")).mode & 0o077, 0);
    // Reproduce systemd's exact root-owned ACL path, and reject the same mode
    // elsewhere. No real privileged file or credential is read in this fixture.
    const original = Object.fromEntries(["openSync", "fstatSync", "readFileSync", "lstatSync", "realpathSync", "closeSync"].map(name => [name, fs[name]]));
    const prior = process.env.CREDENTIALS_DIRECTORY, managed = "/run/credentials/crownlands-push-rehearsal.service";
    const stat = { uid: 0, gid: 0, mode: 0o440, size: 2, isFile: () => true }, parent = { uid: 0, gid: 0, mode: 0o550, isDirectory: () => true };
    try {
      process.env.CREDENTIALS_DIRECTORY = managed;
      fs.openSync = () => 123; fs.fstatSync = () => stat; fs.readFileSync = () => "{}"; fs.lstatSync = () => parent; fs.realpathSync = value => value; fs.closeSync = () => {};
      assert.deepEqual(privateFile(managed + "/vapid"), {}); assert.deepEqual(privateFile(managed + "/config"), {});
      assert.throws(() => privateFile("/tmp/vapid")); parent.mode = 0o750; assert.throws(() => privateFile(managed + "/vapid")); parent.mode = 0o550;
      stat.uid = 1000; assert.throws(() => privateFile(managed + "/vapid")); stat.uid = 0;
      fs.realpathSync = value => value + "-redirect"; assert.throws(() => privateFile(managed + "/vapid"));
    } finally { Object.assign(fs, original); if (prior === undefined) delete process.env.CREDENTIALS_DIRECTORY; else process.env.CREDENTIALS_DIRECTORY = prior; }
    execFileSync("python3", [path.join(__dirname, "local-migration/test_push_preview.py")], { stdio: "pipe" });
    console.log("Private Web Push service: credential ACL/no-symlink boundaries, expiry/role checks, private status and install/rollback fixtures passed.");
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
