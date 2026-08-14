"use strict";

const crypto = require("node:crypto");
const {
  CORE_RADIUS,
  MINIMUM_SPAWN_NPC_CITIES,
  DIRECTIONS,
  buildCardinalConnections,
  coordinateKey,
  getClockwiseRingCoordinates,
  getClockwiseRingIndex,
  getWorldLayer,
  isRingComplete,
} = require("../../region-catalog");

const GENERATOR_VERSION = "phase4-prototype-v1";
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const DEFAULT_GENERATOR_CONFIG = Object.freeze({
  minimumNpcCities: Math.max(15, MINIMUM_SPAWN_NPC_CITIES),
  targetNpcCities: 28,
  minCitySeparation: 112,
  cityRadius: 28,
  edgeClearance: 96,
  blockerClearance: 42,
  structureClearance: 42,
  roadCorridorHalfWidth: 58,
  edgeTransitionRadius: 104,
  maximumCandidateEvaluations: 24000,
  attractionProbability: 0.64,
  attractionRadius: 380,
  startingCandidateRadius: 350,
  startingCandidateMinimumNeighbors: 3,
  startingCandidateMinimumTerritoryRatio: 0.2,
  startingCandidateEdgeClearance: 160,
  startingCandidateRoadAccess: 300,
  startingCandidateSeparation: 200,
  minimumStartingCandidates: 2,
  maximumStartingCandidates: 4,
});

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function digest(value, length = 64) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

function hashObject(value, length = 64) {
  return digest(stableJson(value), length);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 6) {
  const scale = 10 ** precision;
  return Math.round(Number(value) * scale) / scale;
}

function cleanId(value, maximumLength = 80) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximumLength);
}

function coordinateToken(value) {
  const number = Math.round(Number(value) || 0);
  if (number === 0) return "z00";
  return `${number < 0 ? "n" : "p"}${String(Math.abs(number)).padStart(2, "0")}`;
}

function createDynamicRegionId({ worldId, worldLayer, clockwiseOrderIndex, gridX, gridY }) {
  const worldLabel = cleanId(worldId, 16) || "world";
  const worldKey = digest(worldId, 8);
  return [
    "player",
    `${worldLabel}-${worldKey}`,
    `l${String(worldLayer).padStart(2, "0")}`,
    `c${String(Number(clockwiseOrderIndex) + 1).padStart(3, "0")}`,
    `x${coordinateToken(gridX)}`,
    `y${coordinateToken(gridY)}`,
  ].join("_");
}

function normalizeRegions(regions = []) {
  return (Array.isArray(regions) ? regions : [])
    .map(region => {
      const id = cleanId(region?.id);
      const gridX = Number(region?.gridX);
      const gridY = Number(region?.gridY);
      if (!id || !Number.isFinite(gridX) || !Number.isFinite(gridY)) return null;
      return {
        ...region,
        id,
        gridX: Math.round(gridX),
        gridY: Math.round(gridY),
      };
    })
    .filter(Boolean)
    .filter(region => !["failed", "rolled_back"].includes(String(region.lifecycle || "").toLowerCase()));
}

function assertUniqueRegionOccupancy(regions) {
  const ids = new Set();
  const coordinates = new Set();
  for (const region of regions) {
    if (ids.has(region.id)) throw new Error(`Duplicate region ID ${region.id}.`);
    ids.add(region.id);
    const key = coordinateKey(region.gridX, region.gridY);
    if (coordinates.has(key)) throw new Error(`Duplicate region coordinate ${key}.`);
    coordinates.add(key);
  }
}

function findNextOuterCoordinate(regions = []) {
  const normalized = normalizeRegions(regions);
  assertUniqueRegionOccupancy(normalized);
  const occupied = new Map(normalized.map(region => [coordinateKey(region.gridX, region.gridY), region]));
  const maximumExistingLayer = normalized.reduce((maximum, region) => Math.max(
    maximum,
    getWorldLayer(region.gridX, region.gridY, CORE_RADIUS),
  ), 0);

  for (let layer = 1; layer <= Math.max(1, maximumExistingLayer); layer += 1) {
    const ring = getClockwiseRingCoordinates(layer, CORE_RADIUS);
    const missingIndex = ring.findIndex(point => !occupied.has(coordinateKey(point.gridX, point.gridY)));
    if (missingIndex >= 0) {
      const illegalOuterRegion = normalized.find(region => (
        getWorldLayer(region.gridX, region.gridY, CORE_RADIUS) > layer
      ));
      if (illegalOuterRegion) {
        throw new Error(`Layer ${layer} is incomplete while ${illegalOuterRegion.id} occupies a higher layer.`);
      }
      return { ...ring[missingIndex], worldLayer: layer, clockwiseOrderIndex: missingIndex };
    }
  }

  const nextLayer = Math.max(1, maximumExistingLayer + 1);
  const coordinate = getClockwiseRingCoordinates(nextLayer, CORE_RADIUS)[0];
  return { ...coordinate, worldLayer: nextLayer, clockwiseOrderIndex: 0 };
}

