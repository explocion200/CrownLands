"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const {
  createDeterministicRandom,
  generateRegionPrototype,
  hashObject,
} = require("../map-scaling-phase-4/generator");
const { PLAYER_REGION_CITY_CAPACITY, MINIMUM_NPC_CITIES_FOR_SPAWN } = require("../../functions/player-region-spawn");

const ROOT = path.resolve(__dirname, "..", "..");
const ASSET_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6b", "asset-library");
const MANIFEST_PATH = path.join(ASSET_ROOT, "asset-manifest.json");
const GENERATOR_VERSION = "phase6b-modular-composer-v1";
const MAP_WIDTH = 1448;
const MAP_HEIGHT = 1086;
const THEME_KEYS = Object.freeze(["west", "north", "east", "south"]);
const SIDES = Object.freeze(["north", "east", "south", "west"]);

const ACCENT_SLOTS = Object.freeze([
  Object.freeze({ x: 315, y: 245 }), Object.freeze({ x: 505, y: 335 }),
  Object.freeze({ x: 925, y: 245 }), Object.freeze({ x: 1120, y: 350 }),
  Object.freeze({ x: 330, y: 720 }), Object.freeze({ x: 520, y: 815 }),
  Object.freeze({ x: 925, y: 775 }), Object.freeze({ x: 1110, y: 680 }),
]);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function resolvePython() {
  const candidates = [];
  if (String(process.env.CROWNLANDS_MAP_PYTHON || "").trim()) candidates.push(process.env.CROWNLANDS_MAP_PYTHON.trim());
  candidates.push("python", "py");
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"));
  }
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "from PIL import Image; print(Image.__version__)"], { encoding: "utf8", windowsHide: true });
    if (probe.status === 0) return candidate;
  }
  throw new Error("Phase 6B requires Python with Pillow for offline raster composition.");
}

