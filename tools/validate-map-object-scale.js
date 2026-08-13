const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT_DIR = path.resolve(__dirname, "..");
const STRONGHOLD_CANVAS_SIZE = 384;
const CAMP_CANVAS_SIZE = 384;
const SOURCE_CANVAS_SIZE = 640;
const STRONGHOLD_RENDER_SIZE = 154;
const CAMP_RENDER_SIZE = 132;
const CROWN_CITADEL_RENDER_SIZE = 260;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function readWindowData(filePath, globalName) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read(filePath), sandbox, { filename: filePath, timeout: 1000 });
  return JSON.parse(JSON.stringify(sandbox.window[globalName] || {}));
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function getWebpMetadata(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", "WebP is missing its RIFF header.");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP", "WebP is missing its WEBP format header.");
  let offset = 12;
  let hasAlpha = false;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (chunkType === "VP8X") {
      hasAlpha = Boolean(buffer[dataOffset] & 0x10);
      return {
        width: readUInt24LE(buffer, dataOffset + 4) + 1,
        height: readUInt24LE(buffer, dataOffset + 7) + 1,
        hasAlpha,
      };
    }
    if (chunkType === "VP8 ") {
      assert.equal(buffer.toString("hex", dataOffset + 3, dataOffset + 6), "9d012a", "Invalid lossy WebP frame.");
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
        hasAlpha,
      };
    }
    if (chunkType === "VP8L") {
      assert.equal(buffer[dataOffset], 0x2f, "Invalid lossless WebP frame.");
      const b1 = buffer[dataOffset + 1];
      const b2 = buffer[dataOffset + 2];
      const b3 = buffer[dataOffset + 3];
      const b4 = buffer[dataOffset + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
        hasAlpha: Boolean(b4 & 0x10),
      };
    }
    if (chunkType === "ALPH") hasAlpha = true;
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  throw new Error("WebP does not contain a supported frame.");
}

function getPngMetadata(buffer) {
  assert.equal(buffer.toString("hex", 0, 8), "89504e470d0a1a0a", "PNG is missing its signature.");
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR", "PNG is missing its IHDR chunk.");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

const manifest = JSON.parse(read("assets/optimized/manifest.json"));
const layout = JSON.parse(read("functions/world-layout.json"));
const editorLayout = readWindowData("assets/map-editor-data.js", "CROWNLANDS_MAP_EDITOR_DATA");
assert.deepEqual(layout, editorLayout, "Server world layout is out of sync with the map editor data.");

const manifestById = new Map(manifest.assets.map(asset => [asset.id, asset]));
const strongholdSources = new Map([
  ["stronghold-gold", "assets/gold-stronghold.png"],
  ["stronghold-training", "assets/training-stronghold.png"],
  ["stronghold-speed", "assets/speed-stronghold.png"],
  ["stronghold-defense", "assets/defense-stronghold.png"],
]);
const campSources = new Map([
  ["camp-gold", "assets/camps/gold.png"],
  ["camp-troops", "assets/camps/troops.png"],
  ["camp-items", "assets/camps/items.png"],
  ["camp-deed", "assets/camps/deed.png"],
]);

for (const [id, sourcePath] of strongholdSources) {
  const source = getPngMetadata(fs.readFileSync(path.join(ROOT_DIR, sourcePath)));
  assert.equal(source.width, SOURCE_CANVAS_SIZE, `${sourcePath} source width must remain canonical.`);
  assert.equal(source.height, SOURCE_CANVAS_SIZE, `${sourcePath} source height must remain canonical.`);
  assert([4, 6].includes(source.colorType), `${sourcePath} must keep an alpha channel.`);
  const asset = manifestById.get(id);
  assert(asset, `${id} is missing from the optimized manifest.`);
  assert.equal(asset.category, "stronghold-object", `${id} must use the fixed-layout stronghold-object category.`);
  assert.equal(asset.width, STRONGHOLD_CANVAS_SIZE, `${id} optimized width must remain canonical.`);
  assert.equal(asset.height, STRONGHOLD_CANVAS_SIZE, `${id} optimized height must remain canonical.`);
  assert(asset.hasAlpha, `${id} must preserve transparent padding.`);
  const metadata = getWebpMetadata(fs.readFileSync(path.join(ROOT_DIR, asset.output)));
  assert.deepEqual(
    { width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha },
    { width: STRONGHOLD_CANVAS_SIZE, height: STRONGHOLD_CANVAS_SIZE, hasAlpha: true },
    `${id} encoded WebP dimensions drifted from the canonical fixed layout.`
  );
}

for (const [id, sourcePath] of campSources) {
  const source = getPngMetadata(fs.readFileSync(path.join(ROOT_DIR, sourcePath)));
  assert.equal(source.width, SOURCE_CANVAS_SIZE, `${sourcePath} source width must remain canonical.`);
  assert.equal(source.height, SOURCE_CANVAS_SIZE, `${sourcePath} source height must remain canonical.`);
  assert([4, 6].includes(source.colorType), `${sourcePath} must keep an alpha channel.`);
  const asset = manifestById.get(id);
  assert(asset, `${id} is missing from the optimized manifest.`);
  assert.equal(asset.category, "camp-object", `${id} must use the fixed-layout camp-object category.`);
  assert.equal(asset.width, CAMP_CANVAS_SIZE, `${id} optimized width must remain canonical.`);
  assert.equal(asset.height, CAMP_CANVAS_SIZE, `${id} optimized height must remain canonical.`);
  assert(asset.hasAlpha, `${id} must preserve transparent padding.`);
  const metadata = getWebpMetadata(fs.readFileSync(path.join(ROOT_DIR, asset.output)));
  assert.deepEqual(
    { width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha },
    { width: CAMP_CANVAS_SIZE, height: CAMP_CANVAS_SIZE, hasAlpha: true },
    `${id} encoded WebP dimensions drifted from the canonical fixed layout.`
  );
}

const citadel = manifestById.get("crown-citadel");
assert(citadel, "crown-citadel is missing from the optimized manifest.");
assert.equal(citadel.category, "citadel-object", "Crown Citadel must use the fixed-layout citadel-object category.");
assert.equal(citadel.width, STRONGHOLD_CANVAS_SIZE, "Crown Citadel optimized width must remain canonical.");
assert.equal(citadel.height, STRONGHOLD_CANVAS_SIZE, "Crown Citadel optimized height must remain canonical.");
assert(citadel.hasAlpha, "Crown Citadel must preserve transparent padding.");

let normalStrongholds = 0;
let citadels = 0;
let camps = 0;
for (const map of layout.maps || []) {
  for (const objective of map.objectives || []) {
    const type = String(objective.strongholdType || objective.type || "").toLowerCase();
    const isCitadel = type === "crown" || type === "crown_citadel" || String(objective.id || "") === "center_crown_citadel";
    assert.equal(
      Number(objective.size),
      isCitadel ? CROWN_CITADEL_RENDER_SIZE : STRONGHOLD_RENDER_SIZE,
      `${map.id}/${objective.id} has a noncanonical objective render size.`
    );
    if (isCitadel) citadels += 1;
    else normalStrongholds += 1;
  }
  for (const camp of map.camps || []) {
    assert.equal(Number(camp.size), CAMP_RENDER_SIZE, `${map.id}/${camp.id} has a noncanonical camp render size.`);
    camps += 1;
  }
}

assert.equal(normalStrongholds, 4, "The world layout must contain four normal Strongholds.");
assert.equal(citadels, 1, "The world layout must contain one Crown Citadel.");
assert.equal(camps, 4, "The world layout must contain four reward Camps.");
assert(CAMP_RENDER_SIZE < STRONGHOLD_RENDER_SIZE, "Camps must render smaller than Strongholds.");
assert(STRONGHOLD_RENDER_SIZE < CROWN_CITADEL_RENDER_SIZE, "Crown Citadel must render larger than Strongholds.");

const optimizer = read("tools/optimize-game-art.py");
assert.match(optimizer, /FIXED_LAYOUT_CATEGORIES\s*=\s*\{[^}]*"stronghold-object"[^}]*"camp-object"[^}]*"citadel-object"/s);
assert.match(optimizer, /canvas = Image\.new\("RGBA", \(max_width, max_height\), \(0, 0, 0, 0\)\)/);

