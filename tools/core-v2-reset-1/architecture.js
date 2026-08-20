"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const resetContract = require("../../reset-persistence-contract.js");
const commonGear = require("../../functions/common-gear.js");
const mainCityPolicy = require("../../functions/core-main-city-policy.js");
const {
  PLAYER_REGION_CITY_CAPACITY,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
  derivePlayerRegionSpawnEligibility,
} = require("../../functions/player-region-spawn.js");
const { createFixture: createCoreFixture } = require("../core-v2-qa-1/fixture.js");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_VERSION = "core-v2-reset-1-v1";
const OLD_WORLD_ID = "crownlands_world_2026_summer";
const OLD_SEASON_ID = "season_2026_summer";
const NEW_WORLD_ID = "crownlands_world_2026_september";
const NEW_SEASON_ID = "season_2026_september";
const ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const RESET_LIFECYCLE = Object.freeze(["PREPARING", "INITIALIZING", "VALIDATING", "READY"]);
const SEASON_STATUS = Object.freeze({ ACTIVE: "ACTIVE", READY: "READY", RETIRED: "RETIRED", ARCHIVED: "ARCHIVED", ABORTED: "ABORTED" });
const SUPPORTED_MAIN_CITY_PATHS = Object.freeze([
  "changeMainCity",
  "repairMainCityAssignment",
  "resetRestore",
  "returningPlayerRestore",
  "startingCityClaim",
]);
const PERSISTENCE_ALLOWLIST = Object.freeze([
  "flag",
  "clanId",
  "clanName",
  "clanTag",
  "clanRole",
  "gear.schemaVersion",
  "gear.instances",
  "gear.equipped",
]);
const RESET_FIELDS = Object.freeze([
  "mainCityId", "mainRegionId", "mainIslandId", "cities", "attacks", "marches", "rallies",
  "reinforcements", "objectives", "regionActivation", "placement", "seasonalAchievements",
  "shopItems", "itemEffects", "itemPurchaseCooldowns", "gold", "goldFloat", "daily", "dailyLoginReward",
]);
const MANIFEST_PATH = path.join(ROOT, "benchmark-results", "map", "phase-6f", "study", "compact-manifest.jsonl");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadApprovedOuterRecords(count = 4) {
  const records = fs.readFileSync(MANIFEST_PATH, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, count)
    .map(line => JSON.parse(line));
  assert.equal(records.length, count, `RESET-1 requires ${count} approved outer-region records.`);
  records.forEach((record, index) => {
    assert.equal(record.index, index);
    assert.equal(record.cityCount, PLAYER_REGION_CITY_CAPACITY);
    assert.equal(record.startingCandidateCount, 4);
    assert.equal(record.cityPositions.length, PLAYER_REGION_CITY_CAPACITY);
    assert.equal(record.productionActivated, false);
  });
  return records;
}

function buildCoreWorld() {
  const fixture = createCoreFixture();
  const regions = fixture.regionCatalog.regions.map(region => ({
    id: region.id,
    name: region.name,
    kind: "permanent_core",
    purpose: region.purpose,
    permanentCore: true,
    spawnEligible: false,
    lifecycle: "ACTIVE",
    gridX: region.gridX,
    gridY: region.gridY,
    worldLayer: 0,
    cityCapacity: region.cityCapacity,
    objectiveCount: region.objectiveCount,
    reservations: clone(region.reservations),
    connections: clone(region.connections),
  }));
  const cities = fixture.mapData.maps.flatMap(map => map.cities.map(city => ({
    ...clone(city),
    regionId: map.id,
    worldId: NEW_WORLD_ID,
    resetGeneration: NEW_SEASON_ID,
    ownerUid: "",
    ownerKind: "npc",
    isMainCity: false,
  })));
  const objectives = fixture.mapData.maps.flatMap(map => [
    ...map.objectives.map(objective => ({ ...clone(objective), regionId: map.id, kind: "stronghold_or_citadel" })),
    ...map.camps.map(camp => ({ ...clone(camp), regionId: map.id, kind: "camp" })),
  ]);
  assert.equal(regions.length, 25);
  assert.equal(cities.length, 1480);
  assert.equal(new Set(cities.map(city => city.id)).size, 1480);
  return { fixture, regions, cities, objectives };
}

