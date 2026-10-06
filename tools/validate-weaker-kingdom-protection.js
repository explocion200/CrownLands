const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const stylesSource = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`;
const firestoreRulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const realmConfig = JSON.parse(
  fs.readFileSync(path.join(root, "functions", "release-config.json"), "utf8")
);
const economyConfig = JSON.parse(
  fs.readFileSync(path.join(root, "functions", "economy-config.json"), "utf8")
);

function readFunction(text, name) {
  const start = text.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}.`);
  const bodyStart = text.indexOf(") {", start) + 2;
  if (bodyStart < 2) throw new Error(`Could not find the body for ${name}.`);
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function readConstant(text, name) {
  const match = text.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!match) throw new Error(`Missing ${name}.`);
  return match[1];
}

const numericConstants = [
  "ATTACK_PROTECTION_VERSION",
  "ATTACK_PROTECTION_ASSAULT_MIN_RATIO",
  "ATTACK_PROTECTION_RAID_MIN_RATIO",
  "ATTACK_PROTECTION_DEFENDER_FIRST_XP_MULTIPLIER",
  "ATTACK_PROTECTION_DEFENDER_REPEAT_XP_MULTIPLIER",
  "PROTECTED_ASSAULT_BREACH_VERSION",
  "DEMO_ATTACK_MIN_POWER_RATIO",
  "DEMO_ATTACK_DEFENDER_XP_MULTIPLIER",
  "GLOBAL_PLAYER_STATS_VERSION",
];
const sandbox = { console };
numericConstants.forEach(name => {
  sandbox[name] = Number(readConstant(source, name));
});
sandbox.ATTACK_PROTECTION_POWER_ANCHORS = vm.runInNewContext(readConstant(source, "ATTACK_PROTECTION_POWER_ANCHORS"));
sandbox.BASE_TROOP_ATTACK_POWER = Number(economyConfig.troopCombat.baseAttackPowerPerTroop);
sandbox.ATTACK_PROTECTION_DEFENDER_XP_POLICY = vm.runInNewContext(
  readConstant(source, "ATTACK_PROTECTION_DEFENDER_XP_POLICY")
);
sandbox.RESET_GENERATION = String(realmConfig.resetGeneration || "fresh-2026-07-26-server-reset");
sandbox.ONLINE_WORLD_ID = String(realmConfig.worldId || `main-${sandbox.RESET_GENERATION}`);
sandbox.DEMO_ATTACK_TIERS = vm.runInNewContext(
  readConstant(source, "DEMO_ATTACK_TIERS").replace(
    /DEMO_ATTACK_MIN_POWER_RATIO/g,
    String(sandbox.DEMO_ATTACK_MIN_POWER_RATIO)
  )
);
Object.assign(sandbox, {
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  safeString(value, maxLength = 128) {
    return String(value || "").slice(0, maxLength);
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  },
  clampInt(value, min, max) {
    return Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
  },
  timestampToMs(value) {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    return Math.max(0, Number(value) || 0);
  },
  getCityPowerFloor(city = {}) {
    return Math.max(0, Math.floor(Number(city.powerFloor) || 0));
  },
  getLegacyGlobalStatsKingPower() {
    return 0;
  },
  getOwnerUid(target = {}) {
    return String(target.ownerUid || "");
  },
  isStronghold(target = {}) {
    return target.kind === "stronghold" || Boolean(target.strongholdType);
  },
  usesSiegeCombat() {
    return false;
  },
  getCityStats(target = {}) {
    const totalDefense = Math.max(1, Number(target.totalDefense) || 1000);
    return { totalDefense, cityWalls: totalDefense };
  },
  skillMultiplier() {
    return 1;
  },
});

vm.createContext(sandbox);
vm.runInContext([
  readFunction(source, "getPowerValue"),
  readFunction(source, "getPlayerPowerSnapshot"),
  readFunction(source, "getDemoAttackTier"),
  readFunction(source, "normalizeDemoAttackSnapshot"),
  readFunction(source, "roundDownToTwoSignificantDigits"),
  readFunction(source, "roundUpToTwoSignificantDigits"),
  readFunction(source, "getAttackProtectionThresholds"),
  readFunction(source, "getAttackProtectionMode"),
  readFunction(source, "getAttackProtectionBreakEvenScale"),
  readFunction(source, "normalizeAttackProtectionSnapshot"),
  readFunction(source, "getAttackPower"),
  readFunction(source, "createServerAttackProtectionSnapshot"),
  readFunction(source, "createAttackProtectionPreview"),
  readFunction(source, "getAttackProtectionQuoteSignature"),
  readFunction(source, "getCityOwnershipStartedAtMs"),
  readFunction(source, "isCurrentProtectedAssaultBreach"),
  readFunction(source, "isCurrentProtectedDefenseXpClaim"),
  readFunction(source, "calculateCombatResult"),
].join("\n\n"), sandbox);

