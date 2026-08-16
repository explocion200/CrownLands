"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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
  buildEdgeContracts,
  loadAssetManifest,
} = require("./map-scaling-phase-6f/composer");
const { resolvePython } = require("./map-scaling-phase-6b/composer");

const PHASE = "6F";
const SAMPLE_COUNT = Number(process.env.PHASE6F_SAMPLE_COUNT) || 10000;
const WORLD_ID = "phase6d_development_world";
const SEASON_ID = "phase6d_development_season";
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6f", "study");
const STAGING_ROOT = path.join(OUTPUT_ROOT, "staging");
const WORKER_PATH = path.join(__dirname, "map-scaling-phase-6e", "generate-worker.js");
const RENDERER_PATH = path.join(__dirname, "map-scaling-phase-6e", "render-compact.py");
const ANALYZER_PATH = path.join(__dirname, "map-scaling-phase-6f", "analyze-scale.py");
const COMPOSER_MODULE = "../map-scaling-phase-6f/composer";
const STANDARD_EDGE_ROADS = Object.freeze([
  Object.freeze({ side: "north", halfWidth: 44, points: [{ x: 724, y: 0 }, { x: 724, y: 220 }] }),
  Object.freeze({ side: "east", halfWidth: 44, points: [{ x: 1448, y: 543 }, { x: 1228, y: 543 }] }),
  Object.freeze({ side: "south", halfWidth: 44, points: [{ x: 724, y: 1086 }, { x: 724, y: 866 }] }),
  Object.freeze({ side: "west", halfWidth: 44, points: [{ x: 0, y: 543 }, { x: 220, y: 543 }] }),
]);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

function buildWorldSample(sampleCount = SAMPLE_COUNT, logProgress = true) {
  const core = createAllocatorCore(createPermanentCorePackage());
  const existingRegions = [...core];
  const jobs = [];
  const publishedByRegionId = new Map();
  const themeByRegionId = new Map();
  for (let index = 0; index < sampleCount; index += 1) {
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
    const inheritedEdgeContracts = {};
    const neighborThemes = {};
    for (const [localSide, connection] of Object.entries(allocation.connections)) {
      if (connection.state !== "open") continue;
      const neighborContracts = publishedByRegionId.get(connection.targetRegionId);
      if (!neighborContracts) continue;
      const neighborSide = { north: "south", east: "west", south: "north", west: "east" }[localSide];
      inheritedEdgeContracts[localSide] = neighborContracts.sides[neighborSide];
      neighborThemes[localSide] = themeByRegionId.get(connection.targetRegionId);
    }
    const publishedEdgeContracts = buildEdgeContracts(
      allocation,
      theme,
      STANDARD_EDGE_ROADS,
      inheritedEdgeContracts,
    );
    jobs.push({
      index,
      key,
      allocation,
      theme,
      variant,
      retrySalt: `phase6d-world-sample|${key}|${theme}|${variant}`,
      neighborThemes,
      inheritedEdgeContracts,
      allocationTimeConnections: allocation.connections,
      provisionalPublishedEdgeContracts: publishedEdgeContracts,
    });
    publishedByRegionId.set(allocation.regionId, publishedEdgeContracts);
    themeByRegionId.set(allocation.regionId, theme);
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
    if (logProgress && ((index + 1) % 1000 === 0 || index + 1 === sampleCount)) {
      console.log(`Phase 6F immutable clockwise allocation: ${index + 1}/${sampleCount}`);
    }
  }
  const finalRegions = refreshRegionConnections(existingRegions);
  const finalById = new Map(finalRegions.map(region => [region.id, region]));
  for (const job of jobs) job.finalConnections = finalById.get(job.allocation.regionId).connections;
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
      workerData: {
        jobs: chunk,
        existingRegions,
        shardPath,
        composerModule: COMPOSER_MODULE,
        phaseSeedTag: "phase6f",
      },
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
      if (code !== 0) reject(new Error(`Phase 6F worker ${workerIndex + 1} exited with code ${code}.`));
      else if (!completed) reject(new Error(`Phase 6F worker ${workerIndex + 1} exited without a completion receipt.`));
    });
  })));
  return receipts;
}

