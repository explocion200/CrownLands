"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ROOT, MANIFEST_PATH } = require("./map-scaling-phase-6b/composer");
const { OUTPUT_ROOT, SAMPLE_COUNT } = require("./run-map-scaling-phase-6c");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const manifest = readJson(MANIFEST_PATH);
const resultsPath = path.join(OUTPUT_ROOT, "phase-6c-results.json");
const packageIndexPath = path.join(OUTPUT_ROOT, "packages-index.json");
const renderIndexPath = path.join(OUTPUT_ROOT, "render-index.json");
const analysisPath = path.join(OUTPUT_ROOT, "visual-analysis.json");
for (const required of [resultsPath, packageIndexPath, renderIndexPath, analysisPath]) {
  assert(fs.existsSync(required), `Missing Phase 6C artifact ${required}.`);
}
const results = readJson(resultsPath);
const packageIndex = readJson(packageIndexPath);
const renderIndex = readJson(renderIndexPath);
const analysis = readJson(analysisPath);

assert.equal(manifest.assetCount, 86);
assert.deepEqual(manifest.themeCounts, { west: 22, north: 21, east: 22, south: 21 });
assert.equal(results.phase, "6C");
assert.equal(results.developmentOnly, true);
assert.equal(results.productionActivated, false);
assert.equal(results.publicationAllowed, false);
assert.equal(results.activationAllowed, false);
assert.equal(results.approvedStyleLocked, true);
assert.equal(results.approvedAssetLibraryUnchanged, true);
assert.equal(results.sample.totalMaps, SAMPLE_COUNT);
assert.equal(packageIndex.sampleCount, SAMPLE_COUNT);
assert.equal(renderIndex.sampleCount, SAMPLE_COUNT);
assert.equal(packageIndex.records.length, SAMPLE_COUNT);
assert.equal(renderIndex.records.length, SAMPLE_COUNT);
assert.deepEqual(results.sample.themeDistribution, { east: 252, north: 280, south: 247, west: 221 });
assert.equal(results.sample.maximumLayer, 14);
assert.equal(results.neighborCohesion.completeLayerOneCount, 24);
assert.equal(results.neighborCohesion.completeLayerTwoCount, 32);
assert.equal(results.neighborCohesion.sequentialRun25Covered, true);
assert.equal(results.neighborCohesion.sequentialRun100Covered, true);
assert.equal(results.neighborCohesion.allRoadAnchorsAligned, true);
assert.equal(results.neighborCohesion.allEdgePackagesCompatible, true);
assert.deepEqual(results.neighborCohesion.themePairCounts, {
  "east-north": 27,
  "east-south": 26,
  "north-west": 25,
  "south-west": 25,
});

assert.equal(results.exactDuplicates.compositionPlans.unique, SAMPLE_COUNT);
assert.equal(results.exactDuplicates.losslessPngRasters.unique, SAMPLE_COUNT);
assert.equal(results.exactDuplicates.webpRasters.unique, SAMPLE_COUNT);
assert.equal(results.exactDuplicates.cityLayouts.unique, SAMPLE_COUNT);
assert.equal(results.exactDuplicates.fullPackages.unique, SAMPLE_COUNT);
assert.equal(results.exactDuplicates.roadLayouts.unique, 1);
assert.equal(results.exactDuplicates.roadPresentations.unique, 4);
assert.equal(results.foundationRepetition.unique, 8);
assert.equal(results.edgeRepetition.unique, 4);
assert.equal(results.decorationRepetition.accentPlans.unique, SAMPLE_COUNT);
assert.equal(results.nearDuplicates.method.version, "phase6c-multi-metric-v1");
assert.equal(results.nearDuplicates.method.sameThemePairsEvaluated, 125377);
assert(results.nearDuplicates.flaggedPairCount > 0);
assert.equal(results.nearDuplicates.mapsInFlaggedPairs, SAMPLE_COUNT);
assert.equal(results.mostSimilarPairs.length, 25);

