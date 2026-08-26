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

const starterRegionIds = (worldLayout.maps || [])
  .filter(map => String(map?.type || "").toLowerCase() === "starter")
  .map(map => String(map.id || ""))
  .filter(Boolean);
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
  return {
    ok: response.ok && !body.error,
    result: body.result || null,
    error: body.error || null,
  };
}

async function callFunction(name, token, data = {}) {
  const response = await invokeFunction(name, token, data);
  if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

function islandId(regionId) {
  return `${realm.worldId}-${regionId}`;
}

async function seedStarterIslands(token) {
  await Promise.all(starterRegionIds.map(regionId => callFunction("ensureMainIsland", token, {
    islandId: islandId(regionId),
    regionId,
  })));
}

async function setStarterRegionState(regionId, { playerCount, exhausted }) {
  const id = islandId(regionId);
  const snapshot = await db.collection(`islands/${id}/cities`).get();
  assert(snapshot.size > 0, `${regionId} was not seeded.`);
  const batch = db.batch();
  snapshot.docs.forEach((citySnapshot, index) => {
    batch.set(citySnapshot.ref, exhausted ? {
      ownerKind: "player",
      ownerUid: `fixture-owner-${regionId}-${index}`,
      ownerName: `Fixture ${regionId}`,
      isMainCity: false,
    } : {
      ownerKind: "neutral",
      ownerUid: "",
      ownerName: "",
      ownerFlag: null,
      isMainCity: false,
    }, { merge: true });
  });
  batch.set(db.doc(`islands/${id}`), { playerCount }, { merge: true });
  await batch.commit();
  return snapshot.size;
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
  assert(starterRegionIds.length >= 5, "The fallback gate requires the five configured starter regions.");
  const [seedUser, firstUser, secondUser, exhaustedUser] = await Promise.all([
    createAuthUser("seed"),
    createAuthUser("first"),
    createAuthUser("second"),
    createAuthUser("exhausted"),
  ]);
  await seedStarterIslands(seedUser.token);

  const [region11, region12, region13, region14, region15] = starterRegionIds;
  await Promise.all([
    setStarterRegionState(region11, { playerCount: 1, exhausted: false }),
    setStarterRegionState(region12, { playerCount: 2, exhausted: false }),
    setStarterRegionState(region13, { playerCount: 2, exhausted: false }),
    setStarterRegionState(region14, { playerCount: 0, exhausted: true }),
    setStarterRegionState(region15, { playerCount: 1, exhausted: true }),
  ]);
  const countsBefore = Object.fromEntries(await Promise.all(starterRegionIds.map(async regionId => (
    [regionId, await getPlayerCount(regionId)]
  ))));

  const [firstClaim, secondClaim] = await Promise.all([
    callFunction("claimStartingCity", firstUser.token, { playerName: "Fallback First" }),
    callFunction("claimStartingCity", secondUser.token, { playerName: "Fallback Second" }),
  ]);
  assert(firstClaim.cityId && secondClaim.cityId, "Fallback claims did not return starting cities.");
  assert(firstClaim.cityId !== secondClaim.cityId, "Concurrent fallback claims collided on one city.");
  assert(claimRegionId(firstClaim) !== region14 && claimRegionId(firstClaim) !== region15, "First claim used an exhausted region.");
  assert(claimRegionId(secondClaim) !== region14 && claimRegionId(secondClaim) !== region15, "Second claim used an exhausted region.");

  const countsAfter = Object.fromEntries(await Promise.all(starterRegionIds.map(async regionId => (
    [regionId, await getPlayerCount(regionId)]
  ))));
  assert(countsAfter[region14] === countsBefore[region14], "The least-populated exhausted region changed playerCount.");
  assert(countsAfter[region15] === countsBefore[region15], "The second exhausted region changed playerCount.");
  for (const regionId of starterRegionIds) {
    const expectedClaims = [firstClaim, secondClaim].filter(claim => claimRegionId(claim) === regionId).length;
    assert(
      countsAfter[regionId] === countsBefore[regionId] + expectedClaims,
      `${regionId} playerCount did not increment exactly once per successful fallback claim.`
    );
  }
  await assertNoReservedSlotsFor([firstUser.uid, secondUser.uid], "Successful fallback");

  const replay = await callFunction("claimStartingCity", firstUser.token, { playerName: "Fallback Replay" });
  assert(replay.alreadyClaimed === true && replay.cityId === firstClaim.cityId, "A replay changed the fallback city.");
  await assertNoReservedSlotsFor([firstUser.uid], "Fallback replay");

  await Promise.all(starterRegionIds.map((regionId, index) => setStarterRegionState(regionId, {
    playerCount: 10 + index,
    exhausted: true,
  })));
  const exhaustedClaim = await invokeFunction("claimStartingCity", exhaustedUser.token, {
    playerName: "No City Available",
  });
  assert(
    !exhaustedClaim.ok
      && exhaustedClaim.error?.status === "RESOURCE_EXHAUSTED"
      && exhaustedClaim.error?.details?.reason === "starter-realm-exhausted",
    `All-region exhaustion did not return the explicit error: ${JSON.stringify(exhaustedClaim.error)}`
  );
  assert(!(await db.doc(`players/${exhaustedUser.uid}`).get()).exists, "An exhausted claim created a player profile.");
  await assertNoReservedSlotsFor([exhaustedUser.uid], "All-region exhaustion");

  console.log("Starter-city fallback passed: exhausted low-population regions were skipped without claim collisions or reservation leaks.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
