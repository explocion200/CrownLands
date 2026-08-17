"use strict";

const {
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { runFirebase } = require("./firebase-cli");

function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  console.log(environmentBanner(identity));
  if (!execute) {
    console.log(JSON.stringify({ result: "DRY_RUN", retentionDays: 7, mutationPerformed: false }, null, 2));
    return;
  }
  runFirebase([
    "functions:artifacts:setpolicy",
    "--project", identity.targetProjectId,
    "--location", "us-central1",
    "--days", "7",
    "--force",
  ], { capture: false });
  console.log(JSON.stringify({
    result: "PASS",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    location: "us-central1",
    retentionDays: 7,
    productionMutationPerformed: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`${error.code || "phase9-artifact-policy-error"}: ${error.message}`);
  process.exitCode = 1;
}
