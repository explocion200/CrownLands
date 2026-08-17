"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const PHASE_B1_DIR = path.join(ROOT_DIR, "benchmark-results", "map", "core-v2-phase-b1");
const PHASE_A_DIR = path.join(ROOT_DIR, "benchmark-results", "map", "core-v2-phase-a");
const FIXED_EPOCH_MS = Date.UTC(2041, 0, 1, 12, 0, 0);
const PRIMARY_REGION_ID = "core_b1_warband";
const NEIGHBOR_REGION_ID = "core_b1_relic_north";
const BENCHMARK_SEED = "crownlands-core-v2-phase-b1-runtime-qa-v1";

const REGION_IDS = Object.freeze({
  "northwest-warband-camp": "core_b1_warband",
  "northwest-relic-camp": "core_b1_relic_north",
  "west-north-relic-camp": "core_b1_relic_transition",
  "northwest-holding-tower": "core_b1_tower",
  "aurum-keep": "core_b1_aurum",
  "west-support": "core_b1_locked_west_support",
  "crown-citadel": "core_b1_locked_citadel",
  "southwest-holding-tower": "core_b1_locked_southwest_tower",
});

const SIDE_META = Object.freeze({
  north: { dx: 0, dy: -1, opposite: "south", start: 0.472, end: 0.528, arrowXNorm: 0.5, arrowYNorm: 0.065 },
  east: { dx: 1, dy: 0, opposite: "west", start: 0.462, end: 0.538, arrowXNorm: 0.935, arrowYNorm: 0.5 },
  south: { dx: 0, dy: 1, opposite: "north", start: 0.472, end: 0.528, arrowXNorm: 0.5, arrowYNorm: 0.935 },
  west: { dx: -1, dy: 0, opposite: "east", start: 0.462, end: 0.538, arrowXNorm: 0.065, arrowYNorm: 0.5 },
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function coordinateKey(x, y) {
  return `${x},${y}`;
}

function availableConnections(prototype, byCoordinate) {
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => {
    const target = byCoordinate.get(coordinateKey(prototype.coordinate.gridX + meta.dx, prototype.coordinate.gridY + meta.dy));
    return [side, target?.regionId || ""];
  }));
}

function edgeConnections(prototype, byCoordinate) {
  const connections = availableConnections(prototype, byCoordinate);
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => {
    const target = connections[side];
    if (!target) return [side, []];
    return [side, [{
      id: `${side}_road`,
      side,
      start: meta.start,
      end: meta.end,
      type: "road",
      connectsToRegionId: target,
      arrowXNorm: meta.arrowXNorm,
      arrowYNorm: meta.arrowYNorm,
      intentionalOuter: false,
      notes: "Core v2 Phase B1 loopback-only package-available connection",
    }]];
  }));
}

function catalogConnections(prototype, byCoordinate) {
  const connections = availableConnections(prototype, byCoordinate);
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => [side, {
    side,
    oppositeSide: meta.opposite,
    state: connections[side] ? "open" : "gated",
    targetRegionId: connections[side] || "",
    fixturePackageAvailabilityOnly: true,
  }]));
}

function createStrongholds(prototype, regionId) {
  const objective = prototype.objective || {};
  const typeConfig = {
    crown_citadel: { name: "Crown Citadel", type: "crown", source: "crown_citadel", bonus: "all", bonusPercent: 25, level: 100, troops: 500000 },
    defense: { name: "Ironwatch", type: "defense", source: "defense_stronghold", bonus: "defense", bonusPercent: 20, level: 50, troops: 150000 },
    gold_production: { name: "Aurum Keep", type: "gold", source: "gold_stronghold", bonus: "gold", bonusPercent: 20, level: 50, troops: 150000 },
  }[objective.type];
  if (!typeConfig) return [];
  return [{
    id: `${regionId}_${typeConfig.type}_stronghold`,
    name: typeConfig.name,
    x: objective.x,
    y: objective.y,
    xNorm: Number((objective.x / 1448).toFixed(6)),
    yNorm: Number((objective.y / 1086).toFixed(6)),
    type: typeConfig.type,
    strongholdType: typeConfig.type,
    sourceStrongholdType: typeConfig.source,
    bonus: typeConfig.bonus,
    bonusPercent: typeConfig.bonusPercent,
    level: typeConfig.level,
    troops: typeConfig.troops,
    artSrc: prototype.profile.objectiveArt,
    size: objective.visualSize,
    prototypeOnly: true,
  }];
}

