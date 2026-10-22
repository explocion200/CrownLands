"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Store, FieldValue } = require("../local-backend/store");
const { JobQueue } = require("../local-backend/jobs");
const timing = require("../functions/operation-timing");

(async () => {
  const schema = "migration_game_retry_" + crypto.randomBytes(5).toString("hex");
  const db = new Store({ schema });
  // Execute the game's existing infrastructure retry helper against real SQL.
  // No Firebase credentials, provider calls or production documents are used.
  const source = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");
  const start = source.indexOf("function isRetryableTransactionInfrastructureError");
  const end = source.indexOf("function requireGameServerId", start);
  assert(start >= 0 && end > start);
  const warnings = [];
  const retry = new Function("measuredTransaction", "console", "safeString", source.slice(start, end)
    + "\nreturn runTransactionWithInfrastructureRetry;")(
    (operation, options) => db.runTransaction(operation, options),
    { warn: (label, details) => warnings.push({ label, details }) },
    (value, length) => String(value).slice(0, length));
  const queue = new JobQueue({ store: db, routes: [{ name: "fixtureArmyResolution", kind: "schedule",
    options: { schedule: "every 1 minutes", timeZone: "UTC" }, handler: async () => {} }] });
  try {
    await db.initialize(); await queue.initialize();
    const account = db.doc("accounts/fixture"), receipt = db.doc("receipts/army");
    await account.set({ balance: 100 });
    let attempts = 0;
    await assert.rejects(db.runTransaction(async tx => {
      attempts++;
      const current = await tx.get(account);
      await account.update({ balance: FieldValue.increment(1) });
      tx.update(account, { balance: current.data().balance + 10 });
      tx.create(receipt, { applied: true });
    }, { maxAttempts: 1 }), { code: "aborted" });
    assert.equal(attempts, 1, "An explicit attempt bound must remain effective");
    assert.equal((await account.get()).data().balance, 101);
    assert.equal((await receipt.get()).exists, false, "A conflict must roll back all game writes");

    await queue.enqueueSchedules(); const job = await queue.claim(); assert(job);
    attempts = 0;
    const diagnostic=await timing.run(async()=>{await db.withTransactionGuard(queue.guard(job), () => retry(async tx => {
      attempts++;
      const [current, done] = await tx.getAll(account, receipt);
      if (done.exists) return;
      // Exhaust the adapter's eight attempts using actual concurrent commits.
      // The unchanged game wrapper must then recover and apply exactly once.
      if (attempts <= 8) await account.update({ balance: FieldValue.increment(1) });
      tx.update(account, { balance: current.data().balance + 10 });
      tx.create(receipt, { applied: true });
    }, "fixtureArmyResolution"));return timing.snapshot();});
    assert.equal(diagnostic.dbSerializationFailures,8);
    assert.equal(diagnostic.dbRetries,7,"Only actual in-adapter retries are counted, not every callback");
    assert(diagnostic.dbTransactionAttempts>=9&&diagnostic.dbReadQueries>0&&diagnostic.dbReadRows>0);
    for(const phase of ["dbRead","dbPoolWait","dbCommit","dbBackoff"])assert(Number.isFinite(diagnostic.phaseDurationMs[phase]));
    assert(!JSON.stringify(diagnostic).includes(account.path)&&!JSON.stringify(diagnostic).includes(schema));
    await queue.finish(job);
    assert.equal(attempts, 9);
    assert.equal(warnings.length, 1); assert.equal(warnings[0].details.code, "aborted");
    assert.equal((await account.get()).data().balance, 119);
    assert.equal((await receipt.get()).data().applied, true);
    assert.equal((await db.pool.query(`SELECT count(*) FROM ${schema}.changes WHERE path=$1`, [receipt.path])).rows[0].count, "1");
    assert.equal((await db.pool.query(`SELECT status FROM ${schema}.work_jobs WHERE id=$1`, [job.id])).rows[0].status, "complete");

    attempts = 0; warnings.length = 0;
    await assert.rejects(retry(async tx => {
      attempts++; const current = await tx.get(account);
      await account.update({ balance: FieldValue.increment(1) });
      tx.update(account, { balance: current.data().balance + 100 });
    }, "boundedFixture", 3, { maxAttempts: 1 }), { code: "aborted" });
    assert.equal(attempts, 3); assert.equal(warnings.length, 2);
    assert.equal((await account.get()).data().balance, 122);

    for (const code of ["permission-denied", "failed-precondition", "job-lease-lost"]) {
      attempts = 0;
      await assert.rejects(retry(async tx => {
        attempts++; tx.update(account, { balance: 0 });
        throw Object.assign(Error("Synthetic business or fencing failure"), { code });
      }), { code });
      assert.equal(attempts, 1, "Business and lost-lease errors must never be retried");
      assert.equal((await account.get()).data().balance, 122);
    }

    // Force a real PostgreSQL deadlock between two isolated advisory locks.
    let arrived = 0, release;
    const barrier = new Promise(resolve => { release = resolve; });
    const deadlockMetrics=[];
    const deadlocks = await Promise.allSettled([0, 1].map(first => timing.run(async()=>{try{return await db.runTransaction(async tx => {
      await tx.client.query("SELECT pg_advisory_xact_lock(hashtext($1),$2)", [schema, 7000 + first]);
      if (++arrived === 2) release();
      await barrier;
      await tx.client.query("SELECT pg_advisory_xact_lock(hashtext($1),$2)", [schema, 7001 - first]);
    }, { maxAttempts: 1 });}finally{deadlockMetrics.push(timing.snapshot());}})));
    assert.equal(deadlockMetrics.reduce((sum,m)=>sum+(m.dbDeadlocks||0),0),1);
    assert.equal(deadlockMetrics.reduce((sum,m)=>sum+(m.dbRetries||0),0),0);
    assert.equal(deadlocks.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(deadlocks.find(result => result.status === "rejected").reason.code, "aborted");
    console.log("Local transaction retries: real serialization/deadlock failures, bounded existing-game recovery, atomic single receipt, lease guard and business-error refusal passed.");
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
})().catch(error => { console.error("Local transaction retry integration failed:", error.message); process.exitCode = 1; });
