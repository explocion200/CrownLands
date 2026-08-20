"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const DEFAULT_CONTROLS = require("./runtime-config.json");

const SCHEMA_VERSION = "crownlands-auto-reset-v1";
const RESET_TIME_ZONE = "Etc/UTC";
const MONTHLY_RESET_CRON = "0 0 1 * *";
const PREBUILD_COORDINATOR_CRON = "0 * * * *";
const CATCH_UP_CRON = "*/15 * * * *";
const DEFAULT_PREBUILD_HOURS = 24;
const MAX_TRANSIENT_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const LEASE_DURATION_MS = 15 * 60 * 1000;
const HARD_CORE_MAP_COUNT = 25;
const HARD_CORE_CITY_COUNT = 1480;
const HARD_OBJECTIVE_COUNT = 17;
const HARD_OUTER_CITY_CAPACITY = 40;
const HARD_STANDBY_TARGET = 2;
const HARD_MINIMUM_NPC_FOR_SPAWN = 15;
const OLD_SEASON_RETENTION_DAYS = 30;

const RESET_STATES = Object.freeze([
  "SCHEDULED",
  "PREBUILDING",
  "PREBUILT",
  "RESET_FREEZE",
  "FINAL_SNAPSHOT",
  "MIGRATING",
  "VALIDATING",
  "CUTOVER_READY",
  "CUTTING_OVER",
  "ACTIVE",
  "OLD_SEASON_ARCHIVED",
  "PREBUILD_FAILED",
  "RESET_ABORTED",
  "MIGRATION_FAILED",
  "VALIDATION_FAILED",
  "CUTOVER_FAILED",
  "POST_CUTOVER_EMERGENCY",
]);

const FAILURE_STATES = Object.freeze(new Set([
  "PREBUILD_FAILED",
  "RESET_ABORTED",
  "MIGRATION_FAILED",
  "VALIDATION_FAILED",
  "CUTOVER_FAILED",
  "POST_CUTOVER_EMERGENCY",
]));

const TERMINAL_STATES = Object.freeze(new Set([
  "OLD_SEASON_ARCHIVED",
  ...FAILURE_STATES,
]));

const ALLOWED_TRANSITIONS = Object.freeze({
  SCHEDULED: Object.freeze(["PREBUILDING", "PREBUILD_FAILED"]),
  PREBUILDING: Object.freeze(["PREBUILT", "PREBUILD_FAILED"]),
  PREBUILT: Object.freeze(["RESET_FREEZE", "RESET_ABORTED"]),
  RESET_FREEZE: Object.freeze(["FINAL_SNAPSHOT", "RESET_ABORTED"]),
  FINAL_SNAPSHOT: Object.freeze(["MIGRATING", "RESET_ABORTED"]),
  MIGRATING: Object.freeze(["VALIDATING", "MIGRATION_FAILED"]),
  VALIDATING: Object.freeze(["CUTOVER_READY", "VALIDATION_FAILED"]),
  CUTOVER_READY: Object.freeze(["CUTTING_OVER", "RESET_ABORTED"]),
  CUTTING_OVER: Object.freeze(["ACTIVE", "CUTOVER_FAILED"]),
  ACTIVE: Object.freeze(["OLD_SEASON_ARCHIVED", "POST_CUTOVER_EMERGENCY"]),
  OLD_SEASON_ARCHIVED: Object.freeze([]),
  PREBUILD_FAILED: Object.freeze([]),
  RESET_ABORTED: Object.freeze([]),
  MIGRATION_FAILED: Object.freeze([]),
  VALIDATION_FAILED: Object.freeze([]),
  CUTOVER_FAILED: Object.freeze([]),
  POST_CUTOVER_EMERGENCY: Object.freeze([]),
});

const KILL_SWITCHES = Object.freeze([
  "prebuild",
  "reset",
  "migration",
  "cutover",
  "generation",
  "publication",
  "activation",
  "expansion",
]);

const TRANSIENT_ERROR_CODES = Object.freeze(new Set([
  "aborted",
  "deadline-exceeded",
  "resource-exhausted",
  "unavailable",
  "storage-temporary",
  "worker-temporary",
]));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  assert(Number.isFinite(date.getTime()), `Invalid date ${value}.`);
  return date;
}

function formatMonth(value) {
  return String(value).padStart(2, "0");
}

