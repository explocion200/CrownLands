"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  BATCH_COORDINATES,
  MIN_CITY_SEPARATION,
  NEAR_CENTER_LIMIT,
} = require("./core-v2-phase-b1/batch");
const { DELTAS, coordinateKey, buildCoreSpecification } = require("./core-v2-phase-a/spec");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-b1");
const APPROVED_BASE = "8909aeee24aa99ecb58851c41eccac36815b4a54";
const EXPECTED_ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const EXPECTED = Object.freeze({
  "-2,-2": Object.freeze({ key: "northwest-warband-camp", capacity: 55, mapType: "WARBAND_CAMP", policy: "near_center_camp" }),
  "-1,-2": Object.freeze({ key: "northwest-relic-camp", capacity: 55, mapType: "RELIC_CAMP", policy: "near_center_camp" }),
  "-2,-1": Object.freeze({ key: "west-north-relic-camp", capacity: 55, mapType: "RELIC_CAMP", policy: "near_center_camp" }),
  "-1,-1": Object.freeze({ key: "northwest-holding-tower", capacity: 55, mapType: "HOLDING_TOWER", policy: "near_center_reservation" }),
  "-1,0": Object.freeze({ key: "aurum-keep", capacity: 60, mapType: "STRONGHOLD", policy: "exact_center" }),
});

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Missing ${path.relative(ROOT, filePath)}.`);
  assert(fs.statSync(filePath).size > 0, `Empty ${path.relative(ROOT, filePath)}.`);
}

function validateBatch() {
  const index = readJson("benchmark-results/map/core-v2-phase-b1/batch-index.json");
  assert.equal(index.approvedBase, APPROVED_BASE);
  assert.equal(index.developmentOnly, true);
  assert.equal(index.productionActivated, false);
  assert.equal(index.publicationAllowed, false);
  assert.equal(index.exactBatchMapCount, 5);
  assert.equal(index.exactBatchCityCapacity, 280);
  assert.equal(index.exactCoreRegionCount, 25);
  assert.equal(index.exactCoreCityCapacity, 1480);
  const coordinates = index.prototypes.map(prototype => coordinateKey(prototype.coordinate.gridX, prototype.coordinate.gridY));
  assert.deepEqual(coordinates, BATCH_COORDINATES.map(coordinate => coordinateKey(coordinate.gridX, coordinate.gridY)));
  assert.equal(new Set(coordinates).size, 5);
  const directories = fs.readdirSync(path.join(OUTPUT, "prototypes"), { withFileTypes: true }).filter(entry => entry.isDirectory());
  assert.equal(directories.length, 5, "Phase B1 generated a map outside the approved five-map batch.");

  const allIds = [];
  const results = [];
  for (const prototype of index.prototypes) {
    const key = coordinateKey(prototype.coordinate.gridX, prototype.coordinate.gridY);
    const expected = EXPECTED[key];
    assert(expected, `Unexpected Phase B1 coordinate ${key}.`);
    assert.equal(prototype.key, expected.key);
    assert.equal(prototype.mapType, expected.mapType);
    assert.equal(prototype.exactCityCapacity, expected.capacity);
    const directory = path.join(ROOT, prototype.outputDirectory);
    const cities = readJson(path.relative(ROOT, path.join(directory, "cities.json")));
    const plan = readJson(path.relative(ROOT, path.join(directory, "composition.json")));
    const receipt = readJson(path.relative(ROOT, path.join(directory, "validation-receipt.json")));
    const render = readJson(path.relative(ROOT, path.join(directory, "render-receipt.json")));
    assert.equal(cities.length, expected.capacity);
    assert.equal(new Set(cities.map(city => city.id)).size, expected.capacity);
    allIds.push(...cities.map(city => city.id));
    assert.equal(receipt.validation.valid, true, receipt.validation.errors.join("; "));
    assert(receipt.validation.minimumSpacing >= MIN_CITY_SEPARATION);
    assert.equal(receipt.validation.cityObjectiveConflicts, 0);
    assert.equal(receipt.validation.cityRoadConflicts, 0);
    assert.equal(receipt.validation.cityBlockerConflicts, 0);
    assert.equal(receipt.validation.cityTransitionConflicts, 0);
    assert.equal(receipt.validation.propRuleCompliant, true);
    assert.equal(receipt.validation.objectivePlacement.policy, expected.policy);
    assert.equal(receipt.validation.objectivePlacement.valid, true);
    if (expected.policy === "exact_center") {
      assert.equal(plan.coreRegion.objective.x, 724);
      assert.equal(plan.coreRegion.objective.y, 543);
      assert.equal(receipt.validation.objectivePlacement.offset, 0);
    } else {
      assert(receipt.validation.objectivePlacement.offset <= NEAR_CENTER_LIMIT);
    }
    assert.equal(plan.permanentCore, true);
    assert.equal(plan.spawnEligible, false);
    assert.equal(plan.developmentOnly, true);
    assert.equal(plan.productionActivated, false);
    assert.equal(plan.publicationAllowed, false);
    assert.equal(plan.accents.length, 4);
    assert.equal(plan.roadSystem.edgeRoads.length, 4);
    assert.equal(new Set(plan.roadSystem.edgeRoads.map(road => road.side)).size, 4);
    assert.equal(receipt.validation.geometryArtParity.valid, true);
    assert.equal(render.map.width, 1448);
    assert.equal(render.map.height, 1086);
    assert.equal(render.map.mode, "RGB");
    assert.equal(render.map.opaque, true);
    assert.equal(render.thumbnail.width, 320);
    assert.equal(render.thumbnail.height, 240);
    for (const file of ["map-clean.png", "map.webp", "thumbnail.webp"]) assertFile(path.join(directory, file));
    for (let number = 1; number <= 11; number += 1) {
      const prefix = String(number).padStart(2, "0");
      assert(fs.readdirSync(path.join(directory, "qa")).some(file => file.startsWith(`${prefix}-`)), `${prototype.key} is missing QA ${prefix}.`);
    }
    for (const file of ["low.png", "normal.png", "close.png", "action-state.png"]) assertFile(path.join(directory, "runtime", file));
    results.push({
      key: prototype.key,
      coordinate: key,
      capacity: cities.length,
      minimumSpacing: receipt.validation.minimumSpacing,
      objective: plan.coreRegion.objective,
      objectiveOffset: receipt.validation.objectivePlacement.offset,
      mapWebpSha256: render.map.sha256,
    });
  }
  assert.equal(new Set(allIds).size, 280, "Phase B1 contains duplicate city IDs across maps.");
  assert.equal(fs.readdirSync(path.join(ROOT, "benchmark-results/map/core-v2-phase-a/prototypes"), { withFileTypes: true }).filter(entry => entry.isDirectory()).length, 5);
  return { index, results };
}

function validateTopology(index) {
  const specification = buildCoreSpecification();
  const byId = new Map(specification.regions.map(region => [region.regionId, region]));
  let directedOpenConnections = 0;
  for (const prototype of index.prototypes) {
    const source = byId.get(prototype.regionId);
    assert(source);
    for (const [side, connection] of Object.entries(source.topology.connections)) {
      if (connection.state !== "OPEN") continue;
      directedOpenConnections += 1;
      const target = byId.get(connection.regionId);
      assert(target, `${prototype.name} ${side} has no target.`);
      const delta = DELTAS[side];
      assert.equal(target.coordinate.gridX, source.coordinate.gridX + delta.x);
      assert.equal(target.coordinate.gridY, source.coordinate.gridY + delta.y);
      assert.equal(target.topology.connections[delta.opposite].regionId, source.regionId);
      assert.equal(target.topology.connections[delta.opposite].state, "OPEN");
    }
  }
  const tower = specification.regions.find(region => coordinateKey(region.coordinate.gridX, region.coordinate.gridY) === "-1,-1");
  assert.equal(tower.topology.connections.east.regionId, specification.regions.find(region => coordinateKey(region.coordinate.gridX, region.coordinate.gridY) === "0,-1").regionId);
  assert.notEqual(tower.topology.connections.south.regionId, specification.regions.find(region => coordinateKey(region.coordinate.gridX, region.coordinate.gridY) === "-1,1").regionId);
  return { directedOpenConnections, reciprocal: true, cardinalOnly: true };
}

function validateClimateAndDifferentiation(index) {
  const northernRelic = index.prototypes.find(prototype => prototype.key === "northwest-relic-camp");
  const transitionalRelic = index.prototypes.find(prototype => prototype.key === "west-north-relic-camp");
  assert.notEqual(northernRelic.compositionPlanHash, transitionalRelic.compositionPlanHash);
  assert.notEqual(northernRelic.cleanMapSha256, transitionalRelic.cleanMapSha256);
  assert.notEqual(northernRelic.profile.themeKey, transitionalRelic.profile.themeKey);
  assert.notEqual(northernRelic.profile.roadGeometryId, transitionalRelic.profile.roadGeometryId);
  assert.equal(transitionalRelic.profile.accentThemeKey, "north");
  const transitionCoordinates = new Set(index.prototypes.filter(prototype => prototype.profile.transitionSides.length > 0)
    .map(prototype => coordinateKey(prototype.coordinate.gridX, prototype.coordinate.gridY)));
  for (const key of ["-2,-2", "-1,-2", "-2,-1", "-1,-1"]) assert(transitionCoordinates.has(key));
  const expectedSharedEdges = {
    "-2,-1": { north: "north" },
    "-1,-1": { west: "west", south: "west" },
  };
  let sharedEdgeTreatments = 0;
  for (const [key, expectedSides] of Object.entries(expectedSharedEdges)) {
    const prototype = index.prototypes.find(entry => coordinateKey(entry.coordinate.gridX, entry.coordinate.gridY) === key);
    const plan = readJson(`${prototype.outputDirectory}/composition.json`);
    assert.equal(plan.handcraftedSharedEdgeTreatments.strategy, "neighbor-compatible-approved-edge-assets-v1");
    assert.equal(plan.handcraftedSharedEdgeTreatments.width, 96);
    for (const [side, edgeTheme] of Object.entries(expectedSides)) {
      const treatment = plan.handcraftedSharedEdgeTreatments.treatments.find(entry => entry.side === side);
      assert(treatment, `${key} is missing its ${side} shared edge treatment.`);
      assert.equal(treatment.edgeTheme, edgeTheme);
      assert.equal(treatment.createsNewArtwork, false);
      assert.equal(treatment.publishedSocketGeometryChanged, false);
      assert(treatment.barrierAssetIds.every(assetId => assetId.includes(`.${edgeTheme}.`)));
      assert(treatment.roadOpeningAssetId.includes(`.${edgeTheme}.`));
      sharedEdgeTreatments += 1;
    }
    for (const band of plan.transitionBands.filter(entry => entry.family === "core-v2-west-north")) {
      assert.equal(band.width, 96);
      assert(band.maximumStrength <= 0.24);
      assert.equal(band.narrowEdgeOnly, true);
    }
  }
  return {
    relicCompositionHashesDistinct: true,
    relicRasterHashesDistinct: true,
    westNorthTransitionProfiles: transitionCoordinates.size,
    sharedEdgeTreatments,
  };
}

function validateRuntime() {
  const runtime = readJson("benchmark-results/map/core-v2-phase-b1/runtime-density-results.json");
  assert.equal(runtime.developmentOnly, true);
  assert.equal(runtime.results.length, 15);
  const b1RegionIds = new Set(["core_b1_warband", "core_b1_relic_north", "core_b1_relic_transition", "core_b1_tower", "core_b1_aurum"]);
  for (const regionId of b1RegionIds) {
    const rows = runtime.results.filter(row => row.regionId === regionId);
    assert.equal(rows.length, 3);
    assert.deepEqual(new Set(rows.map(row => row.camera.preset)), new Set(["low", "normal", "close"]));
    for (const row of rows) {
      assert.equal(row.dataCityCount, row.expectedCityCapacity);
      assert.equal(row.collisions.castles.collisions, 0);
      assert.equal(row.collisions.names.collisions, 0);
      assert.equal(row.collisions.playerBanners.collisions, 0);
      assert.equal(row.collisions.foreignLabels.collisions, 0);
      assert.equal(row.collisions.troopCounts.collisions, 0);
      assert.equal(row.collisions.objectiveVsCities, 0);
      assert.equal(row.objectiveNodes, 1, `${regionId}:${row.camera.preset} is missing its objective/reservation overlay.`);
      assert.equal(row.transitions.openArrows + row.transitions.gatedEdges, 4);
      assert(row.marches.routeElements > 0);
    }
  }
  const interactions = readJson("benchmark-results/map/core-v2-phase-b1/interaction-results.json");
  assert.equal(interactions.results.length, 5);
  for (const row of interactions.results) {
    assert.equal(row.mouse.reliable, true);
    assert.equal(row.touch.reliable, true);
    assert.equal(row.mouse.results.length, 2);
    assert.equal(row.touch.results.length, 2);
    assert(row.mouse.results.every(result => result.hitMatches && result.actionAcknowledged));
    assert(row.touch.results.every(result => result.hitMatches && result.actionAcknowledged));
  }
  const performance = readJson("benchmark-results/map/core-v2-phase-b1/performance-results.json");
  assert.equal(performance.results.length, 6);
  for (const row of performance.results) {
    assert(Number.isFinite(row.sample.fps) && row.sample.fps > 0);
    assert(Number.isFinite(row.sample.p95FrameTimeMs) && row.sample.p95FrameTimeMs > 0);
    assert(Number.isFinite(row.sample.maximumFrameTimeMs) && row.sample.maximumFrameTimeMs > 0);
  }
  const mean = regionId => performance.results.filter(row => row.regionId === regionId).reduce((sum, row) => sum + row.sample.fps, 0) / 3;
  return { runtimeRows: 15, mouseProbes: 10, touchProbes: 10, aurumMeanFps: mean("core_b1_aurum"), citadelMeanFps: mean("core_b1_locked_citadel") };
}

function validateProductionSafety() {
  const catalog = readJson("assets/worlds/world_01/region-catalog.json");
  const regions = catalog.regions.map(region => readJson(region.regionDefinitionPath));
  const preflight = readJson("docs/map-scaling-audit/phase-9/results/PRODUCTION_READ_ONLY_PREFLIGHT.json");
  assert.equal(catalog.regions.length, 15);
  assert.equal(regions.flatMap(region => region.cities || []).length, 1050);
  assert.equal(preflight.productionBaseline.mapCount, 15);
  assert.equal(preflight.productionBaseline.cityDefinitionCount, 1050);
  assert.equal(preflight.productionBaseline.directedMapChainCount, 210);
  assert.equal(preflight.productionBaseline.generatedActiveRegionCount, 0);
  assert.equal(preflight.productionMutationPerformed, false);
  assert.equal(sha256(path.join(ROOT, "benchmark-results/map/phase-6d/asset-library/asset-manifest.json")), EXPECTED_ASSET_MANIFEST_HASH);
  const phaseAChanged = childProcess.execFileSync("git", ["diff", "--name-only", "HEAD", "--", "benchmark-results/map/core-v2-phase-a", "tools/core-v2-phase-a", "tools/core-v2-phase-a1"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(phaseAChanged, "", "Approved Phase A/A.1 files changed.");
  const status = childProcess.execFileSync("git", ["status", "--porcelain=v1"], { cwd: ROOT, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  const allowedPrefixes = [
    "benchmark-results/map/core-v2-phase-b1/",
    "docs/map-scaling-audit/core-v2/phase-b1/",
    "tools/core-v2-phase-b1/",
    "tools/run-core-v2-phase-b1.js",
    "tools/validate-core-v2-phase-b1.js",
  ];
  const changedPaths = status.map(line => line.slice(3).replaceAll("\\", "/"));
  const forbidden = changedPaths.filter(file => !allowedPrefixes.some(prefix => file === prefix || file.startsWith(prefix)));
  assert.deepEqual(forbidden, [], `Phase B1 touched files outside its development scope: ${forbidden.join(", ")}`);
  const dist = path.join(ROOT, "dist");
  if (fs.existsSync(dist)) {
    const queue = [dist];
    while (queue.length) {
      const current = queue.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const filePath = path.join(current, entry.name);
        if (entry.isDirectory()) queue.push(filePath);
        else if (/\.(?:html|js|css|json|svg|txt)$/i.test(entry.name)) {
          const source = fs.readFileSync(filePath, "utf8");
          assert(!/core-v2-phase-b1|core_b1_/i.test(source), `Phase B1 leaked into ${path.relative(ROOT, filePath)}.`);
        }
      }
    }
  }
  return { productionMaps: 15, productionCities: 1050, directedChains: 210, generatedActiveRegions: 0, assetManifestHash: EXPECTED_ASSET_MANIFEST_HASH };
}

const batch = validateBatch();
const topology = validateTopology(batch.index);
const climate = validateClimateAndDifferentiation(batch.index);
const runtime = validateRuntime();
const production = validateProductionSafety();
console.log(JSON.stringify({ phase: "Core v2 Phase B1", result: "PASS", maps: batch.results, topology, climate, runtime, production }, null, 2));
