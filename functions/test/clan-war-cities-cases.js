"use strict";
const assert = require("node:assert/strict"), { randomUUID } = require("node:crypto");
const W = require("../clan-war-cities");
module.exports = async ({ db }) => {
  const r = { worldId: "war-test-world", resetGeneration: "war-test-generation", realmShardId: "shard_0001" };
  const clan = `war_${randomUUID()}`, u = ["original", "rescuer", "enemy", "outsider"].map(n => `${n}_${randomUUID()}`);
  const cityRef = (region, id) => db.doc(`islands/${r.worldId}--${r.realmShardId}--${region}/cities/${id}`);
  const memberRef = uid => db.doc(`clans/${clan}/members/${uid}`), profileRef = uid => db.doc(`players/${uid}`);
  await db.doc(`clans/${clan}`).set({ ...r, status: "active" });
  for (const [i, uid] of u.entries()) {
    await profileRef(uid).set({ ...r, uid, clanId: i < 2 ? clan : "", playerName: `Fictional ruler ${i}`, secret: "must-not-leak" });
    if (i < 2) await memberRef(uid).set({ ...r, uid, clanId: clan, status: "active", role: "member" });
  }
  class Failure extends Error { constructor(code, message) { super(message); this.code = code; } }
  let transfers = 0;
  const service = W.createService({ db, HttpsError: Failure, realm: () => r, assertWorld() {}, validateProfile() {}, cityRef,
    regularCity: c => c && c.kind !== "stronghold",
    transact: fn => db.runTransaction(fn), transfer: async (tx, { uid, loss }) => {
      const ref = cityRef(loss.regionId, loss.cityId), city = (await tx.get(ref)).data();
      if (city.ownerUid !== uid) throw new Failure("permission-denied", "Not the current owner");
      tx.update(ref, { ownerUid: loss.originalOwnerUid }); transfers++; return { ok: true };
    } });
  async function capture(cityId, before, after, extra = {}) {
    const ref = cityRef("west", cityId), target = { ...r, id: cityId, name: cityId, ownerUid: before, ...extra };
    const [defenderProfile, attackerProfile] = await Promise.all([profileRef(before).get(), profileRef(after).get()]);
    await db.runTransaction(async tx => {
      const context = await service.prepareCapture(tx, { target, regionId: "west", defenderUid: before,
        defenderProfile: defenderProfile.data(), attackerUid: after, attackerProfile: attackerProfile.data() });
      tx.set(ref, { ...target, ownerUid: after, ownerName: attackerProfile.data().playerName });
      service.commitCapture(tx, context, Date.now(), randomUUID());
    });
  }
  const list = uid => service.execute(uid || u[0]);
  const returnInput = entry => ({ action: "return", key: entry.key, lossEventId: entry.lossEventId, operationId: randomUUID() });
  await capture("first", u[0], u[2]);
  let entries = (await list()).entries;
  assert.equal(entries.length, 1); assert.equal(entries[0].status, "lost"); assert(!entries[0].canReturn);
  assert(!JSON.stringify(entries).includes("must-not-leak"));
  await assert.rejects(list(u[2]), { code: "permission-denied" });
  await assert.rejects(service.execute(u[1], { action: "list", clanId: clan }), { code: "invalid-argument" });
  await assert.rejects(service.execute(u[1], returnInput(entries[0])), { code: "permission-denied" });
  await capture("first", u[2], u[1]);
  entries = (await list(u[1])).entries;
  assert.equal(entries[0].status, "recovered"); assert(entries[0].canReturn);
  const originalToken = entries[0].lossEventId;
  await capture("first", u[1], u[2]);
  assert.equal((await list()).entries[0].lossEventId, originalToken, "Losing a recovered city must retain its original member");
  await capture("first", u[2], u[1]);
  const request = returnInput((await list(u[1])).entries[0]);
  const responses = await Promise.all([service.execute(u[1], request), service.execute(u[1], request)]);
  assert(responses.some(res => res.replayed)); assert.equal((await list()).entries.length, 0);
  assert.equal((await cityRef("west", "first").get()).data().ownerUid, u[0]);
  await assert.rejects(service.execute(u[1], { ...request, key: "f".repeat(64) }), { code: "already-exists" });
  await capture("first", u[0], u[2]);
  assert.notEqual((await list()).entries[0].lossEventId, originalToken);
  await capture("first", u[2], u[1]);
  await assert.rejects(service.execute(u[1], { ...request, operationId: randomUUID() }), { code: "failed-precondition" });
  await memberRef(u[0]).delete(); assert.equal((await list(u[1])).entries.length, 0);
  await assert.rejects(service.execute(u[1], returnInput({ ...request, lossEventId: (await db.doc(`clans/${clan}/warCities/${request.key}`).get()).data().lossEventId })), { code: "failed-precondition" });
  await memberRef(u[0]).set({ ...r, uid: u[0], status: "active" });
  await capture("first", u[1], u[0]); assert.equal((await list()).entries.length, 0, "Direct recovery must close the loss");
  await capture("objective", u[0], u[2], { kind: "stronghold" });
  await capture("main", u[0], u[2], { isMainCity: true }); assert.equal((await list()).entries.length, 0);
  for (let i = 0; i < 27; i++) await capture(`page_${i}`, u[0], u[2]);
  const first = await list(), next = await service.execute(u[0], { action: "list", cursor: first.nextCursor });
  assert.equal(first.entries.length, 25); assert.equal(next.entries.length, 2); assert.equal(next.nextCursor, "");
  assert.equal(new Set([...first.entries, ...next.entries].map(e => e.key)).size, 27);
  await profileRef(u[1]).update({ resetGeneration: "archived" });
  await assert.rejects(list(u[1]), { code: "permission-denied" });
  await db.doc(`clans/${clan}`).update({ status: "disbanded" });
  await assert.rejects(list(), { code: "permission-denied" });
  assert(transfers >= 1);
  console.log("War Cities: capture lineage, direct recovery, membership/realm isolation, private summaries, pagination, concurrent retry and stale-loss protection passed.");
};