function getNeighborAt(regionsByCoordinate, gridX, gridY, side) {
  const direction = DIRECTIONS[side];
  return regionsByCoordinate.get(coordinateKey(gridX + direction.dx, gridY + direction.dy)) || null;
}

function allocateNextPlayerRegion({
  worldId,
  seasonId,
  existingRegions = [],
  regionId = "",
  generatorVersion = GENERATOR_VERSION,
} = {}) {
  const normalized = normalizeRegions(existingRegions);
  assertUniqueRegionOccupancy(normalized);
  const coordinate = findNextOuterCoordinate(normalized);
  const id = cleanId(regionId) || createDynamicRegionId({ worldId, ...coordinate });
  if (normalized.some(region => region.id === id)) throw new Error(`Region ID ${id} already exists.`);
  const provisional = {
    id,
    name: id,
    purpose: "player_region",
    permanentCore: false,
    spawnEligible: false,
    spawnReady: false,
    lifecycle: "allocated",
    visibility: "development_only",
    gridX: coordinate.gridX,
    gridY: coordinate.gridY,
    worldLayer: coordinate.worldLayer,
    clockwiseOrderIndex: coordinate.clockwiseOrderIndex,
  };
  const withProvisional = [...normalized, provisional];
  const connectionsByRegion = buildCardinalConnections(withProvisional);
  const regionsByCoordinate = new Map(normalized.map(region => [coordinateKey(region.gridX, region.gridY), region]));
  const ring = getClockwiseRingCoordinates(coordinate.worldLayer, CORE_RADIUS);
  const previousCoordinate = ring[(coordinate.clockwiseOrderIndex - 1 + ring.length) % ring.length];
  const previousRegion = regionsByCoordinate.get(coordinateKey(previousCoordinate.gridX, previousCoordinate.gridY)) || null;
  const neighborUpdates = [];
  for (const side of SIDES) {
    const neighbor = getNeighborAt(regionsByCoordinate, coordinate.gridX, coordinate.gridY, side);
    if (!neighbor) continue;
    neighborUpdates.push({
      regionId: neighbor.id,
      side: DIRECTIONS[side].opposite,
      connection: connectionsByRegion[neighbor.id][DIRECTIONS[side].opposite],
    });
  }
  const existingRingCount = ring.filter(point => regionsByCoordinate.has(coordinateKey(point.gridX, point.gridY))).length;
  const ringWillClose = existingRingCount === ring.length - 1;
  return {
    schemaVersion: 1,
    generatorVersion,
    worldId: String(worldId || "world_01"),
    seasonId: String(seasonId || "development"),
    regionId: id,
    coordinate,
    previousClockwiseRegionId: previousRegion?.id || "",
    cardinalNeighbors: SIDES.map(side => {
      const neighbor = getNeighborAt(regionsByCoordinate, coordinate.gridX, coordinate.gridY, side);
      return neighbor ? { side, regionId: neighbor.id } : null;
    }).filter(Boolean),
    otherCardinalNeighborIds: SIDES.map(side => getNeighborAt(regionsByCoordinate, coordinate.gridX, coordinate.gridY, side)?.id || "")
      .filter(idValue => idValue && idValue !== previousRegion?.id),
    connections: connectionsByRegion[id],
    topologyPatch: {
      region: { regionId: id, connections: connectionsByRegion[id] },
      neighbors: neighborUpdates,
    },
    beginsNewLayer: coordinate.clockwiseOrderIndex === 0 && coordinate.worldLayer > 1,
    ringWillClose,
    ringSize: ring.length,
    occupiedRingCountBefore: existingRingCount,
    state: "ALLOCATED",
  };
}

function refreshRegionConnections(regions = []) {
  const normalized = normalizeRegions(regions);
  const connections = buildCardinalConnections(normalized);
  return normalized.map(region => ({ ...region, connections: connections[region.id] }));
}

