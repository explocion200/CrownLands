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
  createCurrentProductionWorldAdapter,
} = require("./map-scaling-phase-7/architecture");
const {
  FEATURE_FLAG_DEFAULT,
  RECOMMENDED_STANDBY_BUFFER,
  ROAD_CACHE_LIMIT,
  PLAYER_REGION_CITY_CAPACITY,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
  ACTIONS,
  ALLOWED_TRANSITIONS,
  createPhase8Staging,
} = require("./map-scaling-phase-8/architecture");

const ROOT = path.resolve(__dirname, "..");
const APPROVED_PHASE7_COMMIT = "004f67c22b98ec107c86d16641cc073b9892d0e8";
const RESULTS_PATH = path.join(ROOT, "benchmark-results", "map", "phase-8", "phase-8-results.json");
const ALLOWED_PHASE8_PATHS = [
  "benchmark-results/map/phase-8/",
  "docs/map-scaling-audit/phase-8/",
  "tools/map-scaling-phase-8/",
  "tools/run-map-scaling-phase-8.js",
  "tools/validate-map-scaling-phase-8.js",
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
  const unexpected = changed.filter(file => !ALLOWED_PHASE8_PATHS.some(allowed => (
    allowed.endsWith("/") ? file.startsWith(allowed) : file === allowed
  )));
  assert.deepEqual(unexpected, [], `Unexpected production/non-Phase-8 changes: ${unexpected.join(", ")}`);
  const trackedSincePhase7 = git("diff", "--name-only", APPROVED_PHASE7_COMMIT, "--");
  if (trackedSincePhase7) {
    const unexpectedTracked = trackedSincePhase7.split(/\r?\n/).filter(file => !ALLOWED_PHASE8_PATHS.some(allowed => (
      allowed.endsWith("/") ? file.startsWith(allowed) : file === allowed
    )));
    assert.deepEqual(unexpectedTracked, [], `Tracked production files changed: ${unexpectedTracked.join(", ")}`);
  }
  const approvedAssetDiff = git(
    "diff", "--name-only", APPROVED_PHASE7_COMMIT, "--",
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
    path.join(ROOT, "dist", "benchmark-results", "map", "phase-8"),
    path.join(ROOT, "dist", "tools", "map-scaling-phase-8"),
    path.join(ROOT, "dist", "docs", "map-scaling-audit", "phase-8"),
  ];
  for (const forbidden of forbiddenPaths) assert(!fs.existsSync(forbidden), `Phase 8 leaked into ${forbidden}.`);
  const signatures = [
    "phase8-expansion-control-v1",
    "phase8-production-equivalent-staging",
    "phase8-hierarchical-catalog-v1",
    "phase8-admin-request-v1",
  ];
  const textFiles = collectFiles(path.join(ROOT, "dist")).filter(file => /\.(?:js|json|html|css|txt)$/i.test(file));
  for (const file of textFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const signature of signatures) {
      assert(!source.includes(signature), `${signature} leaked into ${path.relative(ROOT, file)}.`);
    }
  }
  for (const productionRoot of [path.join(ROOT, "functions"), path.join(ROOT, "public")]) {
    for (const file of collectFiles(productionRoot).filter(item => /\.(?:js|json|html|css)$/i.test(item))) {
      const source = fs.readFileSync(file, "utf8");
      assert(!source.includes("map-scaling-phase-8"), `Production source imports Phase 8 from ${path.relative(ROOT, file)}.`);
    }
  }
  return {
    forbiddenPathsAbsent: forbiddenPaths.length,
    scannedDistTextFiles: textFiles.length,
    signaturesAbsent: signatures.length,
  };
}

function readResults() {
  assert(fs.existsSync(RESULTS_PATH), "Run the Phase 8 hardening suite first.");
  return JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
}

