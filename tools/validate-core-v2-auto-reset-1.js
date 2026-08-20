"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const automaticReset = require("../functions-auto-reset/automatic-reset.js");
const reset2 = require("./core-v2-reset-2/architecture.js");
const autoReset = require("./core-v2-auto-reset-1/architecture.js");
const { createCurrentProductionWorldAdapter, readLockedAssetManifest } = require("./map-scaling-phase-7/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_DIRECTORY = path.join(ROOT, "benchmark-results", "map", "core-v2-auto-reset-1");
const RESULT_PATH = path.join(RESULT_DIRECTORY, "AUTO_RESET_1_VALIDATION.json");
const STAGING_RESULT_PATH = path.join(RESULT_DIRECTORY, "SCHEDULED_STAGING_REHEARSAL.json");
const RESET_2_CANDIDATE_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-2", "RESET_2_LOCAL_CANDIDATE.json");

function hashFile(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex");
}

async function main() {
  const result = await autoReset.runAutomaticResetStudy();
  const production = createCurrentProductionWorldAdapter();
  const asset = readLockedAssetManifest();
  const reset2CandidateReceipt = JSON.parse(fs.readFileSync(RESET_2_CANDIDATE_PATH, "utf8"));
  const currentReset2Candidate = reset2.buildExactCandidateIdentity();

  assert.equal(result.passed, true);
  assert.equal(result.scheduler.timeZone, "Etc/UTC");
  assert.equal(result.scheduler.monthlyResetCron, "0 0 1 * *");
  assert.equal(result.scheduler.seasonIdFormat, "season-YYYY-MM");
  assert.equal(result.recommendedPrebuildHours, 24);
  assert.equal(result.scheduler.calendar.length, 7);
  assert(result.scheduler.calendar.some(item => item.targetSeasonId === "season-2027-01" && item.sourceSeasonId === "season-2026-12"));
  assert(result.scheduler.calendar.some(item => item.boundary.startsWith("2028-03") && item.daysInPriorMonth === 29));
  assert.equal(result.successfulScheduledPath.finalStatus, "OLD_SEASON_ARCHIVED");
  assert.equal(result.successfulScheduledPath.zeroHumanInterventionAfterScheduleDispatch, true);
  assert.equal(result.successfulScheduledPath.goNoGo.automaticCutoverAllowed, true);
  assert.equal(result.failedScheduledPath.finalStatus, "VALIDATION_FAILED");
  assert.equal(result.failedScheduledPath.oldSeasonRemainsAuthoritative, true);
  assert.equal(result.failedScheduledPath.maintenanceUnwound, true);
  assert.equal(result.duplicateInvocation.duplicateResetCreated, false);
  assert.equal(result.candidateNotPrebuiltAtBoundary.freezeEntered, false);
  assert.equal(result.multiMonth.passed, true);
  assert.equal(result.multiMonth.transitions.length, 4);
  assert.equal(result.multiMonth.gearCountStable, true);
  assert.equal(result.multiMonth.clanCountStable, true);
  assert.equal(result.multiMonth.flagsPersisted, true);
  assert.equal(result.multiMonth.noConsumablesPersisted, true);
  assert.equal(result.multiMonth.oldSeasonsArchivedNotDeleted, true);
  assert.equal(result.controls.productionDefaultsOff, true);
  assert.equal(result.controls.allKillSwitchesEngaged, true);
  assert.equal(result.productionRecoveryProtection.productionEnablementBlocked, true);
  assert.equal(automaticReset.HARD_CORE_MAP_COUNT, 25);
  assert.equal(automaticReset.HARD_CORE_CITY_COUNT, 1480);
  assert.equal(automaticReset.HARD_OUTER_CITY_CAPACITY, 40);
  assert.equal(automaticReset.HARD_MINIMUM_NPC_FOR_SPAWN, 15);
  assert.equal(automaticReset.HARD_STANDBY_TARGET, 2);

  assert.equal(currentReset2Candidate.sourceBundleHash, reset2CandidateReceipt.candidate.sourceBundleHash);
  assert.deepEqual(currentReset2Candidate.sourceHashes, reset2CandidateReceipt.candidate.sourceHashes);

  let scheduledStaging = { available: false, passed: false, status: "NOT_RUN" };
  if (fs.existsSync(STAGING_RESULT_PATH)) {
    const staging = JSON.parse(fs.readFileSync(STAGING_RESULT_PATH, "utf8"));
    assert.equal(staging.stagingProjectId, "crownlands-map-staging-2026");
    assert.equal(staging.productionProjectId, "crown-land-b15e0");
    assert.equal(staging.productionMutationPerformed, false);
    assert.equal(staging.successPath?.finalStatus, "OLD_SEASON_ARCHIVED");
    assert.equal(staging.successPath?.pointerSeasonId, "season-2026-11");
    assert.equal(staging.successPath?.pointerWorldId, "auto-reset-1-staging-world-2026-11");
    assert.notEqual(staging.successPath?.pointerWorldId, staging.successPath?.priorWorldId);
    assert.equal(staging.failurePath?.finalStatus, "VALIDATION_FAILED");
    assert.equal(staging.failurePath?.oldSeasonRemainsAuthoritative, true);
    assert.equal(staging.controlsDisabledAfterRehearsal, true);
    assert.equal(staging.schedulerJobsRestored?.length, 3);
    scheduledStaging = { available: true, passed: true, status: "PASS", receiptHash: staging.receiptHash };
  }

  const validation = {
    schemaVersion: "core-v2-auto-reset-1-validation-v1",
    passed: true,
    study: result,
    scheduledStaging,
    reset2CandidatePreserved: {
      candidateId: currentReset2Candidate.candidateId,
      sourceBundleHash: currentReset2Candidate.sourceBundleHash,
      exactSourceHashesUnchanged: true,
    },
    productionBaseline: {
      maps: production.productionMapCount,
      cities: production.productionCityCount,
      directedChains: production.directedMapChainCount,
      generatedActiveRegions: 0,
    },
    assetManifest: { count: 118, hash: asset.hash },
    schedulerSourceHashes: {
      automaticReset: hashFile("functions-auto-reset/automatic-reset.js"),
      firebaseAdapter: hashFile("functions-auto-reset/firebase-adapter.js"),
      schedulerExports: hashFile("functions-auto-reset/index.js"),
      productionOffConfig: hashFile("functions-auto-reset/runtime-config.json"),
    },
    productionMutationPerformed: false,
    productionDeploymentPerformed: false,
  };
  assert.equal(validation.productionBaseline.maps, 15);
  assert.equal(validation.productionBaseline.cities, 1050);
  assert.equal(validation.productionBaseline.directedChains, 210);
  assert.equal(validation.assetManifest.hash, "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f");
  fs.mkdirSync(RESULT_DIRECTORY, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(validation, null, 2)}\n`);
  console.log(`AUTO-RESET-1 validation passed (${result.multiMonth.transitions.length} monthly transitions, ${result.multiMonth.playerCount} players, production controls OFF).`);
  return validation;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ main, RESULT_PATH, STAGING_RESULT_PATH });
