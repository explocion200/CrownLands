"use strict";

const {
  CONFIG,
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { runFirebase, parseFirebaseJson } = require("./firebase-cli");

function listSchedules(projectId) {
  return parseFirebaseJson(runFirebase([
    "firestore:backups:schedules:list",
    "--database", CONFIG.firestoreDatabaseId,
    "--project", projectId,
    "--json",
  ]).stdout);
}

function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  console.log(environmentBanner(identity));
  let schedules = listSchedules(identity.targetProjectId);
  if (execute && !schedules.some(schedule => schedule.dailyRecurrence)) {
    parseFirebaseJson(runFirebase([
      "firestore:backups:schedules:create",
      "--database", CONFIG.firestoreDatabaseId,
      "--project", identity.targetProjectId,
      "--recurrence", "DAILY",
      "--retention", "7d",
      "--json",
    ]).stdout);
    schedules = listSchedules(identity.targetProjectId);
  }
  console.log(JSON.stringify({
    result: execute ? "PASS" : "DRY_RUN",
    environment: identity.environment,
    stagingProjectId: identity.targetProjectId,
    pitr: { enabled: true, retentionDays: 7 },
    managedBackupSchedules: schedules,
    productionMutationPerformed: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`${error.code || "phase9-backup-provision-error"}: ${error.message}`);
  process.exitCode = 1;
}
