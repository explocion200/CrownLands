const crypto = require("node:crypto");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
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

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `tower-${label}-${nonce}@example.test`,
      password: `TowerRules-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

function documentUrl(documentPath, query = "") {
  return `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}${query}`;
}

function clientRequest(user, documentPath, options = {}) {
  return fetch(documentUrl(documentPath, options.query || ""), {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function forbiddenPatch(user, documentPath, field = "balance") {
  return clientRequest(user, documentPath, {
    method: "PATCH",
    query: `?updateMask.fieldPaths=${field}`,
    body: { fields: { [field]: { integerValue: "999999999" } } },
  });
}

async function main() {
  const [leader, member, outsider] = await Promise.all([
    createAuthUser("leader"),
    createAuthUser("member"),
    createAuthUser("outsider"),
  ]);
  const clanId = `tower_rules_${crypto.randomBytes(5).toString("hex")}`;
  const towerId = "core-v2-holding-tower-1";
  const current = {
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
  };
  const treasuryPath = `clans/${clanId}/treasury/${realm.resetGeneration}`;
  const leaderUsagePath = `clans/${clanId}/treasuryUsage/${realm.resetGeneration}_2026-08-22_${leader.uid}`;
  const receiptPath = `clans/${clanId}/treasuryReceipts/op-secret`;
  const towerPath = `holdingTowers/${towerId}`;
  const leaderGarrisonPath = `${towerPath}/garrison/${leader.uid}`;
  const memberGarrisonPath = `${towerPath}/garrison/${member.uid}`;

  const batch = db.batch();
  batch.set(db.doc(`clans/${clanId}`), { ...current, status: "active", leaderUid: leader.uid, memberCount: 2 });
  [[leader, "leader"], [member, "member"]].forEach(([user, role]) => {
    batch.set(db.doc(`clans/${clanId}/members/${user.uid}`), {
      ...current,
      uid: user.uid,
      clanId,
      role,
      status: "active",
    });
  });
  batch.set(db.doc(treasuryPath), { ...current, clanId, balance: 500_000, totalDonated: 700_000, totalSpent: 200_000 });
  batch.set(db.doc(leaderUsagePath), { ...current, clanId, uid: leader.uid, utcDate: "2026-08-22", donated: 100_000 });
  batch.set(db.doc(receiptPath), { ...current, clanId, actorUid: leader.uid, operationId: "op-secret", result: { balance: 500_000 } });
  batch.set(db.doc(towerPath), {
    ...current,
    id: towerId,
    name: "Ravenwatch Tower",
    ownerKind: "clan",
    clanId,
    wallLevel: 8,
    wallIntegrityBps: 8_500,
  });
  batch.set(db.doc(leaderGarrisonPath), { ...current, towerId, clanId, uid: leader.uid, troops: 120_000 });
  batch.set(db.doc(memberGarrisonPath), { ...current, towerId, clanId, uid: member.uid, troops: 80_000 });
  await batch.commit();

  assert((await clientRequest(outsider, towerPath)).status === 200, "A signed-in player could not read public Tower state.");
  assert((await clientRequest(leader, treasuryPath)).status === 200, "A clan member could not read the current Treasury summary.");
  assert((await clientRequest(outsider, treasuryPath)).status === 403, "A nonmember could read a clan Treasury.");
  assert((await clientRequest(leader, leaderUsagePath)).status === 200, "A member could not read their own donation usage.");
  assert((await clientRequest(member, leaderUsagePath)).status === 403, "A member could read another player's donation allowance usage.");
  assert((await clientRequest(leader, receiptPath)).status === 403, "A client could read server-only Treasury receipts.");
  assert((await clientRequest(leader, memberGarrisonPath)).status === 200, "An owning-clan member could not read the shared Tower garrison.");
  assert((await clientRequest(outsider, memberGarrisonPath)).status === 403, "An enemy could read exact Tower garrison attribution.");
  assert((await clientRequest(leader, leaderGarrisonPath)).status === 200, "A player could not read their own stationed troops.");

  assert((await forbiddenPatch(leader, treasuryPath)).status === 403, "A client could write Clan Treasury Gold.");
  assert((await forbiddenPatch(leader, towerPath, "wallLevel")).status === 403, "A client could write Tower Wall Level.");
  assert((await forbiddenPatch(leader, leaderGarrisonPath, "troops")).status === 403, "A client could write Tower garrison troops.");

  console.log("Emulator Holding Tower rules passed: public state, clan Treasury privacy, own usage, garrison secrecy, and server-only writes.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
