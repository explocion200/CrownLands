"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PLAYER_REGION_CITY_CAPACITY, MINIMUM_NPC_CITIES_FOR_SPAWN } = require("../functions/player-region-spawn");
const { ROOT, MANIFEST_PATH, GENERATOR_VERSION } = require("./map-scaling-phase-6b/composer");
const { OUTPUT_ROOT, SAMPLE_SPECS } = require("./run-map-scaling-phase-6b");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function pngDimensions(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 29);
  assert.deepEqual([...header.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `Invalid PNG ${filePath}`);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), bitDepth: header[24], colorType: header[25] };
}

assert(fs.existsSync(MANIFEST_PATH), "Missing Phase 6B asset manifest.");
assert(fs.existsSync(path.join(OUTPUT_ROOT, "phase-6b-results.json")), "Missing Phase 6B results.");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const results = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "phase-6b-results.json"), "utf8"));

assert.equal(manifest.assetLibraryVersion, "phase6b-modular-crownlands-v1");
assert.equal(manifest.developmentOnly, true);
assert.equal(manifest.productionQualityCandidate, true);
assert.equal(manifest.productionActivated, false);
assert.equal(manifest.assetCount, 86);
assert.deepEqual(manifest.themeCounts, { west: 22, north: 21, east: 22, south: 21 });
assert.equal(manifest.categoryCounts.foundation, 4);
assert.equal(manifest.categoryCounts.perimeter_barrier, 32);
assert.equal(manifest.categoryCounts.road_opening, 16);
assert.equal(manifest.categoryCounts.mixed_edge_variant, 8);
assert.equal(Object.entries(manifest.categoryCounts)
  .filter(([category]) => !["foundation", "perimeter_barrier", "road_opening", "mixed_edge_variant"].includes(category))
  .reduce((sum, [, count]) => sum + count, 0), 26);
assert.deepEqual(Object.keys(manifest.themes).sort(), ["east", "north", "south", "west"]);

const assetIds = new Set();
for (const asset of manifest.assets) {
  assert(!assetIds.has(asset.assetId), `Duplicate asset ID ${asset.assetId}.`);
  assetIds.add(asset.assetId);
  const absolute = path.join(ROOT, asset.path);
  assert(fs.existsSync(absolute), `Missing asset ${asset.path}.`);
  assert.equal(fs.statSync(absolute).size, asset.bytes, `${asset.assetId} byte count drifted.`);
  assert.equal(sha256File(absolute), asset.sha256, `${asset.assetId} hash drifted.`);
  assert.equal(asset.productionQualityCandidate, true);
  assert.equal(asset.productionActivated, false);
  assert(asset.path.replace(/\\/g, "/").startsWith("benchmark-results/map/phase-6b/asset-library/"));
}
assert.equal(assetIds.size, 86);
assert(manifest.assets.filter(asset => asset.category === "perimeter_barrier").every(asset => asset.touchesImageBoundary === true));
for (const theme of Object.keys(manifest.themes)) {
  assert.equal(manifest.assets.filter(asset => asset.theme === theme && asset.category === "road_opening").length, 4);
  assert.equal(manifest.assets.filter(asset => asset.theme === theme && asset.category === "perimeter_barrier").length, 8);
  assert.equal(sha256File(path.join(ROOT, manifest.themes[theme].approvedMaster)), manifest.themes[theme].approvedMasterSha256);
}

assert.equal(results.phase, "6B");
assert.equal(results.generatorVersion, GENERATOR_VERSION);
assert.equal(results.developmentOnly, true);
assert.equal(results.productionActivated, false);
assert.equal(results.publicationAllowed, false);
assert.equal(results.activationAllowed, false);
assert.equal(results.sampleCount, 8);
assert.equal(SAMPLE_SPECS.length, 8);
assert.equal(PLAYER_REGION_CITY_CAPACITY, 40);
assert.equal(MINIMUM_NPC_CITIES_FOR_SPAWN, 15);
assert(Object.values(results.acceptance).every(Boolean), `Acceptance failure: ${JSON.stringify(results.acceptance)}`);
assert(Object.values(results.pairChecks).every(check => check.outputHashesDiffer && check.cityHashesDiffer && check.planHashesDiffer && check.accentSelectionOrPlacementDiffers));

