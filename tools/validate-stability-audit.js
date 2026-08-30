"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { loadAuthoritativeRealmContract } = require("./map-benchmark/realm-contract.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(ROOT_DIR, "benchmark-results", "stability", "baseline.json");
const REPORT_PATH = path.join(ROOT_DIR, "docs", "stability-audit", "STABILITY_LOGIN_PERFORMANCE_AUDIT.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validate() {
  assert.ok(fs.existsSync(BASELINE_PATH), "Tracked stability baseline is missing.");
  assert.ok(fs.existsSync(REPORT_PATH), "Stability audit report is missing.");
  const baseline = readJson(BASELINE_PATH);
  const report = fs.readFileSync(REPORT_PATH, "utf8");
  const authoritativeRealm = loadAuthoritativeRealmContract();

  assert.equal(baseline.schemaVersion, 1, "Unexpected stability baseline schema.");
  assert.equal(baseline.auditProfile.full, true, "Tracked baseline must use the full audit profile.");
  assert.ok(baseline.auditProfile.soakMinutes >= 60, "Tracked baseline must include at least a 60-minute soak.");
  assert.ok(baseline.auditProfile.mapSwitches >= 50, "Tracked baseline must include at least 50 map switches.");
  assert.ok(baseline.auditProfile.foregroundCycles >= 20, "Tracked baseline must include at least 20 foreground recovery cycles.");
  assert.ok(baseline.auditProfile.reconnectCycles >= 10, "Tracked baseline must include at least 10 reconnect cycles.");

  assert.equal(baseline.repository.releaseId, authoritativeRealm.releaseId, "Baseline release identity drifted.");
  assert.equal(baseline.repository.apiContractHash, authoritativeRealm.contractHash, "Baseline API contract drifted.");
  assert.equal(baseline.repository.skillPointSystemVersion, authoritativeRealm.skillPointSystemVersion, "Baseline progression capability drifted.");
  assert.ok(Object.values(baseline.repository.parity).every(Boolean), "Repository configuration, cache, rules, or index parity failed.");

  const expectedCaseIds = [
    "cold-desktop",
    "warm-desktop",
    "slow-realm-call",
    "delayed-city-snapshot",
    "rejected-realm-call",
    "lost-realm-response",
    "mobile-throttled-4x",
    "session-replacement",
  ];
  assert.deepEqual(baseline.localBrowser.cases.map(testCase => testCase.id), expectedCaseIds, "Stability browser case matrix drifted.");
  for (const testCase of baseline.localBrowser.cases) {
    assert.equal(testCase.uncaughtExceptions.length, 0, `${testCase.id} recorded an uncaught exception.`);
    assert.equal(testCase.network.productionBackendRequestCount, 0, `${testCase.id} contacted a production backend.`);
    if (testCase.expected === "ready") {
      assert.equal(testCase.outcome.ready, true, `${testCase.id} did not reach interactive readiness.`);
      assert.equal(testCase.runtimeErrors.length, 0, `${testCase.id} recorded an unhandled runtime error.`);
      assert.equal(testCase.performance.listeners.duplicates.length, 0, `${testCase.id} recorded duplicate listener keys.`);
    } else {
      assert.equal(testCase.passed, true, `${testCase.id} did not fail in the expected bounded, actionable way.`);
      assert.ok(testCase.outcome.elapsedMs < 15000, `${testCase.id} exceeded the bounded failure window.`);
    }
  }

  assert.equal(baseline.mapMatrix.status, "complete", "Full A-E matrix was not completed.");
  assert.equal(baseline.mapMatrix.repetitions.length, 3, "A-E matrix must run three times.");
  const nominalBudgets = {
    A: { desktop: [60, 75, 45], mobile: [55, 70, 35] },
    B: { desktop: [30, 30, 20], mobile: [24, 24, 15] },
    C: { desktop: [20, 20, 15], mobile: [15, 15, 10] },
    D: { desktop: [90, 90, 1], mobile: [90, 90, 1] },
    E: { desktop: [18, 28, 6], mobile: [9, 16, 2] },
  };
  for (const repetition of baseline.mapMatrix.repetitions) {
    assert.equal(repetition.runCount + repetition.failures.length, 15, `Matrix repetition ${repetition.repetition} did not attempt all 15 scenario/profile combinations.`);
    for (const run of repetition.runs) {
      assert.equal(run.duplicateListenerKeys, 0, `${run.scenario}/${run.profile} recorded duplicate listener keys.`);
      assert.equal(run.productionBackendRequests, 0, `${run.scenario}/${run.profile} contacted a production backend.`);
      const throttled = run.profile === "mobile-landscape-4x";
      const profileKind = run.profile === "desktop" ? "desktop" : "mobile";
      const [idleMinimum, panMinimum, zoomMinimum] = throttled
        ? run.scenario === "D" ? [10, 9, 1] : [1, 1, 1]
        : nominalBudgets[run.scenario][profileKind];
      assert.ok(run.idleFps >= idleMinimum, `${run.scenario}/${run.profile} idle FPS fell below ${idleMinimum}.`);
      assert.ok(run.panFps >= panMinimum, `${run.scenario}/${run.profile} pan FPS fell below ${panMinimum}.`);
      assert.ok(run.zoomFps >= zoomMinimum, `${run.scenario}/${run.profile} zoom FPS fell below ${zoomMinimum}.`);
      assert.ok(run.heapUsedBytes <= (throttled ? 24 : 16) * 1024 * 1024, `${run.scenario}/${run.profile} exceeded its JS heap budget.`);
    }
  }

  assert.equal(baseline.productionAuthenticated.status, "blocked", "Authenticated production status must remain blocked without the approved QA account.");
  assert.equal(baseline.itchAuthenticated.status, "blocked", "Authenticated itch.io status must not be inferred from repository checks.");
  assert.equal(baseline.acceptance.checks.anonymousProductionResourcesReachable, true, "Public production resources were not all reachable.");
  assert.equal(baseline.acceptance.checks.anonymousProductionIdentityMatches, true, "Public production build, cache, release, or contract identity drifted.");
  const findingIds = new Set(baseline.findings.map(finding => finding.id));
  ["STAB-001", "STAB-002", "STAB-003", "STAB-004", "STAB-005", "STAB-006"].forEach(id => assert.ok(findingIds.has(id), `Missing ${id} finding.`));
  assert.equal(baseline.findings.find(finding => finding.id === "STAB-003")?.classification, "confirmed", "Listener-budget drift must remain a confirmed finding while base sessions settle above 17.");
  assert.equal(baseline.findings.find(finding => finding.id === "STAB-004")?.classification, "confirmed", "Heartbeat lifecycle recovery must remain a confirmed finding.");
  assert.equal(baseline.findings.find(finding => finding.id === "STAB-004")?.status, "fixed", "Heartbeat lifecycle recovery must remain marked fixed.");

  [
    "# Crown Lands Stability, Login, and Performance Audit",
    "## Decision summary",
    "## Deterministic browser matrix",
    "## Acceptance scorecard",
    "## Findings",
    "STAB-003",
    "STAB-004",
    "lifecycle generation",
    "17-listener",
    "benchmark-results/stability/baseline.json",
  ].forEach(anchor => assert.ok(report.includes(anchor), `Audit report is missing: ${anchor}`));

  const serialized = JSON.stringify(baseline);
  assert.ok(!/(?:apiKey|accessToken|refreshToken|idToken|password)\s*["']?\s*:/i.test(serialized), "Stability baseline may contain a credential field.");
  assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(serialized), "Stability baseline contains a Firebase API key pattern.");
  assert.ok(!/file:\/\//i.test(serialized), "Stability baseline contains a local file URI.");

  console.log("Stability audit validation passed: full profile, contract parity, fault matrix, safety, findings, and report anchors verified.");
}

validate();
