"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { JobQueue } = require("../local-backend/jobs");
const { WorkerLoop, privateWorkerRoutes } = require("../local-backend/worker-loop");
const { WorkerDiagnostics } = require("../local-backend/worker-diagnostics");

(async () => {
  const diagnostics = new WorkerDiagnostics(), output = {}, privateValue = "private-fixture-must-not-leak";
  const restore = diagnostics.capture(output);
  output.error("Scheduled army resolution failed", { code: "40001", ownerUid: privateValue, message: privateValue });
  output.error("Scheduled army resolution failed", { code: privateValue });
  output.warn(privateValue, { code: privateValue });
  output.log("Scheduled army resolution finished", { scanned: 3, failed: 1, backlogOldestArmyId: privateValue });
  const unsafe = Object.create({ code: "40001" });
  Object.defineProperty(unsafe, "code", { get() { throw Error("Do not invoke a logged getter"); } });
  output.error("Scheduled reward camp payout failed", unsafe);
  const observed = diagnostics.snapshot();
  assert.deepEqual(observed.counts, { log: 1, warn: 1, error: 3, info: 0, debug: 0 });
  assert.deepEqual(observed.events[0].codes, { "40001": 1, unspecified: 1 });
  assert.deepEqual(observed.events[1].outcomes, { scanned: 3, failed: 1 });
  assert.equal(JSON.stringify(observed).includes(privateValue), false);
  observed.events[0].codes["40001"] = 999;
  assert.equal(diagnostics.snapshot().events[0].codes["40001"], 1);
  restore(); assert.equal(output.error, undefined);
  const store = new Store({ schema: "migration_game_loop_" + crypto.randomBytes(5).toString("hex") });
  let loop, release;
  try {
    await store.initialize();
    const runtimeNotices = new WorkerDiagnostics(), undoNotices = runtimeNotices.capture();
    const warningClient = await store.pool.connect();
    try {
      await Promise.all(Array.from({ length: 5 }, () => warningClient.query("SELECT 1")));
      await new Promise(resolve => setImmediate(resolve));
    } finally { warningClient.release(); undoNotices(); }
    assert.equal(runtimeNotices.snapshot().counts.error, 0);
    assert.equal(runtimeNotices.snapshot().counts.warn, 1);
    assert.equal(runtimeNotices.snapshot().events[0].label, "PostgreSQL client concurrent-query deprecation");
    const route = { name: "fixtureIncrement", kind: "created", options: { document: "events/{id}" }, handler: async event => {
      await store.runTransaction(async tx => {
        const ref = store.doc("totals/fixture"), before = await tx.get(ref);
        tx.set(ref, { count: (before.data()?.count || 0) + event.data.data().amount });
      });
    } };
    const inventory = Array.from({ length: 25 }, (_, index) => ({ ...route, name: "fixture" + index }));
    const notification = { ...route, name: "deliverIncomingArmyNotification" };
    assert.equal(privateWorkerRoutes([...inventory, notification]).length, 25);
    assert.throws(() => privateWorkerRoutes(inventory), /inventory/);
    const queue = new JobQueue({ store, routes: [route], maxActive: 2 });
    await queue.initialize();
    let now = Date.now();
    loop = new WorkerLoop({ queue, expiresAt: new Date(now + 60000).toISOString(), now: () => now });
    await store.doc("events/one").set({ amount: 2 }); await store.doc("events/two").set({ amount: 3 });
    for (let i = 0; i < 3; i++) { await loop.tick(); await loop.settle(); }
    assert.equal((await store.doc("totals/fixture").get()).data().count, 5);
    const status = await loop.status();
    assert.equal(status.jobs.complete, 2); assert.equal(status.activeHandlers, 0); assert.equal(status.operationalFailures, 0);
    const dispatch = queue.dispatchChanges;
    queue.dispatchChanges = async () => { throw Error("private-fixture-must-not-leak"); };
    assert.equal(await loop.tick(), false); assert.equal((await loop.status()).operationalFailures, 1);
    queue.dispatchChanges = dispatch;
    now += 61000; assert.equal(await loop.tick(), false); assert.equal(queue.stopping, true);
    assert.equal(await queue.runOne(), false);

    // A transfer can retain many short jobs. One polling tick must refill its
    // slots as jobs finish instead of limiting throughput to two jobs/second.
    let active = 0, maximum = 0, completed = 0;
    const byHandler = new Map();
    const bursts = ["First", "Second"].map(name => ({
      name: "fixtureBurst" + name, kind: "created", options: { document: "burst" + name + "/{id}" },
      handler: async () => {
        active++; maximum = Math.max(maximum, active);
        assert.equal(byHandler.get(name) || 0, 0, "Each handler remains serialized");
        byHandler.set(name, 1);
        await new Promise(resolve => setTimeout(resolve, 5));
        byHandler.set(name, 0); active--; completed++;
      },
    }));
    const burstQueue = new JobQueue({ store, routes: bursts, maxActive: 2 });
    for (let i = 0; i < 12; i++) for (const name of ["First", "Second"]) {
      await store.doc("burst" + name + "/" + i).set({ fixture: true });
    }
    loop = new WorkerLoop({ queue: burstQueue, expiresAt: new Date(Date.now() + 60000).toISOString() });
    await loop.tick(); await loop.tick(); await loop.settle();
    assert.equal(completed, 24, "A bounded batch drains short retained jobs without waiting for another poll");
    assert(maximum <= 2, "Repeated ticks cannot exceed the existing concurrency limit");
    assert.equal((await loop.status()).operationalFailures, 0);
    loop.stop();

    let started, starts = 0;
    const entered = new Promise(resolve => { started = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    const slow = { name: "fixtureShutdown", kind: "created", options: { document: "shutdown/{id}" }, handler: async () => {
      starts++; started(); await blocked; await store.doc("totals/forbidden-after-stop").set({ wrong: true });
    } };
    const stoppingQueue = new JobQueue({ store, routes: [route, slow], maxActive: 1 });
    loop = new WorkerLoop({ queue: stoppingQueue, expiresAt: new Date(Date.now() + 60000).toISOString() });
    await store.doc("shutdown/one").set({ fixture: true });
    await store.doc("shutdown/two").set({ fixture: true }); loop.start(); await entered;
    assert.throws(() => loop.start(), /already/);
    loop.stop(); release(); await loop.settle();
    assert.equal(starts, 1, "Stopping a drain must not start another retained job");
    assert.equal((await store.doc("totals/forbidden-after-stop").get()).exists, false);
    const failed = (await store.pool.query(`SELECT status,last_error_code FROM ${store.schema}.work_jobs WHERE handler='fixtureShutdown' AND attempts=1`)).rows[0];
    assert.deepEqual(failed, { status: "pending", last_error_code: "job-worker-stopping" });
    assert.equal(Number((await store.pool.query(`SELECT count(*) FROM ${store.schema}.work_jobs WHERE handler='fixtureShutdown' AND attempts=0 AND status='pending'`)).rows[0].count), 1);
    console.log("Worker loop: private handler inventory, bounded dispatch/execution, aggregate status, safe failure counting, expiry and shutdown write fencing passed.");
  } finally {
    loop?.stop(); release?.(); await loop?.settle();
    await store.pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`); await store.close();
  }
})().catch(error => { console.error("Worker-loop integration failed:", error.message); process.exitCode = 1; });
