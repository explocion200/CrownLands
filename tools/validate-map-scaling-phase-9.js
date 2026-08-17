"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  ASSET_MANIFEST_HASH,
  readLockedAssetManifest,
  createCurrentProductionWorldAdapter,
} = require("./map-scaling-phase-7/architecture");
const { CONFIG } = require("./map-scaling-phase-9/environment");

const ROOT = path.resolve(__dirname, "..");
const APPROVED_PHASE8_COMMIT = "dac3ef0d37583e85433d024db92c4692554282a0";
const PHASE9_ROOTS = Object.freeze([
  "docs/map-scaling-audit/phase-9/",
  "tools/map-scaling-phase-9/",
  "tools/validate-phase-9-environment-guard.js",
  "tools/validate-map-scaling-phase-9.js",
]);

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trimEnd();
}

function collectFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function readResult(name) {
  const file = path.join(ROOT, "docs", "map-scaling-audit", "phase-9", "results", name);
  assert(fs.existsSync(file), `Missing Phase 9 evidence ${name}.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assertDevelopmentOnlyDiff() {
  const tracked = git("diff", "--name-only", APPROVED_PHASE8_COMMIT, "--")
    .split(/\r?\n/).filter(Boolean).map(file => file.replaceAll("\\", "/"));
  const untracked = git("ls-files", "--others", "--exclude-standard")
    .split(/\r?\n/).filter(Boolean).map(file => file.replaceAll("\\", "/"));
  const changed = [...new Set([...tracked, ...untracked])].sort();
  const unexpected = changed.filter(file => !PHASE9_ROOTS.some(allowed => (
    allowed.endsWith("/") ? file.startsWith(allowed) : file === allowed
  )));
  assert.deepEqual(unexpected, [], `Production/non-Phase-9 files changed: ${unexpected.join(", ")}`);
  assert.equal(git("diff", "--name-only", APPROVED_PHASE8_COMMIT, "--", "benchmark-results/map/phase-6d/asset-library"), "");
  return changed;
}

function assertNoProductionLeakage() {
  const forbiddenDirectories = [
    path.join(ROOT, "dist", "tools", "map-scaling-phase-9"),
    path.join(ROOT, "dist", "docs", "map-scaling-audit", "phase-9"),
  ];
  for (const directory of forbiddenDirectories) assert(!fs.existsSync(directory), `Phase 9 leaked into ${directory}.`);
  const signatures = [
    "phase9-staging-controls-v1",
    "crownlands-map-staging-2026",
    "PHASE9_STAGING_MUTATION",
    "phase9ActivateRegion",
  ];
  const distText = collectFiles(path.join(ROOT, "dist")).filter(file => /\.(?:js|json|html|css|txt)$/i.test(file));
  for (const file of distText) {
    const source = fs.readFileSync(file, "utf8");
    for (const signature of signatures) assert(!source.includes(signature), `${signature} leaked into ${path.relative(ROOT, file)}.`);
  }
  const productionSources = [
    ...collectFiles(path.join(ROOT, "functions")),
    ...collectFiles(ROOT).filter(file => path.dirname(file) === ROOT),
  ].filter(file => /\.(?:js|json|html|css)$/i.test(file));
  for (const file of productionSources) {
    const source = fs.readFileSync(file, "utf8");
    assert(!source.includes("map-scaling-phase-9"), `Production source imports Phase 9 from ${path.relative(ROOT, file)}.`);
  }
  return { forbiddenDirectoriesAbsent: forbiddenDirectories.length, distTextFilesScanned: distText.length };
}

function validateStaticSources() {
  const functions = fs.readFileSync(path.join(ROOT, "tools/map-scaling-phase-9/firebase/functions/index.js"), "utf8");
  const firestoreRules = fs.readFileSync(path.join(ROOT, "tools/map-scaling-phase-9/firebase/firestore.rules"), "utf8");
  const storageRules = fs.readFileSync(path.join(ROOT, "tools/map-scaling-phase-9/firebase/storage.rules"), "utf8");
  const stage0 = fs.readFileSync(path.join(ROOT, "docs/map-scaling-audit/phase-9/STAGE0_PRODUCTION.md"), "utf8");
  assert(functions.includes(`const STAGING_PROJECT_ID = "${CONFIG.stagingProjectId}"`));
  assert(functions.includes(`const PRODUCTION_PROJECT_ID = "${CONFIG.productionProjectId}"`));
  assert(functions.includes("verifyIdToken(token, true)"));
  assert(functions.includes("currentGenerationId"));
  assert(functions.includes("MINIMUM_NPC_CITIES_FOR_SPAWN = 15"));
  assert(functions.includes("CITY_CAPACITY = 40"));
  for (const action of ["generate", "reject", "regenerate-unpublished", "publish", "activate"]) {
    assert(functions.includes(`"${action}"`), `Operator audit action ${action} is missing.`);
  }
  assert(firestoreRules.includes("allow write: if false"));
  assert(firestoreRules.includes("resource.data.lifecycle == 'ACTIVE'"));
  assert(storageRules.includes("publicationMarkers/$(regionId)"));
  assert(storageRules.includes("allow create, update, delete: if false"));
  assert(stage0.includes("The current Phase 9 functions are staging-hard-coded and must not be deployed to production."));
}

function validateEvidence() {
  const rehearsal = readResult("REAL_STAGING_REHEARSAL.json");
  const inventory = readResult("STAGING_INVENTORY.json");
  const monitoring = readResult("MONITORING.json");
  const recovery = readResult("RECOVERY_REHEARSAL.json");
  const cleanup = readResult("ORPHAN_CLEANUP.json");
  const security = readResult("SECURITY_RULES_PROBE.json");
  const network = readResult("NETWORK_QA.json");
  const physical = readResult("PHYSICAL_DEVICE_QA.json");
  const production = readResult("PRODUCTION_READ_ONLY_PREFLIGHT.json");

  assert.equal(rehearsal.environment, "STAGING");
  assert.equal(rehearsal.productionMutationPerformed, false);
  assert.equal(rehearsal.lifecycle.activePlayerRegions.length, 3);
  assert.equal(rehearsal.lifecycle.standbyPlayerRegions.length, 2);
  assert.equal(rehearsal.lifecycle.exactlyFortyInitialized, true);
  assert.equal(rehearsal.lifecycle.hiddenOpenTargetCount, 0);
  assert(rehearsal.lifecycle.publicationObjectVerificationCount.every(count => count === 9));
  assert.equal(rehearsal.spawnThreshold.claimAllowedAtNpcBefore, 15);
  assert.equal(rehearsal.spawnThreshold.npcAfterBoundaryClaim, 14);
  assert.equal(rehearsal.spawnThreshold.subsequentClaimRejected, true);
  assert.deepEqual(rehearsal.spawnThreshold.simultaneousSameCityClaim, { successes: 1, rejections: 1 });
  assert.equal(rehearsal.workers.workerCountUsed, 2);
  assert.equal(rehearsal.workers.retries, 0);
  assert.equal(rehearsal.workers.failures, 0);
  assert.equal(rehearsal.workers.roadCache.limit, 12);
  assert.equal(rehearsal.controls.independentKillSwitchesPassed, true);
  for (const value of Object.values(CONFIG.initialFlags)) assert.equal(value, false);
  for (const flag of Object.keys(CONFIG.initialFlags)) assert.equal(rehearsal.controls.final[flag], false);

  assert.equal(inventory.result, "PASS");
  assert.equal(inventory.projectsAreDistinct, true);
  assert.equal(inventory.functions.length, 7);
  assert(inventory.functions.every(item => item.state === "ACTIVE" && item.runtime === "nodejs22"));
  assert.equal(inventory.iam.broadOwnerOrEditorAssignedToPhase9Accounts, false);
  assert.equal(inventory.iam.crossServiceRules.enabled, true);
  assert.equal(inventory.firestore.pointInTimeRecoveryEnablement, "POINT_IN_TIME_RECOVERY_ENABLED");
  assert.equal(inventory.firestore.deleteProtectionState, "DELETE_PROTECTION_ENABLED");
  assert.equal(inventory.storage.versioning.enabled, true);
  assert.equal(inventory.monitoring.phase9AlertPolicyCount, 14);
  assert.equal(inventory.billing.budgetUsd, 25);
  assert.equal(inventory.stagingWorld.lifecycleCounts.ACTIVE, 28);
  assert.equal(inventory.stagingWorld.lifecycleCounts.STANDBY, 2);
  for (const flag of Object.keys(CONFIG.initialFlags)) assert.equal(inventory.controls[flag], false);

  assert.equal(monitoring.result, "PASS");
  assert.equal(monitoring.policyCount, 14);
  assert.equal(monitoring.safeTriggerTest.triggeredSignalCount, 14);
  assert.equal(monitoring.safeTriggerTest.resetToZero, true);
  assert.equal(monitoring.notificationChannelsConfigured, false);
  assert.equal(recovery.firestore.pitrCloneCreatedAndVerified, true);
  assert.equal(recovery.firestore.pitrCloneDeletedAfterVerification, true);
  assert.equal(recovery.storage.publishedPackageRegenerated, false);
  assert.equal(recovery.storage.restoredHashVerified, true);
  assert.equal(cleanup.result, "PASS");
  assert.equal(cleanup.mode, "DRY_RUN");
  assert.equal(cleanup.deletionPerformed, false);
  assert.equal(cleanup.protectedPublishedCount, 28);
  assert.equal(security.result, "PASS");
  assert.equal(security.storage.publicPublishedActiveMapStatus, 200);
  assert.equal(security.storage.authenticatedStandbyMapStatus, 403);
  assert.equal(network.result, "PASS_WITH_LIMITATION");
  assert.equal(network.cachedRepeat.status, 304);
  assert.equal(network.failedRequestRecovery.recovered, true);
  assert.equal(physical.requiredGatePassed, false);
  assert.equal(physical.android.status, "NOT_RUN");
  assert.equal(physical.iphone.status, "NOT_RUN");
  assert.equal(production.pass, true);
  assert.equal(production.productionBaseline.mapCount, 15);
  assert.equal(production.productionBaseline.cityDefinitionCount, 1050);
  assert.equal(production.productionBaseline.directedMapChainCount, 210);
  assert.equal(production.productionBaseline.generatedActiveRegionCount, 0);
  assert.equal(production.productionBaseline.assetManifestHash, CONFIG.assetManifestHash);
  for (const result of [rehearsal, inventory, monitoring, recovery, cleanup, security, network, physical, production]) {
    assert.equal(result.productionMutationPerformed, false);
  }
  return { rehearsal, inventory, monitoring, physical, network };
}

function main() {
  assert.equal(CONFIG.assetManifestHash, ASSET_MANIFEST_HASH);
  assert.equal(readLockedAssetManifest().hash, ASSET_MANIFEST_HASH);
  const production = createCurrentProductionWorldAdapter();
  assert.equal(production.productionMapCount, 15);
  assert.equal(production.productionCityCount, 1050);
  assert.equal(production.directedMapChainCount, 210);
  assert.equal(production.generatedActiveRegionCount, 0);
  const changedFiles = assertDevelopmentOnlyDiff();
  validateStaticSources();
  const evidence = validateEvidence();
  const leakage = assertNoProductionLeakage();
  const requiredDocs = [
    "README.md", "PROJECT_IAM_AND_SECURITY.md", "FIRESTORE_STORAGE_AND_LIFECYCLE.md",
    "REHEARSAL_RESULTS.md", "CONTROLS_MONITORING_AND_COST.md", "RECOVERY_AND_CLEANUP.md",
    "DEVICE_NETWORK_AND_STUDIO.md", "STAGE0_PRODUCTION.md", "KNOWN_LIMITATIONS.md",
  ];
  for (const name of requiredDocs) assert(fs.existsSync(path.join(ROOT, "docs/map-scaling-audit/phase-9", name)), `Missing ${name}.`);
  console.log(JSON.stringify({
    phase: 9,
    engineeringValidation: "PASS",
    productionReadiness: "BLOCKED_REQUIRED_QA",
    blockers: [
      "physical Android QA",
      "physical iPhone QA",
      "real carrier-network QA",
      "external paging channel",
      "cloud-hosted raster-worker capacity proof",
    ],
    changedFiles: changedFiles.length,
    productionFilesChanged: 0,
    productionMaps: production.productionMapCount,
    productionCities: production.productionCityCount,
    directedMapChains: production.directedMapChainCount,
    generatedActiveProductionRegions: production.generatedActiveRegionCount,
    stagingActivePlayerRegions: evidence.rehearsal.lifecycle.activePlayerRegions.length,
    stagingStandbyPlayerRegions: evidence.rehearsal.lifecycle.standbyPlayerRegions.length,
    stagingFunctions: evidence.inventory.functions.length,
    alertPolicies: evidence.monitoring.policyCount,
    assetManifestHash: ASSET_MANIFEST_HASH,
    leakage,
    productionMutationPerformed: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
