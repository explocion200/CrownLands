"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { performance } = require("node:perf_hooks");
const { createScoutRouteSearch, imagePointToWorld } = require("../functions/authoritative-route-planner");
const { selectClosestScoutOrigin, TOWERS } = require("../functions/holding-towers");
const { createTravelFixture, canonicalCity, layout } = require("./world-travel-test-fixtures");
const network = require("../functions/world-travel-network");

const plain = value => JSON.parse(JSON.stringify(value));
const summarize = rows => {
  const sorted = [...rows].sort((a, b) => a - b);
  return { samples: rows.length, p50: sorted[Math.ceil(rows.length * .5) - 1], p95: sorted[Math.ceil(rows.length * .95) - 1] };
};
const fixture = createTravelFixture(26);
const makePlanner = () => {
  const filename = require.resolve("../functions/authoritative-route-planner");
  const engineFile = require.resolve("../functions/canonical-route-engine");
  const engine = new Module(engineFile, module); engine.filename = engineFile; engine.paths = module.paths;
  engine._compile(fs.readFileSync(engineFile, "utf8"), engineFile);
  const implementation = new Module(filename, module); implementation.filename = filename; implementation.paths = module.paths;
  const originalRequire = implementation.require.bind(implementation);
  implementation.require = id => id === "./canonical-route-engine.js" ? engine.exports : originalRequire(id);
  implementation._compile(fs.readFileSync(filename, "utf8"), filename);
  return implementation.exports.createAuthoritativeRoutePlanner({ ...layout, maps: fixture.maps },
    { shortestTravelTime: true, getTerrainBlockers: () => [] });
};
const reference = makePlanner();
const current = makePlanner();
const target = canonicalCity(current, fixture.activeRegionIds[0], 12);
const regions = [target.regionId, ...fixture.maps.map(map => map.id).filter(id => id !== target.regionId)];
const origins = regions.flatMap(regionId => [0, 1].map(index => ({ ...canonicalCity(current, regionId, index), sourceType: "city", troops: 1 })));
const tower = TOWERS[0];
origins.push({ ...tower, ...imagePointToWorld(current.getModel(tower.regionId), { x: tower.reservedX, y: tower.reservedY }), sourceType: "tower", troops: 1 });
const select = (rows, search, onComplete) => selectClosestScoutOrigin(rows, target,
  (from, to, maximum) => search.calculate(from, to, maximum), { lowerBound: (from, to) => search.lowerBound(from, to), onComplete });
const evidence = { scope: "51-map canonical terrain, unchanged exhaustive search versus bounded selection; local CPU only, no production/network timings", cases: [] };
for (const count of [1, 25, 65, 101]) {
  const rows = origins.slice(0, count).reverse();
  const expected = selectClosestScoutOrigin(rows, target, (from, to) => reference.calculate(from, to));
  const search = createScoutRouteSearch(current);
  let operations;
  const actual = select(rows, search, result => { operations = result; });
  assert.deepEqual(plain(actual), plain(expected), `${count} origins changed source, ties, geometry, or distance`);
  assert.deepEqual(plain(select(rows, search)), plain(expected), "Transaction retry changed its winner");
  assert(search.snapshot().entries <= 128 && search.snapshot().points <= 32768);
  evidence.cases.push({ origins: count, ...operations, cache: search.snapshot() });
}

