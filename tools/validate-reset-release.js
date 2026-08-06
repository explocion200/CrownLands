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

for (const value of [serverRealm.releaseId, serverRealm.resetGeneration, serverRealm.worldId]) {
  if (!value || !browserRealm.includes(JSON.stringify(value))) {
    throw new Error(`Browser/server realm configuration drifted for ${value || "an empty value"}.`);
  }
}

requireMatch(server, /STARTER_REGION_IDS[\s\S]*type[\s\S]*starter/, "Starter islands are not derived from authoritative map metadata.");
requireMatch(server, /claimFreshStartingCity[\s\S]*leastPopulated[\s\S]*crypto\.randomInt/, "Starting islands are not balanced with random tie breaking.");
requireMatch(server, /transaction\.set\(playerRef,[\s\S]*freshProfile[\s\S]*\}\);/, "Reset profiles must replace old gameplay state.");
requireMatch(server, /writeOwnershipChangeEvent[\s\S]*processOwnershipChangeEvent/, "Ownership changes are not using the durable event pipeline.");
if (/exports\.syncCityArmyTargetOwner|exports\.syncCampArmyTargetOwner/.test(server)) {
  throw new Error("Broad city/camp write triggers are still exported.");
}
requireMatch(server, /rebuildClanPowerOnPlayerStats[\s\S]*previousStatsPower === nextPower[\s\S]*return/, "Clan power work does not stop before reads when power is unchanged.");
requireMatch(server, /exports\.getRealmInfo[\s\S]*REALM_RELEASE_ID/, "The realm-info release handshake is missing.");
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
  /loadPlayerIdentities[\s\S]*?doc\(client\.db,\s*"leaderboards",\s*RESET_GENERATION,\s*"entries",\s*identityUid\)/,
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

for (let trial = 0; trial < 500; trial += 1) {
  const counts = [0, 0, 0, 0, 0];
  for (let player = 0; player < 50; player += 1) {
    const minimum = Math.min(...counts);
    const candidates = counts.map((count, index) => count === minimum ? index : -1).filter(index => index >= 0);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    counts[chosen] += 1;
    if (Math.max(...counts) - Math.min(...counts) > 1) {
      throw new Error(`Balanced allocation invariant failed: ${counts.join(",")}`);
    }
  }
  if (counts.reduce((sum, count) => sum + count, 0) !== 50) {
    throw new Error("The reset allocation model lost a player.");
  }
}

console.log(`Reset release validation passed for ${serverRealm.resetGeneration}.`);
