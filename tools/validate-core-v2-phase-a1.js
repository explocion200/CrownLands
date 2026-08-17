"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const RESULT_DIR = path.join(ROOT_DIR, "benchmark-results", "map", "core-v2-phase-a1");
const SCREENSHOT_DIR = path.join(RESULT_DIR, "screenshots");
const EXPECTED = Object.freeze({
  core_a1_citadel: { key: "crown-citadel", capacity: 60, objectives: 1 },
  core_a1_ironwatch: { key: "ironwatch", capacity: 60, objectives: 1 },
  core_a1_tower: { key: "southwest-holding-tower", capacity: 55, objectives: 1 },
  core_a1_deed: { key: "west-south-deed-camp", capacity: 60, objectives: 1 },
  core_a1_support: { key: "west-support", capacity: 70, objectives: 0 },
});
const ZOOMS = Object.freeze(["low", "normal", "close"]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
}

function assertFile(relativePath) {
  const filePath = path.join(ROOT_DIR, relativePath);
  assert.ok(fs.existsSync(filePath), `Missing ${relativePath}`);
  assert.ok(fs.statSync(filePath).size > 0, `Empty ${relativePath}`);
}

function validateRuntimeResults() {
  const report = readJson("benchmark-results/map/core-v2-phase-a1/runtime-density-results.json");
  assert.equal(report.developmentOnly, true);
  assert.equal(report.results.length, 15);
  Object.entries(EXPECTED).forEach(([regionId, expected]) => {
    const rows = report.results.filter(row => row.regionId === regionId);
    assert.deepEqual([...new Set(rows.map(row => row.camera.preset))].sort(), [...ZOOMS].sort());
    assert.equal(rows.length, 3);
    rows.forEach(row => {
      assert.equal(row.prototypeKey, expected.key);
      assert.equal(row.expectedCityCapacity, expected.capacity);
      assert.equal(row.dataCityCount, expected.capacity);
      assert.equal(row.objectiveNodes, expected.objectives);
      assert.equal(row.collisions.castles.collisions, 0);
      assert.equal(row.collisions.names.collisions, 0);
      assert.equal(row.collisions.playerBanners.collisions, 0);
      assert.equal(row.collisions.foreignLabels.collisions, 0);
      assert.equal(row.collisions.troopCounts.collisions, 0);
      assert.equal(row.collisions.objectiveVsCities, 0);
      assert.ok(row.marches.routeElements > 0);
      assert.ok(row.transitions.openArrows + row.transitions.gatedEdges === 4);
    });
  });
}

function validateInteractionResults() {
  const report = readJson("benchmark-results/map/core-v2-phase-a1/interaction-results.json");
  assert.equal(report.developmentOnly, true);
  assert.equal(report.results.length, 15);
  Object.keys(EXPECTED).forEach(regionId => {
    const rows = report.results.filter(row => row.regionId === regionId);
    assert.deepEqual([...new Set(rows.map(row => row.zoom))].sort(), [...ZOOMS].sort());
    rows.forEach(row => {
      [row.mouse, row.touch].forEach(result => {
        assert.equal(result.reliable, true);
        assert.equal(result.results.length, 2);
        result.results.forEach(probe => {
          assert.equal(probe.found, true);
          assert.equal(probe.hitMatches, true);
          assert.equal(probe.actionAcknowledged, true);
          assert.equal(probe.cityId, probe.hitCityId);
        });
      });
    });
  });
}

function validateSpacing() {
  const report = readJson("benchmark-results/map/core-v2-phase-a1/spacing-analysis.json");
  assert.equal(report.developmentOnly, true);
  assert.equal(report.results.length, 5);
  report.results.forEach(row => {
    const expected = Object.values(EXPECTED).find(entry => entry.key === row.key);
    assert.ok(expected, `Unexpected spacing row ${row.key}`);
    assert.equal(row.actualCityCount, expected.capacity);
    assert.equal(row.exactCityCapacity, expected.capacity);
    assert.ok(row.minCenterSpacingPx >= 68, `${row.name} dropped below the verified 68 px Core floor`);
    assert.ok(row.p5NearestNeighborSpacingPx >= row.minCenterSpacingPx);
    assert.ok(row.medianNearestNeighborSpacingPx >= row.p5NearestNeighborSpacingPx);
    [70, 75, 80, 90, 100, 112].forEach(threshold => assert.ok(Number.isInteger(row.pairCountsUnderPx[String(threshold)])));
  });
}

