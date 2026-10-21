"use strict";
const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const { createAuthoritativeRoutePlanner, imagePointToWorld } = require("../functions/authoritative-route-planner");
const { getAuthoritativeTerrainBlockers } = require("../functions/authoritative-route-policy");
const { isRegionWalkablePoint } = require("../functions/canonical-route-engine");
const { isClear, minimumEnemySeparation, spawnLevelRange, placementBounds, roadPlacementPoints } = require("../functions/marauder-population"), M = require("../functions/marauder-rules");
const { createTravelFixture, extractFunction } = require("./world-travel-test-fixtures");
const catalog = require("../functions/core-expansion-region-catalog.json");
const layout = require("../functions/core-expansion-world-layout.json");
const roadData = require("../functions/marauder-road-points.json");
const source = fs.readFileSync(require.resolve("../functions/index.js"), "utf8");

function createPlacementFixture(travel = null) {
  const planner = travel?.planner || createAuthoritativeRoutePlanner(layout, { getTerrainBlockers: getAuthoritativeTerrainBlockers });
  const context = vm.createContext({
    getServerCatalogRegion: id => travel ? travel.scope.getServerCatalogRegion(id) : catalog.regions.find(row => row.id === id),
    getAuthoritativeIslandSeed: id => {
      const model = planner.getModel(id), map = model.map;
      const seed = row => { const point = imagePointToWorld(model, row);
        return { ...row, x: Math.round(point.x), y: Math.round(point.y), regionId: id }; };
      return { cities: map.cities.map(seed), camps: (map.camps || []).map(seed) };
    },
    MARAUDER_SEASONAL_CLEARANCE: require("../functions/marauder-seasonal-clearance.json"), MARAUDER_ROAD_POINTS: roadData,
    HOLDING_TOWERS: require("../functions/holding-towers"),
    serverImagePointToWorld: (id, point) => imagePointToWorld(planner.getModel(id), point),
    getAuthoritativeRoutePlannerForRegions: () => planner,
    getServerMapBounds: id => planner.getModel(id).bounds, isRegionWalkablePoint,
    buildCurrentServerGeneratedArmyRoute: (from, to) => planner.calculate(from, to),
  });
  vm.runInContext(extractFunction(source, "getMarauderPlacementLayout"), context);
  return { planner, context, geometry: id => context.getMarauderPlacementLayout(id) };
}

function samplePopulation(fixture, region) {
  const geometry = fixture.geometry(region.id), enemies = [], slots = M.slots(region), roads = roadPlacementPoints(geometry);
  assert(roads.length, `${region.id} needs painted roads inside its inset`);
  assert(geometry.rectangles.every(rect => Object.values(rect).every(Number.isFinite)));
  let seed = 0x18292f;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const slot of slots) {
    // Exercise the actual bounded search and clearances. A blocked slot is
    // allowed to stay empty; never substitute an off-road point to fill it.
    const attempts = slot.classification === "boss" ? 512 : 48;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const candidate = { ...roads[Math.floor(random() * roads.length)], regionId: region.id,
        classification: slot.classification, slot: slot.slot };
      if (!isClear(candidate, { ...geometry, enemies }) || !geometry.accessible(candidate)) continue;
      enemies.push(candidate); break;
    }
  }
  assert(enemies.length <= slots.length);
  for (const point of enemies) {
    assert.equal(point.classification === "boss", region.permanentCore);
    assert(isClear(point, { ...geometry, enemies: enemies.filter(other => other !== point) }));
    assert(geometry.accessible(point));
    assert(roads.some(road => road.x === point.x && road.y === point.y));
  }
  return { region: region.id, classification: region.permanentCore ? "boss" : "solo", count: enemies.length,
    blocked: slots.length - enemies.length, enemies };
}

function validateRoadSurface() {
  const proof = require("./map-art/clearance.json"), receipt = require("../assets/worlds/core-expansion-v1/illustrated-art-receipt.json");
  assert.equal(roadData.sourceSha256, crypto.createHash("sha256").update(JSON.stringify(proof)).digest("hex"));
  assert.deepEqual(Object.keys(roadData.templates).sort(), catalog.regions.map(row => row.id).sort());
  let count = 0;
  for (const map of proof.maps) {
    assert.equal(roadData.roadGeometryHashes[map.id], receipt.maps.find(row => row.id === map.id).roadGeometrySha256);
    // Independently prove every generated point lies within an original
    // painted-road sample's half-width, including bends and disconnected roads.
    const grid = new Map(), cellSize = 32;
    for (const [x, y, width] of map.roads.flat()) {
      assert(width > 0 && width < cellSize * 2);
      const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ x, y, radius: width / 2 });
    }
    for (const [x, y] of roadData.templates[map.id]) {
      const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
      let onRoad = false;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if ((grid.get(`${cx + dx},${cy + dy}`) || []).some(point => Math.hypot(point.x - x, point.y - y) <= point.radius)) onRoad = true;
      }
      assert(onRoad, `${map.id}: ${x},${y} leaves the approved road surface`); count++;
    }
  }
  return count;
}

