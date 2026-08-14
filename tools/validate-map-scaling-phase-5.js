"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PLAYER_REGION_CITY_CAPACITY,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
} = require("../functions/player-region-spawn");
const {
  validatePermanentCorePackage,
  FUTURE_HOLDING_TOWER_COORDINATES,
} = require("./map-scaling-phase-5/core-package");
const { validateGeometryArtParity } = require("./map-scaling-phase-5/validators");
const { outputRoot } = require("./run-map-scaling-phase-5");

const root = path.resolve(__dirname, "..");
const reportPath = path.join(outputRoot, "phase-5-results.json");
assert(fs.existsSync(reportPath), "Missing Phase 5 receipt; run tools/run-map-scaling-phase-5.js first.");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const corePackage = JSON.parse(fs.readFileSync(path.join(outputRoot, "core", "permanent-core-package.json"), "utf8"));

assert.equal(report.developmentOnly, true);
assert.equal(report.generatorVersion, "phase5-composer-v1");
assert.equal(report.assetLibraryVersion, "phase5-dev-placeholder-library-v1");
assert.equal(PLAYER_REGION_CITY_CAPACITY, 40);
assert.equal(MINIMUM_NPC_CITIES_FOR_SPAWN, 15);

const coreValidation = validatePermanentCorePackage(corePackage);
assert.equal(coreValidation.valid, true, coreValidation.errors.join("\n"));
assert.equal(corePackage.cells.length, 25);
assert.equal(coreValidation.activeCoreRegionCount, 10);
assert.equal(coreValidation.reservedCoreCellCount, 15);
assert.equal(coreValidation.citadelCount, 1);
assert.equal(coreValidation.strongholdCount, 4);
assert.equal(coreValidation.campCount, 4);
assert.equal(coreValidation.holdingTowerReservationCount, 4);
assert.equal(FUTURE_HOLDING_TOWER_COORDINATES.length, 4);
assert.deepEqual(
  FUTURE_HOLDING_TOWER_COORDINATES.map(({ gridX, gridY }) => [gridX, gridY]),
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
);
assert.equal(corePackage.futureHoldingTowerReservationPolicy.status, "locked");
assert.equal(corePackage.futureHoldingTowerReservationPolicy.lockVersion, "phase5-approved-v1");
assert.equal(corePackage.futureHoldingTowerReservationPolicy.normalPlayerRegionUseAllowed, false);
assert.equal(corePackage.futureHoldingTowerReservationPolicy.normalCityPopulationAllowed, false);
assert.equal(corePackage.futureHoldingTowerReservationPolicy.cityRelocationAllowed, false);
assert.equal(corePackage.futureHoldingTowerReservationPolicy.coordinateReuseAllowed, false);
assert.equal(corePackage.cells.filter(cell => cell.cellState === "reserved_holding_tower").length, 4);
assert(corePackage.cells.filter(cell => cell.cellState === "reserved_holding_tower")
  .every(cell => cell.reservationLocked === true && cell.normalPlayerRegionUseAllowed === false));
assert(corePackage.cells.every(cell => cell.spawnEligible === false && cell.spawnReady === false));
assert(corePackage.cells.every(cell => cell.playerRegionGenerationAllowed === false));
const changedTowerSet = JSON.parse(JSON.stringify(corePackage));
changedTowerSet.futureHoldingTowerCoordinates[0].gridX = -2;
assert.equal(validatePermanentCorePackage(changedTowerSet).valid, false, "Changed Tower coordinates were accepted.");
const reusedTowerCell = JSON.parse(JSON.stringify(corePackage));
const reusedCell = reusedTowerCell.cells.find(cell => cell.cellState === "reserved_holding_tower");
reusedCell.cellState = "handcrafted_active";
reusedCell.regionId = "forbidden_player_region";
reusedCell.purpose = "player_region";
reusedCell.normalCityCapacity = 40;
reusedCell.playerRegionGenerationAllowed = true;
assert.equal(validatePermanentCorePackage(reusedTowerCell).valid, false, "Player-region reuse of a Tower coordinate was accepted.");
assert.equal(report.corePackage.validation.relocationRejected, true);
assert.equal(report.corePackage.validation.overlapRejected, true);