function normalizeConfig(config = {}) {
  const merged = { ...DEFAULT_GENERATOR_CONFIG, ...(config || {}) };
  merged.minimumNpcCities = Math.max(15, Math.floor(Number(merged.minimumNpcCities) || 15));
  merged.targetNpcCities = Math.max(merged.minimumNpcCities, Math.floor(Number(merged.targetNpcCities) || merged.minimumNpcCities));
  merged.minCitySeparation = Math.max(64, Number(merged.minCitySeparation) || DEFAULT_GENERATOR_CONFIG.minCitySeparation);
  merged.cityRadius = Math.max(12, Number(merged.cityRadius) || DEFAULT_GENERATOR_CONFIG.cityRadius);
  merged.edgeClearance = Math.max(merged.cityRadius, Number(merged.edgeClearance) || DEFAULT_GENERATOR_CONFIG.edgeClearance);
  merged.blockerClearance = Math.max(0, Number(merged.blockerClearance) || 0);
  merged.structureClearance = Math.max(0, Number(merged.structureClearance) || 0);
  merged.roadCorridorHalfWidth = Math.max(20, Number(merged.roadCorridorHalfWidth) || DEFAULT_GENERATOR_CONFIG.roadCorridorHalfWidth);
  merged.edgeTransitionRadius = Math.max(40, Number(merged.edgeTransitionRadius) || DEFAULT_GENERATOR_CONFIG.edgeTransitionRadius);
  merged.maximumCandidateEvaluations = Math.max(1000, Math.floor(Number(merged.maximumCandidateEvaluations) || DEFAULT_GENERATOR_CONFIG.maximumCandidateEvaluations));
  return merged;
}

function createSeedMetadata({ allocation, seedSalt = "default", generatorVersion = GENERATOR_VERSION }) {
  const material = [
    String(allocation.worldId || ""),
    String(allocation.seasonId || ""),
    String(allocation.regionId || ""),
    String(allocation.coordinate.gridX),
    String(allocation.coordinate.gridY),
    String(generatorVersion),
    String(seedSalt || "default"),
  ].join("|");
  return {
    strategy: "sha256(worldId|seasonId|regionId|gridX|gridY|generatorVersion|seedSalt)",
    generatorVersion,
    seedSalt: String(seedSalt || "default"),
    seedHash: digest(material, 64),
  };
}