function validateResults(results) {
  assert.equal(results.phase, "8");
  assert.equal(results.developmentOnly, true);
  assert.equal(results.productionEquivalentStagingOnly, true);
  assert.equal(results.productionFirestoreWrites, 0);
  assert.equal(results.productionActivated, false);
  assert.equal(results.realPlayersPlaced, 0);
  assert.equal(results.deploymentPerformed, false);
  assert.equal(results.mergePerformed, false);
  assert.equal(results.branchPushPerformed, false);
  assert.equal(results.phase9Started, false);
  assert.equal(results.assetLibrary.count, 118);
  assert.equal(results.assetLibrary.manifestHash, ASSET_MANIFEST_HASH);
  assert.equal(results.assetLibrary.modified, false);
  assert.equal(results.lockedRules.cityCapacity, PLAYER_REGION_CITY_CAPACITY);
  assert.equal(results.lockedRules.startingCandidates, 4);
  assert.equal(results.lockedRules.minimumNpcCitiesForSpawn, MINIMUM_NPC_CITIES_FOR_SPAWN);
  assert.deepEqual(results.firstRegion.coordinate, {
    gridX: -3,
    gridY: -3,
    worldLayer: 1,
    clockwiseOrderIndex: 0,
  });
  assert.equal(results.firstRegion.cityRecordsInitialized, PLAYER_REGION_CITY_CAPACITY);
  assert.equal(results.firstRegion.placementClaimsAccepted, 26);
  assert.equal(results.firstRegion.acceptedAtFifteen.npcBefore, MINIMUM_NPC_CITIES_FOR_SPAWN);
  assert.equal(results.firstRegion.acceptedAtFifteen.npcAfter, MINIMUM_NPC_CITIES_FOR_SPAWN - 1);
  assert.equal(results.firstRegion.rejectedAtFourteen.code, "spawn-threshold");
  assert.equal(results.firstRegion.existingGameplayContinuesAtFourteen, true);
  assert.equal(results.firstRegion.standbyBufferCount, RECOMMENDED_STANDBY_BUFFER);
  assert.equal(results.threeRegion.coordinates.length, 3);
  assert.deepEqual(results.threeRegion.activationSlots, [0, 1, 2]);
  assert.equal(results.threeRegion.packagesUnchanged, true);
  assert.equal(results.threeRegion.uniqueCityIds, 120);
  assert.equal(results.threeRegion.hiddenOpenTargets, 0);
  assert.equal(results.threeRegion.playerCanEnterUnpublishedRegion, false);
  assert.equal(results.threeRegion.topology.directedOpen, results.threeRegion.topology.reciprocalUndirected * 2);
  assert.equal(results.standbyBuffer.recommendedBufferSize, RECOMMENDED_STANDBY_BUFFER);
  assert.equal(results.standbyBuffer.profiles[0].workerFailureScenario.immediateNextActivationCovered, false);
  assert.equal(results.standbyBuffer.profiles[1].workerFailureScenario.immediateNextActivationCovered, true);
  assert.equal(results.workerCapacity.recommendation.defaultConcurrency, 2);
  assert.deepEqual(results.workerCapacity.profiles.map(profile => profile.workers), [1, 2, 4, 8]);
  assert(results.workerCapacity.profiles.every(profile => Number.isFinite(profile.approximatePeakMemoryMiB)));
  assert.equal(results.workerCapacity.coordinateLock.duplicateCoordinates, 0);
  assert.equal(results.roadCache.byteIdentical, true);
  assert.equal(results.roadCache.combinationsValidated, 36);
  assert.equal(results.roadCache.recommendation.entryLimit, ROAD_CACHE_LIMIT);
  assert.equal(results.roadCache.recommendation.strategy, "process-local bounded LRU");
  assert(results.roadCache.boundedLru.approximateMaximumMemoryMiB < results.roadCache.processLocalFull.approximateMemoryMiB);
  for (const count of [1000, 10000, 100000]) {
    assert(results.costModel.projections[count]);
    assert(results.costModel.projections[count].firestore.oneTimeReads > 0);
    assert(results.costModel.projections[count].cloudStorage.completePackageGiB > 0);
  }
  assert.equal(results.orphanCleanup.publishedAutomaticDeletes, 0);
  assert.equal(results.backupRecovery.publishedPackageRegenerationAllowed, false);
  assert.equal(results.securityAndStateMachine.productionFeatureFlagDefault, FEATURE_FLAG_DEFAULT);
  assert.equal(results.securityAndStateMachine.normalPlayersCanInvokeAdminOperations, false);
  assert.equal(
    Object.keys(results.securityAndStateMachine.playerDeniedActions).length,
    Object.keys(ACTIONS).length,
  );
  assert(Object.values(results.securityAndStateMachine.playerDeniedActions).every(item => (
    item.rejected && item.code === "permission-denied"
  )));
  assert.equal(Object.keys(results.securityAndStateMachine.operationKillSwitches).length, 4);
  assert(Object.values(results.securityAndStateMachine.operationKillSwitches).every(item => item.rejected));
  assert(Object.values(results.securityAndStateMachine.illegalTransitions).every(item => item.rejected));
  assert.equal(results.securityAndStateMachine.killSwitch.expansionStopped.rejected, true);
  assert.equal(results.securityAndStateMachine.killSwitch.existingGameplayContinues, true);
  assert.equal(results.activationFaults.injectedFaults.length, 11);
  assert.equal(results.activationFaults.allFaultsAtomic, true);
  assert(results.activationFaults.injectedFaults.every(item => item.cityOwnershipRecordsVisible === 0));
  assert.equal(results.activationFaults.cityRecordsAfterSuccessfulRetry, PLAYER_REGION_CITY_CAPACITY);
  assert.equal(results.runtimePerformance.catalogRegions, 10000);
  assert(results.runtimePerformance.startupCatalogBytes < 64 * 1024);
  assert(results.runtimePerformance.firstLayerPageBytes < 64 * 1024);
  assert.equal(results.runtimePerformance.definitionsPreloaded, false);
  assert.equal(results.runtimePerformance.cityDefinitionsPreloaded, false);
  assert.equal(results.runtimePerformance.mapBytesPreloaded, false);
  assert(results.runtimePerformance.cache.cacheSize <= 4);
  assert.equal(results.runtimePerformance.mobilePlanningGate, true);
  assert.equal(results.cdn.immutableAssets.pathIncludesPackageHash, true);
  assert.equal(results.cdn.immutableAssets.overwriteAllowed, false);
  assert.equal(results.studioAdmin.publicationApprovalRequired, true);
  assert.equal(results.studioAdmin.activationApprovalRequired, true);
  assert.equal(results.studioAdmin.automaticPublicationAllowed, false);
  assert.equal(results.seasonBootstrap.coreRegionCount, 25);
  assert.equal(results.seasonBootstrap.coreSpawnEligibleCount, 0);
  assert.equal(results.seasonBootstrap.holdingTowerReservationsPresent, true);
  assert.equal(results.seasonBootstrap.finalStandbyBuffer, RECOMMENDED_STANDBY_BUFFER);
  assert.equal(results.seasonBootstrap.destructiveResetPerformed, false);
  assert.equal(results.seasonBootstrap.approvedRasterRecordsRelabeledAcrossSeasons, false);
  assert.equal(results.persistenceAudit.livePersistenceBehaviorModified, false);
  assert.equal(results.rolloutAndRollback.stages.length, 8);
  assert(results.rolloutAndRollback.stages.every(stage => stage.rollback));
  assert.equal(results.rolloutAndRollback.publishedPackageDeleteOrRegenerationAllowed, false);
  assert.equal(results.loadAndFault.publishRetriesSucceeded, true);
  assert.equal(results.loadAndFault.workerCrash.rejected, true);
  assert.equal(results.currentProductionWorld.productionMapCount, 15);
  assert.equal(results.currentProductionWorld.productionCityCount, 1050);
  assert.equal(results.currentProductionWorld.directedMapChainCount, 210);
  assert.equal(results.currentProductionWorld.generatedActiveRegionCount, 0);
  assert(Object.values(results.readiness).every(Boolean));
  assert.deepEqual(ALLOWED_TRANSITIONS[LIFECYCLE.PUBLISHED], [LIFECYCLE.ACTIVE]);
  return results;
}

