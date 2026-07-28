const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "functions", "index.js");
const serverSource = fs.readFileSync(serverPath, "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const paramsStart = source.indexOf("(", start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === "(") paramsDepth += 1;
    if (source[index] === ")") paramsDepth -= 1;
    if (paramsDepth === 0) {
      paramsEnd = index;
      break;
    }
  }
  const bodyStart = source.indexOf("{", paramsEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

requireMatch(serverSource, /GAME_SERVER_ID\s*=\s*"crown-marches"/, "The Crown Marches server id is missing.");
requireMatch(serverSource, /GAME_SERVER_NAME\s*=\s*"The Crown Marches"/, "The medieval server name is missing.");
requireMatch(serverSource, /GAME_SERVER_CAPACITY\s*=\s*50/, "The realm must be capped at exactly 50 active players.");
requireMatch(serverSource, /GAME_SERVER_HEARTBEAT_MODEL_VERSION\s*=\s*2/, "The sharded heartbeat model is missing.");
requireMatch(serverSource, /exports\.joinGameServer\s*=\s*(?:onCall|timedCallable)/, "Missing server-authoritative realm admission.");
requireMatch(serverSource, /exports\.heartbeatGameServer\s*=\s*(?:onCall|timedCallable)/, "Missing realm heartbeat callable.");
requireMatch(serverSource, /exports\.leaveGameServer\s*=\s*(?:onCall|timedCallable)/, "Missing realm leave callable.");
requireMatch(serverSource, /exports\.maintainGameServer\s*=\s*onSchedule[\s\S]*?every 1 minutes/, "Missing scheduled stale-slot cleanup.");
requireMatch(serverSource, /currentEntry\.sessionId\s*!==\s*sessionId[\s\S]*?session-replaced/, "An old browser session could release a newer session's slot.");
requireMatch(serverSource, /let gameServerAdmissionQueue\s*=\s*Promise\.resolve\(\)/, "Realm admission is not serialized inside the admission service.");
requireMatch(serverSource, /exports\.joinGameServer\s*=\s*timedCallable\("joinGameServer",\s*\{[\s\S]*?maxInstances:\s*1,[\s\S]*?concurrency:\s*80,/, "Realm admission must use one concurrency-enabled instance so the exact capacity transaction cannot stampede.");
requireMatch(serverSource, /async function withGameServerAdmissionLease[\s\S]*?leaseRef\.create\([\s\S]*?lastUpdateTime:\s*leaseWrite\.updateTime/, "Realm admission lacks a cross-worker lease with safe conditional release.");
const writeStateSource = extractFunction(serverSource, "writeGameServerState");
assert.match(writeStateSource, /mergeFields:\s*Object\.keys\(serverState\)/, "Realm state writes recursively merge slot maps, which can retain departed or stale players.");

const pureContext = {
  GAME_SERVER_ID: "crown-marches",
  GAME_SERVER_NAME: "The Crown Marches",
  GAME_SERVER_CAPACITY: 50,
  GAME_SERVER_ACTIVE_STALE_MS: 180000,
  GAME_SERVER_WAITING_STALE_MS: 300000,
  Date,
  safeString: (value, max = 80) => String(value || "").trim().slice(0, max),
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  normalizePlayerName: value => String(value || "Ruler").slice(0, 18),
};
vm.createContext(pureContext);
vm.runInContext([
  extractFunction(serverSource, "cleanGameServerEntry"),
  extractFunction(serverSource, "normalizeGameServerEntries"),
  extractFunction(serverSource, "createGameServerState"),
  extractFunction(serverSource, "applyGameServerMemberHeartbeats"),
  extractFunction(serverSource, "getOrderedGameServerWaiters"),
  extractFunction(serverSource, "promoteGameServerWaiters"),
].join("\n"), pureContext, { filename: serverPath });

const nowMs = 2_000_000;
const activeSlots = Object.fromEntries(Array.from({ length: 50 }, (_, index) => {
  const uid = `active-${index}`;
  return [uid, { uid, sessionId: `session-${index}`, displayName: `Ruler ${index}`, lastSeenAtMs: nowMs - 1000 }];
}));
const waitingQueue = {
  second: { uid: "second", sessionId: "session-second", displayName: "Second", queuedAtMs: nowMs - 4000, lastSeenAtMs: nowMs - 1000, ticket: 2 },
  first: { uid: "first", sessionId: "session-first", displayName: "First", queuedAtMs: nowMs - 5000, lastSeenAtMs: nowMs - 1000, ticket: 1 },
};
const fullState = pureContext.createGameServerState({ activeSlots, waitingQueue, nextTicket: 3 }, nowMs);
assert.equal(Object.keys(fullState.activeSlots).length, 50);
assert.equal(pureContext.promoteGameServerWaiters(fullState, nowMs).length, 0, "A full realm admitted a 51st player.");
delete fullState.activeSlots["active-0"];
const promoted = pureContext.promoteGameServerWaiters(fullState, nowMs);
assert.deepEqual(Array.from(promoted, entry => entry.uid), ["first"], "The waiting list is not first-in, first-out.");
assert.equal(Object.keys(fullState.activeSlots).length, 50);
assert.ok(fullState.waitingQueue.second, "The second waiting player should remain queued.");

const staleState = pureContext.createGameServerState({
  activeSlots: {
    stale: { uid: "stale", sessionId: "old-session", lastSeenAtMs: nowMs - 181000 },
  },
  waitingQueue: {
    ready: { uid: "ready", sessionId: "ready-session", displayName: "Ready", queuedAtMs: nowMs - 2000, lastSeenAtMs: nowMs - 1000, ticket: 1 },
  },
}, nowMs);
assert.equal(staleState.activeSlots.stale, undefined, "Stale active slots are not removed.");
assert.deepEqual(Array.from(pureContext.promoteGameServerWaiters(staleState, nowMs), entry => entry.uid), ["ready"]);

const mergedHeartbeatState = pureContext.applyGameServerMemberHeartbeats({
  activeSlots: {
    healthy: { uid: "healthy", sessionId: "healthy-session", lastSeenAtMs: nowMs - 181000 },
    replaced: { uid: "replaced", sessionId: "new-session", lastSeenAtMs: nowMs - 181000 },
  },
}, [
  { uid: "healthy", sessionId: "healthy-session", lastSeenAtMs: nowMs - 1000 },
  { uid: "replaced", sessionId: "old-session", lastSeenAtMs: nowMs - 1000 },
]);
const heartbeatState = pureContext.createGameServerState(mergedHeartbeatState, nowMs);
assert.ok(heartbeatState.activeSlots.healthy, "A fresh sharded heartbeat did not preserve an active slot.");
assert.equal(heartbeatState.activeSlots.replaced, undefined, "A replaced session refreshed the current slot.");

const heartbeatSource = extractFunction(serverSource, "heartbeatGameServerForPlayer");
assert.match(heartbeatSource, /writeGameServerMember\(transaction,\s*entry,\s*status,\s*nowMs\)/, "Heartbeats do not update per-player member documents.");
assert.doesNotMatch(heartbeatSource, /writeGameServerState/, "Heartbeats still rewrite the shared realm-capacity document.");
const joinSource = extractFunction(serverSource, "joinGameServerForPlayer");
assert.match(joinSource, /serializeGameServerAdmission\(\(\)\s*=>\s*withGameServerAdmissionLease\(\(\)\s*=>\s*db\.runTransaction/, "Concurrent realm joins bypass the cross-worker admission serializer.");
const maintainSource = extractFunction(serverSource, "maintainGameServer");
assert.match(maintainSource, /serverRef\.collection\("members"\)[\s\S]*?applyGameServerMemberHeartbeats/, "Scheduled cleanup does not consume sharded heartbeats.");
assert.match(maintainSource, /where\("lastSeenAtMs",\s*"<",\s*staleBeforeMs\)[\s\S]*?limit\(100\)[\s\S]*?staleMemberSnap\.docs\.forEach\(doc => transaction\.delete\(doc\.ref\)\)/, "Scheduled cleanup does not remove bounded batches of stale heartbeat shards.");
requireMatch(serverSource, /shardedGameServerHeartbeats:\s*true/, "Realm capabilities do not advertise sharded heartbeats.");

requireMatch(firebaseClientSource, /joinGameServer[\s\S]*?heartbeatGameServer[\s\S]*?leaveGameServer[\s\S]*?subscribeGameServerMembership/, "Firebase client is missing realm APIs.");
requireMatch(clientSource, /async function joinSelectedGameServer\(\) \{\s*if \(gameServerJoinInFlight\) return false;[\s\S]*?await api\.joinGameServer\(GAME_SERVER_ID\)/, "Entering the kingdom must revalidate the realm slot with the server.");
requireMatch(clientSource, /const realmIsReady = await joinSelectedGameServer\(\);[\s\S]*?state = createOnlineEntryState/, "Kingdom loading can start before realm admission.");
requireMatch(clientSource, /membership\?\.status === "active"[\s\S]*?gameServerAutoEnter[\s\S]*?startFromInput/, "Waiting players are not resumed after promotion.");
requireMatch(clientSource, /await leaveSelectedGameServer\(\);[\s\S]*?await api\.signOut\(\)/, "Sign-out does not release the realm slot first.");
requireMatch(rulesSource, /match \/serverMembership\/\{membershipId\}[\s\S]*?allow read: if ownsPlayerDoc\(uid\)\s*&&\s*isCurrentGeneration\(resource\.data\);[\s\S]*?allow create, update, delete: if false;/, "Realm membership is not private, generation-scoped, and server-owned.");
requireMatch(rulesSource, /match \/gameServers\/\{serverId\}[\s\S]*?allow read, create, update, delete: if false;/, "Realm capacity state must remain private and server-owned.");
requireMatch(rulesSource, /match \/gameServers\/\{serverId\}[\s\S]*?match \/members\/\{uid\}[\s\S]*?allow read, create, update, delete: if false;/, "Sharded realm heartbeats must remain server-only.");
requireMatch(rulesSource, /match \/gameServers\/\{serverId\}[\s\S]*?match \/coordination\/\{documentId\}[\s\S]*?allow read, create, update, delete: if false;/, "Realm admission leases must remain server-only.");
requireMatch(stylesSource, /\.server-realm-card[\s\S]*?\.server-queue-status/, "Realm list styling is missing.");

const realmMarkupMatch = htmlSource.match(/<section id="serverRealmList"[\s\S]*?<\/section>/);
assert.ok(realmMarkupMatch, "The signed-in main menu is missing its realm list.");
assert.match(realmMarkupMatch[0], /The Crown Marches/);
assert.doesNotMatch(realmMarkupMatch[0], /\b(?:players?|online)\b|\d+\s*\/\s*50/i, "The realm tile exposes a live player count.");

console.log("Validated The Crown Marches 50-player admission cap, fair waiting list, stale cleanup, private membership, and menu flow.");
