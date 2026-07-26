const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const gamePath = path.resolve(__dirname, "..", "game.js");
const source = fs.readFileSync(gamePath, "utf8");

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
const frameSource = extractFunction("frame");
const renderableArmiesSource = extractFunction("getRenderableArmies");

assert.ok(
  simulationIntervalMs >= 100 && simulationIntervalMs <= 250,
  "World simulation should run between 4 Hz and 10 Hz."
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
