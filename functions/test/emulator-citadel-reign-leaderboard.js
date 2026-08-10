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

function leaderboardQuery(scoped = true, strongholdId = "") {
  const filters = [
    ...(strongholdId ? [equality("strongholdId", strongholdId)] : []),
    equality("resetGeneration", realm.resetGeneration),
    equality("worldId", realm.worldId),
  ];
  return {
    from: [{ collectionId: "entries" }],
    ...(scoped ? {
      where: {
        compositeFilter: {
          op: "AND",
          filters,
        },
      },
    } : {}),
    orderBy: [{ field: { fieldPath: "totalHeldMs" }, direction: "DESCENDING" }],
    limit: 100,
  };
}

async function runLeaderboardQuery(token = "", scoped = true, ledgerPath = "crownCitadelReigns", strongholdId = "") {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${ledgerPath}/${realm.resetGeneration}:runQuery`,
    {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({ structuredQuery: leaderboardQuery(scoped, strongholdId) }),
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

async function attemptClientWrite(user, ledgerPath = "crownCitadelReigns", entryId = user.uid) {
  return fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${ledgerPath}/${realm.resetGeneration}/entries/${entryId}`,
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
  const strongholdId = "gold-stronghold";
  const otherStrongholdId = "training-stronghold";
  const strongholdEntries = [
    { id: `${strongholdId}__ruler_a_${user.uid}`, playerId: `stronghold_ruler_a_${user.uid}`, totalHeldMs: 240000 },
    { id: `${strongholdId}__ruler_b_${user.uid}`, playerId: `stronghold_ruler_b_${user.uid}`, totalHeldMs: 120000 },
  ];
  strongholdEntries.forEach((entry, index) => {
    batch.set(db.doc(`strongholdLegacies/${realm.resetGeneration}/entries/${entry.id}`), {
      strongholdId,
      strongholdName: "Aurum Keep",
      strongholdType: "gold",
      regionId: "center",
      playerId: entry.playerId,
      playerName: `Legacy Ruler ${index + 1}`,
      resetGeneration: realm.resetGeneration,
      worldId: realm.worldId,
      totalHeldMs: entry.totalHeldMs,
      currentHeldSinceMs: 0,
      isCurrentHolder: false,
    });
  });
  batch.set(db.doc(`strongholdLegacies/${realm.resetGeneration}/entries/${otherStrongholdId}__ruler_${user.uid}`), {
    strongholdId: otherStrongholdId,
    strongholdName: "Greybanner Hold",
    strongholdType: "training",
    regionId: "center",
    playerId: `other_stronghold_ruler_${user.uid}`,
    playerName: "Other Stronghold Ruler",
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
    totalHeldMs: 999999999,
    currentHeldSinceMs: 0,
    isCurrentHolder: false,
  });
  batch.set(db.doc(`strongholdLegacies/${realm.resetGeneration}/entries/${strongholdId}__stale_${user.uid}`), {
    strongholdId,
    strongholdName: "Aurum Keep",
    playerId: `stale_stronghold_${user.uid}`,
    playerName: "Archived Stronghold Ruler",
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

  const strongholdScoped = await runLeaderboardQuery(user.token, true, "strongholdLegacies", strongholdId);
  assert(strongholdScoped.response.status === 200, `Scoped Stronghold Legacy query was denied: ${JSON.stringify(strongholdScoped.body)}`);
  const strongholdIds = returnedDocumentIds(strongholdScoped.body);
  assert(strongholdIds.length === 2, `Scoped Stronghold Legacy returned an unexpected entry count: ${JSON.stringify(strongholdIds)}`);
  assert(strongholdIds[0] === strongholdEntries[0].id && strongholdIds[1] === strongholdEntries[1].id, "Stronghold Legacy entries were not ranked by hold time.");
  assert(!strongholdIds.some(id => id.startsWith(otherStrongholdId)), "A Stronghold Legacy query leaked a different Stronghold's rulers.");
  assert(!strongholdIds.includes(`${strongholdId}__stale_${user.uid}`), "Stronghold Legacy leaked an archived-world entry.");

  const strongholdUnscoped = await runLeaderboardQuery(user.token, false, "strongholdLegacies", strongholdId);
  assert(strongholdUnscoped.response.status === 403, "An unscoped Stronghold Legacy query unexpectedly bypassed generation rules.");

  const strongholdSignedOut = await runLeaderboardQuery("", true, "strongholdLegacies", strongholdId);
  assert(strongholdSignedOut.response.status === 403, "A signed-out player unexpectedly read Stronghold Legacy.");

  const strongholdWrite = await attemptClientWrite(user, "strongholdLegacies", `${strongholdId}__${user.uid}`);
  assert(strongholdWrite.status === 403, "A player unexpectedly wrote a server-owned Stronghold Legacy entry.");

  console.log("Citadel Reign Ledger and Stronghold Legacy rules passed: ranked scoped reads work while cross-scope, stale, anonymous, and client-write access stays blocked.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
