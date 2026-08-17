"use strict";

const {
  CONFIG,
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { runFirebase, parseFirebaseJson } = require("./firebase-cli");
const { googleRequest, waitForOperation } = require("./google-api");

const REQUIRED_APIS = Object.freeze([
  "artifactregistry.googleapis.com",
  "billingbudgets.googleapis.com",
  "cloudbuild.googleapis.com",
  "cloudfunctions.googleapis.com",
  "eventarc.googleapis.com",
  "firebase.googleapis.com",
  "firebaserules.googleapis.com",
  "firebasestorage.googleapis.com",
  "firestore.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "identitytoolkit.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com",
  "pubsub.googleapis.com",
  "run.googleapis.com",
  "serviceusage.googleapis.com",
  "storage.googleapis.com"
]);

const SERVICE_ACCOUNTS = Object.freeze({
  generation: {
    accountId: "phase9-generation",
    displayName: "Crownlands Phase 9 generation worker",
    roles: ["roles/datastore.user", "roles/firebaseauth.viewer", "roles/storage.objectCreator", "roles/logging.logWriter"],
  },
  publication: {
    accountId: "phase9-publication",
    displayName: "Crownlands Phase 9 publication worker",
    roles: ["roles/datastore.user", "roles/firebaseauth.viewer", "roles/storage.objectViewer", "roles/logging.logWriter"],
  },
  activation: {
    accountId: "phase9-activation",
    displayName: "Crownlands Phase 9 activation controller",
    roles: ["roles/datastore.user", "roles/firebaseauth.viewer", "roles/logging.logWriter"],
  },
  backup: {
    accountId: "phase9-backup",
    displayName: "Crownlands Phase 9 backup service",
    roles: ["roles/datastore.importExportAdmin", "roles/storage.objectAdmin", "roles/logging.logWriter"],
  },
  monitoring: {
    accountId: "phase9-monitoring",
    displayName: "Crownlands Phase 9 monitoring service",
    roles: ["roles/datastore.viewer", "roles/monitoring.metricWriter", "roles/logging.logWriter"],
  },
  operator: {
    accountId: "phase9-operator",
    displayName: "Crownlands Phase 9 operator controller",
    roles: ["roles/datastore.user", "roles/firebaseauth.viewer", "roles/logging.logWriter"],
  },
});

async function firebaseProject(projectId) {
  return (await googleRequest(`https://firebase.googleapis.com/v1beta1/projects/${projectId}`)).body;
}

async function enableApi(projectNumber, service) {
  const base = `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${service}`;
  const current = await googleRequest(base, { allowStatuses: [404] });
  if (current.ok && current.body?.state === "ENABLED") return { service, changed: false, state: "ENABLED" };
  const operation = await googleRequest(`${base}:enable`, { method: "POST", body: {} });
  await waitForOperation("https://serviceusage.googleapis.com/v1", operation.body);
  return { service, changed: true, state: "ENABLED" };
}

async function ensureServiceAccount(projectId, definition) {
  const email = `${definition.accountId}@${projectId}.iam.gserviceaccount.com`;
  const resource = `projects/${projectId}/serviceAccounts/${encodeURIComponent(email)}`;
  const existing = await googleRequest(`https://iam.googleapis.com/v1/${resource}`, { allowStatuses: [404] });
  if (existing.ok) return { email, created: false, roles: definition.roles };
  await googleRequest(`https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`, {
    method: "POST",
    body: {
      accountId: definition.accountId,
      serviceAccount: { displayName: definition.displayName, description: "Phase 9 isolated Firebase staging only." },
    },
  });
  return { email, created: true, roles: definition.roles };
}

async function bindLeastPrivilegeRoles(projectId, accounts) {
  const resource = `projects/${projectId}`;
  const policyResponse = await googleRequest(
    `https://cloudresourcemanager.googleapis.com/v1/${resource}:getIamPolicy`,
    { method: "POST", body: { options: { requestedPolicyVersion: 3 } } },
  );
  const policy = policyResponse.body || { bindings: [] };
  policy.version = Math.max(3, Number(policy.version || 0));
  policy.bindings = Array.isArray(policy.bindings) ? policy.bindings : [];
  let changed = false;
  for (const account of accounts) {
    const member = `serviceAccount:${account.email}`;
    for (const role of account.roles) {
      let binding = policy.bindings.find(item => item.role === role && !item.condition);
      if (!binding) {
        binding = { role, members: [] };
        policy.bindings.push(binding);
      }
      if (!binding.members.includes(member)) {
        binding.members.push(member);
        binding.members.sort();
        changed = true;
      }
    }
  }
  if (changed) {
    await googleRequest(`https://cloudresourcemanager.googleapis.com/v1/${resource}:setIamPolicy`, {
      method: "POST",
      body: { policy, updateMask: "bindings,etag,version" },
    });
  }
  return { changed, bindingsReviewed: policy.bindings.length };
}

function listDatabases(projectId) {
  try {
    return parseFirebaseJson(runFirebase([
      "firestore:databases:list", "--project", projectId, "--json",
    ]).stdout);
  } catch (error) {
    if (/not been used|disabled|NOT_FOUND|does not exist/i.test(error.message)) return [];
    throw error;
  }
}

function ensureFirestore(projectId) {
  const databases = listDatabases(projectId);
  const existing = databases.find(database => database.name?.endsWith("/databases/(default)"));
  if (existing) return { created: false, database: existing };
  const created = parseFirebaseJson(runFirebase([
    "firestore:databases:create", "(default)",
    "--project", projectId,
    "--location", CONFIG.firestoreLocation,
    "--edition", "standard",
    "--delete-protection", "ENABLED",
    "--point-in-time-recovery", "ENABLED",
    "--json",
  ]).stdout);
  return { created: true, database: created };
}

async function ensureStorageBucket(projectId) {
  const bucketName = CONFIG.storageBucket;
  const endpoint = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}`;
  const existing = await googleRequest(endpoint, { allowStatuses: [404] });
  let created = false;
  if (!existing.ok) {
    await googleRequest(`https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(projectId)}`, {
      method: "POST",
      body: {
        name: bucketName,
        location: CONFIG.storageLocation,
        iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
        versioning: { enabled: true },
      },
    });
    created = true;
  }
  const patched = await googleRequest(`${endpoint}?fields=name,location,versioning,iamConfiguration,cors`, {
    method: "PATCH",
    body: {
      versioning: { enabled: true },
      iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
      cors: [{
        origin: ["http://localhost:4173", "https://crownlands-map-staging-2026.web.app"],
        method: ["GET", "HEAD"],
        responseHeader: ["Content-Type", "Cache-Control", "ETag", "x-goog-generation"],
        maxAgeSeconds: 3600,
      }],
    },
  });
  return { created, ...patched.body };
}

async function billingStatus(projectId) {
  const response = await googleRequest(
    `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`,
    { allowStatuses: [403, 404] },
  );
  return response.ok ? response.body : { billingEnabled: false, unavailableStatus: response.status };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  console.log(environmentBanner(identity));
  const [staging, production] = await Promise.all([
    firebaseProject(identity.targetProjectId),
    firebaseProject(identity.productionProjectId),
  ]);
  if (staging.projectId !== identity.targetProjectId || production.projectId !== identity.productionProjectId) {
    throw new Error("Firebase project identity verification failed.");
  }
  if (!execute) {
    console.log(JSON.stringify({
      result: "DRY_RUN",
      staging: { projectId: staging.projectId, projectNumber: staging.projectNumber, displayName: staging.displayName },
      production: { projectId: production.projectId, projectNumber: production.projectNumber, displayName: production.displayName },
      requiredApis: REQUIRED_APIS,
      serviceAccounts: SERVICE_ACCOUNTS,
      firestore: { location: CONFIG.firestoreLocation, pitr: "ENABLED", deleteProtection: "ENABLED" },
      storage: { bucket: CONFIG.storageBucket, versioning: true, uniformAccess: true },
      mutationPerformed: false,
    }, null, 2));
    return;
  }
  const apiResults = [];
  for (const service of REQUIRED_APIS) apiResults.push(await enableApi(staging.projectNumber, service));
  const accounts = [];
  for (const definition of Object.values(SERVICE_ACCOUNTS)) {
    accounts.push(await ensureServiceAccount(identity.targetProjectId, definition));
  }
  const iam = await bindLeastPrivilegeRoles(identity.targetProjectId, accounts);
  const storageRulesServiceAgent = `service-${staging.projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`;
  const crossServiceRulesIam = await bindLeastPrivilegeRoles(identity.targetProjectId, [{
    email: storageRulesServiceAgent,
    roles: ["roles/firebaserules.firestoreServiceAgent"],
  }]);
  const firestore = ensureFirestore(identity.targetProjectId);
  const storage = await ensureStorageBucket(identity.targetProjectId);
  const billing = await billingStatus(identity.targetProjectId);
  console.log(JSON.stringify({
    result: "PASS",
    environment: identity.environment,
    staging: { projectId: staging.projectId, projectNumber: staging.projectNumber, displayName: staging.displayName },
    production: { projectId: production.projectId, projectNumber: production.projectNumber, displayName: production.displayName },
    apiResults,
    serviceAccounts: accounts,
    iam,
    crossServiceRulesIam: {
      ...crossServiceRulesIam,
      serviceAccount: storageRulesServiceAgent,
      role: "roles/firebaserules.firestoreServiceAgent",
      purpose: "Allow Cloud Storage Security Rules to verify immutable Firestore publication markers.",
    },
    firestore,
    storage,
    billing,
    productionMutationPerformed: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-infrastructure-error"}: ${error.message}`);
  process.exitCode = 1;
});
