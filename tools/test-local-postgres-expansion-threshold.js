"use strict";
const assert = require("node:assert/strict"), { randomBytes } = require("node:crypto");
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_expansion_" + randomBytes(4).toString("hex");
  const game = require("../functions"), db = require("../functions/platform").store;
  const topology = require("../functions/coreExpansionTopology");
  let identity = {};
  const call = (name, uid, data = {}) => game[name]({ auth: { uid, token: { email_verified: true,
    firebase: { sign_in_provider: "google.com" } } }, data: { ...identity, ...data } });
  try {
    await db.initialize();
    const seasons = require("../functions/season-rewards");
    const prior = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
    await seasons.arm(db, prior, seasons.seasonInfo(prior).startsAtMs + 1);
    const info = await call("getRealmInfo", "expansion-first");
    assert.equal(info.worldTopology, "core-expansion-v1");
    assert.equal(info.startingCityCapacity, 122850);
    identity = { clientReleaseId: info.currentReleaseId, clientWorldId: info.worldId,
      clientResetGeneration: info.resetGeneration, clientRealmShardId: info.sharedRealmId };
    const stateRef = db.doc(`realmGenerations/${info.resetGeneration}/expansion/current`);
    const state = async () => (await stateRef.get()).data();
    const cities = region => db.collection(`islands/${info.worldId}--shard_0001--${region}/cities`);
    const neutrals = async region => (await cities(region).get()).docs.filter(s => !s.data().ownerUid && s.data().ownerKind === "neutral");
    const depleteTo = async (region, remaining) => {
      const docs = await neutrals(region); assert(docs.length >= remaining);
      const batch = db.batch();
      for (const doc of docs.slice(remaining)) batch.update(doc.ref, { ownerKind: "player", ownerUid: "fixture-holder", ownerName: "Fixture holder" });
      await batch.commit(); assert.equal((await neutrals(region)).length, remaining);
    };
    const initial = await state(), source = initial.admittingRegionIds[0];
    const archivedRef = db.doc("realmGenerations/archived-threshold-fixture/expansion/current");
    const archived = topology.createInitialExpansionState("archived-threshold-fixture");
    await archivedRef.set(archived);
    await depleteTo(source, 20);
    const first = await call("claimStartingCity", "expansion-first", { playerName: "Threshold First" });
    assert.equal(first.mainRegionId, source); assert.equal((await neutrals(source)).length, 19);
    assert.deepEqual((await state()).admittingRegionIds, [source], "Former threshold must still admit players");
    assert.equal((await state()).nextAdmissionOrdinal, 1);
    await depleteTo(source, 11);
    const joined = await Promise.all(["expansion-second", "expansion-third"].map((uid, i) =>
      call("claimStartingCity", uid, { playerName: `Threshold Ruler ${i + 2}` })));
    assert.equal(joined.filter(c => c.mainRegionId === source).length, 1, "Only the final eligible claim may leave 10 cities");
    assert.equal(new Set(joined.map(c => c.mainRegionId + ":" + c.cityId)).size, 2);
    assert.equal((await neutrals(source)).length, 10);
    const after = await state();
    assert.equal(after.nextAdmissionOrdinal, 3);
    assert.deepEqual(after.activeRegionIds, initial.activeRegionIds, "Pre-opened maps should not be regenerated");
    assert.equal(after.admittingRegionIds.length, 2); assert(!after.admittingRegionIds.includes(source));
    assert.equal(Object.values(after.activationReceipts).filter(r => r.sourceRegionId === source).length, 1);
    assert.equal(Object.values(after.activationReceipts).find(r => r.sourceRegionId === source).remainingNpcCities, 10);
    const replay = await call("claimStartingCity", "expansion-first");
    assert(replay.alreadyClaimed); assert.equal(replay.cityId, first.cityId);
    assert.deepEqual(await state(), after, "Claim replay must not allocate another pair");
    const depleted = after.admittingRegionIds[0], healthy = after.admittingRegionIds[1];
    await depleteTo(depleted, 9);
    const recovered = await call("claimStartingCity", "expansion-fourth", { playerName: "Threshold Fourth" });
    assert.notEqual(recovered.mainRegionId, depleted);
    const final = await state();
    assert.equal(final.nextAdmissionOrdinal, 5); assert.equal(final.pendingActivation, null);
    assert(final.admittingRegionIds.includes(healthy)); assert(!final.admittingRegionIds.includes(depleted));
    assert.equal(final.admittingRegionIds.length, 3);
    assert.equal(Object.values(final.activationReceipts).find(r => r.sourceRegionId === depleted).remainingNpcCities, 9);
    assert.deepEqual((await archivedRef.get()).data(), archived);
    assert.deepEqual((await db.doc("realmConfig/current").get()).data().resetGeneration, info.resetGeneration);
    console.log("Local expansion threshold passed: 20/19 remain eligible, concurrent 11-to-10 closure, exact-once pair, replay, 9-city capture recovery, preserved maps and archived generation.");
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
