"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const FIXED_EPOCH_MS = Date.UTC(2041, 0, 1, 12, 0, 0);
const BENCHMARK_SEED = "crownlands-core-v2-qa-1-v1";
const PRIMARY_REGION_ID = "core-v2-crown-citadel-p0-p0";
const NEIGHBOR_REGION_ID = "core-v2-swiftgate-p1-p0";

const SIDE_META = Object.freeze({
  north: { dx: 0, dy: -1, opposite: "south", start: 0.472, end: 0.528, arrowXNorm: 0.5, arrowYNorm: 0.065 },
  east: { dx: 1, dy: 0, opposite: "west", start: 0.462, end: 0.538, arrowXNorm: 0.935, arrowYNorm: 0.5 },
  south: { dx: 0, dy: 1, opposite: "north", start: 0.472, end: 0.528, arrowXNorm: 0.5, arrowYNorm: 0.935 },
  west: { dx: -1, dy: 0, opposite: "east", start: 0.462, end: 0.538, arrowXNorm: 0.065, arrowYNorm: 0.5 },
});

const SOURCE_BATCHES = Object.freeze([
  {
    indexPath: "benchmark-results/map/core-v2-phase-a/prototype-index.json",
    property: "prototypes",
    artDirectory: "benchmark-results/map/core-v2-phase-art-2-v2/candidates",
    artName: "map-final-candidate-v2.webp",
  },
  {
    indexPath: "benchmark-results/map/core-v2-phase-b1/batch-index.json",
    property: "prototypes",
    artDirectory: "benchmark-results/map/core-v2-phase-art-3/candidates",
    artName: "map-final-candidate.webp",
  },
  ...[4, 5, 6].map(phase => ({
    indexPath: `benchmark-results/map/core-v2-phase-art-${phase}/art${phase}-index.json`,
    property: "entries",
    artDirectory: `benchmark-results/map/core-v2-phase-art-${phase}/candidates`,
    artName: "map-final-candidate.webp",
  })),
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function coordinateKey(x, y) {
  return `${x},${y}`;
}

function loadPrototypes() {
  return SOURCE_BATCHES.flatMap(source => {
    const document = readJson(source.indexPath);
    return document[source.property].map(entry => {
      const regionId = entry.regionId || entry.sourceRegionId;
      assert(regionId, `Missing region ID for ${entry.key}.`);
      return {
        ...entry,
        regionId,
        sourceIndexPath: source.indexPath,
        candidateMapPath: `${source.artDirectory}/${entry.key}/${source.artName}`,
      };
    });
  }).sort((left, right) => left.coordinate.gridY - right.coordinate.gridY || left.coordinate.gridX - right.coordinate.gridX);
}

function buildConnections(prototype, byCoordinate) {
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => {
    const target = byCoordinate.get(coordinateKey(prototype.coordinate.gridX + meta.dx, prototype.coordinate.gridY + meta.dy));
    return [side, target ? [{
      id: `${side}_road`,
      side,
      start: meta.start,
      end: meta.end,
      type: "road",
      connectsToRegionId: target.regionId,
      arrowXNorm: meta.arrowXNorm,
      arrowYNorm: meta.arrowYNorm,
      intentionalOuter: false,
      notes: "Core v2 QA-1 immutable cardinal connection",
    }] : []];
  }));
}

function catalogConnections(prototype, byCoordinate) {
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => {
    const target = byCoordinate.get(coordinateKey(prototype.coordinate.gridX + meta.dx, prototype.coordinate.gridY + meta.dy));
    return [side, {
      side,
      oppositeSide: meta.opposite,
      state: target ? "open" : "gated",
      targetRegionId: target?.regionId || "",
      fixturePackageAvailabilityOnly: true,
    }];
  }));
}

function createCities(prototype) {
  return readJson(`${prototype.outputDirectory}/cities.json`).map((city, index) => ({
    id: city.id,
    sourceCityId: city.id,
    name: index % 11 === 0 ? `Royal ${prototype.name} ${index + 1}` : `${prototype.name} Hold ${index + 1}`,
    regionId: prototype.regionId,
    x: city.x,
    y: city.y,
    xNorm: Number(city.xNorm),
    yNorm: Number(city.yNorm),
    level: 1 + (index * 9) % 50,
    troops: 10,
    owner: "neutral",
    ownerKind: "neutral",
    startType: "neutral",
    developmentOnly: true,
  }));
}

