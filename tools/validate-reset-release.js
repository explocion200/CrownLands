const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

const server = read("functions/index.js");
const client = read("firebaseClient.js");
const game = read("game.js");
const rules = read("firestore.rules");
const indexes = JSON.parse(read("firestore.indexes.json"));
const browserRealm = read("release-config.js");
const serverRealm = JSON.parse(read("functions/release-config.json"));
const manifestGenerator = read("tools/generate-release-manifest.js");
const worldLayout = JSON.parse(read("assets/worlds/world_01/world-layout.json"));
const serverWorldLayout = JSON.parse(read("functions/world-layout.json"));
const topology = require("../functions/realmTopology.js");
const coreTopology = require("../functions/coreExpansionTopology.js");
const coreWorldLayout = JSON.parse(read("functions/core-expansion-world-layout.json"));
const coreRegionCatalog = JSON.parse(read("functions/core-expansion-region-catalog.json"));
const coreResetArmed = serverRealm.realmMode === "monthly-shared"
  && serverRealm.worldTopology === coreTopology.TOPOLOGY_VERSION
  && serverRealm.resetActivationHeld === false;

for (const value of [serverRealm.releaseId, serverRealm.resetGeneration, serverRealm.worldId, serverRealm.apiContractHash]) {
  if (!value || !browserRealm.includes(JSON.stringify(value))) {
    throw new Error(`Browser/server realm configuration drifted for ${value || "an empty value"}.`);
  }
}
if (!/^[a-f0-9]{64}$/.test(serverRealm.apiContractHash)) {
  throw new Error("The API contract hash must be an explicit 64-character lowercase hex value.");
}
requireMatch(
  manifestGenerator,
  /const contractHash = String\(release\.apiContractHash[\s\S]*contractHash,\r?\n\s+serverSourceHash/,
  "Release compatibility must use the explicit API contract instead of the environment-dependent source hash.",
);
if (/\.update\(serverSourceHash\)[\s\S]*JSON\.stringify\(callableNames\)/.test(manifestGenerator)) {
  throw new Error("Build implementation files must not silently redefine the public API contract.");
}

requireMatch(
  server,
  /isNewPlayerSpawnMap[\s\S]*newPlayerSpawnEligible[\s\S]*type[\s\S]*starter[\s\S]*NEW_PLAYER_SPAWN_REGION_IDS/,
  "New-player spawn maps are not derived from authoritative map metadata.",
);
requireMatch(server, /claimFreshStartingCity[\s\S]*leastPopulated[\s\S]*crypto\.randomInt/, "Starting islands are not balanced with random tie breaking.");
requireMatch(server, /transaction\.set\(playerRef,[\s\S]*freshProfile[\s\S]*\}\);/, "Reset profiles must replace old gameplay state.");
requireMatch(
  server,
  /createPersistentCommonGearForSeasonReset[\s\S]*commonGearBoxes:[\s\S]*instances:[\s\S]*equipped:[\s\S]*newMarkers:/,
  "Permanent Common Gear is not preserved by the reset allowlist.",
);
requireMatch(
  server,
  /readClanSeasonPersistenceContext[\s\S]*applyClanSeasonPersistence[\s\S]*clanIdentityRevision/,
  "Clan identity, roster, membership, and roles are not preserved across the reset.",
);
requireMatch(server, /writeOwnershipChangeEvent[\s\S]*processOwnershipChangeEvent/, "Ownership changes are not using the durable event pipeline.");
if (/exports\.syncCityArmyTargetOwner|exports\.syncCampArmyTargetOwner/.test(server)) {
  throw new Error("Broad city/camp write triggers are still exported.");
}
requireMatch(server, /rebuildClanPowerOnPlayerStats[\s\S]*previousStatsPower === nextPower[\s\S]*return/, "Clan power work does not stop before reads when power is unchanged.");
requireMatch(server, /exports\.getRealmInfo[\s\S]*REALM_RELEASE_ID/, "The realm-info release handshake is missing.");
requireMatch(
  server,
  /exports\.resolveDueArmyOrders = onSchedule\(\{[\s\S]*?memory:\s*"512MiB"/,
  "The scheduled army resolver must retain enough memory for the Core-expansion runtime bundle."
);
requireMatch(server, /serverBuildId:[\s\S]*contractHash:[\s\S]*releaseManifestVersion:/, "The server build-contract handshake is missing.");
requireMatch(client, /clientReleaseId: APP_RELEASE_ID[\s\S]*clientResetGeneration: RESET_GENERATION/, "Callable requests do not carry release identity.");
requireMatch(game, /verifyRealmCompatibility[\s\S]*releaseMatches[\s\S]*generationMatches[\s\S]*worldMatches[\s\S]*contractMatches/, "Gameplay does not fail closed on release or contract drift.");
requireMatch(rules, new RegExp(serverRealm.resetGeneration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "Firestore rules do not identify the active generation.");
requireMatch(
  client,
  /loadKingPowerLeaderboard[\s\S]*?where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)[\s\S]*?where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)[\s\S]*?orderBy\("kingPower",\s*"desc"\)/,
  "The King Power leaderboard query is not generation- and world-scoped."
);
requireMatch(
  client,
  /loadPlayerIdentities[\s\S]*?doc\(client\.db,\s*"leaderboards",\s*getRealmStorageId\(\),\s*"entries",\s*identityUid\)/,
  "Combat identity lookups are not reading the active generation leaderboard."
);
if (client.includes('doc(client.db, "leaderboards", "kingPower", "entries", identityUid)')) {
  throw new Error("Combat identity lookups still reference the archived leaderboard path.");
}

const serializedIndexes = JSON.stringify(indexes);
for (const field of ["resetGeneration", "worldId", "ownerUid", "holderUid", "targetKey", "arrivesAtMs"]) {
  if (!serializedIndexes.includes(`"${field}"`)) throw new Error(`Missing reset query index field: ${field}`);
}
const leaderboardIndex = indexes.indexes.find(index => (
  index.collectionGroup === "entries"
  && index.queryScope === "COLLECTION"
  && index.fields.some(field => field.fieldPath === "resetGeneration")
  && index.fields.some(field => field.fieldPath === "worldId")
  && index.fields.some(field => field.fieldPath === "kingPower" && field.order === "DESCENDING")
));
if (!leaderboardIndex) throw new Error("Missing generation-scoped King Power leaderboard index.");

for (const [label, source] of [["server", server], ["client", client]]) {
  const generationQueries = [...source.matchAll(/(?:\.where|where)\("resetGeneration",\s*"==",\s*RESET_GENERATION\)/g)];
  if (!generationQueries.length) throw new Error(`No ${label} generation-scoped queries were found.`);
  for (const match of generationQueries) {
    const queryTail = source.slice(match.index, match.index + 180);
    if (!/(?:\.where|where)\("worldId",\s*"==",\s*(?:WORLD_ID|ONLINE_WORLD_ID)\)/.test(queryTail)) {
      throw new Error(`${label} generation query is missing its worldId constraint near offset ${match.index}.`);
    }
  }
}

if (coreResetArmed) {
  const permanentCore = coreRegionCatalog.regions.filter(region => region.permanentCore === true);
  const newLands = coreRegionCatalog.regions.filter(region => region.permanentCore !== true);
  if (permanentCore.length !== coreTopology.CORE_MAP_COUNT || permanentCore.some(region => region.spawnEligible || region.spawnReady)) {
    throw new Error("The 25-map Core must remain completely excluded from starting placement.");
  }
  if (newLands.length < coreTopology.FIRST_LAYER_MAP_COUNT
    || newLands.some(region => Number(region.cityCapacity) !== coreTopology.NEW_LANDS_CITY_CAPACITY)) {
    throw new Error("Prepared New Lands maps do not expose 40 neutral-city templates.");
  }
  const initialExpansion = coreTopology.createInitialExpansionState("realm-reset-validation");
  if (JSON.stringify(initialExpansion.activeRegionIds) !== JSON.stringify(["new-lands-l01-p001"])
    || JSON.stringify(initialExpansion.admittingRegionIds) !== JSON.stringify(["new-lands-l01-p001"])) {
    throw new Error("The reset must begin at the north-center cardinal New Lands entrance.");
  }
  const firstNewLandsMap = coreWorldLayout.maps.find(map => map.id === initialExpansion.activeRegionIds[0]);
  if (!firstNewLandsMap || firstNewLandsMap.cities?.length !== coreTopology.NEW_LANDS_CITY_CAPACITY) {
    throw new Error("The first admitting New Lands map is not fully prepared.");
  }
  if (coreTopology.MAX_NEW_LANDS_REGIONS * coreTopology.EXPANSION_THRESHOLD_NPC_CITIES !== 81_900) {
    throw new Error("The automatic New Lands capacity envelope drifted.");
  }
} else {
  const newPlayerSpawnMapCount = worldLayout.regions.filter(map => map.newPlayerSpawnEligible === true).length;
  if (newPlayerSpawnMapCount !== 5) {
    throw new Error(`Expected 5 designated new-player spawn maps, found ${newPlayerSpawnMapCount}.`);
  }
  const spawnRegionIds = worldLayout.regions
    .filter(map => map.newPlayerSpawnEligible === true)
    .map(map => map.id);
  if (JSON.stringify(spawnRegionIds) !== JSON.stringify(["region_11", "region_12", "region_13", "region_14", "region_15"])) {
    throw new Error(`The reset spawn allowlist drifted: ${JSON.stringify(spawnRegionIds)}.`);
  }
  const startingCityCapacity = serverWorldLayout.maps
    .filter(map => spawnRegionIds.includes(map.id))
    .reduce((total, map) => total + (Array.isArray(map.cities) ? map.cities.length : 0), 0);
  if (startingCityCapacity !== 363 || serverRealm.sharedRealmStartingCityCapacity !== startingCityCapacity) {
    throw new Error(`Shared-realm starting capacity drifted: layout=${startingCityCapacity}, config=${serverRealm.sharedRealmStartingCityCapacity}.`);
  }
  for (let trial = 0; trial < 500; trial += 1) {
    const counts = Array(newPlayerSpawnMapCount).fill(0);
    for (let player = 0; player < 150; player += 1) {
      const minimum = Math.min(...counts);
      const candidates = counts.map((count, index) => count === minimum ? index : -1).filter(index => index >= 0);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      counts[chosen] += 1;
      if (Math.max(...counts) - Math.min(...counts) > 1) {
        throw new Error(`Balanced allocation invariant failed: ${counts.join(",")}`);
      }
    }
    if (counts.reduce((sum, count) => sum + count, 0) !== 150) {
      throw new Error("The reset allocation model lost a player.");
    }
  }
}

const shardCounts = Array.from({ length: 150 }, (_, sequence) => (
  topology.getSharedRealmAssignment(sequence)
)).reduce((counts, assignment) => {
  counts[assignment.realmShardId] = (counts[assignment.realmShardId] || 0) + 1;
  return counts;
}, {});
if (JSON.stringify(shardCounts) !== JSON.stringify({ shard_0001: 150 })) {
  throw new Error(`Shared realm split or lost players: ${JSON.stringify(shardCounts)}.`);
}

const validationTarget = coreResetArmed
  ? topology.getRealmIdentity(serverRealm, Date.parse(serverRealm.monthlyResetStartsAt)).resetGeneration
  : serverRealm.resetGeneration;
console.log(`Reset release validation passed for ${validationTarget}.`);
