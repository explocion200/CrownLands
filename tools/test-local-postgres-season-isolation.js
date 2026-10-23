"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { ClientData } = require("../local-backend/client-data");
const { encode } = require("../local-backend/values");

(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_season_" + crypto.randomBytes(5).toString("hex");
  const game = require("../functions"), db = require("../functions/platform").store;
  const uid = "season-fixture", profile = db.doc(`players/${uid}`), data = new ClientData(db);
  const auth = { uid, token: { email_verified: true, firebase: { sign_in_provider: "google.com" } } };
  let identity = {};
  const call = (name, args = {}) => game[name]({ auth, data: { ...identity, ...args } });
  try {
    await db.initialize();
    const seasons = require("../functions/season-rewards");
    const prior = seasons.previousSeason("realm-" + new Date().toISOString().slice(0, 7));
    await seasons.arm(db, prior, seasons.seasonInfo(prior).startsAtMs + 1);
    const info = await call("getRealmInfo");
    const scope = { resetGeneration: info.resetGeneration, worldId: info.worldId, realmShardId: info.sharedRealmId };
    const old = { ...scope, resetGeneration: prior, worldId: "main-" + prior };
    identity = { clientReleaseId: info.currentReleaseId, clientResetGeneration: scope.resetGeneration,
      clientWorldId: scope.worldId, clientRealmShardId: scope.realmShardId };
    const gear = require("../functions/common-gear").createDefaultState();
    gear.commonGearBoxes = 3; gear.uncommonGearBoxes = 2;
    const dailyLoginReward = require("../functions/dailyLoginRewards").store(
      require("../functions/dailyLoginRewards").normalize({}));
    await profile.set({ ...old, playerName: "Season Fixture", gold: 9e9, goldFloat: 9e9,
      createdAtMs: 1700000000000, gear, dailyLoginReward,
      character: { level: 99, xp: 900000, skillPoints: 99 }, shopItems: { peace_shield: 12 },
      itemEffects: { shieldExpiresAtMs: Date.now() + 3600000 }, battleReports: [{ old: true }],
      scoutReports: { old: { troops: 999999 } }, unknownSeasonProgress: "must-not-carry",
      notificationPreferences: { incomingArmies: true } });
    // Account-owned permanent stores survive profile replacement byte-for-byte.
    // These are fictional sentinels: no live schema or accounts are imported.
    const permanent = ["estate/state", "estateChampions/champion", "estateReceipts/job", "estateQuotes/quote",
      "estateContracts/work", "estateGuildReports/report", "cosmetics/state", "cosmeticReceipts/purchase",
      "stamina/state", "staminaReceipts/refill", "notificationTokens/device"];
    for (const path of permanent) await db.doc(`players/${uid}/${path}`).set({ sentinel: path, balance: 27, deadline: 123456789 });
    await db.doc(`socialAccounts/${uid}/signals/current`).set({ revision: 5 });
    const personalOld = `players/${uid}/serverReports/old-scout`;
    await db.doc(personalOld).set({ ...old, troops: 987654321 });
    const claim = await call("claimStartingCity");
    const fresh = (await profile.get()).data();
    assert.equal(fresh.gold, 100); assert.equal(fresh.character.level, 1); assert.equal(fresh.character.xp, 0);
    assert.equal(fresh.playerName, "Season Fixture"); assert.equal(fresh.createdAtMs, 1700000000000);
    assert.deepEqual(fresh.notificationPreferences, { incomingArmies: true });
    assert.deepEqual(fresh.battleReports, []); assert.deepEqual(fresh.scoutReports, {});
    assert.equal(fresh.unknownSeasonProgress, undefined); assert.equal(fresh.shopItems.peace_shield || 0, 0);
    assert.equal(fresh.itemEffects.shieldExpiresAtMs || 0, 0);
    assert.equal(fresh.gear.commonGearBoxes, 3); assert.equal(fresh.gear.uncommonGearBoxes, 2);
    assert.deepEqual(fresh.dailyLoginReward, dailyLoginReward);
    for (const path of permanent) assert.deepEqual((await db.doc(`players/${uid}/${path}`).get()).data(),
      { sentinel: path, balance: 27, deadline: 123456789 }, path);
    assert.deepEqual((await db.doc(`socialAccounts/${uid}/signals/current`).get()).data(), { revision: 5 });
    assert.equal((await db.doc(personalOld).get()).data().troops, 987654321, "Archived records must not be deleted");
    await assert.rejects(data.read(auth, [{ path: personalOld }]), { code: "permission-denied" });
    assert((await call("claimStartingCity")).alreadyClaimed, "Retry must not reset or grant a second starting city");
    assert.equal((await profile.get()).data().gear.commonGearBoxes, 3);

    const board = `${scope.resetGeneration}--${scope.realmShardId}`;
    const boardRef = db.doc(`leaderboards/${board}/entries/absent-fixture`);
    await db.doc("players/absent-fixture").set({ ...old, playerName: "Old Fixture" });
    for (const bad of [old, { ...scope, worldId: "test-world" }, { ...scope, realmShardId: "shard_0002" }, {}]) {
      await boardRef.set({ ...bad, kingPower: 999999, kingPowerVersion: 999, mainCityId: "old-city" });
      await assert.rejects(call("getCombatPlayerIdentity", { uid: "absent-fixture" }), { code: "not-found" });
    }
    const currentIdentity = await call("getCombatPlayerIdentity", { uid });
    assert.equal(currentIdentity.mainCityId, claim.cityId);
    await assert.rejects(call("getCommonGearStatus", { clientResetGeneration: prior }), { code: "failed-precondition" });

    // Both ordinary reads and the shared watch response must enforce scope,
    // while an unrelated authorized account listener remains usable.
    const island = `islands/${claim.islandId}`;
    const targets = ["cities", "camps", "marauders", "armies"].map(c => `${island}/${c}/misplaced-fixture`);
    targets.push(`players/${uid}/objectiveStats/goldCamp`, `clanLeaderboards/${board}/entries/misplaced-fixture`);
    for (const path of targets) {
      await db.doc(path).set({ ...old, troops: 987654321 });
      await assert.rejects(data.read(auth, [{ path }]), { code: "permission-denied" });
      const watched = await data.read(auth, [{ path }, { path: profile.path }], { partial: true });
      assert.equal(watched[0].error.code, "permission-denied"); assert(watched[1].documents.length === 1);
    }
    await assert.rejects(data.read(auth, [{ collection: `${island}/cities`,
      filters: [{ field: ["__name__"], op: "==", value: encode("misplaced-fixture") }], limit: 1 }]), { code: "permission-denied" });
    const foreignPath = `islands/test-world/cities/owned-fixture`;
    await db.doc(foreignPath).set({ ...scope, ownerUid: uid });
    await assert.rejects(data.read(auth, [{ path: foreignPath }]), { code: "permission-denied" });
    console.log("Season isolation passed: real monthly claim/reset/retry, permanent account stores, seasonal profile reset, old reports, foreign combat identities, current-path contaminated records, list/watch authorization and stale commands.");
  } finally {
    await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
