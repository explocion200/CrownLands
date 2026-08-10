const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "functions", "index.js");
const serverSource = fs.readFileSync(serverPath, "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const gameRulesSource = fs.readFileSync(path.join(root, "game-rules.html"), "utf8");
const indexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));
const realmConfig = JSON.parse(fs.readFileSync(path.join(root, "functions", "release-config.json"), "utf8"));

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

requireMatch(serverSource, /INACTIVITY_POLICY_VERSION\s*=\s*1/, "The inactivity lifecycle schema is not versioned.");
assert.ok(["audit", "enforce"].includes(realmConfig.inactivityPolicyMode), "The inactivity rollout mode is not explicit.");
requireMatch(serverSource, /INACTIVITY_SURRENDER_MS\s*=\s*15\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "The surrender threshold is not exactly 15 elapsed days.");
requireMatch(serverSource, /INACTIVITY_REMOVAL_MS\s*=\s*20\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "The world-slot reset threshold is not exactly 20 elapsed days.");
requireMatch(
  serverSource,
  /loadInactiveMembershipCandidates[\s\S]*?collectionGroup\("serverMembership"\)[\s\S]*?where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)[\s\S]*?where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)[\s\S]*?where\("status",\s*"in",\s*\["active",\s*"left",\s*"waiting"\]\)[\s\S]*?where\("status",\s*"==",\s*"inactive"\)/,
  "Inactive-player selection is not server-time and current-world scoped."
);
requireMatch(
  serverSource,
  /exports\.maintainInactivePlayers\s*=\s*onSchedule[\s\S]*?every 1 hours/,
  "Inactive-player lifecycle maintenance is not scheduled hourly."
);
requireMatch(
  serverSource,
  /joinGameServerForPlayer[\s\S]*?isInactivityLifecycleBlockingPlayer[\s\S]*?HttpsError\("unavailable"/,
  "Realm admission does not wait for an active inactivity cleanup."
);
requireMatch(
  serverSource,
  /prepareEconomyCollection[\s\S]*?allowInactivityMaintenance[\s\S]*?isInactivityLifecycleBlockingPlayer[\s\S]*?HttpsError/,
  "Gameplay economy writes are not blocked by the inactivity lifecycle lock."
);
requireMatch(
  serverSource,
  /releaseInactiveCity[\s\S]*?transaction\.set\(homeRef[\s\S]*?transaction\.set\(cityDoc\.ref[\s\S]*?writeOwnershipChangeEvent/,
  "City troop consolidation and ownership release are not performed in one transaction."
);
requireMatch(
  serverSource,
  /cancelInactiveArmy[\s\S]*?transaction\.set\(homeRef[\s\S]*?status:\s*"canceled"[\s\S]*?troops:\s*0/,
  "Active marches are not atomically canceled after their troops are consolidated."
);
requireMatch(
  serverSource,
  /returnInactiveReinforcement[\s\S]*?alliedReinforcementTroops:[\s\S]*?REINFORCEMENT_STATUS_RETURNED/,
  "Owned allied reinforcements are not removed from their target during consolidation."
);
requireMatch(
  serverSource,
  /completeInactivePlayerRemoval[\s\S]*?removeInactivePlayerFromClan[\s\S]*?purgeInactivePlayerArmyRecords[\s\S]*?clearInactivePlayerWorldDocuments[\s\S]*?replaceInactivePlayerProfile/,
  "World-slot removal does not clear clan, world documents, and profile state in order."
);
requireMatch(
  serverSource,
  /replaceInactivePlayerProfile[\s\S]*?displayName:[\s\S]*?email:[\s\S]*?photoURL:[\s\S]*?playerName:[\s\S]*?flag:/,
  "World-slot reset does not preserve the durable identity whitelist."
);
assert.doesNotMatch(serverSource, /admin\.auth\(\)\.deleteUser|deleteUser\(/, "The inactivity policy must not delete Firebase authentication accounts.");
requireMatch(
  serverSource,
  /getInactiveClanSuccessor[\s\S]*?role === "officer"[\s\S]*?joinedAtMs/,
  "Inactive clan leadership does not prioritize the oldest active officer."
);
requireMatch(
  serverSource,
  /getInactivityNotice[\s\S]*?territory-surrendered[\s\S]*?world-slot-reset/,
  "Realm admission does not expose both inactivity notice types."
);

const dayMs = 24 * 60 * 60 * 1000;
const sandbox = {
  INACTIVITY_SURRENDER_MS: 15 * dayMs,
  INACTIVITY_REMOVAL_MS: 20 * dayMs,
  Number,
  Math,
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
};
vm.createContext(sandbox);
vm.runInContext(
  `${extractFunction(serverSource, "getInactivityTargetStage")};`
  + `${extractFunction(serverSource, "getInactiveHomeTroopPatch")};`
  + "this.getInactivityTargetStage = getInactivityTargetStage;"
  + "this.getInactiveHomeTroopPatch = getInactiveHomeTroopPatch;",
  sandbox,
  { filename: serverPath }
);

const nowMs = 100 * dayMs;
assert.equal(sandbox.getInactivityTargetStage(nowMs - 15 * dayMs + 1, nowMs), "", "Surrender started before 15 elapsed days.");
assert.equal(sandbox.getInactivityTargetStage(nowMs - 15 * dayMs, nowMs), "surrendering", "Surrender did not start at 15 elapsed days.");
assert.equal(sandbox.getInactivityTargetStage(nowMs - 20 * dayMs + 1, nowMs), "surrendering", "Removal started before 20 elapsed days.");
assert.equal(sandbox.getInactivityTargetStage(nowMs - 20 * dayMs, nowMs), "removing", "Removal did not start at 20 elapsed days.");
assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.getInactiveHomeTroopPatch({ troops: 400, troopFloat: 400 }, 600, nowMs))),
  { troops: 1000, troopFloat: 1000, productionUpdatedAtMs: nowMs },
  "Troop consolidation does not preserve the exact total."
);

assert.ok(
  indexes.indexes.some(index => (
    index.collectionGroup === "serverMembership"
    && index.queryScope === "COLLECTION_GROUP"
    && index.fields.map(field => field.fieldPath).join(",") === "resetGeneration,worldId,status,lastSeenAtMs"
  )),
  "The current-world inactivity membership index is missing."
);
requireMatch(clientSource, /normalizeGameServerMembership[\s\S]*?territory-surrendered[\s\S]*?world-slot-reset/, "The client does not accept both inactivity notice types.");
requireMatch(clientSource, /showGameServerInactivityNotice[\s\S]*?getGameServerInactivityNoticeMarkup[\s\S]*?World slot reset[\s\S]*?holdings surrendered/, "The game does not explain inactivity actions in a re-entry modal.");
requireMatch(clientSource, /showOfflineRewardsModal[\s\S]*?getGameServerInactivityNoticeMarkup\(inactivityNotice\)/, "The inactivity notice is not integrated with the existing Welcome back dialog.");
requireMatch(firebaseClientSource, /delete cleanProfile\.inactivityNotice[\s\S]*?delete cleanProfile\.worldSlotResetAtMs/, "Client saves can accidentally overwrite server inactivity fields.");
assert.doesNotMatch(
  extractFunction(rulesSource, "validPlayerProfileUpdate"),
  /'inactivityNotice'|'worldSlotResetAtMs'/,
  "Inactivity notices are not server-owned in Firestore rules."
);
requireMatch(rulesSource, /match \/realmMaintenance\/\{resetId\}\/inactivePlayers\/\{uid\}[\s\S]*?allow read, create, update, delete: if false;/, "Inactivity maintenance receipts are not explicitly server-only.");
requireMatch(gameRulesSource, /15 consecutive days[\s\S]*?20 consecutive inactive days/, "The public rules do not disclose both inactivity thresholds.");

console.log("Validated 15/20-day inactive-player surrender, troop consolidation, world-slot reset, clan succession, notices, and server ownership.");