const globalCityIds = new Set();
for (const sample of results.samples) {
  const sampleRoot = path.join(OUTPUT_ROOT, "samples", sample.key);
  const plan = JSON.parse(fs.readFileSync(path.join(sampleRoot, "composition.json"), "utf8"));
  const cities = JSON.parse(fs.readFileSync(path.join(sampleRoot, "cities.json"), "utf8"));
  const starts = JSON.parse(fs.readFileSync(path.join(sampleRoot, "starting-candidates.json"), "utf8"));
  const receipt = JSON.parse(fs.readFileSync(path.join(sampleRoot, "receipt.json"), "utf8"));
  assert.equal(sample.status, "STANDBY");
  assert.equal(sample.valid, true);
  assert.equal(sample.cityCount, 40);
  assert.equal(cities.length, 40);
  assert(starts.length >= 2 && starts.length <= 4);
  assert.equal(new Set(cities.map(city => city.id)).size, 40);
  assert.equal(plan.developmentOnly, true);
  assert.equal(plan.productionActivated, false);
  assert.equal(plan.publicationAllowed, false);
  assert.equal(plan.barriers.length, 8);
  assert.equal(plan.roads.length, 4);
  assert.equal(plan.accents.length, 4);
  assert.equal(plan.gateSupport.bakedState, false);
  assert.equal(plan.gateSupport.runtimeOnly, true);
  assert.equal(receipt.minimumNpcCitiesForSpawn, 15);
  assert.equal(receipt.cityCapacity, 40);
  assert.equal(receipt.valid, true);
  assert(Object.values(receipt.deterministic).every(Boolean));
  assert.equal(receipt.parity.valid, true);
  assert.deepEqual(receipt.parity.edgeExitCounts, { north: 1, east: 1, south: 1, west: 1 });
  assert.equal(receipt.parity.barrierSegmentsTouchingBoundary, 8);
  assert.deepEqual(pngDimensions(path.join(sampleRoot, "map-clean.png")), { width: 1448, height: 1086, bitDepth: 8, colorType: 2 });
  assert(receipt.outputs.map.bytes > 0 && receipt.outputs.map.bytes <= 1024 * 1024);
  assert(receipt.outputs.thumbnail.bytes > 0 && receipt.outputs.thumbnail.bytes <= 200 * 1024);
  assert.equal(sha256File(path.join(sampleRoot, "map.webp")), sample.mapHash);
  assert.equal(sha256File(path.join(sampleRoot, "thumbnail.webp")), sample.thumbnailHash);
  for (const city of cities) {
    assert(!globalCityIds.has(city.id), `Duplicate city ID across samples: ${city.id}.`);
    globalCityIds.add(city.id);
  }
  const qa = JSON.parse(fs.readFileSync(path.join(sampleRoot, "qa", "qa-receipt.json"), "utf8"));
  assert.equal(qa.allBarrierSidesTouchLiteralEdge, true);
  assert.equal(qa.cityCount, 40);
  assert.equal(qa.allCitiesOnAuthoritativelyValidTerrain, true);
  assert.equal(qa.simpleReadableDensity, true);
  assert.equal(qa.noBakedRuntimeObjects, true);
  assert.equal(qa.exactlyOneRoadOpeningPerSide, true);
  assert.equal(qa.geometryArtParity, true);
  assert.equal(qa.styleConsistency.themeAssetsOnly, true);
  assert.equal(qa.styleConsistency.paletteWithinLockedFamily, true);
  for (const required of [
    "map-with-40-cities.png", "style-compatibility.png", "boundary-contact-proof.png",
    ...["north", "east", "south", "west"].flatMap(side => [`edge-${side}.png`, `road-opening-${side}.png`]),
  ]) assert(fs.existsSync(path.join(sampleRoot, "qa", required)), `${sample.key} missing ${required}.`);
}
assert.equal(globalCityIds.size, 320);
assert.equal(results.qa.allBoundaryContactChecksPassed, true);
assert.equal(results.qa.allCityOverlaysExactlyForty, true);
assert.equal(results.qa.allSimpleReadableDensity, true);
assert.equal(results.qa.allRoadAndParityChecksPassed, true);
assert.equal(results.qa.allRuntimeObjectsExcludedFromCleanMaps, true);
assert.equal(results.qa.allStyleConsistencyChecksPassed, true);
assert.equal(results.qa.allRepeatedUseChecksPassed, true);
assert(Object.values(results.qa.repeatedUseChecks).every(check => check.pairMeanPixelDifference >= 2 && check.visuallyDistinct));

const productionWorld = require("../functions/world-layout.json");
const productionCatalog = require("../functions/region-catalog.json");
assert.equal(productionWorld.maps.length, 15);
assert.equal(productionWorld.maps.flatMap(map => map.cities || []).length, 1050);
assert.equal(productionCatalog.regions.length, 15);
const productionServer = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
const productionEntry = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
assert(!productionServer.includes("phase6b") && !productionServer.includes("map-scaling-phase-6b"));
assert(!productionEntry.includes("phase6b") && !productionEntry.includes("map-scaling-phase-6b"));
assert(!fs.existsSync(path.join(ROOT, "dist", "benchmark-results", "map", "phase-6b")));
assert(!fs.existsSync(path.join(ROOT, "dist", "tools", "map-scaling-phase-6b")));

const trackedDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "functions", "assets", "index.html", "firebase.json"], { cwd: ROOT, encoding: "utf8" }).trim();
assert.equal(trackedDiff, "", `Phase 6B changed tracked production files:\n${trackedDiff}`);

console.log("Phase 6B validation passed: 86 modular assets, 8 deterministic maps, 320 unique city positions, literal edge barriers, no production leakage.");