if (sandbox.GLOBAL_PLAYER_STATS_VERSION !== 13 || sandbox.ATTACK_PROTECTION_VERSION !== 2) {
  throw new Error("Protection is not using King Power v13 and attack-protection schema v2.");
}
if (sandbox.ATTACK_PROTECTION_ASSAULT_MIN_RATIO !== 2
  || sandbox.ATTACK_PROTECTION_RAID_MIN_RATIO !== 2.5) {
  throw new Error("The legacy snapshot minimum ratios changed unexpectedly.");
}

const validGlobalPower = sandbox.getPlayerPowerSnapshot({
  profile: { kingPowerVersion: 6, kingPower: 4_000_000, kingPowerUpdatedAtMs: 5000 },
  globalStats: { version: 13, kingPower: 900_000, updatedAtMs: 4000 },
  city: { powerFloor: 300_000 },
});
if (validGlobalPower !== 900_000) {
  throw new Error("A legacy profile snapshot overrides canonical v13 global stats.");
}

const target = { ownerUid: "defender", totalDefense: 1000, troops: 1000 };
assert.equal(sandbox.getPlayerPowerSnapshot({ globalStats: { version: 13, kingPower: 0 },
  profile: { kingPowerVersion: 13, kingPower: 1000000 }, city: { powerFloor: 5000 } }), 0);
assert.equal(sandbox.getPlayerPowerSnapshot({ globalStats: { version: 13 },
  profile: { kingPowerVersion: 13, kingPower: 1000 } }), 1000,
  "Missing power must not be mistaken for a confirmed zero.");
function protectionAt(ratio, overrides = {}) {
  return sandbox.createServerAttackProtectionSnapshot({
    sourceTroops: 1_000_000,
    target,
    requestedTroops: 1_000_000,
    attackerKingPower: Math.round(1_000_000_000 * ratio),
    defenderKingPower: 1_000_000_000,
    attackerUid: "attacker",
    ...overrides,
  });
}

if (protectionAt(1.99)) throw new Error("A 1.99× attack is incorrectly protected.");
const atTwo = protectionAt(2);
if (atTwo?.mode !== "assault" || atTwo.captureAllowed || !atTwo.breachRequired
  || atTwo.assaultStage !== "breach" || atTwo.maxTroops !== 810) {
  throw new Error("The first 2× assault is not capped at the rounded capture-safe breach force.");
}
const atTwoFortyNine = protectionAt(2.49);
if (atTwoFortyNine?.mode !== "assault" || atTwoFortyNine.captureAllowed
  || atTwoFortyNine.assaultStage !== "breach" || atTwoFortyNine.maxTroops !== 810) {
  throw new Error("The first 2.49× assault can overcommit troops or capture immediately.");
}
const atTwoCapture = protectionAt(2, { assaultStage: "capture" });
if (atTwoCapture?.mode !== "assault" || !atTwoCapture.captureAllowed
  || atTwoCapture.breachRequired || atTwoCapture.maxTroops !== 1000) {
  throw new Error("A breached city does not receive the capture-capable 2× follow-up allowance.");
}
const atTwoFortyNineCapture = protectionAt(2.49, { assaultStage: "capture" });
if (!atTwoFortyNineCapture?.captureAllowed || atTwoFortyNineCapture.maxTroops !== 840) {
  throw new Error("The 2.49× follow-up cap is not capture-safe.");
}
const atTwoFive = protectionAt(2.5);
if (atTwoFive?.mode !== "raid" || atTwoFive.captureAllowed
  || atTwoFive.maxTroops !== 400 || atTwoFive.maxDefenderLossPercent !== 10) {
  throw new Error("Exactly 2.5× must become a non-capturing raid.");
}
const atFive = protectionAt(5);
if (atFive?.mode !== "raid" || atFive.maxTroops !== 200) {
  throw new Error("The 5× raid cap is not 25% of break-even rounded down to two significant digits.");
}
if (protectionAt(8)?.maxTroops !== 200) {
  throw new Error("Raid caps continue shrinking beyond the 5× floor.");
}

