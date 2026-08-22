"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { googleRequest } = require("./map-scaling-phase-9/google-api.js");
const { runFirebase, parseFirebaseJson } = require("./map-scaling-phase-9/firebase-cli.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-prod-ready-1", "PRODUCTION_BACKUP_RESTORE_REHEARSAL.json");
const PROJECT_ID = "crown-land-b15e0";
const SOURCE_DATABASE_ID = "(default)";
const SOURCE_DATABASE_NAME = `projects/${PROJECT_ID}/databases/${SOURCE_DATABASE_ID}`;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function hashValue(value) { return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex"); }

async function listReadyBackups() {
  const response = await googleRequest(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/locations/-/backups?pageSize=1000`,
    { quotaProjectId: PROJECT_ID },
  );
  return (response.body.backups || []).filter(backup => backup.database === SOURCE_DATABASE_NAME && backup.state === "READY");
}

async function readDatabase(databaseId, allowStatuses = [404]) {
  return googleRequest(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(databaseId)}`,
    { quotaProjectId: PROJECT_ID, allowStatuses },
  );
}

async function runQuery(databaseId, collectionId, fields = [], readTime = "") {
  const body = { structuredQuery: {
    from: [{ collectionId, allDescendants: true }],
    ...(fields.length ? { select: { fields: fields.map(fieldPath => ({ fieldPath })) } } : {}),
  } };
  if (readTime) body.readTime = readTime;
  const response = await googleRequest(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(databaseId)}/documents:runQuery`,
    {
      method: "POST",
      quotaProjectId: PROJECT_ID,
      body,
    },
  );
  return (response.body || []).map(item => item.document).filter(Boolean);
}

async function waitForReady(databaseId) {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await readDatabase(databaseId);
    if (response.status === 200 && response.body?.uid && !response.body?.reconciling) return response.body;
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error(`Restore database ${databaseId} did not become READY within 30 minutes.`);
}

async function representativeInventory(databaseId, readTime = "") {
  const [players, clans, cities, worldControls, resetMetadata] = await Promise.all([
    runQuery(databaseId, "players", ["flag", "clanId", "gear", "Gear"], readTime),
    runQuery(databaseId, "clans", ["clanId", "members"], readTime),
    runQuery(databaseId, "cities", ["ownerUid", "ownerId", "regionId", "islandId"], readTime),
    runQuery(databaseId, "worldControl", [], readTime),
    runQuery(databaseId, "automaticSeasonReset", [], readTime),
  ]);
  const projection = documents => documents.map(document => ({
    path: String(document.name || "").split("/documents/").at(-1),
    fields: document.fields || {},
  })).sort((left, right) => left.path.localeCompare(right.path));
  return {
    playerCount: players.length,
    clanCount: clans.length,
    cityWorldRecordCount: cities.length,
    worldControlCount: worldControls.length,
    seasonResetMetadataCount: resetMetadata.length,
    playerHash: hashValue(projection(players)),
    clanHash: hashValue(projection(clans)),
    cityWorldHash: hashValue(projection(cities)),
    worldControlHash: hashValue(projection(worldControls)),
    representativeCollectionsReadable: players.length > 0 && clans.length > 0,
    sourceReadTime: readTime || null,
  };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const projectId = String(process.env.CROWNLANDS_PROD_READY_RESTORE_PROJECT_ID || "").trim();
  assert.equal(projectId, PROJECT_ID, `Expected ${PROJECT_ID}.`);
  const backups = await listReadyBackups();
  const requestedBackup = String(process.env.CROWNLANDS_PROD_READY_SOURCE_BACKUP || "").trim();
  const selectedBackup = requestedBackup ? backups.find(backup => backup.name === requestedBackup) : backups.at(-1);
  const requestedDestination = String(process.env.CROWNLANDS_PROD_READY_RESTORE_DATABASE || "").trim();
  const defaultDestination = `prod-ready-restore-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
  const destinationDatabase = requestedDestination || defaultDestination;
  assert(/^prod-ready-restore-[a-z0-9-]{8,40}$/.test(destinationDatabase), "Restore destination must be visibly isolated and use the prod-ready-restore-* prefix.");
  const authorization = selectedBackup
    ? `AUTHORIZE_ISOLATED_BACKUP_RESTORE:${PROJECT_ID}:${selectedBackup.name}:${destinationDatabase}`
    : "UNAVAILABLE_UNTIL_A_READY_PRODUCTION_BACKUP_EXISTS";

  if (!execute) {
    const result = {
      schemaVersion: "crownlands-prod-ready-1-backup-restore-v1",
      status: selectedBackup ? "READY_FOR_EXPLICIT_RESTORE_AUTHORIZATION" : "NOT_YET_CONFIGURED",
      mode: "DRY_RUN",
      projectId: PROJECT_ID,
      sourceDatabase: SOURCE_DATABASE_ID,
      readyProductionBackups: backups,
      selectedBackup: selectedBackup || null,
      isolatedDestinationDatabase: destinationDatabase,
      destinationIsLiveDefaultDatabase: false,
      authorizationRequired: authorization,
      cleanupPolicy: "Retain the isolated named database through review, then delete only under a separate destructive-cleanup authorization. Never delete the source backup.",
      sourceBackupDeletionAllowed: false,
      liveDatabaseMutationPerformed: false,
      checkedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  assert(selectedBackup, "A READY production backup is required.");
  assert.equal(process.env.CROWNLANDS_PROD_READY_RESTORE_AUTHORIZATION, authorization, "Exact isolated-restore authorization is required.");
  const existing = await readDatabase(destinationDatabase);
  assert.equal(existing.status, 404, `Restore destination ${destinationDatabase} already exists.`);
  assert(selectedBackup.snapshotTime, "The selected backup must expose an authoritative snapshotTime.");
  const expectedInventory = await representativeInventory(SOURCE_DATABASE_ID, selectedBackup.snapshotTime);
  assert.equal(expectedInventory.representativeCollectionsReadable, true);
  const restoreOperation = parseFirebaseJson(runFirebase([
    "firestore:databases:restore",
    "--project", PROJECT_ID,
    "--backup", selectedBackup.name,
    "--database", destinationDatabase,
    "--json",
  ]).stdout);
  const restoredDatabase = await waitForReady(destinationDatabase);
  assert.notEqual(restoredDatabase.name, SOURCE_DATABASE_NAME);
  const inventory = await representativeInventory(destinationDatabase);
  assert.equal(inventory.representativeCollectionsReadable, true);
  const comparable = value => ({
    playerCount: value.playerCount,
    clanCount: value.clanCount,
    cityWorldRecordCount: value.cityWorldRecordCount,
    worldControlCount: value.worldControlCount,
    seasonResetMetadataCount: value.seasonResetMetadataCount,
    playerHash: value.playerHash,
    clanHash: value.clanHash,
    cityWorldHash: value.cityWorldHash,
    worldControlHash: value.worldControlHash,
  });
  assert.deepEqual(comparable(inventory), comparable(expectedInventory), "Restored representative inventory does not match the source database at the backup snapshot time.");
  const result = {
    schemaVersion: "crownlands-prod-ready-1-backup-restore-v1",
    status: "PASS",
    projectId: PROJECT_ID,
    sourceBackup: {
      name: selectedBackup.name,
      database: selectedBackup.database,
      state: selectedBackup.state,
      snapshotTime: selectedBackup.snapshotTime,
      createTime: selectedBackup.createTime,
      expireTime: selectedBackup.expireTime,
      stats: selectedBackup.stats || null,
    },
    destination: {
      databaseId: destinationDatabase,
      databaseName: restoredDatabase.name,
      uid: restoredDatabase.uid,
      locationId: restoredDatabase.locationId,
      isolatedNamedDatabase: true,
      productionClientsConfiguredToUseIt: false,
      securityRulesMustRemainDenyByDefault: true,
    },
    restoreOperation,
    verification: {
      expectedAtBackupSnapshot: expectedInventory,
      restored: inventory,
      exactRepresentativeCountsAndHashesMatch: true,
    },
    cleanupPolicy: "Retained for review; deletion requires separate destructive authorization.",
    sourceBackupPreserved: true,
    sourceBackupDeletionAllowed: false,
    liveDefaultDatabaseUntouched: true,
    gameplayDocumentMutationPerformed: false,
    completedAt: new Date().toISOString(),
  };
  result.receiptHash = hashValue(result);
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) main().catch(error => {
  console.error(`${error.code || "prod-ready-restore-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});

module.exports = Object.freeze({ RESULT_PATH, main });