function createDeterministicRandom(seedHash) {
  let state = Number.parseInt(String(seedHash).slice(0, 8), 16) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInPolygon(point, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return true;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = ((Number(currentPoint.y) > point.y) !== (Number(previousPoint.y) > point.y))
      && (point.x < (Number(previousPoint.x) - Number(currentPoint.x)) * (point.y - Number(currentPoint.y))
        / ((Number(previousPoint.y) - Number(currentPoint.y)) || Number.EPSILON) + Number(currentPoint.x));
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInExpandedEllipse(point, shape, padding = 0) {
  const rotation = Number(shape?.rot) || 0;
  const dx = point.x - Number(shape?.x || 0);
  const dy = point.y - Number(shape?.y || 0);
  const cosine = Math.cos(-rotation);
  const sine = Math.sin(-rotation);
  const rotatedX = dx * cosine - dy * sine;
  const rotatedY = dx * sine + dy * cosine;
  const radiusX = Math.max(1, Number(shape?.rx || shape?.radius || 1) + padding);
  const radiusY = Math.max(1, Number(shape?.ry || shape?.radius || 1) + padding);
  return (rotatedX * rotatedX) / (radiusX * radiusX) + (rotatedY * rotatedY) / (radiusY * radiusY) <= 1;
}

function distancePointToSegment(point, start, end) {
  const dx = Number(end.x) - Number(start.x);
  const dy = Number(end.y) - Number(start.y);
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(point.x - Number(start.x), point.y - Number(start.y));
  const ratio = clamp(((point.x - Number(start.x)) * dx + (point.y - Number(start.y)) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (Number(start.x) + ratio * dx), point.y - (Number(start.y) + ratio * dy));
}

function normalizePoint(item, width, height) {
  return {
    x: Number.isFinite(Number(item?.x)) ? Number(item.x) : Number(item?.xNorm) * width,
    y: Number.isFinite(Number(item?.y)) ? Number(item.y) : Number(item?.yNorm) * height,
  };
}

function createPotentialEdgeRoadCorridors(width, height, config) {
  const halfWidth = config.roadCorridorHalfWidth;
  return [
    { id: "future-road-north", side: "north", start: { x: width / 2, y: 0 }, end: { x: width / 2, y: height * 0.32 }, halfWidth },
    { id: "future-road-east", side: "east", start: { x: width, y: height / 2 }, end: { x: width * 0.68, y: height / 2 }, halfWidth },
    { id: "future-road-south", side: "south", start: { x: width / 2, y: height }, end: { x: width / 2, y: height * 0.68 }, halfWidth },
    { id: "future-road-west", side: "west", start: { x: 0, y: height / 2 }, end: { x: width * 0.32, y: height / 2 }, halfWidth },
  ];
}

function normalizeTerrainDefinition(definition = {}, config = DEFAULT_GENERATOR_CONFIG) {
  const width = Math.max(320, Math.floor(Number(definition.width) || 1448));
  const height = Math.max(320, Math.floor(Number(definition.height) || 1086));
  const terrain = definition.terrain && typeof definition.terrain === "object" ? definition.terrain : {};
  if (terrain.authoritativeData !== true) throw new Error("City placement requires authoritative terrain/blocker data.");
  if (terrain.derivedFromImagePixels === true) throw new Error("Image-pixel-only terrain is not authoritative for city placement.");
  const corridors = [
    ...createPotentialEdgeRoadCorridors(width, height, config),
    ...(Array.isArray(definition.roadCorridors) ? definition.roadCorridors : []),
  ].map((corridor, index) => ({
    id: cleanId(corridor.id) || `road-corridor-${index + 1}`,
    side: String(corridor.side || "internal"),
    start: normalizePoint(corridor.start || {}, width, height),
    end: normalizePoint(corridor.end || {}, width, height),
    halfWidth: Math.max(16, Number(corridor.halfWidth) || config.roadCorridorHalfWidth),
  }));
  const transitionZones = createPotentialEdgeRoadCorridors(width, height, config).map(corridor => ({
    id: `transition-${corridor.side}`,
    side: corridor.side,
    ...corridor.start,
    radius: config.edgeTransitionRadius,
  }));
  const structures = [];
  const addStructures = (items, kind, defaultRadius) => {
    for (const item of Array.isArray(items) ? items : []) {
      structures.push({
        id: cleanId(item?.id) || `${kind}-${structures.length + 1}`,
        kind,
        ...normalizePoint(item, width, height),
        radius: Math.max(1, Number(item?.radius || item?.size) / (item?.radius ? 1 : 2) || defaultRadius),
      });
    }
  };
  addStructures(definition.camps, "camp", 66);
  addStructures(definition.strongholds, "stronghold", 88);
  addStructures(definition.citadels, "crown_citadel", 140);
  return {
    width,
    height,
    source: String(terrain.source || "development-authoritative-fixture"),
    landPolygon: Array.isArray(terrain.landPolygon) ? terrain.landPolygon.map(point => normalizePoint(point, width, height)) : [],
    blockers: [
      ...(Array.isArray(terrain.blockers) ? terrain.blockers : []),
      ...(Array.isArray(terrain.prohibitedTerrain) ? terrain.prohibitedTerrain : []),
      ...(Array.isArray(definition.noCityZones) ? definition.noCityZones : []),
    ].filter(shape => shape?.blocksCities !== false),
    structures,
    corridors,
    transitionZones,
  };
}

function pointHasLandClearance(point, terrainModel, clearance) {
  const samples = [[0, 0]];
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    samples.push([Math.cos(angle) * clearance, Math.sin(angle) * clearance]);
  }
  return samples.every(([dx, dy]) => pointInPolygon({ x: point.x + dx, y: point.y + dy }, terrainModel.landPolygon));
}

function evaluateStaticPlacement(point, terrainModel, config) {
  if (point.x < config.edgeClearance || point.x > terrainModel.width - config.edgeClearance
    || point.y < config.edgeClearance || point.y > terrainModel.height - config.edgeClearance) {
    return "edge_clearance";
  }
  if (!pointHasLandClearance(point, terrainModel, config.cityRadius + 12)) return "outside_land";
  if (terrainModel.blockers.some(shape => pointInExpandedEllipse(
    point,
    shape,
    config.cityRadius + config.blockerClearance,
  ))) return "terrain_blocker";
  if (terrainModel.structures.some(structure => (
    Math.hypot(point.x - structure.x, point.y - structure.y)
      < structure.radius + config.cityRadius + config.structureClearance
  ))) return "structure_clearance";
  if (terrainModel.transitionZones.some(zone => (
    Math.hypot(point.x - zone.x, point.y - zone.y) < zone.radius + config.cityRadius
  ))) return "edge_transition";
  if (terrainModel.corridors.some(corridor => (
    distancePointToSegment(point, corridor.start, corridor.end) < corridor.halfWidth + config.cityRadius
  ))) return "road_corridor";
  return "";
}

function evaluateCityPlacement(point, terrainModel, config, cities = []) {
  const staticReason = evaluateStaticPlacement(point, terrainModel, config);
  if (staticReason) return staticReason;
  if (cities.some(city => Math.hypot(point.x - city.x, point.y - city.y) < config.minCitySeparation)) return "city_spacing";
  return "";
}

function createCandidate(random, terrainModel, config, cities) {
  const useAttraction = cities.length >= 3 && random() < config.attractionProbability;
  if (useAttraction) {
    const anchorPool = cities.slice(0, Math.min(6, cities.length));
    const anchor = anchorPool[Math.floor(random() * anchorPool.length)];
    const angle = random() * Math.PI * 2;
    const radius = config.minCitySeparation * 1.05
      + Math.sqrt(random()) * Math.max(1, config.attractionRadius - config.minCitySeparation * 1.05);
    return {
      x: Math.round(anchor.x + Math.cos(angle) * radius + (random() - 0.5) * 28),
      y: Math.round(anchor.y + Math.sin(angle) * radius + (random() - 0.5) * 28),
    };
  }
  return {
    x: Math.round(config.edgeClearance + random() * Math.max(1, terrainModel.width - config.edgeClearance * 2)),
    y: Math.round(config.edgeClearance + random() * Math.max(1, terrainModel.height - config.edgeClearance * 2)),
  };
}

function createGeneratedCityId(regionId, seedHash, point) {
  const pointIdentity = `${Math.round(point.x * 1000)}|${Math.round(point.y * 1000)}`;
  return `npc_${cleanId(regionId, 54)}_${digest(`${seedHash}|${pointIdentity}`, 14)}`;
}

function createNeutralCity(regionId, seedHash, point, terrainModel) {
  const id = createGeneratedCityId(regionId, seedHash, point);
  return {
    id,
    name: `Frontier ${digest(id, 6).toUpperCase()}`,
    regionId,
    x: Math.round(point.x),
    y: Math.round(point.y),
    xNorm: round(point.x / terrainModel.width),
    yNorm: round(point.y / terrainModel.height),
    owner: "neutral",
    ownerKind: "neutral",
    startType: "neutral",
    level: 1,
    troops: 10,
    defense: 1,
    generated: true,
  };
}

function estimateUsableCapacity(terrainModel, config, placedCount = 0) {
  const columns = 48;
  const rows = 36;
  let valid = 0;
  let evaluated = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = {
        x: (column + 0.5) / columns * terrainModel.width,
        y: (row + 0.5) / rows * terrainModel.height,
      };
      evaluated += 1;
      if (!evaluateStaticPlacement(point, terrainModel, config)) valid += 1;
    }
  }
  const usableRatio = valid / Math.max(1, evaluated);
  const usableArea = terrainModel.width * terrainModel.height * usableRatio;
  // This is a tuning signal, not a geometric proof. The factor allows for
  // irregular packing and is always floored by a layout already proven valid.
  const cellArea = config.minCitySeparation * config.minCitySeparation * 0.58;
  return {
    usableRatio: round(usableRatio),
    estimatedUsableArea: Math.round(usableArea),
    maximumPracticalDensity: Math.max(
      Math.max(0, Math.floor(Number(placedCount) || 0)),
      Math.max(0, Math.floor(usableArea / Math.max(1, cellArea))),
    ),
  };
}

