const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const indexesSource = fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8");
const readmeSource = fs.readFileSync(path.join(root, "README.md"), "utf8");
const rulesPageSource = fs.readFileSync(path.join(root, "game-rules.html"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function sourceBetween(source, startMarker, endMarker, message) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(message);
  return source.slice(start, end);
}

requireMatch(
  serverSource,
  /function isStrongholdLegacyTarget[\s\S]*?isStronghold\(stronghold\) && !isCrownCitadel\(stronghold\)/,
  "Stronghold Legacy tracking must exclude the Crown Citadel."
);
requireMatch(
  serverSource,
  /strongholdLegacies\/\$\{getRealmStorageId\(\)\}\/entries\/\$\{strongholdId\}__\$\{safeUid\}/,
  "Stronghold Legacy records are not separated by Stronghold and player."
);
requireMatch(
  serverSource,
  /prefetchStrongholdLegacySnapshots[\s\S]*?Promise\.all\(refs\.map\(ref => transaction\.get\(ref\)\)\)/,
  "Stronghold Legacy documents are not prefetched during the transaction read phase."
);

const legacyWriterSource = sourceBetween(
  serverSource,
  "function recordStrongholdLegacyControlChange",
  "function realmActivityEventRef",
  "Could not isolate the Stronghold Legacy writer."
);
if (/transaction\.get\(/.test(legacyWriterSource)) {
  throw new Error("Stronghold Legacy writes perform a late transaction read and can strand arrived armies.");
}
requireMatch(legacyWriterSource, /strongholdId:[\s\S]*?worldId: ONLINE_WORLD_ID[\s\S]*?resetGeneration: RESET_GENERATION/, "Stronghold Legacy scores are not scoped to one Stronghold, world, and reset.");
requireMatch(legacyWriterSource, /recordedHeldSinceMs[\s\S]*?lastCapturedAtMs[\s\S]*?completedTenureMs/, "Existing Stronghold tenure is not retained when the ledger first records a handoff.");
requireMatch(legacyWriterSource, /totalHeldMs:[\s\S]*?completedTenureMs[\s\S]*?currentHeldSinceMs: 0[\s\S]*?isCurrentHolder: false/, "A departing holder's cumulative Stronghold time is not closed correctly.");
requireMatch(legacyWriterSource, /transaction\.set\(newRef[\s\S]*?totalHeldMs:[\s\S]*?currentHeldSinceMs: nowMs[\s\S]*?isCurrentHolder: true/, "A capturing holder's live Stronghold tenure is not started correctly.");

const inactiveReleaseSource = sourceBetween(
  serverSource,
  "async function releaseInactiveCity",
  "async function releaseInactiveCamp",
  "Could not isolate inactive city release handling."
);
requireMatch(inactiveReleaseSource, /prefetchStrongholdLegacySnapshots[\s\S]*?recordStrongholdLegacyControlChange/, "Inactivity releases do not close Stronghold Legacy tenure.");

const relinquishSource = sourceBetween(
  serverSource,
  "exports.relinquishCity =",
  "exports.relocateMainCity =",
  "Could not isolate city relinquishment handling."
);
requireMatch(relinquishSource, /prefetchStrongholdLegacySnapshots[\s\S]*?recordStrongholdLegacyControlChange/, "Relinquishing a Stronghold does not close its Legacy tenure.");

const armyResolverSource = sourceBetween(
  serverSource,
  "async function resolveArmyOrderById",
  "exports.resolveArmyOrder =",
  "Could not isolate the army resolver."
);
const resolverPrefetchIndex = armyResolverSource.indexOf("const strongholdLegacySnapshots = await prefetchStrongholdLegacySnapshots");
const resolverFirstWriteIndex = Math.min(...[
  "writeRallyJoinMovementCopies",
  "writePreparedEconomy",
  "transaction.set(",
  "writeArmyMovementCopies",
].map(marker => armyResolverSource.indexOf(marker)).filter(index => index >= 0));
if (resolverPrefetchIndex < 0 || !Number.isFinite(resolverFirstWriteIndex) || resolverPrefetchIndex > resolverFirstWriteIndex) {
  throw new Error("The army resolver does not read Stronghold Legacy state before transaction writes begin.");
}
const resolverLegacyWrites = [...armyResolverSource.matchAll(/recordStrongholdLegacyControlChange\(transaction, \{([\s\S]*?)\n\s*\}\);/g)];
if (resolverLegacyWrites.length !== 2 || resolverLegacyWrites.some(match => !/legacySnapshots: strongholdLegacySnapshots/.test(match[1]))) {
  throw new Error("Every direct and rally Stronghold capture must use the prefetched Legacy snapshots.");
}

requireMatch(
  serverSource,
  /strongholdLegacySnaps\.filter\(snapshot => snapshot\.exists\)[\s\S]*?playerName: identity\.ownerName[\s\S]*?playerFlag: identity\.ownerFlag/,
  "Player identity changes do not update existing Stronghold Legacy entries."
);
requireMatch(
  rulesSource,
  /match \/strongholdLegacies\/\{realmStorageId\}\/entries\/\{entryId\}[\s\S]*?allow read: if signedIn\(\)[\s\S]*?realmStorageId == currentRealmStorageId\(\)[\s\S]*?allow create, update, delete: if false;/,
  "Stronghold Legacy scores must be readable by signed-in players and writable only by the server."
);

const legacyLoaderSource = sourceBetween(
  firebaseClientSource,
  "async function loadStrongholdLegacyLeaderboard",
  "function subscribePlayerGlobalStats",
  "Could not isolate the Stronghold Legacy loader."
);
requireMatch(legacyLoaderSource, /strongholdLegacies/, "Missing the Stronghold Legacy client loader.");
requireMatch(legacyLoaderSource, /where\("strongholdId",\s*"==",\s*safeStrongholdId\)/, "The Stronghold Legacy query is not isolated to one Stronghold.");
requireMatch(legacyLoaderSource, /where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)/, "The Stronghold Legacy query does not prove the reset-generation read rule.");
requireMatch(legacyLoaderSource, /where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)/, "The Stronghold Legacy query does not prove the world read rule.");
requireMatch(legacyLoaderSource, /\.\.\.getRealmShardQueryConstraints\(where\)/, "The Stronghold Legacy query does not use the legacy-compatible shard read rule.");
requireMatch(legacyLoaderSource, /orderBy\("totalHeldMs",\s*"desc"\)/, "The Stronghold Legacy query is not ranked by completed hold time.");
requireMatch(legacyLoaderSource, /currentHolderRef[\s\S]*?getDoc\(currentHolderRef\)[\s\S]*?legacyDocs\.push\(currentHolderSnapshot\)/, "The live holder's prior cumulative score can fall outside the completed-time query limit.");
requireMatch(
  indexesSource,
  /"collectionGroup":\s*"entries"[\s\S]*?"fieldPath":\s*"strongholdId"[\s\S]*?"fieldPath":\s*"resetGeneration"[\s\S]*?"fieldPath":\s*"worldId"[\s\S]*?"fieldPath":\s*"realmShardId"[\s\S]*?"fieldPath":\s*"totalHeldMs"[\s\S]*?"order":\s*"DESCENDING"/,
  "Missing the per-Stronghold ranked Legacy composite index."
);
requireMatch(firebaseClientSource, /loadStrongholdLegacyLeaderboard,/, "The Stronghold Legacy loader is not exported to the game client.");

requireMatch(clientSource, /Stronghold Legacy<\/button>/, "Stronghold information is missing the Stronghold Legacy tab.");
requireMatch(clientSource, /function getRankedStrongholdLegacies[\s\S]*?strongholdId[\s\S]*?isCurrentHolder: true[\s\S]*?getStrongholdLegacyScoreMs/, "Stronghold Legacy ranking does not merge the live current holder into cumulative scores.");
requireMatch(clientSource, /data-stronghold-legacy-score/, "The current Stronghold holder's timer does not update live.");
requireMatch(clientSource, /querySelectorAll\("\[data-citadel-reign-score\], \[data-stronghold-legacy-score\]"\)/, "Stronghold Legacy timers are not included in the live UI clock.");
requireMatch(clientSource, /modalBody\.innerHTML = stronghold[\s\S]*?strongholdInfoPanelMarkup\(city, overviewMarkup\)[\s\S]*?bindStrongholdInfoTabs\(city\)/, "Foreign or neutral Strongholds do not expose the Legacy panel.");
requireMatch(clientSource, /modalBody\.innerHTML = strongholdInfoPanelMarkup\(city, overviewMarkup\);[\s\S]*?bindStrongholdInfoTabs\(city\)/, "Owned Strongholds do not expose the Legacy panel.");
requireMatch(clientSource, /previousStrongholdLegacySignature[\s\S]*?strongholdLegacyCache\.delete\(openStrongholdId\)[\s\S]*?showCityInfoModal\(openStrongholdId\)/, "An open Stronghold Legacy panel does not refresh after a live ownership handoff.");

requireMatch(readmeSource, /Stronghold Legacy ledger/, "README documentation is missing Stronghold Legacy behavior.");
requireMatch(rulesPageSource, /Stronghold Legacy ledger/, "Published game rules are missing Stronghold Legacy behavior.");

console.log("Validated per-Stronghold Legacy authority, cumulative handoffs, live ranking UI, rules, index, and documentation.");
