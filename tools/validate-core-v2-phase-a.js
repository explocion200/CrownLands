"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const {
  CORE_CITY_TOTAL,
  CAPACITY_BY_TYPE,
  TOWER_COORDINATES,
  SLICE_COORDINATES,
  SIDES,
  DELTAS,
  coordinateKey,
  buildCoreSpecification,
  buildLayerOneFortressArchitecture,
} = require("./core-v2-phase-a/spec");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-a");
const EXPECTED_ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const EXPECTED_TYPE_COUNTS = Object.freeze({
  SUPPORT: 4,
  DEED_CAMP: 4,
  RELIC_CAMP: 4,
  WARBAND_CAMP: 2,
  GOLD_CAMP: 2,
  HOLDING_TOWER: 4,
  STRONGHOLD: 4,
  CROWN_CITADEL: 1,
});

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validateSpecification() {
  const specification = buildCoreSpecification();
  assert.equal(specification.regions.length, 25, "Core v2 must contain exactly 25 coordinates.");
  const coordinateKeys = specification.regions.map(region => coordinateKey(region.coordinate.gridX, region.coordinate.gridY));
  assert.equal(new Set(coordinateKeys).size, 25, "Core v2 contains duplicate coordinates.");
  assert(coordinateKeys.every(key => {
    const [x, y] = key.split(",").map(Number);
    return Math.abs(x) <= 2 && Math.abs(y) <= 2;
  }), "A Core coordinate lies outside the permanent 5x5 Core.");
  const typeCounts = {};
  for (const region of specification.regions) {
    typeCounts[region.mapType] = (typeCounts[region.mapType] || 0) + 1;
    assert.equal(region.exactCityCapacity, CAPACITY_BY_TYPE[region.mapType], `${region.name} has the wrong capacity.`);
    assert.equal(region.spawnEligible, false, `${region.name} became spawn-eligible.`);
    assert.equal(region.runtimeNpcSpawnThresholdApplies, false, `${region.name} inherited the outer 15-NPC threshold.`);
    assert.equal(region.permanentCore, true);
    assert.equal(region.developmentOnly, true);
    assert.equal(region.productionActivated, false);
    assert.equal(region.publicationAllowed, false);
  }
  assert.deepEqual(typeCounts, EXPECTED_TYPE_COUNTS, "Core v2 map-type counts changed.");
  assert.equal(specification.regions.reduce((sum, region) => sum + region.exactCityCapacity, 0), CORE_CITY_TOTAL);

  const towers = specification.regions.filter(region => region.mapType === "HOLDING_TOWER")
    .map(region => coordinateKey(region.coordinate.gridX, region.coordinate.gridY)).sort();
  assert.deepEqual(towers, TOWER_COORDINATES.map(point => coordinateKey(point.gridX, point.gridY)).sort(), "Holding Tower coordinates changed.");
  const byCoordinate = new Map(specification.regions.map(region => [coordinateKey(region.coordinate.gridX, region.coordinate.gridY), region]));
  for (const region of specification.regions) {
    for (const side of SIDES) {
      const connection = region.topology.connections[side];
      const delta = DELTAS[side];
      const neighbor = byCoordinate.get(coordinateKey(region.coordinate.gridX + delta.x, region.coordinate.gridY + delta.y));
      if (neighbor) {
        assert.equal(connection.state, "OPEN", `${region.name} ${side} should be OPEN.`);
        assert.equal(connection.regionId, neighbor.regionId);
        const reciprocal = neighbor.topology.connections[delta.opposite];
        assert.equal(reciprocal.state, "OPEN");
        assert.equal(reciprocal.regionId, region.regionId);
      } else {
        assert.equal(connection.state, "GATED", `${region.name} outer ${side} should be GATED.`);
        assert.equal(connection.regionId, null);
      }
      assert.deepEqual(region.topology.roadSockets[side], specification.regions[0].topology.roadSockets[side]);
    }
  }
  return { specification, typeCounts };
}

