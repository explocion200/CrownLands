"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const topology = require("../functions/coreExpansionTopology.js");
const worldLayout = require("../functions/core-expansion-world-layout.json");
const {
  createAuthoritativeRoutePlanner,
  imagePointToWorld,
} = require("../functions/authoritative-route-planner.js");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const catalog = require("../functions/core-expansion-region-catalog.json");
const FIRST_LAYER_ORDINALS = Array.from({ length: topology.FIRST_LAYER_MAP_COUNT }, (_, index) => index);
const firstLayerRegionIds = FIRST_LAYER_ORDINALS.map(index => topology.getRegionAtActivationOrdinal(index).id);
const firstLayerRegionIdSet = new Set(firstLayerRegionIds);
const activeMapIds = new Set([
  ...catalog.regions.filter(region => region.permanentCore === true).map(region => region.id),
  ...firstLayerRegionIds,
]);
const activeMaps = worldLayout.maps.filter(map => activeMapIds.has(map.id));
const activeCatalogRegions = catalog.regions.filter(region => activeMapIds.has(region.id));

assert.equal(activeMaps.length, 49, "The complete Layer 1 world must contain 25 Core maps plus 24 first-ring maps.");
assert.equal(activeCatalogRegions.length, 49, "The loading catalog does not register every complete Layer 1 map.");
assert.equal(new Set(activeMaps.map(map => map.id)).size, 49, "The complete Layer 1 world contains duplicate map IDs.");
assert.equal(new Set(activeCatalogRegions.map(region => `${region.gridX},${region.gridY}`)).size, 49,
  "The complete Layer 1 world contains duplicate map coordinates.");
assert.deepEqual(
  activeCatalogRegions.filter(region => region.worldLayer === 1).map(region => region.id),
  firstLayerRegionIds,
  "Layer 1 is not registered in authoritative clockwise activation order.",
);

for (const region of activeCatalogRegions) {
  assert.equal(region.lifecycle, "active", `${region.id} is excluded from the production-active manifest.`);
  assert(fs.existsSync(path.join(root, region.mapAsset)), `${region.id} is missing its map asset.`);
  assert(fs.existsSync(path.join(root, region.thumbnailAsset)), `${region.id} is missing its thumbnail asset.`);
  assert(fs.existsSync(path.join(root, region.regionDefinitionPath)), `${region.id} is missing its region definition.`);
  for (const [side, connection] of Object.entries(region.connections || {})) {
    if (connection.state !== "open" || !activeMapIds.has(connection.targetRegionId)) continue;
    const neighbor = activeCatalogRegions.find(candidate => candidate.id === connection.targetRegionId);
    assert(neighbor, `${region.id}.${side} targets missing active map ${connection.targetRegionId}.`);
    const reciprocal = neighbor.connections?.[connection.oppositeSide];
    assert.equal(reciprocal?.state, "open", `${region.id}.${side} has a broken return entrance.`);
    assert.equal(reciprocal?.targetRegionId, region.id, `${region.id}.${side} returns to the wrong map.`);
  }
}

const planner = createAuthoritativeRoutePlanner({ ...worldLayout, maps: activeMaps, mapCount: activeMaps.length });
let directedPairCount = 0;
let longest = null;
for (const sourceRegionId of activeMapIds) {
  for (const targetRegionId of activeMapIds) {
    if (sourceRegionId === targetRegionId) continue;
    const chain = planner.findRegionChain(sourceRegionId, targetRegionId);
    assert(chain?.length, `${sourceRegionId} cannot reach ${targetRegionId}.`);
    assert.equal(chain[0], sourceRegionId, "A route chain starts on the wrong map.");
    assert.equal(chain.at(-1), targetRegionId, "A route chain ends on the wrong map.");
    directedPairCount += 1;
    if (!longest || chain.length > longest.chain.length) longest = { sourceRegionId, targetRegionId, chain };
  }
}
assert.equal(directedPairCount, 49 * 48, "All-map connectivity did not cover every directed pair.");
assert(longest?.chain.length >= 7, "The longest complete Layer 1 route did not cross multiple maps.");

function canonicalCity(regionId, index = 0) {
  const model = planner.getModel(regionId);
  const city = model?.map?.cities?.[index];
  assert(model && city, `${regionId} has no canonical city route endpoint.`);
  return { id: city.id, regionId, ...imagePointToWorld(model, city) };
}

function validateRoute(sourceRegionId, targetRegionId, label) {
  const route = planner.calculate(canonicalCity(sourceRegionId), canonicalCity(targetRegionId));
  assert(route, `${label} did not produce a canonical route.`);
  assert.equal(route.routeRegionIds[0], sourceRegionId, `${label} starts in the wrong region.`);
  assert.equal(route.routeRegionIds.at(-1), targetRegionId, `${label} ends in the wrong region.`);
  assert(route.pathLength > 0 && Number.isFinite(route.pathLength), `${label} has an invalid path length.`);
  return route;
}

