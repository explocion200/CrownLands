"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  CONFIG,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { accessToken } = require("./google-api");
const { getDocument, listDocuments, setDocument } = require("./staging-api");
const { RETENTION_HOURS, classifyOrphan } = require("./orphan-cleanup-policy");

const RESULTS_ROOT = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results");
const RESULT_PATH = path.join(RESULTS_ROOT, "ORPHAN_CLEANUP.json");

async function main() {
  const identity = requireMutationConfirmation({
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  });
  console.log(environmentBanner(identity));
  const controls = await getDocument("phase9Controls/staging");
  for (const flag of ["generationEnabled", "publicationEnabled", "activationEnabled", "expansionEnabled"]) {
    assert.equal(controls.data[flag], false, `Cleanup dry-run requires ${flag} OFF.`);
  }

  const now = Date.now();
  const fixtures = [
    [{ lifecycle: "GENERATING", updatedAt: new Date(now - 25 * 3_600_000).toISOString() }, true],
    [{ lifecycle: "GENERATING", updatedAt: new Date(now - 23 * 3_600_000).toISOString() }, false],
    [{ lifecycle: "FAILED", updatedAt: new Date(now - 721 * 3_600_000).toISOString() }, true],
    [{ lifecycle: "ROLLED_BACK", updatedAt: new Date(now - 721 * 3_600_000).toISOString() }, true],
    [{ lifecycle: "SUPERSEDED", updatedAt: new Date(now - 721 * 3_600_000).toISOString() }, true],
    [{ lifecycle: "GENERATING", abandonedUpload: true, updatedAt: new Date(now - 169 * 3_600_000).toISOString() }, true],
    [{ lifecycle: "PUBLISHED", updatedAt: new Date(now - 10_000 * 3_600_000).toISOString() }, false],
    [{ lifecycle: "FAILED", publicationMarkerExists: true, updatedAt: new Date(now - 10_000 * 3_600_000).toISOString() }, false],
    [{ lifecycle: "ACTIVE", updatedAt: new Date(now - 10_000 * 3_600_000).toISOString() }, false],
  ];
  for (const [fixture, expected] of fixtures) assert.equal(classifyOrphan(fixture, now).eligible, expected);

  const worldRoot = `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}`;
  const [regions, markers, packages] = await Promise.all([
    listDocuments(`${worldRoot}/regions`, { pageSize: 300 }),
    listDocuments(`${worldRoot}/publicationMarkers`, { pageSize: 300 }),
    listDocuments(`${worldRoot}/packages`, { pageSize: 300 }),
  ]);
  const markerRegions = new Set(markers.documents.map(document => document.data.regionId));
  const packageByHash = new Map(packages.documents.map(document => [document.data.packageHash, document]));
  const observations = regions.documents.map(document => {
    const data = document.data;
    const packageDocument = packageByHash.get(data.packageHash);
    const decision = classifyOrphan({
      lifecycle: data.lifecycle,
      updatedAt: data.updatedAt || document.updateTime,
      createdAt: data.createdAt || document.createTime,
      publicationMarkerExists: markerRegions.has(data.regionId),
      immutable: packageDocument?.data?.immutable === true,
    }, now);
    return {
      regionId: data.regionId,
      lifecycle: data.lifecycle,
      packageHash: data.packageHash || null,
      publicationMarkerExists: markerRegions.has(data.regionId),
      immutablePackage: packageDocument?.data?.immutable === true,
      ...decision,
    };
  });
  const eligible = observations.filter(observation => observation.eligible);
  const protectedPublished = observations.filter(observation => ["PUBLISHED", "ACTIVE"].includes(observation.lifecycle));
  assert(protectedPublished.every(observation => !observation.eligible));

  const operator = await accessToken();
  const receiptId = `orphan_cleanup_dry_run_${Date.now()}`;
  await setDocument(`phase9Operations/${receiptId}`, {
    schemaVersion: "phase9-orphan-cleanup-receipt-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    action: "cleanup_dry_run",
    actor: operator.email || "firebase-cli-operator",
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
    retentionHours: RETENTION_HOURS,
    publicationMarkersChecked: true,
    regionCount: observations.length,
    eligibleCount: eligible.length,
    eligibleRegionIds: eligible.map(item => item.regionId),
    protectedPublishedCount: protectedPublished.length,
    result: "PASS",
    deletionPerformed: false,
    productionMutationPerformed: false,
    timestamp: new Date(),
  }, { mustNotExist: true });
  const result = {
    schemaVersion: "phase9-orphan-cleanup-result-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    mode: "DRY_RUN",
    retentionHours: RETENTION_HOURS,
    syntheticPolicyCasesPassed: fixtures.length,
    publicationMarkersChecked: true,
    observations,
    eligibleCount: eligible.length,
    protectedPublishedCount: protectedPublished.length,
    publishedPackageDeletionAttempted: false,
    deletionPerformed: false,
    auditReceiptId: receiptId,
    productionMutationPerformed: false,
    result: "PASS",
    completedAt: new Date().toISOString(),
  };
  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    result: result.result,
    mode: result.mode,
    regionsInspected: observations.length,
    eligibleCount: eligible.length,
    protectedPublishedCount: protectedPublished.length,
    deletionPerformed: false,
    productionMutationPerformed: false,
    resultPath: path.relative(process.cwd(), RESULT_PATH),
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-orphan-cleanup-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});
