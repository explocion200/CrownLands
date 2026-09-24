"use strict";
const assert = require("node:assert/strict");
const { CASE_IDS, buildAcceptance, buildFindings, markdownReport } = require("./stability-audit-report.js");

function fixture() {
  return {
    source: { commit: "audit-commit", branch: "codex/test", inputDigest: "test", inputsUnchanged: true },
    generatedAt: "2026-09-24T00:00:00Z", auditProfile: { full: false },
    repository: { worldTopology: "core-expansion-v1", releaseId: "release", apiContractHash: "contract",
      staticFallback: { worldId: "legacy-fallback" }, parity: { contracts: true } },
    localBrowser: { cases: CASE_IDS.map(id => ({
      id, expected: /rejected|lost/.test(id) ? "failed" : "ready", passed: true,
      uncaughtExceptions: [], runtimeErrors: [], network: { productionBackendRequestCount: 0 },
      performance: { listeners: { active: 18, duplicates: [] } },
      environment: { width: 1440, height: 900, cpuRate: 1 }, outcome: { elapsedMs: 100 },
    })) },
    mapMatrix: { repetitions: [] }, productionAnonymous: [],
  };
}

function evaluate(report) {
  report.acceptance = buildAcceptance(report);
  report.findings = buildFindings(report);
  return report;
}

const quick = evaluate(fixture());
assert.equal(quick.acceptance.status, "partial");
assert.equal(quick.acceptance.exitCode, 0);
assert.equal(quick.acceptance.checks.listeners.status, "passed");
assert.equal(quick.acceptance.checks.matrixCompletion.status, "skipped");
assert.equal(quick.acceptance.checks.authenticatedProduction.status, "unverified");
assert.equal(quick.findings.length, 0, "Historical defects must not become new findings.");
assert.ok(!markdownReport(quick).includes("STAB-003"));

for (const [name, mutate] of [
  ["missing cases", r => { r.localBrowser.cases = []; }],
  ["failed case", r => { r.localBrowser.cases[0].passed = false; }],
  ["extra listener", r => { r.localBrowser.cases[0].performance.listeners.active = 19; }],
  ["duplicate listener", r => { r.localBrowser.cases[0].performance.listeners.duplicates = ["cities"]; }],
  ["production request", r => { r.localBrowser.cases[0].network.productionBackendRequestCount = 1; }],
  ["uncaught exception", r => { r.localBrowser.cases[0].uncaughtExceptions = ["failure"]; }],
  ["changed inputs", r => { r.source.inputsUnchanged = false; }],
  ["missing full matrix", r => { r.auditProfile.full = true; }],
]) {
  const report = fixture(); mutate(report); evaluate(report);
  assert.equal(report.acceptance.exitCode, 1, name);
  assert.ok(report.findings.length > 0, name);
  assert.ok(markdownReport(report).includes("**failed**"), name);
}

const publicReport = fixture();
publicReport.productionAnonymous = [
  { id: "game-entry", ok: true, finalUrl: "https://playcrownlands.com/play/", detail: { buildId: "deployed-commit" } },
  { id: "service-worker", ok: true, detail: { cacheVersion: "deployed-commit" } },
  { id: "release-manifest", ok: true, detail: { buildId: "deployed-commit", releaseId: "release" } },
  { id: "release-config", ok: true, detail: { releaseId: "release", apiContractHash: "contract" } },
];
assert.equal(evaluate(publicReport).acceptance.checks.productionIdentity.status, "passed", "Unreleased audit commits need not equal production.");
publicReport.productionAnonymous[1].detail.cacheVersion = "stale-worker";
assert.equal(evaluate(publicReport).acceptance.exitCode, 1, "Mixed deployed assets must fail.");

const full = fixture();
full.auditProfile.full = true;
full.mapMatrix.repetitions = [1, 2, 3].map(repetition => ({ repetition, runCount: 15, failures: [],
  budgets: { regression: { passed: true, failures: [] }, capacity: { passed: true, failures: [] } },
  runs: "ABCDE".split("").flatMap(id => ["desktop", "mobile-landscape", "mobile-landscape-4x"].map(profile => ({
    key: `${id}/${profile}`, duplicateListenerKeys: 0, productionBackendRequests: 0, uncaughtErrors: 0,
  }))),
}));
assert.equal(evaluate(full).acceptance.status, "passed-with-unverified-coverage");
full.mapMatrix.repetitions[0].failures.push({ reason: "watchdog" });
assert.equal(evaluate(full).acceptance.exitCode, 1, "Timed-out profiles are incomplete.");
full.mapMatrix.repetitions[0].failures = [];
full.mapMatrix.repetitions[0].budgets.regression.passed = false;
assert.equal(evaluate(full).acceptance.checks.matrixBudgets.status, "failed");
full.mapMatrix.repetitions[0].budgets.regression.passed = true;
full.mapMatrix.repetitions[0].runs[0].key = full.mapMatrix.repetitions[0].runs[1].key;
assert.equal(evaluate(full).acceptance.checks.matrixCompletion.status, "failed", "Duplicate results cannot replace missing profiles.");
console.log("Stability audit validation passed: current budgets, missing coverage, stale assets, incomplete matrices, and failure exit codes.");

const { bounded } = require("./stability-audit-runtime.js");
(async () => {
  assert.equal(await bounded(Promise.resolve("done"), 100, "test"), "done");
  await assert.rejects(bounded(new Promise(() => {}), 5, "stalled browser"), /stalled browser.*watchdog/);
  await assert.rejects(bounded(Promise.reject(new Error("original failure")), 100, "test"), /original failure/);
  console.log("Audit watchdog validation passed: success, stalled work, and original failures.");
})().catch(error => { console.error(error); process.exitCode = 1; });
