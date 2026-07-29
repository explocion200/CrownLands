const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { FieldPath, FieldValue, getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const SERVER_WORLD_LAYOUT = require("./world-layout.json");
const ECONOMY_CONFIG = require("./economy-config.json");
const REALM_CONFIG = require("./release-config.json");

function safeConfigString(value, fallback = "") {
  const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  return cleaned || fallback;
}

admin.initializeApp();

const db = getFirestore();

function economyNumber(path, fallback) {
  const value = String(path || "").split(".").filter(Boolean).reduce((current, key) => current?.[key], ECONOMY_CONFIG);
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function economyRewardSchedule(campType, fallback = []) {
  const schedule = ECONOMY_CONFIG?.camps?.[campType]?.rewardSchedule;
  if (!Array.isArray(schedule) || !schedule.length) return fallback;
  return schedule.map(entry => ({
    minimumReward: Math.max(0, Math.floor(Number(entry?.minimumReward) || 0)),
    productionHours: Math.max(0, Number(entry?.productionHours) || 0),
  }));
}

const REALM_RELEASE_ID = safeConfigString(REALM_CONFIG.releaseId, "crownlands-2026-07-27-camp-hours-v2");
const RESET_GENERATION = safeConfigString(REALM_CONFIG.resetGeneration, "fresh-2026-07-26-server-reset");
const ONLINE_WORLD_ID = safeConfigString(REALM_CONFIG.worldId, `main-${RESET_GENERATION}`);
const TEST_STARTING_GOLD = 100;
const PLAYER_STARTING_TROOPS = 200;
const PLAYER_NAME_MAX_LENGTH = 18;
const MILLION_LORDS_CITY_PRODUCTION_VP_BASE = economyNumber("cityEconomy.productionVpBase", 20);
const MILLION_LORDS_CITY_PRODUCTION_VP_GROWTH = economyNumber("cityEconomy.productionVpGrowth", 1.115);
const MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP = economyNumber("cityEconomy.goldPerProductionVp", 15);
const CITY_GOLD_ENDGAME_START_LEVEL = economyNumber("cityEconomy.goldEndgameStartLevel", 100);
const CITY_GOLD_ENDGAME_GROWTH = economyNumber("cityEconomy.goldEndgameGrowth", 1.08);
const CITY_UPGRADE_EARLY_END_LEVEL = economyNumber("cityEconomy.upgradeEarlyEndLevel", 50);
const CITY_UPGRADE_MID_END_LEVEL = economyNumber("cityEconomy.upgradeMidEndLevel", 100);
const CITY_UPGRADE_EARLY_START_HOURS = economyNumber("cityEconomy.upgradeEarlyStartHours", 0.1);
const CITY_UPGRADE_EARLY_END_HOURS = economyNumber("cityEconomy.upgradeEarlyEndHours", 4);
const CITY_UPGRADE_MID_END_HOURS = economyNumber("cityEconomy.upgradeMidEndHours", 36);
const CITY_UPGRADE_END_LEVEL_150_HOURS = economyNumber("cityEconomy.upgradeLevel150Hours", 240);
const CITY_UPGRADE_MAX_TARGET_HOURS = economyNumber("cityEconomy.upgradeMaximumHours", 720);
const BASE_TROOP_ATTACK_POWER = 2;
const DEFAULT_MARCH_PERCENT = 0.5;
const DAILY_NEUTRAL_CAPTURE_LIMIT = 30;
const NEUTRAL_CITY_COUNT_LIMIT = 30;
const HARVEST_BONUS_DAILY_LIMIT = economyNumber("pickups.dailyTotalCap", 12);
const HARVEST_BONUS_DAILY_GOLD_LIMIT = economyNumber("pickups.dailyGoldCap", 6);
const HARVEST_BONUS_DAILY_TROOP_LIMIT = economyNumber("pickups.dailyTroopCap", 6);
const HARVEST_BONUS_GOLD_SECONDS = economyNumber("pickups.goldAwardProductionMinutes", 10) * 60;
const HARVEST_BONUS_MIN_GOLD = economyNumber("pickups.minimumGold", 50);
const HARVEST_BONUS_TROOP_SECONDS = economyNumber("pickups.troopAwardProductionMinutes", 10) * 60;
const HARVEST_BONUS_MIN_TROOPS = economyNumber("pickups.minimumTroops", 10);
const HARVEST_BONUS_MAX_TROOPS = Number.MAX_SAFE_INTEGER;
const HARVEST_BONUS_SPAWN_INTERVAL_SECONDS = economyNumber("pickups.spawnIntervalMinutes", 3) * 60;
const HARVEST_BONUS_EXPIRE_SECONDS = economyNumber("pickups.expireMinutes", 20) * 60;
const HARVEST_BONUS_MAX_ACTIVE_PER_PLAYER = economyNumber("pickups.maxActivePerPlayer", 1);
const REWARDED_AD_REWARD_MINUTES = 30;
const REWARDED_AD_COOLDOWN_MS = 30 * 60 * 1000;
const REWARDED_AD_DAILY_LIMIT = 20;
const REWARDED_AD_MINIMUM_CLAIM_DELAY_MS = 5 * 1000;
const REWARDED_AD_SHOW_WINDOW_MS = 10 * 60 * 1000;
const REWARDED_AD_CLAIM_WINDOW_MS = 30 * 60 * 1000;
const REWARDED_AD_AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const REWARDED_AD_STATUS_CALLABLE_OPTIONS = Object.freeze({
  region: "us-central1",
  maxInstances: 30,
  invoker: "public",
  enforceAppCheck: true,
  consumeAppCheckToken: true,
});
const REWARDED_AD_MUTATION_CALLABLE_OPTIONS = Object.freeze({
  ...REWARDED_AD_STATUS_CALLABLE_OPTIONS,
});
const SCOUT_REPORT_SECONDS = 120;
const ARMY_TRAVEL_SECONDS_PER_MAP_UNIT = 0.13;
const ARMY_TRAVEL_MIN_SECONDS = 30;
const ARMY_TRAVEL_SCOUT_MIN_SECONDS = 10;
const ARMY_TRAVEL_MAX_SECONDS = 1800;
const ARMY_TRAVEL_KIND_MULTIPLIERS = { scout: 0.35, transfer: 0.95, reinforce: 0.95, rally_join: 0.95, attack: 1 };
const ARMY_ORDER_KINDS = Object.freeze(["attack", "transfer", "reinforce", "rally_join", "scout"]);
const REINFORCEMENT_STATUS_STATIONED = "stationed";
const REINFORCEMENT_STATUS_RETURNING = "returning";
const REINFORCEMENT_STATUS_DEPLETED = "depleted";
const REINFORCEMENT_STATUS_RETURNED = "returned";
const REINFORCEMENT_MODEL_VERSION = 1;
const CLAN_REINFORCEMENT_ACTIVE_LIMIT = 2;
const RALLY_MODEL_VERSION = 1;
const RALLY_MAX_PARTICIPANTS = 3;
const CLAN_FORMING_RALLY_LIMIT = 3;
const RALLY_STATUS_FORMING = "forming";
const RALLY_STATUS_LAUNCHED = "launched";
const RALLY_STATUS_RECALLING = "recalling";
const RALLY_STATUS_RESOLVED = "resolved";
const RALLY_STATUS_CANCELLED = "cancelled";
const RALLY_PARTICIPANT_ASSEMBLED = "assembled";
const RALLY_PARTICIPANT_INBOUND = "inbound";
const RALLY_PARTICIPANT_RETURNING = "returning";
const RALLY_PARTICIPANT_RETURNED = "returned";
const RALLY_RETURN_REASON = "rally_recall";
const RALLY_FRIENDLY_RETURN_REASON = "rally_target_became_friendly";
const ARMY_TRAVEL_TROOP_BAND_LIMITS = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000];
const ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS = [1, 1.18, 1.38, 1.62, 1.9, 2.24, 2.62, 3.06, 3.5];
const ARMY_TROOP_VISIBILITY_VERSION = 1;
const ARMY_TROOP_ESTIMATE_DECADE_MAX = 1_000_000;
const ARMY_TROOP_ESTIMATE_BACKFILL_PAGE_SIZE = 50;
const CAPTURE_XP_BASE = 120;
const CAPTURE_XP_PER_CITY_LEVEL = 45;
const CAPTURE_XP_PER_DEFENDER = 1.5;
const ENEMY_CAPTURE_XP_BONUS = 300;
const CAPTURE_XP_COOLDOWN_MS = 60 * 60 * 1000;
const DEFENSE_HELD_XP_BASE = 80;
const DEFENSE_HELD_XP_PER_ATTACKER = 0.45;
const FAILED_BATTLE_XP_RATE = 1 / 3;
const BATTLE_XP_TROOP_CREDIT_CITY_WALL_MULTIPLIER = 1;
const BATTLE_XP_TROOP_CREDIT_VP_MULTIPLIER = 2;
const BATTLE_XP_TROOP_CREDIT_LEVEL_CAP_MULTIPLIER = 3;
const BATTLE_XP_EARLY_LEVEL_CAP_RATE = 1;
const BATTLE_XP_MID_START_LEVEL_CAP_RATE = 1;
const BATTLE_XP_MID_END_LEVEL_CAP_RATE = 0.5;
const BATTLE_XP_END_START_LEVEL_CAP_RATE = 0.5;
const BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE = 0.35;
const BATTLE_XP_END_CAP_RAMP_LEVELS = 50;
const KILL_GOLD_BASE = 5;
const ATTACK_PROTECTION_VERSION = 2;
const ATTACK_PROTECTION_ASSAULT_MIN_RATIO = 2;
const ATTACK_PROTECTION_RAID_MIN_RATIO = 2.5;
const ATTACK_PROTECTION_RAID_MAX_SCALE_RATIO = 5;
const ATTACK_PROTECTION_DEFENDER_FIRST_XP_MULTIPLIER = 2;
const ATTACK_PROTECTION_DEFENDER_REPEAT_XP_MULTIPLIER = 1;
const ATTACK_PROTECTION_DEFENDER_XP_POLICY = "first-protected-battle-per-attacker-world";
const PROTECTED_ASSAULT_BREACH_VERSION = 1;
const DEMO_ATTACK_MIN_POWER_RATIO = 3;
const DEMO_ATTACK_DEFENDER_XP_MULTIPLIER = 2;
const DEMO_ATTACK_TIERS = [
  { minRatio: 10, label: "Severe Demo Attack", troopCapPercent: 30, attackPowerPercent: 30, travelMultiplier: 2.5 },
  { minRatio: 5, label: "Heavy Demo Attack", troopCapPercent: 40, attackPowerPercent: 40, travelMultiplier: 2 },
  { minRatio: DEMO_ATTACK_MIN_POWER_RATIO, label: "Demo Attack", troopCapPercent: 50, attackPowerPercent: 50, travelMultiplier: 1.6 },
];
const KING_POWER_ARMY_TROOP_VALUE = 2;
const KING_POWER_REPLACEMENT_HOURS = 12;
const KING_POWER_DEFENSIVE_ADVANTAGE_WEIGHT = 0.25;
const HERO_XP_SOFT_CAP_LEVEL = 50;
const HERO_XP_HARD_CAP_LEVEL = 100;
const HERO_XP_EXPONENTIAL_START_LEVEL = 25;
const HERO_XP_EXPONENTIAL_GROWTH_RATE = 1.1;
const LEVEL_UP_GOLD_FLOOR_BASE = economyNumber("levelRewards.goldFloorBase", 500);
const LEVEL_UP_GOLD_FLOOR_PER_LEVEL = economyNumber("levelRewards.goldFloorPerLevel", 250);
const LEVEL_UP_GOLD_FLOOR_EXPONENT = economyNumber("levelRewards.goldFloorExponent", 1.25);
const LEVEL_UP_GOLD_FLOOR_EXPONENT_SCALE = economyNumber("levelRewards.goldFloorExponentScale", 40);
const LEVEL_UP_GOLD_EARLY_UPGRADE_SHARE = economyNumber("levelRewards.goldEarlyUpgradeShare", 0.75);
const LEVEL_UP_GOLD_MID_END_UPGRADE_SHARE = economyNumber("levelRewards.goldMidUpgradeShare", 0.4);
const LEVEL_UP_GOLD_END_UPGRADE_SHARE = economyNumber("levelRewards.goldEndgameUpgradeShare", 0.4);
const LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS = economyNumber("levelRewards.goldEarlyProductionHours", 6);
const LEVEL_UP_GOLD_MID_END_PRODUCTION_HOURS = economyNumber("levelRewards.goldMidProductionHours", 16);
const LEVEL_UP_GOLD_END_PRODUCTION_HOURS = economyNumber("levelRewards.goldEndgameProductionHours", 36);
const LEVEL_UP_TROOP_REWARD_EARLY_BASE_HOURS = economyNumber("levelRewards.troopEarlyBaseHours", 4);
const LEVEL_UP_TROOP_REWARD_EARLY_HOURS_PER_LEVEL = economyNumber("levelRewards.troopEarlyHoursPerLevel", 0.4);
const LEVEL_UP_TROOP_REWARD_MID_BASE_HOURS = economyNumber("levelRewards.troopMidBaseHours", 24);
const LEVEL_UP_TROOP_REWARD_MID_HOURS_PER_LEVEL = economyNumber("levelRewards.troopMidHoursPerLevel", 0.48);
const LEVEL_UP_TROOP_REWARD_END_BASE_HOURS = economyNumber("levelRewards.troopEndgameBaseHours", 48);
const LEVEL_UP_TROOP_REWARD_END_HOURS_PER_LEVEL = economyNumber("levelRewards.troopEndgameHoursPerLevel", 0.32);
const LEVEL_UP_TROOP_REWARD_MAX_HOURS = economyNumber("levelRewards.troopMaximumHours", 96);
const CHARACTER_START_LEVEL = 1;
const CHARACTER_START_XP = 0;
const ROYAL_PEACE_SHIELD_ITEM_ID = "shield_12h";
const ROYAL_PEACE_SHIELD_DURATION_MS = economyNumber("shopItems.shield_12h.effectDurationMinutes", 720) * 60 * 1000;
const WAR_DRUMS_ITEM_ID = "war_drums_30m";
const WAR_DRUMS_DURATION_MS = economyNumber("shopItems.war_drums_30m.effectDurationMinutes", 30) * 60 * 1000;
const WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT = economyNumber("shopItems.war_drums_30m.bonusPercent", 5);
const ROYAL_TAX_DECREE_ITEM_ID = "royal_tax_decree_30m";
const ROYAL_TAX_DECREE_DURATION_MS = economyNumber("shopItems.royal_tax_decree_30m.effectDurationMinutes", 30) * 60 * 1000;
const ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT = economyNumber("shopItems.royal_tax_decree_30m.bonusPercent", 50);
const VEIL_OF_SILENCE_ITEM_ID = "veil_of_silence_30m";
const VEIL_OF_SILENCE_DURATION_MS = economyNumber("shopItems.veil_of_silence_30m.effectDurationMinutes", 5) * 60 * 1000;
const SWIFT_MARCH_ORDER_ITEM_ID = "swift_march_order";
const SWIFT_MARCH_REMAINING_TIME_MULTIPLIER = 0.5;
const SWIFT_MARCH_MINIMUM_REMAINING_MS = 1000;
const RECALL_HORN_ITEM_ID = "recall_horn";
const RECALL_HORN_MINIMUM_REMAINING_MS = 1000;
const RECALL_HORN_MINIMUM_RETURN_MS = 1000;
const ALLIED_TARGET_RETURN_REASON = "target_became_clan_ally";
const ITEM_DAILY_PURCHASE_LIMITS = Object.freeze({
  [ROYAL_PEACE_SHIELD_ITEM_ID]: economyNumber("shopItems.shield_12h.dailyPurchaseLimit", 1),
  [WAR_DRUMS_ITEM_ID]: economyNumber("shopItems.war_drums_30m.dailyPurchaseLimit", 4),
  [ROYAL_TAX_DECREE_ITEM_ID]: economyNumber("shopItems.royal_tax_decree_30m.dailyPurchaseLimit", 2),
  [VEIL_OF_SILENCE_ITEM_ID]: economyNumber("shopItems.veil_of_silence_30m.dailyPurchaseLimit", 4),
  [SWIFT_MARCH_ORDER_ITEM_ID]: economyNumber("shopItems.swift_march_order.dailyPurchaseLimit", 2),
  [RECALL_HORN_ITEM_ID]: economyNumber("shopItems.recall_horn.dailyPurchaseLimit", 2),
});
const MAX_ITEM_DAILY_PURCHASE_LIMIT = Math.max(...Object.values(ITEM_DAILY_PURCHASE_LIMITS));
const MAIN_CITY_CHANGE_CITY_LIMIT = 30;
const MAIN_CITY_CHANGE_SMALL_KINGDOM_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAIN_CITY_CHANGE_LARGE_KINGDOM_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SERVER_PRODUCTION_SECONDS = 7 * 24 * 60 * 60;
const GAME_SERVER_ID = "crown-marches";
const GAME_SERVER_NAME = "The Crown Marches";
const GAME_SERVER_DOCUMENT_ID = `${GAME_SERVER_ID}-${RESET_GENERATION}`;
const GAME_SERVER_CAPACITY = 50;
const GAME_SERVER_ACTIVE_STALE_MS = 3 * 60 * 1000;
const GAME_SERVER_WAITING_STALE_MS = 5 * 60 * 1000;
const GAME_SERVER_MAX_WAITING = 500;
const GAME_SERVER_HEARTBEAT_MODEL_VERSION = 2;
const GAME_SERVER_ADMISSION_LEASE_MS = 15 * 1000;
const GAME_SERVER_ADMISSION_WAIT_MS = 55 * 1000;
let gameServerAdmissionQueue = Promise.resolve();
const CLAN_UNLOCK_LEVEL = 10;
const CLAN_CREATE_GOLD_COST = 100_000;
const CLAN_NAME_CHANGE_GOLD_COST = 500_000;
const CLAN_NAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const CLAN_MEMBER_LIMIT = 30;
const CLAN_JOIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CLAN_LEADER_INACTIVE_MS = 14 * 24 * 60 * 60 * 1000;
const CLAN_RESERVATION_RELEASE_MS = 7 * 24 * 60 * 60 * 1000;
const CLAN_GIFT_COOLDOWN_MS = 5 * 60 * 60 * 1000;
const CLAN_GIFT_PRODUCTION_MINUTES = 30;
const CLAN_QUEST_REWARDS = Object.freeze([
  { id: "capture_5", captures: 5, rewardType: "gold", productionMinutes: 30 },
  { id: "capture_15", captures: 15, rewardType: "troops", productionMinutes: 30 },
  { id: "capture_25", captures: 25, rewardType: "gold", productionMinutes: 60 },
  { id: "capture_35", captures: 35, rewardType: "troops", productionMinutes: 60 },
  { id: "capture_45", captures: 45, rewardType: "gold", productionMinutes: 90 },
  { id: "capture_50", captures: 50, rewardType: "troops", productionMinutes: 120 },
  { id: "capture_65", captures: 65, rewardType: "gold", productionMinutes: 120 },
  { id: "capture_75", captures: 75, rewardType: "troops", productionMinutes: 180 },
  { id: "capture_90", captures: 90, rewardType: "gold", productionMinutes: 180 },
  { id: "capture_100", captures: 100, rewardType: "troops", productionMinutes: 360 },
]);
const CLAN_IDENTITY_REVISION_VERSION = 1;
const CLAN_SHIELD_VERSION = 1;
const CLAN_SHIELD_SHAPES = new Set(["castilian", "heater", "kite", "round"]);
const CLAN_SHIELD_DIVISIONS = new Set(["solid", "pale", "fess", "quartered", "stripes", "bend", "saltire", "chevron"]);
const CLAN_SHIELD_CHARGES = new Set(["none", "castle", "lion", "eagle", "crown", "swords", "fleur", "sun"]);
const CLAN_SHIELD_CHARGE_LAYOUTS = new Set(["center", "paired", "quartered", "chief"]);
const CLAN_SHIELD_TRIMS = new Set(["plain", "double", "riveted"]);
const CLAN_SHIELD_FINISHES = new Set(["polished", "weathered", "battleworn"]);
const GLOBAL_PLAYER_STATS_VERSION = 8;
const PLAYER_IDENTITY_SYNC_VERSION = 1;
const MAIN_CITY_ASSIGNMENT_VERSION = 2;
const ECONOMY_CITY_CHECKPOINT_MS = 5 * 60 * 1000;
const ECONOMY_MAX_CITY_CHECKPOINT_WRITES = 300;
const SCHEDULED_ARMY_RESOLVE_SCAN_LIMIT = 250;
const SCHEDULED_ARMY_RESOLVE_MAX_PER_RUN = 120;
const SCHEDULED_ARMY_RESOLVE_CONCURRENCY = 8;
const MAX_ROUTE_REGION_COUNT = 20;
const MAX_ROUTE_SEGMENT_COUNT = 20;
const MAX_ROUTE_POINTS_PER_SEGMENT = 160;
const ROUTE_ENDPOINT_TOLERANCE = 180;
const SERVER_ROUTE_CITY_CLEARANCE = 46;
const SERVER_ROUTE_STRUCTURE_CLEARANCE = 88;
const SERVER_DEFAULT_CAMP_VISUAL_SIZE = 132;
const SERVER_ISLAND_MAP_PADDING = 560;
const SERVER_ROUTE_INSET_MIN = 24;
const SERVER_ROUTE_INSET_MAX = 58;
const GOLD_CAMP_REWARD_SCHEDULE = economyRewardSchedule("gold", [
  { minimumReward: 20_000, productionHours: 0.5 },
  { minimumReward: 40_000, productionHours: 1 },
  { minimumReward: 60_000, productionHours: 1.5 },
  { minimumReward: 80_000, productionHours: 2 },
]);
const WARBAND_CAMP_REWARD_SCHEDULE = economyRewardSchedule("troops", [
  { minimumReward: 10_000, productionHours: 0.5 },
  { minimumReward: 20_000, productionHours: 1 },
  { minimumReward: 30_000, productionHours: 1.5 },
  { minimumReward: 40_000, productionHours: 2 },
]);
const GOLD_CAMP_HOLD_DURATION_MS = economyNumber("camps.gold.holdMinutes", 10) * 60 * 1000;
const GOLD_CAMP_BASE_REWARD = GOLD_CAMP_REWARD_SCHEDULE[0]?.minimumReward || 20_000;
const GOLD_CAMP_BASE_DEFENDERS = economyNumber("camps.gold.baseDefenders", 10_000);
const GOLD_CAMP_DEFENSE_LEVEL = economyNumber("camps.gold.defenseLevel", 30);
const REWARD_CAMP_PAYOUT_SCAN_LIMIT = 40;
const GOLD_CAMP_REWARD_BY_DAILY_CLAIM = GOLD_CAMP_REWARD_SCHEDULE.map(entry => entry.minimumReward);
const GOLD_CAMP_REWARD_HOURS_BY_DAILY_CLAIM = GOLD_CAMP_REWARD_SCHEDULE.map(entry => entry.productionHours);
const WARBAND_CAMP_HOLD_DURATION_MS = economyNumber("camps.troops.holdMinutes", 15) * 60 * 1000;
const WARBAND_CAMP_BASE_REWARD = WARBAND_CAMP_REWARD_SCHEDULE[0]?.minimumReward || 10_000;
const WARBAND_CAMP_BASE_DEFENDERS = economyNumber("camps.troops.baseDefenders", 10_000);
const WARBAND_CAMP_DEFENSE_LEVEL = economyNumber("camps.troops.defenseLevel", 30);
const WARBAND_CAMP_REWARD_BY_DAILY_CLAIM = WARBAND_CAMP_REWARD_SCHEDULE.map(entry => entry.minimumReward);
const WARBAND_CAMP_REWARD_HOURS_BY_DAILY_CLAIM = WARBAND_CAMP_REWARD_SCHEDULE.map(entry => entry.productionHours);
const DEED_CAMP_HOLD_DURATION_MS = economyNumber("camps.deed.holdMinutes", 60) * 60 * 1000;
const DEED_CAMP_BASE_DEFENDERS = economyNumber("camps.deed.baseDefenders", 10_000);
const DEED_CAMP_DEFENSE_LEVEL = economyNumber("camps.deed.defenseLevel", 30);
const DEED_CAMP_HISTORY_LIMIT = 25;
const DEED_CAMP_CITY_QUERY_LIMIT = 50;
const DEED_CAMP_FALLBACK_REGION_LIMIT = 6;
const RELIC_CAMP_HOLD_DURATION_MS = economyNumber("camps.items.holdMinutes", 30) * 60 * 1000;
const RELIC_CAMP_BASE_DEFENDERS = economyNumber("camps.items.baseDefenders", 10_000);
const RELIC_CAMP_DEFENSE_LEVEL = economyNumber("camps.items.defenseLevel", 30);
const RELIC_CAMP_DAILY_REWARD_LIMIT = economyNumber("camps.items.maxDailyRewards", 2);
const RELIC_CAMP_DROP_TABLE = [
  { itemId: WAR_DRUMS_ITEM_ID, itemName: "War Drums", rarity: "Common", chance: 35 },
  { itemId: VEIL_OF_SILENCE_ITEM_ID, itemName: "Veil of Silence", rarity: "Common", chance: 25 },
  { itemId: SWIFT_MARCH_ORDER_ITEM_ID, itemName: "Swift March Order", rarity: "Uncommon", chance: 18 },
  { itemId: ROYAL_TAX_DECREE_ITEM_ID, itemName: "Royal Tax Decree", rarity: "Uncommon", chance: 12 },
  { itemId: RECALL_HORN_ITEM_ID, itemName: "Recall Horn", rarity: "Rare", chance: 8 },
  { itemId: ROYAL_PEACE_SHIELD_ITEM_ID, itemName: "Royal Peace Shield", rarity: "Legendary", chance: 2 },
];
const REWARD_CAMP_CONFIG = {
  gold: {
    campType: "gold",
    kind: "goldCamp",
    name: "Gold Camp",
    artSrc: "assets/camps/gold.png",
    rewardType: "gold",
    objectiveStatsId: "goldCamp",
    holdDurationMs: GOLD_CAMP_HOLD_DURATION_MS,
    baseReward: GOLD_CAMP_BASE_REWARD,
    baseDefenders: GOLD_CAMP_BASE_DEFENDERS,
    defenseLevel: GOLD_CAMP_DEFENSE_LEVEL,
    dailyRewards: GOLD_CAMP_REWARD_BY_DAILY_CLAIM,
    rewardHours: GOLD_CAMP_REWARD_HOURS_BY_DAILY_CLAIM,
  },
  troops: {
    campType: "troops",
    kind: "warbandCamp",
    name: "Warband Camp",
    artSrc: "assets/camps/troops.png",
    rewardType: "troops",
    objectiveStatsId: "warbandCamp",
    holdDurationMs: WARBAND_CAMP_HOLD_DURATION_MS,
    baseReward: WARBAND_CAMP_BASE_REWARD,
    baseDefenders: WARBAND_CAMP_BASE_DEFENDERS,
    defenseLevel: WARBAND_CAMP_DEFENSE_LEVEL,
    dailyRewards: WARBAND_CAMP_REWARD_BY_DAILY_CLAIM,
    rewardHours: WARBAND_CAMP_REWARD_HOURS_BY_DAILY_CLAIM,
  },
  deed: {
    campType: "deed",
    kind: "deedCamp",
    name: "Deed Camp",
    artSrc: "assets/camps/deed.png",
    rewardType: "city",
    objectiveStatsId: "deedCamp",
    holdDurationMs: DEED_CAMP_HOLD_DURATION_MS,
    baseReward: 1,
    baseDefenders: DEED_CAMP_BASE_DEFENDERS,
    defenseLevel: DEED_CAMP_DEFENSE_LEVEL,
  },
  items: {
    campType: "items",
    kind: "relicCamp",
    name: "Relic Camp",
    artSrc: "assets/camps/items.png",
    rewardType: "item",
    objectiveStatsId: "relicCamp",
    holdDurationMs: RELIC_CAMP_HOLD_DURATION_MS,
    baseReward: 1,
    baseDefenders: RELIC_CAMP_BASE_DEFENDERS,
    defenseLevel: RELIC_CAMP_DEFENSE_LEVEL,
    maxDailyRewards: RELIC_CAMP_DAILY_REWARD_LIMIT,
    itemDrops: RELIC_CAMP_DROP_TABLE,
  },
};
const SHOP_ITEMS = {
  [ROYAL_PEACE_SHIELD_ITEM_ID]: { id: ROYAL_PEACE_SHIELD_ITEM_ID, label: "Royal Peace Shield", cost: economyNumber("shopItems.shield_12h.cost", 1_250_000) },
  [WAR_DRUMS_ITEM_ID]: { id: WAR_DRUMS_ITEM_ID, label: "War Drums", cost: economyNumber("shopItems.war_drums_30m.cost", 75_000) },
  [ROYAL_TAX_DECREE_ITEM_ID]: { id: ROYAL_TAX_DECREE_ITEM_ID, label: "Royal Tax Decree", cost: economyNumber("shopItems.royal_tax_decree_30m.cost", 150_000) },
  [VEIL_OF_SILENCE_ITEM_ID]: { id: VEIL_OF_SILENCE_ITEM_ID, label: "Veil of Silence", cost: economyNumber("shopItems.veil_of_silence_30m.cost", 125_000) },
  [SWIFT_MARCH_ORDER_ITEM_ID]: { id: SWIFT_MARCH_ORDER_ITEM_ID, label: "Swift March Order", cost: economyNumber("shopItems.swift_march_order.cost", 300_000) },
  [RECALL_HORN_ITEM_ID]: { id: RECALL_HORN_ITEM_ID, label: "Recall Horn", cost: economyNumber("shopItems.recall_horn.cost", 500_000) },
};
const DAILY_LOGIN_REWARD_SCHEMA_VERSION = 2;
const DAILY_LOGIN_REWARD_DAYS = Object.freeze(
  (Array.isArray(ECONOMY_CONFIG?.dailyLoginRewards?.days) ? ECONOMY_CONFIG.dailyLoginRewards.days : [])
    .map((entry, index) => Object.freeze({
      day: Math.max(1, Math.floor(Number(entry?.day) || index + 1)),
      goldHours: Math.max(0, Number(entry?.goldHours) || 0),
      troopHours: Math.max(0, Number(entry?.troopHours) || 0),
      items: Object.freeze(Object.fromEntries(
        Object.entries(entry?.items || {})
          .filter(([itemId, quantity]) => SHOP_ITEMS[itemId] && Number(quantity) > 0)
          .map(([itemId, quantity]) => [itemId, Math.max(1, Math.floor(Number(quantity) || 1))])
      )),
    }))
);
const DAILY_LOGIN_REWARD_CYCLE_DAYS = Math.max(
  1,
  Math.floor(Number(ECONOMY_CONFIG?.dailyLoginRewards?.cycleLengthDays) || DAILY_LOGIN_REWARD_DAYS.length)
);
const DAILY_LOGIN_REWARD_MAX_PENDING = Math.max(
  1,
  Math.floor(Number(ECONOMY_CONFIG?.dailyLoginRewards?.maxPendingRewards) || 2)
);
if (DAILY_LOGIN_REWARD_DAYS.length !== DAILY_LOGIN_REWARD_CYCLE_DAYS) {
  throw new Error("Daily login reward configuration must define every day in the cycle.");
}
if (DAILY_LOGIN_REWARD_DAYS.some(reward => (
  [reward.goldHours > 0, reward.troopHours > 0, Object.keys(reward.items).length > 0]
    .filter(Boolean)
    .length !== 1
))) {
  throw new Error("Every daily login reward must contain exactly one reward type.");
}
const LEGACY_SHOP_ITEM_IDS = ["troop_boost_1h", "anti_scout_1h"];
const CITY_LEVEL_STATS = {
  victoryPointsBase: 6,
  victoryPointsPerLevel: 4,
  victoryPointsExponent: 1.35,
  victoryPointsExponentScale: 2,
  defensePercentPerLevel: economyNumber("cityEconomy.defensePercentPerLevel", 2),
  cityWallsBase: economyNumber("cityEconomy.wallDefenseBase", 200),
  cityWallsExponent: economyNumber("cityEconomy.wallDefenseExponent", 3),
  cityWallsExponentScale: economyNumber("cityEconomy.wallDefenseScale", 3),
  troopProductionPerVictoryPoint: economyNumber("cityEconomy.troopsPerVictoryPoint", 3),
};
const SKILL_CONFIG = {
  swordmastery: { percentPerLevel: economyNumber("skills.swordmastery.percentPerLevel", 2), maxPercent: economyNumber("skills.swordmastery.maxPercent", 60) },
  stoneworks: { percentPerLevel: economyNumber("skills.stoneworks.percentPerLevel", 3), maxPercent: economyNumber("skills.stoneworks.maxPercent", 75) },
  taxStewardship: { percentPerLevel: economyNumber("skills.taxStewardship.percentPerLevel", 3), maxPercent: economyNumber("skills.taxStewardship.maxPercent", 75) },
  royalGranaries: { percentPerLevel: economyNumber("skills.royalGranaries.percentPerLevel", 3), maxPercent: economyNumber("skills.royalGranaries.maxPercent", 75) },
  guildCharters: { percentPerLevel: economyNumber("skills.guildCharters.percentPerLevel", 2), maxPercent: economyNumber("skills.guildCharters.maxPercent", 50) },
  marchOrders: { percentPerLevel: economyNumber("skills.marchOrders.percentPerLevel", 3), maxPercent: economyNumber("skills.marchOrders.maxPercent", 60) },
  fieldMedics: { percentPerLevel: economyNumber("skills.fieldMedics.percentPerLevel", 2), maxPercent: economyNumber("skills.fieldMedics.maxPercent", 50) },
};
const SKILL_ORDER = [
  "swordmastery",
  "stoneworks",
  "taxStewardship",
  "royalGranaries",
  "guildCharters",
  "marchOrders",
  "fieldMedics",
];
const SKILL_RESET_COST = economyNumber("playerCosts.skillResetGold", 750_000);
const GOLD_STRONGHOLD_ID = "west_gold_stronghold";
const TRAINING_STRONGHOLD_ID = "north_training_stronghold";
const SPEED_STRONGHOLD_ID = "east_speed_stronghold";
const DEFENSE_STRONGHOLD_ID = "south_defense_stronghold";
const CROWN_CITADEL_ID = "center_crown_citadel";
const GOLD_STRONGHOLD_BONUS_PERCENT = 8;
const TRAINING_STRONGHOLD_BONUS_PERCENT = 8;
const SPEED_STRONGHOLD_BONUS_PERCENT = 8;
const DEFENSE_STRONGHOLD_BONUS_PERCENT = 8;
const CROWN_CITADEL_GOLD_BONUS_PERCENT = 10;
const CROWN_CITADEL_TROOP_BONUS_PERCENT = 10;
const CROWN_CITADEL_DEFENSE_BONUS_PERCENT = 10;
const CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT = 10;
const CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT = 10;
const CLAN_OBJECTIVE_BENEFIT_MODEL_VERSION = 1;
const CLAN_SHARED_OBJECTIVE_MULTIPLIER = 0.5;
const BATTLE_SNAPSHOT_MODEL_VERSION = 1;
const STRONGHOLD_IDS = new Set([
  GOLD_STRONGHOLD_ID,
  TRAINING_STRONGHOLD_ID,
  SPEED_STRONGHOLD_ID,
  DEFENSE_STRONGHOLD_ID,
  CROWN_CITADEL_ID,
]);
const STRONGHOLD_LEVELS = {
  [GOLD_STRONGHOLD_ID]: 50,
  [TRAINING_STRONGHOLD_ID]: 50,
  [SPEED_STRONGHOLD_ID]: 50,
  [DEFENSE_STRONGHOLD_ID]: 50,
  [CROWN_CITADEL_ID]: 100,
};

function requireCompatibleClient(data = {}) {
  if (safeString(data.clientReleaseId, 120) !== REALM_RELEASE_ID
    || safeString(data.clientResetGeneration, 120) !== RESET_GENERATION
    || safeString(data.clientWorldId, 120) !== ONLINE_WORLD_ID) {
    throw new HttpsError("failed-precondition", "Crownlands was updated. Refresh before continuing.");
  }
}

function requireAuth(request, { allowRealmMismatch = false } = {}) {
  const uid = request.auth?.uid || "";
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before sending troops.");
  if (!allowRealmMismatch) requireCompatibleClient(request.data || {});
  return uid;
}

function requireRewardedAdAppCheck(request, consume = false) {
  if (!request.app) {
    throw new HttpsError("unauthenticated", "Rewarded ads require a verified Crownlands browser.");
  }
  if (consume && request.app.alreadyConsumed) {
    throw new HttpsError("permission-denied", "That rewarded-ad security token was already used.");
  }
  return request.app.appId || "";
}

function requireStatsAdmin(request) {
  const uid = requireAuth(request);
  const token = request.auth?.token || {};
  if (!token.admin && !token.developer && !token.statsAdmin) {
    throw new HttpsError("permission-denied", "Admin access is required to rebuild global stats.");
  }
  return uid;
}

function normalizeRegionId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "west";
}

function getOnlineIslandId(regionId = "west") {
  return `${ONLINE_WORLD_ID}-${normalizeRegionId(regionId)}`;
}

function safeString(value, max = 80) {
  return String(value || "").trim().slice(0, max);
}

function operationResultMetrics(result = null) {
  const production = result?.production || {};
  const metrics = {
    status: safeString(result?.status || (result?.ok === false ? "failed" : "ok"), 32),
    cityCount: Math.max(0, Math.floor(Number(production.cityCount) || 0)),
    cityWrites: Math.max(0, Math.floor(Number(result?.cityWrites ?? result?.writes) || 0)),
    scanned: Math.max(0, Math.floor(Number(result?.scanned) || 0)),
    resolved: Math.max(0, Math.floor(Number(result?.resolved) || 0)),
    failed: Math.max(0, Math.floor(Number(result?.failed) || 0)),
  };
  const dailyStatus = result?.dailyLoginRewardStatus;
  const receipt = result?.receipt;
  if (dailyStatus && typeof dailyStatus === "object") {
    metrics.cycle = Math.max(1, Math.floor(Number(receipt?.cycle || dailyStatus.cycle) || 1));
    metrics.day = Math.max(1, Math.floor(Number(receipt?.day || dailyStatus.nextDay) || 1));
    metrics.eligible = Boolean(dailyStatus.eligible);
    metrics.pendingRewards = Math.max(0, Math.floor(Number(dailyStatus.pendingCount) || 0));
    metrics.attendanceDeferred = Boolean(dailyStatus.attendanceDeferred);
  }
  if (receipt && typeof receipt === "object") {
    metrics.rewardTypes = [
      Number(receipt.gold) > 0 ? "gold" : "",
      Number(receipt.troops) > 0 ? "troops" : "",
      Object.keys(receipt.items || {}).length ? "items" : "",
    ].filter(Boolean);
    metrics.itemKinds = Object.keys(receipt.items || {}).length;
  }
  return metrics;
}

function logOperation(operation, startedAtMs, request = null, outcome = "ok", details = {}) {
  console.log("crownlands_operation", {
    event: "crownlands_operation",
    operation: safeString(operation, 64),
    outcome: safeString(outcome, 24),
    durationMs: Math.max(0, Date.now() - startedAtMs),
    releaseId: REALM_RELEASE_ID,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    appCheck: request?.app ? "valid" : "missing",
    ...details,
  });
}

function timedCallable(operation, options, handler) {
  return onCall(options, async request => {
    const startedAtMs = Date.now();
    try {
      const result = await handler(request);
      logOperation(operation, startedAtMs, request, "ok", operationResultMetrics(result));
      return result;
    } catch (error) {
      logOperation(operation, startedAtMs, request, "error", {
        code: safeString(error?.code || "internal", 48),
      });
      throw error;
    }
  });
}

function isRetryableTransactionInfrastructureError(error) {
  const code = String(error?.code || "").toLowerCase();
  const details = String(error?.details || error?.message || "").toLowerCase();
  return code === "10"
    || code === "aborted"
    || code.endsWith("/aborted")
    || details.includes("transaction lock timeout")
    || (code === "3" && details.includes("transaction is invalid or closed"));
}

async function runTransactionWithInfrastructureRetry(operation, label = "transaction", maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.runTransaction(operation);
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionInfrastructureError(error) || attempt >= maxAttempts) throw error;
      const delayMs = 75 * attempt + Math.floor(Math.random() * 75);
      console.warn("Retrying Crownlands Firestore transaction", {
        label: safeString(label, 64),
        attempt,
        code: safeString(error?.code || "internal", 48),
        delayMs,
      });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function requireGameServerId(value = GAME_SERVER_ID) {
  const serverId = safeString(value || GAME_SERVER_ID, 64).toLowerCase();
  if (serverId !== GAME_SERVER_ID) {
    throw new HttpsError("not-found", "That Crownlands realm does not exist.");
  }
  return serverId;
}

function requireGameServerSessionId(value = "") {
  const sessionId = safeString(value, 128).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!sessionId) throw new HttpsError("invalid-argument", "This browser session is missing its realm key.");
  return sessionId;
}

function cleanGameServerEntry(raw = {}, fallback = {}) {
  return {
    uid: safeString(raw.uid || fallback.uid, 128),
    sessionId: safeString(raw.sessionId || fallback.sessionId, 128),
    displayName: normalizePlayerName(raw.displayName || fallback.displayName || "Ruler"),
    joinedAtMs: Math.max(0, Math.floor(safeNumber(raw.joinedAtMs, fallback.joinedAtMs || 0))),
    queuedAtMs: Math.max(0, Math.floor(safeNumber(raw.queuedAtMs, fallback.queuedAtMs || 0))),
    admittedAtMs: Math.max(0, Math.floor(safeNumber(raw.admittedAtMs, fallback.admittedAtMs || 0))),
    lastSeenAtMs: Math.max(0, Math.floor(safeNumber(raw.lastSeenAtMs, fallback.lastSeenAtMs || 0))),
    ticket: Math.max(0, Math.floor(safeNumber(raw.ticket, fallback.ticket || 0))),
  };
}

function normalizeGameServerEntries(raw = {}, nowMs = Date.now(), staleMs = 0) {
  const entries = {};
  Object.entries(raw && typeof raw === "object" ? raw : {}).forEach(([rawUid, value]) => {
    const uid = safeString(value?.uid || rawUid, 128);
    if (!uid || uid.includes("/")) return;
    const entry = cleanGameServerEntry(value, { uid });
    if (!entry.sessionId || !entry.lastSeenAtMs) return;
    if (staleMs > 0 && nowMs - entry.lastSeenAtMs > staleMs) return;
    entries[uid] = entry;
  });
  return entries;
}

function createGameServerState(raw = {}, nowMs = Date.now(), { pruneStale = true } = {}) {
  return {
    id: GAME_SERVER_ID,
    name: GAME_SERVER_NAME,
    capacity: GAME_SERVER_CAPACITY,
    nextTicket: Math.max(1, Math.floor(safeNumber(raw.nextTicket, 1))),
    activeSlots: normalizeGameServerEntries(
      raw.activeSlots,
      nowMs,
      pruneStale ? GAME_SERVER_ACTIVE_STALE_MS : 0
    ),
    waitingQueue: normalizeGameServerEntries(
      raw.waitingQueue,
      nowMs,
      pruneStale ? GAME_SERVER_WAITING_STALE_MS : 0
    ),
  };
}

function applyGameServerMemberHeartbeats(raw = {}, memberRows = []) {
  const activeSlots = { ...(raw.activeSlots && typeof raw.activeSlots === "object" ? raw.activeSlots : {}) };
  const waitingQueue = { ...(raw.waitingQueue && typeof raw.waitingQueue === "object" ? raw.waitingQueue : {}) };
  (Array.isArray(memberRows) ? memberRows : []).forEach(row => {
    const uid = safeString(row?.uid, 128);
    const sessionId = safeString(row?.sessionId, 128);
    const lastSeenAtMs = Math.max(0, Math.floor(safeNumber(row?.lastSeenAtMs, 0)));
    if (!uid || !sessionId || !lastSeenAtMs) return;
    const current = activeSlots[uid] || waitingQueue[uid];
    if (!current || safeString(current.sessionId, 128) !== sessionId) return;
    const next = {
      ...current,
      lastSeenAtMs: Math.max(
        Math.max(0, Math.floor(safeNumber(current.lastSeenAtMs, 0))),
        lastSeenAtMs
      ),
    };
    if (activeSlots[uid]) activeSlots[uid] = next;
    else waitingQueue[uid] = next;
  });
  return { ...raw, activeSlots, waitingQueue };
}

function getOrderedGameServerWaiters(state) {
  return Object.values(state.waitingQueue || {}).sort((a, b) => (
    (a.ticket - b.ticket)
    || (a.queuedAtMs - b.queuedAtMs)
    || a.uid.localeCompare(b.uid)
  ));
}

function promoteGameServerWaiters(state, nowMs = Date.now()) {
  const promoted = [];
  const waiters = getOrderedGameServerWaiters(state);
  while (Object.keys(state.activeSlots).length < GAME_SERVER_CAPACITY && waiters.length) {
    const waiter = waiters.shift();
    if (!waiter?.uid || !state.waitingQueue[waiter.uid]) continue;
    delete state.waitingQueue[waiter.uid];
    const activeEntry = cleanGameServerEntry(waiter, {
      uid: waiter.uid,
      admittedAtMs: nowMs,
      joinedAtMs: nowMs,
    });
    activeEntry.admittedAtMs = nowMs;
    activeEntry.joinedAtMs = activeEntry.joinedAtMs || nowMs;
    activeEntry.lastSeenAtMs = nowMs;
    activeEntry.ticket = 0;
    state.activeSlots[waiter.uid] = activeEntry;
    promoted.push(activeEntry);
  }
  return promoted;
}

function writeGameServerMembership(transaction, entry, status, nowMs = Date.now()) {
  if (!entry?.uid) return;
  transaction.set(db.doc(`players/${entry.uid}/serverMembership/current`), {
    serverId: GAME_SERVER_ID,
    serverName: GAME_SERVER_NAME,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    releaseId: REALM_RELEASE_ID,
    status,
    sessionId: entry.sessionId || "",
    displayName: entry.displayName || "Ruler",
    queuedAtMs: status === "waiting" ? entry.queuedAtMs || nowMs : 0,
    admittedAtMs: status === "active" ? entry.admittedAtMs || nowMs : 0,
    lastSeenAtMs: nowMs,
    updatedAtMs: nowMs,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function writeGameServerMember(transaction, entry, status, nowMs = Date.now()) {
  if (!entry?.uid) return;
  transaction.set(db.doc(`gameServers/${GAME_SERVER_DOCUMENT_ID}/members/${entry.uid}`), {
    uid: entry.uid,
    serverId: GAME_SERVER_ID,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    releaseId: REALM_RELEASE_ID,
    heartbeatModelVersion: GAME_SERVER_HEARTBEAT_MODEL_VERSION,
    status,
    sessionId: entry.sessionId || "",
    displayName: entry.displayName || "Ruler",
    queuedAtMs: status === "waiting" ? entry.queuedAtMs || nowMs : 0,
    admittedAtMs: status === "active" ? entry.admittedAtMs || nowMs : 0,
    lastSeenAtMs: nowMs,
    updatedAtMs: nowMs,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function writeGameServerState(transaction, serverRef, state, nowMs = Date.now()) {
  const serverState = {
    id: GAME_SERVER_ID,
    name: GAME_SERVER_NAME,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    releaseId: REALM_RELEASE_ID,
    capacity: GAME_SERVER_CAPACITY,
    heartbeatModelVersion: GAME_SERVER_HEARTBEAT_MODEL_VERSION,
    activeCount: Object.keys(state.activeSlots).length,
    waitingCount: Object.keys(state.waitingQueue).length,
    activeSlots: state.activeSlots,
    waitingQueue: state.waitingQueue,
    nextTicket: state.nextTicket,
    updatedAtMs: nowMs,
    updatedAt: FieldValue.serverTimestamp(),
  };
  transaction.set(serverRef, serverState, { mergeFields: Object.keys(serverState) });
}

function serializeGameServerAdmission(operation) {
  const result = gameServerAdmissionQueue.then(operation, operation);
  gameServerAdmissionQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function isGameServerLeaseAlreadyHeld(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || error?.details || "").toLowerCase();
  return code === "6"
    || code === "already-exists"
    || code.endsWith("/already-exists")
    || message.includes("already exists");
}

function isGameServerLeaseRace(error) {
  const code = String(error?.code || "").toLowerCase();
  return isGameServerLeaseAlreadyHeld(error)
    || code === "5"
    || code === "9"
    || code === "not-found"
    || code === "failed-precondition"
    || code.endsWith("/not-found")
    || code.endsWith("/failed-precondition");
}

function waitForGameServerAdmission(attempt = 0) {
  const backoffMs = Math.min(300, 20 * (1.35 ** Math.min(12, attempt)));
  const jitterMs = Math.floor(Math.random() * 40);
  return new Promise(resolve => setTimeout(resolve, Math.ceil(backoffMs + jitterMs)));
}

async function withGameServerAdmissionLease(operation) {
  const leaseRef = db.doc(`gameServers/${GAME_SERVER_DOCUMENT_ID}/coordination/admission`);
  const ownerId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const deadlineMs = Date.now() + GAME_SERVER_ADMISSION_WAIT_MS;
  let leaseWrite = null;
  let attempt = 0;

  while (!leaseWrite) {
    const nowMs = Date.now();
    try {
      leaseWrite = await leaseRef.create({
        ownerId,
        acquiredAtMs: nowMs,
        expiresAtMs: nowMs + GAME_SERVER_ADMISSION_LEASE_MS,
        resetGeneration: RESET_GENERATION,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      if (!isGameServerLeaseAlreadyHeld(error)) throw error;
      const leaseSnap = await leaseRef.get();
      if (leaseSnap.exists && safeNumber(leaseSnap.data()?.expiresAtMs, 0) <= Date.now()) {
        try {
          await leaseRef.delete({ lastUpdateTime: leaseSnap.updateTime });
        } catch (deleteError) {
          if (!isGameServerLeaseRace(deleteError)) throw deleteError;
        }
      }
      if (Date.now() >= deadlineMs) {
        throw new HttpsError("resource-exhausted", "Realm admission is busy. Try entering again shortly.");
      }
      await waitForGameServerAdmission(attempt);
      attempt += 1;
    }
  }

  try {
    return await operation();
  } finally {
    try {
      await leaseRef.delete({ lastUpdateTime: leaseWrite.updateTime });
    } catch (error) {
      if (!isGameServerLeaseRace(error)) {
        console.error("Failed to release Crownlands realm admission lease", {
          code: safeString(error?.code || "internal", 48),
        });
      }
    }
  }
}

async function joinGameServerForPlayer({ uid, sessionId, displayName, nowMs = Date.now() }) {
  const serverRef = db.doc(`gameServers/${GAME_SERVER_DOCUMENT_ID}`);
  return serializeGameServerAdmission(() => withGameServerAdmissionLease(() => db.runTransaction(async transaction => {
    const serverSnap = await transaction.get(serverRef);
    const state = createGameServerState(serverSnap.exists ? serverSnap.data() : {}, nowMs, { pruneStale: false });
    const promoted = promoteGameServerWaiters(state, nowMs);
    let activeEntry = state.activeSlots[uid] || null;
    let waitingEntry = state.waitingQueue[uid] || null;

    if (activeEntry) {
      activeEntry = cleanGameServerEntry(activeEntry, { uid });
      activeEntry.sessionId = sessionId;
      activeEntry.displayName = displayName;
      activeEntry.lastSeenAtMs = nowMs;
      activeEntry.joinedAtMs = activeEntry.joinedAtMs || nowMs;
      activeEntry.admittedAtMs = activeEntry.admittedAtMs || nowMs;
      state.activeSlots[uid] = activeEntry;
      delete state.waitingQueue[uid];
      waitingEntry = null;
    } else if (waitingEntry) {
      waitingEntry = cleanGameServerEntry(waitingEntry, { uid });
      waitingEntry.sessionId = sessionId;
      waitingEntry.displayName = displayName;
      waitingEntry.lastSeenAtMs = nowMs;
      waitingEntry.queuedAtMs = waitingEntry.queuedAtMs || nowMs;
      state.waitingQueue[uid] = waitingEntry;
    } else if (Object.keys(state.activeSlots).length < GAME_SERVER_CAPACITY && !getOrderedGameServerWaiters(state).length) {
      activeEntry = cleanGameServerEntry({
        uid,
        sessionId,
        displayName,
        joinedAtMs: nowMs,
        admittedAtMs: nowMs,
        lastSeenAtMs: nowMs,
      });
      state.activeSlots[uid] = activeEntry;
    } else {
      if (Object.keys(state.waitingQueue).length >= GAME_SERVER_MAX_WAITING) {
        throw new HttpsError("resource-exhausted", "The Crown Marches waiting list is full. Try again shortly.");
      }
      waitingEntry = cleanGameServerEntry({
        uid,
        sessionId,
        displayName,
        queuedAtMs: nowMs,
        lastSeenAtMs: nowMs,
        ticket: state.nextTicket,
      });
      state.nextTicket += 1;
      state.waitingQueue[uid] = waitingEntry;
    }

    const newlyPromoted = promoteGameServerWaiters(state, nowMs);
    promoted.push(...newlyPromoted);
    activeEntry = state.activeSlots[uid] || null;
    waitingEntry = state.waitingQueue[uid] || null;

    writeGameServerState(transaction, serverRef, state, nowMs);
    const membershipWrites = new Map(promoted.map(entry => [entry.uid, { entry, status: "active" }]));
    if (activeEntry) membershipWrites.set(uid, { entry: activeEntry, status: "active" });
    else if (waitingEntry) membershipWrites.set(uid, { entry: waitingEntry, status: "waiting" });
    membershipWrites.forEach(({ entry, status }) => {
      writeGameServerMember(transaction, entry, status, nowMs);
      writeGameServerMembership(transaction, entry, status, nowMs);
    });

    return {
      serverId: GAME_SERVER_ID,
      serverName: GAME_SERVER_NAME,
      status: activeEntry ? "active" : "waiting",
      admittedAtMs: activeEntry?.admittedAtMs || 0,
      queuedAtMs: waitingEntry?.queuedAtMs || 0,
    };
  })));
}

async function heartbeatGameServerForPlayer({ uid, sessionId, displayName, nowMs = Date.now() }) {
  const serverRef = db.doc(`gameServers/${GAME_SERVER_DOCUMENT_ID}`);
  const result = await db.runTransaction(async transaction => {
    const serverSnap = await transaction.get(serverRef);
    const state = createGameServerState(
      serverSnap.exists ? serverSnap.data() : {},
      nowMs,
      { pruneStale: false }
    );
    const activeEntry = state.activeSlots[uid] || null;
    const waitingEntry = state.waitingQueue[uid] || null;
    const currentEntry = activeEntry || waitingEntry;
    if (!currentEntry) return { status: "missing" };
    if (currentEntry.sessionId !== sessionId) {
      return { serverId: GAME_SERVER_ID, serverName: GAME_SERVER_NAME, status: "session-replaced" };
    }
    const status = activeEntry ? "active" : "waiting";
    const entry = cleanGameServerEntry(currentEntry, { uid, sessionId, displayName });
    entry.displayName = displayName;
    entry.lastSeenAtMs = nowMs;
    writeGameServerMember(transaction, entry, status, nowMs);
    writeGameServerMembership(transaction, entry, status, nowMs);
    return {
      serverId: GAME_SERVER_ID,
      serverName: GAME_SERVER_NAME,
      status,
      admittedAtMs: status === "active" ? entry.admittedAtMs || 0 : 0,
      queuedAtMs: status === "waiting" ? entry.queuedAtMs || 0 : 0,
    };
  });
  if (result.status !== "missing") return result;
  return joinGameServerForPlayer({ uid, sessionId, displayName, nowMs });
}

async function leaveGameServerForPlayer({ uid, sessionId, nowMs = Date.now() }) {
  const serverRef = db.doc(`gameServers/${GAME_SERVER_DOCUMENT_ID}`);
  return serializeGameServerAdmission(() => withGameServerAdmissionLease(() => db.runTransaction(async transaction => {
    const serverSnap = await transaction.get(serverRef);
    const state = createGameServerState(serverSnap.exists ? serverSnap.data() : {}, nowMs, { pruneStale: false });
    const activeEntry = state.activeSlots[uid] || null;
    const waitingEntry = state.waitingQueue[uid] || null;
    const currentEntry = activeEntry || waitingEntry;
    if (currentEntry && currentEntry.sessionId !== sessionId) {
      return { serverId: GAME_SERVER_ID, serverName: GAME_SERVER_NAME, status: "session-replaced" };
    }

    delete state.activeSlots[uid];
    delete state.waitingQueue[uid];
    const promoted = promoteGameServerWaiters(state, nowMs);
    writeGameServerState(transaction, serverRef, state, nowMs);
    promoted.forEach(entry => {
      writeGameServerMember(transaction, entry, "active", nowMs);
      writeGameServerMembership(transaction, entry, "active", nowMs);
    });
    transaction.delete(db.doc(`gameServers/${GAME_SERVER_DOCUMENT_ID}/members/${uid}`));
    writeGameServerMembership(transaction, {
      uid,
      sessionId,
      displayName: currentEntry?.displayName || "Ruler",
    }, "left", nowMs);
    return { serverId: GAME_SERVER_ID, serverName: GAME_SERVER_NAME, status: "left" };
  })));
}

async function maintainGameServer(nowMs = Date.now()) {
  const serverRef = db.doc(`gameServers/${GAME_SERVER_DOCUMENT_ID}`);
  return serializeGameServerAdmission(() => withGameServerAdmissionLease(() => db.runTransaction(async transaction => {
    const staleBeforeMs = nowMs - GAME_SERVER_WAITING_STALE_MS;
    const memberQuery = serverRef.collection("members")
      .where("lastSeenAtMs", ">=", staleBeforeMs);
    const staleMemberQuery = serverRef.collection("members")
      .where("lastSeenAtMs", "<", staleBeforeMs)
      .limit(100);
    const [serverSnap, memberSnap, staleMemberSnap] = await Promise.all([
      transaction.get(serverRef),
      transaction.get(memberQuery),
      transaction.get(staleMemberQuery),
    ]);
    const rawState = applyGameServerMemberHeartbeats(
      serverSnap.exists ? serverSnap.data() : {},
      memberSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }))
    );
    const state = createGameServerState(rawState, nowMs);
    const promoted = promoteGameServerWaiters(state, nowMs);
    writeGameServerState(transaction, serverRef, state, nowMs);
    promoted.forEach(entry => {
      writeGameServerMember(transaction, entry, "active", nowMs);
      writeGameServerMembership(transaction, entry, "active", nowMs);
    });
    staleMemberSnap.docs.forEach(doc => transaction.delete(doc.ref));
    return {
      active: Object.keys(state.activeSlots).length,
      waiting: Object.keys(state.waitingQueue).length,
      promoted: promoted.length,
      staleMembersDeleted: staleMemberSnap.size,
    };
  })));
}

function normalizePlayerName(value, fallback = "Ruler") {
  const cleaned = String(value || "")
    .replace(/[^a-z0-9 _.-]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PLAYER_NAME_MAX_LENGTH);
  return cleaned || fallback;
}

const SERVER_WORLD_MAPS = Array.isArray(SERVER_WORLD_LAYOUT?.maps) ? SERVER_WORLD_LAYOUT.maps : [];
const SERVER_WORLD_MAP_BY_ID = new Map(SERVER_WORLD_MAPS.map(map => [safeString(map?.id, 80), map]));
const SERVER_WORLD_REGION_IDS = new Set(SERVER_WORLD_MAP_BY_ID.keys());
const SERVER_WORLD_OBJECTIVE_TARGETS = SERVER_WORLD_MAPS.flatMap(map => (
  Array.isArray(map?.objectives) ? map.objectives : []
).map(objective => ({
  id: safeString(objective?.id, 96),
  regionId: safeString(map?.id, 80),
  strongholdType: safeString(objective?.strongholdType || objective?.type, 32),
}))).filter(objective => objective.id && objective.regionId);
const SERVER_WORLD_OBJECTIVE_TARGET_KEYS = new Set(
  SERVER_WORLD_OBJECTIVE_TARGETS.map(objective => (
    `${normalizeRegionId(objective.regionId)}:${objective.id}`
  ))
);
const STARTER_REGION_IDS = Object.freeze(
  SERVER_WORLD_MAPS
    .filter(map => safeString(map?.type, 32).toLowerCase() === "starter")
    .map(map => normalizeRegionId(map.id))
);

function isKnownWorldRegionId(regionId = "") {
  return SERVER_WORLD_REGION_IDS.has(normalizeRegionId(regionId));
}

function requireKnownWorldRegionId(regionId = "") {
  const normalized = normalizeRegionId(regionId);
  if (!SERVER_WORLD_REGION_IDS.has(normalized)) {
    throw new HttpsError("invalid-argument", "That Crownlands map does not exist.");
  }
  return normalized;
}

function getServerWorldMap(regionId = "") {
  return SERVER_WORLD_MAP_BY_ID.get(normalizeRegionId(regionId)) || null;
}

function getServerWorldTargetIds(regionId = "") {
  const map = getServerWorldMap(regionId);
  return new Set([
    ...(Array.isArray(map?.cities) ? map.cities : []),
    ...(Array.isArray(map?.objectives) ? map.objectives : []),
  ].map(target => safeString(target?.id, 96)).filter(Boolean));
}

function getServerWorldRegularCityIds(regionId = "") {
  const map = getServerWorldMap(regionId);
  return new Set((Array.isArray(map?.cities) ? map.cities : [])
    .map(city => safeString(city?.id, 96))
    .filter(Boolean));
}

const SERVER_MEDIEVAL_CITY_PREFIXES = [
  "Alder", "Ash", "Barrow", "Bell", "Black", "Briar", "Brindle", "Brook", "Cedar", "Crow",
  "Dun", "Elder", "Ember", "Fair", "Fen", "Flint", "Green", "Grey", "Hart", "High",
  "Iron", "Kings", "Low", "Oak", "Raven", "Red", "Silver", "Stone", "Thorn", "Vale",
  "White", "Wolf", "Wyvern",
];
const SERVER_MEDIEVAL_REGION_PREFIXES = {
  center: ["Crown", "Lion", "Regal", "Scepter", "Royal", "Queen", "King", "High", "Gold", "Star"],
  north: ["Frost", "Snow", "Pine", "Winter", "Storm", "Moon", "Peak", "Cold", "Cloud", "Hawk"],
  south: ["Sun", "Salt", "Reed", "Willow", "Rose", "Marsh", "Tide", "Warm", "Bloom", "Pearl"],
  west: ["Oak", "Thorn", "Fox", "Ash", "Briar", "Crow", "Wild", "Wood", "Moss", "Fern"],
  east: ["Dawn", "Gold", "Bright", "Falcon", "Rose", "Wind", "Star", "Pearl", "Blue", "Ivory"],
};
const SERVER_MEDIEVAL_CITY_SUFFIXES = [
  "bury", "ford", "wick", "stead", "mere", "brook", "hollow", "watch", "gate", "fall",
  "bridge", "market", "vale", "den", "field", "worth", "cross", "moor", "reach", "cliffe",
  "hurst", "wall", "ham", "port",
];
const SERVER_MEDIEVAL_CITY_TITLES = [
  "Abbey", "Cross", "Gate", "March", "Market", "Mead", "Moor", "Rest", "Rise", "Watch",
];

function hashServerCityName(value = "") {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getServerCityNameIndex(cityId = "", fallbackIndex = 0) {
  const match = String(cityId || "").match(/_(\d+)$/);
  if (match) return Math.max(0, Math.floor(Number(match[1]) || 1) - 1);
  return Math.max(0, Math.floor(safeNumber(fallbackIndex, 0)));
}

function isServerGenericCityName(value = "", cityId = "") {
  const name = safeString(value, 80);
  if (!name) return true;
  if (/\d/.test(name)) return true;
  if (/^city(?:\s+|[-_])\d+$/i.test(name)) return true;
  return Boolean(cityId) && name.toLowerCase() === safeString(cityId, 96).toLowerCase();
}

function getServerCanonicalCityName(city = {}, regionId = "") {
  const cityId = safeString(city.id, 96);
  const normalizedRegionId = normalizeRegionId(regionId || city.regionId || city.startPool);
  const map = getServerWorldMap(normalizedRegionId);
  const mapCities = Array.isArray(map?.cities) ? map.cities : [];
  const mapIndex = mapCities.findIndex(entry => safeString(entry?.id, 96) === cityId);
  const mapCity = mapIndex >= 0 ? mapCities[mapIndex] : null;
  const configuredName = safeString(mapCity?.name || city.name, 80);
  if (!isServerGenericCityName(configuredName, cityId)) return configuredName;
  const cityIndex = getServerCityNameIndex(cityId, mapIndex >= 0 ? mapIndex : city.index);
  const prefixes = [...new Set([
    ...SERVER_MEDIEVAL_CITY_PREFIXES,
    ...(SERVER_MEDIEVAL_REGION_PREFIXES[normalizedRegionId] || []),
  ])];
  const comboCount = prefixes.length * SERVER_MEDIEVAL_CITY_SUFFIXES.length;
  const offset = hashServerCityName(`medieval-city:${normalizedRegionId}`) % comboCount;
  const comboIndex = (cityIndex * 487 + offset) % comboCount;
  const prefix = prefixes[comboIndex % prefixes.length];
  const suffix = SERVER_MEDIEVAL_CITY_SUFFIXES[
    Math.floor(comboIndex / prefixes.length) % SERVER_MEDIEVAL_CITY_SUFFIXES.length
  ];
  const title = SERVER_MEDIEVAL_CITY_TITLES[(cityIndex * 191 + offset) % SERVER_MEDIEVAL_CITY_TITLES.length];
  return cityIndex % 5 === 0 ? `${prefix}${suffix} ${title}` : `${prefix}${suffix}`;
}

function getServerWorldCampIds(regionId = "") {
  const map = getServerWorldMap(regionId);
  return new Set((Array.isArray(map?.camps) ? map.camps : [])
    .map(camp => safeString(camp?.id, 96))
    .filter(Boolean));
}

function getServerWorldDimensions() {
  const settings = SERVER_WORLD_LAYOUT?.globalSettings || {};
  return {
    width: Math.max(1000, Math.floor(safeNumber(settings.worldWidth, 13000))),
    height: Math.max(1000, Math.floor(safeNumber(settings.worldHeight, 17000))),
  };
}

function getServerMapImageDimensions(map = {}) {
  return {
    width: Math.max(1, Math.floor(safeNumber(map.imageWidth, 2048))),
    height: Math.max(1, Math.floor(safeNumber(map.imageHeight, 1536))),
  };
}

function getServerMapBounds(regionId = "") {
  const map = getServerWorldMap(regionId);
  if (!map) return null;
  const region = map.region || {};
  const dimensions = getServerMapImageDimensions(map);
  const world = getServerWorldDimensions();
  const aspect = Math.max(0.1, dimensions.width / Math.max(1, dimensions.height));
  const padding = Math.max(
    SERVER_ISLAND_MAP_PADDING,
    Math.round(Math.max(safeNumber(region.rx, 0), safeNumber(region.ry, 0)) * 0.22)
  );
  let width;
  let height;
  if (aspect >= 1) {
    width = Math.round((safeNumber(region.rx, 1000) + padding) * 2);
    height = Math.round(width / aspect);
  } else {
    height = Math.round((safeNumber(region.ry, 800) + padding) * 2);
    width = Math.round(height * aspect);
  }
  width = clamp(width, 1, world.width);
  height = clamp(height, 1, world.height);
  const left = clamp(Math.round(safeNumber(region.x, world.width / 2) - width / 2), 0, Math.max(0, world.width - width));
  const top = clamp(Math.round(safeNumber(region.y, world.height / 2) - height / 2), 0, Math.max(0, world.height - height));
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function serverImagePointToWorld(regionId = "", point = {}) {
  const map = getServerWorldMap(regionId);
  const bounds = getServerMapBounds(regionId);
  if (!map || !bounds) return null;
  const dimensions = getServerMapImageDimensions(map);
  return {
    x: bounds.left + safeNumber(point.x, 0) / dimensions.width * bounds.width,
    y: bounds.top + safeNumber(point.y, 0) / dimensions.height * bounds.height,
  };
}

function serverImageSizeToWorld(regionId = "", size = 1) {
  const map = getServerWorldMap(regionId);
  const bounds = getServerMapBounds(regionId);
  if (!map || !bounds) return Math.max(1, Math.floor(safeNumber(size, 1)));
  return Math.max(1, Math.round(Math.max(1, safeNumber(size, 1)) * bounds.width / getServerMapImageDimensions(map).width));
}

const SERVER_ROUTE_OBSTACLES_BY_REGION = new Map();

function getServerRouteObstacles(regionId = "") {
  const normalizedRegionId = normalizeRegionId(regionId);
  if (SERVER_ROUTE_OBSTACLES_BY_REGION.has(normalizedRegionId)) {
    return SERVER_ROUTE_OBSTACLES_BY_REGION.get(normalizedRegionId);
  }
  const map = getServerWorldMap(normalizedRegionId);
  const obstacles = [];
  const addObstacle = (target = {}, radius = SERVER_ROUTE_CITY_CLEARANCE) => {
    const id = safeString(target.id, 96);
    const point = serverImagePointToWorld(normalizedRegionId, target);
    if (!id || !point) return;
    obstacles.push({ id, x: point.x, y: point.y, radius: Math.max(1, safeNumber(radius, 1)) });
  };
  (Array.isArray(map?.cities) ? map.cities : []).forEach(city => {
    addObstacle(city, SERVER_ROUTE_CITY_CLEARANCE);
  });
  (Array.isArray(map?.objectives) ? map.objectives : []).forEach(objective => {
    addObstacle(
      objective,
      Math.max(
        SERVER_ROUTE_STRUCTURE_CLEARANCE,
        serverImageSizeToWorld(normalizedRegionId, objective.size || 154) * 0.55
      )
    );
  });
  (Array.isArray(map?.camps) ? map.camps : []).forEach(camp => {
    addObstacle(
      camp,
      Math.max(
        SERVER_ROUTE_STRUCTURE_CLEARANCE,
        serverImageSizeToWorld(normalizedRegionId, camp.size || SERVER_DEFAULT_CAMP_VISUAL_SIZE) * 0.55
      )
    );
  });
  SERVER_ROUTE_OBSTACLES_BY_REGION.set(normalizedRegionId, obstacles);
  return obstacles;
}

function pointToSegmentDistanceSquared(point = {}, start = {}, end = {}) {
  const dx = safeNumber(end.x, 0) - safeNumber(start.x, 0);
  const dy = safeNumber(end.y, 0) - safeNumber(start.y, 0);
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    const pointDx = safeNumber(point.x, 0) - safeNumber(start.x, 0);
    const pointDy = safeNumber(point.y, 0) - safeNumber(start.y, 0);
    return pointDx * pointDx + pointDy * pointDy;
  }
  const projection = clamp(
    ((safeNumber(point.x, 0) - safeNumber(start.x, 0)) * dx + (safeNumber(point.y, 0) - safeNumber(start.y, 0)) * dy) / lengthSquared,
    0,
    1
  );
  const nearestX = safeNumber(start.x, 0) + projection * dx;
  const nearestY = safeNumber(start.y, 0) + projection * dy;
  const pointDx = safeNumber(point.x, 0) - nearestX;
  const pointDy = safeNumber(point.y, 0) - nearestY;
  return pointDx * pointDx + pointDy * pointDy;
}

function assertRouteAvoidsWorldStructures(pathSegments = [], ignoredIds = new Set()) {
  for (const segment of pathSegments) {
    const obstacles = getServerRouteObstacles(segment.regionId)
      .filter(obstacle => !ignoredIds.has(obstacle.id));
    for (let index = 1; index < segment.points.length; index += 1) {
      const start = segment.points[index - 1];
      const end = segment.points[index];
      for (const obstacle of obstacles) {
        const enforcedRadius = Math.max(1, obstacle.radius - 2);
        if (pointToSegmentDistanceSquared(obstacle, start, end) < enforcedRadius * enforcedRadius) {
          throw new HttpsError("invalid-argument", "The march route crosses a city, camp, or stronghold.");
        }
      }
    }
  }
}

function getServerEdgeConnections(regionId = "") {
  const map = getServerWorldMap(regionId);
  const edgeConnections = map?.edgeConnections || {};
  return ["north", "south", "east", "west"].flatMap(side => (
    Array.isArray(edgeConnections[side]) ? edgeConnections[side] : []
  ).map(connection => ({ ...connection, side })))
    .filter(connection => !connection.intentionalOuter && isKnownWorldRegionId(connection.connectsToRegionId));
}

function getServerPortalConnection(fromRegionId = "", toRegionId = "") {
  const targetRegionId = normalizeRegionId(toRegionId);
  return getServerEdgeConnections(fromRegionId)
    .find(connection => normalizeRegionId(connection.connectsToRegionId) === targetRegionId) || null;
}

function getOppositeServerEdgeSide(side = "") {
  if (side === "north") return "south";
  if (side === "south") return "north";
  if (side === "east") return "west";
  if (side === "west") return "east";
  return "";
}

function getServerPortalWorldPoint(regionId = "", connection = null) {
  const map = getServerWorldMap(regionId);
  if (!map || !connection) return null;
  const dimensions = getServerMapImageDimensions(map);
  const side = safeString(connection.side, 12).toLowerCase();
  const start = clamp(safeNumber(connection.start, 0), 0, 1);
  const end = clamp(safeNumber(connection.end, start), 0, 1);
  const along = clamp((Math.min(start, end) + Math.max(start, end)) / 2, 0, 1);
  const inset = clamp(
    Math.round(Math.min(dimensions.width, dimensions.height) * 0.024),
    SERVER_ROUTE_INSET_MIN,
    SERVER_ROUTE_INSET_MAX
  );
  return serverImagePointToWorld(regionId, {
    x: side === "west" ? inset : side === "east" ? dimensions.width - inset : along * dimensions.width,
    y: side === "north" ? inset : side === "south" ? dimensions.height - inset : along * dimensions.height,
  });
}

function getServerArrivalConnection(sourceRegionId = "", targetRegionId = "", sourceConnection = null) {
  const oppositeSide = getOppositeServerEdgeSide(safeString(sourceConnection?.side, 12).toLowerCase());
  const candidates = getServerEdgeConnections(targetRegionId)
    .filter(connection => normalizeRegionId(connection.connectsToRegionId) === normalizeRegionId(sourceRegionId));
  return candidates.find(connection => !oppositeSide || connection.side === oppositeSide) || candidates[0] || null;
}

function findServerPortalRouteRegionChain(fromRegionId = "", toRegionId = "") {
  const sourceRegionId = requireKnownWorldRegionId(fromRegionId);
  const targetRegionId = requireKnownWorldRegionId(toRegionId);
  if (sourceRegionId === targetRegionId) return [sourceRegionId];
  const queue = [[sourceRegionId]];
  const visited = new Set([sourceRegionId]);
  while (queue.length) {
    const chain = queue.shift();
    const current = chain[chain.length - 1];
    for (const connection of getServerEdgeConnections(current)) {
      const next = normalizeRegionId(connection.connectsToRegionId);
      if (!next || visited.has(next)) continue;
      const nextChain = [...chain, next];
      if (next === targetRegionId) return nextChain;
      visited.add(next);
      queue.push(nextChain);
    }
  }
  throw new HttpsError("failed-precondition", "No portal route connects those maps.");
}

function getAuthoritativeIslandSeed(regionId = "") {
  const targetRegionId = requireKnownWorldRegionId(regionId);
  const map = getServerWorldMap(targetRegionId);
  const cities = (Array.isArray(map.cities) ? map.cities : []).map((city, index) => {
    const point = serverImagePointToWorld(targetRegionId, city);
    const id = city.id || `${targetRegionId}_${String(index + 1).padStart(3, "0")}`;
    return cleanServerCityLayoutSeed({
      ...city,
      id,
      name: getServerCanonicalCityName({ ...city, id, index }, targetRegionId),
      regionId: targetRegionId,
      startPool: targetRegionId,
      x: Math.round(point.x),
      y: Math.round(point.y),
      level: city.level || 1,
    });
  });
  (Array.isArray(map.objectives) ? map.objectives : []).forEach((objective, index) => {
    const point = serverImagePointToWorld(targetRegionId, objective);
    cities.push(cleanServerCityLayoutSeed({
      id: objective.id || `${targetRegionId}_stronghold_${index + 1}`,
      name: objective.name || objective.id,
      regionId: targetRegionId,
      startPool: targetRegionId,
      x: Math.round(point.x),
      y: Math.round(point.y),
      kind: "stronghold",
      strongholdType: objective.strongholdType || objective.type,
      bonus: objective.bonus,
      bonusPercent: objective.bonusPercent,
      size: serverImageSizeToWorld(targetRegionId, objective.size || 154),
      artSrc: objective.artSrc,
      startTroops: objective.startTroops || objective.troops,
      level: objective.level,
    }));
  });
  const camps = (Array.isArray(map.camps) ? map.camps : []).map((camp, index) => {
    const point = serverImagePointToWorld(targetRegionId, camp);
    return cleanServerCampLayoutSeed({
      id: camp.id || `${targetRegionId}_camp_${index + 1}`,
      name: camp.name || camp.id,
      regionId: targetRegionId,
      mapId: targetRegionId,
      x: Math.round(point.x),
      y: Math.round(point.y),
      size: serverImageSizeToWorld(targetRegionId, camp.size || 132),
      artSrc: camp.artSrc,
      campType: camp.campType || camp.type,
      rewardSchedule: camp.rewardSchedule,
      maxDailyRewards: camp.maxDailyRewards,
    });
  }).filter(camp => camp.id && isRewardCamp(camp));
  const world = getServerWorldDimensions();
  return {
    regionId: targetRegionId,
    islandId: getOnlineIslandId(targetRegionId),
    cities,
    camps,
    meta: {
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      releaseId: REALM_RELEASE_ID,
      regionId: targetRegionId,
      regionName: safeString(map.label || map.name || targetRegionId, 80),
      version: Math.max(1, Math.floor(safeNumber(SERVER_WORLD_LAYOUT.version, 1))),
      name: safeString(`${map.label || map.name || targetRegionId} - Crownlands`, 120),
      cityCount: cities.length,
      regionCount: SERVER_WORLD_MAPS.length,
      cityCountPerRegion: Math.max(0, Math.floor(safeNumber(map.cityCapacity, 0))),
      worldWidth: world.width,
      worldHeight: world.height,
    },
  };
}

function sanitizeJsonValue(value, depth = 0) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return null;
  if (value === null || typeof value !== "object") return value;
  if (depth >= 6) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map(item => sanitizeJsonValue(item, depth + 1));
  }
  const output = {};
  Object.entries(value).slice(0, 80).forEach(([key, entry]) => {
    const cleanKey = safeString(key, 80);
    if (!cleanKey) return;
    const cleanValue = sanitizeJsonValue(entry, depth + 1);
    if (cleanValue !== undefined) output[cleanKey] = cleanValue;
  });
  return output;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value, min, max) {
  return clamp(Math.floor(safeNumber(value, min)), min, max);
}

function clampCityLevel(level) {
  return clampInt(level, 1, Number.MAX_SAFE_INTEGER);
}

function isStronghold(city = {}) {
  return Boolean(city && (city.kind === "stronghold" || city.strongholdType || STRONGHOLD_IDS.has(city.id)));
}

function isGoldStronghold(city = {}) {
  const type = String(city.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "gold" || type === "gold_stronghold" || city.id === GOLD_STRONGHOLD_ID);
}

function isTrainingStronghold(city = {}) {
  const type = String(city.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "training" || type === "troop" || type === "troop_stronghold" || city.id === TRAINING_STRONGHOLD_ID);
}

function isSpeedStronghold(city = {}) {
  const type = String(city.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "speed" || type === "march_speed" || type === "march_speed_stronghold" || city.id === SPEED_STRONGHOLD_ID);
}

function isDefenseStronghold(city = {}) {
  const type = String(city.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "defense" || type === "defense_stronghold" || city.id === DEFENSE_STRONGHOLD_ID);
}

function isCrownCitadel(city = {}) {
  const type = String(city.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "crown" || type === "crown_citadel" || city.id === CROWN_CITADEL_ID);
}

function getPublicStrongholdSnapshot(city = {}) {
  if (!isStronghold(city)) return null;
  const id = safeString(city.id, 96);
  const fallbackNames = {
    [GOLD_STRONGHOLD_ID]: "Aurum Keep",
    [TRAINING_STRONGHOLD_ID]: "Greybanner Hold",
    [SPEED_STRONGHOLD_ID]: "Swiftgate",
    [DEFENSE_STRONGHOLD_ID]: "Ironwatch",
    [CROWN_CITADEL_ID]: "Crown Citadel",
  };
  return {
    id,
    name: safeString(city.name || fallbackNames[id] || "Stronghold", 80),
    strongholdType: safeString(city.strongholdType, 32),
    regionId: normalizeRegionId(city.regionId || ""),
  };
}

function crownCitadelReignRef(uid = "") {
  const safeUid = safeString(uid, 128).replace(/[^a-zA-Z0-9_-]/g, "_");
  return safeUid ? db.doc(`crownCitadelReigns/${RESET_GENERATION}/entries/${safeUid}`) : null;
}

async function recordCrownCitadelControlChange(transaction, {
  citadel = {},
  previousOwnerUid = "",
  previousOwnerName = "",
  nextOwnerUid = "",
  nextOwnerName = "",
  nextOwnerFlag = null,
  nowMs = Date.now(),
} = {}) {
  if (!transaction || !isCrownCitadel(citadel)) return;
  const oldUid = safeString(previousOwnerUid, 128);
  const newUid = safeString(nextOwnerUid, 128);
  if (oldUid === newUid) return;

  const oldRef = crownCitadelReignRef(oldUid);
  const newRef = crownCitadelReignRef(newUid);
  const refs = [...new Set([oldRef, newRef].filter(Boolean))];
  const snapshots = new Map();
  for (const ref of refs) snapshots.set(ref.path, await transaction.get(ref));

  if (oldRef) {
    const oldData = snapshots.get(oldRef.path)?.data() || {};
    const isCurrentWorldRecord = safeString(oldData.worldId, 120) === ONLINE_WORLD_ID
      && safeString(oldData.resetGeneration, 120) === RESET_GENERATION;
    const recordedHeldSinceMs = isCurrentWorldRecord
      ? Math.max(0, Math.floor(safeNumber(oldData.currentHeldSinceMs, 0)))
      : 0;
    const heldSinceMs = recordedHeldSinceMs || Math.max(0, Math.floor(safeNumber(
      citadel.lastCapturedAtMs,
      timestampToMs(citadel.lastCapturedAt)
    )));
    const completedReignMs = heldSinceMs > 0 ? Math.max(0, nowMs - heldSinceMs) : 0;
    transaction.set(oldRef, {
      playerId: oldUid,
      playerName: normalizePlayerName(previousOwnerName || oldData.playerName, "Ruler"),
      playerFlag: oldData.playerFlag || citadel.ownerFlag || null,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      totalHeldMs: (isCurrentWorldRecord ? Math.max(0, Math.floor(safeNumber(oldData.totalHeldMs, 0))) : 0) + completedReignMs,
      currentHeldSinceMs: 0,
      isCurrentHolder: false,
      lastLostAtMs: nowMs,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (newRef) {
    const newData = snapshots.get(newRef.path)?.data() || {};
    const isCurrentWorldRecord = safeString(newData.worldId, 120) === ONLINE_WORLD_ID
      && safeString(newData.resetGeneration, 120) === RESET_GENERATION;
    transaction.set(newRef, {
      playerId: newUid,
      playerName: normalizePlayerName(nextOwnerName || newData.playerName, "Ruler"),
      playerFlag: nextOwnerFlag || newData.playerFlag || null,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      totalHeldMs: isCurrentWorldRecord ? Math.max(0, Math.floor(safeNumber(newData.totalHeldMs, 0))) : 0,
      currentHeldSinceMs: nowMs,
      isCurrentHolder: true,
      lastCapturedAtMs: nowMs,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

function getStrongholdBonusPercent(city = {}) {
  if (isCrownCitadel(city)) return CROWN_CITADEL_GOLD_BONUS_PERCENT;
  if (isDefenseStronghold(city)) return DEFENSE_STRONGHOLD_BONUS_PERCENT;
  if (isSpeedStronghold(city)) return SPEED_STRONGHOLD_BONUS_PERCENT;
  if (isTrainingStronghold(city)) return TRAINING_STRONGHOLD_BONUS_PERCENT;
  if (isGoldStronghold(city)) return GOLD_STRONGHOLD_BONUS_PERCENT;
  return Number.isFinite(Number(city.bonusPercent)) ? Math.max(0, Math.floor(Number(city.bonusPercent) || 0)) : 0;
}

function getStrongholdDefenseLevel(city = {}) {
  if (!isStronghold(city)) return 0;
  return clampCityLevel(city.level || STRONGHOLD_LEVELS[city.id] || 50);
}

function normalizeSkillLevel(value) {
  return Math.max(0, Math.floor(safeNumber(value, 0)));
}

function getSkillMaxLevel(skill = "") {
  const config = SKILL_CONFIG[skill];
  if (!config || !Number.isFinite(config.maxPercent)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.ceil(config.maxPercent / Math.max(1, config.percentPerLevel)));
}

function normalizeSkillLevelForSkill(skill = "", value = 0) {
  return Math.min(normalizeSkillLevel(value), getSkillMaxLevel(skill));
}

function normalizeSkillUpgrades(upgrades = {}) {
  const source = upgrades && typeof upgrades === "object" ? upgrades : {};
  const normalized = SKILL_ORDER.reduce((skills, key) => {
    skills[key] = normalizeSkillLevel(source[key]);
    return skills;
  }, {});

  const legacyAttack = Math.max(normalizeSkillLevel(source.striker), normalizeSkillLevel(source.attack));
  const legacyIncome = Math.max(normalizeSkillLevel(source.prosperous), normalizeSkillLevel(source.income));
  const legacyTroops = Math.max(normalizeSkillLevel(source.recruiter), normalizeSkillLevel(source.income));
  const legacyDefense = Math.max(normalizeSkillLevel(source.guardian), normalizeSkillLevel(source.defense));
  const legacySpeed = Math.max(normalizeSkillLevel(source.rusher), normalizeSkillLevel(source.speed));
  const legacyRecovery = Math.max(normalizeSkillLevel(source.fearless), normalizeSkillLevel(source.brave));

  normalized.swordmastery = Math.max(normalized.swordmastery, legacyAttack);
  normalized.taxStewardship = Math.max(normalized.taxStewardship, legacyIncome);
  normalized.royalGranaries = Math.max(normalized.royalGranaries, legacyTroops);
  normalized.stoneworks = Math.max(normalized.stoneworks, legacyDefense);
  normalized.marchOrders = Math.max(normalized.marchOrders, legacySpeed);
  normalized.fieldMedics = Math.max(normalized.fieldMedics, legacyRecovery);
  SKILL_ORDER.forEach(key => {
    normalized[key] = normalizeSkillLevelForSkill(key, normalized[key]);
  });
  return normalized;
}

function getSpentSkillPoints(upgrades = {}) {
  const normalized = normalizeSkillUpgrades(upgrades);
  return SKILL_ORDER.reduce((total, key) => total + normalizeSkillLevel(normalized[key]), 0);
}

function getEarnedSkillPoints(character = {}) {
  return Math.max(0, Math.floor(safeNumber(character?.level, CHARACTER_START_LEVEL)) - 1);
}

function getAvailableSkillPoints(character = {}, upgrades = {}) {
  return Math.max(0, getEarnedSkillPoints(character) - getSpentSkillPoints(upgrades));
}

function reconcileSkillPoints(character = {}, upgrades = {}) {
  const next = normalizeCharacterProgress(character);
  next.skillPoints = getAvailableSkillPoints(next, upgrades);
  return next;
}

function getSkillLevel(profile = {}, skill = "") {
  return normalizeSkillUpgrades(profile?.upgrades)[skill] || 0;
}

function getSkillPercent(profile = {}, skill = "") {
  const config = SKILL_CONFIG[skill];
  if (!config) return 0;
  const raw = getSkillLevel(profile, skill) * config.percentPerLevel;
  return Number.isFinite(config.maxPercent) ? Math.min(raw, config.maxPercent) : raw;
}

function skillMultiplier(profile = {}, skill = "") {
  return Number((1 + getSkillPercent(profile, skill) / 100).toFixed(3));
}

function getMillionLordsCityProductionVp(level) {
  const normalizedLevel = clampCityLevel(level);
  const rawValue = MILLION_LORDS_CITY_PRODUCTION_VP_BASE
    * Math.pow(MILLION_LORDS_CITY_PRODUCTION_VP_GROWTH, normalizedLevel - 1);
  if (!Number.isFinite(rawValue)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(rawValue + 0.000001)));
}

function getMillionLordsPassiveGoldPerHour(level) {
  const normalizedLevel = clampCityLevel(level);
  const curveLevel = Math.min(normalizedLevel, CITY_GOLD_ENDGAME_START_LEVEL);
  const level100Base = getMillionLordsCityProductionVp(curveLevel)
    * MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP;
  const endgameMultiplier = normalizedLevel > CITY_GOLD_ENDGAME_START_LEVEL
    ? Math.pow(CITY_GOLD_ENDGAME_GROWTH, normalizedLevel - CITY_GOLD_ENDGAME_START_LEVEL)
    : 1;
  const rawGold = level100Base * endgameMultiplier;
  if (!Number.isFinite(rawGold)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(rawGold)));
}

function getCityProductionStats(city = {}, profile = {}, bonuses = {}, options = {}) {
  const stronghold = isStronghold(city);
  const level = stronghold ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level);
  const victoryPoints = Math.floor(
    CITY_LEVEL_STATS.victoryPointsBase
      + level * CITY_LEVEL_STATS.victoryPointsPerLevel
      + Math.pow(level, CITY_LEVEL_STATS.victoryPointsExponent) * CITY_LEVEL_STATS.victoryPointsExponentScale
  );
  const includeSkillBoosts = options.includeSkillBoosts !== false;
  const includeStrongholdBoosts = options.includeStrongholdBoosts !== false;
  const royalGranariesPercent = includeSkillBoosts ? getSkillPercent(profile, "royalGranaries") : 0;
  const taxStewardshipPercent = includeSkillBoosts ? getSkillPercent(profile, "taxStewardship") : 0;
  const strongholdTroopBonusPercent = includeStrongholdBoosts
    ? Math.max(0, safeNumber(bonuses.troopBonusPercent, 0))
    : 0;
  const strongholdGoldBonusPercent = includeStrongholdBoosts
    ? Math.max(0, safeNumber(bonuses.goldBonusPercent, 0))
    : 0;
  const nowMs = Math.max(0, safeNumber(options.nowMs, Date.now()));
  const warDrumsExpiresAtMs = Math.max(0, Math.floor(safeNumber(profile?.itemEffects?.warDrumsExpiresAtMs, 0)));
  const warDrumsTroopBonusPercent = options.includeWarDrums !== false && !stronghold && warDrumsExpiresAtMs > nowMs
    ? WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT
    : 0;
  const royalTaxDecreeExpiresAtMs = Math.max(0, Math.floor(safeNumber(profile?.itemEffects?.royalTaxDecreeExpiresAtMs, 0)));
  const royalTaxDecreeGoldBonusPercent = options.includeRoyalTaxDecree !== false && !stronghold && royalTaxDecreeExpiresAtMs > nowMs
    ? ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT
    : 0;
  const baseTroopProductionPerHour = stronghold ? 0 : victoryPoints * CITY_LEVEL_STATS.troopProductionPerVictoryPoint;
  const untimedTroopProductionPerHour = baseTroopProductionPerHour
    * (1 + royalGranariesPercent / 100)
    * (1 + strongholdTroopBonusPercent / 100);
  const troopProductionPerHour = untimedTroopProductionPerHour
    * (1 + warDrumsTroopBonusPercent / 100);
  const rawGoldProductionPerHour = stronghold ? 0 : getMillionLordsPassiveGoldPerHour(level);
  const untimedGoldProductionPerHour = rawGoldProductionPerHour
    * (1 + taxStewardshipPercent / 100)
    * (1 + strongholdGoldBonusPercent / 100);
  const goldProductionPerHour = untimedGoldProductionPerHour
    * (1 + royalTaxDecreeGoldBonusPercent / 100);

  return {
    level,
    victoryPoints,
    baseTroopProductionPerHour,
    untimedTroopProductionPerHour,
    troopProductionPerHour,
    troopProductionBonusPerHour: Math.max(0, troopProductionPerHour - baseTroopProductionPerHour),
    baseGoldProductionPerHour: rawGoldProductionPerHour,
    untimedGoldProductionPerHour,
    goldProductionPerHour,
    goldProductionBonusPerHour: Math.max(0, goldProductionPerHour - rawGoldProductionPerHour),
    royalGranariesPercent,
    taxStewardshipPercent,
    strongholdTroopBonusPercent,
    strongholdGoldBonusPercent,
    warDrumsTroopBonusPercent,
    royalTaxDecreeGoldBonusPercent,
    troopProductionPerSecond: troopProductionPerHour / 3600,
    goldProductionPerSecond: goldProductionPerHour / 3600,
  };
}

function getBaseCityWalls(level) {
  const normalizedLevel = clampCityLevel(level);
  const growth = (
    Math.pow(normalizedLevel, CITY_LEVEL_STATS.cityWallsExponent) - 1
  ) * CITY_LEVEL_STATS.cityWallsExponentScale;
  const walls = CITY_LEVEL_STATS.cityWallsBase + Math.max(0, growth);
  if (!Number.isFinite(walls)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(walls)));
}

function getCityStats(city = {}, defenderProfile = null, bonuses = {}) {
  const stronghold = isStronghold(city);
  const level = stronghold ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level);
  const victoryPoints = Math.floor(
    CITY_LEVEL_STATS.victoryPointsBase
      + level * CITY_LEVEL_STATS.victoryPointsPerLevel
      + Math.pow(level, CITY_LEVEL_STATS.victoryPointsExponent) * CITY_LEVEL_STATS.victoryPointsExponentScale
  );
  const defensePercent = level * CITY_LEVEL_STATS.defensePercentPerLevel;
  const baseCityWalls = getBaseCityWalls(level);
  const stoneworksPercent = defenderProfile ? getSkillPercent(defenderProfile, "stoneworks") : 0;
  const cityWalls = Math.floor(baseCityWalls * (1 + stoneworksPercent / 100));
  const troopDefense = Math.floor((Math.max(0, Math.floor(safeNumber(city.troops, 0)))) * (1 + defensePercent / 100));
  const cityWallsBonus = Math.max(0, cityWalls - baseCityWalls);
  const baseTotalDefense = Math.floor(baseCityWalls + troopDefense);
  const preStrongholdTotalDefense = Math.floor(cityWalls + troopDefense);
  const strongholdDefenseBonusPercent = Math.max(0, safeNumber(bonuses.cityDefenseBonusPercent, 0));
  const strongholdDefenseBonus = Math.floor(preStrongholdTotalDefense * strongholdDefenseBonusPercent / 100);
  const totalDefense = preStrongholdTotalDefense + strongholdDefenseBonus;

  return {
    level,
    victoryPoints,
    defensePercent,
    baseCityWalls,
    cityWalls,
    cityWallsBonus,
    stoneworksPercent,
    troopDefense,
    baseTotalDefense,
    strongholdDefenseBonusPercent,
    strongholdDefenseBonus,
    totalDefenseBonus: Math.max(0, totalDefense - baseTotalDefense),
    totalDefense,
  };
}

function getAlliedReinforcementTroops(target = {}) {
  return Math.max(0, Math.floor(safeNumber(target.alliedReinforcementTroops, 0)));
}

function getTargetOwnerTroops(target = {}, targetType = "city") {
  return Math.max(0, Math.floor(safeNumber(
    targetType === "camp" ? target.currentGarrison : target.troops,
    target.troops
  )));
}

function createReinforcedCombatTarget(target = {}, targetType = "city") {
  const ownerTroops = getTargetOwnerTroops(target, targetType);
  const alliedTroops = getAlliedReinforcementTroops(target);
  const totalTroops = Math.min(Number.MAX_SAFE_INTEGER, ownerTroops + alliedTroops);
  return {
    ...target,
    troops: totalTroops,
    troopFloat: totalTroops,
    ownerGarrisonTroops: ownerTroops,
    alliedReinforcementTroops: alliedTroops,
  };
}

function getTroopKingPower(troops = 0) {
  const troopCount = Math.max(0, Math.floor(safeNumber(troops, 0)));
  if (!troopCount) return 0;
  const power = troopCount * KING_POWER_ARMY_TROOP_VALUE;
  return Number.isFinite(power) ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(power)) : Number.MAX_SAFE_INTEGER;
}

function getCityInfrastructurePowerComponents(city = {}, bonuses = {}) {
  if (!city) {
    return { replacementPower: 0, defensivePower: 0, sustainableTroopPerHour: 0 };
  }
  const troopCount = Math.max(0, Math.floor(safeNumber(city.troops, 0)));
  const production = getCityProductionStats(city, {}, bonuses, {
    includeWarDrums: false,
    includeRoyalTaxDecree: false,
  });
  const defense = getCityStats(city, null, bonuses);
  const sustainableTroopPerHour = Math.max(0, safeNumber(production.troopProductionPerHour, 0));
  const defensiveAdvantage = Math.max(0, safeNumber(defense.totalDefense, 0) - troopCount);
  return {
    replacementPower: Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.floor(sustainableTroopPerHour * KING_POWER_REPLACEMENT_HOURS)
    ),
    defensivePower: Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.floor(defensiveAdvantage * KING_POWER_DEFENSIVE_ADVANTAGE_WEIGHT)
    ),
    sustainableTroopPerHour,
  };
}

function getCityInfrastructurePower(city = {}, bonuses = {}) {
  const components = getCityInfrastructurePowerComponents(city, bonuses);
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.floor(safeNumber(components.replacementPower, 0)))
      + Math.max(0, Math.floor(safeNumber(components.defensivePower, 0)))
  );
}

function getCityPowerFloor(city = {}) {
  if (!city) return 0;
  return getCityInfrastructurePower(city) + getTroopKingPower(city.troops);
}

function playerGlobalStatsRef(uid = "") {
  return db.doc(`players/${safeString(uid, 128)}/stats/global`);
}

function rewardedAdStateRef(uid = "") {
  return db.doc(`players/${safeString(uid, 128)}/rewardedAds/state`);
}

function rewardedAdIntentRef(uid = "", intentId = "") {
  return db.doc(`players/${safeString(uid, 128)}/rewardedAdIntents/${safeString(intentId, 96)}`);
}

function rewardedAdServerConfigRef() {
  return db.doc("serverConfig/rewardedAds");
}

function leaderboardEntryRef(uid = "") {
  return db.doc(`leaderboards/${RESET_GENERATION}/entries/${safeString(uid, 128)}`);
}

function getArmyStatsKey(army = {}) {
  return safeString(army.id || army.armyId || "", 96);
}

function createActiveArmiesFromSnapshot(uid = "", activeArmiesSnap = null) {
  const playerUid = safeString(uid, 128);
  if (!playerUid || !activeArmiesSnap?.docs) return [];
  const armiesById = new Map();
  activeArmiesSnap.docs.forEach(doc => {
    const army = {
      id: safeString(doc.data()?.id || doc.id, 96),
      islandId: safeString(doc.ref.parent?.parent?.id, 160),
      ...doc.data(),
    };
    if (getOwnerUid(army) !== playerUid || army.status !== "active" || !isCurrentWorldArmy(army)) return;
    if (!armiesById.has(army.id)) armiesById.set(army.id, army);
  });
  return [...armiesById.values()];
}

function activeArmiesQueryForPlayer(uid = "") {
  return db.collection("armies")
    .where("ownerUid", "==", safeString(uid, 128))
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .where("status", "==", "active");
}

function heldRewardCampsQueryForPlayer(uid = "") {
  return db.collectionGroup("camps")
    .where("holderUid", "==", safeString(uid, 128))
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID);
}

function createHeldCampEntriesFromSnapshot(uid = "", heldCampsSnap = null) {
  const playerUid = safeString(uid, 128);
  if (!playerUid || !heldCampsSnap?.docs) return [];
  return heldCampsSnap.docs.map(doc => {
    const islandId = safeString(doc.ref.parent?.parent?.id, 160);
    if (!isCurrentWorldIslandId(islandId)) return null;
    const data = doc.data() || {};
    if (safeString(data.holderUid || data.ownerUid, 128) !== playerUid) return null;
    const regionId = normalizeRegionId(data.regionId || getRegionIdFromOnlineIslandId(islandId));
    if (!getServerWorldCampIds(regionId).has(doc.id)) return null;
    const camp = getRewardCampCombatTarget({
      id: doc.id,
      ...data,
      islandId,
      regionId,
    });
    return camp ? { ref: doc.ref, camp } : null;
  }).filter(Boolean);
}

function isCurrentWorldArmy(army = {}) {
  if (army.worldId && safeString(army.worldId, 120) !== ONLINE_WORLD_ID) return false;
  if (army.resetGeneration && safeString(army.resetGeneration, 120) !== RESET_GENERATION) return false;
  const routeRegionIds = normalizeRegionIds(army.routeRegionIds || []);
  if (routeRegionIds.some(regionId => isCurrentWorldIslandId(getOnlineIslandId(regionId)))) return true;
  const sourceRegionId = normalizeRegionId(army.sourceRegionId || "");
  const targetRegionId = normalizeRegionId(army.targetRegionId || "");
  return isCurrentWorldIslandId(army.islandId)
    || isCurrentWorldIslandId(getOnlineIslandId(sourceRegionId))
    || isCurrentWorldIslandId(getOnlineIslandId(targetRegionId));
}

function createGlobalStatsSnapshot({
  uid = "",
  profile = {},
  cityEntries = [],
  heldCamps = [],
  activeArmies = [],
  bonuses = null,
  nowMs = Date.now(),
} = {}) {
  const playerUid = safeString(uid, 128);
  const ownedEntries = (Array.isArray(cityEntries) ? cityEntries : [])
    .filter(entry => entry?.city && getOwnerUid(entry.city) === playerUid)
    .filter(entry => isCurrentWorldIslandId(getCityEntryIslandId(entry) || getOnlineIslandId(entry.city.regionId)));
  const resolvedBonuses = bonuses || getOwnedStrongholdBonuses(ownedEntries);
  const profileForStats = {
    ...profile,
    itemEffects: normalizeItemEffects(profile.itemEffects),
  };
  const stationedReinforcementTroops = safeString(profileForStats.reinforcementResetGeneration, 120) === RESET_GENERATION
    ? Math.max(0, Math.floor(safeNumber(profileForStats.stationedReinforcementTroops, 0)))
    : 0;
  const committedRallyTroops = safeString(profileForStats.rallyResetGeneration, 120) === RESET_GENERATION
    ? Math.max(0, Math.floor(safeNumber(profileForStats.committedRallyTroops, 0)))
    : 0;

  let totalCities = 0;
  let strongholdCount = 0;
  let totalCityTroops = 0;
  let totalCampTroops = 0;
  let totalCityLevels = 0;
  let totalVictoryPoints = 0;
  let replacementPower = 0;
  let defensivePower = 0;
  let baseReplacementPower = 0;
  let baseDefensivePower = 0;
  let sustainableTroopPerHour = 0;
  let goldPerHour = 0;
  let troopPerHour = 0;
  let baseGoldPerHour = 0;
  let baseTroopPerHour = 0;
  let untimedGoldPerHour = 0;
  let untimedTroopPerHour = 0;
  // Include zeroes so Firestore merge writes clear regions where the player lost their final city.
  const cityCountsByRegion = Object.fromEntries(
    [...SERVER_WORLD_REGION_IDS].map(regionId => [regionId, 0])
  );

  ownedEntries.forEach(entry => {
    const city = entry.city || {};
    const troopCount = Math.max(0, Math.floor(safeNumber(city.troops, 0)));
    const stats = getCityProductionStats(city, profileForStats, resolvedBonuses, { nowMs });
    const powerComponents = getCityInfrastructurePowerComponents(city, resolvedBonuses);
    const basePowerComponents = getCityInfrastructurePowerComponents(city, {});
    totalCityTroops += troopCount;
    totalVictoryPoints += Math.max(0, Math.floor(safeNumber(stats.victoryPoints, 0)));
    replacementPower += powerComponents.replacementPower;
    defensivePower += powerComponents.defensivePower;
    baseReplacementPower += basePowerComponents.replacementPower;
    baseDefensivePower += basePowerComponents.defensivePower;
    sustainableTroopPerHour += powerComponents.sustainableTroopPerHour;
    goldPerHour += Math.max(0, safeNumber(stats.goldProductionPerHour, 0));
    troopPerHour += Math.max(0, safeNumber(stats.troopProductionPerHour, 0));
    baseGoldPerHour += Math.max(0, safeNumber(stats.baseGoldProductionPerHour, 0));
    baseTroopPerHour += Math.max(0, safeNumber(stats.baseTroopProductionPerHour, 0));
    untimedGoldPerHour += Math.max(0, safeNumber(stats.untimedGoldProductionPerHour, 0));
    untimedTroopPerHour += Math.max(0, safeNumber(stats.untimedTroopProductionPerHour, 0));
    if (isStronghold(city)) {
      strongholdCount += 1;
    } else {
      totalCities += 1;
      totalCityLevels += clampCityLevel(city.level);
      const regionId = normalizeRegionId(city.regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(entry)));
      cityCountsByRegion[regionId] = (cityCountsByRegion[regionId] || 0) + 1;
    }
  });

  (Array.isArray(heldCamps) ? heldCamps : []).forEach(entry => {
    const camp = entry?.camp;
    if (!camp || getOwnerUid(camp) !== playerUid) return;
    const islandId = safeString(camp.islandId || entry.ref?.parent?.parent?.id, 160);
    if (!isCurrentWorldIslandId(islandId)) return;
    const troopCount = Math.max(0, Math.floor(safeNumber(camp.troops, 0)));
    const powerComponents = getCityInfrastructurePowerComponents(camp, resolvedBonuses);
    const basePowerComponents = getCityInfrastructurePowerComponents(camp, {});
    totalCampTroops += troopCount;
    defensivePower += powerComponents.defensivePower;
    baseDefensivePower += basePowerComponents.defensivePower;
  });

  const marchingById = new Map();
  (Array.isArray(activeArmies) ? activeArmies : []).forEach(army => {
    if (!army || getOwnerUid(army) !== playerUid || army.status !== "active" || !isCurrentWorldArmy(army)) return;
    if (army.rallyAttack === true) return;
    const key = getArmyStatsKey(army);
    if (!key || marchingById.has(key)) return;
    marchingById.set(key, army);
  });
  const totalMarchingTroops = [...marchingById.values()]
    .reduce((total, army) => total + Math.max(0, Math.floor(safeNumber(army.troops, 0))), 0);
  const totalTroops = totalCityTroops + totalCampTroops;
  const totalMilitaryTroops = totalTroops + totalMarchingTroops + stationedReinforcementTroops + committedRallyTroops;
  const armyPower = getTroopKingPower(totalMilitaryTroops);
  const cityTroopPower = getTroopKingPower(totalCityTroops);
  const campTroopPower = getTroopKingPower(totalCampTroops);
  const reinforcementTroopPower = getTroopKingPower(stationedReinforcementTroops);
  const rallyTroopPower = getTroopKingPower(committedRallyTroops);
  const stationedTroopPower = Math.min(
    Number.MAX_SAFE_INTEGER,
    cityTroopPower + campTroopPower + reinforcementTroopPower + rallyTroopPower
  );
  const marchingPower = getTroopKingPower(totalMarchingTroops);
  replacementPower = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(replacementPower)));
  defensivePower = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(defensivePower)));
  baseReplacementPower = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(baseReplacementPower)));
  baseDefensivePower = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(baseDefensivePower)));
  sustainableTroopPerHour = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(sustainableTroopPerHour)));
  const cityPower = Math.min(Number.MAX_SAFE_INTEGER, replacementPower + defensivePower);
  const kingPower = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(armyPower + cityPower)));
  const baseKingPower = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.floor(armyPower + baseReplacementPower + baseDefensivePower))
  );
  const character = normalizeCharacterProgress(profileForStats.character);

  return {
    playerId: playerUid,
    uid: playerUid,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    version: GLOBAL_PLAYER_STATS_VERSION,
    totalCities,
    totalTroops,
    totalCityTroops,
    totalCampTroops,
    totalMarchingTroops,
    totalReinforcementTroops: stationedReinforcementTroops,
    totalRallyTroops: committedRallyTroops,
    totalCityLevels,
    totalVictoryPoints,
    strongholdCount,
    cityCountsByRegion,
    goldPerHour: Math.max(0, Math.floor(goldPerHour)),
    troopPerHour: Math.max(0, Math.floor(troopPerHour)),
    baseGoldPerHour: Math.max(0, Math.floor(baseGoldPerHour)),
    baseTroopPerHour: Math.max(0, Math.floor(baseTroopPerHour)),
    untimedGoldPerHour: Math.max(0, Math.floor(untimedGoldPerHour)),
    untimedTroopPerHour: Math.max(0, Math.floor(untimedTroopPerHour)),
    sustainableTroopPerHour,
    armyPower,
    replacementPower,
    defensivePower,
    baseReplacementPower,
    baseDefensivePower,
    strongholdBonusesAuthoritative: true,
    strongholdBonusSource: safeString(resolvedBonuses.source, 32),
    crownCitadelControlled: Boolean(resolvedBonuses.crownCitadelControlled),
    strongholdGoldBonusPercent: Math.max(0, Math.floor(safeNumber(resolvedBonuses.goldBonusPercent, 0))),
    strongholdTroopBonusPercent: Math.max(0, Math.floor(safeNumber(resolvedBonuses.troopBonusPercent, 0))),
    strongholdMarchSpeedBonusPercent: Math.max(0, Math.floor(safeNumber(resolvedBonuses.marchSpeedBonusPercent, 0))),
    strongholdDefenseBonusPercent: Math.max(0, Math.floor(safeNumber(resolvedBonuses.cityDefenseBonusPercent, 0))),
    strongholdUpgradeCostReductionPercent: Math.max(0, Math.floor(safeNumber(resolvedBonuses.upgradeCostReductionPercent, 0))),
    personalStrongholdGoldBonusPercent: Math.max(0, safeNumber(resolvedBonuses.personalGoldBonusPercent, resolvedBonuses.goldBonusPercent)),
    personalStrongholdTroopBonusPercent: Math.max(0, safeNumber(resolvedBonuses.personalTroopBonusPercent, resolvedBonuses.troopBonusPercent)),
    personalStrongholdMarchSpeedBonusPercent: Math.max(0, safeNumber(resolvedBonuses.personalMarchSpeedBonusPercent, resolvedBonuses.marchSpeedBonusPercent)),
    personalStrongholdDefenseBonusPercent: Math.max(0, safeNumber(resolvedBonuses.personalDefenseBonusPercent, resolvedBonuses.cityDefenseBonusPercent)),
    personalStrongholdUpgradeCostReductionPercent: Math.max(0, safeNumber(resolvedBonuses.personalUpgradeCostReductionPercent, resolvedBonuses.upgradeCostReductionPercent)),
    sharedClanGoldBonusPercent: Math.max(0, safeNumber(resolvedBonuses.sharedGoldBonusPercent, 0)),
    sharedClanTroopBonusPercent: Math.max(0, safeNumber(resolvedBonuses.sharedTroopBonusPercent, 0)),
    sharedClanMarchSpeedBonusPercent: Math.max(0, safeNumber(resolvedBonuses.sharedMarchSpeedBonusPercent, 0)),
    sharedClanDefenseBonusPercent: Math.max(0, safeNumber(resolvedBonuses.sharedDefenseBonusPercent, 0)),
    sharedClanUpgradeCostReductionPercent: Math.max(0, safeNumber(resolvedBonuses.sharedUpgradeCostReductionPercent, 0)),
    clanCitadelBonusPercent: Math.max(0, safeNumber(resolvedBonuses.clanCitadelBonusPercent, 0)),
    clanObjectiveBenefitRevision: Math.max(0, Math.floor(safeNumber(resolvedBonuses.clanObjectiveBenefitRevision, 0))),
    stationedTroopPower: Math.max(0, Math.floor(stationedTroopPower)),
    campTroopPower: Math.max(0, Math.floor(campTroopPower)),
    reinforcementTroopPower: Math.max(0, Math.floor(reinforcementTroopPower)),
    rallyTroopPower: Math.max(0, Math.floor(rallyTroopPower)),
    cityPower: Math.max(0, Math.floor(cityPower)),
    marchingPower: Math.max(0, Math.floor(marchingPower)),
    troopPower: Math.max(0, Math.floor(armyPower)),
    territoryPower: 0,
    cityLevelPower: 0,
    economicPower: 0,
    troopProductionPower: replacementPower,
    fortificationPower: defensivePower,
    strongholdPower: 0,
    kingPower,
    baseKingPower,
    kingPowerBonus: Math.max(0, kingPower - baseKingPower),
    characterLevel: character.level,
    mainCityId: safeString(profileForStats.mainCityId, 96),
    mainIslandId: safeString(profileForStats.mainIslandId, 160),
    mainRegionId: normalizeRegionId(profileForStats.mainRegionId || getRegionIdFromOnlineIslandId(profileForStats.mainIslandId)),
    updatedAtMs: nowMs,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function getTimedProductionBoostOverlapSeconds(intervalStartMs, intervalEndMs, expiresAtMs, durationMs) {
  const endMs = Math.max(0, safeNumber(intervalEndMs, 0));
  const startMs = clamp(safeNumber(intervalStartMs, endMs), 0, endMs);
  const effectEndMs = Math.max(0, timestampToMs(expiresAtMs));
  const effectStartMs = Math.max(0, effectEndMs - Math.max(0, safeNumber(durationMs, 0)));
  if (!effectEndMs || effectEndMs <= startMs || effectStartMs >= endMs) return 0;
  return Math.max(0, (Math.min(endMs, effectEndMs) - Math.max(startMs, effectStartMs)) / 1000);
}

function globalStatsForClient(stats = null) {
  if (!stats || typeof stats !== "object") return null;
  const { updatedAt, ...clientStats } = stats;
  return clientStats;
}

function getPowerValue(...values) {
  return Math.max(0, ...values.map(value => Math.floor(safeNumber(value, 0))));
}

function getLegacyGlobalStatsKingPower(stats = {}) {
  if (!stats || typeof stats !== "object") return 0;
  const totalCities = Math.max(0, Math.floor(safeNumber(stats.totalCities, stats.cityCount)));
  const totalLevels = Math.max(totalCities, Math.floor(safeNumber(stats.totalCityLevels, totalCities)));
  const stationedTroops = Math.max(0, Math.floor(safeNumber(stats.totalTroops, 0)))
    + Math.max(0, Math.floor(safeNumber(stats.totalReinforcementTroops, 0)));
  const totalTroops = stationedTroops + Math.max(0, Math.floor(safeNumber(stats.totalMarchingTroops, 0)));
  const averageLevel = totalCities > 0 ? totalLevels / totalCities : 0;
  const baseWalls = totalCities > 0 ? getBaseCityWalls(averageLevel) * totalCities : 0;
  const sustainableTroopPerHour = Math.max(0, Math.floor(
    safeNumber(stats.totalVictoryPoints, 0) * CITY_LEVEL_STATS.troopProductionPerVictoryPoint
  ));
  const replacementPower = Math.floor(sustainableTroopPerHour * KING_POWER_REPLACEMENT_HOURS);
  const defensiveAdvantage = baseWalls + stationedTroops
    * averageLevel * CITY_LEVEL_STATS.defensePercentPerLevel / 100;
  const defensivePower = Math.floor(
    Math.max(0, defensiveAdvantage) * KING_POWER_DEFENSIVE_ADVANTAGE_WEIGHT
  );
  return Math.max(0, Math.floor(
    getTroopKingPower(totalTroops) + replacementPower + defensivePower
  ));
}

function getPlayerPowerSnapshot({ profile = {}, leaderboard = {}, globalStats = {}, city = {}, fallback = 0 } = {}) {
  const authoritativeCandidates = [
    {
      version: Math.max(0, Math.floor(safeNumber(globalStats.version, 0))),
      power: Math.max(0, Math.floor(safeNumber(globalStats.kingPower, 0))),
      updatedAtMs: Math.max(0, timestampToMs(globalStats.updatedAtMs || globalStats.updatedAt)),
    },
    {
      version: Math.max(0, Math.floor(safeNumber(leaderboard.kingPowerVersion, 0))),
      power: Math.max(0, Math.floor(safeNumber(leaderboard.kingPower, 0))),
      updatedAtMs: Math.max(0, timestampToMs(leaderboard.kingPowerUpdatedAtMs || leaderboard.updatedAtMs)),
    },
    {
      version: Math.max(0, Math.floor(safeNumber(profile.kingPowerVersion, 0))),
      power: Math.max(0, Math.floor(safeNumber(profile.kingPower, 0))),
      updatedAtMs: Math.max(0, timestampToMs(profile.kingPowerUpdatedAtMs)),
    },
  ]
    .filter(candidate => candidate.version >= GLOBAL_PLAYER_STATS_VERSION && candidate.power > 0);
  if (authoritativeCandidates.length) return authoritativeCandidates[0].power;

  const legacyGlobalPower = getLegacyGlobalStatsKingPower(globalStats);
  if (legacyGlobalPower > 0) return legacyGlobalPower;

  const serverPower = getPowerValue(
    safeNumber(profile.kingPowerVersion, 0) > 0 ? 0 : profile.kingPower,
    safeNumber(leaderboard.kingPowerVersion, 0) > 0 ? 0 : leaderboard.kingPower,
    safeNumber(city.kingPowerVersion, 0) > 0 ? 0 : city.ownerKingPower,
    getCityPowerFloor(city)
  );
  return serverPower > 0 ? serverPower : getPowerValue(fallback);
}

function getDemoAttackTier(powerRatio) {
  const ratio = safeNumber(powerRatio, 0);
  return DEMO_ATTACK_TIERS.find(tier => ratio >= tier.minRatio) || null;
}

function roundDownToTwoSignificantDigits(value) {
  const integer = Math.max(0, Math.floor(safeNumber(value, 0)));
  if (integer < 10) return integer;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(integer)) - 1);
  return Math.floor(integer / magnitude) * magnitude;
}

function roundUpToTwoSignificantDigits(value) {
  const integer = Math.max(0, Math.ceil(safeNumber(value, 0)));
  if (integer < 10) return integer;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(integer)) - 1);
  return Math.ceil(integer / magnitude) * magnitude;
}

function getAttackProtectionMode(powerRatio) {
  const ratio = Math.max(0, safeNumber(powerRatio, 0));
  if (ratio >= ATTACK_PROTECTION_RAID_MIN_RATIO) return "raid";
  if (ratio >= ATTACK_PROTECTION_ASSAULT_MIN_RATIO) return "assault";
  return "normal";
}

function getAttackProtectionBreakEvenScale(mode, powerRatio) {
  const ratio = Math.max(0, safeNumber(powerRatio, 0));
  if (mode === "assault") {
    const progress = clamp(
      (ratio - ATTACK_PROTECTION_ASSAULT_MIN_RATIO)
        / (ATTACK_PROTECTION_RAID_MIN_RATIO - ATTACK_PROTECTION_ASSAULT_MIN_RATIO),
      0,
      1
    );
    return 1.25 - progress * 0.2;
  }
  if (mode === "raid") {
    const progress = clamp(
      (ratio - ATTACK_PROTECTION_RAID_MIN_RATIO)
        / (ATTACK_PROTECTION_RAID_MAX_SCALE_RATIO - ATTACK_PROTECTION_RAID_MIN_RATIO),
      0,
      1
    );
    return 0.5 - progress * 0.25;
  }
  return 1;
}

function normalizeAttackProtectionSnapshot(raw = null, legacyDemoAttack = null) {
  if (raw && typeof raw === "object" && safeNumber(raw.version, 0) === ATTACK_PROTECTION_VERSION) {
    const mode = raw.mode === "raid" ? "raid" : raw.mode === "assault" ? "assault" : "normal";
    if (mode === "normal") return null;
    const assaultStage = mode === "assault" && raw.assaultStage === "capture" ? "capture" : mode === "assault" ? "breach" : "";
    const maxTroops = Math.max(1, Math.floor(safeNumber(raw.maxTroops, 1)));
    const requestedTroops = Math.max(1, Math.floor(safeNumber(raw.requestedTroops, maxTroops)));
    return {
      version: ATTACK_PROTECTION_VERSION,
      mode,
      assaultStage,
      label: mode === "raid"
        ? "Protected Raid"
        : assaultStage === "capture"
          ? "Protected Capture Assault"
          : "Protected Breach Assault",
      powerRatio: Math.max(ATTACK_PROTECTION_ASSAULT_MIN_RATIO, safeNumber(raw.powerRatio, ATTACK_PROTECTION_ASSAULT_MIN_RATIO)),
      maxTroops,
      requestedTroops,
      effectiveTroops: Math.max(1, Math.min(maxTroops, Math.floor(safeNumber(raw.effectiveTroops, requestedTroops)))),
      captureAllowed: mode === "assault" && assaultStage === "capture",
      breachRequired: mode === "assault" && assaultStage === "breach",
      maxDefenderLossPercent: mode === "raid" ? 10 : 100,
      attackerXpMultiplier: 0,
      defenderXpPolicy: ATTACK_PROTECTION_DEFENDER_XP_POLICY,
      legacyDemoAttack: raw.legacyDemoAttack === true,
    };
  }
  const legacy = normalizeDemoAttackSnapshot(legacyDemoAttack);
  if (!legacy) return null;
  return {
    version: ATTACK_PROTECTION_VERSION,
    mode: "raid",
    assaultStage: "",
    label: "Protected Raid",
    powerRatio: Math.max(ATTACK_PROTECTION_RAID_MIN_RATIO, legacy.powerRatio),
    maxTroops: legacy.maxTroops,
    requestedTroops: legacy.requestedTroops,
    effectiveTroops: legacy.effectiveTroops,
    captureAllowed: false,
    breachRequired: false,
    maxDefenderLossPercent: 10,
    attackerXpMultiplier: 0,
    defenderXpPolicy: ATTACK_PROTECTION_DEFENDER_XP_POLICY,
    legacyDemoAttack: true,
  };
}

function createServerAttackProtectionSnapshot({
  sourceTroops = 1,
  target = null,
  targetType = "city",
  requestedTroops = 1,
  attackerKingPower = 0,
  defenderKingPower = 1,
  attackerUid = "",
  attackerProfile = null,
  defenderProfile = null,
  defenderBonuses = {},
  defensePower = null,
  assaultStage = "breach",
} = {}) {
  if (!target || targetType === "camp" || isStronghold(target)) return null;
  const targetOwnerUid = getOwnerUid(target);
  if (!targetOwnerUid || targetOwnerUid === attackerUid) return null;
  const attackerPower = Math.max(0, Math.floor(safeNumber(attackerKingPower, 0)));
  const defenderPower = Math.max(1, Math.floor(safeNumber(defenderKingPower, 1)));
  const powerRatio = attackerPower / defenderPower;
  const mode = getAttackProtectionMode(powerRatio);
  if (mode === "normal") return null;

  const availableTroops = Math.max(1, Math.floor(safeNumber(sourceTroops, 1)));
  const requested = clampInt(requestedTroops, 1, availableTroops);
  const attackPerTroop = Math.max(1, getAttackPower(1, attackerProfile));
  const totalDefense = Math.max(
    1,
    defensePower !== null && defensePower !== undefined && Number.isFinite(Number(defensePower))
      ? Math.floor(Number(defensePower))
      : getCityStats(target, defenderProfile, defenderBonuses).totalDefense
  );
  const breakEvenTroops = Math.max(1, Math.floor(totalDefense / attackPerTroop) + 1);
  const normalizedAssaultStage = mode === "assault" && assaultStage === "capture" ? "capture" : "breach";
  const captureSafeCap = Math.max(1, roundUpToTwoSignificantDigits(breakEvenTroops));
  const scaledCap = Math.max(1, Math.floor(
    breakEvenTroops * getAttackProtectionBreakEvenScale(mode, powerRatio)
  ));
  const exposedCap = mode === "assault"
    ? normalizedAssaultStage === "breach"
      ? captureSafeCap
      : Math.max(captureSafeCap, roundDownToTwoSignificantDigits(scaledCap))
    : Math.max(1, roundDownToTwoSignificantDigits(scaledCap));
  const maxTroops = Math.min(availableTroops, exposedCap);
  return normalizeAttackProtectionSnapshot({
    version: ATTACK_PROTECTION_VERSION,
    mode,
    assaultStage: normalizedAssaultStage,
    powerRatio: Number(powerRatio.toFixed(4)),
    maxTroops,
    requestedTroops: requested,
    effectiveTroops: Math.min(requested, maxTroops),
  });
}

function createAttackProtectionPreview(snapshot = null, sourceTroops = 1, requestedTroops = 1) {
  const availableTroops = Math.max(1, Math.floor(safeNumber(sourceTroops, 1)));
  const requested = clampInt(requestedTroops, 1, availableTroops);
  const protectedSnapshot = normalizeAttackProtectionSnapshot(snapshot);
  if (protectedSnapshot) return protectedSnapshot;
  return {
    version: ATTACK_PROTECTION_VERSION,
    mode: "normal",
    assaultStage: "",
    label: "Normal Attack",
    powerRatio: 0,
    maxTroops: availableTroops,
    requestedTroops: requested,
    effectiveTroops: requested,
    captureAllowed: true,
    breachRequired: false,
    maxDefenderLossPercent: 100,
    attackerXpMultiplier: 1,
    defenderXpPolicy: "normal",
  };
}

function getAttackProtectionQuoteSignature(snapshot = null, sourceTroops = 1, requestedTroops = 1) {
  const preview = createAttackProtectionPreview(snapshot, sourceTroops, requestedTroops);
  return [
    preview.version,
    preview.mode,
    preview.assaultStage || "",
    preview.maxTroops,
    preview.captureAllowed ? 1 : 0,
    preview.maxDefenderLossPercent,
  ].join("|");
}

function isCurrentProtectedDefenseXpClaim(claim = null) {
  return Boolean(
    claim
    && typeof claim === "object"
    && safeString(claim.worldId, 128) === ONLINE_WORLD_ID
    && safeString(claim.resetGeneration, 128) === RESET_GENERATION
    && safeString(claim.firstResolvedArmyId, 96)
  );
}

function normalizeDemoAttackSnapshot(demo = null) {
  if (!demo || typeof demo !== "object" || !demo.active) return null;
  const attackerKingPower = Math.max(0, Math.floor(safeNumber(demo.attackerKingPower, 0)));
  const defenderKingPower = Math.max(1, Math.floor(safeNumber(demo.defenderKingPower, 1)));
  const powerRatio = Number.isFinite(Number(demo.powerRatio))
    ? Number(demo.powerRatio)
    : attackerKingPower / Math.max(1, defenderKingPower);
  const tier = getDemoAttackTier(powerRatio);
  if (!tier) return null;
  const maxTroops = Math.max(1, Math.floor(safeNumber(demo.maxTroops, 1)));
  const requestedTroops = Math.max(1, Math.floor(safeNumber(demo.requestedTroops, maxTroops)));
  const effectiveTroops = Math.max(1, Math.min(maxTroops, Math.floor(safeNumber(demo.effectiveTroops, maxTroops))));
  const attackPowerPercent = clampInt(demo.attackPowerPercent || tier.attackPowerPercent, 1, 100);
  const troopCapPercent = clampInt(demo.troopCapPercent || tier.troopCapPercent, 1, 100);
  const travelMultiplier = Math.max(1, safeNumber(demo.travelMultiplier, tier.travelMultiplier));
  return {
    active: true,
    label: safeString(demo.label || tier.label || "Demo Attack", 32),
    attackerKingPower,
    defenderKingPower,
    powerRatio: Number(powerRatio.toFixed(2)),
    requestedTroops,
    effectiveTroops,
    maxTroops,
    troopCapPercent,
    attackPowerPercent,
    attackPowerMultiplier: attackPowerPercent / 100,
    travelMultiplier,
    attackerXpMultiplier: 0,
    defenderXpMultiplier: DEMO_ATTACK_DEFENDER_XP_MULTIPLIER,
  };
}

function createServerDemoAttackSnapshot({ sourceTroops = 1, target = null, targetType = "city", requestedTroops = 1, attackerKingPower = 0, defenderKingPower = 1, attackerUid = "" } = {}) {
  if (!target || targetType === "camp" || isStronghold(target)) return null;
  const targetOwnerUid = getOwnerUid(target);
  if (!targetOwnerUid || targetOwnerUid === attackerUid) return null;
  const attackerPower = Math.max(0, Math.floor(safeNumber(attackerKingPower, 0)));
  const defenderPower = Math.max(1, Math.floor(safeNumber(defenderKingPower, 1)));
  const powerRatio = attackerPower / Math.max(1, defenderPower);
  const tier = getDemoAttackTier(powerRatio);
  if (!tier) return null;
  const availableTroops = Math.max(1, Math.floor(safeNumber(sourceTroops, 1)));
  const requested = clampInt(requestedTroops, 1, availableTroops);
  const targetWalls = Math.max(1, Math.floor(safeNumber(getCityStats(target).cityWalls, 1)));
  const capByWalls = Math.max(1, Math.floor(targetWalls * tier.troopCapPercent / 100));
  const maxTroops = Math.max(1, Math.min(availableTroops, capByWalls));
  return normalizeDemoAttackSnapshot({
    active: true,
    label: tier.label,
    attackerKingPower: attackerPower,
    defenderKingPower: defenderPower,
    powerRatio,
    requestedTroops: requested,
    effectiveTroops: Math.min(requested, maxTroops),
    maxTroops,
    troopCapPercent: tier.troopCapPercent,
    attackPowerPercent: tier.attackPowerPercent,
    travelMultiplier: tier.travelMultiplier,
  });
}

function applyDemoDefenderXpMultiplier(xp, demoAttack) {
  const base = Math.max(0, Math.floor(safeNumber(xp, 0)));
  const demo = normalizeDemoAttackSnapshot(demoAttack);
  return demo ? Math.floor(base * demo.defenderXpMultiplier) : base;
}

function getAttackPower(troops, attackerProfile = null) {
  const boost = attackerProfile ? skillMultiplier(attackerProfile, "swordmastery") : 1;
  return troops * BASE_TROOP_ATTACK_POWER * boost;
}

function calculateCombatResult(attackTroops, target, attackerProfile = null, defenderProfile = null, options = {}) {
  const troops = Math.max(0, Math.floor(safeNumber(attackTroops, 0)));
  const defendersAtStart = Math.max(0, Math.floor(safeNumber(target?.troops, 0)));
  const attackProtection = normalizeAttackProtectionSnapshot(options.attackProtection, options.demoAttack);
  const attackPower = Number.isFinite(Number(options.attackPower))
    ? Math.max(0, Math.floor(Number(options.attackPower)))
    : getAttackPower(troops, attackerProfile);
  const defensePower = Number.isFinite(Number(options.defensePower))
    ? Math.max(0, Math.floor(Number(options.defensePower)))
    : getCityStats(target, defenderProfile, options.defenderBonuses).totalDefense;
  const ratio = attackPower / Math.max(1, defensePower);
  const protectedRaid = attackProtection?.mode === "raid";
  const convertedReinforcement = options.convertedReinforcement === true;
  const convertedReinforcementCaptureAllowed = convertedReinforcement
    && options.convertedReinforcementCaptureAllowed !== false;
  const convertedReinforcementCanCapture = protectedRaid && convertedReinforcementCaptureAllowed;
  const breachOnly = attackProtection?.mode === "assault"
    && attackProtection.captureAllowed !== true
    && !convertedReinforcementCaptureAllowed;
  const battleWon = (!protectedRaid || convertedReinforcementCanCapture) && attackPower > defensePower;
  const success = battleWon && !breachOnly;
  const raid = protectedRaid && !success;
  const attackerBoost = attackerProfile ? skillMultiplier(attackerProfile, "swordmastery") : 1;
  let survivors = 0;
  let defendersLeft = defendersAtStart;
  let attackerLosses = troops;
  let defenderLosses = 0;

  if (raid) {
    const pressure = clamp(ratio, 0, 1);
    const damageRate = Math.min(0.1, pressure * 0.2);
    const damageCeiling = Math.floor(defendersAtStart * 0.1);
    defenderLosses = Math.min(damageCeiling, Math.floor(defendersAtStart * damageRate));
    if (defendersAtStart > 0) {
      defenderLosses = Math.min(defenderLosses, defendersAtStart - 1);
      defendersLeft = Math.max(1, defendersAtStart - defenderLosses);
    }
  } else if (battleWon) {
    const leftoverPower = attackPower - defensePower * 0.68;
    survivors = Number.isFinite(Number(options.attackPower))
      ? clamp(Math.floor(troops * leftoverPower / Math.max(attackPower, 1)), 1, troops)
      : clamp(Math.floor(leftoverPower / Math.max(BASE_TROOP_ATTACK_POWER * attackerBoost, 1)), 1, troops);
    attackerLosses = troops - survivors;
    defenderLosses = breachOnly ? Math.max(0, defendersAtStart - 1) : defendersAtStart;
    defendersLeft = breachOnly && defendersAtStart > 0 ? 1 : 0;
  } else {
    const pressure = clamp(ratio, 0, 1);
    defenderLosses = Math.min(defendersAtStart, Math.floor(defendersAtStart * Math.min(0.82, pressure * 0.82)));
    defendersLeft = Math.max(defendersAtStart > 0 ? 1 : 0, defendersAtStart - defenderLosses);
  }

  return {
    attackPower,
    defensePower,
    ratio,
    battleWon,
    success,
    survivors,
    defendersLeft,
    attackerLosses,
    defenderLosses,
    killedAttackers: attackerLosses,
    killedDefenders: defenderLosses,
    attackProtection,
    demoAttack: attackProtection?.legacyDemoAttack ? normalizeDemoAttackSnapshot(options.demoAttack) : null,
    raidCompleted: raid,
    breachCompleted: breachOnly && battleWon,
    convertedReinforcement,
    convertedReinforcementCapture: convertedReinforcementCanCapture && success,
  };
}

function getXpRequiredForLevel(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  const legacyRequirement = value => Math.floor(
    150 + value * 65 + Math.pow(value, 2.05) * 35
  );
  if (current <= HERO_XP_EXPONENTIAL_START_LEVEL) return legacyRequirement(current);
  const anchor = legacyRequirement(HERO_XP_EXPONENTIAL_START_LEVEL);
  const requirement = anchor * Math.pow(
    HERO_XP_EXPONENTIAL_GROWTH_RATE,
    current - HERO_XP_EXPONENTIAL_START_LEVEL
  );
  if (!Number.isFinite(requirement)) return Number.MAX_SAFE_INTEGER;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(requirement)
  );
}

function getLevelUpGoldUpgradeShare(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  if (current <= HERO_XP_SOFT_CAP_LEVEL) return LEVEL_UP_GOLD_EARLY_UPGRADE_SHARE;
  if (current <= HERO_XP_HARD_CAP_LEVEL) {
    const progress = (current - HERO_XP_SOFT_CAP_LEVEL)
      / (HERO_XP_HARD_CAP_LEVEL - HERO_XP_SOFT_CAP_LEVEL);
    return LEVEL_UP_GOLD_EARLY_UPGRADE_SHARE
      + (LEVEL_UP_GOLD_MID_END_UPGRADE_SHARE - LEVEL_UP_GOLD_EARLY_UPGRADE_SHARE) * progress;
  }
  return LEVEL_UP_GOLD_END_UPGRADE_SHARE;
}

function getLevelUpGoldProductionHours(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  if (current <= HERO_XP_SOFT_CAP_LEVEL) return LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS;
  if (current <= HERO_XP_HARD_CAP_LEVEL) {
    const progress = (current - HERO_XP_SOFT_CAP_LEVEL)
      / (HERO_XP_HARD_CAP_LEVEL - HERO_XP_SOFT_CAP_LEVEL);
    return LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS
      + (LEVEL_UP_GOLD_MID_END_PRODUCTION_HOURS - LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS) * progress;
  }
  return LEVEL_UP_GOLD_END_PRODUCTION_HOURS;
}

function getLevelUpGoldFloor(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  return LEVEL_UP_GOLD_FLOOR_BASE
    + current * LEVEL_UP_GOLD_FLOOR_PER_LEVEL
    + Math.pow(current, LEVEL_UP_GOLD_FLOOR_EXPONENT) * LEVEL_UP_GOLD_FLOOR_EXPONENT_SCALE;
}

function getLevelUpGoldReward(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  const goldFloor = getLevelUpGoldFloor(current);
  const referenceCityLevel = Math.max(1, current - 1);
  const referenceUpgradeCost = getCityUpgradeCost({ level: referenceCityLevel });
  const upgradeRelief = Number.isFinite(referenceUpgradeCost)
    ? referenceUpgradeCost * getLevelUpGoldUpgradeShare(current)
    : 0;
  const productionRelief = getMillionLordsPassiveGoldPerHour(current)
    * getLevelUpGoldProductionHours(current);
  return Math.floor(Math.max(goldFloor, Math.min(upgradeRelief, productionRelief)));
}

function getLevelUpTroopRewardHours(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  if (current <= HERO_XP_SOFT_CAP_LEVEL) {
    return LEVEL_UP_TROOP_REWARD_EARLY_BASE_HOURS
      + current * LEVEL_UP_TROOP_REWARD_EARLY_HOURS_PER_LEVEL;
  }
  if (current <= HERO_XP_HARD_CAP_LEVEL) {
    return LEVEL_UP_TROOP_REWARD_MID_BASE_HOURS
      + (current - HERO_XP_SOFT_CAP_LEVEL) * LEVEL_UP_TROOP_REWARD_MID_HOURS_PER_LEVEL;
  }
  return Math.min(
    LEVEL_UP_TROOP_REWARD_MAX_HOURS,
    LEVEL_UP_TROOP_REWARD_END_BASE_HOURS
      + (current - HERO_XP_HARD_CAP_LEVEL) * LEVEL_UP_TROOP_REWARD_END_HOURS_PER_LEVEL
  );
}

function getLevelUpTroopReward(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  const production = getCityProductionStats({ level: current }, {}, {}, {
    includeWarDrums: false,
    includeRoyalTaxDecree: false,
  });
  return Math.floor(Math.max(
    50,
    production.troopProductionPerHour * getLevelUpTroopRewardHours(current)
  ));
}

function normalizeCharacterProgress(character = {}) {
  const normalized = {
    level: Math.max(1, Math.floor(safeNumber(character.level, CHARACTER_START_LEVEL))),
    xp: Math.max(0, Math.floor(safeNumber(character.xp, CHARACTER_START_XP))),
    skillPoints: Math.max(0, Math.floor(safeNumber(character.skillPoints, 0))),
  };
  while (normalized.xp >= getXpRequiredForLevel(normalized.level)) {
    normalized.xp -= getXpRequiredForLevel(normalized.level);
    normalized.level += 1;
  }
  return normalized;
}

function applyXpToCharacter(character = {}, amount = 0) {
  const next = normalizeCharacterProgress(character);
  let xp = Math.max(0, Math.floor(safeNumber(amount, 0)));
  let goldReward = 0;
  let troopReward = 0;
  let levelsGained = 0;
  next.xp += xp;
  while (next.xp >= getXpRequiredForLevel(next.level)) {
    next.xp -= getXpRequiredForLevel(next.level);
    next.level += 1;
    next.skillPoints += 1;
    levelsGained += 1;
    goldReward += getLevelUpGoldReward(next.level);
    troopReward += getLevelUpTroopReward(next.level);
  }
  return { character: next, xp, levelsGained, goldReward, troopReward };
}

function getBattleXpTroopCredit(target = {}, troops = 0, defenderProfile = null) {
  const stats = getCityStats(target, defenderProfile);
  const cap = Math.max(
    25,
    Math.floor(
      stats.cityWalls * BATTLE_XP_TROOP_CREDIT_CITY_WALL_MULTIPLIER
        + stats.victoryPoints * BATTLE_XP_TROOP_CREDIT_VP_MULTIPLIER
    )
  );
  const hardCap = Math.min(
    Number.MAX_SAFE_INTEGER,
    getXpRequiredForLevel(stats.level) * BATTLE_XP_TROOP_CREDIT_LEVEL_CAP_MULTIPLIER
  );
  return Math.min(Math.max(0, Math.floor(safeNumber(troops, 0))), Math.max(cap, hardCap));
}

function getOpponentPowerXpMultiplier(opponentRatio) {
  const ratio = safeNumber(opponentRatio, 0);
  if (ratio >= 2) return 2;
  if (ratio >= 1.5) return 1.5;
  if (ratio >= 0.5) return 1;
  return 0;
}

function getCaptureXpCooldownRemainingMs(city = {}, nowMs = Date.now()) {
  const capturedAtMs = Math.max(0, timestampToMs(city.lastCapturedAtMs || city.lastCapturedAt));
  if (!capturedAtMs) return 0;
  return Math.max(0, CAPTURE_XP_COOLDOWN_MS - Math.max(0, nowMs - capturedAtMs));
}

function getCityXpScore(target = {}, oldOwnerUid = "", defenderProfile = null) {
  const stats = getCityStats(target, defenderProfile);
  const ownerBonus = oldOwnerUid ? 45 : 10;
  return stats.victoryPoints
    + getBattleXpTroopCredit(target, target.troops, defenderProfile) * 0.25
    + ownerBonus;
}

function getCaptureXpEfficiency(target = {}, oldOwnerUid = "", {
  attackerProfile = null,
  defenderProfile = null,
  attackerKingPower = 0,
  defenderKingPower = 0,
  attackerCityCount = 0,
} = {}) {
  if (oldOwnerUid) {
    const attackerPower = Math.max(1, Math.floor(safeNumber(attackerKingPower, 1)));
    const defenderPower = Math.max(1, Math.floor(safeNumber(defenderKingPower, 1)));
    return getOpponentPowerXpMultiplier(defenderPower / attackerPower);
  }

  const heroLevel = normalizeCharacterProgress(attackerProfile?.character || {}).level;
  const empirePressure = 48 + heroLevel * 20 + Math.max(0, Math.floor(safeNumber(attackerCityCount, 0))) * 2;
  const targetScore = getCityXpScore(target, oldOwnerUid, defenderProfile);
  return Number(clamp(0.35 + targetScore / Math.max(1, empirePressure), 0.25, 2).toFixed(2));
}

function getCaptureXpAward(
  target = {},
  oldOwnerUid = "",
  defenderLosses = 0,
  defenderProfile = null,
  options = {}
) {
  if (isGivenUpNeutralCity(target)) return 0;
  const level = clampCityLevel(target.level);
  const troopXp = Math.floor(
    getBattleXpTroopCredit(target, defenderLosses, defenderProfile) * CAPTURE_XP_PER_DEFENDER
  );
  const cityXp = getCaptureXpCooldownRemainingMs(target, options.nowMs) > 0
    ? 0
    : CAPTURE_XP_BASE + level * CAPTURE_XP_PER_CITY_LEVEL + (oldOwnerUid ? ENEMY_CAPTURE_XP_BONUS : 0);
  const efficiency = getCaptureXpEfficiency(target, oldOwnerUid, {
    ...options,
    defenderProfile,
  });
  return Math.floor((cityXp + troopXp) * efficiency);
}

function getDefenseHeldXpAward(attackingTroops, target = {}, defenderProfile = null) {
  return Math.floor(DEFENSE_HELD_XP_BASE + getBattleXpTroopCredit(target, attackingTroops, defenderProfile) * DEFENSE_HELD_XP_PER_ATTACKER);
}

function getPartialBattleXpAward(fullWinXp) {
  return Math.floor(Math.max(0, safeNumber(fullWinXp, 0)) * FAILED_BATTLE_XP_RATE);
}

function getBattleXpLevelCapRate(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  if (current <= HERO_XP_SOFT_CAP_LEVEL) return BATTLE_XP_EARLY_LEVEL_CAP_RATE;
  if (current <= HERO_XP_HARD_CAP_LEVEL) {
    const progress = (current - HERO_XP_SOFT_CAP_LEVEL)
      / (HERO_XP_HARD_CAP_LEVEL - HERO_XP_SOFT_CAP_LEVEL);
    return BATTLE_XP_MID_START_LEVEL_CAP_RATE
      + (BATTLE_XP_MID_END_LEVEL_CAP_RATE - BATTLE_XP_MID_START_LEVEL_CAP_RATE) * progress;
  }
  const progress = Math.min(1, (current - HERO_XP_HARD_CAP_LEVEL) / BATTLE_XP_END_CAP_RAMP_LEVELS);
  return Math.max(
    BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE,
    BATTLE_XP_END_START_LEVEL_CAP_RATE
      + (BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE - BATTLE_XP_END_START_LEVEL_CAP_RATE) * progress
  );
}

function capBattleXpForHeroLevel(xp, profile = {}) {
  const base = Math.max(0, Math.floor(safeNumber(xp, 0)));
  const character = normalizeCharacterProgress(profile?.character || {});
  const heroLevel = Math.max(1, Math.floor(safeNumber(character.level, CHARACTER_START_LEVEL)));
  const cap = Math.max(
    250,
    Math.floor(getXpRequiredForLevel(heroLevel) * getBattleXpLevelCapRate(heroLevel))
  );
  return Math.min(base, cap);
}

function getTroopTravelBandIndex(troops) {
  const count = Math.max(1, Math.floor(safeNumber(troops, 1)));
  const index = ARMY_TRAVEL_TROOP_BAND_LIMITS.findIndex(limit => count <= limit);
  return index >= 0 ? index : ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS.length - 1;
}

function getTroopTravelMultiplier(troops) {
  return ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS[getTroopTravelBandIndex(troops)] || 1;
}

function calculateTravelTime({ pathLength = 0, troopCount = 1, kind = "attack", requestedTotal = 0, demoAttack = null, speedMultiplier = 1 }) {
  const distance = Math.max(1, safeNumber(pathLength, 1));
  const kindMultiplier = ARMY_TRAVEL_KIND_MULTIPLIERS[kind] || ARMY_TRAVEL_KIND_MULTIPLIERS.attack;
  const troopMultiplier = getTroopTravelMultiplier(troopCount);
  const demoMultiplier = normalizeDemoAttackSnapshot(demoAttack)?.travelMultiplier || 1;
  const minSeconds = kind === "scout" ? ARMY_TRAVEL_SCOUT_MIN_SECONDS : ARMY_TRAVEL_MIN_SECONDS;
  const speed = Math.max(0.1, safeNumber(speedMultiplier, 1));
  const computed = clamp(distance * ARMY_TRAVEL_SECONDS_PER_MAP_UNIT * kindMultiplier * troopMultiplier * demoMultiplier / speed, minSeconds, ARMY_TRAVEL_MAX_SECONDS);
  const requested = safeNumber(requestedTotal, computed);
  return clamp(Math.max(computed, requested), minSeconds, ARMY_TRAVEL_MAX_SECONDS);
}

function normalizePoint(point = {}) {
  const x = safeNumber(point.x, NaN);
  const y = safeNumber(point.y, NaN);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalizePath(points = []) {
  return Array.isArray(points)
    ? points.map(normalizePoint).filter(Boolean).slice(0, MAX_ROUTE_POINTS_PER_SEGMENT)
    : [];
}

function routeLength(points = []) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

function normalizePathSegments(segments = []) {
  return Array.isArray(segments)
    ? segments.map(segment => {
      const points = normalizePath(segment?.points);
      if (points.length < 2) return null;
      return {
        regionId: normalizeRegionId(segment.regionId),
        points,
        length: Math.max(0, safeNumber(segment.length, routeLength(points))),
      };
    }).filter(Boolean).slice(0, MAX_ROUTE_SEGMENT_COUNT)
    : [];
}

function normalizeRegionIds(value = []) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(normalizeRegionId)
    .filter(Boolean))]
    .slice(0, MAX_ROUTE_REGION_COUNT);
}

function getCityRegionIdFromPayload(city = {}, fallback = "") {
  return normalizeRegionId(city.regionId || city.startPool || fallback);
}

function normalizeArmyPayload(data = {}, uid = "") {
  const raw = data.army && typeof data.army === "object" ? data.army : data.movement || {};
  const fromId = safeString(raw.fromId || data.fromId, 96);
  const toId = safeString(raw.toId || data.toId, 96);
  const kind = ARMY_ORDER_KINDS.includes(raw.kind) ? raw.kind : "attack";
  const sourceRegionId = normalizeRegionId(data.sourceRegionId || raw.sourceRegionId || data.fromRegionId);
  const targetRegionId = normalizeRegionId(data.targetRegionId || raw.targetRegionId || data.toRegionId);
  const pathSegments = normalizePathSegments(raw.pathSegments || data.pathSegments);
  const routeRegionIds = normalizeRegionIds([
    ...normalizeRegionIds(raw.routeRegionIds || data.routeRegionIds),
    ...pathSegments.map(segment => segment.regionId),
    sourceRegionId,
    targetRegionId,
  ]);
  const path = normalizePath(raw.path || data.path);
  const pathLength = Math.max(
    0,
    safeNumber(raw.pathLength || data.pathLength, 0),
    pathSegments.reduce((total, segment) => total + segment.length, 0),
    routeLength(path)
  );

  return {
    id: safeString(raw.id || data.armyId || `${uid}_${kind}_${Date.now().toString(36)}`, 96).replace(/[^a-zA-Z0-9_-]/g, "_"),
    ownerUid: uid,
    ownerName: normalizePlayerName(raw.ownerName || data.ownerName),
    ownerFlag: raw.ownerFlag || data.ownerFlag || null,
    ownerKingPower: Math.max(0, Math.floor(safeNumber(raw.ownerKingPower, 0))),
    kind,
    launchKind: ARMY_ORDER_KINDS.includes(raw.launchKind) ? raw.launchKind : kind,
    targetType: raw.targetType === "camp" || data.targetType === "camp" ? "camp" : "city",
    fromId,
    toId,
    fromName: safeString(raw.fromName, 40),
    toName: safeString(raw.toName, 40),
    troops: Math.max(0, Math.floor(safeNumber(raw.troops ?? data.troops, 0))),
    requestedTroops: Math.max(0, Math.floor(safeNumber(raw.requestedTroops ?? data.requestedTroops, raw.troops ?? data.troops ?? 0))),
    total: Math.max(0.1, safeNumber(raw.total, 0.1)),
    path,
    pathSegments,
    routeRegionIds,
    pathLength,
    sourceRegionId,
    targetRegionId,
    targetOwnerAtLaunch: safeString(raw.targetOwnerAtLaunch || "neutral", 32),
    originalTargetOwnerUid: safeString(raw.originalTargetOwnerUid || raw.targetOwnerUid, 128),
    attackerKingPower: Math.max(0, Math.floor(safeNumber(raw.attackerKingPower || raw.ownerKingPower, 0))),
    defenderKingPower: Math.max(0, Math.floor(safeNumber(raw.defenderKingPower, 0))),
    acceptedAttackProtection: raw.acceptedAttackProtection && typeof raw.acceptedAttackProtection === "object"
      ? raw.acceptedAttackProtection
      : data.acceptedAttackProtection && typeof data.acceptedAttackProtection === "object"
        ? data.acceptedAttackProtection
        : null,
    attackProtection: raw.attackProtection && typeof raw.attackProtection === "object" ? raw.attackProtection : null,
    demoAttack: raw.demoAttack && typeof raw.demoAttack === "object" ? raw.demoAttack : null,
    useSwiftMarchOrder: raw.useSwiftMarchOrder === true || data.useSwiftMarchOrder === true,
  };
}

function allocateDefenderLosses(ownerTroops = 0, contributions = [], totalLosses = 0) {
  const ownerStart = Math.max(0, Math.floor(safeNumber(ownerTroops, 0)));
  const rows = (Array.isArray(contributions) ? contributions : [])
    .map(entry => ({
      ...entry,
      troops: Math.max(0, Math.floor(safeNumber(entry?.troops, 0))),
    }))
    .filter(entry => entry.ownerUid && entry.troops > 0);
  const alliedStart = rows.reduce((total, entry) => total + entry.troops, 0);
  const defendersAtStart = ownerStart + alliedStart;
  const losses = Math.min(defendersAtStart, Math.max(0, Math.floor(safeNumber(totalLosses, 0))));
  if (!defendersAtStart || !losses) {
    return {
      ownerStart,
      ownerLosses: 0,
      ownerRemaining: ownerStart,
      alliedStart,
      alliedLosses: 0,
      alliedRemaining: alliedStart,
      contributions: rows.map(entry => ({ ...entry, losses: 0, remaining: entry.troops })),
    };
  }

  const ownerExact = losses * ownerStart / defendersAtStart;
  let ownerLosses = Math.min(ownerStart, Math.floor(ownerExact));
  const allocated = rows.map(entry => {
    const exact = losses * entry.troops / defendersAtStart;
    const entryLosses = Math.min(entry.troops, Math.floor(exact));
    return {
      ...entry,
      exact,
      losses: entryLosses,
      remaining: entry.troops - entryLosses,
    };
  });
  let assigned = ownerLosses + allocated.reduce((total, entry) => total + entry.losses, 0);
  let remainder = Math.max(0, losses - assigned);

  const ownerCapacity = Math.max(0, ownerStart - ownerLosses);
  const ownerRemainder = Math.min(ownerCapacity, remainder);
  ownerLosses += ownerRemainder;
  remainder -= ownerRemainder;
  if (remainder > 0) {
    allocated
      .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact))
        || a.ownerUid.localeCompare(b.ownerUid))
      .forEach(entry => {
        if (remainder <= 0 || entry.losses >= entry.troops) return;
        entry.losses += 1;
        entry.remaining -= 1;
        remainder -= 1;
      });
  }
  assigned = ownerLosses + allocated.reduce((total, entry) => total + entry.losses, 0);
  if (assigned < losses) {
    for (const entry of allocated) {
      const capacity = entry.troops - entry.losses;
      const extra = Math.min(capacity, losses - assigned);
      entry.losses += extra;
      entry.remaining -= extra;
      assigned += extra;
      if (assigned >= losses) break;
    }
  }
  allocated.sort((a, b) => a.ownerUid.localeCompare(b.ownerUid));
  const alliedLosses = allocated.reduce((total, entry) => total + entry.losses, 0);
  return {
    ownerStart,
    ownerLosses,
    ownerRemaining: Math.max(0, ownerStart - ownerLosses),
    alliedStart,
    alliedLosses,
    alliedRemaining: Math.max(0, alliedStart - alliedLosses),
    contributions: allocated,
  };
}

function allocateDefenseXp(totalXp = 0, ownerTroops = 0, contributions = []) {
  const pool = Math.max(0, Math.floor(safeNumber(totalXp, 0)));
  const ownerStart = Math.max(0, Math.floor(safeNumber(ownerTroops, 0)));
  const rows = (Array.isArray(contributions) ? contributions : []).filter(entry => entry?.ownerUid && entry.troops > 0);
  const totalTroops = ownerStart + rows.reduce((total, entry) => total + entry.troops, 0);
  if (!pool || !totalTroops) {
    return { ownerXp: pool, contributorXp: new Map(rows.map(entry => [entry.ownerUid, 0])) };
  }
  const contributorXp = new Map();
  let assigned = 0;
  rows.forEach(entry => {
    const value = Math.max(0, Math.floor(pool * entry.troops / totalTroops));
    contributorXp.set(entry.ownerUid, value);
    assigned += value;
  });
  return {
    ownerXp: Math.max(0, pool - assigned),
    contributorXp,
  };
}

function cityRefForRegion(regionId, cityId) {
  return db.doc(`islands/${getOnlineIslandId(regionId)}/cities/${cityId}`);
}

function getReinforcementTargetKey(targetType = "city", regionId = "", targetId = "") {
  return `${targetType === "camp" ? "camp" : "city"}:${normalizeRegionId(regionId)}:${safeString(targetId, 96)}`;
}

function getReinforcementId(ownerUid = "", targetKey = "") {
  const digest = crypto.createHash("sha256")
    .update(`${RESET_GENERATION}|${safeString(ownerUid, 128)}|${safeString(targetKey, 220)}`)
    .digest("hex")
    .slice(0, 40);
  return `reinforce_${digest}`;
}

function reinforcementRef(ownerUid = "", targetKey = "") {
  return db.doc(`reinforcements/${getReinforcementId(ownerUid, targetKey)}`);
}

function stationedReinforcementsForTargetQuery(targetKey = "") {
  return db.collection("reinforcements")
    .where("targetKey", "==", safeString(targetKey, 220))
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .where("status", "==", REINFORCEMENT_STATUS_STATIONED);
}

function normalizeReinforcementContribution(doc = null) {
  if (!doc?.exists) return null;
  const data = doc.data() || {};
  if (
    safeString(data.resetGeneration, 120) !== RESET_GENERATION
    || safeString(data.worldId, 120) !== ONLINE_WORLD_ID
    || data.status !== REINFORCEMENT_STATUS_STATIONED
  ) return null;
  const troops = Math.max(0, Math.floor(safeNumber(data.troops, 0)));
  if (!troops) return null;
  return {
    id: doc.id,
    ref: doc.ref,
    ...data,
    ownerUid: safeString(data.ownerUid, 128),
    targetOwnerUid: safeString(data.targetOwnerUid, 128),
    troops,
  };
}

function getProfileStationedReinforcementTroops(profile = {}) {
  if (safeString(profile.reinforcementResetGeneration, 120) !== RESET_GENERATION) return 0;
  return Math.max(0, Math.floor(safeNumber(profile.stationedReinforcementTroops, 0)));
}

function normalizeActiveClanReinforcementTargets(profile = {}) {
  if (safeString(profile.clanReinforcementLimitResetGeneration, 120) !== RESET_GENERATION) return [];
  return [...new Set(
    (Array.isArray(profile.activeClanReinforcementTargets) ? profile.activeClanReinforcementTargets : [])
      .map(targetKey => safeString(targetKey, 220))
      .filter(Boolean)
  )];
}

async function getActiveClanReinforcementTargetsForLaunch(transaction, uid = "", profile = {}) {
  const storedTargets = normalizeActiveClanReinforcementTargets(profile);
  if (safeString(profile.clanReinforcementLimitResetGeneration, 120) === RESET_GENERATION) {
    return storedTargets;
  }

  const playerUid = safeString(uid, 128);
  if (!playerUid) return [];
  const contributionQuery = status => db.collection("reinforcements")
    .where("ownerUid", "==", playerUid)
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .where("status", "==", status);
  const [activeArmiesSnap, stationedSnap, returningSnap] = await Promise.all([
    transaction.get(activeArmiesQueryForPlayer(playerUid)),
    transaction.get(contributionQuery(REINFORCEMENT_STATUS_STATIONED)),
    transaction.get(contributionQuery(REINFORCEMENT_STATUS_RETURNING)),
  ]);
  const targets = new Set(storedTargets);
  activeArmiesSnap.docs.forEach(doc => {
    const army = doc.data() || {};
    const launchedAsReinforcement = !army.reinforcementReturn
      && !army.returning
      && (
        army.kind === "reinforce"
        || army.launchKind === "reinforce"
        || army.retargetedFromKind === "reinforce"
      );
    if (!launchedAsReinforcement) return;
    const targetKey = safeString(
      army.reinforcementTargetKey
        || getReinforcementTargetKey(army.targetType, army.targetRegionId, army.toId),
      220
    );
    if (targetKey) targets.add(targetKey);
  });
  [...stationedSnap.docs, ...returningSnap.docs].forEach(doc => {
    const targetKey = safeString(doc.data()?.targetKey, 220);
    if (targetKey) targets.add(targetKey);
  });
  return [...targets];
}

function releaseClanReinforcementTarget(transaction, ownerUid = "", targetKey = "") {
  const playerUid = safeString(ownerUid, 128);
  const normalizedTargetKey = safeString(targetKey, 220);
  if (!playerUid || !normalizedTargetKey) return;
  transaction.set(db.doc(`players/${playerUid}`), {
    activeClanReinforcementTargets: FieldValue.arrayRemove(normalizedTargetKey),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function normalizeRallyId(value = "") {
  return safeString(value, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function clanRallyRef(clanId = "", rallyId = "") {
  return db.doc(`clans/${safeString(clanId, 128)}/rallies/${normalizeRallyId(rallyId)}`);
}

function clanRallyStateRef(clanId = "") {
  return db.doc(`clans/${safeString(clanId, 128)}/rallyState/${RESET_GENERATION}`);
}

function rallyBattleReceiptRef(armyId = "", contributorUid = "") {
  const receiptId = safeString(`${armyId}_${contributorUid}`, 190).replace(/[^a-zA-Z0-9_-]/g, "_");
  return db.doc(`rallyBattleReceipts/${RESET_GENERATION}/entries/${receiptId}`);
}

function getProfileCommittedRallyTroops(profile = {}) {
  if (safeString(profile.rallyResetGeneration, 120) !== RESET_GENERATION) return 0;
  return Math.max(0, Math.floor(safeNumber(profile.committedRallyTroops, 0)));
}

function normalizeRallyParticipant(raw = {}) {
  const uid = safeString(raw.uid || raw.ownerUid, 128);
  const troops = Math.max(0, Math.floor(safeNumber(raw.troops, 0)));
  if (!uid || !troops) return null;
  const status = [
    RALLY_PARTICIPANT_ASSEMBLED,
    RALLY_PARTICIPANT_INBOUND,
    RALLY_PARTICIPANT_RETURNING,
    RALLY_PARTICIPANT_RETURNED,
  ].includes(raw.status)
    ? raw.status
    : RALLY_PARTICIPANT_INBOUND;
  return {
    uid,
    ownerUid: uid,
    ownerName: normalizePlayerName(raw.ownerName, "Ruler"),
    ownerFlag: raw.ownerFlag || null,
    role: raw.role === "leader" ? "leader" : "ally",
    sourceId: safeString(raw.sourceId, 96),
    sourceName: safeString(raw.sourceName, 40),
    sourceRegionId: normalizeRegionId(raw.sourceRegionId),
    troops,
    status,
    joinArmyId: normalizeRallyId(raw.joinArmyId),
    joinedAtMs: Math.max(0, Math.floor(safeNumber(raw.joinedAtMs, 0))),
    assembledAtMs: Math.max(0, Math.floor(safeNumber(raw.assembledAtMs, 0))),
    arrivesAtMs: Math.max(0, Math.floor(safeNumber(raw.arrivesAtMs, 0))),
    returnArmyId: normalizeRallyId(raw.returnArmyId),
    attackSkillLevel: Math.max(0, Math.floor(safeNumber(raw.attackSkillLevel, 0))),
    attackBonusPercent: Math.max(0, safeNumber(raw.attackBonusPercent, 0)),
    fieldMedicsPercent: Math.max(0, safeNumber(raw.fieldMedicsPercent, 0)),
    ownerKingPower: Math.max(0, Math.floor(safeNumber(raw.ownerKingPower, 0))),
    losses: Math.max(0, Math.floor(safeNumber(raw.losses, 0))),
    survivors: Math.max(0, Math.floor(safeNumber(raw.survivors, troops))),
    xpAwarded: Math.max(0, Math.floor(safeNumber(raw.xpAwarded, 0))),
    settledAtMs: Math.max(0, Math.floor(safeNumber(raw.settledAtMs, 0))),
  };
}

function normalizeRallyParticipants(value = []) {
  const byUid = new Map();
  (Array.isArray(value) ? value : []).forEach(raw => {
    const participant = normalizeRallyParticipant(raw);
    if (participant && !byUid.has(participant.uid)) byUid.set(participant.uid, participant);
  });
  return [...byUid.values()].slice(0, RALLY_MAX_PARTICIPANTS);
}

function activeRallyParticipants(rally = {}) {
  return normalizeRallyParticipants(rally.participants)
    .filter(participant => [
      RALLY_PARTICIPANT_ASSEMBLED,
      RALLY_PARTICIPANT_INBOUND,
    ].includes(participant.status));
}

function assembledRallyParticipants(rally = {}) {
  return activeRallyParticipants(rally)
    .filter(participant => participant.status === RALLY_PARTICIPANT_ASSEMBLED);
}

function getRallyParticipant(rally = {}, uid = "") {
  const playerUid = safeString(uid, 128);
  return activeRallyParticipants(rally).find(participant => participant.uid === playerUid) || null;
}

function normalizeClanRally(snapshotOrData = null) {
  const exists = snapshotOrData?.exists;
  const data = exists ? snapshotOrData.data() || {} : snapshotOrData || {};
  const id = normalizeRallyId(exists ? snapshotOrData.id : data.id);
  if (
    !id
    || safeString(data.worldId, 120) !== ONLINE_WORLD_ID
    || safeString(data.resetGeneration, 120) !== RESET_GENERATION
  ) return null;
  return {
    ...data,
    id,
    clanId: safeString(data.clanId, 128),
    leaderUid: safeString(data.leaderUid, 128),
    status: safeString(data.status, 24),
    targetType: data.targetType === "camp" ? "camp" : "city",
    targetId: safeString(data.targetId, 96),
    targetRegionId: normalizeRegionId(data.targetRegionId),
    assemblyCityId: safeString(data.assemblyCityId, 96),
    assemblyRegionId: normalizeRegionId(data.assemblyRegionId),
    participants: normalizeRallyParticipants(data.participants),
    routeRegionIds: normalizeRegionIds(data.routeRegionIds),
    pathSegments: normalizePathSegments(data.pathSegments),
    path: normalizePath(data.path),
    pathLength: Math.max(0, safeNumber(data.pathLength, 0)),
    armyId: normalizeRallyId(data.armyId),
  };
}

function isRallyObjectiveTarget(target = {}, targetType = "city") {
  return targetType === "camp" ? Boolean(getRewardCampConfig(target)) : isStronghold(target);
}

function rallyTargetRef(rally = {}) {
  if (!rally.targetRegionId || !rally.targetId) return null;
  return rally.targetType === "camp"
    ? campRefForRegion(rally.targetRegionId, rally.targetId)
    : cityRefForRegion(rally.targetRegionId, rally.targetId);
}

function rallyAssemblyRef(rally = {}) {
  if (!rally.assemblyRegionId || !rally.assemblyCityId) return null;
  return cityRefForRegion(rally.assemblyRegionId, rally.assemblyCityId);
}

function normalizeRallyState(raw = {}) {
  if (
    safeString(raw.worldId, 120) !== ONLINE_WORLD_ID
    || safeString(raw.resetGeneration, 120) !== RESET_GENERATION
  ) {
    return { leaderUids: [] };
  }
  return {
    leaderUids: [...new Set((Array.isArray(raw.leaderUids) ? raw.leaderUids : [])
      .map(uid => safeString(uid, 128))
      .filter(Boolean))]
      .slice(0, CLAN_FORMING_RALLY_LIMIT),
  };
}

function releaseFormingRallySlot(transaction, stateRef, state = {}, leaderUid = "", nowMs = Date.now()) {
  const playerUid = safeString(leaderUid, 128);
  const leaderUids = normalizeRallyState(state).leaderUids.filter(uid => uid !== playerUid);
  transaction.set(stateRef, {
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    activeCount: leaderUids.length,
    leaderUids,
    updatedAtMs: nowMs,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function getRallyParticipantAttackPower(participant = {}) {
  const troops = Math.max(0, Math.floor(safeNumber(participant.troops, 0)));
  const bonusPercent = Math.max(0, safeNumber(participant.attackBonusPercent, 0));
  return Math.max(0, Math.floor(troops * BASE_TROOP_ATTACK_POWER * (1 + bonusPercent / 100)));
}

function getRallyAttackPackages(rally = {}) {
  return assembledRallyParticipants(rally).map(participant => ({
    ...participant,
    effectivePower: getRallyParticipantAttackPower(participant),
  }));
}

function allocateRallyAttackerLosses(packages = [], totalLosses = 0) {
  const rows = (Array.isArray(packages) ? packages : [])
    .map(entry => ({
      ...entry,
      troops: Math.max(0, Math.floor(safeNumber(entry?.troops, 0))),
    }))
    .filter(entry => entry.uid && entry.troops > 0);
  const totalTroops = rows.reduce((total, entry) => total + entry.troops, 0);
  const losses = Math.min(totalTroops, Math.max(0, Math.floor(safeNumber(totalLosses, 0))));
  let survivorsToAssign = Math.max(0, totalTroops - losses);
  const allocated = rows.map(entry => {
    const exact = totalTroops ? survivorsToAssign * entry.troops / totalTroops : 0;
    const survivors = Math.min(entry.troops, Math.floor(exact));
    return {
      ...entry,
      exact,
      survivors,
      losses: entry.troops - survivors,
    };
  });
  let assigned = allocated.reduce((total, entry) => total + entry.survivors, 0);
  allocated
    .sort((left, right) => (
      (right.exact - Math.floor(right.exact)) - (left.exact - Math.floor(left.exact))
      || Number(right.role === "leader") - Number(left.role === "leader")
      || left.uid.localeCompare(right.uid)
    ))
    .forEach(entry => {
      if (assigned >= survivorsToAssign || entry.survivors >= entry.troops) return;
      entry.survivors += 1;
      entry.losses -= 1;
      assigned += 1;
    });
  const leader = allocated.find(entry => entry.role === "leader");
  if (survivorsToAssign > 0 && leader && leader.survivors <= 0) {
    const donor = allocated.find(entry => entry.role !== "leader" && entry.survivors > 0);
    if (donor) {
      donor.survivors -= 1;
      donor.losses += 1;
      leader.survivors = 1;
      leader.losses = Math.max(0, leader.troops - 1);
    }
  }
  return allocated.sort((left, right) => (
    Number(right.role === "leader") - Number(left.role === "leader")
    || left.uid.localeCompare(right.uid)
  ));
}

function allocateRallyAttackXp(totalXp = 0, packages = []) {
  const pool = Math.max(0, Math.floor(safeNumber(totalXp, 0)));
  const rows = (Array.isArray(packages) ? packages : []).filter(entry => entry?.uid && entry.effectivePower > 0);
  const totalPower = rows.reduce((total, entry) => total + entry.effectivePower, 0);
  const result = new Map(rows.map(entry => [entry.uid, 0]));
  if (!pool || !totalPower) return result;
  let assigned = 0;
  rows
    .slice()
    .sort((left, right) => (
      Number(right.role === "leader") - Number(left.role === "leader")
      || left.uid.localeCompare(right.uid)
    ))
    .forEach((entry, index, ordered) => {
      const value = index === ordered.length - 1
        ? Math.max(0, pool - assigned)
        : Math.max(0, Math.floor(pool * entry.effectivePower / totalPower));
      result.set(entry.uid, value);
      assigned += value;
    });
  return result;
}

function createRallyParticipantSnapshot({
  uid = "",
  profile = {},
  source = {},
  sourceRegionId = "",
  troops = 0,
  role = "ally",
  status = RALLY_PARTICIPANT_INBOUND,
  joinArmyId = "",
  joinedAtMs = Date.now(),
  assembledAtMs = 0,
  ownerKingPower = 0,
} = {}) {
  return normalizeRallyParticipant({
    uid,
    ownerName: normalizePlayerName(profile.playerName || profile.displayName || source.ownerName, "Ruler"),
    ownerFlag: profile.flag || source.ownerFlag || null,
    role,
    sourceId: source.id,
    sourceName: source.name || source.id,
    sourceRegionId: normalizeRegionId(sourceRegionId || source.regionId),
    troops,
    status,
    joinArmyId,
    joinedAtMs,
    assembledAtMs,
    attackSkillLevel: getSkillLevel(profile, "swordmastery"),
    attackBonusPercent: getSkillPercent(profile, "swordmastery"),
    fieldMedicsPercent: getSkillPercent(profile, "fieldMedics"),
    ownerKingPower,
  });
}

function rallyForClient(rally = {}) {
  const participants = normalizeRallyParticipants(rally.participants);
  return {
    id: normalizeRallyId(rally.id),
    clanId: safeString(rally.clanId, 128),
    status: safeString(rally.status, 24),
    leaderUid: safeString(rally.leaderUid, 128),
    leaderName: normalizePlayerName(rally.leaderName, "Ruler"),
    targetType: rally.targetType === "camp" ? "camp" : "city",
    targetId: safeString(rally.targetId, 96),
    targetName: safeString(rally.targetName || rally.targetId, 80),
    targetRegionId: normalizeRegionId(rally.targetRegionId),
    assemblyCityId: safeString(rally.assemblyCityId, 96),
    assemblyCityName: safeString(rally.assemblyCityName || rally.assemblyCityId, 80),
    assemblyRegionId: normalizeRegionId(rally.assemblyRegionId),
    participantUids: participants.map(participant => participant.uid),
    participants,
    participantCount: activeRallyParticipants({ participants }).length,
    assembledTroops: participants
      .filter(participant => participant.status === RALLY_PARTICIPANT_ASSEMBLED)
      .reduce((total, participant) => total + participant.troops, 0),
    inboundTroops: participants
      .filter(participant => participant.status === RALLY_PARTICIPANT_INBOUND)
      .reduce((total, participant) => total + participant.troops, 0),
    armyId: normalizeRallyId(rally.armyId),
    createdAtMs: Math.max(0, timestampToMs(rally.createdAtMs)),
    launchedAtMs: Math.max(0, timestampToMs(rally.launchedAtMs)),
    updatedAtMs: Math.max(0, timestampToMs(rally.updatedAtMs)),
  };
}

function rallyParticipantTotals(participants = []) {
  const normalized = normalizeRallyParticipants(participants);
  return {
    participantUids: normalized.map(participant => participant.uid),
    participantCount: activeRallyParticipants({ participants: normalized }).length,
    assembledTroops: normalized
      .filter(participant => participant.status === RALLY_PARTICIPANT_ASSEMBLED)
      .reduce((total, participant) => total + participant.troops, 0),
    inboundTroops: normalized
      .filter(participant => participant.status === RALLY_PARTICIPANT_INBOUND)
      .reduce((total, participant) => total + participant.troops, 0),
  };
}

function createRallyAssemblyMovement({
  order = {},
  rally = {},
  participant = {},
  source = {},
  assembly = {},
  profile = {},
  economy = null,
  validatedRoute = {},
  nowMs = Date.now(),
} = {}) {
  const troops = Math.max(1, Math.floor(safeNumber(participant.troops, 1)));
  const stats = createPreparedEconomyStatsSnapshot(economy, {}, { nowMs });
  const speedMultiplier = skillMultiplier(profile, "marchOrders")
    * (1 + Math.max(0, safeNumber(economy?.bonuses?.marchSpeedBonusPercent, 0)) / 100);
  const duration = calculateTravelTime({
    pathLength: validatedRoute.pathLength,
    troopCount: troops,
    kind: "rally_join",
    speedMultiplier,
  });
  return {
    id: normalizeRallyId(order.id),
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    ownerKind: "player",
    ownerUid: participant.uid,
    ownerName: participant.ownerName,
    ownerFlag: participant.ownerFlag || null,
    ownerKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, participant.ownerKingPower))),
    kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
    kind: "rally_join",
    launchKind: "rally_join",
    rallyJoin: true,
    rallyId: normalizeRallyId(rally.id),
    rallyClanId: safeString(rally.clanId, 128),
    targetType: "city",
    fromId: safeString(source.id, 96),
    toId: safeString(assembly.id, 96),
    sourceRegionId: normalizeRegionId(order.sourceRegionId),
    targetRegionId: normalizeRegionId(rally.assemblyRegionId),
    fromName: safeString(source.name || source.id, 40),
    toName: safeString(assembly.name || assembly.id, 40),
    troops,
    requestedTroops: troops,
    total: duration,
    path: validatedRoute.path,
    pathSegments: validatedRoute.pathSegments,
    routeRegionIds: validatedRoute.routeRegionIds,
    viewRegionIds: validatedRoute.routeRegionIds,
    pathLength: validatedRoute.pathLength,
    targetKey: `${rally.assemblyRegionId}:${rally.assemblyCityId}`,
    targetOwnerAtLaunch: "player",
    originalTargetOwnerUid: rally.leaderUid,
    targetOwnerUid: rally.leaderUid,
    lastIncomingNotificationOwnerUid: "",
    attackerKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, participant.ownerKingPower))),
    defenderKingPower: Math.max(0, Math.floor(safeNumber(rally.leaderKingPower, 0))),
    launchedAtMs: nowMs,
    arrivesAtMs: nowMs + Math.ceil(duration * 1000),
    status: "active",
    createdByServer: true,
    rallyModelVersion: RALLY_MODEL_VERSION,
    serverAuthorityVersion: 3,
  };
}

function isRallyTargetFriendly(targetOwnerUid = "", targetOwnerProfile = {}, rally = {}) {
  const ownerUid = safeString(targetOwnerUid, 128);
  if (!ownerUid) return false;
  if (ownerUid === safeString(rally.leaderUid, 128)) return true;
  return safeString(targetOwnerProfile.clanId, 128) === safeString(rally.clanId, 128);
}

function protectedAssaultBreachRef(cityRef, attackerUid = "") {
  const safeAttackerUid = safeString(attackerUid, 128).replace(/[^a-zA-Z0-9_-]/g, "_");
  return cityRef.collection("protectedAssaultBreaches").doc(safeAttackerUid || "unknown");
}

function getCityOwnershipStartedAtMs(city = {}) {
  return Math.max(0, timestampToMs(city.lastCapturedAtMs || city.lastCapturedAt));
}

function isCurrentProtectedAssaultBreach(
  breach = null,
  { attackerUid = "", defenderUid = "", city = null } = {}
) {
  return Boolean(
    breach
    && typeof breach === "object"
    && Math.max(0, Math.floor(safeNumber(breach.version, 0))) === PROTECTED_ASSAULT_BREACH_VERSION
    && breach.status === "active"
    && safeString(breach.worldId, 128) === ONLINE_WORLD_ID
    && safeString(breach.resetGeneration, 128) === RESET_GENERATION
    && safeString(breach.attackerUid, 128) === safeString(attackerUid, 128)
    && safeString(breach.defenderUid, 128) === safeString(defenderUid, 128)
    && safeString(breach.cityId, 96) === safeString(city?.id, 96)
    && Math.max(0, timestampToMs(breach.defenderOwnershipStartedAtMs))
      === getCityOwnershipStartedAtMs(city)
    && safeString(breach.firstResolvedArmyId, 96)
  );
}

function campRefForRegion(regionId, campId) {
  return db.doc(`islands/${getOnlineIslandId(regionId)}/camps/${campId}`);
}

function getAuthoritativeRewardCampSeed(regionId = "", campId = "") {
  const safeCampId = safeString(campId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!safeCampId) return null;
  return getAuthoritativeIslandSeed(regionId).camps.find(camp => camp.id === safeCampId) || null;
}

function createNeutralRewardCampState(camp = {}) {
  const seed = cleanServerCampLayoutSeed(camp);
  if (!seed.id) return null;
  return {
    ...seed,
    holderUid: "",
    holderName: "",
    holderFlag: null,
    heldSinceMs: 0,
    payoutAtMs: 0,
    payoutPending: false,
    currentGarrison: seed.baseDefenders,
    returnSourceCityId: "",
    returnSourceRegionId: "",
    returnSourceCityName: "",
    returnPathSegments: [],
    returnRouteRegionIds: [],
    returnPathLength: 0,
    activeArmyIds: [],
    dailyRewardClaims: {},
    lastResetDate: "",
    state: "neutral",
  };
}

function getRewardCampConfig(campOrType = {}) {
  const camp = typeof campOrType === "object" && campOrType ? campOrType : null;
  const rawType = typeof campOrType === "string"
    ? campOrType
    : campOrType?.campType
      || (campOrType?.kind === "warbandCamp" ? "troops" : "")
      || (campOrType?.kind === "relicCamp" ? "items" : "")
      || (campOrType?.kind === "goldCamp" || campOrType?.targetType === "camp" ? "gold" : "");
  const normalizedType = safeString(rawType, 24).toLowerCase();
  const campType = normalizedType === "relic" || normalizedType === "item"
    ? "items"
    : normalizedType === "troop"
      ? "troops"
      : normalizedType;
  const base = REWARD_CAMP_CONFIG[campType] || null;
  if (!base || !camp) return base;
  const rewardSchedule = Array.isArray(camp.rewardSchedule) && camp.rewardSchedule.length
    ? camp.rewardSchedule.map(entry => ({
        minimumReward: Math.max(0, Math.floor(safeNumber(entry?.minimumReward, 0))),
        productionHours: Math.max(0, safeNumber(entry?.productionHours, 0)),
      }))
    : base.dailyRewards?.map((minimumReward, index) => ({
        minimumReward,
        productionHours: base.rewardHours?.[index] || 0,
      })) || [];
  return {
    ...base,
    baseReward: rewardSchedule[0]?.minimumReward ?? base.baseReward,
    dailyRewards: rewardSchedule.map(entry => entry.minimumReward),
    rewardHours: rewardSchedule.map(entry => entry.productionHours),
    rewardSchedule,
    maxDailyRewards: Math.max(0, Math.floor(safeNumber(camp.maxDailyRewards, base.maxDailyRewards || 0))),
  };
}

function isRewardCamp(target = {}) {
  return Boolean(getRewardCampConfig(target));
}

function cleanServerCampLayoutSeed(camp = {}) {
  if (!camp || typeof camp !== "object") return {};
  const campId = safeString(camp.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const config = getRewardCampConfig(camp);
  if (!config) return {};
  const baseDefenders = Math.max(1, Math.floor(safeNumber(camp.baseDefenders, config.baseDefenders)));
  return {
    id: campId,
    campId,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    name: safeString(camp.name || config.name, 80),
    mapId: safeString(camp.mapId || camp.regionId, 80),
    regionId: normalizeRegionId(camp.regionId || camp.mapId),
    x: safeNumber(camp.x, 0),
    y: safeNumber(camp.y, 0),
    size: Math.max(1, Math.floor(safeNumber(camp.size, 132))),
    artSrc: safeString(camp.artSrc || config.artSrc, 180),
    kind: config.kind,
    targetType: "camp",
    campType: config.campType,
    rewardType: config.rewardType,
    holdDurationMs: config.holdDurationMs,
    baseReward: config.baseReward,
    baseDefenders,
    defenseLevel: config.defenseLevel,
    rewardSchedule: config.rewardSchedule,
    maxDailyRewards: config.maxDailyRewards,
  };
}

function pointsAreClose(a = null, b = null, tolerance = ROUTE_ENDPOINT_TOLERANCE) {
  return Boolean(a && b && Math.hypot(safeNumber(a.x, 0) - safeNumber(b.x, 0), safeNumber(a.y, 0) - safeNumber(b.y, 0)) <= tolerance);
}

function getExpectedServerRouteLegs(source = {}, target = {}, routeRegionIds = []) {
  const legs = [];
  let currentPoint = { x: safeNumber(source.x, 0), y: safeNumber(source.y, 0) };
  for (let index = 0; index < routeRegionIds.length; index += 1) {
    const regionId = routeRegionIds[index];
    const isLast = index === routeRegionIds.length - 1;
    if (isLast) {
      legs.push({
        regionId,
        start: currentPoint,
        end: { x: safeNumber(target.x, 0), y: safeNumber(target.y, 0) },
      });
      break;
    }
    const nextRegionId = routeRegionIds[index + 1];
    const sourceConnection = getServerPortalConnection(regionId, nextRegionId);
    const exitPoint = getServerPortalWorldPoint(regionId, sourceConnection);
    const arrivalConnection = getServerArrivalConnection(regionId, nextRegionId, sourceConnection);
    const arrivalPoint = getServerPortalWorldPoint(nextRegionId, arrivalConnection);
    if (!sourceConnection || !arrivalConnection || !exitPoint || !arrivalPoint) {
      throw new HttpsError("failed-precondition", "The portal route is incomplete.");
    }
    legs.push({ regionId, start: currentPoint, end: exitPoint });
    currentPoint = arrivalPoint;
  }
  return legs;
}

function validateArmyRoute(order = {}, source = {}, target = {}) {
  const expectedRegions = findServerPortalRouteRegionChain(order.sourceRegionId, order.targetRegionId);
  if (expectedRegions.length > MAX_ROUTE_REGION_COUNT) {
    throw new HttpsError("failed-precondition", "That route crosses too many maps.");
  }
  if (order.routeRegionIds.length !== expectedRegions.length
    || expectedRegions.some((regionId, index) => order.routeRegionIds[index] !== regionId)) {
    throw new HttpsError("invalid-argument", "The march route does not follow the Crownlands portal network.");
  }

  const expectedLegs = getExpectedServerRouteLegs(source, target, expectedRegions);
  const suppliedSegments = order.pathSegments.length
    ? order.pathSegments
    : expectedRegions.length === 1 && order.path.length >= 2
      ? [{ regionId: expectedRegions[0], points: order.path }]
      : [];
  if (suppliedSegments.length !== expectedLegs.length) {
    throw new HttpsError("invalid-argument", "The march route is missing a map segment.");
  }

  let pathLength = 0;
  const pathSegments = suppliedSegments.map((segment, index) => {
    const expected = expectedLegs[index];
    const points = normalizePath(segment.points);
    if (segment.regionId !== expected.regionId || points.length < 2) {
      throw new HttpsError("invalid-argument", "The march contains an invalid map segment.");
    }
    if (!pointsAreClose(points[0], expected.start) || !pointsAreClose(points[points.length - 1], expected.end)) {
      throw new HttpsError("invalid-argument", "The march route does not connect its city and portal endpoints.");
    }
    const length = routeLength(points);
    const minimumLength = Math.hypot(expected.end.x - expected.start.x, expected.end.y - expected.start.y);
    if (length + ROUTE_ENDPOINT_TOLERANCE < minimumLength) {
      throw new HttpsError("invalid-argument", "The march route distance is too short.");
    }
    pathLength += length;
    return { regionId: expected.regionId, points, length };
  });
  if (!Number.isFinite(pathLength) || pathLength <= 0) {
    throw new HttpsError("failed-precondition", "No valid troop route was found.");
  }
  assertRouteAvoidsWorldStructures(pathSegments, new Set([order.fromId, order.toId]));
  const path = pathSegments.flatMap((segment, index) => index ? segment.points.slice(1) : segment.points);
  return {
    routeRegionIds: expectedRegions,
    pathSegments,
    path: path.slice(0, MAX_ROUTE_POINTS_PER_SEGMENT),
    pathLength,
  };
}

function normalizeActiveArmyIds(value = []) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(id => safeString(id, 96).replace(/[^a-zA-Z0-9_-]/g, "_"))
    .filter(Boolean))]
    .slice(0, 200);
}

function getRewardCampCombatTarget(camp = {}) {
  const authoritativeSeed = camp?.id
    ? getAuthoritativeRewardCampSeed(camp.regionId || camp.mapId, camp.id)
    : null;
  const resolvedCamp = authoritativeSeed ? { ...camp, ...authoritativeSeed } : camp;
  const config = getRewardCampConfig(resolvedCamp);
  if (!config) return null;
  const currentGarrison = Math.max(0, Math.floor(safeNumber(resolvedCamp.currentGarrison, resolvedCamp.baseDefenders || config.baseDefenders)));
  return {
    ...resolvedCamp,
    kind: config.kind,
    targetType: "camp",
    campType: config.campType,
    rewardType: config.rewardType,
    holdDurationMs: config.holdDurationMs,
    baseReward: config.baseReward,
    baseDefenders: Math.max(1, Math.floor(safeNumber(resolvedCamp.baseDefenders, config.baseDefenders))),
    defenseLevel: config.defenseLevel,
    level: config.defenseLevel,
    troops: currentGarrison,
    troopFloat: currentGarrison,
    rewardSchedule: config.rewardSchedule,
    maxDailyRewards: config.maxDailyRewards,
    ownerKind: resolvedCamp.holderUid ? "player" : "neutral",
    ownerUid: safeString(resolvedCamp.holderUid || resolvedCamp.ownerUid, 128),
    ownerName: normalizePlayerName(resolvedCamp.holderName || resolvedCamp.ownerName, ""),
    ownerFlag: resolvedCamp.holderFlag || resolvedCamp.ownerFlag || null,
    defense: 1,
    isMainCity: false,
    ownerShieldExpiresAtMs: 0,
  };
}

function getRewardCampState(activeArmyIds = [], holderUid = "") {
  if (normalizeActiveArmyIds(activeArmyIds).length) return "contested";
  return holderUid ? "held" : "neutral";
}

function removeActiveCampArmyId(camp = {}, armyId = "") {
  return normalizeActiveArmyIds(camp.activeArmyIds).filter(id => id !== armyId);
}

function campUpdateForClient(campId, regionId, patch = {}) {
  const { updatedAt, createdAt, ...safePatch } = patch;
  return { id: campId, regionId: normalizeRegionId(regionId), ...safePatch };
}

function cleanServerCityLayoutSeed(city = {}) {
  const cityId = safeString(city.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const isStrongholdCity = city.kind === "stronghold" || Boolean(city.strongholdType);
  return {
    id: cityId,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    name: safeString(city.name || cityId, 80),
    x: safeNumber(city.x, 0),
    y: safeNumber(city.y, 0),
    startPool: safeString(city.startPool, 80),
    regionId: safeString(city.regionId || city.startPool, 80),
    kind: isStrongholdCity ? "stronghold" : "",
    strongholdType: isStrongholdCity ? safeString(city.strongholdType, 32) : "",
    bonus: isStrongholdCity ? safeString(city.bonus, 32) : "",
    bonusPercent: isStrongholdCity ? Math.max(0, Math.floor(safeNumber(city.bonusPercent, 0))) : 0,
    size: isStrongholdCity ? Math.max(0, Math.floor(safeNumber(city.size, 0))) : 0,
    artSrc: isStrongholdCity ? safeString(city.artSrc, 180) : "",
    startTroops: isStrongholdCity ? Math.max(0, Math.floor(safeNumber(city.startTroops, safeNumber(city.troops, 0)))) : 0,
    level: clampCityLevel(city.level || (isStrongholdCity ? 50 : 1)),
    defense: 1,
  };
}

function canonicalArmyRef(armyId = "") {
  return db.doc(`armies/${safeString(armyId, 96).replace(/[^a-zA-Z0-9_-]/g, "_")}`);
}

function incomingArmyViewRef(uid = "", armyId = "") {
  const safeUid = safeString(uid, 128).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeArmyId = safeString(armyId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  return safeUid && safeArmyId
    ? db.doc(`players/${safeUid}/incomingArmies/${safeArmyId}`)
    : null;
}

function armyViewRefsForRegions(regionIds, armyId) {
  return normalizeRegionIds(regionIds).map(regionId => db.doc(`islands/${getOnlineIslandId(regionId)}/armies/${armyId}`));
}

function armyRefsForRegions(regionIds, armyId) {
  return [canonicalArmyRef(armyId), ...armyViewRefsForRegions(regionIds, armyId)];
}

function formatTroopEstimateBound(value = 0) {
  const count = Math.max(0, Math.floor(safeNumber(value, 0)));
  const units = [
    { value: 1_000_000_000_000, suffix: "T" },
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" },
  ];
  const unit = units.find(entry => count >= entry.value);
  if (!unit) return count.toLocaleString("en-US");
  const scaled = count / unit.value;
  const digits = Number.isInteger(scaled) ? 0 : 1;
  return `${scaled.toFixed(digits)}${unit.suffix}`;
}

function getIncomingTroopEstimate(troops = 0) {
  const count = Math.max(1, Math.floor(safeNumber(troops, 1)));
  let min = 1;
  let max = 10;
  if (count > 10 && count <= ARMY_TROOP_ESTIMATE_DECADE_MAX) {
    max = 10 ** Math.ceil(Math.log10(count));
    min = max / 10;
  } else if (count > ARMY_TROOP_ESTIMATE_DECADE_MAX) {
    min = ARMY_TROOP_ESTIMATE_DECADE_MAX;
    max = 5_000_000;
    if (count > max) {
      min = max;
      max = 10_000_000;
    }
    if (count > max) {
      let base = 10_000_000;
      min = base;
      let matched = false;
      while (!matched && Number.isFinite(base) && base <= Number.MAX_SAFE_INTEGER / 10) {
        for (const multiplier of [2, 5, 10]) {
          const candidate = base * multiplier;
          if (count <= candidate) {
            max = candidate;
            matched = true;
            break;
          }
          min = candidate;
        }
        base *= 10;
      }
      if (!matched) max = Number.MAX_SAFE_INTEGER;
    }
  }
  return {
    min: Math.max(1, Math.floor(min)),
    max: Math.max(1, Math.floor(max)),
    label: `${formatTroopEstimateBound(min)}\u2013${formatTroopEstimateBound(max)}`,
  };
}

function isEstimatedAttackMovement(movement = {}) {
  return Boolean(
    movement
    && (
      movement.kind === "attack"
      || movement.launchKind === "attack"
      || movement.rallyAttack
    )
  );
}

function createArmyPublicProjection(movement = {}) {
  const projection = {
    ...movement,
    armyTroopVisibilityVersion: ARMY_TROOP_VISIBILITY_VERSION,
  };
  delete projection.id;
  if (isEstimatedAttackMovement(movement)) {
    const estimate = getIncomingTroopEstimate(movement.troops);
    projection.troopVisibility = "estimate";
    projection.troopEstimateMin = estimate.min;
    projection.troopEstimateMax = estimate.max;
    projection.troopEstimateLabel = estimate.label;
    projection.troops = FieldValue.delete();
    projection.requestedTroops = FieldValue.delete();
    projection.attackProtection = FieldValue.delete();
    projection.demoAttack = FieldValue.delete();
  } else {
    projection.troopVisibility = "exact";
    projection.troopEstimateMin = FieldValue.delete();
    projection.troopEstimateMax = FieldValue.delete();
    projection.troopEstimateLabel = FieldValue.delete();
  }
  return projection;
}

function shouldWriteIncomingArmyView(movement = {}) {
  const ownerUid = safeString(movement.ownerUid, 128);
  const targetOwnerUid = safeString(movement.targetOwnerUid, 128);
  return Boolean(
    targetOwnerUid
    && targetOwnerUid !== ownerUid
    && movement.status === "active"
    && !movement.returning
  );
}

function writeArmyMovementCopies(writer, movement = {}, {
  includeCreatedAt = false,
  previousTargetOwnerUid = "",
} = {}) {
  const armyId = safeString(movement.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!armyId) throw new HttpsError("invalid-argument", "Army movement id is missing.");
  const timestampPatch = {
    ...(includeCreatedAt ? { createdAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const canonicalMovement = {
    ...movement,
    armyTroopVisibilityVersion: ARMY_TROOP_VISIBILITY_VERSION,
    ...timestampPatch,
  };
  delete canonicalMovement.id;
  writer.set(canonicalArmyRef(armyId), canonicalMovement, { merge: true });

  const publicMovement = {
    ...createArmyPublicProjection(movement),
    ...timestampPatch,
  };
  armyViewRefsForRegions(movement.viewRegionIds || movement.routeRegionIds || [], armyId)
    .forEach(ref => writer.set(ref, publicMovement, { merge: true }));

  const priorTargetUid = safeString(previousTargetOwnerUid || movement.targetOwnerUid, 128);
  const nextTargetUid = shouldWriteIncomingArmyView(movement)
    ? safeString(movement.targetOwnerUid, 128)
    : "";
  if (priorTargetUid && priorTargetUid !== nextTargetUid) {
    const oldViewRef = incomingArmyViewRef(priorTargetUid, armyId);
    if (oldViewRef) writer.delete(oldViewRef);
  }
  if (nextTargetUid) {
    const incomingView = {
      ...createArmyPublicProjection(movement),
      id: armyId,
      viewerAccess: "target",
      ...timestampPatch,
    };
    const nextViewRef = incomingArmyViewRef(nextTargetUid, armyId);
    if (nextViewRef) writer.set(nextViewRef, incomingView, { merge: true });
  }
}

function rallyJoinPublicMovement(movement = {}) {
  return {
    worldId: safeString(movement.worldId, 120),
    resetGeneration: safeString(movement.resetGeneration, 120),
    ownerKind: "player",
    ownerUid: safeString(movement.ownerUid, 128),
    ownerName: normalizePlayerName(movement.ownerName, "Ruler"),
    kind: "rally_join",
    launchKind: "rally_join",
    rallyJoin: true,
    targetType: "city",
    fromId: safeString(movement.fromId, 96),
    toId: safeString(movement.toId, 96),
    fromName: safeString(movement.fromName, 40),
    toName: safeString(movement.toName, 40),
    sourceRegionId: normalizeRegionId(movement.sourceRegionId),
    targetRegionId: normalizeRegionId(movement.targetRegionId),
    troops: Math.max(0, Math.floor(safeNumber(movement.troops, 0))),
    total: Math.max(0.1, safeNumber(movement.total, 0.1)),
    path: normalizePath(movement.path),
    pathSegments: normalizePathSegments(movement.pathSegments),
    routeRegionIds: normalizeRegionIds(movement.routeRegionIds),
    viewRegionIds: normalizeRegionIds(movement.viewRegionIds || movement.routeRegionIds),
    pathLength: Math.max(0, safeNumber(movement.pathLength, 0)),
    launchedAtMs: Math.max(0, Math.floor(safeNumber(movement.launchedAtMs, 0))),
    arrivesAtMs: Math.max(0, Math.floor(safeNumber(movement.arrivesAtMs, 0))),
    returning: Boolean(movement.returning),
    returnStartProgress: clamp(safeNumber(movement.returnStartProgress, 0), 0, 1),
    returnDestinationId: safeString(movement.returnDestinationId, 96),
    returnDestinationRegionId: normalizeRegionId(movement.returnDestinationRegionId),
    status: movement.status === "resolved" ? "resolved" : "active",
    createdByServer: true,
    serverAuthorityVersion: Math.max(3, Math.floor(safeNumber(movement.serverAuthorityVersion, 3))),
  };
}

function writeRallyJoinMovementCopies(transaction, movement = {}, { includeCreatedAt = false } = {}) {
  const canonicalPatch = {
    ...movement,
    ...(includeCreatedAt ? { createdAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
  delete canonicalPatch.id;
  transaction.set(canonicalArmyRef(movement.id), canonicalPatch, { merge: true });
  const publicPatch = {
    ...rallyJoinPublicMovement(movement),
    ...(includeCreatedAt ? { createdAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
  armyViewRefsForRegions(movement.routeRegionIds, movement.id).forEach(ref => {
    transaction.set(ref, publicPatch, { merge: true });
  });
}

function getArmyRouteProgressAtMs(army = {}, nowMs = Date.now()) {
  const launchedAtMs = Math.max(0, Math.floor(safeNumber(army.launchedAtMs, 0)));
  const arrivesAtMs = Math.max(0, Math.floor(safeNumber(army.arrivesAtMs, 0)));
  const swiftUsedAtMs = Math.max(0, Math.floor(safeNumber(army.swiftMarchUsedAtMs, 0)));
  if (swiftUsedAtMs > 0 && arrivesAtMs > swiftUsedAtMs && nowMs >= swiftUsedAtMs) {
    const progressAtUse = clamp(safeNumber(army.swiftMarchProgressAtUse, 0), 0, 1);
    const acceleratedProgress = clamp((nowMs - swiftUsedAtMs) / (arrivesAtMs - swiftUsedAtMs), 0, 1);
    return clamp(progressAtUse + (1 - progressAtUse) * acceleratedProgress, 0, 1);
  }
  if (launchedAtMs > 0 && arrivesAtMs > launchedAtMs) {
    return clamp((nowMs - launchedAtMs) / (arrivesAtMs - launchedAtMs), 0, 1);
  }
  const totalMs = Math.max(100, safeNumber(army.total, 0.1) * 1000);
  return clamp(1 - Math.max(0, arrivesAtMs - nowMs) / totalMs, 0, 1);
}

function createAlliedTargetReturnMovement(army = {}, nowMs = Date.now()) {
  const sourceRegionId = normalizeRegionId(army.sourceRegionId);
  const targetRegionId = normalizeRegionId(army.targetRegionId);
  if (!sourceRegionId || !targetRegionId || !army.fromId || !army.toId) {
    throw new HttpsError("failed-precondition", "That troop march is missing its return route.");
  }
  const oldArrivesAtMs = Math.max(0, Math.floor(safeNumber(army.arrivesAtMs, 0)));
  const fallbackTotalMs = Math.max(100, safeNumber(army.total, 0.1) * 1000);
  const launchedAtMs = Math.max(0, Math.floor(safeNumber(
    army.launchedAtMs,
    oldArrivesAtMs - fallbackTotalMs
  )));
  const originalArrivesAtMs = Math.max(
    oldArrivesAtMs,
    Math.floor(safeNumber(army.swiftMarchOriginalArrivesAtMs, oldArrivesAtMs))
  );
  const returnDurationMs = Math.max(
    RECALL_HORN_MINIMUM_RETURN_MS,
    originalArrivesAtMs - launchedAtMs
  );
  const originalKind = ARMY_ORDER_KINDS.includes(army.kind) ? army.kind : "attack";
  return {
    ...army,
    kind: "transfer",
    launchKind: ARMY_ORDER_KINDS.includes(army.launchKind) ? army.launchKind : originalKind,
    retargetedFromKind: originalKind,
    returning: true,
    returnReason: ALLIED_TARGET_RETURN_REASON,
    recalledAtMs: nowMs,
    recallOriginalArrivesAtMs: oldArrivesAtMs,
    returnStartProgress: 1,
    returnDestinationId: army.fromId,
    returnDestinationRegionId: sourceRegionId,
    arrivesAtMs: nowMs + returnDurationMs,
    total: Math.max(0.1, returnDurationMs / 1000),
    targetOwnerUid: "",
    routeRegionIds: normalizeRegionIds([
      ...(army.routeRegionIds || []),
      sourceRegionId,
      targetRegionId,
    ]),
    status: "active",
  };
}

function reverseArmyRoute(pathSegments = []) {
  const segments = normalizePathSegments(pathSegments)
    .reverse()
    .map(segment => {
      const points = [...segment.points].reverse();
      return { regionId: segment.regionId, points, length: routeLength(points) };
    });
  if (!segments.length) return null;
  return {
    routeRegionIds: segments.map(segment => segment.regionId),
    pathSegments: segments,
    path: segments.flatMap((segment, index) => index ? segment.points.slice(1) : segment.points).slice(0, MAX_ROUTE_POINTS_PER_SEGMENT),
    pathLength: segments.reduce((total, segment) => total + segment.length, 0),
  };
}

function segmentCrossesServerObstacle(start = {}, end = {}, obstacle = {}, clearance = 0) {
  const radius = Math.max(1, safeNumber(obstacle.radius, 1) + clearance);
  return pointToSegmentDistanceSquared(obstacle, start, end) < radius * radius;
}

function getServerRouteCollisionCount(regionId = "", start = {}, end = {}, ignoredIds = new Set()) {
  return getServerRouteObstacles(regionId).reduce((count, obstacle) => (
    ignoredIds.has(obstacle.id) || !segmentCrossesServerObstacle(start, end, obstacle, 2)
      ? count
      : count + 1
  ), 0);
}

function findFirstServerRouteCollision(regionId = "", points = [], ignoredIds = new Set()) {
  const obstacles = getServerRouteObstacles(regionId).filter(obstacle => !ignoredIds.has(obstacle.id));
  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    const start = points[pointIndex - 1];
    const end = points[pointIndex];
    for (const obstacle of obstacles) {
      if (segmentCrossesServerObstacle(start, end, obstacle, 2)) {
        return { pointIndex, start, end, obstacle };
      }
    }
  }
  return null;
}

function findServerObstacleDetour(regionId = "", collision = {}, ignoredIds = new Set()) {
  const { start, end, obstacle } = collision;
  const bounds = getServerMapBounds(regionId);
  if (!start || !end || !obstacle || !bounds) return null;
  const candidates = [];
  const paddingScales = [1.18, 1.4, 1.75, 2.2];
  for (const scale of paddingScales) {
    const radius = Math.max(obstacle.radius + 12, obstacle.radius * scale);
    for (let step = 0; step < 32; step += 1) {
      const angle = step / 32 * Math.PI * 2;
      const point = {
        x: obstacle.x + Math.cos(angle) * radius,
        y: obstacle.y + Math.sin(angle) * radius,
      };
      if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) continue;
      if (segmentCrossesServerObstacle(start, point, obstacle, 2)
        || segmentCrossesServerObstacle(point, end, obstacle, 2)) continue;
      const collisionCount = getServerRouteCollisionCount(regionId, start, point, ignoredIds)
        + getServerRouteCollisionCount(regionId, point, end, ignoredIds);
      const distance = Math.hypot(point.x - start.x, point.y - start.y)
        + Math.hypot(end.x - point.x, end.y - point.y);
      candidates.push({ point, collisionCount, distance });
    }
    const clearCandidates = candidates.filter(candidate => candidate.collisionCount === 0);
    if (clearCandidates.length) {
      clearCandidates.sort((a, b) => a.distance - b.distance);
      return clearCandidates[0].point;
    }
  }
  candidates.sort((a, b) => a.collisionCount - b.collisionCount || a.distance - b.distance);
  return candidates[0]?.point || null;
}

function buildServerStructureSafeLeg(regionId = "", start = {}, end = {}, ignoredIds = new Set()) {
  const points = [
    { x: safeNumber(start.x, 0), y: safeNumber(start.y, 0) },
    { x: safeNumber(end.x, 0), y: safeNumber(end.y, 0) },
  ];
  for (let attempt = 0; attempt < MAX_ROUTE_POINTS_PER_SEGMENT - 2; attempt += 1) {
    const collision = findFirstServerRouteCollision(regionId, points, ignoredIds);
    if (!collision) return points;
    const detour = findServerObstacleDetour(regionId, collision, ignoredIds);
    if (!detour) {
      throw new HttpsError("failed-precondition", "A safe return route from the camp could not be found.");
    }
    points.splice(collision.pointIndex, 0, detour);
  }
  throw new HttpsError("failed-precondition", "The camp return route is too complex.");
}

function buildServerGeneratedArmyRoute(source = {}, target = {}) {
  const sourceRegionId = requireKnownWorldRegionId(source.regionId || source.startPool);
  const targetRegionId = requireKnownWorldRegionId(target.regionId || target.startPool);
  const routeRegionIds = findServerPortalRouteRegionChain(sourceRegionId, targetRegionId);
  const ignoredIds = new Set([safeString(source.id, 96), safeString(target.id, 96)].filter(Boolean));
  const pathSegments = getExpectedServerRouteLegs(source, target, routeRegionIds).map(leg => {
    const points = buildServerStructureSafeLeg(leg.regionId, leg.start, leg.end, ignoredIds);
    return { regionId: leg.regionId, points, length: routeLength(points) };
  });
  assertRouteAvoidsWorldStructures(pathSegments, ignoredIds);
  return {
    routeRegionIds,
    pathSegments,
    path: pathSegments.flatMap((segment, index) => index ? segment.points.slice(1) : segment.points).slice(0, MAX_ROUTE_POINTS_PER_SEGMENT),
    pathLength: pathSegments.reduce((total, segment) => total + segment.length, 0),
  };
}

function getCampReturnRoute(camp = {}, destination = {}) {
  const destinationRegionId = normalizeRegionId(destination.regionId || destination.startPool);
  const storedSourceId = safeString(camp.returnSourceCityId, 96);
  const storedSourceRegionId = normalizeRegionId(camp.returnSourceRegionId);
  if (storedSourceId === safeString(destination.id, 96) && storedSourceRegionId === destinationRegionId) {
    const reversed = reverseArmyRoute(camp.returnPathSegments);
    if (reversed?.pathLength > 0) return reversed;
  }
  return buildServerGeneratedArmyRoute(camp, destination);
}

function reportRef(uid, reportId) {
  return db.doc(`players/${uid}/serverReports/${reportId}`);
}

function battleSnapshotRef(battleId = "") {
  const safeBattleId = safeString(battleId, 160).replace(/[^a-zA-Z0-9_-]/g, "_");
  return safeBattleId
    ? db.doc(`battleSnapshots/${RESET_GENERATION}/entries/${safeBattleId}`)
    : null;
}

function islandReportRef(regionId, reportId) {
  return db.doc(`islands/${getOnlineIslandId(regionId)}/reports/${reportId}`);
}

function getOwnerUid(city = {}) {
  return safeString(city.ownerUid, 128);
}

function canUseSwiftMarchOrderOnTransfer(army = {}, source = {}, target = {}, uid = "") {
  if (
    !uid
    || army.kind !== "transfer"
    || army.targetType === "camp"
    || army.relinquishTransfer
    || getOwnerUid(army) !== uid
    || getOwnerUid(source) !== uid
    || getOwnerUid(target) !== uid
  ) {
    return false;
  }
  if (isStronghold(target)) return true;
  return !isStronghold(source);
}

function getMainCityInfo(profile = {}) {
  const id = safeString(profile?.mainCityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!id) return null;
  const islandRegionId = profile?.mainIslandId ? getRegionIdFromOnlineIslandId(profile.mainIslandId) : "";
  const regionId = normalizeRegionId(profile?.mainRegionId || profile?.mainRegion || islandRegionId || profile?.regionId || "west");
  return {
    id,
    regionId,
    ref: cityRefForRegion(regionId, id),
  };
}

function isGivenUpNeutralCity(city = {}) {
  return Boolean(
    city
    && !getOwnerUid(city)
    && !isStronghold(city)
    && (timestampToMs(city.relinquishedAtMs) > 0 || timestampToMs(city.relocatedAtMs) > 0)
  );
}

function getOwnerName(city = {}, fallback = "Unknown") {
  return normalizePlayerName(city.ownerName, "") || safeString(city.name || fallback, 40);
}

function normalizeServerFlag(flag = null) {
  if (!flag || typeof flag !== "object") return null;
  try {
    return JSON.parse(JSON.stringify(flag));
  } catch (error) {
    return null;
  }
}

function isCurrentWorldIslandId(islandId = "") {
  return String(islandId || "").startsWith(`${ONLINE_WORLD_ID}-`);
}

function getCanonicalPlayerIdentity(uid = "", profile = {}, data = {}, authToken = {}) {
  const ownerName = normalizePlayerName(
    data.ownerName || data.playerName || profile.playerName || profile.displayName || authToken.name
  );
  const hasFlagPayload = Object.prototype.hasOwnProperty.call(data, "ownerFlag")
    || Object.prototype.hasOwnProperty.call(data, "flag");
  const rawFlag = hasFlagPayload
    ? (data.ownerFlag !== undefined ? data.ownerFlag : data.flag)
    : profile.flag;
  const ownerFlag = normalizeServerFlag(rawFlag);
  const ownerKingPower = Math.max(
    0,
    Math.floor(safeNumber(profile.kingPower, 0))
  );
  return {
    uid,
    ownerName,
    ownerFlag,
    ownerKingPower,
    clanId: safeString(profile.clanId, 128),
    clanName: safeString(profile.clanName, 24),
    clanTag: safeString(profile.clanTag, 5),
  };
}

function isProtectedMainCity(city = {}, attackerUid = "", ownerProfile = null) {
  const ownerUid = getOwnerUid(city);
  if (!ownerUid || ownerUid === attackerUid) return false;
  const cityId = safeString(city.id, 96);
  const profileMainCityId = safeString(ownerProfile?.mainCityId, 96);
  if (!profileMainCityId) return Boolean(city.isMainCity);
  if (!cityId || cityId !== profileMainCityId) return false;

  const cityRegionId = safeString(city.regionId || city.startPool, 160);
  const profileRegionId = safeString(
    ownerProfile?.mainRegionId || getRegionIdFromOnlineIslandId(ownerProfile?.mainIslandId),
    160
  );
  return !cityRegionId
    || !profileRegionId
    || normalizeRegionId(cityRegionId) === normalizeRegionId(profileRegionId);
}

function getMainCityProtectionProfile(...sources) {
  const candidates = sources.filter(source => source && typeof source === "object");
  const pointerSource = candidates.find(source => safeString(source.mainCityId, 96));
  if (!pointerSource) return null;
  const mainCityId = safeString(pointerSource.mainCityId, 96);
  const locationSource = candidates.find(source => (
    safeString(source.mainCityId, 96) === mainCityId
    && (safeString(source.mainRegionId, 160) || safeString(source.mainIslandId, 160))
  )) || pointerSource;
  return {
    mainCityId,
    mainRegionId: safeString(locationSource.mainRegionId, 160),
    mainIslandId: safeString(locationSource.mainIslandId, 160),
  };
}

function getShieldExpiresAtMs(city = {}) {
  if (isStronghold(city)) return 0;
  const value = city.ownerShieldExpiresAtMs;
  if (typeof value?.toMillis === "function") return value.toMillis();
  return Math.max(0, Math.floor(safeNumber(value, 0)));
}

function isCityShielded(city = {}, attackerUid = "", nowMs = Date.now()) {
  const ownerUid = getOwnerUid(city);
  if (!ownerUid || ownerUid === attackerUid || isStronghold(city)) return false;
  return getShieldExpiresAtMs(city) > nowMs;
}

function shouldDeactivatePeaceShieldForAttack(target = {}, targetType = "city", attackerUid = "", resolvedKind = "attack") {
  if (resolvedKind !== "attack") return false;
  if (targetType === "camp" || isStronghold(target)) return true;
  const targetOwnerUid = getOwnerUid(target);
  return Boolean(targetOwnerUid && targetOwnerUid !== attackerUid);
}

function getCurrentDateKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeRewardedAdState(raw = {}, nowMs = Date.now()) {
  const dayKey = getCurrentDateKey(new Date(nowMs));
  const sameDay = safeString(raw?.dayKey, 10) === dayKey;
  return {
    schemaVersion: 1,
    dayKey,
    claimedToday: sameDay ? clampInt(raw?.claimedToday, 0, REWARDED_AD_DAILY_LIMIT) : 0,
    lastClaimedAtMs: Math.max(0, timestampToMs(raw?.lastClaimedAtMs)),
    activeIntentId: safeString(raw?.activeIntentId, 96),
  };
}

function createRewardedAdStatus(rawState = {}, enabled = true, nowMs = Date.now(), previewRewards = {}) {
  const state = normalizeRewardedAdState(rawState, nowMs);
  const cooldownEndsAtMs = state.lastClaimedAtMs
    ? state.lastClaimedAtMs + REWARDED_AD_COOLDOWN_MS
    : 0;
  const cooldownRemainingMs = Math.max(0, cooldownEndsAtMs - nowMs);
  const remainingToday = Math.max(0, REWARDED_AD_DAILY_LIMIT - state.claimedToday);
  const eligible = Boolean(enabled && remainingToday > 0 && cooldownRemainingMs <= 0);
  const reason = !enabled
    ? "disabled"
    : remainingToday <= 0
      ? "daily-limit"
      : cooldownRemainingMs > 0
        ? "cooldown"
        : "";
  return {
    enabled: Boolean(enabled),
    eligible,
    reason,
    dayKey: state.dayKey,
    claimedToday: state.claimedToday,
    dailyLimit: REWARDED_AD_DAILY_LIMIT,
    remainingToday,
    rewardMinutes: REWARDED_AD_REWARD_MINUTES,
    cooldownMinutes: Math.floor(REWARDED_AD_COOLDOWN_MS / 60000),
    cooldownEndsAtMs,
    cooldownRemainingMs,
    previewRewards: {
      gold: Math.max(0, Math.floor(safeNumber(previewRewards?.gold, 0))),
      troops: Math.max(0, Math.floor(safeNumber(previewRewards?.troops, 0))),
    },
  };
}

function getRewardedAdServerConfigFromSnapshot(snapshot = null) {
  const config = snapshot?.exists ? snapshot.data() || {} : {};
  return {
    enabled: config.enabled === true,
  };
}

function normalizeDaily(daily = {}, now = new Date()) {
  const today = getCurrentDateKey(now);
  if (!daily || typeof daily !== "object" || daily.date !== today) {
    return { date: today, neutralCaptures: 0, harvestedBonuses: 0, harvestedGoldBonuses: 0, harvestedTroopBonuses: 0 };
  }
  return {
    date: today,
    neutralCaptures: clampInt(daily.neutralCaptures, 0, DAILY_NEUTRAL_CAPTURE_LIMIT),
    harvestedBonuses: clampInt(daily.harvestedBonuses, 0, HARVEST_BONUS_DAILY_LIMIT),
    harvestedGoldBonuses: clampInt(daily.harvestedGoldBonuses, 0, HARVEST_BONUS_DAILY_GOLD_LIMIT),
    harvestedTroopBonuses: clampInt(daily.harvestedTroopBonuses, 0, HARVEST_BONUS_DAILY_TROOP_LIMIT),
  };
}

function mergeHarvestDailyTrackers(serverDaily = {}, clientDaily = {}, now = new Date()) {
  const server = normalizeDaily(serverDaily, now);
  const client = normalizeDaily(clientDaily, now);
  const harvestedGoldBonuses = clampInt(
    Math.max(server.harvestedGoldBonuses, client.harvestedGoldBonuses),
    0,
    HARVEST_BONUS_DAILY_GOLD_LIMIT
  );
  const harvestedTroopBonuses = clampInt(
    Math.max(server.harvestedTroopBonuses, client.harvestedTroopBonuses),
    0,
    HARVEST_BONUS_DAILY_TROOP_LIMIT
  );
  return {
    date: server.date,
    neutralCaptures: clampInt(Math.max(server.neutralCaptures, client.neutralCaptures), 0, DAILY_NEUTRAL_CAPTURE_LIMIT),
    harvestedGoldBonuses,
    harvestedTroopBonuses,
    harvestedBonuses: clampInt(harvestedGoldBonuses + harvestedTroopBonuses, 0, HARVEST_BONUS_DAILY_LIMIT),
  };
}

function getHarvestBonusRemaining(type = "gold", daily = {}) {
  const normalizedType = type === "troops" ? "troops" : "gold";
  const typeLimit = normalizedType === "troops" ? HARVEST_BONUS_DAILY_TROOP_LIMIT : HARVEST_BONUS_DAILY_GOLD_LIMIT;
  const typeCount = normalizedType === "troops" ? daily.harvestedTroopBonuses : daily.harvestedGoldBonuses;
  const typeRemaining = typeLimit - clampInt(typeCount, 0, typeLimit);
  const totalRemaining = HARVEST_BONUS_DAILY_LIMIT - clampInt(daily.harvestedBonuses, 0, HARVEST_BONUS_DAILY_LIMIT);
  return Math.max(0, Math.min(typeRemaining, totalRemaining));
}

function incrementHarvestDailyTracker(type = "gold", daily = {}) {
  const next = normalizeDaily(daily);
  if (type === "troops") {
    next.harvestedTroopBonuses = clampInt(next.harvestedTroopBonuses + 1, 0, HARVEST_BONUS_DAILY_TROOP_LIMIT);
  } else {
    next.harvestedGoldBonuses = clampInt(next.harvestedGoldBonuses + 1, 0, HARVEST_BONUS_DAILY_GOLD_LIMIT);
  }
  next.harvestedBonuses = clampInt(next.harvestedGoldBonuses + next.harvestedTroopBonuses, 0, HARVEST_BONUS_DAILY_LIMIT);
  return next;
}

function getServerNeutralCaptureBlockReason(economy = null, profile = {}, target = {}) {
  if (!economy || getOwnerUid(target) || isStronghold(target)) return "";
  const ownedCityCount = Math.max(0, Math.floor(safeNumber(
    economy.globalStats?.totalCities,
    economy.cityEntries?.filter(entry => entry?.city && !isStronghold(entry.city) && getOwnerUid(entry.city) === economy.uid).length || 0
  )));
  if (ownedCityCount >= NEUTRAL_CITY_COUNT_LIMIT) {
    return `Neutral expansion is capped while you own ${NEUTRAL_CITY_COUNT_LIMIT} or more cities.`;
  }
  const daily = normalizeDaily(profile.daily);
  if (daily.neutralCaptures >= DAILY_NEUTRAL_CAPTURE_LIMIT) {
    return `Daily neutral capture limit reached: ${DAILY_NEUTRAL_CAPTURE_LIMIT}/${DAILY_NEUTRAL_CAPTURE_LIMIT}.`;
  }
  return "";
}

function normalizeHarvestBonusType(type = "gold") {
  return safeString(type, 16) === "troops" ? "troops" : "gold";
}

function normalizeHarvestBonuses(bonuses = [], nowMs = Date.now()) {
  return (Array.isArray(bonuses) ? bonuses : [])
    .map(bonus => {
      const id = safeString(bonus?.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
      const regionId = normalizeRegionId(bonus?.regionId);
      const x = safeNumber(bonus?.x, NaN);
      const y = safeNumber(bonus?.y, NaN);
      const createdAt = Math.max(0, safeNumber(bonus?.createdAt, 0));
      const createdAtMs = timestampToMs(bonus?.createdAtMs) || 0;
      if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        id,
        type: normalizeHarvestBonusType(bonus?.type),
        regionId,
        x: Math.round(x),
        y: Math.round(y),
        createdAt,
        createdAtMs,
      };
    })
    .filter(Boolean)
    .filter(bonus => !bonus.createdAtMs || nowMs - bonus.createdAtMs <= HARVEST_BONUS_EXPIRE_SECONDS * 1000);
}

function enforceHarvestBonusActiveLimit(bonuses = [], nowMs = Date.now()) {
  return normalizeHarvestBonuses(bonuses, nowMs)
    .sort((a, b) => (b.createdAtMs || b.createdAt) - (a.createdAtMs || a.createdAt))
    .slice(0, HARVEST_BONUS_MAX_ACTIVE_PER_PLAYER)
    .sort((a, b) => (a.createdAtMs || a.createdAt) - (b.createdAtMs || b.createdAt));
}

function getHarvestNextSpawnAtMs(profile = {}, nowMs = Date.now()) {
  const explicit = timestampToMs(profile.harvestNextSpawnAtMs);
  if (explicit) return explicit;
  if (Number.isFinite(Number(profile.harvestSpawnTimer))) {
    return nowMs + clampInt(profile.harvestSpawnTimer, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS) * 1000;
  }
  return nowMs + HARVEST_BONUS_SPAWN_INTERVAL_SECONDS * 1000;
}

function getHarvestSpawnTimerFromNextAt(nextSpawnAtMs = 0, nowMs = Date.now()) {
  return clampInt(Math.ceil(Math.max(0, nextSpawnAtMs - nowMs) / 1000), 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS);
}

function createHarvestBonusFromPayload(data = {}, uid = "", nowMs = Date.now()) {
  const bonus = data.bonus && typeof data.bonus === "object" ? data.bonus : data;
  const id = safeString(bonus.id || `harvest-${uid}-${nowMs}`, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const regionId = normalizeRegionId(bonus.regionId || data.regionId);
  const x = safeNumber(bonus.x, NaN);
  const y = safeNumber(bonus.y, NaN);
  if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id,
    type: normalizeHarvestBonusType(bonus.type || data.type),
    regionId,
    x: Math.round(x),
    y: Math.round(y),
    createdAt: Math.max(0, safeNumber(bonus.createdAt, 0)),
    createdAtMs: nowMs,
  };
}

function getPlayerIdentitySyncSignature(identity = {}) {
  return JSON.stringify([
    normalizePlayerName(identity.ownerName),
    normalizeServerFlag(identity.ownerFlag),
    safeString(identity.clanId, 128),
    safeString(identity.clanName, 24),
    safeString(identity.clanTag, 5),
  ]);
}

function createScoutReportSnapshot(target = {}, defenderProfile = null, nowMs = Date.now(), bonuses = {}, statsOverride = null) {
  const stats = statsOverride || getCityStats(target, defenderProfile, bonuses);
  const baseTroopDefense = Math.max(0, Math.floor(safeNumber(target.troops, 0)));
  const troopDefense = Math.floor(baseTroopDefense * (1 + stats.defensePercent / 100));
  const skillSnapshot = {};
  for (const skill of SKILL_ORDER) {
    skillSnapshot[`${skill}Level`] = defenderProfile ? getSkillLevel(defenderProfile, skill) : 0;
    skillSnapshot[`${skill}Percent`] = defenderProfile ? getSkillPercent(defenderProfile, skill) : 0;
  }
  return {
    troops: baseTroopDefense,
    totalDefense: Math.floor(stats.totalDefense),
    baseTotalDefense: Math.floor(stats.baseTotalDefense),
    totalDefenseBonus: Math.floor(stats.totalDefenseBonus),
    owner: getOwnerUid(target) ? "enemy" : "neutral",
    ownerName: getOwnerName(target),
    cityLevel: stats.level,
    defensePercent: stats.defensePercent,
    baseCityWalls: stats.baseCityWalls,
    cityWalls: stats.cityWalls,
    troopDefense,
    cityDefenseBonus: Math.max(0, troopDefense - baseTroopDefense),
    strongholdDefenseBonusPercent: stats.strongholdDefenseBonusPercent,
    strongholdDefenseBonus: stats.strongholdDefenseBonus,
    stoneworksBonus: Math.max(0, stats.cityWalls - stats.baseCityWalls),
    ...skillSnapshot,
    scoutedAtMs: nowMs,
    expiresAtMs: nowMs + SCOUT_REPORT_SECONDS * 1000,
  };
}

function makeReport({
  id,
  uid,
  type,
  outcome,
  city,
  opponentName = "",
  opponentFlag = null,
  summary = "",
  sentTroops = 0,
  troopCount = 0,
  result = {},
  totalDefense = 0,
  defenseStats = null,
  scoutReport = null,
  xpAwarded = 0,
  goldAwarded = 0,
  troopsAwarded = 0,
  characterAfter = null,
  goldAfter = null,
  attackProtection = null,
  defenderXpMultiplierApplied = 1,
  firstProtectedDefenseBonus = false,
  battleId = "",
  fieldMedicsRecovered = 0,
  nowMs = Date.now(),
}) {
  const normalizedTotalDefense = Math.max(0, Math.floor(safeNumber(totalDefense, result.defensePower || 0)));
  const defenseBreakdown = defenseStats || scoutReport;
  const normalizedBaseDefense = Math.min(
    normalizedTotalDefense,
    Math.max(0, Math.floor(safeNumber(defenseBreakdown?.baseTotalDefense, normalizedTotalDefense)))
  );
  return {
    id,
    uid,
    type,
    outcome,
    cityId: safeString(city?.id, 96),
    regionId: safeString(city?.regionId || city?.startPool || "", 80),
    cityName: safeString(city?.name || city?.id || "Unknown city", 40),
    cityLevel: clampCityLevel(city?.level || 1),
    troopCount: Math.max(0, Math.floor(safeNumber(troopCount, city?.troops || 0))),
    sentTroops: Math.max(0, Math.floor(safeNumber(sentTroops, 0))),
    survivors: Math.max(0, Math.floor(safeNumber(result.survivors, 0))),
    defendersLeft: Math.max(0, Math.floor(safeNumber(result.defendersLeft, 0))),
    attackerLosses: Math.max(0, Math.floor(safeNumber(result.attackerLosses, 0))),
    defenderLosses: Math.max(0, Math.floor(safeNumber(result.defenderLosses, 0))),
    totalDefense: normalizedTotalDefense,
    baseTotalDefense: normalizedBaseDefense,
    totalDefenseBonus: Math.max(0, normalizedTotalDefense - normalizedBaseDefense),
    opponentName: normalizePlayerName(opponentName, "Unknown ruler"),
    opponentFlag: normalizeServerFlag(opponentFlag),
    ownerName: normalizePlayerName(city?.ownerName, ""),
    summary: safeString(summary, 220),
    createdAtMs: nowMs,
    resetGeneration: RESET_GENERATION,
    worldId: ONLINE_WORLD_ID,
    scoutReport,
    xpAwarded: Math.max(0, Math.floor(safeNumber(xpAwarded, 0))),
    goldAwarded: Math.max(0, Math.floor(safeNumber(goldAwarded, 0))),
    troopsAwarded: Math.max(0, Math.floor(safeNumber(troopsAwarded, 0))),
    characterAfter,
    goldAfter,
    attackProtection: normalizeAttackProtectionSnapshot(attackProtection),
    defenderXpMultiplierApplied: Math.max(0, safeNumber(defenderXpMultiplierApplied, 1)),
    firstProtectedDefenseBonus: firstProtectedDefenseBonus === true,
    battleId: safeString(battleId, 160),
    battleSnapshotVersion: battleId ? BATTLE_SNAPSHOT_MODEL_VERSION : 0,
    fieldMedicsRecovered: Math.max(0, Math.floor(safeNumber(fieldMedicsRecovered, 0))),
  };
}

function battleClanIdentity(profile = {}) {
  const clanId = safeString(profile.clanId, 128);
  return clanId ? {
    clanId,
    clanName: safeString(profile.clanName, 24),
    clanTag: safeString(profile.clanTag, 5),
  } : null;
}

function createDetailedBattleSnapshot({
  battleId = "",
  armyId = "",
  target = {},
  targetType = "city",
  attackerUid = "",
  attackerProfile = {},
  defenderUid = "",
  defenderProfile = {},
  defenderBonuses = {},
  defensePackages = null,
  allocation = null,
  attackerPackages = [],
  attackerAllocation = [],
  result = {},
  outcome = "",
  nowMs = Date.now(),
} = {}) {
  if (!battleId || !defensePackages) return null;
  const allocationByUid = new Map((allocation?.contributions || []).map(entry => [entry.ownerUid, entry]));
  const ownerLosses = Math.max(0, Math.floor(safeNumber(allocation?.ownerLosses, 0)));
  const ownerTroops = Math.max(0, Math.floor(safeNumber(defensePackages.owner?.troops, 0)));
  const reinforcementRows = (defensePackages.reinforcements || []).map(row => {
    const settled = allocationByUid.get(row.ownerUid) || {};
    return {
      ownerUid: row.ownerUid,
      ownerName: row.ownerName,
      ownerFlag: row.ownerFlag || null,
      reinforcementId: row.reinforcementId,
      startingTroops: row.troops,
      basePower: row.basePower,
      personalDefenseBonusPercent: row.personalBonusPercent,
      sharedDefenseBonusPercent: row.sharedBonusPercent,
      totalDefenseBonusPercent: row.bonusPercent,
      effectivePower: row.effectivePower,
      losses: Math.max(0, Math.floor(safeNumber(settled.losses, 0))),
      survivors: Math.max(0, Math.floor(safeNumber(settled.remaining, row.troops))),
    };
  });
  const rallyAttackers = (Array.isArray(attackerPackages) ? attackerPackages : []).map(row => {
    const settled = (Array.isArray(attackerAllocation) ? attackerAllocation : [])
      .find(entry => entry.uid === row.uid) || {};
    return {
      ownerUid: safeString(row.uid, 128),
      ownerName: normalizePlayerName(row.ownerName, "Ruler"),
      ownerFlag: row.ownerFlag || null,
      role: row.role === "leader" ? "leader" : "ally",
      sourceId: safeString(row.sourceId, 96),
      sourceRegionId: normalizeRegionId(row.sourceRegionId),
      startingTroops: Math.max(0, Math.floor(safeNumber(row.troops, 0))),
      basePower: Math.max(0, Math.floor(safeNumber(row.troops, 0) * BASE_TROOP_ATTACK_POWER)),
      swordmasteryLevel: Math.max(0, Math.floor(safeNumber(row.attackSkillLevel, 0))),
      swordmasteryPercent: Math.max(0, safeNumber(row.attackBonusPercent, 0)),
      effectivePower: Math.max(0, Math.floor(safeNumber(row.effectivePower, 0))),
      losses: Math.max(0, Math.floor(safeNumber(settled.losses, 0))),
      survivors: Math.max(0, Math.floor(safeNumber(settled.survivors, row.troops))),
    };
  });
  const participants = [...new Set([
    safeString(attackerUid, 128),
    safeString(defenderUid, 128),
    ...rallyAttackers.map(row => row.ownerUid),
    ...reinforcementRows.map(row => row.ownerUid),
  ].filter(Boolean))];
  const defendersAtStart = ownerTroops + reinforcementRows.reduce((total, row) => total + row.startingTroops, 0);
  const defenderLosses = Math.max(0, Math.floor(safeNumber(result.defenderLosses, 0)));
  return {
    battleId,
    armyId: safeString(armyId, 96),
    modelVersion: BATTLE_SNAPSHOT_MODEL_VERSION,
    combatModel: "per_owner_reinforcement_stats",
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    participantUids: participants,
    target: {
      id: safeString(target.id, 96),
      name: safeString(target.name || target.id, 80),
      regionId: normalizeRegionId(target.regionId),
      targetType: targetType === "camp" ? "camp" : "city",
      strongholdType: safeString(target.strongholdType, 32),
      level: clampCityLevel(target.level || 1),
      fortifications: {
        cityLevelDefensePercent: defensePackages.owner.cityLevelDefensePercent,
        baseCityWalls: defensePackages.owner.baseCityWalls,
        cityWalls: defensePackages.owner.cityWalls,
        stoneworksPercent: defensePackages.owner.stoneworksPercent,
      },
    },
    attacker: {
      ownerUid: safeString(attackerUid, 128),
      ownerName: normalizePlayerName(attackerProfile.playerName || attackerProfile.displayName, "Rival ruler"),
      ownerFlag: attackerProfile.flag || null,
      clan: battleClanIdentity(attackerProfile),
      startingTroops: Math.max(0, Math.floor(safeNumber(result.attackerLosses, 0)))
        + Math.max(0, Math.floor(safeNumber(result.survivors, 0))),
      basePower: Math.max(0, Math.floor(
        (Math.max(0, safeNumber(result.attackerLosses, 0)) + Math.max(0, safeNumber(result.survivors, 0)))
        * BASE_TROOP_ATTACK_POWER
      )),
      swordmasteryLevel: getSkillLevel(attackerProfile, "swordmastery"),
      swordmasteryPercent: getSkillPercent(attackerProfile, "swordmastery"),
      effectivePower: Math.max(0, Math.floor(safeNumber(result.attackPower, 0))),
      losses: Math.max(0, Math.floor(safeNumber(result.attackerLosses, 0))),
      survivors: Math.max(0, Math.floor(safeNumber(result.survivors, 0))),
    },
    attackers: rallyAttackers,
    defender: {
      ownerUid: safeString(defenderUid, 128),
      ownerName: defensePackages.owner.ownerName,
      ownerFlag: defensePackages.owner.ownerFlag || null,
      clan: battleClanIdentity(defenderProfile),
      startingTroops: ownerTroops,
      basePower: defensePackages.owner.basePower,
      personalDefenseBonusPercent: Math.max(
        0,
        safeNumber(defenderBonuses.personalDefenseBonusPercent, defenderBonuses.cityDefenseBonusPercent)
      ),
      sharedDefenseBonusPercent: Math.max(0, safeNumber(defenderBonuses.sharedDefenseBonusPercent, 0)),
      totalDefenseBonusPercent: defensePackages.owner.bonusPercent,
      effectivePower: defensePackages.owner.effectivePower,
      losses: ownerLosses,
      survivors: Math.max(0, ownerTroops - ownerLosses),
      fortifications: {
        cityLevelDefensePercent: defensePackages.owner.cityLevelDefensePercent,
        baseCityWalls: defensePackages.owner.baseCityWalls,
        cityWalls: defensePackages.owner.cityWalls,
        stoneworksPercent: defensePackages.owner.stoneworksPercent,
      },
    },
    reinforcements: reinforcementRows,
    totals: {
      attackers: Math.max(0, Math.floor(safeNumber(result.attackerLosses, 0)))
        + Math.max(0, Math.floor(safeNumber(result.survivors, 0))),
      defenders: defendersAtStart,
      attackPower: Math.max(0, Math.floor(safeNumber(result.attackPower, 0))),
      defensePower: Math.max(0, Math.floor(safeNumber(result.defensePower, defensePackages.totalDefense))),
      attackerLosses: Math.max(0, Math.floor(safeNumber(result.attackerLosses, 0))),
      defenderLosses,
      attackerSurvivors: Math.max(0, Math.floor(safeNumber(result.survivors, 0))),
      defenderSurvivors: Math.max(0, defendersAtStart - defenderLosses),
    },
    formula: {
      powerRatio: Math.max(0, safeNumber(result.ratio, 0)),
      defenderCasualtyPercent: defendersAtStart > 0 ? defenderLosses * 100 / defendersAtStart : 0,
      captureRequiresAttackPowerAboveDefense: true,
      captureThresholdPower: Math.max(0, Math.floor(safeNumber(result.defensePower, defensePackages.totalDefense))) + 1,
    },
    outcome: safeString(outcome, 24),
    createdAtMs: nowMs,
    createdAt: FieldValue.serverTimestamp(),
  };
}

function writeDetailedBattleSnapshot(transaction, snapshot = null) {
  const ref = battleSnapshotRef(snapshot?.battleId);
  if (!transaction || !ref || !snapshot) return null;
  transaction.set(ref, snapshot, { merge: false });
  return ref;
}

function setNestedScoutReportPatch(cityId, report) {
  return {
    [`scoutReports.${cityId}`]: report,
  };
}

function getBattleReportsArray(profile = {}) {
  return Array.isArray(profile.battleReports) ? profile.battleReports.slice(-119) : [];
}

function buildPlayerProgressPatch(profile = {}, { xp = 0, gold = 0 } = {}) {
  const baseGold = Math.max(0, Math.floor(safeNumber(profile.gold, 0)));
  const xpResult = applyXpToCharacter(profile.character, xp);
  const upgrades = normalizeSkillUpgrades(profile.upgrades);
  const character = reconcileSkillPoints(xpResult.character, upgrades);
  const nextGold = baseGold + Math.max(0, Math.floor(safeNumber(gold, 0))) + xpResult.goldReward;
  return {
    character,
    gold: nextGold,
    goldFloat: nextGold,
    xpAwarded: xpResult.xp,
    goldAwarded: Math.max(0, Math.floor(safeNumber(gold, 0))) + xpResult.goldReward,
    levelTroopReward: xpResult.troopReward,
  };
}

function writeReport(transaction, uid, report, profileSnap = null, extraProfilePatch = {}) {
  if (!uid || !report?.id) return;
  const profileRef = db.doc(`players/${uid}`);
  const profile = profileSnap?.exists ? profileSnap.data() || {} : {};
  const nextReports = [...getBattleReportsArray(profile), report].slice(-120);
  transaction.set(reportRef(uid, report.id), {
    ...report,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  transaction.set(profileRef, {
    battleReports: nextReports,
    updatedAt: FieldValue.serverTimestamp(),
    ...extraProfilePatch,
  }, { merge: true });
}

function writeScoutReport(transaction, uid, cityId, report, profileSnap = null, extraProfilePatch = {}) {
  const profileRef = db.doc(`players/${uid}`);
  transaction.set(profileRef, {
    ...setNestedScoutReportPatch(cityId, report),
    updatedAt: FieldValue.serverTimestamp(),
    ...extraProfilePatch,
  }, { merge: true });
}

function dropCapturedCityLevel(city = {}) {
  if (isStronghold(city)) return clampCityLevel(city.level);
  return Math.max(1, clampCityLevel(city.level) - 1);
}

function cleanCityUpdate(city = {}, patch = {}) {
  const merged = { ...city, ...patch };
  const cityId = safeString(merged.id, 96);
  const regionId = normalizeRegionId(merged.regionId || merged.startPool);
  const shouldCanonicalizeName = cityId
    && !isStronghold(merged)
    && getServerWorldRegularCityIds(regionId).has(cityId);
  return {
    ...patch,
    ...(shouldCanonicalizeName
      ? { name: getServerCanonicalCityName(merged, regionId) }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function getProfileSnapshots(transaction, uids) {
  const uniqueUids = [...new Set(uids.filter(Boolean))];
  const entries = [];
  for (const uid of uniqueUids) {
    const ref = db.doc(`players/${uid}`);
    const snap = await transaction.get(ref);
    entries.push([uid, { ref, snap, data: snap.exists ? snap.data() || {} : {} }]);
  }
  return new Map(entries);
}

async function getGlobalStatsSnapshots(transaction, uids) {
  const uniqueUids = [...new Set((Array.isArray(uids) ? uids : []).filter(Boolean))];
  const entries = [];
  for (const uid of uniqueUids) {
    const ref = playerGlobalStatsRef(uid);
    const snap = await transaction.get(ref);
    entries.push([uid, snap.exists ? snap.data() || {} : {}]);
  }
  return new Map(entries);
}

function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  return Math.max(0, Math.floor(safeNumber(value, 0)));
}

function getProfileLastSeenMs(profile = {}) {
  return Math.max(
    timestampToMs(profile.economyUpdatedAtMs),
    timestampToMs(profile.lastSeenAtMs),
    timestampToMs(profile.lastRealTimeMs),
    timestampToMs(profile.updatedAt)
  );
}

function getRegionIdFromOnlineIslandId(islandId = "") {
  const raw = String(islandId || "");
  const prefix = `${ONLINE_WORLD_ID}-`;
  if (raw.startsWith(prefix)) return normalizeRegionId(raw.slice(prefix.length));
  const parts = raw.split("-");
  return normalizeRegionId(parts[parts.length - 1] || raw);
}

function getRegionIdFromCityDoc(doc = null, data = {}) {
  const rawStored = data.regionId || data.startPool || "";
  if (rawStored) return normalizeRegionId(rawStored);
  const islandId = doc?.ref?.parent?.parent?.id || "";
  return getRegionIdFromOnlineIslandId(islandId);
}

function createDefaultShopItems() {
  return Object.keys(SHOP_ITEMS).reduce((items, itemId) => {
    items[itemId] = 0;
    return items;
  }, {});
}

function normalizeShopItems(items = {}) {
  const normalized = createDefaultShopItems();
  if (!items || typeof items !== "object") return normalized;
  Object.keys(SHOP_ITEMS).forEach(itemId => {
    normalized[itemId] = Math.max(0, Math.floor(safeNumber(items[itemId], 0)));
  });
  mergeLegacyShopItemCount(items, normalized, WAR_DRUMS_ITEM_ID, "troop_boost_1h");
  mergeLegacyShopItemCount(items, normalized, VEIL_OF_SILENCE_ITEM_ID, "anti_scout_1h");
  return normalized;
}

function mergeLegacyShopItemCount(items, normalized, canonicalId, legacyId) {
  const hasCanonicalCount = Object.prototype.hasOwnProperty.call(items, canonicalId);
  const legacyCount = Math.max(0, Math.floor(safeNumber(items[legacyId], 0)));
  const hasLegacyCount = legacyCount > 0 && Object.prototype.hasOwnProperty.call(items, legacyId);
  if (!hasCanonicalCount && Number.isFinite(Number(items[legacyId]))) {
    normalized[canonicalId] = legacyCount;
  } else if (hasLegacyCount) {
    normalized[canonicalId] = Math.min(normalized[canonicalId], legacyCount);
  }
}

function addLegacyShopItemDeletes(patch = {}) {
  LEGACY_SHOP_ITEM_IDS.forEach(itemId => {
    patch[`shopItems.${itemId}`] = FieldValue.delete();
  });
  return patch;
}

function normalizeItemEffects(effects = {}) {
  return {
    shieldExpiresAtMs: timestampToMs(effects.shieldExpiresAtMs || effects.shieldExpiresAt),
    warDrumsExpiresAtMs: timestampToMs(effects.warDrumsExpiresAtMs || effects.warDrumsExpiresAt || effects.troopBoostExpiresAtMs || effects.troopBoostExpiresAt),
    royalTaxDecreeExpiresAtMs: timestampToMs(effects.royalTaxDecreeExpiresAtMs || effects.royalTaxDecreeExpiresAt),
    veilOfSilenceExpiresAtMs: timestampToMs(effects.veilOfSilenceExpiresAtMs || effects.veilOfSilenceExpiresAt || effects.antiScoutExpiresAtMs || effects.antiScoutExpiresAt),
  };
}

function isVeilOfSilenceActive(profile = {}, nowMs = Date.now()) {
  return timestampToMs(
    profile?.itemEffects?.veilOfSilenceExpiresAtMs ||
    profile?.itemEffects?.veilOfSilenceExpiresAt ||
    profile?.itemEffects?.antiScoutExpiresAtMs ||
    profile?.itemEffects?.antiScoutExpiresAt
  ) > nowMs;
}

function doesVeilOfSilenceBlock(kind = "", targetType = "city") {
  return kind === "scout" && targetType !== "camp";
}

function normalizeItemPurchaseTimestamps(value = {}) {
  const rawTimestamps = Array.isArray(value?.purchaseTimestampsMs)
    ? value.purchaseTimestampsMs
    : Array.isArray(value?.purchaseTimestamps)
      ? value.purchaseTimestamps
      : [];
  return rawTimestamps
    .map(timestampToMs)
    .filter(timestamp => timestamp > 0)
    .sort((a, b) => a - b)
    .slice(-MAX_ITEM_DAILY_PURCHASE_LIMIT);
}

function getNextUtcDayStartMs(nowMs = Date.now()) {
  const date = new Date(Math.max(0, safeNumber(nowMs, Date.now())));
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function normalizeDailyLoginRewardReceipt(raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  const day = clampInt(raw.day, 1, DAILY_LOGIN_REWARD_CYCLE_DAYS);
  const cycle = Math.max(1, Math.floor(safeNumber(raw.cycle, 1)));
  const dayKey = safeString(raw.dayKey, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const items = Object.fromEntries(
    Object.entries(raw.items || {})
      .filter(([itemId, quantity]) => SHOP_ITEMS[itemId] && Number(quantity) > 0)
      .map(([itemId, quantity]) => [itemId, Math.max(1, Math.floor(safeNumber(quantity, 1)))])
  );
  return {
    cycle,
    day,
    ordinal: Math.max(1, Math.floor(safeNumber(raw.ordinal, ((cycle - 1) * DAILY_LOGIN_REWARD_CYCLE_DAYS) + day))),
    claimId: safeString(raw.claimId, 96),
    dayKey,
    claimedAtMs: Math.max(0, timestampToMs(raw.claimedAtMs || raw.claimedAt)),
    goldHours: Math.max(0, safeNumber(raw.goldHours, 0)),
    troopHours: Math.max(0, safeNumber(raw.troopHours, 0)),
    gold: Math.max(0, Math.floor(safeNumber(raw.gold, 0))),
    troops: Math.max(0, Math.floor(safeNumber(raw.troops, 0))),
    items,
    targetCityId: safeString(raw.targetCityId, 96),
  };
}

function getDailyLoginRewardOrdinal(cycle = 1, day = 1) {
  const safeCycle = Math.max(1, Math.floor(safeNumber(cycle, 1)));
  const safeDay = clampInt(day, 1, DAILY_LOGIN_REWARD_CYCLE_DAYS);
  return ((safeCycle - 1) * DAILY_LOGIN_REWARD_CYCLE_DAYS) + safeDay;
}

function getDailyLoginRewardPosition(ordinal = 1) {
  const safeOrdinal = Math.max(1, Math.floor(safeNumber(ordinal, 1)));
  return {
    ordinal: safeOrdinal,
    cycle: Math.floor((safeOrdinal - 1) / DAILY_LOGIN_REWARD_CYCLE_DAYS) + 1,
    day: ((safeOrdinal - 1) % DAILY_LOGIN_REWARD_CYCLE_DAYS) + 1,
  };
}

function getDailyLoginRewardPendingCount(rawState = {}) {
  const state = normalizeDailyLoginRewardState(rawState);
  return Math.max(0, state.earnedThroughOrdinal - state.nextClaimOrdinal + 1);
}

function normalizeDailyLoginRewardState(raw = {}) {
  const legacyCycle = Math.max(1, Math.floor(safeNumber(raw?.cycle, 1)));
  const legacyNextDay = clampInt(raw?.nextDay, 1, DAILY_LOGIN_REWARD_CYCLE_DAYS);
  const legacyNextOrdinal = getDailyLoginRewardOrdinal(legacyCycle, legacyNextDay);
  const nextClaimOrdinal = Math.max(1, Math.floor(safeNumber(raw?.nextClaimOrdinal, legacyNextOrdinal)));
  const rawEarnedThroughOrdinal = Object.prototype.hasOwnProperty.call(raw || {}, "earnedThroughOrdinal")
    ? safeNumber(raw?.earnedThroughOrdinal, nextClaimOrdinal - 1)
    : nextClaimOrdinal - 1;
  const earnedThroughOrdinal = Math.min(
    nextClaimOrdinal + DAILY_LOGIN_REWARD_MAX_PENDING - 1,
    Math.max(nextClaimOrdinal - 1, Math.floor(rawEarnedThroughOrdinal))
  );
  const nextPosition = getDailyLoginRewardPosition(nextClaimOrdinal);
  const lastClaimDayKey = safeString(raw?.lastClaimDayKey, 10);
  const lastAttendanceDayKey = safeString(
    raw?.lastAttendanceDayKey || (Number(raw?.schemaVersion) < DAILY_LOGIN_REWARD_SCHEMA_VERSION ? lastClaimDayKey : ""),
    10
  );
  const deferredAttendanceDayKey = safeString(raw?.deferredAttendanceDayKey, 10);
  return {
    schemaVersion: DAILY_LOGIN_REWARD_SCHEMA_VERSION,
    cycle: nextPosition.cycle,
    nextDay: nextPosition.day,
    nextClaimOrdinal,
    earnedThroughOrdinal,
    totalClaims: Math.max(0, Math.floor(safeNumber(raw?.totalClaims, 0))),
    lastAttendanceDayKey: /^\d{4}-\d{2}-\d{2}$/.test(lastAttendanceDayKey) ? lastAttendanceDayKey : "",
    deferredAttendanceDayKey: /^\d{4}-\d{2}-\d{2}$/.test(deferredAttendanceDayKey)
      ? deferredAttendanceDayKey
      : "",
    lastClaimDayKey: /^\d{4}-\d{2}-\d{2}$/.test(lastClaimDayKey) ? lastClaimDayKey : "",
    lastClaimedAtMs: Math.max(0, timestampToMs(raw?.lastClaimedAtMs || raw?.lastClaimedAt)),
    lastClaimRequestId: safeString(raw?.lastClaimRequestId, 96),
    lastReceipt: normalizeDailyLoginRewardReceipt(raw?.lastReceipt),
  };
}

function createDefaultDailyLoginRewardState() {
  return normalizeDailyLoginRewardState({});
}

function syncDailyLoginRewardAttendance(rawState = {}, nowMs = Date.now()) {
  const sourceVersion = Math.max(0, Math.floor(safeNumber(rawState?.schemaVersion, 0)));
  const serverTimeMs = Math.max(0, Math.floor(safeNumber(nowMs, Date.now())));
  const dayKey = getCurrentDateKey(new Date(serverTimeMs));
  const state = normalizeDailyLoginRewardState(rawState);
  let changed = sourceVersion !== DAILY_LOGIN_REWARD_SCHEMA_VERSION;

  if (state.deferredAttendanceDayKey && state.deferredAttendanceDayKey !== dayKey) {
    state.deferredAttendanceDayKey = "";
    changed = true;
  }

  let pendingCount = getDailyLoginRewardPendingCount(state);
  if (state.lastAttendanceDayKey !== dayKey) {
    state.lastAttendanceDayKey = dayKey;
    changed = true;
    if (pendingCount < DAILY_LOGIN_REWARD_MAX_PENDING) {
      state.earnedThroughOrdinal += 1;
      pendingCount += 1;
    } else {
      state.deferredAttendanceDayKey = dayKey;
    }
  }

  if (
    state.deferredAttendanceDayKey === dayKey
    && pendingCount < DAILY_LOGIN_REWARD_MAX_PENDING
  ) {
    state.earnedThroughOrdinal += 1;
    state.deferredAttendanceDayKey = "";
    changed = true;
  }

  return {
    state: normalizeDailyLoginRewardState(state),
    changed,
    dayKey,
    serverTimeMs,
  };
}

function createDailyLoginRewardStatus(rawState = {}, nowMs = Date.now()) {
  const state = normalizeDailyLoginRewardState(rawState);
  const serverTimeMs = Math.max(0, Math.floor(safeNumber(nowMs, Date.now())));
  const dayKey = getCurrentDateKey(new Date(serverTimeMs));
  const pendingCount = getDailyLoginRewardPendingCount(state);
  const attendedToday = state.lastAttendanceDayKey === dayKey;
  const claimedToday = state.lastClaimDayKey === dayKey;
  const earnedPosition = state.earnedThroughOrdinal >= state.nextClaimOrdinal
    ? getDailyLoginRewardPosition(state.earnedThroughOrdinal)
    : null;
  return {
    ...state,
    eligible: pendingCount > 0,
    pendingCount,
    queuedCount: Math.max(0, pendingCount - 1),
    maxPendingRewards: DAILY_LOGIN_REWARD_MAX_PENDING,
    attendedToday,
    attendanceDeferred: state.deferredAttendanceDayKey === dayKey,
    claimedToday,
    earnedThroughCycle: earnedPosition?.cycle || state.cycle,
    earnedThroughDay: earnedPosition?.day || Math.max(0, state.nextDay - 1),
    dayKey,
    serverTimeMs,
    nextUtcUnlockAtMs: attendedToday ? getNextUtcDayStartMs(serverTimeMs) : 0,
    cycleLengthDays: DAILY_LOGIN_REWARD_CYCLE_DAYS,
  };
}

function assertCurrentPlayerProfile(profile = {}) {
  if (
    safeString(profile.resetGeneration, 120) !== RESET_GENERATION
    || safeString(profile.worldId, 120) !== ONLINE_WORLD_ID
  ) {
    throw new HttpsError("failed-precondition", "Enter the current Crownlands world before claiming a daily reward.");
  }
}

function normalizeDailyItemPurchaseCounter(value = {}, limit = 0) {
  const safeLimit = Math.max(0, Math.floor(safeNumber(limit, 0)));
  const explicitDate = safeString(value?.utcDate || value?.date, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return {
      utcDate: explicitDate,
      purchaseCount: Math.min(safeLimit, Math.max(0, Math.floor(safeNumber(value?.purchaseCount ?? value?.count, 0)))),
    };
  }

  const legacyTimestamps = normalizeItemPurchaseTimestamps(value);
  const lastPurchasedAtMs = timestampToMs(value?.lastPurchasedAtMs || value?.lastPurchasedAt);
  if (lastPurchasedAtMs > 0) legacyTimestamps.push(lastPurchasedAtMs);
  if (!legacyTimestamps.length) return { utcDate: "", purchaseCount: 0 };

  const latestPurchaseAtMs = Math.max(...legacyTimestamps);
  const utcDate = getUtcDateKey(latestPurchaseAtMs);
  const purchaseCount = legacyTimestamps.filter(timestamp => getUtcDateKey(timestamp) === utcDate).length;
  return {
    utcDate,
    purchaseCount: Math.min(safeLimit, purchaseCount),
  };
}

function getItemDailyPurchaseLimit(itemId) {
  return Math.max(0, Math.floor(safeNumber(ITEM_DAILY_PURCHASE_LIMITS[itemId], 0)));
}

function normalizeItemPurchaseCooldowns(cooldowns = {}) {
  const normalized = Object.fromEntries(
    Object.keys(ITEM_DAILY_PURCHASE_LIMITS)
      .map(itemId => [itemId, { utcDate: "", purchaseCount: 0 }])
  );
  Object.keys(ITEM_DAILY_PURCHASE_LIMITS).forEach(itemId => {
    normalized[itemId] = normalizeDailyItemPurchaseCounter(
      cooldowns?.[itemId],
      getItemDailyPurchaseLimit(itemId)
    );
  });
  return normalized;
}

function getItemPurchaseStatus(itemId, cooldowns = {}, nowMs = Date.now()) {
  const limit = getItemDailyPurchaseLimit(itemId);
  const currentTime = Math.max(0, safeNumber(nowMs, Date.now()));
  const utcDate = getUtcDateKey(currentTime);
  if (limit <= 0) return { count: 0, limit: 0, remainingMs: 0, utcDate };
  const counter = normalizeDailyItemPurchaseCounter(cooldowns?.[itemId], limit);
  const count = counter.utcDate === utcDate ? Math.min(limit, counter.purchaseCount) : 0;
  return {
    count,
    limit,
    remainingMs: count >= limit ? Math.max(0, getNextUtcDayStartMs(currentTime) - currentTime) : 0,
    utcDate,
  };
}

function formatCooldownMs(ms) {
  const totalSeconds = Math.max(0, Math.ceil(safeNumber(ms, 0) / 1000));
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  }
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }
  return `${totalSeconds}s`;
}

function emptyObjectiveBonuses() {
  return {
    goldBonusPercent: 0,
    troopBonusPercent: 0,
    marchSpeedBonusPercent: 0,
    cityDefenseBonusPercent: 0,
    upgradeCostReductionPercent: 0,
  };
}

function calculateDefenderArmyPackages({
  target = {},
  targetType = "city",
  ownerProfile = {},
  ownerBonuses = {},
  contributions = [],
  contributorProfiles = new Map(),
  contributorStats = new Map(),
} = {}) {
  const ownerTroops = getTargetOwnerTroops(target, targetType);
  const ownerTarget = {
    ...target,
    troops: ownerTroops,
    troopFloat: ownerTroops,
    alliedReinforcementTroops: 0,
  };
  const ownerStats = getCityStats(ownerTarget, ownerProfile, ownerBonuses);
  const ownerPackage = {
    ownerUid: safeString(getOwnerUid(target), 128),
    ownerName: normalizePlayerName(getOwnerName(target) || ownerProfile.playerName, "Neutral defenders"),
    ownerFlag: ownerProfile.flag || target.ownerFlag || null,
    troops: ownerTroops,
    basePower: Math.max(0, ownerStats.totalDefense - ownerStats.strongholdDefenseBonus),
    bonusPercent: Math.max(0, safeNumber(ownerStats.strongholdDefenseBonusPercent, 0)),
    effectivePower: Math.max(0, Math.floor(safeNumber(ownerStats.totalDefense, 0))),
    cityLevelDefensePercent: Math.max(0, safeNumber(ownerStats.defensePercent, 0)),
    baseCityWalls: Math.max(0, Math.floor(safeNumber(ownerStats.baseCityWalls, 0))),
    cityWalls: Math.max(0, Math.floor(safeNumber(ownerStats.cityWalls, 0))),
    stoneworksPercent: Math.max(0, safeNumber(ownerStats.stoneworksPercent, 0)),
  };
  const reinforcementPackages = (Array.isArray(contributions) ? contributions : []).map(contribution => {
    const profile = contributorProfiles.get(contribution.ownerUid) || {};
    const stats = contributorStats.get(contribution.ownerUid) || {};
    const troops = Math.max(0, Math.floor(safeNumber(contribution.troops, 0)));
    const bonusPercent = Math.max(0, safeNumber(stats.strongholdDefenseBonusPercent, 0));
    return {
      reinforcementId: contribution.id,
      ownerUid: safeString(contribution.ownerUid, 128),
      ownerName: normalizePlayerName(profile.playerName || contribution.ownerName, "Ruler"),
      ownerFlag: profile.flag || contribution.ownerFlag || null,
      troops,
      basePower: troops,
      bonusPercent,
      personalBonusPercent: Math.max(0, safeNumber(stats.personalStrongholdDefenseBonusPercent, bonusPercent)),
      sharedBonusPercent: Math.max(0, safeNumber(stats.sharedClanDefenseBonusPercent, 0)),
      effectivePower: Math.max(0, Math.floor(troops * (1 + bonusPercent / 100))),
    };
  }).filter(row => row.ownerUid && row.troops > 0);
  return {
    owner: ownerPackage,
    reinforcements: reinforcementPackages,
    totalDefense: Math.max(
      0,
      ownerPackage.effectivePower
        + reinforcementPackages.reduce((total, row) => total + row.effectivePower, 0)
    ),
  };
}

function normalizeObjectiveBonuses(value = {}) {
  return {
    goldBonusPercent: Math.max(0, safeNumber(value.goldBonusPercent, 0)),
    troopBonusPercent: Math.max(0, safeNumber(value.troopBonusPercent, 0)),
    marchSpeedBonusPercent: Math.max(0, safeNumber(value.marchSpeedBonusPercent, 0)),
    cityDefenseBonusPercent: Math.max(0, safeNumber(value.cityDefenseBonusPercent, 0)),
    upgradeCostReductionPercent: Math.max(0, safeNumber(value.upgradeCostReductionPercent, 0)),
  };
}

function addObjectiveBonuses(left = {}, right = {}) {
  const first = normalizeObjectiveBonuses(left);
  const second = normalizeObjectiveBonuses(right);
  return {
    goldBonusPercent: first.goldBonusPercent + second.goldBonusPercent,
    troopBonusPercent: first.troopBonusPercent + second.troopBonusPercent,
    marchSpeedBonusPercent: first.marchSpeedBonusPercent + second.marchSpeedBonusPercent,
    cityDefenseBonusPercent: first.cityDefenseBonusPercent + second.cityDefenseBonusPercent,
    upgradeCostReductionPercent: first.upgradeCostReductionPercent + second.upgradeCostReductionPercent,
  };
}

function subtractObjectiveBonuses(left = {}, right = {}) {
  const first = normalizeObjectiveBonuses(left);
  const second = normalizeObjectiveBonuses(right);
  return {
    goldBonusPercent: Math.max(0, first.goldBonusPercent - second.goldBonusPercent),
    troopBonusPercent: Math.max(0, first.troopBonusPercent - second.troopBonusPercent),
    marchSpeedBonusPercent: Math.max(0, first.marchSpeedBonusPercent - second.marchSpeedBonusPercent),
    cityDefenseBonusPercent: Math.max(0, first.cityDefenseBonusPercent - second.cityDefenseBonusPercent),
    upgradeCostReductionPercent: Math.max(0, first.upgradeCostReductionPercent - second.upgradeCostReductionPercent),
  };
}

function scaleObjectiveBonuses(value = {}, multiplier = 1) {
  const bonuses = normalizeObjectiveBonuses(value);
  const scale = Math.max(0, safeNumber(multiplier, 0));
  return {
    goldBonusPercent: bonuses.goldBonusPercent * scale,
    troopBonusPercent: bonuses.troopBonusPercent * scale,
    marchSpeedBonusPercent: bonuses.marchSpeedBonusPercent * scale,
    cityDefenseBonusPercent: bonuses.cityDefenseBonusPercent * scale,
    upgradeCostReductionPercent: bonuses.upgradeCostReductionPercent * scale,
  };
}

function objectiveBonusForCity(city = {}, multiplier = 1) {
  const scale = Math.max(0, safeNumber(multiplier, 0));
  if (isCrownCitadel(city)) {
    return {
      goldBonusPercent: CROWN_CITADEL_GOLD_BONUS_PERCENT * scale,
      troopBonusPercent: CROWN_CITADEL_TROOP_BONUS_PERCENT * scale,
      marchSpeedBonusPercent: CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT * scale,
      cityDefenseBonusPercent: CROWN_CITADEL_DEFENSE_BONUS_PERCENT * scale,
      upgradeCostReductionPercent: CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT * scale,
    };
  }
  const bonuses = emptyObjectiveBonuses();
  if (isGoldStronghold(city)) bonuses.goldBonusPercent += getStrongholdBonusPercent(city) * scale;
  if (isTrainingStronghold(city)) bonuses.troopBonusPercent += getStrongholdBonusPercent(city) * scale;
  if (isSpeedStronghold(city)) bonuses.marchSpeedBonusPercent += getStrongholdBonusPercent(city) * scale;
  if (isDefenseStronghold(city)) bonuses.cityDefenseBonusPercent += getStrongholdBonusPercent(city) * scale;
  return bonuses;
}

function getOwnedStrongholdBonuses(cities = []) {
  const ownedCities = (Array.isArray(cities) ? cities : []).map(entry => entry?.city || entry).filter(Boolean);
  const ownsCrownCitadel = ownedCities.some(isCrownCitadel);
  if (ownsCrownCitadel) {
    return {
      source: "crown_citadel",
      crownCitadelControlled: true,
      goldBonusPercent: CROWN_CITADEL_GOLD_BONUS_PERCENT,
      troopBonusPercent: CROWN_CITADEL_TROOP_BONUS_PERCENT,
      marchSpeedBonusPercent: CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT,
      cityDefenseBonusPercent: CROWN_CITADEL_DEFENSE_BONUS_PERCENT,
      upgradeCostReductionPercent: CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT,
      personalGoldBonusPercent: CROWN_CITADEL_GOLD_BONUS_PERCENT,
      personalTroopBonusPercent: CROWN_CITADEL_TROOP_BONUS_PERCENT,
      personalMarchSpeedBonusPercent: CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT,
      personalDefenseBonusPercent: CROWN_CITADEL_DEFENSE_BONUS_PERCENT,
      personalUpgradeCostReductionPercent: CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT,
      sharedGoldBonusPercent: 0,
      sharedTroopBonusPercent: 0,
      sharedMarchSpeedBonusPercent: 0,
      sharedDefenseBonusPercent: 0,
      sharedUpgradeCostReductionPercent: 0,
      clanCitadelBonusPercent: 0,
      clanObjectiveBenefitRevision: 0,
    };
  }
  return cities.reduce((bonuses, entry) => {
    const city = entry?.city || entry;
    if (!city) return bonuses;
    if (isGoldStronghold(city)) bonuses.goldBonusPercent += getStrongholdBonusPercent(city);
    if (isTrainingStronghold(city)) bonuses.troopBonusPercent += getStrongholdBonusPercent(city);
    if (isSpeedStronghold(city)) bonuses.marchSpeedBonusPercent += getStrongholdBonusPercent(city);
    if (isDefenseStronghold(city)) bonuses.cityDefenseBonusPercent += getStrongholdBonusPercent(city);
    bonuses.personalGoldBonusPercent = bonuses.goldBonusPercent;
    bonuses.personalTroopBonusPercent = bonuses.troopBonusPercent;
    bonuses.personalMarchSpeedBonusPercent = bonuses.marchSpeedBonusPercent;
    bonuses.personalDefenseBonusPercent = bonuses.cityDefenseBonusPercent;
    return bonuses;
  }, {
    source: "individual",
    crownCitadelControlled: false,
    goldBonusPercent: 0,
    troopBonusPercent: 0,
    marchSpeedBonusPercent: 0,
    cityDefenseBonusPercent: 0,
    upgradeCostReductionPercent: 0,
    personalGoldBonusPercent: 0,
    personalTroopBonusPercent: 0,
    personalMarchSpeedBonusPercent: 0,
    personalDefenseBonusPercent: 0,
    personalUpgradeCostReductionPercent: 0,
    sharedGoldBonusPercent: 0,
    sharedTroopBonusPercent: 0,
    sharedMarchSpeedBonusPercent: 0,
    sharedDefenseBonusPercent: 0,
    sharedUpgradeCostReductionPercent: 0,
    clanCitadelBonusPercent: 0,
    clanObjectiveBenefitRevision: 0,
  });
}

function getLiveClanBenefitIntegrals(benefits = {}, nowMs = Date.now()) {
  const lastIntegratedAtMs = Math.max(0, timestampToMs(benefits.lastIntegratedAtMs));
  const elapsedMs = Math.max(0, nowMs - lastIntegratedAtMs);
  const shared = normalizeObjectiveBonuses(benefits.sharedBonuses);
  return {
    goldPercentMs: Math.max(0, safeNumber(benefits.cumulativeGoldPercentMs, 0))
      + shared.goldBonusPercent * elapsedMs,
    troopPercentMs: Math.max(0, safeNumber(benefits.cumulativeTroopPercentMs, 0))
      + shared.troopBonusPercent * elapsedMs,
    atMs: nowMs,
  };
}

function clanBenefitAccrualBaseline(benefits = {}, clanId = "", nowMs = Date.now()) {
  const integrals = getLiveClanBenefitIntegrals(benefits, nowMs);
  return {
    modelVersion: CLAN_OBJECTIVE_BENEFIT_MODEL_VERSION,
    resetGeneration: RESET_GENERATION,
    clanId: safeString(clanId, 128),
    goldPercentMs: integrals.goldPercentMs,
    troopPercentMs: integrals.troopPercentMs,
    checkpointAtMs: nowMs,
  };
}

function buildClanBenefitExitPatch(profile = {}, benefits = {}, clanId = "", nowMs = Date.now()) {
  const live = getLiveClanBenefitIntegrals(benefits, nowMs);
  const accrual = profile.clanObjectiveAccrual && typeof profile.clanObjectiveAccrual === "object"
    ? profile.clanObjectiveAccrual
    : {};
  const matching = safeString(accrual.clanId, 128) === safeString(clanId, 128)
    && safeString(accrual.resetGeneration, 120) === RESET_GENERATION;
  const pending = profile.pendingClanObjectiveAccrual && typeof profile.pendingClanObjectiveAccrual === "object"
    ? profile.pendingClanObjectiveAccrual
    : {};
  return {
    clanObjectiveAccrual: FieldValue.delete(),
    pendingClanObjectiveAccrual: {
      resetGeneration: RESET_GENERATION,
      goldPercentMs: Math.max(0, safeNumber(pending.goldPercentMs, 0))
        + (matching ? Math.max(0, live.goldPercentMs - safeNumber(accrual.goldPercentMs, live.goldPercentMs)) : 0),
      troopPercentMs: Math.max(0, safeNumber(pending.troopPercentMs, 0))
        + (matching ? Math.max(0, live.troopPercentMs - safeNumber(accrual.troopPercentMs, live.troopPercentMs)) : 0),
      citadelControllerUid: safeString(benefits.citadelControllerUid, 128),
      endedAtMs: nowMs,
    },
  };
}

function combinePlayerObjectiveBonuses(uid = "", ownedEntries = [], benefits = null) {
  const playerUid = safeString(uid, 128);
  const ownedCities = (Array.isArray(ownedEntries) ? ownedEntries : [])
    .map(entry => entry?.city || entry)
    .filter(city => city && isStronghold(city));
  if (!benefits || safeString(benefits.resetGeneration, 120) !== RESET_GENERATION) {
    return getOwnedStrongholdBonuses(ownedEntries);
  }

  const clanCitadelControllerUid = safeString(benefits.citadelControllerUid, 128);
  const ownsClanCitadel = Boolean(clanCitadelControllerUid && clanCitadelControllerUid === playerUid);
  const nonCitadelOwned = ownedCities.filter(city => !isCrownCitadel(city));
  const fullPersonalStrongholds = nonCitadelOwned.reduce(
    (bonuses, city) => addObjectiveBonuses(bonuses, objectiveBonusForCity(city)),
    emptyObjectiveBonuses()
  );
  const halfPersonalStrongholds = scaleObjectiveBonuses(fullPersonalStrongholds, CLAN_SHARED_OBJECTIVE_MULTIPLIER);
  const citadelPersonal = ownsClanCitadel
    ? objectiveBonusForCity(ownedCities.find(isCrownCitadel) || { id: CROWN_CITADEL_ID, kind: "stronghold", strongholdType: "crown_citadel" })
    : emptyObjectiveBonuses();
  const personal = ownsClanCitadel
    ? addObjectiveBonuses(citadelPersonal, halfPersonalStrongholds)
    : fullPersonalStrongholds;
  const rawShared = normalizeObjectiveBonuses(benefits.sharedBonuses);
  const shared = ownsClanCitadel
    ? emptyObjectiveBonuses()
    : clanCitadelControllerUid
      ? rawShared
      : subtractObjectiveBonuses(rawShared, halfPersonalStrongholds);
  const total = addObjectiveBonuses(personal, shared);
  return {
    source: clanCitadelControllerUid ? "clan_crown_citadel" : "clan_objectives",
    crownCitadelControlled: ownsClanCitadel,
    ...total,
    personalGoldBonusPercent: personal.goldBonusPercent,
    personalTroopBonusPercent: personal.troopBonusPercent,
    personalMarchSpeedBonusPercent: personal.marchSpeedBonusPercent,
    personalDefenseBonusPercent: personal.cityDefenseBonusPercent,
    personalUpgradeCostReductionPercent: personal.upgradeCostReductionPercent,
    sharedGoldBonusPercent: shared.goldBonusPercent,
    sharedTroopBonusPercent: shared.troopBonusPercent,
    sharedMarchSpeedBonusPercent: shared.marchSpeedBonusPercent,
    sharedDefenseBonusPercent: shared.cityDefenseBonusPercent,
    sharedUpgradeCostReductionPercent: shared.upgradeCostReductionPercent,
    clanCitadelBonusPercent: clanCitadelControllerUid
      ? ownsClanCitadel ? CROWN_CITADEL_GOLD_BONUS_PERCENT : CROWN_CITADEL_GOLD_BONUS_PERCENT * CLAN_SHARED_OBJECTIVE_MULTIPLIER
      : 0,
    clanObjectiveBenefitRevision: Math.max(0, Math.floor(safeNumber(benefits.revision, 0))),
  };
}

async function resolvePlayerObjectiveBenefits(
  transaction,
  uid = "",
  profile = {},
  ownedEntries = [],
  nowMs = Date.now(),
  elapsedMs = 0
) {
  const clanId = safeString(profile.clanId, 128);
  const pending = safeString(profile.pendingClanObjectiveAccrual?.resetGeneration, 120) === RESET_GENERATION
    ? profile.pendingClanObjectiveAccrual
    : {};
  const pendingGoldPercentMs = Math.max(0, safeNumber(pending.goldPercentMs, 0));
  const pendingTroopPercentMs = Math.max(0, safeNumber(pending.troopPercentMs, 0));
  const benefitsRef = clanWorldBenefitsRef(clanId);
  const benefitsSnap = benefitsRef ? await transaction.get(benefitsRef) : null;
  const benefits = benefitsSnap?.exists ? benefitsSnap.data() || {} : null;
  const currentBonuses = combinePlayerObjectiveBonuses(uid, ownedEntries, benefits);
  let accruedGoldPercentMs = pendingGoldPercentMs;
  let accruedTroopPercentMs = pendingTroopPercentMs;
  let nextAccrual = FieldValue.delete();

  if (clanId && benefits && benefits.status !== "inactive") {
    const live = getLiveClanBenefitIntegrals(benefits, nowMs);
    const accrual = profile.clanObjectiveAccrual && typeof profile.clanObjectiveAccrual === "object"
      ? profile.clanObjectiveAccrual
      : {};
    const matching = safeString(accrual.clanId, 128) === clanId
      && safeString(accrual.resetGeneration, 120) === RESET_GENERATION;
    const baselineGold = matching ? safeNumber(accrual.goldPercentMs, live.goldPercentMs) : live.goldPercentMs;
    const baselineTroops = matching ? safeNumber(accrual.troopPercentMs, live.troopPercentMs) : live.troopPercentMs;
    accruedGoldPercentMs += Math.max(0, live.goldPercentMs - baselineGold);
    accruedTroopPercentMs += Math.max(0, live.troopPercentMs - baselineTroops);
    nextAccrual = clanBenefitAccrualBaseline(benefits, clanId, nowMs);
  }

  const boundedElapsedMs = Math.max(1, safeNumber(elapsedMs, 0));
  const rawAverageSharedGold = accruedGoldPercentMs / boundedElapsedMs;
  const rawAverageSharedTroops = accruedTroopPercentMs / boundedElapsedMs;
  const citadelControllerUid = safeString(
    benefits?.citadelControllerUid || pending.citadelControllerUid,
    128
  );
  const ownsClanCitadel = Boolean(citadelControllerUid && citadelControllerUid === safeString(uid, 128));
  const averageSharedGold = ownsClanCitadel
    ? 0
    : citadelControllerUid
      ? rawAverageSharedGold
      : Math.max(
        0,
        rawAverageSharedGold
          - safeNumber(currentBonuses.personalGoldBonusPercent, 0) * CLAN_SHARED_OBJECTIVE_MULTIPLIER
      );
  const averageSharedTroops = ownsClanCitadel
    ? 0
    : citadelControllerUid
      ? rawAverageSharedTroops
      : Math.max(
        0,
        rawAverageSharedTroops
          - safeNumber(currentBonuses.personalTroopBonusPercent, 0) * CLAN_SHARED_OBJECTIVE_MULTIPLIER
      );
  const productionBonuses = {
    ...currentBonuses,
    goldBonusPercent: Math.max(0, safeNumber(currentBonuses.personalGoldBonusPercent, currentBonuses.goldBonusPercent))
      + averageSharedGold,
    troopBonusPercent: Math.max(0, safeNumber(currentBonuses.personalTroopBonusPercent, currentBonuses.troopBonusPercent))
      + averageSharedTroops,
  };

  return {
    currentBonuses,
    productionBonuses,
    profilePatch: {
      clanObjectiveAccrual: nextAccrual,
      pendingClanObjectiveAccrual: FieldValue.delete(),
    },
  };
}

function buildClanSharedObjectiveBonuses(objectives = []) {
  const citadel = objectives.find(objective => isCrownCitadel(objective));
  if (citadel) {
    return {
      sharedBonuses: objectiveBonusForCity(citadel, CLAN_SHARED_OBJECTIVE_MULTIPLIER),
      citadelControllerUid: safeString(citadel.ownerUid, 128),
    };
  }
  return {
    sharedBonuses: objectives.reduce(
      (bonuses, objective) => addObjectiveBonuses(
        bonuses,
        objectiveBonusForCity(objective, CLAN_SHARED_OBJECTIVE_MULTIPLIER)
      ),
      emptyObjectiveBonuses()
    ),
    citadelControllerUid: "",
  };
}

async function rebuildClanWorldBenefits(clanId = "", effectiveAtMs = Date.now()) {
  const safeClanId = safeString(clanId, 128);
  const benefitsRef = clanWorldBenefitsRef(safeClanId);
  if (!safeClanId || !benefitsRef) return null;
  const clanSnap = await db.doc(`clans/${safeClanId}`).get();
  const clan = clanSnap.exists ? clanSnap.data() || {} : {};
  const objectiveRefs = SERVER_WORLD_OBJECTIVE_TARGETS.map(objective => cityRefForRegion(objective.regionId, objective.id));
  const objectiveSnaps = objectiveRefs.length ? await db.getAll(...objectiveRefs) : [];
  const ownerUids = [...new Set(objectiveSnaps
    .filter(snapshot => snapshot.exists)
    .map(snapshot => safeString(snapshot.data()?.ownerUid, 128))
    .filter(Boolean))];
  const ownerProfileRefs = ownerUids.map(uid => db.doc(`players/${uid}`));
  const ownerProfileSnaps = ownerProfileRefs.length ? await db.getAll(...ownerProfileRefs) : [];
  const ownerClanByUid = new Map(ownerProfileSnaps.map(snapshot => [
    snapshot.id,
    safeString(snapshot.data()?.clanId, 128),
  ]));
  const controlledObjectives = objectiveSnaps.map(snapshot => {
    if (!snapshot.exists) return null;
    const city = { id: snapshot.id, ...snapshot.data() };
    const ownerUid = safeString(city.ownerUid, 128);
    if (!ownerUid || ownerClanByUid.get(ownerUid) !== safeClanId || !isStronghold(city)) return null;
    return {
      id: city.id,
      regionId: normalizeRegionId(city.regionId || getRegionIdFromOnlineIslandId(snapshot.ref.parent?.parent?.id)),
      strongholdType: safeString(city.strongholdType, 32),
      ownerUid,
      ownerName: normalizePlayerName(city.ownerName || ownerUid, "Ruler"),
      bonusPercent: getStrongholdBonusPercent(city),
      ...city,
    };
  }).filter(Boolean);
  const next = buildClanSharedObjectiveBonuses(controlledObjectives);
  const normalizedEffectiveAtMs = Math.max(0, Math.floor(safeNumber(effectiveAtMs, Date.now())));

  return db.runTransaction(async transaction => {
    const priorSnap = await transaction.get(benefitsRef);
    const prior = priorSnap.exists ? priorSnap.data() || {} : {};
    const priorLastAtMs = Math.max(0, timestampToMs(prior.lastIntegratedAtMs));
    const integrationAtMs = Math.max(priorLastAtMs, normalizedEffectiveAtMs);
    const priorShared = normalizeObjectiveBonuses(prior.sharedBonuses);
    const integrationElapsedMs = Math.max(0, integrationAtMs - priorLastAtMs);
    const status = clanSnap.exists && clan.status === "active" ? "active" : "inactive";
    const data = {
      clanId: safeClanId,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      modelVersion: CLAN_OBJECTIVE_BENEFIT_MODEL_VERSION,
      status,
      objectives: status === "active" ? controlledObjectives.map(objective => ({
        id: objective.id,
        regionId: objective.regionId,
        strongholdType: objective.strongholdType,
        ownerUid: objective.ownerUid,
        ownerName: objective.ownerName,
        bonusPercent: objective.bonusPercent,
      })) : [],
      sharedBonuses: status === "active" ? next.sharedBonuses : emptyObjectiveBonuses(),
      citadelControllerUid: status === "active" ? next.citadelControllerUid : "",
      cumulativeGoldPercentMs: Math.max(0, safeNumber(prior.cumulativeGoldPercentMs, 0))
        + priorShared.goldBonusPercent * integrationElapsedMs,
      cumulativeTroopPercentMs: Math.max(0, safeNumber(prior.cumulativeTroopPercentMs, 0))
        + priorShared.troopBonusPercent * integrationElapsedMs,
      lastIntegratedAtMs: integrationAtMs,
      effectiveAtMs: normalizedEffectiveAtMs,
      revision: Math.max(0, Math.floor(safeNumber(prior.revision, 0))) + 1,
      updatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(priorSnap.exists ? {} : {
        createdAtMs: normalizedEffectiveAtMs,
        createdAt: FieldValue.serverTimestamp(),
      }),
    };
    transaction.set(benefitsRef, data, { merge: true });
    return data;
  });
}

async function rebuildClanBenefitsAndMemberStats(clanId = "", effectiveAtMs = Date.now()) {
  const safeClanId = safeString(clanId, 128);
  if (!safeClanId) return { clanId: "", membersUpdated: 0 };
  const benefits = await rebuildClanWorldBenefits(safeClanId, effectiveAtMs);
  const membersSnap = await db.collection(`clans/${safeClanId}/members`).get();
  let membersUpdated = 0;
  await processWithConcurrency(membersSnap.docs, 4, async memberDoc => {
    await rebuildGlobalStatsForPlayer(memberDoc.id);
    membersUpdated += 1;
  });
  return { clanId: safeClanId, benefits, membersUpdated };
}

function getCityUpgradeTargetHours(currentLevel) {
  const level = clampCityLevel(currentLevel);
  if (level <= CITY_UPGRADE_EARLY_END_LEVEL) {
    const progress = (level - 1) / Math.max(1, CITY_UPGRADE_EARLY_END_LEVEL - 1);
    return CITY_UPGRADE_EARLY_START_HOURS
      + (CITY_UPGRADE_EARLY_END_HOURS - CITY_UPGRADE_EARLY_START_HOURS)
        * Math.pow(progress, 1.35);
  }
  if (level <= CITY_UPGRADE_MID_END_LEVEL) {
    const progress = (level - CITY_UPGRADE_EARLY_END_LEVEL)
      / (CITY_UPGRADE_MID_END_LEVEL - CITY_UPGRADE_EARLY_END_LEVEL);
    return CITY_UPGRADE_EARLY_END_HOURS
      + (CITY_UPGRADE_MID_END_HOURS - CITY_UPGRADE_EARLY_END_HOURS)
        * Math.pow(progress, 1.4);
  }
  const endgameProgress = (level - CITY_UPGRADE_MID_END_LEVEL)
    / Math.max(1, 150 - CITY_UPGRADE_MID_END_LEVEL);
  return Math.min(
    CITY_UPGRADE_MAX_TARGET_HOURS,
    CITY_UPGRADE_MID_END_HOURS
      + (CITY_UPGRADE_END_LEVEL_150_HOURS - CITY_UPGRADE_MID_END_HOURS)
        * Math.pow(endgameProgress, 1.5)
  );
}

function getCityUpgradeCost(city = {}, bonuses = {}) {
  if (isStronghold(city)) return Infinity;
  const startLevel = clampCityLevel(city.level);
  const targetLevel = startLevel + 1;
  if (!Number.isSafeInteger(targetLevel)) return Infinity;
  const totalCost = getMillionLordsPassiveGoldPerHour(startLevel)
    * getCityUpgradeTargetHours(startLevel);
  if (!Number.isFinite(totalCost)) return Infinity;
  const reduction = Math.max(0, safeNumber(bonuses.upgradeCostReductionPercent, 0));
  return Math.max(10, Math.floor(totalCost * (1 - Math.min(85, reduction) / 100) + 0.000001));
}

function getEconomyCityByRef(economy = null, ref = null) {
  if (!economy || !ref) return null;
  return economy.cityEntries.find(entry => entry.ref.path === ref.path) || null;
}

function appendEconomyCityPatch(economy = null, ref = null, city = {}, patch = {}) {
  if (!economy || !ref || !patch || typeof patch !== "object") return false;
  economy.cityPatches.push({ ref, city, patch });
  const entry = getEconomyCityByRef(economy, ref);
  if (entry?.city) entry.city = { ...entry.city, ...patch };
  return true;
}

function creditLevelUpTroopsToMainCity(economy = null, profile = {}, troopReward = 0, nowMs = Date.now()) {
  const credited = Math.max(0, Math.floor(safeNumber(troopReward, 0)));
  if (!economy?.uid || credited <= 0) return null;
  const mainEntry = getCanonicalMainCityEntry(profile, economy.cityEntries);
  const city = mainEntry?.city;
  if (!mainEntry?.ref || !city || getOwnerUid(city) !== economy.uid || isStronghold(city)) return null;

  const troopFloat = Math.max(0, safeNumber(city.troopFloat, city.troops || 0)) + credited;
  const patch = {
    troops: Math.max(0, Math.floor(troopFloat)),
    troopFloat,
    productionUpdatedAtMs: nowMs,
  };
  appendEconomyCityPatch(economy, mainEntry.ref, city, patch);

  const cityUpdate = {
    id: city.id,
    regionId: normalizeRegionId(city.regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(mainEntry))),
    ...patch,
  };
  const existingUpdate = economy.cityUpdates.find(update => (
    update?.id === cityUpdate.id && normalizeRegionId(update.regionId) === cityUpdate.regionId
  ));
  if (existingUpdate) Object.assign(existingUpdate, cityUpdate);
  else economy.cityUpdates.push(cityUpdate);

  return {
    credited,
    cityId: city.id,
    cityName: safeString(city.name || city.id || "main city", 40),
    regionId: cityUpdate.regionId,
    patch,
  };
}

function findNearestOwnedCityDestination(economy = null, source = null, excludedPaths = []) {
  if (!economy || !source) return null;
  const excluded = new Set((Array.isArray(excludedPaths) ? excludedPaths : []).map(path => safeString(path, 240)));
  const sourceRegionId = normalizeRegionId(source.regionId || "");
  const sourceX = safeNumber(source.x, 0);
  const sourceY = safeNumber(source.y, 0);
  return economy.cityEntries
    .filter(entry => !excluded.has(safeString(entry?.ref?.path, 240)))
    .filter(entry => getOwnerUid(entry.city) === economy.uid)
    .filter(entry => !isStronghold(entry.city))
    .map(entry => {
      const city = entry.city || {};
      const sameRegion = normalizeRegionId(city.regionId || "") === sourceRegionId;
      const distance = Math.hypot(safeNumber(city.x, 0) - sourceX, safeNumber(city.y, 0) - sourceY);
      return { ...entry, sameRegion, distance };
    })
    .sort((a, b) => {
      if (a.sameRegion !== b.sameRegion) return a.sameRegion ? -1 : 1;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return safeString(a.city?.name || a.city?.id, 80).localeCompare(safeString(b.city?.name || b.city?.id, 80));
    })[0] || null;
}

function findNearestRelinquishDestination(economy = null, sourceEntry = null) {
  if (!sourceEntry?.city) return null;
  return findNearestOwnedCityDestination(economy, sourceEntry.city, [sourceEntry.ref?.path]);
}

function getOwnedMainCityDestination(economy = null, profile = {}) {
  if (!economy) return null;
  const ownedEntries = economy.cityEntries.filter(entry => (
    entry?.city
    && getOwnerUid(entry.city) === economy.uid
    && !isStronghold(entry.city)
  ));
  return getCanonicalMainCityEntry(profile, ownedEntries);
}

function getRallyReturnDestination(economy = null, profile = {}, participant = {}) {
  if (!economy?.uid) return null;
  const sourceRegionId = normalizeRegionId(participant.sourceRegionId);
  const sourceId = safeString(participant.sourceId, 96);
  const sourceRef = sourceRegionId && sourceId ? cityRefForRegion(sourceRegionId, sourceId) : null;
  const originalEntry = sourceRef ? getEconomyCityByRef(economy, sourceRef) : null;
  if (originalEntry?.city && getOwnerUid(originalEntry.city) === economy.uid) return originalEntry;
  return getOwnedMainCityDestination(economy, profile)
    || economy.cityEntries.find(entry => entry?.city && getOwnerUid(entry.city) === economy.uid)
    || null;
}

function createRallyReturnMovement({
  rally = {},
  participant = {},
  source = {},
  destinationEntry = null,
  economy = null,
  profile = {},
  nowMs = Date.now(),
  reason = "rally_return",
  movementId = "",
} = {}) {
  if (!destinationEntry?.city || !economy?.uid) {
    throw new HttpsError("failed-precondition", "The rally participant has no owned return destination.");
  }
  const destination = destinationEntry.city;
  const route = buildServerGeneratedArmyRoute(source, destination);
  const rawId = normalizeRallyId(movementId || `${rally.id}_${participant.uid}_return_${nowMs.toString(36)}`);
  const troops = Math.max(0, Math.floor(safeNumber(participant.survivors, participant.troops)));
  const sourceRegionId = normalizeRegionId(source.regionId || rally.targetRegionId || rally.assemblyRegionId);
  const destinationRegionId = normalizeRegionId(
    destination.regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(destinationEntry))
  );
  const stats = createPreparedEconomyStatsSnapshot(economy, profile, { nowMs });
  const duration = calculateTravelTime({
    pathLength: route.pathLength,
    troopCount: troops,
    kind: "transfer",
    speedMultiplier: skillMultiplier(profile, "marchOrders")
      * (1 + Math.max(0, safeNumber(economy.bonuses?.marchSpeedBonusPercent, 0)) / 100),
  });
  return {
    id: rawId,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    ownerKind: "player",
    ownerUid: economy.uid,
    ownerName: normalizePlayerName(profile.playerName || participant.ownerName, "Ruler"),
    ownerFlag: profile.flag || participant.ownerFlag || null,
    ownerKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, participant.ownerKingPower))),
    kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
    kind: "transfer",
    launchKind: "rally_join",
    rallyReturn: true,
    rallyId: normalizeRallyId(rally.id),
    rallyClanId: safeString(rally.clanId, 128),
    returnReason: safeString(reason, 40),
    targetType: "city",
    fromId: safeString(source.id || rally.targetId || rally.assemblyCityId, 96),
    toId: safeString(destination.id, 96),
    fromName: safeString(source.name || rally.targetName || rally.assemblyCityName || "Rally", 40),
    toName: safeString(destination.name || "Return city", 40),
    sourceRegionId,
    targetRegionId: destinationRegionId,
    troops,
    requestedTroops: troops,
    total: duration,
    path: route.path,
    pathSegments: route.pathSegments,
    routeRegionIds: route.routeRegionIds,
    viewRegionIds: route.routeRegionIds,
    pathLength: route.pathLength,
    targetKey: `${destinationRegionId}:${destination.id}`,
    targetOwnerAtLaunch: "player",
    originalTargetOwnerUid: economy.uid,
    targetOwnerUid: economy.uid,
    attackerKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, participant.ownerKingPower))),
    defenderKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, participant.ownerKingPower))),
    launchedAtMs: nowMs,
    arrivesAtMs: nowMs + Math.ceil(duration * 1000),
    status: "active",
    createdByServer: true,
    rallyModelVersion: RALLY_MODEL_VERSION,
    serverAuthorityVersion: 3,
  };
}

function getRallyShieldDeactivation(economy = null, nowMs = Date.now()) {
  if (!economy) return { deactivated: false, profileOverrides: {}, cityPatches: [], cityUpdates: [] };
  const itemEffects = { ...(economy.itemEffects || {}) };
  const shieldIsActive = safeNumber(itemEffects.shieldExpiresAtMs, 0) > nowMs
    || economy.cityEntries.some(entry => (
      entry?.city
      && !isStronghold(entry.city)
      && getShieldExpiresAtMs(entry.city) > nowMs
    ));
  if (!shieldIsActive) {
    return { deactivated: false, profileOverrides: {}, cityPatches: [], cityUpdates: [] };
  }
  itemEffects.shieldExpiresAtMs = 0;
  const cityPatches = [];
  const cityUpdates = [];
  economy.cityEntries.forEach(entry => {
    if (!entry?.ref || !entry.city || isStronghold(entry.city)) return;
    const patch = { ownerShieldExpiresAtMs: 0 };
    cityPatches.push({ ref: entry.ref, city: entry.city, patch });
    cityUpdates.push({
      id: entry.city.id,
      regionId: normalizeRegionId(entry.city.regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(entry))),
      ...patch,
    });
  });
  return {
    deactivated: true,
    profileOverrides: { itemEffects },
    cityPatches,
    cityUpdates,
  };
}

function createRelinquishContinuationMovement({
  army = {},
  source = {},
  destinationEntry = null,
  economy = null,
  profile = {},
  nowMs = Date.now(),
  reason = "released_destination",
} = {}) {
  if (!destinationEntry?.city || !economy?.uid) {
    throw new HttpsError("failed-precondition", "No owned city is available for the relinquished troops.");
  }
  const destination = destinationEntry.city;
  const route = buildServerGeneratedArmyRoute(source, destination);
  const continuationCount = clampInt(army.relinquishContinuationCount, 0, 999) + 1;
  const rawOriginId = safeString(army.relinquishOriginArmyId || army.id, 72)
    .replace(/[^a-zA-Z0-9_-]/g, "_") || "relinquish";
  const suffix = `_rb${continuationCount}_${Math.max(0, Math.floor(nowMs)).toString(36)}`;
  const continuationId = `${rawOriginId.slice(0, Math.max(1, 96 - suffix.length))}${suffix}`;
  const sourceRegionId = normalizeRegionId(source.regionId || source.startPool);
  const destinationRegionId = normalizeRegionId(destination.regionId || destination.startPool);
  const currentStats = createPreparedEconomyStatsSnapshot(economy, profile, { nowMs });
  const ownerKingPower = Math.max(0, Math.floor(safeNumber(
    currentStats?.kingPower,
    safeNumber(economy.lastGlobalStats?.kingPower, safeNumber(economy.globalStats?.kingPower, army.ownerKingPower))
  )));
  const troops = Math.max(0, Math.floor(safeNumber(army.troops, 0)));
  const duration = calculateTravelTime({
    pathLength: route.pathLength,
    troopCount: troops,
    kind: "transfer",
    speedMultiplier: skillMultiplier(profile, "marchOrders")
      * (1 + Math.max(0, safeNumber(economy.bonuses?.marchSpeedBonusPercent, 0)) / 100),
  });
  return {
    id: continuationId,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    ownerKind: "player",
    ownerUid: economy.uid,
    ownerName: normalizePlayerName(profile.playerName || army.ownerName, "Ruler"),
    ownerFlag: profile.flag || army.ownerFlag || null,
    ownerKingPower,
    kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
    kind: "transfer",
    targetType: "city",
    relinquishTransfer: true,
    relinquishOriginArmyId: rawOriginId,
    relinquishContinuationCount: continuationCount,
    relinquishRedirectReason: safeString(reason, 40),
    fromId: safeString(source.id, 96),
    toId: safeString(destination.id, 96),
    fromName: safeString(source.name || army.toName || "Released city", 40),
    toName: safeString(destination.name || "Owned city", 40),
    sourceRegionId,
    targetRegionId: destinationRegionId,
    troops,
    requestedTroops: troops,
    total: duration,
    path: route.path,
    pathSegments: route.pathSegments,
    routeRegionIds: route.routeRegionIds,
    viewRegionIds: route.routeRegionIds,
    pathLength: route.pathLength,
    targetKey: `${destinationRegionId}:${destination.id}`,
    targetOwnerAtLaunch: "player",
    targetOwnerUid: economy.uid,
    attackerKingPower: ownerKingPower,
    defenderKingPower: ownerKingPower,
    demoAttack: null,
    launchedAtMs: nowMs,
    arrivesAtMs: nowMs + Math.ceil(duration * 1000),
    status: "active",
    createdByServer: true,
    serverAuthorityVersion: 2,
  };
}

function getReinforcementTargetRef(contribution = {}) {
  const targetType = contribution.targetType === "camp" ? "camp" : "city";
  const regionId = normalizeRegionId(contribution.targetRegionId);
  const targetId = safeString(contribution.targetId, 96);
  if (!regionId || !targetId) return null;
  return targetType === "camp"
    ? campRefForRegion(regionId, targetId)
    : cityRefForRegion(regionId, targetId);
}

function createReinforcementReturnMovement({
  contribution = {},
  source = {},
  destinationEntry = null,
  economy = null,
  profile = {},
  nowMs = Date.now(),
  reason = "recalled",
} = {}) {
  if (!destinationEntry?.city || !economy?.uid) {
    throw new HttpsError("failed-precondition", "The troop owner's main city is unavailable.");
  }
  const destination = destinationEntry.city;
  const route = buildServerGeneratedArmyRoute(source, destination);
  const revision = clampInt(contribution.returnRevision, 0, 999999) + 1;
  const rawId = safeString(contribution.id || "reinforcement", 64).replace(/[^a-zA-Z0-9_-]/g, "_");
  const suffix = `_return_${revision}`;
  const movementId = `${rawId.slice(0, Math.max(1, 96 - suffix.length))}${suffix}`;
  const sourceRegionId = normalizeRegionId(source.regionId || contribution.targetRegionId);
  const destinationRegionId = normalizeRegionId(destination.regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(destinationEntry)));
  const troops = Math.max(0, Math.floor(safeNumber(contribution.troops, 0)));
  const stats = createPreparedEconomyStatsSnapshot(economy, profile, { nowMs });
  const duration = calculateTravelTime({
    pathLength: route.pathLength,
    troopCount: troops,
    kind: "transfer",
    speedMultiplier: skillMultiplier(profile, "marchOrders")
      * (1 + Math.max(0, safeNumber(economy.bonuses?.marchSpeedBonusPercent, 0)) / 100),
  });
  return {
    id: movementId,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    ownerKind: "player",
    ownerUid: economy.uid,
    ownerName: normalizePlayerName(profile.playerName || contribution.ownerName, "Ruler"),
    ownerFlag: profile.flag || contribution.ownerFlag || null,
    ownerKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, contribution.ownerKingPower))),
    kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
    kind: "transfer",
    launchKind: "reinforce",
    reinforcementReturn: true,
    reinforcementId: safeString(contribution.id, 96),
    returnReason: safeString(reason, 40),
    targetType: "city",
    fromId: safeString(source.id || contribution.targetId, 96),
    toId: safeString(destination.id, 96),
    fromName: safeString(source.name || contribution.targetName || "Allied holding", 40),
    toName: safeString(destination.name || "Main city", 40),
    sourceRegionId,
    targetRegionId: destinationRegionId,
    troops,
    requestedTroops: troops,
    total: duration,
    path: route.path,
    pathSegments: route.pathSegments,
    routeRegionIds: route.routeRegionIds,
    viewRegionIds: route.routeRegionIds,
    pathLength: route.pathLength,
    targetKey: `${destinationRegionId}:${destination.id}`,
    reinforcementTargetKey: safeString(contribution.targetKey, 220),
    targetOwnerAtLaunch: "player",
    originalTargetOwnerUid: economy.uid,
    targetOwnerUid: economy.uid,
    attackerKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, contribution.ownerKingPower))),
    defenderKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, contribution.ownerKingPower))),
    launchedAtMs: nowMs,
    arrivesAtMs: nowMs + Math.ceil(duration * 1000),
    status: "active",
    createdByServer: true,
    reinforcementModelVersion: REINFORCEMENT_MODEL_VERSION,
    serverAuthorityVersion: 3,
  };
}

async function beginReinforcementReturn({
  reinforcementId = "",
  callerUid = "",
  reason = "recalled",
  nowMs = Date.now(),
} = {}) {
  const id = safeString(reinforcementId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!id) throw new HttpsError("invalid-argument", "Choose reinforcements to return.");
  const contributionRef = db.doc(`reinforcements/${id}`);
  return db.runTransaction(async transaction => {
    const contributionSnap = await transaction.get(contributionRef);
    if (!contributionSnap.exists) throw new HttpsError("not-found", "Those reinforcements were not found.");
    const contribution = { id: contributionSnap.id, ...contributionSnap.data() };
    if (
      safeString(contribution.resetGeneration, 120) !== RESET_GENERATION
      || safeString(contribution.worldId, 120) !== ONLINE_WORLD_ID
    ) {
      throw new HttpsError("failed-precondition", "Those reinforcements belong to an archived world.");
    }
    if (contribution.status !== REINFORCEMENT_STATUS_STATIONED || safeNumber(contribution.troops, 0) <= 0) {
      return { ok: true, duplicate: true, status: contribution.status || REINFORCEMENT_STATUS_DEPLETED };
    }

    const ownerUid = safeString(contribution.ownerUid, 128);
    const targetRef = getReinforcementTargetRef(contribution);
    if (!ownerUid || !targetRef) throw new HttpsError("failed-precondition", "Reinforcement ownership data is incomplete.");
    const targetSnap = await transaction.get(targetRef);
    const target = targetSnap.exists
      ? contribution.targetType === "camp"
        ? getRewardCampCombatTarget({ id: targetSnap.id, ...targetSnap.data() })
        : { id: targetSnap.id, ...targetSnap.data() }
      : {
        id: safeString(contribution.targetId, 96),
        name: safeString(contribution.targetName, 40),
        regionId: normalizeRegionId(contribution.targetRegionId),
        x: safeNumber(contribution.targetX, 0),
        y: safeNumber(contribution.targetY, 0),
      };
    const currentHolderUid = targetSnap.exists ? getOwnerUid(target) : safeString(contribution.targetOwnerUid, 128);
    if (callerUid && callerUid !== ownerUid && callerUid !== currentHolderUid) {
      throw new HttpsError("permission-denied", "Only the troop owner or holding owner can return these reinforcements.");
    }
    const returnInitiatorRole = callerUid === ownerUid
      ? "contributor"
      : callerUid === currentHolderUid
        ? "holder"
        : "server";
    const effectiveReturnReason = returnInitiatorRole === "contributor"
      ? "contributor_recall"
      : returnInitiatorRole === "holder"
        ? "holder_send_home"
        : safeString(reason, 40) || "server_return";

    const economy = await prepareEconomyCollection(transaction, ownerUid, nowMs);
    const profile = economy.profileAfter || {};
    const destinationEntry = getOwnedMainCityDestination(economy, profile);
    if (!destinationEntry?.city) {
      throw new HttpsError("failed-precondition", "The troop owner's main city is unavailable.");
    }
    const movement = createReinforcementReturnMovement({
      contribution,
      source: target,
      destinationEntry,
      economy,
      profile,
      nowMs,
      reason: effectiveReturnReason,
    });
    const currentStationed = getProfileStationedReinforcementTroops(profile);
    const returningTroops = Math.max(0, Math.floor(safeNumber(contribution.troops, 0)));
    const profileOverrides = {
      stationedReinforcementTroops: Math.max(0, currentStationed - returningTroops),
      reinforcementResetGeneration: RESET_GENERATION,
    };
    writePreparedEconomy(transaction, economy, profileOverrides, [], {
      addActiveArmies: [movement],
      nowMs,
    });
    writeArmyMovementCopies(transaction, movement, { includeCreatedAt: true });

    let targetUpdate = null;
    if (targetSnap.exists && target) {
      const alliedTroops = getAlliedReinforcementTroops(target);
      const patch = {
        alliedReinforcementTroops: Math.max(0, alliedTroops - returningTroops),
      };
      transaction.set(targetRef, patch, { merge: true });
      targetUpdate = contribution.targetType === "camp"
        ? { campUpdate: campUpdateForClient(target.id, contribution.targetRegionId, patch) }
        : { cityUpdates: [{ id: target.id, regionId: contribution.targetRegionId, ...patch }] };
    }
    transaction.set(contributionRef, {
      troops: 0,
      status: REINFORCEMENT_STATUS_RETURNING,
      returnRevision: clampInt(contribution.returnRevision, 0, 999999) + 1,
      returnArmyId: movement.id,
      returnReason: effectiveReturnReason,
      returnedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      ok: true,
      status: REINFORCEMENT_STATUS_RETURNING,
      reinforcementId: id,
      returnInitiatorRole,
      troops: returningTroops,
      movement,
      ...targetUpdate,
      ...(returnInitiatorRole === "contributor"
        ? {
          currentUser: createEconomyResponse(economy, {
            currentUser: {
              ...createEconomyResponse(economy).currentUser,
              globalStats: globalStatsForClient(economy.lastGlobalStats || economy.globalStats),
            },
          }).currentUser,
        }
        : {}),
    };
  });
}

function getCityEntryIslandId(entry = {}) {
  return safeString(entry?.ref?.parent?.parent?.id || getOnlineIslandId(entry?.city?.regionId), 160);
}

function getCityEntryPath(entry = {}) {
  return safeString(entry?.ref?.path, 240);
}

function getCityEntryClaimedAtMs(entry = {}) {
  const city = entry.city || {};
  const timestamps = [
    timestampToMs(city.claimedAt),
    timestampToMs(city.createdAt),
    timestampToMs(city.productionUpdatedAtMs),
    timestampToMs(city.updatedAt)
  ].filter(value => value > 0);
  return timestamps.length ? Math.min(...timestamps) : Number.MAX_SAFE_INTEGER;
}

function compareMainCityCandidates(a = {}, b = {}) {
  const aTime = getCityEntryClaimedAtMs(a);
  const bTime = getCityEntryClaimedAtMs(b);
  if (aTime !== bTime) return aTime - bTime;
  return getCityEntryPath(a).localeCompare(getCityEntryPath(b));
}

function getCanonicalMainCityEntry(profile = {}, cityEntries = []) {
  const regularEntries = cityEntries.filter(entry => entry?.city && !isStronghold(entry.city));
  if (!regularEntries.length) return null;
  const profileMainCityId = safeString(profile.mainCityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const profileIslandId = safeString(profile.mainIslandId, 160);
  if (profileMainCityId) {
    const profileMatch = regularEntries.find(entry => {
      if (entry.city.id !== profileMainCityId) return false;
      return !profileIslandId || getCityEntryIslandId(entry) === profileIslandId;
    });
    if (profileMatch) return profileMatch;
  }
  const flaggedMainEntries = regularEntries
    .filter(entry => Boolean(entry.city.isMainCity))
    .sort(compareMainCityCandidates);
  if (flaggedMainEntries.length) return flaggedMainEntries[0];
  return regularEntries.slice().sort(compareMainCityCandidates)[0];
}

function createOwnedCityEntriesFromSnapshot(uid, ownedSnap) {
  return ownedSnap.docs
    .map(doc => {
      const data = doc.data() || {};
      const islandId = safeString(doc.ref.parent?.parent?.id, 160);
      if (!isCurrentWorldIslandId(islandId)) return null;
      if ((data.ownerKind || "player") !== "player" || getOwnerUid(data) !== uid) return null;
      const regionId = getRegionIdFromCityDoc(doc, data);
      if (!getServerWorldTargetIds(regionId).has(doc.id)) return null;
      return {
        ref: doc.ref,
        city: {
          id: doc.id,
          ...data,
          islandId,
          regionId,
          ownerKind: "player",
          ownerUid: uid,
        },
      };
    })
    .filter(Boolean);
}

function createMainCityAssignmentRepair(uid, rawProfile = {}, cityEntries = []) {
  const cityPatches = [];
  const cityUpdates = [];
  const mainCityEntry = getCanonicalMainCityEntry(rawProfile, cityEntries);
  const mainCityEntryPath = getCityEntryPath(mainCityEntry);
  const canonicalMainCityId = mainCityEntry?.city?.id || "";
  const canonicalMainIslandId = mainCityEntry ? getCityEntryIslandId(mainCityEntry) : safeString(rawProfile.mainIslandId, 160);
  const canonicalMainRegionId = mainCityEntry
    ? normalizeRegionId(mainCityEntry.city.regionId || getRegionIdFromOnlineIslandId(canonicalMainIslandId))
    : normalizeRegionId(rawProfile.mainRegionId || getRegionIdFromOnlineIslandId(canonicalMainIslandId));

  cityEntries.forEach(entry => {
    if (!entry?.city) return;
    const shouldBeMain = Boolean(mainCityEntryPath && getCityEntryPath(entry) === mainCityEntryPath && !isStronghold(entry.city));
    if (Boolean(entry.city.isMainCity) === shouldBeMain) return;
    const patch = { isMainCity: shouldBeMain };
    cityPatches.push({ ref: entry.ref, city: entry.city, patch });
    cityUpdates.push({
      id: entry.city.id,
      regionId: entry.city.regionId,
      ...patch,
    });
    entry.city = { ...entry.city, ...patch };
  });

  const profileFields = {
    mainCityAssignmentVersion: MAIN_CITY_ASSIGNMENT_VERSION,
    ...(canonicalMainCityId ? {
        mainCityId: canonicalMainCityId,
        mainIslandId: canonicalMainIslandId,
        mainRegionId: canonicalMainRegionId,
      } : {}),
  };

  return {
    mainCityEntry,
    mainCityEntryPath,
    canonicalMainCityId,
    canonicalMainIslandId,
    canonicalMainRegionId,
    profileFields,
    cityPatches,
    cityUpdates,
  };
}

function createSingleMainCityPatches(cityEntries = [], mainRef = null) {
  const mainPath = safeString(mainRef?.path, 240);
  const cityPatches = [];
  const cityUpdates = [];
  cityEntries.forEach(entry => {
    if (!entry?.ref || !entry.city || isStronghold(entry.city)) return;
    const shouldBeMain = Boolean(mainPath && getCityEntryPath(entry) === mainPath);
    if (Boolean(entry.city.isMainCity) === shouldBeMain) return;
    const patch = { isMainCity: shouldBeMain };
    cityPatches.push({ ref: entry.ref, city: entry.city, patch });
    cityUpdates.push({
      id: entry.city.id,
      regionId: entry.city.regionId,
      ...patch,
    });
    entry.city = { ...entry.city, ...patch };
  });
  return { cityPatches, cityUpdates };
}

function writeExtraCityPatches(transaction, patches = []) {
  patches.forEach(entry => {
    if (!entry?.ref || !entry.patch) return;
    transaction.set(entry.ref, cleanCityUpdate(entry.city || {}, entry.patch), { merge: true });
  });
}

async function prepareEconomyCollection(transaction, uid, nowMs = Date.now(), options = {}) {
  const profileRef = options.profileRef || db.doc(`players/${uid}`);
  const profileSnap = options.profileSnap || await transaction.get(profileRef);
  const rawProfile = profileSnap.exists ? profileSnap.data() || {} : {};
  const upgrades = normalizeSkillUpgrades(rawProfile.upgrades);
  const character = reconcileSkillPoints(rawProfile.character, upgrades);
  const itemEffects = normalizeItemEffects(rawProfile.itemEffects);
  const shopItems = normalizeShopItems(rawProfile.shopItems);
  const itemPurchaseCooldowns = normalizeItemPurchaseCooldowns(rawProfile.itemPurchaseCooldowns);
  const baseGold = Math.max(0, safeNumber(rawProfile.goldFloat, safeNumber(rawProfile.gold, TEST_STARTING_GOLD)));
  const fallbackProductionAtMs = Math.min(nowMs, getProfileLastSeenMs(rawProfile) || nowMs);
  const economyRevisionMs = Math.max(nowMs, timestampToMs(rawProfile.economyUpdatedAtMs) + 1);

  const [ownedSnap, activeArmiesSnap, heldCampsSnap] = await Promise.all([
    transaction.get(db.collectionGroup("cities")
      .where("ownerUid", "==", uid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID)),
    transaction.get(activeArmiesQueryForPlayer(uid)),
    transaction.get(heldRewardCampsQueryForPlayer(uid)),
  ]);
  const cityEntries = createOwnedCityEntriesFromSnapshot(uid, ownedSnap);
  const activeArmies = createActiveArmiesFromSnapshot(uid, activeArmiesSnap);
  const heldCamps = createHeldCampEntriesFromSnapshot(uid, heldCampsSnap);
  const mainCityRepair = createMainCityAssignmentRepair(uid, rawProfile, cityEntries);
  const cityPatches = [...mainCityRepair.cityPatches];
  const cityUpdates = [...mainCityRepair.cityUpdates];
  const productionCityPatches = [];

  const lastEconomyAtMs = Math.min(
    nowMs,
    timestampToMs(rawProfile.economyUpdatedAtMs) || fallbackProductionAtMs
  );
  const goldElapsedSeconds = clamp((nowMs - lastEconomyAtMs) / 1000, 0, MAX_SERVER_PRODUCTION_SECONDS);
  const objectiveBenefits = await resolvePlayerObjectiveBenefits(
    transaction,
    uid,
    rawProfile,
    cityEntries,
    nowMs,
    goldElapsedSeconds * 1000
  );
  const bonuses = objectiveBenefits.currentBonuses;
  const productionBonuses = objectiveBenefits.productionBonuses;
  let goldGainFloat = 0;
  let troopsGained = 0;
  let maxElapsedSeconds = goldElapsedSeconds;

  cityEntries.forEach(entry => {
    const city = entry.city;
    if (isStronghold(city)) return;
    const lastProductionAtMs = Math.min(
      nowMs,
      timestampToMs(city.productionUpdatedAtMs || city.economyUpdatedAtMs) || fallbackProductionAtMs
    );
    const elapsedSeconds = clamp((nowMs - lastProductionAtMs) / 1000, 0, MAX_SERVER_PRODUCTION_SECONDS);
    maxElapsedSeconds = Math.max(maxElapsedSeconds, elapsedSeconds);
    const stats = getCityProductionStats(city, { ...rawProfile, character, upgrades, itemEffects }, productionBonuses, {
      nowMs,
      includeWarDrums: false,
      includeRoyalTaxDecree: false,
    });
    const troopIntervalStartMs = nowMs - elapsedSeconds * 1000;
    const warDrumsOverlapSeconds = getTimedProductionBoostOverlapSeconds(
      troopIntervalStartMs,
      nowMs,
      itemEffects.warDrumsExpiresAtMs,
      WAR_DRUMS_DURATION_MS
    );
    const taxDecreeOverlapSeconds = getTimedProductionBoostOverlapSeconds(
      nowMs - goldElapsedSeconds * 1000,
      nowMs,
      itemEffects.royalTaxDecreeExpiresAtMs,
      ROYAL_TAX_DECREE_DURATION_MS
    );
    const currentTroopFloat = Math.max(0, safeNumber(city.troopFloat, safeNumber(city.troops, 0)));
    const troopGainFloat = stats.troopProductionPerSecond * (
      elapsedSeconds + warDrumsOverlapSeconds * WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT / 100
    );
    const nextTroopFloat = currentTroopFloat + troopGainFloat;
    const nextTroops = Math.max(0, Math.floor(nextTroopFloat));
    goldGainFloat += stats.goldProductionPerSecond * (
      goldElapsedSeconds + taxDecreeOverlapSeconds * ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT / 100
    );
    troopsGained += Math.max(0, nextTroops - Math.max(0, Math.floor(safeNumber(city.troops, 0))));
    const patch = {
      troops: nextTroops,
      troopFloat: nextTroopFloat,
      productionUpdatedAtMs: nowMs,
    };
    if (elapsedSeconds > 0 || !timestampToMs(city.productionUpdatedAtMs)) {
      cityUpdates.push({
        id: city.id,
        regionId: city.regionId,
        ...patch,
      });
      entry.city = {
        ...city,
        ...patch,
      };
    }
    const shouldCheckpointCity = !timestampToMs(city.productionUpdatedAtMs)
      || nowMs - lastProductionAtMs >= ECONOMY_CITY_CHECKPOINT_MS;
    if (shouldCheckpointCity) {
      productionCityPatches.push({ ref: entry.ref, city, patch });
    }
  });
  cityPatches.push(...productionCityPatches.slice(0, ECONOMY_MAX_CITY_CHECKPOINT_WRITES));

  const goldFloat = baseGold + goldGainFloat;
  const gold = Math.max(0, Math.floor(goldFloat));
  const profileAfter = {
    ...rawProfile,
    character,
    upgrades,
    gold,
    goldFloat,
    shopItems,
    itemEffects,
    itemPurchaseCooldowns,
    ...mainCityRepair.profileFields,
    economyUpdatedAtMs: economyRevisionMs,
  };
  const globalStatsRef = playerGlobalStatsRef(uid);
  const globalStats = createGlobalStatsSnapshot({
    uid,
    profile: profileAfter,
    cityEntries,
    heldCamps,
    activeArmies,
    bonuses,
    nowMs,
  });
  const profilePatch = {
    uid,
    resetGeneration: rawProfile.resetGeneration || RESET_GENERATION,
    worldId: rawProfile.worldId || ONLINE_WORLD_ID,
    gold,
    goldFloat,
    character,
    upgrades,
    shopItems,
    itemEffects,
    itemPurchaseCooldowns,
    ...mainCityRepair.profileFields,
    ...objectiveBenefits.profilePatch,
    economyUpdatedAtMs: economyRevisionMs,
  };

  return {
    uid,
    profileRef,
    profileSnap,
    profileBefore: rawProfile,
    profileAfter,
    profilePatch,
    globalStatsRef,
    globalStats,
    activeArmies,
    heldCamps,
    cityEntries,
    cityPatches,
    cityUpdates,
    bonuses,
    gold,
    goldFloat,
    shopItems,
    itemEffects,
    itemPurchaseCooldowns,
    production: {
      goldGained: Math.max(0, Math.floor(goldGainFloat)),
      troopsGained,
      elapsedSeconds: Math.floor(maxElapsedSeconds),
      cityCount: cityEntries.filter(entry => !isStronghold(entry.city)).length,
    },
  };
}

function createPatchedCityEntriesForStats(economy = null, extraCityPatches = []) {
  const byPath = new Map();
  (economy?.cityEntries || []).forEach(entry => {
    if (!entry?.ref || !entry.city) return;
    byPath.set(getCityEntryPath(entry), {
      ref: entry.ref,
      city: { ...entry.city },
    });
  });
  [...(economy?.cityPatches || []), ...(Array.isArray(extraCityPatches) ? extraCityPatches : [])].forEach(entry => {
    if (!entry?.ref || !entry.patch) return;
    const path = safeString(entry.ref.path, 240);
    const existing = byPath.get(path) || { ref: entry.ref, city: { ...(entry.city || {}), id: entry.city?.id || entry.ref.id } };
    byPath.set(path, {
      ref: entry.ref,
      city: {
        ...existing.city,
        ...(entry.city || {}),
        ...entry.patch,
        id: existing.city.id || entry.city?.id || entry.ref.id,
        islandId: existing.city.islandId || safeString(entry.ref.parent?.parent?.id, 160),
        regionId: normalizeRegionId(existing.city.regionId || entry.city?.regionId || getRegionIdFromOnlineIslandId(entry.ref.parent?.parent?.id)),
      },
    });
  });
  return [...byPath.values()];
}

function createPatchedActiveArmiesForStats(economy = null, options = {}) {
  const byId = new Map();
  (economy?.activeArmies || []).forEach(army => {
    const key = getArmyStatsKey(army);
    if (key) byId.set(key, { ...army });
  });
  (Array.isArray(options.addActiveArmies) ? options.addActiveArmies : []).forEach(army => {
    const key = getArmyStatsKey(army);
    if (key) byId.set(key, { ...army, status: army.status || "active" });
  });
  (Array.isArray(options.armyPatches) ? options.armyPatches : []).forEach(patch => {
    const key = getArmyStatsKey(patch);
    if (!key) return;
    const next = { ...(byId.get(key) || {}), ...patch, id: key };
    if (next.status !== "active") byId.delete(key);
    else byId.set(key, next);
  });
  (Array.isArray(options.excludeArmyIds) ? options.excludeArmyIds : []).forEach(id => {
    byId.delete(safeString(id, 96));
  });
  return [...byId.values()].filter(army => army.status === "active");
}

function createPreparedEconomyStatsSnapshot(economy = null, profileOverrides = {}, options = {}) {
  if (!economy?.uid) return null;
  const profile = {
    ...(economy.profileAfter || {}),
    ...(profileOverrides || {}),
  };
  return createGlobalStatsSnapshot({
    uid: economy.uid,
    profile,
    cityEntries: createPatchedCityEntriesForStats(economy, options.extraCityPatches),
    heldCamps: economy.heldCamps,
    activeArmies: createPatchedActiveArmiesForStats(economy, options),
    bonuses: economy.bonuses || null,
    nowMs: options.nowMs || Date.now(),
  });
}

function writeGlobalStatsFromEconomy(transaction, economy = null, profileOverrides = {}, extraCityPatches = [], options = {}) {
  if (!economy?.uid || !economy.globalStatsRef) return null;
  const profile = {
    ...(economy.profileAfter || {}),
    ...(profileOverrides || {}),
  };
  const stats = createPreparedEconomyStatsSnapshot(economy, profileOverrides, {
    ...options,
    extraCityPatches,
  });
  transaction.set(economy.globalStatsRef, stats, { merge: true });
  transaction.set(leaderboardEntryRef(economy.uid), {
    uid: economy.uid,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    displayName: normalizePlayerName(profile.playerName || profile.displayName),
    playerName: normalizePlayerName(profile.playerName || profile.displayName),
    flag: profile.flag || null,
    kingPower: stats.kingPower,
    kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
    kingPowerUpdatedAtMs: stats.updatedAtMs,
    cityCount: stats.totalCities,
    totalTroops: stats.totalTroops,
    totalCampTroops: stats.totalCampTroops,
    totalMarchingTroops: stats.totalMarchingTroops,
    totalReinforcementTroops: stats.totalReinforcementTroops,
    armyPower: stats.armyPower,
    reinforcementTroopPower: stats.reinforcementTroopPower,
    replacementPower: stats.replacementPower,
    defensivePower: stats.defensivePower,
    goldPerHour: stats.goldPerHour,
    troopPerHour: stats.troopPerHour,
    sustainableTroopPerHour: stats.sustainableTroopPerHour,
    strongholdTroopBonusPercent: stats.strongholdTroopBonusPercent,
    strongholdDefenseBonusPercent: stats.strongholdDefenseBonusPercent,
    strongholdCount: stats.strongholdCount,
    mainCityId: stats.mainCityId,
    mainRegionId: stats.mainRegionId,
    mainIslandId: stats.mainIslandId,
    updatedAtMs: stats.updatedAtMs,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  economy.lastGlobalStats = stats;
  return stats;
}

function writePreparedEconomy(transaction, economy, profileOverrides = {}, extraCityPatches = [], options = {}) {
  if (!economy) return null;
  economy.cityPatches.forEach(entry => {
    transaction.set(entry.ref, cleanCityUpdate(entry.city, entry.patch), { merge: true });
  });
  extraCityPatches.forEach(entry => {
    if (!entry?.ref || !entry.patch) return;
    transaction.set(entry.ref, cleanCityUpdate(entry.city || {}, entry.patch), { merge: true });
  });
  const statsCityPatches = Array.isArray(options.statsCityPatches) ? options.statsCityPatches : [];
  const stats = writeGlobalStatsFromEconomy(transaction, economy, profileOverrides, [
    ...extraCityPatches,
    ...statsCityPatches,
  ], options);
  transaction.set(economy.profileRef, {
    ...economy.profilePatch,
    ...profileOverrides,
    ...(stats ? {
      kingPower: stats.kingPower,
      kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
      kingPowerUpdatedAtMs: stats.updatedAtMs,
    } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (economy.profileSnap?.exists) {
    transaction.update(economy.profileRef, addLegacyShopItemDeletes());
  }
  return stats;
}

async function rebuildGlobalStatsForPlayer(uid = "") {
  const playerUid = safeString(uid, 128);
  if (!playerUid) throw new HttpsError("invalid-argument", "A player uid is required.");
  const nowMs = Date.now();
  const profileRef = db.doc(`players/${playerUid}`);
  const [profileSnap, ownedSnap, activeArmiesSnap, heldCampsSnap] = await Promise.all([
    profileRef.get(),
    db.collectionGroup("cities")
      .where("ownerUid", "==", playerUid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID)
      .get(),
    activeArmiesQueryForPlayer(playerUid).get(),
    heldRewardCampsQueryForPlayer(playerUid).get(),
  ]);
  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  const identity = getCanonicalPlayerIdentity(playerUid, profile, {}, {});
  const cityEntries = createOwnedCityEntriesFromSnapshot(playerUid, ownedSnap);
  const clanBenefitsSnap = identity.clanId
    ? await clanWorldBenefitsRef(identity.clanId).get()
    : null;
  const objectiveBonuses = combinePlayerObjectiveBonuses(
    playerUid,
    cityEntries,
    clanBenefitsSnap?.exists ? clanBenefitsSnap.data() || {} : null
  );
  const mainRepair = createMainCityAssignmentRepair(playerUid, profile, cityEntries);
  const activeArmyDocs = activeArmiesSnap.docs.filter(armyDoc => {
    const army = {
      id: safeString(armyDoc.data()?.id || armyDoc.id, 96),
      islandId: safeString(armyDoc.ref.parent?.parent?.id, 160),
      ...armyDoc.data(),
    };
    return isCurrentWorldArmy(army);
  });
  const activeArmies = createActiveArmiesFromSnapshot(playerUid, activeArmiesSnap);
  const heldCamps = createHeldCampEntriesFromSnapshot(playerUid, heldCampsSnap);
  const profileForStats = {
    ...profile,
    playerName: identity.ownerName,
    displayName: identity.ownerName,
    flag: identity.ownerFlag,
    ...mainRepair.profileFields,
  };
  const stats = createGlobalStatsSnapshot({
    uid: playerUid,
    profile: profileForStats,
    cityEntries,
    heldCamps,
    activeArmies,
    bonuses: objectiveBonuses,
    nowMs,
  });
  const mainRegionId = mainRepair.canonicalMainRegionId
    || normalizeRegionId(profile.mainRegionId || getRegionIdFromOnlineIslandId(profile.mainIslandId));
  const mainIslandId = mainRepair.canonicalMainIslandId || profile.mainIslandId || getOnlineIslandId(mainRegionId);
  const mainCityId = mainRepair.canonicalMainCityId || safeString(profile.mainCityId, 96);
  const writes = [
    {
      ref: profileRef,
      data: {
        uid: playerUid,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        playerName: identity.ownerName,
        displayName: identity.ownerName,
        flag: identity.ownerFlag,
        clanId: identity.clanId,
        clanName: identity.clanName,
        clanTag: identity.clanTag,
        kingPower: stats.kingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        kingPowerUpdatedAtMs: nowMs,
        ...mainRepair.profileFields,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      ref: playerGlobalStatsRef(playerUid),
      data: stats,
    },
    {
      ref: leaderboardEntryRef(playerUid),
      data: {
        uid: playerUid,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        displayName: identity.ownerName,
        playerName: identity.ownerName,
        flag: identity.ownerFlag,
        clanId: identity.clanId,
        clanName: identity.clanName,
        clanTag: identity.clanTag,
        kingPower: stats.kingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        kingPowerUpdatedAtMs: nowMs,
        cityCount: stats.totalCities,
        totalTroops: stats.totalTroops,
        totalCampTroops: stats.totalCampTroops,
        totalMarchingTroops: stats.totalMarchingTroops,
        totalReinforcementTroops: stats.totalReinforcementTroops,
        armyPower: stats.armyPower,
        reinforcementTroopPower: stats.reinforcementTroopPower,
        replacementPower: stats.replacementPower,
        defensivePower: stats.defensivePower,
        goldPerHour: stats.goldPerHour,
        troopPerHour: stats.troopPerHour,
        sustainableTroopPerHour: stats.sustainableTroopPerHour,
        strongholdTroopBonusPercent: stats.strongholdTroopBonusPercent,
        strongholdDefenseBonusPercent: stats.strongholdDefenseBonusPercent,
        strongholdCount: stats.strongholdCount,
        mainCityId,
        mainRegionId,
        mainIslandId,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
  ];

  cityEntries.forEach(entry => {
    writes.push({
      ref: entry.ref,
      data: {
        ownerKind: "player",
        ownerUid: playerUid,
        ownerName: identity.ownerName,
        ownerFlag: identity.ownerFlag,
        ownerKingPower: stats.kingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });
  activeArmyDocs.forEach(armyDoc => {
    writes.push({
      ref: armyDoc.ref,
      data: {
        ownerName: identity.ownerName,
        ownerFlag: identity.ownerFlag,
        ownerKingPower: stats.kingPower,
        attackerKingPower: stats.kingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });
  mainRepair.cityPatches.forEach(entry => {
    writes.push({
      ref: entry.ref,
      data: cleanCityUpdate(entry.city, entry.patch),
    });
  });

  for (let index = 0; index < writes.length; index += 450) {
    const batch = db.batch();
    writes.slice(index, index + 450).forEach(write => {
      batch.set(write.ref, write.data, { merge: true });
    });
    await batch.commit();
  }

  return {
    uid: playerUid,
    stats: globalStatsForClient(stats),
    cityUpdates: cityEntries.length,
    armyUpdates: activeArmyDocs.length,
    mainCityRepairs: mainRepair.cityPatches.length,
  };
}

function createEconomyResponse(economy = null, overrides = {}) {
  if (!economy) return { ok: true };
  const globalStats = globalStatsForClient(overrides.globalStats || economy.lastGlobalStats || economy.globalStats);
  const {
    gold,
    goldFloat,
    shopItems,
    itemEffects,
    itemPurchaseCooldowns,
    character,
    upgrades,
    daily,
    dailyLoginReward,
    harvestBonuses,
    harvestSpawnTimer,
    harvestNextSpawnAtMs,
    harvestNextBonusType,
    cityUpdates,
    globalStats: _globalStats,
    ...meta
  } = overrides;
  const resolvedHarvestBonuses = harvestBonuses !== undefined
    ? harvestBonuses
    : economy.profileAfter.harvestBonuses;
  const resolvedHarvestNextSpawnAtMs = timestampToMs(
    harvestNextSpawnAtMs !== undefined ? harvestNextSpawnAtMs : economy.profileAfter.harvestNextSpawnAtMs
  );
  const currentUser = {
    gold: Math.max(0, Math.floor(safeNumber(gold, economy.gold))),
    goldFloat: Math.max(0, safeNumber(goldFloat, gold ?? economy.goldFloat)),
    economyUpdatedAtMs: Math.max(0, timestampToMs(economy.profilePatch?.economyUpdatedAtMs)),
    shopItems: shopItems || economy.shopItems,
    itemEffects: itemEffects || economy.itemEffects,
    itemPurchaseCooldowns: itemPurchaseCooldowns || economy.itemPurchaseCooldowns,
    character: character || economy.profileAfter.character || null,
    upgrades: upgrades || normalizeSkillUpgrades(economy.profileAfter.upgrades),
    mainCityId: safeString(economy.profileAfter.mainCityId, 96),
    mainIslandId: safeString(economy.profileAfter.mainIslandId, 160),
    mainRegionId: normalizeRegionId(economy.profileAfter.mainRegionId || getRegionIdFromOnlineIslandId(economy.profileAfter.mainIslandId)),
    mainCityChangedAtMs: timestampToMs(economy.profileAfter.mainCityChangedAtMs),
  };
  if (globalStats) currentUser.globalStats = globalStats;
  if (daily !== undefined) currentUser.daily = normalizeDaily(daily);
  if (dailyLoginReward !== undefined) {
    currentUser.dailyLoginReward = normalizeDailyLoginRewardState(dailyLoginReward);
  }
  if (resolvedHarvestBonuses !== undefined) currentUser.harvestBonuses = enforceHarvestBonusActiveLimit(resolvedHarvestBonuses);
  if (harvestSpawnTimer !== undefined) {
    currentUser.harvestSpawnTimer = clampInt(harvestSpawnTimer, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS);
  }
  if (resolvedHarvestNextSpawnAtMs) {
    currentUser.harvestNextSpawnAtMs = resolvedHarvestNextSpawnAtMs;
    if (harvestSpawnTimer === undefined) {
      currentUser.harvestSpawnTimer = getHarvestSpawnTimerFromNextAt(resolvedHarvestNextSpawnAtMs);
    }
  }
  if (harvestNextBonusType !== undefined) {
    currentUser.harvestNextBonusType = normalizeHarvestBonusType(harvestNextBonusType);
  } else if (economy.profileAfter.harvestNextBonusType !== undefined) {
    currentUser.harvestNextBonusType = normalizeHarvestBonusType(economy.profileAfter.harvestNextBonusType);
  }
  return {
    ok: true,
    currentUser,
    ...(globalStats ? { globalStats } : {}),
    cityUpdates: cityUpdates || economy.cityUpdates,
    production: economy.production,
    ...meta,
  };
}

function getHarvestEconomyRates(economy = null) {
  if (!economy) return { goldPerSecond: 0, troopProductionPerSecond: 0 };
  return economy.cityEntries.reduce((totals, entry) => {
    const city = entry?.city || {};
    if (isStronghold(city) || getOwnerUid(city) !== economy.uid) return totals;
    const stats = getCityProductionStats(city, economy.profileAfter, economy.bonuses, {
      includeWarDrums: false,
      includeRoyalTaxDecree: false,
    });
    totals.goldPerSecond += Math.max(0, safeNumber(stats.goldProductionPerSecond, 0));
    totals.troopProductionPerSecond += Math.max(0, safeNumber(stats.troopProductionPerSecond, 0));
    return totals;
  }, { goldPerSecond: 0, troopProductionPerSecond: 0 });
}

function getRewardedAdBaseRates(economy = null) {
  if (!economy) return { goldPerHour: 0, troopsPerHour: 0 };
  return economy.cityEntries.reduce((totals, entry) => {
    const city = entry?.city || {};
    if (isStronghold(city) || getOwnerUid(city) !== economy.uid) return totals;
    const stats = getCityProductionStats(city, economy.profileAfter, {}, {
      includeStrongholdBoosts: false,
      includeWarDrums: false,
      includeRoyalTaxDecree: false,
    });
    totals.goldPerHour += Math.max(0, safeNumber(stats.baseGoldProductionPerHour, 0));
    totals.troopsPerHour += Math.max(0, safeNumber(stats.baseTroopProductionPerHour, 0));
    return totals;
  }, { goldPerHour: 0, troopsPerHour: 0 });
}

function getRewardedAdRewardAmount(baseRatePerHour = 0) {
  return Math.max(
    0,
    Math.floor(Math.max(0, safeNumber(baseRatePerHour, 0)) * REWARDED_AD_REWARD_MINUTES / 60)
  );
}

function getRewardedAdPreviewRewardsFromStats(stats = {}) {
  return {
    gold: getRewardedAdRewardAmount(stats?.baseGoldPerHour),
    troops: getRewardedAdRewardAmount(stats?.baseTroopPerHour),
  };
}

function getHarvestBonusReward(economy = null, type = "gold") {
  const rates = getHarvestEconomyRates(economy);
  if (type === "troops") {
    const passiveTroops = Math.floor(rates.troopProductionPerSecond * HARVEST_BONUS_TROOP_SECONDS);
    return clampInt(
      Math.max(HARVEST_BONUS_MIN_TROOPS, passiveTroops),
      HARVEST_BONUS_MIN_TROOPS,
      HARVEST_BONUS_MAX_TROOPS
    );
  }
  const passiveGold = Math.floor(rates.goldPerSecond * HARVEST_BONUS_GOLD_SECONDS);
  return Math.max(HARVEST_BONUS_MIN_GOLD, passiveGold);
}

function removeHarvestBonusFromProfile(profile = {}, bonusId = "") {
  const id = safeString(bonusId, 96);
  if (!id || !Array.isArray(profile.harvestBonuses)) return Array.isArray(profile.harvestBonuses) ? profile.harvestBonuses : [];
  return profile.harvestBonuses.filter(bonus => safeString(bonus?.id, 96) !== id);
}

function formatNotificationNumber(value) {
  return Math.max(0, Math.floor(safeNumber(value, 0))).toLocaleString();
}

function createIncomingArmyNotification({ defenderUid = "", attackerUid = "", movement = {}, source = {}, target = {} } = {}) {
  const kind = movement.kind === "scout"
    ? "scout"
    : movement.kind === "attack"
      ? "attack"
      : movement.kind === "reinforce"
        ? "reinforce"
        : "";
  if (!defenderUid || !attackerUid || defenderUid === attackerUid || !kind) return null;
  const attackerName = normalizePlayerName(movement.ownerName || source.ownerName, "A rival ruler");
  const sourceName = safeString(movement.fromName || source.name || movement.fromId || "Unknown city", 40);
  const targetName = safeString(movement.toName || target.name || movement.toId || "your city", 40);
  const title = kind === "scout" ? "Scout incoming" : kind === "reinforce" ? "Clan reinforcement incoming" : "Attack incoming";
  const troopEstimate = kind === "attack" ? getIncomingTroopEstimate(movement.troops) : null;
  const body = kind === "scout"
    ? `${attackerName} is scouting ${targetName} from ${sourceName}.`
    : kind === "reinforce"
      ? `${attackerName} is reinforcing ${targetName} with ${formatNotificationNumber(movement.troops)} troops.`
      : `${attackerName} is attacking ${targetName} with an estimated ${troopEstimate.label} troops.`;
  const notification = {
    defenderUid,
    attackerUid,
    title,
    body,
    kind,
    armyId: safeString(movement.id, 96),
    cityId: safeString(movement.toId, 96),
    sourceCityId: safeString(movement.fromId, 96),
    targetName,
    sourceName,
    attackerName,
    troopVisibility: kind === "attack" ? "estimate" : "exact",
    troopEstimateMin: troopEstimate ? String(troopEstimate.min) : "",
    troopEstimateMax: troopEstimate ? String(troopEstimate.max) : "",
    troopEstimateLabel: troopEstimate?.label || "",
    arrivesAtMs: String(Math.max(0, Math.floor(safeNumber(movement.arrivesAtMs, 0)))),
    url: "/",
  };
  if (kind === "reinforce") {
    notification.troops = String(Math.max(0, Math.floor(safeNumber(movement.troops, 0))));
  }
  return notification;
}

function isInvalidMessagingTokenError(error = {}) {
  const code = String(error.code || error.errorInfo?.code || "");
  return code === "messaging/registration-token-not-registered"
    || code === "messaging/invalid-registration-token"
    || code === "messaging/invalid-argument";
}

async function removeNotificationTokenDocs(uid, tokenDocIds = []) {
  const uniqueIds = [...new Set(tokenDocIds.filter(Boolean))];
  if (!uid || !uniqueIds.length) return;
  const batch = db.batch();
  uniqueIds.forEach(tokenId => {
    batch.delete(db.doc(`players/${uid}/notificationTokens/${tokenId}`));
  });
  await batch.commit();
}

async function sendIncomingArmyNotification(notification = {}) {
  const defenderUid = safeString(notification.defenderUid, 128);
  if (!defenderUid) return false;
  const tokenSnap = await db.collection(`players/${defenderUid}/notificationTokens`)
    .where("enabled", "==", true)
    .limit(100)
    .get();
  if (tokenSnap.empty) return false;

  const tokenDocs = tokenSnap.docs
    .map(doc => ({ id: doc.id, token: safeString(doc.data()?.token, 512) }))
    .filter(entry => entry.token);
  if (!tokenDocs.length) return false;

  const data = {
    type: "incoming_army",
    title: safeString(notification.title, 80),
    body: safeString(notification.body, 180),
    kind: safeString(notification.kind, 16),
    armyId: safeString(notification.armyId, 96),
    cityId: safeString(notification.cityId, 96),
    sourceCityId: safeString(notification.sourceCityId, 96),
    targetName: safeString(notification.targetName, 60),
    sourceName: safeString(notification.sourceName, 60),
    attackerName: safeString(notification.attackerName, 60),
    troopVisibility: safeString(notification.troopVisibility, 16),
    troopEstimateMin: safeString(notification.troopEstimateMin, 32),
    troopEstimateMax: safeString(notification.troopEstimateMax, 32),
    troopEstimateLabel: safeString(notification.troopEstimateLabel, 40),
    arrivesAtMs: safeString(notification.arrivesAtMs, 32),
    url: safeString(notification.url || "/", 160),
  };
  if (notification.troops !== undefined) {
    data.troops = safeString(notification.troops, 32);
  }

  const messages = tokenDocs.map(entry => ({
    token: entry.token,
    data,
    webpush: {
      headers: {
        TTL: "1800",
        Urgency: data.kind === "attack" ? "high" : "normal",
      },
      fcmOptions: {
        link: data.url,
      },
    },
  }));

  const result = await admin.messaging().sendEach(messages);
  const invalidTokenDocIds = [];
  result.responses.forEach((response, index) => {
    if (!response.success && isInvalidMessagingTokenError(response.error)) {
      invalidTokenDocIds.push(tokenDocs[index]?.id);
    }
  });
  if (invalidTokenDocIds.length) {
    await removeNotificationTokenDocs(defenderUid, invalidTokenDocIds).catch(error => {
      console.warn("Could not remove invalid notification tokens", error);
    });
  }
  return result.successCount > 0;
}

exports.getRealmInfo = timedCallable(
  "getRealmInfo",
  { region: "us-central1", maxInstances: 20, invoker: "public" },
  async request => {
    requireAuth(request, { allowRealmMismatch: true });
    return {
      ok: true,
      releaseId: REALM_RELEASE_ID,
      resetGeneration: RESET_GENERATION,
      worldId: ONLINE_WORLD_ID,
      serverId: GAME_SERVER_ID,
      serverName: GAME_SERVER_NAME,
      capacity: GAME_SERVER_CAPACITY,
      heartbeatModelVersion: GAME_SERVER_HEARTBEAT_MODEL_VERSION,
      capabilities: {
        shardedGameServerHeartbeats: true,
      },
      appCheckEnforced: false,
    };
  }
);

exports.joinGameServer = timedCallable("joinGameServer", {
  region: "us-central1",
  maxInstances: 1,
  concurrency: 80,
  invoker: "public",
}, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  requireGameServerId(data.serverId);
  return joinGameServerForPlayer({
    uid,
    sessionId: requireGameServerSessionId(data.sessionId),
    displayName: normalizePlayerName(data.displayName || request.auth?.token?.name || "Ruler"),
    nowMs: Date.now(),
  });
});

exports.heartbeatGameServer = timedCallable("heartbeatGameServer", { region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  requireGameServerId(data.serverId);
  return heartbeatGameServerForPlayer({
    uid,
    sessionId: requireGameServerSessionId(data.sessionId),
    displayName: normalizePlayerName(data.displayName || request.auth?.token?.name || "Ruler"),
    nowMs: Date.now(),
  });
});

exports.leaveGameServer = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  requireGameServerId(data.serverId);
  return leaveGameServerForPlayer({
    uid,
    sessionId: requireGameServerSessionId(data.sessionId),
    nowMs: Date.now(),
  });
});

exports.collectEconomy = timedCallable("collectEconomy", { region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    writePreparedEconomy(transaction, economy);
    return createEconomyResponse(economy);
  });
});

exports.getDailyLoginRewardStatus = timedCallable(
  "getDailyLoginRewardStatus",
  { region: "us-central1", maxInstances: 30, invoker: "public" },
  async request => {
    const uid = requireAuth(request);
    const nowMs = Date.now();
    return db.runTransaction(async transaction => {
      const profileRef = db.doc(`players/${uid}`);
      const profileSnap = await transaction.get(profileRef);
      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "Claim a starting city before opening daily rewards.");
      }
      const profile = profileSnap.data() || {};
      assertCurrentPlayerProfile(profile);
      const attendance = syncDailyLoginRewardAttendance(profile.dailyLoginReward, nowMs);
      if (attendance.changed) {
        transaction.set(profileRef, { dailyLoginReward: attendance.state }, { merge: true });
      }
      return {
        ok: true,
        attendanceRecorded: attendance.changed,
        dailyLoginRewardStatus: createDailyLoginRewardStatus(attendance.state, nowMs),
      };
    });
  }
);

exports.claimDailyLoginReward = timedCallable(
  "claimDailyLoginReward",
  { region: "us-central1", maxInstances: 30, invoker: "public" },
  async request => {
    const uid = requireAuth(request);
    const nowMs = Date.now();
    const claimId = safeString(request.data?.claimId, 96);
    const expectedOrdinal = Math.max(0, Math.floor(safeNumber(request.data?.expectedOrdinal, 0)));
    return db.runTransaction(async transaction => {
      const profileRef = db.doc(`players/${uid}`);
      const profileSnap = await transaction.get(profileRef);
      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "Claim a starting city before collecting daily rewards.");
      }
      const profile = profileSnap.data() || {};
      assertCurrentPlayerProfile(profile);
      const attendance = syncDailyLoginRewardAttendance(profile.dailyLoginReward, nowMs);
      const statusBefore = createDailyLoginRewardStatus(attendance.state, nowMs);
      if (
        claimId
        && attendance.state.lastClaimRequestId === claimId
        && attendance.state.lastReceipt
      ) {
        if (attendance.changed) {
          transaction.set(profileRef, { dailyLoginReward: attendance.state }, { merge: true });
        }
        return {
          ok: true,
          claimed: true,
          replayed: true,
          receipt: attendance.state.lastReceipt,
          dailyLoginRewardStatus: statusBefore,
        };
      }
      if (!statusBefore.eligible) {
        if (attendance.changed) {
          transaction.set(profileRef, { dailyLoginReward: attendance.state }, { merge: true });
        }
        return {
          ok: true,
          claimed: false,
          replayed: false,
          receipt: null,
          dailyLoginRewardStatus: statusBefore,
        };
      }
      if (expectedOrdinal > 0 && expectedOrdinal !== statusBefore.nextClaimOrdinal) {
        throw new HttpsError(
          "aborted",
          "Daily rewards changed. Refresh and try again.",
          { dailyLoginRewardStatus: statusBefore }
        );
      }

      const claimedPosition = getDailyLoginRewardPosition(statusBefore.nextClaimOrdinal);
      const reward = DAILY_LOGIN_REWARD_DAYS[claimedPosition.day - 1];
      if (!reward || reward.day !== claimedPosition.day) {
        throw new HttpsError("internal", "The daily reward schedule is unavailable.");
      }
      const economy = await prepareEconomyCollection(transaction, uid, nowMs, { profileRef, profileSnap });
      const mainCityEntry = getCanonicalMainCityEntry(economy.profileAfter, economy.cityEntries);
      if (
        !mainCityEntry?.ref
        || !mainCityEntry.city
        || getOwnerUid(mainCityEntry.city) !== uid
        || isStronghold(mainCityEntry.city)
        || safeString(mainCityEntry.city.resetGeneration, 120) !== RESET_GENERATION
        || safeString(mainCityEntry.city.worldId, 120) !== ONLINE_WORLD_ID
      ) {
        throw new HttpsError("failed-precondition", "Verify your current-world main city before receiving a daily reward.");
      }
      const rates = getRewardedAdBaseRates(economy);
      const goldReward = Math.max(0, Math.floor(rates.goldPerHour * reward.goldHours));
      const troopReward = Math.max(0, Math.floor(rates.troopsPerHour * reward.troopHours));
      const goldFloat = Math.max(0, safeNumber(economy.goldFloat, economy.gold)) + goldReward;
      const gold = Math.max(0, Math.floor(goldFloat));
      const shopItems = { ...economy.shopItems };
      Object.entries(reward.items || {}).forEach(([itemId, quantity]) => {
        shopItems[itemId] = Math.max(0, Math.floor(safeNumber(shopItems[itemId], 0)))
          + Math.max(1, Math.floor(safeNumber(quantity, 1)));
      });

      const troopCredit = troopReward > 0
        ? creditLevelUpTroopsToMainCity(economy, economy.profileAfter, troopReward, nowMs)
        : null;
      if (troopReward > 0 && !troopCredit) {
        throw new HttpsError("failed-precondition", "Verify your main city before receiving the troop reward.");
      }

      const receipt = {
        cycle: claimedPosition.cycle,
        day: claimedPosition.day,
        ordinal: claimedPosition.ordinal,
        claimId,
        dayKey: statusBefore.dayKey,
        claimedAtMs: nowMs,
        goldHours: reward.goldHours,
        troopHours: reward.troopHours,
        gold: goldReward,
        troops: troopReward,
        items: { ...reward.items },
        targetCityId: troopCredit?.cityId || "",
      };
      const claimedState = normalizeDailyLoginRewardState({
        ...attendance.state,
        nextClaimOrdinal: claimedPosition.ordinal + 1,
        totalClaims: attendance.state.totalClaims + 1,
        lastClaimDayKey: statusBefore.dayKey,
        lastClaimedAtMs: nowMs,
        lastClaimRequestId: claimId,
        lastReceipt: receipt,
      });
      const nextState = syncDailyLoginRewardAttendance(claimedState, nowMs).state;

      writePreparedEconomy(transaction, economy, {
        gold,
        goldFloat,
        shopItems,
        dailyLoginReward: nextState,
      });
      return createEconomyResponse(economy, {
        gold,
        goldFloat,
        shopItems,
        dailyLoginReward: nextState,
        claimed: true,
        replayed: false,
        receipt,
        dailyLoginRewardStatus: createDailyLoginRewardStatus(nextState, nowMs),
        targetCityId: troopCredit?.cityId || "",
        targetCityName: troopCredit?.cityName || "",
      });
    });
  }
);

exports.getRewardedAdStatus = onCall(REWARDED_AD_STATUS_CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  requireRewardedAdAppCheck(request, true);
  const nowMs = Date.now();
  const [stateSnap, configSnap, statsSnap] = await Promise.all([
    rewardedAdStateRef(uid).get(),
    rewardedAdServerConfigRef().get(),
    playerGlobalStatsRef(uid).get(),
  ]);
  const serverConfig = getRewardedAdServerConfigFromSnapshot(configSnap);
  const previewRewards = getRewardedAdPreviewRewardsFromStats(statsSnap.exists ? statsSnap.data() : {});
  return {
    ok: true,
    status: createRewardedAdStatus(
      stateSnap.exists ? stateSnap.data() : {},
      serverConfig.enabled,
      nowMs,
      previewRewards
    ),
  };
});

exports.prepareRewardedAd = onCall(REWARDED_AD_MUTATION_CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  const appId = requireRewardedAdAppCheck(request, true);
  const data = request.data || {};
  const rewardType = safeString(data.rewardType, 16);
  const sessionId = requireGameServerSessionId(data.sessionId);
  if (rewardType !== "gold" && rewardType !== "troops") {
    throw new HttpsError("invalid-argument", "Choose the gold or troop rewarded-ad boost.");
  }
  const nowMs = Date.now();

  return db.runTransaction(async transaction => {
    const stateRef = rewardedAdStateRef(uid);
    const configRef = rewardedAdServerConfigRef();
    const [stateSnap, configSnap] = await Promise.all([
      transaction.get(stateRef),
      transaction.get(configRef),
    ]);
    const rawState = stateSnap.exists ? stateSnap.data() || {} : {};
    const serverConfig = getRewardedAdServerConfigFromSnapshot(configSnap);
    const status = createRewardedAdStatus(rawState, serverConfig.enabled, nowMs);
    if (!status.enabled) {
      throw new HttpsError("failed-precondition", "Rewarded ads are temporarily disabled.");
    }
    if (!status.eligible) {
      throw new HttpsError(
        "failed-precondition",
        status.reason === "daily-limit"
          ? "The daily rewarded-ad limit has been reached."
          : "The rewarded-ad boost is still cooling down.",
        status
      );
    }

    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    const rates = getRewardedAdBaseRates(economy);
    const baseRatePerHour = rewardType === "troops" ? rates.troopsPerHour : rates.goldPerHour;
    const rewardAmount = getRewardedAdRewardAmount(baseRatePerHour);
    if (rewardAmount <= 0) {
      throw new HttpsError("failed-precondition", "Claim a producing city before watching a rewarded ad.");
    }

    const mainEntry = rewardType === "troops"
      ? getCanonicalMainCityEntry(economy.profileAfter, economy.cityEntries)
      : null;
    if (
      rewardType === "troops"
      && (!mainEntry?.city || getOwnerUid(mainEntry.city) !== uid || isStronghold(mainEntry.city))
    ) {
      throw new HttpsError("failed-precondition", "Claim a main city before watching a troop rewarded ad.");
    }

    const normalizedState = normalizeRewardedAdState(rawState, nowMs);
    const previousIntentRef = normalizedState.activeIntentId
      ? rewardedAdIntentRef(uid, normalizedState.activeIntentId)
      : null;
    const previousIntentSnap = previousIntentRef
      ? await transaction.get(previousIntentRef)
      : null;
    const intentId = crypto.randomUUID();
    const intentRef = rewardedAdIntentRef(uid, intentId);
    const preparedAtMs = nowMs;
    const showByMs = nowMs + REWARDED_AD_SHOW_WINDOW_MS;
    const claimByMs = nowMs + REWARDED_AD_CLAIM_WINDOW_MS;
    const intent = {
      schemaVersion: 1,
      id: intentId,
      uid,
      status: "pending",
      rewardType,
      rewardAmount,
      baseRatePerHour: Math.max(0, Math.floor(baseRatePerHour)),
      rewardMinutes: REWARDED_AD_REWARD_MINUTES,
      targetCityId: safeString(mainEntry?.city?.id, 96),
      targetCityName: safeString(mainEntry?.city?.name || mainEntry?.city?.id, 40),
      targetRegionId: normalizeRegionId(mainEntry?.city?.regionId || ""),
      sessionId,
      appId: safeString(appId, 160),
      preparedAtMs,
      showByMs,
      claimByMs,
      deleteAfter: admin.firestore.Timestamp.fromMillis(nowMs + REWARDED_AD_AUDIT_RETENTION_MS),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    writePreparedEconomy(transaction, economy);
    if (previousIntentSnap?.exists && previousIntentSnap.data()?.status === "pending") {
      transaction.set(previousIntentRef, {
        status: "superseded",
        supersededAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    transaction.set(intentRef, intent);
    transaction.set(stateRef, {
      ...normalizedState,
      activeIntentId: intentId,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return createEconomyResponse(economy, {
      rewardedAdIntent: {
        intentId,
        rewardType,
        rewardAmount,
        baseRatePerHour: intent.baseRatePerHour,
        rewardMinutes: REWARDED_AD_REWARD_MINUTES,
        targetCityId: intent.targetCityId,
        targetCityName: intent.targetCityName,
        showByMs,
        claimByMs,
      },
      rewardedAdStatus: createRewardedAdStatus(
        normalizedState,
        true,
        nowMs,
        {
          gold: getRewardedAdRewardAmount(rates.goldPerHour),
          troops: getRewardedAdRewardAmount(rates.troopsPerHour),
        }
      ),
    });
  });
});

exports.claimRewardedAd = onCall(REWARDED_AD_MUTATION_CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  const appId = requireRewardedAdAppCheck(request, true);
  const data = request.data || {};
  const intentId = safeString(data.intentId, 96).replace(/[^a-zA-Z0-9_-]/g, "");
  const sessionId = requireGameServerSessionId(data.sessionId);
  if (!intentId) throw new HttpsError("invalid-argument", "A rewarded-ad intent is required.");
  const nowMs = Date.now();

  return db.runTransaction(async transaction => {
    const stateRef = rewardedAdStateRef(uid);
    const intentRef = rewardedAdIntentRef(uid, intentId);
    const configRef = rewardedAdServerConfigRef();
    const [stateSnap, intentSnap, configSnap] = await Promise.all([
      transaction.get(stateRef),
      transaction.get(intentRef),
      transaction.get(configRef),
    ]);
    if (!intentSnap.exists) {
      throw new HttpsError("not-found", "That rewarded-ad request no longer exists.");
    }

    const rawState = stateSnap.exists ? stateSnap.data() || {} : {};
    const state = normalizeRewardedAdState(rawState, nowMs);
    const intent = intentSnap.data() || {};
    if (safeString(intent.uid, 128) !== uid) {
      throw new HttpsError("permission-denied", "That rewarded-ad request belongs to another player.");
    }
    if (intent.status === "claimed") {
      return {
        ok: true,
        claimed: true,
        replayed: true,
        rewardType: intent.rewardType,
        reward: Math.max(0, Math.floor(safeNumber(intent.rewardAmount, 0))),
        targetCityId: safeString(intent.claimTargetCityId || intent.targetCityId, 96),
        targetCityName: safeString(intent.claimTargetCityName || intent.targetCityName, 40),
        rewardedAdStatus: createRewardedAdStatus(
          state,
          getRewardedAdServerConfigFromSnapshot(configSnap).enabled,
          nowMs
        ),
      };
    }
    if (intent.status !== "pending" || state.activeIntentId !== intentId) {
      throw new HttpsError("failed-precondition", "That rewarded-ad request was replaced or cancelled.");
    }
    if (safeString(intent.sessionId, 128) !== sessionId || safeString(intent.appId, 160) !== safeString(appId, 160)) {
      throw new HttpsError("permission-denied", "Complete the rewarded ad in the browser session that started it.");
    }

    const preparedAtMs = timestampToMs(intent.preparedAtMs);
    const claimByMs = timestampToMs(intent.claimByMs);
    if (!preparedAtMs || nowMs - preparedAtMs < REWARDED_AD_MINIMUM_CLAIM_DELAY_MS) {
      throw new HttpsError("failed-precondition", "The rewarded ad has not run long enough to grant its reward.");
    }
    if (!claimByMs || nowMs > claimByMs) {
      throw new HttpsError("deadline-exceeded", "That rewarded-ad reward expired. Start a new ad.");
    }

    const serverConfig = getRewardedAdServerConfigFromSnapshot(configSnap);
    const status = createRewardedAdStatus(state, serverConfig.enabled, nowMs);
    if (!status.enabled) {
      throw new HttpsError("failed-precondition", "Rewarded ads are temporarily disabled.");
    }
    if (!status.eligible) {
      throw new HttpsError(
        "failed-precondition",
        status.reason === "daily-limit"
          ? "The daily rewarded-ad limit has been reached."
          : "The rewarded-ad boost is still cooling down.",
        status
      );
    }

    const rewardType = intent.rewardType === "troops" ? "troops" : "gold";
    const rewardAmount = Math.max(0, Math.floor(safeNumber(intent.rewardAmount, 0)));
    if (rewardAmount <= 0) {
      throw new HttpsError("failed-precondition", "That rewarded-ad request has no valid reward.");
    }
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    let gold = economy.gold;
    let goldFloat = economy.goldFloat;
    let troopCredit = null;
    const profileOverrides = {};

    if (rewardType === "troops") {
      troopCredit = creditLevelUpTroopsToMainCity(
        economy,
        economy.profileAfter,
        rewardAmount,
        nowMs
      );
      if (!troopCredit) {
        throw new HttpsError("failed-precondition", "Claim a main city before receiving the troop reward.");
      }
    } else {
      goldFloat = Math.max(0, safeNumber(economy.goldFloat, economy.gold)) + rewardAmount;
      gold = Math.max(0, Math.floor(goldFloat));
      profileOverrides.gold = gold;
      profileOverrides.goldFloat = goldFloat;
    }

    writePreparedEconomy(transaction, economy, profileOverrides);
    const claimedToday = Math.min(REWARDED_AD_DAILY_LIMIT, state.claimedToday + 1);
    const nextState = {
      ...state,
      claimedToday,
      lastClaimedAtMs: nowMs,
      activeIntentId: "",
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(stateRef, nextState, { merge: true });
    transaction.set(intentRef, {
      status: "claimed",
      claimedAtMs: nowMs,
      claimDayKey: state.dayKey,
      claimNumberToday: claimedToday,
      claimTargetCityId: troopCredit?.cityId || "",
      claimTargetCityName: troopCredit?.cityName || "",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const rates = getRewardedAdBaseRates(economy);
    return createEconomyResponse(economy, {
      ...(rewardType === "gold" ? { gold, goldFloat } : {}),
      claimed: true,
      replayed: false,
      rewardType,
      reward: rewardAmount,
      targetCityId: troopCredit?.cityId || "",
      targetCityName: troopCredit?.cityName || "",
      rewardedAdStatus: createRewardedAdStatus(
        nextState,
        true,
        nowMs,
        {
          gold: getRewardedAdRewardAmount(rates.goldPerHour),
          troops: getRewardedAdRewardAmount(rates.troopsPerHour),
        }
      ),
    });
  });
});

exports.reserveHarvestBonusSpawn = onCall({ region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const requestedType = normalizeHarvestBonusType(data.type);
  const nowMs = Date.now();

  return db.runTransaction(async transaction => {
    const profileRef = db.doc(`players/${uid}`);
    const profileSnap = await transaction.get(profileRef);
    const profile = profileSnap.exists ? profileSnap.data() || {} : {};
    const daily = mergeHarvestDailyTrackers(profile.daily, data.daily, new Date(nowMs));
    const preferredType = normalizeHarvestBonusType(profile.harvestNextBonusType || requestedType);
    const alternateType = preferredType === "troops" ? "gold" : "troops";
    const spawnType = getHarvestBonusRemaining(preferredType, daily) > 0
      ? preferredType
      : getHarvestBonusRemaining(alternateType, daily) > 0
        ? alternateType
        : "";
    const activeBonuses = enforceHarvestBonusActiveLimit(profile.harvestBonuses, nowMs);
    const currentNextSpawnAtMs = getHarvestNextSpawnAtMs(profile, nowMs);
    const writeProfileState = (overrides = {}) => {
      const harvestNextSpawnAtMs = timestampToMs(overrides.harvestNextSpawnAtMs) || currentNextSpawnAtMs;
      const harvestBonuses = enforceHarvestBonusActiveLimit(
        overrides.harvestBonuses !== undefined ? overrides.harvestBonuses : activeBonuses,
        nowMs
      );
      const harvestNextBonusType = normalizeHarvestBonusType(overrides.harvestNextBonusType || profile.harvestNextBonusType || requestedType);
      transaction.set(profileRef, {
        uid,
        resetGeneration: RESET_GENERATION,
        worldId: ONLINE_WORLD_ID,
        daily,
        harvestBonuses,
        harvestSpawnTimer: getHarvestSpawnTimerFromNextAt(harvestNextSpawnAtMs, nowMs),
        harvestNextSpawnAtMs,
        harvestNextBonusType,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return {
        ok: true,
        spawned: Boolean(overrides.spawned),
        relocated: Boolean(overrides.relocated),
        reason: overrides.reason || "",
        currentUser: {
          daily,
          harvestBonuses,
          harvestSpawnTimer: getHarvestSpawnTimerFromNextAt(harvestNextSpawnAtMs, nowMs),
          harvestNextSpawnAtMs,
          harvestNextBonusType,
        },
      };
    };

    if (activeBonuses.length && data.relocateActive === true) {
      const activeBonus = activeBonuses[0];
      const requestedBonusId = safeString(data.activeBonusId || data.bonus?.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
      if (requestedBonusId && requestedBonusId !== activeBonus.id) {
        return writeProfileState({ reason: "active-pickup-changed" });
      }
      const candidate = createHarvestBonusFromPayload(data, uid, nowMs);
      if (!candidate) throw new HttpsError("invalid-argument", "Pickup respawn location is invalid.");
      const targetRegionId = requireKnownWorldRegionId(candidate.regionId);
      if (targetRegionId === activeBonus.regionId) {
        return writeProfileState({ reason: "active-pickup-current-map" });
      }
      const relocatedBonus = {
        ...activeBonus,
        regionId: targetRegionId,
        x: candidate.x,
        y: candidate.y,
      };
      return writeProfileState({
        relocated: true,
        reason: "active-pickup-relocated",
        harvestBonuses: [relocatedBonus],
      });
    }

    if (!spawnType) {
      return writeProfileState({ reason: "daily-limit" });
    }
    if (activeBonuses.length >= HARVEST_BONUS_MAX_ACTIVE_PER_PLAYER) {
      return writeProfileState({ reason: "active-pickup" });
    }
    if (nowMs < currentNextSpawnAtMs) {
      return writeProfileState({ reason: "cooldown" });
    }

    const bonus = createHarvestBonusFromPayload(data, uid, nowMs);
    if (!bonus) throw new HttpsError("invalid-argument", "Pickup spawn location is invalid.");
    bonus.type = spawnType;
    const harvestBonuses = enforceHarvestBonusActiveLimit([...activeBonuses, bonus], nowMs);
    const harvestNextSpawnAtMs = nowMs + HARVEST_BONUS_SPAWN_INTERVAL_SECONDS * 1000;
    return writeProfileState({
      spawned: true,
      harvestBonuses,
      harvestNextSpawnAtMs,
      harvestNextBonusType: spawnType === "troops" ? "gold" : "troops",
    });
  });
});

exports.repairMainCityAssignment = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    writePreparedEconomy(transaction, economy, {
      mainCityRepairUpdatedAtMs: nowMs,
    });
    return createEconomyResponse(economy, {
      repairedMainCity: true,
    });
  });
});

exports.changeMainCity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const cityId = safeString(data.cityId || data.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const regionId = normalizeRegionId(data.regionId || data.mainRegionId || data.islandId || "");
  if (!cityId) throw new HttpsError("invalid-argument", "Choose a city to make your main city.");

  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    const targetRef = regionId ? cityRefForRegion(regionId, cityId) : null;
    const targetEntry = (targetRef ? getEconomyCityByRef(economy, targetRef) : null)
      || economy.cityEntries.find(entry => entry?.city?.id === cityId);
    if (!targetEntry?.city || getOwnerUid(targetEntry.city) !== uid || isStronghold(targetEntry.city)) {
      throw new HttpsError("failed-precondition", "Only one of your regular cities can become your main city.");
    }

    const regularOwnedCount = economy.cityEntries.filter(entry => (
      entry?.city
      && getOwnerUid(entry.city) === uid
      && !isStronghold(entry.city)
    )).length;
    const mainCityChangeCooldownMs = regularOwnedCount < MAIN_CITY_CHANGE_CITY_LIMIT
      ? MAIN_CITY_CHANGE_SMALL_KINGDOM_COOLDOWN_MS
      : MAIN_CITY_CHANGE_LARGE_KINGDOM_COOLDOWN_MS;

    const targetRegionId = normalizeRegionId(targetEntry.city.regionId || regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(targetEntry)));
    const targetIslandId = getCityEntryIslandId(targetEntry) || getOnlineIslandId(targetRegionId);
    const targetKey = getReinforcementTargetKey("city", targetRegionId, targetEntry.city.id);
    const stationedReinforcementsSnap = await transaction.get(stationedReinforcementsForTargetQuery(targetKey));
    if (!stationedReinforcementsSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "Send allied reinforcements home before making this your main city."
      );
    }
    const currentMainCityId = safeString(economy.profileAfter.mainCityId || economy.profileBefore.mainCityId, 96);
    const currentMainIslandId = safeString(economy.profileAfter.mainIslandId || economy.profileBefore.mainIslandId, 160);
    if (currentMainCityId === targetEntry.city.id && currentMainIslandId === targetIslandId) {
      const repair = createSingleMainCityPatches(economy.cityEntries, targetEntry.ref);
      writePreparedEconomy(transaction, economy, {
        mainCityId: targetEntry.city.id,
        mainIslandId: targetIslandId,
        mainRegionId: targetRegionId,
      }, repair.cityPatches);
      return createEconomyResponse(economy, {
        currentUser: {
          ...createEconomyResponse(economy).currentUser,
          mainCityId: targetEntry.city.id,
          mainIslandId: targetIslandId,
          mainRegionId: targetRegionId,
        },
        cityUpdates: [...economy.cityUpdates, ...repair.cityUpdates],
        repairedMainCity: repair.cityPatches.length > 0,
      });
    }

    const lastChangedAtMs = timestampToMs(economy.profileAfter.mainCityChangedAtMs || economy.profileBefore.mainCityChangedAtMs);
    const cooldownRemainingMs = Math.max(0, mainCityChangeCooldownMs - (nowMs - lastChangedAtMs));
    if (lastChangedAtMs > 0 && cooldownRemainingMs > 0) {
      const cooldownLabel = regularOwnedCount < MAIN_CITY_CHANGE_CITY_LIMIT ? "7-day" : "14-day";
      throw new HttpsError("failed-precondition", `Your ${cooldownLabel} main city change cooldown has ${formatCooldownMs(cooldownRemainingMs)} remaining.`);
    }

    const profileOverrides = {
      mainCityId: targetEntry.city.id,
      mainIslandId: targetIslandId,
      mainRegionId: targetRegionId,
      mainCityChangedAtMs: nowMs,
    };
    const repair = createSingleMainCityPatches(economy.cityEntries, targetEntry.ref);
    writePreparedEconomy(transaction, economy, profileOverrides, repair.cityPatches);
    return createEconomyResponse(economy, {
      currentUser: {
        ...createEconomyResponse(economy).currentUser,
        ...profileOverrides,
      },
      cityUpdates: [...economy.cityUpdates, ...repair.cityUpdates],
      mainCityChanged: true,
      mainCityChangeCooldownMs,
      ownedRegularCityCount: regularOwnedCount,
      mainCity: {
        id: targetEntry.city.id,
        name: safeString(targetEntry.city.name || targetEntry.city.id, 80),
        regionId: targetRegionId,
        islandId: targetIslandId,
      },
    });
  });
});

exports.returnClanReinforcement = timedCallable(
  "returnClanReinforcement",
  { region: "us-central1", maxInstances: 30, invoker: "public" },
  async request => beginReinforcementReturn({
    reinforcementId: request.data?.reinforcementId || request.data?.id,
    callerUid: requireAuth(request),
    reason: safeString(request.data?.reason, 40) || "recalled",
  })
);

exports.collectHarvestBonus = onCall({ region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const type = safeString(data.type, 16) === "troops" ? "troops" : "gold";
  const bonusId = safeString(data.bonusId || data.id, 96);
  const nowMs = Date.now();

  return db.runTransaction(async transaction => {
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    let daily = mergeHarvestDailyTrackers(economy.profileAfter.daily, data.daily, new Date(nowMs));
    const activeHarvestBonuses = enforceHarvestBonusActiveLimit(economy.profileAfter.harvestBonuses, nowMs);
    const activeBonus = activeHarvestBonuses.find(bonus => bonus.id === bonusId && bonus.type === type);
    if (!activeBonus) {
      throw new HttpsError("failed-precondition", "That pickup expired. Reload the map and try the next one.");
    }
    if (getHarvestBonusRemaining(type, daily) <= 0) {
      throw new HttpsError("failed-precondition", `Daily ${type === "troops" ? "troop" : "gold"} harvest limit reached.`);
    }

    const reward = getHarvestBonusReward(economy, type);
    daily = incrementHarvestDailyTracker(type, daily);
    const harvestBonuses = removeHarvestBonusFromProfile({ harvestBonuses: activeHarvestBonuses }, bonusId);
    const harvestNextSpawnAtMs = nowMs + HARVEST_BONUS_SPAWN_INTERVAL_SECONDS * 1000;
    const profileOverrides = {
      daily,
      harvestBonuses,
      harvestSpawnTimer: HARVEST_BONUS_SPAWN_INTERVAL_SECONDS,
      harvestNextSpawnAtMs,
      harvestNextBonusType: type === "troops" ? "gold" : "troops",
    };

    if (type === "troops") {
      const mainInfo = getMainCityInfo(economy.profileAfter);
      const mainEntry = mainInfo ? getEconomyCityByRef(economy, mainInfo.ref) : null;
      if (!mainEntry?.city || getOwnerUid(mainEntry.city) !== uid || isStronghold(mainEntry.city)) {
        throw new HttpsError("failed-precondition", "Claim a main city before collecting troop pickups.");
      }
      const currentTroopFloat = Math.max(0, safeNumber(mainEntry.city.troopFloat, mainEntry.city.troops || 0));
      const troopFloat = currentTroopFloat + reward;
      const cityPatch = {
        troops: Math.max(0, Math.floor(troopFloat)),
        troopFloat,
        productionUpdatedAtMs: nowMs,
      };
      const cityUpdate = {
        id: mainEntry.city.id,
        regionId: mainEntry.city.regionId || mainInfo.regionId,
        ...cityPatch,
      };
      writePreparedEconomy(transaction, economy, profileOverrides, [{ ref: mainEntry.ref, city: mainEntry.city, patch: cityPatch }]);
      return createEconomyResponse(economy, {
        ...profileOverrides,
        cityUpdates: [...economy.cityUpdates, cityUpdate],
        rewardType: type,
        reward,
        targetCityId: mainEntry.city.id,
        targetCityName: mainEntry.city.name || mainEntry.city.id,
      });
    }

    const goldFloat = Math.max(0, safeNumber(economy.goldFloat, economy.gold)) + reward;
    const gold = Math.max(0, Math.floor(goldFloat));
    writePreparedEconomy(transaction, economy, {
      ...profileOverrides,
      gold,
      goldFloat,
    });
    return createEconomyResponse(economy, {
      ...profileOverrides,
      gold,
      goldFloat,
      rewardType: type,
      reward,
    });
  });
});

exports.spendSkillPoint = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const skillId = safeString(data.skillId || data.skill, 64);
  const config = SKILL_CONFIG[skillId];
  if (!config) throw new HttpsError("invalid-argument", "Choose a valid skill.");

  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    if (!economy.profileSnap.exists) throw new HttpsError("not-found", "Player profile was not found.");
    const upgrades = normalizeSkillUpgrades(economy.profileAfter.upgrades);
    const character = reconcileSkillPoints(economy.profileAfter.character, upgrades);
    const currentLevel = normalizeSkillLevelForSkill(skillId, upgrades[skillId]);
    if (currentLevel >= getSkillMaxLevel(skillId)) {
      throw new HttpsError("failed-precondition", "That skill is already capped.");
    }
    if (character.skillPoints < 1) {
      throw new HttpsError("failed-precondition", "Earn a hero level for another skill point.");
    }
    upgrades[skillId] = currentLevel + 1;
    character.skillPoints = getAvailableSkillPoints(character, upgrades);
    writePreparedEconomy(transaction, economy, {
      character,
      upgrades,
    });
    return createEconomyResponse(economy, {
      skillId,
      character,
      upgrades,
    });
  });
});

exports.resetSkills = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    const spentPoints = getSpentSkillPoints(economy.profileAfter.upgrades);
    const currentUpgrades = normalizeSkillUpgrades(economy.profileAfter.upgrades);
    const currentCharacter = normalizeCharacterProgress(economy.profileAfter.character);
    const expectedPoints = getAvailableSkillPoints(currentCharacter, currentUpgrades);
    const storedPoints = normalizeSkillLevel(currentCharacter.skillPoints);
    const needsPointRepair = storedPoints !== expectedPoints;
    if (spentPoints < 1 && !needsPointRepair) throw new HttpsError("failed-precondition", "No spent skill points to reset.");
    const resetCost = spentPoints > 0 ? SKILL_RESET_COST : 0;
    if (economy.gold < resetCost) {
      throw new HttpsError("failed-precondition", `Skill reset costs ${SKILL_RESET_COST.toLocaleString()} gold.`);
    }
    const upgrades = spentPoints > 0 ? normalizeSkillUpgrades({}) : currentUpgrades;
    const character = reconcileSkillPoints(currentCharacter, upgrades);
    const gold = Math.max(0, economy.gold - resetCost);
    writePreparedEconomy(transaction, economy, {
      character,
      upgrades,
      gold,
      goldFloat: gold,
    });
    return createEconomyResponse(economy, {
      character,
      upgrades,
      gold,
      goldFloat: gold,
      spentPoints,
      resetCost,
      repairedSkillPoints: needsPointRepair,
    });
  });
});

exports.syncPlayerIdentity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const authToken = request.auth?.token || {};
  const profileRef = db.doc(`players/${uid}`);
  const profileSnap = await profileRef.get();
  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  const identity = getCanonicalPlayerIdentity(uid, profile, data, authToken);
  const nowMs = Date.now();
  const identitySyncSignature = getPlayerIdentitySyncSignature(identity);
  if (
    Math.max(0, Math.floor(safeNumber(profile.identitySyncVersion, 0))) >= PLAYER_IDENTITY_SYNC_VERSION
    && safeString(profile.identitySyncSignature, 1000) === identitySyncSignature
  ) {
    const globalStatsSnap = await playerGlobalStatsRef(uid).get();
    return {
      ok: true,
      unchanged: true,
      updatedCities: 0,
      updatedArmies: 0,
      globalStats: globalStatsSnap.exists ? globalStatsForClient(globalStatsSnap.data() || {}) : null,
    };
  }

  const [ownedCitiesSnap, activeArmiesSnap, crownReignSnap] = await Promise.all([
    db.collectionGroup("cities")
      .where("ownerUid", "==", uid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID)
      .get(),
    activeArmiesQueryForPlayer(uid).get(),
    crownCitadelReignRef(uid).get(),
  ]);
  const cityDocs = ownedCitiesSnap.docs.filter(cityDoc => {
    const islandId = cityDoc.ref.parent.parent?.id || "";
    if (!isCurrentWorldIslandId(islandId)) return false;
    const city = cityDoc.data() || {};
    const regionId = getRegionIdFromCityDoc(cityDoc, city);
    return getServerWorldTargetIds(regionId).has(cityDoc.id);
  });
  const activeArmyDocs = activeArmiesSnap.docs.filter(armyDoc => {
    const army = {
      id: safeString(armyDoc.data()?.id || armyDoc.id, 96),
      islandId: safeString(armyDoc.ref.parent?.parent?.id, 160),
      ...armyDoc.data(),
    };
    return isCurrentWorldArmy(army);
  });
  const ownedCityEntries = cityDocs.map(cityDoc => {
    const city = cityDoc.data() || {};
    const islandId = safeString(cityDoc.ref.parent.parent?.id, 160);
    return {
      ref: cityDoc.ref,
      city: {
        id: cityDoc.id,
        ...city,
        islandId,
        regionId: getRegionIdFromCityDoc(cityDoc, city),
      },
    };
  });
  const mainCityRepair = createMainCityAssignmentRepair(uid, profile, ownedCityEntries);
  const mainCityId = mainCityRepair.canonicalMainCityId || safeString(profile.mainCityId, 80);
  const mainRegionId = mainCityRepair.canonicalMainRegionId
    || normalizeRegionId(profile.mainRegionId || getRegionIdFromOnlineIslandId(profile.mainIslandId));
  const mainIslandId = mainCityRepair.canonicalMainIslandId || profile.mainIslandId || getOnlineIslandId(mainRegionId);
  const profileForStats = {
    ...profile,
    playerName: identity.ownerName,
    displayName: identity.ownerName,
    flag: identity.ownerFlag,
    ...mainCityRepair.profileFields,
  };
  const activeArmies = createActiveArmiesFromSnapshot(uid, activeArmiesSnap);
  const clanBenefitsSnap = identity.clanId
    ? await clanWorldBenefitsRef(identity.clanId).get()
    : null;
  const objectiveBonuses = combinePlayerObjectiveBonuses(
    uid,
    ownedCityEntries,
    clanBenefitsSnap?.exists ? clanBenefitsSnap.data() || {} : null
  );
  const globalStats = createGlobalStatsSnapshot({
    uid,
    profile: profileForStats,
    cityEntries: ownedCityEntries,
    activeArmies,
    bonuses: objectiveBonuses,
    nowMs,
  });
  const serverKingPower = globalStats.kingPower;
  const cityCount = globalStats.totalCities;

  const writes = [
    {
      ref: profileRef,
      data: {
        uid,
        playerName: identity.ownerName,
        displayName: identity.ownerName,
        flag: identity.ownerFlag,
        identitySyncVersion: PLAYER_IDENTITY_SYNC_VERSION,
        identitySyncSignature,
        kingPower: serverKingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        kingPowerUpdatedAtMs: nowMs,
        ...mainCityRepair.profileFields,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      ref: playerGlobalStatsRef(uid),
      data: globalStats,
    },
    {
      ref: leaderboardEntryRef(uid),
      data: {
        uid,
        displayName: identity.ownerName,
        playerName: identity.ownerName,
        flag: identity.ownerFlag,
        kingPower: serverKingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        kingPowerUpdatedAtMs: nowMs,
        cityCount,
        totalTroops: globalStats.totalTroops,
        totalMarchingTroops: globalStats.totalMarchingTroops,
        goldPerHour: globalStats.goldPerHour,
        troopPerHour: globalStats.troopPerHour,
        strongholdCount: globalStats.strongholdCount,
        mainCityId,
        mainRegionId,
        mainIslandId,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
  ];
  if (identity.clanId) {
    writes.push({
      ref: db.doc(`clans/${identity.clanId}/members/${uid}`),
      data: {
        uid,
        displayName: identity.ownerName,
        flag: identity.ownerFlag,
        kingPower: serverKingPower,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }

  cityDocs.forEach(cityDoc => {
    writes.push({
      ref: cityDoc.ref,
      data: {
        ownerKind: "player",
        ownerUid: uid,
        ownerName: identity.ownerName,
        ownerFlag: identity.ownerFlag,
        ownerKingPower: serverKingPower,
        ownerClanId: identity.clanId,
        ownerClanName: identity.clanName,
        ownerClanTag: identity.clanTag,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });
  activeArmyDocs.forEach(armyDoc => {
    writes.push({
      ref: armyDoc.ref,
      data: {
        ownerName: identity.ownerName,
        ownerFlag: identity.ownerFlag,
        ownerKingPower: serverKingPower,
        attackerKingPower: serverKingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        ownerClanId: identity.clanId,
        ownerClanName: identity.clanName,
        ownerClanTag: identity.clanTag,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });
  if (crownReignSnap.exists) {
    writes.push({
      ref: crownReignSnap.ref,
      data: {
        playerName: identity.ownerName,
        playerFlag: identity.ownerFlag,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }
  mainCityRepair.cityPatches.forEach(entry => {
    writes.push({
      ref: entry.ref,
      data: cleanCityUpdate(entry.city, entry.patch),
    });
  });

  for (let index = 0; index < writes.length; index += 450) {
    const batch = db.batch();
    writes.slice(index, index + 450).forEach(write => {
      batch.set(write.ref, write.data, { merge: true });
    });
    await batch.commit();
  }

  return {
    ok: true,
    ownerName: identity.ownerName,
    ownerFlag: identity.ownerFlag,
    ownerKingPower: serverKingPower,
    cityCount,
    globalStats: globalStatsForClient(globalStats),
    cityUpdates: cityDocs.length,
    armyUpdates: activeArmyDocs.length,
    presenceUpdates: 0,
  };
});

exports.recalculatePlayerGlobalStats = onCall({ region: "us-central1", maxInstances: 10, invoker: "public" }, async request => {
  requireStatsAdmin(request);
  const data = request.data || {};
  const targetUid = safeString(data.uid || data.playerId || "", 128);
  return {
    ok: true,
    result: await rebuildGlobalStatsForPlayer(targetUid),
  };
});

exports.recalculateAllPlayerGlobalStats = onCall({ region: "us-central1", timeoutSeconds: 300, memory: "512MiB", maxInstances: 1, invoker: "public" }, async request => {
  requireStatsAdmin(request);
  const data = request.data || {};
  const requestedLimit = Math.max(1, Math.min(500, Math.floor(safeNumber(data.limit, 100))));
  const playersSnap = await db.collection("players").limit(requestedLimit).get();
  const results = [];
  for (const playerDoc of playersSnap.docs) {
    results.push(await rebuildGlobalStatsForPlayer(playerDoc.id));
  }
  return {
    ok: true,
    processed: results.length,
    results,
  };
});

exports.getCombatPlayerIdentity = onCall({
  region: "us-central1",
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20,
  invoker: "public",
}, async request => {
  requireAuth(request);
  const targetUid = safeString(request.data?.uid || request.data?.playerId, 128);
  if (!targetUid) throw new HttpsError("invalid-argument", "Choose a player to inspect.");

  let leaderboardSnap = await leaderboardEntryRef(targetUid).get();
  let leaderboard = leaderboardSnap.exists ? leaderboardSnap.data() || {} : {};
  const needsRebuild = !leaderboardSnap.exists
    || Math.max(0, Math.floor(safeNumber(leaderboard.kingPowerVersion, 0))) < GLOBAL_PLAYER_STATS_VERSION
    || Math.max(0, Math.floor(safeNumber(leaderboard.kingPower, 0))) <= 0;

  if (needsRebuild) {
    const profileSnap = await db.doc(`players/${targetUid}`).get();
    if (!profileSnap.exists) throw new HttpsError("not-found", "That kingdom could not be found.");
    await rebuildGlobalStatsForPlayer(targetUid);
    leaderboardSnap = await leaderboardEntryRef(targetUid).get();
    leaderboard = leaderboardSnap.exists ? leaderboardSnap.data() || {} : {};
  }
  if (!leaderboardSnap.exists) throw new HttpsError("not-found", "That kingdom could not be found.");

  const identity = {
    uid: targetUid,
    displayName: normalizePlayerName(leaderboard.playerName || leaderboard.displayName),
    playerName: normalizePlayerName(leaderboard.playerName || leaderboard.displayName),
    flag: leaderboard.flag || null,
    kingPower: Math.max(0, Math.floor(safeNumber(leaderboard.kingPower, 0))),
    kingPowerVersion: Math.max(0, Math.floor(safeNumber(leaderboard.kingPowerVersion, 0))),
    mainCityId: safeString(leaderboard.mainCityId, 96),
    mainRegionId: safeString(leaderboard.mainRegionId, 160),
    mainIslandId: safeString(leaderboard.mainIslandId, 160),
    cityCount: Math.max(0, Math.floor(safeNumber(leaderboard.cityCount, 0))),
    strongholdCount: Math.max(0, Math.floor(safeNumber(leaderboard.strongholdCount, 0))),
    clanId: safeString(leaderboard.clanId, 128),
    clanName: safeString(leaderboard.clanName, 24),
    clanTag: safeString(leaderboard.clanTag, 5),
    updatedAtMs: Math.max(0, timestampToMs(
      leaderboard.kingPowerUpdatedAtMs || leaderboard.updatedAtMs || leaderboard.updatedAt
    )),
  };
  if (request.data?.includePublicProfile !== true) return identity;

  const profileSnap = await db.doc(`players/${targetUid}`).get();
  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  const profileClanId = safeString(profile.clanId || leaderboard.clanId, 128);
  const [ownedCitiesSnap, clanSnap] = await Promise.all([
    db.collectionGroup("cities")
      .where("ownerUid", "==", targetUid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID)
      .get(),
    profileClanId ? db.doc(`clans/${profileClanId}`).get() : Promise.resolve(null),
  ]);
  const clanData = clanSnap?.exists ? clanSnap.data() || {} : null;
  const clan = clanData
    && clanData.status === "active"
    && safeString(clanData.resetGeneration, 120) === RESET_GENERATION
    && safeString(clanData.worldId, 120) === ONLINE_WORLD_ID
    ? clanPublicSnapshot(profileClanId, clanData)
    : null;
  const strongholds = createOwnedCityEntriesFromSnapshot(targetUid, ownedCitiesSnap)
    .map(entry => getPublicStrongholdSnapshot(entry.city))
    .filter(Boolean)
    .sort((first, second) => first.name.localeCompare(second.name));
  return {
    ...identity,
    strongholdCount: strongholds.length,
    strongholds,
    clanId: clan?.id || profileClanId,
    clanName: clan?.name || safeString(profile.clanName || leaderboard.clanName, 24),
    clanTag: clan?.tag || safeString(profile.clanTag || leaderboard.clanTag, 5),
    clanShield: clan?.shield || null,
    clan,
  };
});

async function ensureMainIslandForPlayer(uid, data = {}) {
  const requestedIslandId = safeString(data.islandId, 160);
  const requestedRegionId = data.regionId
    || data.meta?.regionId
    || getRegionIdFromOnlineIslandId(requestedIslandId);
  const seed = getAuthoritativeIslandSeed(requestedRegionId || "west");
  const islandId = seed.islandId;
  if (requestedIslandId && requestedIslandId !== islandId) {
    throw new HttpsError("invalid-argument", "The requested island does not match the current Crownlands world.");
  }
  const citySeeds = seed.cities;
  const campSeeds = seed.camps;
  const targetVersion = seed.meta.version;
  const targetCityCount = citySeeds.length;
  const targetCampCount = campSeeds.length;
  const targetRegularCityCount = citySeeds.filter(city => !(city.kind === "stronghold" || city.strongholdType)).length;
  const islandRef = db.doc(`islands/${islandId}`);
  const citiesRef = islandRef.collection("cities");
  const campsRef = islandRef.collection("camps");
  const islandSnap = await islandRef.get();
  const islandData = islandSnap.exists ? islandSnap.data() || {} : {};
  const seededCityCount = Math.max(0, Math.floor(safeNumber(islandData.seededCityCount, 0)));
  const seededCampCount = Math.max(0, Math.floor(safeNumber(islandData.seededCampCount, 0)));
  const layoutSeedVersion = Math.max(0, Math.floor(safeNumber(islandData.layoutSeedVersion, 0)));
  const needsCitySeed = !islandSnap.exists || seededCityCount < targetCityCount;
  const needsCampSeed = targetCampCount > 0 && (!islandSnap.exists || seededCampCount < targetCampCount);
  const needsLayoutRefresh = islandSnap.exists && layoutSeedVersion < targetVersion;
  const needsGenerationStamp = islandSnap.exists && (
    safeString(islandData.worldId, 120) !== ONLINE_WORLD_ID
    || safeString(islandData.resetGeneration, 120) !== RESET_GENERATION
  );
  const safeMeta = seed.meta;

  if (islandSnap.exists && !needsCitySeed && !needsCampSeed && !needsLayoutRefresh && !needsGenerationStamp && seededCityCount === targetCityCount && seededCampCount === targetCampCount) {
    return {
      islandId,
      seeded: false,
      refreshed: false,
      cityCount: targetCityCount,
      campCount: targetCampCount,
      version: targetVersion,
    };
  }

  const seedLockRef = db.doc(`realmSeeds/${RESET_GENERATION}/islands/${seed.regionId}`);
  const seedOwnerToken = crypto.randomBytes(12).toString("hex");
  const seedLeaseMs = 60 * 1000;
  const acquiredSeedLease = await db.runTransaction(async transaction => {
    const lockSnap = await transaction.get(seedLockRef);
    const lock = lockSnap.exists ? lockSnap.data() || {} : {};
    const nowMs = Date.now();
    const canAcquire = !lockSnap.exists
      || lock.status === "ready"
      || timestampToMs(lock.leaseUntilMs) <= nowMs
      || Math.max(0, Math.floor(safeNumber(lock.layoutSeedVersion, 0))) < targetVersion;
    if (!canAcquire) return false;
    transaction.set(seedLockRef, {
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      regionId: seed.regionId,
      islandId,
      status: "seeding",
      ownerToken: seedOwnerToken,
      layoutSeedVersion: targetVersion,
      leaseUntilMs: nowMs + seedLeaseMs,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!acquiredSeedLease) {
    const waitStartedAtMs = Date.now();
    while (Date.now() - waitStartedAtMs < seedLeaseMs) {
      const lockSnap = await seedLockRef.get();
      const lock = lockSnap.exists ? lockSnap.data() || {} : {};
      if (lock.status === "ready"
        && Math.max(0, Math.floor(safeNumber(lock.layoutSeedVersion, 0))) >= targetVersion) {
        return ensureMainIslandForPlayer(uid, data);
      }
      if (timestampToMs(lock.leaseUntilMs) <= Date.now()) {
        return ensureMainIslandForPlayer(uid, data);
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new HttpsError("unavailable", "This Crownlands island is still being prepared. Try again.");
  }

  const cityDocs = await citiesRef.get();
  const campDocs = targetCampCount ? await campsRef.get() : { docs: [] };
  const existingCityDataById = new Map(cityDocs.docs.map(cityDoc => [cityDoc.id, cityDoc.data() || {}]));
  const existingCityIds = new Set(existingCityDataById.keys());
  const existingCampIds = new Set(campDocs.docs.map(campDoc => campDoc.id));
  const seedsToWrite = needsLayoutRefresh || needsGenerationStamp
    ? citySeeds
    : citySeeds.filter(city => !existingCityIds.has(city.id));
  const campSeedsToWrite = needsLayoutRefresh || needsGenerationStamp
    ? campSeeds
    : campSeeds.filter(camp => !existingCampIds.has(camp.id));

  const batch = db.batch();
  batch.set(seedLockRef, {
    status: "ready",
    ownerToken: seedOwnerToken,
    layoutSeedVersion: targetVersion,
    leaseUntilMs: 0,
    readyAtMs: Date.now(),
    updatedAtMs: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(islandRef, {
    id: islandId,
    ...safeMeta,
    regularCityCount: targetRegularCityCount,
    seededCityCount: targetCityCount,
    seededCampCount: targetCampCount,
    layoutSeedVersion: targetVersion,
    createdBy: islandData.createdBy || uid,
    createdAt: islandData.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  for (const city of seedsToWrite) {
    const alreadyExists = existingCityIds.has(city.id);
    const isStrongholdCity = city.kind === "stronghold" || Boolean(city.strongholdType);
    const { level: seedLevel, ...layoutPatch } = city;
    const staticPatch = {
      ...layoutPatch,
      ...(isStrongholdCity ? { level: clampCityLevel(seedLevel || 50) } : {}),
    };
    const initialTroops = isStrongholdCity
      ? Math.max(0, Math.floor(safeNumber(city.startTroops, 0)))
      : 0;
    batch.set(citiesRef.doc(city.id), {
      // Layout refreshes must never rewrite live city progression for existing towns.
      ...staticPatch,
      ...(alreadyExists ? {} : {
        ownerKind: "neutral",
        ownerUid: null,
        ownerName: "",
        ownerFlag: null,
        ownerKingPower: 0,
        ownerShieldExpiresAtMs: 0,
        isMainCity: false,
        level: clampCityLevel(seedLevel || (isStrongholdCity ? 50 : 1)),
        troops: initialTroops,
        troopFloat: initialTroops,
        investedGold: 0,
        lastCapturedAt: null,
        relinquishedAtMs: 0,
        relocatedAtMs: 0,
      }),
      ...(alreadyExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  for (const camp of campSeedsToWrite) {
    const alreadyExists = existingCampIds.has(camp.id);
    batch.set(campsRef.doc(camp.id), {
      ...camp,
      ...(alreadyExists ? {} : {
        holderUid: "",
        holderName: "",
        holderFlag: null,
        heldSinceMs: 0,
        payoutAtMs: 0,
        payoutPending: false,
        currentGarrison: camp.baseDefenders,
        returnSourceCityId: "",
        returnSourceRegionId: "",
        returnSourceCityName: "",
        returnPathSegments: [],
        returnRouteRegionIds: [],
        returnPathLength: 0,
        activeArmyIds: [],
        dailyRewardClaims: {},
        lastResetDate: "",
        state: "neutral",
      }),
      ...(alreadyExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  return {
    islandId,
    seeded: seedsToWrite.length > 0 || campSeedsToWrite.length > 0,
    refreshed: needsLayoutRefresh || needsGenerationStamp,
    writes: seedsToWrite.length + campSeedsToWrite.length,
    cityCount: targetCityCount,
    campCount: targetCampCount,
    version: targetVersion,
  };
}

exports.ensureMainIsland = timedCallable(
  "ensureMainIsland",
  { region: "us-central1", maxInstances: 20, invoker: "public" },
  async request => ensureMainIslandForPlayer(requireAuth(request), request.data || {})
);

const legacyClaimStartingCity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const authToken = request.auth?.token || {};
  const requestedIslandId = safeString(data.islandId || getOnlineIslandId(data.mainRegionId || "west"), 160);
  const regionId = requireKnownWorldRegionId(data.mainRegionId || getRegionIdFromOnlineIslandId(requestedIslandId));
  const islandId = getOnlineIslandId(regionId);
  if (requestedIslandId !== islandId) {
    throw new HttpsError("invalid-argument", "The requested starting island does not match the current Crownlands world.");
  }
  const allowedStartingCityIds = getServerWorldRegularCityIds(regionId);
  const worldId = safeString(data.worldId || ONLINE_WORLD_ID, 80) || ONLINE_WORLD_ID;
  const rawCandidateIds = Array.isArray(data.candidateCityIds) ? data.candidateCityIds : [];
  const candidateCityIds = [...new Set(rawCandidateIds
    .map(cityId => safeString(cityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_"))
    .filter(cityId => cityId && allowedStartingCityIds.has(cityId)))]
    .slice(0, 180);
  const minimumNeutralCities = Math.max(0, Math.floor(safeNumber(data.minimumNeutralCities, 0)));
  const displayName = safeString(data.displayName || authToken.name || "", 80);
  const email = safeString(data.email || authToken.email || "", 120);
  const photoURL = safeString(data.photoURL || authToken.picture || "", 300);
  const playerName = normalizePlayerName(data.playerName || displayName);
  if (!islandId || !candidateCityIds.length) {
    throw new HttpsError("invalid-argument", "No starting city candidates were provided.");
  }

  const playerRef = db.doc(`players/${uid}`);
  const islandRef = db.doc(`islands/${islandId}`);
  const cityRefForIsland = cityId => db.doc(`islands/${islandId}/cities/${cityId}`);

  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const playerSnap = await transaction.get(playerRef);
    const playerData = playerSnap.exists ? playerSnap.data() || {} : {};
    const ownedSnap = await transaction.get(db.collectionGroup("cities")
      .where("ownerUid", "==", uid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID));
    const ownedCityEntries = createOwnedCityEntriesFromSnapshot(uid, ownedSnap);
    const existingMainCityId = safeString(playerData.mainCityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
    const existingMainIslandId = safeString(playerData.mainIslandId, 160);
    const playerFlag = sanitizeJsonValue(data.flag || playerData.flag || null);
    const playerKingPower = Math.max(0, Math.floor(safeNumber(playerData.kingPower, 0)));

    const buildPlayerPatch = cityId => {
      const existingGoldFloat = safeNumber(playerData.goldFloat, safeNumber(playerData.gold, TEST_STARTING_GOLD));
      const goldFloat = Math.max(0, existingGoldFloat);
      const gold = Math.max(0, Math.floor(safeNumber(playerData.gold, goldFloat)));
      return {
        uid,
        displayName: displayName || safeString(playerData.displayName, 80),
        email: email || safeString(playerData.email, 120),
        photoURL: photoURL || safeString(playerData.photoURL, 300),
        playerName,
        flag: playerFlag,
        resetGeneration: playerData.resetGeneration || RESET_GENERATION,
        worldId,
        mainIslandId: islandId,
        mainRegionId: regionId,
        mainCityId: cityId,
        gold,
        goldFloat,
        character: normalizeCharacterProgress(playerData.character),
        upgrades: normalizeSkillUpgrades(playerData.upgrades),
        shopItems: normalizeShopItems(playerData.shopItems),
        itemEffects: normalizeItemEffects(playerData.itemEffects),
        itemPurchaseCooldowns: normalizeItemPurchaseCooldowns(playerData.itemPurchaseCooldowns),
        mainCityAssignmentVersion: MAIN_CITY_ASSIGNMENT_VERSION,
        economyUpdatedAtMs: Math.max(0, timestampToMs(playerData.economyUpdatedAtMs) || nowMs),
        updatedAt: FieldValue.serverTimestamp(),
      };
    };

    const writePlayerMainCity = cityId => {
      transaction.set(playerRef, buildPlayerPatch(cityId), { merge: true });
    };

    const writeCityOwner = (cityRef, cityData = {}, { setStartingTroops = false } = {}) => {
      const baseTroops = Math.max(0, Math.floor(safeNumber(cityData.troops, 0)));
      const troops = setStartingTroops ? Math.max(PLAYER_STARTING_TROOPS, baseTroops) : baseTroops;
      transaction.set(cityRef, {
        ownerKind: "player",
        ownerUid: uid,
        ownerName: playerName,
        ownerFlag: playerFlag,
        ownerKingPower: playerKingPower,
        troops,
        troopFloat: Math.max(troops, safeNumber(cityData.troopFloat, cityData.troops || troops)),
        isMainCity: true,
        relinquishedAtMs: 0,
        relocatedAtMs: 0,
        claimedAt: cityData.claimedAt || FieldValue.serverTimestamp(),
        productionUpdatedAtMs: Math.max(0, timestampToMs(cityData.productionUpdatedAtMs) || nowMs),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    };

    const readExistingMainCity = async () => {
      if (!existingMainCityId || !existingMainIslandId) return null;
      const existingRegionId = normalizeRegionId(playerData.mainRegionId || getRegionIdFromOnlineIslandId(existingMainIslandId));
      const ref = db.doc(`islands/${existingMainIslandId}/cities/${existingMainCityId}`);
      const snap = await transaction.get(ref);
      return snap.exists ? { ref, city: { id: snap.id, ...snap.data(), regionId: existingRegionId }, regionId: existingRegionId } : null;
    };

    const existingMain = await readExistingMainCity();
    if (existingMain?.city && getOwnerUid(existingMain.city) === uid) {
      const existingMainRegionId = normalizeRegionId(existingMain.city.regionId || regionId);
      const existingMainIsland = existingMain.ref.parent.parent.id;
      transaction.set(playerRef, {
        uid,
        displayName: displayName || safeString(playerData.displayName, 80),
        email: email || safeString(playerData.email, 120),
        photoURL: photoURL || safeString(playerData.photoURL, 300),
        playerName,
        flag: playerFlag,
        worldId,
        mainIslandId: existingMainIsland,
        mainRegionId: existingMainRegionId,
        mainCityId: existingMain.city.id,
        mainCityAssignmentVersion: MAIN_CITY_ASSIGNMENT_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(existingMain.ref, {
        ownerName: playerName,
        ownerFlag: playerFlag,
        ownerKingPower: playerKingPower,
        isMainCity: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const singleMainRepair = createSingleMainCityPatches(ownedCityEntries, existingMain.ref);
      writeExtraCityPatches(transaction, singleMainRepair.cityPatches);
      return {
        cityId: existingMain.city.id,
        islandId: existingMainIsland,
        mainRegionId: existingMainRegionId,
        alreadyClaimed: true,
        redirected: existingMainIsland !== islandId,
        repairedMainCities: singleMainRepair.cityPatches.length,
      };
    }

    const shouldScanOwnedCandidates = Boolean(existingMainCityId || existingMainIslandId || playerData.mainRegionId || playerData.worldId);
    if (shouldScanOwnedCandidates) {
      for (const cityId of candidateCityIds) {
        const cityRef = cityRefForIsland(cityId);
        const citySnap = await transaction.get(cityRef);
        if (!citySnap.exists) continue;
        const cityData = citySnap.data() || {};
        if (getOwnerUid(cityData) !== uid) continue;
        writePlayerMainCity(cityId);
        transaction.set(cityRef, {
          ownerName: playerName,
          ownerFlag: playerFlag,
          ownerKingPower: playerKingPower,
          isMainCity: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        const singleMainRepair = createSingleMainCityPatches(ownedCityEntries, cityRef);
        writeExtraCityPatches(transaction, singleMainRepair.cityPatches);
        return {
          cityId,
          islandId,
          mainRegionId: regionId,
          alreadyClaimed: true,
          repairedMainCities: singleMainRepair.cityPatches.length,
        };
      }
    }

    let chosenRef = null;
    let chosenData = null;
    let chosenCityId = "";
    let neutralCityCount = 0;
    for (const cityId of candidateCityIds) {
      const cityRef = cityRefForIsland(cityId);
      const citySnap = await transaction.get(cityRef);
      if (!citySnap.exists) continue;
      const cityData = citySnap.data() || {};
      const ownerUid = getOwnerUid(cityData);
      const ownerKind = cityData.ownerKind || cityData.owner || "neutral";
      const isNeutralRegularCity = !isStronghold({ id: cityId, ...cityData })
        && !ownerUid
        && ownerKind !== "player";
      if (!isNeutralRegularCity) continue;
      neutralCityCount += 1;
      if (!chosenRef) {
        chosenRef = cityRef;
        chosenData = cityData;
        chosenCityId = cityId;
      }
      if (!minimumNeutralCities || neutralCityCount >= minimumNeutralCities) break;
    }

    if (minimumNeutralCities > 0 && neutralCityCount < minimumNeutralCities) {
      throw new HttpsError("failed-precondition", `That map needs at least ${minimumNeutralCities} neutral cities before a new ruler can spawn there.`);
    }
    if (!chosenRef || !chosenCityId) {
      throw new HttpsError("resource-exhausted", "No unclaimed starting city is available.");
    }

    writePlayerMainCity(chosenCityId);
    const singleMainRepair = createSingleMainCityPatches(ownedCityEntries, chosenRef);
    writeExtraCityPatches(transaction, singleMainRepair.cityPatches);
    writeCityOwner(chosenRef, chosenData, { setStartingTroops: true });
    transaction.set(islandRef, {
      playerCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      cityId: chosenCityId,
      islandId,
      mainRegionId: regionId,
      alreadyClaimed: false,
      repairedMainCity: Boolean(existingMainCityId),
      repairedMainCities: singleMainRepair.cityPatches.length,
    };
  });
});

function shuffleStartingCityIds(regionId = "") {
  const values = [...getServerWorldRegularCityIds(regionId)];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function createFreshResetPlayerProfile({
  uid = "",
  previous = {},
  authToken = {},
  requestData = {},
  cityId = "",
  islandId = "",
  regionId = "",
  nowMs = Date.now(),
} = {}) {
  const displayName = safeString(requestData.displayName || authToken.name || previous.displayName, 80);
  const playerName = normalizePlayerName(previous.playerName || requestData.playerName || displayName);
  const flag = sanitizeJsonValue(previous.flag || requestData.flag || null);
  const profile = {
    uid,
    displayName,
    email: safeString(requestData.email || authToken.email || previous.email, 120),
    photoURL: safeString(requestData.photoURL || authToken.picture || previous.photoURL, 300),
    playerName,
    flag,
    resetGeneration: RESET_GENERATION,
    worldId: ONLINE_WORLD_ID,
    releaseId: REALM_RELEASE_ID,
    cloudSaveSlot: `default-${RESET_GENERATION}`,
    mainIslandId: islandId,
    mainRegionId: regionId,
    mainCityId: cityId,
    mainCityAssignmentVersion: MAIN_CITY_ASSIGNMENT_VERSION,
    gold: TEST_STARTING_GOLD,
    goldFloat: TEST_STARTING_GOLD,
    character: normalizeCharacterProgress({ level: CHARACTER_START_LEVEL, xp: CHARACTER_START_XP, skillPoints: 0 }),
    upgrades: normalizeSkillUpgrades({}),
    shopItems: createDefaultShopItems(),
    itemEffects: normalizeItemEffects({}),
    itemPurchaseCooldowns: normalizeItemPurchaseCooldowns({}),
    dailyLoginReward: createDefaultDailyLoginRewardState(),
    daily: normalizeDaily({}, new Date(nowMs)),
    harvestBonuses: [],
    harvestSpawnTimer: HARVEST_BONUS_SPAWN_INTERVAL_SECONDS,
    harvestNextSpawnAtMs: nowMs + HARVEST_BONUS_SPAWN_INTERVAL_SECONDS * 1000,
    harvestNextBonusType: "gold",
    scoutReports: {},
    battleReports: [],
    marchPercent: DEFAULT_MARCH_PERCENT,
    gameSeconds: 0,
    localGameSeconds: 0,
    economyUpdatedAtMs: nowMs,
    lastRealTimeMs: nowMs,
    lastSeenAtMs: nowMs,
    createdAt: previous.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (previous.activeSession && typeof previous.activeSession === "object") {
    profile.activeSession = sanitizeJsonValue(previous.activeSession);
  }
  if (previous.notificationPreferences && typeof previous.notificationPreferences === "object") {
    profile.notificationPreferences = sanitizeJsonValue(previous.notificationPreferences);
  }
  return profile;
}

async function claimFreshStartingCity(request) {
  const uid = requireAuth(request);
  const data = request.data || {};
  const authToken = request.auth?.token || {};
  if (!STARTER_REGION_IDS.length) {
    throw new HttpsError("failed-precondition", "No starter islands are configured.");
  }

  await Promise.all(STARTER_REGION_IDS.map(regionId => ensureMainIslandForPlayer(uid, { regionId })));
  const shuffledCityIdsByRegion = new Map(
    STARTER_REGION_IDS.map(regionId => [regionId, shuffleStartingCityIds(regionId)])
  );
  const playerRef = db.doc(`players/${uid}`);

  const runClaimTransaction = async (transaction, placement) => {
    const nowMs = Date.now();
    const playerSnap = await transaction.get(playerRef);
    const previous = playerSnap.exists ? playerSnap.data() || {} : {};
    const currentProfile = safeString(previous.resetGeneration, 120) === RESET_GENERATION
      && safeString(previous.worldId, 120) === ONLINE_WORLD_ID;
    const existingMainCityId = safeString(previous.mainCityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
    const existingMainIslandId = safeString(previous.mainIslandId, 160);

    if (currentProfile && existingMainCityId && isCurrentWorldIslandId(existingMainIslandId)) {
      const existingMainRef = db.doc(`islands/${existingMainIslandId}/cities/${existingMainCityId}`);
      const existingMainSnap = await transaction.get(existingMainRef);
      if (existingMainSnap.exists && getOwnerUid(existingMainSnap.data() || {}) === uid) {
        const existingRegionId = normalizeRegionId(
          previous.mainRegionId || getRegionIdFromOnlineIslandId(existingMainIslandId)
        );
        return {
          ok: true,
          cityId: existingMainCityId,
          islandId: existingMainIslandId,
          mainRegionId: existingRegionId,
          worldId: ONLINE_WORLD_ID,
          resetGeneration: RESET_GENERATION,
          releaseId: REALM_RELEASE_ID,
          alreadyClaimed: true,
          currentUser: {
            playerName: normalizePlayerName(previous.playerName || previous.displayName),
            flag: previous.flag || null,
            gold: Math.max(0, Math.floor(safeNumber(previous.gold, TEST_STARTING_GOLD))),
            character: normalizeCharacterProgress(previous.character),
            mainCityId: existingMainCityId,
            mainIslandId: existingMainIslandId,
            mainRegionId: existingRegionId,
            worldId: ONLINE_WORLD_ID,
            resetGeneration: RESET_GENERATION,
          },
        };
      }
    }

    const chosenIsland = placement.island;
    const chosenIslandSnap = await transaction.get(chosenIsland.ref);
    const placementSlotSnap = await transaction.get(placement.slotRef);
    const placementSlot = placementSlotSnap.exists ? placementSlotSnap.data() || {} : {};
    const currentPopulation = chosenIslandSnap.exists
      ? Math.max(0, Math.floor(safeNumber(chosenIslandSnap.data()?.playerCount, 0)))
      : -1;
    if (
      !chosenIslandSnap.exists
      || safeString(chosenIslandSnap.data()?.resetGeneration, 120) !== RESET_GENERATION
      || currentPopulation !== placement.expectedPopulation
      || !placementSlotSnap.exists
      || safeString(placementSlot.status, 24) !== "reserved"
      || safeString(placementSlot.reservationId, 96) !== placement.reservationId
    ) {
      const contentionError = new Error("Starting-city placement changed while the claim was being prepared.");
      contentionError.code = 10;
      contentionError.details = "placement contention";
      throw contentionError;
    }
    const candidateIds = shuffledCityIdsByRegion.get(chosenIsland.regionId) || [];

    let chosenCityRef = null;
    let chosenCity = null;
    for (const cityId of candidateIds) {
      const cityRef = db.doc(`islands/${chosenIsland.islandId}/cities/${cityId}`);
      const citySnap = await transaction.get(cityRef);
      if (!citySnap.exists) continue;
      const city = { id: citySnap.id, ...citySnap.data() };
      if (safeString(city.resetGeneration, 120) !== RESET_GENERATION) continue;
      if (getOwnerUid(city) || isStronghold(city)) continue;
      chosenCityRef = cityRef;
      chosenCity = city;
      break;
    }
    if (!chosenCityRef || !chosenCity) {
      throw new HttpsError("resource-exhausted", "No unclaimed starting city is available.");
    }

    const freshProfile = createFreshResetPlayerProfile({
      uid,
      previous,
      authToken,
      requestData: data,
      cityId: chosenCity.id,
      islandId: chosenIsland.islandId,
      regionId: chosenIsland.regionId,
      nowMs,
    });
    const cityPatch = {
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      ownerKind: "player",
      ownerUid: uid,
      ownerName: freshProfile.playerName,
      ownerFlag: freshProfile.flag,
      ownerKingPower: 0,
      kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
      ownerShieldExpiresAtMs: 0,
      troops: PLAYER_STARTING_TROOPS,
      troopFloat: PLAYER_STARTING_TROOPS,
      level: 1,
      defense: 1,
      investedGold: 0,
      isMainCity: true,
      claimedAt: FieldValue.serverTimestamp(),
      productionUpdatedAtMs: nowMs,
      relinquishedAtMs: 0,
      relocatedAtMs: 0,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const stats = createGlobalStatsSnapshot({
      uid,
      profile: freshProfile,
      cityEntries: [{
        ref: chosenCityRef,
        city: { ...chosenCity, ...cityPatch, id: chosenCity.id, regionId: chosenIsland.regionId },
      }],
      heldCamps: [],
      activeArmies: [],
      nowMs,
    });

    transaction.set(playerRef, {
      ...freshProfile,
      kingPower: stats.kingPower,
      kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
      kingPowerUpdatedAtMs: nowMs,
    });
    transaction.set(chosenCityRef, cityPatch, { merge: true });
    transaction.set(chosenIsland.ref, {
      playerCount: placement.expectedPopulation + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(placement.slotRef, {
      status: "claimed",
      expiresAtMs: 0,
      claimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(playerGlobalStatsRef(uid), stats);
    transaction.set(leaderboardEntryRef(uid), {
      uid,
      displayName: freshProfile.playerName,
      playerName: freshProfile.playerName,
      flag: freshProfile.flag,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      kingPower: stats.kingPower,
      kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
      kingPowerUpdatedAtMs: nowMs,
      cityCount: 1,
      totalTroops: PLAYER_STARTING_TROOPS,
      mainCityId: chosenCity.id,
      mainRegionId: chosenIsland.regionId,
      mainIslandId: chosenIsland.islandId,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeOwnershipChangeEvent(transaction, {
      eventId: `claim_${uid}`,
      targetType: "city",
      targetId: chosenCity.id,
      regionId: chosenIsland.regionId,
      beforeOwnerUid: "",
      afterOwnerUid: uid,
      reason: "starting_city_claim",
      nowMs,
    });

    return {
      ok: true,
      cityId: chosenCity.id,
      islandId: chosenIsland.islandId,
      mainRegionId: chosenIsland.regionId,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      releaseId: REALM_RELEASE_ID,
      alreadyClaimed: false,
      currentUser: {
        playerName: freshProfile.playerName,
        flag: freshProfile.flag,
        gold: TEST_STARTING_GOLD,
        character: freshProfile.character,
        upgrades: freshProfile.upgrades,
        shopItems: freshProfile.shopItems,
        itemEffects: freshProfile.itemEffects,
        itemPurchaseCooldowns: freshProfile.itemPurchaseCooldowns,
        dailyLoginReward: freshProfile.dailyLoginReward,
        mainCityId: chosenCity.id,
        mainIslandId: chosenIsland.islandId,
        mainRegionId: chosenIsland.regionId,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        globalStats: globalStatsForClient(stats),
      },
    };
  };

  const releasePlacementReservation = async placement => {
    if (!placement?.slotRef || !placement?.reservationId) return;
    try {
      const snapshot = await placement.slotRef.get();
      const reservation = snapshot.exists ? snapshot.data() || {} : {};
      if (
        snapshot.exists
        && safeString(reservation.status, 24) === "reserved"
        && safeString(reservation.reservationId, 96) === placement.reservationId
      ) {
        await placement.slotRef.delete({ lastUpdateTime: snapshot.updateTime });
      }
    } catch (error) {
      const code = Number(error?.code);
      if (code !== 5 && code !== 9 && code !== 10) throw error;
    }
  };

  const acquirePlacementReservation = async placement => {
    const nowMs = Date.now();
    const reservation = {
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      regionId: placement.island.regionId,
      islandId: placement.island.islandId,
      populationOrdinal: placement.expectedPopulation,
      claimedByUid: uid,
      reservationId: placement.reservationId,
      status: "reserved",
      reservedAtMs: nowMs,
      expiresAtMs: nowMs + 30_000,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    try {
      await placement.slotRef.create(reservation);
      return true;
    } catch (error) {
      const code = Number(error?.code);
      const alreadyExists = code === 6
        || safeString(error?.message, 240).toLowerCase().includes("already exists");
      if (!alreadyExists) throw error;
    }

    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(placement.slotRef);
      const existing = snapshot.exists ? snapshot.data() || {} : {};
      const expired = safeString(existing.status, 24) === "reserved"
        && safeNumber(existing.expiresAtMs, 0) <= nowMs;
      if (!snapshot.exists || expired) {
        transaction.set(placement.slotRef, reservation);
        return true;
      }
      return false;
    }, { maxAttempts: 3 });
  };

  const maxContentionAttempts = 40;
  for (let attempt = 1; attempt <= maxContentionAttempts; attempt += 1) {
    const islandRefs = STARTER_REGION_IDS.map(regionId => db.doc(`islands/${getOnlineIslandId(regionId)}`));
    const islandSnapshots = await db.getAll(...islandRefs);
    const islandEntries = islandSnapshots.flatMap((snap, index) => {
      const island = snap.exists ? snap.data() || {} : {};
      if (!snap.exists || safeString(island.resetGeneration, 120) !== RESET_GENERATION) return [];
      return [{
        ref: snap.ref,
        regionId: STARTER_REGION_IDS[index],
        islandId: snap.id,
        playerCount: Math.max(0, Math.floor(safeNumber(island.playerCount, 0))),
      }];
    });
    if (!islandEntries.length) {
      throw new HttpsError("failed-precondition", "Starter islands are still being prepared.");
    }
    const minimumPopulation = Math.min(...islandEntries.map(entry => entry.playerCount));
    const leastPopulated = islandEntries.filter(entry => entry.playerCount === minimumPopulation);
    const chosenIsland = leastPopulated[crypto.randomInt(0, leastPopulated.length)];
    const placement = {
      island: chosenIsland,
      expectedPopulation: minimumPopulation,
      reservationId: crypto.randomUUID(),
      slotRef: db.doc(
        `realmSeeds/${RESET_GENERATION}/startingSlots/${chosenIsland.regionId}_${minimumPopulation}`
      ),
    };

    const reservationAcquired = await acquirePlacementReservation(placement);
    if (!reservationAcquired) {
      const reservationDelayMs = crypto.randomInt(10, Math.min(220, 20 + attempt * 12));
      await new Promise(resolve => setTimeout(resolve, reservationDelayMs));
      continue;
    }

    try {
      const result = await db.runTransaction(
        transaction => runClaimTransaction(transaction, placement),
        { maxAttempts: 1 }
      );
      if (result?.alreadyClaimed) await releasePlacementReservation(placement);
      return result;
    } catch (error) {
      await releasePlacementReservation(placement);
      const errorCode = Number(error?.code);
      const retryableContention = errorCode === 10
        || safeString(error?.details, 200).toLowerCase().includes("transaction lock timeout")
        || safeString(error?.message, 300).toLowerCase().includes("aborted");
      if (!retryableContention || attempt >= maxContentionAttempts) throw error;

      const backoffCeilingMs = Math.min(300, 15 * (2 ** Math.min(attempt - 1, 5)));
      const retryDelayMs = crypto.randomInt(10, backoffCeilingMs + 11);
      logOperation("claimStartingCityContention", Date.now(), request, "retry", {
        attempt,
        retryDelayMs,
      });
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new HttpsError("aborted", "Starting-city placement is busy. Try again.");
}

exports.claimStartingCity = timedCallable(
  "claimStartingCity",
  { region: "us-central1", timeoutSeconds: 120, maxInstances: 20, invoker: "public" },
  claimFreshStartingCity
);

exports.upgradeCity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const cityId = safeString(data.cityId || data.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const regionId = normalizeRegionId(data.regionId || data.islandId || "west");
  const requestedLevels = clampInt(data.levels || 1, 1, 25);
  if (!cityId) throw new HttpsError("invalid-argument", "Choose a city to upgrade.");

  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const cityRef = cityRefForRegion(regionId, cityId);
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    const cityEntry = getEconomyCityByRef(economy, cityRef);
    if (!cityEntry?.city || getOwnerUid(cityEntry.city) !== uid) {
      throw new HttpsError("permission-denied", "You can only upgrade your own city.");
    }
    if (isStronghold(cityEntry.city)) {
      throw new HttpsError("failed-precondition", "Strongholds cannot be upgraded.");
    }

    const city = { ...cityEntry.city };
    let goldFloat = Math.max(0, safeNumber(economy.goldFloat, economy.gold));
    let gold = Math.max(0, Math.floor(goldFloat));
    let investedGold = Math.max(0, Math.floor(safeNumber(city.investedGold, 0)));
    let upgraded = 0;
    let spentGold = 0;
    const upgradeBonuses = {
      ...economy.bonuses,
      upgradeCostReductionPercent: Math.min(
        85,
        Math.max(0, safeNumber(economy.bonuses.upgradeCostReductionPercent, 0))
          + getSkillPercent(economy.profileAfter, "guildCharters")
      ),
    };

    while (upgraded < requestedLevels) {
      const cost = getCityUpgradeCost(city, upgradeBonuses);
      if (!Number.isFinite(cost) || gold < cost) break;
      const nextLevel = clampCityLevel(city.level + 1);
      if (nextLevel <= clampCityLevel(city.level)) break;
      goldFloat = Math.max(0, goldFloat - cost);
      gold = Math.max(0, Math.floor(goldFloat));
      investedGold += cost;
      city.level = nextLevel;
      spentGold += cost;
      upgraded += 1;
    }

    if (!upgraded) {
      throw new HttpsError(
        "failed-precondition",
        Number.isFinite(getCityUpgradeCost(city, upgradeBonuses))
          ? "Not enough gold to upgrade that city."
          : "That upgrade is outside the supported number range."
      );
    }

    const cityPatch = {
      level: city.level,
      investedGold,
      productionUpdatedAtMs: nowMs,
    };
    const latestCity = getEconomyCityByRef(economy, cityRef)?.city || city;
    const cityUpdate = {
      id: city.id,
      regionId: city.regionId || regionId,
      troops: Math.max(0, Math.floor(safeNumber(latestCity.troops, 0))),
      troopFloat: Math.max(0, safeNumber(latestCity.troopFloat, latestCity.troops || 0)),
      ...cityPatch,
    };

    writePreparedEconomy(transaction, economy, {
      gold,
      goldFloat,
    }, [{ ref: cityRef, city, patch: cityPatch }]);

    return createEconomyResponse(economy, {
      gold,
      goldFloat,
      cityUpdates: [...economy.cityUpdates, cityUpdate],
      spentGold,
      upgraded,
    });
  });
});

exports.relinquishCity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const cityId = safeString(data.cityId || data.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const regionId = requireKnownWorldRegionId(data.regionId || getRegionIdFromOnlineIslandId(data.islandId) || "west");
  const order = normalizeArmyPayload(data, uid);
  if (!cityId) throw new HttpsError("invalid-argument", "Choose a city to relinquish.");

  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const cityRef = cityRefForRegion(regionId, cityId);
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    const sourceEntry = getEconomyCityByRef(economy, cityRef);
    if (!sourceEntry?.city || getOwnerUid(sourceEntry.city) !== uid) {
      throw new HttpsError("permission-denied", "You can only relinquish your own city.");
    }

    const source = sourceEntry.city;
    const profileMainCityId = safeString(economy.profileAfter.mainCityId || economy.profileBefore.mainCityId, 96);
    if (!isStronghold(source) && (source.isMainCity || source.id === profileMainCityId)) {
      throw new HttpsError("failed-precondition", "You cannot relinquish your main city.");
    }

    const destinationEntry = findNearestRelinquishDestination(economy, sourceEntry);
    if (!destinationEntry?.city) {
      throw new HttpsError("failed-precondition", "You need another friendly city to receive the troops.");
    }

    const transferredTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0)));
    const destination = destinationEntry.city;
    const destinationRegionId = normalizeRegionId(destination.regionId || destination.startPool || regionId);
    let movement = null;
    let armyRefs = [];

    if (transferredTroops > 0) {
      if (
        order.kind !== "transfer"
        || order.fromId !== source.id
        || order.toId !== destination.id
        || order.sourceRegionId !== regionId
        || order.targetRegionId !== destinationRegionId
      ) {
        throw new HttpsError("invalid-argument", "The relinquish march does not match the nearest friendly city.");
      }
      const validatedRoute = validateArmyRoute(order, source, destination);
      armyRefs = armyRefsForRegions(validatedRoute.routeRegionIds, order.id);
      if (!armyRefs.length) {
        throw new HttpsError("invalid-argument", "The relinquish march has no valid island route.");
      }
      const existingArmySnap = await transaction.get(armyRefs[0]);
      if (existingArmySnap.exists) {
        throw new HttpsError("already-exists", "That relinquish march has already been created.");
      }

      const currentStats = createPreparedEconomyStatsSnapshot(economy, {}, { nowMs });
      const ownerKingPower = Math.max(0, Math.floor(safeNumber(currentStats?.kingPower, 0)));
      const duration = calculateTravelTime({
        pathLength: validatedRoute.pathLength,
        troopCount: transferredTroops,
        kind: "transfer",
        speedMultiplier: skillMultiplier(economy.profileAfter, "marchOrders")
          * (1 + Math.max(0, safeNumber(economy.bonuses.marchSpeedBonusPercent, 0)) / 100),
      });
      movement = {
        id: order.id,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        ownerKind: "player",
        ownerUid: uid,
        ownerName: normalizePlayerName(economy.profileAfter.playerName || order.ownerName || source.ownerName || request.auth.token?.name),
        ownerFlag: economy.profileAfter.flag || order.ownerFlag || source.ownerFlag || null,
        ownerKingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        kind: "transfer",
        fromId: source.id,
        toId: destination.id,
        sourceRegionId: regionId,
        targetRegionId: destinationRegionId,
        fromName: safeString(source.name || order.fromName, 40),
        toName: safeString(destination.name || order.toName, 40),
        troops: transferredTroops,
        requestedTroops: transferredTroops,
        total: duration,
        path: validatedRoute.path,
        pathSegments: validatedRoute.pathSegments,
        routeRegionIds: validatedRoute.routeRegionIds,
        viewRegionIds: validatedRoute.routeRegionIds,
        pathLength: validatedRoute.pathLength,
        targetKey: `${destinationRegionId}:${destination.id}`,
        targetOwnerAtLaunch: "player",
        targetOwnerUid: uid,
        attackerKingPower: ownerKingPower,
        defenderKingPower: ownerKingPower,
        demoAttack: null,
        launchedAtMs: nowMs,
        arrivesAtMs: nowMs + Math.ceil(duration * 1000),
        status: "active",
        createdByServer: true,
        serverAuthorityVersion: 2,
        relinquishTransfer: true,
      };
    }

    const sourceLevel = isStronghold(source) ? getStrongholdDefenseLevel(source) : clampCityLevel(source.level);
    const sourcePatch = {
      ownerKind: "neutral",
      ownerUid: null,
      ownerName: "",
      ownerFlag: null,
      ownerKingPower: 0,
      ownerShieldExpiresAtMs: 0,
      level: sourceLevel,
      troops: 0,
      troopFloat: 0,
      investedGold: 0,
      isMainCity: false,
      productionUpdatedAtMs: nowMs,
      relinquishedAtMs: nowMs,
      relocatedAtMs: 0,
    };

    const sourceUpdate = {
      id: source.id,
      regionId: source.regionId || regionId,
      ...sourcePatch,
    };

    if (isCrownCitadel(source)) {
      await recordCrownCitadelControlChange(transaction, {
        citadel: source,
        previousOwnerUid: uid,
        previousOwnerName: normalizePlayerName(economy.profileAfter.playerName || source.ownerName, "Ruler"),
        nextOwnerUid: "",
        nowMs,
      });
    }
    writeOwnershipChangeEvent(transaction, {
      eventId: `relinquish_${uid}_${source.id}_${nowMs}`,
      targetType: "city",
      targetId: source.id,
      regionId: source.regionId || regionId,
      beforeOwnerUid: uid,
      afterOwnerUid: "",
      reason: "city_relinquished",
      nowMs,
    });

    writePreparedEconomy(transaction, economy, {}, [
      { ref: sourceEntry.ref, city: source, patch: sourcePatch },
    ], {
      addActiveArmies: movement ? [movement] : [],
      nowMs,
    });

    writeArmyMovementCopies(transaction, movement, { includeCreatedAt: true });

    return createEconomyResponse(economy, {
      cityUpdates: [...economy.cityUpdates, sourceUpdate],
      relinquishedCity: {
        id: source.id,
        name: safeString(source.name || source.id, 80),
        regionId: source.regionId || regionId,
        level: sourceLevel,
      },
      destinationCity: {
        id: destination.id,
        name: safeString(destination.name || destination.id, 80),
        regionId: destinationRegionId,
      },
      transferredTroops,
      movement,
    });
  });
});

exports.relocateMainCity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  requireAuth(request);
  throw new HttpsError(
    "failed-precondition",
    "Main city relocation has been removed. Choose one of your owned cities as your main city instead."
  );
});

exports.purchaseShopItem = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const itemId = safeString(data.itemId, 64);
  const item = SHOP_ITEMS[itemId];
  if (!item) throw new HttpsError("invalid-argument", "That shop item does not exist.");
  if (Number.isFinite(Number(data.cost)) && Math.floor(safeNumber(data.cost, 0)) !== item.cost) {
    throw new HttpsError("failed-precondition", "Shop item price changed. Reload Crownlands and try again.");
  }

  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    let goldFloat = Math.max(0, safeNumber(economy.goldFloat, economy.gold));
    let gold = Math.max(0, Math.floor(goldFloat));
    if (gold < item.cost) {
      throw new HttpsError("failed-precondition", `${item.label} costs ${item.cost.toLocaleString()} gold.`);
    }
    const purchaseStatus = getItemPurchaseStatus(itemId, economy.itemPurchaseCooldowns, nowMs);
    if (purchaseStatus.remainingMs > 0) {
      const purchaseRule = purchaseStatus.limit === 1
        ? "once per UTC day"
        : `${purchaseStatus.limit} times per UTC day`;
      throw new HttpsError(
        "failed-precondition",
        `${item.label} can only be purchased ${purchaseRule}. UTC reset in ${formatCooldownMs(purchaseStatus.remainingMs)}.`
      );
    }

    goldFloat = Math.max(0, goldFloat - item.cost);
    gold = Math.max(0, Math.floor(goldFloat));
    const shopItems = { ...economy.shopItems };
    shopItems[itemId] = Math.max(0, Math.floor(safeNumber(shopItems[itemId], 0))) + 1;
    const itemPurchaseCooldowns = {
      ...economy.itemPurchaseCooldowns,
      ...(purchaseStatus.limit > 0 ? {
        [itemId]: {
          utcDate: purchaseStatus.utcDate,
          purchaseCount: Math.min(purchaseStatus.limit, purchaseStatus.count + 1),
        },
      } : {}),
    };

    writePreparedEconomy(transaction, economy, {
      gold,
      goldFloat,
      shopItems,
      itemPurchaseCooldowns,
    });

    return createEconomyResponse(economy, {
      gold,
      goldFloat,
      shopItems,
      itemPurchaseCooldowns,
    });
  });
});

exports.activateInventoryItem = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const itemId = safeString(data.itemId, 64);
  const item = SHOP_ITEMS[itemId];
  if (!item) throw new HttpsError("invalid-argument", "That inventory item does not exist.");
  if (![ROYAL_PEACE_SHIELD_ITEM_ID, WAR_DRUMS_ITEM_ID, ROYAL_TAX_DECREE_ITEM_ID, VEIL_OF_SILENCE_ITEM_ID].includes(itemId)) {
    throw new HttpsError("failed-precondition", "That item effect is not active yet.");
  }

  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    const shopItems = { ...economy.shopItems };
    const owned = Math.max(0, Math.floor(safeNumber(shopItems[itemId], 0)));
    if (owned <= 0) throw new HttpsError("failed-precondition", `You do not have ${item.label}.`);

    const itemEffects = { ...economy.itemEffects };
    let expiresAtMs = 0;
    const extraCityPatches = [];
    const extraCityUpdates = [];
    if (itemId === ROYAL_PEACE_SHIELD_ITEM_ID) {
      const currentExpiresAtMs = timestampToMs(itemEffects.shieldExpiresAtMs);
      if (currentExpiresAtMs > nowMs) {
        throw new HttpsError("failed-precondition", `${item.label} is already active.`);
      }
      expiresAtMs = nowMs + ROYAL_PEACE_SHIELD_DURATION_MS;
      itemEffects.shieldExpiresAtMs = expiresAtMs;
      economy.cityEntries.forEach(entry => {
        const shieldValue = isStronghold(entry.city) ? 0 : expiresAtMs;
        const patch = { ownerShieldExpiresAtMs: shieldValue };
        extraCityPatches.push({ ref: entry.ref, city: entry.city, patch });
        extraCityUpdates.push({
          id: entry.city.id,
          regionId: entry.city.regionId,
          ...patch,
        });
      });
    } else if (itemId === WAR_DRUMS_ITEM_ID) {
      const currentExpiresAtMs = timestampToMs(itemEffects.warDrumsExpiresAtMs);
      if (currentExpiresAtMs > nowMs) {
        throw new HttpsError("failed-precondition", `${item.label} is already active.`);
      }
      expiresAtMs = nowMs + WAR_DRUMS_DURATION_MS;
      itemEffects.warDrumsExpiresAtMs = expiresAtMs;
    } else if (itemId === ROYAL_TAX_DECREE_ITEM_ID) {
      const currentExpiresAtMs = timestampToMs(itemEffects.royalTaxDecreeExpiresAtMs);
      if (currentExpiresAtMs > nowMs) {
        throw new HttpsError("failed-precondition", `${item.label} is already active.`);
      }
      expiresAtMs = nowMs + ROYAL_TAX_DECREE_DURATION_MS;
      itemEffects.royalTaxDecreeExpiresAtMs = expiresAtMs;
    } else if (itemId === VEIL_OF_SILENCE_ITEM_ID) {
      const currentExpiresAtMs = timestampToMs(itemEffects.veilOfSilenceExpiresAtMs);
      if (currentExpiresAtMs > nowMs) {
        throw new HttpsError("failed-precondition", `${item.label} is already active.`);
      }
      expiresAtMs = nowMs + VEIL_OF_SILENCE_DURATION_MS;
      itemEffects.veilOfSilenceExpiresAtMs = expiresAtMs;
    }
    shopItems[itemId] = owned - 1;

    writePreparedEconomy(transaction, economy, {
      shopItems,
      itemEffects,
    }, extraCityPatches);

    return createEconomyResponse(economy, {
      shopItems,
      itemEffects,
      cityUpdates: [...economy.cityUpdates, ...extraCityUpdates],
      activatedItemId: itemId,
      expiresAtMs,
    });
  });
});

exports.useSwiftMarchOrder = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const armyId = safeString(request.data?.armyId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!armyId) throw new HttpsError("invalid-argument", "Choose an active troop transfer.");

  const armyRef = canonicalArmyRef(armyId);
  const profileRef = db.doc(`players/${uid}`);
  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const [armySnap, profileSnap] = await Promise.all([
      transaction.get(armyRef),
      transaction.get(profileRef),
    ]);
    if (!armySnap.exists) throw new HttpsError("not-found", "That troop transfer is no longer active.");
    if (!profileSnap.exists) throw new HttpsError("not-found", "Your player profile was not found.");

    const army = { id: armySnap.id, ...armySnap.data() };
    if (army.status !== "active") throw new HttpsError("failed-precondition", "That troop transfer has already arrived.");
    if (getOwnerUid(army) !== uid) throw new HttpsError("permission-denied", "You can only speed up your own troop transfers.");
    if (army.kind !== "transfer" || army.targetType === "camp" || army.relinquishTransfer) {
      throw new HttpsError("failed-precondition", "Swift March Orders only work on owned-city transfers and owned Stronghold reinforcements.");
    }
    if (army.returning) {
      throw new HttpsError("failed-precondition", "A returning army cannot use a Swift March Order.");
    }
    if (timestampToMs(army.swiftMarchUsedAtMs) > 0) {
      throw new HttpsError("failed-precondition", "A Swift March Order has already been used on this transfer.");
    }

    const sourceRegionId = normalizeRegionId(army.sourceRegionId);
    const targetRegionId = normalizeRegionId(army.targetRegionId);
    if (!sourceRegionId || !targetRegionId || !army.fromId || !army.toId) {
      throw new HttpsError("failed-precondition", "That troop transfer is missing its city route.");
    }
    const sourceRef = cityRefForRegion(sourceRegionId, army.fromId);
    const targetRef = cityRefForRegion(targetRegionId, army.toId);
    const [sourceSnap, targetSnap] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(targetRef),
    ]);
    if (!sourceSnap.exists || !targetSnap.exists) {
      throw new HttpsError("not-found", "One of the transfer cities no longer exists.");
    }
    const source = { id: sourceSnap.id, ...sourceSnap.data() };
    const target = { id: targetSnap.id, ...targetSnap.data() };
    if (!canUseSwiftMarchOrderOnTransfer(army, source, target, uid)) {
      throw new HttpsError("failed-precondition", "Swift March Orders only work on transfers between owned cities or reinforcements to an owned Stronghold.");
    }

    const profile = profileSnap.data() || {};
    const shopItems = normalizeShopItems(profile.shopItems);
    const owned = Math.max(0, Math.floor(safeNumber(shopItems[SWIFT_MARCH_ORDER_ITEM_ID], 0)));
    if (owned <= 0) throw new HttpsError("failed-precondition", "You do not have a Swift March Order.");

    const oldArrivesAtMs = Math.max(0, Math.floor(safeNumber(army.arrivesAtMs, 0)));
    const remainingBeforeMs = oldArrivesAtMs - nowMs;
    if (remainingBeforeMs <= SWIFT_MARCH_MINIMUM_REMAINING_MS) {
      throw new HttpsError("failed-precondition", "That troop transfer is too close to arrival to speed up.");
    }
    const launchedAtMs = Math.max(0, Math.floor(safeNumber(
      army.launchedAtMs,
      oldArrivesAtMs - Math.max(100, safeNumber(army.total, 0.1) * 1000)
    )));
    const originalTotalMs = Math.max(100, Math.floor(safeNumber(army.total, 0.1) * 1000));
    const progressAtUse = Math.max(0, Math.min(0.999999, 1 - remainingBeforeMs / originalTotalMs));
    const remainingAfterMs = Math.max(
      SWIFT_MARCH_MINIMUM_REMAINING_MS,
      Math.ceil(remainingBeforeMs * SWIFT_MARCH_REMAINING_TIME_MULTIPLIER)
    );
    const arrivesAtMs = nowMs + remainingAfterMs;
    const movementPatch = {
      arrivesAtMs,
      total: Math.max(0.1, (arrivesAtMs - launchedAtMs) / 1000),
      swiftMarchUsedAtMs: nowMs,
      swiftMarchOriginalArrivesAtMs: oldArrivesAtMs,
      swiftMarchProgressAtUse: progressAtUse,
      swiftMarchRemainingMultiplier: SWIFT_MARCH_REMAINING_TIME_MULTIPLIER,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const routeRegionIds = normalizeRegionIds([
      ...(army.routeRegionIds || []),
      sourceRegionId,
      targetRegionId,
    ]);
    writeArmyMovementCopies(transaction, { ...army, ...movementPatch, id: armyId }, {
      previousTargetOwnerUid: army.targetOwnerUid,
    });
    shopItems[SWIFT_MARCH_ORDER_ITEM_ID] = owned - 1;
    transaction.set(profileRef, {
      shopItems,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const movement = { ...army, ...movementPatch };
    delete movement.updatedAt;
    return {
      ok: true,
      movement,
      secondsSaved: Math.max(0, Math.floor((remainingBeforeMs - remainingAfterMs) / 1000)),
      currentUser: {
        shopItems,
      },
    };
  });
});

exports.useRecallHorn = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const armyId = safeString(request.data?.armyId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!armyId) throw new HttpsError("invalid-argument", "Choose an active troop march.");

  const armyRef = canonicalArmyRef(armyId);
  const profileRef = db.doc(`players/${uid}`);
  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const [armySnap, profileSnap] = await Promise.all([
      transaction.get(armyRef),
      transaction.get(profileRef),
    ]);
    if (!armySnap.exists) throw new HttpsError("not-found", "That troop march is no longer active.");
    if (!profileSnap.exists) throw new HttpsError("not-found", "Your player profile was not found.");

    const army = { id: armySnap.id, ...armySnap.data() };
    if (army.status !== "active") throw new HttpsError("failed-precondition", "That troop march has already arrived.");
    if (getOwnerUid(army) !== uid) throw new HttpsError("permission-denied", "You can only recall your own troop marches.");
    if (army.kind === "scout") throw new HttpsError("failed-precondition", "Recall Horns cannot be used on scouts.");
    if (army.campReturn) throw new HttpsError("failed-precondition", "Troops withdrawing from a camp are already returning home.");
    if (army.returning || timestampToMs(army.recalledAtMs) > 0) {
      throw new HttpsError("failed-precondition", "That army is already returning.");
    }

    const sourceRegionId = normalizeRegionId(army.sourceRegionId);
    const targetRegionId = normalizeRegionId(army.targetRegionId);
    if (!sourceRegionId || !targetRegionId || !army.fromId || !army.toId) {
      throw new HttpsError("failed-precondition", "That troop march is missing its route.");
    }
    const targetCampRef = army.targetType === "camp" ? campRefForRegion(targetRegionId, army.toId) : null;
    const targetCampSnap = targetCampRef ? await transaction.get(targetCampRef) : null;
    const rallyRef = army.rallyAttack && army.rallyClanId && army.rallyId
      ? clanRallyRef(army.rallyClanId, army.rallyId)
      : null;
    const rallySnap = rallyRef ? await transaction.get(rallyRef) : null;
    const rally = normalizeClanRally(rallySnap);
    if (army.rallyAttack && (
      !rally
      || rally.leaderUid !== uid
      || rally.armyId !== armyId
      || ![RALLY_STATUS_LAUNCHED, RALLY_STATUS_RECALLING].includes(rally.status)
    )) {
      throw new HttpsError("failed-precondition", "That rally can no longer be recalled.");
    }

    const oldArrivesAtMs = Math.max(0, Math.floor(safeNumber(army.arrivesAtMs, 0)));
    const remainingBeforeMs = oldArrivesAtMs - nowMs;
    if (remainingBeforeMs <= RECALL_HORN_MINIMUM_REMAINING_MS) {
      throw new HttpsError("failed-precondition", "That troop march is too close to arrival to recall.");
    }

    const profile = profileSnap.data() || {};
    const shopItems = normalizeShopItems(profile.shopItems);
    const owned = Math.max(0, Math.floor(safeNumber(shopItems[RECALL_HORN_ITEM_ID], 0)));
    if (owned <= 0) throw new HttpsError("failed-precondition", "You do not have a Recall Horn.");

    const launchedAtMs = Math.max(0, Math.floor(safeNumber(
      army.launchedAtMs,
      oldArrivesAtMs - Math.max(100, safeNumber(army.total, 0.1) * 1000)
    )));
    const originalArrivesAtMs = Math.max(
      oldArrivesAtMs,
      Math.floor(safeNumber(army.swiftMarchOriginalArrivesAtMs, oldArrivesAtMs))
    );
    const originalTotalMs = Math.max(100, originalArrivesAtMs - launchedAtMs);
    const returnStartProgress = clamp(getArmyRouteProgressAtMs(army, nowMs), 0.000001, 0.999999);
    const returnDurationMs = Math.max(
      RECALL_HORN_MINIMUM_RETURN_MS,
      Math.ceil(originalTotalMs * returnStartProgress)
    );
    const arrivesAtMs = nowMs + returnDurationMs;
    const routeRegionIds = normalizeRegionIds([
      ...(army.routeRegionIds || []),
      sourceRegionId,
      targetRegionId,
    ]);
    const movementPatch = {
      returning: true,
      returnReason: RECALL_HORN_ITEM_ID,
      recalledAtMs: nowMs,
      recallOriginalArrivesAtMs: oldArrivesAtMs,
      returnStartProgress,
      returnDestinationId: army.fromId,
      returnDestinationRegionId: sourceRegionId,
      arrivesAtMs,
      total: Math.max(0.1, returnDurationMs / 1000),
      targetOwnerUid: "",
      updatedAt: FieldValue.serverTimestamp(),
    };
    let campUpdate = null;
    if (targetCampRef && targetCampSnap?.exists) {
      const camp = { id: targetCampSnap.id, ...targetCampSnap.data() };
      const remainingActiveArmyIds = removeActiveCampArmyId(camp, armyId);
      const campPatch = {
        activeArmyIds: remainingActiveArmyIds,
        state: getRewardCampState(remainingActiveArmyIds, getOwnerUid(camp)),
        updatedAt: FieldValue.serverTimestamp(),
      };
      transaction.set(targetCampRef, campPatch, { merge: true });
      campUpdate = campUpdateForClient(camp.id, targetRegionId, campPatch);
    }
    writeArmyMovementCopies(transaction, { ...army, ...movementPatch, id: armyId }, {
      previousTargetOwnerUid: army.targetOwnerUid,
    });
    if (rallyRef && rally) {
      transaction.set(rallyRef, {
        status: RALLY_STATUS_RECALLING,
        recalledAtMs: nowMs,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      writeClanAudit(transaction, rally.clanId, uid, "rally_recalled", {
        rallyId: rally.id,
        armyId,
        troops: Math.max(0, Math.floor(safeNumber(army.troops, 0))),
      }, nowMs);
    }
    const launchedAsClanReinforcement = !army.reinforcementReturn && (
      army.kind === "reinforce"
      || army.launchKind === "reinforce"
      || army.retargetedFromKind === "reinforce"
    );
    if (launchedAsClanReinforcement) {
      releaseClanReinforcementTarget(
        transaction,
        uid,
        army.reinforcementTargetKey
          || getReinforcementTargetKey(army.targetType, army.targetRegionId, army.toId)
      );
    }
    shopItems[RECALL_HORN_ITEM_ID] = owned - 1;
    transaction.set(profileRef, {
      shopItems,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const movement = { ...army, ...movementPatch };
    delete movement.updatedAt;
    return {
      ok: true,
      movement,
      returnSeconds: Math.max(1, Math.ceil(returnDurationMs / 1000)),
      targetType: army.targetType === "camp" ? "camp" : "city",
      campUpdate,
      currentUser: {
        shopItems,
      },
    };
  });
});

function normalizeClanName(value = "") {
  const display = safeString(value, 24).replace(/\s+/g, " ").trim();
  if (display.length < 3 || !/^[A-Za-z0-9 _.-]+$/.test(display)) {
    throw new HttpsError("invalid-argument", "Clan names must be 3-24 letters, numbers, spaces, periods, underscores, or hyphens.");
  }
  return { display, normalized: display.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") };
}

function normalizeClanTag(value = "") {
  const display = safeString(value, 5).trim().toUpperCase();
  if (!/^[A-Z0-9]{3,5}$/.test(display)) {
    throw new HttpsError("invalid-argument", "Clan tags must be 3-5 letters or numbers.");
  }
  return { display, normalized: display.toLowerCase() };
}

function clanNameReservationRef(normalizedName = "") {
  return db.doc(`clanNameReservations/${RESET_GENERATION}_${safeString(normalizedName, 40)}`);
}

function clanTagReservationRef(normalizedTag = "") {
  return db.doc(`clanTagReservations/${RESET_GENERATION}_${safeString(normalizedTag, 40)}`);
}

function getClanNameChangeCooldownUntilMs(clan = {}) {
  return Math.max(
    0,
    timestampToMs(clan.nextNameChangeAtMs),
    timestampToMs(clan.lastNameChangedAtMs) + CLAN_NAME_CHANGE_COOLDOWN_MS
  );
}

function normalizeClanDescription(value = "") {
  return safeString(value, 280).replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function normalizeClanShieldColor(value = "", fallback = "#2f7a4a") {
  const color = safeString(value, 7).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

function normalizeClanShieldChoice(value, allowed, fallback) {
  const choice = safeString(value, 24).toLowerCase();
  return allowed.has(choice) ? choice : fallback;
}

function normalizeClanShield(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const legacyPatternMap = {
    split: "pale",
    diagonal: "bend",
    band: "fess",
    cross: "quartered",
    chief: "fess",
  };
  const legacySymbolMap = {
    tower: "castle",
    cross: "fleur",
    star: "sun",
    moon: "sun",
    knight: "swords",
    diamond: "fleur",
    spire: "fleur",
  };
  const requestedDivision = legacyPatternMap[source.pattern] || source.division || source.pattern;
  const requestedCharge = legacySymbolMap[source.symbol] || source.charge || source.symbol;
  return {
    version: CLAN_SHIELD_VERSION,
    shape: normalizeClanShieldChoice(source.shape, CLAN_SHIELD_SHAPES, "castilian"),
    division: normalizeClanShieldChoice(requestedDivision, CLAN_SHIELD_DIVISIONS, "quartered"),
    primary: normalizeClanShieldColor(source.primary, "#7a2638"),
    secondary: normalizeClanShieldColor(source.secondary, "#d8bd78"),
    borderColor: normalizeClanShieldColor(source.borderColor, "#d8bd78"),
    charge: normalizeClanShieldChoice(requestedCharge, CLAN_SHIELD_CHARGES, "castle"),
    secondaryCharge: normalizeClanShieldChoice(source.secondaryCharge, CLAN_SHIELD_CHARGES, "lion"),
    chargeColor: normalizeClanShieldColor(source.chargeColor, "#19201d"),
    secondaryChargeColor: normalizeClanShieldColor(source.secondaryChargeColor, "#7a2638"),
    chargeLayout: normalizeClanShieldChoice(source.chargeLayout, CLAN_SHIELD_CHARGE_LAYOUTS, "quartered"),
    trim: normalizeClanShieldChoice(source.trim, CLAN_SHIELD_TRIMS, "double"),
    finish: normalizeClanShieldChoice(source.finish, CLAN_SHIELD_FINISHES, "weathered"),
  };
}

function clanShieldLegacyBanner(value = {}) {
  const shield = normalizeClanShield(value);
  return {
    primary: shield.primary,
    secondary: shield.secondary,
    pattern: shield.division,
    symbol: shield.charge,
  };
}

function normalizeAdmissionMode(value = "") {
  return value === "open" ? "open" : "approval";
}

function clanPublicSnapshot(id = "", clan = {}) {
  const shield = normalizeClanShield(clan.shield || clan.banner);
  return {
    id,
    worldId: safeString(clan.worldId, 120),
    resetGeneration: safeString(clan.resetGeneration, 120),
    name: safeString(clan.name, 24),
    normalizedName: safeString(clan.normalizedName, 40),
    tag: safeString(clan.tag, 5),
    description: safeString(clan.description, 280),
    shield,
    banner: clanShieldLegacyBanner(shield),
    admissionMode: normalizeAdmissionMode(clan.admissionMode),
    leaderUid: safeString(clan.leaderUid, 128),
    memberCount: clampInt(clan.memberCount, 0, CLAN_MEMBER_LIMIT),
    memberLimit: CLAN_MEMBER_LIMIT,
    totalKingPower: Math.max(0, Math.floor(safeNumber(clan.totalKingPower, 0))),
    status: clan.status === "disbanded" ? "disbanded" : "active",
    lastNameChangedAtMs: Math.max(0, timestampToMs(clan.lastNameChangedAtMs)),
    nextNameChangeAtMs: getClanNameChangeCooldownUntilMs(clan),
    createdAtMs: Math.max(0, timestampToMs(clan.createdAtMs || clan.createdAt)),
    updatedAtMs: Math.max(0, timestampToMs(clan.updatedAtMs || clan.updatedAt)),
  };
}

function clanIdentityPatch(clanId = "", clan = {}, role = "") {
  if (!clanId) {
    return {
      clanId: FieldValue.delete(),
      clanName: FieldValue.delete(),
      clanTag: FieldValue.delete(),
      clanRole: FieldValue.delete(),
    };
  }
  return {
    clanId,
    clanName: safeString(clan.name, 24),
    clanTag: safeString(clan.tag, 5),
    clanRole: ["leader", "officer"].includes(role) ? role : "member",
  };
}

function clanIdentityRevisionPatch(nowMs = Date.now()) {
  return {
    clanIdentityRevision: FieldValue.increment(1),
    clanIdentityRevisionVersion: CLAN_IDENTITY_REVISION_VERSION,
    clanIdentityUpdatedAtMs: nowMs,
  };
}

function clanMemberSnapshot(uid = "", profile = {}, role = "member", nowMs = Date.now()) {
  return {
    uid,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    role,
    displayName: normalizePlayerName(profile.playerName || profile.displayName || "Ruler"),
    flag: profile.flag || null,
    kingPower: Math.max(0, Math.floor(safeNumber(profile.kingPower || profile.globalStats?.kingPower, 0))),
    joinedAtMs: nowMs,
    roleChangedAtMs: nowMs,
    lastActiveAtMs: Math.max(nowMs, timestampToMs(profile.lastSeenAtMs || profile.updatedAt)),
    status: "active",
    updatedAtMs: nowMs,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function clanQuestProgressRef(clanId = "") {
  return db.doc(`clans/${clanId}/questProgress/${RESET_GENERATION}`);
}

function clanWorldBenefitsRef(clanId = "") {
  const safeClanId = safeString(clanId, 128);
  return safeClanId ? db.doc(`clans/${safeClanId}/worldBenefits/${RESET_GENERATION}`) : null;
}

function clanQuestCaptureReceiptRef(clanId = "", eventId = "") {
  const safeEventId = safeString(eventId, 180).replace(/[^a-zA-Z0-9_-]/g, "_");
  return safeEventId ? db.doc(`clans/${clanId}/questCaptureReceipts/${safeEventId}`) : null;
}

function clanMemberRewardsRef(clanId = "", uid = "") {
  return db.doc(`clans/${clanId}/memberRewards/${uid}`);
}

function createClanMemberRewards(uid = "", nowMs = Date.now()) {
  return {
    uid,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    pendingGiftGoldMinutes: 0,
    giftCountReceived: 0,
    giftCountSent: 0,
    giftGoldMinutesClaimed: 0,
    lastGiftSentAtMs: 0,
    questClaims: {},
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function normalizeClanQuestClaims(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(CLAN_QUEST_REWARDS
    .filter(reward => source[reward.id] && typeof source[reward.id] === "object")
    .map(reward => [reward.id, source[reward.id]]));
}

function clanMemberRewardsForClient(value = {}, nowMs = Date.now()) {
  const lastGiftSentAtMs = Math.max(0, timestampToMs(value.lastGiftSentAtMs));
  return {
    pendingGiftGoldMinutes: Math.max(0, Math.floor(safeNumber(value.pendingGiftGoldMinutes, 0))),
    giftCountReceived: Math.max(0, Math.floor(safeNumber(value.giftCountReceived, 0))),
    giftCountSent: Math.max(0, Math.floor(safeNumber(value.giftCountSent, 0))),
    giftGoldMinutesClaimed: Math.max(0, Math.floor(safeNumber(value.giftGoldMinutesClaimed, 0))),
    lastGiftSentAtMs,
    giftCooldownUntilMs: lastGiftSentAtMs ? lastGiftSentAtMs + CLAN_GIFT_COOLDOWN_MS : 0,
    canSendGift: !lastGiftSentAtMs || nowMs - lastGiftSentAtMs >= CLAN_GIFT_COOLDOWN_MS,
    questClaims: normalizeClanQuestClaims(value.questClaims),
  };
}

function assertClanUnlocked(profile = {}) {
  const level = Math.max(1, Math.floor(safeNumber(profile?.character?.level, 1)));
  if (level < CLAN_UNLOCK_LEVEL) {
    throw new HttpsError("failed-precondition", `Clans unlock at Hero Level ${CLAN_UNLOCK_LEVEL}.`);
  }
}

function assertNoClan(profile = {}, nowMs = Date.now(), allowedApplicationClanId = "") {
  if (safeString(profile.clanId, 128)) throw new HttpsError("failed-precondition", "You are already in a clan.");
  const pendingClanApplicationId = safeString(profile.pendingClanApplicationId, 128);
  if (pendingClanApplicationId && pendingClanApplicationId !== allowedApplicationClanId) {
    throw new HttpsError("failed-precondition", "Cancel your existing clan application first.");
  }
  const cooldownUntilMs = Math.max(0, timestampToMs(profile.clanJoinCooldownUntilMs));
  if (cooldownUntilMs > nowMs) {
    throw new HttpsError("failed-precondition", "You must wait before joining another clan.", { cooldownUntilMs });
  }
}

function assertClanRole(member = {}, allowedRoles = []) {
  if (!member || member.status === "removed" || !allowedRoles.includes(member.role)) {
    throw new HttpsError("permission-denied", "Your clan role does not allow that action.");
  }
}

function assertCurrentClan(clan = {}) {
  if (safeString(clan.resetGeneration, 120) !== RESET_GENERATION
    || safeString(clan.worldId, 120) !== ONLINE_WORLD_ID) {
    throw new HttpsError("failed-precondition", "That clan belongs to an archived Crownlands generation.");
  }
}

function clanAuditRef(clanId = "") {
  return db.collection(`clans/${clanId}/audit`).doc();
}

function writeClanAudit(transaction, clanId, actorUid, action, details = {}, nowMs = Date.now()) {
  transaction.set(clanAuditRef(clanId), {
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    actorUid,
    action: safeString(action, 64),
    details,
    createdAtMs: nowMs,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function writeClanLeaderboard(transaction, clanId, clan = {}, patch = {}) {
  const combined = { ...clan, ...patch };
  const shield = normalizeClanShield(combined.shield || combined.banner);
  transaction.set(db.doc(`clanLeaderboards/${RESET_GENERATION}/entries/${clanId}`), {
    clanId,
    name: safeString(combined.name, 24),
    tag: safeString(combined.tag, 5),
    shield,
    banner: clanShieldLegacyBanner(shield),
    memberCount: clampInt(combined.memberCount, 0, CLAN_MEMBER_LIMIT),
    totalKingPower: Math.max(0, Math.floor(safeNumber(combined.totalKingPower, 0))),
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    updatedAtMs: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function areClanmates(transaction, firstUid = "", secondUid = "", knownFirstProfile = null, knownSecondProfile = null) {
  if (!firstUid || !secondUid || firstUid === secondUid) return false;
  let firstProfile = knownFirstProfile;
  let secondProfile = knownSecondProfile;
  if (!firstProfile) {
    const snap = await transaction.get(db.doc(`players/${firstUid}`));
    firstProfile = snap.exists ? snap.data() || {} : {};
  }
  if (!secondProfile) {
    const snap = await transaction.get(db.doc(`players/${secondUid}`));
    secondProfile = snap.exists ? snap.data() || {} : {};
  }
  const clanId = safeString(firstProfile.clanId, 128);
  return Boolean(clanId && clanId === safeString(secondProfile.clanId, 128));
}

exports.createClan = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const name = normalizeClanName(request.data?.name);
  const tag = normalizeClanTag(request.data?.tag);
  const clanId = db.collection("clans").doc().id;
  const clanRef = db.doc(`clans/${clanId}`);
  const nameRef = clanNameReservationRef(name.normalized);
  const tagRef = clanTagReservationRef(tag.normalized);
  const profileRef = db.doc(`players/${uid}`);
  return db.runTransaction(async transaction => {
    const [profileSnap, nameSnap, tagSnap] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(nameRef),
      transaction.get(tagRef),
    ]);
    if (!profileSnap.exists) throw new HttpsError("not-found", "Player profile was not found.");
    const profile = profileSnap.data() || {};
    assertClanUnlocked(profile);
    assertNoClan(profile, nowMs);
    if (nameSnap.exists && timestampToMs(nameSnap.data()?.reusableAtMs) > nowMs) {
      throw new HttpsError("already-exists", "That clan name is already in use.");
    }
    if (tagSnap.exists && timestampToMs(tagSnap.data()?.reusableAtMs) > nowMs) {
      throw new HttpsError("already-exists", "That clan tag is already in use.");
    }
    const economy = await prepareEconomyCollection(transaction, uid, nowMs, { profileRef, profileSnap });
    const availableGold = Math.max(0, Math.floor(safeNumber(economy.profileAfter.gold, 0)));
    if (availableGold < CLAN_CREATE_GOLD_COST) {
      throw new HttpsError("failed-precondition", `Creating a clan costs ${CLAN_CREATE_GOLD_COST.toLocaleString()} gold.`);
    }
    const shield = normalizeClanShield(request.data?.shield || request.data?.banner);
    const clan = {
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      releaseId: REALM_RELEASE_ID,
      name: name.display,
      normalizedName: name.normalized,
      tag: tag.display,
      normalizedTag: tag.normalized,
      description: normalizeClanDescription(request.data?.description),
      shield,
      banner: clanShieldLegacyBanner(shield),
      admissionMode: normalizeAdmissionMode(request.data?.admissionMode),
      leaderUid: uid,
      memberCount: 1,
      memberLimit: CLAN_MEMBER_LIMIT,
      totalKingPower: Math.max(0, Math.floor(safeNumber(economy.globalStats?.kingPower || profile.kingPower, 0))),
      status: "active",
      lastNameChangedAtMs: 0,
      nextNameChangeAtMs: 0,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(clanRef, clan);
    transaction.set(db.doc(`clans/${clanId}/members/${uid}`), clanMemberSnapshot(uid, {
      ...profile,
      kingPower: clan.totalKingPower,
    }, "leader", nowMs));
    transaction.set(clanMemberRewardsRef(clanId, uid), createClanMemberRewards(uid, nowMs));
    transaction.set(clanQuestProgressRef(clanId), {
      clanId,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      captureCount: 0,
      milestoneUnlocks: {},
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(clanWorldBenefitsRef(clanId), {
      clanId,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      modelVersion: CLAN_OBJECTIVE_BENEFIT_MODEL_VERSION,
      status: "active",
      objectives: [],
      sharedBonuses: emptyObjectiveBonuses(),
      citadelControllerUid: "",
      cumulativeGoldPercentMs: 0,
      cumulativeTroopPercentMs: 0,
      lastIntegratedAtMs: nowMs,
      effectiveAtMs: nowMs,
      revision: 1,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(nameRef, { clanId, reusableAtMs: Number.MAX_SAFE_INTEGER, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(tagRef, { clanId, reusableAtMs: Number.MAX_SAFE_INTEGER, updatedAt: FieldValue.serverTimestamp() });
    writePreparedEconomy(transaction, economy, {
      gold: availableGold - CLAN_CREATE_GOLD_COST,
      ...clanIdentityPatch(clanId, clan, "leader"),
      ...clanIdentityRevisionPatch(nowMs),
      clanObjectiveAccrual: {
        modelVersion: CLAN_OBJECTIVE_BENEFIT_MODEL_VERSION,
        resetGeneration: RESET_GENERATION,
        clanId,
        goldPercentMs: 0,
        troopPercentMs: 0,
        checkpointAtMs: nowMs,
      },
      pendingClanObjectiveAccrual: FieldValue.delete(),
    });
    transaction.set(leaderboardEntryRef(uid), clanIdentityPatch(clanId, clan, "leader"), { merge: true });
    writeClanLeaderboard(transaction, clanId, clan);
    writeClanAudit(transaction, clanId, uid, "clan_created", { name: clan.name, tag: clan.tag }, nowMs);
    return { ok: true, clan: clanPublicSnapshot(clanId, clan), role: "leader", gold: availableGold - CLAN_CREATE_GOLD_COST };
  });
});

exports.updateClanProfile = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const requestData = request.data && typeof request.data === "object" ? request.data : {};
  const requestedName = Object.prototype.hasOwnProperty.call(requestData, "name")
    ? normalizeClanName(requestData.name)
    : null;
  const profileRef = db.doc(`players/${uid}`);
  const profileSnap = await profileRef.get();
  const clanId = safeString(profileSnap.data()?.clanId, 128);
  if (!clanId) throw new HttpsError("failed-precondition", "You are not in a clan.");
  return db.runTransaction(async transaction => {
    const clanRef = db.doc(`clans/${clanId}`);
    const [currentProfileSnap, clanSnap, memberSnap] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(clanRef),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
    ]);
    if (!clanSnap.exists) throw new HttpsError("not-found", "Clan was not found.");
    assertClanRole(memberSnap.data(), ["leader"]);
    const clan = clanSnap.data() || {};
    assertCurrentClan(clan);
    if (!currentProfileSnap.exists || safeString(currentProfileSnap.data()?.clanId, 128) !== clanId) {
      throw new HttpsError("failed-precondition", "Your clan membership changed. Reopen the Clan screen and try again.");
    }
    const nameChanged = Boolean(requestedName && requestedName.display !== safeString(clan.name, 24));
    let economy = null;
    let membersSnap = null;
    let availableGold = Math.max(0, Math.floor(safeNumber(currentProfileSnap.data()?.gold, 0)));
    let remainingGold = availableGold;
    let remainingGoldFloat = Math.max(0, safeNumber(currentProfileSnap.data()?.goldFloat, availableGold));
    let nextNameChangeAtMs = getClanNameChangeCooldownUntilMs(clan);
    const newNameRef = nameChanged ? clanNameReservationRef(requestedName.normalized) : null;
    if (nameChanged) {
      const [loadedMembersSnap, newNameReservationSnap, preparedEconomy] = await Promise.all([
        transaction.get(db.collection(`clans/${clanId}/members`)),
        transaction.get(newNameRef),
        prepareEconomyCollection(transaction, uid, nowMs, { profileRef, profileSnap: currentProfileSnap }),
      ]);
      membersSnap = loadedMembersSnap;
      economy = preparedEconomy;
      if (nextNameChangeAtMs > nowMs) {
        throw new HttpsError(
          "failed-precondition",
          "The clan name can only be changed once every seven days.",
          { nextNameChangeAtMs }
        );
      }
      const reservation = newNameReservationSnap.exists ? newNameReservationSnap.data() || {} : {};
      if (
        newNameReservationSnap.exists
        && safeString(reservation.clanId, 128) !== clanId
        && timestampToMs(reservation.reusableAtMs) > nowMs
      ) {
        throw new HttpsError("already-exists", "That clan name is already in use.");
      }
      availableGold = Math.max(0, Math.floor(safeNumber(economy.profileAfter.gold, 0)));
      if (availableGold < CLAN_NAME_CHANGE_GOLD_COST) {
        throw new HttpsError(
          "failed-precondition",
          `Changing a clan name costs ${CLAN_NAME_CHANGE_GOLD_COST.toLocaleString()} gold.`
        );
      }
      remainingGoldFloat = Math.max(
        0,
        safeNumber(economy.profileAfter.goldFloat, availableGold) - CLAN_NAME_CHANGE_GOLD_COST
      );
      remainingGold = Math.max(0, Math.floor(remainingGoldFloat));
      nextNameChangeAtMs = nowMs + CLAN_NAME_CHANGE_COOLDOWN_MS;
    }
    const shield = normalizeClanShield(requestData.shield || requestData.banner || clan.shield || clan.banner);
    const patch = {
      description: normalizeClanDescription(requestData.description ?? clan.description),
      shield,
      banner: clanShieldLegacyBanner(shield),
      admissionMode: normalizeAdmissionMode(requestData.admissionMode ?? clan.admissionMode),
      ...(nameChanged ? {
        name: requestedName.display,
        normalizedName: requestedName.normalized,
        lastNameChangedAtMs: nowMs,
        nextNameChangeAtMs,
      } : {}),
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(clanSnap.ref, patch, { merge: true });
    if (nameChanged) {
      const previousNameRef = clanNameReservationRef(clan.normalizedName);
      transaction.set(newNameRef, {
        clanId,
        reusableAtMs: Number.MAX_SAFE_INTEGER,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (previousNameRef.path !== newNameRef.path) {
        transaction.set(previousNameRef, {
          clanId,
          reusableAtMs: nowMs + CLAN_RESERVATION_RELEASE_MS,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      const renamedClan = { ...clan, ...patch };
      writePreparedEconomy(transaction, economy, {
        gold: remainingGold,
        goldFloat: remainingGoldFloat,
        ...clanIdentityPatch(clanId, renamedClan, "leader"),
        ...clanIdentityRevisionPatch(nowMs),
      });
      membersSnap.docs.forEach(memberDoc => {
        const memberUid = safeString(memberDoc.id, 128);
        if (!memberUid) return;
        if (memberUid !== uid) {
          transaction.set(db.doc(`players/${memberUid}`), {
            clanName: requestedName.display,
            ...clanIdentityRevisionPatch(nowMs),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        transaction.set(leaderboardEntryRef(memberUid), {
          clanName: requestedName.display,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
    }
    writeClanLeaderboard(transaction, clanId, clan, patch);
    writeClanAudit(transaction, clanId, uid, "clan_profile_updated", {
      shieldChanged: Boolean(requestData.shield || requestData.banner),
      nameChanged,
    }, nowMs);
    if (nameChanged) {
      writeClanAudit(transaction, clanId, uid, "clan_renamed", {
        previousName: safeString(clan.name, 24),
        name: requestedName.display,
        goldCost: CLAN_NAME_CHANGE_GOLD_COST,
        nextNameChangeAtMs,
      }, nowMs);
    }
    return {
      ok: true,
      clan: clanPublicSnapshot(clanId, { ...clan, ...patch }),
      ...(nameChanged ? {
        nameChanged: true,
        gold: remainingGold,
        nextNameChangeAtMs,
      } : { nameChanged: false }),
    };
  });
});

async function joinClanTransaction(transaction, { uid, clanId, profileSnap, clanSnap, applicationRef = null, nowMs = Date.now() }) {
  const profile = profileSnap.data() || {};
  const clan = clanSnap.data() || {};
  assertCurrentClan(clan);
  assertClanUnlocked(profile);
  assertNoClan(profile, nowMs, applicationRef ? clanId : "");
  if (clan.status !== "active") throw new HttpsError("failed-precondition", "That clan is no longer active.");
  if (clampInt(clan.memberCount, 0, CLAN_MEMBER_LIMIT) >= CLAN_MEMBER_LIMIT) {
    throw new HttpsError("resource-exhausted", "That clan is full.");
  }
  const statsSnap = await transaction.get(playerGlobalStatsRef(uid));
  const benefitsSnap = await transaction.get(clanWorldBenefitsRef(clanId));
  const benefits = benefitsSnap.exists ? benefitsSnap.data() || {} : {};
  const kingPower = Math.max(0, Math.floor(safeNumber(statsSnap.data()?.kingPower || profile.kingPower, 0)));
  const nextCount = clampInt(clan.memberCount, 0, CLAN_MEMBER_LIMIT) + 1;
  const nextPower = Math.max(0, Math.floor(safeNumber(clan.totalKingPower, 0))) + kingPower;
  transaction.set(db.doc(`clans/${clanId}/members/${uid}`), clanMemberSnapshot(uid, { ...profile, kingPower }, "member", nowMs));
  transaction.set(clanMemberRewardsRef(clanId, uid), createClanMemberRewards(uid, nowMs));
  transaction.set(clanSnap.ref, {
    memberCount: nextCount,
    totalKingPower: nextPower,
    updatedAtMs: nowMs,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  transaction.set(profileSnap.ref, {
    ...clanIdentityPatch(clanId, clan, "member"),
    ...clanIdentityRevisionPatch(nowMs),
    clanObjectiveAccrual: clanBenefitAccrualBaseline(benefits, clanId, nowMs),
    clanJoinCooldownUntilMs: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  transaction.set(leaderboardEntryRef(uid), clanIdentityPatch(clanId, clan, "member"), { merge: true });
  if (applicationRef) transaction.delete(applicationRef);
  writeClanLeaderboard(transaction, clanId, clan, { memberCount: nextCount, totalKingPower: nextPower });
  writeClanAudit(transaction, clanId, uid, "member_joined");
  return { ok: true, clan: clanPublicSnapshot(clanId, { ...clan, memberCount: nextCount, totalKingPower: nextPower }), role: "member" };
}

exports.joinOpenClan = onCall({ region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const clanId = safeString(request.data?.clanId, 128);
  if (!clanId) throw new HttpsError("invalid-argument", "Choose a clan.");
  return db.runTransaction(async transaction => {
    const [profileSnap, clanSnap] = await Promise.all([
      transaction.get(db.doc(`players/${uid}`)),
      transaction.get(db.doc(`clans/${clanId}`)),
    ]);
    if (!profileSnap.exists || !clanSnap.exists) throw new HttpsError("not-found", "Player or clan was not found.");
    if (clanSnap.data()?.admissionMode !== "open") throw new HttpsError("failed-precondition", "That clan requires approval.");
    return joinClanTransaction(transaction, { uid, clanId, profileSnap, clanSnap });
  });
});

exports.applyToClan = onCall({ region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const clanId = safeString(request.data?.clanId, 128);
  if (!clanId) throw new HttpsError("invalid-argument", "Choose a clan before applying.");
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const [profileSnap, clanSnap, applicationSnap, statsSnap] = await Promise.all([
      transaction.get(db.doc(`players/${uid}`)),
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/applications/${uid}`)),
      transaction.get(playerGlobalStatsRef(uid)),
    ]);
    if (!profileSnap.exists || !clanSnap.exists) throw new HttpsError("not-found", "Player or clan was not found.");
    const profile = profileSnap.data() || {};
    const clan = clanSnap.data() || {};
    assertCurrentClan(clan);
    assertClanUnlocked(profile);
    assertNoClan(profile, nowMs, clanId);
    if (clan.admissionMode !== "approval") throw new HttpsError("failed-precondition", "That clan is open to direct joining.");
    if (clan.status !== "active" || clan.memberCount >= CLAN_MEMBER_LIMIT) throw new HttpsError("failed-precondition", "That clan cannot accept applications.");
    if (safeString(profile.pendingClanApplicationId, 128) && profile.pendingClanApplicationId !== clanId) {
      throw new HttpsError("failed-precondition", "Cancel your existing clan application first.");
    }
    if (applicationSnap.exists && applicationSnap.data()?.status === "pending") {
      transaction.set(profileSnap.ref, {
        pendingClanApplicationId: clanId,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ok: true, pending: true };
    }
    transaction.set(applicationSnap.ref, {
      uid,
      clanId,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      displayName: normalizePlayerName(profile.playerName || profile.displayName),
      flag: profile.flag || null,
      kingPower: Math.max(0, Math.floor(safeNumber(statsSnap.data()?.kingPower || profile.kingPower, 0))),
      message: safeString(request.data?.message, 160).trim(),
      status: "pending",
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(profileSnap.ref, { pendingClanApplicationId: clanId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "application_submitted");
    return { ok: true, pending: true };
  });
});

exports.cancelClanApplication = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const clanId = safeString(request.data?.clanId, 128);
  if (!clanId) throw new HttpsError("invalid-argument", "Choose an application to cancel.");
  return db.runTransaction(async transaction => {
    const profileRef = db.doc(`players/${uid}`);
    const applicationRef = db.doc(`clans/${clanId}/applications/${uid}`);
    const [profileSnap, applicationSnap] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(applicationRef),
    ]);
    const pendingClanId = safeString(profileSnap.data()?.pendingClanApplicationId, 128);
    if (pendingClanId && pendingClanId !== clanId) {
      throw new HttpsError("failed-precondition", "That is not your current clan application.");
    }
    if (applicationSnap.exists) transaction.delete(applicationRef);
    if (profileSnap.exists) {
      transaction.set(profileRef, {
        pendingClanApplicationId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    if (applicationSnap.exists || pendingClanId === clanId) {
      writeClanAudit(transaction, clanId, uid, "application_canceled");
    }
    return { ok: true };
  });
});

exports.reviewClanApplication = onCall({ region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const clanId = safeString(request.data?.clanId, 128);
  const applicantUid = safeString(request.data?.applicantUid, 128);
  if (!clanId || !applicantUid) throw new HttpsError("invalid-argument", "Choose a clan application to review.");
  const accept = request.data?.accept === true;
  return db.runTransaction(async transaction => {
    const [clanSnap, reviewerSnap, applicantSnap, applicationSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
      transaction.get(db.doc(`players/${applicantUid}`)),
      transaction.get(db.doc(`clans/${clanId}/applications/${applicantUid}`)),
    ]);
    if (!clanSnap.exists || !applicantSnap.exists || !applicationSnap.exists) throw new HttpsError("not-found", "Application was not found.");
    assertClanRole(reviewerSnap.data(), ["leader", "officer"]);
    const application = applicationSnap.data() || {};
    assertCurrentClan(application);
    if (safeString(application.uid, 128) !== applicantUid || safeString(application.clanId, 128) !== clanId) {
      throw new HttpsError("failed-precondition", "That application no longer matches this clan.");
    }
    if (application.status !== "pending") throw new HttpsError("failed-precondition", "That application is no longer pending.");
    if (accept) return joinClanTransaction(transaction, { uid: applicantUid, clanId, profileSnap: applicantSnap, clanSnap, applicationRef: applicationSnap.ref });
    transaction.delete(applicationSnap.ref);
    transaction.set(applicantSnap.ref, { pendingClanApplicationId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "application_rejected", { applicantUid });
    return { ok: true, accepted: false };
  });
});

function internalRallyCallableRequest(uid = "", clanId = "", rallyId = "") {
  return {
    auth: { uid: safeString(uid, 128), token: { serverReconciliation: true } },
    data: {
      clanId: safeString(clanId, 128),
      rallyId: normalizeRallyId(rallyId),
      clientReleaseId: REALM_RELEASE_ID,
      clientResetGeneration: RESET_GENERATION,
      clientWorldId: ONLINE_WORLD_ID,
    },
  };
}

async function reconcileClanRalliesBeforeDeparture(uid = "", clanId = "") {
  const playerUid = safeString(uid, 128);
  const currentClanId = safeString(clanId, 128);
  if (!playerUid || !currentClanId) return;
  const snapshot = await db.collection(`clans/${currentClanId}/rallies`)
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .where("status", "==", RALLY_STATUS_FORMING)
    .get();
  const relevant = snapshot.docs
    .map(normalizeClanRally)
    .filter(rally => rally && activeRallyParticipants(rally).some(participant => participant.uid === playerUid));
  for (const rally of relevant) {
    const request = internalRallyCallableRequest(playerUid, currentClanId, rally.id);
    if (rally.leaderUid === playerUid) await cancelClanRallyRequest(request);
    else await withdrawClanRallyContributionRequest(request);
  }
}

async function removeClanMember({ actorUid, targetUid, clanId, reason = "left" }) {
  const nowMs = Date.now();
  const [preflightClanSnap, preflightActorSnap, preflightTargetSnap] = await Promise.all([
    db.doc(`clans/${clanId}`).get(),
    db.doc(`clans/${clanId}/members/${actorUid}`).get(),
    db.doc(`clans/${clanId}/members/${targetUid}`).get(),
  ]);
  if (!preflightClanSnap.exists || !preflightTargetSnap.exists) {
    throw new HttpsError("not-found", "Clan member was not found.");
  }
  const preflightClan = preflightClanSnap.data() || {};
  const preflightActor = preflightActorSnap.data() || {};
  const preflightTarget = preflightTargetSnap.data() || {};
  const selfLeave = actorUid === targetUid;
  if (!selfLeave) {
    assertClanRole(preflightActor, ["leader"]);
    if (preflightTarget.role === "leader") {
      throw new HttpsError("permission-denied", "You cannot remove that clan member.");
    }
  }
  if (preflightTarget.role === "leader" && preflightClan.memberCount > 1) {
    throw new HttpsError("failed-precondition", "Transfer leadership before leaving.");
  }
  await reconcileClanRalliesBeforeDeparture(targetUid, clanId);
  return db.runTransaction(async transaction => {
    const [clanSnap, actorMemberSnap, targetMemberSnap, targetProfileSnap, benefitsSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${actorUid}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${targetUid}`)),
      transaction.get(db.doc(`players/${targetUid}`)),
      transaction.get(clanWorldBenefitsRef(clanId)),
    ]);
    if (!clanSnap.exists || !targetMemberSnap.exists) throw new HttpsError("not-found", "Clan member was not found.");
    const clan = clanSnap.data() || {};
    const actor = actorMemberSnap.data() || {};
    const target = targetMemberSnap.data() || {};
    const selfLeave = actorUid === targetUid;
    if (!selfLeave) {
      assertClanRole(actor, ["leader"]);
      if (target.role === "leader") {
        throw new HttpsError("permission-denied", "You cannot remove that clan member.");
      }
    }
    if (target.role === "leader" && clan.memberCount > 1) {
      throw new HttpsError("failed-precondition", "Transfer leadership before leaving.");
    }
    const targetPower = Math.max(0, Math.floor(safeNumber(target.kingPower, 0)));
    const nextCount = Math.max(0, clampInt(clan.memberCount, 0, CLAN_MEMBER_LIMIT) - 1);
    const nextPower = Math.max(0, Math.floor(safeNumber(clan.totalKingPower, 0)) - targetPower);
    transaction.delete(targetMemberSnap.ref);
    transaction.delete(clanMemberRewardsRef(clanId, targetUid));
    if (targetProfileSnap.exists) {
      const targetProfile = targetProfileSnap.data() || {};
      transaction.set(targetProfileSnap.ref, {
        ...clanIdentityPatch(),
        ...clanIdentityRevisionPatch(nowMs),
        ...buildClanBenefitExitPatch(
          targetProfile,
          benefitsSnap.exists ? benefitsSnap.data() || {} : {},
          clanId,
          nowMs
        ),
        pendingClanApplicationId: FieldValue.delete(),
        clanJoinCooldownUntilMs: nowMs + CLAN_JOIN_COOLDOWN_MS,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    transaction.set(leaderboardEntryRef(targetUid), clanIdentityPatch(), { merge: true });
    if (!nextCount) {
      transaction.set(clanSnap.ref, { status: "disbanded", memberCount: 0, totalKingPower: 0, disbandedAtMs: nowMs, updatedAtMs: nowMs }, { merge: true });
      const priorBenefits = benefitsSnap.exists ? benefitsSnap.data() || {} : {};
      const liveIntegrals = getLiveClanBenefitIntegrals(priorBenefits, nowMs);
      transaction.set(clanWorldBenefitsRef(clanId), {
        status: "inactive",
        objectives: [],
        sharedBonuses: emptyObjectiveBonuses(),
        citadelControllerUid: "",
        cumulativeGoldPercentMs: liveIntegrals.goldPercentMs,
        cumulativeTroopPercentMs: liveIntegrals.troopPercentMs,
        lastIntegratedAtMs: nowMs,
        effectiveAtMs: nowMs,
        revision: Math.max(0, Math.floor(safeNumber(priorBenefits.revision, 0))) + 1,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(clanNameReservationRef(clan.normalizedName), { clanId, reusableAtMs: nowMs + CLAN_RESERVATION_RELEASE_MS }, { merge: true });
      transaction.set(clanTagReservationRef(clan.normalizedTag), { clanId, reusableAtMs: nowMs + CLAN_RESERVATION_RELEASE_MS }, { merge: true });
      transaction.delete(db.doc(`clanLeaderboards/${RESET_GENERATION}/entries/${clanId}`));
    } else {
      transaction.set(clanSnap.ref, { memberCount: nextCount, totalKingPower: nextPower, updatedAtMs: nowMs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writeClanLeaderboard(transaction, clanId, clan, { memberCount: nextCount, totalKingPower: nextPower });
    }
    writeClanAudit(transaction, clanId, actorUid, reason, { targetUid });
    return { ok: true, disbanded: nextCount === 0, cooldownUntilMs: nowMs + CLAN_JOIN_COOLDOWN_MS };
  });
}

exports.leaveClan = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const profile = (await db.doc(`players/${uid}`).get()).data() || {};
  const clanId = safeString(profile.clanId, 128);
  if (!clanId) throw new HttpsError("failed-precondition", "You are not in a clan.");
  return removeClanMember({ actorUid: uid, targetUid: uid, clanId, reason: "member_left" });
});

exports.kickClanMember = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const profile = (await db.doc(`players/${uid}`).get()).data() || {};
  return removeClanMember({
    actorUid: uid,
    targetUid: safeString(request.data?.targetUid, 128),
    clanId: safeString(profile.clanId, 128),
    reason: "member_kicked",
  });
});

async function changeClanRole(request, nextRole) {
  const uid = requireAuth(request);
  const targetUid = safeString(request.data?.targetUid, 128);
  const profile = (await db.doc(`players/${uid}`).get()).data() || {};
  const clanId = safeString(profile.clanId, 128);
  return db.runTransaction(async transaction => {
    const [actorSnap, targetSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${targetUid}`)),
    ]);
    assertClanRole(actorSnap.data(), ["leader"]);
    if (!targetSnap.exists || targetSnap.data()?.role === "leader") throw new HttpsError("failed-precondition", "That member's role cannot be changed.");
    transaction.set(targetSnap.ref, { role: nextRole, roleChangedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.doc(`players/${targetUid}`), { clanRole: nextRole, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(leaderboardEntryRef(targetUid), { clanRole: nextRole }, { merge: true });
    writeClanAudit(transaction, clanId, uid, nextRole === "officer" ? "member_promoted" : "officer_demoted", { targetUid });
    return { ok: true, role: nextRole };
  });
}

exports.promoteClanMember = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, request => changeClanRole(request, "officer"));
exports.demoteClanOfficer = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, request => changeClanRole(request, "member"));

exports.transferClanLeadership = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const targetUid = safeString(request.data?.targetUid, 128);
  const profile = (await db.doc(`players/${uid}`).get()).data() || {};
  const clanId = safeString(profile.clanId, 128);
  return db.runTransaction(async transaction => {
    const [clanSnap, actorSnap, targetSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${targetUid}`)),
    ]);
    assertClanRole(actorSnap.data(), ["leader"]);
    if (!targetSnap.exists || targetUid === uid) throw new HttpsError("failed-precondition", "Choose another clan member.");
    transaction.set(clanSnap.ref, { leaderUid: targetUid, updatedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(actorSnap.ref, { role: "officer", roleChangedAtMs: Date.now() }, { merge: true });
    transaction.set(targetSnap.ref, { role: "leader", roleChangedAtMs: Date.now() }, { merge: true });
    transaction.set(db.doc(`players/${uid}`), { clanRole: "officer" }, { merge: true });
    transaction.set(db.doc(`players/${targetUid}`), { clanRole: "leader" }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "leadership_transferred", { targetUid });
    return { ok: true };
  });
});

exports.claimInactiveClanLeadership = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const profile = (await db.doc(`players/${uid}`).get()).data() || {};
  const clanId = safeString(profile.clanId, 128);
  return db.runTransaction(async transaction => {
    const clanSnap = await transaction.get(db.doc(`clans/${clanId}`));
    if (!clanSnap.exists) throw new HttpsError("not-found", "Clan was not found.");
    const clan = clanSnap.data() || {};
    const [leaderProfileSnap, membersSnap] = await Promise.all([
      transaction.get(db.doc(`players/${clan.leaderUid}`)),
      transaction.get(db.collection(`clans/${clanId}/members`).orderBy("joinedAtMs", "asc")),
    ]);
    const inactiveSinceMs = Math.max(0, timestampToMs(leaderProfileSnap.data()?.lastSeenAtMs || leaderProfileSnap.data()?.updatedAt));
    if (Date.now() - inactiveSinceMs < CLAN_LEADER_INACTIVE_MS) throw new HttpsError("failed-precondition", "The clan leader is still active.");
    const members = membersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() })).filter(member => member.uid !== clan.leaderUid);
    const eligible = members.some(member => member.role === "officer")
      ? members.filter(member => member.role === "officer")
      : members;
    if (!eligible.length || eligible[0].uid !== uid) throw new HttpsError("permission-denied", "Another member has priority to claim leadership.");
    transaction.set(clanSnap.ref, { leaderUid: uid, updatedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.doc(`clans/${clanId}/members/${clan.leaderUid}`), { role: "officer", roleChangedAtMs: Date.now() }, { merge: true });
    transaction.set(db.doc(`clans/${clanId}/members/${uid}`), { role: "leader", roleChangedAtMs: Date.now() }, { merge: true });
    transaction.set(db.doc(`players/${clan.leaderUid}`), { clanRole: "officer" }, { merge: true });
    transaction.set(db.doc(`players/${uid}`), { clanRole: "leader" }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "inactive_leadership_claimed", { oldLeaderUid: clan.leaderUid });
    return { ok: true };
  });
});

exports.disbandClan = onCall({ region: "us-central1", maxInstances: 10, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const profile = (await db.doc(`players/${uid}`).get()).data() || {};
  const clanId = safeString(profile.clanId, 128);
  const membersSnap = await db.collection(`clans/${clanId}/members`).get();
  if (membersSnap.size > 1) throw new HttpsError("failed-precondition", "Remove all other members before disbanding the clan.");
  return removeClanMember({ actorUid: uid, targetUid: uid, clanId, reason: "clan_disbanded" });
});

exports.sendClanGift = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const profileSnap = await transaction.get(db.doc(`players/${uid}`));
    const profile = profileSnap.data() || {};
    const clanId = safeString(profile.clanId, 128);
    if (!clanId) throw new HttpsError("failed-precondition", "You are not in a clan.");
    const senderRewardsRef = clanMemberRewardsRef(clanId, uid);
    const [clanSnap, senderMemberSnap, senderRewardsSnap, membersSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
      transaction.get(senderRewardsRef),
      transaction.get(db.collection(`clans/${clanId}/members`)),
    ]);
    if (!clanSnap.exists || !senderMemberSnap.exists) {
      throw new HttpsError("permission-denied", "Clan membership could not be verified.");
    }
    const clan = clanSnap.data() || {};
    assertCurrentClan(clan);
    if (clan.status !== "active") throw new HttpsError("failed-precondition", "That clan is no longer active.");
    const senderRewards = senderRewardsSnap.exists ? senderRewardsSnap.data() || {} : {};
    const lastGiftSentAtMs = Math.max(0, timestampToMs(senderRewards.lastGiftSentAtMs));
    const cooldownUntilMs = lastGiftSentAtMs + CLAN_GIFT_COOLDOWN_MS;
    if (lastGiftSentAtMs && cooldownUntilMs > nowMs) {
      throw new HttpsError("failed-precondition", "Your clan gift is still cooling down.", { cooldownUntilMs });
    }
    const recipients = membersSnap.docs.filter(memberDoc => memberDoc.id !== uid && memberDoc.data()?.status !== "removed");
    const nextSentCount = Math.max(0, Math.floor(safeNumber(senderRewards.giftCountSent, 0))) + 1;
    transaction.set(senderRewardsRef, {
      uid,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      lastGiftSentAtMs: nowMs,
      giftCountSent: nextSentCount,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
      ...(senderRewardsSnap.exists ? {} : {
        pendingGiftGoldMinutes: 0,
        giftCountReceived: 0,
        giftGoldMinutesClaimed: 0,
        questClaims: {},
        createdAtMs: nowMs,
        createdAt: FieldValue.serverTimestamp(),
      }),
    }, { merge: true });
    recipients.forEach(memberDoc => {
      transaction.set(clanMemberRewardsRef(clanId, memberDoc.id), {
        uid: memberDoc.id,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        pendingGiftGoldMinutes: FieldValue.increment(CLAN_GIFT_PRODUCTION_MINUTES),
        giftCountReceived: FieldValue.increment(1),
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    writeClanAudit(transaction, clanId, uid, "clan_gift_sent", {
      recipientCount: recipients.length,
      productionMinutes: CLAN_GIFT_PRODUCTION_MINUTES,
    }, nowMs);
    return {
      ok: true,
      recipientCount: recipients.length,
      productionMinutes: CLAN_GIFT_PRODUCTION_MINUTES,
      memberRewards: clanMemberRewardsForClient({
        ...senderRewards,
        giftCountSent: nextSentCount,
        lastGiftSentAtMs: nowMs,
      }, nowMs),
    };
  });
});

exports.claimClanGiftPool = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const profileSnap = await transaction.get(db.doc(`players/${uid}`));
    const profile = profileSnap.data() || {};
    const clanId = safeString(profile.clanId, 128);
    if (!clanId) throw new HttpsError("failed-precondition", "You are not in a clan.");
    const rewardsRef = clanMemberRewardsRef(clanId, uid);
    const [clanSnap, memberSnap, rewardsSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
      transaction.get(rewardsRef),
    ]);
    if (!clanSnap.exists || !memberSnap.exists) {
      throw new HttpsError("permission-denied", "Clan membership could not be verified.");
    }
    assertCurrentClan(clanSnap.data() || {});
    const rewards = rewardsSnap.exists ? rewardsSnap.data() || {} : {};
    const pendingMinutes = Math.max(0, Math.floor(safeNumber(rewards.pendingGiftGoldMinutes, 0)));
    if (!pendingMinutes) {
      return {
        ok: true,
        claimed: false,
        reward: 0,
        productionMinutes: 0,
        memberRewards: clanMemberRewardsForClient(rewards, nowMs),
      };
    }
    const economy = await prepareEconomyCollection(transaction, uid, nowMs, { profileRef: profileSnap.ref, profileSnap });
    const baseGoldPerHour = getRewardedAdBaseRates(economy).goldPerHour;
    const rewardAmount = Math.max(0, Math.floor(baseGoldPerHour * pendingMinutes / 60));
    const goldFloat = Math.max(0, safeNumber(economy.goldFloat, economy.gold)) + rewardAmount;
    const gold = Math.max(0, Math.floor(goldFloat));
    const totalClaimedMinutes = Math.max(0, Math.floor(safeNumber(rewards.giftGoldMinutesClaimed, 0))) + pendingMinutes;
    writePreparedEconomy(transaction, economy, { gold, goldFloat });
    transaction.set(rewardsRef, {
      uid,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      pendingGiftGoldMinutes: 0,
      giftGoldMinutesClaimed: totalClaimedMinutes,
      lastGiftClaimedAtMs: nowMs,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "clan_gift_claimed", {
      productionMinutes: pendingMinutes,
      rewardAmount,
    }, nowMs);
    return createEconomyResponse(economy, {
      gold,
      goldFloat,
      claimed: true,
      rewardType: "gold",
      reward: rewardAmount,
      productionMinutes: pendingMinutes,
      memberRewards: clanMemberRewardsForClient({
        ...rewards,
        pendingGiftGoldMinutes: 0,
        giftGoldMinutesClaimed: totalClaimedMinutes,
      }, nowMs),
    });
  });
});

exports.claimClanQuestReward = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const rewardId = safeString(request.data?.rewardId, 40);
  const rewardConfig = CLAN_QUEST_REWARDS.find(reward => reward.id === rewardId);
  if (!rewardConfig) throw new HttpsError("invalid-argument", "Choose a valid clan quest reward.");
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const profileSnap = await transaction.get(db.doc(`players/${uid}`));
    const profile = profileSnap.data() || {};
    const clanId = safeString(profile.clanId, 128);
    if (!clanId) throw new HttpsError("failed-precondition", "You are not in a clan.");
    const rewardsRef = clanMemberRewardsRef(clanId, uid);
    const [clanSnap, memberSnap, progressSnap, rewardsSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
      transaction.get(clanQuestProgressRef(clanId)),
      transaction.get(rewardsRef),
    ]);
    if (!clanSnap.exists || !memberSnap.exists) {
      throw new HttpsError("permission-denied", "Clan membership could not be verified.");
    }
    assertCurrentClan(clanSnap.data() || {});
    const member = memberSnap.data() || {};
    const progress = progressSnap.exists ? progressSnap.data() || {} : {};
    const unlockedAtMs = Math.max(0, timestampToMs(progress.milestoneUnlocks?.[rewardId]));
    if (!unlockedAtMs || Math.max(0, Math.floor(safeNumber(progress.captureCount, 0))) < rewardConfig.captures) {
      throw new HttpsError("failed-precondition", "That clan quest reward is still locked.");
    }
    const joinedAtMs = Math.max(0, timestampToMs(member.joinedAtMs));
    if (!joinedAtMs || joinedAtMs >= unlockedAtMs) {
      throw new HttpsError("permission-denied", "You joined after that reward was unlocked.");
    }
    const rewards = rewardsSnap.exists ? rewardsSnap.data() || {} : {};
    const questClaims = normalizeClanQuestClaims(rewards.questClaims);
    if (questClaims[rewardId]) {
      return {
        ok: true,
        claimed: true,
        replayed: true,
        rewardId,
        memberRewards: clanMemberRewardsForClient(rewards, nowMs),
      };
    }
    const economy = await prepareEconomyCollection(transaction, uid, nowMs, { profileRef: profileSnap.ref, profileSnap });
    const rates = getRewardedAdBaseRates(economy);
    const baseRatePerHour = rewardConfig.rewardType === "troops" ? rates.troopsPerHour : rates.goldPerHour;
    const rewardAmount = Math.max(0, Math.floor(baseRatePerHour * rewardConfig.productionMinutes / 60));
    let gold = economy.gold;
    let goldFloat = economy.goldFloat;
    let troopCredit = null;
    const profileOverrides = {};
    if (rewardConfig.rewardType === "troops") {
      troopCredit = creditLevelUpTroopsToMainCity(economy, economy.profileAfter, rewardAmount, nowMs);
      if (!troopCredit) {
        throw new HttpsError("failed-precondition", "Claim a main city before receiving the troop reward.");
      }
    } else {
      goldFloat = Math.max(0, safeNumber(economy.goldFloat, economy.gold)) + rewardAmount;
      gold = Math.max(0, Math.floor(goldFloat));
      profileOverrides.gold = gold;
      profileOverrides.goldFloat = goldFloat;
    }
    writePreparedEconomy(transaction, economy, profileOverrides);
    const nextClaims = {
      ...questClaims,
      [rewardId]: {
        claimedAtMs: nowMs,
        rewardType: rewardConfig.rewardType,
        productionMinutes: rewardConfig.productionMinutes,
        rewardAmount,
      },
    };
    transaction.set(rewardsRef, {
      uid,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      questClaims: nextClaims,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "clan_quest_reward_claimed", {
      rewardId,
      captures: rewardConfig.captures,
      rewardType: rewardConfig.rewardType,
      productionMinutes: rewardConfig.productionMinutes,
      rewardAmount,
    }, nowMs);
    return createEconomyResponse(economy, {
      ...(rewardConfig.rewardType === "gold" ? { gold, goldFloat } : {}),
      claimed: true,
      replayed: false,
      rewardId,
      rewardType: rewardConfig.rewardType,
      reward: rewardAmount,
      productionMinutes: rewardConfig.productionMinutes,
      targetCityId: troopCredit?.cityId || "",
      targetCityName: troopCredit?.cityName || "",
      memberRewards: clanMemberRewardsForClient({
        ...rewards,
        questClaims: nextClaims,
      }, nowMs),
    });
  });
});

function clanIdentitySnapshotFields(identity = {}, revision = 0, target = "asset") {
  const isLeaderboard = target === "leaderboard";
  const patch = isLeaderboard
    ? {
      clanIdentityRevision: revision,
      clanIdentityRevisionVersion: CLAN_IDENTITY_REVISION_VERSION,
    }
    : {
      ownerClanIdentityRevision: revision,
      ownerClanIdentityRevisionVersion: CLAN_IDENTITY_REVISION_VERSION,
    };
  if (identity.clanId) {
    if (isLeaderboard) {
      patch.clanId = identity.clanId;
      patch.clanName = identity.clanName;
      patch.clanTag = identity.clanTag;
    } else {
      patch.ownerClanId = identity.clanId;
      patch.ownerClanName = identity.clanName;
      patch.ownerClanTag = identity.clanTag;
    }
  } else if (isLeaderboard) {
    patch.clanId = FieldValue.delete();
    patch.clanName = FieldValue.delete();
    patch.clanTag = FieldValue.delete();
  } else {
    patch.ownerClanId = FieldValue.delete();
    patch.ownerClanName = FieldValue.delete();
    patch.ownerClanTag = FieldValue.delete();
  }
  patch.updatedAt = FieldValue.serverTimestamp();
  return patch;
}

function hasClanIdentitySnapshot(data = {}, identity = {}, revision = 0, target = "asset") {
  const isLeaderboard = target === "leaderboard";
  const storedRevision = Math.max(0, Math.floor(safeNumber(
    isLeaderboard ? data.clanIdentityRevision : data.ownerClanIdentityRevision,
    0
  )));
  if (storedRevision !== revision) return false;
  return safeString(isLeaderboard ? data.clanId : data.ownerClanId, 128) === identity.clanId
    && safeString(isLeaderboard ? data.clanName : data.ownerClanName, 24) === identity.clanName
    && safeString(isLeaderboard ? data.clanTag : data.ownerClanTag, 5) === identity.clanTag;
}

async function writeClanIdentitySnapshot(ref, identity = {}, revision = 0, target = "asset") {
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const data = snapshot.data() || {};
    const isLeaderboard = target === "leaderboard";
    const storedRevision = Math.max(0, Math.floor(safeNumber(
      isLeaderboard ? data.clanIdentityRevision : data.ownerClanIdentityRevision,
      0
    )));
    if (storedRevision > revision || hasClanIdentitySnapshot(data, identity, revision, target)) return;
    transaction.set(ref, clanIdentitySnapshotFields(identity, revision, target), { merge: true });
  });
}

exports.syncClanIdentityOnMembershipChange = onDocumentWritten({
  region: "us-central1",
  document: "players/{uid}",
  maxInstances: 20,
}, async event => {
  const uid = safeString(event.params?.uid, 128);
  const before = event.data?.before?.exists ? event.data.before.data() || {} : {};
  const after = event.data?.after?.exists ? event.data.after.data() || {} : {};
  const beforeRevision = Math.max(0, Math.floor(safeNumber(before.clanIdentityRevision, 0)));
  const afterRevision = Math.max(0, Math.floor(safeNumber(after.clanIdentityRevision, 0)));
  const membershipChanged = beforeRevision !== afterRevision
    || safeString(before.clanId, 128) !== safeString(after.clanId, 128)
    || safeString(before.clanName, 24) !== safeString(after.clanName, 24)
    || safeString(before.clanTag, 5) !== safeString(after.clanTag, 5);
  if (!uid || !event.data?.after?.exists || !membershipChanged) return;

  const latestProfileSnap = await db.doc(`players/${uid}`).get();
  if (!latestProfileSnap.exists) return;
  const latestProfile = latestProfileSnap.data() || {};
  const revision = Math.max(0, Math.floor(safeNumber(latestProfile.clanIdentityRevision, 0)));
  if (!revision || revision !== afterRevision) return;
  const identity = getCanonicalPlayerIdentity(uid, latestProfile, {}, {});
  const [ownedCitiesSnap, activeArmiesSnap] = await Promise.all([
    db.collectionGroup("cities")
      .where("ownerUid", "==", uid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID)
      .get(),
    activeArmiesQueryForPlayer(uid).get(),
  ]);
  const targetRefs = [
    ...ownedCitiesSnap.docs.filter(cityDoc => {
      const islandId = safeString(cityDoc.ref.parent.parent?.id, 160);
      return isCurrentWorldIslandId(islandId);
    }).map(cityDoc => ({ ref: cityDoc.ref, target: "asset" })),
    ...activeArmiesSnap.docs.filter(armyDoc => isCurrentWorldArmy({
      id: armyDoc.id,
      ...armyDoc.data(),
    })).map(armyDoc => ({ ref: armyDoc.ref, target: "asset" })),
    { ref: leaderboardEntryRef(uid), target: "leaderboard" },
  ];

  for (let index = 0; index < targetRefs.length; index += 25) {
    await Promise.all(targetRefs.slice(index, index + 25).map(entry => (
      writeClanIdentitySnapshot(entry.ref, identity, revision, entry.target)
    )));
  }
  await reconcileClanReinforcementsForPlayer(uid);
  const previousClanId = safeString(before.clanId, 128);
  const currentClanId = safeString(after.clanId, 128);
  if (previousClanId && previousClanId !== currentClanId) {
    await reconcileClanRalliesBeforeDeparture(uid, previousClanId);
  }
  const affectedClanIds = [...new Set([
    previousClanId,
    currentClanId,
  ].filter(Boolean))];
  const effectiveAtMs = Math.max(
    timestampToMs(after.clanIdentityUpdatedAtMs),
    timestampToMs(before.clanIdentityUpdatedAtMs)
  ) || Date.now();
  await Promise.all(affectedClanIds.map(clanId => rebuildClanBenefitsAndMemberStats(clanId, effectiveAtMs)));
});

exports.rebuildClanPowerOnPlayerStats = onDocumentWritten({
  region: "us-central1",
  document: "players/{uid}/stats/global",
  maxInstances: 20,
}, async event => {
  const uid = safeString(event.params?.uid, 128);
  const beforeStats = event.data?.before?.exists ? event.data.before.data() || {} : {};
  const afterStats = event.data?.after?.exists ? event.data.after.data() || {} : {};
  if (safeString(afterStats.resetGeneration, 120) !== RESET_GENERATION) return;
  const previousStatsPower = Math.max(0, Math.floor(safeNumber(beforeStats.kingPower, 0)));
  const nextPower = Math.max(0, Math.floor(safeNumber(afterStats.kingPower, 0)));
  if (previousStatsPower === nextPower) return;
  const profile = (await db.doc(`players/${uid}`).get()).data() || {};
  if (safeString(profile.resetGeneration, 120) !== RESET_GENERATION) return;
  const clanId = safeString(profile.clanId, 128);
  if (!clanId) return;
  await db.runTransaction(async transaction => {
    const [clanSnap, memberSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
    ]);
    if (!clanSnap.exists || !memberSnap.exists) return;
    const clan = clanSnap.data() || {};
    const previousPower = Math.max(0, Math.floor(safeNumber(memberSnap.data()?.kingPower, 0)));
    const totalKingPower = Math.max(0, Math.floor(safeNumber(clan.totalKingPower, 0)) - previousPower + nextPower);
    transaction.set(memberSnap.ref, { kingPower: nextPower, updatedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(clanSnap.ref, { totalKingPower, updatedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(leaderboardEntryRef(uid), clanIdentityPatch(clanId, clan, memberSnap.data()?.role), { merge: true });
    writeClanLeaderboard(transaction, clanId, clan, { totalKingPower });
  });
});

exports.createClanRally = timedCallable("createClanRally", { region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const order = normalizeArmyPayload(request.data || {}, uid);
  order.kind = "attack";
  order.launchKind = "attack";
  if (!order.fromId || !order.toId || order.fromId === order.toId) {
    throw new HttpsError("invalid-argument", "Choose a valid assembly city and rally objective.");
  }
  order.sourceRegionId = requireKnownWorldRegionId(order.sourceRegionId);
  order.targetRegionId = requireKnownWorldRegionId(order.targetRegionId);
  if (!getServerWorldTargetIds(order.sourceRegionId).has(order.fromId)) {
    throw new HttpsError("invalid-argument", "The assembly city is not part of the current Crownlands map.");
  }
  const allowedTargetIds = order.targetType === "camp"
    ? getServerWorldCampIds(order.targetRegionId)
    : getServerWorldTargetIds(order.targetRegionId);
  if (!allowedTargetIds.has(order.toId)) {
    throw new HttpsError("invalid-argument", "The rally objective is not part of the current Crownlands map.");
  }
  const requestedRallyId = normalizeRallyId(
    request.data?.rallyId || request.data?.requestId || order.id || `rally_${uid}_${nowMs.toString(36)}`
  );
  if (!requestedRallyId) throw new HttpsError("invalid-argument", "Missing rally id.");
  const sourceRef = cityRefForRegion(order.sourceRegionId, order.fromId);
  const targetRef = order.targetType === "camp"
    ? campRefForRegion(order.targetRegionId, order.toId)
    : cityRefForRegion(order.targetRegionId, order.toId);
  const playerRef = db.doc(`players/${uid}`);

  return db.runTransaction(async transaction => {
    const [sourceSnap, targetSnap, playerSnap] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(targetRef),
      transaction.get(playerRef),
    ]);
    if (!sourceSnap.exists) throw new HttpsError("not-found", "The assembly city was not found.");
    const missingTargetCamp = order.targetType === "camp" && !targetSnap.exists
      ? createNeutralRewardCampState(getAuthoritativeRewardCampSeed(order.targetRegionId, order.toId))
      : null;
    if (!targetSnap.exists && !missingTargetCamp) {
      throw new HttpsError("not-found", "The rally objective was not found.");
    }
    const profile = playerSnap.exists ? playerSnap.data() || {} : {};
    const clanId = safeString(profile.clanId, 128);
    if (!clanId) throw new HttpsError("failed-precondition", "Join a clan before creating a rally.");
    const rallyRef = clanRallyRef(clanId, requestedRallyId);
    const stateRef = clanRallyStateRef(clanId);
    const memberRef = db.doc(`clans/${clanId}/members/${uid}`);
    const [clanSnap, memberSnap, rallySnap, stateSnap] = await Promise.all([
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(memberRef),
      transaction.get(rallyRef),
      transaction.get(stateRef),
    ]);
    if (!clanSnap.exists || clanSnap.data()?.status !== "active" || !memberSnap.exists) {
      throw new HttpsError("failed-precondition", "Your clan membership is no longer active.");
    }
    if (rallySnap.exists) {
      const existing = normalizeClanRally(rallySnap);
      if (existing?.leaderUid === uid) {
        return { ok: true, duplicate: true, rally: rallyForClient(existing) };
      }
      throw new HttpsError("already-exists", "That rally request already exists.");
    }
    const state = normalizeRallyState(stateSnap.exists ? stateSnap.data() || {} : {});
    if (state.leaderUids.includes(uid)) {
      throw new HttpsError("failed-precondition", "You may lead only one forming rally at a time.");
    }
    if (state.leaderUids.length >= CLAN_FORMING_RALLY_LIMIT) {
      throw new HttpsError("resource-exhausted", `Your clan already has ${CLAN_FORMING_RALLY_LIMIT} forming rallies.`);
    }

    let source = { id: sourceSnap.id, ...sourceSnap.data() };
    const rawTarget = targetSnap.exists
      ? { id: targetSnap.id, ...targetSnap.data() }
      : missingTargetCamp;
    const target = order.targetType === "camp"
      ? getRewardCampCombatTarget(rawTarget)
      : rawTarget;
    if (getOwnerUid(source) !== uid) {
      throw new HttpsError("permission-denied", "You can only assemble a rally in your own city or Stronghold.");
    }
    if (!target || !isRallyObjectiveTarget(target, order.targetType)) {
      throw new HttpsError("failed-precondition", "Rallies may target only Strongholds, the Crown Citadel, or reward camps.");
    }
    const targetOwnerUid = getOwnerUid(target);
    const targetOwnerProfileSnap = targetOwnerUid
      ? await transaction.get(db.doc(`players/${targetOwnerUid}`))
      : null;
    if (isRallyTargetFriendly(
      targetOwnerUid,
      targetOwnerProfileSnap?.exists ? targetOwnerProfileSnap.data() || {} : {},
      { leaderUid: uid, clanId }
    )) {
      throw new HttpsError("failed-precondition", "You cannot form a rally against your own or a current clan ally's objective.");
    }
    const validatedRoute = validateArmyRoute(order, source, target);
    const economy = await prepareEconomyCollection(transaction, uid, nowMs, {
      profileRef: playerRef,
      profileSnap: playerSnap,
    });
    const producedSource = getEconomyCityByRef(economy, sourceRef);
    if (producedSource?.city) source = producedSource.city;
    const currentProfile = economy.profileAfter || profile;
    const sourceTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0)));
    const troops = clampInt(order.requestedTroops || order.troops, 1, Math.max(1, sourceTroops));
    if (!sourceTroops || sourceTroops < troops) {
      throw new HttpsError("failed-precondition", "Not enough troops in the assembly city.");
    }
    const stats = createPreparedEconomyStatsSnapshot(economy, {}, { nowMs });
    const participant = createRallyParticipantSnapshot({
      uid,
      profile: currentProfile,
      source,
      sourceRegionId: order.sourceRegionId,
      troops,
      role: "leader",
      status: RALLY_PARTICIPANT_ASSEMBLED,
      joinedAtMs: nowMs,
      assembledAtMs: nowMs,
      ownerKingPower: stats?.kingPower,
    });
    const shield = getRallyShieldDeactivation(economy, nowMs);
    const committedRallyTroops = getProfileCommittedRallyTroops(currentProfile) + troops;
    const sourcePatch = {
      troops: sourceTroops - troops,
      troopFloat: Math.max(0, safeNumber(source.troopFloat, sourceTroops) - troops),
    };
    const participants = [participant];
    const totals = rallyParticipantTotals(participants);
    const rally = {
      id: requestedRallyId,
      modelVersion: RALLY_MODEL_VERSION,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      clanId,
      status: RALLY_STATUS_FORMING,
      leaderUid: uid,
      leaderName: participant.ownerName,
      leaderFlag: participant.ownerFlag || null,
      leaderKingPower: Math.max(0, Math.floor(safeNumber(stats?.kingPower, 0))),
      assemblyCityId: source.id,
      assemblyCityName: safeString(source.name || source.id, 80),
      assemblyRegionId: order.sourceRegionId,
      assemblyX: safeNumber(source.x, 0),
      assemblyY: safeNumber(source.y, 0),
      targetType: order.targetType,
      targetId: target.id,
      targetName: safeString(target.name || target.id, 80),
      targetRegionId: order.targetRegionId,
      targetX: safeNumber(target.x, 0),
      targetY: safeNumber(target.y, 0),
      validatedRouteVersion: 1,
      path: validatedRoute.path,
      pathSegments: validatedRoute.pathSegments,
      routeRegionIds: validatedRoute.routeRegionIds,
      pathLength: validatedRoute.pathLength,
      participants,
      ...totals,
      armyId: "",
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (missingTargetCamp) {
      transaction.set(targetRef, {
        ...missingTargetCamp,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    writePreparedEconomy(transaction, economy, {
      ...shield.profileOverrides,
      committedRallyTroops,
      rallyResetGeneration: RESET_GENERATION,
    }, [
      ...shield.cityPatches,
      { ref: sourceRef, city: source, patch: sourcePatch },
    ], { nowMs });
    transaction.create(rallyRef, rally);
    transaction.set(stateRef, {
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      activeCount: state.leaderUids.length + 1,
      leaderUids: [...state.leaderUids, uid],
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "rally_created", {
      rallyId: requestedRallyId,
      targetType: order.targetType,
      targetId: target.id,
      targetRegionId: order.targetRegionId,
      troops,
    }, nowMs);
    return {
      ok: true,
      peaceShieldDeactivated: shield.deactivated,
      rally: rallyForClient(rally),
      sourceCity: {
        id: source.id,
        regionId: order.sourceRegionId,
        troops: sourcePatch.troops,
        troopFloat: sourcePatch.troopFloat,
      },
      cityUpdates: [
        ...shield.cityUpdates,
        { id: source.id, regionId: order.sourceRegionId, ...sourcePatch },
      ],
      currentUser: {
        committedRallyTroops,
        rallyResetGeneration: RESET_GENERATION,
        itemEffects: shield.profileOverrides.itemEffects || economy.itemEffects,
        globalStats: globalStatsForClient(economy.lastGlobalStats || economy.globalStats),
      },
    };
  });
});

exports.joinClanRally = timedCallable("joinClanRally", { region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const clanId = safeString(request.data?.clanId, 128);
  const rallyId = normalizeRallyId(request.data?.rallyId);
  if (!clanId || !rallyId) throw new HttpsError("invalid-argument", "Choose a rally to join.");
  const order = normalizeArmyPayload(request.data || {}, uid);
  if (!order.fromId) throw new HttpsError("invalid-argument", "Choose a source city.");
  order.sourceRegionId = requireKnownWorldRegionId(order.sourceRegionId);
  if (!getServerWorldTargetIds(order.sourceRegionId).has(order.fromId)) {
    throw new HttpsError("invalid-argument", "The source city is not part of the current Crownlands map.");
  }
  const rallyRef = clanRallyRef(clanId, rallyId);
  const playerRef = db.doc(`players/${uid}`);
  const sourceRef = cityRefForRegion(order.sourceRegionId, order.fromId);
  const joinArmyId = normalizeRallyId(
    request.data?.armyId || order.id || `${rallyId}_${uid}_join`
  );
  const canonicalJoinRef = canonicalArmyRef(joinArmyId);

  return db.runTransaction(async transaction => {
    const [rallySnap, playerSnap, sourceSnap, clanSnap, memberSnap, joinArmySnap] = await Promise.all([
      transaction.get(rallyRef),
      transaction.get(playerRef),
      transaction.get(sourceRef),
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
      transaction.get(canonicalJoinRef),
    ]);
    const rally = normalizeClanRally(rallySnap);
    if (!rally || rally.status !== RALLY_STATUS_FORMING) {
      throw new HttpsError("failed-precondition", "That rally is no longer forming.");
    }
    const profile = playerSnap.exists ? playerSnap.data() || {} : {};
    if (
      safeString(profile.clanId, 128) !== clanId
      || !clanSnap.exists
      || clanSnap.data()?.status !== "active"
      || !memberSnap.exists
    ) {
      throw new HttpsError("permission-denied", "Only current clan members may join this rally.");
    }
    const existingParticipant = getRallyParticipant(rally, uid);
    if (existingParticipant) {
      return {
        ok: true,
        duplicate: true,
        rally: rallyForClient(rally),
        movement: existingParticipant.joinArmyId && joinArmySnap.exists
          ? { id: joinArmySnap.id, ...joinArmySnap.data() }
          : null,
      };
    }
    if (activeRallyParticipants(rally).length >= RALLY_MAX_PARTICIPANTS) {
      throw new HttpsError("resource-exhausted", "That rally already has three participants.");
    }
    if (joinArmySnap.exists) {
      throw new HttpsError("already-exists", "That rally contribution order already exists.");
    }
    if (!sourceSnap.exists) throw new HttpsError("not-found", "The source city was not found.");
    const assemblyRef = rallyAssemblyRef(rally);
    if (!assemblyRef) throw new HttpsError("failed-precondition", "The rally assembly city is unavailable.");
    const assemblySnap = await transaction.get(assemblyRef);
    if (!assemblySnap.exists) throw new HttpsError("failed-precondition", "The rally assembly city no longer exists.");
    let source = { id: sourceSnap.id, ...sourceSnap.data() };
    const assembly = { id: assemblySnap.id, ...assemblySnap.data() };
    if (getOwnerUid(source) !== uid) {
      throw new HttpsError("permission-denied", "You can only contribute troops from your own city or Stronghold.");
    }
    if (getOwnerUid(assembly) !== rally.leaderUid) {
      throw new HttpsError("failed-precondition", "The leader no longer owns the rally assembly city.");
    }
    const joinOrder = {
      ...order,
      id: joinArmyId,
      kind: "rally_join",
      launchKind: "rally_join",
      toId: rally.assemblyCityId,
      targetType: "city",
      targetRegionId: rally.assemblyRegionId,
    };
    const validatedRoute = validateArmyRoute(joinOrder, source, assembly);
    const economy = await prepareEconomyCollection(transaction, uid, nowMs, {
      profileRef: playerRef,
      profileSnap: playerSnap,
    });
    const producedSource = getEconomyCityByRef(economy, sourceRef);
    if (producedSource?.city) source = producedSource.city;
    const currentProfile = economy.profileAfter || profile;
    const sourceTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0)));
    const troops = clampInt(order.requestedTroops || order.troops, 1, Math.max(1, sourceTroops));
    if (!sourceTroops || sourceTroops < troops) {
      throw new HttpsError("failed-precondition", "Not enough troops in the source city.");
    }
    const stats = createPreparedEconomyStatsSnapshot(economy, {}, { nowMs });
    const participant = createRallyParticipantSnapshot({
      uid,
      profile: currentProfile,
      source,
      sourceRegionId: order.sourceRegionId,
      troops,
      role: "ally",
      status: RALLY_PARTICIPANT_INBOUND,
      joinArmyId,
      joinedAtMs: nowMs,
      ownerKingPower: stats?.kingPower,
    });
    const movement = createRallyAssemblyMovement({
      order: joinOrder,
      rally,
      participant,
      source,
      assembly,
      profile: currentProfile,
      economy,
      validatedRoute,
      nowMs,
    });
    participant.arrivesAtMs = movement.arrivesAtMs;
    const participants = [...activeRallyParticipants(rally), participant];
    const totals = rallyParticipantTotals(participants);
    const shield = getRallyShieldDeactivation(economy, nowMs);
    const sourcePatch = {
      troops: sourceTroops - troops,
      troopFloat: Math.max(0, safeNumber(source.troopFloat, sourceTroops) - troops),
    };
    writePreparedEconomy(transaction, economy, shield.profileOverrides, [
      ...shield.cityPatches,
      { ref: sourceRef, city: source, patch: sourcePatch },
    ], {
      addActiveArmies: [movement],
      nowMs,
    });
    writeRallyJoinMovementCopies(transaction, movement, { includeCreatedAt: true });
    transaction.set(rallyRef, {
      participants,
      ...totals,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "rally_joined", {
      rallyId,
      troops,
      sourceId: source.id,
      sourceRegionId: order.sourceRegionId,
      arrivesAtMs: movement.arrivesAtMs,
    }, nowMs);
    return {
      ok: true,
      peaceShieldDeactivated: shield.deactivated,
      rally: rallyForClient({ ...rally, participants, ...totals, updatedAtMs: nowMs }),
      movement,
      sourceCity: { id: source.id, regionId: order.sourceRegionId, ...sourcePatch },
      cityUpdates: [
        ...shield.cityUpdates,
        { id: source.id, regionId: order.sourceRegionId, ...sourcePatch },
      ],
      currentUser: {
        itemEffects: shield.profileOverrides.itemEffects || economy.itemEffects,
        globalStats: globalStatsForClient(economy.lastGlobalStats || economy.globalStats),
      },
    };
  });
});

async function withdrawClanRallyContributionRequest(request) {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const clanId = safeString(request.data?.clanId, 128);
  const rallyId = normalizeRallyId(request.data?.rallyId);
  if (!clanId || !rallyId) throw new HttpsError("invalid-argument", "Choose a rally contribution to withdraw.");
  const rallyRef = clanRallyRef(clanId, rallyId);

  return db.runTransaction(async transaction => {
    const [rallySnap, profileSnap, memberSnap] = await Promise.all([
      transaction.get(rallyRef),
      transaction.get(db.doc(`players/${uid}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
    ]);
    const rally = normalizeClanRally(rallySnap);
    if (!rally || rally.status !== RALLY_STATUS_FORMING) {
      throw new HttpsError("failed-precondition", "That rally is no longer forming.");
    }
    if (rally.leaderUid === uid) {
      throw new HttpsError("failed-precondition", "The rally leader must cancel the rally instead.");
    }
    const participant = getRallyParticipant(rally, uid);
    if (!participant) {
      return { ok: true, duplicate: true, rally: rallyForClient(rally), movement: null };
    }
    const profile = profileSnap.exists ? profileSnap.data() || {} : {};
    if (safeString(profile.clanId, 128) === clanId && !memberSnap.exists) {
      throw new HttpsError("failed-precondition", "Your clan membership is still synchronizing. Try again.");
    }
    let movement = null;
    let economy = null;
    let committedRallyTroops = getProfileCommittedRallyTroops(profile);
    if (participant.status === RALLY_PARTICIPANT_INBOUND) {
      const joinRef = canonicalArmyRef(participant.joinArmyId);
      const joinSnap = await transaction.get(joinRef);
      if (!joinSnap.exists || joinSnap.data()?.status !== "active") {
        throw new HttpsError("aborted", "The contribution arrival is being processed. Try again.");
      }
      const joinArmy = { id: joinSnap.id, ...joinSnap.data() };
      movement = joinArmy.returning
        ? joinArmy
        : {
          ...createAlliedTargetReturnMovement(joinArmy, nowMs),
          returnReason: RALLY_RETURN_REASON,
          rallyReturn: true,
        };
      writeRallyJoinMovementCopies(transaction, movement);
    } else if (participant.status === RALLY_PARTICIPANT_ASSEMBLED) {
      const assemblyRef = rallyAssemblyRef(rally);
      const assemblySnap = assemblyRef ? await transaction.get(assemblyRef) : null;
      if (!assemblySnap?.exists) {
        throw new HttpsError("failed-precondition", "The rally assembly city no longer exists.");
      }
      economy = await prepareEconomyCollection(transaction, uid, nowMs, {
        profileRef: db.doc(`players/${uid}`),
        profileSnap,
      });
      const destinationEntry = getRallyReturnDestination(economy, profile, participant);
      movement = createRallyReturnMovement({
        rally,
        participant,
        source: { id: assemblySnap.id, ...assemblySnap.data(), regionId: rally.assemblyRegionId },
        destinationEntry,
        economy,
        profile: economy.profileAfter || profile,
        nowMs,
        reason: RALLY_RETURN_REASON,
        movementId: `${rally.id}_${uid}_withdraw`,
      });
      committedRallyTroops = Math.max(0, getProfileCommittedRallyTroops(economy.profileAfter || profile) - participant.troops);
      writePreparedEconomy(transaction, economy, {
        committedRallyTroops,
        rallyResetGeneration: RESET_GENERATION,
      }, [], {
        addActiveArmies: [movement],
        nowMs,
      });
      writeArmyMovementCopies(transaction, movement, { includeCreatedAt: true });
    }
    const participants = activeRallyParticipants(rally).filter(entry => entry.uid !== uid);
    const totals = rallyParticipantTotals(participants);
    transaction.set(rallyRef, {
      participants,
      ...totals,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    writeClanAudit(transaction, clanId, uid, "rally_contribution_withdrawn", {
      rallyId,
      troops: participant.troops,
      previousStatus: participant.status,
    }, nowMs);
    return {
      ok: true,
      rally: rallyForClient({ ...rally, participants, ...totals, updatedAtMs: nowMs }),
      movement,
      currentUser: economy ? {
        committedRallyTroops,
        rallyResetGeneration: RESET_GENERATION,
        globalStats: globalStatsForClient(economy.lastGlobalStats || economy.globalStats),
      } : null,
    };
  });
}

exports.withdrawClanRallyContribution = timedCallable(
  "withdrawClanRallyContribution",
  { region: "us-central1", maxInstances: 20, invoker: "public" },
  withdrawClanRallyContributionRequest
);

async function cancelClanRallyRequest(request) {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const clanId = safeString(request.data?.clanId, 128);
  const rallyId = normalizeRallyId(request.data?.rallyId);
  if (!clanId || !rallyId) throw new HttpsError("invalid-argument", "Choose a rally to cancel.");
  const rallyRef = clanRallyRef(clanId, rallyId);
  const stateRef = clanRallyStateRef(clanId);

  return db.runTransaction(async transaction => {
    const [rallySnap, stateSnap] = await Promise.all([
      transaction.get(rallyRef),
      transaction.get(stateRef),
    ]);
    const rally = normalizeClanRally(rallySnap);
    if (!rally) throw new HttpsError("not-found", "That rally was not found.");
    if (rally.leaderUid !== uid) throw new HttpsError("permission-denied", "Only the rally leader may cancel it.");
    if (rally.status === RALLY_STATUS_CANCELLED) {
      return { ok: true, duplicate: true, rally: rallyForClient(rally), movements: [] };
    }
    if (rally.status !== RALLY_STATUS_FORMING) {
      throw new HttpsError("failed-precondition", "Only a forming rally may be cancelled.");
    }
    const participants = activeRallyParticipants(rally);
    const inboundParticipants = participants.filter(participant => participant.status === RALLY_PARTICIPANT_INBOUND);
    const assembledParticipants = participants.filter(participant => participant.status === RALLY_PARTICIPANT_ASSEMBLED);
    const inboundSnaps = new Map();
    for (const participant of inboundParticipants) {
      if (!participant.joinArmyId) continue;
      const snapshot = await transaction.get(canonicalArmyRef(participant.joinArmyId));
      inboundSnaps.set(participant.uid, snapshot);
    }
    const assemblyRef = rallyAssemblyRef(rally);
    const assemblySnap = assemblyRef ? await transaction.get(assemblyRef) : null;
    const economies = new Map();
    for (const participant of assembledParticipants) {
      const economy = await prepareEconomyCollection(transaction, participant.uid, nowMs);
      economies.set(participant.uid, economy);
    }
    const movements = [];
    const immediateCityUpdates = [];
    const committedTroopsByUid = new Map();
    for (const participant of inboundParticipants) {
      const joinSnap = inboundSnaps.get(participant.uid);
      if (!joinSnap?.exists || joinSnap.data()?.status !== "active" || joinSnap.data()?.returning) continue;
      const joinArmy = { id: joinSnap.id, ...joinSnap.data() };
      const movement = {
        ...createAlliedTargetReturnMovement(joinArmy, nowMs),
        returnReason: RALLY_RETURN_REASON,
        rallyReturn: true,
      };
      writeRallyJoinMovementCopies(transaction, movement);
      movements.push(movement);
    }
    for (const participant of assembledParticipants) {
      const economy = economies.get(participant.uid);
      const profile = economy?.profileAfter || {};
      if (!economy) continue;
      const committedRallyTroops = Math.max(0, getProfileCommittedRallyTroops(profile) - participant.troops);
      committedTroopsByUid.set(participant.uid, committedRallyTroops);
      const profileOverrides = {
        committedRallyTroops,
        rallyResetGeneration: RESET_GENERATION,
      };
      const assembly = assemblySnap?.exists
        ? { id: assemblySnap.id, ...assemblySnap.data(), regionId: rally.assemblyRegionId }
        : {
          id: rally.assemblyCityId,
          name: rally.assemblyCityName,
          regionId: rally.assemblyRegionId,
          x: rally.assemblyX,
          y: rally.assemblyY,
        };
      if (participant.role === "leader" && assemblySnap?.exists && getOwnerUid(assembly) === participant.uid) {
        const nextTroops = Math.max(0, Math.floor(safeNumber(assembly.troops, 0))) + participant.troops;
        const nextTroopFloat = Math.max(0, safeNumber(assembly.troopFloat, assembly.troops || 0)) + participant.troops;
        const patch = { troops: nextTroops, troopFloat: nextTroopFloat };
        writePreparedEconomy(transaction, economy, profileOverrides, [
          { ref: assemblyRef, city: assembly, patch },
        ], { nowMs });
        immediateCityUpdates.push({
          id: assembly.id,
          regionId: rally.assemblyRegionId,
          ...patch,
        });
      } else {
        const destinationEntry = getRallyReturnDestination(economy, profile, participant);
        const movement = createRallyReturnMovement({
          rally,
          participant,
          source: assembly,
          destinationEntry,
          economy,
          profile,
          nowMs,
          reason: RALLY_RETURN_REASON,
          movementId: `${rally.id}_${participant.uid}_cancel`,
        });
        writePreparedEconomy(transaction, economy, profileOverrides, [], {
          addActiveArmies: [movement],
          nowMs,
        });
        writeArmyMovementCopies(transaction, movement, { includeCreatedAt: true });
        movements.push(movement);
      }
    }
    const terminalParticipants = participants.map(participant => ({
      ...participant,
      status: participant.status === RALLY_PARTICIPANT_INBOUND
        ? RALLY_PARTICIPANT_RETURNING
        : participant.role === "leader" && immediateCityUpdates.length
          ? RALLY_PARTICIPANT_RETURNED
          : RALLY_PARTICIPANT_RETURNING,
    }));
    transaction.set(rallyRef, {
      status: RALLY_STATUS_CANCELLED,
      participants: terminalParticipants,
      participantUids: terminalParticipants.map(participant => participant.uid),
      participantCount: 0,
      assembledTroops: 0,
      inboundTroops: 0,
      cancelledAtMs: nowMs,
      cancelledByUid: uid,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    releaseFormingRallySlot(transaction, stateRef, stateSnap.exists ? stateSnap.data() || {} : {}, uid, nowMs);
    writeClanAudit(transaction, clanId, uid, "rally_cancelled", {
      rallyId,
      participantCount: participants.length,
      troops: participants.reduce((total, participant) => total + participant.troops, 0),
    }, nowMs);
    return {
      ok: true,
      rally: rallyForClient({
        ...rally,
        status: RALLY_STATUS_CANCELLED,
        participants: terminalParticipants,
        cancelledAtMs: nowMs,
        updatedAtMs: nowMs,
      }),
      movements,
      cityUpdates: immediateCityUpdates,
      currentUser: economies.get(uid) ? {
        committedRallyTroops: committedTroopsByUid.get(uid) || 0,
        rallyResetGeneration: RESET_GENERATION,
        globalStats: globalStatsForClient(economies.get(uid).lastGlobalStats || economies.get(uid).globalStats),
      } : null,
    };
  });
}

exports.cancelClanRally = timedCallable(
  "cancelClanRally",
  { region: "us-central1", maxInstances: 20, invoker: "public" },
  cancelClanRallyRequest
);

exports.launchClanRally = timedCallable("launchClanRally", { region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const clanId = safeString(request.data?.clanId, 128);
  const rallyId = normalizeRallyId(request.data?.rallyId);
  if (!clanId || !rallyId) throw new HttpsError("invalid-argument", "Choose a rally to launch.");
  const rallyRef = clanRallyRef(clanId, rallyId);
  const stateRef = clanRallyStateRef(clanId);

  const result = await db.runTransaction(async transaction => {
    const [rallySnap, stateSnap, leaderProfileSnap, clanSnap, leaderMemberSnap] = await Promise.all([
      transaction.get(rallyRef),
      transaction.get(stateRef),
      transaction.get(db.doc(`players/${uid}`)),
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${uid}`)),
    ]);
    const rally = normalizeClanRally(rallySnap);
    if (!rally) throw new HttpsError("not-found", "That rally was not found.");
    if (rally.leaderUid !== uid) throw new HttpsError("permission-denied", "Only the rally leader may launch it.");
    if (rally.status === RALLY_STATUS_LAUNCHED && rally.armyId) {
      const armySnap = await transaction.get(canonicalArmyRef(rally.armyId));
      return {
        ok: true,
        duplicate: true,
        rally: rallyForClient(rally),
        movement: armySnap.exists ? { id: armySnap.id, ...armySnap.data() } : null,
      };
    }
    if (rally.status !== RALLY_STATUS_FORMING) {
      throw new HttpsError("failed-precondition", "That rally is no longer forming.");
    }
    const leaderProfile = leaderProfileSnap.exists ? leaderProfileSnap.data() || {} : {};
    if (
      safeString(leaderProfile.clanId, 128) !== clanId
      || !clanSnap.exists
      || clanSnap.data()?.status !== "active"
      || !leaderMemberSnap.exists
    ) {
      throw new HttpsError("failed-precondition", "The leader's clan membership is no longer active.");
    }
    const assemblyRef = rallyAssemblyRef(rally);
    const targetRef = rallyTargetRef(rally);
    if (!assemblyRef || !targetRef) throw new HttpsError("failed-precondition", "The rally route is incomplete.");
    const [assemblySnap, targetSnap] = await Promise.all([
      transaction.get(assemblyRef),
      transaction.get(targetRef),
    ]);
    if (!assemblySnap.exists || getOwnerUid(assemblySnap.data() || {}) !== uid) {
      throw new HttpsError("failed-precondition", "You no longer own the rally assembly city.");
    }
    if (!targetSnap.exists) throw new HttpsError("failed-precondition", "The rally objective no longer exists.");
    const assembly = { id: assemblySnap.id, ...assemblySnap.data() };
    const target = rally.targetType === "camp"
      ? getRewardCampCombatTarget({ id: targetSnap.id, ...targetSnap.data() })
      : { id: targetSnap.id, ...targetSnap.data() };
    if (!target || !isRallyObjectiveTarget(target, rally.targetType)) {
      throw new HttpsError("failed-precondition", "That location is no longer an eligible rally objective.");
    }
    const targetOwnerUid = getOwnerUid(target);
    const targetOwnerProfileSnap = targetOwnerUid
      ? await transaction.get(db.doc(`players/${targetOwnerUid}`))
      : null;
    const targetOwnerProfile = targetOwnerProfileSnap?.exists ? targetOwnerProfileSnap.data() || {} : {};
    if (isRallyTargetFriendly(targetOwnerUid, targetOwnerProfile, rally)) {
      throw new HttpsError("failed-precondition", "The objective is currently owned by you or a current clan ally.");
    }
    const launchOrder = {
      id: normalizeRallyId(request.data?.armyId || `rally_attack_${rally.id}`),
      fromId: rally.assemblyCityId,
      toId: rally.targetId,
      sourceRegionId: rally.assemblyRegionId,
      targetRegionId: rally.targetRegionId,
      targetType: rally.targetType,
      routeRegionIds: rally.routeRegionIds,
      pathSegments: rally.pathSegments,
      path: rally.path,
      pathLength: rally.pathLength,
    };
    const validatedRoute = validateArmyRoute(launchOrder, assembly, target);
    const inboundParticipants = activeRallyParticipants(rally)
      .filter(participant => participant.status === RALLY_PARTICIPANT_INBOUND);
    const assembledParticipants = assembledRallyParticipants(rally);
    if (!assembledParticipants.length || !assembledParticipants.some(participant => participant.uid === uid)) {
      throw new HttpsError("failed-precondition", "The leader has no assembled troops to launch.");
    }
    const existingArmyRef = canonicalArmyRef(launchOrder.id);
    const existingArmySnap = await transaction.get(existingArmyRef);
    if (existingArmySnap.exists) {
      throw new HttpsError("already-exists", "That rally launch already exists.");
    }
    const inboundSnaps = new Map();
    for (const participant of inboundParticipants) {
      if (!participant.joinArmyId) continue;
      inboundSnaps.set(participant.uid, await transaction.get(canonicalArmyRef(participant.joinArmyId)));
    }
    const participantProfiles = new Map();
    for (const participant of assembledParticipants) {
      const [profileSnap, globalStatsSnap] = await Promise.all([
        participant.uid === uid
          ? Promise.resolve(leaderProfileSnap)
          : transaction.get(db.doc(`players/${participant.uid}`)),
        transaction.get(playerGlobalStatsRef(participant.uid)),
      ]);
      participantProfiles.set(participant.uid, {
        profile: profileSnap.exists ? profileSnap.data() || {} : {},
        globalStats: globalStatsSnap.exists ? globalStatsSnap.data() || {} : {},
      });
    }
    const leaderEconomy = await prepareEconomyCollection(transaction, uid, nowMs, {
      profileRef: db.doc(`players/${uid}`),
      profileSnap: leaderProfileSnap,
    });
    const snapshottedParticipants = assembledParticipants.map(participant => {
      const entry = participantProfiles.get(participant.uid) || {};
      const profile = entry.profile || {};
      return createRallyParticipantSnapshot({
        uid: participant.uid,
        profile,
        source: {
          id: participant.sourceId,
          name: participant.sourceName,
          regionId: participant.sourceRegionId,
        },
        sourceRegionId: participant.sourceRegionId,
        troops: participant.troops,
        role: participant.uid === uid ? "leader" : "ally",
        status: RALLY_PARTICIPANT_ASSEMBLED,
        joinArmyId: participant.joinArmyId,
        joinedAtMs: participant.joinedAtMs,
        assembledAtMs: participant.assembledAtMs,
        ownerKingPower: getPlayerPowerSnapshot({
          profile,
          globalStats: entry.globalStats,
          fallback: participant.ownerKingPower,
        }),
      });
    });
    const attackPackages = getRallyAttackPackages({ participants: snapshottedParticipants });
    const totalTroops = attackPackages.reduce((total, participant) => total + participant.troops, 0);
    if (!totalTroops) throw new HttpsError("failed-precondition", "The rally has no assembled troops.");
    const leaderStats = createPreparedEconomyStatsSnapshot(leaderEconomy, {}, { nowMs });
    const attackerKingPower = Math.max(
      0,
      Math.floor(safeNumber(leaderStats?.kingPower, rally.leaderKingPower))
    );
    const defenderKingPower = Math.max(1, getPlayerPowerSnapshot({
      profile: targetOwnerProfile,
      city: target,
    }));
    const duration = calculateTravelTime({
      pathLength: validatedRoute.pathLength,
      troopCount: totalTroops,
      kind: "attack",
      speedMultiplier: skillMultiplier(leaderEconomy.profileAfter || leaderProfile, "marchOrders")
        * (1 + Math.max(0, safeNumber(leaderEconomy.bonuses?.marchSpeedBonusPercent, 0)) / 100),
    });
    const movement = {
      id: launchOrder.id,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      ownerKind: "player",
      ownerUid: uid,
      ownerName: normalizePlayerName(leaderProfile.playerName || rally.leaderName, "Ruler"),
      ownerFlag: leaderProfile.flag || rally.leaderFlag || null,
      ownerKingPower: attackerKingPower,
      kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
      kind: "attack",
      launchKind: "attack",
      rallyAttack: true,
      rallyId: rally.id,
      rallyClanId: clanId,
      rallyParticipantCount: attackPackages.length,
      participantUids: attackPackages.map(participant => participant.uid),
      targetType: rally.targetType,
      fromId: rally.assemblyCityId,
      toId: rally.targetId,
      sourceRegionId: rally.assemblyRegionId,
      targetRegionId: rally.targetRegionId,
      fromName: safeString(rally.assemblyCityName || assembly.name, 40),
      toName: safeString(rally.targetName || target.name, 40),
      troops: totalTroops,
      requestedTroops: totalTroops,
      total: duration,
      path: validatedRoute.path,
      pathSegments: validatedRoute.pathSegments,
      routeRegionIds: validatedRoute.routeRegionIds,
      viewRegionIds: validatedRoute.routeRegionIds,
      pathLength: validatedRoute.pathLength,
      targetKey: `${rally.targetRegionId}:${rally.targetId}`,
      targetOwnerAtLaunch: targetOwnerUid ? "player" : "neutral",
      originalTargetOwnerUid: targetOwnerUid || "",
      targetOwnerUid: targetOwnerUid || "",
      lastIncomingNotificationOwnerUid: targetOwnerUid || "",
      attackerKingPower,
      defenderKingPower,
      attackProtection: null,
      launchedAtMs: nowMs,
      arrivesAtMs: nowMs + Math.ceil(duration * 1000),
      status: "active",
      createdByServer: true,
      rallyModelVersion: RALLY_MODEL_VERSION,
      serverAuthorityVersion: 3,
    };
    const returnedInbound = [];
    for (const participant of inboundParticipants) {
      const joinSnap = inboundSnaps.get(participant.uid);
      if (!joinSnap?.exists || joinSnap.data()?.status !== "active" || joinSnap.data()?.returning) continue;
      const inbound = { id: joinSnap.id, ...joinSnap.data() };
      const returning = {
        ...createAlliedTargetReturnMovement(inbound, nowMs),
        returnReason: RALLY_RETURN_REASON,
        rallyReturn: true,
      };
      writeRallyJoinMovementCopies(transaction, returning);
      returnedInbound.push({
        uid: participant.uid,
        ownerName: participant.ownerName,
        troops: participant.troops,
        movementId: returning.id,
        arrivesAtMs: returning.arrivesAtMs,
      });
    }
    writeArmyMovementCopies(transaction, movement, { includeCreatedAt: true });
    if (rally.targetType === "camp") {
      transaction.set(targetRef, {
        activeArmyIds: normalizeActiveArmyIds([...(target.activeArmyIds || []), movement.id]),
        state: "contested",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    const totals = rallyParticipantTotals(snapshottedParticipants);
    transaction.set(rallyRef, {
      status: RALLY_STATUS_LAUNCHED,
      armyId: movement.id,
      participants: snapshottedParticipants,
      ...totals,
      inboundTroops: 0,
      returnedInbound,
      attackPower: attackPackages.reduce((total, participant) => total + participant.effectivePower, 0),
      launchedAtMs: nowMs,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    releaseFormingRallySlot(transaction, stateRef, stateSnap.exists ? stateSnap.data() || {} : {}, uid, nowMs);
    writeClanAudit(transaction, clanId, uid, "rally_launched", {
      rallyId,
      armyId: movement.id,
      assembledParticipants: snapshottedParticipants.length,
      assembledTroops: totalTroops,
      returnedInboundParticipants: returnedInbound.length,
    }, nowMs);
    return {
      ok: true,
      rally: rallyForClient({
        ...rally,
        status: RALLY_STATUS_LAUNCHED,
        armyId: movement.id,
        participants: snapshottedParticipants,
        ...totals,
        inboundTroops: 0,
        launchedAtMs: nowMs,
        updatedAtMs: nowMs,
      }),
      movement,
      returnedInbound,
      incomingNotification: createIncomingArmyNotification({
        defenderUid: targetOwnerUid,
        attackerUid: uid,
        movement,
        source: assembly,
        target,
      }),
    };
  });
  const incomingNotification = result.incomingNotification || null;
  delete result.incomingNotification;
  if (incomingNotification) {
    await sendIncomingArmyNotification(incomingNotification).catch(error => {
      console.warn("Could not send rally incoming army notification", error);
    });
  }
  return result;
});

exports.previewArmyProtection = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const sourceRegionId = requireKnownWorldRegionId(data.sourceRegionId || data.fromRegionId);
  const targetRegionId = requireKnownWorldRegionId(data.targetRegionId || data.toRegionId);
  const fromId = safeString(data.fromId, 96);
  const toId = safeString(data.toId, 96);
  const targetType = data.targetType === "camp" ? "camp" : "city";
  if (!fromId || !toId || fromId === toId) {
    throw new HttpsError("invalid-argument", "Choose a valid source and destination city.");
  }
  if (!getServerWorldTargetIds(sourceRegionId).has(fromId)) {
    throw new HttpsError("invalid-argument", "The source city is not part of the current Crownlands map.");
  }
  const allowedTargetIds = targetType === "camp"
    ? getServerWorldCampIds(targetRegionId)
    : getServerWorldTargetIds(targetRegionId);
  if (!allowedTargetIds.has(toId)) {
    throw new HttpsError("invalid-argument", "The destination is not part of the current Crownlands map.");
  }

  const sourceRef = cityRefForRegion(sourceRegionId, fromId);
  const targetRef = targetType === "camp"
    ? campRefForRegion(targetRegionId, toId)
    : cityRefForRegion(targetRegionId, toId);
  const playerRef = db.doc(`players/${uid}`);
  const attackerLeaderboardRef = leaderboardEntryRef(uid);
  const nowMs = Date.now();

  return db.runTransaction(async transaction => {
    const [sourceSnap, targetSnap, playerSnap, attackerLeaderboardSnap] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(targetRef),
      transaction.get(playerRef),
      transaction.get(attackerLeaderboardRef),
    ]);
    if (!sourceSnap.exists || !targetSnap.exists) {
      throw new HttpsError("not-found", "The source or destination was not found.");
    }
    let source = { id: sourceSnap.id, ...sourceSnap.data() };
    const target = targetType === "camp"
      ? getRewardCampCombatTarget({ id: targetSnap.id, ...targetSnap.data() })
      : { id: targetSnap.id, ...targetSnap.data() };
    if (!target) throw new HttpsError("failed-precondition", "That camp is not an active reward objective.");
    if (getOwnerUid(source) !== uid) {
      throw new HttpsError("permission-denied", "You can only preview attacks from your own city.");
    }

    const attackerEconomy = await prepareEconomyCollection(transaction, uid, nowMs, {
      profileRef: playerRef,
      profileSnap: playerSnap,
    });
    const producedSourceEntry = getEconomyCityByRef(attackerEconomy, sourceRef);
    if (producedSourceEntry?.city) source = producedSourceEntry.city;
    const attackerProfile = attackerEconomy.profileAfter || playerSnap.data() || {};
    const targetOwnerUid = getOwnerUid(target);
    const [defenderProfileSnap, defenderLeaderboardSnap, defenderGlobalStatsSnap] = targetOwnerUid && targetOwnerUid !== uid
      ? await Promise.all([
        transaction.get(db.doc(`players/${targetOwnerUid}`)),
        transaction.get(leaderboardEntryRef(targetOwnerUid)),
        transaction.get(playerGlobalStatsRef(targetOwnerUid)),
      ])
      : [null, null, null];
    const defenderProfile = defenderProfileSnap?.exists ? defenderProfileSnap.data() || {} : {};
    const defenderLeaderboard = defenderLeaderboardSnap?.exists ? defenderLeaderboardSnap.data() || {} : {};
    const defenderGlobalStats = defenderGlobalStatsSnap?.exists ? defenderGlobalStatsSnap.data() || {} : {};
    const protectedAssaultBreachSnap = targetType === "city" && targetOwnerUid && targetOwnerUid !== uid
      ? await transaction.get(protectedAssaultBreachRef(targetRef, uid))
      : null;
    const assaultStage = isCurrentProtectedAssaultBreach(
      protectedAssaultBreachSnap?.exists ? protectedAssaultBreachSnap.data() || {} : null,
      { attackerUid: uid, defenderUid: targetOwnerUid, city: target }
    )
      ? "capture"
      : "breach";
    const sourceTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0)));
    if (sourceTroops < 1) throw new HttpsError("failed-precondition", "No troops are available in the source city.");
    const requestedTroops = clampInt(data.requestedTroops || sourceTroops, 1, sourceTroops);
    const attackerStats = createPreparedEconomyStatsSnapshot(attackerEconomy, {}, { nowMs });
    const attackerKingPower = Math.max(0, Math.floor(safeNumber(attackerStats?.kingPower, 0)))
      || getPlayerPowerSnapshot({
        profile: attackerProfile,
        leaderboard: attackerLeaderboardSnap.exists ? attackerLeaderboardSnap.data() || {} : {},
        globalStats: attackerEconomy.globalStats,
        city: source,
      });
    const defenderKingPower = Math.max(1, getPlayerPowerSnapshot({
      profile: defenderProfile,
      leaderboard: defenderLeaderboard,
      globalStats: defenderGlobalStats,
      city: target,
    }));
    const attackProtection = createServerAttackProtectionSnapshot({
      sourceTroops,
      target,
      targetType,
      requestedTroops,
      attackerKingPower,
      defenderKingPower,
      attackerUid: uid,
      attackerProfile,
      defenderProfile,
      defenderBonuses: {
        cityDefenseBonusPercent: Math.max(0, safeNumber(defenderGlobalStats.strongholdDefenseBonusPercent, 0)),
      },
      assaultStage,
    });
    return {
      ok: true,
      attackProtection: createAttackProtectionPreview(attackProtection, sourceTroops, requestedTroops),
    };
  });
});

exports.sendArmyOrder = timedCallable("sendArmyOrder", { region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const order = normalizeArmyPayload(request.data || {}, uid);

  if (!order.fromId || !order.toId || order.fromId === order.toId) {
    throw new HttpsError("invalid-argument", "Choose a valid source and destination city.");
  }
  if (!order.sourceRegionId || !order.targetRegionId) {
    throw new HttpsError("invalid-argument", "Missing source or destination region.");
  }
  order.sourceRegionId = requireKnownWorldRegionId(order.sourceRegionId);
  order.targetRegionId = requireKnownWorldRegionId(order.targetRegionId);
  if (!getServerWorldTargetIds(order.sourceRegionId).has(order.fromId)) {
    throw new HttpsError("invalid-argument", "The source city is not part of the current Crownlands map.");
  }
  const allowedTargetIds = order.targetType === "camp"
    ? getServerWorldCampIds(order.targetRegionId)
    : getServerWorldTargetIds(order.targetRegionId);
  if (!allowedTargetIds.has(order.toId)) {
    throw new HttpsError("invalid-argument", "The destination is not part of the current Crownlands map.");
  }

  const sourceRef = cityRefForRegion(order.sourceRegionId, order.fromId);
  const targetRef = order.targetType === "camp"
    ? campRefForRegion(order.targetRegionId, order.toId)
    : cityRefForRegion(order.targetRegionId, order.toId);
  let armyRefs = [canonicalArmyRef(order.id)];
  const legacyArmyRef = db.doc(`islands/${getOnlineIslandId(order.sourceRegionId)}/armies/${order.id}`);
  const playerRef = db.doc(`players/${uid}`);
  const attackerLeaderboardRef = leaderboardEntryRef(uid);

  const result = await runTransactionWithInfrastructureRetry(async transaction => {
    const [sourceSnap, targetSnap, canonicalArmySnap, legacyArmySnap, playerSnap, attackerLeaderboardSnap] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(targetRef),
      transaction.get(armyRefs[0]),
      transaction.get(legacyArmyRef),
      transaction.get(playerRef),
      transaction.get(attackerLeaderboardRef),
    ]);

    if (!sourceSnap.exists) throw new HttpsError("not-found", "Source city was not found.");
    const missingTargetCamp = order.targetType === "camp" && !targetSnap.exists
      ? createNeutralRewardCampState(getAuthoritativeRewardCampSeed(order.targetRegionId, order.toId))
      : null;
    if (!targetSnap.exists && !missingTargetCamp) {
      throw new HttpsError("not-found", order.targetType === "camp"
        ? "Destination camp was not found."
        : "Destination city was not found.");
    }

    let source = { id: sourceSnap.id, ...sourceSnap.data() };
    const target = order.targetType === "camp"
      ? getRewardCampCombatTarget(targetSnap.exists
        ? { id: targetSnap.id, ...targetSnap.data() }
        : missingTargetCamp)
      : { id: targetSnap.id, ...targetSnap.data() };
    if (order.targetType === "camp" && !target) {
      throw new HttpsError("failed-precondition", "That camp is not an active reward objective.");
    }
    const sourceOwnerUid = getOwnerUid(source);
    const targetOwnerUid = getOwnerUid(target);
    const existingArmySnap = canonicalArmySnap.exists ? canonicalArmySnap : legacyArmySnap;
    if (existingArmySnap.exists) {
      const existingArmy = { id: existingArmySnap.id, ...existingArmySnap.data() };
      delete existingArmy.createdAt;
      delete existingArmy.updatedAt;
      if (existingArmy.status === "active" && getOwnerUid(existingArmy) === uid) {
        return {
          ok: true,
          duplicate: true,
          movement: existingArmy,
          sourceCity: sourceOwnerUid === uid
            ? {
              id: source.id,
              regionId: order.sourceRegionId,
              troops: Math.max(0, Math.floor(safeNumber(source.troops, 0))),
              troopFloat: Math.max(0, safeNumber(source.troopFloat, source.troops || 0)),
            }
            : null,
        };
      }
      throw new HttpsError("already-exists", "That army order has already been sent.");
    }

    const playerData = playerSnap.exists ? playerSnap.data() || {} : {};
    const attackerLeaderboardData = attackerLeaderboardSnap.exists ? attackerLeaderboardSnap.data() || {} : {};
    if (sourceOwnerUid !== uid) {
      throw new HttpsError("permission-denied", "You can only send troops from your own city.");
    }
    const validatedRoute = validateArmyRoute(order, source, target);
    armyRefs = armyRefsForRegions(validatedRoute.routeRegionIds, order.id);
    const attackerEconomy = await prepareEconomyCollection(transaction, uid, nowMs, {
      profileRef: playerRef,
      profileSnap: playerSnap,
    });
    const producedSourceEntry = getEconomyCityByRef(attackerEconomy, sourceRef);
    if (producedSourceEntry?.city) source = producedSourceEntry.city;
    const attackerProfile = attackerEconomy.profileAfter || playerData;
    const [defenderPowerSnap, defenderLeaderboardSnap, defenderGlobalStatsSnap] = targetOwnerUid && targetOwnerUid !== uid
      ? await Promise.all([
        transaction.get(db.doc(`players/${targetOwnerUid}`)),
        transaction.get(leaderboardEntryRef(targetOwnerUid)),
        transaction.get(playerGlobalStatsRef(targetOwnerUid)),
      ])
      : [null, null, null];
    const defenderPowerData = defenderPowerSnap?.exists ? defenderPowerSnap.data() || {} : {};
    const defenderLeaderboardData = defenderLeaderboardSnap?.exists ? defenderLeaderboardSnap.data() || {} : {};
    const defenderGlobalStatsData = defenderGlobalStatsSnap?.exists ? defenderGlobalStatsSnap.data() || {} : {};
    const protectedAssaultBreachSnap = order.targetType === "city" && targetOwnerUid && targetOwnerUid !== uid
      ? await transaction.get(protectedAssaultBreachRef(targetRef, uid))
      : null;
    const assaultStage = isCurrentProtectedAssaultBreach(
      protectedAssaultBreachSnap?.exists ? protectedAssaultBreachSnap.data() || {} : null,
      { attackerUid: uid, defenderUid: targetOwnerUid, city: target }
    )
      ? "capture"
      : "breach";
    const defenderMainCityProfile = getMainCityProtectionProfile(
      defenderPowerData,
      defenderGlobalStatsData,
      defenderLeaderboardData
    );

    const sourceTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0)));
    const attackerClanId = safeString(attackerProfile.clanId, 128);
    const defenderClanId = safeString(defenderPowerData.clanId, 128);
    const sameActiveClan = Boolean(
      attackerClanId
      && targetOwnerUid
      && targetOwnerUid !== uid
      && attackerClanId === defenderClanId
    );
    const reinforcementTargetKey = getReinforcementTargetKey(order.targetType, order.targetRegionId, order.toId);
    let activeClanReinforcementTargets = [];
    let resolvedKind = order.kind === "scout"
      ? "scout"
      : order.kind === "reinforce"
        ? "reinforce"
        : targetOwnerUid === uid
          ? "transfer"
          : "attack";
    if (resolvedKind === "reinforce") {
      if (!targetOwnerUid || targetOwnerUid === uid || !sameActiveClan) {
        throw new HttpsError("failed-precondition", "You can only reinforce a current clan ally.");
      }
      const clanSnap = await transaction.get(db.doc(`clans/${attackerClanId}`));
      if (!clanSnap.exists || clanSnap.data()?.status !== "active") {
        throw new HttpsError("failed-precondition", "Your clan is no longer active.");
      }
      activeClanReinforcementTargets = await getActiveClanReinforcementTargetsForLaunch(
        transaction,
        uid,
        attackerProfile
      );
      if (activeClanReinforcementTargets.includes(reinforcementTargetKey)) {
        throw new HttpsError(
          "failed-precondition",
          "You already have one active reinforcement assigned to this holding."
        );
      }
      if (activeClanReinforcementTargets.length >= CLAN_REINFORCEMENT_ACTIVE_LIMIT) {
        throw new HttpsError(
          "failed-precondition",
          `You can have at most ${CLAN_REINFORCEMENT_ACTIVE_LIMIT} active clan reinforcements at one time.`
        );
      }
    }
    if (
      (resolvedKind === "scout" || resolvedKind === "attack")
      && targetOwnerUid
      && sameActiveClan
    ) {
      writeClanAudit(transaction, attackerProfile.clanId, uid, "friendly_order_blocked", {
        targetOwnerUid,
        kind: resolvedKind,
        targetId: order.toId,
      }, nowMs);
      throw new HttpsError("failed-precondition", "You cannot scout or attack a clan ally.");
    }
    const neutralCaptureBlockReason = resolvedKind === "attack" && order.targetType !== "camp"
      ? getServerNeutralCaptureBlockReason(attackerEconomy, attackerProfile, target)
      : "";
    if (neutralCaptureBlockReason) {
      throw new HttpsError("failed-precondition", neutralCaptureBlockReason);
    }
    const requestedTroops = resolvedKind === "scout"
      ? 1
      : clampInt(order.requestedTroops || order.troops || Math.floor(sourceTroops * DEFAULT_MARCH_PERCENT), 1, Math.max(1, sourceTroops));
    const attackerStatsBeforeLaunch = createPreparedEconomyStatsSnapshot(attackerEconomy, {}, { nowMs });
    const attackerKingPower = Math.max(
      0,
      Math.floor(safeNumber(attackerStatsBeforeLaunch?.kingPower, 0))
    ) || getPlayerPowerSnapshot({
      profile: attackerProfile,
      leaderboard: attackerLeaderboardData,
      globalStats: attackerEconomy.globalStats,
      city: source,
      fallback: Math.max(order.ownerKingPower, order.attackerKingPower),
    });
    const defenderKingPower = Math.max(1, getPlayerPowerSnapshot({
      profile: defenderPowerData,
      leaderboard: defenderLeaderboardData,
      globalStats: defenderGlobalStatsData,
      city: target,
      fallback: order.defenderKingPower,
    }));
    const defenderProtectionBonuses = {
      cityDefenseBonusPercent: Math.max(0, safeNumber(defenderGlobalStatsData.strongholdDefenseBonusPercent, 0)),
    };
    const attackProtection = resolvedKind === "attack"
      ? createServerAttackProtectionSnapshot({
        sourceTroops,
        target,
        targetType: order.targetType,
        requestedTroops,
        attackerKingPower,
        defenderKingPower,
        attackerUid: uid,
        attackerProfile,
        defenderProfile: defenderPowerData,
        defenderBonuses: defenderProtectionBonuses,
        assaultStage,
      })
      : null;
    const troops = resolvedKind === "scout" ? 1 : (attackProtection?.effectiveTroops || requestedTroops);

    if (sourceTroops < troops) throw new HttpsError("failed-precondition", "Not enough troops in the source city.");
    if (order.targetType !== "camp" && resolvedKind === "scout" && isProtectedMainCity(target, uid, defenderMainCityProfile)) {
      throw new HttpsError("failed-precondition", "Main cities cannot be scouted.");
    }
    if (doesVeilOfSilenceBlock(resolvedKind, order.targetType) && targetOwnerUid && targetOwnerUid !== uid && isVeilOfSilenceActive(defenderPowerData, nowMs)) {
      throw new HttpsError("failed-precondition", "That city is hidden by Veil of Silence.");
    }
    if (resolvedKind === "attack" && order.targetType !== "camp") {
      if (isProtectedMainCity(target, uid, defenderMainCityProfile)) {
        throw new HttpsError("failed-precondition", "Main cities cannot be attacked.");
      }
      if (isCityShielded(target, uid, nowMs)) {
        throw new HttpsError("failed-precondition", "That city is protected by a Royal Peace Shield.");
      }
      if (order.acceptedAttackProtection) {
        const acceptedSignature = getAttackProtectionQuoteSignature(
          order.acceptedAttackProtection,
          sourceTroops,
          requestedTroops
        );
        const currentSignature = getAttackProtectionQuoteSignature(
          attackProtection,
          sourceTroops,
          requestedTroops
        );
        if (acceptedSignature !== currentSignature) {
          throw new HttpsError(
            "failed-precondition",
            "Attack protection changed. Review the refreshed troop limit before sending.",
            {
              reason: "attack-protection-changed",
              attackProtection: createAttackProtectionPreview(attackProtection, sourceTroops, requestedTroops),
            }
          );
        }
      }
    }

    const useSwiftMarchOrder = Boolean(order.useSwiftMarchOrder);
    if (useSwiftMarchOrder) {
      const swiftMarchArmy = {
        ownerUid: uid,
        kind: resolvedKind,
        targetType: order.targetType,
        relinquishTransfer: false,
      };
      if (!canUseSwiftMarchOrderOnTransfer(swiftMarchArmy, source, target, uid)) {
        throw new HttpsError(
          "failed-precondition",
          "Swift March Orders only work on transfers between owned cities or reinforcements to an owned Stronghold."
        );
      }
      const ownedSwiftMarchOrders = Math.max(
        0,
        Math.floor(safeNumber(attackerEconomy.shopItems[SWIFT_MARCH_ORDER_ITEM_ID], 0))
      );
      if (ownedSwiftMarchOrders <= 0) {
        throw new HttpsError("failed-precondition", "You do not have a Swift March Order.");
      }
      attackerEconomy.shopItems[SWIFT_MARCH_ORDER_ITEM_ID] = ownedSwiftMarchOrders - 1;
    }

    const originalDuration = calculateTravelTime({
      pathLength: validatedRoute.pathLength,
      troopCount: troops,
      kind: resolvedKind,
      targetType: order.targetType,
      speedMultiplier: skillMultiplier(attackerProfile, "marchOrders")
        * (1 + Math.max(0, safeNumber(attackerEconomy.bonuses.marchSpeedBonusPercent, 0)) / 100),
    });
    const originalArrivesAtMs = nowMs + Math.ceil(originalDuration * 1000);
    const swiftMarchDurationMs = useSwiftMarchOrder
      ? Math.max(
          SWIFT_MARCH_MINIMUM_REMAINING_MS,
          Math.ceil((originalArrivesAtMs - nowMs) * SWIFT_MARCH_REMAINING_TIME_MULTIPLIER)
        )
      : 0;
    const duration = useSwiftMarchOrder ? swiftMarchDurationMs / 1000 : originalDuration;
    const arrivesAtMs = useSwiftMarchOrder ? nowMs + swiftMarchDurationMs : originalArrivesAtMs;
    const movement = {
      id: order.id,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      ownerKind: "player",
      ownerUid: uid,
      ownerName: normalizePlayerName(attackerProfile.playerName || order.ownerName || source.ownerName || request.auth.token?.name),
      ownerFlag: attackerProfile.flag || order.ownerFlag || source.ownerFlag || null,
      ownerKingPower: attackerKingPower,
      kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
      kind: resolvedKind,
      launchKind: resolvedKind,
      targetType: order.targetType,
      fromId: order.fromId,
      toId: order.toId,
      sourceRegionId: order.sourceRegionId,
      targetRegionId: order.targetRegionId,
      fromName: safeString(source.name || order.fromName, 40),
      toName: safeString(target.name || order.toName, 40),
      troops,
      requestedTroops,
      total: duration,
      path: validatedRoute.path,
      pathSegments: validatedRoute.pathSegments,
      routeRegionIds: validatedRoute.routeRegionIds,
      viewRegionIds: validatedRoute.routeRegionIds,
      pathLength: validatedRoute.pathLength,
      targetKey: `${order.targetRegionId}:${order.toId}`,
      reinforcementTargetKey,
      targetOwnerAtLaunch: targetOwnerUid ? "player" : "neutral",
      originalTargetOwnerUid: targetOwnerUid || "",
      targetOwnerUid: targetOwnerUid || "",
      lastIncomingNotificationOwnerUid: ["attack", "reinforce", "scout"].includes(resolvedKind) ? targetOwnerUid || "" : "",
      attackerKingPower: attackerKingPower || order.attackerKingPower || order.ownerKingPower,
      defenderKingPower,
      attackProtection,
      launchedAtMs: nowMs,
      arrivesAtMs,
      ...(useSwiftMarchOrder ? {
        swiftMarchUsedAtMs: nowMs,
        swiftMarchOriginalArrivesAtMs: originalArrivesAtMs,
        swiftMarchProgressAtUse: 0,
        swiftMarchRemainingMultiplier: SWIFT_MARCH_REMAINING_TIME_MULTIPLIER,
      } : {}),
      status: "active",
      createdByServer: true,
      reinforcementModelVersion: resolvedKind === "reinforce" ? REINFORCEMENT_MODEL_VERSION : 0,
      serverAuthorityVersion: 3,
    };

    let profileOverrides = resolvedKind === "reinforce"
      ? {
        activeClanReinforcementTargets: [...activeClanReinforcementTargets, reinforcementTargetKey],
        clanReinforcementLimitResetGeneration: RESET_GENERATION,
      }
      : {};
    let peaceShieldDeactivated = false;
    const launchCityPatches = [];
    const launchCityUpdates = [];
    if (resolvedKind === "reinforce" || shouldDeactivatePeaceShieldForAttack(target, order.targetType, uid, resolvedKind)) {
      const itemEffects = { ...(attackerEconomy.itemEffects || {}) };
      const shieldIsActive = safeNumber(itemEffects.shieldExpiresAtMs, 0) > nowMs
        || attackerEconomy.cityEntries.some(entry => (
          entry?.city
          && !isStronghold(entry.city)
          && getShieldExpiresAtMs(entry.city) > nowMs
        ));
      if (shieldIsActive) {
        itemEffects.shieldExpiresAtMs = 0;
        profileOverrides = { ...profileOverrides, itemEffects };
        peaceShieldDeactivated = true;
        attackerEconomy.cityEntries.forEach(entry => {
          if (!entry?.ref || !entry.city || isStronghold(entry.city)) return;
          const patch = { ownerShieldExpiresAtMs: 0 };
          launchCityPatches.push({ ref: entry.ref, city: entry.city, patch });
          launchCityUpdates.push({
            id: entry.city.id,
            regionId: entry.city.regionId,
            ...patch,
          });
        });
      }
    }
    const sourceTroopPatch = {
      troops: sourceTroops - troops,
      troopFloat: Math.max(0, safeNumber(source.troopFloat, sourceTroops) - troops),
    };
    launchCityPatches.push({ ref: sourceRef, city: source, patch: sourceTroopPatch });
    launchCityUpdates.push({
      id: source.id,
      regionId: order.sourceRegionId,
      troops: sourceTroops - troops,
      troopFloat: Math.max(0, safeNumber(source.troopFloat, sourceTroops) - troops),
    });
    if (missingTargetCamp) {
      transaction.set(targetRef, {
        ...missingTargetCamp,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    writePreparedEconomy(transaction, attackerEconomy, profileOverrides, [
      ...launchCityPatches,
    ], {
      addActiveArmies: [movement],
      nowMs,
    });

    writeArmyMovementCopies(transaction, movement, { includeCreatedAt: true });

    if (order.targetType === "camp" && resolvedKind === "attack") {
      const activeArmyIds = normalizeActiveArmyIds([...(target.activeArmyIds || []), order.id]);
      transaction.set(targetRef, {
        activeArmyIds,
        state: "contested",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return {
      ok: true,
      peaceShieldDeactivated,
      movement,
      sourceCity: {
        id: source.id,
        regionId: order.sourceRegionId,
        troops: sourceTroops - troops,
        troopFloat: Math.max(0, safeNumber(source.troopFloat, sourceTroops) - troops),
      },
      cityUpdates: launchCityUpdates,
      currentUser: {
        gold: attackerEconomy.gold,
        goldFloat: attackerEconomy.goldFloat,
        economyUpdatedAtMs: timestampToMs(attackerEconomy.profilePatch?.economyUpdatedAtMs),
        shopItems: attackerEconomy.shopItems,
        itemEffects: profileOverrides.itemEffects || attackerEconomy.itemEffects,
        itemPurchaseCooldowns: attackerEconomy.itemPurchaseCooldowns,
        character: attackerProfile.character || null,
        upgrades: normalizeSkillUpgrades(attackerProfile.upgrades),
        globalStats: globalStatsForClient(attackerEconomy.lastGlobalStats || attackerEconomy.globalStats),
      },
      globalStats: globalStatsForClient(attackerEconomy.lastGlobalStats || attackerEconomy.globalStats),
      incomingNotification: createIncomingArmyNotification({
        defenderUid: targetOwnerUid,
        attackerUid: uid,
        movement,
        source,
        target,
      }),
    };
  }, "sendArmyOrder");

  const incomingNotification = result.incomingNotification || null;
  delete result.incomingNotification;
  if (incomingNotification) {
    await sendIncomingArmyNotification(incomingNotification).catch(error => {
      console.warn("Could not send incoming army notification", error);
    });
  }
  return result;
});

async function resolveArmyOrderById({ armyId = "", requestedRegions = [], callerUid = "", nowMs = Date.now() } = {}) {
  if (!armyId) throw new HttpsError("invalid-argument", "Missing army id.");
  const candidateRefs = [canonicalArmyRef(armyId), ...armyViewRefsForRegions(requestedRegions, armyId)];

  return db.runTransaction(async transaction => {
    const candidateSnaps = await Promise.all(candidateRefs.map(ref => transaction.get(ref)));
    const firstArmySnap = candidateSnaps.find(snapshot => snapshot.exists);
    if (!firstArmySnap) return { ok: true, status: "missing" };
    const army = { id: firstArmySnap.id, ...firstArmySnap.data() };
    if (army.status !== "active") return { ok: true, status: army.status || "resolved" };
    const arrivesAtMs = Math.max(0, Math.floor(safeNumber(army.arrivesAtMs, 0)));
    if (arrivesAtMs > nowMs) {
      throw new HttpsError("failed-precondition", "Army has not arrived yet.");
    }

    const routeRegionIds = normalizeRegionIds(army.routeRegionIds?.length ? army.routeRegionIds : requestedRegions);
    if (!routeRegionIds.length) throw new HttpsError("failed-precondition", "Army route data is missing.");
    const armyRefs = armyRefsForRegions(routeRegionIds, armyId);
    const sourceRegionId = normalizeRegionId(army.sourceRegionId || routeRegionIds[0]);
    const targetRegionId = normalizeRegionId(army.targetRegionId || routeRegionIds[routeRegionIds.length - 1] || sourceRegionId);
    const targetType = army.targetType === "camp" ? "camp" : "city";
    const sourceRef = cityRefForRegion(sourceRegionId, army.fromId);
    const targetRef = targetType === "camp"
      ? campRefForRegion(targetRegionId, army.toId)
      : cityRefForRegion(targetRegionId, army.toId);
    const [sourceSnap, targetSnap] = await Promise.all([transaction.get(sourceRef), transaction.get(targetRef)]);
    const isReturning = Boolean(army.returning);
    const isCampReturn = Boolean(army.campReturn);
    const isReinforcementReturn = Boolean(army.reinforcementReturn);
    if (!targetSnap.exists && !isReturning && !isCampReturn && !isReinforcementReturn) {
      throw new HttpsError("not-found", "Target city was not found.");
    }

    let source = sourceSnap.exists ? { id: sourceSnap.id, ...sourceSnap.data() } : null;
    let target = targetSnap.exists
      ? targetType === "camp"
        ? getRewardCampCombatTarget({ id: targetSnap.id, ...targetSnap.data() })
        : { id: targetSnap.id, ...targetSnap.data() }
      : { id: army.toId, regionId: targetRegionId, ownerKind: "neutral", ownerUid: "", troops: 0 };
    if (targetType === "camp" && !target && !isReturning) {
      throw new HttpsError("failed-precondition", "That camp is not an active reward objective.");
    }
    const attackerUid = safeString(army.ownerUid, 128);
    const defenderUid = isReturning ? "" : getOwnerUid(target);
    const rallyAttackDocumentRef = army.rallyAttack && army.rallyClanId && army.rallyId
      ? clanRallyRef(army.rallyClanId, army.rallyId)
      : null;
    const rallyAttackSnap = rallyAttackDocumentRef
      ? await transaction.get(rallyAttackDocumentRef)
      : null;
    const rallyAttack = normalizeClanRally(rallyAttackSnap);
    if (army.rallyAttack && (
      !rallyAttack
      || rallyAttack.armyId !== armyId
      || rallyAttack.leaderUid !== attackerUid
      || ![RALLY_STATUS_LAUNCHED, RALLY_STATUS_RECALLING].includes(rallyAttack.status)
    )) {
      throw new HttpsError("failed-precondition", "The rally state is unavailable for this army.");
    }
    if (army.kind === "rally_join" && !isReturning) {
      const clanId = safeString(army.rallyClanId, 128);
      const rallyId = normalizeRallyId(army.rallyId);
      const rallyRef = clanId && rallyId ? clanRallyRef(clanId, rallyId) : null;
      const [rallySnap, attackerProfileSnap, clanSnap, memberSnap] = rallyRef
        ? await Promise.all([
          transaction.get(rallyRef),
          transaction.get(db.doc(`players/${attackerUid}`)),
          transaction.get(db.doc(`clans/${clanId}`)),
          transaction.get(db.doc(`clans/${clanId}/members/${attackerUid}`)),
        ])
        : [null, null, null, null];
      const rally = normalizeClanRally(rallySnap);
      const participant = rally ? getRallyParticipant(rally, attackerUid) : null;
      const attackerProfile = attackerProfileSnap?.exists ? attackerProfileSnap.data() || {} : {};
      const canAssemble = Boolean(
        rally
        && rally.status === RALLY_STATUS_FORMING
        && participant
        && participant.status === RALLY_PARTICIPANT_INBOUND
        && participant.joinArmyId === armyId
        && getOwnerUid(target) === rally.leaderUid
        && safeString(attackerProfile.clanId, 128) === clanId
        && clanSnap?.exists
        && clanSnap.data()?.status === "active"
        && memberSnap?.exists
      );
      if (!canAssemble) {
        const movement = {
          ...createAlliedTargetReturnMovement(army, nowMs),
          returnReason: RALLY_RETURN_REASON,
          rallyReturn: true,
        };
        writeRallyJoinMovementCopies(transaction, movement);
        return {
          ok: true,
          status: "returning",
          kind: "rally_join",
          outcome: "rally_unavailable",
          movement,
          returnSeconds: Math.max(1, Math.ceil((movement.arrivesAtMs - nowMs) / 1000)),
        };
      }
      const economy = await prepareEconomyCollection(transaction, attackerUid, nowMs, {
        profileRef: db.doc(`players/${attackerUid}`),
        profileSnap: attackerProfileSnap,
      });
      const currentProfile = economy.profileAfter || attackerProfile;
      const committedRallyTroops = getProfileCommittedRallyTroops(currentProfile) + participant.troops;
      const participants = activeRallyParticipants(rally).map(entry => (
        entry.uid === attackerUid
          ? {
            ...entry,
            status: RALLY_PARTICIPANT_ASSEMBLED,
            assembledAtMs: nowMs,
          }
          : entry
      ));
      const totals = rallyParticipantTotals(participants);
      writePreparedEconomy(transaction, economy, {
        committedRallyTroops,
        rallyResetGeneration: RESET_GENERATION,
      }, [], {
        excludeArmyIds: [armyId],
        nowMs,
      });
      transaction.set(rallyRef, {
        participants,
        ...totals,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(canonicalArmyRef(armyId), {
        status: "resolved",
        resolvedAtMs: nowMs,
        result: {
          kind: "rally_join",
          outcome: "assembled",
          rallyId,
          troops: participant.troops,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      armyViewRefsForRegions(army.routeRegionIds, armyId).forEach(ref => transaction.set(ref, {
        status: "resolved",
        resolvedAtMs: nowMs,
        result: {
          kind: "rally_join",
          outcome: "assembled",
          troops: participant.troops,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
      writeClanAudit(transaction, clanId, attackerUid, "rally_contribution_assembled", {
        rallyId,
        armyId,
        troops: participant.troops,
      }, nowMs);
      return {
        ok: true,
        status: "resolved",
        kind: "rally_join",
        outcome: "assembled",
        rally: rallyForClient({ ...rally, participants, ...totals, updatedAtMs: nowMs }),
        currentUser: {
          committedRallyTroops,
          rallyResetGeneration: RESET_GENERATION,
          globalStats: globalStatsForClient(economy.lastGlobalStats || economy.globalStats),
        },
      };
    }
    const reinforcementTargetKey = safeString(
      army.reinforcementTargetKey || getReinforcementTargetKey(targetType, targetRegionId, army.toId),
      220
    );
    const targetReinforcementsSnap = defenderUid
      ? await transaction.get(stationedReinforcementsForTargetQuery(reinforcementTargetKey))
      : null;
    const targetReinforcements = targetReinforcementsSnap
      ? targetReinforcementsSnap.docs.map(normalizeReinforcementContribution).filter(Boolean)
      : [];
    const participantProfiles = await getProfileSnapshots(transaction, [
      attackerUid,
      defenderUid,
      ...targetReinforcements.map(entry => entry.ownerUid),
    ]);
    const participantGlobalStats = await getGlobalStatsSnapshots(transaction, [
      attackerUid,
      defenderUid,
      ...targetReinforcements.map(entry => entry.ownerUid),
    ]);
    const attackerProfileEntry = participantProfiles.get(attackerUid) || {};
    const defenderProfileEntry = defenderUid ? participantProfiles.get(defenderUid) || {} : null;
    const attackerProfileSnap = participantProfiles.get(attackerUid)?.snap || null;
    const defenderProfileSnap = defenderUid ? participantProfiles.get(defenderUid)?.snap || null : null;
    const attackerEconomy = attackerUid
      ? await prepareEconomyCollection(transaction, attackerUid, nowMs, {
        profileRef: attackerProfileEntry.ref,
        profileSnap: attackerProfileEntry.snap,
      })
      : null;
    const defenderEconomy = defenderUid
      ? defenderUid === attackerUid
        ? attackerEconomy
        : await prepareEconomyCollection(transaction, defenderUid, nowMs, {
          profileRef: defenderProfileEntry.ref,
          profileSnap: defenderProfileEntry.snap,
        })
      : null;
    const producedSourceEntry = getEconomyCityByRef(attackerEconomy, sourceRef);
    const producedTargetEntry = getEconomyCityByRef(defenderEconomy, targetRef);
    if (producedSourceEntry?.city) source = producedSourceEntry.city;
    if (producedTargetEntry?.city) target = producedTargetEntry.city;
    const attackerProfile = attackerEconomy?.profileAfter || attackerProfileEntry.data || {};
    const defenderProfile = defenderUid ? defenderEconomy?.profileAfter || defenderProfileEntry?.data || {} : null;
    const reinforcementProfiles = new Map(targetReinforcements.map(entry => [
      entry.ownerUid,
      participantProfiles.get(entry.ownerUid)?.data || {},
    ]));
    const reinforcementGlobalStats = new Map(targetReinforcements.map(entry => [
      entry.ownerUid,
      participantGlobalStats.get(entry.ownerUid) || {},
    ]));
    const reports = [];
    const cityUpdates = [];
    const economyCityUpdates = () => {
      const updates = [];
      if (attackerEconomy) updates.push(...attackerEconomy.cityUpdates);
      if (defenderEconomy && defenderEconomy !== attackerEconomy) updates.push(...defenderEconomy.cityUpdates);
      return updates;
    };
    const withEconomyCityUpdates = updates => [...economyCityUpdates(), ...(Array.isArray(updates) ? updates : [])];
    const writeParticipantEconomies = (attackerOverrides = {}, defenderOverrides = {}, options = {}) => {
      const attackerStatsOptions = {
        excludeArmyIds: [armyId],
        addActiveArmies: Array.isArray(options.addActiveArmies) ? options.addActiveArmies : [],
        statsCityPatches: Array.isArray(options.statsCityPatches) ? options.statsCityPatches : [],
        nowMs,
      };
      const defenderStatsOptions = {
        ...attackerStatsOptions,
        addActiveArmies: [],
      };
      const attackerStats = attackerEconomy
        ? writePreparedEconomy(transaction, attackerEconomy, attackerOverrides, [], attackerStatsOptions)
        : null;
      const defenderStats = defenderEconomy && defenderEconomy !== attackerEconomy
        ? writePreparedEconomy(transaction, defenderEconomy, defenderOverrides, [], defenderStatsOptions)
        : attackerStats;
      return { attackerStats, defenderStats };
    };
    const reportsForCaller = () => reports.filter(report => report.uid === callerUid);
    const profilePatchForCaller = (attackerPatch = null, defenderPatch = null) => {
      if (callerUid === attackerUid && attackerPatch) {
        return {
          character: attackerPatch.character,
          gold: attackerPatch.gold,
          goldFloat: attackerPatch.goldFloat,
          economyUpdatedAtMs: timestampToMs(attackerEconomy?.profilePatch?.economyUpdatedAtMs),
          upgrades: normalizeSkillUpgrades(attackerProfile.upgrades),
          globalStats: globalStatsForClient(attackerEconomy?.lastGlobalStats || attackerEconomy?.globalStats),
        };
      }
      if (callerUid === defenderUid && defenderPatch) {
        return {
          character: defenderPatch.character,
          gold: defenderPatch.gold,
          goldFloat: defenderPatch.goldFloat,
          economyUpdatedAtMs: timestampToMs(defenderEconomy?.profilePatch?.economyUpdatedAtMs),
          upgrades: normalizeSkillUpgrades(defenderProfile?.upgrades),
          globalStats: globalStatsForClient(defenderEconomy?.lastGlobalStats || defenderEconomy?.globalStats),
        };
      }
      return null;
    };
    const markResolved = resultPatch => {
      const patch = {
        status: "resolved",
        resolvedAtMs: nowMs,
        result: resultPatch || {},
        updatedAt: FieldValue.serverTimestamp(),
      };
      writeArmyMovementCopies(transaction, { ...army, ...patch, id: armyId }, {
        previousTargetOwnerUid: army.targetOwnerUid,
      });
    };
    const finalizeReinforcementReturn = (returnedTroops = troopCount) => {
      if (!isReinforcementReturn || !army.reinforcementId) return;
      releaseClanReinforcementTarget(
        transaction,
        attackerUid,
        army.reinforcementTargetKey
      );
      transaction.set(db.doc(`reinforcements/${safeString(army.reinforcementId, 96)}`), {
        status: REINFORCEMENT_STATUS_RETURNED,
        returnArmyId: armyId,
        returnedTroops: Math.max(0, Math.floor(safeNumber(returnedTroops, 0))),
        returnArrivedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    };
    let latestSourceReturnStatsPatch = null;
    const getLatestSourceReturnStatsPatches = () => (latestSourceReturnStatsPatch ? [latestSourceReturnStatsPatch] : []);
    const returnTroopsToSource = troops => {
      const returned = Math.max(0, Math.floor(safeNumber(troops, 0)));
      latestSourceReturnStatsPatch = null;
      if (!returned || !source || getOwnerUid(source) !== attackerUid) return 0;
      const nextTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0))) + returned;
      const patch = {
        troops: nextTroops,
        troopFloat: Math.max(0, safeNumber(source.troopFloat, source.troops || 0)) + returned,
      };
      latestSourceReturnStatsPatch = { ref: sourceRef, city: source, patch };
      appendEconomyCityPatch(attackerEconomy, sourceRef, source, patch);
      transaction.set(sourceRef, cleanCityUpdate(source, patch), { merge: true });
      source = { ...source, ...patch };
      cityUpdates.push({ id: source.id, regionId: sourceRegionId, troops: nextTroops });
      return returned;
    };
    const returnRecalledTroops = troops => {
      const returnedToSource = returnTroopsToSource(troops);
      if (returnedToSource > 0) {
        return { returned: returnedToSource, cityId: source.id, regionId: sourceRegionId };
      }
      const returned = Math.max(0, Math.floor(safeNumber(troops, 0)));
      if (!returned || !attackerEconomy) return { returned: 0, cityId: "", regionId: "" };
      const mainInfo = getMainCityInfo(attackerProfile);
      const mainEntry = mainInfo?.ref ? getEconomyCityByRef(attackerEconomy, mainInfo.ref) : null;
      const fallbackEntry = mainEntry?.city && getOwnerUid(mainEntry.city) === attackerUid
        ? mainEntry
        : attackerEconomy.cityEntries.find(entry => getOwnerUid(entry.city) === attackerUid);
      if (!fallbackEntry?.city) return { returned: 0, cityId: "", regionId: "" };
      const fallbackCity = fallbackEntry.city;
      const nextTroops = Math.max(0, Math.floor(safeNumber(fallbackCity.troops, 0))) + returned;
      const patch = {
        troops: nextTroops,
        troopFloat: Math.max(0, safeNumber(fallbackCity.troopFloat, fallbackCity.troops || 0)) + returned,
      };
      latestSourceReturnStatsPatch = { ref: fallbackEntry.ref, city: fallbackCity, patch };
      appendEconomyCityPatch(attackerEconomy, fallbackEntry.ref, fallbackCity, patch);
      transaction.set(fallbackEntry.ref, cleanCityUpdate(fallbackCity, patch), { merge: true });
      const fallbackRegionId = normalizeRegionId(fallbackCity.regionId || mainInfo?.regionId);
      cityUpdates.push({ id: fallbackCity.id, regionId: fallbackRegionId, troops: nextTroops });
      return { returned, cityId: fallbackCity.id, regionId: fallbackRegionId };
    };
    const recoverBattleLossesToMainCity = ({ uid = "", profile = {}, economy = null, losses = 0 } = {}) => {
      const recovered = Math.floor(Math.max(0, safeNumber(losses, 0)) * getSkillPercent(profile, "fieldMedics") / 100);
      if (!uid || recovered <= 0 || !economy) return 0;
      const entry = getCanonicalMainCityEntry(profile, economy.cityEntries);
      const city = entry?.city;
      if (!city || getOwnerUid(city) !== uid) return 0;
      const mainRef = entry.ref;
      const mainRegionId = normalizeRegionId(city.regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(entry)));
      const troopFloat = Math.max(0, safeNumber(city.troopFloat, city.troops || 0)) + recovered;
      const patch = {
        troops: Math.max(0, Math.floor(troopFloat)),
        troopFloat,
        productionUpdatedAtMs: nowMs,
      };
      appendEconomyCityPatch(economy, mainRef, city, patch);
      transaction.set(mainRef, cleanCityUpdate(city, patch), { merge: true });
      cityUpdates.push({ id: city.id, regionId: mainRegionId, ...patch });
      return recovered;
    };

    if (
      rallyAttack
      && !isReturning
      && isRallyTargetFriendly(defenderUid, defenderProfile || {}, rallyAttack)
    ) {
      const movement = {
        ...createAlliedTargetReturnMovement(army, nowMs),
        returnReason: RALLY_FRIENDLY_RETURN_REASON,
        rallyReturn: true,
      };
      writeArmyMovementCopies(transaction, movement, {
        previousTargetOwnerUid: army.targetOwnerUid,
      });
      let campUpdate = null;
      if (targetType === "camp" && targetSnap.exists && target) {
        const remainingActiveArmyIds = removeActiveCampArmyId(target, armyId);
        const campPatch = {
          activeArmyIds: remainingActiveArmyIds,
          state: getRewardCampState(remainingActiveArmyIds, getOwnerUid(target)),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.set(targetRef, campPatch, { merge: true });
        campUpdate = campUpdateForClient(target.id, targetRegionId, campPatch);
      }
      writeParticipantEconomies({}, {}, { addActiveArmies: [movement] });
      transaction.set(rallyAttackDocumentRef, {
        status: RALLY_STATUS_RECALLING,
        friendlyReturnStartedAtMs: nowMs,
        friendlyReturnOwnerUid: defenderUid,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      writeClanAudit(transaction, rallyAttack.clanId, attackerUid, "rally_friendly_return_started", {
        rallyId: rallyAttack.id,
        armyId,
        targetOwnerUid: defenderUid,
        troops: Math.max(0, Math.floor(safeNumber(army.troops, 0))),
      }, nowMs);
      return {
        ok: true,
        status: "returning",
        kind: "attack",
        outcome: "friendly_return_started",
        movement,
        campUpdate,
        returnSeconds: Math.max(1, Math.ceil((movement.arrivesAtMs - nowMs) / 1000)),
        cityUpdates: withEconomyCityUpdates([]),
        currentUser: profilePatchForCaller(attackerProfile, defenderProfile),
      };
    }

    let troopCount = Math.max(0, Math.floor(safeNumber(army.troops, 0)));
    const launchedAsClanReinforcement = army.kind === "reinforce"
      || army.launchKind === "reinforce"
      || army.retargetedFromKind === "reinforce";
    const matchingClanId = safeString(attackerProfile?.clanId, 128);
    const matchingClanSnap = launchedAsClanReinforcement
      && matchingClanId
      && matchingClanId === safeString(defenderProfile?.clanId, 128)
      ? await transaction.get(db.doc(`clans/${matchingClanId}`))
      : null;
    const currentClanAllies = Boolean(
      defenderUid
      && defenderUid !== attackerUid
      && matchingClanId
      && matchingClanId === safeString(defenderProfile?.clanId, 128)
      && matchingClanSnap?.exists
      && matchingClanSnap.data()?.status === "active"
    );
    const effectiveKind = army.kind === "scout"
      ? "scout"
      : isReinforcementReturn
        ? "transfer"
        : launchedAsClanReinforcement && currentClanAllies
          ? "reinforce"
          : defenderUid === attackerUid
            ? "transfer"
            : "attack";
    const shouldReleaseClanReinforcementTarget = launchedAsClanReinforcement
      && !isReinforcementReturn
      && effectiveKind !== "reinforce";
    const defenderBonuses = defenderEconomy?.bonuses || {};
    const alliedTroopsAtStart = targetReinforcements.reduce((total, entry) => total + entry.troops, 0);
    const combatTarget = createReinforcedCombatTarget({
      ...target,
      alliedReinforcementTroops: alliedTroopsAtStart,
    }, targetType);
    const defensePackages = calculateDefenderArmyPackages({
      target,
      targetType,
      ownerProfile: defenderProfile || {},
      ownerBonuses: defenderBonuses,
      contributions: targetReinforcements,
      contributorProfiles: reinforcementProfiles,
      contributorStats: reinforcementGlobalStats,
    });
    const holderTargetStats = getCityStats({
      ...target,
      troops: getTargetOwnerTroops(target, targetType),
    }, defenderProfile, defenderBonuses);
    const targetStats = {
      ...holderTargetStats,
      baseTotalDefense: defensePackages.owner.basePower
        + defensePackages.reinforcements.reduce((total, row) => total + row.basePower, 0),
      totalDefense: defensePackages.totalDefense,
      totalDefenseBonus: Math.max(
        0,
        defensePackages.totalDefense
          - defensePackages.owner.basePower
          - defensePackages.reinforcements.reduce((total, row) => total + row.basePower, 0)
      ),
    };
    const protectedAssaultBreachDocumentRef = effectiveKind === "attack"
      && targetType === "city"
      && defenderUid
      && defenderUid !== attackerUid
      ? protectedAssaultBreachRef(targetRef, attackerUid)
      : null;
    const protectedAssaultBreachSnap = protectedAssaultBreachDocumentRef
      ? await transaction.get(protectedAssaultBreachDocumentRef)
      : null;
    const resolutionAssaultStage = isCurrentProtectedAssaultBreach(
      protectedAssaultBreachSnap?.exists ? protectedAssaultBreachSnap.data() || {} : null,
      { attackerUid, defenderUid, city: target }
    )
      ? "capture"
      : "breach";
    const storedAttackProtection = effectiveKind === "attack" && targetType !== "camp"
      ? normalizeAttackProtectionSnapshot(army.attackProtection, army.demoAttack)
      : null;
    const convertedTransferReinforcement = effectiveKind === "attack" && (
      army.kind === "transfer"
      || army.launchKind === "transfer"
      || army.retargetedFromKind === "transfer"
    );
    const convertedClanReinforcement = effectiveKind === "attack" && (
      army.kind === "reinforce"
      || army.launchKind === "reinforce"
      || army.retargetedFromKind === "reinforce"
    );
    const convertedReinforcement = convertedTransferReinforcement || convertedClanReinforcement;
    const currentAttackerKingPower = getPlayerPowerSnapshot({
      profile: attackerProfile,
      globalStats: attackerEconomy?.globalStats,
      city: source,
      fallback: army.attackerKingPower || army.ownerKingPower,
    });
    const currentDefenderKingPower = getPlayerPowerSnapshot({
      profile: defenderProfile || {},
      globalStats: defenderEconomy?.globalStats,
      city: target,
      fallback: army.defenderKingPower,
    });
    const launchAttackerKingPower = Math.max(
      0,
      Math.floor(safeNumber(army.attackerKingPower || army.ownerKingPower, 0))
    );
    const attackerKingPowerForXp = Math.max(
      1,
      launchAttackerKingPower || currentAttackerKingPower
    );
    const launchTargetOwnerUid = safeString(
      army.originalTargetOwnerUid || army.targetOwnerUid,
      128
    );
    const launchDefenderKingPower = Math.max(
      0,
      Math.floor(safeNumber(army.defenderKingPower, 0))
    );
    const defenderKingPowerForXp = Math.max(
      1,
      launchTargetOwnerUid && launchTargetOwnerUid === defenderUid
        ? launchDefenderKingPower || currentDefenderKingPower
        : currentDefenderKingPower
    );
    const baseAttackProtection = storedAttackProtection || (
      convertedReinforcement && targetType !== "camp"
        ? createServerAttackProtectionSnapshot({
          sourceTroops: Math.max(
            troopCount,
            Math.floor(safeNumber(army.requestedTroops, troopCount))
          ),
          target: combatTarget,
          targetType,
          requestedTroops: Math.max(1, Math.floor(safeNumber(army.requestedTroops, troopCount))),
          attackerKingPower: attackerKingPowerForXp,
          defenderKingPower: defenderKingPowerForXp,
          attackerUid,
          attackerProfile,
          defenderProfile: defenderProfile || {},
          defenderBonuses,
          defensePower: defensePackages.totalDefense,
          assaultStage: resolutionAssaultStage,
        })
        : null
    );
    const attackProtection = baseAttackProtection?.mode === "assault"
      ? normalizeAttackProtectionSnapshot({
        ...baseAttackProtection,
        assaultStage: resolutionAssaultStage,
      })
      : baseAttackProtection;
    let convertedExcessReturned = 0;
    const protectedDefenseClaimRef = attackProtection && defenderUid && defenderUid !== attackerUid
      ? db.doc(`players/${defenderUid}/protectedDefenseXpClaims/${attackerUid}`)
      : null;
    const protectedDefenseClaimSnap = protectedDefenseClaimRef
      ? await transaction.get(protectedDefenseClaimRef)
      : null;
    const protectedDefenseClaimData = protectedDefenseClaimSnap?.exists
      ? protectedDefenseClaimSnap.data() || {}
      : {};
    // Firestore transactions require every combat read to finish before this
    // slot-release write; doing it above left converted support permanently active.
    if (shouldReleaseClanReinforcementTarget) {
      releaseClanReinforcementTarget(transaction, attackerUid, reinforcementTargetKey);
    }
    const firstProtectedDefenseBonus = Boolean(
      protectedDefenseClaimRef
      && !isCurrentProtectedDefenseXpClaim(protectedDefenseClaimData)
    );
    const defenderXpMultiplierApplied = attackProtection
      ? firstProtectedDefenseBonus
        ? ATTACK_PROTECTION_DEFENDER_FIRST_XP_MULTIPLIER
        : ATTACK_PROTECTION_DEFENDER_REPEAT_XP_MULTIPLIER
      : 1;
    const protectedDefenseXpSummary = attackProtection
      ? firstProtectedDefenseBonus
        ? " First protected defense: 2× XP."
        : " Repeat protected defense: normal XP."
      : "";
    const attackerName = normalizePlayerName(attackerProfile.playerName || army.ownerName, "Rival ruler");
    const defenderName = defenderUid
      ? normalizePlayerName(target.ownerName || defenderProfile.playerName, "Rival ruler")
      : "Neutral city";
    const attackerFlag = normalizeServerFlag(attackerProfile.flag || army.ownerFlag);
    const defenderFlag = defenderUid
      ? normalizeServerFlag(defenderProfile.flag || target.ownerFlag)
      : null;
    let currentBattleId = "";
    const applyReinforcementDefenseSettlement = ({
      allocation = null,
      defenseXpPool = 0,
      outcome = "held",
      opponentName = attackerName,
    } = {}) => {
      if (!allocation?.contributions?.length) {
        return {
          ownerXp: Math.max(0, Math.floor(safeNumber(defenseXpPool, 0))),
          contributorXp: new Map(),
        };
      }
      const xpAllocation = allocateDefenseXp(
        defenseXpPool,
        allocation.ownerStart,
        allocation.contributions
      );
      allocation.contributions.forEach(entry => {
        const profileEntry = participantProfiles.get(entry.ownerUid) || {};
        const profile = profileEntry.data || {};
        const rawXp = Math.max(0, Math.floor(safeNumber(xpAllocation.contributorXp.get(entry.ownerUid), 0)));
        const xpAwarded = capBattleXpForHeroLevel(rawXp, profile);
        const currentStationed = getProfileStationedReinforcementTroops(profile);
        transaction.set(entry.ref, {
          troops: entry.remaining,
          status: entry.remaining > 0 ? REINFORCEMENT_STATUS_STATIONED : REINFORCEMENT_STATUS_DEPLETED,
          lastBattleArmyId: armyId,
          lastBattleAtMs: nowMs,
          lastBattleLosses: entry.losses,
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (entry.remaining <= 0) {
          releaseClanReinforcementTarget(transaction, entry.ownerUid, entry.targetKey);
        }
        if (profileEntry.ref && entry.losses > 0) {
          transaction.set(profileEntry.ref, {
            stationedReinforcementTroops: Math.max(0, currentStationed - entry.losses),
            reinforcementResetGeneration: RESET_GENERATION,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        const receiptRef = db.doc(
          `reinforcementBattleReceipts/${RESET_GENERATION}/entries/${safeString(`${armyId}_${entry.ownerUid}`, 180).replace(/[^a-zA-Z0-9_-]/g, "_")}`
        );
        transaction.set(receiptRef, {
          id: receiptRef.id,
          status: "pending",
          worldId: ONLINE_WORLD_ID,
          resetGeneration: RESET_GENERATION,
          armyId,
          battleId: currentBattleId,
          reinforcementId: entry.id,
          contributorUid: entry.ownerUid,
          contributorName: normalizePlayerName(profile.playerName || entry.ownerName, "Ruler"),
          targetOwnerUid: defenderUid,
          targetId: safeString(target.id, 96),
          targetName: safeString(target.name || target.id, 40),
          targetRegionId,
          targetType,
          opponentName,
          opponentFlag: attackerFlag,
          outcome,
          committedTroops: entry.troops,
          losses: entry.losses,
          survivors: entry.remaining,
          xpAwarded,
          fieldMedicsPercent: getSkillPercent(profile, "fieldMedics"),
          createdAtMs: nowMs,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false });
      });
      return {
        ownerXp: capBattleXpForHeroLevel(xpAllocation.ownerXp, defenderProfile || {}),
        contributorXp: xpAllocation.contributorXp,
      };
    };
    const continueRelinquishMarch = ({ destinationEntry = null, reason = "released_destination", reportSummary = "" } = {}) => {
      const movement = createRelinquishContinuationMovement({
        army,
        source: { ...target, regionId: targetRegionId },
        destinationEntry,
        economy: attackerEconomy,
        profile: attackerProfile,
        nowMs,
        reason,
      });
      writeArmyMovementCopies(transaction, movement, { includeCreatedAt: true });
      writeParticipantEconomies({}, {}, { addActiveArmies: [movement] });
      if (reportSummary) {
        const report = makeReport({
          id: `${armyId}_relinquish_redirect_${attackerUid}`,
          uid: attackerUid,
          type: "attack",
          outcome: "defeat",
          city: target,
          opponentName: defenderName,
          opponentFlag: defenderFlag,
          sentTroops: troopCount,
          troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
          totalDefense: targetStats.totalDefense,
          defenseStats: targetStats,
          summary: reportSummary,
          nowMs,
        });
        writeReport(transaction, attackerUid, report, attackerProfileSnap);
        reports.push(report);
      }
      markResolved({
        kind: "transfer",
        rerouted: true,
        redirectReason: reason,
        continuationArmyId: movement.id,
      });
      return {
        ok: true,
        status: "resolved",
        kind: "transfer",
        rerouted: true,
        redirectReason: reason,
        movement,
        reports: reportsForCaller(),
        cityUpdates: withEconomyCityUpdates(cityUpdates),
      };
    };

    if ((isCampReturn || isReinforcementReturn) && defenderUid !== attackerUid) {
      const returnedArmy = returnRecalledTroops(troopCount);
      finalizeReinforcementReturn(returnedArmy.returned);
      writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
      markResolved({
        kind: "return",
        campReturn: isCampReturn,
        reinforcementReturn: isReinforcementReturn,
        rerouted: true,
        returned: returnedArmy.returned,
        returnCityId: returnedArmy.cityId,
      });
      return {
        ok: true,
        status: "resolved",
        kind: "return",
        campReturn: isCampReturn,
        reinforcementReturn: isReinforcementReturn,
        rerouted: true,
        returned: returnedArmy.returned,
        returnCityId: returnedArmy.cityId,
        returnRegionId: returnedArmy.regionId,
        cityUpdates: withEconomyCityUpdates(cityUpdates),
        currentUser: profilePatchForCaller(
          { character: attackerProfile.character, gold: attackerEconomy?.gold, goldFloat: attackerEconomy?.goldFloat },
          null
        ),
      };
    }

    if (effectiveKind === "reinforce") {
      const contributionRef = reinforcementRef(attackerUid, reinforcementTargetKey);
      const existingContribution = targetReinforcements.find(entry => entry.ref.path === contributionRef.path);
      const nextContributionTroops = Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.max(0, Math.floor(safeNumber(existingContribution?.troops, 0))) + troopCount
      );
      const nextAlliedTroops = Math.min(Number.MAX_SAFE_INTEGER, alliedTroopsAtStart + troopCount);
      const targetPatch = { alliedReinforcementTroops: nextAlliedTroops };
      const currentStationedTroops = getProfileStationedReinforcementTroops(attackerProfile);
      const attackerOverrides = {
        stationedReinforcementTroops: Math.min(Number.MAX_SAFE_INTEGER, currentStationedTroops + troopCount),
        reinforcementResetGeneration: RESET_GENERATION,
      };
      writeParticipantEconomies(attackerOverrides, {}, {
        statsCityPatches: targetType === "city" && defenderUid === attackerUid
          ? [{ ref: targetRef, city: target, patch: targetPatch }]
          : [],
      });
      transaction.set(targetRef, targetPatch, { merge: true });
      transaction.set(contributionRef, {
        id: contributionRef.id,
        modelVersion: REINFORCEMENT_MODEL_VERSION,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        ownerUid: attackerUid,
        ownerName: attackerName,
        ownerFlag: attackerProfile.flag || army.ownerFlag || null,
        ownerKingPower: Math.max(0, Math.floor(safeNumber(attackerProfile.kingPower || army.ownerKingPower, 0))),
        clanId: safeString(attackerProfile.clanId, 128),
        targetKey: reinforcementTargetKey,
        targetType,
        targetId: safeString(target.id, 96),
        targetName: safeString(target.name || target.id, 40),
        targetRegionId,
        targetOwnerUid: defenderUid,
        targetOwnerName: defenderName,
        targetX: safeNumber(target.x, 0),
        targetY: safeNumber(target.y, 0),
        troops: nextContributionTroops,
        status: REINFORCEMENT_STATUS_STATIONED,
        lastArrivalArmyId: armyId,
        lastArrivedAtMs: nowMs,
        createdAtMs: Math.max(0, Math.floor(safeNumber(existingContribution?.createdAtMs, nowMs))),
        updatedAtMs: nowMs,
        createdAt: existingContribution?.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const targetUpdate = targetType === "camp"
        ? { campUpdate: campUpdateForClient(target.id, targetRegionId, targetPatch) }
        : { cityUpdates: withEconomyCityUpdates([
          { id: target.id, regionId: targetRegionId, ...targetPatch },
        ]) };
      markResolved({
        kind: "reinforce",
        outcome: "stationed",
        troops: troopCount,
        reinforcementId: contributionRef.id,
      });
      writeClanAudit(transaction, attackerProfile.clanId, attackerUid, "reinforcement_arrived", {
        armyId,
        reinforcementId: contributionRef.id,
        targetOwnerUid: defenderUid,
        targetId: target.id,
        troops: troopCount,
      }, nowMs);
      return {
        ok: true,
        status: "resolved",
        kind: "reinforce",
        outcome: "stationed",
        reinforcementId: contributionRef.id,
        troops: troopCount,
        ...targetUpdate,
        currentUser: profilePatchForCaller(attackerProfile, defenderProfile),
      };
    }

    const becameClanAllies = !isReturning
      && !launchedAsClanReinforcement
      && defenderUid
      && defenderUid !== attackerUid
      && safeString(attackerProfile?.clanId, 128)
      && safeString(attackerProfile?.clanId, 128) === safeString(defenderProfile?.clanId, 128);
    if (becameClanAllies) {
      const movement = createAlliedTargetReturnMovement(army, nowMs);
      writeArmyMovementCopies(transaction, movement, {
        previousTargetOwnerUid: army.targetOwnerUid,
      });
      let campUpdate = null;
      if (targetType === "camp" && targetSnap.exists && target) {
        const remainingActiveArmyIds = removeActiveCampArmyId(target, armyId);
        const campPatch = {
          activeArmyIds: remainingActiveArmyIds,
          state: getRewardCampState(remainingActiveArmyIds, getOwnerUid(target)),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.set(targetRef, campPatch, { merge: true });
        campUpdate = campUpdateForClient(target.id, targetRegionId, campPatch);
      }
      writeParticipantEconomies({}, {}, { addActiveArmies: [movement] });
      writeClanAudit(transaction, attackerProfile.clanId, attackerUid, "friendly_march_return_started", {
        armyId,
        defenderUid,
        troops: troopCount,
        returnDestinationId: movement.returnDestinationId,
        returnDestinationRegionId: movement.returnDestinationRegionId,
        returnArrivesAtMs: movement.arrivesAtMs,
      }, nowMs);
      return {
        ok: true,
        status: "returning",
        kind: "transfer",
        outcome: "allied_return_started",
        movement,
        campUpdate,
        returnSeconds: Math.max(1, Math.ceil((movement.arrivesAtMs - nowMs) / 1000)),
        cityUpdates: withEconomyCityUpdates([]),
        currentUser: profilePatchForCaller(attackerProfile, defenderProfile),
      };
    }

    if (isReturning && rallyAttack) {
      const attackPackages = getRallyAttackPackages(rallyAttack);
      const startingTroops = attackPackages.reduce((total, participant) => total + participant.troops, 0);
      const attackerAllocation = allocateRallyAttackerLosses(
        attackPackages,
        Math.max(0, startingTroops - troopCount)
      );
      const leaderAllocation = attackerAllocation.find(entry => entry.uid === attackerUid);
      if (!leaderAllocation) {
        throw new HttpsError("failed-precondition", "The rally leader contribution is unavailable.");
      }
      const returnedLeader = returnRecalledTroops(leaderAllocation.survivors);
      const leaderCommittedTroops = Math.max(
        0,
        getProfileCommittedRallyTroops(attackerProfile) - leaderAllocation.troops
      );
      const returnReceipts = [];
      attackerAllocation
        .filter(entry => entry.uid !== attackerUid)
        .forEach(entry => {
          const receiptRef = rallyBattleReceiptRef(armyId, entry.uid);
          const receipt = {
            id: receiptRef.id,
            receiptKind: "rally_return",
            status: "pending",
            worldId: ONLINE_WORLD_ID,
            resetGeneration: RESET_GENERATION,
            rallyId: rallyAttack.id,
            clanId: rallyAttack.clanId,
            armyId,
            battleId: "",
            contributorUid: entry.uid,
            contributorName: entry.ownerName,
            contributorFlag: entry.ownerFlag || null,
            sourceId: entry.sourceId,
            sourceName: entry.sourceName,
            sourceRegionId: entry.sourceRegionId,
            returnSourceType: "city",
            returnSourceId: rallyAttack.assemblyCityId,
            returnSourceName: rallyAttack.assemblyCityName,
            returnSourceRegionId: rallyAttack.assemblyRegionId,
            returnSourceX: safeNumber(rallyAttack.assemblyX, safeNumber(source?.x, 0)),
            returnSourceY: safeNumber(rallyAttack.assemblyY, safeNumber(source?.y, 0)),
            targetId: rallyAttack.targetId,
            targetName: rallyAttack.targetName,
            targetRegionId: rallyAttack.targetRegionId,
            targetType: rallyAttack.targetType,
            opponentName: "Rally recalled",
            outcome: "recalled",
            committedTroops: entry.troops,
            losses: entry.losses,
            survivors: entry.survivors,
            xpAwarded: 0,
            fieldMedicsPercent: entry.fieldMedicsPercent,
            returnReason: safeString(army.returnReason, 40) || RALLY_RETURN_REASON,
            createdAtMs: nowMs,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };
          transaction.set(receiptRef, receipt, { merge: false });
          returnReceipts.push(receiptRef.id);
        });
      let campUpdate = null;
      if (targetType === "camp" && targetSnap.exists && target) {
        const remainingActiveArmyIds = removeActiveCampArmyId(target, armyId);
        const campPatch = {
          activeArmyIds: remainingActiveArmyIds,
          state: getRewardCampState(remainingActiveArmyIds, getOwnerUid(target)),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.set(targetRef, campPatch, { merge: true });
        campUpdate = campUpdateForClient(target.id, targetRegionId, campPatch);
      }
      writeParticipantEconomies({
        committedRallyTroops: leaderCommittedTroops,
        rallyResetGeneration: RESET_GENERATION,
      }, {}, {
        statsCityPatches: getLatestSourceReturnStatsPatches(),
      });
      const settledParticipants = attackerAllocation.map(entry => ({
        ...entry,
        status: entry.uid === attackerUid && returnedLeader.returned >= entry.survivors
          ? RALLY_PARTICIPANT_RETURNED
          : entry.survivors > 0
            ? RALLY_PARTICIPANT_RETURNING
            : RALLY_PARTICIPANT_RETURNED,
      }));
      transaction.set(rallyAttackDocumentRef, {
        status: RALLY_STATUS_RESOLVED,
        participants: settledParticipants,
        participantUids: settledParticipants.map(entry => entry.uid),
        participantCount: 0,
        assembledTroops: 0,
        inboundTroops: 0,
        resolutionOutcome: safeString(army.returnReason, 40) || "recalled",
        resolvedAtMs: nowMs,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const resolvedMovement = {
        ...army,
        id: armyId,
        status: "resolved",
        resolvedAtMs: nowMs,
        result: {
          kind: "return",
          rallyAttack: true,
          rallyId: rallyAttack.id,
          returnReason: safeString(army.returnReason, 40),
          returnedLeaderTroops: returnedLeader.returned,
          alliedReturnReceipts: returnReceipts,
        },
      };
      writeArmyMovementCopies(transaction, resolvedMovement, {
        previousTargetOwnerUid: army.targetOwnerUid,
      });
      writeClanAudit(transaction, rallyAttack.clanId, attackerUid, "rally_return_arrived", {
        rallyId: rallyAttack.id,
        armyId,
        leaderReturnedTroops: returnedLeader.returned,
        alliedReturnCount: returnReceipts.length,
      }, nowMs);
      return {
        ok: true,
        status: "resolved",
        kind: "return",
        rallyAttack: true,
        returned: returnedLeader.returned,
        returnCityId: returnedLeader.cityId,
        returnRegionId: returnedLeader.regionId,
        alliedReturnCount: returnReceipts.length,
        campUpdate,
        cityUpdates: withEconomyCityUpdates(cityUpdates),
        currentUser: {
          committedRallyTroops: leaderCommittedTroops,
          rallyResetGeneration: RESET_GENERATION,
          globalStats: globalStatsForClient(attackerEconomy?.lastGlobalStats || attackerEconomy?.globalStats),
        },
      };
    }

    if (isReturning) {
      const returnedArmy = returnRecalledTroops(troopCount);
      let campUpdate = null;
      if (targetType === "camp" && targetSnap.exists && target) {
        const remainingActiveArmyIds = removeActiveCampArmyId(target, armyId);
        const campPatch = {
          activeArmyIds: remainingActiveArmyIds,
          state: getRewardCampState(remainingActiveArmyIds, getOwnerUid(target)),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.set(targetRef, campPatch, { merge: true });
        campUpdate = campUpdateForClient(target.id, targetRegionId, campPatch);
      }
      writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
      markResolved({
        kind: "return",
        recalled: army.returnReason === RECALL_HORN_ITEM_ID,
        alliedReturn: army.returnReason === ALLIED_TARGET_RETURN_REASON,
        returnReason: safeString(army.returnReason, 40),
        returned: returnedArmy.returned,
        returnCityId: returnedArmy.cityId,
      });
      if (army.returnReason === ALLIED_TARGET_RETURN_REASON && attackerProfile.clanId) {
        writeClanAudit(transaction, attackerProfile.clanId, attackerUid, "friendly_march_returned", {
          armyId,
          returned: returnedArmy.returned,
          returnCityId: returnedArmy.cityId,
          returnRegionId: returnedArmy.regionId,
        }, nowMs);
      }
      return {
        ok: true,
        status: "resolved",
        kind: "return",
        returned: returnedArmy.returned,
        returnCityId: returnedArmy.cityId,
        returnRegionId: returnedArmy.regionId,
        campUpdate,
        cityUpdates: withEconomyCityUpdates(cityUpdates),
        currentUser: profilePatchForCaller(
          { character: attackerProfile.character, gold: attackerEconomy?.gold, goldFloat: attackerEconomy?.goldFloat },
          null
        ),
      };
    }

    if (rallyAttack) {
      if (!isRallyObjectiveTarget(target, targetType)) {
        throw new HttpsError("failed-precondition", "The rally target is no longer an eligible objective.");
      }
      const attackPackages = getRallyAttackPackages(rallyAttack);
      const totalAttackPower = attackPackages.reduce(
        (total, participant) => total + Math.max(0, Math.floor(safeNumber(participant.effectivePower, 0))),
        0
      );
      if (!attackPackages.length || !totalAttackPower) {
        throw new HttpsError("failed-precondition", "The rally has no valid attacker contribution packages.");
      }
      const result = calculateCombatResult(troopCount, combatTarget, attackerProfile, defenderProfile, {
        attackPower: totalAttackPower,
        defenderBonuses,
        defensePower: defensePackages.totalDefense,
      });
      const attackerAllocation = allocateRallyAttackerLosses(attackPackages, result.attackerLosses);
      const leaderAllocation = attackerAllocation.find(entry => entry.uid === attackerUid);
      if (!leaderAllocation) {
        throw new HttpsError("failed-precondition", "The rally leader contribution is unavailable.");
      }
      const defenseAllocation = allocateDefenderLosses(
        getTargetOwnerTroops(target, targetType),
        targetReinforcements,
        result.defenderLosses
      );
      const oldOwnerUid = defenderUid;
      const defendersAtStart = Math.max(0, Math.floor(safeNumber(combatTarget.troops, 0)));
      const battleOutcome = result.success ? "victory" : "defeat";
      if (result.success && targetType === "city" && isCrownCitadel(target)) {
        await recordCrownCitadelControlChange(transaction, {
          citadel: target,
          previousOwnerUid: oldOwnerUid,
          previousOwnerName: defenderName,
          nextOwnerUid: attackerUid,
          nextOwnerName: attackerName,
          nextOwnerFlag: attackerProfile.flag || army.ownerFlag || null,
          nowMs,
        });
      }
      currentBattleId = safeString(armyId, 160);
      writeDetailedBattleSnapshot(transaction, createDetailedBattleSnapshot({
        battleId: currentBattleId,
        armyId,
        target,
        targetType,
        attackerUid,
        attackerProfile,
        defenderUid,
        defenderProfile: defenderProfile || {},
        defenderBonuses,
        defensePackages,
        allocation: defenseAllocation,
        attackerPackages: attackPackages,
        attackerAllocation,
        result,
        outcome: battleOutcome,
        nowMs,
      }));
      const rawAttackWinXp = getCaptureXpAward(target, oldOwnerUid, result.defenderLosses, defenderProfile, {
        nowMs,
        attackerProfile,
        attackerKingPower: attackerKingPowerForXp,
        defenderKingPower: defenderKingPowerForXp,
        attackerCityCount: attackerEconomy?.cityEntries.filter(entry => (
          entry?.city
          && getOwnerUid(entry.city) === attackerUid
          && !isStronghold(entry.city)
        )).length || 0,
      });
      const attackXpPool = result.success
        ? rawAttackWinXp
        : getPartialBattleXpAward(rawAttackWinXp);
      const attackXpAllocation = allocateRallyAttackXp(attackXpPool, attackPackages);
      const leaderXp = capBattleXpForHeroLevel(
        attackXpAllocation.get(attackerUid) || 0,
        attackerProfile
      );
      const defenseOpponentXpMultiplier = getOpponentPowerXpMultiplier(
        attackerKingPowerForXp / defenderKingPowerForXp
      );
      const defenseHeldXp = Math.floor(
        getDefenseHeldXpAward(troopCount, target, defenderProfile) * defenseOpponentXpMultiplier
      );
      const defenderXpPool = result.success
        ? getPartialBattleXpAward(capBattleXpForHeroLevel(defenseHeldXp, defenderProfile || {}))
        : capBattleXpForHeroLevel(defenseHeldXp, defenderProfile || {});
      const reinforcementDefenseSettlement = applyReinforcementDefenseSettlement({
        allocation: defenseAllocation,
        defenseXpPool: defenderXpPool,
        outcome: result.success ? "lost" : "held",
      });
      const attackerProgress = buildPlayerProgressPatch(attackerProfile, { xp: leaderXp });
      const defenderProgress = defenderUid
        ? buildPlayerProgressPatch(defenderProfile || {}, {
          xp: reinforcementDefenseSettlement.ownerXp,
        })
        : null;
      const attackerLevelTroopReward = creditLevelUpTroopsToMainCity(
        attackerEconomy,
        attackerProfile,
        attackerProgress.levelTroopReward,
        nowMs
      );
      const defenderLevelTroopReward = defenderProgress
        ? creditLevelUpTroopsToMainCity(
          defenderEconomy,
          defenderProfile || {},
          defenderProgress.levelTroopReward,
          nowMs
        )
        : null;
      const attackerRecoveredTroops = recoverBattleLossesToMainCity({
        uid: attackerUid,
        profile: attackerProfile,
        economy: attackerEconomy,
        losses: leaderAllocation.losses,
      });
      const defenderRecoveredTroops = defenderUid && defenderUid !== attackerUid
        ? recoverBattleLossesToMainCity({
          uid: defenderUid,
          profile: defenderProfile,
          economy: defenderEconomy,
          losses: defenseAllocation.ownerLosses,
        })
        : 0;
      const remainingActiveArmyIds = targetType === "camp"
        ? removeActiveCampArmyId(target, armyId)
        : [];
      let targetPatch;
      let targetUpdate;
      if (targetType === "camp") {
        const campConfig = getRewardCampConfig(target);
        targetPatch = result.success
          ? {
            holderUid: attackerUid,
            holderName: attackerName,
            holderFlag: attackerProfile.flag || army.ownerFlag || null,
            heldSinceMs: nowMs,
            payoutAtMs: nowMs + campConfig.holdDurationMs,
            payoutPending: true,
            currentGarrison: leaderAllocation.survivors,
            alliedReinforcementTroops: 0,
            returnSourceCityId: rallyAttack.assemblyCityId,
            returnSourceRegionId: rallyAttack.assemblyRegionId,
            returnSourceCityName: rallyAttack.assemblyCityName || army.fromName || "Rally assembly",
            returnPathSegments: normalizePathSegments(army.pathSegments),
            returnRouteRegionIds: normalizeRegionIds(army.routeRegionIds),
            returnPathLength: Math.max(0, safeNumber(army.pathLength, 0)),
            activeArmyIds: remainingActiveArmyIds,
            state: getRewardCampState(remainingActiveArmyIds, attackerUid),
            lastCapturedAtMs: nowMs,
            updatedAt: FieldValue.serverTimestamp(),
          }
          : {
            currentGarrison: defenseAllocation.ownerRemaining,
            alliedReinforcementTroops: defenseAllocation.alliedRemaining,
            activeArmyIds: remainingActiveArmyIds,
            state: getRewardCampState(remainingActiveArmyIds, defenderUid),
            updatedAt: FieldValue.serverTimestamp(),
          };
        targetUpdate = campUpdateForClient(target.id, targetRegionId, targetPatch);
      } else if (result.success) {
        targetPatch = {
          ownerKind: "player",
          ownerUid: attackerUid,
          ownerName: attackerName,
          ownerFlag: attackerProfile.flag || army.ownerFlag || null,
          ownerKingPower: Math.max(0, Math.floor(safeNumber(attackerProfile.kingPower || army.ownerKingPower, 0))),
          ownerClanId: safeString(attackerProfile.clanId, 128),
          ownerClanName: safeString(attackerProfile.clanName, 24),
          ownerClanTag: safeString(attackerProfile.clanTag, 5),
          ownerClanIdentityRevision: Math.max(0, Math.floor(safeNumber(attackerProfile.clanIdentityRevision, 0))),
          ownerClanIdentityRevisionVersion: CLAN_IDENTITY_REVISION_VERSION,
          ownerShieldExpiresAtMs: 0,
          troops: leaderAllocation.survivors,
          troopFloat: leaderAllocation.survivors,
          level: dropCapturedCityLevel(target),
          defense: 1,
          investedGold: 0,
          lastCapturedAtMs: nowMs,
          isMainCity: false,
          alliedReinforcementTroops: 0,
          relinquishedAtMs: 0,
          relocatedAtMs: 0,
        };
        targetUpdate = { id: target.id, regionId: targetRegionId, ...targetPatch };
      } else {
        targetPatch = {
          troops: defenseAllocation.ownerRemaining,
          troopFloat: defenseAllocation.ownerRemaining,
          alliedReinforcementTroops: defenseAllocation.alliedRemaining,
        };
        targetUpdate = { id: target.id, regionId: targetRegionId, ...targetPatch };
      }
      const leaderCommittedRallyTroops = Math.max(
        0,
        getProfileCommittedRallyTroops(attackerProfile) - leaderAllocation.troops
      );
      const attackerReport = makeReport({
        id: `${armyId}_rally_attack_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: battleOutcome,
        city: target,
        opponentName: defenderName,
        opponentFlag: defenderFlag,
        sentTroops: troopCount,
        troopCount: defendersAtStart,
        result,
        totalDefense: targetStats.totalDefense,
        defenseStats: targetStats,
        summary: result.success
          ? `Your rally captured ${target.name || target.id}. Your ${leaderAllocation.survivors.toLocaleString()} surviving troops now hold the objective; allied survivors are returning home. +${attackerProgress.xpAwarded.toLocaleString()} XP.${attackerLevelTroopReward ? ` Hero level reward: +${attackerLevelTroopReward.credited.toLocaleString()} troops to ${attackerLevelTroopReward.cityName}.` : ""}${attackerRecoveredTroops > 0 ? ` Field Medics returned ${attackerRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`
          : `Your rally was defeated at ${target.name || target.id}; ${result.defendersLeft.toLocaleString()} defenders remained. +${attackerProgress.xpAwarded.toLocaleString()} XP.${attackerLevelTroopReward ? ` Hero level reward: +${attackerLevelTroopReward.credited.toLocaleString()} troops to ${attackerLevelTroopReward.cityName}.` : ""}${attackerRecoveredTroops > 0 ? ` Field Medics returned ${attackerRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
        xpAwarded: attackerProgress.xpAwarded,
        goldAwarded: attackerProgress.goldAwarded,
        troopsAwarded: attackerLevelTroopReward?.credited || 0,
        characterAfter: attackerProgress.character,
        goldAfter: attackerProgress.gold,
        battleId: currentBattleId,
        fieldMedicsRecovered: attackerRecoveredTroops,
        nowMs,
      });
      const alliedReceiptIds = [];
      attackerAllocation
        .filter(entry => entry.uid !== attackerUid)
        .forEach(entry => {
          const receiptRef = rallyBattleReceiptRef(armyId, entry.uid);
          transaction.set(receiptRef, {
            id: receiptRef.id,
            receiptKind: "rally_battle",
            status: "pending",
            worldId: ONLINE_WORLD_ID,
            resetGeneration: RESET_GENERATION,
            rallyId: rallyAttack.id,
            clanId: rallyAttack.clanId,
            armyId,
            battleId: currentBattleId,
            contributorUid: entry.uid,
            contributorName: entry.ownerName,
            contributorFlag: entry.ownerFlag || null,
            sourceId: entry.sourceId,
            sourceName: entry.sourceName,
            sourceRegionId: entry.sourceRegionId,
            returnSourceType: targetType,
            returnSourceId: target.id,
            returnSourceName: target.name || target.id,
            returnSourceRegionId: targetRegionId,
            returnSourceX: safeNumber(target.x, 0),
            returnSourceY: safeNumber(target.y, 0),
            targetId: target.id,
            targetName: target.name || target.id,
            targetRegionId,
            targetType,
            opponentName: defenderName,
            opponentFlag: defenderFlag,
            outcome: battleOutcome,
            committedTroops: entry.troops,
            losses: entry.losses,
            survivors: entry.survivors,
            xpAwarded: Math.max(0, Math.floor(safeNumber(attackXpAllocation.get(entry.uid), 0))),
            fieldMedicsPercent: entry.fieldMedicsPercent,
            returnReason: "rally_battle_survivors",
            createdAtMs: nowMs,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: false });
          alliedReceiptIds.push(receiptRef.id);
        });
      const defenderReport = defenderUid && defenderUid !== attackerUid
        ? makeReport({
          id: `${armyId}_rally_defense_${defenderUid}`,
          uid: defenderUid,
          type: "defense",
          outcome: result.success ? "lost" : "held",
          city: target,
          opponentName: attackerName,
          opponentFlag: attackerFlag,
          sentTroops: troopCount,
          troopCount: defendersAtStart,
          result,
          totalDefense: targetStats.totalDefense,
          defenseStats: targetStats,
          summary: result.success
            ? `${attackerName}'s clan rally captured ${target.name || target.id}. +${defenderProgress.xpAwarded.toLocaleString()} XP.${defenderLevelTroopReward ? ` Hero level reward: +${defenderLevelTroopReward.credited.toLocaleString()} troops to ${defenderLevelTroopReward.cityName}.` : ""}${defenderRecoveredTroops > 0 ? ` Field Medics returned ${defenderRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`
            : `${target.name || target.id} held against ${attackerName}'s clan rally with ${result.defendersLeft.toLocaleString()} defenders. +${defenderProgress.xpAwarded.toLocaleString()} XP.${defenderLevelTroopReward ? ` Hero level reward: +${defenderLevelTroopReward.credited.toLocaleString()} troops to ${defenderLevelTroopReward.cityName}.` : ""}${defenderRecoveredTroops > 0 ? ` Field Medics returned ${defenderRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
          xpAwarded: defenderProgress.xpAwarded,
          goldAwarded: defenderProgress.goldAwarded,
          troopsAwarded: defenderLevelTroopReward?.credited || 0,
          characterAfter: defenderProgress.character,
          goldAfter: defenderProgress.gold,
          battleId: currentBattleId,
          fieldMedicsRecovered: defenderRecoveredTroops,
          nowMs,
        })
        : null;
      const statsCityPatches = targetType === "city"
        ? [{ ref: targetRef, city: target, patch: targetPatch }]
        : [];
      const participantStats = writeParticipantEconomies({
        character: attackerProgress.character,
        gold: attackerProgress.gold,
        goldFloat: attackerProgress.goldFloat,
        committedRallyTroops: leaderCommittedRallyTroops,
        rallyResetGeneration: RESET_GENERATION,
      }, defenderProgress ? {
        character: defenderProgress.character,
        gold: defenderProgress.gold,
        goldFloat: defenderProgress.goldFloat,
      } : {}, {
        statsCityPatches,
      });
      if (result.success && targetType === "city" && participantStats.attackerStats) {
        targetPatch.ownerKingPower = participantStats.attackerStats.kingPower;
        targetPatch.kingPowerVersion = GLOBAL_PLAYER_STATS_VERSION;
        Object.assign(targetUpdate, {
          ownerKingPower: targetPatch.ownerKingPower,
          kingPowerVersion: targetPatch.kingPowerVersion,
        });
      }
      transaction.set(targetRef, targetType === "city"
        ? cleanCityUpdate(target, targetPatch)
        : targetPatch, { merge: true });
      if (result.success) {
        writeOwnershipChangeEvent(transaction, {
          eventId: `army_${armyId}_${targetType}_${target.id}`,
          targetType,
          targetId: target.id,
          regionId: targetRegionId,
          beforeOwnerUid: oldOwnerUid,
          afterOwnerUid: attackerUid,
          reason: targetType === "camp" ? "camp_captured" : "city_captured",
          nowMs,
        });
      }
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap, {
        character: attackerProgress.character,
        gold: attackerProgress.gold,
        goldFloat: attackerProgress.goldFloat,
        committedRallyTroops: leaderCommittedRallyTroops,
        rallyResetGeneration: RESET_GENERATION,
      });
      reports.push(attackerReport);
      if (defenderReport) {
        writeReport(transaction, defenderUid, defenderReport, defenderProfileSnap, {
          character: defenderProgress.character,
          gold: defenderProgress.gold,
          goldFloat: defenderProgress.goldFloat,
        });
        reports.push(defenderReport);
      }
      const settledParticipants = attackerAllocation.map(entry => ({
        ...entry,
        status: entry.uid === attackerUid
          ? RALLY_PARTICIPANT_RETURNED
          : entry.survivors > 0
            ? RALLY_PARTICIPANT_RETURNING
            : RALLY_PARTICIPANT_RETURNED,
        xpAwarded: Math.max(0, Math.floor(safeNumber(attackXpAllocation.get(entry.uid), 0))),
      }));
      transaction.set(rallyAttackDocumentRef, {
        status: RALLY_STATUS_RESOLVED,
        participants: settledParticipants,
        participantUids: settledParticipants.map(entry => entry.uid),
        participantCount: 0,
        assembledTroops: 0,
        inboundTroops: 0,
        resolutionOutcome: battleOutcome,
        battleId: currentBattleId,
        resolvedAtMs: nowMs,
        updatedAtMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      markResolved({
        kind: "attack",
        rallyAttack: true,
        rallyId: rallyAttack.id,
        outcome: battleOutcome,
        survivors: result.survivors,
        leaderSurvivors: leaderAllocation.survivors,
        attackerLosses: result.attackerLosses,
        defenderLosses: result.defenderLosses,
        alliedSettlementReceipts: alliedReceiptIds,
      });
      writeClanAudit(transaction, rallyAttack.clanId, attackerUid, "rally_resolved", {
        rallyId: rallyAttack.id,
        armyId,
        outcome: battleOutcome,
        leaderSurvivors: leaderAllocation.survivors,
        alliedSettlementCount: alliedReceiptIds.length,
      }, nowMs);
      return {
        ok: true,
        status: "resolved",
        kind: "attack",
        rallyAttack: true,
        outcome: battleOutcome,
        reports: reportsForCaller(),
        ...(targetType === "camp"
          ? { campUpdate: targetUpdate }
          : { cityUpdates: withEconomyCityUpdates([targetUpdate]) }),
        currentUser: {
          ...profilePatchForCaller(attackerProgress, defenderProgress),
          committedRallyTroops: leaderCommittedRallyTroops,
          rallyResetGeneration: RESET_GENERATION,
          globalStats: globalStatsForClient(attackerEconomy?.lastGlobalStats || attackerEconomy?.globalStats),
        },
      };
    }

    if (targetType === "camp") {
      if (army.kind === "scout") {
        const campTarget = createReinforcedCombatTarget(getRewardCampCombatTarget(target), "camp");
        const scoutReport = createScoutReportSnapshot(campTarget, defenderProfile, nowMs, defenderBonuses, targetStats);
        const report = makeReport({
          id: `${armyId}_${campTarget.campType}_camp_scout_${attackerUid}`,
          uid: attackerUid,
          type: "scout",
          outcome: "scout",
          city: campTarget,
          opponentName: defenderUid ? defenderName : "Neutral defenders",
          opponentFlag: defenderFlag,
          sentTroops: troopCount,
          troopCount: scoutReport.troops,
          totalDefense: scoutReport.totalDefense,
          defenseStats: scoutReport,
          summary: `Scout revealed ${scoutReport.troops.toLocaleString()} defenders at ${campTarget.name || campTarget.id}.`,
          scoutReport,
          nowMs,
        });
        writeParticipantEconomies();
        writeReport(transaction, attackerUid, report, attackerProfileSnap);
        writeScoutReport(transaction, attackerUid, campTarget.id, scoutReport, attackerProfileSnap);
        transaction.set(islandReportRef(targetRegionId, report.id), {
          ...report,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        reports.push(report);
        markResolved({ kind: "scout", targetType: "camp", targetTroops: scoutReport.troops });
        return {
          ok: true,
          status: "resolved",
          kind: "scout",
          targetType: "camp",
          reports: reportsForCaller(),
          scoutReport: callerUid === attackerUid ? scoutReport : null,
          cityUpdates: withEconomyCityUpdates(cityUpdates),
          currentUser: profilePatchForCaller(
            { character: attackerProfile.character, gold: attackerEconomy?.gold, goldFloat: attackerEconomy?.goldFloat },
            defenderEconomy ? { character: defenderProfile?.character, gold: defenderEconomy.gold, goldFloat: defenderEconomy.goldFloat } : null
          ),
        };
      }

      const remainingActiveArmyIds = removeActiveCampArmyId(target, armyId);
      if (defenderUid === attackerUid) {
        const nextGarrison = Math.max(0, Math.floor(safeNumber(target.currentGarrison, target.troops))) + troopCount;
        const campPatch = {
          currentGarrison: nextGarrison,
          activeArmyIds: remainingActiveArmyIds,
          state: getRewardCampState(remainingActiveArmyIds, attackerUid),
          updatedAt: FieldValue.serverTimestamp(),
        };
        writeParticipantEconomies();
        transaction.set(targetRef, campPatch, { merge: true });
        markResolved({ kind: "transfer", targetType: "camp", troops: troopCount });
        return {
          ok: true,
          status: "resolved",
          kind: "transfer",
          targetType: "camp",
          campUpdate: campUpdateForClient(target.id, targetRegionId, campPatch),
          cityUpdates: withEconomyCityUpdates(cityUpdates),
        };
      }

      const campTarget = createReinforcedCombatTarget(getRewardCampCombatTarget(target), "camp");
      const campConfig = getRewardCampConfig(campTarget);
      const defendersAtStart = Math.max(0, Math.floor(safeNumber(campTarget.troops, 0)));
      const battle = calculateCombatResult(troopCount, campTarget, attackerProfile, defenderProfile, {
        defenderBonuses,
        defensePower: defensePackages.totalDefense,
      });
      const defenseAllocation = allocateDefenderLosses(
        getTargetOwnerTroops(target, "camp"),
        targetReinforcements,
        battle.defenderLosses
      );
      currentBattleId = safeString(armyId, 160);
      writeDetailedBattleSnapshot(transaction, createDetailedBattleSnapshot({
        battleId: currentBattleId,
        armyId,
        target: campTarget,
        targetType: "camp",
        attackerUid,
        attackerProfile,
        defenderUid,
        defenderProfile: defenderProfile || {},
        defenderBonuses,
        defensePackages,
        allocation: defenseAllocation,
        result: battle,
        outcome: battle.success ? "victory" : "held",
        nowMs,
      }));
      applyReinforcementDefenseSettlement({
        allocation: defenseAllocation,
        defenseXpPool: 0,
        outcome: battle.success ? "lost" : "held",
      });
      const attackerRecoveredTroops = recoverBattleLossesToMainCity({
        uid: attackerUid,
        profile: attackerProfile,
        economy: attackerEconomy,
        losses: battle.attackerLosses,
      });
      const defenderRecoveredTroops = defenderUid && defenderUid !== attackerUid
        ? recoverBattleLossesToMainCity({
          uid: defenderUid,
          profile: defenderProfile,
          economy: defenderEconomy,
          losses: defenseAllocation.ownerLosses,
        })
        : 0;
      const attackerReport = makeReport({
        id: `${armyId}_${campTarget.campType}_camp_attack_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: battle.success ? "victory" : "defeat",
        city: campTarget,
        opponentName: defenderUid ? defenderName : "Neutral defenders",
        opponentFlag: defenderFlag,
        sentTroops: troopCount,
        troopCount: defendersAtStart,
        result: battle,
        totalDefense: targetStats.totalDefense,
        defenseStats: targetStats,
        summary: `${battle.success
          ? `Captured ${campTarget.name || campConfig.name} with ${battle.survivors.toLocaleString()} troops. Hold it for ${Math.floor(campConfig.holdDurationMs / 60000)} minutes to earn ${campConfig.rewardType}.`
          : `${battle.defendersLeft.toLocaleString()} defenders remained at ${campTarget.name || campConfig.name}.`}${attackerRecoveredTroops > 0 ? ` Field Medics returned ${attackerRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
        battleId: currentBattleId,
        fieldMedicsRecovered: attackerRecoveredTroops,
        nowMs,
      });

      let campPatch;
      if (battle.success) {
        campPatch = {
          holderUid: attackerUid,
          holderName: attackerName,
          holderFlag: attackerProfile.flag || army.ownerFlag || null,
          heldSinceMs: nowMs,
          payoutAtMs: nowMs + campConfig.holdDurationMs,
          payoutPending: true,
          currentGarrison: battle.survivors,
          alliedReinforcementTroops: 0,
          returnSourceCityId: army.fromId,
          returnSourceRegionId: sourceRegionId,
          returnSourceCityName: source?.name || army.fromName || "Origin city",
          returnPathSegments: normalizePathSegments(army.pathSegments),
          returnRouteRegionIds: normalizeRegionIds(army.routeRegionIds),
          returnPathLength: Math.max(0, safeNumber(army.pathLength, 0)),
          activeArmyIds: remainingActiveArmyIds,
          state: getRewardCampState(remainingActiveArmyIds, attackerUid),
          lastCapturedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        };
      } else {
        campPatch = {
          currentGarrison: defenseAllocation.ownerRemaining,
          alliedReinforcementTroops: defenseAllocation.alliedRemaining,
          activeArmyIds: remainingActiveArmyIds,
          state: getRewardCampState(remainingActiveArmyIds, defenderUid),
          updatedAt: FieldValue.serverTimestamp(),
        };
      }

      writeParticipantEconomies();
      transaction.set(targetRef, campPatch, { merge: true });
      if (battle.success) {
        writeOwnershipChangeEvent(transaction, {
          eventId: `army_${armyId}_camp_${target.id}`,
          targetType: "camp",
          targetId: target.id,
          regionId: targetRegionId,
          beforeOwnerUid: defenderUid,
          afterOwnerUid: attackerUid,
          reason: "camp_captured",
          nowMs,
        });
      }
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap);
      reports.push(attackerReport);

      if (defenderUid && defenderUid !== attackerUid) {
        const defenderReport = makeReport({
          id: `${armyId}_${campTarget.campType}_camp_defense_${defenderUid}`,
          uid: defenderUid,
          type: "defense",
          outcome: battle.success ? "lost" : "held",
          city: campTarget,
          opponentName: attackerName,
          opponentFlag: attackerFlag,
          sentTroops: troopCount,
          troopCount: defendersAtStart,
          result: battle,
          totalDefense: targetStats.totalDefense,
          defenseStats: targetStats,
          summary: `${battle.success
            ? `${attackerName} captured ${campTarget.name || campConfig.name}.`
            : `${campTarget.name || campConfig.name} held with ${battle.defendersLeft.toLocaleString()} defenders.`}${defenderRecoveredTroops > 0 ? ` Field Medics returned ${defenderRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
          battleId: currentBattleId,
          fieldMedicsRecovered: defenderRecoveredTroops,
          nowMs,
        });
        writeReport(transaction, defenderUid, defenderReport, defenderProfileSnap);
        reports.push(defenderReport);
      }

      markResolved({
        kind: "attack",
        targetType: "camp",
        outcome: battle.success ? "victory" : "defeat",
        survivors: battle.survivors,
        defendersLeft: battle.defendersLeft,
        attackerLosses: battle.attackerLosses,
        defenderLosses: battle.defenderLosses,
      });
      return {
        ok: true,
        status: "resolved",
        kind: "attack",
        targetType: "camp",
        outcome: battle.success ? "victory" : "defeat",
        reports: reportsForCaller(),
        campUpdate: campUpdateForClient(target.id, targetRegionId, campPatch),
        cityUpdates: withEconomyCityUpdates(cityUpdates),
        currentUser: profilePatchForCaller(
          { character: attackerProfile.character, gold: attackerEconomy?.gold, goldFloat: attackerEconomy?.goldFloat },
          defenderEconomy ? { character: defenderProfile?.character, gold: defenderEconomy.gold, goldFloat: defenderEconomy.goldFloat } : null
        ),
      };
    }

    if (army.kind === "scout") {
      if (isProtectedMainCity(target, attackerUid, defenderProfile)) {
        const returned = returnTroopsToSource(troopCount);
        writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
        const report = makeReport({
          id: `${armyId}_scout_blocked_${attackerUid}`,
          uid: attackerUid,
          type: "scout",
          outcome: "scout",
          city: target,
          opponentName: defenderName,
          opponentFlag: defenderFlag,
          sentTroops: troopCount,
          troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
          totalDefense: targetStats.totalDefense,
          defenseStats: targetStats,
          summary: `Main cities cannot be scouted. ${returned.toLocaleString()} scout returned.`,
          nowMs,
        });
        writeReport(transaction, attackerUid, report, attackerProfileSnap);
        transaction.set(islandReportRef(targetRegionId, report.id), {
          ...report,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        reports.push(report);
        markResolved({ kind: "scout", blocked: "main_city", returned });
        return {
          ok: true,
          status: "resolved",
          kind: "scout",
          reports: reportsForCaller(),
          cityUpdates: withEconomyCityUpdates(cityUpdates),
          currentUser: profilePatchForCaller(
            { character: attackerProfile.character, gold: attackerEconomy?.gold, goldFloat: attackerEconomy?.goldFloat },
            defenderEconomy ? { character: defenderProfile?.character, gold: defenderEconomy.gold, goldFloat: defenderEconomy.goldFloat } : null
          ),
        };
      }

      if (doesVeilOfSilenceBlock(army.kind, army.targetType) && defenderUid && defenderUid !== attackerUid && isVeilOfSilenceActive(defenderProfile, nowMs)) {
        const returned = returnTroopsToSource(troopCount);
        writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
        const report = makeReport({
          id: `${armyId}_scout_veiled_${attackerUid}`,
          uid: attackerUid,
          type: "scout",
          outcome: "scout",
          city: target,
          opponentName: defenderName,
          opponentFlag: defenderFlag,
          sentTroops: troopCount,
          troopCount: 0,
          totalDefense: 0,
          summary: `Veil of Silence blocked the scout. ${returned.toLocaleString()} scout returned.`,
          nowMs,
        });
        writeReport(transaction, attackerUid, report, attackerProfileSnap);
        transaction.set(islandReportRef(targetRegionId, report.id), {
          ...report,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        reports.push(report);
        markResolved({ kind: "scout", blocked: "veil_of_silence", returned });
        return {
          ok: true,
          status: "resolved",
          kind: "scout",
          reports: reportsForCaller(),
          cityUpdates: withEconomyCityUpdates(cityUpdates),
          currentUser: profilePatchForCaller(
            { character: attackerProfile.character, gold: attackerEconomy?.gold, goldFloat: attackerEconomy?.goldFloat },
            defenderEconomy ? { character: defenderProfile?.character, gold: defenderEconomy.gold, goldFloat: defenderEconomy.goldFloat } : null
          ),
        };
      }

      if (defenderUid && defenderUid === attackerUid) {
        const nextTroops = Math.max(0, Math.floor(safeNumber(target.troops, 0))) + troopCount;
        const targetTroopPatch = {
          troops: nextTroops,
          troopFloat: Math.max(0, safeNumber(target.troopFloat, target.troops || 0)) + troopCount,
        };
        writeParticipantEconomies({}, {}, { statsCityPatches: [{ ref: targetRef, city: target, patch: targetTroopPatch }] });
        const updatedTarget = cleanCityUpdate(target, targetTroopPatch);
        transaction.set(targetRef, updatedTarget, { merge: true });
        cityUpdates.push({ id: target.id, regionId: targetRegionId, troops: nextTroops });
        const ownCityStats = getCityStats({ ...target, ...updatedTarget }, attackerProfile, attackerEconomy?.bonuses || {});
        const report = makeReport({
          id: `${armyId}_scout_joined_${attackerUid}`,
          uid: attackerUid,
          type: "scout",
          outcome: "scout",
          city: { ...target, ...updatedTarget },
          opponentName: attackerName,
          opponentFlag: attackerFlag,
          sentTroops: troopCount,
          troopCount: nextTroops,
          totalDefense: ownCityStats.totalDefense,
          defenseStats: ownCityStats,
          summary: `Scout reached ${target.name || target.id}, now under your control. ${troopCount.toLocaleString()} scout joined the garrison.`,
          nowMs,
        });
        writeReport(transaction, attackerUid, report, attackerProfileSnap);
        transaction.set(islandReportRef(targetRegionId, report.id), {
          ...report,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        reports.push(report);
        markResolved({ kind: "scout", joinedOwnCity: true });
        return {
          ok: true,
          status: "resolved",
          kind: "scout",
          reports: reportsForCaller(),
          cityUpdates: withEconomyCityUpdates(cityUpdates),
        };
      }

      writeParticipantEconomies();
      const scoutReport = createScoutReportSnapshot(combatTarget, defenderProfile, nowMs, defenderBonuses, targetStats);
      const report = makeReport({
        id: `${armyId}_scout_${attackerUid}`,
        uid: attackerUid,
        type: "scout",
        outcome: "scout",
        city: target,
        opponentName: defenderName,
        opponentFlag: defenderFlag,
        sentTroops: troopCount,
        troopCount: scoutReport.troops,
        totalDefense: scoutReport.totalDefense,
        defenseStats: scoutReport,
        summary: `Scout revealed ${scoutReport.troops.toLocaleString()} troops at ${target.name || target.id}.`,
        scoutReport,
        nowMs,
      });
      writeReport(transaction, attackerUid, report, attackerProfileSnap);
      writeScoutReport(transaction, attackerUid, target.id, scoutReport, attackerProfileSnap);
      transaction.set(islandReportRef(targetRegionId, report.id), {
        ...report,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      reports.push(report);
      markResolved({ kind: "scout", targetTroops: scoutReport.troops });
      return {
        ok: true,
        status: "resolved",
        kind: "scout",
        reports: reportsForCaller(),
        scoutReport: callerUid === attackerUid ? scoutReport : null,
        cityUpdates: withEconomyCityUpdates(cityUpdates),
        currentUser: profilePatchForCaller(
          { character: attackerProfile.character, gold: attackerEconomy?.gold, goldFloat: attackerEconomy?.goldFloat },
          defenderEconomy ? { character: defenderProfile?.character, gold: defenderEconomy.gold, goldFloat: defenderEconomy.goldFloat } : null
        ),
      };
    }

    if (effectiveKind === "transfer") {
      const nextTroops = Math.max(0, Math.floor(safeNumber(target.troops, 0))) + troopCount;
      const targetTroopPatch = {
        troops: nextTroops,
        troopFloat: Math.max(0, safeNumber(target.troopFloat, target.troops || 0)) + troopCount,
      };
      writeParticipantEconomies({}, {}, { statsCityPatches: [{ ref: targetRef, city: target, patch: targetTroopPatch }] });
      transaction.set(targetRef, cleanCityUpdate(target, targetTroopPatch), { merge: true });
      cityUpdates.push({ id: target.id, regionId: targetRegionId, troops: nextTroops });
      finalizeReinforcementReturn(troopCount);
      markResolved({ kind: "transfer", troops: troopCount });
      return { ok: true, status: "resolved", kind: "transfer", cityUpdates: withEconomyCityUpdates(cityUpdates) };
    }

    if (army.relinquishTransfer && !defenderUid) {
      const destinationEntry = findNearestOwnedCityDestination(
        attackerEconomy,
        { ...target, regionId: targetRegionId },
        [targetRef.path]
      );
      if (!destinationEntry?.city) {
        throw new HttpsError("failed-precondition", "No owned city is available for the relinquished troops.");
      }
      return continueRelinquishMarch({
        destinationEntry,
        reason: "released_destination",
      });
    }

    const neutralCaptureBlockReason = getServerNeutralCaptureBlockReason(attackerEconomy, attackerProfile, target);
    if (neutralCaptureBlockReason) {
      const returned = returnTroopsToSource(troopCount);
      writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
      const attackerReport = makeReport({
        id: `${armyId}_capture_limit_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: "defeat",
        city: target,
        opponentName: defenderName,
        opponentFlag: defenderFlag,
        sentTroops: troopCount,
        troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
        totalDefense: targetStats.totalDefense,
        defenseStats: targetStats,
        summary: `${neutralCaptureBlockReason} The attack was canceled and ${returned.toLocaleString()} troops returned.`,
        nowMs,
      });
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap);
      reports.push(attackerReport);
      markResolved({ kind: "attack", blocked: "neutral_capture_limit", returned });
      return {
        ok: true,
        status: "resolved",
        kind: "attack",
        reports: reportsForCaller(),
        cityUpdates: withEconomyCityUpdates(cityUpdates),
        currentUser: profilePatchForCaller(
          { character: attackerProfile.character, gold: attackerEconomy?.gold, goldFloat: attackerEconomy?.goldFloat },
          null
        ),
      };
    }

    if (isProtectedMainCity(target, attackerUid, defenderProfile)) {
      if (army.relinquishTransfer) {
        const destinationEntry = getOwnedMainCityDestination(attackerEconomy, attackerProfile);
        if (!destinationEntry?.city) {
          throw new HttpsError("failed-precondition", "Your main city is unavailable for the returning troops.");
        }
        return continueRelinquishMarch({
          destinationEntry,
          reason: "protected_main_city",
          reportSummary: `Main cities cannot be attacked. Your relinquished troops are returning to ${destinationEntry.city.name || "your main city"}.`,
        });
      }
      const returned = returnTroopsToSource(troopCount);
      writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
      const attackerReport = makeReport({
        id: `${armyId}_attack_blocked_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: "defeat",
        city: target,
        opponentName: defenderName,
        opponentFlag: defenderFlag,
        sentTroops: troopCount,
        troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
        totalDefense: targetStats.totalDefense,
        defenseStats: targetStats,
        summary: `Main cities cannot be attacked. ${returned.toLocaleString()} troops returned.`,
        nowMs,
      });
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap);
      reports.push(attackerReport);
      markResolved({ kind: "attack", blocked: "main_city", returned });
      return { ok: true, status: "resolved", kind: "attack", reports: reportsForCaller(), cityUpdates: withEconomyCityUpdates(cityUpdates) };
    }

    if (isCityShielded(target, attackerUid, nowMs)) {
      if (army.relinquishTransfer) {
        const destinationEntry = getOwnedMainCityDestination(attackerEconomy, attackerProfile);
        if (!destinationEntry?.city) {
          throw new HttpsError("failed-precondition", "Your main city is unavailable for the returning troops.");
        }
        return continueRelinquishMarch({
          destinationEntry,
          reason: "shielded_destination",
          reportSummary: `Royal Peace Shield blocked the attack. Your relinquished troops are returning to ${destinationEntry.city.name || "your main city"}.`,
        });
      }
      const returned = returnTroopsToSource(troopCount);
      writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
      const attackerReport = makeReport({
        id: `${armyId}_attack_shielded_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: "defeat",
        city: target,
        opponentName: defenderName,
        opponentFlag: defenderFlag,
        sentTroops: troopCount,
        troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
        totalDefense: targetStats.totalDefense,
        defenseStats: targetStats,
        summary: `Royal Peace Shield blocked the attack. ${returned.toLocaleString()} troops returned.`,
        nowMs,
      });
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap);
      reports.push(attackerReport);
      markResolved({ kind: "attack", blocked: "shield", returned });
      return { ok: true, status: "resolved", kind: "attack", reports: reportsForCaller(), cityUpdates: withEconomyCityUpdates(cityUpdates) };
    }

    if (
      convertedClanReinforcement
      && attackProtection
      && Math.max(1, Math.floor(safeNumber(attackProtection.effectiveTroops, troopCount))) < troopCount
    ) {
      const allowedTroops = Math.max(1, Math.floor(safeNumber(attackProtection.effectiveTroops, 1)));
      const excess = Math.max(0, troopCount - allowedTroops);
      convertedExcessReturned = returnRecalledTroops(excess).returned;
      troopCount = allowedTroops;
    }

    const oldOwnerUid = defenderUid;
    const defendersAtStart = Math.max(0, Math.floor(safeNumber(combatTarget.troops, 0)));
    const result = calculateCombatResult(troopCount, combatTarget, attackerProfile, defenderProfile, {
      attackProtection,
      demoAttack: army.demoAttack,
      defenderBonuses,
      defensePower: defensePackages.totalDefense,
      convertedReinforcement,
      convertedReinforcementCaptureAllowed: convertedTransferReinforcement,
    });
    const defenseAllocation = allocateDefenderLosses(
      getTargetOwnerTroops(target, "city"),
      targetReinforcements,
      result.defenderLosses
    );
    currentBattleId = safeString(armyId, 160);
    writeDetailedBattleSnapshot(transaction, createDetailedBattleSnapshot({
      battleId: currentBattleId,
      armyId,
      target,
      targetType: "city",
      attackerUid,
      attackerProfile,
      defenderUid,
      defenderProfile: defenderProfile || {},
      defenderBonuses,
      defensePackages,
      allocation: defenseAllocation,
      result,
      outcome: result.success ? "victory" : result.breachCompleted ? "breach" : "held",
      nowMs,
    }));
    const givenUpNeutralTarget = isGivenUpNeutralCity(target);
    const attackWinXp = attackProtection || givenUpNeutralTarget
      ? 0
      : getCaptureXpAward(target, oldOwnerUid, result.defenderLosses, defenderProfile, {
        nowMs,
        attackerProfile,
        attackerKingPower: attackerKingPowerForXp,
        defenderKingPower: defenderKingPowerForXp,
        attackerCityCount: attackerEconomy?.cityEntries.filter(entry => (
          entry?.city
          && getOwnerUid(entry.city) === attackerUid
          && !isStronghold(entry.city)
        )).length || 0,
      });
    const defenseOpponentXpMultiplier = attackProtection
      ? 1
      : getOpponentPowerXpMultiplier(attackerKingPowerForXp / defenderKingPowerForXp);
    const defenseHeldXp = Math.floor(
      getDefenseHeldXpAward(troopCount, target, defenderProfile) * defenseOpponentXpMultiplier
    );
    const cappedAttackWinXp = capBattleXpForHeroLevel(attackWinXp, attackerProfile);
    const cappedDefenseHeldXp = Math.floor(capBattleXpForHeroLevel(defenseHeldXp, defenderProfile || {}) * defenderXpMultiplierApplied);
    const attackerXp = result.success ? cappedAttackWinXp : getPartialBattleXpAward(cappedAttackWinXp);
    const defenderXp = result.success ? getPartialBattleXpAward(cappedDefenseHeldXp) : cappedDefenseHeldXp;
    const reinforcementDefenseSettlement = applyReinforcementDefenseSettlement({
      allocation: defenseAllocation,
      defenseXpPool: defenderXp,
      outcome: result.success ? "lost" : result.breachCompleted ? "breached" : "held",
    });
    const settledDefenderXp = reinforcementDefenseSettlement.ownerXp;
    const attackerProgress = buildPlayerProgressPatch(attackerProfile, {
      xp: attackerXp,
    });
    const defenderProgress = defenderUid
      ? buildPlayerProgressPatch(defenderProfile || {}, {
        xp: settledDefenderXp,
      })
      : null;
    if (firstProtectedDefenseBonus && protectedDefenseClaimRef) {
      transaction.set(protectedDefenseClaimRef, {
        attackerUid,
        defenderUid,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        firstResolvedArmyId: armyId,
        claimedAtMs: nowMs,
        claimedAt: FieldValue.serverTimestamp(),
      });
    }
    const attackerLevelTroopReward = creditLevelUpTroopsToMainCity(
      attackerEconomy,
      attackerProfile,
      attackerProgress.levelTroopReward,
      nowMs
    );
    const defenderLevelTroopReward = defenderProgress
      ? creditLevelUpTroopsToMainCity(
        defenderEconomy,
        defenderProfile || {},
        defenderProgress.levelTroopReward,
        nowMs
      )
      : null;

    if (result.breachCompleted) {
      const targetPatch = {
        troops: defenseAllocation.ownerRemaining,
        troopFloat: defenseAllocation.ownerRemaining,
        alliedReinforcementTroops: defenseAllocation.alliedRemaining,
      };
      const returnedArmy = returnRecalledTroops(result.survivors);
      const attackerRecoveredTroops = recoverBattleLossesToMainCity({
        uid: attackerUid,
        profile: attackerProfile,
        economy: attackerEconomy,
        losses: result.attackerLosses,
      });
      const defenderRecoveredTroops = defenderUid && defenderUid !== attackerUid
        ? recoverBattleLossesToMainCity({
          uid: defenderUid,
          profile: defenderProfile,
          economy: defenderEconomy,
          losses: defenseAllocation.ownerLosses,
        })
        : 0;
      if (protectedAssaultBreachDocumentRef) {
        transaction.set(protectedAssaultBreachDocumentRef, {
          version: PROTECTED_ASSAULT_BREACH_VERSION,
          status: "active",
          attackerUid,
          defenderUid,
          cityId: target.id,
          regionId: targetRegionId,
          worldId: ONLINE_WORLD_ID,
          resetGeneration: RESET_GENERATION,
          defenderOwnershipStartedAtMs: getCityOwnershipStartedAtMs(target),
          firstResolvedArmyId: armyId,
          breachedAtMs: nowMs,
          breachedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.set(targetRef, cleanCityUpdate(target, targetPatch), { merge: true });
      cityUpdates.push({ id: target.id, regionId: targetRegionId, ...targetPatch });
      writeParticipantEconomies({
        character: attackerProgress.character,
        gold: attackerProgress.gold,
        goldFloat: attackerProgress.goldFloat,
      }, defenderProgress ? {
        character: defenderProgress.character,
        gold: defenderProgress.gold,
        goldFloat: defenderProgress.goldFloat,
      } : {}, {
        statsCityPatches: [{ ref: targetRef, city: target, patch: targetPatch }],
      });

      const returnedSummary = returnedArmy.returned > 0
        ? ` ${returnedArmy.returned.toLocaleString()} survivors returned to ${source?.name || "your kingdom"}.`
        : "";
      const attackerReport = makeReport({
        id: `${armyId}_attack_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: "breach",
        city: target,
        opponentName: defenderName,
        opponentFlag: defenderFlag,
        sentTroops: troopCount,
        troopCount: defendersAtStart,
        result,
        totalDefense: targetStats.totalDefense,
        defenseStats: targetStats,
        summary: `Walls breached. ${target.name || target.id} remains under ${defenderName}'s control; your follow-up protected assault can capture it.${returnedSummary} +0 XP.${protectedDefenseXpSummary}${attackerRecoveredTroops > 0 ? ` Field Medics returned ${attackerRecoveredTroops.toLocaleString()} troops.` : ""}`,
        xpAwarded: attackerProgress.xpAwarded,
        goldAwarded: attackerProgress.goldAwarded,
        troopsAwarded: attackerLevelTroopReward?.credited || 0,
        characterAfter: attackerProgress.character,
        goldAfter: attackerProgress.gold,
        attackProtection,
        defenderXpMultiplierApplied,
        firstProtectedDefenseBonus,
        battleId: currentBattleId,
        fieldMedicsRecovered: attackerRecoveredTroops,
        nowMs,
      });
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap, {
        character: attackerProgress.character,
        gold: attackerProgress.gold,
        goldFloat: attackerProgress.goldFloat,
      });
      reports.push(attackerReport);

      if (defenderUid && defenderUid !== attackerUid) {
        const defenderReport = makeReport({
          id: `${armyId}_defense_${defenderUid}`,
          uid: defenderUid,
          type: "defense",
          outcome: "breached",
          city: target,
          opponentName: attackerName,
          opponentFlag: attackerFlag,
          sentTroops: troopCount,
          troopCount: defendersAtStart,
          result,
          totalDefense: targetStats.totalDefense,
          defenseStats: targetStats,
          summary: `${attackerName} breached the walls at ${target.name || target.id}, but did not capture the city. A follow-up protected assault from that ruler can capture it. +${defenderProgress.xpAwarded.toLocaleString()} XP.${protectedDefenseXpSummary}${defenderLevelTroopReward ? ` Hero level reward: +${defenderLevelTroopReward.credited.toLocaleString()} troops to ${defenderLevelTroopReward.cityName}.` : ""}${defenderRecoveredTroops > 0 ? ` Field Medics returned ${defenderRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
          xpAwarded: defenderProgress.xpAwarded,
          goldAwarded: defenderProgress.goldAwarded,
          troopsAwarded: defenderLevelTroopReward?.credited || 0,
          characterAfter: defenderProgress.character,
          goldAfter: defenderProgress.gold,
          attackProtection,
          defenderXpMultiplierApplied,
          firstProtectedDefenseBonus,
          battleId: currentBattleId,
          fieldMedicsRecovered: defenderRecoveredTroops,
          nowMs,
        });
        writeReport(transaction, defenderUid, defenderReport, defenderProfileSnap, {
          character: defenderProgress.character,
          gold: defenderProgress.gold,
          goldFloat: defenderProgress.goldFloat,
        });
        reports.push(defenderReport);
      }

      markResolved({
        kind: "attack",
        outcome: "breach",
        survivors: result.survivors,
        returned: returnedArmy.returned,
        attackerLosses: result.attackerLosses,
        defenderLosses: result.defenderLosses,
        defendersLeft: result.defendersLeft,
      });
      return {
        ok: true,
        status: "resolved",
        kind: "attack",
        outcome: "breach",
        reports: reportsForCaller(),
        cityUpdates: withEconomyCityUpdates(cityUpdates),
        currentUser: profilePatchForCaller(attackerProgress, defenderProgress),
      };
    }

    if (result.success) {
      if (attackProtection?.mode === "assault" && protectedAssaultBreachDocumentRef) {
        transaction.set(protectedAssaultBreachDocumentRef, {
          status: "consumed",
          consumedByArmyId: armyId,
          consumedAtMs: nowMs,
          consumedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      const daily = normalizeDaily(attackerProfile.daily);
      const nextLevel = dropCapturedCityLevel(target);
      if (isCrownCitadel(target)) {
        await recordCrownCitadelControlChange(transaction, {
          citadel: target,
          previousOwnerUid: oldOwnerUid,
          previousOwnerName: defenderName,
          nextOwnerUid: attackerUid,
          nextOwnerName: attackerName,
          nextOwnerFlag: attackerProfile.flag || army.ownerFlag || null,
          nowMs,
        });
      }
      const targetPatch = {
        ownerKind: "player",
        ownerUid: attackerUid,
        ownerName: attackerName,
        ownerFlag: attackerProfile.flag || army.ownerFlag || null,
        ownerKingPower: Math.max(0, Math.floor(safeNumber(attackerProfile.kingPower || army.ownerKingPower, 0))),
        ownerClanId: safeString(attackerProfile.clanId, 128),
        ownerClanName: safeString(attackerProfile.clanName, 24),
        ownerClanTag: safeString(attackerProfile.clanTag, 5),
        ownerClanIdentityRevision: Math.max(0, Math.floor(safeNumber(attackerProfile.clanIdentityRevision, 0))),
        ownerClanIdentityRevisionVersion: CLAN_IDENTITY_REVISION_VERSION,
        ownerShieldExpiresAtMs: 0,
        troops: result.survivors,
        troopFloat: result.survivors,
        level: nextLevel,
        defense: 1,
        investedGold: 0,
        lastCapturedAtMs: nowMs,
        isMainCity: false,
        alliedReinforcementTroops: 0,
        relinquishedAtMs: 0,
        relocatedAtMs: 0,
      };
      transaction.set(targetRef, cleanCityUpdate(target, targetPatch), { merge: true });
      writeOwnershipChangeEvent(transaction, {
        eventId: `army_${armyId}_city_${target.id}`,
        targetType: "city",
        targetId: target.id,
        regionId: targetRegionId,
        beforeOwnerUid: oldOwnerUid,
        afterOwnerUid: attackerUid,
        reason: "city_captured",
        nowMs,
      });
      const targetCityUpdate = { id: target.id, regionId: targetRegionId, ...targetPatch };
      cityUpdates.push(targetCityUpdate);

      const attackerReport = makeReport({
        id: `${armyId}_attack_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: "victory",
        city: { ...target, level: clampCityLevel(target.level) },
        opponentName: defenderName,
        opponentFlag: defenderFlag,
        sentTroops: troopCount,
        troopCount: defendersAtStart,
        result,
        totalDefense: targetStats.totalDefense,
        defenseStats: targetStats,
        summary: `${convertedReinforcement ? "Reinforcements converted to an attack and captured the city" : "Captured"} with ${result.survivors.toLocaleString()} survivors. Level ${clampCityLevel(target.level).toLocaleString()} to ${nextLevel.toLocaleString()}. +${attackerProgress.xpAwarded.toLocaleString()} XP.${protectedDefenseXpSummary}${attackerLevelTroopReward ? ` Hero level reward: +${attackerLevelTroopReward.credited.toLocaleString()} troops to ${attackerLevelTroopReward.cityName}.` : ""}`,
        xpAwarded: attackerProgress.xpAwarded,
        goldAwarded: attackerProgress.goldAwarded,
        troopsAwarded: attackerLevelTroopReward?.credited || 0,
        characterAfter: attackerProgress.character,
        goldAfter: attackerProgress.gold,
        attackProtection,
        defenderXpMultiplierApplied,
        firstProtectedDefenseBonus,
        battleId: currentBattleId,
        nowMs,
      });
      const attackerDaily = !oldOwnerUid && !isStronghold(target)
        ? { daily: { ...daily, neutralCaptures: daily.neutralCaptures + 1 } }
        : {};
      const attackerRecoveredTroops = recoverBattleLossesToMainCity({
        uid: attackerUid,
        profile: attackerProfile,
        economy: attackerEconomy,
        losses: result.attackerLosses,
      });
      const defenderRecoveredTroops = defenderUid && defenderUid !== attackerUid
        ? recoverBattleLossesToMainCity({
          uid: defenderUid,
          profile: defenderProfile,
          economy: defenderEconomy,
          losses: defenseAllocation.ownerLosses,
        })
        : 0;
      const participantStats = writeParticipantEconomies({
        character: attackerProgress.character,
        gold: attackerProgress.gold,
        goldFloat: attackerProgress.goldFloat,
        ...attackerDaily,
      }, defenderProgress ? {
        character: defenderProgress.character,
        gold: defenderProgress.gold,
        goldFloat: defenderProgress.goldFloat,
      } : {}, {
        statsCityPatches: [{ ref: targetRef, city: target, patch: targetPatch }],
      });
      if (participantStats.attackerStats) {
        targetPatch.ownerKingPower = participantStats.attackerStats.kingPower;
        targetPatch.kingPowerVersion = GLOBAL_PLAYER_STATS_VERSION;
        Object.assign(targetCityUpdate, {
          ownerKingPower: targetPatch.ownerKingPower,
          kingPowerVersion: targetPatch.kingPowerVersion,
        });
      }
      if (attackerRecoveredTroops > 0) {
        attackerReport.summary = `${attackerReport.summary} Field Medics returned ${attackerRecoveredTroops.toLocaleString()} troops to your main city.`;
      }
      attackerReport.fieldMedicsRecovered = attackerRecoveredTroops;
      transaction.set(targetRef, cleanCityUpdate(target, targetPatch), { merge: true });
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap, {
        character: attackerProgress.character,
        gold: attackerProgress.gold,
        goldFloat: attackerProgress.goldFloat,
        ...attackerDaily,
      });
      reports.push(attackerReport);

      if (defenderUid && defenderUid !== attackerUid) {
        const defenderReport = makeReport({
          id: `${armyId}_defense_${defenderUid}`,
          uid: defenderUid,
          type: "defense",
          outcome: "lost",
          city: { ...target, level: clampCityLevel(target.level) },
          opponentName: attackerName,
          opponentFlag: attackerFlag,
          sentTroops: troopCount,
          troopCount: defendersAtStart,
          result,
          totalDefense: targetStats.totalDefense,
          defenseStats: targetStats,
          summary: `${target.name || target.id} was captured by ${attackerName}${convertedReinforcement ? " after incoming reinforcements converted to an attack" : ""}. Level ${clampCityLevel(target.level).toLocaleString()} to ${nextLevel.toLocaleString()}. +${defenderProgress.xpAwarded.toLocaleString()} XP.${protectedDefenseXpSummary}${defenderLevelTroopReward ? ` Hero level reward: +${defenderLevelTroopReward.credited.toLocaleString()} troops to ${defenderLevelTroopReward.cityName}.` : ""}${defenderRecoveredTroops > 0 ? ` Field Medics returned ${defenderRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
          xpAwarded: defenderProgress.xpAwarded,
          goldAwarded: defenderProgress.goldAwarded,
          troopsAwarded: defenderLevelTroopReward?.credited || 0,
          characterAfter: defenderProgress.character,
          goldAfter: defenderProgress.gold,
          attackProtection,
          defenderXpMultiplierApplied,
          firstProtectedDefenseBonus,
          battleId: currentBattleId,
          fieldMedicsRecovered: defenderRecoveredTroops,
          nowMs,
        });
        writeReport(transaction, defenderUid, defenderReport, defenderProfileSnap, {
          character: defenderProgress.character,
          gold: defenderProgress.gold,
          goldFloat: defenderProgress.goldFloat,
        });
        reports.push(defenderReport);
      }

      markResolved({
        kind: "attack",
        outcome: "victory",
        survivors: result.survivors,
        attackerLosses: result.attackerLosses,
        defenderLosses: result.defenderLosses,
      });
      return {
        ok: true,
        status: "resolved",
        kind: "attack",
        outcome: "victory",
        reports: reportsForCaller(),
        cityUpdates: withEconomyCityUpdates(cityUpdates),
        currentUser: profilePatchForCaller(attackerProgress, defenderProgress),
      };
    }

    const targetPatch = {
      troops: defenseAllocation.ownerRemaining,
      troopFloat: defenseAllocation.ownerRemaining,
      alliedReinforcementTroops: defenseAllocation.alliedRemaining,
    };
    transaction.set(targetRef, cleanCityUpdate(target, targetPatch), { merge: true });
    cityUpdates.push({ id: target.id, regionId: targetRegionId, ...targetPatch });

    const attackerReport = makeReport({
      id: `${armyId}_attack_${attackerUid}`,
      uid: attackerUid,
      type: "attack",
      outcome: result.raidCompleted ? "raid" : "defeat",
      city: target,
      opponentName: defenderName,
      opponentFlag: defenderFlag,
      sentTroops: troopCount,
      troopCount: defendersAtStart,
      result,
      totalDefense: targetStats.totalDefense,
      defenseStats: targetStats,
      summary: result.raidCompleted
        ? `Protected raid completed. ${result.defenderLosses.toLocaleString()} defenders lost; ${result.defendersLeft.toLocaleString()} remained. All ${troopCount.toLocaleString()} raiders were lost. +0 XP.${protectedDefenseXpSummary}`
        : `${result.defendersLeft.toLocaleString()} defenders remained. +${attackerProgress.xpAwarded.toLocaleString()} XP.${protectedDefenseXpSummary}${attackerLevelTroopReward ? ` Hero level reward: +${attackerLevelTroopReward.credited.toLocaleString()} troops to ${attackerLevelTroopReward.cityName}.` : ""}`,
      xpAwarded: attackerProgress.xpAwarded,
      goldAwarded: attackerProgress.goldAwarded,
      troopsAwarded: attackerLevelTroopReward?.credited || 0,
      characterAfter: attackerProgress.character,
      goldAfter: attackerProgress.gold,
      attackProtection,
      defenderXpMultiplierApplied,
      firstProtectedDefenseBonus,
      battleId: currentBattleId,
      nowMs,
    });
    const attackerRecoveredTroops = result.raidCompleted
      ? 0
      : recoverBattleLossesToMainCity({
        uid: attackerUid,
        profile: attackerProfile,
        economy: attackerEconomy,
        losses: result.attackerLosses,
      });
    const defenderRecoveredTroops = defenderUid && defenderUid !== attackerUid
      ? recoverBattleLossesToMainCity({
        uid: defenderUid,
        profile: defenderProfile,
        economy: defenderEconomy,
        losses: defenseAllocation.ownerLosses,
      })
      : 0;
    writeParticipantEconomies({
      character: attackerProgress.character,
      gold: attackerProgress.gold,
      goldFloat: attackerProgress.goldFloat,
    }, defenderProgress ? {
      character: defenderProgress.character,
      gold: defenderProgress.gold,
      goldFloat: defenderProgress.goldFloat,
    } : {}, {
      statsCityPatches: [{ ref: targetRef, city: target, patch: targetPatch }],
    });
    if (attackerRecoveredTroops > 0) {
      attackerReport.summary = `${attackerReport.summary} Field Medics returned ${attackerRecoveredTroops.toLocaleString()} troops to your main city.`;
    }
    attackerReport.fieldMedicsRecovered = attackerRecoveredTroops;
    transaction.set(targetRef, cleanCityUpdate(target, targetPatch), { merge: true });
    writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap, {
      character: attackerProgress.character,
      gold: attackerProgress.gold,
      goldFloat: attackerProgress.goldFloat,
    });
    reports.push(attackerReport);

    if (defenderUid && defenderUid !== attackerUid) {
      const defenderReport = makeReport({
        id: `${armyId}_defense_${defenderUid}`,
        uid: defenderUid,
        type: "defense",
        outcome: "held",
        city: target,
        opponentName: attackerName,
        opponentFlag: attackerFlag,
        sentTroops: troopCount,
        troopCount: defendersAtStart,
        result,
        totalDefense: targetStats.totalDefense,
        defenseStats: targetStats,
        summary: `${target.name || target.id} ${result.raidCompleted ? "survived a protected raid" : "survived"} with ${result.defendersLeft.toLocaleString()} defenders. +${defenderProgress.xpAwarded.toLocaleString()} XP.${protectedDefenseXpSummary}${defenderLevelTroopReward ? ` Hero level reward: +${defenderLevelTroopReward.credited.toLocaleString()} troops to ${defenderLevelTroopReward.cityName}.` : ""}${defenderRecoveredTroops > 0 ? ` Field Medics returned ${defenderRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
        xpAwarded: defenderProgress.xpAwarded,
        goldAwarded: defenderProgress.goldAwarded,
        troopsAwarded: defenderLevelTroopReward?.credited || 0,
        characterAfter: defenderProgress.character,
        goldAfter: defenderProgress.gold,
        attackProtection,
        defenderXpMultiplierApplied,
        firstProtectedDefenseBonus,
        battleId: currentBattleId,
        fieldMedicsRecovered: defenderRecoveredTroops,
        nowMs,
      });
      writeReport(transaction, defenderUid, defenderReport, defenderProfileSnap, {
        character: defenderProgress.character,
        gold: defenderProgress.gold,
        goldFloat: defenderProgress.goldFloat,
      });
      reports.push(defenderReport);
    }

    markResolved({
      kind: "attack",
      outcome: result.raidCompleted ? "raid" : "defeat",
      defendersLeft: result.defendersLeft,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
    });
    return {
      ok: true,
      status: "resolved",
      kind: "attack",
      outcome: result.raidCompleted ? "raid" : "defeat",
      reports: reportsForCaller(),
      cityUpdates: withEconomyCityUpdates(cityUpdates),
      currentUser: profilePatchForCaller(attackerProgress, defenderProgress),
    };
  });
}

exports.resolveArmyOrder = timedCallable("resolveArmyOrder", { region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const callerUid = requireAuth(request);
  const data = request.data || {};
  const armyId = safeString(data.armyId || data.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const requestedRegions = normalizeRegionIds(data.routeRegionIds || data.regionIds || []);
  return resolveArmyOrderById({ armyId, requestedRegions, callerUid });
});

function getActiveArmyTargetDisposition(army = {}, targetOwnerUid = "") {
  const currentKind = ARMY_ORDER_KINDS.includes(army.kind) ? army.kind : "attack";
  const ownerUid = safeString(army.ownerUid, 128);
  const nextTargetOwnerUid = safeString(targetOwnerUid, 128);
  if (
    currentKind === "scout"
    || army.returning
    || army.campReturn
    || army.relinquishTransfer
    || army.reinforcementReturn
  ) {
    return {
      kind: currentKind,
      converted: false,
      convertedToAttack: false,
      targetOwnerUid: nextTargetOwnerUid,
    };
  }
  const kind = currentKind === "reinforce"
    ? "reinforce"
    : ownerUid && ownerUid === nextTargetOwnerUid
      ? "transfer"
      : "attack";
  return {
    kind,
    converted: kind !== currentKind,
    convertedToAttack: (currentKind === "transfer" || currentKind === "reinforce") && kind === "attack",
    targetOwnerUid: nextTargetOwnerUid,
  };
}

async function refreshActiveArmyTargetOwner(targetKey = "", targetOwnerUid = "") {
  const safeTargetKey = safeString(targetKey, 180);
  if (!safeTargetKey) return { updated: 0, convertedToAttacks: 0, notifications: [] };
  const snapshot = await db.collection("armies")
    .where("targetKey", "==", safeTargetKey)
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .where("status", "==", "active")
    .limit(400)
    .get();
  const notifications = [];
  let convertedToAttacks = 0;
  const allianceCache = new Map();
  await processWithConcurrency(snapshot.docs, 8, async armyDoc => {
    const army = armyDoc.data() || {};
    let disposition = getActiveArmyTargetDisposition(army, targetOwnerUid);
    const ownerUid = safeString(army.ownerUid, 128);
    const rallyTargetFriendly = Boolean(
      army.rallyAttack
      && ownerUid
      && targetOwnerUid
      && (
        ownerUid === safeString(targetOwnerUid, 128)
        || await getCurrentClanAlliance(ownerUid, targetOwnerUid, allianceCache)
      )
    );
    if (rallyTargetFriendly) {
      const nowMs = Date.now();
      const movement = {
        ...createAlliedTargetReturnMovement({ id: armyDoc.id, ...army }, nowMs),
        returnReason: RALLY_FRIENDLY_RETURN_REASON,
        rallyReturn: true,
      };
      const batch = db.batch();
      writeArmyMovementCopies(batch, movement, {
        previousTargetOwnerUid: army.targetOwnerUid,
      });
      if (army.rallyClanId && army.rallyId) {
        batch.set(clanRallyRef(army.rallyClanId, army.rallyId), {
          status: RALLY_STATUS_RECALLING,
          friendlyReturnStartedAtMs: nowMs,
          friendlyReturnOwnerUid: safeString(targetOwnerUid, 128),
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
      return;
    }
    const launchedAsReinforcement = !army.reinforcementReturn && (
      army.kind === "reinforce"
      || army.launchKind === "reinforce"
      || army.retargetedFromKind === "reinforce"
    );
    if (launchedAsReinforcement) {
      const allied = await getCurrentClanAlliance(ownerUid, disposition.targetOwnerUid, allianceCache);
      const nextKind = allied ? "reinforce" : "attack";
      disposition = {
        ...disposition,
        kind: nextKind,
        converted: nextKind !== army.kind,
        convertedToAttack: nextKind === "attack" && army.kind !== "attack",
      };
    }
    const previousNotificationOwnerUid = safeString(army.lastIncomingNotificationOwnerUid, 128);
    const shouldNotify = disposition.kind === "attack"
      && disposition.targetOwnerUid
      && disposition.targetOwnerUid !== ownerUid
      && previousNotificationOwnerUid !== disposition.targetOwnerUid;
    if (disposition.convertedToAttack) convertedToAttacks += 1;
    const batch = db.batch();
    const nowMs = Date.now();
    const patch = {
      kind: disposition.kind,
      launchKind: ARMY_ORDER_KINDS.includes(army.launchKind)
        ? army.launchKind
        : army.kind,
      targetOwnerUid: disposition.targetOwnerUid,
      targetOwnerUpdatedAtMs: nowMs,
      lastIncomingNotificationOwnerUid: shouldNotify
        ? disposition.targetOwnerUid
        : disposition.kind === "transfer"
          ? ""
          : previousNotificationOwnerUid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (disposition.converted) {
      patch.retargetedFromKind = safeString(army.retargetedFromKind || army.kind, 16);
      patch.retargetedAtMs = nowMs;
    }
    writeArmyMovementCopies(batch, { ...army, ...patch, id: armyDoc.id }, {
      previousTargetOwnerUid: army.targetOwnerUid,
    });
    await batch.commit();
    if (shouldNotify) {
      const notification = createIncomingArmyNotification({
        defenderUid: disposition.targetOwnerUid,
        attackerUid: ownerUid,
        movement: { ...army, ...patch },
        source: { name: army.fromName },
        target: { name: army.toName },
      });
      if (notification) notifications.push(notification);
    }
  });
  return { updated: snapshot.size, convertedToAttacks, notifications };
}

async function getCurrentClanAlliance(ownerUid = "", holderUid = "", cache = new Map()) {
  const senderUid = safeString(ownerUid, 128);
  const targetOwnerUid = safeString(holderUid, 128);
  if (!senderUid || !targetOwnerUid || senderUid === targetOwnerUid) return false;
  const getProfile = async uid => {
    const key = `profile:${uid}`;
    if (!cache.has(key)) cache.set(key, db.doc(`players/${uid}`).get());
    const snap = await cache.get(key);
    return snap.exists ? snap.data() || {} : {};
  };
  const [senderProfile, holderProfile] = await Promise.all([
    getProfile(senderUid),
    getProfile(targetOwnerUid),
  ]);
  const clanId = safeString(senderProfile.clanId, 128);
  if (!clanId || clanId !== safeString(holderProfile.clanId, 128)) return false;
  const clanKey = `clan:${clanId}`;
  if (!cache.has(clanKey)) cache.set(clanKey, db.doc(`clans/${clanId}`).get());
  const clanSnap = await cache.get(clanKey);
  return clanSnap.exists && clanSnap.data()?.status === "active";
}

async function reconcileActiveClanReinforcementArmy(armyDoc, cache = new Map()) {
  const army = { id: armyDoc.id, ...armyDoc.data() };
  const launchedAsReinforcement = army.launchKind === "reinforce"
    || army.kind === "reinforce"
    || army.retargetedFromKind === "reinforce";
  if (
    !launchedAsReinforcement
    || army.reinforcementReturn
    || army.status !== "active"
    || !isCurrentWorldArmy(army)
  ) {
    return { updated: false, convertedToAttack: false, notification: null };
  }
  const ownerUid = safeString(army.ownerUid, 128);
  const targetOwnerUid = safeString(army.targetOwnerUid, 128);
  const allied = await getCurrentClanAlliance(ownerUid, targetOwnerUid, cache);
  const nextKind = allied ? "reinforce" : "attack";
  if (army.kind === nextKind) {
    return { updated: false, convertedToAttack: false, notification: null };
  }
  const nowMs = Date.now();
  const convertedToAttack = nextKind === "attack";
  const previousNotificationOwnerUid = safeString(army.lastIncomingNotificationOwnerUid, 128);
  const shouldNotify = convertedToAttack
    && targetOwnerUid
    && targetOwnerUid !== ownerUid
    && previousNotificationOwnerUid !== targetOwnerUid;
  const patch = {
    kind: nextKind,
    launchKind: "reinforce",
    retargetedFromKind: safeString(army.retargetedFromKind || army.kind, 16),
    retargetedAtMs: nowMs,
    lastIncomingNotificationOwnerUid: shouldNotify
      ? targetOwnerUid
      : allied
        ? ""
        : previousNotificationOwnerUid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  writeArmyMovementCopies(batch, { ...army, ...patch, id: armyDoc.id }, {
    previousTargetOwnerUid: army.targetOwnerUid,
  });
  await batch.commit();
  const notification = shouldNotify
    ? createIncomingArmyNotification({
      defenderUid: targetOwnerUid,
      attackerUid: ownerUid,
      movement: { ...army, ...patch },
      source: { name: army.fromName },
      target: { name: army.toName },
    })
    : null;
  if (notification) await sendIncomingArmyNotification(notification);
  return { updated: true, convertedToAttack, notification };
}

async function reconcileClanReinforcementsForPlayer(uid = "") {
  const playerUid = safeString(uid, 128);
  if (!playerUid) return { armiesUpdated: 0, returnsStarted: 0, returnFailures: 0 };
  const [ownedArmiesSnap, targetedArmiesSnap, ownedContributionsSnap, heldContributionsSnap] = await Promise.all([
    activeArmiesQueryForPlayer(playerUid).get(),
    db.collection("armies")
      .where("targetOwnerUid", "==", playerUid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID)
      .where("status", "==", "active")
      .get(),
    db.collection("reinforcements")
      .where("ownerUid", "==", playerUid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID)
      .where("status", "==", REINFORCEMENT_STATUS_STATIONED)
      .get(),
    db.collection("reinforcements")
      .where("targetOwnerUid", "==", playerUid)
      .where("resetGeneration", "==", RESET_GENERATION)
      .where("worldId", "==", ONLINE_WORLD_ID)
      .where("status", "==", REINFORCEMENT_STATUS_STATIONED)
      .get(),
  ]);
  const armyDocs = new Map();
  [...ownedArmiesSnap.docs, ...targetedArmiesSnap.docs].forEach(doc => armyDocs.set(doc.id, doc));
  const cache = new Map();
  const armyResults = [];
  await processWithConcurrency([...armyDocs.values()], 8, async doc => {
    armyResults.push(await reconcileActiveClanReinforcementArmy(doc, cache));
  });
  const contributionDocs = new Map();
  [...ownedContributionsSnap.docs, ...heldContributionsSnap.docs].forEach(doc => contributionDocs.set(doc.id, doc));
  const invalidContributions = [];
  await processWithConcurrency([...contributionDocs.values()], 8, async doc => {
    const contribution = doc.data() || {};
    const targetRef = getReinforcementTargetRef(contribution);
    const targetSnap = targetRef ? await targetRef.get() : null;
    const target = targetSnap?.exists
      ? contribution.targetType === "camp"
        ? getRewardCampCombatTarget({ id: targetSnap.id, ...targetSnap.data() })
        : { id: targetSnap.id, ...targetSnap.data() }
      : null;
    const currentHolderUid = target ? getOwnerUid(target) : safeString(contribution.targetOwnerUid, 128);
    const allied = await getCurrentClanAlliance(contribution.ownerUid, currentHolderUid, cache);
    if (!allied) invalidContributions.push(doc.id);
  });
  const returnResults = [];
  await processWithConcurrency(invalidContributions, 4, async reinforcementId => {
    const result = await beginReinforcementReturn({
      reinforcementId,
      reason: "clan_membership_changed",
    }).then(() => ({ ok: true })).catch(error => {
      console.warn("Could not automatically return invalid clan reinforcements", {
        reinforcementId,
        error: error?.message || String(error),
      });
      return { ok: false };
    });
    returnResults.push(result);
  });
  return {
    armiesUpdated: armyResults.filter(result => result?.updated).length,
    convertedToAttacks: armyResults.filter(result => result?.convertedToAttack).length,
    returnsStarted: returnResults.filter(result => result?.ok).length,
    returnFailures: returnResults.filter(result => !result?.ok).length,
  };
}

function ownershipChangeRef(eventId = "") {
  const safeEventId = safeString(eventId, 180).replace(/[^a-zA-Z0-9_-]/g, "_");
  return safeEventId
    ? db.doc(`realmEvents/${RESET_GENERATION}/ownershipChanges/${safeEventId}`)
    : null;
}

function writeOwnershipChangeEvent(transaction, {
  eventId = "",
  targetType = "city",
  targetId = "",
  regionId = "",
  beforeOwnerUid = "",
  afterOwnerUid = "",
  reason = "",
  nowMs = Date.now(),
} = {}) {
  const previousOwnerUid = safeString(beforeOwnerUid, 128);
  const nextOwnerUid = safeString(afterOwnerUid, 128);
  if (!transaction || previousOwnerUid === nextOwnerUid) return null;
  const normalizedTargetType = targetType === "camp" ? "camp" : "city";
  const normalizedRegionId = requireKnownWorldRegionId(regionId);
  const normalizedTargetId = safeString(targetId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const ref = ownershipChangeRef(eventId);
  if (!ref || !normalizedTargetId) return null;
  transaction.set(ref, {
    eventId: ref.id,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    releaseId: REALM_RELEASE_ID,
    targetType: normalizedTargetType,
    targetId: normalizedTargetId,
    regionId: normalizedRegionId,
    targetKey: `${normalizedRegionId}:${normalizedTargetId}`,
    beforeOwnerUid: previousOwnerUid,
    afterOwnerUid: nextOwnerUid,
    reason: safeString(reason, 64),
    status: "pending",
    attempts: 0,
    createdAtMs: nowMs,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref;
}

async function recordClanConquest(change = {}, eventId = "") {
  const targetType = change.targetType === "camp" ? "camp" : "city";
  const beforeOwnerUid = safeString(change.beforeOwnerUid, 128);
  const afterOwnerUid = safeString(change.afterOwnerUid, 128);
  if (
    targetType !== "city"
    || safeString(change.reason, 64) !== "city_captured"
    || !beforeOwnerUid
    || !afterOwnerUid
    || beforeOwnerUid === afterOwnerUid
  ) {
    return { counted: false };
  }
  const attackerProfileSnap = await db.doc(`players/${afterOwnerUid}`).get();
  const clanId = safeString(attackerProfileSnap.data()?.clanId, 128);
  if (!clanId) return { counted: false };
  const receiptRef = clanQuestCaptureReceiptRef(clanId, eventId || change.eventId);
  if (!receiptRef) return { counted: false };
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const [latestProfileSnap, clanSnap, memberSnap, progressSnap, receiptSnap] = await Promise.all([
      transaction.get(db.doc(`players/${afterOwnerUid}`)),
      transaction.get(db.doc(`clans/${clanId}`)),
      transaction.get(db.doc(`clans/${clanId}/members/${afterOwnerUid}`)),
      transaction.get(clanQuestProgressRef(clanId)),
      transaction.get(receiptRef),
    ]);
    if (receiptSnap.exists) return { counted: false, duplicate: true };
    const latestProfile = latestProfileSnap.data() || {};
    const clan = clanSnap.data() || {};
    if (
      !clanSnap.exists
      || !memberSnap.exists
      || safeString(latestProfile.clanId, 128) !== clanId
      || clan.status !== "active"
      || safeString(clan.resetGeneration, 120) !== RESET_GENERATION
      || safeString(clan.worldId, 120) !== ONLINE_WORLD_ID
    ) {
      return { counted: false };
    }
    const progress = progressSnap.exists ? progressSnap.data() || {} : {};
    const captureCount = Math.max(0, Math.floor(safeNumber(progress.captureCount, 0))) + 1;
    const milestoneUnlocks = progress.milestoneUnlocks && typeof progress.milestoneUnlocks === "object"
      ? { ...progress.milestoneUnlocks }
      : {};
    const newlyUnlocked = CLAN_QUEST_REWARDS.filter(reward => (
      captureCount >= reward.captures && !timestampToMs(milestoneUnlocks[reward.id])
    ));
    newlyUnlocked.forEach(reward => {
      milestoneUnlocks[reward.id] = nowMs;
    });
    transaction.set(clanQuestProgressRef(clanId), {
      clanId,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      captureCount,
      milestoneUnlocks,
      lastCaptureEventId: receiptRef.id,
      lastCapturedByUid: afterOwnerUid,
      lastCapturedTargetId: safeString(change.targetId, 96),
      lastCapturedRegionId: safeString(change.regionId, 80),
      lastCapturedAtMs: Math.max(0, timestampToMs(change.createdAtMs) || nowMs),
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
      ...(progressSnap.exists ? {} : {
        createdAtMs: nowMs,
        createdAt: FieldValue.serverTimestamp(),
      }),
    }, { merge: true });
    transaction.set(receiptRef, {
      eventId: receiptRef.id,
      clanId,
      attackerUid: afterOwnerUid,
      defenderUid: beforeOwnerUid,
      targetId: safeString(change.targetId, 96),
      regionId: safeString(change.regionId, 80),
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      captureNumber: captureCount,
      createdAtMs: nowMs,
      createdAt: FieldValue.serverTimestamp(),
    });
    newlyUnlocked.forEach(reward => {
      writeClanAudit(transaction, clanId, afterOwnerUid, "clan_quest_unlocked", {
        rewardId: reward.id,
        captures: reward.captures,
        rewardType: reward.rewardType,
        productionMinutes: reward.productionMinutes,
      }, nowMs);
    });
    return {
      counted: true,
      clanId,
      captureCount,
      unlockedRewardIds: newlyUnlocked.map(reward => reward.id),
    };
  });
}

async function returnReinforcementsAfterOwnershipChange(change = {}) {
  const targetKey = getReinforcementTargetKey(
    change.targetType === "camp" ? "camp" : "city",
    change.regionId,
    change.targetId
  );
  if (!targetKey || safeString(change.beforeOwnerUid, 128) === safeString(change.afterOwnerUid, 128)) {
    return { started: 0, failed: 0 };
  }
  const snapshot = await db.collection("reinforcements")
    .where("targetKey", "==", targetKey)
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .where("status", "==", REINFORCEMENT_STATUS_STATIONED)
    .get();
  let started = 0;
  let failed = 0;
  await processWithConcurrency(snapshot.docs, 4, async doc => {
    try {
      await beginReinforcementReturn({
        reinforcementId: doc.id,
        reason: safeString(change.reason, 40) || "ownership_changed",
      });
      started += 1;
    } catch (error) {
      failed += 1;
      console.warn("Could not automatically return reinforcements after ownership changed", {
        reinforcementId: doc.id,
        targetKey,
        error: error?.message || String(error),
      });
    }
  });
  return { started, failed };
}

async function processOwnershipChangeEvent(event) {
  const startedAtMs = Date.now();
  const snapshot = event.data;
  if (!snapshot?.exists) return null;
  const change = snapshot.data() || {};
  if (event.params?.resetGeneration !== RESET_GENERATION) return null;
  if (safeString(change.worldId, 120) !== ONLINE_WORLD_ID) return null;
  if (change.status === "processed") return null;
  const targetType = change.targetType === "camp" ? "camp" : "city";
  const beforeOwnerUid = safeString(change.beforeOwnerUid, 128);
  const afterOwnerUid = safeString(change.afterOwnerUid, 128);
  const armyRefresh = await refreshActiveArmyTargetOwner(change.targetKey, afterOwnerUid);
  const notificationResults = await Promise.allSettled(
    armyRefresh.notifications.map(notification => sendIncomingArmyNotification(notification))
  );
  const notificationFailures = notificationResults.filter(result => result.status === "rejected").length;
  if (notificationFailures) {
    console.warn("Could not send some retargeted incoming army notifications", {
      failed: notificationFailures,
      attempted: notificationResults.length,
    });
  }
  const armyUpdates = armyRefresh.updated;
  const reinforcementReturns = await returnReinforcementsAfterOwnershipChange(change);
  let statsUpdates = 0;
  const clanConquest = await recordClanConquest(change, snapshot.id);
  let clanBenefitUpdates = [];
  const objectiveOwnershipChanged = targetType === "city"
    && SERVER_WORLD_OBJECTIVE_TARGET_KEYS.has(
      `${normalizeRegionId(change.regionId)}:${safeString(change.targetId, 96)}`
    );
  if (objectiveOwnershipChanged) {
    const ownerProfileSnaps = await Promise.all(
      [...new Set([beforeOwnerUid, afterOwnerUid].filter(Boolean))]
        .map(uid => db.doc(`players/${uid}`).get())
    );
    const affectedClanIds = [...new Set(ownerProfileSnaps
      .map(profileSnap => safeString(profileSnap.data()?.clanId, 128))
      .filter(Boolean))];
    clanBenefitUpdates = await Promise.all(affectedClanIds.map(clanId => (
      rebuildClanBenefitsAndMemberStats(
        clanId,
        Math.max(0, timestampToMs(change.createdAtMs)) || startedAtMs
      )
    )));
    statsUpdates += clanBenefitUpdates.reduce(
      (total, update) => total + Math.max(0, Math.floor(safeNumber(update?.membersUpdated, 0))),
      0
    );
  }
  if (targetType === "camp") {
    const affectedUids = [...new Set([beforeOwnerUid, afterOwnerUid].filter(Boolean))];
    const results = await Promise.allSettled(affectedUids.map(uid => rebuildGlobalStatsForPlayer(uid)));
    const failure = results.find(result => result.status === "rejected");
    if (failure) throw failure.reason;
    statsUpdates = results.length;
  }
  await snapshot.ref.set({
    status: "processed",
    attempts: FieldValue.increment(1),
    processedAtMs: Date.now(),
    processedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  logOperation("processOwnershipChange", startedAtMs, null, "ok", {
    targetType,
    armyUpdates,
    convertedToAttacks: armyRefresh.convertedToAttacks,
    notificationsAttempted: notificationResults.length,
    notificationFailures,
    reinforcementReturnsStarted: reinforcementReturns.started,
    reinforcementReturnFailures: reinforcementReturns.failed,
    statsUpdates,
    clanQuestCaptureCount: clanConquest.captureCount || 0,
    clanBenefitClansUpdated: clanBenefitUpdates.length,
  });
  return { armyUpdates, reinforcementReturns, statsUpdates, clanConquest, clanBenefitUpdates };
}

exports.processOwnershipChange = onDocumentCreated({
  region: "us-central1",
  document: "realmEvents/{resetGeneration}/ownershipChanges/{eventId}",
  maxInstances: 20,
  retry: true,
}, processOwnershipChangeEvent);

async function settleReinforcementBattleReceipt(event) {
  const snapshot = event.data;
  if (!snapshot?.exists) return null;
  if (event.params?.resetGeneration !== RESET_GENERATION) return null;
  const contributorUid = safeString(snapshot.data()?.contributorUid, 128);
  if (!contributorUid) return null;
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const receiptSnap = await transaction.get(snapshot.ref);
    if (!receiptSnap.exists) return null;
    const receipt = receiptSnap.data() || {};
    if (
      receipt.status !== "pending"
      || safeString(receipt.worldId, 120) !== ONLINE_WORLD_ID
      || safeString(receipt.resetGeneration, 120) !== RESET_GENERATION
    ) {
      return null;
    }
    const economy = await prepareEconomyCollection(transaction, contributorUid, nowMs);
    const profile = economy.profileAfter || {};
    const progress = buildPlayerProgressPatch(profile, {
      xp: Math.max(0, Math.floor(safeNumber(receipt.xpAwarded, 0))),
    });
    const levelTroopReward = creditLevelUpTroopsToMainCity(
      economy,
      profile,
      progress.levelTroopReward,
      nowMs
    );
    const recoveredTroops = Math.floor(
      Math.max(0, safeNumber(receipt.losses, 0))
      * Math.max(0, safeNumber(receipt.fieldMedicsPercent, getSkillPercent(profile, "fieldMedics")))
      / 100
    );
    let recovery = null;
    if (recoveredTroops > 0) {
      const mainEntry = getCanonicalMainCityEntry(profile, economy.cityEntries);
      const mainCity = mainEntry?.city;
      if (mainEntry?.ref && mainCity && getOwnerUid(mainCity) === contributorUid) {
        const troopFloat = Math.max(0, safeNumber(mainCity.troopFloat, mainCity.troops || 0)) + recoveredTroops;
        const patch = {
          troops: Math.max(0, Math.floor(troopFloat)),
          troopFloat,
          productionUpdatedAtMs: nowMs,
        };
        appendEconomyCityPatch(economy, mainEntry.ref, mainCity, patch);
        recovery = {
          credited: recoveredTroops,
          cityId: safeString(mainCity.id, 96),
          cityName: safeString(mainCity.name || mainCity.id || "main city", 40),
        };
      }
    }
    const report = makeReport({
      id: `${safeString(receipt.armyId, 96)}_reinforcement_${contributorUid}`,
      uid: contributorUid,
      type: "defense",
      outcome: safeString(receipt.outcome, 24) || "held",
      city: {
        id: receipt.targetId,
        name: receipt.targetName,
        regionId: receipt.targetRegionId,
      },
      opponentName: receipt.opponentName,
      opponentFlag: receipt.opponentFlag,
      sentTroops: receipt.committedTroops,
      troopCount: receipt.committedTroops,
      result: {
        defendersLeft: receipt.survivors,
        defenderLosses: receipt.losses,
      },
      summary: `Your reinforcement committed ${Math.max(0, Math.floor(safeNumber(receipt.committedTroops, 0))).toLocaleString()} troops, lost ${Math.max(0, Math.floor(safeNumber(receipt.losses, 0))).toLocaleString()}, and has ${Math.max(0, Math.floor(safeNumber(receipt.survivors, 0))).toLocaleString()} stationed. +${progress.xpAwarded.toLocaleString()} XP.${recovery ? ` Field Medics returned ${recovery.credited.toLocaleString()} troops to ${recovery.cityName}.` : ""}`,
      xpAwarded: progress.xpAwarded,
      goldAwarded: progress.goldAwarded,
      troopsAwarded: levelTroopReward?.credited || 0,
      characterAfter: progress.character,
      goldAfter: progress.gold,
      battleId: safeString(receipt.battleId, 160),
      fieldMedicsRecovered: recovery?.credited || 0,
      nowMs,
    });
    writePreparedEconomy(transaction, economy, {
      character: progress.character,
      gold: progress.gold,
      goldFloat: progress.goldFloat,
    });
    writeReport(transaction, contributorUid, report, economy.profileSnap, {
      character: progress.character,
      gold: progress.gold,
      goldFloat: progress.goldFloat,
    });
    transaction.set(snapshot.ref, {
      status: "settled",
      xpAwarded: progress.xpAwarded,
      goldAwarded: progress.goldAwarded,
      levelTroopsAwarded: levelTroopReward?.credited || 0,
      fieldMedicsRecovered: recovery?.credited || 0,
      reportId: report.id,
      settledAtMs: nowMs,
      settledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      contributorUid,
      reportId: report.id,
      xpAwarded: progress.xpAwarded,
      recoveredTroops: recovery?.credited || 0,
    };
  });
}

exports.settleReinforcementBattle = onDocumentCreated({
  region: "us-central1",
  document: "reinforcementBattleReceipts/{resetGeneration}/entries/{receiptId}",
  maxInstances: 20,
  retry: true,
}, settleReinforcementBattleReceipt);

async function settleRallyBattleReceipt(event) {
  const snapshot = event.data;
  if (!snapshot?.exists || event.params?.resetGeneration !== RESET_GENERATION) return null;
  const contributorUid = safeString(snapshot.data()?.contributorUid, 128);
  if (!contributorUid) return null;
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const receiptSnap = await transaction.get(snapshot.ref);
    if (!receiptSnap.exists) return null;
    const receipt = receiptSnap.data() || {};
    if (
      receipt.status !== "pending"
      || safeString(receipt.worldId, 120) !== ONLINE_WORLD_ID
      || safeString(receipt.resetGeneration, 120) !== RESET_GENERATION
      || safeString(receipt.contributorUid, 128) !== contributorUid
    ) {
      return null;
    }
    const sourceRegionId = normalizeRegionId(receipt.returnSourceRegionId);
    const sourceId = safeString(receipt.returnSourceId, 96);
    const sourceRef = sourceRegionId && sourceId
      ? receipt.returnSourceType === "camp"
        ? campRefForRegion(sourceRegionId, sourceId)
        : cityRefForRegion(sourceRegionId, sourceId)
      : null;
    const sourceSnap = sourceRef ? await transaction.get(sourceRef) : null;
    const rallyRef = receipt.clanId && receipt.rallyId
      ? clanRallyRef(receipt.clanId, receipt.rallyId)
      : null;
    const rallySnap = rallyRef ? await transaction.get(rallyRef) : null;
    const economy = await prepareEconomyCollection(transaction, contributorUid, nowMs);
    const profile = economy.profileAfter || {};
    const xpAwarded = capBattleXpForHeroLevel(
      Math.max(0, Math.floor(safeNumber(receipt.xpAwarded, 0))),
      profile
    );
    const progress = buildPlayerProgressPatch(profile, { xp: xpAwarded });
    const levelTroopReward = creditLevelUpTroopsToMainCity(
      economy,
      profile,
      progress.levelTroopReward,
      nowMs
    );
    const recoveredTroops = Math.floor(
      Math.max(0, safeNumber(receipt.losses, 0))
      * Math.max(0, safeNumber(receipt.fieldMedicsPercent, getSkillPercent(profile, "fieldMedics")))
      / 100
    );
    let recovery = null;
    if (recoveredTroops > 0) {
      const mainEntry = getCanonicalMainCityEntry(profile, economy.cityEntries);
      const mainCity = mainEntry?.city;
      if (mainEntry?.ref && mainCity && getOwnerUid(mainCity) === contributorUid) {
        const troopFloat = Math.max(0, safeNumber(mainCity.troopFloat, mainCity.troops || 0)) + recoveredTroops;
        const patch = {
          troops: Math.max(0, Math.floor(troopFloat)),
          troopFloat,
          productionUpdatedAtMs: nowMs,
        };
        appendEconomyCityPatch(economy, mainEntry.ref, mainCity, patch);
        recovery = {
          credited: recoveredTroops,
          cityId: safeString(mainCity.id, 96),
          cityName: safeString(mainCity.name || mainCity.id || "main city", 40),
        };
      }
    }
    const participant = {
      uid: contributorUid,
      ownerName: receipt.contributorName,
      ownerFlag: receipt.contributorFlag || null,
      sourceId: receipt.sourceId,
      sourceName: receipt.sourceName,
      sourceRegionId: receipt.sourceRegionId,
      troops: Math.max(0, Math.floor(safeNumber(receipt.committedTroops, 0))),
      survivors: Math.max(0, Math.floor(safeNumber(receipt.survivors, 0))),
    };
    const source = sourceSnap?.exists
      ? {
        id: sourceSnap.id,
        ...sourceSnap.data(),
        regionId: sourceRegionId,
      }
      : {
        id: sourceId,
        name: safeString(receipt.returnSourceName || sourceId, 80),
        regionId: sourceRegionId,
        x: safeNumber(receipt.returnSourceX, 0),
        y: safeNumber(receipt.returnSourceY, 0),
      };
    let movement = null;
    if (participant.survivors > 0) {
      const destinationEntry = getRallyReturnDestination(economy, profile, participant);
      movement = createRallyReturnMovement({
        rally: {
          id: receipt.rallyId,
          clanId: receipt.clanId,
          targetId: receipt.targetId,
          targetName: receipt.targetName,
          targetRegionId: receipt.targetRegionId,
          assemblyCityId: receipt.returnSourceId,
          assemblyCityName: receipt.returnSourceName,
          assemblyRegionId: receipt.returnSourceRegionId,
        },
        participant,
        source,
        destinationEntry,
        economy,
        profile,
        nowMs,
        reason: receipt.returnReason || "rally_battle_survivors",
        movementId: `${receipt.armyId}_${contributorUid}_survivors`,
      });
    }
    const committedRallyTroops = Math.max(
      0,
      getProfileCommittedRallyTroops(profile) - participant.troops
    );
    writePreparedEconomy(transaction, economy, {
      character: progress.character,
      gold: progress.gold,
      goldFloat: progress.goldFloat,
      committedRallyTroops,
      rallyResetGeneration: RESET_GENERATION,
    }, [], {
      addActiveArmies: movement ? [movement] : [],
      nowMs,
    });
    if (movement) {
      writeArmyMovementCopies(transaction, {
        ...movement,
        rallyParticipantUid: contributorUid,
      }, { includeCreatedAt: true });
    }
    const report = makeReport({
      id: `${safeString(receipt.armyId, 96)}_rally_${contributorUid}`,
      uid: contributorUid,
      type: "attack",
      outcome: safeString(receipt.outcome, 24) || "defeat",
      city: {
        id: receipt.targetId,
        name: receipt.targetName,
        regionId: receipt.targetRegionId,
      },
      opponentName: receipt.opponentName,
      opponentFlag: receipt.opponentFlag,
      sentTroops: participant.troops,
      troopCount: participant.troops,
      result: {
        attackerLosses: receipt.losses,
        survivors: participant.survivors,
      },
      summary: `Your rally contribution committed ${participant.troops.toLocaleString()} troops, lost ${Math.max(0, Math.floor(safeNumber(receipt.losses, 0))).toLocaleString()}, and has ${participant.survivors.toLocaleString()} survivors.${movement ? ` Survivors are returning to ${movement.toName}.` : ""} +${progress.xpAwarded.toLocaleString()} XP.${levelTroopReward ? ` Hero level reward: +${levelTroopReward.credited.toLocaleString()} troops to ${levelTroopReward.cityName}.` : ""}${recovery ? ` Field Medics returned ${recovery.credited.toLocaleString()} troops to ${recovery.cityName}.` : ""}`,
      xpAwarded: progress.xpAwarded,
      goldAwarded: progress.goldAwarded,
      troopsAwarded: levelTroopReward?.credited || 0,
      characterAfter: progress.character,
      goldAfter: progress.gold,
      battleId: safeString(receipt.battleId, 160),
      fieldMedicsRecovered: recovery?.credited || 0,
      nowMs,
    });
    writeReport(transaction, contributorUid, report, economy.profileSnap, {
      character: progress.character,
      gold: progress.gold,
      goldFloat: progress.goldFloat,
      committedRallyTroops,
      rallyResetGeneration: RESET_GENERATION,
    });
    if (rallyRef && rallySnap?.exists) {
      const rally = normalizeClanRally(rallySnap);
      if (rally) {
        transaction.set(rallyRef, {
          participants: normalizeRallyParticipants(rally.participants).map(entry => (
            entry.uid === contributorUid
              ? {
                ...entry,
                status: movement ? RALLY_PARTICIPANT_RETURNING : RALLY_PARTICIPANT_RETURNED,
                returnArmyId: movement?.id || "",
                settledAtMs: nowMs,
              }
              : entry
          )),
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    transaction.set(snapshot.ref, {
      status: "settled",
      xpAwarded: progress.xpAwarded,
      goldAwarded: progress.goldAwarded,
      levelTroopsAwarded: levelTroopReward?.credited || 0,
      fieldMedicsRecovered: recovery?.credited || 0,
      returnArmyId: movement?.id || "",
      returnDestinationId: movement?.toId || "",
      returnDestinationRegionId: movement?.targetRegionId || "",
      returnArrivesAtMs: movement?.arrivesAtMs || 0,
      reportId: report.id,
      settledAtMs: nowMs,
      settledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      contributorUid,
      reportId: report.id,
      xpAwarded: progress.xpAwarded,
      recoveredTroops: recovery?.credited || 0,
      returnArmyId: movement?.id || "",
    };
  });
}

exports.settleRallyBattle = onDocumentCreated({
  region: "us-central1",
  document: "rallyBattleReceipts/{resetGeneration}/entries/{receiptId}",
  maxInstances: 20,
  retry: true,
}, settleRallyBattleReceipt);

function getUtcDateKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function getRewardCampDailyReward(config, claimIndex = 0, productionRates = {}) {
  const index = Math.max(0, Math.floor(safeNumber(claimIndex, 0)));
  const minimumReward = Math.max(0, Math.floor(safeNumber(config?.dailyRewards?.[index], 0)));
  const rewardHours = Math.max(0, safeNumber(config?.rewardHours?.[index], 0));
  if (!minimumReward || !rewardHours) return minimumReward;
  const hourlyRate = config.rewardType === "troops"
    ? Math.max(0, safeNumber(productionRates.baseTroopPerHour, productionRates.troopPerHour))
    : Math.max(0, safeNumber(productionRates.baseGoldPerHour, productionRates.goldPerHour));
  return Math.max(minimumReward, Math.floor(hourlyRate * rewardHours));
}

function rollRelicCampItem(dropTable = RELIC_CAMP_DROP_TABLE) {
  const entries = Array.isArray(dropTable) ? dropTable.filter(entry => entry?.itemId && entry.chance > 0) : [];
  const totalChance = entries.reduce((total, entry) => total + Math.max(0, Math.floor(safeNumber(entry.chance, 0))), 0);
  if (!entries.length || totalChance !== 100) {
    throw new HttpsError("internal", "Relic Camp drop table is unavailable.");
  }
  const roll = crypto.randomInt(1, totalChance + 1);
  let cumulativeChance = 0;
  for (const entry of entries) {
    cumulativeChance += Math.max(0, Math.floor(safeNumber(entry.chance, 0)));
    if (roll <= cumulativeChance) return { ...entry };
  }
  return { ...entries[entries.length - 1] };
}

function normalizeRelicCampRewardsToday(claimData = {}, today = "", maxDailyRewards = RELIC_CAMP_DAILY_REWARD_LIMIT) {
  if (safeString(claimData.date, 10) !== today || !Array.isArray(claimData.rewards)) return [];
  const limit = Math.max(1, Math.floor(safeNumber(maxDailyRewards, RELIC_CAMP_DAILY_REWARD_LIMIT)));
  return claimData.rewards.slice(-limit).map(entry => ({
    itemId: safeString(entry?.itemId, 64),
    itemName: safeString(entry?.itemName, 80),
    rarity: safeString(entry?.rarity, 24),
    awardedAtMs: Math.max(0, Math.floor(safeNumber(entry?.awardedAtMs, 0))),
    campId: safeString(entry?.campId, 96),
    campName: safeString(entry?.campName, 80),
  })).filter(entry => entry.itemId && SHOP_ITEMS[entry.itemId]);
}

function getDeedCampCandidateRegionIds(regionId = "") {
  const sourceRegionId = requireKnownWorldRegionId(regionId);
  const connectedRegions = getServerEdgeConnections(sourceRegionId)
    .map(connection => normalizeRegionId(connection.connectsToRegionId))
    .filter((candidateRegionId, index, all) => {
      if (!candidateRegionId || candidateRegionId === sourceRegionId || all.indexOf(candidateRegionId) !== index) return false;
      const mapType = safeString(getServerWorldMap(candidateRegionId)?.type, 32).toLowerCase();
      return mapType === "starter" || mapType === "midgame";
    })
    .slice(0, DEED_CAMP_FALLBACK_REGION_LIMIT);
  return [sourceRegionId, ...connectedRegions];
}

function stableDeedCampChoiceIndex(seed = "", count = 0) {
  const size = Math.max(0, Math.floor(safeNumber(count, 0)));
  if (!size) return -1;
  let hash = 2166136261;
  for (const character of String(seed || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

async function findEligibleDeedCampCity(transaction, camp = {}, holderUid = "", payoutAtMs = 0) {
  for (const regionId of getDeedCampCandidateRegionIds(camp.regionId)) {
    const regularCityIds = getServerWorldRegularCityIds(regionId);
    if (!regularCityIds.size) continue;
    const neutralQuery = db.collection(`islands/${getOnlineIslandId(regionId)}/cities`)
      .where("ownerUid", "==", null)
      .limit(DEED_CAMP_CITY_QUERY_LIMIT);
    const snapshot = await transaction.get(neutralQuery);
    const candidates = snapshot.docs
      .filter(cityDoc => {
        const city = cityDoc.data() || {};
        return regularCityIds.has(cityDoc.id)
          && !getOwnerUid(city)
          && !isStronghold(city)
          && !city.targetType
          && !city.campType;
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    if (!candidates.length) continue;
    const selectedIndex = stableDeedCampChoiceIndex(
      `${camp.id}:${payoutAtMs}:${holderUid}:${regionId}`,
      candidates.length
    );
    const selected = candidates[selectedIndex];
    const city = { id: selected.id, ...selected.data(), regionId };
    const map = getServerWorldMap(regionId);
    return {
      ref: selected.ref,
      city,
      regionId,
      regionName: safeString(map?.label || map?.name || regionId, 80),
    };
  }
  return null;
}

async function resolveRewardCampPayoutByRef(campRef, nowMs = Date.now(), callerUid = "") {
  return db.runTransaction(async transaction => {
    const campSnap = await transaction.get(campRef);
    if (!campSnap.exists) return { ok: true, status: "missing" };
    const camp = getRewardCampCombatTarget({ id: campSnap.id, ...campSnap.data() });
    const config = getRewardCampConfig(camp);
    if (!camp || !config) return { ok: true, status: "unsupported" };
    const holderUid = safeString(camp.holderUid || camp.ownerUid, 128);
    const payoutAtMs = Math.max(0, Math.floor(safeNumber(camp.payoutAtMs, 0)));
    if (!camp.payoutPending || !holderUid || !payoutAtMs) return { ok: true, status: "not-pending" };
    if (payoutAtMs > nowMs) return { ok: true, status: "not-due", payoutAtMs };

    const isDeedCamp = config.rewardType === "city";
    const isRelicCamp = config.rewardType === "item";
    const playerRef = db.doc(`players/${holderUid}`);
    const claimsRef = config.objectiveStatsId
      ? db.doc(`players/${holderUid}/objectiveStats/${config.objectiveStatsId}`)
      : null;
    const playerStatsRef = playerGlobalStatsRef(holderUid);
    const playerSnap = await transaction.get(playerRef);
    const claimsSnap = claimsRef ? await transaction.get(claimsRef) : null;
    const playerStatsSnap = await transaction.get(playerStatsRef);
    const player = playerSnap.exists ? playerSnap.data() || {} : {};
    const rawClaimData = claimsSnap?.exists ? claimsSnap.data() || {} : {};
    const claimData = safeString(rawClaimData.resetGeneration, 120) === RESET_GENERATION ? rawClaimData : {};
    const playerStats = playerStatsSnap.exists ? playerStatsSnap.data() || {} : {};
    const today = getUtcDateKey(nowMs);
    const priorClaims = claimData.date === today
      ? Math.max(0, Math.floor(safeNumber(claimData.count, 0)))
      : 0;
    const deedDailyLimitReached = isDeedCamp && priorClaims >= 1;
    const relicDailyLimitReached = isRelicCamp && priorClaims >= config.maxDailyRewards;
    const priorRelicRewards = isRelicCamp
      ? normalizeRelicCampRewardsToday(claimData, today, config.maxDailyRewards)
      : [];
    const relicRewardItem = isRelicCamp && !relicDailyLimitReached
      ? rollRelicCampItem(config.itemDrops)
      : null;
    let reward = isDeedCamp
      ? deedDailyLimitReached ? 0 : 1
      : isRelicCamp
        ? relicRewardItem ? 1 : 0
        : getRewardCampDailyReward(config, priorClaims, {
            baseGoldPerHour: safeNumber(
              playerStats.untimedGoldPerHour,
              safeNumber(
                player.globalStats?.untimedGoldPerHour,
                safeNumber(playerStats.baseGoldPerHour, playerStats.goldPerHour)
              )
            ),
            baseTroopPerHour: safeNumber(
              playerStats.untimedTroopPerHour,
              safeNumber(
                player.globalStats?.untimedTroopPerHour,
                safeNumber(playerStats.baseTroopPerHour, playerStats.troopPerHour)
              )
            ),
          });
    let nextClaims = isDeedCamp || isRelicCamp
      ? priorClaims
      : Math.min(config.dailyRewards.length, priorClaims + 1);
    if (relicRewardItem) nextClaims = priorClaims + 1;

    const mainCityInfo = getMainCityInfo(player);
    const mainCitySnap = mainCityInfo?.ref ? await transaction.get(mainCityInfo.ref) : null;
    const mainCity = mainCitySnap?.exists ? { id: mainCitySnap.id, ...mainCitySnap.data() } : null;
    const returnSourceCityId = safeString(camp.returnSourceCityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
    const returnSourceRegionId = normalizeRegionId(camp.returnSourceRegionId || camp.regionId);
    const returnSourceRef = returnSourceCityId ? cityRefForRegion(returnSourceRegionId, returnSourceCityId) : null;
    const returnSourceSnap = returnSourceRef ? await transaction.get(returnSourceRef) : null;
    const returnSourceCity = returnSourceSnap?.exists ? { id: returnSourceSnap.id, ...returnSourceSnap.data() } : null;
    const ownedReturnSource = returnSourceCity && getOwnerUid(returnSourceCity) === holderUid
      ? { ...returnSourceCity, regionId: returnSourceRegionId }
      : null;
    const ownedMainCity = mainCity && getOwnerUid(mainCity) === holderUid
      ? { ...mainCity, regionId: mainCityInfo.regionId }
      : null;
    const deedCityAward = isDeedCamp && !deedDailyLimitReached
      ? await findEligibleDeedCampCity(transaction, camp, holderUid, payoutAtMs)
      : null;
    if (isDeedCamp && !deedCityAward) reward = 0;
    if (deedCityAward) nextClaims = priorClaims + 1;
    const returnDestination = ownedReturnSource || ownedMainCity;
    if (!returnDestination) {
      throw new HttpsError("failed-precondition", `${config.name} holder has no owned city available for returning troops.`);
    }
    const returnDestinationRegionId = normalizeRegionId(returnDestination.regionId);
    const returningTroops = Math.max(0, Math.floor(safeNumber(camp.currentGarrison, camp.troops)));
    const troopReward = config.rewardType === "troops" ? reward : 0;
    let returnedTroops = 0;
    let rewardedTroops = 0;
    let mainCityPatch = null;
    const troopRewardDestination = ownedMainCity || returnDestination;
    const troopRewardDestinationRef = ownedMainCity ? mainCityInfo.ref : returnSourceRef;
    if (troopRewardDestination && troopRewardDestinationRef && troopReward > 0) {
      const troopFloat = Math.max(0, safeNumber(troopRewardDestination.troopFloat, troopRewardDestination.troops || 0)) + troopReward;
      mainCityPatch = {
        id: troopRewardDestination.id,
        regionId: normalizeRegionId(troopRewardDestination.regionId),
        troops: Math.floor(troopFloat),
        troopFloat,
        productionUpdatedAtMs: nowMs,
      };
      transaction.set(troopRewardDestinationRef, cleanCityUpdate(troopRewardDestination, {
        troops: mainCityPatch.troops,
        troopFloat: mainCityPatch.troopFloat,
        productionUpdatedAtMs: mainCityPatch.productionUpdatedAtMs,
      }), { merge: true });
      rewardedTroops = troopReward;
    }

    let returnArmy = null;
    if (returningTroops > 0) {
      const route = getCampReturnRoute(camp, returnDestination);
      const returnArmyId = safeString(`camp_return_${camp.id}_${payoutAtMs}_${holderUid}`, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
      const duration = calculateTravelTime({
        pathLength: route.pathLength,
        troopCount: returningTroops,
        kind: "transfer",
        speedMultiplier: skillMultiplier(player, "marchOrders"),
      });
      returnArmy = {
        id: returnArmyId,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        ownerKind: "player",
        ownerUid: holderUid,
        ownerName: normalizePlayerName(player.playerName || camp.holderName, "Ruler"),
        ownerFlag: player.flag || camp.holderFlag || null,
        ownerKingPower: Math.max(0, Math.floor(safeNumber(
          player.globalStats?.kingPower,
          safeNumber(player.kingPower, 0)
        ))),
        kind: "transfer",
        campReturn: true,
        campId: camp.id,
        targetType: "city",
        fromId: camp.id,
        toId: returnDestination.id,
        fromName: camp.name || config.name,
        toName: returnDestination.name || "Main city",
        troops: returningTroops,
        requestedTroops: returningTroops,
        total: duration,
        path: route.path,
        pathSegments: route.pathSegments,
        routeRegionIds: route.routeRegionIds,
        viewRegionIds: route.routeRegionIds,
        pathLength: route.pathLength,
        targetKey: `${returnDestinationRegionId}:${returnDestination.id}`,
        targetOwnerAtLaunch: "player",
        targetOwnerUid: holderUid,
        sourceRegionId: normalizeRegionId(camp.regionId),
        targetRegionId: returnDestinationRegionId,
        launchedAtMs: nowMs,
        arrivesAtMs: nowMs + Math.ceil(duration * 1000),
        status: "active",
        createdByServer: true,
        serverAuthorityVersion: 2,
      };
      writeArmyMovementCopies(transaction, returnArmy, { includeCreatedAt: true });
    }

    let deedCityPatch = null;
    let deedHistoryEntry = null;
    if (deedCityAward) {
      const playerName = normalizePlayerName(player.playerName || camp.holderName, "Ruler");
      const deedCityName = getServerCanonicalCityName(deedCityAward.city, deedCityAward.regionId);
      const playerKingPower = Math.max(0, Math.floor(safeNumber(
        player.globalStats?.kingPower,
        safeNumber(player.kingPower, 0)
      )));
      const itemEffects = normalizeItemEffects(player.itemEffects);
      const activeShieldExpiresAtMs = itemEffects.shieldExpiresAtMs > nowMs
        ? itemEffects.shieldExpiresAtMs
        : 0;
      deedCityPatch = {
        id: deedCityAward.city.id,
        name: deedCityName,
        regionId: deedCityAward.regionId,
        ownerKind: "player",
        ownerUid: holderUid,
        ownerName: playerName,
        ownerFlag: player.flag || camp.holderFlag || null,
        ownerKingPower: playerKingPower,
        ownerShieldExpiresAtMs: activeShieldExpiresAtMs,
        troops: 0,
        troopFloat: 0,
        level: clampCityLevel(deedCityAward.city.level || 1),
        defense: 1,
        investedGold: 0,
        productionUpdatedAtMs: nowMs,
        lastCapturedAtMs: nowMs,
        isMainCity: false,
        relinquishedAtMs: 0,
        relocatedAtMs: 0,
        deedAwardedAtMs: nowMs,
        deedCampId: camp.id,
      };
      transaction.set(
        deedCityAward.ref,
        cleanCityUpdate(deedCityAward.city, deedCityPatch),
        { merge: true }
      );
      writeOwnershipChangeEvent(transaction, {
        eventId: `camp_payout_${camp.id}_city_${deedCityAward.city.id}_${payoutAtMs}`,
        targetType: "city",
        targetId: deedCityAward.city.id,
        regionId: deedCityAward.regionId,
        beforeOwnerUid: getOwnerUid(deedCityAward.city),
        afterOwnerUid: holderUid,
        reason: "deed_city_awarded",
        nowMs,
      });
      deedHistoryEntry = {
        campId: camp.id,
        cityId: deedCityAward.city.id,
        cityName: safeString(deedCityName, 80),
        regionId: deedCityAward.regionId,
        regionName: deedCityAward.regionName,
        awardedToPlayerId: holderUid,
        awardedToDisplayName: playerName,
        awardedAtMs: nowMs,
        source: "deed_camp",
      };
      const historyId = safeString(`${payoutAtMs}_${deedCityAward.city.id}`, 160).replace(/[^a-zA-Z0-9_-]/g, "_");
      transaction.set(db.doc(`${campRef.path}/rewardHistory/${historyId}`), {
        ...deedHistoryEntry,
        awardedAt: FieldValue.serverTimestamp(),
      });
    }

    let relicRewardEntry = null;
    let rewardedShopItems = null;
    if (relicRewardItem) {
      rewardedShopItems = normalizeShopItems(player.shopItems);
      rewardedShopItems[relicRewardItem.itemId] = Math.max(
        0,
        Math.floor(safeNumber(rewardedShopItems[relicRewardItem.itemId], 0))
      ) + 1;
      relicRewardEntry = {
        itemId: relicRewardItem.itemId,
        itemName: relicRewardItem.itemName,
        rarity: relicRewardItem.rarity,
        awardedAtMs: nowMs,
        campId: camp.id,
        campName: camp.name || config.name,
      };
    }
    const relicRewardsToday = isRelicCamp
      ? [...priorRelicRewards, ...(relicRewardEntry ? [relicRewardEntry] : [])]
          .slice(-Math.max(1, Math.floor(safeNumber(config.maxDailyRewards, RELIC_CAMP_DAILY_REWARD_LIMIT))))
      : [];

    const baseDefenders = Math.max(1, Math.floor(safeNumber(camp.baseDefenders, config.baseDefenders)));
    const activeArmyIds = normalizeActiveArmyIds(camp.activeArmyIds);
    const campPatch = {
      holderUid: "",
      holderName: "",
      holderFlag: null,
      heldSinceMs: 0,
      payoutAtMs: 0,
      payoutPending: false,
      currentGarrison: baseDefenders,
      returnSourceCityId: "",
      returnSourceRegionId: "",
      returnSourceCityName: "",
      returnPathSegments: [],
      returnRouteRegionIds: [],
      returnPathLength: 0,
      activeArmyIds,
      dailyRewardClaims: {
        lastHolderUid: holderUid,
        lastClaimDate: today,
        lastClaimNumber: nextClaims,
        lastReward: reward,
        ...(deedCityPatch ? { lastAwardedCityId: deedCityPatch.id } : {}),
        ...(relicRewardEntry ? { lastRewardItemId: relicRewardEntry.itemId } : {}),
      },
      lastResetDate: today,
      lastPaidAtMs: nowMs,
      state: getRewardCampState(activeArmyIds, ""),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(campRef, campPatch, { merge: true });
    writeOwnershipChangeEvent(transaction, {
      eventId: `camp_payout_${camp.id}_${payoutAtMs}`,
      targetType: "camp",
      targetId: camp.id,
      regionId: camp.regionId,
      beforeOwnerUid: holderUid,
      afterOwnerUid: "",
      reason: "camp_payout_completed",
      nowMs,
    });
    if (claimsRef) {
      transaction.set(claimsRef, {
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        date: today,
        count: nextClaims,
        lastReward: reward,
        lastCampId: camp.id,
        lastClaimedAtMs: nowMs,
        ...(isRelicCamp ? {
          rewards: relicRewardsToday,
          maxDailyRewards: config.maxDailyRewards,
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const goldReward = config.rewardType === "gold" ? reward : 0;
    const nextGoldFloat = Math.max(0, safeNumber(player.goldFloat, player.gold || 0)) + goldReward;
    const nextGold = Math.floor(nextGoldFloat);
    const holdMinutes = Math.floor(config.holdDurationMs / 60000);
    const rewardLabel = isDeedCamp
      ? deedCityPatch
        ? `${deedHistoryEntry.cityName} in ${deedHistoryEntry.regionName}`
        : "no eligible neutral city"
      : isRelicCamp
        ? relicRewardEntry
          ? `${relicRewardEntry.itemName} (${relicRewardEntry.rarity})`
          : "no item"
      : config.rewardType === "troops"
        ? `${reward.toLocaleString()} troops`
        : `${reward.toLocaleString()} gold`;
    const returnSummary = returnArmy
      ? ` ${returningTroops.toLocaleString()} stationed troops began marching to ${returnDestination.name || "your main city"}.`
      : "";
    const reportCity = deedCityAward
      ? { ...deedCityAward.city, ...deedCityPatch, regionId: deedCityAward.regionId }
      : camp;
    const reportSummary = isDeedCamp
      ? deedDailyLimitReached
        ? `Held ${camp.name || config.name} for ${holdMinutes} minutes, but you already received a Deed Camp city today. The camp reset to neutral.${returnSummary}`
        : deedCityPatch
        ? `Held ${camp.name || config.name} for ${holdMinutes} minutes and received ${rewardLabel}. No battle XP was awarded.${returnSummary}`
        : `Held ${camp.name || config.name} for ${holdMinutes} minutes, but no eligible neutral city was available. The camp reset to neutral.${returnSummary}`
      : isRelicCamp
        ? relicDailyLimitReached
          ? `Held ${camp.name || config.name} for ${holdMinutes} minutes, but the daily limit of ${config.maxDailyRewards} Relic Camp rewards was already reached. The camp reset to neutral.${returnSummary}`
          : `Held ${camp.name || config.name} for ${holdMinutes} minutes and received ${rewardLabel}. The item was added to your bag.${returnSummary}`
      : reward > 0
        ? `Held ${camp.name || config.name} for ${holdMinutes} minutes and earned ${rewardLabel}.${returnSummary}`
        : `Held ${camp.name || config.name} for ${holdMinutes} minutes. Today's ${config.name} reward limit has been reached.${returnSummary}`;
    const report = makeReport({
      id: `${camp.id}_hold_${nowMs}_${holderUid}`,
      uid: holderUid,
      type: "defense",
      outcome: "held",
      city: reportCity,
      opponentName: config.name,
      troopCount: returningTroops,
      result: { survivors: returningTroops, defendersLeft: 0, returning: Boolean(returnArmy) },
      totalDefense: 0,
      summary: reportSummary,
      goldAwarded: goldReward,
      troopsAwarded: rewardedTroops,
      goldAfter: nextGold,
      nowMs,
    });
    writeReport(transaction, holderUid, report, playerSnap, {
      ...(config.rewardType === "gold" ? {
        gold: nextGold,
        goldFloat: nextGoldFloat,
      } : {}),
      ...(rewardedShopItems ? { shopItems: rewardedShopItems } : {}),
    });
    transaction.set(islandReportRef(camp.regionId, report.id), {
      ...report,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      ok: true,
      status: isDeedCamp
        ? deedDailyLimitReached
          ? "daily-limit"
          : !deedCityPatch
            ? "no-eligible-city"
            : "paid"
        : isRelicCamp && relicDailyLimitReached
          ? "daily-limit"
          : "paid",
      holderUid,
      reward,
      rewardType: config.rewardType,
      campType: config.campType,
      dailyClaim: nextClaims,
      awardedCity: deedCityPatch ? {
        id: deedCityPatch.id,
        name: deedHistoryEntry.cityName,
        regionId: deedHistoryEntry.regionId,
        regionName: deedHistoryEntry.regionName,
      } : null,
      rewardHistoryEntry: deedHistoryEntry,
      rewardHistoryLimit: DEED_CAMP_HISTORY_LIMIT,
      rewardItem: relicRewardEntry,
      rewardsToday: relicRewardsToday,
      maxDailyRewards: isRelicCamp ? config.maxDailyRewards : 0,
      returnedTroops,
      returningTroops,
      returnArmyId: returnArmy?.id || "",
      returnDestinationId: returnArmy?.toId || "",
      returnDestinationRegionId: returnArmy?.targetRegionId || "",
      returnArrivesAtMs: returnArmy?.arrivesAtMs || 0,
      movement: returnArmy,
      rewardedTroops,
      campUpdate: campUpdateForClient(camp.id, camp.regionId, campPatch),
      cityUpdates: [deedCityPatch, mainCityPatch].filter(Boolean),
      currentUser: callerUid === holderUid && (config.rewardType === "gold" || rewardedShopItems)
        ? {
            ...(config.rewardType === "gold" ? { gold: nextGold, goldFloat: nextGoldFloat } : {}),
            ...(rewardedShopItems ? { shopItems: rewardedShopItems } : {}),
          }
        : null,
    };
  });
}

async function resolveRewardCampPayoutAndStats(campRef, nowMs = Date.now(), callerUid = "") {
  const result = await resolveRewardCampPayoutByRef(campRef, nowMs, callerUid);
  if (["paid", "no-eligible-city", "daily-limit"].includes(result?.status) && result.holderUid) {
    const rebuilt = await rebuildGlobalStatsForPlayer(result.holderUid);
    if (callerUid === result.holderUid) result.globalStats = rebuilt.stats;
  }
  return result;
}

exports.resolveRewardCampPayout = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const callerUid = requireAuth(request);
  const data = request.data || {};
  const campId = safeString(data.campId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const regionId = normalizeRegionId(data.regionId || data.mapId);
  if (!campId || !regionId) throw new HttpsError("invalid-argument", "Missing reward camp location.");
  return resolveRewardCampPayoutAndStats(campRefForRegion(regionId, campId), Date.now(), callerUid);
});

exports.resolveGoldCampPayout = exports.resolveRewardCampPayout;

exports.recallRewardCampGarrison = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const campId = safeString(data.campId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const regionId = requireKnownWorldRegionId(data.regionId || data.mapId);
  if (!campId || !getServerWorldCampIds(regionId).has(campId)) {
    throw new HttpsError("invalid-argument", "Choose a valid reward camp.");
  }

  const campRef = campRefForRegion(regionId, campId);
  const playerRef = db.doc(`players/${uid}`);
  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const [campSnap, playerSnap] = await Promise.all([
      transaction.get(campRef),
      transaction.get(playerRef),
    ]);
    if (!campSnap.exists) throw new HttpsError("not-found", "That reward camp was not found.");
    if (!playerSnap.exists) throw new HttpsError("not-found", "Your player profile was not found.");

    const rawCamp = { id: campSnap.id, ...campSnap.data() };
    const camp = getRewardCampCombatTarget(rawCamp);
    const config = getRewardCampConfig(camp);
    if (!camp || !config) throw new HttpsError("failed-precondition", "That objective is not a reward camp.");
    const holderUid = safeString(rawCamp.holderUid || rawCamp.ownerUid, 128);
    if (holderUid !== uid) throw new HttpsError("permission-denied", "Only the current camp holder can recall its troops.");
    if (!rawCamp.payoutPending) throw new HttpsError("failed-precondition", "That camp hold is no longer active.");
    const payoutAtMs = Math.max(0, Math.floor(safeNumber(rawCamp.payoutAtMs, 0)));
    if (payoutAtMs > 0 && payoutAtMs <= nowMs) {
      throw new HttpsError("failed-precondition", "That camp hold has already finished and is awaiting payout.");
    }

    const player = playerSnap.data() || {};
    const sourceCityId = safeString(rawCamp.returnSourceCityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
    const sourceRegionId = normalizeRegionId(rawCamp.returnSourceRegionId || regionId);
    const sourceRef = sourceCityId ? cityRefForRegion(sourceRegionId, sourceCityId) : null;
    const mainCityInfo = getMainCityInfo(player);
    const destinationRefs = new Map();
    if (sourceRef) destinationRefs.set(sourceRef.path, sourceRef);
    if (mainCityInfo?.ref) destinationRefs.set(mainCityInfo.ref.path, mainCityInfo.ref);
    const destinationSnaps = await Promise.all([...destinationRefs.values()].map(ref => transaction.get(ref)));
    const destinations = new Map(destinationSnaps.map(snapshot => [snapshot.ref.path, snapshot]));
    const sourceSnap = sourceRef ? destinations.get(sourceRef.path) : null;
    const mainCitySnap = mainCityInfo?.ref ? destinations.get(mainCityInfo.ref.path) : null;
    const sourceCity = sourceSnap?.exists ? { id: sourceSnap.id, ...sourceSnap.data() } : null;
    const mainCity = mainCitySnap?.exists ? { id: mainCitySnap.id, ...mainCitySnap.data() } : null;
    const returnDestination = sourceCity && getOwnerUid(sourceCity) === uid
      ? sourceCity
      : mainCity && getOwnerUid(mainCity) === uid
        ? mainCity
        : null;
    if (!returnDestination) {
      throw new HttpsError("failed-precondition", "No owned city is available to receive the recalled troops.");
    }

    const returnDestinationRegionId = normalizeRegionId(
      returnDestination.regionId
      || (returnDestination.id === mainCity?.id ? mainCityInfo?.regionId : sourceRegionId)
    );
    const returningTroops = Math.max(0, Math.floor(safeNumber(rawCamp.currentGarrison, rawCamp.troops)));
    let movement = null;
    if (returningTroops > 0) {
      const route = getCampReturnRoute(rawCamp, returnDestination);
      const armyId = safeString(`camp_recall_${camp.id}_${nowMs}_${uid}`, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
      const duration = calculateTravelTime({
        pathLength: route.pathLength,
        troopCount: returningTroops,
        kind: "transfer",
        speedMultiplier: skillMultiplier(player, "marchOrders"),
      });
      movement = {
        id: armyId,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        ownerKind: "player",
        ownerUid: uid,
        ownerName: normalizePlayerName(player.playerName || rawCamp.holderName, "Ruler"),
        ownerFlag: player.flag || rawCamp.holderFlag || null,
        ownerKingPower: Math.max(0, Math.floor(safeNumber(
          player.globalStats?.kingPower,
          safeNumber(player.kingPower, 0)
        ))),
        kind: "transfer",
        campReturn: true,
        campRecall: true,
        campId: camp.id,
        targetType: "city",
        fromId: camp.id,
        toId: returnDestination.id,
        fromName: camp.name || config.name,
        toName: returnDestination.name || "Main city",
        troops: returningTroops,
        requestedTroops: returningTroops,
        total: duration,
        path: route.path,
        pathSegments: route.pathSegments,
        routeRegionIds: route.routeRegionIds,
        viewRegionIds: route.routeRegionIds,
        pathLength: route.pathLength,
        targetKey: `${returnDestinationRegionId}:${returnDestination.id}`,
        targetOwnerAtLaunch: "player",
        targetOwnerUid: uid,
        sourceRegionId: regionId,
        targetRegionId: returnDestinationRegionId,
        launchedAtMs: nowMs,
        arrivesAtMs: nowMs + Math.ceil(duration * 1000),
        status: "active",
        createdByServer: true,
        serverAuthorityVersion: 2,
      };
      writeArmyMovementCopies(transaction, movement, { includeCreatedAt: true });
    }

    const activeArmyIds = normalizeActiveArmyIds(rawCamp.activeArmyIds);
    const campPatch = {
      holderUid: "",
      holderName: "",
      holderFlag: null,
      heldSinceMs: 0,
      payoutAtMs: 0,
      payoutPending: false,
      currentGarrison: Math.max(1, Math.floor(safeNumber(rawCamp.baseDefenders, config.baseDefenders))),
      returnSourceCityId: "",
      returnSourceRegionId: "",
      returnSourceCityName: "",
      returnPathSegments: [],
      returnRouteRegionIds: [],
      returnPathLength: 0,
      activeArmyIds,
      state: getRewardCampState(activeArmyIds, ""),
      lastRecalledAtMs: nowMs,
      lastRecalledByUid: uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(campRef, campPatch, { merge: true });
    writeOwnershipChangeEvent(transaction, {
      eventId: `camp_recall_${camp.id}_${nowMs}`,
      targetType: "camp",
      targetId: camp.id,
      regionId,
      beforeOwnerUid: uid,
      afterOwnerUid: "",
      reason: "camp_recalled",
      nowMs,
    });

    return {
      ok: true,
      status: "recalled",
      targetType: "camp",
      kind: "return",
      returningTroops,
      returnDestinationId: returnDestination.id,
      returnDestinationRegionId,
      returnDestinationName: returnDestination.name || "Main city",
      returnArrivesAtMs: movement?.arrivesAtMs || 0,
      movement,
      campUpdate: campUpdateForClient(camp.id, regionId, campPatch),
    };
  });
});

function getScheduledArmyTarget(doc = null) {
  if (!doc) return null;
  const data = doc.data() || {};
  const armyId = safeString(data.id || doc.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const routeRegionIds = normalizeRegionIds(data.routeRegionIds || []);
  const sourceRegionId = data.sourceRegionId ? normalizeRegionId(data.sourceRegionId) : "";
  const targetRegionId = data.targetRegionId ? normalizeRegionId(data.targetRegionId) : "";
  if (sourceRegionId && !routeRegionIds.includes(sourceRegionId)) routeRegionIds.push(sourceRegionId);
  if (targetRegionId && !routeRegionIds.includes(targetRegionId)) routeRegionIds.push(targetRegionId);
  if (!armyId || !routeRegionIds.length) return null;
  return {
    armyId,
    requestedRegions: [...new Set(routeRegionIds)],
    ownerUid: getOwnerUid(data),
    arrivesAtMs: Math.max(0, Math.floor(safeNumber(data.arrivesAtMs, 0))),
  };
}

async function loadDueArmyTargets(nowMs = Date.now()) {
  // Canonical army documents predate the current fresh reset, so current-world
  // marches always have a root entry. Island army documents are projections and
  // must not be scanned again by the scheduler.
  const canonicalSnap = await db.collection("armies")
    .where("status", "==", "active")
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .where("arrivesAtMs", "<=", nowMs)
    .orderBy("arrivesAtMs", "asc")
    .limit(SCHEDULED_ARMY_RESOLVE_SCAN_LIMIT)
    .get();
  return canonicalSnap.docs
    .map(getScheduledArmyTarget)
    .filter(Boolean)
    .sort((a, b) => a.arrivesAtMs - b.arrivesAtMs)
    .slice(0, SCHEDULED_ARMY_RESOLVE_MAX_PER_RUN);
}

function isExpectedScheduledResolveError(error = {}) {
  const code = String(error.code || "");
  const message = String(error.message || error || "");
  return code === "failed-precondition" && /not arrived/i.test(message);
}

async function processWithConcurrency(items = [], concurrency = 1, worker) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), queue.length || 1) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function backfillActiveArmyVisibilityViews() {
  const markerRef = db.doc(`serverConfig/armyTroopVisibilityV${ARMY_TROOP_VISIBILITY_VERSION}-${RESET_GENERATION}`);
  const markerSnap = await markerRef.get();
  const marker = markerSnap.exists ? markerSnap.data() || {} : {};
  if (
    marker.complete === true
    && safeString(marker.worldId, 128) === ONLINE_WORLD_ID
    && safeNumber(marker.version, 0) === ARMY_TROOP_VISIBILITY_VERSION
  ) {
    return { complete: true, processed: 0, cursor: safeString(marker.cursor, 96) };
  }

  let query = db.collection("armies")
    .where("status", "==", "active")
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .orderBy(FieldPath.documentId())
    .limit(ARMY_TROOP_ESTIMATE_BACKFILL_PAGE_SIZE);
  const cursor = safeString(marker.cursor, 96);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();

  await processWithConcurrency(snapshot.docs, 8, async armyDoc => {
    await db.runTransaction(async transaction => {
      const currentSnap = await transaction.get(armyDoc.ref);
      if (!currentSnap.exists) return;
      const army = { id: currentSnap.id, ...currentSnap.data() };
      if (
        army.status !== "active"
        || safeString(army.worldId, 128) !== ONLINE_WORLD_ID
        || safeString(army.resetGeneration, 128) !== RESET_GENERATION
      ) return;
      writeArmyMovementCopies(transaction, army, {
        previousTargetOwnerUid: army.targetOwnerUid,
      });
    });
  });

  const nextCursor = snapshot.docs.at(-1)?.id || cursor;
  const complete = snapshot.size < ARMY_TROOP_ESTIMATE_BACKFILL_PAGE_SIZE;
  await markerRef.set({
    version: ARMY_TROOP_VISIBILITY_VERSION,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    cursor: nextCursor,
    complete,
    processed: Math.max(0, Math.floor(safeNumber(marker.processed, 0))) + snapshot.size,
    updatedAtMs: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { complete, processed: snapshot.size, cursor: nextCursor };
}

exports.maintainGameServer = onSchedule({
  region: "us-central1",
  schedule: "every 1 minutes",
  timeZone: "Etc/UTC",
  maxInstances: 1,
  timeoutSeconds: 120,
  memory: "256MiB",
}, async () => {
  const [result, armyVisibilityBackfill] = await Promise.all([
    maintainGameServer(Date.now()),
    backfillActiveArmyVisibilityViews(),
  ]);
  console.log("Crownlands realm capacity maintained", { ...result, armyVisibilityBackfill });
});

exports.resolveDueArmyOrders = onSchedule({
  region: "us-central1",
  schedule: "every 1 minutes",
  timeZone: "Etc/UTC",
  maxInstances: 1,
  timeoutSeconds: 180,
  memory: "256MiB",
}, async () => {
  const nowMs = Date.now();
  const targets = await loadDueArmyTargets(nowMs);
  let resolved = 0;
  let skipped = 0;
  let failed = 0;

  await processWithConcurrency(targets, SCHEDULED_ARMY_RESOLVE_CONCURRENCY, async target => {
    try {
      const result = await resolveArmyOrderById({
        armyId: target.armyId,
        requestedRegions: target.requestedRegions,
        callerUid: "",
        nowMs,
      });
      if (result?.status === "resolved") resolved += 1;
      else skipped += 1;
    } catch (error) {
      if (isExpectedScheduledResolveError(error)) {
        skipped += 1;
        return;
      }
      failed += 1;
      console.error("Scheduled army resolution failed", {
        armyId: target.armyId,
        ownerUid: target.ownerUid,
        requestedRegions: target.requestedRegions,
        message: error?.message || String(error),
        code: error?.code || "",
      });
    }
  });

  console.log("Scheduled army resolution finished", {
    releaseId: REALM_RELEASE_ID,
    resetGeneration: RESET_GENERATION,
    scanned: targets.length,
    resolved,
    skipped,
    failed,
  });
});

exports.resolveDueRewardCampPayouts = onSchedule({
  region: "us-central1",
  schedule: "every 1 minutes",
  timeZone: "Etc/UTC",
  maxInstances: 1,
  timeoutSeconds: 120,
  memory: "256MiB",
}, async () => {
  const nowMs = Date.now();
  const due = await db.collectionGroup("camps")
    .where("payoutPending", "==", true)
    .where("resetGeneration", "==", RESET_GENERATION)
    .where("worldId", "==", ONLINE_WORLD_ID)
    .where("payoutAtMs", "<=", nowMs)
    .limit(REWARD_CAMP_PAYOUT_SCAN_LIMIT)
    .get();
  let paid = 0;
  let skipped = 0;
  let failed = 0;
  for (const campDoc of due.docs) {
    try {
      const result = await resolveRewardCampPayoutAndStats(campDoc.ref, nowMs, "");
      if (result?.status === "paid") paid += 1;
      else {
        skipped += 1;
        if (result?.status === "no-eligible-city") {
          console.warn("Deed Camp payout reset without an eligible neutral city", {
            campId: campDoc.id,
            holderUid: result.holderUid || "",
          });
        }
      }
    } catch (error) {
      failed += 1;
      console.error("Scheduled reward camp payout failed", {
        campId: campDoc.id,
        message: error?.message || String(error),
        code: error?.code || "",
      });
    }
  }
  console.log("Scheduled reward camp payouts finished", { scanned: due.size, paid, skipped, failed });
});