function createCamps(prototype, regionId) {
  const objective = prototype.objective || {};
  const campType = { warband: "troops", relic: "items", deed: "deed" }[objective.type];
  if (!campType) return [];
  return [{
    id: `${regionId}_${campType}_camp`,
    name: prototype.profile.objectiveLabel || `${campType} Camp`,
    campType,
    type: campType,
    x: objective.x,
    y: objective.y,
    xNorm: Number((objective.x / 1448).toFixed(6)),
    yNorm: Number((objective.y / 1086).toFixed(6)),
    size: objective.visualSize,
    artSrc: prototype.profile.objectiveArt,
    prototypeOnly: true,
  }];
}

function createCityDefinitions(prototype, regionId) {
  return readJson(path.join(ROOT_DIR, prototype.outputDirectory, "cities.json")).map((city, index) => ({
    id: `${regionId}_bench_${String(index + 1).padStart(3, "0")}`,
    sourceCityId: city.id,
    name: index % 11 === 0 ? `Royal ${prototype.name} ${index + 1}` : `${prototype.name} Hold ${index + 1}`,
    regionId,
    x: city.x,
    y: city.y,
    xNorm: Number(city.xNorm),
    yNorm: Number(city.yNorm),
    level: 1 + (index * 9) % 50,
    troops: 10,
    owner: "neutral",
    ownerKind: "neutral",
    startType: "neutral",
    prototypeOnly: true,
  }));
}

function createCitySnapshots(definitions, regionIndex) {
  return definitions.map((city, index) => {
    const playerOwned = index < Math.max(4, Math.floor(definitions.length * 0.18));
    const rivalOwned = !playerOwned && index % 3 !== 0;
    const ownerUid = playerOwned ? "benchmark-player" : rivalOwned ? `benchmark-rival-${(index + regionIndex) % 16}` : "";
    const troops = 1850 + ((index * 7919 + regionIndex * 2741) % 148000);
    return {
      id: city.id,
      sourceCityId: city.sourceCityId,
      ownerKind: ownerUid ? "player" : "neutral",
      ownerUid,
      ownerName: playerOwned ? "Runtime QA Ruler" : rivalOwned ? `Rival Banner ${(index + regionIndex) % 16 + 1}` : "",
      ownerFlag: ownerUid ? {
        field: index % 2 ? "#274b7a" : "#7a2f27",
        mark: index % 3 ? "#e8d7a2" : "#d4af37",
        markType: index % 2 ? "chevron" : "cross",
      } : null,
      level: city.level,
      troops,
      troopFloat: troops,
      investedGold: 25000 + index * 1500,
      isMainCity: regionIndex === 0 && index === 0,
      updatedAtMs: FIXED_EPOCH_MS,
    };
  });
}

function createCampSnapshots(camps, regionId) {
  return camps.map(camp => ({
    id: camp.id,
    regionId,
    campType: camp.campType,
    holderUid: "benchmark-rival-3",
    holderName: "Rival Banner 4",
    troops: 20000,
    updatedAtMs: FIXED_EPOCH_MS,
  }));
}

function loadPrototypes() {
  const b1 = readJson(path.join(PHASE_B1_DIR, "batch-index.json")).prototypes.map(prototype => ({ ...prototype, lockedNeighbor: false }));
  const neighborKeys = new Set(["west-support", "crown-citadel", "southwest-holding-tower"]);
  const locked = readJson(path.join(PHASE_A_DIR, "prototype-index.json")).prototypes
    .filter(prototype => neighborKeys.has(prototype.key))
    .map(prototype => ({ ...prototype, lockedNeighbor: true }));
  return [...b1, ...locked].map(prototype => ({ ...prototype, regionId: REGION_IDS[prototype.key] }));
}

