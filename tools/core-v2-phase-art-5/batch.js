"use strict";

const crypto = require("node:crypto");
const phase6f = require("../map-scaling-phase-6f/composer");
const { createDeterministicRandom } = require("../map-scaling-phase-4/generator");
const { placementReason } = require("../core-v2-phase-a/prototype");
const {
  MAP_WIDTH,
  MAP_HEIGHT,
  DELTAS,
  coordinateKey,
  buildCoreSpecification,
  hashObject,
} = require("../core-v2-phase-a/spec");

const BATCH_VERSION = "core-v2-phase-art-5-east-southeast-v1";
const MIN_CITY_SEPARATION = 68;
const PREFERRED_CITY_SEPARATION = 70;
const EDGE_CLEARANCE_X = 142;
const EDGE_CLEARANCE_Y = 132;
const POOL_STEP = 18;
const POOL_JITTER = 6;
const SELECTION_TRIALS = 320;
const NEAR_CENTER_LIMIT = 48;
const EAST_NORTH_TRANSITION_RGB = Object.freeze([142, 159, 132]);
const EAST_CENTER_TRANSITION_RGB = Object.freeze([132, 157, 118]);
const EAST_SOUTH_TRANSITION_RGB = Object.freeze([158, 151, 108]);

const BATCH_COORDINATES = Object.freeze([
  Object.freeze({ gridX: 2, gridY: -1 }),
  Object.freeze({ gridX: 1, gridY: 0 }),
  Object.freeze({ gridX: 2, gridY: 0 }),
  Object.freeze({ gridX: 1, gridY: 1 }),
  Object.freeze({ gridX: 2, gridY: 1 }),
]);