function seasonIdForBoundary(value) {
  const date = asDate(value);
  assert.equal(date.getUTCDate(), 1, "Season boundary must be the first UTC day of a month.");
  assert.equal(date.getUTCHours(), 0, "Season boundary must be at 00:00 UTC.");
  assert.equal(date.getUTCMinutes(), 0, "Season boundary must be at 00:00 UTC.");
  return `season-${date.getUTCFullYear()}-${formatMonth(date.getUTCMonth() + 1)}`;
}

function boundaryForSeasonId(seasonId) {
  const match = /^season-(\d{4})-(\d{2})$/.exec(String(seasonId || ""));
  assert(match, `Invalid monthly season ID ${seasonId}.`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  assert(monthIndex >= 0 && monthIndex <= 11, `Invalid monthly season ID ${seasonId}.`);
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function addUtcMonths(value, delta) {
  const date = asDate(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1, 0, 0, 0, 0));
}

function boundaryAtOrBefore(value) {
  const date = asDate(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function nextMonthlyBoundary(value) {
  const date = asDate(value);
  const current = boundaryAtOrBefore(date);
  return date.getTime() === current.getTime() ? current : addUtcMonths(current, 1);
}

function buildMonthlySchedule(value, prebuildHours = DEFAULT_PREBUILD_HOURS) {
  assert(Number.isInteger(prebuildHours) && prebuildHours > 0 && prebuildHours <= 168);
  const now = asDate(value);
  const resetAt = nextMonthlyBoundary(now);
  const sourceBoundary = addUtcMonths(resetAt, -1);
  return Object.freeze({
    timeZone: RESET_TIME_ZONE,
    sourceSeasonId: seasonIdForBoundary(sourceBoundary),
    targetSeasonId: seasonIdForBoundary(resetAt),
    nextResetAt: resetAt.toISOString(),
    prebuildAt: new Date(resetAt.getTime() - prebuildHours * 60 * 60 * 1000).toISOString(),
    prebuildHoursBeforeBoundary: prebuildHours,
  });
}

function normalizeControls(raw = DEFAULT_CONTROLS) {
  const source = raw && typeof raw === "object" ? raw : {};
  const recovery = source.recoveryProtection || {};
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    environment: String(source.environment || "PRODUCTION").toUpperCase(),
    monthlySeasonResetEnabled: source.monthlySeasonResetEnabled === true,
    automaticPrebuildEnabled: source.automaticPrebuildEnabled === true,
    automaticCutoverEnabled: source.automaticCutoverEnabled === true,
    candidateVersion: String(source.candidateVersion || "UNAUTHORIZED"),
    prebuildHoursBeforeBoundary: Number.isInteger(source.prebuildHoursBeforeBoundary)
      ? source.prebuildHoursBeforeBoundary
      : DEFAULT_PREBUILD_HOURS,
    standbyRegionTarget: Number.isInteger(source.standbyRegionTarget)
      ? source.standbyRegionTarget
      : HARD_STANDBY_TARGET,
    oldSeasonRetentionDays: Number.isInteger(source.oldSeasonRetentionDays)
      ? source.oldSeasonRetentionDays
      : OLD_SEASON_RETENTION_DAYS,
    stagingRehearsalBoundary: String(source.stagingRehearsalBoundary || ""),
    recoveryProtection: Object.freeze({
      backupRequired: recovery.backupRequired !== false,
      pitrRequired: recovery.pitrRequired !== false,
      deleteProtectionRequired: recovery.deleteProtectionRequired !== false,
      approved: recovery.approved === true,
    }),
    killSwitches: Object.freeze(Object.fromEntries(KILL_SWITCHES.map(key => [
      key,
      source.killSwitches?.[key] !== false,
    ]))),
  });
}

function assertAutomaticActionAllowed(action, controls) {
  const normalized = normalizeControls(controls);
  assert(KILL_SWITCHES.includes(action), `Unknown automatic-reset action ${action}.`);
  if (!normalized.monthlySeasonResetEnabled) throw Object.assign(new Error("monthly-season-reset-disabled"), { code: "failed-precondition" });
  if (action === "prebuild" && !normalized.automaticPrebuildEnabled) throw Object.assign(new Error("automatic-prebuild-disabled"), { code: "failed-precondition" });
  if (action === "cutover" && !normalized.automaticCutoverEnabled) throw Object.assign(new Error("automatic-cutover-disabled"), { code: "failed-precondition" });
  if (normalized.killSwitches[action]) throw Object.assign(new Error(`${action}-kill-switch-engaged`), { code: "failed-precondition" });
  if (normalized.environment === "PRODUCTION" && !normalized.recoveryProtection.approved) {
    throw Object.assign(new Error("production-recovery-protection-not-approved"), { code: "failed-precondition" });
  }
  return normalized;
}

function assertTransition(from, to) {
  assert(RESET_STATES.includes(from), `Unknown reset state ${from}.`);
  assert(RESET_STATES.includes(to), `Unknown reset state ${to}.`);
  assert(ALLOWED_TRANSITIONS[from].includes(to), `Illegal automatic reset transition ${from} -> ${to}.`);
  return true;
}

function transitionOperation(operation, to, at = new Date()) {
  const from = operation.state;
  assertTransition(from, to);
  return {
    ...operation,
    state: to,
    updatedAt: asDate(at).toISOString(),
    history: [...(operation.history || []), { from, to, at: asDate(at).toISOString() }],
  };
}

function operationIdentity({ sourceSeasonId, targetSeasonId, scheduledResetAt, candidateVersion }) {
  const resetAt = asDate(scheduledResetAt);
  assert.equal(seasonIdForBoundary(resetAt), targetSeasonId);
  assert.equal(seasonIdForBoundary(addUtcMonths(resetAt, -1)), sourceSeasonId);
  const identity = {
    sourceSeasonId,
    targetSeasonId,
    scheduledResetAt: resetAt.toISOString(),
    candidateVersion,
  };
  return Object.freeze({
    ...identity,
    resetOperationId: `monthly-reset-${hashValue(identity).slice(0, 24)}`,
  });
}

function classifyFailure(error) {
  const code = String(error?.code || "unknown").toLowerCase();
  return {
    code,
    classification: TRANSIENT_ERROR_CODES.has(code) ? "TRANSIENT" : "INTEGRITY",
    message: String(error?.message || error || "unknown failure"),
  };
}

async function runWithRetry(operation, options = {}) {
  const maximumAttempts = options.maximumAttempts || MAX_TRANSIENT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? RETRY_BASE_DELAY_MS;
  const wait = options.wait || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const attempts = [];
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const value = await operation(attempt);
      return { value, attempts, attemptCount: attempt };
    } catch (error) {
      const failure = classifyFailure(error);
      attempts.push({ attempt, ...failure });
      if (failure.classification !== "TRANSIENT" || attempt === maximumAttempts) throw Object.assign(error, { retryAttempts: attempts });
      await wait(baseDelayMs * (2 ** (attempt - 1)));
    }
  }
  throw new Error("retry-loop-exhausted");
}

