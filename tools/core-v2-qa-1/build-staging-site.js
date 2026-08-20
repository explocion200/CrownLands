"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createFixture } = require("./fixture.js");

const ROOT = path.resolve(__dirname, "..", "..");
const DIST = path.join(ROOT, "dist");
const OUTPUT = path.join(ROOT, "benchmark-results", "map", "core-v2-qa-1", "staging-site");
const PREFIX = "/__core_b1__";
const STAGING_PROJECT_ID = "crownlands-map-staging-2026";
const PRODUCTION_PROJECT_ID = "crown-land-b15e0";

function assertSafeOutput() {
  const expectedParent = path.join(ROOT, "benchmark-results", "map", "core-v2-qa-1");
  assert(OUTPUT.startsWith(`${expectedParent}${path.sep}`), "QA-1 output must remain inside its benchmark directory.");
  assert.equal(path.basename(OUTPUT), "staging-site");
}

function writeFile(relativePath, body) {
  const target = path.join(OUTPUT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}

function copyFile(source, relativePath) {
  const target = path.join(OUTPUT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(source, relativePath) {
  const target = path.join(OUTPUT, relativePath);
  fs.cpSync(source, target, { recursive: true, force: true });
}

function browserFixture(fixture) {
  const { mapData: _mapData, regionCatalog: _regionCatalog, ...safeFixture } = fixture;
  return safeFixture;
}

function compatibilityMapToRegionDefinition(map = {}) {
  return {
    id: map.id,
    name: map.label,
    type: map.type,
    gridX: map.gridX,
    gridY: map.gridY,
    width: map.imageWidth,
    height: map.imageHeight,
    imagePath: map.imageSrc,
    thumbnailPath: map.thumbnailSrc,
    cityCapacity: map.cityCapacity,
    cities: map.cities || [],
    strongholds: (map.objectives || []).map(objective => ({
      ...objective,
      strongholdType: objective.sourceStrongholdType || objective.strongholdType || objective.type,
      bonusType: objective.bonus,
      bonusAmount: objective.bonusPercent,
    })),
    camps: map.camps || [],
    edgeConnections: map.edgeConnections || {},
  };
}

function allowQaHost(source) {
  const allowedExpression = "!(location.hostname === \"127.0.0.1\" || (location.hostname.startsWith(\"crownlands-map-staging-2026--core-v2-qa1\") && location.hostname.endsWith(\".web.app\")))";
  return source.replaceAll('location.hostname !== "127.0.0.1"', allowedExpression);
}

function fixMockRegionResolution(source) {
  const replacement = `  function regionIdFromIsland(islandId) {
    const value = String(islandId || "");
    return Object.keys(fixture.citiesByRegion).find(regionId => value === regionId || value.endsWith(\`-\${regionId}\`))
      || fixture.primaryRegionId;
  }`;
  const pattern = /  function regionIdFromIsland\(islandId\) \{\r?\n    const suffix = String\(islandId \|\| ""\)\.split\("-"\)\.pop\(\);\r?\n    return fixture\.citiesByRegion\[suffix\] \? suffix : fixture\.primaryRegionId;\r?\n  \}/;
  assert(pattern.test(source), "The benchmark Firebase region resolver changed unexpectedly.");
  return source.replace(pattern, replacement);
}

function createRuntimeIndex() {
  let source = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  source = source.replace(
    /<script src="region-catalog\.js[^>]*><\/script>/,
    `<script src="${PREFIX}/early-instrumentation.js"></script>\n  <script src="region-catalog.js?v=core-v2-qa-1"></script>`,
  );
  source = source.replace(/<script src="world-config\.js[^>]*><\/script>/, `<script src="${PREFIX}/world-config.js"></script>`);
  source = source.replace(
    /<script src="assets\/worlds\/world_01\/region-catalog\.js[^>]*><\/script>/,
    `<script src="${PREFIX}/region-catalog.js"></script>`,
  );
  source = source.replace(/<script src="release-manifest\.js[^>]*><\/script>/, `<script src="${PREFIX}/release-manifest.js"></script>`);
  source = source.replace(/<script src="firebase-config\.js[^>]*><\/script>/, `<script src="${PREFIX}/firebase-config.js"></script>`);
  source = source.replace(/<script src="firebaseClient\.js[^>]*><\/script>/, `<script src="${PREFIX}/mock-firebase.js"></script>`);
  source = source.replace(/<script src="game\.js[^>]*><\/script>/, `<script src="${PREFIX}/game.js"></script>`);
  source = source.replace("</head>", `  <meta name="crownlands-environment" content="STAGING-QA-ONLY" />\n</head>`);
  return source;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function main() {
  assertSafeOutput();
  assert(fs.existsSync(DIST), "Run the production build before preparing the QA-1 staging site.");
  if (fs.existsSync(OUTPUT)) fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });

  for (const entry of fs.readdirSync(DIST, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!/\.(?:css|js|webmanifest|ico)$/i.test(entry.name)) continue;
    if (["firebase-config.js", "firebaseClient.js", "game.js", "world-config.js", "release-manifest.js"].includes(entry.name)) continue;
    copyFile(path.join(DIST, entry.name), entry.name);
  }
  for (const directory of ["assets", "audio"]) {
    const source = path.join(DIST, directory);
    if (fs.existsSync(source)) copyDirectory(source, directory);
  }
  const clanQuest = path.join(DIST, "functions", "clanQuestPeriod.js");
  if (fs.existsSync(clanQuest)) copyFile(clanQuest, "functions/clanQuestPeriod.js");

  const fixture = createFixture();
  writeFile("index.html", `<!doctype html><meta charset="utf-8"><title>Crownlands Core v2 QA-1 — STAGING ONLY</title><meta name="robots" content="noindex,nofollow"><h1>STAGING QA ONLY</h1><p>Project: ${STAGING_PROJECT_ID}</p><p>Production project ${PRODUCTION_PROJECT_ID} is forbidden.</p><p><a href="${PREFIX}/">Open Core v2 QA-1</a></p>`);
  writeFile("404.html", "Crownlands Core v2 QA-1 staging fixture — not found.\n");
  writeFile("__core_b1__/index.html", createRuntimeIndex());
  writeFile("__core_b1__/region-catalog.js", `window.CROWNLANDS_REGION_CATALOG = Object.freeze(${JSON.stringify(fixture.regionCatalog)});\n`);
  writeFile("__core_b1__/world-config.js", `window.CROWNLANDS_WORLD_CONFIG = Object.freeze(${JSON.stringify({ version: 1, width: 13000, height: 17000, gridSize: 50, cityCountPerRegion: 70, regions: [], landBridges: [], developmentOnly: true })});\n`);
  writeFile("__core_b1__/release-manifest.js", `window.CROWNLANDS_RELEASE_MANIFEST = Object.freeze(${JSON.stringify({ buildId: "core-v2-qa-1", contractHash: fixture.releaseConfig.apiContractHash, generatedAt: "2041-01-01T12:00:00.000Z" })});\n`);
  writeFile("__core_b1__/firebase-config.js", `window.CROWNLANDS_FIREBASE_CONFIG = Object.freeze({ projectId: "${STAGING_PROJECT_ID}", authDomain: "${STAGING_PROJECT_ID}.firebaseapp.com", storageBucket: "${STAGING_PROJECT_ID}.firebasestorage.app", developmentOnly: true, productionProjectForbidden: "${PRODUCTION_PROJECT_ID}" });\n`);

  const early = allowQaHost(fs.readFileSync(path.join(ROOT, "tools", "map-benchmark", "early-instrumentation.js"), "utf8"));
  writeFile("__core_b1__/early-instrumentation.js", `window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__ = Object.freeze(${JSON.stringify(browserFixture(fixture))});\n${early}`);
  writeFile("__core_b1__/mock-firebase.js", fixMockRegionResolution(allowQaHost(fs.readFileSync(path.join(ROOT, "tools", "map-benchmark", "mock-firebase.js"), "utf8"))));

  let gameSource = fs.readFileSync(path.join(DIST, "game.js"), "utf8");
  gameSource = gameSource.replace("registerCrownlandsServiceWorker();", "/* Core v2 QA-1: service worker disabled in isolated fixture. */");
  gameSource += allowQaHost(fs.readFileSync(path.join(ROOT, "tools", "map-benchmark", "injected-runtime.js"), "utf8"));
  gameSource += allowQaHost(fs.readFileSync(path.join(ROOT, "tools", "core-v2-phase-a1", "injected-runtime.js"), "utf8"));
  gameSource += fs.readFileSync(path.join(ROOT, "tools", "core-v2-phase-b1", "injected-runtime.js"), "utf8");
  gameSource += fs.readFileSync(path.join(ROOT, "tools", "core-v2-qa-1", "injected-runtime.js"), "utf8");
  writeFile("__core_b1__/game.js", gameSource);
  writeFile("__core_b1__/fixture.json", `${JSON.stringify(browserFixture(fixture), null, 2)}\n`);

  const mapReceipts = [];
  fixture.prototypes.forEach(prototype => {
    const source = path.join(ROOT, prototype.candidateMapPath);
    assert(fs.existsSync(source), `Missing final-art map: ${prototype.candidateMapPath}`);
    const relativeTarget = `__core_b1__/maps/${prototype.key}.webp`;
    copyFile(source, relativeTarget);
    mapReceipts.push({ key: prototype.key, regionId: prototype.regionId, source: prototype.candidateMapPath, target: `/${relativeTarget}`, sha256: sha256(source), bytes: fs.statSync(source).size });
  });
  fixture.mapData.maps.forEach(map => writeFile(`__core_b1__/regions/${map.id}.json`, `${JSON.stringify(compatibilityMapToRegionDefinition(map))}\n`));

  const receipt = {
    schemaVersion: 1,
    environment: "STAGING_QA_ONLY",
    stagingProjectId: STAGING_PROJECT_ID,
    productionProjectId: PRODUCTION_PROJECT_ID,
    projectsAreDistinct: STAGING_PROJECT_ID !== PRODUCTION_PROJECT_ID,
    productionMutationAllowed: false,
    productionRuntimeBundled: false,
    exactMapCount: fixture.qa1.exactMapCount,
    exactCityCount: fixture.qa1.exactCityCount,
    maps: mapReceipts,
  };
  writeFile("__core_b1__/build-receipt.json", `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), ...receipt, maps: undefined }));
}

main();
