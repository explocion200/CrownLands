const { getApps, initializeApp } = require("firebase-admin/app");
const crypto = require("node:crypto");
const { Timestamp, getFirestore } = require("firebase-admin/firestore");
const realm = require("../release-config.json");
const { getClanQuestPeriod } = require("../clanQuestPeriod.js");

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
      email: `rally-${label}-${nonce}@example.test`,
      password: `RallyRules-${nonce}-Pass!`,
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

async function main() {
  const [leader, ally, defender, observer] = await Promise.all([
    createAuthUser("leader"),
    createAuthUser("ally"),
    createAuthUser("defender"),
    createAuthUser("observer"),
  ]);
  const clanId = `rally_rules_${crypto.randomBytes(5).toString("hex")}`;
  const rallyId = `rally_${crypto.randomBytes(5).toString("hex")}`;
  const attackId = `rally_attack_${crypto.randomBytes(5).toString("hex")}`;
  const joinId = `rally_join_${crypto.randomBytes(5).toString("hex")}`;
  const islandId = `${realm.worldId}-region_11`;
  const questPeriod = getClanQuestPeriod(Date.now(), realm.resetGeneration);
  const priorQuestPeriod = getClanQuestPeriod(questPeriod.weekStartAtMs - 1, realm.resetGeneration);
  const current = {
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
  };
  const batch = db.batch();
  batch.set(db.doc(`clans/${clanId}`), {
    ...current,
    status: "active",
    leaderUid: leader.uid,
    memberCount: 2,
  });
  [
    [leader, "leader"],
    [ally, "member"],
  ].forEach(([user, role]) => {
    batch.set(db.doc(`clans/${clanId}/members/${user.uid}`), {
      ...current,
      uid: user.uid,
      clanId,
      role,
      status: "active",
    });
    batch.set(db.doc(`players/${user.uid}`), {
      ...current,
      uid: user.uid,
      clanId,
      clanRole: role,
    });
  });
  [defender, observer].forEach(user => {
    batch.set(db.doc(`players/${user.uid}`), {
      ...current,
      uid: user.uid,
    });
  });
  batch.set(db.doc(`clans/${clanId}/rallies/${rallyId}`), {
    ...current,
    id: rallyId,
    clanId,
    status: "forming",
    leaderUid: leader.uid,
    targetId: "gold_stronghold",
    targetName: "Gold Stronghold",
    targetRegionId: "region_11",
    participantUids: [leader.uid, ally.uid],
  });
  batch.set(db.doc(`clans/${clanId}/rallyState/${realm.resetGeneration}`), {
    ...current,
    leaderUids: [leader.uid],
  });
  [questPeriod, priorQuestPeriod].forEach(period => {
    batch.set(db.doc(`clans/${clanId}/questProgress/${period.questPeriodId}`), {
      ...current,
      clanId,
      questPeriodId: period.questPeriodId,
      weekKey: period.weekKey,
      weekStartAtMs: period.weekStartAtMs,
      weekEndAtMs: period.weekEndAtMs,
      weekStartAt: Timestamp.fromMillis(period.weekStartAtMs),
      weekEndAt: Timestamp.fromMillis(period.weekEndAtMs),
      captureCount: 0,
      milestoneUnlocks: {},
    });
  });
  batch.set(db.doc(`clans/${clanId}/memberRewardHistory/${ally.uid}_${priorQuestPeriod.questPeriodId}`), {
    ...current,
    uid: ally.uid,
    clanId,
    questPeriodId: priorQuestPeriod.questPeriodId,
    questClaims: {},
  });
  batch.set(db.doc(`rallyBattleReceipts/${realm.resetGeneration}/entries/${attackId}_${ally.uid}`), {
    ...current,
    status: "settled",
    contributorUid: ally.uid,
  });
  batch.set(db.doc(`islands/${islandId}/armies/${joinId}`), {
    ...current,
    ownerKind: "player",
    ownerUid: ally.uid,
    ownerName: "Ally",
    kind: "rally_join",
    launchKind: "rally_join",
    rallyJoin: true,
    targetType: "city",
    fromId: "ally_city",
    toId: "leader_city",
    fromName: "Ally City",
    toName: "Leader City",
    sourceRegionId: "region_11",
    targetRegionId: "region_11",
    troops: 250,
    total: 30,
    path: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    pathSegments: [{ regionId: "region_11", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], length: 14 }],
    routeRegionIds: ["region_11"],
    pathLength: 14,
    launchedAtMs: Date.now(),
    arrivesAtMs: Date.now() + 30_000,
    status: "active",
  });
  await batch.commit();

  const rallyPath = `clans/${clanId}/rallies/${rallyId}`;
  assert((await clientRequest(leader, rallyPath)).status === 200, "The rally leader could not read the forming rally.");
  assert((await clientRequest(ally, rallyPath)).status === 200, "A current clan ally could not read the forming rally.");
  assert((await clientRequest(defender, rallyPath)).status === 403, "The future defender could see the rally target before launch.");
  assert((await clientRequest(observer, rallyPath)).status === 403, "A nonmember could see the forming rally target.");

  const forbiddenWrite = await clientRequest(ally, rallyPath, {
    method: "PATCH",
    query: "?updateMask.fieldPaths=status",
    body: { fields: { status: { stringValue: "launched" } } },
  });
  assert(forbiddenWrite.status === 403, "A clan member could write server-owned rally state.");
  assert(
    (await clientRequest(leader, `clans/${clanId}/rallyState/${realm.resetGeneration}`)).status === 403,
    "A client could read server-only rally concurrency state."
  );
  assert(
    (await clientRequest(ally, `rallyBattleReceipts/${realm.resetGeneration}/entries/${attackId}_${ally.uid}`)).status === 403,
    "A client could read server-only rally settlement receipts."
  );
  const activeQuestPath = `clans/${clanId}/questProgress/${questPeriod.questPeriodId}`;
  assert((await clientRequest(leader, activeQuestPath)).status === 200, "The clan leader could not read the active weekly quest.");
  assert((await clientRequest(ally, activeQuestPath)).status === 200, "A clan member could not read the active weekly quest.");
  assert((await clientRequest(observer, activeQuestPath)).status === 403, "A nonmember could read active weekly quest progress.");
  assert(
    (await clientRequest(ally, `clans/${clanId}/questProgress/${priorQuestPeriod.questPeriodId}`)).status === 403,
    "A clan member could read expired weekly quest history."
  );
  assert(
    (await clientRequest(ally, `clans/${clanId}/questProgress/${questPeriod.questPeriodId}_empty`)).status === 404,
    "A clan member cannot subscribe before the first capture creates the weekly quest document."
  );
  assert(
    (await clientRequest(ally, `clans/${clanId}/memberRewardHistory/${ally.uid}_${priorQuestPeriod.questPeriodId}`)).status === 403,
    "A clan member could read archived quest claim history."
  );
  const forbiddenQuestWrite = await clientRequest(ally, activeQuestPath, {
    method: "PATCH",
    body: { fields: { captureCount: { integerValue: "9999" } } },
  });
  assert(forbiddenQuestWrite.status === 403, "A clan member could write weekly quest progress.");

  const prelaunchAttackRead = await clientRequest(defender, `armies/${attackId}`);
  assert(prelaunchAttackRead.status !== 200, "The defender saw a final rally attack before launch.");
  const publicJoinResponse = await clientRequest(observer, `islands/${islandId}/armies/${joinId}`);
  assert(publicJoinResponse.status === 200, "A signed-in player could not see the public assembly march.");
  const publicJoinBody = JSON.stringify(await publicJoinResponse.json());
  assert(!publicJoinBody.includes("gold_stronghold") && !publicJoinBody.includes("Gold Stronghold"), "The public assembly march leaked the rally objective.");

  await db.doc(`armies/${attackId}`).set({
    ...current,
    id: attackId,
    ownerKind: "player",
    ownerUid: leader.uid,
    targetOwnerUid: defender.uid,
    participantUids: [leader.uid, ally.uid],
    kind: "attack",
    launchKind: "attack",
    rallyAttack: true,
    troops: 500,
    status: "active",
  });
  assert((await clientRequest(defender, `armies/${attackId}`)).status === 200, "The defender could not see the rally attack after launch.");
  assert((await clientRequest(ally, `armies/${attackId}`)).status === 200, "An allied attacker could not read the launched rally army.");
  assert((await clientRequest(observer, `armies/${attackId}`)).status === 403, "An unrelated player could read the canonical rally army.");

  console.log("Emulator rally rules passed: clan-only targets, weekly quest privacy, server-only writes, redacted assembly marches, and launch-time defender visibility.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
