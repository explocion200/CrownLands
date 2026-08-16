"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  ASSET_MANIFEST_HASH,
  LIFECYCLE,
  readLockedAssetManifest,
  loadApprovedPhase6FRecords,
  validateStandbyPackage,
  ApprovedPhase6FPackageWorker,
  createCurrentProductionWorldAdapter,
} = require("./map-scaling-phase-7/architecture");
const { allocateNextPlayerRegion } = require("./map-scaling-phase-4/generator");
const { createPermanentCorePackage } = require("./map-scaling-phase-5/core-package");
const { createAllocatorCore } = require("./map-scaling-phase-5/fixtures");

const ROOT = path.resolve(__dirname, "..");
const APPROVED_PHASE6F_COMMIT = "6885437d5bcf8856b3528cbdca139a48f47ae861";
const RESULTS_PATH = path.join(ROOT, "benchmark-results", "map", "phase-7", "phase-7-results.json");
const ROAD_CACHE_PATH = path.join(ROOT, "benchmark-results", "map", "phase-7", "road-cache-benchmark.json");
const ALLOWED_PHASE7_PATHS = [
  "benchmark-results/map/phase-7/",
  "docs/map-scaling-audit/phase-7/",
  "tools/map-scaling-phase-7/",
  "tools/run-map-scaling-phase-7.js",
  "tools/validate-map-scaling-phase-7.js",
];

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trimEnd();
}

function normalizedStatusPaths() {
  return git("status", "--porcelain=v1", "--untracked-files=all")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.slice(3).replaceAll("\\", "/").replace(/^"|"$/g, ""));
}

function assertDevelopmentOnlyDiff() {
  const changed = normalizedStatusPaths();
  const unexpected = changed.filter(file => !ALLOWED_PHASE7_PATHS.some(allowed => (
    allowed.endsWith("/") ? file.startsWith(allowed) : file === allowed
  )));
  assert.deepEqual(unexpected, [], `Unexpected production/non-Phase-7 changes: ${unexpected.join(", ")}`);
  const approvedAssetDiff = git(
    "diff", "--name-only", APPROVED_PHASE6F_COMMIT, "--",
    "benchmark-results/map/phase-6d/asset-library",
  );
  assert.equal(approvedAssetDiff, "", "The approved 118-asset library changed.");
  return changed;
}

function collectFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function assertNoProductionLeakage() {
  const forbiddenPaths = [
    path.join(ROOT, "dist", "benchmark-results", "map", "phase-7"),
    path.join(ROOT, "dist", "tools", "map-scaling-phase-7"),
    path.join(ROOT, "dist", "docs", "map-scaling-audit", "phase-7"),
  ];
  for (const forbidden of forbiddenPaths) assert(!fs.existsSync(forbidden), `Phase 7 leaked into ${forbidden}.`);
  const signatures = [
    "phase7-generated-region-package-v1",
    "phase7-atomic-publication-v1",
    "generated-worlds/v1/worlds/phase6d_development_world",
    "phase6d_region_0001",
  ];
  const textFiles = collectFiles(path.join(ROOT, "dist")).filter(file => /\.(?:js|json|html|css|txt)$/i.test(file));
  for (const file of textFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const signature of signatures) {
      assert(!source.includes(signature), `${signature} leaked into ${path.relative(ROOT, file)}.`);
    }
  }
  for (const root of [path.join(ROOT, "functions"), path.join(ROOT, "public")]) {
    for (const file of collectFiles(root).filter(item => /\.(?:js|json|html|css)$/i.test(item))) {
      const source = fs.readFileSync(file, "utf8");
      assert(!source.includes("map-scaling-phase-7"), `Production source imports Phase 7 from ${path.relative(ROOT, file)}.`);
    }
  }
  return { forbiddenPathsAbsent: forbiddenPaths.length, scannedDistTextFiles: textFiles.length, signaturesAbsent: signatures.length };
}