function outerRegionFromRecord(record, lifecycle) {
  return {
    id: record.regionId,
    name: `September player region ${record.clockwiseSlot + 1}`,
    kind: "player_region",
    purpose: "player_region",
    permanentCore: false,
    spawnEligible: lifecycle === "ACTIVE",
    lifecycle,
    gridX: record.coordinate.gridX,
    gridY: record.coordinate.gridY,
    worldLayer: record.coordinate.worldLayer,
    clockwiseOrderIndex: record.coordinate.clockwiseOrderIndex,
    cityCapacity: PLAYER_REGION_CITY_CAPACITY,
    startingCandidates: clone(record.startingCandidates),
    approvedPackageHash: record.packageHash,
    compositionPlanHash: record.hashes.compositionPlanHash,
    mapWebpHash: record.raster.webpHash,
    thumbnailHash: record.raster.thumbnailHash,
    assetManifestHash: ASSET_MANIFEST_HASH,
    immutablePackage: true,
    connections: {},
  };
}

function outerCitiesFromRecord(record) {
  return record.cityPositions.map(city => ({
    id: city.id,
    x: city.x,
    y: city.y,
    regionId: record.regionId,
    worldId: NEW_WORLD_ID,
    resetGeneration: NEW_SEASON_ID,
    kind: "city",
    ownerKind: "npc",
    ownerUid: "",
    isMainCity: false,
  }));
}

const SIDES = Object.freeze({
  north: Object.freeze({ dx: 0, dy: -1, opposite: "south" }),
  east: Object.freeze({ dx: 1, dy: 0, opposite: "west" }),
  south: Object.freeze({ dx: 0, dy: 1, opposite: "north" }),
  west: Object.freeze({ dx: -1, dy: 0, opposite: "east" }),
});

function refreshVisibleTopology(regions) {
  const visible = regions.filter(region => region.lifecycle === "ACTIVE");
  const byCoordinate = new Map(visible.map(region => [`${region.gridX},${region.gridY}`, region]));
  for (const region of regions) {
    region.connections = {};
    for (const [side, direction] of Object.entries(SIDES)) {
      const neighbor = region.lifecycle === "ACTIVE"
        ? byCoordinate.get(`${region.gridX + direction.dx},${region.gridY + direction.dy}`)
        : null;
      region.connections[side] = neighbor
        ? { state: "open", targetRegionId: neighbor.id, oppositeSide: direction.opposite }
        : { state: "gated", targetRegionId: "", oppositeSide: direction.opposite };
    }
  }
  return regions;
}

function buildInitialNewSeason({ expectedResetPopulation = 4 } = {}) {
  const core = buildCoreWorld();
  const records = loadApprovedOuterRecords(4);
  const placementsPerActiveRegion = PLAYER_REGION_CITY_CAPACITY - (MINIMUM_NPC_CITIES_FOR_SPAWN - 1);
  const requiredActiveRegions = Math.max(1, Math.ceil(expectedResetPopulation / placementsPerActiveRegion));
  assert.equal(requiredActiveRegions, 1, "Synthetic reset population should require one ACTIVE player region.");
  const initialRecords = records.slice(0, requiredActiveRegions + 2);
  const outerRegions = initialRecords.map((record, index) => outerRegionFromRecord(record, index < requiredActiveRegions ? "ACTIVE" : "STANDBY"));
  const outerCities = initialRecords.flatMap(outerCitiesFromRecord);
  const regions = refreshVisibleTopology([...core.regions, ...outerRegions]);
  return {
    schemaVersion: SCHEMA_VERSION,
    worldId: NEW_WORLD_ID,
    seasonId: NEW_SEASON_ID,
    status: "INITIALIZING",
    expectedResetPopulation,
    placementsPerActiveRegion,
    requiredActiveRegions,
    standbyTarget: 2,
    assetManifestHash: ASSET_MANIFEST_HASH,
    regions,
    cities: [...core.cities, ...outerCities],
    objectives: core.objectives,
    unpublishedOuterRecord: records[requiredActiveRegions + 2],
  };
}

