const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!getApps().length) initializeApp({ projectId });
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

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `daily-missions-${label}-${nonce}@example.test`,
      password: `Daily-Missions-${nonce}-Pass!`,
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

function firestoreDocumentUrl(documentPath) {
  return `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
}

async function clientDocumentRequest(user, documentPath, options = {}) {
  return fetch(firestoreDocumentUrl(documentPath), {
    ...options,
    headers: {
      authorization: `Bearer ${user.token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

async function pollUntil(read, predicate, message, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

async function main() {
  const [player, stranger] = await Promise.all([
    createAuthUser("owner"),
    createAuthUser("stranger"),
  ]);
  const claim = await callFunction("claimStartingCity", player.token, { playerName: "Mission Sentinel" });
  const firstStatus = await callFunction("getDailyMissionStatus", player.token);
  const secondStatus = await callFunction("getDailyMissionStatus", player.token);
  const first = firstStatus.dailyMissionState;
  const second = secondStatus.dailyMissionState;
  assert(first?.missions?.length === 3, "Daily Missions did not generate three entries.");
  assert(new Set(first.missions.map(mission => mission.family)).size === 3, "Daily Missions duplicated a family.");
  assert(JSON.stringify(first.missions) === JSON.stringify(second.missions), "Daily Missions changed after reopening.");
  assert(Number(first.rerollsRemaining) === 1, "Daily Missions did not start with one reroll.");

  const statePath = `players/${player.uid}/dailyMissions/${first.cycleKey}`;
  const ownerRead = await clientDocumentRequest(player, statePath);
  assert(ownerRead.status === 200, `The owner could not read Daily Missions (HTTP ${ownerRead.status}).`);
  const strangerRead = await clientDocumentRequest(stranger, statePath);
  assert(strangerRead.status === 403, "Another player read private Daily Missions.");
  const clientWrite = await clientDocumentRequest(player, `${statePath}?updateMask.fieldPaths=rerollsRemaining`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { rerollsRemaining: { integerValue: "99" } } }),
  });
  assert(clientWrite.status === 403, "A client directly changed Daily Mission state.");

  const rerolled = await callFunction("rerollDailyMission", player.token, {
    cycleKey: first.cycleKey,
    missionId: first.missions[0].id,
    requestId: `reroll-${crypto.randomUUID()}`,
  });
  assert(rerolled.rerolled === true && Number(rerolled.dailyMissionState?.rerollsRemaining) === 0, "The daily reroll was not consumed exactly once.");
  assert(rerolled.dailyMissionState.missions[0].family !== first.missions[0].family, "The reroll returned the same mission family.");
  const secondReroll = await invokeFunction("rerollDailyMission", player.token, {
    cycleKey: first.cycleKey,
    missionId: rerolled.dailyMissionState.missions[0].id,
    requestId: `reroll-${crypto.randomUUID()}`,
  });
  assert(!secondReroll.ok && secondReroll.error?.status === "FAILED_PRECONDITION", "A second daily reroll was accepted.");

  const stateRef = db.doc(statePath);
  const profileRef = db.doc(`players/${player.uid}`);
  const cityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const state = (await stateRef.get()).data() || {};
  const testMission = {
    ...state.missions[0],
    id: `emulator_attack_${player.uid}`,
    family: "ATTACK_COUNT",
    activityGroup: "combat",
    activityKey: "ATTACK_COUNT",
    difficulty: "easy",
    icon: "banner",
    title: "Raise the Banners",
    description: "Launch 1 attack",
    target: 1,
    progress: 0,
    uniqueProgressKeys: [],
    completedAtMs: 0,
    claimedAtMs: 0,
    reward: { type: "gold", lockedAmount: 12_345, productionHours: 0.5, itemId: "" },
  };
  await stateRef.set({
    missions: [testMission, ...state.missions.slice(1)],
    completedCount: 0,
    claimedCount: 0,
    capacitySnapshot: {
      ...state.capacitySnapshot,
      launchableTroops: 1_000_000,
      qualifyingAttackTroops: 50_000,
    },
  }, { merge: true });

  const tokenEventRef = db.doc(`dailyMissionEvents/token_${player.uid}`);
  await tokenEventRef.set({
    eventId: `token_${player.uid}`,
    uid: player.uid,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    type: "ATTACK_LAUNCHED",
    occurredAtMs: Date.now(),
    targetCategory: "player_city",
    opponentUid: stranger.uid,
    committedTroops: 49_999,
    processedAtMs: 0,
    expiresAtMs: Date.now() + 86_400_000,
  });
  await pollUntil(
    () => tokenEventRef.get().then(snapshot => snapshot.data() || {}),
    event => Number(event.processedAtMs) > 0,
    "The token-attack mission event was not processed."
  );
  assert(Number((await stateRef.get()).data()?.missions?.[0]?.progress || 0) === 0, "A sub-5% token attack progressed a mission.");

  const validEventRef = db.doc(`dailyMissionEvents/valid_${player.uid}`);
  await validEventRef.set({
    eventId: `valid_${player.uid}`,
    uid: player.uid,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    type: "ATTACK_LAUNCHED",
    occurredAtMs: Date.now(),
    targetCategory: "player_city",
    opponentUid: stranger.uid,
    committedTroops: 50_000,
    processedAtMs: 0,
    expiresAtMs: Date.now() + 86_400_000,
  });
  const completedState = await pollUntil(
    () => stateRef.get().then(snapshot => snapshot.data() || {}),
    next => Number(next.missions?.[0]?.progress || 0) === 1 && Number(next.missions?.[0]?.completedAtMs || 0) > 0,
    "A qualifying attack did not complete its Daily Mission."
  );
  assert(Number(completedState.completedCount) >= 1, "Completed mission count did not update.");

  const outboxRead = await clientDocumentRequest(player, `dailyMissionEvents/valid_${player.uid}`);
  assert(outboxRead.status === 403, "A client read the protected Daily Mission event outbox.");

  const nowMs = Date.now();
  await Promise.all([
    profileRef.set({ economyUpdatedAtMs: nowMs }, { merge: true }),
    cityRef.set({ productionUpdatedAtMs: nowMs }, { merge: true }),
  ]);
  const goldBefore = Number((await profileRef.get()).data()?.goldFloat || 0);
  const claims = await Promise.all([
    invokeFunction("claimDailyMissionReward", player.token, {
      cycleKey: first.cycleKey,
      missionId: testMission.id,
      requestId: `claim-${crypto.randomUUID()}`,
    }),
    invokeFunction("claimDailyMissionReward", player.token, {
      cycleKey: first.cycleKey,
      missionId: testMission.id,
      requestId: `claim-${crypto.randomUUID()}`,
    }),
  ]);
  assert(claims.every(result => result.ok), `Concurrent mission claims failed: ${JSON.stringify(claims)}`);
  assert(claims.filter(result => result.result?.replayed === false).length === 1, "Mission reward was not granted exactly once.");
  assert(claims.filter(result => result.result?.replayed === true).length === 1, "Duplicate mission claim was not identified as a replay.");
  const goldAfter = Number((await profileRef.get()).data()?.goldFloat || 0);
  assert(goldAfter >= goldBefore + 12_345 && goldAfter < goldBefore + 12_600, `Mission reward was duplicated or misvalued (${goldBefore} -> ${goldAfter}).`);
  const claimedState = (await stateRef.get()).data() || {};
  assert(Number(claimedState.missions?.[0]?.claimedAtMs || 0) > 0, "The claimed mission did not persist its claimed state.");

  console.log("Daily Missions emulator gate passed: private state, UTC persistence, one reroll, 5% combat threshold, event progress, and idempotent claims are enforced.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
