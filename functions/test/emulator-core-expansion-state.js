"use strict";

const { randomInt } = require("node:crypto");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const topology = require("../coreExpansionTopology.js");

// Real claims only attempt a threshold transition when a placement reaches the
// 20-city floor. Keep several transactions genuinely concurrent here without
// creating an emulator-only 50-writer lock convoy against one state document.
const THRESHOLD_STRESS_CONCURRENCY = 5;
const releaseConfig = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();

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
  if (process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST) {
    return process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST;
  }
  const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "").trim();
  if (!hubHost) return "127.0.0.1:5001";
  const response = await fetch(`http://${hubHost}/emulators`);
  if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
  const functions = (await response.json())?.functions || {};
  const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
  return formatEmulatorHost(functions.host || listen?.address, Number(functions.port || listen?.port));
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

async function createAuthUser(index) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `core-expansion-${index}@example.test`,
      password: `CoreExpansion-${index}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunction(name, token, data = {}, identity = {}) {
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
        clientReleaseId: identity.releaseId || releaseConfig.releaseId,
        clientResetGeneration: identity.resetGeneration || releaseConfig.resetGeneration,
        clientWorldId: identity.worldId || releaseConfig.worldId,
        clientRealmShardId: identity.realmShardId || "legacy",
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

async function runRetriableTransaction(operation, maxAttempts = 12) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.runTransaction(operation);
    } catch (error) {
      lastError = error;
      const retryable = Number(error?.code) === 10
        || /transaction lock timeout|aborted/i.test(String(error?.message || error));
      if (!retryable || attempt >= maxAttempts) throw error;
      const delayCeilingMs = Math.min(2_500, 100 * (2 ** Math.min(attempt, 5)));
      await new Promise(resolve => setTimeout(resolve, randomInt(50, delayCeilingMs + 1)));
    }
  }
  throw lastError;
}

async function main() {
  const resetGeneration = "emulator-core-expansion-generation";
  const stateRef = db.doc(`realmGenerations/${resetGeneration}/expansion/current`);
  const initial = topology.createInitialExpansionState(resetGeneration);
  await stateRef.set(initial);

  async function applyThreshold(sourceRegionId, thresholdRevision, {
    generation = resetGeneration,
    remainingNpcCities = topology.EXPANSION_THRESHOLD_NPC_CITIES,
  } = {}) {
    return runRetriableTransaction(async transaction => {
      const snapshot = await transaction.get(stateRef);
      const plan = topology.planThresholdActivation({
        state: snapshot.data() || {},
        resetGeneration: generation,
        sourceRegionId,
        remainingNpcCities,
        thresholdRevision,
      });
      if (plan.changed) transaction.set(stateRef, plan.state, { merge: false });
      return {
        changed: plan.changed,
        reason: plan.reason,
        activatedRegionIds: plan.activatedRegions.map(region => region.id),
      };
    });
  }

  async function finalizeNextPending() {
    return runRetriableTransaction(async transaction => {
      const snapshot = await transaction.get(stateRef);
      const current = topology.normalizeExpansionState(snapshot.data() || {});
      if (!current.pendingActivation) return { changed: false, activatedRegionIds: [] };
      const plan = topology.finalizePendingActivation({
        state: current,
        eventId: current.pendingActivation.eventId,
        readyRegionIds: current.pendingActivation.regionIds,
      });
      if (plan.changed) transaction.set(stateRef, plan.state, { merge: false });
      return {
        changed: plan.changed,
        activatedRegionIds: plan.activatedRegions.map(region => region.id),
        nextPending: Boolean(plan.state.pendingActivation),
      };
    });
  }

  const firstSource = initial.admittingRegionIds[0];
  const firstWave = await mapWithConcurrency(
    Array.from({ length: 50 }),
    THRESHOLD_STRESS_CONCURRENCY,
    () => applyThreshold(firstSource, 20)
  );
  assert(firstWave.filter(result => result.changed).length === 1,
    "Concurrent threshold retries activated more than one two-map batch.");

  const preparingFirst = topology.normalizeExpansionState((await stateRef.get()).data() || {});
  assert(preparingFirst.revision === 2, "The first threshold did not reserve exactly one activation revision.");
  assert(preparingFirst.activeRegionIds.length === 1, "Unverified maps became active before preparation completed.");
  assert(preparingFirst.pendingActivation?.regionIds.length === 2, "The first threshold did not reserve two maps.");
  const firstFinalization = await finalizeNextPending();
  assert(firstFinalization.changed && firstFinalization.activatedRegionIds.length === 2,
    "The prepared first pair did not activate together.");
  const afterFirst = topology.normalizeExpansionState((await stateRef.get()).data() || {});
  assert(afterFirst.revision === 3, "The first threshold did not finish its prepare-and-activate lifecycle.");
  assert(afterFirst.activeRegionIds.length === 3, "The first threshold did not activate exactly two maps.");
  assert(new Set(afterFirst.activeRegionIds).size === afterFirst.activeRegionIds.length,
    "The first threshold created duplicate active maps.");
  assert(!afterFirst.admittingRegionIds.includes(firstSource),
    "The threshold source continued admitting players after reaching 20 NPC cities.");
  assert(afterFirst.admittingRegionIds.length === 2,
    "The first threshold did not leave exactly two admitting maps.");

  const repeated = await applyThreshold(firstSource, 20);
  assert(!repeated.changed, "A repeated threshold request paid out another activation batch.");

  const belowThreshold = await applyThreshold(afterFirst.admittingRegionIds[0], 19, {
    remainingNpcCities: 21,
  });
  assert(!belowThreshold.changed && belowThreshold.reason === "threshold-not-reached",
    "A map activated before it reached the 20-NPC threshold.");

  const secondWaveRequests = afterFirst.admittingRegionIds.flatMap((sourceRegionId, sourceIndex) => (
    Array.from({ length: 25 }, () => ({ sourceRegionId, thresholdRevision: 40 + sourceIndex }))
  ));
  const secondWave = await mapWithConcurrency(
    secondWaveRequests,
    THRESHOLD_STRESS_CONCURRENCY,
    request => applyThreshold(request.sourceRegionId, request.thresholdRevision)
  );
  assert(secondWave.filter(result => result.changed).length === 2,
    "Two qualifying source maps did not produce exactly two idempotent activation batches.");

  const queuedState = topology.normalizeExpansionState((await stateRef.get()).data() || {});
  assert(queuedState.pendingActivation, "The first concurrent source did not reserve a preparation batch.");
  assert(queuedState.queuedActivationSources.length === 1,
    "The second concurrent source was not queued behind the active preparation batch.");
  const finalizedBatches = [];
  while (topology.normalizeExpansionState((await stateRef.get()).data() || {}).pendingActivation) {
    finalizedBatches.push(await finalizeNextPending());
  }
  assert(finalizedBatches.length === 2 && finalizedBatches.every(result => result.changed),
    "Queued activation batches did not finalize in order.");

  const finalState = topology.normalizeExpansionState((await stateRef.get()).data() || {});
  assert(finalState.revision === 7, "Concurrent source thresholds produced the wrong revision count.");
  assert(finalState.activeRegionIds.length === 7, "Three thresholds did not activate six successor maps.");
  assert(new Set(finalState.activeRegionIds).size === finalState.activeRegionIds.length,
    "Concurrent source thresholds produced duplicate map IDs.");
  assert(Object.keys(finalState.activationReceipts).length === 3,
    "The activation ledger did not retain one receipt per qualifying source threshold.");

  let generationRejected = false;
  try {
    await applyThreshold(finalState.admittingRegionIds[0], 99, { generation: "archived-generation" });
  } catch (error) {
    generationRejected = /does not match/.test(String(error?.message || error));
  }
  assert(generationRejected, "A mismatched reset generation changed the expansion state.");

  const users = await mapWithConcurrency(
    Array.from({ length: 50 }, (_, index) => index),
    15,
    createAuthUser
  );
  const realmInfo = await callFunction("getRealmInfo", users[0].token);
  assert(realmInfo.worldTopology === topology.TOPOLOGY_VERSION,
    "The forced emulator realm did not activate the Core-expansion topology.");
  assert(realmInfo.realmMode === "monthly-shared" && realmInfo.sharedRealmId === "shard_0001",
    "The Core-expansion reset split players across realms.");
  assert(realmInfo.resetReadinessStatus === "ready",
    "The reset pointer became visible before Core and first-New-Lands preparation completed.");
  assert(Number(realmInfo.startingCityCapacity) === (
    topology.MAX_NEW_LANDS_REGIONS * topology.EXPANSION_THRESHOLD_NPC_CITIES
  ), "The dynamic New Lands realm reported a fixed legacy capacity.");
  const identity = {
    releaseId: realmInfo.currentReleaseId,
    resetGeneration: realmInfo.resetGeneration,
    worldId: realmInfo.worldId,
    realmShardId: realmInfo.sharedRealmId,
  };
  const staleMembershipRef = db.doc(`players/${users[0].uid}/serverMembership/current`);
  await staleMembershipRef.set({
    serverId: "crown-marches",
    worldId: "main-archived-realm",
    resetGeneration: "archived-realm",
    realmShardId: "legacy",
    status: "active",
    sessionId: "archived-session",
    joinedAtMs: 1,
    admittedAtMs: 1,
    lastSeenAtMs: 1,
  });
  const postResetJoin = await callFunction("joinGameServer", users[0].token, {
    serverId: "crown-marches",
    sessionId: "post-reset-session",
    displayName: "Expansion Ruler 1",
  }, identity);
  assert(postResetJoin?.status === "active" && postResetJoin.realmShardId === realmInfo.sharedRealmId,
    "A stale archived membership overrode the active Core-expansion realm assignment.");
  const repairedMembership = (await staleMembershipRef.get()).data() || {};
  assert(repairedMembership.resetGeneration === realmInfo.resetGeneration
    && repairedMembership.worldId === realmInfo.worldId
    && repairedMembership.realmShardId === realmInfo.sharedRealmId,
    "Realm admission did not repair the archived membership to the active generation.");
  const postResetHeartbeat = await callFunction("heartbeatGameServer", users[0].token, {
    serverId: "crown-marches",
    sessionId: "post-reset-session",
    displayName: "Expansion Ruler 1",
  }, identity);
  assert(postResetHeartbeat?.status === "active" && postResetHeartbeat.realmShardId === realmInfo.sharedRealmId,
    "The repaired post-reset membership could not heartbeat in the active realm.");
  const claims = await mapWithConcurrency(users, 10, (user, index) => callFunction(
    "claimStartingCity",
    user.token,
    { playerName: `Expansion Ruler ${index + 1}` },
    identity
  ));
  assert(claims.every(claim => claim?.ok && claim.realmShardId === "shard_0001"),
    "At least one Core-expansion player failed to claim in the shared realm.");
  const uniqueClaims = new Set(claims.map(claim => `${claim.mainRegionId}:${claim.cityId}`));
  assert(uniqueClaims.size === users.length, "Concurrent Core-expansion claims collided on a city.");

  const replayClaims = await Promise.all(Array.from({ length: 8 }, () => callFunction(
    "claimStartingCity",
    users[0].token,
    { playerName: "Expansion Ruler 1" },
    identity
  )));
  assert(replayClaims.every(claim => (
    claim.alreadyClaimed === true
    && claim.cityId === claims[0].cityId
    && claim.mainRegionId === claims[0].mainRegionId
  )), "Repeated concurrent claims did not return the original starting city.");

  const liveExpansionRef = db.doc(`realmGenerations/${realmInfo.resetGeneration}/expansion/current`);
  const liveExpansion = topology.normalizeExpansionState((await liveExpansionRef.get()).data() || {});
  assert(liveExpansion.activeRegionIds.length === 3,
    "Fifty joins did not open exactly the next two New Lands maps at the 20-NPC threshold.");
  assert(liveExpansion.admittingRegionIds.length === 2,
    "The filled first New Lands map remained open for new-player admission.");
  const activeIslandSnapshots = await Promise.all(liveExpansion.activeRegionIds.map(regionId => (
    db.doc(`islands/${realmInfo.worldId}--shard_0001--${regionId}`).get()
  )));
  const populations = activeIslandSnapshots.map(snapshot => Number(snapshot.data()?.playerCount || 0));
  assert(populations[0] === 20, `The first New Lands map closed at ${populations[0]} players instead of 20.`);
  assert(populations.slice(1).reduce((sum, count) => sum + count, 0) === 30,
    "The successor maps did not receive all remaining players.");
  assert(Math.max(...populations.slice(1)) - Math.min(...populations.slice(1)) <= 1,
    `Successor-map placement was not balanced: ${populations.join("/")}.`);

  const depletedRegionId = liveExpansion.admittingRegionIds[0];
  const depletedIslandRef = db.doc(
    `islands/${realmInfo.worldId}--shard_0001--${depletedRegionId}`
  );
  const depletedCitiesSnap = await depletedIslandRef.collection("cities").get();
  const neutralCities = depletedCitiesSnap.docs.filter(snapshot => {
    const city = snapshot.data() || {};
    return String(city.ownerKind || "").toLowerCase() === "neutral"
      && !String(city.ownerUid || "").trim()
      && city.kind !== "stronghold"
      && city.isStronghold !== true
      && !String(city.strongholdType || "").trim();
  });
  assert(neutralCities.length === 25,
    `The recovery fixture expected 25 neutral cities, found ${neutralCities.length}.`);
  const gameplayCaptureBatch = db.batch();
  for (const citySnap of neutralCities.slice(0, 8)) {
    gameplayCaptureBatch.update(citySnap.ref, {
      ownerKind: "player",
      ownerUid: users[0].uid,
      ownerName: "Expansion Ruler 1",
    });
  }
  await gameplayCaptureBatch.commit();

  const archivedGeneration = "archived-emulator-generation";
  const archivedStateRef = db.doc(`realmGenerations/${archivedGeneration}/expansion/current`);
  const archivedState = topology.createInitialExpansionState(archivedGeneration);
  await archivedStateRef.set(archivedState);
  const recoveryUser = await createAuthUser(50);
  const recoveryClaim = await callFunction(
    "claimStartingCity",
    recoveryUser.token,
    { playerName: "Expansion Recovery Ruler" },
    identity
  );
  assert(recoveryClaim?.ok && recoveryClaim.mainRegionId !== depletedRegionId,
    "An overdue gameplay-driven threshold still blocked the next starter-city claim.");
  const recoveredExpansion = topology.normalizeExpansionState((await liveExpansionRef.get()).data() || {});
  assert(recoveredExpansion.activeRegionIds.length === 5,
    "An overdue threshold did not activate exactly two successor maps.");
  assert(!recoveredExpansion.admittingRegionIds.includes(depletedRegionId),
    "The overdue source map remained open for starter admission.");
  assert(recoveredExpansion.admittingRegionIds.length === 3,
    "Overdue recovery did not preserve the healthy source and add two successor maps.");
  assert(!recoveredExpansion.pendingActivation,
    "Overdue recovery left the successor maps pending instead of fully activated.");
  const recoveryReceipt = Object.values(recoveredExpansion.activationReceipts)
    .find(receipt => receipt.sourceRegionId === depletedRegionId);
  assert(recoveryReceipt?.remainingNpcCities === 17,
    "Overdue recovery did not record the authoritative 17-city threshold state.");
  assert(
    JSON.stringify(topology.normalizeExpansionState((await archivedStateRef.get()).data() || {}))
      === JSON.stringify(topology.normalizeExpansionState(archivedState)),
    "Active-realm admission recovery changed an archived generation.",
  );

  console.log("Core-expansion emulator gate passed: reset readiness, 50 shared-realm claims, idempotent replays, balanced placement, overdue gameplay-threshold recovery, current-generation isolation, and retry-safe two-map activation all held.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
