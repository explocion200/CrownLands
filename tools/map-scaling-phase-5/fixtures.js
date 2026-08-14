"use strict";

const path = require("node:path");
const {
  allocateNextPlayerRegion,
  generateRegionPrototype,
  refreshRegionConnections,
  hashObject,
} = require("../map-scaling-phase-4/generator");
const { ASSET_LIBRARY_VERSION, createAssetLibraryManifest, validateAssetLibrary } = require("./asset-library");
const {
  createPermanentCorePackage,
  validatePermanentCorePackage,
  validateFutureTowerProposal,
  FUTURE_HOLDING_TOWER_COORDINATES,
} = require("./core-package");
const {
  PHASE5_GENERATOR_VERSION,
  composePlayerRegion,
} = require("./composer");
const {
  createTerrainPlan,
  createPhase4Definition,
} = require("./terrain-plan");
const {
  validateGeometryArtParity,
  validateBakedAssets,
  validatePlayerPackage,
} = require("./validators");

const DEVELOPMENT_WORLD_ID = "phase5_development_world";
const DEVELOPMENT_SEASON_ID = "phase5_development_season";
const VALID_PROFILES = Object.freeze(["agricultural", "woodland", "rolling_hills", "wetland"]);

function createAllocatorCore(corePackage) {
  return corePackage.cells.map(cell => ({
    id: cell.regionId || `phase5_core_reservation_${cell.gridX + 2}_${cell.gridY + 2}`,
    name: cell.regionName || `Reserved Core ${cell.gridX},${cell.gridY}`,
    purpose: cell.purpose || cell.reservedPurpose,
    permanentCore: true,
    spawnEligible: false,
    spawnReady: false,
    lifecycle: cell.regionId ? "active" : "reserved",
    visibility: "development_only",
    gridX: cell.gridX,
    gridY: cell.gridY,
    worldLayer: 0,
    clockwiseOrderIndex: null,
    connections: cell.connections || undefined,
  }));
}

function allocateFixture(existingRegions, regionId) {
  return allocateNextPlayerRegion({
    worldId: DEVELOPMENT_WORLD_ID,
    seasonId: DEVELOPMENT_SEASON_ID,
    existingRegions,
    regionId,
    generatorVersion: PHASE5_GENERATOR_VERSION,
  });
}

function generateGeometryFixture(existingRegions, allocation, profile, retrySalt) {
  const terrainPlan = createTerrainPlan({ allocation, profile, generatorVersion: PHASE5_GENERATOR_VERSION, retrySalt });
  const definition = createPhase4Definition(allocation, terrainPlan);
  const result = generateRegionPrototype({
    existingRegions,
    allocation,
    definition,
    generatorVersion: PHASE5_GENERATOR_VERSION,
    seedSalt: `${ASSET_LIBRARY_VERSION}|${retrySalt}`,
    // Topology fixtures exercise many deterministic seeds. A larger offline
    // candidate budget preserves every Phase 4 spacing/clearance rule while
    // allowing a valid 40th position on the denser profiles.
    config: { maximumCandidateEvaluations: 400000 },
  });
  return { terrainPlan, result };
}

function runProfileFixture(profile, allocatorCore, outputRoot) {
  const allocation = allocateFixture(allocatorCore, `phase5_${profile}_region`);
  const outputDirectory = path.join(outputRoot, "packages", profile);
  const first = composePlayerRegion({
    allocation,
    existingRegions: allocatorCore,
    profile,
    retrySalt: "profile-default",
    outputDirectory,
  });
  const second = composePlayerRegion({
    allocation,
    existingRegions: allocatorCore,
    profile,
    retrySalt: "profile-default",
    outputDirectory,
  });
  return {
    kind: profile,
    expectedValid: true,
    result: second,
    deterministic: {
      terrainPlan: first.terrainPlan.terrainPlanHash === second.terrainPlan.terrainPlanHash,
      cities: first.package.hashes.cityHash === second.package.hashes.cityHash,
      startingCandidates: first.package.hashes.startingCandidateHash === second.package.hashes.startingCandidateHash,
      mapWebp: first.package.hashes.webpHash === second.package.hashes.webpHash,
      thumbnail: first.package.hashes.thumbnailHash === second.package.hashes.thumbnailHash,
      package: first.package.packageHash === second.package.packageHash,
    },
  };
}

