const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const firebaseClient = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const indexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "functions", "package.json"), "utf8"));
const emulatorRunner = fs.readFileSync(path.join(root, "functions", "test", "run-emulator-gates.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionBody(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`);
  const end = source.indexOf(`function ${nextFunctionName}`, start + 1);
  assert(start >= 0 && end > start, `Could not inspect ${functionName}.`);
  return source.slice(start, end);
}

const armySubscription = functionBody(firebaseClient, "subscribePlayerArmies", "subscribePlayerReinforcements");
assert(
  /collection\(client\.db,\s*"players",\s*uid,\s*"incomingArmies"\)[\s\S]*where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)[\s\S]*where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)[\s\S]*where\("status",\s*"==",\s*"active"\)/.test(armySubscription),
  "Incoming armies must be queried by the exact active realm and status required by Firestore rules."
);
assert(
  /retryDelaysMs\s*=\s*\[1000,\s*2000,\s*5000,\s*10000,\s*30000\]/.test(armySubscription),
  "Army listeners must retain bounded reconnect backoff."
);
assert(
  /sourceState\s*=\s*new Map/.test(armySubscription)
    && /handlers\.onError\(error,\s*source/.test(armySubscription)
    && /handlers\.onStatus/.test(armySubscription),
  "Incoming and outgoing army listeners must recover and report status independently."
);

const onlineArmyWatchers = functionBody(game, "subscribeOnlineArmyWatchers", "subscribeOnlineReinforcements");
assert(
  !onlineArmyWatchers.includes("clearOnlineArmyWatchers({ clear: false })"),
  "A single army listener failure must not tear down both live streams."
);
assert(
  onlineArmyWatchers.includes("source") && game.includes("March sync reconnecting"),
  "The client must identify and surface a persistently reconnecting army stream."
);

const presenceSave = functionBody(firebaseClient, "savePresence", "cleanLeaderboardEntry");
assert(
  presenceSave.includes("previousIslandId") && presenceSave.includes("deleteDoc"),
  "Saving presence on a new island must delete the previous-island presence document."
);
assert(
  firebaseClient.includes("presenceWritePromise: Promise.resolve(false)")
    && firebaseClient.includes("presenceWriteGeneration: 0"),
  "Presence writes must retain a serialized queue and generation guard."
);
const presenceQueue = functionBody(firebaseClient, "enqueuePresenceMutation", "clearActivePresence");
assert(
  presenceQueue.includes("client.presenceWritePromise")
    && presenceQueue.includes("generation === client.presenceWriteGeneration"),
  "Presence mutations must execute serially and skip superseded queued writes."
);
assert(
  presenceSave.includes("++client.presenceWriteGeneration")
    && presenceSave.includes("enqueuePresenceMutation"),
  "Every presence save must supersede stale queued map writes."
);
const publishPresence = functionBody(game, "publishOnlinePresence", "handleOnlineSnapshotError");
assert(
  !publishPresence.includes("if (onlinePresenceInFlight) return false")
    && publishPresence.includes("++onlinePresenceRequestGeneration")
    && publishPresence.includes("requestGeneration !== onlinePresenceRequestGeneration"),
  "Rapid map switches must queue their latest presence snapshot without stale completion state winning."
);
const activeIslandSubscription = functionBody(game, "startActiveOnlineIslandSubscription", "verifyRealmCompatibility");
assert(
  activeIslandSubscription.includes("subscriptionGeneration = retireActiveOnlineIslandSubscription()")
    && activeIslandSubscription.includes("subscriptionGeneration === onlineIslandSubscriptionGeneration")
    && activeIslandSubscription.includes("if (!isCurrentSubscription()) return")
    && activeIslandSubscription.includes('if (typeof unsubscribe === "function") unsubscribe()'),
  "Superseded island listeners must ignore late snapshots and unsubscribe instead of changing the active map."
);
const realtimeRestart = functionBody(game, "restartOnlineRealtimeSubscriptionsForResume", "isOnlineArmyVisible");
assert(
  realtimeRestart.includes("return await islandRestart"),
  "Foreground recovery must report when its island listener was superseded by a newer map switch."
);
const resolutionCityLoad = functionBody(game, "loadOnlineRegionCitiesForResolution", "resolveOverdueOnlineArmy");
assert(
  resolutionCityLoad.includes("applyOnlineCities(onlineCities, targetRegionId, { activateRegion: false })")
    && !resolutionCityLoad.includes("restoreOnlineActiveRegionSnapshot"),
  "Background city resolution loads must not restore an obsolete active-map snapshot."
);
const applyCities = functionBody(game, "applyOnlineCities", "normalizeOnlineCampState");
assert(
  applyCities.includes("{ activateRegion = true } = {}")
    && /if \(activateRegion\) \{[\s\S]*?state\.activeRegionId = activeRegionId/.test(applyCities),
  "Only active island subscriptions may update active-region state."
);
const islandSubscriptionStart = firebaseClient.indexOf("function subscribeIsland");
const islandSubscriptionEnd = firebaseClient.indexOf("window.CrownlandsOnline", islandSubscriptionStart);
assert(islandSubscriptionStart >= 0 && islandSubscriptionEnd > islandSubscriptionStart, "Could not inspect subscribeIsland.");
const islandSubscription = firebaseClient.slice(islandSubscriptionStart, islandSubscriptionEnd);
assert(
  islandSubscription.includes('where("resetGeneration", "==", RESET_GENERATION)')
    && islandSubscription.includes('where("worldId", "==", ONLINE_WORLD_ID)')
    && islandSubscription.includes('where("updatedAtMs", ">=", Date.now() - PRESENCE_ACTIVE_WINDOW_MS)')
    && islandSubscription.includes("limit(PRESENCE_QUERY_LIMIT)"),
  "Presence listeners must be realm-scoped, recent, and bounded."
);

assert(
  /match \/incomingArmies\/\{armyId\}[\s\S]*allow read: if ownsPlayerDoc\(uid\) && isCurrentGeneration\(resource\.data\)/.test(rules),
  "Incoming-army reads must remain private and generation-scoped."
);
const requiredIndexGroups = new Set(indexes.indexes.map(index => `${index.collectionGroup}:${index.queryScope}`));
assert(requiredIndexGroups.has("incomingArmies:COLLECTION"), "The active incoming-army query index is missing.");
assert(requiredIndexGroups.has("presence:COLLECTION"), "The active presence query index is missing.");
assert(
  fs.existsSync(path.join(root, "functions", "test", "emulator-army-listener-rules.js"))
    && /readdirSync\(testDirectory\)/.test(emulatorRunner)
    && /run-emulator-gates\.js/.test(packageJson.scripts?.["test:emulators"] || ""),
  "The exact client army queries must run against Firestore rules in the release gate."
);

["previewArmyRoute", "sendNearbyScouts", "sendRegroupOrders"].forEach(name => {
  assert(firebaseClient.includes(`async function ${name}`), `${name} is not exposed by the online client.`);
});

console.log("Realtime health validation passed: scoped army/presence listeners, independent recovery, UI degradation state, indexes, and emulator coverage.");
