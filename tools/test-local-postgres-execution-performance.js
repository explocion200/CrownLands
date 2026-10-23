"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { Store, FieldValue } = require("../local-backend/store"), { JobQueue } = require("../local-backend/jobs");
const { readJobStatus } = require("../local-backend/job-status"), Timing = require("../functions/operation-timing");
(async () => {
  const db = new Store({ schema: "migration_game_execution_" + crypto.randomBytes(5).toString("hex") });
  const s = db.schema, statements = []; let record = false;
  db.pool.on("connect", client => { const query = client.query; client.query = function(...args) { if (record) statements.push(String(args[0])); return query.apply(this, args); }; });
  try {
    await db.initialize(); record = true;
    const timing = await Timing.run(async () => {
      await db.runTransaction(async tx => { for (let i = 0; i < 80; i++) tx.create(db.doc(`fixture/${i}`), { count: i }); });
      return Timing.snapshot();
    });
    record = false;
    assert.equal(timing.dbWriteRows, 80); assert.equal(timing.dbWriteQueries, 6, "80 documents/journal entries should need six bounded bulk writes");
    assert(timing.phaseDurationMs.dbWrite >= 0);
    assert.equal((await db.pool.query(`SELECT count(*) FROM ${s}.changes`)).rows[0].count, "80");
    await db.runTransaction(async tx => {
      const receipts = db.doc("receipts/atomic"); await tx.get(receipts);
      for (let i = 0; i < 65; i++) tx.update(db.doc(`fixture/${i}`), { count: FieldValue.increment(1) });
      for (let i = 65; i < 75; i++) tx.delete(db.doc(`fixture/${i}`));
      tx.create(receipts, { committed: true });
    });
    const history = (await db.pool.query(`SELECT path,before_body,after_body FROM ${s}.changes ORDER BY id`)).rows;
    assert.equal(history.length, 156);
    assert(history.slice(0, 80).every(row => row.before_body === null && row.after_body));
    assert(history.slice(80).filter(row => !row.after_body).length === 10);
    assert.equal((await db.doc("fixture/0").get()).data().count, 1);
    const prior = history.length;
    await db.pool.query(`ALTER TABLE ${s}.changes ADD CONSTRAINT reject_fixture CHECK(path<>'receipts/reject')`);
    await assert.rejects(db.runTransaction(async tx => {
      tx.update(db.doc("fixture/0"), { count: 999 }); tx.create(db.doc("receipts/reject"), { committed: true });
    }));
    assert.equal((await db.doc("fixture/0").get()).data().count, 1);
    assert(!(await db.doc("receipts/reject").get()).exists);
    assert.equal(Number((await db.pool.query(`SELECT count(*) FROM ${s}.changes`)).rows[0].count), prior, "A failed journal insert committed partial documents or receipts");
    const q = new JobQueue({ store: db, routes: [{ name: "FixtureSchedule", kind: "schedule", options: { schedule: "every 1 minutes", timeZone: "UTC" }, handler: async () => {} }] });
    await q.initialize();
    // Simulate an existing installation before the one-time counter migration.
    await db.pool.query(`DROP TRIGGER maintain_job_totals ON ${s}.work_jobs; DROP TABLE ${s}.work_job_totals;
      INSERT INTO ${s}.work_jobs(job_key,handler,kind,event,status,finished_at)
      SELECT 'old:'||n,'FixtureSchedule','schedule','{}','complete',now()-interval '10 days' FROM generate_series(1,2000) n;`);
    await q.initialize(); assert.equal((await readJobStatus(q)).complete, 2000);
    statements.length = 0; record = true;
    await readJobStatus(q); await readJobStatus(q); record = false;
    assert.equal(statements.length, 2); assert(statements.every(sql => sql.includes("WHERE status IN ('pending','running')") && sql.includes('work_job_totals')));
    const now = Math.floor(Date.now()/60000)*60000;
    await q.enqueueSchedules(now); statements.length = 0; record = true;
    for (let i=0;i<20;i++) assert.equal(await q.enqueueSchedules(now+1000),0);
    record = false; assert.equal(statements.length,0,"Unchanged schedule minute hit the database");
    assert(await q.runOne()); assert.equal((await readJobStatus(q)).complete,2001);
    await db.pool.query(`UPDATE ${s}.work_jobs SET status='dead' WHERE job_key='old:1'`);
    assert.deepEqual(await readJobStatus(q),{pending:0,running:0,complete:2000,dead:1});
    await assert.rejects(q.transaction(async client => { await client.query(`UPDATE ${s}.work_jobs SET status='pending' WHERE job_key='old:2'`); throw Error("Rollback fixture"); }));
    assert.equal((await readJobStatus(q)).complete,2000);
    await q.initialize(); assert.equal((await readJobStatus(q)).complete,2000,"Restart recounted or doubled history");
    // Dispatch needs metadata only; full bodies remain available to the handler.
    statements.length=0;record=true;await q.dispatchChanges(200);record=false;
    assert(statements.some(sql=>sql.includes('before_body IS NOT NULL AS had_before')));
    assert(!statements.some(sql=>sql.startsWith('SELECT id,path,before_body,after_body')));
    console.log("Execution performance: batched documents/journal snapshots and rollback, bounded write counts, atomic historical counters, indexed status reads, unchanged schedule-minute skip, restart and metadata-only dispatch passed.");
  } finally { record=false;await db.pool.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
