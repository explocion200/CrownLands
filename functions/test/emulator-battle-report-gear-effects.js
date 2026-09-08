const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const commonGear = require("../common-gear.js");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const normalizedHost = String(host || "127.0.0.1").trim();
  const formattedHost = normalizedHost.includes(":") && !normalizedHost.startsWith("[")
    ? `[${normalizedHost}]`
    : normalizedHost;
  return `${formattedHost}:${port}`;
}

async function resolveFunctionsHost() {
  if (configuredFunctionsHost) return configuredFunctionsHost;
  if (!functionsHostPromise) {
    functionsHostPromise = (async () => {
      const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "").trim();
      if (!hubHost) return "127.0.0.1:5001";
      const response = await fetch(`http://${hubHost}/emulators`);
      if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
      const functions = (await response.json())?.functions || {};
      const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
      const host = functions.host || listen?.address;
      const port = Number(functions.port || listen?.port);
      if (!host || !Number.isInteger(port) || port < 1) {
        throw new Error("Firebase Emulator Hub did not report a running Functions emulator.");
      }
      return formatEmulatorHost(host, port);
    })();
  }
  return functionsHostPromise;
}

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `battle-gear-${label}-${nonce}@example.test`,
      password: `Battle-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunction(name, token, data = {}) {
  const host = await resolveFunctionsHost();
  const response = await fetch(`http://${host}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

function createEquippedGear(selections = []) {
  const state = commonGear.createDefaultState();
  selections.forEach((selection, index) => {
    const definition = commonGear.DEFINITIONS.find(entry => (
      entry.buildingId === selection.buildingId && entry.slot === selection.slot
    ));
    assert(definition, `Missing ${selection.buildingId}/${selection.slot} gear definition.`);
    const instanceId = `battle_report_gear_${index}`;
    state.instances[instanceId] = {
      instanceId,
      gearKey: definition.gearKey,
      level: selection.level || 5,
      acquiredAtMs: Date.now() + index,
    };
    state.equipped[definition.buildingId][definition.slot] = instanceId;
  });
  return commonGear.normalizeState(state);
}

