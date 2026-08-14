"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { allocateNextPlayerRegion } = require("./map-scaling-phase-4/generator");
const { getClockwiseRingCoordinates } = require("../region-catalog");
const { createPermanentCorePackage } = require("./map-scaling-phase-5/core-package");
const { createAllocatorCore } = require("./map-scaling-phase-5/fixtures");
const {
  ROOT, ASSET_ROOT, GENERATOR_VERSION, resolvePython, loadAssetManifest,
  composePlayerRegion, writeJson,
} = require("./map-scaling-phase-6b/composer");

const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6b");
const WORLD_ID = "phase6b_development_world";
const SEASON_ID = "phase6b_development_season";
const SAMPLE_SPECS = Object.freeze([
  Object.freeze({ key: "west-a", theme: "west", variant: "a", gridX: -3, gridY: 1 }),
  Object.freeze({ key: "west-b", theme: "west", variant: "b", gridX: -3, gridY: -1 }),
  Object.freeze({ key: "north-a", theme: "north", variant: "a", gridX: -1, gridY: -3 }),
  Object.freeze({ key: "north-b", theme: "north", variant: "b", gridX: 1, gridY: -3 }),
  Object.freeze({ key: "east-a", theme: "east", variant: "a", gridX: 3, gridY: -1 }),
  Object.freeze({ key: "east-b", theme: "east", variant: "b", gridX: 3, gridY: 1 }),
  Object.freeze({ key: "south-a", theme: "south", variant: "a", gridX: 1, gridY: 3 }),
  Object.freeze({ key: "south-b", theme: "south", variant: "b", gridX: -1, gridY: 3 }),
]);

