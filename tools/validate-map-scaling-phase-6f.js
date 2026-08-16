"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const composer = require("./map-scaling-phase-6f/composer");

const ROOT = path.resolve(__dirname, "..");
const RESULTS_PATH = path.join(ROOT, "benchmark-results", "map", "phase-6f", "study", "phase-6f-results.json");
const REVIEW_PATH = path.join(ROOT, "benchmark-results", "map", "phase-6f", "study", "visual-review-decision.json");

function validateArchitecture() {
  const manifest = composer.loadAssetManifest();
  assert.equal(manifest.assetCount, 118, "Phase 6F may not add assets.");
  assert.equal(manifest.categoryCounts.foundation, 12);
  assert.equal(manifest.categoryCounts.internal_road_module, 8);
  assert.equal(manifest.categoryCounts.perimeter_barrier + manifest.categoryCounts.perimeter_barrier_variant, 48);
  for (const theme of ["north", "east", "south", "west"]) {
    for (const geometry of composer.ROAD_GEOMETRIES) {
      const allocation = {
        worldId: "phase6f-validator",
        seasonId: "phase6f-validator-season",
        regionId: `phase6f_validator_${theme}_${geometry.id}`,
        coordinate: { gridX: 3, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 0 },
      };
      const plan = composer.createArtworkPlan({
        allocation,
        themeKey: theme,
        variantKey: "a",
        retrySalt: "phase6f-validator",
        roadGeometryId: geometry.id,
      });
      const parity = composer.validateGeometryArtParity(plan);
      assert.equal(parity.valid, true, `${theme}/${geometry.id}: ${parity.errors.join(" ")}`);
      assert.equal(plan.roadGeometryId, geometry.id);
      assert.equal(plan.roadModule?.roadSkin?.themeKey || theme, theme);
      assert.equal(plan.publishedEdgeContracts.immutableAfterPublication, true);
      assert.equal(Object.keys(plan.publishedEdgeContracts.sides).length, 4);
    }
  }
}

function validateResults() {
  assert(fs.existsSync(RESULTS_PATH), "Missing Phase 6F benchmark results.");
  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  assert.equal(results.phase, "6F");
  assert.equal(results.sample.totalMaps, 10000);
  assert.equal(results.developmentOnly, true);
  assert.equal(results.productionActivated, false);
  assert.equal(results.publicationAllowed, false);
  assert.equal(results.activationAllowed, false);
  assert.equal(results.assetLibraryModified, false);
  assert.equal(results.roadScale.uniqueGeometryCount, 9);
  assert.equal(results.roadScale.allNineUsedInEveryTheme, true);
  assert.equal(results.roadScale.themeDoesNotExcludeGeometry, true);
  assert(results.roadScale.baselineGeometry.percentage <= 15);
  assert(results.roadScale.mostUsedGeometry.percentage <= 15);
  assert(results.comparisonToPhase6e.baselineRoad.phase6ePercentage === 32.93);
  assert(results.comparisonToPhase6e.baselineRoad.phase6fPercentage < 32.93);
  for (const summary of Object.values(results.exactDuplicates)) assert.equal(summary.duplicateMapCount, 0);
  assert.equal(results.cityLayout.allExactlyForty, true);
  assert.equal(results.cityLayout.allExactlyFourStartingCandidates, true);
  assert.equal(results.cityLayout.uniqueLayouts, 10000);
  assert.equal(results.cityLayout.duplicateCityIdCount, 0);
  assert(results.cityLayout.minimumSpacingPx >= 112);
  assert.equal(results.cityLayout.allTerrainBlockerRoadTransitionAndPerimeterChecksPass, true);
  assert.equal(results.generationReliability.mapsRequiringRetries, 0);
  assert.equal(results.generationReliability.failures, 0);
  assert.equal(results.determinism.allByteAndHashIdentical, true);
  assert.equal(results.publishedPackageImmutability.allByteAndHashIdentical, true);
  assert.equal(results.publishedPackageImmutability.laterNeighborsNeverRegeneratePublishedPackages, true);
  assert.equal(results.publishedPackageImmutability.futureNeighborsAdaptToPublishedContracts, true);
  assert.equal(results.publishedPackageImmutability.edgeContractFailures.length, 0);
  assert.equal(results.publishedPackageImmutability.inheritedEdgeContractFailures.length, 0);
  assert.equal(results.neighborCohesion.allReciprocalTopologyValid, true);
  assert.equal(results.neighborCohesion.allRoadSocketsAligned, true);
  assert.equal(results.neighborCohesion.perimeterCompatibilityPass, true);
  assert.equal(results.neighborCohesion.allOpenSidesHaveExplicitTargets, true);
  assert.equal(results.neighborCohesion.allGatedSidesHaveNoHiddenTarget, true);
  assert.equal(results.themeTransitions.qualityDecision, "PASS");
  assert.equal(results.gallery.mixedThemeMapCount, 100);
  assert.equal(results.gallery.themeMapCountEach, 100);
  assert.equal(results.gallery.crossThemeGeometryExamples, 36);
  assert.equal(results.gallery.allNineWithinOneTheme, true);
  assert.equal(results.gallery.mostSimilarPairCount, 25);
  assert.equal(results.gallery.nearestNeighborPairCount, 25);
  assert.equal(results.gallery.cityOverlayMapCount, 50);
  assert.equal(results.acceptance.locked118AssetLibrary, true);
  assert.equal(results.acceptance.allNineRoadGeometriesAcrossAllThemes, true);
  assert.equal(results.acceptance.baselineRoadConcentrationMateriallyReduced, true);
  assert.equal(results.acceptance.noExactFinalDuplicates, true);
  assert.equal(results.acceptance.allCityRulesPass, true);
  assert.equal(results.acceptance.zeroRetriesAndFailures, true);
  assert.equal(results.acceptance.deterministicRegenerationPass, true);
  assert.equal(results.acceptance.publishedPackageImmutabilityPass, true);
  assert.equal(results.acceptance.neighborCohesionPass, true);
  assert.equal(results.acceptance.transitionQualityPass, true);
  assert.equal(results.acceptance.allDevelopmentOnlyAndInactive, true);
  if (fs.existsSync(REVIEW_PATH)) {
    const review = JSON.parse(fs.readFileSync(REVIEW_PATH, "utf8"));
    assert.equal(review.phase, "6F");
    assert.equal(review.productionActivationAuthorized, false);
    assert.equal(review.deploymentAuthorized, false);
    assert.equal(review.assetLibraryModified, false);
  }
  return results;
}

validateArchitecture();
const results = validateResults();
console.log(
  `Phase 6F validation passed: ${results.sample.totalMaps} development-only maps, `
  + `baseline road ${results.roadScale.baselineGeometry.percentage}%, `
  + `immutability/topology/city/determinism gates valid; visual decision=${results.assetDecision.sufficientForTenThousandMaps ? "PASS" : "REVIEW REQUIRED"}.`,
);