function createSnapshots(cities, regionIndex) {
  return cities.map((city, index) => {
    const playerOwned = index < Math.max(4, Math.floor(cities.length * 0.18));
    const rivalOwned = !playerOwned && index % 3 !== 0;
    const ownerUid = playerOwned ? "qa1-player" : rivalOwned ? `qa1-rival-${(index + regionIndex) % 16}` : "";
    const troops = 1850 + ((index * 7919 + regionIndex * 2741) % 148000);
    return {
      id: city.id,
      sourceCityId: city.sourceCityId,
      ownerKind: ownerUid ? "player" : "neutral",
      ownerUid,
      ownerName: playerOwned ? "Core QA Ruler" : rivalOwned ? `Rival Banner ${(index + regionIndex) % 16 + 1}` : "",
      ownerFlag: ownerUid ? {
        field: index % 2 ? "#274b7a" : "#7a2f27",
        mark: index % 3 ? "#e8d7a2" : "#d4af37",
        markType: index % 2 ? "chevron" : "cross",
      } : null,
      level: city.level,
      troops,
      troopFloat: troops,
      investedGold: 25000 + index * 1500,
      isMainCity: city.regionId === PRIMARY_REGION_ID && index === 0,
      updatedAtMs: FIXED_EPOCH_MS,
    };
  });
}

function createCamps(prototype) {
  const objective = prototype.objective || {};
  const config = {
    warband: { campType: "troops", name: "Warband Camp" },
    relic: { campType: "items", name: "Relic Camp" },
    deed: { campType: "deed", name: "Deed Camp" },
    gold: { campType: "gold", name: "Gold Camp" },
  }[objective.type];
  if (!config) return [];
  return [{
    id: `${prototype.regionId}_${config.campType}_camp`,
    name: prototype.profile?.objectiveLabel || config.name,
    campType: config.campType,
    type: config.campType,
    x: objective.x,
    y: objective.y,
    xNorm: Number((objective.x / 1448).toFixed(6)),
    yNorm: Number((objective.y / 1086).toFixed(6)),
    size: objective.visualSize,
    artSrc: prototype.profile?.objectiveArt || "",
    developmentOnly: true,
  }];
}

function createStrongholds(prototype) {
  const objective = prototype.objective || {};
  const config = {
    crown_citadel: { name: "Crown Citadel", type: "crown", source: "crown_citadel", bonus: "all", bonusPercent: 25, level: 100, troops: 500000 },
    defense: { name: "Ironwatch", type: "defense", source: "defense_stronghold", bonus: "defense", bonusPercent: 20, level: 50, troops: 150000 },
    gold_production: { name: "Aurum Keep", type: "gold", source: "gold_stronghold", bonus: "gold", bonusPercent: 20, level: 50, troops: 150000 },
    training: { name: "Greybanner Hold", type: "training", source: "troop_stronghold", bonus: "troop", bonusPercent: 20, level: 50, troops: 150000 },
    march_speed: { name: "Swiftgate", type: "speed", source: "march_speed_stronghold", bonus: "march_speed", bonusPercent: 20, level: 50, troops: 150000 },
  }[objective.type];
  if (!config) return [];
  return [{
    id: `${prototype.regionId}_${config.type}_stronghold`,
    name: config.name,
    x: objective.x,
    y: objective.y,
    xNorm: Number((objective.x / 1448).toFixed(6)),
    yNorm: Number((objective.y / 1086).toFixed(6)),
    type: config.type,
    strongholdType: config.type,
    sourceStrongholdType: config.source,
    bonus: config.bonus,
    bonusPercent: config.bonusPercent,
    level: config.level,
    troops: config.troops,
    artSrc: prototype.profile?.objectiveArt || "",
    size: objective.visualSize,
    developmentOnly: true,
  }];
}

