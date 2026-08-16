"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { ROOT, MANIFEST_PATH } = require("./map-scaling-phase-6d/composer");
const { OUTPUT_ROOT } = require("./run-map-scaling-phase-6e");

const EXPECTED_ASSET_MANIFEST_SHA256 = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const EXPECTED_MAP_COUNT = 10000;

function readJson(filePath) {
  assert(fs.existsSync(filePath), `Missing required Phase 6E artifact: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function validateManifest(filePath) {
  const seenKeys = new Set();
  const seenRegionIds = new Set();
  let count = 0;
  const stream = fs.createReadStream(filePath, "utf8");
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    count += 1;
    assert.equal(record.index, count - 1, `${record.key} is out of deterministic index order.`);
    assert(!seenKeys.has(record.key), `Duplicate Phase 6E key ${record.key}.`);
    assert(!seenRegionIds.has(record.regionId), `Duplicate Phase 6E region ID ${record.regionId}.`);
    seenKeys.add(record.key);
    seenRegionIds.add(record.regionId);
    assert.equal(record.cityCount, 40, `${record.key} does not contain exactly 40 cities.`);
    assert.equal(record.startingCandidateCount, 4, `${record.key} does not contain exactly four starting candidates.`);
    assert.equal(record.cityPositions.length, 40, `${record.key} compact city positions drifted.`);
    assert(record.cityMetrics.minimumSpacing >= 112, `${record.key} violates 112 px minimum spacing.`);
    assert.equal(record.status, "standby", `${record.key} did not finish in STANDBY.`);
    assert.equal(record.retryCount, 0, `${record.key} unexpectedly required a retry.`);
    assert.equal(record.developmentOnly, true);
    assert.equal(record.productionActivated, false);
    assert.equal(record.publicationAllowed, false);
    assert.equal(record.activationAllowed, false);
    assert.equal(record.parity.valid, true, `${record.key} failed geometry/art parity.`);
    assert(Object.values(record.parity.edgeExitCounts).every(value => value === 1), `${record.key} does not have one exit per side.`);
    assert(Object.values(record.parity.perimeterSideCoverage).every(value => value >= 1), `${record.key} perimeter does not touch every edge.`);
    assert.equal(record.parity.roadSocketAligned, true, `${record.key} road socket drifted.`);
    assert.equal(record.raster.dimensions.width, 1448);
    assert.equal(record.raster.dimensions.height, 1086);
    assert.equal(record.raster.thumbnailDimensions.width, 320);
    assert.equal(record.raster.thumbnailDimensions.height, 240);
    assert(fs.existsSync(path.join(OUTPUT_ROOT, record.raster.mapPath)), `Missing WebP for ${record.key}.`);
    assert(fs.existsSync(path.join(OUTPUT_ROOT, record.raster.thumbnailPath)), `Missing thumbnail for ${record.key}.`);
  }
  assert.equal(count, EXPECTED_MAP_COUNT, "Phase 6E compact manifest must contain exactly 10,000 maps.");
  return count;
}

async function run() {
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.assetCount, 118, "The Phase 6E library drifted from 118 assets.");
  assert.equal(manifest.categoryCounts.foundation, 12);
  assert.equal(manifest.categoryCounts.perimeter_barrier + manifest.categoryCounts.perimeter_barrier_variant, 48);
  assert.equal(manifest.categoryCounts.internal_road_module, 8);
  assert.equal(sha256File(MANIFEST_PATH), EXPECTED_ASSET_MANIFEST_SHA256, "The approved Phase 6D asset manifest changed.");

  const results = readJson(path.join(OUTPUT_ROOT, "phase-6e-results.json"));
  const render = readJson(path.join(OUTPUT_ROOT, "render-index.json"));
  const determinism = readJson(path.join(OUTPUT_ROOT, "determinism-receipt.json"));
  const review = readJson(path.join(OUTPUT_ROOT, "visual-review-decision.json"));
  const count = await validateManifest(path.join(OUTPUT_ROOT, "compact-manifest.jsonl"));

  assert.equal(results.sample.totalMaps, EXPECTED_MAP_COUNT);
  assert.equal(results.sample.maximumLayer, 48);
  assert.equal(results.sample.finalLayer.generatedMapCount, 224);
  assert.equal(results.sample.finalLayer.complete, false);
  assert.equal(Object.values(results.sample.directionalDistribution).reduce((sum, value) => sum + value, 0), EXPECTED_MAP_COUNT);
  assert.equal(results.sample.clockwiseAllocationValid, true);
  assert.equal(render.sampleCount, EXPECTED_MAP_COUNT);
  assert.equal(fs.readdirSync(path.join(OUTPUT_ROOT, "runtime", "maps")).length, EXPECTED_MAP_COUNT);
  assert.equal(fs.readdirSync(path.join(OUTPUT_ROOT, "runtime", "thumbnails")).length, EXPECTED_MAP_COUNT);
  assert(!fs.existsSync(path.join(OUTPUT_ROOT, "staging")), "Temporary Phase 6E generation shards leaked into retained output.");

  for (const summary of Object.values(results.exactDuplicates)) {
    assert.equal(summary.unique, EXPECTED_MAP_COUNT, "An exact Phase 6E duplicate was found.");
    assert.equal(summary.duplicateGroupCount, 0, "An exact Phase 6E duplicate group was found.");
  }
  assert.equal(results.cityLayout.allExactlyForty, true);
  assert.equal(results.cityLayout.allExactlyFourStartingCandidates, true);
  assert.equal(results.cityLayout.uniqueLayouts, EXPECTED_MAP_COUNT);
  assert.equal(results.cityLayout.duplicateCityIdCount, 0);
  assert.equal(results.cityLayout.minimumSpacingPx, 112);
  assert.equal(results.generationReliability.mapsRequiringRetries, 0);
  assert.equal(results.generationReliability.totalRetries, 0);
  assert.equal(results.generationReliability.failures, 0);
  assert.equal(determinism.sampleCount, 62);
  assert.equal(determinism.allByteAndHashIdentical, true);
  assert.deepEqual(determinism.directionCoverage, ["east", "north", "south", "west"]);
  assert.equal(results.neighborCohesion.cardinalNeighborPairsTested, 19788);
  assert.equal(results.neighborCohesion.allReciprocalTopologyValid, true);
  assert.equal(results.neighborCohesion.allRoadSocketsAligned, true);
  assert.equal(results.themeTransitions.transitionPairsTested, 376);
  assert.equal(results.themeTransitions.qualityDecision, "PASS");
  assert.equal(results.gallery.randomMapCount, 50);
  assert.equal(results.gallery.mostSimilarPairCount, 25);
  assert.equal(results.gallery.themeSampleCountEach, 10);
  assert.equal(results.gallery.cityOverlayMapCount, 50);
  for (const galleryFile of results.gallery.files) {
    assert(fs.existsSync(path.join(OUTPUT_ROOT, "gallery", galleryFile)), `Missing QA gallery file ${galleryFile}.`);
  }

  assert.equal(review.current118AssetSystemSufficientFor10000Maps, false);
  assert.equal(review.visibleRepetitionAcceptableAtPlayerScale, false);
  assert.equal(review.approvedArtStylePreserved, true);
  assert.equal(review.minimumEvidenceBasedNextStep.additionalAssetsRequiredInitially, 0);
  assert.equal(review.minimumEvidenceBasedNextStep.productionIntegrationPlanningMayBegin, false);
  assert.equal(review.conditionalFallbackOnly.minimumAdditionalAssets.total, 4);
  assert.equal(review.noArtworkAddedDuringPhase6E, true);
  assert.equal(review.phase7MayBegin, false);

  const productionFiles = [
    "game.js", "world-config.js", "region-catalog.js", "base-cities.js",
    "firebase.json", "firestore.rules", "firestore.indexes.json",
    "functions/index.js", "functions/src",
  ];
  for (const relative of productionFiles) {
    const target = path.join(ROOT, relative);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) continue;
    const content = fs.readFileSync(target, "utf8").toLowerCase();
    assert(!content.includes("phase6e") && !content.includes("map-scaling-phase-6e"), `${relative} references development-only Phase 6E.`);
  }
  assert(!fs.existsSync(path.join(ROOT, "dist", "benchmark-results", "map", "phase-6e")));
  assert(!fs.existsSync(path.join(ROOT, "dist", "tools", "map-scaling-phase-6e")));

  console.log(`Phase 6E validation passed: ${count} development-only maps, zero exact duplicates/retries/failures, deterministic subset and 19,788 neighbor pairs valid; 10,000-map visual scale gate remains correctly rejected.`);
}

run().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