function nearestRoadDistance(point, corridors) {
  return corridors.reduce((minimum, corridor) => Math.min(
    minimum,
    distancePointToSegment(point, corridor.start, corridor.end),
  ), Number.POSITIVE_INFINITY);
}

function localTerritoryRatio(city, terrainModel, config) {
  let valid = 0;
  let samples = 0;
  for (const radius of [70, 130, 210]) {
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      const point = { x: city.x + Math.cos(angle) * radius, y: city.y + Math.sin(angle) * radius };
      samples += 1;
      if (!evaluateStaticPlacement(point, terrainModel, config)) valid += 1;
    }
  }
  return valid / samples;
}

function identifyStartingCityCandidates(cities, terrainModel, config) {
  const evaluated = cities.map(city => {
    const nearby = cities.filter(other => (
      other.id !== city.id
      && Math.hypot(city.x - other.x, city.y - other.y) <= config.startingCandidateRadius
    ));
    const edgeDistance = Math.min(city.x, terrainModel.width - city.x, city.y, terrainModel.height - city.y);
    const territoryRatio = localTerritoryRatio(city, terrainModel, config);
    const roadDistance = nearestRoadDistance(city, terrainModel.corridors);
    const eligible = nearby.length >= config.startingCandidateMinimumNeighbors
      && edgeDistance >= config.startingCandidateEdgeClearance
      && territoryRatio >= config.startingCandidateMinimumTerritoryRatio
      && roadDistance <= config.startingCandidateRoadAccess;
    const score = nearby.length * 15
      + territoryRatio * 40
      - Math.abs(roadDistance - 170) * 0.04
      + Math.min(edgeDistance, 300) * 0.03;
    return {
      cityId: city.id,
      eligible,
      score: round(score, 3),
      nearbyNpcCityCount: nearby.length,
      nearbyNpcCityIds: nearby.map(other => other.id).sort(),
      edgeDistance: Math.round(edgeDistance),
      localUsableTerritoryRatio: round(territoryRatio),
      nearestRoadCorridorDistance: Math.round(roadDistance),
    };
  }).sort((left, right) => right.score - left.score || left.cityId.localeCompare(right.cityId));
  const selected = [];
  const citiesById = new Map(cities.map(city => [city.id, city]));
  for (const candidate of evaluated.filter(entry => entry.eligible)) {
    const city = citiesById.get(candidate.cityId);
    if (selected.some(entry => {
      const selectedCity = citiesById.get(entry.cityId);
      return Math.hypot(city.x - selectedCity.x, city.y - selectedCity.y) < config.startingCandidateSeparation;
    })) continue;
    selected.push(candidate);
    if (selected.length >= config.maximumStartingCandidates) break;
  }
  return { evaluated, selected };
}

