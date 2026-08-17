"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = 1;
const PACKAGE_VERSION = "core-v2-phase-a-spec-v1";
const MAP_WIDTH = 1448;
const MAP_HEIGHT = 1086;
const CORE_RADIUS = 2;
const CORE_CITY_TOTAL = 1480;
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const DELTAS = Object.freeze({
  north: Object.freeze({ x: 0, y: -1, opposite: "south" }),
  east: Object.freeze({ x: 1, y: 0, opposite: "west" }),
  south: Object.freeze({ x: 0, y: 1, opposite: "north" }),
  west: Object.freeze({ x: -1, y: 0, opposite: "east" }),
});
const ROAD_SOCKETS = Object.freeze({
  north: Object.freeze({ x: 724, y: 0, tangentOffset: 0.5 }),
  east: Object.freeze({ x: 1448, y: 543, tangentOffset: 0.5 }),
  south: Object.freeze({ x: 724, y: 1086, tangentOffset: 0.5 }),
  west: Object.freeze({ x: 0, y: 543, tangentOffset: 0.5 }),
});

const CAPACITY_BY_TYPE = Object.freeze({
  SUPPORT: 70,
  DEED_CAMP: 60,
  RELIC_CAMP: 55,
  WARBAND_CAMP: 55,
  GOLD_CAMP: 55,
  HOLDING_TOWER: 55,
  STRONGHOLD: 60,
  CROWN_CITADEL: 60,
});

const RAW_GRID = Object.freeze([
  Object.freeze([
    [-2, -2, "Warband Camp", "WARBAND_CAMP", "warband"],
    [-1, -2, "Relic Camp North-West", "RELIC_CAMP", "relic"],
    [0, -2, "North Support", "SUPPORT", "none"],
    [1, -2, "Deed Camp North-East", "DEED_CAMP", "deed"],
    [2, -2, "Gold Camp North-East", "GOLD_CAMP", "gold"],
  ]),
  Object.freeze([
    [-2, -1, "Relic Camp West-North", "RELIC_CAMP", "relic"],
    [-1, -1, "North-West Holding Tower", "HOLDING_TOWER", "holding_tower"],
    [0, -1, "Greybanner Hold", "STRONGHOLD", "training"],
    [1, -1, "North-East Holding Tower", "HOLDING_TOWER", "holding_tower"],
    [2, -1, "Deed Camp East-North", "DEED_CAMP", "deed"],
  ]),
  Object.freeze([
    [-2, 0, "West Support", "SUPPORT", "none"],
    [-1, 0, "Aurum Keep", "STRONGHOLD", "gold_production"],
    [0, 0, "Crown Citadel", "CROWN_CITADEL", "crown_citadel"],
    [1, 0, "Swiftgate", "STRONGHOLD", "march_speed"],
    [2, 0, "East Support", "SUPPORT", "none"],
  ]),
  Object.freeze([
    [-2, 1, "Deed Camp West-South", "DEED_CAMP", "deed"],
    [-1, 1, "South-West Holding Tower", "HOLDING_TOWER", "holding_tower"],
    [0, 1, "Ironwatch", "STRONGHOLD", "defense"],
    [1, 1, "South-East Holding Tower", "HOLDING_TOWER", "holding_tower"],
    [2, 1, "Relic Camp East-South", "RELIC_CAMP", "relic"],
  ]),
  Object.freeze([
    [-2, 2, "Gold Camp South-West", "GOLD_CAMP", "gold"],
    [-1, 2, "Deed Camp South-West", "DEED_CAMP", "deed"],
    [0, 2, "South Support", "SUPPORT", "none"],
    [1, 2, "Relic Camp South-East", "RELIC_CAMP", "relic"],
    [2, 2, "Warband Camp South-East", "WARBAND_CAMP", "warband"],
  ]),
]);

const TOWER_COORDINATES = Object.freeze([
  Object.freeze({ gridX: -1, gridY: -1 }),
  Object.freeze({ gridX: 1, gridY: -1 }),
  Object.freeze({ gridX: -1, gridY: 1 }),
  Object.freeze({ gridX: 1, gridY: 1 }),
]);

