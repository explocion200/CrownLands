"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { BENCHMARK_SEED, SCENARIOS, createFixture } = require("./map-benchmark/fixtures.js");
const { createMapBenchmarkServer } = require("./map-benchmark/server.js");

const root = path.resolve(__dirname, "..");
const productionGame = fs.readFileSync(path.join(root, "game.js"), "utf8");
const benchmarkEarlySource = fs.readFileSync(path.join(root, "tools", "map-benchmark", "early-instrumentation.js"), "utf8");
const benchmarkMockSource = fs.readFileSync(path.join(root, "tools", "map-benchmark", "mock-firebase.js"), "utf8");
const benchmarkRuntimeSource = fs.readFileSync(path.join(root, "tools", "map-benchmark", "injected-runtime.js"), "utf8");
const pickupQaSource = fs.readFileSync(path.join(root, "tools", "map-benchmark", "pickup-qa-runtime.js"), "utf8");
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
  const mapIds = first.mapData.maps.map(map => map.id);
  assert.deepEqual(Object.keys(first.citiesByRegion).sort(), [...mapIds].sort(), `Scenario ${id} does not expose city fixtures for every map.`);
  assert.deepEqual(Object.keys(first.campsByRegion).sort(), [...mapIds].sort(), `Scenario ${id} does not expose camp fixtures for every map.`);
}

for (const file of ["early-instrumentation.js", "injected-runtime.js", "mock-firebase.js", "pickup-qa-runtime.js", "server.js"]) {
  const source = fs.readFileSync(path.join(root, "tools", "map-benchmark", file), "utf8");
  assert.ok(source.includes("127.0.0.1"), `${file} does not contain its loopback safety gate.`);
}
assert.match(pickupQaSource, /query\.get\("pickupQa"\) !== "true"/, "Pickup QA must require its explicit development query flag.");
assert.match(pickupQaSource, /runAllMaps/, "Pickup QA must retain its all-map sweep.");
assert.match(pickupQaSource, /runLifecycleChecks/, "Pickup QA must retain timer, legacy, expiry, duplicate, and relocation coverage.");
assert.match(benchmarkRuntimeSource, /getPickupSoakState/, "The loopback benchmark must expose pickup soak diagnostics.");
assert.match(benchmarkRuntimeSource, /preparePickupSoak/, "The loopback benchmark must expose a fresh pickup timer setup.");
assert.match(benchmarkRuntimeSource, /advancePickupSoakTimer/, "The loopback benchmark must expose a deterministic pickup timer advance.");
assert.match(benchmarkRuntimeSource, /dataset\.pickupSoakState/, "Pickup soak diagnostics must be observable without changing gameplay camera state.");
assert.match(benchmarkRuntimeSource, /pickupSoakDelay/, "The loopback benchmark must support a query-gated ordinary-play pickup setup.");
assert.match(benchmarkRuntimeSource, /rawPickupSoakDelay === null \? Number\.NaN/, "A missing soak delay must not reset pickup state during refresh testing.");
assert.match(benchmarkRuntimeSource, /pickupSoakRegion/, "The loopback benchmark must support pickup relocation checks without focusing the pickup camera.");
assert.match(benchmarkRuntimeSource, /centerFraction/, "Pickup soak diagnostics must report center bias without moving the camera.");
assert.match(benchmarkMockSource, /benchmarkProfileStorageKey/, "The loopback Firebase mock must preserve pickup state across same-tab reloads for soak testing.");
assert.match(benchmarkMockSource, /loadGameSnapshot:\s*async \(\) => readStoredProfile\(\)/, "The loopback Firebase mock must restore its saved gameplay snapshot after a reload.");
assert.match(benchmarkMockSource, /storedProfile:\s*readStoredProfile\(\)/, "Pickup soak diagnostics must report the profile persisted by the loopback Firebase mock.");
assert.match(benchmarkEarlySource, /pickupSoakClock/, "The loopback benchmark must support a reload-stable clock for pickup soak testing.");
assert.ok(!productionGame.includes("pickup-qa-panel"), "Pickup QA controls leaked into production game.js.");
assert.ok(!productionGame.includes("getPickupSoakState"), "Pickup soak diagnostics leaked into production game.js.");

