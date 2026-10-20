"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const contract = json("docs/art-sources/clean-map-ground/preserved-inputs.json");
for (const [file, expected] of Object.entries(contract.files)) assert.equal(hash(read(file)), expected, `Gameplay or placement input changed: ${file}`);
const receipt = json("assets/worlds/core-expansion-v1/illustrated-art-receipt.json");
const catalog = json("assets/worlds/core-expansion-v1/region-catalog.json");
const proof = json("tools/map-art/clearance.json");
assert.equal(receipt.groundPresentation.style, "clean-meadow-connected-roads-v2");
assert.equal(hash(read(receipt.groundPresentation.source)), receipt.groundPresentation.sourceSha256);
assert.equal(hash(read(receipt.groundPresentation.roadSamples)), receipt.groundPresentation.roadSamplesSha256);
assert.equal(receipt.maps.length, 81);
assert.equal(new Set(receipt.maps.map(map => map.backgroundSha256)).size, 81);
assert.equal(new Set(receipt.maps.map(map => map.roadGeometrySha256)).size, 81);
let segments = 0;
for (const map of proof.maps) {
  const summary = catalog.regions.find(item => item.id === map.id);
  const entry = receipt.maps.find(item => item.id === map.id);
  assert.equal(entry.roadGeometrySha256, contract.roads[map.id], `${map.id} road geometry changed`);
  assert.equal(hash(read(summary.mapAsset)), entry.backgroundSha256, `${map.id} background receipt is stale`);
  assert(read(summary.mapAsset).length < 350 * 1024, `${map.id} clean background exceeds 350 KiB`);
  assert(read(summary.thumbnailAsset).length < 60 * 1024, `${map.id} thumbnail exceeds 60 KiB`);
  // Every ribbon must join the main network. This detects disconnected spurs
  // even when all four map exits individually have valid road samples.
  const reached = new Set([0]);
  const touches = (a, b) => a.some(p => b.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) <= (p[2] + q[2]) / 2));
  for (let pass = 0; pass < map.roads.length; pass++) for (let i = 0; i < map.roads.length; i++) {
    if (!reached.has(i) && [...reached].some(j => touches(map.roads[i], map.roads[j]))) reached.add(i);
  }
  assert.equal(reached.size, map.roads.length, `${map.id} has a disconnected road`);
  const ends = map.roads.flatMap(road => [road[0], road.at(-1)]);
  for (const [x, y] of [[724, 0], [1448, 543], [724, 1086], [0, 543]]) {
    assert(ends.some(p => Math.hypot(p[0] - x, p[1] - y) < .01), `${map.id} misses a matching map-edge exit`);
  }
  for (const landmark of summary.artPresentation.landmarks) {
    assert(map.roads.some(road => road.some(p => Math.hypot(p[0] - landmark.gate.x, p[1] - landmark.gate.y) < p[2] / 2)), `${map.id} landmark entrance is disconnected`);
  }
  segments += map.roads.length;
}
// The authoritative NPC sampler must still reproduce the existing server data.
childProcess.execFileSync(process.execPath, ["tools/generate-marauder-roads.js", "--check"], { cwd: root, stdio: "inherit" });
console.log(`Clean terrain: 81 unique backgrounds, ${segments} connected road segments, edge exits, objective entrances, NPC paths and preserved gameplay inputs passed.`);
