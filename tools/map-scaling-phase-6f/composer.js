"use strict";

const assert = require("node:assert/strict");
const phase6b = require("../map-scaling-phase-6b/composer");
const phase6d = require("../map-scaling-phase-6d/composer");
const {
  DEFAULT_GENERATOR_CONFIG,
  estimateUsableCapacity,
  hashObject,
  normalizeConfig,
  normalizeTerrainDefinition,
} = require("../map-scaling-phase-4/generator");

const GENERATOR_VERSION = "phase6f-road-geometry-decoupling-v1";
const EDGE_CONTRACT_VERSION = "phase6f-published-edge-contract-v1";
const MAP_WIDTH = 1448;
const MAP_HEIGHT = 1086;
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const OPPOSITE_SIDE = Object.freeze({ north: "south", east: "west", south: "north", west: "east" });
const SOCKETS = Object.freeze({
  north: Object.freeze({ x: 724, y: 0, tangentOffset: 0.5, inwardOrientation: "south" }),
  east: Object.freeze({ x: 1448, y: 543, tangentOffset: 0.5, inwardOrientation: "west" }),
  south: Object.freeze({ x: 724, y: 1086, tangentOffset: 0.5, inwardOrientation: "north" }),
  west: Object.freeze({ x: 0, y: 543, tangentOffset: 0.5, inwardOrientation: "east" }),
});
const ROAD_GEOMETRIES = Object.freeze([
  Object.freeze({ id: "base", assetId: null, sourceTheme: "shared", family: "base" }),
  Object.freeze({ id: "east-v2", assetId: "road-plan.east.v2", sourceTheme: "east", family: "v2" }),
  Object.freeze({ id: "east-v3", assetId: "road-plan.east.v3", sourceTheme: "east", family: "v3" }),
  Object.freeze({ id: "north-v2", assetId: "road-plan.north.v2", sourceTheme: "north", family: "v2" }),
  Object.freeze({ id: "north-v3", assetId: "road-plan.north.v3", sourceTheme: "north", family: "v3" }),
  Object.freeze({ id: "south-v2", assetId: "road-plan.south.v2", sourceTheme: "south", family: "v2" }),
  Object.freeze({ id: "south-v3", assetId: "road-plan.south.v3", sourceTheme: "south", family: "v3" }),
  Object.freeze({ id: "west-v2", assetId: "road-plan.west.v2", sourceTheme: "west", family: "v2" }),
  Object.freeze({ id: "west-v3", assetId: "road-plan.west.v3", sourceTheme: "west", family: "v3" }),
]);

function assetMap(manifest) {
  return new Map(manifest.assets.map(asset => [asset.assetId, asset]));
}

function placement(asset, overrides = {}) {
  return {
    assetId: asset.assetId,
    path: asset.path,
    x: asset.placement?.x || 0,
    y: asset.placement?.y || 0,
    width: asset.width,
    height: asset.height,
    ...overrides,
  };
}

function roadSocketPlacement(road, side) {
  const crop = {
    north: { x: 0, y: 0, width: 320, height: 220 },
    east: { x: 340, y: 0, width: 220, height: 320 },
    south: { x: 0, y: 220, width: 320, height: 220 },
    west: { x: 0, y: 0, width: 220, height: 320 },
  }[side];
  const target = {
    north: { x: 564, y: 0 },
    east: { x: 1228, y: 383 },
    south: { x: 564, y: 866 },
    west: { x: 0, y: 383 },
  }[side];
  return { ...road, ...target, width: crop.width, height: crop.height, crop };
}

function roadCorridors(edgeRoads) {
  return edgeRoads.map(road => ({
    id: `${road.id}-critical-edge-corridor`,
    side: road.side,
    start: road.points[0],
    end: road.points[1],
    halfWidth: road.halfWidth,
  }));
}

function roadSelectionStart(allocation) {
  const hash = hashObject({
    worldId: allocation.worldId,
    seasonId: allocation.seasonId,
    regionId: allocation.regionId,
    coordinate: allocation.coordinate,
    generatorVersion: GENERATOR_VERSION,
    strategy: "theme-independent-nine-geometry-selection-v1",
  });
  return Number.parseInt(hash.slice(0, 12), 16) % ROAD_GEOMETRIES.length;
}

