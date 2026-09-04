"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const releaseConfig = require("../release-config.json");
const topology = require("../coreExpansionTopology.js");
const catalog = require("../core-expansion-region-catalog.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
const root = path.resolve(__dirname, "..", "..");

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
  if (process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST) {
    return process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST;
  }
  const response = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`);
  if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
  const functions = (await response.json())?.functions || {};
  const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
  return formatEmulatorHost(functions.host || listen?.address, Number(functions.port || listen?.port));
}

async function authRequest(action, payload) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator ${action} failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken, email: body.email };
}

async function callFunction(name, token, data = {}) {
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
        clientReleaseId: data.clientReleaseId || releaseConfig.releaseId,
        clientResetGeneration: data.clientResetGeneration || releaseConfig.resetGeneration,
        clientWorldId: data.clientWorldId || releaseConfig.worldId,
        clientRealmShardId: data.clientRealmShardId || "legacy",
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

async function clientDocumentRequest(documentPath, token, options = {}) {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const encodedPath = documentPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${encodedPath}${options.query || ""}`, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function main() {
  const email = "first-time-onboarding@example.test";
  const password = "First-Time-Onboarding-Pass!";
  const firstSession = await authRequest("signUp", { email, password });
  assert(firstSession.uid && firstSession.token, "New-account authentication did not return an identity and token.");

  const realm = await callFunction("getRealmInfo", firstSession.token);
  assert(realm.worldTopology === topology.TOPOLOGY_VERSION, "Onboarding did not enter the Layer 1 topology.");
  assert(realm.realmMode === "monthly-shared" && realm.sharedRealmId === "shard_0001",
    "Onboarding did not resolve the shared current realm.");
  assert(realm.resetReadinessStatus === "ready", "Onboarding exposed a realm before reset preparation completed.");
  const identity = {
    releaseId: realm.currentReleaseId,
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
    realmShardId: realm.sharedRealmId,
  };
  const clientIdentity = {
    clientReleaseId: identity.releaseId,
    clientResetGeneration: identity.resetGeneration,
    clientWorldId: identity.worldId,
    clientRealmShardId: identity.realmShardId,
  };
  const join = await callFunction("joinGameServer", firstSession.token, {
    serverId: "crown-marches",
    sessionId: "onboarding-session-1",
    displayName: "Onboarding Ruler",
    ...clientIdentity,
  });
  assert(join.status === "active" && join.realmShardId === identity.realmShardId,
    "The authenticated player could not join the active realm.");

  const claim = await callFunction("claimStartingCity", firstSession.token, {
    playerName: "Onboarding Ruler",
    ...clientIdentity,
  });
  assert(claim.ok && claim.alreadyClaimed === false, "The new player did not receive exactly one fresh starting city.");
  assert(topology.parseNewLandsRegionId(claim.mainRegionId)?.worldLayer === 1,
    "The starting city was not assigned to Layer 1.");
  const activeRegions = new Set(realm.coreExpansion?.activeRegionIds || []);
  const admittingRegions = new Set(realm.coreExpansion?.admittingRegionIds || []);
  assert(activeRegions.has(claim.mainRegionId) && admittingRegions.has(claim.mainRegionId),
    "The starting map was not active and admitting when claimed.");
  assert(Number(claim.currentUser?.gold) === 100, "The new profile did not receive exactly 100 starting Gold.");

  const profileRef = db.doc(`players/${firstSession.uid}`);
  const cityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const statsRef = db.doc(`players/${firstSession.uid}/stats/global`);
  const membershipRef = db.doc(`players/${firstSession.uid}/serverMembership/current`);
  const assignmentRef = db.doc(`realmGenerations/${identity.resetGeneration}/assignments/${firstSession.uid}`);
  const leaderboardRef = db.doc(`leaderboards/${identity.resetGeneration}--${identity.realmShardId}/entries/${firstSession.uid}`);
  const [profileSnap, citySnap, statsSnap, membershipSnap, assignmentSnap, leaderboardSnap] = await Promise.all([
    profileRef.get(), cityRef.get(), statsRef.get(), membershipRef.get(), assignmentRef.get(), leaderboardRef.get(),
  ]);
  assert(profileSnap.exists && citySnap.exists && statsSnap.exists && membershipSnap.exists
    && assignmentSnap.exists && leaderboardSnap.exists, "Onboarding omitted a required player/profile record.");
  const profile = profileSnap.data() || {};
  const city = citySnap.data() || {};
  assert(profile.mainCityId === claim.cityId && profile.mainIslandId === claim.islandId
    && profile.mainRegionId === claim.mainRegionId, "The player profile and starting-city assignment disagree.");
  assert(profile.worldId === identity.worldId && profile.resetGeneration === identity.resetGeneration
    && profile.realmShardId === identity.realmShardId, "The new profile has a stale realm identity.");
  assert(city.ownerUid === firstSession.uid && city.ownerKind === "player" && city.isMainCity === true,
    "The starting city ownership record is invalid.");
  assert(Number(city.level) === 1 && Number(city.troops) === 200 && Number(city.troopFloat) === 200,
    "The starting city does not have Level 1 and exactly 200 starting troops.");
  assert(Number.isFinite(Number(city.x)) && Number.isFinite(Number(city.y)), "The starting map position is invalid.");
  assert(Number(statsSnap.data()?.totalCities) === 1, "The new player's global stats do not show one owned city.");

  const mapSummary = catalog.regions.find(region => region.id === claim.mainRegionId);
  assert(mapSummary, "The assigned starting map is absent from the loading manifest.");
  for (const relativePath of [mapSummary.mapAsset, mapSummary.thumbnailAsset, mapSummary.regionDefinitionPath]) {
    assert(fs.existsSync(path.join(root, relativePath)), `The assigned starting map asset is missing: ${relativePath}`);
  }
  const mapBytes = fs.readFileSync(path.join(root, mapSummary.mapAsset));
  assert(mapBytes.subarray(0, 4).toString("ascii") === "RIFF" && mapBytes.subarray(8, 12).toString("ascii") === "WEBP",
    "The assigned Layer 1 map image is not a valid WebP asset.");
  const regionDefinition = JSON.parse(fs.readFileSync(path.join(root, mapSummary.regionDefinitionPath), "utf8"));
  assert(regionDefinition.id === claim.mainRegionId && regionDefinition.cities?.length === 40,
    "The assigned Layer 1 region definition is invalid.");

  const profileRead = await clientDocumentRequest(`players/${firstSession.uid}`, firstSession.token);
  const cityRead = await clientDocumentRequest(`islands/${claim.islandId}/cities/${claim.cityId}`, firstSession.token);
  assert(profileRead.ok && cityRead.ok, "Firebase rules blocked required player or map reads after onboarding.");
  const forbiddenCityWrite = await clientDocumentRequest(
    `islands/${claim.islandId}/cities/${claim.cityId}`,
    firstSession.token,
    {
      method: "PATCH",
      query: "?updateMask.fieldPaths=troops",
      body: { fields: { troops: { integerValue: "999999999" } } },
    },
  );
  assert(!forbiddenCityWrite.ok, "Firebase rules allowed a client to overwrite authoritative city troops.");

  const refreshedRealm = await callFunction("getRealmInfo", firstSession.token, clientIdentity);
  assert(refreshedRealm.worldId === identity.worldId && refreshedRealm.resetGeneration === identity.resetGeneration,
    "A refresh resolved a different world or generation.");

  // Dropping the first token models logout. A password sign-in provides a new authenticated session
  // in the emulator while the production UI's popup/redirect behavior is covered by static browser tests.
  const secondSession = await authRequest("signInWithPassword", { email, password });
  assert(secondSession.uid === firstSession.uid && secondSession.token !== firstSession.token,
    "Logout/login did not restore the same account in a fresh session.");
  const rejoin = await callFunction("joinGameServer", secondSession.token, {
    serverId: "crown-marches",
    sessionId: "onboarding-session-2",
    displayName: "Onboarding Ruler",
    ...clientIdentity,
  });
  assert(rejoin.status === "active", "The returning authenticated player could not rejoin.");
  const replay = await callFunction("claimStartingCity", secondSession.token, {
    playerName: "Onboarding Ruler",
    ...clientIdentity,
  });
  assert(replay.ok && replay.alreadyClaimed === true && replay.cityId === claim.cityId
    && replay.islandId === claim.islandId, "Login replay created or selected another starting city.");
  const ownedCities = (await db.doc(`islands/${claim.islandId}`).collection("cities")
    .where("ownerUid", "==", firstSession.uid).get()).docs;
  assert(ownedCities.length === 1 && ownedCities[0].id === claim.cityId,
    "Refresh/logout/login duplicated or lost the player's city ownership.");
  const persistedCity = (await cityRef.get()).data() || {};
  assert(Number(persistedCity.troops) === 200, "The rejected client write altered saved troop progress.");

  // Exercise a genuine cross-map march after making the complete first ring active in the
  // isolated emulator. The client-supplied geometry and duration are deliberately false;
  // the server must replace both with its canonical route and calculated travel time.
  const expansionRef = db.doc(`realmGenerations/${identity.resetGeneration}/expansion/current`);
  const expansionSnap = await expansionRef.get();
  const completeLayer1 = topology.planFirstLayerCompletion({
    state: expansionSnap.data() || {},
    resetGeneration: identity.resetGeneration,
    readyRegionIds: topology.getFirstLayerRegionIds(),
  });
  assert(completeLayer1.changed || completeLayer1.reason === "already-complete",
    `The emulator could not activate complete Layer 1: ${completeLayer1.reason}.`);
  if (completeLayer1.changed) {
    await expansionRef.set({
      ...completeLayer1.state,
      worldId: identity.worldId,
      realmShardId: identity.realmShardId,
      updatedAtMs: Date.now(),
    }, { merge: true });
  }

  const targetRegionId = "new-lands-l01-p013";
  const targetIsland = await callFunction("ensureMainIsland", secondSession.token, {
    regionId: targetRegionId,
    ...clientIdentity,
  });
  const targetCities = await db.collection(`islands/${targetIsland.islandId}/cities`).limit(1).get();
  assert(targetCities.size === 1, "The multi-map destination did not seed a canonical city.");
  const targetCityRef = targetCities.docs[0].ref;
  const targetCityId = targetCities.docs[0].id;
  await targetCityRef.set({
    owner: "player",
    ownerKind: "player",
    ownerUid: firstSession.uid,
    ownerName: "Onboarding Ruler",
    isMainCity: false,
    troops: 50,
    troopFloat: 50,
    productionUpdatedAtMs: Date.now(),
    worldId: identity.worldId,
    resetGeneration: identity.resetGeneration,
    realmShardId: identity.realmShardId,
    regionId: targetRegionId,
  }, { merge: true });

  const routeRequest = {
    sourceRegionId: claim.mainRegionId,
    targetRegionId,
    fromId: claim.cityId,
    toId: targetCityId,
    targetType: "city",
    kind: "transfer",
    requestedTroops: 100,
    ...clientIdentity,
  };
  const preview = await callFunction("previewArmyRoute", secondSession.token, routeRequest);
  assert(preview.kind === "transfer" && preview.routeRegionIds.length > 2,
    "The authoritative multi-map preview did not traverse intermediate maps.");
  assert(preview.durationMs > 30 * 60 * 1000,
    "The end-to-end multi-map preview was still capped at 30 minutes.");

  const armyId = `onboarding_long_march_${crypto.randomBytes(6).toString("hex")}`;
  const launch = await callFunction("sendArmyOrder", secondSession.token, {
    ...routeRequest,
    routeRegionIds: [claim.mainRegionId, targetRegionId],
    path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    pathLength: 1,
    army: {
      id: armyId,
      kind: "transfer",
      targetType: "city",
      fromId: claim.cityId,
      toId: targetCityId,
      troops: 100,
      requestedTroops: 100,
      total: 0.1,
      sourceRegionId: claim.mainRegionId,
      targetRegionId,
      routeRegionIds: [claim.mainRegionId, targetRegionId],
      path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      pathLength: 1,
    },
  });
  const movement = launch.movement || {};
  assert(movement.id === armyId && movement.kind === "transfer", "The multi-map troop march did not launch.");
  assert(movement.routeRegionIds.length > 2 && movement.pathLength > 1,
    "The server accepted manipulated client route geometry.");
  assert(Math.ceil(Number(movement.total) * 1000) === preview.durationMs,
    "The route preview and authoritative launch duration disagree.");
  assert(movement.arrivesAtMs === movement.launchedAtMs + preview.durationMs,
    "The UI ETA and server arrival timestamp disagree.");
  assert(movement.arrivesAtMs > movement.launchedAtMs + 30 * 60 * 1000,
    "The authoritative launch arrival remained capped at 30 minutes.");
  assert(Number.isSafeInteger(movement.arrivesAtMs) && movement.arrivesAtMs > 0,
    "The long-distance arrival timestamp overflowed or became negative.");

  // Advance only the isolated test movement to its arrival boundary, then exercise the real
  // settlement endpoint so the regression covers launch, persistence, and arrival processing.
  await db.doc(`armies/${armyId}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
  const resolution = await callFunction("resolveArmyOrder", secondSession.token, {
    armyId,
    regionIds: movement.routeRegionIds,
    ...clientIdentity,
  });
  assert(resolution.status === "resolved" && resolution.kind === "transfer",
    "The multi-map troop march did not complete through authoritative arrival processing.");
  const arrivedTarget = (await targetCityRef.get()).data() || {};
  assert(Number(arrivedTarget.troops) >= 150,
    "The completed multi-map transfer did not deliver its troops to the destination.");

  console.log(
    `First-time onboarding passed: auth create/login, required records, Layer 1 ${claim.mainRegionId}, `
    + "100 Gold, Level-1 city with 200 troops, rules, refresh, logout/login, idempotent recovery, "
    + `and an uncapped ${Math.round(preview.durationMs / 1000)}s cross-map march.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
