"use strict";

const {
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { googleRequest, waitForOperation } = require("./google-api");

const REGION = "us-central1";
const SERVICES = Object.freeze([
  "phase9activateregion",
  "phase9allocateregion",
  "phase9claimcity",
  "phase9health",
  "phase9publishregion",
  "phase9setcontrol",
  "phase9transitionregion",
]);

async function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  console.log(environmentBanner(identity));
  const results = [];
  for (const service of SERVICES) {
    const resource = `projects/${identity.targetProjectId}/locations/${REGION}/services/${service}`;
    const endpoint = `https://run.googleapis.com/v2/${resource}`;
    const serviceState = await googleRequest(endpoint, { quotaProjectId: identity.targetProjectId });
    const current = await googleRequest(`${endpoint}:getIamPolicy`, { quotaProjectId: identity.targetProjectId });
    const policy = current.body || {};
    policy.bindings = Array.isArray(policy.bindings) ? policy.bindings : [];
    let binding = policy.bindings.find(item => item.role === "roles/run.invoker" && !item.condition);
    if (!binding) {
      binding = { role: "roles/run.invoker", members: [] };
      policy.bindings.push(binding);
    }
    const changed = !binding.members.includes("allUsers");
    if (changed) binding.members.push("allUsers");
    if (execute && changed) {
      await googleRequest(`${endpoint}:setIamPolicy`, {
        method: "POST",
        quotaProjectId: identity.targetProjectId,
        body: { policy },
      });
    }
    const invokerIamDisabledRequired = serviceState.body?.invokerIamDisabled !== true;
    if (execute && invokerIamDisabledRequired) {
      const template = structuredClone(serviceState.body.template || {});
      delete template.revision;
      const operation = await googleRequest(`${endpoint}?updateMask=invoker_iam_disabled,template`, {
        method: "PATCH",
        quotaProjectId: identity.targetProjectId,
        body: { name: resource, invokerIamDisabled: true, template },
      });
      await waitForOperation("https://run.googleapis.com/v2", operation.body, { timeoutMs: 180000 });
    }
    results.push({
      service,
      changed: execute ? changed || invokerIamDisabledRequired : false,
      requiresChange: changed || invokerIamDisabledRequired,
      invokerIamDisabled: execute ? true : serviceState.body?.invokerIamDisabled === true,
    });
  }
  console.log(JSON.stringify({
    result: execute ? "PASS" : "DRY_RUN",
    environment: identity.environment,
    stagingProjectId: identity.targetProjectId,
    binding: { role: "roles/run.invoker", member: "allUsers" },
    cloudRunInvokerIamCheckDisabled: true,
    reason: "Firebase callable protocol must pass Firebase ID tokens in Authorization to the application verifier.",
    applicationAuthenticationStillRequired: true,
    services: results,
    productionMutationPerformed: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-invoker-provision-error"}: ${error.message}`);
  process.exitCode = 1;
});
