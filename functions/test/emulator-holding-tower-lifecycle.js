"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const towers = require("../holding-towers.js");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_EMULATOR_HUB) {
  throw new Error("Local Auth, Firestore and Functions emulators are required.");
}
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();
let identity = {}, functionsHost;

async function createActor(label) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `tower-${randomUUID()}@example.test`, password: "Emulator-Tower-Only-123!", returnSecureToken: true }),
  });
  const body = await response.json();
  assert(response.ok, "Emulator signup failed.");
  return { uid: body.localId, token: body.idToken, label };
}

async function invoke(name, actor, data = {}) {
  if (!functionsHost) {
    const hub = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`).then(response => response.json());
    functionsHost = `${hub.functions.host}:${hub.functions.port}`;
  }
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST", headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" },
    body: JSON.stringify({ data: { ...data, clientReleaseId: identity.releaseId, clientResetGeneration: identity.resetGeneration,
      clientWorldId: identity.worldId, clientRealmShardId: identity.realmShardId } }),
  });
  return response.json();
}

async function call(name, actor, data) {
  const body = await invoke(name, actor, data);
  assert(!body.error, `${name}: ${JSON.stringify(body.error)}`);
  assert.notEqual(body.result?.ok, false, `${name} returned an unsuccessful result.`);
  return body.result;
}

async function resolve(actor, movement) {
  await db.doc(`armies/${movement.id}`).update({ arrivesAtMs: Date.now() - 1000 });
  return call("resolveArmyOrder", actor, { armyId: movement.id, routeRegionIds: movement.routeRegionIds });
}

async function assertTroopPower(actor) {
  await db.runTransaction(async transaction => {
    const [profileSnap, statsSnap, cities, armies, camps, garrisons] = await Promise.all([
      transaction.get(db.doc(`players/${actor.uid}`)),
      transaction.get(db.doc(`players/${actor.uid}/stats/global`)),
      transaction.get(db.collectionGroup("cities").where("ownerUid", "==", actor.uid)),
      transaction.get(db.collection("armies").where("ownerUid", "==", actor.uid).where("status", "==", "active")),
      transaction.get(db.collectionGroup("camps").where("holderUid", "==", actor.uid)),
      transaction.get(db.collectionGroup("garrison").where("ownerUid", "==", actor.uid)),
    ]);
    const current = doc => doc.data().worldId === identity.worldId
      && doc.data().resetGeneration === identity.resetGeneration && doc.data().realmShardId === identity.realmShardId;
    const sum = (snapshot, field, filter = () => true) => snapshot.docs.filter(current).filter(filter)
      .reduce((total, doc) => total + Math.max(0, Math.floor(Number(doc.data()[field]) || 0)), 0);
    const stats = statsSnap.data(), profile = profileSnap.data();
    assert.equal(stats.version, 12);
    // Economy snapshots include production between the five-minute city checkpoints.
    assert(stats.totalCityTroops >= sum(cities, "troops"), "Saved stats omitted owned-city troops.");
    assert.equal(stats.totalCampTroops, sum(camps, "currentGarrison"), "Saved stats omitted held Camp troops.");
    assert.equal(stats.totalMarchingTroops, sum(armies, "troops", doc => doc.data().rallyAttack !== true), "Saved stats omitted an active march.");
    assert.equal(stats.totalTowerTroops, sum(garrisons, "troops"), "Saved stats omitted personally owned Tower troops.");
    assert.equal(stats.totalTowerTroops, profile.towerGarrisonTroops || 0);
    const total = stats.totalCityTroops + stats.totalCampTroops + stats.totalMarchingTroops + stats.totalTowerTroops
      + (profile.stationedReinforcementTroops || 0) + (profile.committedRallyTroops || 0);
    assert.equal(stats.armyPower, total * 2, "Troops stopped contributing two power each.");
    assert.equal(stats.kingPower, stats.armyPower + stats.replacementPower + stats.defensivePower);
    assert.equal(profile.kingPower, stats.kingPower);
  });
}

async function main() {
  const actors = [];
  for (let index = 0; index < 4; index++) actors.push(await createActor(`Tower Ruler ${index + 1}`));
  const [leader, member] = actors, outsider = actors[3];
  const realm = await call("getRealmInfo", leader);
  assert.equal(realm.worldTopology, "core-expansion-v1");
  identity = { releaseId: realm.currentReleaseId, resetGeneration: realm.resetGeneration, worldId: realm.worldId, realmShardId: realm.sharedRealmId };
  for (const actor of actors) {
    await call("claimStartingCity", actor, { playerName: actor.label });
    actor.profile = (await db.doc(`players/${actor.uid}`).get()).data();
    actor.home = { id: actor.profile.mainCityId, regionId: actor.profile.mainRegionId };
  }
  const clanId = `tower_lifecycle_${randomUUID()}`, now = Date.now(), contribution = 100_000_000;
  const tower = towers.TOWERS[0], towerRef = db.doc(`holdingTowers/${tower.id}`);
  const garrisonRef = actor => towerRef.collection("garrison").doc(actor.uid);
  const assertTowerPower = async (actor, expectedTowerTroops) => {
    let stats, profile, board;
    for (let attempt = 0; attempt < 100; attempt++) {
      [stats, profile, board] = await Promise.all([
        db.doc(`players/${actor.uid}/stats/global`).get().then(snap => snap.data()),
        db.doc(`players/${actor.uid}`).get().then(snap => snap.data()),
        db.doc(`leaderboards/${identity.resetGeneration}--${identity.realmShardId}/entries/${actor.uid}`).get().then(snap => snap.data()),
      ]);
      if (stats?.totalTowerTroops === expectedTowerTroops && stats.kingPower === profile.kingPower && board?.kingPower === stats.kingPower) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(profile.towerGarrisonTroops || 0, expectedTowerTroops, "Personal counter differs from the actual garrison.");
    assert.equal(stats.totalTowerTroops, expectedTowerTroops, "Tower troops were omitted from authoritative stats.");
    const militaryTroops = stats.totalTroops + stats.totalMarchingTroops + stats.totalReinforcementTroops + stats.totalRallyTroops + expectedTowerTroops;
    assert.equal(stats.armyPower, militaryTroops * 2, "A troop was omitted or counted twice in King Power.");
    assert.equal(stats.kingPower, stats.armyPower + stats.replacementPower + stats.defensivePower);
    assert.equal(profile.kingPower, stats.kingPower);
    assert.equal(board.kingPower, stats.kingPower);
    assert.equal(board.totalTowerTroops, expectedTowerTroops);
    return stats;
  };
  const cityRef = city => db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${city.regionId}/cities/${city.id}`);
  await towerRef.set({ ...towers.createNeutralTowerState(tower.id, { nowMs: now }), ...identity });
  await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: leader.uid, name: "Tower Test Clan", tag: "TTC", memberCount: 3 });
  const participants = [];
  for (const [index, actor] of actors.slice(0, 3).entries()) {
    const role = index ? "member" : "leader";
    await db.doc(`clans/${clanId}/members/${actor.uid}`).set({ ...identity, clanId, uid: actor.uid, role, status: "active", joinedAtMs: now - 172_800_000 });
    await db.doc(`players/${actor.uid}`).set({ clanId, clanRole: role, committedRallyTroops: index ? contribution : 0,
      rallyResetGeneration: identity.resetGeneration }, { merge: true });
    participants.push({ uid: actor.uid, ownerName: actor.label, role: index ? "ally" : "leader", troops: contribution,
      sourceId: actor.home.id, sourceRegionId: actor.home.regionId, status: "assembled", joinedAtMs: now - 1000, assembledAtMs: now - 1000 });
  }
  const neutral = (await call("getHoldingTowerState", leader, { towerId: tower.id })).towers[0];
  assert.equal(neutral.ownerKind, "neutral");
  assert.equal(neutral.permissions.createRallyAttack, true);
  const rallyId = `tower_capture_${randomUUID()}`, rallyRef = db.doc(`clans/${clanId}/rallies/${rallyId}`);
  await cityRef(leader.home).update({ troops: contribution, troopFloat: contribution });
  const previewRequest = { fromId: leader.home.id, toId: tower.id, targetType: "tower", kind: "attack",
    sourceRegionId: leader.home.regionId, targetRegionId: tower.regionId, requestedTroops: contribution };
  const cityBeforePreview = (await cityRef(leader.home).get()).data();
  const towerBeforePreview = (await towerRef.get()).data();
  const preview = await call("previewArmyRoute", leader, previewRequest);
  assert.equal(preview.targetCity.targetType, "tower");
  assert.equal(preview.targetCity.id, tower.id);
  assert.equal(preview.requestedTroops, contribution);
  assert(preview.durationMs > 0 && preview.points.length >= 2, "Tower Rally needs a verified route before submission.");
  assert.deepEqual((await cityRef(leader.home).get()).data(), cityBeforePreview, "Route preview changed the source garrison.");
  assert.deepEqual((await towerRef.get()).data(), towerBeforePreview, "Route preview changed the Tower.");
  const wrongSourcePreview = await invoke("previewArmyRoute", outsider, previewRequest);
  assert.equal(wrongSourcePreview.error?.status, "PERMISSION_DENIED");
  const wrongTowerRegion = towers.TOWERS.find(candidate => candidate.regionId !== tower.regionId).regionId;
  const wrongRegionPreview = await invoke("previewArmyRoute", leader, { ...previewRequest, targetRegionId: wrongTowerRegion });
  assert.equal(wrongRegionPreview.error?.status, "INVALID_ARGUMENT");
  const inventedTowerPreview = await invoke("previewArmyRoute", leader, { ...previewRequest, toId: "unknown-tower" });
  assert.equal(inventedTowerPreview.error?.status, "INVALID_ARGUMENT");
  const creationPayload = { clanId, rallyId, sourceType: "city", targetType: "tower",
    sourceRegionId: leader.home.regionId, targetRegionId: tower.regionId,
    army: { id: rallyId, kind: "attack", fromId: leader.home.id, toId: tower.id, troops: contribution, requestedTroops: contribution } };
  const created = await call("createClanRally", leader, creationPayload);
  assert.equal(created.rally.targetId, tower.id);
  assert.equal(created.rally.targetType, "tower");
  assert.equal(created.rally.assemblyCityId, leader.home.id);
  assert.equal(created.rally.participants.length, 1);
  assert.equal(created.rally.participants[0].troops, contribution);
  const troopsAfterCreation = (await cityRef(leader.home).get()).data().troops;
  const replay = await call("createClanRally", leader, creationPayload);
  assert.equal(replay.duplicate, true);
  assert.equal((await cityRef(leader.home).get()).data().troops, troopsAfterCreation, "Replaying Tower rally creation deducted troops twice.");
  // Assemble additional fixture contributions to exercise target-specific launch and capture rules.
  await rallyRef.update({ participants: participants.slice(0, 2) });
  const tooSmall = await invoke("launchClanRally", leader, { clanId, rallyId });
  assert.match(tooSmall.error?.message || "", /At least 3 assembled players/, "Two players were allowed to attack a neutral Tower.");
  assert.equal((await rallyRef.get()).data().status, "forming");
  await rallyRef.update({ participants });
  const launched = await call("launchClanRally", leader, { clanId, rallyId });
  const battle = await resolve(leader, launched.movement);
  assert.equal(battle.result.success, true, "The overwhelming three-player rally did not capture the neutral Tower.");
  const captured = (await towerRef.get()).data();
  assert.equal(captured.clanId, clanId);
  assert.equal(captured.wallLevel, 1);
  assert.equal(captured.wallIntegrityBps, 0);
  const garrison = await towerRef.collection("garrison").get();
  assert.equal(garrison.size, 3, "Survivors were not attributed to all three contributors.");
  for (const row of garrison.docs) assert(row.data().troops > 0 && row.data().troops <= contribution);
  for (const actor of actors.slice(0, 3)) await assertTowerPower(actor, (await garrisonRef(actor).get()).data().troops);
  const owned = (await call("getHoldingTowerState", member, { towerId: tower.id })).towers[0];
  assert.equal(owned.ownerMember, true);
  assert.equal(owned.garrison.length, 3);
  assert.equal(owned.ownStationedTroops, (await garrisonRef(member).get()).data().troops);
  assert(owned.permissions.withdrawOwn && owned.permissions.reinforce && owned.permissions.attackFrom);
  const privateView = (await call("getHoldingTowerState", outsider, { towerId: tower.id })).towers[0];
  assert.equal(privateView.ownerMember, false);
  assert.equal(privateView.exactDefenders, null);
  assert.equal(privateView.garrison.length, 0);
  const garrisonQuery = { structuredQuery: { from: [{ collectionId: "garrison" }], where: { compositeFilter: { op: "AND", filters:
    [["worldId", identity.worldId], ["resetGeneration", identity.resetGeneration], ["realmShardId", identity.realmShardId], ["clanId", clanId]]
      .map(([field, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } })) } } } };
  const queryGarrison = actor => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/holdingTowers/${tower.id}:runQuery`, {
    method: "POST", headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" }, body: JSON.stringify(garrisonQuery),
  });
  const memberQuery = await queryGarrison(member);
  assert.equal(memberQuery.status, 200, "Owning-clan garrison subscription query was denied.");
  assert.equal((await memberQuery.json()).filter(row => row.document).length, 3);
  assert.equal((await queryGarrison(outsider)).status, 403, "An outsider could query private garrisons.");
  const unchanged = garrison.docs.map(row => [row.id, row.data().troops]);
  await call("resolveArmyOrder", leader, { armyId: launched.movement.id, routeRegionIds: launched.movement.routeRegionIds });
  assert.deepEqual((await towerRef.collection("garrison").get()).docs.map(row => [row.id, row.data().troops]), unchanged, "Battle retry duplicated survivors.");
  const order = (from, to, kind, troops, sourceType, targetType) => ({ sourceType, targetType, sourceRegionId: from.regionId, targetRegionId: to.regionId,
    army: { id: `tower_order_${randomUUID()}`, kind, fromId: from.id, toId: to.id, requestedTroops: troops, troops } });
  const before = (await garrisonRef(member).get()).data().troops;
  const others = unchanged.filter(([uid]) => uid !== member.uid);
  await call("collectEconomy", member);
  await assertTroopPower(member);
  const withdrawal = await call("sendHoldingTowerArmyOrder", member, order(tower, member.home, "transfer", 1000, "tower", "city"));
  assert.equal((await garrisonRef(member).get()).data().troops, before - 1000);
  const marchingPower = await assertTowerPower(member, before - 1000);
  await assertTroopPower(member);
  // Both login repair and stale-version rebuild must include moving troops.
  await db.doc(`players/${member.uid}`).update({ identitySyncVersion: 0 });
  await call("syncPlayerIdentity", member);
  await assertTroopPower(member);
  await db.doc(`leaderboards/${identity.resetGeneration}--${identity.realmShardId}/entries/${member.uid}`).update({ kingPowerVersion: 11 });
  await call("getCombatPlayerIdentity", member, { uid: member.uid });
  await assertTroopPower(member);
  const cityBefore = (await cityRef(member.home).get()).data().troops;
  await resolve(member, withdrawal.movement);
  await assertTroopPower(member);
  assert((await cityRef(member.home).get()).data().troops >= cityBefore + 1000, "Withdrawal did not reach its owner's city.");
  const arrivedPower = await assertTowerPower(member, before - 1000);
  assert(arrivedPower.armyPower >= marchingPower.armyPower, "Withdrawal lost army power without casualties.");
  const reinforcement = await call("sendHoldingTowerArmyOrder", member, order(member.home, tower, "reinforce", 100, "city", "tower"));
  await assertTroopPower(member);
  await resolve(member, reinforcement.movement);
  assert.equal((await garrisonRef(member).get()).data().troops, before - 900);
  const reinforcedPower = await assertTowerPower(member, before - 900);
  await assertTroopPower(member);
  assert(reinforcedPower.armyPower >= arrivedPower.armyPower, "Reinforcement lost army power without casualties.");
  await resolve(member, reinforcement.movement);
  assert.equal((await assertTowerPower(member, before - 900)).armyPower, reinforcedPower.armyPower, "Arrival retry duplicated troop power.");
  assert.deepEqual((await towerRef.collection("garrison").get()).docs.filter(row => row.id !== member.uid).map(row => [row.id, row.data().troops]), others,
    "Personal orders changed another player's garrison.");
  // New Tower services use donated Gold, one construction slot, and private per-player Shop usage.
  const treasuryRef = db.doc(`clans/${clanId}/treasury/${identity.resetGeneration}`);
  const readTreasury = actor => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${treasuryRef.path}`, {
    headers: { authorization: `Bearer ${actor.token}` },
  });
  assert.equal((await readTreasury(member)).status,404,"An empty Treasury must allow a member listener before the first donation.");
  assert.equal((await readTreasury(outsider)).status,403,"An outsider could listen to an empty Treasury.");
  await cityRef(member.home).update({level:100,productionUpdatedAtMs:Date.now()});
  await db.doc(`players/${member.uid}`).update({gold:1e9,goldFloat:1e9,economyUpdatedAtMs:Date.now()});
  const emptyTreasury = await call("getClanTreasuryStatus",member);
  assert.equal(emptyTreasury.treasury.balance,0);
  assert(emptyTreasury.allowance.remaining >= 20_000_000,"The donation fixture needs enough raw production allowance.");
  const donationPayload = {amount:20_000_000,operationId:`donation_${randomUUID()}`};
  const donation = await call("donateClanTreasuryGold",member,donationPayload);
  assert.equal(donation.balance,20_000_000);
  assert.equal(donation.revision,1);
  const personalAfterDonation = (await db.doc(`players/${member.uid}`).get()).data().gold;
  assert(personalAfterDonation < 981_000_000,"The donation did not deduct personal Gold.");
  assert.equal((await call("donateClanTreasuryGold",member,donationPayload)).duplicate,true);
  assert.equal((await db.doc(`players/${member.uid}`).get()).data().gold,personalAfterDonation,"Donation replay charged personal Gold twice.");
  assert.equal((await call("getClanTreasuryStatus",leader)).treasury.balance,20_000_000,"A member's donation was not available to the Leader.");
  assert.equal((await readTreasury(member)).status,200);
  assert.equal((await readTreasury(outsider)).status,403);
  const treasuryWrite = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${treasuryRef.path}?updateMask.fieldPaths=balance`, {
    method:"PATCH",headers:{authorization:`Bearer ${member.token}`,"content-type":"application/json"},
    body:JSON.stringify({fields:{balance:{integerValue:"999999999"}}}),
  });
  assert.equal(treasuryWrite.status,403,"A member could write the Treasury directly.");
  await towerRef.update({wallIntegrityBps:10000,buildings:{shop:0,workshop:0,infirmary:0,training:0},buildingProject:null});
  const buildPayload = {towerId:tower.id,buildingId:"shop",operationId:`build_${randomUUID()}`};
  assert((await invoke("startClanTowerBuilding",member,buildPayload)).error,"A regular member could spend the Treasury.");
  const build = await call("startClanTowerBuilding",leader,buildPayload);
  assert.equal(build.tower.buildingProject.targetLevel,1);
  assert.equal((await treasuryRef.get()).data().balance,15_000_000);
  assert.equal(build.treasury.revision,2);
  assert.equal((await call("startClanTowerBuilding",leader,buildPayload)).duplicate,true);
  assert.equal((await treasuryRef.get()).data().balance,15_000_000,"Build retry charged Gold twice.");
  assert((await invoke("startClanTowerBuilding",leader,{...buildPayload,buildingId:"workshop",operationId:`busy_${randomUUID()}`})).error);
  await towerRef.update({"buildingProject.progressStartedAtMs":Date.now()-1_801_000});
  assert.equal((await call("getHoldingTowerState",leader,{towerId:tower.id})).towers[0].buildings.shop,1);
  const upgraded = await call("startClanTowerBuilding",leader,{...buildPayload,operationId:`upgrade_${randomUUID()}`});
  assert.equal(upgraded.tower.buildingProject.targetLevel,2);
  assert.equal(upgraded.treasury.balance,5_000_000);
  assert.equal(upgraded.treasury.revision,3);
  const wallPayload = {towerId:tower.id,levels:1,operationId:`walls_${randomUUID()}`};
  assert((await invoke("queueHoldingTowerWallUpgrades",member,wallPayload)).error,"A regular member could buy walls.");
  // Officers can spend the same Treasury, even while a building is being upgraded.
  await db.doc(`clans/${clanId}/members/${actors[2].uid}`).update({role:"officer"});
  await db.doc(`players/${actors[2].uid}`).update({clanRole:"officer"});
  const walls = await call("queueHoldingTowerWallUpgrades",actors[2],wallPayload);
  assert(walls.cost > 0);
  assert.equal(walls.treasury.balance,5_000_000-walls.cost);
  assert.equal(walls.treasury.revision,4);
  assert.equal((await call("queueHoldingTowerWallUpgrades",actors[2],wallPayload)).duplicate,true);
  const shared = (await call("getClanTreasuryStatus",member)).treasury;
  assert.equal(shared.balance,walls.treasury.balance);
  assert.equal(shared.totalDonated,20_000_000);
  assert.equal(shared.totalSpent,15_000_000+walls.cost);
  await towerRef.update({buildingProject:null});
  const insufficient = await invoke("startClanTowerBuilding",leader,{...buildPayload,operationId:`unfunded_${randomUUID()}`});
  assert.match(insufficient.error?.message || "",/Treasury/i,"An unaffordable upgrade was accepted.");
  assert.equal((await treasuryRef.get()).data().balance,shared.balance,"A rejected upgrade spent donated Gold.");
  console.log("Clan Treasury passed: real member donation and replay, Leader building/upgrade, Officer walls and replay, shared balance/ledger, insufficient funds and private read-only subscription access.");
  await towerRef.update({buildings:{shop:1,workshop:10,infirmary:10,training:10},buildingProject:null});
  const second=towers.TOWERS[1],secondRef=db.doc(`holdingTowers/${second.id}`);
  await secondRef.set({...towers.createNeutralTowerState(second.id),...identity,ownerKind:"clan",clanId,wallIntegrityBps:10000,buildings:{shop:10}});
  const memberProfile=db.doc(`players/${member.uid}`),memberRef=db.doc(`clans/${clanId}/members/${member.uid}`);
  await memberProfile.update({gold:1e12,goldFloat:1e12});
  const shop=(await call("getClanTowerShop",member,{towerId:tower.id})).clanShop;
  assert.equal(shop.localLevel,1);assert.equal(shop.level,10);assert.equal(shop.eligible,true);
  const price=shop.items.find(item=>item.id==="swift_march_order").price;
  const stockBefore=(await memberProfile.get()).data().shopItems?.swift_march_order || 0;
  const purchase={towerId:tower.id,itemId:"swift_march_order",quantity:1,cost:price,operationId:`buy_${randomUUID()}`};
  const bought=await call("purchaseClanTowerShopItem",member,purchase);
  assert.equal(bought.currentUser.shopItems.swift_march_order,stockBefore+1);
  assert.equal((await call("purchaseClanTowerShopItem",member,purchase)).duplicate,true);
  assert.equal((await memberProfile.get()).data().shopItems.swift_march_order,stockBefore+1);
  const simultaneous=await Promise.all([0,1].map(i=>invoke("purchaseClanTowerShopItem",member,{...purchase,towerId:i?second.id:tower.id,operationId:`race_${randomUUID()}`})));
  assert.equal(simultaneous.filter(r=>!r.error).length,1,"Concurrent purchases exceeded the shared stock.");
  await secondRef.update({clanId:"enemy"});
  assert.equal((await call("getClanTowerShop",member,{towerId:tower.id})).clanShop.level,1);
  assert((await invoke("purchaseClanTowerShopItem",member,{...purchase,operationId:`drop_${randomUUID()}`})).error);
  await secondRef.update({clanId});
  assert.equal((await call("getClanTowerShop",member,{towerId:second.id})).clanShop.items.find(i=>i.id==="swift_march_order").remaining,0);
  await memberRef.update({joinedAtMs:Date.now()});
  assert.equal((await call("getClanTowerShop",member,{towerId:tower.id})).clanShop.eligible,false);
  assert((await invoke("purchaseClanTowerShopItem",member,{towerId:tower.id,itemId:"recall_horn",operationId:`new_${randomUUID()}`})).error);
  await memberRef.update({joinedAtMs:now-172_800_000});
  const boxesBefore=(await memberProfile.get()).data().gear?.commonGearBoxes || 0;
  const mainAllowanceBefore=(await memberProfile.get()).data().gear?.shopPurchase || null;
  await call("purchaseClanTowerShopItem",member,{towerId:tower.id,itemId:"common_gear_box",operationId:`box_${randomUUID()}`});
  assert.equal((await memberProfile.get()).data().gear.commonGearBoxes,boxesBefore+1);
  assert.deepEqual((await memberProfile.get()).data().gear.shopPurchase || null,mainAllowanceBefore,"Clan purchase consumed the main-shop allowance.");
  const shield={towerId:tower.id,itemId:"shield_12h",operationId:`shield_${randomUUID()}`};
  await call("purchaseClanTowerShopItem",member,shield);
  assert((await invoke("purchaseClanTowerShopItem",member,{...shield,operationId:`shield_again_${randomUUID()}`})).error);
  await memberProfile.update({"clanShopUsage.shieldReadyAtMs":Date.now()-1});
  await call("purchaseClanTowerShopItem",member,{...shield,operationId:`shield_ready_${randomUUID()}`});
  assert((await invoke("getClanTowerShop",outsider,{towerId:tower.id})).error);
  const forged = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/players/${member.uid}?updateMask.fieldPaths=clanShopUsage`,{
    method:"PATCH",headers:{authorization:`Bearer ${member.token}`,"content-type":"application/json"},body:JSON.stringify({fields:{clanShopUsage:{mapValue:{fields:{}}}}})});
  assert.equal(forged.status,403,"Client could clear authoritative Clan Shop stock.");
  // A current-generation change resets only seasonal usage; inventory and gear boxes survive.
  await memberProfile.update({"clanShopUsage.resetGeneration":"previous-season"});
  const resetShop=(await call("getClanTowerShop",member,{towerId:tower.id})).clanShop;
  assert.equal(resetShop.items.find(i=>i.id==="swift_march_order").remaining,2);
  assert.equal((await memberProfile.get()).data().gear.commonGearBoxes,boxesBefore+1);
  // Resolve an actual Tower-origin rally: launch bonus survives source changes, defender recovery goes home.
  const enemyClan=`enemy_${randomUUID()}`;
  await db.doc(`clans/${enemyClan}`).set({...identity,status:"active",leaderUid:outsider.uid,name:"Enemy Test",tag:"ET",memberCount:1});
  await db.doc(`clans/${enemyClan}/members/${outsider.uid}`).set({...identity,clanId:enemyClan,uid:outsider.uid,role:"leader",status:"active",joinedAtMs:now-172800000});
  await db.doc(`players/${outsider.uid}`).update({clanId:enemyClan,clanRole:"leader"});
  await secondRef.update({clanId:enemyClan,buildings:{shop:1,workshop:0,infirmary:10,training:0},wallIntegrityBps:0});
  await secondRef.collection("garrison").doc(outsider.uid).set({...identity,towerId:second.id,clanId:enemyClan,uid:outsider.uid,ownerUid:outsider.uid,troops:100_000_000});
  await db.doc(`players/${outsider.uid}`).update({towerGarrisonTroops:100_000_000,towerGarrisonResetGeneration:identity.resetGeneration});
  const towerRallyId=`training_${randomUUID()}`,towerRallyRef=db.doc(`clans/${clanId}/rallies/${towerRallyId}`);
  await call("createClanRally",leader,{clanId,rallyId:towerRallyId,sourceType:"tower",targetType:"tower",sourceRegionId:tower.regionId,targetRegionId:second.regionId,
    army:{id:towerRallyId,kind:"attack",fromId:tower.id,toId:second.id,troops:1_000_000,requestedTroops:1_000_000}});
  await assertTowerPower(leader, (await garrisonRef(leader).get()).data().troops);
  const towerParticipants=participants.map(p=>({...p,sourceId:tower.id,sourceRegionId:tower.regionId,troops:1_000_000}));
  await towerRallyRef.update({participants:towerParticipants.slice(0,2)});
  const tooSmallOwned=await invoke("launchClanRally",leader,{clanId,rallyId:towerRallyId});
  assert.match(tooSmallOwned.error?.message || "",/At least 3 assembled players/,"Two players were allowed to attack a clan-owned Tower.");
  assert.equal((await towerRallyRef.get()).data().status,"forming");
  await towerRallyRef.update({participants:towerParticipants});
  const trained=await call("launchClanRally",leader,{clanId,rallyId:towerRallyId});
  const launchParticipants=(await towerRallyRef.get()).data().participants;
  assert(launchParticipants.every(p=>p.clanTrainingPercent===10),"Training Grounds was not applied to every participant at launch.");
  const lockedPower=(await towerRallyRef.get()).data().attackPower;
  await towerRef.update({"buildings.training":1});
  const defenderBefore=(await cityRef(outsider.home).get()).data().troops;
  await resolve(leader,trained.movement);
  assert.equal((await towerRallyRef.get()).data().attackPower,lockedPower,"Changing the source building changed an in-flight Rally.");
  let defenderReport;
  for(let attempt=0;attempt<60;attempt++) {
    defenderReport=(await db.doc(`players/${outsider.uid}`).get()).data().battleReports.find(r=>r.battleId===trained.movement.id);
    if(defenderReport)break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert(defenderReport?.casualtyRecovery,"Tower defender recovery report was not produced.");
  assert.equal(defenderReport.casualtyRecovery.clanInfirmaryPercent,15);
  assert(defenderReport.casualtyRecovery.clanRecoveredTroops>0,"Infirmary recovered no troops from a damaging attack.");
  assert((await cityRef(outsider.home).get()).data().troops>=defenderBefore+defenderReport.casualtyRecovery.recoveredTroops,"Tower casualties did not recover to their owner's Main City.");
  await assertTowerPower(outsider, (await secondRef.collection("garrison").doc(outsider.uid).get()).data().troops);
  await call("resolveArmyOrder",leader,{armyId:trained.movement.id,routeRegionIds:trained.movement.routeRegionIds});
  const reports=(await db.doc(`players/${outsider.uid}`).get()).data().battleReports.filter(r=>r.battleId===trained.movement.id);
  assert.equal(reports.length,1,"Battle retry duplicated the defender recovery report.");
  // NPC expansion limits apply before Tower troops leave, across all owned maps.
  const layout = require("../core-expansion-world-layout.json");
  const homeIds = new Set(actors.map(actor => actor.home.id));
  const targetCities = layout.maps.find(map => map.id === tower.regionId).cities.filter(city => !homeIds.has(city.id));
  const [npcTarget, rivalTarget] = targetCities;
  const portfolio = layout.maps.filter(map => map.permanentCore && map.id !== tower.regionId)
    .flatMap(map => map.cities).filter(city => !homeIds.has(city.id)).slice(0, 30);
  assert.equal(portfolio.length, 30);
  const fixtureCity = (city, ownerUid = "") => ({ ...city, ...identity, regionId: city.regionId,
    ownerKind: ownerUid ? "player" : "neutral", ownerUid, isMainCity: false, level: 1,
    troops: 10, troopFloat: 10, shieldUntilMs: 0, productionUpdatedAtMs: Date.now() });
  await cityRef(npcTarget).set(fixtureCity(npcTarget));
  await cityRef(rivalTarget).set(fixtureCity(rivalTarget, outsider.uid));
  const setCityCount = async count => {
    const batch = db.batch();
    portfolio.forEach((city, index) => batch.set(cityRef(city), fixtureCity(city, index < count - 1 ? member.uid : "")));
    await batch.commit();
  };
  const expectNpcBlocked = async pattern => {
    const payload = order(tower, npcTarget, "attack", 100, "tower", "city");
    const troopsBefore = (await garrisonRef(member).get()).data().troops;
    const profileBefore = (await memberProfile.get()).data();
    const result = await invoke("sendHoldingTowerArmyOrder", member, payload);
    assert.equal(result.error?.status, "FAILED_PRECONDITION");
    assert.match(result.error?.message || "", pattern);
    assert.equal((await db.doc(`armies/${payload.army.id}`).get()).exists, false, "A blocked NPC order created a march.");
    assert.equal((await garrisonRef(member).get()).data().troops, troopsBefore, "A blocked NPC order spent Tower troops.");
    assert.deepEqual((await memberProfile.get()).data(), profileBefore, "A blocked launch changed the player's economy or protection.");
  };
  await setCityCount(29);
  const preAttackTroops = (await garrisonRef(member).get()).data().troops;
  const allowedNpc = await call("sendHoldingTowerArmyOrder", member, order(tower, npcTarget, "attack", 100, "tower", "city"));
  assert.equal(allowedNpc.movement.toId, npcTarget.id, "A player at 29 cities could not launch an NPC attack.");
  await setCityCount(30);
  await expectNpcBlocked(/30 or more cities/);
  await resolve(member, allowedNpc.movement);
  const canceledNpc = (await db.doc(`armies/${allowedNpc.movement.id}`).get()).data();
  assert.equal(canceledNpc.result.blocked, "neutral_capture_limit", "An in-flight Tower attack bypassed the updated city limit.");
  assert.equal((await cityRef(npcTarget).get()).data().ownerKind, "neutral");
  assert.equal((await garrisonRef(member).get()).data().troops, preAttackTroops, "Canceled Tower attack failed to return its troops.");
  await assertTroopPower(member);
  await resolve(member, allowedNpc.movement);
  assert.equal((await garrisonRef(member).get()).data().troops, preAttackTroops, "Canceled attack retry duplicated returned troops.");
  await assertTroopPower(member);
  await assertTowerPower(member, preAttackTroops);
  await setCityCount(31);
  await expectNpcBlocked(/30 or more cities/);
  const rivalAttack = await call("sendHoldingTowerArmyOrder", member, order(tower, rivalTarget, "attack", 100, "tower", "city"));
  assert.equal(rivalAttack.movement.toId, rivalTarget.id, "The neutral cap blocked a player-owned city attack.");
  const towerAlert = await db.doc(`serverNotificationOutbox/incoming_${rivalAttack.movement.id}_${rivalAttack.movement.targetOwnerUid}`).get();
  assert.equal(towerAlert.exists, true, "Tower attacks must atomically queue the defender's alert.");
  assert.equal(towerAlert.data().notification.kind, "attack");
  assert.equal(towerAlert.data().notification.sourceCityId, tower.id);
  const scoutTower = await call("sendHoldingTowerArmyOrder", outsider, order(outsider.home, tower, "scout", 1, "city", "tower"));
  const towerScouting = await resolve(outsider, scoutTower.movement);
  assert.equal(towerScouting.status, "returning", "Tower scouting must persist its report and begin the return march.");
  const scoutProfile = (await db.doc(`players/${outsider.uid}`).get()).data();
  const towerScoutReport = scoutProfile.battleReports.find(report => report.cityId === tower.id && report.type === "scout");
  assert.equal(towerScoutReport?.uid, outsider.uid, "The Tower scout report must retain its recipient identity.");
  await resolve(outsider, scoutTower.movement);
  const campMap = layout.maps.find(map => map.permanentCore && map.camps?.length);
  const camp = {...campMap.camps[0], regionId: campMap.id};
  await db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${camp.regionId}/camps/${camp.id}`).set({ ...camp, ...identity, ownerUid: "", holderUid: "" });
  const campAttack = await call("sendHoldingTowerArmyOrder", member, order(tower, camp, "attack", 1_000_000, "tower", "camp"));
  assert.equal(campAttack.movement.targetType, "camp", "The neutral cap blocked a reward Camp attack.");
  await resolve(member, campAttack.movement);
  await assertTroopPower(member);
  assert.equal((await db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${camp.regionId}/camps/${camp.id}`).get()).data().holderUid,
    member.uid, "The overwhelming force must capture the Camp for the accounting regression.");
  await db.doc(`players/${member.uid}`).update({ identitySyncVersion: 0 });
  await call("syncPlayerIdentity", member);
  await assertTroopPower(member);
  const campTransfer = await call("sendHoldingTowerArmyOrder", member, order(tower, camp, "transfer", 100, "tower", "camp"));
  await resolve(member, campTransfer.movement);
  await assertTroopPower(member);
  const cappedMove = await call("sendHoldingTowerArmyOrder", member, order(tower, member.home, "transfer", 100, "tower", "city"));
  assert.equal(cappedMove.movement.kind, "transfer", "The neutral cap blocked a friendly transfer.");
  await setCityCount(29);
  const currentDaily = (await memberProfile.get()).data().daily;
  await memberProfile.update({daily: {...currentDaily, date: new Date().toISOString().slice(0, 10), neutralCaptures: 30}});
  await expectNpcBlocked(/Daily neutral capture limit reached/);
  await call("leaveClan", member);
  await assertTowerPower(member, 0);
  assert.equal((await garrisonRef(member).get()).exists, false, "Departed member still has stationed Tower troops.");
  console.log("Tower NPC cap passed: 29-city launch, 30/31-city rejection before troop/economy changes, cross-map count, in-flight cancellation/replay, daily cap, and allowed player-city/Camp/transfer orders.");
  console.log("Clan building callables passed: role checks, single job, Treasury retry, completion, highest Shop, shared concurrent stock, ownership/eligibility, gear delivery, Shield cooldown, seasonal usage and rules protection.");
  console.log("Tower lifecycle passed: callable rally creation/replay, two-player rejection for neutral and clan-owned Towers, three-player launch and capture, attributed survivors, owned controls, private garrison queries, outsider privacy, idempotent battle settlement, withdrawal and reinforcement.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