const GO_CHECKS = Object.freeze([
  ["environment.correctProject", value => value === true],
  ["environment.correctCurrentSeason", value => value === true],
  ["environment.expectedSchedulerInvocation", value => value === true],
  ["environment.duplicateResetLockSafe", value => value === true],
  ["environment.expectedCandidateVersion", value => value === true],
  ["backup.completed", value => value === true],
  ["backup.receiptValid", value => value === true],
  ["backup.recoveryProtectionApproved", value => value === true],
  ["core.mapCount", value => value === HARD_CORE_MAP_COUNT],
  ["core.cityCount", value => value === HARD_CORE_CITY_COUNT],
  ["core.packageHashValid", value => value === true],
  ["core.objectiveCount", value => value === HARD_OBJECTIVE_COUNT],
  ["core.objectiveCoordinatesValid", value => value === true],
  ["core.topologyValid", value => value === true],
  ["core.allSpawnIneligible", value => value === true],
  ["outer.requiredActiveCapacityExists", value => value === true],
  ["outer.allRegionsHave40Cities", value => value === true],
  ["outer.standbyRegionCount", value => value === HARD_STANDBY_TARGET],
  ["outer.edgeContractsValid", value => value === true],
  ["outer.clockwiseAllocationValid", value => value === true],
  ["persistence.exactPlayerCountProcessed", value => value === true],
  ["persistence.flagsMatch", value => value === true],
  ["persistence.clansMatch", value => value === true],
  ["persistence.ownedCommonGearMatches", value => value === true],
  ["persistence.equippedCommonGearMatches", value => value === true],
  ["persistence.gearLevelsMatch", value => value === true],
  ["persistence.gearUpgradesMatch", value => value === true],
  ["persistence.gearDuplicateProgressionMatches", value => value === true],
  ["resetState.bagConsumablesMigrated", value => value === 0],
  ["resetState.oldCityOwnershipMigrated", value => value === 0],
  ["resetState.oldMarchesMigrated", value => value === 0],
  ["resetState.oldRalliesMigrated", value => value === 0],
  ["resetState.oldReinforcementsMigrated", value => value === 0],
  ["resetState.oldObjectiveOwnershipMigrated", value => value === 0],
  ["resetState.oldMainCityAssignmentsMigrated", value => value === 0],
  ["resetState.prohibitedSeasonalStateRemaining", value => value === 0],
  ["security.mainCityRestrictionActive", value => value === true],
  ["security.environmentGuardActive", value => value === true],
  ["security.unauthorizedCutoverPaths", value => value === 0],
]);

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function evaluateGoNoGo(evidence) {
  const checks = GO_CHECKS.map(([name, predicate]) => {
    const actual = getPath(evidence, name);
    const passed = predicate(actual);
    return { name, actual, passed };
  });
  const failures = checks.filter(check => !check.passed);
  return Object.freeze({
    automaticCutoverAllowed: failures.length === 0,
    hardCheckCount: checks.length,
    passedCheckCount: checks.length - failures.length,
    failedCheckCount: failures.length,
    failures,
    checks,
    receiptHash: hashValue(checks),
  });
}