function runComposer(planPath, outputDirectory) {
  const run = spawnSync(resolvePython(), [
    path.join(__dirname, "compose_map.py"),
    "--plan", planPath,
    "--root", ROOT,
    "--output", outputDirectory,
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`Phase 6B compositor failed: ${run.stderr || run.stdout || `exit ${run.status}`}`);
  return JSON.parse(String(run.stdout || "{}").trim());
}

function loadAssetManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) throw new Error("Missing Phase 6B asset manifest. Run build_asset_library.py first.");
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function assetMap(manifest) {
  return new Map(manifest.assets.map(asset => [asset.assetId, asset]));
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function toPlacement(asset, overrides = {}) {
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

function createSeed(allocation, themeKey, variantKey, retrySalt) {
  const material = [
    allocation.worldId, allocation.seasonId, allocation.regionId,
    allocation.coordinate.gridX, allocation.coordinate.gridY,
    GENERATOR_VERSION, "phase6b-modular-crownlands-v1", themeKey, variantKey, retrySalt,
  ].join("|");
  return {
    strategy: "sha256(world|season|region|coordinate|generator|library|direction|variant|retrySalt)",
    materialHash: crypto.createHash("sha256").update(material).digest("hex"),
    retrySalt,
  };
}

function createRoadSystem() {
  const edgeRoads = [
    { id: "road-north", side: "north", halfWidth: 44, points: [{ x: 724, y: 0 }, { x: 724, y: 348 }] },
    { id: "road-east", side: "east", halfWidth: 44, points: [{ x: 1448, y: 543 }, { x: 985, y: 543 }] },
    { id: "road-south", side: "south", halfWidth: 44, points: [{ x: 724, y: 1086 }, { x: 724, y: 738 }] },
    { id: "road-west", side: "west", halfWidth: 44, points: [{ x: 0, y: 543 }, { x: 463, y: 543 }] },
  ];
  return {
    edgeRoads,
    branches: [],
    exits: Object.fromEntries(edgeRoads.map(road => [road.side, road.points[0]])),
  };
}

function createArtworkPlan({ allocation, themeKey, variantKey = "a", retrySalt = "default", manifest = loadAssetManifest() }) {
  if (!THEME_KEYS.includes(themeKey)) throw new Error(`Unknown Phase 6B direction ${themeKey}.`);
  const byId = assetMap(manifest);
  const seed = createSeed(allocation, themeKey, variantKey, retrySalt);
  const random = createDeterministicRandom(seed.materialHash);
  const foundation = byId.get(`foundation.${themeKey}`);
  assert(foundation, `Missing ${themeKey} foundation.`);
  const barriers = manifest.assets
    .filter(asset => asset.theme === themeKey && asset.category === "perimeter_barrier")
    .sort((left, right) => left.assetId.localeCompare(right.assetId))
    .map(asset => toPlacement(asset));
  const roads = SIDES.map(side => {
    const asset = byId.get(`road-opening.${themeKey}.${side}`);
    assert(asset, `Missing ${themeKey} ${side} road opening.`);
    return toPlacement(asset, { geometryRef: `road-${side}` });
  });
  const availableAccents = manifest.assets.filter(asset => asset.theme === themeKey && !asset.optional && [
    "farmland", "rocks", "low_hills", "woodland", "vegetation", "winter_vegetation", "ground_accent", "tropical_vegetation", "dry_vegetation",
  ].includes(asset.category));
  const optionalWater = manifest.assets.find(asset => asset.theme === themeKey && asset.category === "water");
  // The locked approval slices are deliberately sparse.  Four accents retain
  // that density and leave honest 40-city interaction space; a water-enabled
  // B variant uses three land accents plus the optional pond.
  let chosen = shuffle(availableAccents, random).slice(0, optionalWater && variantKey === "b" ? 3 : 4);
  if (optionalWater && variantKey === "b") chosen.push(optionalWater);
  const slots = shuffle(ACCENT_SLOTS, random).slice(0, chosen.length);
  const accents = chosen.map((asset, index) => {
    const scale = 0.78 + random() * 0.18;
    const width = Math.round(asset.width * scale);
    const height = Math.round(asset.height * scale);
    const center = slots[index];
    const blocker = asset.blockerFootprint || { rx: Math.round(width * 0.28), ry: Math.round(height * 0.24) };
    return toPlacement(asset, {
      id: `visual-accent-${String(index + 1).padStart(2, "0")}`,
      geometryRef: `accent-blocker-${String(index + 1).padStart(2, "0")}`,
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
      width,
      height,
      flipHorizontal: random() >= 0.5,
      center,
      blocker: {
        x: center.x, y: center.y,
        rx: Math.round(blocker.rx * scale), ry: Math.round(blocker.ry * scale),
      },
    });
  });
  const blockers = accents.map(accent => ({
    id: accent.geometryRef,
    type: accent.assetId.includes("pond") ? "water" : accent.assetId.split(".")[2] || "terrain_accent",
    x: accent.blocker.x, y: accent.blocker.y, rx: accent.blocker.rx, ry: accent.blocker.ry,
    rot: 0, blocksCities: true, blocksMovement: true,
  }));
  const roadSystem = createRoadSystem();
  const roadCorridors = roadSystem.edgeRoads.map(road => ({
    id: `${road.id}-corridor`, side: road.side,
    start: road.points[0], end: road.points[1], halfWidth: road.halfWidth,
  }));
  const landPolygon = [{ x: 145, y: 145 }, { x: 1303, y: 145 }, { x: 1303, y: 941 }, { x: 145, y: 941 }];
  const visualComposition = [
    { id: "foundation", assetId: foundation.assetId, category: "foundation", geometryRef: "land-polygon", drawOrder: 0 },
    ...barriers.map((placement, index) => ({ ...placement, id: `barrier-${index + 1}`, category: "perimeter_barrier", geometryRef: `barrier-${placement.assetId.split(".").at(-1)}`, drawOrder: 10 })),
    ...roads.map((placement, index) => ({ ...placement, id: `road-${index + 1}`, category: "road_opening", drawOrder: 20 })),
    ...accents.map((placement, index) => ({ ...placement, category: "interior_accent", drawOrder: 30 + index })),
  ];
  const plan = {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    assetLibraryVersion: manifest.assetLibraryVersion,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    regionId: allocation.regionId,
    coordinate: allocation.coordinate,
    theme: { key: themeKey, ...manifest.themes[themeKey] },
    variantKey,
    dimensions: { width: MAP_WIDTH, height: MAP_HEIGHT },
    seed,
    foundation: toPlacement(foundation, { transform: variantKey === "b" ? "flip_horizontal" : "none" }),
    barriers,
    roads,
    accents,
    landPolygon,
    blockers,
    roadSystem,
    roadCorridors,
    visualComposition,
    gateSupport: {
      bakedState: false,
      runtimeOnly: true,
      source: manifest.gateSupport,
      sides: SIDES,
    },
  };
  plan.planHash = hashObject({ ...plan, planHash: undefined });
  return plan;
}

function createDefinition(allocation, plan) {
  return {
    id: allocation.regionId,
    name: `Phase 6B ${plan.theme.label} ${plan.variantKey.toUpperCase()}`,
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
    noCityZones: [], camps: [], strongholds: [], citadels: [],
  };
}

function generateExactForty({ allocation, existingRegions, plan }) {
  const definition = createDefinition(allocation, plan);
  for (let attempt = 1; attempt <= 160; attempt += 1) {
    const seedSalt = `phase6b|${plan.theme.key}|${plan.variantKey}|layout-${attempt}`;
    const generated = generateRegionPrototype({
      existingRegions, allocation, definition,
      generatorVersion: GENERATOR_VERSION,
      seedSalt,
      config: { maximumCandidateEvaluations: 320000, attractionProbability: 0.28 },
    });
    if (generated.status === "standby" && generated.previewDefinition.cities.length === PLAYER_REGION_CITY_CAPACITY) {
      return { generated, attempt, seedSalt };
    }
  }
  throw new Error(`Unable to place exactly ${PLAYER_REGION_CITY_CAPACITY} cities in ${allocation.regionId}.`);
}

function validateGeometryArtParity(plan) {
  const errors = [];
  const assetIds = new Set(plan.visualComposition.map(element => element.assetId));
  for (const blocker of plan.blockers) {
    const visual = plan.accents.find(accent => accent.geometryRef === blocker.id);
    if (!visual) errors.push(`Blocker ${blocker.id} has no visual accent.`);
    else if (visual.center.x !== blocker.x || visual.center.y !== blocker.y
      || visual.blocker.rx !== blocker.rx || visual.blocker.ry !== blocker.ry) errors.push(`Blocker ${blocker.id} drifted from its visual.`);
  }
  const roadCounts = Object.fromEntries(SIDES.map(side => [side, 0]));
  for (const road of plan.roadSystem.edgeRoads) {
    roadCounts[road.side] += 1;
    const visual = plan.roads.find(item => item.geometryRef === road.id);
    if (!visual) errors.push(`${road.id} has no road-opening module.`);
    const exit = road.points[0];
    const edgeMatch = road.side === "north" ? exit.x === 724 && exit.y === 0
      : road.side === "east" ? exit.x === 1448 && exit.y === 543
        : road.side === "south" ? exit.x === 724 && exit.y === 1086
          : exit.x === 0 && exit.y === 543;
    if (!edgeMatch) errors.push(`${road.id} no longer meets its exact cardinal edge anchor.`);
  }
  for (const side of SIDES) if (roadCounts[side] !== 1) errors.push(`Expected one ${side} road opening, found ${roadCounts[side]}.`);
  if (plan.barriers.length !== 8 || !plan.barriers.every(asset => asset.x === 0 || asset.y === 0 || asset.x + asset.width === MAP_WIDTH || asset.y + asset.height === MAP_HEIGHT)) {
    errors.push("Perimeter barrier segments do not all touch a literal image boundary.");
  }
  if ([...assetIds].some(id => /city|camp|stronghold|citadel/i.test(id))) errors.push("Runtime object art leaked into the composition.");
  return {
    valid: errors.length === 0, errors,
    blockerPairs: plan.blockers.length,
    roadPairs: plan.roadSystem.edgeRoads.length,
    edgeExitCounts: roadCounts,
    barrierSegmentsTouchingBoundary: plan.barriers.length,
  };
}

function composePlayerRegion({ allocation, existingRegions, themeKey, variantKey, outputDirectory, retrySalt = "default" }) {
  const startedAt = performance.now();
  const manifest = loadAssetManifest();
  const plan = createArtworkPlan({ allocation, themeKey, variantKey, retrySalt, manifest });
  const parity = validateGeometryArtParity(plan);
  if (!parity.valid) throw new Error(parity.errors.join(" "));
  const cityStarted = performance.now();
  const cityResult = generateExactForty({ allocation, existingRegions, plan });
  const cities = cityResult.generated.previewDefinition.cities;
  const startingCandidates = cityResult.generated.previewDefinition.startingCityCandidates;
  const cityMs = performance.now() - cityStarted;
  fs.mkdirSync(outputDirectory, { recursive: true });
  const planPath = path.join(outputDirectory, "composition.json");
  writeJson(planPath, plan);
  writeJson(path.join(outputDirectory, "cities.json"), cities);
  writeJson(path.join(outputDirectory, "starting-candidates.json"), startingCandidates);
  const bakeStarted = performance.now();
  const firstBake = runComposer(planPath, outputDirectory);
  const secondBake = runComposer(planPath, outputDirectory);
  const bakeMs = performance.now() - bakeStarted;
  const deterministic = {
    repeatedMapMatch: firstBake.map.sha256 === secondBake.map.sha256,
    repeatedThumbnailMatch: firstBake.thumbnail.sha256 === secondBake.thumbnail.sha256,
    repeatedCleanPngMatch: firstBake.cleanPng.sha256 === secondBake.cleanPng.sha256,
  };
  const receipt = {
    schemaVersion: 1,
    phase: "6B",
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    activationAllowed: false,
    lifecycle: "STANDBY",
    generatorVersion: GENERATOR_VERSION,
    assetLibraryVersion: manifest.assetLibraryVersion,
    regionId: allocation.regionId,
    coordinate: allocation.coordinate,
    theme: plan.theme,
    variantKey,
    cityCapacity: PLAYER_REGION_CITY_CAPACITY,
    minimumNpcCitiesForSpawn: MINIMUM_NPC_CITIES_FOR_SPAWN,
    cityCount: cities.length,
    startingCandidateCount: startingCandidates.length,
    deterministicAttempt: cityResult.attempt,
    citySeedSalt: cityResult.seedSalt,
    planHash: plan.planHash,
    cityHash: hashObject(cities),
    startingCandidateHash: hashObject(startingCandidates),
    parity,
    deterministic,
    assetUse: {
      foundation: plan.foundation.assetId,
      barriers: plan.barriers.map(asset => asset.assetId),
      roads: plan.roads.map(asset => asset.assetId),
      accents: plan.accents.map(asset => asset.assetId),
      uniqueAssetCount: new Set([plan.foundation.assetId, ...plan.barriers.map(x => x.assetId), ...plan.roads.map(x => x.assetId), ...plan.accents.map(x => x.assetId)]).size,
    },
    outputs: secondBake,
    timings: {
      cityPlacementMs: Math.round(cityMs * 1000) / 1000,
      repeatedCompositionMs: Math.round(bakeMs * 1000) / 1000,
      totalMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
    },
  };
  receipt.valid = parity.valid && cities.length === PLAYER_REGION_CITY_CAPACITY
    && deterministic.repeatedMapMatch && deterministic.repeatedThumbnailMatch && deterministic.repeatedCleanPngMatch
    && secondBake.map.width === MAP_WIDTH && secondBake.map.height === MAP_HEIGHT
    && secondBake.thumbnail.width === 320 && secondBake.thumbnail.height === 240;
  writeJson(path.join(outputDirectory, "receipt.json"), receipt);
  return { plan, cities, startingCandidates, receipt, generated: cityResult.generated };
}

module.exports = Object.freeze({
  ROOT, ASSET_ROOT, MANIFEST_PATH, GENERATOR_VERSION, MAP_WIDTH, MAP_HEIGHT, THEME_KEYS, SIDES,
  loadAssetManifest, resolvePython, createArtworkPlan, createDefinition,
  validateGeometryArtParity, composePlayerRegion, sha256File, writeJson,
});