function createFixture() {
  const prototypes = loadPrototypes();
  const byCoordinate = new Map(prototypes.map(prototype => [coordinateKey(prototype.coordinate.gridX, prototype.coordinate.gridY), prototype]));
  const releaseConfig = readJson(path.join(ROOT_DIR, "functions", "release-config.json"));
  const maps = [];
  const citiesByRegion = {};
  const campsByRegion = {};

  prototypes.forEach((prototype, regionIndex) => {
    const cities = createCityDefinitions(prototype, prototype.regionId);
    const camps = createCamps(prototype, prototype.regionId);
    const strongholds = createStrongholds(prototype, prototype.regionId);
    const map = {
      id: prototype.regionId,
      label: `${prototype.name} — Phase B1 Runtime QA`,
      type: "starter",
      purpose: prototype.mapType.toLowerCase(),
      gridX: prototype.coordinate.gridX,
      gridY: prototype.coordinate.gridY,
      imageWidth: 1448,
      imageHeight: 1086,
      imageSrc: `${prototype.outputDirectory}/map.webp`.replaceAll("\\", "/"),
      thumbnailSrc: `${prototype.outputDirectory}/thumbnail.webp`.replaceAll("\\", "/"),
      cityCapacity: prototype.exactCityCapacity,
      cities,
      camps,
      objectives: strongholds,
      edgeConnections: edgeConnections(prototype, byCoordinate),
    };
    maps.push(map);
    citiesByRegion[prototype.regionId] = createCitySnapshots(cities, regionIndex);
    campsByRegion[prototype.regionId] = createCampSnapshots(camps, prototype.regionId);
  });

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
      lockedNeighbor: prototype.lockedNeighbor,
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
    benchmarkSeed: BENCHMARK_SEED,
    fixedEpochMs: FIXED_EPOCH_MS,
    scenario: { id: "CORE_B1", slug: "west-northwest-runtime-density", label: "Core v2 Phase B1", cityCount: 60, marchCount: 14 },
    primaryRegionId: PRIMARY_REGION_ID,
    neighborRegionId: NEIGHBOR_REGION_ID,
    player: { uid: "benchmark-player", email: "core-b1.invalid@local.test", displayName: "Runtime QA Ruler" },
    releaseConfig,
    mapData: { maps },
    regionCatalog: {
      schemaVersion: 3,
      worldId: "core_v2_phase_b1_development_only",
      worldName: "Core v2 Phase B1 Runtime QA",
      updatedAt: "2041-01-01T12:00:00.000Z",
      version: 1,
      globalSettings: { defaultMapWidth: 1448, defaultMapHeight: 1086, minimumCitySpacing: 0, worldWidth: 13000, worldHeight: 17000, gridCellWorldSize: 2300 },
      topology: { coreRadius: 2, coreWidth: 5, ringAnchor: "north-west", ringDirection: "clockwise", connections: "cardinal-only" },
      coreReservations: [],
      capacityPolicy: { minimumNpcCitiesForSpawn: 15, serverAuthoritative: true },
      definitionCache: { maxRegions: 8, loadPolicy: "active-first-nearby-on-demand" },
      bounds: { minGridX: -2, maxGridX: 0, minGridY: -2, maxGridY: 1, width: 3, height: 4 },
      regions,
    },
    prototypes: prototypes.map(prototype => ({
      key: prototype.key,
      sourceRegionId: prototype.sourceRegionId || prototype.regionId,
      regionId: prototype.regionId,
      name: prototype.name,
      mapType: prototype.mapType,
      exactCityCapacity: prototype.exactCityCapacity,
      objective: prototype.objective,
      profile: prototype.profile,
      outputDirectory: prototype.outputDirectory,
      lockedNeighbor: prototype.lockedNeighbor,
    })),
    citiesByRegion,
    campsByRegion,
  };
}

module.exports = { BENCHMARK_SEED, FIXED_EPOCH_MS, NEIGHBOR_REGION_ID, PRIMARY_REGION_ID, REGION_IDS, createFixture };