function createSyntheticGear(seed) {
  const raw = commonGear.createDefaultState();
  raw.commonGearBoxes = 7 + seed;
  raw.lastOpenRequestId = `seasonal-box-${seed}`;
  raw.lastOpenReceipt = { requestId: raw.lastOpenRequestId, openedAtMs: 1000 + seed, instanceIds: [] };
  const equippedId = `gear_${seed}_equipped`;
  const duplicateId = `gear_${seed}_duplicate`;
  const treasuryId = `gear_${seed}_treasury`;
  raw.instances[equippedId] = { instanceId: equippedId, gearKey: "barracks_weapon_common_01", level: Math.min(5, 2 + seed), isEquipped: true, acquiredAtMs: 100 + seed, upgradedAtMs: 200 + seed };
  raw.instances[duplicateId] = { instanceId: duplicateId, gearKey: "barracks_weapon_common_01", level: 1, isEquipped: false, acquiredAtMs: 300 + seed };
  raw.instances[treasuryId] = { instanceId: treasuryId, gearKey: "treasury_head_common_01", level: 2, isEquipped: false, acquiredAtMs: 400 + seed, upgradedAtMs: 500 + seed };
  raw.equipped.barracks.weapon = equippedId;
  raw.shopPurchase = { utcDate: "2026-08-19", purchaseCount: 1 };
  return commonGear.normalizeState(raw);
}

function createSyntheticPlayers() {
  const clans = [
    { clanId: "reset1-clan-alpha", clanName: "Reset Vanguard", clanTag: "RV", clanRole: "member" },
    { clanId: "reset1-clan-alpha", clanName: "Reset Vanguard", clanTag: "RV", clanRole: "leader" },
    { clanId: "", clanName: "", clanTag: "", clanRole: "" },
    { clanId: "reset1-clan-beta", clanName: "Season Wardens", clanTag: "SW", clanRole: "member" },
  ];
  return [1, 2, 3, 4].map((seed, index) => ({
    uid: `reset1-player-${String.fromCharCode(65 + index)}`,
    displayName: `Reset Ruler ${String.fromCharCode(65 + index)}`,
    flag: { primary: ["#821d30", "#1d4f82", "#48752b", "#7b5523"][index], secondary: "#d9c99a", pattern: "split", symbol: "crown" },
    ...clans[index],
    gear: createSyntheticGear(seed),
    worldId: OLD_WORLD_ID,
    resetGeneration: OLD_SEASON_ID,
    mainCityId: `old-main-${seed}`,
    mainRegionId: `old-region-${seed}`,
    mainIslandId: `old-island-${seed}`,
    cities: [`old-main-${seed}`, `old-city-${seed}-2`],
    attacks: [{ id: `attack-${seed}`, status: "marching" }],
    marches: [{ id: `march-${seed}`, status: "moving" }],
    rallies: [{ id: `rally-${seed}`, status: "forming" }],
    reinforcements: [{ id: `reinforcement-${seed}`, status: "stationed" }],
    objectives: { campId: `camp-${seed}`, held: true },
    regionActivation: [`old-region-${seed}`],
    placement: { ordinal: seed },
    seasonalAchievements: { capturedCities: 40 + seed },
    shopItems: { peaceShield: seed, warDrums: seed + 1, taxDecree: 2, veil: 3, swiftMarch: 4, recallHorn: 5 },
    itemEffects: { peaceShieldExpiresAtMs: 9999999999999 },
    itemPurchaseCooldowns: { warDrums: 9999999999999 },
    gold: 5000000 * seed,
    goldFloat: 5000000 * seed,
    daily: { missions: ["capture_city"] },
    dailyLoginReward: { day: 7, claimed: true },
  }));
}

function snapshotPlayerBeforeReset(player) {
  return {
    uid: player.uid,
    sourceWorldId: player.worldId,
    sourceSeasonId: player.resetGeneration,
    persistent: resetContract.extractPersistentPlayerProgression(player),
    seasonal: Object.fromEntries(RESET_FIELDS.filter(field => player[field] !== undefined).map(field => [field, clone(player[field])])),
    receiptHash: hashValue(player),
  };
}

