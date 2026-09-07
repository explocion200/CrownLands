"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const layout = read("functions/core-expansion-world-layout.json");
const catalog = read("functions/core-expansion-region-catalog.json");
const receipt = read("assets/worlds/core-expansion-v1/illustrated-art-receipt.json");
const clearance = read("tools/map-art/clearance.json");
const { coordinateWrite, canonicalCityPositions } = require("./illustrated-map-coordinate-plan");
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const omitCoordinates = city => Object.fromEntries(Object.entries(city).filter(([key]) => !["x", "y", "xNorm", "yNorm"].includes(key)));
const intersects = (a, b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
assert.equal(receipt.maps.length, 81);
assert.equal(new Set(receipt.maps.map(m => m.roadGeometrySha256)).size, 81);
assert.equal(Object.keys(receipt.cityStageAssets).length, 5);
let cities = 0, scenery = 0, landmarks = 0;
for (const summary of catalog.regions) {
  const map = layout.maps.find(m => m.id === summary.id), definition = read(summary.regionDefinitionPath);
  const proof = clearance.maps.find(m => m.id === summary.id);
  assert(proof, `Missing clearance proof ${summary.id}`);
  assert.deepEqual(map.cities, definition.cities, `Client/server city layout differs: ${summary.id}`);
  assert.equal(digest(definition.cities.map(omitCoordinates)), proof.originalCityStateSha256, `Non-coordinate city fields changed: ${summary.id}`);
  assert.equal(summary.artPresentation.style, "illustrated-atlas-v1");
  for (const [i, city] of definition.cities.entries()) {
    assert.equal(city.id, proof.cities[i].id);
    assert.equal(city.x, proof.cities[i].x); assert.equal(city.y, proof.cities[i].y);
    assert.equal(Math.round(city.xNorm*1448), city.x); assert.equal(Math.round(city.yNorm*1086), city.y);
    const box = proof.cities[i].bounds;
    for (const segment of proof.roads) for (const [x, y, width] of segment) {
      // Samples are at most 4.2 map pixels apart; extra padding covers the gap.
      const dx = Math.max(box.x-x, 0, x-box.x-box.w), dy = Math.max(box.y-y, 0, y-box.y-box.h);
      assert(Math.hypot(dx, dy) > width/2 + 0.5, `${city.id} touches its road envelope`);
    }
    for (const prop of summary.artPresentation.scenery) assert(!intersects(box, { x: prop.x-prop.w/2, y: prop.y-prop.h/2, w: prop.w, h: prop.h }), `${city.id} overlaps scenery`);
    for (const object of summary.artPresentation.landmarks) assert(!intersects(box, { x: object.x, y: object.y, w: object.width, h: object.height }), `${city.id} is behind a landmark`);
  }
  for (const object of summary.artPresentation.landmarks) {
    assert(object.gate.y > object.y+object.height*.5, "Landmark gate must lie on the southern half of its padded sprite canvas");
    assert(fs.existsSync(path.join(root, object.asset)));
    if (object.kind !== "tower") assert([...definition.strongholds, ...definition.camps].some(o => o.id === object.id && o.artSrc === object.asset));
  }
  cities += map.cities.length; scenery += summary.artPresentation.scenery.length; landmarks += summary.artPresentation.landmarks.length;
}
assert.equal(cities, 3720); assert.equal(landmarks, 21);
// Exercise the actual game presentation functions, including template fallback
// and map-picker coordinates, without replacing their implementation.
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const start = game.indexOf("function getIllustratedMapPresentation("), end = game.indexOf("function setImageMapBackground(", start);
const summaries = new Map(catalog.regions.map(r => [r.id, r]));
summaries.set("new-lands-l03-p001", { templateRegionId: "new-lands-l01-p001" });
const context = { REGION_CATALOG: catalog, CORE_EXPANSION_TOPOLOGY_ACTIVE: true, REGION_CATALOG_SUMMARIES_BY_ID: summaries, normalizeRegionId: String, escapeHtml: String };
vm.createContext(context); vm.runInContext(game.slice(start, end), context);
for (const region of catalog.regions) {
  const markup = context.renderIllustratedMapThumbnail(region.id, region.thumbnailAsset);
  for (const landmark of region.artPresentation.landmarks) {
    assert(markup.includes(`data-landmark-id="${landmark.id}"`));
    assert(markup.includes(`x="${landmark.x}" y="${landmark.y}"`));
    assert.equal(context.getIllustratedLandmarkAsset(region.id, landmark.id), landmark.asset);
  }
}
assert.equal(context.getIllustratedMapPresentation("new-lands-l03-p001"), summaries.get("new-lands-l01-p001").artPresentation);
const write = coordinateWrite({ name: "projects/test/databases/(default)/documents/islands/test/cities/owned", updateTime: "2026-09-06T00:00:00Z", fields: { ownerUid: { stringValue: "keep-owner" }, level: { integerValue: "100" }, troops: { integerValue: "450000" }, isMainCity: { booleanValue: true } } }, { x: 12, y: 34 });
assert.deepEqual(write.updateMask.fieldPaths, ["x", "y"]);
assert.deepEqual(Object.keys(write.update.fields), ["x", "y"]);
assert.deepEqual(write.currentDocument, { updateTime: "2026-09-06T00:00:00Z" });
assert.throws(() => coordinateWrite({ name: "missing-precondition" }, { x: 1, y: 2 }));
assert.throws(() => canonicalCityPositions(layout, "archived-world-map"));
console.log(`Validated illustrated artwork: 81 distinct roads, ${cities} unchanged city identities, ${scenery} scenery, ${landmarks} separate landmarks; coordinate-only migration and map picker alignment.`);