function validatePerformance() {
  const report = readJson("benchmark-results/map/core-v2-phase-a1/performance-results.json");
  assert.equal(report.developmentOnly, true);
  assert.equal(report.results.length, 9);
  ["core_a1_tower", "core_a1_citadel", "core_a1_support"].forEach(regionId => {
    const samples = report.results.filter(row => row.regionId === regionId);
    assert.equal(samples.length, 3);
    samples.forEach(row => {
      assert.ok(Number.isFinite(row.sample.fps) && row.sample.fps > 0);
      assert.ok(Number.isFinite(row.sample.p95FrameTimeMs) && row.sample.p95FrameTimeMs > 0);
      assert.ok(Number.isFinite(row.sample.maximumFrameTimeMs) && row.sample.maximumFrameTimeMs > 0);
      assert.equal(row.runtime.collisions.castles.collisions, 0);
      assert.equal(row.runtime.collisions.names.collisions, 0);
    });
  });
}

function validateArtifacts() {
  Object.values(EXPECTED).forEach(expected => {
    ZOOMS.forEach(zoom => assertFile(path.join("benchmark-results", "map", "core-v2-phase-a1", "screenshots", `${expected.key}-${zoom}.png`)));
    assertFile(path.join("benchmark-results", "map", "core-v2-phase-a1", "screenshots", `${expected.key}-tight-cluster.png`));
  });
  [
    "crown-citadel-objective-selection.png",
    "ironwatch-objective-selection.png",
    "runtime-zoom-review-board.png",
    "tight-cluster-review-board.png",
  ].forEach(file => assertFile(path.join("benchmark-results", "map", "core-v2-phase-a1", "screenshots", file)));
  [
    "docs/map-scaling-audit/core-v2/phase-a1/README.md",
    "docs/map-scaling-audit/core-v2/phase-a1/RUNTIME_DENSITY_QA.md",
    "docs/map-scaling-audit/core-v2/phase-a1/OBJECTIVE_PROP_RULEBOOK.md",
    "docs/map-scaling-audit/core-v2/phase-a1/VALIDATION_RESULTS.md",
    "docs/map-scaling-audit/core-v2/phase-a1/SCREENSHOT_INDEX.md",
    "benchmark-results/map/core-v2-phase-a1/SPACING_ANALYSIS.md",
  ].forEach(assertFile);
}

function validateDevelopmentIsolation() {
  const fixtureSource = fs.readFileSync(path.join(ROOT_DIR, "tools", "core-v2-phase-a1", "fixture.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(ROOT_DIR, "tools", "core-v2-phase-a1", "server.js"), "utf8");
  const runtimeSource = fs.readFileSync(path.join(ROOT_DIR, "tools", "core-v2-phase-a1", "injected-runtime.js"), "utf8");
  assert.match(serverSource, /127\.0\.0\.1/);
  assert.match(serverSource, /loopback-only/);
  assert.match(runtimeSource, /development-only loopback fixture/);
  assert.match(fixtureSource, /developmentOnly:\s*true/);
  assert.ok(!fixtureSource.includes("productionActivated: true"));
  Object.keys(EXPECTED).forEach(regionId => assert.match(fixtureSource, new RegExp(regionId)));
}

function run() {
  validateRuntimeResults();
  validateInteractionResults();
  validateSpacing();
  validatePerformance();
  validateArtifacts();
  validateDevelopmentIsolation();
  process.stdout.write("Core v2 Phase A.1 validator: PASS\n");
  process.stdout.write("- exact capacities: 60 / 60 / 55 / 60 / 70\n");
  process.stdout.write("- runtime map/zoom measurements: 15, zero recorded collisions\n");
  process.stdout.write("- tight-pair input probes: 30 mouse + 30 touch, all intended targets\n");
  process.stdout.write("- Core visual spacing floor: >= 68 source-image px\n");
  process.stdout.write("- development-only isolation: PASS\n");
}

if (require.main === module) run();

module.exports = { run };