function runConstrainedInvalidFixture(allocatorCore) {
  const allocation = allocateFixture(allocatorCore, "phase5_constrained_invalid_region");
  return {
    kind: "constrained_invalid",
    expectedValid: false,
    result: composePlayerRegion({
      allocation,
      existingRegions: allocatorCore,
      profile: "wetland",
      retrySalt: "invalid-default",
      constrained: true,
      bake: false,
    }),
  };
}

function runTopologyFixture(mapCount, label, allocatorCore) {
  let regions = [...allocatorCore];
  const maps = [];
  for (let index = 0; index < mapCount; index += 1) {
    const allocation = allocateFixture(regions, `phase5_${label}_${String(index + 1).padStart(2, "0")}`);
    const profile = VALID_PROFILES[index % VALID_PROFILES.length];
    const generated = generateGeometryFixture(regions, allocation, profile, `${label}:${index}`);
    maps.push({
      regionId: allocation.regionId,
      coordinate: allocation.coordinate,
      allocationConnections: allocation.connections,
      cityCount: generated.result.previewDefinition.cities.length,
      startingCandidateCount: generated.result.previewDefinition.startingCityCandidates.length,
      generationHash: generated.result.generationHash,
      status: generated.result.status,
    });
    if (generated.result.catalogEntry) regions = refreshRegionConnections([...regions, generated.result.catalogEntry]);
  }
  const finalById = new Map(regions.map(region => [region.id, region]));
  maps.forEach(map => { map.finalConnections = finalById.get(map.regionId)?.connections || map.allocationConnections; });
  return {
    kind: label,
    mapCount,
    maps,
    allExactly40: maps.every(map => map.cityCount === 40 && map.status === "standby"),
    topologyHash: hashObject(maps.map(map => ({ regionId: map.regionId, coordinate: map.coordinate, connections: map.finalConnections, cityCount: map.cityCount }))),
  };
}

function runInvalidMutationFixtures(validPackage, validTerrainPlan) {
  const duplicateCity = JSON.parse(JSON.stringify(validPackage));
  duplicateCity.cities[1].id = duplicateCity.cities[0].id;
  const missingOutput = JSON.parse(JSON.stringify(validPackage));
  missingOutput.mapWebp = null;
  missingOutput.assetValidation = validateBakedAssets({});
  const budgetFailure = JSON.parse(JSON.stringify(validPackage));
  budgetFailure.assetValidation = validateBakedAssets({
    map: { width: 1448, height: 1086, opaque: true, sha256: "x", bytes: 1024 * 1024 + 1 },
    thumbnail: { width: 320, height: 240, opaque: true, sha256: "y", bytes: 1024 },
  });
  const parityMismatch = JSON.parse(JSON.stringify(validTerrainPlan));
  const blockerVisual = parityMismatch.visualComposition.find(element => element.geometryRef === parityMismatch.blockers[0].id);
  blockerVisual.x += 10;
  const multipleExits = JSON.parse(JSON.stringify(validTerrainPlan));
  multipleExits.roadSystem.edgeRoads.push({
    ...multipleExits.roadSystem.edgeRoads.find(road => road.side === "north"),
    id: "illegal-second-north-exit",
  });
  return {
    duplicateCityRejected: !validatePlayerPackage(duplicateCity).valid,
    missingOutputRejected: !validatePlayerPackage(missingOutput).valid,
    assetBudgetRejected: !validatePlayerPackage(budgetFailure).valid,
    geometryMismatchRejected: !validateGeometryArtParity(parityMismatch).valid,
    multipleEdgeExitRejected: !validateGeometryArtParity(multipleExits).valid,
  };
}

