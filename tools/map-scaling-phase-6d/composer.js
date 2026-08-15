"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const phase6b = require("../map-scaling-phase-6b/composer");
const {
  DEFAULT_GENERATOR_CONFIG,
  createDeterministicRandom,
  estimateUsableCapacity,
  hashObject,
  normalizeConfig,
  normalizeTerrainDefinition,
} = require("../map-scaling-phase-4/generator");

const ROOT = phase6b.ROOT;
const ASSET_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6d", "asset-library");
const MANIFEST_PATH = path.join(ASSET_ROOT, "asset-manifest.json");
const GENERATOR_VERSION = "phase6d-macro-variation-composer-v1";
const MAP_WIDTH = 1448;
const MAP_HEIGHT = 1086;
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const THEMES = Object.freeze(["west", "north", "east", "south"]);
const FOUNDATION_TRANSFORMS = Object.freeze(["none", "flip_horizontal", "flip_vertical", "rotate_180"]);
const MACRO_CANDIDATE_COUNT = 6;

const THEME_RGB = Object.freeze({
  west: Object.freeze([132, 127, 58]),
  north: Object.freeze([169, 156, 126]),
  east: Object.freeze([122, 128, 47]),
  south: Object.freeze([159, 125, 62]),
});

function loadAssetManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) throw new Error("Missing Phase 6D 118-asset manifest. Run build_asset_library.py first.");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assert.equal(manifest.assetCount, 118, "Phase 6D requires exactly 118 reusable assets.");
  return manifest;
}

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

function macroSeed(allocation, themeKey, retrySalt, candidateIndex) {
  const material = [
    allocation.worldId,
    allocation.seasonId,
    allocation.regionId,
    allocation.coordinate.gridX,
    allocation.coordinate.gridY,
    GENERATOR_VERSION,
    "phase6d-macro-variation-v1",
    themeKey,
    retrySalt,
    candidateIndex,
  ].join("|");
  return {
    strategy: "sha256(world|season|region|coordinate|generator|library|theme|retrySalt|macroCandidate)",
    materialHash: crypto.createHash("sha256").update(material).digest("hex"),
    retrySalt,
    candidateIndex,
  };
}

function select(items, random) {
  return items[Math.floor(random() * items.length) % items.length];
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
  // City exclusion is intentionally limited to the critical edge approach.
  // The generator already reserves the same four future exit corridors at
  // 58px half-width; the varied interior route is a visual/access guide that
  // may legitimately run to a city and must not double-block map capacity.
  return edgeRoads.map(road => ({
    id: `${road.id}-critical-edge-corridor`,
    side: road.side,
    start: road.points[0],
    end: road.points[1],
    halfWidth: road.halfWidth,
  }));
}

function transitionBands(themeKey, neighborThemes = {}) {
  const result = [];
  for (const side of SIDES) {
    const neighborTheme = neighborThemes[side];
    if (!neighborTheme || neighborTheme === themeKey) continue;
    const family = [themeKey, neighborTheme].sort().join("-");
    if (family !== "east-north" && family !== "north-west") continue;
    const targetRgb = THEME_RGB[themeKey].map((value, index) => Math.round((value + THEME_RGB[neighborTheme][index]) / 2));
    result.push({
      side,
      fromTheme: themeKey,
      toTheme: neighborTheme,
      family,
      width: 96,
      maximumStrength: 0.24,
      targetRgb,
      deterministic: true,
      narrowEdgeOnly: true,
    });
  }
  return result;
}

function chooseBarriers(basePlan, themeKey, byId, random) {
  const grouped = Object.fromEntries(SIDES.map(side => [side, basePlan.barriers.filter(item => (
    byId.get(item.assetId)?.side === side
  ))]));
  const decisions = {};
  const barriers = [];
  for (const side of SIDES) {
    const useAlternate = random() >= 0.5;
    decisions[side] = useAlternate ? "alternate" : "base-pair";
    if (useAlternate) {
      const alternate = byId.get(`barrier-alt.${themeKey}.${side}`);
      assert(alternate, `Missing alternate ${themeKey} ${side} perimeter module.`);
      barriers.push(placement(alternate));
    } else {
      barriers.push(...grouped[side]);
    }
  }
  return { barriers, decisions };
}

