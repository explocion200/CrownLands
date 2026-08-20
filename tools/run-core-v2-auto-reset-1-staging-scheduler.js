"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  CONFIG,
  requireMutationConfirmation,
  environmentBanner,
} = require("./map-scaling-phase-9/environment.js");
const { googleRequest } = require("./map-scaling-phase-9/google-api.js");
const { getDocument, setDocument } = require("./map-scaling-phase-9/staging-api.js");
const automaticReset = require("../functions-auto-reset/automatic-reset.js");
const autoResetStudy = require("./core-v2-auto-reset-1/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-auto-reset-1", "SCHEDULED_STAGING_REHEARSAL.json");
const RESET_2_STAGING_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-2", "STAGING_DRESS_REHEARSAL.json");
const STAGING_BOUNDARY = "2026-11-01T00:00:00.000Z";
const SOURCE_SEASON_ID = "season-2026-10";
const TARGET_SEASON_ID = "season-2026-11";
const TARGET_WORLD_ID = "auto-reset-1-staging-world-2026-11";
const FAILURE_CANDIDATE_VERSION = "auto-reset-1-staging-hard-failure-v4";
const SUCCESS_CANDIDATE_VERSION = "auto-reset-1-staging-success-v4";
const PREBUILD_JOB = `projects/${CONFIG.stagingProjectId}/locations/us-central1/jobs/firebase-schedule-prebuildNextMonthlySeason-us-central1`;
const RESET_JOB = `projects/${CONFIG.stagingProjectId}/locations/us-central1/jobs/firebase-schedule-runMonthlySeasonReset-us-central1`;
const CATCH_UP_JOB = `projects/${CONFIG.stagingProjectId}/locations/us-central1/jobs/firebase-schedule-catchUpMonthlySeasonReset-us-central1`;
const DEFAULT_JOB_SCHEDULES = Object.freeze({
  [PREBUILD_JOB]: automaticReset.PREBUILD_COORDINATOR_CRON,
  [RESET_JOB]: automaticReset.MONTHLY_RESET_CRON,
  [CATCH_UP_JOB]: automaticReset.CATCH_UP_CRON,
});

