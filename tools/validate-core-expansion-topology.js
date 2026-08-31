"use strict";

const assert = require("node:assert/strict");
const topology = require("../functions/coreExpansionTopology.js");

assert.equal(topology.CORE_MAP_COUNT, 25);
assert.equal(topology.FIRST_LAYER_MAP_COUNT, 24);
assert.equal(topology.NEW_LANDS_CITY_CAPACITY, 40);
assert.equal(topology.EXPANSION_THRESHOLD_NPC_CITIES, 20);
assert.equal(topology.EXPANSION_ACTIVATION_BATCH_SIZE, 2);

const firstLayer = topology.getClockwiseLayerCoordinates(1);
assert.equal(firstLayer.length, 24);
assert.deepEqual(firstLayer[0], { gridX: -3, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 0 });
assert.deepEqual(firstLayer[6], { gridX: 3, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 6 });
assert.deepEqual(firstLayer[12], { gridX: 3, gridY: 3, worldLayer: 1, clockwiseOrderIndex: 12 });
assert.deepEqual(firstLayer[18], { gridX: -3, gridY: 3, worldLayer: 1, clockwiseOrderIndex: 18 });
assert.equal(new Set(firstLayer.map(point => `${point.gridX},${point.gridY}`)).size, 24);

const secondLayer = topology.getClockwiseLayerCoordinates(2);
assert.equal(secondLayer.length, 32);
assert.deepEqual(secondLayer[0], { gridX: -4, gridY: -4, worldLayer: 2, clockwiseOrderIndex: 0 });
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
