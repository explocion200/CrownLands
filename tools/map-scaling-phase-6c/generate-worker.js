"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { parentPort, workerData } = require("node:worker_threads");
const {
  GENERATOR_VERSION,
  createArtworkPlan,
  createDefinition,
  loadAssetManifest,
  validateGeometryArtParity,
} = require("../map-scaling-phase-6b/composer");
const { generateRegionPrototype, hashObject } = require("../map-scaling-phase-4/generator");

const CITY_CAPACITY = 40;
const LOCAL_DENSITY_RADIUS = 240;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function round(value, precision = 3) {
  const scale = 10 ** precision;
  return Math.round(Number(value) * scale) / scale;
}

function cityMetrics(cities) {
  let minimumSpacing = Number.POSITIVE_INFINITY;
  let maximumSpacing = 0;
  let localNeighborTotal = 0;
  for (let left = 0; left < cities.length; left += 1) {
    let localNeighbors = 0;
    for (let right = 0; right < cities.length; right += 1) {
      if (left === right) continue;
      const distance = Math.hypot(cities[left].x - cities[right].x, cities[left].y - cities[right].y);
      if (right > left) {
        minimumSpacing = Math.min(minimumSpacing, distance);
        maximumSpacing = Math.max(maximumSpacing, distance);
      }
      if (distance <= LOCAL_DENSITY_RADIUS) localNeighbors += 1;
    }
    localNeighborTotal += localNeighbors;
  }
  return {
    minimumSpacing: round(minimumSpacing),
    maximumSpacing: round(maximumSpacing),
    localDensityRadius: LOCAL_DENSITY_RADIUS,
    averageLocalDensity: round(localNeighborTotal / Math.max(1, cities.length)),
  };
}

function normalizedPlacement(placement) {
  return {
    assetId: placement.assetId,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    flipHorizontal: Boolean(placement.flipHorizontal),
    flipVertical: Boolean(placement.flipVertical),
  };
}

function createVisualHashes(plan, cities) {
  const foundation = { assetId: plan.foundation.assetId, transform: plan.foundation.transform || "none" };
  const barriers = plan.barriers.map(normalizedPlacement);
  const roads = plan.roads.map(normalizedPlacement);
  const roadGeometry = plan.roadSystem.edgeRoads.map(road => ({
    side: road.side,
    halfWidth: road.halfWidth,
    points: road.points,
  }));
  const accents = plan.accents.map(normalizedPlacement);
  const cityCoordinates = cities.map(city => ({ x: city.x, y: city.y }))
    .sort((left, right) => left.x - right.x || left.y - right.y);
  return {
    foundationSelectionHash: hashObject(foundation),
    barrierSelectionHash: hashObject(barriers),
    roadLayoutHash: hashObject(roadGeometry),
    roadPresentationHash: hashObject(roads),
    accentSetHash: hashObject(accents.map(accent => accent.assetId).sort()),
    accentPlanHash: hashObject(accents),
    cityPlanHash: hashObject(cityCoordinates),
    compositionPlanHash: hashObject({ foundation, barriers, roads, accents }),
  };
}

function generateExactForty(job, plan, existingRegions) {
  const definition = createDefinition(job.allocation, plan);
  const failures = [];
  for (let attempt = 1; attempt <= 160; attempt += 1) {
    const seedSalt = `phase6b|${plan.theme.key}|${plan.variantKey}|layout-${attempt}`;
    const generated = generateRegionPrototype({
      existingRegions,
      allocation: job.allocation,
      definition,
      generatorVersion: GENERATOR_VERSION,
      seedSalt,
      config: { maximumCandidateEvaluations: 320000, attractionProbability: 0.28 },
    });
    if (generated.status === "standby" && generated.previewDefinition.cities.length === CITY_CAPACITY) {
      return { generated, attempt, seedSalt, failures };
    }
    failures.push({
      attempt,
      placedCities: generated.previewDefinition?.cities?.length || 0,
      validationErrors: generated.validation?.errors || [],
    });
  }
  throw new Error(`Unable to place exactly ${CITY_CAPACITY} cities in ${job.allocation.regionId}.`);
}

function processJob(job, existingRegions, manifest, outputRoot) {
  const startedAt = performance.now();
  const plan = createArtworkPlan({
    allocation: job.allocation,
    themeKey: job.theme,
    variantKey: job.variant,
    retrySalt: job.retrySalt,
    manifest,
  });
  const parity = validateGeometryArtParity(plan);
  if (!parity.valid) throw new Error(parity.errors.join(" "));
  const generatedResult = generateExactForty(job, plan, existingRegions);
  const generated = generatedResult.generated;
  const cities = generated.previewDefinition.cities;
  const startingCandidates = generated.previewDefinition.startingCityCandidates;
  const hashes = createVisualHashes(plan, cities);
  const packageDirectory = path.join(outputRoot, "packages", job.key);
  writeJson(path.join(packageDirectory, "composition.json"), plan);
  writeJson(path.join(packageDirectory, "cities.json"), cities);
  writeJson(path.join(packageDirectory, "starting-candidates.json"), startingCandidates);
  const summary = {
    index: job.index,
    key: job.key,
    packageDirectory: path.relative(outputRoot, packageDirectory).replace(/\\/g, "/"),
    regionId: job.allocation.regionId,
    coordinate: job.allocation.coordinate,
    layer: job.allocation.coordinate.worldLayer,
    clockwiseOrderIndex: job.allocation.coordinate.clockwiseOrderIndex,
    theme: job.theme,
    variant: job.variant,
    seed: {
      artworkStrategy: plan.seed.strategy,
      artworkMaterialHash: plan.seed.materialHash,
      artworkRetrySalt: plan.seed.retrySalt,
      cityStrategy: generated.seed.strategy,
      citySeedHash: generated.seed.seedHash,
      citySeedSalt: generatedResult.seedSalt,
    },
    foundation: {
      assetId: plan.foundation.assetId,
      transform: plan.foundation.transform || "none",
    },
    barriers: plan.barriers.map(normalizedPlacement),
    roads: plan.roads.map(normalizedPlacement),
    roadGeometry: plan.roadSystem.edgeRoads,
    accents: plan.accents.map(normalizedPlacement),
    hashes,
    cityCount: cities.length,
    startingCandidateCount: startingCandidates.length,
    cityMetrics: cityMetrics(cities),
    generationAttempt: generatedResult.attempt,
    retryCount: generatedResult.attempt - 1,
    failedAttempts: generatedResult.failures,
    candidateMetrics: generated.metrics,
    topology: job.allocation.connections,
    parity,
    status: generated.status,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    activationAllowed: false,
    planAndCityGenerationMs: round(performance.now() - startedAt),
  };
  writeJson(path.join(packageDirectory, "generation-metadata.json"), summary);
  return summary;
}

function run() {
  const { jobs, existingRegions, outputRoot } = workerData;
  const manifest = loadAssetManifest();
  const summaries = [];
  for (let index = 0; index < jobs.length; index += 1) {
    summaries.push(processJob(jobs[index], existingRegions, manifest, outputRoot));
    if ((index + 1) % 10 === 0 || index + 1 === jobs.length) {
      parentPort.postMessage({ type: "progress", completed: index + 1 });
    }
  }
  parentPort.postMessage({ type: "complete", summaries });
}

run();