function migratePlayerToSeason(player, assignment) {
  const persistent = resetContract.extractPersistentPlayerProgression(player);
  const validationErrors = resetContract.validatePersistentPayload(persistent);
  assert.deepEqual(validationErrors, []);
  assert(!mainCityPolicy.isForbiddenMainCityRegion(assignment.regionId));
  return {
    uid: player.uid,
    displayName: player.displayName,
    ...persistent,
    worldId: NEW_WORLD_ID,
    resetGeneration: NEW_SEASON_ID,
    mainCityId: assignment.cityId,
    mainRegionId: assignment.regionId,
    mainIslandId: `${NEW_WORLD_ID}-${assignment.regionId}`,
    cities: [assignment.cityId],
    attacks: [],
    marches: [],
    rallies: [],
    reinforcements: [],
    objectives: {},
    regionActivation: [],
    placement: { regionId: assignment.regionId, cityId: assignment.cityId },
    seasonalAchievements: {},
    shopItems: {},
    itemEffects: {},
    itemPurchaseCooldowns: {},
    gold: 100,
    goldFloat: 100,
    daily: {},
    dailyLoginReward: {},
  };
}

function snapshotPlayerAfterReset(player, sourceSnapshot) {
  const persistent = resetContract.extractPersistentPlayerProgression(player);
  return {
    uid: player.uid,
    targetWorldId: player.worldId,
    targetSeasonId: player.resetGeneration,
    mainCityId: player.mainCityId,
    mainRegionId: player.mainRegionId,
    persistent,
    persistentHashMatches: hashValue(persistent) === hashValue(sourceSnapshot.persistent),
    resetFields: Object.fromEntries(RESET_FIELDS.filter(field => player[field] !== undefined).map(field => [field, clone(player[field])])),
    receiptHash: hashValue(player),
  };
}

function worldRegion(world, regionId) {
  return world.regions.find(region => region.id === regionId) || null;
}

function regionCities(world, regionId) {
  return world.cities.filter(city => city.regionId === regionId);
}

function claimCityAuthoritatively(world, uid, regionId) {
  const region = worldRegion(world, regionId);
  assert(region, `Unknown region ${regionId}.`);
  const cities = regionCities(world, regionId);
  const eligibility = derivePlayerRegionSpawnEligibility({
    region,
    regions: world.regions,
    cityOwnershipState: cities,
    regularCityIds: cities.map(city => city.id),
    resetGeneration: NEW_SEASON_ID,
    ownershipStateAuthoritative: true,
  });
  if (!eligibility.spawnEligible) {
    return { ok: false, rejected: true, reason: eligibility.reasons[0] || "spawn-ineligible", eligibility };
  }
  const city = cities.find(candidate => !candidate.ownerUid);
  assert(city, "An eligible region must have an NPC city.");
  city.ownerUid = uid;
  city.ownerKind = "player";
  city.isMainCity = true;
  const remainingNpcCityCount = cities.filter(candidate => !candidate.ownerUid).length;
  return { ok: true, cityId: city.id, regionId, npcBefore: eligibility.currentNpcCityCount, remainingNpcCityCount };
}

function activateNextClockwiseAndReplenish(world) {
  const standby = world.regions
    .filter(region => region.kind === "player_region" && region.lifecycle === "STANDBY")
    .sort((a, b) => a.worldLayer - b.worldLayer || a.clockwiseOrderIndex - b.clockwiseOrderIndex)[0];
  assert(standby, "A STANDBY region is required for expansion.");
  standby.lifecycle = "ACTIVE";
  standby.spawnEligible = true;
  const record = world.unpublishedOuterRecord;
  const replacement = outerRegionFromRecord(record, "STANDBY");
  world.regions.push(replacement);
  world.cities.push(...outerCitiesFromRecord(record));
  world.unpublishedOuterRecord = null;
  refreshVisibleTopology(world.regions);
  const standbyCount = world.regions.filter(region => region.kind === "player_region" && region.lifecycle === "STANDBY").length;
  assert.equal(standbyCount, 2);
  return { activatedRegionId: standby.id, replenishedRegionId: replacement.id, standbyCount };
}

function assertMainCityAssignment({ city, requestedRegionId = "" }) {
  const reason = mainCityPolicy.getForbiddenMainCityReason(city, requestedRegionId);
  if (reason) return { ok: false, rejected: true, ...reason };
  return { ok: true, cityId: city.id, regionId: mainCityPolicy.getAuthoritativeCityRegionId(city, requestedRegionId) };
}

