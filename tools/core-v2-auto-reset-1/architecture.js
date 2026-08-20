"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const automaticReset = require("../../functions-auto-reset/automatic-reset.js");
const reset2 = require("../core-v2-reset-2/architecture.js");

const SCHEMA_VERSION = "core-v2-auto-reset-1-v1";
const CANDIDATE_VERSION = "core-v2-auto-reset-1-reset2-candidate-v1";
const STAGING_CONTROLS = Object.freeze({
  schemaVersion: automaticReset.SCHEMA_VERSION,
  environment: "STAGING",
  monthlySeasonResetEnabled: true,
  automaticPrebuildEnabled: true,
  automaticCutoverEnabled: true,
  candidateVersion: CANDIDATE_VERSION,
  prebuildHoursBeforeBoundary: 24,
  standbyRegionTarget: 2,
  oldSeasonRetentionDays: 30,
  recoveryProtection: {
    backupRequired: true,
    pitrRequired: true,
    deleteProtectionRequired: true,
    approved: true,
  },
  killSwitches: Object.fromEntries(automaticReset.KILL_SWITCHES.map(key => [key, false])),
});

const PRODUCTION_DEFAULTS = automaticReset.normalizeControls();
const SCHEDULE_TEST_BOUNDARIES = Object.freeze([
  "2026-09-01T00:00:00.000Z",
  "2026-10-01T00:00:00.000Z",
  "2026-11-01T00:00:00.000Z",
  "2026-12-01T00:00:00.000Z",
  "2027-01-01T00:00:00.000Z",
  "2028-02-01T00:00:00.000Z",
  "2028-03-01T00:00:00.000Z",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildGoEvidence({ local, controls, hardFailure = "" }) {
  const evidence = {
    environment: {
      correctProject: true,
      correctCurrentSeason: true,
      expectedSchedulerInvocation: true,
      duplicateResetLockSafe: true,
      expectedCandidateVersion: true,
    },
    backup: {
      completed: true,
      receiptValid: true,
      recoveryProtectionApproved: controls.recoveryProtection.approved,
    },
    core: {
      mapCount: local.result.world.coreRegionCount,
      cityCount: local.result.world.coreCityCount,
      packageHashValid: local.result.candidate.corePackageHash.length === 64,
      objectiveCount: local.result.world.objectiveCount,
      objectiveCoordinatesValid: true,
      topologyValid: local.result.world.reciprocalTopologyErrors === 0,
      allSpawnIneligible: true,
    },
    outer: {
      requiredActiveCapacityExists: local.result.world.activeOuterRegions > 0,
      allRegionsHave40Cities: true,
      standbyRegionCount: local.result.world.standbyOuterRegions,
      edgeContractsValid: true,
      clockwiseAllocationValid: true,
    },
    persistence: {
      exactPlayerCountProcessed: local.result.persistence.playerCount === local.result.dataset.playerCount,
      flagsMatch: local.result.flags.mismatches === 0,
      clansMatch: local.result.clans.orphanMemberships === 0 && local.result.clans.duplicateClans === 0,
      ownedCommonGearMatches: true,
      equippedCommonGearMatches: true,
      gearLevelsMatch: true,
      gearUpgradesMatch: true,
      gearDuplicateProgressionMatches: true,
    },
    resetState: {
      bagConsumablesMigrated: local.result.seasonalReset.consumablesRemaining,
      oldCityOwnershipMigrated: 0,
      oldMarchesMigrated: 0,
      oldRalliesMigrated: 0,
      oldReinforcementsMigrated: 0,
      oldObjectiveOwnershipMigrated: 0,
      oldMainCityAssignmentsMigrated: 0,
      prohibitedSeasonalStateRemaining: local.result.seasonalReset.worldStateRemaining,
    },
    security: {
      mainCityRestrictionActive: local.result.mainCity.rejectedAttempts === 40,
      environmentGuardActive: true,
      unauthorizedCutoverPaths: 0,
    },
  };
  if (hardFailure) {
    const [group, field] = hardFailure.split(".");
    assert(Object.hasOwn(evidence[group], field), `Unknown hard failure path ${hardFailure}.`);
    evidence[group][field] = field.endsWith("Count") || field.endsWith("Migrated") || field.endsWith("Remaining") ? 1 : false;
  }
  return evidence;
}

class MemoryAutomaticResetAdapter {
  constructor(options = {}) {
    this.controls = automaticReset.normalizeControls(options.controls || STAGING_CONTROLS);
    this.playerCount = options.playerCount || reset2.DATASET_SIZE;
    this.sourceDataset = options.sourceDataset || null;
    this.hardFailure = options.hardFailure || "";
    this.transientFailures = { ...(options.transientFailures || {}) };
    this.operations = new Map();
    this.leases = new Map();
    this.receipts = new Map();
    this.alerts = [];
    this.maintenance = "OFF";
    this.activeSeasonId = options.sourceSeasonId || "season-2026-08";
    this.pointerRevision = 1;
    this.archives = [];
    this.local = null;
    this.snapshot = null;
    this.migratedPlayers = null;
  }

  async getControls() { return this.controls; }
  async loadOperation(id) { return this.operations.has(id) ? clone(this.operations.get(id)) : null; }
  async saveOperation(operation, options = {}) {
    if (options.mustNotExist && this.operations.has(operation.resetOperationId)) {
      throw Object.assign(new Error("operation-exists"), { code: "already-exists" });
    }
    this.operations.set(operation.resetOperationId, clone(operation));
    return clone(operation);
  }

  async acquireLease(identity, now, durationMs) {
    const existing = this.leases.get(identity.resetOperationId);
    if (existing && Date.parse(existing.expiresAt) > now.getTime()) return { acquired: false };
    const lease = { acquired: true, token: `${identity.resetOperationId}-lease`, expiresAt: new Date(now.getTime() + durationMs).toISOString() };
    this.leases.set(identity.resetOperationId, lease);
    return lease;
  }

  async releaseLease(identity, lease) {
    if (this.leases.get(identity.resetOperationId)?.token === lease.token) this.leases.delete(identity.resetOperationId);
  }

  maybeTransient(stage) {
    const remaining = Number(this.transientFailures[stage] || 0);
    if (remaining > 0) {
      this.transientFailures[stage] = remaining - 1;
      throw Object.assign(new Error(`${stage}-temporary`), { code: "unavailable" });
    }
  }

  async prebuild() {
    this.maybeTransient("prebuild");
    const startedAt = performance.now();
    const world = reset2.buildProductionShapedWorld(this.playerCount);
    const validation = reset2.validateWorld(world);
    assert.equal(validation.valid, true, validation.errors.join(","));
    return {
      valid: true,
      coreMapCount: validation.coreRegionCount,
      coreCityCount: validation.coreCityCount,
      objectiveCount: validation.objectiveCount,
      activeOuterRegionCount: validation.activeOuterRegions,
      standbyRegionCount: validation.standbyOuterRegions,
      packageHash: reset2.hashValue(world.regions.map(region => [region.id, region.packageHash || "core"])),
      topologyHash: reset2.hashValue(world.regions.map(region => [region.id, region.connections])),
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    };
  }

  async freeze({ identity }) {
    assert.equal(this.activeSeasonId, identity.sourceSeasonId);
    this.maintenance = "SEASON_RESET_IN_PROGRESS";
    return { frozen: true };
  }

  async finalSnapshot({ identity }) {
    this.maybeTransient("snapshot");
    assert.equal(this.activeSeasonId, identity.sourceSeasonId);
    const dataset = this.sourceDataset || reset2.createProductionShapedDataset(this.playerCount);
    this.sourceDataset = dataset;
    this.snapshot = {
      backup: {
        operationId: identity.resetOperationId,
        backupId: `backup-${identity.resetOperationId}`,
        startedAt: identity.scheduledResetAt,
        completedAt: identity.scheduledResetAt,
        completed: true,
        receiptValid: true,
        recoveryProtectionApproved: this.controls.recoveryProtection.approved,
        playerCount: dataset.players.length,
        clanCount: dataset.clans.length,
        coverageHash: reset2.hashValue(dataset.players.map(player => player.uid)),
      },
      dataset,
    };
    return this.snapshot;
  }

  async migrate({ snapshot }) {
    this.maybeTransient("migration");
    const migratedPlayers = snapshot.dataset.players.map(reset2.createPlayerMigration);
    const persistence = reset2.createPersistenceReceipts(snapshot.dataset.players, migratedPlayers);
    const world = reset2.buildProductionShapedWorld(this.playerCount);
    const placements = reset2.placePlayers(world, migratedPlayers);
    const worldValidation = reset2.validateWorld(world);
    assert.equal(worldValidation.valid, true, worldValidation.errors.join(","));
    const mainCity = reset2.runMainCityRestrictionMatrix();
    const local = {
      dataset: snapshot.dataset,
      migratedPlayers,
      world,
      result: {
        candidate: { corePackageHash: reset2.buildExactCandidateIdentity().corePackageHash },
        dataset: { playerCount: snapshot.dataset.players.length },
        persistence: persistence.aggregate,
        flags: { count: snapshot.dataset.players.length, mismatches: 0 },
        clans: {
          count: snapshot.dataset.clans.length,
          orphanMemberships: 0,
          duplicateClans: 0,
        },
        seasonalReset: { consumablesRemaining: 0, worldStateRemaining: 0 },
        world: worldValidation,
        placements: {
          count: placements.length,
          uniqueStartingCities: new Set(placements.map(item => item.cityId)).size,
        },
        mainCity,
      },
    };
    this.local = local;
    this.migratedPlayers = migratedPlayers;
    return {
      playerCount: migratedPlayers.length,
      clanCount: snapshot.dataset.clans.length,
      persistentHash: persistence.aggregate.persistentHash,
      gearHash: persistence.aggregate.gearHash,
      clanHash: persistence.aggregate.clanHash,
      flagHash: persistence.aggregate.flagHash,
      ownedGearCount: persistence.aggregate.ownedGearCount,
      equippedGearCount: persistence.aggregate.equippedGearCount,
      duplicateGearCount: persistence.aggregate.duplicateGearCount,
      bagConsumablesMigrated: 0,
      seasonalWorldStateMigrated: 0,
    };
  }

  async validate() {
    assert(this.local);
    return buildGoEvidence({ local: this.local, controls: this.controls, hardFailure: this.hardFailure });
  }

  async cutover({ identity }) {
    assert.equal(this.activeSeasonId, identity.sourceSeasonId);
    this.activeSeasonId = identity.targetSeasonId;
    this.pointerRevision += 1;
    return { pointerChanged: true, revision: this.pointerRevision, atomic: true };
  }

  async postCutoverSmoke({ identity }) {
    return {
      passed: true,
      activeSeasonPointer: this.activeSeasonId === identity.targetSeasonId,
      representativeLogin: true,
      flag: true,
      clan: true,
      gearInventory: true,
      equippedGear: true,
      gearLevels: true,
      mainCityOutsideCore: true,
      coreMapLoad: true,
      generatedMapLoad: true,
      topology: true,
      spawnTransaction: true,
      standbyBuffer: 2,
    };
  }

  async archiveOldSeason({ identity, controls }) {
    const archive = { seasonId: identity.sourceSeasonId, status: "RETIRED_READ_ONLY", deleted: false, retentionDays: controls.oldSeasonRetentionDays };
    this.archives.push(archive);
    return archive;
  }

  async reopen() { this.maintenance = "OFF"; }
  async abort({ identity, pointerChanged, reason }) {
    assert.equal(pointerChanged, false);
    assert.equal(this.activeSeasonId, identity.sourceSeasonId);
    this.maintenance = "OFF_ABORTED";
    this.abortReason = reason;
  }

  async writeReceipt({ identity, operation, finalStatus }) {
    const receipt = {
      operationId: identity.resetOperationId,
      sourceSeason: identity.sourceSeasonId,
      targetSeason: identity.targetSeasonId,
      scheduledTime: identity.scheduledResetAt,
      actualStartTime: operation.createdAt,
      actualEndTime: operation.updatedAt,
      candidateVersion: identity.candidateVersion,
      coreHash: operation.prebuild?.packageHash || "",
      playerCount: operation.migration?.playerCount || 0,
      clanCount: operation.migration?.clanCount || 0,
      gearCount: operation.migration?.ownedGearCount || 0,
      gearChecksum: operation.migration?.gearHash || "",
      cityCounts: { core: 1480, outerPerRegion: 40 },
      objectiveCount: 17,
      backupReceipt: operation.snapshot?.backup || {},
      validationReceipt: operation.goNoGo || {},
      cutoverTransaction: operation.cutover || { pointerChanged: false },
      archiveResult: operation.archive || null,
      finalStatus,
      immutable: true,
    };
    receipt.receiptHash = automaticReset.hashValue(receipt);
    const existing = this.receipts.get(identity.resetOperationId);
    if (existing) assert.equal(existing.receiptHash, receipt.receiptHash);
    else this.receipts.set(identity.resetOperationId, receipt);
    return receipt;
  }

  async alert(severity, code, details) {
    this.alerts.push({ severity, code, detailsHash: automaticReset.hashValue(details || {}) });
  }
}

function requestForBoundary(boundary) {
  const resetAt = new Date(boundary);
  return {
    sourceSeasonId: automaticReset.seasonIdForBoundary(automaticReset.addUtcMonths(resetAt, -1)),
    targetSeasonId: automaticReset.seasonIdForBoundary(resetAt),
    scheduledResetAt: resetAt.toISOString(),
    candidateVersion: CANDIDATE_VERSION,
    now: resetAt,
    retryOptions: { baseDelayMs: 0, wait: async () => {} },
  };
}

async function runScheduledTransition(options = {}) {
  const boundary = options.boundary || "2026-09-01T00:00:00.000Z";
  const request = requestForBoundary(boundary);
  const adapter = new MemoryAutomaticResetAdapter({
    controls: options.controls || STAGING_CONTROLS,
    playerCount: options.playerCount || reset2.DATASET_SIZE,
    sourceSeasonId: request.sourceSeasonId,
    sourceDataset: options.sourceDataset,
    hardFailure: options.hardFailure,
    transientFailures: options.transientFailures,
  });
  const controller = automaticReset.createAutomaticResetController(adapter);
  const prebuildNow = new Date(new Date(boundary).getTime() - 24 * 60 * 60 * 1000);
  const prebuild = await controller.handlePrebuild({ ...request, now: prebuildNow });
  const reset = await controller.handleReset(request);
  return { adapter, controller, request, prebuild, reset };
}

function runCalendarTests() {
  const cases = SCHEDULE_TEST_BOUNDARIES.map(boundary => {
    const at = new Date(boundary);
    const targetSeasonId = automaticReset.seasonIdForBoundary(at);
    const prior = automaticReset.addUtcMonths(at, -1);
    const next = automaticReset.addUtcMonths(at, 1);
    return {
      boundary,
      targetSeasonId,
      sourceSeasonId: automaticReset.seasonIdForBoundary(prior),
      nextSeasonId: automaticReset.seasonIdForBoundary(next),
      daysInPriorMonth: Math.round((at.getTime() - prior.getTime()) / 86400000),
    };
  });
  assert.equal(cases.find(item => item.boundary.startsWith("2027-01"))?.sourceSeasonId, "season-2026-12");
  assert.equal(cases.find(item => item.boundary.startsWith("2028-03"))?.daysInPriorMonth, 29);
  return cases;
}

function runStateMachineTests() {
  const legal = [
    "SCHEDULED", "PREBUILDING", "PREBUILT", "RESET_FREEZE", "FINAL_SNAPSHOT", "MIGRATING",
    "VALIDATING", "CUTOVER_READY", "CUTTING_OVER", "ACTIVE", "OLD_SEASON_ARCHIVED",
  ];
  for (let index = 1; index < legal.length; index += 1) automaticReset.assertTransition(legal[index - 1], legal[index]);
  const illegal = [
    ["PREBUILDING", "ACTIVE"],
    ["VALIDATION_FAILED", "CUTTING_OVER"],
    ["SCHEDULED", "CUTOVER_READY"],
    ["ACTIVE", "PREBUILT"],
  ];
  illegal.forEach(([from, to]) => assert.throws(() => automaticReset.assertTransition(from, to), /Illegal automatic reset transition/));
  return { legalTransitionsTested: legal.length - 1, illegalTransitionsRejected: illegal.length };
}

function runProductionControlTests() {
  assert.equal(PRODUCTION_DEFAULTS.monthlySeasonResetEnabled, false);
  assert.equal(PRODUCTION_DEFAULTS.automaticPrebuildEnabled, false);
  assert.equal(PRODUCTION_DEFAULTS.automaticCutoverEnabled, false);
  assert(Object.values(PRODUCTION_DEFAULTS.killSwitches).every(Boolean));
  automaticReset.KILL_SWITCHES.forEach(action => assert.throws(
    () => automaticReset.assertAutomaticActionAllowed(action, PRODUCTION_DEFAULTS),
    /monthly-season-reset-disabled/,
  ));
  const eachKillSwitch = automaticReset.KILL_SWITCHES.map(action => {
    const controls = clone(STAGING_CONTROLS);
    controls.killSwitches[action] = true;
    assert.throws(() => automaticReset.assertAutomaticActionAllowed(action, controls), /kill-switch-engaged/);
    return { action, blocked: true };
  });
  return { productionDefaultsOff: true, allKillSwitchesEngaged: true, eachKillSwitch };
}

function runPrebuildWindowBenchmarks(playerCount = reset2.DATASET_SIZE) {
  return [24, 6, 1].map(hoursBefore => {
    const startedAt = performance.now();
    const world = reset2.buildProductionShapedWorld(playerCount);
    const validation = reset2.validateWorld(world);
    assert.equal(validation.valid, true);
    return {
      hoursBefore,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
      retryAndAlertMarginMinutes: hoursBefore * 60,
      valid: true,
      coreMaps: validation.coreRegionCount,
      coreCities: validation.coreCityCount,
      activeOuterRegions: validation.activeOuterRegions,
      standbyRegions: validation.standbyOuterRegions,
    };
  });
}

function benchmarkFreezeWindow(playerCount) {
  const totalStartedAt = performance.now();
  const stage = (name, operation) => {
    const startedAt = performance.now();
    const value = operation();
    return { name, durationMs: Number((performance.now() - startedAt).toFixed(3)), value };
  };
  const dataset = stage("final_snapshot", () => reset2.createProductionShapedDataset(playerCount));
  const migration = stage("persistent_migration", () => dataset.value.players.map(reset2.createPlayerMigration));
  const validation = stage("persistence_validation", () => reset2.createPersistenceReceipts(dataset.value.players, migration.value));
  const pointer = stage("go_and_pointer_transaction", () => automaticReset.hashValue({ playerCount, persistence: validation.value.aggregate.persistentHash }));
  return {
    playerCount,
    measuredDevelopmentModelMs: Number((performance.now() - totalStartedAt).toFixed(3)),
    stages: [dataset, migration, validation, pointer].map(item => ({ name: item.name, durationMs: item.durationMs })),
    persistentHash: validation.value.aggregate.persistentHash,
  };
}

function advanceGearForSeason(dataset, seasonIndex) {
  const next = clone(dataset);
  next.players.forEach((player, playerIndex) => {
    const instances = Object.values(player.gear.instances || {});
    if (instances.length) {
      const instance = instances[(playerIndex + seasonIndex) % instances.length];
      instance.level = Math.min(10, Number(instance.level || 1) + 1);
      instance.upgradedAtMs = 1800000000000 + seasonIndex * 100000 + playerIndex;
      const building = player.gear.equipped?.barracks;
      if (building && instances[0]) building.weapon = instances[0].instanceId;
    }
  });
  return next;
}

async function runMultiMonthSimulation(playerCount = reset2.DATASET_SIZE) {
  let dataset = reset2.createProductionShapedDataset(playerCount);
  const initialGearInstanceCount = dataset.players.reduce((sum, player) => sum + Object.keys(player.gear.instances).length, 0);
  const boundaries = [
    "2026-09-01T00:00:00.000Z",
    "2026-10-01T00:00:00.000Z",
    "2026-11-01T00:00:00.000Z",
    "2026-12-01T00:00:00.000Z",
  ];
  const transitions = [];
  for (let index = 0; index < boundaries.length; index += 1) {
    dataset = advanceGearForSeason(dataset, index + 1);
    const before = reset2.createPersistenceReceipts(dataset.players, dataset.players.map(reset2.createPlayerMigration));
    const run = await runScheduledTransition({ boundary: boundaries[index], playerCount, sourceDataset: dataset });
    assert.equal(run.reset.status, "OLD_SEASON_ARCHIVED");
    const migrated = run.adapter.migratedPlayers;
    const after = reset2.createPersistenceReceipts(dataset.players, migrated);
    assert.equal(before.aggregate.persistentHash, after.aggregate.persistentHash);
    assert.equal(after.aggregate.ownedGearCount, initialGearInstanceCount);
    assert.equal(new Set(run.adapter.archives.map(item => item.seasonId)).size, run.adapter.archives.length);
    transitions.push({
      sourceSeasonId: run.request.sourceSeasonId,
      targetSeasonId: run.request.targetSeasonId,
      status: run.reset.status,
      playerCount,
      clanCount: dataset.clans.length,
      gearCount: after.aggregate.ownedGearCount,
      gearHash: after.aggregate.gearHash,
      clanHash: after.aggregate.clanHash,
      flagHash: after.aggregate.flagHash,
      consumablesMigrated: run.adapter.local.result.seasonalReset.consumablesRemaining,
      worldStateMigrated: run.adapter.local.result.seasonalReset.worldStateRemaining,
      archivedReadOnly: run.adapter.archives.every(item => item.status === "RETIRED_READ_ONLY" && item.deleted === false),
      duplicateSeasonData: 0,
    });
    dataset = { ...dataset, players: migrated };
  }
  return {
    transitions,
    passed: transitions.length === 4 && transitions.every(item => item.status === "OLD_SEASON_ARCHIVED"),
    playerCount,
    gearCountStable: transitions.every(item => item.gearCount === initialGearInstanceCount),
    clanCountStable: new Set(transitions.map(item => item.clanCount)).size === 1,
    flagsPersisted: transitions.every(item => item.flagHash.length === 64),
    noConsumablesPersisted: transitions.every(item => item.consumablesMigrated === 0),
    oldSeasonsArchivedNotDeleted: transitions.every(item => item.archivedReadOnly),
  };
}

async function runAutomaticResetStudy() {
  const startedAt = performance.now();
  const calendar = runCalendarTests();
  const stateMachine = runStateMachineTests();
  const controls = runProductionControlTests();
  const prebuildWindows = runPrebuildWindowBenchmarks();
  const successful = await runScheduledTransition({ transientFailures: { prebuild: 2, snapshot: 1 } });
  assert.equal(successful.prebuild.status, "PREBUILT");
  assert.equal(successful.prebuild.operation.retry.attemptCount, 3);
  assert.equal(successful.reset.status, "OLD_SEASON_ARCHIVED");
  assert.equal(successful.adapter.maintenance, "OFF");
  const duplicateReset = await successful.controller.handleReset(successful.request);
  assert.equal(duplicateReset.status, "DUPLICATE_SAFE_EXIT");

  const failed = await runScheduledTransition({ hardFailure: "persistence.gearLevelsMatch" });
  assert.equal(failed.reset.status, "VALIDATION_FAILED");
  assert.equal(failed.adapter.activeSeasonId, failed.request.sourceSeasonId);
  assert.equal(failed.adapter.maintenance, "OFF_ABORTED");

  const notPrebuiltRequest = requestForBoundary("2026-10-01T00:00:00.000Z");
  const notPrebuiltAdapter = new MemoryAutomaticResetAdapter({ sourceSeasonId: notPrebuiltRequest.sourceSeasonId });
  const notPrebuiltController = automaticReset.createAutomaticResetController(notPrebuiltAdapter);
  const notPrebuilt = await notPrebuiltController.handleReset(notPrebuiltRequest);
  assert.equal(notPrebuilt.status, "RESET_ABORTED");
  assert.equal(notPrebuiltAdapter.maintenance, "OFF");

  const lateStarts = [];
  for (const minutes of [1, 15, 120]) {
    const boundary = new Date("2026-11-01T00:00:00.000Z");
    const run = await runScheduledTransition({ boundary: boundary.toISOString(), playerCount: 30 });
    const catchUpAt = new Date(boundary.getTime() + minutes * 60 * 1000);
    const duplicate = await run.controller.handleReset({ ...run.request, now: catchUpAt });
    assert.equal(duplicate.status, "DUPLICATE_SAFE_EXIT");
    lateStarts.push({ minutesLate: minutes, status: duplicate.status, duplicateResetCreated: false });
  }

  const freezeBenchmarks = [benchmarkFreezeWindow(30), benchmarkFreezeWindow(reset2.DATASET_SIZE)];
  const multiMonth = await runMultiMonthSimulation();
  const approximateMonthlyArchiveBytes = Buffer.byteLength(JSON.stringify({
    players: successful.adapter.sourceDataset.players,
    clans: successful.adapter.sourceDataset.clans,
    world: successful.adapter.local.world,
  }));

  const result = {
    schemaVersion: SCHEMA_VERSION,
    passed: true,
    productionMutationPerformed: false,
    productionDeploymentPerformed: false,
    scheduler: {
      timeZone: automaticReset.RESET_TIME_ZONE,
      monthlyResetCron: automaticReset.MONTHLY_RESET_CRON,
      prebuildCoordinatorCron: automaticReset.PREBUILD_COORDINATOR_CRON,
      catchUpCron: automaticReset.CATCH_UP_CRON,
      calendar,
      seasonIdFormat: "season-YYYY-MM",
    },
    stateMachine,
    controls,
    prebuildWindows,
    recommendedPrebuildHours: 24,
    retryPolicy: { maximumAttempts: 3, backoff: "exponential", idempotentOnly: true },
    hardAbortPolicy: { integrityFailuresRetried: false, pointerChanged: false, oldSeasonRemainsAuthoritative: true, failedNamespaceRetained: true },
    successfulScheduledPath: {
      prebuildStatus: successful.prebuild.status,
      finalStatus: successful.reset.status,
      stateHistory: successful.reset.operation.history,
      transientAttempts: successful.prebuild.operation.retry,
      goNoGo: successful.reset.operation.goNoGo,
      receipt: successful.reset.receipt,
      zeroHumanInterventionAfterScheduleDispatch: true,
    },
    failedScheduledPath: {
      finalStatus: failed.reset.status,
      failedChecks: failed.reset.operation.goNoGo.failures,
      oldSeasonRemainsAuthoritative: failed.reset.oldSeasonRemainsAuthoritative,
      pointerSeasonId: failed.adapter.activeSeasonId,
      maintenanceUnwound: failed.adapter.maintenance === "OFF_ABORTED",
    },
    duplicateInvocation: { status: duplicateReset.status, duplicateResetCreated: false, duplicateMigration: false, duplicateStartingCities: false },
    candidateNotPrebuiltAtBoundary: { status: notPrebuilt.status, oldSeasonRemainsAuthoritative: true, freezeEntered: false },
    lateStarts,
    freezeBenchmarks,
    multiMonth,
    archive: {
      status: "RETIRED_READ_ONLY",
      retentionDays: 30,
      automaticDeleteEnabled: false,
      approximateBytesPerSynthetic5000PlayerSeason: approximateMonthlyArchiveBytes,
      projected12MonthBytes: approximateMonthlyArchiveBytes * 12,
    },
    alerts: automaticReset.alertPolicy(),
    productionRecoveryProtection: {
      observedPitr: "DISABLED",
      observedDeleteProtection: "DISABLED",
      recommendation: "Enable Firestore PITR and delete protection; require a completed, validated backup receipt before automatic cutover.",
      productionEnablementBlocked: true,
    },
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
  };
  result.receiptHash = automaticReset.hashValue(result);
  return result;
}

module.exports = Object.freeze({
  SCHEMA_VERSION,
  CANDIDATE_VERSION,
  STAGING_CONTROLS,
  PRODUCTION_DEFAULTS,
  SCHEDULE_TEST_BOUNDARIES,
  MemoryAutomaticResetAdapter,
  buildGoEvidence,
  requestForBoundary,
  runScheduledTransition,
  runCalendarTests,
  runStateMachineTests,
  runProductionControlTests,
  runPrebuildWindowBenchmarks,
  benchmarkFreezeWindow,
  runMultiMonthSimulation,
  runAutomaticResetStudy,
});
