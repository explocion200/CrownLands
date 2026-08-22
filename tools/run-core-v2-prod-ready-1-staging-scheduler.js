"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CONFIG, requireMutationConfirmation, environmentBanner } = require("./map-scaling-phase-9/environment.js");
const { googleRequest } = require("./map-scaling-phase-9/google-api.js");
const { getDocument, setDocument } = require("./map-scaling-phase-9/staging-api.js");
const automaticReset = require("../functions-auto-reset/automatic-reset.js");
const autoResetStudy = require("./core-v2-auto-reset-1/architecture.js");
const prodReady = require("./core-v2-prod-ready-1/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-prod-ready-1", "SCHEDULED_STAGING_REHEARSAL.json");
const RESET_2_STAGING_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-2", "STAGING_DRESS_REHEARSAL.json");
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

function sleep(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

function parseSeasonId(seasonId) {
  const match = String(seasonId || "").match(/^season-(\d{4})-(\d{2})$/);
  assert(match, `Unsupported staging season ID ${seasonId}.`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

function seasonId(date) { return `season-${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }

function nextSeason(sourceSeasonId) {
  const boundary = parseSeasonId(sourceSeasonId);
  boundary.setUTCMonth(boundary.getUTCMonth() + 1);
  return { targetSeasonId: seasonId(boundary), boundary: boundary.toISOString() };
}

function cronAt(date) { return `${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`; }

function nextMinute(offsetMinutes) {
  const date = new Date();
  date.setUTCSeconds(0, 0);
  date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
  return date;
}

async function patchJobSchedule(jobName, schedule) {
  const result = await googleRequest(`https://cloudscheduler.googleapis.com/v1/${jobName}?updateMask=schedule,timeZone`, {
    method: "PATCH",
    quotaProjectId: CONFIG.stagingProjectId,
    body: { name: jobName, schedule, timeZone: automaticReset.RESET_TIME_ZONE },
  });
  assert.equal(result.body.schedule, schedule);
  return { name: jobName, schedule, state: result.body.state, timeZone: result.body.timeZone };
}

async function restoreJobSchedules() {
  const restored = [];
  for (const [jobName, schedule] of Object.entries(DEFAULT_JOB_SCHEDULES)) restored.push(await patchJobSchedule(jobName, schedule));
  return restored;
}

function stagingControls(candidateVersion, boundary, enabled) {
  return {
    schemaVersion: automaticReset.SCHEMA_VERSION,
    environment: "STAGING",
    monthlySeasonResetEnabled: enabled,
    automaticPrebuildEnabled: enabled,
    automaticCutoverEnabled: enabled,
    candidateVersion,
    stagingRehearsalBoundary: boundary,
    prebuildHoursBeforeBoundary: 24,
    standbyRegionTarget: 2,
    oldSeasonRetentionDays: 30,
    recoveryProtection: { backupRequired: true, pitrRequired: true, deleteProtectionRequired: true, approved: true },
    killSwitches: Object.fromEntries(automaticReset.KILL_SWITCHES.map(key => [key, !enabled])),
    synthetic: true,
    productionDataCopied: false,
    productionMutationPerformed: false,
  };
}

function buildEvidence(reset2Receipt, controls, hardFailure) {
  return autoResetStudy.buildGoEvidence({
    local: { result: {
      candidate: reset2Receipt.candidate,
      dataset: reset2Receipt.dataset,
      persistence: reset2Receipt.persistence,
      flags: reset2Receipt.flags,
      clans: reset2Receipt.clans,
      seasonalReset: reset2Receipt.seasonalReset,
      world: reset2Receipt.world,
      mainCity: reset2Receipt.mainCity,
    } },
    controls: automaticReset.normalizeControls(controls),
    hardFailure: hardFailure ? "persistence.gearLevelsMatch" : "",
  });
}

function candidateDocument({ candidateVersion, sourceSeasonId, targetSeasonId, targetWorldId, boundary, reset2Receipt, prodReadyCandidate, hardFailure }) {
  const controls = stagingControls(candidateVersion, boundary, true);
  const identity = automaticReset.operationIdentity({ sourceSeasonId, targetSeasonId, targetWorldId, scheduledResetAt: boundary, candidateVersion });
  return {
    schemaVersion: automaticReset.SCHEMA_VERSION,
    candidateVersion,
    prodReadyCandidateId: prodReadyCandidate.candidateId,
    prodReadySourceBundleHash: prodReadyCandidate.sourceBundleHash,
    sourceSeasonId,
    targetSeasonId,
    targetWorldId,
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
      packageHash: prodReadyCandidate.corePackageHash,
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
      coverage: "Isolated RESET-2 5,000-player staging package; production backup proof is a separate PROD-READY gate.",
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
    goEvidence: buildEvidence(reset2Receipt, controls, hardFailure),
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

async function waitFor(documentPath, predicate, label, timeoutMs = 300000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const document = await getDocument(documentPath);
    if (document && predicate(document.data)) return { document, waitedMs: Date.now() - startedAt };
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function schedulePair() {
  const prebuildAt = nextMinute(2);
  const resetAt = nextMinute(3);
  const jobs = [await patchJobSchedule(PREBUILD_JOB, cronAt(prebuildAt)), await patchJobSchedule(RESET_JOB, cronAt(resetAt))];
  console.log(`Scheduled prebuild ${prebuildAt.toISOString()} and reset ${resetAt.toISOString()}.`);
  return { prebuildAt: prebuildAt.toISOString(), resetAt: resetAt.toISOString(), jobs };
}

async function runCase(context, hardFailure) {
  const candidateVersion = hardFailure ? `${context.prodReadyCandidate.candidateId}-fault-validation` : context.prodReadyCandidate.candidateId;
  const candidate = candidateDocument({ ...context, candidateVersion, hardFailure });
  await setDocument("automaticSeasonReset/config", stagingControls(candidateVersion, context.boundary, true));
  await setDocument(`automaticSeasonResetCandidates/${context.targetSeasonId}`, candidate);
  const schedule = await schedulePair();
  const operationPath = `automaticSeasonResetOperations/${candidate.resetOperationId}`;
  const receiptPath = `automaticSeasonResetReceipts/${candidate.resetOperationId}`;
  const prebuild = await waitFor(operationPath, data => data.state === "PREBUILT" || automaticReset.FAILURE_STATES.has(data.state), `${candidateVersion} prebuild`);
  assert.equal(prebuild.document.data.state, "PREBUILT");
  const expectedFinal = hardFailure ? "VALIDATION_FAILED" : "OLD_SEASON_ARCHIVED";
  const receipt = await waitFor(receiptPath, data => data.finalStatus === expectedFinal, `${candidateVersion} final receipt`);
  const operation = await getDocument(operationPath);
  assert.equal(receipt.document.data.candidateVersion, candidateVersion);
  assert.equal(receipt.document.data.core.packageHash, context.prodReadyCandidate.corePackageHash);
  assert.equal(receipt.document.data.core.mapCount, 25);
  assert.equal(receipt.document.data.core.cityCount, 1480);
  assert.equal(receipt.document.data.migration.playerCount, 5000);
  return {
    candidateVersion,
    exactProdReadyCandidate: candidateVersion === context.prodReadyCandidate.candidateId,
    operationId: candidate.resetOperationId,
    finalStatus: receipt.document.data.finalStatus,
    operationState: operation.data.state,
    receiptHash: receipt.document.data.receiptHash,
    goNoGo: operation.data.goNoGo,
    schedule,
    prebuildWaitMs: prebuild.waitedMs,
    resetWaitMs: receipt.waitedMs,
  };
}

async function main() {
  const identity = requireMutationConfirmation(environmentInput());
  console.log(environmentBanner(identity));
  assert.equal(identity.targetProjectId, CONFIG.stagingProjectId);
  assert.notEqual(identity.targetProjectId, CONFIG.productionProjectId);
  const reset2Receipt = JSON.parse(fs.readFileSync(RESET_2_STAGING_PATH, "utf8"));
  assert.equal(reset2Receipt.passed, true);
  const prodReadyCandidate = prodReady.buildCandidateIdentity();
  const pointerBefore = await getDocument("worldControl/activeSeason");
  assert(pointerBefore && pointerBefore.data.environment === "STAGING" && pointerBefore.data.synthetic === true);
  const sourceSeasonId = pointerBefore.data.seasonId;
  const { targetSeasonId, boundary } = nextSeason(sourceSeasonId);
  const targetWorldId = `prod-ready-staging-world-${targetSeasonId.replace(/^season-/, "")}`;
  const context = { sourceSeasonId, targetSeasonId, targetWorldId, boundary, reset2Receipt, prodReadyCandidate };
  let restoredSchedules = [];
  try {
    const failurePath = await runCase(context, true);
    const pointerAfterFailure = await getDocument("worldControl/activeSeason");
    assert.equal(pointerAfterFailure.data.seasonId, sourceSeasonId);
    assert.equal(failurePath.finalStatus, "VALIDATION_FAILED");

    const successPath = await runCase(context, false);
    const pointerAfterSuccess = await getDocument("worldControl/activeSeason");
    assert.equal(pointerAfterSuccess.data.seasonId, targetSeasonId);
    assert.equal(pointerAfterSuccess.data.worldId, targetWorldId);
    assert.equal(successPath.exactProdReadyCandidate, true);
    assert.equal(successPath.finalStatus, "OLD_SEASON_ARCHIVED");
    const archive = await getDocument(`seasonArchives/${sourceSeasonId}`);
    assert.equal(archive.data.status, "RETIRED_READ_ONLY");
    assert.equal(archive.data.deleted, false);

    await setDocument("automaticSeasonReset/config", stagingControls("DISABLED_AFTER_PROD_READY_REHEARSAL", boundary, false));
    restoredSchedules = await restoreJobSchedules();
    const result = {
      schemaVersion: "crownlands-prod-ready-1-scheduled-staging-v1",
      stagingProjectId: CONFIG.stagingProjectId,
      productionProjectId: CONFIG.productionProjectId,
      isolated: true,
      prodReadyCandidateId: prodReadyCandidate.candidateId,
      prodReadySourceBundleHash: prodReadyCandidate.sourceBundleHash,
      sourceSeasonId,
      targetSeasonId,
      failurePath: { ...failurePath, oldSeasonRemainsAuthoritative: pointerAfterFailure.data.seasonId === sourceSeasonId, automaticCutoverAllowed: failurePath.goNoGo.automaticCutoverAllowed },
      successPath: { ...successPath, pointerSeasonId: pointerAfterSuccess.data.seasonId, pointerWorldId: pointerAfterSuccess.data.worldId, automaticCutoverAllowed: successPath.goNoGo.automaticCutoverAllowed, zeroHumanInterventionBetweenScheduledPrebuildAndCutover: true },
      archive: archive.data,
      controlsDisabledAfterRehearsal: true,
      schedulerJobsRestored: restoredSchedules,
      productionMutationPerformed: false,
      productionDeploymentPerformed: false,
      completedAt: new Date().toISOString(),
    };
    result.receiptHash = prodReady.hashValue(result);
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ failure: result.failurePath.finalStatus, success: result.successPath.finalStatus, exactCandidate: result.successPath.exactProdReadyCandidate, receiptHash: result.receiptHash }, null, 2));
    return result;
  } catch (error) {
    await setDocument("automaticSeasonReset/config", stagingControls("DISABLED_AFTER_FAILED_PROD_READY_REHEARSAL", boundary, false)).catch(() => {});
    restoredSchedules = await restoreJobSchedules().catch(() => []);
    error.restoredSchedules = restoredSchedules;
    throw error;
  }
}

if (require.main === module) main().catch(error => {
  console.error(`${error.code || "prod-ready-staging-scheduler-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});

module.exports = Object.freeze({ RESULT_PATH, PREBUILD_JOB, RESET_JOB, CATCH_UP_JOB, main });
