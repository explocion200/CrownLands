"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  CORE_RADIUS,
  MINIMUM_SPAWN_NPC_CITIES,
  REGION_DEFINITION_CACHE_LIMIT,
  buildRegionCatalog,
  deriveWorldBounds,
  getClockwiseRingCoordinates,
  getCurrentOuterPlayerLayer,
  getNextClockwiseCoordinate,
  getNextPlayerExpansionCoordinate,
  isRingComplete,
  validateCatalog,
} = require("../region-catalog");
const resetContract = require("../reset-persistence-contract");
const {
  fixtureRegion,
  createFullCoreFixture,
  createLayerOneFixture,
  createResetPersistenceFixture,
} = require("./fixtures/map-scaling-phase-3");

const root = path.resolve(__dirname, "..");
const catalog = require("../functions/region-catalog.json");
const layout = require("../functions/world-layout.json");
const mapManifest = require("../assets/worlds/world_01/map-manifest.json");
const thumbnailManifest = require("../assets/worlds/world_01/thumbnail-manifest.json");
const runtime = fs.readFileSync(path.join(root, "game.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

assert.deepEqual(validateCatalog(catalog), [], "Production region catalog is invalid.");
assert.equal(catalog.topology.coreWidth, 5);
assert.equal(catalog.coreReservations.length, 25);
assert(catalog.coreReservations.every(cell => cell.spawnEligible === false));
assert(catalog.regions.filter(region => region.permanentCore).every(region => !region.spawnEligible));
assert(catalog.regions.filter(region => region.spawnEligible).every(region => (
  region.purpose === "player_region"
  && region.worldLayer >= 1
  && region.npcCityCount >= MINIMUM_SPAWN_NPC_CITIES
  && region.spawnReady
)));

const expectedNamedCoordinates = new Map([
  ["center", ["Crownlands Heart", 0, 0]],
  ["north", ["North Frontier", 0, -1]],
  ["east", ["East Reach", 1, 0]],
  ["south", ["Southfields", 0, 1]],
  ["west", ["West Marches", -1, 0]],
  ["region_6", ["Graywood Hollow", -2, 2]],
  ["region_7", ["Greenrook Vale", -1, 2]],
  ["region_8", ["Lowroad Vale", 0, 2]],
  ["region_9", ["Stonebrook Farms", 1, 2]],
  ["region_10", ["Goldmere Plains", 2, 2]],
]);
for (const [id, expected] of expectedNamedCoordinates) {
  const region = catalog.regions.find(candidate => candidate.id === id);
  assert(region, `Missing current named region ${id}.`);
  assert.deepEqual([region.name, region.gridX, region.gridY], expected, `${id} moved or was renamed.`);
}

const layoutById = new Map(layout.maps.map(region => [region.id, region]));
for (const region of catalog.regions) {
  assert(layoutById.has(region.id), `${region.id} is missing from server world data.`);
  assert(fs.existsSync(path.join(root, region.mapAsset)), `${region.id} map asset is missing.`);
  assert(fs.existsSync(path.join(root, region.thumbnailAsset)), `${region.id} thumbnail is missing.`);
  assert(fs.existsSync(path.join(root, region.regionDefinitionPath)), `${region.id} lazy definition is missing.`);
  const definition = JSON.parse(fs.readFileSync(path.join(root, region.regionDefinitionPath), "utf8"));
  assert.equal(definition.id, region.id, `${region.id} definition ID drifted.`);
  assert.equal(definition.cities.length, region.npcCityCount, `${region.id} NPC metadata drifted.`);
  for (const [side, connection] of Object.entries(region.connections)) {
    const manualTargets = (definition.edgeConnections?.[side] || [])
      .filter(edge => !edge.intentionalOuter)
      .map(edge => edge.connectsToRegionId);
    assert.equal(
      connection.state === "open",
      manualTargets.includes(connection.targetRegionId),
      `${region.id}:${side} topology changed from the current production route data.`,
    );
  }
}
assert.deepEqual(
  new Set(mapManifest.maps.map(entry => entry.id)),
  new Set(catalog.regions.map(region => region.id)),
  "Map manifest must follow the active catalog.",
);
assert.deepEqual(
  new Set(thumbnailManifest.thumbnails.map(entry => entry.id)),
  new Set(catalog.regions.map(region => region.id)),
  "Thumbnail manifest must follow the active catalog.",
);

const fixtureLayout = {
  worldId: "phase_3_fixture",
  updatedAt: "2026-08-13T00:00:00.000Z",
  globalSettings: { worldWidth: 13000, worldHeight: 17000, gridCellWorldSize: 2300 },
};
const fullCore = createFullCoreFixture();
const fullCoreCatalog = buildRegionCatalog(fixtureLayout, fullCore);
assert.equal(fullCoreCatalog.regions.length, (CORE_RADIUS * 2 + 1) ** 2);
assert(fullCoreCatalog.regions.every(region => region.permanentCore && !region.spawnEligible));

const partialLayer = createLayerOneFixture({ complete: false });
const partialCatalog = buildRegionCatalog(fixtureLayout, [...fullCore, ...partialLayer]);
assert(partialCatalog.regions.filter(region => region.worldLayer === 1).every(region => region.spawnEligible));
assert.equal(getCurrentOuterPlayerLayer(partialCatalog.regions), 1);
assert.deepEqual(getNextClockwiseCoordinate(partialCatalog.regions, 1), getClockwiseRingCoordinates(1)[partialLayer.length]);
assert.equal(isRingComplete(partialCatalog.regions, 1), false);

const lonePlayer = fixtureRegion({ id: "layer_1_gate", gridX: 0, gridY: -3, cities: MINIMUM_SPAWN_NPC_CITIES });
const gatedCatalog = buildRegionCatalog(fixtureLayout, [...fullCore, lonePlayer]);
assert.equal(gatedCatalog.regions.find(region => region.id === lonePlayer.id).connections.east.state, "gated");
const eastNeighbor = fixtureRegion({ id: "region_26_fixture", gridX: 1, gridY: -3, cities: MINIMUM_SPAWN_NPC_CITIES });
const openedCatalog = buildRegionCatalog(fixtureLayout, [...fullCore, lonePlayer, eastNeighbor]);
const openedSource = openedCatalog.regions.find(region => region.id === lonePlayer.id);
const openedTarget = openedCatalog.regions.find(region => region.id === eastNeighbor.id);
assert.equal(openedSource.connections.east.state, "open");
assert.equal(openedSource.connections.east.targetRegionId, eastNeighbor.id);
assert.equal(openedTarget.connections.west.targetRegionId, lonePlayer.id);

const completeLayer = createLayerOneFixture();
const completeCatalog = buildRegionCatalog(fixtureLayout, [...fullCore, ...completeLayer]);
assert.equal(isRingComplete(completeCatalog.regions, 1), true);
assert.equal(getNextClockwiseCoordinate(completeCatalog.regions, 1), null);
assert.deepEqual(getNextPlayerExpansionCoordinate(completeCatalog.regions), {
  gridX: -4,
  gridY: -4,
  worldLayer: 2,
  clockwiseOrderIndex: 0,
});
assert.deepEqual(
  completeCatalog.regions.filter(region => region.worldLayer === 1).map(region => region.clockwiseOrderIndex).sort((a, b) => a - b),
  getClockwiseRingCoordinates(1).map((_, index) => index),
);
assert(openedCatalog.regions.some(region => region.id === "region_26_fixture"), "Region 26+ must require no client enumeration.");
assert.deepEqual(deriveWorldBounds(completeCatalog.regions), {
  minGridX: -3, maxGridX: 3, minGridY: -3, maxGridY: 3, width: 7, height: 7,
});

const malformedCatalog = JSON.parse(JSON.stringify(completeCatalog));
malformedCatalog.regions.find(region => region.worldLayer === 1).connections.north = {
  side: "north",
  oppositeSide: "south",
  state: "open",
  targetRegionId: "region_26_fixture",
};
assert(validateCatalog(malformedCatalog).some(error => error.includes("must be gated")));

const resetFixture = createResetPersistenceFixture();
const persistent = resetContract.extractPersistentPlayerProgression(resetFixture);
assert.deepEqual(resetContract.validatePersistentPayload(persistent), []);
assert.deepEqual(persistent.flag, resetFixture.flag);
assert.deepEqual(persistent.gear, resetContract.extractPersistentCommonGear(resetFixture.gear));
assert.deepEqual(Object.keys(persistent.gear).sort(), [...resetContract.PERSISTENT_GEAR_FIELDS].sort());
assert.equal(persistent.clanId, resetFixture.clanId);
for (const field of [...resetContract.CONSUMABLE_FIELDS, ...resetContract.SEASONAL_WORLD_FIELDS]) {
  assert(!Object.prototype.hasOwnProperty.call(persistent, field), `${field} leaked into reset persistence.`);
}

assert(!index.includes("assets/map-editor-data.js"), "Production entry point still loads the all-region city bundle.");
assert(index.includes("assets/worlds/world_01/region-catalog.js"));
assert(runtime.includes("ensureRegionDefinitionLoaded"));
assert(runtime.includes(`cacheLimit: REGION_DEFINITION_CACHE_LIMIT`));
assert.equal(REGION_DEFINITION_CACHE_LIMIT, 4);
assert(serviceWorker.includes("MAX_REGION_CACHE_ENTRIES = 8"));
assert(serviceWorker.includes("MAX_WORLD_IMAGE_CACHE_ENTRIES = 12"));
assert(!/\.length\s*(?:===|!==)\s*15/.test(runtime), "Runtime contains an exactly-15 region assertion.");

const productionCatalogText = JSON.stringify(catalog);
for (const fixtureMarker of ["core_fixture_", "layer_1_fixture_", "region_26_fixture", "fixture_clan"]) {
  assert(!productionCatalogText.includes(fixtureMarker), `${fixtureMarker} leaked into production catalog data.`);
}

console.log(`Phase 3 catalog validation passed (${catalog.regions.length} active regions, ${catalog.coreReservations.length} reserved core cells).`);
