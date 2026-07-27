const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const editorSource = fs.readFileSync(path.join(root, "tools", "map-editor", "editor.js"), "utf8");
const editorServerSource = fs.readFileSync(path.join(root, "tools", "editor-server.js"), "utf8");
const serverConfig = require(path.join(root, "functions", "economy-config.json"));
const browserConfigSource = fs.readFileSync(path.join(root, "economy-config.js"), "utf8");
const browserContext = { window: {} };
vm.runInNewContext(browserConfigSource, browserContext);
const browserConfig = JSON.parse(JSON.stringify(browserContext.window.CROWNLANDS_ECONOMY_CONFIG));

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

assert.deepEqual(browserConfig, serverConfig, "Browser and Firebase economy configurations differ.");
assert.equal(serverConfig.shopItems.war_drums_30m.bonusPercent, 30);
assert.equal(serverConfig.camps.items.maxDailyRewards, 5);
assert.equal(
  serverConfig.pickups.dailyGoldCap * serverConfig.pickups.goldAwardProductionMinutes,
  1_500,
  "Daily gold pickup production-time budget changed unexpectedly."
);
assert.equal(
  serverConfig.pickups.dailyTroopCap * serverConfig.pickups.troopAwardProductionMinutes,
  1_500,
  "Daily troop pickup production-time budget changed unexpectedly."
);
assert.equal(serverConfig.pickups.spawnIntervalMinutes, 3);

const expectedItemLimits = {
  shield_12h: 1,
  war_drums_30m: 4,
  royal_tax_decree_30m: 5,
  veil_of_silence_30m: 5,
  swift_march_order: 5,
  recall_horn: 2,
};
const expectedPrices = {
  shield_12h: 1_250_000,
  war_drums_30m: 100_000,
  royal_tax_decree_30m: 100_000,
  veil_of_silence_30m: 125_000,
  swift_march_order: 300_000,
  recall_horn: 500_000,
};
for (const [itemId, limit] of Object.entries(expectedItemLimits)) {
  assert.equal(serverConfig.shopItems[itemId].dailyPurchaseLimit, limit, `${itemId} daily cap changed unexpectedly.`);
  assert.equal(serverConfig.shopItems[itemId].cost, expectedPrices[itemId], `${itemId} price changed unexpectedly.`);
}

const goldSchedule = serverConfig.camps.gold.rewardSchedule;
const troopSchedule = serverConfig.camps.troops.rewardSchedule;
assert.deepEqual(goldSchedule, [
  { minimumReward: 20_000, productionHours: 0.4 },
  { minimumReward: 40_000, productionHours: 0.8 },
  { minimumReward: 60_000, productionHours: 1.6 },
  { minimumReward: 80_000, productionHours: 2.4 },
]);
assert.deepEqual(troopSchedule, [
  { minimumReward: 10_000, productionHours: 1.6 },
  { minimumReward: 20_000, productionHours: 2.4 },
  { minimumReward: 30_000, productionHours: 3.2 },
  { minimumReward: 40_000, productionHours: 4.8 },
]);
assert.equal(goldSchedule.reduce((sum, entry) => sum + entry.productionHours, 0), 5.2);
assert.equal(troopSchedule.reduce((sum, entry) => sum + entry.productionHours, 0), 12);
for (const [campName, schedule] of [["Gold Camp", goldSchedule], ["Warband Camp", troopSchedule]]) {
  for (let index = 1; index < schedule.length; index += 1) {
    assert.ok(
      schedule[index].minimumReward > schedule[index - 1].minimumReward,
      `${campName} guaranteed rewards must rise with each claim.`
    );
    assert.ok(
      schedule[index].productionHours > schedule[index - 1].productionHours,
      `${campName} production-hour rewards must rise with each claim.`
    );
  }
}
requireMatch(serverSource, /function getRewardCampDailyReward[\s\S]*?Math\.max\(minimumReward,\s*Math\.floor\(hourlyRate \* rewardHours\)\)/, "Camp rewards are not production-scaled with a minimum.");
requireMatch(serverSource, /const resolvedCamp = authoritativeSeed \? \{ \.\.\.camp, \.\.\.authoritativeSeed \} : camp;/, "Stored camp schedules can override the authoritative world reward schedule.");
requireMatch(clientSource, /getRewardCampConfig\(\{ \.\.\.raw, \.\.\.base, campType \}\)/, "Online camp state can override the client world's authoritative reward schedule.");
requireMatch(serverSource, /baseGoldPerHour:[\s\S]*?baseTroopPerHour:/, "Permanent production rates are missing from global stats.");