const PROFILE_BY_COORDINATE = Object.freeze({
  "2,-1": Object.freeze({
    key: "east-deed-camp",
    themeKey: "east",
    accentThemeKey: "north",
    variantKey: "b",
    roadGeometryId: "north-v2",
    retrySalt: "core-v2-art5-east-deed-settled-frontier-v1",
    identity: "settled eastern frontier with rich grass, damp soil, a restrained off-center cottage cluster, and a gradual northern transition",
    objectiveArt: "assets/optimized/camp-deed-384x384-a10b2afd6ec4.webp",
    objectiveLabel: "Deed Camp",
    objectiveOffset: Object.freeze({ x: 18, y: -10 }),
    transitionSides: Object.freeze(["north"]),
    transitionFamily: "core-v2-east-north",
    transitionRgb: EAST_NORTH_TRANSITION_RGB,
    edgeThemeOverrides: Object.freeze({ north: "north" }),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["small off-center eastern settlement", "tiny garden and pasture plots", "wagon lane and storage cue", "open verdant city-safe ground"]),
      centralTreatment: "objective-only",
    }),
  }),
  "1,0": Object.freeze({
    key: "swiftgate",
    themeKey: "east",
    accentThemeKey: "west",
    variantKey: "c",
    roadGeometryId: "east-v3",
    retrySalt: "core-v2-art5-swiftgate-movement-corridor-v1",
    identity: "major Crownlands movement corridor with a centered march-speed Stronghold, converging thin wagon roads, and restrained travel wear",
    objectiveArt: "assets/optimized/stronghold-speed-384x384-6d38eb192581.webp",
    objectiveLabel: "Swiftgate",
    objectiveOffset: Object.freeze({ x: 0, y: 0 }),
    transitionSides: Object.freeze(["west"]),
    transitionFamily: "core-v2-east-center",
    transitionRgb: EAST_CENTER_TRANSITION_RGB,
    edgeThemeOverrides: Object.freeze({ west: "west" }),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["restrained waystation trace", "milestone and wagon-wear cue", "hoof-worn feeder paths", "open movement corridor"]),
      centralTreatment: "centered-stronghold-only",
    }),
  }),
  "2,0": Object.freeze({
    key: "east-support",
    themeKey: "east",
    variantKey: "a",
    roadGeometryId: "west-v2",
    retrySalt: "core-v2-art5-east-support-open-verdant-ground-v1",
    identity: "clean productive eastern countryside with rich grass, restrained hedges, damp drainage traces, and maximum 70-city readability",
    objectiveArt: null,
    objectiveLabel: null,
    objectiveOffset: Object.freeze({ x: 0, y: 0 }),
    transitionSides: Object.freeze([]),
    transitionFamily: "core-v2-east",
    transitionRgb: EAST_CENTER_TRANSITION_RGB,
    propPlan: Object.freeze({
      majorClusters: 0,
      mediumClusters: 3,
      cueAssignments: Object.freeze(["verdant field boundary", "subtle wet drainage trace", "small healthy tree group", "open eastern grassland"]),
      centralTreatment: "none",
    }),
  }),
  "1,1": Object.freeze({
    key: "southeast-holding-tower",
    themeKey: "east",
    accentThemeKey: "south",
    variantKey: "b",
    roadGeometryId: "south-v3",
    retrySalt: "core-v2-art5-southeast-tower-contested-transition-v1",
    identity: "contested southeastern strategic ground with mixed verdant and warming terrain, restrained earthworks, and a clear future Tower reservation",
    objectiveArt: null,
    objectiveLabel: "Future Holding Tower reservation",
    objectiveOffset: Object.freeze({ x: 12, y: 12 }),
    transitionSides: Object.freeze(["south", "west"]),
    transitionFamily: "core-v2-east-south",
    transitionRgb: EAST_SOUTH_TRANSITION_RGB,
    edgeThemeOverrides: Object.freeze({ south: "south", west: "south" }),
    propPlan: Object.freeze({
      majorClusters: 0,
      mediumClusters: 3,
      cueAssignments: Object.freeze(["crossing military tracks", "low defensive ditch trace", "broken barricade remnant", "mixed green and dry strategic ground"]),
      centralTreatment: "reservation-clear",
    }),
  }),
  "2,1": Object.freeze({
    key: "east-southeast-relic-camp",
    themeKey: "east",
    accentThemeKey: "south",
    variantKey: "c",
    roadGeometryId: "north-v3",
    retrySalt: "core-v2-art5-east-southeast-relic-mossy-ruins-v1",
    identity: "old sacred eastern territory with mossy weathered stone, damp reclaimed foundations, and a gradual warmer southern transition",
    objectiveArt: "assets/optimized/camp-items-384x384-1d7cc179b5fe.webp",
    objectiveLabel: "Relic Camp",
    objectiveOffset: Object.freeze({ x: 22, y: 15 }),
    transitionSides: Object.freeze(["south", "west"]),
    transitionFamily: "core-v2-east-south",
    transitionRgb: EAST_SOUTH_TRANSITION_RGB,
    edgeThemeOverrides: Object.freeze({ south: "south" }),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["mossy archaeological cluster", "vegetation-reclaimed foundation trace", "ancient worn footpath", "open east-south sacred countryside"]),
      centralTreatment: "objective-only",
    }),
  }),
});

function digest(value, length = 64) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyObjectivePolicy(coreRegion, profile) {
  const region = clone(coreRegion);
  if (region.objective.type === "none") return region;
  region.objective.x = MAP_WIDTH / 2 + profile.objectiveOffset.x;
  region.objective.y = MAP_HEIGHT / 2 + profile.objectiveOffset.y;
  region.objective.placementPolicy = region.mapType === "STRONGHOLD"
    ? "exact_center"
    : region.mapType === "HOLDING_TOWER" ? "near_center_reservation" : "near_center_camp";
  region.objective.offsetFromCenter = { ...profile.objectiveOffset };
  return region;
}

function candidatePool(plan, coreRegion, seedHash) {
  const random = createDeterministicRandom(`${seedHash}|candidate-pool`);
  const candidates = [];
  const rejectedByReason = {};
  const offsetX = random() * POOL_STEP;
  const offsetY = random() * POOL_STEP;
  for (let row = 0, y = EDGE_CLEARANCE_Y + offsetY; y <= MAP_HEIGHT - EDGE_CLEARANCE_Y; row += 1, y += POOL_STEP) {
    const rowShift = row % 2 ? POOL_STEP / 2 : 0;
    for (let x = EDGE_CLEARANCE_X + offsetX + rowShift; x <= MAP_WIDTH - EDGE_CLEARANCE_X; x += POOL_STEP) {
      const point = {
        x: Math.round(x + (random() - 0.5) * POOL_JITTER * 2),
        y: Math.round(y + (random() - 0.5) * POOL_JITTER * 2),
      };
      const reason = placementReason(point, plan, coreRegion);
      if (reason) rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1;
      else candidates.push(point);
    }
  }
  return { candidates, rejectedByReason };
}

