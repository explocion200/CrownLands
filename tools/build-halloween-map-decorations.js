"use strict";
// Authoring only: road sampling and placement searches never run in the game.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const output = "assets/optimized/halloween-map-layouts-v2.json";
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
  && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
const distanceToRect = (x, y, box) => Math.hypot(Math.max(box.x - x, 0, x - box.x - box.w), Math.max(box.y - y, 0, y - box.y - box.h));
const cityEnvelope = city => ({ x: city.x - 35, y: city.y - 60, w: 70, h: 90 });

function build() {
  const catalog = read("assets/worlds/core-expansion-v1/region-catalog.json");
  const roads = read("tools/map-art/clearance.json");
  const towers = read("tools/map-art/clan-tower-clearance.json");
  const assets = read("docs/art-sources/halloween-map-decorations/assets.json").map((asset, index) => ({
    src: asset.output, w: [40, 34, 32][index], h: [27, 34, 32][index],
  }));
  const maps = {};
  for (const summary of catalog.regions) {
    const definition = read(summary.regionDefinitionPath);
    const proof = roads.maps.find(map => map.id === summary.id);
    if (!proof) throw Error(`Missing reviewed roads: ${summary.id}`);
    const reserved = [
      ...definition.cities.map(cityEnvelope),
      ...summary.artPresentation.scenery.map(item => ({ x: item.x - item.w / 2, y: item.y - item.h / 2, w: item.w, h: item.h })),
      ...summary.artPresentation.landmarks.map(item => ({ x: item.x - 40, y: item.y - 85, w: item.width + 80, h: item.height + 125 })),
      ...towers.maps.filter(map => map.id === summary.id).map(map => map.reserved),
    ];
    const seed = crypto.createHash("sha256").update(summary.id).digest().readUInt32LE(0);
    const candidatesFor = (step, jitter) => {
      let state = seed;
      const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
      const candidates = [];
      // Keep the entire sprite inside the open interior, clear of baked-in edge
      // forests, mountain bands, camp logs and cardinal transition arrows.
      for (let y = 235; y <= 795; y += step) for (let x = 240; x <= 1150; x += step) {
        candidates.push({ x: Math.round(x + random() * jitter), y: Math.round(y + random() * jitter), order: random() });
      }
      return candidates.sort((a, b) => a.order - b.order);
    };
    const placements = [];
    // Preserve the first draft's placements, then fill more of the safe gaps.
    for (const [candidates, spacing, limit] of [[candidatesFor(35, 24), 150, 9], [candidatesFor(20, 14), 90, 24]]) {
      for (const candidate of candidates) {
        const asset = placements.length % assets.length;
        const box = { x: candidate.x, y: candidate.y, w: assets[asset].w, h: assets[asset].h };
        if (reserved.some(other => overlaps(box, other, 10))) continue;
        if (placements.some(other => Math.hypot(box.x - other.x, box.y - other.y) < spacing)) continue;
        // 6px includes the 4.2px maximum gap between reviewed road samples.
        if (proof.roads.some(segment => segment.some(([x, y, width]) => distanceToRect(x, y, box) <= width / 2 + 6))) continue;
        placements.push({ asset, x: box.x, y: box.y });
        if (placements.length === limit) break;
      }
    }
    // Compact tuples keep the denser layouts within the existing lazy-byte cap.
    maps[summary.id] = placements.map(({ asset, x, y }) => [asset, x, y]);
  }
  return { schemaVersion: 2, topology: "core-expansion-v1", width: 1448, height: 1086, assets, maps };
}

if (require.main === module) {
  const data = build();
  fs.writeFileSync(path.join(root, output), `${JSON.stringify(data)}\n`);
  const counts = Object.values(data.maps).map(items => items.length);
  console.log(`Placed ${counts.reduce((a, b) => a + b, 0)} decorations on ${counts.length} prepared maps (${Math.min(...counts)}–${Math.max(...counts)} per map).`);
}
module.exports = { build, output, overlaps, distanceToRect, cityEnvelope };
