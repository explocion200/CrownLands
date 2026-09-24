"use strict";

const { CORE_EXPANSION_RUNTIME_BUDGET, LEGACY_RUNTIME_BUDGET, evaluateBudgets } = require("./map-benchmark/budgets.js");

const CASE_IDS = Object.freeze([
  "cold-desktop", "warm-desktop", "slow-realm-call", "delayed-city-snapshot",
  "rejected-realm-call", "lost-realm-response", "mobile-throttled-4x", "session-replacement",
]);
const unavailable = (detail, status = "unverified") => ({ status, detail });
const check = (passed, detail) => ({ status: passed ? "passed" : "failed", detail });
const all = (items, predicate) => items.length > 0 && items.every(predicate);

function summarizeMatrixReport(repetition, report) {
  return {
    repetition, runCount: report.runs.length, failures: report.failures || [],
    generatedAt: report.generatedAt, environment: report.environment,
    budgets: evaluateBudgets(report),
    runs: report.runs.map(run => ({
      key: `${run.scenario.id}/${run.profile.id}`,
      cityCount: run.scenario.cityCount, marchCount: run.scenario.marchCount,
      idleFps: run.samples.idle.frame.fps, panFps: run.samples.pan.frame.fps,
      zoomFps: run.samples.zoom.frame.fps, heapUsedBytes: run.heap.usedSize,
      activeListeners: run.runtime.realtime.listeners.active,
      duplicateListenerKeys: run.runtime.realtime.listeners.duplicates.length,
      productionBackendRequests: run.network.productionBackendRequestCount,
      uncaughtErrors: run.consoleErrors.length,
    })),
  };
}

function buildAcceptance(report) {
  const cases = report.localBrowser.cases;
  const ready = cases.filter(item => item.expected === "ready");
  const expectedListeners = (report.repository.worldTopology === "core-expansion-v1"
    ? CORE_EXPANSION_RUNTIME_BUDGET : LEGACY_RUNTIME_BUDGET).activeListeners;
  const repetitions = report.mapMatrix.repetitions;
  const expectedKeys = "ABCDE".split("").flatMap(id => ["desktop", "mobile-landscape", "mobile-landscape-4x"].map(profile => `${id}/${profile}`));
  const matrixComplete = repetitions.length === 3 && repetitions.every(item =>
    item.failures.length === 0 && item.runs.length === 15
    && new Set(item.runs.map(run => run.key)).size === 15
    && expectedKeys.every(key => item.runs.some(run => run.key === key)));
  const checks = {
    deterministicCases: check(CASE_IDS.every(id => cases.filter(item => item.id === id).length === 1)
      && cases.length === CASE_IDS.length && cases.every(item => item.passed), "All eight startup and recovery cases must complete their own assertions."),
    uncaughtErrors: check(all(cases, item => item.uncaughtExceptions.length === 0)
      && all(ready, item => item.runtimeErrors.length === 0), "No unexpected runtime errors."),
    listeners: check(all(ready, item => item.performance?.listeners?.active === expectedListeners
      && item.performance.listeners.duplicates.length === 0), `Current ${report.repository.worldTopology} fixture: ${expectedListeners} listeners and zero duplicates.`),
    fixtureIsolation: check(all(cases, item => item.network.productionBackendRequestCount === 0), "No production backend requests from synthetic clients."),
    configurationParity: check(all(Object.values(report.repository.parity), Boolean), "Repository client, server, and worker contract parity."),
    unchangedInputs: check(report.source.inputsUnchanged === true, "Audited source inputs must not change during the run."),
    matrixCompletion: report.auditProfile.full ? check(matrixComplete, "Three complete repetitions of all 15 profiles; timeouts fail.")
      : unavailable("Full matrix was not requested.", "skipped"),
    matrixBudgets: report.auditProfile.full ? check(matrixComplete && repetitions.every(item => item.budgets.regression.passed && item.budgets.capacity.passed), "Existing regression and capacity budgets, unchanged.")
      : unavailable("Full matrix was not requested.", "skipped"),
    matrixSafety: report.auditProfile.full ? check(matrixComplete && repetitions.every(item => item.runs.every(run =>
      run.duplicateListenerKeys === 0 && run.productionBackendRequests === 0 && run.uncaughtErrors === 0)), "All matrix profiles must be isolated and free of uncaught errors.")
      : unavailable("Full matrix was not requested.", "skipped"),
    productionResources: report.productionAnonymous.length ? check(report.productionAnonymous.every(item => item.ok), "Read-only public HTTP checks.")
      : unavailable("Public checks disabled.", "skipped"),
    productionIdentity: unavailable("No public release identity measured.", "skipped"),
    authenticatedProduction: unavailable("Not exercised: production gameplay writes are outside this audit's authorization."),
    physicalDevices: unavailable("Desktop browser emulation does not verify physical Android/iPhone behavior."),
    itchAuthenticated: unavailable("Only artifact compatibility is in scope; authenticated itch.io gameplay was not exercised."),
  };
  if (report.productionAnonymous.length) {
    const publicChecks = Object.fromEntries(report.productionAnonymous.map(item => [item.id, item]));
    const manifest = publicChecks["release-manifest"]?.detail || {};
    checks.productionIdentity = check(Boolean(manifest.buildId)
      && publicChecks["game-entry"]?.detail?.buildId === manifest.buildId
      && publicChecks["service-worker"]?.detail?.cacheVersion === manifest.buildId
      && publicChecks["game-entry"]?.finalUrl === "https://playcrownlands.com/play/"
      && publicChecks["release-config"]?.detail?.releaseId === report.repository.releaseId
      && publicChecks["release-config"]?.detail?.apiContractHash === report.repository.apiContractHash
      && manifest.releaseId === report.repository.releaseId,
    "Public assets must agree with their deployed manifest; an unreleased audit commit is not the deployed build.");
  }
  const failures = Object.entries(checks).filter(([, value]) => value.status === "failed").map(([name]) => name);
  return { status: failures.length ? "failed" : report.auditProfile.full ? "passed-with-unverified-coverage" : "partial",
    failedChecks: failures, checks, exitCode: failures.length ? 1 : 0 };
}

