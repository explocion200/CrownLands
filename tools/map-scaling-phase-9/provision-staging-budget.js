"use strict";

const {
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { googleRequest, waitForOperation } = require("./google-api");

const DISPLAY_NAME = "Crownlands Phase 9 isolated staging monthly budget";

async function enableBudgetApi(projectNumber) {
  const service = "billingbudgets.googleapis.com";
  const base = `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${service}`;
  const current = await googleRequest(base, { allowStatuses: [404] });
  if (current.ok && current.body?.state === "ENABLED") return false;
  const operation = await googleRequest(`${base}:enable`, { method: "POST", body: {} });
  await waitForOperation("https://serviceusage.googleapis.com/v1", operation.body);
  return true;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  const billingAccountName = String(process.env.CROWNLANDS_PHASE9_BILLING_ACCOUNT || "").trim();
  const budgetUsd = Number(process.env.CROWNLANDS_PHASE9_MONTHLY_BUDGET_USD);
  if (!/^billingAccounts\/[A-Z0-9-]+$/.test(billingAccountName)) {
    throw new Error("CROWNLANDS_PHASE9_BILLING_ACCOUNT must be explicit.");
  }
  if (!Number.isSafeInteger(budgetUsd) || budgetUsd < 5 || budgetUsd > 100) {
    throw new Error("CROWNLANDS_PHASE9_MONTHLY_BUDGET_USD must be an explicit integer from 5 through 100.");
  }
  console.log(environmentBanner(identity));
  const project = (await googleRequest(`https://firebase.googleapis.com/v1beta1/projects/${identity.targetProjectId}`)).body;
  const billing = (await googleRequest(
    `https://cloudbilling.googleapis.com/v1/projects/${identity.targetProjectId}/billingInfo`,
  )).body;
  if (!billing.billingEnabled || billing.billingAccountName !== billingAccountName) {
    throw new Error("The reviewed billing account is not attached to staging.");
  }
  if (!execute) {
    console.log(JSON.stringify({
      result: "DRY_RUN",
      stagingProjectId: identity.targetProjectId,
      productionProjectId: identity.productionProjectId,
      billingAccountName,
      monthlyBudgetUsd: budgetUsd,
      thresholds: [0.5, 0.8, 1],
      forecastThreshold: 1,
      mutationPerformed: false,
    }, null, 2));
    return;
  }
  await enableBudgetApi(project.projectNumber);
  const apiOptions = { quotaProjectId: identity.targetProjectId };
  const list = await googleRequest(`https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets`, apiOptions);
  const existing = (list.body?.budgets || []).find(budget => budget.displayName === DISPLAY_NAME);
  let budget = existing;
  if (!budget) {
    budget = (await googleRequest(`https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets`, {
      method: "POST",
      quotaProjectId: identity.targetProjectId,
      body: {
        displayName: DISPLAY_NAME,
        budgetFilter: { projects: [`projects/${project.projectNumber}`] },
        amount: { specifiedAmount: { currencyCode: "USD", units: String(budgetUsd) } },
        thresholdRules: [
          { thresholdPercent: 0.5, spendBasis: "CURRENT_SPEND" },
          { thresholdPercent: 0.8, spendBasis: "CURRENT_SPEND" },
          { thresholdPercent: 1, spendBasis: "CURRENT_SPEND" },
          { thresholdPercent: 1, spendBasis: "FORECASTED_SPEND" },
        ],
        notificationsRule: { disableDefaultIamRecipients: false, enableProjectLevelRecipients: true },
      },
    })).body;
  }
  console.log(JSON.stringify({
    result: "PASS",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    billingAccountName,
    budgetName: budget.name,
    displayName: budget.displayName,
    monthlyBudgetUsd: budget.amount?.specifiedAmount?.units || String(budgetUsd),
    thresholdCount: budget.thresholdRules?.length || 4,
    defaultIamRecipientsEnabled: budget.notificationsRule?.disableDefaultIamRecipients !== true,
    projectLevelRecipientsEnabled: budget.notificationsRule?.enableProjectLevelRecipients === true,
    productionMutationPerformed: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-budget-error"}: ${error.message}`);
  process.exitCode = 1;
});
