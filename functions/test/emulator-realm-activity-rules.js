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
      email: `realm-activity-${nonce}@example.test`,
      password: `RealmActivity-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

function equality(fieldPath, stringValue) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: "EQUAL",
      value: { stringValue },
    },
  };
}

function activityQuery(scoped = true) {
  return {
    from: [{ collectionId: "activity" }],
    ...(scoped ? {
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            equality("resetGeneration", realm.resetGeneration),
            equality("worldId", realm.worldId),
          ],
        },
      },
    } : {}),
    orderBy: [{ field: { fieldPath: "occurredAtMs" }, direction: "DESCENDING" }],
    limit: 250,
  };
}

async function runActivityQuery(token = "", scoped = true) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/realmEvents/${realm.resetGeneration}:runQuery`,
    {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({ structuredQuery: activityQuery(scoped) }),
    }
  );
  const body = await response.json().catch(() => null);
  return { response, body };
}

function returnedDocumentIds(body) {
  if (!Array.isArray(body)) return [];
  return body
    .map(row => String(row?.document?.name || "").split("/").pop())
    .filter(Boolean);
}

async function attemptClientWrite(user) {
  return fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/realmEvents/${realm.resetGeneration}/activity/client_forgery_${user.uid}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${user.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          eventType: { stringValue: "CITADEL_CAPTURED" },
          resetGeneration: { stringValue: realm.resetGeneration },
          worldId: { stringValue: realm.worldId },
        },
      }),
    }
  );
}

async function main() {
  const user = await createAuthUser();
  const nowMs = Date.now();
  const batch = db.batch();
  batch.set(db.doc(`realmEvents/${realm.resetGeneration}/activity/stronghold_${user.uid}`), {
    eventType: "STRONGHOLD_CAPTURED",
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
    occurredAtMs: nowMs - 1000,
  });
  batch.set(db.doc(`realmEvents/${realm.resetGeneration}/activity/citadel_${user.uid}`), {
    eventType: "CITADEL_CAPTURED",
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
    occurredAtMs: nowMs,
  });
  batch.set(db.doc(`realmEvents/${realm.resetGeneration}/activity/stale_${user.uid}`), {
    eventType: "CITADEL_CAPTURED",
    resetGeneration: "archived-generation",
    worldId: "archived-world",
    occurredAtMs: nowMs + 1000,
  });
  await batch.commit();

  const scoped = await runActivityQuery(user.token, true);
  assert(scoped.response.status === 200, `Scoped Realm Activity query was denied: ${JSON.stringify(scoped.body)}`);
  const ids = returnedDocumentIds(scoped.body);
  assert(ids.length === 2, `Scoped Realm Activity returned unexpected events: ${JSON.stringify(ids)}`);
  assert(ids[0] === `citadel_${user.uid}`, "Realm Activity is not newest first.");
  assert(!ids.includes(`stale_${user.uid}`), "Realm Activity leaked an archived event.");

  const unscoped = await runActivityQuery(user.token, false);
  assert(unscoped.response.status === 403, "An unscoped Realm Activity query bypassed generation rules.");
  const signedOut = await runActivityQuery("", true);
  assert(signedOut.response.status === 403, "A signed-out player read Realm Activity.");
  const write = await attemptClientWrite(user);
  assert(write.status === 403, "A player forged a Realm Activity event.");

  console.log("Realm Activity rules passed: current-season reads work while stale, anonymous, unscoped, and client-write access stays blocked.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
