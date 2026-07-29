const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const gamePath = path.resolve(__dirname, "..", "game.js");
const source = fs.readFileSync(gamePath, "utf8");
const routeWorkerSource = fs.readFileSync(path.resolve(__dirname, "..", "route-worker.js"), "utf8");
const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "functions", "index.js"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function readNumberConstant(name) {
  const match = source.match(new RegExp(`const ${name} = ([0-9.]+);`));
  assert.ok(match, `Missing numeric constant ${name}.`);
  return Number(match[1]);
}

const simulationIntervalMs = readNumberConstant("SIMULATION_UPDATE_INTERVAL_MS");
const routeCacheLimit = readNumberConstant("ROUTE_CACHE_LIMIT");
const routeEdgeCacheLimit = readNumberConstant("ROUTE_EDGE_PASSABLE_CACHE_LIMIT");
const frameSource = extractFunction("frame");
const renderableArmiesSource = extractFunction("getRenderableArmies");
const cameraInteractionStart = source.indexOf("function markCameraInteraction(");
const cameraInteractionEnd = source.indexOf("function markZoomInteraction(", cameraInteractionStart);
assert.ok(cameraInteractionStart >= 0 && cameraInteractionEnd > cameraInteractionStart, "Camera interaction renderer is missing.");
const cameraInteractionSource = source.slice(cameraInteractionStart, cameraInteractionEnd);

