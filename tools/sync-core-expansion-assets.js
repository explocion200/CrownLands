"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const paths = Object.freeze({
  browserCatalog: path.join(root, "assets", "worlds", "core-expansion-v1", "region-catalog.js"),
  browserJsonCatalog: path.join(root, "assets", "worlds", "core-expansion-v1", "region-catalog.json"),
  serverCatalog: path.join(root, "functions", "core-expansion-region-catalog.json"),
  serverLayout: path.join(root, "functions", "core-expansion-world-layout.json"),
  receipt: path.join(root, "assets", "worlds", "core-expansion-v1", "build-receipt.json"),
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function hash(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(stable(value)));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Camp paintings are client presentation. Keep the installed server's world
// contract untouched while projecting its original asset references into the
// current browser catalog and lazy region definitions.
const campArtwork = readJson(path.join(root, "docs/visual-qa/camp-artwork-v3/assets.json")).assets;
const campAssetReplacements = new Map(campArtwork.flatMap(asset =>
  [asset.replaces, asset.supersedes].filter(Boolean).map(previous => [previous, asset.output])));
function projectCampArtwork(value) {
  if (typeof value === "string") return campAssetReplacements.get(value) || value;
  if (Array.isArray(value)) return value.map(projectCampArtwork);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projectCampArtwork(item)]));
}

function createAssetReceipt(catalog) {
  const relativePaths = new Set();
  for (const region of Array.isArray(catalog.regions) ? catalog.regions : []) {
    const presentation = region.artPresentation || {};
    for (const source of [region.mapAsset, region.thumbnailAsset,
      ...(presentation.scenery || []).map(item => item.asset),
      ...(presentation.landmarks || []).map(item => item.asset),
      ...Object.values(catalog.mapPresentation?.cityStageAssets || {})]) {
      const relativePath = String(source || "").trim();
      if (!relativePath.startsWith("assets/worlds/core-expansion-v1/")) {
        throw new Error(`${region.id || "Unknown region"} has an invalid Core-expansion asset path.`);
      }
      relativePaths.add(relativePath);
    }
  }
  return Object.fromEntries([...relativePaths].map(relativePath => {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) throw new Error(`Core-expansion asset is missing: ${relativePath}`);
    const bytes = fs.readFileSync(absolutePath);
    return [relativePath, { bytes: bytes.length, sha256: hash(bytes) }];
  }));
}

function validateOrWrite(filePath, expected, label, checkOnly) {
  const current = fs.readFileSync(filePath, "utf8");
  if (current.replace(/\r\n/g, "\n") === expected.replace(/\r\n/g, "\n")) return;
  if (checkOnly) throw new Error(`${label} is stale. Run node tools/sync-core-expansion-assets.js.`);
  fs.writeFileSync(filePath, expected, "utf8");
}

function syncCoreExpansionAssets({ checkOnly = false } = {}) {
  const catalog = projectCampArtwork(readJson(paths.serverCatalog));
  const layout = readJson(paths.serverLayout);
  const receipt = readJson(paths.receipt);
  const assets = createAssetReceipt(catalog);
  const assetVersion = hash(assets).slice(0, 12);
  const nextCatalog = { ...catalog, assetVersion };
  const nextReceipt = {
    ...receipt,
    assetVersion,
    catalogHash: hash(nextCatalog),
    worldLayoutHash: hash(layout),
    assets,
  };

  validateOrWrite(paths.browserJsonCatalog, stableJson(nextCatalog), "Browser Core-expansion JSON catalog", checkOnly);
  for (const map of layout.maps.filter(map => map.camps?.length)) {
    const regionPath = path.join(root, "assets/worlds/core-expansion-v1/regions", `${map.id}.json`);
    validateOrWrite(regionPath, stableJson(projectCampArtwork(readJson(regionPath))), `${map.id} camp artwork`, checkOnly);
  }
  validateOrWrite(paths.receipt, stableJson(nextReceipt), "Core-expansion build receipt", checkOnly);
  validateOrWrite(
    paths.browserCatalog,
    `window.CROWNLANDS_REGION_CATALOG = Object.freeze(${JSON.stringify(nextCatalog)});\n`,
    "Browser Core-expansion catalog",
    checkOnly,
  );
  console.log(`${checkOnly ? "Validated" : "Synchronized"} Core-expansion asset version ${assetVersion}.`);
  return assetVersion;
}

if (require.main === module) {
  try {
    syncCoreExpansionAssets({ checkOnly: process.argv.includes("--check") });
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}

module.exports = { createAssetReceipt, projectCampArtwork, syncCoreExpansionAssets };
