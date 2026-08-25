const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = `${fs.readFileSync(path.join(root, "instant-economy-actions.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}`;
const economyConfig = JSON.parse(fs.readFileSync(path.join(root, "functions", "economy-config.json"), "utf8"));
const browserEconomySource = fs.readFileSync(path.join(root, "economy-config.js"), "utf8");
const browserEconomyConfig = JSON.parse(browserEconomySource.slice(
  browserEconomySource.indexOf("{"),
  browserEconomySource.lastIndexOf("};") + 1
));

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
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
  LEVEL_UP_GOLD_FLOOR_BASE: "goldFloorBase",
  LEVEL_UP_GOLD_FLOOR_PER_LEVEL: "goldFloorPerLevel",
  LEVEL_UP_GOLD_FLOOR_EXPONENT: "goldFloorExponent",
  LEVEL_UP_GOLD_FLOOR_EXPONENT_SCALE: "goldFloorExponentScale",
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
assert.deepEqual(
  browserEconomyConfig.levelRewards,
  economyConfig.levelRewards,
  "Browser and server level-up reward configuration differ."
);
assert.deepEqual(
  {
    troopEarlyBaseHours: economyConfig.levelRewards.troopEarlyBaseHours,
    troopEarlyHoursPerLevel: economyConfig.levelRewards.troopEarlyHoursPerLevel,
    troopMidBaseHours: economyConfig.levelRewards.troopMidBaseHours,
    troopMidHoursPerLevel: economyConfig.levelRewards.troopMidHoursPerLevel,
    troopEndgameBaseHours: economyConfig.levelRewards.troopEndgameBaseHours,
    troopEndgameHoursPerLevel: economyConfig.levelRewards.troopEndgameHoursPerLevel,
    troopMaximumHours: economyConfig.levelRewards.troopMaximumHours,
  },
  {
    troopEarlyBaseHours: 4,
    troopEarlyHoursPerLevel: 0.4,
    troopMidBaseHours: 24,
    troopMidHoursPerLevel: 0.6,
    troopEndgameBaseHours: 54,
    troopEndgameHoursPerLevel: 0.4,
    troopMaximumHours: 108,
  },
  "The approved Hero troop-reward curve configuration changed."
);

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
  /function getCaptureXpAward[\s\S]*?const troopXp[\s\S]*?const cityXp\s*=\s*CAPTURE_XP_BASE[\s\S]*?CAPTURE_XP_PER_CITY_LEVEL[\s\S]*?ENEMY_CAPTURE_XP_BONUS[\s\S]*?return Math\.floor\(\(cityXp \+ troopXp\) \* efficiency\)/,
  "Server captures must always include fixed city XP alongside troop-loss XP."
);
requireMatch(
  clientSource,
  /function getCaptureXpAward[\s\S]*?const troopXp[\s\S]*?const cityXp\s*=\s*CAPTURE_XP_BASE[\s\S]*?CAPTURE_XP_PER_CITY_LEVEL[\s\S]*?ownerBonus[\s\S]*?return capBattleXpForCurrentLevel\(Math\.floor\(\(cityXp \+ troopXp\) \* efficiency\)\)/,
  "Client capture preview must always include fixed city XP alongside troop-loss XP."
);
assert.doesNotMatch(serverSource, /CAPTURE_XP_COOLDOWN|getCaptureXpCooldownRemainingMs/, "Server still contains the capture-XP cooldown.");
assert.doesNotMatch(clientSource, /CAPTURE_XP_COOLDOWN|getCaptureCooldownRemaining|City XP cooldown|Recent capture cooldown/, "Client still contains the capture-XP cooldown.");
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
  /function getLevelUpGoldFloor[\s\S]*?LEVEL_UP_GOLD_FLOOR_BASE[\s\S]*?function getLevelUpGoldReward[\s\S]*?getCityUpgradeCost[\s\S]*?getMillionLordsPassiveGoldPerHour/,
  "Server level-up gold is not tied to its configured floor, upgrade cost, and passive production."
);
requireMatch(
  clientSource,
  /function getLevelUpGoldFloor[\s\S]*?LEVEL_UP_GOLD_FLOOR_BASE[\s\S]*?function getLevelUpGoldReward[\s\S]*?getCityUpgradeCostAtLevel[\s\S]*?getMillionLordsPassiveGoldPerHour/,
  "Client level-up gold is not tied to its configured floor, upgrade cost, and passive production."
);
const serverLevelUpTroopRewardSource = extractFunction(serverSource, "getLevelUpTroopReward");
const clientLevelUpTroopRewardSource = extractFunction(clientSource, "getLevelUpTroopReward");
requireMatch(
  serverLevelUpTroopRewardSource,
  /getCityProductionStats\(\{ level: current \}, \{\}, \{\}, \{[\s\S]*?includeWarDrums: false[\s\S]*?includeRoyalTaxDecree: false/,
  "Server level-up troops are not derived from an unmodified reference city at the new Hero level."
);
requireMatch(
  clientLevelUpTroopRewardSource,
  /getCityStats\(\{ level: current \}, \{[\s\S]*?includeSkillBoosts: false[\s\S]*?includeTimedItemBoosts: false/,
  "Client level-up troops are not derived from an unmodified reference city at the new Hero level."
);
assert.doesNotMatch(
  serverLevelUpTroopRewardSource,
  /profile|economy|mainCity|cityEntry|getCanonicalMainCity/,
  "Server level-up troop calculation consults player or destination-city state."
);
assert.doesNotMatch(
  clientLevelUpTroopRewardSource,
  /state|mainCity|cityById|getMainRewardCity/,
  "Client level-up troop calculation consults player or destination-city state."
);

requireMatch(
  serverSource,
  /function creditLevelUpTroopsToMainCity[\s\S]*?getCanonicalMainCityEntry[\s\S]*?appendEconomyCityPatch/,
  "Server level-up troops are not credited to the canonical main city through the economy write path."
);
const serverUpgradeCitySource = serverSource.match(
  /exports\.upgradeCity[\s\S]*?(?=exports\.relinquishCity)/
)?.[0] || "";
const clientUpgradeCitySource = extractFunction(clientSource, "upgradeCity");
assert.deepEqual(
  browserEconomyConfig.cityUpgradeXp,
  economyConfig.cityUpgradeXp,
  "Browser and server city-upgrade XP configuration differ."
);
for (const key of [
  "modelVersion",
  "fixedXpRate",
  "capStartHeroLevel",
  "capMaximumHeroLevel",
  "capStartLevelEquivalents",
  "capMaximumLevelEquivalents",
]) {
  assert.ok(Number.isFinite(Number(economyConfig.cityUpgradeXp?.[key])), `Missing cityUpgradeXp.${key}.`);
}
assert.equal(economyConfig.cityUpgradeXp.enabled, true, "City-upgrade XP is not enabled.");
assert.equal(
  economyConfig.cityUpgradeXp.legacyRequestsEnabled,
  true,
  "The temporary legacy city-upgrade compatibility window is not enabled."
);
requireMatch(
  serverSource,
  /function getCityUpgradeFixedXp[\s\S]*?getXpRequiredForLevel\(level\) \* CITY_UPGRADE_XP_FIXED_RATE/,
  "Server city-upgrade XP is not fixed from the source city level's XP requirement."
);
requireMatch(
  clientSource,
  /function getCityUpgradeFixedXp[\s\S]*?getXpRequiredForLevel\(level\) \* CITY_UPGRADE_XP_FIXED_RATE/,
  "Client city-upgrade XP preview does not mirror the fixed server formula."
);
requireMatch(
  serverSource,
  /function getCityUpgradeXpDailyCap[\s\S]*?wholeLevels[\s\S]*?getXpRequiredForLevel\(referenceLevel \+ offset\)[\s\S]*?fractionalLevel/,
  "The city-upgrade daily cap does not sum exact successive level requirements."
);
requireMatch(
  serverUpgradeCitySource,
  /const cityUpgradeXpCalculation = legacyRequest[\s\S]*?: calculateCityUpgradeXpReceipt[\s\S]*?const progress = legacyRequest \? null : buildPlayerProgressPatch[\s\S]*?creditLevelUpTroopsToMainCity[\s\S]*?finalizeLevelUpReward/,
  "Server city upgrades do not pass awarded XP through the normal Hero-level reward path."
);
requireMatch(
  serverUpgradeCitySource,
  /createCityUpgradePlan\(city, goldFloat[\s\S]*?const cityUpgradeXpCalculation[\s\S]*?buildPlayerProgressPatch/,
  "Hero level-up Gold could affect affordability inside the same city-upgrade request."
);
requireMatch(
  serverUpgradeCitySource,
  /legacyRequest \? null : cityUpgradeRequestRef[\s\S]*?requestSnap\?\.exists[\s\S]*?if \(requestRef\)[\s\S]*?transaction\.set\(requestRef/,
  "City upgrades are not replay-safe under retry or concurrency."
);
requireMatch(
  serverUpgradeCitySource,
  /cityUpgradeXpHighWatermarkRef[\s\S]*?highestDevelopedCityLevel[\s\S]*?transaction\.set\(highWatermarkRef/,
  "City upgrades do not persist the seasonal per-city high-watermark."
);
requireMatch(
  clientSource,
  /getCityUpgradeXpPreview[\s\S]*?getCityUpgradeXpWarning[\s\S]*?window\.confirm/,
  "The client does not warn before committing suppressed city-upgrade XP."
);
requireMatch(
  serverUpgradeCitySource,
  /cityUpgradeXpCalculation\.capSuppressedXp > acknowledgedCapSuppressedXp[\s\S]*?cityUpgradeXpCalculation\.rebuildSuppressedXp > acknowledgedRebuildSuppressedXp[\s\S]*?city-upgrade-xp-warning-required/,
  "The server does not reject city XP suppression beyond the player's acknowledged preview."
);
requireMatch(
  clientSource,
  /const acknowledgedCapSuppressedXp[\s\S]*?previewReceipt\.capSuppressedXp[\s\S]*?const acknowledgedRebuildSuppressedXp[\s\S]*?previewReceipt\.rebuildSuppressedXp/,
  "The client does not preserve the accepted city XP suppression amounts."
);
requireMatch(
  clientSource,
  /getOnlineApi\(\)\.upgradeCity\([\s\S]*?acknowledgedCapSuppressedXp[\s\S]*?acknowledgedRebuildSuppressedXp/,
  "The client does not send city XP suppression acknowledgements to the authoritative upgrade."
);
requireMatch(
  clientSource,
  /function hasPendingServerCityUpgrade[\s\S]*?already has an upgrade pending/,
  "The client can queue a stale second city XP preview behind an unresolved upgrade."
);
requireMatch(
  serverUpgradeCitySource,
  /legacyRequest[\s\S]*?calculateLegacyCityUpgradeXpReceipt[\s\S]*?legacyCityUpgradeRequest/,
  "Legacy city upgrades do not use the explicit zero-XP compatibility receipt."
);
requireMatch(
  serverUpgradeCitySource,
  /upgradeRequestCompatibility\.allowed[\s\S]*?Update Crownlands to the latest version[\s\S]*?legacyRequestsEnabled:\s*false/,
  "Disabled legacy compatibility does not return an update-required error before the transaction."
);
requireMatch(
  clientSource,
  /function getCityUpgradeFailureMessage[\s\S]*?city-upgrade-client-update-required[\s\S]*?Update Crownlands to the latest version/,
  "The client does not translate the legacy shutdown response into a player-friendly update message."
);
requireMatch(
  serverUpgradeCitySource,
  /type:\s*"CITY_UPGRADED"[\s\S]*?levelsGained:\s*(?:plan\.)?upgraded/,
  "City-upgrade mission and achievement events no longer carry the upgraded level count."
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
requireMatch(
  serverSource,
  /while\s*\(next\.xp\s*>=\s*getXpRequiredForLevel\(next\.level\)\)[\s\S]*?next\.level\s*\+=\s*1[\s\S]*?goldReward\s*\+=\s*getLevelUpGoldReward\(next\.level\)[\s\S]*?troopReward\s*\+=\s*getLevelUpTroopReward\(next\.level\)/,
  "Server multi-level XP awards must add each crossed level reward exactly once."
);
requireMatch(
  clientSource,
  /for\s*\(let level = startLevel \+ 1; level <= endLevel; level \+= 1\)[\s\S]*?calculatedGold\s*\+=\s*getLevelUpGoldReward\(level\)[\s\S]*?calculatedTroops\s*\+=\s*getLevelUpTroopReward\(level\)/,
  "Client multi-level reward bundles must add each crossed level reward exactly once."
);
requireMatch(
  serverSource,
  /function applyXpToCharacter[\s\S]*?levelUpReward:\s*levelsGained > 0[\s\S]*?goldAwarded:\s*goldReward[\s\S]*?function finalizeLevelUpReward/,
  "The server does not create an explicit receipt for genuine level gains."
);
requireMatch(
  serverSource,
  /profilePatchForCaller[\s\S]*?attackerPatch\.levelUpReward[\s\S]*?defenderPatch\.levelUpReward/,
  "Combat responses do not carry the authoritative level-up receipt."
);
requireMatch(
  serverSource,
  /function makeReport\([\s\S]*?levelUpReward = null[\s\S]*?levelUpReward:\s*levelUpReward/,
  "Battle reports do not preserve the authoritative level-up receipt."
);
requireMatch(
  clientSource,
  /function applyServerProfilePatch[\s\S]*?getLevelUpRewardAnnouncement\(patch, previousLevel, options\)[\s\S]*?if \(levelUpReward\)/,
  "Profile synchronization can still open the prompt without an explicit level-up receipt."
);
requireMatch(
  clientSource,
  /if \(shouldNotify && normalized\.levelUpReward\)[\s\S]*?queueLevelUpReward/,
  "New asynchronous battle level-ups do not queue their verified reward prompt."
);
assert.doesNotMatch(
  clientSource,
  /const levelRewardReport = Array\.isArray\(result\.reports\)/,
  "The client still guesses level-up rewards from the newest generic battle report."
);

const promptSandbox = {
  Math,
  Number,
  String,
  normalizeRegionId: value => String(value || "center").trim().toLowerCase(),
};
vm.createContext(promptSandbox);
vm.runInContext(
  `${extractFunction(clientSource, "normalizeLevelUpRewardReceipt")};`
  + `${extractFunction(clientSource, "getLevelUpRewardAnnouncement")};`
  + "this.normalizeLevelUpRewardReceipt = normalizeLevelUpRewardReceipt;"
  + "this.getLevelUpRewardAnnouncement = getLevelUpRewardAnnouncement;",
  promptSandbox,
  { filename: "game.js" }
);

const verifiedReceipt = {
  fromLevel: 24,
  toLevel: 25,
  levelsGained: 1,
  skillPointsAwarded: 1,
  goldAwarded: 8986,
  troopsAwarded: 36400,
  cityId: "center_1",
  cityName: "Ashford",
  regionId: "center",
};
assert.equal(
  promptSandbox.getLevelUpRewardAnnouncement({ character: { level: 25 } }, 24, {}),
  null,
  "A profile correction without a level-up receipt can open the prompt."
);
assert.equal(
  promptSandbox.getLevelUpRewardAnnouncement(
    { character: { level: 25 }, levelUpReward: verifiedReceipt },
    25,
    {}
  ),
  null,
  "A replayed receipt can reopen the prompt when the level did not increase."
);
assert.equal(
  promptSandbox.getLevelUpRewardAnnouncement(
    { character: { level: 26 }, levelUpReward: verifiedReceipt },
    25,
    {}
  ),
  null,
  "A receipt for a different destination level can open the prompt."
);
const verifiedAnnouncement = promptSandbox.getLevelUpRewardAnnouncement(
  { character: { level: 25 }, levelUpReward: verifiedReceipt },
  24,
  {}
);
assert.deepEqual(
  { ...verifiedAnnouncement },
  {
    fromLevel: 24,
    toLevel: 25,
    levelsGained: 1,
    skillPoints: 1,
    gold: 8986,
    troops: 36400,
    cityId: "center_1",
    cityName: "Ashford",
    regionId: "center",
  },
  "The prompt does not display the exact authoritative level-up receipt."
);
assert.equal(
  promptSandbox.getLevelUpRewardAnnouncement(
    { character: { level: 25 }, levelUpReward: verifiedReceipt },
    24,
    { announceLevelUp: false }
  ),
  null,
  "Callers cannot explicitly suppress a level-up prompt."
);

const serverReceiptSandbox = {
  Math,
  Number,
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  safeString(value, maxLength = 160) {
    return String(value || "").trim().slice(0, maxLength);
  },
  normalizeRegionId(value = "") {
    return String(value || "center").trim().toLowerCase() || "center";
  },
};
vm.createContext(serverReceiptSandbox);
vm.runInContext(
  `${extractFunction(serverSource, "finalizeLevelUpReward")};`
  + "this.finalizeLevelUpReward = finalizeLevelUpReward;",
  serverReceiptSandbox,
  { filename: "functions/index.js" }
);
const serverProgress = { levelUpReward: { ...verifiedReceipt, troopsAwarded: 99999 } };
const finalizedReceipt = serverReceiptSandbox.finalizeLevelUpReward(serverProgress, {
  credited: 36400,
  cityId: "center_1",
  cityName: "Ashford",
  regionId: "center",
});
assert.equal(finalizedReceipt.troopsAwarded, 36400, "The receipt shows calculated troops instead of the amount actually credited.");
assert.equal(finalizedReceipt.cityId, "center_1");
assert.equal(finalizedReceipt.cityName, "Ashford");
assert.equal(serverReceiptSandbox.finalizeLevelUpReward({}, null), null, "A non-level-up progress result creates a receipt.");

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

const cityUpgradeXpConfig = economyConfig.cityUpgradeXp;
const cityUpgradeSandbox = {
  Math,
  Number,
  CITY_UPGRADE_XP_ENABLED: cityUpgradeXpConfig.enabled,
  CITY_UPGRADE_XP_MODEL_VERSION: cityUpgradeXpConfig.modelVersion,
  CITY_UPGRADE_XP_LEGACY_REQUESTS_ENABLED: cityUpgradeXpConfig.legacyRequestsEnabled,
  CITY_UPGRADE_XP_FIXED_RATE: cityUpgradeXpConfig.fixedXpRate,
  CITY_UPGRADE_XP_CAP_START_HERO_LEVEL: cityUpgradeXpConfig.capStartHeroLevel,
  CITY_UPGRADE_XP_CAP_MAXIMUM_HERO_LEVEL: cityUpgradeXpConfig.capMaximumHeroLevel,
  CITY_UPGRADE_XP_CAP_START_LEVEL_EQUIVALENTS: cityUpgradeXpConfig.capStartLevelEquivalents,
  CITY_UPGRADE_XP_CAP_MAXIMUM_LEVEL_EQUIVALENTS: cityUpgradeXpConfig.capMaximumLevelEquivalents,
  HERO_XP_EXPONENTIAL_START_LEVEL: constants.HERO_XP_EXPONENTIAL_START_LEVEL,
  HERO_XP_EXPONENTIAL_GROWTH_RATE: constants.HERO_XP_EXPONENTIAL_GROWTH_RATE,
  CHARACTER_START_LEVEL: 1,
  CHARACTER_START_XP: 0,
  RESET_GENERATION: "test-season",
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  safeString(value, maxLength = 160) {
    return String(value || "").trim().slice(0, maxLength);
  },
};
vm.createContext(cityUpgradeSandbox);
vm.runInContext(
  [
    "getXpRequiredForLevel",
    "normalizeCharacterProgress",
    "getCityUpgradeFixedXp",
    "getCityUpgradeXpCapLevelEquivalents",
    "getCityUpgradeXpDailyCap",
    "getXpNeededToReachHeroLevel",
    "normalizeCityUpgradeXpDailyState",
    "calculateCityUpgradeXpReceipt",
    "calculateLegacyCityUpgradeXpReceipt",
    "resolveCityUpgradeRequestCompatibility",
  ].map(name => extractFunction(serverSource, name)).join("\n")
    + "\nthis.cityUpgradeFixedXp = getCityUpgradeFixedXp;"
    + "\nthis.cityUpgradeDailyCap = getCityUpgradeXpDailyCap;"
    + "\nthis.calculateCityUpgradeXpReceipt = calculateCityUpgradeXpReceipt;"
    + "\nthis.calculateLegacyCityUpgradeXpReceipt = calculateLegacyCityUpgradeXpReceipt;"
    + "\nthis.resolveCityUpgradeRequestCompatibility = resolveCityUpgradeRequestCompatibility;",
  cityUpgradeSandbox,
  { filename: "functions/index.js" }
);

const cityXpAnchors = new Map([
  [1, 12],
  [10, 236],
  [25, 1373],
  [50, 14880],
  [75, 161230],
  [100, 1746884],
  [125, 18926982],
  [150, 205068284],
]);
for (const [level, expected] of cityXpAnchors) {
  assert.equal(cityUpgradeSandbox.cityUpgradeFixedXp(level), expected, `City level ${level} XP anchor changed.`);
}

const cityCapAnchors = new Map([
  [50, 297618],
  [60, 941773],
  [75, 4998144],
  [90, 25323586],
  [100, 73369156],
  [150, 8612867951],
]);
for (const [level, expected] of cityCapAnchors) {
  assert.equal(cityUpgradeSandbox.cityUpgradeDailyCap(level), expected, `Hero level ${level} city XP cap changed.`);
}
assert.equal(
  cityUpgradeSandbox.cityUpgradeDailyCap(60),
  xpRequired(60) + Math.floor(xpRequired(61) * 0.2),
  "Fractional city XP caps are not calculated from the exact next requirement."
);

const modernCityUpgradeRequest = cityUpgradeSandbox.resolveCityUpgradeRequestCompatibility("modern-request-1");
assert.equal(modernCityUpgradeRequest.legacyRequest, false, "A request ID was misclassified as legacy.");
assert.equal(modernCityUpgradeRequest.allowed, true, "A modern city-upgrade request was blocked.");
const enabledLegacyCityUpgradeRequest = cityUpgradeSandbox.resolveCityUpgradeRequestCompatibility("");
assert.equal(enabledLegacyCityUpgradeRequest.legacyRequest, true, "A missing request ID was not classified as legacy.");
assert.equal(enabledLegacyCityUpgradeRequest.allowed, true, "The temporary legacy compatibility window is not honored.");
const disabledLegacyCityUpgradeRequest = cityUpgradeSandbox.resolveCityUpgradeRequestCompatibility("", false);
assert.equal(disabledLegacyCityUpgradeRequest.allowed, false, "A disabled legacy request was still accepted.");
assert.equal(
  disabledLegacyCityUpgradeRequest.reason,
  "city-upgrade-client-update-required",
  "The disabled legacy request did not return the stable update-required reason."
);

const legacyCityXp = cityUpgradeSandbox.calculateLegacyCityUpgradeXpReceipt({
  dayKey: "2026-08-25",
  startingCityLevel: 5,
  endingCityLevel: 7,
  highestDevelopedCityLevel: 5,
});
assert.equal(legacyCityXp.rawXp, 0, "A legacy city upgrade exposed raw awardable XP.");
assert.equal(legacyCityXp.awardedXp, 0, "A legacy city upgrade awarded Hero XP.");
assert.equal(
  legacyCityXp.legacySuppressedXp,
  cityUpgradeSandbox.cityUpgradeFixedXp(5) + cityUpgradeSandbox.cityUpgradeFixedXp(6),
  "The legacy compatibility receipt did not account for every skipped level."
);
assert.equal(legacyCityXp.dailyState, null, "A legacy city upgrade consumed or froze the daily city-XP allowance.");
assert.equal(legacyCityXp.highestDevelopedCityLevel, 7, "A legacy city upgrade did not advance the high-watermark.");

const missingWatermark = cityUpgradeSandbox.calculateCityUpgradeXpReceipt({
  character: { level: 10, xp: 0 },
  dayKey: "2026-08-25",
  startingCityLevel: 5,
  endingCityLevel: 7,
  highestDevelopedCityLevel: null,
});
assert.deepEqual(Array.from(missingWatermark.eligibleLevels), [6, 7], "First encounter did not baseline at the current city level.");
assert.deepEqual(Array.from(missingWatermark.ineligibleLevels), [], "First encounter treated new levels as rebuilds.");
assert.equal(
  missingWatermark.rawXp,
  cityUpgradeSandbox.cityUpgradeFixedXp(5) + cityUpgradeSandbox.cityUpgradeFixedXp(6),
  "Bulk city XP is not summed one crossed level at a time."
);

const rebuild = cityUpgradeSandbox.calculateCityUpgradeXpReceipt({
  character: { level: 10, xp: 0 },
  dayKey: "2026-08-25",
  startingCityLevel: 5,
  endingCityLevel: 8,
  highestDevelopedCityLevel: 7,
});
assert.deepEqual(Array.from(rebuild.eligibleLevels), [8], "A newly exceeded high-watermark did not award XP.");
assert.deepEqual(Array.from(rebuild.ineligibleLevels), [6, 7], "Rebuilt levels were not suppressed.");
assert.equal(rebuild.highestDevelopedCityLevel, 8, "The high-watermark did not advance through the bulk upgrade.");

const uncappedBelow50 = cityUpgradeSandbox.calculateCityUpgradeXpReceipt({
  character: { level: 49, xp: 0 },
  dayKey: "2026-08-25",
  startingCityLevel: 1,
  endingCityLevel: 2,
});
assert.equal(uncappedBelow50.awardedXp, uncappedBelow50.rawXp, "XP was capped while the Hero remained below level 50.");
assert.equal(uncappedBelow50.dailyCapActive, false, "A below-50 award incorrectly froze a daily cap.");

const crossingLevel50 = cityUpgradeSandbox.calculateCityUpgradeXpReceipt({
  character: { level: 49, xp: xpRequired(49) - 1 },
  dayKey: "2026-08-25",
  startingCityLevel: 1,
  endingCityLevel: 2,
});
assert.equal(crossingLevel50.awardedXp, crossingLevel50.rawXp, "The level-50 boundary discarded XP before the cap was full.");
assert.equal(crossingLevel50.dailyAwardedXp, crossingLevel50.rawXp - 1, "Only post-boundary XP should consume the cap.");
assert.equal(crossingLevel50.capReferenceHeroLevel, 50, "Crossing level 50 did not freeze the cap at level 50.");

const capAt50 = cityUpgradeSandbox.calculateCityUpgradeXpReceipt({
  character: { level: 50, xp: 0 },
  dayKey: "2026-08-25",
  startingCityLevel: 150,
  endingCityLevel: 151,
});
assert.equal(capAt50.awardedXp, cityCapAnchors.get(50), "Level-50 city XP cap was not enforced.");
assert.ok(capAt50.capSuppressedXp > 0, "Excess capped XP was not discarded.");
assert.equal(capAt50.dailyRemainingXp, 0, "A full cap still reports remaining city XP.");

const partialCap = cityUpgradeSandbox.calculateCityUpgradeXpReceipt({
  character: { level: 60, xp: 0 },
  dailyState: {
    modelVersion: cityUpgradeXpConfig.modelVersion,
    resetGeneration: "test-season",
    dayKey: "2026-08-25",
    capReferenceHeroLevel: 60,
    dailyCapXp: cityCapAnchors.get(60),
    dailyAwardedXp: cityCapAnchors.get(60) - 7,
  },
  dayKey: "2026-08-25",
  startingCityLevel: 150,
  endingCityLevel: 151,
});
assert.equal(partialCap.awardedXp, 7, "A partially remaining daily cap was not consumed exactly.");
assert.equal(partialCap.capSuppressedXp, partialCap.rawXp - 7, "Partial-cap suppression was not reported exactly.");

const frozenCap = cityUpgradeSandbox.calculateCityUpgradeXpReceipt({
  character: { level: 90, xp: 0 },
  dailyState: {
    modelVersion: cityUpgradeXpConfig.modelVersion,
    resetGeneration: "test-season",
    dayKey: "2026-08-25",
    capReferenceHeroLevel: 60,
    dailyCapXp: cityCapAnchors.get(60),
    dailyAwardedXp: 0,
  },
  dayKey: "2026-08-25",
  startingCityLevel: 150,
  endingCityLevel: 151,
});
assert.equal(frozenCap.capReferenceHeroLevel, 60, "The daily cap reference changed after other Hero XP gains.");
assert.equal(frozenCap.dailyCapXp, cityCapAnchors.get(60), "The frozen daily allowance was recalculated mid-day.");

const utcReset = cityUpgradeSandbox.calculateCityUpgradeXpReceipt({
  character: { level: 60, xp: 0 },
  dailyState: {
    modelVersion: cityUpgradeXpConfig.modelVersion,
    resetGeneration: "test-season",
    dayKey: "2026-08-24",
    capReferenceHeroLevel: 50,
    dailyCapXp: cityCapAnchors.get(50),
    dailyAwardedXp: cityCapAnchors.get(50),
  },
  dayKey: "2026-08-25",
  startingCityLevel: 150,
  endingCityLevel: 151,
});
assert.equal(utcReset.capReferenceHeroLevel, 60, "The UTC-day reset retained yesterday's frozen cap reference.");
assert.equal(utcReset.awardedXp, cityCapAnchors.get(60), "The UTC-day reset did not restore today's allowance.");

const combatCapSource = extractFunction(serverSource, "capBattleXpForHeroLevel");
assert.doesNotMatch(combatCapSource, /CITY_UPGRADE_XP|cityUpgradeXp/, "City-upgrade daily limits leaked into combat XP.");

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

const levelRewardConfig = economyConfig.levelRewards;
const cityEconomyConfig = economyConfig.cityEconomy;

function rewardVictoryPoints(level) {
  return Math.floor(6 + level * 4 + Math.pow(level, 1.35) * 2);
}

function passiveGoldPerHour(level) {
  const curveLevel = Math.min(level, cityEconomyConfig.goldEndgameStartLevel);
  const curveUnits = Math.floor(
    cityEconomyConfig.productionVpBase
      * Math.pow(cityEconomyConfig.productionVpGrowth, curveLevel - 1)
      + 0.000001
  );
  const endgameMultiplier = level > cityEconomyConfig.goldEndgameStartLevel
    ? Math.pow(
      cityEconomyConfig.goldEndgameGrowth,
      level - cityEconomyConfig.goldEndgameStartLevel
    )
    : 1;
  return Math.floor(curveUnits * cityEconomyConfig.goldPerProductionVp * endgameMultiplier);
}

function upgradeTargetHours(level) {
  if (level <= cityEconomyConfig.upgradeEarlyEndLevel) {
    const progress = (level - 1) / Math.max(1, cityEconomyConfig.upgradeEarlyEndLevel - 1);
    return cityEconomyConfig.upgradeEarlyStartHours
      + (cityEconomyConfig.upgradeEarlyEndHours - cityEconomyConfig.upgradeEarlyStartHours)
        * Math.pow(progress, 1.35);
  }
  if (level <= cityEconomyConfig.upgradeMidEndLevel) {
    const progress = (level - cityEconomyConfig.upgradeEarlyEndLevel)
      / (cityEconomyConfig.upgradeMidEndLevel - cityEconomyConfig.upgradeEarlyEndLevel);
    return cityEconomyConfig.upgradeEarlyEndHours
      + (cityEconomyConfig.upgradeMidEndHours - cityEconomyConfig.upgradeEarlyEndHours)
        * Math.pow(progress, 1.4);
  }
  const endgameProgress = (level - cityEconomyConfig.upgradeMidEndLevel)
    / Math.max(1, 150 - cityEconomyConfig.upgradeMidEndLevel);
  return Math.min(
    cityEconomyConfig.upgradeMaximumHours,
    cityEconomyConfig.upgradeMidEndHours
      + (cityEconomyConfig.upgradeLevel150Hours - cityEconomyConfig.upgradeMidEndHours)
        * Math.pow(endgameProgress, 1.5)
  );
}

function rewardUpgradeShare(level) {
  if (level <= constants.HERO_XP_SOFT_CAP_LEVEL) {
    return levelRewardConfig.goldEarlyUpgradeShare;
  }
  if (level <= constants.HERO_XP_HARD_CAP_LEVEL) {
    const progress = (level - constants.HERO_XP_SOFT_CAP_LEVEL)
      / (constants.HERO_XP_HARD_CAP_LEVEL - constants.HERO_XP_SOFT_CAP_LEVEL);
    return levelRewardConfig.goldEarlyUpgradeShare
      + (levelRewardConfig.goldMidUpgradeShare - levelRewardConfig.goldEarlyUpgradeShare) * progress;
  }
  return levelRewardConfig.goldEndgameUpgradeShare;
}

function rewardGoldHours(level) {
  if (level <= constants.HERO_XP_SOFT_CAP_LEVEL) {
    return levelRewardConfig.goldEarlyProductionHours;
  }
  if (level <= constants.HERO_XP_HARD_CAP_LEVEL) {
    const progress = (level - constants.HERO_XP_SOFT_CAP_LEVEL)
      / (constants.HERO_XP_HARD_CAP_LEVEL - constants.HERO_XP_SOFT_CAP_LEVEL);
    return levelRewardConfig.goldEarlyProductionHours
      + (levelRewardConfig.goldMidProductionHours - levelRewardConfig.goldEarlyProductionHours) * progress;
  }
  return levelRewardConfig.goldEndgameProductionHours;
}

function levelUpGoldReward(level) {
  const goldFloor = levelRewardConfig.goldFloorBase
    + level * levelRewardConfig.goldFloorPerLevel
    + Math.pow(level, levelRewardConfig.goldFloorExponent)
      * levelRewardConfig.goldFloorExponentScale;
  const referenceLevel = Math.max(1, level - 1);
  const upgradeCost = Math.max(
    10,
    Math.floor(passiveGoldPerHour(referenceLevel) * upgradeTargetHours(referenceLevel) + 0.000001)
  );
  const upgradeRelief = upgradeCost * rewardUpgradeShare(level);
  const productionRelief = passiveGoldPerHour(level) * rewardGoldHours(level);
  return Math.floor(Math.max(goldFloor, Math.min(upgradeRelief, productionRelief)));
}

function rewardTroopHours(level) {
  if (level <= constants.HERO_XP_SOFT_CAP_LEVEL) {
    return levelRewardConfig.troopEarlyBaseHours
      + level * levelRewardConfig.troopEarlyHoursPerLevel;
  }
  if (level <= constants.HERO_XP_HARD_CAP_LEVEL) {
    return levelRewardConfig.troopMidBaseHours
      + (level - constants.HERO_XP_SOFT_CAP_LEVEL) * levelRewardConfig.troopMidHoursPerLevel;
  }
  return Math.min(
    levelRewardConfig.troopMaximumHours,
    levelRewardConfig.troopEndgameBaseHours
      + (level - constants.HERO_XP_HARD_CAP_LEVEL) * levelRewardConfig.troopEndgameHoursPerLevel
  );
}

function levelUpTroopReward(level) {
  return Math.floor(Math.max(
    50,
    rewardVictoryPoints(level) * cityEconomyConfig.troopsPerVictoryPoint * rewardTroopHours(level)
  ));
}

const rewardAnchors = new Map([
  [2, { gold: 1095, troops: 912 }],
  [10, { gold: 3711, troops: 7200 }],
  [25, { gold: 8986, troops: 36400 }],
  [50, { gold: 162787, troops: 143760 }],
  [51, { gold: 184739, troops: 150798 }],
  [75, { gold: 7530834, troops: 384150 }],
  [100, { gold: 180933608, troops: 760320 }],
  [101, { gold: 206869032, troops: 775200 }],
  [125, { gold: 3541843584, troops: 1190400 }],
  [150, { gold: 24256227924, troops: 1730120 }],
  [200, { gold: 1137656204316, troops: 3159340 }],
]);
for (const [level, expected] of rewardAnchors) {
  assert.equal(levelUpGoldReward(level), expected.gold, `Hero level ${level} gold reward changed.`);
  assert.equal(levelUpTroopReward(level), expected.troops, `Hero level ${level} troop reward changed.`);
}
assert.ok(levelUpGoldReward(101) >= levelUpGoldReward(100), "Gold rewards must not drop after level 100.");
assert.ok(levelUpTroopReward(51) >= levelUpTroopReward(50), "Troop rewards must not drop after level 50.");
assert.ok(levelUpTroopReward(101) >= levelUpTroopReward(100), "Troop rewards must not drop after level 100.");
for (let level = 3; level <= 500; level += 1) {
  assert.ok(
    levelUpTroopReward(level) >= levelUpTroopReward(level - 1),
    `Hero troop rewards must not fall from Level ${level - 1} to Level ${level}.`
  );
}
assert.ok(
  rewardTroopHours(234) < levelRewardConfig.troopMaximumHours,
  "The endgame troop-reward hours cap binds before Level 235."
);
assert.equal(
  rewardTroopHours(235),
  levelRewardConfig.troopMaximumHours,
  "The endgame troop-reward hours cap must first bind at Level 235."
);
assert.equal(
  rewardTroopHours(236),
  levelRewardConfig.troopMaximumHours,
  "The endgame troop-reward hours cap must remain stable after Level 235."
);
const cumulativeTroopRewardThrough150 = [...Array(149)].reduce(
  (total, _, index) => total + levelUpTroopReward(index + 2),
  0
);
assert.equal(
  cumulativeTroopRewardThrough150,
  84066135,
  "Cumulative Hero troop rewards through Level 150 changed."
);
const threeLevelGoldReward = levelUpGoldReward(50) + levelUpGoldReward(51) + levelUpGoldReward(52);
const threeLevelTroopReward = levelUpTroopReward(50) + levelUpTroopReward(51) + levelUpTroopReward(52);
assert.equal(
  [...Array(3)].reduce((total, _, index) => total + levelUpGoldReward(50 + index), 0),
  threeLevelGoldReward,
  "Multi-level gold rewards changed."
);
assert.equal(
  [...Array(3)].reduce((total, _, index) => total + levelUpTroopReward(50 + index), 0),
  threeLevelTroopReward,
  "Multi-level troop rewards changed."
);

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

console.log("Validated aligned battle XP, fixed city-upgrade XP, legacy rollout compatibility, daily caps, progression, and the level-up reward curve.");