async function main() {
  const [attacker, defender] = await Promise.all([
    createAuthUser("attacker"),
    createAuthUser("defender"),
  ]);
  const attackerClaim = await callFunction("claimStartingCity", attacker.token, { playerName: "Gear Attacker" });
  await callFunction("claimStartingCity", defender.token, { playerName: "Gear Defender" });

  const islandId = attackerClaim.islandId;
  const regionId = attackerClaim.regionId || attackerClaim.mainRegionId || String(islandId).split("-").pop();
  const cities = db.collection(`islands/${islandId}/cities`);
  const sourceRef = cities.doc(attackerClaim.cityId);
  const source = (await sourceRef.get()).data() || {};
  const candidates = (await cities.get()).docs.filter(doc => doc.id !== attackerClaim.cityId);
  assert(candidates.length > 0, "The emulator world has no battle-report target city.");
  const targetRef = candidates[0].ref;
  const target = candidates[0].data() || {};
  const nowMs = Date.now();

  const attackerGear = createEquippedGear([
    { buildingId: "barracks", slot: "weapon" },
    { buildingId: "barracks", slot: "necklace" },
  ]);
  const defenderGear = createEquippedGear([
    { buildingId: "gatehouse", slot: "weapon" },
    { buildingId: "gatehouse", slot: "head" },
    { buildingId: "barracks", slot: "necklace" },
  ]);

  await Promise.all([
    db.doc(`players/${attacker.uid}`).set({
      gear: attackerGear,
      upgrades: { swordmastery: 10, fieldMedics: 10 },
      kingPower: 100_000,
      itemEffects: { shieldExpiresAtMs: 0 },
      economyUpdatedAtMs: nowMs,
    }, { merge: true }),
    db.doc(`players/${defender.uid}`).set({
      gear: defenderGear,
      upgrades: { shieldwallDiscipline: 10, stoneworks: 10, fieldMedics: 10 },
      kingPower: 100_000,
      itemEffects: { shieldExpiresAtMs: 0 },
      economyUpdatedAtMs: nowMs,
    }, { merge: true }),
    sourceRef.set({
      ...source,
      owner: "player",
      ownerKind: "player",
      ownerUid: attacker.uid,
      ownerName: "Gear Attacker",
      ownerShieldExpiresAtMs: 0,
      troops: 5_000,
      troopFloat: 5_000,
      productionUpdatedAtMs: nowMs,
      regionId,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
    }, { merge: true }),
    targetRef.set({
      ...target,
      owner: "player",
      ownerKind: "player",
      ownerUid: defender.uid,
      ownerName: "Gear Defender",
      ownerShieldExpiresAtMs: 0,
      isMainCity: false,
      level: 1,
      troops: 2_500,
      troopFloat: 2_500,
      alliedReinforcementTroops: 0,
      productionUpdatedAtMs: nowMs,
      regionId,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
    }, { merge: true }),
  ]);

  const armyId = `battle_gear_${crypto.randomBytes(6).toString("hex")}`;
  const launch = await callFunction("sendArmyOrder", attacker.token, {
    sourceRegionId: regionId,
    targetRegionId: regionId,
    routeRegionIds: [regionId],
    army: {
      id: armyId,
      kind: "attack",
      targetType: "city",
      fromId: attackerClaim.cityId,
      toId: targetRef.id,
      fromName: source.name || "Attacker city",
      toName: target.name || "Defender city",
      troops: 4_000,
      requestedTroops: 4_000,
      sourceRegionId: regionId,
      targetRegionId: regionId,
      routeRegionIds: [regionId],
    },
  });
  assert(launch.movement?.id === armyId, "The battle-report test attack did not launch.");
  const notificationOutbox = await db.doc(`serverNotificationOutbox/incoming_${armyId}_${defender.uid}`).get();
  assert(notificationOutbox.exists, "The attack did not atomically queue its defender notification.");
  assert(notificationOutbox.data()?.notification?.defenderUid === defender.uid, "The queued alert targets the wrong defender.");
  assert(notificationOutbox.data()?.notification?.url === "/play/", "The queued alert does not open the playable game route.");

  await db.doc(`armies/${armyId}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
  const resolution = await callFunction("resolveArmyOrder", attacker.token, {
    armyId,
    regionIds: [regionId],
  });
  assert(resolution.status === "resolved", "The battle-report test attack did not resolve.");

  const snapshotDoc = await db.doc(`battleSnapshots/${realm.resetGeneration}/entries/${armyId}`).get();
  assert(snapshotDoc.exists, "The authoritative battle snapshot was not written.");
  const snapshot = snapshotDoc.data() || {};
  assert(snapshot.modelVersion === 7, "The explicit gear-effects snapshot version was not stored.");
  assert(snapshot.gearEffects?.attacker?.attackStrength?.bonusPower > 0, "Attacker gear power was not snapshotted.");
  assert(snapshot.gearEffects?.defender?.defenderStrength?.bonusPower > 0, "Defender gear power was not snapshotted.");
  assert(snapshot.gearEffects?.defender?.wallStrength?.bonusPower > 0, "Wall gear power was not snapshotted separately.");
  assert(
    snapshot.gearEffects.attacker.attackStrength.bonusPower
      === snapshot.totals?.attackPowerBreakdown?.gearAttackStrengthBonusPower,
    "Attacker gear fields disagree with the authoritative attack calculation."
  );
  assert(
    snapshot.gearEffects.defender.defenderStrength.bonusPower
      === snapshot.totals?.defensePowerBreakdown?.gearDefenderStrengthBonusPower,
    "Defender gear fields disagree with the authoritative defense calculation."
  );
  assert(
    snapshot.gearEffects.defender.wallStrength.bonusPower
      === snapshot.totals?.defensePowerBreakdown?.gearWallStrengthBonusPower,
    "Wall gear fields disagree with the authoritative wall calculation."
  );
  assert(
    snapshot.totals?.defensePowerBreakdown?.stoneworksWallBonusPower >= 0,
    "Stoneworks was not retained as a separate wall source."
  );

  const [attackerProfile, defenderProfile] = await Promise.all([
    db.doc(`players/${attacker.uid}`).get(),
    db.doc(`players/${defender.uid}`).get(),
  ]);
  const attackerReport = (attackerProfile.data()?.battleReports || []).find(report => report.battleId === armyId);
  const defenderReport = (defenderProfile.data()?.battleReports || []).find(report => report.battleId === armyId);
  assert(attackerReport, "The attacker battle report is missing.");
  assert(defenderReport, "The defender battle report is missing.");
  assert(attackerReport.gearEffects?.attacker?.attackStrength?.bonusPower > 0, "The attack report fallback omitted attacker gear.");
  assert(attackerReport.gearEffects?.defender?.defenderStrength?.bonusPower > 0, "The attack report fallback omitted defender gear.");
  assert(defenderReport.gearEffects?.attacker?.attackStrength?.bonusPower > 0, "The defense report fallback omitted attacker gear.");
  assert(defenderReport.gearEffects?.defender?.wallStrength?.bonusPower > 0, "The defense report fallback omitted wall gear.");
  assert(attackerReport.casualtyRecovery?.fieldMedicsPercent === 20, "Attacker Field Medics was not snapshotted separately.");
  assert(attackerReport.casualtyRecovery?.gearPercent === 1.5, "Attacker casualty gear was not snapshotted separately.");
  assert(defenderReport.casualtyRecovery?.fieldMedicsPercent === 20, "Defender Field Medics was not snapshotted separately.");
  assert(defenderReport.casualtyRecovery?.gearPercent === 1.5, "Defender casualty gear was not snapshotted separately.");

  // Exercise persisted wall-only combat against both the owner and an allied garrison.
  const ally = await createAuthUser("wall-ally");
  const allyClaim = await callFunction("claimStartingCity", ally.token, { playerName: "Wall Ally" });
  const wallTargetDoc = (await cities.get()).docs.find(doc => (
    doc.id !== sourceRef.id && doc.id !== targetRef.id && !doc.data()?.ownerUid
  ));
  assert(wallTargetDoc, "The wall-only test requires a spare regular city.");
  const clanId = `wall_defenders_${crypto.randomBytes(5).toString("hex")}`;
  const current = { worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: "legacy" };
  const targetKey = `city:${regionId}:${wallTargetDoc.id}`;
  const reinforcementId = `reinforce_${crypto.createHash("sha256").update(`${realm.resetGeneration}|${ally.uid}|${targetKey}`).digest("hex").slice(0, 40)}`;
  const contributionRef = db.doc(`reinforcements/${reinforcementId}`);
  const wallNowMs = Date.now();
  const batch = db.batch();
  batch.set(db.doc(`clans/${clanId}`), { ...current, status: "active", leaderUid: defender.uid, memberCount: 2, name: "Wall Defenders", tag: "WALL" });
  for (const [user, role] of [[defender, "leader"], [ally, "member"]]) {
    batch.set(db.doc(`clans/${clanId}/members/${user.uid}`), { ...current, uid: user.uid, clanId, role, status: "active" });
    batch.set(db.doc(`players/${user.uid}`), { clanId, clanRole: role, clanName: "Wall Defenders", clanTag: "WALL" }, { merge: true });
  }
  batch.set(sourceRef, { troops: 50_000, troopFloat: 50_000, productionUpdatedAtMs: wallNowMs }, { merge: true });
  batch.set(wallTargetDoc.ref, {
    ...wallTargetDoc.data(), ...current,
    owner: "player", ownerKind: "player", ownerUid: defender.uid, ownerClanId: clanId,
    ownerName: "Gear Defender", ownerShieldExpiresAtMs: 0, isMainCity: false,
    kind: "city", level: 25, regionId, troops: 100_000, troopFloat: 100_000,
    alliedReinforcementTroops: 10_000, productionUpdatedAtMs: wallNowMs,
    fortificationState: { version: 1, integrityBps: 10_000, repairAtMs: 0 },
  });
  batch.set(contributionRef, {
    ...current, ownerUid: ally.uid, ownerName: "Wall Ally", targetOwnerUid: defender.uid,
    clanId, targetKey, targetType: "city", targetId: wallTargetDoc.id, targetRegionId: regionId,
    sourceCityId: allyClaim.cityId, sourceRegionId: allyClaim.regionId || allyClaim.mainRegionId,
    reinforcementSourceId: allyClaim.cityId,
    reinforcementSourceRegionId: allyClaim.regionId || allyClaim.mainRegionId,
    reinforcementRecipientUid: defender.uid,
    troops: 10_000, status: "stationed",
  });
  batch.set(db.doc(`players/${ally.uid}`), { stationedReinforcementTroops: 10_000 }, { merge: true });
  await batch.commit();
  await callFunction("collectEconomy", defender.token);
  await callFunction("collectEconomy", attacker.token);
  const wallArmyId = `wall_only_${crypto.randomBytes(6).toString("hex")}`;
  await callFunction("sendArmyOrder", attacker.token, {
    sourceRegionId: regionId, targetRegionId: regionId,
    army: { id: wallArmyId, kind: "attack", targetType: "city", fromId: sourceRef.id,
      toId: wallTargetDoc.id, troops: 10_000, requestedTroops: 10_000,
      sourceRegionId: regionId, targetRegionId: regionId },
  });
  await db.doc(`armies/${wallArmyId}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
  const wallResolution = await callFunction("resolveArmyOrder", attacker.token, { armyId: wallArmyId, regionIds: [regionId] });
  assert(wallResolution.status === "resolved", "The wall-only attack did not resolve.");
  const wallSnapshot = (await db.doc(`battleSnapshots/${realm.resetGeneration}/entries/${wallArmyId}`).get()).data() || {};
  assert(wallSnapshot.totals?.defenderLosses === 0, "The wall-only battle snapshot reported defender deaths.");
  assert(wallSnapshot.totals?.defenderSurvivors === wallSnapshot.totals?.defenders, "The wall-only battle snapshot lost defending troops.");
  const [wallCityAfter, contributionAfter, wallDefenderAfter] = await Promise.all([
    wallTargetDoc.ref.get(), contributionRef.get(), db.doc(`players/${defender.uid}`).get(),
  ]);
  assert(wallCityAfter.data()?.ownerUid === defender.uid, "A wall-only attack captured the city.");
  assert(wallCityAfter.data()?.fortificationState?.integrityBps < 10_000, `The test attack must cause meaningful wall damage: ${JSON.stringify({ siege: wallSnapshot.siege, protection: wallSnapshot.attackProtection })}`);
  assert(wallCityAfter.data()?.fortificationState?.integrityBps > 0, "The test attack must leave the wall standing.");
  assert(wallCityAfter.data()?.troops >= 100_000, "The wall-only attack harmed the owner's soldiers.");
  assert(wallCityAfter.data()?.alliedReinforcementTroops === 10_000, "The wall-only attack reduced the allied garrison.");
  assert(contributionAfter.data()?.troops === 10_000 && contributionAfter.data()?.status === "stationed", "The wall-only attack harmed or removed the reinforcement contribution.");
  const wallReport = (wallDefenderAfter.data()?.battleReports || []).find(report => report.battleId === wallArmyId);
  assert(wallReport?.defenderLosses === 0, "The defender's wall-only report showed troop casualties.");

  async function launchAuditAttack(label, targetId, troops, actor = attacker, originRef = sourceRef) {
    const id = `${label}_${crypto.randomBytes(6).toString("hex")}`;
    await callFunction("sendArmyOrder", actor.token, {
      sourceRegionId: regionId, targetRegionId: regionId,
      army: { id, kind: "attack", targetType: "city", fromId: originRef.id, toId: targetId,
        troops, requestedTroops: troops, sourceRegionId: regionId, targetRegionId: regionId },
    });
    await db.doc(`armies/${id}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
    return id;
  }
  const resolveAuditAttack = (id, actor = attacker) => callFunction("resolveArmyOrder", actor.token, { armyId: id, regionIds: [regionId] });
  const readBattle = async id => (await db.doc(`battleSnapshots/${realm.resetGeneration}/entries/${id}`).get()).data();
  async function verifyAlliedRecovery(battleId, losses) {
    const receiptQuery = db.collection(`reinforcementBattleReceipts/${realm.resetGeneration}/entries`)
      .where("armyId", "==", battleId).where("contributorUid", "==", ally.uid);
    let receipts;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      receipts = await receiptQuery.get();
      if (receipts.docs.some(doc => doc.data()?.status === "settled")) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(receipts.size === 1 && receipts.docs[0].data()?.status === "settled", "The allied casualty receipt did not settle exactly once.");
    const allyAfter = (await db.doc(`players/${ally.uid}`).get()).data();
    const reports = allyAfter.battleReports?.filter(report => report.battleId === battleId) || [];
    assert(reports.length === 1 && reports[0].fieldMedicsRecovered === Math.floor(losses * 0.2),
      "Allied Field Medics recovery disagrees with actual losses or duplicated its report.");
  }

  // Distinct arrivals and a duplicate resolver contend on the same damaged wall.
  const wallHitA = await launchAuditAttack("concurrent_wall_a", wallTargetDoc.id, 10_000);
  const wallHitB = await launchAuditAttack("concurrent_wall_b", wallTargetDoc.id, 10_000);
  await Promise.all([resolveAuditAttack(wallHitA), resolveAuditAttack(wallHitB), resolveAuditAttack(wallHitA)]);
  const wallHits = await Promise.all([readBattle(wallHitA), readBattle(wallHitB)]);
  assert(wallHits.every(entry => entry?.totals?.defenderLosses === 0), "Concurrent wall-only hits killed defenders.");
  wallHits.sort((a, b) => b.siege.startingWallPower - a.siege.startingWallPower);
  assert(wallHits[1].siege.startingWallPower < wallHits[0].siege.startingWallPower - wallHits[0].siege.wallDamagePower / 2,
    "The second concurrent hit did not see the first hit's wall damage.");
  const wallAfterConcurrent = (await wallTargetDoc.ref.get()).data();
  assert(wallAfterConcurrent.alliedReinforcementTroops === 10_000, "Concurrent wall hits changed the allied troop total.");
  assert((await contributionRef.get()).data()?.troops === 10_000, "Concurrent wall hits changed attributed troops.");

  // A definite garrison hit verifies recovery even when recall wins the later race.
  await wallTargetDoc.ref.set({ level: 1, fortificationState: { version: 1, integrityBps: 10_000, repairAtMs: 0 } }, { merge: true });
  await db.doc(`players/${ally.uid}`).set({ upgrades: { fieldMedics: 10 } }, { merge: true });
  const garrisonHitId = await launchAuditAttack("allied_casualties", wallTargetDoc.id, 2_500);
  await Promise.all([resolveAuditAttack(garrisonHitId), resolveAuditAttack(garrisonHitId)]);
  const garrisonHit = await readBattle(garrisonHitId);
  const damagedAlly = garrisonHit.reinforcements?.find(entry => entry.ownerUid === ally.uid);
  assert(damagedAlly?.losses > 0 && damagedAlly.survivors + damagedAlly.losses === 10_000,
    "The post-breach attack did not conserve allied survivors and casualties.");
  await verifyAlliedRecovery(garrisonHitId, damagedAlly.losses);
  const allyMainRef = db.doc(`islands/${allyClaim.islandId}/cities/${allyClaim.cityId}`);
  await allyMainRef.set({ productionUpdatedAtMs: Date.now() + 60_000 }, { merge: true });
  const recoveryBeforeReplay = (await allyMainRef.get()).data()?.troops;
  await Promise.all([resolveAuditAttack(garrisonHitId), resolveAuditAttack(garrisonHitId)]);
  assert((await allyMainRef.get()).data()?.troops === recoveryBeforeReplay, "Replaying the battle credited Field Medics twice.");

  // Either recall or combat may win the transaction; both orders must conserve the contribution.
  const troopsBeforeRecall = (await contributionRef.get()).data()?.troops;
  assert(troopsBeforeRecall === damagedAlly.survivors, "The stationed contribution disagrees with post-breach survivors.");
  const recallRaceId = await launchAuditAttack("recall_combat", wallTargetDoc.id, 5_000);
  await Promise.all([
    resolveAuditAttack(recallRaceId),
    callFunction("returnClanReinforcement", ally.token, { reinforcementId }),
  ]);
  const recallBattle = await readBattle(recallRaceId);
  const recalledContribution = (await contributionRef.get()).data();
  const returningArmy = (await db.doc(`armies/${recalledContribution.returnArmyId}`).get()).data();
  const allyDefense = recallBattle.reinforcements?.find(entry => entry.ownerUid === ally.uid);
  const allyLosses = Number(allyDefense?.losses || 0);
  assert(Number(returningArmy?.troops || 0) + allyLosses === troopsBeforeRecall, "Recall racing with combat lost or duplicated allied troops.");
  assert(recalledContribution.status === "returning" && recalledContribution.troops === 0, "Recalled troops remained stationed.");
  assert((await wallTargetDoc.ref.get()).data()?.alliedReinforcementTroops === 0, "Recall left phantom troops in the garrison.");
  const repeatedRecall = await callFunction("returnClanReinforcement", ally.token, { reinforcementId });
  assert(repeatedRecall.duplicate === true, "A repeated recall created another return.");
  await resolveAuditAttack(recallRaceId);
  assert(JSON.stringify(await readBattle(recallRaceId)) === JSON.stringify(recallBattle), "Replaying combat rewrote its snapshot.");
  if (allyDefense) await verifyAlliedRecovery(recallRaceId, allyLosses);

  // The first capture changes ownership; the other already-launched attack must transfer safely.
  const captureDoc = (await cities.get()).docs.find(doc => !doc.data()?.ownerUid && doc.id !== wallTargetDoc.id);
  assert(captureDoc, "The concurrent capture test requires a spare city.");
  await captureDoc.ref.set({ ...captureDoc.data(), ...current, regionId,
    owner: "player", ownerKind: "player", ownerUid: defender.uid, ownerName: "Gear Defender",
    ownerShieldExpiresAtMs: 0, isMainCity: false, kind: "city", level: 1,
    troops: 500, troopFloat: 500, alliedReinforcementTroops: 0, productionUpdatedAtMs: Date.now(),
  });
  await callFunction("collectEconomy", defender.token);
  await callFunction("collectEconomy", attacker.token);
  const captureA = await launchAuditAttack("concurrent_capture_a", captureDoc.id, 4_000);
  const captureB = await launchAuditAttack("concurrent_capture_b", captureDoc.id, 4_000);
  await Promise.all([resolveAuditAttack(captureA), resolveAuditAttack(captureB)]);
  const captureSnapshots = (await Promise.all([readBattle(captureA), readBattle(captureB)])).filter(Boolean);
  assert(captureSnapshots.length === 1 && captureSnapshots[0].outcome === "victory", "Concurrent arrivals fought or captured the same defender twice.");
  const capturedCity = (await captureDoc.ref.get()).data();
  assert(capturedCity.ownerUid === attacker.uid, "Concurrent capture assigned the wrong owner.");
  assert(capturedCity.troops >= captureSnapshots[0].attacker.survivors + 4_000, "The second arrival lost troops after ownership changed.");
  await captureDoc.ref.set({ productionUpdatedAtMs: Date.now() + 60_000 }, { merge: true });
  const beforeReplay = (await captureDoc.ref.get()).data()?.troops;
  await Promise.all([resolveAuditAttack(captureA), resolveAuditAttack(captureB)]);
  assert((await captureDoc.ref.get()).data()?.troops === beforeReplay, "Replaying concurrent arrivals duplicated captured garrison troops.");

  // Different rulers must fight the owner and survivors committed by the preceding battle.
  const rival = await createAuthUser("competing-attacker");
  await callFunction("claimStartingCity", rival.token, { playerName: "Competing Attacker" });
  const rivalSource = (await cities.get()).docs.find(doc => !doc.data()?.ownerUid);
  assert(rivalSource, "The competing attacker requires a source city.");
  await rivalSource.ref.set({ ...rivalSource.data(), ...current, regionId,
    owner: "player", ownerKind: "player", ownerUid: rival.uid, ownerName: "Competing Attacker",
    ownerShieldExpiresAtMs: 0, isMainCity: false, kind: "city", level: 1,
    troops: 10_000, troopFloat: 10_000, productionUpdatedAtMs: Date.now(),
  });
  await db.doc(`players/${rival.uid}`).set({ itemEffects: { shieldExpiresAtMs: 0 } }, { merge: true });
  await captureDoc.ref.set({ ownerUid: defender.uid, ownerName: "Gear Defender", troops: 500, troopFloat: 500,
    productionUpdatedAtMs: Date.now(), ownerShieldExpiresAtMs: 0, isMainCity: false }, { merge: true });
  await callFunction("collectEconomy", defender.token);
  await callFunction("collectEconomy", attacker.token);
  await callFunction("collectEconomy", rival.token);
  const competingA = await launchAuditAttack("competing_a", captureDoc.id, 4_000);
  const competingB = await launchAuditAttack("competing_b", captureDoc.id, 4_000, rival, rivalSource.ref);
  await Promise.all([resolveAuditAttack(competingA), resolveAuditAttack(competingB, rival)]);
  const competingBattles = await Promise.all([readBattle(competingA), readBattle(competingB)]);
  assert(competingBattles.every(Boolean), "An independently hostile arrival failed to produce a battle.");
  const firstCapture = competingBattles.find(entry => entry.defender.ownerUid === defender.uid);
  const nextBattle = competingBattles.find(entry => entry !== firstCapture);
  assert(firstCapture?.outcome === "victory", "The first competing army did not capture the weak target.");
  assert(nextBattle.defender.ownerUid === firstCapture.attacker.ownerUid, "The next battle used stale ownership.");
  assert(nextBattle.defender.startingTroops >= firstCapture.attacker.survivors
    && nextBattle.defender.startingTroops <= firstCapture.attacker.survivors + 10,
  "The next battle used stale garrison troops instead of the preceding survivors.");
  const finalOwner = nextBattle.outcome === "victory" ? nextBattle.attacker.ownerUid : nextBattle.defender.ownerUid;
  assert((await captureDoc.ref.get()).data()?.ownerUid === finalOwner, "The final owner disagrees with the last serialized battle.");

  console.log("Emulator battle report gear effects passed: authoritative gear and wall-only settlement, concurrent wall hits, recall/combat conservation, Field Medics, and idempotent concurrent captures.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