assert.equal(report.profiles.length, 4);
for (const profile of report.profiles) {
  assert.equal(profile.status, "standby");
  assert.equal(profile.cityCount, 40);
  assert(profile.startingCandidateCount >= 2);
  assert(Object.values(profile.deterministic).every(Boolean), `${profile.kind} determinism failed.`);
  assert.equal(profile.validation.valid, true, JSON.stringify(profile.validation.errors));
  assert(profile.mapBytes > 0 && profile.mapBytes <= 1024 * 1024);
  assert(profile.thumbnailBytes > 0 && profile.thumbnailBytes <= 200 * 1024);
  const packageRoot = path.join(outputRoot, "packages", profile.kind);
  for (const required of [
    "catalog.json", "region.json", "terrain.json", "blockers.json", "blocker-mask.rle.json", "roads.json",
    "cities.json", "starting-candidates.json", "composition.json", "map.webp", "thumbnail.webp",
    "generation-manifest.json", "validation-receipt.json", "package.json",
  ]) assert(fs.existsSync(path.join(packageRoot, required)), `${profile.kind} package is missing ${required}.`);
  const composition = JSON.parse(fs.readFileSync(path.join(packageRoot, "composition.json"), "utf8"));
  assert.equal(composition.watermarkRequired, true);
  const packageManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(packageManifest.lifecycle, "STANDBY");
  assert.equal(packageManifest.catalogEntry.spawnEligible, false);
  assert.equal(packageManifest.catalogEntry.spawnReady, false);
}

assert.equal(report.constrainedInvalid.status, "rolled_back");
assert(report.constrainedInvalid.cityCount < 40);
assert.deepEqual(report.constrainedInvalid.outputFiles, []);
assert.equal(report.constrainedInvalid.rollbackValidation.valid, true);
for (const fixture of Object.values(report.topologyFixtures)) {
  assert.equal(fixture.allExactly40, true, `${fixture.kind} includes an invalid city count.`);
}
assert.equal(report.topologyFixtures.twoConnected.mapCount, 2);
assert.equal(report.topologyFixtures.threeClockwise.mapCount, 3);
assert.equal(report.topologyFixtures.ringClosing.mapCount, 24);
const ring = report.topologyFixtures.ringClosing.maps;
assert.equal(ring.at(-1).finalConnections.north.targetRegionId, ring[0].regionId);
assert.equal(ring[0].finalConnections.south.targetRegionId, ring.at(-1).regionId);
assert(Object.values(report.invalidMutations).every(Boolean), "An invalid package mutation was accepted.");

const productionWorld = require("../functions/world-layout.json");
const productionCatalog = require("../functions/region-catalog.json");
assert.equal(productionWorld.maps.length, 15);
assert.equal(productionWorld.maps.flatMap(map => map.cities || []).length, 1050);
assert.equal(productionCatalog.regions.length, 15);
assert.equal(productionCatalog.coreReservations.length, 25);
const productionServer = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
assert(!productionServer.includes("phase5-composer"), "Phase 5 composer leaked into production Functions.");
const productionEntry = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert(!productionEntry.includes("map-scaling-phase-5"), "Phase 5 preview leaked into production entry point.");
const capacitySource = fs.readFileSync(path.join(root, "functions", "player-region-spawn.js"), "utf8");
assert.match(capacitySource, /PLAYER_REGION_CITY_CAPACITY\s*=\s*40/);
assert.match(capacitySource, /MINIMUM_NPC_CITIES_FOR_SPAWN\s*=\s*15/);
assert.match(productionServer, /ownershipStateAuthoritative:\s*true/);

const parityMutation = JSON.parse(fs.readFileSync(path.join(outputRoot, "packages", "agricultural", "composition.json"), "utf8"));
assert.equal(parityMutation.dimensions.width, 1448);
assert.equal(parityMutation.dimensions.height, 1086);
assert.equal(report.assetLibrary.productionReady, false);
assert.equal(report.assetLibrary.validation.valid, true);

console.log(`Phase 5 validation passed: 25 Core cells, 4 deterministic WebP packages, ${ring.length}-map ring fixture, exact 40-city capacity.`);
