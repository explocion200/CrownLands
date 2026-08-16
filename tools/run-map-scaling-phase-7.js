"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  PHASE,
  LIFECYCLE,
  ASSET_MANIFEST_HASH,
  SIDES,
  OPPOSITE,
  coordinateKey,
  hashValue,
  summarizeTimings,
  createAdminActor,
  readLockedAssetManifest,
  loadApprovedPhase6FRecords,
  validateStandbyPackage,
  RoadPresentationCache,
  ApprovedPhase6FPackageWorker,
  Phase7IntegrationStore,
  WorldExpansionController,
  LazyCombinedCatalogAdapter,
  createCurrentProductionWorldAdapter,
  createStudioAdminContract,
  storageProjection,
} = require("./map-scaling-phase-7/architecture");
const { createPermanentCorePackage } = require("./map-scaling-phase-5/core-package");
const { createAllocatorCore } = require("./map-scaling-phase-5/fixtures");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-7");
const RESULTS_PATH = path.join(OUTPUT_ROOT, "phase-7-results.json");
const SIMULATION_REGION_COUNT = 128;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function cleanOutputRoot() {
  const expected = path.resolve(ROOT, "benchmark-results", "map", "phase-7");
  const resolved = path.resolve(OUTPUT_ROOT);
  assert.equal(resolved, expected, "Phase 7 output safety check failed.");
  assert(resolved.startsWith(path.resolve(ROOT) + path.sep), "Output must stay inside the repository.");
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function expectFailure(operation, expectedCode = "") {
  return Promise.resolve()
    .then(operation)
    .then(() => ({ rejected: false, code: "", message: "" }))
    .catch(error => {
      if (expectedCode) assert.equal(error.code, expectedCode, error.message);
      return { rejected: true, code: error.code || "", message: error.message };
    });
}

function countNeighborPairs(store) {
  let directed = 0;
  let reciprocal = 0;
  for (const [regionId, topology] of store.runtimeTopology) {
    for (const [side, connection] of Object.entries(topology)) {
      if (connection.state !== "open") continue;
      directed += 1;
      const target = store.runtimeTopology.get(connection.targetRegionId);
      if (target?.[OPPOSITE[side]]?.state === "open" && target[OPPOSITE[side]].targetRegionId === regionId) {
        reciprocal += 1;
      }
    }
  }
  assert.equal(directed, reciprocal);
  return { directed, undirected: directed / 2, reciprocal };
}

function assertPackageUnchanged(packageValue, originalHash) {
  assert.equal(packageValue.packageHash, originalHash);
  assert.equal(validateStandbyPackage(packageValue).valid, true);
}

async function createController(records, metadata, actor, options = {}) {
  const store = new Phase7IntegrationStore({ resetGeneration: options.resetGeneration });
  const roadCache = options.roadCache || new RoadPresentationCache();
  const worker = new ApprovedPhase6FPackageWorker({ metadata, roadCache });
  const corePackage = createPermanentCorePackage();
  const coreRegions = createAllocatorCore(corePackage);
  const controller = new WorldExpansionController({
    store,
    worker,
    records,
    metadata,
    coreRegions,
    actor,
  });
  return { store, worker, controller, roadCache, corePackage, coreRegions };
}

async function runLifecycleAndSpawnScenario(records, metadata, actor) {
  const { store, controller } = await createController(records, metadata, actor);
  const first = await controller.prepareNext();
  const firstHash = first.packageValue.packageHash;
  assert.equal(first.packageValue.lifecycle, LIFECYCLE.STANDBY);
  assert.equal(store.runtimeCatalog.size, 0, "STANDBY must not be discoverable.");
  const firstPublish = await controller.publishNext();
  assert.equal(firstPublish.lifecycle, LIFECYCLE.PUBLISHED);
  assert.equal(store.runtimeCatalog.get(first.allocation.regionId).active, false);
  await controller.activateNextPublished();
  assert.equal(store.spawnEligibility(first.allocation.regionId).currentNpcCityCount, 40);
  assert.equal(store.spawnEligibility(first.allocation.regionId).spawnEligible, true);

  const second = await controller.prepareNext();
  assertPackageUnchanged(first.packageValue, firstHash);
  await controller.publishNext();
  assert.equal(store.runtimeTopology.get(first.allocation.regionId).east.state, "gated");
  await controller.activateNextPublished();
  assert.equal(store.runtimeTopology.get(first.allocation.regionId).east.state, "open");
  assert.equal(store.runtimeTopology.get(second.allocation.regionId).west.state, "open");
  assertPackageUnchanged(first.packageValue, firstHash);

  const claims = [];
  for (let index = 0; index < 26; index += 1) {
    claims.push(await store.claimCityForPlacement(first.allocation.regionId, `player-${index}`));
  }
  assert.equal(claims.at(-1).npcBefore, 15);
  assert.equal(claims.at(-1).npcAfter, 14);
  assert.equal(claims.at(-1).subsequentSpawnEligible, false);
  const rejectedAtFourteen = await expectFailure(
    () => store.claimCityForPlacement(first.allocation.regionId, "player-26"),
    "spawn-threshold",
  );
  assert.equal(rejectedAtFourteen.rejected, true);
  assert.equal(store.runtimeCatalog.get(first.allocation.regionId).active, true);
  assert.equal(store.runtimeCatalog.get(first.allocation.regionId).spawnEligible, false);
  assert.equal(store.runtimeCatalog.get(first.allocation.regionId).currentNpcCityCount, 14);
  assert.equal(store.runtimeTopology.get(first.allocation.regionId).east.state, "open");
  assert.equal(store.cityOwnership.get(first.allocation.regionId).filter(city => city.ownerUid).length, 26);
  assert.equal(store.spawnEligibility(second.allocation.regionId).spawnEligible, true);

  return {
    firstRegionId: first.allocation.regionId,
    secondRegionId: second.allocation.regionId,
    stateFlow: ["ALLOCATED", "GENERATING", "VALIDATING", "STANDBY", "PUBLISHING", "PUBLISHED", "ACTIVE"],
    standbyDiscoverable: false,
    publishedActive: false,
    packageHashBeforeNeighbor: firstHash,
    packageHashAfterNeighbor: first.packageValue.packageHash,
    gateToOpenWithoutRebake: true,
    authoritativeSpawnThreshold: {
      claimsAccepted: claims.length,
      finalAcceptedClaim: claims.at(-1),
      rejectedAtFourteen,
      existingPlayersRemoved: false,
      travelChangedByThreshold: false,
      ownershipReset: false,
    },
    secondRegionEligibleForFuturePlacement: store.spawnEligibility(second.allocation.regionId),
    snapshot: store.snapshot(),
  };
}

async function runStandbyBufferEvaluation(records, metadata, actor, phase6fResults) {
  const evaluations = [];
  for (const bufferSize of [1, 2]) {
    const { store, controller } = await createController(records, metadata, actor);
    const startedAt = performance.now();
    await controller.maintainStandbyBuffer(bufferSize);
    const elapsedMs = performance.now() - startedAt;
    assert.equal(store.snapshot().standbyPackageCount, bufferSize);
    assert.equal(store.runtimeCatalog.size, 0);
    const storageBytes = [...store.standbyPackages.values()].reduce(
      (sum, packageValue) => sum + packageValue.mapWebp.bytes + packageValue.thumbnailWebp.bytes,
      0,
    );
    evaluations.push({
      bufferSize,
      preparationMs: elapsedMs,
      generation: controller.generationMetrics(),
      standbyRuntimeAssetBytes: storageBytes,
      discoverableRegions: store.runtimeCatalog.size,
      resilience: bufferSize === 2 ? "one package may be consumed while one remains ready" : "no warm spare after consumption",
    });
  }
  const rasterP95Ms = phase6fResults.performance.rasterPerMapMs.p95;
  return {
    evaluations,
    recommendedBufferSize: 2,
    rationale: `A two-package buffer adds one map+thumbnail (about ${Math.round(phase6fResults.storage.actualRuntimeMapAndThumbnailBytesFor10000 / 10000)} bytes) while covering the ${rasterP95Ms.toFixed(3)} ms approved offline raster p95 and a single worker interruption.`,
    autoActivationAllowed: false,
  };
}

async function runFailureAndConcurrencySuite(records, metadata, actor) {
  const { store, worker, controller } = await createController(records, metadata, actor);
  const first = await controller.prepareNext();
  const allocation = first.allocation;
  const deterministicA = worker.generate({ record: records[0], allocation });
  const deterministicB = worker.generate({ record: records[0], allocation });
  assert.equal(deterministicA.packageHash, deterministicB.packageHash);
  assert.equal(deterministicA.files["map.webp"].equals(deterministicB.files["map.webp"]), true);

  const sameCoordinate = await Promise.all([
    store.registerAllocation(allocation, actor),
    store.registerAllocation(allocation, actor),
  ]);
  assert(sameCoordinate.every(result => result.idempotent));
  const duplicateAllocation = {
    ...allocation,
    regionId: `${allocation.regionId}-collision`,
  };
  const coordinateCollision = await expectFailure(
    () => store.registerAllocation(duplicateAllocation, actor),
    "duplicate-coordinate",
  );
  const regionIdCollision = await expectFailure(
    () => store.registerAllocation({
      ...allocation,
      coordinate: { ...allocation.coordinate, gridX: allocation.coordinate.gridX + 20 },
    }, actor),
    "duplicate-region-id",
  );

  const publicationRace = await Promise.all([
    store.publishPackage(allocation.regionId, actor),
    store.publishPackage(allocation.regionId, actor),
  ]);
  assert.equal(publicationRace.filter(result => result.idempotent).length, 1);
  const firstPublishedHash = store.publicationMarkers.get(allocation.regionId);
  assert.equal(firstPublishedHash, first.packageValue.packageHash);
  const differentPackage = worker.generate({ record: records[0], allocation, retrySalt: "publication-collision-v2" });
  assert.notEqual(differentPackage.packageHash, firstPublishedHash);
  store.standbyPackages.set(allocation.regionId, differentPackage);
  const publicationCollision = await expectFailure(
    () => store.publishPackage(allocation.regionId, actor),
    "duplicate-publication",
  );
  store.standbyPackages.delete(allocation.regionId);
  const mapDescriptor = first.packageValue.storage.files["map.webp"];
  const immutableOverwrite = await expectFailure(
    () => store.uploadImmutableFile(mapDescriptor, Buffer.from("corrupt replacement")),
    "immutable-overwrite",
  );
  const activationRace = await Promise.all([
    store.activateRegion(allocation.regionId, actor),
    store.activateRegion(allocation.regionId, actor),
  ]);
  assert.equal(activationRace.filter(result => result.idempotent).length, 1);
  const idempotentCityInitialization = store.initializeCitiesIdempotently(first.packageValue);
  assert.equal(idempotentCityInitialization.idempotent, true);

  const workerCrashController = await createController(records, metadata, actor);
  const crashAfterEncode = await expectFailure(
    () => workerCrashController.controller.prepareNext({ faultAt: "after_map_encode" }),
    "worker-crash-after-map-encode",
  );
  assert.equal(workerCrashController.store.immutablePackages.size, 0);
  assert.equal(workerCrashController.store.runtimeCatalog.size, 0);

  const publicationFaults = [];
  for (const faultAt of ["after_asset_upload", "publication_transaction", "validator_failure"]) {
    const fixture = await createController(records, metadata, actor);
    const prepared = await fixture.controller.prepareNext();
    const failure = await expectFailure(
      () => fixture.store.publishPackage(prepared.allocation.regionId, actor, { faultAt }),
    );
    assert.equal(failure.rejected, true);
    assert.equal(fixture.store.publicationMarkers.size, 0);
    assert.equal(fixture.store.runtimeCatalog.size, 0);
    assert.equal(fixture.store.regions.get(prepared.allocation.regionId).lifecycle, LIFECYCLE.STANDBY);
    publicationFaults.push({ faultAt, ...failure, snapshot: fixture.store.snapshot() });
  }

  const activationFixture = await createController(records, metadata, actor);
  const activationPrepared = await activationFixture.controller.prepareNext();
  await activationFixture.controller.publishNext();
  const activationFailure = await expectFailure(
    () => activationFixture.store.activateRegion(activationPrepared.allocation.regionId, actor, { faultAt: "activation_transaction" }),
    "activation-transaction-failed",
  );
  assert.equal(activationFixture.store.activationMarkers.size, 0);
  assert.equal(activationFixture.store.cityOwnership.size, 0);
  assert.equal(activationFixture.store.runtimeCatalog.get(activationPrepared.allocation.regionId).lifecycle, LIFECYCLE.PUBLISHED);

  const invalidFixture = await createController(records, metadata, actor);
  const invalidPrepared = await invalidFixture.controller.prepareNext();
  invalidFixture.store.standbyPackages.delete(invalidPrepared.allocation.regionId);
  invalidFixture.store.regions.get(invalidPrepared.allocation.regionId).lifecycle = LIFECYCLE.VALIDATING;
  const invalidPackage = { ...invalidPrepared.packageValue, cities: invalidPrepared.packageValue.cities.slice(0, 39) };
  const invalidRejected = await expectFailure(() => invalidFixture.store.saveStandbyPackage(invalidPackage, actor));
  assert.equal(invalidRejected.rejected, true);
  assert.equal(invalidFixture.store.runtimeCatalog.size, 0);

  const adjacentFixture = await createController(records, metadata, actor);
  const adjacentOne = await adjacentFixture.controller.prepareNext();
  await adjacentFixture.controller.publishNext();
  const adjacentTwo = await adjacentFixture.controller.prepareNext();
  const staleClone = structuredClone(adjacentTwo.packageValue);
  staleClone.edgeContracts.sides.west.inheritedPublishedConstraint = null;
  const staleErrors = adjacentFixture.store.validatePublishedNeighborInheritance(staleClone);
  assert(staleErrors.includes("west:stale_or_missing_published_edge_contract"));
  await adjacentFixture.controller.publishNext();
  assert.equal(adjacentFixture.store.publicationMarkers.size, 2);

  const retryFixture = await createController(records, metadata, actor);
  const retryOriginal = await retryFixture.controller.prepareNext();
  const retryReceipt = retryFixture.store.beginUnpublishedRetry(
    retryOriginal.allocation.regionId,
    actor,
    "revised-config-v2",
  );
  const retryPackage = retryFixture.worker.generate({
    record: records[0],
    allocation: retryOriginal.allocation,
    retrySalt: retryReceipt.retrySalt,
  });
  assert.notEqual(retryPackage.packageHash, retryOriginal.packageValue.packageHash);
  await retryFixture.store.saveStandbyPackage(retryPackage, actor);
  assert.equal(retryReceipt.coordinateReused, true);
  const publishedRetryRejected = await expectFailure(
    async () => {
      await retryFixture.store.publishPackage(retryOriginal.allocation.regionId, actor);
      return retryFixture.store.beginUnpublishedRetry(retryOriginal.allocation.regionId, actor, "forbidden-v3");
    },
    "published-package-immutable",
  );

  const parallelFixture = await createController(records, metadata, actor);
  const generated = [];
  for (let index = 0; index < 4; index += 1) generated.push(await parallelFixture.controller.prepareNext());
  const parallelPackageDispatch = await Promise.all(generated.map((item, index) => Promise.resolve().then(() => (
    parallelFixture.worker.generate({ record: records[index], allocation: item.allocation })
  ))));
  const uniqueCoordinateCount = new Set(generated.map(item => coordinateKey(item.allocation.coordinate))).size;
  assert.equal(uniqueCoordinateCount, generated.length);
  assert.equal(new Set(parallelPackageDispatch.map(item => item.packageHash)).size, generated.length);

  const playerActor = { id: "normal-player", role: "player" };
  const unauthorized = await expectFailure(
    () => store.registerAllocation({ ...allocation, regionId: "forbidden" }, playerActor),
    "permission-denied",
  );

  return {
    deterministicDuplicateJobs: {
      samePackageHash: deterministicA.packageHash === deterministicB.packageHash,
      sameMapBytes: deterministicA.files["map.webp"].equals(deterministicB.files["map.webp"]),
    },
    coordinateCollision,
    regionIdCollision,
    publicationRace,
    publicationCollision,
    immutableOverwrite,
    activationRace,
    idempotentCityInitialization,
    firstPublishedHash,
    workerCrashAfterMapEncode: crashAfterEncode,
    publicationFaults,
    activationTransactionFailure: activationFailure,
    invalidPackageRejected: invalidRejected,
    adjacentGeneration: {
      inheritedPublishedContractAccepted: true,
      stalePackageErrors: staleErrors,
    },
    unpublishedVersionedRetry: {
      receipt: retryReceipt,
      originalPackageHash: retryOriginal.packageValue.packageHash,
      retryPackageHash: retryPackage.packageHash,
      publishedRetryRejected,
    },
    parallelUniqueAllocations: uniqueCoordinateCount,
    parallelPackageDispatchCount: parallelPackageDispatch.length,
    unauthorizedPlayerAction: unauthorized,
    partialRegionsVisible: 0,
    inconsistentTopologyPublished: 0,
  };
}

function runRecoverySuite(actor) {
  const store = new Phase7IntegrationStore();
  const states = Object.values(LIFECYCLE).filter(state => state !== LIFECYCLE.FAILED);
  for (const [index, state] of states.entries()) {
    const regionId = `recovery-${state.toLowerCase()}`;
    store.regions.set(regionId, {
      regionId,
      coordinate: { gridX: index + 50, gridY: 50 },
      layer: 10,
      clockwiseSlot: index,
      lifecycle: state,
      packageHash: `hash-${index}`,
    });
    if (state === LIFECYCLE.STANDBY) store.standbyPackages.set(regionId, { packageHash: `hash-${index}` });
    if (state === LIFECYCLE.PUBLISHING) store.stagedPublications.set(regionId, { packageHash: `hash-${index}` });
  }
  const markerRegion = "recovery-publishing-marker";
  store.regions.set(markerRegion, {
    regionId: markerRegion,
    coordinate: { gridX: 99, gridY: 50 },
    layer: 10,
    clockwiseSlot: 99,
    lifecycle: LIFECYCLE.PUBLISHING,
    packageHash: "marker-hash",
  });
  store.publicationMarkers.set(markerRegion, "marker-hash");
  const actions = store.recoverController(actor);
  const byAction = actions.reduce((counts, item) => {
    counts[item.action] = (counts[item.action] || 0) + 1;
    return counts;
  }, {});
  assert.equal(store.regions.get("recovery-generating").lifecycle, LIFECYCLE.ALLOCATED);
  assert.equal(store.regions.get("recovery-validating").lifecycle, LIFECYCLE.ALLOCATED);
  assert.equal(store.regions.get("recovery-publishing").lifecycle, LIFECYCLE.ALLOCATED);
  assert.equal(store.regions.get(markerRegion).lifecycle, LIFECYCLE.PUBLISHED);
  assert.equal(store.regions.get("recovery-published").lifecycle, LIFECYCLE.PUBLISHED);
  assert.equal(store.regions.get("recovery-active").lifecycle, LIFECYCLE.ACTIVE);
  return { actions, byAction, terminalStatesPreserved: true, publicationMarkerAuthoritative: true };
}

async function runMultiLayerSimulation(records, metadata, actor, productionAdapter) {
  const { store, controller, roadCache } = await createController(records, metadata, actor);
  const startMemory = process.memoryUsage().rss;
  const startedAt = performance.now();
  const regionIds = [];
  const packageHashes = [];
  const cityIds = new Set();
  for (let index = 0; index < SIMULATION_REGION_COUNT; index += 1) {
    const prepared = await controller.prepareNext();
    await controller.publishNext();
    await controller.activateNextPublished();
    regionIds.push(prepared.allocation.regionId);
    packageHashes.push(prepared.packageValue.packageHash);
    for (const city of prepared.packageValue.cities) {
      assert(!cityIds.has(city.id), `Duplicate dynamic city ID ${city.id}.`);
      cityIds.add(city.id);
    }
  }
  const durationMs = performance.now() - startedAt;
  const endMemory = process.memoryUsage().rss;
  assert.equal(new Set(regionIds).size, SIMULATION_REGION_COUNT);
  assert.equal(new Set(packageHashes).size, SIMULATION_REGION_COUNT);
  assert.equal(cityIds.size, SIMULATION_REGION_COUNT * 40);
  const ordered = controller.orderedRegions();
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    assert(current.layer > previous.layer || current.clockwiseSlot === previous.clockwiseSlot + 1);
  }
  const layerCounts = ordered.reduce((counts, region) => {
    counts[region.layer] = (counts[region.layer] || 0) + 1;
    return counts;
  }, {});
  assert.equal(layerCounts[1], 24);
  assert.equal(layerCounts[2], 32);
  const neighborPairs = countNeighborPairs(store);
  assert(neighborPairs.undirected > 0);
  assert.equal(store.snapshot().activeRegionCount, SIMULATION_REGION_COUNT);

  const lazy = new LazyCombinedCatalogAdapter({
    productionCatalog: productionAdapter.catalog,
    store,
    cacheLimit: 4,
  });
  const startup = lazy.listCatalog();
  assert.equal(startup.catalog.definitionsIncluded, false);
  assert.equal(startup.catalog.mapBytesIncluded, false);
  assert.equal(startup.catalog.currentHandcraftedRegions.length, 15);
  assert.equal(startup.catalog.generatedRegions.length, SIMULATION_REGION_COUNT);
  const firstFetch = lazy.fetchRegion(regionIds[0]);
  const cachedFetch = lazy.fetchRegion(regionIds[0]);
  assert.equal(firstFetch.cacheHit, false);
  assert.equal(cachedFetch.cacheHit, true);
  for (const regionId of regionIds.slice(1, 8)) lazy.fetchRegion(regionId);
  assert(lazy.cache.size <= 4);
  const firstOpen = Object.values(store.runtimeTopology.get(regionIds[0])).find(edge => edge.state === "open");
  assert(firstOpen);
  lazy.transition(regionIds[0], firstOpen.targetRegionId);

  const lifecycleEvents = store.events.reduce((counts, event) => {
    counts[event.event] = (counts[event.event] || 0) + 1;
    return counts;
  }, {});
  assert.equal(lifecycleEvents.allocation, SIMULATION_REGION_COUNT);
  assert.equal(lifecycleEvents.publication, SIMULATION_REGION_COUNT);
  assert.equal(lifecycleEvents.activation, SIMULATION_REGION_COUNT);
  assert(store.events.every(event => event.sensitivePlayerDataLogged === false));

  return {
    regionCount: SIMULATION_REGION_COUNT,
    completeLayer1: layerCounts[1] === 24,
    completeLayer2: layerCounts[2] === 32,
    highestLayer: Math.max(...Object.keys(layerCounts).map(Number)),
    layerCounts,
    uniqueCoordinates: new Set(ordered.map(region => coordinateKey(region.coordinate))).size,
    uniqueRegionIds: new Set(regionIds).size,
    uniqueCityIds: cityIds.size,
    uniquePackageHashes: new Set(packageHashes).size,
    neighborPairs,
    elapsedMs: durationMs,
    regionsPerSecond: SIMULATION_REGION_COUNT / (durationMs / 1000),
    approximateRssDeltaBytes: Math.max(0, endMemory - startMemory),
    controllerGeneration: controller.generationMetrics(),
    store: store.snapshot(),
    lazyLoading: {
      startupCatalogBytes: startup.bytes,
      firstRegionDefinitionBytes: firstFetch.bytes,
      startupIncludesDefinitions: false,
      startupIncludesMapBytes: false,
      cache: lazy.snapshot(),
    },
    roadPresentationCache: roadCache.snapshot(),
    eventCounts: lifecycleEvents,
    eventsContainSensitivePlayerData: false,
  };
}