if (protectionAt(3, { attackerUid: "defender" })) {
  throw new Error("Owned-city transfers are incorrectly protected.");
}
if (protectionAt(3, { targetType: "camp" })) {
  throw new Error("Camp attacks are incorrectly protected.");
}
if (protectionAt(3, { target: { ...target, kind: "stronghold" } })) {
  throw new Error("Stronghold attacks are incorrectly protected.");
}

const normalFailure = sandbox.calculateCombatResult(
  1,
  { troops: 1000, totalDefense: 10_000 },
  null,
  null
);
if (normalFailure.defenderLosses !== 0) {
  throw new Error("A negligible normal attack still removes an automatic defender-loss floor.");
}
const pressuredFailure = sandbox.calculateCombatResult(
  500,
  { troops: 1000, totalDefense: 1000 },
  null,
  null
);
if (pressuredFailure.success || pressuredFailure.defenderLosses !== 512) {
  throw new Error("Normal failed attacks do not use 82% × pressure capped at 82%.");
}
const firstAssaultWin = sandbox.calculateCombatResult(
  atTwo.maxTroops,
  target,
  null,
  null,
  { attackProtection: atTwo }
);
if (firstAssaultWin.success || !firstAssaultWin.breachCompleted || !firstAssaultWin.battleWon
  || firstAssaultWin.survivors < 1 || firstAssaultWin.defendersLeft !== 1) {
  throw new Error("The first protected assault can capture or cannot complete a wall breach.");
}
const followUpAssaultWin = sandbox.calculateCombatResult(
  1000,
  target,
  null,
  null,
  { attackProtection: atTwoCapture }
);
if (!followUpAssaultWin.success || followUpAssaultWin.breachCompleted || followUpAssaultWin.survivors < 1) {
  throw new Error("A capture-stage protected assault cannot take a breached city.");
}
const raid = sandbox.calculateCombatResult(
  10_000,
  target,
  null,
  null,
  { attackProtection: atTwoFive }
);
if (raid.success || !raid.raidCompleted || raid.survivors !== 0 || raid.attackerLosses !== 10_000
  || raid.defenderLosses !== 100 || raid.defendersLeft !== 900) {
  throw new Error("Protected raids can capture, exceed 10% damage, or return attacking troops.");
}
const convertedReinforcementWin = sandbox.calculateCombatResult(
  10_000,
  target,
  null,
  null,
  { attackProtection: atTwoFive, convertedReinforcement: true }
);
if (!convertedReinforcementWin.success
  || convertedReinforcementWin.raidCompleted
  || !convertedReinforcementWin.convertedReinforcementCapture
  || convertedReinforcementWin.survivors < 1
  || convertedReinforcementWin.defendersLeft !== 0
  || convertedReinforcementWin.attackerLosses >= 10_000) {
  throw new Error("A winning converted reinforcement cannot capture with its surviving troops.");
}
const convertedReinforcementRaid = sandbox.calculateCombatResult(
  1,
  { troops: 1000, totalDefense: 100_000 },
  null,
  null,
  { attackProtection: atTwoFive, convertedReinforcement: true }
);
if (convertedReinforcementRaid.success
  || !convertedReinforcementRaid.raidCompleted
  || convertedReinforcementRaid.convertedReinforcementCapture
  || convertedReinforcementRaid.survivors !== 0
  || convertedReinforcementRaid.attackerLosses !== 1
  || convertedReinforcementRaid.defenderLosses !== 0) {
  throw new Error("An insufficient converted reinforcement no longer follows protected-raid losses.");
}
const negligibleRaid = sandbox.calculateCombatResult(
  1,
  { troops: 1000, totalDefense: 100_000 },
  null,
  null,
  { attackProtection: atTwoFive }
);
if (negligibleRaid.defenderLosses !== 0 || negligibleRaid.defendersLeft !== 1000) {
  throw new Error("A negligible raid cannot resolve with zero defender losses.");
}
const oneDefenderRaid = sandbox.calculateCombatResult(
  10_000,
  { troops: 1, totalDefense: 1 },
  null,
  null,
  { attackProtection: atTwoFive }
);
if (oneDefenderRaid.defendersLeft !== 1) {
  throw new Error("A protected raid can reduce a surviving garrison below one.");
}