function createArtworkPlan({
  allocation,
  themeKey,
  variantKey = "a",
  retrySalt = "default",
  candidateIndex = 0,
  neighborThemes = {},
  manifest = loadAssetManifest(),
}) {
  if (!THEMES.includes(themeKey)) throw new Error(`Unknown Phase 6D theme ${themeKey}.`);
  const byId = assetMap(manifest);
  const seed = macroSeed(allocation, themeKey, retrySalt, candidateIndex);
  const random = createDeterministicRandom(seed.materialHash);
  const basePlan = phase6b.createArtworkPlan({
    allocation,
    themeKey,
    variantKey,
    retrySalt: `${retrySalt}|macro-${candidateIndex}`,
    manifest,
  });
  const foundationAsset = select([
    byId.get(`foundation.${themeKey}`),
    byId.get(`foundation.${themeKey}.v2`),
    byId.get(`foundation.${themeKey}.v3`),
  ], random);
  assert(foundationAsset, `Missing one of three ${themeKey} foundations.`);
  const foundation = placement(foundationAsset, { transform: select(FOUNDATION_TRANSFORMS, random) });
  const foundationToneProfile = {
    strategy: "broad-linear-terrain-tone-v1",
    angleDegrees: Math.floor(random() * 24) * 15,
    strength: Math.round((0.038 + random() * 0.032) * 10000) / 10000,
    phase: Math.round((random() * 1.4 - 0.7) * 1000) / 1000,
    warmth: Math.round((random() * 0.028 - 0.014) * 10000) / 10000,
    lowFrequencyOnly: true,
    changesDecorationDensity: false,
  };
  const selectedBarriers = chooseBarriers(basePlan, themeKey, byId, random);
  const accents = basePlan.accents.map(item => ({
    ...item,
    harmonizeToFoundation: true,
    isolateAccentDetails: true,
  }));
  // Six macro candidates always cover every road family twice.  This avoids a
  // random candidate pool accidentally omitting the feasible legacy socket
  // plan while still allowing the deterministic priority to select any family.
  const roadFamily = ["base", "v2", "v3"][candidateIndex % 3];
  const roadSockets = basePlan.roads.map(item => ({ ...item, harmonizeToFoundation: true }));
  let roads = roadSockets;
  let roadModule = null;
  let edgeRoads = basePlan.roadSystem.edgeRoads;
  if (roadFamily !== "base") {
    const module = byId.get(`road-plan.${themeKey}.${roadFamily}`);
    assert(module, `Missing ${themeKey} ${roadFamily} internal-road module.`);
    roads = roadSockets.map(road => roadSocketPlacement(road, byId.get(road.assetId).side));
    roadModule = placement(module, { id: `internal-road-${roadFamily}`, geometryRef: `road-plan-${roadFamily}` });
    roads.push(roadModule);
    edgeRoads = module.roadPaths;
  }
  const bands = transitionBands(themeKey, neighborThemes);
  const plan = {
    ...basePlan,
    generatorVersion: GENERATOR_VERSION,
    assetLibraryVersion: manifest.assetLibraryVersion,
    phase: "6D",
    seed,
    macroCandidateIndex: candidateIndex,
    foundation,
    foundationToneProfile,
    barriers: selectedBarriers.barriers,
    barrierDecisions: selectedBarriers.decisions,
    roadFamily,
    roadModule,
    roads,
    accents,
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
    transitionBands: bands,
    visualComposition: [
      { id: "foundation", assetId: foundation.assetId, category: "foundation", geometryRef: "land-polygon", drawOrder: 0 },
      ...selectedBarriers.barriers.map((item, index) => ({ ...item, id: `barrier-${index + 1}`, category: "perimeter_barrier", drawOrder: 10 })),
      ...roads.map((item, index) => ({ ...item, id: item.id || `road-${index + 1}`, category: item === roadModule ? "internal_road_module" : "road_opening", drawOrder: 20 + index })),
      ...accents.map((item, index) => ({ ...item, category: "interior_accent", drawOrder: 40 + index })),
    ],
    gateSupport: { ...basePlan.gateSupport, transitionBandsRuntimeStateIndependent: true },
  };
  plan.planHash = hashObject({ ...plan, planHash: undefined });
  return plan;
}

