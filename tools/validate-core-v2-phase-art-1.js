"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APPROVED_BASE = "ef66754bab49a88bd694b9f55c5cc3ef1e0333b3";
const EXPECTED_BRANCH = "codex/core-v2";
const EXPECTED_ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const OUTPUT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-1");
const DOCS = path.join(ROOT, "docs", "map-scaling-audit", "core-v2", "phase-art-1");

const PROTOTYPE_HASHES = Object.freeze({
  "benchmark-results/map/core-v2-phase-a/prototypes/crown-citadel/map.webp": "7ef9a4c66b7c8a281a85c75a0f6e32ea9bc35880c514f4693a10e51a49e70df9",
  "benchmark-results/map/core-v2-phase-a/prototypes/ironwatch/map.webp": "4f7920dc772d1e059c27ecfe5d65e67f8ef6ae4f2649b7e3df3f09d5f5c28e76",
  "benchmark-results/map/core-v2-phase-a/prototypes/southwest-holding-tower/map.webp": "724b6591ce4d8c61215cb29361d2de84142daeaf4858582decaaf18aa0d61da7",
  "benchmark-results/map/core-v2-phase-a/prototypes/west-south-deed-camp/map.webp": "800bf54a30c743af0977ea104f32ef5be1e41e4a2805d97a35c6a92d984fe8a7",
  "benchmark-results/map/core-v2-phase-a/prototypes/west-support/map.webp": "733638e5d9e14fa2eb0015d2e93bc67b0ee8301691f0bcfe597b65152f81a520",
  "benchmark-results/map/core-v2-phase-b1/prototypes/northwest-warband-camp/map.webp": "0af61df7a93a9d81f4bfa00049475befa8d5772d25359ae8877a38f6d40cc6c8",
  "benchmark-results/map/core-v2-phase-b1/prototypes/northwest-relic-camp/map.webp": "21f12e83454cac25d8168afddf38e3ac91b271c96092904b04c9d7673d4090e1",
  "benchmark-results/map/core-v2-phase-b1/prototypes/west-north-relic-camp/map.webp": "934c9777fc58c9167fec00f5c783ef13aee7b5b1798ccbd65a9d2f40762c94b1",
  "benchmark-results/map/core-v2-phase-b1/prototypes/northwest-holding-tower/map.webp": "6fb272bdca8a6de4328da54dabba17ca1735518bcf7b3923467ee80aee154975",
  "benchmark-results/map/core-v2-phase-b1/prototypes/aurum-keep/map.webp": "f590555601f615b957c05aa04397c61ef368d588c5487a52156d9b4352f3c590",
});

const PROTOTYPE_DIRECTORIES = Object.freeze([
  "benchmark-results/map/core-v2-phase-a/prototypes/crown-citadel",
  "benchmark-results/map/core-v2-phase-a/prototypes/ironwatch",
  "benchmark-results/map/core-v2-phase-a/prototypes/southwest-holding-tower",
  "benchmark-results/map/core-v2-phase-a/prototypes/west-south-deed-camp",
  "benchmark-results/map/core-v2-phase-a/prototypes/west-support",
  "benchmark-results/map/core-v2-phase-b1/prototypes/northwest-warband-camp",
  "benchmark-results/map/core-v2-phase-b1/prototypes/northwest-relic-camp",
  "benchmark-results/map/core-v2-phase-b1/prototypes/west-north-relic-camp",
  "benchmark-results/map/core-v2-phase-b1/prototypes/northwest-holding-tower",
  "benchmark-results/map/core-v2-phase-b1/prototypes/aurum-keep",
]);

const PROTOTYPE_DEFINITION_FILES = Object.freeze(PROTOTYPE_DIRECTORIES.flatMap(directory => [
  `${directory}/cities.json`,
  `${directory}/composition.json`,
  `${directory}/validation-receipt.json`,
]));

