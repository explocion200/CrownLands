"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { build, output } = require("./build-halloween-map-decorations");
const root = path.resolve(__dirname, "..");
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const data = read(output);
assert.deepEqual(data, build(), "Regenerate placements when active map art or city/road layouts change");
const catalog = read("assets/worlds/core-expansion-v1/region-catalog.json");
const clearance = read("tools/map-art/clearance.json");
const towers = read("tools/map-art/clan-tower-clearance.json");
assert.equal(Object.keys(data.maps).length, 81);
assert.equal(data.assets.length, 3);
let total = 0;
const separated = (a, b, gap = 0) => a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x
  || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
for (const summary of catalog.regions) {
  const definition = read(summary.regionDefinitionPath);
  const placed = data.maps[summary.id].map(([asset, x, y]) => ({ x, y, ...data.assets[asset] }));
  assert(placed.length >= 7 && placed.length <= 24, `Decoration budget violated on ${summary.id}`);
  for (const [index, box] of placed.entries()) {
    assert(box.x >= 240 && box.y >= 235 && box.x + box.w <= 1232 && box.y + box.h <= 880, "Decoration enters baked edge scenery");
    for (const city of definition.cities) assert(separated(box, { x: city.x - 35, y: city.y - 60, w: 70, h: 90 }, 10), `City/flag clearance: ${city.id}`);
    for (const tree of summary.artPresentation.scenery) assert(separated(box, { x: tree.x - tree.w / 2, y: tree.y - tree.h / 2, w: tree.w, h: tree.h }, 10), `Scenery overlap: ${tree.id}`);
    for (const landmark of summary.artPresentation.landmarks) assert(separated(box, { x: landmark.x - 40, y: landmark.y - 85, w: landmark.width + 80, h: landmark.height + 125 }, 10), `Landmark overlap: ${landmark.id}`);
    for (const tower of towers.maps.filter(map => map.id === summary.id)) assert(separated(box, tower.reserved, 10), `Tower compound overlap: ${tower.id}`);
    for (const segment of clearance.maps.find(map => map.id === summary.id).roads) for (const [x, y, width] of segment) {
      const dx = x - Math.max(box.x, Math.min(x, box.x + box.w));
      const dy = y - Math.max(box.y, Math.min(y, box.y + box.h));
      assert(Math.hypot(dx, dy) > width / 2 + 6, `Road overlap: ${summary.id}`);
    }
    for (const other of placed.slice(index + 1)) assert(Math.hypot(box.x - other.x, box.y - other.y) >= 90, "Decorations clustered too densely");
  }
  total += placed.length;
}
let bytes = fs.statSync(path.join(root, output)).size;
for (const asset of read("docs/art-sources/halloween-map-decorations/assets.json")) {
  const file = fs.readFileSync(path.join(root, asset.output));
  assert.equal(crypto.createHash("sha256").update(file).digest("hex"), asset.sha256);
  assert.equal(file.toString("ascii", 0, 4), "RIFF");
  assert.equal(file.toString("ascii", 8, 12), "WEBP");
  assert(file.length < 16 * 1024, "Decoration exceeds 16 KiB");
  bytes += file.length;
}
assert(bytes < 64 * 1024, "All layouts and decoration sprites exceed 64 KiB");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const context = { CORE_EXPANSION_TOPOLOGY_ACTIVE: true, Date };
vm.createContext(context);
vm.runInContext(game.slice(game.indexOf("function isHalloweenMapSeason("), game.indexOf("async function loadHalloweenMapLayouts(")), context);
for (const [date, expected] of [["2026-09-30T23:59:59Z", false], ["2026-10-01T00:00:00Z", true], ["2026-10-31T23:59:59Z", true], ["2026-11-01T00:00:00Z", false]]) {
  assert.equal(context.isHalloweenMapSeason(new Date(date)), expected, date);
}
context.CORE_EXPANSION_TOPOLOGY_ACTIVE = false;
assert.equal(context.isHalloweenMapSeason(new Date("2026-10-15T00:00:00Z")), false);
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
assert(!worker.slice(0, worker.indexOf("self.addEventListener")).includes("halloween-map-layouts"), "Optional art must stay out of the installation cache");
console.log(`PASS ${total} decorations: 81 maps, 3,720 city clearances, scenery, landmarks, tower compounds, roads, UTC season and ${bytes} lazy bytes.`);
