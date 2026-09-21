"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PLAN_PATH = "validation-plan.json";
const TEST_PATH = /^(?:tools\/(?:test|validate)-[a-z0-9-]+\.js|tools\/audit-season-balance\.js|tools\/audio-browser-test-server\.js|functions\/test\/emulator-[a-z0-9-]+\.js)$/;
const WORKFLOW_PATHS = new Set([
  "AGENTS.md", "docs/SAFE_UPDATE_WORKFLOW.md", "tools/validation-plan.js",
  "tools/change-risk-classifier.js", "tools/run-validation-tier.js", "tools/run-focused-validators.js",
  "tools/validate-focused-browser-smoke.js",
  "tools/start-feature.js", "tools/prepare-pr.js", "tools/pre-push-check.js", "tools/safe-update-lib.js",
  "tools/validate-release-gate.js", "tools/test-change-risk-classifier.js",
  "tools/test-targeted-validation.js", "tools/test-safe-update-pipeline.js",
  ".github/workflows/crownlands-release-gate.yml", "functions/test/run-emulator-gates.js",
]);
const WORKFLOW_TESTS = [
  "tools/test-change-risk-classifier.js", "tools/test-targeted-validation.js",
  "tools/test-safe-update-pipeline.js", "tools/validate-release-gate.js",
];

function normalizePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /[:\0\r\n]/.test(normalized)
      || normalized.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Invalid repository path: ${JSON.stringify(value)}`);
  }
  return normalized;
}

function isDocumentation(file) {
  return /\.(?:md|mdx|txt)$/i.test(file) && !WORKFLOW_PATHS.has(file);
}

function needsEmulator(file) {
  return (file.startsWith("functions/") && !file.startsWith("functions/test/")
      && !/\/(?:package\.json|pnpm-lock\.yaml)$/.test(file))
    || file.startsWith("functions-auto-reset/")
    || ["firestore.rules", "firestore.indexes.json", "firebase.json", "firebaseClient.js"].includes(file);
}

function needsBuild(file) {
  return !isDocumentation(file) && !WORKFLOW_PATHS.has(file) && file !== PLAN_PATH
    && !file.startsWith("tools/") && !file.startsWith(".github/")
    && !file.startsWith(".githooks/") && !file.startsWith("functions/test/")
    && !/(?:^|\/)(?:package\.json|pnpm-lock\.yaml|eslint\.config\.mjs)$/.test(file);
}

function testArguments(file) {
  if (file === "tools/audit-season-balance.js") return ["--check"];
  if (file === "tools/audio-browser-test-server.js") return ["--self-test"];
  return [];
}

function selectValidation(changes, plan, options = {}) {
  const files = [...new Set(changes.flatMap(change => change.paths.map(normalizePath)))].sort();
  const changedPaths = files.filter(file => file !== PLAN_PATH);
  if (!plan || plan.schemaVersion !== 1 || !Array.isArray(plan.coverage)) {
    throw new Error(`Add ${PLAN_PATH} with schemaVersion 1, baseCommit, and coverage for the changed files.`);
  }
  if (!/^[a-f0-9]{40}$/.test(plan.baseCommit || "")) throw new Error("The validation plan needs an exact baseCommit SHA.");
  if (options.baseCommit && plan.baseCommit !== options.baseCommit) {
    throw new Error("The validation plan is stale: baseCommit must equal the current branch merge base. Review coverage against the new base.");
  }
  const coverage = new Map();
  const selected = new Set();
  for (const group of plan.coverage) {
    if (!Array.isArray(group.paths) || !group.paths.length || !Array.isArray(group.tests)
        || typeof group.reason !== "string" || group.reason.trim().length < 12) {
      throw new Error("Each coverage group needs paths, tests, and a meaningful reason describing affected behavior and dependencies.");
    }
    const tests = group.tests.map(normalizePath);
    for (const test of tests) {
      if (!TEST_PATH.test(test)) throw new Error(`Unsupported test entry point: ${test}. Use a validator/test file, not a shell command.`);
      if (options.repoRoot && !fs.existsSync(path.join(options.repoRoot, test))) throw new Error(`Selected test does not exist: ${test}`);
      selected.add(test);
    }
    for (const item of group.paths) {
      const file = normalizePath(item);
      if (!changedPaths.includes(file)) throw new Error(`Stale or unrelated coverage path: ${file}`);
      if (coverage.has(file)) throw new Error(`Duplicate coverage path: ${file}`);
      if (!tests.length && !isDocumentation(file)) throw new Error(`Changed executable/configuration/asset file has no tests: ${file}`);
      if (needsEmulator(file) && !tests.some(test => test.startsWith("functions/test/emulator-"))) {
        throw new Error(`Server/authority change needs affected emulator coverage: ${file}`);
      }
      coverage.set(file, { tests, reason: group.reason.trim() });
    }
  }
  for (const file of changedPaths) {
    if (!coverage.has(file)) throw new Error(`Changed file is missing from ${PLAN_PATH}: ${file}`);
  }
  // A newly added or edited test is itself part of the change and must execute.
  for (const change of changes) {
    if (change.status.startsWith("D")) continue;
    const file = normalizePath(change.paths.at(-1));
    if (TEST_PATH.test(file)) selected.add(file);
  }
  // Validate the selector and push protections whenever this workflow changes.
  if (files.some(file => WORKFLOW_PATHS.has(file))) WORKFLOW_TESTS.forEach(test => selected.add(test));
  for (const test of selected) {
    if (options.repoRoot && !fs.existsSync(path.join(options.repoRoot, test))) throw new Error(`Required test is missing: ${test}`);
  }
  const tests = [...selected].sort();
  return {
    tier: "Targeted", requiresEmulators: tests.some(test => test.startsWith("functions/test/emulator-")),
    forcedFull: false, decisionReason: "reviewed coverage selects tests for every changed file and its affected dependencies",
    changes, files: files.map(file => ({ path: file, status: changes.find(change => change.paths.includes(file))?.status,
      tier: "Targeted", reason: coverage.get(file)?.reason || "validation selection metadata" })),
    staticTests: tests.filter(test => test.startsWith("tools/")),
    emulatorTests: tests.filter(test => test.startsWith("functions/test/")),
    buildRequired: changedPaths.some(needsBuild) || tests.some(test => [
      "tools/validate-focused-browser-smoke.js", "tools/validate-production-artifact.js",
      "tools/validate-clan-tower-map-browser.js",
    ].includes(test)),
    dependencyAuditRequired: changedPaths.some(file => /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(file)),
    coverage: plan.coverage,
  };
}

module.exports = { PLAN_PATH, TEST_PATH, WORKFLOW_TESTS, isDocumentation, needsBuild, needsEmulator, normalizePath, selectValidation, testArguments };
