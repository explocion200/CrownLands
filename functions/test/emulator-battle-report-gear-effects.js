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

  console.log("Emulator battle report gear effects passed: attack, defender, wall, and casualty sources match authoritative settlement.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
