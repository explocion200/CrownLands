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
      email: `army-listener-${nonce}@example.test`,
      password: `ArmyListener-${nonce}-Pass!`,
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

function activeRealmFilters(extra = []) {
  return {
    compositeFilter: {
      op: "AND",
      filters: [
        ...extra,
        equality("resetGeneration", realm.resetGeneration),
        equality("worldId", realm.worldId),
        equality("status", "active"),
      ],
    },
  };
}

async function runQuery(user, parentPath, collectionId, where = null) {
  const parent = parentPath ? `/${parentPath}` : "";
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents${parent}:runQuery`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${user.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          ...(where ? { where } : {}),
        },
      }),
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

async function main() {
  const user = await createAuthUser();
  const otherUid = `other_${crypto.randomBytes(5).toString("hex")}`;
  const current = {
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
    status: "active",
  };
  const batch = db.batch();
  batch.set(db.doc(`players/${user.uid}`), { uid: user.uid, ...current });
  batch.set(db.doc(`armies/outgoing_current_${user.uid}`), {
    ...current,
    ownerUid: user.uid,
    targetOwnerUid: otherUid,
  });
  batch.set(db.doc(`armies/outgoing_foreign_${user.uid}`), {
    ...current,
    ownerUid: otherUid,
    targetOwnerUid: user.uid,
  });
  batch.set(db.doc(`players/${user.uid}/incomingArmies/incoming_current`), {
    ...current,
    ownerUid: otherUid,
    targetOwnerUid: user.uid,
  });
  batch.set(db.doc(`players/${user.uid}/incomingArmies/incoming_stale`), {
    resetGeneration: "archived-generation",
    worldId: "archived-world",
    status: "active",
    ownerUid: otherUid,
    targetOwnerUid: user.uid,
  });
  await batch.commit();

  const outgoing = await runQuery(
    user,
    "",
    "armies",
    activeRealmFilters([equality("ownerUid", user.uid)])
  );
  assert(outgoing.response.status === 200, `Owner-scoped outgoing query was denied: ${JSON.stringify(outgoing.body)}`);
  assert(
    returnedDocumentIds(outgoing.body).includes(`outgoing_current_${user.uid}`),
    "Owner-scoped outgoing query did not return the current army."
  );

  const incoming = await runQuery(
    user,
    `players/${user.uid}`,
    "incomingArmies",
    activeRealmFilters()
  );
  assert(incoming.response.status === 200, `Realm-scoped incoming query was denied: ${JSON.stringify(incoming.body)}`);
  const incomingIds = returnedDocumentIds(incoming.body);
  assert(incomingIds.includes("incoming_current"), "Realm-scoped incoming query did not return the current army.");
  assert(!incomingIds.includes("incoming_stale"), "Realm-scoped incoming query leaked an archived army.");

  const unscopedIncoming = await runQuery(user, `players/${user.uid}`, "incomingArmies");
  assert(unscopedIncoming.response.status === 403, "Unscoped incoming-army query unexpectedly bypassed generation rules.");

  const unscopedOutgoing = await runQuery(user, "", "armies", activeRealmFilters());
  assert(unscopedOutgoing.response.status === 403, "Unscoped global-army query unexpectedly bypassed owner rules.");

  console.log("Army listener rules passed: current owner/incoming queries work and unscoped or archived reads remain blocked.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
