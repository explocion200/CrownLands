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

async function main() {
  const actors = [];
  for (let index = 0; index < 6; index++) actors.push(await createActor(`Tower Ruler ${index + 1}`));
  const [leader, member] = actors, outsider = actors[5];
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
  const cityRef = city => db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${city.regionId}/cities/${city.id}`);
  await towerRef.set({ ...towers.createNeutralTowerState(tower.id, { nowMs: now }), ...identity });
  await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: leader.uid, name: "Tower Test Clan", tag: "TTC", memberCount: 5 });
  const participants = [];
  for (const [index, actor] of actors.slice(0, 5).entries()) {
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
  await rallyRef.update({ participants: participants.slice(0, 4) });
  const tooSmall = await invoke("launchClanRally", leader, { clanId, rallyId });
  assert(tooSmall.error, "Four players were allowed to conquer a Tower.");
  await rallyRef.update({ participants });
  const launched = await call("launchClanRally", leader, { clanId, rallyId });
  const battle = await resolve(leader, launched.movement);
  assert.equal(battle.result.success, true, "The overwhelming five-player rally did not capture the neutral Tower.");
  const captured = (await towerRef.get()).data();
  assert.equal(captured.clanId, clanId);
  assert.equal(captured.wallLevel, 1);
  assert.equal(captured.wallIntegrityBps, 0);
  const garrison = await towerRef.collection("garrison").get();
  assert.equal(garrison.size, 5, "Survivors were not attributed to all five contributors.");
  for (const row of garrison.docs) assert(row.data().troops > 0 && row.data().troops <= contribution);
  const owned = (await call("getHoldingTowerState", member, { towerId: tower.id })).towers[0];
  assert.equal(owned.ownerMember, true);
  assert.equal(owned.garrison.length, 5);
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
  assert.equal((await memberQuery.json()).filter(row => row.document).length, 5);
  assert.equal((await queryGarrison(outsider)).status, 403, "An outsider could query private garrisons.");
  const unchanged = garrison.docs.map(row => [row.id, row.data().troops]);
  await call("resolveArmyOrder", leader, { armyId: launched.movement.id, routeRegionIds: launched.movement.routeRegionIds });
  assert.deepEqual((await towerRef.collection("garrison").get()).docs.map(row => [row.id, row.data().troops]), unchanged, "Battle retry duplicated survivors.");
  const order = (from, to, kind, troops, sourceType, targetType) => ({ sourceType, targetType, sourceRegionId: from.regionId, targetRegionId: to.regionId,
    army: { id: `tower_order_${randomUUID()}`, kind, fromId: from.id, toId: to.id, requestedTroops: troops, troops } });
  const before = (await garrisonRef(member).get()).data().troops;
  const others = unchanged.filter(([uid]) => uid !== member.uid);
  const withdrawal = await call("sendHoldingTowerArmyOrder", member, order(tower, member.home, "transfer", 1000, "tower", "city"));
  assert.equal((await garrisonRef(member).get()).data().troops, before - 1000);
  const cityBefore = (await cityRef(member.home).get()).data().troops;
  await resolve(member, withdrawal.movement);
  assert((await cityRef(member.home).get()).data().troops >= cityBefore + 1000, "Withdrawal did not reach its owner's city.");
  const reinforcement = await call("sendHoldingTowerArmyOrder", member, order(member.home, tower, "reinforce", 100, "city", "tower"));
  await resolve(member, reinforcement.movement);
  assert.equal((await garrisonRef(member).get()).data().troops, before - 900);
  assert.deepEqual((await towerRef.collection("garrison").get()).docs.filter(row => row.id !== member.uid).map(row => [row.id, row.data().troops]), others,
    "Personal orders changed another player's garrison.");
  // New Tower services use donated Gold, one construction slot, and private per-player Shop usage.
  const treasuryRef = db.doc(`clans/${clanId}/treasury/${identity.resetGeneration}`);
  await treasuryRef.set({...identity,balance:30_000_000_000,totalDonated:30_000_000_000,totalSpent:0,revision:1});
  await towerRef.update({wallIntegrityBps:10000,buildings:{shop:0,workshop:0,infirmary:0,training:0},buildingProject:null});
  const buildPayload = {towerId:tower.id,buildingId:"shop",operationId:`build_${randomUUID()}`};
  assert((await invoke("startClanTowerBuilding",member,buildPayload)).error,"A regular member could spend the Treasury.");
  const build = await call("startClanTowerBuilding",leader,buildPayload);
  assert.equal(build.tower.buildingProject.targetLevel,1);
  assert.equal((await treasuryRef.get()).data().balance,29_995_000_000);
  assert.equal((await call("startClanTowerBuilding",leader,buildPayload)).duplicate,true);
  assert.equal((await treasuryRef.get()).data().balance,29_995_000_000,"Build retry charged Gold twice.");
  assert((await invoke("startClanTowerBuilding",leader,{...buildPayload,buildingId:"workshop",operationId:`busy_${randomUUID()}`})).error);
  await towerRef.update({"buildingProject.progressStartedAtMs":Date.now()-1_801_000});
  assert.equal((await call("getHoldingTowerState",leader,{towerId:tower.id})).towers[0].buildings.shop,1);
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
  assert.equal(bought.shopItems.swift_march_order,stockBefore+1);
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
  const towerRallyId=`training_${randomUUID()}`,towerRallyRef=db.doc(`clans/${clanId}/rallies/${towerRallyId}`);
  await call("createClanRally",leader,{clanId,rallyId:towerRallyId,sourceType:"tower",targetType:"tower",sourceRegionId:tower.regionId,targetRegionId:second.regionId,
    army:{id:towerRallyId,kind:"attack",fromId:tower.id,toId:second.id,troops:1_000_000,requestedTroops:1_000_000}});
  const towerParticipants=participants.map(p=>({...p,sourceId:tower.id,sourceRegionId:tower.regionId,troops:1_000_000}));
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
  await call("resolveArmyOrder",leader,{armyId:trained.movement.id,routeRegionIds:trained.movement.routeRegionIds});
  const reports=(await db.doc(`players/${outsider.uid}`).get()).data().battleReports.filter(r=>r.battleId===trained.movement.id);
  assert.equal(reports.length,1,"Battle retry duplicated the defender recovery report.");
  console.log("Clan building callables passed: role checks, single job, Treasury retry, completion, highest Shop, shared concurrent stock, ownership/eligibility, gear delivery, Shield cooldown, seasonal usage and rules protection.");
  console.log("Tower lifecycle passed: callable rally creation/replay, four-player rejection, five-player capture, attributed survivors, owned controls, private garrison queries, outsider privacy, idempotent battle settlement, withdrawal and reinforcement.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
