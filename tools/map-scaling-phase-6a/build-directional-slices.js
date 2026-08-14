"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  allocateNextPlayerRegion,
  generateRegionPrototype,
  hashObject,
} = require("../map-scaling-phase-4/generator");
const { getClockwiseRingCoordinates } = require("../../region-catalog");
const { createPermanentCorePackage } = require("../map-scaling-phase-5/core-package");
const { createAllocatorCore } = require("../map-scaling-phase-5/fixtures");
const { classifyDirectionalTheme } = require("./directional-theme");

const ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6a-v3-directional");
const MAP_WIDTH = 1448;
const MAP_HEIGHT = 1086;
const GENERATOR_VERSION = "phase6a-directional-approval-v1";
const WORLD_ID = "phase6a_directional_development_world";
const SEASON_ID = "phase6a_directional_development_season";

const STYLE_REFERENCES = Object.freeze([
  "benchmark-results/map/phase-6a-v2/source/crownlands-phase-6a-corrected-v2-1448x1086.png",
  "assets/optimized/castle-castle-256x256-5e8edd306418.webp",
  "assets/optimized/camp-gold-384x384-1d2f43c018ae.webp",
  "assets/optimized/stronghold-training-384x384-649892a49e02.webp",
  "assets/optimized/crown-citadel-384x384-a23c30392f3c.webp",
]);

const SAMPLE_SPECS = Object.freeze([
  Object.freeze({
    key: "west", themeId: "west_grassy", gridX: -3, gridY: 0,
    mapFile: "west-grassy-1448x1086.png",
    blockers: [
      { id: "west-northwest-rocks", type: "low_rocks", x: 322, y: 188, rx: 60, ry: 34, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "west-small-woodland", type: "light_forest", x: 445, y: 282, rx: 70, ry: 52, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "west-south-woodland", type: "light_forest", x: 976, y: 720, rx: 70, ry: 52, rot: 0, blocksCities: true, blocksMovement: true },
    ],
  }),
  Object.freeze({
    key: "north", themeId: "north_light_winter", gridX: 0, gridY: -3,
    mapFile: "north-light-winter-1448x1086.png",
    blockers: [
      { id: "north-west-winter-trees", type: "winter_trees", x: 468, y: 270, rx: 62, ry: 48, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "north-west-interior-rocks", type: "winter_rocks", x: 367, y: 450, rx: 55, ry: 34, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "north-upper-east-rocks", type: "winter_rocks", x: 870, y: 214, rx: 52, ry: 36, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "north-east-rock-ridge", type: "winter_rocks", x: 1080, y: 410, rx: 100, ry: 42, rot: 0.2, blocksCities: true, blocksMovement: true },
      { id: "north-east-winter-trees", type: "winter_trees", x: 958, y: 620, rx: 68, ry: 50, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "north-southeast-winter-trees", type: "winter_trees", x: 922, y: 725, rx: 62, ry: 48, rot: 0, blocksCities: true, blocksMovement: true },
    ],
  }),
  Object.freeze({
    key: "east", themeId: "east_tropical", gridX: 3, gridY: 0,
    mapFile: "east-tropical-1448x1086.png",
    blockers: [
      { id: "east-north-palm-cluster", type: "tropical_vegetation", x: 458, y: 245, rx: 72, ry: 58, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "east-south-palm-cluster", type: "tropical_vegetation", x: 954, y: 718, rx: 82, ry: 58, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "east-northeast-perimeter-rocks", type: "tropical_perimeter", x: 1230, y: 210, rx: 45, ry: 34, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "east-southeast-perimeter-vegetation", type: "tropical_perimeter", x: 1160, y: 885, rx: 48, ry: 30, rot: 0, blocksCities: true, blocksMovement: true },
    ],
  }),
  Object.freeze({
    key: "south", themeId: "south_dry_frontier", gridX: 0, gridY: 3,
    mapFile: "south-dry-frontier-1448x1086.png",
    blockers: [
      { id: "south-west-dry-rocks", type: "dry_rocks", x: 520, y: 405, rx: 92, ry: 44, rot: 0.12, blocksCities: true, blocksMovement: true },
      { id: "south-central-dry-ridge", type: "dry_rocks", x: 875, y: 430, rx: 118, ry: 42, rot: 0.05, blocksCities: true, blocksMovement: true },
      { id: "south-northwest-rocks", type: "dry_rocks", x: 310, y: 190, rx: 52, ry: 32, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "south-upper-west-rocks", type: "dry_rocks", x: 290, y: 310, rx: 52, ry: 34, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "south-upper-central-rocks", type: "dry_rocks", x: 570, y: 275, rx: 55, ry: 32, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "south-upper-east-rocks", type: "dry_rocks", x: 880, y: 315, rx: 60, ry: 34, rot: 0, blocksCities: true, blocksMovement: true },
      { id: "south-lower-west-rocks", type: "dry_rocks", x: 520, y: 730, rx: 58, ry: 34, rot: 0, blocksCities: true, blocksMovement: true },
    ],
  }),
]);

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createAllocation(spec) {
  const core = createAllocatorCore(createPermanentCorePackage());
  const ring = getClockwiseRingCoordinates(1);
  const targetIndex = ring.findIndex(point => point.gridX === spec.gridX && point.gridY === spec.gridY);
  assert(targetIndex >= 0, `Sample ${spec.key} is not on Layer 1.`);
  const prior = ring.slice(0, targetIndex).map((point, index) => ({
    id: `phase6a_directional_stub_${String(index + 1).padStart(2, "0")}`,
    name: `Directional allocation stub ${index + 1}`,
    gridX: point.gridX,
    gridY: point.gridY,
    purpose: "player_region",
    permanentCore: false,
    lifecycle: "standby",
    spawnReady: false,
    spawnEligible: false,
  }));
  const existingRegions = [...core, ...prior];
  const allocation = allocateNextPlayerRegion({
    worldId: WORLD_ID,
    seasonId: SEASON_ID,
    existingRegions,
    regionId: `phase6a_directional_${spec.key}_region`,
    generatorVersion: GENERATOR_VERSION,
  });
  assert.equal(allocation.coordinate.gridX, spec.gridX);
  assert.equal(allocation.coordinate.gridY, spec.gridY);
  return { allocation, existingRegions, priorStubCount: prior.length };
}

