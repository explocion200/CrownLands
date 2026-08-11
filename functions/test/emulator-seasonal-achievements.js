const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST;
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
      if (!host || !Number.isInteger(port) || port < 1) throw new Error("Functions emulator discovery failed.");
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
      email: `seasonal-achievements-${label}-${nonce}@example.test`,
      password: `Seasonal-${nonce}-Pass!`,
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

async function pollUntil(read, predicate, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

function achievement(state, id) {
  return state?.achievements?.find(entry => entry.id === id);
}

async function main() {
  const [player, stranger] = await Promise.all([createAuthUser("owner"), createAuthUser("stranger")]);
  const claim = await callFunction("claimStartingCity", player.token, { playerName: "Season Sentinel" });
  await callFunction("claimStartingCity", stranger.token, { playerName: "Season Stranger" });

  const initial = await callFunction("getSeasonalAchievementStatus", player.token);
  const state = initial.seasonalAchievementState;
  assert(state?.achievements?.length === 40, "Seasonal Achievements did not generate exactly 40 entries.");
  assert(state.completedCount === 0 && state.claimedCount === 0, "A new season did not start empty.");
  const statePath = `players/${player.uid}/seasonalAchievements/${state.seasonId}`;

  const ownerRead = await clientDocumentRequest(player, statePath);
  assert(ownerRead.status === 200, `The owner could not read Seasonal Achievements (HTTP ${ownerRead.status}).`);
  const strangerRead = await clientDocumentRequest(stranger, statePath);
  assert(strangerRead.status === 403, "Another player read private Seasonal Achievements.");
  const clientWrite = await clientDocumentRequest(player, `${statePath}?updateMask.fieldPaths=completedCount`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { completedCount: { integerValue: "40" } } }),
  });
  assert(clientWrite.status === 403, "A client directly changed Seasonal Achievement state.");

  const strongholdEventId = `seasonal-stronghold-${crypto.randomUUID()}`;
  await db.doc(`realmEvents/${realm.resetGeneration}/activity/${strongholdEventId}`).create({
    schemaVersion: 1,
    eventId: strongholdEventId,
    eventType: "STRONGHOLD_CAPTURED",
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    occurredAtMs: Date.now(),
    createdAtMs: Date.now(),
    attackerPlayerId: player.uid,
    previousKingPlayerId: "",
    strongholdType: "gold",
  });
  const stateRef = db.doc(statePath);
  const completedState = await pollUntil(
    async () => (await stateRef.get()).data() || {},
    current => Boolean(achievement(current, "stronghold_raider")?.completedAtMs),
    "A validated Stronghold capture did not complete Stronghold Raider."
  );
  const lockedReward = achievement(completedState, "stronghold_raider")?.lockedReward;
  assert(lockedReward?.type === "troops" && Number(lockedReward.lockedAmount) > 0, "Completion did not lock a production-scaled troop reward.");

  const mainCityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const troopsBefore = Number((await mainCityRef.get()).data()?.troops || 0);
  const firstClaim = await callFunction("claimSeasonalAchievementReward", player.token, {
    seasonId: state.seasonId,
    achievementId: "stronghold_raider",
    requestId: `seasonal-claim-${crypto.randomUUID()}`,
  });
  assert(firstClaim.claimed === true && firstClaim.replayed === false, "The completed achievement did not claim.");
  const troopsAfter = Number((await mainCityRef.get()).data()?.troops || 0);
  assert(troopsAfter - troopsBefore === Number(firstClaim.receipt?.lockedAmount), "The locked troop reward was not credited exactly once.");
  const replay = await callFunction("claimSeasonalAchievementReward", player.token, {
    seasonId: state.seasonId,
    achievementId: "stronghold_raider",
    requestId: `seasonal-replay-${crypto.randomUUID()}`,
  });
  assert(replay.replayed === true, "A duplicate achievement claim was not treated as an idempotent replay.");
  assert(Number((await mainCityRef.get()).data()?.troops || 0) === troopsAfter, "A duplicate claim credited troops twice.");

  const citadelEventId = `seasonal-citadel-${crypto.randomUUID()}`;
  await db.doc(`realmEvents/${realm.resetGeneration}/activity/${citadelEventId}`).create({
    schemaVersion: 1,
    eventId: citadelEventId,
    eventType: "CITADEL_CAPTURED",
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    occurredAtMs: Date.now(),
    createdAtMs: Date.now(),
    attackerPlayerId: player.uid,
    previousKingPlayerId: "",
    strongholdType: "citadel",
  });
  const crownState = await pollUntil(
    async () => (await stateRef.get()).data() || {},
    current => Boolean(achievement(current, "claim_the_crown")?.completedAtMs),
    "A validated Citadel capture did not complete Claim the Crown."
  );
  assert(achievement(crownState, "stronghold_breaker")?.progress === 1, "The Crown Citadel incorrectly counted as a Stronghold capture.");

  const oldSeasonId = state.seasonId;
  const fakeOldState = { ...crownState, seasonId: `old_${oldSeasonId}`, monthKey: "2000-01" };
  const expiredRef = db.doc(`players/${player.uid}/seasonalAchievements/old_${oldSeasonId}`);
  await expiredRef.set(fakeOldState);
  const expiredClaim = await invokeFunction("claimSeasonalAchievementReward", player.token, {
    seasonId: `old_${oldSeasonId}`,
    achievementId: "claim_the_crown",
    requestId: `expired-${crypto.randomUUID()}`,
  });
  assert(!expiredClaim.ok && expiredClaim.error?.status === "FAILED_PRECONDITION", "An expired season reward was claimable.");

  console.log("Seasonal Achievement emulator checks passed.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.stack || error);
    process.exit(1);
  });
