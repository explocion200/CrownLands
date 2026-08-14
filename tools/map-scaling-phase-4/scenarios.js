"use strict";

const { performance } = require("node:perf_hooks");
const {
  GENERATOR_VERSION,
  allocateNextPlayerRegion,
  createRetryPlan,
  generateRegionPrototype,
  hashObject,
  refreshRegionConnections,
} = require("./generator");
const {
  FIXTURE_KINDS,
  createConstraintFixture,
  createDevelopmentCore25,
} = require("./fixtures");

const DEVELOPMENT_WORLD_ID = "phase4_development_world";
const DEVELOPMENT_SEASON_ID = "phase4_development_season";

function measureGeneration(input) {
  const beforeHeap = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const result = generateRegionPrototype(input);
  const elapsedMs = performance.now() - startedAt;
  const afterHeap = process.memoryUsage().heapUsed;
  return {
    result,
    timing: {
      generationAndValidationMs: Math.round(elapsedMs * 1000) / 1000,
      heapDeltaBytes: afterHeap - beforeHeap,
    },
  };
}

function createFixtureAllocation(kind, existingRegions = createDevelopmentCore25()) {
  return allocateNextPlayerRegion({
    worldId: DEVELOPMENT_WORLD_ID,
    seasonId: DEVELOPMENT_SEASON_ID,
    existingRegions,
    regionId: `phase4_${String(kind).replace(/[^a-z0-9]+/g, "_")}_region`,
    generatorVersion: GENERATOR_VERSION,
  });
}

function runNamedFixture(kind, { repeats = 3, seedSalt = "default" } = {}) {
  const existingRegions = createDevelopmentCore25();
  const allocation = createFixtureAllocation(kind, existingRegions);
  const fixture = createConstraintFixture(kind, allocation);
  const runs = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    runs.push(measureGeneration({
      existingRegions,
      allocation,
      definition: fixture.definition,
      config: fixture.config,
      seedSalt,
    }));
  }
  return {
    kind,
    expectedSpawnReady: fixture.expectedSpawnReady,
    hashes: runs.map(run => run.result.generationHash),
    deterministic: new Set(runs.map(run => run.result.generationHash)).size === 1,
    result: runs[0].result,
    timings: runs.map(run => run.timing),
  };
}

function runPartialRingSnapshots() {
  let regions = createDevelopmentCore25();
  const stages = new Map();
  const requestedCounts = new Set([1, 2, 5, 12, 23, 24]);
  for (let count = 1; count <= 24; count += 1) {
    const allocation = allocateNextPlayerRegion({
      worldId: DEVELOPMENT_WORLD_ID,
      seasonId: DEVELOPMENT_SEASON_ID,
      existingRegions: regions,
      generatorVersion: GENERATOR_VERSION,
    });
    const entry = {
      id: allocation.regionId,
      purpose: "player_region",
      permanentCore: false,
      lifecycle: "standby",
      spawnEligible: true,
      spawnReady: true,
      visibility: "development_only",
      gridX: allocation.coordinate.gridX,
      gridY: allocation.coordinate.gridY,
      worldLayer: allocation.coordinate.worldLayer,
      clockwiseOrderIndex: allocation.coordinate.clockwiseOrderIndex,
      connections: allocation.connections,
    };
    regions = refreshRegionConnections([...regions, entry]);
    if (requestedCounts.has(count)) {
      stages.set(count, {
        count,
        allocation,
        region: regions.find(region => region.id === entry.id),
      });
    }
  }
  const layerTwo = allocateNextPlayerRegion({
    worldId: DEVELOPMENT_WORLD_ID,
    seasonId: DEVELOPMENT_SEASON_ID,
    existingRegions: regions,
    generatorVersion: GENERATOR_VERSION,
  });
  return { stages: Object.fromEntries(stages), layerTwo, completedRegions: regions };
}