function createBenchmarkMockSandbox(fixture, hostname = "127.0.0.1") {
  let networkRequests = 0;
  const sandbox = {
    location: { hostname },
    queueMicrotask,
    window: { __CROWNLANDS_BENCHMARK_BOOTSTRAP__: fixture },
    fetch: async () => {
      networkRequests += 1;
      throw new Error("The benchmark Firebase mock attempted a network request.");
    },
  };
  vm.createContext(sandbox);
  return {
    sandbox,
    getNetworkRequestCount: () => networkRequests,
  };
}

async function validateMainCityRecoveryMock() {
  const fixture = createFixture("A");
  const expectedMainCity = fixture.citiesByRegion[fixture.primaryRegionId]
    .find(city => city.ownerUid === fixture.player.uid && city.isMainCity === true);
  assert.ok(expectedMainCity?.id, "Scenario A is missing its player-owned main city.");

  const loopback = createBenchmarkMockSandbox(fixture);
  vm.runInContext(benchmarkMockSource, loopback.sandbox, { filename: "mock-firebase.js" });
  const response = await loopback.sandbox.window.CrownlandsOnline.repairMainCityAssignment();
  const expectedIslandId = `${fixture.releaseConfig.worldId}-${fixture.primaryRegionId}`;

  assert.equal(response.ok, true, "Benchmark main-city recovery did not report success.");
  assert.equal(response.repairedMainCity, false, "Benchmark main-city recovery unexpectedly reported a repair.");
  assert.equal(response.requiresStartingCityClaim, false, "Benchmark main-city recovery requested a fresh starting city.");
  assert.equal(response.mainCityRecoveryStatus, "valid", "Benchmark main-city recovery returned an invalid status.");
  assert.equal(response.currentUser?.mainCityId, expectedMainCity.id, "Benchmark recovery returned the wrong main city.");
  assert.equal(response.currentUser?.mainRegionId, fixture.primaryRegionId, "Benchmark recovery returned the wrong region.");
  assert.equal(response.currentUser?.mainIslandId, expectedIslandId, "Benchmark recovery returned a mismatched island.");
  assert.equal(loopback.getNetworkRequestCount(), 0, "Benchmark main-city recovery contacted a network endpoint.");

  const nonLoopback = createBenchmarkMockSandbox(fixture, "playcrownlands.com");
  assert.throws(
    () => vm.runInContext(benchmarkMockSource, nonLoopback.sandbox, { filename: "mock-firebase.js" }),
    /loopback-only/i,
    "The benchmark Firebase adapter ran outside loopback."
  );
}

async function validateBenchmarkServerAssetBase() {
  const server = createMapBenchmarkServer();
  const address = await server.listen(0);
  try {
    const response = await fetch(`${address.url}/__benchmark__/?scenario=A`);
    assert.equal(response.status, 200, "The benchmark page was not served from its documented route.");
    const source = await response.text();
    assert.match(
      source,
      /<base id="crownlandsBase" href="\/" \/>/,
      "The benchmark page did not resolve production assets from the loopback root."
    );
    const gameResponse = await fetch(`${address.url}/__benchmark__/game.js?scenario=A&pickupQa=true`);
    assert.equal(gameResponse.status, 200, "The benchmark game bundle was not served.");
    assert.match(await gameResponse.text(), /installCrownlandsPickupQaRuntime/, "The loopback bundle did not include pickup QA diagnostics.");
  } finally {
    await server.close();
  }
}

Promise.all([
  validateMainCityRecoveryMock(),
  validateBenchmarkServerAssetBase(),
])
  .then(() => console.log("Map benchmark validation passed: deterministic scenarios, loopback gates, recovery contract, and production-source isolation verified."))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
