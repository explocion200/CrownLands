"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CONFIG, requireExplicitProjectIdentity, environmentBanner } = require("./environment");
const {
  getDocument,
  getStagingWebConfig,
  createAnonymousIdentity,
  downloadPublicObject,
} = require("./staging-api");

const RESULTS_ROOT = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results");
const RESULT_PATH = path.join(RESULTS_ROOT, "SECURITY_RULES_PROBE.json");

async function packageMap(worldRoot, regionId) {
  const region = await getDocument(`${worldRoot}/regions/${regionId}`);
  const packageDocument = await getDocument(`${worldRoot}/packages/${region.data.packageHash}`);
  return {
    lifecycle: region.data.lifecycle,
    object: packageDocument.data.objects.find(object => object.name === "map.webp"),
  };
}

async function main() {
  const identity = requireExplicitProjectIdentity({
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
  });
  console.log(environmentBanner(identity));
  const { sdk } = getStagingWebConfig();
  const player = await createAnonymousIdentity(sdk.apiKey);
  const auth = { Authorization: `Firebase ${player.idToken}` };
  const worldRoot = `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}`;
  const active = await packageMap(worldRoot, "phase6d_region_0001");
  const standby = await packageMap(worldRoot, "phase6d_region_0004");
  const [unauthenticatedActive, authenticatedActive, authenticatedStandby] = await Promise.all([
    downloadPublicObject(active.object.path),
    downloadPublicObject(active.object.path, { headers: auth }),
    downloadPublicObject(standby.object.path, { headers: auth }),
  ]);
  assert.equal(active.lifecycle, "ACTIVE");
  assert.equal(standby.lifecycle, "STANDBY");
  assert.equal(unauthenticatedActive.status, 200);
  assert.equal(unauthenticatedActive.sha256, active.object.sha256);
  assert.equal(authenticatedActive.status, 200);
  assert.equal(authenticatedActive.sha256, active.object.sha256);
  assert.equal(authenticatedStandby.status, 403);
  const result = {
    schemaVersion: "phase9-real-security-rules-probe-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    storage: {
      publicPublishedActiveMapStatus: unauthenticatedActive.status,
      publicPublishedActiveHashVerified: unauthenticatedActive.sha256 === active.object.sha256,
      authenticatedActiveMapStatus: authenticatedActive.status,
      authenticatedActiveHashVerified: authenticatedActive.sha256 === active.object.sha256,
      authenticatedStandbyMapStatus: authenticatedStandby.status,
      publicationMarkerRequired: true,
    },
    crossServiceRulesRole: "roles/firebaserules.firestoreServiceAgent",
    productionMutationPerformed: false,
    result: "PASS",
    completedAt: new Date().toISOString(),
  };
  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, completedAt: undefined }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-security-rules-probe-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});
