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

function islandId(shardId, regionId = "starter-west") {
  return `${WORLD_ID}--${shardId}--${regionId}`;
}

async function clientGet(token, documentPath) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return response;
}

async function clientRunQuery(token, parentPath, structuredQuery) {
  const parentSuffix = parentPath ? `/${parentPath}` : "";
  return fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents${parentSuffix}:runQuery`,
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

function ownedCityRosterQuery(uid, shardId = "") {
  const filters = [
    ["ownerUid", uid],
    ["resetGeneration", RESET_GENERATION],
    ["worldId", WORLD_ID],
  ];
  if (shardId) filters.push(["realmShardId", shardId]);
  return {
    from: [{ collectionId: "cities", allDescendants: true }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: filters.map(([fieldPath, value]) => ({
          fieldFilter: {
            field: { fieldPath },
            op: "EQUAL",
            value: { stringValue: value },
          },
        })),
      },
    },
  };
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
    mode: "monthly-shared",
    monthKey: "2026-09",
    sharedRealmId: SHARD_ONE,
    startingCityCapacity: 363,
  });

  batch.set(db.doc(`islands/${islandId(SHARD_ONE)}`), {
    resetGeneration: RESET_GENERATION,
    worldId: WORLD_ID,
    realmShardId: SHARD_ONE,
    regionId: "starter-west",
  });
  [playerOne, playerTwo].forEach((player, index) => {
    const shared = {
      uid: player.uid,
      resetGeneration: RESET_GENERATION,
      worldId: WORLD_ID,
      realmShardId: SHARD_ONE,
    };
    batch.set(db.doc(`players/${player.uid}`), { ...shared, playerName: `Realm Tester ${index + 1}` });
    batch.set(db.doc(`realmGenerations/${RESET_GENERATION}/assignments/${player.uid}`), {
      ...shared,
      status: "claimed",
      sequence: index,
    });
    batch.set(db.doc(`islands/${islandId(SHARD_ONE)}/cities/city_${index + 1}`), {
      ...shared,
      ownerUid: player.uid,
      ownerKind: "player",
    });
    batch.set(db.doc(`realmEvents/${storageId(SHARD_ONE)}/activity/event_${index + 1}`), {
      resetGeneration: RESET_GENERATION,
      worldId: WORLD_ID,
      realmShardId: SHARD_ONE,
      eventType: "STRONGHOLD_CAPTURED",
      occurredAtMs: nowMs + index,
    });
    batch.set(db.doc(`leaderboards/${storageId(SHARD_ONE)}/entries/${player.uid}`), {
      ...shared,
      kingPower: 100 + index,
    });
    batch.set(db.doc(`clanLeaderboards/${storageId(SHARD_ONE)}/entries/clan_${index + 1}`), {
      ...shared,
      clanId: `clan_${index + 1}`,
      name: `Realm Clan ${index + 1}`,
      tag: `S${index + 1}`,
      memberCount: 1,
      totalKingPower: 100 + index,
    });
  });
  ["relic-vale", "southfields"].forEach((regionId, index) => {
    const shared = {
      uid: playerOne.uid,
      resetGeneration: RESET_GENERATION,
      worldId: WORLD_ID,
      realmShardId: SHARD_ONE,
    };
    batch.set(db.doc(`islands/${islandId(SHARD_ONE, regionId)}`), {
      resetGeneration: RESET_GENERATION,
      worldId: WORLD_ID,
      realmShardId: SHARD_ONE,
      regionId,
    });
    batch.set(db.doc(`islands/${islandId(SHARD_ONE, regionId)}/cities/city_${index + 3}`), {
      ...shared,
      ownerUid: playerOne.uid,
      ownerKind: "player",
      regionId: index === 0 ? "stale-wrong-region" : regionId,
    });
  });
  batch.set(db.doc(`islands/${islandId(SHARD_TWO)}`), {
    resetGeneration: RESET_GENERATION,
    worldId: WORLD_ID,
    realmShardId: SHARD_TWO,
    regionId: "starter-west",
  });
  batch.set(db.doc(`islands/${islandId(SHARD_TWO)}/cities/rogue_city`), {
    resetGeneration: RESET_GENERATION,
    worldId: WORLD_ID,
    realmShardId: SHARD_TWO,
    ownerUid: "rogue-player",
    ownerKind: "player",
  });
  batch.set(db.doc(`realmEvents/${storageId(SHARD_TWO)}/activity/rogue_event`), {
    resetGeneration: RESET_GENERATION,
    worldId: WORLD_ID,
    realmShardId: SHARD_TWO,
    eventType: "ROGUE_PARTITION_EVENT",
    occurredAtMs: nowMs + 10,
  });
  batch.set(db.doc(`leaderboards/${storageId(SHARD_TWO)}/entries/rogue-player`), {
    resetGeneration: RESET_GENERATION,
    worldId: WORLD_ID,
    realmShardId: SHARD_TWO,
    uid: "rogue-player",
    kingPower: 999,
  });
  await batch.commit();

  const ownedCityRosterResponse = await clientRunQuery(
    playerOne.token,
    "",
    ownedCityRosterQuery(playerOne.uid, SHARD_ONE)
  );
  const ownedCityRows = await ownedCityRosterResponse.json();
  assert(
    ownedCityRosterResponse.status === 200,
    `A player could not list their complete shared-realm city roster (expected 200, received ${ownedCityRosterResponse.status}: ${JSON.stringify(ownedCityRows)})`
  );
  const ownedCityNames = ownedCityRows
    .map(row => row.document?.name || "")
    .filter(Boolean)
    .sort();
  assert(ownedCityNames.length === 3, `The shared-realm roster returned ${ownedCityNames.length} cities instead of 3.`);
  assert(new Set(ownedCityNames).size === 3, "The shared-realm roster returned a city more than once.");
  assert(
    ownedCityNames.every(name => name.includes(`--${SHARD_ONE}--`)),
    "The owned-city roster returned a city outside the canonical shared-realm partition."
  );
  assert(
    ownedCityNames.some(name => name.includes(`--${SHARD_ONE}--relic-vale/cities/city_3`)),
    "The roster did not preserve the city document's canonical island path when stored region metadata was stale."
  );

  const unscopedOwnedCityRosterResponse = await clientRunQuery(
    playerOne.token,
    "",
    ownedCityRosterQuery(playerOne.uid)
  );
  assert(
    unscopedOwnedCityRosterResponse.status === 403,
    `An owned-city collection-group query omitted its realm shard and was not denied (expected 403, received ${unscopedOwnedCityRosterResponse.status})`
  );
  const otherShardOwnedCityRosterResponse = await clientRunQuery(
    playerOne.token,
    "",
    ownedCityRosterQuery(playerOne.uid, SHARD_TWO)
  );
  assert(
    otherShardOwnedCityRosterResponse.status === 403,
    `A player queried a noncanonical realm partition (expected 403, received ${otherShardOwnedCityRosterResponse.status})`
  );

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
    `A player could not list the shared clan leaderboard (expected 200, received ${clanLeaderboardResponse.status})`
  );
  const clanLeaderboardRows = await clanLeaderboardResponse.json();
  const clanLeaderboardNames = clanLeaderboardRows
    .map(row => row.document?.name || "")
    .filter(Boolean);
  assert(
    clanLeaderboardNames.length === 2
      && clanLeaderboardNames.some(name => name.endsWith("/entries/clan_1"))
      && clanLeaderboardNames.some(name => name.endsWith("/entries/clan_2")),
    "The shared clan leaderboard did not expose both players' realm entries."
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
    `A player listed a noncanonical partition's clan leaderboard (expected 403, received ${otherShardClanLeaderboardResponse.status})`
  );

  await expectStatus(playerOne.token, `islands/${islandId(SHARD_ONE)}`, 200, "A player could not read the shared realm island");
  await expectStatus(playerOne.token, `islands/${islandId(SHARD_ONE)}/cities/city_2`, 200, "A player could not read another player's city in the shared realm");
  await expectStatus(playerOne.token, `islands/${islandId(SHARD_TWO)}`, 403, "A player read a noncanonical realm partition");
  await expectStatus(playerOne.token, `realmEvents/${storageId(SHARD_ONE)}/activity/event_1`, 200, "A player could not read shared realm activity");
  await expectStatus(playerOne.token, `realmEvents/${storageId(SHARD_ONE)}/activity/event_2`, 200, "A player could not read another player's shared realm activity");
  await expectStatus(playerOne.token, `realmEvents/${storageId(SHARD_TWO)}/activity/rogue_event`, 403, "A player read noncanonical realm activity");
  await expectStatus(playerOne.token, `leaderboards/${storageId(SHARD_ONE)}/entries/${playerOne.uid}`, 200, "A player could not read the shared leaderboard");
  await expectStatus(playerOne.token, `leaderboards/${storageId(SHARD_ONE)}/entries/${playerTwo.uid}`, 200, "A player could not read another player's shared leaderboard entry");
  await expectStatus(playerOne.token, `leaderboards/${storageId(SHARD_TWO)}/entries/rogue-player`, 403, "A player read a noncanonical partition leaderboard");
  await expectStatus(playerOne.token, `realmGenerations/${RESET_GENERATION}/assignments/${playerOne.uid}`, 200, "A player could not read their own realm assignment");
  await expectStatus(playerOne.token, `realmGenerations/${RESET_GENERATION}/assignments/${playerTwo.uid}`, 403, "A player read another assignment");
  await expectStatus(playerTwo.token, `islands/${islandId(SHARD_ONE)}/cities/city_2`, 200, "The second player could not read their city");
  await expectStatus(playerTwo.token, `islands/${islandId(SHARD_ONE)}/cities/city_1`, 200, "The second player could not read the first player's city");

  console.log("Shared-realm rules passed: players can interact through one canonical realm while noncanonical partitions and private assignments remain isolated.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
