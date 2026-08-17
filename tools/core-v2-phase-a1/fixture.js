"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const PHASE_A_DIR = path.join(ROOT_DIR, "benchmark-results", "map", "core-v2-phase-a");
const FIXED_EPOCH_MS = Date.UTC(2040, 0, 1, 12, 0, 0);
const PRIMARY_REGION_ID = "core_a1_citadel";
const NEIGHBOR_REGION_ID = "core_a1_ironwatch";
const BENCHMARK_SEED = "crownlands-core-v2-phase-a1-runtime-qa-v1";

const REGION_IDS = Object.freeze({
  "crown-citadel": "core_a1_citadel",
  ironwatch: "core_a1_ironwatch",
  "southwest-holding-tower": "core_a1_tower",
  "west-south-deed-camp": "core_a1_deed",
  "west-support": "core_a1_support",
});

const SLICE_CONNECTIONS = Object.freeze({
  core_a1_citadel: { south: "core_a1_ironwatch" },
  core_a1_ironwatch: { north: "core_a1_citadel", west: "core_a1_tower" },
  core_a1_tower: { east: "core_a1_ironwatch", west: "core_a1_deed" },
  core_a1_deed: { east: "core_a1_tower", north: "core_a1_support" },
  core_a1_support: { south: "core_a1_deed" },
});

const GRID = Object.freeze({
  core_a1_citadel: { x: 0, y: 0 },
  core_a1_ironwatch: { x: 0, y: 1 },
  core_a1_tower: { x: -1, y: 1 },
  core_a1_deed: { x: -2, y: 1 },
  core_a1_support: { x: -2, y: 0 },
});

const SIDE_META = Object.freeze({
  north: { opposite: "south", start: 0.472, end: 0.528, arrowXNorm: 0.5, arrowYNorm: 0.065 },
  east: { opposite: "west", start: 0.462, end: 0.538, arrowXNorm: 0.935, arrowYNorm: 0.5 },
  south: { opposite: "north", start: 0.472, end: 0.528, arrowXNorm: 0.5, arrowYNorm: 0.935 },
  west: { opposite: "east", start: 0.462, end: 0.538, arrowXNorm: 0.065, arrowYNorm: 0.5 },
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function edgeConnections(regionId) {
  const connections = SLICE_CONNECTIONS[regionId] || {};
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => {
    const target = connections[side] || "";
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
      notes: "Core v2 Phase A.1 development-only runtime QA connection",
    }]];
  }));
}

function catalogConnections(regionId) {
  const connections = SLICE_CONNECTIONS[regionId] || {};
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => [side, {
    side,
    oppositeSide: meta.opposite,
    state: connections[side] ? "open" : "gated",
    targetRegionId: connections[side] || "",
  }]));
}

function createStronghold(prototype, regionId) {
  const objective = prototype.objective || {};
  if (!["crown_citadel", "defense"].includes(objective.type)) return [];
  const crown = objective.type === "crown_citadel";
  return [{
    id: `${regionId}_${crown ? "crown_citadel" : "ironwatch"}`,
    name: crown ? "Crown Citadel" : "Ironwatch",
    x: objective.x,
    y: objective.y,
    xNorm: Number((objective.x / 1448).toFixed(6)),
    yNorm: Number((objective.y / 1086).toFixed(6)),
    type: crown ? "crown" : "defense",
    strongholdType: crown ? "crown" : "defense",
    sourceStrongholdType: crown ? "crown_citadel" : "defense_stronghold",
    bonus: crown ? "all" : "defense",
    bonusPercent: crown ? 25 : 20,
    level: crown ? 100 : 50,
    troops: crown ? 500000 : 150000,
    artSrc: prototype.profile.objectiveArt,
    size: objective.visualSize,
    prototypeOnly: true,
  }];
}

