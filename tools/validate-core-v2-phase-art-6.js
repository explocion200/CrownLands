"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APPROVED_BASE = "47b2e81d11370554af57fb8098f31da24b345d4d";
const EXPECTED_BRANCH = "codex/core-v2";
const MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const OUTPUT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-6");
const DOCS = path.join(ROOT, "docs", "map-scaling-audit", "core-v2", "phase-art-6");
const SPEC = require("./core-v2-phase-a/spec");

const EXPECTED = Object.freeze({
  "southwest-gold-camp": { coordinate: [-2, 2], capacity: 55, mapType: "GOLD_CAMP", objective: ["gold", 706, 555] },
  "south-deed-camp": { coordinate: [-1, 2], capacity: 60, mapType: "DEED_CAMP", objective: ["deed", 708, 553] },
  "south-support": { coordinate: [0, 2], capacity: 70, mapType: "SUPPORT", objective: ["none", undefined, undefined] },
  "south-relic-camp": { coordinate: [1, 2], capacity: 55, mapType: "RELIC_CAMP", objective: ["relic", 742, 555] },
  "southeast-warband-camp": { coordinate: [2, 2], capacity: 55, mapType: "WARBAND_CAMP", objective: ["warband", 740, 539] },
});

const REQUIRED_DOCS = ["README.md", "ART_RESULTS.md", "IMAGEGEN_PROMPTS.md", "CITY_AND_OBJECTIVE_QA.md", "STATIC_QA.md", "BROWSER_QA_DEBT.md", "VALIDATION_RESULTS.md"];
const REQUIRED_GALLERY = [
  "five-art6-clean-candidates.png", "five-art6-runtime-overlays.png", "road-treatment-board.png",
  "structure-integration-board.png", "south-climate-board.png", "south-neighbor-continuity-board.png",
  "southwest-gold-board.png", "south-deed-settlement-board.png", "south-support-70-city-board.png",
  "four-relic-comparison-board.png", "warband-comparison-board.png", "twenty-five-map-core-style-board.png",
];

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function sha256(filePath) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function hashObject(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function git(...args) { return childProcess.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Missing ${path.relative(ROOT, filePath)}`);
  assert(fs.statSync(filePath).size > 0, `Empty ${path.relative(ROOT, filePath)}`);
}
function dimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.subarray(1, 4).toString("ascii") === "PNG") return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (chunk === "VP8 ") return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
  return [1 + (b1 | ((b2 & 0x3f) << 8)), 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10))];
}
function minimumSpacing(cities) {
  let minimum = Infinity;
  for (let i = 0; i < cities.length; i += 1) for (let j = i + 1; j < cities.length; j += 1) {
    minimum = Math.min(minimum, Math.hypot(cities[i].x - cities[j].x, cities[i].y - cities[j].y));
  }
  return minimum;
}
function collectCityFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [], queue = [root];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.name === "cities.json") files.push(full);
    }
  }
  return files;
}

function validateBatch() {
  const index = readJson(path.join(OUTPUT, "art6-index.json"));
  assert.equal(index.phase, "Core v2 Phase ART-6");
  assert.equal(index.approvedBase, APPROVED_BASE);
  assert.equal(index.developmentOnly, true);
  assert.equal(index.productionActivated, false);
  assert.equal(index.publicationAllowed, false);
  assert.equal(index.exactBatchMapCount, 5);
  assert.equal(index.exactBatchCityCapacity, 295);
  assert.equal(index.finalArtCandidateCount, 5);
  assert.equal(index.finishedCoreMapCountAfterApproval, 25);
  assert.equal(index.representedCoreCityCapacityBeforeArt6, 1185);
  assert.equal(index.art6CityCapacity, 295);
  assert.equal(index.representedCoreCityCapacityAfterApproval, 1480);
  assert.equal(index.remainingCoreCoordinates, 0);
  assert.equal(index.exactCoreRegionCount, 25);
  assert.equal(index.exactCoreCityCapacity, 1480);
  assert.equal(index.newCoreCoordinatesGenerated, 5);
  assert.equal(index.allOtherCoreCoordinatesGenerated, 0);
  assert.deepEqual(index.mapDimensions, { width: 1448, height: 1086 });
  assert.equal(hashObject({ ...index, indexHash: undefined }), index.indexHash, "ART-6 index hash mismatch");
  assert.equal(index.entries.length, 5);

  const batchCityIds = new Set(), coordinates = new Set(), rows = [];
  for (const entry of index.entries) {
    const expected = EXPECTED[entry.key];
    assert(expected, `Unexpected ART-6 key ${entry.key}`);
    const coordinate = [entry.coordinate.gridX, entry.coordinate.gridY];
    assert.deepEqual(coordinate, expected.coordinate);
    assert(!coordinates.has(coordinate.join(",")), `Duplicate coordinate ${coordinate}`);
    coordinates.add(coordinate.join(","));
    assert.equal(entry.exactCityCapacity, expected.capacity);
    assert.equal(entry.mapType, expected.mapType);
    assert.equal(entry.objective.type, expected.objective[0]);
    if (expected.objective[0] !== "none") {
      assert.deepEqual([entry.objective.x, entry.objective.y], expected.objective.slice(1));
      assert(Math.hypot(entry.objective.x - 724, entry.objective.y - 543) <= 48, `${entry.key} objective not near center`);
    }

    const geometry = path.join(ROOT, entry.outputDirectory);
    const candidate = path.join(ROOT, entry.candidateDirectory);
    const citiesPath = path.join(geometry, "cities.json");
    const compositionPath = path.join(geometry, "composition.json");
    const receiptPath = path.join(geometry, "validation-receipt.json");
    const pngPath = path.join(candidate, "map-final-candidate.png");
    const webpPath = path.join(candidate, "map-final-candidate.webp");
    const thumbPath = path.join(candidate, "thumbnail.webp");
    for (const file of [citiesPath, compositionPath, receiptPath, pngPath, webpPath, thumbPath]) assertFile(file);
    assert.deepEqual(dimensions(pngPath), [1448, 1086]);
    assert.deepEqual(dimensions(webpPath), [1448, 1086]);
    assert.deepEqual(dimensions(thumbPath), [320, 240]);
    assert.equal(sha256(pngPath), entry.candidatePngSha256);
    assert.equal(sha256(webpPath), entry.candidateWebpSha256);
    assert.equal(sha256(thumbPath), entry.thumbnailSha256);
    assert.equal(sha256(citiesPath), entry.citiesSha256);
    assert.equal(sha256(compositionPath), entry.compositionSha256);
    assert.equal(sha256(receiptPath), entry.validationReceiptSha256);

    const cities = readJson(citiesPath);
    const plan = readJson(compositionPath);
    const receipt = readJson(receiptPath);
    assert.equal(cities.length, expected.capacity);
    for (const city of cities) {
      assert(!batchCityIds.has(city.id), `Duplicate ART-6 city ID ${city.id}`);
      batchCityIds.add(city.id);
    }
    const observed = minimumSpacing(cities);
    assert(observed >= 68, `${entry.key} spacing ${observed} is below 68px`);
    for (const field of ["cityObjectiveConflicts", "cityBlockerConflicts", "cityRoadConflicts", "cityTransitionConflicts"]) assert.equal(receipt.validation[field], 0);
    assert.equal(receipt.validation.valid, true);
    assert.equal(receipt.validation.propRuleCompliant, true);
    assert.equal(receipt.validation.geometryArtParity.valid, true);
    assert.equal(receipt.validation.geometryArtParity.roadSocketAligned, true);
    assert.equal(plan.permanentCore, true);
    assert.equal(plan.spawnEligible, false);
    assert.equal(plan.runtimeNpcSpawnThresholdApplies, false);
    assert.equal(plan.developmentOnly, true);
    assert.equal(plan.productionActivated, false);
    assert.equal(plan.publicationAllowed, false);
    assert.equal(plan.coreRegion.topology.cardinalOnly, true);
    assert.deepEqual(plan.coreRegion.topology.roadSockets, SPEC.ROAD_SOCKETS);
    assert.deepEqual(new Set(plan.roadSystem.edgeRoads.map(road => road.side)), new Set(["north", "east", "south", "west"]));
    assert.equal(plan.coreRegion.topology.connections.south.state, "GATED");
    if (entry.coordinate.gridX === -2) assert.equal(plan.coreRegion.topology.connections.west.state, "GATED");
    if (entry.coordinate.gridX === 2) assert.equal(plan.coreRegion.topology.connections.east.state, "GATED");
    rows.push({ key: entry.key, coordinate, capacity: cities.length, minimumSpacing: Number(observed.toFixed(3)), objective: entry.objective });
  }
  assert.equal(batchCityIds.size, 295);

  const roots = [
    path.join(ROOT, "benchmark-results", "map", "core-v2-phase-a", "prototypes"),
    path.join(ROOT, "benchmark-results", "map", "core-v2-phase-b1", "prototypes"),
    path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-4", "geometry"),
    path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-5", "geometry"),
    path.join(OUTPUT, "geometry"),
  ];
  const allIds = new Set();
  let allCities = 0;
  for (const file of roots.flatMap(collectCityFiles)) for (const city of readJson(file)) {
    assert(!allIds.has(city.id), `Duplicate city ID across 25 Core maps: ${city.id}`);
    allIds.add(city.id);
    allCities += 1;
  }
  assert.equal(allCities, 1480);

  const specification = SPEC.buildCoreSpecification();
  const regionById = new Map(specification.regions.map(region => [region.regionId, region]));
  let directedOpen = 0, gated = 0;
  for (const region of specification.regions) for (const [side, connection] of Object.entries(region.topology.connections)) {
    if (connection.state === "GATED") { gated += 1; continue; }
    directedOpen += 1;
    const neighbor = regionById.get(connection.regionId);
    assert(neighbor, `Missing neighbor ${connection.regionId}`);
    const reciprocal = neighbor.topology.connections[connection.reciprocalSide];
    assert.equal(reciprocal.state, "OPEN");
    assert.equal(reciprocal.regionId, region.regionId);
    assert.equal(reciprocal.reciprocalSide, side);
  }
  assert.equal(directedOpen, 80);
  assert.equal(gated, 20);
  assert.equal(directedOpen / 2, 40);
  return { maps: 5, cities: 295, finishedCoreMaps: 25, representedCoreCities: 1480, uniqueCoreCityIds: allIds.size, directedOpen, reciprocalConnections: 40, outwardGated: gated, rows };
}

function validateVisualReview() {
  for (const name of REQUIRED_GALLERY) assertFile(path.join(OUTPUT, "gallery", name));
  const review = readJson(path.join(OUTPUT, "visual-review.json"));
  const blocker = readJson(path.join(OUTPUT, "browser-blocker-receipt.json"));
  const performance = readJson(path.join(OUTPUT, "performance-receipt.json"));
  const expectedDebt = {
    status: "DEFERRED_EXTERNAL_TOOL_BLOCK", blocker: "CODEX_BROWSER_LOCAL_ORIGIN_PERMISSION",
    productionBlocking: true, artProductionBlocking: false, requiredBeforeProductionUse: true,
    futureGate: "FINAL_CONSOLIDATED_INTERACTIVE_CORE_QA_ALL_25_MAPS",
  };
  assert.equal(review.developmentOnly, true);
  assert.equal(review.productionActivated, false);
  assert.equal(review.reviewedCandidateCount, 5);
  assert.equal(review.completedCoreMapCount, 25);
  assert.equal(review.representedCoreCityCapacity, 1480);
  assert.equal(review.staticRuntimeOverlayStatus, "PASS_ACTUAL_CURRENT_RUNTIME_ASSETS");
  assert.equal(review.browserRuntimeStatus, "DEFERRED_EXTERNAL_TOOL_BLOCK");
  assert.deepEqual(review.interactiveRuntimeQA, expectedDebt);
  assert.deepEqual(blocker.interactiveRuntimeQA, expectedDebt);
  assert.equal(blocker.crownlandsFailure, false);
  assert.equal(blocker.art6BrowserAttempted, false);
  assert.equal(blocker.art6ArtChangedByBrowserAttempt, false);
  assert.equal(performance.measurementMode, "STATIC_AVAILABLE_HARNESS_ONLY");
  assert.equal(performance.staticQaRenderer.candidateCount, 5);
  assert.equal(performance.browserInteractiveFpsMeasured, false);
  assert.equal(performance.browserInteractiveClaimMade, false);
  assert.equal(performance.interactiveRuntimeQA, "DEFERRED_EXTERNAL_TOOL_BLOCK");
  for (const [question, answer] of Object.entries(review.approvalQuestions)) assert.equal(answer, true, `Visual question failed: ${question}`);
  return { staticActualAssetOverlays: "PASS", staticQaWallSeconds: performance.staticQaRenderer.approximateWallSeconds, browserFpsClaimed: false, interactiveRuntimeQA: expectedDebt, approvalQuestionsYes: Object.keys(review.approvalQuestions).length };
}

function validateProductionSafety() {
  assert.equal(git("branch", "--show-current"), EXPECTED_BRANCH);
  assert.equal(git("rev-parse", "HEAD"), APPROVED_BASE);
  const specification = SPEC.buildCoreSpecification();
  assert.equal(specification.regions.length, 25);
  assert.equal(specification.regions.reduce((sum, region) => sum + region.exactCityCapacity, 0), 1480);
  const catalog = readJson(path.join(ROOT, "assets", "worlds", "world_01", "region-catalog.json"));
  const liveRegions = catalog.regions.map(region => readJson(path.join(ROOT, region.regionDefinitionPath)));
  const preflight = readJson(path.join(ROOT, "docs", "map-scaling-audit", "phase-9", "results", "PRODUCTION_READ_ONLY_PREFLIGHT.json"));
  assert.equal(catalog.regions.length, 15);
  assert.equal(liveRegions.flatMap(region => region.cities || []).length, 1050);
  assert.equal(preflight.productionBaseline.directedMapChainCount, 210);
  assert.equal(preflight.productionBaseline.generatedActiveRegionCount, 0);
  assert.equal(preflight.productionMutationPerformed, false);
  const manifest = path.join(ROOT, "benchmark-results", "map", "phase-6d", "asset-library", "asset-manifest.json");
  assert.equal(sha256(manifest), MANIFEST_HASH);
  assert.equal(readJson(manifest).assets.length, 118);

  childProcess.execFileSync("git", ["diff", "--quiet", APPROVED_BASE, "--", "assets", "src", "functions", "firebase.json", "firestore.rules", "firestore.indexes.json", "benchmark-results/map/phase-6d/asset-library"], { cwd: ROOT });
  childProcess.execFileSync("git", ["diff", "--quiet", APPROVED_BASE, "--",
    "benchmark-results/map/core-v2-phase-a/prototypes", "benchmark-results/map/core-v2-phase-b1/prototypes",
    "benchmark-results/map/core-v2-phase-art-2-v2/candidates", "benchmark-results/map/core-v2-phase-art-3/candidates",
    "benchmark-results/map/core-v2-phase-art-4/geometry", "benchmark-results/map/core-v2-phase-art-4/candidates",
    "benchmark-results/map/core-v2-phase-art-5/geometry", "benchmark-results/map/core-v2-phase-art-5/candidates",
    "tools/core-v2-phase-a", "tools/core-v2-phase-a1", "tools/core-v2-phase-b1",
    "tools/core-v2-phase-art-2-v2", "tools/core-v2-phase-art-3", "tools/core-v2-phase-art-4", "tools/core-v2-phase-art-5",
  ], { cwd: ROOT });

  const allowed = [
    "benchmark-results/map/core-v2-phase-art-6/", "docs/map-scaling-audit/core-v2/phase-art-6/",
    "tools/core-v2-phase-art-6/", "tools/run-core-v2-phase-art-6.js", "tools/validate-core-v2-phase-art-6.js",
  ];
  const status = childProcess.execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  const paths = status.map(line => line.slice(3).replaceAll("\\", "/"));
  const forbidden = paths.filter(file => !allowed.some(prefix => file === prefix || file.startsWith(prefix)));
  assert.deepEqual(forbidden, [], `Files outside ART-6 development scope: ${forbidden.join(", ")}`);

  let leakage = 0;
  const dist = path.join(ROOT, "dist");
  if (fs.existsSync(dist)) {
    const queue = [dist];
    while (queue.length) {
      const current = queue.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const file = path.join(current, entry.name);
        if (entry.isDirectory()) queue.push(file);
        else if (/\.(?:html|js|css|json|svg|txt)$/i.test(entry.name) && /core-v2-phase-art-6|southwest-gold-camp|core-v2-south-support-p0-p2/i.test(fs.readFileSync(file, "utf8"))) leakage += 1;
      }
    }
  }
  assert.equal(leakage, 0);
  return { productionMaps: 15, productionCities: 1050, directedChains: 210, generatedActiveRegions: 0, generatorAssets: 118, productionLeakage: leakage, productionFilesChanged: 0, assetManifestHash: MANIFEST_HASH };
}

for (const name of REQUIRED_DOCS) assertFile(path.join(DOCS, name));
const batch = validateBatch();
const visual = validateVisualReview();
const production = validateProductionSafety();
console.log(JSON.stringify({ phase: "Core v2 Phase ART-6", result: "PASS_STATIC_VISUAL_REVIEW", approvedBase: APPROVED_BASE, branch: EXPECTED_BRANCH, batch, visual, production, committed: false, pushed: false, deployed: false, merged: false, productionActivated: false }, null, 2));
