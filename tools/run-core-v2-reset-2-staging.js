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
const reset = require("./core-v2-reset-2/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_DIRECTORY = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-2");
const RESULT_PATH = path.join(RESULT_DIRECTORY, "STAGING_DRESS_REHEARSAL.json");
const RUN_ID = "reset2-aug25-exact-candidate-v5";
const RUN_ROOT = `reset2Rehearsals/${RUN_ID}`;
const PRIOR_ABORTED_RUN_PATHS = Object.freeze([
  "reset2Rehearsals/reset2-aug25-exact-candidate-v1",
  "reset2Rehearsals/reset2-aug25-exact-candidate-v2",
  "reset2Rehearsals/reset2-aug25-exact-candidate-v3",
  "reset2Rehearsals/reset2-aug25-exact-candidate-v4",
]);
const POINTER_PATH = `${RUN_ROOT}/control/activeSeason`;
const OLD_SEASON_PATH = `${RUN_ROOT}/seasons/${reset.OLD_SEASON_ID}`;
const NEW_SEASON_PATH = `${RUN_ROOT}/seasons/${reset.NEW_SEASON_ID}`;

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

async function timedStage(timings, stage, operation) {
  const startedAt = performance.now();
  const value = await operation();
  timings.push({ stage, durationMs: Number((performance.now() - startedAt).toFixed(3)) });
  return value;
}

async function commitInBatches(writes, maximumWrites = 350, maximumEstimatedBytes = 4_000_000) {
  const batches = [];
  let index = 0;
  while (index < writes.length) {
    const batch = [];
    let estimatedBytes = 0;
    const startIndex = index;
    while (index < writes.length && batch.length < maximumWrites) {
      const write = writes[index];
      const writeBytes = Buffer.byteLength(JSON.stringify(write), "utf8");
      if (batch.length && estimatedBytes + writeBytes > maximumEstimatedBytes) break;
      batch.push(write);
      estimatedBytes += writeBytes;
      index += 1;
    }
    assert(batch.length > 0, "At least one write must fit in a staging commit batch.");
    const startedAt = performance.now();
    await commitWrites(batch);
    batches.push({ startIndex, writeCount: batch.length, estimatedBytes, durationMs: Number((performance.now() - startedAt).toFixed(3)) });
  }
  return batches;
}

async function listAllDocuments(collectionPath) {
  const documents = [];
  const pages = [];
  let pageToken = "";
  let pageIndex = 0;
  do {
    const page = await listDocuments(collectionPath, { pageSize: reset.PAGE_SIZE, pageToken });
    const firstPath = page.documents[0]?.path || "";
    const lastPath = page.documents.at(-1)?.path || "";
    documents.push(...page.documents);
    pages.push({ pageIndex, count: page.documents.length, firstPath, lastPath, nextPageTokenPresent: Boolean(page.nextPageToken) });
    assert(page.nextPageToken !== pageToken || !page.nextPageToken, "Remote pagination cursor did not advance.");
    pageToken = page.nextPageToken;
    pageIndex += 1;
  } while (pageToken);
  return { documents, pages };
}

function sourceAndClanWrites(local) {
  const writes = [];
  local.dataset.players.forEach(player => writes.push({
    path: `${RUN_ROOT}/sourcePlayers/${player.uid}`,
    data: {
      uid: player.uid,
      profileJson: JSON.stringify(player),
      profileHash: reset.hashValue(player),
      environment: "STAGING",
      synthetic: true,
      productionDataCopied: false,
    },
  }));
  local.dataset.clans.forEach(clan => writes.push({
    path: `${RUN_ROOT}/sourceClans/${clan.clanId}`,
    data: { ...clan, environment: "STAGING", synthetic: true, productionDataCopied: false },
  }));
  return writes;
}

function backupWrites(local) {
  const writes = [];
  local.backup.playerSnapshots.forEach(player => writes.push({
    path: `${RUN_ROOT}/backupPlayers/${player.uid}`,
    data: {
      uid: player.uid,
      snapshotJson: JSON.stringify(player),
      snapshotHash: reset.hashValue(player),
      backupId: local.backup.backupId,
      immutable: true,
      environment: "STAGING",
      synthetic: true,
    },
  }));
  local.backup.clans.forEach(clan => writes.push({
    path: `${RUN_ROOT}/backupClans/${clan.clanId}`,
    data: {
      clanId: clan.clanId,
      snapshotJson: JSON.stringify(clan),
      snapshotHash: reset.hashValue(clan),
      backupId: local.backup.backupId,
      immutable: true,
      environment: "STAGING",
      synthetic: true,
    },
  }));
  return writes;
}