// Every bound must be conservative, including cross-map routes and Tower origins.
const bounded = createScoutRouteSearch(current);
for (const origin of origins) {
  const route = reference.calculate(origin, target);
  if (route) assert(bounded.lowerBound(origin, target) <= route.pathLength, `Overestimated ${origin.id}`);
}
const duplicate = { ...origins[0], id: "equal_tower", sourceType: "tower" };
const tied = [duplicate, { ...duplicate, id: "z", sourceType: "city" }, { ...duplicate, id: "a", sourceType: "city" }];
assert.equal(select(tied, createScoutRouteSearch(current)).id, "a", "City/Tower or lexical tie changed");
const invalid = [{ ...origins[0], troops: 0 }, { ...origins[0], regionId: "unreachable" }];
assert.equal(select(invalid, createScoutRouteSearch(current)), null);
const safeRoute = bounded.calculate(origins[0], target);
safeRoute.path[0].x = -100000;
assert.notEqual(bounded.calculate(origins[0], target).path[0].x, -100000, "Caller mutated memoized geometry");
const small = createScoutRouteSearch(current);
assert.equal(small.calculate(origins[0], target, 1), null);
assert(small.calculate(origins[0], target), "Bounded miss was incorrectly cached as unreachable");
let fakeCalls = 0;
const budgeted = createScoutRouteSearch({ calculate: source => {
  fakeCalls++;
  const points = Array.from({ length: source.large ? 17000 : 2 }, (_, x) => ({ x, y: 0 }));
  return { path: points, pathSegments: [{ points, length: 1 }], pathLength: 1 };
} });
for (let i = 0; i < 129; i++) budgeted.calculate({ ...origins[0], id: String(i) }, target);
assert.equal(budgeted.snapshot().entries, 128);
budgeted.calculate({ ...origins[0], id: "0" }, target);
assert.equal(fakeCalls, 130, "Old request geometry did not evict");
budgeted.calculate({ ...origins[0], id: "oversized", large: true }, target);
assert(budgeted.snapshot().points <= 32768 && budgeted.snapshot().entries <= 128);
const expanded = createTravelFixture(27);
const expandedSearch = createScoutRouteSearch(expanded.planner);
assert.deepEqual(expandedSearch.snapshot(), { entries: 0, points: 0 });
assert(expandedSearch.calculate(canonicalCity(expanded.planner, expanded.activeRegionIds.at(-1)), target), "Expansion reused stale topology");

// Disconnected and asymmetric graph bounds must not claim a nonexistent return.
const portals = {
  a: [{ id: "ab", x: 10, y: 0, targetRegionId: "b", targetPortalId: "ba" }],
  b: [{ id: "ba", x: 0, y: 0, targetRegionId: "a", targetPortalId: "ab" }],
  c: [],
};
const bound = network.createTargetDistanceBound(Object.keys(portals), id => portals[id], { regionId: "b", x: 10, y: 0 });
assert(bound({ regionId: "a", x: 0, y: 0 }) <= 20);
assert.equal(bound({ regionId: "c", x: 0, y: 0 }), Infinity);

const rows = origins.slice(0, 101).reverse();
const coldReference = makePlanner(), coldCurrent = makePlanner();
let coldStart = performance.now();
const coldExpected = selectClosestScoutOrigin(rows, target, (from, to) => coldReference.calculate(from, to));
const beforeColdMs = performance.now() - coldStart;
coldStart = performance.now();
assert.deepEqual(plain(select(rows, createScoutRouteSearch(coldCurrent))), plain(coldExpected));
evidence.firstUseMs = { before: beforeColdMs, after: performance.now() - coldStart };
// No local candidate: exact cross-map travel, rather than geometric proximity,
// still decides the winning origin and complete path.
const crossMapRows = origins.filter(origin => origin.regionId !== target.regionId);
assert.deepEqual(plain(select(crossMapRows, createScoutRouteSearch(current))),
  plain(selectClosestScoutOrigin(crossMapRows, target, (from, to) => reference.calculate(from, to))));
const detourOrigins = [
  { id: "near-but-obstructed", regionId: "r", sourceType: "city", troops: 1, lower: 1, actual: 100 },
  { id: "farther-tower", regionId: "r", sourceType: "tower", troops: 1, lower: 2, actual: 3 },
  { id: "unreachable", regionId: "r", troops: 1, lower: 0, actual: null },
];
assert.equal(selectClosestScoutOrigin(detourOrigins, {}, from => from.actual && { pathLength: from.actual },
  { lowerBound: from => from.lower }).id, "farther-tower");
const timings = { before: [], after: [] };
for (let sample = 0; sample < 5; sample += 1) {
  let start = performance.now();
  const expected = selectClosestScoutOrigin(rows, target, (from, to) => reference.calculate(from, to));
  timings.before.push(performance.now() - start);
  start = performance.now();
  const result = select(rows, createScoutRouteSearch(current));
  timings.after.push(performance.now() - start);
  assert.deepEqual(plain(result), plain(expected));
}
evidence.benchmark = { beforeMs: summarize(timings.before), afterMs: summarize(timings.after) };
evidence.benchmark.p95Reduction = 1 - evidence.benchmark.afterMs.p95 / evidence.benchmark.beforeMs.p95;
assert(evidence.benchmark.p95Reduction >= .5, "Large-origin route planning did not improve p95 by at least 50%");
const output = path.join(__dirname, "../release-artifacts/responsive-marches-and-scouts");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "routing.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
console.log("Validated exact scout-origin pruning, ties, retries, bounded geometry caches, topology changes, and >=50% route-planning p95 improvement.");
