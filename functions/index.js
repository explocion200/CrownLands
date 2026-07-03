const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const RESET_GENERATION = "fresh-2026-07-02-world-reset";
const ONLINE_WORLD_ID = `main-${RESET_GENERATION}`;
const MAX_CITY_LEVEL = 100;
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
const LEVEL_UP_TROOP_REWARD_BASE = 50;
const LEVEL_UP_TROOP_REWARD_MULTIPLIER = 1.15;
const CHARACTER_START_LEVEL = 1;
const CHARACTER_START_XP = 0;
const CITY_LEVEL_STATS = {
  victoryPointsBase: 6,
  victoryPointsPerLevel: 4,
  victoryPointsExponent: 1.35,
  victoryPointsExponentScale: 2,
  defensePercentPerLevel: 3,
  cityWallsBase: 30,
  cityWallsPerLevel: 32,
};
const SKILL_CONFIG = {
  striker: { percentPerLevel: 2 },
  fearless: { percentPerLevel: 2, maxPercent: 75 },
  brave: { percentPerLevel: 2, maxPercent: 75 },
  guardian: { percentPerLevel: 3 },
  scavenger: { percentPerLevel: 2 },
  salvager: { percentPerLevel: 2 },
};
const STRONGHOLD_IDS = new Set([
  "west_gold_stronghold",
  "north_training_stronghold",
  "east_speed_stronghold",
  "south_defense_stronghold",
  "center_crown_citadel",
]);
const STRONGHOLD_LEVELS = {
  west_gold_stronghold: 50,
  north_training_stronghold: 50,
  east_speed_stronghold: 50,
  south_defense_stronghold: 50,
  center_crown_citadel: 100,
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

function getStrongholdDefenseLevel(city = {}) {
  if (!isStronghold(city)) return 0;
  return clampCityLevel(city.level || STRONGHOLD_LEVELS[city.id] || 50);
}

function getSkillLevel(profile = {}, skill = "") {
  return Math.max(0, Math.floor(safeNumber(profile?.upgrades?.[skill], 0)));
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

function getCityStats(city = {}, defenderProfile = null) {
  const level = isStronghold(city) ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level);
  const step = level - 1;
  const victoryPoints = Math.floor(
    CITY_LEVEL_STATS.victoryPointsBase
      + level * CITY_LEVEL_STATS.victoryPointsPerLevel
      + Math.pow(level, CITY_LEVEL_STATS.victoryPointsExponent) * CITY_LEVEL_STATS.victoryPointsExponentScale
  );
  const defensePercent = level * CITY_LEVEL_STATS.defensePercentPerLevel;
  const cityWalls = CITY_LEVEL_STATS.cityWallsBase + step * CITY_LEVEL_STATS.cityWallsPerLevel;
  const guardianPercent = defenderProfile ? getSkillPercent(defenderProfile, "guardian") : 0;
  const troopDefense = Math.floor((Math.max(0, Math.floor(safeNumber(city.troops, 0)))) * (1 + defensePercent / 100) * (1 + guardianPercent / 100));
  const totalDefense = Math.floor(cityWalls + troopDefense);

  return {
    level,
    victoryPoints,
    defensePercent,
    cityWalls,
    guardianPercent,
    totalDefense,
  };
}

function getAttackPower(troops, attackerProfile = null) {
  const boost = attackerProfile ? skillMultiplier(attackerProfile, "striker") : 1;
  return troops * BASE_TROOP_ATTACK_POWER * boost;
}

function calculateCombatResult(attackTroops, target, attackerProfile = null, defenderProfile = null) {
  const troops = Math.max(0, Math.floor(safeNumber(attackTroops, 0)));
  const defendersAtStart = Math.max(0, Math.floor(safeNumber(target?.troops, 0)));
  const attackPower = getAttackPower(troops, attackerProfile);
  const defensePower = getCityStats(target, defenderProfile).totalDefense;
  const ratio = attackPower / Math.max(1, defensePower);
  const success = attackPower > defensePower;
  const attackerBoost = attackerProfile ? skillMultiplier(attackerProfile, "striker") : 1;
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

function calculateTravelTime({ pathLength = 0, troopCount = 1, kind = "attack", requestedTotal = 0 }) {
  const distance = Math.max(1, safeNumber(pathLength, 1));
  const kindMultiplier = ARMY_TRAVEL_KIND_MULTIPLIERS[kind] || ARMY_TRAVEL_KIND_MULTIPLIERS.attack;
  const troopMultiplier = getTroopTravelMultiplier(troopCount);
  const minSeconds = kind === "scout" ? ARMY_TRAVEL_SCOUT_MIN_SECONDS : ARMY_TRAVEL_MIN_SECONDS;
  const computed = clamp(distance * ARMY_TRAVEL_SECONDS_PER_MAP_UNIT * kindMultiplier * troopMultiplier, minSeconds, ARMY_TRAVEL_MAX_SECONDS);
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

function createScoutReportSnapshot(target = {}, defenderProfile = null, nowMs = Date.now()) {
  const stats = getCityStats(target, defenderProfile);
  const baseTroopDefense = Math.max(0, Math.floor(safeNumber(target.troops, 0)));
  const cityAdjustedDefense = Math.floor(baseTroopDefense * (1 + stats.defensePercent / 100));
  const troopDefense = Math.floor(cityAdjustedDefense * (1 + stats.guardianPercent / 100));
  return {
    troops: baseTroopDefense,
    totalDefense: Math.floor(stats.totalDefense),
    owner: getOwnerUid(target) ? "enemy" : "neutral",
    ownerName: getOwnerName(target),
    cityLevel: stats.level,
    defensePercent: stats.defensePercent,
    cityWalls: stats.cityWalls,
    troopDefense,
    cityDefenseBonus: Math.max(0, cityAdjustedDefense - baseTroopDefense),
    guardianBonus: Math.max(0, troopDefense - cityAdjustedDefense),
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
  return {
    character: xpResult.character,
    gold: baseGold + Math.max(0, Math.floor(safeNumber(gold, 0))) + xpResult.goldReward,
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

exports.sendArmyOrder = onCall({ region: "us-central1", maxInstances: 20 }, async request => {
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

  return db.runTransaction(async transaction => {
    const [sourceSnap, targetSnap, existingArmySnap, playerSnap] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(targetRef),
      transaction.get(armyRefs[0]),
      transaction.get(playerRef),
    ]);

    if (!sourceSnap.exists) throw new HttpsError("not-found", "Source city was not found.");
    if (!targetSnap.exists) throw new HttpsError("not-found", "Destination city was not found.");
    if (existingArmySnap.exists && existingArmySnap.data()?.status === "active") {
      throw new HttpsError("already-exists", "That army order is already active.");
    }

    const source = { id: sourceSnap.id, ...sourceSnap.data() };
    const target = { id: targetSnap.id, ...targetSnap.data() };
    const sourceOwnerUid = getOwnerUid(source);
    const targetOwnerUid = getOwnerUid(target);
    if (sourceOwnerUid !== uid) {
      throw new HttpsError("permission-denied", "You can only send troops from your own city.");
    }

    const sourceTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0)));
    const resolvedKind = order.kind === "scout"
      ? "scout"
      : targetOwnerUid === uid
        ? "transfer"
        : "attack";
    const requestedTroops = resolvedKind === "scout"
      ? 1
      : clampInt(order.requestedTroops || order.troops || Math.floor(sourceTroops * DEFAULT_MARCH_PERCENT), 1, Math.max(1, sourceTroops));
    const troops = resolvedKind === "scout" ? 1 : requestedTroops;

    if (sourceTroops < troops) throw new HttpsError("failed-precondition", "Not enough troops in the source city.");
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
      attackerKingPower: order.attackerKingPower || order.ownerKingPower,
      defenderKingPower: order.defenderKingPower,
      launchedAtMs: nowMs,
      arrivesAtMs: nowMs + Math.ceil(duration * 1000),
      status: "active",
      createdByServer: true,
      serverAuthorityVersion: 1,
    };

    transaction.set(sourceRef, cleanCityUpdate(source, {
      troops: sourceTroops - troops,
      troopFloat: Math.max(0, safeNumber(source.troopFloat, sourceTroops) - troops),
    }), { merge: true });

    const playerData = playerSnap.exists ? playerSnap.data() || {} : {};
    if (resolvedKind === "attack" && targetOwnerUid && targetOwnerUid !== uid) {
      const itemEffects = playerData.itemEffects && typeof playerData.itemEffects === "object" ? { ...playerData.itemEffects } : {};
      if (safeNumber(itemEffects.shieldExpiresAtMs, 0) > nowMs) {
        itemEffects.shieldExpiresAtMs = 0;
        transaction.set(playerRef, { itemEffects, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }

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
    };
  });
});

exports.resolveArmyOrder = onCall({ region: "us-central1", maxInstances: 30 }, async request => {
  const callerUid = requireAuth(request);
  const data = request.data || {};
  const armyId = safeString(data.armyId || data.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const requestedRegions = normalizeRegionIds(data.routeRegionIds || data.regionIds || []);
  if (!armyId) throw new HttpsError("invalid-argument", "Missing army id.");
  if (!requestedRegions.length) throw new HttpsError("invalid-argument", "Missing army route regions.");

  const firstArmyRef = armyRefsForRegions(requestedRegions, armyId)[0];
  const nowMs = Date.now();

  return db.runTransaction(async transaction => {
    const firstArmySnap = await transaction.get(firstArmyRef);
    if (!firstArmySnap.exists) return { ok: true, status: "missing" };
    const army = { id: firstArmySnap.id, ...firstArmySnap.data() };
    if (army.status !== "active") return { ok: true, status: army.status || "resolved" };
    const arrivesAtMs = Math.max(0, Math.floor(safeNumber(army.arrivesAtMs, 0)));
    if (arrivesAtMs > nowMs + 1500) {
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

    const source = sourceSnap.exists ? { id: sourceSnap.id, ...sourceSnap.data() } : null;
    const target = { id: targetSnap.id, ...targetSnap.data() };
    const attackerUid = safeString(army.ownerUid, 128);
    const defenderUid = getOwnerUid(target);
    const participantProfiles = await getProfileSnapshots(transaction, [attackerUid, defenderUid]);
    const attackerProfile = participantProfiles.get(attackerUid)?.data || {};
    const defenderProfile = defenderUid ? participantProfiles.get(defenderUid)?.data || {} : null;
    const attackerProfileSnap = participantProfiles.get(attackerUid)?.snap || null;
    const defenderProfileSnap = defenderUid ? participantProfiles.get(defenderUid)?.snap || null : null;
    const reports = [];
    const cityUpdates = [];
    const reportsForCaller = () => reports.filter(report => report.uid === callerUid);
    const profilePatchForCaller = (attackerPatch = null, defenderPatch = null) => {
      if (callerUid === attackerUid && attackerPatch) {
        return { character: attackerPatch.character, gold: attackerPatch.gold };
      }
      if (callerUid === defenderUid && defenderPatch) {
        return { character: defenderPatch.character, gold: defenderPatch.gold };
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

    const troopCount = Math.max(0, Math.floor(safeNumber(army.troops, 0)));
    const targetStats = getCityStats(target, defenderProfile);
    const attackerName = safeString(army.ownerName || attackerProfile.playerName || "Rival ruler", 40);
    const defenderName = defenderUid
      ? safeString(target.ownerName || defenderProfile.playerName || "Rival ruler", 40)
      : "Neutral city";

    if (army.kind === "scout") {
      if (defenderUid && defenderUid === attackerUid) {
        const nextTroops = Math.max(0, Math.floor(safeNumber(target.troops, 0))) + troopCount;
        transaction.set(targetRef, cleanCityUpdate(target, {
          troops: nextTroops,
          troopFloat: Math.max(0, safeNumber(target.troopFloat, target.troops || 0)) + troopCount,
        }), { merge: true });
        cityUpdates.push({ id: target.id, regionId: targetRegionId, troops: nextTroops });
        markResolved({ kind: "scout", joinedOwnCity: true });
        return { ok: true, status: "resolved", kind: "scout", cityUpdates };
      }

      const scoutReport = createScoutReportSnapshot(target, defenderProfile, nowMs);
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
      return { ok: true, status: "resolved", kind: "scout", reports: reportsForCaller(), scoutReport: callerUid === attackerUid ? scoutReport : null };
    }

    const effectiveKind = army.kind === "transfer" && defenderUid === attackerUid ? "transfer" : "attack";
    if (effectiveKind === "transfer") {
      const nextTroops = Math.max(0, Math.floor(safeNumber(target.troops, 0))) + troopCount;
      transaction.set(targetRef, cleanCityUpdate(target, {
        troops: nextTroops,
        troopFloat: Math.max(0, safeNumber(target.troopFloat, target.troops || 0)) + troopCount,
      }), { merge: true });
      cityUpdates.push({ id: target.id, regionId: targetRegionId, troops: nextTroops });
      markResolved({ kind: "transfer", troops: troopCount });
      return { ok: true, status: "resolved", kind: "transfer", cityUpdates };
    }

    if (isProtectedMainCity(target, attackerUid)) {
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
      return { ok: true, status: "resolved", kind: "attack", reports: reportsForCaller(), cityUpdates };
    }

    if (isCityShielded(target, attackerUid, nowMs)) {
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
      return { ok: true, status: "resolved", kind: "attack", reports: reportsForCaller(), cityUpdates };
    }

    const oldOwnerUid = defenderUid;
    const defendersAtStart = Math.max(0, Math.floor(safeNumber(target.troops, 0)));
    const result = calculateCombatResult(troopCount, target, attackerProfile, defenderProfile);
    const attackWinXp = getCaptureXpAward(target, oldOwnerUid, result.defenderLosses, defenderProfile);
    const attackFailXp = getPartialBattleXpAward(getCaptureXpAward(target, oldOwnerUid, defendersAtStart, defenderProfile));
    const defenseHeldXp = getDefenseHeldXpAward(troopCount, target, defenderProfile);
    const defenseLostXp = getPartialBattleXpAward(defenseHeldXp);
    const attackerScavengerGold = Math.floor(result.killedDefenders * KILL_GOLD_BASE * getSkillPercent(attackerProfile, "scavenger") / 100);
    const defenderSalvagerGold = defenderProfile
      ? Math.floor(result.killedAttackers * KILL_GOLD_BASE * getSkillPercent(defenderProfile, "salvager") / 100)
      : 0;
    const attackerProgress = buildPlayerProgressPatch(attackerProfile, {
      xp: result.success ? attackWinXp : attackFailXp,
      gold: attackerScavengerGold,
    });
    const defenderProgress = defenderUid
      ? buildPlayerProgressPatch(defenderProfile || {}, {
        xp: result.success ? defenseLostXp : defenseHeldXp,
        gold: defenderSalvagerGold,
      })
      : null;

    if (result.success) {
      const daily = normalizeDaily(attackerProfile.daily);
      if (!oldOwnerUid && !isStronghold(target) && daily.neutralCaptures >= DAILY_NEUTRAL_CAPTURE_LIMIT) {
        transaction.set(targetRef, cleanCityUpdate(target, {
          troops: Math.max(1, Math.floor(safeNumber(target.troops, 1))),
          troopFloat: Math.max(1, safeNumber(target.troopFloat, target.troops || 1)),
        }), { merge: true });
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
        return { ok: true, status: "resolved", kind: "attack", reports: reportsForCaller() };
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
      writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap, {
        character: attackerProgress.character,
        gold: attackerProgress.gold,
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
          summary: `${target.name || target.id} was captured by ${attackerName}. Level ${clampCityLevel(target.level).toLocaleString()} to ${nextLevel.toLocaleString()}. +${defenderProgress.xpAwarded.toLocaleString()} XP.`,
          xpAwarded: defenderProgress.xpAwarded,
          goldAwarded: defenderProgress.goldAwarded,
          characterAfter: defenderProgress.character,
          goldAfter: defenderProgress.gold,
          nowMs,
        });
        writeReport(transaction, defenderUid, defenderReport, defenderProfileSnap, {
          character: defenderProgress.character,
          gold: defenderProgress.gold,
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
        cityUpdates,
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
    writeReport(transaction, attackerUid, attackerReport, attackerProfileSnap, {
      character: attackerProgress.character,
      gold: attackerProgress.gold,
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
        summary: `${target.name || target.id} survived with ${result.defendersLeft.toLocaleString()} defenders. +${defenderProgress.xpAwarded.toLocaleString()} XP.`,
        xpAwarded: defenderProgress.xpAwarded,
        goldAwarded: defenderProgress.goldAwarded,
        characterAfter: defenderProgress.character,
        goldAfter: defenderProgress.gold,
        nowMs,
      });
      writeReport(transaction, defenderUid, defenderReport, defenderProfileSnap, {
        character: defenderProgress.character,
        gold: defenderProgress.gold,
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
      cityUpdates,
      currentUser: profilePatchForCaller(attackerProgress, defenderProgress),
    };
  });
});
