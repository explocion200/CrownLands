const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const firestoreRulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

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
  "ATTACK_PROTECTION_RAID_MAX_SCALE_RATIO",
  "ATTACK_PROTECTION_DEFENDER_FIRST_XP_MULTIPLIER",
  "ATTACK_PROTECTION_DEFENDER_REPEAT_XP_MULTIPLIER",
  "DEMO_ATTACK_MIN_POWER_RATIO",
  "DEMO_ATTACK_DEFENDER_XP_MULTIPLIER",
  "BASE_TROOP_ATTACK_POWER",
  "GLOBAL_PLAYER_STATS_VERSION",
];
const sandbox = { console };
numericConstants.forEach(name => {
  sandbox[name] = Number(readConstant(source, name));
});
sandbox.ATTACK_PROTECTION_DEFENDER_XP_POLICY = vm.runInNewContext(
  readConstant(source, "ATTACK_PROTECTION_DEFENDER_XP_POLICY")
);
sandbox.RESET_GENERATION = vm.runInNewContext(readConstant(source, "RESET_GENERATION"));
sandbox.ONLINE_WORLD_ID = vm.runInNewContext(
  readConstant(source, "ONLINE_WORLD_ID"),
  { RESET_GENERATION: sandbox.RESET_GENERATION }
);
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
  readFunction(source, "getAttackProtectionMode"),
  readFunction(source, "getAttackProtectionBreakEvenScale"),
  readFunction(source, "normalizeAttackProtectionSnapshot"),
  readFunction(source, "getAttackPower"),
  readFunction(source, "createServerAttackProtectionSnapshot"),
  readFunction(source, "createAttackProtectionPreview"),
  readFunction(source, "getAttackProtectionQuoteSignature"),
  readFunction(source, "isCurrentProtectedDefenseXpClaim"),
  readFunction(source, "calculateCombatResult"),
].join("\n\n"), sandbox);

if (sandbox.GLOBAL_PLAYER_STATS_VERSION !== 8 || sandbox.ATTACK_PROTECTION_VERSION !== 2) {
  throw new Error("Protection is not using King Power v8 and attack-protection schema v2.");
}
if (sandbox.ATTACK_PROTECTION_ASSAULT_MIN_RATIO !== 2
  || sandbox.ATTACK_PROTECTION_RAID_MIN_RATIO !== 2.5
  || sandbox.ATTACK_PROTECTION_RAID_MAX_SCALE_RATIO !== 5) {
  throw new Error("The v2 protection ratio boundaries changed unexpectedly.");
}

const validGlobalPower = sandbox.getPlayerPowerSnapshot({
  profile: { kingPowerVersion: 6, kingPower: 4_000_000, kingPowerUpdatedAtMs: 5000 },
  globalStats: { version: 8, kingPower: 900_000, updatedAtMs: 4000 },
  city: { powerFloor: 300_000 },
});
if (validGlobalPower !== 900_000) {
  throw new Error("A legacy profile snapshot overrides canonical v8 global stats.");
}

const target = { ownerUid: "defender", totalDefense: 1000, troops: 1000 };
function protectionAt(ratio, overrides = {}) {
  return sandbox.createServerAttackProtectionSnapshot({
    sourceTroops: 1_000_000,
    target,
    requestedTroops: 1_000_000,
    attackerKingPower: Math.round(100_000 * ratio),
    defenderKingPower: 100_000,
    attackerUid: "attacker",
    ...overrides,
  });
}

if (protectionAt(1.99)) throw new Error("A 1.99× attack is incorrectly protected.");
const atTwo = protectionAt(2);
if (atTwo?.mode !== "assault" || !atTwo.captureAllowed || atTwo.maxTroops !== 620) {
  throw new Error("The 2× protected-assault boundary or 125% break-even cap is wrong.");
}
const atTwoFortyNine = protectionAt(2.49);
if (atTwoFortyNine?.mode !== "assault" || !atTwoFortyNine.captureAllowed || atTwoFortyNine.maxTroops !== 520) {
  throw new Error("The 2.49× assault cap does not approach 105% of break-even.");
}
const atTwoFive = protectionAt(2.5);
if (atTwoFive?.mode !== "raid" || atTwoFive.captureAllowed
  || atTwoFive.maxTroops !== 250 || atTwoFive.maxDefenderLossPercent !== 10) {
  throw new Error("Exactly 2.5× must become a non-capturing raid.");
}
const atFive = protectionAt(5);
if (atFive?.mode !== "raid" || atFive.maxTroops !== 120) {
  throw new Error("The 5× raid cap is not 25% of break-even rounded down to two significant digits.");
}
if (protectionAt(8)?.maxTroops !== 120) {
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
if (pressuredFailure.success || pressuredFailure.defenderLosses !== 820) {
  throw new Error("Normal failed attacks do not use 82% × pressure capped at 82%.");
}
const assaultWin = sandbox.calculateCombatResult(
  600,
  target,
  null,
  null,
  { attackProtection: atTwo }
);
if (!assaultWin.success || assaultWin.survivors < 1) {
  throw new Error("Permitted protected-assault troops do not retain normal capture strength.");
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
  readFunction(clientSource, "getDemoAttackTier"),
  readFunction(clientSource, "getEnemyCityPowerBand"),
].join("\n\n"), clientSandbox);
const enemyCity = { owner: "enemy" };
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 199_000, 100_000) !== "in-range"
  || clientSandbox.getEnemyCityPowerBand(enemyCity, 200_000, 100_000) !== "protected") {
  throw new Error("Light red does not begin exactly at the 2× boundary.");
}
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 249_000, 100_000) !== "protected"
  || clientSandbox.getEnemyCityPowerBand(enemyCity, 250_000, 100_000) !== "protected") {
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
if (!/\.city-node\.enemy\.enemy-power-protected\s*\{[\s\S]*?--enemy-city-ui:\s*#ed8b8b;/.test(stylesSource)
  || !/\.city-node\.enemy\.enemy-power-in-range\s*\{[\s\S]*?--enemy-city-ui:\s*#e12635;/.test(stylesSource)
  || !/\.city-node\.enemy\.enemy-power-overpowering\s*\{[\s\S]*?--enemy-city-ui:\s*#59121a;/.test(stylesSource)) {
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
  "getChangedAttackProtectionFromError(error)",
  "Protection changed. Confirm the refreshed limit.",
  "no capture; defender damage is capped",
  "2× on their first protected battle against you this world; normal afterward.",
  "activeAttackProtectionPreview",
];
requiredClientSnippets.forEach(snippet => {
  const haystack = snippet.includes("callServerFunction") || snippet === "previewArmyProtection,"
    ? firebaseClientSource
    : clientSource;
  if (!haystack.includes(snippet)) throw new Error(`Missing client protection behavior: ${snippet}`);
});
if (!clientSource.includes("slider.max = String(sliderSendLimit)")
  || !clientSource.includes("selectedTroopAmount = clamp(selectedTroopAmount, 1, getTroopSliderSendLimit(source, target))")) {
  throw new Error("The visible slider and final confirmation do not reapply the legal troop cap.");
}

console.log("Validated weaker-player protection v2 boundaries, caps, raids, XP claims, previews, and stable colors.");
