"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { OUTPUT_ROOT, SAMPLE_SPECS } = require("./map-scaling-phase-6a/build-directional-slices");
const { classifyDirectionalTheme } = require("./map-scaling-phase-6a/directional-theme");

const ROOT = path.resolve(__dirname, "..");
const results = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "directional-results.json"), "utf8"));

function readPngHeader(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 29);
  assert.deepEqual([...header.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `Invalid PNG signature: ${filePath}`);
  assert.equal(header.toString("ascii", 12, 16), "IHDR");
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), bitDepth: header[24], colorType: header[25] };
}

assert.equal(results.phase, "6A-v3-directional");
assert.equal(results.developmentOnly, true);
assert.equal(results.publicationAllowed, false);
assert.equal(results.activationAllowed, false);
assert.equal(results.productionArtApproved, false);
assert.equal(results.fullAssetProductionAllowed, false);
assert.equal(results.samples.length, 4);
assert.deepEqual(results.samples.map(sample => sample.key).sort(), ["east", "north", "south", "west"]);
assert.deepEqual(readPngHeader(path.join(OUTPUT_ROOT, "directional-clean-contact-sheet.png")), { width: 1448, height: 1086, bitDepth: 8, colorType: 2 });
assert.deepEqual(readPngHeader(path.join(OUTPUT_ROOT, "directional-cities-contact-sheet.png")), { width: 1448, height: 1086, bitDepth: 8, colorType: 2 });

assert.equal(classifyDirectionalTheme(0, -3).id, "north_light_winter");
assert.equal(classifyDirectionalTheme(3, 0).id, "east_tropical");
assert.equal(classifyDirectionalTheme(0, 3).id, "south_dry_frontier");
assert.equal(classifyDirectionalTheme(-3, 0).id, "west_grassy");
assert.equal(classifyDirectionalTheme(4, -4).id, "north_light_winter");
assert.equal(classifyDirectionalTheme(-4, 4).id, "south_dry_frontier");

const globalCityIds = new Set();
for (const spec of SAMPLE_SPECS) {
  const sampleRoot = path.join(OUTPUT_ROOT, "samples", spec.key);
  const receipt = JSON.parse(fs.readFileSync(path.join(sampleRoot, "receipt.json"), "utf8"));
  const geometry = JSON.parse(fs.readFileSync(path.join(sampleRoot, "geometry.json"), "utf8"));
  const cities = JSON.parse(fs.readFileSync(path.join(sampleRoot, "cities.json"), "utf8"));
  const starts = JSON.parse(fs.readFileSync(path.join(sampleRoot, "starting-candidates.json"), "utf8"));
  const mapPath = path.join(ROOT, receipt.map.path);

  assert.equal(receipt.developmentOnly, true);
  assert.equal(receipt.publicationAllowed, false);
  assert.equal(receipt.activationAllowed, false);
  assert.equal(receipt.productionArtApproved, false);
  assert.equal(receipt.theme.id, spec.themeId);
  assert.equal(classifyDirectionalTheme(spec.gridX, spec.gridY).id, spec.themeId);
  assert.equal(receipt.coordinate.gridX, spec.gridX);
  assert.equal(receipt.coordinate.gridY, spec.gridY);
  assert.equal(receipt.coordinate.worldLayer, 1);
  assert.equal(receipt.edgeBarrierTouchesImageBoundary, true);
  assert.equal(receipt.exactRoadPassages, 4);
  assert.equal(receipt.cityCount, 40);
  assert.equal(cities.length, 40);
  assert.equal(new Set(cities.map(city => city.id)).size, 40);
  assert(starts.length >= 2 && starts.length <= 4);
  assert.equal(geometry.developmentOnly, true);
  assert.equal(geometry.definition.purpose, "player_region");
  assert.equal(geometry.definition.permanentCore, false);
  assert.equal(geometry.validation.valid, true);
  assert.equal(geometry.definition.camps.length, 0);
  assert.equal(geometry.definition.strongholds.length, 0);
  assert.equal(geometry.definition.citadels.length, 0);
  assert(fs.existsSync(mapPath));
  assert.equal(fs.statSync(mapPath).size, receipt.map.bytes);
  assert.deepEqual(readPngHeader(mapPath), { width: 1448, height: 1086, bitDepth: 8, colorType: 2 });
  assert(Math.min(...cities.map(city => city.x)) >= 185);
  assert(Math.max(...cities.map(city => city.x)) <= 1263);
  assert(Math.min(...cities.map(city => city.y)) >= 185);
  assert(Math.max(...cities.map(city => city.y)) <= 901);
  assert(Object.entries(receipt.visualReview)
    .filter(([key]) => !["reviewer", "userApprovalPending", "notes"].includes(key))
    .every(([, value]) => value === true));
  assert.equal(receipt.visualReview.userApprovalPending, true);

  for (const city of cities) {
    assert(!globalCityIds.has(city.id), `Duplicate directional city ID ${city.id}.`);
    globalCityIds.add(city.id);
  }
  for (const required of [
    "index.html", "02-all-40-city-markers.png", "03-edge-north.png", "04-edge-east.png",
    "05-edge-south.png", "06-edge-west.png", "07-road-opening-north.png", "08-boundary-contact-proof.png",
  ]) assert(fs.existsSync(path.join(sampleRoot, "qa", required)), `Missing ${spec.key} QA file ${required}.`);
}

assert.equal(globalCityIds.size, 160);
const productionCatalog = require("../functions/region-catalog.json");
const productionWorld = require("../functions/world-layout.json");
assert.equal(productionCatalog.regions.length, 15);
assert.equal(productionWorld.maps.length, 15);
assert.equal(productionWorld.maps.flatMap(map => map.cities || []).length, 1050);

console.log("Phase 6A directional validation passed: 4 themes, 160 unique cities, edge-contact QA, development-only.");
