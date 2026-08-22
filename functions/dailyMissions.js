const crypto = require("node:crypto");

const DAILY_MISSION_VERSION = 1;
const DAILY_MISSION_SCHEMA_VERSION = 2;
const DAILY_MISSION_COUNT = 3;
const DAILY_MISSION_REROLLS = 1;
const DAILY_MISSION_EVENT_RETENTION_MS = 48 * 60 * 60 * 1000;
const MILITARY_SELECTION_GROUP = "military";
const TROOP_TARGET_RATIOS = Object.freeze({ easy: 0.05, medium: 0.1, hard: 0.15 });

const DIFFICULTY = Object.freeze({
  easy: Object.freeze({ id: "easy", rewardHours: 0.5, effortHours: 1, fixedScale: 1 }),
  medium: Object.freeze({ id: "medium", rewardHours: 1, effortHours: 2, fixedScale: 2 }),
  hard: Object.freeze({ id: "hard", rewardHours: 2, effortHours: 4, fixedScale: 3 }),
});

const DIFFICULTY_WEIGHTS = Object.freeze({
  early: Object.freeze({ easy: 60, medium: 35, hard: 5 }),
  established: Object.freeze({ easy: 35, medium: 50, hard: 15 }),
  powerful: Object.freeze({ easy: 20, medium: 50, hard: 30 }),
});

const MISSION_FAMILIES = Object.freeze({
  ENEMY_CITY_CAPTURE: Object.freeze({ group: "combat", title: "Conqueror", rewardType: "troops", icon: "city" }),
  BATTLE_WINS: Object.freeze({ group: "combat", title: "Battle-Hardened", rewardType: "troops", icon: "swords" }),
  ENEMY_TROOPS_DEFEATED: Object.freeze({ group: "combat", title: "Break Their Ranks", rewardType: "troops", icon: "helmet" }),
  ATTACK_COUNT: Object.freeze({ group: "combat", title: "Raise the Banners", rewardType: "troops", icon: "banner" }),
  UNIQUE_PLAYERS_ATTACKED: Object.freeze({ group: "combat", title: "Widen the War", rewardType: "troops", icon: "targets" }),
  TROOPS_SENT_TO_BATTLE: Object.freeze({ group: "combat", title: "Muster the Host", rewardType: "troops", icon: "march" }),
  CAMP_CAPTURE_COUNT: Object.freeze({ group: "camps", title: "Camp Raider", rewardType: "troops", icon: "camp" }),
  GOLD_CAMP_CAPTURE: Object.freeze({ group: "camps", title: "Seize the Tribute", rewardType: "gold", icon: "gold" }),
  WARBAND_CAMP_CAPTURE: Object.freeze({ group: "camps", title: "Break the Warband", rewardType: "troops", icon: "warband" }),
  RELIC_CAMP_CAPTURE: Object.freeze({ group: "camps", title: "Claim the Relic", rewardType: "gold", icon: "relic" }),
  DEED_CAMP_COMPLETE: Object.freeze({ group: "camps", title: "Complete the Deed", rewardType: "gold", icon: "deed" }),
  UNIQUE_CAMP_TYPES: Object.freeze({ group: "camps", title: "Master of Camps", rewardType: "troops", icon: "camp-types" }),
  TOTAL_CITY_LEVEL_UPGRADES: Object.freeze({ group: "growth", title: "Strengthen the Realm", rewardType: "gold", icon: "upgrade" }),
  SINGLE_CITY_UPGRADE: Object.freeze({ group: "growth", title: "Raise a Great City", rewardType: "gold", icon: "tower" }),
  UNIQUE_CITIES_UPGRADED: Object.freeze({ group: "growth", title: "Build Across the Realm", rewardType: "gold", icon: "cities" }),
  GOLD_SPENT_ON_UPGRADES: Object.freeze({ group: "growth", title: "Invest in the Realm", rewardType: "gold", icon: "hammer" }),
  GOLD_EARNED: Object.freeze({ group: "economy", title: "Fill the Treasury", rewardType: "gold", icon: "treasury" }),
  TROOPS_PRODUCED: Object.freeze({ group: "economy", title: "Muster the Levies", rewardType: "troops", icon: "troops" }),
  STRONGHOLD_ATTACK: Object.freeze({ group: "stronghold", activityKey: "stronghold-attacks", title: "Test the Stronghold", rewardType: "troops", icon: "stronghold" }),
  STRONGHOLD_ATTACK_COUNT: Object.freeze({ group: "stronghold", activityKey: "stronghold-attacks", title: "Siege Campaign", rewardType: "troops", icon: "siege" }),
  STRONGHOLD_TROOPS_SENT: Object.freeze({ group: "stronghold", title: "March on the Strongholds", rewardType: "troops", icon: "stronghold-march" }),
  CLAN_GIFT: Object.freeze({ group: "clan", title: "Support the Clan", rewardType: "gold", icon: "gift" }),
});

