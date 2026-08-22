"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const reset2 = require("../core-v2-reset-2/architecture.js");
const automaticReset = require("../../functions-auto-reset/automatic-reset.js");
const adapters = require("../../functions-auto-reset/production-adapters.js");

const ROOT = path.resolve(__dirname, "../..");
const APPROVED_AUTO_RESET_GIT_SHA = "0482029c30c8efd456c689aa93d9326ebc48d6b3";
const SCHEMA_VERSION = "crownlands-prod-ready-1-v1";
const BACKUP_RETENTION_DAYS = 35;
const PITR_RETENTION_DAYS = 7;
const OLD_SEASON_RETENTION_DAYS = 30;
const EXPECTED_PRODUCTION = Object.freeze({ maps: 15, cities: 1050, directedChains: 210, generatedActive: 0, coreV2Records: 0 });
const ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const GO_NO_GO_KEYS = Object.freeze([
  "expected_project",
  "baseline_maps",
  "baseline_cities",
  "baseline_chains",
  "no_active_generated",
  "no_core_v2_records",
  "asset_manifest",
  "exact_candidate",
  "core_package",
  "generator_version",
  "persistence_contract",
  "node22_runtime",
  "indexes_ready",
  "pitr_enabled",
  "delete_protection_enabled",
  "daily_backup_schedule",
  "completed_backup",
  "restore_rehearsal",
  "generation_adapter",
  "generation_duplicate_guard",
  "generation_core_guard",
  "generation_activation_off",
  "migration_adapter",
  "migration_pagination",
  "migration_allowlist",
  "migration_checksums",
  "migration_idempotency",
  "placement_adapter",
  "placement_outside_core",
  "placement_capacity_40",
  "placement_npc_threshold",
  "placement_concurrency",
  "main_city_restrictions",
  "reset_flags_off",
  "kill_switches_engaged",
  "production_scheduler_safe",
  "staging_scheduled_success",
  "staging_scheduled_failure",
  "no_production_world_mutation",
]);