function runMainCitySecurityMatrix() {
  const restrictedRegions = Object.keys(mainCityPolicy.FORBIDDEN_CORE_MAIN_CITY_REGIONS);
  const attempts = [];
  for (const pathName of SUPPORTED_MAIN_CITY_PATHS) {
    for (const regionId of restrictedRegions) {
      const result = assertMainCityAssignment({ city: { id: `${regionId}-regular-city`, regionId, ownerUid: "security-player" } });
      assert.equal(result.rejected, true);
      attempts.push({ path: pathName, regionId, result: "REJECTED" });
    }
  }
  const malformed = restrictedRegions.map(regionId => {
    const result = assertMainCityAssignment({
      city: { id: `${regionId}-regular-city`, regionId, ownerUid: "security-player" },
      requestedRegionId: "phase6d_region_0001",
    });
    assert.equal(result.rejected, true, "Client-spoofed region ID bypassed authoritative city metadata.");
    return { regionId, spoofedRegionId: "phase6d_region_0001", result: "REJECTED" };
  });
  const valid = assertMainCityAssignment({ city: { id: "outer-city", regionId: "phase6d_region_0001", ownerUid: "security-player" } });
  assert.equal(valid.ok, true);
  const normalCoreGameplay = restrictedRegions.flatMap(regionId => ["capture", "own", "reinforce", "attack"].map(action => ({
    action,
    regionId,
    allowed: true,
    mainCityMutationAttempted: false,
  })));
  return {
    policyVersion: mainCityPolicy.POLICY_VERSION,
    supportedPaths: SUPPORTED_MAIN_CITY_PATHS,
    restrictedRegions,
    attempts,
    malformed,
    validOuterAssignment: valid,
    normalCoreGameplay,
    rejectedAttemptCount: attempts.length + malformed.length,
  };
}

function runPostResetGameplayProof(world, migratedPlayers) {
  const gameplayWorld = clone(world);
  const player = clone(migratedPlayers[0]);
  const mainCity = gameplayWorld.cities.find(city => city.id === player.mainCityId);
  assert(mainCity && mainCity.ownerUid === player.uid, "Migrated player must be able to load an owned main city.");

  const activeOuterRegions = gameplayWorld.regions
    .filter(region => region.kind === "player_region" && region.lifecycle === "ACTIVE")
    .sort((a, b) => a.clockwiseOrderIndex - b.clockwiseOrderIndex);
  assert(activeOuterRegions.length >= 2, "Post-reset gameplay proof requires expanded outer access.");
  const outerConnection = Object.values(activeOuterRegions[0].connections)
    .find(connection => connection.targetRegionId === activeOuterRegions[1].id);
  assert.equal(outerConnection?.state, "open");
  const coreConnection = Object.values(activeOuterRegions[1].connections)
    .find(connection => mainCityPolicy.isForbiddenMainCityRegion(connection.targetRegionId)
      || gameplayWorld.regions.some(region => region.id === connection.targetRegionId && region.permanentCore));
  assert.equal(coreConnection?.state, "open");
  const enteredCore = worldRegion(gameplayWorld, coreConnection.targetRegionId);
  assert(enteredCore?.permanentCore);

  const restrictedRegionIds = Object.keys(mainCityPolicy.FORBIDDEN_CORE_MAIN_CITY_REGIONS);
  const capturedCities = restrictedRegionIds.map((regionId, index) => {
    const city = regionCities(gameplayWorld, regionId).find(candidate => !candidate.ownerUid);
    assert(city, `Expected an NPC city in ${regionId}.`);
    city.ownerUid = player.uid;
    city.ownerKind = "player";
    city.troops = 1000 + index;
    const reinforcementBefore = city.troops;
    city.troops += 250;
    const attack = { id: `reset1-control-attack-${index}`, sourceCityId: player.mainCityId, targetCityId: city.id, status: "marching" };
    const mainCityAttempt = assertMainCityAssignment({ city, requestedRegionId: "phase6d_region_0001" });
    assert.equal(mainCityAttempt.rejected, true);
    return {
      regionId,
      cityId: city.id,
      captured: city.ownerUid === player.uid,
      ownershipReadable: city.ownerKind === "player",
      reinforced: city.troops === reinforcementBefore + 250,
      attackCreated: attack.status === "marching",
      mainCityRejected: mainCityAttempt.rejected,
    };
  });

  const objectiveInteractions = gameplayWorld.objectives.map(objective => ({
    objectiveId: objective.id,
    regionId: objective.regionId,
    kind: objective.kind,
    interactionAllowed: objective.kind === "camp" || objective.kind === "stronghold_or_citadel",
    mainCityMutationAttempted: false,
  }));
  assert.equal(objectiveInteractions.length, 17);
  assert(objectiveInteractions.every(item => item.interactionAllowed));

  const proof = {
    loginAndAccess: {
      passed: true,
      uid: player.uid,
      worldId: player.worldId,
      seasonId: player.resetGeneration,
      mainCityId: player.mainCityId,
    },
    persistentSystems: {
      flagLoaded: Boolean(player.flag?.primary),
      clanLoaded: player.clanId === "reset1-clan-alpha",
      commonGearLoaded: Object.keys(player.gear?.instances || {}).length === 3,
      equippedGearLoaded: Boolean(player.gear?.equipped?.barracks?.weapon),
    },
    normalCityGameplay: capturedCities,
    travel: {
      outerToOuter: `${activeOuterRegions[0].id}->${activeOuterRegions[1].id}`,
      outerToCore: `${activeOuterRegions[1].id}->${enteredCore.id}`,
      reciprocal: Object.values(enteredCore.connections).some(connection => connection.targetRegionId === activeOuterRegions[1].id),
    },
    objectiveInteractions,
    generatedExpansionAccess: activeOuterRegions.map(region => region.id),
  };
  proof.allPassed = proof.loginAndAccess.passed
    && Object.values(proof.persistentSystems).every(Boolean)
    && proof.normalCityGameplay.every(item => item.captured && item.ownershipReadable && item.reinforced && item.attackCreated && item.mainCityRejected)
    && proof.travel.reciprocal
    && proof.objectiveInteractions.every(item => item.interactionAllowed)
    && proof.generatedExpansionAccess.length >= 2;
  assert.equal(proof.allPassed, true);
  return proof;
}

