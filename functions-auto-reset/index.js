"use strict";

const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const automaticReset = require("./automatic-reset.js");
const { createFirebaseAutomaticResetAdapter } = require("./firebase-adapter.js");

if (!getApps().length) initializeApp();

function createRuntimeController(event) {
  const projectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  const invocationId = String(event?.id || event?.jobName || `scheduler-${Date.now()}`);
  const adapter = createFirebaseAutomaticResetAdapter(getFirestore(), { projectId, invocationId });
  return { adapter, controller: automaticReset.createAutomaticResetController(adapter) };
}

async function prebuildHandler(event) {
  const scheduleTime = new Date(event?.scheduleTime || Date.now());
  const { adapter, controller } = createRuntimeController(event);
  const controls = await adapter.getControls();
  if (!controls.monthlySeasonResetEnabled || !controls.automaticPrebuildEnabled || controls.killSwitches.prebuild) {
    return { status: "DISABLED_SAFE_EXIT" };
  }
  const rehearsalBoundary = controls.environment === "STAGING" && controls.stagingRehearsalBoundary
    ? new Date(controls.stagingRehearsalBoundary)
    : null;
  const schedule = rehearsalBoundary
    ? automaticReset.buildMonthlySchedule(rehearsalBoundary, controls.prebuildHoursBeforeBoundary)
    : automaticReset.buildMonthlySchedule(scheduleTime, controls.prebuildHoursBeforeBoundary);
  if (!rehearsalBoundary && (scheduleTime.getTime() < Date.parse(schedule.prebuildAt) || scheduleTime.getTime() >= Date.parse(schedule.nextResetAt))) {
    return { status: "NOT_DUE_SAFE_EXIT", schedule };
  }
  return controller.handlePrebuild({
    sourceSeasonId: schedule.sourceSeasonId,
    targetSeasonId: schedule.targetSeasonId,
    scheduledResetAt: schedule.nextResetAt,
    candidateVersion: controls.candidateVersion,
    now: scheduleTime,
  });
}

async function monthlyResetHandler(event) {
  const scheduleTime = new Date(event?.scheduleTime || Date.now());
  const { adapter, controller } = createRuntimeController(event);
  const controls = await adapter.getControls();
  if (!controls.monthlySeasonResetEnabled || !controls.automaticCutoverEnabled || controls.killSwitches.reset) {
    return { status: "DISABLED_SAFE_EXIT" };
  }
  const boundary = controls.environment === "STAGING" && controls.stagingRehearsalBoundary
    ? automaticReset.boundaryAtOrBefore(new Date(controls.stagingRehearsalBoundary))
    : automaticReset.boundaryAtOrBefore(scheduleTime);
  return controller.handleReset({
    sourceSeasonId: automaticReset.seasonIdForBoundary(automaticReset.addUtcMonths(boundary, -1)),
    targetSeasonId: automaticReset.seasonIdForBoundary(boundary),
    scheduledResetAt: boundary.toISOString(),
    candidateVersion: controls.candidateVersion,
    now: scheduleTime,
  });
}

async function catchUpHandler(event) {
  const scheduleTime = new Date(event?.scheduleTime || Date.now());
  const boundary = automaticReset.boundaryAtOrBefore(scheduleTime);
  const latenessMs = scheduleTime.getTime() - boundary.getTime();
  if (latenessMs < 60 * 1000) return { status: "NOT_IN_CATCH_UP_WINDOW" };
  return monthlyResetHandler(event);
}

exports.prebuildNextMonthlySeason = onSchedule({
  schedule: automaticReset.PREBUILD_COORDINATOR_CRON,
  timeZone: automaticReset.RESET_TIME_ZONE,
  region: "us-central1",
  retryCount: 0,
  maxInstances: 1,
  timeoutSeconds: 540,
}, prebuildHandler);

exports.runMonthlySeasonReset = onSchedule({
  schedule: automaticReset.MONTHLY_RESET_CRON,
  timeZone: automaticReset.RESET_TIME_ZONE,
  region: "us-central1",
  retryCount: 0,
  maxInstances: 1,
  timeoutSeconds: 540,
}, monthlyResetHandler);

exports.catchUpMonthlySeasonReset = onSchedule({
  schedule: automaticReset.CATCH_UP_CRON,
  timeZone: automaticReset.RESET_TIME_ZONE,
  region: "us-central1",
  retryCount: 0,
  maxInstances: 1,
  timeoutSeconds: 540,
}, catchUpHandler);

module.exports.prebuildHandler = prebuildHandler;
module.exports.monthlyResetHandler = monthlyResetHandler;
module.exports.catchUpHandler = catchUpHandler;
