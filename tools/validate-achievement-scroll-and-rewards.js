const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const game = read("game.js");
const server = read("functions/index.js");
const dailySource = read("functions/dailyMissions.js");
const seasonalSource = read("functions/seasonalAchievements.js");
const daily = require(path.join(root, "functions", "dailyMissions.js"));
const seasonal = require(path.join(root, "functions", "seasonalAchievements.js"));

const helperStart = game.indexOf("function isSeasonalAchievementClaimable");
const helperEnd = game.indexOf("function getCollectibleRewardAlertSummary", helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, "Achievement display helpers are missing from the client.");

const context = {
  modalBody: null,
  window: { clearTimeout() {}, setTimeout() { return 1; } },
  Date,
  renderDailyLoginRewardModal() {},
};
vm.createContext(context);
vm.runInContext(game.slice(helperStart, helperEnd), context);

const entries = [
  { id: "A", order: 0, progress: 2, target: 10, completedAtMs: 0, claimedAtMs: 0 },
  { id: "B", order: 1, progress: 10, target: 10, completedAtMs: 10, claimedAtMs: 11 },
  { id: "C", order: 2, progress: 10, target: 10, completedAtMs: 12, claimedAtMs: 0 },
  { id: "D", order: 3, progress: 1, target: 10, completedAtMs: 0, claimedAtMs: 0 },
  { id: "E", order: 4, progress: 10, target: 10, completedAtMs: 13, claimedAtMs: 0 },
];
const ids = list => Array.from(list, entry => entry.id);
assert.deepEqual(ids(context.sortSeasonalAchievementsForDisplay(entries)), ["C", "E", "A", "B", "D"]);
entries[2].claimedAtMs = 20;
assert.deepEqual(ids(context.sortSeasonalAchievementsForDisplay(entries)), ["E", "A", "B", "C", "D"]);
entries[4].claimedAtMs = 21;
assert.deepEqual(ids(context.sortSeasonalAchievementsForDisplay(entries)), ["A", "B", "C", "D", "E"]);
entries[2].claimedAtMs = 0;
entries[4].claimedAtMs = 0;
assert.deepEqual(
  ids(context.sortSeasonalAchievementsForDisplay(entries.filter(entry => ["A", "C", "D"].includes(entry.id)))),
  ["C", "A", "D"],
  "Category filtering must retain claimable-first and canonical ordering."
);

let rowOrder = ["A", "B", "C", "D", "E"];
const rowHeight = 80;
const list = {
  scrollTop: 130,
  getBoundingClientRect: () => ({ top: 100, bottom: 340 }),
  querySelectorAll: () => rowOrder.map((id, index) => ({
    dataset: { seasonalAchievementToggle: id },
    getBoundingClientRect: () => ({
      top: 100 + index * rowHeight - list.scrollTop,
      bottom: 100 + (index + 1) * rowHeight - list.scrollTop,
    }),
  })),
};
context.modalBody = { querySelector: selector => selector === ".seasonal-achievement-list" ? list : null };
const anchor = context.captureSeasonalAchievementScrollAnchor();
assert.equal(anchor.achievementId, "B", "The first visible Achievement must be used as the scroll anchor.");
rowOrder = ["C", "E", "A", "B", "D"];
list.scrollTop = 0;
context.restoreSeasonalAchievementScrollAnchor(anchor);
const restoredB = list.querySelectorAll().find(row => row.dataset.seasonalAchievementToggle === "B");
assert.equal(
  restoredB.getBoundingClientRect().top - list.getBoundingClientRect().top,
  anchor.offsetTop,
  "A claimable-first reorder must preserve the visible Achievement and its viewport offset."
);

assert.match(game, /Date\.now\(\)\s*<\s*seasonalAchievementListInteractionUntilMs[\s\S]*queueSeasonalAchievementRender/, "Active touch/wheel scrolling is not protected from background rerenders.");
assert.match(game, /touchmove[\s\S]*pointerdown[\s\S]*scroll[\s\S]*event\.isTrusted/, "Achievement interaction tracking is incomplete.");
assert.match(game, /resetAchievementScroll:\s*true/, "Intentional category changes must explicitly reset Achievement scrolling.");
assert.match(game, /restoreSeasonalAchievementScrollAnchor\(achievementScroll\)/, "Achievement rerenders do not restore their local anchor.");

assert.match(server, /function getSeasonalAchievementRewardCapacity[\s\S]*stats\.baseGoldPerHour[\s\S]*stats\.baseTroopPerHour/, "Achievement rewards are not sourced from raw global rates.");
assert.doesNotMatch(
  server.match(/function getSeasonalAchievementRewardCapacity[\s\S]*?\n\}/)?.[0] || "",
  /untimedGoldPerHour|untimedTroopPerHour|stats\.goldPerHour|stats\.troopPerHour/,
  "Achievement rewards still fall back to boosted production."
);
assert.match(server, /buildDailyMissionCapacity[\s\S]*getRewardedAdBaseRates\(economy\)[\s\S]*rewardGoldPerHour[\s\S]*rewardTroopPerHour/, "Daily Quest generation does not reuse the canonical raw-rate helper.");
assert.match(dailySource, /intendedRate[\s\S]*capacity\.rewardTroopPerHour[\s\S]*capacity\.rewardGoldPerHour/, "Daily Quest Gold/Troop rewards still use mission-target production rates.");
assert.match(dailySource, /getCapacitySnapshot[\s\S]*rewardGoldPerHour[\s\S]*rewardTroopPerHour[\s\S]*\.\.\.snapshot/, "Internal raw reward rates must not change the persisted mission schema.");