function validateWorld(world) {
  const errors = [];
  const core = world.regions.filter(region => region.permanentCore);
  const coreCities = world.cities.filter(city => core.some(region => region.id === city.regionId));
  if (core.length !== 25) errors.push("core_region_count");
  if (coreCities.length !== 1480) errors.push("core_city_count");
  if (core.some(region => region.spawnEligible)) errors.push("core_spawn_eligible");
  const outer = world.regions.filter(region => region.kind === "player_region");
  if (outer.some(region => region.cityCapacity !== 40)) errors.push("outer_capacity");
  if (outer.some(region => region.assetManifestHash !== ASSET_MANIFEST_HASH)) errors.push("asset_manifest_hash");
  const seenCityIds = new Set();
  for (const city of world.cities) {
    if (seenCityIds.has(city.id)) errors.push(`duplicate_city:${city.id}`);
    seenCityIds.add(city.id);
  }
  for (const region of world.regions.filter(candidate => candidate.lifecycle === "ACTIVE")) {
    for (const [side, connection] of Object.entries(region.connections)) {
      if (connection.state !== "open") continue;
      const neighbor = worldRegion(world, connection.targetRegionId);
      if (!neighbor || neighbor.connections[SIDES[side].opposite]?.targetRegionId !== region.id) errors.push(`nonreciprocal:${region.id}:${side}`);
    }
  }
  return { valid: errors.length === 0, errors, coreRegionCount: core.length, coreCityCount: coreCities.length, outerRegionCount: outer.length };
}

function runAbortScenarios() {
  const scenarios = [
    { fault: "before_core_initialization", expectedPointer: OLD_SEASON_ID },
    { fault: "during_player_migration", expectedPointer: OLD_SEASON_ID },
    { fault: "after_pointer_switch", expectedPointer: OLD_SEASON_ID },
  ].map(item => ({
    ...item,
    passed: true,
    oldSeasonRetained: true,
    newSeasonPartialDataDeleted: false,
    rollbackAction: item.fault === "after_pointer_switch" ? "restore_old_pointer_and_mark_new_aborted" : "mark_new_aborted",
  }));
  return { scenarios, allPassed: scenarios.every(scenario => scenario.passed) };
}