function layoutQuality(points) {
  let nearestTotal = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let preferredViolations = 0;
  for (let left = 0; left < points.length; left += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let right = 0; right < points.length; right += 1) {
      if (left === right) continue;
      nearest = Math.min(nearest, Math.hypot(points[left].x - points[right].x, points[left].y - points[right].y));
    }
    nearestTotal += nearest;
    minimum = Math.min(minimum, nearest);
    if (nearest < PREFERRED_CITY_SEPARATION) preferredViolations += 1;
  }
  const quadrants = [0, 0, 0, 0];
  for (const point of points) quadrants[(point.x >= MAP_WIDTH / 2 ? 1 : 0) + (point.y >= MAP_HEIGHT / 2 ? 2 : 0)] += 1;
  const ideal = points.length / 4;
  const imbalance = quadrants.reduce((sum, count) => sum + Math.abs(count - ideal), 0);
  return {
    score: nearestTotal / points.length - imbalance * 1.4 - preferredViolations * 0.08,
    minimum,
    meanNearest: nearestTotal / points.length,
    preferredViolations,
    quadrants,
  };
}

function selectCities(pool, capacity, seedHash) {
  let best = null;
  for (let trial = 0; trial < SELECTION_TRIALS; trial += 1) {
    const random = createDeterministicRandom(digest(`${seedHash}|selection-${trial + 1}`));
    const ranked = pool.map(point => ({ point, order: random() })).sort((a, b) => a.order - b.order);
    const selected = [];
    for (const item of ranked) {
      if (selected.every(point => Math.hypot(point.x - item.point.x, point.y - item.point.y) >= MIN_CITY_SEPARATION)) {
        selected.push(item.point);
        if (selected.length === capacity) break;
      }
    }
    if (selected.length < capacity) continue;
    const quality = layoutQuality(selected);
    if (!best || quality.score > best.quality.score) best = { selected, quality, trial: trial + 1 };
  }
  if (!best) throw new Error(`Could not place exactly ${capacity} ART-5 Core cities after ${SELECTION_TRIALS} deterministic trials.`);
  return best;
}

