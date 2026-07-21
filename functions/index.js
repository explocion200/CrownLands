const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const SERVER_WORLD_LAYOUT = require("./world-layout.json");

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const RESET_GENERATION = "fresh-2026-07-05-server-reset";
const ONLINE_WORLD_ID = `main-${RESET_GENERATION}`;
const TEST_STARTING_GOLD = 500;
const PLAYER_NAME_MAX_LENGTH = 18;
const MILLION_LORDS_CITY_COST_BASE = 50;
const MILLION_LORDS_CITY_COST_GROWTH = 1.2;
const CITY_PRESTIGE_START_LEVEL = 100;
const CITY_PRESTIGE_BAND_SIZE = 10;
const MILLION_LORDS_CITY_PRODUCTION_VP_BASE = 20;
const MILLION_LORDS_CITY_PRODUCTION_VP_GROWTH = 1.115;
const MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP = 15;
const BASE_TROOP_ATTACK_POWER = 2;
const DEFAULT_MARCH_PERCENT = 0.5;
const DAILY_NEUTRAL_CAPTURE_LIMIT = 30;
const NEUTRAL_CITY_COUNT_LIMIT = 30;
const HARVEST_BONUS_DAILY_LIMIT = 200;
const HARVEST_BONUS_DAILY_GOLD_LIMIT = 100;
const HARVEST_BONUS_DAILY_TROOP_LIMIT = 100;
const HARVEST_BONUS_GOLD_SECONDS = 180;
const HARVEST_BONUS_MIN_GOLD = 300;
const HARVEST_BONUS_TROOP_SECONDS = 300;
const HARVEST_BONUS_MIN_TROOPS = 50;
const HARVEST_BONUS_MAX_TROOPS = 2500;
const HARVEST_BONUS_SPAWN_INTERVAL_SECONDS = 60;
const HARVEST_BONUS_EXPIRE_SECONDS = 1800;
const HARVEST_BONUS_MAX_ACTIVE_PER_PLAYER = 1;
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
const ROYAL_PEACE_SHIELD_PURCHASE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WAR_DRUMS_ITEM_ID = "war_drums_30m";
const WAR_DRUMS_DURATION_MS = 30 * 60 * 1000;
const WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT = 50;
const ROYAL_TAX_DECREE_ITEM_ID = "royal_tax_decree_30m";
const ROYAL_TAX_DECREE_DURATION_MS = 30 * 60 * 1000;
const ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT = 50;
const PRODUCTION_BOOST_PURCHASE_LIMIT = 3;
const PRODUCTION_BOOST_PURCHASE_WINDOW_MS = 24 * 60 * 60 * 1000;
const PRODUCTION_BOOST_ITEM_IDS = new Set([WAR_DRUMS_ITEM_ID, ROYAL_TAX_DECREE_ITEM_ID]);
const VEIL_OF_SILENCE_ITEM_ID = "veil_of_silence_30m";
const VEIL_OF_SILENCE_DURATION_MS = 5 * 60 * 1000;
const SWIFT_MARCH_ORDER_ITEM_ID = "swift_march_order";
const SWIFT_MARCH_REMAINING_TIME_MULTIPLIER = 0.5;
const SWIFT_MARCH_MINIMUM_REMAINING_MS = 1000;
const RECALL_HORN_ITEM_ID = "recall_horn";
const RECALL_HORN_MINIMUM_REMAINING_MS = 1000;
const RECALL_HORN_MINIMUM_RETURN_MS = 1000;
const MAIN_CITY_CHANGE_CITY_LIMIT = 30;
const MAIN_CITY_CHANGE_SMALL_KINGDOM_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAIN_CITY_CHANGE_LARGE_KINGDOM_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SERVER_PRODUCTION_SECONDS = 7 * 24 * 60 * 60;
const GLOBAL_PLAYER_STATS_VERSION = 2;
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
const GOLD_CAMP_HOLD_DURATION_MS = 10 * 60 * 1000;
const GOLD_CAMP_BASE_REWARD = 100_000;
const GOLD_CAMP_BASE_DEFENDERS = 10_000;
const GOLD_CAMP_DEFENSE_LEVEL = 30;
const REWARD_CAMP_PAYOUT_SCAN_LIMIT = 40;
const GOLD_CAMP_REWARD_BY_DAILY_CLAIM = [100_000, 100_000, 75_000, 50_000, 25_000];
const WARBAND_CAMP_HOLD_DURATION_MS = 15 * 60 * 1000;
const WARBAND_CAMP_BASE_REWARD = 50_000;
const WARBAND_CAMP_BASE_DEFENDERS = 10_000;
const WARBAND_CAMP_DEFENSE_LEVEL = 30;
const WARBAND_CAMP_REWARD_BY_DAILY_CLAIM = [50_000, 50_000, 37_500, 25_000, 12_500];
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
  },
};
const SHOP_ITEMS = {
  [ROYAL_PEACE_SHIELD_ITEM_ID]: { id: ROYAL_PEACE_SHIELD_ITEM_ID, label: "Royal Peace Shield", cost: 1250000 },
  [WAR_DRUMS_ITEM_ID]: { id: WAR_DRUMS_ITEM_ID, label: "War Drums", cost: 250000 },
  [ROYAL_TAX_DECREE_ITEM_ID]: { id: ROYAL_TAX_DECREE_ITEM_ID, label: "Royal Tax Decree", cost: 150000 },
  [VEIL_OF_SILENCE_ITEM_ID]: { id: VEIL_OF_SILENCE_ITEM_ID, label: "Veil of Silence", cost: 175000 },
  [SWIFT_MARCH_ORDER_ITEM_ID]: { id: SWIFT_MARCH_ORDER_ITEM_ID, label: "Swift March Order", cost: 300000 },
  [RECALL_HORN_ITEM_ID]: { id: RECALL_HORN_ITEM_ID, label: "Recall Horn", cost: 500000 },
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
const SKILL_RESET_COST = 750_000;
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
    return cleanServerCityLayoutSeed({
      id: city.id || `${targetRegionId}_${String(index + 1).padStart(3, "0")}`,
      name: city.name || city.id,
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
  if (!Number.isFinite(rawValue)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(rawValue + 0.000001)));
}

function getMillionLordsPassiveGoldPerHour(level) {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(getMillionLordsCityProductionVp(level) * MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP)
  );
}

