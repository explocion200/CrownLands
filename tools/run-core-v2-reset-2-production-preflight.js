"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CONFIG } = require("./map-scaling-phase-9/environment.js");
const { googleRequest } = require("./map-scaling-phase-9/google-api.js");
const {
  createCurrentProductionWorldAdapter,
  readLockedAssetManifest,
} = require("./map-scaling-phase-7/architecture.js");
const resetRuntime = require("../functions/reset-runtime-guard.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-2", "PRODUCTION_READ_ONLY_PREFLIGHT.json");
const ALLOWED_EXTERNAL_METHODS = Object.freeze(["GET", "POST_RUN_QUERY"]);

function requireReadOnlyAcknowledgement() {
  const projectId = String(process.env.CROWNLANDS_PRODUCTION_PREFLIGHT_PROJECT_ID || "").trim();
  const acknowledgement = String(process.env.CROWNLANDS_PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT || "").trim();
  assert.equal(projectId, CONFIG.productionProjectId, `Expected production project ${CONFIG.productionProjectId}.`);
  assert.equal(
    acknowledgement,
    `READ_ONLY_PRODUCTION_PREFLIGHT:${CONFIG.productionProjectId}`,
    "Explicit read-only production-preflight acknowledgement is required.",
  );
  return projectId;
}

async function read(projectId, url, allowStatuses = [403, 404]) {
  assert(ALLOWED_EXTERNAL_METHODS.includes("GET"));
  return googleRequest(url, { quotaProjectId: projectId, allowStatuses });
}

async function runQuery(projectId, structuredQuery) {
  assert(ALLOWED_EXTERNAL_METHODS.includes("POST_RUN_QUERY"));
  return googleRequest(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    { method: "POST", quotaProjectId: projectId, body: { structuredQuery }, allowStatuses: [403, 404] },
  );
}

function queryDocuments(response) {
  return response.status === 200 && Array.isArray(response.body)
    ? response.body.map(item => item.document).filter(Boolean)
    : [];
}

function decodeGearInstances(document) {
  const fields = document.fields || {};
  const instances = fields.gear?.mapValue?.fields?.instances?.mapValue?.fields
    || fields.Gear?.mapValue?.fields?.instances?.mapValue?.fields
    || {};
  return Object.keys(instances).length;
}