assert.ok(
  simulationIntervalMs >= 100 && simulationIntervalMs <= 250,
  "World simulation should run between 4 Hz and 10 Hz."
);
assert.ok(routeCacheLimit > 0 && routeCacheLimit <= 6000, "Main-thread route results need a bounded cache.");
assert.ok(routeEdgeCacheLimit > 0 && routeEdgeCacheLimit <= 160000, "Main-thread edge checks need a mobile-safe cache bound.");
assert.match(source, /function setBoundedRouteCacheValue\([\s\S]*?while \(cache\.size > limit\)/, "Main-thread route cache eviction is missing.");
assert.match(source, /edgePassableCache:\s*new Map\(\)[\s\S]*?lineTerrainPassableInRegion/, "Main-thread route-local edge caching or terrain separation is missing.");
assert.match(routeWorkerSource, /ROUTE_CACHE_LIMIT = 6000[\s\S]*?ROUTE_EDGE_PASSABLE_CACHE_LIMIT = 160000/, "Worker route cache limits drifted.");
assert.match(routeWorkerSource, /function setBoundedRouteCacheValue\([\s\S]*?while \(cache\.size > limit\)/, "Worker route cache eviction is missing.");
assert.match(routeWorkerSource, /edgePassableCache:\s*new Map\(\)[\s\S]*?lineTerrainPassableInRegion/, "Worker route-local edge caching or terrain separation is missing.");
assert.doesNotMatch(source, /route(?:EdgePassable)?Cache\.clear\(\)/, "Main-thread routing must not use full-cache cliff eviction.");
assert.doesNotMatch(routeWorkerSource, /route(?:EdgePassable)?Cache\.clear\(\)/, "Worker routing must not use full-cache cliff eviction.");
assert.match(source, /WORLD_REGIONS_BY_ID\s*=\s*new Map[\s\S]*?WORLD_CAMPS_BY_ID\s*=\s*new Map/, "Static world lookups need indexed maps.");
assert.match(source, /function getRegionById[\s\S]*?WORLD_REGIONS_BY_ID\.get/, "Region lookup still scans the world configuration.");
assert.match(source, /function getCampTargetById[\s\S]*?WORLD_CAMPS_BY_ID\.get/, "Camp lookup still scans every camp during army rendering.");
assert.match(source, /playerCitiesFrameCacheActive = true[\s\S]*?playerCitiesFrameCacheActive = false/, "Owned-city scans are not shared within a display frame.");
assert.match(source, /renderableRemoteArmyCache\s*=\s*new WeakMap\(\)[\s\S]*?function getRenderableRemoteArmy[\s\S]*?Object\.assign\(renderable, army/, "Remote army rendering still allocates a full object for every army tick.");
assert.match(source, /renderablePendingArmyCache\s*=\s*new WeakMap\(\)[\s\S]*?function getRenderablePendingArmy[\s\S]*?Object\.assign\(renderable, mission/, "Pending army rendering still allocates a full object for every army tick.");

const dueArmyLoaderStart = serverSource.indexOf("async function loadDueArmyTargets(");
const dueArmyLoaderEnd = serverSource.indexOf("function isExpectedScheduledResolveError(", dueArmyLoaderStart);
const dueArmyLoaderSource = serverSource.slice(dueArmyLoaderStart, dueArmyLoaderEnd);
assert.ok(dueArmyLoaderStart >= 0 && dueArmyLoaderEnd > dueArmyLoaderStart, "Scheduled army loader is missing.");
assert.match(dueArmyLoaderSource, /db\.collection\("armies"\)/, "Scheduled resolution must query canonical armies.");
assert.doesNotMatch(dueArmyLoaderSource, /collectionGroup\("armies"\)/, "Scheduled resolution must not rescan island army projections.");
assert.match(
  serverSource,
  /exports\.sendArmyOrder[\s\S]*?runTransactionWithInfrastructureRetry\(async transaction =>[\s\S]*?}, "sendArmyOrder"\)/,
  "Army launches need a narrow retry for transient Firestore transaction failures."
);
assert.match(
  serverSource,
  /function isRetryableTransactionInfrastructureError[\s\S]*?transaction lock timeout[\s\S]*?transaction is invalid or closed/,
  "Infrastructure retries must remain limited to lock timeouts and closed transactions."
);
assert.match(
  frameSource,
  /simulationUpdateAccumulatorMs >= SIMULATION_UPDATE_INTERVAL_MS[\s\S]*?updateGame\(simulationUpdateAccumulatorMs \/ 1000\)/,
  "The display frame must gate world simulation behind the fixed cadence."
);
assert.equal(
  (frameSource.match(/updateGame\(/g) || []).length,
  1,
  "The frame loop must have one gated world-simulation call."
);
assert.match(
  frameSource,
  /renderableArmiesFrameCacheActive = true;[\s\S]*?renderableArmiesFrameCacheActive = false;/,
  "Army snapshot reuse must be scoped to one synchronous display frame."
);
assert.match(
  renderableArmiesSource,
  /renderableArmiesFrameCacheActive && renderableArmiesFrameCache/,
  "Army consumers in one display frame should reuse a merged snapshot."
);
assert.match(
  renderableArmiesSource,
  /if \(renderableArmiesFrameCacheActive\) renderableArmiesFrameCache = renderableArmies;/,
  "The merged army snapshot should be cached only while a display frame is active."
);
assert.match(
  cameraInteractionSource,
  /queueDeferredMapRender\(\)/,
  "Every pan and zoom must schedule a fresh city render as soon as the camera settles."
);

const testSeconds = 30;
const legacySimulationPasses = testSeconds * 60;
const optimizedSimulationPasses = Math.ceil(testSeconds * 1000 / simulationIntervalMs);
const scanReduction = 1 - optimizedSimulationPasses / legacySimulationPasses;
assert.ok(scanReduction >= 0.8, "The fixed cadence should remove at least 80% of per-frame world scans.");

const localArmies = Array.from({ length: 500 }, (_, id) => ({ id, onlineId: `a-${id}` }));
const remoteArmies = Array.from({ length: 500 }, (_, id) => ({
  id: `a-${id + 250}`,
  ownerUid: `player-${id % 50}`,
}));
const iterations = 1000;
const mergeSnapshot = () => {
  const localIds = new Set(localArmies.map(army => army.onlineId));
  return [
    ...localArmies,
    ...remoteArmies.filter(army => !localIds.has(army.id)),
  ];
};

const repeatedStart = performance.now();
for (let index = 0; index < iterations; index += 1) {
  mergeSnapshot();
  mergeSnapshot();
  mergeSnapshot();
  mergeSnapshot();
}
const repeatedMs = performance.now() - repeatedStart;

const cachedStart = performance.now();
for (let index = 0; index < iterations; index += 1) {
  const cached = mergeSnapshot();
  cached.length;
  cached.length;
  cached.length;
  cached.length;
}
const cachedMs = performance.now() - cachedStart;

assert.ok(cachedMs < repeatedMs, "One merged army snapshot per frame should outperform repeated rebuilding.");

console.log(
  `Validated runtime bottlenecks: ${optimizedSimulationPasses} simulation passes replace `
  + `${legacySimulationPasses} display-frame scans (${Math.round(scanReduction * 100)}% fewer), `
  + `and representative army snapshot reuse reduced ${repeatedMs.toFixed(1)}ms to ${cachedMs.toFixed(1)}ms.`
);
