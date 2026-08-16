"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { parentPort, workerData } = require("node:worker_threads");
const composerModule = workerData.composerModule || "../map-scaling-phase-6d/composer";
const {
  GENERATOR_VERSION,
  createDefinition,
  createRankedArtworkPlans,
  loadAssetManifest,
  validateGeometryArtParity,
} = require(composerModule);
const { generateRegionPrototype, hashObject } = require("../map-scaling-phase-4/generator");
const { generateOptimizedRegionPrototype } = require("../map-scaling-phase-6d/optimized-city-layout");

const CITY_CAPACITY = 40;
const LOCAL_DENSITY_RADIUS = 240;
const LAYOUT_ATTEMPTS_PER_MACRO_PLAN = 4;
const BOUNDED_RETRY_LIMIT = 30;
const PHASE_SEED_TAG = workerData.phaseSeedTag || "phase6d";

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

function normalizedPlacement(item) {
  const normalized = {
    assetId: item.assetId,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    crop: item.crop || null,
    flipHorizontal: Boolean(item.flipHorizontal),
    flipVertical: Boolean(item.flipVertical),
  };
  if (item.roadGeometryId) normalized.roadGeometryId = item.roadGeometryId;
  if (item.roadGeometrySourceTheme) normalized.roadGeometrySourceTheme = item.roadGeometrySourceTheme;
  if (item.roadSkin) normalized.roadSkin = item.roadSkin;
  return normalized;
}

function createVisualHashes(plan, cities) {
  const foundation = {
    assetId: plan.foundation.assetId,
    transform: plan.foundation.transform || "none",
    toneProfile: plan.foundationToneProfile,
  };
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
    barrierSelectionHash: hashObject({ barriers, decisions: plan.barrierDecisions }),
    roadLayoutHash: hashObject(roadGeometry),
    roadPresentationHash: hashObject({ family: plan.roadFamily, roads }),
    accentSetHash: hashObject(accents.map(accent => accent.assetId).sort()),
    accentPlanHash: hashObject(accents),
    transitionBandHash: hashObject(plan.transitionBands),
    cityPlanHash: hashObject(cityCoordinates),
    cityDefinitionsHash: hashObject(cities),
    compositionPlanHash: hashObject({ foundation, barriers, roads, accents, transitionBands: plan.transitionBands }),
  };
}

function generateExactForty(job, existingRegions, manifest) {
  const rankedPlans = createRankedArtworkPlans({
    allocation: job.allocation,
    themeKey: job.theme,
    variantKey: job.variant,
    retrySalt: job.retrySalt,
    neighborThemes: job.neighborThemes,
    inheritedEdgeContracts: job.inheritedEdgeContracts,
    manifest,
  });
  const failures = [];
  let overallAttempt = 0;
  let precheckRejectCount = 0;
  for (const plan of rankedPlans) {
    if (!plan.feasibility.cityCapacityPrecheckPass || !plan.feasibility.transitionZonePrecheckPass) {
      precheckRejectCount += 1;
      failures.push({
        phase: "precheck",
        macroCandidateIndex: plan.macroCandidateIndex,
        validationErrors: ["macro_feasibility_precheck"],
      });
      continue;
    }
    const definition = createDefinition(job.allocation, plan);
    overallAttempt += 1;
    const optimizedSeedSalt = `${PHASE_SEED_TAG}|${plan.theme.key}|${plan.roadGeometryId || plan.roadFamily}|macro-${plan.macroCandidateIndex}|feasibility-layout`;
    const optimized = generateOptimizedRegionPrototype({
      existingRegions,
      allocation: job.allocation,
      definition,
      generatorVersion: GENERATOR_VERSION,
      seedSalt: optimizedSeedSalt,
    });
    if (optimized.status === "standby" && optimized.previewDefinition.cities.length === CITY_CAPACITY) {
      return {
        generated: optimized,
        plan,
        overallAttempt,
        layoutAttempt: 1,
        seedSalt: optimizedSeedSalt,
        failures,
        precheckRejectCount,
        rankedPlanCount: rankedPlans.length,
      };
    }
    failures.push({
      phase: "optimized_generation",
      macroCandidateIndex: plan.macroCandidateIndex,
      validationErrors: optimized.validation?.errors || [],
    });
    for (let layoutAttempt = 1; layoutAttempt <= LAYOUT_ATTEMPTS_PER_MACRO_PLAN; layoutAttempt += 1) {
      overallAttempt += 1;
      if (overallAttempt > BOUNDED_RETRY_LIMIT) break;
      const seedSalt = `${PHASE_SEED_TAG}|${plan.theme.key}|${plan.roadGeometryId || plan.roadFamily}|macro-${plan.macroCandidateIndex}|layout-${layoutAttempt}`;
      const generated = generateRegionPrototype({
        existingRegions,
        allocation: job.allocation,
        definition,
        generatorVersion: GENERATOR_VERSION,
        seedSalt,
        config: { maximumCandidateEvaluations: 320000, attractionProbability: 0.52 },
      });
      if (generated.status === "standby" && generated.previewDefinition.cities.length === CITY_CAPACITY) {
        return {
          generated,
          plan,
          overallAttempt,
          layoutAttempt: layoutAttempt + 1,
          seedSalt,
          failures,
          precheckRejectCount,
          rankedPlanCount: rankedPlans.length,
        };
      }
      failures.push({
        phase: "generation",
        macroCandidateIndex: plan.macroCandidateIndex,
        validationErrors: generated.validation?.errors || [],
      });
    }
    if (overallAttempt >= BOUNDED_RETRY_LIMIT) break;
  }
  throw new Error(`Unable to place exactly ${CITY_CAPACITY} cities in ${job.allocation.regionId} within bounded retry limit ${BOUNDED_RETRY_LIMIT}.`);
}

