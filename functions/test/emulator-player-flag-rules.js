const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  const v2 = { ...v1, version: 2, pattern: "canton", symbol: "guardian" };
  assert((await patchFlag(user, v1)).status === 200, "A valid five-field v1 flag was denied.");
  assert((await patchFlag(user, v2)).status === 200, "A valid version:2 flag was denied.");

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

  console.log("Player flag rules passed: v1/v2 are accepted and unknown versions, IDs, colors, and fields are denied.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
