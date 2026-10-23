"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { Store, Timestamp } = require("../local-backend/store"), { ClientData } = require("../local-backend/client-data");
const T = require("../functions/holding-towers");
(async () => {
  const db = new Store({ schema: "migration_game_watch_" + crypto.randomBytes(5).toString("hex") });
  const data = new ClientData(db), auth = { uid: "watch-fixture", token: { email_verified: true } };
  const scope = { resetGeneration: "realm-2026-10", worldId: "main-realm-2026-10", realmShardId: "shard_0001" }, clanId = "watch-clan";
  const targets = [{ path: `clans/${clanId}/messages/message` }, { path: `players/${auth.uid}` }];
  const read = revisions => data.read(auth, targets, { partial: true, revisions });
  try {
    await db.initialize(); await db.doc("realmConfig/current").set(scope);
    await db.doc(`players/${auth.uid}`).set({ ...scope, clanId });
    await db.doc(`clans/${clanId}`).set({ ...scope, status: "active" });
    const member = db.doc(`clans/${clanId}/members/${auth.uid}`);
    await member.set({ ...scope, uid: auth.uid, clanId, status: "active", joinedAtMs: Date.now() - 7200000 });
    await db.doc(targets[0].path).set({ ...scope, status: "visible", text: "Private fictional clan text" });
    const legacy = await read(); assert(!("revision" in legacy[0])); assert(legacy[0].documents.length);
    const first = await read([null, null]), tokens = first.map(r => r.revision);
    assert(tokens.every(v => /^[a-f0-9]{64}$/.test(v)));
    const unchanged = await read(tokens); assert(unchanged.every(r => r.unchanged));
    assert(JSON.stringify(unchanged).length < JSON.stringify(first).length / 2);
    assert(!JSON.stringify(unchanged).includes("Private fictional"));
    assert(!(await read([...tokens].reverse()))[0].unchanged, "Token crossed target boundaries");
    await db.doc(targets[0].path).update({ text: "New private text" });
    const changed = await read(tokens); assert(changed[0].documents); assert(changed[1].unchanged);
    await member.update({ status: "removed" });
    const removed = await read(changed.map(r => r.revision));
    assert.equal(removed[0].error.code, "permission-denied"); assert(removed[1].unchanged);
    await member.update({ status: "active" });
    const towerId = T.TOWERS[0].id, tower = db.doc(`holdingTowers/${towerId}`);
    await tower.set({ ...T.createNeutralTowerState(towerId), ...scope, id: towerId, ownerKind: "clan", clanId, ownershipRevision: 1, buildings: { scout_lodge: 1 } });
    const signal = { path: `clans/${clanId}/scoutIntelSignals/current` };
    await db.doc(signal.path).set({ ...scope, towerId, ownershipRevision: 1 });
    const intel = await data.read(auth, [signal], { partial: true, revisions: [null] });
    assert(intel[0].documents);
    await tower.update({ ownershipRevision: 2 });
    assert.equal((await data.read(auth, [signal], { partial: true, revisions: [intel[0].revision] }))[0].error.code, "permission-denied", "Old ownership token retained intelligence access");
    const quest = { path: `clans/${clanId}/questProgress/fixture` }, realNow = Date.now;
    await db.doc(quest.path).set({ ...scope, questPeriodId: "fixture", weekStartAt: Timestamp.fromMillis(realNow() - 1000), weekEndAt: Timestamp.fromMillis(realNow() + 10000) });
    const timed = await data.read(auth, [quest], { partial: true, revisions: [null] });
    try {
      Date.now = () => realNow() + 20000;
      assert.equal((await data.read(auth, [quest], { partial: true, revisions: [timed[0].revision] }))[0].error.code, "permission-denied", "Unchanged data bypassed time-based permission");
    } finally { Date.now = realNow; }
    await db.doc("realmConfig/current").set({ ...scope, resetGeneration: "realm-2026-11", worldId: "main-realm-2026-11" });
    assert.equal((await read(tokens))[0].error.code, "permission-denied");
    assert((await data.read({ uid: "other-fixture" }, targets, { partial: true, revisions: tokens })).every(r => r.error?.code === "permission-denied"));
    for (const revisions of [[], ["bad", null], [null], {}, [0, null]]) await assert.rejects(read(revisions), { code: "invalid-argument" });
    console.log("Watch revisions: legacy full payloads, small unchanged replies, changed data, target/principal binding, fresh membership/ownership/season/expiry authorization and malformed-token rejection passed.");
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
