"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_PATH = path.join(__dirname, "config.json");
const CONFIG = Object.freeze(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));

function environmentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanProjectId(value) {
  return String(value || "").trim().toLowerCase();
}

function requireExplicitProjectIdentity(input = {}) {
  const targetProjectId = cleanProjectId(input.targetProjectId || process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID);
  const productionProjectId = cleanProjectId(input.productionProjectId || process.env.CROWNLANDS_PRODUCTION_PROJECT_ID);
  if (!targetProjectId) {
    throw environmentError("target-project-required", "CROWNLANDS_PHASE9_TARGET_PROJECT_ID must be set explicitly.");
  }
  if (!productionProjectId) {
    throw environmentError("production-project-required", "CROWNLANDS_PRODUCTION_PROJECT_ID must be set explicitly.");
  }
  if (productionProjectId !== CONFIG.productionProjectId) {
    throw environmentError(
      "production-project-mismatch",
      `Expected the locked production project ${CONFIG.productionProjectId}; received ${productionProjectId}.`,
    );
  }
  if (targetProjectId === productionProjectId) {
    throw environmentError("production-target-forbidden", `Phase 9 refuses production project ${targetProjectId}.`);
  }
  if (targetProjectId !== CONFIG.stagingProjectId) {
    throw environmentError(
      "staging-project-not-allowlisted",
      `Phase 9 allows only the reviewed staging project ${CONFIG.stagingProjectId}; received ${targetProjectId}.`,
    );
  }
  if (!/(?:^|-)stag(?:e|ing)(?:-|$)/.test(targetProjectId)) {
    throw environmentError("staging-name-required", `The target project must be visibly staging-only: ${targetProjectId}.`);
  }
  return Object.freeze({
    environment: CONFIG.environment,
    targetProjectId,
    productionProjectId,
    storageBucket: CONFIG.storageBucket,
  });
}

function requireMutationConfirmation(input = {}) {
  const identity = requireExplicitProjectIdentity(input);
  const confirmation = String(input.confirmation || process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION || "").trim();
  if (confirmation !== CONFIG.operatorConfirmations.mutation) {
    throw environmentError(
      "staging-mutation-confirmation-required",
      `Set CROWNLANDS_PHASE9_MUTATION_CONFIRMATION to ${CONFIG.operatorConfirmations.mutation}.`,
    );
  }
  return identity;
}

function requireDestructiveCleanupConfirmation(input = {}) {
  const identity = requireMutationConfirmation(input);
  const confirmation = String(
    input.destructiveConfirmation || process.env.CROWNLANDS_PHASE9_DESTRUCTIVE_CONFIRMATION || "",
  ).trim();
  if (confirmation !== CONFIG.operatorConfirmations.destructiveCleanup) {
    throw environmentError(
      "destructive-staging-confirmation-required",
      `Set CROWNLANDS_PHASE9_DESTRUCTIVE_CONFIRMATION to ${CONFIG.operatorConfirmations.destructiveCleanup}.`,
    );
  }
  return identity;
}

function assertProjectCatalog(projects, options = {}) {
  const identity = requireExplicitProjectIdentity(options);
  const ids = new Set((projects || []).map(project => cleanProjectId(project.projectId)));
  if (!ids.has(identity.productionProjectId)) {
    throw environmentError(
      "production-project-not-visible",
      `The locked production project ${identity.productionProjectId} was not independently visible.`,
    );
  }
  const stagingExists = ids.has(identity.targetProjectId);
  if (options.requireStagingExists && !stagingExists) {
    throw environmentError("staging-project-not-visible", `Staging project ${identity.targetProjectId} is not visible.`);
  }
  return Object.freeze({ ...identity, productionVisible: true, stagingExists });
}

function environmentBanner(identity) {
  return [
    "============================================================",
    `ENVIRONMENT: ${identity.environment}`,
    `PROJECT: ${identity.targetProjectId}`,
    `PRODUCTION PROJECT (FORBIDDEN): ${identity.productionProjectId}`,
    "NO PRODUCTION DEFAULTS. NO PRODUCTION GENERATED-WORLD WRITES.",
    "============================================================",
  ].join("\n");
}

module.exports = Object.freeze({
  CONFIG,
  CONFIG_PATH,
  cleanProjectId,
  environmentError,
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  requireDestructiveCleanupConfirmation,
  assertProjectCatalog,
  environmentBanner,
});
