const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "functions", "economy-config.json"), "utf8"));
const profile = JSON.parse(fs.readFileSync(path.join(__dirname, "season-balance-profile.json"), "utf8"));
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");

function sourceNumber(name) {
  const match = new RegExp(`const ${name} = ([^;]+);`).exec(serverSource);
  if (!match) throw new Error(`Could not read authoritative ${name}.`);
  const expression = match[1].replaceAll("_", "").trim();
  if (!/^[0-9+*/().\s-]+$/.test(expression)) {
    throw new Error(`Authoritative ${name} is not a numeric expression.`);
  }
  return Function(`"use strict"; return (${expression});`)();
}

function cityStatNumber(name) {
  const match = new RegExp(`${name}: ([0-9.]+),`).exec(serverSource);
  if (!match) throw new Error(`Could not read authoritative CITY_LEVEL_STATS.${name}.`);
  return Number(match[1]);
}

const constants = {
  baseAttackPower: Number(config.troopCombat.baseAttackPowerPerTroop),
  baseDefensePower: Number(config.troopCombat.baseDefensePowerPerTroop),
  rewardedAdMinutes: sourceNumber("REWARDED_AD_REWARD_MINUTES"),
  rewardedAdDailyLimit: sourceNumber("REWARDED_AD_DAILY_LIMIT"),
  clanMemberLimit: sourceNumber("CLAN_MEMBER_LIMIT"),
  clanGiftCooldownMinutes: sourceNumber("CLAN_GIFT_COOLDOWN_MS") / 60_000,
  clanGiftProductionMinutes: sourceNumber("CLAN_GIFT_PRODUCTION_MINUTES"),
  victoryPointsBase: cityStatNumber("victoryPointsBase"),
  victoryPointsPerLevel: cityStatNumber("victoryPointsPerLevel"),
  victoryPointsExponent: cityStatNumber("victoryPointsExponent"),
  victoryPointsExponentScale: cityStatNumber("victoryPointsExponentScale"),
};

function getVictoryPoints(level) {
  return Math.floor(
    constants.victoryPointsBase
      + level * constants.victoryPointsPerLevel
      + Math.pow(level, constants.victoryPointsExponent) * constants.victoryPointsExponentScale
  );
}

function getGoldPerHour(level) {
  const economy = config.cityEconomy;
  const curveLevel = Math.min(level, economy.goldEndgameStartLevel);
  const productionVp = Math.floor(
    economy.productionVpBase * Math.pow(economy.productionVpGrowth, curveLevel - 1) + 0.000001
  );
  const endgameMultiplier = level > economy.goldEndgameStartLevel
    ? Math.pow(economy.goldEndgameGrowth, level - economy.goldEndgameStartLevel)
    : 1;
  return Math.floor(productionVp * economy.goldPerProductionVp * endgameMultiplier);
}

function getTroopsPerHour(level) {
  return getVictoryPoints(level) * config.cityEconomy.troopsPerVictoryPoint;
}

function getBaseWall(level) {
  const economy = config.cityEconomy;
  const levelOffset = Math.max(1, Math.floor(Number(level) || 1)) - 1;
  return Math.floor(
    economy.wallDefenseBase
      + economy.wallDefensePerLevel * levelOffset
  );
}

function getRepairMinutes(level) {
  return Math.round(
    config.siegeCombat.repairBaseMinutes
      + level * config.siegeCombat.repairMinutesPerLevel
  );
}

function getUpgradeTargetHours(level) {
  const economy = config.cityEconomy;
  if (level <= economy.upgradeEarlyEndLevel) {
    const progress = (level - 1) / Math.max(1, economy.upgradeEarlyEndLevel - 1);
    return economy.upgradeEarlyStartHours
      + (economy.upgradeEarlyEndHours - economy.upgradeEarlyStartHours) * Math.pow(progress, 1.35);
  }
  if (level <= economy.upgradeMidEndLevel) {
    const progress = (level - economy.upgradeEarlyEndLevel)
      / (economy.upgradeMidEndLevel - economy.upgradeEarlyEndLevel);
    return economy.upgradeEarlyEndHours
      + (economy.upgradeMidEndHours - economy.upgradeEarlyEndHours) * Math.pow(progress, 1.4);
  }
  const progress = (level - economy.upgradeMidEndLevel) / (150 - economy.upgradeMidEndLevel);
  return Math.min(
    economy.upgradeMaximumHours,
    economy.upgradeMidEndHours
      + (economy.upgradeLevel150Hours - economy.upgradeMidEndHours) * Math.pow(progress, 1.5)
  );
}

