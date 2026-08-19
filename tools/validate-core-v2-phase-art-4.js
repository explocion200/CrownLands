"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APPROVED_BASE = "d42f8590054bcfa22328dd06b0bc6b167d8de20a";
const EXPECTED_BRANCH = "codex/core-v2";
const EXPECTED_ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const OUTPUT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-4");
const DOCS = path.join(ROOT, "docs", "map-scaling-audit", "core-v2", "phase-art-4");
const SPEC = require("./core-v2-phase-a/spec");

const EXPECTED = Object.freeze({
  "north-support": { coordinate: [0, -2], capacity: 70, mapType: "SUPPORT", objective: ["none", undefined, undefined] },
  "northeast-deed-camp": { coordinate: [1, -2], capacity: 60, mapType: "DEED_CAMP", objective: ["deed", 704, 533] },
  "northeast-gold-camp": { coordinate: [2, -2], capacity: 55, mapType: "GOLD_CAMP", objective: ["gold", 742, 550] },
  "greybanner-hold": { coordinate: [0, -1], capacity: 60, mapType: "STRONGHOLD", objective: ["training", 724, 543] },
  "northeast-holding-tower": { coordinate: [1, -1], capacity: 55, mapType: "HOLDING_TOWER", objective: ["holding_tower", 734, 555] },
});