function createDefinition(allocation, plan) {
  return {
    id: allocation.regionId,
    name: `Phase 6D ${plan.theme.label} ${plan.roadFamily}`,
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

function createRankedArtworkPlans(options) {
  const plans = Array.from({ length: MACRO_CANDIDATE_COUNT }, (_, candidateIndex) => {
    const plan = createArtworkPlan({ ...options, candidateIndex });
    plan.feasibility = estimatePlanFeasibility(options.allocation, plan);
    plan.feasibility.priorityHash = hashObject({
      regionId: options.allocation.regionId,
      coordinate: options.allocation.coordinate,
      candidateIndex: plan.macroCandidateIndex,
      phase: "6D-feasible-macro-priority",
    });
    return plan;
  });
  plans.sort((left, right) => (
    Number(right.feasibility.cityCapacityPrecheckPass) - Number(left.feasibility.cityCapacityPrecheckPass)
    || left.feasibility.priorityHash.localeCompare(right.feasibility.priorityHash)
    || right.feasibility.maximumPracticalDensity - left.feasibility.maximumPracticalDensity
    || left.planHash.localeCompare(right.planHash)
  ));
  return plans;
}

function validateGeometryArtParity(plan) {
  const errors = [];
  const sideCoverage = Object.fromEntries(SIDES.map(side => [side, 0]));
  const manifest = loadAssetManifest();
  const byId = assetMap(manifest);
  for (const barrier of plan.barriers) {
    const asset = byId.get(barrier.assetId);
    if (!asset?.side) errors.push(`${barrier.assetId} has no side metadata.`);
    else sideCoverage[asset.side] += 1;
    if (!(barrier.x === 0 || barrier.y === 0 || barrier.x + barrier.width === MAP_WIDTH || barrier.y + barrier.height === MAP_HEIGHT)) {
      errors.push(`${barrier.assetId} does not touch the literal image edge.`);
    }
  }
  for (const side of SIDES) if (sideCoverage[side] < 1) errors.push(`${side} has no perimeter coverage.`);
  const edgeExitCounts = Object.fromEntries(SIDES.map(side => [side, 0]));
  for (const road of plan.roadSystem.edgeRoads) {
    edgeExitCounts[road.side] += 1;
    const point = road.points[0];
    const valid = road.side === "north" ? point.x === 724 && point.y === 0
      : road.side === "east" ? point.x === 1448 && point.y === 543
        : road.side === "south" ? point.x === 724 && point.y === 1086
          : point.x === 0 && point.y === 543;
    if (!valid) errors.push(`${road.side} road drifted from its approved socket.`);
  }
  for (const side of SIDES) if (edgeExitCounts[side] !== 1) errors.push(`Expected one ${side} exit, found ${edgeExitCounts[side]}.`);
  if (plan.accents.length !== 4) errors.push("Approved restrained density requires exactly four interior accents.");
  if (plan.transitionBands.some(band => band.width > 96 || band.maximumStrength > 0.24)) errors.push("A transition band exceeded the locked narrow/subtle limits.");
  if (/city|camp|stronghold|citadel|arrow|label|ui/i.test(JSON.stringify(plan.visualComposition))) errors.push("Runtime object art leaked into the composition.");
  return {
    valid: errors.length === 0,
    errors,
    blockerPairs: plan.blockers.length,
    roadPairs: plan.roadSystem.edgeRoads.length,
    edgeExitCounts,
    barrierSegmentsTouchingBoundary: plan.barriers.length,
    perimeterSideCoverage: sideCoverage,
    roadSocketAligned: errors.every(error => !error.includes("road drifted") && !error.includes("Expected one")),
    transitionBandCount: plan.transitionBands.length,
  };
}

module.exports = Object.freeze({
  ROOT,
  ASSET_ROOT,
  MANIFEST_PATH,
  GENERATOR_VERSION,
  MAP_WIDTH,
  MAP_HEIGHT,
  SIDES,
  THEMES,
  MACRO_CANDIDATE_COUNT,
  loadAssetManifest,
  createArtworkPlan,
  createRankedArtworkPlans,
  createDefinition,
  estimatePlanFeasibility,
  validateGeometryArtParity,
});
