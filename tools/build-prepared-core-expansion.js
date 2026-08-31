#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const topology = require("../functions/coreExpansionTopology.js");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(process.argv[2] || process.env.CROWNLANDS_MAP_SCALING_ROOT || "");
if (!process.argv[2] && !process.env.CROWNLANDS_MAP_SCALING_ROOT) {
  throw new Error("Pass the validated map-scaling worktree path or set CROWNLANDS_MAP_SCALING_ROOT.");
}
const coreSource = path.join(sourceRoot, "benchmark-results", "map", "core-v2-qa-1", "staging-site", "__core_b1__");
const outerSource = path.join(sourceRoot, "benchmark-results", "map", "phase-6f", "study");
const destination = path.join(root, "assets", "worlds", topology.TOPOLOGY_VERSION);
const manifestPath = path.join(outerSource, "compact-manifest.jsonl");
for (const required of [coreSource, manifestPath]) {
  if (!fs.existsSync(required)) throw new Error(`Validated source is missing: ${required}`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function hash(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(stable(value)));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function cleanDevelopmentFields(value) {
  if (Array.isArray(value)) return value.map(cleanDevelopmentFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => ![
      "developmentOnly", "fixturePackageAvailabilityOnly", "productionActivated",
      "publicationAllowed", "activationAllowed",
    ].includes(key))
    .map(([key, entry]) => [key, cleanDevelopmentFields(entry)]));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyAsset(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return { bytes: fs.statSync(target).size, sha256: hash(fs.readFileSync(target)) };
}

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(coreSource, "region-catalog.js"), "utf8"), sandbox);
const stagedCoreCatalog = sandbox.window.CROWNLANDS_REGION_CATALOG;
if (!stagedCoreCatalog || stagedCoreCatalog.regions?.length !== topology.CORE_MAP_COUNT) {
  throw new Error("The validated Core catalog must contain exactly 25 maps.");
}

