const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");
const worldLayout = require("../world-layout.json");
const {
  createAuthoritativeRoutePlanner,
  imagePointToWorld,
} = require("../authoritative-route-planner.js");
const { getAuthoritativeTerrainBlockers } = require("../authoritative-route-policy.js");

const routePlanner = createAuthoritativeRoutePlanner(worldLayout, {
  getTerrainBlockers: getAuthoritativeTerrainBlockers,
});

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
      const emulators = await response.json();
      const functions = emulators?.functions || {};
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
      email: `daily-missions-${label}-${nonce}@example.test`,
      password: `Daily-Missions-${nonce}-Pass!`,
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

function firestoreDocumentUrl(documentPath) {
  return `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
}

async function clientDocumentRequest(user, documentPath, options = {}) {
  return fetch(firestoreDocumentUrl(documentPath), {
    ...options,
    headers: {
      authorization: `Bearer ${user.token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

async function pollUntil(read, predicate, message, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await read();
    if (predicate(latest)) return latest;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`${message} Last value: ${JSON.stringify(latest)}`);
}

async function main() {
  const [player, stranger] = await Promise.all([
    createAuthUser("owner"),
    createAuthUser("stranger"),
  ]);
  const [claim, strangerClaim] = await Promise.all([
    callFunction("claimStartingCity", player.token, { playerName: "Mission Sentinel" }),
    callFunction("claimStartingCity", stranger.token, { playerName: "Mission Target" }),
  ]);
  const regionId = String(claim.regionId || claim.islandId || "").replace(`${realm.worldId}-`, "");
  const region = worldLayout.maps.find(map => String(map.id) === regionId);
  const profileRef = db.doc(`players/${player.uid}`);
  const cityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const sourceCity = (await cityRef.get()).data() || {};
  const routeModel = routePlanner.getModel(regionId);
  const safeTargetSeed = region?.cities
    ?.filter(city => city.id !== claim.cityId && city.id !== strangerClaim.cityId && !city.strongholdType)
    .map(city => ({
      ...city,
      ...imagePointToWorld(routeModel, city),
      regionId,
      startPool: regionId,
    }))
    .filter(city => routePlanner.calculate(sourceCity, city))
    .sort((left, right) => (
      Math.hypot(Number(left.x) - Number(sourceCity.x), Number(left.y) - Number(sourceCity.y))
      - Math.hypot(Number(right.x) - Number(sourceCity.x), Number(right.y) - Number(sourceCity.y))
    ))[0];
  assert(safeTargetSeed, "A regular city seed was not available for Daily Mission safety tests.");
  const safeTargetRef = db.doc(`islands/${claim.islandId}/cities/${safeTargetSeed.id}`);
  const strangerLeaderboardRef = db.doc(`leaderboards/${realm.resetGeneration}/entries/${stranger.uid}`);
  const strangerGlobalStatsRef = db.doc(`players/${stranger.uid}/stats/global`);
  await Promise.all([
    profileRef.set({
      upgrades: {
        swordmastery: 0,
        shieldwallDiscipline: 0,
        stoneworks: 0,
        taxStewardship: 10,
        royalGranaries: 10,
        guildCharters: 0,
        marchOrders: 0,
        fieldMedics: 0,
      },
      economyUpdatedAtMs: Date.now(),
    }, { merge: true }),
    cityRef.set({ troops: 1_000_000, troopFloat: 1_000_000 }, { merge: true }),
    safeTargetRef.set({
      ...safeTargetSeed,
      regionId,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      ownerKind: "player",
      ownerUid: stranger.uid,
      ownerName: "Mission Target",
      ownerKingPower: 100_000_000,
      isMainCity: false,
      troops: 1,
      troopFloat: 1,
      alliedReinforcementTroops: 0,
      ownerShieldExpiresAtMs: 0,
    }, { merge: true }),
    strangerLeaderboardRef.set({
      uid: stranger.uid,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      cityCount: 2,
      kingPower: 100_000_000,
    }, { merge: true }),
    strangerGlobalStatsRef.set({ kingPower: 100_000_000 }, { merge: true }),
  ]);
  const firstStatus = await callFunction("getDailyMissionStatus", player.token);
  const secondStatus = await callFunction("getDailyMissionStatus", player.token);
  const first = firstStatus.dailyMissionState;
  const second = secondStatus.dailyMissionState;
  assert(first?.missions?.length === 3, "Daily Missions did not generate three entries.");
  assert(new Set(first.missions.map(mission => mission.family)).size === 3, "Daily Missions duplicated a family.");
  assert(first.missions.filter(mission => ["combat", "stronghold"].includes(mission.activityGroup)).length <= 1, "PvP and Stronghold missions did not share one slot.");
  assert(first.missions.filter(mission => mission.activityGroup === "camps").length <= 1, "Camp missions did not remain in one separate slot.");
  assert(JSON.stringify(first.missions) === JSON.stringify(second.missions), "Daily Missions changed after reopening.");
  assert(Number(first.rerollsRemaining) === 1, "Daily Missions did not start with one reroll.");
  const playerStats = (await db.doc(`players/${player.uid}/stats/global`).get()).data() || {};
  assert(Number(playerStats.goldPerHour) > Number(playerStats.baseGoldPerHour), "Production skills did not increase normal Gold production in the Daily Mission fixture.");
  assert(Number(playerStats.troopPerHour) > Number(playerStats.baseTroopPerHour), "Production skills did not increase normal troop production in the Daily Mission fixture.");
  assert(first.capacitySnapshot?.rewardGoldPerHour === undefined, "The internal raw Gold reward rate leaked into persisted Daily Mission state.");
  assert(first.capacitySnapshot?.rewardTroopPerHour === undefined, "The internal raw troop reward rate leaked into persisted Daily Mission state.");
  const numericRewards = first.missions.filter(mission => ["gold", "troops"].includes(mission.reward?.type));
  assert(numericRewards.length > 0, "The authoritative Daily Mission fixture did not generate a numeric reward.");
  numericRewards.forEach(mission => {
    const rawRate = mission.reward.type === "gold"
      ? Number(playerStats.baseGoldPerHour)
      : Number(playerStats.baseTroopPerHour);
    const expected = Math.max(1, Math.floor(rawRate * Number(mission.reward.productionHours)));
    assert(
      Number(mission.reward.lockedAmount) === expected,
      `${mission.reward.type} Daily Mission reward used boosted production (${mission.reward.lockedAmount}; expected raw ${expected}).`
    );
  });
  assert(
    first.capacitySnapshot?.safePvpTargets?.some(target => target.cityId === safeTargetSeed.id),
    `A reachable low-loss PvP target was not recommended: ${JSON.stringify(first.capacitySnapshot)}`
  );

  const statePath = `players/${player.uid}/dailyMissions/${first.cycleKey}`;
  const stateRef = db.doc(statePath);
  await stateRef.delete();
  await safeTargetRef.set({ ownerShieldExpiresAtMs: Date.now() + 86_400_000 }, { merge: true });
  const shieldedStatus = await callFunction("getDailyMissionStatus", player.token);
  assert(!shieldedStatus.dailyMissionState.capacitySnapshot?.safePvpTargets?.length, "A shielded city was recommended as a safe PvP target.");
  await stateRef.delete();
  await safeTargetRef.set({ ownerShieldExpiresAtMs: 0, alliedReinforcementTroops: 1 }, { merge: true });
  const reinforcedStatus = await callFunction("getDailyMissionStatus", player.token);
  assert(!reinforcedStatus.dailyMissionState.capacitySnapshot?.safePvpTargets?.length, "A reinforced city was recommended as a safe PvP target.");
  await stateRef.delete();
  await safeTargetRef.set({ alliedReinforcementTroops: 0, troops: 1_000_000, troopFloat: 1_000_000 }, { merge: true });
  const costlyStatus = await callFunction("getDailyMissionStatus", player.token);
  assert(!costlyStatus.dailyMissionState.capacitySnapshot?.safePvpTargets?.length, "A city outside the commitment/loss cap was recommended.");
  await stateRef.delete();
  await Promise.all([
    safeTargetRef.set({ troops: 1, troopFloat: 1 }, { merge: true }),
    strangerLeaderboardRef.set({ kingPower: 1 }, { merge: true }),
    strangerGlobalStatsRef.set({ kingPower: 1 }, { merge: true }),
  ]);
  const protectedStatus = await callFunction("getDailyMissionStatus", player.token);
  assert(!protectedStatus.dailyMissionState.capacitySnapshot?.safePvpTargets?.length, "A weaker-kingdom-protected target was recommended.");
  await stateRef.delete();
  await Promise.all([
    strangerLeaderboardRef.set({ kingPower: 100_000_000 }, { merge: true }),
    strangerGlobalStatsRef.set({ kingPower: 100_000_000 }, { merge: true }),
  ]);
  const restoredStatus = await callFunction("getDailyMissionStatus", player.token);
  assert(restoredStatus.dailyMissionState.capacitySnapshot?.safePvpTargets?.some(target => target.cityId === safeTargetSeed.id), "The safe PvP recommendation did not recover after conditions were restored.");

  const ownerRead = await clientDocumentRequest(player, statePath);
  assert(ownerRead.status === 200, `The owner could not read Daily Missions (HTTP ${ownerRead.status}).`);
  const strangerRead = await clientDocumentRequest(stranger, statePath);
  assert(strangerRead.status === 403, "Another player read private Daily Missions.");
  const clientWrite = await clientDocumentRequest(player, `${statePath}?updateMask.fieldPaths=rerollsRemaining`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { rerollsRemaining: { integerValue: "99" } } }),
  });
  assert(clientWrite.status === 403, "A client directly changed Daily Mission state.");

  const rerolled = await callFunction("rerollDailyMission", player.token, {
    cycleKey: first.cycleKey,
    missionId: first.missions[0].id,
    requestId: `reroll-${crypto.randomUUID()}`,
  });
  assert(rerolled.rerolled === true && Number(rerolled.dailyMissionState?.rerollsRemaining) === 0, "The daily reroll was not consumed exactly once.");
  assert(rerolled.dailyMissionState.missions[0].family !== first.missions[0].family, "The reroll returned the same mission family.");
  const secondReroll = await invokeFunction("rerollDailyMission", player.token, {
    cycleKey: first.cycleKey,
    missionId: rerolled.dailyMissionState.missions[0].id,
    requestId: `reroll-${crypto.randomUUID()}`,
  });
  assert(!secondReroll.ok && secondReroll.error?.status === "FAILED_PRECONDITION", "A second daily reroll was accepted.");

  const state = (await stateRef.get()).data() || {};
  const testMission = {
    ...state.missions[0],
    id: `emulator_attack_${player.uid}`,
    family: "ATTACK_COUNT",
    activityGroup: "combat",
    activityKey: "ATTACK_COUNT",
    difficulty: "easy",
    icon: "banner",
    title: "Raise the Banners",
    description: "Launch 1 attack",
    target: 1,
    progress: 0,
    uniqueProgressKeys: [],
    completedAtMs: 0,
    claimedAtMs: 0,
    reward: { type: "gold", lockedAmount: 12_345, productionHours: 0.5, itemId: "" },
  };
  const goldCampMission = {
    ...state.missions[1],
    id: `emulator_gold_camp_${player.uid}`,
    family: "GOLD_CAMP_CAPTURE",
    activityGroup: "camps",
    activityKey: "GOLD_CAMP_CAPTURE",
    difficulty: "easy",
    icon: "gold",
    title: "Seize the Tribute",
    description: "Capture the Gold Camp once",
    target: 1,
    progress: 0,
    uniqueProgressKeys: [],
    completedAtMs: 0,
    claimedAtMs: 0,
    reward: { type: "gold", lockedAmount: 10_000, productionHours: 0.5, itemId: "" },
  };
  const anyCampMission = {
    ...state.missions[2],
    id: `emulator_any_camp_${player.uid}`,
    family: "CAMP_CAPTURE_COUNT",
    activityGroup: "camps",
    activityKey: "CAMP_CAPTURE_COUNT",
    difficulty: "easy",
    icon: "camp",
    title: "Camp Raider",
    description: "Capture 1 camp",
    target: 1,
    progress: 0,
    uniqueProgressKeys: [],
    completedAtMs: 0,
    claimedAtMs: 0,
    reward: { type: "troops", lockedAmount: 10_000, productionHours: 0.5, itemId: "" },
  };
  await stateRef.set({
    missions: [testMission, goldCampMission, anyCampMission],
    completedCount: 0,
    claimedCount: 0,
    capacitySnapshot: {
      ...state.capacitySnapshot,
      launchableTroops: 1_000_000,
      qualifyingAttackTroops: 50_000,
    },
  }, { merge: true });

  const tokenEventRef = db.doc(`dailyMissionEvents/token_${player.uid}`);
  await tokenEventRef.set({
    eventId: `token_${player.uid}`,
    uid: player.uid,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    type: "ATTACK_LAUNCHED",
    occurredAtMs: Date.now(),
    targetCategory: "player_city",
    opponentUid: stranger.uid,
    committedTroops: 49_999,
    processedAtMs: 0,
    expiresAtMs: Date.now() + 86_400_000,
  });
  await pollUntil(
    () => tokenEventRef.get().then(snapshot => snapshot.data() || {}),
    event => Number(event.processedAtMs) > 0,
    "The token-attack mission event was not processed."
  );
  assert(Number((await stateRef.get()).data()?.missions?.[0]?.progress || 0) === 0, "A sub-5% token attack progressed a mission.");

  const validEventRef = db.doc(`dailyMissionEvents/valid_${player.uid}`);
  await validEventRef.set({
    eventId: `valid_${player.uid}`,
    uid: player.uid,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    type: "ATTACK_LAUNCHED",
    occurredAtMs: Date.now(),
    targetCategory: "player_city",
    opponentUid: stranger.uid,
    committedTroops: 50_000,
    processedAtMs: 0,
    expiresAtMs: Date.now() + 86_400_000,
  });
  const completedState = await pollUntil(
    () => stateRef.get().then(snapshot => snapshot.data() || {}),
    next => Number(next.missions?.[0]?.progress || 0) === 1 && Number(next.missions?.[0]?.completedAtMs || 0) > 0,
    "A qualifying attack did not complete its Daily Mission."
  );
  assert(Number(completedState.completedCount) >= 1, "Completed mission count did not update.");

  const failedCampEventRef = db.doc(`dailyMissionEvents/failed_camp_${player.uid}`);
  await failedCampEventRef.set({
    eventId: `failed_camp_${player.uid}`,
    uid: player.uid,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    type: "CAMP_CAPTURED",
    occurredAtMs: Date.now(),
    targetCategory: "camp",
    campType: "gold",
    committedTroops: 50_000,
    campCaptured: true,
    success: false,
    processedAtMs: 0,
    expiresAtMs: Date.now() + 86_400_000,
  });
  await pollUntil(
    () => failedCampEventRef.get().then(snapshot => snapshot.data() || {}),
    event => Number(event.processedAtMs) > 0,
    "The failed camp-capture mission event was not processed."
  );
  assert(Number((await stateRef.get()).data()?.missions?.[1]?.progress || 0) === 0, "A failed camp battle progressed a Daily Mission.");

  const campEventRef = db.doc(`dailyMissionEvents/gold_camp_${player.uid}`);
  await campEventRef.set({
    eventId: `gold_camp_${player.uid}`,
    uid: player.uid,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    type: "CAMP_CAPTURED",
    occurredAtMs: Date.now(),
    targetCategory: "camp",
    campType: "gold",
    committedTroops: 1,
    campCaptured: true,
    success: true,
    processedAtMs: 0,
    expiresAtMs: Date.now() + 86_400_000,
  });
  const campCompletedState = await pollUntil(
    () => stateRef.get().then(snapshot => snapshot.data() || {}),
    next => Number(next.missions?.[1]?.progress || 0) === 1
      && Number(next.missions?.[2]?.progress || 0) === 1
      && Number(next.missions?.[1]?.completedAtMs || 0) > 0
      && Number(next.missions?.[2]?.completedAtMs || 0) > 0,
    "A successful Gold Camp capture did not complete both the specific and any-camp Daily Missions."
  );
  assert(Number(campCompletedState.completedCount) === 3, "Daily Mission completion totals did not include both camp missions.");

  const outboxRead = await clientDocumentRequest(player, `dailyMissionEvents/valid_${player.uid}`);
  assert(outboxRead.status === 403, "A client read the protected Daily Mission event outbox.");

  const nowMs = Date.now();
  await Promise.all([
    profileRef.set({ economyUpdatedAtMs: nowMs }, { merge: true }),
    cityRef.set({ productionUpdatedAtMs: nowMs }, { merge: true }),
  ]);
  const goldBefore = Number((await profileRef.get()).data()?.goldFloat || 0);
  const claims = await Promise.all([
    invokeFunction("claimDailyMissionReward", player.token, {
      cycleKey: first.cycleKey,
      missionId: testMission.id,
      requestId: `claim-${crypto.randomUUID()}`,
    }),
    invokeFunction("claimDailyMissionReward", player.token, {
      cycleKey: first.cycleKey,
      missionId: testMission.id,
      requestId: `claim-${crypto.randomUUID()}`,
    }),
  ]);
  assert(claims.every(result => result.ok), `Concurrent mission claims failed: ${JSON.stringify(claims)}`);
  assert(claims.filter(result => result.result?.replayed === false).length === 1, "Mission reward was not granted exactly once.");
  assert(claims.filter(result => result.result?.replayed === true).length === 1, "Duplicate mission claim was not identified as a replay.");
  const goldAfter = Number((await profileRef.get()).data()?.goldFloat || 0);
  assert(goldAfter >= goldBefore + 12_345 && goldAfter < goldBefore + 12_600, `Mission reward was duplicated or misvalued (${goldBefore} -> ${goldAfter}).`);
  const claimedState = (await stateRef.get()).data() || {};
  assert(Number(claimedState.missions?.[0]?.claimedAtMs || 0) > 0, "The claimed mission did not persist its claimed state.");

  const legacyUnsafeReward = { type: "troops", lockedAmount: 9_876, productionHours: 0.5, itemId: "" };
  const legacyVolumeReward = { type: "troops", lockedAmount: 22_222, productionHours: 2, itemId: "" };
  const legacyClaimedMission = { ...claimedState.missions[0] };
  const legacyUnsafeMission = {
    ...claimedState.missions[1],
    id: `legacy_capture_${player.uid}`,
    family: "ENEMY_CITY_CAPTURE",
    activityGroup: "combat",
    activityKey: "ENEMY_CITY_CAPTURE",
    difficulty: "hard",
    title: "Conqueror",
    description: "Capture 3 enemy cities",
    target: 3,
    progress: 0,
    uniqueProgressKeys: [],
    completedAtMs: 0,
    claimedAtMs: 0,
    reward: legacyUnsafeReward,
  };
  const legacyVolumeMission = {
    ...claimedState.missions[2],
    id: `legacy_troops_${player.uid}`,
    family: "TROOPS_SENT_TO_BATTLE",
    activityGroup: "combat",
    activityKey: "TROOPS_SENT_TO_BATTLE",
    difficulty: "hard",
    title: "Muster the Host",
    description: "Send 1,800,000 troops into battle",
    target: 1_800_000,
    progress: 150_000,
    uniqueProgressKeys: [],
    completedAtMs: 0,
    claimedAtMs: 0,
    reward: legacyVolumeReward,
  };
  await Promise.all([
    safeTargetRef.set({ ownerShieldExpiresAtMs: Date.now() + 86_400_000 }, { merge: true }),
    stateRef.set({
      schemaVersion: 1,
      missions: [legacyClaimedMission, legacyUnsafeMission, legacyVolumeMission],
      completedCount: 1,
      claimedCount: 1,
      rerollsRemaining: 0,
    }, { merge: true }),
  ]);
  const migrationResponses = await Promise.all([
    callFunction("getDailyMissionStatus", player.token),
    callFunction("getDailyMissionStatus", player.token),
  ]);
  assert(migrationResponses.every(response => Number(response.dailyMissionState?.schemaVersion) === 2), "Concurrent legacy migration did not converge on schema v2.");
  const migratedState = (await stateRef.get()).data() || {};
  assert(Number(migratedState.schemaVersion) === 2, "Legacy Daily Missions did not persist schema v2.");
  assert(Number(migratedState.rerollsRemaining) === 0, "Legacy migration restored a consumed reroll.");
  assert(Number(migratedState.missions?.[0]?.claimedAtMs || 0) === Number(legacyClaimedMission.claimedAtMs), "Legacy migration changed a claimed mission.");
  assert(migratedState.missions?.[1]?.family === "ATTACK_COUNT" && Number(migratedState.missions?.[1]?.target) === 1, "An unsafe legacy capture was not replaced with one meaningful attack.");
  assert(Number(migratedState.missions?.[1]?.reward?.lockedAmount) === legacyUnsafeReward.lockedAmount, "Unsafe migration changed the locked reward.");
  assert(Number(migratedState.missions?.[2]?.target) < 1_800_000, "Legacy troop-volume target was not reduced.");
  assert(Number(migratedState.missions?.[2]?.completedAtMs || 0) > 0, "Retained progress did not complete the lowered troop mission.");
  assert(Number(migratedState.missions?.[2]?.reward?.lockedAmount) === legacyVolumeReward.lockedAmount, "Volume migration changed the locked reward.");

  console.log("Daily Missions emulator gate passed: private state, UTC persistence, balanced selection, one reroll, PvP thresholds, successful camp progress, schema-v2 migration, event processing, and idempotent claims are enforced.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
