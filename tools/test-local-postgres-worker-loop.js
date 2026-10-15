"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { JobQueue } = require("../local-backend/jobs");
const { WorkerLoop, privateWorkerRoutes } = require("../local-backend/worker-loop");

(async () => {
  const store = new Store({ schema: "migration_game_loop_" + crypto.randomBytes(5).toString("hex") });
  let loop, release;
  try {
    await store.initialize();
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

    let started;
    const entered = new Promise(resolve => { started = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    const slow = { name: "fixtureShutdown", kind: "created", options: { document: "shutdown/{id}" }, handler: async () => {
      started(); await blocked; await store.doc("totals/forbidden-after-stop").set({ wrong: true });
    } };
    const stoppingQueue = new JobQueue({ store, routes: [route, slow], maxActive: 1 });
    loop = new WorkerLoop({ queue: stoppingQueue, expiresAt: new Date(Date.now() + 60000).toISOString() });
    await store.doc("shutdown/one").set({ fixture: true }); loop.start(); await entered;
    assert.throws(() => loop.start(), /already/);
    loop.stop(); release(); await loop.settle();
    assert.equal((await store.doc("totals/forbidden-after-stop").get()).exists, false);
    const failed = (await store.pool.query(`SELECT status,last_error_code FROM ${store.schema}.work_jobs WHERE handler='fixtureShutdown'`)).rows[0];
    assert.deepEqual(failed, { status: "pending", last_error_code: "job-worker-stopping" });
    console.log("Worker loop: private handler inventory, bounded dispatch/execution, aggregate status, safe failure counting, expiry and shutdown write fencing passed.");
  } finally {
    loop?.stop(); release?.(); await loop?.settle();
    await store.pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`); await store.close();
  }
})().catch(error => { console.error("Worker-loop integration failed:", error.message); process.exitCode = 1; });