function getLevelRewardTotals(maxLevel = 150) {
  const rewards = config.levelRewards;
  let gold = 0;
  let troops = 0;
  for (let level = 2; level <= maxLevel; level += 1) {
    const goldFloor = rewards.goldFloorBase
      + level * rewards.goldFloorPerLevel
      + Math.pow(level, rewards.goldFloorExponent) * rewards.goldFloorExponentScale;
    const upgradeShare = level <= 50
      ? rewards.goldEarlyUpgradeShare
      : level <= 100
        ? rewards.goldEarlyUpgradeShare
          + (rewards.goldMidUpgradeShare - rewards.goldEarlyUpgradeShare) * ((level - 50) / 50)
        : rewards.goldEndgameUpgradeShare;
    const productionHours = level <= 50
      ? rewards.goldEarlyProductionHours
      : level <= 100
        ? rewards.goldEarlyProductionHours
          + (rewards.goldMidProductionHours - rewards.goldEarlyProductionHours) * ((level - 50) / 50)
        : rewards.goldEndgameProductionHours;
    const upgradeRelief = getGoldPerHour(level - 1) * getUpgradeTargetHours(level - 1) * upgradeShare;
    const productionRelief = getGoldPerHour(level) * productionHours;
    gold += Math.floor(Math.max(goldFloor, Math.min(upgradeRelief, productionRelief)));

    const troopHours = level <= 50
      ? rewards.troopEarlyBaseHours + level * rewards.troopEarlyHoursPerLevel
      : level <= 100
        ? rewards.troopMidBaseHours + (level - 50) * rewards.troopMidHoursPerLevel
        : Math.min(
            rewards.troopMaximumHours,
            rewards.troopEndgameBaseHours + (level - 100) * rewards.troopEndgameHoursPerLevel
          );
    troops += Math.floor(Math.max(50, getTroopsPerHour(level) * troopHours));
  }
  return { gold, troops };
}

function getMonthlyLoginHours() {
  const rewardConfig = config.dailyLoginRewards;
  const totals = {};
  for (const monthLength of [28, 29, 30, 31]) {
    const track = rewardConfig.tracksByMonthLength[String(monthLength)];
    totals[monthLength] = {
      gold: track.goldHours.reduce((sum, hours) => sum + hours, 0),
      troops: track.troopHours.reduce((sum, hours) => sum + hours, 0),
      items: track.itemDays.length,
    };
  }
  return totals;
}

function getClanQuestHours() {
  const block = /const CLAN_QUEST_REWARDS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(serverSource)?.[1] || "";
  const rewards = [...block.matchAll(/rewardType: "(gold|troops)", productionMinutes: ([0-9_]+)/g)];
  return rewards.reduce((totals, match) => {
    totals[match[1]] += Number(match[2].replaceAll("_", "")) / 60;
    return totals;
  }, { gold: 0, troops: 0 });
}

function sumPortfolio(rateForLevel) {
  return Object.entries(profile.apexPortfolio).reduce(
    (total, [level, count]) => total + rateForLevel(Number(level)) * Number(count),
    0
  );
}

const cityCount = Object.values(profile.apexPortfolio).reduce((sum, count) => sum + count, 0);
const baseGoldPerHour = sumPortfolio(getGoldPerHour);
const baseTroopsPerHour = sumPortfolio(getTroopsPerHour);
const permanentGoldMultiplier = 1
  + (config.skills.taxStewardship.maxPercent + profile.maximumObjectiveBonusPercent) / 100;
