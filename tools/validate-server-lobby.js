"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const topology = require("../functions/realmTopology.js");
const releaseConfig = require("../functions/release-config.json");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

requireMatch(serverSource, /GAME_SERVER_ID\s*=\s*"crown-marches"/, "The Crown Marches server id is missing.");
requireMatch(serverSource, /GAME_SERVER_NAME\s*=\s*"The Crown Marches"/, "The medieval server name is missing.");
requireMatch(serverSource, /getRealmShardCapacity\(REALM_CONFIG\)/, "Realm capacity is not configuration-driven.");
requireMatch(serverSource, /async function ensureRealmShardAssignment/, "Missing server-authoritative shard allocation.");
requireMatch(serverSource, /nextPlayerSequence:\s*sequence \+ 1/, "Shard allocation does not advance atomically.");
requireMatch(serverSource, /newlyAssigned:\s*false/, "Shard allocation is not retry-idempotent.");
requireMatch(serverSource, /admissionModel:\s*"sharded-members-v3"/, "Realm admission is not using the sharded member model.");
requireMatch(serverSource, /waitingCount:\s*0/, "The removed global waiting room is still represented as active.");
requireMatch(serverSource, /exports\.joinGameServer\s*=\s*(?:onCall|timedCallable)/, "Missing realm admission callable.");
requireMatch(serverSource, /exports\.heartbeatGameServer\s*=\s*(?:onCall|timedCallable)/, "Missing realm heartbeat callable.");
requireMatch(serverSource, /exports\.leaveGameServer\s*=\s*(?:onCall|timedCallable)/, "Missing realm leave callable.");
requireMatch(serverSource, /exports\.maintainGameServer\s*=\s*onSchedule[\s\S]*?every 1 minutes/, "Missing stale-member cleanup.");
assert.doesNotMatch(serverSource, /activeSlots\s*:/, "The unbounded shared active-slot map still exists.");
assert.doesNotMatch(serverSource, /waitingQueue\s*:/, "The unbounded shared waiting queue still exists.");
assert.doesNotMatch(serverSource, /status:\s*"waiting"/, "New joins can still be routed to a global waiting room.");

const capacity = topology.getRealmShardCapacity(releaseConfig);
const assignments = Array.from({ length: 120 }, (_, sequence) => (
  topology.getRealmShardForSequence(sequence, capacity)
));
const counts = assignments.reduce((result, assignment) => {
  result[assignment.realmShardId] = (result[assignment.realmShardId] || 0) + 1;
  return result;
}, {});
assert.deepEqual(counts, { shard_0001: 50, shard_0002: 50, shard_0003: 20 });

requireMatch(firebaseClientSource, /clientRealmShardId:\s*REALM_SHARD_ID/, "Callable requests omit the verified shard.");
requireMatch(firebaseClientSource, /applyRealmIdentity\(result\?\.currentUser \|\| result\)/, "Starting-city assignment is not adopted by the Firebase client.");
requireMatch(clientSource, /claimedIslandChanged/, "A newly assigned player is not reconnected to the allocated island shard.");
requireMatch(clientSource, /--\$\{REALM_SHARD_ID\}--/, "The game client does not construct sharded island ids.");
requireMatch(rulesSource, /currentRealmShardId\(\)/, "Firestore rules do not scope reads to the player's shard.");
requireMatch(rulesSource, /match \/gameServers\/\{serverId\}[\s\S]*?allow read, create, update, delete: if false;/, "Realm membership state must remain server-owned.");

console.log("Validated unlimited realm admission with 50-player shard allocation and no global waiting room.");
