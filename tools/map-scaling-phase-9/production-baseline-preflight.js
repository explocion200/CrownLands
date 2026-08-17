"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CONFIG } = require("./environment");
const { googleRequest } = require("./google-api");
const {
  createCurrentProductionWorldAdapter,
  readLockedAssetManifest,
} = require("../map-scaling-phase-7/architecture");

const RESULTS_PATH = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results/PRODUCTION_READ_ONLY_PREFLIGHT.json");
const ALLOWED_PRODUCTION_METHODS = Object.freeze(["GET", "POST_RUN_QUERY"]);

function requireReadOnlyProductionAcknowledgement() {
  const projectId = String(process.env.CROWNLANDS_PRODUCTION_PREFLIGHT_PROJECT_ID || "").trim();
  const acknowledgement = String(process.env.CROWNLANDS_PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT || "").trim();
  if (projectId !== CONFIG.productionProjectId) throw new Error(`Expected production project ${CONFIG.productionProjectId}.`);
  if (acknowledgement !== `READ_ONLY_PRODUCTION_PREFLIGHT:${CONFIG.productionProjectId}`) {
    throw new Error("Explicit read-only production-preflight acknowledgement is required.");
  }
  return projectId;
}

async function getProductionDocument(projectId, documentPath) {
  assert(ALLOWED_PRODUCTION_METHODS.includes("GET"));
  return googleRequest(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    { allowStatuses: [403, 404] },
  );
}

async function runProductionQuery(projectId, structuredQuery) {
  assert(ALLOWED_PRODUCTION_METHODS.includes("POST_RUN_QUERY"));
  return googleRequest(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      body: { structuredQuery },
      allowStatuses: [403, 404],
    },
  );
}

function documentsFromRunQuery(response) {
  return Array.isArray(response.body) ? response.body.map(item => item.document).filter(Boolean) : [];
}

async function main() {
  const projectId = requireReadOnlyProductionAcknowledgement();
  const adapter = createCurrentProductionWorldAdapter();
  const asset = readLockedAssetManifest();
  const controls = await getProductionDocument(projectId, "phase9Controls/production");
  const catalogQuery = await runProductionQuery(projectId, {
    from: [{ collectionId: "catalog", allDescendants: true }],
    select: { fields: [{ fieldPath: "regionId" }, { fieldPath: "packageHash" }, { fieldPath: "gridX" }, { fieldPath: "gridY" }, { fieldPath: "lifecycle" }] },
  });
  const locksQuery = await runProductionQuery(projectId, {
    from: [{ collectionId: "coordinateLocks", allDescendants: true }],
    select: { fields: [{ fieldPath: "regionId" }, { fieldPath: "gridX" }, { fieldPath: "gridY" }] },
  });
  const packagesQuery = await runProductionQuery(projectId, {
    from: [{ collectionId: "packages", allDescendants: true }],
    select: { fields: [{ fieldPath: "regionId" }, { fieldPath: "packageHash" }] },
  });
  const catalogDocuments = catalogQuery.status === 200 ? documentsFromRunQuery(catalogQuery) : [];
  const active = catalogDocuments.filter(document => document.fields?.lifecycle?.stringValue === "ACTIVE");
  const locks = locksQuery.status === 200 ? documentsFromRunQuery(locksQuery) : [];
  const packages = packagesQuery.status === 200 ? documentsFromRunQuery(packagesQuery) : [];
  const lockNames = locks.map(document => document.name);
  const packageNames = packages.map(document => document.name);
  const result = {
    schemaVersion: "phase9-read-only-production-preflight-v1",
    mode: "READ_ONLY",
    projectId,
    allowedExternalMethods: ALLOWED_PRODUCTION_METHODS,
    mutationMethodsPresent: false,
    productionBaseline: {
      mapCount: adapter.productionMapCount,
      cityDefinitionCount: adapter.productionCityCount,
      directedMapChainCount: adapter.directedMapChainCount,
      generatedActiveRegionCount: active.length,
      assetManifestHash: asset.hash,
    },
    rolloutControls: controls.status === 200 ? "PRESENT_REQUIRES_FIELD_VALIDATION" : "NOT_PROVISIONED_EFFECTIVELY_OFF",
    generatedWorldCollections: {
      activeCatalogDocuments: active.length,
      coordinateLockDocuments: locks.length,
      packageDocuments: packages.length,
      duplicateCoordinateDocumentNames: lockNames.length - new Set(lockNames).size,
      duplicatePackageDocumentNames: packageNames.length - new Set(packageNames).size,
    },
    pass: adapter.productionMapCount === 15
      && adapter.productionCityCount === 1050
      && adapter.directedMapChainCount === 210
      && active.length === 0
      && asset.hash === CONFIG.assetManifestHash,
    productionMutationPerformed: false,
    checkedAt: new Date().toISOString(),
  };
  assert.equal(result.pass, true);
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-production-preflight-error"}: ${error.message}`);
  process.exitCode = 1;
});