function alertPolicy() {
  return Object.freeze({
    INFO: Object.freeze(["prebuild-started", "prebuild-complete", "freeze-started", "cutover-complete", "old-season-archived"]),
    WARNING: Object.freeze(["transient-retry", "standby-below-target", "scheduler-late-1m", "reset-runtime-warning"]),
    CRITICAL: Object.freeze([
      "prebuild-failure", "backup-failure", "migration-failure", "pagination-stall", "gear-mismatch",
      "clan-mismatch", "flag-mismatch", "unexpected-consumable-persistence", "core-count-mismatch",
      "city-count-mismatch", "topology-mismatch", "objective-mismatch", "reset-lock-conflict",
      "pointer-cutover-failure", "scheduler-missed", "reset-runtime-critical", "post-cutover-smoke-failure",
    ]),
    runtimeSeconds: Object.freeze({ warning: 900, critical: 1800 }),
    paginationNoProgressSeconds: Object.freeze({ warning: 120, critical: 300 }),
    standbyRegionCount: Object.freeze({ warningBelow: 2, criticalBelow: 1 }),
  });
}

function createScheduledOperation(identity, now = new Date()) {
  const at = asDate(now).toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    ...identity,
    state: "SCHEDULED",
    createdAt: at,
    updatedAt: at,
    history: [],
    immutableReceiptWritten: false,
    productionMutationPerformed: false,
  };
}

function requireAdapter(adapter) {
  const methods = [
    "getControls", "loadOperation", "saveOperation", "acquireLease", "releaseLease", "prebuild",
    "freeze", "finalSnapshot", "migrate", "validate", "cutover", "postCutoverSmoke", "archiveOldSeason",
    "reopen", "abort", "writeReceipt", "alert",
  ];
  methods.forEach(method => assert.equal(typeof adapter?.[method], "function", `Automatic reset adapter is missing ${method}().`));
  return adapter;
}

