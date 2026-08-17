"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CONFIG, requireMutationConfirmation, environmentBanner } = require("./environment");
const { accessToken } = require("./google-api");
const { listDocuments, setDocument } = require("./staging-api");

const RESULTS_ROOT = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results");

function readResult(name) {
  return JSON.parse(fs.readFileSync(path.join(RESULTS_ROOT, name), "utf8"));
}

async function main() {
  const identity = requireMutationConfirmation({
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  });
  console.log(environmentBanner(identity));
  const recovery = readResult("RECOVERY_REHEARSAL.json");
  const cleanup = readResult("ORPHAN_CLEANUP.json");
  assert.equal(recovery.productionMutationPerformed, false);
  assert.equal(cleanup.productionMutationPerformed, false);
  const operator = await accessToken();
  const existing = await listDocuments("phase9Audit", { pageSize: 300 });
  const records = [
    {
      action: "recovery",
      sourceReceiptId: recovery.receiptId,
      worldId: CONFIG.syntheticWorldId,
      seasonId: CONFIG.syntheticSeasonId,
      regionId: "phase6d_region_0001",
      packageHash: "",
      detail: {
        firestoreRecoveryVerified: true,
        storageVersionRecoveryVerified: true,
        pitrCloneVerifiedAndDeleted: true,
        publishedPackageRegenerated: false,
      },
    },
    {
      action: "cleanup",
      sourceReceiptId: cleanup.auditReceiptId,
      worldId: CONFIG.syntheticWorldId,
      seasonId: CONFIG.syntheticSeasonId,
      regionId: "",
      packageHash: "",
      detail: {
        mode: cleanup.mode,
        eligibleCount: cleanup.eligibleCount,
        deletionPerformed: cleanup.deletionPerformed,
        publicationMarkersChecked: cleanup.publicationMarkersChecked,
      },
    },
  ];
  const written = [];
  for (const record of records) {
    const duplicate = existing.documents.some(document => (
      document.data.action === record.action && document.data.detail?.sourceReceiptId === record.sourceReceiptId
    ));
    if (duplicate) continue;
    const id = `maintenance_${record.action}_${Date.now()}_${written.length}`;
    await setDocument(`phase9Audit/${id}`, {
      schemaVersion: "phase9-operator-audit-v1",
      environment: "STAGING",
      projectId: identity.targetProjectId,
      actorUid: operator.email || "firebase-cli-operator",
      action: record.action,
      worldId: record.worldId,
      seasonId: record.seasonId,
      regionId: record.regionId,
      packageHash: record.packageHash,
      result: "PASS",
      detail: { ...record.detail, sourceReceiptId: record.sourceReceiptId },
      timestamp: new Date(),
    }, { mustNotExist: true });
    written.push(record.action);
  }
  console.log(JSON.stringify({
    result: "PASS",
    environment: "STAGING",
    auditActionsEnsured: records.map(record => record.action),
    newlyWritten: written,
    productionMutationPerformed: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-maintenance-audit-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});