function runPython(script, args = []) {
  const run = spawnSync(resolvePython(), [path.join(ROOT, script), ...args], {
    cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`${script} failed: ${run.stderr || run.stdout || `exit ${run.status}`}`);
  return String(run.stdout || "").trim();
}

function buildAssetLibrary() {
  return JSON.parse(runPython("tools/map-scaling-phase-6b/build_asset_library.py"));
}

function createAllocation(spec) {
  const core = createAllocatorCore(createPermanentCorePackage());
  const ring = getClockwiseRingCoordinates(1);
  const targetIndex = ring.findIndex(point => point.gridX === spec.gridX && point.gridY === spec.gridY);
  assert(targetIndex >= 0, `${spec.key} is not a Layer 1 coordinate.`);
  const prior = ring.slice(0, targetIndex).map((point, index) => ({
    id: `phase6b_${spec.key}_stub_${String(index + 1).padStart(2, "0")}`,
    name: `Phase 6B allocation stub ${index + 1}`,
    gridX: point.gridX, gridY: point.gridY,
    purpose: "player_region", permanentCore: false,
    lifecycle: "standby", spawnReady: false, spawnEligible: false,
  }));
  const existingRegions = [...core, ...prior];
  const allocation = allocateNextPlayerRegion({
    worldId: WORLD_ID, seasonId: SEASON_ID, existingRegions,
    regionId: `phase6b_${spec.key.replace(/-/g, "_")}_region`,
    generatorVersion: GENERATOR_VERSION,
  });
  assert.equal(allocation.coordinate.gridX, spec.gridX);
  assert.equal(allocation.coordinate.gridY, spec.gridY);
  return { allocation, existingRegions, priorStubCount: prior.length };
}

function run() {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const buildReceipt = buildAssetLibrary();
  const manifest = loadAssetManifest();
  const samples = [];
  for (const spec of SAMPLE_SPECS) {
    const { allocation, existingRegions, priorStubCount } = createAllocation(spec);
    const outputDirectory = path.join(OUTPUT_ROOT, "samples", spec.key);
    const result = composePlayerRegion({
      allocation, existingRegions,
      themeKey: spec.theme, variantKey: spec.variant,
      retrySalt: `${spec.key}-approved-style`,
      outputDirectory,
    });
    const summary = {
      key: spec.key,
      theme: spec.theme,
      variant: spec.variant,
      coordinate: allocation.coordinate,
      topology: allocation.connections,
      priorStubCount,
      status: result.receipt.lifecycle,
      valid: result.receipt.valid,
      cityCount: result.receipt.cityCount,
      startingCandidateCount: result.receipt.startingCandidateCount,
      planHash: result.receipt.planHash,
      cityHash: result.receipt.cityHash,
      mapHash: result.receipt.outputs.map.sha256,
      thumbnailHash: result.receipt.outputs.thumbnail.sha256,
      cleanPngHash: result.receipt.outputs.cleanPng.sha256,
      mapBytes: result.receipt.outputs.map.bytes,
      thumbnailBytes: result.receipt.outputs.thumbnail.bytes,
      assetUse: result.receipt.assetUse,
      deterministic: result.receipt.deterministic,
      parity: result.receipt.parity,
      timings: result.receipt.timings,
      developmentOnly: true,
      productionActivated: false,
    };
    writeJson(path.join(outputDirectory, "summary.json"), summary);
    samples.push(summary);
  }

  const pairChecks = {};
  for (const theme of ["west", "north", "east", "south"]) {
    const pair = samples.filter(sample => sample.theme === theme);
    pairChecks[theme] = {
      outputHashesDiffer: pair[0].mapHash !== pair[1].mapHash,
      cityHashesDiffer: pair[0].cityHash !== pair[1].cityHash,
      planHashesDiffer: pair[0].planHash !== pair[1].planHash,
      accentSelectionOrPlacementDiffers: JSON.stringify(pair[0].assetUse.accents) !== JSON.stringify(pair[1].assetUse.accents)
        || pair[0].planHash !== pair[1].planHash,
      sharedStyleFamily: manifest.themes[theme].id,
    };
  }
  const results = {
    schemaVersion: 1,
    phase: "6B",
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    activationAllowed: false,
    generatorVersion: GENERATOR_VERSION,
    assetLibraryVersion: manifest.assetLibraryVersion,
    approvedStyleSource: manifest.approvedStyleSource,
    buildReceipt,
    assetLibrary: {
      path: path.relative(ROOT, path.join(ASSET_ROOT, "asset-manifest.json")).replace(/\\/g, "/"),
      assetCount: manifest.assetCount,
      categoryCounts: manifest.categoryCounts,
      themeCounts: manifest.themeCounts,
    },
    sampleCount: samples.length,
    samples,
    pairChecks,
    acceptance: {
      exactTwoPerDirection: ["west", "north", "east", "south"].every(theme => samples.filter(sample => sample.theme === theme).length === 2),
      allExactlyFortyCities: samples.every(sample => sample.cityCount === 40),
      allStandbyAndInactive: samples.every(sample => sample.status === "STANDBY" && sample.developmentOnly && !sample.productionActivated),
      allDeterministic: samples.every(sample => Object.values(sample.deterministic).every(Boolean)),
      allGeometryArtParity: samples.every(sample => sample.parity.valid),
      allFourRoadOpenings: samples.every(sample => Object.values(sample.parity.edgeExitCounts).every(count => count === 1)),
      allBarriersTouchBoundary: samples.every(sample => sample.parity.barrierSegmentsTouchingBoundary === 8),
      allDirectionalPairsVary: Object.values(pairChecks).every(check => check.outputHashesDiffer && check.planHashesDiffer && check.accentSelectionOrPlacementDiffers),
    },
  };
  writeJson(path.join(OUTPUT_ROOT, "phase-6b-results.json"), results);
  runPython("tools/map-scaling-phase-6b/render_qa.py", ["--root", ROOT, "--results", path.join(OUTPUT_ROOT, "phase-6b-results.json")]);
  const qaReceipt = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, "qa-receipt.json"), "utf8"));
  results.qa = qaReceipt;
  writeJson(path.join(OUTPUT_ROOT, "phase-6b-results.json"), results);
  console.log(`Phase 6B generated ${samples.length} modular maps, ${samples.reduce((sum, sample) => sum + sample.cityCount, 0)} city positions, ${manifest.assetCount} reusable raster assets.`);
  return results;
}

if (require.main === module) run();

module.exports = Object.freeze({ OUTPUT_ROOT, SAMPLE_SPECS, WORLD_ID, SEASON_ID, createAllocation, run });
