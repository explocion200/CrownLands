"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ROOT, MANIFEST_PATH } = require("./map-scaling-phase-6d/composer");
const { OUTPUT_ROOT, SAMPLE_COUNT } = require("./run-map-scaling-phase-6d");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const manifest = readJson(MANIFEST_PATH);
const baseManifestPath = path.join(ROOT, manifest.baseLibrary.manifest);
const resultsPath = path.join(OUTPUT_ROOT, "phase-6d-results.json");
const packageIndexPath = path.join(OUTPUT_ROOT, "packages-index.json");
const renderIndexPath = path.join(OUTPUT_ROOT, "render-index.json");
const analysisPath = path.join(OUTPUT_ROOT, "visual-analysis.json");
for (const required of [MANIFEST_PATH, baseManifestPath, resultsPath, packageIndexPath, renderIndexPath, analysisPath]) {
  assert(fs.existsSync(required), `Missing Phase 6D artifact ${required}.`);
}

const results = readJson(resultsPath);
const packageIndex = readJson(packageIndexPath);
const renderIndex = readJson(renderIndexPath);
const analysis = readJson(analysisPath);
const baseManifest = readJson(baseManifestPath);

assert.equal(baseManifest.assetCount, 86);
assert.equal(sha256File(baseManifestPath), manifest.baseLibrary.sha256);
assert.equal(manifest.baseLibrary.modified, false);
assert.equal(manifest.assetCount, 118);
assert.deepEqual(manifest.lockedExpansion, {
  foundations: 8,
  perimeterEdgeSegments: 16,
  internalRoadModules: 8,
  interiorAccents: 0,
});
assert.equal(manifest.categoryCounts.foundation, 12);
assert.equal(manifest.categoryCounts.perimeter_barrier_variant, 16);
assert.equal(manifest.categoryCounts.internal_road_module, 8);
assert.equal(manifest.newAssetIds.length, 32);
assert.equal(new Set(manifest.newAssetIds).size, 32);
const assetsById = new Map(manifest.assets.map(asset => [asset.assetId, asset]));
for (const assetId of manifest.newAssetIds) {
  const asset = assetsById.get(assetId);
  assert(asset, `Missing new asset ${assetId}.`);
  const assetPath = path.join(ROOT, asset.path);
  assert(fs.existsSync(assetPath), `Missing new asset file ${asset.path}.`);
  assert.equal(sha256File(assetPath), asset.sha256);
  assert.equal(asset.productionActivated, false);
}

assert.equal(results.phase, "6D");
assert.equal(results.developmentOnly, true);
assert.equal(results.productionActivated, false);
assert.equal(results.publicationAllowed, false);
assert.equal(results.activationAllowed, false);
assert.equal(results.approvedStyleLocked, true);
assert.equal(results.approvedPhase6bAssetLibraryUnchanged, true);
assert.equal(results.phase6dLockedExpansionApplied, true);
assert.equal(results.sample.totalMaps, SAMPLE_COUNT);
assert.equal(packageIndex.sampleCount, SAMPLE_COUNT);
assert.equal(renderIndex.sampleCount, SAMPLE_COUNT);
assert.equal(packageIndex.records.length, SAMPLE_COUNT);
assert.equal(renderIndex.records.length, SAMPLE_COUNT);
assert.deepEqual(results.sample.themeDistribution, { east: 252, north: 280, south: 247, west: 221 });
assert.equal(results.sample.maximumLayer, 14);

for (const summary of [
  results.exactDuplicates.compositionPlans,
  results.exactDuplicates.losslessPngRasters,
  results.exactDuplicates.webpRasters,
  results.exactDuplicates.cityLayouts,
  results.exactDuplicates.fullPackages,
]) {
  assert.equal(summary.unique, SAMPLE_COUNT);
  assert.equal(summary.duplicateGroupCount, 0);
}
assert.equal(results.exactDuplicates.roadLayouts.unique, 9);
assert.equal(results.roadRepetition.geometry.unique, 9);
assert.equal(results.roadRepetition.presentation.unique, 12);
assert.equal(results.foundationBaseRepetition.unique, 48);
assert.equal(results.foundationRepetition.unique, SAMPLE_COUNT);
assert.equal(results.edgeRepetition.unique, 64);
assert.equal(results.decorationRepetition.accentPlans.unique, SAMPLE_COUNT);

assert.equal(results.nearDuplicates.method.nearDuplicateThreshold, 0.965);
assert.equal(results.nearDuplicates.method.highSimilarityThreshold, 0.98);
assert.equal(results.nearDuplicates.method.sameThemePairsEvaluated, 125377);
assert(results.nearDuplicates.flaggedPairCount < 35849);
assert(results.nearDuplicates.highSimilarityPairCount < 5191);
assert(results.nearDuplicates.mapsInFlaggedPairs < 1000);
assert(results.nearDuplicates.maximumVisualSimilarity < 0.999471);
assert(results.comparisonToPhase6c.nearDuplicateReductionRate >= 0.95);
assert(results.comparisonToPhase6c.highSimilarityReductionRate >= 0.95);
assert(analysis.macroSimilarity.sameFoundationAsset.pairCount > 0);
assert(analysis.macroSimilarity.sameFoundationPresentation.pairCount > 0);
assert(analysis.macroSimilarity.samePerimeterCombination.pairCount > 0);
assert(analysis.macroSimilarity.sameRoadGeometry.pairCount > 0);
assert.equal(analysis.macroSimilarity.cornerRepetition.totalCornerPresentations, 4000);
assert(analysis.macroSimilarity.cornerRepetition.uniqueCornerSignatures >= 64);

