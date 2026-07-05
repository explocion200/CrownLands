const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const RESET_GENERATION = "fresh-2026-07-03-profile-reset";
const ONLINE_WORLD_ID = `main-${RESET_GENERATION}`;
const MAX_CITY_LEVEL = 100;
const TEST_STARTING_GOLD = 500;
const MILLION_LORDS_CITY_COST_BASE = 50;
const MILLION_LORDS_CITY_COST_GROWTH = 1.2;
const MILLION_LORDS_CITY_PRODUCTION_VP_BASE = 20;
const MILLION_LORDS_CITY_PRODUCTION_VP_GROWTH = 1.115;
const MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP = 15;
const BASE_TROOP_ATTACK_POWER = 2;
const DEFAULT_MARCH_PERCENT = 0.5;
const DAILY_NEUTRAL_CAPTURE_LIMIT = 30;
const SCOUT_REPORT_SECONDS = 120;
const ARMY_TRAVEL_SECONDS_PER_MAP_UNIT = 0.13;
const ARMY_TRAVEL_MIN_SECONDS = 30;
const ARMY_TRAVEL_SCOUT_MIN_SECONDS = 10;
const ARMY_TRAVEL_MAX_SECONDS = 1800;
const ARMY_TRAVEL_KIND_MULTIPLIERS = { scout: 0.35, transfer: 0.95, attack: 1 };
const ARMY_TRAVEL_TROOP_BAND_LIMITS = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000];
const ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS = [1, 1.18, 1.38, 1.62, 1.9, 2.24, 2.62, 3.06, 3.5];
const CAPTURE_XP_BASE = 120;
const CAPTURE_XP_PER_CITY_LEVEL = 45;
const CAPTURE_XP_PER_DEFENDER = 1.5;
const ENEMY_CAPTURE_XP_BONUS = 300;
const DEFENSE_HELD_XP_BASE = 80;
const DEFENSE_HELD_XP_PER_ATTACKER = 0.45;
const FAILED_BATTLE_XP_RATE = 1 / 3;
const BATTLE_XP_TROOP_CREDIT_CITY_WALL_MULTIPLIER = 1;
const BATTLE_XP_TROOP_CREDIT_VP_MULTIPLIER = 2;
const BATTLE_XP_LEVEL_REQUIREMENT_CAP_MULTIPLIER = 3;
const KILL_GOLD_BASE = 5;
const DEMO_ATTACK_MIN_POWER_RATIO = 3;
const DEMO_ATTACK_DEFENDER_XP_MULTIPLIER = 2;
const DEMO_ATTACK_TIERS = [
  { minRatio: 10, label: "Severe Demo Attack", troopCapPercent: 30, attackPowerPercent: 30, travelMultiplier: 2.5 },
  { minRatio: 5, label: "Heavy Demo Attack", troopCapPercent: 40, attackPowerPercent: 40, travelMultiplier: 2 },
  { minRatio: DEMO_ATTACK_MIN_POWER_RATIO, label: "Demo Attack", troopCapPercent: 50, attackPowerPercent: 50, travelMultiplier: 1.6 },
];
const KING_POWER_PER_TROOP = 1;
const KING_POWER_PER_CITY_VP = 10;
const LEVEL_UP_TROOP_REWARD_BASE = 50;
const LEVEL_UP_TROOP_REWARD_MULTIPLIER = 1.15;
const CHARACTER_START_LEVEL = 1;
const CHARACTER_START_XP = 0;
const CITY_UPGRADE_XP_BASE = 18;
const CITY_UPGRADE_XP_PER_LEVEL = 4;
const ROYAL_PEACE_SHIELD_ITEM_ID = "shield_12h";
const ROYAL_PEACE_SHIELD_DURATION_MS = 12 * 60 * 60 * 1000;
const WAR_DRUMS_ITEM_ID = "war_drums_30m";
const WAR_DRUMS_DURATION_MS = 30 * 60 * 1000;
const WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT = 25;
const VEIL_OF_SILENCE_ITEM_ID = "veil_of_silence_30m";
const VEIL_OF_SILENCE_DURATION_MS = 5 * 60 * 1000;
const MAX_SERVER_PRODUCTION_SECONDS = 7 * 24 * 60 * 60;
const SCHEDULED_ARMY_RESOLVE_SCAN_LIMIT = 100;
const SCHEDULED_ARMY_RESOLVE_MAX_PER_RUN = 40;
const SHOP_ITEMS = {
  [ROYAL_PEACE_SHIELD_ITEM_ID]: { id: ROYAL_PEACE_SHIELD_ITEM_ID, label: "Royal Peace Shield", cost: 175000 },
  [WAR_DRUMS_ITEM_ID]: { id: WAR_DRUMS_ITEM_ID, label: "War Drums", cost: 25000 },
  [VEIL_OF_SILENCE_ITEM_ID]: { id: VEIL_OF_SILENCE_ITEM_ID, label: "Veil of Silence", cost: 40000 },
  swift_march_order: { id: "swift_march_order", label: "Swift March Order", cost: 55000 },
  recall_horn: { id: "recall_horn", label: "Recall Horn", cost: 90000 },
};
const LEGACY_SHOP_ITEM_IDS = ["troop_boost_1h", "anti_scout_1h"];
const CITY_LEVEL_STATS = {
  victoryPointsBase: 6,
  victoryPointsPerLevel: 4,
  victoryPointsExponent: 1.35,
  victoryPointsExponentScale: 2,
  defensePercentPerLevel: 3,
  cityWallsBase: 30,
  cityWallsPerLevel: 32,
  troopProductionPerVictoryPoint: 3,
};
const SKILL_CONFIG = {
  swordmastery: { percentPerLevel: 2, maxPercent: 60 },
  stoneworks: { percentPerLevel: 3, maxPercent: 75 },
  taxStewardship: { percentPerLevel: 3, maxPercent: 75 },
  royalGranaries: { percentPerLevel: 3, maxPercent: 75 },
  guildCharters: { percentPerLevel: 2, maxPercent: 50 },
  marchOrders: { percentPerLevel: 3, maxPercent: 60 },
  fieldMedics: { percentPerLevel: 2, maxPercent: 50 },
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
const SKILL_RESET_COST = 1_000_000;
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

function requireAuth(request) {
  const uid = request.auth?.uid || "";
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before sending troops.");
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
  return clampInt(level, 1, MAX_CITY_LEVEL);
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
  return Math.max(0, Math.floor(rawValue + 0.000001));
}

function getMillionLordsPassiveGoldPerHour(level) {
  return Math.floor(getMillionLordsCityProductionVp(level) * MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP);
}

function getCityProductionStats(city = {}, profile = {}, bonuses = {}) {
  const stronghold = isStronghold(city);
  const level = stronghold ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level);
  const victoryPoints = Math.floor(
    CITY_LEVEL_STATS.victoryPointsBase
      + level * CITY_LEVEL_STATS.victoryPointsPerLevel
      + Math.pow(level, CITY_LEVEL_STATS.victoryPointsExponent) * CITY_LEVEL_STATS.victoryPointsExponentScale
  );
  const royalGranariesPercent = getSkillPercent(profile, "royalGranaries");
  const taxStewardshipPercent = getSkillPercent(profile, "taxStewardship");
  const warDrumsExpiresAtMs = Math.max(0, Math.floor(safeNumber(profile?.itemEffects?.warDrumsExpiresAtMs, 0)));
  const warDrumsTroopBonusPercent = !stronghold && warDrumsExpiresAtMs > Date.now()
    ? WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT
    : 0;
  const baseTroopProductionPerHour = stronghold ? 0 : victoryPoints * CITY_LEVEL_STATS.troopProductionPerVictoryPoint;
  const troopProductionPerHour = baseTroopProductionPerHour
    * (1 + royalGranariesPercent / 100)
    * (1 + Math.max(0, safeNumber(bonuses.troopBonusPercent, 0)) / 100)
    * (1 + warDrumsTroopBonusPercent / 100);
  const rawGoldProductionPerHour = stronghold ? 0 : getMillionLordsPassiveGoldPerHour(level);
  const goldProductionPerHour = rawGoldProductionPerHour
    * (1 + taxStewardshipPercent / 100)
    * (1 + Math.max(0, safeNumber(bonuses.goldBonusPercent, 0)) / 100);

  return {
    level,
    victoryPoints,
    troopProductionPerHour,
    goldProductionPerHour,
    troopProductionPerSecond: troopProductionPerHour / 3600,
    goldProductionPerSecond: goldProductionPerHour / 3600,
  };
}

