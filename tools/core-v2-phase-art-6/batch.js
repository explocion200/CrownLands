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

const BATCH_VERSION = "core-v2-phase-art-6-final-south-v1";
const MIN_CITY_SEPARATION = 68;
const PREFERRED_CITY_SEPARATION = 70;
const EDGE_CLEARANCE_X = 142;
const EDGE_CLEARANCE_Y = 132;
const POOL_STEP = 18;
const POOL_JITTER = 6;
const SELECTION_TRIALS = 360;
const NEAR_CENTER_LIMIT = 48;
const SOUTH_WEST_TRANSITION_RGB = Object.freeze([161, 145, 102]);
const SOUTH_CENTER_RGB = Object.freeze([174, 148, 94]);
const SOUTH_EAST_TRANSITION_RGB = Object.freeze([156, 151, 102]);

const BATCH_COORDINATES = Object.freeze([
  Object.freeze({ gridX: -2, gridY: 2 }),
  Object.freeze({ gridX: -1, gridY: 2 }),
  Object.freeze({ gridX: 0, gridY: 2 }),
  Object.freeze({ gridX: 1, gridY: 2 }),
  Object.freeze({ gridX: 2, gridY: 2 }),
]);

const PROFILE_BY_COORDINATE = Object.freeze({
  "-2,2": Object.freeze({
    key: "southwest-gold-camp",
    themeKey: "south",
    accentThemeKey: "west",
    variantKey: "b",
    roadGeometryId: "south-v2",
    retrySalt: "core-v2-art6-southwest-gold-dry-resource-frontier-v1",
    identity: "dry southwestern mining frontier with restrained edge-biased mine workings, western grass influence, and an open city-safe interior",
    objectiveArt: "assets/optimized/camp-gold-384x384-1d2f43c018ae.webp",
    objectiveLabel: "Gold Camp",
    objectiveOffset: Object.freeze({ x: -18, y: 12 }),
    transitionSides: Object.freeze(["north", "west"]),
    transitionFamily: "core-v2-south-west",
    transitionRgb: SOUTH_WEST_TRANSITION_RGB,
    edgeThemeOverrides: Object.freeze({ north: "south", west: "west" }),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["edge-biased mine entrances", "dry spoil and ore-cart trace", "dusty worker paths", "open western-southern city ground"]),
      centralTreatment: "objective-only",
    }),
  }),
  "-1,2": Object.freeze({
    key: "south-deed-camp",
    themeKey: "south",
    accentThemeKey: "west",
    variantKey: "c",
    roadGeometryId: "west-v3",
    retrySalt: "core-v2-art6-south-deed-warm-settled-frontier-v1",
    identity: "warm settled southern frontier with a restrained off-center Crownlands cottage cluster, dry farm traces, and open city-safe terrain",
    objectiveArt: "assets/optimized/camp-deed-384x384-a10b2afd6ec4.webp",
    objectiveLabel: "Deed Camp",
    objectiveOffset: Object.freeze({ x: -16, y: 10 }),
    transitionSides: Object.freeze(["north", "west"]),
    transitionFamily: "core-v2-south-west",
    transitionRgb: SOUTH_WEST_TRANSITION_RGB,
    edgeThemeOverrides: Object.freeze({ west: "west" }),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["small off-center dry settlement", "fenced plots and shed", "dusty wagon lane", "open warm pasture"]),
      centralTreatment: "objective-only",
    }),
  }),
  "0,2": Object.freeze({
    key: "south-support",
    themeKey: "south",
    variantKey: "a",
    roadGeometryId: "east-v2",
    retrySalt: "core-v2-art6-south-support-open-dry-frontier-v1",
    identity: "the clean central southern frontier with dry grass, dusty soil variation, restrained erosion and maximum 70-city readability",
    objectiveArt: null,
    objectiveLabel: null,
    objectiveOffset: Object.freeze({ x: 0, y: 0 }),
    transitionSides: Object.freeze(["north"]),
    transitionFamily: "core-v2-south-center",
    transitionRgb: SOUTH_CENTER_RGB,
    propPlan: Object.freeze({
      majorClusters: 0,
      mediumClusters: 3,
      cueAssignments: Object.freeze(["dry field boundary", "subtle drainage and erosion", "small weathered tree group", "open sun-worn pasture"]),
      centralTreatment: "none",
    }),
  }),
  "1,2": Object.freeze({
    key: "south-relic-camp",
    themeKey: "south",
    accentThemeKey: "east",
    variantKey: "b",
    roadGeometryId: "north-v3",
    retrySalt: "core-v2-art6-south-relic-sun-weathered-ruins-v1",
    identity: "ancient southern territory with sun-weathered foundations, partially buried stone, dry paths, and a restrained return of eastern moisture",
    objectiveArt: "assets/optimized/camp-items-384x384-1d7cc179b5fe.webp",
    objectiveLabel: "Relic Camp",
    objectiveOffset: Object.freeze({ x: 18, y: 12 }),
    transitionSides: Object.freeze(["north", "east"]),
    transitionFamily: "core-v2-south-east",
    transitionRgb: SOUTH_EAST_TRANSITION_RGB,
    edgeThemeOverrides: Object.freeze({ north: "east", east: "east" }),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["sun-weathered ruin cluster", "partially buried stone fragments", "old dry footpaths", "sparse greener eastern reclaim"]),
      centralTreatment: "objective-only",
    }),
  }),
  "2,2": Object.freeze({
    key: "southeast-warband-camp",
    themeKey: "south",
    accentThemeKey: "east",
    variantKey: "c",
    roadGeometryId: "south-v3",
    retrySalt: "core-v2-art6-southeast-warband-warm-military-frontier-v1",
    identity: "warm southeastern military frontier with dusty churned soil, restrained damaged defenses, supply wear, and subtle eastern vegetation",
    objectiveArt: "assets/optimized/camp-troops-384x384-2f712333e891.webp",
    objectiveLabel: "Warband Camp",
    objectiveOffset: Object.freeze({ x: 16, y: -4 }),
    transitionSides: Object.freeze(["north", "east"]),
    transitionFamily: "core-v2-south-east",
    transitionRgb: SOUTH_EAST_TRANSITION_RGB,
    edgeThemeOverrides: Object.freeze({ north: "east", east: "east" }),
    propPlan: Object.freeze({
      majorClusters: 1,
      mediumClusters: 2,
      cueAssignments: Object.freeze(["restrained supply-wagon trace", "broken barricade fragments", "dusty hoof-worn ground", "subtle eastern vegetation influence"]),
      centralTreatment: "objective-only",
    }),
  }),
});