const legacyRaid = sandbox.normalizeAttackProtectionSnapshot(null, {
  active: true,
  attackerKingPower: 500_000,
  defenderKingPower: 100_000,
  powerRatio: 5,
  requestedTroops: 100,
  effectiveTroops: 40,
  maxTroops: 40,
  troopCapPercent: 40,
  attackPowerPercent: 40,
  travelMultiplier: 2,
});
if (legacyRaid?.mode !== "raid" || legacyRaid.captureAllowed || !legacyRaid.legacyDemoAttack) {
  throw new Error("Legacy Demo Attack marches are not converted into safe non-capturing raids.");
}

if (sandbox.getAttackProtectionQuoteSignature(atTwo, 1000, 500)
  === sandbox.getAttackProtectionQuoteSignature(atTwoFive, 1000, 500)) {
  throw new Error("Assault and raid previews have indistinguishable reconfirmation signatures.");
}
if (sandbox.getAttackProtectionQuoteSignature(atTwo, 1000, 500)
  === sandbox.getAttackProtectionQuoteSignature(atTwoCapture, 1000, 500)) {
  throw new Error("Breach and capture assault previews have indistinguishable reconfirmation signatures.");
}
const currentBreach = {
  version: sandbox.PROTECTED_ASSAULT_BREACH_VERSION,
  status: "active",
  attackerUid: "attacker",
  defenderUid: "defender",
  cityId: "city-1",
  defenderOwnershipStartedAtMs: 1234,
  firstResolvedArmyId: "army-first",
  worldId: sandbox.ONLINE_WORLD_ID,
  resetGeneration: sandbox.RESET_GENERATION,
};
if (!sandbox.isCurrentProtectedAssaultBreach(currentBreach, {
  attackerUid: "attacker",
  defenderUid: "defender",
  city: { id: "city-1", lastCapturedAtMs: 1234 },
}) || sandbox.isCurrentProtectedAssaultBreach(currentBreach, {
  attackerUid: "attacker",
  defenderUid: "different-defender",
  city: { id: "city-1", lastCapturedAtMs: 1234 },
}) || sandbox.isCurrentProtectedAssaultBreach(currentBreach, {
  attackerUid: "attacker",
  defenderUid: "defender",
  city: { id: "city-1", lastCapturedAtMs: 9999 },
})) {
  throw new Error("Protected-assault breaches are not scoped to attacker, defender, city ownership, and world.");
}
if (!sandbox.isCurrentProtectedDefenseXpClaim({
  worldId: sandbox.ONLINE_WORLD_ID,
  resetGeneration: sandbox.RESET_GENERATION,
  firstResolvedArmyId: "army-first",
}) || sandbox.isCurrentProtectedDefenseXpClaim({
  worldId: sandbox.ONLINE_WORLD_ID,
  resetGeneration: `${sandbox.RESET_GENERATION}-old`,
  firstResolvedArmyId: "army-old",
})) {
  throw new Error("Protected defensive-XP claims do not respect the string world/reset generation.");
}

const clientSandbox = {
  ATTACK_PROTECTION_POWER_ANCHORS: vm.runInNewContext(readConstant(clientSource, "ATTACK_PROTECTION_POWER_ANCHORS")),
  ATTACK_PROTECTION_ASSAULT_MIN_RATIO: 2,
  ATTACK_PROTECTION_RAID_MIN_RATIO: 2.5,
  DEMO_ATTACK_TIERS: sandbox.DEMO_ATTACK_TIERS,
  normalizePowerValue(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  },
  getKingPower() {
    return 0;
  },
  getAuthoritativeCityOwnerKingPowerSnapshot() {
    return 0;
  },
  isStronghold: sandbox.isStronghold,
};
vm.createContext(clientSandbox);
vm.runInContext([
  readFunction(clientSource, "getAttackProtectionThresholds"),
  readFunction(clientSource, "getAttackProtectionMode"),
  readFunction(clientSource, "getDemoAttackTier"),
  readFunction(clientSource, "getEnemyCityPowerBand"),
].join("\n\n"), clientSandbox);
const enemyCity = { owner: "enemy" };
Object.assign(clientSandbox, {
  ATTACK_PROTECTION_VERSION: sandbox.ATTACK_PROTECTION_VERSION,
  ATTACK_PROTECTION_DEFENDER_XP_POLICY: sandbox.ATTACK_PROTECTION_DEFENDER_XP_POLICY,
  clamp: sandbox.clamp,
  getAttackPower: troops => sandbox.getAttackPower(troops),
  getCityStats: sandbox.getCityStats,
  getCurrentOnlineUid: () => "attacker",
  isRewardCampTarget: () => false,
  normalizeDemoAttackSnapshot: () => null,
});
vm.runInContext(["roundDownToTwoSignificantDigits", "roundUpToTwoSignificantDigits",
  "getAttackProtectionBreakEvenScale", "normalizeAttackProtectionSnapshot", "createAttackProtectionSnapshot"]
  .map(name => readFunction(clientSource, name)).join("\n"), clientSandbox);
