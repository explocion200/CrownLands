"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  CORE_RADIUS,
  DIRECTIONS,
  coordinateKey,
  getClockwiseRingCoordinates,
  getWorldLayer,
} = require("../region-catalog");
const {
  DEFAULT_GENERATOR_CONFIG,
  PLAYER_REGION_CITY_CAPACITY,
  allocateNextPlayerRegion,
  createGeneratedCityId,
  evaluateCityPlacement,
  findNextOuterCoordinate,
  hashObject,
} = require("./map-scaling-phase-4/generator");
const { createDevelopmentCore25 } = require("./map-scaling-phase-4/fixtures");
const { runPhase4ScenarioSuite } = require("./map-scaling-phase-4/scenarios");

const root = path.resolve(__dirname, "..");
const APPROVED_PHASE_3_COMMIT = "22fbd1063c8e06a017577459ee9ceabd39be92c8";
const APPROVED_PRODUCTION_FILES = Object.freeze([
  "functions/world-layout.json",
  "functions/region-catalog.json",
  "assets/map-editor-data.js",
  "assets/worlds/world_01/map-manifest.json",
]);

function normalizedTextHash(text) {
  return crypto.createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex");
}

for (const relativePath of APPROVED_PRODUCTION_FILES) {
  const approvedText = childProcess.execFileSync(
    "git",
    ["show", `${APPROVED_PHASE_3_COMMIT}:${relativePath}`],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  const currentText = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.equal(
    normalizedTextHash(currentText),
    normalizedTextHash(approvedText),
    `${relativePath} changed from approved Phase 3.`,
  );
}

const world = require("../functions/world-layout.json");
const catalog = require("../functions/region-catalog.json");
assert.equal(world.maps.length, 15, "Production map count changed.");
assert.equal(world.maps.flatMap(map => map.cities || []).length, 1050, "Production city count changed.");
assert.equal(catalog.regions.length, 15, "Production region catalog changed.");
assert.equal(catalog.coreReservations.length, 25, "Permanent Core reservation count changed.");
assert(catalog.coreReservations.every(cell => cell.spawnEligible === false));

const suite = runPhase4ScenarioSuite();
const exactLayerOneOrder = getClockwiseRingCoordinates(1, CORE_RADIUS);
assert.equal(exactLayerOneOrder.length, 24, "Layer 1 must contain 24 coordinates.");
assert.deepEqual(exactLayerOneOrder, [
  { gridX: -3, gridY: -3 }, { gridX: -2, gridY: -3 }, { gridX: -1, gridY: -3 },
  { gridX: 0, gridY: -3 }, { gridX: 1, gridY: -3 }, { gridX: 2, gridY: -3 },
  { gridX: 3, gridY: -3 }, { gridX: 3, gridY: -2 }, { gridX: 3, gridY: -1 },
  { gridX: 3, gridY: 0 }, { gridX: 3, gridY: 1 }, { gridX: 3, gridY: 2 },
  { gridX: 3, gridY: 3 }, { gridX: 2, gridY: 3 }, { gridX: 1, gridY: 3 },
  { gridX: 0, gridY: 3 }, { gridX: -1, gridY: 3 }, { gridX: -2, gridY: 3 },
  { gridX: -3, gridY: 3 }, { gridX: -3, gridY: 2 }, { gridX: -3, gridY: 1 },
  { gridX: -3, gridY: 0 }, { gridX: -3, gridY: -1 }, { gridX: -3, gridY: -2 },
]);

const partial = suite.partialRing;
for (const count of [1, 2, 5, 12, 23, 24]) {
  const stage = partial.stages[count];
  assert(stage, `Missing partial-ring stage ${count}.`);
  assert.deepEqual(
    { gridX: stage.allocation.coordinate.gridX, gridY: stage.allocation.coordinate.gridY },
    exactLayerOneOrder[count - 1],
    `Stage ${count} is out of clockwise order.`,
  );
  if (count === 1) assert.equal(stage.allocation.previousClockwiseRegionId, "");
  else assert(stage.allocation.previousClockwiseRegionId, `Stage ${count} is missing its previous clockwise region.`);
  for (const [side, connection] of Object.entries(stage.region.connections)) {
    if (connection.state === "gated") assert.equal(connection.targetRegionId, "", `${count}:${side} gate has a hidden target.`);
    else assert.equal(connection.state, "open", `${count}:${side} has an invalid connection state.`);
  }
}
assert.equal(partial.stages[23].allocation.ringWillClose, false);
assert.equal(partial.stages[24].allocation.ringWillClose, true);
assert.deepEqual(partial.layerTwo.coordinate, {
  gridX: -4,
  gridY: -4,
  worldLayer: 2,
  clockwiseOrderIndex: 0,
});
assert.equal(partial.layerTwo.beginsNewLayer, true);

const fullLayer = suite.fullLayer;
assert.equal(fullLayer.playerRegions.length, 24, "Development Layer 1 did not complete.");
assert.equal(fullLayer.generated.length, 24);
assert(fullLayer.generated.every(entry => entry.result.status === "standby"), "A valid full-layer fixture rolled back.");
assert.deepEqual(
  fullLayer.generated.map(entry => ({
    gridX: entry.result.allocation.coordinate.gridX,
    gridY: entry.result.allocation.coordinate.gridY,
  })),
  exactLayerOneOrder,
  "Full development Layer 1 order drifted.",
);

const allGeneratedCityIds = new Set();
for (const entry of fullLayer.generated) {
  const result = entry.result;
  assert.equal(
    result.previewDefinition.cities.length,
    PLAYER_REGION_CITY_CAPACITY,
    `${result.allocation.regionId} does not contain exactly 40 city positions.`,
  );
  assert(result.previewDefinition.startingCityCandidates.length >= 2, `${result.allocation.regionId} lacks starting candidates.`);
  assert(result.catalogEntry.generationReady);
  assert.equal(result.catalogEntry.cityCapacity, PLAYER_REGION_CITY_CAPACITY);
  assert.equal(result.catalogEntry.initialNpcCityCount, PLAYER_REGION_CITY_CAPACITY);
  assert.equal(result.catalogEntry.spawnReady, false);
  assert.equal(result.catalogEntry.spawnEligible, false);
  assert.equal(result.catalogEntry.lifecycle, "standby");
  assert.equal(result.catalogEntry.visibility, "development_only");
  assert.equal(result.catalogEntry.activationAllowed, false);
  const seenInRegion = [];
  for (const city of result.previewDefinition.cities) {
    assert(!allGeneratedCityIds.has(city.id), `Generated city ID ${city.id} is not globally unique.`);
    allGeneratedCityIds.add(city.id);
    assert.match(city.id, /^npc_[a-z0-9_-]+_[0-9a-f]{14}$/);
    assert.equal(city.id, createGeneratedCityId(result.allocation.regionId, result.seed.seedHash, city));
    assert.equal(evaluateCityPlacement(
      city,
      require("./map-scaling-phase-4/generator").normalizeTerrainDefinition(
        result.previewDefinition,
        result.previewDefinition.generationConfig,
      ),
      result.previewDefinition.generationConfig || DEFAULT_GENERATOR_CONFIG,
      seenInRegion,
    ), "");
    assert.equal(city.ownerKind, "neutral");
    assert.equal(city.level, 1);
    assert.equal(city.troops, 10);
    seenInRegion.push(city);
  }
}

const fullRegionsById = new Map(fullLayer.regions.map(region => [region.id, region]));
const fullRegionsByCoordinate = new Map(fullLayer.regions.map(region => [coordinateKey(region.gridX, region.gridY), region]));
for (const region of fullLayer.playerRegions) {
  for (const [side, direction] of Object.entries(DIRECTIONS)) {
    const connection = region.connections[side];
    const neighbor = fullRegionsByCoordinate.get(coordinateKey(region.gridX + direction.dx, region.gridY + direction.dy));
    if (neighbor) {
      assert.equal(connection.state, "open");
      assert.equal(connection.targetRegionId, neighbor.id);
      const reciprocal = fullRegionsById.get(neighbor.id).connections[direction.opposite];
      assert.equal(reciprocal.targetRegionId, region.id);
      assert.equal(reciprocal.state, "open");
    } else {
      assert.equal(connection.state, "gated");
      assert.equal(connection.targetRegionId, "");
    }
    const targetLayer = getWorldLayer(region.gridX + direction.dx, region.gridY + direction.dy, CORE_RADIUS);
    if (targetLayer === 2) assert.equal(connection.state, "gated", `${region.id}:${side} outer edge must stay gated.`);
  }
}

const firstLayerRegion = fullLayer.playerRegions.find(region => region.clockwiseOrderIndex === 0);
const finalLayerRegion = fullLayer.playerRegions.find(region => region.clockwiseOrderIndex === 23);
assert.equal(firstLayerRegion.connections.south.targetRegionId, finalLayerRegion.id, "Ring-closing edge did not open on the first region.");
assert.equal(finalLayerRegion.connections.north.targetRegionId, firstLayerRegion.id, "Ring-closing edge did not open on the final region.");
assert.equal(fullLayer.layerTwoAllocation.coordinate.worldLayer, 2);
assert.deepEqual(findNextOuterCoordinate(fullLayer.regions), fullLayer.layerTwoAllocation.coordinate);

for (const fixture of suite.fixtures) {
  assert.equal(new Set(fixture.hashes).size, 1, `${fixture.kind} is not deterministic across repeats.`);
  assert.equal(fixture.deterministic, true);
  if (fixture.expectedSpawnReady) {
    assert.equal(fixture.result.status, "standby", `${fixture.kind} should be valid.`);
    assert.equal(fixture.result.previewDefinition.cities.length, PLAYER_REGION_CITY_CAPACITY);
    assert(fixture.result.previewDefinition.startingCityCandidates.length >= 2);
    assert.deepEqual(fixture.result.validation.errors, []);
  }
}

const invalid = suite.fixtures.find(fixture => fixture.kind === "constrained-invalid").result;
assert.equal(invalid.status, "rolled_back");
assert(invalid.previewDefinition.cities.length < PLAYER_REGION_CITY_CAPACITY);
assert.equal(invalid.catalogEntry, null);
assert.equal(invalid.definition, null);
assert.equal(invalid.publicationPackage, null);
assert.equal(invalid.receipt.coordinateReusable, true);
assert.deepEqual(invalid.receipt.stateHistory, ["ALLOCATED", "GENERATING", "VALIDATING", "FAILED", "ROLLED_BACK"]);
assert(invalid.validation.errors.some(error => error.includes("exactly 40 are required")));
assert.deepEqual(suite.retryPlan.coordinate, invalid.allocation.coordinate);
assert.equal(suite.retryPlan.regionId, invalid.allocation.regionId);
assert.equal(suite.retryPlan.nextState, "ALLOCATED");

assert.equal(suite.differentSeed.different, true, "Different valid seeds produced the same layout hash.");
assert.equal(suite.differentSeed.alternateSpawnReady, true, "Alternate valid seed broke placement rules.");

const shuffledProjection = fullLayer.generated.map(entry => ({
  regionId: entry.result.allocation.regionId,
  cities: [...entry.result.previewDefinition.cities].reverse()
    .map(city => ({ id: city.id, x: city.x, y: city.y }))
    .sort((left, right) => left.id.localeCompare(right.id)),
}));
const canonicalProjection = fullLayer.generated.map(entry => ({
  regionId: entry.result.allocation.regionId,
  cities: entry.result.previewDefinition.cities
    .map(city => ({ id: city.id, x: city.x, y: city.y }))
    .sort((left, right) => left.id.localeCompare(right.id)),
}));
assert.equal(hashObject(shuffledProjection), hashObject(canonicalProjection), "City identity depends on array ordering.");

const emptyCore = createDevelopmentCore25();
assert.equal(emptyCore.length, 25);
assert(emptyCore.every(region => region.permanentCore && !region.spawnEligible));
const firstAllocation = allocateNextPlayerRegion({
  worldId: suite.worldId,
  seasonId: suite.seasonId,
  existingRegions: emptyCore,
});
assert.deepEqual(firstAllocation.coordinate, { gridX: -3, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 0 });

const productionEntryPoint = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert(!productionEntryPoint.includes("map-scaling-phase-4"), "Phase 4 tooling leaked into the production entry point.");
const productionServer = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
assert(!productionServer.includes("phase4-prototype"), "Phase 4 tooling leaked into production Functions.");

console.log(`Phase 4 validation passed from ${APPROVED_PHASE_3_COMMIT.slice(0, 12)}: 5 fixtures, 24-map Layer 1, ${allGeneratedCityIds.size} unique NPC cities.`);