function environmentInput() {
  return {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function cronAt(date) {
  return `${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;
}

function nextMinute(offsetMinutes) {
  const date = new Date();
  date.setUTCSeconds(0, 0);
  date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
  return date;
}

async function patchJobSchedule(jobName, schedule) {
  const result = await googleRequest(
    `https://cloudscheduler.googleapis.com/v1/${jobName}?updateMask=schedule,timeZone`,
    {
      method: "PATCH",
      quotaProjectId: CONFIG.stagingProjectId,
      body: { name: jobName, schedule, timeZone: automaticReset.RESET_TIME_ZONE },
    },
  );
  assert.equal(result.body.schedule, schedule);
  assert.equal(result.body.timeZone, automaticReset.RESET_TIME_ZONE);
  return { name: jobName, schedule, state: result.body.state, timeZone: result.body.timeZone };
}

async function restoreJobSchedules() {
  const results = [];
  for (const [jobName, schedule] of Object.entries(DEFAULT_JOB_SCHEDULES)) {
    results.push(await patchJobSchedule(jobName, schedule));
  }
  return results;
}

function stagingControls(candidateVersion, enabled = true) {
  return {
    schemaVersion: automaticReset.SCHEMA_VERSION,
    environment: "STAGING",
    monthlySeasonResetEnabled: enabled,
    automaticPrebuildEnabled: enabled,
    automaticCutoverEnabled: enabled,
    candidateVersion,
    stagingRehearsalBoundary: STAGING_BOUNDARY,
    prebuildHoursBeforeBoundary: 24,
    standbyRegionTarget: 2,
    oldSeasonRetentionDays: 30,
    recoveryProtection: {
      backupRequired: true,
      pitrRequired: true,
      deleteProtectionRequired: true,
      approved: true,
    },
    killSwitches: Object.fromEntries(automaticReset.KILL_SWITCHES.map(key => [key, !enabled])),
    synthetic: true,
    productionDataCopied: false,
    productionMutationPerformed: false,
  };
}

function buildEvidence(reset2Receipt, hardFailure = false) {
  const local = {
    result: {
      candidate: reset2Receipt.candidate,
      dataset: reset2Receipt.dataset,
      persistence: reset2Receipt.persistence,
      flags: reset2Receipt.flags,
      clans: reset2Receipt.clans,
      seasonalReset: reset2Receipt.seasonalReset,
      world: reset2Receipt.world,
      mainCity: reset2Receipt.mainCity,
    },
  };
  return autoResetStudy.buildGoEvidence({
    local,
    controls: automaticReset.normalizeControls(stagingControls(SUCCESS_CANDIDATE_VERSION)),
    hardFailure: hardFailure ? "persistence.gearLevelsMatch" : "",
  });
}

function candidateDocument(candidateVersion, reset2Receipt, hardFailure) {
  const identity = automaticReset.operationIdentity({
    sourceSeasonId: SOURCE_SEASON_ID,
    targetSeasonId: TARGET_SEASON_ID,
    targetWorldId: TARGET_WORLD_ID,
    scheduledResetAt: STAGING_BOUNDARY,
    candidateVersion,
  });
  return {
    schemaVersion: automaticReset.SCHEMA_VERSION,
    candidateVersion,
    sourceSeasonId: SOURCE_SEASON_ID,
    targetSeasonId: TARGET_SEASON_ID,
    targetWorldId: TARGET_WORLD_ID,
    resetOperationId: identity.resetOperationId,
    environment: "STAGING",
    synthetic: true,
    productionDataCopied: false,
    productionMutationPerformed: false,
    sourceReset2RunId: reset2Receipt.runId,
    sourceReset2ReceiptHash: reset2Receipt.receiptHash,
    prebuild: {
      valid: true,
      coreMapCount: 25,
      coreCityCount: 1480,
      objectiveCount: 17,
      activeOuterRegionCount: reset2Receipt.world.activeOuterRegions,
      standbyRegionCount: 2,
      packageHash: reset2Receipt.candidate.corePackageHash,
      topologyHash: reset2Receipt.candidate.sourceBundleHash,
      prebuiltAt: new Date().toISOString(),
    },
    backup: {
      operationId: identity.resetOperationId,
      backupId: `staging-${identity.resetOperationId}`,
      start: new Date().toISOString(),
      complete: new Date().toISOString(),
      completed: true,
      receiptValid: true,
      recoveryProtectionApproved: true,
      coverage: "RESET-2 exact-candidate 5,000-player staging receipt",
    },
    migration: {
      playerCount: reset2Receipt.dataset.playerCount,
      clanCount: reset2Receipt.dataset.clanCount,
      persistentHash: reset2Receipt.persistence.persistentHash,
      gearHash: reset2Receipt.persistence.gearHash,
      clanHash: reset2Receipt.clans.hash,
      flagHash: reset2Receipt.flags.hash,
      ownedGearCount: reset2Receipt.persistence.ownedGearCount,
      equippedGearCount: reset2Receipt.persistence.equippedGearCount,
      duplicateGearCount: reset2Receipt.persistence.duplicateGearCount,
      bagConsumablesMigrated: 0,
      seasonalWorldStateMigrated: 0,
    },
    goEvidence: buildEvidence(reset2Receipt, hardFailure),
    postCutoverSmoke: {
      passed: true,
      activeSeasonPointer: true,
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
    },
  };
}

async function waitFor(pathName, predicate, label, timeoutMs = 240000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const document = await getDocument(pathName);
    if (document && predicate(document.data)) return { document, waitedMs: Date.now() - startedAt };
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for ${label} at ${pathName}.`);
}

async function stageCandidate(candidateVersion, reset2Receipt, hardFailure) {
  const candidate = candidateDocument(candidateVersion, reset2Receipt, hardFailure);
  await setDocument("automaticSeasonReset/config", stagingControls(candidateVersion, true));
  await setDocument(`automaticSeasonResetCandidates/${TARGET_SEASON_ID}`, candidate);
  return candidate;
}

async function schedulePair() {
  const prebuildAt = nextMinute(2);
  const resetAt = nextMinute(3);
  const jobs = [
    await patchJobSchedule(PREBUILD_JOB, cronAt(prebuildAt)),
    await patchJobSchedule(RESET_JOB, cronAt(resetAt)),
  ];
  console.log(`Scheduled prebuild for ${prebuildAt.toISOString()} and reset for ${resetAt.toISOString()}.`);
  return { prebuildAt: prebuildAt.toISOString(), resetAt: resetAt.toISOString(), jobs };
}

async function runScheduledCase(candidateVersion, reset2Receipt, hardFailure) {
  const candidate = await stageCandidate(candidateVersion, reset2Receipt, hardFailure);
  const schedule = await schedulePair();
  const operationPath = `automaticSeasonResetOperations/${candidate.resetOperationId}`;
  const receiptPath = `automaticSeasonResetReceipts/${candidate.resetOperationId}`;
  const prebuild = await waitFor(operationPath, data => data.state === "PREBUILT" || automaticReset.FAILURE_STATES.has(data.state), `${candidateVersion} prebuild`);
  console.log(`${candidateVersion} prebuild reached ${prebuild.document.data.state}.`);
  assert.equal(prebuild.document.data.state, "PREBUILT");
  const expectedFinal = hardFailure ? "VALIDATION_FAILED" : "OLD_SEASON_ARCHIVED";
  const receipt = await waitFor(receiptPath, data => data.finalStatus === expectedFinal, `${candidateVersion} final receipt`);
  assert.equal(receipt.document.data.operationId, candidate.resetOperationId);
  assert.equal(receipt.document.data.targetWorldId, TARGET_WORLD_ID);
  assert.equal(receipt.document.data.core.mapCount, 25);
  assert.equal(receipt.document.data.core.cityCount, 1480);
  assert.equal(receipt.document.data.core.objectiveCount, 17);
  assert.equal(receipt.document.data.migration.playerCount, 5000);
  assert.equal(receipt.document.data.migration.ownedCommonGearCount, 74000);
  assert.equal(receipt.document.data.outerWorld.standbyRegionCount, 2);
  assert(receipt.document.data.actualStartAt);
  assert(receipt.document.data.actualEndAt);
  assert(receipt.document.data.backupReceipt?.receiptValid === true);
  assert(receipt.document.data.validation);
  assert(receipt.document.data.cutoverTransaction);
  assert(receipt.document.data.archiveResult);
  console.log(`${candidateVersion} reset reached ${receipt.document.data.finalStatus}.`);
  const operation = await getDocument(operationPath);
  return {
    candidateVersion,
    operationId: candidate.resetOperationId,
    schedule,
    prebuildWaitMs: prebuild.waitedMs,
    resetWaitMs: receipt.waitedMs,
    finalStatus: receipt.document.data.finalStatus,
    operationState: operation.data.state,
    receiptHash: receipt.document.data.receiptHash,
    goNoGo: operation.data.goNoGo,
  };
}

async function main() {
  const identity = requireMutationConfirmation(environmentInput());
  console.log(environmentBanner(identity));
  assert.equal(identity.targetProjectId, CONFIG.stagingProjectId);
  assert.notEqual(identity.targetProjectId, CONFIG.productionProjectId);
  const reset2Receipt = JSON.parse(fs.readFileSync(RESET_2_STAGING_PATH, "utf8"));
  assert.equal(reset2Receipt.passed, true);
  assert.equal(reset2Receipt.dataset.playerCount, 5000);
  assert.equal(reset2Receipt.productionMutationPerformed, false);

  const pointerBefore = await getDocument("worldControl/activeSeason");
  assert(pointerBefore, "AUTO-RESET-1 staging resume requires the prior synthetic rehearsal pointer.");
  assert.equal(pointerBefore.data.environment, "STAGING");
  assert.equal(pointerBefore.data.synthetic, true);
  assert.equal(pointerBefore.data.productionDataCopied, false);
  assert.equal(pointerBefore.data.productionMutationPerformed, false);
  assert.equal(pointerBefore.data.seasonId, SOURCE_SEASON_ID);

  let restoredSchedules = [];
  try {
    const failurePath = await runScheduledCase(FAILURE_CANDIDATE_VERSION, reset2Receipt, true);
    const pointerAfterFailure = await getDocument("worldControl/activeSeason");
    assert.equal(pointerAfterFailure.data.seasonId, SOURCE_SEASON_ID);
    assert.equal(pointerAfterFailure.data.worldId, pointerBefore.data.worldId);
    assert.equal(failurePath.finalStatus, "VALIDATION_FAILED");

    const successPath = await runScheduledCase(SUCCESS_CANDIDATE_VERSION, reset2Receipt, false);
    const pointerAfterSuccess = await getDocument("worldControl/activeSeason");
    assert.equal(pointerAfterSuccess.data.seasonId, TARGET_SEASON_ID);
    assert.equal(pointerAfterSuccess.data.worldId, TARGET_WORLD_ID);
    assert.equal(pointerAfterSuccess.data.priorWorldId, pointerBefore.data.worldId);
    assert.equal(pointerAfterSuccess.data.resetOperationId, successPath.operationId);
    assert.equal(successPath.finalStatus, "OLD_SEASON_ARCHIVED");

    const archive = await getDocument(`seasonArchives/${SOURCE_SEASON_ID}`);
    assert.equal(archive.data.status, "RETIRED_READ_ONLY");
    assert.equal(archive.data.deleted, false);

    await setDocument("automaticSeasonReset/config", stagingControls("DISABLED_AFTER_REHEARSAL", false));
    restoredSchedules = await restoreJobSchedules();
    const result = {
      schemaVersion: "core-v2-auto-reset-1-scheduled-staging-v1",
      stagingProjectId: CONFIG.stagingProjectId,
      productionProjectId: CONFIG.productionProjectId,
      isolated: true,
      sourceReset2RunId: reset2Receipt.runId,
      sourceReset2ReceiptHash: reset2Receipt.receiptHash,
      failurePath: {
        ...failurePath,
        oldSeasonRemainsAuthoritative: pointerAfterFailure.data.seasonId === SOURCE_SEASON_ID,
        automaticCutoverAllowed: failurePath.goNoGo.automaticCutoverAllowed,
      },
      successPath: {
        ...successPath,
        pointerSeasonId: pointerAfterSuccess.data.seasonId,
        pointerWorldId: pointerAfterSuccess.data.worldId,
        priorWorldId: pointerAfterSuccess.data.priorWorldId,
        automaticCutoverAllowed: successPath.goNoGo.automaticCutoverAllowed,
        zeroHumanInterventionBetweenScheduledPrebuildAndCutover: true,
      },
      archive: archive.data,
      controlsDisabledAfterRehearsal: true,
      schedulerJobsRestored: restoredSchedules,
      productionMutationPerformed: false,
      productionProjectTargeted: false,
      productionDeploymentPerformed: false,
      completedAt: new Date().toISOString(),
    };
    result.receiptHash = automaticReset.hashValue(result);
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({
      failureStatus: result.failurePath.finalStatus,
      successStatus: result.successPath.finalStatus,
      pointerSeasonId: result.successPath.pointerSeasonId,
      controlsDisabled: result.controlsDisabledAfterRehearsal,
      receiptHash: result.receiptHash,
    }, null, 2));
    return result;
  } catch (error) {
    await setDocument("automaticSeasonReset/config", stagingControls("DISABLED_AFTER_FAILED_REHEARSAL", false)).catch(() => {});
    restoredSchedules = await restoreJobSchedules().catch(() => []);
    error.restoredSchedules = restoredSchedules;
    throw error;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({
  RESULT_PATH,
  STAGING_BOUNDARY,
  FAILURE_CANDIDATE_VERSION,
  SUCCESS_CANDIDATE_VERSION,
  PREBUILD_JOB,
  RESET_JOB,
  CATCH_UP_JOB,
  main,
});