function main() {
  for (const generator of ["./generate-marauder-clearance", "./generate-marauder-roads"]) {
    require("node:child_process").execFileSync(process.execPath, [require.resolve(generator), "--check"], { stdio: "pipe" });
  }
  const roadCount = validateRoadSurface();
  const plain = { bounds: { left: 100, top: 200, right: 1100, bottom: 1000 }, walkable: () => true };
  assert.deepEqual(placementBounds(plain.bounds), { left: 300, top: 360, right: 900, bottom: 840 });
  for (const point of [{ x: 299, y: 600 }, { x: 901, y: 600 }, { x: 600, y: 359 }, { x: 600, y: 841 }]) {
    assert.equal(isClear(point, plain), false, "All four map edges are excluded");
  }
  assert(isClear({ x: 300, y: 360 }, plain));
  assert.equal(placementBounds({ left: 0, top: 0, right: 100, bottom: 100 }), null);
  assert.equal(placementBounds({ left: 0, top: 0, right: Infinity, bottom: 1000 }), null);
  assert.equal(minimumEnemySeparation(plain.bounds), 200);
  assert.equal(isClear({ x: 500, y: 500 }, { ...plain, enemies: [{ x: 699, y: 500 }] }), false);
  assert.equal(isClear({ x: 500, y: 500 }, { ...plain, enemies: [{ x: 700, y: 500 }] }), true);
  const [beginner, varied] = M.slots({ permanentCore: false });
  assert.deepEqual(spawnLevelRange(beginner, { level: 5 }, true), { min: 1, max: 10 });
  assert.deepEqual(spawnLevelRange(varied, null, false), { min: 11, max: 39 });
  assert.deepEqual(spawnLevelRange(varied, null, true), { min: 40, max: 79 });
  for (const level of [11, 20, 39]) assert.deepEqual(spawnLevelRange(varied, { level }), { min: 40, max: 79 });
  for (const level of [40, 60, 79]) assert.deepEqual(spawnLevelRange(varied, { level }), { min: 11, max: 39 });
  assert.deepEqual(roadPlacementPoints(plain), [], "Missing roads fail closed on otherwise walkable ground");
  const invalid = { ...plain, roadPoints: [{ x: NaN, y: 500 }, { x: 200, y: 500 }, { x: 500, y: 500 }] };
  assert.deepEqual(roadPlacementPoints(invalid), [{ x: 500, y: 500 }]);
  const fixture = createPlacementFixture(), results = catalog.regions.map(region => samplePopulation(fixture, region));
  assert.equal(results.length, 81);
  assert.equal(results.filter(row => row.classification === "boss").length, 25);
  assert.equal(results.filter(row => row.classification === "solo").length, 56);
  assert(results.some(row => row.classification === "boss" && row.count > 0));
  assert(results.some(row => row.classification === "solo" && row.count > 0));
  assert.equal(results.find(row => row.region === "core-v2-north-east-holding-tower-p1-m1").count, 0,
    "The crowded Core map retains spacing rather than falling back to grass");
  const travel = createTravelFixture(121), futureFixture = createPlacementFixture(travel);
  const futureRegions = travel.descriptors.filter(row => !catalog.regions.some(current => current.id === row.id));
  assert(futureRegions.length > 0);
  for (const region of futureRegions) {
    assert.equal(region.permanentCore, false);
    assert(M.slots({ ...region, spawnEligible: false }).every(slot => slot.classification === "solo"));
    const geometry = futureFixture.geometry(region.id), template = roadData.templates[region.templateRegionId];
    assert(template?.length > 0, `${region.id} needs its authoritative prepared road template`);
    assert.deepEqual(JSON.parse(JSON.stringify(geometry.roadPoints)), template.map(([x, y]) => imagePointToWorld(travel.planner.getModel(region.id), { x, y })),
      "Generated New Lands transform template roads into their own world coordinates");
  }
  const futurePopulation = samplePopulation(futureFixture, { ...futureRegions[0], spawnEligible: false });
  assert(futurePopulation.count > 0 && futurePopulation.count <= 2);
  const partial = results.filter(row => row.blocked > 0), blocked = results.reduce((sum, row) => sum + row.blocked, 0);
  console.log(`Validated ${roadCount} painted-road points, all 81 prepared maps and ${futureRegions.length} generated New Lands templates. Bounded probe leaves ${blocked} slots empty across ${partial.length} maps; every placed NPC retains the 20% inset, existing clearance and reachable routes. Counts are availability samples, not guarantees.`);
}
module.exports = { createPlacementFixture, samplePopulation };
if (require.main === module) main();