async function listIndexes(projectId, collectionGroup) {
  const encodedDatabase = encodeURIComponent("(default)");
  const response = await read(
    projectId,
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodedDatabase}/collectionGroups/${encodeURIComponent(collectionGroup)}/indexes`,
  );
  return response.status === 200 ? response.body.indexes || [] : [];
}

async function main() {
  const projectId = requireReadOnlyAcknowledgement();
  const production = createCurrentProductionWorldAdapter();
  const asset = readLockedAssetManifest();
  const releaseConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "functions", "release-config.json"), "utf8"));
  const indexSpecification = JSON.parse(fs.readFileSync(path.join(ROOT, "firestore.indexes.json"), "utf8"));
  const requiredCollectionGroups = [...new Set(indexSpecification.indexes.map(index => index.collectionGroup))].sort();

  const playerQuery = await runQuery(projectId, {
    from: [{ collectionId: "players" }],
    select: { fields: [{ fieldPath: "gear.instances" }, { fieldPath: "Gear.instances" }, { fieldPath: "clanId" }] },
  });
  const clanQuery = await runQuery(projectId, {
    from: [{ collectionId: "clans" }],
    select: { fields: [{ fieldPath: "clanId" }] },
  });
  const generatedCatalogQuery = await runQuery(projectId, {
    from: [{ collectionId: "catalog", allDescendants: true }],
    select: { fields: [{ fieldPath: "regionId" }, { fieldPath: "lifecycle" }] },
  });
  const [database, resetControls, rolloutControls, functions, ...indexLists] = await Promise.all([
    read(projectId, `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`),
    read(projectId, `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/resetControls/production`),
    read(projectId, `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/phase9Controls/production`),
    read(projectId, `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/us-central1/functions?pageSize=1000`),
    ...requiredCollectionGroups.map(group => listIndexes(projectId, group)),
  ]);

  const players = queryDocuments(playerQuery);
  const clans = queryDocuments(clanQuery);
  const catalogs = queryDocuments(generatedCatalogQuery);
  const generatedActiveRegions = catalogs.filter(document => document.fields?.lifecycle?.stringValue === "ACTIVE").length;
  const deployedIndexes = indexLists.flat();
  const indexStates = deployedIndexes.reduce((counts, index) => {
    const state = index.state || "UNKNOWN";
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, {});
  const localControls = resetRuntime.normalizeControls();
  const remoteResetControls = resetControls.status === 200 ? "PRESENT_REQUIRES_OPERATOR_REVIEW" : "NOT_PROVISIONED_EFFECTIVELY_OFF";
  const remoteRolloutControls = rolloutControls.status === 200 ? "PRESENT_REQUIRES_OPERATOR_REVIEW" : "NOT_PROVISIONED_EFFECTIVELY_OFF";
  const result = {
    schemaVersion: "core-v2-reset-2-production-read-only-preflight-v1",
    mode: "READ_ONLY",
    projectId,
    allowedExternalMethods: ALLOWED_EXTERNAL_METHODS,
    mutationMethodsPresent: false,
    activeWorldIdentity: {
      releaseId: releaseConfig.releaseId,
      worldId: releaseConfig.worldId,
      resetGeneration: releaseConfig.resetGeneration,
      source: "locked deployed-release configuration",
    },
    productionBaseline: {
      mapCount: production.productionMapCount,
      cityDefinitionCount: production.productionCityCount,
      directedMapChainCount: production.directedMapChainCount,
      generatedActiveRegionCount: generatedActiveRegions,
      unexpectedCoreV2RecordCount: catalogs.filter(document => (
        document.fields?.regionId?.stringValue || ""
      ).startsWith("core-v2-")).length,
      assetManifestHash: asset.hash,
    },
    productionDataShape: {
      playerCount: players.length,
      clanRecordCount: clans.length,
      playersWithGear: players.filter(document => decodeGearInstances(document) > 0).length,
      commonGearInstanceCount: players.reduce((sum, document) => sum + decodeGearInstances(document), 0),
      source: "field-projected Firestore read-only queries; no player payload retained",
    },
    firebase: {
      databaseReachable: database.status === 200,
      databaseType: database.body?.type || null,
      pointInTimeRecoveryEnablement: database.body?.pointInTimeRecoveryEnablement || "UNSPECIFIED",
      deleteProtectionState: database.body?.deleteProtectionState || "UNSPECIFIED",
      deployedFunctionCount: functions.status === 200 ? (functions.body.functions || []).length : null,
      requiredIndexSpecificationCount: indexSpecification.indexes.length,
      requiredCollectionGroups,
      deployedIndexCountObserved: deployedIndexes.length,
      deployedIndexStates: indexStates,
      backupCapabilityObserved: database.status === 200,
    },
    controls: {
      resetControls: remoteResetControls,
      generatedWorldRolloutControls: remoteRolloutControls,
      candidateDefaults: localControls,
      candidateResetControlsOff: localControls.resetEnabled === false
        && localControls.seasonCutoverEnabled === false
        && localControls.automaticResetEnabled === false,
      candidateKillSwitchesEngaged: Object.values(localControls.killSwitches).every(Boolean),
    },
    pass: production.productionMapCount === 15
      && production.productionCityCount === 1050
      && production.directedMapChainCount === 210
      && generatedActiveRegions === 0
      && asset.hash === CONFIG.assetManifestHash
      && localControls.resetEnabled === false
      && localControls.seasonCutoverEnabled === false
      && localControls.automaticResetEnabled === false
      && Object.values(localControls.killSwitches).every(Boolean),
    productionMutationPerformed: false,
    checkedAt: new Date().toISOString(),
  };
  assert.equal(result.pass, true);
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  main().catch(error => {
    console.error(`${error.code || "reset2-production-preflight-error"}: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ ALLOWED_EXTERNAL_METHODS, RESULT_PATH, main });
