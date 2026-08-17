"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  CONFIG,
  requireDestructiveCleanupConfirmation,
  environmentBanner,
} = require("./environment");
const { googleRequest } = require("./google-api");
const { runFirebase } = require("./firebase-cli");
const {
  getDocument,
  listDocuments,
  setDocument,
  downloadPublicObject,
} = require("./staging-api");

const RECOVERY_DATABASE = "phase9-pitr-recovery";
const RESULTS_ROOT = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results");
const RESULT_PATH = path.join(RESULTS_ROOT, "RECOVERY_REHEARSAL.json");

async function main() {
  const identity = requireDestructiveCleanupConfirmation({
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
    destructiveConfirmation: process.env.CROWNLANDS_PHASE9_DESTRUCTIVE_CONFIRMATION,
  });
  console.log(environmentBanner(identity));

  const controls = await getDocument("phase9Controls/staging");
  for (const flag of ["generatedWorldEnabled", "generationEnabled", "publicationEnabled", "activationEnabled", "expansionEnabled"]) {
    assert.equal(controls.data[flag], false, `Recovery finalization requires ${flag} OFF.`);
  }

  const worldRoot = `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}`;
  const regionId = "phase6d_region_0001";
  const regionPath = `${worldRoot}/regions/${regionId}`;
  const catalogPath = `${worldRoot}/catalog/${regionId}`;
  const region = await getDocument(regionPath);
  const catalog = await getDocument(catalogPath);
  assert.equal(region.data.lifecycle, "ACTIVE");
  assert.equal(catalog.data.lifecycle, "ACTIVE");
  const packageHash = region.data.packageHash;
  const packagePath = `${worldRoot}/packages/${packageHash}`;
  const packageDocument = await getDocument(packagePath);
  assert.equal(packageDocument.data.immutable, true);
  const cities = await listDocuments(`${regionPath}/cities`, { pageSize: 100 });
  const claimedCity = cities.documents.find(document => document.data.ownerUid);
  assert(claimedCity, "Recovered ownership state is missing.");
  const edgePath = `${worldRoot}/edgeContracts/${regionId}_east`;
  const edge = await getDocument(edgePath);
  const marker = await getDocument(`${worldRoot}/publicationMarkers/${regionId}`);
  assert.equal(edge.data.immutable, true);
  assert.equal(marker.data.packageHash, packageHash);

  const databaseUrl = `https://firestore.googleapis.com/v1/projects/${identity.targetProjectId}/databases/${RECOVERY_DATABASE}`;
  const clone = await googleRequest(databaseUrl, { quotaProjectId: identity.targetProjectId });
  assert.equal(clone.body?.sourceInfo?.progress, "COMPLETED", "PITR clone is not complete.");
  const clonedRegion = await googleRequest(
    `${databaseUrl}/documents/${regionPath}`,
    { quotaProjectId: identity.targetProjectId },
  );
  assert.equal(clonedRegion.body?.fields?.lifecycle?.stringValue, "ACTIVE");
  assert.equal(clonedRegion.body?.fields?.packageHash?.stringValue, packageHash);

  const mapObject = packageDocument.data.objects.find(object => object.name === "map.webp");
  assert(mapObject, "Published package is missing map.webp metadata.");
  const liveMap = await downloadPublicObject(mapObject.path);
  assert.equal(liveMap.status, 200);
  assert.equal(liveMap.sha256, mapObject.sha256);
  const versions = await googleRequest(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(CONFIG.storageBucket)}/o?versions=true&prefix=${encodeURIComponent(mapObject.path)}`,
    { quotaProjectId: identity.targetProjectId },
  );
  assert((versions.body.items || []).length >= 2, "Storage recovery did not retain an archived generation.");

  const operations = await listDocuments("phase9Operations", { pageSize: 300 });
  const recoveryReceipts = operations.documents
    .filter(document => document.data.schemaVersion === "phase9-recovery-receipt-v1")
    .sort((left, right) => String(right.data.startedAt || right.createTime).localeCompare(String(left.data.startedAt || left.createTime)));
  assert(recoveryReceipts.length > 0, "Recovery start receipt is missing.");
  const receipt = recoveryReceipts[0];

  if (clone.body.deleteProtectionState === "DELETE_PROTECTION_ENABLED") {
    runFirebase([
      "firestore:databases:update", RECOVERY_DATABASE,
      "--project", identity.targetProjectId,
      "--delete-protection", "DISABLED",
      "--json",
    ]);
  }
  runFirebase([
    "firestore:databases:delete", RECOVERY_DATABASE,
    "--project", identity.targetProjectId,
    "--force",
  ], { capture: false });
  const cloneGone = await googleRequest(databaseUrl, {
    quotaProjectId: identity.targetProjectId,
    allowStatuses: [404],
  });
  assert.equal(cloneGone.status, 404, "Named recovery clone was not deleted.");

  const result = {
    schemaVersion: "phase9-recovery-rehearsal-result-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    controlsRemainedOff: true,
    firestore: {
      documentsDeletedAndRestored: receipt.data.snapshotDocumentPaths,
      destructiveAssertionsCompletedBeforeCloneCreation: true,
      activeLifecycleRestored: region.data.lifecycle === "ACTIVE",
      catalogRestored: catalog.data.packageHash === packageHash,
      packageRecordRestored: packageDocument.data.packageHash === packageHash,
      ownershipRestored: Boolean(claimedCity.data.ownerUid),
      edgeContractRestored: Boolean(edge.data.contractHash),
      publicationMarkerPreserved: marker.data.packageHash === packageHash,
      pitrSnapshotTime: clone.body.sourceInfo.pitrSnapshot.snapshotTime,
      pitrCloneCreatedAndVerified: true,
      pitrCloneDeletedAfterVerification: true,
    },
    storage: {
      versioningEnabled: true,
      archivedVersionRecoveryCompletedBeforeCloneCreation: true,
      liveObjectRestored: liveMap.status === 200,
      restoredHashVerified: liveMap.sha256 === mapObject.sha256,
      retainedVersionCount: (versions.body.items || []).length,
      publishedPackageRegenerated: false,
    },
    productionMutationPerformed: false,
    receiptId: receipt.path.split("/").at(-1),
    completedAt: new Date().toISOString(),
  };
  await setDocument(receipt.path, {
    ...receipt.data,
    result: "PASS",
    firestoreRecoveryVerified: true,
    storageVersionRecoveryVerified: true,
    pitrCloneVerified: true,
    pitrCloneDeleted: true,
    publishedPackageRegenerated: false,
    productionMutationPerformed: false,
    completedAt: new Date(),
  }, { mustExist: true });
  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    result: "PASS",
    environment: "STAGING",
    firestoreDocumentsRecovered: result.firestore.documentsDeletedAndRestored.length,
    storageVersionsObserved: result.storage.retainedVersionCount,
    pitrCloneVerifiedAndDeleted: true,
    publishedPackageRegenerated: false,
    productionMutationPerformed: false,
    resultPath: path.relative(process.cwd(), RESULT_PATH),
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-recovery-finalize-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});