function getCityStats(city = {}, defenderProfile = null, bonuses = {}) {
  const stronghold = isStronghold(city);
  const level = stronghold ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level);
  const step = level - 1;
  const victoryPoints = Math.floor(
    CITY_LEVEL_STATS.victoryPointsBase
      + level * CITY_LEVEL_STATS.victoryPointsPerLevel
      + Math.pow(level, CITY_LEVEL_STATS.victoryPointsExponent) * CITY_LEVEL_STATS.victoryPointsExponentScale
  );
  const defensePercent = level * CITY_LEVEL_STATS.defensePercentPerLevel;
  const baseCityWalls = CITY_LEVEL_STATS.cityWallsBase + step * CITY_LEVEL_STATS.cityWallsPerLevel;
  const stoneworksPercent = defenderProfile ? getSkillPercent(defenderProfile, "stoneworks") : 0;
  const cityWalls = Math.floor(baseCityWalls * (1 + stoneworksPercent / 100));
  const troopDefense = Math.floor((Math.max(0, Math.floor(safeNumber(city.troops, 0)))) * (1 + defensePercent / 100));
  const baseTotalDefense = Math.floor(cityWalls + troopDefense);
  const strongholdDefenseBonusPercent = !stronghold ? Math.max(0, safeNumber(bonuses.cityDefenseBonusPercent, 0)) : 0;
  const strongholdDefenseBonus = Math.floor(baseTotalDefense * strongholdDefenseBonusPercent / 100);
  const totalDefense = baseTotalDefense + strongholdDefenseBonus;

  return {
    level,
    victoryPoints,
    defensePercent,
    baseCityWalls,
    cityWalls,
    stoneworksPercent,
    strongholdDefenseBonusPercent,
    strongholdDefenseBonus,
    totalDefense,
  };
}

function getCityPowerFloor(city = {}) {
  if (!city) return 0;
  const stats = getCityStats(city);
  const troopPower = Math.max(0, Math.floor(safeNumber(city.troops, 0))) * KING_POWER_PER_TROOP;
  const cityPower = Math.max(0, Math.floor(safeNumber(stats.victoryPoints, 0))) * KING_POWER_PER_CITY_VP;
  return troopPower + cityPower;
}

function getDemoAttackTier(powerRatio) {
  const ratio = safeNumber(powerRatio, 0);
  return DEMO_ATTACK_TIERS.find(tier => ratio >= tier.minRatio) || null;
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

function createServerDemoAttackSnapshot({ sourceTroops = 1, target = null, requestedTroops = 1, attackerKingPower = 0, defenderKingPower = 1, attackerUid = "" } = {}) {
  if (!target || isStronghold(target)) return null;
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
  const demoAttack = normalizeDemoAttackSnapshot(options.demoAttack);
  const attackPower = getAttackPower(troops, attackerProfile) * (demoAttack?.attackPowerMultiplier || 1);
  const defensePower = getCityStats(target, defenderProfile, options.defenderBonuses).totalDefense;
  const ratio = attackPower / Math.max(1, defensePower);
  const success = attackPower > defensePower;
  const attackerBoost = attackerProfile ? skillMultiplier(attackerProfile, "swordmastery") : 1;
  let survivors = 0;
  let defendersLeft = defendersAtStart;
  let attackerLosses = troops;
  let defenderLosses = 0;

  if (success) {
    const leftoverPower = attackPower - defensePower * 0.68;
    survivors = clamp(Math.floor(leftoverPower / Math.max(BASE_TROOP_ATTACK_POWER * attackerBoost, 1)), 1, troops);
    attackerLosses = troops - survivors;
    defenderLosses = defendersAtStart;
    defendersLeft = 0;
  } else {
    const pressure = clamp(ratio, 0, 1);
    defenderLosses = Math.min(defendersAtStart, Math.floor(defendersAtStart * (0.12 + pressure * 0.7)));
    defendersLeft = Math.max(defendersAtStart > 0 ? 1 : 0, defendersAtStart - defenderLosses);
  }

  return {
    attackPower,
    defensePower,
    ratio,
    success,
    survivors,
    defendersLeft,
    attackerLosses,
    defenderLosses,
    killedAttackers: attackerLosses,
    killedDefenders: defenderLosses,
    demoAttack,
  };
}

function getXpRequiredForLevel(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  return Math.floor(150 + current * 65 + Math.pow(current, 2.05) * 35);
}

function getLevelUpGoldReward(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  return Math.floor(250 + current * 60 + Math.pow(current, 1.25) * 25);
}

function getLevelUpTroopReward(level) {
  const current = Math.max(1, Math.floor(safeNumber(level, 1)));
  return Math.floor(LEVEL_UP_TROOP_REWARD_BASE * Math.pow(LEVEL_UP_TROOP_REWARD_MULTIPLIER, current - 1));
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
  const hardCap = getXpRequiredForLevel(stats.level) * BATTLE_XP_LEVEL_REQUIREMENT_CAP_MULTIPLIER;
  return Math.min(Math.max(0, Math.floor(safeNumber(troops, 0))), Math.max(cap, hardCap));
}

function getCaptureXpAward(target = {}, oldOwnerUid = "", defendersAtStart = 0, defenderProfile = null) {
  if (isGivenUpNeutralCity(target)) return 0;
  const level = clampCityLevel(target.level);
  const defenderXp = Math.floor(getBattleXpTroopCredit(target, defendersAtStart, defenderProfile) * CAPTURE_XP_PER_DEFENDER);
  const ownerBonus = oldOwnerUid ? ENEMY_CAPTURE_XP_BONUS : 0;
  return Math.floor(CAPTURE_XP_BASE + level * CAPTURE_XP_PER_CITY_LEVEL + defenderXp + ownerBonus);
}

function getDefenseHeldXpAward(attackingTroops, target = {}, defenderProfile = null) {
  return Math.floor(DEFENSE_HELD_XP_BASE + getBattleXpTroopCredit(target, attackingTroops, defenderProfile) * DEFENSE_HELD_XP_PER_ATTACKER);
}

function getPartialBattleXpAward(fullWinXp) {
  return Math.floor(Math.max(0, safeNumber(fullWinXp, 0)) * FAILED_BATTLE_XP_RATE);
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
    ? points.map(normalizePoint).filter(Boolean).slice(0, 320)
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
    }).filter(Boolean).slice(0, 24)
    : [];
}

function normalizeRegionIds(value = []) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(normalizeRegionId)
    .filter(Boolean))];
}

function getCityRegionIdFromPayload(city = {}, fallback = "") {
  return normalizeRegionId(city.regionId || city.startPool || fallback);
}

function normalizeArmyPayload(data = {}, uid = "") {
  const raw = data.army && typeof data.army === "object" ? data.army : data.movement || {};
  const fromId = safeString(raw.fromId || data.fromId, 96);
  const toId = safeString(raw.toId || data.toId, 96);
  const kind = ["attack", "transfer", "scout"].includes(raw.kind) ? raw.kind : "attack";
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
    ownerName: safeString(raw.ownerName || data.ownerName || "Ruler", 32),
    ownerFlag: raw.ownerFlag || data.ownerFlag || null,
    ownerKingPower: Math.max(0, Math.floor(safeNumber(raw.ownerKingPower, 0))),
    kind,
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
    attackerKingPower: Math.max(0, Math.floor(safeNumber(raw.attackerKingPower || raw.ownerKingPower, 0))),
    defenderKingPower: Math.max(0, Math.floor(safeNumber(raw.defenderKingPower, 0))),
    demoAttack: raw.demoAttack && typeof raw.demoAttack === "object" ? raw.demoAttack : null,
  };
}

function cityRefForRegion(regionId, cityId) {
  return db.doc(`islands/${getOnlineIslandId(regionId)}/cities/${cityId}`);
}

function armyRefsForRegions(regionIds, armyId) {
  return normalizeRegionIds(regionIds).map(regionId => db.doc(`islands/${getOnlineIslandId(regionId)}/armies/${armyId}`));
}

function reportRef(uid, reportId) {
  return db.doc(`players/${uid}/serverReports/${reportId}`);
}

function islandReportRef(regionId, reportId) {
  return db.doc(`islands/${getOnlineIslandId(regionId)}/reports/${reportId}`);
}

function getOwnerUid(city = {}) {
  return safeString(city.ownerUid, 128);
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
  return safeString(city.ownerName || city.name || fallback, 40);
}

