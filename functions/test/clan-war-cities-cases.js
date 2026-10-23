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
  async function capture(cityId, before, after, extra = {}, eventId = randomUUID(), occurredAtMs = Date.now()) {
    const ref = cityRef("west", cityId), target = { ...r, id: cityId, name: cityId, ownerUid: before, ...extra };
    const [defenderProfile, attackerProfile] = await Promise.all([profileRef(before).get(), profileRef(after).get()]);
    await db.runTransaction(async tx => {
      const context = await service.prepareCapture(tx, { target, regionId: "west", defenderUid: before,
        defenderProfile: defenderProfile.data(), attackerUid: after, attackerProfile: attackerProfile.data() });
      tx.set(ref, { ...target, ownerUid: after, ownerName: attackerProfile.data().playerName });
      service.commitCapture(tx, context, occurredAtMs, eventId);
    });
  }
  const log = (uid = u[0], cursor = "") => service.execute(uid, { action: "log", cursor });
  assert.deepEqual((await log()).entries, []);
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
  let history = (await log()).entries;
  assert.equal(history.length, 2);
  assert(history.some(e => e.kind === "lost" && e.text === "Fictional ruler 0 lost first to Fictional ruler 2."));
  assert(history.some(e => e.kind === "recovered" && e.text === "Fictional ruler 1 recovered first from Fictional ruler 2 for Fictional ruler 0."));
  assert.equal((await list()).logVersion, 1);
  for (const uid of [u[2], u[3]]) await assert.rejects(log(uid), { code: "permission-denied" });
  for (const input of [null, { action: "log", clanId: clan }, { action: "log", text: "forged" },
    { action: "log", cursor: "f".repeat(64) }, { action: "log", cursor: [] }]) {
    await assert.rejects(service.execute(u[0], input), { code: "invalid-argument" });
  }
  await capture("first", u[1], u[2]);
  assert.equal((await list()).entries[0].lossEventId, originalToken, "Losing a recovered city must retain its original member");
  await capture("first", u[2], u[1]);
  const request = returnInput((await list(u[1])).entries[0]);
  const responses = await Promise.all([service.execute(u[1], request), service.execute(u[1], request)]);
  assert(responses.some(res => res.replayed)); assert.equal((await list()).entries.length, 0);
  assert.equal((await cityRef("west", "first").get()).data().ownerUid, u[0]);
  await assert.rejects(service.execute(u[1], { ...request, key: "f".repeat(64) }), { code: "already-exists" });
  history = (await log()).entries;
  assert.equal(history.length, 5, "History survives closing the claim and concurrent return retry");
  assert.equal(history.filter(e => e.kind === "returned").length, 1);
  assert(history.some(e => e.text === "Fictional ruler 1 chose to return first to Fictional ruler 0."));
  assert.deepEqual(Object.keys(history[0]).sort(), ["kind", "occurredAtMs", "text"]);
  assert(!JSON.stringify(history).includes("must-not-leak"));
  assert(history.every((e, i) => i === 0 || e.occurredAtMs <= history[i-1].occurredAtMs));
  await capture("first", u[0], u[2]);
  assert.notEqual((await list()).entries[0].lossEventId, originalToken);
  await capture("first", u[2], u[1]);
  await assert.rejects(service.execute(u[1], { ...request, operationId: randomUUID() }), { code: "failed-precondition" });
  await memberRef(u[0]).delete();
  await assert.rejects(log(), { code: "permission-denied" });
  assert.equal((await log(u[1])).entries.length, 7, "Former contributors do not erase clan history");
  assert.equal((await list(u[1])).entries.length, 0);
  await assert.rejects(service.execute(u[1], returnInput({ ...request, lossEventId: (await db.doc(`clans/${clan}/warCities/${request.key}`).get()).data().lossEventId })), { code: "failed-precondition" });
  await memberRef(u[0]).set({ ...r, uid: u[0], status: "active" });
  await capture("first", u[1], u[0]); assert.equal((await list()).entries.length, 0, "Direct recovery must close the loss");
  assert.equal((await log()).entries.length, 8, "Failed returns must not be logged");
  assert((await log()).entries.some(e => e.text.endsWith("for themselves.")));
  await capture("objective", u[0], u[2], { kind: "stronghold" });
  await capture("main", u[0], u[2], { isMainCity: true }); assert.equal((await list()).entries.length, 0);
  assert.equal((await log()).entries.length, 8, "Main Cities and objectives do not create history");
  const tieTime = Date.now(), eventId = randomUUID();
  for (let i = 0; i < 27; i++) await capture(`page_${i}`, u[0], u[2], {}, i === 0 ? eventId : randomUUID(), tieTime);
  await capture("page_0", u[0], u[2], {}, eventId, tieTime);
  const older = await log();
  const rest = await log(u[0], older.nextCursor);
  assert.equal(older.entries.length, 25); assert.equal(rest.entries.length, 10); assert.equal(rest.nextCursor, "");
  assert.equal(new Set([...older.entries, ...rest.entries].map(e => `${e.text}:${e.occurredAtMs}`)).size, 35,
    "Stable event IDs and equal-timestamp pagination cannot duplicate or lose events");
  const ref = db.doc(`clans/${clan}/warCityEvents/foreign`);
  for (const foreign of [{resetGeneration:"old"}, {realmShardId:"other"}, {worldId:"other"}]) {
    await ref.set({...r,...foreign,kind:"lost",text:"private-foreign",occurredAtMs:Date.now(),orderKey:"9999999999999999_"+"f".repeat(64)});
    assert(!(await log()).entries.some(e=>e.text==="private-foreign"));
  }
  await ref.delete();
  const first = await list(), next = await service.execute(u[0], { action: "list", cursor: first.nextCursor });
  assert.equal(first.entries.length, 25); assert.equal(next.entries.length, 2); assert.equal(next.nextCursor, "");
  assert.equal(new Set([...first.entries, ...next.entries].map(e => e.key)).size, 27);
  await profileRef(u[1]).update({ resetGeneration: "archived" });
  await assert.rejects(list(u[1]), { code: "permission-denied" });
  await assert.rejects(log(u[1]), { code: "permission-denied" });
  await db.doc(`clans/${clan}`).update({ status: "disbanded" });
  await assert.rejects(list(), { code: "permission-denied" });
  await assert.rejects(log(), { code: "permission-denied" });
  assert(transfers >= 1);
  console.log("War Cities: capture lineage, direct recovery, membership/realm isolation, private summaries, pagination, concurrent retry, stale-loss protection, durable event history, tied pagination, failed-return exclusion and log privacy passed.");
};
