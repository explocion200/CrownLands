"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const topology = require("../functions/coreExpansionTopology.js");
const realmTopology = require("../functions/realmTopology.js");
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
assert.equal(serverConfig.preparedWorldTopology, topology.TOPOLOGY_VERSION);
const activationAtMs = Date.parse(serverConfig.monthlyResetStartsAt);
assert(Number.isFinite(activationAtMs), "The Core-expansion activation must use an explicit UTC timestamp.");
const resetControlState = serverConfig.resetActivationHeld === false ? "armed" : "held";
if (resetControlState === "armed") {
  assert.equal(serverConfig.realmMode, "monthly-shared", "An armed reset must use the one shared monthly realm.");
  assert.equal(serverConfig.worldTopology, topology.TOPOLOGY_VERSION, "An armed reset must select the Core-expansion topology.");
  assert.equal(serverConfig.monthlyResetStartsAt, "2026-09-02T00:00:00.000Z");
  assert.equal(realmTopology.getRealmIdentity(serverConfig, activationAtMs - 1).mode, "legacy");
  assert.equal(realmTopology.getRealmIdentity(serverConfig, activationAtMs).mode, "monthly-shared");
} else {
  assert.equal(serverConfig.realmMode, "legacy", "A held reset must leave the current realm in legacy mode.");
  assert.equal(serverConfig.worldTopology, "legacy", "A held reset must leave the current topology active.");
}

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
assert.match(catalog.assetVersion, /^[0-9a-f]{12}$/);
assert.equal(catalog.assetVersion, hash(receipt.assets).slice(0, 12));
assert.equal(layout.assetVersion, catalog.assetVersion);
assert.equal(receipt.assetVersion, catalog.assetVersion);
assert.equal(catalog.version, 2026090201);
assert.equal(layout.version, 2026090201);
assert.deepEqual(layout.globalSettings, catalog.globalSettings,
  "Functions and the browser must share one Core-expansion world coordinate system.");
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

const layerThreeAllocation = topology.getRegionAtActivationOrdinal(56);
const templateSummary = newLands[0];
const templateDefinition = readJson(templateSummary.regionDefinitionPath);
const dynamicSummary = {
  ...templateSummary,
  id: layerThreeAllocation.id,
  name: layerThreeAllocation.name,
  gridX: layerThreeAllocation.gridX,
  gridY: layerThreeAllocation.gridY,
  worldLayer: layerThreeAllocation.worldLayer,
  clockwiseOrderIndex: layerThreeAllocation.clockwiseOrderIndex,
  activationOrdinal: layerThreeAllocation.activationOrdinal,
  templateRegionId: templateSummary.id,
  connections: {
    north: { state: "gated", targetRegionId: "" },
    east: { state: "gated", targetRegionId: "" },
    south: { state: "open", targetRegionId: "new-lands-l02-p001" },
    west: { state: "gated", targetRegionId: "" },
  },
};
const dynamicDefinition = regionCatalogRuntime.materializeRegionDefinition(dynamicSummary, templateDefinition);
assert.equal(dynamicDefinition.id, "new-lands-l03-p001");
assert.equal(dynamicDefinition.name, topology.getNewLandsRegionName(56));
assert.equal(dynamicDefinition.cities.length, 40);
assert(dynamicDefinition.cities.every((city, index) => (
  city.id === `new-lands-l03-p001-city-${String(index + 1).padStart(2, "0")}`
  && city.regionId === "new-lands-l03-p001"
)));
assert.equal(dynamicDefinition.edgeConnections.south[0].connectsToRegionId, "new-lands-l02-p001");
assert.equal(dynamicDefinition.edgeConnections.north.length, 0);
const dynamicEditorMap = regionCatalogRuntime.buildClientEditorMap(dynamicSummary, dynamicDefinition, catalog.assetVersion);
assert.equal(new URL(`https://crownlands.test/${dynamicEditorMap.imageSrc}`).searchParams.get("v"), catalog.assetVersion);
assert.equal(new URL(`https://crownlands.test/${dynamicEditorMap.thumbnailSrc}`).searchParams.get("v"), catalog.assetVersion);

for (const regionId of ["new-lands-l01-p001", "new-lands-l01-p006", "new-lands-l01-p007"]) {
  const editorMap = regionCatalogRuntime.buildClientEditorMap(regionsById.get(regionId), null, catalog.assetVersion);
  assert.equal(new URL(`https://crownlands.test/${editorMap.imageSrc}`).searchParams.get("v"), catalog.assetVersion);
  assert.equal(new URL(`https://crownlands.test/${editorMap.thumbnailSrc}`).searchParams.get("v"), catalog.assetVersion);
}

