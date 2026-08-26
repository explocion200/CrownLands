"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

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

async function createAuthUser() {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `inactive-level-reset-${nonce}@example.test`,
      password: `Inactive-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunction(name, token, data = {}) {
  const functionsHost = await resolveFunctionsHost();
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
        clientRealmShardId: "legacy",
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

async function runInactiveMaintenance() {
  const functionsHost = await resolveFunctionsHost();
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/maintainInactivePlayers-0`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudscheduler-jobname": "emulator-inactive-city-level-reset",
      "x-cloudscheduler-scheduletime": new Date().toISOString(),
    },
    body: "{}",
  });
  assert(response.ok, `Inactive maintenance returned HTTP ${response.status}: ${await response.text()}`);
}

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Inactive Level Sentinel" });
  const citiesRef = db.collection(`islands/${claim.islandId}/cities`);
  const citySnapshot = await citiesRef.get();
  const targetDoc = citySnapshot.docs.find(doc => {
    const city = doc.data() || {};
    return doc.id !== claim.cityId && city.ownerKind === "neutral" && !city.ownerUid && !city.strongholdType;
  });
  assert(targetDoc, "No ordinary city was available for the inactivity fixture.");

  const nowMs = Date.now();
  const staleLastSeenAtMs = nowMs - 16 * 24 * 60 * 60 * 1000;
  const fortificationState = { damageShare: 0.35, repairAtMs: nowMs + 120_000 };
  const batch = db.batch();
  batch.set(targetDoc.ref, {
    ownerKind: "player",
    ownerUid: user.uid,
    ownerName: "Inactive Level Sentinel",
    isMainCity: false,
    level: 32,
    defense: 32,
    troops: 25,
    troopFloat: 25,
    investedGold: 999_999,
    fortificationState,
    productionUpdatedAtMs: nowMs,
  }, { merge: true });
  batch.set(db.doc(`players/${user.uid}/serverMembership/current`), {
    serverId: "crown-marches",
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    realmShardId: "legacy",
    releaseId: realm.releaseId,
    status: "left",
    sessionId: "inactive-level-reset",
    displayName: "Inactive Level Sentinel",
    admittedAtMs: staleLastSeenAtMs - 1_000,
    lastSeenAtMs: staleLastSeenAtMs,
    inactivityStage: "active",
    updatedAtMs: staleLastSeenAtMs,
  }, { merge: true });
  await batch.commit();

  await runInactiveMaintenance();

  const [targetAfter, mainAfter, receiptAfter, membershipAfter] = await Promise.all([
    targetDoc.ref.get(),
    db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`).get(),
    db.doc(`realmMaintenance/${realm.resetGeneration}/inactivePlayers/${user.uid}`).get(),
    db.doc(`players/${user.uid}/serverMembership/current`).get(),
  ]);
  const target = targetAfter.data() || {};
  assert(target.ownerKind === "neutral" && !target.ownerUid, "Inactive city did not become neutral.");
  assert(Number(target.level) === 1 && Number(target.defense) === 1, "Inactive city did not reset to level 1.");
  assert(Number(target.investedGold || 0) === 0, "Inactive city retained invested gold.");
  assert(Number(target.troops || 0) === 0 && Number(target.troopFloat || 0) === 0, "Inactive city retained troops.");
  assert(Number(target.fortificationState?.damageShare) === 0.35, "Inactive city lost its fortification state.");
  assert(mainAfter.data()?.ownerUid === user.uid, "The inactivity surrender released the player's main city.");
  assert(receiptAfter.data()?.status === "completed" && receiptAfter.data()?.stage === "surrendered", "Maintenance receipt did not complete.");
  assert(Number(receiptAfter.data()?.releasedCities || 0) === 1, "Maintenance did not record the released city.");
  assert(membershipAfter.data()?.status === "inactive" && membershipAfter.data()?.inactivityStage === "surrendered", "Membership did not enter the surrendered state.");

  console.log("Inactive-city emulator reset passed: upgraded ordinary city returned to level 1 while main-city and fortification state were preserved.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