function digest(value, length = 64) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function applyObjectivePolicy(coreRegion, profile) {
  const region = clone(coreRegion);
  if (region.objective.type === "none") return region;
  region.objective.x = MAP_WIDTH / 2 + profile.objectiveOffset.x;
  region.objective.y = MAP_HEIGHT / 2 + profile.objectiveOffset.y;
  region.objective.placementPolicy = "near_center_camp";
  region.objective.offsetFromCenter = { ...profile.objectiveOffset };
  return region;
}

function assetIndex(manifest) { return new Map(manifest.assets.map(asset => [asset.assetId, asset])); }

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
  const reference = phase6f.createArtworkPlan({
    allocation,
    themeKey: profile.accentThemeKey,
    variantKey: profile.variantKey,
    retrySalt: `${profile.retrySalt}|transition-accents`,
    roadGeometryId: `${profile.accentThemeKey}-v2`,
    manifest,
  });
  plan.accents = reference.accents;
  plan.blockers = reference.blockers;
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
  const treatments = [];
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
    const barriers = reference.barriers.filter(isSideAsset);
    const openings = reference.roads.filter(item => byId.get(item.assetId)?.category === "road_opening" && isSideAsset(item));
    if (!barriers.length || openings.length !== 1) throw new Error(`Missing approved ${edgeTheme} treatment for ${profile.key}:${side}.`);
    plan.barriers = [...plan.barriers.filter(item => !isSideAsset(item)), ...barriers];
    plan.roads = [
      ...plan.roads.filter(item => !(byId.get(item.assetId)?.category === "road_opening" && isSideAsset(item))),
      ...openings,
    ];
    treatments.push({ side, edgeTheme, barrierAssetIds: barriers.map(item => item.assetId), roadOpeningAssetId: openings[0].assetId });
  }
  plan.handcraftedSharedEdgeTreatments = { strategy: "neighbor-compatible-approved-edge-assets-v1", width: 96, treatments };
}

