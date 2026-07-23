const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function readConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  if (!match) throw new Error(`Missing ${name}.`);
  return Number(match[1]);
}

for (const name of [
  "HERO_XP_SOFT_CAP_LEVEL",
  "HERO_XP_HARD_CAP_LEVEL",
  "HERO_XP_POST_50_SPAN",
  "HERO_XP_POST_100_SPAN",
  "HERO_XP_POST_50_MULTIPLIER",
  "HERO_XP_POST_100_MULTIPLIER",
  "HERO_XP_POST_50_EXPONENT",
  "HERO_XP_POST_100_EXPONENT",
  "LEVEL_UP_GOLD_EARLY_UPGRADE_SHARE",
  "LEVEL_UP_GOLD_MID_END_UPGRADE_SHARE",
  "LEVEL_UP_GOLD_END_UPGRADE_SHARE",
  "LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS",
  "LEVEL_UP_GOLD_MID_END_PRODUCTION_HOURS",
  "LEVEL_UP_GOLD_END_PRODUCTION_HOURS",
  "LEVEL_UP_TROOP_REWARD_EARLY_BASE_HOURS",
  "LEVEL_UP_TROOP_REWARD_EARLY_HOURS_PER_LEVEL",
  "LEVEL_UP_TROOP_REWARD_MID_BASE_HOURS",
  "LEVEL_UP_TROOP_REWARD_MID_HOURS_PER_LEVEL",
  "LEVEL_UP_TROOP_REWARD_END_BASE_HOURS",
  "LEVEL_UP_TROOP_REWARD_END_HOURS_PER_LEVEL",
  "LEVEL_UP_TROOP_REWARD_MAX_HOURS",
  "BATTLE_XP_TROOP_CREDIT_LEVEL_CAP_MULTIPLIER",
  "BATTLE_XP_EARLY_LEVEL_CAP_RATE",
  "BATTLE_XP_MID_START_LEVEL_CAP_RATE",
  "BATTLE_XP_MID_END_LEVEL_CAP_RATE",
  "BATTLE_XP_END_START_LEVEL_CAP_RATE",
  "BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE",
  "BATTLE_XP_END_CAP_RAMP_LEVELS",
]) {
  const serverValue = readConstant(serverSource, name);
  const clientValue = readConstant(clientSource, name);
  if (serverValue !== clientValue) {
    throw new Error(`${name} differs between server (${serverValue}) and client (${clientValue}).`);
  }
}

requireMatch(
  serverSource,
  /function capBattleXpForHeroLevel[\s\S]*?getBattleXpLevelCapRate/,
  "Server battle XP is not capped against the receiving hero progression phase."
);
requireMatch(
  serverSource,
  /cappedAttackWinXp\s*=\s*capBattleXpForHeroLevel[\s\S]*?attackerXp\s*=\s*result\.success\s*\?\s*cappedAttackWinXp\s*:\s*getPartialBattleXpAward\(cappedAttackWinXp\)/,
  "Attacker defeat XP must be one-third of the capped victory XP."
);
requireMatch(
  serverSource,
  /cappedDefenseHeldXp\s*=\s*capBattleXpForHeroLevel[\s\S]*?defenderXp\s*=\s*result\.success\s*\?\s*getPartialBattleXpAward\(cappedDefenseHeldXp\)\s*:\s*cappedDefenseHeldXp/,
  "Lost-defense XP must be one-third of the capped held-defense XP."
);
requireMatch(
  clientSource,
  /function getXpRequiredForLevel[\s\S]*?HERO_XP_POST_100_MULTIPLIER/,
  "Client XP requirement formula does not include the post-100 scaling."
);
requireMatch(
  serverSource,
  /function getLevelUpGoldReward[\s\S]*?getCityUpgradeCost[\s\S]*?getMillionLordsPassiveGoldPerHour/,
  "Server level-up gold is not tied to upgrade cost and passive production."
);
requireMatch(
  clientSource,
  /function getLevelUpGoldReward[\s\S]*?getCityUpgradeCostAtLevel[\s\S]*?getMillionLordsPassiveGoldPerHour/,
  "Client level-up gold is not tied to upgrade cost and passive production."
);
requireMatch(
  serverSource,
  /function getLevelUpTroopReward[\s\S]*?getCityProductionStats[\s\S]*?getLevelUpTroopRewardHours/,
  "Server level-up troops are not tied to city troop production."
);
requireMatch(
  clientSource,
  /function getLevelUpTroopReward[\s\S]*?getCityStats[\s\S]*?getLevelUpTroopRewardHours/,
  "Client level-up troops are not tied to city troop production."
);