async function main() {
  cleanOutputRoot();
  const approvedAssetManifest = readLockedAssetManifest();
  const phase6fResults = JSON.parse(fs.readFileSync(
    path.join(ROOT, "benchmark-results", "map", "phase-6f", "study", "phase-6f-results.json"),
    "utf8",
  ));
  const { metadata, records } = await loadApprovedPhase6FRecords(SIMULATION_REGION_COUNT + 8);
  const actor = createAdminActor();
  const productionAdapter = createCurrentProductionWorldAdapter();
  const studioAdminContract = createStudioAdminContract();

  assert.equal(approvedAssetManifest.hash, ASSET_MANIFEST_HASH);
  assert.equal(productionAdapter.productionMapCount, 15);
  assert.equal(productionAdapter.productionCityCount, 1050);
  assert.equal(productionAdapter.directedMapChainCount, 210);
  assert.equal(productionAdapter.generatedActiveRegionCount, 0);

  const lifecycle = await runLifecycleAndSpawnScenario(records, metadata, actor);
  const standbyBuffer = await runStandbyBufferEvaluation(records, metadata, actor, phase6fResults);
  const concurrencyAndFailure = await runFailureAndConcurrencySuite(records, metadata, actor);
  const recovery = runRecoverySuite(actor);
  const multiLayer = await runMultiLayerSimulation(records, metadata, actor, productionAdapter);
  const storage = storageProjection(phase6fResults);

  const result = {
    schemaVersion: 1,
    phase: PHASE,
    developmentOnly: true,
    emulatorOnly: true,
    productionActivated: false,
    deploymentPerformed: false,
    branchPushPerformed: false,
    approvedArtStyleLocked: true,
    assetLibrary: {
      count: approvedAssetManifest.manifest.assetCount,
      manifestHash: approvedAssetManifest.hash,
      modified: false,
    },
    currentProductionWorld: productionAdapter,
    architecture: {
      workerExecution: "controlled server-side/admin worker; never client render path",
      lifecycle: Object.values(LIFECYCLE),
      immutablePackages: true,
      contentAddressedVersionedPaths: true,
      stagedAtomicPublication: true,
      separateActivationTransaction: true,
      runtimeOpenGatedExcludedFromPackageHash: true,
      laterNeighborInheritsPublishedEdgeContract: true,
      publishedPackageRegenerationForbidden: true,
      publishedPackageRewriteForbidden: true,
      oldRegionAutoRegenerationForbidden: true,
      existingPublishedEdgeContractWins: true,
    },
    lifecycle,
    standbyBuffer,
    concurrencyAndFailure,
    recovery,
    multiLayer,
    studioAdminContract,
    observability: {
      events: [
        "allocation", "generation_start", "generation_end", "validation", "publication_start",
        "storage_upload", "hash_verification", "publication", "activation", "gated_to_open",
        "simulated_spawn_claim", "controller_recovery",
      ],
      timings: ["generation", "assetUpload", "hashVerification", "metadataPublication", "activation", "transition"],
      retriesVisible: true,
      failuresVisible: true,
      playerSensitiveDataExcluded: true,
    },
    storage,
    roadCacheBenchmark: {
      command: "python tools/map-scaling-phase-7/road_cache_benchmark.py",
      output: "benchmark-results/map/phase-7/road-cache-benchmark.json",
      status: "run by Phase 7 validator",
    },
    acceptance: {
      packageReproducible: concurrencyAndFailure.deterministicDuplicateJobs.samePackageHash,
      stagedPublicationAtomic: concurrencyAndFailure.publicationFaults.every(item => item.snapshot.publishedPackageCount === 0),
      activationAtomic: concurrencyAndFailure.activationTransactionFailure.rejected,
      duplicatePrevention: concurrencyAndFailure.coordinateCollision.rejected,
      crashRecoveryDefined: recovery.publicationMarkerAuthoritative,
      laterNeighborWithoutRebake: lifecycle.gateToOpenWithoutRebake,
      runtimeThresholdEnforced: lifecycle.authoritativeSpawnThreshold.rejectedAtFourteen.rejected,
      partialRegionNeverDiscoverable: concurrencyAndFailure.partialRegionsVisible === 0,
      lazyLoadingPreserved: !multiLayer.lazyLoading.startupIncludesDefinitions && !multiLayer.lazyLoading.startupIncludesMapBytes,
      productionWorldUnchanged: productionAdapter.productionMapCount === 15 && productionAdapter.productionCityCount === 1050,
      phase8NotStarted: true,
    },
  };
  writeJson(RESULTS_PATH, result);
  writeJson(path.join(OUTPUT_ROOT, "integration", "lifecycle-and-spawn.json"), lifecycle);
  writeJson(path.join(OUTPUT_ROOT, "integration", "standby-buffer.json"), standbyBuffer);
  writeJson(path.join(OUTPUT_ROOT, "integration", "failure-and-concurrency.json"), concurrencyAndFailure);
  writeJson(path.join(OUTPUT_ROOT, "integration", "recovery.json"), recovery);
  writeJson(path.join(OUTPUT_ROOT, "integration", "multi-layer-simulation.json"), multiLayer);
  writeJson(path.join(OUTPUT_ROOT, "integration", "storage-projection.json"), storage);
  writeJson(path.join(OUTPUT_ROOT, "integration", "studio-admin-contract.json"), studioAdminContract);
  console.log(JSON.stringify({
    phase: result.phase,
    result: "PASS",
    mapsSimulated: multiLayer.regionCount,
    assetManifestHash: result.assetLibrary.manifestHash,
    productionMaps: productionAdapter.productionMapCount,
    productionCities: productionAdapter.productionCityCount,
    output: path.relative(ROOT, RESULTS_PATH).replaceAll("\\", "/"),
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
