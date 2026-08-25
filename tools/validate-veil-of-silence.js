const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing ${name}.`);
  const bodyStart = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}.`);
}

const serverContext = {
  Date,
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
};
vm.createContext(serverContext);
vm.runInContext([
  extractFunction(serverSource, "timestampToMs"),
  extractFunction(serverSource, "getVeilOfSilenceExpiresAtMs"),
  extractFunction(serverSource, "isVeilOfSilenceActive"),
  extractFunction(serverSource, "doesVeilOfSilenceBlock"),
  "this.getVeilOfSilenceExpiresAtMs = getVeilOfSilenceExpiresAtMs;",
  "this.isVeilOfSilenceActive = isVeilOfSilenceActive;",
  "this.doesVeilOfSilenceBlock = doesVeilOfSilenceBlock;",
].join("\n"), serverContext);

const nowMs = 1_000_000;
const activeProfile = { itemEffects: { veilOfSilenceExpiresAtMs: nowMs + 5_000 } };
assert.equal(serverContext.getVeilOfSilenceExpiresAtMs(activeProfile), nowMs + 5_000);
assert.equal(serverContext.isVeilOfSilenceActive(activeProfile, nowMs), true);
assert.equal(serverContext.isVeilOfSilenceActive(activeProfile, nowMs + 5_000), false);
assert.equal(serverContext.isVeilOfSilenceActive({ itemEffects: { antiScoutExpiresAtMs: nowMs + 1 } }, nowMs), true);

assert.equal(serverContext.doesVeilOfSilenceBlock("scout", "city"), true);
[
  ["attack", "city"],
  ["transfer", "city"],
  ["attack", "camp"],
  ["transfer", "camp"],
  ["scout", "camp"],
].forEach(([kind, targetType]) => {
  assert.equal(
    serverContext.doesVeilOfSilenceBlock(kind, targetType),
    false,
    `Veil of Silence must not block ${kind} orders targeting ${targetType}.`
  );
});

const clientContext = {
  Date,
  formatDuration(seconds) {
    return `${seconds}s`;
  },
  isRewardCampTarget(target) {
    return target?.targetType === "camp";
  },
  isSameAttackOwner(target) {
    return target?.owner === "player";
  },
  normalizeTimestampMs(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  },
};
vm.createContext(clientContext);
vm.runInContext([
  "const scoutVeilBlocksByTarget = new Map();",
  "const testCities = new Map();",
  "function cityById(cityId) { return testCities.get(cityId) || null; }",
  extractFunction(clientSource, "getCachedScoutVeilExpiresAtMs"),
  extractFunction(clientSource, "getVeilOfSilenceScoutBlockReason"),
  extractFunction(clientSource, "rememberScoutVeilBlocksFromError"),
  "this.scoutVeilBlocksByTarget = scoutVeilBlocksByTarget;",
  "this.testCities = testCities;",
  "this.getVeilOfSilenceScoutBlockReason = getVeilOfSilenceScoutBlockReason;",
  "this.rememberScoutVeilBlocksFromError = rememberScoutVeilBlocksFromError;",
].join("\n"), clientContext);

const target = { id: "target_city", name: "Greywatch", owner: "enemy", ownerKind: "player", ownerUid: "defender" };
clientContext.testCities.set(target.id, target);
const veilError = {
  details: {
    reason: "veil_of_silence",
    targets: [{ cityId: target.id, ownerUid: target.ownerUid, expiresAtMs: nowMs + 5_000 }],
  },
};
assert.equal(clientContext.rememberScoutVeilBlocksFromError(veilError, null, nowMs), 1);
assert.match(clientContext.getVeilOfSilenceScoutBlockReason(target, "player", "", nowMs), /Veil of Silence/);
assert.equal(
  clientContext.getVeilOfSilenceScoutBlockReason(target, "player", "", nowMs + 5_000),
  "",
  "Scouting must become available exactly when Veil expires."
);
assert.equal(clientContext.scoutVeilBlocksByTarget.has(target.id), false, "Expired Veil cache entries must be removed.");

assert.equal(clientContext.rememberScoutVeilBlocksFromError(veilError, null, nowMs), 1);
target.ownerUid = "new_owner";
assert.equal(
  clientContext.getVeilOfSilenceScoutBlockReason(target, "player", "", nowMs),
  "",
  "A previous owner's Veil must not block scouting after ownership changes."
);
assert.equal(clientContext.scoutVeilBlocksByTarget.has(target.id), false);
assert.equal(
  clientContext.getVeilOfSilenceScoutBlockReason({ ...target, targetType: "camp" }, "player", "", nowMs),
  "",
  "Veil must not block reward camp scouting."
);

