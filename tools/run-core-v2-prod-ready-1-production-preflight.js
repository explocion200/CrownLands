"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { googleRequest } = require("./map-scaling-phase-9/google-api.js");
const { createCurrentProductionWorldAdapter, readLockedAssetManifest } = require("./map-scaling-phase-7/architecture.js");
const prodReady = require("./core-v2-prod-ready-1/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-prod-ready-1", "PRODUCTION_READ_ONLY_PREFLIGHT.json");
const PROJECT_ID = "crown-land-b15e0";
const DATABASE_ID = "(default)";
const DATABASE_NAME = `projects/${PROJECT_ID}/databases/${DATABASE_ID}`;
const ALLOWED_METHODS = Object.freeze(["GET", "POST_RUN_QUERY"]);

function requireReadOnlyAcknowledgement() {
  const projectId = String(process.env.CROWNLANDS_PROD_READY_PREFLIGHT_PROJECT_ID || "").trim();
  const acknowledgement = String(process.env.CROWNLANDS_PROD_READY_PREFLIGHT_ACKNOWLEDGEMENT || "").trim();
  assert.equal(projectId, PROJECT_ID, `Expected production project ${PROJECT_ID}.`);
  assert.equal(acknowledgement, `READ_ONLY_PROD_READY_PREFLIGHT:${PROJECT_ID}`, "Explicit read-only acknowledgement is required.");
  return projectId;
}

async function read(url, allowStatuses = [403, 404]) {
  assert(ALLOWED_METHODS.includes("GET"));
  return googleRequest(url, { quotaProjectId: PROJECT_ID, allowStatuses });
}

async function runQuery(structuredQuery) {
  assert(ALLOWED_METHODS.includes("POST_RUN_QUERY"));
  return googleRequest(
    `https://firestore.googleapis.com/v1/${DATABASE_NAME}/documents:runQuery`,
    { method: "POST", quotaProjectId: PROJECT_ID, body: { structuredQuery }, allowStatuses: [403, 404] },
  );
}

function decode(value) {
  if (!value || typeof value !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, "arrayValue")) return (value.arrayValue.values || []).map(decode);
  if (Object.prototype.hasOwnProperty.call(value, "mapValue")) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

function documents(response) {
  return response.status === 200 && Array.isArray(response.body)
    ? response.body.map(item => item.document).filter(Boolean)
    : [];
}

function gearState(player) {
  const gear = player.gear || player.Gear || {};
  const instances = gear.instances && typeof gear.instances === "object" ? gear.instances : {};
  const equipped = gear.equipped && typeof gear.equipped === "object" ? gear.equipped : {};
  const equippedRefs = Object.values(equipped).flatMap(slots => Object.values(slots && typeof slots === "object" ? slots : {})).filter(Boolean);
  return { instances: Object.keys(instances).length, equippedRefs: equippedRefs.length };
}

async function indexesFor(collectionGroup) {
  const response = await read(
    `https://firestore.googleapis.com/v1/${DATABASE_NAME}/collectionGroups/${encodeURIComponent(collectionGroup)}/indexes`,
  );
  return response.status === 200 ? response.body.indexes || [] : [];
}

function controlsOff(document, fields) {
  if (document.status === 404) return true;
  if (document.status !== 200) return false;
  const value = decodeFields(document.body.fields || {});
  return fields.every(field => value[field] === false);
}

function clanMembershipIntegrity(players, clanMemberDocuments) {
  const playersByUid = new Map(players.map(player => [player.id, player]));
  const members = clanMemberDocuments.map(document => {
    const parts = String(document.name || "").split("/documents/").at(-1).split("/");
    const value = decodeFields(document.fields || {});
    return { clanId: parts[1] || "", uid: parts[3] || value.uid || "", role: value.role || "" };
  });
  const membershipsByUid = new Map();
  members.forEach(member => {
    if (!membershipsByUid.has(member.uid)) membershipsByUid.set(member.uid, []);
    membershipsByUid.get(member.uid).push(member);
  });
  const playerMemberships = players.filter(player => player.clanId);
  const staleOrphanMembers = members.filter(member => !playersByUid.has(member.uid) || !playersByUid.get(member.uid).clanId);
  const playerMissingMember = playerMemberships.filter(player => !(membershipsByUid.get(player.id) || []).some(member => member.clanId === player.clanId));
  const staleConflictingMembers = members.filter(member => playersByUid.get(member.uid)?.clanId && playersByUid.get(member.uid).clanId !== member.clanId);
  const roleMismatch = members.filter(member => {
    const player = playersByUid.get(member.uid);
    return player?.clanId === member.clanId && player.clanRole !== member.role;
  });
  const duplicateAuthoritativeMemberships = playerMemberships.filter(player => (
    (membershipsByUid.get(player.id) || []).filter(member => member.clanId === player.clanId).length > 1
  ));
  const migrationSafe = playerMissingMember.length === 0 && roleMismatch.length === 0 && duplicateAuthoritativeMemberships.length === 0;
  return {
    sourceMemberDocumentCount: members.length,
    authoritativePlayerMembershipCount: playerMemberships.length,
    staleOrphanMemberDocumentCount: staleOrphanMembers.length,
    playerMissingMemberDocumentCount: playerMissingMember.length,
    staleConflictingMemberDocumentCount: staleConflictingMembers.length,
    roleMismatchCount: roleMismatch.length,
    duplicateAuthoritativeMembershipCount: duplicateAuthoritativeMemberships.length,
    staleOrphansExcludedFromMigration: true,
    migrationSafe,
    mismatchReceiptHash: prodReady.hashValue({ staleOrphanMembers, staleConflictingMembers, playerMissingMember, duplicateAuthoritativeMemberships, roleMismatch }),
  };
}

