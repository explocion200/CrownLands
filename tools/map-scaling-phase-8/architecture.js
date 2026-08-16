"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const {
  getClockwiseRingCoordinates,
  CORE_RADIUS,
} = require("../../region-catalog");
const {
  LIFECYCLE,
  SIDES,
  OPPOSITE,
  ASSET_MANIFEST_HASH,
  hashValue,
  stableJson,
  summarizeTimings,
  validateStandbyPackage,
  RoadPresentationCache,
  ApprovedPhase6FPackageWorker,
  Phase7IntegrationStore,
  WorldExpansionController,
  createCurrentProductionWorldAdapter,
} = require("../map-scaling-phase-7/architecture");
const { createPermanentCorePackage } = require("../map-scaling-phase-5/core-package");
const { createAllocatorCore } = require("../map-scaling-phase-5/fixtures");

const PHASE = "8";
const STAGING_ENVIRONMENT = "phase8-production-equivalent-staging";
const CONTROL_SCHEMA_VERSION = "phase8-expansion-control-v1";
const REQUEST_SCHEMA_VERSION = "phase8-admin-request-v1";
const STATE_MACHINE_SCHEMA_VERSION = "phase8-lifecycle-guard-v1";
const FEATURE_FLAG_DEFAULT = false;
const RECOMMENDED_STANDBY_BUFFER = 2;
const ROAD_CACHE_LIMIT = 12;
const PLAYER_REGION_CITY_CAPACITY = 40;
const MINIMUM_NPC_CITIES_FOR_SPAWN = 15;

const ACTIONS = Object.freeze({
  GENERATE: "generate",
  REVIEW: "review",
  PUBLISH: "publish",
  ACTIVATE: "activate",
  REJECT: "reject",
  RETRY: "retry",
  REGENERATE: "regenerate",
  EDGE_WRITE: "edge_contract_write",
  PACKAGE_HASH_WRITE: "package_hash_write",
  LIFECYCLE_WRITE: "lifecycle_write",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [LIFECYCLE.ALLOCATED]: Object.freeze([LIFECYCLE.GENERATING]),
  [LIFECYCLE.GENERATING]: Object.freeze([LIFECYCLE.VALIDATING, LIFECYCLE.FAILED, LIFECYCLE.ALLOCATED]),
  [LIFECYCLE.VALIDATING]: Object.freeze([LIFECYCLE.STANDBY, LIFECYCLE.FAILED, LIFECYCLE.ALLOCATED]),
  [LIFECYCLE.STANDBY]: Object.freeze([LIFECYCLE.PUBLISHING, LIFECYCLE.FAILED]),
  [LIFECYCLE.PUBLISHING]: Object.freeze([LIFECYCLE.PUBLISHED, LIFECYCLE.STANDBY, LIFECYCLE.FAILED]),
  [LIFECYCLE.PUBLISHED]: Object.freeze([LIFECYCLE.ACTIVE]),
  [LIFECYCLE.ACTIVE]: Object.freeze([]),
  [LIFECYCLE.FAILED]: Object.freeze([LIFECYCLE.ALLOCATED]),
});

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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

function createPhase8AdminActor(label = "phase8-staging-admin") {
  return Object.freeze({
    id: label,
    role: "crownlands_map_admin",
    authenticated: true,
    audience: "crownlands-map-admin",
    environment: STAGING_ENVIRONMENT,
  });
}

function createAdminRequest(controlPlane, action, regionId = "", overrides = {}) {
  return {
    schemaVersion: REQUEST_SCHEMA_VERSION,
    action,
    regionId,
    targetEnvironment: STAGING_ENVIRONMENT,
    controlRevision: controlPlane.revision,
    idempotencyKey: `phase8-${action}-${regionId || "world"}-${controlPlane.revision}`,
    ...overrides,
  };
}

class ExpansionControlPlane {
  constructor() {
    this.schemaVersion = CONTROL_SCHEMA_VERSION;
    this.environment = STAGING_ENVIRONMENT;
    this.productionRolloutEnabled = FEATURE_FLAG_DEFAULT;
    this.stagingRehearsalEnabled = true;
    this.generationWhileProductionGateOff = true;
    this.revision = 1;
    this.killSwitch = {
      expansion: false,
      generation: false,
      publication: false,
      activation: false,
    };
    this.approvals = new Map();
    this.audit = [];
  }