function buildFullDevelopmentLayerOne({ seedSalt = "full-layer-default" } = {}) {
  let regions = createDevelopmentCore25();
  const generated = [];
  const validKinds = FIXTURE_KINDS.filter(kind => kind !== "constrained-invalid");
  const startedAt = performance.now();
  const beforeHeap = process.memoryUsage().heapUsed;
  for (let index = 0; index < 24; index += 1) {
    const allocation = allocateNextPlayerRegion({
      worldId: DEVELOPMENT_WORLD_ID,
      seasonId: DEVELOPMENT_SEASON_ID,
      existingRegions: regions,
      generatorVersion: GENERATOR_VERSION,
    });
    const kind = validKinds[index % validKinds.length];
    const fixture = createConstraintFixture(kind, allocation);
    const measured = measureGeneration({
      existingRegions: regions,
      allocation,
      definition: fixture.definition,
      config: fixture.config,
      seedSalt: `${seedSalt}:${index}`,
    });
    generated.push({ index, kind, ...measured });
    if (measured.result.catalogEntry) {
      regions = refreshRegionConnections([...regions, measured.result.catalogEntry]);
    }
  }
  const afterHeap = process.memoryUsage().heapUsed;
  const layerTwoAllocation = allocateNextPlayerRegion({
    worldId: DEVELOPMENT_WORLD_ID,
    seasonId: DEVELOPMENT_SEASON_ID,
    existingRegions: regions,
    generatorVersion: GENERATOR_VERSION,
  });
  const playerRegions = regions.filter(region => region.worldLayer === 1);
  const projection = generated.map(entry => ({
    index: entry.index,
    kind: entry.kind,
    regionId: entry.result.allocation.regionId,
    coordinate: entry.result.allocation.coordinate,
    connections: regions.find(region => region.id === entry.result.allocation.regionId)?.connections,
    generationHash: entry.result.generationHash,
    npcCityCount: entry.result.previewDefinition.cities.length,
    startingCandidateCount: entry.result.previewDefinition.startingCityCandidates.length,
    status: entry.result.status,
  }));
  return {
    generated,
    regions,
    playerRegions,
    layerTwoAllocation,
    layerHash: hashObject(projection),
    timing: {
      totalGenerationAndValidationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
      heapDeltaBytes: afterHeap - beforeHeap,
    },
  };
}

function runPhase4ScenarioSuite() {
  const fixtureReports = FIXTURE_KINDS.map(kind => runNamedFixture(kind));
  const openDefault = fixtureReports.find(report => report.kind === "open");
  const openAlternate = runNamedFixture("open", { seedSalt: "alternate-valid-seed" });
  const partialRing = runPartialRingSnapshots();
  const fullLayer = buildFullDevelopmentLayerOne();
  const invalid = fixtureReports.find(report => report.kind === "constrained-invalid");
  const retryPlan = createRetryPlan(invalid.result, {
    seedSalt: "constrained-retry-v2",
    configRevision: "terrain-or-density-revision-required",
  });
  return {
    generatorVersion: GENERATOR_VERSION,
    worldId: DEVELOPMENT_WORLD_ID,
    seasonId: DEVELOPMENT_SEASON_ID,
    fixtures: fixtureReports,
    differentSeed: {
      baselineHash: openDefault.result.generationHash,
      alternateHash: openAlternate.result.generationHash,
      different: openDefault.result.generationHash !== openAlternate.result.generationHash,
      alternateSpawnReady: openAlternate.result.status === "standby",
    },
    partialRing,
    fullLayer,
    retryPlan,
  };
}

module.exports = Object.freeze({
  DEVELOPMENT_WORLD_ID,
  DEVELOPMENT_SEASON_ID,
  measureGeneration,
  createFixtureAllocation,
  runNamedFixture,
  runPartialRingSnapshots,
  buildFullDevelopmentLayerOne,
  runPhase4ScenarioSuite,
});
