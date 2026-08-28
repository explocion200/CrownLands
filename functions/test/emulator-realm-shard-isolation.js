"use strict";

const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();

const RESET_GENERATION = "realm-2026-09";
const WORLD_ID = "main-realm-2026-09";
const SHARD_ONE = "shard_0001";
const SHARD_TWO = "shard_0002";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `realm-shard-${label}-${nonce}@example.test`,
      password: `RealmShard-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

function storageId(shardId) {
  return `${RESET_GENERATION}--${shardId}`;
}

function islandId(shardId) {
  return `${WORLD_ID}--${shardId}--starter-west`;
}

async function clientGet(token, documentPath) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return response;
}

async function clientRunQuery(token, parentPath, structuredQuery) {
  return fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${parentPath}:runQuery`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ structuredQuery }),
    }
  );
}

async function expectStatus(token, documentPath, expected, message) {
  const response = await clientGet(token, documentPath);
  assert(response.status === expected, `${message} (expected ${expected}, received ${response.status})`);
}

async function main() {
  const [playerOne, playerTwo] = await Promise.all([
    createAuthUser("one"),
    createAuthUser("two"),
  ]);
  const nowMs = Date.now();
  const batch = db.batch();
  batch.set(db.doc("realmConfig/current"), {
    resetGeneration: RESET_GENERATION,
    worldId: WORLD_ID,
    mode: "monthly-sharded",
    monthKey: "2026-09",
    realmShardCapacity: 50,
  });

  [
    { player: playerOne, shardId: SHARD_ONE },
    { player: playerTwo, shardId: SHARD_TWO },
  ].forEach(({ player, shardId }, index) => {
    const shared = {
      uid: player.uid,
      resetGeneration: RESET_GENERATION,
      worldId: WORLD_ID,
      realmShardId: shardId,
    };
    batch.set(db.doc(`players/${player.uid}`), { ...shared, playerName: `Shard Tester ${index + 1}` });
    batch.set(db.doc(`realmGenerations/${RESET_GENERATION}/assignments/${player.uid}`), {
      ...shared,
      status: "claimed",
      sequence: index * 50,
    });
    batch.set(db.doc(`islands/${islandId(shardId)}`), {
      resetGeneration: RESET_GENERATION,
      worldId: WORLD_ID,
      realmShardId: shardId,
      regionId: "starter-west",
    });
    batch.set(db.doc(`islands/${islandId(shardId)}/cities/city_${index + 1}`), {
      ...shared,
      ownerUid: player.uid,
      ownerKind: "player",
    });
    batch.set(db.doc(`realmEvents/${storageId(shardId)}/activity/event_${index + 1}`), {
      resetGeneration: RESET_GENERATION,
      worldId: WORLD_ID,
      realmShardId: shardId,
      eventType: "STRONGHOLD_CAPTURED",
      occurredAtMs: nowMs + index,
    });
    batch.set(db.doc(`leaderboards/${storageId(shardId)}/entries/${player.uid}`), {
      ...shared,
      kingPower: 100 + index,
    });
    batch.set(db.doc(`clanLeaderboards/${storageId(shardId)}/entries/clan_${index + 1}`), {
      ...shared,
      clanId: `clan_${index + 1}`,
      name: `Shard Clan ${index + 1}`,
      tag: `S${index + 1}`,
      memberCount: 1,
      totalKingPower: 100 + index,
    });
  });
  await batch.commit();

  const clanLeaderboardResponse = await clientRunQuery(
    playerOne.token,
    `clanLeaderboards/${storageId(SHARD_ONE)}`,
    {
      from: [{ collectionId: "entries" }],
      orderBy: [{
        field: { fieldPath: "totalKingPower" },
        direction: "DESCENDING",
      }],
      limit: 100,
    }
  );
  assert(
    clanLeaderboardResponse.status === 200,
    `A player could not list their shard clan leaderboard (expected 200, received ${clanLeaderboardResponse.status})`
  );
  const clanLeaderboardRows = await clanLeaderboardResponse.json();
  const clanLeaderboardNames = clanLeaderboardRows
    .map(row => row.document?.name || "")
    .filter(Boolean);
  assert(
    clanLeaderboardNames.length === 1 && clanLeaderboardNames[0].endsWith("/entries/clan_1"),
    "A clan leaderboard query returned entries outside the player's realm shard."
  );
  const otherShardClanLeaderboardResponse = await clientRunQuery(
    playerOne.token,
    `clanLeaderboards/${storageId(SHARD_TWO)}`,
    {
      from: [{ collectionId: "entries" }],
      orderBy: [{
        field: { fieldPath: "totalKingPower" },
        direction: "DESCENDING",
      }],
      limit: 100,
    }
  );
  assert(
    otherShardClanLeaderboardResponse.status === 403,
    `A player listed another shard's clan leaderboard (expected 403, received ${otherShardClanLeaderboardResponse.status})`
  );

  await expectStatus(playerOne.token, `islands/${islandId(SHARD_ONE)}`, 200, "A player could not read their shard island");
  await expectStatus(playerOne.token, `islands/${islandId(SHARD_TWO)}`, 403, "A player read another shard island");
  await expectStatus(playerOne.token, `realmEvents/${storageId(SHARD_ONE)}/activity/event_1`, 200, "A player could not read their shard activity");
  await expectStatus(playerOne.token, `realmEvents/${storageId(SHARD_TWO)}/activity/event_2`, 403, "A player read another shard activity");
  await expectStatus(playerOne.token, `leaderboards/${storageId(SHARD_ONE)}/entries/${playerOne.uid}`, 200, "A player could not read their shard leaderboard");
  await expectStatus(playerOne.token, `leaderboards/${storageId(SHARD_TWO)}/entries/${playerTwo.uid}`, 403, "A player read another shard leaderboard");
  await expectStatus(playerOne.token, `realmGenerations/${RESET_GENERATION}/assignments/${playerOne.uid}`, 200, "A player could not read their own shard assignment");
  await expectStatus(playerOne.token, `realmGenerations/${RESET_GENERATION}/assignments/${playerTwo.uid}`, 403, "A player read another assignment");
  await expectStatus(playerTwo.token, `islands/${islandId(SHARD_TWO)}/cities/city_2`, 200, "The second shard could not read its own city");
  await expectStatus(playerTwo.token, `islands/${islandId(SHARD_ONE)}/cities/city_1`, 403, "The second shard read the first shard city");

  console.log("Realm shard rules passed: islands, activity, player and clan leaderboards, and assignments remain isolated between shards.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
