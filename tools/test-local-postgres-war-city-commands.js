"use strict";
const assert = require("node:assert/strict"), { randomUUID, randomBytes } = require("node:crypto");
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_worldtest_" + randomBytes(6).toString("hex");
  const file = require.resolve("../functions/platform"), ordinary = require(file), db = ordinary.store;
  const routing = require("../local-backend/world/routing").createCommandRouting(); routing.setEnabled(true);
  require.cache[file].exports = require("../local-backend/platform").createPlatform({ store: db, privateWorldRouting: routing });
  const game = require("../functions"); let identity = {};
  const users = ["Support Leader", "Support Ally", "Support Rival"].map(label => ({ uid: "support_" + randomUUID(), label }));
  const [leader, ally, rival] = users;
  const call = async (name, user, data = {}) => {
    const result = await game[name]({ auth: { uid: user.uid, token: { email_verified: true, firebase: { sign_in_provider: "google.com" } } },
      data: { clientReleaseId: identity.releaseId, clientWorldId: identity.worldId, clientResetGeneration: identity.resetGeneration, clientRealmShardId: identity.realmShardId, ...data } });
    if (name === "getRealmInfo") identity = { releaseId: result.currentReleaseId, worldId: result.worldId, resetGeneration: result.resetGeneration, realmShardId: result.sharedRealmId };
    return result;
  };
  const read = async ref => (await ref.get()).data(), profile = u => db.doc(`players/${u.uid}`);
  const cityRef = c => db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${c.regionId}/cities/${c.id}`);
  const order = (source, target, kind, id = "order_" + randomUUID()) => ({ armyId: id, sourceType: "city", targetType: target.tower ? "tower" : "city", sourceRegionId: source.regionId, targetRegionId: target.regionId,
    army: { id, kind, fromId: source.id, toId: target.id, targetType: target.tower ? "tower" : "city", sourceRegionId: source.regionId, targetRegionId: target.regionId, troops: kind === "scout" ? 1 : 100, requestedTroops: kind === "scout" ? 1 : 100 } });
  const preview = (user, source, target, kind, extra = {}) => call("previewArmyRoute", user, { fromId: source.id, toId: target.id, sourceRegionId: source.regionId, targetRegionId: target.regionId, targetType: target.tower ? "tower" : "city", kind, requestedTroops: kind === "scout" ? 1 : 100, ...extra });
  try {
    await db.initialize(); const seasons = require("../functions/season-rewards"), prior = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
    await seasons.arm(db, prior, seasons.seasonInfo(prior).startsAtMs + 1); await call("getRealmInfo", leader);
    for (const user of users) { const claim = await call("claimStartingCity", user, { playerName: user.label }); user.home = { id: claim.cityId, regionId: claim.mainRegionId }; await cityRef(user.home).update({ troops: 50000, troopFloat: 50000, productionUpdatedAtMs: Date.now() + 3600000 }); }
    const clanId = "war_" + randomUUID();
    await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: leader.uid, memberCount: 2, name: "Support Clan", tag: "SUP" });
    for (const [user, role] of [[leader, "leader"], [ally, "member"]]) {
      await db.doc(`clans/${clanId}/members/${user.uid}`).set({ ...identity, uid: user.uid, clanId, role, status: "active", joinedAtMs: Date.now() - 7200000 });
      await profile(user).update({ clanId, clanRole: role, gold: 1e9, goldFloat: 1e9, upgrades: {}, itemEffects: {}, shopItems: { recall_horn: 5 } });
    }

    const candidate = (await cityRef(leader.home).parent.get()).docs.find(doc => !doc.data().ownerUid && !doc.data().strongholdType && doc.data().kind !== "stronghold");
    assert(candidate, "Need a neutral fixture city");
    const target = { id: candidate.id, regionId: leader.home.regionId }, ref = cityRef(target);
    await ref.update({ ownerUid: ally.uid, ownerKind: "player", ownerName: ally.label, ownerClanId: clanId,
      isMainCity: false, troops: 0, troopFloat: 0, fortificationState: null, productionUpdatedAtMs: Date.now() + 3600000 });
    const resolve = async (user, movement) => {
      await db.doc(`armies/${movement.id}`).update({ arrivesAtMs: Date.now() - 1 });
      return call("resolveArmyOrder", user, { armyId: movement.id, routeRegionIds: movement.routeRegionIds });
    };
    const capture = async user => {
      for (const actor of users) await call("collectEconomy", actor);
      const input = order(user.home, target, "attack"); input.army.troops = input.army.requestedTroops = 10000;
      const sent = await call("sendArmyOrder", user, input);
      const settled = await resolve(user, sent.movement);
      if ((await read(ref)).ownerUid !== user.uid) console.log("Capture fixture result", JSON.stringify(settled));
      assert.equal((await read(ref)).ownerUid, user.uid, "Real combat must transfer ownership");
      return sent;
    };
    await capture(rival);
    let board = await call("clanWarCities", leader);
    assert.equal(board.entries.length, 1); assert.equal(board.entries[0].status, "lost");
    assert.equal(board.entries[0].captorName, rival.label);
    const lostKey = board.entries[0].key;
    // A listed clan loss does not grant the recovering clanmate a power-protection bypass.
    await cityRef(leader.home).update({ troops: 2000000, troopFloat: 2000000 });
    for (const actor of users) await call("collectEconomy", actor);
    const protectionInput = { fromId: leader.home.id, toId: target.id,
      sourceRegionId: leader.home.regionId, targetRegionId: target.regionId, requestedTroops: 10000 };
    const protection = (await call("previewArmyProtection", leader, protectionInput)).attackProtection;
    assert.equal(protection.mode, "raid", "Lost Holdings bypassed weak-player protection in preview");
    const raidOrder = order(leader.home, target, "attack");
    raidOrder.army.troops = raidOrder.army.requestedTroops = 10000;
    raidOrder.army.acceptedAttackProtection = protection;
    const raid = await call("sendArmyOrder", leader, raidOrder);
    assert.equal(raid.movement.attackProtection.mode, "raid");
    assert(!raid.movement.retaliationAuthorization, "Listing granted another member's retaliation");
    await resolve(leader, raid.movement);
    assert.equal((await read(ref)).ownerUid, rival.uid, "Protected raid captured a listed city");
    assert.equal((await call("clanWarCities", leader)).entries[0].status, "lost");
    await cityRef(leader.home).update({ troops: 50000, troopFloat: 50000 });
    await ref.update({ troops: 0, troopFloat: 0, productionUpdatedAtMs: Date.now() + 3600000 });
    await capture(leader);
    board = await call("clanWarCities", leader);
    assert.equal(board.entries[0].status, "recovered"); assert(board.entries[0].canReturn);
    assert.equal(board.entries[0].key, lostKey, "Recovery changed the city row's identity");
    assert.equal((await call("clanWarCities", ally)).entries[0].canReturn, false, "Another member can give away the recoverer's city");
    const request = { action: "return", key: board.entries[0].key, lossEventId: board.entries[0].lossEventId, operationId: randomUUID() };
    await assert.rejects(call("clanWarCities", rival, request));
    await assert.rejects(call("clanWarCities", ally, request));
    await ref.update({ isMainCity: true });
    await profile(leader).update({ mainCityId: target.id });
    await assert.rejects(call("clanWarCities", leader, request), /Main Cities/);
    await profile(leader).update({ mainCityId: leader.home.id });
    await ref.update({ isMainCity: false, retaliationAbandonLocks: { [leader.uid]: Date.now() + 60000 } });
    await assert.rejects(call("clanWarCities", leader, request), /capture protection/);
    await ref.update({ retaliationAbandonLocks: {} });
    const incoming = db.doc("armies/war_fixture_incoming");
    await incoming.set({ ...identity, id: incoming.id, status: "active", ownerUid: rival.uid, targetKey: `${target.regionId}:${target.id}` });
    await assert.rejects(call("clanWarCities", leader, request), /incoming marches/);
    await incoming.delete();
    const expiry = Date.now() + 3600000;
    await profile(ally).update({ "itemEffects.shieldExpiresAtMs": expiry });
    const before = await read(ref), donorBefore = await read(profile(leader)), recipientBefore = await read(profile(ally));
    const responses = await Promise.all([call("clanWarCities", leader, request), call("clanWarCities", leader, request)]);
    assert(responses.some(r => r.replayed));
    const returned = await read(ref), response = responses[0];
    assert.equal(returned.ownerUid, ally.uid); assert.equal(returned.troops, 0); assert.equal(returned.level, before.level);
    assert.deepEqual(returned.fortificationState, before.fortificationState);
    assert.equal(returned.ownerShieldExpiresAtMs, expiry);
    const movement = { id: response.movementId, ...await read(db.doc(`armies/${response.movementId}`)) };
    assert.equal(movement.troops, before.troops); assert.equal(movement.ownerUid, leader.uid);
    assert(movement.relinquishTransfer); assert(!movement.clanStables); assert(movement.arrivesAtMs > movement.launchedAtMs);
    assert.equal((await call("clanWarCities", leader)).entries.length, 0);
    assert.deepEqual((await read(profile(leader))).character, donorBefore.character, "Return awarded XP");
    assert.deepEqual((await read(profile(ally))).character, recipientBefore.character);
    const recipientStats = (await db.doc(`players/${ally.uid}/stats/global`).get()).data();
    assert(recipientStats.totalCities >= 2, "Receiver stats did not acquire the city");
    await resolve(leader, movement);
    const destination = cityRef({ id: movement.toId, regionId: movement.targetRegionId });
    const delivered = (await read(destination)).troops;
    await call("clanWarCities", leader, request);
    await call("resolveArmyOrder", leader, { armyId: movement.id, routeRegionIds: movement.routeRegionIds });
    assert.equal((await read(destination)).troops, delivered, "Retry duplicated returning troops");
    const { Access } = require("../local-backend/access");
    await db.runTransaction(async tx => {
      const access = await new Access({ store: db, transaction: tx, auth: { uid: leader.uid } }).initialize();
      const path = `clans/${clanId}/warCities/${request.key}`;
      assert.equal(await access.canRead(path, (await tx.get(db.doc(path))).data()), false, "Raw board bypasses command authorization");
    });
    console.log("Lost Holdings real commands: player loss, no weak-player bypass, same-row recapture, permission/main-city/incoming guards, concurrent return, shield/walls/level preservation, economy stats, owned troop journey, replay and private access passed.");
  } finally { await routing.close(); await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