function runCoreFixtures(corePackage) {
  const coreValidation = validatePermanentCorePackage(corePackage);
  const towerCoordinate = FUTURE_HOLDING_TOWER_COORDINATES[0];
  const validTowerProposal = validateFutureTowerProposal(corePackage, {
    coordinate: towerCoordinate,
    towerFootprint: { x: 724, y: 543, radius: 110 },
    cityRelocations: [],
    proposedCities: [],
    publishedCities: [],
    authoritativeCityCoordinates: [],
  });
  const relocationAttempt = validateFutureTowerProposal(corePackage, {
    coordinate: towerCoordinate,
    cityRelocations: [{ cityId: "published_city", from: { x: 300, y: 300 }, to: { x: 350, y: 350 } }],
    proposedCities: [],
    publishedCities: [{ id: "published_city", x: 350, y: 350 }],
    authoritativeCityCoordinates: [{ id: "published_city", x: 300, y: 300 }],
  });
  const overlapAttempt = validateFutureTowerProposal(corePackage, {
    coordinate: towerCoordinate,
    cityRelocations: [],
    proposedCities: [],
    towerFootprint: { x: 300, y: 300, radius: 100 },
    publishedCities: [{ id: "published_city", x: 320, y: 320 }],
    authoritativeCityCoordinates: [{ id: "published_city", x: 320, y: 320 }],
  });
  return {
    template25: { passed: coreValidation.valid, cellCount: corePackage.cells.length },
    citadel: { passed: coreValidation.citadelCount === 1, count: coreValidation.citadelCount },
    strongholdsAndCamps: { passed: coreValidation.strongholdCount === 4 && coreValidation.campCount === 4, strongholds: coreValidation.strongholdCount, camps: coreValidation.campCount },
    towerReservations: { passed: coreValidation.holdingTowerReservationCount === 4 && validTowerProposal.valid, count: coreValidation.holdingTowerReservationCount },
    relocationRejected: !relocationAttempt.valid,
    overlapRejected: !overlapAttempt.valid,
    validation: coreValidation,
  };
}

function runPhase5FixtureSuite(outputRoot) {
  const assetLibrary = createAssetLibraryManifest();
  const assetLibraryValidation = validateAssetLibrary(assetLibrary);
  const corePackage = createPermanentCorePackage();
  const allocatorCore = createAllocatorCore(corePackage);
  const playerProfiles = VALID_PROFILES.map(profile => runProfileFixture(profile, allocatorCore, outputRoot));
  const constrainedInvalid = runConstrainedInvalidFixture(allocatorCore);
  const twoConnected = runTopologyFixture(2, "two_connected", allocatorCore);
  const threeClockwise = runTopologyFixture(3, "three_clockwise", allocatorCore);
  const ringClosing = runTopologyFixture(24, "ring_closing", allocatorCore);
  const firstValid = playerProfiles[0].result;
  return {
    schemaVersion: 1,
    phase: 5,
    developmentOnly: true,
    worldId: DEVELOPMENT_WORLD_ID,
    seasonId: DEVELOPMENT_SEASON_ID,
    generatorVersion: PHASE5_GENERATOR_VERSION,
    assetLibraryVersion: ASSET_LIBRARY_VERSION,
    assetLibrary,
    assetLibraryValidation,
    corePackage,
    coreFixtures: runCoreFixtures(corePackage),
    playerProfiles,
    constrainedInvalid,
    topologyFixtures: { twoConnected, threeClockwise, ringClosing },
    invalidMutations: runInvalidMutationFixtures(firstValid.package, firstValid.terrainPlan),
  };
}

module.exports = Object.freeze({
  DEVELOPMENT_WORLD_ID,
  DEVELOPMENT_SEASON_ID,
  VALID_PROFILES,
  createAllocatorCore,
  allocateFixture,
  generateGeometryFixture,
  runProfileFixture,
  runTopologyFixture,
  runPhase5FixtureSuite,
});