assert.deepEqual(JSON.parse(JSON.stringify(clientSandbox.ATTACK_PROTECTION_POWER_ANCHORS)),
  JSON.parse(JSON.stringify(sandbox.ATTACK_PROTECTION_POWER_ANCHORS)));
const anchors = [[1, 3, 4], [1_000_000, 3, 4], [10_000_000, 2.75, 3.5],
  [100_000_000, 2.5, 3], [1_000_000_000, 2, 2.5], [10_000_000_000, 2, 2.5]];
for (const [power, assault, raid] of anchors) {
  for (const runtime of [sandbox, clientSandbox]) {
    const thresholds = runtime.getAttackProtectionThresholds(power);
    assert.equal(thresholds.assaultMinRatio, assault);
    assert.equal(thresholds.raidMinRatio, raid);
    assert.equal(thresholds.raidMaxScaleRatio, raid * 2);
    assert.equal(runtime.getAttackProtectionMode(assault - 1e-9, power), "normal");
    assert.equal(runtime.getAttackProtectionMode(assault, power), "assault");
    assert.equal(runtime.getAttackProtectionMode(raid - 1e-9, power), "assault");
    assert.equal(runtime.getAttackProtectionMode(raid, power), "raid");
  }
  assert.equal(sandbox.getAttackProtectionBreakEvenScale("assault", assault, power), 1.25);
  assert.equal(sandbox.getAttackProtectionBreakEvenScale("assault", raid, power), 1.05);
  assert.equal(sandbox.getAttackProtectionBreakEvenScale("raid", raid, power), 0.5);
  assert.equal(sandbox.getAttackProtectionBreakEvenScale("raid", raid * 2, power), 0.25);
  assert.equal(sandbox.getAttackProtectionBreakEvenScale("raid", raid * 20, power), 0.25);
}
assert.equal(sandbox.getAttackProtectionThresholds(Math.sqrt(1e6 * 1e7)).assaultMinRatio, 2.875);
assert.equal(sandbox.getAttackProtectionThresholds(Math.sqrt(1e6 * 1e7)).raidMinRatio, 3.75);
let previous = null;
for (let exponent = 0; exponent <= 12; exponent += 0.01) {
  const power = 10 ** exponent;
  const thresholds = sandbox.getAttackProtectionThresholds(power);
  assert.deepEqual(JSON.parse(JSON.stringify(thresholds)),
    JSON.parse(JSON.stringify(clientSandbox.getAttackProtectionThresholds(power))));
  if (previous) {
    assert(thresholds.assaultMinRatio <= previous.assaultMinRatio);
    assert(thresholds.raidMinRatio <= previous.raidMinRatio);
    assert(power / thresholds.assaultMinRatio > previous.power / previous.assaultMinRatio,
      "Increasing attacker power must never unlock weaker normal targets");
  }
  previous = { ...thresholds, power };
}
for (const power of [1e6, 1e7, 1e8, 1e9]) {
  const below = sandbox.getAttackProtectionThresholds(power - 1);
  const above = sandbox.getAttackProtectionThresholds(power + 1);
  assert(Math.abs(below.assaultMinRatio - above.assaultMinRatio) < 1e-6);
  assert(Math.abs(below.raidMinRatio - above.raidMinRatio) < 1e-6);
}
for (const [attackerKingPower, defenderKingPower, mode] of [
  [900_000, 300_001, "normal"], [900_000, 300_000, "assault"],
  [900_000, 225_001, "assault"], [900_000, 225_000, "raid"],
  [10_000_000, 3_700_000, "normal"], [10_000_000, 3_000_000, "assault"],
  [10_000_000, 2_800_000, "raid"], [100_000_000, 40_000_001, "normal"],
  [100_000_000, 40_000_000, "assault"], [100_000_000, 33_333_333, "raid"],
]) {
  const result = protectionAt(1, { attackerKingPower, defenderKingPower });
  assert.equal(result?.mode || "normal", mode);
  for (const assaultStage of ["breach", "capture"]) {
    const serverProtection = protectionAt(1, { attackerKingPower, defenderKingPower, assaultStage });
    const clientProtection = clientSandbox.createAttackProtectionSnapshot({ troops: 1_000_000 },
      { ...target, owner: "enemy" }, 1_000_000, "player", { attackerKingPower, defenderKingPower, assaultStage });
    for (const field of ["mode", "maxTroops", "effectiveTroops", "captureAllowed", "assaultStage", "maxDefenderLossPercent"]) {
      assert.equal(clientProtection?.[field], serverProtection?.[field], `${attackerKingPower}/${defenderKingPower}: ${field} differs`);
    }
  }
  assert.equal(clientSandbox.getEnemyCityPowerBand(enemyCity, attackerKingPower, defenderKingPower),
    mode === "normal" ? "in-range" : "protected");
}
// Saved schema-v2 marches retain their committed mode and cap after the policy update.
assert.equal(sandbox.normalizeAttackProtectionSnapshot({ ...atTwo, powerRatio: 2 }).mode, "assault");
assert.equal(sandbox.normalizeAttackProtectionSnapshot({ ...atTwoFive, powerRatio: 2.5 }).maxTroops, 400);
sandbox.DAILY_MISSION_SAFE_PEER_LIMIT = 20;
vm.runInContext(readFunction(source, "selectDailyMissionPeerCandidates"), sandbox);
const peers = [299_999, 300_000, 300_001, 900_000].map(kingPower => ({ uid: String(kingPower), kingPower }));
assert.deepEqual(Array.from(sandbox.selectDailyMissionPeerCandidates(peers, 900_000), row => row.kingPower),
  [900_000, 300_001]);
