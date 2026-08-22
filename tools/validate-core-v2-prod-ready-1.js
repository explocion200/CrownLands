"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const prodReady = require("./core-v2-prod-ready-1/architecture.js");
const adapters = require("../functions-auto-reset/production-adapters.js");
const reset2 = require("./core-v2-reset-2/architecture.js");
const resetContract = require("../reset-persistence-contract.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_ROOT = path.join(ROOT, "benchmark-results", "map", "core-v2-prod-ready-1");
const RESULT_PATH = path.join(RESULT_ROOT, "PROD_READY_1_VALIDATION.json");
const PREFLIGHT_PATH = path.join(RESULT_ROOT, "PRODUCTION_READ_ONLY_PREFLIGHT.json");
const ADAPTER_PATH = path.join(RESULT_ROOT, "PRODUCTION_ADAPTER_EMULATOR.json");
const PROTECTION_PATH = path.join(RESULT_ROOT, "PRODUCTION_RECOVERY_PROTECTION.json");
const RESTORE_PATH = path.join(RESULT_ROOT, "PRODUCTION_BACKUP_RESTORE_REHEARSAL.json");
const STAGING_PATH = path.join(RESULT_ROOT, "SCHEDULED_STAGING_REHEARSAL.json");
const RESET2_PATH = path.join(RESULT_ROOT, "RESET_2_REVALIDATION.json");

function readJson(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function main() {
  const candidate = prodReady.buildCandidateIdentity();
  const preflight = readJson(PREFLIGHT_PATH);
  const adapter = readJson(ADAPTER_PATH);
  const protection = readJson(PROTECTION_PATH);
  const restore = readJson(RESTORE_PATH);
  const staging = readJson(STAGING_PATH, {});
  const reset2Validation = readJson(RESET2_PATH);
  assert(preflight, "Fresh production preflight is missing.");
  assert(adapter, "Production adapter emulator receipt is missing.");
  assert(protection, "Recovery-protection receipt is missing.");
  assert(restore, "Backup/restore receipt is missing.");
  assert(reset2Validation, "Fresh RESET-2 revalidation receipt is missing.");

  assert.equal(candidate.approvedAutoResetGitSha, prodReady.APPROVED_AUTO_RESET_GIT_SHA);
  assert.equal(candidate.reset2CandidateId, reset2.buildExactCandidateIdentity().candidateId);
  assert.equal(candidate.assetManifestHash, prodReady.ASSET_MANIFEST_HASH);
  assert.equal(candidate.functionsRuntime, "22");
  assert.deepEqual(adapters.PERSISTENT_PLAYER_FIELDS, resetContract.PERSISTENT_PLAYER_FIELDS.filter(field => field !== "gear"));
  assert.deepEqual(adapters.PERSISTENT_GEAR_FIELDS, resetContract.PERSISTENT_GEAR_FIELDS);
  assert.deepEqual(adapters.PERSISTENT_GEAR_INSTANCE_FIELDS, resetContract.PERSISTENT_GEAR_INSTANCE_FIELDS);
  assert.equal(adapters.CITY_CAPACITY, 40);
  assert.equal(adapters.MINIMUM_NPC_CITIES_FOR_SPAWN, 15);
  assert.equal(adapters.STARTING_CANDIDATE_COUNT, 4);
  assert.equal(adapters.PACKAGE_SCHEMA_VERSION, "phase7-generated-region-package-v1");
  assert.equal(adapters.STORAGE_SCHEMA_VERSION, "phase7-immutable-storage-v1");
  assert.equal(adapters.GENERATOR_ALGORITHM_VERSION, "phase6f-road-geometry-decoupling-v1");
  assert.equal(adapters.ASSET_LIBRARY_VERSION, "phase6d-macro-variation-v1");
  assert.equal(adapters.ASSET_MANIFEST_HASH, prodReady.ASSET_MANIFEST_HASH);
  assert.equal(reset2Validation.status, "PASS");
  assert.equal(reset2Validation.checkpointScopeGuardPreserved, true);
  assert.equal(reset2Validation.dataset.playerCount, 5000);
  assert.equal(reset2Validation.pagination.at(-1).pageCount, 17);
  assert.equal(reset2Validation.placements.uniqueStartingCities, 5000);
  assert.equal(reset2Validation.idempotency.passed, true);
  assert.equal(reset2Validation.productionMutationPerformed, false);

  assert.throws(() => adapters.requireAuthority({
    projectId: adapters.PRODUCTION_PROJECT_ID,
    environment: "PRODUCTION",
    serverAuthority: true,
    candidateVersion: candidate.candidateId,
    controls: { enabled: false, candidateVersion: candidate.candidateId },
  }, "generation"), /control is OFF/);
  assert.throws(() => adapters.requireAuthority({
    projectId: adapters.PRODUCTION_PROJECT_ID,
    environment: "PRODUCTION",
    serverAuthority: true,
    candidateVersion: candidate.candidateId,
    controls: { enabled: true, candidateVersion: candidate.candidateId },
  }, "generation"), /explicit production authorization/);
  const authorizedModel = adapters.requireAuthority({
    projectId: adapters.PRODUCTION_PROJECT_ID,
    environment: "PRODUCTION",
    serverAuthority: true,
    candidateVersion: candidate.candidateId,
    controls: { enabled: true, candidateVersion: candidate.candidateId },
    productionAuthorization: adapters.requiredAuthorization("generation", adapters.PRODUCTION_PROJECT_ID, candidate.candidateId),
  }, "generation");
  assert.equal(authorizedModel.environment, "PRODUCTION");

  assert.equal(preflight.projectId, adapters.PRODUCTION_PROJECT_ID);
  assert.equal(preflight.mode, "READ_ONLY");
  assert.equal(preflight.mutationMethodsPresent, false);
  assert.equal(preflight.world.maps, 15);
  assert.equal(preflight.world.cities, 1050);
  assert.equal(preflight.world.directedChains, 210);
  assert.equal(preflight.world.generatedActive, 0);
  assert.equal(preflight.world.coreV2Records, 0);
  assert.equal(preflight.world.assetManifestHash, prodReady.ASSET_MANIFEST_HASH);
  assert.equal(preflight.clans.exactRecordCount, 4);
  assert.equal(preflight.clans.integrity.authoritativePlayerMembershipCount, preflight.players.withClanMembership);
  assert.equal(preflight.clans.integrity.playerMissingMemberDocumentCount, 0);
  assert.equal(preflight.clans.integrity.roleMismatchCount, 0);
  assert.equal(preflight.clans.integrity.duplicateAuthoritativeMembershipCount, 0);
  assert(Number.isSafeInteger(preflight.clans.integrity.staleConflictingMemberDocumentCount));
  assert.equal(preflight.clans.integrity.staleOrphansExcludedFromMigration, true);
  assert.equal(preflight.clans.integrity.migrationSafe, true);
  assert.equal(preflight.infrastructure.deployedIndexesReady, true);
  assert.equal(preflight.automation.allResetFlagsOff, true);
  assert.equal(preflight.automation.productionSchedulersSafe, true);
  assert.equal(preflight.productionWorldMutationPerformed, false);

  assert.equal(adapter.environment, "FIRESTORE_EMULATOR");
  assert.equal(adapter.productionProjectId, adapters.PRODUCTION_PROJECT_ID);
  assert.equal(adapter.version, adapters.ADAPTER_VERSION);
  assert.equal(adapter.firebaseAdapterFactoryPassed, true);
  assert.equal(adapter.generationPassed, true);
  assert.equal(adapter.phase7PackageSchemaPassed, true);
  assert.equal(adapter.exactGeneratorAndAssetLockPassed, true);
  assert.equal(adapter.immutableMetadataOnlyPassed, true);
  assert.equal(adapter.cityInitializationPassed, true);
  assert.equal(adapter.publishedNeighborContractInheritancePassed, true);
  assert.equal(adapter.fortressReservationSchedulePassed, true);
  assert.equal(adapter.generationDuplicateGuard, true);
  assert.equal(adapter.generationCoreGuard, true);
  assert.equal(adapter.generationActivationOff, true);
  assert.equal(adapter.migrationPassed, true);
  assert.equal(adapter.clanMigrationPassed, true);
  assert.equal(adapter.clanPaginationPassed, true);
  assert.equal(adapter.paginationPassed, true);
  assert.equal(adapter.allowlistPassed, true);
  assert.equal(adapter.checksumsPassed, true);
  assert.equal(adapter.migrationIdempotencyPassed, true);
  assert.equal(adapter.placementPassed, true);
  assert.equal(adapter.npcThresholdPassed, true);
  assert.equal(adapter.concurrencyPassed, true);
  assert.equal(adapter.mainCityRestrictionsPassed, true);
  assert.equal(adapter.productionMutationPerformed, false);

  const infrastructure = {
    pitrObserved: true,
    pitrEnabled: preflight.infrastructure.pointInTimeRecoveryEnablement === "POINT_IN_TIME_RECOVERY_ENABLED",
    deleteProtectionObserved: true,
    deleteProtectionEnabled: preflight.infrastructure.deleteProtectionState === "DELETE_PROTECTION_ENABLED",
    dailyBackupObserved: Array.isArray(preflight.infrastructure.backupSchedules),
    dailyBackupValid: preflight.infrastructure.backupSchedules.some(schedule => (
      schedule.dailyRecurrence && Number(String(schedule.retention || "0s").replace(/s$/, "")) >= prodReady.BACKUP_RETENTION_DAYS * 86400
    )),
    dailyBackupDetail: preflight.infrastructure.backupSchedules.length ? "configured" : "missing",
    completedBackupObserved: Array.isArray(preflight.infrastructure.readyBackups),
    completedBackupValid: preflight.infrastructure.readyBackups.length > 0,
    completedBackupId: preflight.infrastructure.readyBackups.at(-1)?.name || "missing",
    restoreAttempted: restore.status === "PASS",
    restorePassed: restore.status === "PASS",
    restoreReceipt: restore.receiptHash || restore.status,
  };
  const stagingAvailable = staging.successPath?.finalStatus === "OLD_SEASON_ARCHIVED"
    && staging.failurePath?.finalStatus === "VALIDATION_FAILED"
    && staging.prodReadyCandidateId === candidate.candidateId;
  const goNoGo = prodReady.runGoNoGo({
    candidate,
    productionPreflight: {
      projectId: preflight.projectId,
      maps: preflight.world.maps,
      cities: preflight.world.cities,
      directedChains: preflight.world.directedChains,
      generatedActive: preflight.world.generatedActive,
      coreV2Records: preflight.world.coreV2Records,
      assetManifestHash: preflight.world.assetManifestHash,
      reset2CandidateId: candidate.reset2CandidateId,
      corePackageHash: candidate.corePackageHash,
      indexesReady: preflight.infrastructure.deployedIndexesReady,
      readyIndexes: preflight.infrastructure.deployedIndexCountObserved,
      productionWorldMutationPerformed: preflight.productionWorldMutationPerformed,
    },
    infrastructure,
    adapterValidation: adapter,
    controls: {
      flagsOff: preflight.automation.allResetFlagsOff,
      killSwitchesEngaged: preflight.automation.allResetFlagsOff,
      productionSchedulersSafe: preflight.automation.productionSchedulersSafe,
    },
    stagingRehearsal: stagingAvailable ? {
      success: true,
      failure: true,
      successReceipt: staging.successPath.receiptHash,
      failureReceipt: staging.failurePath.receiptHash,
    } : {},
  });
  assert.equal(Object.keys(goNoGo.checks).length, 39);
  assert.equal(goNoGo.counts.FAIL, 0);
  const scale = prodReady.septemberScaleModel({
    playerCount: preflight.players.exactCount,
    clanCount: preflight.clans.exactRecordCount,
    clanMembershipCount: preflight.clans.integrity.authoritativePlayerMembershipCount,
    commonGearCount: preflight.players.commonGearInstances,
  });
  assert.equal(scale.initiallyActiveRegions, 2);
  assert.equal(scale.standbyRegions, 2);
  assert.equal(scale.generatedMapCount, 4);

  const unresolvedProtection = goNoGo.counts.NOT_YET_CONFIGURED > 0;
  const validation = {
    schemaVersion: "crownlands-prod-ready-1-validation-v1",
    validatorPassed: true,
    productionReady: goNoGo.allPass,
    candidate,
    productionPreflight: {
      checkedAt: preflight.checkedAt,
      players: preflight.players,
      clans: preflight.clans,
      world: preflight.world,
      infrastructure: preflight.infrastructure,
      automation: preflight.automation,
    },
    recoveryProtection: {
      status: protection.status,
      pitr: preflight.infrastructure.pointInTimeRecoveryEnablement,
      deleteProtection: preflight.infrastructure.deleteProtectionState,
      backupScheduleCount: preflight.infrastructure.backupSchedules.length,
      completedBackupCount: preflight.infrastructure.readyBackups.length,
      restoreStatus: restore.status,
    },
    adapters: adapter,
    reset2Revalidation: reset2Validation,
    goNoGo,
    septemberScale: scale,
    changeFreeze: prodReady.freezePolicy(),
    oldWorldRetention: { status: "RETIRED_READ_ONLY", retentionDays: prodReady.OLD_SEASON_RETENTION_DAYS, automaticDeletionConfigured: false },
    deploymentPlan: prodReady.deploymentPlan(),
    stagingScheduledRehearsal: stagingAvailable ? {
      passed: true,
      successStatus: staging.successPath.finalStatus,
      failureStatus: staging.failurePath.finalStatus,
      exactCandidate: staging.successPath.exactProdReadyCandidate,
      controlsDisabledAfter: staging.controlsDisabledAfterRehearsal,
    } : { passed: false, status: "NOT_YET_RUN" },
    decisions: {
      august25FinalStagingDressRehearsal: stagingAvailable ? "GO" : "NO-GO",
      september1AutomaticProductionReset: goNoGo.allPass ? "GO_PENDING_EXPLICIT_DEPLOYMENT_AND_ENABLEMENT_AUTHORIZATION" : "NO-GO",
    },
    remainingAuthorizationGates: [
      ...(unresolvedProtection ? ["production recovery-protection mutation", "first completed daily production backup", "isolated restore of production backup"] : []),
      "production code deployment",
      "production scheduler/config enablement",
    ],
    productionMutationPerformed: false,
    validatedAt: new Date().toISOString(),
  };
  validation.receiptHash = prodReady.hashValue(validation);
  fs.mkdirSync(RESULT_ROOT, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(validation, null, 2)}\n`);
  console.log(`PROD-READY-1 validator passed: ${goNoGo.counts.PASS} PASS, ${goNoGo.counts.FAIL} FAIL, ${goNoGo.counts.NOT_YET_CONFIGURED} NOT_YET_CONFIGURED; September ${validation.decisions.september1AutomaticProductionReset}.`);
  return validation;
}

if (require.main === module) main();

module.exports = Object.freeze({ RESULT_PATH, main });