const SLICE_COORDINATES = Object.freeze([
  Object.freeze({ gridX: 0, gridY: 0 }),
  Object.freeze({ gridX: 0, gridY: 1 }),
  Object.freeze({ gridX: -1, gridY: 1 }),
  Object.freeze({ gridX: -2, gridY: 1 }),
  Object.freeze({ gridX: -2, gridY: 0 }),
]);

function coordinateKey(gridX, gridY) {
  return `${gridX},${gridY}`;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function climateFor(gridX, gridY) {
  if (gridX === 0 && gridY === 0) return { id: "center_balanced", renderTheme: "west", transition: "balanced central Crownlands" };
  if (gridY === -2) return { id: "north_light_winter", renderTheme: "north", transition: gridX === 0 ? "north" : "north edge blend" };
  if (gridY === 2) return { id: "south_dry_frontier", renderTheme: "south", transition: gridX === 0 ? "south" : "south edge blend" };
  if (gridX === -2) return { id: gridY > 0 ? "west_south_transition" : gridY < 0 ? "west_north_transition" : "west_grassy_temperate", renderTheme: "west", transition: "west grassy" };
  if (gridX === 2) return { id: gridY > 0 ? "east_south_transition" : gridY < 0 ? "east_north_transition" : "east_tropical_lush", renderTheme: "east", transition: "east lush" };
  if (gridY < 0) return { id: "north_center_transition", renderTheme: "north", transition: "north to center" };
  if (gridY > 0) return { id: gridX < 0 ? "south_west_transition" : gridX > 0 ? "south_east_transition" : "south_center_transition", renderTheme: "south", transition: "center to south" };
  if (gridX < 0) return { id: "west_center_transition", renderTheme: "west", transition: "west to center" };
  return { id: "east_center_transition", renderTheme: "east", transition: "center to east" };
}

function objectiveGeometry(objectiveType) {
  const shared = { x: 724, y: 543 };
  if (objectiveType === "none") return null;
  if (objectiveType === "crown_citadel") return { ...shared, radiusX: 184, radiusY: 166, visualSize: 260, influenceClearance: 24 };
  if (["training", "gold_production", "march_speed", "defense"].includes(objectiveType)) {
    return { ...shared, radiusX: 132, radiusY: 122, visualSize: 154, influenceClearance: 28 };
  }
  if (objectiveType === "holding_tower") return { ...shared, radiusX: 142, radiusY: 126, visualSize: 0, influenceClearance: 30, reservationOnly: true };
  return { ...shared, radiusX: 112, radiusY: 104, visualSize: 132, influenceClearance: 24 };
}

function buildTopology(records) {
  const byCoordinate = new Map(records.map(record => [coordinateKey(record.coordinate.gridX, record.coordinate.gridY), record]));
  return records.map(record => {
    const connections = {};
    for (const side of SIDES) {
      const delta = DELTAS[side];
      const neighbor = byCoordinate.get(coordinateKey(record.coordinate.gridX + delta.x, record.coordinate.gridY + delta.y));
      connections[side] = neighbor
        ? { state: "OPEN", regionId: neighbor.regionId, reciprocalSide: delta.opposite, runtimeStateOutsideArtwork: true }
        : { state: "GATED", regionId: null, reciprocalSide: delta.opposite, runtimeStateOutsideArtwork: true, futureOuterNeighbor: true };
    }
    return { ...record, topology: { cardinalOnly: true, connections, roadSockets: ROAD_SOCKETS } };
  });
}

function buildCoreSpecification() {
  const baseRecords = RAW_GRID.flat().map(([gridX, gridY, name, mapType, objectiveType]) => {
    const regionId = `core-v2-${slug(name)}-${gridX < 0 ? `m${Math.abs(gridX)}` : `p${gridX}`}-${gridY < 0 ? `m${Math.abs(gridY)}` : `p${gridY}`}`;
    const objective = objectiveGeometry(objectiveType);
    return {
      schemaVersion: SCHEMA_VERSION,
      packageVersion: PACKAGE_VERSION,
      regionId,
      name,
      coordinate: { gridX, gridY, worldLayer: 0 },
      mapType,
      exactCityCapacity: CAPACITY_BY_TYPE[mapType],
      climate: climateFor(gridX, gridY),
      objective: objective ? { type: objectiveType, ...objective } : { type: "none" },
      purpose: "permanent_core",
      permanentCore: true,
      spawnEligible: false,
      runtimeNpcSpawnThresholdApplies: false,
      dimensions: { width: MAP_WIDTH, height: MAP_HEIGHT },
      futureMapAssetReference: `core-v2/maps/${regionId}/map.webp`,
      futureThumbnailAssetReference: `core-v2/maps/${regionId}/thumbnail.webp`,
      blockerDefinitionReference: `core-v2/definitions/${regionId}/blockers.json`,
      cityDefinitionReference: `core-v2/definitions/${regionId}/cities.json`,
      developmentOnly: true,
      productionActivated: false,
      publicationAllowed: false,
    };
  });
  const regions = buildTopology(baseRecords);
  return {
    schemaVersion: SCHEMA_VERSION,
    packageVersion: PACKAGE_VERSION,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    immutableWhenApproved: true,
    coreBounds: { minGridX: -2, maxGridX: 2, minGridY: -2, maxGridY: 2 },
    dimensions: { width: MAP_WIDTH, height: MAP_HEIGHT },
    exactRegionCount: 25,
    exactCityCapacity: CORE_CITY_TOTAL,
    regions,
  };
}

function buildLayerOneFortressArchitecture() {
  const ring = [];
  for (let x = -3; x <= 3; x += 1) ring.push({ gridX: x, gridY: -3 });
  for (let y = -2; y <= 3; y += 1) ring.push({ gridX: 3, gridY: y });
  for (let x = 2; x >= -3; x -= 1) ring.push({ gridX: x, gridY: 3 });
  for (let y = 2; y >= -2; y -= 1) ring.push({ gridX: -3, gridY: y });
  const reservedSlots = new Set([2, 8, 14, 20]);
  const reservations = ring.map((coordinate, clockwiseSlot) => ({ coordinate, clockwiseSlot }))
    .filter(item => reservedSlots.has(item.clockwiseSlot))
    .map((item, index) => ({
      reservationId: `layer-1-fortress-${index + 1}`,
      type: "FORTRESS",
      worldLayer: 1,
      clockwiseSlot: item.clockwiseSlot,
      coordinate: item.coordinate,
      reservationGeometry: {
        x: [520, 908, 860, 560][index],
        y: [410, 420, 690, 680][index],
        radiusX: 126,
        radiusY: 112,
      },
      invisibleInLiveGameplay: true,
      developmentOverlayAllowed: true,
      immutableOncePublished: true,
      requiresPrePublicationValidation: [
        "40-city-clearance",
        "road-clearance",
        "blocker-clearance",
        "transition-clearance",
        "edge-clearance",
        "objective-clearance",
      ],
    }));
  return {
    schemaVersion: 1,
    developmentOnly: true,
    gameplayImplemented: false,
    reservationType: "FORTRESS",
    layerOneMapCount: ring.length,
    layerOneReservationCount: reservations.length,
    targetDensity: "approximately one Fortress reservation per 6-7 generated maps",
    antiStacking: {
      cardinalAdjacencyForbidden: true,
      sameClockwiseSectorOnNextLayerForbidden: true,
      nextLayerSlotOffsetStrategy: "deterministic non-zero offset derived from world/season/layer; reject radial alignment with prior layer",
      publishedReservationsImmutable: true,
    },
    ring,
    reservations,
  };
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

module.exports = Object.freeze({
  SCHEMA_VERSION,
  PACKAGE_VERSION,
  MAP_WIDTH,
  MAP_HEIGHT,
  CORE_RADIUS,
  CORE_CITY_TOTAL,
  SIDES,
  DELTAS,
  ROAD_SOCKETS,
  CAPACITY_BY_TYPE,
  RAW_GRID,
  TOWER_COORDINATES,
  SLICE_COORDINATES,
  coordinateKey,
  climateFor,
  buildCoreSpecification,
  buildLayerOneFortressArchitecture,
  hashObject,
});