async function main() {
  const projectId = requireReadOnlyAcknowledgement();
  const production = createCurrentProductionWorldAdapter();
  const asset = readLockedAssetManifest();
  const candidate = prodReady.buildCandidateIdentity();
  const indexSpec = JSON.parse(fs.readFileSync(path.join(ROOT, "firestore.indexes.json"), "utf8"));
  const groups = [...new Set(indexSpec.indexes.map(index => index.collectionGroup))].sort();

  const [playerResult, clanResult, clanMemberResult, catalogResult, database, autoControls, resetControls, rolloutControls, functions, schedules, backups, schedulerJobs, ...indexLists] = await Promise.all([
    runQuery({ from: [{ collectionId: "players" }], select: { fields: [
      { fieldPath: "flag" }, { fieldPath: "clanId" }, { fieldPath: "clanRole" }, { fieldPath: "gear" }, { fieldPath: "Gear" },
    ] } }),
    runQuery({ from: [{ collectionId: "clans" }], select: { fields: [{ fieldPath: "clanId" }, { fieldPath: "members" }] } }),
    runQuery({ from: [{ collectionId: "members", allDescendants: true }], select: { fields: [{ fieldPath: "uid" }, { fieldPath: "role" }] } }),
    runQuery({ from: [{ collectionId: "catalog", allDescendants: true }], select: { fields: [{ fieldPath: "regionId" }, { fieldPath: "lifecycle" }] } }),
    read(`https://firestore.googleapis.com/v1/${DATABASE_NAME}`),
    read(`https://firestore.googleapis.com/v1/${DATABASE_NAME}/documents/automaticSeasonReset/config`),
    read(`https://firestore.googleapis.com/v1/${DATABASE_NAME}/documents/resetControls/production`),
    read(`https://firestore.googleapis.com/v1/${DATABASE_NAME}/documents/phase9Controls/production`),
    read(`https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/-/functions?pageSize=1000`),
    read(`https://firestore.googleapis.com/v1/${DATABASE_NAME}/backupSchedules?pageSize=100`),
    read(`https://firestore.googleapis.com/v1/projects/${projectId}/locations/-/backups?pageSize=1000`),
    read(`https://cloudscheduler.googleapis.com/v1/projects/${projectId}/locations/us-central1/jobs?pageSize=500`),
    ...groups.map(indexesFor),
  ]);

  const playerDocuments = documents(playerResult);
  const clanDocuments = documents(clanResult);
  const clanMemberDocuments = documents(clanMemberResult).filter(document => String(document.name || "").includes("/documents/clans/"));
  const catalogDocuments = documents(catalogResult);
  const players = playerDocuments.map(document => ({ id: document.name.split("/").at(-1), ...decodeFields(document.fields || {}) }));
  const clanMemberships = clanMembershipIntegrity(players, clanMemberDocuments);
  const gear = players.map(gearState);
  const generatedActive = catalogDocuments.filter(document => decodeFields(document.fields || {}).lifecycle === "ACTIVE").length;
  const coreV2Records = catalogDocuments.filter(document => String(decodeFields(document.fields || {}).regionId || "").startsWith("core-v2-")).length;
  const allIndexes = indexLists.flat();
  const indexesReady = indexLists.every(list => list.length > 0 && list.every(index => index.state === "READY"));
  const backupSchedules = schedules.status === 200 ? schedules.body.backupSchedules || [] : [];
  const backupList = backups.status === 200 ? backups.body.backups || [] : [];
  const readyBackups = backupList.filter(backup => backup.state === "READY" && backup.database === DATABASE_NAME);
  const resetFunctions = functions.status === 200 ? (functions.body.functions || []).filter(fn => /MonthlySeasonReset|prebuildNextMonthlySeason|catchUpMonthlySeasonReset/i.test(fn.name || "")) : [];
  const resetJobs = schedulerJobs.status === 200 ? (schedulerJobs.body.jobs || []).filter(job => /MonthlySeasonReset|prebuildNextMonthlySeason|catchUpMonthlySeasonReset/i.test(job.name || "")) : [];
  const productionSchedulersSafe = resetJobs.length === 0 || resetJobs.every(job => job.state === "PAUSED");
  const allResetFlagsOff = controlsOff(autoControls, ["monthlySeasonResetEnabled", "automaticPrebuildEnabled", "automaticCutoverEnabled"])
    && controlsOff(resetControls, ["resetEnabled", "seasonCutoverEnabled", "automaticResetEnabled"])
    && controlsOff(rolloutControls, ["generatedWorldEnabled", "generationEnabled", "publicationEnabled", "activationEnabled", "expansionEnabled"]);

  const result = {
    schemaVersion: "crownlands-prod-ready-1-production-read-only-preflight-v1",
    mode: "READ_ONLY",
    projectId,
    database: DATABASE_ID,
    allowedMethods: ALLOWED_METHODS,
    mutationMethodsPresent: false,
    candidate: {
      candidateId: candidate.candidateId,
      approvedAutoResetGitSha: candidate.approvedAutoResetGitSha,
      reset2CandidateId: candidate.reset2CandidateId,
      reset2SourceBundleHash: candidate.reset2SourceBundleHash,
      corePackageHash: candidate.corePackageHash,
      sourceBundleHash: candidate.sourceBundleHash,
    },
    world: {
      maps: production.productionMapCount,
      cities: production.productionCityCount,
      directedChains: production.directedMapChainCount,
      generatedActive,
      coreV2Records,
      assetManifestHash: asset.hash,
    },
    players: {
      exactCount: players.length,
      withFlag: players.filter(player => player.flag && typeof player.flag === "object").length,
      withClanMembership: players.filter(player => player.clanId).length,
      commonGearInstances: gear.reduce((sum, value) => sum + value.instances, 0),
      equippedCommonGearReferences: gear.reduce((sum, value) => sum + value.equippedRefs, 0),
      schemaCompatible: players.every(player => {
        const raw = player.gear || player.Gear || {};
        return !raw.instances || (typeof raw.instances === "object" && !Array.isArray(raw.instances));
      }),
      payloadRetained: false,
    },
    clans: {
      exactRecordCount: clanDocuments.length,
      exactMembershipDocumentCount: clanMemberDocuments.length,
      projectedPlayerMembershipCount: players.filter(player => player.clanId).length,
      membershipCountsMatch: clanMemberDocuments.length === players.filter(player => player.clanId).length,
      membershipShapeCompatible: clanMemberDocuments.every(document => {
        const member = decodeFields(document.fields || {});
        return ["leader", "officer", "member"].includes(member.role);
      }),
      integrity: clanMemberships,
      payloadRetained: false,
    },
    infrastructure: {
      databaseReachable: database.status === 200,
      locationId: database.body?.locationId || null,
      pointInTimeRecoveryEnablement: database.body?.pointInTimeRecoveryEnablement || "UNSPECIFIED",
      versionRetentionPeriod: database.body?.versionRetentionPeriod || null,
      earliestVersionTime: database.body?.earliestVersionTime || null,
      deleteProtectionState: database.body?.deleteProtectionState || "UNSPECIFIED",
      backupSchedules,
      readyBackups,
      requiredIndexSpecificationCount: indexSpec.indexes.length,
      requiredCollectionGroups: groups,
      deployedIndexCountObserved: allIndexes.length,
      deployedIndexesReady: indexesReady,
      deployedIndexStateCounts: allIndexes.reduce((counts, index) => {
        counts[index.state || "UNKNOWN"] = (counts[index.state || "UNKNOWN"] || 0) + 1;
        return counts;
      }, {}),
    },
    automation: {
      allResetFlagsOff,
      automaticResetFunctions: resetFunctions.map(fn => ({ name: fn.name, state: fn.state, runtime: fn.buildConfig?.runtime })),
      schedulerJobs: resetJobs.map(job => ({ name: job.name, state: job.state, schedule: job.schedule, timeZone: job.timeZone })),
      productionSchedulersSafe,
    },
    pass: production.productionMapCount === 15
      && production.productionCityCount === 1050
      && production.directedMapChainCount === 210
      && generatedActive === 0
      && coreV2Records === 0
      && asset.hash === prodReady.ASSET_MANIFEST_HASH
      && indexesReady
      && clanMemberships.migrationSafe
      && allResetFlagsOff
      && productionSchedulersSafe,
    productionGameplayDataWritePerformed: false,
    productionWorldMutationPerformed: false,
    checkedAt: new Date().toISOString(),
  };
  assert.equal(result.pass, true, `Production preflight failed: ${JSON.stringify({ clans: result.clans, world: result.world, automation: result.automation })}`);
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) main().catch(error => {
  console.error(`${error.code || "prod-ready-preflight-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});

module.exports = Object.freeze({ RESULT_PATH, ALLOWED_METHODS, main });
