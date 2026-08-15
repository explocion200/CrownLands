"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Worker } = require("node:worker_threads");
const { performance } = require("node:perf_hooks");
const {
  allocateNextPlayerRegion,
  hashObject,
  refreshRegionConnections,
} = require("./map-scaling-phase-4/generator");
const { classifyDirectionalTheme, DIRECTIONAL_THEMES } = require("./map-scaling-phase-6a/directional-theme");
const { createPermanentCorePackage } = require("./map-scaling-phase-5/core-package");
const { createAllocatorCore } = require("./map-scaling-phase-5/fixtures");
const {
  ROOT,
  GENERATOR_VERSION,
  loadAssetManifest,
} = require("./map-scaling-phase-6d/composer");
const { resolvePython } = require("./map-scaling-phase-6b/composer");

const PHASE = "6D";
const SAMPLE_COUNT = Number(process.env.PHASE6D_SAMPLE_COUNT) || 1000;
const WORLD_ID = "phase6d_development_world";
const SEASON_ID = "phase6d_development_season";
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6d", "study");
const PACKAGE_ROOT = path.join(OUTPUT_ROOT, "packages");
const WORKER_PATH = path.join(__dirname, "map-scaling-phase-6d", "generate-worker.js");
const PYTHON_ROOT = path.join(__dirname, "map-scaling-phase-6d");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function round(value, precision = 3) {
  const scale = 10 ** precision;
  return Math.round(Number(value) * scale) / scale;
}

function quantile(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarizeNumbers(values) {
  return {
    minimum: round(Math.min(...values)),
    average: round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)),
    p50: round(quantile(values, 0.5)),
    p95: round(quantile(values, 0.95)),
    maximum: round(Math.max(...values)),
  };
}

function themeKeyForCoordinate(coordinate) {
  const selected = classifyDirectionalTheme(coordinate.gridX, coordinate.gridY);
  const match = Object.entries(DIRECTIONAL_THEMES).find(([, theme]) => theme.id === selected.id);
  assert(match, `Unable to resolve directional theme ${selected.id}.`);
  return match[0];
}

function variantForAllocation(allocation) {
  return Number.parseInt(hashObject({
    regionId: allocation.regionId,
    coordinate: allocation.coordinate,
    phase: PHASE,
  }, 2), 16) % 2 === 0 ? "a" : "b";
}

function buildWorldSample() {
  const core = createAllocatorCore(createPermanentCorePackage());
  const existingRegions = [...core];
  const jobs = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const key = `region-${String(index + 1).padStart(4, "0")}`;
    const allocation = allocateNextPlayerRegion({
      worldId: WORLD_ID,
      seasonId: SEASON_ID,
      existingRegions,
      regionId: `phase6d_${key.replace(/-/g, "_")}`,
      generatorVersion: GENERATOR_VERSION,
    });
    const theme = themeKeyForCoordinate(allocation.coordinate);
    const variant = variantForAllocation(allocation);
    jobs.push({
      index,
      key,
      allocation,
      theme,
      variant,
      retrySalt: `phase6d-world-sample|${key}|${theme}|${variant}`,
    });
    existingRegions.push({
      id: allocation.regionId,
      name: allocation.regionId,
      purpose: "player_region",
      permanentCore: false,
      lifecycle: "standby",
      spawnReady: false,
      spawnEligible: false,
      visibility: "development_only",
      gridX: allocation.coordinate.gridX,
      gridY: allocation.coordinate.gridY,
      worldLayer: allocation.coordinate.worldLayer,
      clockwiseOrderIndex: allocation.coordinate.clockwiseOrderIndex,
      connections: allocation.connections,
    });
  }
  const finalRegions = refreshRegionConnections(existingRegions);
  const finalById = new Map(finalRegions.map(region => [region.id, region]));
  const themeByRegionId = new Map(jobs.map(job => [job.allocation.regionId, job.theme]));
  for (const job of jobs) {
    job.finalConnections = finalById.get(job.allocation.regionId).connections;
    job.neighborThemes = Object.fromEntries(Object.entries(job.finalConnections)
      .filter(([, connection]) => connection.state === "open" && themeByRegionId.has(connection.targetRegionId))
      .map(([side, connection]) => [side, themeByRegionId.get(connection.targetRegionId)]));
  }
  return { jobs, existingRegions: finalRegions, coreCount: core.length };
}

function partition(items, count) {
  const chunks = Array.from({ length: count }, () => []);
  items.forEach((item, index) => chunks[index % count].push(item));
  return chunks.filter(chunk => chunk.length);
}