const directOrderSource = serverSource.slice(
  serverSource.indexOf("exports.sendArmyOrder"),
  serverSource.indexOf("async function resolveArmyOrderById")
);
const directVeilCheckIndex = directOrderSource.indexOf("const veilOfSilenceExpiresAtMs");
assert.ok(directVeilCheckIndex > 0, "Direct army orders must check Veil.");
assert.ok(
  directVeilCheckIndex < directOrderSource.indexOf("const movement ="),
  "Direct scouting must be rejected before an army movement is created."
);
assert.ok(
  directVeilCheckIndex < directOrderSource.indexOf("writePreparedEconomy("),
  "Direct scouting must be rejected before troop or active-army state is written."
);
requireMatch(
  directOrderSource,
  /reason:\s*"veil_of_silence"[\s\S]*?targetCityIds:[\s\S]*?targets:/,
  "Direct Veil rejection must include target and expiration details for the client."
);

const nearbyOrderSource = serverSource.slice(
  serverSource.indexOf("exports.sendNearbyScouts"),
  serverSource.indexOf("exports.sendRegroupOrders")
);
const bulkVeilCheckIndex = nearbyOrderSource.indexOf("const veiledTargets");
assert.ok(bulkVeilCheckIndex > 0, "Scout Nearby must check all selected targets for Veil.");
assert.ok(
  bulkVeilCheckIndex < nearbyOrderSource.indexOf("const armies ="),
  "Scout Nearby must reject Veil before army movements are created."
);
assert.ok(
  bulkVeilCheckIndex < nearbyOrderSource.indexOf("chargeBulkOrderCost("),
  "Scout Nearby must reject Veil before gold or troops are charged."
);

const restoreSource = extractFunction(clientSource, "restoreRejectedArmyOrderSelection");
assert.match(restoreSource, /if \(mission\.kind === "scout"\) return;/);
assert.doesNotMatch(restoreSource, /scoutTarget\(/, "Rejected scouts must never be submitted again automatically.");

const scoutTargetSource = extractFunction(clientSource, "scoutTarget");
assert.ok(
  scoutTargetSource.indexOf("getVeilOfSilenceScoutBlockReason") < scoutTargetSource.indexOf("pendingDirectScoutTargets.add"),
  "Known Veil blocks must stop direct scouting before client pending state is created."
);
const launchScoutSource = extractFunction(clientSource, "launchScoutMission");
assert.ok(
  launchScoutSource.indexOf("getVeilOfSilenceScoutBlockReason") < launchScoutSource.indexOf("const mission ="),
  "Known Veil blocks must stop direct scouting before a local mission is created."
);
requireMatch(
  extractFunction(clientSource, "isNearbyScoutCandidate"),
  /!getVeilOfSilenceScoutBlockReason\(city, "player"\)/,
  "Scout Nearby must exclude targets with a known active Veil."
);
requireMatch(
  extractFunction(clientSource, "getCityRenderSignature"),
  /getCachedScoutVeilExpiresAtMs\(city\)/,
  "Veil expiration must invalidate the city action wheel so re-scouting becomes available."
);

requireMatch(
  serverSource,
  /doesVeilOfSilenceBlock\(army\.kind,\s*army\.targetType\)[\s\S]*?Veil of Silence blocked the scout/,
  "Arrival resolution must still block a scout when Veil was activated after launch."
);
const armyKindsMatch = serverSource.match(/const ARMY_ORDER_KINDS = Object\.freeze\((\[[^\]]+\])\)/);
if (!armyKindsMatch) throw new Error("Canonical army order kinds are missing.");
const armyKinds = JSON.parse(armyKindsMatch[1]);
["attack", "transfer", "reinforce", "rally_join", "scout"].forEach(kind => {
  if (!armyKinds.includes(kind)) throw new Error(`Army payload normalization does not preserve ${kind} orders.`);
});
requireMatch(
  serverSource,
  /const kind = ARMY_ORDER_KINDS\.includes\(raw\.kind\) \? raw\.kind : "attack"/,
  "Army payload normalization must use the canonical order-kind list."
);
if (/\brenderMap\(\)/.test(clientSource)) {
  throw new Error("Client still calls the nonexistent renderMap function.");
}

console.log("Validated Veil launch blocking, rejection side effects, expiration, and re-scouting.");
