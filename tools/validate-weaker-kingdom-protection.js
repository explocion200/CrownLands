const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

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

function readConstant(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!match) throw new Error(`Missing ${name}.`);
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

if (sandbox.GLOBAL_PLAYER_STATS_VERSION !== 5) {
  throw new Error(`Protection is not using King Power v5 (found v${sandbox.GLOBAL_PLAYER_STATS_VERSION}).`);
}
if (sandbox.DEMO_ATTACK_MIN_POWER_RATIO !== 3) {
  throw new Error(`Unexpected protection threshold ${sandbox.DEMO_ATTACK_MIN_POWER_RATIO}.`);
}

const validGlobalPower = sandbox.getPlayerPowerSnapshot({
  profile: { kingPowerVersion: 5, kingPower: 4_000_000, kingPowerUpdatedAtMs: 5000 },
  globalStats: { version: 5, kingPower: 900_000, updatedAtMs: 4000 },
  city: { powerFloor: 300_000 },
});
if (validGlobalPower !== 900_000) {
  throw new Error("A newer mirrored profile snapshot overrides canonical v5 global stats.");
}

const cityFloorPower = sandbox.getPlayerPowerSnapshot({
  profile: { kingPowerVersion: 5, kingPower: 0, kingPowerUpdatedAtMs: 5000 },
  leaderboard: { kingPowerVersion: 5, kingPower: 0, updatedAtMs: 5000 },
  city: { powerFloor: 450_000 },
});
if (cityFloorPower !== 450_000) {
  throw new Error("Missing v5 snapshots do not fall back to the target city's military floor.");
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
if (!clientSource.includes("authoritative: existingIsAuthoritative || force")
  || !clientSource.includes("fetchedAtMs: force ? Date.now() : existing?.fetchedAtMs || 0")) {
  throw new Error("Map city records can still overwrite or postpone canonical identity refreshes.");
}

console.log("Validated weaker-kingdom protection with King Power v5, directional limits, and objective exemptions.");