function createAutomaticResetController(rawAdapter) {
  const adapter = requireAdapter(rawAdapter);

  async function saveTransition(operation, nextState, now) {
    const next = transitionOperation(operation, nextState, now);
    await adapter.saveOperation(next);
    return next;
  }

  async function handlePrebuild(request) {
    const now = asDate(request.now || new Date());
    const controls = assertAutomaticActionAllowed("prebuild", await adapter.getControls());
    const identity = operationIdentity({ ...request, candidateVersion: request.candidateVersion || controls.candidateVersion });
    let operation = await adapter.loadOperation(identity.resetOperationId);
    if (operation?.state === "PREBUILT" || operation?.state === "OLD_SEASON_ARCHIVED") {
      return { status: "DUPLICATE_SAFE_EXIT", operation, duplicate: true };
    }
    if (!operation) {
      operation = createScheduledOperation(identity, now);
      await adapter.saveOperation(operation, { mustNotExist: true });
    }
    const lease = await adapter.acquireLease(identity, now, LEASE_DURATION_MS);
    if (!lease.acquired) return { status: "DUPLICATE_SAFE_EXIT", operation: await adapter.loadOperation(identity.resetOperationId), duplicate: true };
    try {
      operation = await adapter.loadOperation(identity.resetOperationId);
      if (operation.state === "SCHEDULED") operation = await saveTransition(operation, "PREBUILDING", now);
      assert.equal(operation.state, "PREBUILDING");
      const retried = await runWithRetry(attempt => adapter.prebuild({ identity, controls, attempt }), request.retryOptions);
      const prebuild = retried.value;
      const valid = prebuild?.valid === true
        && prebuild.coreMapCount === HARD_CORE_MAP_COUNT
        && prebuild.coreCityCount === HARD_CORE_CITY_COUNT
        && prebuild.objectiveCount === HARD_OBJECTIVE_COUNT
        && prebuild.standbyRegionCount === HARD_STANDBY_TARGET;
      if (!valid) throw Object.assign(new Error("prebuild-integrity-validation-failed"), { code: "integrity" });
      operation = { ...operation, prebuild, retry: { attemptCount: retried.attemptCount, attempts: retried.attempts } };
      operation = await saveTransition(operation, "PREBUILT", request.completedAt || now);
      await adapter.alert("INFO", "prebuild-complete", { identity, operation });
      return { status: "PREBUILT", operation, duplicate: false };
    } catch (error) {
      const current = await adapter.loadOperation(identity.resetOperationId);
      if (current && ALLOWED_TRANSITIONS[current.state]?.includes("PREBUILD_FAILED")) {
        operation = await saveTransition({ ...current, failure: classifyFailure(error) }, "PREBUILD_FAILED", now);
      }
      await adapter.alert("CRITICAL", "prebuild-failure", { identity, failure: classifyFailure(error) });
      return { status: "PREBUILD_FAILED", operation, failure: classifyFailure(error) };
    } finally {
      await adapter.releaseLease(identity, lease);
    }
  }

  async function handleReset(request) {
    const now = asDate(request.now || new Date());
    const controls = assertAutomaticActionAllowed("reset", await adapter.getControls());
    assertAutomaticActionAllowed("migration", controls);
    assertAutomaticActionAllowed("cutover", controls);
    const identity = operationIdentity({ ...request, candidateVersion: request.candidateVersion || controls.candidateVersion });
    let operation = await adapter.loadOperation(identity.resetOperationId);
    if (operation?.state === "OLD_SEASON_ARCHIVED") return { status: "DUPLICATE_SAFE_EXIT", operation, duplicate: true };
    if (!operation || operation.state !== "PREBUILT") {
      await adapter.alert("CRITICAL", "scheduler-missed", { identity, reason: "candidate-not-prebuilt" });
      return { status: "RESET_ABORTED", oldSeasonRemainsAuthoritative: true, reason: "candidate-not-prebuilt" };
    }
    const lease = await adapter.acquireLease(identity, now, LEASE_DURATION_MS);
    if (!lease.acquired) return { status: "DUPLICATE_SAFE_EXIT", operation: await adapter.loadOperation(identity.resetOperationId), duplicate: true };
    let pointerChanged = false;
    try {
      operation = await adapter.loadOperation(identity.resetOperationId);
      operation = await saveTransition(operation, "RESET_FREEZE", now);
      await adapter.freeze({ identity, controls });
      operation = await saveTransition(operation, "FINAL_SNAPSHOT", now);
      const snapshot = (await runWithRetry(attempt => adapter.finalSnapshot({ identity, controls, attempt }), request.retryOptions)).value;
      if (snapshot?.backup?.completed !== true || snapshot?.backup?.receiptValid !== true) {
        throw Object.assign(new Error("backup-integrity-failure"), { code: "integrity", failureState: "RESET_ABORTED" });
      }
      operation = { ...operation, snapshot };
      operation = await saveTransition(operation, "MIGRATING", now);
      const migration = (await runWithRetry(attempt => adapter.migrate({ identity, controls, snapshot, attempt }), request.retryOptions)).value;
      operation = { ...operation, migration };
      operation = await saveTransition(operation, "VALIDATING", now);
      const evidence = await adapter.validate({ identity, controls, snapshot, migration, operation });
      const goNoGo = evaluateGoNoGo(evidence);
      operation = { ...operation, goNoGo, evidenceHash: hashValue(evidence) };
      if (!goNoGo.automaticCutoverAllowed) {
        operation = await saveTransition(operation, "VALIDATION_FAILED", now);
        await adapter.abort({ identity, operation, pointerChanged: false, reason: "hard-go-no-go-failure" });
        await adapter.alert("CRITICAL", "validation-failure", { identity, failures: goNoGo.failures });
        const receipt = await adapter.writeReceipt({ identity, operation, finalStatus: "VALIDATION_FAILED" });
        return { status: "VALIDATION_FAILED", operation, receipt, oldSeasonRemainsAuthoritative: true };
      }
      operation = await saveTransition(operation, "CUTOVER_READY", now);
      operation = await saveTransition(operation, "CUTTING_OVER", now);
      const cutover = await adapter.cutover({ identity, controls, operation });
      pointerChanged = cutover?.pointerChanged === true;
      if (!pointerChanged) throw Object.assign(new Error("pointer-cutover-failed"), { code: "integrity", failureState: "CUTOVER_FAILED" });
      operation = { ...operation, cutover };
      operation = await saveTransition(operation, "ACTIVE", now);
      const smoke = await adapter.postCutoverSmoke({ identity, controls, operation });
      if (smoke?.passed !== true) {
        operation = await saveTransition({ ...operation, smoke }, "POST_CUTOVER_EMERGENCY", now);
        await adapter.alert("CRITICAL", "post-cutover-smoke-failure", { identity, smoke });
        const receipt = await adapter.writeReceipt({ identity, operation, finalStatus: "POST_CUTOVER_EMERGENCY" });
        return { status: "POST_CUTOVER_EMERGENCY", operation, receipt, destructiveRollbackAttempted: false };
      }
      const archive = await adapter.archiveOldSeason({ identity, controls, operation });
      operation = { ...operation, smoke, archive };
      operation = await saveTransition(operation, "OLD_SEASON_ARCHIVED", now);
      await adapter.reopen({ identity, controls, operation });
      const receipt = await adapter.writeReceipt({ identity, operation, finalStatus: "OLD_SEASON_ARCHIVED" });
      return { status: "OLD_SEASON_ARCHIVED", operation, receipt, duplicate: false };
    } catch (error) {
      const failure = classifyFailure(error);
      const current = await adapter.loadOperation(identity.resetOperationId);
      const desired = error.failureState
        || (current?.state === "MIGRATING" ? "MIGRATION_FAILED" : current?.state === "CUTTING_OVER" ? "CUTOVER_FAILED" : "RESET_ABORTED");
      if (current && ALLOWED_TRANSITIONS[current.state]?.includes(desired)) {
        operation = await saveTransition({ ...current, failure }, desired, now);
      }
      if (!pointerChanged) await adapter.abort({ identity, operation, pointerChanged: false, reason: failure.code });
      await adapter.alert("CRITICAL", pointerChanged ? "post-cutover-smoke-failure" : "reset-aborted", { identity, failure });
      const receipt = await adapter.writeReceipt({ identity, operation, finalStatus: operation?.state || desired });
      return { status: operation?.state || desired, operation, receipt, oldSeasonRemainsAuthoritative: !pointerChanged, failure };
    } finally {
      await adapter.releaseLease(identity, lease);
    }
  }

  return Object.freeze({ handlePrebuild, handleReset });
}

