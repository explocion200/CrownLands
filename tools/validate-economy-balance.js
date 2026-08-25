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

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      bodyStart = source.indexOf("{", index + 1);
      break;
    }
  }
  assert.ok(bodyStart >= 0, `Missing body for function ${name}.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract function ${name}.`);
}

assert.deepEqual(browserConfig, serverConfig, "Browser and Firebase economy configurations differ.");
assert.equal(serverConfig.shopItems.war_drums_30m.bonusPercent, 30);
assert.equal(serverConfig.camps.items.maxDailyRewards, 5);
for (const campType of ["gold", "troops", "items", "deed"]) {
  assert.equal(serverConfig.camps[campType].baseDefenders, 20_000, `${campType} camp must reset with 20,000 neutral troops.`);
  assert.equal("defenseLevel" in serverConfig.camps[campType], false, `${campType} camp still exposes a defense level.`);
}
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
  { minimumReward: 20_000, productionHours: 0.5 },
  { minimumReward: 40_000, productionHours: 1 },
  { minimumReward: 60_000, productionHours: 1.5 },
  { minimumReward: 80_000, productionHours: 2 },
]);
assert.deepEqual(troopSchedule, [
  { minimumReward: 10_000, productionHours: 0.5 },
  { minimumReward: 20_000, productionHours: 1 },
  { minimumReward: 30_000, productionHours: 1.5 },
  { minimumReward: 40_000, productionHours: 2 },
]);
assert.equal(goldSchedule.reduce((sum, entry) => sum + entry.productionHours, 0), 5);
assert.equal(troopSchedule.reduce((sum, entry) => sum + entry.productionHours, 0), 5);
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
requireMatch(serverSource, /function getRewardCampDailyReward[\s\S]*?Math\.min\(\s*Number\.MAX_SAFE_INTEGER,[\s\S]*?Math\.max\(minimumReward,\s*Math\.floor\(hourlyRate \* rewardHours\)\)/, "Camp rewards are not safely production-scaled with a minimum.");
const campRewardSource = extractFunction(serverSource, "getRewardCampDailyReward");
assert.doesNotMatch(
  campRewardSource,
  /productionRates\.(?:untimedGoldPerHour|untimedTroopPerHour|goldPerHour|troopPerHour)/,
  "Camp rewards can still fall back to a boosted production rate."
);
const campRewardContext = {
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : Number(fallback) || 0;
  },
};
vm.createContext(campRewardContext);
vm.runInContext(campRewardSource, campRewardContext);
const rawGoldRates = {
  baseGoldPerHour: 10_000,
  baseTroopPerHour: 7_200,
  untimedGoldPerHour: 14_000,
  untimedTroopPerHour: 11_000,
  goldPerHour: 19_000,
  troopPerHour: 15_000,
};
assert.equal(
  campRewardContext.getRewardCampDailyReward({ rewardType: "gold", dailyRewards: [250], rewardHours: [2] }, 0, rawGoldRates),
  20_000,
  "Gold Camp rewards must use raw Gold production only."
);
assert.equal(
  campRewardContext.getRewardCampDailyReward({ rewardType: "troops", dailyRewards: [250], rewardHours: [2] }, 0, rawGoldRates),
  14_400,
  "Warband Camp rewards must use raw troop production only."
);
assert.equal(
  campRewardContext.getRewardCampDailyReward({ rewardType: "gold", dailyRewards: [20_000], rewardHours: [0.5] }, 0, { baseGoldPerHour: 100 }),
  20_000,
  "Gold Camp minimum rewards must remain intact."
);
assert.equal(
  campRewardContext.getRewardCampDailyReward({ rewardType: "troops", dailyRewards: [10_000], rewardHours: [0.5] }, 0, { baseTroopPerHour: 100 }),
  10_000,
  "Warband Camp minimum rewards must remain intact."
);
assert.equal(
  campRewardContext.getRewardCampDailyReward({ rewardType: "gold", dailyRewards: [0], rewardHours: [1.25] }, 0, { baseGoldPerHour: 101 }),
  126,
  "A zero reward floor must not disable a valid raw-production reward."
);
assert.equal(
  campRewardContext.getRewardCampDailyReward({ rewardType: "gold", dailyRewards: [-10], rewardHours: [-2] }, 0, { baseGoldPerHour: -100 }),
  0,
  "Negative Camp reward inputs must clamp to zero."
);
assert.equal(
  campRewardContext.getRewardCampDailyReward({ rewardType: "gold", dailyRewards: [1], rewardHours: [Number.MAX_VALUE] }, 0, { baseGoldPerHour: Number.MAX_VALUE }),
  Number.MAX_SAFE_INTEGER,
  "Camp reward calculations must cap overflow at the largest safe integer."
);
assert.equal(
  campRewardContext.getRewardCampDailyReward({ rewardType: "troops", dailyRewards: [100], rewardHours: [1] }, 9, { baseTroopPerHour: 500 }),
  0,
  "Claims beyond the configured reward ladder must award zero."
);
const payoutStart = serverSource.indexOf("async function resolveRewardCampPayoutByRef");
const payoutEnd = serverSource.indexOf("async function resolveRewardCampPayoutAndStats", payoutStart);
const payoutSource = serverSource.slice(payoutStart, payoutEnd);
requireMatch(payoutSource, /productionCitiesQuery[\s\S]*?collectionGroup\("cities"\)[\s\S]*?ownerUid[\s\S]*?resetGeneration[\s\S]*?worldId/, "Camp payout does not query the holder's current owned cities.");
requireMatch(payoutSource, /getRewardedAdBaseRates\(\{[\s\S]*?uid:\s*holderUid[\s\S]*?createOwnedCityEntriesFromSnapshot/, "Camp payout does not reuse the canonical raw kingdom-rate helper.");
requireMatch(payoutSource, /baseGoldPerHour:\s*baseProductionRates\.goldPerHour[\s\S]*?baseTroopPerHour:\s*baseProductionRates\.troopsPerHour/, "Camp payout does not pass raw Gold and troop rates to the reward helper.");
assert.doesNotMatch(payoutSource, /untimedGoldPerHour|untimedTroopPerHour/, "Camp payout still reads permanently boosted production.");
const clientCampEstimateSource = extractFunction(clientSource, "getRewardCampEstimatedRewards");
requireMatch(clientCampEstimateSource, /globalStats\?\.baseTroopPerHour/, "Online Warband Camp estimates do not use raw troop production.");
requireMatch(clientCampEstimateSource, /globalStats\?\.baseGoldPerHour/, "Online Gold Camp estimates do not use raw Gold production.");
requireMatch(clientCampEstimateSource, /getHarvestBonusBaseRates\(\)/, "Local Camp estimates do not share the raw regular-city production helper.");
assert.doesNotMatch(clientCampEstimateSource, /untimedGoldPerHour|untimedTroopPerHour/, "Client Camp estimates still use permanently boosted production.");
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
assert.equal(serverConfig.playerCosts.skillPresetApplyGold, 1_000_000);

for (const source of [serverSource, clientSource]) {
  requireMatch(source, /economyNumber\(/, "Runtime is not reading the shared economy configuration.");
  requireMatch(source, /rewardSchedule/, "Runtime does not support per-camp reward schedules.");
}
requireMatch(serverSource, /require\("\.\/economy-config\.json"\)/, "Firebase Functions do not load the generated economy config.");
requireMatch(editorServerSource, /\/api\/economy-data/, "Game Editor economy API is missing.");
requireMatch(editorSource, /renderEconomySections/, "Game Editor economy interface is missing.");
requireMatch(editorSource, /data-camp-reward-field="productionHours"/, "Per-camp production-hour editor is missing.");
requireMatch(editorSource, /fixed 20,000-troop neutral garrison/, "Game Editor does not explain fixed camp combat.");
assert.doesNotMatch(editorSource, /camps\.\$\{campType\}\.defenseLevel/, "Game Editor still exposes camp defense level.");
requireMatch(editorServerSource, /baseDefenders: 20_000/, "Game Editor does not enforce the fixed camp garrison.");
assert.doesNotMatch(editorServerSource, /defenseLevel:/, "Game Editor still persists camp defense level.");
requireMatch(serverSource, /const REWARD_CAMP_TROOP_POWER = 1;/, "Server camp troop power is not fixed at 1.00.");
requireMatch(clientSource, /const REWARD_CAMP_TROOP_POWER = 1;/, "Client camp troop power is not fixed at 1.00.");
requireMatch(serverSource, /legacyNeutralCamp[\s\S]*?combatMetadata\.baseDefenders/, "Legacy neutral camps do not normalize to the new 20,000-troop baseline.");
assert.doesNotMatch(clientSource, /troopsRalliedToMain|Rallied home/, "Lost-city troop production can still be rallied to the main city.");
requireMatch(clientSource, /if \(!stillOwned\) continue;[\s\S]*?goldGainedFloat \+= stats\.goldProductionPerSecond/, "Offline production still credits cities that are no longer owned.");

console.log("Validated shared Crownlands economy config, production, upgrades, pickups, camps, shop prices, daily caps, and skills.");
