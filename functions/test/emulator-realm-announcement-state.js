const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const value = String(host || "127.0.0.1").trim();
  const formatted = value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
  return `${formatted}:${port}`;
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
      if (!host || !Number.isInteger(port) || port < 1) throw new Error("Functions emulator was not discovered.");
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
      email: `realm-announcement-${nonce}@example.test`,
      password: `Realm-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function invokeCallable(name, token, data = {}) {
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

function eventRef(eventId) {
  return db.doc(`realmEvents/${realm.resetGeneration}/activity/${eventId}`);
}

async function writeEvent(eventId, occurredAtMs, eventType = "STRONGHOLD_CAPTURED", attackerPlayerId = "attacker") {
  await eventRef(eventId).set({
    eventId,
    eventType,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    occurredAtMs,
    createdAtMs: occurredAtMs,
    objectiveId: "defense-stronghold",
    attackerPlayerId,
  });
}

async function main() {
  const user = await createAuthUser();
  const profileRef = db.doc(`players/${user.uid}`);
  await profileRef.set({
    playerName: "Realm Herald",
    reportsViewedAtMs: 123,
    realmAnnouncementSeenThroughMs: 0,
  });
  await invokeCallable("claimStartingCity", user.token, { playerName: "Realm Herald" });
  await profileRef.set({ reportsViewedAtMs: 123 }, { merge: true });

  const baseMs = Date.now() - 60_000;
  await writeEvent("realm-catch-up", baseMs, "CITADEL_CAPTURED", user.uid);
  const seenThroughMs = baseMs + 5_000;
  const claims = await Promise.all([
    invokeCallable("markRealmAnnouncementSeen", user.token, { eventId: "realm-catch-up", seenThroughMs }),
    invokeCallable("markRealmAnnouncementSeen", user.token, { eventId: "realm-catch-up", seenThroughMs }),
  ]);
  assert(claims.filter(result => result.claimed === true).length === 1, "Concurrent devices both claimed the same catch-up batch.");

  let profile = (await profileRef.get()).data() || {};
  assert(profile.realmAnnouncementSeenThroughMs === seenThroughMs, "The catch-up cursor did not advance through the represented batch.");
  assert(profile.lastRealmAnnouncementEventId === "realm-catch-up", "The selected Realm event ID was not preserved.");
  assert(profile.reportsViewedAtMs === 123, "Showing a Realm announcement changed the Reports unread cursor.");

  const futureEventMs = Date.now() - 5_000;
  await writeEvent("realm-future-clamp", futureEventMs, "STRONGHOLD_CAPTURED", user.uid);
  const futureResult = await invokeCallable("markRealmAnnouncementSeen", user.token, {
    eventId: "realm-future-clamp",
    seenThroughMs: Date.now() + 86_400_000,
  });
  assert(futureResult.realmAnnouncementSeenThroughMs >= futureEventMs, "A newer Realm event did not advance the cursor.");
  assert(futureResult.realmAnnouncementSeenThroughMs <= Date.now() + 2_000, "The Realm cursor was not clamped to server time.");

  profile = (await profileRef.get()).data() || {};
  assert(profile.reportsViewedAtMs === 123, "Realm cursor updates changed Battle Reports read state.");
  console.log("Emulator Realm announcement state passed: one-device claim, monotonic cursor, server clamp, and report isolation.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