module.exports = Object.freeze({
  SCHEMA_VERSION,
  RESET_TIME_ZONE,
  MONTHLY_RESET_CRON,
  PREBUILD_COORDINATOR_CRON,
  CATCH_UP_CRON,
  DEFAULT_PREBUILD_HOURS,
  MAX_TRANSIENT_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  LEASE_DURATION_MS,
  HARD_CORE_MAP_COUNT,
  HARD_CORE_CITY_COUNT,
  HARD_OBJECTIVE_COUNT,
  HARD_OUTER_CITY_CAPACITY,
  HARD_STANDBY_TARGET,
  HARD_MINIMUM_NPC_FOR_SPAWN,
  OLD_SEASON_RETENTION_DAYS,
  RESET_STATES,
  FAILURE_STATES,
  TERMINAL_STATES,
  ALLOWED_TRANSITIONS,
  KILL_SWITCHES,
  DEFAULT_CONTROLS,
  hashValue,
  asDate,
  seasonIdForBoundary,
  boundaryForSeasonId,
  addUtcMonths,
  boundaryAtOrBefore,
  nextMonthlyBoundary,
  buildMonthlySchedule,
  normalizeControls,
  assertAutomaticActionAllowed,
  assertTransition,
  transitionOperation,
  operationIdentity,
  classifyFailure,
  runWithRetry,
  GO_CHECKS,
  evaluateGoNoGo,
  alertPolicy,
  createScheduledOperation,
  createAutomaticResetController,
});