function restoreWrites(local) {
  const writes = [];
  local.backup.playerSnapshots.forEach(player => writes.push({
    path: `${RUN_ROOT}/restorePlayers/${player.uid}`,
    data: {
      uid: player.uid,
      snapshotJson: JSON.stringify(player),
      snapshotHash: reset.hashValue(player),
      restoredFromBackupId: local.backup.backupId,
      environment: "STAGING",
      synthetic: true,
    },
  }));
  local.backup.clans.forEach(clan => writes.push({
    path: `${RUN_ROOT}/restoreClans/${clan.clanId}`,
    data: {
      clanId: clan.clanId,
      snapshotJson: JSON.stringify(clan),
      snapshotHash: reset.hashValue(clan),
      restoredFromBackupId: local.backup.backupId,
      environment: "STAGING",
      synthetic: true,
    },
  }));
  return writes;
}

function newSeasonWrites(local) {
  const playerWrites = [];
  const worldWrites = [];
  local.migratedPlayers.forEach(player => playerWrites.push({
    path: `${RUN_ROOT}/migratedPlayers/${player.uid}`,
    data: { ...player, environment: "STAGING", synthetic: true, productionDataCopied: false },
  }));
  local.world.regions.forEach(region => worldWrites.push({
    path: `${NEW_SEASON_PATH}/regions/${region.id}`,
    data: { ...region, environment: "STAGING", synthetic: true, productionActivated: false },
  }));
  local.world.cities.forEach(city => worldWrites.push({
    path: `${NEW_SEASON_PATH}/cities/${city.id}`,
    data: { ...city, environment: "STAGING", synthetic: true },
  }));
  local.world.objectives.forEach(objective => worldWrites.push({
    path: `${NEW_SEASON_PATH}/objectives/${objective.id}`,
    data: { ...objective, environment: "STAGING", synthetic: true },
  }));
  return { playerWrites, worldWrites };
}

async function verifyBackupAndRestore(local) {
  const [backupPlayers, backupClans, restoredPlayers, restoredClans] = await Promise.all([
    listAllDocuments(`${RUN_ROOT}/backupPlayers`),
    listAllDocuments(`${RUN_ROOT}/backupClans`),
    listAllDocuments(`${RUN_ROOT}/restorePlayers`),
    listAllDocuments(`${RUN_ROOT}/restoreClans`),
  ]);
  assert.equal(backupPlayers.documents.length, reset.DATASET_SIZE);
  assert.equal(restoredPlayers.documents.length, reset.DATASET_SIZE);
  assert.equal(backupClans.documents.length, local.dataset.clans.length);
  assert.equal(restoredClans.documents.length, local.dataset.clans.length);
  assert(backupPlayers.documents.every(document => document.data.snapshotHash === reset.hashValue(JSON.parse(document.data.snapshotJson))));
  assert(restoredPlayers.documents.every(document => document.data.snapshotHash === reset.hashValue(JSON.parse(document.data.snapshotJson))));
  const backupPersistentHash = reset.hashValue(backupPlayers.documents
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(document => [document.path.split("/").at(-1), JSON.parse(document.data.snapshotJson).persistent]));
  const restorePersistentHash = reset.hashValue(restoredPlayers.documents
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(document => [document.path.split("/").at(-1), JSON.parse(document.data.snapshotJson).persistent]));
  assert(backupClans.documents.every(document => document.data.snapshotHash === reset.hashValue(JSON.parse(document.data.snapshotJson))));
  assert(restoredClans.documents.every(document => document.data.snapshotHash === reset.hashValue(JSON.parse(document.data.snapshotJson))));
  const backupClanHash = reset.hashValue(backupClans.documents
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(document => [document.path.split("/").at(-1), JSON.parse(document.data.snapshotJson)]));
  const restoreClanHash = reset.hashValue(restoredClans.documents
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(document => [document.path.split("/").at(-1), JSON.parse(document.data.snapshotJson)]));
  assert.equal(backupPersistentHash, restorePersistentHash);
  assert.equal(backupClanHash, restoreClanHash);
  return {
    backupPlayers: backupPlayers.documents.length,
    backupClans: backupClans.documents.length,
    restoredPlayers: restoredPlayers.documents.length,
    restoredClans: restoredClans.documents.length,
    backupPlayerPages: backupPlayers.pages.length,
    restoredPlayerPages: restoredPlayers.pages.length,
    backupPersistentHash,
    restorePersistentHash,
    backupClanHash,
    restoreClanHash,
    publishedPackagesRegenerated: false,
    validated: true,
  };
}