function validateSlice(specification) {
  const index = readJson("benchmark-results/map/core-v2-phase-a/prototype-index.json");
  assert.equal(index.prototypeCount, 5, "Phase A must render only five prototypes.");
  const approved = new Set(SLICE_COORDINATES.map(point => coordinateKey(point.gridX, point.gridY)));
  assert.deepEqual(new Set(index.prototypes.map(item => coordinateKey(item.coordinate.gridX, item.coordinate.gridY))), approved);
  const prototypeDirectories = fs.readdirSync(path.join(OUTPUT, "prototypes"), { withFileTypes: true }).filter(entry => entry.isDirectory());
  assert.equal(prototypeDirectories.length, 5, "Unexpected Core prototypes were generated.");
  for (const prototype of index.prototypes) {
    const directory = path.join(ROOT, prototype.outputDirectory);
    const cities = readJson(path.relative(ROOT, path.join(directory, "cities.json")));
    const receipt = readJson(path.relative(ROOT, path.join(directory, "validation-receipt.json")));
    const plan = readJson(path.relative(ROOT, path.join(directory, "composition.json")));
    const expected = specification.regions.find(region => region.regionId === prototype.regionId);
    assert(expected, `Unknown prototype ${prototype.regionId}.`);
    assert.equal(cities.length, expected.exactCityCapacity);
    assert.equal(new Set(cities.map(city => city.id)).size, cities.length, `${prototype.name} has duplicate city IDs.`);
    assert.equal(receipt.validation.valid, true, `${prototype.name} validation failed.`);
    assert.equal(receipt.validation.cityObjectiveConflicts, 0);
    assert.equal(receipt.validation.cityBlockerConflicts, 0);
    assert.equal(receipt.validation.cityRoadConflicts, 0);
    assert.equal(receipt.validation.cityTransitionConflicts, 0);
    assert(receipt.validation.minimumSpacing >= 68, `${prototype.name} city art can overlap.`);
    assert.equal(plan.permanentCore, true);
    assert.equal(plan.spawnEligible, false);
    assert.equal(plan.developmentOnly, true);
    assert.equal(plan.productionActivated, false);
    assert.equal(plan.publicationAllowed, false);
    assert.equal(plan.roadSystem.edgeRoads.length, 4);
    assert.equal(plan.receiptHash, undefined);
    for (const required of [
      "map-clean.png", "map.webp", "thumbnail.webp", "qa/01-city-position-overlay.png",
      "qa/02-actual-city-art-overlay.png", "qa/03-objective-overlay.png", "qa/04-road-geometry-overlay.png",
      "qa/05-blocker-overlay.png", "qa/06-clearance-proof.png", "qa/07-coordinate-overlay.png",
      "qa/08-edge-closeups.png", "qa/09-road-opening-closeups.png",
    ]) assert(fs.existsSync(path.join(directory, required)), `${prototype.name} is missing ${required}.`);
  }
  const adjacencyKeys = index.prototypes.map(item => coordinateKey(item.coordinate.gridX, item.coordinate.gridY));
  for (let indexValue = 0; indexValue < adjacencyKeys.length - 1; indexValue += 1) {
    const [ax, ay] = adjacencyKeys[indexValue].split(",").map(Number);
    const [bx, by] = adjacencyKeys[indexValue + 1].split(",").map(Number);
    assert.equal(Math.abs(ax - bx) + Math.abs(ay - by), 1, "The five-map slice is not a connected path.");
  }
  assert(fs.existsSync(path.join(OUTPUT, "gallery", "five-map-review-board.png")));
  assert(fs.existsSync(path.join(OUTPUT, "gallery", "neighbor-transitions.png")));
  return index;
}