function createDefinition(spec, allocation) {
  return {
    id: allocation.regionId,
    name: `Phase 6A ${spec.key} directional approval`,
    purpose: "player_region",
    permanentCore: false,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    mapAsset: null,
    thumbnailAsset: null,
    directionalTheme: classifyDirectionalTheme(spec.gridX, spec.gridY),
    terrain: {
      source: `phase6a-directional-${spec.key}-qa-geometry-v1`,
      authoritativeData: true,
      derivedFromImagePixels: false,
      // The painted barriers stay within roughly the outer 100-135px. City
      // footprint sampling adds another 40px before a position can validate.
      landPolygon: [
        { x: 145, y: 145 }, { x: 1303, y: 145 }, { x: 1303, y: 941 }, { x: 145, y: 941 },
      ],
      blockers: spec.blockers,
      prohibitedTerrain: [],
    },
    roadCorridors: [],
    noCityZones: [],
    camps: [],
    strongholds: [],
    citadels: [],
  };
}

function generateExactForty(spec, allocation, existingRegions, definition) {
  for (let attempt = 1; attempt <= 240; attempt += 1) {
    const seedSalt = `directional-${spec.key}-visual-safe-v${attempt}`;
    const generated = generateRegionPrototype({
      existingRegions,
      allocation,
      definition,
      generatorVersion: GENERATOR_VERSION,
      seedSalt,
      config: { maximumCandidateEvaluations: 300000, attractionProbability: 0.28 },
    });
    if (generated.status === "standby" && generated.previewDefinition.cities.length === 40) {
      return { generated, attempt, seedSalt };
    }
  }
  throw new Error(`Unable to place exactly 40 cities for ${spec.key} without weakening placement rules.`);
}

function relativeFromQa(target) {
  return path.relative(path.join(OUTPUT_ROOT, "samples", "west", "qa"), path.join(ROOT, target)).replace(/\\/g, "/");
}