  assertAuthorized(actor, request) {
    if (actor?.role !== "crownlands_map_admin"
      || actor?.authenticated !== true
      || actor?.audience !== "crownlands-map-admin") {
      throw codedError("permission-denied", "Authenticated Crownlands map-admin authority is required.");
    }
    if (!request || request.schemaVersion !== REQUEST_SCHEMA_VERSION) {
      throw codedError("malformed-request", "The Phase 8 admin request schema is required.");
    }
    if (!Object.values(ACTIONS).includes(request.action)) {
      throw codedError("malformed-request", `Unknown admin action ${request.action || "<empty>"}.`);
    }
    if (!String(request.idempotencyKey || "").startsWith("phase8-")) {
      throw codedError("malformed-request", "A Phase 8 idempotency key is required.");
    }
    if (request.controlRevision !== this.revision) {
      throw codedError("stale-admin-client", "The admin client control revision is stale.");
    }
    if (request.targetEnvironment === "production" || request.productionTarget === true) {
      throw codedError("production-target-forbidden", "Phase 8 cannot target production.");
    }
    if (request.targetEnvironment !== this.environment || actor.environment !== this.environment) {
      throw codedError("environment-mismatch", "Admin authority is bound to the Phase 8 staging environment.");
    }
    if (this.killSwitch.expansion) throw codedError("expansion-killed", "Generated-world expansion is stopped.");
    if (request.action === ACTIONS.GENERATE && this.killSwitch.generation) {
      throw codedError("generation-killed", "Automatic generation is stopped.");
    }
    if (request.action === ACTIONS.PUBLISH && this.killSwitch.publication) {
      throw codedError("publication-killed", "Package publication is stopped.");
    }
    if (request.action === ACTIONS.ACTIVATE && this.killSwitch.activation) {
      throw codedError("activation-killed", "Generated-region activation is stopped.");
    }
    if (request.action === ACTIONS.ACTIVATE
      && !this.productionRolloutEnabled
      && !this.stagingRehearsalEnabled) {
      throw codedError("rollout-disabled", "Generated-world rollout is disabled.");
    }
    if (request.action === ACTIONS.GENERATE
      && !this.productionRolloutEnabled
      && !this.generationWhileProductionGateOff) {
      throw codedError("rollout-disabled", "Generation is disabled while rollout is OFF.");
    }
    this.audit.push({
      sequence: this.audit.length + 1,
      actorId: actor.id,
      action: request.action,
      regionId: request.regionId || "",
      targetEnvironment: request.targetEnvironment,
      productionTarget: false,
      allowed: true,
    });
    return true;
  }

  approve(actor, request, stage) {
    this.assertAuthorized(actor, request);
    if (!["publication", "activation"].includes(stage)) {
      throw codedError("malformed-request", `Unknown approval stage ${stage}.`);
    }
    const approvals = this.approvals.get(request.regionId) || new Set();
    approvals.add(stage);
    this.approvals.set(request.regionId, approvals);
    return { regionId: request.regionId, stage, approved: true, revision: this.revision };
  }

  requireApproval(regionId, stage) {
    if (!this.approvals.get(regionId)?.has(stage)) {
      throw codedError("admin-approval-required", `${stage} approval is required for ${regionId}.`);
    }
  }

  setKillSwitch(scope, enabled, actor) {
    if (actor?.role !== "crownlands_map_admin" || actor?.authenticated !== true) {
      throw codedError("permission-denied", "Map-admin authority is required to change kill switches.");
    }
    if (!Object.hasOwn(this.killSwitch, scope)) throw codedError("malformed-request", `Unknown kill-switch scope ${scope}.`);
    this.killSwitch[scope] = Boolean(enabled);
    this.revision += 1;
    this.audit.push({
      sequence: this.audit.length + 1,
      actorId: actor.id,
      action: "kill_switch",
      scope,
      enabled: Boolean(enabled),
      productionTarget: false,
      allowed: true,
    });
    return this.snapshot();
  }

  snapshot() {
    return {
      schemaVersion: this.schemaVersion,
      environment: this.environment,
      revision: this.revision,
      productionRolloutEnabled: this.productionRolloutEnabled,
      featureFlagDefault: FEATURE_FLAG_DEFAULT,
      stagingRehearsalEnabled: this.stagingRehearsalEnabled,
      generationWhileProductionGateOff: this.generationWhileProductionGateOff,
      killSwitch: { ...this.killSwitch },
      approvalCount: [...this.approvals.values()].reduce((sum, stages) => sum + stages.size, 0),
      auditEntries: this.audit.length,
    };
  }
}

class LifecycleGuard {
  constructor() {
    this.schemaVersion = STATE_MACHINE_SCHEMA_VERSION;
    this.states = new Map();
    this.history = [];
  }

  register(regionId) {
    if (this.states.has(regionId)) throw codedError("duplicate-region-id", `Lifecycle guard already contains ${regionId}.`);
    this.states.set(regionId, LIFECYCLE.ALLOCATED);
    this.history.push({ regionId, from: "", to: LIFECYCLE.ALLOCATED, reason: "allocation" });
  }

  transition(regionId, to, reason = "") {
    const from = this.states.get(regionId);
    if (!from) throw codedError("unknown-region", `Lifecycle guard does not contain ${regionId}.`);
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw codedError("illegal-lifecycle-transition", `${from} -> ${to} is forbidden for ${regionId}.`);
    }
    this.states.set(regionId, to);
    this.history.push({ regionId, from, to, reason });
    return to;
  }

  state(regionId) {
    return this.states.get(regionId) || "";
  }

  snapshot() {
    return {
      schemaVersion: this.schemaVersion,
      allowedTransitions: ALLOWED_TRANSITIONS,
      states: Object.fromEntries(this.states),
      history: [...this.history],
    };
  }
}