assert.equal(results.neighborCohesion.completeLayerOneCount, 24);
assert.equal(results.neighborCohesion.completeLayerTwoCount, 32);
assert.equal(results.neighborCohesion.sequentialRun25Covered, true);
assert.equal(results.neighborCohesion.sequentialRun100Covered, true);
assert.equal(results.neighborCohesion.allRoadAnchorsAligned, true);
assert.equal(results.neighborCohesion.allEdgePackagesCompatible, true);
assert.equal(results.directionalTransitions.deterministicBlendProfileImplemented, true);
assert.equal(results.directionalTransitions.blendWidthPixels, 96);
assert.equal(results.directionalTransitions.maximumBlendStrength, 0.24);
assert.equal(results.directionalTransitions.transitionFamilies["east-north"].deterministicTransitionBandApplied, true);
assert.equal(results.directionalTransitions.transitionFamilies["north-west"].deterministicTransitionBandApplied, true);
assert.equal(results.directionalTransitions.transitionFamilies["east-south"].deterministicTransitionBandApplied, false);
assert.equal(results.directionalTransitions.transitionFamilies["south-west"].deterministicTransitionBandApplied, false);

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
  assert(record.generationAttempt <= record.boundedRetryLimit);
  assert(record.boundedRetryLimit <= 30);
  assert.equal(record.parity.valid, true);
  assert.equal(record.parity.roadSocketAligned, true);
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
  assert.equal(plan.accents.length, 4);
  assert.equal(plan.roadSystem.edgeRoads.length, 4);
  assert.equal(plan.gateSupport.bakedState, false);
  assert.equal(plan.gateSupport.runtimeOnly, true);
  assert(plan.transitionBands.every(band => band.width <= 96 && band.maximumStrength <= 0.24));
  assert(!JSON.stringify(plan.visualComposition).match(/city|camp|stronghold|citadel|arrow|label|ui/i));
  assert.equal(cities.length, 40);
  assert.equal(starts.length, 4);
  for (const city of cities) {
    assert(!cityIds.has(city.id), `Duplicate city ID ${city.id}.`);
    cityIds.add(city.id);
  }
  const mapPath = path.join(packageRoot, "map.webp");
  const thumbnailPath = path.join(packageRoot, "thumbnail.webp");
  assert.equal(sha256File(mapPath), record.raster.webpHash);
  assert.equal(sha256File(thumbnailPath), record.raster.thumbnailHash);
  assert.deepEqual(record.raster.dimensions, { width: 1448, height: 1086 });
  assert.deepEqual(record.raster.thumbnailDimensions, { width: 320, height: 240 });
}
assert.equal(cityIds.size, 40000);
assert.equal(results.cityDistribution.allExactlyForty, true);
assert.equal(results.cityDistribution.allExactlyFourStartingCandidates, true);
assert.equal(results.cityDistribution.cityLayoutUniqueness.unique, SAMPLE_COUNT);
assert(results.cityDistribution.minimumSpacing.minimum >= 112);
assert.equal(results.cityDistribution.mapGenerationFailures, 0);
assert.equal(results.cityDistribution.mapRetries, 0);
assert.equal(results.cityDistribution.mapsRequiringRetry, 0);
assert.equal(results.cityDistribution.boundedRetryLimit, 30);
assert.equal(results.performance.failureRate, 0);

assert.equal(results.assetDecision.currentAssetCount, 118);
assert.equal(results.assetDecision.sufficientForOneThousandMaps, true);
assert.equal(results.assetDecision.reasonableForTenThousandMapsWithoutExpansion, false);
assert.deepEqual(results.assetDecision.minimumAdditionalAssetsRecommended, {
  foundations: 0,
  edgeSegments: 0,
  internalRoadModules: 0,
  interiorAccents: 0,
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
  assert(!content.includes("phase6d") && !content.includes("map-scaling-phase-6d"));
}
assert(!fs.existsSync(path.join(ROOT, "dist", "benchmark-results", "map", "phase-6d")));
assert(!fs.existsSync(path.join(ROOT, "dist", "tools", "map-scaling-phase-6d")));

const phase6bDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "benchmark-results/map/phase-6b/asset-library", "tools/map-scaling-phase-6b"], { cwd: ROOT, encoding: "utf8" }).trim();
assert.equal(phase6bDiff, "", `Phase 6D changed the locked Phase 6B library:\n${phase6bDiff}`);
const productionDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "functions", "assets", "index.html", "firebase.json", "game.js", "firebaseClient.js", "region-catalog.js"], { cwd: ROOT, encoding: "utf8" }).trim();
assert.equal(productionDiff, "", `Phase 6D changed production files:\n${productionDiff}`);

console.log("Phase 6D validation passed: 118 assets, 1,000 development-only maps, 40,000 unique cities, zero exact final-map duplicates, materially lower repetition, and zero retries.");
