"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const automaticReset = require("./automatic-reset.js");

const PRODUCTION_PROJECT_ID = "crown-land-b15e0";
const CONFIG_PATH = "automaticSeasonReset/config";
const ACTIVE_POINTER_PATH = "worldControl/activeSeason";
const MAINTENANCE_PATH = "worldControl/seasonResetMaintenance";
const OPERATIONS_COLLECTION = "automaticSeasonResetOperations";
const CANDIDATES_COLLECTION = "automaticSeasonResetCandidates";
const RECEIPTS_COLLECTION = "automaticSeasonResetReceipts";
const ALERTS_COLLECTION = "automaticSeasonResetAlerts";

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

function projectEnvironment(projectId) {
  if (projectId === PRODUCTION_PROJECT_ID) return "PRODUCTION";
  if (/(?:^|-)stag(?:e|ing)(?:-|$)/.test(projectId)) return "STAGING";
  return "DEVELOPMENT";
}

function assertEnvironment(projectId, controls) {
  const observed = projectEnvironment(projectId);
  assert.equal(controls.environment, observed, `Automatic reset config environment ${controls.environment} does not match ${observed} project ${projectId}.`);
  if (observed === "PRODUCTION") assert.equal(projectId, PRODUCTION_PROJECT_ID);
  else assert.notEqual(projectId, PRODUCTION_PROJECT_ID);
  return observed;
}

