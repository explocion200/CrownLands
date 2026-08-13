"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { REGRESSION_PROFILES, SURFACE_BUDGETS } = require("./map-benchmark/budgets.js");

const root = path.resolve(__dirname, "..");
const resultsDir = path.join(root, "benchmark-results", "map");
const baseline = read("baseline.json");
const after = read("phase-1-after.json");
const verification = read("phase-1-verification.json");
const aDesktopVerification = read("phase-1-verification-a-desktop.json");
const checks = [];

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(resultsDir, name), "utf8"));
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function check(scope, label, passed, actual, expected) {
  checks.push({ scope, label, passed: Boolean(passed), actual, expected });
}

function fullRun(scenarioId, profileId, report = after) {
  return report.runs.find(run => run.scenario.id === scenarioId && run.profile.id === profileId) || null;
}

function cohort(scenarioId, profileId) {
  return [
    fullRun(scenarioId, profileId),
    ...verification.runs.filter(run => run.scenario.id === scenarioId && run.profile.baseProfileId === profileId),
    ...aDesktopVerification.runs.filter(run => run.scenario.id === scenarioId && run.profile.baseProfileId === profileId),
  ].filter(Boolean);
}

function metricMedian(runs, readMetric) {
  return median(runs.map(readMetric));
}

function checkPerformanceCohort(scenarioId, profileId, budget, scope) {
  const runs = cohort(scenarioId, profileId);
  const expectedCount = scenarioId === "A" && profileId === "desktop" ? 5 : 3;
  check(scope, `${scenarioId}/${profileId} repeat count`, runs.length === expectedCount, runs.length, expectedCount);
  const samples = ["idle", "pan", "zoom"];
  samples.forEach((sample, index) => {
    if (budget.fps[index] != null) {
      const actual = metricMedian(runs, run => run.samples[sample].frame.fps);
      check(scope, `${scenarioId}/${profileId} ${sample} FPS median`, actual >= budget.fps[index], actual, `>= ${budget.fps[index]}`);
    }
    if (budget.p95?.[index] != null) {
      const actual = metricMedian(runs, run => run.samples[sample].frame.p95FrameTimeMs);
      check(scope, `${scenarioId}/${profileId} ${sample} p95 median`, actual != null && actual <= budget.p95[index], actual, `<= ${budget.p95[index]} ms`);
    }
    if (budget.longTasks?.[index] != null) {
      const actual = metricMedian(runs, run => run.samples[sample].frame.longTaskCount);
      check(scope, `${scenarioId}/${profileId} ${sample} long-task median`, actual <= budget.longTasks[index], actual, `<= ${budget.longTasks[index]}`);
    }
  });
  const ready = metricMedian(runs, run => run.initialRegionLoadLatencyMs);
  check(scope, `${scenarioId}/${profileId} ready median`, ready <= budget.readyMs, ready, `<= ${budget.readyMs} ms`);
}

for (const scenarioId of ["A", "D"]) {
  for (const profileId of ["desktop", "mobile-landscape"]) {
    checkPerformanceCohort(
      scenarioId,
      profileId,
      REGRESSION_PROFILES[`${scenarioId}/${profileId}`],
      "regression"
    );
  }
}

for (const profileId of ["desktop", "mobile-landscape"]) {
  const budget = profileId === "desktop"
    ? { fps: [30, 30, 20], idleP95: 100, readyMs: 15000 }
    : { fps: [24, 24, 15], idleP95: 150, readyMs: 15000 };
  const runs = cohort("B", profileId);
  check("scenario-b", `B/${profileId} repeat count`, runs.length === 3, runs.length, 3);
  ["idle", "pan", "zoom"].forEach((sample, index) => {
    const actual = metricMedian(runs, run => run.samples[sample].frame.fps);
    check("scenario-b", `B/${profileId} ${sample} FPS median`, actual >= budget.fps[index], actual, `>= ${budget.fps[index]}`);
  });
  const idleP95 = metricMedian(runs, run => run.samples.idle.frame.p95FrameTimeMs);
  const ready = metricMedian(runs, run => run.initialRegionLoadLatencyMs);
  check("scenario-b", `B/${profileId} idle p95 median`, idleP95 <= budget.idleP95, idleP95, `<= ${budget.idleP95} ms`);
  check("scenario-b", `B/${profileId} ready median`, ready <= budget.readyMs, ready, `<= ${budget.readyMs} ms`);
}

