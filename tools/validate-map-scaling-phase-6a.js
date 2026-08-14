"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { FUTURE_HOLDING_TOWER_COORDINATES } = require("./map-scaling-phase-5/core-package");
const { OUTPUT_ROOT } = require("./map-scaling-phase-6a/build-phase-6a");

const result = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "phase-6a-results.json"), "utf8"));
const geometry = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "phase-6a-geometry.json"), "utf8"));
const cities = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "cities.json"), "utf8"));
const starts = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "starting-candidates.json"), "utf8"));
const mapPath = path.resolve(__dirname, "..", result.map.path);

function readPngHeader(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 29);
  assert.deepEqual([...header.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Invalid PNG signature.");
  assert.equal(header.toString("ascii", 12, 16), "IHDR", "PNG is missing IHDR.");
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    bitDepth: header[24],
    colorType: header[25],
  };
}

assert.equal(result.developmentOnly, true);
assert.equal(result.publicationAllowed, false);
assert.equal(result.activationAllowed, false);
assert.equal(result.productionArtApproved, false);
assert.equal(result.phase, "6A-v2");
assert.equal(result.visualReview.userApprovalPending, true);
assert.equal(result.map.width, 1448);
assert.equal(result.map.height, 1086);
assert.equal(result.map.opaque, true);
assert(fs.existsSync(mapPath));
assert.equal(fs.statSync(mapPath).size, result.map.bytes);
assert.deepEqual(readPngHeader(mapPath), { width: 1448, height: 1086, bitDepth: 8, colorType: 2 });
assert.equal(cities.length, 40);
assert.equal(new Set(cities.map(city => city.id)).size, 40);
assert(starts.length >= 2);
assert.equal(result.exactCardinalRoadCorridors, 4);
assert.equal(result.edgeStatesBakedIntoMap, false);
assert.equal(result.objectivesBakedIntoMap, false);
assert.equal(geometry.definition.purpose, "player_region");
assert.equal(geometry.definition.permanentCore, false);
assert.equal(geometry.allocation.coordinate.worldLayer, 1);
assert.equal(geometry.validation.valid, true);
assert.equal(Math.min(...cities.map(city => city.x)), result.cityVisualAudit.minimumCenterX);
assert.equal(Math.max(...cities.map(city => city.x)), result.cityVisualAudit.maximumCenterX);
assert.equal(Math.min(...cities.map(city => city.y)), result.cityVisualAudit.minimumCenterY);
assert.equal(Math.max(...cities.map(city => city.y)), result.cityVisualAudit.maximumCenterY);
assert(result.cityVisualAudit.minimumCenterX >= 190);
assert(result.cityVisualAudit.maximumCenterX <= 1257);
assert(result.cityVisualAudit.minimumCenterY >= 195);
assert(result.cityVisualAudit.maximumCenterY <= 890);
assert.equal(result.cityVisualAudit.barrierOverlapFound, false);
assert.equal(result.cityVisualAudit.roadOrTransitionOverlapFound, false);
assert(Object.values(result.requiredApprovalQuestions).every(Boolean));
assert.deepEqual(FUTURE_HOLDING_TOWER_COORDINATES.map(({ gridX, gridY }) => [gridX, gridY]), [[-1, -1], [1, -1], [-1, 1], [1, 1]]);
assert(fs.existsSync(path.join(OUTPUT_ROOT, "qa", "index.html")));
for (const required of [
  "01-clean-map.svg", "02-all-40-cities.svg", "03-north-road-opening.svg", "04-east-road-opening.svg",
  "05-south-road-opening.svg", "06-west-road-opening.svg", "07-open-road-runtime-overlay.svg",
  "08-gated-road-runtime-overlay.svg", "09-closed-edge-no-road.svg", "10-current-assets-compatibility.svg",
]) assert(fs.existsSync(path.join(OUTPUT_ROOT, "qa", required)), `Missing Phase 6A QA view ${required}.`);
for (const required of [
  "02-all-40-city-markers.png", "03-north-edge-closeup.png", "04-east-edge-closeup.png",
  "05-south-edge-closeup.png", "06-west-edge-closeup.png", "07-north-road-opening.png",
  "08-east-road-opening.png", "09-south-road-opening.png", "10-west-road-opening.png",
  "11-closed-edge-without-road.png",
]) assert(fs.existsSync(path.join(OUTPUT_ROOT, "qa", required)), `Missing corrected Phase 6A QA PNG ${required}.`);
const productionCatalog = require("../functions/region-catalog.json");
const productionWorld = require("../functions/world-layout.json");
assert.equal(productionCatalog.regions.length, 15);
assert.equal(productionWorld.maps.length, 15);
assert.equal(productionWorld.maps.flatMap(map => map.cities || []).length, 1050);

console.log(`Phase 6A validation passed: ${cities.length} QA cities, ${starts.length} starting candidates, 4 cardinal passages, development-only.`);