sandbox.crypto = require("node:crypto");
sandbox.db = { doc: value => value };
sandbox.combatAuthorizationRealm = () => ({ worldId: "test", resetGeneration: "test" });
sandbox.COMBAT_AUTHORIZATION = { RETALIATION_WINDOW_MS: 1_800_000, captureAbandonLocks: () => ({ capturer: true }) };
vm.runInContext(readFunction(source, "recordCaptureRetaliation"), sandbox);
for (const [highPower, lowPower, expected] of [[900_000, 400_000, false], [900_000, 300_000, true],
  [100_000_000, 45_000_000, false], [100_000_000, 40_000_000, true], [1e9, 5e8, true]]) {
  const writes = [];
  sandbox.recordCaptureRetaliation({ set: (...args) => writes.push(args) }, {
    armyId: "capture", target: { id: "city", regionId: "map" }, targetRef: { path: "test/city" },
    originalOwnerUid: "strong", capturerUid: "weak", highPower, lowPower, nowMs: 1000,
  });
  assert.equal(writes.length > 0, expected, "Retaliation must use the displaced ruler's attack threshold");
}
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 299_000, 100_000) !== "in-range"
  || clientSandbox.getEnemyCityPowerBand(enemyCity, 300_000, 100_000) !== "protected") {
  throw new Error("Light red does not begin exactly at the early 3× boundary.");
}
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 399_000, 100_000) !== "protected"
  || clientSandbox.getEnemyCityPowerBand(enemyCity, 400_000, 100_000) !== "protected") {
  throw new Error("Protected assaults and raids do not share the stable light-red tier.");
}
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 100_000, 900_000) !== "overpowering") {
  throw new Error("A stronger enemy is not assigned the stable dark-red band.");
}

