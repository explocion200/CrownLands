const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const indexesSource = fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8");
const stylesSource = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`;

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function sourceBetween(source, startMarker, endMarker, message) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(message);
  return source.slice(start, end);
}

requireMatch(serverSource, /recordCrownCitadelControlChange[\s\S]*?totalHeldMs[\s\S]*?currentHeldSinceMs/, "Missing server-authoritative Citadel reign accumulation.");
requireMatch(serverSource, /recordCrownCitadelControlChange[\s\S]*?worldId: ONLINE_WORLD_ID[\s\S]*?resetGeneration: RESET_GENERATION/, "Citadel reign scores are not scoped to the current world reset.");
requireMatch(serverSource, /prefetchCrownCitadelReignSnapshots[\s\S]*?Promise\.all\(refs\.map\(ref => transaction\.get\(ref\)\)\)/, "Citadel reign documents are not prefetched during the transaction read phase.");
requireMatch(serverSource, /if \(isCrownCitadel\(target\)\)[\s\S]*?recordCrownCitadelControlChange/, "Citadel captures do not update the Reign Ledger.");
requireMatch(serverSource, /if \(isCrownCitadel\(source\)\)[\s\S]*?recordCrownCitadelControlChange/, "Relinquishing the Citadel does not close the current reign.");
const reignWriterSource = sourceBetween(
  serverSource,
  "function recordCrownCitadelControlChange",
  "function isStrongholdLegacyTarget",
  "Could not isolate the Citadel reign writer."
);
if (/transaction\.get\(/.test(reignWriterSource)) {
  throw new Error("Citadel reign writes perform a late transaction read and can strand arrived armies.");
}
requireMatch(reignWriterSource, /reignSnapshots[\s\S]*?transaction\.set\(oldRef[\s\S]*?transaction\.set\(newRef/, "Citadel reign changes do not use the prefetched snapshots.");
const armyResolverSource = sourceBetween(
  serverSource,
  "async function resolveArmyOrderById",
  "exports.resolveArmyOrder =",
  "Could not isolate the army resolver."
);
const resolverPrefetchIndex = armyResolverSource.indexOf("const citadelReignSnapshots = await prefetchCrownCitadelReignSnapshots");
const resolverFirstWriteIndex = Math.min(...[
  "writeRallyJoinMovementCopies",
  "writePreparedEconomy",
  "transaction.set(",
  "writeArmyMovementCopies",
].map(marker => armyResolverSource.indexOf(marker)).filter(index => index >= 0));
if (resolverPrefetchIndex < 0 || !Number.isFinite(resolverFirstWriteIndex) || resolverPrefetchIndex > resolverFirstWriteIndex) {
  throw new Error("The army resolver does not read Citadel reign state before transaction writes begin.");
}
const resolverCitadelWrites = [...armyResolverSource.matchAll(/recordCrownCitadelControlChange\(transaction, \{([\s\S]*?)\n\s*\}\);/g)];
if (resolverCitadelWrites.length !== 2 || resolverCitadelWrites.some(match => !/reignSnapshots: citadelReignSnapshots/.test(match[1]))) {
  throw new Error("Every direct and rally Citadel capture must use the prefetched reign snapshots.");
}
requireMatch(rulesSource, /match \/crownCitadelReigns\/(?:\{uid\}|\{resetId\}\/entries\/\{uid\})[\s\S]*?allow read: if signedIn\(\)(?:\s*&&[\s\S]*?)?;[\s\S]*?allow create, update, delete: if false;/, "Citadel reign scores must be public to signed-in players and server-owned.");
const reignLoaderSource = sourceBetween(
  firebaseClientSource,
  "async function loadCrownCitadelReignLeaderboard",
  "function subscribePlayerGlobalStats",
  "Could not isolate the public Reign Ledger loader."
);
requireMatch(reignLoaderSource, /crownCitadelReigns/, "Missing public Reign Ledger loader.");
requireMatch(reignLoaderSource, /where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)/, "The Reign Ledger query does not prove the reset-generation read rule.");
requireMatch(reignLoaderSource, /where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)/, "The Reign Ledger query does not prove the world read rule.");
requireMatch(reignLoaderSource, /orderBy\("totalHeldMs",\s*"desc"\)/, "The Reign Ledger query is not ranked by completed hold time.");
requireMatch(indexesSource, /"collectionGroup":\s*"entries"[\s\S]*?"fieldPath":\s*"resetGeneration"[\s\S]*?"fieldPath":\s*"worldId"[\s\S]*?"fieldPath":\s*"totalHeldMs"[\s\S]*?"order":\s*"DESCENDING"/, "Missing the ranked Reign Ledger composite index.");
requireMatch(firebaseClientSource, /subscribeCrownCitadel[\s\S]*?onCitadel/, "Missing lightweight Crown Citadel control listener.");
requireMatch(clientSource, /Reign Ledger/, "Crown Citadel info is missing the Reign Ledger tab.");
requireMatch(clientSource, /data-citadel-reign-score/, "Citadel reign scores do not update while the current reign is active.");
requireMatch(clientSource, /function reconcileOnlineCrownCitadelSnapshot[\s\S]*?onlineOwnedCitiesCache[\s\S]*?function refreshOpenCrownCitadelInfoModal/, "Live Citadel snapshots are not reconciled into the owned-city and open-modal state.");
requireMatch(clientSource, /onCitadel: citadel =>[\s\S]*?reconcileOnlineCrownCitadelSnapshot\(citadel\)[\s\S]*?updateOutgoingAttackUi\(\)[\s\S]*?refreshOpenCrownCitadelInfoModal/, "Citadel changes do not refresh the map, Kingdom Activity, and open Citadel information.");
requireMatch(clientSource, /function applyOnlineCities[\s\S]*?if \(onlineCrownCitadelLoaded\) \{[\s\S]*?reconcileOnlineCrownCitadelSnapshot\(onlineCrownCitadelSnapshot\)/, "Island payloads can overwrite the dedicated authoritative Citadel snapshot.");
requireMatch(clientSource, /if \(current\) Object\.assign\(current, next\);[\s\S]*?else if \(getCityRegionId\(next\) === getActiveMapRegionId\(\)\) state\.cities\.push\(next\);/, "Cross-map Citadel updates can pollute the active region city state.");
requireMatch(clientSource, /cityOwnerHoldsCrownCitadel[\s\S]*?citadel-city-crown/, "Cities owned by the Citadel ruler do not receive crown markers.");
requireMatch(stylesSource, /\.citadel-city-crown/, "Citadel city crown styling is missing.");
requireMatch(stylesSource, /\.citadel-reign-row\.current/, "Current Citadel ruler styling is missing.");

console.log("Validated Crown Citadel Reign Ledger authority, public scoring, live control sync, and city crown markers.");