const raw = { gold: 10_000, troops: 10_000 };
const scenarios = [
  ["raw only", 10_000, 10_000],
  ["production skills", 13_000, 13_000],
  ["Common Gear", 10_200, 10_200],
  ["Strongholds", 10_800, 10_800],
  ["Crown Citadel", 11_000, 11_000],
  ["clan objectives", 10_600, 10_600],
  ["Royal Tax Decree", 15_000, 10_000],
  ["War Drums", 10_000, 13_000],
  ["all bonuses stacked", 19_000, 16_000],
];

for (const [name, normalGold, normalTroops] of scenarios) {
  const capacity = daily.normalizeCapacity({
    cityCount: 5,
    remainingHours: 24,
    goldPerHour: normalGold,
    troopPerHour: normalTroops,
    rewardGoldPerHour: raw.gold,
    rewardTroopPerHour: raw.troops,
  });
  const goldReward = daily.createReward("GOLD_EARNED", "easy", capacity, () => 1);
  const troopReward = daily.createReward("TROOPS_PRODUCED", "easy", capacity, () => 1);
  assert.equal(goldReward.lockedAmount, Math.floor(raw.gold * goldReward.productionHours), `${name} changed the Daily Quest Gold reward.`);
  assert.equal(troopReward.lockedAmount, Math.floor(raw.troops * troopReward.productionHours), `${name} changed the Daily Quest troop reward.`);
  const achievementGold = seasonal.lockReward({ type: "gold", productionHours: 1 }, { goldPerHour: raw.gold, troopPerHour: raw.troops });
  const achievementTroops = seasonal.lockReward({ type: "troops", productionHours: 0.5 }, { goldPerHour: raw.gold, troopPerHour: raw.troops });
  assert.equal(achievementGold.lockedAmount, 10_000, `${name} changed the Achievement Gold reward.`);
  assert.equal(achievementTroops.lockedAmount, 5_000, `${name} changed the Achievement troop reward.`);
  if (name !== "raw only") {
    assert(normalGold > raw.gold || normalTroops > raw.troops, `${name} must represent an active normal-production bonus.`);
  }
}

const generated = daily.createDailyMissionState({
  uid: "raw-reward-validator",
  worldId: "world",
  resetGeneration: "reset",
  nowMs: Date.UTC(2026, 7, 21, 12),
  capacity: {
    cityCount: 5,
    totalCityLevels: 50,
    averageCityLevel: 10,
    gold: 1_000_000,
    goldPerHour: 19_000,
    troopPerHour: 16_000,
    rewardGoldPerHour: 10_000,
    rewardTroopPerHour: 10_000,
    launchableTroops: 100_000,
    maxSourceTroops: 100_000,
    qualifyingAttackTroops: 5_000,
    projectedCombatTroops: 200_000,
    eligibleOpponentCount: 2,
    safePvpTargets: [],
    feasibleCampTypes: ["gold", "troops", "items"],
    maxCampCaptures: 3,
    deedCampEligible: false,
    strongholdEligible: true,
    clanGiftEligible: true,
    upgradeTargets: {
      easy: { totalLevels: 1, singleCityLevels: 1, uniqueCities: 1, goldSpendTarget: 100 },
      medium: { totalLevels: 2, singleCityLevels: 2, uniqueCities: 2, goldSpendTarget: 200 },
      hard: { totalLevels: 3, singleCityLevels: 3, uniqueCities: 3, goldSpendTarget: 300 },
    },
    itemCosts: {},
  },
});
assert.equal(generated.capacitySnapshot.rewardGoldPerHour, undefined, "Internal raw Gold reward rate leaked into stored state.");
assert.equal(generated.capacitySnapshot.rewardTroopPerHour, undefined, "Internal raw troop reward rate leaked into stored state.");

const achievementRewards = seasonal.ACHIEVEMENT_DEFINITIONS.map(entry => entry.reward);
assert(achievementRewards.filter(reward => reward.type === "item").length > 0, "The non-production Achievement item inventory disappeared.");
assert(achievementRewards.filter(reward => ["gold", "troops"].includes(reward.type)).every(reward => reward.productionHours > 0), "All numeric Achievement rewards must remain production-derived.");
assert.match(seasonalSource, /if \(type === "item"\)[\s\S]*itemId/, "Achievement item rewards changed unexpectedly.");
assert.match(dailySource, /getHardItemCandidates[\s\S]*royal_tax_decree_30m[\s\S]*war_drums_30m/, "Daily Quest non-production item rewards changed unexpectedly.");

console.log("Validated stable Achievement scrolling, claimable-first sorting, and raw/base Achievement and Daily Quest rewards.");
