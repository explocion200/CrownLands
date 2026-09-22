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
  for (const scenario of ["wall-held", "defeat", "capture"]) {
    const allGarrisons = await towerRef.collection("garrison").get();
    for (const doc of allGarrisons.docs) await doc.ref.delete();
    await towerRef.set({ ...towers.createNeutralTowerState(tower.id, { nowMs: now }), ...identity,
      ownerKind: "clan", clanId: clanIds[1], clanName: "Report Clan 1", clanTag: "RC1",
      neutralDefenders: 0, wallLevel: scenario === "wall-held" ? 20 : 1,
      wallIntegrityBps: scenario === "wall-held" ? 10000 : 0 });
    for (const [index, actor] of defenders.entries()) {
      await towerRef.collection("garrison").doc(actor.uid).set({ ...identity, towerId: tower.id,
        clanId: clanIds[1], uid: actor.uid, ownerUid: actor.uid, ownerName: actor.label,
        troops: 1000000 * (index + 1) });
      await db.doc(`players/${actor.uid}`).update({ towerGarrisonTroops: 1000000 * (index + 1),
        towerGarrisonResetGeneration: identity.resetGeneration });
    }
    const troops = scenario === "capture" ? 100000000 : scenario === "wall-held" ? 1 : 100000;
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
    const battle = await resolve(attackers[0], launched.movement);
    assert.equal(battle.result.success, scenario === "capture");
    const battleId = launched.movement.id, snapshotPath = `battleSnapshots/${storageId}/entries/${battleId}`;
    const snapshot = (await db.doc(snapshotPath).get()).data();
    assert(snapshot, "Tower combat did not save its detailed snapshot");
    assert.equal(snapshot.target.targetType, "tower");
    assert.deepEqual([...snapshot.participantUids].sort(), actors.slice(0, 6).map(actor => actor.uid).sort());
    const attackingRows = snapshot.attackers, defendingRows = [snapshot.defender, ...snapshot.reinforcements];
    assert.equal(attackingRows.length, 3); assert.equal(defendingRows.length, 3);
    const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
    assert.equal(sum(attackingRows, "effectivePower"), snapshot.totals.attackPower);
    assert.equal(sum(defendingRows, "effectivePower") + snapshot.siege.startingWallPower, snapshot.totals.defensePower);
    assert.equal(sum(attackingRows, "losses"), snapshot.totals.attackerLosses);
    assert.equal(sum(defendingRows, "losses"), snapshot.totals.defenderLosses);
    if (scenario === "wall-held") assert.equal(snapshot.totals.defenderLosses, 0);
    // Defenders make no callable requests after battle: server triggers must deliver offline.
    let reports = [];
    for (let attempt = 0; attempt < 75; attempt++) {
      reports = await Promise.all(actors.slice(0, 6).map(async actor => (await db.doc(`players/${actor.uid}`).get()).data().battleReports?.find(report => report.battleId === battleId)));
      if (reports.every(Boolean)) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert(reports.every(Boolean), "Every offline attacker and defender must receive the report");
    for (const [index, actor] of actors.slice(0, 6).entries()) {
      const report = reports[index], rows = index < 3 ? attackingRows : defendingRows;
      const row = rows.find(row => row.ownerUid === actor.uid);
      assert.equal(report.uid, actor.uid); assert.equal(report.type, index < 3 ? "attack" : "defense");
      assert.equal(report[index < 3 ? "attackerLosses" : "defenderLosses"], row.losses);
      assert.equal(report[index < 3 ? "survivors" : "defendersLeft"], row.survivors);
      assert.equal(row.losses + row.survivors, row.startingTroops);
      assert.equal(report.battleSnapshotVersion, snapshot.modelVersion);
      assert((await db.doc(`players/${actor.uid}/serverReports/${report.id}`).get()).exists, "Durable personal report missing");
      assert.equal((await readAs(actor, snapshotPath)).status, 200, "Participant cannot read shared battle details");
    }
    assert.equal((await readAs(outsider, snapshotPath)).status, 403, "Nonparticipant learned private battle statistics");
    assert.equal((await readAs(attackers[0], `players/${defenders[0].uid}/serverReports/${reports[3].id}`)).status, 403);
    await call("resolveArmyOrder", attackers[0], { armyId: battleId, routeRegionIds: launched.movement.routeRegionIds });
    assert.deepEqual((await db.doc(snapshotPath).get()).data(), snapshot, "Retry rewrote battle-time statistics");
    for (const actor of actors.slice(0, 6)) {
      const profile = (await db.doc(`players/${actor.uid}`).get()).data();
      assert.equal(profile.battleReports.filter(report => report.battleId === battleId).length, 1, "Retry duplicated a report");
    }
    console.log(`Clan Tower ${scenario}: six private reports, exact powers/casualties, offline delivery and retry verified.`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
