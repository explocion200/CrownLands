"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { readConfig, assertWorkerRole, writeStatus } = require("../local-backend/worker-rehearsal");
const { Store } = require("../local-backend/store");
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-worker-service-"));
  const store = new Store({ schema: "migration_game_preview_" + crypto.randomBytes(6).toString("hex") });
  try {
    const file = path.join(directory, "config.json"), config = { schema: store.schema, expiresAt: new Date(Date.now() + 3600000).toISOString() };
    const write = value => fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    write(config); assert.deepEqual(readConfig(file), config);
    for (const bad of [{ ...config, schema: "migration_20261015" }, { ...config, schema: "public" }, { ...config, ownerUid: "unnecessary-identity" },
      { ...config, expiresAt: "invalid" }, { ...config, expiresAt: new Date(Date.now() - 1).toISOString() }, { ...config, expiresAt: new Date(Date.now() + 8 * 86400000).toISOString() }]) {
      write(bad); assert.throws(() => readConfig(file));
    }
    write(config); fs.chmodSync(file, 0o644); assert.throws(() => readConfig(file), /Private/);
    writeStatus(directory, { rehearsal: true, stopped: false }); writeStatus(directory, { rehearsal: true, stopped: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "status.json"))), { rehearsal: true, stopped: true });
    assert.equal(fs.statSync(path.join(directory, "status.json")).mode & 0o077, 0);
    assert.equal(fs.existsSync(path.join(directory, "status.json.next")), false);
    await store.initialize();
    await assert.rejects(assertWorkerRole(store), /Restricted/);
    const safe = { name: "crownlands-worker-rehearsal", rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, creates: false };
    const checked = [];
    const fake = { schema: store.schema, pool: { query: async query => { checked.push(query); return { rows: [safe] }; } } };
    await assertWorkerRole(fake); assert.equal(checked.length, 3);
    for (const flag of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "creates"]) {
      safe[flag] = true; await assert.rejects(assertWorkerRole(fake), /Restricted/); safe[flag] = false;
    }
    const unit = fs.readFileSync(path.join(__dirname, "local-migration/crownlands-worker-rehearsal.service"), "utf8");
    assert.match(unit, /^PrivateNetwork=yes$/m); assert.match(unit, /^RestrictAddressFamilies=AF_UNIX$/m);
    assert.match(unit, /^ProtectHome=yes$/m); assert.match(unit, /^StateDirectoryMode=0700$/m);
    assert.match(unit, /^Restart=on-failure$/m); assert.match(unit, /^TimeoutStopSec=20$/m);
    execFileSync("python3", [path.join(__dirname, "local-migration/test_worker_preview.py")], { stdio: "pipe" });
    console.log("Private worker service: expired/unsafe configuration refusal, actual owner-role rejection, bounded runtime privileges, private atomic status, installer grant scope and restart health checks passed.");
  } finally { await store.pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`); await store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error("Private worker service fixtures failed:", error.message); process.exitCode = 1; });
