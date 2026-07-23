const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

function readNumeric(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  assert.ok(match, `Missing ${name}.`);
  return vm.runInNewContext(match[1], { Math, Number });
}

function readArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\[[^;]+\\]);`));
  assert.ok(match, `Missing ${name}.`);
  return vm.runInNewContext(match[1], { Math, Number });
}

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

const mirroredConstants = [
  "MILLION_LORDS_CITY_PRODUCTION_VP_BASE",
  "MILLION_LORDS_CITY_PRODUCTION_VP_GROWTH",
  "MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP",
  "CITY_GOLD_ENDGAME_START_LEVEL",
  "CITY_GOLD_ENDGAME_GROWTH",
  "CITY_UPGRADE_EARLY_END_LEVEL",
  "CITY_UPGRADE_MID_END_LEVEL",
  "CITY_UPGRADE_EARLY_START_HOURS",
  "CITY_UPGRADE_EARLY_END_HOURS",
  "CITY_UPGRADE_MID_END_HOURS",
  "CITY_UPGRADE_END_LEVEL_150_HOURS",
  "CITY_UPGRADE_MAX_TARGET_HOURS",
  "HARVEST_BONUS_DAILY_LIMIT",
  "HARVEST_BONUS_DAILY_GOLD_LIMIT",
  "HARVEST_BONUS_DAILY_TROOP_LIMIT",
  "HARVEST_BONUS_GOLD_SECONDS",
  "HARVEST_BONUS_TROOP_SECONDS",
  "HARVEST_BONUS_SPAWN_INTERVAL_SECONDS",
  "WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT",
  "ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT",
  "RELIC_CAMP_DAILY_REWARD_LIMIT",
];

for (const name of mirroredConstants) {
  assert.equal(readNumeric(serverSource, name), readNumeric(clientSource, name), `${name} differs between server and client.`);
}

assert.equal(readNumeric(serverSource, "WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT"), 5);
assert.equal(readNumeric(serverSource, "RELIC_CAMP_DAILY_REWARD_LIMIT"), 2);
assert.equal(
  readNumeric(serverSource, "HARVEST_BONUS_DAILY_GOLD_LIMIT")
    * readNumeric(serverSource, "HARVEST_BONUS_GOLD_SECONDS"),
  3600,
  "Daily gold pickups should equal at most one hour of permanent production."
);
assert.equal(
  readNumeric(serverSource, "HARVEST_BONUS_DAILY_TROOP_LIMIT")
    * readNumeric(serverSource, "HARVEST_BONUS_TROOP_SECONDS"),
  3600,
  "Daily troop pickups should equal at most one hour of permanent production."
);
assert.equal(readNumeric(serverSource, "HARVEST_BONUS_SPAWN_INTERVAL_SECONDS"), 180);

const expectedItemLimits = new Map([
  ["ROYAL_PEACE_SHIELD_ITEM_ID", 1],
  ["WAR_DRUMS_ITEM_ID", 4],
  ["ROYAL_TAX_DECREE_ITEM_ID", 2],
  ["VEIL_OF_SILENCE_ITEM_ID", 4],
  ["SWIFT_MARCH_ORDER_ITEM_ID", 2],
  ["RECALL_HORN_ITEM_ID", 2],
]);
for (const [itemId, limit] of expectedItemLimits) {
  const pattern = new RegExp(`\\[${itemId}\\]:\\s*${limit}`);
  requireMatch(serverSource, pattern, `Server daily purchase cap is wrong for ${itemId}.`);
  requireMatch(clientSource, pattern, `Client daily purchase cap is wrong for ${itemId}.`);
}

const expectedPrices = new Map([
  ["ROYAL_PEACE_SHIELD_ITEM_ID", 1_250_000],
  ["WAR_DRUMS_ITEM_ID", 75_000],
  ["ROYAL_TAX_DECREE_ITEM_ID", 150_000],
  ["VEIL_OF_SILENCE_ITEM_ID", 125_000],
  ["SWIFT_MARCH_ORDER_ITEM_ID", 300_000],
  ["RECALL_HORN_ITEM_ID", 500_000],
]);
for (const [itemId, price] of expectedPrices) {
  requireMatch(
    serverSource,
    new RegExp(`\\[${itemId}\\]:\\s*\\{[^}]*cost:\\s*${price}`),
    `Server shop price is wrong for ${itemId}.`
  );
}
assert.deepEqual(
  [...clientSource.matchAll(/id:\s*"([^"]+)"[\s\S]*?cost:\s*([\d_]+)/g)]
    .slice(0, expectedPrices.size)
    .map(match => [match[1], Number(match[2].replaceAll("_", ""))]),
  [
    ["shield_12h", 1_250_000],
    ["war_drums_30m", 75_000],
    ["royal_tax_decree_30m", 150_000],
    ["veil_of_silence_30m", 125_000],
    ["swift_march_order", 300_000],
    ["recall_horn", 500_000],
  ],
  "Client shop prices or ordering changed."
);

const goldRewardHours = readArray(serverSource, "GOLD_CAMP_REWARD_HOURS_BY_DAILY_CLAIM");
const troopRewardHours = readArray(serverSource, "WARBAND_CAMP_REWARD_HOURS_BY_DAILY_CLAIM");
assert.deepEqual([...goldRewardHours], [3, 2, 1, 0.5]);
assert.deepEqual([...troopRewardHours], [6, 4, 3, 2]);
assert.equal(goldRewardHours.reduce((sum, hours) => sum + hours, 0), 6.5);
assert.equal(troopRewardHours.reduce((sum, hours) => sum + hours, 0), 15);
requireMatch(serverSource, /function getRewardCampDailyReward[\s\S]*?Math\.max\(minimumReward,\s*Math\.floor\(hourlyRate \* rewardHours\)\)/, "Camp rewards are not production-scaled with a minimum.");
requireMatch(serverSource, /baseGoldPerHour:[\s\S]*?baseTroopPerHour:/, "Permanent production rates are missing from global stats.");

const baseVp = readNumeric(serverSource, "MILLION_LORDS_CITY_PRODUCTION_VP_BASE");
const vpGrowth = readNumeric(serverSource, "MILLION_LORDS_CITY_PRODUCTION_VP_GROWTH");
const goldPerVp = readNumeric(serverSource, "MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP");
const endgameStart = readNumeric(serverSource, "CITY_GOLD_ENDGAME_START_LEVEL");
const endgameGrowth = readNumeric(serverSource, "CITY_GOLD_ENDGAME_GROWTH");

function goldPerHour(level) {
  const curveLevel = Math.min(level, endgameStart);
  const base = Math.floor(baseVp * Math.pow(vpGrowth, curveLevel - 1) + 0.000001) * goldPerVp;
  return Math.floor(base * (level > endgameStart ? Math.pow(endgameGrowth, level - endgameStart) : 1));
}

function upgradeTargetHours(level) {
  if (level <= 50) return 0.1 + 3.9 * Math.pow((level - 1) / 49, 1.35);
  if (level <= 100) return 4 + 32 * Math.pow((level - 50) / 50, 1.4);
  return Math.min(720, 36 + 204 * Math.pow((level - 100) / 50, 1.5));
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

for (const source of [serverSource, clientSource]) {
  requireMatch(source, /taxStewardship:\s*\{[^}]*percentPerLevel:\s*3[^}]*maxPercent:\s*75/, "Tax Stewardship is not meaningful.");
  requireMatch(source, /royalGranaries:\s*\{[^}]*percentPerLevel:\s*3[^}]*maxPercent:\s*75/, "Royal Granaries is not meaningful.");
  requireMatch(source, /guildCharters:\s*\{[^}]*percentPerLevel:\s*2[^}]*maxPercent:\s*50/, "Guild Charters is not meaningful.");
}
assert.equal(readNumeric(clientSource, "SCOUT_NEARBY_COST"), 75_000);
assert.equal(readNumeric(clientSource, "REGROUP_COST"), 150_000);
assert.equal(readNumeric(clientSource, "SKILL_RESET_COST"), 750_000);

console.log("Validated Crownlands production, upgrades, pickups, camps, shop prices, daily caps, and economy skill value.");