async function verifyNewSeason(local) {
  const [players, regions, cities, objectives] = await Promise.all([
    listAllDocuments(`${RUN_ROOT}/migratedPlayers`),
    listAllDocuments(`${NEW_SEASON_PATH}/regions`),
    listAllDocuments(`${NEW_SEASON_PATH}/cities`),
    listAllDocuments(`${NEW_SEASON_PATH}/objectives`),
  ]);
  assert.equal(players.documents.length, reset.DATASET_SIZE);
  assert.equal(regions.documents.length, local.world.regions.length);
  assert.equal(cities.documents.length, local.world.cities.length);
  assert.equal(objectives.documents.length, 17);
  const coreRegionIds = new Set(local.world.regions.filter(region => region.permanentCore).map(region => region.id));
  const coreCities = cities.documents.filter(document => coreRegionIds.has(document.data.regionId));
  assert.equal(coreRegionIds.size, 25);
  assert.equal(coreCities.length, 1480);
  const playerUids = players.documents.map(document => document.path.split("/").at(-1));
  assert.equal(new Set(playerUids).size, reset.DATASET_SIZE);
  assert(players.documents.every(document => Object.keys(document.data.shopItems || {}).length === 0));
  assert(players.documents.every(document => document.data.mainCityId && document.data.mainRegionId));
  assert(players.documents.every(document => !document.data.mainRegionId.startsWith("core-v2-")));
  return {
    playerDocuments: players.documents.length,
    playerPages: players.pages.length,
    uniquePlayerDocuments: new Set(playerUids).size,
    duplicatePlayers: playerUids.length - new Set(playerUids).size,
    skippedPlayers: reset.DATASET_SIZE - new Set(playerUids).size,
    regionDocuments: regions.documents.length,
    cityDocuments: cities.documents.length,
    objectiveDocuments: objectives.documents.length,
    coreRegionDocuments: coreRegionIds.size,
    coreCityDocuments: coreCities.length,
    consumablesRemaining: players.documents.filter(document => Object.keys(document.data.shopItems || {}).length).length,
  };
}

