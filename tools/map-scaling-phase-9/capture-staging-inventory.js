"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CONFIG, requireExplicitProjectIdentity, environmentBanner } = require("./environment");
const { googleRequest } = require("./google-api");
const { runFirebase, parseFirebaseJson } = require("./firebase-cli");
const { getDocument, listDocuments } = require("./staging-api");

const RESULTS_ROOT = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results");
const RESULT_PATH = path.join(RESULTS_ROOT, "STAGING_INVENTORY.json");

async function main() {
  const identity = requireExplicitProjectIdentity({
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
  });
  console.log(environmentBanner(identity));
  const projectId = identity.targetProjectId;
  const billingAccountName = String(process.env.CROWNLANDS_PHASE9_BILLING_ACCOUNT || "").trim();
  assert(/^billingAccounts\/[A-Z0-9-]+$/.test(billingAccountName), "Explicit staging billing account is required.");

  const [stagingProject, productionProject, firestore, storage, functions, iam, auth, policies, billing, budgets] = await Promise.all([
    googleRequest(`https://firebase.googleapis.com/v1beta1/projects/${projectId}`),
    googleRequest(`https://firebase.googleapis.com/v1beta1/projects/${identity.productionProjectId}`),
    googleRequest(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(CONFIG.firestoreDatabaseId)}`),
    googleRequest(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(CONFIG.storageBucket)}`),
    googleRequest(`https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/-/functions?pageSize=100`, { quotaProjectId: projectId }),
    googleRequest(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`, {
      method: "POST",
      body: { options: { requestedPolicyVersion: 3 } },
    }),
    googleRequest(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, { quotaProjectId: projectId }),
    googleRequest(`https://monitoring.googleapis.com/v3/projects/${projectId}/alertPolicies?pageSize=200`, { quotaProjectId: projectId }),
    googleRequest(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`),
    googleRequest(`https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets`, { quotaProjectId: projectId }),
  ]);
  assert.equal(stagingProject.body.projectId, projectId);
  assert.equal(productionProject.body.projectId, identity.productionProjectId);
  assert.notEqual(stagingProject.body.projectNumber, productionProject.body.projectNumber);
  assert.equal(billing.body.billingEnabled, true);
  assert.equal(billing.body.billingAccountName, billingAccountName);

  const accounts = ["generation", "publication", "activation", "backup", "monitoring", "operator"]
    .map(name => `phase9-${name}@${projectId}.iam.gserviceaccount.com`);
  const rolesByAccount = Object.fromEntries(accounts.map(account => [account, []]));
  for (const binding of iam.body.bindings || []) {
    for (const member of binding.members || []) {
      const account = member.replace(/^serviceAccount:/, "");
      if (rolesByAccount[account]) rolesByAccount[account].push(binding.role);
    }
  }
  for (const roles of Object.values(rolesByAccount)) roles.sort();
  assert(Object.values(rolesByAccount).every(roles => roles.length > 0));
  assert(Object.values(rolesByAccount).every(roles => !roles.includes("roles/owner") && !roles.includes("roles/editor")));
  const storageRulesServiceAgent = `service-${stagingProject.body.projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`;
  const crossServiceRulesBinding = (iam.body.bindings || []).find(binding => (
    binding.role === "roles/firebaserules.firestoreServiceAgent"
      && (binding.members || []).includes(`serviceAccount:${storageRulesServiceAgent}`)
  ));
  assert(crossServiceRulesBinding, "Cloud Storage rules cannot read publication markers from Firestore.");

  const phase9Functions = (functions.body.functions || [])
    .filter(fn => /phase9/i.test(fn.name || ""))
    .map(fn => ({
      name: fn.name.split("/").at(-1),
      state: fn.state,
      environment: fn.environment,
      runtime: fn.buildConfig?.runtime,
      serviceAccountEmail: fn.serviceConfig?.serviceAccountEmail,
      availableMemory: fn.serviceConfig?.availableMemory,
      maxInstanceCount: fn.serviceConfig?.maxInstanceCount,
      maxInstanceRequestConcurrency: fn.serviceConfig?.maxInstanceRequestConcurrency,
      timeoutSeconds: fn.serviceConfig?.timeoutSeconds,
      uri: fn.serviceConfig?.uri,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  assert.equal(phase9Functions.length, 7);
  assert(phase9Functions.every(fn => fn.state === "ACTIVE"));

  const schedules = parseFirebaseJson(runFirebase([
    "firestore:backups:schedules:list",
    "--database", CONFIG.firestoreDatabaseId,
    "--project", projectId,
    "--json",
  ]).stdout);
  const apps = parseFirebaseJson(runFirebase(["apps:list", "--project", projectId, "--json"]).stdout);
  const controls = await getDocument("phase9Controls/staging");
  const worldRoot = `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}`;
  const [regions, packages, markers, audits] = await Promise.all([
    listDocuments(`${worldRoot}/regions`, { pageSize: 300 }),
    listDocuments(`${worldRoot}/packages`, { pageSize: 300 }),
    listDocuments(`${worldRoot}/publicationMarkers`, { pageSize: 300 }),
    listDocuments("phase9Audit", { pageSize: 300 }),
  ]);
  const lifecycleCounts = {};
  for (const document of regions.documents) {
    lifecycleCounts[document.data.lifecycle] = (lifecycleCounts[document.data.lifecycle] || 0) + 1;
  }
  const phase9Policies = (policies.body.alertPolicies || []).filter(policy => policy.displayName?.startsWith("Crownlands Phase 9 STAGING"));
  const budget = (budgets.body.budgets || []).find(item => item.displayName === "Crownlands Phase 9 isolated staging monthly budget");
  assert(budget, "Staging budget is missing.");

  const result = {
    schemaVersion: "phase9-staging-inventory-v1",
    capturedAt: new Date().toISOString(),
    environment: "STAGING",
    stagingProject: {
      projectId: stagingProject.body.projectId,
      projectNumber: stagingProject.body.projectNumber,
      displayName: stagingProject.body.displayName,
    },
    productionIdentityUsedForGuardOnly: {
      projectId: productionProject.body.projectId,
      projectNumber: productionProject.body.projectNumber,
      displayName: productionProject.body.displayName,
    },
    projectsAreDistinct: stagingProject.body.projectNumber !== productionProject.body.projectNumber,
    firestore: {
      name: firestore.body.name,
      locationId: firestore.body.locationId,
      type: firestore.body.type,
      concurrencyMode: firestore.body.concurrencyMode,
      pointInTimeRecoveryEnablement: firestore.body.pointInTimeRecoveryEnablement,
      versionRetentionPeriod: firestore.body.versionRetentionPeriod,
      deleteProtectionState: firestore.body.deleteProtectionState,
      backupSchedules: schedules,
    },
    storage: {
      name: storage.body.name,
      location: storage.body.location,
      versioning: storage.body.versioning,
      uniformBucketLevelAccess: storage.body.iamConfiguration?.uniformBucketLevelAccess,
      cors: storage.body.cors,
    },
    functions: phase9Functions,
    iam: {
      rolesByServiceAccount: rolesByAccount,
      broadOwnerOrEditorAssignedToPhase9Accounts: false,
      crossServiceRules: {
        serviceAccount: storageRulesServiceAgent,
        role: "roles/firebaserules.firestoreServiceAgent",
        enabled: true,
      },
    },
    auth: { anonymousEnabled: auth.body.signIn?.anonymous?.enabled === true, webApps: apps },
    monitoring: { phase9AlertPolicyCount: phase9Policies.length, allEnabled: phase9Policies.every(policy => policy.enabled === true) },
    billing: {
      enabled: billing.body.billingEnabled,
      budgetName: budget.name,
      budgetUsd: Number(budget.amount?.specifiedAmount?.units || 0),
      thresholdRules: budget.thresholdRules,
      actualCostAvailability: "Cloud Billing budget APIs expose configuration, not same-day incurred-cost totals; billing export was not authorized/configured.",
    },
    stagingWorld: {
      regionCount: regions.documents.length,
      lifecycleCounts,
      immutablePackageRecords: packages.documents.filter(document => document.data.immutable === true).length,
      publicationMarkers: markers.documents.length,
      auditEntries: audits.documents.length,
      syntheticOnly: true,
    },
    controls: controls.data,
    assetManifestHash: CONFIG.assetManifestHash,
    productionMutationPerformed: false,
    result: "PASS",
  };
  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    result: result.result,
    stagingProject: result.stagingProject,
    functions: result.functions.length,
    alertPolicies: result.monitoring.phase9AlertPolicyCount,
    lifecycleCounts,
    budgetUsd: result.billing.budgetUsd,
    controlsOff: Object.entries(CONFIG.initialFlags).every(([key, value]) => result.controls[key] === value),
    productionMutationPerformed: false,
    resultPath: path.relative(process.cwd(), RESULT_PATH),
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-inventory-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});
