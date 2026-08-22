"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { googleRequest } = require("./map-scaling-phase-9/google-api.js");
const { runFirebase, parseFirebaseJson } = require("./map-scaling-phase-9/firebase-cli.js");
const prodReady = require("./core-v2-prod-ready-1/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-prod-ready-1", "PRODUCTION_RECOVERY_PROTECTION.json");
const PROJECT_ID = "crown-land-b15e0";
const DATABASE_ID = "(default)";
const DATABASE_NAME = `projects/${PROJECT_ID}/databases/${DATABASE_ID}`;
const AUTHORIZATION = `AUTHORIZE_PRODUCTION_RECOVERY_PROTECTION:${PROJECT_ID}:${DATABASE_ID}:PITR+DELETE_PROTECTION+DAILY_BACKUP_${prodReady.BACKUP_RETENTION_DAYS}D`;

function listSchedules() {
  return parseFirebaseJson(runFirebase([
    "firestore:backups:schedules:list",
    "--database", DATABASE_ID,
    "--project", PROJECT_ID,
    "--json",
  ]).stdout);
}

async function readDatabase() {
  return (await googleRequest(`https://firestore.googleapis.com/v1/${DATABASE_NAME}`, { quotaProjectId: PROJECT_ID })).body;
}

async function listReadyBackups() {
  const response = await googleRequest(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/locations/-/backups?pageSize=1000`,
    { quotaProjectId: PROJECT_ID },
  );
  return (response.body.backups || []).filter(backup => backup.database === DATABASE_NAME && backup.state === "READY");
}

function reportBefore(database, schedules) {
  return {
    targetProject: PROJECT_ID,
    targetDatabase: DATABASE_ID,
    current: {
      pitr: database.pointInTimeRecoveryEnablement,
      versionRetentionPeriod: database.versionRetentionPeriod,
      deleteProtection: database.deleteProtectionState,
      backupSchedules: schedules,
    },
    intended: {
      pitr: "POINT_IN_TIME_RECOVERY_ENABLED",
      recoveryWindow: "7 days after the retention window matures; approximately one hour immediately after enablement",
      deleteProtection: "DELETE_PROTECTION_ENABLED",
      backup: { recurrence: "DAILY", retentionDays: prodReady.BACKUP_RETENTION_DAYS, exactRunTime: "service-managed; Firestore does not expose a selectable daily run time" },
    },
    cost: {
      pitr: "Billed PITR storage, generally comparable to one additional database copy; no free tier.",
      backups: `Billed backup storage for each retained daily copy (up to ${prodReady.BACKUP_RETENTION_DAYS} days here).`,
      restore: "Billed by restored backup size; the isolated named database also incurs normal usage/storage charges while retained.",
      exactDollarEstimate: "Requires measured production database/backup GiB; do not invent a size estimate.",
    },
    operationalImplications: {
      pitr: "Enables minute-granularity recovery across the retained window without changing gameplay documents.",
      deleteProtection: "Blocks deleting the database resource; it does not prevent normal document deletes.",
      backups: "Creates service-managed daily backups; it does not affect live read/write performance.",
    },
    rollback: {
      pitr: `firebase firestore:databases:update "${DATABASE_ID}" --project ${PROJECT_ID} --point-in-time-recovery DISABLED`,
      deleteProtection: `firebase firestore:databases:update "${DATABASE_ID}" --project ${PROJECT_ID} --delete-protection DISABLED`,
      backup: "Delete the schedule by its verified ID; existing backups remain until expiry or a separate explicitly authorized deletion.",
    },
  };
}

function updateDatabaseProtection() {
  return parseFirebaseJson(runFirebase([
    "firestore:databases:update", DATABASE_ID,
    "--project", PROJECT_ID,
    "--point-in-time-recovery", "ENABLED",
    "--delete-protection", "ENABLED",
    "--json",
  ]).stdout);
}

function ensureDailySchedule(schedules) {
  const daily = schedules.find(schedule => schedule.dailyRecurrence);
  if (!daily) {
    parseFirebaseJson(runFirebase([
      "firestore:backups:schedules:create",
      "--database", DATABASE_ID,
      "--project", PROJECT_ID,
      "--recurrence", "DAILY",
      "--retention", `${prodReady.BACKUP_RETENTION_DAYS}d`,
      "--json",
    ]).stdout);
    return { action: "CREATED" };
  }
  const retentionSeconds = Number(String(daily.retention || "0s").replace(/s$/, ""));
  if (retentionSeconds !== prodReady.BACKUP_RETENTION_DAYS * 86400) {
    const scheduleName = String(daily.name || "");
    const id = scheduleName.split("/").at(-1);
    assert(scheduleName && id, "Existing daily backup schedule lacks an ID.");
    parseFirebaseJson(runFirebase([
      "firestore:backups:schedules:update", scheduleName,
      "--project", PROJECT_ID,
      "--retention", `${prodReady.BACKUP_RETENTION_DAYS}d`,
      "--json",
    ]).stdout);
    return { action: "RETENTION_UPDATED", id };
  }
  return { action: "UNCHANGED", id: String(daily.name || "").split("/").at(-1), name: daily.name };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const projectId = String(process.env.CROWNLANDS_PROD_READY_PROTECTION_PROJECT_ID || "").trim();
  assert.equal(projectId, PROJECT_ID, `Expected ${PROJECT_ID}.`);
  const [databaseBefore, schedulesBefore] = await Promise.all([readDatabase(), Promise.resolve(listSchedules())]);
  const before = reportBefore(databaseBefore, schedulesBefore);
  console.log(JSON.stringify({ mode: execute ? "EXECUTE_REQUESTED" : "DRY_RUN", authorizationRequired: AUTHORIZATION, before }, null, 2));

  if (!execute) {
    const result = {
      schemaVersion: "crownlands-prod-ready-1-protection-receipt-v1",
      status: "NOT_YET_CONFIGURED",
      mode: "DRY_RUN",
      authorizationRequired: AUTHORIZATION,
      before,
      mutationPerformed: false,
      gameplayDocumentMutationPerformed: false,
      checkedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  assert.equal(
    process.env.CROWNLANDS_PROD_READY_PROTECTION_AUTHORIZATION,
    AUTHORIZATION,
    "Exact production recovery-protection authorization is required.",
  );
  const databaseUpdate = updateDatabaseProtection();
  const scheduleUpdate = ensureDailySchedule(schedulesBefore);
  const [databaseAfter, schedulesAfter, readyBackups] = await Promise.all([readDatabase(), Promise.resolve(listSchedules()), listReadyBackups()]);
  const daily = schedulesAfter.find(schedule => schedule.dailyRecurrence);
  assert.equal(databaseAfter.pointInTimeRecoveryEnablement, "POINT_IN_TIME_RECOVERY_ENABLED");
  assert.equal(databaseAfter.deleteProtectionState, "DELETE_PROTECTION_ENABLED");
  assert(daily, "The daily backup schedule was not created.");
  assert.equal(Number(String(daily.retention || "0s").replace(/s$/, "")), prodReady.BACKUP_RETENTION_DAYS * 86400);
  const result = {
    schemaVersion: "crownlands-prod-ready-1-protection-receipt-v1",
    status: "CONFIGURED_VERIFIED",
    mode: "AUTHORIZED_PRODUCTION_PROTECTION",
    projectId: PROJECT_ID,
    database: DATABASE_ID,
    previousState: before.current,
    newState: {
      pitr: databaseAfter.pointInTimeRecoveryEnablement,
      versionRetentionPeriod: databaseAfter.versionRetentionPeriod,
      earliestVersionTime: databaseAfter.earliestVersionTime,
      deleteProtection: databaseAfter.deleteProtectionState,
      backupSchedule: daily,
      completedReadyBackupCount: readyBackups.length,
    },
    databaseUpdate,
    scheduleUpdate,
    verification: "PASS",
    gameplayDocumentMutationPerformed: false,
    infrastructureMutationPerformed: true,
    configuredAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) main().catch(error => {
  console.error(`${error.code || "prod-ready-protection-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});

module.exports = Object.freeze({ RESULT_PATH, AUTHORIZATION, main, reportBefore });