for (const profileId of ["desktop", "mobile-landscape"]) {
  const run = fullRun("C", profileId);
  check("scenario-c", `C/${profileId} initialized`, Boolean(run), Boolean(run), true);
  if (run) check("scenario-c", `C/${profileId} ready`, run.initialRegionLoadLatencyMs <= 20000, run.initialRegionLoadLatencyMs, "<= 20000 ms");
}

for (const profileId of ["desktop", "mobile-landscape"]) {
  const beforeRun = fullRun("E", profileId, baseline);
  const afterRun = fullRun("E", profileId);
  const regressionBudget = REGRESSION_PROFILES[`E/${profileId}`];
  ["idle", "pan", "zoom"].forEach((sample, index) => {
    if (regressionBudget.fps[index] == null) return;
    const actual = afterRun?.samples[sample].frame.fps ?? 0;
    check("scenario-e", `E/${profileId} ${sample} FPS`, actual >= regressionBudget.fps[index], actual, `>= ${regressionBudget.fps[index]}`);
  });
  const improvement = afterRun.samples.idle.frame.fps / beforeRun.samples.idle.frame.fps;
  check("scenario-e", `E/${profileId} idle improvement`, improvement >= 1.5, improvement, ">= 1.5x");
}

for (const run of after.runs) {
  const key = `${run.scenario.id}/${run.profile.id}`;
  const surface = SURFACE_BUDGETS[run.scenario.id];
  if (surface) {
    check("invariants", `${key} total DOM`, run.runtime.dom.totalNodes <= surface.totalNodes, run.runtime.dom.totalNodes, `<= ${surface.totalNodes}`);
    check("invariants", `${key} map DOM`, run.runtime.dom.mapWorldNodes <= surface.mapNodes, run.runtime.dom.mapWorldNodes, `<= ${surface.mapNodes}`);
    check("invariants", `${key} SVG paths`, run.runtime.dom.svgPaths <= surface.paths, run.runtime.dom.svgPaths, `<= ${surface.paths}`);
  }
  check("invariants", `${key} city fixture`, run.initialRuntime.dataCityCount === run.scenario.cityCount, run.initialRuntime.dataCityCount, run.scenario.cityCount);
  check("invariants", `${key} march fixture`, run.initialRuntime.dataMarchCount === run.scenario.marchCount, run.initialRuntime.dataMarchCount, run.scenario.marchCount);
  check("invariants", `${key} listeners`, run.runtime.realtime.listeners.active === 17, run.runtime.realtime.listeners.active, 17);
  check("invariants", `${key} duplicate listeners`, run.runtime.realtime.listeners.duplicates.length === 0, run.runtime.realtime.listeners.duplicates.length, 0);
  check("invariants", `${key} listeners after map switch`, run.samples.mapSwitch.actionResult.after.active === 17, run.samples.mapSwitch.actionResult.after.active, 17);
  check("invariants", `${key} production backend requests`, run.network.productionBackendRequestCount === 0, run.network.productionBackendRequestCount, 0);
  check("invariants", `${key} browser requests`, run.network.requestCount <= 80, run.network.requestCount, "<= 80");
  check("invariants", `${key} encoded transfer`, run.network.encodedBytes <= 8 * 1024 * 1024, run.network.encodedBytes, "<= 8 MiB");
  check("invariants", `${key} JS heap`, run.heap.usedSize <= (run.profile.cpuRate > 1 ? 24 : 16) * 1024 * 1024, run.heap.usedSize, run.profile.cpuRate > 1 ? "<= 24 MiB" : "<= 16 MiB");
}

const failures = checks.filter(item => !item.passed);
const decision = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources: {
    baseline: baseline.generatedAt,
    after: after.generatedAt,
    verification: verification.generatedAt,
    aDesktopVerification: aDesktopVerification.generatedAt,
  },
  policy: "Five-run median for variable A/desktop; three-run nominal medians for remaining A/B/D profiles; full Phase 1 run for C/E and invariants.",
  passed: failures.length === 0,
  checks: checks.length,
  failures,
  results: checks,
  diagnosticUnavailableProfiles: after.failures,
};
const outputPath = path.join(resultsDir, "phase-1-decision.json");
fs.writeFileSync(outputPath, `${JSON.stringify(decision, null, 2)}\n`);
console.log(`Phase 1 map decision: ${decision.passed ? "PASS" : "FAIL"} (${checks.length} checks).`);
for (const failure of failures) console.error(`- ${failure.label}: ${failure.actual} (expected ${failure.expected})`);
console.log(`Wrote ${path.relative(root, outputPath)}`);
if (!decision.passed) process.exitCode = 1;