function generateNpcCities({ allocation, definition, config: configInput = {}, seedSalt = "default" }) {
  const config = normalizeConfig(configInput);
  const terrainModel = normalizeTerrainDefinition(definition, config);
  const seed = createSeedMetadata({ allocation, seedSalt, generatorVersion: allocation.generatorVersion });
  const random = createDeterministicRandom(seed.seedHash);
  const cities = [];
  const rejectedByReason = {};
  let candidatePositionsEvaluated = 0;
  while (cities.length < config.targetNpcCities && candidatePositionsEvaluated < config.maximumCandidateEvaluations) {
    candidatePositionsEvaluated += 1;
    const point = createCandidate(random, terrainModel, config, cities);
    const rejection = evaluateCityPlacement(point, terrainModel, config, cities);
    if (rejection) {
      rejectedByReason[rejection] = (rejectedByReason[rejection] || 0) + 1;
      continue;
    }
    const city = createNeutralCity(allocation.regionId, seed.seedHash, point, terrainModel);
    if (cities.some(existing => existing.id === city.id)) {
      rejectedByReason.city_id_collision = (rejectedByReason.city_id_collision || 0) + 1;
      continue;
    }
    cities.push(city);
  }
  cities.sort((left, right) => left.id.localeCompare(right.id));
  const startingCandidates = identifyStartingCityCandidates(cities, terrainModel, config);
  return {
    seed,
    config,
    terrainModel,
    cities,
    startingCandidates,
    capacity: estimateUsableCapacity(terrainModel, config, cities.length),
    metrics: {
      candidatePositionsEvaluated,
      acceptedPositions: cities.length,
      rejectedPositions: candidatePositionsEvaluated - cities.length,
      rejectedByReason,
    },
  };
}

function validateTopology(allocation, existingRegions = []) {
  const errors = [];
  if (allocation.coordinate.worldLayer < 1) errors.push("Player region is inside the permanent Core.");
  if (getWorldLayer(allocation.coordinate.gridX, allocation.coordinate.gridY, CORE_RADIUS) !== allocation.coordinate.worldLayer) {
    errors.push("Allocated world layer does not match its coordinate.");
  }
  if (getClockwiseRingIndex(allocation.coordinate.gridX, allocation.coordinate.gridY, CORE_RADIUS) !== allocation.coordinate.clockwiseOrderIndex) {
    errors.push("Clockwise order index does not match the coordinate.");
  }
  const byId = new Map(normalizeRegions(existingRegions).map(region => [region.id, region]));
  for (const side of SIDES) {
    const connection = allocation.connections?.[side];
    if (!connection) {
      errors.push(`Missing ${side} connection.`);
      continue;
    }
    if (connection.state === "gated" && connection.targetRegionId) errors.push(`${side} gate has a hidden destination.`);
    if (connection.state === "open") {
      const target = byId.get(connection.targetRegionId);
      if (!target) errors.push(`${side} open edge has no existing destination.`);
      const reciprocal = allocation.topologyPatch.neighbors.find(update => (
        update.regionId === connection.targetRegionId && update.side === DIRECTIONS[side].opposite
      ));
      if (!reciprocal || reciprocal.connection.state !== "open" || reciprocal.connection.targetRegionId !== allocation.regionId) {
        errors.push(`${side} open edge is not reciprocal.`);
      }
    }
  }
  return errors;
}

