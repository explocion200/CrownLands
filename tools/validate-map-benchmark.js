"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { BENCHMARK_SEED, SCENARIOS, createFixture } = require("./map-benchmark/fixtures.js");

const root = path.resolve(__dirname, "..");
const productionGame = fs.readFileSync(path.join(root, "game.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.equal(BENCHMARK_SEED, "crownlands-map-phase-0-v1");
assert.equal(packageJson.scripts["benchmark:map"], "node tools/map-benchmark/run-map-benchmark.js");
assert.ok(!productionGame.includes("__CROWNLANDS_BENCHMARK__"), "Benchmark API leaked into production game.js.");
assert.ok(!productionGame.includes("Benchmark Ruler"), "Benchmark account leaked into production game.js.");

const expected = {
  A: [50, 25],
  B: [100, 50],
  C: [150, 100],
  D: [100, 0],
  E: [50, 100],
};
for (const [id, [cityCount, marchCount]] of Object.entries(expected)) {
  const first = createFixture(id);
  const second = createFixture(id);
  assert.deepEqual(first, second, `Scenario ${id} is not deterministic.`);
  assert.equal(SCENARIOS[id].cityCount, cityCount);
  assert.equal(SCENARIOS[id].marchCount, marchCount);
  assert.equal(first.scenario.cityCount, cityCount);
  assert.equal(first.scenario.marchCount, marchCount);
  assert.equal(first.primaryRegionId, "region_11");
  assert.equal(first.neighborRegionId, "region_6");
}

for (const file of ["early-instrumentation.js", "injected-runtime.js", "mock-firebase.js", "server.js"]) {
  const source = fs.readFileSync(path.join(root, "tools", "map-benchmark", file), "utf8");
  assert.ok(source.includes("127.0.0.1"), `${file} does not contain its loopback safety gate.`);
}

console.log("Map benchmark validation passed: deterministic scenarios, loopback gates, and production-source isolation verified.");
