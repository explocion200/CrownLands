const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildCompatibilityMapData } = require("./editor-server");

const ROOT_DIR = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
const readJson = relativePath => JSON.parse(read(relativePath));

function readWindowData(relativePath, globalName) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(read(relativePath), context, { filename: relativePath, timeout: 1000 });
  return JSON.parse(JSON.stringify(context.window[globalName] || {}));
}

const worldLayout = readJson("assets/worlds/world_01/world-layout.json");
const browserWorld = readWindowData("assets/map-editor-data.js", "CROWNLANDS_MAP_EDITOR_DATA");
const serverWorld = readJson("functions/world-layout.json");
assert.deepEqual(browserWorld, serverWorld, "Browser and server world layouts must stay identical.");

const mapById = new Map((browserWorld.maps || []).map(map => [map.id, map]));
let positionedObjects = 0;
let sizedObjects = 0;
for (const summary of worldLayout.regions || []) {
  const region = readJson(summary.regionPath);
  const map = mapById.get(region.id);
  assert(map, `${region.id} is missing from the runtime map data.`);
  assert.equal(map.imageWidth, region.width, `${region.id} runtime width drifted from the editor.`);
  assert.equal(map.imageHeight, region.height, `${region.id} runtime height drifted from the editor.`);

  for (const [sourceKey, runtimeKey] of [["cities", "cities"], ["strongholds", "objectives"], ["camps", "camps"]]) {
    const runtimeById = new Map((map[runtimeKey] || []).map(item => [item.id, item]));
    for (const item of region[sourceKey] || []) {
      const runtimeItem = runtimeById.get(item.id);
      assert(runtimeItem, `${region.id}/${item.id} is missing from runtime data.`);
      assert.equal(runtimeItem.xNorm, item.xNorm, `${region.id}/${item.id} xNorm drifted from the editor.`);
      assert.equal(runtimeItem.yNorm, item.yNorm, `${region.id}/${item.id} yNorm drifted from the editor.`);
      assert.equal(runtimeItem.x, Math.round(item.xNorm * region.width), `${region.id}/${item.id} pixel X is stale.`);
      assert.equal(runtimeItem.y, Math.round(item.yNorm * region.height), `${region.id}/${item.id} pixel Y is stale.`);
      positionedObjects += 1;
      if (sourceKey !== "cities") {
        assert.equal(runtimeItem.size, item.size, `${region.id}/${item.id} visual size drifted from the editor.`);
        assert.equal(Boolean(runtimeItem.flipX), Boolean(item.flipX), `${region.id}/${item.id} horizontal flip drifted from the editor.`);
        sizedObjects += 1;
      }
    }
  }
}

const syntheticRegion = {
  id: "flip_test",
  name: "Flip Test",
  type: "starter",
  gridX: 0,
  gridY: 0,
  width: 1000,
  height: 750,
  imagePath: "assets/test.webp",
  cityCapacity: 0,
  cities: [],
  strongholds: [{
    id: "flip_stronghold",
    name: "Flip Stronghold",
    xNorm: 0.321,
    yNorm: 0.654,
    strongholdType: "gold_stronghold",
    bonusType: "goldProduction",
    bonusAmount: 8,
    level: 50,
    troops: 100,
    artSrc: "assets/gold-stronghold.png",
    size: 219,
    flipX: true,
  }],
  camps: [{
    id: "flip_camp",
    name: "Flip Camp",
    xNorm: 0.417,
    yNorm: 0.583,
    campType: "deed",
    artSrc: "assets/camps/deed.png",
    size: 137,
    flipX: true,
  }],
  edgeConnections: { north: [], south: [], east: [], west: [] },
};
const synthetic = buildCompatibilityMapData({
  worldId: "test",
  worldName: "Test",
  updatedAt: "2026-08-13T00:00:00.000Z",
  globalSettings: { worldWidth: 10000, worldHeight: 7600, gridCellWorldSize: 2300 },
}, [syntheticRegion]);
assert.equal(synthetic.maps[0].objectives[0].size, 219);
assert.equal(synthetic.maps[0].objectives[0].flipX, true);
assert.equal(synthetic.maps[0].objectives[0].x, 321);
assert.equal(synthetic.maps[0].objectives[0].y, 491);
assert.equal(synthetic.maps[0].camps[0].size, 137);
assert.equal(synthetic.maps[0].camps[0].flipX, true);
assert.equal(synthetic.maps[0].camps[0].x, 417);
assert.equal(synthetic.maps[0].camps[0].y, 437);

const game = read("game.js");
const editor = read("tools/map-editor/editor.js");
const editorServer = read("tools/editor-server.js");
const gameStyles = read("styles.css");
const editorStyles = read("tools/map-editor/styles.css");
assert.match(game, /return readVisualSize\(city\?\.size, fallback\);/);
assert.match(
  game,
  /size: islandImageVisualSizeToWorld\(region\.id, camp\?\.size, DEFAULT_CAMP_VISUAL_SIZE\)/,
  "Live Camp markers do not convert editor-image pixels into live-map world pixels."
);
assert.match(
  game,
  /size: islandImageVisualSizeToWorld\(\s*region\.id,\s*objective\?\.size,\s*config\.type === "crown" \? CROWN_CITADEL_VISUAL_SIZE : DEFAULT_STRONGHOLD_VISUAL_SIZE\s*\)/,
  "Live Stronghold markers do not convert editor-image pixels into live-map world pixels."
);
assert.match(
  game,
  /function islandImageVisualSizeToWorld\(regionId, size, fallback\)[\s\S]*?const scale = bounds\.width \/ Math\.max\(1, dimensions\.width\);[\s\S]*?Math\.round\(imageSize \* scale\)/,
  "The live map no longer preserves an editor object's size relative to its stretched map image."
);
assert.match(game, /map-art-flip-x/);
assert.match(editor, /data-field="flipX"/);
assert.match(editor, /editor-art-flip-x/);
assert.match(editorServer, /flipX: Boolean\(stronghold\.flipX\)/);
assert.match(editorServer, /flipX: Boolean\(camp\.flipX\)/);
assert.match(gameStyles, /\.map-art-flip-x\s*\{[^}]*scaleX\(-1\)/s);
assert.match(editorStyles, /\.map-marker img\.editor-art-flip-x\s*\{[^}]*scaleX\(-1\)/s);

console.log(`Validated ${positionedObjects} editor positions and ${sizedObjects} editor-controlled object sizes with horizontal flip persistence.`);