function getCityProductionStats(city = {}, profile = {}, bonuses = {}, options = {}) {
  const stronghold = isStronghold(city);
  const level = stronghold ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level);
  const victoryPoints = Math.floor(
    CITY_LEVEL_STATS.victoryPointsBase
      + level * CITY_LEVEL_STATS.victoryPointsPerLevel
      + Math.pow(level, CITY_LEVEL_STATS.victoryPointsExponent) * CITY_LEVEL_STATS.victoryPointsExponentScale
  );
  const royalGranariesPercent = getSkillPercent(profile, "royalGranaries");
  const taxStewardshipPercent = getSkillPercent(profile, "taxStewardship");
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
  const troopProductionPerHour = baseTroopProductionPerHour
    * (1 + royalGranariesPercent / 100)
    * (1 + Math.max(0, safeNumber(bonuses.troopBonusPercent, 0)) / 100)
    * (1 + warDrumsTroopBonusPercent / 100);
  const rawGoldProductionPerHour = stronghold ? 0 : getMillionLordsPassiveGoldPerHour(level);
  const goldProductionPerHour = rawGoldProductionPerHour
    * (1 + taxStewardshipPercent / 100)
    * (1 + Math.max(0, safeNumber(bonuses.goldBonusPercent, 0)) / 100)
    * (1 + royalTaxDecreeGoldBonusPercent / 100);

  return {
    level,
    victoryPoints,
    troopProductionPerHour,
    goldProductionPerHour,
    warDrumsTroopBonusPercent,
    royalTaxDecreeGoldBonusPercent,
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

function playerGlobalStatsRef(uid = "") {
  return db.doc(`players/${safeString(uid, 128)}/stats/global`);
}

function leaderboardEntryRef(uid = "") {
  return db.doc(`leaderboards/kingPower/entries/${safeString(uid, 128)}`);
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
    .where("status", "==", "active");
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

  let totalCities = 0;
  let strongholdCount = 0;
  let totalTroops = 0;
  let totalCityLevels = 0;
  let totalVictoryPoints = 0;
  let stationedTroopPower = 0;
  let cityPower = 0;
  let goldPerHour = 0;
  let troopPerHour = 0;
  // Include zeroes so Firestore merge writes clear regions where the player lost their final city.
  const cityCountsByRegion = Object.fromEntries(
    [...SERVER_WORLD_REGION_IDS].map(regionId => [regionId, 0])
  );

  ownedEntries.forEach(entry => {
    const city = entry.city || {};
    const troopCount = Math.max(0, Math.floor(safeNumber(city.troops, 0)));
    const stats = getCityProductionStats(city, profileForStats, resolvedBonuses);
    totalTroops += troopCount;
    totalVictoryPoints += Math.max(0, Math.floor(safeNumber(stats.victoryPoints, 0)));
    stationedTroopPower += troopCount * KING_POWER_PER_TROOP;
    cityPower += Math.max(0, Math.floor(safeNumber(stats.victoryPoints, 0))) * KING_POWER_PER_CITY_VP;
    goldPerHour += Math.max(0, safeNumber(stats.goldProductionPerHour, 0));
    troopPerHour += Math.max(0, safeNumber(stats.troopProductionPerHour, 0));
    if (isStronghold(city)) {
      strongholdCount += 1;
    } else {
      totalCities += 1;
      totalCityLevels += clampCityLevel(city.level);
      const regionId = normalizeRegionId(city.regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(entry)));
      cityCountsByRegion[regionId] = (cityCountsByRegion[regionId] || 0) + 1;
    }
  });

  const marchingById = new Map();
  (Array.isArray(activeArmies) ? activeArmies : []).forEach(army => {
    if (!army || getOwnerUid(army) !== playerUid || army.status !== "active" || !isCurrentWorldArmy(army)) return;
    const key = getArmyStatsKey(army);
    if (!key || marchingById.has(key)) return;
    marchingById.set(key, army);
  });
  const totalMarchingTroops = [...marchingById.values()]
    .reduce((total, army) => total + Math.max(0, Math.floor(safeNumber(army.troops, 0))), 0);
  const marchingPower = totalMarchingTroops * KING_POWER_PER_TROOP;
  const kingPower = Math.max(0, Math.floor(stationedTroopPower + cityPower + marchingPower));
  const character = normalizeCharacterProgress(profileForStats.character);

  return {
    playerId: playerUid,
    uid: playerUid,
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    version: GLOBAL_PLAYER_STATS_VERSION,
    totalCities,
    totalTroops,
    totalMarchingTroops,
    totalCityLevels,
    totalVictoryPoints,
    strongholdCount,
    cityCountsByRegion,
    goldPerHour: Math.max(0, Math.floor(goldPerHour)),
    troopPerHour: Math.max(0, Math.floor(troopPerHour)),
    stationedTroopPower: Math.max(0, Math.floor(stationedTroopPower)),
    cityPower: Math.max(0, Math.floor(cityPower)),
    marchingPower: Math.max(0, Math.floor(marchingPower)),
    kingPower,
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

function getPlayerPowerSnapshot({ profile = {}, leaderboard = {}, city = {}, fallback = 0 } = {}) {
  const authoritativeCandidates = [
    {
      version: Math.max(0, Math.floor(safeNumber(profile.kingPowerVersion, 0))),
      power: Math.max(0, Math.floor(safeNumber(profile.kingPower, 0))),
      updatedAtMs: Math.max(0, timestampToMs(profile.kingPowerUpdatedAtMs)),
    },
    {
      version: Math.max(0, Math.floor(safeNumber(leaderboard.kingPowerVersion, 0))),
      power: Math.max(0, Math.floor(safeNumber(leaderboard.kingPower, 0))),
      updatedAtMs: Math.max(0, timestampToMs(leaderboard.kingPowerUpdatedAtMs || leaderboard.updatedAtMs)),
    },
  ]
    .filter(candidate => candidate.version >= GLOBAL_PLAYER_STATS_VERSION)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  if (authoritativeCandidates.length) return authoritativeCandidates[0].power;

  const serverPower = getPowerValue(
    profile.kingPower,
    leaderboard.kingPower,
    city.ownerKingPower,
    getCityPowerFloor(city)
  );
  return serverPower > 0 ? serverPower : getPowerValue(fallback);
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
    ownerName: normalizePlayerName(raw.ownerName || data.ownerName),
    ownerFlag: raw.ownerFlag || data.ownerFlag || null,
    ownerKingPower: Math.max(0, Math.floor(safeNumber(raw.ownerKingPower, 0))),
    kind,
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
    attackerKingPower: Math.max(0, Math.floor(safeNumber(raw.attackerKingPower || raw.ownerKingPower, 0))),
    defenderKingPower: Math.max(0, Math.floor(safeNumber(raw.defenderKingPower, 0))),
    demoAttack: raw.demoAttack && typeof raw.demoAttack === "object" ? raw.demoAttack : null,
  };
}

function cityRefForRegion(regionId, cityId) {
  return db.doc(`islands/${getOnlineIslandId(regionId)}/cities/${cityId}`);
}

function campRefForRegion(regionId, campId) {
  return db.doc(`islands/${getOnlineIslandId(regionId)}/camps/${campId}`);
}

function getRewardCampConfig(campOrType = {}) {
  const rawType = typeof campOrType === "string"
    ? campOrType
    : campOrType?.campType
      || (campOrType?.kind === "warbandCamp" ? "troops" : "")
      || (campOrType?.kind === "goldCamp" || campOrType?.targetType === "camp" ? "gold" : "");
  const campType = safeString(rawType, 24).toLowerCase();
  return REWARD_CAMP_CONFIG[campType] || null;
}

function isRewardCamp(target = {}) {
  return Boolean(getRewardCampConfig(target));
}

function cleanServerCampLayoutSeed(camp = {}) {
  const campId = safeString(camp.id, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
  const config = getRewardCampConfig(camp);
  if (!config) return {};
  const baseDefenders = Math.max(1, Math.floor(safeNumber(camp.baseDefenders, config.baseDefenders)));
  return {
    id: campId,
    campId,
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
  const config = getRewardCampConfig(camp);
  if (!config) return null;
  const currentGarrison = Math.max(0, Math.floor(safeNumber(camp.currentGarrison, camp.baseDefenders || config.baseDefenders)));
  return {
    ...camp,
    kind: config.kind,
    targetType: "camp",
    campType: config.campType,
    rewardType: config.rewardType,
    holdDurationMs: config.holdDurationMs,
    baseReward: config.baseReward,
    baseDefenders: Math.max(1, Math.floor(safeNumber(camp.baseDefenders, config.baseDefenders))),
    defenseLevel: config.defenseLevel,
    level: config.defenseLevel,
    troops: currentGarrison,
    troopFloat: currentGarrison,
    ownerKind: camp.holderUid ? "player" : "neutral",
    ownerUid: safeString(camp.holderUid || camp.ownerUid, 128),
    ownerName: normalizePlayerName(camp.holderName || camp.ownerName, ""),
    ownerFlag: camp.holderFlag || camp.ownerFlag || null,
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

function armyViewRefsForRegions(regionIds, armyId) {
  return normalizeRegionIds(regionIds).map(regionId => db.doc(`islands/${getOnlineIslandId(regionId)}/armies/${armyId}`));
}

function armyRefsForRegions(regionIds, armyId) {
  return [canonicalArmyRef(armyId), ...armyViewRefsForRegions(regionIds, armyId)];
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
  };
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

function shouldDeactivatePeaceShieldForAttack(target = {}, targetType = "city", attackerUid = "", resolvedKind = "attack") {
  if (resolvedKind !== "attack") return false;
  if (targetType === "camp" || isStronghold(target)) return true;
  const targetOwnerUid = getOwnerUid(target);
  return Boolean(targetOwnerUid && targetOwnerUid !== attackerUid);
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
  ]);
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

function makeReport({ id, uid, type, outcome, city, opponentName = "", summary = "", sentTroops = 0, troopCount = 0, result = {}, totalDefense = 0, scoutReport = null, xpAwarded = 0, goldAwarded = 0, troopsAwarded = 0, characterAfter = null, goldAfter = null, nowMs = Date.now() }) {
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
    totalDefense: Math.max(0, Math.floor(safeNumber(totalDefense, result.defensePower || 0))),
    opponentName: normalizePlayerName(opponentName, "Unknown ruler"),
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
    .slice(-PRODUCTION_BOOST_PURCHASE_LIMIT);
}

function normalizeItemPurchaseCooldowns(cooldowns = {}) {
  const shieldCooldown = cooldowns?.[ROYAL_PEACE_SHIELD_ITEM_ID] || {};
  const normalized = {
    [ROYAL_PEACE_SHIELD_ITEM_ID]: {
      lastPurchasedAtMs: timestampToMs(shieldCooldown.lastPurchasedAtMs || shieldCooldown.lastPurchasedAt),
    },
    [WAR_DRUMS_ITEM_ID]: { purchaseTimestampsMs: [] },
    [ROYAL_TAX_DECREE_ITEM_ID]: { purchaseTimestampsMs: [] },
  };
  PRODUCTION_BOOST_ITEM_IDS.forEach(itemId => {
    normalized[itemId].purchaseTimestampsMs = normalizeItemPurchaseTimestamps(cooldowns?.[itemId]);
  });
  return normalized;
}

function getShieldPurchaseCooldownRemainingMs(cooldowns = {}, nowMs = Date.now()) {
  const lastPurchasedAtMs = timestampToMs(cooldowns?.[ROYAL_PEACE_SHIELD_ITEM_ID]?.lastPurchasedAtMs);
  if (!lastPurchasedAtMs) return 0;
  const elapsed = Math.max(0, nowMs - Math.min(lastPurchasedAtMs, nowMs));
  return Math.max(0, ROYAL_PEACE_SHIELD_PURCHASE_COOLDOWN_MS - elapsed);
}

function getProductionBoostPurchaseStatus(itemId, cooldowns = {}, nowMs = Date.now()) {
  if (!PRODUCTION_BOOST_ITEM_IDS.has(itemId)) return { count: 0, remainingMs: 0, purchaseTimestampsMs: [] };
  const purchaseTimestampsMs = normalizeItemPurchaseTimestamps(cooldowns?.[itemId])
    .filter(timestamp => timestamp > nowMs - PRODUCTION_BOOST_PURCHASE_WINDOW_MS && timestamp <= nowMs);
  const remainingMs = purchaseTimestampsMs.length >= PRODUCTION_BOOST_PURCHASE_LIMIT
    ? Math.max(0, purchaseTimestampsMs[0] + PRODUCTION_BOOST_PURCHASE_WINDOW_MS - nowMs)
    : 0;
  return { count: purchaseTimestampsMs.length, remainingMs, purchaseTimestampsMs };
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

function getCityUpgradePrestigeMultiplier(targetLevel) {
  const normalizedTarget = clampCityLevel(targetLevel);
  if (normalizedTarget <= CITY_PRESTIGE_START_LEVEL) return 1;
  const band = Math.floor((normalizedTarget - CITY_PRESTIGE_START_LEVEL - 1) / CITY_PRESTIGE_BAND_SIZE) + 1;
  const multiplier = Math.pow(2, band);
  return Number.isFinite(multiplier) ? multiplier : Infinity;
}

function getCityUpgradeCost(city = {}, bonuses = {}) {
  if (isStronghold(city)) return Infinity;
  const startLevel = clampCityLevel(city.level);
  const targetLevel = startLevel + 1;
  if (!Number.isSafeInteger(targetLevel)) return Infinity;
  const baseCost = MILLION_LORDS_CITY_COST_BASE * (
    Math.pow(MILLION_LORDS_CITY_COST_GROWTH, targetLevel - 1)
      - Math.pow(MILLION_LORDS_CITY_COST_GROWTH, startLevel - 1)
  );
  const totalCost = baseCost * getCityUpgradePrestigeMultiplier(targetLevel);
  if (!Number.isFinite(totalCost)) return Infinity;
  const reduction = Math.max(0, safeNumber(bonuses.upgradeCostReductionPercent, 0));
  return Math.max(0, Math.floor(totalCost * (1 - Math.min(85, reduction) / 100) + 0.000001));
}

function getCityUpgradeXpAward(city = {}) {
  return Math.floor(CITY_UPGRADE_XP_BASE + clampCityLevel(city.level) * CITY_UPGRADE_XP_PER_LEVEL);
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

function findNearestRelinquishDestination(economy = null, sourceEntry = null) {
  if (!economy || !sourceEntry?.city) return null;
  const source = sourceEntry.city;
  const sourceRegionId = normalizeRegionId(source.regionId || "");
  const sourceX = safeNumber(source.x, 0);
  const sourceY = safeNumber(source.y, 0);
  return economy.cityEntries
    .filter(entry => entry?.ref?.path !== sourceEntry.ref.path)
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

function getCityEntryIslandId(entry = {}) {
  return safeString(entry.ref?.parent?.parent?.id || getOnlineIslandId(entry.city?.regionId), 160);
}

function getCityEntryPath(entry = {}) {
  return safeString(entry.ref?.path, 240);
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
  const itemEffects = normalizeItemEffects(rawProfile.itemEffects);
  const shopItems = normalizeShopItems(rawProfile.shopItems);
  const itemPurchaseCooldowns = normalizeItemPurchaseCooldowns(rawProfile.itemPurchaseCooldowns);
  const baseGold = Math.max(0, safeNumber(rawProfile.goldFloat, safeNumber(rawProfile.gold, TEST_STARTING_GOLD)));
  const fallbackProductionAtMs = Math.min(nowMs, getProfileLastSeenMs(rawProfile) || nowMs);
  const economyRevisionMs = Math.max(nowMs, timestampToMs(rawProfile.economyUpdatedAtMs) + 1);

  const [ownedSnap, activeArmiesSnap] = await Promise.all([
    transaction.get(db.collectionGroup("cities").where("ownerUid", "==", uid)),
    transaction.get(activeArmiesQueryForPlayer(uid)),
  ]);
  const cityEntries = createOwnedCityEntriesFromSnapshot(uid, ownedSnap);
  const activeArmies = createActiveArmiesFromSnapshot(uid, activeArmiesSnap);
  const mainCityRepair = createMainCityAssignmentRepair(uid, rawProfile, cityEntries);
  const cityPatches = [...mainCityRepair.cityPatches];
  const cityUpdates = [...mainCityRepair.cityUpdates];
  const productionCityPatches = [];

  const bonuses = getOwnedStrongholdBonuses(cityEntries);
  const lastEconomyAtMs = Math.min(
    nowMs,
    timestampToMs(rawProfile.economyUpdatedAtMs) || fallbackProductionAtMs
  );
  const goldElapsedSeconds = clamp((nowMs - lastEconomyAtMs) / 1000, 0, MAX_SERVER_PRODUCTION_SECONDS);
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
    const stats = getCityProductionStats(city, { ...rawProfile, itemEffects }, bonuses, {
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
    shopItems,
    itemEffects,
    itemPurchaseCooldowns,
    ...mainCityRepair.profileFields,
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

function writeGlobalStatsFromEconomy(transaction, economy = null, profileOverrides = {}, extraCityPatches = [], options = {}) {
  if (!economy?.uid || !economy.globalStatsRef) return null;
  const profile = {
    ...(economy.profileAfter || {}),
    ...(profileOverrides || {}),
  };
  const stats = createGlobalStatsSnapshot({
    uid: economy.uid,
    profile,
    cityEntries: createPatchedCityEntriesForStats(economy, extraCityPatches),
    activeArmies: createPatchedActiveArmiesForStats(economy, options),
    bonuses: null,
    nowMs: options.nowMs || Date.now(),
  });
  transaction.set(economy.globalStatsRef, stats, { merge: true });
  transaction.set(leaderboardEntryRef(economy.uid), {
    uid: economy.uid,
    displayName: normalizePlayerName(profile.playerName || profile.displayName),
    playerName: normalizePlayerName(profile.playerName || profile.displayName),
    flag: profile.flag || null,
    kingPower: stats.kingPower,
    kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
    kingPowerUpdatedAtMs: stats.updatedAtMs,
    cityCount: stats.totalCities,
    totalTroops: stats.totalTroops,
    totalMarchingTroops: stats.totalMarchingTroops,
    goldPerHour: stats.goldPerHour,
    troopPerHour: stats.troopPerHour,
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
  const [profileSnap, ownedSnap, activeArmiesSnap] = await Promise.all([
    profileRef.get(),
    db.collectionGroup("cities").where("ownerUid", "==", playerUid).get(),
    activeArmiesQueryForPlayer(playerUid).get(),
  ]);
  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  const identity = getCanonicalPlayerIdentity(playerUid, profile, {}, {});
  const cityEntries = createOwnedCityEntriesFromSnapshot(playerUid, ownedSnap);
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
    activeArmies,
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
        playerName: identity.ownerName,
        displayName: identity.ownerName,
        flag: identity.ownerFlag,
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
        displayName: identity.ownerName,
        playerName: identity.ownerName,
        flag: identity.ownerFlag,
        kingPower: stats.kingPower,
        kingPowerVersion: GLOBAL_PLAYER_STATS_VERSION,
        kingPowerUpdatedAtMs: nowMs,
        cityCount: stats.totalCities,
        totalTroops: stats.totalTroops,
        totalMarchingTroops: stats.totalMarchingTroops,
        goldPerHour: stats.goldPerHour,
        troopPerHour: stats.troopPerHour,
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
      includeRoyalTaxDecree: false,
    });
    totals.goldPerSecond += Math.max(0, safeNumber(stats.goldProductionPerSecond, 0));
    totals.troopProductionPerSecond += Math.max(0, safeNumber(stats.troopProductionPerSecond, 0));
    return totals;
  }, { goldPerSecond: 0, troopProductionPerSecond: 0 });
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
  const kind = movement.kind === "scout" ? "scout" : movement.kind === "attack" ? "attack" : "";
  if (!defenderUid || !attackerUid || defenderUid === attackerUid || !kind) return null;
  const attackerName = normalizePlayerName(movement.ownerName || source.ownerName, "A rival ruler");
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

  const [ownedCitiesSnap, activeArmiesSnap] = await Promise.all([
    db.collectionGroup("cities").where("ownerUid", "==", uid).get(),
    activeArmiesQueryForPlayer(uid).get(),
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
  const globalStats = createGlobalStatsSnapshot({
    uid,
    profile: profileForStats,
    cityEntries: ownedCityEntries,
    activeArmies,
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

  cityDocs.forEach(cityDoc => {
    writes.push({
      ref: cityDoc.ref,
      data: {
        ownerKind: "player",
        ownerUid: uid,
        ownerName: identity.ownerName,
        ownerFlag: identity.ownerFlag,
        ownerKingPower: serverKingPower,
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
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });
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

exports.ensureMainIsland = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
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
  const safeMeta = seed.meta;

  if (islandSnap.exists && !needsCitySeed && !needsCampSeed && !needsLayoutRefresh && seededCityCount === targetCityCount && seededCampCount === targetCampCount) {
    return {
      islandId,
      seeded: false,
      refreshed: false,
      cityCount: targetCityCount,
      campCount: targetCampCount,
      version: targetVersion,
    };
  }

  const cityDocs = await citiesRef.get();
  const campDocs = targetCampCount ? await campsRef.get() : { docs: [] };
  const existingCityDataById = new Map(cityDocs.docs.map(cityDoc => [cityDoc.id, cityDoc.data() || {}]));
  const existingCityIds = new Set(existingCityDataById.keys());
  const existingCampIds = new Set(campDocs.docs.map(campDoc => campDoc.id));
  const seedsToWrite = needsLayoutRefresh
    ? citySeeds
    : citySeeds.filter(city => !existingCityIds.has(city.id));
  const campSeedsToWrite = needsLayoutRefresh
    ? campSeeds
    : campSeeds.filter(camp => !existingCampIds.has(camp.id));

  const batch = db.batch();
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
    refreshed: needsLayoutRefresh,
    writes: seedsToWrite.length + campSeedsToWrite.length,
    cityCount: targetCityCount,
    campCount: targetCampCount,
    version: targetVersion,
  };
});

exports.claimStartingCity = onCall({ region: "us-central1", maxInstances: 20, invoker: "public" }, async request => {
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
    const ownedSnap = await transaction.get(db.collectionGroup("cities").where("ownerUid", "==", uid));
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
      const troops = setStartingTroops ? Math.max(50, baseTroops) : baseTroops;
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
      xpAward += getCityUpgradeXpAward(city);
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

      const ownerKingPower = Math.max(0, Math.floor(safeNumber(economy.globalStats?.kingPower, 0)));
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

    writePreparedEconomy(transaction, economy, {}, [
      { ref: sourceEntry.ref, city: source, patch: sourcePatch },
    ], {
      addActiveArmies: movement ? [movement] : [],
      nowMs,
    });

    armyRefs.forEach(ref => transaction.set(ref, {
      ...movement,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }));

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
    if (itemId === ROYAL_PEACE_SHIELD_ITEM_ID) {
      const cooldownRemainingMs = getShieldPurchaseCooldownRemainingMs(economy.itemPurchaseCooldowns, nowMs);
      if (cooldownRemainingMs > 0) {
        throw new HttpsError(
          "failed-precondition",
          `Royal Peace Shield can only be purchased once every 24 hours. Available in ${formatCooldownMs(cooldownRemainingMs)}.`
        );
      }
    }
    const productionBoostPurchaseStatus = getProductionBoostPurchaseStatus(itemId, economy.itemPurchaseCooldowns, nowMs);
    if (productionBoostPurchaseStatus.remainingMs > 0) {
      throw new HttpsError(
        "failed-precondition",
        `${item.label} can only be purchased ${PRODUCTION_BOOST_PURCHASE_LIMIT} times every 24 hours. Available in ${formatCooldownMs(productionBoostPurchaseStatus.remainingMs)}.`
      );
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
      ...(PRODUCTION_BOOST_ITEM_IDS.has(itemId) ? {
        [itemId]: {
          purchaseTimestampsMs: [...productionBoostPurchaseStatus.purchaseTimestampsMs, nowMs]
            .sort((a, b) => a - b)
            .slice(-PRODUCTION_BOOST_PURCHASE_LIMIT),
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
      throw new HttpsError("failed-precondition", "Swift March Orders only work between two cities you own.");
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
    if (getOwnerUid(source) !== uid || getOwnerUid(target) !== uid || isStronghold(source) || isStronghold(target)) {
      throw new HttpsError("failed-precondition", "Swift March Orders only work between two cities you currently own.");
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
    armyRefsForRegions(routeRegionIds, armyId).forEach(ref => {
      transaction.set(ref, movementPatch, { merge: true });
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
    armyRefsForRegions(routeRegionIds, armyId).forEach(ref => {
      transaction.set(ref, movementPatch, { merge: true });
    });
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
  const attackerLeaderboardRef = db.doc(`leaderboards/kingPower/entries/${uid}`);

  const result = await db.runTransaction(async transaction => {
    const [sourceSnap, targetSnap, canonicalArmySnap, legacyArmySnap, playerSnap, attackerLeaderboardSnap] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(targetRef),
      transaction.get(armyRefs[0]),
      transaction.get(legacyArmyRef),
      transaction.get(playerRef),
      transaction.get(attackerLeaderboardRef),
    ]);

    if (!sourceSnap.exists) throw new HttpsError("not-found", "Source city was not found.");
    if (!targetSnap.exists) throw new HttpsError("not-found", "Destination city was not found.");

    let source = { id: sourceSnap.id, ...sourceSnap.data() };
    const target = order.targetType === "camp"
      ? getRewardCampCombatTarget({ id: targetSnap.id, ...targetSnap.data() })
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
    const defenderPowerSnap = targetOwnerUid && targetOwnerUid !== uid
      ? await transaction.get(db.doc(`players/${targetOwnerUid}`))
      : null;
    const defenderLeaderboardSnap = targetOwnerUid && targetOwnerUid !== uid
      ? await transaction.get(db.doc(`leaderboards/kingPower/entries/${targetOwnerUid}`))
      : null;
    const defenderPowerData = defenderPowerSnap?.exists ? defenderPowerSnap.data() || {} : {};
    const defenderLeaderboardData = defenderLeaderboardSnap?.exists ? defenderLeaderboardSnap.data() || {} : {};

    const sourceTroops = Math.max(0, Math.floor(safeNumber(source.troops, 0)));
    const resolvedKind = order.kind === "scout"
      ? "scout"
      : targetOwnerUid === uid
        ? "transfer"
        : "attack";
    const neutralCaptureBlockReason = resolvedKind === "attack" && order.targetType !== "camp"
      ? getServerNeutralCaptureBlockReason(attackerEconomy, attackerProfile, target)
      : "";
    if (neutralCaptureBlockReason) {
      throw new HttpsError("failed-precondition", neutralCaptureBlockReason);
    }
    const requestedTroops = resolvedKind === "scout"
      ? 1
      : clampInt(order.requestedTroops || order.troops || Math.floor(sourceTroops * DEFAULT_MARCH_PERCENT), 1, Math.max(1, sourceTroops));
    const attackerKingPower = Math.max(
      0,
      Math.floor(safeNumber(attackerEconomy.globalStats?.kingPower, 0))
    ) || getPlayerPowerSnapshot({
      profile: attackerProfile,
      leaderboard: attackerLeaderboardData,
      city: source,
      fallback: Math.max(order.ownerKingPower, order.attackerKingPower),
    });
    const defenderKingPower = Math.max(1, getPlayerPowerSnapshot({
      profile: defenderPowerData,
      leaderboard: defenderLeaderboardData,
      city: target,
      fallback: order.defenderKingPower,
    }));
    const demoAttack = resolvedKind === "attack" && order.targetType !== "camp"
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
    if (order.targetType !== "camp" && resolvedKind === "scout" && isProtectedMainCity(target, uid)) {
      throw new HttpsError("failed-precondition", "Main cities cannot be scouted.");
    }
    if (order.targetType !== "camp" && resolvedKind === "scout" && targetOwnerUid && targetOwnerUid !== uid && isVeilOfSilenceActive(defenderPowerData, nowMs)) {
      throw new HttpsError("failed-precondition", "That city is hidden by Veil of Silence.");
    }
    if (resolvedKind === "attack" && order.targetType !== "camp") {
      if (isProtectedMainCity(target, uid)) {
        throw new HttpsError("failed-precondition", "Main cities cannot be attacked.");
      }
      if (isCityShielded(target, uid, nowMs)) {
        throw new HttpsError("failed-precondition", "That city is protected by a Royal Peace Shield.");
      }
    }

    const duration = calculateTravelTime({
      pathLength: validatedRoute.pathLength,
      troopCount: troops,
      kind: resolvedKind,
      targetType: order.targetType,
      demoAttack,
      speedMultiplier: skillMultiplier(attackerProfile, "marchOrders")
        * (1 + Math.max(0, safeNumber(attackerEconomy.bonuses.marchSpeedBonusPercent, 0)) / 100),
    });
    const movement = {
      id: order.id,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      ownerKind: "player",
      ownerUid: uid,
      ownerName: normalizePlayerName(attackerProfile.playerName || order.ownerName || source.ownerName || request.auth.token?.name),
      ownerFlag: attackerProfile.flag || order.ownerFlag || source.ownerFlag || null,
      ownerKingPower: attackerKingPower,
      kind: resolvedKind,
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
      targetOwnerAtLaunch: targetOwnerUid ? "player" : "neutral",
      targetOwnerUid: targetOwnerUid || "",
      attackerKingPower: attackerKingPower || order.attackerKingPower || order.ownerKingPower,
      defenderKingPower,
      demoAttack,
      launchedAtMs: nowMs,
      arrivesAtMs: nowMs + Math.ceil(duration * 1000),
      status: "active",
      createdByServer: true,
      serverAuthorityVersion: 2,
    };

    let profileOverrides = {};
    let peaceShieldDeactivated = false;
    const launchCityPatches = [];
    const launchCityUpdates = [];
    if (shouldDeactivatePeaceShieldForAttack(target, order.targetType, uid, resolvedKind)) {
      const itemEffects = { ...(attackerEconomy.itemEffects || {}) };
      const shieldIsActive = safeNumber(itemEffects.shieldExpiresAtMs, 0) > nowMs
        || attackerEconomy.cityEntries.some(entry => (
          entry?.city
          && !isStronghold(entry.city)
          && getShieldExpiresAtMs(entry.city) > nowMs
        ));
      if (shieldIsActive) {
        itemEffects.shieldExpiresAtMs = 0;
        profileOverrides = { itemEffects };
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
    writePreparedEconomy(transaction, attackerEconomy, profileOverrides, [
      ...launchCityPatches,
    ], {
      addActiveArmies: [movement],
      nowMs,
    });

    armyRefs.forEach(ref => transaction.set(ref, {
      ...movement,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }));

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
    const isReturning = Boolean(army.returning && army.returnReason === RECALL_HORN_ITEM_ID);
    const isCampReturn = Boolean(army.campReturn);
    if (!targetSnap.exists && !isReturning && !isCampReturn) throw new HttpsError("not-found", "Target city was not found.");

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
    const writeParticipantEconomies = (attackerOverrides = {}, defenderOverrides = {}, options = {}) => {
      const statsOptions = {
        excludeArmyIds: [armyId],
        statsCityPatches: Array.isArray(options.statsCityPatches) ? options.statsCityPatches : [],
        nowMs,
      };
      const attackerStats = attackerEconomy
        ? writePreparedEconomy(transaction, attackerEconomy, attackerOverrides, [], statsOptions)
        : null;
      const defenderStats = defenderEconomy && defenderEconomy !== attackerEconomy
        ? writePreparedEconomy(transaction, defenderEconomy, defenderOverrides, [], statsOptions)
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
      armyRefs.forEach(ref => transaction.set(ref, patch, { merge: true }));
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
      appendEconomyCityPatch(economy, mainInfo.ref, city, patch);
      transaction.set(mainInfo.ref, cleanCityUpdate(city, patch), { merge: true });
      cityUpdates.push({ id: city.id, regionId: mainInfo.regionId, ...patch });
      return recovered;
    };

    const troopCount = Math.max(0, Math.floor(safeNumber(army.troops, 0)));
    const defenderBonuses = defenderEconomy?.bonuses || {};
    const targetStats = getCityStats(target, defenderProfile, defenderBonuses);
    const attackerName = normalizePlayerName(attackerProfile.playerName || army.ownerName, "Rival ruler");
    const defenderName = defenderUid
      ? normalizePlayerName(target.ownerName || defenderProfile.playerName, "Rival ruler")
      : "Neutral city";

    if (isCampReturn && defenderUid !== attackerUid) {
      const returnedArmy = returnRecalledTroops(troopCount);
      writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
      markResolved({
        kind: "return",
        campReturn: true,
        rerouted: true,
        returned: returnedArmy.returned,
        returnCityId: returnedArmy.cityId,
      });
      return {
        ok: true,
        status: "resolved",
        kind: "return",
        campReturn: true,
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
        recalled: true,
        returned: returnedArmy.returned,
        returnCityId: returnedArmy.cityId,
      });
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

    if (targetType === "camp") {
      if (army.kind === "scout") {
        const campTarget = getRewardCampCombatTarget(target);
        const scoutReport = createScoutReportSnapshot(campTarget, defenderProfile, nowMs, defenderBonuses);
        const report = makeReport({
          id: `${armyId}_${campTarget.campType}_camp_scout_${attackerUid}`,
          uid: attackerUid,
          type: "scout",
          outcome: "scout",
          city: campTarget,
          opponentName: defenderUid ? defenderName : "Neutral defenders",
          sentTroops: troopCount,
          troopCount: scoutReport.troops,
          totalDefense: scoutReport.totalDefense,
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

      const campTarget = getRewardCampCombatTarget(target);
      const campConfig = getRewardCampConfig(campTarget);
      const campStats = getCityStats(campTarget, defenderProfile, defenderBonuses);
      const defendersAtStart = Math.max(0, Math.floor(safeNumber(campTarget.troops, 0)));
      const battle = calculateCombatResult(troopCount, campTarget, attackerProfile, defenderProfile, { defenderBonuses });
      const attackerReport = makeReport({
        id: `${armyId}_${campTarget.campType}_camp_attack_${attackerUid}`,
        uid: attackerUid,
        type: "attack",
        outcome: battle.success ? "victory" : "defeat",
        city: campTarget,
        opponentName: defenderUid ? defenderName : "Neutral defenders",
        sentTroops: troopCount,
        troopCount: defendersAtStart,
        result: battle,
        totalDefense: campStats.totalDefense,
        summary: battle.success
          ? `Captured ${campTarget.name || campConfig.name} with ${battle.survivors.toLocaleString()} troops. Hold it for ${Math.floor(campConfig.holdDurationMs / 60000)} minutes to earn ${campConfig.rewardType}.`
          : `${battle.defendersLeft.toLocaleString()} defenders remained at ${campTarget.name || campConfig.name}.`,
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
          currentGarrison: battle.defendersLeft,
          activeArmyIds: remainingActiveArmyIds,
          state: getRewardCampState(remainingActiveArmyIds, defenderUid),
          updatedAt: FieldValue.serverTimestamp(),
        };
      }

      writeParticipantEconomies();
      transaction.set(targetRef, campPatch, { merge: true });
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
          sentTroops: troopCount,
          troopCount: defendersAtStart,
          result: battle,
          totalDefense: campStats.totalDefense,
          summary: battle.success
            ? `${attackerName} captured ${campTarget.name || campConfig.name}.`
            : `${campTarget.name || campConfig.name} held with ${battle.defendersLeft.toLocaleString()} defenders.`,
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
      if (isProtectedMainCity(target, attackerUid)) {
        const returned = returnTroopsToSource(troopCount);
        writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
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
        const returned = returnTroopsToSource(troopCount);
        writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
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
          sentTroops: troopCount,
          troopCount: nextTroops,
          totalDefense: ownCityStats.totalDefense,
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

    const effectiveKind = defenderUid === attackerUid ? "transfer" : "attack";
    if (effectiveKind === "transfer") {
      const nextTroops = Math.max(0, Math.floor(safeNumber(target.troops, 0))) + troopCount;
      const targetTroopPatch = {
        troops: nextTroops,
        troopFloat: Math.max(0, safeNumber(target.troopFloat, target.troops || 0)) + troopCount,
      };
      writeParticipantEconomies({}, {}, { statsCityPatches: [{ ref: targetRef, city: target, patch: targetTroopPatch }] });
      transaction.set(targetRef, cleanCityUpdate(target, targetTroopPatch), { merge: true });
      cityUpdates.push({ id: target.id, regionId: targetRegionId, troops: nextTroops });
      markResolved({ kind: "transfer", troops: troopCount });
      return { ok: true, status: "resolved", kind: "transfer", cityUpdates: withEconomyCityUpdates(cityUpdates) };
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
        sentTroops: troopCount,
        troopCount: Math.max(0, Math.floor(safeNumber(target.troops, 0))),
        totalDefense: targetStats.totalDefense,
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

    if (isProtectedMainCity(target, attackerUid)) {
      const returned = returnTroopsToSource(troopCount);
      writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
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
      const returned = returnTroopsToSource(troopCount);
      writeParticipantEconomies({}, {}, { statsCityPatches: getLatestSourceReturnStatsPatches() });
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
      const nextLevel = dropCapturedCityLevel(target);
      const targetPatch = {
        ownerKind: "player",
        ownerUid: attackerUid,
        ownerName: attackerName,
        ownerFlag: attackerProfile.flag || army.ownerFlag || null,
        ownerKingPower: Math.max(0, Math.floor(safeNumber(attackerProfile.kingPower || army.ownerKingPower, 0))),
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
      const targetCityUpdate = { id: target.id, regionId: targetRegionId, ...targetPatch };
      cityUpdates.push(targetCityUpdate);

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

async function refreshActiveArmyTargetOwner(targetKey = "", targetOwnerUid = "") {
  const safeTargetKey = safeString(targetKey, 180);
  if (!safeTargetKey) return 0;
  const snapshot = await db.collection("armies")
    .where("targetKey", "==", safeTargetKey)
    .where("status", "==", "active")
    .limit(400)
    .get();
  await processWithConcurrency(snapshot.docs, 8, async armyDoc => {
    const army = armyDoc.data() || {};
    const refs = armyRefsForRegions(army.viewRegionIds || army.routeRegionIds || [], armyDoc.id);
    const batch = db.batch();
    refs.forEach(ref => batch.set(ref, {
      targetOwnerUid: safeString(targetOwnerUid, 128),
      targetOwnerUpdatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
    await batch.commit();
  });
  return snapshot.size;
}

function getOwnerUidFromWrittenTarget(data = {}, targetType = "city") {
  return targetType === "camp"
    ? safeString(data.holderUid || data.ownerUid, 128)
    : safeString(data.ownerUid, 128);
}

async function handleTargetOwnershipWrite(event, targetType = "city") {
  const before = event.data?.before?.exists ? event.data.before.data() || {} : {};
  const after = event.data?.after?.exists ? event.data.after.data() || {} : {};
  const beforeOwnerUid = getOwnerUidFromWrittenTarget(before, targetType);
  const afterOwnerUid = getOwnerUidFromWrittenTarget(after, targetType);
  if (beforeOwnerUid === afterOwnerUid) return;
  const islandId = safeString(event.params?.islandId, 160);
  if (!isCurrentWorldIslandId(islandId)) return;
  const regionId = getRegionIdFromOnlineIslandId(islandId);
  const targetId = safeString(targetType === "camp" ? event.params?.campId : event.params?.cityId, 96);
  await refreshActiveArmyTargetOwner(`${regionId}:${targetId}`, afterOwnerUid);
}

exports.syncCityArmyTargetOwner = onDocumentWritten({
  region: "us-central1",
  document: "islands/{islandId}/cities/{cityId}",
  maxInstances: 20,
}, event => handleTargetOwnershipWrite(event, "city"));

exports.syncCampArmyTargetOwner = onDocumentWritten({
  region: "us-central1",
  document: "islands/{islandId}/camps/{campId}",
  maxInstances: 20,
}, event => handleTargetOwnershipWrite(event, "camp"));

function getUtcDateKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function getRewardCampDailyReward(config, claimIndex = 0) {
  return config?.dailyRewards?.[Math.max(0, Math.floor(safeNumber(claimIndex, 0)))] || 0;
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

    const playerRef = db.doc(`players/${holderUid}`);
    const claimsRef = db.doc(`players/${holderUid}/objectiveStats/${config.objectiveStatsId}`);
    const playerSnap = await transaction.get(playerRef);
    const claimsSnap = await transaction.get(claimsRef);
    const player = playerSnap.exists ? playerSnap.data() || {} : {};
    const claimData = claimsSnap.exists ? claimsSnap.data() || {} : {};
    const today = getUtcDateKey(nowMs);
    const priorClaims = claimData.date === today ? Math.max(0, Math.floor(safeNumber(claimData.count, 0))) : 0;
    const reward = getRewardCampDailyReward(config, priorClaims);
    const nextClaims = priorClaims + 1;

    const mainCityInfo = getMainCityInfo(player);
    const mainCitySnap = mainCityInfo?.ref ? await transaction.get(mainCityInfo.ref) : null;
    const mainCity = mainCitySnap?.exists ? { id: mainCitySnap.id, ...mainCitySnap.data() } : null;
    if (!mainCity || getOwnerUid(mainCity) !== holderUid) {
      throw new HttpsError("failed-precondition", `${config.name} holder has no valid main city for payout.`);
    }
    const returnSourceCityId = safeString(camp.returnSourceCityId, 96).replace(/[^a-zA-Z0-9_-]/g, "_");
    const returnSourceRegionId = normalizeRegionId(camp.returnSourceRegionId || camp.regionId);
    const returnSourceRef = returnSourceCityId ? cityRefForRegion(returnSourceRegionId, returnSourceCityId) : null;
    const returnSourceSnap = returnSourceRef ? await transaction.get(returnSourceRef) : null;
    const returnSourceCity = returnSourceSnap?.exists ? { id: returnSourceSnap.id, ...returnSourceSnap.data() } : null;
    const returnDestination = returnSourceCity && getOwnerUid(returnSourceCity) === holderUid ? returnSourceCity : mainCity;
    const returnDestinationRegionId = normalizeRegionId(returnDestination.regionId || mainCityInfo.regionId);
    const returningTroops = Math.max(0, Math.floor(safeNumber(camp.currentGarrison, camp.troops)));
    const troopReward = config.rewardType === "troops" ? reward : 0;
    let returnedTroops = 0;
    let rewardedTroops = 0;
    let mainCityPatch = null;
    if (mainCity && getOwnerUid(mainCity) === holderUid && troopReward > 0) {
      const troopFloat = Math.max(0, safeNumber(mainCity.troopFloat, mainCity.troops || 0)) + troopReward;
      mainCityPatch = {
        id: mainCity.id,
        regionId: mainCityInfo.regionId,
        troops: Math.floor(troopFloat),
        troopFloat,
        productionUpdatedAtMs: nowMs,
      };
      transaction.set(mainCityInfo.ref, cleanCityUpdate(mainCity, {
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
      });
      returnArmy = {
        id: returnArmyId,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        ownerKind: "player",
        ownerUid: holderUid,
        ownerName: normalizePlayerName(player.playerName || camp.holderName, "Ruler"),
        ownerFlag: player.flag || camp.holderFlag || null,
        ownerKingPower: normalizePowerValue(player.globalStats?.kingPower),
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
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      armyRefsForRegions(route.routeRegionIds, returnArmyId).forEach(ref => {
        transaction.set(ref, returnArmy, { merge: true });
      });
    }

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
      },
      lastResetDate: today,
      lastPaidAtMs: nowMs,
      state: getRewardCampState(activeArmyIds, ""),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(campRef, campPatch, { merge: true });
    transaction.set(claimsRef, {
      date: today,
      count: nextClaims,
      lastReward: reward,
      lastCampId: camp.id,
      lastClaimedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const goldReward = config.rewardType === "gold" ? reward : 0;
    const nextGoldFloat = Math.max(0, safeNumber(player.goldFloat, player.gold || 0)) + goldReward;
    const nextGold = Math.floor(nextGoldFloat);
    const holdMinutes = Math.floor(config.holdDurationMs / 60000);
    const rewardLabel = config.rewardType === "troops" ? `${reward.toLocaleString()} troops` : `${reward.toLocaleString()} gold`;
    const report = makeReport({
      id: `${camp.id}_hold_${nowMs}_${holderUid}`,
      uid: holderUid,
      type: "defense",
      outcome: "held",
      city: camp,
      opponentName: config.name,
      troopCount: returningTroops,
      result: { survivors: returningTroops, defendersLeft: 0, returning: Boolean(returnArmy) },
      totalDefense: 0,
      summary: reward > 0
        ? `Held ${camp.name || config.name} for ${holdMinutes} minutes and earned ${rewardLabel}.${returnArmy ? ` ${returningTroops.toLocaleString()} stationed troops began marching to ${returnDestination.name || "your main city"}.` : ""}`
        : `Held ${camp.name || config.name} for ${holdMinutes} minutes. Today's ${config.name} reward limit has been reached.${returnArmy ? ` ${returningTroops.toLocaleString()} stationed troops began marching to ${returnDestination.name || "your main city"}.` : ""}`,
      goldAwarded: goldReward,
      troopsAwarded: rewardedTroops,
      goldAfter: nextGold,
      nowMs,
    });
    writeReport(transaction, holderUid, report, playerSnap, config.rewardType === "gold" ? {
      gold: nextGold,
      goldFloat: nextGoldFloat,
    } : {});
    transaction.set(islandReportRef(camp.regionId, report.id), {
      ...report,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      ok: true,
      status: "paid",
      holderUid,
      reward,
      rewardType: config.rewardType,
      campType: config.campType,
      dailyClaim: nextClaims,
      returnedTroops,
      returningTroops,
      returnArmyId: returnArmy?.id || "",
      returnDestinationId: returnArmy?.toId || "",
      returnDestinationRegionId: returnArmy?.targetRegionId || "",
      returnArrivesAtMs: returnArmy?.arrivesAtMs || 0,
      rewardedTroops,
      campUpdate: campUpdateForClient(camp.id, camp.regionId, campPatch),
      cityUpdates: mainCityPatch ? [mainCityPatch] : [],
      currentUser: callerUid === holderUid && config.rewardType === "gold" ? { gold: nextGold, goldFloat: nextGoldFloat } : null,
    };
  });
}

async function resolveRewardCampPayoutAndStats(campRef, nowMs = Date.now(), callerUid = "") {
  const result = await resolveRewardCampPayoutByRef(campRef, nowMs, callerUid);
  if (result?.status === "paid" && result.holderUid) {
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
      });
      movement = {
        id: armyId,
        worldId: ONLINE_WORLD_ID,
        resetGeneration: RESET_GENERATION,
        ownerKind: "player",
        ownerUid: uid,
        ownerName: normalizePlayerName(player.playerName || rawCamp.holderName, "Ruler"),
        ownerFlag: player.flag || rawCamp.holderFlag || null,
        ownerKingPower: normalizePowerValue(player.globalStats?.kingPower),
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
      armyRefsForRegions(route.routeRegionIds, armyId).forEach(ref => {
        transaction.set(ref, {
          ...movement,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
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
  const [canonicalSnap, legacySnap] = await Promise.all([
    db.collection("armies")
      .where("status", "==", "active")
      .where("arrivesAtMs", "<=", nowMs)
      .orderBy("arrivesAtMs", "asc")
      .limit(SCHEDULED_ARMY_RESOLVE_SCAN_LIMIT)
      .get(),
    // Keep resolving pre-migration marches until every legacy view has settled.
    db.collectionGroup("armies")
      .where("status", "==", "active")
      .where("arrivesAtMs", "<=", nowMs)
      .orderBy("arrivesAtMs", "asc")
      .limit(Math.min(100, SCHEDULED_ARMY_RESOLVE_SCAN_LIMIT))
      .get(),
  ]);
  const targetsByKey = new Map();
  [...canonicalSnap.docs, ...legacySnap.docs].forEach(doc => {
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
      else skipped += 1;
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
