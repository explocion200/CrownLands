"use strict";

const crypto = require("node:crypto");
const phase6f = require("../map-scaling-phase-6f/composer");
const { createDeterministicRandom } = require("../map-scaling-phase-4/generator");
const {
  MAP_WIDTH,
  MAP_HEIGHT,
  SLICE_COORDINATES,
  coordinateKey,
  buildCoreSpecification,
  hashObject,
} = require("./spec");

const PROTOTYPE_VERSION = "core-v2-phase-a-handcrafted-slice-v1";
const CITY_RADIUS = 32;
// Core maps carry 55-70 cities and use the runtime 64px city art.  A 68px
// center-to-center floor prevents art overlap and remains more generous than
// the current production Core layouts (observed floors 47-64px).
const MIN_CITY_SEPARATION = 68;
const EDGE_CLEARANCE_X = 142;
const EDGE_CLEARANCE_Y = 132;
const ROAD_CLEARANCE = 8;
const BLOCKER_CLEARANCE = 10;
const OBJECTIVE_CLEARANCE = 14;
const POOL_STEP = 18;
const POOL_JITTER = 6;
const SELECTION_TRIALS = 192;
const WEST_SOUTH_TRANSITION_RGB = Object.freeze([146, 126, 60]);

const PROFILE_BY_COORDINATE = Object.freeze({
  "0,0": Object.freeze({
    key: "crown-citadel",
    themeKey: "west",
    variantKey: "a",
    roadGeometryId: "base",
    retrySalt: "core-v2-citadel-ceremonial-balanced-v1",
    identity: "balanced central kingdom, maintained approaches, restrained farmland and royal landscaping",
    objectiveArt: "assets/optimized/crown-citadel-384x384-a23c30392f3c.webp",
    objectiveLabel: "Crown Citadel",
  }),
  "0,1": Object.freeze({
    key: "ironwatch",
    themeKey: "west",
    accentThemeKey: "south",
    variantKey: "b",
    roadGeometryId: "west-v2",
    retrySalt: "core-v2-iron-4",
    identity: "rocky high ground, dry stone character and hardened defensive approaches",
    objectiveArt: "assets/optimized/stronghold-defense-384x384-6bee2f3ace80.webp",
    objectiveLabel: "Ironwatch",
  }),
  "-1,1": Object.freeze({
    key: "southwest-holding-tower",
    themeKey: "west",
    accentThemeKey: "south",
    variantKey: "a",
    roadGeometryId: "west-v3",
    retrySalt: "core-v2-tower-2",
    identity: "restrained dry earthworks, military-road character and a clean future Tower reserve",
    objectiveArt: null,
    objectiveLabel: "Future Holding Tower reservation",
  }),
  "-2,1": Object.freeze({
    key: "west-south-deed-camp",
    themeKey: "west",
    variantKey: "b",
    roadGeometryId: "west-v2",
    retrySalt: "core-v2-deed-frontier-crossroads-v1-1",
    identity: "small frontier farm territory, light fields and a minor crossroads without a large town",
    objectiveArt: "assets/optimized/camp-deed-384x384-a10b2afd6ec4.webp",
    objectiveLabel: "Deed Camp",
  }),
  "-2,0": Object.freeze({
    key: "west-support",
    themeKey: "west",
    variantKey: "a",
    roadGeometryId: "west-v3",
    retrySalt: "core-v2-west-support-open-territory-v1",
    identity: "very open grassy fighting territory with restrained temperate field and woodland cues",
    objectiveArt: null,
    objectiveLabel: null,
  }),
});

function digest(value, length = 64) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function pointInPolygon(point, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return true;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (((a.y > point.y) !== (b.y > point.y))
      && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x) inside = !inside;
  }
  return inside;
}

function pointInEllipse(point, shape, padding = 0) {
  const rx = Math.max(1, Number(shape.radiusX || shape.rx || shape.radius || 1) + padding);
  const ry = Math.max(1, Number(shape.radiusY || shape.ry || shape.radius || 1) + padding);
  const dx = point.x - Number(shape.x || 0);
  const dy = point.y - Number(shape.y || 0);
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function roadSegments(plan) {
  return plan.roadSystem.edgeRoads.flatMap(road => road.points.slice(0, -1).map((start, index) => ({
    id: `${road.id}-segment-${index + 1}`,
    side: road.side,
    start,
    end: road.points[index + 1],
    halfWidth: Number(road.halfWidth) || 44,
  })));
}

function landClear(point, landPolygon) {
  const clearance = CITY_RADIUS + 8;
  const samples = [{ x: 0, y: 0 }];
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    samples.push({ x: Math.cos(angle) * clearance, y: Math.sin(angle) * clearance });
  }
  return samples.every(offset => pointInPolygon({ x: point.x + offset.x, y: point.y + offset.y }, landPolygon));
}