function buildFindings(report) {
  return Object.entries(report.acceptance.checks).filter(([, result]) => result.status === "failed").map(([name, result]) => ({
    id: `AUDIT-${name}`, severity: ["fixtureIsolation", "uncaughtErrors", "matrixSafety"].includes(name) ? "P1" : "P2",
    status: "open", classification: "observed-check-failure", title: name,
    evidence: result.detail, artifact: "audit.json",
    nextStep: "Reproduce and distinguish harness, environment, and game causes before changing gameplay.",
  }));
}

function markdownReport(report) {
  const escape = value => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
  const rows = report.localBrowser.cases.map(item => `| ${item.id} | ${item.environment.width}×${item.environment.height} / ${item.environment.cpuRate}× | ${item.passed ? "passed" : "failed"} | ${item.outcome.elapsedMs} |`).join("\n");
  const scorecard = Object.entries(report.acceptance.checks).map(([name, value]) => `| ${name} | ${value.status} | ${escape(value.detail)} |`).join("\n");
  const findings = report.findings.map(item => `- **${item.id} (${item.severity}):** ${item.evidence}`).join("\n") || "No required check failed. Unverified coverage remains listed above.";
  const matrix = report.mapMatrix.repetitions.map(item => `| ${item.repetition} | ${item.runCount} | ${item.failures.length} | ${item.budgets.regression.failures.length} | ${item.budgets.capacity.failures.length} |`).join("\n");
  return `# Crownlands stability audit\n\nGenerated ${report.generatedAt}. Source commit: \`${report.source.commit}\`; branch: \`${report.source.branch}\`; dirty: ${report.source.dirtyDuringAudit}. Input digest: \`${report.source.inputDigest}\`.\n\n## Result\n\n**${report.acceptance.status}**. Results below describe this run only. Historical audit conclusions are not carried forward.\n\n## Identity and limits\n\nTopology: ${report.repository.worldTopology}; release: ${report.repository.releaseId}. Static fallback world: ${report.repository.staticFallback.worldId}; this is **not proof of the active production realm**. The live pointer and deployed backend revisions require the separate read-only diagnostics artifact.\n\nSynthetic clients use a loopback backend. Browser timings measure client behavior, not real Firebase latency. Public production reads do not verify authenticated gameplay. No player data is modified.\n\n## Browser cases\n\n| Case | Viewport / CPU | Result | Startup ms |\n|---|---|---|---:|\n${rows}\n\n## Acceptance\n\n| Check | Status | Evidence / limitation |\n|---|---|---|\n${scorecard}\n\n## Map matrix\n\n| Repetition | Completed | Failed profiles | Regression failures | Capacity failures |\n|---|---:|---:|---:|---:|\n${matrix || "| Not run | — | — | — | — |"}\n\nRaw per-profile measurements and budget failures are retained beside this report. Missing measurements are never replaced with synthetic zero values.\n\n## Findings\n\n${findings}\n`;
}

module.exports = { CASE_IDS, buildAcceptance, buildFindings, markdownReport, summarizeMatrixReport };