function buildTransitionBands(plan, profile) {
  plan.transitionBands = [
    ...plan.transitionBands,
    ...profile.transitionSides.map(side => ({
      side,
      fromTheme: profile.themeKey,
      toTheme: profile.accentThemeKey || "center",
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

function candidatePool(plan, coreRegion, seedHash) {
  const random = createDeterministicRandom(`${seedHash}|candidate-pool`);
  const candidates = [];
  const rejectedByReason = {};
  const offsetX = random() * POOL_STEP;
  const offsetY = random() * POOL_STEP;
  for (let row = 0, y = EDGE_CLEARANCE_Y + offsetY; y <= MAP_HEIGHT - EDGE_CLEARANCE_Y; row += 1, y += POOL_STEP) {
    const rowShift = row % 2 ? POOL_STEP / 2 : 0;
    for (let x = EDGE_CLEARANCE_X + offsetX + rowShift; x <= MAP_WIDTH - EDGE_CLEARANCE_X; x += POOL_STEP) {
      const point = { x: Math.round(x + (random() - 0.5) * POOL_JITTER * 2), y: Math.round(y + (random() - 0.5) * POOL_JITTER * 2) };
      const reason = placementReason(point, plan, coreRegion);
      if (reason) rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1;
      else candidates.push(point);
    }
  }
  return { candidates, rejectedByReason };
}

function layoutQuality(points) {
  let nearestTotal = 0;
  let minimum = Infinity;
  let preferredViolations = 0;
  const quadrants = [0, 0, 0, 0];
  for (let left = 0; left < points.length; left += 1) {
    let nearest = Infinity;
    for (let right = 0; right < points.length; right += 1) if (left !== right) nearest = Math.min(nearest, Math.hypot(points[left].x - points[right].x, points[left].y - points[right].y));
    nearestTotal += nearest;
    minimum = Math.min(minimum, nearest);
    if (nearest < PREFERRED_CITY_SEPARATION) preferredViolations += 1;
    quadrants[(points[left].x >= MAP_WIDTH / 2 ? 1 : 0) + (points[left].y >= MAP_HEIGHT / 2 ? 2 : 0)] += 1;
  }
  const ideal = points.length / 4;
  const imbalance = quadrants.reduce((sum, count) => sum + Math.abs(count - ideal), 0);
  return { score: nearestTotal / points.length - imbalance * 1.4 - preferredViolations * 0.08, minimum, meanNearest: nearestTotal / points.length, preferredViolations, quadrants };
}

function selectCities(pool, capacity, seedHash) {
  let best = null;
  for (let trial = 0; trial < SELECTION_TRIALS; trial += 1) {
    const random = createDeterministicRandom(digest(`${seedHash}|selection-${trial + 1}`));
    const ranked = pool.map(point => ({ point, order: random() })).sort((left, right) => left.order - right.order);
    const selected = [];
    for (const item of ranked) {
      if (selected.every(point => Math.hypot(point.x - item.point.x, point.y - item.point.y) >= MIN_CITY_SEPARATION)) selected.push(item.point);
      if (selected.length === capacity) break;
    }
    if (selected.length < capacity) continue;
    const quality = layoutQuality(selected);
    if (!best || quality.score > best.quality.score) best = { selected, quality, trial: trial + 1 };
  }
  if (!best) throw new Error(`Could not place exactly ${capacity} ART-6 Core cities.`);
  return best;
}

function buildCities(coreRegion, plan, profile) {
  const seedHash = digest([BATCH_VERSION, coreRegion.regionId, coreRegion.coordinate.gridX, coreRegion.coordinate.gridY, profile.retrySalt].join("|"));
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
      generator: "hand-directed-deterministic-safe-coordinate-plan-art6-v1",
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

function validatePrototype(coreRegion, plan, cityResult, profile) {
  const errors = [];
  if (cityResult.cities.length !== coreRegion.exactCityCapacity) errors.push("Exact city capacity failed.");
  if (new Set(cityResult.cities.map(city => city.id)).size !== cityResult.cities.length) errors.push("Duplicate city IDs detected.");
  for (const city of cityResult.cities) {
    const reason = placementReason(city, plan, coreRegion);
    if (reason) errors.push(`${city.id}: ${reason}`);
  }
  let minimumSpacing = Infinity;
  for (let left = 0; left < cityResult.cities.length; left += 1) for (let right = left + 1; right < cityResult.cities.length; right += 1) minimumSpacing = Math.min(minimumSpacing, Math.hypot(cityResult.cities[left].x - cityResult.cities[right].x, cityResult.cities[left].y - cityResult.cities[right].y));
  if (minimumSpacing < MIN_CITY_SEPARATION) errors.push(`Minimum spacing ${minimumSpacing} is below ${MIN_CITY_SEPARATION}.`);
  const objectiveOffset = coreRegion.objective.type === "none" ? 0 : Math.hypot(coreRegion.objective.x - MAP_WIDTH / 2, coreRegion.objective.y - MAP_HEIGHT / 2);
  if (coreRegion.objective.type !== "none" && objectiveOffset > NEAR_CENTER_LIMIT) errors.push("Camp is outside near-center allowance.");
  const parity = phase6f.validateGeometryArtParity(plan);
  if (!parity.valid) errors.push(...parity.errors);
  const props = profile.propPlan;
  const propRuleCompliant = props.majorClusters <= 1 && props.mediumClusters <= (props.majorClusters ? 2 : 3) && plan.accents.length <= 4 && ["none", "objective-only"].includes(props.centralTreatment);
  if (!propRuleCompliant) errors.push("Objective prop rulebook failed.");
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
    objectivePlacement: { valid: objectiveOffset <= NEAR_CENTER_LIMIT, policy: coreRegion.objective.type === "none" ? "not_applicable" : "near_center_camp", offset: objectiveOffset },
    propRuleCompliant,
    geometryArtParity: parity,
  };
}

function buildPrototype(coreRegion, manifest = phase6f.loadAssetManifest()) {
  const profile = PROFILE_BY_COORDINATE[coordinateKey(coreRegion.coordinate.gridX, coreRegion.coordinate.gridY)];
  if (!profile) throw new Error(`Coordinate is not approved for ART-6: ${JSON.stringify(coreRegion.coordinate)}`);
  const adjustedRegion = applyObjectivePolicy(coreRegion, profile);
  const allocation = { worldId: "core-v2-development", seasonId: "core-v2-phase-art-6", regionId: adjustedRegion.regionId, coordinate: { ...adjustedRegion.coordinate, clockwiseOrderIndex: -1 } };
  const plan = phase6f.createArtworkPlan({ allocation, themeKey: profile.themeKey, variantKey: profile.variantKey, retrySalt: profile.retrySalt, roadGeometryId: profile.roadGeometryId, manifest });
  replaceAccentsForTransition(plan, allocation, profile, manifest);
  applySharedEdgeTreatments(plan, allocation, profile, manifest);
  buildTransitionBands(plan, profile);
  rebuildVisualComposition(plan, manifest);
  Object.assign(plan, {
    phase: "Core v2 Phase ART-6",
    generatorVersion: BATCH_VERSION,
    purpose: "permanent_core_handcrafted_final_art_batch_6",
    permanentCore: true,
    spawnEligible: false,
    runtimeNpcSpawnThresholdApplies: false,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    handcraftedProfile: profile,
    objectivePropPlan: profile.propPlan,
    coreRegion: {
      regionId: adjustedRegion.regionId,
      name: adjustedRegion.name,
      coordinate: adjustedRegion.coordinate,
      mapType: adjustedRegion.mapType,
      exactCityCapacity: adjustedRegion.exactCityCapacity,
      climate: adjustedRegion.climate,
      objective: adjustedRegion.objective,
      topology: adjustedRegion.topology,
    },
  });
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

module.exports = Object.freeze({ BATCH_VERSION, BATCH_COORDINATES, PROFILE_BY_COORDINATE, MIN_CITY_SEPARATION, PREFERRED_CITY_SEPARATION, NEAR_CENTER_LIMIT, buildPrototype, buildBatch });