const game = read("game.js");
assert.match(game, /const DEFAULT_STRONGHOLD_VISUAL_SIZE = 154;/);
assert.match(game, /const DEFAULT_CAMP_VISUAL_SIZE = 132;/);
assert.match(game, /const CROWN_CITADEL_VISUAL_SIZE = 260;/);
assert.match(game, /function getStrongholdVisualSize\(city\) \{\s*if \(isCrownCitadel\(city\)\) return CROWN_CITADEL_VISUAL_SIZE;\s*return DEFAULT_STRONGHOLD_VISUAL_SIZE;\s*\}/);
assert.match(game, /size: DEFAULT_CAMP_VISUAL_SIZE,\s*payoutAtMs:/);
assert.match(game, /artSrc,\s*size: DEFAULT_CAMP_VISUAL_SIZE,\s*activeArmyIds:/);

const styles = read("styles.css");
assert.match(styles, /\.city-node\.stronghold-node \{[^}]*width: var\(--stronghold-size, 154px\);[^}]*height: var\(--stronghold-size, 154px\);/s);
assert.match(styles, /\.stronghold-building \{[^}]*width: var\(--stronghold-size, 154px\);[^}]*height: var\(--stronghold-size, 154px\);/s);
assert.match(styles, /\.camp-node \{[^}]*width: var\(--camp-size, 132px\);[^}]*height: var\(--camp-size, 132px\);/s);

const editorServer = read("tools/editor-server.js");
const mapEditor = read("tools/map-editor/editor.js");
for (const [label, source] of [["editor server", editorServer], ["map editor", mapEditor]]) {
  assert.match(source, /DEFAULT_STRONGHOLD_VISUAL_SIZE = 154;/, `${label} must define the canonical Stronghold size.`);
  assert.match(source, /DEFAULT_CAMP_VISUAL_SIZE = 132;/, `${label} must define the canonical Camp size.`);
  assert.match(source, /CROWN_CITADEL_VISUAL_SIZE = 260;/, `${label} must define the canonical Crown Citadel size.`);
}

console.log(
  `Validated map-object scale standards: camps ${SOURCE_CANVAS_SIZE}x${SOURCE_CANVAS_SIZE} source, ${CAMP_CANVAS_SIZE}x${CAMP_CANVAS_SIZE}/${CAMP_RENDER_SIZE}px runtime, `
  + `Strongholds ${SOURCE_CANVAS_SIZE}x${SOURCE_CANVAS_SIZE} source, ${STRONGHOLD_CANVAS_SIZE}x${STRONGHOLD_CANVAS_SIZE}/${STRONGHOLD_RENDER_SIZE}px runtime, `
  + `Crown Citadel ${STRONGHOLD_CANVAS_SIZE}x${STRONGHOLD_CANVAS_SIZE}/${CROWN_CITADEL_RENDER_SIZE}px.`
);