class Phase8StagingHarness {
  constructor({ metadata, records, resetGeneration = "phase8-staging-generation" }) {
    this.metadata = metadata;
    this.records = records;
    this.actor = createPhase8AdminActor();
    this.control = new ExpansionControlPlane();
    this.guard = new LifecycleGuard();
    this.store = new Phase7IntegrationStore({ resetGeneration });
    this.roadCache = new RoadPresentationCache();
    this.worker = new ApprovedPhase6FPackageWorker({ metadata, roadCache: this.roadCache });
    this.corePackage = createPermanentCorePackage();
    this.coreRegions = createAllocatorCore(this.corePackage);
    this.controller = new WorldExpansionController({
      store: this.store,
      worker: this.worker,
      records,
      metadata,
      coreRegions: this.coreRegions,
      actor: this.actor,
    });
    this.prepared = new Map();
    this.reviews = [];
  }

  request(action, regionId = "", overrides = {}) {
    return createAdminRequest(this.control, action, regionId, overrides);
  }

  async prepareNext({ actor = this.actor, faultAt = "" } = {}) {
    this.control.assertAuthorized(actor, this.request(ACTIONS.GENERATE));
    const prepared = await this.controller.prepareNext({ faultAt });
    const regionId = prepared.allocation.regionId;
    this.guard.register(regionId);
    this.guard.transition(regionId, LIFECYCLE.GENERATING, "worker accepted allocation");
    this.guard.transition(regionId, LIFECYCLE.VALIDATING, "package generated");
    this.guard.transition(regionId, LIFECYCLE.STANDBY, "validation passed");
    this.prepared.set(regionId, prepared);
    return prepared;
  }

  reviewRegion(regionId, stage, actor = this.actor) {
    const request = this.request(ACTIONS.REVIEW, regionId);
    this.control.assertAuthorized(actor, request);
    const prepared = this.prepared.get(regionId);
    assert(prepared, `No generated package is available for ${regionId}.`);
    const packageValue = prepared.packageValue;
    const validation = validateStandbyPackage(packageValue);
    const review = {
      regionId,
      stage,
      mapPreview: packageValue.storage.files["map.webp"].path,
      thumbnailPreview: packageValue.storage.files["thumbnail.webp"].path,
      cityCount: packageValue.cities.length,
      startingCandidateCount: packageValue.startingCandidates.length,
      roadSocketCount: Object.keys(packageValue.edgeContracts.sides).length,
      edgeContractHash: packageValue.edgeContracts.edgeContractHash,
      packageHash: packageValue.packageHash,
      validatorPassed: validation.valid,
      validatorErrors: validation.errors,
      approved: validation.valid && packageValue.cities.length === PLAYER_REGION_CITY_CAPACITY,
    };
    assert.equal(review.approved, true, review.validatorErrors.join(" "));
    this.control.approve(actor, request, stage);
    this.reviews.push(review);
    return review;
  }

  async publish(regionId, actor = this.actor, options = {}) {
    this.control.assertAuthorized(actor, this.request(ACTIONS.PUBLISH, regionId));
    this.control.requireApproval(regionId, "publication");
    if (this.guard.state(regionId) === LIFECYCLE.PUBLISHED) return this.store.publishPackage(regionId, actor, options);
    this.guard.transition(regionId, LIFECYCLE.PUBLISHING, "explicit admin publication approval");
    try {
      const result = await this.store.publishPackage(regionId, actor, options);
      this.guard.transition(regionId, LIFECYCLE.PUBLISHED, "atomic publication marker committed");
      return result;
    } catch (error) {
      this.guard.transition(regionId, LIFECYCLE.STANDBY, "publication rolled back before visibility");
      throw error;
    }
  }

  activationPreflight(regionId, faultAt = "") {
    const packageHash = this.store.publicationMarkers.get(regionId);
    if (!packageHash) throw codedError("package-not-published", `${regionId} has no publication marker.`);
    const packageValue = this.store.immutablePackages.get(packageHash);
    if (!packageValue) throw codedError("missing-package", `Published package ${packageHash} is missing.`);
    if (faultAt === "hash_mismatch") throw codedError("package-hash-mismatch", "Injected package-hash mismatch.");
    const validation = validateStandbyPackage(packageValue);
    if (!validation.valid) throw codedError("invalid-package", validation.errors.join(" "));
    if (faultAt === "missing_map") throw codedError("missing-map", "Immutable map asset is unreachable.");
    if (faultAt === "missing_thumbnail") throw codedError("missing-thumbnail", "Immutable thumbnail asset is unreachable.");
    if (!this.store.verifyImmutableFiles(packageValue)) {
      throw codedError("immutable-asset-unreachable", "One or more immutable package assets are unreachable.");
    }
    const cityDefinitions = this.store.cityDefinitions.get(regionId) || [];
    if (faultAt === "invalid_city_count" || cityDefinitions.length !== PLAYER_REGION_CITY_CAPACITY) {
      throw codedError("invalid-city-count", "Activation requires exactly 40 ready city definitions.");
    }
    const topology = this.store.runtimeTopology.get(regionId);
    if (!topology || Object.keys(topology).length !== SIDES.length) {
      throw codedError("invalid-topology", "Activation requires four cardinal topology edges.");
    }
    if (Object.values(topology).some(edge => edge.state === "open" && !this.store.runtimeCatalog.has(edge.targetRegionId))) {
      throw codedError("hidden-open-target", "OPEN topology cannot target a missing region.");
    }
    if (faultAt === "conflicting_edge_contract"
      || this.store.validatePublishedNeighborInheritance(packageValue).length) {
      throw codedError("conflicting-edge-contract", "Published edge inheritance failed.");
    }
    const catalog = this.store.runtimeCatalog.get(regionId);
    if (!catalog || catalog.lifecycle !== LIFECYCLE.PUBLISHED || catalog.active) {
      throw codedError("catalog-not-ready", "The published inactive catalog entry is not ready.");
    }
    if (faultAt === "catalog_delay") throw codedError("catalog-delay", "Injected catalog visibility delay.");
    const coordinate = `${catalog.coordinate.gridX},${catalog.coordinate.gridY}`;
    const owners = [...this.store.regions.values()].filter(region => (
      `${region.coordinate.gridX},${region.coordinate.gridY}` === coordinate
    ));
    if (faultAt === "coordinate_conflict" || owners.length !== 1) {
      throw codedError("coordinate-conflict", "Activation coordinate is not uniquely reserved.");
    }
    return {
      packageExists: true,
      packageHashVerified: packageHash === packageValue.packageHash,
      immutableAssetsReachable: true,
      exactCityDefinitionsReady: cityDefinitions.length,
      topologyValid: true,
      edgeContractsValid: true,
      publishedLifecycle: catalog.lifecycle,
      catalogReady: true,
      coordinateUnique: true,
    };
  }