function buildEdgeContracts(allocation, themeKey, edgeRoads, inheritedEdgeContracts = {}) {
  const bySide = new Map(edgeRoads.map(road => [road.side, road]));
  const sides = {};
  for (const side of SIDES) {
    const road = bySide.get(side);
    assert(road, `Missing ${side} road for published edge contract.`);
    const inherited = inheritedEdgeContracts[side] || null;
    sides[side] = {
      contractVersion: EDGE_CONTRACT_VERSION,
      regionId: allocation.regionId,
      side,
      sourceTheme: themeKey,
      socket: SOCKETS[side],
      roadHalfWidth: road.halfWidth,
      transitionBandMaximumWidth: 96,
      transitionGeometry: "narrow-edge-band-v1",
      futureNeighborMustAdapt: true,
      publishedRegionWins: true,
      inheritedPublishedConstraint: inherited ? {
        regionId: inherited.regionId,
        side: inherited.side,
        sourceTheme: inherited.sourceTheme,
        socketTangentOffset: inherited.socket.tangentOffset,
        roadHalfWidth: inherited.roadHalfWidth,
        contractHash: inherited.contractHash,
      } : null,
    };
    sides[side].contractHash = hashObject({
      ...sides[side],
      inheritedPublishedConstraint: undefined,
      contractHash: undefined,
    });
  }
  return {
    contractVersion: EDGE_CONTRACT_VERSION,
    regionId: allocation.regionId,
    immutableAfterPublication: true,
    existingPublishedRegionWins: true,
    sides,
  };
}

function validateInheritedEdgeContracts(inheritedEdgeContracts = {}) {
  const errors = [];
  for (const [localSide, inherited] of Object.entries(inheritedEdgeContracts)) {
    if (!SIDES.includes(localSide)) errors.push(`Unknown local edge ${localSide}.`);
    if (!inherited || inherited.side !== OPPOSITE_SIDE[localSide]) {
      errors.push(`${localSide} did not inherit the opposing published edge.`);
      continue;
    }
    if (inherited.socket?.tangentOffset !== SOCKETS[localSide].tangentOffset) {
      errors.push(`${localSide} published socket offset is incompatible.`);
    }
    if (inherited.roadHalfWidth !== 44) errors.push(`${localSide} published road width is incompatible.`);
    if (inherited.publishedRegionWins !== true || inherited.futureNeighborMustAdapt !== true) {
      errors.push(`${localSide} does not preserve published-region precedence.`);
    }
  }
  return errors;
}

