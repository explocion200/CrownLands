const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const economyConfig = JSON.parse(fs.readFileSync(path.join(root, "functions", "economy-config.json"), "utf8"));

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
  "HERO_XP_EXPONENTIAL_START_LEVEL",
  "HERO_XP_EXPONENTIAL_GROWTH_RATE",
  "CAPTURE_XP_BASE",
  "CAPTURE_XP_PER_CITY_LEVEL",
  "CAPTURE_XP_PER_DEFENDER",
  "ENEMY_CAPTURE_XP_BONUS",
  "DEFENSE_HELD_XP_BASE",
  "DEFENSE_HELD_XP_PER_ATTACKER",
  "FAILED_BATTLE_XP_RATE",
  "BATTLE_XP_TROOP_CREDIT_CITY_WALL_MULTIPLIER",
  "BATTLE_XP_TROOP_CREDIT_VP_MULTIPLIER",
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

const levelRewardMappings = {
  LEVEL_UP_GOLD_EARLY_UPGRADE_SHARE: "goldEarlyUpgradeShare",
  LEVEL_UP_GOLD_MID_END_UPGRADE_SHARE: "goldMidUpgradeShare",
  LEVEL_UP_GOLD_END_UPGRADE_SHARE: "goldEndgameUpgradeShare",
  LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS: "goldEarlyProductionHours",
  LEVEL_UP_GOLD_MID_END_PRODUCTION_HOURS: "goldMidProductionHours",
  LEVEL_UP_GOLD_END_PRODUCTION_HOURS: "goldEndgameProductionHours",
  LEVEL_UP_TROOP_REWARD_EARLY_BASE_HOURS: "troopEarlyBaseHours",
  LEVEL_UP_TROOP_REWARD_EARLY_HOURS_PER_LEVEL: "troopEarlyHoursPerLevel",
  LEVEL_UP_TROOP_REWARD_MID_BASE_HOURS: "troopMidBaseHours",
  LEVEL_UP_TROOP_REWARD_MID_HOURS_PER_LEVEL: "troopMidHoursPerLevel",
  LEVEL_UP_TROOP_REWARD_END_BASE_HOURS: "troopEndgameBaseHours",
  LEVEL_UP_TROOP_REWARD_END_HOURS_PER_LEVEL: "troopEndgameHoursPerLevel",
  LEVEL_UP_TROOP_REWARD_MAX_HOURS: "troopMaximumHours",
};
for (const [constantName, configKey] of Object.entries(levelRewardMappings)) {
  assert.ok(Number.isFinite(Number(economyConfig.levelRewards?.[configKey])), `Missing levelRewards.${configKey}.`);
  const pattern = new RegExp(`const\\s+${constantName}\\s*=\\s*economyNumber\\("levelRewards\\.${configKey}"`);
  requireMatch(serverSource, pattern, `Server ${constantName} is not read from the economy configuration.`);
  requireMatch(clientSource, pattern, `Client ${constantName} is not read from the economy configuration.`);
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
  /cappedDefenseHeldXp\s*=\s*(?:Math\.floor\(\s*)?capBattleXpForHeroLevel[\s\S]*?defenderXp\s*=\s*result\.success\s*\?\s*getPartialBattleXpAward\(cappedDefenseHeldXp\)\s*:\s*cappedDefenseHeldXp/,
  "Lost-defense XP must be one-third of the capped held-defense XP after any protected-defense multiplier."
);
requireMatch(
  clientSource,
  /function getXpRequiredForLevel[\s\S]*?HERO_XP_EXPONENTIAL_GROWTH_RATE/,
  "Client XP requirement formula does not include the post-25 exponential scaling."
);
requireMatch(
  serverSource,
  /function getBattleXpTroopCredit[\s\S]*?getXpRequiredForLevel\(stats\.level\)\s*\*\s*BATTLE_XP_TROOP_CREDIT_LEVEL_CAP_MULTIPLIER/,
  "Server battle troop credit is not bounded by the target-level XP allowance."
);
requireMatch(
  clientSource,
  /function getBattleXpTroopCreditCap[\s\S]*?getXpRequiredForLevel\(stats\.level\)\s*\*\s*BATTLE_XP_TROOP_CREDIT_LEVEL_CAP_MULTIPLIER/,
  "Client battle troop credit preview is missing the server target-level XP allowance."
);
requireMatch(
  serverSource,
  /function getCaptureXpAward[\s\S]*?const troopXp[\s\S]*?const cityXp\s*=\s*getCaptureXpCooldownRemainingMs[\s\S]*?\?\s*0[\s\S]*?return Math\.floor\(\(cityXp \+ troopXp\) \* efficiency\)/,
  "Server capture cooldown must remove only fixed city XP while preserving troop-loss XP."
);
requireMatch(
  clientSource,
  /function getCaptureXpAward[\s\S]*?const troopXp[\s\S]*?const cityXp\s*=\s*getCaptureCooldownRemaining[\s\S]*?\?\s*0[\s\S]*?return capBattleXpForCurrentLevel\(Math\.floor\(\(cityXp \+ troopXp\) \* efficiency\)\)/,
  "Client capture preview must remove only fixed city XP while preserving troop-loss XP."
);
assert.doesNotMatch(
  clientSource,
  /RECENT_CAPTURE_XP_MULTIPLIER/,
  "Client still applies a blanket recent-capture XP multiplier."
);
requireMatch(
  serverSource,
  /defenseOpponentXpMultiplier\s*=\s*attackProtection[\s\S]*?getOpponentPowerXpMultiplier\(attackerKingPowerForXp\s*\/\s*defenderKingPowerForXp\)/,
  "Server defense XP does not use the same relative-power bands as the client."
);
requireMatch(
  serverSource,
  /getCaptureXpAward\([\s\S]*?attackerKingPower:\s*attackerKingPowerForXp[\s\S]*?defenderKingPower:\s*defenderKingPowerForXp/,
  "Server attacker XP is not based on the army's authoritative King Power snapshots."
);
requireMatch(
  clientSource,
  /getFailedAttackXpAward\(target,\s*target\.owner,\s*result\.defenderLosses/,
  "Client battle preview does not use actual predicted defender losses for defeat XP."
);
requireMatch(
  serverSource,
  /getCaptureXpAward\(target,\s*oldOwnerUid,\s*result\.defenderLosses/,
  "Server battle settlement does not use actual defender losses for attacker XP."
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
const serverUpgradeCitySource = serverSource.match(
  /exports\.upgradeCity[\s\S]*?(?=exports\.relinquishCity)/
)?.[0] || "";
const clientUpgradeCitySource = clientSource.match(
  /async function upgradeCity[\s\S]*?(?=function fortifyCity)/
)?.[0] || "";
assert.doesNotMatch(
  serverSource,
  /CITY_UPGRADE_XP|getCityUpgradeXpAward/,
  "Server still defines city-upgrade XP."
);
assert.doesNotMatch(
  clientSource,
  /CITY_UPGRADE_XP|getCityUpgradeXpAward/,
  "Client still defines city-upgrade XP."
);
assert.doesNotMatch(
  serverUpgradeCitySource,
  /buildPlayerProgressPatch|creditLevelUpTroopsToMainCity|xpAwarded|troopsAwarded/,
  "Server city upgrades must not award hero XP or level-up troops."
);
assert.doesNotMatch(
  clientUpgradeCitySource,
  /addCharacterXp|xpAward|troopsAwarded/,
  "Client city upgrades must not award hero XP or level-up troops."
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
  "HERO_XP_EXPONENTIAL_START_LEVEL",
  "HERO_XP_EXPONENTIAL_GROWTH_RATE",
  "BATTLE_XP_EARLY_LEVEL_CAP_RATE",
  "BATTLE_XP_MID_START_LEVEL_CAP_RATE",
  "BATTLE_XP_MID_END_LEVEL_CAP_RATE",
  "BATTLE_XP_END_START_LEVEL_CAP_RATE",
  "BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE",
  "BATTLE_XP_END_CAP_RAMP_LEVELS",
].map(name => [name, readConstant(serverSource, name)]));

function xpRequired(level) {
  const current = Math.max(1, Math.floor(level));
  const legacyRequirement = value => Math.floor(
    150 + value * 65 + Math.pow(value, 2.05) * 35
  );
  if (current <= constants.HERO_XP_EXPONENTIAL_START_LEVEL) return legacyRequirement(current);
  const anchor = legacyRequirement(constants.HERO_XP_EXPONENTIAL_START_LEVEL);
  const requirement = anchor * Math.pow(
    constants.HERO_XP_EXPONENTIAL_GROWTH_RATE,
    current - constants.HERO_XP_EXPONENTIAL_START_LEVEL
  );
  if (!Number.isFinite(requirement)) return Number.MAX_SAFE_INTEGER;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(requirement)
  );
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
assert.equal(battleCapRate(51), 0.99, "The post-50 cap should decline smoothly without a cliff.");
assert.equal(battleCapRate(75), 0.75, "Level 75 should allow up to 75% of one level per battle.");
assert.equal(battleCapRate(100), 0.5, "Level 100 battle cap should be half a level.");
assert.equal(battleCapRate(101), 0.497, "The post-100 cap should decline smoothly without a cliff.");
assert.equal(battleCapRate(125), 0.425, "Level 125 should allow up to 42.5% of one level per battle.");
assert.equal(battleCapRate(150), 0.35, "Late endgame battle cap should settle at 35% of a level.");
assert.equal(battleCapRate(200), 0.35, "The late-game cap floor must remain stable.");
assert.equal(xpRequired(25), 27469, "The current level-25 progression anchor changed.");
assert.equal(xpRequired(50), 297618, "Level 50 does not use the recommended 10% post-25 curve.");
assert.equal(xpRequired(75), 3224609, "Level 75 does not use the recommended 10% post-25 curve.");
assert.equal(xpRequired(100), 34937693, "Level 100 does not use the recommended 10% post-25 curve.");
assert.equal(xpRequired(150), 4101365691, "Level 150 does not use the recommended 10% post-25 curve.");
assert.equal(xpRequired(500), Number.MAX_SAFE_INTEGER, "Extreme hero levels must stay within safe integer bounds.");
assert.ok(xpRequired(100) > xpRequired(50) * 10, "Levels 50-100 are not scaling enough.");
assert.ok(xpRequired(150) > xpRequired(100) * 10, "Levels above 100 are not endgame-scaled.");

console.log("Validated aligned battle XP, smooth caps, post-25 progression, battle-only XP, and level-up relief.");