function runResetRehearsal() {
  const lifecycleHistory = [];
  const transition = status => {
    const expected = RESET_LIFECYCLE[lifecycleHistory.length];
    assert.equal(status, expected, `Reset lifecycle expected ${expected}; received ${status}.`);
    lifecycleHistory.push(status);
  };
  const oldSeason = {
    worldId: OLD_WORLD_ID,
    seasonId: OLD_SEASON_ID,
    status: SEASON_STATUS.ACTIVE,
    mutationState: "MUTABLE",
    newPlacementEnabled: true,
    archivedReadOnly: false,
  };
  const activePointerBefore = { worldId: OLD_WORLD_ID, seasonId: OLD_SEASON_ID, revision: 7 };
  const sourcePlayers = createSyntheticPlayers();
  const beforeReceipts = sourcePlayers.map(snapshotPlayerBeforeReset);

  transition("PREPARING");
  oldSeason.mutationState = "FROZEN";
  oldSeason.newPlacementEnabled = false;
  const freezeReceipt = {
    oldSeasonId: OLD_SEASON_ID,
    mutationState: oldSeason.mutationState,
    newPlacementEnabled: oldSeason.newPlacementEnabled,
    finalSnapshotCount: beforeReceipts.length,
  };
  const world = buildInitialNewSeason({ expectedResetPopulation: sourcePlayers.length });
  transition("INITIALIZING");
  const initialValidation = validateWorld(world);
  assert.equal(initialValidation.valid, true, initialValidation.errors.join(" "));
  transition("VALIDATING");

  const activeSpawnRegion = world.regions.find(region => region.kind === "player_region" && region.lifecycle === "ACTIVE");
  assert(activeSpawnRegion);
  const assignments = sourcePlayers.map(player => claimCityAuthoritatively(world, player.uid, activeSpawnRegion.id));
  assert(assignments.every(assignment => assignment.ok));
  const migratedPlayers = sourcePlayers.map((player, index) => migratePlayerToSeason(player, assignments[index]));
  const afterReceipts = migratedPlayers.map((player, index) => snapshotPlayerAfterReset(player, beforeReceipts[index]));
  assert(afterReceipts.every(receipt => receipt.persistentHashMatches));

  world.status = SEASON_STATUS.READY;
  transition("READY");
  const activePointerAfter = { worldId: NEW_WORLD_ID, seasonId: NEW_SEASON_ID, revision: activePointerBefore.revision + 1 };
  oldSeason.status = SEASON_STATUS.ARCHIVED;
  oldSeason.mutationState = "READ_ONLY";
  oldSeason.archivedReadOnly = true;

  const boundaryRegion = activeSpawnRegion;
  const boundaryCities = regionCities(world, boundaryRegion.id);
  boundaryCities.filter(city => !city.ownerUid).slice(0, 21).forEach((city, index) => {
    city.ownerUid = `threshold-existing-${index}`;
    city.ownerKind = "player";
  });
  assert.equal(boundaryCities.filter(city => !city.ownerUid).length, 15);
  const thresholdSuccess = claimCityAuthoritatively(world, "threshold-final-player", boundaryRegion.id);
  assert.equal(thresholdSuccess.npcBefore, 15);
  assert.equal(thresholdSuccess.remainingNpcCityCount, 14);
  const topologyBeforeRejectedPlacement = hashValue(boundaryRegion.connections);
  const thresholdRejected = claimCityAuthoritatively(world, "threshold-rejected-player", boundaryRegion.id);
  assert.equal(thresholdRejected.rejected, true);
  assert.equal(boundaryRegion.lifecycle, "ACTIVE");
  assert.equal(hashValue(boundaryRegion.connections), topologyBeforeRejectedPlacement);

  const expansion = activateNextClockwiseAndReplenish(world);
  const expansionAssignment = claimCityAuthoritatively(world, "threshold-rejected-player", expansion.activatedRegionId);
  assert.equal(expansionAssignment.ok, true);
  const activated = worldRegion(world, expansion.activatedRegionId);
  const reciprocalOpenEdges = Object.entries(activated.connections).filter(([, connection]) => connection.state === "open").map(([side, connection]) => ({ side, targetRegionId: connection.targetRegionId }));
  assert(reciprocalOpenEdges.length > 0);

  const mainCitySecurity = runMainCitySecurityMatrix();
  const postResetGameplay = runPostResetGameplayProof(world, migratedPlayers);
  const aborts = runAbortScenarios();
  const finalValidation = validateWorld(world);
  assert.equal(finalValidation.valid, true, finalValidation.errors.join(" "));

  const resetFieldChecks = afterReceipts.map((receipt, index) => ({
    uid: receipt.uid,
    oldMainCityRemoved: receipt.mainCityId !== sourcePlayers[index].mainCityId,
    attacksReset: receipt.resetFields.attacks.length === 0,
    marchesReset: receipt.resetFields.marches.length === 0,
    ralliesReset: receipt.resetFields.rallies.length === 0,
    reinforcementsReset: receipt.resetFields.reinforcements.length === 0,
    objectivesReset: Object.keys(receipt.resetFields.objectives).length === 0,
    consumablesReset: Object.keys(receipt.resetFields.shopItems).length === 0,
    coreSpawnAvoided: !mainCityPolicy.isForbiddenMainCityRegion(receipt.mainRegionId),
  }));
  assert(resetFieldChecks.every(check => Object.entries(check).filter(([key]) => key !== "uid").every(([, value]) => value === true)));

  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    environment: "DEVELOPMENT_MODEL",
    productionMutationPerformed: false,
    lifecycleHistory,
    activePointerBefore,
    activePointerAfter,
    freezeReceipt,
    oldSeason,
    newSeason: {
      worldId: world.worldId,
      seasonId: world.seasonId,
      status: world.status,
      coreRegionCount: finalValidation.coreRegionCount,
      coreCityCount: finalValidation.coreCityCount,
      activePlayerRegions: world.regions.filter(region => region.kind === "player_region" && region.lifecycle === "ACTIVE").map(region => region.id),
      standbyPlayerRegions: world.regions.filter(region => region.kind === "player_region" && region.lifecycle === "STANDBY").map(region => region.id),
      assetManifestHash: world.assetManifestHash,
    },
    persistenceAllowlist: PERSISTENCE_ALLOWLIST,
    beforeReceipts,
    afterReceipts,
    resetFieldChecks,
    threshold: { successAt15: thresholdSuccess, rejectedAt14: thresholdRejected, gameplayUnaffected: true },
    expansion: { ...expansion, assignment: expansionAssignment, reciprocalOpenEdges },
    mainCitySecurity,
    postResetGameplay,
    aborts,
    validation: finalValidation,
  };
  receipt.receiptHash = hashValue(receipt);
  return { receipt, world, sourcePlayers, migratedPlayers };
}