function validateResults() {
  assert(fs.existsSync(RESULTS_PATH), "Run the Phase 7 integration suite first.");
  assert(fs.existsSync(ROAD_CACHE_PATH), "Run the Phase 7 road cache benchmark first.");
  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  const road = JSON.parse(fs.readFileSync(ROAD_CACHE_PATH, "utf8"));
  assert.equal(results.phase, "7");
  assert.equal(results.developmentOnly, true);
  assert.equal(results.emulatorOnly, true);
  assert.equal(results.productionActivated, false);
  assert.equal(results.deploymentPerformed, false);
  assert.equal(results.branchPushPerformed, false);
  assert.equal(results.approvedArtStyleLocked, true);
  assert.equal(results.assetLibrary.count, 118);
  assert.equal(results.assetLibrary.manifestHash, ASSET_MANIFEST_HASH);
  assert.equal(results.assetLibrary.modified, false);
  assert.deepEqual(results.architecture.lifecycle, Object.values(LIFECYCLE));
  assert.equal(results.architecture.immutablePackages, true);
  assert.equal(results.architecture.contentAddressedVersionedPaths, true);
  assert.equal(results.architecture.stagedAtomicPublication, true);
  assert.equal(results.architecture.separateActivationTransaction, true);
  assert.equal(results.architecture.runtimeOpenGatedExcludedFromPackageHash, true);
  assert.equal(results.architecture.existingPublishedEdgeContractWins, true);
  assert.equal(results.lifecycle.standbyDiscoverable, false);
  assert.equal(results.lifecycle.publishedActive, false);
  assert.equal(results.lifecycle.packageHashBeforeNeighbor, results.lifecycle.packageHashAfterNeighbor);
  assert.equal(results.lifecycle.authoritativeSpawnThreshold.claimsAccepted, 26);
  assert.equal(results.lifecycle.authoritativeSpawnThreshold.finalAcceptedClaim.npcBefore, 15);
  assert.equal(results.lifecycle.authoritativeSpawnThreshold.finalAcceptedClaim.npcAfter, 14);
  assert.equal(results.lifecycle.authoritativeSpawnThreshold.rejectedAtFourteen.code, "spawn-threshold");
  assert.equal(results.standbyBuffer.recommendedBufferSize, 2);
  assert.equal(results.standbyBuffer.autoActivationAllowed, false);
  assert.equal(results.concurrencyAndFailure.coordinateCollision.code, "duplicate-coordinate");
  assert.equal(results.concurrencyAndFailure.regionIdCollision.code, "duplicate-region-id");
  assert.equal(results.concurrencyAndFailure.publicationCollision.code, "duplicate-publication");
  assert.equal(results.concurrencyAndFailure.immutableOverwrite.code, "immutable-overwrite");
  assert.equal(results.concurrencyAndFailure.workerCrashAfterMapEncode.code, "worker-crash-after-map-encode");
  assert(results.concurrencyAndFailure.publicationFaults.every(item => item.snapshot.publishedPackageCount === 0));
  assert.equal(results.concurrencyAndFailure.activationTransactionFailure.code, "activation-transaction-failed");
  assert.equal(results.concurrencyAndFailure.idempotentCityInitialization.count, 40);
  assert.equal(results.concurrencyAndFailure.unpublishedVersionedRetry.receipt.coordinateReused, true);
  assert.notEqual(
    results.concurrencyAndFailure.unpublishedVersionedRetry.originalPackageHash,
    results.concurrencyAndFailure.unpublishedVersionedRetry.retryPackageHash,
  );
  assert.equal(
    results.concurrencyAndFailure.unpublishedVersionedRetry.publishedRetryRejected.code,
    "published-package-immutable",
  );
  assert.equal(results.concurrencyAndFailure.unauthorizedPlayerAction.code, "permission-denied");
  assert.equal(results.multiLayer.regionCount, 128);
  assert.equal(results.multiLayer.completeLayer1, true);
  assert.equal(results.multiLayer.completeLayer2, true);
  assert.equal(results.multiLayer.uniqueCoordinates, 128);
  assert.equal(results.multiLayer.uniqueRegionIds, 128);
  assert.equal(results.multiLayer.uniqueCityIds, 5120);
  assert.equal(results.multiLayer.uniquePackageHashes, 128);
  assert.equal(results.multiLayer.neighborPairs.directed, results.multiLayer.neighborPairs.reciprocal);
  assert.equal(results.multiLayer.lazyLoading.startupIncludesDefinitions, false);
  assert.equal(results.multiLayer.lazyLoading.startupIncludesMapBytes, false);
  assert(results.multiLayer.lazyLoading.cache.cacheSize <= results.multiLayer.lazyLoading.cache.cacheLimit);
  assert.equal(results.multiLayer.roadPresentationCache.entries, 36);
  assert.equal(results.multiLayer.eventsContainSensitivePlayerData, false);
  assert(Object.values(results.acceptance).every(Boolean));
  assert.equal(results.storage.imageQualityChanged, false);
  assert.equal(road.combinationCount, 36);
  assert.equal(road.geometryCount, 9);
  assert.equal(road.themeCount, 4);
  assert.equal(road.assetCount, 118);
  assert.equal(road.assetManifestHash, ASSET_MANIFEST_HASH);
  assert.equal(road.correctness.byteIdenticalPresentationHashes, true);
  assert.equal(road.correctness.imageQualityChanged, false);
  assert.equal(road.correctness.roadSocketsChanged, false);
  assert.equal(road.precomputation.entryCount, 36);
  assert.equal(road.tradeoff.recommended, true);
  return { results, road };
}