const permanentTroopMultiplier = 1
  + (config.skills.royalGranaries.maxPercent + profile.maximumObjectiveBonusPercent) / 100;
const pickupGoldHours = config.pickups.dailyGoldCap * config.pickups.goldAwardProductionMinutes / 60;
const pickupTroopHours = config.pickups.dailyTroopCap * config.pickups.troopAwardProductionMinutes / 60;
const adHours = constants.rewardedAdDailyLimit * constants.rewardedAdMinutes / 60;
const goldCampHours = config.camps.gold.rewardSchedule.reduce((sum, reward) => sum + reward.productionHours, 0);
const troopCampHours = config.camps.troops.rewardSchedule.reduce((sum, reward) => sum + reward.productionHours, 0);
const taxItemHours = config.shopItems.royal_tax_decree_30m.dailyPurchaseLimit
  * config.shopItems.royal_tax_decree_30m.effectDurationMinutes / 60
  * config.shopItems.royal_tax_decree_30m.bonusPercent / 100;
const troopItemHours = config.shopItems.war_drums_30m.dailyPurchaseLimit
  * config.shopItems.war_drums_30m.effectDurationMinutes / 60
  * config.shopItems.war_drums_30m.bonusPercent / 100;
const clanQuestHours = getClanQuestHours();
const loginHours = getMonthlyLoginHours();
const dailyLoginGoldHours = loginHours[profile.seasonHorizonDays].gold / profile.seasonHorizonDays;
const dailyLoginTroopHours = loginHours[profile.seasonHorizonDays].troops / profile.seasonHorizonDays;

const dailyGoldSources = {
  passive: baseGoldPerHour * permanentGoldMultiplier * 24,
  pickups: baseGoldPerHour * permanentGoldMultiplier * pickupGoldHours,
  rewardedAds: baseGoldPerHour * adHours,
  camps: baseGoldPerHour * goldCampHours,
  timedItems: baseGoldPerHour * taxItemHours,
  dailyLogin: baseGoldPerHour * dailyLoginGoldHours,
  weeklyClanQuestAverage: baseGoldPerHour * clanQuestHours.gold / 7,
};
const dailyTroopSources = {
  passive: baseTroopsPerHour * permanentTroopMultiplier * 24,
  pickups: baseTroopsPerHour * permanentTroopMultiplier * pickupTroopHours,
  rewardedAds: baseTroopsPerHour * adHours,
  camps: baseTroopsPerHour * troopCampHours,
  timedItems: baseTroopsPerHour * troopItemHours,
  dailyLogin: baseTroopsPerHour * dailyLoginTroopHours,
  weeklyClanQuestAverage: baseTroopsPerHour * clanQuestHours.troops / 7,
};
const dailyGoldMaximum = Object.values(dailyGoldSources).reduce((sum, value) => sum + value, 0);
const dailyTroopMaximum = Object.values(dailyTroopSources).reduce((sum, value) => sum + value, 0);
const clanGiftGoldHoursPerDay = (constants.clanMemberLimit - 1)
  * (24 * 60 / constants.clanGiftCooldownMinutes)
  * (constants.clanGiftProductionMinutes / 60);
const clanGiftGoldPerDay = baseGoldPerHour * clanGiftGoldHoursPerDay;

const siege = profile.siegeBenchmark;
const baseWall = getBaseWall(siege.cityLevel);
const stoneworksWall = Math.floor(baseWall * (1 + config.skills.stoneworks.maxPercent / 100));
const wallPower = stoneworksWall;
const garrisonPower = Math.floor(
  siege.defenders
    * constants.baseDefensePower
    * (1 + (config.skills.shieldwallDiscipline.maxPercent + profile.maximumObjectiveBonusPercent) / 100)
);
const attackPowerPerTroop = constants.baseAttackPower
  * (1 + config.skills.swordmastery.maxPercent / 100);
const minimumCaptureTroops = Math.floor((wallPower + garrisonPower) / attackPowerPerTroop) + 1;
const productionDays = minimumCaptureTroops / dailyTroopMaximum;
const minimumMeaningfulWallDamageTroops = Math.ceil(
  wallPower * config.siegeCombat.meaningfulWallDamagePercent / 100 / attackPowerPerTroop
);
const levelRewards = getLevelRewardTotals(150);

