"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const {
  hashObject,
  generateRegionPrototype,
} = require("../map-scaling-phase-4/generator");
const {
  PLAYER_REGION_CITY_CAPACITY,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
} = require("../../functions/player-region-spawn");
const {
  ASSET_LIBRARY_VERSION,
} = require("./asset-library");
const {
  TERRAIN_PLAN_VERSION,
  createTerrainPlan,
  createPhase4Definition,
  pixelToGameplay,
} = require("./terrain-plan");
const {
  validateGeometryArtParity,
  validateBakedAssets,
  validatePlayerPackage,
  validateRolledBackPackage,
} = require("./validators");

const PHASE5_GENERATOR_VERSION = "phase5-composer-v1";
const PACKAGE_SCHEMA_VERSION = 1;

function roundMs(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function resolvePython() {
  const configured = String(process.env.CROWNLANDS_MAP_PYTHON || "").trim();
  const candidates = configured ? [configured] : ["python", "py"];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "from PIL import Image"], { encoding: "utf8", windowsHide: true });
    if (probe.status === 0) return candidate;
  }
  throw new Error("Phase 5 WebP baking requires Python with Pillow. Set CROWNLANDS_MAP_PYTHON to the supported interpreter.");
}

function runBaker(compositionPath, mapPath, thumbnailPath) {
  const python = resolvePython();
  const script = path.join(__dirname, "bake_map.py");
  const run = spawnSync(python, [
    script,
    "--input", compositionPath,
    "--map", mapPath,
    "--thumbnail", thumbnailPath,
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`Phase 5 baker failed: ${run.stderr || run.stdout || `exit ${run.status}`}`);
  return JSON.parse(String(run.stdout || "{}").trim());
}

function createPackageProjection(packageValue) {
  return {
    schemaVersion: packageValue.schemaVersion,
    generatorVersion: packageValue.generatorVersion,
    assetLibraryVersion: packageValue.assetLibraryVersion,
    terrainPlanVersion: packageValue.terrainPlanVersion,
    worldId: packageValue.worldId,
    seasonId: packageValue.seasonId,
    regionId: packageValue.regionId,
    coordinate: packageValue.coordinate,
    seed: packageValue.seed,
    lifecycle: packageValue.lifecycle,
    catalogEntry: packageValue.catalogEntry,
    topology: packageValue.topology,
    hashes: packageValue.hashes,
    mapWebp: packageValue.mapWebp,
    thumbnailWebp: packageValue.thumbnailWebp,
    fileManifest: packageValue.fileManifest,
  };
}

function buildFileManifest(outputDirectory, relativeFiles) {
  return relativeFiles.map(relativePath => {
    const absolutePath = path.join(outputDirectory, relativePath);
    return {
      path: relativePath.replace(/\\/g, "/"),
      bytes: fs.statSync(absolutePath).size,
      sha256: sha256File(absolutePath),
    };
  });
}

function writePackageFiles(outputDirectory, packageValue) {
  const files = {
    "catalog.json": packageValue.catalogEntry,
    "region.json": packageValue.regionDefinition,
    "terrain.json": packageValue.terrain,
    "blockers.json": packageValue.blockers,
    "blocker-mask.rle.json": packageValue.blockerMask,
    "roads.json": packageValue.roads,
    "cities.json": packageValue.cities,
    "starting-candidates.json": packageValue.startingCandidates,
    "composition.json": packageValue.composition,
    "generation-manifest.json": packageValue.generationManifest,
    "validation-receipt.json": packageValue.validationReceipt,
  };
  for (const [fileName, value] of Object.entries(files)) writeJson(path.join(outputDirectory, fileName), value);
  return Object.keys(files);
}

function composePlayerRegion({
  allocation,
  existingRegions,
  profile,
  retrySalt = "default",
  constrained = false,
  outputDirectory = "",
  bake = true,
} = {}) {
  const startedAt = performance.now();
  const heapBefore = process.memoryUsage().heapUsed;
  const terrainStartedAt = performance.now();
  const terrainPlan = createTerrainPlan({
    allocation,
    profile,
    generatorVersion: PHASE5_GENERATOR_VERSION,
    retrySalt,
    constrained,
  });
  const terrainPlanMs = performance.now() - terrainStartedAt;
  const definition = createPhase4Definition(allocation, terrainPlan);
  const cityStartedAt = performance.now();
  const prototype = generateRegionPrototype({
    existingRegions,
    allocation,
    definition,
    generatorVersion: PHASE5_GENERATOR_VERSION,
    seedSalt: `${ASSET_LIBRARY_VERSION}|${retrySalt}`,
    config: { maximumCandidateEvaluations: constrained ? 12000 : 120000 },
  });
  const cityPlacementMs = performance.now() - cityStartedAt;

  if (prototype.status !== "standby") {
    const result = {
      status: "rolled_back",
      lifecycle: "ROLLED_BACK",
      developmentOnly: true,
      publicationAllowed: false,
      activationAllowed: false,
      coordinateReusable: true,
      allocation,
      profile,
      terrainPlan,
      previewDefinition: prototype.previewDefinition,
      validation: prototype.validation,
      receipt: prototype.receipt,
      package: null,
      bake: null,
      outputFiles: [],
      timings: {
        terrainPlanMs: roundMs(terrainPlanMs),
        cityPlacementMs: roundMs(cityPlacementMs),
        totalMs: roundMs(performance.now() - startedAt),
      },
    };
    result.rollbackValidation = validateRolledBackPackage(result);
    return result;
  }

  const parity = validateGeometryArtParity(terrainPlan);
  if (!parity.valid) throw new Error(`Geometry/art parity failed: ${parity.errors.join(" ")}`);
  const cities = prototype.definition.cities.map(city => ({
    ...city,
    xNorm: city.x / terrainPlan.dimensions.width,
    yNorm: city.y / terrainPlan.dimensions.height,
    gameplay: pixelToGameplay(city),
  }));
  const startingCandidates = prototype.definition.startingCityCandidates.map(candidate => ({
    ...candidate,
    gameplay: pixelToGameplay(cities.find(city => city.id === candidate.cityId) || {}),
  }));
  const catalogEntry = {
    ...prototype.catalogEntry,
    generationReady: true,
    spawnReady: false,
    spawnEligible: false,
    activationAllowed: false,
    visibility: "development_only",
    mapAsset: "map.webp",
    thumbnailAsset: "thumbnail.webp",
    assetLibraryVersion: ASSET_LIBRARY_VERSION,
  };
  const regionDefinition = {
    ...prototype.definition,
    cities,
    startingCityCandidates: startingCandidates,
    mapAsset: "map.webp",
    thumbnailAsset: "thumbnail.webp",
    terrainPlanHash: terrainPlan.terrainPlanHash,
    assetLibraryVersion: ASSET_LIBRARY_VERSION,
  };

  let bakeMetadata = null;
  let bakeMs = 0;
  const compositionInput = {
    schemaVersion: 1,
    developmentOnly: true,
    watermarkRequired: true,
    regionId: allocation.regionId,
    profile,
    dimensions: terrainPlan.dimensions,
    palette: terrainPlan.palette,
    landPolygon: terrainPlan.landPolygon,
    visualComposition: terrainPlan.visualComposition,
  };
  if (bake) {
    if (!outputDirectory) throw new Error("Baked Phase 5 packages require an output directory.");
    fs.mkdirSync(outputDirectory, { recursive: true });
    const compositionPath = path.join(outputDirectory, "composition.json");
    writeJson(compositionPath, compositionInput);
    const bakeStartedAt = performance.now();
    const first = runBaker(compositionPath, path.join(outputDirectory, "map.webp"), path.join(outputDirectory, "thumbnail.webp"));
    const second = runBaker(compositionPath, path.join(outputDirectory, "map.webp"), path.join(outputDirectory, "thumbnail.webp"));
    bakeMs = performance.now() - bakeStartedAt;
    bakeMetadata = {
      ...second,
      repeatedMapSha256: first.map.sha256,
      repeatedThumbnailSha256: first.thumbnail.sha256,
      webpRepeatMatch: first.map.sha256 === second.map.sha256,
      thumbnailRepeatMatch: first.thumbnail.sha256 === second.thumbnail.sha256,
    };
  }
  const assetValidation = bake ? validateBakedAssets(bakeMetadata) : { valid: false, errors: ["Baking was skipped."] };
  const hashes = {
    terrainHash: terrainPlan.hashes.terrainHash,
    blockerHash: terrainPlan.hashes.blockerHash,
    roadHash: terrainPlan.hashes.roadHash,
    cityHash: hashObject(cities),
    startingCandidateHash: hashObject(startingCandidates),
    compositionHash: hashObject(compositionInput),
    webpHash: bakeMetadata?.map?.sha256 || "",
    thumbnailHash: bakeMetadata?.thumbnail?.sha256 || "",
  };
  const packageValue = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    generatorVersion: PHASE5_GENERATOR_VERSION,
    assetLibraryVersion: ASSET_LIBRARY_VERSION,
    terrainPlanVersion: TERRAIN_PLAN_VERSION,
    developmentOnly: true,
    publicationAllowed: false,
    activationAllowed: false,
    lifecycle: "STANDBY",
    worldId: allocation.worldId,
    seasonId: allocation.seasonId,
    regionId: allocation.regionId,
    coordinate: allocation.coordinate,
    clockwiseSlot: allocation.coordinate.clockwiseOrderIndex,
    seed: terrainPlan.seed,
    profile,
    cityCapacity: PLAYER_REGION_CITY_CAPACITY,
    minimumNpcCitiesForSpawn: MINIMUM_NPC_CITIES_FOR_SPAWN,
    runtimeSpawnEligibilitySource: "authoritative_current_generation_city_ownership_transaction",
    catalogEntry,
    topology: allocation.connections,
    terrain: {
      profile,
      landPolygon: terrainPlan.landPolygon,
      gameplayCoordinateSystem: terrainPlan.gameplayCoordinateSystem,
      crossings: terrainPlan.crossings,
    },
    blockers: terrainPlan.blockers,
    blockerMask: terrainPlan.blockerMask,
    roads: terrainPlan.roadSystem,
    cities,
    startingCandidates,
    composition: compositionInput,
    regionDefinition,
    geometryArtParity: parity,
    assetValidation,
    determinism: {
      webpRepeatMatch: bakeMetadata?.webpRepeatMatch === true,
      thumbnailRepeatMatch: bakeMetadata?.thumbnailRepeatMatch === true,
    },
    mapWebp: bakeMetadata?.map || null,
    thumbnailWebp: bakeMetadata?.thumbnail || null,
    hashes,
  };
  const validation = validatePlayerPackage(packageValue);
  packageValue.validationReceipt = {
    schemaVersion: 1,
    valid: validation.valid,
    errors: validation.errors,
    stateHistory: ["ALLOCATED", "GENERATING", "VALIDATING", validation.valid ? "STANDBY" : "FAILED"],
    publicationBlocked: true,
    activationBlocked: true,
    coordinateReusable: !validation.valid,
    geometryArtParity: parity,
    assetValidation,
  };
  packageValue.generationManifest = {
    schemaVersion: 1,
    generatorVersion: PHASE5_GENERATOR_VERSION,
    assetLibraryVersion: ASSET_LIBRARY_VERSION,
    terrainPlanVersion: TERRAIN_PLAN_VERSION,
    worldId: allocation.worldId,
    seasonId: allocation.seasonId,
    regionId: allocation.regionId,
    coordinate: allocation.coordinate,
    layer: allocation.coordinate.worldLayer,
    clockwiseSlot: allocation.coordinate.clockwiseOrderIndex,
    seed: terrainPlan.seed,
    hashes,
  };
  let outputFiles = [];
  if (bake) {
    outputFiles = writePackageFiles(outputDirectory, packageValue);
    outputFiles.push("map.webp", "thumbnail.webp");
    packageValue.fileManifest = buildFileManifest(outputDirectory, outputFiles);
    packageValue.packageHash = hashObject(createPackageProjection(packageValue));
    writeJson(path.join(outputDirectory, "package.json"), {
      ...createPackageProjection(packageValue),
      packageHash: packageValue.packageHash,
    });
    outputFiles.push("package.json");
  }
  const heapAfter = process.memoryUsage().heapUsed;
  return {
    status: validation.valid ? "standby" : "rolled_back",
    lifecycle: validation.valid ? "STANDBY" : "ROLLED_BACK",
    developmentOnly: true,
    publicationAllowed: false,
    activationAllowed: false,
    allocation,
    profile,
    terrainPlan,
    prototype,
    package: packageValue,
    bake: bakeMetadata,
    outputFiles,
    validation,
    timings: {
      terrainPlanMs: roundMs(terrainPlanMs),
      cityPlacementMs: roundMs(cityPlacementMs),
      compositionAndWebpMs: roundMs(bakeMs),
      totalMs: roundMs(performance.now() - startedAt),
      approximateHeapDeltaBytes: heapAfter - heapBefore,
    },
  };
}

module.exports = Object.freeze({
  PHASE5_GENERATOR_VERSION,
  PACKAGE_SCHEMA_VERSION,
  createPackageProjection,
  composePlayerRegion,
  resolvePython,
});