function validateGeneratedDefinition({ allocation, definition, generation, existingRegions }) {
  const errors = [...validateTopology(allocation, existingRegions)];
  const warnings = [];
  if (definition.id !== allocation.regionId) errors.push("Region definition ID does not match its allocation.");
  if (definition.purpose !== "player_region") errors.push("Generated region purpose is not player_region.");
  if (definition.permanentCore) errors.push("Generated player region cannot be permanent Core.");
  if (generation.cities.length < generation.config.minimumNpcCities) {
    errors.push(`Placed ${generation.cities.length} NPC cities; ${generation.config.minimumNpcCities} are required.`);
  }
  if (generation.cities.length < generation.config.targetNpcCities
    && generation.cities.length >= generation.config.minimumNpcCities) {
    warnings.push(`Target ${generation.config.targetNpcCities} was not reached; ${generation.cities.length} valid NPC cities remain spawn-capable.`);
  }
  const ids = new Set();
  const validatedCities = [];
  for (const city of generation.cities) {
    if (ids.has(city.id)) errors.push(`Duplicate generated city ID ${city.id}.`);
    ids.add(city.id);
    const rejection = evaluateCityPlacement(city, generation.terrainModel, generation.config, validatedCities);
    if (rejection) errors.push(`${city.id} violates ${rejection}.`);
    if (city.ownerKind !== "neutral" || city.level !== 1 || city.troops !== 10) {
      errors.push(`${city.id} does not use existing neutral initialization.`);
    }
    validatedCities.push(city);
  }
  if (generation.startingCandidates.selected.length < generation.config.minimumStartingCandidates) {
    errors.push(`Only ${generation.startingCandidates.selected.length} valid starting-city candidates were found.`);
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks: {
      playerRegionOutsideCore: allocation.coordinate.worldLayer >= 1,
      topologyValid: !validateTopology(allocation, existingRegions).length,
      definitionValid: definition.id === allocation.regionId,
      minimumNpcCitiesMet: generation.cities.length >= generation.config.minimumNpcCities,
      noPlacementConflicts: !errors.some(error => error.includes("violates") || error.includes("Duplicate generated city")),
      startingCandidatesExist: generation.startingCandidates.selected.length >= generation.config.minimumStartingCandidates,
      edgeTransitionClearance: !generation.cities.some(city => evaluateStaticPlacement(
        city,
        generation.terrainModel,
        generation.config,
      ) === "edge_transition"),
    },
  };
}

function deterministicGenerationProjection(result) {
  return {
    generatorVersion: result.generatorVersion,
    status: result.status,
    allocation: {
      regionId: result.allocation.regionId,
      coordinate: result.allocation.coordinate,
      previousClockwiseRegionId: result.allocation.previousClockwiseRegionId,
      cardinalNeighbors: result.allocation.cardinalNeighbors,
      connections: result.allocation.connections,
      ringWillClose: result.allocation.ringWillClose,
      beginsNewLayer: result.allocation.beginsNewLayer,
    },
    seed: result.seed,
    cities: result.previewDefinition?.cities || result.definition?.cities || [],
    startingCityCandidates: result.previewDefinition?.startingCityCandidates || result.definition?.startingCityCandidates || [],
    validation: result.validation,
    stateHistory: result.receipt.stateHistory,
  };
}

