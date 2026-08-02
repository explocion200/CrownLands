const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `war-room-retirement-${label}-${nonce}@example.test`,
      password: `Retired-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

function firestoreUrl(path) {
  return `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

async function clientRequest(user, path, method = "GET") {
  return fetch(firestoreUrl(path), {
    method,
    headers: {
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    ...(method === "PATCH" ? { body: JSON.stringify({ fields: { title: { stringValue: "blocked" } } }) } : {}),
  });
}

async function run() {
  const suffix = Date.now().toString(36);
  const clanId = `retired-war-room-rules-${suffix}`;
  const operationId = `operation-${suffix}`;
  const operationPath = `clans/${clanId}/operations/${operationId}`;
  const member = await createAuthUser("member");
  const outsider = await createAuthUser("outsider");
  const batch = db.batch();
  batch.set(db.doc(`clans/${clanId}`), { status: "active", leaderUid: member.uid });
  batch.set(db.doc(`clans/${clanId}/members/${member.uid}`), { uid: member.uid, role: "leader" });
  batch.set(db.doc(operationPath), { status: "active", title: "Legacy operation" });
  batch.set(db.doc(`${operationPath}/orders/order-1`), { action: "attack" });
  batch.set(db.doc(`clans/${clanId}/operationState/current`), { activeCount: 1 });
  batch.set(db.doc(`clanOperationReminders/${operationId}`), { status: "pending" });
  await batch.commit();

  for (const user of [member, outsider]) {
    for (const path of [
      operationPath,
      `${operationPath}/orders/order-1`,
      `clans/${clanId}/operationState/current`,
      `clanOperationReminders/${operationId}`,
    ]) {
      const read = await clientRequest(user, path);
      assert(read.status === 403, `Legacy War Room read should be denied at ${path}; received ${read.status}.`);
      const write = await clientRequest(user, path, "PATCH");
      assert(write.status === 403, `Legacy War Room write should be denied at ${path}; received ${write.status}.`);
    }
  }

  console.log("Legacy Clan War Room documents are inaccessible to members and outsiders.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
