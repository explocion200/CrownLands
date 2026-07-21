const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const editorDataPath = path.join(root, "assets", "map-editor-data.js");
const serverLayoutPath = path.join(root, "functions", "world-layout.json");
const context = { window: {} };

vm.createContext(context);
vm.runInContext(fs.readFileSync(editorDataPath, "utf8"), context, { filename: editorDataPath });

const editorLayout = JSON.parse(JSON.stringify(context.window.CROWNLANDS_MAP_EDITOR_DATA || {}));
const serverLayout = JSON.parse(fs.readFileSync(serverLayoutPath, "utf8"));
assert.deepEqual(serverLayout, editorLayout, "Server world layout is out of sync with the map editor data.");

const maps = Array.isArray(serverLayout.maps) ? serverLayout.maps : [];
assert.ok(maps.length > 0, "World layout must contain at least one map.");
const mapsById = new Map(maps.map(map => [String(map.id || ""), map]));
assert.equal(mapsById.size, maps.length, "Map ids must be unique.");
const globalTargetIds = new Set();
const portalGraph = new Map(maps.map(map => [String(map.id || ""), new Set()]));

for (const map of maps) {
  assert.ok(map.id && map.region, "Every map needs an id and region definition.");
  assert.ok(Number(map.imageWidth) > 0 && Number(map.imageHeight) > 0, `${map.id} needs image dimensions.`);
  const targets = [
    ...(Array.isArray(map.cities) ? map.cities : []),
    ...(Array.isArray(map.objectives) ? map.objectives : []),
    ...(Array.isArray(map.camps) ? map.camps : []),
  ];
  const targetIds = targets.map(target => String(target?.id || ""));
  assert.equal(new Set(targetIds).size, targetIds.length, `${map.id} contains duplicate target ids.`);
  assert.ok(targetIds.every(Boolean), `${map.id} contains a target without an id.`);
  targets.forEach(target => {
    assert.ok(Number.isFinite(Number(target.x)) && Number(target.x) >= 0 && Number(target.x) <= Number(map.imageWidth), `${map.id}/${target.id} has an out-of-bounds x position.`);
    assert.ok(Number.isFinite(Number(target.y)) && Number(target.y) >= 0 && Number(target.y) <= Number(map.imageHeight), `${map.id}/${target.id} has an out-of-bounds y position.`);
  });
  targetIds.forEach(targetId => {
    assert.ok(!globalTargetIds.has(targetId), `Target id ${targetId} is duplicated across maps.`);
    globalTargetIds.add(targetId);
  });

  for (const side of ["north", "south", "east", "west"]) {
    for (const connection of map.edgeConnections?.[side] || []) {
      if (connection.intentionalOuter) continue;
      const targetId = String(connection.connectsToRegionId || "");
      assert.ok(mapsById.has(targetId), `${map.id} links to missing map ${targetId}.`);
      portalGraph.get(map.id).add(targetId);
      const target = mapsById.get(targetId);
      const reciprocal = ["north", "south", "east", "west"].some(targetSide => (
        target.edgeConnections?.[targetSide] || []
      ).some(entry => !entry.intentionalOuter && entry.connectsToRegionId === map.id));
      assert.ok(reciprocal, `${map.id} -> ${targetId} is missing its return portal.`);
    }
  }
}

const reachable = new Set();
const queue = [maps[0].id];
while (queue.length) {
  const mapId = queue.shift();
  if (reachable.has(mapId)) continue;
  reachable.add(mapId);
  portalGraph.get(mapId)?.forEach(targetId => {
    if (!reachable.has(targetId)) queue.push(targetId);
  });
}
assert.equal(reachable.size, maps.length, `Portal network is disconnected; unreachable maps: ${maps.filter(map => !reachable.has(map.id)).map(map => map.id).join(", ")}`);

console.log(`Validated ${maps.length} maps and the server-authoritative world manifest.`);
