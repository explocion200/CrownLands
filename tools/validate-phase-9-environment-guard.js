"use strict";

const assert = require("node:assert/strict");
const {
  CONFIG,
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  requireDestructiveCleanupConfirmation,
  assertProjectCatalog,
} = require("./map-scaling-phase-9/environment");

// The guard validator must exercise missing-input behavior even when invoked from
// an operator shell that currently has valid staging variables exported.
delete process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID;
delete process.env.CROWNLANDS_PRODUCTION_PROJECT_ID;
delete process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION;
delete process.env.CROWNLANDS_PHASE9_DESTRUCTIVE_CONFIRMATION;

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `Expected ${code}.`);
}

function explicit(overrides = {}) {
  return {
    targetProjectId: CONFIG.stagingProjectId,
    productionProjectId: CONFIG.productionProjectId,
    ...overrides,
  };
}

expectCode(() => requireExplicitProjectIdentity({}), "target-project-required");
expectCode(
  () => requireExplicitProjectIdentity({ targetProjectId: CONFIG.stagingProjectId }),
  "production-project-required",
);
expectCode(
  () => requireExplicitProjectIdentity(explicit({ targetProjectId: CONFIG.productionProjectId })),
  "production-target-forbidden",
);
expectCode(
  () => requireExplicitProjectIdentity(explicit({ targetProjectId: "unreviewed-staging-project" })),
  "staging-project-not-allowlisted",
);
expectCode(
  () => requireExplicitProjectIdentity(explicit({ productionProjectId: "wrong-production-project" })),
  "production-project-mismatch",
);

const identity = requireExplicitProjectIdentity(explicit());
assert.equal(identity.environment, "STAGING");
assert.notEqual(identity.targetProjectId, identity.productionProjectId);

expectCode(() => requireMutationConfirmation(explicit()), "staging-mutation-confirmation-required");
const mutationIdentity = requireMutationConfirmation(explicit({
  confirmation: CONFIG.operatorConfirmations.mutation,
}));
assert.equal(mutationIdentity.targetProjectId, CONFIG.stagingProjectId);

expectCode(
  () => requireDestructiveCleanupConfirmation(explicit({ confirmation: CONFIG.operatorConfirmations.mutation })),
  "destructive-staging-confirmation-required",
);
const cleanupIdentity = requireDestructiveCleanupConfirmation(explicit({
  confirmation: CONFIG.operatorConfirmations.mutation,
  destructiveConfirmation: CONFIG.operatorConfirmations.destructiveCleanup,
}));
assert.equal(cleanupIdentity.targetProjectId, CONFIG.stagingProjectId);

const catalog = assertProjectCatalog([
  { projectId: CONFIG.productionProjectId },
], explicit());
assert.equal(catalog.productionVisible, true);
assert.equal(catalog.stagingExists, false);
expectCode(
  () => assertProjectCatalog([{ projectId: CONFIG.productionProjectId }], explicit({ requireStagingExists: true })),
  "staging-project-not-visible",
);

console.log(JSON.stringify({
  phase: 9,
  result: "PASS",
  productionProjectId: CONFIG.productionProjectId,
  stagingProjectId: CONFIG.stagingProjectId,
  productionTargetRejected: true,
  explicitTargetRequired: true,
  mutationConfirmationRequired: true,
  destructiveCleanupConfirmationRequired: true,
}, null, 2));
