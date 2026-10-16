"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Store } = require("../local-backend/store");
const { AuthService } = require("../local-backend/auth");
const { AuthMailDispatcher, ResendRehearsalSender } = require("../local-backend/auth-mail");
const { AuthMailLoop } = require("../local-backend/auth-mail-loop");
const { readConfig, assertMailRole, writeStatus } = require("../local-backend/auth-mail-rehearsal");

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-mail-service-"));
  const schema = "migration_auth_preview_" + crypto.randomBytes(6).toString("hex"), store = new Store({ schema });
  const auth = new AuthService({ store, rateKey: crypto.randomBytes(32) });
  const account = { localId: "mail-worker-fixture", email: "fixture@example.test", emailVerified: true, passwordHash: "never-expose-this" };
  const config = { schema, expiresAt: new Date(Date.now() + 3600000).toISOString(), allowedRecipients: [account.email] };
  let sends = 0;
  const sender = { send: async () => { sends++; return crypto.randomUUID(); } };
  const create = options => new AuthMailLoop({ store, sender, expiresAt: config.expiresAt, ...options });
  const issue = () => auth.transaction(async client => auth.queueEmailAction(client, account, "resetPassword"));
  const retryNow = () => store.pool.query(`UPDATE ${schema}.auth_mail_delivery SET next_attempt_at=clock_timestamp()-interval '1 second',lease_until=NULL`);
  try {
    await store.initialize(); await auth.initialize(); await new AuthMailDispatcher({ store, sender }).initialize();
    await store.pool.query(`INSERT INTO ${schema}.accounts(uid,body) VALUES($1,$2)`, [account.localId, account]);
    const projection = (await store.pool.query(`SELECT * FROM ${schema}.auth_mail_accounts`)).rows;
    assert.deepEqual(projection, [{ uid: account.localId, email: account.email, disabled: false }]);
    assert.equal(JSON.stringify(projection).includes(account.passwordHash), false);
    const file = path.join(directory, "config.json");
    const write = value => fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    write(config); assert.deepEqual(readConfig(file), config);
    for (const bad of [{ ...config, schema: "migration_20261015" }, { ...config, schema: "public" },
      { ...config, extraSecret: "no" }, { ...config, allowedRecipients: [] }, { ...config, allowedRecipients: [account.email, "another@example.test"] },
      { ...config, allowedRecipients: ["invalid"] }, { ...config, expiresAt: "invalid" },
      { ...config, expiresAt: new Date(Date.now() - 1).toISOString() }, { ...config, expiresAt: new Date(Date.now() + 8 * 86400000).toISOString() }]) {
      write(bad); assert.throws(() => readConfig(file));
    }
    write(config); fs.chmodSync(file, 0o644); assert.throws(() => readConfig(file));
    await assert.rejects(assertMailRole(store), /Restricted/);
    const role = { name: "crownlands-mail-rehearsal", rolsuper: false, rolcreatedb: false, rolcreaterole: false,
      rolreplication: false, creates: false, accounts: false, sessions: false, queues: false, actions: false, other_schemas: false };
    const fake = { schema, pool: { query: async () => ({ rows: [role] }) } };
    await assertMailRole(fake);
    for (const flag of Object.keys(role).filter(key => key !== "name")) {
      role[flag] = true; await assert.rejects(assertMailRole(fake), /Restricted/); role[flag] = false;
    }

    const loop = create();
    assert.equal((await loop.status()).healthy, false);
    await loop.tick(); assert.equal(sends, 0); assert.equal((await loop.status()).healthy, true);
    await issue(); await loop.tick(); assert.equal(sends, 1);
    const status = await loop.status(); assert.equal(status.queue.accepted, 1); assert.equal(status.queue.pending, 0);
    assert.equal(JSON.stringify(status).includes(account.email), false); assert.equal(JSON.stringify(status).includes(account.localId), false);
    writeStatus(directory, status); assert.equal(fs.statSync(path.join(directory, "status.json")).mode & 0o077, 0);
    assert.equal(fs.existsSync(path.join(directory, "status.json.next")), false);
    loop.stop(); await loop.settle(); assert.equal((await loop.status()).healthy, false);
    assert.throws(() => loop.start());
    const restarted = create(); await restarted.tick(); assert.equal(sends, 1); restarted.stop();

    // A blocked provider keeps the single slot. Stop aborts the actual transport
    // signal; the durable pending row can be retried by the next service.
    await issue(); let entered;
    const entering = new Promise(resolve => { entered = resolve; });
    const abortingSender = new ResendRehearsalSender({ apiKey: "re_synthetic_only", allowedRecipients: [account.email], fetchImpl: async (_, options) => {
      entered();
      return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(Error("never-log-provider-secret")), { once: true }));
    } });
    const blocked = create({ sender: abortingSender });
    const task = blocked.tick(); await entering;
    assert.equal(await blocked.tick(), false); assert.equal((await blocked.status()).active, 1);
    blocked.stop(); await blocked.settle(); await task;
    assert.equal((await blocked.status()).queue.pending, 1);
    await retryNow(); const recovered = create(); await recovered.tick(); assert.equal(sends, 2); recovered.stop();

    // Stop/expiry while acquiring a DB claim must not begin a network request.
    for (const expire of [false, true]) {
      await issue(); let now = Date.now(), claimed, release;
      const claimedSignal = new Promise(resolve => { claimed = resolve; });
      const hold = new Promise(resolve => { release = resolve; });
      const waiting = create({ now: () => now, expiresAt: new Date(now + 1000).toISOString() });
      const claim = waiting.dispatcher.claim.bind(waiting.dispatcher);
      waiting.dispatcher.claim = async () => { const value = await claim(); claimed(); await hold; return value; };
      const before = sends, tick = waiting.tick(); await claimedSignal;
      if (expire) now += 1001; else waiting.stop();
      release(); await tick; assert.equal(sends, before); waiting.stop();
      await retryNow(); const resumed = create(); await resumed.tick(); assert.equal(sends, before + 1); resumed.stop();
    }
    // Expiry during active provider I/O cancels it without restarting a send.
    await issue();
    const expiring = create({ sender: abortingSender, expiresAt: new Date(Date.now() + 60).toISOString() });
    expiring.start();
    await new Promise(resolve => setTimeout(resolve, 100)); await expiring.settle();
    assert.equal(expiring.stopped, true); assert.equal((await expiring.status()).queue.pending, 1);
    await retryNow(); const resumed = create(); await resumed.tick(); resumed.stop();

    // Health fails for operational failure, persistent delivery failure or an
    // old backlog. A successful later DB tick clears only transient failures.
    const broken = create(); broken.dispatcher.deliverOne = async () => { throw Error("private-database-details"); };
    assert.equal(await broken.tick(), false); assert.equal((await broken.status()).consecutiveFailures, 1);
    broken.dispatcher.deliverOne = async () => ({ state: "idle" }); await broken.tick(); assert.equal((await broken.status()).healthy, true); broken.stop();
    const delayed = await issue();
    await store.pool.query(`UPDATE ${schema}.auth_mail SET created_at=clock_timestamp()-interval '6 minutes' WHERE id=$1`, [delayed]);
    const monitor = create(); monitor.lastSuccess = Date.now(); assert.equal((await monitor.status()).healthy, false);
    await store.pool.query(`UPDATE ${schema}.auth_mail SET status='failed',action_url='' WHERE id=$1`, [delayed]);
    assert.equal((await monitor.status()).queue.failed, 1); assert.equal((await monitor.status()).healthy, false); monitor.stop();
    const unit = fs.readFileSync(path.join(__dirname, "local-migration/crownlands-mail-rehearsal.service"), "utf8");
    for (const setting of ["ProtectHome=yes", "ProtectSystem=strict", "NoNewPrivileges=yes", "StateDirectoryMode=0700", "TimeoutStopSec=20", "MemoryMax=256M"])
      assert.ok(unit.split("\n").includes(setting));
    execFileSync("python3", [path.join(__dirname, "local-migration/test_mail_preview.py")], { stdio: "inherit" });
    console.log("Private mail service: actual PostgreSQL outbox, no password projection, bounded delivery, restart/stop/expiry recovery, private health, role guards and installer rollback passed. No real email sent.");
  } finally { await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error("Synthetic private mail service tests failed:", error.message); process.exitCode = 1; });