function processJob(job, existingRegions, manifest) {
  const startedAt = performance.now();
  const generatedResult = generateExactForty(job, existingRegions, manifest);
  const plan = generatedResult.plan;
  const parity = validateGeometryArtParity(plan);
  if (!parity.valid) throw new Error(parity.errors.join(" "));
  const generated = generatedResult.generated;
  const cities = generated.previewDefinition.cities;
  const startingCandidates = generated.previewDefinition.startingCityCandidates;
  const hashes = createVisualHashes(plan, cities);
  const summary = {
    index: job.index,
    key: job.key,
    regionId: job.allocation.regionId,
    coordinate: job.allocation.coordinate,
    layer: job.allocation.coordinate.worldLayer,
    clockwiseSlot: job.allocation.coordinate.clockwiseOrderIndex,
    theme: job.theme,
    variant: job.variant,
    seed: {
      artworkStrategy: plan.seed.strategy,
      artworkMaterialHash: plan.seed.materialHash,
      artworkRetrySalt: plan.seed.retrySalt,
      macroCandidateIndex: plan.macroCandidateIndex,
      cityStrategy: generated.seed.strategy,
      citySeedHash: generated.seed.seedHash,
      citySeedSalt: generatedResult.seedSalt,
    },
    foundation: {
      assetId: plan.foundation.assetId,
      transform: plan.foundation.transform || "none",
      toneProfile: plan.foundationToneProfile,
    },
    barriers: plan.barriers.map(normalizedPlacement),
    barrierDecisions: plan.barrierDecisions,
    cornerSignatures: {
      northEast: `${plan.barrierDecisions.north}|${plan.barrierDecisions.east}`,
      southEast: `${plan.barrierDecisions.south}|${plan.barrierDecisions.east}`,
      southWest: `${plan.barrierDecisions.south}|${plan.barrierDecisions.west}`,
      northWest: `${plan.barrierDecisions.north}|${plan.barrierDecisions.west}`,
    },
    roads: plan.roads.map(normalizedPlacement),
    roadFamily: plan.roadFamily,
    roadGeometryId: plan.roadGeometryId || plan.roadFamily,
    roadGeometrySourceTheme: plan.roadGeometrySourceTheme || job.theme,
    roadSkinTheme: plan.roadModule?.roadSkin?.themeKey || job.theme,
    roadSelectionStrategy: plan.roadSelectionStrategy || "phase6d-theme-bound-selection",
    roadGeometry: plan.roadSystem.edgeRoads,
    accents: plan.accents.map(normalizedPlacement),
    transitionBands: plan.transitionBands,
    feasibility: plan.feasibility,
    hashes,
    cityCount: cities.length,
    startingCandidateCount: startingCandidates.length,
    cityPositions: cities.map(city => ({ id: city.id, x: city.x, y: city.y })),
    startingCandidates: startingCandidates.map(candidate => ({ cityId: candidate.cityId, score: candidate.score })),
    cityMetrics: cityMetrics(cities),
    generationAttempt: generatedResult.overallAttempt,
    layoutAttemptWithinMacro: generatedResult.layoutAttempt,
    retryCount: generatedResult.overallAttempt - 1,
    boundedRetryLimit: BOUNDED_RETRY_LIMIT,
    rankedMacroPlanCount: generatedResult.rankedPlanCount,
    precheckRejectCount: generatedResult.precheckRejectCount,
    failedAttemptReasons: generatedResult.failures.flatMap(attempt => attempt.validationErrors).slice(0, 20),
    candidateMetrics: generated.metrics,
    topology: job.allocation.connections,
    finalConnections: job.finalConnections,
    neighborThemes: job.neighborThemes,
    inheritedEdgeContracts: job.inheritedEdgeContracts || {},
    publishedEdgeContracts: plan.publishedEdgeContracts || null,
    edgeContractHash: plan.edgeContractHash || null,
    parity,
    status: generated.status,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    activationAllowed: false,
    planAndCityGenerationMs: round(performance.now() - startedAt),
  };
  return { summary, renderPlan: plan };
}

function run() {
  const { jobs, existingRegions, shardPath } = workerData;
  const manifest = loadAssetManifest();
  fs.mkdirSync(path.dirname(shardPath), { recursive: true });
  const file = fs.openSync(shardPath, "w");
  let peakRssBytes = process.memoryUsage().rss;
  try {
    for (let index = 0; index < jobs.length; index += 1) {
      fs.writeSync(file, `${JSON.stringify(processJob(jobs[index], existingRegions, manifest))}\n`);
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      if ((index + 1) % 25 === 0 || index + 1 === jobs.length) {
        parentPort.postMessage({ type: "progress", completed: index + 1 });
      }
    }
  } finally {
    fs.closeSync(file);
  }
  parentPort.postMessage({
    type: "complete",
    shardPath,
    count: jobs.length,
    peakRssBytes,
  });
}

run();
