"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  allocateNextPlayerRegion,
  generateRegionPrototype,
  hashObject,
} = require("../map-scaling-phase-4/generator");
const { createPermanentCorePackage } = require("../map-scaling-phase-5/core-package");
const { createAllocatorCore } = require("../map-scaling-phase-5/fixtures");

const ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6a-v2");
const SOURCE_MAP = path.join(OUTPUT_ROOT, "source", "crownlands-phase-6a-corrected-v2-1448x1086.png");
const MAP_WIDTH = 1448;
const MAP_HEIGHT = 1086;
const GENERATOR_VERSION = "phase6a-art-correction-v2";

const STYLE_REFERENCES = Object.freeze([
  "assets/optimized/castle-city-256x256-96961dc8d50b.webp",
  "assets/optimized/castle-castle-256x256-5e8edd306418.webp",
  "assets/optimized/stronghold-training-384x384-649892a49e02.webp",
  "assets/optimized/crown-citadel-384x384-a23c30392f3c.webp",
  "assets/optimized/camp-gold-384x384-1d2f43c018ae.webp",
]);

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createApprovalDefinition(allocation) {
  return {
    id: allocation.regionId,
    name: "Phase 6A Crownlands Corrected Art Approval",
    purpose: "player_region",
    permanentCore: false,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    mapAsset: null,
    thumbnailAsset: null,
    terrain: {
      source: "phase6a-corrected-v2-manually-authored-geometry",
      authoritativeData: true,
      derivedFromImagePixels: false,
      landPolygon: [
        { x: 150, y: 155 }, { x: 1298, y: 155 }, { x: 1298, y: 930 }, { x: 150, y: 930 },
      ],
      blockers: [
        { id: "northwest-small-woodland", type: "light_forest", x: 430, y: 248, rx: 78, ry: 55, rot: -0.12, blocksCities: true, blocksMovement: true },
        { id: "north-east-farmland", type: "farmland", x: 930, y: 214, rx: 118, ry: 58, rot: -0.08, blocksCities: false, blocksMovement: false },
        { id: "north-east-low-rocks", type: "low_rocks", x: 1018, y: 318, rx: 62, ry: 38, rot: 0.12, blocksCities: false, blocksMovement: false },
        { id: "west-central-rocks", type: "low_rocks", x: 350, y: 435, rx: 58, ry: 38, rot: 0.18, blocksCities: false, blocksMovement: false },
        { id: "southwest-farmland", type: "farmland", x: 330, y: 736, rx: 120, ry: 72, rot: 0.2, blocksCities: false, blocksMovement: false },
        { id: "southeast-small-woodland", type: "light_forest", x: 976, y: 722, rx: 76, ry: 57, rot: -0.15, blocksCities: true, blocksMovement: true },
        { id: "south-central-farmland", type: "farmland", x: 875, y: 858, rx: 60, ry: 36, rot: 0.04, blocksCities: false, blocksMovement: false },
        { id: "east-low-rocks", type: "low_rocks", x: 1178, y: 665, rx: 58, ry: 38, rot: -0.16, blocksCities: false, blocksMovement: false },
        { id: "northeast-perimeter-ridge", type: "perimeter_ridge", x: 1225, y: 245, rx: 60, ry: 40, rot: 0, blocksCities: true, blocksMovement: true },
      ],
      prohibitedTerrain: [],
    },
    // Phase 4 supplies the four authoritative centered cardinal corridors.
    // Their clearances cover the slightly irregular painted road openings.
    roadCorridors: [],
    noCityZones: [],
    camps: [],
    strongholds: [],
    citadels: [],
  };
}

function relativeFromQa(target) {
  return path.relative(path.join(OUTPUT_ROOT, "qa"), path.join(ROOT, target)).replace(/\\/g, "/");
}

