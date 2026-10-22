"use strict";
const assert = require("node:assert/strict"), { randomUUID, randomBytes } = require("node:crypto");
const T = require("../functions/holding-towers");
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
    const clanId = "support_" + randomUUID(), tower = { ...T.TOWERS[0], tower: true }, towerRef = db.doc(`holdingTowers/${tower.id}`);
    await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: leader.uid, memberCount: 2, name: "Support Clan", tag: "SUP" });
    for (const [user, role] of [[leader, "leader"], [ally, "member"]]) {
      await db.doc(`clans/${clanId}/members/${user.uid}`).set({ ...identity, uid: user.uid, clanId, role, status: "active", joinedAtMs: Date.now() - 7200000 });
      await profile(user).update({ clanId, clanRole: role, gold: 1e9, goldFloat: 1e9, upgrades: {}, itemEffects: {}, shopItems: { recall_horn: 5 } });
    }
    await towerRef.set({ ...T.createNeutralTowerState(tower.id), ...identity, ownerKind: "clan", clanId, ownershipRevision: 1, wallIntegrityBps: 10000 });
    await call("donateClanTreasuryGold", leader, { amount: 100000000, operationId: randomUUID() });
    const build = { towerId: tower.id, buildingId: "stables", operationId: randomUUID() };
    await assert.rejects(call("startClanTowerBuilding", ally, build));
    const starts = await Promise.allSettled([call("startClanTowerBuilding", leader, build), call("startClanTowerBuilding", leader, { ...build, buildingId: "scout_lodge", operationId: randomUUID() })]);
    assert.equal(starts.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await call("getClanTreasuryStatus", leader)).treasury.balance, 95000000);
    const started = await read(towerRef);
    if (started.buildingProject.buildingId === "stables") assert.equal((await call("startClanTowerBuilding", leader, build)).duplicate, true);
    await towerRef.update({ "buildingProject.progressStartedAtMs": Date.now() - 1801000 });
    const complete = (await call("getHoldingTowerState", leader, { towerId: tower.id })).towers[0];
    assert.equal(complete.buildings[started.buildingProject.buildingId], 1); assert.equal(complete.clanTowerSupportVersion, 1);
    await towerRef.update({ buildingProject: null, "buildings.stables": 0, "buildings.scout_lodge": 2 });
    const before = await preview(leader, leader.home, ally.home, "reinforce");
    assert.equal(before.clanStables.reason, "unbuilt");
    await towerRef.update({ "buildings.stables": 10 });
    const after = await preview(leader, leader.home, ally.home, "reinforce");
    assert.equal(after.clanStables.nominalPercent, 20); assert.equal(after.clanStables.effectivePercent, 20);
    const reinforcementOrder = order(leader.home, ally.home, "reinforce"), dispatched = (await call("sendArmyOrder", leader, reinforcementOrder)).movement;
    assert.equal(Math.ceil(dispatched.total * 1000), after.durationMs, "Preview differs from committed reinforcement timing");
    assert.equal(dispatched.clanStables.unboostedDurationMs, before.durationMs);
    const saved = await read(db.doc(`armies/${dispatched.id}`));
    await towerRef.update({ "buildings.stables": 1 });
    const replay = (await call("sendArmyOrder", leader, reinforcementOrder)).movement;
    assert.equal(replay.arrivesAtMs, dispatched.arrivesAtMs); assert.deepEqual(replay.pathSegments, dispatched.pathSegments);
    assert.deepEqual((await read(db.doc(`armies/${dispatched.id}`))).clanStables, saved.clanStables);
    const at = Date.now(); await db.doc(`armies/${dispatched.id}`).update({ launchedAtMs: at - 20000, arrivesAtMs: at + 80000, total: 100, "clanStables.unboostedDurationMs": 120000 });
    const recall = (await call("useRecallHorn", leader, { armyId: dispatched.id })).movement;
    assert(recall.total >= 24 && recall.total < 27, "Recall retained the outward Stables speed");
    await towerRef.update({ "buildings.stables": 10 });
    const towerPreview = await preview(ally, ally.home, tower, "reinforce");
    const towerMarch = (await call("sendHoldingTowerArmyOrder", ally, order(ally.home, tower, "reinforce"))).movement;
    assert.equal(Math.ceil(towerMarch.total * 1000), towerPreview.durationMs); assert.equal(towerMarch.clanStables.nominalPercent, 20);
    const layout = require("../functions/core-expansion-world-layout.json"), objectiveMap = layout.maps.find(m => m.objectives.length), objective = { ...objectiveMap.objectives[0], regionId: objectiveMap.id };
    await cityRef(objective).set({ ...objective, ...identity, kind: "stronghold", ownerKind: "neutral", ownerUid: null, troops: 1e6, troopFloat: 1e6, isMainCity: false, productionUpdatedAtMs: Date.now() });
    const scout = (await call("sendArmyOrder", leader, order(leader.home, objective, "scout"))).movement;
    assert.equal(scout.clanStables, undefined); assert.equal((await preview(leader, leader.home, objective, "scout")).clanStables, null);
    await db.doc(`armies/${scout.id}`).update({ arrivesAtMs: Date.now() - 1 });
    await call("resolveArmyOrder", leader, { armyId: scout.id, routeRegionIds: scout.routeRegionIds });
    const reports = await db.collection(`players/${leader.uid}/serverReports`).get(), report = reports.docs.find(doc => doc.data().scoutReport);
    assert(report, "Real scout arrival did not create a private report");
    const shared = await call("clanIntelligence", leader, { action: "share", reportId: report.id, scoutedAtMs: report.data().scoutReport.scoutedAtMs, operationId: randomUUID() });
    const detail = await call("clanIntelligence", ally, { action: "detail", key: shared.key });
    assert.equal(detail.entry.snapshot.troops, report.data().scoutReport.troops); assert.equal(detail.entry.expiresAtMs, report.data().scoutReport.expiresAtMs);
    assert(!JSON.stringify(await call("getHoldingTowerState", rival, {})).includes(shared.key), "Public Tower response leaked intelligence");
    await assert.rejects(call("clanIntelligence", rival, { action: "detail", key: shared.key }));
    // Real forming rally and assembly dispatch use the same bonus and committed timing.
    const rallyId = "rally_" + randomUUID();
    await call("createClanRally", ally, { rallyId, sourceRegionId: ally.home.regionId, targetRegionId: objective.regionId,
      army: { id: rallyId, fromId: ally.home.id, toId: objective.id, troops: 100, requestedTroops: 100, sourceRegionId: ally.home.regionId, targetRegionId: objective.regionId } });
    const rallyPreview = await preview(leader, leader.home, ally.home, "rally_join", { rallyId });
    const joinId = "join_" + randomUUID(), joinRequest = { clanId, rallyId, armyId: joinId, sourceRegionId: leader.home.regionId,
      army: { id: joinId, fromId: leader.home.id, kind: "rally_join", troops: 100, requestedTroops: 100, sourceRegionId: leader.home.regionId } };
    const joined = (await call("joinClanRally", leader, joinRequest)).movement;
    assert.equal(joined.clanStables.nominalPercent, 20); assert.equal(Math.ceil(joined.total * 1000), rallyPreview.durationMs);
    await towerRef.update({ clanId: "captor", ownershipRevision: 2 });
    assert.equal((await call("joinClanRally", leader, joinRequest)).movement.arrivesAtMs, joined.arrivesAtMs);
    await assert.rejects(call("clanIntelligence", ally));
    await profile(leader).update({ clanId: "" });
    assert.equal((await read(db.doc(`armies/${joined.id}`))).arrivesAtMs, joined.arrivesAtMs);
    console.log("Actual local-backend commands: atomic construction, authoritative completion, reinforcement/Tower/rally preview-dispatch parity, immutable retries, unboosted recalls, real scout sharing and capture privacy passed.");
  } finally { await routing.close(); await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