function validateFortresses() {
  const architecture = buildLayerOneFortressArchitecture();
  assert.equal(architecture.layerOneMapCount, 24);
  assert.equal(architecture.reservations.length, 4);
  for (const reservation of architecture.reservations) {
    assert.equal(reservation.type, "FORTRESS");
    assert(Math.max(Math.abs(reservation.coordinate.gridX), Math.abs(reservation.coordinate.gridY)) === 3, "Fortress reservation is not outside the Core in Layer 1.");
    assert.equal(reservation.invisibleInLiveGameplay, true);
    assert.equal(reservation.immutableOncePublished, true);
  }
  for (let left = 0; left < architecture.reservations.length; left += 1) {
    for (let right = left + 1; right < architecture.reservations.length; right += 1) {
      const a = architecture.reservations[left].coordinate;
      const b = architecture.reservations[right].coordinate;
      assert(Math.abs(a.gridX - b.gridX) + Math.abs(a.gridY - b.gridY) > 1, "Fortress reservations are cardinally adjacent.");
      const slotDistance = Math.abs(architecture.reservations[left].clockwiseSlot - architecture.reservations[right].clockwiseSlot);
      assert(Math.min(slotDistance, 24 - slotDistance) >= 6, "Fortress reservations are stacked around Layer 1.");
    }
  }
  return architecture;
}

function validateProductionSafety() {
  const catalog = readJson("assets/worlds/world_01/region-catalog.json");
  const regionFiles = catalog.regions.map(region => readJson(region.regionDefinitionPath));
  const preflight = readJson("docs/map-scaling-audit/phase-9/results/PRODUCTION_READ_ONLY_PREFLIGHT.json");
  assert.equal(catalog.regions.length, 15);
  assert.equal(regionFiles.flatMap(region => region.cities || []).length, 1050);
  assert.equal(preflight.productionBaseline.mapCount, 15);
  assert.equal(preflight.productionBaseline.cityDefinitionCount, 1050);
  assert.equal(preflight.productionBaseline.directedMapChainCount, 210);
  assert.equal(preflight.productionBaseline.generatedActiveRegionCount, 0);
  assert.equal(preflight.productionMutationPerformed, false);
  assert.equal(sha256(path.join(ROOT, "benchmark-results/map/phase-6d/asset-library/asset-manifest.json")), EXPECTED_ASSET_MANIFEST_HASH);
  const changed = childProcess.execFileSync("git", ["diff", "--name-only", "99e56a8b1a4015607cdb438a7c1edc1922eca91e"], { cwd: ROOT, encoding: "utf8" })
    .trim().split(/\r?\n/).filter(Boolean);
  const forbidden = changed.filter(file => !(
    file.startsWith("tools/core-v2-phase-a/")
    || file === "tools/run-core-v2-phase-a.js"
    || file === "tools/validate-core-v2-phase-a.js"
    || file.startsWith("docs/map-scaling-audit/core-v2/phase-a/")
    || file.startsWith("benchmark-results/map/core-v2-phase-a/")
  ));
  assert.deepEqual(forbidden, [], `Core v2 changed production/shared files: ${forbidden.join(", ")}`);
  return { changed, preflight };
}

const { specification, typeCounts } = validateSpecification();
const slice = validateSlice(specification);
const fortresses = validateFortresses();
const safety = validateProductionSafety();
console.log("Core v2 Phase A validation passed.");
console.log(`Core: ${specification.regions.length} maps / ${CORE_CITY_TOTAL} cities / ${JSON.stringify(typeCounts)}.`);
console.log(`Slice: ${slice.prototypeCount} prototypes; exact capacities ${slice.prototypes.map(item => item.exactCityCapacity).join(", ")}.`);
console.log(`Fortresses: ${fortresses.reservations.length}/${fortresses.layerOneMapCount} Layer 1 reservations; anti-stacking passed.`);
console.log(`Production baseline: ${safety.preflight.productionBaseline.mapCount} maps / ${safety.preflight.productionBaseline.cityDefinitionCount} cities / ${safety.preflight.productionBaseline.generatedActiveRegionCount} generated ACTIVE.`);
console.log(`Asset manifest: ${EXPECTED_ASSET_MANIFEST_HASH}.`);
