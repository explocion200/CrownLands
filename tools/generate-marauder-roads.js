"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "tools/map-art/clearance.json"), "utf8"));
const receipt = JSON.parse(fs.readFileSync(path.join(root, "assets/worlds/core-expansion-v1/illustrated-art-receipt.json"), "utf8"));
const templates = {}, hashes = {};
for (const map of source.maps) {
  assert(!templates[map.id], "Duplicate road template");
  assert(receipt.maps.some(row => row.id === map.id), "Road template has no approved art receipt");
  const points = [];
  for (const road of map.roads) {
    assert(road.length >= 2 && road.every(point => point.length >= 3 && point.every(Number.isFinite) && point[2] > 0), "Invalid road samples");
    // Sample the painted road surface, retaining its original center and two
    // side points safely within the recorded half-width. Never connect roads
    // or invent chords through open ground.
    road.forEach(([x, y, width], index) => {
      if (index % 3 !== 0 && index !== road.length - 1) return;
      points.push([x, y]);
      const before = road[Math.max(0, index - 1)], after = road[Math.min(road.length - 1, index + 1)];
      const dx = after[0] - before[0], dy = after[1] - before[1], length = Math.hypot(dx, dy);
      if (!length) return;
      for (const side of [-1, 1]) points.push([
        Number((x - dy / length * width * 0.4 * side).toFixed(3)),
        Number((y + dx / length * width * 0.4 * side).toFixed(3)),
      ]);
    });
  }
  assert(points.length > 0, "Missing painted roads"); templates[map.id] = points;
  hashes[map.id] = receipt.maps.find(row => row.id === map.id).roadGeometrySha256;
}
assert.equal(Object.keys(templates).length, 81);
const text = JSON.stringify({ version: 1, source: "illustrated-atlas-v1-road-surface", samplingStride: 3, lateralFraction: 0.4,
  sourceSha256: crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex"), roadGeometryHashes: hashes, templates }) + "\n";
assert(Buffer.byteLength(text) <= 1152 * 1024, "Road-surface data exceeds its bounded server-only budget");
const output = path.join(root, "functions/marauder-road-points.json");
if (process.argv.includes("--check")) assert.equal(fs.readFileSync(output, "utf8").replace(/\r\n/g, "\n"), text);
else fs.writeFileSync(output, text);
console.log(`Validated painted-road samples for ${Object.keys(templates).length} approved map templates (${Buffer.byteLength(text)} bytes).`);
