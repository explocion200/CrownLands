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

const BATCH_VERSION = "core-v2-phase-b1-west-northwest-v1";
const MIN_CITY_SEPARATION = 68;
const PREFERRED_CITY_SEPARATION = 70;
const EDGE_CLEARANCE_X = 142;
const EDGE_CLEARANCE_Y = 132;
const POOL_STEP = 18;
const POOL_JITTER = 6;
const SELECTION_TRIALS = 256;
const NEAR_CENTER_LIMIT = 48;
const WEST_NORTH_TRANSITION_RGB = Object.freeze([154, 158, 132]);

const BATCH_COORDINATES = Object.freeze([
  Object.freeze({ gridX: -2, gridY: -2 }),
  Object.freeze({ gridX: -1, gridY: -2 }),
  Object.freeze({ gridX: -2, gridY: -1 }),
  Object.freeze({ gridX: -1, gridY: -1 }),
  Object.freeze({ gridX: -1, gridY: 0 }),
]);

const PROFILE_BY_COORDINATE = Object.freeze({
  "-2,-2": Object.freeze({
    key: "northwest-warband-camp",
    themeKey: "north",
    variantKey: "a",
    roadGeometryId: "north-v3",
    retrySalt: "core-v2-b1-warband-cold-churned-frontier-v1",
    identity: "light-winter battlefield frontier with pale trampled ground and restrained military traces",
    objectiveArt: "assets/optimized/camp-troops-384x384-2f712333e891.webp",
    objectiveLabel: "Warband Camp",
    objectiveOffset: Object.freeze({ x: -24, y: -8 }),
    transitionSides: Object.freeze(["south"]),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["churned winter ground", "broken barricade trace", "sparse damaged field edge", "winter vegetation"]),
      centralTreatment: "objective-only",
    }),
  }),
  "-1,-2": Object.freeze({
    key: "northwest-relic-camp",
    themeKey: "north",
    variantKey: "b",
    roadGeometryId: "east-v2",
    retrySalt: "core-v2-b1-northern-relic-weathered-stones-v1",
    identity: "frost-worn sacred territory with small old-stone and archaeological cues",
    objectiveArt: "assets/optimized/camp-items-384x384-1d7cc179b5fe.webp",
    objectiveLabel: "Relic Camp",
    objectiveOffset: Object.freeze({ x: 18, y: -17 }),
    transitionSides: Object.freeze(["south"]),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["weathered stone remnant", "frost-worn foundation", "restrained burial mound", "sparse winter vegetation"]),
      centralTreatment: "objective-only",
    }),
  }),
  "-2,-1": Object.freeze({
    key: "west-north-relic-camp",
    themeKey: "west",
    accentThemeKey: "north",
    variantKey: "a",
    roadGeometryId: "west-v2",
    retrySalt: "core-v2-b1-transitional-relic-grass-and-stone-v1",
    identity: "grassier western Relic territory with cool northern stone and restrained sacred ruins",
    objectiveArt: "assets/optimized/camp-items-384x384-1d7cc179b5fe.webp",
    objectiveLabel: "Relic Camp",
    objectiveOffset: Object.freeze({ x: -18, y: 13 }),
    transitionSides: Object.freeze(["north", "south", "east"]),
    edgeThemeOverrides: Object.freeze({ north: "north" }),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["western sacred-stone cluster", "old countryside foundation", "cool rock trace", "restrained grassland"]),
      centralTreatment: "objective-only",
    }),
  }),
  "-1,-1": Object.freeze({
    key: "northwest-holding-tower",
    themeKey: "north",
    accentThemeKey: "west",
    variantKey: "a",
    roadGeometryId: "north-v2",
    retrySalt: "core-v2-b1-tower-contested-cold-frontier-v1",
    identity: "contested west-north military frontier with an open future Holding Tower reserve",
    objectiveArt: null,
    objectiveLabel: "Future Holding Tower reservation",
    objectiveOffset: Object.freeze({ x: 12, y: 9 }),
    transitionSides: Object.freeze(["west", "south"]),
    edgeThemeOverrides: Object.freeze({ west: "west", south: "west" }),
    propPlan: Object.freeze({
      majorClusters: 0,
      mediumClusters: 3,
      cueAssignments: Object.freeze(["scarred field trace", "low defensive earthwork", "old barricade trace", "open military road ground"]),
      centralTreatment: "reservation-clear",
    }),
  }),
  "-1,0": Object.freeze({
    key: "aurum-keep",
    themeKey: "west",
    variantKey: "b",
    roadGeometryId: "east-v3",
    retrySalt: "core-v2-b1-aurum-productive-western-estate-v1",
    identity: "prosperous western productive territory with restrained managed fields and estate cues",
    objectiveArt: "assets/optimized/stronghold-gold-384x384-27daf74041f8.webp",
    objectiveLabel: "Aurum Keep",
    objectiveOffset: Object.freeze({ x: 0, y: 0 }),
    transitionSides: Object.freeze([]),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["managed farmland", "small orchard/estate cue", "supply ground", "open rich grassland"]),
      centralTreatment: "centered-stronghold-only",
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
  if (!best) throw new Error(`Could not place exactly ${capacity} B1 Core cities after ${SELECTION_TRIALS} deterministic trials.`);
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
      generator: "hand-directed-deterministic-safe-coordinate-plan-b1-v1",
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
  plan.visualComposition = [
    ...plan.visualComposition.filter(item => item.category !== "interior_accent"),
    ...plan.accents.map((item, index) => ({ ...item, category: "interior_accent", drawOrder: 40 + index })),
  ];
  plan.handcraftedClimateBlend = {
    strategy: "approved-foundation-with-approved-transition-accents-v1",
    foundationTheme: profile.themeKey,
    accentTheme: profile.accentThemeKey,
    createsNewArtwork: false,
    preservesDecorationCount: true,
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
    const replacementOpenings = reference.roads.filter(item => (
      byId.get(item.assetId)?.category === "road_opening" && isSideAsset(item)
    ));
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
      createsNewArtwork: false,
      publishedSocketGeometryChanged: false,
    });
  }
  plan.handcraftedSharedEdgeTreatments = {
    strategy: "neighbor-compatible-approved-edge-assets-v1",
    width: 96,
    treatments: edgeReceipts,
  };
}

