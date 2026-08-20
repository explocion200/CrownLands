"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const reset = require("./core-v2-reset-2/architecture.js");
const resetContract = require("../reset-persistence-contract.js");
const resetRuntime = require("../functions/reset-runtime-guard.js");
const {
  createCurrentProductionWorldAdapter,
  readLockedAssetManifest,
} = require("./map-scaling-phase-7/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_DIRECTORY = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-2");
const RESULT_PATH = path.join(RESULT_DIRECTORY, "RESET_2_LOCAL_CANDIDATE.json");
const STAGING_RESULT_PATH = path.join(RESULT_DIRECTORY, "STAGING_DRESS_REHEARSAL.json");
const PRODUCTION_PREFLIGHT_PATH = path.join(RESULT_DIRECTORY, "PRODUCTION_READ_ONLY_PREFLIGHT.json");

function main() {
  const head = childProcess.execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(head, reset.APPROVED_RESET_1_GIT_SHA, "RESET-2 must remain based on the approved RESET-1 checkpoint until review.");
  const rehearsal = reset.runLocalDressRehearsal();
  const idempotency = reset.runIdempotencyProof();
  const { result } = rehearsal;
  const production = createCurrentProductionWorldAdapter();
  const assets = readLockedAssetManifest();
  const serverSource = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");

  assert.equal(result.candidate.approvedBaseGitSha, reset.APPROVED_RESET_1_GIT_SHA);
  assert.equal(result.candidate.resetSchemaVersion, reset.SCHEMA_VERSION);
  assert.equal(result.candidate.persistenceAllowlistVersion, `reset-persistence-contract-v${resetContract.CONTRACT_VERSION}`);
  assert.equal(result.candidate.assetManifestHash, reset.ASSET_MANIFEST_HASH);
  assert.equal(result.candidate.requiredConfiguration.resetEnabled, false);
  assert.equal(result.candidate.requiredConfiguration.seasonCutoverEnabled, false);
  assert.equal(result.candidate.requiredConfiguration.automaticResetEnabled, false);
  assert.equal(resetRuntime.normalizeControls().resetEnabled, false);
  assert.equal(resetRuntime.normalizeControls().seasonCutoverEnabled, false);
  assert.equal(resetRuntime.normalizeControls().automaticResetEnabled, false);
  assert(Object.values(resetRuntime.normalizeControls().killSwitches).every(Boolean));

  assert.equal(result.dataset.playerCount, 5000);
  assert(result.dataset.clanCount >= 100);
  assert(result.dataset.sparseAccounts > 0);
  assert(result.dataset.heavyAccounts > 0);
  assert.deepEqual(result.pagination.map(item => item.size), reset.PAGINATION_CASES);
  result.pagination.forEach(item => {
    assert.equal(item.uniqueProcessed, item.size);
    assert.equal(item.duplicateCount, 0);
    assert.equal(item.skippedCount, 0);
    assert.equal(item.staleCursorCount, 0);
    assert.equal(item.original300BoundaryProtected, true);
  });
  assert.equal(result.pagination.find(item => item.size === 300).pageCount, 1);
  assert.equal(result.pagination.find(item => item.size === 301).pageCount, 2);
  assert.equal(result.pagination.find(item => item.size === 5000).pageCount, 17);

  assert.equal(result.persistence.playerCount, 5000);
  assert(result.persistence.ownedGearCount > 0);
  assert(result.persistence.equippedGearCount > 0);
  assert(result.persistence.duplicateGearCount > 0);
  assert.equal(result.clans.membershipCount + result.dataset.clanlessPlayers, 5000);
  assert.equal(result.clans.orphanMemberships, 0);
  assert.equal(result.clans.duplicateClans, 0);
  assert.equal(result.flags.count, 5000);
  assert.equal(result.flags.mismatches, 0);
  assert.equal(result.seasonalReset.consumablesRemaining, 0);
  assert.equal(result.seasonalReset.worldStateRemaining, 0);

  assert.equal(result.backup.playerCount, 5000);
  assert.equal(result.backup.clanCount, result.dataset.clanCount);
  assert.equal(result.backup.validated, true);
  assert.equal(result.restore.validated, true);
  assert.equal(result.restore.publishedPackagesRegenerated, false);
  assert.equal(result.world.coreRegionCount, 25);
  assert.equal(result.world.coreCityCount, 1480);
  assert.equal(result.world.objectiveCount, 17);
  assert.equal(result.world.activeOuterRegions, 194);
  assert.equal(result.world.standbyOuterRegions, 2);
  assert.equal(result.world.duplicateCityIds, 0);
  assert.equal(result.world.reciprocalTopologyErrors, 0);
  assert.equal(result.placements.count, 5000);
  assert.equal(result.placements.uniqueStartingCities, 5000);
  assert.equal(result.placements.allOutsideCore, true);
  assert.equal(result.boundaryAndStandby.successfulPlacement.npcBefore, 15);
  assert.equal(result.boundaryAndStandby.successfulPlacement.npcAfter, 14);
  assert.equal(result.boundaryAndStandby.rejectedPlacement.allowed, false);
  assert.equal(result.boundaryAndStandby.rejectedPlacement.regionRemainsActive, true);
  assert.equal(result.boundaryAndStandby.clockwiseActivation.standbyCount, 2);
  assert.equal(result.boundaryAndStandby.workerFailure.playerWaitRequired, false);
  assert.equal(result.boundaryAndStandby.generationFailure.coordinateRetained, true);
  assert.equal(result.boundaryAndStandby.queueRestart.deterministicResume, true);

  assert.equal(result.mainCity.paths.length, 8);
  assert.equal(result.mainCity.restrictedRegions.length, 5);
  assert.equal(result.mainCity.rejectedAttempts, 40);
  assert(result.mainCity.normalGameplay.every(item => item.allowed));
  assert.equal(result.readyGating.beforeReadyPlayerEntry, false);
  assert.equal(result.readyGating.readyValidated, true);
  assert.equal(result.pointerCutover.atomic, true);
  assert.equal(result.pointerCutover.candidateMatched, true);
  assert.equal(result.oldSeason.status, "ARCHIVED");
  assert.equal(result.oldSeason.mutationState, "READ_ONLY");
  assert.equal(result.oldSeason.deleted, false);
  assert.equal(result.oldSeason.retentionDays, 30);
  assert.equal(result.failures.length, reset.FAILURE_STAGES.length);
  assert(result.failures.every(item => item.oldSeasonRemainsAuthoritative && !item.partialSeasonVisible && item.safeToRetry));
  assert.equal(idempotency.passed, true);

  assert(serverSource.includes("CORE_MAIN_CITY_POLICY.isEligibleMainCityLocation("));
  assert(serverSource.includes("CORE_MAIN_CITY_POLICY.getForbiddenMainCityReason(targetEntry.city, targetRegionId)"));
  assert(serverSource.includes("CORE_MAIN_CITY_POLICY.getForbiddenMainCityReason({ regionId }, regionId)"));
  assert(serverSource.includes("CORE_MAIN_CITY_POLICY.getForbiddenMainCityReason(chosenCity, chosenIsland.regionId)"));
  assert.equal(production.productionMapCount, 15);
  assert.equal(production.productionCityCount, 1050);
  assert.equal(production.directedMapChainCount, 210);
  assert.equal(production.generatedActiveRegionCount, 0);
  assert.equal(assets.manifest.assetCount, 118);
  assert.equal(assets.hash, reset.ASSET_MANIFEST_HASH);

  let staging = { available: false };
  if (fs.existsSync(STAGING_RESULT_PATH)) {
    const remote = JSON.parse(fs.readFileSync(STAGING_RESULT_PATH, "utf8"));
    assert.equal(remote.passed, true);
    assert.equal(remote.candidate.sourceBundleHash, result.candidate.sourceBundleHash);
    assert.equal(remote.dataset.playerCount, 5000);
    assert.equal(remote.remotePagination.uniquePlayers, 5000);
    assert.equal(remote.remotePagination.duplicatePlayers, 0);
    assert.equal(remote.remotePagination.skippedPlayers, 0);
    assert.equal(remote.remotePagination.playerPages, 17);
    assert.equal(remote.remoteValidation.coreRegionDocuments, 25);
    assert.equal(remote.remoteValidation.coreCityDocuments, 1480);
    assert.equal(remote.remoteValidation.objectiveDocuments, 17);
    assert.equal(remote.backup.status, "VALIDATED");
    assert.equal(remote.restore.validated, true);
    assert.equal(remote.pointerCompareAndSet.exactCandidateMatched, true);
    assert.equal(remote.priorAbortedAttempts.length, 4);
    assert(remote.priorAbortedAttempts.every(attempt => (
      attempt.status === "ABORTED"
      && attempt.oldSeasonRemainedAuthoritative
      && !attempt.partialSeasonVisible
      && !attempt.pointerCutoverPerformed
      && !attempt.productionMutationPerformed
    )));
    assert.equal(remote.productionMutationPerformed, false);
    staging = {
      available: true,
      passed: true,
      runId: remote.runId,
      replayed: remote.replayed,
      durationMs: remote.durationMs,
      receiptHash: remote.receiptHash,
      convergenceHash: remote.convergenceHash,
    };
  }

  let productionPreflight = { available: false };
  if (fs.existsSync(PRODUCTION_PREFLIGHT_PATH)) {
    const preflight = JSON.parse(fs.readFileSync(PRODUCTION_PREFLIGHT_PATH, "utf8"));
    assert.equal(preflight.mode, "READ_ONLY");
    assert.equal(preflight.projectId, "crown-land-b15e0");
    assert.equal(preflight.mutationMethodsPresent, false);
    assert.equal(preflight.productionBaseline.mapCount, 15);
    assert.equal(preflight.productionBaseline.cityDefinitionCount, 1050);
    assert.equal(preflight.productionBaseline.directedMapChainCount, 210);
    assert.equal(preflight.productionBaseline.generatedActiveRegionCount, 0);
    assert.equal(preflight.productionBaseline.unexpectedCoreV2RecordCount, 0);
    assert.equal(preflight.productionBaseline.assetManifestHash, reset.ASSET_MANIFEST_HASH);
    assert.equal(preflight.controls.candidateResetControlsOff, true);
    assert.equal(preflight.controls.candidateKillSwitchesEngaged, true);
    assert.equal(preflight.pass, true);
    assert.equal(preflight.productionMutationPerformed, false);
    productionPreflight = {
      available: true,
      passed: true,
      playerCount: preflight.productionDataShape.playerCount,
      clanRecordCount: preflight.productionDataShape.clanRecordCount,
      commonGearInstanceCount: preflight.productionDataShape.commonGearInstanceCount,
      pointInTimeRecoveryEnablement: preflight.firebase.pointInTimeRecoveryEnablement,
    };
  }

  const validation = {
    schemaVersion: "core-v2-reset-2-validation-v1",
    passed: true,
    candidate: result.candidate,
    dataset: result.dataset,
    pagination: result.pagination,
    persistence: result.persistence,
    clans: result.clans,
    flags: result.flags,
    seasonalReset: result.seasonalReset,
    backup: result.backup,
    restore: { restoreHash: result.restore.restoreHash, validated: result.restore.validated, publishedPackagesRegenerated: false },
    world: result.world,
    placements: result.placements,
    boundaryAndStandby: result.boundaryAndStandby,
    mainCity: { restrictedRegionCount: result.mainCity.restrictedRegions.length, pathCount: result.mainCity.paths.length, rejectedAttempts: result.mainCity.rejectedAttempts, normalGameplayChecks: result.mainCity.normalGameplay.length },
    readyGating: result.readyGating,
    pointerCutover: result.pointerCutover,
    failureInjection: result.failures,
    idempotency,
    monitoring: result.monitoring,
    timings: result.timings,
    durationMs: result.durationMs,
    staging,
    productionPreflight,
    productionBaseline: { maps: 15, cities: 1050, directedChains: 210, generatedActiveRegions: 0 },
    assetManifest: { count: 118, hash: assets.hash },
    productionMutationPerformed: false,
  };
  fs.mkdirSync(RESULT_DIRECTORY, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(validation, null, 2)}\n`);
  console.log(`Core v2 RESET-2 validation passed (${result.dataset.playerCount} players, ${result.persistence.ownedGearCount} Common Gear instances, ${result.world.coreRegionCount} Core maps, ${result.world.coreCityCount} Core cities).`);
  return validation;
}

if (require.main === module) main();

module.exports = Object.freeze({ main, RESULT_PATH, STAGING_RESULT_PATH, PRODUCTION_PREFLIGHT_PATH });
