const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");
const worldLayout = require("../world-layout.json");

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
      const emulators = await response.json();
      const functions = emulators?.functions || {};
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
      email: `city-upgrades-${nonce}@example.test`,
      password: `City-Upgrades-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function invokeFunction(name, token, data = {}) {
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
      },
    }),
  });
  const body = await response.json();
  return { ok: response.ok && !body.error, result: body.result || null, error: body.error || null };
}

async function callFunction(name, token, data = {}) {
  const response = await invokeFunction(name, token, data);
  if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

function getClaimRegionId(claim = {}) {
  if (claim.regionId) return String(claim.regionId);
  const islandId = String(claim.islandId || "");
  const prefix = `${realm.worldId}-`;
  if (!islandId.startsWith(prefix)) throw new Error(`Cannot determine the claim region from ${islandId}.`);
  return islandId.slice(prefix.length);
}

async function setEconomyGold(profileRef, amount) {
  const nowMs = Date.now();
  await profileRef.set({
    gold: amount,
    goldFloat: amount,
    economyUpdatedAtMs: nowMs,
  }, { merge: true });
  return nowMs;
}

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Upgrade Sentinel" });
  const profileRef = db.doc(`players/${user.uid}`);
  const claimRegionId = getClaimRegionId(claim);
  const remoteMap = worldLayout.maps.find(map => map.id !== claimRegionId && Array.isArray(map.cities) && map.cities.length);
  assert(remoteMap, "No off-map city is available for the city-upgrade fixture.");
  const remoteBase = remoteMap.cities[0];
  const cityRef = db.doc(`islands/${realm.worldId}-${remoteMap.id}/cities/${remoteBase.id}`);
  const nowMs = await setEconomyGold(profileRef, 1_000_000_000);
  await cityRef.set({
    ...remoteBase,
    id: remoteBase.id,
    name: remoteBase.name || "Remote Upgrade City",
    regionId: claimRegionId,
    islandId: `${realm.worldId}-${remoteMap.id}`,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    owner: "player",
    ownerKind: "player",
    ownerUid: user.uid,
    ownerId: user.uid,
    ownerName: "Upgrade Sentinel",
    level: 1,
    investedGold: 0,
    troops: 200,
    troopFloat: 200,
    productionUpdatedAtMs: nowMs,
  }, { merge: true });

  const realmInfo = await callFunction("getRealmInfo", user.token);
  assert(
    Number(realmInfo.capabilities?.cityUpgradeModesVersion) >= 1,
    "Realm info did not advertise authoritative city-upgrade modes."
  );

  const exactFive = await callFunction("upgradeCity", user.token, {
    cityId: remoteBase.id,
    regionId: remoteMap.id,
    mode: "exact",
    levels: 5,
    requestId: `exact_five_${crypto.randomUUID()}`,
  });
  assert(exactFive.mode === "exact" && exactFive.upgraded === 5 && exactFive.finalLevel === 6, "Exact +5 did not upgrade exactly five levels.");
  assert(Number(exactFive.spentGold) > 0, "Exact +5 did not report authoritative Gold spent.");
  assert(
    exactFive.cityUpdates?.some(update => update.id === remoteBase.id && update.regionId === remoteMap.id),
    "The off-map response did not reconcile the canonical region from the city document path."
  );
  assert(Number((await cityRef.get()).data()?.level) === 6, "The off-map city did not persist its exact +5 result.");

  await Promise.all([
    setEconomyGold(profileRef, 1_000_000_000_000),
    cityRef.set({ level: 1, investedGold: 0, productionUpdatedAtMs: Date.now() }, { merge: true }),
  ]);
  const exactTwentyRequestId = `exact_twenty_${crypto.randomUUID()}`;
  const exactTwenty = await callFunction("upgradeCity", user.token, {
    cityId: remoteBase.id,
    regionId: remoteMap.id,
    mode: "exact",
    levels: 20,
    requestId: exactTwentyRequestId,
  });
  assert(exactTwenty.mode === "exact" && exactTwenty.upgraded === 20 && exactTwenty.finalLevel === 21, "An exact 20-level client batch did not settle atomically.");
  assert(Number(exactTwenty.spentGold) > Number(exactFive.spentGold), "The exact 20-level batch reported an invalid Gold spend.");
  assert(Number((await cityRef.get()).data()?.level) === 21, "The exact 20-level batch did not persist its authoritative level.");
  const exactTwentyReplay = await callFunction("upgradeCity", user.token, {
    cityId: remoteBase.id,
    regionId: remoteMap.id,
    mode: "exact",
    levels: 20,
    requestId: exactTwentyRequestId,
  });
  assert(exactTwentyReplay.replayed === true && exactTwentyReplay.finalLevel === 21, "The exact 20-level batch was not replay-safe.");
  assert(Number((await cityRef.get()).data()?.level) === 21, "Replaying the exact 20-level batch applied it twice.");

  await Promise.all([
    setEconomyGold(profileRef, 0),
    cityRef.set({ level: 6, productionUpdatedAtMs: Date.now() }, { merge: true }),
  ]);
  const insufficient = await invokeFunction("upgradeCity", user.token, {
    cityId: remoteBase.id,
    regionId: remoteMap.id,
    mode: "exact",
    levels: 5,
    requestId: `insufficient_${crypto.randomUUID()}`,
  });
  assert(
    !insufficient.ok
      && insufficient.error?.status === "FAILED_PRECONDITION"
      && insufficient.error?.details?.reason === "insufficient-gold",
    `Insufficient exact +5 did not return its structured all-or-nothing rejection: ${JSON.stringify(insufficient.error)}`
  );
  assert(Number((await cityRef.get()).data()?.level) === 6, "Insufficient exact +5 partially upgraded the city.");

  await Promise.all([
    setEconomyGold(profileRef, 1_000_000_000),
    cityRef.set({ productionUpdatedAtMs: Date.now() }, { merge: true }),
  ]);
  const duplicateRequestId = `duplicate_${crypto.randomUUID()}`;
  const duplicateResults = await Promise.all([
    invokeFunction("upgradeCity", user.token, {
      cityId: remoteBase.id,
      regionId: remoteMap.id,
      mode: "exact",
      levels: 1,
      requestId: duplicateRequestId,
    }),
    invokeFunction("upgradeCity", user.token, {
      cityId: remoteBase.id,
      regionId: remoteMap.id,
      mode: "exact",
      levels: 1,
      requestId: duplicateRequestId,
    }),
  ]);
  assert(duplicateResults.every(result => result.ok), `Concurrent duplicate upgrades did not both settle: ${JSON.stringify(duplicateResults)}`);
  assert(
    duplicateResults.filter(result => result.result?.replayed === true).length === 1
      && duplicateResults.filter(result => result.result?.replayed === false).length === 1,
    "Concurrent duplicate upgrades did not produce one mutation and one replay."
  );
  assert(Number((await cityRef.get()).data()?.level) === 7, "A duplicate request upgraded the city more than once.");
  const duplicateEventId = `city_upgrade_${user.uid}_${duplicateRequestId}`;
  const upgradeEvents = (await db.collection("dailyMissionEvents").where("uid", "==", user.uid).get()).docs
    .map(doc => doc.data() || {})
    .filter(event => event.eventId === duplicateEventId);
  assert(
    upgradeEvents.length === 1
      && Number(upgradeEvents[0].levelsGained) === 1
      && Number(upgradeEvents[0].goldSpent) === Number(duplicateResults[0].result?.spentGold),
    "A duplicate request emitted the city-upgrade mission side effect more than once."
  );
  const reusedRequest = await invokeFunction("upgradeCity", user.token, {
    cityId: remoteBase.id,
    regionId: remoteMap.id,
    mode: "exact",
    levels: 5,
    requestId: duplicateRequestId,
  });
  assert(!reusedRequest.ok && reusedRequest.error?.status === "INVALID_ARGUMENT", "A request id was reused for a different upgrade signature.");

  await Promise.all([
    setEconomyGold(profileRef, 1_000_000_000_000),
    cityRef.set({ level: 1, investedGold: 0, productionUpdatedAtMs: Date.now() }, { merge: true }),
  ]);
  const maxResult = await callFunction("upgradeCity", user.token, {
    cityId: remoteBase.id,
    regionId: remoteMap.id,
    mode: "max",
    requestId: `max_${crypto.randomUUID()}`,
  });
  assert(maxResult.mode === "max" && maxResult.upgraded > 5, "MAX did not buy every affordable level in one authoritative call.");
  assert(maxResult.finalLevel === 1 + maxResult.upgraded, "MAX returned an inconsistent final level.");
  assert(Number((await cityRef.get()).data()?.level) === maxResult.finalLevel, "MAX did not persist its authoritative final level.");

  await Promise.all([
    setEconomyGold(profileRef, 1_000_000_000),
    cityRef.set({ level: 1, investedGold: 0, productionUpdatedAtMs: Date.now() }, { merge: true }),
  ]);
  const incomingId = `incoming_upgrade_${crypto.randomUUID()}`;
  const incomingRef = db.doc(`armies/${incomingId}`);
  await incomingRef.set({
    id: incomingId,
    status: "active",
    kind: "attack",
    returning: false,
    ownerUid: `attacker_${crypto.randomUUID()}`,
    targetOwnerUid: user.uid,
    targetType: "city",
    targetRegionId: remoteMap.id,
    toId: remoteBase.id,
    arrivesAtMs: Date.now() + 10 * 60 * 1000,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
  });
  const blocked = await invokeFunction("upgradeCity", user.token, {
    cityId: remoteBase.id,
    regionId: remoteMap.id,
    mode: "exact",
    levels: 1,
    requestId: `incoming_block_${crypto.randomUUID()}`,
  });
  assert(
    !blocked.ok
      && blocked.error?.status === "FAILED_PRECONDITION"
      && blocked.error?.details?.reason === "incoming-attack",
    `An authoritative incoming attack did not block the upgrade: ${JSON.stringify(blocked.error)}`
  );
  assert(Number((await cityRef.get()).data()?.level) === 1, "An incoming-attack rejection changed the city level.");
  await incomingRef.delete();

  const profile = (await profileRef.get()).data() || {};
  assert(
    Array.isArray(profile.cityUpgradeReceipts)
      && profile.cityUpgradeReceipts.some(receipt => receipt.requestId === duplicateRequestId),
    "The bounded city-upgrade receipt ledger did not retain the idempotency receipt."
  );

  console.log("City upgrade emulator validation passed: canonical off-map routing, exact +5 atomicity, direct MAX, idempotency, and incoming-attack authority.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
