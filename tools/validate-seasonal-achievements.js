const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const seasonal = require(path.join(root, "functions", "seasonalAchievements.js"));

const {
  ACHIEVEMENT_DEFINITIONS,
  DIFFICULTY_REWARD_HOURS,
  createSeasonalAchievementState,
  getSeasonalAchievementCycle,
  reconcileSeasonalAchievementState,
  applySeasonalAchievementEvent,
} = seasonal;

assert.equal(ACHIEVEMENT_DEFINITIONS.length, 40, "Seasonal Achievements must contain exactly 40 definitions.");
assert.equal(new Set(ACHIEVEMENT_DEFINITIONS.map(entry => entry.id)).size, 40, "Achievement IDs must be unique.");

const difficultyCounts = ACHIEVEMENT_DEFINITIONS.reduce((counts, entry) => {
  counts[entry.difficulty] = (counts[entry.difficulty] || 0) + 1;
  return counts;
}, {});
assert.deepEqual(difficultyCounts, { easy: 10, medium: 12, hard: 10, very_hard: 6, prestige: 2 });
assert.deepEqual(DIFFICULTY_REWARD_HOURS, { easy: 0.5, medium: 1, hard: 2, very_hard: 3, prestige: 6 });
assert.deepEqual(
  [...new Set(ACHIEVEMENT_DEFINITIONS.map(entry => entry.category))].sort(),
  ["camps", "clan", "combat", "conquest", "crown", "daily", "growth", "strongholds"]
);

const expectedChains = {
  enemy_city_captures: [1, 10, 25, 50, 100, 200, 350, 500],
  battle_wins: [10, 25, 75, 150],
  attacks_launched: [50, 150],
  camp_captures: [5, 15, 30, 60, 100, 150],
  city_levels_gained: [100, 250, 500, 1000, 2000, 3500],
  stronghold_captures: [1, 3, 10],
  citadel_captures: [1, 3],
  clan_gifts: [5, 15],
  daily_missions: [20, 50],
};
Object.entries(expectedChains).forEach(([metric, targets]) => {
  assert.deepEqual(
    ACHIEVEMENT_DEFINITIONS.filter(entry => entry.metric === metric).map(entry => entry.target),
    targets,
    `${metric} targets drifted from the approved season design.`
  );
});

const atAugustEnd = Date.UTC(2026, 7, 31, 23, 59, 59, 999);
const august = getSeasonalAchievementCycle(atAugustEnd, "generation-a");
const september = getSeasonalAchievementCycle(atAugustEnd + 1, "generation-a");
assert.equal(august.monthKey, "2026-08");
assert.equal(september.monthKey, "2026-09");
assert.notEqual(august.seasonId, september.seasonId, "UTC month rollover must create a new season.");
assert.notEqual(august.seasonId, getSeasonalAchievementCycle(atAugustEnd, "generation-b").seasonId, "Realm resets must create a new season identity.");

const context = {
  uid: "player-one",
  worldId: "world-one",
  resetGeneration: "generation-a",
  nowMs: Date.UTC(2026, 7, 10, 12),
};
const capacity = { goldPerHour: 1200, troopPerHour: 800 };
const getProgress = (state, id) => state.achievements.find(entry => entry.id === id);
const progress = (state, event) => applySeasonalAchievementEvent(state, event, capacity, event.occurredAtMs || context.nowMs).state;
let state = createSeasonalAchievementState(context);
assert.equal(state.achievements.length, 40);

