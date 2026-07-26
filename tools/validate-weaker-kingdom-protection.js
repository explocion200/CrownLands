const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function readFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}.`);
  const bodyStart = source.indexOf(") {", start) + 2;
  if (bodyStart < 2) throw new Error(`Could not find the body for ${name}.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function readClientFunction(name) {
  const start = clientSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing client ${name}.`);
  const bodyStart = clientSource.indexOf(") {", start) + 2;
  if (bodyStart < 2) throw new Error(`Could not find the client body for ${name}.`);
  let depth = 0;
  for (let index = bodyStart; index < clientSource.length; index += 1) {
    if (clientSource[index] === "{") depth += 1;
    if (clientSource[index] === "}") depth -= 1;
    if (depth === 0) return clientSource.slice(start, index + 1);
  }
  throw new Error(`Could not parse client ${name}.`);
}

function readConstant(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!match) throw new Error(`Missing ${name}.`);
  return match[1];
}

function readClientConstant(name) {
  const match = clientSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!match) throw new Error(`Missing client ${name}.`);
  return match[1];
}

const sandbox = {
  console,
  GLOBAL_PLAYER_STATS_VERSION: Number(readConstant("GLOBAL_PLAYER_STATS_VERSION")),
  DEMO_ATTACK_MIN_POWER_RATIO: Number(readConstant("DEMO_ATTACK_MIN_POWER_RATIO")),
  DEMO_ATTACK_DEFENDER_XP_MULTIPLIER: Number(readConstant("DEMO_ATTACK_DEFENDER_XP_MULTIPLIER")),
  DEMO_ATTACK_TIERS: vm.runInNewContext(readConstant("DEMO_ATTACK_TIERS").replace(
    /DEMO_ATTACK_MIN_POWER_RATIO/g,
    readConstant("DEMO_ATTACK_MIN_POWER_RATIO")
  )),
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  safeString(value, maxLength = 128) {
    return String(value || "").slice(0, maxLength);
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
    return { cityWalls: Math.max(1, Number(target.cityWalls) || 10_000) };
  },
};

vm.createContext(sandbox);
vm.runInContext([
  readFunction("getPowerValue"),
  readFunction("getPlayerPowerSnapshot"),
  readFunction("getDemoAttackTier"),
  readFunction("normalizeDemoAttackSnapshot"),
  readFunction("createServerDemoAttackSnapshot"),
].join("\n\n"), sandbox);

if (sandbox.GLOBAL_PLAYER_STATS_VERSION !== 8) {
  throw new Error(`Protection is not using King Power v8 (found v${sandbox.GLOBAL_PLAYER_STATS_VERSION}).`);
}
if (Number(readClientConstant("KING_POWER_COMPATIBILITY_VERSION")) !== 7) {
  throw new Error("Map colors do not support the immediately previous public King Power snapshot.");
}
if (sandbox.DEMO_ATTACK_MIN_POWER_RATIO !== 3) {
  throw new Error(`Unexpected protection threshold ${sandbox.DEMO_ATTACK_MIN_POWER_RATIO}.`);
}

const validGlobalPower = sandbox.getPlayerPowerSnapshot({
  profile: { kingPowerVersion: 6, kingPower: 4_000_000, kingPowerUpdatedAtMs: 5000 },
  globalStats: { version: 8, kingPower: 900_000, updatedAtMs: 4000 },
  city: { powerFloor: 300_000 },
});
if (validGlobalPower !== 900_000) {
  throw new Error("A newer legacy profile snapshot overrides canonical v8 global stats.");
}

const cityFloorPower = sandbox.getPlayerPowerSnapshot({
  profile: { kingPowerVersion: 8, kingPower: 0, kingPowerUpdatedAtMs: 5000 },
  leaderboard: { kingPowerVersion: 8, kingPower: 0, updatedAtMs: 5000 },
  city: { powerFloor: 450_000 },
});
if (cityFloorPower !== 450_000) {
  throw new Error("Missing v8 snapshots do not fall back to the target city's military floor.");
}

const target = { ownerUid: "weak-player", cityWalls: 20_000 };
const strongToWeak = sandbox.createServerDemoAttackSnapshot({
  sourceTroops: 100_000,
  target,
  requestedTroops: 100_000,
  attackerKingPower: 900_000,
  defenderKingPower: 100_000,
  attackerUid: "strong-player",
});
if (!strongToWeak?.active || strongToWeak.attackerXpMultiplier !== 0 || strongToWeak.defenderXpMultiplier !== 2) {
  throw new Error("Strong-to-weak city attacks are not receiving the full protection rules.");
}
if (strongToWeak.effectiveTroops >= strongToWeak.requestedTroops || strongToWeak.attackPowerPercent >= 100) {
  throw new Error("Protected attacks are not capped and reduced.");
}

const weakToStrong = sandbox.createServerDemoAttackSnapshot({
  sourceTroops: 100_000,
  target: { ownerUid: "strong-player", cityWalls: 20_000 },
  requestedTroops: 100_000,
  attackerKingPower: 100_000,
  defenderKingPower: 900_000,
  attackerUid: "weak-player",
});
if (weakToStrong) throw new Error("Weak-to-strong attacks are incorrectly restricted.");

const closeMatch = sandbox.createServerDemoAttackSnapshot({
  sourceTroops: 1_000_000,
  target: { ownerUid: "twelve-million-player", cityWalls: 100_000 },
  requestedTroops: 1_000_000,
  attackerKingPower: 11_000_000,
  defenderKingPower: 12_000_000,
  attackerUid: "eleven-million-player",
});
if (closeMatch) throw new Error("An 11M versus 12M King Power attack is incorrectly classified as a demo attack.");

const sameOwner = sandbox.createServerDemoAttackSnapshot({
  sourceTroops: 100_000,
  target: { ownerUid: "strong-player", cityWalls: 20_000 },
  requestedTroops: 100_000,
  attackerKingPower: 900_000,
  defenderKingPower: 100_000,
  attackerUid: "strong-player",
});
if (sameOwner) throw new Error("Owned-city transfers are incorrectly restricted.");

const campAttack = sandbox.createServerDemoAttackSnapshot({
  sourceTroops: 100_000,
  target,
  targetType: "camp",
  requestedTroops: 100_000,
  attackerKingPower: 900_000,
  defenderKingPower: 100_000,
  attackerUid: "strong-player",
});
if (campAttack) throw new Error("Camp attacks must remain exempt from weaker-kingdom protection.");

const strongholdAttack = sandbox.createServerDemoAttackSnapshot({
  sourceTroops: 100_000,
  target: { ...target, kind: "stronghold" },
  requestedTroops: 100_000,
  attackerKingPower: 900_000,
  defenderKingPower: 100_000,
  attackerUid: "strong-player",
});
if (strongholdAttack) throw new Error("Stronghold attacks must remain exempt from weaker-kingdom protection.");

const clientSandbox = {
  DEMO_ATTACK_TIERS: sandbox.DEMO_ATTACK_TIERS,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  },
  createDemoAttackSnapshot(source, target) {
    if (!target.demoMaxTroops) return null;
    return {
      active: true,
      maxTroops: Math.min(source.troops, target.demoMaxTroops),
    };
  },
  getKingPower() {
    return 0;
  },
  getAuthoritativeCityOwnerKingPowerSnapshot() {
    return 0;
  },
  normalizePowerValue(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  },
  normalizeTimestampMs(value) {
    return Math.max(0, Number(value) || 0);
  },
  isStronghold: sandbox.isStronghold,
};
vm.createContext(clientSandbox);
vm.runInContext([
  readClientFunction("getDemoAttackTier"),
  readClientFunction("getEnemyCityPowerBand"),
  readClientFunction("getTroopSliderSendLimit"),
  readClientFunction("shouldReplacePlayerIdentity"),
].join("\n\n"), clientSandbox);

const enemyCity = { owner: "enemy" };
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 900_000, 100_000) !== "protected") {
  throw new Error("A protected weaker enemy city is not assigned the light-red power band.");
}
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 100_000, 900_000) !== "overpowering") {
  throw new Error("A much stronger enemy city is not assigned the dark-red power band.");
}
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 11_000_000, 12_000_000) !== "overpowering") {
  throw new Error("Any enemy stronger than the current player must use the dark-red power band.");
}
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 12_000_000, 11_000_000) !== "in-range") {
  throw new Error("An attackable weaker player inside the protection threshold must use bright red.");
}
for (const defenderPower of [300_000, 180_000, 80_000]) {
  if (clientSandbox.getEnemyCityPowerBand(enemyCity, 1_000_000, defenderPower) !== "protected") {
    throw new Error("Every protected weaker player must use the same light-red power band.");
  }
}
if (clientSandbox.getEnemyCityPowerBand(enemyCity, 500_000, 0) !== "in-range") {
  throw new Error("An enemy with pending power data should retain the normal attackable color.");
}
if (clientSandbox.getEnemyCityPowerBand({ owner: "neutral" }, 900_000, 100_000) !== ""
  || clientSandbox.getEnemyCityPowerBand({ owner: "enemy", kind: "stronghold" }, 900_000, 100_000) !== "") {
  throw new Error("Neutral cities or strongholds are incorrectly receiving enemy power colors.");
}
if (clientSandbox.getTroopSliderSendLimit({ troops: 100_000 }, { demoMaxTroops: 20_000 }) !== 20_000) {
  throw new Error("The troop slider does not stop at the weaker-kingdom attack limit.");
}
if (clientSandbox.getTroopSliderSendLimit({ troops: 21_000_000 }, { demoMaxTroops: 287 }) !== 287) {
  throw new Error("A large army can still slide past the server's small protected attack limit.");
}
if (clientSandbox.getTroopSliderSendLimit({ troops: 100_000 }, {}) !== 100_000) {
  throw new Error("The troop slider incorrectly caps unrestricted attacks and transfers.");
}
const verifiedIdentity = { kingPowerVersion: 8, updatedAtMs: 2000, authoritative: true };
if (clientSandbox.shouldReplacePlayerIdentity(
  verifiedIdentity,
  { kingPowerVersion: 7, updatedAtMs: 3000 },
  true
)) {
  throw new Error("A delayed older King Power version can replace a verified identity.");
}
if (clientSandbox.shouldReplacePlayerIdentity(
  verifiedIdentity,
  { kingPowerVersion: 8, updatedAtMs: 1000 },
  true
)) {
  throw new Error("An older same-version identity can replace a newer verified identity.");
}
if (clientSandbox.shouldReplacePlayerIdentity(
  verifiedIdentity,
  { kingPowerVersion: 8 },
  true
)) {
  throw new Error("An undated same-version identity can replace a newer verified identity.");
}
if (!clientSandbox.shouldReplacePlayerIdentity(
  verifiedIdentity,
  { kingPowerVersion: 8, updatedAtMs: 3000 },
  true
)) {
  throw new Error("A genuinely newer verified identity cannot refresh the cache.");
}
if (!clientSource.includes('slider.max = String(sliderSendLimit)')
  || !clientSource.includes('selectedTroopAmount = clamp(selectedTroopAmount, 1, getTroopSliderSendLimit(source, target))')) {
  throw new Error("The visible slider and final confirmation do not reapply the legal troop limit.");
}
if (!clientSource.includes("ensureAuthoritativeCityOwnerKingPower(target)")
  || !clientSource.includes("launchAttack(source.id, target.id, 1, \"player\", selectedTroopAmount")) {
  throw new Error("Attack preparation does not load authoritative power and launch the exact capped slider amount.");
}
if (!clientSource.includes("getCompatibleCityOwnerKingPowerSnapshot(city)")
  || !clientSource.includes("showTroopPowerVerificationError(freshSource, freshTarget)")) {
  throw new Error("Stale public power cannot color the map or fail closed before opening an attack slider.");
}
if (!clientSource.includes("api.loadPlayerIdentities([ownerUid])")
  || !clientSource.includes("api.getCombatPlayerIdentity({ uid: ownerUid })")
  || !clientSource.includes("15000")
  || !clientSource.includes("id=\"troopPowerRetry\"")) {
  throw new Error("Defender verification does not use the fast leaderboard path with a recoverable server fallback.");
}
if (!clientSource.includes("showMainCityProtectedAttackModal(target)")
  || !clientSource.includes("Home base protected")) {
  throw new Error("A late main-city protection result can still make the attack window disappear without explanation.");
}
if (!clientSource.includes("right.version - left.version")
  || !clientSource.includes("right.authority - left.authority")
  || !clientSource.includes("const identityIsNewer = shouldReplacePlayerIdentity(existing, identity, force)")) {
  throw new Error("Enemy color snapshots are not protected from out-of-order identity refreshes.");
}
if (readClientFunction("getAuthoritativeCityOwnerKingPowerSnapshot").includes("onlinePresence")
  || clientSource.includes("rememberPlayerIdentities(onlinePresence, { force: true })")) {
  throw new Error("Client-published presence can still override server-authoritative combat power.");
}
if (!firebaseClientSource.includes('callServerFunction("getCombatPlayerIdentity", payload)')
  || !firebaseClientSource.includes("getCombatPlayerIdentity,")) {
  throw new Error("The browser does not expose the combat identity lookup.");
}
if (!source.includes("exports.getCombatPlayerIdentity = onCall")
  || !source.includes("await rebuildGlobalStatsForPlayer(targetUid)")
  || !source.includes("kingPowerVersion: Math.max(0, Math.floor(safeNumber(leaderboard.kingPowerVersion, 0)))")) {
  throw new Error("The server does not upgrade and return authoritative combat King Power.");
}
if (!source.includes("const troops = resolvedKind === \"scout\" ? 1 : (demoAttack?.effectiveTroops || requestedTroops)")) {
  throw new Error("Server launch does not use the protected attack's capped troop count.");
}
if (!/\.city-node\.enemy\.enemy-power-protected\s*\{[\s\S]*?--enemy-city-ui:\s*#ed8b8b;/.test(stylesSource)
  || !/\.city-node\.enemy\.enemy-power-in-range\s*\{[\s\S]*?--enemy-city-ui:\s*#e12635;/.test(stylesSource)
  || !/\.city-node\.enemy\.enemy-power-overpowering\s*\{[\s\S]*?--enemy-city-ui:\s*#59121a;/.test(stylesSource)) {
  throw new Error("Enemy power bands are not using the fixed light, bright, and dark red palette.");
}

if (!source.includes("const attackerStatsBeforeLaunch = createPreparedEconomyStatsSnapshot(attackerEconomy")) {
  throw new Error("Attack launch does not refresh the attacker's server-authoritative King Power.");
}
if (!source.includes("globalStats: defenderGlobalStatsData")) {
  throw new Error("Attack launch does not read the defender's global King Power snapshot.");
}
if (!source.includes("writeParticipantEconomies({") || !source.includes("statsCityPatches: [{ ref: targetRef, city: target, patch: targetPatch }]")) {
  throw new Error("Battle resolution does not refresh both participants after a city battle.");
}
if (!clientSource.includes("function getAuthoritativeCityOwnerKingPowerSnapshot(city)")
  || !clientSource.includes("getAuthoritativeCityOwnerKingPowerSnapshot(target)")) {
  throw new Error("Client demo previews do not require an authoritative opponent King Power snapshot.");
}
if (!clientSource.includes("authoritative: existingIsAuthoritative || (force && identityIsNewer)")
  || !clientSource.includes("fetchedAtMs: force ? Date.now() : existing?.fetchedAtMs || 0")) {
  throw new Error("Map city records can still overwrite or postpone canonical identity refreshes.");
}

console.log("Validated weaker-kingdom protection with King Power v8, directional limits, and objective exemptions.");