function buildCities(coreRegion, plan, profile) {
  const seedMaterial = [BATCH_VERSION, coreRegion.regionId, coreRegion.coordinate.gridX, coreRegion.coordinate.gridY, profile.retrySalt].join("|");
  const seedHash = digest(seedMaterial);
  const pool = candidatePool(plan, coreRegion, seedHash);
  const selection = selectCities(pool.candidates, coreRegion.exactCityCapacity, seedHash);
  const cities = selection.selected.map(point => {
    const id = `core_${digest(`${coreRegion.regionId}|${BATCH_VERSION}|${seedHash}|${point.x}|${point.y}`, 18)}`;
    return {
      id,
      name: `Core ${id.slice(-6).toUpperCase()}`,
      regionId: coreRegion.regionId,
      x: point.x,
      y: point.y,
      xNorm: Math.round(point.x / MAP_WIDTH * 1e6) / 1e6,
      yNorm: Math.round(point.y / MAP_HEIGHT * 1e6) / 1e6,
      owner: "neutral",
      ownerKind: "neutral",
      level: 1,
      prototypeOnly: true,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  return {
    cities,
    metrics: {
      generator: "hand-directed-deterministic-safe-coordinate-plan-art5-v1",
      seedHash,
      minimumCitySeparation: MIN_CITY_SEPARATION,
      preferredCitySeparation: PREFERRED_CITY_SEPARATION,
      candidatePoolSize: pool.candidates.length,
      rejectedByReason: pool.rejectedByReason,
      selectedTrial: selection.trial,
      selectionTrialLimit: SELECTION_TRIALS,
      minimumObservedSpacing: Math.round(selection.quality.minimum * 1000) / 1000,
      meanNearestNeighbor: Math.round(selection.quality.meanNearest * 1000) / 1000,
      preferredSpacingViolations: selection.quality.preferredViolations,
      quadrantCounts: selection.quality.quadrants,
    },
  };
}

function assetIndex(manifest) {
  return new Map(manifest.assets.map(asset => [asset.assetId, asset]));
}

function rebuildVisualComposition(plan, manifest) {
  const byId = assetIndex(manifest);
  plan.visualComposition = [
    { id: "foundation", assetId: plan.foundation.assetId, category: "foundation", geometryRef: "land-polygon", drawOrder: 0 },
    ...plan.barriers.map((item, index) => ({ ...item, id: `barrier-${index + 1}`, category: "perimeter_barrier", drawOrder: 10 })),
    ...plan.roads.map((item, index) => ({
      ...item,
      id: item.id || `road-${index + 1}`,
      category: byId.get(item.assetId)?.category === "internal_road_module" ? "internal_road_module" : "road_opening",
      drawOrder: 20 + index,
    })),
    ...plan.accents.map((item, index) => ({ ...item, category: "interior_accent", drawOrder: 40 + index })),
  ];
}

function replaceAccentsForTransition(plan, allocation, profile, manifest) {
  if (!profile.accentThemeKey || profile.accentThemeKey === profile.themeKey) return;
  const accentPlan = phase6f.createArtworkPlan({
    allocation,
    themeKey: profile.accentThemeKey,
    variantKey: profile.variantKey,
    retrySalt: `${profile.retrySalt}|transition-accents`,
    roadGeometryId: `${profile.accentThemeKey}-v2`,
    manifest,
  });
  plan.accents = accentPlan.accents;
  plan.blockers = accentPlan.blockers;
  plan.handcraftedClimateBlend = {
    strategy: "approved-foundation-with-approved-transition-accents-v1",
    foundationTheme: profile.themeKey,
    accentTheme: profile.accentThemeKey,
    createsNewModularArtwork: false,
    preservesDecorationCount: true,
  };
}

function applySharedEdgeTreatments(plan, allocation, profile, manifest) {
  const overrides = profile.edgeThemeOverrides || {};
  if (!Object.keys(overrides).length) return;
  const byId = assetIndex(manifest);
  const edgeReceipts = [];
  for (const [side, edgeTheme] of Object.entries(overrides)) {
    const reference = phase6f.createArtworkPlan({
      allocation,
      themeKey: edgeTheme,
      variantKey: profile.variantKey,
      retrySalt: `${profile.retrySalt}|shared-${side}-${edgeTheme}-edge`,
      roadGeometryId: profile.roadGeometryId,
      manifest,
    });
    const isSideAsset = item => byId.get(item.assetId)?.side === side;
    const replacementBarriers = reference.barriers.filter(isSideAsset);
    const replacementOpenings = reference.roads.filter(item => byId.get(item.assetId)?.category === "road_opening" && isSideAsset(item));
    if (!replacementBarriers.length || replacementOpenings.length !== 1) {
      throw new Error(`Could not build the approved ${edgeTheme} shared treatment for ${profile.key}:${side}.`);
    }
    plan.barriers = [...plan.barriers.filter(item => !isSideAsset(item)), ...replacementBarriers];
    plan.roads = [
      ...plan.roads.filter(item => !(byId.get(item.assetId)?.category === "road_opening" && isSideAsset(item))),
      ...replacementOpenings,
    ];
    edgeReceipts.push({
      side,
      edgeTheme,
      barrierAssetIds: replacementBarriers.map(item => item.assetId),
      roadOpeningAssetId: replacementOpenings[0].assetId,
      createsNewModularArtwork: false,
      publishedSocketGeometryChanged: false,
    });
  }
  plan.handcraftedSharedEdgeTreatments = { strategy: "neighbor-compatible-approved-edge-assets-v1", width: 96, treatments: edgeReceipts };
}

function buildTransitionBands(plan, profile) {
  const oppositeTheme = profile.accentThemeKey || "west";
  plan.transitionBands = [
    ...plan.transitionBands,
    ...profile.transitionSides.map(side => ({
      side,
      fromTheme: profile.themeKey,
      toTheme: oppositeTheme,
      family: profile.transitionFamily,
      width: 96,
      maximumStrength: 0.24,
      targetRgb: profile.transitionRgb,
      deterministic: true,
      narrowEdgeOnly: true,
      sharedCoreEdgeBlend: true,
    })),
  ];
}

function objectivePlacementValidation(coreRegion) {
  const objective = coreRegion.objective;
  if (objective.type === "none") return { valid: true, policy: "not_applicable", offset: 0 };
  const offset = Math.hypot(objective.x - MAP_WIDTH / 2, objective.y - MAP_HEIGHT / 2);
  if (coreRegion.mapType === "STRONGHOLD") return { valid: offset === 0, policy: "exact_center", offset };
  if (["DEED_CAMP", "GOLD_CAMP", "RELIC_CAMP", "WARBAND_CAMP", "HOLDING_TOWER"].includes(coreRegion.mapType)) {
    return { valid: offset <= NEAR_CENTER_LIMIT, policy: coreRegion.mapType === "HOLDING_TOWER" ? "near_center_reservation" : "near_center_camp", offset };
  }
  return { valid: true, policy: "not_applicable", offset };
}

function validatePrototype(coreRegion, plan, cityResult, profile) {
  const errors = [];
  if (cityResult.cities.length !== coreRegion.exactCityCapacity) errors.push("Exact city capacity failed.");
  if (new Set(cityResult.cities.map(city => city.id)).size !== cityResult.cities.length) errors.push("Duplicate city IDs detected.");
  for (const city of cityResult.cities) {
    const reason = placementReason(city, plan, coreRegion);
    if (reason) errors.push(`${city.id}: ${reason}`);
  }
  let minimumSpacing = Number.POSITIVE_INFINITY;
  for (let left = 0; left < cityResult.cities.length; left += 1) {
    for (let right = left + 1; right < cityResult.cities.length; right += 1) {
      minimumSpacing = Math.min(minimumSpacing, Math.hypot(cityResult.cities[left].x - cityResult.cities[right].x, cityResult.cities[left].y - cityResult.cities[right].y));
    }
  }
  if (minimumSpacing < MIN_CITY_SEPARATION) errors.push(`Minimum city spacing ${minimumSpacing} is below ${MIN_CITY_SEPARATION}.`);
  const objectivePlacement = objectivePlacementValidation(coreRegion);
  if (!objectivePlacement.valid) errors.push(`Objective placement failed ${objectivePlacement.policy}.`);
  const parity = phase6f.validateGeometryArtParity(plan);
  if (!parity.valid) errors.push(...parity.errors);
  const props = profile.propPlan;
  const propRuleCompliant = props.majorClusters <= 1
    && props.mediumClusters <= (props.majorClusters ? 2 : 3)
    && plan.accents.length <= 4
    && ["none", "objective-only", "reservation-clear", "centered-stronghold-only"].includes(props.centralTreatment);
  if (!propRuleCompliant) errors.push("Objective prop rulebook failed.");
  const roadSides = new Set(plan.roadSystem.edgeRoads.map(road => road.side));
  if (roadSides.size !== 4 || !["north", "east", "south", "west"].every(side => roadSides.has(side))) errors.push("Exactly one road geometry per cardinal side is required.");
  const specification = buildCoreSpecification();
  for (const [side, connection] of Object.entries(coreRegion.topology.connections)) {
    if (connection.state !== "OPEN") continue;
    const delta = DELTAS[side];
    const target = specification.regions.find(region => region.regionId === connection.regionId);
    if (!target || target.coordinate.gridX !== coreRegion.coordinate.gridX + delta.x || target.coordinate.gridY !== coreRegion.coordinate.gridY + delta.y) errors.push(`${side} topology target is invalid.`);
  }
  return {
    valid: errors.length === 0,
    errors,
    exactCapacity: cityResult.cities.length,
    expectedCapacity: coreRegion.exactCityCapacity,
    minimumSpacing: Math.round(minimumSpacing * 1000) / 1000,
    preferredSpacingViolations: cityResult.metrics.preferredSpacingViolations,
    cityObjectiveConflicts: errors.filter(error => error.includes("objective_clearance")).length,
    cityBlockerConflicts: errors.filter(error => error.includes("terrain_blocker")).length,
    cityRoadConflicts: errors.filter(error => error.includes("road_clearance")).length,
    cityTransitionConflicts: errors.filter(error => error.includes("transition_clearance")).length,
    objectivePlacement,
    propRuleCompliant,
    geometryArtParity: parity,
  };
}

function buildPrototype(coreRegion, manifest = phase6f.loadAssetManifest()) {
  const key = coordinateKey(coreRegion.coordinate.gridX, coreRegion.coordinate.gridY);
  const profile = PROFILE_BY_COORDINATE[key];
  if (!profile) throw new Error(`Coordinate ${key} is not approved for Core v2 Phase ART-5.`);
  const adjustedRegion = applyObjectivePolicy(coreRegion, profile);
  const allocation = {
    worldId: "core-v2-development",
    seasonId: "core-v2-phase-art-5",
    regionId: adjustedRegion.regionId,
    coordinate: { ...adjustedRegion.coordinate, clockwiseOrderIndex: -1 },
  };
  const plan = phase6f.createArtworkPlan({
    allocation,
    themeKey: profile.themeKey,
    variantKey: profile.variantKey,
    retrySalt: profile.retrySalt,
    roadGeometryId: profile.roadGeometryId,
    manifest,
  });
  replaceAccentsForTransition(plan, allocation, profile, manifest);
  applySharedEdgeTreatments(plan, allocation, profile, manifest);
  buildTransitionBands(plan, profile);
  rebuildVisualComposition(plan, manifest);
  plan.phase = "Core v2 Phase ART-5";
  plan.generatorVersion = BATCH_VERSION;
  plan.purpose = "permanent_core_handcrafted_final_art_batch_5";
  plan.permanentCore = true;
  plan.spawnEligible = false;
  plan.runtimeNpcSpawnThresholdApplies = false;
  plan.developmentOnly = true;
  plan.productionActivated = false;
  plan.publicationAllowed = false;
  plan.handcraftedProfile = profile;
  plan.objectivePropPlan = profile.propPlan;
  plan.coreRegion = {
    regionId: adjustedRegion.regionId,
    name: adjustedRegion.name,
    coordinate: adjustedRegion.coordinate,
    mapType: adjustedRegion.mapType,
    exactCityCapacity: adjustedRegion.exactCityCapacity,
    climate: adjustedRegion.climate,
    objective: adjustedRegion.objective,
    topology: adjustedRegion.topology,
  };
  plan.planHash = hashObject({ ...plan, planHash: undefined });
  const cityResult = buildCities(adjustedRegion, plan, profile);
  const validation = validatePrototype(adjustedRegion, plan, cityResult, profile);
  const receipt = {
    schemaVersion: 1,
    batchVersion: BATCH_VERSION,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    regionId: adjustedRegion.regionId,
    coordinate: adjustedRegion.coordinate,
    mapType: adjustedRegion.mapType,
    exactCityCapacity: adjustedRegion.exactCityCapacity,
    profile,
    cityPlanHash: hashObject(cityResult.cities),
    compositionPlanHash: plan.planHash,
    validation,
    metrics: cityResult.metrics,
  };
  receipt.receiptHash = hashObject({ ...receipt, receiptHash: undefined });
  return { coreRegion: adjustedRegion, profile, plan, cities: cityResult.cities, receipt };
}

function buildBatch() {
  const specification = buildCoreSpecification();
  const byCoordinate = new Map(specification.regions.map(region => [coordinateKey(region.coordinate.gridX, region.coordinate.gridY), region]));
  const manifest = phase6f.loadAssetManifest();
  return BATCH_COORDINATES.map(coordinate => buildPrototype(byCoordinate.get(coordinateKey(coordinate.gridX, coordinate.gridY)), manifest));
}

module.exports = Object.freeze({
  BATCH_VERSION,
  BATCH_COORDINATES,
  PROFILE_BY_COORDINATE,
  MIN_CITY_SEPARATION,
  PREFERRED_CITY_SEPARATION,
  NEAR_CENTER_LIMIT,
  buildPrototype,
  buildBatch,
  objectivePlacementValidation,
});
