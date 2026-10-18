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
    const claims = new Array(50); let cursor = 0;
    const startedAt = Date.now();
    await Promise.all(Array.from({ length: 10 }, async () => {
      while (cursor < claims.length) {
        const index = cursor++;
        claims[index] = await call("claimStartingCity", `burst-${index}`, { playerName: `Burst Ruler ${index + 1}` });
      }
    }));
    assert(claims.every(claim => claim.ok && claim.realmShardId === "shard_0001"));
    assert.equal(new Set(claims.map(claim => `${claim.mainRegionId}:${claim.cityId}`)).size, 50);
    const state = (await db.doc(`realmGenerations/${info.resetGeneration}/expansion/current`).get()).data();
    assert.equal(state.nextAdmissionOrdinal, 3);
    assert.equal(state.pendingActivation, null);
    assert.equal(Object.keys(state.activationReceipts).length, 1);
    const firstRegion = topology.getRegionAtActivationOrdinal(0).id;
    assert.equal(claims.filter(claim => claim.mainRegionId === firstRegion).length, 30);
    const sourceCities = (await db.collection(`islands/${info.worldId}--shard_0001--${firstRegion}/cities`).get()).docs;
    assert.equal(sourceCities.filter(doc => !doc.data().ownerUid && doc.data().ownerKind === "neutral").length, 10);
    assert(!state.admittingRegionIds.includes(firstRegion));
    const successorCounts = state.admittingRegionIds.map(id => claims.filter(claim => claim.mainRegionId === id).length);
    assert.equal(successorCounts.reduce((sum, count) => sum + count, 0), 20);
    assert(Math.max(...successorCounts) - Math.min(...successorCounts) <= 1);
    const replay = await call("claimStartingCity", "burst-0");
    assert(replay.alreadyClaimed); assert.equal(replay.cityId, claims[0].cityId);
    console.log(`Local admission burst passed: 50 unique claims at concurrency 10, 30/10/10 placement, one expansion pair, preserved reserve and replay; ${Date.now() - startedAt} ms.`);
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