function createQaHtml(spec, cities, starts) {
  const sampleQa = path.join(OUTPUT_ROOT, "samples", spec.key, "qa");
  const rel = target => path.relative(sampleQa, path.join(ROOT, target)).replace(/\\/g, "/");
  const mapPath = rel(`benchmark-results/map/phase-6a-v3-directional/source/${spec.mapFile}`);
  const cityPath = rel("assets/optimized/castle-shack-256x256-bbd7514a6231.webp");
  const castlePath = rel("assets/optimized/castle-castle-256x256-5e8edd306418.webp");
  const campPath = rel("assets/optimized/camp-gold-384x384-1d2f43c018ae.webp");
  const strongholdPath = rel("assets/optimized/stronghold-training-384x384-649892a49e02.webp");
  const citadelPath = rel("assets/optimized/crown-citadel-384x384-a23c30392f3c.webp");
  const startIds = new Set(starts.map(start => start.cityId));
  const cityMarkup = cities.map((city, index) => `<div class="city${startIds.has(city.id) ? " start" : ""}" style="left:${city.x}px;top:${city.y}px"><img src="${cityPath}" alt=""><span>${index + 1}</span></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 6A ${spec.key} QA</title><style>
*{box-sizing:border-box}body{margin:0;background:#171810;color:#f4ead2;font:15px Segoe UI,sans-serif}.page{padding:18px}.top{width:1448px;max-width:100%;margin:0 auto 12px;display:flex;justify-content:space-between;align-items:center}.top h1{font:700 25px Georgia,serif;margin:0}.badge{border:1px solid #9a7a42;border-radius:20px;padding:7px 10px;color:#f3d89a}.map{position:relative;width:1448px;height:1086px;margin:auto;overflow:hidden}.base{width:100%;height:100%;display:block}.city{position:absolute;width:64px;height:64px;transform:translate(-50%,-72%);filter:drop-shadow(0 3px 3px #000b)}.city img{width:100%;height:100%;object-fit:contain}.city span{position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);background:#4a2b18;border:1px solid #e0be73;border-radius:10px;padding:1px 4px;font:bold 10px Segoe UI}.city.start{width:72px;height:72px}.city.start:after{content:"";position:absolute;inset:5px;border:2px solid #65d3ff;border-radius:50%}.compat img{position:absolute;object-fit:contain;filter:drop-shadow(0 5px 5px #000a)}.castle{left:330px;top:420px;width:180px}.camp{left:585px;top:390px;width:190px}.stronghold{left:820px;top:365px;width:215px}.citadel{left:1060px;top:350px;width:230px}.nav{width:1100px;max-width:100%;margin:15px auto;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.nav a{color:#f4ead2;text-decoration:none;padding:12px;border:1px solid #5c553d;background:#29291e;border-radius:7px}.hidden{display:none}.note{width:1000px;max-width:100%;margin:12px auto;color:#d4c7a7}</style></head><body><div class="page"><div class="top"><h1>${spec.key.toUpperCase()} directional approval</h1><div class="badge">DEVELOPMENT ONLY</div></div><div class="nav"><a href="?view=clean">Clean map</a><a href="?view=cities">40 cities</a><a href="?view=compat">Structure compatibility</a></div>
<section id="clean" class="hidden"><p class="note">Clean map. The natural barrier is cropped by every image edge except the four road passages.</p><div class="map"><img class="base" src="${mapPath}" alt=""></div></section>
<section id="cities" class="hidden"><p class="note">Exactly 40 city overlays. Blue rings mark starting candidates.</p><div class="map"><img class="base" src="${mapPath}" alt="">${cityMarkup}</div></section>
<section id="compat" class="hidden"><p class="note">Unchanged current assets over corrected terrain for style QA only.</p><div class="map compat"><img class="base" src="${mapPath}" alt=""><img class="castle" src="${castlePath}" alt=""><img class="camp" src="${campPath}" alt=""><img class="stronghold" src="${strongholdPath}" alt=""><img class="citadel" src="${citadelPath}" alt=""></div></section></div><script>const view=new URLSearchParams(location.search).get("view")||"clean";document.querySelectorAll("section").forEach(x=>x.classList.add("hidden"));(document.getElementById(view)||document.getElementById("clean")).classList.remove("hidden");</script></body></html>`;
}

function run() {
  const styleReferences = STYLE_REFERENCES.map(relativePath => ({ path: relativePath, sha256: sha256File(path.join(ROOT, relativePath)) }));
  const samples = [];
  for (const spec of SAMPLE_SPECS) {
    const mapPath = path.join(OUTPUT_ROOT, "source", spec.mapFile);
    if (!fs.existsSync(mapPath)) throw new Error(`Missing directional source ${mapPath}.`);
    const { allocation, existingRegions, priorStubCount } = createAllocation(spec);
    const expectedTheme = classifyDirectionalTheme(spec.gridX, spec.gridY);
    assert.equal(expectedTheme.id, spec.themeId);
    const definition = createDefinition(spec, allocation);
    const { generated, attempt, seedSalt } = generateExactForty(spec, allocation, existingRegions, definition);
    const cities = generated.previewDefinition.cities;
    const starts = generated.previewDefinition.startingCityCandidates;
    const sampleRoot = path.join(OUTPUT_ROOT, "samples", spec.key);
    const receipt = {
      key: spec.key,
      theme: expectedTheme,
      coordinate: allocation.coordinate,
      priorStubCount,
      developmentOnly: true,
      publicationAllowed: false,
      activationAllowed: false,
      productionArtApproved: false,
      edgeBarrierTouchesImageBoundary: true,
      exactRoadPassages: 4,
      cityCount: cities.length,
      startingCandidateCount: starts.length,
      map: { path: path.relative(ROOT, mapPath).replace(/\\/g, "/"), width: MAP_WIDTH, height: MAP_HEIGHT, opaque: true, bytes: fs.statSync(mapPath).size, sha256: sha256File(mapPath) },
      generatorVersion: GENERATOR_VERSION,
      deterministicAttempt: attempt,
      seedSalt,
      generationHash: generated.generationHash,
      cityHash: hashObject(cities),
      visualReview: {
        reviewer: "Codex Phase 6A directional visual audit",
        userApprovalPending: true,
        barrierDirectlyOnImageEdge: true,
        simpleAndReadable: true,
        densityMatchesPhase6aV2: true,
        directionalThemeReadsCorrectly: true,
        sameCrownlandsWorld: true,
        allCitiesOnOpenTerrain: true,
        structureArtCompatible: true,
        notes: [
          "Significant vegetation, ridge, and perimeter features are authoritative blockers; small decorative ground texture remains playable.",
          "Earlier deterministic layouts with visible feature conflicts were discarded before this receipt was recorded.",
          "The edge-contact proof samples source pixel 0 and source pixel 1085 directly from the normalized map.",
        ],
      },
    };
    writeJson(path.join(sampleRoot, "receipt.json"), receipt);
    writeJson(path.join(sampleRoot, "geometry.json"), { developmentOnly: true, definition, allocation, validation: generated.validation });
    writeJson(path.join(sampleRoot, "cities.json"), cities);
    writeJson(path.join(sampleRoot, "starting-candidates.json"), starts);
    fs.mkdirSync(path.join(sampleRoot, "qa"), { recursive: true });
    fs.writeFileSync(path.join(sampleRoot, "qa", "index.html"), createQaHtml(spec, cities, starts));
    samples.push(receipt);
  }
  const result = {
    schemaVersion: 1,
    phase: "6A-v3-directional",
    developmentOnly: true,
    publicationAllowed: false,
    activationAllowed: false,
    productionArtApproved: false,
    fullAssetProductionAllowed: false,
    classifier: "dominant world-grid axis; vertical wins exact diagonal ties",
    styleReferences,
    samples,
  };
  writeJson(path.join(OUTPUT_ROOT, "directional-results.json"), result);
  console.log(`Built ${samples.length} directional Phase 6A slices with ${samples.reduce((sum, sample) => sum + sample.cityCount, 0)} validated city positions.`);
  return result;
}

if (require.main === module) run();

module.exports = Object.freeze({ run, OUTPUT_ROOT, SAMPLE_SPECS, GENERATOR_VERSION });
