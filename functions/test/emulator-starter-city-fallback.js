"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const realm = require("../release-config.json");
const worldLayout = require("../world-layout.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const mapsById = new Map((worldLayout.maps || []).map(map => [String(map.id || ""), map]));
const spawnRegionIds = (worldLayout.maps || [])
  .filter(map => typeof map?.newPlayerSpawnEligible === "boolean"
    ? map.newPlayerSpawnEligible
    : String(map?.type || "").toLowerCase() === "starter")
  .map(map => String(map.id || ""))
  .filter(Boolean);
const southernSpawnRegionIds = ["region_16", "region_17", "region_19", "region_21", "region_22"];
const regularCityIdsByRegion = new Map(spawnRegionIds.map(regionId => [
  regionId,
  new Set((mapsById.get(regionId)?.cities || []).map(city => String(city.id || ""))),
]));
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const normalizedHost = String(host || "127.0.0.1").trim();
  const formattedHost = normalizedHost.includes(":") && !normalizedHost.startsWith("[")
    ? `[${normalizedHost}]`
    : normalizedHost;
  return `${formattedHost}:${port}`;
}

async function resolveFunctionsHost() {
  if (configuredFunctionsHost) return configuredFunctionsHost;
  if (!functionsHostPromise) {
    functionsHostPromise = (async () => {
      const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "").trim();
      if (!hubHost) return "127.0.0.1:5001";
      const response = await fetch(`http://${hubHost}/emulators`);
      if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
      const functions = (await response.json())?.functions || {};
      const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
      const host = functions.host || listen?.address;
      const port = Number(functions.port || listen?.port);
      if (!host || !Number.isInteger(port) || port < 1) {
        throw new Error("Firebase Emulator Hub did not report a running Functions emulator.");
      }
      return formatEmulatorHost(host, port);
    })();
  }
  return functionsHostPromise;
}

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `starter-fallback-${label}-${nonce}@example.test`,
      password: `StarterFallback-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function invokeFunction(name, token, data = {}) {
  const functionsHost = await resolveFunctionsHost();
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
        clientRealmShardId: "legacy",
      },
    }),
  });
  const body = await response.json();
  return { ok: response.ok && !body.error, result: body.result || null, error: body.error || null };
}

async function callFunction(name, token, data = {}) {
  const response = await invokeFunction(name, token, data);
  if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

function islandId(regionId) {
  return `${realm.worldId}-${regionId}`;
}

async function seedSpawnIslands(token) {
  await Promise.all(spawnRegionIds.map(regionId => callFunction("ensureMainIsland", token, {
    islandId: islandId(regionId),
    regionId,
  })));
}

async function setSpawnRegionState(regionId, { playerCount, neutralCount }) {
  const id = islandId(regionId);
  const snapshot = await db.collection(`islands/${id}/cities`).get();
  const regularCityIds = regularCityIdsByRegion.get(regionId) || new Set();
  const regularCityDocs = snapshot.docs.filter(citySnapshot => regularCityIds.has(citySnapshot.id));
  assert(regularCityDocs.length > 0, `${regionId} was not seeded with ordinary cities.`);
  const safeNeutralCount = Math.max(0, Math.min(regularCityDocs.length, Math.floor(Number(neutralCount) || 0)));
  const batch = db.batch();
  regularCityDocs.forEach((citySnapshot, index) => {
    batch.set(citySnapshot.ref, index < safeNeutralCount ? {
      ownerKind: "neutral",
      ownerUid: null,
      ownerName: "",
      ownerFlag: null,
      isMainCity: false,
    } : {
      ownerKind: "player",
      ownerUid: `fixture-owner-${regionId}-${index}`,
      ownerName: `Fixture ${regionId}`,
      isMainCity: false,
    }, { merge: true });
  });
  batch.set(db.doc(`islands/${id}`), { playerCount }, { merge: true });
  await batch.commit();
  return regularCityDocs.length;
}

async function setAllSpawnStates(overrides = {}) {
  const slotSnapshot = await db.collection(`realmSeeds/${realm.resetGeneration}/startingSlots`).get();
  if (!slotSnapshot.empty) {
    const cleanup = db.batch();
    slotSnapshot.docs.forEach(doc => cleanup.delete(doc.ref));
    await cleanup.commit();
  }
  await Promise.all(spawnRegionIds.map((regionId, index) => setSpawnRegionState(regionId, {
    playerCount: 100 + index,
    neutralCount: 0,
    ...(overrides[regionId] || {}),
  })));
}

async function getPlayerCount(regionId) {
  const snapshot = await db.doc(`islands/${islandId(regionId)}`).get();
  return Number(snapshot.data()?.playerCount || 0);
}

function claimRegionId(claim = {}) {
  return String(claim.mainRegionId || claim.currentUser?.mainRegionId || "");
}

async function assertNoReservedSlotsFor(userIds, label) {
  const snapshot = await db.collection(`realmSeeds/${realm.resetGeneration}/startingSlots`).get();
  const leaked = snapshot.docs.filter(doc => {
    const slot = doc.data() || {};
    return slot.status === "reserved" && userIds.includes(String(slot.claimedByUid || ""));
  });
  assert(!leaked.length, `${label} leaked starting-slot reservations: ${leaked.map(doc => doc.id).join(", ")}`);
}

async function main() {
  assert(spawnRegionIds.length === 10, `Expected 10 designated spawn maps, found ${spawnRegionIds.length}.`);
  assert(southernSpawnRegionIds.every(regionId => spawnRegionIds.includes(regionId)), "A southern map is not spawn eligible.");
  southernSpawnRegionIds.forEach(regionId => {
    const map = mapsById.get(regionId);
    assert(map?.type === "midgame", `${regionId} lost its midgame progression type.`);
    assert(map?.newPlayerSpawnEligible === true, `${regionId} lacks explicit spawn eligibility.`);
    assert((map.cities || []).every(city => Number(city.level) === 1), `${regionId} contains a non-level-1 seed city.`);
  });

  const users = await Promise.all([
    createAuthUser("seed"),
    ...southernSpawnRegionIds.map(regionId => createAuthUser(`south-${regionId}`)),
    createAuthUser("preferred"),
    createAuthUser("fallback"),
    createAuthUser("concurrent-a"),
    createAuthUser("concurrent-b"),
    createAuthUser("exhausted"),
  ]);
  const [seedUser, ...claimUsers] = users;
  await seedSpawnIslands(seedUser.token);

  for (let index = 0; index < southernSpawnRegionIds.length; index += 1) {
    const targetRegionId = southernSpawnRegionIds[index];
    const overrides = Object.fromEntries(spawnRegionIds.map((regionId, regionIndex) => [regionId, {
      playerCount: regionId === targetRegionId ? 0 : 50 + regionIndex,
      neutralCount: Number.MAX_SAFE_INTEGER,
    }]));
    await setAllSpawnStates(overrides);
    const claim = await callFunction("claimStartingCity", claimUsers[index].token, {
      playerName: `Southern ${targetRegionId}`,
    });
    assert(claimRegionId(claim) === targetRegionId, `${targetRegionId} was not selected when it was the balanced choice.`);
    await assertNoReservedSlotsFor([claimUsers[index].uid], `${targetRegionId} claim`);
  }

  const preferredUser = claimUsers[5];
  await setAllSpawnStates({
    region_16: { playerCount: 10, neutralCount: 10 },
    region_17: { playerCount: 0, neutralCount: 1 },
  });
  const preferredClaim = await callFunction("claimStartingCity", preferredUser.token, { playerName: "Ready-map preference" });
  assert(claimRegionId(preferredClaim) === "region_16", "A below-threshold map displaced a map with 10 neutral cities.");

  const fallbackUser = claimUsers[6];
  await setAllSpawnStates({ region_21: { playerCount: 0, neutralCount: 1 } });
  const fallbackClaim = await callFunction("claimStartingCity", fallbackUser.token, { playerName: "Last neutral fallback" });
  assert(claimRegionId(fallbackClaim) === "region_21", "A valid final neutral city was unavailable to a new player.");

  const concurrentUsers = [claimUsers[7], claimUsers[8]];
  await setAllSpawnStates({
    region_11: { playerCount: 1, neutralCount: Number.MAX_SAFE_INTEGER },
    region_12: { playerCount: 1, neutralCount: Number.MAX_SAFE_INTEGER },
  });
  const countsBefore = {
    region_11: await getPlayerCount("region_11"),
    region_12: await getPlayerCount("region_12"),
  };
  const [firstClaim, secondClaim] = await Promise.all([
    callFunction("claimStartingCity", concurrentUsers[0].token, { playerName: "Concurrent First" }),
    callFunction("claimStartingCity", concurrentUsers[1].token, { playerName: "Concurrent Second" }),
  ]);
  assert(firstClaim.cityId !== secondClaim.cityId, "Concurrent claims collided on one city.");
  assert(
    ["region_11", "region_12"].includes(claimRegionId(firstClaim))
      && ["region_11", "region_12"].includes(claimRegionId(secondClaim)),
    "Concurrent claims escaped the only available spawn maps."
  );
  for (const regionId of ["region_11", "region_12"]) {
    const expectedClaims = [firstClaim, secondClaim].filter(claim => claimRegionId(claim) === regionId).length;
    assert(
      await getPlayerCount(regionId) === countsBefore[regionId] + expectedClaims,
      `${regionId} playerCount did not increment exactly once per successful claim.`
    );
  }
  await assertNoReservedSlotsFor(concurrentUsers.map(user => user.uid), "Concurrent claims");

  const replay = await callFunction("claimStartingCity", concurrentUsers[0].token, { playerName: "Concurrent Replay" });
  assert(replay.alreadyClaimed === true && replay.cityId === firstClaim.cityId, "A replay changed the claimed city.");
  await assertNoReservedSlotsFor([concurrentUsers[0].uid], "Claim replay");

  await setAllSpawnStates({});
  const exhaustedUser = claimUsers[9];
  const exhaustedClaim = await invokeFunction("claimStartingCity", exhaustedUser.token, { playerName: "No City Available" });
  assert(
    !exhaustedClaim.ok
      && exhaustedClaim.error?.status === "RESOURCE_EXHAUSTED"
      && exhaustedClaim.error?.details?.reason === "starter-realm-exhausted",
    `All-region exhaustion did not return the explicit error: ${JSON.stringify(exhaustedClaim.error)}`
  );
  assert(!(await db.doc(`players/${exhaustedUser.uid}`).get()).exists, "An exhausted claim created a player profile.");
  await assertNoReservedSlotsFor([exhaustedUser.uid], "All-region exhaustion");

  console.log("New-player admission passed for all southern maps, readiness preference, final-city fallback, concurrency, and exhaustion.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
