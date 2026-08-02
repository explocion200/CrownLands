const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

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

const strongholdIds = new Set([
  "west_gold_stronghold",
  "north_training_stronghold",
  "east_speed_stronghold",
  "south_defense_stronghold",
  "center_crown_citadel",
]);
const sandbox = {
  CITADEL_ASSAULT_EVENT_KIND: "citadel_npc_assault",
  RECALL_HORN_MINIMUM_RETURN_MS: 1000,
  HttpsError: class HttpsError extends Error {},
  Date,
  clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  },
  isCurrentWorldArmy(army) {
    return army.worldId === "world" && army.resetGeneration === "reset";
  },
  isStronghold(city) {
    return Boolean(city?.kind === "stronghold" || city?.strongholdType || strongholdIds.has(city?.id));
  },
  normalizeRegionId(value) {
    return String(value || "").trim();
  },
  normalizeRegionIds(values = []) {
    return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
  },
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  safeString(value, maxLength = 1000) {
    return String(value || "").slice(0, maxLength);
  },
  timestampToMs(value) {
    return Math.max(0, Number(value) || 0);
  },
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(serverSource, "getArmyRouteProgressAtMs"),
    extractFunction(serverSource, "createMidRouteReturnMovement"),
    extractFunction(serverSource, "getPeaceShieldReturnDirection"),
    "this.getArmyRouteProgressAtMs = getArmyRouteProgressAtMs;",
    "this.createMidRouteReturnMovement = createMidRouteReturnMovement;",
    "this.getPeaceShieldReturnDirection = getPeaceShieldReturnDirection;",
  ].join("\n"),
  sandbox
);

const nowMs = 1_700_000_000_000;
const baseArmy = {
  id: "army-1",
  worldId: "world",
  resetGeneration: "reset",
  ownerKind: "player",
  ownerUid: "shield-owner",
  targetOwnerUid: "rival",
  kind: "attack",
  launchKind: "attack",
  targetType: "city",
  fromId: "regular-source",
  toId: "regular-target",
  sourceRegionId: "west",
  targetRegionId: "east",
  routeRegionIds: ["west", "east"],
  troops: 500,
  total: 120,
  launchedAtMs: nowMs - 40_000,
  arrivesAtMs: nowMs + 80_000,
  status: "active",
};

assert.equal(sandbox.getPeaceShieldReturnDirection(baseArmy, "shield-owner", nowMs), "outgoing");
assert.equal(
  sandbox.getPeaceShieldReturnDirection({ ...baseArmy, ownerUid: "rival", targetOwnerUid: "shield-owner" }, "shield-owner", nowMs),
  "incoming"
);
[
  { kind: "scout" },
  { kind: "transfer" },
  { kind: "reinforce" },
  { targetOwnerUid: "" },
  { targetType: "camp" },
  { fromId: "west_gold_stronghold" },
  { toId: "center_crown_citadel" },
  { rallyAttack: true },
  { rallyReturn: true },
  { campReturn: true },
  { reinforcementReturn: true },
  { relinquishTransfer: true },
  { ownerKind: "npc", ownerUid: "" },
  { status: "resolved" },
  { returning: true },
  { recalledAtMs: nowMs - 1 },
  { arrivesAtMs: nowMs },
].forEach(patch => {
  assert.equal(
    sandbox.getPeaceShieldReturnDirection({ ...baseArmy, ...patch }, "shield-owner", nowMs),
    "",
    `Excluded march was accepted: ${JSON.stringify(patch)}`
  );
});

const normalReturn = sandbox.createMidRouteReturnMovement(baseArmy, nowMs, "peace_shield");
assert.equal(normalReturn.returning, true);
assert.equal(normalReturn.returnReason, "peace_shield");
assert.equal(normalReturn.returnStartProgress, 1 / 3);
assert.equal(normalReturn.arrivesAtMs, nowMs + 40_000);
assert.equal(normalReturn.returnDestinationId, baseArmy.fromId);
assert.equal(normalReturn.targetOwnerUid, "");
assert.equal(normalReturn.troops, baseArmy.troops, "A reversal must not teleport troops home.");

const swiftArmy = {
  ...baseArmy,
  id: "army-swift",
  swiftMarchUsedAtMs: nowMs - 20_000,
  swiftMarchProgressAtUse: 1 / 6,
  swiftMarchOriginalArrivesAtMs: nowMs + 80_000,
  arrivesAtMs: nowMs + 30_000,
};
const swiftReturn = sandbox.createMidRouteReturnMovement(swiftArmy, nowMs, "peace_shield");
assert.ok(Math.abs(swiftReturn.returnStartProgress - 0.5) < 1e-9, "Swift March route progress was not preserved.");
assert.equal(swiftReturn.arrivesAtMs, nowMs + 60_000, "Swift March must return on its original timing basis.");