  async activate(regionId, actor = this.actor, { faultAt = "" } = {}) {
    this.control.assertAuthorized(actor, this.request(ACTIONS.ACTIVATE, regionId));
    this.control.requireApproval(regionId, "activation");
    if (this.guard.state(regionId) === LIFECYCLE.ACTIVE) return this.store.activateRegion(regionId, actor);
    const preflight = this.activationPreflight(regionId, faultAt);
    if (faultAt === "before_activation") throw codedError("before-activation-failure", "Injected failure before activation.");
    if (faultAt === "firestore_timeout") throw codedError("firestore-timeout", "Injected Firestore transaction timeout.");
    if (faultAt === "after_city_staging") {
      const stagedOwnership = this.store.cityDefinitions.get(regionId).map(city => ({ id: city.id, ownerUid: "" }));
      assert.equal(stagedOwnership.length, PLAYER_REGION_CITY_CAPACITY);
      throw codedError("activation-staging-failure", "Injected failure after non-authoritative city staging.");
    }
    let result;
    if (faultAt === "activation_transaction") {
      result = await this.store.activateRegion(regionId, actor, { faultAt: "activation_transaction" });
    } else {
      result = await this.store.activateRegion(regionId, actor);
    }
    this.guard.transition(regionId, LIFECYCLE.ACTIVE, "atomic activation transaction committed");
    return { ...result, preflight };
  }

  async claimPlacement(regionId, token) {
    return this.store.claimCityForPlacement(regionId, token);
  }

  snapshot() {
    return {
      environment: STAGING_ENVIRONMENT,
      productionTarget: false,
      control: this.control.snapshot(),
      lifecycle: this.guard.snapshot(),
      store: this.store.snapshot(),
      reviews: [...this.reviews],
    };
  }
}