const REQUIRED_DOCS = Object.freeze([
  "README.md",
  "ART_SOURCE_OF_TRUTH.md",
  "CORE_ART_DIRECTION.md",
  "TERRITORY_PROFILES.md",
  "REFERENCE_BOARDS.md",
  "IMAGEGEN_PROMPTS.md",
  "PROTOTYPE_CLASSIFICATION.md",
  "VALIDATION_RESULTS.md",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function git(...args) {
  return childProcess.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Missing ${path.relative(ROOT, filePath)}.`);
  assert(fs.statSync(filePath).size > 0, `Empty ${path.relative(ROOT, filePath)}.`);
}

function validateReceipt() {
  const receipt = readJson(path.join(OUTPUT, "art-direction-lock.json"));
  assert.equal(receipt.approvedBase, APPROVED_BASE);
  assert.equal(receipt.branch, EXPECTED_BRANCH);
  assert.equal(receipt.developmentOnly, true);
  assert.equal(receipt.finalMapProductionStarted, false);
  assert.equal(receipt.additionalCoreMapsGenerated, 0);
  assert.equal(receipt.prototypeBackgroundsModified, 0);
  assert.equal(receipt.prototypeDefinitionsModified, 0);
  assert.equal(receipt.productionModified, false);
  assert.deepEqual(receipt.productionBaseline, { maps: 15, cities: 1050, directedChains: 210, generatedActiveRegions: 0 });
  assert.equal(receipt.core.maps, 25);
  assert.equal(receipt.core.cities, 1480);
  assert.equal(receipt.core.spawnEligible, false);
  assert.equal(receipt.core.hardMinimumCitySpacingPx, 68);
  assert.equal(receipt.core.preferredCitySpacingPx, 70);
  assert.equal(receipt.core.outerGeneratedMapSpacingPx, 112);
  assert.deepEqual(receipt.core.capacities, {
    SUPPORT: 70,
    DEED_CAMP: 60,
    RELIC_CAMP: 55,
    WARBAND_CAMP: 55,
    GOLD_CAMP: 55,
    HOLDING_TOWER: 55,
    STRONGHOLD: 60,
    CROWN_CITADEL: 60,
  });
  assert.equal(receipt.style.perimeterTouchesLiteralBoundary, true);
  assert.equal(receipt.style.perimeterNarrow, true);
  assert.equal(receipt.style.roadsAreControlledBarrierOpenings, true);
  assert.equal(receipt.style.noBakedRuntimeObjects, true);
  assert.equal(receipt.style.centralThirtyPercentLargelyClear, true);
  assert.deepEqual(receipt.prototypeClassification, {
    A: 0,
    B: 0,
    C: 10,
    visualRebuildRequired: [
      "crown-citadel", "ironwatch", "southwest-holding-tower", "west-south-deed-camp", "west-support",
      "northwest-warband-camp", "northwest-relic-camp", "west-north-relic-camp", "northwest-holding-tower", "aurum-keep",
    ],
  });
  assert.deepEqual(receipt.futureRebuild, {
    backgrounds: 10,
    geometry: 0,
    cities: 0,
    objectives: 0,
    roads: 0,
    topology: 0,
  });
  assert.equal(receipt.approval.readyForVisualReview, true);
  assert.equal(receipt.approval.finalMapProductionAllowed, false);
  assert.equal(receipt.approval.batch2Allowed, false);
  return receipt;
}

function validateBoards(receipt) {
  const boardDirectory = path.join(OUTPUT, "reference-boards");
  assertFile(path.join(boardDirectory, "00-overview.png"));
  assert.equal(receipt.referenceBoards.length, 9);
  assert.equal(new Set(receipt.referenceBoards).size, 9);
  for (const fileName of receipt.referenceBoards) {
    assert.match(fileName, /^0[1-9]-[a-z0-9-]+\.png$/);
    assertFile(path.join(boardDirectory, fileName));
  }
  const files = fs.readdirSync(boardDirectory).sort();
  assert.deepEqual(files, ["00-overview.png", ...receipt.referenceBoards].sort());
  const forbiddenMapOutputs = [];
  const queue = [OUTPUT];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(filePath);
      else if (/^(?:map|map-clean|thumbnail)\.(?:png|webp)$/i.test(entry.name) || /cities\.json$/i.test(entry.name)) forbiddenMapOutputs.push(path.relative(ROOT, filePath));
    }
  }
  assert.deepEqual(forbiddenMapOutputs, [], `ART-1 contains final-map-shaped outputs: ${forbiddenMapOutputs.join(", ")}`);
  return { boards: 9, overview: true };
}

function validateDocuments() {
  for (const name of REQUIRED_DOCS) assertFile(path.join(DOCS, name));
  const combined = REQUIRED_DOCS.map(name => fs.readFileSync(path.join(DOCS, name), "utf8")).join("\n");
  for (const token of ["68 px", "70 px", "112 px", "1,480", "literal image", "North", "West", "South", "East", "Citadel", "Greybanner", "Aurum", "Swiftgate", "Ironwatch", "Warband", "Deed", "Relic", "Gold", "Holding Tower", "Support"]) {
    assert(combined.includes(token), `Documentation is missing locked token: ${token}`);
  }
  return { documents: REQUIRED_DOCS.length };
}

function validatePrototypePreservation() {
  for (const [relativePath, expectedHash] of Object.entries(PROTOTYPE_HASHES)) {
    const filePath = path.join(ROOT, relativePath);
    assertFile(filePath);
    assert.equal(sha256(filePath), expectedHash, `${relativePath} changed during ART-1.`);
  }
  for (const relativePath of PROTOTYPE_DEFINITION_FILES) {
    const workingCopy = fs.readFileSync(path.join(ROOT, relativePath));
    const approvedCopy = childProcess.execFileSync("git", ["show", `${APPROVED_BASE}:${relativePath}`], { cwd: ROOT });
    assert.equal(
      crypto.createHash("sha256").update(workingCopy).digest("hex"),
      crypto.createHash("sha256").update(approvedCopy).digest("hex"),
      `${relativePath} is not byte-identical to the approved base.`,
    );
  }
  const count = relative => fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
  assert.equal(count("benchmark-results/map/core-v2-phase-a/prototypes"), 5);
  assert.equal(count("benchmark-results/map/core-v2-phase-b1/prototypes"), 5);
  const changed = git("diff", "--name-only", APPROVED_BASE, "--", "benchmark-results/map/core-v2-phase-a", "benchmark-results/map/core-v2-phase-b1");
  assert.equal(changed, "", "Approved Phase A/B1 outputs changed.");
  return { existingPrototypes: 10, backgroundsModified: 0, definitionFilesVerified: 30, definitionsModified: 0, addedCoreMaps: 0 };
}

function validateProductionSafety() {
  assert.equal(git("branch", "--show-current"), EXPECTED_BRANCH);
  childProcess.execFileSync("git", ["merge-base", "--is-ancestor", APPROVED_BASE, "HEAD"], { cwd: ROOT });
  const catalog = readJson(path.join(ROOT, "assets", "worlds", "world_01", "region-catalog.json"));
  const regions = catalog.regions.map(region => readJson(path.join(ROOT, region.regionDefinitionPath)));
  const preflight = readJson(path.join(ROOT, "docs", "map-scaling-audit", "phase-9", "results", "PRODUCTION_READ_ONLY_PREFLIGHT.json"));
  assert.equal(catalog.regions.length, 15);
  assert.equal(regions.flatMap(region => region.cities || []).length, 1050);
  assert.equal(preflight.productionBaseline.mapCount, 15);
  assert.equal(preflight.productionBaseline.cityDefinitionCount, 1050);
  assert.equal(preflight.productionBaseline.directedMapChainCount, 210);
  assert.equal(preflight.productionBaseline.generatedActiveRegionCount, 0);
  assert.equal(preflight.productionMutationPerformed, false);
  assert.equal(sha256(path.join(ROOT, "benchmark-results", "map", "phase-6d", "asset-library", "asset-manifest.json")), EXPECTED_ASSET_MANIFEST_HASH);

  const status = childProcess.execFileSync("git", ["status", "--porcelain=v1"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean);
  const allowedPrefixes = [
    "benchmark-results/map/core-v2-phase-art-1/",
    "docs/map-scaling-audit/core-v2/phase-art-1/",
    "tools/validate-core-v2-phase-art-1.js",
  ];
  const changedPaths = status.map(line => line.slice(3).replaceAll("\\", "/"));
  const forbidden = changedPaths.filter(file => !allowedPrefixes.some(prefix => file === prefix || file.startsWith(prefix)));
  assert.deepEqual(forbidden, [], `ART-1 touched files outside development scope: ${forbidden.join(", ")}`);

  const trackedDiff = git("diff", "--name-only", APPROVED_BASE).split(/\r?\n/).filter(Boolean).map(file => file.replaceAll("\\", "/"));
  const forbiddenTracked = trackedDiff.filter(file => !allowedPrefixes.some(prefix => file === prefix || file.startsWith(prefix)));
  assert.deepEqual(forbiddenTracked, [], `ART-1 has tracked production/shared changes: ${forbiddenTracked.join(", ")}`);

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
          assert(!/core-v2-phase-art-1|01-general-terrain\.png|09-tower-territory\.png/i.test(source), `ART-1 leaked into ${path.relative(ROOT, filePath)}.`);
        }
      }
    }
  }
  return {
    productionMaps: 15,
    productionCities: 1050,
    directedChains: 210,
    generatedActiveRegions: 0,
    assetManifestHash: EXPECTED_ASSET_MANIFEST_HASH,
    productionFilesChanged: 0,
    productionLeakage: 0,
  };
}

const receipt = validateReceipt();
const boards = validateBoards(receipt);
const documents = validateDocuments();
const prototypes = validatePrototypePreservation();
const production = validateProductionSafety();

console.log(JSON.stringify({
  phase: "Core v2 Phase ART-1",
  result: "PASS",
  boards,
  documents,
  prototypes,
  production,
  readyForVisualReview: true,
  finalMapProductionStarted: false,
}, null, 2));
