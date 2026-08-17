"use strict";

const {
  CONFIG,
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  assertProjectCatalog,
  environmentBanner,
} = require("./environment");
const { listProjects, runFirebase } = require("./firebase-cli");

function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  console.log(environmentBanner(identity));
  const before = assertProjectCatalog(listProjects(), identity);
  if (before.stagingExists) {
    console.log(JSON.stringify({ result: "EXISTS", targetProjectId: identity.targetProjectId }, null, 2));
    return;
  }
  if (!execute) {
    console.log(JSON.stringify({
      result: "DRY_RUN",
      action: "create isolated Firebase staging project",
      targetProjectId: identity.targetProjectId,
      productionProjectId: identity.productionProjectId,
      command: `firebase projects:create ${identity.targetProjectId} --display-name Crownlands Phase 9 Staging`,
      mutationPerformed: false,
    }, null, 2));
    return;
  }
  runFirebase([
    "projects:create",
    identity.targetProjectId,
    "--display-name",
    "Crownlands Phase 9 Staging",
  ], { capture: false });
  const after = assertProjectCatalog(listProjects(), { ...identity, requireStagingExists: true });
  console.log(JSON.stringify({
    result: "CREATED",
    targetProjectId: after.targetProjectId,
    productionProjectId: after.productionProjectId,
    productionVisibleSeparately: after.productionVisible,
    stagingVisible: after.stagingExists,
    productionMutationPerformed: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`${error.code || "phase9-provision-error"}: ${error.message}`);
  process.exitCode = 1;
}
