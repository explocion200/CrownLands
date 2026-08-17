"use strict";

const {
  CONFIG,
  requireDestructiveCleanupConfirmation,
  environmentBanner,
} = require("./environment");
const { listDocuments, setDocument } = require("./staging-api");
const { runFirebase } = require("./firebase-cli");

async function main() {
  const identity = requireDestructiveCleanupConfirmation({
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
    destructiveConfirmation: process.env.CROWNLANDS_PHASE9_DESTRUCTIVE_CONFIRMATION,
  });
  console.log(environmentBanner(identity));
  const root = `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}`;
  const [regions, markers] = await Promise.all([
    listDocuments(`${root}/regions`, { pageSize: 300 }),
    listDocuments(`${root}/publicationMarkers`, { pageSize: 300 }),
  ]);
  const generatedPublishedOrActive = regions.documents.filter(document => (
    document.data.worldLayer >= 1 && ["PUBLISHED", "ACTIVE"].includes(document.data.lifecycle)
  ));
  if (markers.documents.length || generatedPublishedOrActive.length) {
    throw new Error("Cleanup refused: a publication marker or generated PUBLISHED/ACTIVE region exists.");
  }
  const receiptId = `failed_rehearsal_cleanup_${Date.now()}`;
  await setDocument(`phase9Operations/${receiptId}`, {
    schemaVersion: "phase9-destructive-cleanup-receipt-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    target: `generatedWorlds/${CONFIG.syntheticWorldId}`,
    publicationMarkersChecked: true,
    publicationMarkerCount: markers.documents.length,
    generatedPublishedOrActiveCount: generatedPublishedOrActive.length,
    regionDocumentsObserved: regions.documents.length,
    reason: "remove failed unpublished rehearsal artifact before deterministic retry",
    destructiveConfirmationVerified: true,
    productionMutationPerformed: false,
    timestamp: new Date(),
  }, { mustNotExist: true });
  runFirebase([
    "firestore:delete",
    `generatedWorlds/${CONFIG.syntheticWorldId}`,
    "--recursive",
    "--force",
    "--project", identity.targetProjectId,
    "--database", CONFIG.firestoreDatabaseId,
  ], { capture: false });
  console.log(JSON.stringify({
    result: "PASS",
    environment: "STAGING",
    deletedTarget: `generatedWorlds/${CONFIG.syntheticWorldId}`,
    recoverability: "PITR-enabled staging Firestore",
    publicationMarkersDeleted: 0,
    generatedPublishedOrActiveRegionsDeleted: 0,
    productionMutationPerformed: false,
    receiptId,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-cleanup-error"}: ${error.message}`);
  process.exitCode = 1;
});