class BoundedRoadPresentationCache {
  constructor(limit = ROAD_CACHE_LIMIT) {
    assert(Number.isInteger(limit) && limit > 0);
    this.limit = limit;
    this.entries = new Map();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  resolve(record) {
    const key = `${record.roadGeometryId}|${record.theme}`;
    if (this.entries.has(key)) {
      const hash = this.entries.get(key);
      this.entries.delete(key);
      this.entries.set(key, hash);
      this.hits += 1;
      return { key, hash, cacheHit: true };
    }
    const hash = hashValue({
      roadGeometryId: record.roadGeometryId,
      theme: record.theme,
      roadPresentationHash: record.hashes.roadPresentationHash,
      strategy: "approved-phase6f-masked-road-presentation-v1",
    });
    this.entries.set(key, hash);
    this.misses += 1;
    if (this.entries.size > this.limit) {
      this.entries.delete(this.entries.keys().next().value);
      this.evictions += 1;
    }
    return { key, hash, cacheHit: false };
  }

  snapshot() {
    const lookups = this.hits + this.misses;
    return {
      limit: this.limit,
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: lookups ? this.hits / lookups : 0,
    };
  }
}

function evaluateRoadCacheStrategies(records, phase7RoadBenchmark) {
  const full = new RoadPresentationCache();
  const bounded = new BoundedRoadPresentationCache(ROAD_CACHE_LIMIT);
  let byteIdentical = true;
  for (const record of records) {
    const fullResult = full.resolve(record);
    const boundedResult = bounded.resolve(record);
    byteIdentical &&= fullResult.hash === boundedResult.hash;
  }
  const fullMemoryMiB = phase7RoadBenchmark.precomputation.memoryBytes / (1024 ** 2);
  const boundedMemoryMiB = fullMemoryMiB * (ROAD_CACHE_LIMIT / phase7RoadBenchmark.combinationCount);
  return {
    combinationsValidated: phase7RoadBenchmark.combinationCount,
    recordsEvaluated: records.length,
    byteIdentical,
    processLocalFull: {
      entries: phase7RoadBenchmark.combinationCount,
      approximateMemoryMiB: fullMemoryMiB,
      operationalRisk: "high memory pressure per worker instance",
    },
    boundedLru: {
      ...bounded.snapshot(),
      approximateMaximumMemoryMiB: boundedMemoryMiB,
      deterministicOnMiss: true,
      networkDependency: false,
    },
    sharedImmutable: {
      workerMemoryMiB: 0,
      addsNetworkDependency: true,
      addsCacheServiceFailureMode: true,
      recommended: false,
    },
    recommendation: {
      strategy: "process-local bounded LRU",
      entryLimit: ROAD_CACHE_LIMIT,
      reason: "caps the ~197 MiB full-cache footprint while retaining deterministic byte-identical reconstruction",
    },
  };
}

function modelWorkerCapacity(phase6dResults, roadCacheResult, adapterTimings) {
  const generation = phase6dResults.performance.perMapGenerationMs;
  const averageSeconds = generation.average / 1000;
  const p95Seconds = generation.p95 / 1000;
  const baseProcessMiB = 128;
  const perWorkerMiB = baseProcessMiB + roadCacheResult.boundedLru.approximateMaximumMemoryMiB;
  const efficiencies = { 1: 1, 2: 0.92, 4: 0.72, 8: 0.45 };
  const profiles = [1, 2, 4, 8].map(workers => {
    const efficiency = efficiencies[workers];
    const mapsPerSecond = (workers * efficiency) / averageSeconds;
    const p95MapsPerSecond = (workers * efficiency) / p95Seconds;
    return {
      workers,
      modeledMapsPerSecond: mapsPerSecond,
      modeledP95MapsPerSecond: p95MapsPerSecond,
      tenMapQueueDrainSecondsAtP95: 10 / p95MapsPerSecond,
      approximatePeakMemoryMiB: perWorkerMiB * workers,
      modeledCpuPressurePercent: Math.min(100, Math.round((workers / 2) * 90)),
      storageWriteMiBPerSecond: mapsPerSecond * (phase6dResults.storage.mapWebpBytes.average
        + phase6dResults.storage.thumbnailWebpBytes.average) / (1024 ** 2),
      contentionRisk: workers <= 2 ? "low" : workers === 4 ? "moderate" : "high",
      coordinateLockRequired: true,
    };
  });
  return {
    sourceBenchmark: {
      phase6dAverageMs: generation.average,
      phase6dP95Ms: generation.p95,
      phase6dMaximumMs: generation.maximum,
      phase8PackageAdapter: adapterTimings,
    },
    profiles,
    recommendation: {
      defaultConcurrency: 2,
      maximumWithoutExplicitCapacityReview: 2,
      reason: "two workers fit ordinary frontier demand with low lock pressure; four or eight add memory/CPU contention without rollout value",
      scalingPolicy: "scale queue consumers horizontally only after oldest-job age exceeds 10 minutes",
    },
  };
}

function evaluateStandbyBuffers(packageByteSizes, workerFailureRecoverySeconds = 8) {
  const averagePackageBytes = packageByteSizes.reduce((sum, value) => sum + value, 0) / packageByteSizes.length;
  const profiles = [1, 2].map(bufferSize => ({
    bufferSize,
    runtimeStorageBytes: averagePackageBytes * bufferSize,
    workerFailureScenario: {
      consumesOneRegion: true,
      nextGenerationAttemptFails: true,
      standbyRemaining: Math.max(0, bufferSize - 1),
      immediateNextActivationCovered: bufferSize > 1,
      modeledRecoverySeconds: workerFailureRecoverySeconds,
    },
    playerWaitRisk: bufferSize === 1 ? "non-zero during one failed replenishment" : "covered for one activation plus one failed replenishment",
    controllerComplexity: bufferSize === 1 ? "baseline" : "one additional count target; no additional lifecycle states",
  }));
  return {
    profiles,
    recommendedBufferSize: RECOMMENDED_STANDBY_BUFFER,
    evidence: "buffer 2 preserves one ready region after an activation and one worker failure",
    automaticPublicationAllowed: false,
    automaticActivationAllowed: false,
  };
}

function buildCostModel(phase7Storage) {
  const pricing = {
    planningRegion: "us-central1",
    currency: "USD",
    firestoreStandardReadsPer100k: 0.03,
    firestoreStandardWritesPer100k: 0.09,
    firestoreStoragePerGiBHour: 0.00020,
    cloudStorageStandardPerGiBMonth: 0.02,
    cloudStorageClassAPer1000: 0.005,
    cloudStorageClassBPer1000: 0.0004,
    conservativeInternetEgressPerGiB: 0.12,
    freeCloudStorageEgressGiBPerMonth: 100,
    sourceUrls: [
      "https://firebase.google.com/docs/firestore/pricing",
      "https://firebase.google.com/docs/firestore/standard-edition",
      "https://cloud.google.com/storage/pricing",
    ],
    verifiedDate: "2026-08-16",
  };
  const assumptions = {
    firestoreDocumentsPerRegion: 47,
    firestoreIndexedStorageBytesPerRegion: 80 * 1024,
    oneTimeReadsPerRegion: 227,
    oneTimeWritesPerRegion: 135,
    packageObjectsUploadedPerRegion: 12,
    mapAndThumbnailDownloadsPerRegionPerMonth: 200,
    mapViewsPerRegionPerMonth: 100,
    cdnOriginMissRate: 0.10,
  };
  const projections = {};
  for (const count of [1000, 10000, 100000]) {
    const storageProjection = phase7Storage.projections[count];
    const firestoreReads = assumptions.oneTimeReadsPerRegion * count;
    const firestoreWrites = assumptions.oneTimeWritesPerRegion * count;
    const firestoreStorageGiB = assumptions.firestoreIndexedStorageBytesPerRegion * count / (1024 ** 3);
    const runtimeMapAndThumbnailGiB = storageProjection.runtimeMapAndThumbnailGiB;
    const completePackageGiB = storageProjection.completePackageProjectionGiB;
    const noCdnOriginEgressGiB = runtimeMapAndThumbnailGiB * assumptions.mapViewsPerRegionPerMonth;
    const cdnOriginEgressGiB = noCdnOriginEgressGiB * assumptions.cdnOriginMissRate;
    const egressCost = Math.max(0, noCdnOriginEgressGiB - pricing.freeCloudStorageEgressGiBPerMonth)
      * pricing.conservativeInternetEgressPerGiB;
    const cdnEgressCost = Math.max(0, cdnOriginEgressGiB - pricing.freeCloudStorageEgressGiBPerMonth)
      * pricing.conservativeInternetEgressPerGiB;
    projections[count] = {
      regionCount: count,
      firestore: {
        staticDocuments: assumptions.firestoreDocumentsPerRegion * count,
        oneTimeReads: firestoreReads,
        oneTimeWrites: firestoreWrites,
        oneTimeOperationCostBeforeFreeTierUsd: (firestoreReads / 100000)
          * pricing.firestoreStandardReadsPer100k
          + (firestoreWrites / 100000) * pricing.firestoreStandardWritesPer100k,
        indexedStorageGiB: firestoreStorageGiB,
        indexedStorageMonthlyCostUsd: firestoreStorageGiB * pricing.firestoreStoragePerGiBHour * 730,
      },
      cloudStorage: {
        runtimeMapAndThumbnailGiB,
        completePackageGiB,
        monthlyAtRestCostUsd: completePackageGiB * pricing.cloudStorageStandardPerGiBMonth,
        oneTimeClassAUploads: assumptions.packageObjectsUploadedPerRegion * count,
        oneTimeClassAUploadCostUsd: assumptions.packageObjectsUploadedPerRegion * count / 1000
          * pricing.cloudStorageClassAPer1000,
        monthlyClassBDownloads: assumptions.mapAndThumbnailDownloadsPerRegionPerMonth * count,
        monthlyClassBDownloadCostUsd: assumptions.mapAndThumbnailDownloadsPerRegionPerMonth * count / 1000
          * pricing.cloudStorageClassBPer1000,
        noCdnOriginEgressGiB,
        noCdnConservativeEgressCostUsd: egressCost,
        ninetyPercentCdnHitOriginEgressGiB: cdnOriginEgressGiB,
        ninetyPercentCdnHitConservativeEgressCostUsd: cdnEgressCost,
      },
    };
  }
  return {
    pricing,
    assumptions,
    projections,
    caveat: "Pricing is a planning snapshot. Confirm deployed regions, bucket class, CDN contract, free-tier eligibility, backups, and log volume before rollout.",
  };
}

function planOrphanCleanup(artifacts, publishedPackageHashes, nowMs) {
  const retentionHours = {
    GENERATING: 24,
    ABANDONED_UPLOAD: 7 * 24,
    FAILED: 30 * 24,
    ROLLED_BACK: 30 * 24,
    SUPERSEDED_UNPUBLISHED: 30 * 24,
  };
  return artifacts.map(artifact => {
    const published = publishedPackageHashes.has(artifact.packageHash) || artifact.status === LIFECYCLE.PUBLISHED;
    const ageHours = Math.max(0, nowMs - artifact.updatedAtMs) / (60 * 60 * 1000);
    const requiredHours = retentionHours[artifact.status] ?? Number.POSITIVE_INFINITY;
    return {
      ...artifact,
      ageHours,
      requiredRetentionHours: requiredHours,
      action: published ? "RETAIN_IMMUTABLE" : ageHours >= requiredHours ? "DELETE_ELIGIBLE_AFTER_DRY_RUN" : "RETAIN_UNTIL_EXPIRY",
      automaticDeleteAllowed: !published && ageHours >= requiredHours,
      diagnosticReceiptRequired: true,
      publicationMarkerChecked: true,
    };
  });
}

function createBackupRecoveryPlan() {
  return {
    backups: {
      firestore: { managedDailyBackup: true, pointInTimeRecoveryDays: 7, restoreRehearsalQuarterly: true },
      storage: { objectVersioning: true, manifestInventoryDaily: true, hashAuditWeekly: true },
      configuration: { coreTemplateVersioned: true, assetManifestVersioned: true, rolloutGateExported: true },
    },
    recoveryOrder: [
      "engage expansion/publication/activation kill switches",
      "restore world and season identity plus permanent Core configuration",
      "restore publication markers, immutable package manifests, and edge contracts",
      "restore and hash-verify immutable package assets",
      "restore region lifecycle catalog and topology runtime state",
      "restore city ownership for the current reset generation",
      "reconcile ACTIVE markers without regenerating published packages",
      "validate player placement and normal gameplay before releasing kill switches",
    ],
    publishedAssetsRecoverableByHash: true,
    publishedPackageRegenerationAllowed: false,
    targetRpoHours: 1,
    targetRtoHours: 4,
  };
}

function createMonitoringPolicy() {
  return {
    generationFailureRate: { warning: ">2% for 15m or 3 consecutive", critical: ">5% for 15m" },
    retryRate: { warning: ">1 retry/map over 15m", critical: "5 consecutive exhausted jobs" },
    publicationFailure: { critical: "any non-idempotent failure" },
    activationFailure: { critical: "any failure" },
    packageHashMismatch: { critical: "any mismatch; engage activation kill switch" },
    duplicateCoordinate: { critical: "any non-idempotent collision" },
    edgeInheritanceFailure: { critical: "any failure" },
    storageUploadFailure: { warning: ">1% over 5m", critical: ">5% over 5m" },
    standbyBuffer: { warning: "below 2 for 5m", critical: "zero while placement capacity is low" },
    workerQueue: { warning: "oldest job >10m or depth >4", critical: "oldest job >30m" },
    controllerHeartbeat: { warning: "missing 2m", critical: "missing 5m" },
    spawnPlacementFailure: { warning: ">5% over 10m excluding expected threshold rejections", critical: ">15% over 10m" },
    sensitivePlayerDataInLogsAllowed: false,
  };
}

function createRolloutAndRollbackPlan() {
  const stages = [
    { stage: 0, action: "deploy code with generated-world feature flag OFF", rollback: "code rollback only; world unchanged" },
    { stage: 1, action: "verify 15 maps, 1,050 cities, 210 chains, zero generated ACTIVE", rollback: "stop; investigate baseline drift" },
    { stage: 2, action: "generate first package and retain STANDBY", rollback: "reject or retry unpublished package at same coordinate" },
    { stage: 3, action: "publish immutable package but keep inactive", rollback: "disable activation; retain published package and marker" },
    { stage: 4, action: "admin verify hashes, 40 city definitions, sockets, edges, catalog", rollback: "keep PUBLISHED/inactive; never regenerate" },
    { stage: 5, action: "enable scoped gate and atomically activate first region", rollback: "engage activation/expansion kill switches; preserve ownership" },
    { stage: 6, action: "monitor one complete health window", rollback: "stop expansion; existing ACTIVE gameplay continues" },
    { stage: 7, action: "prepare next clockwise region only after healthy review", rollback: "retain buffer; do not publish or activate" },
  ];
  return {
    stages,
    codeRollbackNeverDeletesWorldData: true,
    worldDataRollbackRequiresReviewedMigration: true,
    activeOwnershipMustBePreserved: true,
    publishedPackageDeleteOrRegenerationAllowed: false,
  };
}

function createPersistenceAudit() {
  return {
    preservedAcrossFutureSeasonReset: [
      "player flag and customization",
      "persistent Clan identity and membership",
      "Common Gear ownership",
      "equipped Common Gear",
      "Common Gear levels, upgrades, and progression",
    ],
    seasonalReset: [
      "cities and city ownership",
      "objectives and objective control",
      "marches and armies",
      "generated-region activation state",
      "normal consumable inventory",
    ],
    livePersistenceBehaviorModified: false,
  };
}

function createCdnPolicy() {
  return {
    immutableAssets: {
      pathIncludesPackageHash: true,
      cacheControl: "public, max-age=31536000, immutable",
      etag: "sha256 package-file hash",
      overwriteAllowed: false,
    },
    mutableCatalog: {
      contentAddressedAssetReferencesOnly: true,
      cacheControl: "private, no-cache",
      generationVersionRequired: true,
    },
    staleMutableReferenceRisk: false,
    publishedHashReplacementAllowed: false,
  };
}

class HierarchicalLazyCatalogAdapter {
  constructor({ productionCatalog, generatedCatalog, fetchRegion, cacheLimit = 4, pageSize = 64 }) {
    this.productionCatalog = productionCatalog;
    this.generatedCatalog = generatedCatalog;
    this.fetchRegionValue = fetchRegion;
    this.cacheLimit = cacheLimit;
    this.pageSize = pageSize;
    this.cache = new Map();
    this.timings = { startup: [], page: [], fetch: [] };
  }