const FORBIDDEN_COORDINATES = new Set(["2,-1", "1,0", "2,0", "1,1", "2,1", "-2,2", "-1,2", "0,2", "1,2", "2,2"]);
const REQUIRED_DOCS = Object.freeze(["README.md", "ART_RESULTS.md", "IMAGEGEN_PROMPTS.md", "CITY_AND_OBJECTIVE_QA.md", "RUNTIME_QA.md", "VALIDATION_RESULTS.md", "BROWSER_BLOCKER_RECEIPT.md"]);
const REQUIRED_GALLERY = Object.freeze([
  "five-art4-clean-candidates.png",
  "five-art4-runtime-overlays.png",
  "road-treatment-board.png",
  "structure-integration-board.png",
  "north-northeast-climate-board.png",
  "neighbor-continuity-board.png",
  "fifteen-map-core-style-board.png",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Missing ${path.relative(ROOT, filePath)}`);
  assert(fs.statSync(filePath).size > 0, `Empty ${path.relative(ROOT, filePath)}`);
}

function git(...args) {
  return childProcess.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function dimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.subarray(1, 4).toString("ascii") === "PNG") return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error(`Unsupported image ${filePath}`);
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (chunk === "VP8 ") return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
    return [1 + (b1 | ((b2 & 0x3f) << 8)), 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10))];
  }
  throw new Error(`Unknown WebP chunk ${chunk}`);
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

function validateBatch() {
  const index = readJson(path.join(OUTPUT, "art4-index.json"));
  assert.equal(index.phase, "Core v2 Phase ART-4");
  assert.equal(index.approvedBase, APPROVED_BASE);
  assert.equal(index.developmentOnly, true);
  assert.equal(index.productionActivated, false);
  assert.equal(index.publicationAllowed, false);
  assert.equal(index.exactBatchMapCount, 5);
  assert.equal(index.exactBatchCityCapacity, 300);
  assert.equal(index.finalArtCandidateCount, 5);
  assert.equal(index.finishedCoreMapCountAfterApproval, 15);
  assert.equal(index.representedCoreCityCapacityAfterApproval, 885);
  assert.equal(index.exactCoreRegionCount, 25);
  assert.equal(index.exactCoreCityCapacity, 1480);
  assert.equal(index.newCoreCoordinatesGenerated, 5);
  assert.equal(index.allOtherCoreCoordinatesGenerated, 0);
  assert.deepEqual(index.mapDimensions, { width: 1448, height: 1086 });
  const expectedIndexHash = index.indexHash;
  assert.equal(hashObject({ ...index, indexHash: undefined }), expectedIndexHash, "ART-4 index hash mismatch.");
  assert.equal(index.entries.length, 5);

  const globalCityIds = new Set();
  const rows = [];
  for (const entry of index.entries) {
    const expected = EXPECTED[entry.key];
    assert(expected, `Unexpected ART-4 key ${entry.key}`);
    assert.deepEqual([entry.coordinate.gridX, entry.coordinate.gridY], expected.coordinate);
    assert(!FORBIDDEN_COORDINATES.has(expected.coordinate.join(",")), `${entry.key} used a forbidden coordinate.`);
    assert.equal(entry.exactCityCapacity, expected.capacity);
    assert.equal(entry.mapType, expected.mapType);
    assert.equal(entry.objective.type, expected.objective[0]);
    if (expected.objective[0] !== "none") assert.deepEqual([entry.objective.x, entry.objective.y], expected.objective.slice(1));
    if (entry.mapType === "STRONGHOLD") assert.deepEqual([entry.objective.x, entry.objective.y], [724, 543]);
    if (["DEED_CAMP", "GOLD_CAMP", "HOLDING_TOWER"].includes(entry.mapType)) assert(Math.hypot(entry.objective.x - 724, entry.objective.y - 543) <= 48);

    const geometry = path.join(ROOT, entry.outputDirectory);
    const candidate = path.join(ROOT, entry.candidateDirectory);
    const citiesPath = path.join(geometry, "cities.json");
    const compositionPath = path.join(geometry, "composition.json");
    const receiptPath = path.join(geometry, "validation-receipt.json");
    const pngPath = path.join(candidate, "map-final-candidate.png");
    const webpPath = path.join(candidate, "map-final-candidate.webp");
    const thumbnailPath = path.join(candidate, "thumbnail.webp");
    for (const filePath of [citiesPath, compositionPath, receiptPath, pngPath, webpPath, thumbnailPath]) assertFile(filePath);
    assert.deepEqual(dimensions(pngPath), [1448, 1086]);
    assert.deepEqual(dimensions(webpPath), [1448, 1086]);
    assert.deepEqual(dimensions(thumbnailPath), [320, 240]);
    assert.equal(sha256(pngPath), entry.candidatePngSha256);
    assert.equal(sha256(webpPath), entry.candidateWebpSha256);
    assert.equal(sha256(thumbnailPath), entry.thumbnailSha256);
    assert.equal(sha256(citiesPath), entry.citiesSha256);
    assert.equal(sha256(compositionPath), entry.compositionSha256);
    assert.equal(sha256(receiptPath), entry.validationReceiptSha256);

    const cities = readJson(citiesPath);
    const plan = readJson(compositionPath);
    const receipt = readJson(receiptPath);
    assert.equal(cities.length, expected.capacity);
    for (const city of cities) {
      assert(!globalCityIds.has(city.id), `Duplicate ART-4 city id ${city.id}`);
      globalCityIds.add(city.id);
    }
    const observedMinimum = minimumSpacing(cities);
    assert(observedMinimum >= 68, `${entry.key} spacing ${observedMinimum} is below 68 px.`);
    assert.equal(receipt.validation.valid, true);
    assert.equal(receipt.validation.cityObjectiveConflicts, 0);
    assert.equal(receipt.validation.cityBlockerConflicts, 0);
    assert.equal(receipt.validation.cityRoadConflicts, 0);
    assert.equal(receipt.validation.cityTransitionConflicts, 0);
    assert.equal(receipt.validation.propRuleCompliant, true);
    assert.equal(receipt.validation.geometryArtParity.valid, true);
    assert.equal(plan.permanentCore, true);
    assert.equal(plan.spawnEligible, false);
    assert.equal(plan.runtimeNpcSpawnThresholdApplies, false);
    assert.equal(plan.developmentOnly, true);
    assert.equal(plan.productionActivated, false);
    assert.equal(plan.publicationAllowed, false);
    assert.equal(plan.roadSystem.edgeRoads.length, 4);
    assert.deepEqual(new Set(plan.roadSystem.edgeRoads.map(road => road.side)), new Set(["north", "east", "south", "west"]));
    assert.deepEqual(plan.coreRegion.topology.roadSockets, SPEC.ROAD_SOCKETS);
    rows.push({ key: entry.key, capacity: cities.length, minimumSpacing: Number(observedMinimum.toFixed(3)), objective: entry.objective });
  }
  assert.equal(globalCityIds.size, 300);
  return { maps: rows.length, cities: globalCityIds.size, finishedCoreMaps: 15, representedCoreCities: 885, rows };
}

function validateVisualReview() {
  for (const name of REQUIRED_GALLERY) assertFile(path.join(OUTPUT, "gallery", name));
  const review = readJson(path.join(OUTPUT, "visual-review.json"));
  const blockerReceipt = readJson(path.join(OUTPUT, "browser-blocker-receipt.json"));
  assert.equal(review.developmentOnly, true);
  assert.equal(review.productionActivated, false);
  assert.equal(review.reviewedCandidateCount, 5);
  assert.equal(review.staticRuntimeOverlayStatus, "pass_actual_current_runtime_assets");
  assert.equal(review.browserRuntimeStatus, "deferred_external_tool_block");
  assert.deepEqual(review.interactiveRuntimeQA, {
    status: "DEFERRED_EXTERNAL_TOOL_BLOCK",
    blocker: "CODEX_BROWSER_LOCAL_ORIGIN_PERMISSION",
    productionBlocking: true,
    artProductionBlocking: false,
    requiredBeforeProductionUse: true,
    futureGate: "FINAL_CONSOLIDATED_INTERACTIVE_CORE_QA_ALL_25_MAPS",
  });
  assert.equal(blockerReceipt.interactiveRuntimeQA.status, "DEFERRED_EXTERNAL_TOOL_BLOCK");
  assert.equal(blockerReceipt.interactiveRuntimeQA.blocker, "CODEX_BROWSER_LOCAL_ORIGIN_PERMISSION");
  assert.equal(blockerReceipt.interactiveRuntimeQA.productionBlocking, true);
  assert.equal(blockerReceipt.interactiveRuntimeQA.artProductionBlocking, false);
  assert.equal(blockerReceipt.evidence.fixtureHttpStatus, 200);
  assert.equal(blockerReceipt.evidence.freshBrowserSessionRetried, true);
  assert.equal(blockerReceipt.evidence.crownlandsFailure, false);
  assert.equal(blockerReceipt.scope.candidateArtChangedByBrowserAttempts, false);
  assert.equal(blockerReceipt.scope.geometryChangedByBrowserAttempts, false);
  assert.equal(blockerReceipt.scope.runtimeCodeChangedByBrowserAttempts, false);
  assert.equal(blockerReceipt.scope.productionStateChanged, false);
  assert.equal(blockerReceipt.requiredFutureGate.mustIncludeDeferredArt4Maps, true);
  for (const [question, answer] of Object.entries(review.approvalQuestions)) assert.equal(answer, true, `Visual question ${question} failed.`);
  return {
    staticActualAssetOverlays: "PASS",
    interactiveRuntimeQA: review.interactiveRuntimeQA,
    approvalQuestionsYes: Object.keys(review.approvalQuestions).length,
  };
}

function validateProductionSafety() {
  assert.equal(git("branch", "--show-current"), EXPECTED_BRANCH);
  assert.equal(git("rev-parse", "HEAD"), APPROVED_BASE, "ART-4 must remain uncommitted at the approved checkpoint during visual review.");
  const specification = SPEC.buildCoreSpecification();
  assert.equal(specification.regions.length, 25);
  assert.equal(specification.regions.reduce((sum, region) => sum + region.exactCityCapacity, 0), 1480);
  const catalog = readJson(path.join(ROOT, "assets", "worlds", "world_01", "region-catalog.json"));
  const regions = catalog.regions.map(region => readJson(path.join(ROOT, region.regionDefinitionPath)));
  const preflight = readJson(path.join(ROOT, "docs", "map-scaling-audit", "phase-9", "results", "PRODUCTION_READ_ONLY_PREFLIGHT.json"));
  assert.equal(catalog.regions.length, 15);
  assert.equal(regions.flatMap(region => region.cities || []).length, 1050);
  assert.equal(preflight.productionBaseline.directedMapChainCount, 210);
  assert.equal(preflight.productionBaseline.generatedActiveRegionCount, 0);
  assert.equal(preflight.productionMutationPerformed, false);

  const manifestPath = path.join(ROOT, "benchmark-results", "map", "phase-6d", "asset-library", "asset-manifest.json");
  assert.equal(sha256(manifestPath), EXPECTED_ASSET_MANIFEST_HASH);
  assert.equal(readJson(manifestPath).assets.length, 118);

  childProcess.execFileSync("git", ["diff", "--quiet", APPROVED_BASE, "--", "benchmark-results/map/core-v2-phase-art-2-v2", "benchmark-results/map/core-v2-phase-art-3"], { cwd: ROOT });
  const allowedPrefixes = [
    "benchmark-results/map/core-v2-phase-art-4/",
    "docs/map-scaling-audit/core-v2/phase-art-4/",
    "tools/core-v2-phase-art-4/",
    "tools/run-core-v2-phase-art-4.js",
    "tools/validate-core-v2-phase-art-4.js",
  ];
  const status = git("status", "--porcelain=v1", "--untracked-files=all").split(/\r?\n/).filter(Boolean);
  const changedPaths = status.map(line => line.slice(3).replaceAll("\\", "/"));
  const forbidden = changedPaths.filter(file => !allowedPrefixes.some(prefix => file === prefix || file.startsWith(prefix)));
  assert.deepEqual(forbidden, [], `ART-4 touched files outside development scope: ${forbidden.join(", ")}`);
  assert.equal(git("diff", "--name-only", APPROVED_BASE), "", "Tracked files changed during ART-4 review work.");

  let productionLeakage = 0;
  const dist = path.join(ROOT, "dist");
  if (fs.existsSync(dist)) {
    const queue = [dist];
    while (queue.length) {
      const current = queue.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const filePath = path.join(current, entry.name);
        if (entry.isDirectory()) queue.push(filePath);
        else if (/\.(?:html|js|css|json|svg|txt)$/i.test(entry.name) && /core-v2-phase-art-4|northeast-gold-camp|greybanner-hold/i.test(fs.readFileSync(filePath, "utf8"))) productionLeakage += 1;
      }
    }
  }
  assert.equal(productionLeakage, 0);
  return {
    productionMaps: 15,
    productionCities: 1050,
    directedChains: 210,
    generatedActiveRegions: 0,
    generatedPlayerAssets: 118,
    productionFilesChanged: 0,
    productionLeakage,
    assetManifestHash: EXPECTED_ASSET_MANIFEST_HASH,
  };
}

for (const name of REQUIRED_DOCS) assertFile(path.join(DOCS, name));
const batch = validateBatch();
const visual = validateVisualReview();
const production = validateProductionSafety();

console.log(JSON.stringify({
  phase: "Core v2 Phase ART-4",
  result: "PASS_STATIC_VISUAL_REVIEW",
  approvedBase: APPROVED_BASE,
  branch: EXPECTED_BRANCH,
  batch,
  visual,
  production,
  pushed: false,
  deployed: false,
  merged: false,
  productionActivated: false,
}, null, 2));
