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
      email: `citadel-ledger-${nonce}@example.test`,
      password: `CitadelLedger-${nonce}-Pass!`,
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

function leaderboardQuery(scoped = true) {
  return {
    from: [{ collectionId: "entries" }],
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
    orderBy: [{ field: { fieldPath: "totalHeldMs" }, direction: "DESCENDING" }],
    limit: 100,
  };
}

async function runLeaderboardQuery(token = "", scoped = true) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/crownCitadelReigns/${realm.resetGeneration}:runQuery`,
    {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({ structuredQuery: leaderboardQuery(scoped) }),
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
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/crownCitadelReigns/${realm.resetGeneration}/entries/${user.uid}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${user.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ fields: { totalHeldMs: { integerValue: "999999999" } } }),
    }
  );
}

async function main() {
  const user = await createAuthUser();
  const currentEntries = [
    { id: `ruler_a_${user.uid}`, totalHeldMs: 180000 },
    { id: `ruler_b_${user.uid}`, totalHeldMs: 90000 },
  ];
  const batch = db.batch();
  currentEntries.forEach((entry, index) => {
    batch.set(db.doc(`crownCitadelReigns/${realm.resetGeneration}/entries/${entry.id}`), {
      playerId: entry.id,
      playerName: `Ruler ${index + 1}`,
      resetGeneration: realm.resetGeneration,
      worldId: realm.worldId,
      totalHeldMs: entry.totalHeldMs,
      currentHeldSinceMs: 0,
      isCurrentHolder: false,
    });
  });
  batch.set(db.doc(`crownCitadelReigns/${realm.resetGeneration}/entries/stale_${user.uid}`), {
    playerId: `stale_${user.uid}`,
    playerName: "Archived Ruler",
    resetGeneration: "archived-generation",
    worldId: "archived-world",
    totalHeldMs: 999999999,
  });
  await batch.commit();

  const scoped = await runLeaderboardQuery(user.token, true);
  assert(scoped.response.status === 200, `Scoped Citadel ledger query was denied: ${JSON.stringify(scoped.body)}`);
  const ids = returnedDocumentIds(scoped.body);
  assert(ids.length === 2, `Scoped Citadel ledger returned an unexpected entry count: ${JSON.stringify(ids)}`);
  assert(ids[0] === currentEntries[0].id && ids[1] === currentEntries[1].id, "Citadel ledger entries were not ranked by hold time.");
  assert(!ids.includes(`stale_${user.uid}`), "Citadel ledger leaked an archived-world entry.");

  const unscoped = await runLeaderboardQuery(user.token, false);
  assert(unscoped.response.status === 403, "The original unscoped Citadel ledger query unexpectedly bypassed generation rules.");

  const signedOut = await runLeaderboardQuery("", true);
  assert(signedOut.response.status === 403, "A signed-out player unexpectedly read the Citadel ledger.");

  const write = await attemptClientWrite(user);
  assert(write.status === 403, "A player unexpectedly wrote a server-owned Citadel ledger entry.");

  console.log("Citadel Reign Ledger rules passed: ranked current-world reads work while stale, anonymous, and client-write access stays blocked.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