async function main() {
  const identity = requireMutationConfirmation(environmentInput());
  console.log(environmentBanner(identity));
  const environment = await verifyEnvironment();
  const totalStartedAt = performance.now();
  const timings = [];
  const local = await timedStage(timings, "local_exact_candidate", async () => reset.runLocalDressRehearsal());
  const candidate = local.result.candidate;
  const priorAbortedRuns = await Promise.all(PRIOR_ABORTED_RUN_PATHS.map(runPath => getDocument(runPath)));
  priorAbortedRuns.forEach(priorAbortedRun => {
    assert.equal(priorAbortedRun?.data?.status, "ABORTED", "Every transaction-size failure must remain recorded as an isolated aborted attempt.");
    assert.equal(priorAbortedRun.data.oldSeasonRemainedAuthoritative, true);
    assert.equal(priorAbortedRun.data.partialSeasonVisible, false);
    assert.equal(priorAbortedRun.data.pointerCutoverPerformed, false);
    assert.equal(priorAbortedRun.data.productionMutationPerformed, false);
  });
  const existing = await getDocument(RUN_ROOT);
  if (existing?.data?.candidateSourceBundleHash && existing.data.candidateSourceBundleHash !== candidate.sourceBundleHash) {
    throw new Error("RESET-2 run ID is already bound to a different exact candidate.");
  }
  const replayed = Boolean(existing);
  await setDocument(RUN_ROOT, {
    schemaVersion: reset.SCHEMA_VERSION,
    runId: RUN_ID,
    environment: "STAGING",
    stagingProjectId: CONFIG.stagingProjectId,
    productionProjectId: CONFIG.productionProjectId,
    status: "PREPARING",
    lifecycleHistory: ["PREPARING"],
    candidateId: candidate.candidateId,
    approvedBaseGitSha: candidate.approvedBaseGitSha,
    candidateSourceBundleHash: candidate.sourceBundleHash,
    synthetic: true,
    anonymized: true,
    productionDataCopied: false,
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
      revision: 12,
      candidateId: "pre-reset2-old-world",
      synthetic: true,
      productionMutationPerformed: false,
    }, { mustNotExist: true });
    pointerBefore = await getDocument(POINTER_PATH);
  }
  assert(pointerBefore);

  await timedStage(timings, "maintenance_freeze", async () => setDocument(OLD_SEASON_PATH, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.OLD_WORLD_ID,
    seasonId: reset.OLD_SEASON_ID,
    status: "ACTIVE",
    mutationState: "FROZEN",
    maintenanceMode: "READ_ONLY_LOGIN",
    playerEntryEnabled: true,
    worldMutationsEnabled: false,
    newPlacementEnabled: false,
    synthetic: true,
    productionDataCopied: false,
  }));

  const sourceWrites = sourceAndClanWrites(local);
  const sourceBatchTimings = await timedStage(timings, "source_snapshot", () => commitInBatches(sourceWrites));
  const backupStartedAt = new Date().toISOString();
  const backupBatchTimings = await timedStage(timings, "backup", () => commitInBatches(backupWrites(local)));
  const backupCompletedAt = new Date().toISOString();
  await setDocument(`${RUN_ROOT}/backup/manifest`, {
    ...local.backup,
    playerSnapshots: undefined,
    clans: undefined,
    environment: "STAGING",
    status: "VALIDATED",
    startedAt: backupStartedAt,
    completedAt: backupCompletedAt,
    productionDataCopied: false,
  });

  const restoreBatchTimings = await timedStage(timings, "restore", () => commitInBatches(restoreWrites(local)));
  const backupRestoreValidation = await timedStage(timings, "backup_restore_validation", () => verifyBackupAndRestore(local));

  await setDocument(NEW_SEASON_PATH, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.NEW_WORLD_ID,
    seasonId: reset.NEW_SEASON_ID,
    status: "INITIALIZING",
    playerEntryEnabled: false,
    lifecycleHistory: ["PREPARING", "INITIALIZING"],
    candidateId: candidate.candidateId,
    candidateSourceBundleHash: candidate.sourceBundleHash,
    assetManifestHash: reset.ASSET_MANIFEST_HASH,
    synthetic: true,
    productionDataCopied: false,
  });
  const seasonWrites = newSeasonWrites(local);
  const migratedPlayerBatchTimings = await timedStage(timings, "persistent_player_migration", () => (
    commitInBatches(seasonWrites.playerWrites, 10, 350_000)
  ));
  const worldBatchTimings = await timedStage(timings, "world_initialization", () => (
    commitInBatches(seasonWrites.worldWrites)
  ));
  await setDocument(NEW_SEASON_PATH, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.NEW_WORLD_ID,
    seasonId: reset.NEW_SEASON_ID,
    status: "VALIDATING",
    playerEntryEnabled: false,
    lifecycleHistory: ["PREPARING", "INITIALIZING", "VALIDATING"],
    candidateId: candidate.candidateId,
    candidateSourceBundleHash: candidate.sourceBundleHash,
    assetManifestHash: reset.ASSET_MANIFEST_HASH,
    exactCoreMapCount: 25,
    exactCoreCityCount: 1480,
    expectedPlayers: reset.DATASET_SIZE,
    standbyBuffer: reset.STANDBY_TARGET,
    synthetic: true,
    productionDataCopied: false,
  });
  const remoteValidation = await timedStage(timings, "remote_validation", () => verifyNewSeason(local));
  await setDocument(NEW_SEASON_PATH, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.NEW_WORLD_ID,
    seasonId: reset.NEW_SEASON_ID,
    status: "READY",
    playerEntryEnabled: false,
    lifecycleHistory: reset.RESET_LIFECYCLE,
    candidateId: candidate.candidateId,
    candidateSourceBundleHash: candidate.sourceBundleHash,
    assetManifestHash: reset.ASSET_MANIFEST_HASH,
    exactCoreMapCount: 25,
    exactCoreCityCount: 1480,
    exactPlayerCount: reset.DATASET_SIZE,
    exactObjectiveCount: 17,
    activePlayerRegionCount: local.result.world.activeOuterRegions,
    standbyPlayerRegionCount: local.result.world.standbyOuterRegions,
    validationReceiptHash: local.result.receiptHash,
    synthetic: true,
    productionDataCopied: false,
  });

  const cutoverNeeded = pointerBefore.data.seasonId === reset.OLD_SEASON_ID;
  if (cutoverNeeded) {
    assert.equal(pointerBefore.data.worldId, reset.OLD_WORLD_ID);
    assert.equal(pointerBefore.data.revision, 12);
    await timedStage(timings, "atomic_pointer_cutover", () => setDocument(POINTER_PATH, {
      schemaVersion: reset.SCHEMA_VERSION,
      environment: "STAGING",
      worldId: reset.NEW_WORLD_ID,
      seasonId: reset.NEW_SEASON_ID,
      priorWorldId: reset.OLD_WORLD_ID,
      priorSeasonId: reset.OLD_SEASON_ID,
      revision: 13,
      candidateId: candidate.candidateId,
      candidateSourceBundleHash: candidate.sourceBundleHash,
      switchedBy: RUN_ID,
      synthetic: true,
      productionMutationPerformed: false,
    }, { updateTime: pointerBefore.updateTime }));
  } else {
    assert.equal(pointerBefore.data.seasonId, reset.NEW_SEASON_ID);
    assert.equal(pointerBefore.data.candidateId, candidate.candidateId);
  }

  await setDocument(OLD_SEASON_PATH, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.OLD_WORLD_ID,
    seasonId: reset.OLD_SEASON_ID,
    status: "ARCHIVED",
    mutationState: "READ_ONLY",
    maintenanceMode: "ARCHIVED",
    playerEntryEnabled: false,
    worldMutationsEnabled: false,
    newPlacementEnabled: false,
    archivedReadOnly: true,
    retentionDays: reset.OLD_WORLD_RETENTION_DAYS,
    cleanupEligibleAfterReview: true,
    replacedBySeasonId: reset.NEW_SEASON_ID,
    synthetic: true,
    productionDataCopied: false,
  });
  await setDocument(NEW_SEASON_PATH, {
    schemaVersion: reset.SCHEMA_VERSION,
    environment: "STAGING",
    worldId: reset.NEW_WORLD_ID,
    seasonId: reset.NEW_SEASON_ID,
    status: "READY",
    playerEntryEnabled: true,
    lifecycleHistory: reset.RESET_LIFECYCLE,
    candidateId: candidate.candidateId,
    candidateSourceBundleHash: candidate.sourceBundleHash,
    assetManifestHash: reset.ASSET_MANIFEST_HASH,
    exactCoreMapCount: 25,
    exactCoreCityCount: 1480,
    exactPlayerCount: reset.DATASET_SIZE,
    exactObjectiveCount: 17,
    activePlayerRegionCount: local.result.world.activeOuterRegions,
    standbyPlayerRegionCount: local.result.world.standbyOuterRegions,
    validationReceiptHash: local.result.receiptHash,
    activatedByPointerRevision: 13,
    synthetic: true,
    productionDataCopied: false,
  });

  const [pointerAfter, oldSeason, newSeason] = await Promise.all([
    getDocument(POINTER_PATH),
    getDocument(OLD_SEASON_PATH),
    getDocument(NEW_SEASON_PATH),
  ]);
  assert.equal(pointerAfter.data.seasonId, reset.NEW_SEASON_ID);
  assert.equal(pointerAfter.data.candidateId, candidate.candidateId);
  assert.equal(oldSeason.data.status, "ARCHIVED");
  assert.equal(oldSeason.data.mutationState, "READ_ONLY");
  assert.equal(newSeason.data.status, "READY");
  assert.equal(newSeason.data.playerEntryEnabled, true);

  const durationMs = performance.now() - totalStartedAt;
  const result = {
    schemaVersion: "core-v2-reset-2-staging-dress-rehearsal-v1",
    passed: true,
    runId: RUN_ID,
    environment,
    candidate,
    replayed,
    lifecycleHistory: reset.RESET_LIFECYCLE,
    dataset: local.result.dataset,
    localPagination: local.result.pagination,
    remotePagination: {
      pageSize: reset.PAGE_SIZE,
      playerPages: remoteValidation.playerPages,
      backupPlayerPages: backupRestoreValidation.backupPlayerPages,
      restoredPlayerPages: backupRestoreValidation.restoredPlayerPages,
      uniquePlayers: remoteValidation.uniquePlayerDocuments,
      duplicatePlayers: remoteValidation.duplicatePlayers,
      skippedPlayers: remoteValidation.skippedPlayers,
    },
    persistence: local.result.persistence,
    clans: local.result.clans,
    flags: local.result.flags,
    seasonalReset: local.result.seasonalReset,
    backup: {
      backupId: local.backup.backupId,
      backupHash: local.backup.backupHash,
      startedAt: backupStartedAt,
      completedAt: backupCompletedAt,
      status: "VALIDATED",
      playerCount: local.backup.playerSnapshots.length,
      clanCount: local.backup.clans.length,
    },
    restore: backupRestoreValidation,
    remoteValidation,
    world: local.result.world,
    placements: local.result.placements,
    boundaryAndStandby: local.result.boundaryAndStandby,
    mainCity: local.result.mainCity,
    readyGating: local.result.readyGating,
    pointerCompareAndSet: {
      isolatedRunPointer: true,
      expectedOldRevision: 12,
      committedRevision: pointerAfter.data.revision,
      updateTimePreconditionUsed: cutoverNeeded,
      initialCutoverUsedUpdateTimePrecondition: replayed
        ? Boolean(existing.data.pointerCompareAndSet?.initialCutoverUsedUpdateTimePrecondition)
        : true,
      replaySkippedRedundantCutover: replayed,
      exactCandidateMatched: pointerAfter.data.candidateSourceBundleHash === candidate.sourceBundleHash,
    },
    activePointer: pointerAfter.data,
    oldSeason: oldSeason.data,
    newSeason: newSeason.data,
    failureInjection: local.result.failures,
    priorAbortedAttempts: priorAbortedRuns.map(priorAbortedRun => ({
      runId: priorAbortedRun.data.runId,
      status: priorAbortedRun.data.status,
      failedStage: priorAbortedRun.data.failedStage,
      errorCode: priorAbortedRun.data.errorCode,
      oldSeasonRemainedAuthoritative: priorAbortedRun.data.oldSeasonRemainedAuthoritative,
      partialSeasonVisible: priorAbortedRun.data.partialSeasonVisible,
      pointerCutoverPerformed: priorAbortedRun.data.pointerCutoverPerformed,
      productionMutationPerformed: priorAbortedRun.data.productionMutationPerformed,
    })),
    monitoring: local.result.monitoring,
    localIdempotency: reset.runIdempotencyProof(),
    writeCounts: {
      source: sourceWrites.length,
      backup: backupWrites(local).length,
      restore: restoreWrites(local).length,
      migratedPlayers: seasonWrites.playerWrites.length,
      world: seasonWrites.worldWrites.length,
      newSeason: seasonWrites.playerWrites.length + seasonWrites.worldWrites.length,
      totalDataWrites: sourceWrites.length + backupWrites(local).length + restoreWrites(local).length
        + seasonWrites.playerWrites.length + seasonWrites.worldWrites.length,
    },
    batchTimings: {
      source: sourceBatchTimings,
      backup: backupBatchTimings,
      restore: restoreBatchTimings,
      migratedPlayers: migratedPlayerBatchTimings,
      world: worldBatchTimings,
    },
    timings,
    durationMs: Number(durationMs.toFixed(3)),
    freshDurationMs: replayed ? Number(existing.data.freshDurationMs || existing.data.durationMs) : Number(durationMs.toFixed(3)),
    replayDurationMs: replayed ? Number(durationMs.toFixed(3)) : null,
    productionMutationPerformed: false,
    productionProjectTargeted: false,
  };
  result.convergenceHash = reset.hashValue({
    candidate: result.candidate.sourceBundleHash,
    persistence: result.persistence,
    clans: result.clans,
    flags: result.flags,
    world: result.world,
    pointer: result.activePointer,
    backup: { backupHash: result.backup.backupHash, restoreHash: result.restore.restoreHash },
  });
  result.receiptHash = reset.hashValue(result);
  await setDocument(RUN_ROOT, { ...result, status: "PASS", completedAt: new Date() });
  fs.mkdirSync(RESULT_DIRECTORY, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`RESET-2 staging dress rehearsal passed (${remoteValidation.playerDocuments} players, ${remoteValidation.coreRegionDocuments} Core maps, ${remoteValidation.coreCityDocuments} Core cities, ${result.writeCounts.totalDataWrites} deterministic staging data writes).`);
  return result;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ main, RESULT_PATH, RUN_ID, RUN_ROOT, POINTER_PATH, PRIOR_ABORTED_RUN_PATHS });
