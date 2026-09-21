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
    await db.doc(`players/${actor.uid}`).set({ clanId, clanRole: role, committedRallyTroops: contribution,
      rallyResetGeneration: identity.resetGeneration }, { merge: true });
    participants.push({ uid: actor.uid, ownerName: actor.label, role: index ? "ally" : "leader", troops: contribution,
      sourceId: actor.home.id, sourceRegionId: actor.home.regionId, status: "assembled", joinedAtMs: now - 1000, assembledAtMs: now - 1000 });
  }
  const neutral = (await call("getHoldingTowerState", leader, { towerId: tower.id })).towers[0];
  assert.equal(neutral.ownerKind, "neutral");
  assert.equal(neutral.permissions.createRallyAttack, true);
  const rallyId = `tower_capture_${randomUUID()}`, rallyRef = db.doc(`clans/${clanId}/rallies/${rallyId}`);
  // Start with an assembled fixture so this test focuses on launch, battle and ownership transitions.
  await rallyRef.set({ ...identity, id: rallyId, clanId, leaderUid: leader.uid, status: "forming", targetType: "tower",
    targetId: tower.id, targetRegionId: tower.regionId, assemblyCityId: leader.home.id, assemblyRegionId: leader.home.regionId,
    assemblyType: "city", participants: participants.slice(0, 4) });
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
  console.log("Tower lifecycle passed: four-player rejection, five-player capture, attributed survivors, owned controls, private garrison queries, outsider privacy, idempotent battle settlement, withdrawal and reinforcement.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