if (Number(vm.runInNewContext(readConstant(clientSource, "ENEMY_POWER_BAND_STABILIZE_MS"))) !== 3000) {
  throw new Error("Enemy strength colors no longer use the three-second stabilization window.");
}
for (const renderFunctionName of ["getCityRenderSignature", "updateVisibleCityDynamicText", "renderCities"]) {
  const renderFunction = readFunction(clientSource, renderFunctionName);
  if (!renderFunction.includes("getStableEnemyCityPowerBand")
    || renderFunction.includes("getEnemyCityPowerBand(city")) {
    throw new Error(`${renderFunctionName} does not use the stabilized visual tier.`);
  }
}
if (!clientSource.includes("clearEnemyPowerBandCache();")
  || !readFunction(clientSource, "disconnectOnlineWorld").includes("clearEnemyPowerBandCache()")
  || !readFunction(clientSource, "startFromInput").includes("clearEnemyPowerBandCache()")) {
  throw new Error("Enemy strength tiers are not cleared when the world or player changes.");
}
const identityLookupQueueFunction = readFunction(clientSource, "queuePlayerIdentityLookupForUids");
if (!identityLookupQueueFunction.includes("cached?.authoritative ? cached.fetchedAtMs || 0 : 0")
  || !identityLookupQueueFunction.includes("refreshUids.has(uid)")
  || !identityLookupQueueFunction.includes("!refreshUids.has(uid) && missedAt")
  || identityLookupQueueFunction.includes("cached?.fetchedAtMs || cached?.updatedAtMs")) {
  throw new Error("Unverified city timestamps can still suppress authoritative King Power lookups.");
}
const recordIdentityLookupFunction = readFunction(clientSource, "queuePlayerIdentityLookupForRecords");
if (!recordIdentityLookupFunction.includes("recordKingPowerVersion >= KING_POWER_AUTHORITY_VERSION")
  || !recordIdentityLookupFunction.includes("recordUpdatedAtMs > normalizeTimestampMs(cached.updatedAtMs)")
  || !recordIdentityLookupFunction.includes("{ refreshUids }")) {
  throw new Error("New King Power evidence does not force an authoritative identity refresh.");
}
const queuedIdentityRefreshFunction = readFunction(clientSource, "refreshQueuedPlayerIdentities");
if (!queuedIdentityRefreshFunction.includes("changed || recordsChanged")
  || !queuedIdentityRefreshFunction.includes("renderCities(true)")) {
  throw new Error("Authoritative King Power results can arrive without repainting city colors.");
}
const rememberIdentityFunction = readFunction(clientSource, "rememberPlayerIdentity");
if (!rememberIdentityFunction.includes("updatedAtMs: identityIsNewer")
  || !rememberIdentityFunction.includes(": existing?.updatedAtMs || identity.updatedAtMs || 0")) {
  throw new Error("Rejected city fallbacks can still advance an authoritative identity timestamp.");
}
if (!readFunction(clientSource, "getPlayerIdentitySignature").includes("identity.authoritative ? 1 : 0")) {
  throw new Error("The first authoritative identity result does not invalidate the city render signature.");
}
const identitySignatureSandbox = {
  getFlagSignature: flag => JSON.stringify(flag || null),
  normalizePowerValue: value => Math.max(0, Math.floor(Number(value) || 0)),
  normalizeTimestampMs: value => Math.max(0, Math.floor(Number(value) || 0)),
};
vm.createContext(identitySignatureSandbox);
vm.runInContext(readFunction(clientSource, "getPlayerIdentitySignature"), identitySignatureSandbox);
const unverifiedIdentity = {
  uid: "defender",
  displayName: "Defender",
  kingPower: 100_000,
  kingPowerVersion: 8,
  updatedAtMs: 10_000,
  authoritative: false,
};
const authoritativeIdentity = { ...unverifiedIdentity, authoritative: true };
if (identitySignatureSandbox.getPlayerIdentitySignature(unverifiedIdentity)
  === identitySignatureSandbox.getPlayerIdentitySignature(authoritativeIdentity)) {
  throw new Error("An authoritative King Power lookup does not trigger a fresh city-color render.");
}
if (!/\.city-node\.enemy\.enemy-power-protected\s*\{[\s\S]*?--enemy-city-ui:\s*#c9786f;/.test(stylesSource)
  || !/\.city-node\.enemy\.enemy-power-in-range\s*\{[\s\S]*?--enemy-city-ui:\s*#b3261e;/.test(stylesSource)
  || !/\.city-node\.enemy\.enemy-power-overpowering\s*\{[\s\S]*?--enemy-city-ui:\s*#4b1418;/.test(stylesSource)) {
  throw new Error("Enemy power bands are not using the fixed light, bright, and dark red palette.");
}

const requiredServerSnippets = [
  "exports.previewArmyProtection = onCall",
  "createServerAttackProtectionSnapshot({",
  "reason: \"attack-protection-changed\"",
  "protectedDefenseXpClaims",
  "firstResolvedArmyId: armyId",
  "First protected defense: 2× XP.",
  "Repeat protected defense: normal XP.",
  "attackerXpMultiplier: 0",
  "attackProtection,",
  "demoAttack: army.demoAttack",
  "protectedAssaultBreaches",
  "assaultStage: resolutionAssaultStage",
  'const nonCaptureOutcome = result.success ? "victory" : "breach"',
  "Walls breached.",
  "returnRecalledTroops(result.survivors)",
];
requiredServerSnippets.forEach(snippet => {
  if (!source.includes(snippet)) throw new Error(`Missing server protection behavior: ${snippet}`);
});
if (!source.includes("capBattleXpForHeroLevel(defenseHeldXp, defenderProfile || {}) * defenderXpMultiplierApplied")) {
  throw new Error("The first protected defense is not exactly 2× the normal capped defensive XP.");
}
if (!/match\s+\/protectedDefenseXpClaims\/\{attackerUid\}\s*\{[\s\S]*?allow read, create, update, delete:\s*if false;/.test(firestoreRulesSource)) {
  throw new Error("Protected defensive-XP claims are not explicitly server-owned in Firestore rules.");
}
if (!/match\s+\/protectedAssaultBreaches\/\{attackerUid\}\s*\{[\s\S]*?allow read, create, update, delete:\s*if false;/.test(firestoreRulesSource)) {
  throw new Error("Protected-assault breach records are not explicitly server-owned in Firestore rules.");
}
if (!source.includes("const duration = calculateTravelTime({")
  || /const duration = calculateTravelTime\(\{[\s\S]{0,260}\bdemoAttack,/.test(
    source.slice(source.indexOf("exports.sendArmyOrder"), source.indexOf("async function resolveArmyOrderById"))
  )) {
  throw new Error("New protected orders still receive a Demo Attack travel penalty.");
}

const requiredClientSnippets = [
  'callServerFunction("previewArmyProtection", payload)',
  "previewArmyProtection,",
  "loadAttackProtectionPreview(source, target)",
  "acceptedAttackProtection",
  'protectionHandling: "auto_cap"',
  "getChangedAttackProtectionFromError(error)",
  "Protection changed. Confirm the refreshed limit.",
  "no capture; defender damage is capped",
  "first assault; a victory breaches the walls but cannot capture",
  "follow-up assault; capture is possible",
  "2× on their first protected battle against you this world; normal afterward.",
  "activeAttackProtectionPreview",
];
requiredClientSnippets.forEach(snippet => {
  const haystack = snippet.includes("callServerFunction") || snippet === "previewArmyProtection,"
    ? firebaseClientSource
    : clientSource;
  if (!haystack.includes(snippet)) throw new Error(`Missing client protection behavior: ${snippet}`);
});
if (!readFunction(clientSource, "normalizeBattleReports").includes("\"breach\", \"breached\"")
  || !readFunction(clientSource, "getBattleReportBadge").includes("label: \"BREACH\"")
  || !readFunction(clientSource, "calculateBattlePreviewForTroops").includes("breachCompleted")) {
  throw new Error("Protected breach previews or battle reports are not represented in the client UI.");
}
if (!clientSource.includes("slider.max = String(sliderSendLimit)")
  || !clientSource.includes("selectedTroopAmount = clamp(selection?.amount ?? selectedTroopAmount, 1, getTroopSliderSendLimit(source, target))")) {
  throw new Error("The visible slider and final confirmation do not reapply the legal troop cap.");
}
const reopenProtectionSource = readFunction(clientSource, "reopenAttackProtectionConfirmation");
const showTroopSliderSource = readFunction(clientSource, "showTroopSliderModalAsync");
const confirmTroopSliderSource = readFunction(clientSource, "confirmTroopSliderOrder");
if (!reopenProtectionSource.includes("window.setTimeout")
   || !reopenProtectionSource.includes("attackProtection: refreshedProtectionSnapshot")
   || !showTroopSliderSource.includes("options.attackProtection")
   || !showTroopSliderSource.includes("attackProtection: providedAttackProtection")
   || !confirmTroopSliderSource.includes('protectionHandling: "auto_cap"')) {
  throw new Error("New clients must auto-cap instant launches while the legacy refreshed-limit confirmation remains available.");
}
if (!source.includes('order.acceptedAttackProtection && order.protectionHandling !== "auto_cap"')
  || !source.includes("adjustedByProtection")) {
  throw new Error("The server does not preserve legacy quote checks while authoritatively auto-capping instant launches.");
}
if (!confirmTroopSliderSource.includes("const launched = launchAttack")
  || !confirmTroopSliderSource.includes("if (!launched) return")
  || !confirmTroopSliderSource.includes('modal.classList.remove("troop-slider-modal")')
  || !confirmTroopSliderSource.includes("if (modal.open) modal.close()")) {
  throw new Error("Confirmed troop orders must close the attack screen immediately after dispatch.");
}

console.log("Validated smooth attacker-power thresholds, saved v2 snapshots, two-stage breaches, caps, raids, XP claims, previews, and stable colors.");
