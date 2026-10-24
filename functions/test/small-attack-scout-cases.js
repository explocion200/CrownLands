"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Only fictional fixtures supplied by the emulator or disposable PostgreSQL harness.
module.exports = async ({ db, call, attacker, defender, source, target, cityRef }) => {
  const attackerRef = db.doc(`players/${attacker.uid}`), defenderRef = db.doc(`players/${defender.uid}`);
  const sourceRef = cityRef(source), targetRef = cityRef(target);
  const read = async ref => (await ref.get()).data();
  const armyRef = id => db.doc(`armies/${id}`);
  const resolve = (user, movement) => call("resolveArmyOrder", user, { armyId: movement.id, routeRegionIds: movement.routeRegionIds });
  const due = movement => armyRef(movement.id).update({ arrivesAtMs: Date.now() - 1 });
  const profileReset = { clanId: "", itemEffects: { shieldExpiresAtMs: 0, veilOfSilenceExpiresAtMs: 0 } };
  async function launch(troops, level = 61, retaliationId = "") {
    await attackerRef.set(profileReset, { merge: true });
    await defenderRef.set(profileReset, { merge: true });
    await sourceRef.set({ owner: "player", ownerKind: "player", ownerUid: attacker.uid,
      troops: 500_000, troopFloat: 500_000, productionUpdatedAtMs: Date.now() + 3_600_000 }, { merge: true });
    await targetRef.set({ owner: "player", ownerKind: "player", ownerUid: defender.uid, ownerName: "Scout Test Defender",
      isMainCity: false, level, troops: 500_000, troopFloat: 500_000, ownerShieldExpiresAtMs: 0,
      fortificationState: null, productionUpdatedAtMs: Date.now() + 3_600_000 }, { merge: true });
    const id = `small_attack_${randomUUID()}`;
    const payload = { armyId: id, sourceRegionId: source.regionId, targetRegionId: target.regionId,
      army: { id, kind: "attack", targetType: "city", fromId: source.id, toId: target.id,
        troops, requestedTroops: troops, retaliationId, sourceRegionId: source.regionId, targetRegionId: target.regionId } };
    const movement = (await call("sendArmyOrder", attacker, payload)).movement;
    assert.equal(movement.kind, "attack", "Do not convert at launch");
    assert.equal(movement.troops, troops, "Fixture must exercise the exact requested troop threshold");
    const replay = await call("sendArmyOrder", attacker, payload);
    assert.equal(replay.movement.arrivesAtMs, movement.arrivesAtMs);
    assert.deepEqual(replay.movement.pathSegments, movement.pathSegments);
    await assert.rejects(resolve(attacker, movement), /not arrived/);
    return movement;
  }
  async function returned(movement, count) {
    assert.equal(movement.kind, "transfer");
    assert.equal(movement.troops, count);
    assert.equal(movement.returnReason, "small_attack_scout");
    assert.equal(movement.returning, true);
    const before = await read(sourceRef);
    await due(movement);
    await Promise.all([resolve(attacker, movement), resolve(attacker, movement)]);
    assert.equal((await read(sourceRef)).troops, before.troops + count, "Safe return must credit troops exactly once");
  }
  for (const [troops, level, arrivalLevel] of [[1, 61, 61], [49, 61, 61], [49, 100, 100], [49, 60, 61]]) {
    const movement = await launch(troops, level);
    if (arrivalLevel !== level) await targetRef.update({ level: arrivalLevel });
    const before = await read(targetRef), attackerBefore = await read(attackerRef), defenderBefore = await read(defenderRef);
    await due(movement);
    const results = await Promise.all([resolve(attacker, movement), resolve(attacker, movement)]);
    const result = results.find(r => r.scoutReport);
    assert(result, "Small attack must resolve as scouting");
    assert.equal(result.kind, "scout");
    assert.equal(result.scoutReport.troops, 500_000);
    assert.equal(result.scoutReport.expiresAtMs - result.scoutReport.scoutedAtMs, 600_000);
    assert(result.reports.every(report => report.type === "scout" && !report.battleId));
    const saved = await read(armyRef(movement.id));
    assert.equal(saved.kind, "attack", "Preserve the accepted launch identity");
    assert.equal(saved.result.convertedFromAttack, true);
    assert.equal(saved.result.scoutTroopsUsed, 1);
    assert.deepEqual(saved.pathSegments, movement.pathSegments);
    const after = await read(targetRef);
    for (const key of ["ownerUid", "troops", "fortificationState"]) assert.deepEqual(after[key], before[key], `Scout changed ${key}`);
    assert.deepEqual((await read(attackerRef)).character, attackerBefore.character, "Scout must not award attack XP");
    assert.deepEqual((await read(defenderRef)).character, defenderBefore.character, "Scout must not award defense XP");
    const reports = (await db.collection(`players/${attacker.uid}/serverReports`).get()).docs.map(d => d.data());
    const current = reports.filter(r => r.cityId === target.id && r.scoutReport);
    assert.equal(current.length, 1, "Replace the prior target snapshot, not the original expiry on retry");
    assert.equal(current[0].scoutReport.expiresAtMs, result.scoutReport.expiresAtMs);
    const publicReport = await read(db.doc(`${targetRef.path.split("/cities/")[0]}/reports/${current[0].id}`));
    assert.equal(publicReport.scoutReport, null);
    assert.equal(publicReport.troopCount, 0);
    const notices = (await db.collection(`players/${defender.uid}/serverReports`).get()).docs.map(d => d.data());
    assert(notices.some(r => r.scoutPerspective === "defender" && r.scoutDisclosure?.troops === 500_000));
    const otherView = await resolve(defender, movement);
    assert(!otherView.scoutReport, "Replay by defender must not expose the attacker's private snapshot");
    if (troops > 1) {
      assert.equal(result.movement.id, saved.result.returnArmyId);
      assert.deepEqual(result.movement.pathSegments, movement.pathSegments);
      await returned(result.movement, troops - 1);
    } else assert(!result.movement);
    assert.equal((await read(sourceRef)).troops, 499_999, "Successful scouting consumes only one soldier");
  }
  for (const [troops, level, arrivalLevel] of [[50, 61, 61], [49, 60, 60], [49, 61, 60]]) {
    const movement = await launch(troops, level);
    await targetRef.update({ level: arrivalLevel }); await due(movement);
    const result = await resolve(attacker, movement);
    assert.equal(result.kind, "attack", "Boundary outside the exception must remain combat");
    assert(!result.scoutReport);
    assert(!((await read(armyRef(movement.id))).result.convertedFromAttack));
  }
  const veiled = await launch(49);
  await defenderRef.set({ itemEffects: { veilOfSilenceExpiresAtMs: Date.now() + 60_000 } }, { merge: true });
  const intelBefore = (await read(attackerRef)).scoutReports;
  await due(veiled); const blocked = await resolve(attacker, veiled);
  assert.equal(blocked.kind, "scout"); assert(!blocked.scoutReport);
  assert.equal((await read(armyRef(veiled.id))).result.blocked, "veil_of_silence");
  assert.deepEqual((await read(attackerRef)).scoutReports, intelBefore, "Blocked conversion must not replace or extend old intelligence");
  await returned(blocked.movement, 49);
  assert.equal((await read(sourceRef)).troops, 500_000);

  const shielded = await launch(49);
  await defenderRef.set({ itemEffects: { shieldExpiresAtMs: Date.now() + 60_000 } }, { merge: true });
  await due(shielded); const shield = await resolve(attacker, shielded);
  assert(!shield.scoutReport);
  assert.equal((await read(armyRef(shielded.id))).result.blocked, "shield");

  const own = await launch(49);
  await targetRef.update({ ownerUid: attacker.uid }); await due(own);
  assert.equal((await resolve(attacker, own)).kind, "transfer");

  const main = await launch(49), defenderMain = await read(defenderRef);
  await defenderRef.update({ mainCityId: target.id, mainRegionId: target.regionId, mainIslandId: targetRef.path.split("/")[1] });
  await targetRef.update({ isMainCity: true }); await due(main);
  assert(!((await resolve(attacker, main)).scoutReport));
  assert.equal((await read(armyRef(main.id))).result.blocked, "main_city");
  await defenderRef.update({ mainCityId: defenderMain.mainCityId, mainRegionId: defenderMain.mainRegionId, mainIslandId: defenderMain.mainIslandId });
  await db.doc(`islands/${defenderMain.mainIslandId}/cities/${defenderMain.mainCityId}`).update({ isMainCity: true });

  const neutral = await launch(49);
  await targetRef.update({ owner: "neutral", ownerKind: "neutral", ownerUid: "" }); await due(neutral);
  assert.equal((await resolve(attacker, neutral)).kind, "attack", "Neutral cities remain combat");

  const recalled = await launch(49);
  await armyRef(recalled.id).update({ returning: true, recalledAtMs: Date.now() }); await due(recalled);
  assert.equal((await resolve(attacker, recalled)).kind, "return", "Recalled attacks never generate intelligence");

  const realm = await call("getRealmInfo", attacker), nowMs = Date.now();
  const grant = db.doc(`players/${attacker.uid}/retaliationWindows/scout_conversion`);
  const expiresAtMs = nowMs + 86_400_000;
  await grant.set({ id: grant.id, worldId: realm.worldId, resetGeneration: realm.resetGeneration,
    realmShardId: realm.sharedRealmId, originalOwnerUid: attacker.uid, capturerUid: defender.uid,
    cityId: target.id, regionId: target.regionId, cityPath: targetRef.path, cityName: target.name || target.id,
    capturedAtMs: nowMs, expiresAtMs, status: "available", usedAtMs: 0, usedArmyId: "" });
  const retaliation = await launch(49, 61, grant.id);
  assert.equal((await read(grant)).reservedArmyId, retaliation.id);
  await due(retaliation);
  const reconnaissance = await resolve(attacker, retaliation);
  assert.equal(reconnaissance.kind, "scout");
  const released = await read(grant);
  assert.equal(released.status, "available"); assert(!released.reservedArmyId);
  assert.equal(released.expiresAtMs, expiresAtMs); assert(!released.usedAtMs);
  assert(!reconnaissance.movement.retaliationAuthorization);
  await returned(reconnaissance.movement, 48);

  const allied = await launch(49), clanId = `scout_test_${randomUUID()}`;
  await db.doc(`clans/${clanId}`).set({ status: "active", leaderUid: attacker.uid });
  await attackerRef.update({ clanId }); await defenderRef.update({ clanId }); await due(allied);
  const friendly = await resolve(attacker, allied);
  assert.equal(friendly.outcome, "allied_return_started"); assert(!friendly.scoutReport);
  await attackerRef.update({ clanId: "" }); await defenderRef.update({ clanId: "" });
  console.log("Small-attack scout cases passed: 1/49/50, levels 60/61/100, arrival upgrades/downgrades, private ten-minute reports, unchanged defenses/XP, duplicates, safe returns, Veil, shield, main city, ownership/clan changes and unspent retaliation.");
};
