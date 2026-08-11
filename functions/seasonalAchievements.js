const SEASONAL_ACHIEVEMENT_VERSION = 1;
const SEASONAL_ACHIEVEMENT_SCHEMA_VERSION = 1;
const SEASONAL_ACHIEVEMENT_DEFINITION_VERSION = 1;
const SEASONAL_ACHIEVEMENT_COUNT = 40;
const LONG_REIGN_TARGET_HOURS = 24;

const DIFFICULTY_REWARD_HOURS = Object.freeze({
  easy: 0.5,
  medium: 1,
  hard: 2,
  very_hard: 3,
  prestige: 6,
});

const CATEGORY_LABELS = Object.freeze({
  conquest: "Conquest",
  combat: "Combat",
  camps: "Camps",
  growth: "Growth",
  strongholds: "Strongholds",
  crown: "Crown",
  clan: "Clan",
  daily: "Daily",
});

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInt(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.floor(Math.min(maximum, Math.max(minimum, safeNumber(value, minimum))));
}

function safeString(value, maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

function getUtcMonthCycle(nowMs = Date.now()) {
  const serverTimeMs = Math.max(0, Math.floor(safeNumber(nowMs, Date.now())));
  const date = new Date(serverTimeMs);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const startsAtMs = Date.UTC(year, monthIndex, 1);
  const endsAtMs = Date.UTC(year, monthIndex + 1, 1);
  return {
    monthKey,
    startsAtMs,
    endsAtMs,
    serverTimeMs,
    daysRemaining: Math.max(0, Math.ceil((endsAtMs - serverTimeMs) / 86_400_000)),
  };
}

function getSeasonalAchievementCycle(nowMs = Date.now(), resetGeneration = "") {
  const month = getUtcMonthCycle(nowMs);
  const reset = safeString(resetGeneration, 120).replace(/[^a-zA-Z0-9_-]/g, "_") || "realm";
  return {
    ...month,
    seasonId: `${reset}_${month.monthKey}`,
  };
}

function productionReward(type, difficulty, hours = DIFFICULTY_REWARD_HOURS[difficulty]) {
  return Object.freeze({ type, productionHours: hours });
}

function itemReward(itemId) {
  return Object.freeze({ type: "item", itemId, lockedAmount: 1 });
}

function definition(id, category, difficulty, title, description, metric, target, reward, icon) {
  return Object.freeze({
    id,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    difficulty,
    title,
    description,
    metric,
    target,
    reward,
    icon,
  });
}

const ACHIEVEMENT_DEFINITIONS = Object.freeze([
  definition("first_blood", "conquest", "easy", "First Blood", "Capture 1 enemy city", "enemy_city_captures", 1, productionReward("troops", "easy"), "castle"),
  definition("raider", "conquest", "easy", "Raider", "Capture 10 enemy cities", "enemy_city_captures", 10, productionReward("troops", "easy"), "castle"),
  definition("conqueror_i", "conquest", "medium", "Conqueror I", "Capture 25 enemy cities", "enemy_city_captures", 25, productionReward("troops", "medium"), "banner"),
  definition("conqueror_ii", "conquest", "medium", "Conqueror II", "Capture 50 enemy cities", "enemy_city_captures", 50, productionReward("troops", "medium"), "banner"),
  definition("conqueror_iii", "conquest", "hard", "Conqueror III", "Capture 100 enemy cities", "enemy_city_captures", 100, productionReward("troops", "hard"), "banner"),
  definition("conqueror_iv", "conquest", "hard", "Conqueror IV", "Capture 200 enemy cities", "enemy_city_captures", 200, productionReward("troops", "hard"), "banner"),
  definition("conqueror_v", "conquest", "very_hard", "Conqueror V", "Capture 350 enemy cities", "enemy_city_captures", 350, productionReward("troops", "very_hard"), "crown"),
  definition("realm_conqueror", "conquest", "prestige", "Realm Conqueror", "Capture 500 enemy cities", "enemy_city_captures", 500, productionReward("troops", "prestige"), "crown"),

  definition("battle_tested", "combat", "easy", "Battle Tested", "Win 10 offensive battles", "battle_wins", 10, productionReward("troops", "easy"), "swords"),
  definition("veteran", "combat", "medium", "Veteran", "Win 25 offensive battles", "battle_wins", 25, productionReward("troops", "medium"), "swords"),
  definition("warlord", "combat", "hard", "Warlord", "Win 75 offensive battles", "battle_wins", 75, productionReward("troops", "hard"), "helmet"),
  definition("battle_master", "combat", "very_hard", "Battle Master", "Win 150 offensive battles", "battle_wins", 150, productionReward("troops", "very_hard"), "helmet"),
  definition("war_marches_i", "combat", "medium", "War Marches I", "Launch 50 attacks", "attacks_launched", 50, productionReward("troops", "medium"), "march"),
  definition("war_marches_ii", "combat", "hard", "War Marches II", "Launch 150 attacks", "attacks_launched", 150, productionReward("troops", "hard"), "march"),

  definition("camp_raider_i", "camps", "easy", "Camp Raider I", "Capture 5 camps", "camp_captures", 5, productionReward("gold", "easy"), "camp"),
  definition("camp_raider_ii", "camps", "easy", "Camp Raider II", "Capture 15 camps", "camp_captures", 15, productionReward("troops", "easy"), "camp"),
  definition("camp_raider_iii", "camps", "medium", "Camp Raider III", "Capture 30 camps", "camp_captures", 30, productionReward("gold", "medium"), "camp"),
  definition("camp_raider_iv", "camps", "medium", "Camp Raider IV", "Capture 60 camps", "camp_captures", 60, productionReward("troops", "medium"), "camp"),
  definition("camp_raider_v", "camps", "medium", "Camp Raider V", "Capture 100 camps", "camp_captures", 100, productionReward("gold", "medium"), "camp"),
  definition("camp_raider_vi", "camps", "hard", "Camp Raider VI", "Capture 150 camps", "camp_captures", 150, productionReward("troops", "hard"), "camp"),

  definition("builder_i", "growth", "easy", "Builder I", "Upgrade 100 total city levels", "city_levels_gained", 100, productionReward("gold", "easy"), "hammer"),
  definition("builder_ii", "growth", "easy", "Builder II", "Upgrade 250 total city levels", "city_levels_gained", 250, productionReward("gold", "easy"), "hammer"),
  definition("builder_iii", "growth", "easy", "Builder III", "Upgrade 500 total city levels", "city_levels_gained", 500, productionReward("gold", "easy"), "tower"),
  definition("builder_iv", "growth", "medium", "Builder IV", "Upgrade 1,000 total city levels", "city_levels_gained", 1000, productionReward("gold", "medium"), "tower"),
  definition("master_builder", "growth", "hard", "Master Builder", "Upgrade 2,000 total city levels", "city_levels_gained", 2000, productionReward("gold", "hard"), "city"),
  definition("architect_of_the_realm", "growth", "very_hard", "Architect of the Realm", "Upgrade 3,500 total city levels", "city_levels_gained", 3500, productionReward("gold", "very_hard"), "city"),

  definition("stronghold_raider", "strongholds", "medium", "Stronghold Raider", "Capture your first Stronghold", "stronghold_captures", 1, productionReward("troops", "medium"), "stronghold"),
  definition("stronghold_breaker", "strongholds", "medium", "Stronghold Breaker", "Capture 3 Strongholds", "stronghold_captures", 3, productionReward("troops", "medium"), "stronghold"),
  definition("fortress_conqueror", "strongholds", "hard", "Fortress Conqueror", "Capture 10 Strongholds", "stronghold_captures", 10, productionReward("troops", "hard"), "stronghold"),
  definition("master_of_strongholds", "strongholds", "very_hard", "Master of Strongholds", "Capture every Stronghold type", "stronghold_types", 4, itemReward("swift_march_order"), "stronghold"),
  definition("stronghold_veteran", "strongholds", "hard", "Stronghold Veteran", "Participate in 25 Stronghold battles", "stronghold_battles", 25, productionReward("troops", "hard"), "siege"),

  definition("claim_the_crown", "crown", "hard", "Claim the Crown", "Become King once", "citadel_captures", 1, productionReward("troops", "hard"), "crown"),
  definition("kingmaker", "crown", "very_hard", "Kingmaker", "Overthrow the current King", "king_overthrows", 1, itemReward("recall_horn"), "crown"),
  definition("crowned_again", "crown", "very_hard", "Crowned Again", "Become King 3 separate times", "citadel_captures", 3, itemReward("shield_12h"), "crown"),
  definition("long_reign", "crown", "prestige", "Long Reign", "Hold the Crown Citadel continuously for 24 hours", "long_reign_hours", LONG_REIGN_TARGET_HOURS, productionReward("gold", "prestige"), "crown"),

  definition("clan_supporter", "clan", "easy", "Clan Supporter", "Send 5 Clan Gifts", "clan_gifts", 5, productionReward("gold", "easy"), "gift"),
  definition("brother_in_arms", "clan", "medium", "Brother in Arms", "Send 15 Clan Gifts", "clan_gifts", 15, productionReward("gold", "medium"), "gift"),

  definition("daily_orders", "daily", "easy", "Daily Orders", "Complete 20 Daily Missions", "daily_missions", 20, productionReward("gold", "easy"), "scroll"),
  definition("daily_veteran", "daily", "medium", "Daily Veteran", "Complete 50 Daily Missions", "daily_missions", 50, productionReward("troops", "medium"), "scroll"),
  definition("dedicated_lord", "daily", "hard", "Dedicated Lord", "Complete all 3 Daily Missions on 10 different days", "daily_three_days", 10, productionReward("gold", "hard"), "seal"),
]);

function createAchievementRecord(entry) {
  return {
    id: entry.id,
    order: ACHIEVEMENT_DEFINITIONS.indexOf(entry),
    category: entry.category,
    categoryLabel: entry.categoryLabel,
    difficulty: entry.difficulty,
    title: entry.title,
    description: entry.description,
    metric: entry.metric,
    icon: entry.icon,
    target: entry.target,
    progress: 0,
    uniqueProgressKeys: [],
    rewardSpec: { ...entry.reward },
    lockedReward: null,
    completedAtMs: 0,
    claimedAtMs: 0,
    claimRequestId: "",
    claimReceipt: null,
  };
}

function createSeasonalAchievementState({ uid = "", worldId = "", resetGeneration = "", nowMs = Date.now() } = {}) {
  const cycle = getSeasonalAchievementCycle(nowMs, resetGeneration);
  return {
    schemaVersion: SEASONAL_ACHIEVEMENT_SCHEMA_VERSION,
    achievementVersion: SEASONAL_ACHIEVEMENT_VERSION,
    definitionVersion: SEASONAL_ACHIEVEMENT_DEFINITION_VERSION,
    uid: safeString(uid, 128),
    worldId: safeString(worldId, 128),
    resetGeneration: safeString(resetGeneration, 128),
    seasonId: cycle.seasonId,
    monthKey: cycle.monthKey,
    seasonStartsAtMs: cycle.startsAtMs,
    seasonEndsAtMs: cycle.endsAtMs,
    generatedAtMs: cycle.serverTimeMs,
    achievements: ACHIEVEMENT_DEFINITIONS.map(createAchievementRecord),
    completedCount: 0,
    claimedCount: 0,
    lastCompletedAtMs: 0,
    updatedAtMs: cycle.serverTimeMs,
  };
}

function reconcileSeasonalAchievementState(raw = {}, context = {}) {
  const fresh = createSeasonalAchievementState(context);
  if (!raw || raw.seasonId !== fresh.seasonId) return fresh;
  const existing = new Map((Array.isArray(raw.achievements) ? raw.achievements : []).map(entry => [entry?.id, entry]));
  const achievements = fresh.achievements.map(record => {
    const prior = existing.get(record.id);
    if (!prior) return record;
    const progress = Math.min(record.target, Math.max(0, safeNumber(prior.progress, 0)));
    return {
      ...record,
      progress,
      uniqueProgressKeys: [...new Set((Array.isArray(prior.uniqueProgressKeys) ? prior.uniqueProgressKeys : [])
        .map(key => safeString(key, 128)).filter(Boolean))].slice(0, record.target),
      lockedReward: prior.lockedReward && typeof prior.lockedReward === "object" ? { ...prior.lockedReward } : null,
      completedAtMs: Math.max(0, clampInt(prior.completedAtMs, 0)),
      claimedAtMs: Math.max(0, clampInt(prior.claimedAtMs, 0)),
      claimRequestId: safeString(prior.claimRequestId, 96),
      claimReceipt: prior.claimReceipt && typeof prior.claimReceipt === "object" ? { ...prior.claimReceipt } : null,
    };
  });
  return {
    ...fresh,
    generatedAtMs: Math.max(0, clampInt(raw.generatedAtMs, fresh.generatedAtMs)),
    achievements,
    completedCount: achievements.filter(entry => entry.completedAtMs || entry.claimedAtMs).length,
    claimedCount: achievements.filter(entry => entry.claimedAtMs).length,
    lastCompletedAtMs: Math.max(0, clampInt(raw.lastCompletedAtMs, 0)),
    updatedAtMs: Math.max(0, clampInt(raw.updatedAtMs, fresh.updatedAtMs)),
  };
}

function normalizeAchievementEvent(raw = {}) {
  return {
    type: safeString(raw.type || raw.eventType, 48).toUpperCase(),
    occurredAtMs: Math.max(0, clampInt(raw.occurredAtMs, Date.now())),
    targetCategory: safeString(raw.targetCategory, 32).toLowerCase(),
    committedTroops: Math.max(0, clampInt(raw.committedTroops, 0)),
    levelsGained: Math.max(0, clampInt(raw.levelsGained, 0)),
    success: Boolean(raw.success),
    cityCaptured: Boolean(raw.cityCaptured),
    campCaptured: Boolean(raw.campCaptured),
    clanGiftSent: Boolean(raw.clanGiftSent),
    strongholdType: safeString(raw.strongholdType, 32).toLowerCase(),
    previousKingPlayerId: safeString(raw.previousKingPlayerId, 128),
    attackerPlayerId: safeString(raw.attackerPlayerId, 128),
    count: Math.max(0, clampInt(raw.count, 0)),
    dateKey: safeString(raw.dateKey, 10),
    heldMs: Math.max(0, clampInt(raw.heldMs, 0)),
  };
}

function lockReward(rewardSpec = {}, capacity = {}) {
  const type = safeString(rewardSpec.type, 16);
  if (type === "item") {
    return {
      type: "item",
      itemId: safeString(rewardSpec.itemId, 64),
      lockedAmount: Math.max(1, clampInt(rewardSpec.lockedAmount, 1)),
      productionHours: 0,
    };
  }
  const productionHours = Math.max(0.1, safeNumber(rewardSpec.productionHours, 0.5));
  const rate = type === "troops"
    ? Math.max(1, clampInt(capacity.troopPerHour, 1))
    : Math.max(1, clampInt(capacity.goldPerHour, 1));
  return {
    type: type === "troops" ? "troops" : "gold",
    lockedAmount: Math.max(1, Math.floor(rate * productionHours)),
    productionHours,
  };
}

function progressAchievement(record, event, capacity, completedAtMs) {
  if (!record?.id || record.completedAtMs || record.claimedAtMs) return { record, completed: false };
  let progress = Math.max(0, safeNumber(record.progress, 0));
  let uniqueProgressKeys = Array.isArray(record.uniqueProgressKeys) ? [...record.uniqueProgressKeys] : [];
  const ordinaryPlayerCity = event.targetCategory === "player_city";
  const validStrongholdType = ["gold", "training", "speed", "defense"].includes(event.strongholdType);

  if (record.metric === "enemy_city_captures" && event.type === "BATTLE_RESOLVED" && ordinaryPlayerCity && event.cityCaptured) progress += 1;
  if (record.metric === "battle_wins" && event.type === "BATTLE_RESOLVED" && ordinaryPlayerCity && event.success) progress += 1;
  if (record.metric === "attacks_launched" && event.type === "ATTACK_LAUNCHED" && ordinaryPlayerCity && event.committedTroops > 0) progress += 1;
  if (record.metric === "camp_captures" && event.type === "CAMP_CAPTURED" && event.targetCategory === "camp" && event.success && event.campCaptured) progress += 1;
  if (record.metric === "city_levels_gained" && event.type === "CITY_UPGRADED") progress += event.levelsGained;
  if (record.metric === "stronghold_captures" && event.type === "STRONGHOLD_CAPTURED" && validStrongholdType) progress += 1;
  if (record.metric === "stronghold_types" && event.type === "STRONGHOLD_CAPTURED") {
    const type = event.strongholdType;
    if (validStrongholdType && !uniqueProgressKeys.includes(type)) {
      uniqueProgressKeys.push(type);
      progress = uniqueProgressKeys.length;
    }
  }
  if (record.metric === "stronghold_battles" && event.type === "BATTLE_RESOLVED" && event.targetCategory === "stronghold" && event.committedTroops > 0) progress += 1;
  if (record.metric === "citadel_captures" && event.type === "CITADEL_CAPTURED") progress += 1;
  if (record.metric === "king_overthrows" && event.type === "CITADEL_CAPTURED" && event.previousKingPlayerId && event.previousKingPlayerId !== event.attackerPlayerId) progress += 1;
  if (record.metric === "long_reign_hours" && event.type === "LONG_REIGN_PROGRESS") progress = Math.max(progress, event.heldMs / 3_600_000);
  if (record.metric === "clan_gifts" && event.type === "CLAN_GIFT_SENT" && event.clanGiftSent) progress += 1;
  if (record.metric === "daily_missions" && event.type === "DAILY_MISSIONS_COMPLETED") progress += event.count;
  if (record.metric === "daily_three_days" && event.type === "DAILY_ALL_COMPLETED" && /^\d{4}-\d{2}-\d{2}$/.test(event.dateKey)) {
    if (!uniqueProgressKeys.includes(event.dateKey)) {
      uniqueProgressKeys.push(event.dateKey);
      progress = uniqueProgressKeys.length;
    }
  }

  progress = Math.min(record.target, Math.max(0, progress));
  const completed = progress >= record.target;
  return {
    completed,
    record: {
      ...record,
      progress,
      uniqueProgressKeys: uniqueProgressKeys.slice(0, record.target),
      ...(completed ? {
        completedAtMs,
        lockedReward: record.lockedReward || lockReward(record.rewardSpec, capacity),
      } : {}),
    },
  };
}

function applySeasonalAchievementEvent(state = {}, rawEvent = {}, capacity = {}, nowMs = Date.now()) {
  const event = normalizeAchievementEvent(rawEvent);
  const completedAtMs = Math.max(1, event.occurredAtMs || clampInt(nowMs, 1));
  const newlyCompletedIds = [];
  const achievements = (Array.isArray(state.achievements) ? state.achievements : []).map(record => {
    const result = progressAchievement(record, event, capacity, completedAtMs);
    if (result.completed) newlyCompletedIds.push(result.record.id);
    return result.record;
  });
  return {
    state: {
      ...state,
      achievements,
      completedCount: achievements.filter(entry => entry.completedAtMs || entry.claimedAtMs).length,
      claimedCount: achievements.filter(entry => entry.claimedAtMs).length,
      lastCompletedAtMs: newlyCompletedIds.length ? completedAtMs : Math.max(0, clampInt(state.lastCompletedAtMs, 0)),
      updatedAtMs: Math.max(1, clampInt(nowMs, 1)),
    },
    newlyCompletedIds,
  };
}

module.exports = {
  SEASONAL_ACHIEVEMENT_VERSION,
  SEASONAL_ACHIEVEMENT_SCHEMA_VERSION,
  SEASONAL_ACHIEVEMENT_DEFINITION_VERSION,
  SEASONAL_ACHIEVEMENT_COUNT,
  LONG_REIGN_TARGET_HOURS,
  DIFFICULTY_REWARD_HOURS,
  CATEGORY_LABELS,
  ACHIEVEMENT_DEFINITIONS,
  getUtcMonthCycle,
  getSeasonalAchievementCycle,
  createSeasonalAchievementState,
  reconcileSeasonalAchievementState,
  normalizeAchievementEvent,
  lockReward,
  applySeasonalAchievementEvent,
};
