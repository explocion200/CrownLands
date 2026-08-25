const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const { createAuthoritativeRoutePlanner, imagePointToWorld } = require("../authoritative-route-planner.js");
const { getAuthoritativeTerrainBlockers } = require("../authoritative-route-policy.js");
const commonGear = require("../common-gear.js");
const realm = require("../release-config.json");
const worldLayout = require("../world-layout.json");

const routePlanner = createAuthoritativeRoutePlanner(worldLayout, { getTerrainBlockers: getAuthoritativeTerrainBlockers });

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
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
      email: `rally-lifecycle-${label}-${nonce}@example.test`,
      password: `Rally-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunctionRaw(name, token, data = {}) {
  const host = await resolveFunctionsHost();
  const response = await fetch(`http://${host}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
      },
    }),
  });
  const body = await response.json();
  return { response, body };
}

async function callFunction(name, token, data = {}) {
  const call = await callFunctionRaw(name, token, data);
  if (!call.response.ok || call.body.error) {
    throw new Error(`${name} failed: ${JSON.stringify(call.body.error || call.body)}`);
  }
  return call.body.result;
}

async function waitFor(read, predicate, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await read();
    if (predicate(latest)) return latest;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${message}: ${JSON.stringify(latest)}`);
}

function objectiveRef(regionId, objectiveId) {
  return db.doc(`islands/${realm.worldId}-${regionId}/cities/${objectiveId}`);
}

function findReachableConfiguredCity(sourceClaim, excludedIds = [], strongholdType = "gold") {
  const map = worldLayout.maps.find(entry => entry.id === sourceClaim.regionId);
  const routeModel = routePlanner.getModel(sourceClaim.regionId);
  const sourceSeed = map?.cities?.find(entry => entry.id === sourceClaim.cityId);
  assert(sourceSeed && routeModel, `Missing ${sourceClaim.regionId}/${sourceClaim.cityId} in the authoritative world layout.`);
  const source = {
    ...sourceSeed,
    ...imagePointToWorld(routeModel, sourceSeed),
    regionId: sourceClaim.regionId,
  };
  const excluded = new Set(excludedIds);
  const candidates = (map.cities || [])
    .filter(entry => entry.id !== source.id && !excluded.has(entry.id))
    .sort((left, right) => (
      Math.hypot(left.x - source.x, left.y - source.y)
      - Math.hypot(right.x - source.x, right.y - source.y)
    ));
  const target = candidates
    .map(entry => ({
      ...entry,
      ...imagePointToWorld(routeModel, entry),
      regionId: sourceClaim.regionId,
      kind: "stronghold",
      strongholdType,
    }))
    .find(entry => routePlanner.calculate(source, entry));
  assert(target, `No reachable Rally test objective was found in ${sourceClaim.regionId}.`);
  return target;
}

function createEquippedAttackGear() {
  const state = commonGear.createDefaultState();
  const definition = commonGear.DEFINITIONS.find(entry => (
    entry.buildingId === "barracks" && entry.slot === "weapon"
  ));
  assert(definition, "Missing Barracks weapon gear definition.");
  const instanceId = "rally_live_attack_weapon";
  state.instances[instanceId] = {
    instanceId,
    gearKey: definition.gearKey,
    level: 5,
    acquiredAtMs: Date.now(),
  };
  state.equipped.barracks.weapon = instanceId;
  return commonGear.normalizeState(state);
}

function rallyOrder({ rallyId, sourceClaim, targetRegionId, targetId, troops }) {
  return {
    rallyId,
    sourceRegionId: sourceClaim.regionId,
    targetRegionId,
    army: {
      id: rallyId,
      kind: "attack",
      targetType: "city",
      fromId: sourceClaim.cityId,
      toId: targetId,
      troops,
      requestedTroops: troops,
      sourceRegionId: sourceClaim.regionId,
      targetRegionId,
    },
  };
}

function reinforcementId(ownerUid, targetKey) {
  const digest = crypto.createHash("sha256")
    .update(`${realm.resetGeneration}|${ownerUid}|${targetKey}`)
    .digest("hex")
    .slice(0, 40);
  return `reinforce_${digest}`;
}

function rallyReturnArmy({
  id,
  owner,
  source,
  target,
  troops,
  rallyId = "rally_return_safety",
  clanId = "",
  reinforcementReturn = null,
}) {
  const routeRegionIds = [...new Set([source.regionId, target.regionId])];
  return {
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    id,
    ownerKind: "player",
    ownerUid: owner.uid,
    ownerName: owner.name,
    kind: reinforcementReturn ? "transfer" : "attack",
    launchKind: reinforcementReturn ? "reinforce" : "attack",
    rallyReturn: !reinforcementReturn,
    rallyReturnAttack: !reinforcementReturn,
    rallyReturnRedirectCount: 0,
    rallyReturnOriginalCityId: target.id,
    rallyReturnOriginalCityName: target.name,
    rallyReturnOriginalRegionId: target.regionId,
    rallyId,
    rallyClanId: clanId,
    targetType: "city",
    fromId: source.id,
    fromName: source.name,
    sourceRegionId: source.regionId,
    toId: target.id,
    toName: target.name,
    targetRegionId: target.regionId,
    troops,
    requestedTroops: troops,
    total: 1,
    path: [{ x: Number(source.x) || 0, y: Number(source.y) || 0 }, { x: Number(target.x) || 1, y: Number(target.y) || 1 }],
    pathSegments: routeRegionIds.map(regionId => ({
      regionId,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      length: 1,
    })),
    routeRegionIds,
    pathLength: 1,
    targetKey: `${target.regionId}:${target.id}`,
    targetOwnerAtLaunch: "player",
    originalTargetOwnerUid: target.ownerUid || "",
    targetOwnerUid: target.ownerUid || "",
    launchedAtMs: Date.now() - 2_000,
    arrivesAtMs: Date.now() - 1_000,
    status: "active",
    createdByServer: true,
    serverAuthorityVersion: 3,
    ...(reinforcementReturn ? {
      reinforcementReturn: true,
      reinforcementId: reinforcementReturn.id,
      reinforcementReturnRevision: reinforcementReturn.revision,
      reinforcementRecipientUid: reinforcementReturn.recipientUid,
      reinforcementTargetKey: reinforcementReturn.targetKey,
    } : {}),
  };
}

async function seedLaunchedCreatorDepartureRally({
  clanId,
  rallyId,
  creator,
  creatorName,
  creatorClaim,
  participant,
  participantName,
  participantClaim,
  target,
  targetRegionId,
  troopsPerPlayer = 200,
}) {
  const armyId = `${rallyId}_attack`;
  const nowMs = Date.now();
  const [sourceSnap, targetSnap] = await Promise.all([
    db.doc(`islands/${creatorClaim.islandId}/cities/${creatorClaim.cityId}`).get(),
    objectiveRef(targetRegionId, target.id).get(),
  ]);
  assert(sourceSnap.exists && targetSnap.exists, "The creator-departure Rally fixture is missing its route endpoints.");
  const source = { id: sourceSnap.id, ...sourceSnap.data(), regionId: creatorClaim.regionId };
  const destination = { id: targetSnap.id, ...targetSnap.data(), regionId: targetRegionId };
  const path = [
    { x: Number(source.x) || 0, y: Number(source.y) || 0 },
    { x: Number(destination.x) || 1, y: Number(destination.y) || 1 },
  ];
  const routeRegionIds = [...new Set([creatorClaim.regionId, targetRegionId])];
  const participants = [
    {
      uid: creator.uid,
      ownerName: creatorName,
      role: "leader",
      sourceId: creatorClaim.cityId,
      sourceName: source.name || creatorClaim.cityName || creatorClaim.cityId,
      sourceRegionId: creatorClaim.regionId,
      troops: troopsPerPlayer,
      status: "assembled",
    },
    {
      uid: participant.uid,
      ownerName: participantName,
      role: "member",
      sourceId: participantClaim.cityId,
      sourceName: participantClaim.cityName || participantClaim.cityId,
      sourceRegionId: participantClaim.regionId,
      troops: troopsPerPlayer,
      status: "assembled",
    },
  ];
  await Promise.all([
    db.doc(`clans/${clanId}/rallies/${rallyId}`).set({
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      rallyModelVersion: 2,
      id: rallyId,
      clanId,
      leaderUid: creator.uid,
      leaderName: creatorName,
      assemblyCityId: creatorClaim.cityId,
      assemblyCityName: source.name || creatorClaim.cityName || creatorClaim.cityId,
      assemblyRegionId: creatorClaim.regionId,
      assemblyX: Number(source.x) || 0,
      assemblyY: Number(source.y) || 0,
      targetId: target.id,
      targetName: destination.name || target.name || target.id,
      targetRegionId,
      targetType: "city",
      status: "launched",
      armyId,
      participants,
      participantUids: participants.map(entry => entry.uid),
      participantCount: participants.length,
      assembledTroops: troopsPerPlayer * participants.length,
      inboundTroops: 0,
      launchedAtMs: nowMs,
      updatedAtMs: nowMs,
    }),
    db.doc(`armies/${armyId}`).set({
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      ownerKind: "player",
      ownerUid: creator.uid,
      ownerName: creatorName,
      kind: "attack",
      launchKind: "attack",
      rallyAttack: true,
      rallyId,
      rallyClanId: clanId,
      rallyParticipantCount: participants.length,
      participantUids: participants.map(entry => entry.uid),
      targetType: "city",
      fromId: creatorClaim.cityId,
      fromName: source.name || creatorClaim.cityName || creatorClaim.cityId,
      sourceRegionId: creatorClaim.regionId,
      toId: target.id,
      toName: destination.name || target.name || target.id,
      targetRegionId,
      troops: troopsPerPlayer * participants.length,
      requestedTroops: troopsPerPlayer * participants.length,
      total: 600,
      path,
      pathSegments: [{ regionId: creatorClaim.regionId, points: path, length: 1 }],
      routeRegionIds,
      viewRegionIds: routeRegionIds,
      pathLength: 1,
      targetKey: `${targetRegionId}:${target.id}`,
      targetOwnerAtLaunch: destination.ownerUid ? "player" : "neutral",
      originalTargetOwnerUid: destination.ownerUid || "",
      targetOwnerUid: destination.ownerUid || "",
      launchedAtMs: nowMs,
      arrivesAtMs: nowMs + 600_000,
      status: "active",
      createdByServer: true,
      rallyModelVersion: 2,
      serverAuthorityVersion: 3,
    }),
  ]);
  return armyId;
}

async function main() {
  const [clanLeader, rallyCreator, ally, defender] = await Promise.all([
    createAuthUser("clan-leader"),
    createAuthUser("creator"),
    createAuthUser("ally"),
    createAuthUser("defender"),
  ]);
  const rawClaims = await Promise.all([
    callFunction("claimStartingCity", clanLeader.token, { playerName: "Rally Clan Leader" }),
    callFunction("claimStartingCity", rallyCreator.token, { playerName: "Rally Creator" }),
    callFunction("claimStartingCity", ally.token, { playerName: "Rally Ally" }),
    callFunction("claimStartingCity", defender.token, { playerName: "Rally Defender" }),
  ]);
  await Promise.all([clanLeader, rallyCreator, ally, defender].map(user => waitFor(
    () => db.doc(`realmEvents/${realm.resetGeneration}/ownershipChanges/claim_${user.uid}`).get(),
    snapshot => snapshot.exists && snapshot.data()?.status === "processed",
    `The starting-city ownership event did not settle for ${user.uid}.`,
    30_000
  )));
  const [leaderClaim, creatorClaim, allyClaim, defenderClaim] = rawClaims.map(claim => ({
    ...claim,
    regionId: claim.regionId || claim.mainRegionId || String(claim.islandId || "").split("-").pop(),
  }));
  const clanId = `rally_lifecycle_${crypto.randomBytes(5).toString("hex")}`;
  const current = { worldId: realm.worldId, resetGeneration: realm.resetGeneration };
  const nowMs = Date.now();
  const clan = {
    ...current,
    status: "active",
    leaderUid: clanLeader.uid,
    name: "Rally Test Clan",
    tag: "RTC",
    normalizedName: `rally-test-clan-${clanId}`,
    normalizedTag: `rtc-${clanId}`,
    memberCount: 3,
    totalKingPower: 0,
  };
  const clanBatch = db.batch();
  clanBatch.set(db.doc(`clans/${clanId}`), clan);
  [
    [clanLeader, "leader", "Rally Clan Leader"],
    [rallyCreator, "officer", "Rally Creator"],
    [ally, "member", "Rally Ally"],
  ].forEach(([user, role, displayName]) => {
    clanBatch.set(db.doc(`clans/${clanId}/members/${user.uid}`), {
      ...current,
      clanId,
      uid: user.uid,
      role,
      status: "active",
      displayName,
      kingPower: 0,
    });
    clanBatch.set(db.doc(`players/${user.uid}`), {
      clanId,
      clanName: clan.name,
      clanTag: clan.tag,
      clanRole: role,
      upgrades: role === "officer" ? { marchOrders: 30 } : {},
      itemEffects: { shieldExpiresAtMs: nowMs + 3_600_000 },
      updatedAtMs: nowMs,
    }, { merge: true });
  });
  await clanBatch.commit();

  const creatorCityRef = db.doc(`islands/${creatorClaim.islandId}/cities/${creatorClaim.cityId}`);
  const allyCityRef = db.doc(`islands/${allyClaim.islandId}/cities/${allyClaim.cityId}`);
  const defenderCityRef = db.doc(`islands/${defenderClaim.islandId}/cities/${defenderClaim.cityId}`);
  await Promise.all([
    creatorCityRef.set({ troops: 110_000_000, troopFloat: 110_000_000, productionUpdatedAtMs: nowMs }, { merge: true }),
    allyCityRef.set({ troops: 60_000_000, troopFloat: 60_000_000, productionUpdatedAtMs: nowMs }, { merge: true }),
    defenderCityRef.set({ troops: 1_000_000, troopFloat: 1_000_000, productionUpdatedAtMs: nowMs }, { merge: true }),
  ]);

  const claimedCityIds = rawClaims.map(claim => claim.cityId);
  const targetRegionId = creatorClaim.regionId;
  const gold = {
    ...findReachableConfiguredCity(creatorClaim, claimedCityIds, "gold"),
    kind: "stronghold",
    type: "gold",
    strongholdType: "gold",
    name: "Rally Test Stronghold",
  };
  const goldRef = objectiveRef(targetRegionId, gold.id);
  await goldRef.set({
    ...current,
    ...gold,
    kind: "stronghold",
    owner: "player",
    ownerKind: "player",
    ownerUid: defender.uid,
    ownerName: "Rally Defender",
    ownerClanId: "",
    troops: 1,
    troopFloat: 1,
    alliedReinforcementTroops: 0,
    regionId: targetRegionId,
    productionUpdatedAtMs: nowMs,
  }, { merge: true });

  const rallyId = `rally_flow_${crypto.randomBytes(5).toString("hex")}`;
  await callFunction("createClanRally", rallyCreator.token, rallyOrder({
    rallyId,
    sourceClaim: creatorClaim,
    targetRegionId,
    targetId: gold.id,
    troops: 100_000_000,
  }));
  const joinArmyId = `${rallyId}_ally_join`;
  const joined = await callFunction("joinClanRally", ally.token, {
    clanId,
    rallyId,
    armyId: joinArmyId,
    sourceRegionId: allyClaim.regionId,
    army: {
      id: joinArmyId,
      kind: "rally_join",
      targetType: "city",
      fromId: allyClaim.cityId,
      troops: 50_000_000,
      requestedTroops: 50_000_000,
      sourceRegionId: allyClaim.regionId,
    },
  });
  assert(joined.movement?.kind === "rally_join", "The allied Rally contribution did not begin assembling.");

  const blockedLaunch = await callFunctionRaw("launchClanRally", rallyCreator.token, {
    clanId,
    rallyId,
    armyId: `${rallyId}_attack`,
  });
  assert(blockedLaunch.body.error, "A Rally launched before every participant arrived and became Ready.");
  const beforeReady = (await db.doc(`clans/${clanId}/rallies/${rallyId}`).get()).data() || {};
  assert(beforeReady.status === "forming", "The blocked launch changed the forming Rally state.");
  assert(
    beforeReady.participants?.some(entry => entry.uid === ally.uid && entry.status === "inbound"),
    "The blocked launch silently returned or removed the inbound contribution."
  );

  await db.doc(`armies/${joinArmyId}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
  const assembly = await callFunction("resolveArmyOrder", ally.token, {
    armyId: joinArmyId,
    regionIds: joined.movement.routeRegionIds,
  });
  assert(assembly.outcome === "assembled", "The allied contribution did not become Ready at the assembly city.");

  const allyMap = worldLayout.maps.find(entry => entry.id === allyClaim.regionId);
  const speed = {
    ...allyMap.cities.find(entry => !claimedCityIds.includes(entry.id) && entry.id !== gold.id),
    kind: "stronghold",
    type: "speed",
    strongholdType: "speed",
    name: "Rally Test Swiftgate",
  };
  assert(speed.id, "The Rally speed test could not find an unused configured city.");
  await objectiveRef(allyClaim.regionId, speed.id).set({
    ...current,
    ...speed,
    kind: "stronghold",
    owner: "player",
    ownerKind: "player",
    ownerUid: ally.uid,
    ownerName: "Rally Ally",
    ownerClanId: clanId,
    troops: 1,
    troopFloat: 1,
    regionId: allyClaim.regionId,
    productionUpdatedAtMs: Date.now(),
  }, { merge: true });

  const attackArmyId = `${rallyId}_attack`;
  const launched = await callFunction("launchClanRally", rallyCreator.token, {
    clanId,
    rallyId,
    armyId: attackArmyId,
  });
  assert(launched.movement?.troops === 150_000_000, "The launched Rally did not combine both Ready contributions.");
  assert(
    launched.movement?.participantUids?.includes(rallyCreator.uid)
      && launched.movement?.participantUids?.includes(ally.uid),
    "The launched Rally omitted a Ready participant."
  );
  assert(
    Math.abs(Number(launched.movement?.rallyMarchSpeedMultiplier) - 1.08) < 0.0001,
    `The launch did not recalculate the ally's live objective speed before locking the slowest march (${launched.movement?.rallyMarchSpeedMultiplier}).`
  );
  const allyProfileAfterLaunch = (await db.doc(`players/${ally.uid}`).get()).data() || {};
  assert(allyProfileAfterLaunch.committedRallyTroops === 50_000_000, "The ally's Ready troops were returned at launch.");

  await db.doc(`players/${ally.uid}`).set({
    upgrades: { swordmastery: 30, fieldMedics: 10 },
    gear: createEquippedAttackGear(),
  }, { merge: true });
  const rallyTargetKey = `city:${targetRegionId}:${gold.id}`;
  const staleReinforcementId = reinforcementId(ally.uid, rallyTargetKey);
  const staleReturnArmyId = `${rallyId}_stale_reinforcement_return`;
  await Promise.all([
    db.doc(`reinforcements/${staleReinforcementId}`).set({
      ...current,
      id: staleReinforcementId,
      modelVersion: 2,
      ownerUid: ally.uid,
      ownerName: "Rally Ally",
      clanId,
      targetKey: rallyTargetKey,
      targetType: "city",
      targetId: gold.id,
      targetName: gold.name,
      targetRegionId,
      targetOwnerUid: defender.uid,
      reinforcementRecipientUid: defender.uid,
      originalTargetOwnerUid: defender.uid,
      reinforcementSourceId: allyClaim.cityId,
      reinforcementSourceRegionId: allyClaim.regionId,
      reinforcementSourceCityName: "Rally Ally City",
      troops: 0,
      status: "returning",
      returnRevision: 1,
      returnArmyId: staleReturnArmyId,
      updatedAtMs: Date.now(),
    }),
    db.doc(`armies/${staleReturnArmyId}`).set(rallyReturnArmy({
      id: staleReturnArmyId,
      owner: { uid: ally.uid, name: "Rally Ally" },
      source: { id: gold.id, name: gold.name, regionId: targetRegionId, x: gold.x, y: gold.y },
      target: { id: allyClaim.cityId, name: "Rally Ally City", regionId: allyClaim.regionId, ownerUid: ally.uid },
      troops: 10_000,
      clanId,
      reinforcementReturn: {
        id: staleReinforcementId,
        revision: 1,
        recipientUid: defender.uid,
        targetKey: rallyTargetKey,
      },
    })),
  ]);
  await db.doc(`armies/${staleReturnArmyId}`).set({ arrivesAtMs: Date.now() + 600_000 }, { merge: true });
  await db.doc(`armies/${attackArmyId}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
  const battle = await callFunction("resolveArmyOrder", rallyCreator.token, {
    armyId: attackArmyId,
    regionIds: launched.movement.routeRegionIds,
  });
  assert(battle.outcome === "victory", "The Rally lifecycle test did not capture the Stronghold.");
  const immediateStation = (await db.doc(`reinforcements/${staleReinforcementId}`).get()).data() || {};
  const immediateTarget = (await goldRef.get()).data() || {};
  assert(immediateStation.status === "stationed", "Allied Rally survivors were not stationed atomically with the capture.");
  assert(immediateStation.rallyArmyId === attackArmyId, "The Rally station record was not tied to the winning battle.");
  assert(immediateStation.troops > 0, "The atomic Rally station record contained no survivors.");
  assert(
    immediateTarget.alliedReinforcementTroops === immediateStation.troops,
    "The captured objective did not immediately include all allied Rally survivors."
  );

  const immediateCounterAttackId = `${attackArmyId}_immediate_counter`;
  await db.doc(`armies/${immediateCounterAttackId}`).set(rallyReturnArmy({
    id: immediateCounterAttackId,
    owner: { uid: defender.uid, name: "Rally Defender" },
    source: { id: defenderClaim.cityId, name: "Defender City", regionId: defenderClaim.regionId },
    target: { id: gold.id, name: gold.name, regionId: targetRegionId, ownerUid: rallyCreator.uid },
    troops: 1,
  }));
  await callFunction("resolveArmyOrder", defender.token, {
    armyId: immediateCounterAttackId,
    regionIds: [...new Set([defenderClaim.regionId, targetRegionId])],
  });
  const counterSnapshot = (await db.doc(
    `battleSnapshots/${realm.resetGeneration}/entries/${immediateCounterAttackId}`
  ).get()).data() || {};
  assert(
    counterSnapshot.reinforcements?.some(entry => (
      entry.ownerUid === ally.uid
      && entry.reinforcementId === staleReinforcementId
      && entry.startingTroops === immediateStation.troops
    )),
    "An immediate counterattack did not include the allied Rally survivors in defense."
  );
  const battleSnapshot = (await db.doc(`battleSnapshots/${realm.resetGeneration}/entries/${attackArmyId}`).get()).data() || {};
  const allyBattlePackage = battleSnapshot.attackers?.find(entry => entry.ownerUid === ally.uid);
  assert(allyBattlePackage, "The shared Rally battle snapshot omitted the ally.");
  assert(allyBattlePackage.swordmasteryPercent === 60, "Rally combat used the ally's launch-time Swordmastery instead of battle-time state.");
  assert(allyBattlePackage.gearAttackStrengthPercent > 0, "Rally combat ignored the ally's battle-time attack gear.");

  await waitFor(
    async () => (await db.doc(
      `realmEvents/${realm.resetGeneration}/ownershipChanges/army_${attackArmyId}_city_${gold.id}`
    ).get()).data() || {},
    event => event.status === "processed",
    "The Rally capture ownership cleanup did not finish"
  );
  const stationAfterOwnershipCleanup = (await db.doc(`reinforcements/${staleReinforcementId}`).get()).data() || {};
  assert(
    stationAfterOwnershipCleanup.status === "stationed",
    "Ownership cleanup recalled survivors that belonged to the new Rally owner."
  );

  await waitFor(
    async () => (await db.doc(`rallyBattleReceipts/${realm.resetGeneration}/entries/${attackArmyId}_${ally.uid}`).get()).data() || {},
    receipt => receipt.status === "settled",
    "The allied Rally battle receipt did not settle"
  );
  const capturedGold = (await goldRef.get()).data() || {};
  assert(capturedGold.ownerUid === rallyCreator.uid, "Stronghold control did not go to the Rally creator.");
  const reinforcementSnapshot = await db.collection("reinforcements")
    .where("ownerUid", "==", ally.uid)
    .where("targetId", "==", gold.id)
    .where("status", "==", "stationed")
    .get();
  assert(!reinforcementSnapshot.empty, "The ally's surviving troops were not stationed as recallable reinforcements.");
  // Keep passive production from obscuring the exact 10,000-troop return delta.
  await allyCityRef.set({ productionUpdatedAtMs: Date.now() + 60_000 }, { merge: true });
  const allyTroopsBeforeStaleReturn = Number((await allyCityRef.get()).data()?.troops || 0);
  await db.doc(`armies/${staleReturnArmyId}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
  await callFunction("resolveArmyOrder", ally.token, {
    armyId: staleReturnArmyId,
    regionIds: [...new Set([targetRegionId, allyClaim.regionId])],
  });
  const stationAfterStaleReturn = (await db.doc(`reinforcements/${staleReinforcementId}`).get()).data() || {};
  const allyTroopsAfterStaleReturn = Number((await allyCityRef.get()).data()?.troops || 0);
  assert(stationAfterStaleReturn.status === "stationed", "An older return movement overwrote newly stationed Rally survivors.");
  assert(
    allyTroopsAfterStaleReturn - allyTroopsBeforeStaleReturn === 10_000,
    `The older reinforcement return did not conserve its separately marching troops (${allyTroopsBeforeStaleReturn} -> ${allyTroopsAfterStaleReturn}).`
  );
  await callFunction("resolveArmyOrder", ally.token, {
    armyId: staleReturnArmyId,
    regionIds: [...new Set([targetRegionId, allyClaim.regionId])],
  });
  assert(
    Number((await allyCityRef.get()).data()?.troops || 0) === allyTroopsAfterStaleReturn,
    "Replaying an older return movement duplicated troops."
  );
  const creatorReports = (await db.doc(`players/${rallyCreator.uid}`).get()).data()?.battleReports || [];
  const allyReports = (await db.doc(`players/${ally.uid}`).get()).data()?.battleReports || [];
  assert(creatorReports.some(report => report.battleId === attackArmyId), "The Rally creator did not receive the battle report.");
  assert(allyReports.some(report => report.battleId === attackArmyId), "The Rally ally did not receive the battle report.");

  await db.doc(`players/${rallyCreator.uid}`).set({ upgrades: { marchOrders: 30 } }, { merge: true });
  await creatorCityRef.set({ troops: 1_000_000, troopFloat: 1_000_000 }, { merge: true });
  await goldRef.set({
    owner: "player",
    ownerKind: "player",
    ownerUid: defender.uid,
    ownerName: "Rally Defender",
    ownerClanId: "",
    troops: 1,
    troopFloat: 1,
  }, { merge: true });
  const demotionRallyId = `rally_demote_${crypto.randomBytes(5).toString("hex")}`;
  await callFunction("createClanRally", rallyCreator.token, rallyOrder({
    rallyId: demotionRallyId,
    sourceClaim: creatorClaim,
    targetRegionId,
    targetId: gold.id,
    troops: 100_000,
  }));
  await callFunction("demoteClanOfficer", clanLeader.token, { targetUid: rallyCreator.uid });
  const demotedRally = (await db.doc(`clans/${clanId}/rallies/${demotionRallyId}`).get()).data() || {};
  assert(demotedRally.status === "cancelled", "Demoting a Rally creator did not automatically cancel the forming Rally.");

  const scaleExtras = [];
  for (let offset = 0; offset < 17; offset += 4) {
    const count = Math.min(4, 17 - offset);
    const users = await Promise.all(Array.from({ length: count }, (_, index) => (
      createAuthUser(`scale-${offset + index}`)
    )));
    const claims = await Promise.all(users.map((user, index) => (
      callFunction("claimStartingCity", user.token, { playerName: `Scale Ally ${offset + index + 1}` })
    )));
    users.forEach((user, index) => {
      const claim = claims[index];
      scaleExtras.push({
        user,
        name: `Scale Ally ${offset + index + 1}`,
        claim: {
          ...claim,
          regionId: claim.regionId || claim.mainRegionId || String(claim.islandId || "").split("-").pop(),
        },
      });
    });
  }
  const scaleRoster = [
    { user: clanLeader, name: "Rally Clan Leader", claim: leaderClaim },
    { user: rallyCreator, name: "Rally Creator", claim: creatorClaim },
    { user: ally, name: "Rally Ally", claim: allyClaim },
    ...scaleExtras,
  ];
  assert(scaleRoster.length === 20, "The max-size launch fixture did not create 20 unique players.");
  const scaleMemberBatch = db.batch();
  scaleMemberBatch.set(db.doc(`clans/${clanId}`), { memberCount: 20 }, { merge: true });
  scaleExtras.forEach(({ user, name, claim }) => {
    scaleMemberBatch.set(db.doc(`clans/${clanId}/members/${user.uid}`), {
      ...current,
      clanId,
      uid: user.uid,
      role: "member",
      status: "active",
      displayName: name,
      kingPower: 0,
    });
    scaleMemberBatch.set(db.doc(`players/${user.uid}`), {
      clanId,
      clanName: clan.name,
      clanTag: clan.tag,
      clanRole: "member",
      updatedAtMs: Date.now(),
    }, { merge: true });
    scaleMemberBatch.set(db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`), {
      troops: 10_000,
      troopFloat: 10_000,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true });
  });
  [
    [creatorCityRef, 10_000],
    [allyCityRef, 10_000],
  ].forEach(([ref, troops]) => scaleMemberBatch.set(ref, {
    troops,
    troopFloat: troops,
    productionUpdatedAtMs: Date.now(),
  }, { merge: true }));
  scaleMemberBatch.set(db.doc(`players/${rallyCreator.uid}`), { clanRole: "member" }, { merge: true });
  await scaleMemberBatch.commit();
  await db.doc(`islands/${leaderClaim.islandId}/cities/${leaderClaim.cityId}`).set({
    troops: 10_000,
    troopFloat: 10_000,
    productionUpdatedAtMs: Date.now(),
  }, { merge: true });

  const scaleTarget = {
    ...findReachableConfiguredCity(
      leaderClaim,
      [...scaleRoster.map(entry => entry.claim.cityId), gold.id, speed.id],
      "defense"
    ),
    kind: "stronghold",
    type: "defense",
    strongholdType: "defense",
    name: "Twenty Player Rally Target",
  };
  const scaleTargetRef = objectiveRef(leaderClaim.regionId, scaleTarget.id);
  await scaleTargetRef.set({
    ...current,
    ...scaleTarget,
    owner: "player",
    ownerKind: "player",
    ownerUid: defender.uid,
    ownerName: "Rally Defender",
    ownerClanId: "",
    troops: 1,
    troopFloat: 1,
    alliedReinforcementTroops: 0,
    regionId: leaderClaim.regionId,
    productionUpdatedAtMs: Date.now(),
  }, { merge: true });
  const scaleRallyId = `rally_scale_launch_${crypto.randomBytes(5).toString("hex")}`;
  await callFunction("createClanRally", clanLeader.token, rallyOrder({
    rallyId: scaleRallyId,
    sourceClaim: leaderClaim,
    targetRegionId: leaderClaim.regionId,
    targetId: scaleTarget.id,
    troops: 1_000,
  }));
  for (const entry of scaleRoster.slice(1)) {
    const joinId = `${scaleRallyId}_${entry.user.uid.slice(0, 12)}_join`;
    const joinedScale = await callFunction("joinClanRally", entry.user.token, {
      clanId,
      rallyId: scaleRallyId,
      armyId: joinId,
      sourceRegionId: entry.claim.regionId,
      army: {
        id: joinId,
        kind: "rally_join",
        targetType: "city",
        fromId: entry.claim.cityId,
        troops: 1_000,
        requestedTroops: 1_000,
        sourceRegionId: entry.claim.regionId,
      },
    });
    await db.doc(`armies/${joinId}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
    const assembledScale = await callFunction("resolveArmyOrder", entry.user.token, {
      armyId: joinId,
      regionIds: joinedScale.movement.routeRegionIds,
    });
    assert(assembledScale.outcome === "assembled", `${entry.name}'s max-size contribution did not become Ready.`);
  }
  const scaleReadyRally = (await db.doc(`clans/${clanId}/rallies/${scaleRallyId}`).get()).data() || {};
  assert(scaleReadyRally.participants?.length === 20, "The max-size Rally did not retain all 20 participants.");
  assert(
    scaleReadyRally.participants.every(entry => entry.status === "assembled"),
    "The max-size Rally reached launch without every participant being Ready."
  );
  const scaleAttackArmyId = `${scaleRallyId}_attack`;
  const scaleLaunch = await callFunction("launchClanRally", clanLeader.token, {
    clanId,
    rallyId: scaleRallyId,
    armyId: scaleAttackArmyId,
  });
  const scaleParticipants = scaleLaunch.rally?.participants || [];
  assert(scaleParticipants.length === 20, "The launched max-size Rally omitted participants.");
  assert(scaleLaunch.movement?.troops === 20_000, "The launched max-size Rally did not preserve its troop total.");
  assert(new Set(scaleParticipants.map(entry => entry.uid)).size === 20, "The max-size Rally contains duplicate players.");
  assert(
    scaleParticipants.every(entry => entry.sourceId && entry.troops === 1_000),
    "The max-size Rally did not preserve one Ready army from one city per player."
  );
  const expectedScaleSpeed = Math.min(...scaleParticipants.map(entry => Number(entry.marchSpeedMultiplier) || 1));
  assert(
    Math.abs(Number(scaleLaunch.movement?.rallyMarchSpeedMultiplier) - expectedScaleSpeed) < 0.0001,
    "The max-size Rally did not lock to its slowest Ready participant."
  );

  const maxRallyId = `rally_max_cancel_${crypto.randomBytes(5).toString("hex")}`;
  const maxAssemblyRef = db.doc(`islands/${leaderClaim.islandId}/cities/${leaderClaim.cityId}`);
  await maxAssemblyRef.set({ troops: 1_000_000, troopFloat: 1_000_000 }, { merge: true });
  const maxParticipants = [{
    uid: clanLeader.uid,
    ownerUid: clanLeader.uid,
    ownerName: "Rally Clan Leader",
    role: "leader",
    sourceId: leaderClaim.cityId,
    sourceName: "Leader City",
    sourceRegionId: leaderClaim.regionId,
    troops: 100_000,
    status: "assembled",
  }];
  const maxBatch = db.batch();
  for (let index = 1; index < 20; index += 1) {
    const uid = `max_rally_participant_${index}_${crypto.randomBytes(3).toString("hex")}`;
    const joinId = `${maxRallyId}_join_${index}`;
    maxParticipants.push({
      uid,
      ownerUid: uid,
      ownerName: `Max Ally ${index}`,
      role: "ally",
      sourceId: allyClaim.cityId,
      sourceName: "Allied source",
      sourceRegionId: allyClaim.regionId,
      troops: 1_000,
      status: "inbound",
      joinArmyId: joinId,
    });
    maxBatch.set(db.doc(`armies/${joinId}`), {
      ...current,
      id: joinId,
      ownerKind: "player",
      ownerUid: uid,
      ownerName: `Max Ally ${index}`,
      kind: "rally_join",
      launchKind: "rally_join",
      rallyJoin: true,
      rallyId: maxRallyId,
      rallyClanId: clanId,
      targetType: "city",
      fromId: allyClaim.cityId,
      toId: leaderClaim.cityId,
      sourceRegionId: allyClaim.regionId,
      targetRegionId: leaderClaim.regionId,
      troops: 1_000,
      total: 30,
      routeRegionIds: [allyClaim.regionId, leaderClaim.regionId],
      path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      pathSegments: [{ regionId: allyClaim.regionId, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], length: 1 }],
      pathLength: 1,
      launchedAtMs: nowMs,
      arrivesAtMs: nowMs + 30_000,
      status: "active",
    });
  }
  maxBatch.set(db.doc(`clans/${clanId}/rallies/${maxRallyId}`), {
    ...current,
    id: maxRallyId,
    clanId,
    status: "forming",
    leaderUid: clanLeader.uid,
    leaderName: "Rally Clan Leader",
    assemblyCityId: leaderClaim.cityId,
    assemblyCityName: "Leader City",
    assemblyRegionId: leaderClaim.regionId,
    assemblyX: 0,
    assemblyY: 0,
    targetType: "city",
    targetId: gold.id,
    targetName: gold.name,
    targetRegionId,
    participants: maxParticipants,
    participantUids: maxParticipants.map(entry => entry.uid),
    participantCount: 20,
    assembledTroops: 100_000,
    inboundTroops: 19_000,
  });
  maxBatch.set(db.doc(`clans/${clanId}/rallyState/${realm.resetGeneration}`), {
    ...current,
    activeRallyIds: [maxRallyId],
    activeCount: 1,
  }, { merge: true });
  await maxBatch.commit();
  const cancelled = await callFunction("cancelClanRally", clanLeader.token, { clanId, rallyId: maxRallyId });
  assert(cancelled.settlementPending === 20, "The max-size Rally cancellation did not queue every participant safely.");
  await waitFor(
    async () => (await db.doc(`clans/${clanId}/rallies/${maxRallyId}`).get()).data() || {},
    rally => rally.cancellationSettlementPending === 0,
    "The max-size Rally cancellation did not finish participant settlement",
    30_000
  );
  const replayedCancel = await callFunction("cancelClanRally", clanLeader.token, { clanId, rallyId: maxRallyId });
  assert(replayedCancel.duplicate === true, "Replaying a max-size Rally cancellation was not idempotent.");

  const returnRallyId = `rally_return_attack_${crypto.randomBytes(5).toString("hex")}`;
  const returnArmyId = `${returnRallyId}_army`;
  const backupCity = findReachableConfiguredCity(
    leaderClaim,
    [
      ...claimedCityIds,
      gold.id,
      speed.id,
      "west_gold_stronghold",
      "north_training_stronghold",
      "east_speed_stronghold",
      "center_citadel",
    ],
    "gold"
  );
  const backupRef = db.doc(`islands/${realm.worldId}-${leaderClaim.regionId}/cities/${backupCity.id}`);
  await Promise.all([
    backupRef.set({
      ...current,
      ...backupCity,
      owner: "player",
      ownerKind: "player",
      ownerUid: clanLeader.uid,
      ownerName: "Rally Clan Leader",
      kind: "city",
      type: "city",
      strongholdType: "",
      isMainCity: true,
      troops: 1_000,
      troopFloat: 1_000,
      regionId: leaderClaim.regionId,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true }),
    maxAssemblyRef.set({
      owner: "player",
      ownerKind: "player",
      ownerUid: defender.uid,
      ownerName: "Rally Defender",
      ownerClanId: "",
      isMainCity: false,
      troops: 1_000,
      troopFloat: 1_000,
    }, { merge: true }),
    db.doc(`players/${clanLeader.uid}`).set({
      mainCityId: backupCity.id,
      mainIslandId: `${realm.worldId}-${leaderClaim.regionId}`,
      mainRegionId: leaderClaim.regionId,
      committedRallyTroops: 150_000,
      rallyResetGeneration: realm.resetGeneration,
    }, { merge: true }),
    db.doc(`players/${ally.uid}`).set({
      committedRallyTroops: 50_000,
      rallyResetGeneration: realm.resetGeneration,
    }, { merge: true }),
  ]);
  const returnParticipants = [
    {
      uid: clanLeader.uid,
      ownerUid: clanLeader.uid,
      ownerName: "Rally Clan Leader",
      role: "leader",
      sourceId: leaderClaim.cityId,
      sourceName: "Lost assembly",
      sourceRegionId: leaderClaim.regionId,
      troops: 100_000,
      status: "assembled",
    },
    {
      uid: ally.uid,
      ownerUid: ally.uid,
      ownerName: "Rally Ally",
      role: "ally",
      sourceId: allyClaim.cityId,
      sourceName: "Ally City",
      sourceRegionId: allyClaim.regionId,
      troops: 50_000,
      status: "assembled",
    },
  ];
  await Promise.all([
    db.doc(`clans/${clanId}/rallies/${returnRallyId}`).set({
      ...current,
      id: returnRallyId,
      clanId,
      status: "recalling",
      leaderUid: clanLeader.uid,
      assemblyCityId: leaderClaim.cityId,
      assemblyCityName: "Lost assembly",
      assemblyRegionId: leaderClaim.regionId,
      targetType: "city",
      targetId: gold.id,
      targetName: gold.name,
      targetRegionId,
      armyId: returnArmyId,
      participants: returnParticipants,
      participantUids: returnParticipants.map(entry => entry.uid),
    }),
    db.doc(`clans/${clanId}/rallyState/${realm.resetGeneration}`).set({
      ...current,
      activeRallyIds: [returnRallyId],
      activeCount: 1,
    }, { merge: true }),
    db.doc(`armies/${returnArmyId}`).set({
      ...current,
      id: returnArmyId,
      ownerKind: "player",
      ownerUid: clanLeader.uid,
      ownerName: "Rally Clan Leader",
      kind: "transfer",
      launchKind: "attack",
      rallyAttack: true,
      rallyId: returnRallyId,
      rallyClanId: clanId,
      participantUids: returnParticipants.map(entry => entry.uid),
      targetType: "city",
      fromId: leaderClaim.cityId,
      toId: gold.id,
      sourceRegionId: leaderClaim.regionId,
      targetRegionId,
      troops: 150_000,
      requestedTroops: 150_000,
      total: 30,
      routeRegionIds: [...new Set([leaderClaim.regionId, targetRegionId])],
      path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      pathSegments: [{ regionId: leaderClaim.regionId, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], length: 1 }],
      pathLength: 1,
      returning: true,
      returnReason: "rally_recall",
      launchedAtMs: nowMs - 60_000,
      arrivesAtMs: Date.now() - 1_000,
      status: "active",
    }),
  ]);
  const returned = await callFunction("resolveArmyOrder", clanLeader.token, {
    armyId: returnArmyId,
    regionIds: [...new Set([leaderClaim.regionId, targetRegionId])],
  });
  assert(
    returned.returnAttackMovement?.kind === "attack"
      && returned.returnAttackMovement?.toId === leaderClaim.cityId,
    "The Rally creator returned to the Main City instead of attacking the enemy-held assembly city."
  );
  const returnAttackDoc = await db.doc(`armies/${returned.returnAttackMovement.id}`).get();
  assert(returnAttackDoc.exists && returnAttackDoc.data()?.rallyReturnAttack === true, "The enemy-source return attack was not persisted.");
  await returnAttackDoc.ref.set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
  const recapture = await callFunction("resolveArmyOrder", clanLeader.token, {
    armyId: returned.returnAttackMovement.id,
    regionIds: [leaderClaim.regionId],
  });
  const recaptureSnapshot = (await db.doc(
    `battleSnapshots/${realm.resetGeneration}/entries/${returned.returnAttackMovement.id}`
  ).get()).data() || {};
  assert(recapture.kind === "attack", "The returning Rally creator did not fight the enemy-held assembly city.");
  assert(
    recaptureSnapshot.armyId === returned.returnAttackMovement.id,
    "The enemy-held Rally origin did not produce a real battle snapshot."
  );

  const returnSafetySource = {
    id: gold.id,
    name: gold.name,
    regionId: targetRegionId,
    x: gold.x,
    y: gold.y,
  };
  const returnSafetyTarget = {
    id: leaderClaim.cityId,
    name: "Rally Return Origin",
    regionId: leaderClaim.regionId,
  };
  const runRedirectCase = async ({ label, targetPatch, expectedReason }) => {
    const armyId = `rally_return_${label}_${crypto.randomBytes(4).toString("hex")}`;
    const troops = 1_234;
    await maxAssemblyRef.set({
      ownerShieldExpiresAtMs: 0,
      isMainCity: false,
      ownerClanId: "",
      troops: 100,
      troopFloat: 100,
      ...targetPatch,
    }, { merge: true });
    const targetState = (await maxAssemblyRef.get()).data() || {};
    await db.doc(`armies/${armyId}`).set(rallyReturnArmy({
      id: armyId,
      owner: { uid: clanLeader.uid, name: "Rally Clan Leader" },
      source: returnSafetySource,
      target: { ...returnSafetyTarget, ownerUid: targetState.ownerUid || "" },
      troops,
      clanId,
    }));
    const redirected = await callFunction("resolveArmyOrder", clanLeader.token, {
      armyId,
      regionIds: [...new Set([targetRegionId, leaderClaim.regionId])],
    });
    assert(redirected.rerouted === true, `${label} Rally return did not redirect safely.`);
    assert(redirected.redirectReason === expectedReason, `${label} Rally return used the wrong redirect reason.`);
    assert(redirected.movement?.toId === backupCity.id, `${label} Rally return did not redirect to the Main City.`);
    assert(redirected.movement?.rallyReturnAttack === false, `${label} Rally return remained a hostile attack after redirect.`);
    const mainBeforeArrival = Number((await backupRef.get()).data()?.troops || 0);
    await db.doc(`armies/${redirected.movement.id}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
    await callFunction("resolveArmyOrder", clanLeader.token, {
      armyId: redirected.movement.id,
      regionIds: redirected.movement.routeRegionIds,
    });
    const mainAfterArrival = Number((await backupRef.get()).data()?.troops || 0);
    assert(mainAfterArrival - mainBeforeArrival === troops, `${label} Rally return did not conserve every surviving troop.`);
    await callFunction("resolveArmyOrder", clanLeader.token, {
      armyId: redirected.movement.id,
      regionIds: redirected.movement.routeRegionIds,
    });
    assert(
      Number((await backupRef.get()).data()?.troops || 0) === mainAfterArrival,
      `${label} Rally return duplicated troops when replayed.`
    );
  };

  await runRedirectCase({
    label: "neutral",
    targetPatch: {
      owner: "neutral",
      ownerKind: "neutral",
      ownerUid: "",
      ownerName: "Neutral",
      troops: 0,
      troopFloat: 0,
    },
    expectedReason: "neutral_original_city",
  });
  await runRedirectCase({
    label: "clan_owned",
    targetPatch: {
      owner: "player",
      ownerKind: "player",
      ownerUid: ally.uid,
      ownerName: "Rally Ally",
      ownerClanId: clanId,
    },
    expectedReason: "clan_owned_original_city",
  });
  await runRedirectCase({
    label: "shielded",
    targetPatch: {
      owner: "player",
      ownerKind: "player",
      ownerUid: defender.uid,
      ownerName: "Rally Defender",
      ownerShieldExpiresAtMs: Date.now() + 3_600_000,
    },
    expectedReason: "shielded_original_city",
  });
  await db.doc(`players/${defender.uid}`).set({
    mainCityId: leaderClaim.cityId,
    mainIslandId: leaderClaim.islandId,
    mainRegionId: leaderClaim.regionId,
  }, { merge: true });
  await runRedirectCase({
    label: "protected_main",
    targetPatch: {
      owner: "player",
      ownerKind: "player",
      ownerUid: defender.uid,
      ownerName: "Rally Defender",
      isMainCity: true,
    },
    expectedReason: "protected_main_city",
  });

  const ownedReturnArmyId = `rally_return_owned_${crypto.randomBytes(4).toString("hex")}`;
  await maxAssemblyRef.set({
    owner: "player",
    ownerKind: "player",
    ownerUid: clanLeader.uid,
    ownerName: "Rally Clan Leader",
    ownerClanId: clanId,
    ownerShieldExpiresAtMs: 0,
    isMainCity: false,
    troops: 100,
    troopFloat: 100,
  }, { merge: true });
  await db.doc(`armies/${ownedReturnArmyId}`).set(rallyReturnArmy({
    id: ownedReturnArmyId,
    owner: { uid: clanLeader.uid, name: "Rally Clan Leader" },
    source: returnSafetySource,
    target: { ...returnSafetyTarget, ownerUid: clanLeader.uid },
    troops: 777,
    clanId,
  }));
  await callFunction("resolveArmyOrder", clanLeader.token, {
    armyId: ownedReturnArmyId,
    regionIds: [...new Set([targetRegionId, leaderClaim.regionId])],
  });
  assert(Number((await maxAssemblyRef.get()).data()?.troops || 0) === 877, "An owned Rally origin did not receive its returning troops.");
  await callFunction("resolveArmyOrder", clanLeader.token, {
    armyId: ownedReturnArmyId,
    regionIds: [...new Set([targetRegionId, leaderClaim.regionId])],
  });
  assert(Number((await maxAssemblyRef.get()).data()?.troops || 0) === 877, "Replaying an owned Rally return duplicated troops.");

  const defeatedReturnArmyId = `rally_return_defeat_${crypto.randomBytes(4).toString("hex")}`;
  await Promise.all([
    backupRef.set({
      owner: "player",
      ownerKind: "player",
      ownerUid: clanLeader.uid,
      ownerName: "Rally Clan Leader",
      kind: "city",
      type: "city",
      strongholdType: "",
      isMainCity: true,
    }, { merge: true }),
    db.doc(`players/${clanLeader.uid}`).set({
      mainCityId: backupCity.id,
      mainIslandId: `${realm.worldId}-${leaderClaim.regionId}`,
      mainRegionId: leaderClaim.regionId,
    }, { merge: true }),
  ]);
  await maxAssemblyRef.set({
    owner: "player",
    ownerKind: "player",
    ownerUid: defender.uid,
    ownerName: "Rally Defender",
    ownerClanId: "",
    ownerShieldExpiresAtMs: 0,
    isMainCity: false,
    troops: 1_000_000_000,
    troopFloat: 1_000_000_000,
  }, { merge: true });
  await Promise.all([
    creatorCityRef.set({
      owner: "player",
      ownerKind: "player",
      ownerUid: rallyCreator.uid,
      ownerName: "Rally Creator",
      kind: "city",
      type: "city",
      strongholdType: "",
      isMainCity: true,
    }, { merge: true }),
    db.doc(`players/${rallyCreator.uid}`).set({
      mainCityId: creatorClaim.cityId,
      mainIslandId: creatorClaim.islandId,
      mainRegionId: creatorClaim.regionId,
    }, { merge: true }),
    defenderCityRef.set({
      owner: "player",
      ownerKind: "player",
      ownerUid: defender.uid,
      ownerName: "Rally Defender",
      kind: "city",
      type: "city",
      strongholdType: "",
      isMainCity: true,
    }, { merge: true }),
    db.doc(`players/${defender.uid}`).set({
      mainCityId: defenderClaim.cityId,
      mainIslandId: defenderClaim.islandId,
      mainRegionId: defenderClaim.regionId,
    }, { merge: true }),
  ]);
  const mainBeforeDefeat = Number((await creatorCityRef.get()).data()?.troops || 0);
  await db.doc(`armies/${defeatedReturnArmyId}`).set(rallyReturnArmy({
    id: defeatedReturnArmyId,
    owner: { uid: rallyCreator.uid, name: "Rally Creator" },
    source: returnSafetySource,
    target: { ...returnSafetyTarget, ownerUid: defender.uid },
    troops: 100,
    clanId,
  }));
  await callFunction("resolveArmyOrder", rallyCreator.token, {
    armyId: defeatedReturnArmyId,
    regionIds: [...new Set([targetRegionId, leaderClaim.regionId])],
  });
  const defeatedSnapshot = (await db.doc(
    `battleSnapshots/${realm.resetGeneration}/entries/${defeatedReturnArmyId}`
  ).get()).data() || {};
  assert(defeatedSnapshot.outcome !== "victory", "The Rally return defeat fixture unexpectedly captured its target.");
  assert(
    Number(defeatedSnapshot.attacker?.losses || 0) + Number(defeatedSnapshot.attacker?.survivors || 0) === 100,
    "The defeated Rally return battle did not account for every troop."
  );
  const mainAfterDefeat = Number((await creatorCityRef.get()).data()?.troops || 0);
  assert(
    mainAfterDefeat - mainBeforeDefeat === Number(defeatedSnapshot.attacker?.survivors || 0),
    "Survivors from a defeated Rally return did not reach the Main City exactly once."
  );
  await callFunction("resolveArmyOrder", rallyCreator.token, {
    armyId: defeatedReturnArmyId,
    regionIds: [...new Set([targetRegionId, leaderClaim.regionId])],
  });
  assert(Number((await creatorCityRef.get()).data()?.troops || 0) === mainAfterDefeat, "Replaying a defeated Rally return duplicated survivors.");

  const departureCreators = scaleExtras.slice(0, 3);
  assert(departureCreators.length === 3, "The creator-departure fixture needs three clan members.");
  for (const entry of departureCreators) {
    await callFunction("promoteClanMember", clanLeader.token, { targetUid: entry.user.uid });
    await db.doc(`players/${entry.user.uid}`).set({
      shopItems: { recall_horn: 2 },
    }, { merge: true });
  }

  const leaveEntry = departureCreators[0];
  const leaveRallyId = `rally_creator_leave_${crypto.randomBytes(4).toString("hex")}`;
  const leaveArmyId = await seedLaunchedCreatorDepartureRally({
    clanId,
    rallyId: leaveRallyId,
    creator: leaveEntry.user,
    creatorName: leaveEntry.name,
    creatorClaim: leaveEntry.claim,
    participant: clanLeader,
    participantName: "Rally Clan Leader",
    participantClaim: leaderClaim,
    target: scaleTarget,
    targetRegionId: leaderClaim.regionId,
  });
  await callFunction("leaveClan", leaveEntry.user.token);
  const [leftMemberSnap, leftProfileSnap, leaveRallySnap, leaveArmySnap] = await Promise.all([
    db.doc(`clans/${clanId}/members/${leaveEntry.user.uid}`).get(),
    db.doc(`players/${leaveEntry.user.uid}`).get(),
    db.doc(`clans/${clanId}/rallies/${leaveRallyId}`).get(),
    db.doc(`armies/${leaveArmyId}`).get(),
  ]);
  assert(!leftMemberSnap.exists, "The creator did not leave the clan after the automatic Rally recall.");
  assert(Number(leftProfileSnap.data()?.shopItems?.recall_horn || 0) === 2, "Automatic creator-departure recall consumed a Recall Horn.");
  assert(leaveRallySnap.data()?.status === "recalling", "A Rally creator leaving did not recall the whole Rally.");
  assert(leaveRallySnap.data()?.automaticRecallReason === "rally_creator_clan_departure", "The creator leave recall reason was not recorded.");
  assert(leaveArmySnap.data()?.returning === true, "The creator leave did not turn the combined Rally army around.");
  assert(leaveArmySnap.data()?.troops === 400, "The creator leave recall changed the combined troop count.");
  assert(leaveArmySnap.data()?.returnReason === "rally_creator_clan_departure", "The creator leave army has the wrong return reason.");

  const kickEntry = departureCreators[1];
  const kickRallyId = `rally_creator_kick_${crypto.randomBytes(4).toString("hex")}`;
  const kickArmyId = await seedLaunchedCreatorDepartureRally({
    clanId,
    rallyId: kickRallyId,
    creator: kickEntry.user,
    creatorName: kickEntry.name,
    creatorClaim: kickEntry.claim,
    participant: clanLeader,
    participantName: "Rally Clan Leader",
    participantClaim: leaderClaim,
    target: scaleTarget,
    targetRegionId: leaderClaim.regionId,
  });
  await callFunction("kickClanMember", clanLeader.token, { targetUid: kickEntry.user.uid });
  const [kickedMemberSnap, kickedProfileSnap, kickRallySnap, kickArmySnap] = await Promise.all([
    db.doc(`clans/${clanId}/members/${kickEntry.user.uid}`).get(),
    db.doc(`players/${kickEntry.user.uid}`).get(),
    db.doc(`clans/${clanId}/rallies/${kickRallyId}`).get(),
    db.doc(`armies/${kickArmyId}`).get(),
  ]);
  assert(!kickedMemberSnap.exists, "The creator was not removed after the automatic Rally recall.");
  assert(Number(kickedProfileSnap.data()?.shopItems?.recall_horn || 0) === 2, "A creator removal recall consumed a Recall Horn.");
  assert(kickRallySnap.data()?.status === "recalling", "Removing a Rally creator did not recall the whole Rally.");
  assert(kickArmySnap.data()?.returning === true && kickArmySnap.data()?.troops === 400, "The removed creator's combined Rally army did not return intact.");

  const changeEntry = departureCreators[2];
  const changeRallyId = `rally_creator_change_${crypto.randomBytes(4).toString("hex")}`;
  const changeArmyId = await seedLaunchedCreatorDepartureRally({
    clanId,
    rallyId: changeRallyId,
    creator: changeEntry.user,
    creatorName: changeEntry.name,
    creatorClaim: changeEntry.claim,
    participant: clanLeader,
    participantName: "Rally Clan Leader",
    participantClaim: leaderClaim,
    target: scaleTarget,
    targetRegionId: leaderClaim.regionId,
  });
  const changeProfileRef = db.doc(`players/${changeEntry.user.uid}`);
  const changeProfile = (await changeProfileRef.get()).data() || {};
  const newClanId = `rally_creator_new_clan_${crypto.randomBytes(4).toString("hex")}`;
  const changeBatch = db.batch();
  changeBatch.set(db.doc(`clans/${newClanId}`), {
    ...current,
    status: "active",
    leaderUid: changeEntry.user.uid,
    name: "Rally Creator New Clan",
    tag: "RCN",
    normalizedName: newClanId,
    normalizedTag: `rcn-${newClanId}`,
    memberCount: 1,
    totalKingPower: 0,
  });
  changeBatch.set(db.doc(`clans/${newClanId}/members/${changeEntry.user.uid}`), {
    ...current,
    clanId: newClanId,
    uid: changeEntry.user.uid,
    role: "leader",
    status: "active",
    displayName: changeEntry.name,
    kingPower: 0,
  });
  changeBatch.delete(db.doc(`clans/${clanId}/members/${changeEntry.user.uid}`));
  changeBatch.set(db.doc(`clans/${clanId}`), { memberCount: 17 }, { merge: true });
  changeBatch.set(changeProfileRef, {
    clanId: newClanId,
    clanName: "Rally Creator New Clan",
    clanTag: "RCN",
    clanRole: "leader",
    clanIdentityRevision: Math.max(0, Number(changeProfile.clanIdentityRevision) || 0) + 1,
    clanIdentityUpdatedAtMs: Date.now(),
    updatedAtMs: Date.now(),
  }, { merge: true });
  await changeBatch.commit();
  const changedRally = await waitFor(
    async () => (await db.doc(`clans/${clanId}/rallies/${changeRallyId}`).get()).data() || {},
    rally => rally.status === "recalling",
    "Changing clans did not automatically recall the creator's launched Rally"
  );
  const [changedArmySnap, changedProfileSnap, unchangedScaleRallySnap] = await Promise.all([
    db.doc(`armies/${changeArmyId}`).get(),
    changeProfileRef.get(),
    db.doc(`clans/${clanId}/rallies/${scaleRallyId}`).get(),
  ]);
  assert(changedRally.automaticRecallReason === "rally_creator_clan_departure", "The clan-change recall reason was not recorded.");
  assert(changedArmySnap.data()?.returning === true && changedArmySnap.data()?.troops === 400, "The clan-changing creator's combined Rally army did not return intact.");
  assert(Number(changedProfileSnap.data()?.shopItems?.recall_horn || 0) === 2, "A creator clan-change recall consumed a Recall Horn.");
  assert(unchangedScaleRallySnap.data()?.status === "launched", "A non-creator leaving the clan incorrectly recalled another creator's launched Rally.");

  console.log("Emulator Rally lifecycle passed: atomic survivor stationing, immediate defense, stale-return safety, 20-player launch, max-size cancellation, deterministic Rally returns, and automatic creator-departure recall.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