const renderByKey = new Map(renderIndex.records.map(record => [record.key, record]));
const cityIds = new Set();
for (const record of packageIndex.records) {
  assert.equal(record.developmentOnly, true);
  assert.equal(record.productionActivated, false);
  assert.equal(record.publicationAllowed, false);
  assert.equal(record.activationAllowed, false);
  assert.equal(record.status, "standby");
  assert.equal(record.cityCount, 40);
  assert.equal(record.startingCandidateCount, 4);
  assert.equal(record.parity.valid, true);
  assert.equal(record.parity.barrierSegmentsTouchingBoundary, 8);
  assert.deepEqual(record.parity.edgeExitCounts, { north: 1, east: 1, south: 1, west: 1 });
  const packageRoot = path.join(OUTPUT_ROOT, record.packageDirectory);
  const plan = readJson(path.join(packageRoot, "composition.json"));
  const cities = readJson(path.join(packageRoot, "cities.json"));
  const starts = readJson(path.join(packageRoot, "starting-candidates.json"));
  const raster = renderByKey.get(record.key);
  assert(raster, `${record.key} is missing raster metrics.`);
  assert.equal(plan.developmentOnly, true);
  assert.equal(plan.productionActivated, false);
  assert.equal(plan.publicationAllowed, false);
  assert.equal(plan.barriers.length, 8);
  assert.equal(plan.roads.length, 4);
  assert.equal(plan.accents.length, 4);
  assert.equal(plan.gateSupport.bakedState, false);
  assert.equal(plan.gateSupport.runtimeOnly, true);
  assert(!JSON.stringify(plan.visualComposition).match(/city|camp|stronghold|citadel|arrow|label|ui/i));
  assert.equal(cities.length, 40);
  assert.equal(starts.length, 4);
  for (const city of cities) {
    assert(!cityIds.has(city.id), `Duplicate city ID ${city.id}.`);
    cityIds.add(city.id);
  }
  const mapPath = path.join(packageRoot, "map.webp");
  const thumbnailPath = path.join(packageRoot, "thumbnail.webp");
  assert(fs.existsSync(mapPath) && fs.existsSync(thumbnailPath));
  assert.equal(sha256File(mapPath), record.raster.webpHash);
  assert.equal(sha256File(thumbnailPath), record.raster.thumbnailHash);
  assert.deepEqual(record.raster.dimensions, { width: 1448, height: 1086 });
  assert.deepEqual(record.raster.thumbnailDimensions, { width: 320, height: 240 });
}
assert.equal(cityIds.size, 40000);
assert.equal(results.cityDistribution.allExactlyForty, true);
assert.equal(results.cityDistribution.allExactlyFourStartingCandidates, true);
assert.equal(results.cityDistribution.mapGenerationFailures, 0);
assert(results.cityDistribution.minimumSpacing.minimum >= 112);
assert.equal(results.performance.failureRate, 0);
assert(results.storage.mapWebpBytes.average > 0);
assert(results.storage.projectedMapAndThumbnailBytesFor10000 > results.storage.mapAndThumbnailBytesFor1000);

assert.equal(results.assetDecision.currentAssetCount, 86);
assert.equal(results.assetDecision.sufficientForOneThousandMaps, false);
assert.equal(results.assetDecision.reasonableForTenThousandMapsWithoutExpansion, false);
assert.deepEqual(results.assetDecision.minimumRecommendedAdditions, {
  foundations: 8,
  edgeSegments: 16,
  internalRoadModules: 8,
  interiorAccents: 0,
  resultingLibrarySize: 118,
});
assert(Object.values(results.acceptance).every(Boolean), JSON.stringify(results.acceptance));
assert.equal(analysis.gallery.randomMapCount, 25);
assert.equal(analysis.gallery.mostSimilarPairCount, 25);
for (const galleryFile of analysis.gallery.files) {
  assert(fs.existsSync(path.join(OUTPUT_ROOT, "gallery", galleryFile)), `Missing gallery ${galleryFile}.`);
}
assert(fs.existsSync(path.join(OUTPUT_ROOT, "gallery", "index.html")));

const productionWorld = require("../functions/world-layout.json");
const productionCatalog = require("../functions/region-catalog.json");
assert.equal(productionWorld.maps.length, 15);
assert.equal(productionWorld.maps.flatMap(map => map.cities || []).length, 1050);
assert.equal(productionCatalog.regions.length, 15);
for (const productionFile of ["functions/index.js", "index.html", "firebase.json"]) {
  const content = fs.readFileSync(path.join(ROOT, productionFile), "utf8");
  assert(!content.includes("phase6c") && !content.includes("map-scaling-phase-6c"));
}
assert(!fs.existsSync(path.join(ROOT, "dist", "benchmark-results", "map", "phase-6c")));
assert(!fs.existsSync(path.join(ROOT, "dist", "tools", "map-scaling-phase-6c")));

const phase6bDiff = execFileSync("git", [
  "diff", "--name-only", "HEAD", "--",
  "benchmark-results/map/phase-6b/asset-library",
  "tools/map-scaling-phase-6b",
], { cwd: ROOT, encoding: "utf8" }).trim();
assert.equal(phase6bDiff, "", `Phase 6C changed the locked Phase 6B library:\n${phase6bDiff}`);
const productionDiff = execFileSync("git", [
  "diff", "--name-only", "HEAD", "--",
  "functions", "assets", "index.html", "firebase.json", "game.js", "firebaseClient.js", "region-catalog.js",
], { cwd: ROOT, encoding: "utf8" }).trim();
assert.equal(productionDiff, "", `Phase 6C changed production files:\n${productionDiff}`);

console.log("Phase 6C validation passed: 1,000 development-only maps, 40,000 unique cities, zero exact final-map duplicates, repetition correctly blocks production readiness.");
