"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APPROVED_BASE = "37655846585856eb0e5ad2ca20f709ae99da59bb";
const EXPECTED_BRANCH = "codex/core-v2";
const EXPECTED_ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const OUTPUT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-2-v2");
const ART2 = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-2");
const PHASE_A = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-a", "prototypes");
const PHASE_B1 = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-b1", "prototypes");
const DOCS = path.join(ROOT, "docs", "map-scaling-audit", "core-v2", "phase-art-2-v2");

const EXPECTED = Object.freeze({
  "crown-citadel": { coordinate: [0, 0], capacity: 60, objectiveType: "crown_citadel", objective: [724, 543] },
  ironwatch: { coordinate: [0, 1], capacity: 60, objectiveType: "defense", objective: [724, 543] },
  "southwest-holding-tower": { coordinate: [-1, 1], capacity: 55, objectiveType: "holding_tower", objective: [724, 543] },
  "west-south-deed-camp": { coordinate: [-2, 1], capacity: 60, objectiveType: "deed", objective: [724, 543] },
  "west-support": { coordinate: [-2, 0], capacity: 70, objectiveType: "none", objective: null },
});
const LOCKED_FILES = Object.freeze(["cities.json", "composition.json", "validation-receipt.json", "map-clean.png", "map.webp"]);
const REQUIRED_DOCS = Object.freeze(["README.md", "FINAL_ART_STANDARD.md", "ART_RESULTS.md", "ROAD_REVISION.md", "STRUCTURE_INTEGRATION.md", "IMAGEGEN_PROMPTS.md", "VALIDATION_RESULTS.md"]);

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Missing ${path.relative(ROOT, filePath)}.`);
  assert(fs.statSync(filePath).size > 0, `Empty ${path.relative(ROOT, filePath)}.`);
}
function sha256Buffer(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function sha256(filePath) { return sha256Buffer(fs.readFileSync(filePath)); }
function git(...args) { return childProcess.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
function approvedBuffer(relativePath) {
  return childProcess.execFileSync("git", ["show", `${APPROVED_BASE}:${relativePath}`], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
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

function validateLockedGeometry() {
  const results = [];
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const source = path.join(PHASE_A, key);
    const relative = path.relative(ROOT, source).replaceAll("\\", "/");
    for (const name of LOCKED_FILES) {
      const filePath = path.join(source, name);
      assertFile(filePath);
      assert.equal(sha256(filePath), sha256Buffer(approvedBuffer(`${relative}/${name}`)), `${key}/${name} changed from ART-1.`);
    }
    const cities = readJson(path.join(source, "cities.json"));
    const composition = readJson(path.join(source, "composition.json"));
    assert.equal(cities.length, expected.capacity, `${key} capacity changed.`);
    assert.equal(new Set(cities.map(city => city.id)).size, expected.capacity, `${key} city IDs changed or collide.`);
    assert.deepEqual([composition.coordinate.gridX, composition.coordinate.gridY], expected.coordinate, `${key} coordinate changed.`);
    assert.deepEqual(composition.dimensions, { width: 1448, height: 1086 });
    assert.equal(composition.coreRegion.exactCityCapacity, expected.capacity);
    assert.equal(composition.spawnEligible, false);
    assert.equal(composition.coreRegion.objective.type, expected.objectiveType);
    if (expected.objective) assert.deepEqual([composition.coreRegion.objective.x, composition.coreRegion.objective.y], expected.objective);
    assert.deepEqual(composition.coreRegion.topology.roadSockets, {
      north: { x: 724, y: 0, tangentOffset: 0.5 },
      east: { x: 1448, y: 543, tangentOffset: 0.5 },
      south: { x: 724, y: 1086, tangentOffset: 0.5 },
      west: { x: 0, y: 543, tangentOffset: 0.5 },
    });
    assert.equal(Object.keys(composition.coreRegion.topology.connections).length, 4);
    const spacing = minimumSpacing(cities);
    assert(spacing >= 68, `${key} is below the locked 68 px spacing floor.`);
    results.push({ key, capacity: cities.length, minimumSpacingPx: Number(spacing.toFixed(3)), objective: expected.objectiveType });
  }
  assert.equal(fs.readdirSync(PHASE_A, { withFileTypes: true }).filter(entry => entry.isDirectory()).length, 5);
  assert.equal(fs.readdirSync(PHASE_B1, { withFileTypes: true }).filter(entry => entry.isDirectory()).length, 5);
  assert.equal(git("diff", "--name-only", APPROVED_BASE, "--", "benchmark-results/map/core-v2-phase-a", "benchmark-results/map/core-v2-phase-b1"), "");
  return { maps: results, existingPrototypeCoordinates: 10, newCoreCoordinates: 0, lockedFilesComparedToArt1: 25 };
}

function validateCandidates() {
  const index = readJson(path.join(OUTPUT, "art2-v2-index.json"));
  const art2Index = readJson(path.join(ART2, "art2-index.json"));
  const art2Hashes = new Map(art2Index.entries.map(entry => [entry.key, entry.candidatePngSha256]));
  assert.equal(index.developmentOnly, true);
  assert.equal(index.productionActivated, false);
  assert.equal(index.artRevisionOnly, true);
  assert.equal(index.art2BaselineModified, false);
  assert.equal(index.newCoreCoordinatesGenerated, 0);
  assert.equal(index.candidateBackgroundCount, 5);
  assert.deepEqual(index.mapDimensions, { width: 1448, height: 1086 });
  assert.equal(index.hardMinimumCoreCitySpacingPx, 68);
  assert.deepEqual(index.entries.map(entry => entry.key).sort(), Object.keys(EXPECTED).sort());
  for (const entry of index.entries) {
    const expected = EXPECTED[entry.key];
    assert(expected, `Unexpected candidate ${entry.key}.`);
    assert.equal(entry.capacity, expected.capacity);
    assert.deepEqual([entry.coordinate.gridX, entry.coordinate.gridY], expected.coordinate);
    const art2Png = path.join(ART2, "candidates", entry.key, "map-final-candidate.png");
    assert.equal(sha256(art2Png), art2Hashes.get(entry.key), `${entry.key} ART-2 baseline changed.`);
    assert.equal(entry.art2BaselinePngSha256, art2Hashes.get(entry.key));
    const directory = path.join(OUTPUT, "candidates", entry.key);
    const png = path.join(directory, "map-final-candidate-v2.png");
    const webp = path.join(directory, "map-final-candidate-v2.webp");
    assertFile(png); assertFile(webp);
    assert.deepEqual(pngDimensions(png), { width: 1448, height: 1086 });
    assert.equal(sha256(png), entry.candidateV2PngSha256);
    assert.equal(sha256(webp), entry.candidateV2WebpSha256);
    const qaFiles = fs.readdirSync(path.join(directory, "qa")).filter(name => /\.png$/i.test(name));
    assert.equal(qaFiles.length, 11, `${entry.key} should have 11 named v2 QA panels.`);
  }
  for (const name of ["five-art2-v2-clean-candidates.png", "five-art2-v2-runtime-overlays.png", "road-before-after-board.png", "structure-integration-board.png", "normal-runtime-zoom-board.png"]) {
    assertFile(path.join(OUTPUT, "gallery", name));
  }
  return { backgrounds: 5, dimensions: index.mapDimensions, perMapQaPanels: 11, aggregateBoards: 5, art2BaselinesUnchanged: 5 };
}

function validateRuntime() {
  const metrics = readJson(path.join(OUTPUT, "runtime", "runtime-metrics.json")).metrics;
  const interactions = readJson(path.join(OUTPUT, "runtime", "interaction-results.json")).interactions;
  assert.equal(metrics.length, 15);
  assert.equal(interactions.length, 5);
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const rows = metrics.filter(row => row.qaMapKey === key);
    assert.equal(rows.length, 3, `${key} needs low, normal and close runtime samples.`);
    assert.deepEqual(rows.map(row => row.qaZoom).sort(), ["close", "low", "normal"]);
    for (const row of rows) {
      assert.equal(row.dataCityCount, expected.capacity);
      assert.equal(row.expectedCityCapacity, expected.capacity);
      assert.equal(row.objectiveNodes, expected.objectiveType === "none" ? 0 : 1);
      for (const keyName of ["castles", "names", "playerBanners", "foreignLabels", "troopCounts"]) assert.equal(row.collisions[keyName].collisions, 0);
      assert.equal(row.collisions.objectiveVsCities, 0);
      assert(row.marches.routeElements > 0);
      assert.equal(row.transitions.openArrows + row.transitions.gatedEdges, 4);
    }
    const result = interactions.find(row => row.map === key);
    assert(result, `Missing ${key} interaction receipt.`);
    for (const mode of [result.mouse, result.touch]) {
      assert.equal(mode.reliable, true);
      assert.equal(mode.results.length, 2);
      for (const probe of mode.results) {
        assert.equal(probe.found, true);
        assert.equal(probe.hitMatches, true);
        assert.equal(probe.actionAcknowledged, true);
        assert.equal(probe.cityId, probe.hitCityId);
      }
    }
    for (const suffix of ["low", "normal", "close", "action-state"]) assertFile(path.join(OUTPUT, "runtime", `${key}-${suffix}.png`));
  }
  return { zoomSamples: 15, collisionCount: 0, mouseTouchMaps: 5, routesPresent: true, actionStateScreenshots: 5 };
}

function validateVisualReview() {
  const review = readJson(path.join(OUTPUT, "visual-review.json"));
  const lock = readJson(path.join(OUTPUT, "final-art-standard-lock.json"));
  assert.equal(review.developmentOnly, true);
  assert.equal(review.reviewedAgainst, "ART-2 current candidate");
  assert.equal(review.authoritativeArtDirection, "ART-1");
  assert.equal(review.explicitApprovalReceived, true);
  assert.equal(review.authoritativeFinalCoreArtStandard, true);
  assert.equal(review.geometryModified, false);
  assert.equal(review.candidateBackgroundCount, 5);
  assert.equal(review.newCoreCoordinatesGenerated, 0);
  assert.equal(review.approvedGeneratedPlayerAssetLibraryModified, false);
  assert.equal(review.maps.length, 5);
  for (const map of review.maps) {
    for (const name of ["roadTreatmentPass", "structureRootedInLandscape", "corePrestigePass", "citySafeAreasReadable", "purposefulNotCluttered", "endGameHeartPass", "literalEdgeBarrierPass"]) assert.equal(map[name], true, `${map.key} failed ${name}.`);
    assert.equal(map.cityPropConflicts, 0);
    assert.equal(map.roadObstructions, 0);
    assert.equal(map.transitionObstructions, 0);
    assert(map.majorPropClusters <= 1);
    assert(map.majorPropClusters === 0 ? map.mediumPropClusters <= 3 : map.mediumPropClusters <= 2);
  }
  for (const value of Object.values(review.approvalQuestions)) assert.equal(value, true);
  assert.equal(review.recommendation.readyForVisualReview, true);
  assert.equal(review.recommendation.visualReviewApproved, true);
  assert.equal(review.recommendation.safeToScaleOnlyAfterExplicitApproval, true);
  assert.equal(review.recommendation.approvedForFutureB1ArtRebuild, true);
  assert.equal(review.recommendation.approvedToGenerateNewCoreCoordinates, false);
  assert.equal(review.recommendation.otherCoreBackgroundsRebuilt, 0);
  assert.equal(review.recommendation.readyToReplaceProductionMaps, false);
  assert.equal(review.recommendation.pushed, false);
  assert.equal(review.recommendation.deployed, false);
  assert.equal(lock.status, "APPROVED");
  assert.equal(lock.authoritativeFinalCoreArtStandard, true);
  assert.equal(lock.appliesToPermanentCoreMapCount, 25);
  assert.equal(lock.approvedFinalStyleBackgroundCount, 5);
  assert.equal(lock.unchangedB1BackgroundCount, 5);
  assert.equal(lock.newCoreCoordinatesGenerated, 0);
  assert.equal(lock.gameplayGeometryLocked.coreHardMinimumSpacingPx, 68);
  assert.equal(lock.gameplayGeometryLocked.corePreferredSpacingPx, 70);
  assert.equal(lock.gameplayGeometryLocked.outerGeneratedSpacingPx, 112);
  assert.equal(lock.nextPhase.name, "ART-3");
  assert.equal(lock.nextPhase.newCoreCoordinatesPermitted, false);
  assert.equal(lock.nextPhase.maps.length, 5);
  assert.equal(lock.productionActivated, false);
  assert.equal(lock.deployed, false);
  return { approvalQuestionsYes: Object.keys(review.approvalQuestions).length, allFiveCitySafe: true, propBudgetPass: true, authoritativeFinalCoreArtStandard: true, approvedFinalStyleMaps: 5, unchangedB1Maps: 5 };
}

function validateProductionSafety() {
  assert.equal(git("branch", "--show-current"), EXPECTED_BRANCH);
  childProcess.execFileSync("git", ["merge-base", "--is-ancestor", APPROVED_BASE, "HEAD"], { cwd: ROOT });
  const catalog = readJson(path.join(ROOT, "assets", "worlds", "world_01", "region-catalog.json"));
  const regions = catalog.regions.map(region => readJson(path.join(ROOT, region.regionDefinitionPath)));
  const preflight = readJson(path.join(ROOT, "docs", "map-scaling-audit", "phase-9", "results", "PRODUCTION_READ_ONLY_PREFLIGHT.json"));
  assert.equal(catalog.regions.length, 15);
  assert.equal(regions.flatMap(region => region.cities || []).length, 1050);
  assert.equal(preflight.productionBaseline.directedMapChainCount, 210);
  assert.equal(preflight.productionBaseline.generatedActiveRegionCount, 0);
  assert.equal(preflight.productionMutationPerformed, false);
  assert.equal(sha256(path.join(ROOT, "benchmark-results", "map", "phase-6d", "asset-library", "asset-manifest.json")), EXPECTED_ASSET_MANIFEST_HASH);
  const allowedPrefixes = [
    "benchmark-results/map/core-v2-phase-art-2/", "docs/map-scaling-audit/core-v2/phase-art-2/", "tools/core-v2-phase-art-2/", "tools/validate-core-v2-phase-art-2.js",
    "benchmark-results/map/core-v2-phase-art-2-v2/", "docs/map-scaling-audit/core-v2/phase-art-2-v2/", "tools/core-v2-phase-art-2-v2/", "tools/validate-core-v2-phase-art-2-v2.js",
  ];
  const status = git("status", "--porcelain=v1", "--untracked-files=all").split(/\r?\n/).filter(Boolean);
  const changedPaths = status.map(line => line.slice(3).replaceAll("\\", "/"));
  const forbidden = changedPaths.filter(file => !allowedPrefixes.some(prefix => file === prefix || file.startsWith(prefix)));
  assert.deepEqual(forbidden, [], `ART-2 v2 touched files outside development scope: ${forbidden.join(", ")}`);
  assert.deepEqual(git("diff", "--name-only", APPROVED_BASE).split(/\r?\n/).filter(Boolean), [], "Tracked files changed during ART-2 v2.");
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
          assert(!/core-v2-phase-art-2-v2|map-final-candidate-v2/i.test(source), `ART-2 v2 leaked into ${path.relative(ROOT, filePath)}.`);
        }
      }
    }
  }
  return { productionMaps: 15, productionCities: 1050, directedChains: 210, generatedActiveRegions: 0, productionFilesChanged: 0, productionLeakage: 0, generatedPlayerAssetManifestHash: EXPECTED_ASSET_MANIFEST_HASH };
}

for (const name of REQUIRED_DOCS) assertFile(path.join(DOCS, name));
const geometry = validateLockedGeometry();
const candidates = validateCandidates();
const runtime = validateRuntime();
const visual = validateVisualReview();
const production = validateProductionSafety();

console.log(JSON.stringify({
  phase: "Core v2 Phase ART-2 v2",
  result: "PASS",
  geometry,
  candidates,
  runtime,
  visual,
  documents: { count: REQUIRED_DOCS.length },
  production,
  readyForVisualReview: true,
  readyForAutomaticScaling: false,
  pushed: false,
  deployed: false
}, null, 2));
