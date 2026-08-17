"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  CONFIG,
  requireDestructiveCleanupConfirmation,
  environmentBanner,
} = require("./environment");
const { googleRequest } = require("./google-api");
const { runFirebase, parseFirebaseJson } = require("./firebase-cli");
const {
  setDocument,
  setRawDocument,
  getDocument,
  deleteDocument,
  listDocuments,
  downloadPublicObject,
} = require("./staging-api");

const RESULTS_ROOT = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results");
const RESULT_PATH = path.join(RESULTS_ROOT, "RECOVERY_REHEARSAL.json");
const RECOVERY_DATABASE = "phase9-pitr-recovery";
let backupToken = "";

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function downloadGeneration(objectPath, generation) {
  const token = await backupAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(CONFIG.storageBucket)}/o/${encodeURIComponent(objectPath)}?alt=media&generation=${encodeURIComponent(generation)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Archived object download failed ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function backupAccessToken() {
  if (backupToken) return backupToken;
  const serviceAccount = `phase9-backup@${CONFIG.stagingProjectId}.iam.gserviceaccount.com`;
  const response = await googleRequest(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,
    {
      method: "POST",
      quotaProjectId: CONFIG.stagingProjectId,
      body: { scope: ["https://www.googleapis.com/auth/cloud-platform"], lifetime: "1800s" },
    },
  );
  backupToken = response.body.accessToken;
  if (!backupToken) throw new Error("The backup service account access token was not issued.");
  return backupToken;
}

async function backupRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${await backupAccessToken()}`);
  if (options.body !== undefined && !Buffer.isBuffer(options.body)) headers.set("Content-Type", "application/json");
  const body = options.body === undefined ? undefined : Buffer.isBuffer(options.body) ? options.body : JSON.stringify(options.body);
  const response = await fetch(url, { method: options.method || "GET", headers, body });
  const raw = await response.text();
  let parsed = null;
  if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
  if (!response.ok && !(options.allowStatuses || []).includes(response.status)) {
    const error = new Error(`Backup API ${response.status}: ${JSON.stringify(parsed).slice(0, 2000)}`);
    error.status = response.status;
    throw error;
  }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: parsed };
}

async function restoreWithBackupService(objectPath, bytes, objectMetadata) {
  const start = await backupRequest(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(CONFIG.storageBucket)}/o?uploadType=resumable&ifGenerationMatch=0`,
    {
      method: "POST",
      headers: {
        "X-Upload-Content-Type": objectMetadata.contentType || "application/octet-stream",
        "X-Upload-Content-Length": String(bytes.length),
      },
      body: {
        name: objectPath,
        contentType: objectMetadata.contentType,
        cacheControl: objectMetadata.cacheControl,
        metadata: objectMetadata.metadata,
      },
    },
  );
  const sessionUrl = start.headers.location;
  if (!sessionUrl) throw new Error("Backup restore upload session was not created.");
  await backupRequest(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": objectMetadata.contentType, "Content-Length": String(bytes.length) },
    body: bytes,
  });
}

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
    assert.equal(controls.data[flag], false, `Recovery requires ${flag} OFF.`);
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
  assert(claimedCity, "A claimed ownership record is required for recovery proof.");
  const edgePath = `${worldRoot}/edgeContracts/${regionId}_east`;
  const edge = await getDocument(edgePath);
  assert.equal(edge.data.immutable, true);

  const snapshots = [
    [regionPath, region],
    [catalogPath, catalog],
    [packagePath, packageDocument],
    [claimedCity.path, claimedCity],
    [edgePath, edge],
  ];
  const receiptId = `recovery_${Date.now()}`;
  await setDocument(`phase9Operations/${receiptId}`, {
    schemaVersion: "phase9-recovery-receipt-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
    regionId,
    packageHash,
    controlsConfirmedOff: true,
    destructiveConfirmationVerified: true,
    snapshotDocumentPaths: snapshots.map(([documentPath]) => documentPath),
    publishedPackageRegenerationAllowed: false,
    productionMutationPerformed: false,
    startedAt: new Date(),
  }, { mustNotExist: true });

  let allDocumentsObservedMissing = false;
  try {
    for (const [documentPath] of snapshots) await deleteDocument(documentPath);
    const missingAfterDelete = await Promise.all(snapshots.map(([documentPath]) => getDocument(documentPath)));
    allDocumentsObservedMissing = missingAfterDelete.every(value => value === null);
    assert(allDocumentsObservedMissing);
  } finally {
    for (const [documentPath, snapshot] of snapshots) {
      if (!await getDocument(documentPath)) await setRawDocument(documentPath, snapshot.rawFields, { mustNotExist: true });
    }
  }

  const [restoredRegion, restoredCatalog, restoredPackage, restoredCity, restoredEdge] = await Promise.all(
    snapshots.map(([documentPath]) => getDocument(documentPath)),
  );
  assert.equal(restoredRegion.data.lifecycle, "ACTIVE");
  assert.equal(restoredCatalog.data.packageHash, packageHash);
  assert.equal(restoredPackage.data.packageHash, packageHash);
  assert.equal(restoredCity.data.ownerUid, claimedCity.data.ownerUid);
  assert.equal(restoredEdge.data.contractHash, edge.data.contractHash);

  const mapObject = packageDocument.data.objects.find(object => object.name === "map.webp");
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(CONFIG.storageBucket)}/o/${encodeURIComponent(mapObject.path)}`;
  const objectMetadata = (await backupRequest(metadataUrl)).body;
  assert.equal(objectMetadata.metadata.packageHash, packageHash);
  const liveMapBeforeDelete = await downloadPublicObject(mapObject.path);
  assert.equal(liveMapBeforeDelete.status, 200);
  assert.equal(liveMapBeforeDelete.sha256, mapObject.sha256);
  const archivedGeneration = objectMetadata.generation;
  let unavailable;
  let archivedBytes;
  try {
    await backupRequest(`${metadataUrl}?ifGenerationMatch=${encodeURIComponent(archivedGeneration)}`, {
      method: "DELETE",
    });
    unavailable = await downloadPublicObject(mapObject.path);
    assert([403, 404].includes(unavailable.status), `Expected the deleted live object to be unavailable; received ${unavailable.status}.`);
    archivedBytes = await downloadGeneration(mapObject.path, archivedGeneration);
    assert.equal(sha256(archivedBytes), mapObject.sha256);
  } finally {
    const current = await downloadPublicObject(mapObject.path);
    if (current.status !== 200) {
      await restoreWithBackupService(mapObject.path, archivedBytes || liveMapBeforeDelete.bytes, objectMetadata);
    }
  }
  const restoredMap = await downloadPublicObject(mapObject.path);
  assert.equal(restoredMap.status, 200);
  assert.equal(restoredMap.sha256, mapObject.sha256);
  const versions = await backupRequest(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(CONFIG.storageBucket)}/o?versions=true&prefix=${encodeURIComponent(mapObject.path)}`,
  );
  assert((versions.body.items || []).length >= 2);

  const databaseAdminUrl = `https://firestore.googleapis.com/v1/projects/${identity.targetProjectId}/databases/${RECOVERY_DATABASE}`;
  const cloneRoot = `https://firestore.googleapis.com/v1/projects/${identity.targetProjectId}/databases/${RECOVERY_DATABASE}/documents`;
  let cloneDatabase = await googleRequest(databaseAdminUrl, {
    quotaProjectId: identity.targetProjectId,
    allowStatuses: [404],
  });
  let cloneResult = { resumedExistingRestore: cloneDatabase.status === 200 };
  if (cloneDatabase.status === 404) {
    cloneResult = parseFirebaseJson(runFirebase([
      "firestore:databases:clone",
      `projects/${identity.targetProjectId}/databases/${CONFIG.firestoreDatabaseId}`,
      `projects/${identity.targetProjectId}/databases/${RECOVERY_DATABASE}`,
      "--project", identity.targetProjectId,
      "--json",
    ]).stdout);
  }
  const cloneDeadline = Date.now() + 10 * 60 * 1000;
  let clonedRegion;
  do {
    cloneDatabase = await googleRequest(databaseAdminUrl, {
      quotaProjectId: identity.targetProjectId,
      allowStatuses: [404],
    });
    clonedRegion = await googleRequest(`${cloneRoot}/${regionPath}`, {
      quotaProjectId: identity.targetProjectId,
      allowStatuses: [400, 404],
    });
    if (clonedRegion.status === 200) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  } while (Date.now() < cloneDeadline);
  assert.equal(clonedRegion?.status, 200, "PITR clone did not become readable within ten minutes.");
  if (cloneDatabase.body?.deleteProtectionState === "DELETE_PROTECTION_ENABLED") {
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

  const finalMarker = await getDocument(`${worldRoot}/publicationMarkers/${regionId}`);
  assert.equal(finalMarker.data.packageHash, packageHash);
  const result = {
    schemaVersion: "phase9-recovery-rehearsal-result-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    controlsRemainedOff: true,
    firestore: {
      documentsDeletedAndRestored: snapshots.map(([documentPath]) => documentPath),
      allDocumentsObservedMissing,
      activeLifecycleRestored: restoredRegion.data.lifecycle === "ACTIVE",
      catalogRestored: restoredCatalog.data.packageHash === packageHash,
      packageRecordRestored: restoredPackage.data.packageHash === packageHash,
      ownershipRestored: restoredCity.data.ownerUid === claimedCity.data.ownerUid,
      edgeContractRestored: restoredEdge.data.contractHash === edge.data.contractHash,
      publicationMarkerPreserved: finalMarker.data.packageHash === packageHash,
      pitrCloneCreatedAndVerified: true,
      pitrCloneDeletedAfterVerification: true,
      cloneOperation: cloneResult,
    },
    storage: {
      versioningEnabled: true,
      publishedMapMadeUnavailable: unavailable.status !== 200,
      archivedGenerationRecovered: archivedGeneration,
      archivedHashVerified: sha256(archivedBytes) === mapObject.sha256,
      liveObjectRestored: restoredMap.status === 200,
      restoredHashVerified: restoredMap.sha256 === mapObject.sha256,
      retainedVersionCount: (versions.body.items || []).length,
      publishedPackageRegenerated: false,
    },
    productionMutationPerformed: false,
    receiptId,
    completedAt: new Date().toISOString(),
  };
  await setDocument(`phase9Operations/${receiptId}`, {
    schemaVersion: "phase9-recovery-receipt-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
    regionId,
    packageHash,
    result: "PASS",
    firestoreRecoveryVerified: true,
    storageVersionRecoveryVerified: true,
    pitrCloneVerified: true,
    pitrCloneDeleted: true,
    publishedPackageRegenerated: false,
    productionMutationPerformed: false,
    completedAt: new Date(),
  });
  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    result: "PASS",
    environment: "STAGING",
    firestoreDocumentsRecovered: snapshots.length,
    storageVersionsObserved: result.storage.retainedVersionCount,
    pitrCloneVerifiedAndDeleted: true,
    publishedPackageRegenerated: false,
    productionMutationPerformed: false,
    resultPath: path.relative(process.cwd(), RESULT_PATH),
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-recovery-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});
