"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { createPlatform, describe } = require("../local-backend/platform");
const { JobQueue, scheduleMatcher, matchDocument } = require("../local-backend/jobs");

(async () => {
  const schema = "migration_game_jobs_" + crypto.randomBytes(5).toString("hex"), db = new Store({ schema });
  const p = createPlatform({ store: db });
  let failAfterCommit = true;
  const routes = describe({
    creditFixture: p.onDocumentCreated({ document: "events/{eventId}" }, async event => {
      assert.equal(event.params.eventId, event.data.id);
      await db.runTransaction(async tx => {
        const receipt = db.doc("receipts/" + event.params.eventId), balance = db.doc("wallets/fixture");
        const [done, wallet] = await tx.getAll(receipt, balance);
        if (done.exists) return;
        tx.set(balance, { amount: (wallet.data()?.amount || 0) + event.data.data().amount });
        tx.create(receipt, { job: event.id });
      });
      if (failAfterCommit) { failAfterCommit = false; throw Error("Synthetic crash after committing a receipt"); }
    }),
    recordFixture: p.onDocumentWritten({ document: "versions/{id}" }, async event => {
      await db.doc("observed/" + event.params.id).set({ before: event.data.before.data()?.revision || 0, after: event.data.after.data()?.revision || 0 });
    }),
  });
  const queue = new JobQueue({ store: db, routes });
  try {
    await db.initialize(); await queue.initialize();
    assert.deepEqual(matchDocument("events/{id}", "events/test"), { id: "test" });
    assert.equal(matchDocument("events/{id}", "other/test"), null);
    const morning = scheduleMatcher({ schedule: "45 9 * * *", timeZone: "America/New_York" });
    assert(morning(Date.parse("2026-03-07T14:45:00Z"))); // before spring DST
    assert(morning(Date.parse("2026-03-08T13:45:00Z"))); // after spring DST
    assert(morning(Date.parse("2026-10-31T13:45:00Z"))); // before fall DST
    assert(morning(Date.parse("2026-11-01T14:45:00Z"))); // after fall DST
    assert(!morning(Date.parse("2026-11-01T13:45:00Z")));
    assert.throws(() => scheduleMatcher({ schedule: "0 * * * *", timeZone: "UTC" }), /Unsupported/);
    await db.doc("events/one").set({ amount: 7 });
    await db.doc("events/one").update({ amount: 999 });
    await queue.dispatchChanges();
    assert.equal(Number((await db.pool.query(`SELECT count(*) FROM ${schema}.work_jobs`)).rows[0].count), 1);
    await queue.runOne();
    assert.equal((await db.doc("wallets/fixture").get()).data().amount, 7, "Created event must use its immutable after snapshot");
    await db.pool.query(`UPDATE ${schema}.work_jobs SET available_at=clock_timestamp() WHERE status='pending'`);
    await queue.runOne();
    assert.equal((await db.doc("wallets/fixture").get()).data().amount, 7, "Retry after commit must not duplicate a credit");
    assert.equal((await db.pool.query(`SELECT status,attempts,last_error_code FROM ${schema}.work_jobs`)).rows[0].status, "complete");
    await db.doc("versions/one").set({ revision: 1 }); await db.doc("versions/one").update({ revision: 2 }); await db.doc("versions/one").delete();
    await queue.dispatchChanges();
    for (let i = 0; i < 3; i++) await queue.runOne();
    assert.deepEqual((await db.doc("observed/one").get()).data(), { before: 2, after: 0 });
    // An older sequence number can commit after a larger ID was dispatched.
    const delayed = await db.pool.connect();
    try {
      await delayed.query("BEGIN");
      const body = { fields: { amount: { integerValue: "3" } } };
      await delayed.query(`INSERT INTO ${schema}.changes(path,after_body) VALUES('events/late-commit',$1)`, [body]);
      await db.doc("events/earlier-commit").set({ amount: 2 });
      await queue.dispatchChanges();
      await delayed.query("COMMIT");
    } finally { await delayed.query("ROLLBACK"); delayed.release(); }
    await queue.dispatchChanges();
    assert.equal(Number((await db.pool.query(`SELECT count(*) FROM ${schema}.work_jobs WHERE status='pending'`)).rows[0].count), 2);
    const [first, second] = await Promise.all([queue.claim(), queue.claim()]);
    const claimed = first || second;
    assert(claimed); assert.equal(Boolean(first) + Boolean(second), 1, "Handlers must not overlap");
    // Reclaim a crashed worker. Its old token cannot commit even after restart.
    await db.pool.query(`UPDATE ${schema}.work_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1`, [claimed.id]);
    const reclaimed = await queue.claim(); assert.equal(reclaimed.id, claimed.id); assert.notEqual(reclaimed.lease_token, claimed.lease_token);
    await assert.rejects(db.withTransactionGuard(queue.guard(claimed), () => db.doc("fence/stale").set({ written: true })), { code: "job-lease-lost" });
    assert.equal((await db.doc("fence/stale").get()).exists, false);
    await db.withTransactionGuard(queue.guard(reclaimed), () => db.doc("fence/current").set({ written: true }));
    await queue.finish(reclaimed); await queue.runOne();
    // Dispatch restart is idempotent and every visible change has its own ack.
    await queue.dispatchChanges(); await queue.dispatchChanges();
    assert.equal(Number((await db.pool.query(`SELECT count(*) FROM ${schema}.changes WHERE dispatched_at IS NULL`)).rows[0].count), 0);
    const deadRoutes = describe({ failFixture: p.onDocumentCreated({ document: "failures/{id}" }, async () => { throw Error("must not be logged: fixture-payload"); }) });
    const deadQueue = new JobQueue({ store: db, routes: [...routes, ...deadRoutes], maxAttempts: 1 });
    await db.doc("failures/one").set({ private: "fixture" }); await deadQueue.dispatchChanges(); await deadQueue.runOne();
    const dead = (await db.pool.query(`SELECT status,last_error_code FROM ${schema}.work_jobs WHERE handler='failFixture'`)).rows[0];
    assert.deepEqual(dead, { status: "dead", last_error_code: "handler-failed" });
    let releaseSlow, lateError;
    const slowBlocked = new Promise(resolve => { releaseSlow = resolve; });
    const slow = describe({ slowFixture: p.onDocumentCreated({ document: "slow/{id}", timeoutSeconds: 0.02 }, async () => {
      await slowBlocked;
      try { await db.doc("fence/after-timeout").set({ wrong: true }); }
      catch (error) { lateError = error.code; }
    }) });
    const timedQueue = new JobQueue({ store: db, routes: [...routes, ...slow], maxAttempts: 1, maxActive: 1 });
    await db.doc("slow/one").set({ fixture: true }); await timedQueue.dispatchChanges(); await timedQueue.runOne();
    assert.equal(timedQueue.active, 1, "A timed-out but unfinished handler must retain its worker slot");
    await db.doc("slow/two").set({ fixture: true }); await timedQueue.dispatchChanges();
    assert.equal(await timedQueue.runOne(), false);
    assert.equal(Number((await db.pool.query(`SELECT attempts FROM ${schema}.work_jobs WHERE handler='slowFixture' AND status='pending'`)).rows[0].attempts), 0);
    releaseSlow(); await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(lateError, "job-timeout");
    assert.equal((await db.doc("fence/after-timeout").get()).exists, false);
    assert.equal(timedQueue.active, 0);
    timedQueue.stop(); assert.equal(await timedQueue.runOne(), false, "A stopping worker must not claim another job");
    // Scheduler cursor survives restarts and catches up in bounded transactions.
    const schedules = describe({ minuteFixture: p.onSchedule({ schedule: "every 1 minutes", timeZone: "UTC" }, async () => {}) });
    const clockQueue = new JobQueue({ store: db, routes: schedules });
    const time = Date.parse("2026-10-15T12:00:00Z");
    assert.equal(await clockQueue.enqueueSchedules(time), 1);
    assert.equal(await clockQueue.enqueueSchedules(time), 0);
    const restarted = new JobQueue({ store: db, routes: schedules });
    assert.equal(await restarted.enqueueSchedules(time + 400 * 60000), 360);
    assert.equal(await restarted.enqueueSchedules(time + 400 * 60000), 40);
    assert.equal(await restarted.enqueueSchedules(time - 60000), 0, "A backwards clock must not replay schedules");
    const changed = describe({ minuteFixture: p.onSchedule({ schedule: "every 5 minutes", timeZone: "UTC" }, async () => {}) });
    await assert.rejects(new JobQueue({ store: db, routes: changed }).enqueueSchedules(time), /Schedule changed/);
    console.log("Local jobs: atomic dispatch, out-of-order commits, immutable events, receipt replay, leases/fencing, dead letters, restart catch-up and New York DST schedules passed.");
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
})().catch(error => { console.error("Local job integration failed:", error.message); process.exitCode = 1; });
