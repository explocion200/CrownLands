"use strict";

const {
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { googleRequest } = require("./google-api");

async function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  const billingAccountName = String(process.env.CROWNLANDS_PHASE9_BILLING_ACCOUNT || "").trim();
  if (!/^billingAccounts\/[A-Z0-9-]+$/.test(billingAccountName)) {
    throw new Error("CROWNLANDS_PHASE9_BILLING_ACCOUNT must explicitly name an accessible billing account.");
  }
  console.log(environmentBanner(identity));
  const account = await googleRequest(`https://cloudbilling.googleapis.com/v1/${billingAccountName}`);
  if (account.body?.open !== true) throw new Error(`Billing account ${billingAccountName} is not open.`);
  const before = await googleRequest(
    `https://cloudbilling.googleapis.com/v1/projects/${identity.targetProjectId}/billingInfo`,
  );
  if (!execute) {
    console.log(JSON.stringify({
      result: "DRY_RUN",
      stagingProjectId: identity.targetProjectId,
      productionProjectId: identity.productionProjectId,
      billingAccount: { name: account.body.name, displayName: account.body.displayName, open: account.body.open },
      currentBillingEnabled: before.body.billingEnabled,
      mutationPerformed: false,
    }, null, 2));
    return;
  }
  const updated = await googleRequest(
    `https://cloudbilling.googleapis.com/v1/projects/${identity.targetProjectId}/billingInfo`,
    { method: "PUT", body: { billingAccountName } },
  );
  if (updated.body?.billingEnabled !== true || updated.body?.projectId !== identity.targetProjectId) {
    throw new Error("Staging billing attachment verification failed.");
  }
  console.log(JSON.stringify({
    result: "PASS",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    billingAccount: { name: account.body.name, displayName: account.body.displayName },
    billingEnabled: updated.body.billingEnabled,
    productionMutationPerformed: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-billing-error"}: ${error.message}`);
  process.exitCode = 1;
});