  startup(playerRegionId = "") {
    const startedAt = performance.now();
    const byId = new Map(this.generatedCatalog.map(region => [region.id, region]));
    const current = byId.get(playerRegionId);
    const nearby = current ? this.generatedCatalog.filter(region => (
      Math.abs(region.gridX - current.gridX) + Math.abs(region.gridY - current.gridY) <= 1
    )).slice(0, 5) : [];
    const layerSummaries = Object.values(this.generatedCatalog.reduce((layers, region) => {
      const key = region.layer;
      layers[key] ||= { layer: region.layer, regionCount: 0, activeCount: 0 };
      layers[key].regionCount += 1;
      if (region.active) layers[key].activeCount += 1;
      return layers;
    }, {}));
    const value = {
      schemaVersion: "phase8-hierarchical-catalog-v1",
      handcraftedRegions: this.productionCatalog.regions.map(region => ({ id: region.id, lifecycle: region.lifecycle })),
      generatedSummary: {
        regionCount: this.generatedCatalog.length,
        highestLayer: Math.max(0, ...this.generatedCatalog.map(region => region.layer)),
        layerSummaries,
      },
      nearbyGeneratedRegions: nearby,
      definitionsIncluded: false,
      cityDefinitionsIncluded: false,
      mapBytesIncluded: false,
    };
    const bytes = Buffer.byteLength(stableJson(value));
    this.timings.startup.push(performance.now() - startedAt);
    return { value, bytes };
  }

