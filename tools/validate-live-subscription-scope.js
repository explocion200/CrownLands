const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const clientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

function extractFunction(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", match.index);
  let parentheses = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parentheses += 1;
    if (source[index] === ")") parentheses -= 1;
    if (parentheses === 0) {
      parametersEnd = index;
      break;
    }
  }
  assert.ok(parametersEnd > parametersStart, `Could not parse ${name} parameters.`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const subscribeIsland = extractFunction(clientSource, "subscribeIsland");
for (const collectionName of ["cities", "camps", "armies", "presence"]) {
  assert.match(
    subscribeIsland,
    new RegExp(`collection\\(client\\.db, "islands", islandId, "${collectionName}"\\)`),
    `The live ${collectionName} listener must remain scoped to the selected island.`
  );
}
assert.doesNotMatch(subscribeIsland, /collectionGroup\(/, "Island rendering must not subscribe to world-wide collection groups.");
assert.match(subscribeIsland, /where\("status", "==", "active"\)/, "Island army rendering must subscribe only to active marches.");
assert.match(subscribeIsland, /return \(\) => unsubscribers\.forEach\(unsubscribe => unsubscribe\(\)\)/, "Island listeners must expose one cleanup function.");

const subscribePlayerArmies = extractFunction(clientSource, "subscribePlayerArmies");
assert.match(subscribePlayerArmies, /collection\(client\.db, "armies"\)[\s\S]*?where\("ownerUid", "==", uid\)[\s\S]*?where\("status", "==", "active"\)/, "Global march knowledge must be limited to the player's active outgoing marches.");
assert.match(subscribePlayerArmies, /collection\(client\.db, "players", uid, "incomingArmies"\)/, "Incoming threats must use the player's private projection.");
assert.doesNotMatch(subscribePlayerArmies, /collectionGroup\(/, "Player march listeners must not scan every island projection.");

const subscribePlayerReinforcements = extractFunction(clientSource, "subscribePlayerReinforcements");
assert.match(subscribePlayerReinforcements, /subscribe\("contributor", "ownerUid"\)/, "Players must receive reinforcements they contributed.");
assert.match(subscribePlayerReinforcements, /subscribe\("holder", "targetOwnerUid"\)/, "Players must receive reinforcements stationed at their holdings.");
assert.match(subscribePlayerReinforcements, /where\("status", "==", "stationed"\)/, "Completed reinforcement history must not stay live.");

const subscribePlayerCamps = extractFunction(clientSource, "subscribePlayerCamps");
assert.match(subscribePlayerCamps, /where\("holderUid", "==", client\.user\.uid\)/, "Held-camp updates must be limited to the current player.");

const subscribeServerReports = extractFunction(clientSource, "subscribeServerReports");
assert.match(subscribeServerReports, /limit\(120\)/, "The live report feed must remain bounded.");

const connectOnlineIsland = extractFunction(gameSource, "connectOnlineIsland");
assert.match(connectOnlineIsland, /retireActiveOnlineIslandSubscription\(\);[\s\S]*?startActiveOnlineIslandSubscription/, "Map switching must retire the previous island listener before installing the next one.");
const startActiveOnlineIslandSubscription = extractFunction(gameSource, "startActiveOnlineIslandSubscription");
assert.match(startActiveOnlineIslandSubscription, /subscriptionGeneration = retireActiveOnlineIslandSubscription\(\);[\s\S]*?subscribeOnlineIslandWithInitialCities/, "The reusable active-island subscription must retire an existing listener before reconnecting.");
assert.match(startActiveOnlineIslandSubscription, /subscriptionGeneration === onlineIslandSubscriptionGeneration[\s\S]*?if \(!isCurrentSubscription\(\)\) return/, "Late callbacks from superseded island listeners must not update the active map.");

const findRouteAsync = extractFunction(gameSource, "findRouteAsync");
assert.match(findRouteAsync, /requestRouteFromWorker\(job\)/, "Interactive pathfinding must use the route worker.");
assert.doesNotMatch(findRouteAsync, /\bfindRoute\s*\(/, "Interactive route failures must never fall back to main-thread pathfinding.");

console.log("Validated island-scoped listeners, bounded player knowledge, cleanup, and worker-only interactive routing.");
