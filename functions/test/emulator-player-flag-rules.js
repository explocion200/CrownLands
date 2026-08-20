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
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stableJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])));
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
      email: `player-flag-${nonce}@example.test`,
      password: `Player-Flag-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

function firestoreValue(value) {
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "object" && value !== null) {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, firestoreValue(entry)])) } };
  }
  return { stringValue: String(value) };
}

async function patchFlag(user, flag) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players/${user.uid}?updateMask.fieldPaths=flag`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${user.token}`, "content-type": "application/json" },
      body: JSON.stringify({ fields: { flag: firestoreValue(flag) } }),
    }
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function patchDocument(user, documentPath, fields) {
  const masks = Object.keys(fields).map(field => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}?${masks}`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${user.token}`, "content-type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])) }),
    }
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function callFunction(name, user, data = {}) {
  const functionsHost = await resolveFunctionsHost();
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${user.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
      },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) throw new Error(`${name} failed: ${JSON.stringify(body)}`);
  return body?.result || null;
}

async function assertStoredFlag(documentPath, fieldPath, expected, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} document is missing.`);
  const actual = fieldPath.split(".").reduce((value, key) => value?.[key], snapshot.data());
  assert(stableJson(actual) === stableJson(expected), `${label} stored a different flag: ${JSON.stringify(actual)}`);
}

async function main() {
  const user = await createAuthUser();
  await db.doc(`players/${user.uid}`).set({
    uid: user.uid,
    playerName: "Flag Rules Sentinel",
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
    releaseId: realm.releaseId,
    cloudSaveSlot: `default-${realm.resetGeneration}`,
  });

  const v1 = { primary: "#315A8A", secondary: "#C69A45", symbolColor: "#F2E2BF", pattern: "chevron", symbol: "lion" };
  const v2 = { ...v1, version: 2, pattern: "canton", symbol: "war-hammer" };
  const legacyV2 = { ...v2, symbol: "guardian" };
  assert((await patchFlag(user, v1)).status === 200, "A valid five-field v1 flag was denied.");
  assert((await patchFlag(user, v2)).status === 200, "A valid version:2 flag was denied.");
  assert((await patchFlag(user, legacyV2)).status === 200, "A readable legacy-only symbol was denied.");
  assert((await patchFlag(user, v2)).status === 200, "The approved version:2 flag could not be restored.");

  const saveId = `default-${realm.resetGeneration}`;
  const validSave = await patchDocument(user, `players/${user.uid}/saves/${saveId}`, {
    version: 26,
    playerName: "Flag Rules Sentinel",
    gameSeconds: 10,
    state: { resetGeneration: realm.resetGeneration, flag: v2 },
  });
  assert(validSave.status === 200, `A valid v2 save snapshot was denied: ${JSON.stringify(validSave.body)}`);
  const invalidSave = await patchDocument(user, `players/${user.uid}/saves/${saveId}`, {
    state: { resetGeneration: realm.resetGeneration, flag: { ...v2, version: 3 } },
  });
  assert(invalidSave.status === 403, "A save snapshot accepted an unknown nested flag version.");

  const presencePath = `islands/${realm.worldId}-ashenfen_march/presence/${user.uid}`;
  const validPresence = await patchDocument(user, presencePath, { uid: user.uid, flag: v2 });
  assert(validPresence.status === 200, `A valid v2 presence flag was denied: ${JSON.stringify(validPresence.body)}`);
  const invalidPresence = await patchDocument(user, presencePath, { flag: { ...v2, imageUrl: "https://example.test/flag.svg" } });
  assert(invalidPresence.status === 403, "Presence accepted an unexpected flag field.");

  const identity = await callFunction("syncPlayerIdentity", user, {
    ownerName: "Flag Rules Sentinel",
    ownerFlag: v2,
    ownerKingPower: 123,
    mainCityId: "",
    mainRegionId: "ashenfen_march",
    mainIslandId: `${realm.worldId}-ashenfen_march`,
  });
  assert(identity?.ok === true, `Identity sync did not confirm success: ${JSON.stringify(identity)}`);
  assert(stableJson(identity.ownerFlag) === stableJson(v2), `Identity sync returned a different flag: ${JSON.stringify(identity.ownerFlag)}`);

  await assertStoredFlag(`players/${user.uid}`, "flag", v2, "Canonical profile");
  await assertStoredFlag(`players/${user.uid}/saves/${saveId}`, "state.flag", v2, "Cloud save");
  await assertStoredFlag(presencePath, "flag", v2, "Presence");
  await assertStoredFlag(`leaderboards/${realm.resetGeneration}/entries/${user.uid}`, "flag", v2, "Leaderboard identity");

  for (const [label, invalidFlag] of [
    ["unknown version", { ...v2, version: 3 }],
    ["unknown symbol", { ...v2, symbol: "unknown" }],
    ["unknown pattern", { ...v2, pattern: "unknown" }],
    ["raw color name", { ...v2, primary: "parchment" }],
    ["unexpected field", { ...v2, imageUrl: "https://example.test/flag.svg" }],
  ]) {
    const result = await patchFlag(user, invalidFlag);
    assert(result.status === 403, `The rules accepted an invalid ${label} flag: ${JSON.stringify(result.body)}`);
  }

  console.log("Player flag persistence passed: exact v2 profile, save, presence, callable, and leaderboard destinations round-trip safely.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