  page(layer, cursor = 0) {
    const startedAt = performance.now();
    const matching = this.generatedCatalog.filter(region => region.layer === layer);
    const items = matching.slice(cursor, cursor + this.pageSize);
    const value = {
      layer,
      cursor,
      nextCursor: cursor + items.length < matching.length ? cursor + items.length : null,
      items,
      definitionsIncluded: false,
      cityDefinitionsIncluded: false,
      mapBytesIncluded: false,
    };
    this.timings.page.push(performance.now() - startedAt);
    return { value, bytes: Buffer.byteLength(stableJson(value)) };
  }

  fetch(regionId) {
    const startedAt = performance.now();
    if (this.cache.has(regionId)) {
      const value = this.cache.get(regionId);
      this.cache.delete(regionId);
      this.cache.set(regionId, value);
      this.timings.fetch.push(performance.now() - startedAt);
      return { value, cacheHit: true };
    }
    const value = this.fetchRegionValue(regionId);
    this.cache.set(regionId, value);
    while (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
    this.timings.fetch.push(performance.now() - startedAt);
    return { value, cacheHit: false };
  }

  snapshot() {
    return {
      cacheLimit: this.cacheLimit,
      cacheSize: this.cache.size,
      pageSize: this.pageSize,
      startup: summarizeTimings(this.timings.startup),
      page: summarizeTimings(this.timings.page),
      fetch: summarizeTimings(this.timings.fetch),
    };
  }
}

function createSyntheticCatalog(count) {
  const result = [];
  let layer = 1;
  while (result.length < count) {
    const ring = getClockwiseRingCoordinates(layer, CORE_RADIUS);
    for (let slot = 0; slot < ring.length && result.length < count; slot += 1) {
      const coordinate = ring[slot];
      result.push({
        id: `phase8-catalog-l${String(layer).padStart(3, "0")}-s${String(slot).padStart(4, "0")}`,
        gridX: coordinate.gridX,
        gridY: coordinate.gridY,
        layer,
        clockwiseSlot: slot,
        lifecycle: LIFECYCLE.ACTIVE,
        active: true,
        packageHash: hashValue({ layer, slot, coordinate }),
      });
    }
    layer += 1;
  }
  return result;
}

function createSeasonBootstrapModel() {
  const corePackage = createPermanentCorePackage();
  const coreRegions = createAllocatorCore(corePackage);
  const reservations = new Set(["-1,-1", "1,-1", "-1,1", "1,1"]);
  return {
    seasonId: "phase8-future-season-rehearsal",
    coreRegionCount: coreRegions.length,
    coreSpawnEligibleCount: coreRegions.filter(region => region.spawnEligible).length,
    holdingTowerReservationsPresent: [...reservations].every(key => coreRegions.some(region => `${region.gridX},${region.gridY}` === key)),
    seasonalObjectiveStateInitialized: coreRegions.map(region => ({ regionId: region.id, ownerUid: "", generation: "phase8-future-season" })),
    destructiveResetPerformed: false,
    productionTarget: false,
  };
}

function createOperationsPlan() {
  return {
    orphanCleanup: {
      dryRunRequired: true,
      publicationMarkerCheckRequired: true,
      publishedPackageAutomaticDeletionAllowed: false,
    },
    backupRecovery: createBackupRecoveryPlan(),
    monitoring: createMonitoringPolicy(),
    cdn: createCdnPolicy(),
    persistence: createPersistenceAudit(),
    rollout: createRolloutAndRollbackPlan(),
  };
}

function createPhase8Staging(records, metadata) {
  return new Phase8StagingHarness({ metadata, records });
}

module.exports = Object.freeze({
  PHASE,
  STAGING_ENVIRONMENT,
  CONTROL_SCHEMA_VERSION,
  REQUEST_SCHEMA_VERSION,
  STATE_MACHINE_SCHEMA_VERSION,
  FEATURE_FLAG_DEFAULT,
  RECOMMENDED_STANDBY_BUFFER,
  ROAD_CACHE_LIMIT,
  PLAYER_REGION_CITY_CAPACITY,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
  ACTIONS,
  ALLOWED_TRANSITIONS,
  ASSET_MANIFEST_HASH,
  codedError,
  expectFailure,
  createPhase8AdminActor,
  createAdminRequest,
  ExpansionControlPlane,
  LifecycleGuard,
  Phase8StagingHarness,
  BoundedRoadPresentationCache,
  evaluateRoadCacheStrategies,
  modelWorkerCapacity,
  evaluateStandbyBuffers,
  buildCostModel,
  planOrphanCleanup,
  createBackupRecoveryPlan,
  createMonitoringPolicy,
  createRolloutAndRollbackPlan,
  createPersistenceAudit,
  createCdnPolicy,
  HierarchicalLazyCatalogAdapter,
  createSyntheticCatalog,
  createSeasonBootstrapModel,
  createOperationsPlan,
  createPhase8Staging,
  createCurrentProductionWorldAdapter,
});