const localCities = [
  { id: "local-main", name: "Local Main", owner: "player", ownerUid: "shield-owner", troops: 100, troopFloat: 100 },
  { id: "local-source", name: "Local Source", owner: "player", ownerUid: "shield-owner", troops: 50, troopFloat: 50 },
  { id: "local-rival", name: "Local Rival", owner: "enemy", ownerKind: "player", ownerUid: "rival", troops: 100 },
];
const localSandbox = {
  CITADEL_ASSAULT_EVENT_KIND: "citadel_npc_assault",
  PEACE_SHIELD_MINIMUM_RETURN_SECONDS: 1,
  state: { cities: localCities },
  addBattleReport() {
    throw new Error("A local Peace Shield return must not create a battle report.");
  },
  addLog() {},
  clamp: sandbox.clamp,
  cityById(id) {
    return localCities.find(city => city.id === id) || null;
  },
  formatNumber(value) {
    return String(value);
  },
  getArmyTargetById(id) {
    return localCities.find(city => city.id === id) || null;
  },
  getCurrentOnlineUid() {
    return "shield-owner";
  },
  getMainRewardCity() {
    return localCities[0];
  },
  isRewardCampTarget(target) {
    return target?.targetType === "camp";
  },
  isSameAttackOwner(target, owner, ownerUid) {
    return Boolean(ownerUid && target?.ownerUid === ownerUid) || (!ownerUid && target?.owner === owner);
  },
  isStronghold: sandbox.isStronghold,
  markOwnedCityChanged() {},
  normalizeRegionId: sandbox.normalizeRegionId,
  normalizeTimestampMs(value) {
    return Math.max(0, Number(value) || 0);
  },
  showToast() {},
  syncCityStateToOnline() {},
  syncOwnedCitiesToOnline() {},
  syncSharedCityState() {},
};
vm.createContext(localSandbox);
vm.runInContext(
  [
    extractFunction(clientSource, "getArmyTravelProgress"),
    extractFunction(clientSource, "getPeaceShieldRivalMarchDirection"),
    extractFunction(clientSource, "createLocalMidRouteReturn"),
    extractFunction(clientSource, "cityBelongsToMarchOwner"),
    extractFunction(clientSource, "getLocalMarchReturnDestination"),
    extractFunction(clientSource, "resolveLocalReturningArmy"),
    "this.getPeaceShieldRivalMarchDirection = getPeaceShieldRivalMarchDirection;",
    "this.createLocalMidRouteReturn = createLocalMidRouteReturn;",
    "this.resolveLocalReturningArmy = resolveLocalReturningArmy;",
  ].join("\n"),
  localSandbox
);
const localMarch = {
  id: "local-march",
  owner: "player",
  ownerKind: "player",
  ownerUid: "shield-owner",
  targetOwnerUid: "rival",
  kind: "attack",
  targetType: "city",
  fromId: "local-source",
  toId: "local-rival",
  sourceRegionId: "west",
  troops: 75,
  total: 120,
  remaining: 90,
  launchedAtMs: nowMs - 30_000,
  arrivesAtMs: nowMs + 90_000,
  status: "active",
};
assert.equal(localSandbox.getPeaceShieldRivalMarchDirection(localMarch, nowMs), "outgoing");
localSandbox.createLocalMidRouteReturn(localMarch, nowMs, "peace_shield");
assert.equal(localMarch.returning, true);
assert.equal(localMarch.returnStartProgress, 0.25);
assert.equal(localMarch.arrivesAtMs, nowMs + 30_000);
localCities[1].owner = "enemy";
localCities[1].ownerUid = "rival";
assert.equal(localSandbox.resolveLocalReturningArmy(localMarch), 75);
assert.equal(localCities[0].troops, 175, "The local source-loss fallback did not credit returned troops.");

const activationSource = serverSource.slice(
  serverSource.indexOf("exports.activateInventoryItem"),
  serverSource.indexOf("exports.useSwiftMarchOrder")
);
assert.match(activationSource, /transaction\.get\(activeArmiesTargetingPlayerQuery\(uid\)\)/);
assert.match(activationSource, /economy\.activeArmies\.forEach/);
assert.match(activationSource, /createMidRouteReturnMovement\(army, nowMs, PEACE_SHIELD_RETURN_REASON\)/);
assert.match(
  activationSource,
  /writeArmyMovementCopies\(transaction, movement, \{\s*previousTargetOwnerUid: army\.targetOwnerUid/,
  "Shield activation must update canonical, regional, and incoming-view records in its transaction."
);
assert.match(activationSource, /shieldReturnSummary\.outgoing|shieldReturnSummary\[direction\]/);
assert.match(activationSource, /shieldReturnSummary\.total/);
assert.doesNotMatch(activationSource, /writeReport|battleReports/, "Shield reversal must not create battle reports.");
assert.match(serverSource, /const movement = createMidRouteReturnMovement\(army, nowMs, RECALL_HORN_ITEM_ID\)/);
assert.match(
  serverSource,
  /if \(isCityShielded\(target, uid, nowMs\)\) \{\s*throw new HttpsError\("failed-precondition", "That city is protected by a Royal Peace Shield\."\);/,
  "New attacks against shielded regular cities must remain blocked."
);
assert.match(
  serverSource,
  /shouldDeactivatePeaceShieldForAttack\(target, order\.targetType, uid, resolvedKind\)[\s\S]*?itemEffects\.shieldExpiresAtMs = 0/,
  "Launching a new PvP attack must continue to remove the attacker's Peace Shield."
);

assert.match(clientSource, /function reverseLocalPeaceShieldMarches/);
assert.match(clientSource, /createLocalMidRouteReturn\(march, nowMs, PEACE_SHIELD_RETURN_REASON\)/);
assert.match(clientSource, /if \(attack\?\.returning\) \{\s*resolveLocalReturningArmy\(attack\);/);
assert.match(clientSource, /function getLocalMarchReturnDestination[\s\S]*?getMainRewardCity\(\)/);
assert.match(clientSource, /result\?\.shieldReturnSummary/);
assert.match(clientSource, /outgoing and \$\{formatNumber\(normalized\.incoming\)\} incoming rival/);
assert.match(clientSource, /turns back active rival attacks traveling to or from them/);

console.log("Peace Shield march-return validation passed.");