function placementReason(point, plan, coreRegion) {
  if (point.x < EDGE_CLEARANCE_X || point.x > MAP_WIDTH - EDGE_CLEARANCE_X
    || point.y < EDGE_CLEARANCE_Y || point.y > MAP_HEIGHT - EDGE_CLEARANCE_Y) return "edge_clearance";
  if (!landClear(point, plan.landPolygon)) return "outside_land";
  if (plan.blockers.some(blocker => pointInEllipse(point, blocker, CITY_RADIUS + BLOCKER_CLEARANCE))) return "terrain_blocker";
  if (coreRegion.objective.type !== "none"
    && pointInEllipse(point, coreRegion.objective, CITY_RADIUS + OBJECTIVE_CLEARANCE)) return "objective_clearance";
  if (roadSegments(plan).some(segment => distancePointToSegment(point, segment.start, segment.end)
    < segment.halfWidth + CITY_RADIUS + ROAD_CLEARANCE)) return "road_clearance";
  const transitionRadius = 78 + CITY_RADIUS;
  const sockets = [{ x: 724, y: 0 }, { x: 1448, y: 543 }, { x: 724, y: 1086 }, { x: 0, y: 543 }];
  if (sockets.some(socket => Math.hypot(point.x - socket.x, point.y - socket.y) < transitionRadius)) return "transition_clearance";
  return "";
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
  for (let left = 0; left < points.length; left += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let right = 0; right < points.length; right += 1) {
      if (left === right) continue;
      nearest = Math.min(nearest, Math.hypot(points[left].x - points[right].x, points[left].y - points[right].y));
    }
    nearestTotal += nearest;
    minimum = Math.min(minimum, nearest);
  }
  const quadrants = [0, 0, 0, 0];
  for (const point of points) quadrants[(point.x >= MAP_WIDTH / 2 ? 1 : 0) + (point.y >= MAP_HEIGHT / 2 ? 2 : 0)] += 1;
  const ideal = points.length / 4;
  const imbalance = quadrants.reduce((sum, count) => sum + Math.abs(count - ideal), 0);
  return { score: nearestTotal / points.length - imbalance * 1.4, minimum, meanNearest: nearestTotal / points.length, quadrants };
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
  if (!best) throw new Error(`Could not place exactly ${capacity} Core cities after ${SELECTION_TRIALS} deterministic trials.`);
  return best;
}

function buildCities(coreRegion, plan, profile) {
  const seedMaterial = [PROTOTYPE_VERSION, coreRegion.regionId, coreRegion.coordinate.gridX, coreRegion.coordinate.gridY, profile.retrySalt].join("|");
  const seedHash = digest(seedMaterial);
  const pool = candidatePool(plan, coreRegion, seedHash);
  const selection = selectCities(pool.candidates, coreRegion.exactCityCapacity, seedHash);
  const cities = selection.selected.map(point => {
    const id = `core_${digest(`${coreRegion.regionId}|${seedHash}|${point.x}|${point.y}`, 18)}`;
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
      generator: "hand-directed-deterministic-safe-coordinate-plan-v1",
      seedHash,
      minimumCitySeparation: MIN_CITY_SEPARATION,
      cityVisualDiameter: CITY_RADIUS * 2,
      edgeClearance: { x: EDGE_CLEARANCE_X, y: EDGE_CLEARANCE_Y },
      roadClearanceBeyondVisual: ROAD_CLEARANCE,
      blockerClearanceBeyondCity: BLOCKER_CLEARANCE,
      objectiveClearanceBeyondCity: OBJECTIVE_CLEARANCE,
      candidatePoolSize: pool.candidates.length,
      rejectedByReason: pool.rejectedByReason,
      selectedTrial: selection.trial,
      selectionTrialLimit: SELECTION_TRIALS,
      minimumObservedSpacing: Math.round(selection.quality.minimum * 1000) / 1000,
      meanNearestNeighbor: Math.round(selection.quality.meanNearest * 1000) / 1000,
      quadrantCounts: selection.quality.quadrants,
    },
  };
}

function validatePrototype(coreRegion, plan, cityResult) {
  const errors = [];
  if (cityResult.cities.length !== coreRegion.exactCityCapacity) errors.push("Exact city capacity failed.");
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
  const parity = phase6f.validateGeometryArtParity(plan);
  if (!parity.valid) errors.push(...parity.errors);
  return {
    valid: errors.length === 0,
    errors,
    exactCapacity: cityResult.cities.length,
    expectedCapacity: coreRegion.exactCityCapacity,
    minimumSpacing: Math.round(minimumSpacing * 1000) / 1000,
    cityObjectiveConflicts: errors.filter(error => error.includes("objective_clearance")).length,
    cityBlockerConflicts: errors.filter(error => error.includes("terrain_blocker")).length,
    cityRoadConflicts: errors.filter(error => error.includes("road_clearance")).length,
    cityTransitionConflicts: errors.filter(error => error.includes("transition_clearance")).length,
    geometryArtParity: parity,
  };
}