function runPython(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolvePython(), [scriptPath, ...args], {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${path.basename(scriptPath)} exited with code ${code}.`)));
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
    ...jobs[index], index: subsetIndex, sourceIndex: index,
  }));
}

function horizonVerificationJobs(jobs) {
  const indexes = [0, 1, 2, 24, 49, 99, 249, 499, 816, 936, 968, 999].filter(index => index < jobs.length);
  return indexes.map((index, subsetIndex) => ({ ...jobs[index], index: subsetIndex, sourceIndex: index }));
}

function compareManifestSubset(primaryManifestPath, verificationManifestPath, receiptKind) {
  const primary = new Map(readJsonLines(primaryManifestPath).map(record => [record.key, record]));
  const verification = readJsonLines(verificationManifestPath);
  const comparisons = verification.map(record => {
    const original = primary.get(record.key);
    assert(original, `Missing primary record for ${receiptKind} verification ${record.key}.`);
    const fields = {
      compositionPlan: original.hashes.compositionPlanHash === record.hashes.compositionPlanHash,
      cityDefinitions: original.hashes.cityDefinitionsHash === record.hashes.cityDefinitionsHash,
      cityLayout: original.hashes.cityPlanHash === record.hashes.cityPlanHash,
      roadGeometry: original.roadGeometryId === record.roadGeometryId,
      roadSkin: original.roadSkinTheme === record.roadSkinTheme,
      edgeContract: original.edgeContractHash === record.edgeContractHash,
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
    receiptKind,
    developmentOnly: true,
    sampleCount: comparisons.length,
    allByteAndHashIdentical: comparisons.every(item => item.byteAndHashIdentical),
    comparisons,
  };
}

async function renderVerification(outputRoot, jobs, existingRegions, workerCount, label) {
  safeRemoveGeneratedDirectory(outputRoot, path.dirname(outputRoot));
  fs.mkdirSync(path.join(outputRoot, "staging"), { recursive: true });
  await runGenerationWorkers(jobs, existingRegions, Math.min(workerCount, 4), outputRoot, label);
  await runPython(RENDERER_PATH, ["--root", ROOT, "--output", outputRoot, "--workers", String(Math.min(workerCount, 4))]);
}

async function run() {
  const benchmarkStartedEpochMs = Date.now();
  const startedAt = performance.now();
  const workerCount = Math.max(1, Math.min(
    Number(process.env.PHASE6F_WORKERS) || 8,
    os.availableParallelism?.() || os.cpus().length,
  ));
  const outputParent = path.dirname(OUTPUT_ROOT);
  safeRemoveGeneratedDirectory(OUTPUT_ROOT, outputParent);
  fs.mkdirSync(STAGING_ROOT, { recursive: true });
  const manifest = loadAssetManifest();
  const assetManifestPath = path.join(ROOT, "benchmark-results", "map", "phase-6d", "asset-library", "asset-manifest.json");
  const assetManifestHashBefore = sha256File(assetManifestPath);
  assert.equal(manifest.assetCount, 118, "Phase 6F must keep the locked 118-asset library.");
  assert.equal(manifest.categoryCounts.foundation, 12);
  assert.equal(manifest.categoryCounts.perimeter_barrier + manifest.categoryCounts.perimeter_barrier_variant, 48);
  assert.equal(manifest.categoryCounts.internal_road_module, 8);

  const allocationStartedAt = performance.now();
  const world = buildWorldSample();
  const allocationMs = performance.now() - allocationStartedAt;
  const maximumLayer = Math.max(...world.jobs.map(job => job.allocation.coordinate.worldLayer));
  console.log(`Phase 6F allocated ${world.jobs.length} immutable deterministic regions through Layer ${maximumLayer}.`);
  const generationStartedAt = performance.now();
  const generationReceipts = await runGenerationWorkers(
    world.jobs, world.existingRegions, workerCount, OUTPUT_ROOT, "Phase 6F plan/city generation",
  );
  const planAndCityWallClockMs = performance.now() - generationStartedAt;
  await runPython(RENDERER_PATH, ["--root", ROOT, "--output", OUTPUT_ROOT, "--workers", String(workerCount)]);

  const determinismRoot = path.join(outputParent, "determinism-work");
  const deterministicSubset = verificationJobs(world.jobs);
  await renderVerification(
    determinismRoot, deterministicSubset, world.existingRegions, workerCount,
    "Phase 6F independent determinism regeneration",
  );
  const determinism = compareManifestSubset(
    path.join(OUTPUT_ROOT, "compact-manifest.jsonl"),
    path.join(determinismRoot, "compact-manifest.jsonl"),
    "independent-regeneration",
  );
  assert(determinism.allByteAndHashIdentical, "Phase 6F independent determinism verification failed.");
  writeJson(path.join(OUTPUT_ROOT, "determinism-receipt.json"), determinism);
  safeRemoveGeneratedDirectory(determinismRoot, outputParent);

  const horizonRoot = path.join(outputParent, "immutability-work");
  const shortWorld = buildWorldSample(Math.min(1000, SAMPLE_COUNT), false);
  const horizonSubset = horizonVerificationJobs(shortWorld.jobs);
  await renderVerification(
    horizonRoot, horizonSubset, shortWorld.existingRegions, workerCount,
    "Phase 6F published-package horizon verification",
  );
  const immutability = compareManifestSubset(
    path.join(OUTPUT_ROOT, "compact-manifest.jsonl"),
    path.join(horizonRoot, "compact-manifest.jsonl"),
    "published-package-world-horizon",
  );
  immutability.shortWorldMapCount = Math.min(1000, SAMPLE_COUNT);
  immutability.fullWorldMapCount = SAMPLE_COUNT;
  immutability.laterNeighborsNeverRegeneratePublishedPackages = immutability.allByteAndHashIdentical;
  immutability.existingPublishedEdgeContractWins = immutability.allByteAndHashIdentical;
  assert(immutability.allByteAndHashIdentical, "Published package changed when later neighbors were allocated.");
  writeJson(path.join(OUTPUT_ROOT, "immutability-receipt.json"), immutability);
  safeRemoveGeneratedDirectory(horizonRoot, outputParent);

  const assetManifestHashAfter = sha256File(assetManifestPath);
  assert.equal(assetManifestHashAfter, assetManifestHashBefore, "The approved 118-asset library changed during Phase 6F.");
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
    assetManifestHashBefore,
    assetManifestHashAfter,
    assetLibraryModified: false,
    workerCount,
    coreFixtureCount: world.coreCount,
    maximumLayer,
    allocationMs: Math.round(allocationMs * 1000) / 1000,
    planAndCityWallClockMs: Math.round(planAndCityWallClockMs * 1000) / 1000,
    approximatePeakGenerationWorkerRssBytes: Math.max(...generationReceipts.map(receipt => receipt.peakRssBytes)),
    exactPhase6eCoordinateSeedAndAllocationOrder: true,
    immutablePublishedPackageModel: true,
  });

  await runPython(ANALYZER_PATH, ["--root", ROOT, "--output", OUTPUT_ROOT]);
  safeRemoveGeneratedDirectory(STAGING_ROOT, OUTPUT_ROOT);
  const results = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "phase-6f-results.json"), "utf8"));
  console.log(`Phase 6F analyzed ${results.sample.totalMaps} maps through Layer ${results.sample.maximumLayer}.`);
  console.log(`Baseline road share: ${results.roadScale.baselineGeometry.percentage}%. Near pairs >= 0.965: ${results.nearDuplicates.flaggedPairCount}.`);
  console.log(`118-asset corrected 10,000-map decision: ${results.assetDecision.sufficientForTenThousandMaps ? "PASS" : "REVIEW REQUIRED"}.`);
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
