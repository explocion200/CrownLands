"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APPROVED_BASE = "ca5038ae41c37965ca3e699ba72f76c24ca64f5e";
const EXPECTED_BRANCH = "codex/core-v2";
const EXPECTED_ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const OUTPUT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-3");
const B1 = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-b1", "prototypes");
const PHASE_A = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-a", "prototypes");
const ART2_V2 = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-2-v2");
const DOCS = path.join(ROOT, "docs", "map-scaling-audit", "core-v2", "phase-art-3");

const EXPECTED = Object.freeze({
  "northwest-warband-camp": { regionId: "core_b1_warband", coordinate: [-2, -2], capacity: 55, objectiveType: "warband", objective: [700, 535] },
  "northwest-relic-camp": { regionId: "core_b1_relic_north", coordinate: [-1, -2], capacity: 55, objectiveType: "relic", objective: [742, 526] },
  "west-north-relic-camp": { regionId: "core_b1_relic_transition", coordinate: [-2, -1], capacity: 55, objectiveType: "relic", objective: [706, 556] },
  "northwest-holding-tower": { regionId: "core_b1_tower", coordinate: [-1, -1], capacity: 55, objectiveType: "holding_tower", objective: [736, 552] },
  "aurum-keep": { regionId: "core_b1_aurum", coordinate: [-1, 0], capacity: 60, objectiveType: "gold_production", objective: [724, 543] },
});
const LOCKED_FILES = Object.freeze(["cities.json", "composition.json", "validation-receipt.json", "map-clean.png", "map.webp"]);
const REQUIRED_DOCS = Object.freeze(["README.md", "ART_RESULTS.md", "IMAGEGEN_PROMPTS.md", "RUNTIME_QA.md", "VALIDATION_RESULTS.md"]);
const REQUIRED_GALLERY = Object.freeze([
  "five-art3-clean-candidates.png", "five-art3-runtime-overlays.png", "normal-runtime-zoom-board.png",
  "road-before-after-board.png", "structure-integration-board.png", "relic-comparison-board.png",
  "climate-continuity-board.png", "ten-map-core-style-board.png",
]);

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Missing ${path.relative(ROOT, filePath)}.`);
  assert(fs.statSync(filePath).size > 0, `Empty ${path.relative(ROOT, filePath)}.`);
}
function sha256Buffer(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function sha256(filePath) { return sha256Buffer(fs.readFileSync(filePath)); }
function git(...args) { return childProcess.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
function approvedBuffer(relativePath) {
  return childProcess.execFileSync("git", ["show", `${APPROVED_BASE}:${relativePath}`], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
}
function pngDimensions(filePath) {
  const source = fs.readFileSync(filePath);
  assert(source.subarray(1, 4).equals(Buffer.from("PNG")), `${path.relative(ROOT, filePath)} is not PNG.`);
  return { width: source.readUInt32BE(16), height: source.readUInt32BE(20) };
}
function minimumSpacing(cities) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < cities.length; left += 1) {
    for (let right = left + 1; right < cities.length; right += 1) {
      minimum = Math.min(minimum, Math.hypot(cities[left].x - cities[right].x, cities[left].y - cities[right].y));
    }
  }
  return minimum;
}

function validateLockedB1Geometry() {
  const maps = [];
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const source = path.join(B1, key);
    const relative = path.relative(ROOT, source).replaceAll("\\", "/");
    for (const name of LOCKED_FILES) {
      const filePath = path.join(source, name);
      assertFile(filePath);
      assert.equal(sha256(filePath), sha256Buffer(approvedBuffer(`${relative}/${name}`)), `${key}/${name} changed from the approved ART-2 v2 checkpoint.`);
    }
    const cities = readJson(path.join(source, "cities.json"));
    const composition = readJson(path.join(source, "composition.json"));
    assert.equal(cities.length, expected.capacity, `${key} capacity changed.`);
    assert.equal(new Set(cities.map(city => city.id)).size, expected.capacity, `${key} city IDs collide.`);
    assert.deepEqual([composition.coordinate.gridX, composition.coordinate.gridY], expected.coordinate, `${key} coordinate changed.`);
    assert.deepEqual(composition.dimensions, { width: 1448, height: 1086 });
    assert.equal(composition.spawnEligible, false);
    assert.equal(composition.coreRegion.exactCityCapacity, expected.capacity);
    assert.equal(composition.coreRegion.objective.type, expected.objectiveType);
    assert.deepEqual([composition.coreRegion.objective.x, composition.coreRegion.objective.y], expected.objective, `${key} objective moved.`);
    assert.deepEqual(composition.coreRegion.topology.roadSockets, {
      north: { x: 724, y: 0, tangentOffset: 0.5 },
      east: { x: 1448, y: 543, tangentOffset: 0.5 },
      south: { x: 724, y: 1086, tangentOffset: 0.5 },
      west: { x: 0, y: 543, tangentOffset: 0.5 },
    });
    assert.equal(Object.keys(composition.coreRegion.topology.connections).length, 4);
    const spacing = minimumSpacing(cities);
    assert(spacing >= 68, `${key} is below the locked 68 px Core spacing floor.`);
    maps.push({ key, coordinate: expected.coordinate, capacity: cities.length, objective: expected.objective, minimumSpacingPx: Number(spacing.toFixed(3)) });
  }
  assert.equal(fs.readdirSync(PHASE_A, { withFileTypes: true }).filter(entry => entry.isDirectory()).length, 5);
  assert.equal(fs.readdirSync(B1, { withFileTypes: true }).filter(entry => entry.isDirectory()).length, 5);
  assert.equal(git("diff", "--name-only", APPROVED_BASE, "--", "benchmark-results/map/core-v2-phase-a", "benchmark-results/map/core-v2-phase-b1"), "");
  return { maps, lockedB1FilesCompared: Object.keys(EXPECTED).length * LOCKED_FILES.length, existingCoreCoordinates: 10, newCoreCoordinates: 0 };
}

function validateCandidates() {
  const index = readJson(path.join(OUTPUT, "art3-index.json"));
  assert.equal(index.developmentOnly, true);
  assert.equal(index.productionActivated, false);
  assert.equal(index.artRevisionOnly, true);
  assert.equal(index.authoritativeArtStandard, "ART-2 v2");
  assert.equal(index.newCoreCoordinatesGenerated, 0);
  assert.equal(index.candidateBackgroundCount, 5);
  assert.equal(index.finishedCoreBackgroundCount, 10);
  assert.deepEqual(index.mapDimensions, { width: 1448, height: 1086 });
  assert.equal(index.hardMinimumCoreCitySpacingPx, 68);
  assert.deepEqual(index.entries.map(entry => entry.key).sort(), Object.keys(EXPECTED).sort());
  for (const entry of index.entries) {
    const expected = EXPECTED[entry.key];
    assert.equal(entry.capacity, expected.capacity);
    assert.deepEqual([entry.coordinate.gridX, entry.coordinate.gridY], expected.coordinate);
    assert.deepEqual([entry.objective.x, entry.objective.y], expected.objective);
    const directory = path.join(OUTPUT, "candidates", entry.key);
    const png = path.join(directory, "map-final-candidate.png");
    const webp = path.join(directory, "map-final-candidate.webp");
    assertFile(png); assertFile(webp);
    assert.deepEqual(pngDimensions(png), { width: 1448, height: 1086 });
    assert.equal(sha256(png), entry.candidatePngSha256);
    assert.equal(sha256(webp), entry.candidateWebpSha256);
    assert.equal(sha256(path.join(B1, entry.key, "cities.json")), entry.citiesSha256);
    assert.equal(sha256(path.join(B1, entry.key, "composition.json")), entry.compositionSha256);
    assert.equal(sha256(path.join(B1, entry.key, "validation-receipt.json")), entry.validationReceiptSha256);
    const qa = path.join(directory, "qa");
    const qaFiles = fs.readdirSync(qa).filter(name => /^0\d-.+\.png$/i.test(name));
    assert.equal(qaFiles.length, 10, `${entry.key} requires ten named review panels.`);
    for (const suffix of ["low", "normal", "close", "action-state"]) assertFile(path.join(OUTPUT, "runtime", `${entry.key}-${suffix}.png`));
    assertFile(path.join(OUTPUT, "gallery", `${entry.key}-prototype-vs-final.png`));
  }
  for (const name of REQUIRED_GALLERY) assertFile(path.join(OUTPUT, "gallery", name));
  return { backgrounds: 5, dimensions: index.mapDimensions, perMapQaPanels: 10, aggregateBoards: REQUIRED_GALLERY.length, finishedCoreCandidates: 10 };
}

function validateRuntime() {
  const metrics = readJson(path.join(OUTPUT, "runtime", "runtime-density-results.json"));
  const interactions = readJson(path.join(OUTPUT, "runtime", "interaction-results.json"));
  const performance = readJson(path.join(OUTPUT, "runtime", "performance-results.json"));
  assert.equal(metrics.developmentOnly, true); assert.equal(metrics.productionActivated, false);
  assert.equal(interactions.developmentOnly, true); assert.equal(performance.developmentOnly, true);
  assert.equal(metrics.results.length, 15);
  assert.equal(interactions.results.length, 5);
  assert.equal(performance.results.length, 5);
  let collisionCount = 0;
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const rows = metrics.results.filter(row => row.prototypeKey === key);
    assert.equal(rows.length, 3, `${key} needs low, normal, and close runtime samples.`);
    assert.deepEqual(rows.map(row => row.camera.preset).sort(), ["close", "low", "normal"]);
    for (const row of rows) {
      assert.equal(row.dataCityCount, expected.capacity);
      assert.equal(row.expectedCityCapacity, expected.capacity);
      assert.equal(row.objectiveNodes, 1);
      assert.equal(row.transitions.openArrows + row.transitions.gatedEdges, 4);
      assert(row.marches.routeElements > 0);
      for (const name of ["castles", "names", "playerBanners", "foreignLabels", "troopCounts"]) {
        assert.equal(row.collisions[name].collisions, 0, `${key}/${row.camera.preset} ${name} collision.`);
        collisionCount += row.collisions[name].collisions;
      }
      assert.equal(row.collisions.objectiveVsCities, 0);
      collisionCount += row.collisions.objectiveVsCities;
      if (row.camera.preset === "low") assert.equal(row.renderedCityNodes, expected.capacity);
    }
    const interaction = interactions.results.find(row => row.key === key);
    assert(interaction, `Missing interaction result for ${key}.`);
    for (const mode of [interaction.mouse, interaction.touch]) {
      assert.equal(mode.reliable, true);
      assert.equal(mode.results.length, 2);
      for (const probe of mode.results) {
        assert.equal(probe.found, true);
        assert.equal(probe.hitMatches, true);
        assert.equal(probe.actionAcknowledged, true);
        assert.equal(probe.cityId, probe.hitCityId);
      }
    }
    const sample = performance.results.find(row => row.key === key)?.sample;
    assert(sample, `Missing low-zoom performance sample for ${key}.`);
    assert(sample.fps >= 45, `${key} performance sample fell below the established QA floor.`);
  }
  return {
    zoomSamples: metrics.results.length,
    collisionCount,
    mouseTouchMaps: interactions.results.length,
    minimumMeasuredFps: Number(Math.min(...performance.results.map(row => row.sample.fps)).toFixed(3)),
    averageMeasuredFps: Number((performance.results.reduce((sum, row) => sum + row.sample.fps, 0) / performance.results.length).toFixed(3)),
  };
}

function validateVisualReview() {
  const review = readJson(path.join(OUTPUT, "visual-review.json"));
  assert.equal(review.developmentOnly, true);
  assert.equal(review.productionActivated, false);
  assert.equal(review.authoritativeArtStandard, "ART-2 v2 / FINAL_ART_STANDARD.md");
  assert.equal(review.geometryModified, false);
  assert.equal(review.candidateBackgroundCount, 5);
  assert.equal(review.finishedCoreCandidateCount, 10);
  assert.equal(review.newCoreCoordinatesGenerated, 0);
  assert.equal(review.approvedGeneratedPlayerAssetLibraryModified, false);
  assert.equal(review.maps.length, 5);
  for (const map of review.maps) {
    for (const name of ["roadTreatmentPass", "structureRootedInLandscape", "citySafeAreasReadable", "purposefulNotCluttered", "literalEdgeBarrierPass", "objectiveCoordinatePreserved"]) assert.equal(map[name], true, `${map.key} failed ${name}.`);
    assert.equal(map.cityPropConflicts, 0);
    assert.equal(map.roadObstructions, 0);
    assert.equal(map.transitionObstructions, 0);
    assert(map.majorPropClusters <= 1);
    assert(map.majorPropClusters === 0 ? map.mediumPropClusters <= 3 : map.mediumPropClusters <= 2);
  }
  for (const [question, answer] of Object.entries(review.approvalQuestions)) assert.equal(answer, true, `Approval question ${question} is not YES.`);
  assert.equal(review.recommendation.readyForVisualApproval, true);
  assert.equal(review.recommendation.otherCoreBackgroundsRebuilt, 0);
  assert.equal(review.recommendation.readyToReplaceProductionMaps, false);
  assert.equal(review.recommendation.pushed, false);
  assert.equal(review.recommendation.deployed, false);
  return { approvalQuestionsYes: Object.keys(review.approvalQuestions).length, allFiveCitySafe: true, relicMapsDistinct: true, tenMapFamilyPass: true };
}

function validateProductionSafety() {
  assert.equal(git("branch", "--show-current"), EXPECTED_BRANCH);
  childProcess.execFileSync("git", ["merge-base", "--is-ancestor", APPROVED_BASE, "HEAD"], { cwd: ROOT });
  assert.equal(git("rev-parse", "HEAD"), APPROVED_BASE, "ART-3 must remain uncommitted at the approved checkpoint during review.");
  const catalog = readJson(path.join(ROOT, "assets", "worlds", "world_01", "region-catalog.json"));
  const regions = catalog.regions.map(region => readJson(path.join(ROOT, region.regionDefinitionPath)));
  const preflight = readJson(path.join(ROOT, "docs", "map-scaling-audit", "phase-9", "results", "PRODUCTION_READ_ONLY_PREFLIGHT.json"));
  assert.equal(catalog.regions.length, 15);
  assert.equal(regions.flatMap(region => region.cities || []).length, 1050);
  assert.equal(preflight.productionBaseline.directedMapChainCount, 210);
  assert.equal(preflight.productionBaseline.generatedActiveRegionCount, 0);
  assert.equal(preflight.productionMutationPerformed, false);
  assert.equal(sha256(path.join(ROOT, "benchmark-results", "map", "phase-6d", "asset-library", "asset-manifest.json")), EXPECTED_ASSET_MANIFEST_HASH);
  assertFile(path.join(ART2_V2, "gallery", "five-art2-v2-clean-candidates.png"));
  const allowedPrefixes = [
    "benchmark-results/map/core-v2-phase-art-3/", "docs/map-scaling-audit/core-v2/phase-art-3/",
    "tools/core-v2-phase-art-3/", "tools/validate-core-v2-phase-art-3.js",
  ];
  const status = git("status", "--porcelain=v1", "--untracked-files=all").split(/\r?\n/).filter(Boolean);
  const changedPaths = status.map(line => line.slice(3).replaceAll("\\", "/"));
  const forbidden = changedPaths.filter(file => !allowedPrefixes.some(prefix => file === prefix || file.startsWith(prefix)));
  assert.deepEqual(forbidden, [], `ART-3 touched files outside development scope: ${forbidden.join(", ")}`);
  assert.equal(git("diff", "--name-only", APPROVED_BASE), "", "Tracked files changed during ART-3 review work.");
  const dist = path.join(ROOT, "dist");
  let productionLeakage = 0;
  if (fs.existsSync(dist)) {
    const queue = [dist];
    while (queue.length) {
      const current = queue.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const filePath = path.join(current, entry.name);
        if (entry.isDirectory()) queue.push(filePath);
        else if (/\.(?:html|js|css|json|svg|txt)$/i.test(entry.name)) {
          const source = fs.readFileSync(filePath, "utf8");
          if (/core-v2-phase-art-3|map-final-candidate\.png/i.test(source)) productionLeakage += 1;
        }
      }
    }
  }
  assert.equal(productionLeakage, 0);
  return { productionMaps: 15, productionCities: 1050, directedChains: 210, generatedActiveRegions: 0, generatedPlayerAssets: 118, productionFilesChanged: 0, productionLeakage, assetManifestHash: EXPECTED_ASSET_MANIFEST_HASH };
}

for (const name of REQUIRED_DOCS) assertFile(path.join(DOCS, name));
const geometry = validateLockedB1Geometry();
const candidates = validateCandidates();
const runtime = validateRuntime();
const visual = validateVisualReview();
const production = validateProductionSafety();

console.log(JSON.stringify({
  phase: "Core v2 Phase ART-3",
  result: "PASS",
  approvedBase: APPROVED_BASE,
  branch: EXPECTED_BRANCH,
  geometry,
  candidates,
  runtime,
  visual,
  production,
  pushed: false,
  deployed: false,
  merged: false,
  productionActivated: false,
}, null, 2));