function generateRegionPrototype({
  worldId,
  seasonId,
  existingRegions = [],
  allocation: allocationInput = null,
  regionId = "",
  definition,
  config = {},
  seedSalt = "default",
  generatorVersion = GENERATOR_VERSION,
} = {}) {
  const allocation = allocationInput || allocateNextPlayerRegion({
    worldId,
    seasonId,
    existingRegions,
    regionId,
    generatorVersion,
  });
  const stateHistory = ["ALLOCATED", "GENERATING"];
  const generation = generateNpcCities({ allocation, definition, config, seedSalt });
  const previewDefinition = {
    ...definition,
    id: allocation.regionId,
    purpose: "player_region",
    permanentCore: false,
    gridX: allocation.coordinate.gridX,
    gridY: allocation.coordinate.gridY,
    worldLayer: allocation.coordinate.worldLayer,
    clockwiseOrderIndex: allocation.coordinate.clockwiseOrderIndex,
    connections: allocation.connections,
    cities: generation.cities,
    startingCityCandidates: generation.startingCandidates.selected,
    generatorVersion,
    seed: generation.seed,
    generationConfig: generation.config,
  };
  stateHistory.push("VALIDATING");
  const validation = validateGeneratedDefinition({
    allocation,
    definition: previewDefinition,
    generation,
    existingRegions,
  });
  const status = validation.valid ? "standby" : "rolled_back";
  stateHistory.push(validation.valid ? "STANDBY" : "FAILED");
  if (!validation.valid) stateHistory.push("ROLLED_BACK");
  const catalogEntry = validation.valid ? {
    id: allocation.regionId,
    name: String(definition.name || allocation.regionId),
    purpose: "player_region",
    permanentCore: false,
    spawnEligible: true,
    spawnReady: true,
    lifecycle: "standby",
    visibility: "development_only",
    activationAllowed: false,
    gridX: allocation.coordinate.gridX,
    gridY: allocation.coordinate.gridY,
    worldLayer: allocation.coordinate.worldLayer,
    clockwiseOrderIndex: allocation.coordinate.clockwiseOrderIndex,
    npcCityCount: generation.cities.length,
    connections: allocation.connections,
    generatorVersion,
    seedHash: generation.seed.seedHash,
  } : null;
  const result = {
    schemaVersion: 1,
    generatorVersion,
    status,
    authoritative: false,
    publicationBlocked: true,
    allocation,
    seed: generation.seed,
    catalogEntry,
    definition: validation.valid ? previewDefinition : null,
    previewDefinition,
    validation,
    capacity: generation.capacity,
    metrics: generation.metrics,
    receipt: {
      stateHistory,
      coordinateReusable: !validation.valid,
      failedArtifactAuthoritative: false,
      retryRequiresExplicitSeedOrConfigRevision: !validation.valid,
      activationState: validation.valid ? "STANDBY" : "ROLLED_BACK",
    },
    publicationPackage: validation.valid ? {
      status: "development_manifest_only",
      regionCatalogEntry: `${allocation.regionId}.catalog.json`,
      regionDefinition: `${allocation.regionId}.region.json`,
      cityDefinitionsEmbedded: true,
      topologyEmbedded: true,
      blockerDataEmbedded: true,
      mapWebp: null,
      thumbnailWebp: null,
      validationReceipt: `${allocation.regionId}.validation.json`,
      generatorVersion,
      seedHash: generation.seed.seedHash,
    } : null,
  };
  result.generationHash = hashObject(deterministicGenerationProjection(result));
  result.receipt.receiptId = `phase4_${digest(`${allocation.regionId}|${result.generationHash}|${status}`, 24)}`;
  return result;
}

function createRetryPlan(failedResult, { seedSalt, configRevision = "" } = {}) {
  if (failedResult?.status !== "rolled_back") throw new Error("Only rolled-back generation can be retried.");
  if (!seedSalt && !configRevision) throw new Error("Retry requires an explicit revised seed or configuration revision.");
  return {
    coordinate: { ...failedResult.allocation.coordinate },
    regionId: failedResult.allocation.regionId,
    coordinateReusable: true,
    priorReceiptId: failedResult.receipt.receiptId,
    nextState: "ALLOCATED",
    seedSalt: String(seedSalt || failedResult.seed.seedSalt),
    configRevision: String(configRevision || ""),
  };
}

module.exports = Object.freeze({
  GENERATOR_VERSION,
  DEFAULT_GENERATOR_CONFIG,
  SIDES,
  stableJson,
  hashObject,
  digest,
  cleanId,
  coordinateToken,
  createDynamicRegionId,
  normalizeRegions,
  findNextOuterCoordinate,
  allocateNextPlayerRegion,
  refreshRegionConnections,
  normalizeConfig,
  createSeedMetadata,
  createDeterministicRandom,
  pointInPolygon,
  pointInExpandedEllipse,
  distancePointToSegment,
  createPotentialEdgeRoadCorridors,
  normalizeTerrainDefinition,
  evaluateStaticPlacement,
  evaluateCityPlacement,
  createGeneratedCityId,
  estimateUsableCapacity,
  identifyStartingCityCandidates,
  generateNpcCities,
  validateTopology,
  validateGeneratedDefinition,
  deterministicGenerationProjection,
  generateRegionPrototype,
  createRetryPlan,
  isRingComplete,
});