const CANDIDATE_SOURCE_PATHS = Object.freeze([
  "functions-auto-reset/automatic-reset.js",
  "functions-auto-reset/firebase-adapter.js",
  "functions-auto-reset/index.js",
  "functions-auto-reset/production-adapters.js",
  "functions-auto-reset/runtime-config.json",
  "functions-auto-reset/package.json",
  "firebase.auto-reset.json",
  "reset-persistence-contract.js",
  "functions/core-main-city-policy.js",
  "firestore.indexes.json",
  "tools/core-v2-prod-ready-1/architecture.js",
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function hashFile(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex");
}

function gitHead() {
  return childProcess.execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

function buildCandidateIdentity() {
  const resetCandidate = reset2.buildExactCandidateIdentity();
  const sourceHashes = Object.fromEntries(CANDIDATE_SOURCE_PATHS.map(relativePath => [relativePath, hashFile(relativePath)]));
  const indexSpec = JSON.parse(fs.readFileSync(path.join(ROOT, "firestore.indexes.json"), "utf8"));
  const autoPackage = JSON.parse(fs.readFileSync(path.join(ROOT, "functions-auto-reset/package.json"), "utf8"));
  const sourceBundleHash = hashValue(sourceHashes);
  return Object.freeze({
    candidateId: `prod-ready-1-${sourceBundleHash.slice(0, 16)}`,
    schemaVersion: SCHEMA_VERSION,
    approvedAutoResetGitSha: APPROVED_AUTO_RESET_GIT_SHA,
    workingGitSha: gitHead(),
    reset2CandidateId: resetCandidate.candidateId,
    reset2SchemaVersion: resetCandidate.resetSchemaVersion,
    reset2SourceBundleHash: resetCandidate.sourceBundleHash,
    automaticResetSchemaVersion: automaticReset.SCHEMA_VERSION,
    automaticResetCandidateVersion: "core-v2-auto-reset-1-reset2-candidate-v1",
    schedulerVersion: "crownlands-auto-reset-scheduler-v1",
    scheduler: {
      monthly: automaticReset.MONTHLY_RESET_CRON,
      prebuildCoordinator: automaticReset.PREBUILD_COORDINATOR_CRON,
      watchdog: automaticReset.CATCH_UP_CRON,
      timeZone: automaticReset.RESET_TIME_ZONE,
    },
    resetStateMachineVersion: automaticReset.SCHEMA_VERSION,
    corePackageVersion: resetCandidate.corePackageVersion,
    corePackageHash: resetCandidate.corePackageHash,
    persistenceAllowlistVersion: resetCandidate.persistenceAllowlistVersion,
    generatedWorldVersion: resetCandidate.generatedWorldVersion,
    assetManifestHash: resetCandidate.assetManifestHash,
    productionAdapterVersion: adapters.ADAPTER_VERSION,
    requiredIndexCount: indexSpec.indexes.length,
    requiredIndexHash: hashFile("firestore.indexes.json"),
    functionsRuntime: autoPackage.engines.node,
    functionsPackageManager: autoPackage.packageManager,
    sourceBundleHash,
    sourceHashes,
    invalidatedByChangesTo: CANDIDATE_SOURCE_PATHS,
  });
}

function status(value, notConfigured = false, detail = "") {
  return Object.freeze({ status: notConfigured ? "NOT_YET_CONFIGURED" : value ? "PASS" : "FAIL", detail });
}

function runGoNoGo(input) {
  const candidate = input.candidate || buildCandidateIdentity();
  const baseline = input.productionPreflight || {};
  const infra = input.infrastructure || {};
  const adapter = input.adapterValidation || {};
  const staging = input.stagingRehearsal || {};
  const controls = input.controls || {};
  const checks = {
    expected_project: status(baseline.projectId === adapters.PRODUCTION_PROJECT_ID, false, baseline.projectId || "missing"),
    baseline_maps: status(baseline.maps === EXPECTED_PRODUCTION.maps, false, String(baseline.maps)),
    baseline_cities: status(baseline.cities === EXPECTED_PRODUCTION.cities, false, String(baseline.cities)),
    baseline_chains: status(baseline.directedChains === EXPECTED_PRODUCTION.directedChains, false, String(baseline.directedChains)),
    no_active_generated: status(baseline.generatedActive === 0, false, String(baseline.generatedActive)),
    no_core_v2_records: status(baseline.coreV2Records === 0, false, String(baseline.coreV2Records)),
    asset_manifest: status(baseline.assetManifestHash === ASSET_MANIFEST_HASH, false, baseline.assetManifestHash || "missing"),
    exact_candidate: status(candidate.approvedAutoResetGitSha === APPROVED_AUTO_RESET_GIT_SHA && candidate.reset2CandidateId === baseline.reset2CandidateId, false, candidate.candidateId),
    core_package: status(baseline.corePackageHash === candidate.corePackageHash, !baseline.corePackageHash, baseline.corePackageHash || "not staged in production"),
    generator_version: status(adapter.generatorVersion === candidate.generatedWorldVersion, !adapter.generatorVersion, adapter.generatorVersion || "missing"),
    persistence_contract: status(adapter.persistenceAllowlistVersion === candidate.persistenceAllowlistVersion, !adapter.persistenceAllowlistVersion, adapter.persistenceAllowlistVersion || "missing"),
    node22_runtime: status(candidate.functionsRuntime === "22", false, `Node ${candidate.functionsRuntime}`),
    indexes_ready: status(baseline.indexesReady === true, baseline.indexesReady === undefined, `${baseline.readyIndexes || 0}/${candidate.requiredIndexCount} required specifications`),
    pitr_enabled: status(infra.pitrEnabled === true, infra.pitrEnabled !== true && infra.pitrObserved === true, infra.pitrEnabled ? "enabled" : "disabled"),
    delete_protection_enabled: status(infra.deleteProtectionEnabled === true, infra.deleteProtectionEnabled !== true && infra.deleteProtectionObserved === true, infra.deleteProtectionEnabled ? "enabled" : "disabled"),
    daily_backup_schedule: status(infra.dailyBackupValid === true, infra.dailyBackupObserved === true && infra.dailyBackupValid !== true, infra.dailyBackupDetail || "missing"),
    completed_backup: status(infra.completedBackupValid === true, infra.completedBackupObserved === true && infra.completedBackupValid !== true, infra.completedBackupId || "missing"),
    restore_rehearsal: status(infra.restorePassed === true, infra.restoreAttempted !== true, infra.restoreReceipt || "not run"),
    generation_adapter: status(adapter.generationPassed === true, adapter.generationPassed === undefined, adapter.version || "missing"),
    generation_duplicate_guard: status(adapter.generationDuplicateGuard === true, adapter.generationDuplicateGuard === undefined),
    generation_core_guard: status(adapter.generationCoreGuard === true, adapter.generationCoreGuard === undefined),
    generation_activation_off: status(adapter.generationActivationOff === true, adapter.generationActivationOff === undefined),
    migration_adapter: status(adapter.migrationPassed === true, adapter.migrationPassed === undefined),
    migration_pagination: status(adapter.paginationPassed === true, adapter.paginationPassed === undefined),
    migration_allowlist: status(adapter.allowlistPassed === true, adapter.allowlistPassed === undefined),
    migration_checksums: status(adapter.checksumsPassed === true, adapter.checksumsPassed === undefined),
    migration_idempotency: status(adapter.migrationIdempotencyPassed === true, adapter.migrationIdempotencyPassed === undefined),
    placement_adapter: status(adapter.placementPassed === true, adapter.placementPassed === undefined),
    placement_outside_core: status(adapter.placementOutsideCore === true, adapter.placementOutsideCore === undefined),
    placement_capacity_40: status(adapter.placementCapacity40 === true, adapter.placementCapacity40 === undefined),
    placement_npc_threshold: status(adapter.npcThresholdPassed === true, adapter.npcThresholdPassed === undefined),
    placement_concurrency: status(adapter.concurrencyPassed === true, adapter.concurrencyPassed === undefined),
    main_city_restrictions: status(adapter.mainCityRestrictionsPassed === true, adapter.mainCityRestrictionsPassed === undefined),
    reset_flags_off: status(controls.flagsOff === true, controls.flagsOff === undefined),
    kill_switches_engaged: status(controls.killSwitchesEngaged === true, controls.killSwitchesEngaged === undefined),
    production_scheduler_safe: status(controls.productionSchedulersSafe === true, controls.productionSchedulersSafe === undefined),
    staging_scheduled_success: status(staging.success === true, staging.success === undefined, staging.successReceipt || "not run"),
    staging_scheduled_failure: status(staging.failure === true, staging.failure === undefined, staging.failureReceipt || "not run"),
    no_production_world_mutation: status(baseline.productionWorldMutationPerformed === false, baseline.productionWorldMutationPerformed === undefined),
  };
  assert.deepEqual(Object.keys(checks), GO_NO_GO_KEYS);
  const counts = Object.values(checks).reduce((value, check) => {
    value[check.status] += 1;
    return value;
  }, { PASS: 0, FAIL: 0, NOT_YET_CONFIGURED: 0 });
  return Object.freeze({ schemaVersion: `${SCHEMA_VERSION}-go-no-go`, candidateId: candidate.candidateId, checks, counts, allPass: counts.PASS === 39 });
}

function septemberScaleModel({ playerCount, clanCount, clanMembershipCount = clanCount, commonGearCount }) {
  assert(Number.isSafeInteger(playerCount) && playerCount >= 0);
  assert(Number.isSafeInteger(clanCount) && clanCount >= 0);
  assert(Number.isSafeInteger(clanMembershipCount) && clanMembershipCount >= 0);
  const placementsPerRegion = adapters.CITY_CAPACITY - adapters.MINIMUM_NPC_CITIES_FOR_SPAWN + 1;
  const initiallyActiveRegions = Math.max(1, Math.ceil(playerCount / placementsPerRegion));
  const standbyRegions = 2;
  const generatedMapCount = initiallyActiveRegions + standbyRegions;
  const coreBootstrapWrites = 25 + 1480 + 17;
  const generatedRegionDocumentWrites = 3 + adapters.CITY_CAPACITY * 2;
  const outerBootstrapWrites = generatedMapCount * generatedRegionDocumentWrites;
  const migrationWrites = playerCount + clanCount + clanMembershipCount + Math.ceil(playerCount / adapters.DEFAULT_PAGE_SIZE) + Math.ceil(clanCount / adapters.MAX_CLAN_PAGE_SIZE);
  const placementWrites = playerCount * 3;
  const orchestrationWrites = 30;
  return Object.freeze({
    playerCount,
    clanCount,
    commonGearCount,
    expectedStartingCities: playerCount,
    placementsPerRegion,
    initiallyActiveRegions,
    standbyRegions,
    generatedMapCount,
    expectedMigrationVolume: { players: playerCount, clans: clanCount, clanMemberships: clanMembershipCount, commonGearInstances: commonGearCount },
    approximateFirestoreWrites: coreBootstrapWrites + outerBootstrapWrites + migrationWrites + placementWrites + orchestrationWrites,
    estimatedFreezeMinutes: playerCount <= 100 ? "5-10" : "10-20",
    modelBasis: "26 placements per 40-city region: placement at 15 NPC succeeds, subsequent placement at 14 rejects; two additional STANDBY regions; each generated region writes one coordinate lock, package, region, 40 city records, and 40 global city-ID locks; migration includes player/Clan/member records and page receipts.",
  });
}

function freezePolicy() {
  return Object.freeze({
    policyVersion: "prod-ready-1-reset-sensitive-freeze-v1",
    categories: {
      persistenceMigration: ["migration adapter", "allowlist", "pagination", "checksums", "staging success/failure"],
      playerClanFlagGearSchema: ["migration adapter", "persistence", "pagination", "staging success/failure"],
      corePackage: ["Core validators", "world bootstrap", "staging success/failure"],
      generatedRegionGenerator: ["generation adapter", "package hashes", "road/edge contracts", "staging success/failure"],
      playerPlacement: ["concurrency", "15-NPC boundary", "main-city restrictions", "staging success/failure"],
      readyAndGoNoGo: ["39 checks", "failure injection", "staging success/failure"],
      seasonPointerAndSchedulerLock: ["duplicate invocation", "atomic pointer", "scheduled success/failure"],
    },
    changeRule: "Any reset-sensitive source change creates a new candidate identity and repeats every listed affected gate before production authorization.",
  });
}

function deploymentPlan() {
  return Object.freeze([
    { stage: 0, action: "Deploy production-capable generation/reset code with all automation flags OFF and all kill switches engaged.", executeNow: false },
    { stage: 1, action: "Run and archive a fresh read-only production baseline.", executeNow: false },
    { stage: 2, action: "Verify PITR, delete protection, daily backup, completed backup, and restore receipt.", executeNow: false },
    { stage: 3, action: "Verify candidate hashes, production adapters, indexes, IAM, and disabled controls.", executeNow: false },
    { stage: 4, action: "Explicitly authorize and enable only the T-24h prebuild coordinator.", executeNow: false },
    { stage: 5, action: "Explicitly authorize and enable the monthly UTC scheduler and 15-minute watchdog.", executeNow: false },
    { stage: 6, action: "Explicitly authorize automatic cutover only after final GO evidence and a fresh completed backup.", executeNow: false },
  ]);
}

module.exports = Object.freeze({
  ROOT,
  APPROVED_AUTO_RESET_GIT_SHA,
  SCHEMA_VERSION,
  BACKUP_RETENTION_DAYS,
  PITR_RETENTION_DAYS,
  OLD_SEASON_RETENTION_DAYS,
  EXPECTED_PRODUCTION,
  ASSET_MANIFEST_HASH,
  GO_NO_GO_KEYS,
  CANDIDATE_SOURCE_PATHS,
  hashValue,
  hashFile,
  buildCandidateIdentity,
  runGoNoGo,
  septemberScaleModel,
  freezePolicy,
  deploymentPlan,
});