function isProtectedMainCity(city = {}, attackerUid = "") {
  return Boolean(city.isMainCity && getOwnerUid(city) && getOwnerUid(city) !== attackerUid);
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

function getCurrentDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDaily(daily = {}, now = new Date()) {
  const today = getCurrentDateKey(now);
  if (!daily || typeof daily !== "object" || daily.date !== today) {
    return { date: today, neutralCaptures: 0, harvestedBonuses: 0, harvestedGoldBonuses: 0, harvestedTroopBonuses: 0 };
  }
  return {
    date: today,
    neutralCaptures: clampInt(daily.neutralCaptures, 0, DAILY_NEUTRAL_CAPTURE_LIMIT),
    harvestedBonuses: clampInt(daily.harvestedBonuses, 0, 200),
    harvestedGoldBonuses: clampInt(daily.harvestedGoldBonuses, 0, 100),
    harvestedTroopBonuses: clampInt(daily.harvestedTroopBonuses, 0, 100),
  };
}

function createScoutReportSnapshot(target = {}, defenderProfile = null, nowMs = Date.now(), bonuses = {}) {
  const stats = getCityStats(target, defenderProfile, bonuses);
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
    owner: getOwnerUid(target) ? "enemy" : "neutral",
    ownerName: getOwnerName(target),
    cityLevel: stats.level,
    defensePercent: stats.defensePercent,
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

function makeReport({ id, uid, type, outcome, city, opponentName = "", summary = "", sentTroops = 0, troopCount = 0, result = {}, totalDefense = 0, scoutReport = null, xpAwarded = 0, goldAwarded = 0, characterAfter = null, goldAfter = null, nowMs = Date.now() }) {
  return {
    id,
    uid,
    type,
    outcome,
    cityId: safeString(city?.id, 96),
    cityName: safeString(city?.name || city?.id || "Unknown city", 40),
    cityLevel: clampCityLevel(city?.level || 1),
    troopCount: Math.max(0, Math.floor(safeNumber(troopCount, city?.troops || 0))),
    sentTroops: Math.max(0, Math.floor(safeNumber(sentTroops, 0))),
    survivors: Math.max(0, Math.floor(safeNumber(result.survivors, 0))),
    defendersLeft: Math.max(0, Math.floor(safeNumber(result.defendersLeft, 0))),
    attackerLosses: Math.max(0, Math.floor(safeNumber(result.attackerLosses, 0))),
    defenderLosses: Math.max(0, Math.floor(safeNumber(result.defenderLosses, 0))),
    totalDefense: Math.max(0, Math.floor(safeNumber(totalDefense, result.defensePower || 0))),
    opponentName: safeString(opponentName, 40),
    ownerName: safeString(city?.ownerName || "", 40),
    summary: safeString(summary, 220),
    createdAtMs: nowMs,
    resetGeneration: RESET_GENERATION,
    worldId: ONLINE_WORLD_ID,
    scoutReport,
    xpAwarded: Math.max(0, Math.floor(safeNumber(xpAwarded, 0))),
    goldAwarded: Math.max(0, Math.floor(safeNumber(goldAwarded, 0))),
    characterAfter,
    goldAfter,
  };
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
  return {
    ...patch,
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
  const hasWarDrumsCount = Object.prototype.hasOwnProperty.call(items, WAR_DRUMS_ITEM_ID);
  const legacyWarDrumsCount = Math.max(0, Math.floor(safeNumber(items.troop_boost_1h, 0)));
  const hasLegacyWarDrumsCount = legacyWarDrumsCount > 0 && Object.prototype.hasOwnProperty.call(items, "troop_boost_1h");
  if (!hasWarDrumsCount && Number.isFinite(Number(items.troop_boost_1h))) {
    normalized[WAR_DRUMS_ITEM_ID] = legacyWarDrumsCount;
  } else if (hasLegacyWarDrumsCount) {
    normalized[WAR_DRUMS_ITEM_ID] = Math.min(normalized[WAR_DRUMS_ITEM_ID], legacyWarDrumsCount);
  }
  return normalized;
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
    veilOfSilenceExpiresAtMs: timestampToMs(effects.veilOfSilenceExpiresAtMs || effects.veilOfSilenceExpiresAt || effects.antiScoutExpiresAtMs || effects.antiScoutExpiresAt),
  };
}

function isVeilOfSilenceActive(profile = {}, nowMs = Date.now()) {
  return timestampToMs(profile?.itemEffects?.veilOfSilenceExpiresAtMs || profile?.itemEffects?.veilOfSilenceExpiresAt) > nowMs;
}

function normalizeItemPurchaseCooldowns(cooldowns = {}) {
  const shieldCooldown = cooldowns?.[ROYAL_PEACE_SHIELD_ITEM_ID] || {};
  return {
    [ROYAL_PEACE_SHIELD_ITEM_ID]: {
      lastPurchasedAtMs: timestampToMs(shieldCooldown.lastPurchasedAtMs || shieldCooldown.lastPurchasedAt),
    },
  };
}

function getOwnedStrongholdBonuses(cities = []) {
  const ownsCrownCitadel = cities.some(entry => isCrownCitadel(entry.city));
  if (ownsCrownCitadel) {
    return {
      goldBonusPercent: CROWN_CITADEL_GOLD_BONUS_PERCENT,
      troopBonusPercent: CROWN_CITADEL_TROOP_BONUS_PERCENT,
      marchSpeedBonusPercent: CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT,
      cityDefenseBonusPercent: CROWN_CITADEL_DEFENSE_BONUS_PERCENT,
      upgradeCostReductionPercent: CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT,
    };
  }
  return cities.reduce((bonuses, entry) => {
    const city = entry.city || {};
    if (isGoldStronghold(city)) bonuses.goldBonusPercent += getStrongholdBonusPercent(city);
    if (isTrainingStronghold(city)) bonuses.troopBonusPercent += getStrongholdBonusPercent(city);
    if (isSpeedStronghold(city)) bonuses.marchSpeedBonusPercent += getStrongholdBonusPercent(city);
    if (isDefenseStronghold(city)) bonuses.cityDefenseBonusPercent += getStrongholdBonusPercent(city);
    return bonuses;
  }, { goldBonusPercent: 0, troopBonusPercent: 0, marchSpeedBonusPercent: 0, cityDefenseBonusPercent: 0, upgradeCostReductionPercent: 0 });
}

function getCityUpgradeCost(city = {}, bonuses = {}) {
  if (isStronghold(city)) return Infinity;
  const startLevel = clampCityLevel(city.level);
  if (startLevel >= MAX_CITY_LEVEL) return Infinity;
  const targetLevel = Math.min(MAX_CITY_LEVEL, startLevel + 1);
  const totalCost = MILLION_LORDS_CITY_COST_BASE * (
    Math.pow(MILLION_LORDS_CITY_COST_GROWTH, targetLevel - 1)
      - Math.pow(MILLION_LORDS_CITY_COST_GROWTH, startLevel - 1)
  );
  const reduction = Math.max(0, safeNumber(bonuses.upgradeCostReductionPercent, 0));
  return Math.max(0, Math.floor(totalCost * (1 - reduction / 100) + 0.000001));
}

function getCityUpgradeXpAward(city = {}) {
  return Math.floor(CITY_UPGRADE_XP_BASE + clampCityLevel(city.level) * CITY_UPGRADE_XP_PER_LEVEL);
}

function getEconomyCityByRef(economy = null, ref = null) {
  if (!economy || !ref) return null;
  return economy.cityEntries.find(entry => entry.ref.path === ref.path) || null;
}

function findNearestRelinquishDestination(economy = null, sourceEntry = null) {
  if (!economy || !sourceEntry?.city) return null;
  const source = sourceEntry.city;
  const sourceRegionId = normalizeRegionId(source.regionId || "");
  const sourceX = safeNumber(source.x, 0);
  const sourceY = safeNumber(source.y, 0);
  return economy.cityEntries
    .filter(entry => entry?.ref?.path !== sourceEntry.ref.path)
    .filter(entry => getOwnerUid(entry.city) === economy.uid)
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

function normalizeRelocationRegionCandidates(rawCandidates = []) {
  if (!Array.isArray(rawCandidates)) return [];
  const seenRegions = new Set();
  return rawCandidates
    .map(candidate => {
      const regionId = normalizeRegionId(candidate?.regionId || candidate?.id || candidate?.mainRegionId);
      if (!regionId || seenRegions.has(regionId)) return null;
      const rawCityIds = Array.isArray(candidate?.cityIds)
        ? candidate.cityIds
        : Array.isArray(candidate?.candidateCityIds) ? candidate.candidateCityIds : [];
      const cityIds = [...new Set(rawCityIds
        .map(cityId => safeString(cityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_"))
        .filter(Boolean))];
      if (!cityIds.length) return null;
      seenRegions.add(regionId);
      return {
        regionId,
        islandId: safeString(candidate?.islandId || getOnlineIslandId(regionId), 160),
        cityIds: cityIds.slice(0, 140),
      };
    })
    .filter(Boolean)
    .slice(0, 40);
}

async function pickRelocationTarget(transaction, regionCandidates = [], minimumNeutralCities = 0, excludeCityId = "") {
  const neutralReserve = Math.max(0, Math.floor(safeNumber(minimumNeutralCities, 0)));
  for (const candidate of regionCandidates) {
    let chosen = null;
    let neutralCityCount = 0;
    for (const cityId of candidate.cityIds) {
      if (cityId === excludeCityId) continue;
      const ref = cityRefForRegion(candidate.regionId, cityId);
      const snap = await transaction.get(ref);
      if (!snap.exists) continue;
      const city = { id: snap.id, ...snap.data(), regionId: candidate.regionId };
      const ownerUid = getOwnerUid(city);
      const ownerKind = city.ownerKind || city.owner || "neutral";
      const isNeutralRegularCity = !isStronghold(city) && !ownerUid && ownerKind !== "player";
      if (!isNeutralRegularCity) continue;
      neutralCityCount += 1;
      if (!chosen) chosen = { ref, city, regionId: candidate.regionId, islandId: candidate.islandId };
      if (chosen && neutralCityCount >= neutralReserve) return { ...chosen, neutralCityCount };
    }
    if (chosen && neutralCityCount >= neutralReserve) return { ...chosen, neutralCityCount };
  }
  return null;
}

async function prepareEconomyCollection(transaction, uid, nowMs = Date.now(), options = {}) {
  const profileRef = options.profileRef || db.doc(`players/${uid}`);
  const profileSnap = options.profileSnap || await transaction.get(profileRef);
  const rawProfile = profileSnap.exists ? profileSnap.data() || {} : {};
  const itemEffects = normalizeItemEffects(rawProfile.itemEffects);
  const shopItems = normalizeShopItems(rawProfile.shopItems);
  const itemPurchaseCooldowns = normalizeItemPurchaseCooldowns(rawProfile.itemPurchaseCooldowns);
  const baseGold = Math.max(0, safeNumber(rawProfile.goldFloat, safeNumber(rawProfile.gold, TEST_STARTING_GOLD)));
  const fallbackProductionAtMs = Math.min(nowMs, getProfileLastSeenMs(rawProfile) || nowMs);

  const ownedSnap = await transaction.get(db.collectionGroup("cities").where("ownerUid", "==", uid));
  const cityEntries = ownedSnap.docs
    .map(doc => {
      const data = doc.data() || {};
      if ((data.ownerKind || "player") !== "player" || getOwnerUid(data) !== uid) return null;
      const regionId = getRegionIdFromCityDoc(doc, data);
      return {
        ref: doc.ref,
        city: {
          id: doc.id,
          ...data,
          regionId,
          ownerKind: "player",
          ownerUid: uid,
        },
      };
    })
    .filter(Boolean);

  const bonuses = getOwnedStrongholdBonuses(cityEntries);
  const cityPatches = [];
  const cityUpdates = [];
  let goldGainFloat = 0;
  let troopsGained = 0;
  let maxElapsedSeconds = 0;

  cityEntries.forEach(entry => {
    const city = entry.city;
    if (isStronghold(city)) return;
    const lastProductionAtMs = Math.min(
      nowMs,
      timestampToMs(city.productionUpdatedAtMs || city.economyUpdatedAtMs) || fallbackProductionAtMs
    );
    const elapsedSeconds = clamp((nowMs - lastProductionAtMs) / 1000, 0, MAX_SERVER_PRODUCTION_SECONDS);
    maxElapsedSeconds = Math.max(maxElapsedSeconds, elapsedSeconds);
    const stats = getCityProductionStats(city, { ...rawProfile, itemEffects }, bonuses);
    const currentTroopFloat = Math.max(0, safeNumber(city.troopFloat, safeNumber(city.troops, 0)));
    const troopGainFloat = stats.troopProductionPerSecond * elapsedSeconds;
    const nextTroopFloat = currentTroopFloat + troopGainFloat;
    const nextTroops = Math.max(0, Math.floor(nextTroopFloat));
    goldGainFloat += stats.goldProductionPerSecond * elapsedSeconds;
    troopsGained += Math.max(0, nextTroops - Math.max(0, Math.floor(safeNumber(city.troops, 0))));
    if (elapsedSeconds > 0 || !timestampToMs(city.productionUpdatedAtMs)) {
      const patch = {
        troops: nextTroops,
        troopFloat: nextTroopFloat,
        productionUpdatedAtMs: nowMs,
      };
      cityPatches.push({ ref: entry.ref, city, patch });
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
  });

  const goldFloat = baseGold + goldGainFloat;
  const gold = Math.max(0, Math.floor(goldFloat));
  const profileAfter = {
    ...rawProfile,
    gold,
    goldFloat,
    shopItems,
    itemEffects,
    itemPurchaseCooldowns,
  };
  const profilePatch = {
    uid,
    resetGeneration: rawProfile.resetGeneration || RESET_GENERATION,
    worldId: rawProfile.worldId || ONLINE_WORLD_ID,
    gold,
    goldFloat,
    shopItems,
    itemEffects,
    itemPurchaseCooldowns,
    economyUpdatedAtMs: nowMs,
  };

  return {
    uid,
    profileRef,
    profileSnap,
    profileBefore: rawProfile,
    profileAfter,
    profilePatch,
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

function writePreparedEconomy(transaction, economy, profileOverrides = {}, extraCityPatches = []) {
  if (!economy) return;
  economy.cityPatches.forEach(entry => {
    transaction.set(entry.ref, cleanCityUpdate(entry.city, entry.patch), { merge: true });
  });
  extraCityPatches.forEach(entry => {
    if (!entry?.ref || !entry.patch) return;
    transaction.set(entry.ref, cleanCityUpdate(entry.city || {}, entry.patch), { merge: true });
  });
  transaction.set(economy.profileRef, {
    ...economy.profilePatch,
    ...profileOverrides,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (economy.profileSnap?.exists) {
    transaction.update(economy.profileRef, addLegacyShopItemDeletes());
  }
}

function createEconomyResponse(economy = null, overrides = {}) {
  if (!economy) return { ok: true };
  const {
    gold,
    goldFloat,
    shopItems,
    itemEffects,
    itemPurchaseCooldowns,
    character,
    upgrades,
    cityUpdates,
    ...meta
  } = overrides;
  const currentUser = {
    gold: Math.max(0, Math.floor(safeNumber(gold, economy.gold))),
    goldFloat: Math.max(0, safeNumber(goldFloat, gold ?? economy.goldFloat)),
    shopItems: shopItems || economy.shopItems,
    itemEffects: itemEffects || economy.itemEffects,
    itemPurchaseCooldowns: itemPurchaseCooldowns || economy.itemPurchaseCooldowns,
    character: character || economy.profileAfter.character || null,
    upgrades: upgrades || normalizeSkillUpgrades(economy.profileAfter.upgrades),
  };
  return {
    ok: true,
    currentUser,
    cityUpdates: cityUpdates || economy.cityUpdates,
    production: economy.production,
    ...meta,
  };
}

function formatNotificationNumber(value) {
  return Math.max(0, Math.floor(safeNumber(value, 0))).toLocaleString();
}

function createIncomingArmyNotification({ defenderUid = "", attackerUid = "", movement = {}, source = {}, target = {} } = {}) {
  const kind = movement.kind === "scout" ? "scout" : movement.kind === "attack" ? "attack" : "";
  if (!defenderUid || !attackerUid || defenderUid === attackerUid || !kind) return null;
  const attackerName = safeString(movement.ownerName || source.ownerName || "A rival ruler", 40);
  const sourceName = safeString(movement.fromName || source.name || movement.fromId || "Unknown city", 40);
  const targetName = safeString(movement.toName || target.name || movement.toId || "your city", 40);
  const title = kind === "scout" ? "Scout incoming" : "Attack incoming";
  const body = kind === "scout"
    ? `${attackerName} is scouting ${targetName} from ${sourceName}.`
    : `${attackerName} is attacking ${targetName} with ${formatNotificationNumber(movement.troops)} troops.`;
  return {
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
    troops: String(Math.max(0, Math.floor(safeNumber(movement.troops, 0)))),
    arrivesAtMs: String(Math.max(0, Math.floor(safeNumber(movement.arrivesAtMs, 0)))),
    url: "/",
  };
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
    troops: safeString(notification.troops, 32),
    arrivesAtMs: safeString(notification.arrivesAtMs, 32),
    url: safeString(notification.url || "/", 160),
  };

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

exports.collectEconomy = onCall({ region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  return db.runTransaction(async transaction => {
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    writePreparedEconomy(transaction, economy);
    return createEconomyResponse(economy);
  });
});

exports.spendSkillPoint = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const skillId = safeString(data.skillId || data.skill, 64);
  const config = SKILL_CONFIG[skillId];
  if (!config) throw new HttpsError("invalid-argument", "Choose a valid skill.");

  return db.runTransaction(async transaction => {
    const profileRef = db.doc(`players/${uid}`);
    const profileSnap = await transaction.get(profileRef);
    if (!profileSnap.exists) throw new HttpsError("not-found", "Player profile was not found.");
    const profile = profileSnap.data() || {};
    const upgrades = normalizeSkillUpgrades(profile.upgrades);
    const character = reconcileSkillPoints(profile.character, upgrades);
    const currentLevel = normalizeSkillLevel(upgrades[skillId]);
    const currentPercent = currentLevel * config.percentPerLevel;
    if (Number.isFinite(config.maxPercent) && currentPercent >= config.maxPercent) {
      throw new HttpsError("failed-precondition", "That skill is already capped.");
    }
    if (character.skillPoints < 1) {
      throw new HttpsError("failed-precondition", "Earn a hero level for another skill point.");
    }
    upgrades[skillId] = currentLevel + 1;
    character.skillPoints = getAvailableSkillPoints(character, upgrades);
    transaction.set(profileRef, {
      character,
      upgrades,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      ok: true,
      skillId,
      currentUser: {
        character,
        upgrades,
        gold: Math.max(0, Math.floor(safeNumber(profile.gold, 0))),
        goldFloat: Math.max(0, safeNumber(profile.goldFloat, profile.gold || 0)),
      },
    };
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
    let xpAward = 0;
    const upgradeBonuses = {
      ...economy.bonuses,
      upgradeCostReductionPercent: Math.min(
        85,
        Math.max(0, safeNumber(economy.bonuses.upgradeCostReductionPercent, 0))
          + getSkillPercent(economy.profileAfter, "guildCharters")
      ),
    };

    while (upgraded < requestedLevels && clampCityLevel(city.level) < MAX_CITY_LEVEL) {
      const cost = getCityUpgradeCost(city, upgradeBonuses);
      if (!Number.isFinite(cost) || gold < cost) break;
      goldFloat = Math.max(0, goldFloat - cost);
      gold = Math.max(0, Math.floor(goldFloat));
      investedGold += cost;
      city.level = clampCityLevel(city.level + 1);
      spentGold += cost;
      xpAward += getCityUpgradeXpAward(city);
      upgraded += 1;
    }

    if (!upgraded) {
      throw new HttpsError(
        "failed-precondition",
        clampCityLevel(city.level) >= MAX_CITY_LEVEL ? "City is already max level." : "Not enough gold to upgrade that city."
      );
    }

    const progress = buildPlayerProgressPatch({ ...economy.profileAfter, gold, goldFloat }, { xp: xpAward });
    const cityPatch = {
      level: city.level,
      investedGold,
      productionUpdatedAtMs: nowMs,
    };
    const cityUpdate = {
      id: city.id,
      regionId: city.regionId || regionId,
      troops: Math.max(0, Math.floor(safeNumber(city.troops, 0))),
      troopFloat: Math.max(0, safeNumber(city.troopFloat, city.troops || 0)),
      ...cityPatch,
    };

    writePreparedEconomy(transaction, economy, {
      character: progress.character,
      gold: progress.gold,
      goldFloat: progress.goldFloat,
    }, [{ ref: cityRef, city, patch: cityPatch }]);

    return createEconomyResponse(economy, {
      gold: progress.gold,
      goldFloat: progress.goldFloat,
      character: progress.character,
      cityUpdates: [...economy.cityUpdates, cityUpdate],
      spentGold,
      upgraded,
      xpAwarded: progress.xpAwarded,
    });
  });
});

exports.relinquishCity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const cityId = safeString(data.cityId || data.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const regionId = normalizeRegionId(data.regionId || data.islandId || "west");
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
    const destinationTroopFloat = Math.max(0, safeNumber(destination.troopFloat, destination.troops || 0)) + transferredTroops;
    const destinationPatch = {
      troops: Math.max(0, Math.floor(destinationTroopFloat)),
      troopFloat: destinationTroopFloat,
      productionUpdatedAtMs: nowMs,
    };
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
    const destinationUpdate = {
      id: destination.id,
      regionId: destination.regionId || regionId,
      ...destinationPatch,
    };

    writePreparedEconomy(transaction, economy, {}, [
      { ref: sourceEntry.ref, city: source, patch: sourcePatch },
      { ref: destinationEntry.ref, city: destination, patch: destinationPatch },
    ]);

    return createEconomyResponse(economy, {
      cityUpdates: [...economy.cityUpdates, sourceUpdate, destinationUpdate],
      relinquishedCity: {
        id: source.id,
        name: safeString(source.name || source.id, 80),
        regionId: source.regionId || regionId,
        level: sourceLevel,
      },
      destinationCity: {
        id: destination.id,
        name: safeString(destination.name || destination.id, 80),
        regionId: destination.regionId || regionId,
      },
      transferredTroops,
    });
  });
});

exports.relocateMainCity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const regionCandidates = normalizeRelocationRegionCandidates(data.regionCandidates || data.spawnCandidates || []);
  const minimumNeutralCities = Math.max(0, Math.floor(safeNumber(data.minimumNeutralCities, 0)));
  if (!regionCandidates.length) {
    throw new HttpsError("invalid-argument", "No relocation maps were provided.");
  }

  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const economy = await prepareEconomyCollection(transaction, uid, nowMs);
    const profile = economy.profileAfter || {};
    const currentMainCityId = safeString(data.currentCityId || profile.mainCityId || economy.profileBefore.mainCityId, 96)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const currentRegionId = normalizeRegionId(data.currentRegionId || profile.mainRegionId || getRegionIdFromOnlineIslandId(profile.mainIslandId));
    if (!currentMainCityId) {
      throw new HttpsError("failed-precondition", "Your current main city could not be found.");
    }

    const currentMainRef = cityRefForRegion(currentRegionId, currentMainCityId);
    const currentMainEntry = getEconomyCityByRef(economy, currentMainRef);
    if (!currentMainEntry?.city || getOwnerUid(currentMainEntry.city) !== uid || isStronghold(currentMainEntry.city)) {
      throw new HttpsError("failed-precondition", "Your current main city could not be verified.");
    }

    const target = await pickRelocationTarget(transaction, regionCandidates, minimumNeutralCities, currentMainCityId);
    if (!target?.city) {
      throw new HttpsError(
        "failed-precondition",
        `No starter, midgame, or endgame map has ${minimumNeutralCities.toLocaleString()} neutral cities available.`
      );
    }

    const playerName = safeString(data.playerName || profile.playerName || profile.displayName || "Ruler", 40);
    const playerFlag = data.flag || profile.flag || null;
    const ownerKingPower = Math.max(0, Math.floor(safeNumber(data.ownerKingPower, profile.kingPower || 0)));
    const shieldExpiresAtMs = Math.max(0, timestampToMs(profile.itemEffects?.shieldExpiresAtMs));
    const currentMain = currentMainEntry.city;
    const targetCity = target.city;
    const transferredTroops = Math.max(0, Math.floor(safeNumber(currentMain.troops, 0)));
    const currentMainLevel = clampCityLevel(currentMain.level);
    const targetLevel = clampCityLevel(targetCity.level);

    const oldMainPatch = {
      ownerKind: "neutral",
      ownerUid: null,
      ownerName: "",
      ownerFlag: null,
      ownerKingPower: 0,
      ownerShieldExpiresAtMs: 0,
      level: currentMainLevel,
      troops: 0,
      troopFloat: 0,
      investedGold: 0,
      isMainCity: false,
      productionUpdatedAtMs: nowMs,
      relinquishedAtMs: 0,
      relocatedAtMs: nowMs,
    };
    const newMainPatch = {
      ownerKind: "player",
      ownerUid: uid,
      ownerName: playerName,
      ownerFlag: playerFlag,
      ownerKingPower,
      ownerShieldExpiresAtMs: shieldExpiresAtMs,
      level: targetLevel,
      troops: transferredTroops,
      troopFloat: transferredTroops,
      investedGold: Math.max(0, Math.floor(safeNumber(targetCity.investedGold, 0))),
      isMainCity: true,
      productionUpdatedAtMs: nowMs,
      relinquishedAtMs: 0,
      relocatedAtMs: 0,
    };
    const newMainWritePatch = {
      ...newMainPatch,
      claimedAt: targetCity.claimedAt || FieldValue.serverTimestamp(),
    };
    const profileOverrides = {
      playerName,
      flag: playerFlag,
      mainIslandId: target.islandId,
      mainRegionId: target.regionId,
      mainCityId: targetCity.id,
      mainCityChangedAtMs: nowMs,
    };

    writePreparedEconomy(transaction, economy, profileOverrides, [
      { ref: currentMainEntry.ref, city: currentMain, patch: oldMainPatch },
      { ref: target.ref, city: targetCity, patch: newMainWritePatch },
    ]);

    return createEconomyResponse(economy, {
      currentUser: {
        ...createEconomyResponse(economy).currentUser,
        ...profileOverrides,
      },
      cityUpdates: [
        ...economy.cityUpdates,
        {
          id: currentMain.id,
          regionId: currentMain.regionId || currentRegionId,
          ...oldMainPatch,
        },
        {
          id: targetCity.id,
          regionId: target.regionId,
          ...newMainPatch,
        },
      ],
      oldMainCity: {
        id: currentMain.id,
        name: safeString(currentMain.name || currentMain.id, 80),
        regionId: currentMain.regionId || currentRegionId,
        level: currentMainLevel,
      },
      newMainCity: {
        id: targetCity.id,
        name: safeString(targetCity.name || targetCity.id, 80),
        regionId: target.regionId,
        islandId: target.islandId,
        level: targetLevel,
      },
      transferredTroops,
      neutralCityCount: target.neutralCityCount,
    });
  });
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

    goldFloat = Math.max(0, goldFloat - item.cost);
    gold = Math.max(0, Math.floor(goldFloat));
    const shopItems = { ...economy.shopItems };
    shopItems[itemId] = Math.max(0, Math.floor(safeNumber(shopItems[itemId], 0))) + 1;
    const itemPurchaseCooldowns = {
      ...economy.itemPurchaseCooldowns,
      ...(itemId === ROYAL_PEACE_SHIELD_ITEM_ID ? {
        [ROYAL_PEACE_SHIELD_ITEM_ID]: { lastPurchasedAtMs: nowMs },
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
  if (![ROYAL_PEACE_SHIELD_ITEM_ID, WAR_DRUMS_ITEM_ID, VEIL_OF_SILENCE_ITEM_ID].includes(itemId)) {
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

exports.sendArmyOrder = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const nowMs = Date.now();
  const order = normalizeArmyPayload(request.data || {}, uid);

  if (!order.fromId || !order.toId || order.fromId === order.toId) {
    throw new HttpsError("invalid-argument", "Choose a valid source and destination city.");
  }
  if (!order.sourceRegionId || !order.targetRegionId) {
    throw new HttpsError("invalid-argument", "Missing source or destination region.");
  }
  if (!order.routeRegionIds.includes(order.sourceRegionId)) order.routeRegionIds.push(order.sourceRegionId);
  if (!order.routeRegionIds.includes(order.targetRegionId)) order.routeRegionIds.push(order.targetRegionId);

  const sourceRef = cityRefForRegion(order.sourceRegionId, order.fromId);
  const targetRef = cityRefForRegion(order.targetRegionId, order.toId);
  const armyRefs = armyRefsForRegions(order.routeRegionIds, order.id);
  const playerRef = db.doc(`players/${uid}`);

  const result = await db.runTransaction(async transaction => {
    const [sourceSnap, targetSnap, existingArmySnap, playerSnap] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(targetRef),
      transaction.get(armyRefs[0]),
      transaction.get(playerRef),
    ]);

    if (!sourceSnap.exists) throw new HttpsError("not-found", "Source city was not found.");
    if (!targetSnap.exists) throw new HttpsError("not-found", "Destination city was not found.");

    let source = { id: sourceSnap.id, ...sourceSnap.data() };
    const target = { id: targetSnap.id, ...targetSnap.data() };
    const sourceOwnerUid = getOwnerUid(source);
    const targetOwnerUid = getOwnerUid(target);
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
    if (sourceOwnerUid !== uid) {
      throw new HttpsError("permission-denied", "You can only send troops from your own city.");
    }
    const attackerEconomy = await prepareEconomyCollection(transaction, uid, nowMs, {
      profileRef: playerRef,
      profileSnap: playerSnap,
    });
    const producedSourceEntry = getEconomyCityByRef(attackerEconomy, sourceRef);
    if (producedSourceEntry?.city) source = producedSourceEntry.city;
    const attackerProfile = attackerEconomy.profileAfter || playerData;
    const defenderPowerSnap = targetOwnerUid && targetOwnerUid !== uid
      ? await transaction.get(db.doc(`players/${targetOwnerUid}`))
      : null;
    const defenderPowerData = defenderPowerSnap?.exists ? defenderPowerSnap.data() || {} : {};

    const sourceTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0)));
    const resolvedKind = order.kind === "scout"
      ? "scout"
      : targetOwnerUid === uid
        ? "transfer"
        : "attack";
    const requestedTroops = resolvedKind === "scout"
      ? 1
      : clampInt(order.requestedTroops || order.troops || Math.floor(sourceTroops * DEFAULT_MARCH_PERCENT), 1, Math.max(1, sourceTroops));
    const attackerKingPower = Math.max(
      0,
      Math.floor(safeNumber(attackerProfile.kingPower, 0)),
      Math.floor(safeNumber(order.ownerKingPower, 0)),
      Math.floor(safeNumber(order.attackerKingPower, 0))
    );
    const defenderKingPower = Math.max(
      1,
      Math.floor(safeNumber(target.ownerKingPower, 0)),
      Math.floor(safeNumber(defenderPowerData.kingPower, 0)),
      Math.floor(getCityPowerFloor(target))
    );
    const demoAttack = resolvedKind === "attack"
      ? createServerDemoAttackSnapshot({
        sourceTroops,
        target,
        requestedTroops,
        attackerKingPower,
        defenderKingPower,
        attackerUid: uid,
      })
      : null;
    const troops = resolvedKind === "scout" ? 1 : (demoAttack?.effectiveTroops || requestedTroops);

    if (sourceTroops < troops) throw new HttpsError("failed-precondition", "Not enough troops in the source city.");
    if (resolvedKind === "scout" && isProtectedMainCity(target, uid)) {
      throw new HttpsError("failed-precondition", "Main cities cannot be scouted.");
    }
    if (resolvedKind === "scout" && targetOwnerUid && targetOwnerUid !== uid && isVeilOfSilenceActive(defenderPowerData, nowMs)) {
      throw new HttpsError("failed-precondition", "That city is hidden by Veil of Silence.");
    }
    if (resolvedKind === "attack") {
      if (isProtectedMainCity(target, uid)) {
        throw new HttpsError("failed-precondition", "Main cities cannot be attacked.");
      }
      if (isCityShielded(target, uid, nowMs)) {
        throw new HttpsError("failed-precondition", "That city is protected by a Royal Peace Shield.");
      }
    }

    const duration = calculateTravelTime({
      pathLength: order.pathLength,
      troopCount: troops,
      kind: resolvedKind,
      requestedTotal: order.total,
      demoAttack,
      speedMultiplier: skillMultiplier(attackerProfile, "marchOrders")
        * (1 + Math.max(0, safeNumber(attackerEconomy.bonuses.marchSpeedBonusPercent, 0)) / 100),
    });
    const movement = {
      id: order.id,
      ownerKind: "player",
      ownerUid: uid,
      ownerName: safeString(order.ownerName || source.ownerName || request.auth.token?.name || "Ruler", 32),
      ownerFlag: order.ownerFlag || source.ownerFlag || null,
      ownerKingPower: order.ownerKingPower,
      kind: resolvedKind,
      fromId: order.fromId,
      toId: order.toId,
      sourceRegionId: order.sourceRegionId,
      targetRegionId: order.targetRegionId,
      fromName: safeString(source.name || order.fromName, 40),
      toName: safeString(target.name || order.toName, 40),
      troops,
      requestedTroops,
      total: duration,
      path: order.path,
      pathSegments: order.pathSegments,
      routeRegionIds: order.routeRegionIds,
      pathLength: order.pathLength,
      targetOwnerAtLaunch: targetOwnerUid ? "player" : "neutral",
      attackerKingPower: attackerKingPower || order.attackerKingPower || order.ownerKingPower,
      defenderKingPower,
      demoAttack,
      launchedAtMs: nowMs,
      arrivesAtMs: nowMs + Math.ceil(duration * 1000),
      status: "active",
      createdByServer: true,
      serverAuthorityVersion: 1,
    };

    let profileOverrides = {};
    if (resolvedKind === "attack" && targetOwnerUid && targetOwnerUid !== uid) {
      const itemEffects = { ...(attackerEconomy.itemEffects || {}) };
      if (safeNumber(itemEffects.shieldExpiresAtMs, 0) > nowMs) {
        itemEffects.shieldExpiresAtMs = 0;
        profileOverrides = { itemEffects };
      }
    }
    writePreparedEconomy(transaction, attackerEconomy, profileOverrides);

    transaction.set(sourceRef, cleanCityUpdate(source, {
      troops: sourceTroops - troops,
      troopFloat: Math.max(0, safeNumber(source.troopFloat, sourceTroops) - troops),
    }), { merge: true });

    armyRefs.forEach(ref => transaction.set(ref, {
      ...movement,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }));

    return {
      ok: true,
      movement,
      sourceCity: {
        id: source.id,
        regionId: order.sourceRegionId,
        troops: sourceTroops - troops,
        troopFloat: Math.max(0, safeNumber(source.troopFloat, sourceTroops) - troops),
      },
      currentUser: {
        gold: attackerEconomy.gold,
        goldFloat: attackerEconomy.goldFloat,
        shopItems: attackerEconomy.shopItems,
        itemEffects: profileOverrides.itemEffects || attackerEconomy.itemEffects,
        itemPurchaseCooldowns: attackerEconomy.itemPurchaseCooldowns,
        character: attackerProfile.character || null,
        upgrades: normalizeSkillUpgrades(attackerProfile.upgrades),
      },
      incomingNotification: createIncomingArmyNotification({
        defenderUid: targetOwnerUid,
        attackerUid: uid,
        movement,
        source,
        target,
      }),
    };
  });

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
  if (!requestedRegions.length) throw new HttpsError("invalid-argument", "Missing army route regions.");

  const firstArmyRef = armyRefsForRegions(requestedRegions, armyId)[0];

  return db.runTransaction(async transaction => {
    const firstArmySnap = await transaction.get(firstArmyRef);
    if (!firstArmySnap.exists) return { ok: true, status: "missing" };
    const army = { id: firstArmySnap.id, ...firstArmySnap.data() };
    if (army.status !== "active") return { ok: true, status: army.status || "resolved" };
    const arrivesAtMs = Math.max(0, Math.floor(safeNumber(army.arrivesAtMs, 0)));
    if (arrivesAtMs > nowMs) {
      throw new HttpsError("failed-precondition", "Army has not arrived yet.");
    }

    const routeRegionIds = normalizeRegionIds(army.routeRegionIds?.length ? army.routeRegionIds : requestedRegions);
    const armyRefs = armyRefsForRegions(routeRegionIds, armyId);
    const sourceRegionId = normalizeRegionId(army.sourceRegionId || routeRegionIds[0]);
    const targetRegionId = normalizeRegionId(army.targetRegionId || routeRegionIds[routeRegionIds.length - 1] || sourceRegionId);
    const sourceRef = cityRefForRegion(sourceRegionId, army.fromId);
    const targetRef = cityRefForRegion(targetRegionId, army.toId);
    const [sourceSnap, targetSnap] = await Promise.all([transaction.get(sourceRef), transaction.get(targetRef)]);
    if (!targetSnap.exists) throw new HttpsError("not-found", "Target city was not found.");

    let source = sourceSnap.exists ? { id: sourceSnap.id, ...sourceSnap.data() } : null;
    let target = { id: targetSnap.id, ...targetSnap.data() };
    const attackerUid = safeString(army.ownerUid, 128);
    const defenderUid = getOwnerUid(target);
    const participantProfiles = await getProfileSnapshots(transaction, [attackerUid, defenderUid]);
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
    const reports = [];
    const cityUpdates = [];
    const economyCityUpdates = () => {
      const updates = [];
      if (attackerEconomy) updates.push(...attackerEconomy.cityUpdates);
      if (defenderEconomy && defenderEconomy !== attackerEconomy) updates.push(...defenderEconomy.cityUpdates);
      return updates;
    };
    const withEconomyCityUpdates = updates => [...economyCityUpdates(), ...(Array.isArray(updates) ? updates : [])];
    const writeParticipantEconomies = (attackerOverrides = {}, defenderOverrides = {}) => {
      if (attackerEconomy) writePreparedEconomy(transaction, attackerEconomy, attackerOverrides);
      if (defenderEconomy && defenderEconomy !== attackerEconomy) writePreparedEconomy(transaction, defenderEconomy, defenderOverrides);
    };
    const reportsForCaller = () => reports.filter(report => report.uid === callerUid);
    const profilePatchForCaller = (attackerPatch = null, defenderPatch = null) => {
      if (callerUid === attackerUid && attackerPatch) {
        return { character: attackerPatch.character, gold: attackerPatch.gold, goldFloat: attackerPatch.goldFloat, upgrades: normalizeSkillUpgrades(attackerProfile.upgrades) };
      }
      if (callerUid === defenderUid && defenderPatch) {
        return { character: defenderPatch.character, gold: defenderPatch.gold, goldFloat: defenderPatch.goldFloat, upgrades: normalizeSkillUpgrades(defenderProfile?.upgrades) };
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
      armyRefs.forEach(ref => transaction.set(ref, patch, { merge: true }));
    };
    const returnTroopsToSource = troops => {
      const returned = Math.max(0, Math.floor(safeNumber(troops, 0)));
      if (!returned || !source || getOwnerUid(source) !== attackerUid) return 0;
      const nextTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0))) + returned;
      transaction.set(sourceRef, cleanCityUpdate(source, {
        troops: nextTroops,
        troopFloat: Math.max(0, safeNumber(source.troopFloat, source.troops || 0)) + returned,
      }), { merge: true });
      cityUpdates.push({ id: source.id, regionId: sourceRegionId, troops: nextTroops });
      return returned;
    };
    const recoverBattleLossesToMainCity = ({ uid = "", profile = {}, economy = null, losses = 0 } = {}) => {
      const recovered = Math.floor(Math.max(0, safeNumber(losses, 0)) * getSkillPercent(profile, "fieldMedics") / 100);
      if (!uid || recovered <= 0 || !economy) return 0;
      const mainInfo = getMainCityInfo(profile);
      if (!mainInfo?.ref) return 0;
      const entry = getEconomyCityByRef(economy, mainInfo.ref);
      const city = entry?.city;
      if (!city || getOwnerUid(city) !== uid) return 0;
      const troopFloat = Math.max(0, safeNumber(city.troopFloat, city.troops || 0)) + recovered;
      const patch = {
        troops: Math.max(0, Math.floor(troopFloat)),
        troopFloat,
        productionUpdatedAtMs: nowMs,
      };
      transaction.set(mainInfo.ref, cleanCityUpdate(city, patch), { merge: true });
      cityUpdates.push({ id: city.id, regionId: mainInfo.regionId, ...patch });
      entry.city = { ...city, ...patch };
      return recovered;
    };

    const troopCount = Math.max(0, Math.floor(safeNumber(army.troops, 0)));
    const defenderBonuses = defenderEconomy?.bonuses || {};
    const targetStats = getCityStats(target, defenderProfile, defenderBonuses);
    const attackerName = safeString(army.ownerName || attackerProfile.playerName || "Rival ruler", 40);
    const defenderName = defenderUid
      ? safeString(target.ownerName || defenderProfile.playerName || "Rival ruler", 40)
      : "Neutral city";

    if (army.kind === "scout") {
      if (isProtectedMainCity(target, attackerUid)) {
        writeParticipantEconomies();
        const returned = returnTroopsToSource(troopCount);
        const report = makeReport({
          id: `${armyId}_scout_blocked_${attackerUid}`,
          uid: attackerUid,
          type: "scout",
          outcome: "scout",
          city: target,
          opponentName: defenderName,
          sentTroops: troopCount,
          troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
          totalDefense: targetStats.totalDefense,
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

      if (defenderUid && defenderUid !== attackerUid && isVeilOfSilenceActive(defenderProfile, nowMs)) {
        writeParticipantEconomies();
        const returned = returnTroopsToSource(troopCount);
        const report = makeReport({
          id: `${armyId}_scout_veiled_${attackerUid}`,
          uid: attackerUid,
          type: "scout",
          outcome: "scout",
          city: target,
          opponentName: defenderName,
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
        writeParticipantEconomies();
        const nextTroops = Math.max(0, Math.floor(safeNumber(target.troops, 0))) + troopCount;
        transaction.set(targetRef, cleanCityUpdate(target, {
          troops: nextTroops,
          troopFloat: Math.max(0, safeNumber(target.troopFloat, target.troops || 0)) + troopCount,
        }), { merge: true });
        cityUpdates.push({ id: target.id, regionId: targetRegionId, troops: nextTroops });
        markResolved({ kind: "scout", joinedOwnCity: true });
        return { ok: true, status: "resolved", kind: "scout", cityUpdates: withEconomyCityUpdates(cityUpdates) };
      }

      writeParticipantEconomies();
      const scoutReport = createScoutReportSnapshot(target, defenderProfile, nowMs, defenderBonuses);
      const report = makeReport({
        id: `${armyId}_scout_${attackerUid}`,
        uid: attackerUid,
        type: "scout",
        outcome: "scout",
        city: target,
        opponentName: defenderName,
        sentTroops: troopCount,
        troopCount: scoutReport.troops,
        totalDefense: scoutReport.totalDefense,
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

    const effectiveKind = army.kind === "transfer" && defenderUid === attackerUid ? "transfer" : "attack";
    if (effectiveKind === "transfer") {
      writeParticipantEconomies();
      const nextTroops = Math.max(0, Math.floor(safeNumber(target.troops, 0))) + troopCount;
      transaction.set(targetRef, cleanCityUpdate(target, {
        troops: nextTroops,
        troopFloat: Math.max(0, safeNumber(target.troopFloat, target.troops || 0)) + troopCount,
      }), { merge: true });
      cityUpdates.push({ id: target.id, regionId: targetRegionId, troops: nextTroops });
      markResolved({ kind: "transfer", troops: troopCount });
      return { ok: true, status: "resolved", kind: "transfer", cityUpdates: withEconomyCityUpdates(cityUpdates) };
    }

    if (isProtectedMainCity(target, attackerUid)) {
      writeParticipantEconomies();
      const returned = returnTroopsToSource(troopCount);
      const attackerReport = makeReport({
        id: `${armyId}_attack_blocked_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: "defeat",
        city: target,
        opponentName: defenderName,
        sentTroops: troopCount,
        troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
        totalDefense: targetStats.totalDefense,
        summary: `Main cities cannot be attacked. ${returned.toLocaleString()} troops returned.`,
        nowMs,
      });
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap);
      reports.push(attackerReport);
      markResolved({ kind: "attack", blocked: "main_city", returned });
      return { ok: true, status: "resolved", kind: "attack", reports: reportsForCaller(), cityUpdates: withEconomyCityUpdates(cityUpdates) };
    }

    if (isCityShielded(target, attackerUid, nowMs)) {
      writeParticipantEconomies();
      const returned = returnTroopsToSource(troopCount);
      const attackerReport = makeReport({
        id: `${armyId}_attack_shielded_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: "defeat",
        city: target,
        opponentName: defenderName,
        sentTroops: troopCount,
        troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
        totalDefense: targetStats.totalDefense,
        summary: `Royal Peace Shield blocked the attack. ${returned.toLocaleString()} troops returned.`,
        nowMs,
      });
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap);
      reports.push(attackerReport);
      markResolved({ kind: "attack", blocked: "shield", returned });
      return { ok: true, status: "resolved", kind: "attack", reports: reportsForCaller(), cityUpdates: withEconomyCityUpdates(cityUpdates) };
    }

    const oldOwnerUid = defenderUid;
    const defendersAtStart = Math.max(0, Math.floor(safeNumber(target.troops, 0)));
    const demoAttack = normalizeDemoAttackSnapshot(army.demoAttack);
    const result = calculateCombatResult(troopCount, target, attackerProfile, defenderProfile, { demoAttack, defenderBonuses });
    const givenUpNeutralTarget = isGivenUpNeutralCity(target);
    const attackWinXp = demoAttack || givenUpNeutralTarget ? 0 : getCaptureXpAward(target, oldOwnerUid, result.defenderLosses, defenderProfile);
    const attackFailXp = demoAttack || givenUpNeutralTarget ? 0 : getPartialBattleXpAward(getCaptureXpAward(target, oldOwnerUid, defendersAtStart, defenderProfile));
    const defenseHeldXp = applyDemoDefenderXpMultiplier(getDefenseHeldXpAward(troopCount, target, defenderProfile), demoAttack);
    const defenseLostXp = getPartialBattleXpAward(defenseHeldXp);
    const attackerProgress = buildPlayerProgressPatch(attackerProfile, {
      xp: result.success ? attackWinXp : attackFailXp,
    });
    const defenderProgress = defenderUid
      ? buildPlayerProgressPatch(defenderProfile || {}, {
        xp: result.success ? defenseLostXp : defenseHeldXp,
      })
      : null;

    if (result.success) {
      const daily = normalizeDaily(attackerProfile.daily);
      if (!oldOwnerUid && !isStronghold(target) && daily.neutralCaptures >= DAILY_NEUTRAL_CAPTURE_LIMIT) {
        const blockedTroops = givenUpNeutralTarget ? 0 : Math.max(1, Math.floor(safeNumber(target.troops, 1)));
        const blockedTroopFloat = givenUpNeutralTarget ? 0 : Math.max(1, safeNumber(target.troopFloat, target.troops || 1));
        const blockedPatch = {
          troops: blockedTroops,
          troopFloat: blockedTroopFloat,
          ...(givenUpNeutralTarget ? {
            relinquishedAtMs: timestampToMs(target.relinquishedAtMs),
            relocatedAtMs: timestampToMs(target.relocatedAtMs),
          } : {}),
        };
        transaction.set(targetRef, cleanCityUpdate(target, blockedPatch), { merge: true });
        cityUpdates.push({ id: target.id, regionId: targetRegionId, ...blockedPatch });
        writeParticipantEconomies();
        const blockedReport = makeReport({
          id: `${armyId}_capture_limit_${attackerUid}`,
          uid: attackerUid,
          type: "attack",
          outcome: "defeat",
          city: target,
          opponentName: defenderName,
          sentTroops: troopCount,
          troopCount: defendersAtStart,
          result,
          totalDefense: targetStats.totalDefense,
          summary: "Daily neutral capture limit reached. The city could not be captured.",
          nowMs,
        });
        writeReport(transaction, attackerUid, blockedReport, attackerProfileSnap);
        reports.push(blockedReport);
        markResolved({ kind: "attack", blocked: "capture_limit" });
        return { ok: true, status: "resolved", kind: "attack", reports: reportsForCaller(), cityUpdates: withEconomyCityUpdates(cityUpdates) };
      }

      const nextLevel = dropCapturedCityLevel(target);
      const targetPatch = {
        ownerKind: "player",
        ownerUid: attackerUid,
        ownerName: attackerName,
        ownerFlag: army.ownerFlag || attackerProfile.flag || null,
        ownerKingPower: Math.max(0, Math.floor(safeNumber(army.ownerKingPower || attackerProfile.kingPower, 0))),
        ownerShieldExpiresAtMs: 0,
        troops: result.survivors,
        troopFloat: result.survivors,
        level: nextLevel,
        defense: 1,
        investedGold: 0,
        lastCapturedAtMs: nowMs,
        isMainCity: false,
        relinquishedAtMs: 0,
        relocatedAtMs: 0,
      };
      transaction.set(targetRef, cleanCityUpdate(target, targetPatch), { merge: true });
      cityUpdates.push({ id: target.id, regionId: targetRegionId, ...targetPatch });

      const attackerReport = makeReport({
        id: `${armyId}_attack_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: "victory",
        city: { ...target, level: clampCityLevel(target.level) },
        opponentName: defenderName,
        sentTroops: troopCount,
        troopCount: defendersAtStart,
        result,
        totalDefense: targetStats.totalDefense,
        summary: `Captured with ${result.survivors.toLocaleString()} survivors. Level ${clampCityLevel(target.level).toLocaleString()} to ${nextLevel.toLocaleString()}. +${attackerProgress.xpAwarded.toLocaleString()} XP.`,
        xpAwarded: attackerProgress.xpAwarded,
        goldAwarded: attackerProgress.goldAwarded,
        characterAfter: attackerProgress.character,
        goldAfter: attackerProgress.gold,
        nowMs,
      });
      const attackerDaily = !oldOwnerUid && !isStronghold(target)
        ? { daily: { ...daily, neutralCaptures: daily.neutralCaptures + 1 } }
        : {};
      writeParticipantEconomies({
        character: attackerProgress.character,
        gold: attackerProgress.gold,
        goldFloat: attackerProgress.goldFloat,
        ...attackerDaily,
      }, defenderProgress ? {
        character: defenderProgress.character,
        gold: defenderProgress.gold,
        goldFloat: defenderProgress.goldFloat,
      } : {});
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
          losses: result.defenderLosses,
        })
        : 0;
      if (attackerRecoveredTroops > 0) {
        attackerReport.summary = `${attackerReport.summary} Field Medics returned ${attackerRecoveredTroops.toLocaleString()} troops to your main city.`;
      }
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
          sentTroops: troopCount,
          troopCount: defendersAtStart,
          result,
          totalDefense: targetStats.totalDefense,
          summary: `${target.name || target.id} was captured by ${attackerName}. Level ${clampCityLevel(target.level).toLocaleString()} to ${nextLevel.toLocaleString()}. +${defenderProgress.xpAwarded.toLocaleString()} XP.${defenderRecoveredTroops > 0 ? ` Field Medics returned ${defenderRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
          xpAwarded: defenderProgress.xpAwarded,
          goldAwarded: defenderProgress.goldAwarded,
          characterAfter: defenderProgress.character,
          goldAfter: defenderProgress.gold,
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
      troops: result.defendersLeft,
      troopFloat: result.defendersLeft,
    };
    transaction.set(targetRef, cleanCityUpdate(target, targetPatch), { merge: true });
    cityUpdates.push({ id: target.id, regionId: targetRegionId, ...targetPatch });

    const attackerReport = makeReport({
      id: `${armyId}_attack_${attackerUid}`,
      uid: attackerUid,
      type: "attack",
      outcome: "defeat",
      city: target,
      opponentName: defenderName,
      sentTroops: troopCount,
      troopCount: defendersAtStart,
      result,
      totalDefense: targetStats.totalDefense,
      summary: `${result.defendersLeft.toLocaleString()} defenders remained. +${attackerProgress.xpAwarded.toLocaleString()} XP.`,
      xpAwarded: attackerProgress.xpAwarded,
      goldAwarded: attackerProgress.goldAwarded,
      characterAfter: attackerProgress.character,
      goldAfter: attackerProgress.gold,
      nowMs,
    });
    writeParticipantEconomies({
      character: attackerProgress.character,
      gold: attackerProgress.gold,
      goldFloat: attackerProgress.goldFloat,
    }, defenderProgress ? {
      character: defenderProgress.character,
      gold: defenderProgress.gold,
      goldFloat: defenderProgress.goldFloat,
    } : {});
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
        losses: result.defenderLosses,
      })
      : 0;
    if (attackerRecoveredTroops > 0) {
      attackerReport.summary = `${attackerReport.summary} Field Medics returned ${attackerRecoveredTroops.toLocaleString()} troops to your main city.`;
    }
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
        sentTroops: troopCount,
        troopCount: defendersAtStart,
        result,
        totalDefense: targetStats.totalDefense,
        summary: `${target.name || target.id} survived with ${result.defendersLeft.toLocaleString()} defenders. +${defenderProgress.xpAwarded.toLocaleString()} XP.${defenderRecoveredTroops > 0 ? ` Field Medics returned ${defenderRecoveredTroops.toLocaleString()} troops to your main city.` : ""}`,
        xpAwarded: defenderProgress.xpAwarded,
        goldAwarded: defenderProgress.goldAwarded,
        characterAfter: defenderProgress.character,
        goldAfter: defenderProgress.gold,
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
      outcome: "defeat",
      defendersLeft: result.defendersLeft,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
    });
    return {
      ok: true,
      status: "resolved",
      kind: "attack",
      outcome: "defeat",
      reports: reportsForCaller(),
      cityUpdates: withEconomyCityUpdates(cityUpdates),
      currentUser: profilePatchForCaller(attackerProgress, defenderProgress),
    };
  });
}

exports.resolveArmyOrder = onCall({ region: "us-central1", maxInstances: 30, invoker: "public" }, async request => {
  const callerUid = requireAuth(request);
  const data = request.data || {};
  const armyId = safeString(data.armyId || data.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const requestedRegions = normalizeRegionIds(data.routeRegionIds || data.regionIds || []);
  return resolveArmyOrderById({ armyId, requestedRegions, callerUid });
});

function getScheduledArmyDedupeKey(armyId = "", ownerUid = "") {
  return `${safeString(ownerUid, 128)}:${safeString(armyId, 96)}`;
}

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
  const snap = await db.collectionGroup("armies")
    .where("status", "==", "active")
    .where("arrivesAtMs", "<=", nowMs)
    .orderBy("arrivesAtMs", "asc")
    .limit(SCHEDULED_ARMY_RESOLVE_SCAN_LIMIT)
    .get();
  const targetsByKey = new Map();
  snap.docs.forEach(doc => {
    const target = getScheduledArmyTarget(doc);
    if (!target) return;
    const key = getScheduledArmyDedupeKey(target.armyId, target.ownerUid);
    if (!targetsByKey.has(key)) targetsByKey.set(key, target);
  });
  return Array.from(targetsByKey.values())
    .sort((a, b) => a.arrivesAtMs - b.arrivesAtMs)
    .slice(0, SCHEDULED_ARMY_RESOLVE_MAX_PER_RUN);
}

function isExpectedScheduledResolveError(error = {}) {
  const code = String(error.code || "");
  const message = String(error.message || error || "");
  return code === "failed-precondition" && /not arrived/i.test(message);
}

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

  for (const target of targets) {
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
        continue;
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
  }

  console.log("Scheduled army resolution finished", {
    scanned: targets.length,
    resolved,
    skipped,
    failed,
  });
});