requireMatch(
  serverSource,
  /function creditLevelUpTroopsToMainCity[\s\S]*?getCanonicalMainCityEntry[\s\S]*?appendEconomyCityPatch/,
  "Server level-up troops are not credited to the canonical main city through the economy write path."
);
requireMatch(
  serverSource,
  /exports\.upgradeCity[\s\S]*?creditLevelUpTroopsToMainCity\([\s\S]*?progress\.levelTroopReward/,
  "City-upgrade XP does not credit its level-up troop reward."
);
requireMatch(
  serverSource,
  /attackerLevelTroopReward\s*=\s*creditLevelUpTroopsToMainCity\([\s\S]*?attackerProgress\.levelTroopReward/,
  "Attacker XP does not credit its level-up troop reward."
);
requireMatch(
  serverSource,
  /defenderLevelTroopReward[\s\S]*?creditLevelUpTroopsToMainCity\([\s\S]*?defenderProgress\.levelTroopReward/,
  "Defender XP does not credit its level-up troop reward."
);
requireMatch(
  clientSource,
  /troopsAwarded:\s*Math\.max\(0,\s*Math\.floor\(Number\(report\.troopsAwarded\)/,
  "Synced battle reports do not preserve level-up troop rewards."
);

const constants = Object.fromEntries([
  "HERO_XP_SOFT_CAP_LEVEL",
  "HERO_XP_HARD_CAP_LEVEL",
  "HERO_XP_POST_50_SPAN",
  "HERO_XP_POST_100_SPAN",
  "HERO_XP_POST_50_MULTIPLIER",
  "HERO_XP_POST_100_MULTIPLIER",
  "HERO_XP_POST_50_EXPONENT",
  "HERO_XP_POST_100_EXPONENT",
  "BATTLE_XP_EARLY_LEVEL_CAP_RATE",
  "BATTLE_XP_MID_START_LEVEL_CAP_RATE",
  "BATTLE_XP_MID_END_LEVEL_CAP_RATE",
  "BATTLE_XP_END_START_LEVEL_CAP_RATE",
  "BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE",
  "BATTLE_XP_END_CAP_RAMP_LEVELS",
].map(name => [name, readConstant(serverSource, name)]));

function xpRequired(level) {
  const current = Math.max(1, Math.floor(level));
  const base = 150 + current * 65 + Math.pow(current, 2.05) * 35;
  let multiplier = 1;
  if (current > constants.HERO_XP_SOFT_CAP_LEVEL) {
    multiplier += Math.pow(
      (current - constants.HERO_XP_SOFT_CAP_LEVEL) / constants.HERO_XP_POST_50_SPAN,
      constants.HERO_XP_POST_50_EXPONENT
    ) * constants.HERO_XP_POST_50_MULTIPLIER;
  }
  if (current > constants.HERO_XP_HARD_CAP_LEVEL) {
    multiplier += Math.pow(
      (current - constants.HERO_XP_HARD_CAP_LEVEL) / constants.HERO_XP_POST_100_SPAN,
      constants.HERO_XP_POST_100_EXPONENT
    ) * constants.HERO_XP_POST_100_MULTIPLIER;
  }
  return Math.floor(base * multiplier);
}

function battleCapRate(level) {
  if (level <= constants.HERO_XP_SOFT_CAP_LEVEL) return constants.BATTLE_XP_EARLY_LEVEL_CAP_RATE;
  if (level <= constants.HERO_XP_HARD_CAP_LEVEL) {
    const progress = (level - constants.HERO_XP_SOFT_CAP_LEVEL)
      / (constants.HERO_XP_HARD_CAP_LEVEL - constants.HERO_XP_SOFT_CAP_LEVEL);
    return constants.BATTLE_XP_MID_START_LEVEL_CAP_RATE
      + (constants.BATTLE_XP_MID_END_LEVEL_CAP_RATE - constants.BATTLE_XP_MID_START_LEVEL_CAP_RATE) * progress;
  }
  const progress = Math.min(
    1,
    (level - constants.HERO_XP_HARD_CAP_LEVEL) / constants.BATTLE_XP_END_CAP_RAMP_LEVELS
  );
  return Math.max(
    constants.BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE,
    constants.BATTLE_XP_END_START_LEVEL_CAP_RATE
      + (constants.BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE - constants.BATTLE_XP_END_START_LEVEL_CAP_RATE) * progress
  );
}

assert.equal(battleCapRate(50), 1, "Levels 1-50 should allow one decisive battle to fill one level.");
assert.ok(battleCapRate(75) > 0.6 && battleCapRate(75) < 0.7, "Midgame battle pacing should need about two strong fights.");
assert.equal(battleCapRate(100), 0.5, "Level 100 battle cap should be half a level.");
assert.ok(battleCapRate(101) < 0.3, "Endgame pacing should become challenging immediately after level 100.");
assert.equal(battleCapRate(150), 0.15, "Late endgame battle cap should settle at 15% of a level.");
assert.ok(xpRequired(100) > xpRequired(50) * 10, "Levels 50-100 are not scaling enough.");
assert.ok(xpRequired(150) > xpRequired(100) * 10, "Levels above 100 are not endgame-scaled.");

console.log("Validated three-phase XP pacing and production-based level-up gold/troop relief.");
