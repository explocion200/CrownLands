"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
const layout = require("../core-expansion-world-layout.json");
const config = require("../economy-config.json");
const towers = require("../holding-towers");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error("Emulators required");
const project = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId: project });
const db = getFirestore();
let identity = {}, host, sequence = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function actor(label) {
  const response = await signUpVerifiedPlayer(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      email: `rally-staging-${randomUUID()}@example.test`, password: "Emulator-Rally-Only-123!", returnSecureToken: true,
    }),
  });
  const body = await response.json(); assert(response.ok);
  return { uid: body.localId, token: body.idToken, label };
}
async function invoke(name, user, data = {}) {
  if (!host) {
    const hub = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`).then(r => r.json());
    host = `${hub.functions.host}:${hub.functions.port}`;
  }
  return fetch(`http://${host}/${project}/us-central1/${name}`, {
    method: "POST", headers: { authorization: `Bearer ${user.token}`, "content-type": "application/json" },
    body: JSON.stringify({ data: { ...data, clientReleaseId: identity.releaseId, clientResetGeneration: identity.resetGeneration,
      clientWorldId: identity.worldId, clientRealmShardId: identity.realmShardId } }),
  }).then(r => r.json());
}
async function call(name, user, data) {
  const body = await invoke(name, user, data);
  assert(!body.error, `${name}: ${JSON.stringify(body.error)}`);
  return body.result;
}
const island = region => `${identity.worldId}--${identity.realmShardId}--${region}`;
const cityRef = city => db.doc(`islands/${island(city.regionId)}/cities/${city.id}`);
const profileRef = user => db.doc(`players/${user.uid}`);
const read = async ref => (await ref.get()).data();
async function due(user, movement) {
  await db.doc(`armies/${movement.id}`).update({ arrivesAtMs: Date.now() - 1000 });
  return call("resolveArmyOrder", user, { armyId: movement.id, routeRegionIds: movement.routeRegionIds });
}
async function main() {
  const seasons = require("../season-rewards");
  const previous = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
  if (seasons.supported(previous)) await seasons.arm(db, previous, seasons.seasonInfo(previous).startsAtMs + 1);
  const users = [];
  for (let i = 0; i < 7; i++) users.push(await actor(`Staging Ruler ${i}`));
  const [leader, ally, inbound, extra, enemy, enemyAlly, enemyThird] = users;
  const realm = await call("getRealmInfo", leader);
  assert.equal(realm.worldTopology, "core-expansion-v1");
  identity = { releaseId: realm.currentReleaseId, worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: realm.sharedRealmId };
  const storage = `${identity.resetGeneration}--${identity.realmShardId}`;
  for (const user of users) {
    const claim = await call("claimStartingCity", user, { playerName: user.label });
    user.home = { id: claim.cityId, regionId: claim.mainRegionId };
    await cityRef(user.home).update({ troops: 1000000, troopFloat: 1000000, productionUpdatedAtMs: Date.now() });
    await profileRef(user).update({ itemEffects: {}, gold: 10000000, goldFloat: 10000000 });
  }
  const clan = `staging_${randomUUID()}`, enemies = `enemy_${randomUUID()}`;
  for (const [clanId, members] of [[clan, users.slice(0, 4)], [enemies, users.slice(4)]]) {
    await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: members[0].uid, name: "Staging Clan", tag: "STG", memberCount: members.length });
    for (const [index, user] of members.entries()) {
      await profileRef(user).update({ clanId, clanRole: index ? "member" : "leader" });
      await db.doc(`clans/${clanId}/members/${user.uid}`).set({ ...identity, clanId, uid: user.uid, role: index ? "member" : "leader", status: "active", joinedAtMs: Date.now() - 172800000 });
    }
  }
  const map = layout.maps.find(m => m.id === leader.home.regionId);
  const assembly = { ...map.cities.find(c => !users.some(u => u.home.id === c.id)), regionId: map.id };
  const objectiveMap = layout.maps.find(m => m.objectives.length);
  const objective = { ...objectiveMap.objectives[0], regionId: objectiveMap.id };
  await cityRef(objective).set({ ...objective, ...identity, kind: "stronghold", ownerKind: "neutral", ownerUid: null,
    troops: 50000000, troopFloat: 50000000, isMainCity: false, productionUpdatedAtMs: Date.now() }, { merge: true });
  const seedAssembly = async () => cityRef(assembly).set({ ...assembly, ...identity, ownerKind: "player", ownerUid: leader.uid,
    ownerName: leader.label, ownerClanId: clan, isMainCity: false, level: 1, troops: 11000, troopFloat: 11000,
    alliedReinforcementTroops: 0, productionUpdatedAtMs: Date.now(), ownerShieldExpiresAtMs: 0 }, { merge: false });
  async function form(target = objective, source = assembly, sourceType = "city") {
    const id = `staging_${++sequence}`;
    const result = await call("createClanRally", leader, { rallyId: id, sourceType,
      sourceRegionId: source.regionId, targetRegionId: target.regionId,
      army: { id, fromId: source.id, toId: target.id, targetType: target.tower ? "tower" : "city", troops: 10000, requestedTroops: 10000,
        sourceRegionId: source.regionId, targetRegionId: target.regionId } });
    return { id, ref: db.doc(`clans/${clan}/rallies/${id}`), result };
  }
  async function join(rally, user, troops = 5000, arrive = true) {
    const id = `${rally.id}_${user.uid}`;
    const result = await call("joinClanRally", user, { clanId: clan, rallyId: rally.id, armyId: id,
      sourceRegionId: user.home.regionId, army: { id, fromId: user.home.id, kind: "rally_join", troops, requestedTroops: troops, sourceRegionId: user.home.regionId } });
    assert.equal((await read(db.doc(`armies/${id}`))).realmShardId, identity.realmShardId);
    if (arrive) await due(user, result.movement);
    return result.movement;
  }
  async function attack(troops, target = assembly, overrides = {}, caller = enemy) {
    const id = `staging_battle_${++sequence}`, now = Date.now();
    const movement = { ...identity, ownerUid: caller.uid, ownerKind: "player", ownerName: caller.label, kind: "attack", launchKind: "attack",
      fromId: caller.home.id, toId: target.id, sourceRegionId: caller.home.regionId, targetRegionId: target.regionId,
      targetType: "city", targetOwnerUid: leader.uid, originalTargetOwnerUid: leader.uid, troops, requestedTroops: troops,
      status: "active", launchedAtMs: now - 60000, arrivesAtMs: now - 1000, routeRegionIds: [caller.home.regionId, target.regionId],
      siegeCombatVersion: config.siegeCombat.modelVersion, defenseCombatVersion: config.troopCombat.defenseModelVersion,
      attackerKingPower: 1000000, defenderKingPower: 1000000, ...overrides };
    await db.doc(`armies/${id}`).set(movement);
    await call("resolveArmyOrder", caller, { armyId: id, routeRegionIds: movement.routeRegionIds });
    return { id, snapshot: await read(db.doc(`battleSnapshots/${storage}/entries/${id}`)) };
  }
  await seedAssembly();
  const first = await form();
  await join(first, ally);
  const late = await join(first, inbound, 7000, false);
  // New and existing ordinary reinforcements cannot absorb this ruler's reserved rally troops.
  await attack(700, assembly, { kind: "reinforce", launchKind: "reinforce" }, ally);
  await attack(300, assembly, { kind: "reinforce", launchKind: "reinforce" }, ally);
  assert.equal((await read(cityRef(assembly))).alliedReinforcementTroops, 1000);
  assert.equal((await read(first.ref)).participants.find(p => p.uid === ally.uid).troops, 5000);
  const scout = await attack(1, assembly, { kind: "scout", launchKind: "scout" });
  const scouted = (await read(db.doc(`armies/${scout.id}`))).result.targetTroops;
  assert(scouted >= 17000 && scouted < 24000, "Scouting sees arrived forces, not inbound forces");
  const profileBefore = await read(profileRef(leader));
  const battle = await attack(8000);
  assert(battle.snapshot, "A detailed battle snapshot is required");
  assert(battle.snapshot.totals.defenders >= 17000, "Arrived rally troops must defend with the city's garrison");
  assert(battle.snapshot.totals.defenders < 24000, "Inbound rally troops must not defend");
  assert(battle.snapshot.totals.defenderLosses > 0);
  const survivors = await read(first.ref);
  assert.equal(survivors.status, "forming");
  assert(survivors.participants.find(p => p.uid === leader.uid).troops < 10000);
  assert(survivors.participants.find(p => p.uid === ally.uid).troops < 5000);
  assert.equal((await read(profileRef(leader))).committedRallyTroops,
    profileBefore.committedRallyTroops - (10000 - survivors.participants.find(p => p.uid === leader.uid).troops));
  assert((await read(cityRef(assembly))).alliedReinforcementTroops < 1000, "Reserved survivors cannot leak into reinforcement totals");
  const readyTroops = survivors.participants.filter(p => p.status === "assembled").reduce((sum, p) => sum + p.troops, 0);
  const journeyStart = Date.now() - 100000;
  await db.doc(`armies/${late.id}`).update({ launchedAtMs: journeyStart, arrivesAtMs: journeyStart + 400000, total: 400 });
  const launches = await Promise.all([1, 2].map(() => call("launchClanRally", leader, { clanId: clan, rallyId: first.id })));
  assert.equal(launches.filter(r => !r.duplicate).length, 1);
  assert.equal(launches[0].movement.troops, readyTroops);
  const returned = await read(db.doc(`armies/${late.id}`));
  assert.equal(returned.returning, true);
  assert.equal(returned.returnReason, "rally_launched_before_arrival");
  assert.equal(returned.troops, 7000);
  assert.equal(returned.returnStartProgress, (returned.recalledAtMs - journeyStart) / 400000,
    "An inbound army reverses from its actual position");
  assert.equal(returned.arrivesAtMs - returned.recalledAtMs, Math.ceil(400000 * returned.returnStartProgress),
    "Return time covers only the distance already travelled");
  const homeBeforeReturn = await read(cityRef(inbound.home));
  const creditedReturn = await due(inbound, late);
  assert.equal(creditedReturn.returned, 7000, "Arrival credits the source immediately, without another return journey");
  assert.equal(creditedReturn.returnCityId, inbound.home.id);
  const homeAfterReturn = await read(cityRef(inbound.home));
  assert(homeAfterReturn.troops >= homeBeforeReturn.troops + 7000);
  const settledReturn = await read(db.doc(`armies/${late.id}`));
  assert.equal(settledReturn.status, "resolved");
  await call("resolveArmyOrder", inbound, { armyId: late.id, routeRegionIds: late.routeRegionIds });
  assert.deepEqual(await read(db.doc(`armies/${late.id}`)), settledReturn, "A duplicate return cannot credit twice");
  assert.equal((await read(cityRef(inbound.home))).troopFloat, homeAfterReturn.troopFloat);

  // The transaction race must choose either an assembled attack package or a return.
  await seedAssembly(); const racing = await form(); await join(racing, ally);
  const racer = await join(racing, inbound, 7000, false);
  await db.doc(`armies/${racer.id}`).update({ arrivesAtMs: Date.now() - 1000 });
  await Promise.all([invoke("resolveArmyOrder", inbound, { armyId: racer.id, routeRegionIds: racer.routeRegionIds }),
    call("launchClanRally", leader, { clanId: clan, rallyId: racing.id })]);
  const racedRally = await read(racing.ref), racedArmy = await read(db.doc(`armies/${racer.id}`));
  const joinedLaunch = racedRally.participants.some(p => p.uid === inbound.uid);
  assert.equal(joinedLaunch, racedArmy.status === "resolved" && racedArmy.result?.outcome === "assembled");
  if (!joinedLaunch) assert.equal(racedArmy.returning, true);

  // Wiping a staged army cancels it; cancellation cannot resurrect killed troops.
  await seedAssembly(); const defeated = await form(); await join(defeated, ally);
  const defeatedInbound = await join(defeated, extra, 3000, false);
  const beforeWipe = await read(profileRef(leader));
  await attack(1000000);
  assert.equal((await read(defeated.ref)).status, "cancelled");
  assert.equal((await read(profileRef(leader))).committedRallyTroops, beforeWipe.committedRallyTroops - 10000);
  for (let i = 0; i < 50 && !(await read(db.doc(`armies/${defeatedInbound.id}`))).returning; i++) await pause(200);
  assert.equal((await read(db.doc(`armies/${defeatedInbound.id}`))).returning, true);

  await seedAssembly();
  const towerTarget = { ...towers.TOWERS[1], tower: true };
  const towerQuorum = await form(towerTarget);
  await join(towerQuorum, ally);
  const third = await join(towerQuorum, inbound, 7000, false);
  assert((await invoke("launchClanRally", leader, { clanId: clan, rallyId: towerQuorum.id })).error,
    "Two Ready rulers cannot launch against a Tower");
  await due(inbound, third);
  const fourth = await join(towerQuorum, extra, 3000, false);
  const towerLaunch = await call("launchClanRally", leader, { clanId: clan, rallyId: towerQuorum.id });
  assert.equal(towerLaunch.movement.rallyParticipantCount, 3);
  assert.equal((await read(db.doc(`armies/${fourth.id}`))).returning, true);

  // Tower staging uses the same ownership and casualty accounting.
  const tower = towers.TOWERS[0], towerRef = db.doc(`holdingTowers/${tower.id}`);
  await towerRef.set({ ...towers.createNeutralTowerState(tower.id, { nowMs: Date.now() }), ...identity,
    ownerKind: "clan", clanId: clan, clanName: "Staging Clan", neutralDefenders: 0, wallLevel: 1, wallIntegrityBps: 0 });
  await towerRef.collection("garrison").doc(leader.uid).set({ ...identity, towerId: tower.id, clanId: clan,
    uid: leader.uid, ownerUid: leader.uid, troops: 11000 });
  await profileRef(leader).update({ towerGarrisonTroops: 11000, towerGarrisonResetGeneration: identity.resetGeneration });
  const towerStage = await form(objective, { ...tower, regionId: tower.regionId }, "tower");
  await join(towerStage, ally);
  const enemyRallyId = `tower_attack_${++sequence}`;
  await db.doc(`clans/${enemies}/rallies/${enemyRallyId}`).set({ ...identity, id: enemyRallyId, clanId: enemies,
    leaderUid: enemy.uid, status: "launched", armyId: `staging_battle_${sequence + 1}`, targetType: "tower", targetId: tower.id,
    targetRegionId: tower.regionId, assemblyCityId: enemy.home.id, assemblyRegionId: enemy.home.regionId,
    participants: [enemy, enemyAlly, enemyThird].map((user, i) => ({ uid: user.uid, ownerName: user.label,
      sourceId: user.home.id, sourceRegionId: user.home.regionId, status: "assembled", role: i ? "ally" : "leader",
      troops: 2500, attackPowerPerTroop: config.troopCombat.baseAttackPowerPerTroop })) });
  const towerBattle = await attack(7500, tower, { targetType: "tower", rallyAttack: true, rallyId: enemyRallyId, rallyClanId: enemies });
  assert.equal(towerBattle.snapshot.totals.defenders, 16000);
  assert((await read(towerStage.ref)).participants.find(p => p.uid === leader.uid).troops < 10000);
  assert((await read(towerRef.collection("garrison").doc(leader.uid))).troops <= 1000);
  console.log("Core rally staging: live city/Tower defense, casualty accounting, early launch, duplicates, arrival races and defeated assembly returns passed.");
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