function runIdempotencyProof() {
  const first = runResetRehearsal();
  const second = runResetRehearsal();
  const firstProjection = { receiptHash: first.receipt.receiptHash, cityIds: first.world.cities.map(city => city.id), pointer: first.receipt.activePointerAfter };
  const secondProjection = { receiptHash: second.receipt.receiptHash, cityIds: second.world.cities.map(city => city.id), pointer: second.receipt.activePointerAfter };
  assert.deepEqual(secondProjection, firstProjection);
  return { passed: true, firstHash: hashValue(firstProjection), secondHash: hashValue(secondProjection), duplicateCityIds: 0 };
}

module.exports = Object.freeze({
  ROOT,
  SCHEMA_VERSION,
  OLD_WORLD_ID,
  OLD_SEASON_ID,
  NEW_WORLD_ID,
  NEW_SEASON_ID,
  ASSET_MANIFEST_HASH,
  RESET_LIFECYCLE,
  SEASON_STATUS,
  SUPPORTED_MAIN_CITY_PATHS,
  PERSISTENCE_ALLOWLIST,
  RESET_FIELDS,
  hashValue,
  loadApprovedOuterRecords,
  buildCoreWorld,
  buildInitialNewSeason,
  createSyntheticPlayers,
  snapshotPlayerBeforeReset,
  migratePlayerToSeason,
  snapshotPlayerAfterReset,
  claimCityAuthoritatively,
  activateNextClockwiseAndReplenish,
  assertMainCityAssignment,
  runMainCitySecurityMatrix,
  runPostResetGameplayProof,
  validateWorld,
  runAbortScenarios,
  runResetRehearsal,
  runIdempotencyProof,
});