assert.equal(profile.version, 1);
assert.equal(cityCount, 30, "The apex portfolio must contain exactly 30 cities.");
assert.equal(Math.max(...Object.keys(profile.apexPortfolio).map(Number)), 150, "The apex capital must be Level 150.");
assert.equal(baseGoldPerHour, 741_630_729, "Apex base gold production drifted; review the season benchmark.");
assert.equal(baseTroopsPerHour, 268_050, "Apex base troop production drifted; review the season benchmark.");
assert.ok(
  minimumCaptureTroops >= siege.minimumCaptureTroops && minimumCaptureTroops <= siege.maximumCaptureTroops,
  `Level-150 capture threshold ${minimumCaptureTroops} left the ${siege.minimumCaptureTroops}-${siege.maximumCaptureTroops} guardrail.`
);
assert.ok(
  productionDays >= siege.minimumProductionDays && productionDays <= siege.maximumProductionDays,
  `Level-150 siege replacement time ${productionDays.toFixed(2)} days left the ${siege.minimumProductionDays}-${siege.maximumProductionDays}-day guardrail.`
);
assert.equal(getRepairMinutes(150), 60, "Level-150 repair time must remain 60 minutes.");
for (let level = 2; level <= 150; level += 1) {
  assert.ok(getBaseWall(level) >= getBaseWall(level - 1), `Wall power fell at Level ${level}.`);
}
Object.entries(loginHours).forEach(([monthLength, totals]) => {
  assert.deepEqual(totals, { gold: 111, troops: 111, items: 6 }, `${monthLength}-day login budget drifted.`);
});

const format = value => Math.round(value).toLocaleString("en-US");
const output = {
  profile: `30-city apex: ${Object.entries(profile.apexPortfolio).map(([level, count]) => `${count}x L${level}`).join(", ")}`,
  baseProductionPerHour: { gold: baseGoldPerHour, troops: baseTroopsPerHour },
  passiveThirtyDays: {
    gold: baseGoldPerHour * permanentGoldMultiplier * 24 * profile.seasonHorizonDays,
    troops: baseTroopsPerHour * permanentTroopMultiplier * 24 * profile.seasonHorizonDays,
  },
  resourceSpecificMaximumPerDay: { gold: dailyGoldMaximum, troops: dailyTroopMaximum },
  resourceSpecificMaximumThirtyDays: {
    gold: dailyGoldMaximum * profile.seasonHorizonDays,
    troops: dailyTroopMaximum * profile.seasonHorizonDays,
  },
  clanGiftGold: { hoursPerDay: clanGiftGoldHoursPerDay, goldPerDay: clanGiftGoldPerDay },
  levelRewardsThrough150: levelRewards,
  level150Siege: {
    baseWall,
    stoneworksWall,
    wallPower,
    garrisonPower,
    minimumCaptureTroops,
    productionDays,
    minimumMeaningfulWallDamageTroops,
    repairMinutes: getRepairMinutes(150),
  },
  dailySources: { gold: dailyGoldSources, troops: dailyTroopSources },
  loginHours,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log("Crownlands season balance audit passed.");
  console.log(`Apex base: ${format(baseGoldPerHour)} gold/h | ${format(baseTroopsPerHour)} troops/h`);
  console.log(`Resource-specific active maximum: ${format(dailyGoldMaximum)} gold/day | ${format(dailyTroopMaximum)} troops/day`);
  console.log(`Clan gift ceiling: +${format(clanGiftGoldPerDay)} gold/day (${clanGiftGoldHoursPerDay.toFixed(1)} base hours)`);
  console.log(`Hero rewards through Level 150: ${format(levelRewards.gold)} gold | ${format(levelRewards.troops)} troops`);
  console.log(`Level-150 / 50M defense: ${format(minimumCaptureTroops)} attackers | ${productionDays.toFixed(2)} active-production days | ${getRepairMinutes(150)}m repair`);
}

module.exports = output;