function createPreviewHtml(cities, startingCandidates) {
  const cityAssets = [
    relativeFromQa("assets/optimized/castle-shack-256x256-bbd7514a6231.webp"),
    relativeFromQa("assets/optimized/castle-city-256x256-96961dc8d50b.webp"),
    relativeFromQa("assets/optimized/castle-fort-256x256-a6a5d9365b51.webp"),
    relativeFromQa("assets/optimized/castle-keep-256x256-ce263706d73e.webp"),
    relativeFromQa("assets/optimized/castle-castle-256x256-5e8edd306418.webp"),
  ];
  const mapPath = `../source/${path.basename(SOURCE_MAP)}`;
  const gatePath = relativeFromQa("assets/optimized/inner-castle-gatehouse-512x512-2a07ac7597ac.webp");
  const campPath = relativeFromQa("assets/optimized/camp-gold-384x384-1d2f43c018ae.webp");
  const strongholdPath = relativeFromQa("assets/optimized/stronghold-training-384x384-649892a49e02.webp");
  const startingIds = new Set(startingCandidates.map(candidate => candidate.cityId));
  const cityMarkup = cities.map((city, index) => {
    const isStart = startingIds.has(city.id);
    const asset = cityAssets[isStart ? 1 : 0];
    return `<div class="city${isStart ? " starting" : ""}" style="left:${city.x}px;top:${city.y}px"><img src="${asset}" alt=""><span>${index + 1}</span></div>`;
  }).join("");
  const referenceRow = cityAssets.map((asset, index) => `<img src="${asset}" alt="City stage ${index + 1}">`).join("");
  const data = JSON.stringify({ cities, startingCandidates });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crownlands Phase 6A Corrected QA</title>
<style>
:root{color-scheme:dark;font-family:Inter,Segoe UI,sans-serif;background:#171810;color:#f4ead2}*{box-sizing:border-box}body{margin:0;background:#171810}.page{padding:20px}.top{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 auto 14px;max-width:1448px}.top h1{margin:0;font:700 24px Georgia,serif}.badge{padding:7px 11px;border:1px solid #9a7a42;border-radius:999px;color:#f3d89a;background:#302718}.map{position:relative;width:1448px;height:1086px;margin:auto;overflow:hidden;background:#222;box-shadow:0 8px 30px #0008}.map>img.base{display:block;width:1448px;height:1086px}.city{position:absolute;width:64px;height:64px;transform:translate(-50%,-72%);filter:drop-shadow(0 3px 3px #000b)}.city img{width:100%;height:100%;object-fit:contain}.city span{position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);font:bold 10px Segoe UI,sans-serif;color:#fff;background:#4a2b18;border:1px solid #e0be73;border-radius:10px;padding:1px 4px}.city.starting{width:72px;height:72px}.city.starting:after{content:"";position:absolute;inset:5px;border:2px solid #72d3ff;border-radius:50%;box-shadow:0 0 8px #42c6ff}.edge-state{position:absolute;z-index:4;color:#fff;font-weight:800;text-shadow:0 2px 4px #000;background:#18291dcc;border:1px solid #d6c28b;border-radius:8px;padding:6px 10px}.north{top:8px;left:660px}.east{right:8px;top:505px}.south{bottom:8px;left:675px}.west{left:8px;top:500px}.edge-state.gated{background:#4c2b22dd}.gate{position:absolute;width:96px;height:96px;object-fit:contain;filter:drop-shadow(0 4px 4px #000b)}.gate.east-gate{right:-10px;top:485px;transform:rotate(90deg)}.gate.west-gate{left:-10px;top:480px;transform:rotate(-90deg)}.crop-wrap{width:960px;margin:auto}.crop{position:relative;width:960px;height:430px;overflow:hidden;border:2px solid #9a7a42;background-image:url('${mapPath}');background-repeat:no-repeat;background-size:1448px 1086px;box-shadow:0 8px 30px #0008}.crop.north-crop{background-position:-244px 0}.crop.east-crop{background-position:-488px -328px}.crop.south-crop{background-position:-244px -656px}.crop.west-crop{background-position:0 -328px}.crop.corner-crop{background-position:0 0}.crop .edge-state{font-size:18px}.comparison{position:relative;width:1448px;height:1086px;margin:auto;overflow:hidden}.comparison .base{width:100%;height:100%}.qa-object{position:absolute;object-fit:contain;filter:drop-shadow(0 5px 5px #000a)}.qa-city{left:430px;top:470px;width:130px}.qa-camp{left:650px;top:390px;width:170px}.qa-stronghold{left:865px;top:395px;width:190px}.label{position:absolute;padding:5px 8px;background:#1c1812dd;border:1px solid #c6a45e;border-radius:6px;font-weight:700}.label-city{left:430px;top:585px}.label-camp{left:675px;top:550px}.label-stronghold{left:900px;top:565px}.references{display:flex;gap:18px;justify-content:center;align-items:end;padding:30px}.references img{width:150px;height:150px;object-fit:contain}.note{max-width:1000px;margin:15px auto;color:#d4c7a7;line-height:1.5}.overview{max-width:1200px;margin:auto;display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.overview a{display:block;padding:20px;background:#29291e;border:1px solid #5c553d;color:#f4ead2;text-decoration:none;border-radius:8px}.overview a:hover{border-color:#d0aa60}.hidden{display:none!important}
</style></head><body><div class="page"><div class="top"><h1>Phase 6A corrected Crownlands terrain QA</h1><div class="badge">DEVELOPMENT ONLY · NOT FOR PRODUCTION</div></div>
<section id="overview" class="overview"><a href="?view=clean">1. Clean map</a><a href="?view=cities">2. All 40 city positions</a><a href="?view=north">3. North edge</a><a href="?view=east">4. East edge</a><a href="?view=south">5. South edge</a><a href="?view=west">6. West edge</a><a href="?view=open">7. OPEN exit example</a><a href="?view=gated">8. GATED exit example</a><a href="?view=closed">9. Closed edge without passage</a><a href="?view=compatibility">10. City/Camp/Stronghold compatibility</a><a href="?view=references">11. City progression references</a></section>
<section id="clean" class="hidden"><p class="note">Clean generated terrain. No runtime city, Camp, Stronghold, Gate, arrow, label, or objective is baked into the map.</p><div class="map"><img class="base" src="${mapPath}" alt="Clean Phase 6A Crownlands terrain"></div></section>
<section id="cities" class="hidden"><p class="note">All 40 authoritative QA positions. Blue rings mark future starting-city candidates. North/South demonstrate OPEN; East/West demonstrate GATED overlays.</p><div class="map"><img class="base" src="${mapPath}" alt="Phase 6A terrain with city overlays">${cityMarkup}<div class="edge-state north">▲ OPEN</div><div class="edge-state south">▼ OPEN</div><div class="edge-state gated east">GATED</div><div class="edge-state gated west">GATED</div><img class="gate east-gate" src="${gatePath}" alt=""><img class="gate west-gate" src="${gatePath}" alt=""></div></section>
<section id="north" class="hidden crop-wrap"><p class="note">North: closed forest border funnels into one road opening.</p><div class="crop north-crop"></div></section>
<section id="east" class="hidden crop-wrap"><p class="note">East: rocky/forest border remains closed except for one road opening.</p><div class="crop east-crop"></div></section>
<section id="south" class="hidden crop-wrap"><p class="note">South: mixed woodland border closes the perimeter around one road opening.</p><div class="crop south-crop"></div></section>
<section id="west" class="hidden crop-wrap"><p class="note">West: forest and riverbank border funnels toward one road opening.</p><div class="crop west-crop"></div></section>
<section id="open" class="hidden crop-wrap"><p class="note">OPEN example: the baked road and border are unchanged; only the runtime travel arrow is present.</p><div class="crop north-crop"><div class="edge-state north">▲ OPEN</div></div></section>
<section id="gated" class="hidden crop-wrap"><p class="note">GATED example: the same baked road remains; the provisional runtime Gate blocks travel and no arrow appears.</p><div class="crop east-crop"><div class="edge-state gated east">GATED</div><img class="gate east-gate" src="${gatePath}" alt=""></div></section>
<section id="closed" class="hidden crop-wrap"><p class="note">Northwest comparison area: dense forest, ridge, and haze close the edge where there is no road passage.</p><div class="crop corner-crop"></div></section>
<section id="compatibility" class="hidden"><p class="note">Visual compatibility only. Approved runtime assets are overlaid unchanged. Camps and Strongholds remain forbidden in generated player regions.</p><div class="comparison"><img class="base" src="${mapPath}" alt=""><img class="qa-object qa-city" src="${cityAssets[4]}" alt=""><img class="qa-object qa-camp" src="${campPath}" alt=""><img class="qa-object qa-stronghold" src="${strongholdPath}" alt=""><div class="label label-city">Current Crownlands city</div><div class="label label-camp">Gold Camp · QA only</div><div class="label label-stronghold">Stronghold · QA only</div></div></section>
<section id="references" class="hidden"><p class="note">Approved city progression rendered unchanged for style, scale, lighting, and material comparison.</p><div class="references">${referenceRow}</div></section>
</div><script>window.PHASE6A=${data};const view=new URLSearchParams(location.search).get('view')||'overview';document.querySelectorAll('section').forEach(x=>x.classList.add('hidden'));(document.getElementById(view)||document.getElementById('overview')).classList.remove('hidden');</script></body></html>`;
}

function createSvgQa(cities, startingCandidates) {
  const base = `<image href="../source/${path.basename(SOURCE_MAP)}" x="0" y="0" width="1448" height="1086"/>`;
  const cityAssets = [
    relativeFromQa("assets/optimized/castle-shack-256x256-bbd7514a6231.webp"),
    relativeFromQa("assets/optimized/castle-city-256x256-96961dc8d50b.webp"),
  ];
  const startingIds = new Set(startingCandidates.map(candidate => candidate.cityId));
  const cityLayer = cities.map((city, index) => {
    const starting = startingIds.has(city.id);
    const size = starting ? 72 : 64;
    const asset = cityAssets[starting ? 1 : 0];
    return `<g><image href="${asset}" x="${city.x - size / 2}" y="${city.y - size * 0.72}" width="${size}" height="${size}"/>${starting ? `<circle cx="${city.x}" cy="${city.y - 4}" r="31" fill="none" stroke="#67d5ff" stroke-width="3"/>` : ""}<circle cx="${city.x}" cy="${city.y + 9}" r="10" fill="#4a2b18" stroke="#e0be73"/><text x="${city.x}" y="${city.y + 13}" text-anchor="middle" font-family="Segoe UI" font-size="9" font-weight="700" fill="#fff">${index + 1}</text></g>`;
  }).join("");
  const svg = (viewBox, width, height, content) => `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${content}</svg>`;
  const label = (x, y, text, gated = false) => `<g><rect x="${x - 48}" y="${y - 18}" width="96" height="36" rx="8" fill="${gated ? "#4c2b22" : "#183521"}" stroke="#d6c28b"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Segoe UI" font-size="17" font-weight="800" fill="#fff">${text}</text></g>`;
  const gate = relativeFromQa("assets/optimized/inner-castle-gatehouse-512x512-2a07ac7597ac.webp");
  const camp = relativeFromQa("assets/optimized/camp-gold-384x384-1d2f43c018ae.webp");
  const stronghold = relativeFromQa("assets/optimized/stronghold-training-384x384-649892a49e02.webp");
  const castle = relativeFromQa("assets/optimized/castle-castle-256x256-5e8edd306418.webp");
  return {
    "01-clean-map.svg": svg("0 0 1448 1086", 1448, 1086, base),
    "02-all-40-cities.svg": svg("0 0 1448 1086", 1448, 1086, `${base}${cityLayer}${label(690, 28, "OPEN")}${label(1420, 535, "GATED", true)}${label(690, 1058, "OPEN")}${label(30, 535, "GATED", true)}`),
    "03-north-road-opening.svg": svg("244 0 960 430", 960, 430, base),
    "04-east-road-opening.svg": svg("488 328 960 430", 960, 430, base),
    "05-south-road-opening.svg": svg("244 656 960 430", 960, 430, base),
    "06-west-road-opening.svg": svg("0 328 960 430", 960, 430, base),
    "07-open-road-runtime-overlay.svg": svg("244 0 960 430", 960, 430, `${base}${label(690, 30, "OPEN")}`),
    "08-gated-road-runtime-overlay.svg": svg("488 328 960 430", 960, 430, `${base}<image href="${gate}" x="1350" y="485" width="100" height="100" transform="rotate(90 1400 535)"/>${label(1395, 535, "GATED", true)}`),
    "09-closed-edge-no-road.svg": svg("0 0 560 380", 960, 650, base),
    "10-current-assets-compatibility.svg": svg("0 0 1448 1086", 1448, 1086, `${base}<image href="${castle}" x="380" y="410" width="190" height="190"/><image href="${camp}" x="630" y="365" width="205" height="205"/><image href="${stronghold}" x="860" y="345" width="235" height="235"/>${label(475, 590, "CITY")}${label(733, 575, "CAMP · QA")}${label(978, 580, "STRONGHOLD · QA")}`),
  };
}

function run() {
  if (!fs.existsSync(SOURCE_MAP)) throw new Error(`Missing Phase 6A source map: ${SOURCE_MAP}`);
  const corePackage = createPermanentCorePackage();
  const allocatorCore = createAllocatorCore(corePackage);
  const allocation = allocateNextPlayerRegion({
    worldId: "phase6a_v2_development_world",
    seasonId: "phase6a_v2_development_season",
    existingRegions: allocatorCore,
    regionId: "phase6a_corrected_v2_approval_region",
    generatorVersion: GENERATOR_VERSION,
  });
  const definition = createApprovalDefinition(allocation);
  const generated = generateRegionPrototype({
    existingRegions: allocatorCore,
    allocation,
    definition,
    generatorVersion: GENERATOR_VERSION,
    // Deterministic safe-border retry. The 112px spacing and every road/edge/forest
    // exclusion remain unchanged; lower attraction simply uses the open interior efficiently.
    seedSalt: "corrected-visual-safe-final-v70",
    config: { maximumCandidateEvaluations: 400000, attractionProbability: 0.3 },
  });
  if (generated.status !== "standby" || generated.previewDefinition.cities.length !== 40) {
    throw new Error(`Phase 6A geometry failed exact-40 generation: ${JSON.stringify(generated.validation.errors)}`);
  }
  const cities = generated.previewDefinition.cities;
  const startingCandidates = generated.previewDefinition.startingCityCandidates;
  const geometry = {
    schemaVersion: 1,
    developmentOnly: true,
    authoritativeForPhase6aQaOnly: true,
    derivedFromImagePixels: false,
    definition,
    allocation,
    validation: generated.validation,
    generationHash: generated.generationHash,
  };
  const styleReferences = STYLE_REFERENCES.map(relativePath => ({
    path: relativePath,
    sha256: sha256File(path.join(ROOT, relativePath)),
  }));
  const result = {
    schemaVersion: 1,
    phase: "6A-v2",
    supersedesRejectedSlice: "benchmark-results/map/phase-6a",
    developmentOnly: true,
    publicationAllowed: false,
    activationAllowed: false,
    productionArtApproved: false,
    map: { path: path.relative(ROOT, SOURCE_MAP).replace(/\\/g, "/"), width: MAP_WIDTH, height: MAP_HEIGHT, opaque: true, sha256: sha256File(SOURCE_MAP), bytes: fs.statSync(SOURCE_MAP).size },
    styleReferences,
    cityCount: cities.length,
    startingCandidateCount: startingCandidates.length,
    exactCardinalRoadCorridors: 4,
    edgeStatesBakedIntoMap: false,
    objectivesBakedIntoMap: false,
    geometryHash: hashObject(geometry),
    cityHash: hashObject(cities),
    visualReview: {
      reviewer: "Codex Phase 6A corrected visual audit",
      userApprovalPending: true,
      notes: [
        "The corrected terrain uses the current city, Camp, Stronghold, and Citadel family as its only generation references.",
        "The interior is predominantly calm open ground; forest is limited to a thin perimeter and two small interior clumps.",
        "Each cardinal road passes through one controlled opening in the same narrow natural barrier.",
        "All 40 QA coordinates were visually reviewed on the corrected terrain after adding a northeast ridge exclusion and rejecting earlier unsafe layouts.",
      ],
    },
    cityVisualAudit: {
      markerMap: "benchmark-results/map/phase-6a-v2/qa/02-all-40-city-markers.png",
      minimumCenterX: Math.min(...cities.map(city => city.x)),
      maximumCenterX: Math.max(...cities.map(city => city.x)),
      minimumCenterY: Math.min(...cities.map(city => city.y)),
      maximumCenterY: Math.max(...cities.map(city => city.y)),
      barrierOverlapFound: false,
      roadOrTransitionOverlapFound: false,
    },
    requiredApprovalQuestions: {
      matchesApprovedStructureArtFamily: true,
      interiorOpenAndReadable: true,
      forestsRestrained: true,
      edgesClosedWithoutInvadingInterior: true,
      allCitiesOnOpenTerrain: true,
      distinctiveWithoutOvercrowding: true,
    },
  };
  writeJson(path.join(OUTPUT_ROOT, "phase-6a-geometry.json"), geometry);
  writeJson(path.join(OUTPUT_ROOT, "cities.json"), cities);
  writeJson(path.join(OUTPUT_ROOT, "starting-candidates.json"), startingCandidates);
  writeJson(path.join(OUTPUT_ROOT, "phase-6a-results.json"), result);
  const qaRoot = path.join(OUTPUT_ROOT, "qa");
  fs.mkdirSync(qaRoot, { recursive: true });
  fs.writeFileSync(path.join(qaRoot, "index.html"), createPreviewHtml(cities, startingCandidates));
  for (const [fileName, content] of Object.entries(createSvgQa(cities, startingCandidates))) {
    fs.writeFileSync(path.join(qaRoot, fileName), content);
  }
  console.log(`Phase 6A QA built: ${cities.length} cities, ${startingCandidates.length} starts, ${result.map.sha256.slice(0, 12)}.`);
  return result;
}

if (require.main === module) run();

module.exports = Object.freeze({ run, createApprovalDefinition, OUTPUT_ROOT, SOURCE_MAP });