function createCamps(prototype, regionId) {
  const objective = prototype.objective || {};
  if (objective.type !== "deed") return [];
  return [{
    id: `${regionId}_deed_camp`,
    name: "Deed Camp",
    campType: "deed",
    type: "deed",
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
  const sourcePath = path.join(ROOT_DIR, prototype.outputDirectory, "cities.json");
  return readJson(sourcePath).map((city, index) => ({
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
    const ownerName = playerOwned ? "Runtime QA Ruler" : rivalOwned ? `Rival Banner ${(index + regionIndex) % 16 + 1}` : "";
    const troops = 1850 + ((index * 7919 + regionIndex * 2741) % 148000);
    return {
      id: city.id,
      sourceCityId: city.sourceCityId,
      ownerKind: ownerUid ? "player" : "neutral",
      ownerUid,
      ownerName,
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

function createFixture() {
  const index = readJson(path.join(PHASE_A_DIR, "prototype-index.json"));
  const releaseConfig = readJson(path.join(ROOT_DIR, "functions", "release-config.json"));
  const maps = [];
  const citiesByRegion = {};
  const campsByRegion = {};
  const prototypes = [];

  index.prototypes.forEach((prototype, regionIndex) => {
    const regionId = REGION_IDS[prototype.key];
    const grid = GRID[regionId];
    const cities = createCityDefinitions(prototype, regionId);
    const camps = createCamps(prototype, regionId);
    const strongholds = createStronghold(prototype, regionId);
    const imagePath = `${prototype.outputDirectory}/map.webp`.replaceAll("\\", "/");
    const thumbnailPath = `${prototype.outputDirectory}/thumbnail.webp`.replaceAll("\\", "/");
    const map = {
      id: regionId,
      label: `${prototype.name} — Phase A.1 Runtime QA`,
      // The production renderer chooses its initial region from the first
      // `starter` entry. This is fixture-only routing metadata; every entry
      // remains permanent-Core and spawn-ineligible below.
      type: "starter",
      purpose: prototype.mapType.toLowerCase(),
      gridX: grid.x,
      gridY: grid.y,
      imageWidth: 1448,
      imageHeight: 1086,
      imageSrc: imagePath,
      thumbnailSrc: thumbnailPath,
      cityCapacity: prototype.exactCityCapacity,
      cities,
      camps,
      objectives: strongholds,
      edgeConnections: edgeConnections(regionId),
    };
    maps.push(map);
    citiesByRegion[regionId] = createCitySnapshots(cities, regionIndex);
    campsByRegion[regionId] = createCampSnapshots(camps, regionId);
    prototypes.push({
      key: prototype.key,
      sourceRegionId: prototype.regionId,
      regionId,
      name: prototype.name,
      mapType: prototype.mapType,
      exactCityCapacity: prototype.exactCityCapacity,
      objective: prototype.objective,
      outputDirectory: prototype.outputDirectory,
    });
  });

  const regions = maps.map(map => ({
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
    regionDefinitionPath: `/__core_a1__/regions/${map.id}.json`,
    cityCapacity: map.cityCapacity,
    npcCityCount: map.cities.length,
    objectiveCount: map.objectives.length,
    campCount: map.camps.length,
    reservations: [],
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
    connections: catalogConnections(map.id),
  }));

  return {
    schemaVersion: 1,
    developmentOnly: true,
    productionActivated: false,
    benchmarkSeed: BENCHMARK_SEED,
    fixedEpochMs: FIXED_EPOCH_MS,
    scenario: { id: "CORE_A1", slug: "runtime-density", label: "Core v2 Phase A.1", cityCount: 70, marchCount: 14 },
    primaryRegionId: PRIMARY_REGION_ID,
    neighborRegionId: NEIGHBOR_REGION_ID,
    player: {
      uid: "benchmark-player",
      email: "core-a1.invalid@local.test",
      displayName: "Runtime QA Ruler",
    },
    releaseConfig,
    mapData: { maps },
    regionCatalog: {
      schemaVersion: 3,
      worldId: "core_v2_phase_a1_development_only",
      worldName: "Core v2 Phase A.1 Runtime QA",
      updatedAt: "2040-01-01T12:00:00.000Z",
      version: 1,
      globalSettings: {
        defaultMapWidth: 1448,
        defaultMapHeight: 1086,
        minimumCitySpacing: 0,
        worldWidth: 13000,
        worldHeight: 17000,
        gridCellWorldSize: 2300,
      },
      topology: { coreRadius: 2, coreWidth: 5, ringAnchor: "north-west", ringDirection: "clockwise", connections: "cardinal-only" },
      coreReservations: [],
      capacityPolicy: { minimumNpcCitiesForSpawn: 15, serverAuthoritative: true },
      definitionCache: { maxRegions: 4, loadPolicy: "active-first-nearby-on-demand" },
      bounds: { minGridX: -2, maxGridX: 0, minGridY: 0, maxGridY: 1, width: 3, height: 2 },
      regions,
    },
    prototypes,
    citiesByRegion,
    campsByRegion,
  };
}

module.exports = {
  BENCHMARK_SEED,
  FIXED_EPOCH_MS,
  NEIGHBOR_REGION_ID,
  PRIMARY_REGION_ID,
  REGION_IDS,
  createFixture,
};
