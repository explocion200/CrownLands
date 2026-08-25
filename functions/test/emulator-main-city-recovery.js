const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");
const worldLayout = require("../world-layout.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const value = String(host || "127.0.0.1").trim();
  const formatted = value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
  return `${formatted}:${port}`;
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
      if (!host || !Number.isInteger(port) || port < 1) throw new Error("Functions emulator was not discovered.");
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
      email: `main-city-${label}-${nonce}@example.test`,
      password: `Recovery-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunctionResult(name, token, data = {}) {
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
  return { ok: response.ok && !body.error, result: body.result, error: body.error || null };
}

async function callFunction(name, token, data = {}) {
  const outcome = await callFunctionResult(name, token, data);
  if (!outcome.ok) throw new Error(`${name} failed: ${JSON.stringify(outcome.error)}`);
  return outcome.result;
}

function updateTimeMs(snapshot) {
  return snapshot?.updateTime?.toMillis?.() || 0;
}

function getRegionIdFromIslandId(islandId = "") {
  return String(islandId).replace(`${realm.worldId}-`, "");
}

function getRegularCityIds(regionId = "") {
  const map = worldLayout.maps.find(entry => entry.id === regionId);
  return (Array.isArray(map?.cities) ? map.cities : []).map(city => city.id).filter(Boolean);
}

function getStrongholdSeed() {
  for (const map of worldLayout.maps) {
    const objective = Array.isArray(map.objectives) ? map.objectives[0] : null;
    if (objective?.id) return { ...objective, regionId: map.id };
  }
  throw new Error("No stronghold seed is configured.");
}

function persistentGearFixture() {
  return {
    schemaVersion: 1,
    commonGearBoxes: 4,
    nextInstanceNumber: 2,
    lastOpenRequestId: "",
    lastOpenReceipt: null,
    instances: {
      recovery_blade: {
        instanceId: "recovery_blade",
        gearKey: "barracks_weapon_common_01",
        buildingId: "barracks",
        slot: "weapon",
        rarity: "common",
        level: 3,
        isEquipped: true,
        isNew: false,
        acquiredAtMs: 1_730_000_000_000,
        upgradedAtMs: 1_730_000_000_001,
      },
    },
    equipped: { barracks: { weapon: "recovery_blade" } },
    newMarkers: {},
  };
}

async function main() {
  const [player, stranger, archivedPlayer, noCityPlayer] = await Promise.all([
    createAuthUser("player"),
    createAuthUser("stranger"),
    createAuthUser("archived"),
    createAuthUser("no-city"),
  ]);
  const [claim, strangerClaim, noCityClaim] = await Promise.all([
    callFunction("claimStartingCity", player.token, { playerName: "Recovery Ruler" }),
    callFunction("claimStartingCity", stranger.token, { playerName: "Other Ruler" }),
    callFunction("claimStartingCity", noCityPlayer.token, { playerName: "Replacement Ruler" }),
  ]);

  const playerRef = db.doc(`players/${player.uid}`);
  const mainCityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const regionId = getRegionIdFromIslandId(claim.islandId);
  const regularIds = getRegularCityIds(regionId);
  const citySnaps = await db.collection(`islands/${claim.islandId}/cities`).get();
  const cityById = new Map(citySnaps.docs.map(doc => [doc.id, doc]));
  const spareCityIds = regularIds.filter(id => id !== claim.cityId && !cityById.get(id)?.data()?.ownerUid);
  assert(spareCityIds.length >= 2, "The recovery test requires two neutral regular cities.");
  const secondCityId = spareCityIds[0];
  const otherOwnerCityId = spareCityIds[1];
  const secondCityRef = db.doc(`islands/${claim.islandId}/cities/${secondCityId}`);
  const otherOwnerCityRef = db.doc(`islands/${claim.islandId}/cities/${otherOwnerCityId}`);
  const secondSeed = cityById.get(secondCityId)?.data() || {};
  const otherOwnerSeed = cityById.get(otherOwnerCityId)?.data() || {};

  await Promise.all([
    secondCityRef.set({
      ...secondSeed,
      id: secondCityId,
      regionId,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      ownerKind: "player",
      ownerUid: player.uid,
      ownerName: "Recovery Ruler",
      isMainCity: false,
      troops: 2468,
      troopFloat: 2468,
      level: 2,
      claimedAt: FieldValue.serverTimestamp(),
    }),
    otherOwnerCityRef.set({
      ...otherOwnerSeed,
      id: otherOwnerCityId,
      regionId,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      ownerKind: "player",
      ownerUid: stranger.uid,
      ownerName: "Other Ruler",
      isMainCity: false,
      troops: 1357,
      troopFloat: 1357,
      level: 2,
      claimedAt: FieldValue.serverTimestamp(),
    }),
    playerRef.set({
      gold: 987654,
      goldFloat: 987654,
      character: { level: 9, xp: 7654, skillPoints: 2 },
      upgrades: { swordmastery: 3 },
      daily: { cityCaptures: 7, campCaptures: 4 },
      gear: persistentGearFixture(),
      clanId: "recovery_clan",
      clanName: "Recovery Clan",
      clanTag: "RCV",
      clanRole: "officer",
      flag: { version: 2, background: "#112233", division: "solid", symbol: "lion" },
      recoverySeasonMarker: "preserve-me",
    }, { merge: true }),
    db.doc(`players/${player.uid}/dailyMissions/recovery`).set({ progress: 8, claimed: false }),
    db.doc(`players/${player.uid}/seasonalAchievements/recovery`).set({ progress: 13, claimed: true }),
  ]);

  // false main-city flag
  await Promise.all([
    mainCityRef.set({ isMainCity: false }, { merge: true }),
    playerRef.set({ mainCityAssignmentVersion: 0 }, { merge: true }),
  ]);
  let recovery = await callFunction("repairMainCityAssignment", player.token);
  assert(recovery.currentUser?.mainCityId === claim.cityId, "The false main-city flag changed a valid profile pointer.");
  assert((await mainCityRef.get()).data()?.isMainCity === true, "The false main-city flag was not repaired.");

  // multiple main-city flags
  await secondCityRef.set({ isMainCity: true }, { merge: true });
  recovery = await callFunction("repairMainCityAssignment", player.token);
  assert(recovery.currentUser?.mainCityId === claim.cityId, "Multiple flags displaced the profile-selected main city.");
  assert((await mainCityRef.get()).data()?.isMainCity === true, "The canonical city lost its main flag.");
  assert((await secondCityRef.get()).data()?.isMainCity === false, "The multiple main-city flags were not reduced to exactly one.");

  // stale main-city pointer and another player's city
  await Promise.all([
    mainCityRef.set({ isMainCity: false }, { merge: true }),
    secondCityRef.set({ isMainCity: true }, { merge: true }),
    playerRef.set({
      mainCityId: otherOwnerCityId,
      mainIslandId: claim.islandId,
      mainRegionId: regionId,
    }, { merge: true }),
  ]);
  recovery = await callFunction("repairMainCityAssignment", player.token);
  assert(recovery.currentUser?.mainCityId === secondCityId, "The stale main-city pointer did not recover to another owned regular city.");
  assert(recovery.currentUser?.mainCityId !== otherOwnerCityId, "Recovery selected another player's city.");
  let profile = (await playerRef.get()).data() || {};
  assert(
    profile.mainCityId === secondCityId
      && profile.mainIslandId === claim.islandId
      && profile.mainRegionId === regionId,
    "The stale main-city pointer was not repaired atomically on the profile."
  );

  // stronghold cannot become main
  const stronghold = getStrongholdSeed();
  const strongholdIslandId = `${realm.worldId}-${stronghold.regionId}`;
  const strongholdRef = db.doc(`islands/${strongholdIslandId}/cities/${stronghold.id}`);
  await Promise.all([
    strongholdRef.set({
      ...stronghold,
      id: stronghold.id,
      regionId: stronghold.regionId,
      kind: "stronghold",
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      ownerKind: "player",
      ownerUid: player.uid,
      ownerName: "Recovery Ruler",
      isMainCity: true,
    }),
    playerRef.set({
      mainCityId: stronghold.id,
      mainIslandId: strongholdIslandId,
      mainRegionId: stronghold.regionId,
    }, { merge: true }),
  ]);
  recovery = await callFunction("repairMainCityAssignment", player.token);
  assert(recovery.currentUser?.mainCityId === secondCityId, "A stronghold displaced the valid owned regular city.");
  assert((await strongholdRef.get()).data()?.isMainCity === false, "The stronghold retained an invalid main-city flag.");

  const playerStatsRef = db.doc(`players/${player.uid}/stats/global`);
  const playerLeaderboardRef = db.doc(`leaderboards/${realm.resetGeneration}/entries/${player.uid}`);
  const staleProjection = {
    mainCityId: claim.cityId,
    mainIslandId: claim.islandId,
    mainRegionId: regionId,
  };

  // stale Global Stats projection
  const [profileBeforeStatsRepair, leaderboardBeforeStatsRepair] = await Promise.all([
    playerRef.get(),
    playerLeaderboardRef.get(),
  ]);
  await playerStatsRef.set(staleProjection, { merge: true });
  recovery = await callFunction("repairMainCityAssignment", player.token);
  const [profileAfterStatsRepair, statsAfterStatsRepair, leaderboardAfterStatsRepair] = await Promise.all([
    playerRef.get(),
    playerStatsRef.get(),
    playerLeaderboardRef.get(),
  ]);
  assert(recovery.mainCityRecoveryStatus === "repaired", "A stale Global Stats projection was not reported as repaired.");
  assert(statsAfterStatsRepair.data()?.mainCityId === secondCityId, "The stale Global Stats projection was not repaired.");
  assert(recovery.globalStats?.mainCityId === secondCityId, "The recovery response returned stale Global Stats.");
  assert(updateTimeMs(profileAfterStatsRepair) === updateTimeMs(profileBeforeStatsRepair), "Projection-only repair rewrote the profile.");
  assert(
    updateTimeMs(leaderboardAfterStatsRepair) === updateTimeMs(leaderboardBeforeStatsRepair),
    "Global Stats-only repair rewrote the correct leaderboard projection."
  );

  // stale leaderboard projection
  const [profileBeforeLeaderboardRepair, statsBeforeLeaderboardRepair] = await Promise.all([
    playerRef.get(),
    playerStatsRef.get(),
  ]);
  await playerLeaderboardRef.set(staleProjection, { merge: true });
  recovery = await callFunction("repairMainCityAssignment", player.token);
  const [profileAfterLeaderboardRepair, statsAfterLeaderboardRepair, leaderboardAfterLeaderboardRepair] = await Promise.all([
    playerRef.get(),
    playerStatsRef.get(),
    playerLeaderboardRef.get(),
  ]);
  assert(recovery.mainCityRecoveryStatus === "repaired", "A stale leaderboard projection was not reported as repaired.");
  assert(leaderboardAfterLeaderboardRepair.data()?.mainCityId === secondCityId, "The stale leaderboard projection was not repaired.");
  assert(updateTimeMs(profileAfterLeaderboardRepair) === updateTimeMs(profileBeforeLeaderboardRepair), "Leaderboard-only repair rewrote the profile.");
  assert(
    updateTimeMs(statsAfterLeaderboardRepair) === updateTimeMs(statsBeforeLeaderboardRepair),
    "Leaderboard-only repair rewrote the correct Global Stats projection."
  );

  // both projections stale
  await Promise.all([
    playerStatsRef.set(staleProjection, { merge: true }),
    playerLeaderboardRef.set(staleProjection, { merge: true }),
  ]);
  recovery = await callFunction("repairMainCityAssignment", player.token);
  const [statsAfterBothRepair, leaderboardAfterBothRepair] = await Promise.all([
    playerStatsRef.get(),
    playerLeaderboardRef.get(),
  ]);
  assert(recovery.mainCityRecoveryStatus === "repaired", "Both stale projections were not reported as repaired.");
  assert(
    statsAfterBothRepair.data()?.mainCityId === secondCityId
      && leaderboardAfterBothRepair.data()?.mainCityId === secondCityId,
    "Both stale projections were not repaired to the canonical city."
  );

  // already-correct projections
  const [profileBeforeValidRecovery, statsBeforeValidRecovery, leaderboardBeforeValidRecovery] = await Promise.all([
    playerRef.get(),
    playerStatsRef.get(),
    playerLeaderboardRef.get(),
  ]);
  recovery = await callFunction("repairMainCityAssignment", player.token);
  const [profileAfterValidRecovery, statsAfterValidRecovery, leaderboardAfterValidRecovery] = await Promise.all([
    playerRef.get(),
    playerStatsRef.get(),
    playerLeaderboardRef.get(),
  ]);
  assert(recovery.mainCityRecoveryStatus === "valid", "Already-correct projections were incorrectly reported as repaired.");
  assert(updateTimeMs(profileAfterValidRecovery) === updateTimeMs(profileBeforeValidRecovery), "Valid recovery rewrote the profile.");
  assert(updateTimeMs(statsAfterValidRecovery) === updateTimeMs(statsBeforeValidRecovery), "Valid recovery rewrote Global Stats.");
  assert(
    updateTimeMs(leaderboardAfterValidRecovery) === updateTimeMs(leaderboardBeforeValidRecovery),
    "Valid recovery rewrote the leaderboard."
  );

  // missing projection documents
  const strangerStatsRef = db.doc(`players/${stranger.uid}/stats/global`);
  const strangerLeaderboardRef = db.doc(`leaderboards/${realm.resetGeneration}/entries/${stranger.uid}`);
  await Promise.all([strangerStatsRef.delete(), strangerLeaderboardRef.delete()]);
  const strangerRecovery = await callFunction("repairMainCityAssignment", stranger.token);
  const [missingStatsAfterRecovery, missingLeaderboardAfterRecovery] = await Promise.all([
    strangerStatsRef.get(),
    strangerLeaderboardRef.get(),
  ]);
  assert(strangerRecovery.currentUser?.mainCityId === strangerClaim.cityId, "Missing projections changed the canonical main city.");
  assert(!missingStatsAfterRecovery.exists, "Recovery created a missing Global Stats projection.");
  assert(!missingLeaderboardAfterRecovery.exists, "Recovery created a missing leaderboard projection.");

  // preserved recovery state
  const [profileAfterRecovery, dailyAfterRecovery, achievementsAfterRecovery] = await Promise.all([
    playerRef.get(),
    db.doc(`players/${player.uid}/dailyMissions/recovery`).get(),
    db.doc(`players/${player.uid}/seasonalAchievements/recovery`).get(),
  ]);
  profile = profileAfterRecovery.data() || {};
  assert(profile.gold === 987654 && profile.goldFloat === 987654, "Gold changed during main-city recovery.");
  assert(profile.character?.level === 9 && profile.upgrades?.swordmastery === 3, "Seasonal progression changed during recovery.");
  assert(profile.daily?.cityCaptures === 7 && profile.recoverySeasonMarker === "preserve-me", "Seasonal state changed during recovery.");
  assert(profile.gear?.commonGearBoxes === 4, "Unopened Gear Boxes changed during recovery.");
  assert(profile.gear?.instances?.recovery_blade?.level === 3, "Persistent Gear progression changed during recovery.");
  assert(profile.clanId === "recovery_clan" && profile.clanRole === "officer", "Clan identity changed during recovery.");
  assert(profile.flag?.background === "#112233", "Player customization changed during recovery.");
  assert(dailyAfterRecovery.data()?.progress === 8, "Daily Mission state changed during recovery.");
  assert(achievementsAfterRecovery.data()?.progress === 13, "Achievement state changed during recovery.");
  const economy = await callFunction("collectEconomy", player.token);
  assert(economy?.ok !== false, "collectEconomy was blocked after valid main-city recovery.");

  // archived player
  const archivedRef = db.doc(`players/${archivedPlayer.uid}`);
  await archivedRef.set({
    uid: archivedPlayer.uid,
    playerName: "Archived Ruler",
    worldId: "main-archived-generation",
    resetGeneration: "archived-generation",
    mainCityId: claim.cityId,
    mainIslandId: claim.islandId,
    mainRegionId: regionId,
    gold: 444444,
    gear: persistentGearFixture(),
  });
  const archivedBefore = await archivedRef.get();
  const archivedOutcome = await callFunctionResult("repairMainCityAssignment", archivedPlayer.token);
  const archivedAfter = await archivedRef.get();
  assert(!archivedOutcome.ok && archivedOutcome.error?.status === "FAILED_PRECONDITION", "The archived player reached main-city repair.");
  assert(updateTimeMs(archivedAfter) === updateTimeMs(archivedBefore), "Rejected archived player repair changed the profile.");

  // no valid regular city
  const noCityProfileRef = db.doc(`players/${noCityPlayer.uid}`);
  const noCityMainRef = db.doc(`islands/${noCityClaim.islandId}/cities/${noCityClaim.cityId}`);
  await Promise.all([
    noCityProfileRef.set({
      gold: 777777,
      goldFloat: 777777,
      gear: persistentGearFixture(),
      recoverySeasonMarker: "must-reset-on-new-claim",
    }, { merge: true }),
    noCityMainRef.set({
      ownerKind: "neutral",
      ownerUid: "",
      ownerName: "",
      isMainCity: false,
    }, { merge: true }),
  ]);
  const noCityStatsRef = db.doc(`players/${noCityPlayer.uid}/stats/global`);
  const noCityLeaderboardRef = db.doc(`leaderboards/${realm.resetGeneration}/entries/${noCityPlayer.uid}`);
  const [noCityProfileBefore, noCityStatsBefore, noCityLeaderboardBefore] = await Promise.all([
    noCityProfileRef.get(),
    noCityStatsRef.get(),
    noCityLeaderboardRef.get(),
  ]);
  const noCityRecovery = await callFunction("repairMainCityAssignment", noCityPlayer.token);
  const [noCityProfileAfter, noCityStatsAfter, noCityLeaderboardAfter] = await Promise.all([
    noCityProfileRef.get(),
    noCityStatsRef.get(),
    noCityLeaderboardRef.get(),
  ]);
  assert(
    noCityRecovery.requiresStartingCityClaim === true
      && noCityRecovery.mainCityRecoveryStatus === "claim-required"
      && noCityRecovery.recoveryReason === "no-valid-owned-regular-city",
    "The no valid regular city case did not return the explicit claim result."
  );
  assert(updateTimeMs(noCityProfileAfter) === updateTimeMs(noCityProfileBefore), "No-city recovery discovery changed the profile.");
  assert(updateTimeMs(noCityStatsAfter) === updateTimeMs(noCityStatsBefore), "No-city recovery discovery changed global stats.");
  assert(updateTimeMs(noCityLeaderboardAfter) === updateTimeMs(noCityLeaderboardBefore), "No-city recovery discovery changed the leaderboard.");

  const replacementClaim = await callFunction("claimStartingCity", noCityPlayer.token, { playerName: "Replacement Ruler" });
  assert(replacementClaim.cityId && replacementClaim.cityId !== noCityClaim.cityId, "The no-city player did not receive a replacement city.");
  const replacementProfile = (await noCityProfileRef.get()).data() || {};
  assert(replacementProfile.gold !== 777777, "A replacement claim preserved seasonal Gold.");
  assert(!replacementProfile.recoverySeasonMarker, "A replacement claim preserved seasonal progress outside the allowlist.");
  assert(replacementProfile.gear?.commonGearBoxes === 4, "A replacement claim reset unopened Gear Boxes.");
  assert(replacementProfile.gear?.instances?.recovery_blade?.level === 3, "A replacement claim reset persistent Gear progression.");
  const replacementEconomy = await callFunction("collectEconomy", noCityPlayer.token);
  assert(replacementEconomy?.ok !== false, "collectEconomy was blocked after the replacement starting-city claim.");

  assert(strangerClaim.cityId, "The another player's city fixture was not created.");
  console.log("Emulator main-city recovery passed: archived player, false main-city flag, multiple main-city flags, stale main-city pointer, another player's city, stronghold, no valid regular city, preserved recovery state, and collectEconomy coverage.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
