"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  CONFIG,
  requireMutationConfirmation,
  environmentBanner,
} = require("./map-scaling-phase-9/environment.js");
const { googleRequest } = require("./map-scaling-phase-9/google-api.js");
const {
  setDocument,
  getDocument,
  commitWrites,
  listDocuments,
} = require("./map-scaling-phase-9/staging-api.js");
const reset = require("./core-v2-reset-1/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_DIRECTORY = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-1");
const RESULT_PATH = path.join(RESULT_DIRECTORY, "STAGING_RESET_REHEARSAL.json");
const RUN_ID = "reset1-pre-september-2026-v8";
const RUN_ROOT = `reset1Rehearsals/${RUN_ID}`;
const POINTER_PATH = `${RUN_ROOT}/control/activeSeason`;

function environmentInput() {
  return {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
}

async function verifyEnvironment() {
  const [staging, production] = await Promise.all([
    googleRequest(`https://firebase.googleapis.com/v1beta1/projects/${CONFIG.stagingProjectId}`),
    googleRequest(`https://firebase.googleapis.com/v1beta1/projects/${CONFIG.productionProjectId}`),
  ]);
  assert.equal(staging.body.projectId, CONFIG.stagingProjectId);
  assert.equal(production.body.projectId, CONFIG.productionProjectId);
  assert.notEqual(staging.body.projectNumber, production.body.projectNumber);
  return {
    staging: { projectId: staging.body.projectId, projectNumber: staging.body.projectNumber },
    production: { projectId: production.body.projectId, projectNumber: production.body.projectNumber },
    isolated: true,
  };
}

async function commitInBatches(writes, batchSize = 350) {
  const timings = [];
  for (let index = 0; index < writes.length; index += batchSize) {
    const batch = writes.slice(index, index + batchSize);
    const startedAt = performance.now();
    await commitWrites(batch);
    timings.push({ startIndex: index, writeCount: batch.length, durationMs: performance.now() - startedAt });
  }
  return timings;
}

async function listAllDocuments(collectionPath) {
  const documents = [];
  let pageToken = "";
  do {
    const page = await listDocuments(collectionPath, { pageSize: 300, pageToken });
    documents.push(...page.documents);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return documents;
}

function seasonDocumentWrites(rehearsal) {
  const { receipt, world, sourcePlayers, migratedPlayers } = rehearsal;
  const oldSeasonPath = `${RUN_ROOT}/seasons/${reset.OLD_SEASON_ID}`;
  const newSeasonPath = `${RUN_ROOT}/seasons/${reset.NEW_SEASON_ID}`;
  const writes = [
    { path: oldSeasonPath, data: {
      schemaVersion: reset.SCHEMA_VERSION,
      environment: "STAGING",
      worldId: reset.OLD_WORLD_ID,
      seasonId: reset.OLD_SEASON_ID,
      status: "ACTIVE",
      mutationState: "FROZEN",
      newPlacementEnabled: false,
      archivedReadOnly: false,
      synthetic: true,
      productionDataCopied: false,
    } },
    { path: newSeasonPath, data: {
      schemaVersion: reset.SCHEMA_VERSION,
      environment: "STAGING",
      worldId: reset.NEW_WORLD_ID,
      seasonId: reset.NEW_SEASON_ID,
      status: "INITIALIZING",
      playerEntryEnabled: false,
      lifecycleHistory: ["PREPARING", "INITIALIZING"],
      assetManifestHash: reset.ASSET_MANIFEST_HASH,
      synthetic: true,
      productionDataCopied: false,
    } },
  ];
  sourcePlayers.forEach((player, index) => {
    writes.push(
      { path: `${RUN_ROOT}/playersBefore/${player.uid}`, data: { ...player, snapshotReceipt: receipt.beforeReceipts[index] } },
      { path: `${RUN_ROOT}/playersAfter/${player.uid}`, data: { ...migratedPlayers[index], snapshotReceipt: receipt.afterReceipts[index] } },
    );
  });
  world.regions.forEach(region => writes.push({
    path: `${newSeasonPath}/regions/${region.id}`,
    data: { ...region, environment: "STAGING", synthetic: true, productionActivated: false },
  }));
  world.cities.forEach(city => writes.push({
    path: `${newSeasonPath}/cities/${city.id}`,
    data: { ...city, environment: "STAGING", synthetic: true },
  }));
  world.objectives.forEach(objective => writes.push({
    path: `${newSeasonPath}/objectives/${objective.id}`,
    data: { ...objective, environment: "STAGING", synthetic: true },
  }));
  return { writes, oldSeasonPath, newSeasonPath };
}

async function validateRemoteProjection({ rehearsal, newSeasonPath }) {
  const [regions, cities, beforePlayers, afterPlayers] = await Promise.all([
    listAllDocuments(`${newSeasonPath}/regions`),
    listAllDocuments(`${newSeasonPath}/cities`),
    listAllDocuments(`${RUN_ROOT}/playersBefore`),
    listAllDocuments(`${RUN_ROOT}/playersAfter`),
  ]);
  assert.equal(regions.length, rehearsal.world.regions.length);
  assert.equal(cities.length, rehearsal.world.cities.length);
  assert.equal(beforePlayers.length, 4);
  assert.equal(afterPlayers.length, 4);
  const coreRegionIds = new Set(rehearsal.world.regions.filter(region => region.permanentCore).map(region => region.id));
  const coreCities = cities.filter(document => coreRegionIds.has(document.data.regionId));
  assert.equal(coreRegionIds.size, 25);
  assert.equal(coreCities.length, 1480);
  assert(afterPlayers.every(document => !document.data.shopItems || Object.keys(document.data.shopItems).length === 0));
  return {
    regionDocuments: regions.length,
    cityDocuments: cities.length,
    coreRegionDocuments: coreRegionIds.size,
    coreCityDocuments: coreCities.length,
    playersBefore: beforePlayers.length,
    playersAfter: afterPlayers.length,
  };
}

async function main() {
  const identity = requireMutationConfirmation(environmentInput());
  console.log(environmentBanner(identity));
  const environment = await verifyEnvironment();
  const startedAt = performance.now();
  const rehearsal = reset.runResetRehearsal();
  const idempotency = reset.runIdempotencyProof();
  const priorRun = await getDocument(RUN_ROOT);
  if (priorRun?.data?.inputReceiptHash && priorRun.data.inputReceiptHash !== rehearsal.receipt.receiptHash) {
    throw new Error("RESET-1 staging run ID already exists with a different deterministic input receipt.");
  }
  const replayed = Boolean(priorRun);
  await setDocument(RUN_ROOT, {
    schemaVersion: reset.SCHEMA_VERSION,
    runId: RUN_ID,
    environment: "STAGING",
    stagingProjectId: CONFIG.stagingProjectId,
    productionProjectId: CONFIG.productionProjectId,
    status: "PREPARING",
    lifecycleHistory: ["PREPARING"],
    inputReceiptHash: rehearsal.receipt.receiptHash,
    synthetic: true,
    productionMutationPerformed: false,
    replayed,
    startedAt: new Date(),
  });
  let pointerBefore = await getDocument(POINTER_PATH);
  if (!pointerBefore) {
    await setDocument(POINTER_PATH, {
      schemaVersion: reset.SCHEMA_VERSION,
      environment: "STAGING",
      worldId: reset.OLD_WORLD_ID,
      seasonId: reset.OLD_SEASON_ID,
      revision: 7,
      synthetic: true,
      productionMutationPerformed: false,
    }, { mustNotExist: true });
    pointerBefore = await getDocument(POINTER_PATH);
  }
  assert(pointerBefore, "The isolated staging active-season pointer is missing.");

  const projection = seasonDocumentWrites(rehearsal);
  const batchTimings = await commitInBatches(projection.writes);
  await setDocument(projection.newSeasonPath, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.NEW_WORLD_ID,
    seasonId: reset.NEW_SEASON_ID,
    status: "VALIDATING",
    playerEntryEnabled: false,
    lifecycleHistory: ["PREPARING", "INITIALIZING", "VALIDATING"],
    assetManifestHash: reset.ASSET_MANIFEST_HASH,
    exactCoreMapCount: 25,
    exactCoreCityCount: 1480,
    standbyBuffer: 2,
    synthetic: true,
    productionDataCopied: false,
  });
  const remoteValidation = await validateRemoteProjection({ rehearsal, newSeasonPath: projection.newSeasonPath });

  await setDocument(projection.newSeasonPath, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.NEW_WORLD_ID,
    seasonId: reset.NEW_SEASON_ID,
    status: "READY",
    playerEntryEnabled: false,
    lifecycleHistory: reset.RESET_LIFECYCLE,
    assetManifestHash: reset.ASSET_MANIFEST_HASH,
    exactCoreMapCount: 25,
    exactCoreCityCount: 1480,
    activePlayerRegionCount: rehearsal.receipt.newSeason.activePlayerRegions.length,
    standbyPlayerRegionCount: rehearsal.receipt.newSeason.standbyPlayerRegions.length,
    validationReceiptHash: rehearsal.receipt.receiptHash,
    synthetic: true,
    productionDataCopied: false,
  });
  if (pointerBefore.data.seasonId === reset.OLD_SEASON_ID) {
    assert.equal(pointerBefore.data.worldId, reset.OLD_WORLD_ID);
    assert.equal(pointerBefore.data.revision, 7);
    await setDocument(POINTER_PATH, {
      schemaVersion: reset.SCHEMA_VERSION,
      environment: "STAGING",
      worldId: reset.NEW_WORLD_ID,
      seasonId: reset.NEW_SEASON_ID,
      priorWorldId: reset.OLD_WORLD_ID,
      priorSeasonId: reset.OLD_SEASON_ID,
      revision: 8,
      switchedBy: RUN_ID,
      synthetic: true,
      productionMutationPerformed: false,
    }, { updateTime: pointerBefore.updateTime });
  } else {
    assert.equal(pointerBefore.data.seasonId, reset.NEW_SEASON_ID);
    assert.equal(pointerBefore.data.switchedBy, RUN_ID);
  }
  await setDocument(projection.oldSeasonPath, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.OLD_WORLD_ID,
    seasonId: reset.OLD_SEASON_ID,
    status: "ARCHIVED",
    mutationState: "READ_ONLY",
    newPlacementEnabled: false,
    archivedReadOnly: true,
    replacedBySeasonId: reset.NEW_SEASON_ID,
    synthetic: true,
    productionDataCopied: false,
  });
  await setDocument(projection.newSeasonPath, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.NEW_WORLD_ID,
    seasonId: reset.NEW_SEASON_ID,
    status: "READY",
    playerEntryEnabled: true,
    lifecycleHistory: reset.RESET_LIFECYCLE,
    assetManifestHash: reset.ASSET_MANIFEST_HASH,
    exactCoreMapCount: 25,
    exactCoreCityCount: 1480,
    activePlayerRegionCount: rehearsal.receipt.newSeason.activePlayerRegions.length,
    standbyPlayerRegionCount: rehearsal.receipt.newSeason.standbyPlayerRegions.length,
    validationReceiptHash: rehearsal.receipt.receiptHash,
    activatedByPointerRevision: 8,
    synthetic: true,
    productionDataCopied: false,
  });

  const [pointer, oldSeason, newSeason] = await Promise.all([
    getDocument(POINTER_PATH),
    getDocument(projection.oldSeasonPath),
    getDocument(projection.newSeasonPath),
  ]);
  assert.equal(pointer.data.seasonId, reset.NEW_SEASON_ID);
  assert.equal(oldSeason.data.status, "ARCHIVED");
  assert.equal(oldSeason.data.archivedReadOnly, true);
  assert.equal(newSeason.data.status, "READY");
  assert.equal(newSeason.data.playerEntryEnabled, true);

  const durationMs = performance.now() - startedAt;
  const result = {
    schemaVersion: "core-v2-reset-1-staging-rehearsal-v1",
    passed: true,
    runId: RUN_ID,
    environment,
    lifecycleHistory: reset.RESET_LIFECYCLE,
    replayed,
    inputReceiptHash: rehearsal.receipt.receiptHash,
    activePointer: pointer.data,
    oldSeason: oldSeason.data,
    newSeason: newSeason.data,
    remoteValidation,
    batchTimings,
    dataWritesCommitted: projection.writes.length,
    controlWritesCommitted: replayed ? 6 : 8,
    writesCommitted: projection.writes.length + (replayed ? 6 : 8),
    durationMs,
    freshDurationMs: replayed ? Number(priorRun.data.freshDurationMs ?? priorRun.data.durationMs) : durationMs,
    replayDurationMs: replayed ? durationMs : null,
    pointerCompareAndSet: {
      isolatedRunPointer: true,
      expectedPriorRevision: 7,
      committedRevision: pointer.data.revision,
      updateTimePreconditionUsed: pointerBefore.data.seasonId === reset.OLD_SEASON_ID,
      initialCutoverUsedUpdateTimePrecondition: replayed
        ? Boolean(priorRun.data.pointerCompareAndSet?.initialCutoverUsedUpdateTimePrecondition
          ?? priorRun.data.pointerCompareAndSet?.updateTimePreconditionUsed)
        : true,
      replaySkippedRedundantCutover: replayed,
    },
    persistenceChecks: rehearsal.receipt.afterReceipts.map(receipt => ({ uid: receipt.uid, persistentHashMatches: receipt.persistentHashMatches })),
    mainCitySecurity: {
      rejectedAttempts: rehearsal.receipt.mainCitySecurity.rejectedAttemptCount,
      restrictedRegions: rehearsal.receipt.mainCitySecurity.restrictedRegions,
      supportedPaths: rehearsal.receipt.mainCitySecurity.supportedPaths,
    },
    npcThreshold: rehearsal.receipt.threshold,
    expansion: rehearsal.receipt.expansion,
    postResetGameplay: rehearsal.receipt.postResetGameplay,
    rollback: rehearsal.receipt.aborts,
    idempotency,
    productionMutationPerformed: false,
    productionProjectTargeted: false,
  };
  result.receiptHash = reset.hashValue(result);
  await setDocument(RUN_ROOT, {
    ...result,
    status: "PASS",
    completedAt: new Date(),
  });
  fs.mkdirSync(RESULT_DIRECTORY, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`RESET-1 staging rehearsal passed (${remoteValidation.coreRegionDocuments} Core maps, ${remoteValidation.coreCityDocuments} Core cities, ${result.writesCommitted} staging writes).`);
  return result;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ main, RESULT_PATH, RUN_ID, RUN_ROOT, POINTER_PATH });
