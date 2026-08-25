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
      email: `profile-save-${nonce}@example.test`,
      password: `Profile-Save-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, firestoreValue(entry)])),
      },
    };
  }
  return { stringValue: String(value) };
}

async function patchPlayer(user, fields) {
  const masks = Object.keys(fields).map(field => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players/${user.uid}?${masks}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${user.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])),
      }),
    }
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function createPlayer(user, fields) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players?documentId=${encodeURIComponent(user.uid)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${user.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])),
      }),
    }
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function writeSnapshot(user, slot, state) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players/${user.uid}/saves?documentId=${encodeURIComponent(slot)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${user.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          version: firestoreValue(1),
          playerName: firestoreValue("Profile Sentinel"),
          gameSeconds: firestoreValue(10),
          state: firestoreValue(state),
        },
      }),
    }
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  const forgedReceiptUser = await createAuthUser();
  const forgedReceiptCreate = await createPlayer(forgedReceiptUser, {
    uid: forgedReceiptUser.uid,
    playerName: "Receipt Forger",
    cityUpgradeReceipts: [{
      requestId: "forged_receipt_request",
      signature: "exact:west:city_001:1",
      mode: "exact",
      upgraded: 1,
      spentGold: 0,
      finalLevel: 999,
    }],
  });
  assert(forgedReceiptCreate.status === 403, "A client-created profile seeded the server-owned city-upgrade receipt ledger.");

  const user = await createAuthUser();
  await db.doc(`players/${user.uid}`).set({
    uid: user.uid,
    playerName: "Profile Sentinel",
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
    releaseId: realm.releaseId,
    cloudSaveSlot: `default-${realm.resetGeneration}`,
    character: { level: 20, xp: 0, skillPoints: 19 },
    upgrades: {},
    skillPresets: { modelVersion: 4, activeSlot: 0, slots: [] },
    freeSkillResetGrantVersion: 1,
    freeSkillResetCredits: 0,
    gold: 100,
    goldFloat: 100,
  });

  const sessionWrite = await patchPlayer(user, {
    activeSession: {
      id: "profile-save-session",
      device: "desktop",
      reason: "auth-state",
      loginAtMs: Date.now(),
      lastSeenAtMs: Date.now(),
    },
    lastLoginAt: Date.now(),
  });
  assert(sessionWrite.status === 200, `Active-session update was denied: ${JSON.stringify(sessionWrite.body)}`);

  const profileWrite = await patchPlayer(user, {
    playerName: "Profile Sentinel",
    activeRegionId: "ashenfen_march",
    activeIslandId: "island-ashenfen_march",
    marchPercent: 0.5,
    lastSeenAtMs: Date.now(),
  });
  assert(profileWrite.status === 200, `Client-owned profile update was denied: ${JSON.stringify(profileWrite.body)}`);

  const protectedWrite = await patchPlayer(user, {
    freeSkillResetCredits: 99,
  });
  assert(protectedWrite.status === 403, "A direct client write changed a server-owned reset credit.");

  const slot = `default-${realm.resetGeneration}`;
  const snapshotWrite = await writeSnapshot(user, slot, {
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
    playerName: "Profile Sentinel",
  });
  assert(snapshotWrite.status === 200, `Current-slot game snapshot was denied: ${JSON.stringify(snapshotWrite.body)}`);
  const staleSnapshotWrite = await writeSnapshot(user, "default-archived-generation", {});
  assert(staleSnapshotWrite.status === 403, "An archived game snapshot slot was writable.");

  console.log("Profile save rules passed: session/profile/snapshot writes work and protected state, including city-upgrade receipts, remains server-owned.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