async function validateFreshPackage() {
  const { metadata, records } = await loadApprovedPhase6FRecords(1);
  const allocation = allocateNextPlayerRegion({
    worldId: metadata.worldId,
    seasonId: metadata.seasonId,
    existingRegions: createAllocatorCore(createPermanentCorePackage()),
    regionId: records[0].regionId,
    generatorVersion: metadata.generatorVersion,
  });
  const packageValue = new ApprovedPhase6FPackageWorker({ metadata }).generate({ record: records[0], allocation });
  const validation = validateStandbyPackage(packageValue);
  assert.equal(validation.valid, true, validation.errors.join(" "));
  assert.equal(packageValue.cities.length, 40);
  assert.equal(packageValue.startingCandidates.length, 4);
  assert(packageValue.validationReceipt.minimumSpacing >= 112);
  assert.equal(packageValue.edgeContracts.runtimeOpenGatedStateExcluded, true);
  assert(Object.values(packageValue.storage.files).every(file => file.path.includes(`/packages/${packageValue.packageHash}/`)));
  return packageValue.packageHash;
}

async function main() {
  const changedFiles = assertDevelopmentOnlyDiff();
  const locked = readLockedAssetManifest();
  assert.equal(locked.hash, ASSET_MANIFEST_HASH);
  const production = createCurrentProductionWorldAdapter();
  assert.equal(production.productionMapCount, 15);
  assert.equal(production.productionCityCount, 1050);
  assert.equal(production.directedMapChainCount, 210);
  assert.equal(production.generatedActiveRegionCount, 0);
  const leakage = assertNoProductionLeakage();
  const { results, road } = validateResults();
  const freshPackageHash = await validateFreshPackage();
  const requiredDocs = [
    "README.md", "ARCHITECTURE.md", "LIFECYCLE.md", "PACKAGE_STORAGE.md",
    "PUBLICATION_AND_ACTIVATION.md", "EDGE_CONTRACTS.md", "WORLD_EXPANSION_WORKER.md",
    "STANDBY_BUFFER.md", "CONCURRENCY_AND_RECOVERY.md", "ADMIN_SECURITY_OBSERVABILITY.md",
    "CURRENT_WORLD_ADAPTER.md", "PERFORMANCE_AND_STORAGE.md", "PHASE_8_READINESS.md",
    "VALIDATION_RESULTS.md",
  ];
  for (const name of requiredDocs) {
    assert(fs.existsSync(path.join(ROOT, "docs", "map-scaling-audit", "phase-7", name)), `Missing ${name}.`);
  }
  console.log(JSON.stringify({
    phase: 7,
    result: "PASS",
    changedFiles: changedFiles.length,
    productionFilesChanged: 0,
    productionMaps: production.productionMapCount,
    productionCities: production.productionCityCount,
    generatedActiveProductionRegions: production.generatedActiveRegionCount,
    simulatedRegions: results.multiLayer.regionCount,
    roadCacheCombinations: road.combinationCount,
    freshPackageHash,
    leakage,
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