const {
  productionVpBase: baseVp,
  productionVpGrowth: vpGrowth,
  goldPerProductionVp: goldPerVp,
  goldEndgameStartLevel: endgameStart,
  goldEndgameGrowth: endgameGrowth,
  upgradeEarlyStartHours,
  upgradeEarlyEndHours,
  upgradeMidEndHours,
  upgradeLevel150Hours,
  upgradeMaximumHours,
} = serverConfig.cityEconomy;

function goldPerHour(level) {
  const curveLevel = Math.min(level, endgameStart);
  const base = Math.floor(baseVp * Math.pow(vpGrowth, curveLevel - 1) + 0.000001) * goldPerVp;
  return Math.floor(base * (level > endgameStart ? Math.pow(endgameGrowth, level - endgameStart) : 1));
}

function upgradeTargetHours(level) {
  if (level <= 50) return upgradeEarlyStartHours + (upgradeEarlyEndHours - upgradeEarlyStartHours) * Math.pow((level - 1) / 49, 1.35);
  if (level <= 100) return upgradeEarlyEndHours + (upgradeMidEndHours - upgradeEarlyEndHours) * Math.pow((level - 50) / 50, 1.4);
  return Math.min(upgradeMaximumHours, upgradeMidEndHours + (upgradeLevel150Hours - upgradeMidEndHours) * Math.pow((level - 100) / 50, 1.5));
}

assert.equal(upgradeTargetHours(1), 0.1);
assert.equal(upgradeTargetHours(50), 4);
assert.equal(upgradeTargetHours(100), 36);
assert.equal(upgradeTargetHours(150), 240);
assert.ok(goldPerHour(101) / goldPerHour(100) <= 1.081, "Post-100 gold growth should be near 8%.");
assert.ok(goldPerHour(150) < 1_000_000_000, "Post-100 city gold has returned to runaway growth.");
for (const level of [1, 25, 50, 75, 100, 125, 150]) {
  const cost = Math.floor(goldPerHour(level) * upgradeTargetHours(level));
  assert.ok(Number.isSafeInteger(cost) && cost >= 10, `Invalid upgrade cost at level ${level}.`);
}
assert.ok(upgradeTargetHours(50) / 10 <= 0.5, "A ten-city level-50 kingdom should still progress comfortably.");
assert.ok(upgradeTargetHours(100) / 10 <= 4, "A ten-city level-100 kingdom should remain war-friendly.");
assert.ok(upgradeTargetHours(150) / 10 >= 20, "Level 150 should feel like endgame progression.");

assert.deepEqual(serverConfig.skills.taxStewardship, { percentPerLevel: 3, maxPercent: 75 });
assert.deepEqual(serverConfig.skills.royalGranaries, { percentPerLevel: 3, maxPercent: 75 });
assert.deepEqual(serverConfig.skills.guildCharters, { percentPerLevel: 2, maxPercent: 50 });
assert.equal(serverConfig.playerCosts.nearbyScoutGold, 250_000);
assert.equal(serverConfig.playerCosts.regroupGold, 250_000);
assert.equal(serverConfig.playerCosts.skillResetGold, 1_000_000);

for (const source of [serverSource, clientSource]) {
  requireMatch(source, /economyNumber\(/, "Runtime is not reading the shared economy configuration.");
  requireMatch(source, /rewardSchedule/, "Runtime does not support per-camp reward schedules.");
}
requireMatch(serverSource, /require\("\.\/economy-config\.json"\)/, "Firebase Functions do not load the generated economy config.");
requireMatch(editorServerSource, /\/api\/economy-data/, "Game Editor economy API is missing.");
requireMatch(editorSource, /renderEconomySections/, "Game Editor economy interface is missing.");
requireMatch(editorSource, /data-camp-reward-field="productionHours"/, "Per-camp production-hour editor is missing.");
assert.doesNotMatch(clientSource, /troopsRalliedToMain|Rallied home/, "Lost-city troop production can still be rallied to the main city.");
requireMatch(clientSource, /if \(!stillOwned\) continue;[\s\S]*?goldGainedFloat \+= stats\.goldProductionPerSecond/, "Offline production still credits cities that are no longer owned.");

console.log("Validated shared Crownlands economy config, production, upgrades, pickups, camps, shop prices, daily caps, and skills.");