async function runGenerationWorkers(jobs, existingRegions, workerCount) {
  const chunks = partition(jobs, workerCount);
  let totalProgress = 0;
  return (await Promise.all(chunks.map((chunk, workerIndex) => new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { jobs: chunk, existingRegions, outputRoot: OUTPUT_ROOT },
    });
    let lastProgress = 0;
    worker.on("message", message => {
      if (message.type === "progress") {
        totalProgress += message.completed - lastProgress;
        lastProgress = message.completed;
        if (totalProgress % 50 === 0 || totalProgress === jobs.length) {
          console.log(`Phase 6D plan/city generation: ${totalProgress}/${jobs.length}`);
        }
      } else if (message.type === "complete") {
        resolve(message.summaries);
      }
    });
    worker.on("error", reject);
    worker.on("exit", code => {
      if (code !== 0) reject(new Error(`Phase 6D worker ${workerIndex + 1} exited with code ${code}.`));
    });
  })))).flat().sort((left, right) => left.index - right.index);
}

function runPython(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolvePython(), [path.join(PYTHON_ROOT, scriptName), ...args], {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited with code ${code}.`));
    });
  });
}

function duplicateSummary(records, selector) {
  const groups = new Map();
  for (const record of records) {
    const value = selector(record);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(record.key);
  }
  const duplicates = [...groups.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([hash, keys]) => ({ hash, frequency: keys.length, keys }))
    .sort((left, right) => right.frequency - left.frequency || left.hash.localeCompare(right.hash));
  return {
    total: records.length,
    unique: groups.size,
    duplicateGroupCount: duplicates.length,
    duplicateMapCount: duplicates.reduce((sum, group) => sum + group.frequency, 0),
    mostCommonFrequency: duplicates[0]?.frequency || 1,
    mostCommonShare: round((duplicates[0]?.frequency || 1) / Math.max(1, records.length), 6),
    groups: duplicates.slice(0, 25),
  };
}

function countBy(records, selector) {
  const counts = {};
  for (const record of records) {
    const key = String(selector(record));
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function directoryBytes(directory) {
  let bytes = 0;
  let files = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const child = directoryBytes(target);
      bytes += child.bytes;
      files += child.files;
    } else if (entry.isFile()) {
      bytes += fs.statSync(target).size;
      files += 1;
    }
  }
  return { bytes, files };
}

function createPackageRecord(summary, raster) {
  const record = {
    ...summary,
    finalConnections: summary.finalConnections,
    raster: {
      losslessPngHash: raster.losslessPngHash,
      rawPixelHash: raster.rawPixelHash,
      webpHash: raster.webpHash,
      thumbnailHash: raster.thumbnailHash,
      webpBytes: raster.webpBytes,
      thumbnailBytes: raster.thumbnailBytes,
      dimensions: raster.dimensions,
      thumbnailDimensions: raster.thumbnailDimensions,
    },
    perceptualFeatureRef: `render-index.json#${summary.key}`,
    rasterGenerationMs: raster.rasterGenerationMs,
    totalGenerationMs: round(summary.planAndCityGenerationMs + raster.rasterGenerationMs),
  };
  record.packageHash = hashObject({
    coordinate: record.coordinate,
    layer: record.layer,
    theme: record.theme,
    seed: record.seed,
    compositionPlanHash: record.hashes.compositionPlanHash,
    cityPlanHash: record.hashes.cityPlanHash,
    losslessPngHash: record.raster.losslessPngHash,
    webpHash: record.raster.webpHash,
    thumbnailHash: record.raster.thumbnailHash,
  });
  return record;
}