const outerRecords = fs.readFileSync(manifestPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .slice(0, topology.getLayerMapCount(1) + topology.getLayerMapCount(2))
  .map(line => JSON.parse(line));
if (outerRecords.length !== 56 || outerRecords.some(record => record.cityPositions?.length !== 40)) {
  throw new Error("The prepared New Lands buffer must contain Layer 1 and Layer 2 with 40 cities per map.");
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
const assetReceipt = {};
const regionDefinitions = new Map();
const regionSummaries = [];
const maps = [];

function compatibilityRegion(summary) {
  const cell = 2300;
  const offset = 5;
  return {
    id: summary.id,
    label: summary.name,
    gridX: summary.gridX,
    gridY: summary.gridY,
    x: (summary.gridX + offset) * cell,
    y: (summary.gridY + offset) * cell,
    rx: 1058,
    ry: 828,
    cityRx: 868,
    cityRy: 629,
    rot: 0,
    palette: summary.worldLayer === 0 ? "heartland" : "frontier",
  };
}

for (const summarySource of stagedCoreCatalog.regions) {
  const sourceDefinition = JSON.parse(fs.readFileSync(path.join(coreSource, "regions", `${summarySource.id}.json`), "utf8"));
  const definition = cleanDevelopmentFields({
    ...sourceDefinition,
    name: String(sourceDefinition.name || summarySource.name).replace(/\s+—\s+Core v2 QA-1$/, ""),
    imagePath: `assets/worlds/${topology.TOPOLOGY_VERSION}/maps/${summarySource.id}.webp`,
    thumbnailPath: `assets/worlds/${topology.TOPOLOGY_VERSION}/maps/${summarySource.id}.webp`,
  });
  const sourceMap = path.join(coreSource, "maps", path.basename(summarySource.mapAsset));
  assetReceipt[definition.imagePath] = copyAsset(sourceMap, path.join(root, definition.imagePath));
  regionDefinitions.set(definition.id, definition);
  const sourcePurpose = String(summarySource.purpose || "core_support").toLowerCase();
  const corePurpose = sourcePurpose === "crown_citadel"
    ? "core_citadel"
    : sourcePurpose === "stronghold" || sourcePurpose === "holding_tower"
      ? "core_stronghold"
      : sourcePurpose.endsWith("_camp")
        ? "core_camp"
        : "core_support";
  regionSummaries.push({
    id: definition.id,
    name: definition.name,
    type: "core",
    purpose: corePurpose,
    objectivePurpose: sourcePurpose,
    permanentCore: true,
    spawnEligible: false,
    spawnReady: false,
    lifecycle: "active",
    worldLayer: 0,
    clockwiseOrderIndex: null,
    gridX: definition.gridX,
    gridY: definition.gridY,
    width: definition.width,
    height: definition.height,
    mapAsset: definition.imagePath,
    thumbnailAsset: definition.thumbnailPath,
    regionDefinitionPath: `assets/worlds/${topology.TOPOLOGY_VERSION}/regions/${definition.id}.json`,
    cityCapacity: definition.cities.length,
    npcCityCount: definition.cities.length,
    objectiveCount: definition.strongholds?.length || 0,
    campCount: definition.camps?.length || 0,
    compatibilityRegion: null,
    connections: {},
  });
}

outerRecords.forEach((record, activationOrdinal) => {
  const allocation = topology.getRegionAtActivationOrdinal(activationOrdinal);
  if (allocation.gridX !== record.coordinate.gridX || allocation.gridY !== record.coordinate.gridY) {
    throw new Error(`Outer record ${activationOrdinal + 1} does not match the approved north-clockwise allocation.`);
  }
  const id = allocation.id;
  const mapAsset = `assets/worlds/${topology.TOPOLOGY_VERSION}/maps/${id}.webp`;
  const thumbnailAsset = `assets/worlds/${topology.TOPOLOGY_VERSION}/thumbnails/${id}.webp`;
  assetReceipt[mapAsset] = copyAsset(path.join(outerSource, record.raster.mapPath), path.join(root, mapAsset));
  assetReceipt[thumbnailAsset] = copyAsset(path.join(outerSource, record.raster.thumbnailPath), path.join(root, thumbnailAsset));
  const cities = record.cityPositions.map((city, index) => ({
    id: `${id}-city-${String(index + 1).padStart(2, "0")}`,
    name: `Frontier Hold ${index + 1}`,
    regionId: id,
    x: city.x,
    y: city.y,
    xNorm: Number((city.x / record.raster.dimensions.width).toFixed(6)),
    yNorm: Number((city.y / record.raster.dimensions.height).toFixed(6)),
    level: 1,
    troops: 10,
    owner: "neutral",
    ownerKind: "neutral",
    startType: "neutral",
  }));
  const definition = {
    id,
    name: `New Lands ${activationOrdinal + 1}`,
    type: "starter",
    gridX: allocation.gridX,
    gridY: allocation.gridY,
    width: record.raster.dimensions.width,
    height: record.raster.dimensions.height,
    imagePath: mapAsset,
    thumbnailPath: thumbnailAsset,
    cityCapacity: 40,
    cities,
    strongholds: [],
    camps: [],
    edgeConnections: {},
  };
  regionDefinitions.set(id, definition);
  regionSummaries.push({
    id,
    name: definition.name,
    type: "starter",
    purpose: "player_region",
    permanentCore: false,
    spawnEligible: activationOrdinal === 0,
    spawnReady: activationOrdinal === 0,
    lifecycle: allocation.worldLayer === 1 ? "active" : "standby",
    worldLayer: allocation.worldLayer,
    clockwiseOrderIndex: allocation.clockwiseOrderIndex,
    activationOrdinal,
    gridX: allocation.gridX,
    gridY: allocation.gridY,
    width: definition.width,
    height: definition.height,
    mapAsset,
    thumbnailAsset,
    regionDefinitionPath: `assets/worlds/${topology.TOPOLOGY_VERSION}/regions/${id}.json`,
    cityCapacity: 40,
    npcCityCount: 40,
    objectiveCount: 0,
    campCount: 0,
    compatibilityRegion: null,
    connections: {},
  });
});

const byCoordinate = new Map(regionSummaries.map(region => [`${region.gridX},${region.gridY}`, region]));
const directions = {
  north: { dx: 0, dy: -1, oppositeSide: "south" },
  east: { dx: 1, dy: 0, oppositeSide: "west" },
  south: { dx: 0, dy: 1, oppositeSide: "north" },
  west: { dx: -1, dy: 0, oppositeSide: "east" },
};
for (const summary of regionSummaries) {
  summary.compatibilityRegion = compatibilityRegion(summary);
  const definition = regionDefinitions.get(summary.id);
  for (const [side, direction] of Object.entries(directions)) {
    const neighbor = byCoordinate.get(`${summary.gridX + direction.dx},${summary.gridY + direction.dy}`);
    summary.connections[side] = {
      side,
      oppositeSide: direction.oppositeSide,
      state: neighbor ? "open" : "gated",
      targetRegionId: neighbor?.id || "",
    };
    definition.edgeConnections[side] = neighbor ? [{
      id: `${side}_road`,
      side,
      start: side === "north" || side === "south" ? 0.472 : 0.462,
      end: side === "north" || side === "south" ? 0.528 : 0.538,
      type: "road",
      connectsToRegionId: neighbor.id,
      arrowXNorm: side === "west" ? 0.065 : side === "east" ? 0.935 : 0.5,
      arrowYNorm: side === "north" ? 0.065 : side === "south" ? 0.935 : 0.5,
      intentionalOuter: false,
      notes: "Core expansion cardinal connection",
    }] : [];
  }
  writeJson(path.join(destination, "regions", `${summary.id}.json`), definition);
  maps.push({
    id: summary.id,
    label: summary.name,
    gridX: summary.gridX,
    gridY: summary.gridY,
    type: summary.type,
    purpose: summary.purpose,
    permanentCore: summary.permanentCore,
    lifecycle: summary.lifecycle,
    newPlayerSpawnEligible: summary.purpose === "player_region",
    cityCapacity: summary.cityCapacity,
    imageSrc: summary.mapAsset,
    thumbnailSrc: summary.thumbnailAsset,
    imageWidth: summary.width,
    imageHeight: summary.height,
    regionDefinitionPath: summary.regionDefinitionPath,
    region: summary.compatibilityRegion,
    cities: definition.cities,
    objectives: (definition.strongholds || []).map(stronghold => ({
      ...stronghold,
      sourceStrongholdType: stronghold.sourceStrongholdType || stronghold.strongholdType,
      bonus: stronghold.bonus || stronghold.bonusType,
      bonusPercent: stronghold.bonusPercent ?? stronghold.bonusAmount,
    })),
    camps: definition.camps || [],
    edgeConnections: definition.edgeConnections,
  });
}

const catalog = {
  schemaVersion: 4,
  worldId: "core-expansion-reset",
  worldName: "Crownlands Core and New Lands",
  version: 2026083101,
  topologyVersion: topology.TOPOLOGY_VERSION,
  globalSettings: {
    defaultMapWidth: 1448,
    defaultMapHeight: 1086,
    minimumCitySpacing: 68,
    worldWidth: 23000,
    worldHeight: 23000,
    gridCellWorldSize: 2300,
  },
  topology: {
    coreRadius: 2,
    coreWidth: 5,
    firstLayerMapCount: 24,
    ringAnchor: "north-west",
    ringDirection: "clockwise",
    connections: "cardinal-only",
    activationBatchSize: 2,
  },
  coreReservations: regionSummaries
    .filter(region => region.permanentCore)
    .map(region => ({
      gridX: region.gridX,
      gridY: region.gridY,
      reserved: true,
      activeRegionId: region.id,
      lifecycle: "active",
      spawnEligible: false,
      reservedPurpose: region.purpose,
    })),
  capacityPolicy: {
    cityCapacityPerNewLandsMap: 40,
    minimumNpcCitiesForSpawn: 20,
    activationBatchSize: 2,
    serverAuthoritative: true,
    coreSpawnEligible: false,
  },
  definitionCache: { maxRegions: 8, loadPolicy: "active-first-nearby-on-demand" },
  bounds: {
    minGridX: Math.min(...regionSummaries.map(region => region.gridX)),
    maxGridX: Math.max(...regionSummaries.map(region => region.gridX)),
    minGridY: Math.min(...regionSummaries.map(region => region.gridY)),
    maxGridY: Math.max(...regionSummaries.map(region => region.gridY)),
    width: Math.max(...regionSummaries.map(region => region.gridX)) - Math.min(...regionSummaries.map(region => region.gridX)) + 1,
    height: Math.max(...regionSummaries.map(region => region.gridY)) - Math.min(...regionSummaries.map(region => region.gridY)) + 1,
  },
  regions: regionSummaries,
};
const worldLayout = {
  schemaVersion: 2,
  version: 2026083101,
  topologyVersion: topology.TOPOLOGY_VERSION,
  worldId: "core-expansion-reset",
  mapCount: maps.length,
  coreMapCount: 25,
  firstLayerMapCount: 24,
  preparedOuterLayerCount: 2,
  maps,
};
writeJson(path.join(destination, "region-catalog.json"), catalog);
fs.writeFileSync(
  path.join(destination, "region-catalog.js"),
  `window.CROWNLANDS_REGION_CATALOG = Object.freeze(${JSON.stringify(catalog)});\n`,
  "utf8",
);
writeJson(path.join(root, "functions", "core-expansion-region-catalog.json"), catalog);
writeJson(path.join(root, "functions", "core-expansion-world-layout.json"), worldLayout);
const receipt = {
  schemaVersion: 1,
  topologyVersion: topology.TOPOLOGY_VERSION,
  coreMapCount: 25,
  coreCityCount: maps.filter(map => map.permanentCore).reduce((sum, map) => sum + map.cities.length, 0),
  newLandsMapCount: outerRecords.length,
  firstLayerMapCount: 24,
  preparedSecondLayerMapCount: 32,
  newLandsCityCount: outerRecords.length * 40,
  objectiveCount: maps.reduce((sum, map) => sum + map.objectives.length + map.camps.length, 0),
  catalogHash: hash(catalog),
  worldLayoutHash: hash(worldLayout),
  assets: assetReceipt,
};
writeJson(path.join(destination, "build-receipt.json"), receipt);
console.log(JSON.stringify(receipt, null, 2));
