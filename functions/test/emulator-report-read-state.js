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
      email: `report-read-${nonce}@example.test`,
      password: `Reports-${nonce}-Pass!`,
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

async function main() {
  const user = await createAuthUser();
  const profileRef = db.doc(`players/${user.uid}`);
  await profileRef.set({ playerName: "Report Reader", reportsViewedAtMs: 0 });

  const baseMs = Date.now() - 30_000;
  const [firstDevice, secondDevice] = await Promise.all([
    invokeCallable("markReportsViewed", user.token, { viewedThroughMs: baseMs + 1_000 }),
    invokeCallable("markReportsViewed", user.token, { viewedThroughMs: baseMs + 2_000 }),
  ]);
  const expected = Math.max(firstDevice.reportsViewedAtMs, secondDevice.reportsViewedAtMs);
  let profile = (await profileRef.get()).data() || {};
  assert(profile.reportsViewedAtMs === expected, "Concurrent devices did not preserve the newest read position.");

  await invokeCallable("markReportsViewed", user.token, { viewedThroughMs: baseMs });
  profile = (await profileRef.get()).data() || {};
  assert(profile.reportsViewedAtMs === expected, "An older device moved the read position backward.");

  const beforeFutureAttemptMs = Date.now();
  const future = await invokeCallable("markReportsViewed", user.token, { viewedThroughMs: beforeFutureAttemptMs + 86_400_000 });
  assert(future.reportsViewedAtMs >= expected, "The read position regressed during server-time clamping.");
  assert(future.reportsViewedAtMs <= Date.now() + 2_000, "A client supplied a future report read time.");

  console.log("Emulator report read state passed: two-device monotonicity and server-time clamping.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