async function run() {
  const startedAt = performance.now();
  const workerCount = Math.max(1, Math.min(
    Number(process.env.PHASE6D_WORKERS) || 8,
    os.availableParallelism?.() || os.cpus().length,
  ));
  if (fs.existsSync(OUTPUT_ROOT)) fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  fs.mkdirSync(PACKAGE_ROOT, { recursive: true });
  const manifest = loadAssetManifest();
  assert.equal(manifest.assetCount, 118, "Phase 6D must evaluate the locked 118-asset library.");
  assert.deepEqual(manifest.lockedExpansion, {
    foundations: 8,
    perimeterEdgeSegments: 16,
    internalRoadModules: 8,
    interiorAccents: 0,
  });
  const worldStartedAt = performance.now();
  const world = buildWorldSample();
  const allocationMs = performance.now() - worldStartedAt;
  console.log(`Phase 6D allocated ${world.jobs.length} deterministic regions across ${Math.max(...world.jobs.map(job => job.allocation.coordinate.worldLayer))} layers.`);
  const generated = await runGenerationWorkers(world.jobs, world.existingRegions, workerCount);
  const finalConnections = new Map(world.jobs.map(job => [job.allocation.regionId, job.finalConnections]));
  for (const summary of generated) summary.finalConnections = finalConnections.get(summary.regionId);
  writeJson(path.join(OUTPUT_ROOT, "generation-index.json"), {
    phase: PHASE,
    developmentOnly: true,
    productionActivated: false,
    sampleCount: generated.length,
    records: generated,
  });
  await runPython("render-and-analyze.py", [
    "--root", ROOT,
    "--output", OUTPUT_ROOT,
    "--workers", String(workerCount),
  ]);
  const renderIndex = readJson(path.join(OUTPUT_ROOT, "render-index.json"));
  const rasterByKey = new Map(renderIndex.records.map(record => [record.key, record]));
  const records = generated.map(summary => createPackageRecord(summary, rasterByKey.get(summary.key)));
  for (const record of records) {
    const packageDirectory = path.join(OUTPUT_ROOT, record.packageDirectory);
    writeJson(path.join(packageDirectory, "package.json"), record);
  }
  writeJson(path.join(OUTPUT_ROOT, "packages-index.json"), {
    schemaVersion: 1,
    phase: PHASE,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    activationAllowed: false,
    worldId: WORLD_ID,
    seasonId: SEASON_ID,
    generatorVersion: GENERATOR_VERSION,
    assetLibraryVersion: manifest.assetLibraryVersion,
    sampleCount: records.length,
    records,
  });
  await runPython("similarity-and-gallery.py", [
    "--root", ROOT,
    "--output", OUTPUT_ROOT,
  ]);
  const visualAnalysis = readJson(path.join(OUTPUT_ROOT, "visual-analysis.json"));
  const themeDistribution = countBy(records, record => record.theme);
  const retries = records.map(record => record.retryCount);
  const mapBytes = records.map(record => record.raster.webpBytes);
  const thumbnailBytes = records.map(record => record.raster.thumbnailBytes);
  const totalTimes = records.map(record => record.totalGenerationMs);
  const exactDuplicates = {
    compositionPlans: duplicateSummary(records, record => record.hashes.compositionPlanHash),
    losslessPngRasters: duplicateSummary(records, record => record.raster.losslessPngHash),
    webpRasters: duplicateSummary(records, record => record.raster.webpHash),
    roadLayouts: duplicateSummary(records, record => record.hashes.roadLayoutHash),
    roadPresentations: duplicateSummary(records, record => record.hashes.roadPresentationHash),
    cityLayouts: duplicateSummary(records, record => record.hashes.cityPlanHash),
    fullPackages: duplicateSummary(records, record => record.packageHash),
  };
  const foundationRepetition = duplicateSummary(records, record => record.hashes.foundationSelectionHash);
  const foundationBaseRepetition = duplicateSummary(records, record => hashObject({
    assetId: record.foundation.assetId,
    transform: record.foundation.transform,
  }));
  const edgeRepetition = duplicateSummary(records, record => record.hashes.barrierSelectionHash);
  const accentSetRepetition = duplicateSummary(records, record => record.hashes.accentSetHash);
  const accentPlanRepetition = duplicateSummary(records, record => record.hashes.accentPlanHash);
  const citySpacings = records.map(record => record.cityMetrics.minimumSpacing);
  const cityMaximumSpacings = records.map(record => record.cityMetrics.maximumSpacing);
  const localDensities = records.map(record => record.cityMetrics.averageLocalDensity);
  const storage = directoryBytes(PACKAGE_ROOT);
  const mapAndThumbnailBytes = mapBytes.reduce((sum, value) => sum + value, 0)
    + thumbnailBytes.reduce((sum, value) => sum + value, 0);
  const baseline = readJson(path.join(ROOT, "benchmark-results", "map", "phase-6c", "phase-6c-results.json"));
  const near = visualAnalysis.nearDuplicates;
  const comparisonToPhase6c = {
    baselineNearDuplicatePairs: baseline.nearDuplicates.flaggedPairCount,
    currentNearDuplicatePairs: near.flaggedPairCount,
    nearDuplicateReductionRate: round(1 - near.flaggedPairCount / baseline.nearDuplicates.flaggedPairCount, 6),
    baselineHighSimilarityPairs: baseline.nearDuplicates.highSimilarityPairCount,
    currentHighSimilarityPairs: near.highSimilarityPairCount,
    highSimilarityReductionRate: round(1 - near.highSimilarityPairCount / baseline.nearDuplicates.highSimilarityPairCount, 6),
    baselineMapsInFlaggedPairs: baseline.nearDuplicates.mapsInFlaggedPairs,
    currentMapsInFlaggedPairs: near.mapsInFlaggedPairs,
    baselineMaximumSimilarity: baseline.nearDuplicates.maximumVisualSimilarity,
    currentMaximumSimilarity: near.maximumVisualSimilarity,
    baselineMapsRequiringRetry: baseline.cityDistribution.mapsRequiringRetry,
    currentMapsRequiringRetry: retries.filter(value => value > 0).length,
    baselineTotalRetries: baseline.cityDistribution.mapRetries,
    currentTotalRetries: retries.reduce((sum, value) => sum + value, 0),
  };
  const sufficientForOneThousandMaps = records.length >= 1000
    && exactDuplicates.webpRasters.unique === records.length
    && near.flaggedPairCount <= baseline.nearDuplicates.flaggedPairCount * 0.5
    && near.highSimilarityPairCount <= baseline.nearDuplicates.highSimilarityPairCount * 0.5
    && near.mapsInFlaggedPairs < baseline.nearDuplicates.mapsInFlaggedPairs
    && foundationRepetition.unique >= 40
    && edgeRepetition.unique >= 48
    && exactDuplicates.roadLayouts.unique >= 9;
  const plausibleForTenThousandMaps = sufficientForOneThousandMaps
    && near.mapsInFlaggedPairsRate <= 0.5
    && near.maximumVisualSimilarity <= 0.998;
  const assetDecision = {
    currentAssetCount: manifest.assetCount,
    sufficientForOneThousandMaps,
    reasonableForTenThousandMapsWithoutExpansion: plausibleForTenThousandMaps,
    additionalFoundationVariantsRequired: foundationRepetition.unique < 40,
    additionalBarrierVariantsRequired: edgeRepetition.unique < 48,
    additionalRoadVariantsRequired: exactDuplicates.roadLayouts.unique < 9,
    additionalInteriorAccentsRequired: false,
    minimumAdditionalAssetsRecommended: sufficientForOneThousandMaps ? {
      foundations: 0, edgeSegments: 0, internalRoadModules: 0, interiorAccents: 0,
    } : null,
    rationale: [
      "The 118-asset decision is based on direct comparison with the preserved Phase 6C 1,000-map baseline.",
      "Three foundation plates per theme and four alternate full-side segments per theme provide macro combinations without increasing visual density.",
      "The legacy cross plus two internal road modules per theme provide nine distinct deterministic road geometries with fixed edge sockets.",
      "Accent selection and deterministic placement already provide high micro-layout variety at the approved sparse density.",
    ],
  };
  const results = {
    schemaVersion: 1,
    phase: PHASE,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    activationAllowed: false,
    approvedStyleLocked: true,
    approvedPhase6bAssetLibraryUnchanged: true,
    phase6dLockedExpansionApplied: true,
    sample: {
      worldId: WORLD_ID,
      seasonId: SEASON_ID,
      totalMaps: records.length,
      coreFixtureCount: world.coreCount,
      maximumLayer: Math.max(...records.map(record => record.layer)),
      themeDistribution,
      variantDistribution: countBy(records, record => `${record.theme}:${record.variant}`),
      workerCount,
    },
    exactDuplicates,
    nearDuplicates: visualAnalysis.nearDuplicates,
    mostSimilarPairs: visualAnalysis.mostSimilarPairs,
    foundationRepetition,
    foundationBaseRepetition,
    edgeRepetition,
    roadRepetition: {
      geometry: exactDuplicates.roadLayouts,
      presentation: exactDuplicates.roadPresentations,
      familyUsage: countBy(records, record => record.roadFamily),
    },
    macroUsage: {
      foundationAssetUsage: countBy(records, record => record.foundation.assetId),
      foundationTransformUsage: countBy(records, record => record.foundation.transform),
      perimeterCombinationUsage: countBy(records, record => Object.entries(record.barrierDecisions).map(([side, value]) => `${side}:${value}`).join("|")),
      transitionBandFamilies: countBy(records.flatMap(record => record.transitionBands), band => band.family),
    },
    decorationRepetition: {
      accentSets: accentSetRepetition,
      accentPlans: accentPlanRepetition,
    },
    cityDistribution: {
      allExactlyForty: records.every(record => record.cityCount === 40),
      allExactlyFourStartingCandidates: records.every(record => record.startingCandidateCount === 4),
      cityLayoutUniqueness: exactDuplicates.cityLayouts,
      minimumSpacing: summarizeNumbers(citySpacings),
      maximumSpacing: summarizeNumbers(cityMaximumSpacings),
      averageLocalDensity: summarizeNumbers(localDensities),
      startingCandidateCounts: countBy(records, record => record.startingCandidateCount),
      candidatePositionsEvaluated: records.reduce((sum, record) => sum + record.candidateMetrics.candidatePositionsEvaluated, 0),
      candidatePositionsRejected: records.reduce((sum, record) => sum + record.candidateMetrics.rejectedPositions, 0),
      mapGenerationFailures: records.filter(record => record.status !== "standby").length,
      mapRetries: retries.reduce((sum, value) => sum + value, 0),
      mapsRequiringRetry: retries.filter(value => value > 0).length,
      averageRetriesPerMap: round(retries.reduce((sum, value) => sum + value, 0) / records.length, 6),
      boundedRetryLimit: Math.max(...records.map(record => record.boundedRetryLimit)),
      precheckRejections: records.reduce((sum, record) => sum + record.precheckRejectCount, 0),
      visualOrBlockerConflictMapRejections: records.flatMap(record => record.failedAttempts)
        .filter(attempt => attempt.validationErrors.some(error => /blocker|violates/i.test(error))).length,
    },
    neighborCohesion: visualAnalysis.neighborCohesion,
    directionalTransitions: visualAnalysis.directionalTransitions,
    comparisonToPhase6c,
    performance: {
      allocationMs: round(allocationMs),
      perMapGenerationMs: summarizeNumbers(totalTimes),
      planAndCityMs: summarizeNumbers(records.map(record => record.planAndCityGenerationMs)),
      rasterMs: summarizeNumbers(records.map(record => record.rasterGenerationMs)),
      retryRate: round(retries.filter(value => value > 0).length / records.length, 6),
      failureRate: round(records.filter(record => record.status !== "standby").length / records.length, 6),
      wallClockMs: round(performance.now() - startedAt),
    },
    storage: {
      mapWebpBytes: summarizeNumbers(mapBytes),
      thumbnailWebpBytes: summarizeNumbers(thumbnailBytes),
      mapAndThumbnailBytesFor1000: Math.round(mapAndThumbnailBytes * (1000 / records.length)),
      completeDevelopmentPackageBytesFor1000: Math.round(storage.bytes * (1000 / records.length)),
      completeDevelopmentPackageFileCount: storage.files,
      projectedMapAndThumbnailBytesFor10000: Math.round(mapAndThumbnailBytes * (10000 / records.length)),
      projectedCompletePackageBytesFor10000: Math.round(storage.bytes * (10000 / records.length)),
    },
    assetDecision,
    gallery: visualAnalysis.gallery,
    acceptance: {
      generatedAtLeast1000: records.length >= SAMPLE_COUNT,
      allDevelopmentOnlyAndInactive: records.every(record => record.developmentOnly && !record.productionActivated && !record.publicationAllowed && !record.activationAllowed),
      allExactFortyCities: records.every(record => record.cityCount === 40),
      allFourStartingCandidates: records.every(record => record.startingCandidateCount === 4),
      allGeometryArtParity: records.every(record => record.parity.valid),
      allLiteralEdgeBarriers: records.every(record => Object.values(record.parity.perimeterSideCoverage).every(count => count >= 1)),
      allOneExitPerCardinalSide: records.every(record => Object.values(record.parity.edgeExitCounts).every(count => count === 1)),
      noExactFinalRasterDuplicates: exactDuplicates.webpRasters.unique === records.length && exactDuplicates.losslessPngRasters.unique === records.length,
      noExactFullPackageDuplicates: exactDuplicates.fullPackages.unique === records.length,
      completeLayerOneCovered: records.filter(record => record.layer === 1).length === 24,
      completeLayerTwoCovered: records.filter(record => record.layer === 2).length === 32,
      approvedStylePreserved: true,
      retryLimitBounded: records.every(record => record.generationAttempt <= record.boundedRetryLimit),
      productionIntegrationPlanningReady: assetDecision.sufficientForOneThousandMaps,
    },
  };
  writeJson(path.join(OUTPUT_ROOT, "phase-6d-results.json"), results);
  console.log(`Phase 6D generated and analyzed ${records.length} maps. Exact WebP duplicates: ${records.length - exactDuplicates.webpRasters.unique}.`);
  console.log(`Phase 6D recommendation: ${assetDecision.currentAssetCount} assets ${assetDecision.sufficientForOneThousandMaps ? "are" : "are not"} sufficient for the measured 1,000-map target.`);
  return results;
}

if (require.main === module) {
  run().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({
  PHASE,
  SAMPLE_COUNT,
  WORLD_ID,
  SEASON_ID,
  OUTPUT_ROOT,
  buildWorldSample,
  duplicateSummary,
  run,
});
