const admin = require("firebase-admin");
const crypto = require("node:crypto");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
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
      email: `war-room-${label}-${nonce}@example.test`,
      password: `WarRoom-${nonce}-Pass!`,
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

function clientRequest(user, path, options = {}) {
  return fetch(firestoreUrl(path), {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function queryActiveOperations(user, clanId) {
  return clientRequest(user, `clans/${clanId}:runQuery`, {
    method: "POST",
    body: {
      structuredQuery: {
        from: [{ collectionId: "operations" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              ["resetGeneration", realm.resetGeneration],
              ["worldId", realm.worldId],
              ["visibility", "clan"],
              ["status", "active"],
            ].map(([fieldPath, stringValue]) => ({
              fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue } },
            })),
          },
        },
        limit: 5,
      },
    },
  });
}

async function main() {
  const [leader, officer, member, outsider] = await Promise.all([
    createAuthUser("leader"),
    createAuthUser("officer"),
    createAuthUser("member"),
    createAuthUser("outsider"),
  ]);
  const clanId = `war_room_rules_${crypto.randomBytes(5).toString("hex")}`;
  const activeId = `active_${crypto.randomBytes(4).toString("hex")}`;
  const draftId = `draft_${crypto.randomBytes(4).toString("hex")}`;
  const current = { worldId: realm.worldId, resetGeneration: realm.resetGeneration };
  const batch = db.batch();
  batch.set(db.doc(`clans/${clanId}`), {
    ...current,
    status: "active",
    leaderUid: leader.uid,
    memberCount: 3,
  });
  [[leader, "leader"], [officer, "officer"], [member, "member"]].forEach(([user, role]) => {
    batch.set(db.doc(`clans/${clanId}/members/${user.uid}`), {
      ...current,
      uid: user.uid,
      clanId,
      role,
      status: "active",
    });
  });
  batch.set(db.doc(`clans/${clanId}/operations/${activeId}`), {
    ...current,
    id: activeId,
    clanId,
    status: "active",
    visibility: "clan",
    updatedAtMs: Date.now(),
  });
  batch.set(db.doc(`clans/${clanId}/operations/${draftId}`), {
    ...current,
    id: draftId,
    clanId,
    status: "draft",
    visibility: "managers",
    updatedAtMs: Date.now(),
  });
  for (const operationId of [activeId, draftId]) {
    batch.set(db.doc(`clans/${clanId}/operations/${operationId}/orders/order_1`), {
      ...current,
      clanId,
      operationId,
      id: "order_1",
    });
    batch.set(db.doc(`clans/${clanId}/operations/${operationId}/assignments/assignment_1`), {
      ...current,
      clanId,
      operationId,
      id: "assignment_1",
      uid: member.uid,
      status: "requested",
    });
    batch.set(db.doc(`clans/${clanId}/operations/${operationId}/sharedReports/report_1`), {
      ...current,
      clanId,
      operationId,
      id: "report_1",
      ownerUid: member.uid,
    });
  }
  batch.set(db.doc(`clans/${clanId}/operationState/${realm.resetGeneration}`), {
    ...current,
    clanId,
    activeOperationIds: [activeId],
  });
  batch.set(db.doc(`clanOperationReminders/${clanId}_${activeId}_assignment_1`), {
    ...current,
    clanId,
    operationId: activeId,
    assignmentId: "assignment_1",
    uid: member.uid,
    status: "pending",
  });
  await batch.commit();

  const activePath = `clans/${clanId}/operations/${activeId}`;
  const draftPath = `clans/${clanId}/operations/${draftId}`;
  for (const user of [leader, officer, member]) {
    assert((await clientRequest(user, activePath)).status === 200, "A current clan member could not read an active operation.");
    assert((await queryActiveOperations(user, clanId)).status === 200, "The bounded active-operation query was rejected for a current member.");
  }
  assert((await clientRequest(outsider, activePath)).status === 403, "A nonmember could read an active clan operation.");
  assert((await queryActiveOperations(outsider, clanId)).status === 403, "A nonmember could query active clan operations.");
  assert((await clientRequest(leader, draftPath)).status === 200, "The clan leader could not read a draft operation.");
  assert((await clientRequest(officer, draftPath)).status === 200, "A clan officer could not read a draft operation.");
  assert((await clientRequest(member, draftPath)).status === 403, "A regular member could read a draft operation.");

  for (const nested of ["orders/order_1", "assignments/assignment_1", "sharedReports/report_1"]) {
    assert((await clientRequest(member, `${activePath}/${nested}`)).status === 200, `A member could not read active operation ${nested}.`);
    assert((await clientRequest(member, `${draftPath}/${nested}`)).status === 403, `A member could read draft operation ${nested}.`);
    assert((await clientRequest(officer, `${draftPath}/${nested}`)).status === 200, `An officer could not read draft operation ${nested}.`);
  }

  const forbiddenWrite = await clientRequest(leader, activePath, {
    method: "PATCH",
    body: { fields: { title: { stringValue: "Client overwrite" } } },
  });
  assert(forbiddenWrite.status === 403, "A client could bypass callable-only operation mutations.");
  assert(
    (await clientRequest(leader, `clans/${clanId}/operationState/${realm.resetGeneration}`)).status === 403,
    "A client could read server-only operation concurrency state."
  );
  assert(
    (await clientRequest(member, `clanOperationReminders/${clanId}_${activeId}_assignment_1`)).status === 403,
    "A client could read server-only reminder receipts."
  );

  console.log("Emulator Clan War Room rules passed: bounded member queries, manager-only drafts, nested privacy, and callable-only writes.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