state = progress(state, { type: "BATTLE_RESOLVED", targetCategory: "neutral_city", success: true, cityCaptured: true, occurredAtMs: context.nowMs });
assert.equal(getProgress(state, "first_blood").progress, 0, "Neutral cities must not count for Conquest.");
assert.equal(getProgress(state, "battle_tested").progress, 0, "Neutral battles must not count for ordinary-player Combat.");
state = progress(state, { type: "BATTLE_RESOLVED", targetCategory: "stronghold", success: true, cityCaptured: true, committedTroops: 100, occurredAtMs: context.nowMs + 1 });
assert.equal(getProgress(state, "first_blood").progress, 0, "Strongholds must not count for Conquest.");
assert.equal(getProgress(state, "stronghold_veteran").progress, 1, "Stronghold battles must count participation.");
state = progress(state, { type: "BATTLE_RESOLVED", targetCategory: "player_city", success: true, cityCaptured: true, committedTroops: 100, occurredAtMs: context.nowMs + 2 });
assert.equal(getProgress(state, "first_blood").progress, 1);
assert.equal(getProgress(state, "battle_tested").progress, 1);
assert.equal(getProgress(state, "first_blood").lockedReward.lockedAmount, 400, "Troop reward must lock the completion-time production snapshot.");
const firstBloodCompletion = getProgress(state, "first_blood").completedAtMs;
state = progress(state, { type: "BATTLE_RESOLVED", targetCategory: "player_city", success: true, cityCaptured: true, committedTroops: 100, occurredAtMs: context.nowMs + 3 });
assert.equal(getProgress(state, "first_blood").progress, 1, "Completed achievements must not accumulate or relock.");
assert.equal(getProgress(state, "first_blood").completedAtMs, firstBloodCompletion);

state = progress(state, { type: "ATTACK_LAUNCHED", targetCategory: "player_city", committedTroops: 1, occurredAtMs: context.nowMs + 4 });
assert.equal(getProgress(state, "war_marches_i").progress, 1);
state = progress(state, { type: "CAMP_CAPTURED", targetCategory: "camp", success: true, campCaptured: true, occurredAtMs: context.nowMs + 5 });
assert.equal(getProgress(state, "camp_raider_i").progress, 1);
state = progress(state, { type: "CITY_UPGRADED", levelsGained: 25, occurredAtMs: context.nowMs + 6 });
assert.equal(getProgress(state, "builder_i").progress, 25);
for (const [index, strongholdType] of ["gold", "training", "speed", "defense", "citadel"].entries()) {
  state = progress(state, { type: "STRONGHOLD_CAPTURED", strongholdType, occurredAtMs: context.nowMs + 10 + index });
}
assert.equal(getProgress(state, "stronghold_raider").progress, 1);
assert.equal(getProgress(state, "master_of_strongholds").progress, 4, "Only the four real Stronghold types must count.");
assert.equal(getProgress(state, "master_of_strongholds").lockedReward.itemId, "swift_march_order");

state = progress(state, { type: "CITADEL_CAPTURED", attackerPlayerId: "player-one", previousKingPlayerId: "player-two", occurredAtMs: context.nowMs + 20 });
assert.equal(getProgress(state, "claim_the_crown").progress, 1);
assert.equal(getProgress(state, "kingmaker").progress, 1);
assert.equal(getProgress(state, "kingmaker").lockedReward.itemId, "recall_horn");
state = progress(state, { type: "LONG_REIGN_PROGRESS", heldMs: 24 * 3_600_000, occurredAtMs: context.nowMs + 21 });
assert.equal(getProgress(state, "long_reign").progress, 24);
assert.equal(getProgress(state, "long_reign").lockedReward.lockedAmount, 7200);

for (let index = 0; index < 5; index += 1) {
  state = progress(state, { type: "CLAN_GIFT_SENT", clanGiftSent: true, occurredAtMs: context.nowMs + 30 + index });
}
assert.equal(getProgress(state, "clan_supporter").progress, 5);
state = progress(state, { type: "DAILY_MISSIONS_COMPLETED", count: 7, occurredAtMs: context.nowMs + 40 });
assert.equal(getProgress(state, "daily_orders").progress, 7);
state = progress(state, { type: "DAILY_ALL_COMPLETED", dateKey: "2026-08-10", occurredAtMs: context.nowMs + 41 });
state = progress(state, { type: "DAILY_ALL_COMPLETED", dateKey: "2026-08-10", occurredAtMs: context.nowMs + 42 });
assert.equal(getProgress(state, "dedicated_lord").progress, 1, "A 3/3 day must count only once.");

const reconciled = reconcileSeasonalAchievementState(state, { ...context, nowMs: context.nowMs + 50 });
assert.equal(getProgress(reconciled, "first_blood").progress, 1, "Current-season reconciliation must preserve progress.");
const reset = reconcileSeasonalAchievementState(state, { ...context, nowMs: Date.UTC(2026, 8, 1) });
assert.equal(getProgress(reset, "first_blood").progress, 0, "A new UTC month must reset progress.");
assert.equal(reset.claimedCount, 0);

