"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  LIFECYCLE,
  SIDES,
  OPPOSITE,
  ASSET_MANIFEST_HASH,
  summarizeTimings,
  loadApprovedPhase6FRecords,
  readLockedAssetManifest,
  validateStandbyPackage,
  LazyCombinedCatalogAdapter,
} = require("./map-scaling-phase-7/architecture");
const {
  PHASE,
  FEATURE_FLAG_DEFAULT,
  RECOMMENDED_STANDBY_BUFFER,
  ROAD_CACHE_LIMIT,
  PLAYER_REGION_CITY_CAPACITY,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
  ACTIONS,
  createPhase8AdminActor,
  createAdminRequest,
  ExpansionControlPlane,
  LifecycleGuard,
  evaluateRoadCacheStrategies,
  modelWorkerCapacity,
  evaluateStandbyBuffers,
  buildCostModel,
  planOrphanCleanup,
  createOperationsPlan,
  HierarchicalLazyCatalogAdapter,
  createSyntheticCatalog,
  createSeasonBootstrapModel,
  createPhase8Staging,
  createCurrentProductionWorldAdapter,
  expectFailure,
} = require("./map-scaling-phase-8/architecture");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-8");
const RESULTS_PATH = path.join(OUTPUT_ROOT, "phase-8-results.json");
const RECORD_COUNT = 512;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function cleanOutputRoot() {
  const expected = path.resolve(ROOT, "benchmark-results", "map", "phase-8");
  const resolved = path.resolve(OUTPUT_ROOT);
  assert.equal(resolved, expected, "Phase 8 output safety check failed.");
  assert(resolved.startsWith(path.resolve(ROOT) + path.sep), "Phase 8 output must remain inside the repository.");
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function packageBytes(packageValue) {
  return Object.values(packageValue.storage.files).reduce((sum, descriptor) => sum + descriptor.bytes, 0);
}

function assertPackageImmutable(packageValue, expectedHash) {
  assert.equal(packageValue.packageHash, expectedHash);
  assert.equal(validateStandbyPackage(packageValue).valid, true);
}

function assertReciprocalTopology(store) {
  let directedOpen = 0;
  for (const [regionId, topology] of store.runtimeTopology) {
    for (const [side, edge] of Object.entries(topology)) {
      if (edge.state !== "open") {
        assert.equal(edge.targetRegionId, "", `${regionId}:${side} hides a GATED target.`);
        continue;
      }
      directedOpen += 1;
      const target = store.runtimeTopology.get(edge.targetRegionId);
      assert(target, `${regionId}:${side} targets a missing region.`);
      assert.equal(target[OPPOSITE[side]].state, "open");
      assert.equal(target[OPPOSITE[side]].targetRegionId, regionId);
    }
  }
  return { directedOpen, reciprocalUndirected: directedOpen / 2 };
}

async function preparePublishedFixture(records, metadata, options = {}) {
  const harness = createPhase8Staging(records, metadata);
  const prepared = await harness.prepareNext();
  const regionId = prepared.allocation.regionId;
  harness.reviewRegion(regionId, "publication");
  await harness.publish(regionId, harness.actor, options.publishOptions || {});
  harness.reviewRegion(regionId, "activation");
  return { harness, prepared, regionId };
}

async function runFirstRegionRehearsal(records, metadata) {
  const harness = createPhase8Staging(records, metadata);
  const first = await harness.prepareNext();
  const regionId = first.allocation.regionId;
  const originalHash = first.packageValue.packageHash;
  assert.equal(first.allocation.coordinate.worldLayer, 1);
  assert.equal(first.allocation.coordinate.clockwiseOrderIndex, 0);
  assert.equal(harness.store.runtimeCatalog.has(regionId), false);
  const publicationReview = harness.reviewRegion(regionId, "publication");
  const publication = await harness.publish(regionId);
  assert.equal(publication.lifecycle, LIFECYCLE.PUBLISHED);
  assert.equal(harness.store.runtimeCatalog.get(regionId).active, false);
  assert.equal(harness.store.verifyImmutableFiles(first.packageValue), true);
  const activationReview = harness.reviewRegion(regionId, "activation");
  const preflight = harness.activationPreflight(regionId);
  const activation = await harness.activate(regionId);
  assert.equal(activation.lifecycle, LIFECYCLE.ACTIVE);
  assert.equal(harness.store.cityOwnership.get(regionId).length, PLAYER_REGION_CITY_CAPACITY);
  assert.equal(harness.store.spawnEligibility(regionId).currentNpcCityCount, PLAYER_REGION_CITY_CAPACITY);

  const claims = [];
  for (let index = 0; index < 26; index += 1) {
    claims.push(await harness.claimPlacement(regionId, `phase8-first-player-${index}`));
  }
  assert.equal(claims.at(-1).npcBefore, MINIMUM_NPC_CITIES_FOR_SPAWN);
  assert.equal(claims.at(-1).npcAfter, MINIMUM_NPC_CITIES_FOR_SPAWN - 1);
  assert.equal(claims.at(-1).subsequentSpawnEligible, false);
  const rejectedAtFourteen = await expectFailure(
    () => harness.claimPlacement(regionId, "phase8-rejected-player"),
    "spawn-threshold",
  );
  assert.equal(harness.store.runtimeCatalog.get(regionId).active, true);
  assert.equal(harness.store.runtimeCatalog.get(regionId).spawnEligible, false);
  assert.equal(harness.store.cityOwnership.get(regionId).filter(city => city.ownerUid).length, 26);

  const nextOne = await harness.prepareNext();
  const nextTwo = await harness.prepareNext();
  assert.equal(harness.store.snapshot().standbyPackageCount, RECOMMENDED_STANDBY_BUFFER);
  assertPackageImmutable(first.packageValue, originalHash);
  assert(Object.values(harness.store.runtimeTopology.get(regionId)).every(edge => edge.state === "gated"));

  return {
    coordinate: first.allocation.coordinate,
    packageHash: originalHash,
    lifecycleHistory: harness.guard.snapshot().history.filter(item => item.regionId === regionId),
    publicationReview,
    publication,
    immutableStorageVerified: true,
    activationReview,
    activationPreflight: preflight,
    cityRecordsInitialized: harness.store.cityOwnership.get(regionId).length,
    catalogDiscoverableAfterPublication: harness.store.runtimeCatalog.has(regionId),
    activeAfterActivation: harness.store.runtimeCatalog.get(regionId).active,
    firstRegionRemainsGatedUntilCardinalNeighborActivation: true,
    gateToOpenVerifiedInThreeRegionRehearsal: true,
    placementClaimsAccepted: claims.length,
    acceptedAtFifteen: claims.at(-1),
    rejectedAtFourteen,
    existingGameplayContinuesAtFourteen: harness.store.runtimeCatalog.get(regionId).active,
    standbyPrepared: [nextOne.allocation.regionId, nextTwo.allocation.regionId],
    standbyBufferCount: harness.store.snapshot().standbyPackageCount,
    packageUnchanged: first.packageValue.packageHash === originalHash,
    productionTarget: false,
  };
}

async function runThreeRegionRehearsal(records, metadata, productionAdapter) {
  const harness = createPhase8Staging(records, metadata);
  const prepared = [];
  const packageHashes = new Map();
  const activationOrder = [];
  for (let index = 0; index < 3; index += 1) {
    const item = await harness.prepareNext();
    const regionId = item.allocation.regionId;
    packageHashes.set(regionId, item.packageValue.packageHash);
    harness.reviewRegion(regionId, "publication");
    await harness.publish(regionId);
    harness.reviewRegion(regionId, "activation");
    await harness.activate(regionId);
    activationOrder.push(regionId);
    prepared.push(item);
    for (const previous of prepared) {
      assertPackageImmutable(previous.packageValue, packageHashes.get(previous.allocation.regionId));
    }
  }
  const [first, second, third] = prepared;
  assert.equal(first.allocation.coordinate.clockwiseOrderIndex, 0);
  assert.equal(second.allocation.coordinate.clockwiseOrderIndex, 1);
  assert.equal(third.allocation.coordinate.clockwiseOrderIndex, 2);
  assert.equal(harness.store.runtimeTopology.get(first.allocation.regionId).east.state, "open");
  assert.equal(harness.store.runtimeTopology.get(second.allocation.regionId).west.targetRegionId, first.allocation.regionId);
  assert.equal(harness.store.runtimeTopology.get(second.allocation.regionId).east.targetRegionId, third.allocation.regionId);
  assert.equal(harness.store.runtimeTopology.get(third.allocation.regionId).west.targetRegionId, second.allocation.regionId);
  assert(second.packageValue.edgeContracts.sides.west.inheritedPublishedConstraint);
  assert(third.packageValue.edgeContracts.sides.west.inheritedPublishedConstraint);
  const cityIds = prepared.flatMap(item => item.packageValue.cities.map(city => city.id));
  assert.equal(new Set(cityIds).size, 120);
  const topology = assertReciprocalTopology(harness.store);

  const unpublished = await harness.prepareNext();
  const lazy = new LazyCombinedCatalogAdapter({
    productionCatalog: productionAdapter.catalog,
    store: harness.store,
    cacheLimit: 4,
  });
  const unpublishedEntryRejected = await expectFailure(() => lazy.fetchRegion(unpublished.allocation.regionId));
  assert.equal(harness.store.runtimeCatalog.has(unpublished.allocation.regionId), false);
  assert(Object.values(harness.store.runtimeTopology.get(third.allocation.regionId)).every(edge => (
    edge.state !== "open" || harness.store.activationMarkers.has(edge.targetRegionId)
  )));

  return {
    coordinates: prepared.map(item => item.allocation.coordinate),
    activationOrder,
    activationSlots: prepared.map(item => item.allocation.coordinate.clockwiseOrderIndex),
    packageHashes: Object.fromEntries(packageHashes),
    packagesUnchanged: prepared.every(item => item.packageValue.packageHash === packageHashes.get(item.allocation.regionId)),
    inheritedPublishedEdges: [
      second.packageValue.edgeContracts.sides.west.inheritedPublishedConstraint,
      third.packageValue.edgeContracts.sides.west.inheritedPublishedConstraint,
    ],
    topology,
    gatedToOpenTransitions: harness.store.snapshot().metrics.gatedToOpenTransitions,
    uniqueCityIds: new Set(cityIds).size,
    hiddenOpenTargets: 0,
    unpublishedRegionId: unpublished.allocation.regionId,
    unpublishedEntryRejected,
    playerCanEnterUnpublishedRegion: false,
    immutablePublishedPackages: true,
  };
}

async function runStandbyBufferEvaluation(records, metadata) {
  const harness = createPhase8Staging(records, metadata);
  const packages = [await harness.prepareNext(), await harness.prepareNext()];
  const failureHarness = createPhase8Staging(records, metadata);
  const startedAt = performance.now();
  const failure = await expectFailure(
    () => failureHarness.prepareNext({ faultAt: "after_map_encode" }),
    "worker-crash-after-map-encode",
  );
  const recovered = await failureHarness.prepareNext();
  const recoverySeconds = (performance.now() - startedAt) / 1000;
  const result = evaluateStandbyBuffers(packages.map(item => packageBytes(item.packageValue)), recoverySeconds);
  assert.equal(result.recommendedBufferSize, RECOMMENDED_STANDBY_BUFFER);
  assert.equal(result.profiles[0].workerFailureScenario.immediateNextActivationCovered, false);
  assert.equal(result.profiles[1].workerFailureScenario.immediateNextActivationCovered, true);
  return {
    ...result,
    injectedWorkerFailure: failure,
    recoveredPackageHash: recovered.packageValue.packageHash,
    measuredRecoverySeconds: recoverySeconds,
  };
}

async function runWorkerCapacity(records, metadata, phase6dResults, roadCacheResult) {
  const harness = createPhase8Staging(records, metadata);
  const generationTimes = [];
  const rssBefore = process.memoryUsage().rss;
  for (let index = 0; index < 24; index += 1) {
    const prepared = await harness.prepareNext();
    generationTimes.push(prepared.packageValue.metrics.workerGenerationMs);
  }
  const rssAfter = process.memoryUsage().rss;
  const adapterTimings = summarizeTimings(generationTimes);
  const result = modelWorkerCapacity(phase6dResults, roadCacheResult, adapterTimings);
  result.measuredAdapterRssDeltaBytes = Math.max(0, rssAfter - rssBefore);
  result.coordinateLock = {
    allocations: 24,
    uniqueCoordinates: new Set([...harness.store.coordinateOwners.keys()]).size,
    duplicateCoordinates: 0,
    serializedReservationRequired: true,
  };
  assert.equal(result.recommendation.defaultConcurrency, 2);
  assert.equal(result.coordinateLock.uniqueCoordinates, result.coordinateLock.allocations);
  return result;
}

async function runSecurityAndStateMachine(records, metadata) {
  const control = new ExpansionControlPlane();
  const admin = createPhase8AdminActor("phase8-security-admin");
  const player = { id: "normal-player", role: "player", authenticated: true, audience: "crownlands-client", environment: control.environment };
  const unauthenticatedForgery = { ...admin, authenticated: false };
  const playerEscalation = await expectFailure(
    () => control.assertAuthorized(player, createAdminRequest(control, ACTIONS.GENERATE)),
    "permission-denied",
  );
  const playerDeniedActions = {};
  for (const action of Object.values(ACTIONS)) {
    playerDeniedActions[action] = await expectFailure(
      () => control.assertAuthorized(player, createAdminRequest(control, action, `player-${action}`)),
      "permission-denied",
    );
  }
  const forgedAdmin = await expectFailure(
    () => control.assertAuthorized(unauthenticatedForgery, createAdminRequest(control, ACTIONS.PUBLISH, "forged")),
    "permission-denied",
  );
  const malformedRequest = await expectFailure(
    () => control.assertAuthorized(admin, { action: ACTIONS.ACTIVATE }),
    "malformed-request",
  );
  const productionTarget = await expectFailure(
    () => control.assertAuthorized(admin, createAdminRequest(control, ACTIONS.ACTIVATE, "forbidden", {
      targetEnvironment: "production",
      productionTarget: true,
    })),
    "production-target-forbidden",
  );
  const staleRequest = createAdminRequest(control, ACTIONS.GENERATE);
  control.setKillSwitch("generation", true, admin);
  const staleAdmin = await expectFailure(
    () => control.assertAuthorized(admin, staleRequest),
    "stale-admin-client",
  );
  control.setKillSwitch("generation", false, admin);
  const operationKillSwitches = {};
  for (const [switchName, action, code] of [
    ["generation", ACTIONS.GENERATE, "generation-killed"],
    ["publication", ACTIONS.PUBLISH, "publication-killed"],
    ["activation", ACTIONS.ACTIVATE, "activation-killed"],
    ["expansion", ACTIONS.GENERATE, "expansion-killed"],
  ]) {
    control.setKillSwitch(switchName, true, admin);
    operationKillSwitches[switchName] = await expectFailure(
      () => control.assertAuthorized(admin, createAdminRequest(control, action, `kill-${switchName}`)),
      code,
    );
    control.setKillSwitch(switchName, false, admin);
  }
  const privilegedWrites = {};
  for (const action of [ACTIONS.EDGE_WRITE, ACTIONS.PACKAGE_HASH_WRITE, ACTIONS.LIFECYCLE_WRITE]) {
    privilegedWrites[action] = await expectFailure(
      () => control.assertAuthorized(player, createAdminRequest(control, action, "forbidden")),
      "permission-denied",
    );
  }

  const illegalTransitions = {};
  const directActive = new LifecycleGuard();
  directActive.register("allocated-direct-active");
  illegalTransitions.allocatedToActive = await expectFailure(
    () => directActive.transition("allocated-direct-active", LIFECYCLE.ACTIVE),
    "illegal-lifecycle-transition",
  );
  const failedActive = new LifecycleGuard();
  failedActive.register("failed-direct-active");
  failedActive.transition("failed-direct-active", LIFECYCLE.GENERATING);
  failedActive.transition("failed-direct-active", LIFECYCLE.FAILED);
  illegalTransitions.failedToActive = await expectFailure(
    () => failedActive.transition("failed-direct-active", LIFECYCLE.ACTIVE),
    "illegal-lifecycle-transition",
  );
  const publishedGenerating = new LifecycleGuard();
  publishedGenerating.register("published-generating");
  for (const state of [
    LIFECYCLE.GENERATING,
    LIFECYCLE.VALIDATING,
    LIFECYCLE.STANDBY,
    LIFECYCLE.PUBLISHING,
    LIFECYCLE.PUBLISHED,
  ]) publishedGenerating.transition("published-generating", state);
  illegalTransitions.publishedToGenerating = await expectFailure(
    () => publishedGenerating.transition("published-generating", LIFECYCLE.GENERATING),
    "illegal-lifecycle-transition",
  );
  publishedGenerating.transition("published-generating", LIFECYCLE.ACTIVE);
  illegalTransitions.activeToStandby = await expectFailure(
    () => publishedGenerating.transition("published-generating", LIFECYCLE.STANDBY, "active-standby"),
    "illegal-lifecycle-transition",
  );

  const killHarness = createPhase8Staging(records, metadata);
  const first = await killHarness.prepareNext();
  killHarness.reviewRegion(first.allocation.regionId, "publication");
  await killHarness.publish(first.allocation.regionId);
  killHarness.reviewRegion(first.allocation.regionId, "activation");
  await killHarness.activate(first.allocation.regionId);
  killHarness.control.setKillSwitch("expansion", true, killHarness.actor);
  const expansionStopped = await expectFailure(
    () => killHarness.prepareNext(),
    "expansion-killed",
  );
  const gameplayClaim = await killHarness.claimPlacement(first.allocation.regionId, "existing-gameplay-after-kill");

  const multiAdmin = createPhase8Staging(records, metadata);
  const multiPrepared = await multiAdmin.prepareNext();
  multiAdmin.reviewRegion(multiPrepared.allocation.regionId, "publication");
  const publicationRace = await Promise.all([
    multiAdmin.store.publishPackage(multiPrepared.allocation.regionId, multiAdmin.actor),
    multiAdmin.store.publishPackage(multiPrepared.allocation.regionId, multiAdmin.actor),
  ]);
  assert.equal(publicationRace.filter(item => item.idempotent).length, 1);

  return {
    productionFeatureFlagDefault: control.productionRolloutEnabled,
    playerEscalation,
    playerDeniedActions,
    forgedAdmin,
    malformedRequest,
    productionTarget,
    staleAdmin,
    operationKillSwitches,
    privilegedWrites,
    illegalTransitions,
    validTransitionPath: Object.values(LIFECYCLE).slice(0, 7),
    killSwitch: {
      expansionStopped,
      existingGameplayContinues: gameplayClaim.npcAfter === 39,
      gameplayClaim,
      snapshot: killHarness.control.snapshot(),
    },
    multipleAdminPublication: publicationRace,
    normalPlayersCanInvokeAdminOperations: !Object.values(playerDeniedActions).every(item => item.rejected),
  };
}

async function runActivationFaults(records, metadata) {
  const faults = [
    "before_activation",
    "firestore_timeout",
    "activation_transaction",
    "after_city_staging",
    "catalog_delay",
    "hash_mismatch",
    "missing_map",
    "missing_thumbnail",
    "invalid_city_count",
    "conflicting_edge_contract",
    "coordinate_conflict",
  ];
  const results = [];
  for (const faultAt of faults) {
    const fixture = await preparePublishedFixture(records, metadata);
    const failure = await expectFailure(
      () => fixture.harness.activate(fixture.regionId, fixture.harness.actor, { faultAt }),
    );
    assert.equal(failure.rejected, true, faultAt);
    assert.equal(fixture.harness.store.activationMarkers.size, 0, faultAt);
    assert.equal(fixture.harness.store.cityOwnership.size, 0, faultAt);
    assert.equal(fixture.harness.store.runtimeCatalog.get(fixture.regionId).lifecycle, LIFECYCLE.PUBLISHED, faultAt);
    results.push({
      faultAt,
      failure,
      lifecycleAfter: fixture.harness.store.runtimeCatalog.get(fixture.regionId).lifecycle,
      cityOwnershipRecordsVisible: 0,
      activeMarkers: 0,
      partialActivationVisible: false,
    });
  }

  const retryFixture = await preparePublishedFixture(records, metadata);
  const firstActivation = await retryFixture.harness.activate(retryFixture.regionId);
  const retryActivation = await retryFixture.harness.activate(retryFixture.regionId);
  assert.equal(firstActivation.idempotent, false);
  assert.equal(retryActivation.idempotent, true);
  assert.equal(retryFixture.harness.store.cityOwnership.get(retryFixture.regionId).length, PLAYER_REGION_CITY_CAPACITY);
  return {
    injectedFaults: results,
    allFaultsAtomic: results.every(item => !item.partialActivationVisible),
    idempotentRetry: retryActivation,
    cityRecordsAfterSuccessfulRetry: retryFixture.harness.store.cityOwnership.get(retryFixture.regionId).length,
  };
}

async function runLoadAndFaultSuite(records, metadata) {
  const publicationFaults = [];
  for (const faultAt of ["after_asset_upload", "publication_transaction", "validator_failure"]) {
    const harness = createPhase8Staging(records, metadata);
    const prepared = await harness.prepareNext();
    const regionId = prepared.allocation.regionId;
    harness.reviewRegion(regionId, "publication");
    const failure = await expectFailure(() => harness.publish(regionId, harness.actor, { faultAt }));
    assert.equal(failure.rejected, true);
    assert.equal(harness.store.publicationMarkers.size, 0);
    assert.equal(harness.store.runtimeCatalog.size, 0);
    const retry = await harness.publish(regionId);
    assert.equal(retry.lifecycle, LIFECYCLE.PUBLISHED);
    publicationFaults.push({ faultAt, failure, retry, partialPublicationVisible: false });
  }

  const workerHarness = createPhase8Staging(records, metadata);
  const workerCrash = await expectFailure(
    () => workerHarness.prepareNext({ faultAt: "after_map_encode" }),
    "worker-crash-after-map-encode",
  );
  assert.equal(workerHarness.store.runtimeCatalog.size, 0);

  const malformedHarness = createPhase8Staging(records, metadata);
  const malformedPrepared = await malformedHarness.prepareNext();
  malformedHarness.store.standbyPackages.delete(malformedPrepared.allocation.regionId);
  const malformedPackage = { ...malformedPrepared.packageValue, cities: malformedPrepared.packageValue.cities.slice(0, 39) };
  const malformedPackageRejected = await expectFailure(
    () => malformedHarness.store.saveStandbyPackage(malformedPackage, malformedHarness.actor),
  );
  assert.equal(malformedHarness.store.runtimeCatalog.size, 0);

  const restartFixture = createPhase8Staging(records, metadata);
  const restartPrepared = await restartFixture.prepareNext();
  restartFixture.store.regions.get(restartPrepared.allocation.regionId).lifecycle = LIFECYCLE.PUBLISHING;
  restartFixture.store.stagedPublications.set(restartPrepared.allocation.regionId, { packageHash: restartPrepared.packageValue.packageHash });
  const recovery = restartFixture.store.recoverController(restartFixture.actor);
  assert.equal(restartFixture.store.regions.get(restartPrepared.allocation.regionId).lifecycle, LIFECYCLE.STANDBY);

  return {
    workerCrash,
    firestoreTimeoutCoveredByActivationSuite: true,
    storageTimeout: publicationFaults.find(item => item.faultAt === "after_asset_upload"),
    duplicateRequestCoveredByPublicationAndActivationRaces: true,
    publicationFaults,
    publishRetriesSucceeded: publicationFaults.every(item => item.retry.lifecycle === LIFECYCLE.PUBLISHED),
    activationRetryCoveredByActivationSuite: true,
    controllerRestart: recovery,
    malformedPackageRejected,
    hashMismatchCoveredByActivationSuite: true,
    missingThumbnailCoveredByActivationSuite: true,
    missingMapCoveredByActivationSuite: true,
    invalidCityCountCovered: true,
    conflictingEdgeCoveredByActivationSuite: true,
    catalogDelayCoveredByActivationSuite: true,
    staleAdminCoveredBySecuritySuite: true,
    multipleAdminActionsCoveredBySecuritySuite: true,
  };
}

async function runRuntimePerformance(records, metadata, productionAdapter) {
  const harness = createPhase8Staging(records, metadata);
  const actual = [];
  for (let index = 0; index < 5; index += 1) {
    const prepared = await harness.prepareNext();
    harness.reviewRegion(prepared.allocation.regionId, "publication");
    await harness.publish(prepared.allocation.regionId);
    harness.reviewRegion(prepared.allocation.regionId, "activation");
    await harness.activate(prepared.allocation.regionId);
    actual.push(prepared.allocation.regionId);
  }
  const actualCatalog = actual.map(regionId => {
    const catalog = harness.store.runtimeCatalog.get(regionId);
    return {
      id: regionId,
      gridX: catalog.coordinate.gridX,
      gridY: catalog.coordinate.gridY,
      layer: catalog.layer,
      clockwiseSlot: catalog.clockwiseSlot,
      lifecycle: catalog.lifecycle,
      active: catalog.active,
      packageHash: catalog.packageHash,
    };
  });
  const generatedCatalogByCoordinate = new Map(
    createSyntheticCatalog(10000).map(region => [`${region.gridX},${region.gridY}`, region]),
  );
  for (const region of actualCatalog) {
    generatedCatalogByCoordinate.set(`${region.gridX},${region.gridY}`, region);
  }
  const generatedCatalog = [...generatedCatalogByCoordinate.values()];
  assert.equal(generatedCatalog.length, 10000);
  assert.equal(new Set(generatedCatalog.map(region => region.id)).size, generatedCatalog.length);
  assert.equal(
    new Set(generatedCatalog.map(region => `${region.gridX},${region.gridY}`)).size,
    generatedCatalog.length,
  );
  const adapter = new HierarchicalLazyCatalogAdapter({
    productionCatalog: productionAdapter.catalog,
    generatedCatalog,
    cacheLimit: 4,
    pageSize: 64,
    fetchRegion: regionId => {
      const packageHash = harness.store.publicationMarkers.get(regionId);
      if (!packageHash) throw new Error(`${regionId} is not available in the Phase 8 staging package store.`);
      const packageValue = harness.store.immutablePackages.get(packageHash);
      return {
        regionDefinition: packageValue.regionDefinition,
        cities: harness.store.cityDefinitions.get(regionId),
        topology: harness.store.runtimeTopology.get(regionId),
        mapAsset: packageValue.storage.files["map.webp"].path,
        thumbnailAsset: packageValue.storage.files["thumbnail.webp"].path,
      };
    },
  });
  const startup = adapter.startup(actual[0]);
  const page = adapter.page(1);
  for (const regionId of actual) adapter.fetch(regionId);
  const cached = adapter.fetch(actual.at(-1));
  assert.equal(cached.cacheHit, true);
  assert(adapter.cache.size <= 4);
  assert(startup.bytes < 64 * 1024, `Startup catalog is too large: ${startup.bytes}.`);
  assert(page.bytes < 64 * 1024, `Catalog page is too large: ${page.bytes}.`);
  const snapshot = adapter.snapshot();
  assert(snapshot.fetch.p95Ms < 10);
  return {
    catalogRegions: generatedCatalog.length,
    startupCatalogBytes: startup.bytes,
    firstLayerPageBytes: page.bytes,
    definitionsPreloaded: startup.value.definitionsIncluded,
    cityDefinitionsPreloaded: startup.value.cityDefinitionsIncluded,
    mapBytesPreloaded: startup.value.mapBytesIncluded,
    cache: snapshot,
    mapSwitchFetchP95Ms: snapshot.fetch.p95Ms,
    handcraftedMapCount: startup.value.handcraftedRegions.length,
    generatedMapDimensions: { width: 1448, height: 1086 },
    mobilePlanningGate: startup.bytes < 64 * 1024 && snapshot.fetch.p95Ms < 10,
    limitation: "A physical-device network/render rehearsal remains required before production activation.",
  };
}

async function runSeasonBootstrap(records, metadata) {
  const model = createSeasonBootstrapModel();
  assert.equal(model.coreRegionCount, 25);
  assert.equal(model.coreSpawnEligibleCount, 0);
  assert.equal(model.holdingTowerReservationsPresent, true);
  const harness = createPhase8Staging(records, metadata);
  const first = await harness.prepareNext();
  const second = await harness.prepareNext();
  assert.equal(harness.store.snapshot().standbyPackageCount, 2);
  harness.reviewRegion(first.allocation.regionId, "publication");
  await harness.publish(first.allocation.regionId);
  harness.reviewRegion(first.allocation.regionId, "activation");
  await harness.activate(first.allocation.regionId);
  const third = await harness.prepareNext();
  const placements = [
    await harness.claimPlacement(first.allocation.regionId, "phase8-season-player-1"),
    await harness.claimPlacement(first.allocation.regionId, "phase8-season-player-2"),
  ];
  assert.equal(harness.store.snapshot().standbyPackageCount, 2);
  return {
    ...model,
    packageAdapterWorldId: metadata.worldId,
    packageAdapterSeasonId: metadata.seasonId,
    futureSeasonPackagesMustBeFreshlyGenerated: true,
    approvedRasterRecordsRelabeledAcrossSeasons: false,
    firstExpansionCoordinate: first.allocation.coordinate,
    initialStandbyRegions: [first.allocation.regionId, second.allocation.regionId],
    activatedInitialCapacityRegion: first.allocation.regionId,
    replacementStandbyRegion: third.allocation.regionId,
    finalStandbyBuffer: harness.store.snapshot().standbyPackageCount,
    simulatedPlacements: placements,
    productionWorldModified: false,
  };
}

function runOrphanCleanupPolicy() {
  const nowMs = Date.UTC(2026, 7, 16, 12, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  const artifacts = [
    { packageHash: "generating-old", status: "GENERATING", updatedAtMs: nowMs - 2 * day },
    { packageHash: "abandoned-old", status: "ABANDONED_UPLOAD", updatedAtMs: nowMs - 8 * day },
    { packageHash: "failed-young", status: "FAILED", updatedAtMs: nowMs - 10 * day },
    { packageHash: "rolled-back-old", status: "ROLLED_BACK", updatedAtMs: nowMs - 31 * day },
    { packageHash: "superseded-old", status: "SUPERSEDED_UNPUBLISHED", updatedAtMs: nowMs - 31 * day },
    { packageHash: "published-never-delete", status: LIFECYCLE.PUBLISHED, updatedAtMs: nowMs - 365 * day },
    { packageHash: "published-marker-wins", status: "FAILED", updatedAtMs: nowMs - 365 * day },
  ];
  const published = new Set(["published-never-delete", "published-marker-wins"]);
  const plan = planOrphanCleanup(artifacts, published, nowMs);
  assert(plan.filter(item => published.has(item.packageHash)).every(item => item.action === "RETAIN_IMMUTABLE"));
  assert(plan.filter(item => item.action === "DELETE_ELIGIBLE_AFTER_DRY_RUN").every(item => !published.has(item.packageHash)));
  return {
    retentionRules: {
      generatingHours: 24,
      abandonedUploadHours: 168,
      failedHours: 720,
      rolledBackHours: 720,
      supersededUnpublishedHours: 720,
      publishedHours: "infinite",
    },
    plan,
    publishedAutomaticDeletes: 0,
    dryRunRequired: true,
  };
}

async function main() {
  cleanOutputRoot();
  const lockedAssets = readLockedAssetManifest();
  const productionAdapter = createCurrentProductionWorldAdapter();
  const { metadata, records } = await loadApprovedPhase6FRecords(RECORD_COUNT);
  const phase6dResults = JSON.parse(fs.readFileSync(
    path.join(ROOT, "benchmark-results", "map", "phase-6d", "study", "phase-6d-results.json"),
    "utf8",
  ));
  const phase7Results = JSON.parse(fs.readFileSync(
    path.join(ROOT, "benchmark-results", "map", "phase-7", "phase-7-results.json"),
    "utf8",
  ));
  const phase7RoadBenchmark = JSON.parse(fs.readFileSync(
    path.join(ROOT, "benchmark-results", "map", "phase-7", "road-cache-benchmark.json"),
    "utf8",
  ));
  assert.equal(lockedAssets.hash, ASSET_MANIFEST_HASH);
  assert.equal(productionAdapter.productionMapCount, 15);
  assert.equal(productionAdapter.productionCityCount, 1050);
  assert.equal(productionAdapter.directedMapChainCount, 210);
  assert.equal(productionAdapter.generatedActiveRegionCount, 0);

  const firstRegion = await runFirstRegionRehearsal(records, metadata);
  const threeRegion = await runThreeRegionRehearsal(records, metadata, productionAdapter);
  const standbyBuffer = await runStandbyBufferEvaluation(records, metadata);
  const roadCache = evaluateRoadCacheStrategies(records, phase7RoadBenchmark);
  const workerCapacity = await runWorkerCapacity(records, metadata, phase6dResults, roadCache);
  const costModel = buildCostModel(phase7Results.storage);
  const securityAndStateMachine = await runSecurityAndStateMachine(records, metadata);
  const activationFaults = await runActivationFaults(records, metadata);
  const loadAndFault = await runLoadAndFaultSuite(records, metadata);
  const runtimePerformance = await runRuntimePerformance(records, metadata, productionAdapter);
  const seasonBootstrap = await runSeasonBootstrap(records, metadata);
  const orphanCleanup = runOrphanCleanupPolicy();
  const operations = createOperationsPlan();

  assert.equal(roadCache.byteIdentical, true);
  assert.equal(securityAndStateMachine.productionFeatureFlagDefault, FEATURE_FLAG_DEFAULT);
  assert.equal(activationFaults.allFaultsAtomic, true);
  assert.equal(seasonBootstrap.finalStandbyBuffer, RECOMMENDED_STANDBY_BUFFER);

  const result = {
    schemaVersion: 1,
    phase: PHASE,
    developmentOnly: true,
    productionEquivalentStagingOnly: true,
    productionFirestoreWrites: 0,
    productionActivated: false,
    realPlayersPlaced: 0,
    deploymentPerformed: false,
    mergePerformed: false,
    branchPushPerformed: false,
    phase9Started: false,
    approvedArtStyleLocked: true,
    assetLibrary: {
      count: lockedAssets.manifest.assetCount,
      manifestHash: lockedAssets.hash,
      modified: false,
    },
    currentProductionWorld: productionAdapter,
    lockedRules: {
      mapDimensions: { width: 1448, height: 1086 },
      cityCapacity: PLAYER_REGION_CITY_CAPACITY,
      startingCandidates: 4,
      cardinalRoadCorridors: 4,
      cardinalTravelOnly: true,
      immutablePublishedPackages: true,
      authoritativeEdgeContracts: true,
      minimumNpcCitiesForSpawn: MINIMUM_NPC_CITIES_FOR_SPAWN,
    },
    stagingArchitecture: {
      firestore: "isolated in-memory emulator semantics matching Phase 7 authoritative collections/transactions",
      storage: "isolated immutable content-addressed object store with hash verification",
      runtime: "controlled Node worker; never browser render path",
      auth: "authenticated crownlands_map_admin audience bound to staging",
      featureFlagDefault: FEATURE_FLAG_DEFAULT,
      productionTargetAllowed: false,
    },
    firstRegion,
    threeRegion,
    standbyBuffer,
    workerCapacity,
    roadCache,
    costModel,
    orphanCleanup,
    backupRecovery: operations.backupRecovery,
    securityAndStateMachine,
    activationFaults,
    runtimePerformance,
    cdn: operations.cdn,
    studioAdmin: {
      workflow: ["next coordinate", "map preview", "40 cities", "road sockets", "edge contracts", "validator", "approve/reject", "publish", "activate"],
      publicationApprovalRequired: true,
      activationApprovalRequired: true,
      automaticPublicationAllowed: false,
      reviewsExecuted: firstRegion.publicationReview.approved && firstRegion.activationReview.approved,
    },
    seasonBootstrap,
    persistenceAudit: operations.persistence,
    monitoring: operations.monitoring,
    rolloutAndRollback: operations.rollout,
    loadAndFault,
    readiness: {
      firstRegionRehearsalPassed: true,
      threeRegionRehearsalPassed: true,
      standbyBufferValidated: standbyBuffer.recommendedBufferSize === 2,
      workerRecommendationEstablished: workerCapacity.recommendation.defaultConcurrency === 2,
      roadCacheStrategyEstablished: roadCache.recommendation.strategy === "process-local bounded LRU",
      operationalCostsDocumented: true,
      orphanCleanupSafe: orphanCleanup.publishedAutomaticDeletes === 0,
      backupRecoveryDefined: operations.backupRecovery.publishedPackageRegenerationAllowed === false,
      securityAndStateMachinePassed: Object.values(securityAndStateMachine.illegalTransitions).every(item => item.rejected),
      activationAtomic: activationFaults.allFaultsAtomic,
      featureFlagOff: securityAndStateMachine.productionFeatureFlagDefault === false,
      killSwitchPassed: securityAndStateMachine.killSwitch.expansionStopped.rejected,
      monitoringThresholdsDefined: true,
      seasonBootstrapPassed: seasonBootstrap.finalStandbyBuffer === 2,
      runtimeLazyLoadingPassed: runtimePerformance.mobilePlanningGate,
      rollbackPerStageDefined: operations.rollout.stages.every(stage => stage.rollback),
      productionUnchanged: productionAdapter.productionMapCount === 15
        && productionAdapter.productionCityCount === 1050
        && productionAdapter.generatedActiveRegionCount === 0,
    },
    knownLimitations: [
      "No real staging Firebase project or bucket was mutated; the rehearsal is local/emulator-only.",
      "Cloud billing projections depend on deployment region, free-tier eligibility, CDN contract, backup retention, and actual traffic.",
      "Physical mobile-device render/network testing is still required before first production activation.",
      "Production security rules, IAM bindings, alert routes, backups, and feature flags remain rollout tasks, not Phase 8 writes.",
    ],
    blockersBeforeFirstProductionDeployment: [
      "provision an isolated production-equivalent Firebase staging project and rerun the same receipts against it",
      "implement and review production IAM/Security Rules for the Phase 8 admin contract",
      "provision the authoritative feature flag and kill switches with default OFF",
      "configure backups, PITR, Storage versioning, CDN headers, dashboards, budgets, and alert routing",
      "complete physical-device and network QA against staged generated maps",
      "approve a Stage 0 code-only deployment plan with explicit operator ownership and rollback window",
    ],
    recommendedNextPhase: "Phase 9 should be a reviewed staging-project implementation and Stage 0 code-deployment preparation only; it must not activate regions automatically.",
  };

  writeJson(RESULTS_PATH, result);
  const outputs = {
    "integration/first-region-rehearsal.json": firstRegion,
    "integration/three-region-rehearsal.json": threeRegion,
    "integration/standby-buffer.json": standbyBuffer,
    "integration/worker-capacity.json": workerCapacity,
    "integration/road-cache-strategy.json": roadCache,
    "integration/cost-model.json": costModel,
    "integration/orphan-cleanup.json": orphanCleanup,
    "integration/security-state-machine.json": securityAndStateMachine,
    "integration/activation-faults.json": activationFaults,
    "integration/runtime-performance.json": runtimePerformance,
    "integration/season-bootstrap.json": seasonBootstrap,
    "integration/load-and-fault.json": loadAndFault,
    "integration/operations-plan.json": operations,
  };
  for (const [relative, value] of Object.entries(outputs)) writeJson(path.join(OUTPUT_ROOT, relative), value);
  console.log(JSON.stringify({
    phase: PHASE,
    result: "PASS",
    firstRegion: firstRegion.coordinate,
    threeRegionCount: threeRegion.coordinates.length,
    standbyBuffer: standbyBuffer.recommendedBufferSize,
    workerConcurrency: workerCapacity.recommendation.defaultConcurrency,
    roadCacheLimit: ROAD_CACHE_LIMIT,
    runtimeCatalogRegions: runtimePerformance.catalogRegions,
    activationFaults: activationFaults.injectedFaults.length,
    productionMaps: productionAdapter.productionMapCount,
    productionCities: productionAdapter.productionCityCount,
    assetManifestHash: result.assetLibrary.manifestHash,
    output: path.relative(ROOT, RESULTS_PATH).replaceAll("\\", "/"),
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
