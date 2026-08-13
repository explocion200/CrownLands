"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const resultsDir = path.join(root, "benchmark-results", "map");
const visualsDir = path.join(root, "docs", "map-scaling-audit", "phase-2", "visuals");
const source = fs.readFileSync(path.join(root, "game.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const before = readJson(path.join(resultsDir, "phase-2-zoom-profile-before.json"));
const focusedAfter = readJson(path.join(resultsDir, "phase-2-zoom-profile-after.json"));
const fullAfter = readJson(path.join(resultsDir, "phase-2-after.json"));
const assessment = readJson(path.join(resultsDir, "phase-2-budget-assessment.json"));
const visualQa = readJson(path.join(visualsDir, "visual-qa-state.json"));
const checks = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function check(scope, label, passed, actual, expected) {
  checks.push({ scope, label, passed: Boolean(passed), actual, expected });
}

function runFor(report, scenarioId, profileId) {
  return report.runs.find(run => run.scenario.id === scenarioId && run.profile.id === profileId) || null;
}

function constantValue(name) {
  const match = source.match(new RegExp(`const ${name} = ([0-9.]+);`));
  return match ? Number(match[1]) : null;
}

const detailFunctionMatch = source.match(/function getMapDetailLevel\(currentLevel, zoomLevel\) \{[\s\S]*?\n\}/);
check("lod", "production detail-level function exists", Boolean(detailFunctionMatch), Boolean(detailFunctionMatch), true);
const lodContext = {
  MAP_DETAIL_FAR_ENTER_ZOOM: constantValue("MAP_DETAIL_FAR_ENTER_ZOOM"),
  MAP_DETAIL_FAR_EXIT_ZOOM: constantValue("MAP_DETAIL_FAR_EXIT_ZOOM"),
  MAP_DETAIL_CLOSE_ENTER_ZOOM: constantValue("MAP_DETAIL_CLOSE_ENTER_ZOOM"),
  MAP_DETAIL_CLOSE_EXIT_ZOOM: constantValue("MAP_DETAIL_CLOSE_EXIT_ZOOM"),
};
if (detailFunctionMatch) {
  vm.createContext(lodContext);
  vm.runInContext(`${detailFunctionMatch[0]}; this.getMapDetailLevel = getMapDetailLevel;`, lodContext);
  const transitions = [
    ["", 0.45, "far"],
    ["far", 0.57, "far"],
    ["far", 0.58, "medium"],
    ["medium", 0.53, "medium"],
    ["medium", 0.52, "far"],
    ["medium", 0.83, "medium"],
    ["medium", 0.84, "close"],
    ["close", 0.77, "close"],
    ["close", 0.76, "medium"],
    ["far", 0.90, "close"],
    ["close", 0.45, "far"],
  ];
  transitions.forEach(([current, zoom, expected]) => {
    const actual = lodContext.getMapDetailLevel(current, zoom);
    check("lod", `${current || "initial"} at ${zoom}`, actual === expected, actual, expected);
  });
}

check("lod", "far and medium hit sizes are discrete CSS values", styles.includes(".map-frame.detail-far .map-world { --map-hit-size: 110px; }") && styles.includes(".map-frame.detail-medium .map-world { --map-hit-size: 84px; }"), "source scan", true);
check("lod", "camera transform does not rewrite inherited hit-size custom property", !source.includes('mapWorld.style.setProperty("--map-hit-size"'), "source scan", "no per-frame write");
check("lod", "far LOD hides route flow but not route ribbon", styles.includes(".map-frame.detail-far .paths .army-route-flow { display: none; }") && !styles.includes(".map-frame.detail-far .paths .army-route-ribbon { display: none; }"), "source scan", true);
check("lod", "far label rule preserves selected, targeted, main, and stronghold nodes", styles.includes(":not(.selected):not(.targeted):not(.main-city-node):not(.stronghold-node)"), "source scan", true);
check("lod", "far march rule preserves selected token detail", styles.includes(".map-frame.detail-far .army-token:not(.selected) .army-token-count"), "source scan", true);

for (const profileId of ["desktop", "mobile-landscape"]) {
  const beforeRun = runFor(before, "C", profileId);
  const focusedRun = runFor(focusedAfter, "C", profileId);
  const fullRun = runFor(fullAfter, "C", profileId);
  const fpsGate = profileId === "desktop" ? 15 : 10;
  check("primary-gate", `focused C/${profileId} zoom FPS`, focusedRun?.zoom?.frame?.fps >= fpsGate, focusedRun?.zoom?.frame?.fps, `>= ${fpsGate}`);
  check("primary-gate", `full C/${profileId} zoom FPS`, fullRun?.samples?.zoom?.frame?.fps >= fpsGate, fullRun?.samples?.zoom?.frame?.fps, `>= ${fpsGate}`);
  check("profile", `C/${profileId} style recalculation reduced >= 75%`, focusedRun.zoom.browserMainThread.RecalcStyleMs <= beforeRun.zoom.browserMainThread.RecalcStyleMs * 0.25, focusedRun.zoom.browserMainThread.RecalcStyleMs / beforeRun.zoom.browserMainThread.RecalcStyleMs, "<= 0.25x");
  check("profile", `C/${profileId} p95 zoom frame <= 20 ms`, focusedRun.zoom.frame.p95FrameTimeMs <= 20, focusedRun.zoom.frame.p95FrameTimeMs, "<= 20 ms");
  check("profile", `C/${profileId} focused listener count`, focusedRun.runtime.realtime.listeners.active === 17, focusedRun.runtime.realtime.listeners.active, 17);
  check("profile", `C/${profileId} focused duplicate listeners`, focusedRun.runtime.realtime.listeners.duplicates.length === 0, focusedRun.runtime.realtime.listeners.duplicates.length, 0);
  check("profile", `C/${profileId} focused production backend requests`, focusedRun.network.productionBackendRequestCount === 0, focusedRun.network.productionBackendRequestCount, 0);
}

check("controls", "regression assessment", assessment.regression.passed, assessment.regression.passed, true);
check("controls", "capacity assessment", assessment.capacity.passed, assessment.capacity.passed, true);
check("controls", "full matrix has all nominal A-E profiles", ["A", "B", "C", "D", "E"].every(id => runFor(fullAfter, id, "desktop") && runFor(fullAfter, id, "mobile-landscape")), fullAfter.runs.length, ">= 10 nominal runs");
check("controls", "unavailable profiles have explicit watchdog evidence", fullAfter.failures.every(failure => failure.outcome.includes("unavailable") && failure.reason.includes("watchdog")), fullAfter.failures, "explicit unavailable watchdog records");
for (const run of fullAfter.runs) {
  const key = `${run.scenario.id}/${run.profile.id}`;
  check("invariants", `${key} listeners`, run.runtime.realtime.listeners.active === 17, run.runtime.realtime.listeners.active, 17);
  check("invariants", `${key} duplicate listeners`, run.runtime.realtime.listeners.duplicates.length === 0, run.runtime.realtime.listeners.duplicates.length, 0);
  check("invariants", `${key} production backend requests`, run.network.productionBackendRequestCount === 0, run.network.productionBackendRequestCount, 0);
  check("invariants", `${key} heap <= 16 MiB nominal / 24 MiB 4x`, run.heap.usedSize <= (run.profile.cpuRate > 1 ? 24 : 16) * 1024 * 1024, run.heap.usedSize, "within profile budget");
}

check("visual-qa", "six required visual states", visualQa.runs.length === 6, visualQa.runs.length, 6);
for (const run of visualQa.runs) {
  const far = run.label.includes("-far-");
  const medium = run.label.includes("-medium-");
  const close = run.label.includes("-close-");
  const expectedDetail = far ? "detail-far" : medium ? "detail-medium" : "detail-close";
  const expectedViewport = run.label.includes("desktop") ? { width: 1440, height: 900 } : { width: 844, height: 390 };
  const screenshotPath = path.resolve(run.file);
  check("visual-qa", `${run.label} exact viewport`, run.viewport.width === expectedViewport.width && run.viewport.height === expectedViewport.height, run.viewport, expectedViewport);
  check("visual-qa", `${run.label} detail class`, run.detailClass.includes(expectedDetail), run.detailClass, expectedDetail);
  check("visual-qa", `${run.label} ownership city markers`, run.critical.mainCities >= 1, run.critical.mainCities, ">= 1");
  check("visual-qa", `${run.label} shield marker`, run.critical.shieldedCities >= 1 && run.styles.shield?.display !== "none", run.critical.shieldedCities, ">= 1 visible");
  check("visual-qa", `${run.label} selected target`, run.critical.selectedCities >= 1 && run.styles.selectedCityName?.display !== "none", run.critical.selectedCities, ">= 1 visible");
  check("visual-qa", `${run.label} active route ribbons`, run.critical.routeRibbons === 100 && run.styles.ribbon?.display !== "none", run.critical.routeRibbons, "100 visible ribbons");
  check("visual-qa", `${run.label} screenshot exists`, fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 50000, fs.existsSync(screenshotPath) ? fs.statSync(screenshotPath).size : 0, "> 50000 bytes");
  if (far) {
    check("visual-qa", `${run.label} hides secondary route flows`, run.styles.route?.display === "none", run.styles.route?.display, "none");
    check("visual-qa", `${run.label} hides non-critical labels and march text`, run.critical.hiddenGenericCityNames > 0 && run.critical.hiddenArmyCounts > 0 && run.critical.hiddenArmyTimes > 0, run.critical, "non-zero hidden secondary details");
  } else {
    check("visual-qa", `${run.label} restores route flows`, run.styles.route?.display !== "none", run.styles.route?.display, "visible");
  }
  if (!close) check("visual-qa", `${run.label} visible objective`, run.critical.objectives >= 1 && run.styles.objective?.display !== "none", run.critical.objectives, ">= 1 visible");
}

const failures = checks.filter(item => !item.passed);
const decision = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  passed: failures.length === 0,
  checks: checks.length,
  failures,
  results: checks,
  sources: {
    beforeZoomProfile: before.generatedAt,
    afterZoomProfile: focusedAfter.generatedAt,
    fullAfter: fullAfter.generatedAt,
    visualQa: visualQa.generatedAt,
  },
  unavailableProfiles: fullAfter.failures,
};
const outputPath = path.join(resultsDir, "phase-2-decision.json");
fs.writeFileSync(outputPath, `${JSON.stringify(decision, null, 2)}\n`);
console.log(`Phase 2 map decision: ${decision.passed ? "PASS" : "FAIL"} (${checks.length} checks).`);
for (const failure of failures) console.error(`- ${failure.label}: ${JSON.stringify(failure.actual)} (expected ${JSON.stringify(failure.expected)})`);
console.log(`Wrote ${path.relative(root, outputPath)}`);
if (!decision.passed) process.exitCode = 1;