function createFixture() {
  const prototypes = loadPrototypes();
  assert.equal(prototypes.length, 25, "QA-1 requires exactly 25 Core maps.");
  const coordinateKeys = prototypes.map(entry => coordinateKey(entry.coordinate.gridX, entry.coordinate.gridY));
  assert.equal(new Set(coordinateKeys).size, 25, "QA-1 Core coordinates must be unique.");
  const byCoordinate = new Map(prototypes.map(entry => [coordinateKey(entry.coordinate.gridX, entry.coordinate.gridY), entry]));
  const releaseConfig = readJson("functions/release-config.json");
  const maps = [];
  const citiesByRegion = {};
  const campsByRegion = {};

  prototypes.forEach((prototype, regionIndex) => {
    const cities = createCities(prototype);
    assert.equal(cities.length, prototype.exactCityCapacity, `${prototype.name} capacity mismatch.`);
    const camps = createCamps(prototype);
    const objectives = createStrongholds(prototype);
    maps.push({
      id: prototype.regionId,
      label: `${prototype.name} — Core v2 QA-1`,
      type: "starter",
      purpose: prototype.mapType.toLowerCase(),
      gridX: prototype.coordinate.gridX,
      gridY: prototype.coordinate.gridY,
      imageWidth: 1448,
      imageHeight: 1086,
      imageSrc: `/__core_b1__/maps/${prototype.key}.webp`,
      thumbnailSrc: `/__core_b1__/maps/${prototype.key}.webp`,
      cityCapacity: prototype.exactCityCapacity,
      cities,
      camps,
      objectives,
      edgeConnections: buildConnections(prototype, byCoordinate),
    });
    citiesByRegion[prototype.regionId] = createSnapshots(cities, regionIndex);
    campsByRegion[prototype.regionId] = camps.map(camp => ({
      id: camp.id,
      regionId: prototype.regionId,
      campType: camp.campType,
      holderUid: "qa1-rival-3",
      holderName: "Rival Banner 4",
      troops: 20000,
      updatedAtMs: FIXED_EPOCH_MS,
    }));
  });

  const allCityIds = maps.flatMap(map => map.cities.map(city => city.id));
  assert.equal(allCityIds.length, 1480, "QA-1 requires exactly 1,480 Core cities.");
  assert.equal(new Set(allCityIds).size, 1480, "QA-1 Core city IDs must be unique.");

  const regions = prototypes.map((prototype, index) => {
    const map = maps[index];
    return {
      id: map.id,
      name: map.label,
      type: map.type,
      purpose: map.purpose,
      permanentCore: true,
      spawnEligible: false,
      spawnReady: false,
      worldLayer: 0,
      clockwiseOrderIndex: null,
      lifecycle: "development_fixture",
      gridX: map.gridX,
      gridY: map.gridY,
      width: map.imageWidth,
      height: map.imageHeight,
      mapAsset: map.imageSrc,
      thumbnailAsset: map.thumbnailSrc,
      regionDefinitionPath: `/__core_b1__/regions/${map.id}.json`,
      cityCapacity: map.cityCapacity,
      npcCityCount: map.cities.length,
      objectiveCount: map.objectives.length,
      campCount: map.camps.length,
      reservations: prototype.mapType === "HOLDING_TOWER" ? [{ type: "holding_tower", ...prototype.objective, developmentOnly: true }] : [],
      compatibilityRegion: {
        id: map.id,
        label: map.label,
        gridX: map.gridX,
        gridY: map.gridY,
        x: 6500 + map.gridX * 2300,
        y: 8500 + map.gridY * 2300,
        rx: 1058,
        ry: 828,
        cityRx: 868,
        cityRy: 629,
        rot: 0,
        palette: "heartland",
      },
      connections: catalogConnections(prototype, byCoordinate),
    };
  });

  return {
    schemaVersion: 1,
    developmentOnly: true,
    productionActivated: false,
    productionProjectId: "crown-land-b15e0",
    stagingProjectId: "crownlands-map-staging-2026",
    benchmarkSeed: BENCHMARK_SEED,
    fixedEpochMs: FIXED_EPOCH_MS,
    scenario: { id: "CORE_V2_QA_1", slug: "complete-core-runtime-interactive-qa", label: "Core v2 QA-1", cityCount: 1480, marchCount: 14 },
    primaryRegionId: PRIMARY_REGION_ID,
    neighborRegionId: NEIGHBOR_REGION_ID,
    player: { uid: "qa1-player", email: "core-qa1.invalid@local.test", displayName: "Core QA Ruler" },
    releaseConfig,
    mapData: { maps },
    regionCatalog: {
      schemaVersion: 3,
      worldId: "core_v2_qa_1_development_only",
      worldName: "Crownlands Core v2 QA-1",
      updatedAt: "2041-01-01T12:00:00.000Z",
      version: 1,
      globalSettings: { defaultMapWidth: 1448, defaultMapHeight: 1086, minimumCitySpacing: 68, worldWidth: 13000, worldHeight: 17000, gridCellWorldSize: 2300 },
      topology: { coreRadius: 2, coreWidth: 5, ringAnchor: "north-west", ringDirection: "clockwise", connections: "cardinal-only" },
      coreReservations: regions.flatMap(region => region.reservations.map(reservation => ({ regionId: region.id, gridX: region.gridX, gridY: region.gridY, ...reservation }))),
      capacityPolicy: { minimumNpcCitiesForSpawn: 15, serverAuthoritative: true, coreSpawnEligible: false },
      definitionCache: { maxRegions: 8, loadPolicy: "active-first-nearby-on-demand" },
      bounds: { minGridX: -2, maxGridX: 2, minGridY: -2, maxGridY: 2, width: 5, height: 5 },
      regions,
    },
    prototypes: prototypes.map(prototype => ({
      key: prototype.key,
      regionId: prototype.regionId,
      name: prototype.name,
      mapType: prototype.mapType,
      exactCityCapacity: prototype.exactCityCapacity,
      coordinate: prototype.coordinate,
      climate: prototype.climate,
      objective: prototype.objective,
      profile: prototype.profile,
      outputDirectory: prototype.outputDirectory,
      candidateMapPath: prototype.candidateMapPath,
      sourceIndexPath: prototype.sourceIndexPath,
    })),
    citiesByRegion,
    campsByRegion,
    qa1: {
      exactMapCount: 25,
      exactCityCount: 1480,
      reciprocalConnectionCount: 40,
      directedOpenSideCount: 80,
      outwardGatedSideCount: 20,
      diagonalConnectionCount: 0,
      interactiveRuntimeQA: "IN_PROGRESS",
    },
  };
}

module.exports = Object.freeze({
  BENCHMARK_SEED,
  FIXED_EPOCH_MS,
  NEIGHBOR_REGION_ID,
  PRIMARY_REGION_ID,
  SIDE_META,
  createFixture,
  loadPrototypes,
});
