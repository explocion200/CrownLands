"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
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
  for (let i = 0; i < 7; i++) actors.push(await createActor(`Report Ruler ${i + 1}`));
  const attackers = actors.slice(0, 3), defenders = actors.slice(3, 6), outsider = actors[6];
  const realm = await call("getRealmInfo", attackers[0]);
  assert.equal(realm.worldTopology, "core-expansion-v1");
  identity = { releaseId: realm.currentReleaseId, resetGeneration: realm.resetGeneration,
    worldId: realm.worldId, realmShardId: realm.sharedRealmId };
  const storageId = `${identity.resetGeneration}--${identity.realmShardId}`;
  const clanIds = [`attack_${randomUUID()}`, `defend_${randomUUID()}`], now = Date.now();
  for (const actor of actors) {
    await call("claimStartingCity", actor, { playerName: actor.label });
    const profile = (await db.doc(`players/${actor.uid}`).get()).data();
    actor.home = { id: profile.mainCityId, regionId: profile.mainRegionId };
  }
  for (const [side, members] of [attackers, defenders].entries()) {
    await db.doc(`clans/${clanIds[side]}`).set({ ...identity, status: "active", name: `Report Clan ${side}`,
      tag: `RC${side}`, leaderUid: members[0].uid, memberCount: 3 });
    for (const [index, actor] of members.entries()) {
      const role = index ? "member" : "leader";
      await db.doc(`clans/${clanIds[side]}/members/${actor.uid}`).set({ ...identity, clanId: clanIds[side],
        uid: actor.uid, role, status: "active", joinedAtMs: now - 172800000 });
      await db.doc(`players/${actor.uid}`).update({ clanId: clanIds[side], clanName: `Report Clan ${side}`, clanRole: role });
    }
  }
  const tower = towers.TOWERS[0], towerRef = db.doc(`holdingTowers/${tower.id}`);
  const sourceRef = db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${attackers[0].home.regionId}/cities/${attackers[0].home.id}`);
  const readAs = (actor, document) => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${document}`, {
    headers: { authorization: `Bearer ${actor.token}` },
  });
  for (const scenario of ["wall-held", "defeat", "capture", "raid", "neutral-raid", "lost-before-arrival", "stale-ownership"]) {
    const neutral = scenario === "neutral-raid";
    const victory = !["wall-held", "defeat"].includes(scenario);
    const limited = ["raid", "neutral-raid"].includes(scenario);
    const otherRef = db.doc(`holdingTowers/${towers.TOWERS[1].id}`);
    await otherRef.set({ ...towers.createNeutralTowerState(towers.TOWERS[1].id, { nowMs: now }), ...identity,
      ...(["raid", "neutral-raid", "lost-before-arrival", "stale-ownership"].includes(scenario)
        ? { ownerKind: "clan", clanId: clanIds[0], clanName: "Report Clan 0" } : {}),
      ...(scenario === "stale-ownership" ? { resetGeneration: "archived-generation" } : {}),
    });
    const allGarrisons = await towerRef.collection("garrison").get();
    for (const doc of allGarrisons.docs) await doc.ref.delete();
    await towerRef.set({ ...towers.createNeutralTowerState(tower.id, { nowMs: now }), ...identity,
      ownerKind: neutral ? "neutral" : "clan", clanId: neutral ? "" : clanIds[1], clanName: "Report Clan 1", clanTag: "RC1",
      neutralDefenders: neutral ? 6000000 : 0, buildings: {shop:3,workshop:3,infirmary:3,training:3}, wallLevel: scenario === "wall-held" ? 20 : 1,
      wallIntegrityBps: scenario === "wall-held" ? 10000 : 0 });
    for (const [index, actor] of (neutral ? [] : defenders).entries()) {
      await towerRef.collection("garrison").doc(actor.uid).set({ ...identity, towerId: tower.id,
        clanId: clanIds[1], uid: actor.uid, ownerUid: actor.uid, ownerName: actor.label,
        troops: 1000000 * (index + 1) });
      await db.doc(`players/${actor.uid}`).update({ towerGarrisonTroops: 1000000 * (index + 1),
        towerGarrisonResetGeneration: identity.resetGeneration });
    }
    const troops = victory ? 100000000 : scenario === "wall-held" ? 1 : 100000;
    await sourceRef.update({ troops, troopFloat: troops, productionUpdatedAtMs: Date.now() });
    const rallyId = `reports_${randomUUID()}`, clanId = clanIds[0];
    await call("createClanRally", attackers[0], { clanId, rallyId, sourceType: "city", targetType: "tower",
      sourceRegionId: attackers[0].home.regionId, targetRegionId: tower.regionId,
      army: { id: rallyId, kind: "attack", fromId: attackers[0].home.id, toId: tower.id, troops, requestedTroops: troops } });
    const participants = attackers.map((actor, index) => ({ uid: actor.uid, ownerName: actor.label,
      role: index ? "ally" : "leader", troops, sourceId: actor.home.id, sourceRegionId: actor.home.regionId,
      status: "assembled", joinedAtMs: now - 1000, assembledAtMs: now - 1000 }));
    // Assembly is a fixture; launch, combat, receipts, settlement, reports and rules are real.
    await db.doc(`clans/${clanId}/rallies/${rallyId}`).update({ participants });
    for (const actor of attackers.slice(1)) await db.doc(`players/${actor.uid}`).update({ committedRallyTroops: troops,
      rallyResetGeneration: identity.resetGeneration });
    const launched = await call("launchClanRally", attackers[0], { clanId, rallyId });
    const towerBefore = (await towerRef.get()).data();
    if (scenario === "lost-before-arrival") await otherRef.update({ownerKind:"neutral",clanId:""});
    const battle = await resolve(attackers[0], launched.movement);
    assert.equal(battle.result.success, victory);
    assert.equal(battle.result.captured, victory && !limited);
    assert.equal(battle.result.captureBlockedReason, limited ? "clan_tower_limit" : "");
    const towerAfter = (await towerRef.get()).data();
    assert.equal(towerAfter.clanId, victory && !limited ? clanIds[0] : towerBefore.clanId);
    if (limited) {
      assert.equal(towerAfter.ownerKind,towerBefore.ownerKind);
      assert.equal(towerAfter.ownershipRevision,towerBefore.ownershipRevision);
      assert.equal(towerAfter.wallLevel,towerBefore.wallLevel);
      assert.deepEqual(towerAfter.buildings,towerBefore.buildings);
      assert.equal(towerAfter.wallIntegrityBps,0);
      assert.equal((await towerRef.collection("garrison").get()).size,0,"Non-capturing attackers must not station");
    }
    const involved = neutral ? attackers : actors.slice(0,6);
    const battleId = launched.movement.id, snapshotPath = `battleSnapshots/${storageId}/entries/${battleId}`;
    const snapshot = (await db.doc(snapshotPath).get()).data();
    assert(snapshot, "Tower combat did not save its detailed snapshot");
    assert.equal(snapshot.target.targetType, "tower");
    assert.deepEqual([...snapshot.participantUids].sort(), involved.map(actor => actor.uid).sort());
    const attackingRows = snapshot.attackers, defendingRows = [snapshot.defender, ...snapshot.reinforcements];
    assert.equal(attackingRows.length, 3); assert.equal(defendingRows.length, neutral ? 1 : 3);
    assert.equal(snapshot.combatRule.captureAllowed,!limited);
    if(limited)assert.equal(snapshot.combatRule.id,"clan_tower_raid");
    const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
    assert.equal(sum(attackingRows, "effectivePower"), snapshot.totals.attackPower);
    assert.equal(sum(defendingRows, "effectivePower") + snapshot.siege.startingWallPower, snapshot.totals.defensePower);
    assert.equal(sum(attackingRows, "losses"), snapshot.totals.attackerLosses);
    assert.equal(sum(defendingRows, "losses"), snapshot.totals.defenderLosses);
    if (scenario === "wall-held") assert.equal(snapshot.totals.defenderLosses, 0);
    // Defenders make no callable requests after battle: server triggers must deliver offline.
    let reports = [];
    for (let attempt = 0; attempt < 75; attempt++) {
      reports = await Promise.all(involved.map(async actor => (await db.doc(`players/${actor.uid}`).get()).data().battleReports?.find(report => report.battleId === battleId)));
      if (reports.every(Boolean)) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert(reports.every(Boolean), "Every offline attacker and defender must receive the report");
    for (const [index, actor] of involved.entries()) {
      const report = reports[index], rows = index < 3 ? attackingRows : defendingRows;
      const row = rows.find(row => row.ownerUid === actor.uid);
      if(limited)assert.match(report.summary,/ownership is unchanged/i);
      assert.equal(report.uid, actor.uid); assert.equal(report.type, index < 3 ? "attack" : "defense");
      assert.equal(report[index < 3 ? "attackerLosses" : "defenderLosses"], row.losses);
      assert.equal(report[index < 3 ? "survivors" : "defendersLeft"], row.survivors);
      assert.equal(row.losses + row.survivors, row.startingTroops);
      assert.equal(report.battleSnapshotVersion, snapshot.modelVersion);
      assert((await db.doc(`players/${actor.uid}/serverReports/${report.id}`).get()).exists, "Durable personal report missing");
      assert.equal((await readAs(actor, snapshotPath)).status, 200, "Participant cannot read shared battle details");
    }
    assert.equal((await readAs(outsider, snapshotPath)).status, 403, "Nonparticipant learned private battle statistics");
    if(!neutral)assert.equal((await readAs(attackers[0], `players/${defenders[0].uid}/serverReports/${reports[3].id}`)).status, 403);
    await call("resolveArmyOrder", attackers[0], { armyId: battleId, routeRegionIds: launched.movement.routeRegionIds });
    assert.deepEqual((await db.doc(snapshotPath).get()).data(), snapshot, "Retry rewrote battle-time statistics");
    for (const actor of involved) {
      const profile = (await db.doc(`players/${actor.uid}`).get()).data();
      assert.equal(profile.battleReports.filter(report => report.battleId === battleId).length, 1, "Retry duplicated a report");
    }
    if(limited) {
      for(const id of battle.result.attackerSettlementReceipts) {
        const receipt=(await db.doc(`rallyBattleReceipts/${storageId}/entries/${id}`).get()).data();
        assert(receipt,"Missing attacker settlement");assert.equal(receipt.stationOnVictory,false);assert.equal(receipt.stationedAtBattle,false);
        assert(receipt.returnArmyId,"Survivors must get a return march");
        const returning=(await db.doc(`armies/${receipt.returnArmyId}`).get()).data();
        assert.equal(returning.ownerUid,receipt.contributorUid);assert.equal(returning.troops,receipt.survivors);
      }
    }
    console.log(`Clan Tower ${scenario}: ${involved.length} private reports, ownership, exact powers/casualties, offline delivery and retry verified.`);
  }
  // Two victories arriving together must produce exactly one new clan holding.
  for(const definition of towers.TOWERS) {
    const ref=db.doc(`holdingTowers/${definition.id}`);
    for(const doc of (await ref.collection("garrison").get()).docs)await doc.ref.delete();
    await ref.set({...towers.createNeutralTowerState(definition.id,{nowMs:Date.now()}),...identity,
      neutralDefenders:10000,wallIntegrityBps:0});
  }
  for(const actor of attackers)await db.doc(`players/${actor.uid}`).update({committedRallyTroops:0,towerGarrisonTroops:0});
  const racing=[];
  for(const target of towers.TOWERS.slice(0,2)) {
    const troops=1000000,rallyId=`race_${randomUUID()}`,clanId=clanIds[0];
    await sourceRef.update({troops:100000000,troopFloat:100000000,productionUpdatedAtMs:Date.now()});
    await call("createClanRally",attackers[0],{clanId,rallyId,sourceType:"city",targetType:"tower",
      sourceRegionId:attackers[0].home.regionId,targetRegionId:target.regionId,
      army:{id:rallyId,kind:"attack",fromId:attackers[0].home.id,toId:target.id,troops,requestedTroops:troops}});
    await db.doc(`clans/${clanId}/rallies/${rallyId}`).update({participants:attackers.map((actor,index)=>({
      uid:actor.uid,ownerName:actor.label,role:index?"ally":"leader",troops,sourceId:actor.home.id,
      sourceRegionId:actor.home.regionId,status:"assembled",joinedAtMs:now-1000,assembledAtMs:now-1000}))});
    for(const actor of attackers.slice(1))await db.doc(`players/${actor.uid}`).update({committedRallyTroops:FieldValue.increment(troops),rallyResetGeneration:identity.resetGeneration});
    const launched=await call("launchClanRally",attackers[0],{clanId,rallyId});
    await db.doc(`armies/${launched.movement.id}`).update({arrivesAtMs:Date.now()-1000});
    racing.push(launched.movement);
  }
  const raceResults=await Promise.all(racing.map(movement=>call("resolveArmyOrder",attackers[0],{armyId:movement.id,routeRegionIds:movement.routeRegionIds})));
  assert(raceResults.every(entry=>entry.result.success),"Both assaults should win their combat");
  assert.equal(raceResults.filter(entry=>entry.result.captured).length,1,"Concurrent arrivals granted multiple Clan Towers");
  const holdings=await Promise.all(towers.TOWERS.map(tower=>db.doc(`holdingTowers/${tower.id}`).get()));
  assert.equal(holdings.filter(doc=>doc.data().clanId===clanIds[0]).length,1);
  console.log("Concurrent Clan Tower victories: one capture, one non-capturing victory.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