function applyRoadGeometry(basePlan, geometry, options, manifest, roadSelectionRank) {
  const byId = assetMap(manifest);
  const phase6bPlan = phase6b.createArtworkPlan({
    allocation: options.allocation,
    themeKey: options.themeKey,
    variantKey: options.variantKey,
    retrySalt: `${options.retrySalt}|macro-${basePlan.macroCandidateIndex}`,
    manifest,
  });
  const themedOpenings = phase6bPlan.roads.map(item => ({ ...item, harmonizeToFoundation: true }));
  let roads = themedOpenings;
  let roadModule = null;
  let edgeRoads = phase6bPlan.roadSystem.edgeRoads;
  if (geometry.assetId) {
    const geometryAsset = byId.get(geometry.assetId);
    const skinReference = byId.get(`road-plan.${options.themeKey}.v2`);
    assert(geometryAsset, `Missing approved road geometry ${geometry.assetId}.`);
    assert(skinReference, `Missing approved ${options.themeKey} road skin reference.`);
    roads = themedOpenings.map(road => roadSocketPlacement(road, byId.get(road.assetId).side));
    roadModule = placement(geometryAsset, {
      id: `internal-road-${geometry.id}`,
      geometryRef: geometry.id,
      roadGeometryId: geometry.id,
      roadGeometrySourceTheme: geometry.sourceTheme,
      roadSkin: {
        strategy: "masked-reference-color-transfer-v1",
        themeKey: options.themeKey,
        referenceAssetId: skinReference.assetId,
        referencePath: skinReference.path,
      },
    });
    roads.push(roadModule);
    edgeRoads = geometryAsset.roadPaths;
  }
  const edgeContracts = buildEdgeContracts(
    options.allocation,
    options.themeKey,
    edgeRoads,
    options.inheritedEdgeContracts,
  );
  const plan = {
    ...basePlan,
    generatorVersion: GENERATOR_VERSION,
    phase: "6F",
    roadFamily: geometry.family,
    roadGeometryId: geometry.id,
    roadGeometrySourceTheme: geometry.sourceTheme,
    roadSelectionStrategy: "theme-independent-nine-geometry-selection-v1",
    roadSelectionRank,
    roadModule,
    roads,
    roadSystem: {
      edgeRoads,
      branches: [],
      exits: Object.fromEntries(edgeRoads.map(road => [road.side, road.points[0]])),
    },
    roadCorridors: roadCorridors(edgeRoads),
    internalRoadGuides: edgeRoads.flatMap(road => road.points.slice(1, -1).map((start, index) => ({
      id: `${road.id}-internal-guide-${index + 1}`,
      side: road.side,
      start,
      end: road.points[index + 2],
      blocksCities: false,
      visualOnly: true,
    }))),
    inheritedEdgeContracts: options.inheritedEdgeContracts || {},
    publishedEdgeContracts: edgeContracts,
    edgeContractHash: hashObject(edgeContracts),
  };
  plan.visualComposition = [
    { id: "foundation", assetId: plan.foundation.assetId, category: "foundation", geometryRef: "land-polygon", drawOrder: 0 },
    ...plan.barriers.map((item, index) => ({ ...item, id: `barrier-${index + 1}`, category: "perimeter_barrier", drawOrder: 10 })),
    ...roads.map((item, index) => ({ ...item, id: item.id || `road-${index + 1}`, category: item === roadModule ? "internal_road_module" : "road_opening", drawOrder: 20 + index })),
    ...plan.accents.map((item, index) => ({ ...item, category: "interior_accent", drawOrder: 40 + index })),
  ];
  plan.seed = {
    ...basePlan.seed,
    roadGeometryStrategy: plan.roadSelectionStrategy,
    roadGeometryId: geometry.id,
    roadGeometrySelectionHash: hashObject({
      regionId: options.allocation.regionId,
      coordinate: options.allocation.coordinate,
      geometryId: geometry.id,
      generatorVersion: GENERATOR_VERSION,
    }),
  };
  plan.planHash = hashObject({ ...plan, planHash: undefined });
  return plan;
}

function createArtworkPlan(options) {
  const manifest = options.manifest || phase6d.loadAssetManifest();
  const basePlan = phase6d.createArtworkPlan({ ...options, manifest });
  const requested = options.roadGeometryId
    ? ROAD_GEOMETRIES.find(item => item.id === options.roadGeometryId)
    : ROAD_GEOMETRIES[roadSelectionStart(options.allocation)];
  if (!requested) throw new Error(`Unknown Phase 6F road geometry ${options.roadGeometryId}.`);
  return applyRoadGeometry(basePlan, requested, options, manifest, 0);
}

function createRankedArtworkPlans(options) {
  const manifest = options.manifest || phase6d.loadAssetManifest();
  const start = roadSelectionStart(options.allocation);
  return phase6d.createRankedArtworkPlans({ ...options, manifest }).map((basePlan, rank) => {
    const geometry = ROAD_GEOMETRIES[(start + rank) % ROAD_GEOMETRIES.length];
    const plan = applyRoadGeometry(basePlan, geometry, options, manifest, rank);
    plan.feasibility = estimatePlanFeasibility(options.allocation, plan);
    plan.feasibility.priorityHash = basePlan.feasibility.priorityHash;
    return plan;
  });
}

