"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const topology = require("../functions/coreExpansionTopology.js");
const regionCatalogRuntime = require("../region-catalog.js");

const root = path.resolve(__dirname, "..");
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function hash(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(stable(value)));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const clientConfigSource = read("release-config.js");
const clientConfig = JSON.parse(clientConfigSource.match(/Object\.freeze\((\{[\s\S]*\})\);/)?.[1] || "null");
const serverConfig = readJson("functions/release-config.json");
assert.deepEqual(clientConfig, serverConfig, "Client and server reset controls differ.");
assert.equal(serverConfig.realmMode, "legacy", "The shared realm must remain held before reset time.");
assert.equal(serverConfig.worldTopology, "legacy", "The Core expansion topology must remain inactive before reset time.");
assert.equal(serverConfig.preparedWorldTopology, topology.TOPOLOGY_VERSION);
assert.equal(serverConfig.resetActivationHeld, true);
assert.equal(serverConfig.monthlyResetStartsAt, "2026-09-01T00:00:00.000Z");

const layout = readJson("functions/core-expansion-world-layout.json");
const catalog = readJson("functions/core-expansion-region-catalog.json");
const browserCatalog = JSON.parse(read("assets/worlds/core-expansion-v1/region-catalog.js")
  .match(/Object\.freeze\((\{[\s\S]*\})\);/)?.[1] || "null");
const receipt = readJson("assets/worlds/core-expansion-v1/build-receipt.json");
assert.deepEqual(browserCatalog, catalog);
assert.deepEqual(regionCatalogRuntime.validateCatalog(catalog), []);
assert.equal(layout.maps.length, 81);
assert.equal(catalog.regions.length, 81);
assert.equal(receipt.coreMapCount, 25);
assert.equal(receipt.coreCityCount, 1480);
assert.equal(receipt.firstLayerMapCount, 24);
assert.equal(receipt.preparedSecondLayerMapCount, 32);
assert.equal(receipt.newLandsMapCount, 56);
assert.equal(receipt.newLandsCityCount, 2240);
assert.equal(receipt.objectiveCount, 17);
assert.equal(receipt.catalogHash, hash(catalog));
assert.equal(receipt.worldLayoutHash, hash(layout));
assert.equal(catalog.version, 2026083102);
assert.equal(layout.version, 2026083102);
assert.equal(catalog.topology.ringAnchor, "north-center");
assert.equal(catalog.topology.ringDirection, "clockwise");
assert.equal(catalog.topology.connections, "cardinal-only");

const mapsById = new Map(layout.maps.map(map => [map.id, map]));
const regionsById = new Map(catalog.regions.map(region => [region.id, region]));
assert.equal(mapsById.size, 81, "Prepared map IDs must be unique.");
assert.equal(regionsById.size, 81, "Prepared region IDs must be unique.");
assert.equal(new Set(catalog.regions.map(region => `${region.gridX},${region.gridY}`)).size, 81);

const core = catalog.regions.filter(region => region.permanentCore);
const newLands = catalog.regions.filter(region => !region.permanentCore);
assert.equal(core.length, 25);
assert(core.every(region => region.worldLayer === 0 && !region.spawnEligible && !region.spawnReady));
assert(core.every(region => region.purpose !== "player_region"));
assert(core.every(region => region.name === topology.PREPARED_CORE_REGION_NAMES[region.id]));
assert.equal(newLands.length, 56);
assert(newLands.every(region => region.purpose === "player_region" && region.cityCapacity === 40));
assert(newLands.every(region => mapsById.get(region.id)?.cities?.length === 40));
assert.equal(newLands.filter(region => region.worldLayer === 1).length, 24);
assert.equal(newLands.filter(region => region.worldLayer === 2).length, 32);
assert(newLands.filter(region => region.worldLayer === 1).every(region => region.lifecycle === "active"));
assert(newLands.filter(region => region.worldLayer === 2).every(region => region.lifecycle === "standby"));
assert.deepEqual(
  newLands.map(region => region.name),
  [...topology.PREPARED_NEW_LANDS_REGION_NAMES],
  "Prepared New Lands maps must use the approved medieval names in activation order.",
);
assert.equal(new Set(catalog.regions.map(region => region.name)).size, catalog.regions.length, "Map names must be unique.");
assert(catalog.regions.every(region => !/^New Lands \d+$/i.test(region.name)), "Numbered New Lands labels are not player-facing map names.");