const boundaryGeneration = "realm-boundary-test";
const boundaryActiveRegions = Array.from({ length: 55 }, (_, ordinal) => topology.getRegionAtActivationOrdinal(ordinal).id);
const boundaryState = {
  ...topology.createInitialExpansionState(boundaryGeneration),
  activeRegionIds: boundaryActiveRegions,
  admittingRegionIds: [boundaryActiveRegions.at(-1)],
  nextActivationOrdinal: 55,
  revision: 55,
};
const boundaryPlan = topology.planThresholdActivation({
  state: boundaryState,
  resetGeneration: boundaryGeneration,
  sourceRegionId: boundaryActiveRegions.at(-1),
  remainingNpcCities: topology.EXPANSION_THRESHOLD_NPC_CITIES,
  thresholdRevision: 20,
});
assert.deepEqual(boundaryPlan.preparedRegions.map(region => region.id), [
  "new-lands-l02-p032",
  "new-lands-l03-p001",
], "A two-map batch must cross from Layer 2 into Layer 3 without skipping the north-center entrance.");
const boundaryRollback = topology.rollbackPendingActivation({
  state: boundaryPlan.state,
  eventId: boundaryPlan.eventId,
});
assert(boundaryRollback.changed);
assert.equal(boundaryRollback.state.nextActivationOrdinal, 55);
assert.deepEqual(boundaryRollback.state.admittingRegionIds, [boundaryActiveRegions.at(-1)]);

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
assert.match(serverSource, /core-expansion-world-layout\.json/);
assert.match(serverSource, /CONFIGURED_CORE_EXPANSION_PREPARED/);
assert.match(
  serverSource,
  /CORE_PERMANENT_REGION_IDS[\s\S]*?filter\(region => region\?\.permanentCore === true\)/,
  "Only permanent Core maps may bypass the authoritative expansion-state activation list on the server.",
);
assert.match(serverSource, /ensureCoreExpansionState\(\)/);
assert.match(serverSource, /ensureCoreExpansionResetReady[\s\S]*?CORE_PERMANENT_REGION_IDS[\s\S]*?verifyPreparedExpansionRegion/);
assert.match(serverSource, /resetReadinessStatus:[\s\S]*?resetReadinessRevision:/);
assert.match(serverSource, /getStableSharedRealmSlotIndex/);
assert.match(serverSource, /CORE_EXPANSION_STARTING_CITY_CAPACITY/);
assert.match(serverSource, /planThresholdActivation\(\{/);
assert.match(serverSource, /reconcileNewPlayerAdmissionCapacity[\s\S]*?planOverdueNewPlayerExpansion/);
assert.match(
  serverSource,
  /planOverdueNewPlayerExpansion[\s\S]*?expansionState\.resetGeneration !== RESET_GENERATION[\s\S]*?city\.worldId[\s\S]*?city\.realmShardId/,
  "Overdue starter-capacity repair must remain scoped to the active generation, world, and realm shard.",
);
assert.match(serverSource, /pendingActivationEventId:[\s\S]*completePendingExpansionActivation/);
assert.match(serverSource, /completePendingExpansionActivation[\s\S]*verifyPreparedExpansionRegion/);
assert.match(serverSource, /finalizePendingActivation/);
assert.match(serverSource, /requireActiveWorldRegionIds[\s\S]*ensureCoreExpansionState/);
assert.match(serverSource, /ensureMainIslandForPlayer[\s\S]*allowExpansionPreparation[\s\S]*requireActiveWorldRegionId/);
assert.match(serverSource, /sendArmyOrder[\s\S]*requireActiveWorldRegionIds/);
assert.match(serverSource, /getDeedCampCandidateRegionIds[\s\S]*activeRegionIds\.has\(regionId\)/);
assert.match(serverSource, /getCoreAuthoritativeRoutePlanner/);
assert.match(serverSource, /CORE_TEMPLATE_WORLD_MAPS[\s\S]*templateRegionId/);
const clientSource = read("game.js");
assert.match(clientSource, /CORE_EXPANSION_TOPOLOGY_ACTIVE[\s\S]*worldTopology/);
assert.ok(
  clientSource.indexOf('const STARTER_REGION_TYPE = "starter";')
    < clientSource.indexOf("const WORLD_REGIONS = getMergedWorldRegions"),
  "The starter region type must be initialized before the active Core-expansion region catalog is merged."
);
assert.match(
  clientSource,
  /STATIC_ACTIVE_WORLD_REGION_IDS[\s\S]*?filter\(region => region\?\.permanentCore === true\)/,
  "Only permanent Core maps may bypass the authoritative expansion-state activation list in the client.",
);
assert.match(clientSource, /isWorldRegionRuntimeActive\(targetRegionId\)/);
assert.match(clientSource, /applyCoreExpansionRealmState\(realm\)/);
assert.match(clientSource, /registerCoreExpansionRegions/);
assert.match(clientSource, /subscribeOnlineCoreExpansion/);
assert.match(read("firebaseClient.js"), /subscribeCoreExpansionState[\s\S]*realmGenerations[\s\S]*expansion[\s\S]*current/);
assert.match(read("firestore.rules"), /match \/expansion\/\{stateId\}[\s\S]*allow read:[\s\S]*currentResetGeneration/);
assert.match(
  read("functions/test/run-emulator-gates.js"),
  /const coreExpansionGate\s*=\s*["']emulator-core-expansion-state\.js["'][\s\S]*CROWNLANDS_FORCE_CORE_EXPANSION_EMULATOR:\s*fileName === coreExpansionGate/,
);
const indexSource = read("index.html");
assert.match(indexSource, /region-catalog\.js\?v=20260903-cache-safe-map-art-r1/);
assert.match(indexSource, /assets\/worlds\/core-expansion-v1\/region-catalog\.js\?v=20260903-cache-safe-map-art-r1/);

const preparedText = [JSON.stringify(layout), JSON.stringify(catalog)].join("\n");
for (const forbidden of ["developmentOnly", "productionActivated", "fixturePackageAvailabilityOnly", "Core v2 QA-1", "phase6d", "phase6f"]) {
  assert(!preparedText.includes(forbidden), `Prepared release leaked development marker ${forbidden}.`);
}

console.log(`Validated the ${resetControlState} Core-expansion release bundle, north-center cardinal layer starts, 81 unique medieval map names, 3,720 city definitions, 17 objectives, asset hashes, runtime wiring, and fail-closed reset controls.`);