function createDefinition(allocation, plan) {
  return {
    id: allocation.regionId,
    name: `Phase 6F ${plan.theme.label} ${plan.roadGeometryId}`,
    purpose: "player_region",
    permanentCore: false,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    mapAsset: null,
    thumbnailAsset: null,
    terrain: {
      source: `${GENERATOR_VERSION}:${plan.planHash}`,
      authoritativeData: true,
      derivedFromImagePixels: false,
      landPolygon: plan.landPolygon,
      blockers: plan.blockers,
      prohibitedTerrain: [],
    },
    roadCorridors: plan.roadCorridors,
    noCityZones: [],
    camps: [],
    strongholds: [],
    citadels: [],
  };
}

function estimatePlanFeasibility(allocation, plan) {
  const config = normalizeConfig({
    ...DEFAULT_GENERATOR_CONFIG,
    maximumCandidateEvaluations: 320000,
    attractionProbability: 0.52,
  });
  const terrain = normalizeTerrainDefinition(createDefinition(allocation, plan), config);
  const capacity = estimateUsableCapacity(terrain, config);
  const roadLength = plan.roadCorridors.reduce((sum, corridor) => sum + Math.hypot(
    corridor.end.x - corridor.start.x,
    corridor.end.y - corridor.start.y,
  ), 0);
  return {
    usableRatio: capacity.usableRatio,
    estimatedUsableArea: capacity.estimatedUsableArea,
    maximumPracticalDensity: capacity.maximumPracticalDensity,
    cityCapacityPrecheckPass: capacity.maximumPracticalDensity >= 40,
    blockerDensity: plan.blockers.reduce((sum, blocker) => sum + Math.PI * blocker.rx * blocker.ry, 0) / (MAP_WIDTH * MAP_HEIGHT),
    roadClearanceLength: Math.round(roadLength),
    transitionBandCount: plan.transitionBands.length,
    transitionZonePrecheckPass: plan.transitionBands.every(band => band.width <= 96),
  };
}

function validateGeometryArtParity(plan) {
  const base = phase6d.validateGeometryArtParity(plan);
  const errors = [...base.errors, ...validateInheritedEdgeContracts(plan.inheritedEdgeContracts)];
  if (!ROAD_GEOMETRIES.some(item => item.id === plan.roadGeometryId)) errors.push("Unapproved road geometry selected.");
  if (plan.roadModule && plan.roadModule.roadSkin?.themeKey !== plan.theme.key) errors.push("Road visual skin does not match the regional theme.");
  if (plan.publishedEdgeContracts?.immutableAfterPublication !== true) errors.push("Published package edge contract is not immutable.");
  for (const side of SIDES) {
    const contract = plan.publishedEdgeContracts?.sides?.[side];
    if (!contract || contract.socket.tangentOffset !== 0.5 || contract.roadHalfWidth !== 44) {
      errors.push(`${side} immutable edge contract is invalid.`);
    }
  }
  return {
    ...base,
    valid: errors.length === 0,
    errors,
    roadGeometryThemeIndependent: true,
    publishedEdgeContractValid: errors.every(error => !error.includes("edge contract") && !error.includes("published edge")),
  };
}

function assertImmutablePublishedPackage(before, after) {
  const immutableFields = [
    "compositionPlanHash",
    "cityDefinitionsHash",
    "rawPixelHash",
    "webpHash",
    "thumbnailHash",
    "packageHash",
    "edgeContractHash",
  ];
  const differences = immutableFields.filter(field => before[field] !== after[field]);
  return { valid: differences.length === 0, differences, immutableFields };
}

module.exports = Object.freeze({
  ...phase6d,
  GENERATOR_VERSION,
  EDGE_CONTRACT_VERSION,
  MAP_WIDTH,
  MAP_HEIGHT,
  SIDES,
  ROAD_GEOMETRIES,
  createArtworkPlan,
  createRankedArtworkPlans,
  createDefinition,
  estimatePlanFeasibility,
  validateGeometryArtParity,
  buildEdgeContracts,
  validateInheritedEdgeContracts,
  assertImmutablePublishedPackage,
});
