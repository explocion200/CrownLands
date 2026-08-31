"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const world = JSON.parse(read("functions/world-layout.json"));
const server = read("functions/index.js");
const client = read("game.js");
const editorServer = read("tools/editor-server.js");
const editorClient = read("tools/map-editor/editor.js");
const adminTool = read("tools/admin-neutral-city-level-reset.js");

const expectedSpawnRegionIds = [
  "region_11", "region_12", "region_13", "region_14", "region_15",
];
const spawnMaps = (world.maps || []).filter(map => map.newPlayerSpawnEligible === true);
assert.deepEqual(spawnMaps.map(map => map.id), expectedSpawnRegionIds, "The canonical spawn-map allowlist drifted.");
spawnMaps.forEach(map => {
  assert.equal(map.type, "starter", `${map.id} must remain a starter map.`);
  assert.ok(map.cities.length >= 10, `${map.id} does not have enough starter inventory.`);
  assert.ok(map.cities.every(city => Number(city.level) === 1), `${map.id} has a non-level-1 seed city.`);
});
assert.equal(spawnMaps.reduce((total, map) => total + map.cities.length, 0), 363);

assert.match(server, /function isNewPlayerSpawnMap[\s\S]*?newPlayerSpawnEligible[\s\S]*?NEW_PLAYER_SPAWN_REGION_IDS/);
assert.match(server, /NEW_PLAYER_SPAWN_MIN_READY_NEUTRAL_CITIES\s*=\s*10/);
assert.match(server, /loadNewPlayerSpawnAvailability[\s\S]*?\.where\("ownerKind",\s*"==",\s*"neutral"\)[\s\S]*?ready:/);
assert.match(server, /readyIslandEntries\.length\s*\?\s*readyIslandEntries\s*:\s*availableIslandEntries/);
assert.match(server, /chosenCity[\s\S]*?safeString\(city\.ownerKind[\s\S]*?===\s*"neutral"[\s\S]*?!getOwnerUid\(city\)/);
assert.doesNotMatch(server, /const STARTER_REGION_IDS/);

assert.match(client, /function isNewPlayerSpawnRegion[\s\S]*?newPlayerSpawnEligible/);
assert.match(client, /function getNewPlayerSpawnRegionIds[\s\S]*?isNewPlayerSpawnRegion/);
assert.match(client, /fallbackRegionId[\s\S]*?neutralCityCount\s*>\s*0[\s\S]*?return fallbackRegionId/);
assert.doesNotMatch(client, /NEW_PLAYER_SPAWN_REGION_TYPE_ORDER/);

for (const source of [editorServer, editorClient]) {
  assert.match(source, /newPlayerSpawnEligible/, "The map editor would discard spawn eligibility metadata.");
}
assert.match(adminTool, /--apply requires --confirm-target-count/);
assert.match(adminTool, /currentDocument:\s*\{ updateTime:/);
assert.match(adminTool, /ordinaryCityIds\.has\(cityId\)/);
assert.match(adminTool, /ownerKind === "neutral"/);
assert.match(adminTool, /receiptPath/);

console.log("Validated the five authoritative starter islands, 363 level-1 starting cities, final-city fallback, and guarded admin tooling.");
