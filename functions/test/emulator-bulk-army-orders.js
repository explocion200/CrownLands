const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const economyConfig = require("../economy-config.json");
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
      email: `bulk-orders-${nonce}@example.test`,
      password: `Bulk-${nonce}-Pass!`,
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
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
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
  return {
    ok: response.ok && !body.error,
    result: body.result || null,
    error: body.error || null,
  };
}

async function callFunction(name, token, data = {}) {
  const response = await invokeFunction(name, token, data);
  if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

async function findBulkArmies(requestId) {
  const snapshot = await db.collection("armies").where("bulkRequestId", "==", requestId).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function findRequestRecords(uid, requestId) {
  const snapshot = await db.collection(`players/${uid}/bulkOrderRequests`)
    .where("requestId", "==", requestId)
    .get();
  return snapshot.docs;
}

async function setFreshEconomy(profileRef, cityRefs, gold, troopsByCity = new Map()) {
  const nowMs = Date.now();
  await profileRef.set({
    gold,
    goldFloat: gold,
    economyUpdatedAtMs: nowMs,
  }, { merge: true });
  await Promise.all(cityRefs.map(ref => {
    const troops = Math.max(0, Number(troopsByCity.get(ref.id) ?? 500));
    return ref.set({
      troops,
      troopFloat: troops,
      productionUpdatedAtMs: nowMs,
    }, { merge: true });
  }));
}

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Bulk Order Sentinel" });
  const islandId = claim.islandId;
  const regionId = claim.regionId || claim.mainRegionId || String(islandId).split("-").pop();
  const profileRef = db.doc(`players/${user.uid}`);
  const citiesCollection = db.collection(`islands/${islandId}/cities`);
  const citySnapshot = await citiesCollection.get();
  const sourceRef = citiesCollection.doc(claim.cityId);
  const sourceData = (await sourceRef.get()).data() || {};
  const candidates = citySnapshot.docs.filter(doc => doc.id !== claim.cityId).slice(0, 10);
  assert(candidates.length >= 8, "The emulator world did not provide enough cities for bulk-order coverage.");

  const coordinatePatch = index => ({
    x: Number(sourceData.x || 0) + ((index % 2 ? 1 : -1) * (70 + index * 8)),
    y: Number(sourceData.y || 0) + ((index % 3 ? 1 : -1) * (55 + index * 7)),
    regionId,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
  });
  const neutralRefs = candidates.slice(0, 6).map(doc => doc.ref);
  const regroupSourceRefs = candidates.slice(6, 8).map(doc => doc.ref);
  await Promise.all([
    ...neutralRefs.map((ref, index) => ref.set({
      ...coordinatePatch(index),
      owner: "neutral",
      ownerUid: "",
      ownerName: "Gray Kingdom",
      isMainCity: false,
      level: 1,
      troops: 10,
      troopFloat: 10,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true })),
    ...regroupSourceRefs.map((ref, index) => ref.set({
      ...coordinatePatch(index + 6),
      owner: "player",
      ownerUid: user.uid,
      ownerName: "Bulk Order Sentinel",
      isMainCity: false,
      level: 1,
      troops: 100 + index * 50,
      troopFloat: 100 + index * 50,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true })),
  ]);

  const scoutCost = Number(economyConfig.playerCosts?.nearbyScoutGold || 0);
  const regroupCost = Number(economyConfig.playerCosts?.regroupGold || 0);
  assert(scoutCost > 0 && regroupCost > 0, "Bulk-order costs are not configured.");

  // A replay must return the same deterministic movements without charging or removing troops twice.
  await db.doc(`serverRateLimits/armyLaunch_${user.uid}`).delete();
  await setFreshEconomy(profileRef, [sourceRef], scoutCost * 4, new Map([[sourceRef.id, 30]]));
  const duplicateRequestId = `scout_dup_${crypto.randomBytes(5).toString("hex")}`;
  const duplicatePayload = {
    sourceCityId: sourceRef.id,
    sourceRegionId: regionId,
    targetCityIds: neutralRefs.slice(0, 2).map(ref => ref.id),
    requestId: duplicateRequestId,
  };
  const firstScout = await callFunction("sendNearbyScouts", user.token, duplicatePayload);
  const duplicateScout = await callFunction("sendNearbyScouts", user.token, duplicatePayload);
  assert(firstScout.armies?.length === 2, "The first Scout Nearby request did not create two armies.");
  assert(duplicateScout.duplicate === true, "The duplicate Scout Nearby request was not identified as a replay.");
  assert(
    JSON.stringify(firstScout.armies.map(army => army.id).sort())
      === JSON.stringify(duplicateScout.armies.map(army => army.id).sort()),
    "A duplicate Scout Nearby request returned different deterministic movement IDs."
  );
  const duplicateProfile = (await profileRef.get()).data() || {};
  const duplicateSource = (await sourceRef.get()).data() || {};
  assert(Number(duplicateProfile.gold) === scoutCost * 3, "A duplicate Scout Nearby request charged gold twice.");
  assert(Number(duplicateSource.troops) === 28, "A duplicate Scout Nearby request removed troops twice.");
  const duplicateArmies = await findBulkArmies(duplicateRequestId);
  assert(duplicateArmies.length === 2, "A duplicate Scout Nearby request wrote extra armies.");

  // Cleanup of the idempotency record must not permit deterministic canonical IDs to be reused.
  const duplicateRequestRecords = await findRequestRecords(user.uid, duplicateRequestId);
  assert(duplicateRequestRecords.length === 1, "The successful Scout Nearby request did not persist idempotency state.");
  await Promise.all([
    duplicateRequestRecords[0].ref.delete(),
    ...duplicateArmies.map(army => db.doc(`armies/${army.id}`).set({ status: "resolved" }, { merge: true })),
    db.doc(`serverRateLimits/armyLaunch_${user.uid}`).delete(),
  ]);
  await setFreshEconomy(profileRef, [sourceRef], scoutCost * 4, new Map([[sourceRef.id, 30]]));
  const collisionBeforeProfile = (await profileRef.get()).data() || {};
  const collisionBeforeSource = (await sourceRef.get()).data() || {};
  const collisionResult = await invokeFunction("sendNearbyScouts", user.token, duplicatePayload);
  assert(
    !collisionResult.ok && collisionResult.error?.status === "ALREADY_EXISTS",
    `Reusing a cleaned request ID did not hit the canonical movement guard: ${JSON.stringify(collisionResult)}`
  );
  const collisionAfterProfile = (await profileRef.get()).data() || {};
  const collisionAfterSource = (await sourceRef.get()).data() || {};
  assert(Number(collisionAfterProfile.gold) === Number(collisionBeforeProfile.gold), "A movement-ID collision charged gold.");
  assert(Number(collisionAfterSource.troops) === Number(collisionBeforeSource.troops), "A movement-ID collision changed troops.");
  assert((await findRequestRecords(user.uid, duplicateRequestId)).length === 0, "A movement-ID collision recreated idempotency state.");

  // Concurrent identical regroup calls must serialize to one atomic commit and one replay.
  await db.doc(`serverRateLimits/armyLaunch_${user.uid}`).delete();
  await setFreshEconomy(
    profileRef,
    [sourceRef, ...regroupSourceRefs],
    regroupCost * 4,
    new Map([[sourceRef.id, 30], [regroupSourceRefs[0].id, 100], [regroupSourceRefs[1].id, 150]])
  );
  const concurrentRequestId = `regroup_concurrent_${crypto.randomBytes(5).toString("hex")}`;
  const concurrentPayload = {
    targetCityId: sourceRef.id,
    targetRegionId: regionId,
    sourceCityIds: regroupSourceRefs.map(ref => ref.id),
    requestId: concurrentRequestId,
  };
  const concurrentResults = await Promise.all([
    invokeFunction("sendRegroupOrders", user.token, concurrentPayload),
    invokeFunction("sendRegroupOrders", user.token, concurrentPayload),
  ]);
  assert(concurrentResults.every(result => result.ok), `Concurrent Regroup calls failed: ${JSON.stringify(concurrentResults)}`);
  assert(
    concurrentResults.filter(result => result.result?.duplicate === true).length === 1,
    "Concurrent Regroup calls did not resolve as one commit and one idempotent replay."
  );
  const concurrentProfile = (await profileRef.get()).data() || {};
  const concurrentSources = await Promise.all(regroupSourceRefs.map(ref => ref.get()));
  assert(Number(concurrentProfile.gold) === regroupCost * 3, "Concurrent Regroup calls charged more than once.");
  assert(concurrentSources.every(snapshot => Number(snapshot.data()?.troops) === 0), "Concurrent Regroup calls did not atomically empty sources.");
  assert((await findBulkArmies(concurrentRequestId)).length === 2, "Concurrent Regroup calls wrote duplicate armies.");

  // Distinct requests that contend on the same profile/rate-limit document must
  // retain both committed launch weights when Firestore retries either transaction.
  await db.doc(`serverRateLimits/armyLaunch_${user.uid}`).delete();
  await setFreshEconomy(profileRef, [sourceRef], scoutCost * 4, new Map([[sourceRef.id, 30]]));
  const distinctRequestIds = [
    `scout_distinct_a_${crypto.randomBytes(5).toString("hex")}`,
    `scout_distinct_b_${crypto.randomBytes(5).toString("hex")}`,
  ];
  const distinctResults = await Promise.all([
    invokeFunction("sendNearbyScouts", user.token, {
      sourceCityId: sourceRef.id,
      sourceRegionId: regionId,
      targetCityIds: neutralRefs.slice(2, 4).map(ref => ref.id),
      requestId: distinctRequestIds[0],
    }),
    invokeFunction("sendNearbyScouts", user.token, {
      sourceCityId: sourceRef.id,
      sourceRegionId: regionId,
      targetCityIds: neutralRefs.slice(4, 6).map(ref => ref.id),
      requestId: distinctRequestIds[1],
    }),
  ]);
  assert(distinctResults.every(result => result.ok), `Concurrent distinct Scout Nearby calls failed: ${JSON.stringify(distinctResults)}`);
  const distinctRateLimit = (await db.doc(`serverRateLimits/armyLaunch_${user.uid}`).get()).data() || {};
  const distinctEvents = Array.isArray(distinctRateLimit.acceptedEvents) ? distinctRateLimit.acceptedEvents : [];
  assert(distinctEvents.length === 2, `A concurrent throttle retry erased an accepted launch event: ${JSON.stringify(distinctEvents)}`);
  assert(
    distinctEvents.reduce((total, event) => total + Number(event?.weight || 0), 0) === 4,
    `Concurrent distinct launch weight was not preserved: ${JSON.stringify(distinctEvents)}`
  );
  const distinctProfile = (await profileRef.get()).data() || {};
  const distinctSource = (await sourceRef.get()).data() || {};
  assert(Number(distinctProfile.gold) === scoutCost * 2, "Concurrent distinct Scout Nearby calls did not charge exactly twice.");
  assert(Number(distinctSource.troops) === 26, "Concurrent distinct Scout Nearby calls did not remove exactly four troops.");
  assert((await findBulkArmies(distinctRequestIds[0])).length === 2, "The first distinct Scout Nearby request did not create two armies.");
  assert((await findBulkArmies(distinctRequestIds[1])).length === 2, "The second distinct Scout Nearby request did not create two armies.");

  // Insufficient resources must roll the entire transaction back, including idempotency state.
  await db.doc(`serverRateLimits/armyLaunch_${user.uid}`).delete();
  await setFreshEconomy(profileRef, [sourceRef], scoutCost - 1, new Map([[sourceRef.id, 20]]));
  const rollbackRequestId = `scout_rollback_${crypto.randomBytes(5).toString("hex")}`;
  const rollbackBefore = (await sourceRef.get()).data() || {};
  const rollbackResult = await invokeFunction("sendNearbyScouts", user.token, {
    ...duplicatePayload,
    requestId: rollbackRequestId,
  });
  assert(!rollbackResult.ok && rollbackResult.error?.status === "FAILED_PRECONDITION", "Insufficient gold did not reject Scout Nearby.");
  const rollbackProfile = (await profileRef.get()).data() || {};
  const rollbackAfter = (await sourceRef.get()).data() || {};
  assert(Number(rollbackProfile.gold) === scoutCost - 1, "A rejected Scout Nearby request changed gold.");
  assert(Number(rollbackAfter.troops) === Number(rollbackBefore.troops), "A rejected Scout Nearby request changed troops.");
  assert((await findBulkArmies(rollbackRequestId)).length === 0, "A rejected Scout Nearby request left armies behind.");
  assert((await findRequestRecords(user.uid, rollbackRequestId)).length === 0, "A rejected Scout Nearby request left idempotency state behind.");

  // Insufficient troops must also reject before any part of the paid batch is committed.
  await db.doc(`serverRateLimits/armyLaunch_${user.uid}`).delete();
  await setFreshEconomy(profileRef, [sourceRef], scoutCost * 3, new Map([[sourceRef.id, 1]]));
  const troopRollbackRequestId = `scout_troops_${crypto.randomBytes(5).toString("hex")}`;
  const troopRollbackBeforeProfile = (await profileRef.get()).data() || {};
  const troopRollbackBeforeSource = (await sourceRef.get()).data() || {};
  const troopRollbackResult = await invokeFunction("sendNearbyScouts", user.token, {
    ...duplicatePayload,
    requestId: troopRollbackRequestId,
  });
  assert(
    !troopRollbackResult.ok && troopRollbackResult.error?.status === "FAILED_PRECONDITION",
    "Insufficient troops did not reject Scout Nearby."
  );
  const troopRollbackAfterProfile = (await profileRef.get()).data() || {};
  const troopRollbackAfterSource = (await sourceRef.get()).data() || {};
  assert(Number(troopRollbackAfterProfile.gold) === Number(troopRollbackBeforeProfile.gold), "An insufficient-troop rejection changed gold.");
  assert(Number(troopRollbackAfterSource.troops) === Number(troopRollbackBeforeSource.troops), "An insufficient-troop rejection changed troops.");
  assert((await findBulkArmies(troopRollbackRequestId)).length === 0, "An insufficient-troop rejection left armies behind.");
  assert((await findRequestRecords(user.uid, troopRollbackRequestId)).length === 0, "An insufficient-troop rejection left idempotency state behind.");

  // The rate limiter must account for every created army and retain an event
  // committed by a newer invocation when an older transaction retries.
  await db.doc(`serverRateLimits/armyLaunch_${user.uid}`).set({
    acceptedEvents: [{ atMs: Date.now() + 5_000, weight: 79 }],
    updatedAtMs: Date.now(),
  });
  await setFreshEconomy(profileRef, [sourceRef], scoutCost * 3, new Map([[sourceRef.id, 20]]));
  const throttleRequestId = `scout_weight_${crypto.randomBytes(5).toString("hex")}`;
  const throttleResult = await invokeFunction("sendNearbyScouts", user.token, {
    ...duplicatePayload,
    requestId: throttleRequestId,
  });
  assert(!throttleResult.ok && throttleResult.error?.status === "RESOURCE_EXHAUSTED", "Weighted launch throttling did not reject an over-budget batch.");
  assert(Number(throttleResult.error?.details?.requestedWeight || 0) === 2, "The throttle did not report the batch's two-army weight.");
  assert((await findBulkArmies(throttleRequestId)).length === 0, "A throttled Scout Nearby request left armies behind.");
  assert((await findRequestRecords(user.uid, throttleRequestId)).length === 0, "A throttled Scout Nearby request left idempotency state behind.");
  const throttleProfile = (await profileRef.get()).data() || {};
  assert(Number(throttleProfile.gold) === scoutCost * 3, "A throttled Scout Nearby request charged gold.");

  console.log("Bulk army-order emulator coverage passed: duplicate replay, cleaned-ID collision safety, identical/distinct concurrency, gold/troop rollback, and weighted throttling.");
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
