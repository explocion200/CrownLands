"use strict";

const {
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { accessToken, googleRequest } = require("./google-api");

async function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  console.log(environmentBanner(identity));
  const operator = await accessToken();
  if (!operator.email || !operator.email.includes("@")) throw new Error("The authenticated Firebase operator email is unavailable.");
  const serviceAccount = `phase9-backup@${identity.targetProjectId}.iam.gserviceaccount.com`;
  const resource = `projects/${identity.targetProjectId}/serviceAccounts/${encodeURIComponent(serviceAccount)}`;
  const current = await googleRequest(`https://iam.googleapis.com/v1/${resource}:getIamPolicy`, {
    method: "POST",
    body: { options: { requestedPolicyVersion: 3 } },
  });
  const policy = current.body || { bindings: [] };
  policy.version = Math.max(3, Number(policy.version || 0));
  policy.bindings = Array.isArray(policy.bindings) ? policy.bindings : [];
  let binding = policy.bindings.find(item => item.role === "roles/iam.serviceAccountTokenCreator" && !item.condition);
  if (!binding) {
    binding = { role: "roles/iam.serviceAccountTokenCreator", members: [] };
    policy.bindings.push(binding);
  }
  const member = `user:${operator.email.toLowerCase()}`;
  const changed = !binding.members.map(value => value.toLowerCase()).includes(member);
  if (changed) binding.members.push(member);
  if (execute && changed) {
    await googleRequest(`https://iam.googleapis.com/v1/${resource}:setIamPolicy`, {
      method: "POST",
      body: { policy, updateMask: "bindings,etag,version" },
    });
  }
  console.log(JSON.stringify({
    result: execute ? "PASS" : "DRY_RUN",
    environment: identity.environment,
    stagingProjectId: identity.targetProjectId,
    backupServiceAccount: serviceAccount,
    operatorIdentity: operator.email,
    role: "roles/iam.serviceAccountTokenCreator",
    scope: "backup service account only",
    changed: execute ? changed : false,
    productionMutationPerformed: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-backup-impersonation-error"}: ${error.message}`);
  process.exitCode = 1;
});