async function validateFreshStagingPackage() {
  const { metadata, records } = await loadApprovedPhase6FRecords(1);
  const harness = createPhase8Staging(records, metadata);
  const prepared = await harness.prepareNext();
  const regionId = prepared.allocation.regionId;
  harness.reviewRegion(regionId, "publication");
  await harness.publish(regionId);
  harness.reviewRegion(regionId, "activation");
  const preflight = harness.activationPreflight(regionId);
  assert.equal(preflight.exactCityDefinitionsReady, PLAYER_REGION_CITY_CAPACITY);
  assert.equal(harness.control.productionRolloutEnabled, FEATURE_FLAG_DEFAULT);
  assert.equal(harness.store.runtimeCatalog.get(regionId).active, false);
  return { regionId, packageHash: prepared.packageValue.packageHash, preflight };
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
  const results = validateResults(readResults());
  const leakage = assertNoProductionLeakage();
  const fresh = await validateFreshStagingPackage();
  const requiredDocs = [
    "README.md",
    "PRODUCTION_LIKE_STAGING.md",
    "ROLLOUT_REHEARSALS.md",
    "STANDBY_BUFFER.md",
    "WORKER_CAPACITY.md",
    "ROAD_CACHE_STRATEGY.md",
    "FIREBASE_STORAGE_COSTS.md",
    "ORPHAN_CLEANUP.md",
    "BACKUP_AND_RECOVERY.md",
    "SECURITY_AND_STATE_MACHINE.md",
    "ACTIVATION_SAFETY.md",
    "RUNTIME_AND_CDN.md",
    "STUDIO_ADMIN_REHEARSAL.md",
    "SEASON_BOOTSTRAP_AND_PERSISTENCE.md",
    "MONITORING_AND_KILL_SWITCH.md",
    "ROLLOUT_AND_ROLLBACK.md",
    "VALIDATION_RESULTS.md",
    "PHASE_9_READINESS.md",
  ];
  for (const name of requiredDocs) {
    assert(fs.existsSync(path.join(ROOT, "docs", "map-scaling-audit", "phase-8", name)), `Missing ${name}.`);
  }
  console.log(JSON.stringify({
    phase: 8,
    result: "PASS",
    changedFiles: changedFiles.length,
    productionFilesChanged: 0,
    productionMaps: production.productionMapCount,
    productionCities: production.productionCityCount,
    directedMapChains: production.directedMapChainCount,
    generatedActiveProductionRegions: production.generatedActiveRegionCount,
    assetCount: results.assetLibrary.count,
    assetManifestHash: results.assetLibrary.manifestHash,
    freshStagingPackage: fresh,
    leakage,
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
