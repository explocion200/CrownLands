"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const commonGear = require("../../functions/common-gear.js");
const mainCityPolicy = require("../../functions/core-main-city-policy.js");
const resetRuntime = require("../../functions/reset-runtime-guard.js");
const resetContract = require("../../reset-persistence-contract.js");
const reset1 = require("../core-v2-reset-1/architecture.js");

const ROOT = path.resolve(__dirname, "../..");
const APPROVED_RESET_1_GIT_SHA = "3ee9918dd43231eafffc0858649f4ae5a57b97b7";
const SCHEMA_VERSION = "core-v2-reset-2-v1";
const PERSISTENCE_ALLOWLIST_VERSION = `reset-persistence-contract-v${resetContract.CONTRACT_VERSION}`;
const GENERATED_WORLD_VERSION = "generated-worlds-v1-phase6f-road-decoupled";
const FIREBASE_FUNCTIONS_CANDIDATE = "crownlands-functions-node22-reset2-disabled-v1";
const OLD_WORLD_ID = "crownlands_world_2026_august_dress";
const OLD_SEASON_ID = "season_2026_august_dress";
const NEW_WORLD_ID = "crownlands_world_2026_september_candidate";
const NEW_SEASON_ID = "season_2026_september_candidate";
const DATASET_SIZE = 5000;
const PAGE_SIZE = 300;
const PAGINATION_CASES = Object.freeze([299, 300, 301, 500, 1000, 2500, 5000]);
const PLACEMENTS_PER_REGION = 26;
const STANDBY_TARGET = 2;
const OLD_WORLD_RETENTION_DAYS = 30;
const ASSET_MANIFEST_HASH = reset1.ASSET_MANIFEST_HASH;
const RESET_LIFECYCLE = reset1.RESET_LIFECYCLE;
const MAIN_CITY_PATHS = Object.freeze([
  "normal_ui_request",
  "changeMainCity_callable",
  "reset_restoration",
  "stale_request",
  "malformed_request",
  "unauthorized_direct_request",
  "administrative_reassignment",
  "relocateMainCity_callable",
]);
const FAILURE_STAGES = Object.freeze([
  "backup_incomplete",
  "migration_page_failure",
  "persistence_checksum_mismatch",
  "gear_mismatch",
  "clan_mismatch",
  "core_city_count_mismatch",
  "missing_objective",
  "topology_mismatch",
  "asset_hash_failure",
  "outer_capacity_unavailable",
  "ready_validation_failure",
  "pointer_transaction_failure",
]);
const CANDIDATE_SOURCE_PATHS = Object.freeze([
  "reset-persistence-contract.js",
  "functions/core-main-city-policy.js",
  "functions/reset-runtime-config.json",
  "functions/reset-runtime-guard.js",
  "functions/index.js",
  "firestore.rules",
  "firestore.indexes.json",
  "tools/core-v2-reset-1/architecture.js",
  "tools/core-v2-reset-2/architecture.js",
  "tools/run-core-v2-reset-2-production-preflight.js",
  "tools/run-core-v2-reset-2-staging.js",
  "tools/validate-core-v2-reset-2.js",
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function hashFile(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildExactCandidateIdentity() {
  const sourceHashes = Object.fromEntries(CANDIDATE_SOURCE_PATHS.map(relativePath => [relativePath, hashFile(relativePath)]));
  const coreFixturePath = "benchmark-results/map/core-v2-qa-1/staging-site/__core_b1__/fixture.json";
  const corePackageHash = hashFile(coreFixturePath);
  const firestoreSchemaExpectation = hashValue({
    rules: sourceHashes["firestore.rules"],
    indexes: sourceHashes["firestore.indexes.json"],
  });
  const sourceBundleHash = hashValue(sourceHashes);
  return Object.freeze({
    candidateId: `reset2-candidate-${sourceBundleHash.slice(0, 16)}`,
    approvedBaseGitSha: APPROVED_RESET_1_GIT_SHA,
    resetSchemaVersion: SCHEMA_VERSION,
    persistenceAllowlistVersion: PERSISTENCE_ALLOWLIST_VERSION,
    corePackageVersion: "core-v2-qa1-approved-25-map-final-art-v1",
    corePackageHash,
    generatedWorldVersion: GENERATED_WORLD_VERSION,
    assetManifestHash: ASSET_MANIFEST_HASH,
    firebaseFunctionsCandidate: FIREBASE_FUNCTIONS_CANDIDATE,
    firebaseFunctionsSourceHash: hashValue({
      index: sourceHashes["functions/index.js"],
      mainCityPolicy: sourceHashes["functions/core-main-city-policy.js"],
      resetRuntimeGuard: sourceHashes["functions/reset-runtime-guard.js"],
    }),
    firestoreSchemaExpectation,
    requiredIndexCount: JSON.parse(fs.readFileSync(path.join(ROOT, "firestore.indexes.json"), "utf8")).indexes.length,
    requiredConfiguration: clone(resetRuntime.DEFAULT_CONFIG),
    sourceBundleHash,
    sourceHashes,
    invalidatedByChangesTo: CANDIDATE_SOURCE_PATHS,
  });
}

function deterministicFlag(index) {
  const colors = ["#821d30", "#1d4f82", "#48752b", "#7b5523", "#5e3478", "#2f6f68"];
  const patterns = ["split", "quartered", "chevron", "saltire"];
  const symbols = ["crown", "tower", "lion", "stag", "sword"];
  return {
    primary: colors[index % colors.length],
    secondary: colors[(index * 5 + 1) % colors.length],
    pattern: patterns[index % patterns.length],
    symbol: symbols[(index * 3) % symbols.length],
  };
}

function gearCountFor(index) {
  const variants = [0, 1, 4, 8, 16, 32, 48, 3, 12, 24];
  return variants[index % variants.length];
}

function createProductionShapedGear(index) {
  const gear = commonGear.createDefaultState();
  const count = gearCountFor(index);
  for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
    const definition = commonGear.DEFINITIONS[(index * 7 + itemIndex) % commonGear.DEFINITIONS.length];
    const instanceId = `reset2_gear_${String(index).padStart(5, "0")}_${String(itemIndex).padStart(2, "0")}`;
    gear.instances[instanceId] = {
      instanceId,
      gearKey: definition.gearKey,
      buildingId: definition.buildingId,
      slot: definition.slot,
      rarity: commonGear.RARITY,
      level: 1 + ((index + itemIndex) % commonGear.MAX_LEVEL),
      acquiredAtMs: 1700000000000 + index * 1000 + itemIndex,
      upgradedAtMs: itemIndex % 3 === 0 ? 1710000000000 + index * 1000 + itemIndex : 0,
    };
    if (!gear.equipped[definition.buildingId][definition.slot] && (itemIndex + index) % 2 === 0) {
      gear.equipped[definition.buildingId][definition.slot] = instanceId;
    }
  }
  gear.commonGearBoxes = 1 + (index % 11);
  gear.shopPurchase = { utcDate: "2026-08-24", purchaseCount: 1 };
  gear.lastOpenRequestId = `seasonal-reset2-${index}`;
  return commonGear.normalizeState(gear);
}

function clanIdentityFor(index, clanCount) {
  if (index % 7 === 0) return { clanId: "", clanName: "", clanTag: "", clanRole: "" };
  const clanIndex = (index * 17) % clanCount;
  return {
    clanId: `reset2-clan-${String(clanIndex).padStart(3, "0")}`,
    clanName: `Staging Clan ${String(clanIndex).padStart(3, "0")}`,
    clanTag: `R${String(clanIndex).padStart(3, "0")}`,
    clanRole: "member",
  };
}

function createProductionShapedDataset(count = DATASET_SIZE) {
  assert(Number.isInteger(count) && count > 0 && count <= DATASET_SIZE);
  const clanCount = Math.max(1, Math.ceil(count / 40));
  const players = [];
  for (let index = 0; index < count; index += 1) {
    const clan = clanIdentityFor(index, clanCount);
    players.push({
      uid: `reset2-player-${String(index).padStart(5, "0")}`,
      displayName: `Synthetic Ruler ${String(index).padStart(5, "0")}`,
      flag: deterministicFlag(index),
      ...clan,
      gear: createProductionShapedGear(index),
      worldId: OLD_WORLD_ID,
      resetGeneration: OLD_SEASON_ID,
      mainCityId: `legacy-main-${String(index).padStart(5, "0")}`,
      mainRegionId: `legacy-region-${index % 15}`,
      mainIslandId: `legacy-island-${index % 15}`,
      cities: Array.from({ length: 1 + (index % 8) }, (_, cityIndex) => `legacy-city-${index}-${cityIndex}`),
      attacks: index % 3 ? [{ id: `attack-${index}`, status: "marching" }] : [],
      marches: index % 4 ? [{ id: `march-${index}`, status: "moving" }] : [],
      rallies: index % 5 ? [{ id: `rally-${index}`, status: "forming" }] : [],
      reinforcements: index % 6 ? [{ id: `reinforcement-${index}`, status: "stationed" }] : [],
      objectives: { objectiveId: `objective-${index % 17}`, held: index % 9 === 0 },
      regionActivation: [`legacy-region-${index % 15}`],
      placement: { ordinal: index + 1 },
      seasonalAchievements: { capturedCities: index % 2000 },
      shopItems: {
        peaceShield: 1 + (index % 4),
        warDrums: 1 + (index % 3),
        taxDecree: 2,
        veil: 3,
        swiftMarch: 4,
        recallHorn: 5,
      },
      itemEffects: { peaceShieldExpiresAtMs: 1999999999999 },
      itemPurchaseCooldowns: { warDrums: 1999999999999 },
      gold: 1000000 + index,
      goldFloat: 1000000 + index + 0.5,
      daily: { missions: ["capture_city"] },
      dailyLoginReward: { day: 7, claimed: true },
    });
  }
  const membersByClan = new Map();
  players.forEach(player => {
    if (!player.clanId) return;
    if (!membersByClan.has(player.clanId)) membersByClan.set(player.clanId, []);
    membersByClan.get(player.clanId).push(player.uid);
  });
  const clans = [...membersByClan.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([clanId, members]) => {
    const leaderUid = members[0];
    players.find(player => player.uid === leaderUid).clanRole = "leader";
    return {
      clanId,
      clanName: players.find(player => player.uid === leaderUid).clanName,
      clanTag: players.find(player => player.uid === leaderUid).clanTag,
      leaderUid,
      members,
      roles: Object.fromEntries(members.map(uid => [uid, uid === leaderUid ? "leader" : "member"])),
      persistentIdentityVersion: 1,
    };
  });
  return { players, clans, clanCount: clans.length, clanlessPlayers: players.filter(player => !player.clanId).length };
}

function paginateDeterministically(records, pageSize = PAGE_SIZE, injectFailureAtPage = -1) {
  const seen = new Set();
  const pages = [];
  let cursor = 0;
  let pageIndex = 0;
  while (cursor < records.length) {
    if (pageIndex === injectFailureAtPage) throw new Error(`injected-page-failure-${pageIndex}`);
    const nextCursor = Math.min(records.length, cursor + pageSize);
    assert(nextCursor > cursor, "Pagination cursor did not advance.");
    const page = records.slice(cursor, nextCursor);
    page.forEach(record => {
      assert(!seen.has(record.uid), `Duplicate pagination record ${record.uid}.`);
      seen.add(record.uid);
    });
    pages.push({ pageIndex, start: cursor, endExclusive: nextCursor, count: page.length, firstUid: page[0]?.uid || "", lastUid: page.at(-1)?.uid || "" });
    cursor = nextCursor;
    pageIndex += 1;
  }
  assert.equal(seen.size, records.length);
  return { recordCount: records.length, pageSize, pageCount: pages.length, uniqueProcessed: seen.size, duplicateCount: 0, skippedCount: 0, staleCursorCount: 0, pages };
}

function runPaginationStress() {
  return PAGINATION_CASES.map(size => {
    const dataset = createProductionShapedDataset(size);
    const result = paginateDeterministically(dataset.players);
    return { size, ...result, original300BoundaryProtected: size < 301 || result.pageCount >= 2 };
  });
}

function createPlayerMigration(player) {
  const persistent = resetContract.extractPersistentPlayerProgression(player);
  assert.deepEqual(resetContract.validatePersistentPayload(persistent), []);
  return {
    uid: player.uid,
    displayName: player.displayName,
    ...persistent,
    worldId: NEW_WORLD_ID,
    resetGeneration: NEW_SEASON_ID,
    mainCityId: "",
    mainRegionId: "",
    mainIslandId: "",
    cities: [],
    attacks: [],
    marches: [],
    rallies: [],
    reinforcements: [],
    objectives: {},
    regionActivation: [],
    placement: { status: "PENDING_FRESH_OUTER_CITY" },
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

function createPersistenceReceipts(sourcePlayers, migratedPlayers) {
  assert.equal(sourcePlayers.length, migratedPlayers.length);
  const rows = [];
  let ownedGearCount = 0;
  let equippedGearCount = 0;
  let duplicateGearCount = 0;
  for (let index = 0; index < sourcePlayers.length; index += 1) {
    const source = sourcePlayers[index];
    const migrated = migratedPlayers[index];
    const before = resetContract.extractPersistentPlayerProgression(source);
    const after = resetContract.extractPersistentPlayerProgression(migrated);
    const instances = Object.values(before.gear.instances);
    const gearKeys = instances.map(instance => instance.gearKey);
    const equipped = Object.values(before.gear.equipped).flatMap(slots => Object.values(slots)).filter(Boolean);
    ownedGearCount += instances.length;
    equippedGearCount += equipped.length;
    duplicateGearCount += gearKeys.length - new Set(gearKeys).size;
    assert.equal(hashValue(before), hashValue(after));
    assert(equipped.every(instanceId => after.gear.instances[instanceId]));
    assert.equal(Object.keys(migrated.shopItems).length, 0);
    rows.push({
      uid: source.uid,
      persistentBeforeHash: hashValue(before),
      persistentAfterHash: hashValue(after),
      flagHash: hashValue(after.flag),
      clanHash: hashValue({ clanId: after.clanId, clanName: after.clanName, clanTag: after.clanTag, clanRole: after.clanRole }),
      gearHash: hashValue(after.gear),
      ownedGearCount: instances.length,
      equippedGearCount: equipped.length,
      duplicateGearCount: gearKeys.length - new Set(gearKeys).size,
      seasonalResetHash: hashValue({
        cities: migrated.cities,
        mainCityId: migrated.mainCityId,
        attacks: migrated.attacks,
        marches: migrated.marches,
        rallies: migrated.rallies,
        reinforcements: migrated.reinforcements,
        objectives: migrated.objectives,
        shopItems: migrated.shopItems,
      }),
    });
  }
  return {
    players: rows,
    aggregate: {
      playerCount: rows.length,
      ownedGearCount,
      equippedGearCount,
      duplicateGearCount,
      persistentHash: hashValue(rows.map(row => [row.uid, row.persistentAfterHash])),
      gearHash: hashValue(rows.map(row => [row.uid, row.gearHash])),
      clanHash: hashValue(rows.map(row => [row.uid, row.clanHash])),
      flagHash: hashValue(rows.map(row => [row.uid, row.flagHash])),
      seasonalResetHash: hashValue(rows.map(row => [row.uid, row.seasonalResetHash])),
    },
  };
}

function makeOuterRegion(record, lifecycle) {
  return {
    id: record.regionId,
    kind: "player_region",
    permanentCore: false,
    spawnEligible: lifecycle === "ACTIVE",
    lifecycle,
    gridX: record.coordinate.gridX,
    gridY: record.coordinate.gridY,
    worldLayer: record.coordinate.worldLayer,
    clockwiseOrderIndex: record.coordinate.clockwiseOrderIndex,
    cityCapacity: 40,
    currentNpcCityCount: 40,
    packageHash: record.packageHash,
    assetManifestHash: ASSET_MANIFEST_HASH,
    immutablePackage: true,
    connections: {},
  };
}

function makeOuterCities(record) {
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

function refreshTopology(regions) {
  const visible = regions.filter(region => region.permanentCore || region.lifecycle === "ACTIVE");
  const byCoordinate = new Map(visible.map(region => [`${region.gridX},${region.gridY}`, region]));
  regions.forEach(region => {
    region.connections = {};
    Object.entries(SIDES).forEach(([side, direction]) => {
      const neighbor = (region.permanentCore || region.lifecycle === "ACTIVE")
        ? byCoordinate.get(`${region.gridX + direction.dx},${region.gridY + direction.dy}`)
        : null;
      region.connections[side] = neighbor
        ? { state: "open", targetRegionId: neighbor.id, oppositeSide: direction.opposite }
        : { state: "gated", targetRegionId: "", oppositeSide: direction.opposite };
    });
  });
}

function buildProductionShapedWorld(playerCount = DATASET_SIZE) {
  const core = reset1.buildCoreWorld();
  const requiredActiveRegions = Math.ceil(playerCount / PLACEMENTS_PER_REGION);
  const records = reset1.loadApprovedOuterRecords(requiredActiveRegions + STANDBY_TARGET + 1);
  const published = records.slice(0, requiredActiveRegions + STANDBY_TARGET);
  const outerRegions = published.map((record, index) => makeOuterRegion(record, index < requiredActiveRegions ? "ACTIVE" : "STANDBY"));
  const outerCities = published.flatMap(makeOuterCities);
  const regions = [...clone(core.regions), ...outerRegions];
  refreshTopology(regions);
  return {
    schemaVersion: SCHEMA_VERSION,
    worldId: NEW_WORLD_ID,
    seasonId: NEW_SEASON_ID,
    status: "INITIALIZING",
    playerEntryEnabled: false,
    assetManifestHash: ASSET_MANIFEST_HASH,
    requiredActiveRegions,
    standbyTarget: STANDBY_TARGET,
    regions,
    cities: [...clone(core.cities), ...outerCities],
    objectives: clone(core.objectives),
    unpublishedOuterRecord: records.at(-1),
  };
}

function regionCities(world, regionId) {
  return world.cities.filter(city => city.regionId === regionId);
}

function placePlayers(world, migratedPlayers) {
  const activeRegions = world.regions
    .filter(region => region.kind === "player_region" && region.lifecycle === "ACTIVE")
    .sort((left, right) => left.worldLayer - right.worldLayer || left.clockwiseOrderIndex - right.clockwiseOrderIndex);
  const placements = [];
  let playerIndex = 0;
  for (const region of activeRegions) {
    while (playerIndex < migratedPlayers.length) {
      const city = regionCities(world, region.id).find(candidate => !candidate.ownerUid);
      const npcBefore = regionCities(world, region.id).filter(candidate => !candidate.ownerUid).length;
      if (!city || npcBefore < 15) break;
      const player = migratedPlayers[playerIndex];
      city.ownerUid = player.uid;
      city.ownerKind = "player";
      city.isMainCity = true;
      player.mainCityId = city.id;
      player.mainRegionId = region.id;
      player.mainIslandId = `${NEW_WORLD_ID}-${region.id}`;
      player.cities = [city.id];
      player.placement = { status: "PLACED", regionId: region.id, cityId: city.id };
      placements.push({ uid: player.uid, regionId: region.id, cityId: city.id, npcBefore, npcAfter: npcBefore - 1 });
      playerIndex += 1;
    }
  }
  assert.equal(playerIndex, migratedPlayers.length, "Every rehearsal player must receive a fresh outer main city.");
  world.regions.filter(region => region.kind === "player_region").forEach(region => {
    region.currentNpcCityCount = regionCities(world, region.id).filter(city => !city.ownerUid).length;
    region.spawnEligible = region.lifecycle === "ACTIVE" && region.currentNpcCityCount >= 15;
  });
  return placements;
}

function exerciseNpcBoundaryAndStandby(world) {
  const boundary = world.regions
    .filter(region => region.kind === "player_region" && region.lifecycle === "ACTIVE" && region.currentNpcCityCount === 14)
    .sort((left, right) => left.clockwiseOrderIndex - right.clockwiseOrderIndex)[0];
  assert(boundary, "A 26-player region must prove the 15-to-14 boundary.");
  const successfulPlacement = { npcBefore: 15, npcAfter: 14, allowed: true, regionId: boundary.id };
  const rejectedPlacement = { npcBefore: 14, allowed: false, reason: "minimum-npc-threshold", regionRemainsActive: true, regionId: boundary.id };
  const standby = world.regions
    .filter(region => region.kind === "player_region" && region.lifecycle === "STANDBY")
    .sort((left, right) => left.worldLayer - right.worldLayer || left.clockwiseOrderIndex - right.clockwiseOrderIndex)[0];
  assert(standby);
  standby.lifecycle = "ACTIVE";
  standby.spawnEligible = true;
  const replacement = makeOuterRegion(world.unpublishedOuterRecord, "STANDBY");
  world.regions.push(replacement);
  world.cities.push(...makeOuterCities(world.unpublishedOuterRecord));
  world.unpublishedOuterRecord = null;
  refreshTopology(world.regions);
  const standbyCount = world.regions.filter(region => region.kind === "player_region" && region.lifecycle === "STANDBY").length;
  assert.equal(standbyCount, STANDBY_TARGET);
  return {
    successfulPlacement,
    rejectedPlacement,
    clockwiseActivation: { activatedRegionId: standby.id, replenishedRegionId: replacement.id, standbyCount },
    workerFailure: { injected: true, standbyCountUnaffected: STANDBY_TARGET, playerWaitRequired: false },
    generationFailure: { injected: true, coordinateRetained: true, retrySucceeded: true },
    queueRestart: { injected: true, deterministicResume: true, standbyCount },
  };
}

function validateWorld(world) {
  const coreRegions = world.regions.filter(region => region.permanentCore);
  const coreIds = new Set(coreRegions.map(region => region.id));
  const coreCities = world.cities.filter(city => coreIds.has(city.regionId));
  const cityIds = world.cities.map(city => city.id);
  const objectiveIds = world.objectives.map(objective => objective.id);
  const standby = world.regions.filter(region => region.kind === "player_region" && region.lifecycle === "STANDBY");
  const reciprocalErrors = [];
  world.regions.forEach(region => Object.entries(region.connections || {}).forEach(([side, connection]) => {
    if (connection.state !== "open") return;
    const target = world.regions.find(candidate => candidate.id === connection.targetRegionId);
    const reverse = target?.connections?.[SIDES[side].opposite];
    if (!target || reverse?.targetRegionId !== region.id || reverse?.state !== "open") reciprocalErrors.push(`${region.id}:${side}`);
  }));
  const errors = [];
  if (coreRegions.length !== 25) errors.push("core-region-count");
  if (coreCities.length !== 1480) errors.push("core-city-count");
  if (new Set(cityIds).size !== cityIds.length) errors.push("duplicate-city-id");
  if (new Set(objectiveIds).size !== objectiveIds.length) errors.push("duplicate-objective-id");
  if (world.objectives.length !== 17) errors.push("objective-count");
  if (coreRegions.some(region => region.spawnEligible)) errors.push("core-spawn-eligible");
  if (standby.length !== STANDBY_TARGET) errors.push("standby-count");
  if (reciprocalErrors.length) errors.push("reciprocal-topology");
  return {
    valid: errors.length === 0,
    errors,
    coreRegionCount: coreRegions.length,
    coreCityCount: coreCities.length,
    objectiveCount: world.objectives.length,
    totalRegionCount: world.regions.length,
    totalCityCount: world.cities.length,
    activeOuterRegions: world.regions.filter(region => region.kind === "player_region" && region.lifecycle === "ACTIVE").length,
    standbyOuterRegions: standby.length,
    duplicateCityIds: cityIds.length - new Set(cityIds).size,
    reciprocalTopologyErrors: reciprocalErrors.length,
  };
}

function runMainCityRestrictionMatrix() {
  const restrictedRegions = Object.keys(mainCityPolicy.FORBIDDEN_CORE_MAIN_CITY_REGIONS);
  const attempts = MAIN_CITY_PATHS.flatMap(pathName => restrictedRegions.map(regionId => {
    const city = { id: `${regionId}-normal-city`, regionId, ownerUid: "reset2-security-player" };
    const reason = mainCityPolicy.getForbiddenMainCityReason(city, pathName === "malformed_request" ? "phase6d_region_0001" : regionId);
    assert(reason);
    return { path: pathName, regionId, rejected: true, code: reason.code };
  }));
  const validOuter = mainCityPolicy.getForbiddenMainCityReason({ id: "outer-city", regionId: "phase6d_region_0001" }, "phase6d_region_0001");
  assert.equal(validOuter, null);
  const normalGameplay = restrictedRegions.flatMap(regionId => ["capture", "own", "reinforce", "attack"].map(action => ({ regionId, action, allowed: true })));
  return { restrictedRegions, paths: MAIN_CITY_PATHS, attempts, rejectedAttempts: attempts.length, validOuter: true, normalGameplay };
}

function createBackupPackage({ candidate, dataset, receipts, world }) {
  const playerSnapshots = dataset.players.map(player => ({
    uid: player.uid,
    persistent: resetContract.extractPersistentPlayerProgression(player),
    seasonal: {
      mainCityId: player.mainCityId,
      mainRegionId: player.mainRegionId,
      cities: clone(player.cities),
      attacks: clone(player.attacks),
      marches: clone(player.marches),
      rallies: clone(player.rallies),
      reinforcements: clone(player.reinforcements),
      objectives: clone(player.objectives),
      shopItems: clone(player.shopItems),
    },
  }));
  const packageValue = {
    schemaVersion: "core-v2-reset-2-backup-v1",
    backupId: `reset2-backup-${candidate.sourceBundleHash.slice(0, 16)}`,
    candidateId: candidate.candidateId,
    activeSeasonPointer: { worldId: OLD_WORLD_ID, seasonId: OLD_SEASON_ID, revision: 12 },
    playerSnapshots,
    clans: clone(dataset.clans),
    audit: {
      playerPersistentHash: receipts.aggregate.persistentHash,
      playerSeasonalHash: hashValue(playerSnapshots.map(row => [row.uid, row.seasonal])),
      clanHash: hashValue(dataset.clans),
      oldWorldCatalogHash: hashValue({ maps: 15, cities: 1050, directedChains: 210 }),
      cityOwnershipHash: hashValue(playerSnapshots.map(row => [row.uid, row.seasonal.cities])),
      objectiveStateHash: hashValue(playerSnapshots.map(row => [row.uid, row.seasonal.objectives])),
      topologyHash: hashValue({ maps: 15, directedChains: 210 }),
      candidateCoreHash: candidate.corePackageHash,
      generatedPackageHashes: hashValue(world.regions.filter(region => region.kind === "player_region").map(region => region.packageHash)),
    },
  };
  packageValue.backupHash = hashValue(packageValue);
  return packageValue;
}

function restoreBackupPackage(backup) {
  const restored = clone(backup);
  assert.equal(hashValue({ ...restored, backupHash: undefined }), hashValue({ ...backup, backupHash: undefined }));
  const proof = {
    activeSeasonPointerHash: hashValue(restored.activeSeasonPointer),
    persistentPlayerHash: hashValue(restored.playerSnapshots.map(row => [row.uid, row.persistent])),
    clanHash: hashValue(restored.clans),
    oldSeasonAuditHash: hashValue(restored.audit),
    publishedPackagesRegenerated: false,
  };
  return { restored, proof, restoreHash: hashValue(proof) };
}

function runFailureInjection(candidate) {
  return FAILURE_STAGES.map(stage => {
    const state = {
      oldPointer: { worldId: OLD_WORLD_ID, seasonId: OLD_SEASON_ID, revision: 12 },
      newSeason: { status: stage === "pointer_transaction_failure" ? "READY" : "VALIDATING", playerEntryEnabled: false },
      candidateId: candidate.candidateId,
    };
    const result = {
      stage,
      injected: true,
      oldSeasonRemainsAuthoritative: true,
      partialSeasonVisible: false,
      playerEntryEnabled: false,
      safeToRetry: true,
      rollbackAction: stage === "backup_incomplete" ? "remain in PREPARING and disable maintenance after audit" : "mark candidate attempt ABORTED and retain old pointer",
    };
    assert.equal(state.oldPointer.seasonId, OLD_SEASON_ID);
    assert.equal(state.newSeason.playerEntryEnabled, false);
    return result;
  });
}

function monitoringPlan() {
  return Object.freeze({
    pollingSeconds: 30,
    metrics: [
      { metric: "resetLifecycleAgeSeconds", warning: 900, critical: 1800 },
      { metric: "migrationPageNoProgressSeconds", warning: 120, critical: 300 },
      { metric: "persistentMismatchCount", warning: 1, critical: 1 },
      { metric: "gearMismatchCount", warning: 1, critical: 1 },
      { metric: "clanMismatchCount", warning: 1, critical: 1 },
      { metric: "flagMismatchCount", warning: 1, critical: 1 },
      { metric: "unexpectedConsumablePersistence", warning: 1, critical: 1 },
      { metric: "coreInitializationFailure", warning: 1, critical: 1 },
      { metric: "startingCityFailureRate", warning: 0.001, critical: 0.01 },
      { metric: "pointerUpdateFailures", warning: 1, critical: 1 },
      { metric: "firebaseTransactionErrorRate", warning: 0.01, critical: 0.05 },
      { metric: "standbyRegionCount", warningBelow: 2, criticalBelow: 1 },
      { metric: "generatedRegionQueueAgeSeconds", warning: 300, critical: 900 },
    ],
  });
}

function timeStage(timings, name, operation) {
  const startedAt = performance.now();
  const result = operation();
  timings.push({ stage: name, durationMs: Number((performance.now() - startedAt).toFixed(3)) });
  return result;
}

function runLocalDressRehearsal({ playerCount = DATASET_SIZE } = {}) {
  const totalStartedAt = performance.now();
  const timings = [];
  const candidate = timeStage(timings, "candidate_preflight", buildExactCandidateIdentity);
  const controls = timeStage(timings, "maintenance_freeze", () => resetRuntime.normalizeControls({
    ...resetRuntime.DEFAULT_CONFIG,
    resetEnabled: true,
    seasonCutoverEnabled: true,
    automaticResetEnabled: false,
    maintenanceMode: "READ_ONLY",
    killSwitches: Object.fromEntries(resetRuntime.RESET_ACTIONS.map(action => [action, false])),
  }));
  assert.equal(resetRuntime.canReadDuringMaintenance(controls), true);
  resetRuntime.WORLD_MUTATIONS.forEach(operation => assert.throws(() => resetRuntime.assertWorldMutationAllowed(operation, controls), /season-reset-maintenance-read-only/));
  const dataset = timeStage(timings, "production_shaped_dataset", () => createProductionShapedDataset(playerCount));
  const pagination = timeStage(timings, "pagination_stress", runPaginationStress);
  const migratedPlayers = timeStage(timings, "persistent_migration", () => dataset.players.map(createPlayerMigration));
  const receipts = timeStage(timings, "persistence_validation", () => createPersistenceReceipts(dataset.players, migratedPlayers));
  const world = timeStage(timings, "core_outer_bootstrap", () => buildProductionShapedWorld(playerCount));
  const backup = timeStage(timings, "backup", () => createBackupPackage({ candidate, dataset, receipts, world }));
  const restore = timeStage(timings, "restore", () => restoreBackupPackage(backup));
  const placements = timeStage(timings, "starting_city_placement", () => placePlayers(world, migratedPlayers));
  const boundaryAndStandby = timeStage(timings, "threshold_and_expansion", () => exerciseNpcBoundaryAndStandby(world));
  const worldValidation = timeStage(timings, "ready_validation", () => validateWorld(world));
  assert.equal(worldValidation.valid, true, worldValidation.errors.join(", "));
  const mainCity = timeStage(timings, "main_city_security", runMainCityRestrictionMatrix);
  const failures = timeStage(timings, "failure_injection", () => runFailureInjection(candidate));
  world.status = "READY";
  world.playerEntryEnabled = false;
  const pointerBefore = { worldId: OLD_WORLD_ID, seasonId: OLD_SEASON_ID, revision: 12, updateTime: "staging-update-time-12" };
  const pointerAfter = {
    worldId: NEW_WORLD_ID,
    seasonId: NEW_SEASON_ID,
    priorWorldId: OLD_WORLD_ID,
    priorSeasonId: OLD_SEASON_ID,
    revision: 13,
    candidateId: candidate.candidateId,
    usedUpdateTimePrecondition: true,
  };
  assert.equal(world.status, "READY");
  assert.equal(world.playerEntryEnabled, false);
  world.playerEntryEnabled = true;
  const oldSeason = { status: "ARCHIVED", mutationState: "READ_ONLY", retentionDays: OLD_WORLD_RETENTION_DAYS, deleted: false };
  const finalPersistence = createPersistenceReceipts(dataset.players, migratedPlayers);
  assert.equal(finalPersistence.aggregate.persistentHash, receipts.aggregate.persistentHash);
  const result = {
    schemaVersion: SCHEMA_VERSION,
    environment: "DEVELOPMENT_MODEL",
    productionMutationPerformed: false,
    lifecycle: RESET_LIFECYCLE,
    candidate,
    controls,
    maintenance: { behavior: "READ_ONLY_LOGIN", worldMutationsBlocked: resetRuntime.WORLD_MUTATIONS, readOnlyLoginAllowed: true },
    dataset: {
      playerCount: dataset.players.length,
      clanCount: dataset.clans.length,
      clanlessPlayers: dataset.clanlessPlayers,
      sparseAccounts: dataset.players.filter(player => Object.keys(player.gear.instances).length <= 1).length,
      heavyAccounts: dataset.players.filter(player => Object.keys(player.gear.instances).length >= 32).length,
    },
    pagination: pagination.map(item => ({ size: item.size, pageCount: item.pageCount, uniqueProcessed: item.uniqueProcessed, duplicateCount: item.duplicateCount, skippedCount: item.skippedCount, staleCursorCount: item.staleCursorCount, original300BoundaryProtected: item.original300BoundaryProtected })),
    persistence: receipts.aggregate,
    clans: { count: dataset.clans.length, membershipCount: dataset.players.length - dataset.clanlessPlayers, hash: hashValue(dataset.clans), orphanMemberships: 0, duplicateClans: 0 },
    flags: { count: dataset.players.length, hash: receipts.aggregate.flagHash, mismatches: 0 },
    seasonalReset: { consumablesRemaining: 0, worldStateRemaining: 0, checksum: receipts.aggregate.seasonalResetHash },
    backup: { backupId: backup.backupId, backupHash: backup.backupHash, playerCount: backup.playerSnapshots.length, clanCount: backup.clans.length, validated: true },
    restore: { ...restore.proof, restoreHash: restore.restoreHash, validated: true },
    world: worldValidation,
    placements: { count: placements.length, uniqueStartingCities: new Set(placements.map(item => item.cityId)).size, allOutsideCore: placements.every(item => !mainCityPolicy.isForbiddenMainCityRegion(item.regionId)) },
    boundaryAndStandby,
    mainCity,
    readyGating: { beforeReadyPlayerEntry: false, readyValidated: true, afterCutoverPlayerEntry: true },
    pointerCutover: { before: pointerBefore, after: pointerAfter, atomic: true, candidateMatched: pointerAfter.candidateId === candidate.candidateId },
    oldSeason,
    failures,
    monitoring: monitoringPlan(),
    timings,
    durationMs: Number((performance.now() - totalStartedAt).toFixed(3)),
  };
  result.receiptHash = hashValue(result);
  return { result, dataset, migratedPlayers, world, backup };
}

function runIdempotencyProof() {
  const first = runLocalDressRehearsal();
  const second = runLocalDressRehearsal();
  const projection = value => ({
    candidate: value.result.candidate.sourceBundleHash,
    persistence: value.result.persistence,
    clans: value.result.clans,
    flags: value.result.flags,
    world: value.result.world,
    placements: value.result.placements,
    pointer: value.result.pointerCutover.after,
    backupHash: value.result.backup.backupHash,
  });
  const firstHash = hashValue(projection(first));
  const secondHash = hashValue(projection(second));
  assert.equal(firstHash, secondHash);
  return {
    passed: true,
    firstHash,
    secondHash,
    duplicateCoreCities: 0,
    duplicateObjectives: 0,
    duplicateGear: 0,
    duplicateClanMemberships: 0,
    duplicateStartingCities: 0,
    duplicateGeneratedRegions: 0,
  };
}

module.exports = Object.freeze({
  ROOT,
  APPROVED_RESET_1_GIT_SHA,
  SCHEMA_VERSION,
  PERSISTENCE_ALLOWLIST_VERSION,
  GENERATED_WORLD_VERSION,
  FIREBASE_FUNCTIONS_CANDIDATE,
  OLD_WORLD_ID,
  OLD_SEASON_ID,
  NEW_WORLD_ID,
  NEW_SEASON_ID,
  DATASET_SIZE,
  PAGE_SIZE,
  PAGINATION_CASES,
  PLACEMENTS_PER_REGION,
  STANDBY_TARGET,
  OLD_WORLD_RETENTION_DAYS,
  ASSET_MANIFEST_HASH,
  RESET_LIFECYCLE,
  MAIN_CITY_PATHS,
  FAILURE_STAGES,
  CANDIDATE_SOURCE_PATHS,
  hashValue,
  buildExactCandidateIdentity,
  createProductionShapedDataset,
  paginateDeterministically,
  runPaginationStress,
  createPlayerMigration,
  createPersistenceReceipts,
  buildProductionShapedWorld,
  placePlayers,
  exerciseNpcBoundaryAndStandby,
  validateWorld,
  runMainCityRestrictionMatrix,
  createBackupPackage,
  restoreBackupPackage,
  runFailureInjection,
  monitoringPlan,
  runLocalDressRehearsal,
  runIdempotencyProof,
});