function createFirebaseAutomaticResetAdapter(db, options = {}) {
  assert(db && typeof db.doc === "function" && typeof db.runTransaction === "function");
  const projectId = String(options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  assert(projectId, "Firebase automatic reset adapter requires an explicit project ID.");
  const invocationId = String(options.invocationId || randomToken());

  const operationRef = resetOperationId => db.collection(OPERATIONS_COLLECTION).doc(resetOperationId);
  const candidateRef = targetSeasonId => db.collection(CANDIDATES_COLLECTION).doc(targetSeasonId);

  async function getControls() {
    const snapshot = await db.doc(CONFIG_PATH).get();
    const controls = automaticReset.normalizeControls(snapshot.exists ? snapshot.data() : automaticReset.DEFAULT_CONTROLS);
    assertEnvironment(projectId, controls);
    return controls;
  }

  async function loadOperation(resetOperationId) {
    const snapshot = await operationRef(resetOperationId).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async function saveOperation(operation, options = {}) {
    const reference = operationRef(operation.resetOperationId);
    if (options.mustNotExist) {
      await db.runTransaction(async transaction => {
        const existing = await transaction.get(reference);
        if (existing.exists) throw Object.assign(new Error("reset-operation-already-exists"), { code: "already-exists" });
        transaction.create(reference, operation);
      });
      return operation;
    }
    await reference.set(operation, { merge: false });
    return operation;
  }

  async function acquireLease(identity, now, durationMs) {
    const reference = operationRef(identity.resetOperationId);
    const token = `${invocationId}:${randomToken()}`;
    const nowMs = now.getTime();
    const acquired = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw Object.assign(new Error("reset-operation-missing"), { code: "not-found" });
      const operation = snapshot.data();
      const leaseExpiryMs = Date.parse(operation.lease?.expiresAt || "");
      if (operation.lease?.token && Number.isFinite(leaseExpiryMs) && leaseExpiryMs > nowMs) return false;
      transaction.update(reference, {
        lease: {
          token,
          holder: invocationId,
          acquiredAt: now.toISOString(),
          expiresAt: new Date(nowMs + durationMs).toISOString(),
        },
      });
      return true;
    });
    return { acquired, token, holder: invocationId };
  }

  async function releaseLease(identity, lease) {
    if (!lease?.acquired) return;
    const reference = operationRef(identity.resetOperationId);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.data().lease?.token !== lease.token) return;
      transaction.update(reference, { lease: FieldValue.delete() });
    });
  }

  async function readCandidate(targetSeasonId) {
    const snapshot = await candidateRef(targetSeasonId).get();
    if (!snapshot.exists) throw Object.assign(new Error(`automatic-reset-candidate-missing:${targetSeasonId}`), { code: "integrity" });
    return snapshot.data();
  }

  async function prebuild({ identity, controls }) {
    automaticReset.assertAutomaticActionAllowed("generation", controls);
    automaticReset.assertAutomaticActionAllowed("publication", controls);
    const candidate = await readCandidate(identity.targetSeasonId);
    if (candidate.candidateVersion !== identity.candidateVersion) throw Object.assign(new Error("candidate-version-mismatch"), { code: "integrity" });
    const prebuild = candidate.prebuild || {};
    return {
      valid: prebuild.valid === true,
      coreMapCount: prebuild.coreMapCount,
      coreCityCount: prebuild.coreCityCount,
      objectiveCount: prebuild.objectiveCount,
      activeOuterRegionCount: prebuild.activeOuterRegionCount,
      standbyRegionCount: prebuild.standbyRegionCount,
      packageHash: prebuild.packageHash,
      topologyHash: prebuild.topologyHash,
      prebuiltAt: prebuild.prebuiltAt,
      candidateDocumentHash: automaticReset.hashValue(candidate),
    };
  }

  async function freeze({ identity }) {
    const pointer = await db.doc(ACTIVE_POINTER_PATH).get();
    if (!pointer.exists || pointer.data().seasonId !== identity.sourceSeasonId) {
      throw Object.assign(new Error("active-source-season-mismatch"), { code: "integrity" });
    }
    await db.doc(MAINTENANCE_PATH).set({
      state: "SEASON_RESET_IN_PROGRESS",
      operationId: identity.resetOperationId,
      sourceSeasonId: identity.sourceSeasonId,
      targetSeasonId: identity.targetSeasonId,
      worldMutationsEnabled: false,
      readOnlyLoginAllowed: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { frozen: true, pointerUpdateTime: pointer.updateTime.toDate().toISOString() };
  }

  async function finalSnapshot({ identity }) {
    const candidate = await readCandidate(identity.targetSeasonId);
    const backup = candidate.backup || {};
    if (backup.operationId !== identity.resetOperationId) throw Object.assign(new Error("backup-operation-mismatch"), { code: "integrity" });
    return { backup };
  }

  async function migrate({ identity, controls }) {
    automaticReset.assertAutomaticActionAllowed("migration", controls);
    const candidate = await readCandidate(identity.targetSeasonId);
    if (!candidate.migration) throw Object.assign(new Error("migration-receipt-missing"), { code: "integrity" });
    return candidate.migration;
  }

  async function validate({ identity }) {
    const candidate = await readCandidate(identity.targetSeasonId);
    if (!candidate.goEvidence) throw Object.assign(new Error("go-evidence-missing"), { code: "integrity" });
    return candidate.goEvidence;
  }

  async function cutover({ identity, controls, operation }) {
    automaticReset.assertAutomaticActionAllowed("cutover", controls);
    const candidate = await readCandidate(identity.targetSeasonId);
    const targetWorldId = String(candidate.targetWorldId || "").trim();
    if (!targetWorldId) throw Object.assign(new Error("candidate-target-world-id-missing"), { code: "integrity" });
    const pointerReference = db.doc(ACTIVE_POINTER_PATH);
    return db.runTransaction(async transaction => {
      const pointerSnapshot = await transaction.get(pointerReference);
      if (!pointerSnapshot.exists) throw Object.assign(new Error("active-season-pointer-missing"), { code: "integrity" });
      const pointer = pointerSnapshot.data();
      if (pointer.seasonId === identity.targetSeasonId && pointer.resetOperationId === identity.resetOperationId) {
        return { pointerChanged: true, replay: true, revision: pointer.revision };
      }
      if (pointer.seasonId !== identity.sourceSeasonId) throw Object.assign(new Error("active-source-season-mismatch"), { code: "integrity" });
      const next = {
        ...pointer,
        priorSeasonId: identity.sourceSeasonId,
        priorWorldId: pointer.worldId,
        seasonId: identity.targetSeasonId,
        worldId: targetWorldId,
        revision: Number(pointer.revision || 0) + 1,
        resetOperationId: identity.resetOperationId,
        candidateVersion: identity.candidateVersion,
        switchedAt: FieldValue.serverTimestamp(),
      };
      transaction.set(pointerReference, next, { merge: false });
      transaction.update(operationRef(identity.resetOperationId), {
        pointerTransactionRevision: next.revision,
        pointerTransactionCommittedAt: FieldValue.serverTimestamp(),
      });
      return { pointerChanged: true, replay: false, revision: next.revision };
    });
  }

  async function postCutoverSmoke({ identity }) {
    const candidate = await readCandidate(identity.targetSeasonId);
    return candidate.postCutoverSmoke || { passed: false, reason: "post-cutover-smoke-receipt-missing" };
  }

  async function archiveOldSeason({ identity, controls }) {
    await db.collection("seasonArchives").doc(identity.sourceSeasonId).set({
      sourceSeasonId: identity.sourceSeasonId,
      replacedBySeasonId: identity.targetSeasonId,
      resetOperationId: identity.resetOperationId,
      status: "RETIRED_READ_ONLY",
      mutationState: "READ_ONLY",
      deleted: false,
      retentionDays: controls.oldSeasonRetentionDays,
      archivedAt: FieldValue.serverTimestamp(),
    }, { merge: false });
    return { status: "RETIRED_READ_ONLY", deleted: false, retentionDays: controls.oldSeasonRetentionDays };
  }

  async function reopen({ identity }) {
    await db.doc(MAINTENANCE_PATH).set({
      state: "OFF",
      operationId: identity.resetOperationId,
      activeSeasonId: identity.targetSeasonId,
      worldMutationsEnabled: true,
      readOnlyLoginAllowed: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: false });
  }

  async function abort({ identity, pointerChanged, reason }) {
    if (pointerChanged) return;
    await db.doc(MAINTENANCE_PATH).set({
      state: "OFF_ABORTED",
      operationId: identity.resetOperationId,
      activeSeasonId: identity.sourceSeasonId,
      worldMutationsEnabled: true,
      readOnlyLoginAllowed: true,
      abortReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: false });
  }

  async function writeReceipt({ identity, operation, finalStatus }) {
    const candidate = await readCandidate(identity.targetSeasonId);
    const resetStartedAt = operation.history?.find(item => item.to === "RESET_FREEZE")?.at || operation.createdAt;
    const receipt = {
      schemaVersion: automaticReset.SCHEMA_VERSION,
      operationId: identity.resetOperationId,
      sourceSeasonId: identity.sourceSeasonId,
      targetSeasonId: identity.targetSeasonId,
      targetWorldId: String(candidate.targetWorldId || ""),
      scheduledResetAt: identity.scheduledResetAt,
      actualStartAt: resetStartedAt,
      actualEndAt: operation.updatedAt,
      candidateVersion: identity.candidateVersion,
      core: {
        packageHash: operation.prebuild?.packageHash || "",
        topologyHash: operation.prebuild?.topologyHash || "",
        mapCount: operation.prebuild?.coreMapCount || 0,
        cityCount: operation.prebuild?.coreCityCount || 0,
        objectiveCount: operation.prebuild?.objectiveCount || 0,
      },
      outerWorld: {
        activeRegionCount: operation.prebuild?.activeOuterRegionCount || 0,
        standbyRegionCount: operation.prebuild?.standbyRegionCount || 0,
        cityCapacityPerRegion: automaticReset.HARD_OUTER_CITY_CAPACITY,
      },
      migration: {
        playerCount: operation.migration?.playerCount || 0,
        clanCount: operation.migration?.clanCount || 0,
        ownedCommonGearCount: operation.migration?.ownedGearCount || 0,
        equippedCommonGearCount: operation.migration?.equippedGearCount || 0,
        duplicateProgressionCount: operation.migration?.duplicateGearCount || 0,
        gearChecksum: operation.migration?.gearHash || "",
      },
      backupReceipt: operation.snapshot?.backup || null,
      validation: operation.goNoGo || null,
      cutoverTransaction: operation.cutover || { pointerChanged: false },
      archiveResult: operation.archive || { status: "NOT_ARCHIVED", deleted: false },
      finalStatus,
      operationHash: automaticReset.hashValue(operation),
      immutable: true,
      productionMutationPerformed: projectEnvironment(projectId) === "PRODUCTION",
    };
    receipt.receiptHash = automaticReset.hashValue(receipt);
    const reference = db.collection(RECEIPTS_COLLECTION).doc(identity.resetOperationId);
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(reference);
      if (existing.exists) {
        assert.equal(existing.data().receiptHash, receipt.receiptHash, "Immutable automatic-reset receipt mismatch.");
        return;
      }
      transaction.create(reference, { ...receipt, createdAt: Timestamp.now() });
    });
    return receipt;
  }

  async function alert(severity, code, details) {
    const id = `${details?.identity?.resetOperationId || "unbound"}-${Date.now()}-${randomToken().slice(0, 8)}`;
    await db.collection(ALERTS_COLLECTION).doc(id).set({
      severity,
      code,
      detailsHash: automaticReset.hashValue(details || {}),
      projectId,
      environment: projectEnvironment(projectId),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return Object.freeze({
    projectId,
    invocationId,
    getControls,
    loadOperation,
    saveOperation,
    acquireLease,
    releaseLease,
    prebuild,
    freeze,
    finalSnapshot,
    migrate,
    validate,
    cutover,
    postCutoverSmoke,
    archiveOldSeason,
    reopen,
    abort,
    writeReceipt,
    alert,
  });
}

module.exports = Object.freeze({
  PRODUCTION_PROJECT_ID,
  CONFIG_PATH,
  ACTIVE_POINTER_PATH,
  MAINTENANCE_PATH,
  OPERATIONS_COLLECTION,
  CANDIDATES_COLLECTION,
  RECEIPTS_COLLECTION,
  ALERTS_COLLECTION,
  projectEnvironment,
  assertEnvironment,
  createFirebaseAutomaticResetAdapter,
});
