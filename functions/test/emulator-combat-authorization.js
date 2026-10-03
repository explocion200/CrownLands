"use strict";
const { signUpVerifiedPlayer } = require("./auth-fixtures");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const release = require("../release-config.json");
const layout = require("../core-expansion-world-layout.json");
const policy = require("../combat-authorization.js");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Local emulators are required.");
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();
let identity = { ...release, realmShardId: "legacy" }, functionsHost;
const restRoot = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents`;
async function user(label) {
  const response = await signUpVerifiedPlayer(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `combat-${randomUUID()}@example.test`, password: "Emulator-Combat-Only-123!", returnSecureToken: true }),
  });
  const body = await response.json(); assert(response.ok, "Emulator signup failed");
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
  const body = await response.json();
  return { ok: response.ok && !body.error, result: body.result, error: body.error };
}
async function call(name, actor, data) {
  const result = await invoke(name, actor, data);
  assert(result.ok, `${name}: ${JSON.stringify(result.error)}`);
  assert.notEqual(result.result?.ok, false, `${name}: ${JSON.stringify(result.result)}`);
  return result.result;
}
async function deny(name, actor, data, pattern) {
  const result = await invoke(name, actor, data);
  assert(!result.ok, `${name} unexpectedly succeeded`);
  assert.match(result.error.message, pattern);
}
const profileRef = actor => db.doc(`players/${actor.uid}`);
const profile = async actor => (await profileRef(actor).get()).data();
const islandId = region => `${identity.worldId}--${identity.realmShardId}--${region}`;
const cityRef = city => db.doc(`islands/${islandId(city.regionId)}/cities/${city.id}`);
const grants = actor => db.collection(`players/${actor.uid}/retaliationWindows`);
const order = (source, target, troops, extra = {}) => ({ sourceRegionId: source.regionId, targetRegionId: target.regionId,
  army: { id: `combat_${randomUUID()}`, kind: "attack", fromId: source.id, toId: target.id, requestedTroops: troops, troops, ...extra } });
async function seedCity(seed, owner, troops) {
  const city = { ...seed, ...identity, owner: "player", ownerKind: "player", ownerUid: owner.uid, ownerName: owner.label,
    level: 1, troops, troopFloat: troops, isMainCity: false, ownerShieldExpiresAtMs: 0, productionUpdatedAtMs: Date.now(),
    lastCapturedAtMs: Date.now() - 86_400_000, neutralClaimOpen: false };
  await cityRef(city).set(city);
  return city;
}
async function resolve(actor, movement, elapsedMs = 0) {
  const patch = { arrivesAtMs: Date.now() - 1000 };
  if (elapsedMs) {
    patch.launchedAtMs = movement.launchedAtMs - elapsedMs;
    patch.retaliationAuthorization = { ...movement.retaliationAuthorization,
      capturedAtMs: movement.retaliationAuthorization.capturedAtMs - elapsedMs,
      usedAtMs: movement.retaliationAuthorization.usedAtMs - elapsedMs,
      expiresAtMs: movement.retaliationAuthorization.expiresAtMs - elapsedMs };
  }
  await db.doc(`armies/${movement.id}`).set(patch, { merge: true });
  return call("resolveArmyOrder", actor, { armyId: movement.id, routeRegionIds: movement.routeRegionIds });
}
async function clientRead(actor, path) {
  return fetch(`${restRoot}/${path}`, { headers: { authorization: `Bearer ${actor.token}` } });
}
async function clientPatch(actor, path, field, value) {
  return fetch(`${restRoot}/${path}?updateMask.fieldPaths=${field}`, {
    method: "PATCH", headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" },
    body: JSON.stringify({ fields: { [field]: typeof value === "number" ? { integerValue: String(value) } : { stringValue: value } } }),
  });
}
async function objectiveDispatchCases(actors, source, spareCity) {
  const towers = require("../holding-towers.js");
  for (const label of ["Fourth", "Fifth", "Opponent"]) {
    const actor = await user(label);
    await call("claimStartingCity", actor, { playerName: label });
    actors.push(actor);
  }
  const contributors = actors.slice(0, 5), opponent = actors[5], leader = actors[0];
  const clanId = `combat_clan_${randomUUID()}`, enemyClanId = `combat_enemy_${randomUUID()}`;
  const now = Date.now(), activeShield = now + 3_600_000;
  await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: leader.uid, name: "Combat Clan", tag: "CC", memberCount: 5 });
  const participants = [];
  for (const [index, actor] of contributors.entries()) {
    const p = await profile(actor);
    const role = index === 0 ? "leader" : "member";
    await db.doc(`clans/${clanId}/members/${actor.uid}`).set({ ...identity, clanId, uid: actor.uid, role, status: "active", joinedAtMs: now - 172_800_000 });
    await profileRef(actor).set({ clanId, clanRole: role, itemEffects: { shieldExpiresAtMs: activeShield },
      committedRallyTroops: 100, rallyResetGeneration: identity.resetGeneration,
      peaceShieldCooldownResetGeneration: identity.resetGeneration, peaceShieldCooldownExpiresAtMs: 0 }, { merge: true });
    participants.push({ uid: actor.uid, ownerName: actor.label, role: index === 0 ? "leader" : "ally", troops: 100,
      sourceId: index === 0 ? source.id : p.mainCityId, sourceRegionId: index === 0 ? source.regionId : p.mainRegionId,
      status: "assembled", joinedAtMs: now - 1000, assembledAtMs: now - 1000 });
  }
  const objectiveSeeds = layout.maps.flatMap(map => (map.objectives || []).map(objective => ({ ...objective, regionId: map.id })))
    .filter(objective => ["gold", "crown"].includes(objective.type));
  for (const neutral of [true, false]) {
    for (const target of [...objectiveSeeds, { ...towers.TOWERS[0], targetType: "tower" }]) {
      const isTower = target.targetType === "tower";
      const ref = isTower ? db.doc(`holdingTowers/${target.id}`) : cityRef(target);
      await ref.set(isTower ? { ...towers.createNeutralTowerState(target.id, now), ...identity, ownerKind: neutral ? "neutral" : "clan", clanId: neutral ? "" : enemyClanId }
        : { ...target, ...identity, kind: "stronghold", ownerKind: neutral ? "neutral" : "player", ownerUid: neutral ? "" : opponent.uid, troops: 100, troopFloat: 100 });
      const rallyId = `combat_rally_${randomUUID()}`;
      await db.doc(`clans/${clanId}/rallies/${rallyId}`).set({ ...identity, id: rallyId, clanId, leaderUid: leader.uid,
        status: "forming", targetType: isTower ? "tower" : "city", targetId: target.id, targetRegionId: target.regionId,
        assemblyCityId: source.id, assemblyRegionId: source.regionId, assemblyType: "city", participants });
      const launched = await call("launchClanRally", leader, { clanId, rallyId });
      for (const actor of contributors) {
        const p = await profile(actor);
        assert.equal(p.peaceShieldCooldownExpiresAtMs, neutral ? 0 : launched.movement.launchedAtMs + policy.SHIELD_COOLDOWN_MS, `${target.name} contributor cooldown mismatch`);
        assert.equal(p.itemEffects.shieldExpiresAtMs, activeShield, "Rally changed existing shield retention");
      }
      assert.equal(policy.shieldCooldownExpiresAt(await profile(opponent), identity.resetGeneration), 0);
      if (!isTower) {
        await profileRef(leader).update({ peaceShieldCooldownExpiresAtMs: 0 });
        const direct = await call("sendArmyOrder", leader, order(source, target, 100));
        assert.equal((await profile(leader)).peaceShieldCooldownExpiresAtMs, neutral ? 0 : direct.movement.launchedAtMs + policy.SHIELD_COOLDOWN_MS);
        await profileRef(leader).update({ "itemEffects.shieldExpiresAtMs": activeShield });
      }
    }
  }
  const camp = layout.maps.flatMap(map => (map.camps || []).map(seed => ({ ...seed, regionId: map.id })))[0];
  assert(camp, "Missing current-realm camp seed");
  for (const neutral of [true, false]) {
    await db.doc(`islands/${islandId(camp.regionId)}/camps/${camp.id}`).set({ ...camp, ...identity,
      holderUid: neutral ? "" : opponent.uid, ownerUid: neutral ? "" : opponent.uid,
      state: neutral ? "neutral" : "held", currentGarrison: 200, heldSinceMs: now - 1000,
      payoutAtMs: now + 3_600_000, payoutPending: !neutral, activeArmyIds: [] });
    await profileRef(leader).update({ peaceShieldCooldownExpiresAtMs: 0 });
    const attack = await call("sendArmyOrder", leader, order(source, camp, 100, { targetType: "camp" }));
    assert.equal((await profile(leader)).peaceShieldCooldownExpiresAtMs, neutral ? 0 : attack.movement.launchedAtMs + policy.SHIELD_COOLDOWN_MS);
    assert.equal(policy.shieldCooldownExpiresAt(await profile(opponent), identity.resetGeneration), 0);
  }
  const tower = towers.TOWERS[1];
  await db.doc(`holdingTowers/${tower.id}`).set({ ...towers.createNeutralTowerState(tower.id, now), ...identity, ownerKind: "clan", clanId });
  await db.doc(`holdingTowers/${tower.id}/garrison/${leader.uid}`).set({ ...identity, towerId: tower.id, clanId, uid: leader.uid, troops: 10_000 });
  await profileRef(leader).update({ towerGarrisonTroops: 10_000, towerGarrisonResetGeneration: identity.resetGeneration });
  const target = await seedCity(spareCity, opponent, 1);
  const beforeScout = (await profile(leader)).peaceShieldCooldownExpiresAtMs;
  await call("sendArmyOrder", leader, order(source, target, 1, { kind: "scout" }));
  assert.equal((await profile(leader)).peaceShieldCooldownExpiresAtMs, beforeScout, "Scouting refreshed offensive cooldown");
  assert.equal(policy.shieldCooldownExpiresAt(await profile(opponent), identity.resetGeneration), 0, "Being scouted started a cooldown");
  const recordId = `tower_capture_${randomUUID()}`;
  await grants(leader).doc(recordId).set({ ...identity, id: recordId, originalOwnerUid: leader.uid, capturerUid: opponent.uid,
    cityId: target.id, regionId: target.regionId, cityPath: cityRef(target).path, cityName: target.name,
    capturedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 899_000, status: "available", usedAtMs: 0, usedArmyId: "" });
  const towerOrder = { ...order(tower, target, 1000, { retaliationId: recordId }), sourceType: "tower", targetType: "city" };
  const launched = await call("sendHoldingTowerArmyOrder", leader, towerOrder);
  assert.equal(launched.movement.attackProtection, null);
  assert.equal((await grants(leader).doc(recordId).get()).data().usedArmyId, launched.movement.id);
  assert.equal((await profile(leader)).peaceShieldCooldownExpiresAtMs, launched.movement.launchedAtMs + policy.SHIELD_COOLDOWN_MS);
  await deny("sendHoldingTowerArmyOrder", leader, {
    ...towerOrder, army: { ...towerOrder.army, id: `combat_${randomUUID()}` },
  }, /already been used/);
  console.log("Current-realm objectives passed: neutral vs player-held Camps/Gold/Citadel solo orders, five-player Gold/Citadel/Tower Rallies, every contributor, scouting/defender isolation, shield retention and Tower-origin retaliation.");
}
async function main() {
  // Prepare the empty prior season before crossing the real monthly boundary.
  const seasons = require("../season-rewards");
  const previous = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
  if (seasons.supported(previous)) await seasons.arm(db, previous, seasons.seasonInfo(previous).startsAtMs + 1);
  const [high, low, third] = await Promise.all([user("High"), user("Low"), user("Third")]);
  const info = await call("getRealmInfo", high);
  assert.equal(info.worldTopology, "core-expansion-v1");
  identity = { releaseId: info.currentReleaseId, resetGeneration: info.resetGeneration, worldId: info.worldId, realmShardId: info.sharedRealmId };
  const claims = [];
  for (const actor of [high, low, third]) claims.push(await call("claimStartingCity", actor, { playerName: actor.label }));
  const region = claims[0].regionId || claims[0].mainRegionId;
  const map = layout.maps.find(entry => entry.id === region);
  assert(map, `Missing claimed map ${region}`);
  const seeds = map.cities.filter(city => !claims.some(claim => claim.cityId === city.id) && city.kind !== "stronghold");
  assert(seeds.length >= 8, "Need eight valid regular cities");
  for (const actor of [high, low, third]) await profileRef(actor).set({
    itemEffects: { shieldExpiresAtMs: 0 }, shopItems: { shield_12h: 5 }, economyUpdatedAtMs: Date.now(),
  }, { merge: true });
  const hSource = await seedCity({ ...seeds[0], regionId: region }, high, 10_000_000);
  const lSource = await seedCity({ ...seeds[1], regionId: region }, low, 100_000);
  const cSource = await seedCity({ ...seeds[2], regionId: region }, third, 100_000);
  const targets = [];
  for (const seed of seeds.slice(3, 7)) targets.push(await seedCity({ ...seed, regionId: region }, high, 1));
  const unrelated = await seedCity({ ...seeds[7], regionId: region }, low, 1);
  await Promise.all([high, low, third].map(actor => call("collectEconomy", actor)));
  await verifySmoothProtectionRanges(high, low, hSource, lSource);
  assert((await profile(high)).kingPower > (await profile(low)).kingPower * 2.5);

  const first = await call("sendArmyOrder", low, order(lSource, targets[0], 1500));
  const cooldown = (await profile(low)).peaceShieldCooldownExpiresAtMs;
  assert.equal(cooldown, first.movement.launchedAtMs + policy.SHIELD_COOLDOWN_MS);
  assert.equal(policy.shieldCooldownExpiresAt(await profile(high), identity.resetGeneration), 0, "Incoming attack started a defender cooldown");
  await deny("activateInventoryItem", low, { itemId: "shield_12h" }, /Peace Shield unavailable/);
  assert.equal((await profile(low)).shopItems.shield_12h, 5, "Rejected activation consumed an item");
  const outcome = await resolve(low, first.movement);
  assert.equal(outcome.outcome, "victory");
  const capture = (await grants(high).get()).docs[0];
  assert(capture, "Qualifying capture created no retaliation");
  const a = { id: capture.id, ...capture.data() };
  assert.equal(a.cityId, targets[0].id);
  assert.equal(a.expiresAtMs - a.capturedAtMs, policy.RETALIATION_WINDOW_MS);
  assert.equal(a.expiresAtMs - a.capturedAtMs, 86_400_000);
  assert.equal((await cityRef(targets[0]).get()).data().retaliationAbandonLocks[low.uid], a.expiresAtMs);
  // A still-unused opportunity must remain usable 23 hours after capture.
  a.capturedAtMs -= 23 * 3_600_000;
  a.expiresAtMs -= 23 * 3_600_000;
  await capture.ref.update({ capturedAtMs: a.capturedAtMs, expiresAtMs: a.expiresAtMs });
  await cityRef(targets[0]).update({ [`retaliationAbandonLocks.${low.uid}`]: a.expiresAtMs });
  assert.equal(policy.shieldCooldownExpiresAt(await profile(high), identity.resetGeneration), 0, "Losing a city started a cooldown");
  const abandonRequest = { cityId: targets[0].id, regionId: region };
  await deny("relinquishCity", low, abandonRequest, /City Cannot Be Abandoned/);
  assert.equal((await clientRead(high, capture.ref.path)).status, 200);
  assert.equal((await clientRead(low, capture.ref.path)).status, 403, "Retaliation leaked to another player");
  assert.equal((await clientPatch(high, capture.ref.path, "status", "available")).status, 403);
  assert.equal((await clientPatch(low, profileRef(low).path, "peaceShieldCooldownExpiresAtMs", 0)).status, 403);

  const previewData = { fromId: hSource.id, toId: targets[0].id, sourceRegionId: region, targetRegionId: region, requestedTroops: 5000 };
  assert.equal((await call("previewArmyProtection", high, previewData)).attackProtection.mode, "raid");
  assert.equal((await call("previewArmyProtection", high, { ...previewData, retaliationId: a.id })).attackProtection.mode, "normal");
  await deny("sendArmyOrder", high, order(hSource, unrelated, 5000, { retaliationId: a.id }), /exact city/);
  await deny("sendArmyOrder", high, order(hSource, targets[0], 20_000_000, { retaliationId: a.id }), /Not enough troops/);
  assert.equal((await capture.ref.get()).data().status, "available");
  await cityRef(targets[0]).set({ ownerShieldExpiresAtMs: Date.now() + 60_000, fortificationState: null }, { merge: true });
  await deny("sendArmyOrder", high, order(hSource, targets[0], 5000, { retaliationId: a.id }), /Peace Shield/);
  await cityRef(targets[0]).set({ ownerShieldExpiresAtMs: 0, isMainCity: true }, { merge: true });
  const lowMain = await profile(low);
  await profileRef(low).update({ mainCityId: targets[0].id, mainRegionId: region, mainIslandId: islandId(region) });
  await deny("sendArmyOrder", high, order(hSource, targets[0], 5000, { retaliationId: a.id }), /Main cities/);
  await profileRef(low).update({ mainCityId: lowMain.mainCityId, mainRegionId: lowMain.mainRegionId, mainIslandId: lowMain.mainIslandId });
  await cityRef(targets[0]).set({ isMainCity: false }, { merge: true });
  assert.equal((await capture.ref.get()).data().status, "available", "Failed validation consumed retaliation");

  // A subsequent real conquest changes the owner without deleting the original grant.
  const thirdAttack = await call("sendArmyOrder", third, order(cSource, targets[0], 5000));
  assert.equal((await resolve(third, thirdAttack.movement)).outcome, "victory");
  assert.equal((await cityRef(targets[0]).get()).data().ownerUid, third.uid);
  assert.equal((await capture.ref.get()).data().status, "available");
  assert.equal(policy.abandonLockExpiresAt((await cityRef(targets[0]).get()).data(), third.uid, Date.now()), 0);
  assert.equal((await call("previewArmyProtection", high, { ...previewData, retaliationId: a.id })).attackProtection.mode, "normal");
  await deny("sendArmyOrder", high, order(hSource, cSource, 5000, { retaliationId: a.id }), /exact city/);

  const attempts = [order(hSource, targets[0], 8000, { retaliationId: a.id }), order(hSource, targets[0], 8000, { retaliationId: a.id })];
  const concurrent = await Promise.all(attempts.map(data => invoke("sendArmyOrder", high, data)));
  assert.equal(concurrent.filter(result => result.ok).length, 1, JSON.stringify(concurrent));
  const winner = concurrent.find(result => result.ok).result.movement;
  assert.equal(winner.attackProtection, null);
  assert.equal((await capture.ref.get()).data().usedArmyId, winner.id);
  const highCooldown = (await profile(high)).peaceShieldCooldownExpiresAtMs;
  assert.equal(highCooldown, winner.launchedAtMs + policy.SHIELD_COOLDOWN_MS);
  const duplicate = await call("sendArmyOrder", high, attempts.find(data => data.army.id === winner.id));
  assert(duplicate.duplicate, "Same request was not idempotent");
  assert.equal((await profile(high)).peaceShieldCooldownExpiresAtMs, highCooldown);
  await deny("sendArmyOrder", high, order(hSource, targets[0], 5000, { retaliationId: a.id }), /already been used/);
  const lockAfterUse = policy.abandonLockExpiresAt((await cityRef(targets[0]).get()).data(), low.uid, Date.now());
  assert.equal(lockAfterUse, a.expiresAtMs, "Using retaliation changed the capturer's original lock");
  assert.equal((await resolve(high, winner, 25 * 3_600_000)).outcome, "victory", "Retaliation expired in transit or depended on the original capturer remaining owner");

  // Multiple successful captures create independent records and reset only the attacker's cooldown.
  for (const target of targets.slice(1, 3)) {
    const attack = await call("sendArmyOrder", low, order(lSource, target, 1500));
    assert.equal((await profile(low)).peaceShieldCooldownExpiresAtMs, attack.movement.launchedAtMs + policy.SHIELD_COOLDOWN_MS);
    assert.equal((await resolve(low, attack.movement)).outcome, "victory");
  }
  const remaining = (await grants(high).get()).docs.filter(doc => doc.data().status === "available");
  assert.equal(remaining.length, 2);
  assert.notEqual(remaining[0].data().cityId, remaining[1].data().cityId);
  assert.notEqual(remaining[0].data().expiresAtMs, remaining[1].data().expiresAtMs);
  const expiring = remaining[0], expiringCity = targets.find(city => city.id === expiring.data().cityId);
  await expiring.ref.set({ expiresAtMs: Date.now() - 1000 }, { merge: true });
  await deny("sendArmyOrder", high, order(hSource, expiringCity, 5000, { retaliationId: expiring.id }), /Retaliation Expired/);
  await deny("relinquishCity", low, { cityId: expiringCity.id, regionId: region }, /City Cannot Be Abandoned/);
  await cityRef(expiringCity).update({ [`retaliationAbandonLocks.${low.uid}`]: Date.now() - 1000 });
  assert.equal((await call("relinquishCity", low, { cityId: expiringCity.id, regionId: region })).ok, true);
  assert.equal((await cityRef(expiringCity).get()).data().ownerKind, "neutral");

  // A transfer is not an offensive attack and cannot refresh the cooldown.
  const lowBeforeTransfer = (await profile(low)).peaceShieldCooldownExpiresAtMs;
  await call("sendArmyOrder", low, order(lSource, unrelated, 10, { kind: "transfer" }));
  assert.equal((await profile(low)).peaceShieldCooldownExpiresAtMs, lowBeforeTransfer);
  await profileRef(low).update({ peaceShieldCooldownExpiresAtMs: Date.now() - 1 });
  await call("activateInventoryItem", low, { itemId: "shield_12h" });
  assert((await profile(low)).itemEffects.shieldExpiresAtMs > Date.now());
  assert.equal((await profile(low)).shopItems.shield_12h, 4);
  await verifyWallShieldLifecycle(high, low, hSource, targets, remaining[1]);
  // Authoritative profile / record reads remain identical across separate client requests.
  const read1 = await (await clientRead(high, profileRef(high).path)).json();
  const read2 = await (await clientRead(high, profileRef(high).path)).json();
  assert.deepEqual(read1.fields.peaceShieldCooldownExpiresAtMs, read2.fields.peaceShieldCooldownExpiresAtMs);
  await verifySpentRetaliation(high, low, hSource, lSource, targets[3]);
  await objectiveDispatchCases([high, low, third], hSource, targets[3]);
  console.log("Combat authorization emulator passed: actual low/high conquests, dispatch cooldowns, defense isolation, exact-city previews, ownership changes, expiry, long travel, independent captures, atomic single-use, retries, failed launches, abandonment, transfers, shield activation and Firestore authority/privacy.");
}
async function verifySpentRetaliation(high, low, source, enemySource, seed) {
  for (const ending of ["defeat", "recall"]) {
    const target = await seedCity(seed, high, 1);
    const captureAttack = await call("sendArmyOrder", low, order(enemySource, target, 1500));
    assert.equal((await resolve(low, captureAttack.movement)).outcome, "victory");
    const grant = (await grants(high).get()).docs.find(doc => doc.data().sourceArmyId === captureAttack.movement.id);
    assert(grant, "The new qualifying loss must create its own opportunity");
    const launched = await call("sendArmyOrder", high, order(source, target, 1, { retaliationId: grant.id }));
    assert.equal((await grant.ref.get()).data().status, "used", "Retaliation must be consumed on Send");
    if (ending === "defeat") {
      assert.equal((await resolve(high, launched.movement)).outcome, "defeat");
    } else {
      await profileRef(high).set({ shopItems: { recall_horn: 1 } }, { merge: true });
      await db.doc(`armies/${launched.movement.id}`).update({ arrivesAtMs: Date.now() + 600_000 });
      const recalled = await call("useRecallHorn", high, { armyId: launched.movement.id });
      assert.equal(recalled.movement.returning, true);
    }
    assert.equal((await grant.ref.get()).data().usedArmyId, launched.movement.id);
    await deny("sendArmyOrder", high, order(source, target, 8000, { retaliationId: grant.id }), /already been used/);
  }
  console.log("Single-launch retaliation passed: defeat and recall never renew the spent opportunity.");
}
async function verifyWallShieldLifecycle(attacker, defender, source, targets, grant) {
  const target = targets.find(city => city.id === grant.data().cityId);
  const now = Date.now();
  const damaged = { version: 1, integrityBps: 5000, lastDamagedAtMs: now, repairAtMs: now + 900_000 };
  // Simulate a qualifying capture twenty minutes ago, with ten minutes still available.
  await grant.ref.update({ capturedAtMs: now - 1_200_000, expiresAtMs: now + 600_000 });
  await cityRef(target).update({ fortificationState: damaged, [`retaliationAbandonLocks.${defender.uid}`]: now + 600_000 });
  assert((await cityRef(target).get()).data().ownerShieldExpiresAtMs > now);
  await deny("relinquishCity", defender, { cityId: target.id, regionId: target.regionId }, /City Cannot Be Abandoned/);
  const pending = await call("sendArmyOrder", attacker, order(source, target, 1));
  // No profile update or second item activation: elapsed wall repair alone protects the city.
  await cityRef(target).update({ fortificationState: { ...damaged, lastDamagedAtMs: now - 900_000, repairAtMs: now - 1 } });
  await deny("sendArmyOrder", attacker, order(source, target, 8000, { retaliationId: grant.id }), /Peace Shield/);
  assert.equal((await grant.ref.get()).data().status, "available");
  const blocked = await resolve(attacker, pending.movement);
  assert(blocked.reports.some(report => /Peace Shield blocked/.test(report.summary)), "Repair before arrival did not block combat");
  assert.equal((await cityRef(target).get()).data().ownerUid, defender.uid);
  // The same active item does not protect this damaged target. Retaliation works after minute 15.
  await cityRef(target).update({ fortificationState: damaged });
  const revenge = await call("sendArmyOrder", attacker, order(source, target, 8000, { retaliationId: grant.id }));
  assert.equal(revenge.movement.attackProtection, null);
  assert.equal((await resolve(attacker, revenge.movement)).outcome, "victory");
  const captured = (await cityRef(target).get()).data();
  assert.equal(captured.ownerUid, attacker.uid);
  assert.equal(captured.ownerShieldExpiresAtMs, 0, "The previous owner's shield survived capture");
  assert((await profile(defender)).itemEffects.shieldExpiresAtMs > Date.now(), "Losing a damaged city removed the owner's active item");
  console.log("Wall shields passed: damaged-city dispatch and conquest, repair before arrival, full-wall denial, preserved failed grant, minute-20 retaliation and ownership isolation.");
}
async function verifySmoothProtectionRanges(attacker, defender, source, target) {
  const cases = [
    [100_000, 40_000, "normal"], [160_000, 40_000, "assault"], [250_000, 40_000, "raid"],
    [5_000_000, 2_000_000, "normal"], [5_000_000, 1_700_000, "assault"], [5_000_000, 1_000_000, "raid"],
    [50_000_000, 21_000_000, "normal"], [50_000_000, 18_000_000, "assault"], [50_000_000, 10_000_000, "raid"],
    [500_000_000, 260_000_000, "normal"], [500_000_000, 225_000_000, "assault"], [500_000_000, 175_000_000, "raid"],
  ];
  async function setTroops(city, troops) {
    await cityRef(city).update({ troops, troopFloat: troops, productionUpdatedAtMs: Date.now() + 3_600_000 });
  }
  for (const [attackingTroops, defendingTroops, mode] of cases) {
    await setTroops(source, attackingTroops);
    await setTroops(target, defendingTroops);
    await Promise.all([attacker, defender].map(actor => call("collectEconomy", actor)));
    const preview = await call("previewArmyProtection", attacker, {
      fromId: source.id, toId: target.id, sourceRegionId: source.regionId,
      targetRegionId: target.regionId, requestedTroops: 1,
    });
    assert.equal(preview.attackProtection.mode, mode, `Incorrect protection at ${attackingTroops}/${defendingTroops} troops`);
    const request = order(source, target, 1, { acceptedAttackProtection: preview.attackProtection });
    const launched = await call("sendArmyOrder", attacker, request);
    assert.equal(launched.movement.attackProtection?.mode || "normal", mode);
    const saved = (await db.doc(`armies/${launched.movement.id}`).get()).data();
    assert.equal(saved.attackProtection?.mode || "normal", mode);
    const replay = await call("sendArmyOrder", attacker, request);
    assert.equal(replay.movement.id, launched.movement.id);
    assert.equal(replay.movement.arrivesAtMs, launched.movement.arrivesAtMs);
    await resolve(attacker, launched.movement);
    assert.equal((await cityRef(target).get()).data().ownerUid, defender.uid, "One troop captured a defended city");
  }
  await setTroops(source, 10_000_000);
  await setTroops(target, 100_000);
  await profileRef(attacker).set({ peaceShieldCooldownExpiresAtMs: 0 }, { merge: true });
  await Promise.all([attacker, defender].map(actor => call("collectEconomy", actor)));
  console.log("Smooth protection passed: normal/assault/raid across early, 10M, 100M and billion-power kingdoms, authoritative previews, launches, persisted snapshots, retries and arrivals.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