const functions = read("functions/index.js");
const client = read("firebaseClient.js");
const game = read("game.js");
const html = read("index.html");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}\n${read("daily-rewards.css")}`;
const rules = read("firestore.rules");
const artManifest = JSON.parse(read("assets/optimized/manifest.json"));

assert.match(functions, /exports\.getSeasonalAchievementStatus[\s\S]*exports\.claimSeasonalAchievementReward/, "Season status and manual claim callables are missing.");
assert.match(functions, /seasonalAchievementProcessedAtMs[\s\S]*processSeasonalAchievementActionEvent/, "Validated action events are not idempotent.");
assert.match(functions, /exports\.applySeasonalRealmAchievementEvent[\s\S]*exports\.evaluateSeasonalAchievementReigns/, "Realm captures or continuous reign evaluation are missing.");
assert.match(functions, /lockedReward[\s\S]*claimReceipt[\s\S]*replayed:\s*true/, "Reward locking or duplicate-claim replay protection is missing.");
assert.match(client, /getSeasonalAchievementStatus[\s\S]*claimSeasonalAchievementReward[\s\S]*subscribeSeasonalAchievementState/, "The client Seasonal Achievement API is incomplete.");
assert.match(rules, /match \/seasonalAchievements\/\{seasonId\}[\s\S]*allow read:[\s\S]*allow create, update, delete:\s*if false/, "Private server-authoritative achievement rules are missing.");
assert.match(game, /renderSeasonalAchievementTab[\s\S]*data-seasonal-achievement-filter[\s\S]*data-seasonal-achievement-claim/, "Achievement filters or manual claims are not rendered.");
assert.match(game, /expandedSeasonalAchievementId[\s\S]*data-seasonal-achievement-toggle[\s\S]*aria-expanded[\s\S]*getSeasonalAchievementRequirementNote/, "Compact expandable achievement requirements are missing.");
assert.match(game, /event\.target\.closest\("button, a"\)[\s\S]*event\.stopPropagation\(\)/, "Achievement claims must not toggle expandable rows.");
assert.match(game, /getCollectibleRewardAlertSummary[\s\S]*daily-reward-tab-alert/, "Unified collectible reward alerts are missing.");
assert.match(html, /profileAchievementCompleted[\s\S]*profileViewAchievementsBtn/, "The compact Player Profile summary is missing.");
assert.match(styles, /\.seasonal-achievement-list[\s\S]*overflow-y:\s*auto/, "The compact/mobile achievement list is missing its contained scrolling behavior.");
assert.match(styles, /\.daily-login-reward-modal \.modal-card\s*\{[\s\S]*height:\s*min\(94dvh,\s*780px\)[\s\S]*#modalBody\s*\{[\s\S]*height:\s*100%[\s\S]*display:\s*grid/, "The reward modal does not give Achievements a bounded visible height.");
assert.match(styles, /\.seasonal-achievement-tab-panel\s*\{[\s\S]*height:\s*100%[\s\S]*\.seasonal-achievement-list\s*\{[\s\S]*overflow-y:\s*auto[\s\S]*scroll-padding-bottom/, "The full Achievement list is not reachable inside the modal.");
assert.match(styles, /\.seasonal-achievement-details[\s\S]*grid-column:\s*1\s*\/\s*-1[\s\S]*\[hidden\]\s*\{\s*display:\s*none/, "Expandable achievement details are not compact or collapsible.");
assert.match(styles, /\.daily-reward-tab-alert[\s\S]*#ff5148/, "The red claimable tab alert style is missing.");
const achievementAsset = artManifest.assets.find(entry => entry.id === "hud-achievements");
assert(achievementAsset?.hasAlpha && achievementAsset.width === 192 && achievementAsset.height === 192, "The optimized transparent Achievement icon is missing.");
assert(game.includes(achievementAsset.output), "The reward center does not use the optimized Achievement icon.");

console.log("Validated 40 monthly server-authoritative Seasonal Achievements, locked rewards, UI filters, alerts, and icon integration.");
