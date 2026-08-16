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
const { ROOT, GENERATOR_VERSION, loadAssetManifest } = require("./map-scaling-phase-6d/composer");
const { resolvePython } = require("./map-scaling-phase-6b/composer");

const PHASE = "6E";
const SAMPLE_COUNT = Number(process.env.PHASE6E_SAMPLE_COUNT) || 10000;
const WORLD_ID = "phase6d_development_world";
const SEASON_ID = "phase6d_development_season";
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6e", "study");
const STAGING_ROOT = path.join(OUTPUT_ROOT, "staging");
const WORKER_PATH = path.join(__dirname, "map-scaling-phase-6e", "generate-worker.js");
const PYTHON_ROOT = path.join(__dirname, "map-scaling-phase-6e");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
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
    phase: "6D",
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
    if ((index + 1) % 1000 === 0 || index + 1 === SAMPLE_COUNT) {
      console.log(`Phase 6E clockwise allocation: ${index + 1}/${SAMPLE_COUNT}`);
    }
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

async function runGenerationWorkers(jobs, existingRegions, workerCount, outputRoot, label) {
  const chunks = partition(jobs, workerCount);
  const stagingRoot = path.join(outputRoot, "staging");
  fs.mkdirSync(stagingRoot, { recursive: true });
  let totalProgress = 0;
  const receipts = await Promise.all(chunks.map((chunk, workerIndex) => new Promise((resolve, reject) => {
    const shardPath = path.join(stagingRoot, `worker-${String(workerIndex + 1).padStart(2, "0")}.jsonl`);
    const worker = new Worker(WORKER_PATH, {
      workerData: { jobs: chunk, existingRegions, shardPath },
    });
    let lastProgress = 0;
    let completed = false;
    worker.on("message", message => {
      if (message.type === "progress") {
        totalProgress += message.completed - lastProgress;
        lastProgress = message.completed;
        if (totalProgress % 100 === 0 || totalProgress === jobs.length) {
          console.log(`${label}: ${totalProgress}/${jobs.length}`);
        }
      } else if (message.type === "complete") {
        completed = true;
        resolve(message);
      }
    });
    worker.on("error", reject);
    worker.on("exit", code => {
      if (code !== 0) reject(new Error(`Phase 6E worker ${workerIndex + 1} exited with code ${code}.`));
      else if (!completed) reject(new Error(`Phase 6E worker ${workerIndex + 1} exited without a completion receipt.`));
    });
  })));
  return receipts;
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

function safeRemoveGeneratedDirectory(target, requiredParent) {
  const resolved = path.resolve(target);
  const parent = `${path.resolve(requiredParent)}${path.sep}`;
  assert(resolved.startsWith(parent), `Refusing to remove path outside ${requiredParent}: ${resolved}`);
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
}

function verificationJobs(jobs) {
  const indexes = new Set();
  for (let index = 0; index < 8; index += 1) indexes.add(index);
  for (let index = Math.max(0, jobs.length - 8); index < jobs.length; index += 1) indexes.add(index);
  for (let slot = 0; slot < 48; slot += 1) indexes.add(Math.round((jobs.length - 1) * slot / 47));
  return [...indexes].sort((left, right) => left - right).map((index, subsetIndex) => ({
    ...jobs[index],
    index: subsetIndex,
    sourceIndex: index,
  }));
}

function createDeterminismReceipt(primaryManifestPath, verificationManifestPath) {
  const primary = new Map(readJsonLines(primaryManifestPath).map(record => [record.key, record]));
  const verification = readJsonLines(verificationManifestPath);
  const comparisons = verification.map(record => {
    const original = primary.get(record.key);
    assert(original, `Missing primary record for deterministic verification ${record.key}.`);
    const fields = {
      compositionPlan: original.hashes.compositionPlanHash === record.hashes.compositionPlanHash,
      cityDefinitions: original.hashes.cityDefinitionsHash === record.hashes.cityDefinitionsHash,
      cityLayout: original.hashes.cityPlanHash === record.hashes.cityPlanHash,
      rawRaster: original.raster.rawPixelHash === record.raster.rawPixelHash,
      webp: original.raster.webpHash === record.raster.webpHash,
      thumbnail: original.raster.thumbnailHash === record.raster.thumbnailHash,
      package: original.packageHash === record.packageHash,
    };
    return {
      key: record.key,
      sourceIndex: original.index,
      layer: original.layer,
      theme: original.theme,
      fields,
      byteAndHashIdentical: Object.values(fields).every(Boolean),
    };
  });
  return {
    schemaVersion: 1,
    phase: PHASE,
    developmentOnly: true,
    independentRegeneration: true,
    sampleCount: comparisons.length,
    coversEarlyMiddleLateLayers: true,
    directionCoverage: [...new Set(comparisons.map(item => item.theme))].sort(),
    allByteAndHashIdentical: comparisons.every(item => item.byteAndHashIdentical),
    comparisons,
  };
}

async function run() {
  const benchmarkStartedEpochMs = Date.now();
  const startedAt = performance.now();
  const workerCount = Math.max(1, Math.min(
    Number(process.env.PHASE6E_WORKERS) || 8,
    os.availableParallelism?.() || os.cpus().length,
  ));
  const outputParent = path.dirname(OUTPUT_ROOT);
  safeRemoveGeneratedDirectory(OUTPUT_ROOT, outputParent);
  fs.mkdirSync(STAGING_ROOT, { recursive: true });
  const manifest = loadAssetManifest();
  assert.equal(manifest.assetCount, 118, "Phase 6E must evaluate the locked 118-asset library.");
  assert.equal(manifest.categoryCounts.foundation, 12, "Phase 6E requires exactly 12 foundations.");
  assert.equal(
    manifest.categoryCounts.perimeter_barrier + manifest.categoryCounts.perimeter_barrier_variant,
    48,
    "Phase 6E requires exactly 48 perimeter segments.",
  );
  assert.equal(manifest.categoryCounts.internal_road_module, 8, "Phase 6E requires exactly eight added road modules.");
  const allocationStartedAt = performance.now();
  const world = buildWorldSample();
  const allocationMs = performance.now() - allocationStartedAt;
  const maximumLayer = Math.max(...world.jobs.map(job => job.allocation.coordinate.worldLayer));
  console.log(`Phase 6E allocated ${world.jobs.length} deterministic regions through Layer ${maximumLayer}.`);
  const generationStartedAt = performance.now();
  const generationReceipts = await runGenerationWorkers(
    world.jobs,
    world.existingRegions,
    workerCount,
    OUTPUT_ROOT,
    "Phase 6E plan/city generation",
  );
  const planAndCityWallClockMs = performance.now() - generationStartedAt;
  await runPython("render-compact.py", [
    "--root", ROOT,
    "--output", OUTPUT_ROOT,
    "--workers", String(workerCount),
  ]);

  const verificationRoot = path.join(outputParent, "verification-work");
  safeRemoveGeneratedDirectory(verificationRoot, outputParent);
  fs.mkdirSync(path.join(verificationRoot, "staging"), { recursive: true });
  const subset = verificationJobs(world.jobs);
  await runGenerationWorkers(
    subset,
    world.existingRegions,
    Math.min(workerCount, 4),
    verificationRoot,
    "Phase 6E independent determinism regeneration",
  );
  await runPython("render-compact.py", [
    "--root", ROOT,
    "--output", verificationRoot,
    "--workers", String(Math.min(workerCount, 4)),
  ]);
  const determinism = createDeterminismReceipt(
    path.join(OUTPUT_ROOT, "compact-manifest.jsonl"),
    path.join(verificationRoot, "compact-manifest.jsonl"),
  );
  assert(determinism.allByteAndHashIdentical, "Phase 6E independent determinism verification failed.");
  writeJson(path.join(OUTPUT_ROOT, "determinism-receipt.json"), determinism);
  safeRemoveGeneratedDirectory(verificationRoot, outputParent);

  writeJson(path.join(OUTPUT_ROOT, "run-metadata.json"), {
    schemaVersion: 1,
    phase: PHASE,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    activationAllowed: false,
    benchmarkStartedEpochMs,
    benchmarkOrchestrationMsBeforeAnalysis: Math.round((performance.now() - startedAt) * 1000) / 1000,
    sampleCount: SAMPLE_COUNT,
    worldId: WORLD_ID,
    seasonId: SEASON_ID,
    generatorVersion: GENERATOR_VERSION,
    assetLibraryVersion: manifest.assetLibraryVersion,
    assetCount: manifest.assetCount,
    workerCount,
    coreFixtureCount: world.coreCount,
    maximumLayer,
    allocationMs: Math.round(allocationMs * 1000) / 1000,
    planAndCityWallClockMs: Math.round(planAndCityWallClockMs * 1000) / 1000,
    approximatePeakGenerationWorkerRssBytes: Math.max(...generationReceipts.map(receipt => receipt.peakRssBytes)),
    exactPhase6dInputExtension: true,
    firstThousandUseApprovedPhase6dWorldInputs: true,
  });

  await runPython("analyze-scale.py", ["--root", ROOT, "--output", OUTPUT_ROOT]);
  safeRemoveGeneratedDirectory(STAGING_ROOT, OUTPUT_ROOT);
  const results = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "phase-6e-results.json"), "utf8"));
  console.log(`Phase 6E analyzed ${results.sample.totalMaps} maps through Layer ${results.sample.maximumLayer}.`);
  console.log(`Exact WebP duplicates: ${results.exactDuplicates.webpRasters.duplicateMapCount}. Near pairs >= 0.965: ${results.nearDuplicates.flaggedPairCount}.`);
  console.log(`118-asset 10,000-map decision: ${results.assetDecision.sufficientForTenThousandMaps ? "PASS" : "REVIEW REQUIRED"}.`);
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
  run,
});
