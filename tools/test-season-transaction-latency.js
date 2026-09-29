"use strict";
const assert = require("node:assert/strict");
const R = require("../functions/season-rewards");
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function fixture(season = "realm-2026-09") {
  const info = R.seasonInfo(season), reads = [], writes = [], gate = deferred();
  const db = { doc: path => ({ path }) };
  let now = info.startsAtMs + 1000;
  const transaction = {
    getAll: async (...refs) => { reads.push(refs.map(ref => ref.path)); await gate.promise;
      return refs.map(ref => ({ exists: true, data: () => ({ status: ref.path.endsWith(season) ? "open" : "captured" }) })); },
  };
  for (const method of ["set", "create", "update", "delete"]) transaction[method] = (...args) => { writes.push([method, ...args]); return transaction; };
  const board = db.doc(`leaderboards/${info.boardId}/entries/test-ruler`);
  return { db, transaction, board, info, reads, writes, gate, clock: () => now, setTime: time => { now=time; } };
}
async function main() {
  const f = fixture(), economyRead = deferred(); let prepared = false;
  const result = R.guardTransaction(f.db, f.transaction, async tx => {
    R.prefetchTransaction(tx, f.info.seasonId);
    R.prefetchTransaction(tx, f.info.seasonId);
    await economyRead.promise; prepared = true;
    tx.set(f.board, { kingPower: 20 }); return "accepted";
  }, f.info, f.clock);
  await tick();
  assert.equal(f.reads.length, 1, "The season read must start while the independent economy read is pending, once per attempt.");
  assert.equal(prepared, false);
  economyRead.resolve(); await tick();
  assert.equal(f.writes.length, 0, "Economy completion cannot bypass a pending fence.");
  f.gate.resolve(); assert.equal(await result, "accepted"); assert.equal(f.writes.length, 1);

  const october = fixture("realm-2026-10"); october.gate.resolve();
  await R.guardTransaction(october.db, october.transaction, tx => tx.set(october.board, {}), october.info, october.clock);
  assert.deepEqual(october.reads, [["seasonResults/realm-2026-10", "seasonResults/realm-2026-09"]], "Current and previous fences must share one database read.");
  for (const status of [undefined, "open", "closing"]) {
    const blocked = fixture("realm-2026-10");
    blocked.transaction.getAll = async () => [
      { exists: true, data: () => ({status:"open"}) },
      { exists: status !== undefined, data: () => status ? {status} : undefined },
    ];
    await assert.rejects(R.guardTransaction(blocked.db,blocked.transaction,tx=>{
      R.prefetchTransaction(tx,blocked.info.seasonId);tx.set(blocked.board,{});
    },blocked.info,blocked.clock),/standings are being preserved/);
    assert.equal(blocked.writes.length,0);
  }
  const missing = fixture();
  missing.transaction.getAll=async()=>[{exists:false,data:()=>undefined}];
  await R.guardTransaction(missing.db,missing.transaction,tx=>tx.set(missing.board,{}),missing.info,missing.clock);
  assert.equal(missing.writes[0][0],"create");
  assert.equal(missing.writes[0][1].path,"seasonResults/realm-2026-09");
  assert.equal(missing.writes[1][0],"set","A missing open header must be armed atomically with the original score.");

  const expired = fixture(), body = deferred(); expired.gate.resolve();
  const late = R.guardTransaction(expired.db, expired.transaction, async tx => {
    R.prefetchTransaction(tx, expired.info.seasonId); await body.promise; tx.set(expired.board, {});
  }, expired.info, expired.clock);
  await tick(); expired.setTime(expired.info.endsAtMs); body.resolve();
  await assert.rejects(late, /season has closed/i); assert.equal(expired.writes.length, 0);

  const failed = fixture(), work = deferred();
  const rejected = R.guardTransaction(failed.db, failed.transaction, async tx => {
    R.prefetchTransaction(tx, failed.info.seasonId); await work.promise; tx.set(failed.board, {});
  }, failed.info, failed.clock);
  const rejection = assert.rejects(rejected, /synthetic fence outage/);
  failed.gate.reject(new Error("synthetic fence outage")); await tick(); work.resolve(); await rejection;
  assert.equal(failed.writes.length, 0);

  const aborted = fixture(), operation = deferred();
  const abort = R.guardTransaction(aborted.db, aborted.transaction, async tx => {
    R.prefetchTransaction(tx, aborted.info.seasonId); await operation.promise; throw Error("invalid action");
  }, aborted.info, aborted.clock);
  const abortion = assert.rejects(abort, /invalid action/);
  operation.resolve(); aborted.gate.reject(new Error("also failed")); await abortion;
  assert.equal(aborted.writes.length, 0);

  // A retry gets its own authoritative snapshots; no cross-request cache.
  f.transaction.getAll = async (...refs) => { f.reads.push(refs.map(ref=>ref.path)); return refs.map(()=>({exists:true,data:()=>({status:"closing"})})); };
  await assert.rejects(R.guardTransaction(f.db, f.transaction, tx => tx.set(f.board, {}), f.info, f.clock), /season has closed/i);
  assert.equal(f.reads.length, 2); assert.equal(f.writes.length, 1);

  const heartbeat = fixture(); heartbeat.gate.resolve();
  await R.guardTransaction(heartbeat.db, heartbeat.transaction, tx => tx.set(heartbeat.db.doc("players/test-ruler/serverMembership/current"), {}), heartbeat.info, heartbeat.clock);
  assert.equal(heartbeat.reads.length, 0, "Unrelated heartbeat transactions must not acquire a season fence.");
  assert.equal(heartbeat.writes.length, 1);
  console.log("Season transaction latency: overlapped reads, one batched fence, no unrelated reads, deadline/retry/error safety passed.");
}
main().catch(error => { console.error(error); process.exitCode=1; });
