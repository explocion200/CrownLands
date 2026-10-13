"use strict";
const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict");
const { createAuthoritativeRoutePlanner, imagePointToWorld } = require("../functions/authoritative-route-planner");
const { getAuthoritativeTerrainBlockers } = require("../functions/authoritative-route-policy");
const { isRegionWalkablePoint } = require("../functions/canonical-route-engine");
const { isClear } = require("../functions/marauder-population"), M = require("../functions/marauder-rules");
require("node:child_process").execFileSync(process.execPath, [require.resolve("./generate-marauder-clearance"), "--check"], { stdio: "pipe" });
const catalog = require("../functions/core-expansion-region-catalog.json");
const layout = require("../functions/core-expansion-world-layout.json");
const planner = createAuthoritativeRoutePlanner(layout, { getTerrainBlockers: getAuthoritativeTerrainBlockers });
const source = fs.readFileSync(require.resolve("../functions/index.js"), "utf8");
const start = source.indexOf("function getMarauderPlacementLayout("), end = source.indexOf("\nfunction ", start + 10);
const context = vm.createContext({
  getServerCatalogRegion: id => catalog.regions.find(row => row.id === id),
  getAuthoritativeIslandSeed: id => {
    const map = layout.maps.find(row => row.id === id), model = planner.getModel(id);
    return { cities: map.cities.map(row => ({ ...row, ...imagePointToWorld(model, row), regionId: id })),
      camps: (map.camps || []).map(row => ({ ...row, ...imagePointToWorld(model, row), regionId: id })) };
  },
  MARAUDER_SEASONAL_CLEARANCE: require("../functions/marauder-seasonal-clearance.json"),
  HOLDING_TOWERS: require("../functions/holding-towers"),
  serverImagePointToWorld: (id, point) => imagePointToWorld(planner.getModel(id), point),
  getAuthoritativeRoutePlannerForRegions: () => planner,
  getServerMapBounds: id => planner.getModel(id).bounds, isRegionWalkablePoint,
  buildServerGeneratedArmyRoute: (from, to) => planner.calculate(from, to),
});
vm.runInContext(source.slice(start, end), context);
let seed = 0x18292f;
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const results = [];
for (const region of catalog.regions) {
  const geometry = context.getMarauderPlacementLayout(region.id), enemies = [];
  assert(geometry.rectangles.every(rect => Object.values(rect).every(Number.isFinite)));
  for (const slot of M.slots(region)) {
    let point = null;
    // The live population retries bounded batches; prove that each actual map
    // has capacity while exercising the same clearance and route predicates.
    for (let attempt = 0; attempt < 2000; attempt++) {
      const candidate = { regionId: region.id,
        x: geometry.bounds.left + 100 + random() * (geometry.bounds.width - 200),
        y: geometry.bounds.top + 100 + random() * (geometry.bounds.height - 200) };
      if (isClear(candidate, { ...geometry, enemies }) && geometry.accessible(candidate)) { point = candidate; break; }
    }
    assert(point, `${region.id} cannot place slot ${slot.slot} on real terrain/routes`);
    enemies.push(point);
  }
  results.push({ region: region.id, count: enemies.length });
}
assert.equal(results.length, 81);
console.log(`All ${results.length} current Core/New Lands layouts fit their NPC slots with real terrain, scenery, seasonal art, structures, objective clearance and reachable routes.`);