function buildTransitionBands(plan, profile) {
  const oppositeTheme = profile.accentThemeKey || (profile.themeKey === "north" ? "west" : "north");
  plan.transitionBands = [
    ...plan.transitionBands,
    ...profile.transitionSides.map(side => ({
      side,
      fromTheme: profile.themeKey,
      toTheme: oppositeTheme,
      family: "core-v2-west-north",
      width: 96,
      maximumStrength: 0.24,
      targetRgb: WEST_NORTH_TRANSITION_RGB,
      deterministic: true,
      narrowEdgeOnly: true,
      sharedCoreEdgeBlend: true,
    })),
  ];
}

function objectivePlacementValidation(coreRegion) {
  const objective = coreRegion.objective;
  const offset = Math.hypot(objective.x - MAP_WIDTH / 2, objective.y - MAP_HEIGHT / 2);
  if (coreRegion.mapType === "STRONGHOLD") return { valid: offset === 0, policy: "exact_center", offset };
  if (["WARBAND_CAMP", "RELIC_CAMP", "HOLDING_TOWER"].includes(coreRegion.mapType)) {
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
      minimumSpacing = Math.min(minimumSpacing, Math.hypot(
        cityResult.cities[left].x - cityResult.cities[right].x,
        cityResult.cities[left].y - cityResult.cities[right].y,
      ));
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
    && ["objective-only", "reservation-clear", "centered-stronghold-only"].includes(props.centralTreatment);
  if (!propRuleCompliant) errors.push("Objective prop rulebook failed.");
  const roadSides = new Set(plan.roadSystem.edgeRoads.map(road => road.side));
  if (roadSides.size !== 4 || !["north", "east", "south", "west"].every(side => roadSides.has(side))) {
    errors.push("Exactly one road geometry per cardinal side is required.");
  }
  for (const [side, connection] of Object.entries(coreRegion.topology.connections)) {
    if (connection.state === "OPEN") {
      const delta = DELTAS[side];
      const target = buildCoreSpecification().regions.find(region => region.regionId === connection.regionId);
      if (!target || target.coordinate.gridX !== coreRegion.coordinate.gridX + delta.x
        || target.coordinate.gridY !== coreRegion.coordinate.gridY + delta.y) errors.push(`${side} topology target is invalid.`);
    }
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
  if (!profile) throw new Error(`Coordinate ${key} is not approved for Core v2 Phase B1.`);
  const adjustedRegion = applyObjectivePolicy(coreRegion, profile);
  const allocation = {
    worldId: "core-v2-development",
    seasonId: "core-v2-phase-b1",
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
  plan.phase = "Core v2 Phase B1";
  plan.generatorVersion = BATCH_VERSION;
  plan.purpose = "permanent_core_handcrafted_batch_1";
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