const FIXED_TARGETS = Object.freeze({
  ENEMY_CITY_CAPTURE: Object.freeze({ easy: 1, medium: 1, hard: 1 }),
  BATTLE_WINS: Object.freeze({ easy: 1, medium: 1, hard: 1 }),
  ATTACK_COUNT: Object.freeze({ easy: 1, medium: 2, hard: 3 }),
  UNIQUE_PLAYERS_ATTACKED: Object.freeze({ easy: 1, medium: 1, hard: 2 }),
  CAMP_CAPTURE_COUNT: Object.freeze({ easy: 1, medium: 1, hard: 2 }),
  UNIQUE_CAMP_TYPES: Object.freeze({ easy: 1, medium: 1, hard: 2 }),
  STRONGHOLD_ATTACK: Object.freeze({ easy: 1, medium: 1, hard: 1 }),
  STRONGHOLD_ATTACK_COUNT: Object.freeze({ easy: 1, medium: 1, hard: 2 }),
});

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, safeNumber(value, minimum)));
}

function clampInt(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.floor(clamp(value, minimum, maximum));
}

function safeString(value, maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

function getMissionSelectionGroup(family = "") {
  const group = MISSION_FAMILIES[family]?.group || "";
  return ["combat", "stronghold"].includes(group) ? MILITARY_SELECTION_GROUP : group;
}

function normalizeRecommendedTarget(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const cityId = safeString(raw.cityId || raw.id, 96);
  const regionId = safeString(raw.regionId, 80);
  if (!cityId || !regionId) return null;
  return {
    cityId,
    regionId,
    cityName: safeString(raw.cityName || raw.name || "Enemy City", 80),
    sourceCityId: safeString(raw.sourceCityId, 96),
    sourceRegionId: safeString(raw.sourceRegionId, 80),
    sourceCityName: safeString(raw.sourceCityName, 80),
    recommendedTroops: Math.max(1, clampInt(raw.recommendedTroops, 1)),
    estimatedLosses: Math.max(0, clampInt(raw.estimatedLosses, 0)),
    evaluatedAtMs: Math.max(0, clampInt(raw.evaluatedAtMs, 0)),
  };
}

function getUtcDateKey(nowMs = Date.now()) {
  return new Date(Math.max(0, safeNumber(nowMs, Date.now()))).toISOString().slice(0, 10);
}

function getDailyMissionCycle(nowMs = Date.now(), resetGeneration = "") {
  const serverTimeMs = Math.max(0, Math.floor(safeNumber(nowMs, Date.now())));
  const date = new Date(serverTimeMs);
  const startsAtMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const resetsAtMs = startsAtMs + 24 * 60 * 60 * 1000;
  const utcDate = getUtcDateKey(serverTimeMs);
  const reset = safeString(resetGeneration, 100).replace(/[^a-zA-Z0-9_-]/g, "_") || "realm";
  return {
    utcDate,
    cycleKey: `${reset}_${utcDate}`,
    startsAtMs,
    resetsAtMs,
    serverTimeMs,
    remainingHours: Math.max(0, (resetsAtMs - serverTimeMs) / 3_600_000),
  };
}

function createSeededRandom(seedInput = "") {
  const digest = crypto.createHash("sha256").update(String(seedInput)).digest();
  let state = digest.readUInt32LE(0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function shuffled(values = [], random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function chooseWeightedDifficulty(capacityBand = "early", random = Math.random) {
  const weights = DIFFICULTY_WEIGHTS[capacityBand] || DIFFICULTY_WEIGHTS.early;
  const roll = random() * 100;
  if (roll < weights.easy) return "easy";
  if (roll < weights.easy + weights.medium) return "medium";
  return "hard";
}

function downgradeDifficulty(difficulty = "easy", predicate = () => true) {
  const order = difficulty === "hard" ? ["hard", "medium", "easy"] : difficulty === "medium" ? ["medium", "easy"] : ["easy"];
  return order.find(candidate => predicate(candidate)) || "";
}

function roundMissionTarget(value = 0) {
  const amount = Math.max(1, Math.floor(safeNumber(value, 1)));
  if (amount < 100) return amount;
  const magnitude = 10 ** Math.max(0, String(amount).length - 2);
  return Math.max(1, Math.floor(amount / magnitude) * magnitude);
}

function normalizeCapacity(raw = {}) {
  const cityCount = Math.max(1, clampInt(raw.cityCount, 1));
  const remainingHours = clamp(raw.remainingHours, 0, 24);
  const goldPerHour = Math.max(1, clampInt(raw.goldPerHour, 1));
  const troopPerHour = Math.max(1, clampInt(raw.troopPerHour, 1));
  const rewardGoldPerHour = Math.max(1, clampInt(raw.rewardGoldPerHour ?? raw.baseGoldPerHour ?? goldPerHour, 1));
  const rewardTroopPerHour = Math.max(1, clampInt(raw.rewardTroopPerHour ?? raw.baseTroopPerHour ?? troopPerHour, 1));
  const launchableTroops = Math.max(0, clampInt(raw.launchableTroops, 0));
  const maxSourceTroops = Math.max(0, clampInt(raw.maxSourceTroops, launchableTroops));
  const projectedCombatTroops = Math.max(
    launchableTroops,
    clampInt(raw.projectedCombatTroops, launchableTroops + troopPerHour * Math.min(12, remainingHours))
  );
  const feasibleCampTypes = [...new Set((Array.isArray(raw.feasibleCampTypes) ? raw.feasibleCampTypes : [])
    .map(type => safeString(type, 24).toLowerCase())
    .filter(type => ["gold", "troops", "items", "deed"].includes(type)))];
  const itemCosts = raw.itemCosts && typeof raw.itemCosts === "object" ? raw.itemCosts : {};
  const safePvpTargets = (Array.isArray(raw.safePvpTargets) ? raw.safePvpTargets : [])
    .map(normalizeRecommendedTarget)
    .filter(Boolean)
    .slice(0, 12);
  return {
    cityCount,
    totalCityLevels: Math.max(cityCount, clampInt(raw.totalCityLevels, cityCount)),
    averageCityLevel: Math.max(1, safeNumber(raw.averageCityLevel, 1)),
    gold: Math.max(0, clampInt(raw.gold, 0)),
    goldPerHour,
    troopPerHour,
    rewardGoldPerHour,
    rewardTroopPerHour,
    launchableTroops,
    maxSourceTroops,
    qualifyingAttackTroops: Math.max(1, clampInt(raw.qualifyingAttackTroops, Math.ceil(launchableTroops * 0.05))),
    projectedCombatTroops,
    kingPower: Math.max(0, clampInt(raw.kingPower, 0)),
    eligibleOpponentCount: Math.max(0, clampInt(raw.eligibleOpponentCount, 0)),
    eligibleEnemyCityCount: Math.max(0, clampInt(raw.eligibleEnemyCityCount, 0)),
    safePvpTargets,
    maxCampCaptures: Math.max(0, clampInt(raw.maxCampCaptures, feasibleCampTypes.length)),
    feasibleCampTypes,
    deedCampEligible: Boolean(raw.deedCampEligible),
    strongholdEligible: Boolean(raw.strongholdEligible),
    clanGiftEligible: Boolean(raw.clanGiftEligible),
    remainingHours,
    upgradeTargets: raw.upgradeTargets && typeof raw.upgradeTargets === "object" ? raw.upgradeTargets : {},
    itemCosts,
  };
}

function getCapacitySnapshot(capacity = {}) {
  const { rewardGoldPerHour, rewardTroopPerHour, ...snapshot } = capacity;
  return snapshot;
}

function getCapacityBand(capacity = {}) {
  if (capacity.cityCount >= 11) return "powerful";
  if (capacity.cityCount >= 4) return "established";
  return "early";
}

function getScaledEffort(difficulty = "easy", remainingHours = 24) {
  const config = DIFFICULTY[difficulty] || DIFFICULTY.easy;
  const targetHours = Math.max(
    1 / 600,
    Math.min(config.effortHours, Math.max(1 / 600, remainingHours * 0.5))
  );
  const ratio = clamp(targetHours / config.effortHours, 0.05, 1);
  return {
    targetHours,
    ratio,
    rewardHours: Math.max(0.1, Math.round(config.rewardHours * ratio * 10) / 10),
  };
}

function getUpgradeValue(capacity = {}, family = "", difficulty = "easy") {
  const values = capacity.upgradeTargets?.[difficulty] || {};
  if (family === "TOTAL_CITY_LEVEL_UPGRADES") return clampInt(values.totalLevels, 0);
  if (family === "SINGLE_CITY_UPGRADE") return clampInt(values.singleCityLevels, 0);
  if (family === "UNIQUE_CITIES_UPGRADED") return clampInt(values.uniqueCities, 0);
  if (family === "GOLD_SPENT_ON_UPGRADES") return clampInt(values.goldSpendTarget, 0);
  return 0;
}

function isDifficultyFeasible(family = "", difficulty = "easy", capacity = {}) {
  const fixedTarget = FIXED_TARGETS[family]?.[difficulty] || 0;
  if (["ENEMY_CITY_CAPTURE", "BATTLE_WINS"].includes(family)) return difficulty === "easy"
    && fixedTarget === 1
    && capacity.safePvpTargets.length > 0
    && capacity.remainingHours >= 0.75;
  if (family === "ATTACK_COUNT") return capacity.eligibleOpponentCount > 0
    && capacity.maxSourceTroops >= capacity.qualifyingAttackTroops
    && capacity.remainingHours >= fixedTarget / 600;
  if (family === "UNIQUE_PLAYERS_ATTACKED") return fixedTarget > 0
    && capacity.eligibleOpponentCount >= fixedTarget
    && capacity.maxSourceTroops >= capacity.qualifyingAttackTroops
    && capacity.remainingHours >= fixedTarget / 600;
  if (["ENEMY_TROOPS_DEFEATED", "TROOPS_SENT_TO_BATTLE"].includes(family)) return capacity.eligibleOpponentCount > 0
    && capacity.launchableTroops > 0
    && capacity.maxSourceTroops >= capacity.qualifyingAttackTroops
    && capacity.remainingHours >= (family === "ENEMY_TROOPS_DEFEATED" ? 0.5 : 1 / 600);
  if (family === "CAMP_CAPTURE_COUNT") return fixedTarget > 0
    && capacity.maxCampCaptures >= fixedTarget
    && capacity.remainingHours >= fixedTarget * 0.5;
  if (family === "GOLD_CAMP_CAPTURE") return capacity.feasibleCampTypes.includes("gold") && capacity.remainingHours >= 0.5;
  if (family === "WARBAND_CAMP_CAPTURE") return capacity.feasibleCampTypes.includes("troops") && capacity.remainingHours >= 0.5;
  if (family === "RELIC_CAMP_CAPTURE") return capacity.feasibleCampTypes.includes("items") && capacity.remainingHours >= 0.5;
  if (family === "DEED_CAMP_COMPLETE") return capacity.deedCampEligible && capacity.feasibleCampTypes.includes("deed");
  if (family === "UNIQUE_CAMP_TYPES") return fixedTarget > 0
    && capacity.feasibleCampTypes.length >= fixedTarget
    && capacity.remainingHours >= fixedTarget * 0.5;
  if (["TOTAL_CITY_LEVEL_UPGRADES", "SINGLE_CITY_UPGRADE", "UNIQUE_CITIES_UPGRADED", "GOLD_SPENT_ON_UPGRADES"].includes(family)) {
    return getUpgradeValue(capacity, family, difficulty) > 0;
  }
  if (["GOLD_EARNED", "TROOPS_PRODUCED"].includes(family)) return capacity.remainingHours >= 1 / 60;
  if (["STRONGHOLD_ATTACK", "STRONGHOLD_ATTACK_COUNT", "STRONGHOLD_TROOPS_SENT"].includes(family)) {
    const launchCount = family === "STRONGHOLD_ATTACK_COUNT" ? Math.max(1, fixedTarget) : 1;
    return capacity.strongholdEligible
      && capacity.launchableTroops >= capacity.qualifyingAttackTroops
      && capacity.maxSourceTroops >= capacity.qualifyingAttackTroops
      && capacity.remainingHours >= launchCount / 600;
  }
  if (family === "CLAN_GIFT") return capacity.clanGiftEligible;
  return false;
}

function getMissionTarget(family = "", difficulty = "easy", capacity = {}) {
  const fixedTarget = FIXED_TARGETS[family]?.[difficulty];
  if (fixedTarget) return fixedTarget;
  const effort = getScaledEffort(difficulty, capacity.remainingHours);
  if (["ENEMY_TROOPS_DEFEATED", "TROOPS_SENT_TO_BATTLE", "STRONGHOLD_TROOPS_SENT"].includes(family)) {
    return roundMissionTarget(capacity.launchableTroops * (TROOP_TARGET_RATIOS[difficulty] || TROOP_TARGET_RATIOS.easy));
  }
  if (["TOTAL_CITY_LEVEL_UPGRADES", "SINGLE_CITY_UPGRADE", "UNIQUE_CITIES_UPGRADED", "GOLD_SPENT_ON_UPGRADES"].includes(family)) {
    return Math.max(1, getUpgradeValue(capacity, family, difficulty));
  }
  if (family === "GOLD_EARNED") return roundMissionTarget(capacity.goldPerHour * effort.targetHours);
  if (family === "TROOPS_PRODUCED") return roundMissionTarget(capacity.troopPerHour * effort.targetHours);
  if (["GOLD_CAMP_CAPTURE", "WARBAND_CAMP_CAPTURE", "RELIC_CAMP_CAPTURE", "DEED_CAMP_COMPLETE", "CLAN_GIFT"].includes(family)) return 1;
  return 1;
}

function getMissionDescription(family = "", target = 1) {
  const count = Math.max(1, clampInt(target, 1));
  const plural = (singular, multiple = `${singular}s`) => count === 1 ? singular : multiple;
  const descriptions = {
    ENEMY_CITY_CAPTURE: `Capture ${count} enemy ${plural("city", "cities")}`,
    BATTLE_WINS: `Win ${count} offensive ${plural("battle")}`,
    ENEMY_TROOPS_DEFEATED: `Defeat ${count.toLocaleString("en-US")} enemy troops`,
    ATTACK_COUNT: `Launch ${count} ${plural("attack")}`,
    UNIQUE_PLAYERS_ATTACKED: `Attack ${count} different ${plural("player")}`,
    TROOPS_SENT_TO_BATTLE: `Send ${count.toLocaleString("en-US")} troops into battle`,
    CAMP_CAPTURE_COUNT: `Capture ${count} ${plural("camp")}`,
    GOLD_CAMP_CAPTURE: "Capture the Gold Camp once",
    WARBAND_CAMP_CAPTURE: "Capture the Warband Camp once",
    RELIC_CAMP_CAPTURE: "Capture the Relic Camp once",
    DEED_CAMP_COMPLETE: "Complete the Deed Camp once",
    UNIQUE_CAMP_TYPES: `Capture ${count} different camp types`,
    TOTAL_CITY_LEVEL_UPGRADES: `Upgrade cities by ${count} total ${plural("level")}`,
    SINGLE_CITY_UPGRADE: `Upgrade one city by ${count} ${plural("level")}`,
    UNIQUE_CITIES_UPGRADED: `Upgrade ${count} different ${plural("city", "cities")}`,
    GOLD_SPENT_ON_UPGRADES: `Spend ${count.toLocaleString("en-US")} Gold on city upgrades`,
    GOLD_EARNED: `Earn ${count.toLocaleString("en-US")} Gold from production`,
    TROOPS_PRODUCED: `Produce ${count.toLocaleString("en-US")} troops`,
    STRONGHOLD_ATTACK: "Attack any Stronghold once",
    STRONGHOLD_ATTACK_COUNT: `Attack Strongholds ${count} ${plural("time")}`,
    STRONGHOLD_TROOPS_SENT: `Send ${count.toLocaleString("en-US")} troops against Strongholds`,
    CLAN_GIFT: "Send one Clan Gift",
  };
  return descriptions[family] || "Complete the mission";
}

function getHardItemCandidates(family = "") {
  const definition = MISSION_FAMILIES[family] || {};
  if (definition.group === "growth" || definition.group === "economy" && definition.rewardType === "gold") {
    return ["royal_tax_decree_30m"];
  }
  if (definition.group === "stronghold") return ["swift_march_order", "recall_horn"];
  if (definition.rewardType === "troops") return ["war_drums_30m"];
  return [];
}

function createReward(family = "", difficulty = "easy", capacity = {}, random = Math.random) {
  const definition = MISSION_FAMILIES[family] || MISSION_FAMILIES.GOLD_EARNED;
  const specialHalfHour = ["GOLD_CAMP_CAPTURE", "WARBAND_CAMP_CAPTURE", "RELIC_CAMP_CAPTURE", "DEED_CAMP_COMPLETE", "CLAN_GIFT"].includes(family);
  const effort = getScaledEffort(difficulty, capacity.remainingHours);
  const productionHours = specialHalfHour ? 0.5 : effort.rewardHours;
  const intendedRate = definition.rewardType === "troops"
    ? capacity.rewardTroopPerHour
    : capacity.rewardGoldPerHour;
  const lockedAmount = Math.max(1, Math.floor(intendedRate * productionHours));

  if (difficulty === "hard" && !specialHalfHour && random() < 0.2) {
    const intendedGoldEquivalent = Math.max(1, capacity.goldPerHour * DIFFICULTY.hard.rewardHours);
    const eligibleItems = getHardItemCandidates(family).filter(itemId => {
      const cost = Math.max(0, safeNumber(capacity.itemCosts[itemId], 0));
      return cost >= intendedGoldEquivalent * 0.75 && cost <= intendedGoldEquivalent * 1.5;
    });
    if (eligibleItems.length) {
      const itemId = eligibleItems[Math.floor(random() * eligibleItems.length)];
      return {
        type: "item",
        itemId,
        lockedAmount: 1,
        productionHours,
        equivalentGold: Math.max(0, clampInt(capacity.itemCosts[itemId], 0)),
      };
    }
  }

  return {
    type: definition.rewardType,
    lockedAmount,
    productionHours,
  };
}

function createMissionRecord({ family, difficulty, capacity, random, slot, revision = 0, nowMs, seed }) {
  const definition = MISSION_FAMILIES[family];
  if (!definition) return null;
  const target = getMissionTarget(family, difficulty, capacity);
  const missionIdHash = crypto.createHash("sha256")
    .update(`${seed}|${slot}|${revision}|${family}|${difficulty}`)
    .digest("hex")
    .slice(0, 18);
  const recommendedTarget = ["ENEMY_CITY_CAPTURE", "BATTLE_WINS"].includes(family)
    ? normalizeRecommendedTarget(capacity.safePvpTargets[Math.floor(random() * capacity.safePvpTargets.length)])
    : null;
  return {
    id: `dm_${missionIdHash}`,
    slot,
    family,
    activityGroup: definition.group,
    selectionGroup: getMissionSelectionGroup(family),
    activityKey: definition.activityKey || family,
    difficulty,
    icon: definition.icon,
    title: definition.title,
    description: getMissionDescription(family, target),
    target,
    progress: 0,
    uniqueProgressKeys: [],
    reward: createReward(family, difficulty, capacity, random),
    generatedAtMs: nowMs,
    completedAtMs: 0,
    claimedAtMs: 0,
    claimRequestId: "",
    claimReceipt: null,
    rerollRevision: revision,
    ...(recommendedTarget ? { recommendedTarget } : {}),
  };
}

function buildMissionCandidates(capacity = {}, random = Math.random, exclusions = {}) {
  const excludedFamilies = new Set(exclusions.families || []);
  const excludedActivityKeys = new Set(exclusions.activityKeys || []);
  const capacityBand = getCapacityBand(capacity);
  return shuffled(Object.keys(MISSION_FAMILIES), random).map(family => {
    const definition = MISSION_FAMILIES[family];
    const activityKey = definition.activityKey || family;
    if (excludedFamilies.has(family) || excludedActivityKeys.has(activityKey)) return null;
    const preferred = chooseWeightedDifficulty(capacityBand, random);
    const difficulty = downgradeDifficulty(preferred, candidate => isDifficultyFeasible(family, candidate, capacity));
    if (!difficulty) return null;
    return {
      family,
      difficulty,
      group: definition.group,
      selectionGroup: getMissionSelectionGroup(family),
      activityKey,
    };
  }).filter(Boolean);
}

function selectMissionCandidates(capacity = {}, random = Math.random, count = DAILY_MISSION_COUNT, exclusions = {}) {
  const candidates = buildMissionCandidates(capacity, random, exclusions);
  const selected = [];
  const usedFamilies = new Set(exclusions.families || []);
  const usedSelectionGroups = new Set(exclusions.selectionGroups || exclusions.groups || []);
  const usedActivityKeys = new Set(exclusions.activityKeys || []);
  const tryCandidate = (candidate, requireNewGroup) => {
    if (!candidate || usedFamilies.has(candidate.family) || usedActivityKeys.has(candidate.activityKey)) return false;
    const selectionGroupUsed = usedSelectionGroups.has(candidate.selectionGroup);
    if (selectionGroupUsed && (requireNewGroup || [MILITARY_SELECTION_GROUP, "camps"].includes(candidate.selectionGroup))) return false;
    selected.push(candidate);
    usedFamilies.add(candidate.family);
    usedSelectionGroups.add(candidate.selectionGroup);
    usedActivityKeys.add(candidate.activityKey);
    return true;
  };
  candidates.forEach(candidate => {
    if (selected.length < count) tryCandidate(candidate, true);
  });
  candidates.forEach(candidate => {
    if (selected.length < count) tryCandidate(candidate, false);
  });
  return selected;
}

function createDailyMissionState({ uid = "", worldId = "", resetGeneration = "", nowMs = Date.now(), capacity: rawCapacity = {}, generationRevision = 0 } = {}) {
  const cycle = getDailyMissionCycle(nowMs, resetGeneration);
  const capacity = normalizeCapacity({ ...rawCapacity, remainingHours: cycle.remainingHours });
  const seed = `${safeString(uid, 128)}|${safeString(worldId, 128)}|${cycle.cycleKey}|${generationRevision}`;
  const random = createSeededRandom(seed);
  const candidates = selectMissionCandidates(capacity, random, DAILY_MISSION_COUNT);
  if (candidates.length < DAILY_MISSION_COUNT) {
    throw new Error(`Daily mission generator found only ${candidates.length} valid families for ${safeString(uid, 40) || "player"}.`);
  }
  const missions = candidates.map((candidate, slot) => createMissionRecord({
    ...candidate,
    capacity,
    random,
    slot,
    revision: generationRevision,
    nowMs: cycle.serverTimeMs,
    seed,
  }));
  return {
    schemaVersion: DAILY_MISSION_SCHEMA_VERSION,
    missionVersion: DAILY_MISSION_VERSION,
    uid: safeString(uid, 128),
    worldId: safeString(worldId, 128),
    resetGeneration: safeString(resetGeneration, 128),
    cycleKey: cycle.cycleKey,
    utcDate: cycle.utcDate,
    cycleStartsAtMs: cycle.startsAtMs,
    resetsAtMs: cycle.resetsAtMs,
    generatedAtMs: cycle.serverTimeMs,
    generationRevision: Math.max(0, clampInt(generationRevision, 0)),
    rerollsRemaining: DAILY_MISSION_REROLLS,
    rerollCount: 0,
    lastRerollRequestId: "",
    lastRerollReceipt: null,
    capacitySnapshot: getCapacitySnapshot(capacity),
    missions,
    completedCount: 0,
    claimedCount: 0,
    updatedAtMs: cycle.serverTimeMs,
    expiresAtMs: cycle.resetsAtMs + DAILY_MISSION_EVENT_RETENTION_MS,
  };
}

function createReplacementMission(state = {}, missionId = "", rawCapacity = {}, nowMs = Date.now()) {
  const missions = Array.isArray(state.missions) ? state.missions : [];
  const replaced = missions.find(mission => mission?.id === missionId);
  if (!replaced) return null;
  const capacity = normalizeCapacity({
    ...rawCapacity,
    remainingHours: getDailyMissionCycle(nowMs, state.resetGeneration).remainingHours,
  });
  const revision = Math.max(0, clampInt(state.rerollCount, 0)) + 1;
  const seed = `${safeString(state.uid, 128)}|${safeString(state.worldId, 128)}|${safeString(state.cycleKey, 128)}|reroll|${revision}|${missionId}`;
  const random = createSeededRandom(seed);
  const otherMissions = missions.filter(mission => mission?.id !== missionId);
  const candidates = selectMissionCandidates(capacity, random, 1, {
    families: [replaced.family, ...otherMissions.map(mission => mission.family)],
    selectionGroups: otherMissions.map(mission => mission.selectionGroup || getMissionSelectionGroup(mission.family)),
    activityKeys: otherMissions.map(mission => mission.activityKey || mission.family),
  });
  const candidate = candidates[0];
  if (!candidate) return null;
  return createMissionRecord({
    ...candidate,
    capacity,
    random,
    slot: replaced.slot,
    revision,
    nowMs,
    seed,
  });
}

function migrateDailyMissionState(state = {}, rawCapacity = {}, nowMs = Date.now()) {
  if (Math.max(0, clampInt(state.schemaVersion, 0)) >= DAILY_MISSION_SCHEMA_VERSION) return state;
  const currentCapacity = normalizeCapacity({
    ...rawCapacity,
    remainingHours: getDailyMissionCycle(nowMs, state.resetGeneration).remainingHours,
  });
  const previousThreshold = Math.max(1, clampInt(state.capacitySnapshot?.qualifyingAttackTroops, currentCapacity.qualifyingAttackTroops));
  const capacity = {
    ...currentCapacity,
    qualifyingAttackTroops: Math.min(previousThreshold, currentCapacity.qualifyingAttackTroops),
  };
  const missions = (Array.isArray(state.missions) ? state.missions : []).map((mission, slot) => {
    if (!mission || mission.claimedAtMs || mission.completedAtMs) return mission;
    const migrationRandom = createSeededRandom(`${safeString(state.cycleKey, 160)}|migration|${safeString(mission.id, 96)}`);
    const outcomeFamily = ["ENEMY_CITY_CAPTURE", "BATTLE_WINS"].includes(mission.family);
    const replaceUnsafeOutcome = outcomeFamily && !capacity.safePvpTargets.length;
    const family = replaceUnsafeOutcome ? "ATTACK_COUNT" : mission.family;
    const definition = MISSION_FAMILIES[family] || MISSION_FAMILIES.ATTACK_COUNT;
    const difficulty = replaceUnsafeOutcome || outcomeFamily
      ? "easy"
      : DIFFICULTY[mission.difficulty] ? mission.difficulty : "easy";
    const balancedTarget = replaceUnsafeOutcome ? 1 : getMissionTarget(family, difficulty, capacity);
    const oldTarget = Math.max(1, clampInt(mission.target, balancedTarget));
    const target = Math.max(1, Math.min(oldTarget, balancedTarget));
    const progress = Math.max(0, clampInt(mission.progress, 0));
    const completedAtMs = progress >= target ? Math.max(1, nowMs) : 0;
    const recommendedTarget = outcomeFamily && !replaceUnsafeOutcome
      ? normalizeRecommendedTarget(capacity.safePvpTargets[Math.floor(migrationRandom() * capacity.safePvpTargets.length)])
      : null;
    return {
      ...mission,
      slot: Math.max(0, clampInt(mission.slot, slot)),
      family,
      activityGroup: definition.group,
      selectionGroup: getMissionSelectionGroup(family),
      activityKey: definition.activityKey || family,
      difficulty,
      icon: definition.icon,
      title: definition.title,
      description: getMissionDescription(family, target),
      target,
      progress,
      completedAtMs,
      ...(recommendedTarget ? { recommendedTarget } : { recommendedTarget: null }),
    };
  });
  return {
    ...state,
    schemaVersion: DAILY_MISSION_SCHEMA_VERSION,
    capacitySnapshot: getCapacitySnapshot(capacity),
    missions,
    completedCount: missions.filter(mission => mission?.completedAtMs || mission?.claimedAtMs).length,
    claimedCount: missions.filter(mission => mission?.claimedAtMs).length,
    migratedAtMs: Math.max(1, nowMs),
    updatedAtMs: Math.max(1, nowMs),
  };
}

function normalizeMissionEvent(raw = {}) {
  return {
    id: safeString(raw.id || raw.eventId, 180),
    uid: safeString(raw.uid, 128),
    type: safeString(raw.type, 48).toUpperCase(),
    occurredAtMs: Math.max(0, clampInt(raw.occurredAtMs, 0)),
    targetCategory: safeString(raw.targetCategory, 32).toLowerCase(),
    opponentUid: safeString(raw.opponentUid, 128),
    cityId: safeString(raw.cityId, 96),
    campType: safeString(raw.campType, 24).toLowerCase(),
    committedTroops: Math.max(0, clampInt(raw.committedTroops, 0)),
    qualifyingAttackTroops: Math.max(0, clampInt(raw.qualifyingAttackTroops, 0)),
    defenderLosses: Math.max(0, clampInt(raw.defenderLosses, 0)),
    levelsGained: Math.max(0, clampInt(raw.levelsGained, 0)),
    goldSpent: Math.max(0, clampInt(raw.goldSpent, 0)),
    goldProduced: Math.max(0, clampInt(raw.goldProduced, 0)),
    troopsProduced: Math.max(0, clampInt(raw.troopsProduced, 0)),
    success: Boolean(raw.success),
    cityCaptured: Boolean(raw.cityCaptured),
    campCaptured: Boolean(raw.campCaptured),
    deedCompleted: Boolean(raw.deedCompleted),
    clanGiftSent: Boolean(raw.clanGiftSent),
    meaningful: raw.meaningful !== false,
  };
}

function applyProgressToMission(mission = {}, event = {}, state = {}, nowMs = Date.now()) {
  if (!mission?.id || mission.claimedAtMs || mission.completedAtMs) return mission;
  const next = { ...mission, uniqueProgressKeys: Array.isArray(mission.uniqueProgressKeys) ? [...mission.uniqueProgressKeys] : [] };
  const qualifyingThreshold = Math.max(1, clampInt(state.capacitySnapshot?.qualifyingAttackTroops, 1));
  const meaningfulCombat = event.meaningful && event.committedTroops >= qualifyingThreshold;
  const add = amount => {
    next.progress = Math.min(next.target, Math.max(0, safeNumber(next.progress, 0)) + Math.max(0, safeNumber(amount, 0)));
  };
  const addUnique = key => {
    const normalized = safeString(key, 128);
    if (!normalized || next.uniqueProgressKeys.includes(normalized)) return;
    next.uniqueProgressKeys.push(normalized);
    next.uniqueProgressKeys = next.uniqueProgressKeys.slice(0, Math.max(1, clampInt(next.target, 1)));
    next.progress = Math.min(next.target, next.uniqueProgressKeys.length);
  };
  const ordinaryPlayerCity = event.targetCategory === "player_city";
  const stronghold = event.targetCategory === "stronghold";
  const camp = event.targetCategory === "camp";

  if (mission.family === "ENEMY_CITY_CAPTURE" && event.type === "BATTLE_RESOLVED" && ordinaryPlayerCity && event.cityCaptured && meaningfulCombat) add(1);
  if (mission.family === "BATTLE_WINS" && event.type === "BATTLE_RESOLVED" && ordinaryPlayerCity && event.success && meaningfulCombat) add(1);
  if (mission.family === "ENEMY_TROOPS_DEFEATED" && event.type === "BATTLE_RESOLVED" && ordinaryPlayerCity && meaningfulCombat) add(event.defenderLosses);
  if (mission.family === "ATTACK_COUNT" && event.type === "ATTACK_LAUNCHED" && ordinaryPlayerCity && meaningfulCombat) add(1);
  if (mission.family === "UNIQUE_PLAYERS_ATTACKED" && event.type === "ATTACK_LAUNCHED" && ordinaryPlayerCity && meaningfulCombat) addUnique(event.opponentUid);
  if (mission.family === "TROOPS_SENT_TO_BATTLE" && event.type === "ATTACK_LAUNCHED" && ordinaryPlayerCity && meaningfulCombat) add(event.committedTroops);

  if (event.type === "CAMP_CAPTURED" && camp && event.campCaptured && event.success) {
    if (mission.family === "CAMP_CAPTURE_COUNT") add(1);
    if (mission.family === "GOLD_CAMP_CAPTURE" && event.campType === "gold") add(1);
    if (mission.family === "WARBAND_CAMP_CAPTURE" && event.campType === "troops") add(1);
    if (mission.family === "RELIC_CAMP_CAPTURE" && event.campType === "items") add(1);
    if (mission.family === "UNIQUE_CAMP_TYPES") addUnique(event.campType);
  }
  if (mission.family === "DEED_CAMP_COMPLETE" && event.type === "DEED_CAMP_COMPLETED" && event.deedCompleted) add(1);

  if (event.type === "CITY_UPGRADED") {
    if (mission.family === "TOTAL_CITY_LEVEL_UPGRADES") add(event.levelsGained);
    if (mission.family === "SINGLE_CITY_UPGRADE") {
      const key = event.cityId || "city";
      const existing = next.uniqueProgressKeys.find(entry => String(entry).startsWith(`${key}:`));
      const prior = existing ? Math.max(0, clampInt(String(existing).split(":").pop(), 0)) : 0;
      next.uniqueProgressKeys = next.uniqueProgressKeys.filter(entry => !String(entry).startsWith(`${key}:`));
      const cityLevels = prior + event.levelsGained;
      next.uniqueProgressKeys.push(`${key}:${cityLevels}`);
      next.progress = Math.min(next.target, Math.max(next.progress || 0, cityLevels));
    }
    if (mission.family === "UNIQUE_CITIES_UPGRADED") addUnique(event.cityId);
    if (mission.family === "GOLD_SPENT_ON_UPGRADES") add(event.goldSpent);
  }
  if (event.type === "ECONOMY_PRODUCED") {
    if (mission.family === "GOLD_EARNED") add(event.goldProduced);
    if (mission.family === "TROOPS_PRODUCED") add(event.troopsProduced);
  }
  if (event.type === "ATTACK_LAUNCHED" && stronghold && meaningfulCombat) {
    if (mission.family === "STRONGHOLD_ATTACK" || mission.family === "STRONGHOLD_ATTACK_COUNT") add(1);
    if (mission.family === "STRONGHOLD_TROOPS_SENT") add(event.committedTroops);
  }
  if (mission.family === "CLAN_GIFT" && event.type === "CLAN_GIFT_SENT" && event.clanGiftSent) add(1);

  next.progress = Math.min(Math.max(1, safeNumber(next.target, 1)), Math.max(0, safeNumber(next.progress, 0)));
  if (next.progress >= next.target) next.completedAtMs = Math.max(1, nowMs);
  return next;
}

function applyDailyMissionEvent(state = {}, rawEvent = {}, nowMs = Date.now()) {
  const event = normalizeMissionEvent(rawEvent);
  const missions = (Array.isArray(state.missions) ? state.missions : []).map(mission => (
    applyProgressToMission(mission, event, state, nowMs)
  ));
  const completedCount = missions.filter(mission => mission.completedAtMs || mission.claimedAtMs).length;
  const claimedCount = missions.filter(mission => mission.claimedAtMs).length;
  return {
    ...state,
    missions,
    completedCount,
    claimedCount,
    updatedAtMs: nowMs,
  };
}

module.exports = {
  DAILY_MISSION_VERSION,
  DAILY_MISSION_SCHEMA_VERSION,
  DAILY_MISSION_COUNT,
  DAILY_MISSION_REROLLS,
  DAILY_MISSION_EVENT_RETENTION_MS,
  DIFFICULTY,
  MISSION_FAMILIES,
  FIXED_TARGETS,
  TROOP_TARGET_RATIOS,
  getDailyMissionCycle,
  normalizeCapacity,
  getMissionTarget,
  getMissionSelectionGroup,
  createReward,
  createDailyMissionState,
  createReplacementMission,
  migrateDailyMissionState,
  normalizeMissionEvent,
  applyDailyMissionEvent,
  roundMissionTarget,
};
