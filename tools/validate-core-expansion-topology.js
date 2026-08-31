"use strict";

const assert = require("node:assert/strict");
const topology = require("../functions/coreExpansionTopology.js");

assert.equal(topology.CORE_MAP_COUNT, 25);
assert.equal(topology.FIRST_LAYER_MAP_COUNT, 24);
assert.equal(topology.NEW_LANDS_CITY_CAPACITY, 40);
assert.equal(topology.EXPANSION_THRESHOLD_NPC_CITIES, 20);
assert.equal(topology.EXPANSION_ACTIVATION_BATCH_SIZE, 2);
assert.equal(Object.keys(topology.PREPARED_CORE_REGION_NAMES).length, 25);
assert.equal(new Set(Object.values(topology.PREPARED_CORE_REGION_NAMES)).size, 25);

const firstLayer = topology.getClockwiseLayerCoordinates(1);
assert.equal(firstLayer.length, 24);
assert.deepEqual(firstLayer[0], { gridX: 0, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 0 });
assert.deepEqual(firstLayer[3], { gridX: 3, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 3 });
assert.deepEqual(firstLayer[9], { gridX: 3, gridY: 3, worldLayer: 1, clockwiseOrderIndex: 9 });
assert.deepEqual(firstLayer[15], { gridX: -3, gridY: 3, worldLayer: 1, clockwiseOrderIndex: 15 });
assert.deepEqual(firstLayer[21], { gridX: -3, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 21 });
assert.deepEqual(firstLayer[23], { gridX: -1, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 23 });
assert.equal(new Set(firstLayer.map(point => `${point.gridX},${point.gridY}`)).size, 24);

const secondLayer = topology.getClockwiseLayerCoordinates(2);
assert.equal(secondLayer.length, 32);
assert.deepEqual(secondLayer[0], { gridX: 0, gridY: -4, worldLayer: 2, clockwiseOrderIndex: 0 });
for (const layer of [1, 2, 3, 10]) {
  const first = topology.getClockwiseLayerCoordinates(layer)[0];
  const radius = topology.CORE_RADIUS + layer;
  assert.deepEqual(first, { gridX: 0, gridY: -radius, worldLayer: layer, clockwiseOrderIndex: 0 });
  assert.deepEqual(
    { gridX: first.gridX, gridY: first.gridY + 1 },
    { gridX: 0, gridY: -(radius - 1) },
    `Layer ${layer} must begin at a cardinal map with a south road into the inner layer.`,
  );
}
assert.equal(topology.PREPARED_NEW_LANDS_REGION_NAMES.length, 56);
assert.equal(new Set(topology.PREPARED_NEW_LANDS_REGION_NAMES).size, 56);
assert(topology.PREPARED_NEW_LANDS_REGION_NAMES.every(name => !/^New Lands \d+$/i.test(name)));
assert.equal(new Set([
  ...Object.values(topology.PREPARED_CORE_REGION_NAMES),
  ...topology.PREPARED_NEW_LANDS_REGION_NAMES,
]).size, 81);
assert.equal(topology.getRegionAtActivationOrdinal(23).worldLayer, 1);
assert.equal(topology.getRegionAtActivationOrdinal(24).worldLayer, 2);
assert.equal(topology.getRegionAtActivationOrdinal(24).clockwiseOrderIndex, 0);

const generation = "realm-2026-09";
const initial = topology.createInitialExpansionState(generation);
assert.deepEqual(initial.activeRegionIds, ["new-lands-l01-p001"]);
assert.equal(initial.nextActivationOrdinal, 1);

const belowThreshold = topology.planThresholdActivation({
  state: initial,
  resetGeneration: generation,
  sourceRegionId: "new-lands-l01-p001",
  remainingNpcCities: 21,
});
assert.equal(belowThreshold.changed, false);
assert.equal(belowThreshold.reason, "threshold-not-reached");

const firstActivation = topology.planThresholdActivation({
  state: initial,
  resetGeneration: generation,
  sourceRegionId: "new-lands-l01-p001",
  remainingNpcCities: 20,
});
assert.equal(firstActivation.changed, true);
assert.deepEqual(firstActivation.activatedRegions.map(region => region.id), [
  "new-lands-l01-p002",
  "new-lands-l01-p003",
]);
assert.deepEqual(firstActivation.state.admittingRegionIds, [
  "new-lands-l01-p002",
  "new-lands-l01-p003",
]);

const replay = topology.planThresholdActivation({
  state: firstActivation.state,
  resetGeneration: generation,
  sourceRegionId: "new-lands-l01-p001",
  remainingNpcCities: 20,
});
assert.equal(replay.changed, false);
assert.equal(replay.reason, "source-not-admitting");

let state = firstActivation.state;
for (let ordinal = 1; ordinal < 24; ordinal += 1) {
  const sourceRegionId = topology.getRegionAtActivationOrdinal(ordinal).id;
  if (!state.admittingRegionIds.includes(sourceRegionId)) continue;
  state = topology.planThresholdActivation({
    state,
    resetGeneration: generation,
    sourceRegionId,
    remainingNpcCities: 20,
    thresholdRevision: ordinal,
  }).state;
}
assert(state.activeRegionIds.includes("new-lands-l01-p024"));
assert(state.activeRegionIds.some(regionId => regionId === "new-lands-l02-p001"));
const activeOrdinals = state.activeRegionIds.map(regionId => {
  for (let ordinal = 0; ordinal < state.nextActivationOrdinal; ordinal += 1) {
    if (topology.getRegionAtActivationOrdinal(ordinal).id === regionId) return ordinal;
  }
  return -1;
});
assert.deepEqual(activeOrdinals, Array.from({ length: state.activeRegionIds.length }, (_, index) => index));

assert.throws(() => topology.planThresholdActivation({
  state,
  resetGeneration: "wrong-generation",
  sourceRegionId: state.admittingRegionIds[0],
  remainingNpcCities: 20,
}), /active reset generation/);

console.log("Validated the 25-map Core boundary, complete 24-map first ring, north-clockwise allocation, and idempotent two-map threshold activation.");