const adjacentForward = validateRoute("new-lands-l01-p001", "new-lands-l01-p002", "adjacent forward route");
const adjacentReverse = validateRoute("new-lands-l01-p002", "new-lands-l01-p001", "adjacent reverse route");
const multiMapForward = validateRoute("new-lands-l01-p001", "new-lands-l01-p013", "multi-map forward route");
const multiMapReverse = validateRoute("new-lands-l01-p013", "new-lands-l01-p001", "multi-map reverse route");
const longestForward = validateRoute(longest.sourceRegionId, longest.targetRegionId, "longest forward route");
const longestReverse = validateRoute(longest.targetRegionId, longest.sourceRegionId, "longest reverse route");
assert(adjacentForward.routeRegionIds.length === 2 && adjacentReverse.routeRegionIds.length === 2,
  "Adjacent Layer 1 travel used an unexpected map chain.");
assert(multiMapForward.routeRegionIds.length > 2 && multiMapReverse.routeRegionIds.length > 2,
  "Multi-map travel did not cross an intermediate region in both directions.");
assert.equal(longestForward.routeRegionIds.length, longest.chain.length, "The longest route skipped a graph leg.");
assert.equal(longestReverse.routeRegionIds.length, longest.chain.length, "The reverse longest route skipped a graph leg.");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}.`);
}

const travelConstants = {
  ARMY_TRAVEL_SECONDS_PER_MAP_UNIT: 0.13,
  ARMY_TRAVEL_MIN_SECONDS: 30,
  ARMY_TRAVEL_SCOUT_MIN_SECONDS: 10,
  ARMY_TRAVEL_KIND_MULTIPLIERS: { scout: 0.35, transfer: 0.95, reinforce: 0.95, rally_join: 0.95, attack: 1 },
  ARMY_TRAVEL_TROOP_BAND_LIMITS: [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000],
  ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS: [1, 1.18, 1.38, 1.62, 1.9, 2.24, 2.62, 3.06, 3.5],
  Math,
  Number,
};
const commonTravelFunctions = ["getTroopTravelBandIndex", "getTroopTravelMultiplier"];
const serverTravelContext = {
  ...travelConstants,
  safeNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  },
  normalizeDemoAttackSnapshot() { return null; },
};
vm.createContext(serverTravelContext);
vm.runInContext([
  ...commonTravelFunctions.map(name => extractFunction(serverSource, name)),
  extractFunction(serverSource, "calculateTravelTime"),
].join("\n"), serverTravelContext);

const clientTravelContext = {
  ...travelConstants,
  getCommonGearBonuses: () => ({ scoutSpeed: 0, enemyMarchSpeed: 0, ownedMarchSpeed: 0 }),
  skillMultiplier: () => 1,
  getStrongholdMarchSpeedMultiplier: () => 1,
  normalizeDemoAttackSnapshot: () => null,
};
vm.createContext(clientTravelContext);
vm.runInContext([
  ...commonTravelFunctions.map(name => extractFunction(clientSource, name)),
  extractFunction(clientSource, "getTravelSpeedMultiplier"),
  extractFunction(clientSource, "travelTime"),
].join("\n"), clientTravelContext);

assert.doesNotMatch(serverSource, /ARMY_TRAVEL_MAX_SECONDS/, "The backend still contains a maximum travel-time cap.");
assert.doesNotMatch(clientSource, /ARMY_TRAVEL_MAX_SECONDS/, "The UI still contains a maximum travel-time cap.");
const troopCount = 100_000_000;
const serverLongestSeconds = serverTravelContext.calculateTravelTime({
  pathLength: longestForward.pathLength,
  troopCount,
  kind: "attack",
  speedMultiplier: 1,
});
const clientLongestSeconds = clientTravelContext.travelTime(
  canonicalCity(longest.sourceRegionId),
  canonicalCity(longest.targetRegionId),
  "player",
  longestForward.pathLength,
  troopCount,
  "attack",
);
assert(serverLongestSeconds > 1800, "A route formerly capped at 30 minutes did not retain its longer calculated duration.");
assert.equal(clientLongestSeconds, serverLongestSeconds, "The UI ETA differs from the server duration.");
const shortSeconds = serverTravelContext.calculateTravelTime({
  pathLength: adjacentForward.pathLength,
  troopCount,
  kind: "attack",
  speedMultiplier: 1,
});
assert(serverLongestSeconds >= shortSeconds, "A longer route produced a shorter duration under identical modifiers.");
assert.equal(
  serverTravelContext.calculateTravelTime({
    pathLength: longestForward.pathLength,
    troopCount,
    kind: "attack",
    speedMultiplier: 1,
    requestedTotal: 1,
  }),
  serverLongestSeconds,
  "A manipulated client duration bypassed the server-calculated travel time.",
);
const launchedAtMs = Date.parse("2026-09-04T12:00:00.000Z");
const arrivesAtMs = launchedAtMs + Math.ceil(serverLongestSeconds * 1000);
assert(Number.isSafeInteger(arrivesAtMs), "The longest Layer 1 arrival timestamp overflowed safe integer precision.");
assert(arrivesAtMs > launchedAtMs, "The longest Layer 1 arrival timestamp became negative or non-increasing.");
assert.equal(arrivesAtMs, launchedAtMs + Math.ceil(clientLongestSeconds * 1000),
  "The UI ETA and server arrival timestamp disagree.");

assert(firstLayerRegionIds.every(regionId => firstLayerRegionIdSet.has(regionId)));
console.log(
  `Validated complete Layer 1: 49 maps, ${directedPairCount} directed graph pairs, `
  + `bidirectional adjacent/multi-map/longest canonical routes, and uncapped ${Math.round(serverLongestSeconds)}s ETA parity.`,
);