for (const layer of [1, 2]) {
  const first = newLands.find(region => region.worldLayer === layer && region.clockwiseOrderIndex === 0);
  assert(first, `Layer ${layer} must have a first map.`);
  assert.equal(first.gridX, 0, `Layer ${layer} must begin at north-center, not a corner.`);
  assert.equal(first.gridY, -(topology.CORE_RADIUS + layer));
  const inward = regionsById.get(first.connections?.south?.targetRegionId);
  assert(inward, `Layer ${layer}'s first map must have a south road into the inner layer.`);
  assert.equal(inward.gridX, 0);
  assert.equal(inward.gridY, first.gridY + 1);
}

for (const region of catalog.regions) {
  for (const [side, connection] of Object.entries(region.connections || {})) {
    if (connection.state !== "open") continue;
    const neighbor = regionsById.get(connection.targetRegionId);
    assert(neighbor, `${region.id}.${side} targets a missing region.`);
    const reciprocal = neighbor.connections?.[connection.oppositeSide];
    assert.equal(reciprocal?.state, "open", `${region.id}.${side} is not reciprocal.`);
    assert.equal(reciprocal?.targetRegionId, region.id, `${region.id}.${side} returns to the wrong region.`);
  }
}

for (const [relativePath, expected] of Object.entries(receipt.assets)) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Prepared map asset is missing: ${relativePath}`);
  const bytes = fs.readFileSync(absolutePath);
  assert.equal(bytes.length, expected.bytes, `${relativePath} byte count changed.`);
  assert.equal(hash(bytes), expected.sha256, `${relativePath} hash changed.`);
}

const serverSource = read("functions/index.js");
assert.match(serverSource, /CONFIGURED_CORE_EXPANSION_ACTIVE[\s\S]*core-expansion-world-layout\.json/);
assert.match(
  serverSource,
  /STATIC_ACTIVE_SERVER_REGION_IDS[\s\S]*?filter\(region => region\?\.permanentCore === true\)/,
  "Only permanent Core maps may bypass the authoritative expansion-state activation list on the server.",
);
assert.match(serverSource, /ensureCoreExpansionState\(\)/);
assert.match(serverSource, /planThresholdActivation\(\{/);
assert.match(serverSource, /transaction\.set\(expansionRef,[\s\S]*lastActivationEventId/);
assert.match(serverSource, /activatedRegionIds[\s\S]*ensureMainIslandForPlayer/);
assert.match(serverSource, /requireActiveWorldRegionIds[\s\S]*ensureCoreExpansionState/);
assert.match(serverSource, /ensureMainIslandForPlayer[\s\S]*requireActiveWorldRegionId/);
assert.match(serverSource, /sendArmyOrder[\s\S]*requireActiveWorldRegionIds/);
assert.match(serverSource, /getDeedCampCandidateRegionIds[\s\S]*activeRegionIds\.has\(regionId\)/);
const clientSource = read("game.js");
assert.match(clientSource, /CORE_EXPANSION_TOPOLOGY_ACTIVE[\s\S]*worldTopology/);
assert.match(
  clientSource,
  /STATIC_ACTIVE_WORLD_REGION_IDS[\s\S]*?filter\(region => region\?\.permanentCore === true\)/,
  "Only permanent Core maps may bypass the authoritative expansion-state activation list in the client.",
);
assert.match(clientSource, /isWorldRegionRuntimeActive\(targetRegionId\)/);
assert.match(clientSource, /applyCoreExpansionRealmState\(realm\)/);
const indexSource = read("index.html");
assert.match(indexSource, /region-catalog\.js\?v=20260831-core-expansion-prepared-r2/);
assert.match(indexSource, /assets\/worlds\/core-expansion-v1\/region-catalog\.js\?v=20260831-core-expansion-prepared-r2/);

const preparedText = [JSON.stringify(layout), JSON.stringify(catalog)].join("\n");
for (const forbidden of ["developmentOnly", "productionActivated", "fixturePackageAvailabilityOnly", "Core v2 QA-1", "phase6d", "phase6f"]) {
  assert(!preparedText.includes(forbidden), `Prepared release leaked development marker ${forbidden}.`);
}

console.log("Validated the inactive Core-expansion release bundle, north-center cardinal layer starts, 81 unique medieval map names, 3,720 city definitions, 17 objectives, asset hashes, runtime wiring, and reset hold.");