function buildPrototype(coreRegion, manifest = phase6f.loadAssetManifest()) {
  const key = coordinateKey(coreRegion.coordinate.gridX, coreRegion.coordinate.gridY);
  const profile = PROFILE_BY_COORDINATE[key];
  if (!profile) throw new Error(`Coordinate ${key} is not approved for the Phase A five-map slice.`);
  const allocation = {
    worldId: "core-v2-development",
    seasonId: "core-v2-phase-a",
    regionId: coreRegion.regionId,
    coordinate: { ...coreRegion.coordinate, clockwiseOrderIndex: -1 },
  };
  const plan = phase6f.createArtworkPlan({
    allocation,
    themeKey: profile.themeKey,
    variantKey: profile.variantKey,
    retrySalt: profile.retrySalt,
    roadGeometryId: profile.roadGeometryId,
    manifest,
  });
  if (profile.accentThemeKey && profile.accentThemeKey !== profile.themeKey) {
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
      strategy: "approved-west-foundation-with-approved-south-accents-v1",
      foundationTheme: profile.themeKey,
      accentTheme: profile.accentThemeKey,
      purpose: "make the y=1 Core row a gradual center-to-south transition",
      createsNewArtwork: false,
    };
  }
  const sharedTransitionSides = {
    "0,0": ["south"],
    "0,1": ["north"],
    "-1,1": ["west"],
    "-2,1": ["east"],
  }[key] || [];
  plan.transitionBands = [
    ...plan.transitionBands,
    ...sharedTransitionSides.map(side => ({
      side,
      fromTheme: profile.themeKey,
      toTheme: profile.accentThemeKey || (profile.themeKey === "south" ? "west" : "south"),
      family: "core-v2-west-south",
      width: 96,
      maximumStrength: 0.22,
      targetRgb: WEST_SOUTH_TRANSITION_RGB,
      deterministic: true,
      narrowEdgeOnly: true,
      sharedCoreEdgeBlend: true,
    })),
  ];
  plan.phase = "Core v2 Phase A";
  plan.generatorVersion = PROTOTYPE_VERSION;
  plan.purpose = "permanent_core_handcrafted_prototype";
  plan.permanentCore = true;
  plan.spawnEligible = false;
  plan.runtimeNpcSpawnThresholdApplies = false;
  plan.developmentOnly = true;
  plan.productionActivated = false;
  plan.publicationAllowed = false;
  plan.handcraftedProfile = profile;
  plan.coreRegion = {
    regionId: coreRegion.regionId,
    name: coreRegion.name,
    coordinate: coreRegion.coordinate,
    mapType: coreRegion.mapType,
    exactCityCapacity: coreRegion.exactCityCapacity,
    climate: coreRegion.climate,
    objective: coreRegion.objective,
    topology: coreRegion.topology,
  };
  plan.planHash = hashObject({ ...plan, planHash: undefined });
  const cityResult = buildCities(coreRegion, plan, profile);
  const validation = validatePrototype(coreRegion, plan, cityResult);
  const receipt = {
    schemaVersion: 1,
    prototypeVersion: PROTOTYPE_VERSION,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    regionId: coreRegion.regionId,
    coordinate: coreRegion.coordinate,
    mapType: coreRegion.mapType,
    exactCityCapacity: coreRegion.exactCityCapacity,
    profile,
    cityPlanHash: hashObject(cityResult.cities),
    compositionPlanHash: plan.planHash,
    validation,
    metrics: cityResult.metrics,
  };
  receipt.receiptHash = hashObject({ ...receipt, receiptHash: undefined });
  return { coreRegion, profile, plan, cities: cityResult.cities, receipt };
}

function buildFiveMapSlice() {
  const specification = buildCoreSpecification();
  const byCoordinate = new Map(specification.regions.map(region => [coordinateKey(region.coordinate.gridX, region.coordinate.gridY), region]));
  const manifest = phase6f.loadAssetManifest();
  return SLICE_COORDINATES.map(coordinate => buildPrototype(byCoordinate.get(coordinateKey(coordinate.gridX, coordinate.gridY)), manifest));
}

module.exports = Object.freeze({
  PROTOTYPE_VERSION,
  CITY_RADIUS,
  MIN_CITY_SEPARATION,
  PROFILE_BY_COORDINATE,
  roadSegments,
  placementReason,
  buildPrototype,
  buildFiveMapSlice,
});
