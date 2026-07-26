const WORLD_CONFIG = window.CROWNLANDS_WORLD_CONFIG || {};
const MAP_EDITOR_DATA = window.CROWNLANDS_MAP_EDITOR_DATA || {};
const WORLD_SCHEMA_VERSION = Math.max(Number(WORLD_CONFIG.version) || 23, Number(MAP_EDITOR_DATA.version) || 0);
const APP_BUILD_ID = getCurrentDocumentBuildId();
const WORLD_REGIONS = getMergedWorldRegions(WORLD_CONFIG, MAP_EDITOR_DATA);
const LAND_BRIDGES = getMergedLandBridges(WORLD_CONFIG, MAP_EDITOR_DATA);
const REGION_CITY_COUNT = Math.max(1, Math.floor(Number(WORLD_CONFIG.cityCountPerRegion) || 50));
const STARTER_REGION_TYPE = "starter";
const NEW_PLAYER_SPAWN_REGION_TYPE_ORDER = [STARTER_REGION_TYPE, "midgame", "endgame"];
const MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES = 10;
const RESET_GENERATION = "fresh-2026-07-05-server-reset";
const STORAGE_KEY = `crownlands-realtime-${RESET_GENERATION}`;
const PENDING_ARMY_STORAGE_KEY = `crownlands-pending-armies-${RESET_GENERATION}`;
const PUSH_NOTIFICATIONS_PREF_KEY = "crownlands-push-notifications";
const LEGACY_STORAGE_KEYS = [];
const SAVE_EVERY_SECONDS = 30;
const ONLINE_SAVE_SECONDS = 20;
const ONLINE_SAVE_SLOT = `default-${RESET_GENERATION}`;
const ONLINE_WORLD_ID = `main-${RESET_GENERATION}`;
const ONLINE_LEGACY_ISLAND_ID = ONLINE_WORLD_ID;
const GAME_SERVER_ID = "crown-marches";
const GAME_SERVER_NAME = "The Crown Marches";
const GAME_SERVER_HEARTBEAT_SECONDS = 60;
const DEFAULT_ONLINE_REGION_ID = WORLD_REGIONS.find(isStarterRegion)?.id
  || WORLD_REGIONS.find(region => region.id === "west")?.id
  || WORLD_REGIONS[0]?.id
  || "center";
const ONLINE_CITY_SYNC_SECONDS = 20;
const ONLINE_PRESENCE_SECONDS = 60;
const ONLINE_PRESENCE_STALE_SECONDS = 180;
const SERVER_ECONOMY_SYNC_SECONDS = 120;
const MAIN_CITY_ASSIGNMENT_VERSION = 2;
const LEADERBOARD_SAVE_SECONDS = 60;
const LEADERBOARD_STALE_REFRESH_MS = 5 * 60 * 1000;
const KING_POWER_LEADERBOARD_LIMIT = 100;
const PLAYER_NAME_MAX_LENGTH = 18;
const PLAYER_IDENTITY_LOOKUP_BATCH_SIZE = 80;
const PLAYER_IDENTITY_CACHE_STALE_MS = 5 * 60 * 1000;
const ONLINE_OWNED_CITIES_REFRESH_MS = 15 * 1000;
const ONLINE_INITIAL_CITY_LIST_TIMEOUT_MS = 18 * 1000;
const ONLINE_INITIAL_CITY_LIST_FALLBACK_TIMEOUT_MS = 35 * 1000;
const ONLINE_REGION_CITY_RESOLUTION_TIMEOUT_MS = 20 * 1000;
const ONLINE_ARMY_EXPIRY_GRACE_SECONDS = 8;
const ONLINE_ARMY_RESOLVE_RETRY_SECONDS = 5;
const PENDING_ARMY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_SECONDS = 60;
const UPDATE_RELOAD_SAVE_TIMEOUT_MS = 3000;
const UPDATE_RELOAD_PAUSE_MS = 650;
const SETUP_LOADING_MIN_MS = 180;
const IMAGE_PRELOAD_TIMEOUT_MS = 15000;
const SIMULATION_UPDATE_INTERVAL_MS = 100;
const HUD_RENDER_INTERVAL_MS = 250;
const HUD_STATUS_RENDER_INTERVAL_MS = 1000;
const MAP_RENDER_INTERVAL_MS = 1600;
const ARMY_RENDER_INTERVAL_MS = 140;
const CITY_DYNAMIC_TEXT_INTERVAL_MS = 600;
const PERFORMANCE_PANEL_SAMPLE_MS = 500;
const CROWDED_MAP_CITY_THRESHOLD = 70;
const CROWDED_MAP_ARMY_THRESHOLD = 24;
const CROWDED_MAP_CITY_EXIT_THRESHOLD = 58;
const CROWDED_MAP_ARMY_EXIT_THRESHOLD = 18;
const CITY_LIST_PAGE_SIZE = 5;
const INVENTORY_SLOT_COUNT = 6;
const ECONOMY_CONFIG = window.CROWNLANDS_ECONOMY_CONFIG || {};

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

const SHOP_ITEMS = [
  {
    id: "shield_12h",
    label: "Royal Peace Shield",
    description: "Protects your cities for 12 hours. Attacking another player cancels it. Strongholds are excluded.",
    cost: economyNumber("shopItems.shield_12h.cost", 1_250_000),
    icon: "assets/royal-peace-shield-icon.webp?v=20260703-shop-icons",
  },
  {
    id: "war_drums_30m",
    legacyIds: ["troop_boost_1h"],
    label: "War Drums",
    description: `Increases troop production from owned cities by ${economyNumber("shopItems.war_drums_30m.bonusPercent", 5)}% for ${economyNumber("shopItems.war_drums_30m.effectDurationMinutes", 30)} minutes.`,
    cost: economyNumber("shopItems.war_drums_30m.cost", 75_000),
    icon: "assets/war-drums-icon.webp?v=20260703-shop-icons",
  },
  {
    id: "royal_tax_decree_30m",
    label: "Royal Tax Decree",
    description: `Increases gold production from owned cities by ${economyNumber("shopItems.royal_tax_decree_30m.bonusPercent", 50)}% for ${economyNumber("shopItems.royal_tax_decree_30m.effectDurationMinutes", 30)} minutes.`,
    cost: economyNumber("shopItems.royal_tax_decree_30m.cost", 150_000),
    icon: "assets/royal-tax-decree-icon.webp?v=20260721-tax-decree",
  },
  {
    id: "veil_of_silence_30m",
    legacyIds: ["anti_scout_1h"],
    label: "Veil of Silence",
    description: `Blocks enemy scouting for ${economyNumber("shopItems.veil_of_silence_30m.effectDurationMinutes", 5)} minutes.`,
    cost: economyNumber("shopItems.veil_of_silence_30m.cost", 125_000),
    icon: "assets/veil-of-silence-icon.webp?v=20260703-shop-icons",
  },
  {
    id: "swift_march_order",
    label: "Swift March Order",
    description: "Speeds up one owned-city transfer or reinforcement to an owned Stronghold.",
    cost: economyNumber("shopItems.swift_march_order.cost", 300_000),
    icon: "assets/swift-march-order-icon.webp?v=20260703-shop-icons",
  },
  {
    id: "recall_horn",
    label: "Recall Horn",
    description: "Cancels one active march before it reaches the target.",
    cost: economyNumber("shopItems.recall_horn.cost", 500_000),
    icon: "assets/recall-horn-icon.webp?v=20260703-shop-icons",
  },
];
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
const RECALL_HORN_ITEM_ID = "recall_horn";
const ITEM_DAILY_PURCHASE_LIMITS = Object.freeze({
  [ROYAL_PEACE_SHIELD_ITEM_ID]: economyNumber("shopItems.shield_12h.dailyPurchaseLimit", 1),
  [WAR_DRUMS_ITEM_ID]: economyNumber("shopItems.war_drums_30m.dailyPurchaseLimit", 4),
  [ROYAL_TAX_DECREE_ITEM_ID]: economyNumber("shopItems.royal_tax_decree_30m.dailyPurchaseLimit", 2),
  [VEIL_OF_SILENCE_ITEM_ID]: economyNumber("shopItems.veil_of_silence_30m.dailyPurchaseLimit", 4),
  [SWIFT_MARCH_ORDER_ITEM_ID]: economyNumber("shopItems.swift_march_order.dailyPurchaseLimit", 2),
  [RECALL_HORN_ITEM_ID]: economyNumber("shopItems.recall_horn.dailyPurchaseLimit", 2),
});
const MAX_ITEM_DAILY_PURCHASE_LIMIT = Math.max(...Object.values(ITEM_DAILY_PURCHASE_LIMITS));

function cleanEditorRegionId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanRegionType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isStarterRegion(region = null) {
  return cleanRegionType(region?.type) === STARTER_REGION_TYPE;
}

function labelFromEditorRegionId(regionId) {
  return String(regionId || "island")
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Island";
}

function getEditorMapEntries(data = MAP_EDITOR_DATA) {
  return Array.isArray(data?.maps)
    ? data.maps
        .map(map => {
          const id = cleanEditorRegionId(map?.id);
          return id ? { ...map, id } : null;
        })
        .filter(Boolean)
    : [];
}

function getEditorMap(regionId) {
  const targetRegionId = cleanEditorRegionId(regionId);
  if (!targetRegionId) return null;
  return getEditorMapEntries().find(map => map.id === targetRegionId) || null;
}

function getBitmapIslandIds() {
  const ids = new Set(BASE_BITMAP_ISLAND_IDS);
  getEditorMapEntries().forEach(map => {
    if (map.imageSrc || map.image?.src) ids.add(map.id);
  });
  return Array.from(ids);
}

function buildDefaultEditorRegion(map, index, config = {}) {
  const worldWidth = Math.max(2000, Math.floor(Number(config.width) || 10000));
  const worldHeight = Math.max(1600, Math.floor(Number(config.height) || 7600));
  const angle = -Math.PI / 2 + index * 0.78;
  const rx = Math.max(900, Math.round(worldWidth * 0.11));
  const ry = Math.max(760, Math.round(worldHeight * 0.12));
  return {
    id: map.id,
    label: map.label || map.name || labelFromEditorRegionId(map.id),
    x: Math.round(worldWidth / 2 + Math.cos(angle) * worldWidth * 0.34),
    y: Math.round(worldHeight / 2 + Math.sin(angle) * worldHeight * 0.34),
    rx,
    ry,
    cityRx: Math.round(rx * 0.82),
    cityRy: Math.round(ry * 0.76),
    rot: 0,
    palette: map.palette || "heartland",
  };
}

function getMergedWorldRegions(config = {}, editorData = {}) {
  const baseRegions = Array.isArray(config.regions) ? config.regions.map(region => ({ ...region })) : [];
  const regionById = new Map(baseRegions.map(region => [cleanEditorRegionId(region.id), region]));
  const editorMaps = getEditorMapEntries(editorData);
  editorMaps.forEach((map, index) => {
    const existing = regionById.get(map.id);
    const regionPatch = map.region && typeof map.region === "object" ? map.region : {};
    const gridPatch = {};
    if (Number.isFinite(Number(map.gridX))) gridPatch.gridX = Math.round(Number(map.gridX));
    if (Number.isFinite(Number(map.gridY))) gridPatch.gridY = Math.round(Number(map.gridY));
    const fallback = buildDefaultEditorRegion(map, baseRegions.length + index, config);
    const label = map.label || map.name || regionPatch.label || existing?.label || fallback.label;
    const type = cleanRegionType(map.type || regionPatch.type || existing?.type || fallback.type);
    const nextRegion = existing
      ? { ...existing, ...regionPatch, ...gridPatch, id: map.id, label, type, palette: map.palette || regionPatch.palette || existing.palette || fallback.palette }
      : { ...fallback, ...regionPatch, ...gridPatch, id: map.id, label, type };
    regionById.set(map.id, nextRegion);
  });
  return Array.from(regionById.values());
}

function getMergedLandBridges(config = {}, editorData = {}) {
  const bridges = Array.isArray(config.landBridges) ? config.landBridges.map(bridge => ({ ...bridge })) : [];
  const editorBridges = Array.isArray(editorData?.landBridges) ? editorData.landBridges : [];
  return [...bridges, ...editorBridges.map(bridge => ({ ...bridge }))].filter(bridge => bridge?.from && bridge?.to);
}

const MAIN_CITY_CHANGE_CITY_LIMIT = 30;
const MAIN_CITY_CHANGE_SMALL_KINGDOM_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAIN_CITY_CHANGE_LARGE_KINGDOM_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_OFFLINE_PROGRESS_SECONDS = 7 * 24 * 60 * 60;
const WORLD_WIDTH = Math.max(1, Math.floor(Number(MAP_EDITOR_DATA?.globalSettings?.worldWidth || WORLD_CONFIG.width) || 10000));
const WORLD_HEIGHT = Math.max(1, Math.floor(Number(MAP_EDITOR_DATA?.globalSettings?.worldHeight || WORLD_CONFIG.height) || 7600));
const GRID_SIZE = Math.max(40, Math.floor(Number(WORLD_CONFIG.gridSize) || 50));
const GRID_COLS = Math.ceil(WORLD_WIDTH / GRID_SIZE);
const GRID_ROWS = Math.ceil(WORLD_HEIGHT / GRID_SIZE);
const DEFAULT_MARCH_PERCENT = 0.5;
const MIN_ZOOM = 0.40;
const MAX_ZOOM = 1;
const WHEEL_ZOOM_STEP = 1.12;
const MAP_TOUCH_PAN_THRESHOLD = 12;
const ZOOM_RENDER_SETTLE_MS = 260;
const PAN_RENDER_SETTLE_MS = 180;
const MAIN_CITY_RETURN_CAMERA_THROTTLE_MS = 180;
const LOW_ZOOM_PERFORMANCE_THRESHOLD = 0.72;
const LOW_ZOOM_PERFORMANCE_EXIT_THRESHOLD = 0.78;
const MARCH_ENDPOINT_INTERACTION_MIN_CLEARANCE = 72;
const MARCH_ENDPOINT_INTERACTION_SIZE_RATIO = 0.62;
const ISLAND_MAP_PADDING = 560;
const TROOP_PICKUP_ICON_SRC = "assets/troop-pickup.png?v=20260704-troop-pickup-red";
const GOLD_PICKUP_ICON_SRC = "assets/gold-pickup.png?v=20260704-gold-pickup-art";
const MAP_SWITCH_ARROW_ICON_SRC = "assets/map-switch-arrow.png?v=20260703-map-arrow-live";
const DEFAULT_PORTAL_VISUAL_SIZE = 92;
const MIN_PORTAL_VISUAL_SIZE = 60;
const EDGE_TRANSITION_ROUTE_INSET_MIN = 24;
const EDGE_TRANSITION_ROUTE_INSET_MAX = 58;
const EDGE_TRANSITION_ARROW_INSET_MIN = 96;
const EDGE_TRANSITION_ARROW_INSET_MAX = 180;
const DEFAULT_STRONGHOLD_VISUAL_SIZE = 154;
const MIN_STRONGHOLD_VISUAL_SIZE = 1;
const DEFAULT_CAMP_VISUAL_SIZE = 132;
const MIN_CAMP_VISUAL_SIZE = 1;
const GOLD_CAMP_REWARD_SCHEDULE = economyRewardSchedule("gold", [
  { minimumReward: 100000, productionHours: 3 },
  { minimumReward: 75000, productionHours: 2 },
  { minimumReward: 50000, productionHours: 1 },
  { minimumReward: 25000, productionHours: 0.5 },
]);
const WARBAND_CAMP_REWARD_SCHEDULE = economyRewardSchedule("troops", [
  { minimumReward: 50000, productionHours: 6 },
  { minimumReward: 37500, productionHours: 4 },
  { minimumReward: 25000, productionHours: 3 },
  { minimumReward: 12500, productionHours: 2 },
]);
const GOLD_CAMP_BASE_REWARD = GOLD_CAMP_REWARD_SCHEDULE[0]?.minimumReward || 100000;
const GOLD_CAMP_BASE_DEFENDERS = economyNumber("camps.gold.baseDefenders", 10000);
const GOLD_CAMP_DEFENSE_LEVEL = economyNumber("camps.gold.defenseLevel", 30);
const GOLD_CAMP_HOLD_SECONDS = economyNumber("camps.gold.holdMinutes", 10) * 60;
const WARBAND_CAMP_BASE_REWARD = WARBAND_CAMP_REWARD_SCHEDULE[0]?.minimumReward || 50000;
const WARBAND_CAMP_BASE_DEFENDERS = economyNumber("camps.troops.baseDefenders", 10000);
const WARBAND_CAMP_DEFENSE_LEVEL = economyNumber("camps.troops.defenseLevel", 30);
const WARBAND_CAMP_HOLD_SECONDS = economyNumber("camps.troops.holdMinutes", 15) * 60;
const DEED_CAMP_BASE_DEFENDERS = economyNumber("camps.deed.baseDefenders", 10000);
const DEED_CAMP_DEFENSE_LEVEL = economyNumber("camps.deed.defenseLevel", 30);
const DEED_CAMP_HOLD_SECONDS = economyNumber("camps.deed.holdMinutes", 60) * 60;
const RELIC_CAMP_BASE_DEFENDERS = economyNumber("camps.items.baseDefenders", 10000);
const RELIC_CAMP_DEFENSE_LEVEL = economyNumber("camps.items.defenseLevel", 30);
const RELIC_CAMP_HOLD_SECONDS = economyNumber("camps.items.holdMinutes", 30) * 60;
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
    type: "gold",
    kind: "goldCamp",
    name: "Gold Camp",
    rewardType: "gold",
    rewardLabel: "gold",
    baseReward: GOLD_CAMP_BASE_REWARD,
    baseDefenders: GOLD_CAMP_BASE_DEFENDERS,
    defenseLevel: GOLD_CAMP_DEFENSE_LEVEL,
    holdSeconds: GOLD_CAMP_HOLD_SECONDS,
    dailyRewards: GOLD_CAMP_REWARD_SCHEDULE.map(entry => entry.minimumReward),
    rewardHours: GOLD_CAMP_REWARD_SCHEDULE.map(entry => entry.productionHours),
  },
  troops: {
    type: "troops",
    kind: "warbandCamp",
    name: "Warband Camp",
    rewardType: "troops",
    rewardLabel: "troops",
    baseReward: WARBAND_CAMP_BASE_REWARD,
    baseDefenders: WARBAND_CAMP_BASE_DEFENDERS,
    defenseLevel: WARBAND_CAMP_DEFENSE_LEVEL,
    holdSeconds: WARBAND_CAMP_HOLD_SECONDS,
    dailyRewards: WARBAND_CAMP_REWARD_SCHEDULE.map(entry => entry.minimumReward),
    rewardHours: WARBAND_CAMP_REWARD_SCHEDULE.map(entry => entry.productionHours),
  },
  deed: {
    type: "deed",
    kind: "deedCamp",
    name: "Deed Camp",
    rewardType: "city",
    rewardLabel: "neutral city",
    baseReward: 1,
    baseDefenders: DEED_CAMP_BASE_DEFENDERS,
    defenseLevel: DEED_CAMP_DEFENSE_LEVEL,
    holdSeconds: DEED_CAMP_HOLD_SECONDS,
  },
  items: {
    type: "items",
    kind: "relicCamp",
    name: "Relic Camp",
    rewardType: "item",
    rewardLabel: "usable item",
    baseReward: 1,
    baseDefenders: RELIC_CAMP_BASE_DEFENDERS,
    defenseLevel: RELIC_CAMP_DEFENSE_LEVEL,
    holdSeconds: RELIC_CAMP_HOLD_SECONDS,
    maxDailyRewards: RELIC_CAMP_DAILY_REWARD_LIMIT,
    itemDrops: RELIC_CAMP_DROP_TABLE,
  },
};
const REWARD_CAMP_PROGRESS_CACHE_MS = 30 * 1000;
const GOLD_STRONGHOLD_ID = "west_gold_stronghold";
const GOLD_STRONGHOLD_NAME = "Aurum Keep";
const GOLD_STRONGHOLD_ART_SRC = "assets/gold-stronghold.png?v=20260704-gold-stronghold-updated";
const GOLD_STRONGHOLD_BONUS_PERCENT = 8;
const GOLD_STRONGHOLD_LEVEL = 50;
const GOLD_STRONGHOLD_START_TROOPS = 50000000;
const TRAINING_STRONGHOLD_ID = "north_training_stronghold";
const TRAINING_STRONGHOLD_NAME = "Greybanner Hold";
const TRAINING_STRONGHOLD_ART_SRC = "assets/training-stronghold.png?v=20260703-training-stronghold-art";
const TRAINING_STRONGHOLD_BONUS_PERCENT = 8;
const TRAINING_STRONGHOLD_LEVEL = 50;
const TRAINING_STRONGHOLD_START_TROOPS = 50000000;
const SPEED_STRONGHOLD_ID = "east_speed_stronghold";
const SPEED_STRONGHOLD_NAME = "Swiftgate";
const SPEED_STRONGHOLD_ART_SRC = "assets/speed-stronghold.png?v=20260704-speed-stronghold-updated";
const SPEED_STRONGHOLD_BONUS_PERCENT = 8;
const SPEED_STRONGHOLD_LEVEL = 50;
const SPEED_STRONGHOLD_START_TROOPS = 50000000;
const DEFENSE_STRONGHOLD_ID = "south_defense_stronghold";
const DEFENSE_STRONGHOLD_NAME = "Ironwatch";
const DEFENSE_STRONGHOLD_ART_SRC = "assets/defense-stronghold.png?v=20260704-defense-stronghold-update";
const DEFENSE_STRONGHOLD_BONUS_PERCENT = 8;
const DEFENSE_STRONGHOLD_LEVEL = 50;
const DEFENSE_STRONGHOLD_START_TROOPS = 50000000;
const CROWN_CITADEL_ID = "center_crown_citadel";
const CROWN_CITADEL_NAME = "Crown Citadel";
const CROWN_CITADEL_ART_SRC = "assets/crown-citadel.png?v=20260703-crown-citadel-art";
const CROWN_CITADEL_GOLD_BONUS_PERCENT = 10;
const CROWN_CITADEL_TROOP_BONUS_PERCENT = 10;
const CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT = 10;
const CROWN_CITADEL_DEFENSE_BONUS_PERCENT = 10;
const CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT = 10;
const CROWN_CITADEL_LEVEL = 100;
const CROWN_CITADEL_START_TROOPS = 50000000;
const CROWN_CITADEL_VISUAL_SIZE = 260;
const STRONGHOLD_IDS = new Set([
  GOLD_STRONGHOLD_ID,
  TRAINING_STRONGHOLD_ID,
  SPEED_STRONGHOLD_ID,
  DEFENSE_STRONGHOLD_ID,
  CROWN_CITADEL_ID,
]);
const WEST_ISLAND_ART_SRC = "assets/west-island.webp";
const WEST_ISLAND_THUMB_SRC = "assets/thumbnails/west-island-thumb.jpg";
const WEST_ISLAND_IMAGE_WIDTH = 1024;
const WEST_ISLAND_IMAGE_HEIGHT = 1536;
const WEST_CENTER_TELEPORT_IMAGE_POINT = { x: 802, y: 795 };
const WEST_GOLD_STRONGHOLD_IMAGE_POINT = { x: 520, y: 760 };
const WEST_ISLAND_LAND_POLYGON = [
  { x: 390, y: 40 }, { x: 520, y: 42 }, { x: 635, y: 78 }, { x: 720, y: 155 },
  { x: 785, y: 240 }, { x: 890, y: 305 }, { x: 940, y: 430 }, { x: 905, y: 575 },
  { x: 950, y: 725 }, { x: 900, y: 890 }, { x: 945, y: 1035 }, { x: 895, y: 1190 },
  { x: 790, y: 1325 }, { x: 690, y: 1460 }, { x: 560, y: 1515 }, { x: 420, y: 1480 },
  { x: 300, y: 1375 }, { x: 210, y: 1235 }, { x: 145, y: 1080 }, { x: 95, y: 910 },
  { x: 112, y: 735 }, { x: 90, y: 590 }, { x: 125, y: 430 }, { x: 190, y: 280 },
  { x: 285, y: 135 },
];
const WEST_ISLAND_CITY_POINTS = [
  { x: 520, y: 250 }, { x: 620, y: 250 }, { x: 720, y: 260 }, { x: 500, y: 350 },
  { x: 600, y: 350 }, { x: 690, y: 360 }, { x: 760, y: 390 }, { x: 470, y: 450 },
  { x: 570, y: 450 }, { x: 670, y: 450 }, { x: 770, y: 450 }, { x: 450, y: 560 },
  { x: 550, y: 560 }, { x: 650, y: 560 }, { x: 750, y: 560 }, { x: 430, y: 630 },
  { x: 580, y: 620 }, { x: 660, y: 670 }, { x: 760, y: 670 }, { x: 410, y: 890 },
  { x: 650, y: 800 }, { x: 700, y: 780 }, { x: 760, y: 790 }, { x: 470, y: 930 },
  { x: 580, y: 910 }, { x: 670, y: 900 }, { x: 770, y: 900 }, { x: 460, y: 1020 },
  { x: 560, y: 1020 }, { x: 660, y: 1020 }, { x: 760, y: 1020 }, { x: 470, y: 1140 },
  { x: 570, y: 1140 }, { x: 670, y: 1140 }, { x: 760, y: 1140 }, { x: 490, y: 1260 },
  { x: 580, y: 1250 }, { x: 690, y: 1260 }, { x: 760, y: 1280 }, { x: 510, y: 600 },
  { x: 650, y: 730 }, { x: 710, y: 720 }, { x: 530, y: 930 }, { x: 630, y: 860 },
  { x: 720, y: 860 }, { x: 390, y: 680 }, { x: 420, y: 950 }, { x: 400, y: 1000 },
  { x: 810, y: 620 }, { x: 810, y: 940 },
];
const NORTH_ISLAND_ART_SRC = "assets/north-island.webp";
const NORTH_ISLAND_THUMB_SRC = "assets/thumbnails/north-island-thumb.jpg";
const NORTH_ISLAND_IMAGE_WIDTH = 1448;
const NORTH_ISLAND_IMAGE_HEIGHT = 1086;
const NORTH_TRAINING_STRONGHOLD_IMAGE_POINT = { x: 724, y: 560 };
const NORTH_CENTER_TELEPORT_IMAGE_POINT = { x: 724, y: 915 };
const NORTH_ISLAND_RESERVED_CIRCLES = [
  { x: 724, y: 560, r: 135 },
  { x: NORTH_CENTER_TELEPORT_IMAGE_POINT.x, y: NORTH_CENTER_TELEPORT_IMAGE_POINT.y, r: 82 },
];
const NORTH_ISLAND_LAND_POLYGON = [
  { x: 255, y: 82 }, { x: 405, y: 42 }, { x: 575, y: 48 }, { x: 725, y: 40 },
  { x: 900, y: 58 }, { x: 1065, y: 92 }, { x: 1225, y: 145 }, { x: 1360, y: 260 },
  { x: 1415, y: 430 }, { x: 1375, y: 610 }, { x: 1310, y: 770 }, { x: 1195, y: 885 },
  { x: 1030, y: 970 }, { x: 835, y: 1025 }, { x: 620, y: 1015 }, { x: 420, y: 965 },
  { x: 250, y: 880 }, { x: 125, y: 720 }, { x: 55, y: 545 }, { x: 75, y: 365 },
  { x: 145, y: 220 },
];
const NORTH_ISLAND_CITY_POINTS = [
  { x: 400, y: 400 }, { x: 520, y: 400 }, { x: 580, y: 420 }, { x: 830, y: 450 },
  { x: 890, y: 400 }, { x: 1000, y: 400 }, { x: 330, y: 430 }, { x: 440, y: 440 },
  { x: 540, y: 460 }, { x: 630, y: 460 }, { x: 880, y: 470 }, { x: 930, y: 440 },
  { x: 1040, y: 440 }, { x: 1120, y: 430 }, { x: 330, y: 520 }, { x: 440, y: 520 },
  { x: 560, y: 520 }, { x: 870, y: 530 }, { x: 960, y: 520 }, { x: 1080, y: 520 },
  { x: 1140, y: 520 }, { x: 330, y: 640 }, { x: 440, y: 640 }, { x: 560, y: 640 },
  { x: 840, y: 640 }, { x: 960, y: 640 }, { x: 1080, y: 640 }, { x: 1130, y: 660 },
  { x: 340, y: 740 }, { x: 460, y: 740 }, { x: 580, y: 740 }, { x: 700, y: 740 },
  { x: 820, y: 740 }, { x: 940, y: 740 }, { x: 1060, y: 740 }, { x: 1130, y: 740 },
  { x: 420, y: 810 }, { x: 540, y: 810 }, { x: 660, y: 810 }, { x: 800, y: 810 },
  { x: 920, y: 810 }, { x: 1040, y: 810 }, { x: 480, y: 810 }, { x: 600, y: 810 },
  { x: 720, y: 810 }, { x: 860, y: 810 }, { x: 980, y: 810 }, { x: 1100, y: 810 },
  { x: 490, y: 480 }, { x: 760, y: 770 },
];
const EAST_ISLAND_ART_SRC = "assets/east-island.webp";
const EAST_ISLAND_THUMB_SRC = "assets/thumbnails/east-island-thumb.jpg";
const EAST_ISLAND_IMAGE_WIDTH = 1086;
const EAST_ISLAND_IMAGE_HEIGHT = 1448;
const EAST_SPEED_STRONGHOLD_IMAGE_POINT = { x: 540, y: 605 };
const EAST_CENTER_TELEPORT_IMAGE_POINT = { x: 305, y: 760 };
const EAST_ISLAND_RESERVED_CIRCLES = [
  { x: EAST_SPEED_STRONGHOLD_IMAGE_POINT.x, y: EAST_SPEED_STRONGHOLD_IMAGE_POINT.y, r: 125 },
  { x: EAST_CENTER_TELEPORT_IMAGE_POINT.x, y: EAST_CENTER_TELEPORT_IMAGE_POINT.y, r: 82 },
];
const EAST_ISLAND_LAND_POLYGON = [
  { x: 450, y: 42 }, { x: 620, y: 30 }, { x: 760, y: 90 }, { x: 870, y: 205 },
  { x: 970, y: 360 }, { x: 1030, y: 560 }, { x: 990, y: 760 }, { x: 955, y: 940 },
  { x: 880, y: 1135 }, { x: 760, y: 1300 }, { x: 620, y: 1410 }, { x: 460, y: 1420 },
  { x: 320, y: 1325 }, { x: 225, y: 1160 }, { x: 150, y: 960 }, { x: 105, y: 760 },
  { x: 85, y: 560 }, { x: 105, y: 380 }, { x: 170, y: 220 }, { x: 300, y: 100 },
];
const EAST_ISLAND_CITY_POINTS = [
  { x: 420, y: 220 }, { x: 530, y: 220 }, { x: 640, y: 220 }, { x: 350, y: 270 },
  { x: 450, y: 270 }, { x: 560, y: 280 }, { x: 670, y: 300 }, { x: 350, y: 380 },
  { x: 410, y: 380 }, { x: 520, y: 390 }, { x: 630, y: 400 }, { x: 700, y: 410 },
  { x: 350, y: 500 }, { x: 400, y: 480 }, { x: 490, y: 490 }, { x: 610, y: 500 },
  { x: 700, y: 520 }, { x: 350, y: 620 }, { x: 400, y: 600 }, { x: 680, y: 620 },
  { x: 730, y: 640 }, { x: 410, y: 740 }, { x: 440, y: 820 }, { x: 680, y: 740 },
  { x: 730, y: 720 }, { x: 350, y: 860 }, { x: 420, y: 870 }, { x: 540, y: 880 },
  { x: 650, y: 860 }, { x: 710, y: 860 }, { x: 350, y: 980 }, { x: 420, y: 980 },
  { x: 540, y: 980 }, { x: 650, y: 980 }, { x: 710, y: 980 }, { x: 350, y: 1090 },
  { x: 460, y: 1090 }, { x: 580, y: 1090 }, { x: 690, y: 1090 }, { x: 400, y: 1160 },
  { x: 520, y: 1160 }, { x: 640, y: 1160 }, { x: 700, y: 1160 }, { x: 460, y: 1160 },
  { x: 580, y: 1160 }, { x: 640, y: 1070 }, { x: 360, y: 690 }, { x: 420, y: 660 },
  { x: 660, y: 800 }, { x: 720, y: 790 },
];
const SOUTH_ISLAND_ART_SRC = "assets/south-island.webp";
const SOUTH_ISLAND_THUMB_SRC = "assets/thumbnails/south-island-thumb.jpg";
const SOUTH_ISLAND_IMAGE_WIDTH = 1446;
const SOUTH_ISLAND_IMAGE_HEIGHT = 1087;
const SOUTH_CENTER_TELEPORT_IMAGE_POINT = { x: 724, y: 205 };
const SOUTH_DEFENSE_STRONGHOLD_IMAGE_POINT = { x: 724, y: 550 };
const SOUTH_ISLAND_RESERVED_CIRCLES = [
  { x: SOUTH_CENTER_TELEPORT_IMAGE_POINT.x, y: SOUTH_CENTER_TELEPORT_IMAGE_POINT.y, r: 92 },
  { x: SOUTH_DEFENSE_STRONGHOLD_IMAGE_POINT.x, y: SOUTH_DEFENSE_STRONGHOLD_IMAGE_POINT.y, r: 145 },
  { x: 750, y: 850, r: 100 },
];
const SOUTH_ISLAND_LAND_POLYGON = [
  { x: 305, y: 72 }, { x: 460, y: 54 }, { x: 610, y: 66 }, { x: 755, y: 62 },
  { x: 920, y: 76 }, { x: 1085, y: 98 }, { x: 1240, y: 145 }, { x: 1375, y: 260 },
  { x: 1425, y: 430 }, { x: 1410, y: 620 }, { x: 1340, y: 790 }, { x: 1200, y: 925 },
  { x: 1025, y: 1010 }, { x: 820, y: 1050 }, { x: 640, y: 1038 }, { x: 450, y: 1000 },
  { x: 270, y: 910 }, { x: 135, y: 770 }, { x: 64, y: 605 }, { x: 66, y: 430 },
  { x: 120, y: 285 }, { x: 205, y: 160 },
];
const SOUTH_ISLAND_CITY_POINTS = [
  { x: 430, y: 230 }, { x: 540, y: 230 }, { x: 630, y: 245 }, { x: 850, y: 230 },
  { x: 960, y: 230 }, { x: 1040, y: 235 }, { x: 360, y: 315 }, { x: 480, y: 315 },
  { x: 600, y: 315 }, { x: 720, y: 315 }, { x: 840, y: 315 }, { x: 960, y: 315 },
  { x: 1040, y: 315 }, { x: 360, y: 400 }, { x: 480, y: 400 }, { x: 600, y: 400 },
  { x: 720, y: 400 }, { x: 840, y: 400 }, { x: 960, y: 400 }, { x: 1040, y: 400 },
  { x: 380, y: 480 }, { x: 500, y: 480 }, { x: 590, y: 480 }, { x: 860, y: 480 },
  { x: 970, y: 480 }, { x: 1040, y: 480 }, { x: 390, y: 560 }, { x: 500, y: 560 },
  { x: 550, y: 560 }, { x: 900, y: 560 }, { x: 990, y: 560 }, { x: 1060, y: 560 },
  { x: 430, y: 640 }, { x: 530, y: 640 }, { x: 570, y: 640 }, { x: 880, y: 640 },
  { x: 980, y: 640 }, { x: 1040, y: 640 }, { x: 430, y: 720 }, { x: 540, y: 720 },
  { x: 590, y: 770 }, { x: 840, y: 780 }, { x: 880, y: 730 }, { x: 980, y: 720 },
  { x: 1060, y: 720 }, { x: 420, y: 360 }, { x: 540, y: 360 }, { x: 900, y: 360 },
  { x: 1020, y: 360 }, { x: 640, y: 800 },
];
const CENTER_REGION_CITY_COUNT = 70;
const CENTER_ISLAND_ART_SRC = "assets/center-island.webp";
const CENTER_ISLAND_THUMB_SRC = "assets/thumbnails/center-island-thumb.jpg";
const CENTER_ISLAND_IMAGE_WIDTH = 1254;
const CENTER_ISLAND_IMAGE_HEIGHT = 1254;
const CENTER_ISLAND_TELEPORTS = [
  { id: "center-west", label: "West", targetRegionId: "west", point: { x: 210, y: 610 } },
  { id: "center-north", label: "North", targetRegionId: "north", point: { x: 625, y: 156 } },
  { id: "center-east", label: "East", targetRegionId: "east", point: { x: 1028, y: 610 } },
  { id: "center-south", label: "South", targetRegionId: "south", point: { x: 625, y: 1018 } },
];
const CENTER_CROWN_CITADEL_IMAGE_POINT = { x: 625, y: 610 };
const CENTER_ISLAND_RESERVED_CIRCLES = [
  { x: CENTER_CROWN_CITADEL_IMAGE_POINT.x, y: CENTER_CROWN_CITADEL_IMAGE_POINT.y, r: 140 },
  ...CENTER_ISLAND_TELEPORTS.map(teleport => ({ x: teleport.point.x, y: teleport.point.y, r: 74 })),
];
const CENTER_ISLAND_LAND_POLYGON = [
  { x: 184, y: 86 }, { x: 320, y: 50 }, { x: 480, y: 42 }, { x: 625, y: 36 },
  { x: 782, y: 52 }, { x: 934, y: 86 }, { x: 1068, y: 168 }, { x: 1162, y: 318 },
  { x: 1214, y: 500 }, { x: 1197, y: 690 }, { x: 1168, y: 860 }, { x: 1112, y: 1030 },
  { x: 990, y: 1148 }, { x: 830, y: 1214 }, { x: 650, y: 1232 }, { x: 465, y: 1212 },
  { x: 292, y: 1140 }, { x: 165, y: 1022 }, { x: 88, y: 850 }, { x: 45, y: 650 },
  { x: 62, y: 470 }, { x: 88, y: 292 }, { x: 122, y: 168 },
];
const CENTER_ISLAND_CITY_POINTS = [
  { x: 400, y: 290 }, { x: 490, y: 290 }, { x: 720, y: 290 }, { x: 880, y: 290 },
  { x: 320, y: 300 }, { x: 440, y: 320 }, { x: 540, y: 300 }, { x: 680, y: 320 },
  { x: 820, y: 300 }, { x: 930, y: 300 }, { x: 320, y: 400 }, { x: 390, y: 390 },
  { x: 500, y: 380 }, { x: 600, y: 430 }, { x: 740, y: 380 }, { x: 850, y: 380 },
  { x: 930, y: 350 }, { x: 320, y: 460 }, { x: 390, y: 460 }, { x: 500, y: 460 },
  { x: 760, y: 460 }, { x: 870, y: 460 }, { x: 930, y: 440 }, { x: 320, y: 540 },
  { x: 460, y: 540 }, { x: 510, y: 510 }, { x: 750, y: 520 }, { x: 840, y: 540 },
  { x: 930, y: 540 }, { x: 320, y: 690 }, { x: 430, y: 690 }, { x: 510, y: 710 },
  { x: 760, y: 680 }, { x: 840, y: 690 }, { x: 930, y: 690 }, { x: 320, y: 770 },
  { x: 390, y: 780 }, { x: 500, y: 780 }, { x: 610, y: 780 }, { x: 740, y: 780 },
  { x: 850, y: 780 }, { x: 930, y: 770 }, { x: 330, y: 870 }, { x: 430, y: 860 },
  { x: 540, y: 860 }, { x: 710, y: 860 }, { x: 830, y: 850 }, { x: 920, y: 870 },
  { x: 370, y: 910 }, { x: 500, y: 940 }, { x: 750, y: 930 }, { x: 860, y: 940 },
  { x: 470, y: 900 }, { x: 560, y: 950 }, { x: 690, y: 960 }, { x: 810, y: 950 },
  { x: 350, y: 620 }, { x: 470, y: 620 }, { x: 780, y: 620 }, { x: 900, y: 620 },
  { x: 310, y: 350 }, { x: 900, y: 390 }, { x: 270, y: 890 }, { x: 930, y: 910 },
  { x: 590, y: 300 }, { x: 640, y: 290 }, { x: 590, y: 840 }, { x: 660, y: 840 },
  { x: 550, y: 350 }, { x: 760, y: 320 },
];
const BASE_BITMAP_ISLAND_IDS = ["west", "north", "east", "south", "center"];
const BITMAP_ISLAND_IDS = getBitmapIslandIds();
const IMAGE_TERRAIN_BLOCKERS = normalizeImageTerrainShapes({
  west: [
    { x: 282, y: 350, rx: 78, ry: 235, rot: -0.2 },
    { x: 300, y: 770, rx: 82, ry: 300, rot: -0.08 },
    { x: 286, y: 1120, rx: 76, ry: 245, rot: -0.14 },
  ],
  north: [
    { x: 480, y: 135, rx: 220, ry: 82, rot: -0.04 },
    { x: 780, y: 120, rx: 185, ry: 82, rot: 0.08 },
    { x: 1065, y: 185, rx: 160, ry: 88, rot: 0.18 },
  ],
  east: [
    { x: 890, y: 305, rx: 72, ry: 210, rot: 0.08 },
    { x: 915, y: 650, rx: 70, ry: 270, rot: -0.03 },
    { x: 820, y: 1080, rx: 72, ry: 195, rot: -0.28 },
  ],
  south: [
    { x: 245, y: 485, rx: 90, ry: 125, rot: -0.3 },
    { x: 1165, y: 465, rx: 90, ry: 125, rot: 0.24 },
  ],
  center: [
    { x: 205, y: 250, rx: 120, ry: 100, rot: -0.18 },
    { x: 825, y: 185, rx: 140, ry: 95, rot: 0.12 },
    { x: 985, y: 1000, rx: 105, ry: 95, rot: -0.08 },
    { x: 300, y: 990, rx: 110, ry: 90, rot: 0.08 },
  ],
});
const IMAGE_NO_CITY_TERRAIN = normalizeImageTerrainShapes({
  west: [
    ...IMAGE_TERRAIN_BLOCKERS.west,
    { x: 165, y: 755, rx: 72, ry: 170, rot: -0.22 },
  ],
  north: [
    ...IMAGE_TERRAIN_BLOCKERS.north,
    { x: 724, y: 560, rx: 150, ry: 125, rot: 0 },
    { x: 724, y: 915, rx: 92, ry: 82, rot: 0 },
  ],
  east: [
    ...IMAGE_TERRAIN_BLOCKERS.east,
    { x: 305, y: 760, rx: 92, ry: 82, rot: 0 },
    { x: 540, y: 605, rx: 135, ry: 120, rot: 0 },
  ],
  south: [
    ...IMAGE_TERRAIN_BLOCKERS.south,
    { x: 724, y: 205, rx: 100, ry: 90, rot: 0 },
    { x: 724, y: 550, rx: 155, ry: 135, rot: 0 },
    { x: 750, y: 850, rx: 115, ry: 100, rot: 0 },
  ],
  center: [
    ...IMAGE_TERRAIN_BLOCKERS.center,
    { x: 625, y: 610, rx: 150, ry: 145, rot: 0 },
    { x: 210, y: 610, rx: 82, ry: 74, rot: 0 },
    { x: 625, y: 156, rx: 82, ry: 74, rot: 0 },
    { x: 1028, y: 610, rx: 82, ry: 74, rot: 0 },
    { x: 625, y: 1018, rx: 82, ry: 74, rot: 0 },
  ],
});
const SERVER_CITY_UPGRADE_LEVEL_CHUNK = 25;
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
const DAILY_NEUTRAL_CAPTURE_LIMIT = 30;
const HARVEST_BONUS_DAILY_LIMIT = economyNumber("pickups.dailyTotalCap", 12);
const HARVEST_BONUS_DAILY_GOLD_LIMIT = economyNumber("pickups.dailyGoldCap", 6);
const HARVEST_BONUS_DAILY_TROOP_LIMIT = economyNumber("pickups.dailyTroopCap", 6);
const HARVEST_BONUS_TYPES = ["gold", "troops"];
const HARVEST_BONUS_SPAWN_INTERVAL_SECONDS = economyNumber("pickups.spawnIntervalMinutes", 3) * 60;
const HARVEST_BONUS_INITIAL_SPAWN_SECONDS = HARVEST_BONUS_SPAWN_INTERVAL_SECONDS;
const HARVEST_BONUS_MAX_ACTIVE_PER_PLAYER = economyNumber("pickups.maxActivePerPlayer", 1);
const HARVEST_BONUS_EXPIRE_SECONDS = economyNumber("pickups.expireMinutes", 20) * 60;
const HARVEST_BONUS_GOLD_SECONDS = economyNumber("pickups.goldAwardProductionMinutes", 10) * 60;
const HARVEST_BONUS_MIN_GOLD = economyNumber("pickups.minimumGold", 50);
const HARVEST_BONUS_TROOP_SECONDS = economyNumber("pickups.troopAwardProductionMinutes", 10) * 60;
const HARVEST_BONUS_MIN_TROOPS = economyNumber("pickups.minimumTroops", 10);
const HARVEST_BONUS_MAX_TROOPS = Number.MAX_SAFE_INTEGER;
const HARVEST_BONUS_CITY_CLEARANCE = 132;
const HARVEST_BONUS_TRANSITION_CLEARANCE = 148;
const HARVEST_BONUS_PICKUP_CLEARANCE = 116;
const HARVEST_BONUS_TERRAIN_PADDING = 22;
const HARVEST_BONUS_LAND_CLEARANCE = 64;
const HARVEST_BONUS_CITY_SPAWN_MIN_DISTANCE = 170;
const HARVEST_BONUS_CITY_SPAWN_MAX_DISTANCE = 420;
const HARVEST_BONUS_STRONGHOLD_CLEARANCE_EXTRA = 72;
const HARVEST_BONUS_CAMP_CLEARANCE_EXTRA = 64;
const HARVEST_BONUS_SERVER_RETRY_SECONDS = 5;
const NEUTRAL_CITY_COUNT_LIMIT = 30;
const PLAYER_START_TROOPS = 200;
const PLAYER_SLOT_START_TROOPS = 200;
const NEUTRAL_START_TROOPS = 10;
const TEST_STARTING_GOLD = 100;
const ISLAND_CITY_COUNT = WORLD_REGIONS.reduce((total, region) => total + (region.id === "center" ? CENTER_REGION_CITY_COUNT : REGION_CITY_COUNT), 0);
const SCOUT_REPORT_SECONDS = 120;
const SCOUT_NEARBY_COST = economyNumber("playerCosts.nearbyScoutGold", 75000);
const SCOUT_NEARBY_RADIUS = 420;
const REGROUP_COST = economyNumber("playerCosts.regroupGold", 150000);
const REGROUP_RADIUS = 680;
const BASE_TROOP_ATTACK_POWER = 2;
const ARMY_TRAVEL_SECONDS_PER_MAP_UNIT = 0.13;
const ARMY_TRAVEL_MIN_SECONDS = 30;
const ARMY_TRAVEL_SCOUT_MIN_SECONDS = 10;
const ARMY_TRAVEL_MAX_SECONDS = 1800;
const ARMY_TRAVEL_KIND_MULTIPLIERS = { scout: 0.35, transfer: 0.95, attack: 1 };
const ARMY_TRAVEL_TROOP_BAND_LIMITS = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000];
const ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS = [1, 1.18, 1.38, 1.62, 1.9, 2.24, 2.62, 3.06, 3.5];
const ROUTE_CITY_CLEARANCE = 46;
const ROUTE_STRONGHOLD_CLEARANCE = 88;
const CHARACTER_START_LEVEL = 1;
const CHARACTER_START_XP = 0;
const HERO_XP_SOFT_CAP_LEVEL = 50;
const HERO_XP_HARD_CAP_LEVEL = 100;
const HERO_XP_POST_50_SPAN = 50;
const HERO_XP_POST_100_SPAN = 25;
const HERO_XP_POST_50_MULTIPLIER = 2.5;
const HERO_XP_POST_100_MULTIPLIER = 4;
const HERO_XP_POST_50_EXPONENT = 1.5;
const HERO_XP_POST_100_EXPONENT = 1.6;
const LEVEL_UP_GOLD_EARLY_UPGRADE_SHARE = economyNumber("levelRewards.goldEarlyUpgradeShare", 0.5);
const LEVEL_UP_GOLD_MID_END_UPGRADE_SHARE = economyNumber("levelRewards.goldMidUpgradeShare", 0.3);
const LEVEL_UP_GOLD_END_UPGRADE_SHARE = economyNumber("levelRewards.goldEndgameUpgradeShare", 0.2);
const LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS = economyNumber("levelRewards.goldEarlyProductionHours", 4);
const LEVEL_UP_GOLD_MID_END_PRODUCTION_HOURS = economyNumber("levelRewards.goldMidProductionHours", 12);
const LEVEL_UP_GOLD_END_PRODUCTION_HOURS = economyNumber("levelRewards.goldEndgameProductionHours", 24);
const LEVEL_UP_TROOP_REWARD_EARLY_BASE_HOURS = economyNumber("levelRewards.troopEarlyBaseHours", 4);
const LEVEL_UP_TROOP_REWARD_EARLY_HOURS_PER_LEVEL = economyNumber("levelRewards.troopEarlyHoursPerLevel", 0.4);
const LEVEL_UP_TROOP_REWARD_MID_BASE_HOURS = economyNumber("levelRewards.troopMidBaseHours", 24);
const LEVEL_UP_TROOP_REWARD_MID_HOURS_PER_LEVEL = economyNumber("levelRewards.troopMidHoursPerLevel", 0.24);
const LEVEL_UP_TROOP_REWARD_END_BASE_HOURS = economyNumber("levelRewards.troopEndgameBaseHours", 36);
const LEVEL_UP_TROOP_REWARD_END_HOURS_PER_LEVEL = economyNumber("levelRewards.troopEndgameHoursPerLevel", 0.12);
const LEVEL_UP_TROOP_REWARD_MAX_HOURS = economyNumber("levelRewards.troopMaximumHours", 48);
const CITY_UPGRADE_XP_BASE = 18;
const CITY_UPGRADE_XP_PER_LEVEL = 4;
const CAPTURE_XP_BASE = 120;
const CAPTURE_XP_PER_CITY_LEVEL = 45;
const CAPTURE_XP_PER_DEFENDER = 1.5;
const ENEMY_CAPTURE_XP_BONUS = 300;
const CAPTURE_XP_COOLDOWN_SECONDS = 3600;
const RECENT_CAPTURE_XP_MULTIPLIER = 0.25;
const DEFENSE_HELD_XP_BASE = 80;
const DEFENSE_HELD_XP_PER_ATTACKER = 0.45;
const FAILED_BATTLE_XP_RATE = 1 / 3;
const BATTLE_XP_TROOP_CREDIT_CITY_WALL_MULTIPLIER = 1;
const BATTLE_XP_TROOP_CREDIT_VP_MULTIPLIER = 2;
const BATTLE_XP_TROOP_CREDIT_LEVEL_CAP_MULTIPLIER = 3;
const BATTLE_XP_EARLY_LEVEL_CAP_RATE = 1;
const BATTLE_XP_MID_START_LEVEL_CAP_RATE = 0.8;
const BATTLE_XP_MID_END_LEVEL_CAP_RATE = 0.5;
const BATTLE_XP_END_START_LEVEL_CAP_RATE = 0.3;
const BATTLE_XP_END_FLOOR_LEVEL_CAP_RATE = 0.15;
const BATTLE_XP_END_CAP_RAMP_LEVELS = 50;
const DEMO_ATTACK_MIN_POWER_RATIO = 3;
const DEMO_ATTACK_DEFENDER_XP_MULTIPLIER = 2;
const DEMO_ATTACK_TIERS = [
  { minRatio: 10, label: "Severe Demo Attack", troopCapPercent: 30, attackPowerPercent: 30, travelMultiplier: 2.5 },
  { minRatio: 5, label: "Heavy Demo Attack", troopCapPercent: 40, attackPowerPercent: 40, travelMultiplier: 2 },
  { minRatio: DEMO_ATTACK_MIN_POWER_RATIO, label: "Demo Attack", troopCapPercent: 50, attackPowerPercent: 50, travelMultiplier: 1.6 },
];
const KILL_GOLD_BASE = 5;
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
  goldProductionPerMillionLordsVp: MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP,
};
const KING_POWER_ARMY_TROOP_VALUE = 2;
const KING_POWER_REPLACEMENT_HOURS = 12;
const KING_POWER_DEFENSIVE_ADVANTAGE_WEIGHT = 0.25;
const KING_POWER_AUTHORITY_VERSION = 8;
const KING_POWER_COMPATIBILITY_VERSION = 7;
const SKILL_RESET_COST = economyNumber("playerCosts.skillResetGold", 750_000);

const SKILL_CONFIG = {
  swordmastery: { label: "Swordmastery", percentPerLevel: economyNumber("skills.swordmastery.percentPerLevel", 2), maxPercent: economyNumber("skills.swordmastery.maxPercent", 60), description: "Outgoing attack power." },
  stoneworks: { label: "Stoneworks", percentPerLevel: economyNumber("skills.stoneworks.percentPerLevel", 3), maxPercent: economyNumber("skills.stoneworks.maxPercent", 75), description: "City wall strength." },
  taxStewardship: { label: "Tax Stewardship", percentPerLevel: economyNumber("skills.taxStewardship.percentPerLevel", 3), maxPercent: economyNumber("skills.taxStewardship.maxPercent", 75), description: "Normal city gold production." },
  royalGranaries: { label: "Royal Granaries", percentPerLevel: economyNumber("skills.royalGranaries.percentPerLevel", 3), maxPercent: economyNumber("skills.royalGranaries.maxPercent", 75), description: "Normal city troop production." },
  guildCharters: { label: "Guild Charters", percentPerLevel: economyNumber("skills.guildCharters.percentPerLevel", 2), maxPercent: economyNumber("skills.guildCharters.maxPercent", 50), description: "Upgrade cost reduction." },
  marchOrders: { label: "March Orders", percentPerLevel: economyNumber("skills.marchOrders.percentPerLevel", 3), maxPercent: economyNumber("skills.marchOrders.maxPercent", 60), description: "Travel speed for attacks, transfers, scouts, and regroups." },
  fieldMedics: { label: "Field Medics", percentPerLevel: economyNumber("skills.fieldMedics.percentPerLevel", 2), maxPercent: economyNumber("skills.fieldMedics.maxPercent", 50), description: "Returns a percent of battle losses to your main city." },
};

const SKILL_ORDER = ["swordmastery", "stoneworks", "taxStewardship", "royalGranaries", "guildCharters", "marchOrders", "fieldMedics"];

const FLAG_COLORS = ["#1f5f91", "#b23a35", "#2f7a4a", "#6d4aa2", "#d3a62e", "#202a38", "#d9e2e8", "#8d5a2f"];
const FLAG_PATTERNS = [
  { key: "split", label: "Split" },
  { key: "diagonal", label: "Diagonal" },
  { key: "band", label: "Band" },
  { key: "cross", label: "Cross" },
  { key: "saltire", label: "Saltire" },
  { key: "chevron", label: "Chevron" },
  { key: "quartered", label: "Quartered" },
  { key: "pale", label: "Pale" },
  { key: "chief", label: "Chief" },
  { key: "bend", label: "Bend" },
];
const FLAG_SYMBOLS = [
  { key: "crown", label: "Crown", glyph: "\u265B" },
  { key: "castle", label: "Castle", glyph: "\u265C" },
  { key: "star", label: "Star", glyph: "\u2726" },
  { key: "swords", label: "Swords", glyph: "\u2694" },
  { key: "fleur", label: "Fleur-de-lis", glyph: "\u269C" },
  { key: "cross", label: "Templar Cross", glyph: "\u2720" },
  { key: "sun", label: "Sun", glyph: "\u2600" },
  { key: "moon", label: "Moon", glyph: "\u263E" },
  { key: "knight", label: "Knight", glyph: "\u265E" },
  { key: "tower", label: "Tower", glyph: "\u2656" },
  { key: "diamond", label: "Gem", glyph: "\u25C6" },
  { key: "spire", label: "Spire", glyph: "\u25B2" },
];



function getCastleStage(level) {
  if (level >= 100) return 5;
  if (level >= 75) return 4;
  if (level >= 50) return 3;
  if (level >= 25) return 2;
  return 1;
}

function getCastleAsset(stage) {
  const version = "v=20260704-firebase-castles";
  const assets = {
    1: `assets/castles/shack.png?${version}`,
    2: `assets/castles/fort.png?${version}`,
    3: `assets/castles/keep.png?${version}`,
    4: `assets/castles/castle.png?${version}`,
    5: `assets/castles/city.png?${version}`,
  };
  return assets[stage] || assets[1];
}

function isStronghold(city) {
  return Boolean(city && (city.kind === "stronghold" || STRONGHOLD_IDS.has(city.id)));
}

function readVisualSize(value, fallback) {
  const parsed = Math.floor(Number(value));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const fallbackSize = Math.floor(Number(fallback));
  return Number.isFinite(fallbackSize) && fallbackSize > 0 ? fallbackSize : 1;
}

function getPortalVisualSize(portal) {
  return Math.max(MIN_PORTAL_VISUAL_SIZE, Math.floor(Number(portal?.size) || DEFAULT_PORTAL_VISUAL_SIZE));
}

function getStrongholdVisualSize(city) {
  return Math.max(MIN_STRONGHOLD_VISUAL_SIZE, readVisualSize(city?.size, DEFAULT_STRONGHOLD_VISUAL_SIZE));
}

function isGoldStronghold(city) {
  const type = String(city?.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "gold" || type === "gold_stronghold" || city.id === GOLD_STRONGHOLD_ID);
}

function isTrainingStronghold(city) {
  const type = String(city?.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "training" || type === "troop" || type === "troop_stronghold" || city.id === TRAINING_STRONGHOLD_ID);
}

function isSpeedStronghold(city) {
  const type = String(city?.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "speed" || type === "march_speed" || type === "march_speed_stronghold" || city.id === SPEED_STRONGHOLD_ID);
}

function isDefenseStronghold(city) {
  const type = String(city?.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "defense" || type === "defense_stronghold" || city.id === DEFENSE_STRONGHOLD_ID);
}

function isCrownCitadel(city) {
  const type = String(city?.strongholdType || "").toLowerCase();
  return isStronghold(city) && (type === "crown" || type === "crown_citadel" || city.id === CROWN_CITADEL_ID);
}

function getCrownCitadelControlSnapshot() {
  if (onlineCrownCitadelLoaded) return onlineCrownCitadelSnapshot;
  return state?.cities?.find(city => city.id === CROWN_CITADEL_ID) || null;
}

function getCrownCitadelHolderUid() {
  const citadel = getCrownCitadelControlSnapshot();
  const ownerKind = String(citadel?.ownerKind || citadel?.owner || "neutral");
  return ownerKind === "player" ? String(citadel?.ownerUid || "") : "";
}

function getCrownCitadelHeldSinceMs() {
  const citadel = getCrownCitadelControlSnapshot();
  return Math.max(0, normalizeTimestampMs(
    citadel?.lastCapturedAtMs ?? citadel?.lastCapturedAt
  ));
}

function cityOwnerHoldsCrownCitadel(city) {
  if (!city || isStronghold(city)) return false;
  const holderUid = getCrownCitadelHolderUid();
  if (!holderUid) return false;
  const ownerUid = String(city.ownerUid || (city.owner === "player" ? getCurrentOnlineUid() : ""));
  return Boolean(ownerUid && ownerUid === holderUid);
}

function getStrongholdDisplayName(city) {
  if (isCrownCitadel(city)) return CROWN_CITADEL_NAME;
  if (isDefenseStronghold(city)) return DEFENSE_STRONGHOLD_NAME;
  if (isSpeedStronghold(city)) return SPEED_STRONGHOLD_NAME;
  if (isTrainingStronghold(city)) return TRAINING_STRONGHOLD_NAME;
  if (isGoldStronghold(city)) return GOLD_STRONGHOLD_NAME;
  return String(city?.name || city?.id || "Stronghold");
}

function getStrongholdArtSrc(city) {
  if (city?.artSrc) return city.artSrc;
  if (isCrownCitadel(city)) return CROWN_CITADEL_ART_SRC;
  if (isDefenseStronghold(city)) return DEFENSE_STRONGHOLD_ART_SRC;
  if (isSpeedStronghold(city)) return SPEED_STRONGHOLD_ART_SRC;
  if (isTrainingStronghold(city)) return TRAINING_STRONGHOLD_ART_SRC;
  return isGoldStronghold(city) ? GOLD_STRONGHOLD_ART_SRC : "";
}

function getStrongholdBonusPercent(city) {
  if (isCrownCitadel(city)) return CROWN_CITADEL_GOLD_BONUS_PERCENT;
  if (isDefenseStronghold(city)) return DEFENSE_STRONGHOLD_BONUS_PERCENT;
  if (isSpeedStronghold(city)) return SPEED_STRONGHOLD_BONUS_PERCENT;
  if (isTrainingStronghold(city)) return TRAINING_STRONGHOLD_BONUS_PERCENT;
  if (isGoldStronghold(city)) return GOLD_STRONGHOLD_BONUS_PERCENT;
  return Number.isFinite(Number(city?.bonusPercent)) ? Math.max(0, Math.floor(Number(city.bonusPercent) || 0)) : 0;
}

function getStrongholdDefenseLevel(city) {
  if (Number.isFinite(Number(city?.level))) return Math.max(1, Math.floor(Number(city.level) || 1));
  if (isCrownCitadel(city)) return CROWN_CITADEL_LEVEL;
  if (isDefenseStronghold(city)) return DEFENSE_STRONGHOLD_LEVEL;
  if (isSpeedStronghold(city)) return SPEED_STRONGHOLD_LEVEL;
  if (isTrainingStronghold(city)) return TRAINING_STRONGHOLD_LEVEL;
  return isStronghold(city) ? GOLD_STRONGHOLD_LEVEL : 0;
}

function getStrongholdStartTroops(city) {
  if (Number.isFinite(Number(city?.startTroops))) return Math.max(0, Math.floor(Number(city.startTroops) || 0));
  if (isCrownCitadel(city)) return CROWN_CITADEL_START_TROOPS;
  if (isDefenseStronghold(city)) return DEFENSE_STRONGHOLD_START_TROOPS;
  if (isSpeedStronghold(city)) return SPEED_STRONGHOLD_START_TROOPS;
  if (isTrainingStronghold(city)) return TRAINING_STRONGHOLD_START_TROOPS;
  return isStronghold(city) ? GOLD_STRONGHOLD_START_TROOPS : 0;
}

function getStrongholdProductionLabel(city) {
  if (city?.bonus === "crownDominion" || isCrownCitadel(city)) return "Crown Land bonuses";
  if (city?.bonus === "cityDefense") return "city defense";
  if (city?.bonus === "marchSpeed") return "march speed";
  if (city?.bonus === "troopProduction") return "troop production";
  if (city?.bonus === "goldProduction") return "gold production";
  if (isDefenseStronghold(city)) return "city defense";
  if (isSpeedStronghold(city)) return "march speed";
  return isTrainingStronghold(city) ? "troop production" : "gold production";
}

function getCrownCitadelBonusLabel() {
  return `+${CROWN_CITADEL_GOLD_BONUS_PERCENT}% gold, +${CROWN_CITADEL_TROOP_BONUS_PERCENT}% troops, +${CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT}% speed, +${CROWN_CITADEL_DEFENSE_BONUS_PERCENT}% defense, -${CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT}% upgrade cost`;
}

function getStrongholdBonusLabel(city) {
  if (isCrownCitadel(city)) return getCrownCitadelBonusLabel();
  return `+${formatNumber(getStrongholdBonusPercent(city))}% ${getStrongholdProductionLabel(city)}`;
}

function getStrongholdShortBonusLabel(city) {
  if (isCrownCitadel(city)) return "Crown bonuses";
  if (isDefenseStronghold(city)) return `+${formatNumber(getStrongholdBonusPercent(city))}% defense`;
  if (isSpeedStronghold(city)) return `+${formatNumber(getStrongholdBonusPercent(city))}% speed`;
  return isTrainingStronghold(city)
    ? `+${formatNumber(getStrongholdBonusPercent(city))}% troops`
    : `+${formatNumber(getStrongholdBonusPercent(city))}% gold`;
}

function getBaseCityInitialLevel(base) {
  return isStronghold(base) ? getStrongholdDefenseLevel(base) : 1;
}

function getBaseCityInitialTroops(base) {
  return isStronghold(base) ? getStrongholdStartTroops(base) : NEUTRAL_START_TROOPS;
}

function createNeutralCityFromBase(base) {
  const troops = getBaseCityInitialTroops(base);
  return {
    ...base,
    name: getCanonicalCityName(base),
    owner: "neutral",
    ownerKind: "neutral",
    ownerUid: null,
    ownerName: "",
    ownerFlag: null,
    ownerKingPower: 0,
    level: getBaseCityInitialLevel(base),
    troops,
    troopFloat: troops,
    defense: 1,
    investedGold: 0,
    lastCapturedAt: null,
    isMainCity: false,
    relinquishedAtMs: 0,
    relocatedAtMs: 0,
  };
}

function getCityTroopFallback(base, ownership = null) {
  const stronghold = isStronghold(base);
  const ownedByPlayer = ownership?.ownerKind === "player" || ownership?.owner === "player" || Boolean(ownership?.ownerUid);
  if (stronghold && ownedByPlayer) return 0;
  return stronghold ? getStrongholdStartTroops(base) : NEUTRAL_START_TROOPS;
}

function readCityTroops(primary, fallback = 0) {
  return Math.max(0, Math.floor(Number(primary ?? fallback) || 0));
}

function readCityTroopFloat(primary, fallback = 0) {
  return Math.max(0, Number(primary ?? fallback) || 0);
}

function isGivenUpNeutralCity(city = {}) {
  if (!city || isStronghold(city)) return false;
  const ownerUid = String(city.ownerUid || "").trim();
  const ownerKind = city.ownerKind || city.owner || "neutral";
  const isNeutral = !ownerUid && (ownerKind === "neutral" || city.owner === "neutral");
  return Boolean(isNeutral && (timestampToMs(city.relinquishedAtMs) > 0 || timestampToMs(city.relocatedAtMs) > 0));
}

function applyBaseCityMetadata(city, base) {
  if (!city || !base) return;
  city.x = base.x;
  city.y = base.y;
  city.startPool = base.startPool;
  city.regionId = base.regionId;
  city.kind = base.kind || "";
  city.strongholdType = base.strongholdType || "";
  city.bonus = base.bonus || "";
  city.bonusPercent = Number(base.bonusPercent) || 0;
  if (isStronghold(base)) {
    city.size = getStrongholdVisualSize(base);
    city.name = getStrongholdDisplayName({ ...base, ...city });
    city.level = getStrongholdDefenseLevel(base);
    city.investedGold = 0;
  } else {
    city.name = getCanonicalCityName(base, city);
    if ("size" in city) delete city.size;
  }
}

function appendMissingBaseCities(cities, bases) {
  if (!Array.isArray(cities) || !Array.isArray(bases)) return false;
  const ids = new Set(cities.map(city => city.id));
  let changed = false;
  for (const base of bases) {
    if (ids.has(base.id)) continue;
    cities.push(createNeutralCityFromBase(base));
    ids.add(base.id);
    changed = true;
  }
  return changed;
}

function canMigrateCitySetToBases(cities, bases) {
  if (!Array.isArray(cities) || !Array.isArray(bases) || !cities.length) return false;
  const baseIds = new Set(bases.map(base => base.id));
  return cities.every(city => baseIds.has(city.id));
}

const OWNER = {
  player: { label: "You", css: "player", flag: "\u25C6" },
  player2: { label: "Player 2", css: "player2", flag: "\u2161" },
  player3: { label: "Player 3", css: "player3", flag: "\u2162" },
  enemy: { label: "Enemy", css: "enemy", flag: "\u265C" },
  neutral: { label: "Neutral", css: "neutral", flag: "\u2022" },
};

const BASE_CITIES = [
  {
    "id": "p1_1",
    "name": "Westhaven",
    "x": 416,
    "y": 1357,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p1"
  },
  {
    "id": "p1_2",
    "name": "Lowford",
    "x": 514,
    "y": 1354,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p1"
  },
  {
    "id": "p1_3",
    "name": "Queensrest",
    "x": 806,
    "y": 1130,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p1"
  },
  {
    "id": "p1_4",
    "name": "Ashwick",
    "x": 228,
    "y": 1028,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p1"
  },
  {
    "id": "p1_5",
    "name": "Southmere",
    "x": 950,
    "y": 1159,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p1"
  },
  {
    "id": "p2_1",
    "name": "Northwatch",
    "x": 430,
    "y": 330,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p2"
  },
  {
    "id": "p2_2",
    "name": "Frostford",
    "x": 645,
    "y": 200,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p2"
  },
  {
    "id": "p2_3",
    "name": "Ravenwick",
    "x": 947,
    "y": 318,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p2"
  },
  {
    "id": "p2_4",
    "name": "Highpass",
    "x": 580,
    "y": 460,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p2"
  },
  {
    "id": "p2_5",
    "name": "Stonebay",
    "x": 1040,
    "y": 300,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p2"
  },
  {
    "id": "p3_1",
    "name": "Dawngate",
    "x": 2385,
    "y": 409,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p3"
  },
  {
    "id": "p3_2",
    "name": "Brightmere",
    "x": 2470,
    "y": 410,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p3"
  },
  {
    "id": "p3_3",
    "name": "Goldhollow",
    "x": 2185,
    "y": 510,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p3"
  },
  {
    "id": "p3_4",
    "name": "Whitehill",
    "x": 2461,
    "y": 731,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p3"
  },
  {
    "id": "p3_5",
    "name": "Kingsford",
    "x": 2570,
    "y": 729,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "p3"
  },
  {
    "id": "npc_1",
    "name": "Eastwatch",
    "x": 2335,
    "y": 1115,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "east"
  },
  {
    "id": "npc_2",
    "name": "Sunwick",
    "x": 2049,
    "y": 1391,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "east"
  },
  {
    "id": "npc_3",
    "name": "Pearlstrand",
    "x": 1927,
    "y": 1443,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "east"
  },
  {
    "id": "npc_4",
    "name": "Greenfall",
    "x": 2490,
    "y": 1015,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "east"
  },
  {
    "id": "npc_5",
    "name": "Lionrest",
    "x": 2390,
    "y": 1050,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1,
    "startPool": "east"
  },
  {
    "id": "town_021",
    "name": "Southwatch",
    "x": 523,
    "y": 948,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_022",
    "name": "Redcliff",
    "x": 687,
    "y": 375,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_023",
    "name": "Ironford",
    "x": 1290,
    "y": 1056,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_024",
    "name": "Stormmere",
    "x": 398,
    "y": 978,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_025",
    "name": "Wolfgate",
    "x": 982,
    "y": 641,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_026",
    "name": "Oakheart",
    "x": 1270,
    "y": 1438,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_027",
    "name": "Riverbend",
    "x": 1997,
    "y": 337,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_028",
    "name": "Duskfall",
    "x": 1331,
    "y": 636,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_029",
    "name": "Amberfield",
    "x": 2563,
    "y": 1153,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_030",
    "name": "Oldmere",
    "x": 1107,
    "y": 629,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_031",
    "name": "Thornhollow",
    "x": 1994,
    "y": 481,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_032",
    "name": "Silverkeep",
    "x": 1231,
    "y": 608,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_033",
    "name": "Blackwater",
    "x": 2111,
    "y": 435,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_034",
    "name": "Greystone",
    "x": 1196,
    "y": 1051,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_035",
    "name": "Mistford",
    "x": 197,
    "y": 650,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_036",
    "name": "Eaglepass",
    "x": 1561,
    "y": 616,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_037",
    "name": "Seabrook",
    "x": 2474,
    "y": 891,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_038",
    "name": "Cedarwatch",
    "x": 878,
    "y": 441,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_039",
    "name": "Emberwick",
    "x": 888,
    "y": 614,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_040",
    "name": "Willowgate",
    "x": 511,
    "y": 266,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_041",
    "name": "Briarfall",
    "x": 1915,
    "y": 408,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_042",
    "name": "Hartford",
    "x": 1372,
    "y": 1164,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_043",
    "name": "Pinewatch",
    "x": 2154,
    "y": 170,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_044",
    "name": "Rookhaven",
    "x": 1921,
    "y": 639,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_045",
    "name": "Sableford",
    "x": 415,
    "y": 846,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_046",
    "name": "Marshgate",
    "x": 1833,
    "y": 715,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_047",
    "name": "Violetmere",
    "x": 2566,
    "y": 406,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_048",
    "name": "Crownhollow",
    "x": 2652,
    "y": 893,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_049",
    "name": "Foxford",
    "x": 2084,
    "y": 555,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_050",
    "name": "Brightcliff",
    "x": 1652,
    "y": 708,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_051",
    "name": "Moongate",
    "x": 921,
    "y": 223,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_052",
    "name": "Saltmere",
    "x": 1509,
    "y": 928,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_053",
    "name": "Falconrest",
    "x": 1018,
    "y": 479,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_054",
    "name": "Starwick",
    "x": 2256,
    "y": 571,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_055",
    "name": "Hearthford",
    "x": 1466,
    "y": 1440,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_056",
    "name": "Bluewater",
    "x": 1831,
    "y": 321,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_057",
    "name": "Copperfield",
    "x": 1113,
    "y": 741,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_058",
    "name": "Windwatch",
    "x": 1989,
    "y": 574,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_059",
    "name": "Rosehollow",
    "x": 1551,
    "y": 1282,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_060",
    "name": "Stoneford",
    "x": 316,
    "y": 363,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_061",
    "name": "Clearbrook",
    "x": 1796,
    "y": 205,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_062",
    "name": "Goldcrest",
    "x": 1691,
    "y": 837,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_063",
    "name": "Redwatch",
    "x": 1638,
    "y": 950,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_064",
    "name": "Mossgate",
    "x": 1442,
    "y": 520,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_065",
    "name": "Ironmere",
    "x": 248,
    "y": 938,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_066",
    "name": "Shadowford",
    "x": 470,
    "y": 413,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_067",
    "name": "Whiterest",
    "x": 1453,
    "y": 616,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_068",
    "name": "Queensbay",
    "x": 591,
    "y": 332,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_069",
    "name": "Kingsmere",
    "x": 273,
    "y": 733,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_070",
    "name": "Hawkhollow",
    "x": 2603,
    "y": 975,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_071",
    "name": "Greenwatch",
    "x": 2568,
    "y": 853,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_072",
    "name": "Stormcliff",
    "x": 930,
    "y": 517,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_073",
    "name": "Bayford",
    "x": 1128,
    "y": 536,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_074",
    "name": "Dawnmere",
    "x": 1356,
    "y": 991,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_075",
    "name": "Oakford",
    "x": 2455,
    "y": 1123,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_076",
    "name": "Wolfhollow",
    "x": 2279,
    "y": 441,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_077",
    "name": "Silverbay",
    "x": 1046,
    "y": 1109,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_078",
    "name": "Ravenford",
    "x": 1043,
    "y": 206,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_079",
    "name": "Sunrest",
    "x": 1451,
    "y": 1214,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_080",
    "name": "Ashmere",
    "x": 1303,
    "y": 545,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_081",
    "name": "Pearlgate",
    "x": 1173,
    "y": 113,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_082",
    "name": "Blackford",
    "x": 284,
    "y": 241,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_083",
    "name": "Lionford",
    "x": 2254,
    "y": 127,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_084",
    "name": "Frostmere",
    "x": 330,
    "y": 647,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_085",
    "name": "Crownford",
    "x": 2237,
    "y": 1135,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_086",
    "name": "Emberfall",
    "x": 1721,
    "y": 378,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_087",
    "name": "Rivergate",
    "x": 1809,
    "y": 447,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_088",
    "name": "Eagleford",
    "x": 1743,
    "y": 749,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_089",
    "name": "Brightwatch",
    "x": 1606,
    "y": 446,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_090",
    "name": "Duskford",
    "x": 2398,
    "y": 815,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_091",
    "name": "Sagewick",
    "x": 1755,
    "y": 639,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_092",
    "name": "Starfall",
    "x": 2078,
    "y": 233,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_093",
    "name": "Summergate",
    "x": 1362,
    "y": 1430,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_094",
    "name": "Hillford",
    "x": 833,
    "y": 524,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_095",
    "name": "Brightwood",
    "x": 2645,
    "y": 354,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_096",
    "name": "Kingswatch",
    "x": 1908,
    "y": 519,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_097",
    "name": "Greyford",
    "x": 1115,
    "y": 262,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_098",
    "name": "Sunhaven",
    "x": 1429,
    "y": 946,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_099",
    "name": "Crowsmere",
    "x": 1834,
    "y": 599,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  },
  {
    "id": "town_100",
    "name": "Whitebay",
    "x": 1191,
    "y": 691,
    "owner": "neutral",
    "level": 1,
    "troops": 10,
    "defense": 1
  }
];

const ISLAND_POLYGON = [
  {
    "x": 0,
    "y": 0
  },
  {
    "x": 2800,
    "y": 0
  },
  {
    "x": 2800,
    "y": 1575
  },
  {
    "x": 0,
    "y": 1575
  }
];

const LEGACY_TERRAIN_BLOCKERS = [
  {
    "id": "ridge-a",
    "type": "mountain",
    "label": "Crownspine",
    "x": 1450,
    "y": 250,
    "rx": 280,
    "ry": 170,
    "rot": -0.05
  },
  {
    "id": "ridge-b",
    "type": "mountain",
    "label": "Greyfang Range",
    "x": 820,
    "y": 855,
    "rx": 300,
    "ry": 190,
    "rot": 0.35
  },
  {
    "id": "ridge-c",
    "type": "mountain",
    "label": "Dragonback Peaks",
    "x": 2050,
    "y": 930,
    "rx": 330,
    "ry": 175,
    "rot": -0.05
  },
  {
    "id": "ridge-d",
    "type": "mountain",
    "label": "Elder Crags",
    "x": 1260,
    "y": 850,
    "rx": 140,
    "ry": 110,
    "rot": -0.15
  },
  {
    "id": "ridge-e",
    "type": "mountain",
    "label": "Southwatch Crags",
    "x": 1170,
    "y": 1260,
    "rx": 150,
    "ry": 105,
    "rot": 0.15
  },
  {
    "id": "ridge-f",
    "type": "mountain",
    "label": "Northwest Crag",
    "x": 345,
    "y": 505,
    "rx": 105,
    "ry": 80,
    "rot": 0.15
  },
  {
    "id": "ridge-g",
    "type": "mountain",
    "label": "East Horn",
    "x": 2490,
    "y": 575,
    "rx": 120,
    "ry": 95,
    "rot": 0.2
  }
];

const LEGACY_NO_CITY_TERRAIN = [
  {
    "id": "forest-sw",
    "type": "forest",
    "label": "Southwest Forest",
    "x": 470,
    "y": 1165,
    "rx": 300,
    "ry": 150,
    "rot": 0.0
  },
  {
    "id": "forest-west",
    "type": "forest",
    "label": "Westwood",
    "x": 600,
    "y": 650,
    "rx": 235,
    "ry": 150,
    "rot": -0.2
  },
  {
    "id": "forest-north",
    "type": "forest",
    "label": "Pine Crown",
    "x": 1205,
    "y": 420,
    "rx": 170,
    "ry": 85,
    "rot": 0.05
  },
  {
    "id": "forest-mid",
    "type": "forest",
    "label": "Middlewood",
    "x": 1360,
    "y": 760,
    "rx": 170,
    "ry": 85,
    "rot": -0.1
  },
  {
    "id": "forest-east",
    "type": "forest",
    "label": "Eastwood",
    "x": 2200,
    "y": 700,
    "rx": 200,
    "ry": 90,
    "rot": 0.15
  },
  {
    "id": "forest-se",
    "type": "forest",
    "label": "Southeast Woods",
    "x": 1960,
    "y": 1265,
    "rx": 230,
    "ry": 95,
    "rot": -0.1
  },
  {
    "id": "forest-south",
    "type": "forest",
    "label": "South Pines",
    "x": 1325,
    "y": 1320,
    "rx": 165,
    "ry": 70,
    "rot": 0.0
  },
  {
    "id": "forest-ne",
    "type": "forest",
    "label": "North Pines",
    "x": 2210,
    "y": 325,
    "rx": 165,
    "ry": 80,
    "rot": 0.0
  },
  {
    "id": "forest-central-se",
    "type": "forest",
    "label": "Greenmere Woods",
    "x": 1840,
    "y": 1110,
    "rx": 205,
    "ry": 95,
    "rot": 0.2
  },
  {
    "id": "swamp-sunken",
    "type": "swamp",
    "label": "Sunken Marsh",
    "x": 1610,
    "y": 1095,
    "rx": 240,
    "ry": 105,
    "rot": 0.08
  }
];

const WALKABLE_TERRAIN_ROWS = [
  "0000000000000000000000000000000000000000000000000000000000000000000000",
  "0000000000000000000000000000000001100000000000000000001000000000000000",
  "0000000000000000000000000000111111111000110000000000000110000000000000",
  "0000000000000011100000000000111111111111111000000000111111000000000000",
  "0000000000000111100001111111111111111111111111100000111110000000000000",
  "0000001100011111100011111111111111111111111111110001111110000000000000",
  "0000011111111110000001111111111111111111111111000111111000000000000000",
  "0000001111111111111111111111111111111111111111111111111000000001000000",
  "0000011111111111111000011111111111111111111111111111111111110111111000",
  "0000001111111111110000001111111111111111111111111111111111111111111000",
  "0000000011111111111001111111111111111111111111111111111111111111111000",
  "0000000000111111110111111111111111111111100011111111111111111110000000",
  "0000000000111111111011111111111111111100000000111111111111111110000000",
  "0000000000111111111111111111111111111100000000011111111111100000000000",
  "0000001111111111111011111111111111111111000001111111111111000000100000",
  "0000111111111111111111111111111111111111000111111111111111110001110000",
  "0000111111111111111111111111111111111111111111111111111111111001111100",
  "0000111111111111111111111111111111111111111111111111111111111111100000",
  "0000111111111111111111111111111111111111111111111111111111111111110000",
  "0000001111111111111111111111111111100001111111111111111111111111110000",
  "0000000001111111111111111111111111110000011111111111111111111111110000",
  "0000000001111111111111111111111111110000011111111111111111111111111000",
  "0000111001111111111111111111111111111111111011111111111111111111111100",
  "0000011111111111111111111111111111111110111111111111111111111111111100",
  "0001111111111111111111111111111111111111111111111111111111111111110000",
  "0011111111111111111111111111111111111111111111111111111111111111110000",
  "0001111111111111111111111111111111111111111111111111111111111111100000",
  "0000011111111111111111111111111111111111111111111111111111111111100000",
  "0000001111111111111111111111111111111111111111111111111111111111100000",
  "0000011111111111111110111111111111111111111111111111110101001111110000",
  "0000000000111111111000000111111111111111111111111111000000000000110000",
  "0000000000011111100000001111111111111111100001111111000000000000000000",
  "0000000000111111110000000000111111111111100000111111000000000000000000",
  "0000000001111110000000000000011111111110000000011111110000000000000000",
  "0000000011111110000000000000011111111110000000001111100000000000000000",
  "0000000000111100000000000000001111111110000000011111000000000000000000",
  "0000000000000000000000000000000111111110000000011111000000000000000000",
  "0000000000000000000000000000000000000000000000000010000000000000000000",
  "0000000000000000000000000000000000000000000000000000000000000000000000",
  "0000000000000000000000000000000000000000000000000000000000000000000000"
];

const TERRAIN_BLOCKERS = createWorldTerrainBlockers();
const NO_CITY_TERRAIN = createWorldNoCityTerrain();
const WORLD_CAMPS = generateWorldCampSlots();
const routeCache = new Map();
const asyncRouteCache = new Map();
const routeEdgePassableCache = new Map();
const normalizedArmyPathCache = new WeakMap();
const normalizedArmyPathSegmentsCache = new WeakMap();
const pathMetricCache = new WeakMap();
const ROUTE_CELL_FALLBACK_RADIUS = 32;
const ROUTE_CELL_FALLBACK_CANDIDATES = 24;
const ROUTE_CELL_FALLBACK_PAIR_LIMIT = 16;
const ROUTE_SEARCH_MAX_VISITED_CELLS = Math.max(2500, Math.min(10000, GRID_COLS * GRID_ROWS));
const ROUTE_WORKER_TIMEOUT_MS = 6000;
const ASYNC_ROUTE_CACHE_LIMIT = 320;
const NEAREST_SOURCE_ROUTE_CHECK_LIMIT = 18;
const SCOUT_SOURCE_ROUTE_CHECK_LIMIT = 10;


let state;
let selectedSourceId = null;
let lastSelectedOwnedCityId = null;
let selectedTargetId = null;
let sendMode = false;
let selectedMarchPercent = DEFAULT_MARCH_PERCENT;
let selectedTroopAmount = 1;
let troopSliderActive = false;
let activeTroopSliderRoute = null;
let activeTroopRouteRequestId = 0;
let scoutNearbySourceId = null;
let regroupSourceId = null;
let camera = { x: 0, y: 0 };
let zoom = 1;
let mapViewportWidth = 0;
let mapViewportHeight = 0;
let panState = null;
let activePointers = new Map();
let pinchState = null;
let suppressMapClick = false;
let lastFrameTime = performance.now();
let simulationUpdateAccumulatorMs = 0;
let lastRenderTime = 0;
let lastHudRenderTime = 0;
let lastHudStatusRenderTime = 0;
let lastArmyRenderTime = 0;
let lastCityDynamicTextTime = 0;
let renderableArmiesFrameCacheActive = false;
let renderableArmiesFrameCache = null;
let cameraTransformRaf = 0;
let saveTimer = 0;
let onlineSaveTimer = 0;
let onlineSaveQueued = false;
let onlineSaveInFlight = false;
let onlineLastSaveAt = 0;
let onlineLastError = "";
let onlineArmySavePromises = new Set();
const swiftMarchOrderRequests = new Set();
const recallHornRequests = new Set();
const rewardCampRecallRequests = new Set();
const rewardCampProgressCache = new Map();
const rewardCampProgressRequests = new Map();
const deedCampHistoryCache = new Map();
const deedCampHistoryRequests = new Map();
let crownCitadelReignCache = [];
let crownCitadelReignRequest = null;
let onlineCityStateSavePromises = new Set();
let pendingServerArmyLaunchKeys = new Set();
let onlineIslandUnsubscribe = null;
let onlineWorldLoading = false;
let onlineWorldConnected = false;
let onlineCitiesLoaded = false;
let onlineIdentityRepairInFlight = false;
let onlineIdentityRepairCompleted = false;
let deferredInstallPrompt = null;
let onlineFreshClaimCityId = "";
let onlineActiveRegionId = DEFAULT_ONLINE_REGION_ID;
const verifiedOnlineIslandSeeds = new Set();
let mapSwitchLoading = false;
let onlineSetupBackgroundInFlight = false;
let onlineCitySyncTimer = 0;
let onlineCitySyncInFlight = false;
let onlineCitySyncQueued = false;
let onlineArmies = [];
let onlineArmiesByIsland = new Map();
const PLAYER_RELEVANT_ARMIES_CACHE_KEY = "player-relevant";
let pendingOutgoingMissions = new Map();
let onlineCampStates = new Map();
let onlineHeldCampStates = new Map();
let resolvingRewardCampPayoutIds = new Set();
let onlineArmyUnsubscribes = [];
let onlineHeldCampsUnsubscribe = null;
let onlineServerReportsUnsubscribe = null;
let onlineGlobalStatsUnsubscribe = null;
let onlineGlobalStats = null;
let onlineCrownCitadelUnsubscribe = null;
let onlineCrownCitadelSnapshot = null;
let onlineCrownCitadelLoaded = false;
let appliedServerReportIds = new Set();
let resolvingOnlineArmyIds = new Set();
let resolvedOnlineArmyIds = new Set();
let onlinePresence = [];
const playerIdentityCache = new Map();
const playerIdentityLookupQueue = new Set();
const playerIdentityLookupMisses = new Map();
let playerIdentityLookupInFlight = false;
let lastHudFlagSignature = "";
let routeWorker = null;
let routeWorkerUnavailable = false;
let routeWorkerRequestId = 0;
const routeWorkerRequests = new Map();
const routeWorkerRegionDataCache = new Map();
let routeWorkerWarmupScheduled = false;
let harvestSpawnRequestInFlight = false;
let harvestRelocationRetryAtMs = 0;
let onlineIslandSummaries = new Map();
let onlineIslandSummaryRefreshInFlight = false;
let onlineOwnedCitiesCache = [];
let onlineOwnedCitiesCacheAt = 0;
let onlineOwnedCitiesCacheComplete = false;
let onlineOwnedCitiesRefreshInFlight = false;
let activeOperationsTab = "marches";
const islandMapPickerViewState = {
  scrollLeft: 0,
  scrollTop: 0,
  zoom: 1,
  hasView: false,
};
let islandMapHomeRefreshInFlight = false;
let onlinePresenceTimer = 0;
let onlinePresenceInFlight = false;
let onlineSessionReplaced = false;
let gameServerMembership = null;
let gameServerMembershipUnsubscribe = null;
let gameServerHeartbeatIntervalId = 0;
let gameServerHeartbeatInFlight = false;
let gameServerJoinInFlight = false;
let gameServerLaunchInFlight = false;
let gameServerAutoEnter = false;
let serverEconomySyncTimer = 0;
let serverEconomyRefreshInFlight = false;
let serverEconomyRefreshQueued = false;
let serverEconomyLastSyncAt = 0;
let serverEconomyLastToastAt = 0;
let lastAuthoritativeProfileRevisionMs = 0;
let lastReportDrivenEconomyRefreshAtMs = 0;
let activeLevelUpReward = null;
const levelUpRewardQueue = [];
let leaderboardSaveTimer = 0;
let leaderboardSaveInFlight = false;
let leaderboardLastSignature = "";
let leaderboardLastSaveAt = 0;
let kingPowerCalculationInProgress = false;
let lastComputedKingPower = 0;
let currentPlayerIdentityKingPowerOverride = null;
let overdueArmyResolveTimer = 0;
let pendingArmyRecoveryInFlight = false;
let shopPurchaseInFlight = false;
let skillActionInFlight = false;
let serverCityUpgradeInFlightIds = new Set();
let serverCityRelinquishInFlightIds = new Set();
let pendingHarvestBonusIds = new Set();
let selectedInventoryItemId = "";
let updateCheckTimer = 0;
let updateCheckInFlight = false;
let deployedUpdateAvailableBuildId = "";
let deployedUpdateNoticeShown = false;
let deployedUpdateReloadInProgress = false;
let selectedArmyTokenId = "";
const islandImageLoadPromises = new Map();
const islandImagePreloadElements = new Map();
const loadedImageAssets = new Set();
const nearbyIslandPreloadRegions = new Set();
const preloadedMapRegions = new Set();
let pendingOfflineProgressSeconds = 0;
let pendingOfflineProductionCities = [];
let pendingOfflineOwnedCityIds = null;
let localDirtyCityIds = new Set();
let toastTimer = null;
let attackIdCounter = 1;
let flagDraft = null;
let activeProfileTab = "profile";
let battleReportFilter = "all";
let cityListSortKey = "level";
let cityListSortDirection = "desc";
let cityListPage = 0;
let playableBaseCitiesCache = null;
let playableBaseCitiesByIdCache = null;
let playableBaseCitiesByRegionCache = null;
let stateCityByIdCache = null;
let stateCityByIdCacheSource = null;
let stateCityByIdCacheSize = 0;
let renderedMapRegionId = "";
let renderedMapBoundsSignature = "";
let mapImageSwapToken = 0;
let interactionRenderLockUntil = 0;
let cameraInteractionSettleTimer = null;
let deferredMapRenderPending = false;
let lastMainCityReturnCameraUpdateAt = 0;
let cityRenderSignature = "";
let pathRenderSignature = "";
const armyTokenCache = new Map();
let visibleCityDensityCount = 0;
let visibleArmyDensityCount = 0;
let crowdedMapDensityEnabled = false;
let lowZoomPerformanceEnabled = false;
let performancePanel = null;
let performancePanelVisible = false;
let performanceFrameCount = 0;
let performanceLastSampleTime = performance.now();
let performanceFps = 0;
let cityTapState = null;
let campTapState = null;
let armyTapState = null;

const setupScreen = document.getElementById("setupScreen");
const gameView = document.querySelector(".game-view");
const menuLoadingWheel = document.getElementById("menuLoadingWheel");
const playerNameInput = document.getElementById("playerName");
const startBtn = document.getElementById("startBtn");
const freshBtn = document.getElementById("freshBtn");
const onlineStatusText = document.getElementById("onlineStatusText");
const onlineStatusDetail = document.getElementById("onlineStatusDetail");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const enterKingdomBtn = document.getElementById("enterKingdomBtn");
const googleSignOutBtn = document.getElementById("googleSignOutBtn");
const installAppBtn = document.getElementById("installAppBtn");
const serverRealmList = document.getElementById("serverRealmList");
const serverRealmBtn = document.getElementById("serverRealmBtn");
const serverQueueStatus = document.getElementById("serverQueueStatus");
const lordNameText = document.getElementById("lordNameText");
const statusText = document.getElementById("statusText");
const goldText = document.getElementById("goldText");
const islandSwitchBtn = document.getElementById("islandSwitchBtn");
const islandSwitchLabel = document.getElementById("islandSwitchLabel");
const cityListBtn = document.getElementById("cityListBtn");
const cityText = document.getElementById("cityText");
const inventoryBtn = document.getElementById("inventoryBtn");
const shieldStatusBadge = document.getElementById("shieldStatusBadge");
const shieldStatusTime = document.getElementById("shieldStatusTime");
const warDrumsStatusBadge = document.getElementById("warDrumsStatusBadge");
const warDrumsStatusTime = document.getElementById("warDrumsStatusTime");
const taxDecreeStatusBadge = document.getElementById("taxDecreeStatusBadge");
const taxDecreeStatusTime = document.getElementById("taxDecreeStatusTime");
const veilStatusBadge = document.getElementById("veilStatusBadge");
const veilStatusTime = document.getElementById("veilStatusTime");
const activeItemEffectsStack = document.getElementById("activeItemEffectsStack");
const shopBtn = document.getElementById("shopBtn");
const neutralCapText = document.getElementById("neutralCapText");
const characterLevelBadge = document.getElementById("characterLevelBadge");
const characterXpText = document.getElementById("characterXpText");
const fullscreenButtons = Array.from(document.querySelectorAll("[data-fullscreen-toggle]"));
const mainCityReturnBtn = document.getElementById("mainCityReturnBtn");
const profileBtn = document.getElementById("profileBtn");
const hudKingdomFlag = document.getElementById("hudKingdomFlag");
const profileScreen = document.getElementById("profileScreen");
const profileCloseBtn = document.getElementById("profileCloseBtn");
const profileScreenTitle = document.getElementById("profileScreenTitle");
const profileTabBtn = document.getElementById("profileTabBtn");
const skillsTabBtn = document.getElementById("skillsTabBtn");
const settingsTabBtn = document.getElementById("settingsTabBtn");
const profileView = document.getElementById("profileView");
const skillsView = document.getElementById("skillsView");
const settingsView = document.getElementById("settingsView");
const flagEditorView = document.getElementById("flagEditorView");
const profileKingdomFlag = document.getElementById("profileKingdomFlag");
const profileFlagBtn = document.getElementById("profileFlagBtn");
const profileNameDisplay = document.getElementById("profileNameDisplay");
const profileNameText = document.getElementById("profileNameText");
const profileNameEditBtn = document.getElementById("profileNameEditBtn");
const profileNameEditor = document.getElementById("profileNameEditor");
const profileNameInput = document.getElementById("profileNameInput");
const profileNameSaveBtn = document.getElementById("profileNameSaveBtn");
const profileNameCancelBtn = document.getElementById("profileNameCancelBtn");
const profileLevelText = document.getElementById("profileLevelText");
const profileXpLabel = document.getElementById("profileXpLabel");
const profileXpFill = document.getElementById("profileXpFill");
const profileKingPowerStat = document.getElementById("profileKingPowerStat");
const profileKingPowerBreakdown = document.getElementById("profileKingPowerBreakdown");
const profileKingPowerStrongholdBonus = document.getElementById("profileKingPowerStrongholdBonus");
const profileCitiesStat = document.getElementById("profileCitiesStat");
const profileGoldStat = document.getElementById("profileGoldStat");
const profileTroopsStat = document.getElementById("profileTroopsStat");
const profileGoldProductionStat = document.getElementById("profileGoldProductionStat");
const profileTroopProductionStat = document.getElementById("profileTroopProductionStat");
const pushAlertsOffBtn = document.getElementById("pushAlertsOffBtn");
const pushAlertsOnBtn = document.getElementById("pushAlertsOnBtn");
const pushAlertsStatus = document.getElementById("pushAlertsStatus");
const flagEditorPreview = document.getElementById("flagEditorPreview");
const flagPrimaryColors = document.getElementById("flagPrimaryColors");
const flagSecondaryColors = document.getElementById("flagSecondaryColors");
const flagPatternOptions = document.getElementById("flagPatternOptions");
const flagSymbolOptions = document.getElementById("flagSymbolOptions");
const flagSaveBtn = document.getElementById("flagSaveBtn");
const flagBackBtn = document.getElementById("flagBackBtn");
const flagExitBtn = document.getElementById("flagExitBtn");
const mapFrame = document.getElementById("mapFrame");
const mapLoadingLabel = document.getElementById("mapLoadingLabel");
const mapWorld = document.getElementById("mapWorld");
const mapBg = document.getElementById("mapBg");
const pathsSvg = document.getElementById("pathsSvg");
const harvestLayer = document.getElementById("harvestLayer");
const portalLayer = document.getElementById("portalLayer");
const cityLayer = document.getElementById("cityLayer");
const armyLayer = document.getElementById("armyLayer");
const toast = document.getElementById("toast");
const commanderPanel = document.querySelector(".commander-panel");
const panelTitle = document.getElementById("panelTitle");
const panelSubtitle = document.getElementById("panelSubtitle");
const selectedInfo = document.getElementById("selectedInfo");
const actionButtons = document.getElementById("actionButtons");
const clearSelectBtn = document.getElementById("clearSelectBtn");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const closeModalBtn = document.getElementById("closeModalBtn");
const levelUpRewardModal = document.getElementById("levelUpRewardModal");
const levelUpRewardTitle = document.getElementById("levelUpRewardTitle");
const levelUpRewardSubtitle = document.getElementById("levelUpRewardSubtitle");
const levelUpRewardBody = document.getElementById("levelUpRewardBody");
const collectLevelUpRewardsBtn = document.getElementById("collectLevelUpRewardsBtn");
const logBtn = document.getElementById("logBtn");
const leaderboardBtn = document.getElementById("leaderboardBtn");
const outgoingAttackBtn = document.getElementById("outgoingAttackBtn");
const outgoingAttackCount = document.getElementById("outgoingAttackCount");
const outgoingAttackTime = document.getElementById("outgoingAttackTime");
const incomingAttackBtn = document.getElementById("incomingAttackBtn");
const incomingAttackCount = document.getElementById("incomingAttackCount");
const incomingAttackTime = document.getElementById("incomingAttackTime");
const helpBtn = document.getElementById("helpBtn");

function getRegionById(regionId) {
  return WORLD_REGIONS.find(region => region.id === regionId) || WORLD_REGIONS[0] || null;
}

function getRegionIds() {
  return WORLD_REGIONS.map(region => region.id).filter(Boolean);
}

function getRegionLabel(regionId) {
  return getRegionById(regionId)?.label || regionId || "Island";
}

function normalizeRegionId(regionId) {
  const value = String(regionId || "").trim();
  return getRegionById(value)?.id || DEFAULT_ONLINE_REGION_ID;
}

function getCityRegionId(cityOrId) {
  if (cityOrId && typeof cityOrId === "object") {
    return normalizeRegionId(cityOrId.regionId || cityOrId.startPool);
  }
  const cityId = String(cityOrId || "");
  const base = getPlayableBaseCityById(cityId);
  return normalizeRegionId(base?.regionId || base?.startPool);
}

function getKnownCityId(cityId) {
  const value = String(cityId || "");
  if (!value) return "";
  return getPlayableBaseCityById(value) ? value : "";
}

function getOnlineIslandId(regionId = DEFAULT_ONLINE_REGION_ID) {
  return `${ONLINE_WORLD_ID}-${normalizeRegionId(regionId)}`;
}

function getRegionIdFromOnlineIslandId(islandId) {
  const value = String(islandId || "");
  const prefix = `${ONLINE_WORLD_ID}-`;
  if (!value.startsWith(prefix)) return "";
  return normalizeRegionId(value.slice(prefix.length));
}

function getActiveOnlineRegionId() {
  return normalizeRegionId(state?.online?.activeRegionId || state?.activeRegionId || onlineActiveRegionId);
}

function getActiveMapRegionId() {
  return state ? getActiveOnlineRegionId() : DEFAULT_ONLINE_REGION_ID;
}

function getIslandMapPadding(region) {
  return Math.max(ISLAND_MAP_PADDING, Math.round(Math.max(Number(region?.rx) || 0, Number(region?.ry) || 0) * 0.22));
}

function getDefaultIslandImageDimensions(regionId) {
  const targetRegionId = cleanEditorRegionId(regionId);
  if (targetRegionId === "west") return { width: WEST_ISLAND_IMAGE_WIDTH, height: WEST_ISLAND_IMAGE_HEIGHT };
  if (targetRegionId === "north") return { width: NORTH_ISLAND_IMAGE_WIDTH, height: NORTH_ISLAND_IMAGE_HEIGHT };
  if (targetRegionId === "east") return { width: EAST_ISLAND_IMAGE_WIDTH, height: EAST_ISLAND_IMAGE_HEIGHT };
  if (targetRegionId === "south") return { width: SOUTH_ISLAND_IMAGE_WIDTH, height: SOUTH_ISLAND_IMAGE_HEIGHT };
  if (targetRegionId === "center") return { width: CENTER_ISLAND_IMAGE_WIDTH, height: CENTER_ISLAND_IMAGE_HEIGHT };
  return { width: 1200, height: 1200 };
}

function getIslandImageDimensions(regionId) {
  const map = getEditorMap(regionId);
  const image = map?.image && typeof map.image === "object" ? map.image : {};
  const width = Math.floor(Number(map?.imageWidth || image.width || map?.width) || 0);
  const height = Math.floor(Number(map?.imageHeight || image.height || map?.height) || 0);
  if (width > 0 && height > 0) return { width, height };
  return getDefaultIslandImageDimensions(regionId);
}

function getEditorMapImageSrc(regionId) {
  const map = getEditorMap(regionId);
  return String(map?.imageSrc || map?.image?.src || "");
}

function getEditorMapPreviewSrc(regionId) {
  const map = getEditorMap(regionId);
  return String(map?.thumbnailSrc || map?.thumbSrc || map?.previewSrc || map?.imageSrc || map?.image?.src || "");
}

function getDefaultIslandLandPolygon(regionId) {
  const targetRegionId = cleanEditorRegionId(regionId);
  if (targetRegionId === "west") return WEST_ISLAND_LAND_POLYGON;
  if (targetRegionId === "north") return NORTH_ISLAND_LAND_POLYGON;
  if (targetRegionId === "east") return EAST_ISLAND_LAND_POLYGON;
  if (targetRegionId === "south") return SOUTH_ISLAND_LAND_POLYGON;
  if (targetRegionId === "center") return CENTER_ISLAND_LAND_POLYGON;
  return [];
}

function getIslandLandPolygon(regionId) {
  const map = getEditorMap(regionId);
  const polygon = Array.isArray(map?.landPolygon) ? map.landPolygon : null;
  if (polygon?.length >= 3) {
    return polygon
      .map(point => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  if (hasEditorImageMap(regionId)) return [];
  return getDefaultIslandLandPolygon(regionId);
}

function hasEditorImageMap(regionId) {
  const map = getEditorMap(regionId);
  return Boolean(map?.imageSrc || map?.image?.src);
}

function getImageIslandMapBounds(region) {
  const dimensions = getIslandImageDimensions(region.id);
  const aspect = Math.max(0.1, dimensions.width / Math.max(1, dimensions.height));
  const padding = getIslandMapPadding(region);
  let width;
  let height;
  if (aspect >= 1) {
    width = Math.round((Number(region.rx) + padding) * 2);
    height = Math.round(width / aspect);
  } else {
    height = Math.round((Number(region.ry) + padding) * 2);
    width = Math.round(height * aspect);
  }
  width = clamp(width, 1, WORLD_WIDTH);
  height = clamp(height, 1, WORLD_HEIGHT);
  const left = clamp(Math.round(Number(region.x) - width / 2), 0, Math.max(0, WORLD_WIDTH - width));
  const top = clamp(Math.round(Number(region.y) - height / 2), 0, Math.max(0, WORLD_HEIGHT - height));
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    region,
    regionId: cleanEditorRegionId(region.id),
  };
}

function getWestIslandMapBounds(region) {
  const height = Math.round((Number(region.ry) + getIslandMapPadding(region)) * 2);
  const width = Math.round(height * WEST_ISLAND_IMAGE_WIDTH / WEST_ISLAND_IMAGE_HEIGHT);
  const left = clamp(Math.round(Number(region.x) - width / 2), 0, WORLD_WIDTH - width);
  const top = clamp(Math.round(Number(region.y) - height / 2), 0, WORLD_HEIGHT - height);
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    region,
    regionId: "west",
  };
}

function getNorthIslandMapBounds(region) {
  const width = Math.round((Number(region.rx) + getIslandMapPadding(region)) * 2);
  const height = Math.round(width * NORTH_ISLAND_IMAGE_HEIGHT / NORTH_ISLAND_IMAGE_WIDTH);
  const left = clamp(Math.round(Number(region.x) - width / 2), 0, WORLD_WIDTH - width);
  const top = clamp(Math.round(Number(region.y) - height / 2), 0, WORLD_HEIGHT - height);
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    region,
    regionId: "north",
  };
}

function getEastIslandMapBounds(region) {
  const height = Math.round((Number(region.ry) + getIslandMapPadding(region)) * 2);
  const width = Math.round(height * EAST_ISLAND_IMAGE_WIDTH / EAST_ISLAND_IMAGE_HEIGHT);
  const left = clamp(Math.round(Number(region.x) - width / 2), 0, WORLD_WIDTH - width);
  const top = clamp(Math.round(Number(region.y) - height / 2), 0, WORLD_HEIGHT - height);
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    region,
    regionId: "east",
  };
}

function getSouthIslandMapBounds(region) {
  const width = Math.round((Number(region.rx) + getIslandMapPadding(region)) * 2);
  const height = Math.round(width * SOUTH_ISLAND_IMAGE_HEIGHT / SOUTH_ISLAND_IMAGE_WIDTH);
  const left = clamp(Math.round(Number(region.x) - width / 2), 0, WORLD_WIDTH - width);
  const top = clamp(Math.round(Number(region.y) - height / 2), 0, WORLD_HEIGHT - height);
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    region,
    regionId: "south",
  };
}

function getCenterIslandMapBounds(region) {
  const size = Math.round((Math.max(Number(region.rx) || 0, Number(region.ry) || 0) + getIslandMapPadding(region)) * 2);
  const left = clamp(Math.round(Number(region.x) - size / 2), 0, WORLD_WIDTH - size);
  const top = clamp(Math.round(Number(region.y) - size / 2), 0, WORLD_HEIGHT - size);
  return {
    left,
    top,
    right: left + size,
    bottom: top + size,
    width: size,
    height: size,
    region,
    regionId: "center",
  };
}

function getIslandMapBounds(regionId = getActiveMapRegionId()) {
  const region = getRegionById(regionId) || getRegionById(DEFAULT_ONLINE_REGION_ID) || {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    rx: WORLD_WIDTH / 2,
    ry: WORLD_HEIGHT / 2,
  };
  if (hasEditorImageMap(region.id)) return getImageIslandMapBounds(region);
  if (normalizeRegionId(region.id) === "west") return getWestIslandMapBounds(region);
  if (normalizeRegionId(region.id) === "north") return getNorthIslandMapBounds(region);
  if (normalizeRegionId(region.id) === "east") return getEastIslandMapBounds(region);
  if (normalizeRegionId(region.id) === "south") return getSouthIslandMapBounds(region);
  if (normalizeRegionId(region.id) === "center") return getCenterIslandMapBounds(region);
  const padding = getIslandMapPadding(region);
  const left = clamp(Math.floor(region.x - region.rx - padding), 0, WORLD_WIDTH - 1);
  const top = clamp(Math.floor(region.y - region.ry - padding), 0, WORLD_HEIGHT - 1);
  const right = clamp(Math.ceil(region.x + region.rx + padding), left + 1, WORLD_WIDTH);
  const bottom = clamp(Math.ceil(region.y + region.ry + padding), top + 1, WORLD_HEIGHT);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    region,
    regionId: normalizeRegionId(region.id),
  };
}

function getActiveMapBounds() {
  return getIslandMapBounds(getActiveMapRegionId());
}

function getActiveMapDimensions() {
  const bounds = getActiveMapBounds();
  return { width: bounds.width, height: bounds.height };
}

function worldToMapPoint(pointOrX, yValue = null) {
  const bounds = getActiveMapBounds();
  const worldX = typeof pointOrX === "object" ? Number(pointOrX?.x) || 0 : Number(pointOrX) || 0;
  const worldY = typeof pointOrX === "object" ? Number(pointOrX?.y) || 0 : Number(yValue) || 0;
  return {
    x: worldX - bounds.left,
    y: worldY - bounds.top,
  };
}

function mapToWorldPoint(pointOrX, yValue = null) {
  const bounds = getActiveMapBounds();
  const mapX = typeof pointOrX === "object" ? Number(pointOrX?.x) || 0 : Number(pointOrX) || 0;
  const mapY = typeof pointOrX === "object" ? Number(pointOrX?.y) || 0 : Number(yValue) || 0;
  return {
    x: mapX + bounds.left,
    y: mapY + bounds.top,
  };
}

function islandImagePointToWorld(regionId, point) {
  const targetRegionId = cleanEditorRegionId(regionId);
  const dimensions = getIslandImageDimensions(targetRegionId);
  const bounds = getIslandMapBounds(targetRegionId);
  return {
    x: bounds.left + (Number(point?.x) || 0) / dimensions.width * bounds.width,
    y: bounds.top + (Number(point?.y) || 0) / dimensions.height * bounds.height,
  };
}

function islandImageVisualSizeToWorld(regionId, size, fallback) {
  const targetRegionId = cleanEditorRegionId(regionId);
  const dimensions = getIslandImageDimensions(targetRegionId);
  const bounds = getIslandMapBounds(targetRegionId);
  const imageSize = readVisualSize(size, fallback);
  const scale = bounds.width / Math.max(1, dimensions.width);
  return Math.max(1, Math.round(imageSize * scale));
}

function worldToIslandImagePointRaw(regionId, pointOrX, yValue = null) {
  const targetRegionId = cleanEditorRegionId(regionId);
  const dimensions = getIslandImageDimensions(targetRegionId);
  const bounds = getIslandMapBounds(targetRegionId);
  const worldX = typeof pointOrX === "object" ? Number(pointOrX?.x) || 0 : Number(pointOrX) || 0;
  const worldY = typeof pointOrX === "object" ? Number(pointOrX?.y) || 0 : Number(yValue) || 0;
  return {
    x: (worldX - bounds.left) / bounds.width * dimensions.width,
    y: (worldY - bounds.top) / bounds.height * dimensions.height,
  };
}

function westImagePointToWorld(point) {
  return islandImagePointToWorld("west", point);
}

function worldToWestImagePoint(pointOrX, yValue = null) {
  return worldToIslandImagePointRaw("west", pointOrX, yValue);
}

function isWestIslandLandPoint(x, y) {
  const point = worldToWestImagePoint(x, y);
  const dimensions = getIslandImageDimensions("west");
  if (point.x < 0 || point.y < 0 || point.x > dimensions.width || point.y > dimensions.height) return false;
  const polygon = getIslandLandPolygon("west");
  return polygon.length ? pointInPolygon(point.x, point.y, polygon) : true;
}

function northImagePointToWorld(point) {
  return islandImagePointToWorld("north", point);
}

function worldToNorthImagePoint(pointOrX, yValue = null) {
  return worldToIslandImagePointRaw("north", pointOrX, yValue);
}

function isNorthIslandLandPoint(x, y) {
  const point = worldToNorthImagePoint(x, y);
  const dimensions = getIslandImageDimensions("north");
  if (point.x < 0 || point.y < 0 || point.x > dimensions.width || point.y > dimensions.height) return false;
  const polygon = getIslandLandPolygon("north");
  return polygon.length ? pointInPolygon(point.x, point.y, polygon) : true;
}

function eastImagePointToWorld(point) {
  return islandImagePointToWorld("east", point);
}

function worldToEastImagePoint(pointOrX, yValue = null) {
  return worldToIslandImagePointRaw("east", pointOrX, yValue);
}

function isEastIslandLandPoint(x, y) {
  const point = worldToEastImagePoint(x, y);
  const dimensions = getIslandImageDimensions("east");
  if (point.x < 0 || point.y < 0 || point.x > dimensions.width || point.y > dimensions.height) return false;
  const polygon = getIslandLandPolygon("east");
  return polygon.length ? pointInPolygon(point.x, point.y, polygon) : true;
}

function southImagePointToWorld(point) {
  return islandImagePointToWorld("south", point);
}

function worldToSouthImagePoint(pointOrX, yValue = null) {
  return worldToIslandImagePointRaw("south", pointOrX, yValue);
}

function isSouthIslandLandPoint(x, y) {
  const point = worldToSouthImagePoint(x, y);
  const dimensions = getIslandImageDimensions("south");
  if (point.x < 0 || point.y < 0 || point.x > dimensions.width || point.y > dimensions.height) return false;
  const polygon = getIslandLandPolygon("south");
  return polygon.length ? pointInPolygon(point.x, point.y, polygon) : true;
}

function normalizeImageTerrainShapes(terrainByRegion) {
  return Object.fromEntries(Object.entries(terrainByRegion).map(([regionId, shapes]) => [
    regionId,
    shapes.map(shape => {
      const rot = shape.rot || 0;
      return {
        ...shape,
        cos: Math.cos(-rot),
        sin: Math.sin(-rot),
      };
    }),
  ]));
}

function getBitmapIslandRegionIdAtWorldPoint(x, y, padding = 0) {
  for (const regionId of BITMAP_ISLAND_IDS) {
    const bounds = getIslandMapBounds(regionId);
    if (x >= bounds.left - padding
      && x <= bounds.right + padding
      && y >= bounds.top - padding
      && y <= bounds.bottom + padding) {
      return regionId;
    }
  }
  return "";
}

function worldToIslandImagePoint(regionId, pointOrX, yValue = null) {
  return worldToIslandImagePointRaw(regionId, pointOrX, yValue);
}

function pointInImageEllipse(point, shape, padding = 0) {
  const dx = point.x - shape.x;
  const dy = point.y - shape.y;
  const xr = dx * shape.cos - dy * shape.sin;
  const yr = dx * shape.sin + dy * shape.cos;
  const rx = shape.rx + padding;
  const ry = shape.ry + padding;
  return ((xr * xr) / (rx * rx)) + ((yr * yr) / (ry * ry)) <= 1;
}

function isImageTerrainPoint(x, y, terrainByRegion, padding = 0) {
  const regionId = getBitmapIslandRegionIdAtWorldPoint(x, y, padding);
  if (!regionId) return false;
  const point = worldToIslandImagePoint(regionId, x, y);
  return (terrainByRegion[regionId] || []).some(shape => pointInImageEllipse(point, shape, padding));
}

function isBitmapTerrainBlockedPoint(x, y, padding = 0) {
  return isImageTerrainPoint(x, y, IMAGE_TERRAIN_BLOCKERS, padding);
}

function isBitmapNoCityTerrainPoint(x, y, padding = 0) {
  return isImageTerrainPoint(x, y, IMAGE_NO_CITY_TERRAIN, padding);
}

function centerImagePointToWorld(point) {
  return islandImagePointToWorld("center", point);
}

function worldToCenterImagePoint(pointOrX, yValue = null) {
  return worldToIslandImagePointRaw("center", pointOrX, yValue);
}

function isCenterIslandLandPoint(x, y) {
  const point = worldToCenterImagePoint(x, y);
  const dimensions = getIslandImageDimensions("center");
  if (point.x < 0 || point.y < 0 || point.x > dimensions.width || point.y > dimensions.height) return false;
  const polygon = getIslandLandPolygon("center");
  return polygon.length ? pointInPolygon(point.x, point.y, polygon) : true;
}

function isCityInActiveMap(city) {
  return city && getCityRegionId(city) === getActiveMapRegionId();
}

function getActiveOnlineIslandId() {
  return state?.online?.islandId || getOnlineIslandId(getActiveOnlineRegionId());
}

function getOnlineIslandBaseCities(regionId = getActiveOnlineRegionId()) {
  return getPlayableBaseCitiesByRegion(regionId);
}

function getRegularCityCapacity(regionId) {
  return getOnlineIslandBaseCities(regionId).filter(city => !isStronghold(city)).length;
}

function getOuterRegionIds() {
  const outer = getRegionIds().filter(regionId => regionId !== "center");
  return outer.length ? outer : getRegionIds();
}

function getStarterRegionIds() {
  return getRegionIds().filter(regionId => isStarterRegion(getRegionById(regionId)));
}

function getRegionIdsByType(regionType) {
  const targetType = cleanRegionType(regionType);
  return getRegionIds().filter(regionId => cleanRegionType(getRegionById(regionId)?.type) === targetType);
}

function getOrderedNewPlayerSpawnRegionIds() {
  const seen = new Set();
  const ordered = [];
  NEW_PLAYER_SPAWN_REGION_TYPE_ORDER.forEach(regionType => {
    getRegionIdsByType(regionType).forEach(regionId => {
      if (seen.has(regionId)) return;
      seen.add(regionId);
      ordered.push(regionId);
    });
  });
  return ordered;
}

function getNewPlayerSpawnRegionIds() {
  const orderedRegionIds = getOrderedNewPlayerSpawnRegionIds();
  return orderedRegionIds.length ? orderedRegionIds : getOuterRegionIds();
}

function getNeutralCityCountFromSummary(regionId, summary = null) {
  const regularCityCount = Math.max(
    0,
    getRegularCityCapacity(regionId),
    Math.floor(Number(summary?.regularCityCount) || 0),
    Math.floor(Number(summary?.cityCount) || 0)
  );
  const exactNeutralCount = Number(summary?.neutralCityCount);
  if (Number.isFinite(exactNeutralCount)) return Math.max(0, Math.floor(exactNeutralCount));
  const playerHeldCityCount = Math.max(0, Math.floor(Number(summary?.playerHeldCityCount) || 0));
  return Math.max(0, regularCityCount - playerHeldCityCount);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value || "").length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickStartingRegionId() {
  const regions = getNewPlayerSpawnRegionIds();
  if (!regions.length) return DEFAULT_ONLINE_REGION_ID;
  const uid = getCurrentOnlineUid() || getOnlineApi()?.getUser?.()?.email || "guest";
  return regions[hashString(uid) % regions.length] || DEFAULT_ONLINE_REGION_ID;
}

async function loadNewPlayerSpawnSummary(regionId) {
  const api = getOnlineApi();
  if (!api?.loadIslandCitySummary || !api?.isSignedIn?.()) return null;
  const summary = await withTimeout(
    api.loadIslandCitySummary(getOnlineIslandId(regionId), { includeNeutralCount: true }),
    6500,
    `${getRegionLabel(regionId)} availability lookup is taking too long.`
  );
  return summary ? cacheIslandOccupancySummary(regionId, summary) : null;
}

async function pickAvailableStartingRegionId() {
  const orderedRegionIds = getNewPlayerSpawnRegionIds();
  if (!orderedRegionIds.length) return DEFAULT_ONLINE_REGION_ID;
  const api = getOnlineApi();
  if (!api?.loadIslandCitySummary || !api?.isSignedIn?.()) return pickStartingRegionId();

  let summariesLoaded = 0;
  for (const regionId of orderedRegionIds) {
    try {
      const summary = await loadNewPlayerSpawnSummary(regionId);
      summariesLoaded += summary ? 1 : 0;
      const neutralCityCount = getNeutralCityCountFromSummary(regionId, summary);
      if (neutralCityCount >= MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES) return regionId;
    } catch (error) {
      console.warn(`Could not check ${getRegionLabel(regionId)} spawn availability`, error);
    }
  }

  return summariesLoaded > 0 ? "" : pickStartingRegionId();
}

function isCurrentResetProfile(profile) {
  return Boolean(profile && profile.resetGeneration === RESET_GENERATION);
}

function getStoredHomeRegionId(profile = null, { trustLocalState = true } = {}) {
  const profileRegion = normalizeRegionId(profile?.mainRegionId || getRegionIdFromOnlineIslandId(profile?.mainIslandId));
  if (profile?.mainRegionId || getRegionIdFromOnlineIslandId(profile?.mainIslandId)) return profileRegion;
  const profileMainCityId = getKnownCityId(profile?.mainCityId);
  if (profileMainCityId) return getCityRegionId(profileMainCityId);
  if (!trustLocalState) return "";
  if (state?.online?.mainRegionId) return normalizeRegionId(state.online.mainRegionId);
  const onlineMainCityId = getKnownCityId(state?.online?.mainCityId);
  if (onlineMainCityId) return getCityRegionId(onlineMainCityId);
  if (state?.online?.mainIslandId) return normalizeRegionId(getRegionIdFromOnlineIslandId(state.online.mainIslandId));
  const savedMainCityId = getKnownCityId(state?.mainCityId);
  if (savedMainCityId) return getCityRegionId(savedMainCityId);
  return "";
}

function resolveHomeRegionId(profile = null, { trustLocalState = true } = {}) {
  return getStoredHomeRegionId(profile, { trustLocalState }) || pickStartingRegionId();
}

async function resolveHomeRegionIdForSetup(profile = null, { trustLocalState = true } = {}) {
  const storedHomeRegionId = getStoredHomeRegionId(profile, { trustLocalState });
  if (storedHomeRegionId) return storedHomeRegionId;
  const availableRegionId = await pickAvailableStartingRegionId();
  if (availableRegionId) return availableRegionId;
  throw new Error(`No starter, midgame, or endgame map has ${MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES} neutral cities available.`);
}

function createWorldTerrainBlockers() {
  const blockerSpecs = [
    ["center", "crownspine", "Crownspine", 0.06, -0.42, 410, 175, -0.12],
    ["center", "elder-crags", "Elder Crags", -0.36, 0.18, 320, 145, 0.35],
    ["center", "dragonback", "Dragonback Peaks", 0.43, 0.26, 360, 155, -0.2],
    ["north", "frostfang", "Frostfang Ridge", -0.3, -0.18, 360, 145, 0.12],
    ["north", "whitehorn", "Whitehorn", 0.36, 0.16, 300, 120, -0.22],
    ["south", "sunken-crags", "Sunken Crags", -0.35, 0.1, 330, 130, 0.22],
    ["south", "saltstone", "Saltstone Rise", 0.34, -0.18, 300, 125, -0.15],
    ["west", "wolfspine", "Wolfspine", -0.16, -0.36, 260, 150, 0.52],
    ["west", "greenfang", "Greenfang", 0.2, 0.28, 260, 120, -0.35],
    ["east", "goldhorn", "Goldhorn", -0.18, 0.32, 260, 120, 0.28],
    ["east", "redspine", "Redspine", 0.24, -0.34, 280, 140, -0.45],
  ];

  return blockerSpecs
    .map(([regionId, id, label, ox, oy, rx, ry, rot]) => {
      const region = getRegionById(regionId);
      if (!region) return null;
      return {
        id,
        regionId,
        type: "mountain",
        label,
        x: region.x + region.cityRx * ox,
        y: region.y + region.cityRy * oy,
        rx,
        ry,
        rot,
      };
    })
    .filter(Boolean);
}

function createWorldNoCityTerrain() {
  const terrainSpecs = [
    ["center", "forest-center-nw", "forest", "Old Crownwood", -0.48, -0.32, 430, 190, -0.18],
    ["center", "forest-center-se", "forest", "Greenmere Woods", 0.5, 0.34, 420, 170, 0.18],
    ["center", "swamp-center-s", "swamp", "Mossfen", -0.04, 0.58, 430, 165, 0.02],
    ["north", "forest-north-w", "forest", "Pine Crown", -0.42, 0.24, 390, 150, 0.1],
    ["north", "forest-north-e", "forest", "Frostwood", 0.38, -0.28, 360, 140, -0.22],
    ["south", "swamp-south-w", "swamp", "Sunken Marsh", -0.48, -0.16, 400, 165, -0.12],
    ["south", "forest-south-e", "forest", "Salt Pines", 0.42, 0.22, 370, 150, 0.16],
    ["west", "forest-west-n", "forest", "Westwood", -0.22, -0.18, 350, 190, -0.08],
    ["west", "forest-west-s", "forest", "Ashen Grove", 0.18, 0.42, 330, 165, 0.22],
    ["east", "forest-east-n", "forest", "Dawnwood", 0.26, -0.38, 330, 165, -0.2],
    ["east", "forest-east-s", "forest", "Lion Grove", -0.22, 0.28, 340, 155, 0.18],
  ];

  return terrainSpecs
    .map(([regionId, id, type, label, ox, oy, rx, ry, rot]) => {
      const region = getRegionById(regionId);
      if (!region) return null;
      return {
        id,
        regionId,
        type,
        label,
        x: region.x + region.cityRx * ox,
        y: region.y + region.cityRy * oy,
        rx,
        ry,
        rot,
      };
    })
    .filter(Boolean);
}

function createSeededRandom(seed) {
  let hash = 2166136261;
  for (let i = 0; i < String(seed).length; i++) {
    hash ^= String(seed).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6D2B79F5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generateWorldCitySlots() {
  const cities = [];
  for (const region of WORLD_REGIONS) {
    const regionCities = generateRegionCitySlots(region, getRegionCityCount(region));
    cities.push(...regionCities);
  }
  cities.push(...generateStrongholdSlots());
  return cities;
}

function getEditorPoint(item) {
  const point = item?.point && typeof item.point === "object" ? item.point : item;
  return {
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
  };
}

function getEditorCityDefinitions(regionId) {
  const map = getEditorMap(regionId);
  return Array.isArray(map?.cities) ? map.cities : [];
}

function hasEditorCityDefinitions(regionId) {
  return Array.isArray(getEditorMap(regionId)?.cities);
}

function createEditorCitySlot(region, city, index) {
  const chosen = islandImagePointToWorld(region.id, getEditorPoint(city));
  return {
    id: String(city?.id || `${region.id}_${String(index + 1).padStart(3, "0")}`),
    name: generateCityName(region, index),
    regionId: region.id,
    startPool: region.id,
    x: Math.round(chosen.x),
    y: Math.round(chosen.y),
    owner: "neutral",
    level: Math.max(1, Math.floor(Number(city?.level) || 1)),
    troops: Math.max(0, Math.floor(Number(city?.troops) || NEUTRAL_START_TROOPS)),
    defense: 1,
  };
}

function generateEditorIslandCitySlots(region, count) {
  const cities = getEditorCityDefinitions(region.id);
  if (!hasEditorCityDefinitions(region.id)) return null;
  return cities.slice(0, count).map((city, index) => createEditorCitySlot(region, city, index));
}

function getEditorObjectiveDefinitions(regionId) {
  const map = getEditorMap(regionId);
  return Array.isArray(map?.objectives) ? map.objectives : [];
}

function hasEditorObjectiveDefinitions(regionId) {
  return Array.isArray(getEditorMap(regionId)?.objectives);
}

function getEditorCampDefinitions(regionId) {
  const map = getEditorMap(regionId);
  return Array.isArray(map?.camps) ? map.camps : [];
}

function getCampConfigForType(type) {
  const campType = String(type || "gold").trim().toLowerCase();
  if (campType === "troops" || campType === "troop") {
    return { type: "troops", name: "Warband Camp", artSrc: "assets/camps/troops.png" };
  }
  if (campType === "items" || campType === "item" || campType === "relic") {
    return { type: "items", name: "Relic Camp", artSrc: "assets/camps/items.png" };
  }
  if (campType === "deed" || campType === "city_deed") {
    return { type: "deed", name: "Deed Camp", artSrc: "assets/camps/deed.png" };
  }
  return { type: "gold", name: "Gold Camp", artSrc: "assets/camps/gold.png" };
}

function getRewardCampConfig(campOrType = {}) {
  const camp = typeof campOrType === "object" && campOrType ? campOrType : null;
  const rawType = typeof campOrType === "string"
    ? campOrType
    : campOrType?.campType
      || (campOrType?.kind === "warbandCamp" ? "troops" : "")
      || (campOrType?.kind === "relicCamp" ? "items" : "")
      || (campOrType?.kind === "goldCamp" || campOrType?.targetType === "camp" ? "gold" : "");
  const normalizedType = String(rawType || "").trim().toLowerCase();
  const campType = normalizedType === "relic" || normalizedType === "item"
    ? "items"
    : normalizedType === "troop"
      ? "troops"
      : normalizedType;
  const base = REWARD_CAMP_CONFIG[campType] || null;
  if (!base || !camp) return base;
  const rawMaxDailyRewards = Number(camp.maxDailyRewards);
  const rewardSchedule = Array.isArray(camp.rewardSchedule) && camp.rewardSchedule.length
    ? camp.rewardSchedule.map(entry => ({
        minimumReward: Math.max(0, Math.floor(Number(entry?.minimumReward) || 0)),
        productionHours: Math.max(0, Number(entry?.productionHours) || 0),
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
    maxDailyRewards: Math.max(
      0,
      Math.floor(Number.isFinite(rawMaxDailyRewards) ? rawMaxDailyRewards : (base.maxDailyRewards || 0))
    ),
  };
}

function getStrongholdConfigForType(type) {
  const strongholdType = String(type || "gold").trim().toLowerCase();
  if (strongholdType === "crown" || strongholdType === "crown_citadel") {
    return {
      type: "crown",
      name: CROWN_CITADEL_NAME,
      artSrc: CROWN_CITADEL_ART_SRC,
      bonus: "crownDominion",
      bonusPercent: CROWN_CITADEL_GOLD_BONUS_PERCENT,
      level: CROWN_CITADEL_LEVEL,
      troops: CROWN_CITADEL_START_TROOPS,
    };
  }
  if (strongholdType === "training" || strongholdType === "troop" || strongholdType === "troop_stronghold") {
    return {
      type: "training",
      name: TRAINING_STRONGHOLD_NAME,
      artSrc: TRAINING_STRONGHOLD_ART_SRC,
      bonus: "troopProduction",
      bonusPercent: TRAINING_STRONGHOLD_BONUS_PERCENT,
      level: TRAINING_STRONGHOLD_LEVEL,
      troops: TRAINING_STRONGHOLD_START_TROOPS,
    };
  }
  if (strongholdType === "speed" || strongholdType === "march_speed" || strongholdType === "march_speed_stronghold") {
    return {
      type: "speed",
      name: SPEED_STRONGHOLD_NAME,
      artSrc: SPEED_STRONGHOLD_ART_SRC,
      bonus: "marchSpeed",
      bonusPercent: SPEED_STRONGHOLD_BONUS_PERCENT,
      level: SPEED_STRONGHOLD_LEVEL,
      troops: SPEED_STRONGHOLD_START_TROOPS,
    };
  }
  if (strongholdType === "defense" || strongholdType === "defense_stronghold") {
    return {
      type: "defense",
      name: DEFENSE_STRONGHOLD_NAME,
      artSrc: DEFENSE_STRONGHOLD_ART_SRC,
      bonus: "cityDefense",
      bonusPercent: DEFENSE_STRONGHOLD_BONUS_PERCENT,
      level: DEFENSE_STRONGHOLD_LEVEL,
      troops: DEFENSE_STRONGHOLD_START_TROOPS,
    };
  }
  return {
    type: "gold",
    name: GOLD_STRONGHOLD_NAME,
    artSrc: GOLD_STRONGHOLD_ART_SRC,
    bonus: "goldProduction",
    bonusPercent: GOLD_STRONGHOLD_BONUS_PERCENT,
    level: GOLD_STRONGHOLD_LEVEL,
    troops: GOLD_STRONGHOLD_START_TROOPS,
  };
}

function generateEditorStrongholdSlots() {
  const slots = [];
  let hasAnyEditorObjectives = false;
  for (const region of WORLD_REGIONS) {
    if (hasEditorObjectiveDefinitions(region.id)) hasAnyEditorObjectives = true;
    const objectives = getEditorObjectiveDefinitions(region.id);
    objectives.forEach((objective, index) => {
      const config = getStrongholdConfigForType(objective?.type || objective?.strongholdType);
      const point = islandImagePointToWorld(region.id, getEditorPoint(objective));
      slots.push(createStrongholdSlot({
        id: String(objective?.id || `${region.id}_${config.type}_stronghold_${index + 1}`),
        name: String(objective?.name || config.name),
        region,
        point,
        type: String(objective?.type || objective?.strongholdType || config.type),
        bonus: String(objective?.bonus || config.bonus),
        bonusPercent: Math.max(0, Math.floor(Number(objective?.bonusPercent) || config.bonusPercent)),
        level: Math.max(1, Math.floor(Number(objective?.level) || config.level)),
        troops: Math.max(0, Math.floor(Number(objective?.troops || objective?.startTroops) || config.troops)),
        artSrc: String(objective?.artSrc || config.artSrc || ""),
        size: islandImageVisualSizeToWorld(region.id, objective?.size, DEFAULT_STRONGHOLD_VISUAL_SIZE),
      }));
    });
  }
  return hasAnyEditorObjectives ? slots : null;
}

function generateWorldCampSlots() {
  const slots = [];
  for (const region of WORLD_REGIONS) {
    const camps = getEditorCampDefinitions(region.id);
    camps.forEach((camp, index) => {
      const config = getCampConfigForType(camp?.campType || camp?.type);
      const point = islandImagePointToWorld(region.id, getEditorPoint(camp));
      slots.push({
        id: String(camp?.id || `${region.id}_${config.type}_camp_${index + 1}`),
        name: String(camp?.name || config.name),
        regionId: region.id,
        x: Math.round(point.x),
        y: Math.round(point.y),
        campType: config.type,
        artSrc: String(camp?.artSrc || config.artSrc),
        size: islandImageVisualSizeToWorld(region.id, camp?.size, DEFAULT_CAMP_VISUAL_SIZE),
        rewardSchedule: Array.isArray(camp?.rewardSchedule)
          ? camp.rewardSchedule.map(entry => ({
              minimumReward: Math.max(0, Math.floor(Number(entry?.minimumReward) || 0)),
              productionHours: Math.max(0, Number(entry?.productionHours) || 0),
            }))
          : undefined,
        maxDailyRewards: Number.isFinite(Number(camp?.maxDailyRewards))
          ? Math.max(0, Math.floor(Number(camp.maxDailyRewards)))
          : undefined,
      });
    });
  }
  return slots;
}

function generateStrongholdSlots() {
  const editorSlots = generateEditorStrongholdSlots();
  if (editorSlots) return editorSlots;
  const west = getRegionById("west");
  const north = getRegionById("north");
  const east = getRegionById("east");
  const south = getRegionById("south");
  const center = getRegionById("center");
  return [
    west ? createStrongholdSlot({
      id: GOLD_STRONGHOLD_ID,
      name: GOLD_STRONGHOLD_NAME,
      region: west,
      point: westImagePointToWorld(WEST_GOLD_STRONGHOLD_IMAGE_POINT),
      type: "gold",
      bonus: "goldProduction",
      bonusPercent: GOLD_STRONGHOLD_BONUS_PERCENT,
      level: GOLD_STRONGHOLD_LEVEL,
      troops: GOLD_STRONGHOLD_START_TROOPS,
    }) : null,
    north ? createStrongholdSlot({
      id: TRAINING_STRONGHOLD_ID,
      name: TRAINING_STRONGHOLD_NAME,
      region: north,
      point: northImagePointToWorld(NORTH_TRAINING_STRONGHOLD_IMAGE_POINT),
      type: "training",
      bonus: "troopProduction",
      bonusPercent: TRAINING_STRONGHOLD_BONUS_PERCENT,
      level: TRAINING_STRONGHOLD_LEVEL,
      troops: TRAINING_STRONGHOLD_START_TROOPS,
    }) : null,
    east ? createStrongholdSlot({
      id: SPEED_STRONGHOLD_ID,
      name: SPEED_STRONGHOLD_NAME,
      region: east,
      point: eastImagePointToWorld(EAST_SPEED_STRONGHOLD_IMAGE_POINT),
      type: "speed",
      bonus: "marchSpeed",
      bonusPercent: SPEED_STRONGHOLD_BONUS_PERCENT,
      level: SPEED_STRONGHOLD_LEVEL,
      troops: SPEED_STRONGHOLD_START_TROOPS,
    }) : null,
    south ? createStrongholdSlot({
      id: DEFENSE_STRONGHOLD_ID,
      name: DEFENSE_STRONGHOLD_NAME,
      region: south,
      point: southImagePointToWorld(SOUTH_DEFENSE_STRONGHOLD_IMAGE_POINT),
      type: "defense",
      bonus: "cityDefense",
      bonusPercent: DEFENSE_STRONGHOLD_BONUS_PERCENT,
      level: DEFENSE_STRONGHOLD_LEVEL,
      troops: DEFENSE_STRONGHOLD_START_TROOPS,
    }) : null,
    center ? createStrongholdSlot({
      id: CROWN_CITADEL_ID,
      name: CROWN_CITADEL_NAME,
      region: center,
      point: centerImagePointToWorld(CENTER_CROWN_CITADEL_IMAGE_POINT),
      type: "crown",
      bonus: "crownDominion",
      bonusPercent: CROWN_CITADEL_GOLD_BONUS_PERCENT,
      level: CROWN_CITADEL_LEVEL,
      troops: CROWN_CITADEL_START_TROOPS,
      size: CROWN_CITADEL_VISUAL_SIZE,
      artSrc: CROWN_CITADEL_ART_SRC,
    }) : null,
  ].filter(Boolean);
}

function createStrongholdSlot({ id, name, region, point, type, bonus, bonusPercent, level, troops, size = DEFAULT_STRONGHOLD_VISUAL_SIZE, artSrc = "" }) {
  const visualSize = getStrongholdVisualSize({ size });
  return {
    id,
    name,
    regionId: region.id,
    startPool: region.id,
    x: Math.round(point.x),
    y: Math.round(point.y),
    owner: "neutral",
    ownerKind: "neutral",
    ownerUid: null,
    ownerName: "",
    ownerFlag: null,
    ownerKingPower: 0,
    level,
    troops,
    troopFloat: troops,
    defense: 1,
    investedGold: 0,
    lastCapturedAt: null,
    isMainCity: false,
    relinquishedAtMs: 0,
    relocatedAtMs: 0,
    kind: "stronghold",
    strongholdType: type,
    bonus,
    bonusPercent,
    size: visualSize,
    artSrc,
    startTroops: troops,
  };
}

function getRegionCityCount(region) {
  if (hasEditorCityDefinitions(region?.id)) return getEditorCityDefinitions(region?.id).length;
  const editorMap = getEditorMap(region?.id);
  const editorCount = Math.floor(Number(editorMap?.cityCount) || 0);
  if (editorCount > 0) return editorCount;
  return region?.id === "center" ? CENTER_REGION_CITY_COUNT : REGION_CITY_COUNT;
}

function generateRegionCitySlots(region, count) {
  const editorSlots = generateEditorIslandCitySlots(region, count);
  if (editorSlots) return editorSlots;
  if (region.id === "west") return generateWestIslandCitySlots(region, count);
  if (region.id === "north") return generateNorthIslandCitySlots(region, count);
  if (region.id === "east") return generateEastIslandCitySlots(region, count);
  if (region.id === "south") return generateSouthIslandCitySlots(region, count);
  if (region.id === "center") return generateCenterIslandCitySlots(region, count);
  const cities = [];
  const random = createSeededRandom(`crownlands:${WORLD_SCHEMA_VERSION}:${region.id}`);
  const minSpacing = region.id === "center" ? 132 : 112;
  const relaxedSpacing = region.id === "center" ? 88 : 76;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index++) {
    let chosen = null;
    for (let attempt = 0; attempt < 160; attempt++) {
      const ring = Math.sqrt((index + 0.5 + attempt * 0.17) / count);
      const jitter = 0.86 + random() * 0.22;
      const angle = index * goldenAngle + attempt * 0.51 + region.rot;
      const candidate = {
        x: Math.round(region.x + Math.cos(angle) * region.cityRx * ring * jitter + (random() - 0.5) * 85),
        y: Math.round(region.y + Math.sin(angle) * region.cityRy * ring * jitter + (random() - 0.5) * 85),
      };
      const requiredSpacing = attempt < 90 ? minSpacing : relaxedSpacing;
      if (!isValidCityPlacementPoint(candidate.x, candidate.y)) continue;
      if (cities.some(city => Math.hypot(city.x - candidate.x, city.y - candidate.y) < requiredSpacing)) continue;
      chosen = candidate;
      break;
    }

    if (!chosen) {
      chosen = findFallbackCityPoint(region, cities, random, relaxedSpacing);
    }

    cities.push({
      id: `${region.id}_${String(index + 1).padStart(3, "0")}`,
      name: generateCityName(region, index),
      regionId: region.id,
      startPool: region.id,
      x: chosen.x,
      y: chosen.y,
      owner: "neutral",
      level: 1,
      troops: NEUTRAL_START_TROOPS,
      defense: 1,
    });
  }

  return cities;
}

function generateWestIslandCitySlots(region, count) {
  return WEST_ISLAND_CITY_POINTS.slice(0, count).map((point, index) => {
    const chosen = westImagePointToWorld(point);
    return {
      id: `${region.id}_${String(index + 1).padStart(3, "0")}`,
      name: generateCityName(region, index),
      regionId: region.id,
      startPool: region.id,
      x: Math.round(chosen.x),
      y: Math.round(chosen.y),
      owner: "neutral",
      level: 1,
      troops: NEUTRAL_START_TROOPS,
      defense: 1,
    };
  });
}

function generateNorthIslandCitySlots(region, count) {
  return NORTH_ISLAND_CITY_POINTS.slice(0, count).map((point, index) => {
    const chosen = northImagePointToWorld(point);
    return {
      id: `${region.id}_${String(index + 1).padStart(3, "0")}`,
      name: generateCityName(region, index),
      regionId: region.id,
      startPool: region.id,
      x: Math.round(chosen.x),
      y: Math.round(chosen.y),
      owner: "neutral",
      level: 1,
      troops: NEUTRAL_START_TROOPS,
      defense: 1,
    };
  });
}

function generateEastIslandCitySlots(region, count) {
  return EAST_ISLAND_CITY_POINTS.slice(0, count).map((point, index) => {
    const chosen = eastImagePointToWorld(point);
    return {
      id: `${region.id}_${String(index + 1).padStart(3, "0")}`,
      name: generateCityName(region, index),
      regionId: region.id,
      startPool: region.id,
      x: Math.round(chosen.x),
      y: Math.round(chosen.y),
      owner: "neutral",
      level: 1,
      troops: NEUTRAL_START_TROOPS,
      defense: 1,
    };
  });
}

function generateSouthIslandCitySlots(region, count) {
  return SOUTH_ISLAND_CITY_POINTS.slice(0, count).map((point, index) => {
    const chosen = southImagePointToWorld(point);
    return {
      id: `${region.id}_${String(index + 1).padStart(3, "0")}`,
      name: generateCityName(region, index),
      regionId: region.id,
      startPool: region.id,
      x: Math.round(chosen.x),
      y: Math.round(chosen.y),
      owner: "neutral",
      level: 1,
      troops: NEUTRAL_START_TROOPS,
      defense: 1,
    };
  });
}

function generateCenterIslandCitySlots(region, count) {
  return CENTER_ISLAND_CITY_POINTS.slice(0, count).map((point, index) => {
    const chosen = centerImagePointToWorld(point);
    return {
      id: `${region.id}_${String(index + 1).padStart(3, "0")}`,
      name: generateCityName(region, index),
      regionId: region.id,
      startPool: region.id,
      x: Math.round(chosen.x),
      y: Math.round(chosen.y),
      owner: "neutral",
      level: 1,
      troops: NEUTRAL_START_TROOPS,
      defense: 1,
    };
  });
}

function findFallbackCityPoint(region, existingCities, random, spacing) {
  let anyValidPoint = null;
  for (let attempt = 0; attempt < 800; attempt++) {
    const angle = random() * Math.PI * 2;
    const reserveRatio = getRegionStrongholdReserveRatio(region);
    const radius = reserveRatio + (Math.sqrt(random()) * Math.max(0, 0.96 - reserveRatio));
    const candidate = {
      x: Math.round(region.x + Math.cos(angle) * region.cityRx * radius),
      y: Math.round(region.y + Math.sin(angle) * region.cityRy * radius),
    };
    if (!isValidCityPlacementPoint(candidate.x, candidate.y)) continue;
    anyValidPoint = anyValidPoint || candidate;
    if (existingCities.some(city => Math.hypot(city.x - candidate.x, city.y - candidate.y) < spacing)) continue;
    return candidate;
  }

  return anyValidPoint || { x: Math.round(region.x), y: Math.round(region.y + region.cityRy * 0.45) };
}

function getRegionStrongholdReserveRatio(region) {
  const ratio = Number(region?.strongholdReserveRatio ?? WORLD_CONFIG.strongholdReserveRatio ?? 0);
  return clamp(ratio, 0, 0.7);
}

function isWorldStrongholdReservePoint(x, y) {
  return WORLD_REGIONS.some(region => {
    const ratio = getRegionStrongholdReserveRatio(region);
    if (ratio <= 0) return false;
    return pointInEllipse(x, y, {
      x: region.x,
      y: region.y,
      rx: region.cityRx * ratio,
      ry: region.cityRy * ratio,
      rot: region.rot || 0,
    }, 76);
  });
}

const MEDIEVAL_CITY_PREFIXES = [
  "Alder", "Ash", "Barrow", "Bell", "Black", "Briar", "Brindle", "Brook", "Cedar", "Crow",
  "Dun", "Elder", "Ember", "Fair", "Fen", "Flint", "Green", "Grey", "Hart", "High",
  "Iron", "Kings", "Low", "Oak", "Raven", "Red", "Silver", "Stone", "Thorn", "Vale",
  "White", "Wolf", "Wyvern",
];
const MEDIEVAL_REGION_PREFIXES = {
  center: ["Crown", "Lion", "Regal", "Scepter", "Royal", "Queen", "King", "High", "Gold", "Star"],
  north: ["Frost", "Snow", "Pine", "Winter", "Storm", "Moon", "Peak", "Cold", "Cloud", "Hawk"],
  south: ["Sun", "Salt", "Reed", "Willow", "Rose", "Marsh", "Tide", "Warm", "Bloom", "Pearl"],
  west: ["Oak", "Thorn", "Fox", "Ash", "Briar", "Crow", "Wild", "Wood", "Moss", "Fern"],
  east: ["Dawn", "Gold", "Bright", "Falcon", "Rose", "Wind", "Star", "Pearl", "Blue", "Ivory"],
};
const MEDIEVAL_CITY_SUFFIXES = [
  "bury", "ford", "wick", "stead", "mere", "brook", "hollow", "watch", "gate", "fall",
  "bridge", "market", "vale", "den", "field", "worth", "cross", "moor", "reach", "cliffe",
  "hurst", "wall", "ham", "port",
];
const MEDIEVAL_CITY_TITLES = [
  "Abbey", "Cross", "Gate", "March", "Market", "Mead", "Moor", "Rest", "Rise", "Watch",
];

function getCityNameIndex(cityId, fallbackIndex = 0) {
  const match = String(cityId || "").match(/_(\d+)$/);
  if (match) return Math.max(0, Math.floor(Number(match[1]) || 1) - 1);
  if (Number.isFinite(Number(fallbackIndex))) return Math.max(0, Math.floor(Number(fallbackIndex) || 0));
  return hashString(cityId || "city") % 997;
}

function generateCityName(region, index, cityId = "") {
  const regionId = normalizeRegionId(region?.id || region) || "center";
  const cityIndex = getCityNameIndex(cityId, index);
  const prefixes = [...new Set([...MEDIEVAL_CITY_PREFIXES, ...(MEDIEVAL_REGION_PREFIXES[regionId] || [])])];
  const comboCount = prefixes.length * MEDIEVAL_CITY_SUFFIXES.length;
  const offset = hashString(`medieval-city:${regionId}`) % comboCount;
  const comboIndex = (cityIndex * 487 + offset) % comboCount;
  const prefix = prefixes[comboIndex % prefixes.length];
  const suffix = MEDIEVAL_CITY_SUFFIXES[Math.floor(comboIndex / prefixes.length) % MEDIEVAL_CITY_SUFFIXES.length];
  const title = MEDIEVAL_CITY_TITLES[(cityIndex * 191 + offset) % MEDIEVAL_CITY_TITLES.length];
  return cityIndex % 5 === 0 ? `${prefix}${suffix} ${title}` : `${prefix}${suffix}`;
}

function getCanonicalCityName(base = {}, fallback = null) {
  const fallbackRecord = fallback && typeof fallback === "object" ? fallback : {};
  const source = { ...fallbackRecord, ...base };
  if (isStronghold(source)) return getStrongholdDisplayName(source);
  const regionId = normalizeRegionId(source.regionId || source.startPool || fallbackRecord.regionId || fallbackRecord.startPool);
  const region = getRegionById(regionId) || { id: regionId || "center" };
  const cityId = source.id || fallbackRecord.id || "";
  const index = getCityNameIndex(cityId, source.index);
  return generateCityName(region, index, cityId);
}

function pointInWorldRegion(x, y, region, padding = 0) {
  return pointInEllipse(x, y, {
    x: region.x,
    y: region.y,
    rx: region.rx + padding,
    ry: region.ry + padding,
    rot: region.rot || 0,
  });
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function pointInLandBridge(x, y, bridge, padding = 0) {
  return distanceToSegment(x, y, bridge.from.x, bridge.from.y, bridge.to.x, bridge.to.y) <= bridge.width / 2 + padding;
}

function isWorldLandPoint(x, y, padding = 0) {
  if (x < 0 || y < 0 || x > WORLD_WIDTH || y > WORLD_HEIGHT) return false;
  for (const regionId of BITMAP_ISLAND_IDS) {
    const bounds = getIslandMapBounds(regionId);
    const isInsideMap = x >= bounds.left - padding
      && x <= bounds.right + padding
      && y >= bounds.top - padding
      && y <= bounds.bottom + padding;
    if (isInsideMap && isBitmapRegionLandPoint(regionId, x, y, padding)) return true;
  }
  const bitmapIds = new Set(BITMAP_ISLAND_IDS);
  return WORLD_REGIONS.some(region => !bitmapIds.has(cleanEditorRegionId(region.id)) && pointInWorldRegion(x, y, region, padding))
    || LAND_BRIDGES.some(bridge => pointInLandBridge(x, y, bridge, padding));
}

function applyWorldDimensions() {
  const bounds = getActiveMapBounds();
  const width = `${bounds.width}px`;
  const height = `${bounds.height}px`;
  [mapWorld, harvestLayer, portalLayer, cityLayer, armyLayer].forEach(element => {
    if (!element) return;
    element.style.width = width;
    element.style.height = height;
  });
  [pathsSvg].forEach(svg => {
    if (!svg) return;
    svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  });
  return bounds;
}

function syncMapSurfaceToActiveIsland(force = false) {
  const bounds = applyWorldDimensions();
  const signature = `${bounds.regionId}:${bounds.left}:${bounds.top}:${bounds.width}:${bounds.height}`;
  if (!force && signature === renderedMapBoundsSignature) return;
  renderedMapRegionId = bounds.regionId;
  renderedMapBoundsSignature = signature;
  if (mapFrame) {
    mapFrame.dataset.region = bounds.regionId;
    mapFrame.setAttribute("aria-label", `${getRegionLabel(bounds.regionId)} map`);
  }
  renderWorldMap();
  renderIslandTeleporters();
  preloadNearbyIslandMaps(bounds.regionId);
  cityRenderSignature = "";
  pathRenderSignature = "";
}

function getIslandMapArtSrc(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  const editorSrc = getEditorMapImageSrc(targetRegionId);
  if (editorSrc) return editorSrc;
  if (targetRegionId === "west") return WEST_ISLAND_ART_SRC;
  if (targetRegionId === "north") return NORTH_ISLAND_ART_SRC;
  if (targetRegionId === "east") return EAST_ISLAND_ART_SRC;
  if (targetRegionId === "south") return SOUTH_ISLAND_ART_SRC;
  if (targetRegionId === "center") return CENTER_ISLAND_ART_SRC;
  return "";
}

function getIslandPreviewArtSrc(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  const editorSrc = getEditorMapPreviewSrc(targetRegionId);
  if (editorSrc) return editorSrc;
  if (targetRegionId === "west") return WEST_ISLAND_THUMB_SRC;
  if (targetRegionId === "north") return NORTH_ISLAND_THUMB_SRC;
  if (targetRegionId === "east") return EAST_ISLAND_THUMB_SRC;
  if (targetRegionId === "south") return SOUTH_ISLAND_THUMB_SRC;
  if (targetRegionId === "center") return CENTER_ISLAND_THUMB_SRC;
  return CENTER_ISLAND_THUMB_SRC;
}

function preloadImage(src, { fetchPriority = "auto" } = {}) {
  const imageSrc = String(src || "");
  if (!imageSrc) return Promise.resolve(false);
  if (loadedImageAssets.has(imageSrc)) return Promise.resolve(true);
  if (islandImageLoadPromises.has(imageSrc)) {
    if (fetchPriority === "high") {
      const pendingImage = islandImagePreloadElements.get(imageSrc);
      if (pendingImage) pendingImage.fetchPriority = "high";
    }
    return islandImageLoadPromises.get(imageSrc);
  }

  const promise = new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const finish = success => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      islandImagePreloadElements.delete(imageSrc);
      if (!success) islandImageLoadPromises.delete(imageSrc);
      resolve(success);
    };
    const timeoutId = window.setTimeout(() => finish(false), IMAGE_PRELOAD_TIMEOUT_MS);
    image.decoding = "async";
    image.loading = "eager";
    image.fetchPriority = fetchPriority;
    islandImagePreloadElements.set(imageSrc, image);
    image.onload = () => {
      const decodePromise = typeof image.decode === "function" ? image.decode().catch(() => {}) : Promise.resolve();
      decodePromise.finally(() => {
        loadedImageAssets.add(imageSrc);
        finish(true);
      });
    };
    image.onerror = () => finish(false);
    image.src = imageSrc;
  });
  islandImageLoadPromises.set(imageSrc, promise);
  return promise;
}

function preloadIslandMap(regionId, options = {}) {
  const targetRegionId = normalizeRegionId(regionId);
  return preloadImage(getIslandMapArtSrc(targetRegionId), options).then(success => {
    if (success) preloadedMapRegions.add(targetRegionId);
    return success;
  });
}

function getConnectedIslandRegionIds(regionId) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const connected = new Set();
  getIslandMapConnectionEdges().forEach(edge => {
    if (edge.source === normalizedRegionId) connected.add(edge.target);
    if (edge.target === normalizedRegionId) connected.add(edge.source);
  });
  return Array.from(connected).filter(id => id && id !== normalizedRegionId);
}

function preloadNearbyIslandMaps(regionId) {
  const normalizedRegionId = normalizeRegionId(regionId);
  if (nearbyIslandPreloadRegions.has(normalizedRegionId)) return;
  nearbyIslandPreloadRegions.add(normalizedRegionId);
  const connectedRegionIds = getConnectedIslandRegionIds(normalizedRegionId).slice(0, 4);
  const scheduleIdle = callback => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(callback, { timeout: 2500 });
    } else {
      window.setTimeout(callback, 1200);
    }
  };
  const preloadNext = index => {
    if (index >= connectedRegionIds.length) return;
    preloadIslandMap(connectedRegionIds[index], { fetchPriority: "low" })
      .catch(() => false)
      .finally(() => scheduleIdle(() => preloadNext(index + 1)));
  };
  scheduleIdle(() => preloadNext(0));
}

function setSetupLoading(active, detail = "") {
  const isActive = Boolean(active);
  if (setupScreen) setupScreen.classList.toggle("loading", isActive);
  if (menuLoadingWheel) menuLoadingWheel.hidden = !isActive;
  if (isActive && detail && onlineStatusDetail) {
    onlineStatusDetail.textContent = detail;
  }
}

function waitForSetupLoadingPaint(minMs = SETUP_LOADING_MIN_MS) {
  const startedAt = performance.now();
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const remainingMs = Math.max(0, minMs - (performance.now() - startedAt));
        window.setTimeout(resolve, remainingMs);
      });
    });
  });
}

function setMapSwitchLoading(label = "") {
  if (!mapFrame) return;
  mapSwitchLoading = true;
  activePointers.clear();
  panState = null;
  pinchState = null;
  mapFrame.classList.remove("dragging");
  const loadingLabel = label ? String(label) : "Loading island...";
  mapFrame.dataset.loadingLabel = loadingLabel;
  if (mapLoadingLabel) mapLoadingLabel.textContent = loadingLabel;
  mapFrame.classList.add("map-switching");
}

function clearMapSwitchLoading() {
  mapSwitchLoading = false;
  if (!mapFrame) return;
  mapFrame.classList.remove("map-switching");
  delete mapFrame.dataset.loadingLabel;
  if (mapLoadingLabel) mapLoadingLabel.textContent = "Loading island...";
}

function isMapInteractionBlocked() {
  return Boolean(onlineWorldLoading || mapSwitchLoading);
}

function updateMapDensityMode(visibleCityCount = null, visibleArmyCount = null) {
  if (!mapFrame) return;
  const hasCityCount = visibleCityCount !== null && visibleCityCount !== undefined && Number.isFinite(Number(visibleCityCount));
  const hasArmyCount = visibleArmyCount !== null && visibleArmyCount !== undefined && Number.isFinite(Number(visibleArmyCount));
  if (hasCityCount) visibleCityDensityCount = Math.max(0, Number(visibleCityCount));
  if (hasArmyCount) visibleArmyDensityCount = Math.max(0, Number(visibleArmyCount));
  const shouldEnable = shouldUseCrowdedMapPerformance(
    crowdedMapDensityEnabled,
    visibleCityDensityCount,
    visibleArmyDensityCount,
  );
  if (shouldEnable === crowdedMapDensityEnabled) return;
  crowdedMapDensityEnabled = shouldEnable;
  mapFrame.classList.toggle("crowded-map", shouldEnable);
}

function shouldUseCrowdedMapPerformance(currentlyEnabled, cityCount, armyCount) {
  const cityThreshold = currentlyEnabled
    ? CROWDED_MAP_CITY_EXIT_THRESHOLD
    : CROWDED_MAP_CITY_THRESHOLD;
  const armyThreshold = currentlyEnabled
    ? CROWDED_MAP_ARMY_EXIT_THRESHOLD
    : CROWDED_MAP_ARMY_THRESHOLD;
  return Math.max(0, Number(cityCount) || 0) >= cityThreshold
    || Math.max(0, Number(armyCount) || 0) >= armyThreshold;
}

function setImageMapBackground(regionId, imageSrc) {
  if (!mapBg || !imageSrc) return;
  const targetRegionId = normalizeRegionId(regionId);
  const activeImage = mapBg.querySelector(".island-art-map.active");
  if (
    mapBg.dataset.imageRegion === targetRegionId
    && mapBg.dataset.imageSrc === imageSrc
    && activeImage?.getAttribute("src") === imageSrc
  ) {
    return;
  }

  const swapToken = ++mapImageSwapToken;
  mapBg.dataset.imageRegion = targetRegionId;
  mapBg.dataset.imageSrc = imageSrc;

  preloadImage(imageSrc, { fetchPriority: "high" }).then(async success => {
    if (!mapBg || swapToken !== mapImageSwapToken || !success) {
      return;
    }
    const image = document.createElement("img");
    image.className = `island-art-map ${targetRegionId}-island-art active`;
    image.src = imageSrc;
    image.dataset.imageRegion = targetRegionId;
    image.dataset.imageSrc = imageSrc;
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    image.loading = "eager";
    image.fetchPriority = "high";
    try {
      await image.decode();
    } catch (_error) {
      if (!image.complete) {
        await new Promise(resolve => {
          image.onload = resolve;
          image.onerror = resolve;
        });
      }
    }
    if (!mapBg || swapToken !== mapImageSwapToken) return;
    requestAnimationFrame(() => {
      if (!mapBg || swapToken !== mapImageSwapToken) return;
      mapBg.replaceChildren(image);
      mapBg.classList.add("image-map-ready");
    });
  });
}

function renderWorldMap() {
  if (!mapBg) return;
  const bounds = getActiveMapBounds();
  mapBg.classList.toggle("west-image-map", bounds.regionId === "west");
  mapBg.classList.toggle("north-image-map", bounds.regionId === "north");
  mapBg.classList.toggle("east-image-map", bounds.regionId === "east");
  mapBg.classList.toggle("south-image-map", bounds.regionId === "south");
  mapBg.classList.toggle("center-image-map", bounds.regionId === "center");
  const islandArtSrc = getIslandMapArtSrc(bounds.regionId);
  if (islandArtSrc) {
    setImageMapBackground(bounds.regionId, islandArtSrc);
    return;
  }
  mapImageSwapToken += 1;
  delete mapBg.dataset.imageRegion;
  delete mapBg.dataset.imageSrc;
  mapBg.classList.remove("image-map-ready");
  const activeRegion = bounds.region;
  const regionTerrain = NO_CITY_TERRAIN.filter(shape => shape.regionId === bounds.regionId);
  const regionMountains = TERRAIN_BLOCKERS.filter(shape => shape.regionId === bounds.regionId);
  mapBg.innerHTML = `
    <svg class="world-map-svg" viewBox="${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}" preserveAspectRatio="none" aria-hidden="true">
      ${renderWorldDefs()}
      <g class="world-sea-layer">${renderSeaSparkles(bounds)}</g>
      <g class="world-island-shores">${renderWorldRegionShore(activeRegion)}</g>
      <g class="world-islands">${renderWorldRegion(activeRegion)}</g>
      <g class="world-land-texture">${renderWorldRegionTexture(activeRegion)}</g>
      <g class="world-details">${regionTerrain.map(renderWorldSoftTerrain).join("")}${regionMountains.map(renderWorldMountain).join("")}</g>
      <g class="world-labels">${renderWorldRegionLabel(activeRegion)}</g>
    </svg>
  `;
}

function renderIslandTeleporters() {
  if (!portalLayer) return;
  portalLayer.innerHTML = "";
  getActiveIslandTeleporters().forEach(teleport => {
    const portalPoint = worldToMapPoint(teleport.worldPoint);
    const buttonElement = document.createElement("button");
    const targetLabel = getRegionLabel(teleport.targetRegionId);
    buttonElement.type = "button";
    buttonElement.className = `teleport-node ${teleport.className || ""}`.trim();
    buttonElement.dataset.targetRegion = teleport.targetRegionId;
    buttonElement.dataset.transitionSide = teleport.side || "";
    buttonElement.style.left = `${portalPoint.x}px`;
    buttonElement.style.top = `${portalPoint.y}px`;
    buttonElement.style.setProperty("--teleport-size", `${getPortalVisualSize(teleport)}px`);
    buttonElement.setAttribute("aria-label", `Go to ${targetLabel}`);
    buttonElement.title = `Go to ${targetLabel}`;
    buttonElement.innerHTML = `
      <img class="teleport-arrow-icon" src="${MAP_SWITCH_ARROW_ICON_SRC}" alt="" draggable="false" decoding="async" aria-hidden="true" />
      <span class="teleport-label">${escapeHtml(teleport.label || targetLabel)}</span>
    `;
    buttonElement.addEventListener("click", event => {
      event.stopPropagation();
      if (isMapInteractionBlocked()) return;
      switchOnlineIsland(teleport.targetRegionId);
    });
    portalLayer.appendChild(buttonElement);
  });
}

function renderHarvestBonuses() {
  if (!harvestLayer) return;
  harvestLayer.innerHTML = "";
  if (!state) return;
  const activeRegionId = getActiveMapRegionId();
  const daily = ensureDailyCaptureTracker();
  getActiveHarvestBonuses(activeRegionId).forEach(bonus => {
    const type = normalizeHarvestBonusType(bonus.type);
    const remaining = getHarvestBonusRemaining(type, daily);
    const label = type === "troops" ? "troop bonus" : "gold bonus";
    const mapPoint = worldToMapPoint(bonus);
    const buttonElement = document.createElement("button");
    buttonElement.type = "button";
    buttonElement.className = `harvest-bonus-node harvest-bonus-${type}`;
    buttonElement.dataset.harvestBonusId = bonus.id;
    buttonElement.dataset.harvestBonusType = type;
    buttonElement.style.left = `${mapPoint.x}px`;
    buttonElement.style.top = `${mapPoint.y}px`;
    buttonElement.disabled = remaining <= 0;
    buttonElement.setAttribute("aria-label", remaining > 0 ? `Harvest ${label}` : `Daily ${label} limit reached`);
    buttonElement.title = remaining > 0
      ? `Harvest ${label} - ${formatNumber(remaining)} left today`
      : `Daily ${label} limit reached`;
    buttonElement.innerHTML = `<span aria-hidden="true">${getHarvestBonusIcon(type)}</span>`;
    buttonElement.addEventListener("click", event => {
      event.stopPropagation();
      collectHarvestBonus(bonus.id);
    });
    harvestLayer.appendChild(buttonElement);
  });
}

function getEditorEdgeConnectionDefinitions(regionId) {
  const map = getEditorMap(regionId);
  const edgeConnections = map?.edgeConnections && typeof map.edgeConnections === "object"
    ? map.edgeConnections
    : {};
  return ["north", "south", "east", "west"].flatMap(side => {
    const zones = Array.isArray(edgeConnections[side]) ? edgeConnections[side] : [];
    return zones
      .map(zone => {
        const targetRegionId = getEdgeConnectionTargetRegionId(zone);
        return targetRegionId && !zone?.intentionalOuter ? { ...zone, side, targetRegionId } : null;
      })
      .filter(Boolean);
  });
}

function getEdgeConnectionTargetRegionId(zone) {
  const targetRegionId = cleanEditorRegionId(zone?.connectsToRegionId || zone?.targetRegionId || zone?.target);
  return getRegionById(targetRegionId) ? targetRegionId : "";
}

function getEdgeConnectionMidpoint(zone) {
  const start = clamp(Number(zone?.start) || 0, 0, 1);
  const end = clamp(Number(zone?.end) || start, 0, 1);
  return clamp((Math.min(start, end) + Math.max(start, end)) / 2, 0, 1);
}

function getEdgeConnectionInset(dimensions, mode = "route") {
  const shortestSide = Math.max(1, Math.min(Number(dimensions?.width) || 1, Number(dimensions?.height) || 1));
  if (mode === "arrow") {
    return clamp(Math.round(shortestSide * 0.085), EDGE_TRANSITION_ARROW_INSET_MIN, EDGE_TRANSITION_ARROW_INSET_MAX);
  }
  return clamp(Math.round(shortestSide * 0.024), EDGE_TRANSITION_ROUTE_INSET_MIN, EDGE_TRANSITION_ROUTE_INSET_MAX);
}

function getEdgeConnectionImagePoint(regionId, zone, mode = "route") {
  const dimensions = getIslandImageDimensions(regionId);
  const side = String(zone?.side || "north").toLowerCase();
  if (mode === "arrow"
    && Number.isFinite(Number(zone?.arrowXNorm))
    && Number.isFinite(Number(zone?.arrowYNorm))) {
    return {
      x: clamp(Number(zone.arrowXNorm), 0, 1) * dimensions.width,
      y: clamp(Number(zone.arrowYNorm), 0, 1) * dimensions.height,
    };
  }
  const along = getEdgeConnectionMidpoint(zone);
  const inset = getEdgeConnectionInset(dimensions, mode);
  return {
    x: side === "west" ? inset : side === "east" ? dimensions.width - inset : along * dimensions.width,
    y: side === "north" ? inset : side === "south" ? dimensions.height - inset : along * dimensions.height,
  };
}

function getEdgeTransitionArrowSymbol(side) {
  const normalizedSide = String(side || "").toLowerCase();
  if (normalizedSide === "north") return "\u2191";
  if (normalizedSide === "south") return "\u2193";
  if (normalizedSide === "west") return "\u2190";
  return "\u2192";
}

function getOppositeEdgeSide(side) {
  if (side === "north") return "south";
  if (side === "south") return "north";
  if (side === "east") return "west";
  if (side === "west") return "east";
  return "";
}

function createEditorPortalFromEdgeConnection(regionId, zone) {
  const routePoint = getEdgeConnectionImagePoint(regionId, zone, "route");
  const arrowPoint = getEdgeConnectionImagePoint(regionId, zone, "arrow");
  const targetRegionId = getEdgeConnectionTargetRegionId(zone);
  const side = String(zone?.side || "north").toLowerCase();
  return {
    id: String(zone?.id || `${regionId}-${targetRegionId}-${side}`),
    label: String(zone?.label || getRegionLabel(targetRegionId)),
    targetRegionId,
    targetPortalId: String(zone?.targetConnectionId || zone?.targetPortalId || ""),
    x: routePoint.x,
    y: routePoint.y,
    routeX: routePoint.x,
    routeY: routePoint.y,
    buttonX: arrowPoint.x,
    buttonY: arrowPoint.y,
    size: Number(zone?.size) || DEFAULT_PORTAL_VISUAL_SIZE,
    className: "edge-transition-node",
    side,
    start: Number(zone?.start) || 0,
    end: Number(zone?.end) || 0,
    symbol: getEdgeTransitionArrowSymbol(side),
    edgeConnection: true,
  };
}

function getEditorPortalDefinitions(regionId) {
  return getEditorEdgeConnectionDefinitions(regionId).map(zone => createEditorPortalFromEdgeConnection(regionId, zone));
}

function getEditorPortalLinkId(portal) {
  return String(portal?.targetPortalId || portal?.targetPortal || portal?.linkedPortalId || portal?.connectedPortalId || "");
}

function getEditorPortalById(regionId, portalId) {
  const targetPortalId = String(portalId || "");
  if (!targetPortalId) return null;
  return getEditorPortalDefinitions(regionId).find(portal => String(portal?.id || "") === targetPortalId) || null;
}

function hasEditorPortalDefinitions(regionId) {
  return getEditorPortalDefinitions(regionId).length > 0;
}

function createEditorTeleporter(regionId, portal) {
  const targetRegionId = getEdgeConnectionTargetRegionId(portal);
  if (!targetRegionId) return null;
  const buttonPoint = {
    x: Number(portal?.buttonX ?? portal?.x) || 0,
    y: Number(portal?.buttonY ?? portal?.y) || 0,
  };
  return {
    id: String(portal?.id || `${regionId}-${targetRegionId}`),
    label: String(portal?.label || getRegionLabel(targetRegionId)),
    targetRegionId,
    worldPoint: islandImagePointToWorld(regionId, buttonPoint),
    size: getPortalVisualSize(portal),
    className: `${portal?.className || "edge-transition-node"} edge-transition-${portal?.side || "east"}`.trim(),
    side: portal?.side || "",
    symbol: portal?.symbol || getEdgeTransitionArrowSymbol(portal?.side),
  };
}

function getEditorTeleportersForRegion(regionId) {
  const sourceRegionId = normalizeRegionId(regionId);
  return getEditorPortalDefinitions(sourceRegionId)
    .map(portal => createEditorTeleporter(sourceRegionId, portal))
    .filter(teleport => teleport?.targetRegionId && teleport.targetRegionId !== sourceRegionId);
}

function getEditorPortalForRoute(regionId, targetRegionId, options = {}) {
  const sourceRegionId = normalizeRegionId(regionId);
  const destinationRegionId = normalizeRegionId(targetRegionId);
  const portalId = String(options.portalId || "");
  const targetPortalId = String(options.targetPortalId || "");
  const portals = getEditorPortalDefinitions(sourceRegionId)
    .filter(portal => getEdgeConnectionTargetRegionId(portal) === destinationRegionId);
  if (portalId) {
    const exact = portals.find(portal => String(portal?.id || "") === portalId);
    if (exact) return exact;
  }
  if (targetPortalId) {
    const linked = portals.find(portal => getEditorPortalLinkId(portal) === targetPortalId);
    if (linked) return linked;
  }
  return portals[0] || null;
}

function getLinkedEditorArrivalPortal(sourceRegionId, targetRegionId, sourcePortal) {
  const linkedPortalId = getEditorPortalLinkId(sourcePortal);
  if (linkedPortalId) {
    return getEditorPortalById(targetRegionId, linkedPortalId);
  }
  const sourcePortalId = String(sourcePortal?.id || "");
  if (sourcePortalId) {
    const backLinked = getEditorPortalForRoute(targetRegionId, sourceRegionId, { targetPortalId: sourcePortalId });
    if (backLinked) return backLinked;
  }
  const sourceSide = String(sourcePortal?.side || "");
  const oppositeSide = getOppositeEdgeSide(sourceSide);
  const sourceMidpoint = getEdgeConnectionMidpoint(sourcePortal);
  const candidates = getEditorPortalDefinitions(targetRegionId)
    .filter(portal => cleanEditorRegionId(portal?.targetRegionId || portal?.target) === cleanEditorRegionId(sourceRegionId))
    .filter(portal => !oppositeSide || portal.side === oppositeSide);
  if (candidates.length) {
    candidates.sort((a, b) => Math.abs(getEdgeConnectionMidpoint(a) - sourceMidpoint) - Math.abs(getEdgeConnectionMidpoint(b) - sourceMidpoint));
    return candidates[0];
  }
  return getEditorPortalForRoute(targetRegionId, sourceRegionId);
}

function findEditorPortalRouteRegionChain(fromRegionId, toRegionId) {
  const sourceRegionId = normalizeRegionId(fromRegionId);
  const targetRegionId = normalizeRegionId(toRegionId);
  if (sourceRegionId === targetRegionId) return [sourceRegionId];
  const adjacency = new Map();
  for (const map of getEditorMapEntries()) {
    const source = normalizeRegionId(map.id);
    for (const portal of getEditorPortalDefinitions(source)) {
      const target = getEdgeConnectionTargetRegionId(portal);
      if (!target || target === source) continue;
      if (!adjacency.has(source)) adjacency.set(source, new Set());
      adjacency.get(source).add(target);
    }
  }
  if (!adjacency.has(sourceRegionId)) return null;
  const queue = [[sourceRegionId]];
  const visited = new Set([sourceRegionId]);
  while (queue.length) {
    const chain = queue.shift();
    const current = chain[chain.length - 1];
    for (const next of adjacency.get(current) || []) {
      if (visited.has(next)) continue;
      const nextChain = [...chain, next];
      if (next === targetRegionId) return nextChain;
      visited.add(next);
      queue.push(nextChain);
    }
  }
  return null;
}

function getActiveIslandTeleporters() {
  const activeRegionId = getActiveMapRegionId();
  return getEditorTeleportersForRegion(activeRegionId);
}

function getCenterTeleportForRegion(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  return CENTER_ISLAND_TELEPORTS.find(teleport => teleport.targetRegionId === targetRegionId) || null;
}

function getPortalWorldPoint(regionId, targetRegionId = "center", options = {}) {
  const fromRegionId = normalizeRegionId(regionId);
  const toRegionId = normalizeRegionId(targetRegionId);
  const editorPortal = options.portal || getEditorPortalForRoute(fromRegionId, toRegionId, options);
  if (!editorPortal) return null;
  return islandImagePointToWorld(fromRegionId, {
    x: Number(editorPortal.routeX ?? editorPortal.x) || 0,
    y: Number(editorPortal.routeY ?? editorPortal.y) || 0,
  });
}

function getPortalRouteRegionChain(fromRegionId, toRegionId) {
  const sourceRegionId = normalizeRegionId(fromRegionId);
  const targetRegionId = normalizeRegionId(toRegionId);
  if (sourceRegionId === targetRegionId) return [sourceRegionId];
  const editorChain = findEditorPortalRouteRegionChain(sourceRegionId, targetRegionId);
  if (editorChain?.length) return editorChain;
  return null;
}

function renderWorldDefs() {
  return `
    <defs>
      <filter id="worldLandShadow" x="-12%" y="-12%" width="124%" height="124%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#14311f" flood-opacity="0.28"></feDropShadow>
      </filter>
      <filter id="worldShoreGlow" x="-12%" y="-12%" width="124%" height="124%">
        <feDropShadow dx="0" dy="0" stdDeviation="16" flood-color="#fff1a7" flood-opacity="0.46"></feDropShadow>
      </filter>
      <filter id="worldTerrainShadow" x="-18%" y="-18%" width="136%" height="136%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#1b3b29" flood-opacity="0.18"></feDropShadow>
      </filter>
      <radialGradient id="landHeartland" cx="44%" cy="35%" r="68%">
        <stop offset="0%" stop-color="#b8d784"></stop><stop offset="46%" stop-color="#88b968"></stop><stop offset="78%" stop-color="#66994f"></stop><stop offset="100%" stop-color="#507d47"></stop>
      </radialGradient>
      <radialGradient id="landPine" cx="42%" cy="34%" r="70%">
        <stop offset="0%" stop-color="#afcf82"></stop><stop offset="48%" stop-color="#79aa67"></stop><stop offset="76%" stop-color="#5a8d57"></stop><stop offset="100%" stop-color="#416e4f"></stop>
      </radialGradient>
      <radialGradient id="landMarsh" cx="47%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#b5cf80"></stop><stop offset="52%" stop-color="#86aa69"></stop><stop offset="80%" stop-color="#6c8e63"></stop><stop offset="100%" stop-color="#58765a"></stop>
      </radialGradient>
      <radialGradient id="landWoodland" cx="45%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#a4c978"></stop><stop offset="48%" stop-color="#77a95e"></stop><stop offset="76%" stop-color="#568949"></stop><stop offset="100%" stop-color="#3f6a43"></stop>
      </radialGradient>
      <radialGradient id="landGolden" cx="46%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#d5cf83"></stop><stop offset="48%" stop-color="#a7b966"></stop><stop offset="78%" stop-color="#819a55"></stop><stop offset="100%" stop-color="#647d49"></stop>
      </radialGradient>
      <linearGradient id="causewayGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#c6bf76"></stop><stop offset="52%" stop-color="#8fb25f"></stop><stop offset="100%" stop-color="#c6bf76"></stop>
      </linearGradient>
      <radialGradient id="mountainGradient" cx="38%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#dfded1"></stop><stop offset="22%" stop-color="#9b9380"></stop><stop offset="100%" stop-color="#5f5549"></stop>
      </radialGradient>
    </defs>
  `;
}

function renderSeaRipples() {
  return LAND_BRIDGES.map((bridge, index) => {
    const midX = (bridge.from.x + bridge.to.x) / 2;
    const midY = (bridge.from.y + bridge.to.y) / 2;
    const dx = bridge.to.x - bridge.from.x;
    const dy = bridge.to.y - bridge.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const offset = bridge.width * 0.95;
    return `
      <path class="world-sea-ripple" d="M ${formatPathNumber(midX - nx * offset - dx * 0.34)} ${formatPathNumber(midY - ny * offset - dy * 0.34)} Q ${formatPathNumber(midX - nx * offset * 1.12)} ${formatPathNumber(midY - ny * offset * 1.12)} ${formatPathNumber(midX - nx * offset + dx * 0.34)} ${formatPathNumber(midY - ny * offset + dy * 0.34)}"></path>
      <path class="world-sea-ripple" d="M ${formatPathNumber(midX + nx * offset - dx * 0.34)} ${formatPathNumber(midY + ny * offset - dy * 0.34)} Q ${formatPathNumber(midX + nx * offset * 1.12)} ${formatPathNumber(midY + ny * offset * 1.12)} ${formatPathNumber(midX + nx * offset + dx * 0.34)} ${formatPathNumber(midY + ny * offset + dy * 0.34)}"></path>
    `;
  }).join("");
}

function renderSeaSparkles(bounds = { left: 0, top: 0, right: WORLD_WIDTH, bottom: WORLD_HEIGHT, width: WORLD_WIDTH, height: WORLD_HEIGHT }) {
  const random = createSeededRandom(`sea:${WORLD_SCHEMA_VERSION}:${bounds.regionId || "world"}:${bounds.width}:${bounds.height}`);
  const sparkles = [];
  const count = Math.max(18, Math.round((bounds.width * bounds.height) / 170000));
  for (let i = 0; i < count; i += 1) {
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      x = Math.round(bounds.left + random() * bounds.width);
      y = Math.round(bounds.top + random() * bounds.height);
      if (!isWorldLandPoint(x, y, 120)) break;
    }
    const rx = 10 + random() * 22;
    const ry = 2.5 + random() * 5;
    const rot = random() * 180;
    const opacity = 0.22 + random() * 0.34;
    sparkles.push(`<ellipse class="world-sea-sparkle" cx="${x}" cy="${y}" rx="${formatPathNumber(rx)}" ry="${formatPathNumber(ry)}" opacity="${formatPathNumber(opacity)}" transform="rotate(${formatPathNumber(rot)} ${x} ${y})"></ellipse>`);
  }
  return sparkles.join("");
}

function renderWorldRegionShore(region) {
  return `<ellipse class="world-shore-glow" cx="${region.x}" cy="${region.y}" rx="${region.rx}" ry="${region.ry}" transform="rotate(${((region.rot || 0) * 180 / Math.PI).toFixed(2)} ${region.x} ${region.y})"></ellipse>
    <ellipse class="world-beach" cx="${region.x}" cy="${region.y}" rx="${region.rx}" ry="${region.ry}" transform="rotate(${((region.rot || 0) * 180 / Math.PI).toFixed(2)} ${region.x} ${region.y})"></ellipse>
    <ellipse class="world-shore-line" cx="${region.x}" cy="${region.y}" rx="${region.rx}" ry="${region.ry}" transform="rotate(${((region.rot || 0) * 180 / Math.PI).toFixed(2)} ${region.x} ${region.y})"></ellipse>`;
}

function renderWorldRegion(region) {
  return `<ellipse class="world-land ${region.palette || "heartland"}" cx="${region.x}" cy="${region.y}" rx="${region.rx}" ry="${region.ry}" transform="rotate(${((region.rot || 0) * 180 / Math.PI).toFixed(2)} ${region.x} ${region.y})"></ellipse>`;
}

function renderWorldBridgeShore(bridge) {
  return `<line class="world-causeway-shore" x1="${bridge.from.x}" y1="${bridge.from.y}" x2="${bridge.to.x}" y2="${bridge.to.y}" stroke-width="${bridge.width + 72}"></line>`;
}

function renderWorldBridge(bridge) {
  return `<line class="world-causeway" x1="${bridge.from.x}" y1="${bridge.from.y}" x2="${bridge.to.x}" y2="${bridge.to.y}" stroke-width="${bridge.width}"></line>`;
}

function renderWorldRegionTexture(region) {
  const random = createSeededRandom(`region-texture:${WORLD_SCHEMA_VERSION}:${region.id}`);
  const details = [];
  const clearingRatio = getRegionStrongholdReserveRatio(region);
  if (clearingRatio > 0) {
    details.push(`<ellipse class="world-center-clearing" cx="${region.x}" cy="${region.y}" rx="${formatPathNumber(region.cityRx * clearingRatio * 0.8)}" ry="${formatPathNumber(region.cityRy * clearingRatio * 0.72)}" transform="rotate(${((region.rot || 0) * 180 / Math.PI).toFixed(2)} ${region.x} ${region.y})"></ellipse>`);
  }

  for (let i = 0; i < 10; i += 1) {
    const point = getRegionTexturePoint(region, random, 0.26, 0.82);
    const rx = region.rx * (0.035 + random() * 0.045);
    const ry = region.ry * (0.025 + random() * 0.04);
    const rot = ((region.rot || 0) + (random() - 0.5) * 1.1) * 180 / Math.PI;
    details.push(`<ellipse class="world-meadow" cx="${formatPathNumber(point.x)}" cy="${formatPathNumber(point.y)}" rx="${formatPathNumber(rx)}" ry="${formatPathNumber(ry)}" transform="rotate(${formatPathNumber(rot)} ${formatPathNumber(point.x)} ${formatPathNumber(point.y)})"></ellipse>`);
  }

  for (let i = 0; i < 8; i += 1) {
    const point = getRegionTexturePoint(region, random, 0.35, 0.88);
    const rx = region.rx * (0.05 + random() * 0.05);
    const ry = region.ry * (0.018 + random() * 0.025);
    const rot = ((region.rot || 0) + (random() - 0.5) * 1.6) * 180 / Math.PI;
    details.push(`<ellipse class="world-hill" cx="${formatPathNumber(point.x)}" cy="${formatPathNumber(point.y)}" rx="${formatPathNumber(rx)}" ry="${formatPathNumber(ry)}" transform="rotate(${formatPathNumber(rot)} ${formatPathNumber(point.x)} ${formatPathNumber(point.y)})"></ellipse>`);
  }

  return details.join("");
}

function getRegionTexturePoint(region, random, minRadius, maxRadius) {
  const angle = random() * Math.PI * 2;
  const radius = minRadius + random() * (maxRadius - minRadius);
  const cos = Math.cos(region.rot || 0);
  const sin = Math.sin(region.rot || 0);
  const localX = Math.cos(angle) * region.cityRx * radius;
  const localY = Math.sin(angle) * region.cityRy * radius;
  return {
    x: region.x + localX * cos - localY * sin,
    y: region.y + localX * sin + localY * cos,
  };
}

function renderWorldSoftTerrain(shape) {
  const className = shape.type === "swamp" ? "world-swamp" : "world-forest";
  return `<ellipse class="${className}" cx="${formatPathNumber(shape.x)}" cy="${formatPathNumber(shape.y)}" rx="${shape.rx}" ry="${shape.ry}" transform="rotate(${((shape.rot || 0) * 180 / Math.PI).toFixed(2)} ${formatPathNumber(shape.x)} ${formatPathNumber(shape.y)})"></ellipse>`;
}

function renderWorldMountain(shape) {
  return `<ellipse class="world-mountain" cx="${formatPathNumber(shape.x)}" cy="${formatPathNumber(shape.y)}" rx="${shape.rx}" ry="${shape.ry}" transform="rotate(${((shape.rot || 0) * 180 / Math.PI).toFixed(2)} ${formatPathNumber(shape.x)} ${formatPathNumber(shape.y)})"></ellipse>`;
}

function renderWorldRegionLabel(region) {
  return `<text class="world-region-label" x="${region.x}" y="${region.y - region.ry * 0.05}">${escapeHtml(region.label || region.id)}</text>`;
}

function cloneBaseCities(playerName) {
  const island = createIslandStartLayout(playerName);
  return island.cities;
}

function getPlayableBaseCities() {
  if (playableBaseCitiesCache) return playableBaseCitiesCache;
  playableBaseCitiesCache = generateWorldCitySlots();
  return playableBaseCitiesCache;
}

function getPlayableBaseCityById(cityId) {
  const id = String(cityId || "");
  if (!id) return null;
  if (!playableBaseCitiesByIdCache) {
    playableBaseCitiesByIdCache = new Map(getPlayableBaseCities().map(city => [city.id, city]));
  }
  return playableBaseCitiesByIdCache.get(id) || null;
}

function getPlayableBaseCitiesByRegion(regionId = getActiveOnlineRegionId()) {
  const normalizedRegionId = normalizeRegionId(regionId);
  if (!playableBaseCitiesByRegionCache) playableBaseCitiesByRegionCache = new Map();
  if (!playableBaseCitiesByRegionCache.has(normalizedRegionId)) {
    playableBaseCitiesByRegionCache.set(
      normalizedRegionId,
      getPlayableBaseCities().filter(city => getCityRegionId(city) === normalizedRegionId)
    );
  }
  return playableBaseCitiesByRegionCache.get(normalizedRegionId) || [];
}

function createIslandStartLayout(playerName) {
  const cities = getPlayableBaseCities().map(createNeutralCityFromBase);

  const startIds = pickStartCities(cities);
  const assignments = [
    { key: "player", owner: "player", troops: PLAYER_START_TROOPS },
  ];

  for (const slot of assignments) {
    const city = cities.find(item => item.id === startIds[slot.key]);
    if (!city) continue;
    city.owner = slot.owner;
    if (slot.name) city.name = slot.name;
    city.troops = slot.troops;
    city.troopFloat = slot.troops;
    city.level = 1;
    city.defense = 1;
    city.investedGold = 0;
    city.lastCapturedAt = null;
    city.isMainCity = slot.key === "player";
    city.relinquishedAtMs = 0;
    city.relocatedAtMs = 0;
  }

  return { cities, startIds };
}

function pickStartCities(cities) {
  const fallbackAnchors = getStartCityAnchors();

  const used = new Set();
  const result = {};

  for (const [key, config] of Object.entries(fallbackAnchors)) {
    const pool = cities.filter(city => city.startPool === config.pool && !used.has(city.id) && !isStronghold(city));
    let chosen = randomChoice(pool);
    if (!chosen) {
      const available = cities
        .filter(city => !used.has(city.id) && !isStronghold(city))
        .sort((a, b) => Math.hypot(a.x - config.x, a.y - config.y) - Math.hypot(b.x - config.x, b.y - config.y));
      chosen = available[0];
    }
    if (chosen) {
      used.add(chosen.id);
      result[key] = chosen.id;
    }
  }

  return result;
}

function pickDeterministicStartCities(cities) {
  const anchors = getStartCityAnchors();
  const used = new Set();
  const result = {};

  for (const [key, config] of Object.entries(anchors)) {
    const chosen = cities
      .filter(city => city.startPool === config.pool && !used.has(city.id) && !isStronghold(city))
      .sort((a, b) => Math.hypot(a.x - config.x, a.y - config.y) - Math.hypot(b.x - config.x, b.y - config.y))[0];
    if (chosen) {
      used.add(chosen.id);
      result[key] = chosen.id;
    }
  }

  return result;
}

function getStartCityAnchors() {
  const center = getRegionById("center") || WORLD_REGIONS[0] || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, id: "center" };
  const north = getRegionById("north") || center;
  const west = getRegionById("west") || center;
  const east = getRegionById("east") || center;
  const south = getRegionById("south") || center;
  return {
    player: { x: west.x - west.cityRx * 0.18, y: west.y, pool: west.id },
    north: { x: north.x, y: north.y - north.cityRy * 0.26, pool: north.id },
    west: { x: west.x - west.cityRx * 0.24, y: west.y, pool: west.id },
    east: { x: east.x + east.cityRx * 0.24, y: east.y, pool: east.id },
    south: { x: south.x, y: south.y + south.cityRy * 0.26, pool: south.id },
  };
}

function createOnlineIslandSeed(regionId = DEFAULT_ONLINE_REGION_ID) {
  const baseCities = getOnlineIslandBaseCities(regionId);
  const startIds = pickDeterministicStartCities(baseCities);
  const cities = baseCities.map(createNeutralCityFromBase);
  const targetRegionId = normalizeRegionId(regionId);
  const camps = WORLD_CAMPS
    .filter(camp => normalizeRegionId(camp.regionId) === targetRegionId && getRewardCampConfig(camp))
    .map(camp => {
      const config = getRewardCampConfig(camp);
      return {
        ...camp,
        name: config.name,
        mapId: targetRegionId,
        rewardType: config.rewardType,
        holdDurationMs: config.holdSeconds * 1000,
        baseReward: config.baseReward,
        baseDefenders: config.baseDefenders,
        defenseLevel: config.defenseLevel,
      };
    });

  return {
    regionId: targetRegionId,
    cities,
    camps,
    startIds,
    claimCandidateIds: getOnlineClaimCandidateIds(cities, startIds),
  };
}

function getOnlineIslandSeedMeta(regionId, seed) {
  const targetRegionId = normalizeRegionId(regionId);
  return {
    worldId: ONLINE_WORLD_ID,
    legacyWorldId: ONLINE_LEGACY_ISLAND_ID,
    regionId: targetRegionId,
    regionName: getRegionLabel(targetRegionId),
    version: WORLD_SCHEMA_VERSION,
    name: `${getRegionLabel(targetRegionId)} - ${WORLD_CONFIG.name || "Crownlands"}`,
    cityCount: seed.cities.length,
    regionCount: WORLD_REGIONS.length,
    cityCountPerRegion: REGION_CITY_COUNT,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
  };
}

async function ensureOnlineIslandSeeded(regionId, timeoutMs = 20000) {
  const api = getOnlineApi();
  const targetRegionId = normalizeRegionId(regionId);
  const seed = createOnlineIslandSeed(targetRegionId);
  if (!api?.ensureMainIsland || verifiedOnlineIslandSeeds.has(targetRegionId)) return seed;
  await withTimeout(api.ensureMainIsland({
    islandId: getOnlineIslandId(targetRegionId),
    regionId: targetRegionId,
  }), timeoutMs, `${getRegionLabel(targetRegionId)} setup is taking too long.`);
  verifiedOnlineIslandSeeds.add(targetRegionId);
  return seed;
}

function getOnlineClaimCandidateIds(cities, startIds) {
  const selected = [];
  const used = new Set();
  [startIds.north, startIds.south, startIds.west, startIds.east, startIds.player]
    .filter(Boolean)
    .forEach(cityId => {
      if (used.has(cityId)) return;
      selected.push(cityId);
      used.add(cityId);
    });
  const outerCities = cities.filter(city => city.regionId !== "center" && !isStronghold(city));
  const centerCities = cities.filter(city => city.regionId === "center" && !isStronghold(city));

  appendSpacedClaimCandidates(outerCities, selected, used);
  appendSpacedClaimCandidates(centerCities, selected, used);

  return selected;
}

function appendSpacedClaimCandidates(cities, selected, used) {
  while (true) {
    let bestCity = null;
    let bestSpacing = -Infinity;
    for (const city of cities) {
      if (used.has(city.id)) continue;
      const nearest = selected.length
        ? Math.min(...selected.map(id => {
            const other = cities.find(item => item.id === id);
            return other ? Math.hypot(city.x - other.x, city.y - other.y) : Infinity;
          }))
        : Infinity;
      if (nearest > bestSpacing) {
        bestSpacing = nearest;
        bestCity = city;
      }
    }
    if (!bestCity) break;
    selected.push(bestCity.id);
    used.add(bestCity.id);
  }
}

function newGame(playerName) {
  const island = createIslandStartLayout(playerName);
  return {
    version: WORLD_SCHEMA_VERSION,
    playerName,
    character: createCharacterProgress(),
    flag: createRandomFlag(),
    gold: TEST_STARTING_GOLD,
    gameSeconds: 0,
    lastRealTimeMs: Date.now(),
    upgrades: createDefaultSkills(),
    shopItems: createDefaultShopItems(),
    itemEffects: createDefaultItemEffects(),
    itemPurchaseCooldowns: createDefaultItemPurchaseCooldowns(),
    globalStats: null,
    daily: { date: currentDailyDateKey(), neutralCaptures: 0, harvestedBonuses: 0, harvestedGoldBonuses: 0, harvestedTroopBonuses: 0 },
    harvestBonuses: [],
    harvestSpawnTimer: HARVEST_BONUS_INITIAL_SPAWN_SECONDS,
    harvestNextSpawnAtMs: Date.now() + HARVEST_BONUS_INITIAL_SPAWN_SECONDS * 1000,
    harvestNextBonusType: "gold",
    scoutReports: {},
    battleReports: [],
    marchPercent: DEFAULT_MARCH_PERCENT,
    mainCityId: island.startIds.player,
    mainCityChangedAtMs: 0,
    islandSlots: island.startIds,
    cities: island.cities,
    attacks: [],
    log: [`Five-island conquest started with ${ISLAND_CITY_COUNT} city slots across individual island maps.`],
    gameOver: null,
  };
}

function createDefaultShopItems() {
  return SHOP_ITEMS.reduce((inventory, item) => {
    inventory[item.id] = 0;
    return inventory;
  }, {});
}

function normalizeShopItems(items) {
  const normalized = createDefaultShopItems();
  if (!items || typeof items !== "object") return normalized;
  SHOP_ITEMS.forEach(item => {
    const hasCanonicalCount = Object.prototype.hasOwnProperty.call(items, item.id);
    const canonicalCount = Math.max(0, Math.floor(Number(items[item.id]) || 0));
    const legacyCount = (item.legacyIds || []).reduce((total, legacyId) => (
      total + Math.max(0, Math.floor(Number(items[legacyId]) || 0))
    ), 0);
    const hasLegacyCount = legacyCount > 0 && (item.legacyIds || []).some(legacyId => (
      Object.prototype.hasOwnProperty.call(items, legacyId)
    ));
    normalized[item.id] = hasCanonicalCount
      ? (hasLegacyCount ? Math.min(canonicalCount, legacyCount) : canonicalCount)
      : legacyCount;
  });
  return normalized;
}

function ensureShopItems() {
  if (!state) return createDefaultShopItems();
  const normalized = normalizeShopItems(state.shopItems);
  if (!state.shopItems || typeof state.shopItems !== "object" || Array.isArray(state.shopItems)) {
    state.shopItems = normalized;
  } else {
    Object.assign(state.shopItems, normalized);
  }
  return state.shopItems;
}

function createDefaultItemPurchaseCooldowns() {
  return Object.fromEntries(
    Object.keys(ITEM_DAILY_PURCHASE_LIMITS)
      .map(itemId => [itemId, { utcDate: "", purchaseCount: 0 }])
  );
}

function getUtcDateKeyAtMs(value = Date.now()) {
  const parsed = Number(value);
  const date = new Date(Number.isFinite(parsed) ? parsed : Date.now());
  return date.toISOString().slice(0, 10);
}

function getNextUtcDayStartMs(value = Date.now()) {
  const parsed = Number(value);
  const date = new Date(Number.isFinite(parsed) ? parsed : Date.now());
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
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

function normalizeDailyItemPurchaseCounter(value = {}, limit = 0) {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  const explicitDate = String(value?.utcDate || value?.date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return {
      utcDate: explicitDate,
      purchaseCount: Math.min(safeLimit, Math.max(0, Math.floor(Number(value?.purchaseCount ?? value?.count) || 0))),
    };
  }

  const legacyTimestamps = normalizeItemPurchaseTimestamps(value);
  const lastPurchasedAtMs = timestampToMs(value?.lastPurchasedAtMs || value?.lastPurchasedAt);
  if (lastPurchasedAtMs > 0) legacyTimestamps.push(lastPurchasedAtMs);
  if (!legacyTimestamps.length) return { utcDate: "", purchaseCount: 0 };

  const latestPurchaseAtMs = Math.max(...legacyTimestamps);
  const utcDate = getUtcDateKeyAtMs(latestPurchaseAtMs);
  const purchaseCount = legacyTimestamps.filter(timestamp => getUtcDateKeyAtMs(timestamp) === utcDate).length;
  return {
    utcDate,
    purchaseCount: Math.min(safeLimit, purchaseCount),
  };
}

function getItemDailyPurchaseLimit(itemId) {
  return Math.max(0, Math.floor(Number(ITEM_DAILY_PURCHASE_LIMITS[itemId]) || 0));
}

function normalizeItemPurchaseCooldowns(cooldowns = {}) {
  const normalized = createDefaultItemPurchaseCooldowns();
  Object.keys(ITEM_DAILY_PURCHASE_LIMITS).forEach(itemId => {
    normalized[itemId] = normalizeDailyItemPurchaseCounter(
      cooldowns?.[itemId],
      getItemDailyPurchaseLimit(itemId)
    );
  });
  return normalized;
}

function ensureItemPurchaseCooldowns() {
  if (!state) return createDefaultItemPurchaseCooldowns();
  const normalized = normalizeItemPurchaseCooldowns(state.itemPurchaseCooldowns);
  if (!state.itemPurchaseCooldowns || typeof state.itemPurchaseCooldowns !== "object" || Array.isArray(state.itemPurchaseCooldowns)) {
    state.itemPurchaseCooldowns = normalized;
  } else {
    Object.assign(state.itemPurchaseCooldowns, normalized);
  }
  return state.itemPurchaseCooldowns;
}

function getItemPurchaseStatus(itemId, cooldowns = ensureItemPurchaseCooldowns(), now = Date.now()) {
  const limit = getItemDailyPurchaseLimit(itemId);
  const currentTime = Math.max(0, Number(now) || Date.now());
  if (limit <= 0) return { count: 0, limit: 0, remainingMs: 0, utcDate: getUtcDateKeyAtMs(currentTime) };
  const today = getUtcDateKeyAtMs(currentTime);
  const counter = normalizeDailyItemPurchaseCounter(cooldowns?.[itemId], limit);
  const count = counter.utcDate === today ? Math.min(limit, counter.purchaseCount) : 0;
  return {
    count,
    limit,
    remainingMs: count >= limit ? Math.max(0, getNextUtcDayStartMs(currentTime) - currentTime) : 0,
    utcDate: today,
  };
}

function getItemPurchaseCooldownRemainingMs(itemId, now = Date.now()) {
  return getItemPurchaseStatus(itemId, ensureItemPurchaseCooldowns(), now).remainingMs;
}

function getItemPurchaseCount(itemId, now = Date.now()) {
  return getItemPurchaseStatus(itemId, ensureItemPurchaseCooldowns(), now).count;
}

function recordItemPurchase(itemId, purchasedAtMs = Date.now()) {
  const limit = getItemDailyPurchaseLimit(itemId);
  if (limit <= 0) return;
  const cooldowns = ensureItemPurchaseCooldowns();
  const status = getItemPurchaseStatus(itemId, cooldowns, purchasedAtMs);
  cooldowns[itemId] = {
    utcDate: status.utcDate,
    purchaseCount: Math.min(limit, status.count + 1),
  };
}

function getItemPurchaseCooldownText(itemId, now = Date.now()) {
  const remainingMs = getItemPurchaseCooldownRemainingMs(itemId, now);
  return remainingMs > 0 ? formatDuration(Math.ceil(remainingMs / 1000)) : "";
}

function createDefaultItemEffects() {
  return {
    shieldExpiresAtMs: 0,
    warDrumsExpiresAtMs: 0,
    royalTaxDecreeExpiresAtMs: 0,
    veilOfSilenceExpiresAtMs: 0,
  };
}

function normalizeItemEffects(effects = {}) {
  return {
    shieldExpiresAtMs: timestampToMs(effects?.shieldExpiresAtMs || effects?.shieldExpiresAt),
    warDrumsExpiresAtMs: timestampToMs(effects?.warDrumsExpiresAtMs || effects?.warDrumsExpiresAt || effects?.troopBoostExpiresAtMs || effects?.troopBoostExpiresAt),
    royalTaxDecreeExpiresAtMs: timestampToMs(effects?.royalTaxDecreeExpiresAtMs || effects?.royalTaxDecreeExpiresAt),
    veilOfSilenceExpiresAtMs: timestampToMs(effects?.veilOfSilenceExpiresAtMs || effects?.veilOfSilenceExpiresAt || effects?.antiScoutExpiresAtMs || effects?.antiScoutExpiresAt),
  };
}

function ensureItemEffects() {
  if (!state) return createDefaultItemEffects();
  const normalized = normalizeItemEffects(state.itemEffects);
  if (!state.itemEffects || typeof state.itemEffects !== "object" || Array.isArray(state.itemEffects)) {
    state.itemEffects = normalized;
  } else {
    Object.assign(state.itemEffects, normalized);
  }
  return state.itemEffects;
}

function getActiveTimedItemEffectExpiresAtMs(effectKey) {
  const effects = ensureItemEffects();
  const expiresAtMs = normalizeTimestampMs(effects[effectKey]);
  if (expiresAtMs && expiresAtMs <= Date.now()) {
    effects[effectKey] = 0;
    return 0;
  }
  return expiresAtMs;
}

function getActivePeaceShieldExpiresAtMs() {
  return getActiveTimedItemEffectExpiresAtMs("shieldExpiresAtMs");
}

function getActiveWarDrumsExpiresAtMs() {
  return getActiveTimedItemEffectExpiresAtMs("warDrumsExpiresAtMs");
}

function getActiveRoyalTaxDecreeExpiresAtMs() {
  return getActiveTimedItemEffectExpiresAtMs("royalTaxDecreeExpiresAtMs");
}

function getActiveVeilOfSilenceExpiresAtMs() {
  return getActiveTimedItemEffectExpiresAtMs("veilOfSilenceExpiresAtMs");
}

function getInventoryItemActiveExpiresAtMs(item) {
  if (!item) return 0;
  if (item.id === ROYAL_PEACE_SHIELD_ITEM_ID) return getActivePeaceShieldExpiresAtMs();
  if (item.id === WAR_DRUMS_ITEM_ID) return getActiveWarDrumsExpiresAtMs();
  if (item.id === ROYAL_TAX_DECREE_ITEM_ID) return getActiveRoyalTaxDecreeExpiresAtMs();
  if (item.id === VEIL_OF_SILENCE_ITEM_ID) return getActiveVeilOfSilenceExpiresAtMs();
  return 0;
}

function getInventoryItemActiveRemainingSeconds(item) {
  return getPeaceShieldRemainingSeconds(getInventoryItemActiveExpiresAtMs(item));
}

function getWarDrumsTroopProductionBonusPercent() {
  return getActiveWarDrumsExpiresAtMs() ? WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT : 0;
}

function getPeaceShieldRemainingSeconds(expiresAtMs = getActivePeaceShieldExpiresAtMs()) {
  return Math.max(0, Math.ceil((normalizeTimestampMs(expiresAtMs) - Date.now()) / 1000));
}

function getCityPeaceShieldExpiresAtMs(city) {
  if (!city || isStronghold(city)) return 0;
  const expiresAtMs = city.owner === "player"
    ? getActivePeaceShieldExpiresAtMs()
    : normalizeTimestampMs(city.ownerShieldExpiresAtMs);
  return expiresAtMs > Date.now() ? expiresAtMs : 0;
}

function isCityProtectedByPeaceShield(city) {
  if (!city || city.owner === "neutral" || isStronghold(city)) return false;
  return getCityPeaceShieldExpiresAtMs(city) > Date.now();
}

function isAnotherPlayerOwnedCity(city) {
  if (!city || city.owner === "neutral") return false;
  const currentUid = getCurrentOnlineUid();
  const ownerUid = String(city.ownerUid || "").trim();
  if (city.owner === "player") return false;
  if (ownerUid && currentUid) return ownerUid !== currentUid;
  if (city.ownerKind === "player") return true;
  return city.owner === "enemy";
}

function isSameAttackOwner(target, attackerOwner = "player", attackerOwnerUid = "") {
  if (!target || target.owner === "neutral") return false;
  const targetOwnerUid = String(target.ownerUid || "").trim();
  const incomingOwnerUid = String(attackerOwnerUid || "").trim();
  if (targetOwnerUid && incomingOwnerUid) return targetOwnerUid === incomingOwnerUid;
  if (attackerOwner === "player") {
    const currentUid = getCurrentOnlineUid();
    return target.owner === "player" || Boolean(currentUid && targetOwnerUid && targetOwnerUid === currentUid);
  }
  return target.owner === attackerOwner && !targetOwnerUid && !incomingOwnerUid;
}

function getPeaceShieldAttackBlockReason(target, attackerOwner = "player", attackerOwnerUid = "") {
  if (!target || isSameAttackOwner(target, attackerOwner, attackerOwnerUid)) return "";
  if (!isCityProtectedByPeaceShield(target)) return "";
  const remaining = getPeaceShieldRemainingSeconds(getCityPeaceShieldExpiresAtMs(target));
  return `${target.name} is protected by a Royal Peace Shield for ${formatDuration(remaining)}.`;
}

function refreshOwnedCityItemEffectMetadata(syncNow = true) {
  if (!state) return;
  const shieldExpiresAtMs = getActivePeaceShieldExpiresAtMs();
  playerCities().forEach(city => {
    city.ownerShieldExpiresAtMs = isStronghold(city) ? 0 : shieldExpiresAtMs;
    markOwnedCityChanged(city, false);
  });
  if (onlineOwnedCitiesCache.length) {
    onlineOwnedCitiesCache = onlineOwnedCitiesCache.map(city => (
      isStronghold(city)
        ? { ...city, ownerShieldExpiresAtMs: 0 }
        : { ...city, ownerShieldExpiresAtMs: shieldExpiresAtMs }
    ));
  }
  if (syncNow && isOnlineWorldActive()) syncOwnedCitiesToOnline(true);
}

async function syncPeaceShieldToAllOwnedCities(expiresAtMs = getActivePeaceShieldExpiresAtMs()) {
  if (!state) return false;
  if (usesServerEconomyAuthority()) {
    refreshOwnedCityItemEffectMetadata(true);
    renderCities(true);
    renderHud();
    return true;
  }
  const api = getOnlineApi();
  if (!api?.isSignedIn?.() || !api?.loadOwnedCitiesAcrossIslands || !api?.savePlayerCities) {
    refreshOwnedCityItemEffectMetadata(true);
    return false;
  }

  try {
    const islandIds = getRegionIds().map(getOnlineIslandId);
    const owned = await withTimeout(
      api.loadOwnedCitiesAcrossIslands(islandIds),
      6500,
      "Shield city lookup is taking too long."
    );
    const normalized = (Array.isArray(owned) ? owned : [])
      .map(city => normalizeOwnedCitySnapshot({
        ...city,
        islandId: city.islandId || getOnlineIslandId(getCityRegionId(city)),
      }))
      .filter(Boolean);
    const nextShieldExpiresAtMs = normalizeTimestampMs(expiresAtMs);
    const byIsland = new Map();
    normalized.forEach(city => {
      const nextCity = {
        ...city,
        ownerShieldExpiresAtMs: isStronghold(city) ? 0 : nextShieldExpiresAtMs,
      };
      const islandId = nextCity.islandId || getOnlineIslandId(getCityRegionId(nextCity));
      if (!byIsland.has(islandId)) byIsland.set(islandId, []);
      byIsland.get(islandId).push(nextCity);
    });

    await Promise.all([...byIsland.entries()].map(([islandId, cities]) => api.savePlayerCities(islandId, cities)));
    mergeOwnedCitySnapshots(normalized.map(city => ({
      ...city,
      ownerShieldExpiresAtMs: isStronghold(city) ? 0 : nextShieldExpiresAtMs,
    })), { complete: true });
    renderCities(true);
    renderHud();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    console.warn("Could not sync peace shield across owned cities", error);
    return false;
  }
}

async function syncPlayerIdentityToAllOwnedCities({ forceLeaderboard = true } = {}) {
  if (!state) return false;
  const api = getOnlineApi();
  const currentUid = getCurrentOnlineUid();
  const nextFlag = normalizeFlag(state.flag);
  const nextOwnerName = state.playerName || getOnlineApi()?.getUser?.()?.displayName || "Ruler";
  const nextKingPower = getKingPower();
  rememberCurrentPlayerIdentity();

  playerCities().forEach(city => {
    city.ownerKind = "player";
    city.ownerUid = currentUid || city.ownerUid || null;
    city.ownerName = nextOwnerName;
    city.ownerFlag = nextFlag;
    city.ownerKingPower = nextKingPower;
    localDirtyCityIds.add(city.id);
  });

  if (onlineOwnedCitiesCache.length) {
    onlineOwnedCitiesCache = onlineOwnedCitiesCache.map(city => ({
      ...city,
      ownerName: nextOwnerName,
      ownerFlag: nextFlag,
      ownerKingPower: nextKingPower,
    }));
    updateIslandSummariesFromOwnedCityCache();
  }

  const profileSave = api?.savePlayerProfile && api?.isSignedIn?.()
    ? api.savePlayerProfile(stripServerEconomyProfileFields(getPlayerCloudStateSnapshot())).catch(error => {
      console.warn("Could not save player profile identity", error);
      return false;
    })
    : Promise.resolve(false);
  const leaderboardSave = forceLeaderboard ? publishKingPowerLeaderboard({ force: true }) : Promise.resolve(false);
  const presenceSave = publishOnlinePresence(true);

  if (!api?.isSignedIn?.() || !api?.loadOwnedCitiesAcrossIslands || !api?.savePlayerCities) {
    await Promise.allSettled([profileSave, leaderboardSave, presenceSave]);
    if (isOnlineWorldActive()) syncOwnedCitiesToOnline(true);
    return false;
  }

  try {
    const islandIds = getRegionIds().map(getOnlineIslandId);
    if (api.syncPlayerIdentity) {
      const leaderboardEntry = getKingPowerLeaderboardSnapshot();
      const syncResult = await api.syncPlayerIdentity({
        ownerName: nextOwnerName,
        ownerFlag: nextFlag,
        ownerKingPower: nextKingPower,
        mainCityId: leaderboardEntry.mainCityId,
        mainRegionId: leaderboardEntry.mainRegionId,
        mainIslandId: leaderboardEntry.mainIslandId,
      });
      if (syncResult?.globalStats) applyGlobalStatsSnapshot(syncResult.globalStats, { render: false });
      await Promise.all([profileSave, leaderboardSave, presenceSave]);
      playerCities().forEach(city => localDirtyCityIds.delete(city.id));
      onlineLastError = "";
      renderCities(true);
      renderHud();
      return Boolean(syncResult?.ok ?? true);
    }
    if (api.updateOwnedCityIdentityAcrossIslands) {
      await Promise.all([
        api.updateOwnedCityIdentityAcrossIslands(islandIds, {
          ownerName: nextOwnerName,
          ownerFlag: nextFlag,
          ownerKingPower: nextKingPower,
        }),
        profileSave,
        leaderboardSave,
        presenceSave,
      ]);
      playerCities().forEach(city => localDirtyCityIds.delete(city.id));
      onlineLastError = "";
      renderCities(true);
      renderHud();
      return true;
    }

    const owned = await withTimeout(
      api.loadOwnedCitiesAcrossIslands(islandIds),
      6500,
      "Owned city flag lookup is taking too long."
    );
    const normalized = (Array.isArray(owned) ? owned : [])
      .map(city => normalizeOwnedCitySnapshot({
        ...city,
        islandId: city.islandId || getOnlineIslandId(getCityRegionId(city)),
        ownerName: nextOwnerName,
        ownerFlag: nextFlag,
        ownerKingPower: nextKingPower,
      }))
      .filter(Boolean);
    const byIsland = new Map();
    normalized.forEach(city => {
      const islandId = city.islandId || getOnlineIslandId(getCityRegionId(city));
      if (!byIsland.has(islandId)) byIsland.set(islandId, []);
      byIsland.get(islandId).push({
        ...city,
        ownerName: nextOwnerName,
        ownerFlag: nextFlag,
        ownerKingPower: nextKingPower,
      });
    });

    await Promise.all([
      ...[...byIsland.entries()].map(([islandId, cities]) => api.savePlayerCities(islandId, cities)),
      profileSave,
      leaderboardSave,
      presenceSave,
    ]);
    mergeOwnedCitySnapshots(normalized, { complete: true });
    normalized.forEach(city => localDirtyCityIds.delete(city.id));
    onlineLastError = "";
    renderCities(true);
    renderHud();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    console.warn("Could not sync player flag across owned cities", error);
    await Promise.allSettled([profileSave, leaderboardSave, presenceSave]);
    return false;
  }
}

function shouldDeactivatePeaceShieldForPlayerAttack(target) {
  if (!target || target.owner === "player") return false;
  return isRewardCampTarget(target) || isStronghold(target) || isAnotherPlayerOwnedCity(target);
}

function deactivatePeaceShieldForPlayerAttack(target) {
  if (!state || !shouldDeactivatePeaceShieldForPlayerAttack(target)) return false;
  if (!getActivePeaceShieldExpiresAtMs()) return false;
  const effects = ensureItemEffects();
  effects.shieldExpiresAtMs = 0;
  refreshOwnedCityItemEffectMetadata(true);
  addLog(`Royal Peace Shield deactivated because you attacked ${target.name}.`);
  saveGame();
  updateShieldStatusBadge();
  renderCities(true);
  syncPeaceShieldToAllOwnedCities(0);
  return true;
}

function getPeaceShieldAttackWarning(target) {
  const remaining = getPeaceShieldRemainingSeconds();
  if (!remaining || !shouldDeactivatePeaceShieldForPlayerAttack(target)) return "";
  return `Royal Peace Shield active: attacking ${target.name} will deactivate it and remove protection from all your cities with ${formatDuration(remaining)} remaining.`;
}

function createOnlineEntryState(playerName) {
  const entry = newGame(playerName);
  entry.mainCityId = "";
  entry.cities = getPlayableBaseCities().map(createNeutralCityFromBase);
  entry.attacks = [];
  entry.log = ["Connecting to the live Crownlands world."];
  return entry;
}

function getSkillMaxLevel(skill = "") {
  const config = SKILL_CONFIG[skill];
  if (!config || !Number.isFinite(config.maxPercent)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.ceil(config.maxPercent / Math.max(1, config.percentPerLevel)));
}

function normalizeSkillUpgradeLevel(skill = "", value = 0) {
  return Math.min(Math.max(0, Math.floor(Number(value) || 0)), getSkillMaxLevel(skill));
}

function normalizeUpgrades(upgrades, sourceVersion = 6) {
  const normalized = createDefaultSkills();

  for (const key of SKILL_ORDER) {
    const value = Number(upgrades?.[key]);
    if (Number.isFinite(value) && value >= 0) normalized[key] = Math.floor(value);
  }

  const oldAttack = normalizeLegacySkillLevel(upgrades?.attack, sourceVersion, 0.08);
  const oldIncome = normalizeLegacySkillLevel(upgrades?.income, sourceVersion, 0.14);
  const oldDefense = normalizeLegacySkillLevel(upgrades?.defense, sourceVersion, 0.08);
  const oldSpeed = normalizeLegacySkillLevel(upgrades?.speed, sourceVersion, 0.06);

  normalized.swordmastery = Math.max(normalized.swordmastery, oldAttack, Math.floor(Number(upgrades?.striker) || 0));
  normalized.taxStewardship = Math.max(normalized.taxStewardship, oldIncome, Math.floor(Number(upgrades?.prosperous) || 0));
  normalized.royalGranaries = Math.max(normalized.royalGranaries, oldIncome, Math.floor(Number(upgrades?.recruiter) || 0));
  normalized.stoneworks = Math.max(normalized.stoneworks, oldDefense, Math.floor(Number(upgrades?.guardian) || 0));
  normalized.marchOrders = Math.max(normalized.marchOrders, oldSpeed, Math.floor(Number(upgrades?.rusher) || 0));
  normalized.fieldMedics = Math.max(
    normalized.fieldMedics,
    Math.floor(Number(upgrades?.fearless) || 0),
    Math.floor(Number(upgrades?.brave) || 0),
  );
  SKILL_ORDER.forEach(key => {
    normalized[key] = normalizeSkillUpgradeLevel(key, normalized[key]);
  });

  return normalized;
}

function createDefaultSkills() {
  return SKILL_ORDER.reduce((skills, key) => {
    skills[key] = 0;
    return skills;
  }, {});
}

function normalizeLegacySkillLevel(value, sourceVersion, multiplierGain) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  if (Number(sourceVersion) <= 3 && numeric >= 1) {
    return Math.max(0, Math.round((numeric - 1) / multiplierGain));
  }
  return Math.floor(numeric);
}
function normalizeMarchPercent(value) {
  const percent = Number(value);
  const allowed = [0.25, 0.5, 0.8, 1];
  return allowed.includes(percent) ? percent : DEFAULT_MARCH_PERCENT;
}

function createDefaultFlag() {
  return { primary: "#1f5f91", secondary: "#d3a62e", pattern: "diagonal", symbol: "crown" };
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function createRandomFlag() {
  const primaryOptions = FLAG_COLORS.filter(color => color !== "#d9e2e8");
  const primary = randomFrom(primaryOptions) || createDefaultFlag().primary;
  const secondaryOptions = FLAG_COLORS.filter(color => color !== primary);
  return {
    primary,
    secondary: randomFrom(secondaryOptions) || createDefaultFlag().secondary,
    pattern: randomFrom(FLAG_PATTERNS)?.key || createDefaultFlag().pattern,
    symbol: randomFrom(FLAG_SYMBOLS)?.key || createDefaultFlag().symbol,
  };
}

function normalizeFlag(flag) {
  const defaults = createDefaultFlag();
  return {
    primary: FLAG_COLORS.includes(flag?.primary) ? flag.primary : defaults.primary,
    secondary: FLAG_COLORS.includes(flag?.secondary) ? flag.secondary : defaults.secondary,
    pattern: FLAG_PATTERNS.some(option => option.key === flag?.pattern) ? flag.pattern : defaults.pattern,
    symbol: FLAG_SYMBOLS.some(option => option.key === flag?.symbol) ? flag.symbol : defaults.symbol,
  };
}

function setTextIfChanged(element, value) {
  if (!element) return;
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}


function createCharacterProgress() {
  return { level: CHARACTER_START_LEVEL, xp: CHARACTER_START_XP, skillPoints: 0 };
}

function normalizeCharacterProgress(character) {
  const normalized = createCharacterProgress();
  if (character && typeof character === "object") {
    normalized.level = Math.max(1, Math.floor(Number(character.level) || CHARACTER_START_LEVEL));
    normalized.xp = Math.max(0, Math.floor(Number(character.xp) || CHARACTER_START_XP));
    normalized.skillPoints = Math.max(0, Math.floor(Number(character.skillPoints) || 0));
  }

  // If an old save somehow has enough stored XP, cleanly apply all earned levels.
  while (normalized.xp >= getXpRequiredForLevel(normalized.level)) {
    normalized.xp -= getXpRequiredForLevel(normalized.level);
    normalized.level += 1;
  }
  return normalized;
}

function syncCharacterSkillPoints(character, upgrades, rawSkillPoints = undefined) {
  if (!character) return;
  const expectedPoints = getAvailableSkillPoints(character, upgrades);
  const rawSavedPoints = Number.isFinite(Number(rawSkillPoints)) ? Number(rawSkillPoints) : Number(character.skillPoints);
  const savedPoints = Math.max(0, Math.floor(Number.isFinite(rawSavedPoints) ? rawSavedPoints : 0));
  character.skillPoints = expectedPoints;
  return savedPoints !== expectedPoints;
}

function getEarnedSkillPoints(character = state?.character) {
  return Math.max(0, Math.floor(Number(character?.level) || 1) - 1);
}

function getSpentSkillPoints(upgrades = state?.upgrades) {
  const normalized = normalizeUpgrades(upgrades);
  return SKILL_ORDER.reduce((total, key) => total + normalizeSkillUpgradeLevel(key, normalized[key]), 0);
}

function getAvailableSkillPoints(character = state?.character, upgrades = state?.upgrades) {
  return Math.max(0, getEarnedSkillPoints(character) - getSpentSkillPoints(upgrades));
}

function reconcileSkillPoints(character = state?.character, upgrades = state?.upgrades) {
  if (!character) return false;
  return syncCharacterSkillPoints(character, upgrades, character.skillPoints);
}

function getXpRequiredForLevel(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
  const base = 150 + current * 65 + Math.pow(current, 2.05) * 35;
  let multiplier = 1;
  if (current > HERO_XP_SOFT_CAP_LEVEL) {
    multiplier += Math.pow(
      (current - HERO_XP_SOFT_CAP_LEVEL) / HERO_XP_POST_50_SPAN,
      HERO_XP_POST_50_EXPONENT
    ) * HERO_XP_POST_50_MULTIPLIER;
  }
  if (current > HERO_XP_HARD_CAP_LEVEL) {
    multiplier += Math.pow(
      (current - HERO_XP_HARD_CAP_LEVEL) / HERO_XP_POST_100_SPAN,
      HERO_XP_POST_100_EXPONENT
    ) * HERO_XP_POST_100_MULTIPLIER;
  }
  return Math.floor(base * multiplier);
}

function getLevelUpGoldUpgradeShare(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
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
  const current = Math.max(1, Math.floor(Number(level) || 1));
  if (current <= HERO_XP_SOFT_CAP_LEVEL) return LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS;
  if (current <= HERO_XP_HARD_CAP_LEVEL) {
    const progress = (current - HERO_XP_SOFT_CAP_LEVEL)
      / (HERO_XP_HARD_CAP_LEVEL - HERO_XP_SOFT_CAP_LEVEL);
    return LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS
      + (LEVEL_UP_GOLD_MID_END_PRODUCTION_HOURS - LEVEL_UP_GOLD_EARLY_PRODUCTION_HOURS) * progress;
  }
  return LEVEL_UP_GOLD_END_PRODUCTION_HOURS;
}

function getLevelUpGoldReward(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
  const legacyReward = 250 + current * 60 + Math.pow(current, 1.25) * 25;
  const referenceCityLevel = Math.max(1, current - 1);
  const referenceUpgradeCost = getCityUpgradeCostAtLevel(referenceCityLevel, 0);
  const upgradeRelief = Number.isFinite(referenceUpgradeCost)
    ? referenceUpgradeCost * getLevelUpGoldUpgradeShare(current)
    : 0;
  const productionRelief = getMillionLordsPassiveGoldPerHour(current)
    * getLevelUpGoldProductionHours(current);
  return Math.floor(Math.max(legacyReward, Math.min(upgradeRelief, productionRelief)));
}

function getLevelUpTroopRewardHours(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
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
  const current = Math.max(1, Math.floor(Number(level) || 1));
  const production = getCityStats({ level: current }, {
    includeSkillBoosts: false,
    includeTimedItemBoosts: false,
  });
  return Math.floor(Math.max(
    50,
    production.troopProductionPerHour * getLevelUpTroopRewardHours(current)
  ));
}

function getMainRewardCity(excludeCityId = null) {
  const main = state?.mainCityId ? cityById(state.mainCityId) : null;
  if (main?.owner === "player" && main.id !== excludeCityId && !isStronghold(main)) return main;
  return playerRegularCities().find(city => city.id !== excludeCityId) || null;
}

function getLevelUpRewardBundle(fromLevel, toLevel, options = {}) {
  const startLevel = Math.max(1, Math.floor(Number(fromLevel) || 1));
  const endLevel = Math.max(startLevel, Math.floor(Number(toLevel) || startLevel));
  let calculatedGold = 0;
  let calculatedTroops = 0;
  for (let level = startLevel + 1; level <= endLevel; level += 1) {
    calculatedGold += getLevelUpGoldReward(level);
    calculatedTroops += getLevelUpTroopReward(level);
  }
  const hasGoldOverride = Number.isFinite(Number(options.gold));
  const hasTroopOverride = Number.isFinite(Number(options.troops));
  return {
    fromLevel: startLevel,
    toLevel: endLevel,
    levelsGained: endLevel - startLevel,
    skillPoints: endLevel - startLevel,
    gold: Math.max(0, Math.floor(hasGoldOverride ? Number(options.gold) : calculatedGold)),
    troops: Math.max(0, Math.floor(hasTroopOverride ? Number(options.troops) : calculatedTroops)),
    cityName: String(options.cityName || getMainRewardCity()?.name || "your main city").trim() || "your main city",
  };
}

function mergeLevelUpRewardBundles(first, second) {
  return {
    fromLevel: first.fromLevel,
    toLevel: second.toLevel,
    levelsGained: first.levelsGained + second.levelsGained,
    skillPoints: first.skillPoints + second.skillPoints,
    gold: first.gold + second.gold,
    troops: first.troops + second.troops,
    cityName: second.cityName || first.cityName,
  };
}

function formatLevelUpRewardAmount(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
}

function renderLevelUpReward(reward) {
  if (!reward || !levelUpRewardTitle || !levelUpRewardSubtitle || !levelUpRewardBody) return;
  const multipleLevels = reward.levelsGained > 1;
  levelUpRewardTitle.textContent = multipleLevels
    ? `${formatLevelUpRewardAmount(reward.levelsGained)} Levels Gained`
    : `Level ${formatLevelUpRewardAmount(reward.toLevel)} Reached`;
  levelUpRewardSubtitle.textContent = multipleLevels
    ? `Your hero advanced from level ${formatLevelUpRewardAmount(reward.fromLevel)} to ${formatLevelUpRewardAmount(reward.toLevel)}.`
    : "Your hero grew stronger. These rewards are yours.";
  levelUpRewardBody.innerHTML = `
    <div class="level-up-step" aria-label="Level ${formatLevelUpRewardAmount(reward.fromLevel)} to level ${formatLevelUpRewardAmount(reward.toLevel)}">
      <span>Level ${formatLevelUpRewardAmount(reward.fromLevel)}</span>
      <strong aria-hidden="true">→</strong>
      <span class="current">Level ${formatLevelUpRewardAmount(reward.toLevel)}</span>
    </div>
    <section class="level-up-reward-grid" aria-label="Level-up rewards">
      <article class="level-up-reward-item skill">
        <span class="level-up-reward-icon" aria-hidden="true">✦</span>
        <div>
          <small>Skill ${reward.skillPoints === 1 ? "Point" : "Points"}</small>
          <strong>+${formatLevelUpRewardAmount(reward.skillPoints)}</strong>
          <p>Ready to spend in your hero profile.</p>
        </div>
      </article>
      <article class="level-up-reward-item gold">
        <span class="level-up-reward-icon" aria-hidden="true">
          <img src="assets/gold-pickup.png" alt="" />
        </span>
        <div>
          <small>Gold</small>
          <strong>+${formatLevelUpRewardAmount(reward.gold)}</strong>
          <p>Added to your kingdom treasury.</p>
        </div>
      </article>
      <article class="level-up-reward-item troops">
        <span class="level-up-reward-icon" aria-hidden="true">
          <img src="assets/troop-pickup.png" alt="" />
        </span>
        <div>
          <small>Troops</small>
          <strong>+${formatLevelUpRewardAmount(reward.troops)}</strong>
          <p>Rallied directly to ${escapeHtml(reward.cityName)}.</p>
        </div>
      </article>
    </section>
    <div class="level-up-troop-destination">
      <img src="assets/troop-pickup.png" alt="" aria-hidden="true" />
      <span>
        <small>Troop destination</small>
        <strong>${escapeHtml(reward.cityName)}</strong>
      </span>
    </div>
  `;
}

function showNextLevelUpReward() {
  if (!levelUpRewardModal || levelUpRewardModal.open || activeLevelUpReward || modal?.open) return;
  const nextReward = levelUpRewardQueue.shift();
  if (!nextReward) return;
  activeLevelUpReward = nextReward;
  renderLevelUpReward(nextReward);
  levelUpRewardModal.showModal();
  requestAnimationFrame(() => levelUpRewardModal.classList.add("revealed"));
}

function queueLevelUpReward(fromLevel, toLevel, options = {}) {
  const reward = getLevelUpRewardBundle(fromLevel, toLevel, options);
  if (reward.levelsGained <= 0) return;

  if (activeLevelUpReward && activeLevelUpReward.toLevel === reward.fromLevel) {
    activeLevelUpReward = mergeLevelUpRewardBundles(activeLevelUpReward, reward);
    renderLevelUpReward(activeLevelUpReward);
    return;
  }

  const pendingReward = levelUpRewardQueue[levelUpRewardQueue.length - 1];
  if (pendingReward && pendingReward.toLevel === reward.fromLevel) {
    levelUpRewardQueue[levelUpRewardQueue.length - 1] = mergeLevelUpRewardBundles(pendingReward, reward);
  } else {
    levelUpRewardQueue.push(reward);
  }
  setTimeout(showNextLevelUpReward, 0);
}

function getLoadedMainCity() {
  if (!state?.mainCityId) return null;
  const main = cityById(state.mainCityId);
  return main?.owner === "player" && !isStronghold(main) ? main : null;
}

function getMainCityReference() {
  if (!state?.mainCityId) return null;
  const loaded = cityById(state.mainCityId);
  if (loaded?.owner === "player" && !isStronghold(loaded)) return loaded;
  if (loaded && getCityRegionId(loaded) === getActiveMapRegionId()) return null;
  const base = getPlayableBaseCityById(state.mainCityId);
  if (isStronghold(base)) return null;
  return base ? { ...base, owner: "player", isMainCity: true } : null;
}

function getMainCityRegionId() {
  return normalizeRegionId(state?.mainCityId ? getCityRegionId(state.mainCityId) : state?.online?.mainRegionId || getActiveOnlineRegionId());
}

function getKnownOwnedRegularCities() {
  if (!state) return [];
  const merged = new Map();
  onlineOwnedCitiesCache.forEach(city => {
    const normalized = normalizeOwnedCitySnapshot(city);
    if (normalized && !isStronghold(normalized)) merged.set(normalized.id, normalized);
  });
  playerRegularCities().forEach(city => {
    const normalized = normalizeOwnedCitySnapshot({
      ...city,
      islandId: getOnlineIslandId(getCityRegionId(city)),
    });
    if (normalized && !isStronghold(normalized)) merged.set(normalized.id, normalized);
  });
  return Array.from(merged.values());
}

function resolveSingleMainCityId(preferredCityId = "") {
  if (!state) return "";
  const preferredId = getKnownCityId(preferredCityId);
  const currentId = getKnownCityId(state.mainCityId);
  const ownedCities = getKnownOwnedRegularCities();
  const ownedIds = new Set(ownedCities.map(city => city.id));
  if (preferredId && ownedIds.has(preferredId)) return preferredId;
  if (currentId && (!ownedIds.size || ownedIds.has(currentId))) return currentId;
  const flagged = ownedCities.find(city => city.isMainCity && !isStronghold(city));
  return flagged?.id || ownedCities[0]?.id || currentId || preferredId || "";
}

function normalizeSingleMainCityAssignment(preferredCityId = "", { markDirty = false } = {}) {
  if (!state) return { mainCityId: "", changed: false };
  const mainCityId = resolveSingleMainCityId(preferredCityId);
  let changed = false;
  if (mainCityId && state.mainCityId !== mainCityId) {
    state.mainCityId = mainCityId;
    changed = true;
  }

  if (mainCityId && state.online) {
    const mainRegionId = getCityRegionId(mainCityId);
    if (state.online.mainCityId !== mainCityId) {
      state.online.mainCityId = mainCityId;
      changed = true;
    }
    if (state.online.mainRegionId !== mainRegionId) {
      state.online.mainRegionId = mainRegionId;
      changed = true;
    }
    const mainIslandId = getOnlineIslandId(mainRegionId);
    if (state.online.mainIslandId !== mainIslandId) {
      state.online.mainIslandId = mainIslandId;
      changed = true;
    }
  }

  if (Array.isArray(state.cities)) {
    state.cities.forEach(city => {
      if (city.owner !== "player") return;
      if (isStronghold(city)) {
        if (city.isMainCity) {
          city.isMainCity = false;
          changed = true;
        }
        return;
      }
      const shouldBeMain = Boolean(mainCityId && city.id === mainCityId);
      if (city.isMainCity !== shouldBeMain) {
        city.isMainCity = shouldBeMain;
        changed = true;
        if (markDirty) markOwnedCityChanged(city, false);
      }
    });
  }

  if (onlineOwnedCitiesCache.length) {
    onlineOwnedCitiesCache = onlineOwnedCitiesCache.map(city => {
      const shouldBeMain = Boolean(mainCityId && city.id === mainCityId && !isStronghold(city));
      if (Boolean(city.isMainCity) === shouldBeMain) return city;
      changed = true;
      return { ...city, isMainCity: shouldBeMain };
    });
    updateIslandSummariesFromOwnedCityCache();
  }

  return { mainCityId, changed };
}

async function syncSingleMainCityAssignmentToOnline(mainCityId = state?.mainCityId || "", { refreshFirst = false } = {}) {
  if (!state || !mainCityId || !isOnlineWorldActive()) return false;
  const api = getOnlineApi();
  if (!api?.repairMainCityAssignment || !api?.isSignedIn?.()) return false;
  if (refreshFirst && api.loadOwnedCitiesAcrossIslands) {
    await refreshAllOwnedCities(true).catch(error => {
      console.warn("Could not refresh owned cities before main city repair", error);
      return false;
    });
  }

  const result = await api.repairMainCityAssignment({ mainCityId: getKnownCityId(mainCityId) });
  applyServerEconomyResult(result);
  const repairedMainCityId = getKnownCityId(result?.currentUser?.mainCityId) || getKnownCityId(mainCityId);
  if (repairedMainCityId) {
    state.mainCityId = repairedMainCityId;
    if (state.online) {
      state.online.mainCityId = repairedMainCityId;
      state.online.mainRegionId = normalizeRegionId(result?.currentUser?.mainRegionId || state.online.mainRegionId);
      state.online.mainIslandId = result?.currentUser?.mainIslandId || state.online.mainIslandId || getOnlineIslandId(state.online.mainRegionId);
    }
    normalizeSingleMainCityAssignment(repairedMainCityId, { markDirty: false });
  }
  return Boolean(result?.ok ?? true);
}

function getMainCityChangeCooldownDurationMs(ownedCount = getOwnedRegularCityCountForDisplay()) {
  return ownedCount < MAIN_CITY_CHANGE_CITY_LIMIT
    ? MAIN_CITY_CHANGE_SMALL_KINGDOM_COOLDOWN_MS
    : MAIN_CITY_CHANGE_LARGE_KINGDOM_COOLDOWN_MS;
}

function getMainCityChangeCooldownRemainingMs(now = Date.now(), ownedCount = getOwnedRegularCityCountForDisplay()) {
  if (!state) return 0;
  const lastChangedAt = normalizeTimestampMs(state.mainCityChangedAtMs);
  if (!lastChangedAt) return 0;
  const currentTime = Math.max(0, Number(now) || Date.now());
  const elapsed = Math.max(0, currentTime - Math.min(lastChangedAt, currentTime));
  return Math.max(0, getMainCityChangeCooldownDurationMs(ownedCount) - elapsed);
}

function getMainCityChangeStatus(city, now = Date.now()) {
  const ownedCount = state ? getOwnedRegularCityCountForDisplay() : 0;
  const cooldownDurationMs = getMainCityChangeCooldownDurationMs(ownedCount);
  const cooldownMs = getMainCityChangeCooldownRemainingMs(now, ownedCount);
  const cooldownText = cooldownMs > 0 ? formatDuration(Math.ceil(cooldownMs / 1000)) : "";
  const isMain = isMainCityForList(city);
  let reason = "";

  if (!state) reason = "Game is not ready.";
  else if (!city) reason = "City is not available.";
  else if (city.owner !== "player") reason = "Only owned cities can become your main city.";
  else if (isStronghold(city)) reason = "Strongholds cannot become your main city.";
  else if (isMain) reason = "This city is already your main city.";
  else if (cooldownMs > 0) reason = `Main city can change again in ${cooldownText}.`;

  return {
    canChange: Boolean(state && city && city.owner === "player" && !isStronghold(city) && !isMain && cooldownMs <= 0),
    cooldownDurationMs,
    cooldownMs,
    cooldownText,
    ownedCount,
    isMain,
    reason,
  };
}

async function changeMainCity(cityId) {
  if (!state) return false;
  const city = cityById(cityId);
  const status = getMainCityChangeStatus(city);
  if (!status.canChange) {
    if (status.reason) showToast(status.reason);
    if (city) showCityInfoModal(city.id);
    return false;
  }

  const previousMain = getLoadedMainCity() || (state.mainCityId ? cityById(state.mainCityId) : null);
  const api = getOnlineApi();
  if (isOnlineWorldActive() && api?.changeMainCity && api?.isSignedIn?.()) {
    try {
      showToast("Changing main city...");
      const result = await api.changeMainCity({
        cityId: city.id,
        regionId: getCityRegionId(city),
        playerName: state.playerName,
        flag: state.flag,
        ownerKingPower: getKingPower(),
      });
      applyServerEconomyResult(result);

      const newMain = result?.mainCity || {};
      const nextMainCityId = getKnownCityId(result?.currentUser?.mainCityId || newMain.id || city.id);
      const nextMainRegionId = normalizeRegionId(result?.currentUser?.mainRegionId || newMain.regionId || getCityRegionId(city));
      if (nextMainCityId) state.mainCityId = nextMainCityId;
      state.mainCityChangedAtMs = normalizeTimestampMs(result?.currentUser?.mainCityChangedAtMs)
        || state.mainCityChangedAtMs
        || Date.now();
      if (state.online) {
        state.online.mainCityId = nextMainCityId;
        state.online.mainRegionId = nextMainRegionId;
        state.online.mainIslandId = result?.currentUser?.mainIslandId || newMain.islandId || getOnlineIslandId(nextMainRegionId);
      }
      normalizeSingleMainCityAssignment(nextMainCityId, { markDirty: false });
      onlineOwnedCitiesCacheComplete = false;
      await refreshAllOwnedCities(true).catch(error => {
        console.warn("Could not refresh owned cities after main city change", error);
        return false;
      });
      addLog(`${city.name} is now your main city.`);
      publishOnlinePresence(true);
      saveGame();
      renderAll();
      showCityInfoModal(nextMainCityId || city.id);
      showToast(`${city.name} is now your main city.`);
      return true;
    } catch (error) {
      showToast(error?.message || "Could not change main city.");
      console.warn("Could not change main city on server", error);
      if (city) showCityInfoModal(city.id);
      return false;
    }
  }

  state.mainCityId = city.id;
  state.mainCityChangedAtMs = Date.now();
  normalizeSingleMainCityAssignment(city.id, { markDirty: true });

  const mainRegionId = getCityRegionId(city);
  if (state.online) {
    state.online.mainCityId = city.id;
    state.online.mainRegionId = mainRegionId;
    state.online.mainIslandId = getOnlineIslandId(mainRegionId);
  }

  if (previousMain && previousMain.id !== city.id) {
    markOwnedCityChanged(previousMain, false);
    syncCityStateToOnline(previousMain);
  }
  markOwnedCityChanged(city, false);
  syncCityStateToOnline(city);

  addLog(`${city.name} is now your main city.`);
  saveGame();
  if (isOnlineWorldActive()) {
    await syncSingleMainCityAssignmentToOnline(city.id, { refreshFirst: true }).catch(error => {
      console.warn("Could not repair remote main city flags", error);
      return false;
    });
    syncOwnedCitiesToOnline(true);
    publishOnlinePresence(true);
    flushOnlineSave(true);
  }
  renderAll();
  showCityInfoModal(city.id);
  showToast(`${city.name} is now your main city.`);
  return true;
}

function addCharacterXp(amount, reason = "progress") {
  if (!state) return;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  reconcileSkillPoints(state.character, state.upgrades);
  const startingLevel = state.character.level;
  const gained = Math.max(0, Math.floor(Number(amount) || 0));
  if (!gained) return;

  state.character.xp += gained;
  addLog(`Hero gained ${formatNumber(gained)} XP from ${reason}.`);

  let levelsGained = 0;
  let totalGoldReward = 0;
  let totalTroopReward = 0;

  while (state.character.xp >= getXpRequiredForLevel(state.character.level)) {
    state.character.xp -= getXpRequiredForLevel(state.character.level);
    state.character.level += 1;
    state.character.skillPoints += 1;
    levelsGained += 1;

    const goldReward = getLevelUpGoldReward(state.character.level);
    const troopReward = getLevelUpTroopReward(state.character.level);
    totalGoldReward += goldReward;
    totalTroopReward += troopReward;
    state.gold += goldReward;
  }

  if (levelsGained > 0) {
    const mainCity = getMainRewardCity();
    if (mainCity && totalTroopReward > 0) {
      mainCity.troopFloat = Math.max(0, Number(mainCity.troopFloat) || mainCity.troops || 0) + totalTroopReward;
      mainCity.troops = Math.floor(mainCity.troopFloat);
      markOwnedCityChanged(mainCity, false);
    }

    addLog(`Hero leveled to ${state.character.level}. Reward: ${formatNumber(levelsGained)} skill point, ${formatNumber(totalGoldReward)} gold, and ${formatNumber(totalTroopReward)} troops to ${mainCity ? mainCity.name : "the main city"}.`);
    showToast(`Hero Lv ${state.character.level}: +${formatNumber(levelsGained)} skill point, +${formatNumber(totalGoldReward)} gold, +${formatNumber(totalTroopReward)} troops`);
    queueLevelUpReward(startingLevel, state.character.level, {
      gold: totalGoldReward,
      troops: totalTroopReward,
      cityName: mainCity?.name || "your main city",
    });
  }
  reconcileSkillPoints(state.character, state.upgrades);
}

function getCaptureXpAward(target, oldOwner, defendersAtStart, attackerOwner = "player") {
  if (isGivenUpNeutralCity(target)) return 0;
  const level = clampCityLevel(target?.level);
  const defenderXp = Math.floor(getBattleXpTroopCredit(target, defendersAtStart) * CAPTURE_XP_PER_DEFENDER);
  const ownerBonus = oldOwner === "enemy" ? ENEMY_CAPTURE_XP_BONUS : 0;
  const baseXp = CAPTURE_XP_BASE + level * CAPTURE_XP_PER_CITY_LEVEL + defenderXp + ownerBonus;
  const efficiency = attackerOwner === "player" ? getCaptureXpEfficiency(target, oldOwner) : 1;
  return capBattleXpForCurrentLevel(Math.floor(baseXp * efficiency));
}

function getCityUpgradeXpAward(city) {
  return Math.floor(CITY_UPGRADE_XP_BASE + clampCityLevel(city?.level) * CITY_UPGRADE_XP_PER_LEVEL);
}

function getDefenseHeldXpAward(attackingTroops, target = null) {
  return Math.floor(DEFENSE_HELD_XP_BASE + getBattleXpTroopCredit(target, attackingTroops) * DEFENSE_HELD_XP_PER_ATTACKER);
}

function getPartialBattleXpAward(fullWinXp) {
  return Math.floor(Math.max(0, Number(fullWinXp) || 0) * FAILED_BATTLE_XP_RATE);
}

function getFailedAttackXpAward(target, oldOwner, defendersAtStart, attackerOwner = "player") {
  return getPartialBattleXpAward(getCaptureXpAward(target, oldOwner, defendersAtStart, attackerOwner));
}

function getCaptureXpEfficiency(target, oldOwner = target?.owner) {
  if (!target || !state) return 1;
  const pvpMultiplier = getPvpOpponentPowerXpMultiplier(target, oldOwner, "player");
  const cooldownMultiplier = getCaptureCooldownRemaining(target) > 0 ? RECENT_CAPTURE_XP_MULTIPLIER : 1;
  if (pvpMultiplier !== null) return Number(clamp(pvpMultiplier * cooldownMultiplier, 0, 2).toFixed(2));

  const heroLevel = Math.max(1, Math.floor(Number(state.character?.level) || 1));
  const empirePressure = 48 + heroLevel * 20 + getOwnedRegularCityCountForDisplay() * 2;
  const targetScore = getCityXpScore(target, oldOwner);
  const strengthEfficiency = clamp(0.35 + targetScore / Math.max(1, empirePressure), 0.25, 2);
  return Number(clamp(strengthEfficiency * cooldownMultiplier, 0.05, 2).toFixed(2));
}

function getCityXpScore(target, oldOwner = target?.owner) {
  const stats = getCityStats(target);
  const ownerBonus = oldOwner === "enemy" ? 45 : oldOwner === "neutral" ? 10 : 60;
  return stats.victoryPoints + getBattleXpTroopCredit(target, target?.troops) * 0.25 + ownerBonus;
}

function getBattleXpTroopCreditCap(target) {
  const stats = getCityStats(target || {});
  return Math.max(
    25,
    Math.floor(
      stats.cityWalls * BATTLE_XP_TROOP_CREDIT_CITY_WALL_MULTIPLIER
      + stats.victoryPoints * BATTLE_XP_TROOP_CREDIT_VP_MULTIPLIER
    )
  );
}

function getBattleXpTroopCredit(target, troops) {
  return Math.min(Math.max(0, Math.floor(Number(troops) || 0)), getBattleXpTroopCreditCap(target));
}

function getPvpOpponentPowerXpMultiplier(target, oldOwner = target?.owner, attackerOwner = "player") {
  if (!target || attackerOwner !== "player") return null;
  if (isStronghold(target) || isRewardCampTarget(target)) return null;
  const targetOwnedByPlayer = oldOwner === "enemy"
    || oldOwner === "player"
    || target.ownerKind === "player"
    || Boolean(String(target.ownerUid || "").trim());
  if (!targetOwnedByPlayer) return null;

  const attackerPower = Math.max(1, normalizePowerValue(getKingPower()));
  const defenderPower = Math.max(1, normalizePowerValue(getCityOwnerKingPowerSnapshot(target)));
  const opponentRatio = defenderPower / attackerPower;
  return getOpponentPowerXpMultiplier(opponentRatio);
}

function getOpponentPowerXpMultiplier(opponentRatio) {
  const ratio = Number(opponentRatio) || 0;
  if (ratio >= 2) return 2;
  if (ratio >= 1.5) return 1.5;
  if (ratio >= 0.5) return 1;
  return 0;
}

function getBattleXpLevelCapRate(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
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

function capBattleXpForCurrentLevel(xp) {
  const base = Math.max(0, Math.floor(Number(xp) || 0));
  if (!state?.character) return base;
  const heroLevel = Math.max(1, Math.floor(Number(state.character.level) || 1));
  const cap = Math.max(250, Math.floor(getXpRequiredForLevel(heroLevel) * getBattleXpLevelCapRate(heroLevel)));
  return Math.min(base, cap);
}

function getCaptureCooldownRemaining(city) {
  if (!state || !city || city.lastCapturedAt === null || city.lastCapturedAt === undefined) return 0;
  const capturedAt = Number(city.lastCapturedAt);
  if (!Number.isFinite(capturedAt)) return 0;
  const elapsed = Math.max(0, state.gameSeconds - capturedAt);
  return Math.max(0, CAPTURE_XP_COOLDOWN_SECONDS - elapsed);
}

function normalizePowerValue(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeGlobalStatsSnapshot(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const cityCountsByRegion = Object.entries(raw.cityCountsByRegion || {}).reduce((counts, [regionId, count]) => {
    const key = normalizeRegionId(regionId);
    if (key) counts[key] = Math.max(0, Math.floor(Number(count) || 0));
    return counts;
  }, {});
  return {
    uid: String(raw.uid || raw.playerId || getCurrentOnlineUid() || "").trim(),
    worldId: String(raw.worldId || ""),
    resetGeneration: String(raw.resetGeneration || ""),
    version: Math.max(0, Math.floor(Number(raw.version) || 0)),
    kingPower: normalizePowerValue(raw.kingPower),
    baseKingPower: normalizePowerValue(raw.baseKingPower ?? raw.kingPower),
    kingPowerBonus: normalizePowerValue(raw.kingPowerBonus),
    totalCities: Math.max(0, Math.floor(Number(raw.totalCities) || 0)),
    totalTroops: Math.max(0, Math.floor(Number(raw.totalTroops) || 0)),
    totalCityTroops: Math.max(0, Math.floor(Number(raw.totalCityTroops) || 0)),
    totalCampTroops: Math.max(0, Math.floor(Number(raw.totalCampTroops) || 0)),
    totalMarchingTroops: Math.max(0, Math.floor(Number(raw.totalMarchingTroops) || 0)),
    totalCityLevels: Math.max(0, Math.floor(Number(raw.totalCityLevels) || 0)),
    totalVictoryPoints: Math.max(0, Math.floor(Number(raw.totalVictoryPoints) || 0)),
    strongholdCount: Math.max(0, Math.floor(Number(raw.strongholdCount) || 0)),
    cityCountsByRegion,
    goldPerHour: Math.max(0, Math.floor(Number(raw.goldPerHour) || 0)),
    troopPerHour: Math.max(0, Math.floor(Number(raw.troopPerHour) || 0)),
    baseGoldPerHour: Math.max(0, Math.floor(Number(raw.baseGoldPerHour ?? raw.goldPerHour) || 0)),
    baseTroopPerHour: Math.max(0, Math.floor(Number(raw.baseTroopPerHour ?? raw.troopPerHour) || 0)),
    untimedGoldPerHour: Math.max(0, Math.floor(Number(raw.untimedGoldPerHour ?? raw.baseGoldPerHour ?? raw.goldPerHour) || 0)),
    untimedTroopPerHour: Math.max(0, Math.floor(Number(raw.untimedTroopPerHour ?? raw.baseTroopPerHour ?? raw.troopPerHour) || 0)),
    sustainableTroopPerHour: Math.max(0, Math.floor(Number(raw.sustainableTroopPerHour) || 0)),
    armyPower: normalizePowerValue(raw.armyPower),
    replacementPower: normalizePowerValue(raw.replacementPower),
    defensivePower: normalizePowerValue(raw.defensivePower),
    baseReplacementPower: normalizePowerValue(raw.baseReplacementPower ?? raw.replacementPower),
    baseDefensivePower: normalizePowerValue(raw.baseDefensivePower ?? raw.defensivePower),
    strongholdBonusesAuthoritative: raw.strongholdBonusesAuthoritative === true,
    strongholdBonusSource: String(raw.strongholdBonusSource || "").slice(0, 32),
    crownCitadelControlled: raw.crownCitadelControlled === true,
    strongholdGoldBonusPercent: Math.max(0, Math.floor(Number(raw.strongholdGoldBonusPercent) || 0)),
    strongholdTroopBonusPercent: Math.max(0, Math.floor(Number(raw.strongholdTroopBonusPercent) || 0)),
    strongholdMarchSpeedBonusPercent: Math.max(0, Math.floor(Number(raw.strongholdMarchSpeedBonusPercent) || 0)),
    strongholdDefenseBonusPercent: Math.max(0, Math.floor(Number(raw.strongholdDefenseBonusPercent) || 0)),
    strongholdUpgradeCostReductionPercent: Math.max(0, Math.floor(Number(raw.strongholdUpgradeCostReductionPercent) || 0)),
    stationedTroopPower: normalizePowerValue(raw.stationedTroopPower),
    campTroopPower: normalizePowerValue(raw.campTroopPower),
    cityPower: normalizePowerValue(raw.cityPower),
    marchingPower: normalizePowerValue(raw.marchingPower),
    troopPower: normalizePowerValue(raw.troopPower),
    territoryPower: normalizePowerValue(raw.territoryPower),
    cityLevelPower: normalizePowerValue(raw.cityLevelPower),
    economicPower: normalizePowerValue(raw.economicPower),
    troopProductionPower: normalizePowerValue(raw.troopProductionPower),
    fortificationPower: normalizePowerValue(raw.fortificationPower),
    strongholdPower: normalizePowerValue(raw.strongholdPower),
    characterLevel: Math.max(1, Math.floor(Number(raw.characterLevel) || 1)),
    mainCityId: getKnownCityId(raw.mainCityId),
    mainIslandId: String(raw.mainIslandId || ""),
    mainRegionId: normalizeRegionId(raw.mainRegionId || getRegionIdFromOnlineIslandId(raw.mainIslandId)),
    updatedAtMs: normalizeTimestampMs(raw.updatedAtMs) || timestampToMs(raw.updatedAt),
  };
}

function hasUsableGlobalStats(stats = getGlobalStatsSnapshot()) {
  return Boolean(stats && (stats.version > 0 || stats.updatedAtMs > 0 || stats.worldId));
}

function getGlobalStatsSnapshot() {
  const stats = normalizeGlobalStatsSnapshot(state?.globalStats || onlineGlobalStats);
  const currentUid = getCurrentOnlineUid();
  if (stats?.uid && currentUid && stats.uid !== currentUid) return null;
  return stats;
}

function getGlobalOwnedCityCountByRegion(regionId) {
  const stats = getGlobalStatsSnapshot();
  if (!hasUsableGlobalStats(stats)) return null;
  if (regionId === null || regionId === undefined || !String(regionId || "").trim()) return stats.totalCities;
  const key = normalizeRegionId(regionId);
  return Math.max(0, Math.floor(Number(stats.cityCountsByRegion?.[key]) || 0));
}

function applyGlobalStatsSnapshot(raw = null, options = {}) {
  if (!state) return false;
  const stats = normalizeGlobalStatsSnapshot(raw);
  if (!stats) return false;
  const currentUid = getCurrentOnlineUid();
  if (stats.uid && currentUid && stats.uid !== currentUid) return false;
  const currentStats = getGlobalStatsSnapshot();
  if (stats.updatedAtMs > 0 && currentStats?.updatedAtMs > 0 && stats.updatedAtMs < currentStats.updatedAtMs) {
    return false;
  }
  const before = JSON.stringify(state.globalStats || onlineGlobalStats || null);
  onlineGlobalStats = stats;
  state.globalStats = stats;
  lastComputedKingPower = stats.kingPower;
  if (stats.mainCityId) {
    state.mainCityId = stats.mainCityId;
    if (state.online) {
      state.online.mainCityId = stats.mainCityId;
      state.online.mainRegionId = stats.mainRegionId || state.online.mainRegionId;
      state.online.mainIslandId = stats.mainIslandId || state.online.mainIslandId;
    }
  }
  rememberPlayerIdentity({
    uid: stats.uid || currentUid,
    playerName: state.playerName,
    flag: state.flag,
    kingPower: stats.kingPower,
    kingPowerVersion: stats.version,
    updatedAtMs: stats.updatedAtMs || Date.now(),
  }, { force: true });
  const changed = before !== JSON.stringify(stats);
  if (changed && options.render !== false) {
    renderHud();
    updateIslandSwitcherUi();
    renderCities();
    if (modal.open && modal.classList.contains("city-list-modal")) renderCityListModal();
    if (profileScreen?.classList.contains("open")) renderProfileScreen();
  }
  return changed;
}

function getPresenceKingPowerByUid(uid) {
  const ownerUid = String(uid || "").trim();
  if (!ownerUid || !Array.isArray(onlinePresence)) return 0;
  const presence = onlinePresence.find(entry => entry?.uid === ownerUid);
  return normalizePowerValue(presence?.kingPower);
}

function getTroopKingPower(troops = 0) {
  const troopCount = Math.max(0, Math.floor(Number(troops) || 0));
  if (!troopCount) return 0;
  const power = troopCount * KING_POWER_ARMY_TROOP_VALUE;
  return Number.isFinite(power) ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(power)) : Number.MAX_SAFE_INTEGER;
}

function getCityInfrastructureKingPowerComponents(city, options = {}) {
  if (!city) return { replacementPower: 0, defensivePower: 0 };
  const troopCount = Math.max(0, Math.floor(Number(city.troops) || 0));
  const stats = getCityStats(city, {
    includeSkillBoosts: false,
    includeStrongholdBoosts: options.includeStrongholdBoosts !== false,
    includeTimedItemBoosts: false,
  });
  const replacementPower = Math.max(0, Math.floor(
    stats.troopProductionPerHour * KING_POWER_REPLACEMENT_HOURS
  ));
  const defensivePower = Math.max(0, Math.floor(
    Math.max(0, stats.totalDefense - troopCount) * KING_POWER_DEFENSIVE_ADVANTAGE_WEIGHT
  ));
  return { replacementPower, defensivePower };
}

function getCityInfrastructureKingPower(city) {
  const components = getCityInfrastructureKingPowerComponents(city);
  return Math.min(Number.MAX_SAFE_INTEGER, components.replacementPower + components.defensivePower);
}

function getCityPowerFloor(city) {
  if (!city) return 0;
  return getCityInfrastructureKingPower(city) + getTroopKingPower(city.troops);
}

function getCityOwnerKingPowerSnapshot(city) {
  if (!city) return 0;
  const currentUid = getCurrentOnlineUid();
  if (city.owner === "player" && (!city.ownerUid || city.ownerUid === currentUid)) return getKingPower();
  const cachedIdentity = playerIdentityCache.get(city.ownerUid);
  if (Math.max(0, Math.floor(Number(cachedIdentity?.kingPowerVersion) || 0)) >= KING_POWER_AUTHORITY_VERSION) {
    return normalizePowerValue(cachedIdentity.kingPower);
  }
  const presence = Array.isArray(onlinePresence)
    ? onlinePresence.find(entry => entry?.uid === city.ownerUid)
    : null;
  return Math.max(
    Math.max(0, Math.floor(Number(city.kingPowerVersion) || 0)) >= KING_POWER_AUTHORITY_VERSION
      ? normalizePowerValue(city.ownerKingPower)
      : 0,
    Math.max(0, Math.floor(Number(presence?.kingPowerVersion) || 0)) >= KING_POWER_AUTHORITY_VERSION
      ? normalizePowerValue(presence?.kingPower)
      : 0,
    getCityPowerFloor(city)
  );
}

function getAuthoritativeCityOwnerKingPowerSnapshot(city) {
  if (!city) return 0;
  const currentUid = getCurrentOnlineUid();
  if (city.owner === "player" && (!city.ownerUid || city.ownerUid === currentUid)) return getKingPower();
  const cachedIdentity = playerIdentityCache.get(city.ownerUid);
  const cachedPower = cachedIdentity?.authoritative
    && Math.max(0, Math.floor(Number(cachedIdentity.kingPowerVersion) || 0)) >= KING_POWER_AUTHORITY_VERSION
    ? normalizePowerValue(cachedIdentity.kingPower)
    : 0;
  if (cachedPower > 0) return cachedPower;
  const presence = Array.isArray(onlinePresence)
    ? onlinePresence.find(entry => entry?.uid === city.ownerUid)
    : null;
  return Math.max(0, Math.floor(Number(presence?.kingPowerVersion) || 0)) >= KING_POWER_AUTHORITY_VERSION
    ? normalizePowerValue(presence.kingPower)
    : 0;
}

function getCompatibleCityOwnerKingPowerSnapshot(city) {
  if (!city) return 0;
  const currentUid = getCurrentOnlineUid();
  if (city.owner === "player" && (!city.ownerUid || city.ownerUid === currentUid)) return getKingPower();
  const cachedIdentity = playerIdentityCache.get(city.ownerUid);
  const cachedPower = Math.max(0, Math.floor(Number(cachedIdentity?.kingPowerVersion) || 0))
    >= KING_POWER_COMPATIBILITY_VERSION
    ? normalizePowerValue(cachedIdentity.kingPower)
    : 0;
  if (cachedPower > 0) return cachedPower;
  const presence = Array.isArray(onlinePresence)
    ? onlinePresence.find(entry => entry?.uid === city.ownerUid)
    : null;
  return Math.max(
    Math.max(0, Math.floor(Number(city.kingPowerVersion) || 0)) >= KING_POWER_COMPATIBILITY_VERSION
      ? normalizePowerValue(city.ownerKingPower)
      : 0,
    Math.max(0, Math.floor(Number(presence?.kingPowerVersion) || 0)) >= KING_POWER_COMPATIBILITY_VERSION
      ? normalizePowerValue(presence?.kingPower)
      : 0
  );
}

async function ensureAuthoritativeCityOwnerKingPower(city) {
  const existingPower = getAuthoritativeCityOwnerKingPowerSnapshot(city);
  if (existingPower > 0 || !city || city.owner !== "enemy") return existingPower;
  const ownerUid = String(city.ownerUid || "").trim();
  const api = getOnlineApi();
  if (!ownerUid || !api?.isSignedIn?.()) return 0;
  try {
    const identity = api?.getCombatPlayerIdentity
      ? await withTimeout(
        api.getCombatPlayerIdentity({ uid: ownerUid }),
        6000,
        "Kingdom strength check is taking too long."
      )
      : null;
    if (identity) {
      rememberPlayerIdentity(identity, { force: true });
    } else if (api?.loadPlayerIdentities) {
      const rows = await withTimeout(
        api.loadPlayerIdentities([ownerUid]),
        3500,
        "Kingdom strength check is taking too long."
      );
      rememberPlayerIdentities(Array.isArray(rows) ? rows : [], { force: true });
    }
    if (applyCanonicalPlayerIdentityToRecord(city)) renderCities(true);
    return getAuthoritativeCityOwnerKingPowerSnapshot(city);
  } catch (error) {
    console.warn("Could not load authoritative defender King Power", error);
    return 0;
  }
}

function getDemoAttackTier(powerRatio) {
  const ratio = Number(powerRatio) || 0;
  return DEMO_ATTACK_TIERS.find(tier => ratio >= tier.minRatio) || null;
}

function getEnemyCityPowerBand(
  city,
  playerKingPower = getKingPower(),
  defenderKingPower = getCompatibleCityOwnerKingPowerSnapshot(city)
) {
  if (!city || city.owner !== "enemy" || isStronghold(city)) return "";
  const attackerPower = Math.max(1, normalizePowerValue(playerKingPower));
  const defenderPower = normalizePowerValue(defenderKingPower);
  if (defenderPower <= 0) return "in-range";
  if (getDemoAttackTier(attackerPower / defenderPower)) return "protected";
  if (defenderPower > attackerPower) return "overpowering";
  return "in-range";
}

function getEnemyCityPowerBandLabel(powerBand) {
  if (powerBand === "protected") return "Weaker kingdom protection applies";
  if (powerBand === "overpowering") return "King Power above yours";
  if (powerBand === "in-range") return "Within your King Power range";
  return "";
}

function normalizeDemoAttackSnapshot(demo = null) {
  if (!demo || typeof demo !== "object" || !demo.active) return null;
  const attackerKingPower = normalizePowerValue(demo.attackerKingPower);
  const defenderKingPower = Math.max(1, normalizePowerValue(demo.defenderKingPower));
  const powerRatio = Number.isFinite(Number(demo.powerRatio))
    ? Number(demo.powerRatio)
    : attackerKingPower / Math.max(1, defenderKingPower);
  const tier = getDemoAttackTier(powerRatio);
  if (!tier) return null;
  const maxTroops = Math.max(1, Math.floor(Number(demo.maxTroops) || 1));
  const requestedTroops = Math.max(1, Math.floor(Number(demo.requestedTroops) || maxTroops));
  const effectiveTroops = Math.max(1, Math.min(maxTroops, Math.floor(Number(demo.effectiveTroops) || maxTroops)));
  const attackPowerPercent = clamp(Math.floor(Number(demo.attackPowerPercent) || tier.attackPowerPercent), 1, 100);
  const troopCapPercent = clamp(Math.floor(Number(demo.troopCapPercent) || tier.troopCapPercent), 1, 100);
  const travelMultiplier = Math.max(1, Number(demo.travelMultiplier) || tier.travelMultiplier);
  return {
    active: true,
    label: String(demo.label || tier.label || "Demo Attack"),
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

function createDemoAttackSnapshot(source, target, requestedTroops, owner = "player", overrides = {}) {
  if (!source || !target || owner !== "player") return null;
  if (target.owner === owner) return null;
  if (isStronghold(target)) return null;
  const targetOwnerUid = String(target.ownerUid || "").trim();
  const currentUid = getCurrentOnlineUid();
  const targetOwnedByPlayer = target.ownerKind === "player" || target.owner === "enemy" || Boolean(targetOwnerUid);
  const targetOwnedByCurrentPlayer = target.owner === "player" || (targetOwnerUid && currentUid && targetOwnerUid === currentUid);
  if (!targetOwnedByPlayer || targetOwnedByCurrentPlayer) return null;

  const attackerKingPower = normalizePowerValue(overrides.attackerKingPower ?? getKingPower());
  const defenderSnapshot = overrides.defenderKingPower === undefined
    ? getAuthoritativeCityOwnerKingPowerSnapshot(target)
    : normalizePowerValue(overrides.defenderKingPower);
  if (defenderSnapshot <= 0) return null;
  const defenderKingPower = Math.max(1, defenderSnapshot);
  const powerRatio = attackerKingPower / Math.max(1, defenderKingPower);
  const tier = getDemoAttackTier(powerRatio);
  if (!tier) return null;

  const sourceTroops = Math.max(1, Math.floor(Number(source.troops) || 1));
  const requested = clamp(Math.floor(Number(requestedTroops) || 1), 1, sourceTroops);
  const targetWalls = Math.max(1, Math.floor(Number(getCityStats(target).cityWalls) || 1));
  const capByWalls = Math.max(1, Math.floor(targetWalls * tier.troopCapPercent / 100));
  const maxTroops = Math.max(1, Math.min(sourceTroops, capByWalls));
  return normalizeDemoAttackSnapshot({
    active: true,
    label: tier.label,
    attackerKingPower,
    defenderKingPower,
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
  const base = Math.max(0, Math.floor(Number(xp) || 0));
  const demo = normalizeDemoAttackSnapshot(demoAttack);
  return demo ? capBattleXpForCurrentLevel(Math.floor(base * demo.defenderXpMultiplier)) : base;
}

function applyDefenseOpponentXpMultiplier(xp, attack, target, demoAttack) {
  const base = Math.max(0, Math.floor(Number(xp) || 0));
  if (isStronghold(target)) return capBattleXpForCurrentLevel(base);
  const demo = normalizeDemoAttackSnapshot(demoAttack);
  if (demo) return applyDemoDefenderXpMultiplier(base, demo);

  const defenderPower = Math.max(1, normalizePowerValue(getKingPower()));
  const attackerPower = Math.max(
    1,
    normalizePowerValue(attack?.attackerKingPower)
      || normalizePowerValue(attack?.ownerKingPower)
      || normalizePowerValue(attack?.troops)
      || getCityPowerFloor(cityById(attack?.fromId))
  );
  const multiplier = getOpponentPowerXpMultiplier(attackerPower / defenderPower);
  return capBattleXpForCurrentLevel(Math.floor(base * multiplier));
}

function getDemoAttackNotice(demoAttack) {
  const demo = normalizeDemoAttackSnapshot(demoAttack);
  if (!demo) return "";
  const cappedText = demo.requestedTroops > demo.effectiveTroops
    ? `${formatNumber(demo.effectiveTroops)} of ${formatNumber(demo.requestedTroops)} selected troops will march`
    : `${formatNumber(demo.effectiveTroops)} troops will march`;
  return `${demo.label}: weaker kingdom protection is active. ${cappedText}, attack power is ${formatNumber(demo.attackPowerPercent)}%, march time is x${demo.travelMultiplier.toFixed(1)}, attacker earns 0 XP, defender XP is x${demo.defenderXpMultiplier}.`;
}

function getDemoAttackReportSuffix(demoAttack) {
  const demo = normalizeDemoAttackSnapshot(demoAttack);
  return demo ? ` ${demo.label}: attacker XP blocked and defender XP x${demo.defenderXpMultiplier}.` : "";
}

function getSkillLevel(skill) {
  return normalizeSkillUpgradeLevel(skill, state?.upgrades?.[skill]);
}

function getSkillPercent(skill) {
  const config = SKILL_CONFIG[skill];
  if (!config) return 0;
  const raw = getSkillRawPercent(skill);
  return Number.isFinite(config.maxPercent) ? Math.min(raw, config.maxPercent) : raw;
}

function getSkillRawPercent(skill) {
  const config = SKILL_CONFIG[skill];
  if (!config) return 0;
  return getSkillLevel(skill) * config.percentPerLevel;
}

function isSkillAtCap(skill) {
  const config = SKILL_CONFIG[skill];
  return Boolean(config && Number.isFinite(config.maxPercent) && getSkillRawPercent(skill) >= config.maxPercent);
}

function skillMultiplier(skill) {
  return Number((1 + getSkillPercent(skill) / 100).toFixed(3));
}

function getControlledCrownCitadel(owner = "player") {
  if (!state || !Array.isArray(state.cities)) return null;
  const loadedCitadel = state.cities.find(city => city.owner === owner && isCrownCitadel(city));
  if (loadedCitadel) return loadedCitadel;
  if (owner !== "player") return null;
  const citadel = getCrownCitadelControlSnapshot();
  const currentUid = getCurrentOnlineUid();
  return currentUid && getCrownCitadelHolderUid() === currentUid ? citadel : null;
}

function getAuthoritativePlayerStrongholdBonuses() {
  if (getControlledCrownCitadel("player")) {
    return {
      source: "crown_citadel",
      crownCitadelControlled: true,
      goldBonusPercent: CROWN_CITADEL_GOLD_BONUS_PERCENT,
      troopBonusPercent: CROWN_CITADEL_TROOP_BONUS_PERCENT,
      marchSpeedBonusPercent: CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT,
      cityDefenseBonusPercent: CROWN_CITADEL_DEFENSE_BONUS_PERCENT,
      upgradeCostReductionPercent: CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT,
    };
  }
  const globalStats = getGlobalStatsSnapshot();
  if (!globalStats?.strongholdBonusesAuthoritative) return null;
  return {
    source: globalStats.strongholdBonusSource || "individual",
    crownCitadelControlled: globalStats.crownCitadelControlled === true,
    goldBonusPercent: globalStats.strongholdGoldBonusPercent,
    troopBonusPercent: globalStats.strongholdTroopBonusPercent,
    marchSpeedBonusPercent: globalStats.strongholdMarchSpeedBonusPercent,
    cityDefenseBonusPercent: globalStats.strongholdDefenseBonusPercent,
    upgradeCostReductionPercent: globalStats.strongholdUpgradeCostReductionPercent,
  };
}

function getControlledStrongholdGoldBonusPercent(owner = "player") {
  if (owner === "player") {
    const authoritative = getAuthoritativePlayerStrongholdBonuses();
    if (authoritative) return authoritative.goldBonusPercent;
  }
  if (getControlledCrownCitadel(owner)) return CROWN_CITADEL_GOLD_BONUS_PERCENT;
  if (!state || !Array.isArray(state.cities)) return 0;
  return state.cities.reduce((total, city) => {
    if (city.owner !== owner || !isGoldStronghold(city)) return total;
    return total + getStrongholdBonusPercent(city);
  }, 0);
}

function getControlledStrongholdTroopBonusPercent(owner = "player") {
  if (owner === "player") {
    const authoritative = getAuthoritativePlayerStrongholdBonuses();
    if (authoritative) return authoritative.troopBonusPercent;
  }
  if (getControlledCrownCitadel(owner)) return CROWN_CITADEL_TROOP_BONUS_PERCENT;
  if (!state || !Array.isArray(state.cities)) return 0;
  return state.cities.reduce((total, city) => {
    if (city.owner !== owner || !isTrainingStronghold(city)) return total;
    return total + getStrongholdBonusPercent(city);
  }, 0);
}

function getControlledStrongholdMarchSpeedPercent(owner = "player") {
  if (owner === "player") {
    const authoritative = getAuthoritativePlayerStrongholdBonuses();
    if (authoritative) return authoritative.marchSpeedBonusPercent;
  }
  if (getControlledCrownCitadel(owner)) return CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT;
  if (!state || !Array.isArray(state.cities)) return 0;
  return state.cities.reduce((total, city) => {
    if (city.owner !== owner || !isSpeedStronghold(city)) return total;
    return total + getStrongholdBonusPercent(city);
  }, 0);
}

function getStrongholdMarchSpeedMultiplier(owner = "player") {
  return 1 + getControlledStrongholdMarchSpeedPercent(owner) / 100;
}

function getCityControllerKey(city) {
  if (!city || city.owner === "neutral" || city.ownerKind === "neutral") return "";
  if (city.ownerKind === "player") {
    if (city.ownerUid) return `player:${city.ownerUid}`;
    if (city.owner === "player") return "player:local";
    return "";
  }
  if (city.owner === "player") return "player:local";
  if (city.owner === "enemy") {
    if (city.ownerUid) return `player:${city.ownerUid}`;
    return "";
  }
  return city.owner || "";
}

function getControlledCrownCitadelForControllerKey(controllerKey) {
  if (!state || !Array.isArray(state.cities) || !controllerKey) return null;
  const loadedCitadel = state.cities.find(city => isCrownCitadel(city) && getCityControllerKey(city) === controllerKey);
  if (loadedCitadel) return loadedCitadel;
  const citadel = getCrownCitadelControlSnapshot();
  return citadel && getCityControllerKey(citadel) === controllerKey ? citadel : null;
}

function getControlledStrongholdCityDefenseBonusPercentForCity(target) {
  if (!state || !Array.isArray(state.cities)) return 0;
  const targetControllerKey = getCityControllerKey(target);
  if (!targetControllerKey) return 0;
  const currentUid = getCurrentOnlineUid();
  if (targetControllerKey === "player:local" || (currentUid && targetControllerKey === `player:${currentUid}`)) {
    const authoritative = getAuthoritativePlayerStrongholdBonuses();
    if (authoritative) return authoritative.cityDefenseBonusPercent;
  }
  if (getControlledCrownCitadelForControllerKey(targetControllerKey)) return CROWN_CITADEL_DEFENSE_BONUS_PERCENT;
  return state.cities.reduce((total, city) => {
    if (!isDefenseStronghold(city) || getCityControllerKey(city) !== targetControllerKey) return total;
    return total + getStrongholdBonusPercent(city);
  }, 0);
}

function getControlledStrongholdUpgradeCostReductionPercent(owner = "player") {
  if (owner === "player") {
    const authoritative = getAuthoritativePlayerStrongholdBonuses();
    if (authoritative) return authoritative.upgradeCostReductionPercent;
  }
  return getControlledCrownCitadel(owner) ? CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT : 0;
}

function clampCityLevel(level) {
  const normalized = Math.floor(Number(level));
  if (!Number.isFinite(normalized)) return 1;
  return clamp(normalized, 1, Number.MAX_SAFE_INTEGER);
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

function dropCapturedCityLevel(city) {
  const previousLevel = clampCityLevel(city?.level);
  if (isStronghold(city)) return { previousLevel, nextLevel: previousLevel };
  const nextLevel = Math.max(1, previousLevel - 1);
  if (city) city.level = nextLevel;
  return { previousLevel, nextLevel };
}

function formatCapturedCityLevelDrop(levelDrop) {
  if (!levelDrop) return "";
  if (levelDrop.previousLevel === levelDrop.nextLevel) return `Level stayed ${formatNumber(levelDrop.nextLevel)}.`;
  return `Level ${formatNumber(levelDrop.previousLevel)} to ${formatNumber(levelDrop.nextLevel)}.`;
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

function getCityStats(city, options = {}) {
  const stronghold = isStronghold(city);
  const level = stronghold ? getStrongholdDefenseLevel(city) : clampCityLevel(city?.level);
  const victoryPoints = Math.floor(
    CITY_LEVEL_STATS.victoryPointsBase
    + level * CITY_LEVEL_STATS.victoryPointsPerLevel
    + Math.pow(level, CITY_LEVEL_STATS.victoryPointsExponent) * CITY_LEVEL_STATS.victoryPointsExponentScale
  );
  const defensePercent = level * CITY_LEVEL_STATS.defensePercentPerLevel;
  const baseCityWalls = getBaseCityWalls(level);
  const includeSkillBoosts = options.includeSkillBoosts !== false;
  const stoneworksPercent = includeSkillBoosts && city?.owner === "player" ? getSkillPercent("stoneworks") : 0;
  const cityWalls = Math.floor(baseCityWalls * (1 + stoneworksPercent / 100));
  const royalGranariesPercent = includeSkillBoosts && city?.owner === "player" ? getSkillPercent("royalGranaries") : 0;
  const taxStewardshipPercent = includeSkillBoosts && city?.owner === "player" ? getSkillPercent("taxStewardship") : 0;
  const includeStrongholdBoosts = options.includeStrongholdBoosts !== false;
  const strongholdGoldBonusPercent = includeStrongholdBoosts && !stronghold && city?.owner === "player"
    ? getControlledStrongholdGoldBonusPercent("player")
    : 0;
  const strongholdTroopBonusPercent = includeStrongholdBoosts && !stronghold && city?.owner === "player"
    ? getControlledStrongholdTroopBonusPercent("player")
    : 0;
  const strongholdDefenseBonusPercent = includeStrongholdBoosts && !stronghold
    ? getControlledStrongholdCityDefenseBonusPercentForCity(city)
    : 0;
  const includeTimedItemBoosts = options.includeTimedItemBoosts !== false;
  const warDrumsTroopBonusPercent = includeTimedItemBoosts && !stronghold && city?.owner === "player" ? getWarDrumsTroopProductionBonusPercent() : 0;
  const royalTaxDecreeGoldBonusPercent = includeTimedItemBoosts && !stronghold && city?.owner === "player" && getActiveRoyalTaxDecreeExpiresAtMs() > Date.now()
    ? ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT
    : 0;
  const baseTroopProductionPerHour = stronghold ? 0 : victoryPoints * CITY_LEVEL_STATS.troopProductionPerVictoryPoint;
  const royalGranariesBonusPerHour = stronghold ? 0 : baseTroopProductionPerHour * royalGranariesPercent / 100;
  const troopProductionPerHour = baseTroopProductionPerHour
    * (1 + royalGranariesPercent / 100)
    * (1 + strongholdTroopBonusPercent / 100)
    * (1 + warDrumsTroopBonusPercent / 100);
  const millionLordsProductionVp = getMillionLordsCityProductionVp(level);
  const rawGoldProductionPerHour = stronghold ? 0 : getMillionLordsPassiveGoldPerHour(level);
  const baseGoldProductionPerHour = rawGoldProductionPerHour;
  const goldProductionPerHour = baseGoldProductionPerHour
    * (1 + taxStewardshipPercent / 100)
    * (1 + strongholdGoldBonusPercent / 100)
    * (1 + royalTaxDecreeGoldBonusPercent / 100);
  const troopDefense = Math.floor((Number(city?.troops) || 0) * (1 + defensePercent / 100));
  const cityWallsBonus = Math.max(0, cityWalls - baseCityWalls);
  const baseTotalDefense = Math.floor(baseCityWalls + troopDefense);
  const preStrongholdTotalDefense = Math.floor(cityWalls + troopDefense);
  const strongholdDefenseBonus = Math.floor(preStrongholdTotalDefense * strongholdDefenseBonusPercent / 100);
  const totalDefense = preStrongholdTotalDefense + strongholdDefenseBonus;
  const totalDefenseBonus = Math.max(0, totalDefense - baseTotalDefense);
  const troopProductionBonusPerHour = Math.max(0, troopProductionPerHour - baseTroopProductionPerHour);
  const goldProductionBonusPerHour = Math.max(0, goldProductionPerHour - baseGoldProductionPerHour);

  return {
    level,
    victoryPoints,
    cityPower: victoryPoints,
    defensePercent,
    baseCityWalls,
    cityWalls,
    cityWallsBonus,
    stoneworksPercent,
    royalGranariesPercent,
    taxStewardshipPercent,
    strongholdGoldBonusPercent,
    strongholdTroopBonusPercent,
    strongholdDefenseBonusPercent,
    strongholdDefenseBonus,
    warDrumsTroopBonusPercent,
    royalTaxDecreeGoldBonusPercent,
    baseTroopProductionPerHour,
    royalGranariesBonusPerHour,
    troopProductionPerHour,
    troopProductionBonusPerHour,
    millionLordsProductionVp,
    rawGoldProductionPerHour,
    baseGoldProductionPerHour,
    goldProductionPerHour,
    goldProductionBonusPerHour,
    troopProductionPerSecond: troopProductionPerHour / 3600,
    goldProductionPerSecond: goldProductionPerHour / 3600,
    troopDefense,
    baseTotalDefense,
    totalDefenseBonus,
    totalDefense,
  };
}

function getBattleDefensePower(city) {
  const stats = getCityStats(city);
  return stats.totalDefense;
}

function getAttackPower(troops, owner) {
  const ownerBoost = owner === "player" ? skillMultiplier("swordmastery") : 1.04;
  return troops * BASE_TROOP_ATTACK_POWER * ownerBoost;
}

function calculateCombatResult(attackTroops, attackOwner, target, options = {}) {
  const troops = Math.max(0, Math.floor(Number(attackTroops) || 0));
  const defendersAtStart = Math.max(0, Math.floor(Number(target?.troops) || 0));
  const demoAttack = normalizeDemoAttackSnapshot(options.demoAttack);
  const attackPower = getAttackPower(troops, attackOwner) * (demoAttack?.attackPowerMultiplier || 1);
  const defensePower = getBattleDefensePower(target);
  const ratio = attackPower / Math.max(1, defensePower);
  const success = attackPower > defensePower;
  const attackerBoost = attackOwner === "player" ? skillMultiplier("swordmastery") : 1.04;
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

function returnSavedTroops(skill, losses, reason, excludeCityId = null) {
  const percent = getSkillPercent(skill);
  const lost = Math.max(0, Math.floor(Number(losses) || 0));
  if (percent <= 0 || lost <= 0) return 0;
  const saved = Math.floor(lost * percent / 100);
  if (saved <= 0) return 0;
  const city = getMainRewardCity(excludeCityId);
  if (!city) return 0;
  city.troopFloat = Math.max(0, Number(city.troopFloat) || city.troops || 0) + saved;
  city.troops = Math.floor(city.troopFloat);
  addLog(`${SKILL_CONFIG[skill].label}: ${formatNumber(saved)} troops returned to ${city.name} from ${reason}.`);
  return saved;
}

function returnSurvivingAttackersToSource(attack, troops, reason = "") {
  const returned = Math.max(0, Math.floor(Number(troops) || 0));
  if (returned <= 0) return 0;
  const source = cityById(attack?.fromId);
  const attackOwnerUid = String(attack?.ownerUid || "").trim();
  const sourceOwnerUid = String(source?.ownerUid || "").trim();
  const sourceBelongsToAttacker = Boolean(source && (
    source.owner === attack?.owner
    || (attackOwnerUid && sourceOwnerUid && attackOwnerUid === sourceOwnerUid)
  ));
  if (!sourceBelongsToAttacker) return 0;

  source.troopFloat = Math.max(0, Number(source.troopFloat) || Number(source.troops) || 0) + returned;
  source.troops = Math.floor(source.troopFloat);

  if (source.owner === "player") {
    markOwnedCityChanged(source, false);
    syncCityStateToOnline(source);
    syncOwnedCitiesToOnline(true);
  } else if (source.ownerKind === "player" && source.ownerUid) {
    syncSharedCityState(source);
  }

  const reasonText = reason ? ` from ${reason}` : "";
  addLog(`${formatNumber(returned)} surviving attackers returned to ${source.name}${reasonText}.`);
  return returned;
}

function currentDailyDateKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDailyCaptureTracker(daily) {
  const today = currentDailyDateKey();
  if (!daily || typeof daily !== "object" || daily.date !== today) {
    return { date: today, neutralCaptures: 0, harvestedBonuses: 0, harvestedGoldBonuses: 0, harvestedTroopBonuses: 0 };
  }
  const legacyHarvested = clamp(Math.floor(Number(daily.harvestedBonuses) || 0), 0, HARVEST_BONUS_DAILY_LIMIT);
  const hasTypedCounts = Number.isFinite(Number(daily.harvestedGoldBonuses)) || Number.isFinite(Number(daily.harvestedTroopBonuses));
  const harvestedGoldBonuses = hasTypedCounts
    ? clamp(Math.floor(Number(daily.harvestedGoldBonuses) || 0), 0, HARVEST_BONUS_DAILY_GOLD_LIMIT)
    : clamp(legacyHarvested, 0, HARVEST_BONUS_DAILY_GOLD_LIMIT);
  const harvestedTroopBonuses = hasTypedCounts
    ? clamp(Math.floor(Number(daily.harvestedTroopBonuses) || 0), 0, HARVEST_BONUS_DAILY_TROOP_LIMIT)
    : clamp(legacyHarvested - harvestedGoldBonuses, 0, HARVEST_BONUS_DAILY_TROOP_LIMIT);
  const harvestedBonuses = clamp(harvestedGoldBonuses + harvestedTroopBonuses, 0, HARVEST_BONUS_DAILY_LIMIT);
  return {
    date: today,
    neutralCaptures: clamp(Math.floor(Number(daily.neutralCaptures) || 0), 0, DAILY_NEUTRAL_CAPTURE_LIMIT),
    harvestedBonuses,
    harvestedGoldBonuses,
    harvestedTroopBonuses,
  };
}

function ensureDailyCaptureTracker() {
  if (!state) return { date: currentDailyDateKey(), neutralCaptures: 0, harvestedBonuses: 0, harvestedGoldBonuses: 0, harvestedTroopBonuses: 0 };
  state.daily = normalizeDailyCaptureTracker(state.daily);
  return state.daily;
}

function normalizeHarvestBonusType(type) {
  return HARVEST_BONUS_TYPES.includes(type) ? type : "gold";
}

function normalizeHarvestBonuses(bonuses) {
  if (!Array.isArray(bonuses)) return [];
  return bonuses
    .map(bonus => ({
      id: String(bonus?.id || ""),
      type: normalizeHarvestBonusType(bonus?.type),
      regionId: normalizeRegionId(bonus?.regionId),
      x: Number(bonus?.x),
      y: Number(bonus?.y),
      createdAt: Math.max(0, Number(bonus?.createdAt) || 0),
      createdAtMs: normalizeTimestampMs(bonus?.createdAtMs),
    }))
    .filter(bonus => bonus.id && Number.isFinite(bonus.x) && Number.isFinite(bonus.y));
}

function normalizeHarvestState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  snapshot.harvestBonuses = enforceHarvestBonusActiveLimit(snapshot.harvestBonuses);
  const timer = Number(snapshot.harvestSpawnTimer);
  snapshot.harvestSpawnTimer = Number.isFinite(timer)
    ? clamp(timer, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS)
    : HARVEST_BONUS_INITIAL_SPAWN_SECONDS;
  snapshot.harvestNextSpawnAtMs = normalizeTimestampMs(snapshot.harvestNextSpawnAtMs)
    || (Date.now() + snapshot.harvestSpawnTimer * 1000);
  snapshot.harvestNextBonusType = normalizeHarvestBonusType(snapshot.harvestNextBonusType);
}

function currentUtcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeGameOverState(snapshot = state) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (snapshot.gameOver === "defeat") snapshot.gameOver = null;
}

function isGamePausedByOutcome() {
  normalizeGameOverState();
  return state?.gameOver === "victory";
}

function normalizeScoutReports(reports) {
  if (!reports || typeof reports !== "object" || Array.isArray(reports)) return {};
  const normalized = {};
  const nowMs = Date.now();
  const currentGameSeconds = Math.max(0, Math.floor(Number(state?.gameSeconds) || 0));
  for (const [cityId, report] of Object.entries(reports)) {
    const troops = Math.max(0, Math.floor(Number(report?.troops) || 0));
    const totalDefense = Math.max(0, Math.floor(Number(report?.totalDefense) || 0));
    const baseTotalDefense = Math.min(
      totalDefense,
      Math.max(0, Math.floor(Number(report?.baseTotalDefense ?? totalDefense) || 0))
    );
    let scoutedAt = Math.max(0, Number(report?.scoutedAt) || 0);
    let expiresAt = Math.max(0, Number(report?.expiresAt) || 0);
    const scoutedAtMs = normalizeTimestampMs(report?.scoutedAtMs);
    const expiresAtMs = normalizeTimestampMs(report?.expiresAtMs);
    if (expiresAtMs) {
      const startMs = scoutedAtMs || Math.max(0, expiresAtMs - SCOUT_REPORT_SECONDS * 1000);
      const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
      if (remainingSeconds <= 0) continue;
      if (!scoutedAt || !expiresAt || expiresAt <= scoutedAt || expiresAt <= currentGameSeconds) {
        const ageSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
        scoutedAt = Math.max(0, currentGameSeconds - ageSeconds);
        expiresAt = scoutedAt + remainingSeconds;
      }
    }
    if (expiresAt <= scoutedAt) continue;
    if (currentGameSeconds > 0 && expiresAt <= currentGameSeconds) continue;
    normalized[cityId] = {
      ...report,
      troops,
      totalDefense,
      baseTotalDefense,
      totalDefenseBonus: Math.max(0, totalDefense - baseTotalDefense),
      scoutedAt,
      expiresAt,
      scoutedAtMs,
      expiresAtMs,
    };
  }
  return normalized;
}

function normalizeBattleReports(reports) {
  if (!Array.isArray(reports)) return [];
  return reports
    .map(report => {
      if (!report || typeof report !== "object") return null;
      const type = ["attack", "defense", "scout"].includes(report.type) ? report.type : "";
      if (!type) return null;
      const cityId = getKnownCityId(report.cityId || report.targetCityId || report.city?.id) || String(report.cityId || report.targetCityId || report.city?.id || "");
      const inferredRegionId = cityId ? getCityRegionId(cityId) : "";
      const rawRegionId = report.regionId || report.targetRegionId || report.city?.regionId || report.city?.startPool || inferredRegionId;
      const fallbackOutcome = type === "scout" ? "scout" : "defeat";
      const outcome = ["victory", "defeat", "held", "lost", "scout"].includes(report.outcome)
        ? report.outcome
        : fallbackOutcome;
      return {
        id: String(report.id || `report_${Math.random().toString(36).slice(2)}`),
        type,
        outcome,
        createdAt: Math.max(0, Number(report.createdAt) || 0),
        createdAtMs: normalizeTimestampMs(report.createdAtMs),
        cityId,
        regionId: rawRegionId ? normalizeRegionId(rawRegionId) : "",
        cityName: String(report.cityName || "Unknown city").slice(0, 40),
        cityLevel: clampCityLevel(report.cityLevel || 1),
        troopCount: Math.max(0, Math.floor(Number(report.troopCount) || 0)),
        sentTroops: Math.max(0, Math.floor(Number(report.sentTroops) || 0)),
        survivors: Math.max(0, Math.floor(Number(report.survivors) || 0)),
        defendersLeft: Math.max(0, Math.floor(Number(report.defendersLeft) || 0)),
        attackerLosses: Math.max(0, Math.floor(Number(report.attackerLosses) || 0)),
        defenderLosses: Math.max(0, Math.floor(Number(report.defenderLosses) || 0)),
        totalDefense: Math.max(0, Math.floor(Number(report.totalDefense) || 0)),
        baseTotalDefense: Math.min(
          Math.max(0, Math.floor(Number(report.totalDefense) || 0)),
          Math.max(0, Math.floor(Number(report.baseTotalDefense ?? report.totalDefense) || 0))
        ),
        totalDefenseBonus: Math.max(0, Math.floor(Number(report.totalDefenseBonus) || 0)),
        opponentName: String(report.opponentName || "").slice(0, 40),
        ownerName: String(report.ownerName || "").slice(0, 40),
        summary: String(report.summary || "").slice(0, 220),
        xpAwarded: Math.max(0, Math.floor(Number(report.xpAwarded) || 0)),
        goldAwarded: Math.max(0, Math.floor(Number(report.goldAwarded) || 0)),
        troopsAwarded: Math.max(0, Math.floor(Number(report.troopsAwarded) || 0)),
        scoutReport: report.scoutReport || null,
      };
    })
    .filter(Boolean)
    .slice(-120);
}

function compareBattleReportsNewestFirst(a = {}, b = {}) {
  const gameTimeDifference = Math.max(0, Number(b.createdAt) || 0) - Math.max(0, Number(a.createdAt) || 0);
  if (gameTimeDifference) return gameTimeDifference;
  const realTimeDifference = normalizeTimestampMs(b.createdAtMs) - normalizeTimestampMs(a.createdAtMs);
  if (realTimeDifference) return realTimeDifference;
  return String(b.id || "").localeCompare(String(a.id || ""));
}

function normalizeTimestampMs(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : 0;
}

function getScoutReport(cityId) {
  if (!state || !cityId) return null;
  state.scoutReports = normalizeScoutReports(state.scoutReports);
  const report = state.scoutReports[cityId];
  if (!report) return null;
  if (report.expiresAt <= state.gameSeconds) {
    delete state.scoutReports[cityId];
    return null;
  }
  return report;
}

function scoutCity(cityId) {
  const target = cityById(cityId);
  if (!target || target.owner === "player") return;
  scoutTarget(target);
}

function scoutRewardCamp(campId) {
  const target = getCampTargetById(campId);
  if (!target) return;
  if (target.owner === "player") {
    showToast(`You already control ${target.name}.`);
    return;
  }
  scoutTarget(target);
}

function scoutTarget(target) {
  const campTarget = isRewardCampTarget(target);
  const mainCityBlockReason = campTarget ? "" : getMainCityScoutBlockReason(target, "player");
  if (mainCityBlockReason) {
    showToast(mainCityBlockReason);
    return;
  }
  if (getPendingScoutMission(target.id)) {
    showToast(`A scout is already traveling to ${target.name}`);
    return;
  }
  const sourceOption = findNearestScoutSource(target);
  if (!sourceOption) {
    showToast("No owned city with a troop can reach this target.");
    return;
  }

  const source = sourceOption.city;
  const mission = launchScoutMission(source, target, sourceOption.route);
  if (!mission || usesServerArmyAuthority()) return;
  if (isOnlineWorldActive() && !usesServerArmyAuthority()) syncOwnedCitiesToOnline(true);
  addLog(`One scout left ${source.name} for ${target.name}.`);
  saveGame();
  renderAll();
  showToast(`Scout moving from ${source.name} to ${target.name}`);
}

function launchScoutMission(source, target, route) {
  if (!source || !target || source.owner !== "player" || source.troops < 1 || !route?.points?.length) return null;
  const campTarget = isRewardCampTarget(target);
  const mainCityBlockReason = campTarget ? "" : getMainCityScoutBlockReason(target, "player");
  if (mainCityBlockReason) {
    showToast(mainCityBlockReason);
    return null;
  }
  if (!canUseOnlineArmyOrders()) return null;
  const duration = travelTime(source, target, "player", route.length, 1, "scout");
  const mission = {
    id: attackIdCounter++,
    owner: "player",
    kind: "scout",
    targetType: campTarget ? "camp" : "city",
    fromId: source.id,
    toId: target.id,
    troops: 1,
    total: duration,
    remaining: duration,
    path: route.points,
    pathSegments: getRouteSegments(route, getCityRegionId(source)),
    pathLength: route.length,
    sourceRegionId: getCityRegionId(source),
    targetRegionId: getCityRegionId(target),
    targetOwnerAtLaunch: target.owner,
  };
  prepareOnlineArmyMission(mission);
  if (usesServerArmyAuthority()) {
    const launchKey = getServerArmyLaunchKey(source.id, target.id, "scout");
    if (pendingServerArmyLaunchKeys.has(launchKey)) {
      showToast(`A scout order from ${source.name} to ${target.name} is already being sent.`);
      return null;
    }
    pendingServerArmyLaunchKeys.add(launchKey);
    publishOnlineArmyMovement(mission, { addLocalMissionOnAccept: true, optimistic: false })
      .then(accepted => {
        if (!accepted) return;
        addLog(`One scout left ${source.name} for ${target.name}.`);
        showToast(`Scout moving from ${source.name} to ${target.name}`);
      })
      .finally(() => pendingServerArmyLaunchKeys.delete(launchKey));
    showToast("Sending scout order to the server...");
    return mission;
  }

  source.troopFloat = Math.max(0, (Number(source.troopFloat) || source.troops) - 1);
  source.troops = Math.floor(source.troopFloat);
  markOwnedCityChanged(source, false);
  syncCityStateToOnline(source);
  state.attacks.push(mission);
  publishOnlineArmyMovement(mission);
  return mission;
}

function isNearbyScoutCandidate(source, city) {
  return Boolean(
    source &&
    city &&
    city.id !== source.id &&
    getCityRegionId(city) === getCityRegionId(source) &&
    city.owner !== "player" &&
    !getMainCityScoutBlockReason(city, "player") &&
    !getPendingScoutMission(city.id) &&
    Math.hypot(city.x - source.x, city.y - source.y) <= SCOUT_NEARBY_RADIUS
  );
}

function getNearbyScoutCandidates(source) {
  return state.cities.filter(city => isNearbyScoutCandidate(source, city));
}

function getNearbyScoutOptions(source) {
  const sourceRegionId = getCityRegionId(source);
  return getNearbyScoutCandidates(source)
    .map(city => ({ city, route: findLandRoute(source, city, sourceRegionId) }))
    .filter(option => option.route?.points?.length)
    .sort((a, b) => a.route.length - b.route.length);
}

function toggleScoutNearby(cityId) {
  const source = cityById(cityId);
  if (!source || source.owner !== "player") {
    scoutNearbySourceId = null;
    regroupSourceId = null;
    renderAll();
    return;
  }
  if (source.troops < 1) {
    scoutNearbySourceId = null;
    renderAll();
    showToast(`${source.name} needs at least 1 soldier to send scouts.`);
    return;
  }

  if (scoutNearbySourceId !== source.id) {
    scoutNearbySourceId = source.id;
    regroupSourceId = null;
    const targets = getNearbyScoutCandidates(source);
    renderAll();
    showToast(targets.length
      ? `${targets.length} nearby cities. Press Send All to dispatch one scout to each for ${formatNumber(SCOUT_NEARBY_COST)} gold.`
      : "No non-owned cities are inside this scout radius.");
    return;
  }

  const options = getNearbyScoutOptions(source);
  if (!options.length) {
    scoutNearbySourceId = null;
    renderAll();
    showToast("No reachable cities remain inside this scout radius.");
    return;
  }
  if (state.gold < SCOUT_NEARBY_COST) {
    showToast(`Scout Nearby costs ${formatNumber(SCOUT_NEARBY_COST)} gold.`);
    return;
  }
  if (source.troops < options.length) {
    showToast(`${source.name} needs ${formatNumber(options.length)} troops to scout every highlighted city.`);
    return;
  }

  state.gold -= SCOUT_NEARBY_COST;
  for (const option of options) launchScoutMission(source, option.city, option.route);
  scoutNearbySourceId = null;
  if (isOnlineWorldActive() && !usesServerArmyAuthority()) syncOwnedCitiesToOnline(true);
  addLog(`${source.name} dispatched ${formatNumber(options.length)} nearby scouts for ${formatNumber(SCOUT_NEARBY_COST)} gold.`);
  saveGame();
  renderAll();
  showToast(`${formatNumber(options.length)} scouts dispatched from ${source.name}`);
}

function isNearbyRegroupCandidate(target, city) {
  return Boolean(
    target &&
    city &&
    city.id !== target.id &&
    target.owner === "player" &&
    city.owner === "player" &&
    getCityRegionId(city) === getCityRegionId(target) &&
    Math.floor(Number(city.troops) || 0) > 0 &&
    Math.hypot(city.x - target.x, city.y - target.y) <= REGROUP_RADIUS
  );
}

function getNearbyRegroupCandidates(target) {
  return state.cities.filter(city => isNearbyRegroupCandidate(target, city));
}

function getNearbyRegroupOptions(target) {
  const targetRegionId = getCityRegionId(target);
  return getNearbyRegroupCandidates(target)
    .map(city => ({ city, route: findLandRoute(city, target, targetRegionId) }))
    .filter(option => option.route?.points?.length)
    .sort((a, b) => a.route.length - b.route.length);
}

function toggleRegroup(cityId) {
  const target = cityById(cityId);
  if (!target || target.owner !== "player") {
    regroupSourceId = null;
    renderAll();
    return;
  }

  if (regroupSourceId !== target.id) {
    regroupSourceId = target.id;
    scoutNearbySourceId = null;
    const targets = getNearbyRegroupCandidates(target);
    const troops = targets.reduce((total, city) => total + Math.floor(Number(city.troops) || 0), 0);
    renderAll();
    showToast(targets.length
      ? `${formatNumber(targets.length)} owned cities can regroup ${formatNumber(troops)} troops to ${target.name} for ${formatNumber(REGROUP_COST)} gold. Press Regroup again.`
      : `No owned cities with troops are inside ${target.name}'s regroup radius.`);
    return;
  }

  const options = getNearbyRegroupOptions(target);
  if (!options.length) {
    regroupSourceId = null;
    renderAll();
    showToast("No nearby owned cities with troops can regroup here.");
    return;
  }
  if (state.gold < REGROUP_COST) {
    showToast(`Regroup costs ${formatNumber(REGROUP_COST)} gold.`);
    return;
  }

  state.gold -= REGROUP_COST;
  let launched = 0;
  let troopsSent = 0;
  for (const option of options) {
    const troops = Math.floor(Number(option.city.troops) || 0);
    if (troops < 1) continue;
    if (launchAttack(option.city.id, target.id, 1, "player", troops, { silent: true, syncOwnedCities: false })) {
      launched += 1;
      troopsSent += troops;
    }
  }

  regroupSourceId = null;
  if (!launched) {
    state.gold += REGROUP_COST;
    renderAll();
    showToast("No troops could regroup right now.");
    return;
  }

  if (isOnlineWorldActive() && !usesServerArmyAuthority()) syncOwnedCitiesToOnline(true);
  addLog(`${target.name} called a regroup for ${formatNumber(REGROUP_COST)} gold: ${formatNumber(troopsSent)} troops moving in from ${formatNumber(launched)} cities.`);
  saveGame();
  renderAll();
  showToast(`Regroup moving: ${formatNumber(troopsSent)} troops to ${target.name}`);
}

function getPendingScoutMission(cityId) {
  return state?.attacks?.find(attack => attack.owner === "player" && attack.kind === "scout" && attack.toId === cityId) || null;
}

function getRouteHeuristicDistance(source, target) {
  if (!source || !target) return Infinity;
  const sourceRegionId = getCityRegionId(source);
  const targetRegionId = getCityRegionId(target);
  if (sourceRegionId === targetRegionId) return Math.hypot(source.x - target.x, source.y - target.y);

  const chain = getPortalRouteRegionChain(sourceRegionId, targetRegionId);
  if (!chain?.length) return Infinity;

  let currentPoint = { x: source.x, y: source.y };
  let distance = 0;
  for (let index = 0; index < chain.length; index += 1) {
    const regionId = chain[index];
    const isLastRegion = index === chain.length - 1;
    const nextRegionId = isLastRegion ? "" : chain[index + 1];
    if (isLastRegion) {
      distance += Math.hypot(currentPoint.x - target.x, currentPoint.y - target.y);
      break;
    }
    const sourcePortal = getEditorPortalForRoute(regionId, nextRegionId);
    const exitPoint = getPortalWorldPoint(regionId, nextRegionId, sourcePortal ? { portal: sourcePortal } : {});
    if (!exitPoint) return Infinity;
    distance += Math.hypot(currentPoint.x - exitPoint.x, currentPoint.y - exitPoint.y);
    const arrivalPortal = sourcePortal ? getLinkedEditorArrivalPortal(regionId, nextRegionId, sourcePortal) : null;
    const arrivalPoint = getPortalWorldPoint(nextRegionId, regionId, arrivalPortal ? { portal: arrivalPortal } : {});
    if (!arrivalPoint) return Infinity;
    currentPoint = arrivalPoint;
  }
  return distance;
}

function findNearestOwnedSource(target, minimumTroops = 1, options = {}) {
  const maxRouteChecks = Math.max(1, Math.floor(Number(options.maxRouteChecks) || NEAREST_SOURCE_ROUTE_CHECK_LIMIT));
  const candidates = getOwnedSourceCandidates(target, minimumTroops);

  let checked = 0;
  for (const option of candidates) {
    if (checked >= maxRouteChecks) break;
    checked += 1;
    const route = findRoute(option.city, target);
    if (route?.points?.length) return { city: option.city, route };
  }
  return null;
}

function getOwnedSourceCandidates(target, minimumTroops = 1) {
  return playerCities()
    .filter(city => Math.floor(Number(city.troops) || 0) >= minimumTroops && city.id !== target.id)
    .map(city => ({ city, estimate: getRouteHeuristicDistance(city, target) }))
    .filter(option => Number.isFinite(option.estimate))
    .sort((a, b) => a.estimate - b.estimate);
}

function findNearestOwnedSourceCandidate(target, minimumTroops = 1) {
  return getOwnedSourceCandidates(target, minimumTroops)[0] || null;
}

function findNearestScoutSource(target) {
  return findNearestOwnedSource(target, 1, { maxRouteChecks: SCOUT_SOURCE_ROUTE_CHECK_LIMIT });
}

function rememberOwnedAttackSource(cityOrId) {
  const city = typeof cityOrId === "string" ? cityById(cityOrId) : cityOrId;
  if (city?.owner === "player") lastSelectedOwnedCityId = city.id;
}

function getLastSelectedOwnedAttackCity() {
  const source = lastSelectedOwnedCityId ? cityById(lastSelectedOwnedCityId) : null;
  return source?.owner === "player" ? source : null;
}

function completeScoutMission(attack, target) {
  if (target.owner === "player") {
    const joined = Math.max(0, Math.floor(Number(attack.troops) || 1));
    target.troopFloat = Math.max(0, Number(target.troopFloat) || target.troops || 0) + joined;
    target.troops = Math.floor(target.troopFloat);
    const stats = getCityStats(target);
    addBattleReport({
      type: "scout",
      outcome: "scout",
      cityId: target.id,
      regionId: getCityRegionId(target),
      cityName: target.name,
      cityLevel: clampCityLevel(target.level),
      sentTroops: joined,
      troopCount: target.troops,
      totalDefense: stats.totalDefense,
      baseTotalDefense: stats.baseTotalDefense,
      totalDefenseBonus: stats.totalDefenseBonus,
      ownerName: getCityOwnerDisplayName(target),
      opponentName: getCityOwnerDisplayName(target),
      summary: `Scout reached ${target.name}, now under your control. ${formatNumber(joined)} scout joined the garrison.`,
    });
    addLog(`The scout joined your garrison at ${target.name}.`);
    showToast(`Scout arrived at ${target.name}`);
    return;
  }
  state.scoutReports = normalizeScoutReports(state.scoutReports);
  const report = createScoutReportSnapshot(target);
  state.scoutReports[target.id] = report;
  addBattleReport({
    type: "scout",
    outcome: "scout",
    cityId: target.id,
    regionId: getCityRegionId(target),
    cityName: target.name,
    cityLevel: report.cityLevel,
    troopCount: report.troops,
    totalDefense: report.totalDefense,
    baseTotalDefense: report.baseTotalDefense,
    totalDefenseBonus: report.totalDefenseBonus,
    ownerName: report.ownerName,
    opponentName: report.ownerName,
    summary: `Scout revealed ${formatNumber(report.troops)} troops at ${target.name}.`,
  });
  addLog(`Scouts reported ${formatNumber(target.troops)} troops stationed at ${target.name}.`);
  showToast(`Scout report received from ${target.name}`);
}

function createScoutReportSnapshot(target) {
  const stats = getCityStats(target);
  const baseTroopDefense = Math.max(0, Math.floor(Number(target.troops) || 0));
  const troopDefense = Math.floor(baseTroopDefense * (1 + stats.defensePercent / 100));
  const ownerUsesPlayerSkills = target.owner === "player";
  const skillSnapshot = {};
  for (const skill of SKILL_ORDER) {
    const level = ownerUsesPlayerSkills ? getSkillLevel(skill) : 0;
    const config = SKILL_CONFIG[skill];
    const rawPercent = level * config.percentPerLevel;
    skillSnapshot[`${skill}Level`] = level;
    skillSnapshot[`${skill}Percent`] = Number.isFinite(config.maxPercent) ? Math.min(rawPercent, config.maxPercent) : rawPercent;
  }
  return {
    troops: baseTroopDefense,
    totalDefense: Math.floor(stats.totalDefense),
    baseTotalDefense: Math.floor(stats.baseTotalDefense),
    totalDefenseBonus: Math.floor(stats.totalDefenseBonus),
    owner: target.owner,
    ownerName: getCityOwnerDisplayName(target),
    cityLevel: stats.level,
    defensePercent: stats.defensePercent,
    baseCityWalls: stats.baseCityWalls,
    cityWalls: stats.cityWalls,
    troopDefense,
    cityDefenseBonus: Math.max(0, troopDefense - baseTroopDefense),
    stoneworksBonus: Math.max(0, stats.cityWalls - stats.baseCityWalls),
    baseAttackPercent: target.owner === "enemy" ? 4 : 0,
    ...skillSnapshot,
    scoutedAt: state.gameSeconds,
    expiresAt: state.gameSeconds + SCOUT_REPORT_SECONDS,
  };
}

function getBattleReportOwnerName(city, owner = city?.owner) {
  if (owner === "player") return state?.playerName || "You";
  if (city?.ownerKind === "player" && city.ownerUid) {
    const identity = resolvePlayerIdentityForUid(city.ownerUid, city);
    return identity.displayName || city.ownerName || "Rival ruler";
  }
  return OWNER[owner]?.label || "Unknown";
}

function addBattleReport(report) {
  if (!state) return;
  state.battleReports = normalizeBattleReports(state.battleReports);
  const entry = normalizeBattleReports([{
    id: `report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: state.gameSeconds,
    createdAtMs: Date.now(),
    ...report,
  }])[0];
  if (!entry) return;
  state.battleReports.push(entry);
  if (state.battleReports.length > 120) state.battleReports = state.battleReports.slice(-120);
}

function pendingNeutralCaptureCount(owner = "player", excludeAttackId = null) {
  if (!state || !Array.isArray(state.attacks)) return 0;
  return state.attacks.filter(attack => {
    if (attack.id === excludeAttackId) return false;
    if (attack.owner !== owner || attack.kind !== "attack") return false;
    if (attack.targetType === "camp" || isRewardCampTarget(getArmyTargetById(attack.toId))) return false;
    const target = cityById(attack.toId);
    if (isStronghold(target)) return false;
    return attack.targetOwnerAtLaunch === "neutral" || (!attack.targetOwnerAtLaunch && target?.owner === "neutral");
  }).length;
}

function neutralCaptureStatus(excludeAttackId = null) {
  const daily = ensureDailyCaptureTracker();
  const pending = pendingNeutralCaptureCount("player", excludeAttackId);
  const owned = getOwnedRegularCityCountForDisplay();
  const remainingByCityCount = Math.max(0, NEUTRAL_CITY_COUNT_LIMIT - owned - pending);
  const remainingToday = Math.max(0, DAILY_NEUTRAL_CAPTURE_LIMIT - daily.neutralCaptures - pending);
  return {
    capturesToday: daily.neutralCaptures,
    pending,
    cityCount: owned,
    remainingToday,
    remainingByCityCount,
    remaining: Math.min(remainingToday, remainingByCityCount),
  };
}

function getNeutralCaptureBlockReason(target, owner = "player", excludeAttackId = null) {
  if (owner !== "player" || target?.owner !== "neutral") return "";
  if (isStronghold(target)) return "";
  const status = neutralCaptureStatus(excludeAttackId);
  if (status.remainingByCityCount <= 0) {
    return `Neutral expansion is capped while you own ${NEUTRAL_CITY_COUNT_LIMIT} or more cities. Attack player-owned cities to keep expanding.`;
  }
  if (status.remainingToday <= 0) {
    return `You cannot conquer more neutral towns today. Daily neutral capture limit reached: ${DAILY_NEUTRAL_CAPTURE_LIMIT}/${DAILY_NEUTRAL_CAPTURE_LIMIT}.`;
  }
  return "";
}

function showNeutralCaptureLimitModal(message) {
  const status = neutralCaptureStatus();
  modalTitle.textContent = "Neutral expansion blocked";
  modalBody.innerHTML = `
    <div class="send-outcome lose">
      <strong>You cannot conquer that neutral town right now.</strong>
      <span>${escapeHtml(message)}</span>
      <small>${status.capturesToday}/${DAILY_NEUTRAL_CAPTURE_LIMIT} neutral captures used today. ${status.cityCount}/${NEUTRAL_CITY_COUNT_LIMIT} owned cities count toward the neutral-city cap. You can still attack player-owned cities and move troops between your owned cities.</small>
    </div>
    <div class="modal-actions">
      <button id="neutralLimitCloseBtn" class="safe-action" type="button">Close</button>
    </div>
  `;
  if (!modal.open) modal.showModal();
  const closeBtn = modalBody.querySelector("#neutralLimitCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", () => modal.close());
}

function recordNeutralCapture() {
  const daily = ensureDailyCaptureTracker();
  daily.neutralCaptures = clamp(daily.neutralCaptures + 1, 0, DAILY_NEUTRAL_CAPTURE_LIMIT);
}

function saveGame() {
  if (!state) return;
  state.lastRealTimeMs = Date.now();
  queueOnlineSave();
}

function getOnlineApi() {
  return window.CrownlandsOnline || null;
}

function usesServerArmyAuthority() {
  const api = getOnlineApi();
  const apiReady = typeof api?.usesServerArmyAuthority === "function"
    ? api.usesServerArmyAuthority()
    : true;
  return Boolean(isOnlineWorldActive() && api?.isSignedIn?.() && api?.sendArmyOrder && api?.resolveArmyOrder && apiReady);
}

function hasServerEconomyApi() {
  const api = getOnlineApi();
  const apiReady = typeof api?.usesServerEconomyAuthority === "function"
    ? api.usesServerEconomyAuthority()
    : true;
  return Boolean(
    api?.isSignedIn?.()
      && api?.collectEconomy
      && api?.reserveHarvestBonusSpawn
      && api?.collectHarvestBonus
      && api?.upgradeCity
      && api?.relinquishCity
      && api?.purchaseShopItem
      && api?.activateInventoryItem
      && apiReady
  );
}

function usesServerEconomyAuthority() {
  return Boolean(isOnlineWorldActive() && hasServerEconomyApi());
}

function getServerArmyLaunchKey(sourceId, targetId, kind = "attack") {
  return `${String(kind || "attack")}:${String(sourceId || "")}:${String(targetId || "")}`;
}

function canUseOnlineArmyOrders() {
  if (!isOnlineWorldActive()) return true;
  if (usesServerArmyAuthority()) return true;
  onlineLastError = "Online army orders require the Crownlands server.";
  showToast("Online army orders need the server connection. Try again after reconnecting.");
  return false;
}

function getServerReportGameSecond(report = {}) {
  const createdAtMs = normalizeTimestampMs(report.createdAtMs);
  if (!createdAtMs || !state) return Math.max(0, Number(state?.gameSeconds) || 0);
  const ageSeconds = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
  return Math.max(0, Math.floor(Number(state.gameSeconds) || 0) - ageSeconds);
}

function normalizeServerScoutReport(report = null) {
  if (!report || typeof report !== "object" || !state) return null;
  const nowMs = Date.now();
  const scoutedAtMs = normalizeTimestampMs(report.scoutedAtMs) || nowMs;
  const expiresAtMs = normalizeTimestampMs(report.expiresAtMs) || (scoutedAtMs + SCOUT_REPORT_SECONDS * 1000);
  const createdAgeSeconds = Math.max(0, Math.floor((nowMs - scoutedAtMs) / 1000));
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  const scoutedAt = Math.max(0, Math.floor(Number(state.gameSeconds) || 0) - createdAgeSeconds);
  return {
    ...report,
    troops: Math.max(0, Math.floor(Number(report.troops) || 0)),
    totalDefense: Math.max(0, Math.floor(Number(report.totalDefense) || 0)),
    baseTotalDefense: Math.min(
      Math.max(0, Math.floor(Number(report.totalDefense) || 0)),
      Math.max(0, Math.floor(Number(report.baseTotalDefense ?? report.totalDefense) || 0))
    ),
    cityLevel: clampCityLevel(report.cityLevel || 1),
    scoutedAt,
    expiresAt: scoutedAt + remainingSeconds,
  };
}

function normalizeServerBattleReport(report = null) {
  if (!report || typeof report !== "object") return null;
  const currentUid = getCurrentOnlineUid();
  if (report.uid && currentUid && report.uid !== currentUid) return null;
  return normalizeBattleReports([{
    ...report,
    id: report.id || `server_${report.cityId || "report"}_${report.createdAtMs || Date.now()}`,
    createdAt: getServerReportGameSecond(report),
  }])[0] || null;
}

function mergeServerScoutReport(rawReport = null) {
  if (!state || rawReport?.type !== "scout" || !rawReport.cityId || !rawReport.scoutReport) return false;
  state.scoutReports = normalizeScoutReports(state.scoutReports);
  const scoutReport = normalizeServerScoutReport(rawReport.scoutReport);
  if (!scoutReport) return false;
  const existing = state.scoutReports[rawReport.cityId];
  const existingTime = normalizeTimestampMs(existing?.scoutedAtMs) || Math.max(0, Number(existing?.scoutedAt) || 0);
  const nextTime = normalizeTimestampMs(scoutReport.scoutedAtMs) || Math.max(0, Number(scoutReport.scoutedAt) || 0);
  if (existing && existingTime >= nextTime) return false;
  state.scoutReports[rawReport.cityId] = scoutReport;
  return true;
}

function mergeServerReports(reports = []) {
  if (!state || !Array.isArray(reports) || !reports.length) return false;
  let changed = false;
  state.battleReports = normalizeBattleReports(state.battleReports);
  state.scoutReports = normalizeScoutReports(state.scoutReports);
  const existingIds = new Set(state.battleReports.map(report => report.id));
  for (const rawReport of reports) {
    changed = mergeServerScoutReport(rawReport) || changed;
    const normalized = normalizeServerBattleReport(rawReport);
    if (!normalized || existingIds.has(normalized.id) || appliedServerReportIds.has(normalized.id)) continue;
    state.battleReports.push(normalized);
    existingIds.add(normalized.id);
    appliedServerReportIds.add(normalized.id);
    changed = true;
  }
  if (changed) {
    state.battleReports = normalizeBattleReports(state.battleReports);
    if (state.battleReports.length > 120) state.battleReports = state.battleReports.slice(-120);
    saveGame();
    if (modal.open && modal.classList.contains("battle-report-modal")) showLogModal();
    renderHud();
  }
  return changed;
}

function getAuthoritativeProfileRevisionMs(profile = null) {
  if (!profile || typeof profile !== "object") return 0;
  return normalizeTimestampMs(profile.economyUpdatedAtMs)
    || normalizeTimestampMs(profile.accountUpdatedAtMs)
    || normalizeTimestampMs(profile.updatedAtMs)
    || timestampToMs(profile.updatedAt);
}

function applyServerProfilePatch(patch = null, options = {}) {
  if (!state || !patch || typeof patch !== "object") return false;
  let changed = false;
  const previousLevel = Math.max(1, Math.floor(Number(state.character?.level) || 1));
  if (patch.globalStats) {
    changed = applyGlobalStatsSnapshot(patch.globalStats, { render: false }) || changed;
  }
  const revisionMs = getAuthoritativeProfileRevisionMs(patch);
  if (revisionMs > 0 && lastAuthoritativeProfileRevisionMs > 0 && revisionMs < lastAuthoritativeProfileRevisionMs) {
    return changed;
  }
  if (revisionMs > 0) lastAuthoritativeProfileRevisionMs = Math.max(lastAuthoritativeProfileRevisionMs, revisionMs);
  if (patch.character) {
    state.character = normalizeCharacterProgress(patch.character);
    syncCharacterSkillPoints(state.character, state.upgrades, patch.character?.skillPoints);
    changed = true;
  }
  if (patch.upgrades && typeof patch.upgrades === "object") {
    state.upgrades = normalizeUpgrades(patch.upgrades, state.version);
    syncCharacterSkillPoints(state.character, state.upgrades, state.character?.skillPoints);
    changed = true;
  }
  if (Number.isFinite(Number(patch.gold))) {
    state.gold = Math.max(0, Math.floor(Number(patch.gold) || 0));
    changed = true;
  }
  if (patch.daily && typeof patch.daily === "object") {
    state.daily = normalizeDailyCaptureTracker(patch.daily);
    changed = true;
  }
  if (Array.isArray(patch.harvestBonuses)) {
    state.harvestBonuses = enforceHarvestBonusActiveLimit(normalizeHarvestBonuses(patch.harvestBonuses));
    changed = true;
  }
  if (Number.isFinite(Number(patch.harvestSpawnTimer))) {
    state.harvestSpawnTimer = clamp(
      Math.floor(Number(patch.harvestSpawnTimer) || 0),
      0,
      HARVEST_BONUS_SPAWN_INTERVAL_SECONDS
    );
    changed = true;
  }
  if (Number.isFinite(Number(patch.harvestNextSpawnAtMs))) {
    state.harvestNextSpawnAtMs = normalizeTimestampMs(patch.harvestNextSpawnAtMs);
    const remainingSeconds = Math.ceil(Math.max(0, state.harvestNextSpawnAtMs - Date.now()) / 1000);
    state.harvestSpawnTimer = clamp(remainingSeconds, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS);
    changed = true;
  }
  if (patch.harvestNextBonusType) {
    state.harvestNextBonusType = normalizeHarvestBonusType(patch.harvestNextBonusType);
    changed = true;
  }
  if (patch.shopItems && typeof patch.shopItems === "object") {
    state.shopItems = normalizeShopItems(patch.shopItems);
    changed = true;
  }
  if (patch.itemEffects && typeof patch.itemEffects === "object") {
    state.itemEffects = normalizeItemEffects(patch.itemEffects);
    changed = true;
  }
  if (patch.itemPurchaseCooldowns && typeof patch.itemPurchaseCooldowns === "object") {
    state.itemPurchaseCooldowns = normalizeItemPurchaseCooldowns(patch.itemPurchaseCooldowns);
    changed = true;
  }
  const nextMainCityId = getKnownCityId(patch.mainCityId);
  if (nextMainCityId) {
    state.mainCityId = nextMainCityId;
    if (state.online) {
      state.online.mainCityId = nextMainCityId;
      state.online.mainRegionId = normalizeRegionId(patch.mainRegionId || getCityRegionId(nextMainCityId));
      state.online.mainIslandId = patch.mainIslandId || getOnlineIslandId(state.online.mainRegionId);
    }
    changed = true;
  }
  if (Number.isFinite(Number(patch.mainCityChangedAtMs))) {
    state.mainCityChangedAtMs = normalizeTimestampMs(patch.mainCityChangedAtMs);
    changed = true;
  }
  const mainCityRepair = normalizeSingleMainCityAssignment(nextMainCityId || state.mainCityId);
  changed = mainCityRepair.changed || changed;
  if (changed) {
    saveGame();
    renderHud();
    if (profileScreen?.classList.contains("open")) renderProfileScreen();
  }
  const nextLevel = Math.max(1, Math.floor(Number(state.character?.level) || 1));
  if (patch.character && nextLevel > previousLevel && options.announceLevelUp !== false) {
    queueLevelUpReward(previousLevel, nextLevel, {
      gold: options.levelUpGold,
      troops: options.levelUpTroops,
      cityName: options.levelUpCityName || getMainRewardCity()?.name || "your main city",
    });
  }
  return changed;
}

function applyServerCityUpdateToOwnedCache(update = {}) {
  if (!state || !update || typeof update !== "object") return false;
  const cityId = getKnownCityId(update.id);
  if (!cityId) return false;
  const currentUid = getCurrentOnlineUid();
  const existingIndex = onlineOwnedCitiesCache.findIndex(city => city.id === cityId);
  const existing = existingIndex >= 0 ? onlineOwnedCitiesCache[existingIndex] : null;
  const ownerUidProvided = Object.prototype.hasOwnProperty.call(update, "ownerUid");
  const nextOwnerUid = ownerUidProvided ? String(update.ownerUid || "").trim() : String(existing?.ownerUid || currentUid || "").trim();

  if (ownerUidProvided && (!nextOwnerUid || (currentUid && nextOwnerUid !== currentUid))) {
    if (existingIndex < 0) return false;
    onlineOwnedCitiesCache.splice(existingIndex, 1);
    localDirtyCityIds.delete(cityId);
    return true;
  }

  if (!existing && !(ownerUidProvided && nextOwnerUid && (!currentUid || nextOwnerUid === currentUid))) return false;
  const next = normalizeOwnedCitySnapshot({
    ...(existing || {}),
    ...update,
    id: cityId,
    regionId: normalizeRegionId(update.regionId || existing?.regionId || getCityRegionId(cityId)),
    ownerKind: "player",
    ownerUid: nextOwnerUid || currentUid || null,
    ownerName: update.ownerName || existing?.ownerName || state.playerName,
    ownerFlag: update.ownerFlag || existing?.ownerFlag || state.flag,
  });
  if (!next) return false;
  if (existingIndex >= 0) onlineOwnedCitiesCache[existingIndex] = next;
  else onlineOwnedCitiesCache.push(next);
  return true;
}

function applyServerCityUpdates(cityUpdates = []) {
  if (!state || !Array.isArray(cityUpdates)) return false;
  let changed = false;
  let cacheChanged = false;
  for (const update of cityUpdates) {
    if (update?.ownerUid) rememberOwnerIdentitiesFromRecords([update]);
    cacheChanged = applyServerCityUpdateToOwnedCache(update) || cacheChanged;
    const cityId = getKnownCityId(update?.id);
    const city = cityId ? cityById(cityId) : null;
    if (!city) continue;
    const currentRegionId = getCityRegionId(city);
    const updateRegionId = normalizeRegionId(update.regionId || currentRegionId);
    if (currentRegionId !== updateRegionId) continue;
    if (Number.isFinite(Number(update.troops))) {
      city.troops = Math.max(0, Math.floor(Number(update.troops) || 0));
      city.troopFloat = Math.max(0, Number(update.troopFloat) || city.troops);
      changed = true;
    }
    if (Number.isFinite(Number(update.level))) {
      city.level = isStronghold(city) ? getStrongholdDefenseLevel(city) : clampCityLevel(update.level);
      changed = true;
    }
    if (Number.isFinite(Number(update.investedGold))) {
      city.investedGold = isStronghold(city) ? 0 : Math.max(0, Math.floor(Number(update.investedGold) || 0));
      changed = true;
    }
    if (Number.isFinite(Number(update.ownerShieldExpiresAtMs))) {
      city.ownerShieldExpiresAtMs = isStronghold(city) ? 0 : normalizeTimestampMs(update.ownerShieldExpiresAtMs);
      changed = true;
    }
    if (Number.isFinite(Number(update.productionUpdatedAtMs))) {
      city.productionUpdatedAtMs = normalizeTimestampMs(update.productionUpdatedAtMs);
      changed = true;
    }
    if (update.relinquishedAtMs !== undefined) {
      city.relinquishedAtMs = timestampToMs(update.relinquishedAtMs);
      changed = true;
    }
    if (update.relocatedAtMs !== undefined) {
      city.relocatedAtMs = timestampToMs(update.relocatedAtMs);
      changed = true;
    }
    if (update.ownerUid !== undefined) {
      const currentUid = getCurrentOnlineUid();
      const ownerUid = String(update.ownerUid || "").trim();
      const ownerIdentity = ownerUid ? resolvePlayerIdentityForUid(ownerUid, update) : null;
      city.ownerKind = ownerUid ? "player" : "neutral";
      city.ownerUid = ownerUid || null;
      city.owner = ownerUid && currentUid && ownerUid === currentUid ? "player" : ownerUid ? "enemy" : "neutral";
      city.ownerName = ownerIdentity?.displayName || update.ownerName || "";
      city.ownerFlag = ownerIdentity?.flag || update.ownerFlag || null;
      city.ownerKingPower = normalizePowerValue(ownerIdentity?.kingPower) || normalizePowerValue(update.ownerKingPower);
      city.ownerShieldExpiresAtMs = normalizeTimestampMs(update.ownerShieldExpiresAtMs);
      city.isMainCity = Boolean(update.isMainCity) && !isStronghold(city);
      if (ownerUid) {
        city.relinquishedAtMs = 0;
        city.relocatedAtMs = 0;
      }
      if (!ownerUid) localDirtyCityIds.delete(city.id);
      changed = true;
    } else if (update.isMainCity !== undefined) {
      city.isMainCity = Boolean(update.isMainCity) && !isStronghold(city);
      changed = true;
    }
  }
  if (cacheChanged) updateIslandSummariesFromOwnedCityCache();
  const mainCityRepair = normalizeSingleMainCityAssignment(state.mainCityId);
  changed = mainCityRepair.changed || changed;
  if (changed) {
    renderHud();
    renderCities();
    renderPanel();
  }
  return changed || cacheChanged;
}

function applyServerArmyResult(result = null) {
  if (!result || typeof result !== "object") return false;
  let changed = false;
  if (result.globalStats) changed = applyGlobalStatsSnapshot(result.globalStats, { render: false }) || changed;
  if (Array.isArray(result.reports)) changed = mergeServerReports(result.reports) || changed;
  if (Array.isArray(result.cityUpdates)) changed = applyServerCityUpdates(result.cityUpdates) || changed;
  if (result.campUpdate?.id) {
    const normalized = normalizeOnlineCampState({ ...(onlineCampStates.get(result.campUpdate.id) || {}), ...result.campUpdate });
    if (normalized) {
      onlineCampStates.set(normalized.id, normalized);
      if (normalized.holderUid === getCurrentOnlineUid()) onlineHeldCampStates.set(normalized.id, normalized);
      else onlineHeldCampStates.delete(normalized.id);
      cityRenderSignature = "";
      changed = true;
      if (result.targetType === "camp" && result.kind === "attack" && result.outcome === "victory" && normalized.holderUid === getCurrentOnlineUid()) {
        const config = getRewardCampConfig(normalized);
        showToast(`${config?.name || normalized.name} captured. Hold for ${Math.floor((config?.holdSeconds || 0) / 60)} minutes to claim ${formatNumber(config?.baseReward || 0)} ${config?.rewardLabel || "reward"}.`);
      }
    }
  }
  if (result.currentUser) {
    const nextLevel = Math.max(1, Math.floor(Number(result.currentUser?.character?.level) || 1));
    const levelRewardReport = Array.isArray(result.reports)
      ? [...result.reports].reverse().find(report => (
        Math.max(1, Math.floor(Number(report?.characterAfter?.level) || 1)) === nextLevel
        && Math.max(0, Math.floor(Number(report?.xpAwarded) || 0)) > 0
      ))
      : null;
    changed = applyServerProfilePatch(result.currentUser, {
      levelUpGold: levelRewardReport?.goldAwarded,
      levelUpTroops: levelRewardReport?.troopsAwarded,
      levelUpCityName: result.troopRewardCityName,
    }) || changed;
  }
  return changed;
}

function applyServerEconomyResult(result = null, options = {}) {
  if (!result || typeof result !== "object") return false;
  let changed = false;
  if (result.globalStats) changed = applyGlobalStatsSnapshot(result.globalStats, { render: false }) || changed;
  if (result.currentUser) {
    changed = applyServerProfilePatch(result.currentUser, {
      levelUpGold: result.levelUpGoldAwarded,
      levelUpTroops: result.troopsAwarded,
      levelUpCityName: result.troopRewardCityName,
    }) || changed;
  }
  if (Array.isArray(result.cityUpdates)) changed = applyServerCityUpdates(result.cityUpdates) || changed;
  const production = result.production || {};
  const goldGained = Math.max(0, Math.floor(Number(production.goldGained) || 0));
  const troopsGained = Math.max(0, Math.floor(Number(production.troopsGained) || 0));
  const elapsed = Math.max(0, Math.floor(Number(production.elapsedSeconds) || 0));
  if (options.showOfflineRewards && elapsed >= 60 && (goldGained > 0 || troopsGained > 0)) {
    addLog(`Server production: +${formatNumber(goldGained)} gold and +${formatNumber(troopsGained)} troops while away.`);
    showOfflineRewardsModal({
      goldGained,
      troopsGained,
      troopsKeptInCities: troopsGained,
      troopsRalliedToMain: 0,
      elapsed,
      cityName: getMainRewardCity()?.name || "main city",
      lostCities: [],
    });
  }
  if (changed) {
    renderHud();
    if (options.renderCities === false) updateVisibleCityDynamicText();
    else renderCities();
    renderHarvestBonuses();
    if (modal.open && modal.classList.contains("shop-modal")) renderShopModal();
    if (modal.open && modal.classList.contains("inventory-modal")) showInventoryModal();
    if (modal.open && modal.classList.contains("city-list-modal")) renderCityListModal();
    if (profileScreen?.classList.contains("open")) renderProfileScreen();
  }
  return changed;
}

async function refreshServerEconomy(force = false, options = {}) {
  if (!state || !usesServerEconomyAuthority()) return false;
  const api = getOnlineApi();
  if (!api?.collectEconomy) return false;
  if (serverEconomyRefreshInFlight) {
    if (force) serverEconomyRefreshQueued = true;
    return false;
  }
  serverEconomyRefreshInFlight = true;
  try {
    const result = await api.collectEconomy({
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
    });
    applyServerEconomyResult(result, options);
    serverEconomyLastSyncAt = Date.now();
    onlineLastError = "";
    updateOnlineUi();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    const nowMs = Date.now();
    if (nowMs - serverEconomyLastToastAt > 30000) {
      serverEconomyLastToastAt = nowMs;
      showToast("Server economy sync failed. Deploy Functions/firestore or reconnect.");
    }
    updateOnlineUi();
    console.warn("Could not refresh server economy", error);
    return false;
  } finally {
    serverEconomyRefreshInFlight = false;
    if (serverEconomyRefreshQueued) {
      serverEconomyRefreshQueued = false;
      refreshServerEconomy(true);
    }
  }
}

function getSerializableGameState() {
  if (!state) return null;
  normalizeGameOverState(state);
  return JSON.parse(JSON.stringify(state));
}

function getPlayerCloudStateSnapshot() {
  const profile = getPlayerProfileSnapshot();
  return {
    ...profile,
    snapshotKind: "player-profile",
    version: WORLD_SCHEMA_VERSION,
    gameSeconds: state ? Math.max(0, Number(state.gameSeconds) || 0) : 0,
  };
}

function stripServerEconomyProfileFields(profile = {}) {
  if (!usesServerEconomyAuthority()) return profile;
  const clean = { ...profile };
  delete clean.gold;
  delete clean.goldFloat;
  delete clean.shopItems;
  delete clean.itemEffects;
  delete clean.itemPurchaseCooldowns;
  delete clean.offlineProductionCities;
  delete clean.harvestBonuses;
  delete clean.harvestSpawnTimer;
  delete clean.harvestNextSpawnAtMs;
  delete clean.harvestNextBonusType;
  delete clean.character;
  delete clean.upgrades;
  delete clean.mainCityId;
  delete clean.mainIslandId;
  delete clean.mainRegionId;
  delete clean.mainCityChangedAtMs;
  delete clean.globalStats;
  delete clean.kingPower;
  delete clean.cityCount;
  return clean;
}

function getPlayerProfileSnapshot() {
  const profileName = state?.playerName || cleanName(playerNameInput?.value) || "Ricky";
  const activeRegionId = state ? getActiveOnlineRegionId() : DEFAULT_ONLINE_REGION_ID;
  const mainRegionId = state?.online?.mainRegionId || (state?.mainCityId ? getCityRegionId(state.mainCityId) : activeRegionId);
  const activeIslandId = state?.online?.islandId || getOnlineIslandId(activeRegionId);
  const harvestTimer = Number(state?.harvestSpawnTimer);
  return {
    resetGeneration: RESET_GENERATION,
    cloudSaveSlot: ONLINE_SAVE_SLOT,
    worldId: ONLINE_WORLD_ID,
    version: WORLD_SCHEMA_VERSION,
    mainCityId: state?.mainCityId || "",
    mainCityChangedAtMs: state ? normalizeTimestampMs(state.mainCityChangedAtMs) : 0,
    mainIslandId: state?.online?.mainIslandId || getOnlineIslandId(mainRegionId),
    activeIslandId,
    mainRegionId,
    activeRegionId,
    playerName: profileName,
    flag: state?.flag || createDefaultFlag(),
    character: state?.character ? normalizeCharacterProgress(state.character) : createCharacterProgress(),
    upgrades: state?.upgrades ? normalizeUpgrades(state.upgrades, state.version || 20) : createDefaultSkills(),
    shopItems: state ? normalizeShopItems(state.shopItems) : createDefaultShopItems(),
    itemEffects: state ? normalizeItemEffects(state.itemEffects) : createDefaultItemEffects(),
    itemPurchaseCooldowns: state ? normalizeItemPurchaseCooldowns(state.itemPurchaseCooldowns) : createDefaultItemPurchaseCooldowns(),
    cityCount: state ? getOwnedRegularCityCountForDisplay() : 0,
    kingPower: state ? getKingPower() : 0,
    gold: state ? Math.floor(Number(state.gold) || 0) : 0,
    daily: state ? normalizeDailyCaptureTracker(state.daily) : normalizeDailyCaptureTracker(null),
    harvestBonuses: state ? normalizeHarvestBonuses(state.harvestBonuses) : [],
    harvestSpawnTimer: Number.isFinite(harvestTimer)
      ? clamp(harvestTimer, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS)
      : HARVEST_BONUS_INITIAL_SPAWN_SECONDS,
    harvestNextSpawnAtMs: normalizeTimestampMs(state?.harvestNextSpawnAtMs)
      || Date.now() + (Number.isFinite(harvestTimer) ? clamp(harvestTimer, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS) : HARVEST_BONUS_INITIAL_SPAWN_SECONDS) * 1000,
    harvestNextBonusType: normalizeHarvestBonusType(state?.harvestNextBonusType),
    scoutReports: state ? normalizeScoutReports(state.scoutReports) : {},
    battleReports: state ? normalizeBattleReports(state.battleReports) : [],
    marchPercent: normalizeMarchPercent(state?.marchPercent ?? selectedMarchPercent),
    lastSelectedOwnedCityId: getKnownCityId(lastSelectedOwnedCityId),
    gameSeconds: state ? Math.max(0, Number(state.gameSeconds) || 0) : 0,
    localGameSeconds: state ? Number(state.gameSeconds) || 0 : 0,
    lastRealTimeMs: state ? normalizeTimestampMs(state.lastRealTimeMs) || Date.now() : Date.now(),
    lastSeenAtMs: Date.now(),
    offlineProductionCities: state ? createOfflineProductionSnapshot(state) : [],
  };
}

function mergeOnlineProfileSources(profile = null, cloudSnapshot = null) {
  const currentProfile = profile && isCurrentResetProfile(profile) ? profile : null;
  const currentCloudSnapshot = cloudSnapshot && isCurrentResetProfile(cloudSnapshot) ? cloudSnapshot : null;
  if (!currentProfile) return currentCloudSnapshot;
  if (!currentCloudSnapshot) return currentProfile;
  const profileSavedAtMs = getProfileGameSaveMs(currentProfile);
  const cloudSavedAtMs = getProfileGameSaveMs(currentCloudSnapshot);
  const merged = cloudSavedAtMs > profileSavedAtMs
    ? { ...currentProfile, ...currentCloudSnapshot }
    : { ...currentCloudSnapshot, ...currentProfile };
  if (hasServerEconomyApi()) {
    [
      "gold",
      "goldFloat",
      "character",
      "upgrades",
      "shopItems",
      "itemEffects",
      "itemPurchaseCooldowns",
      "economyUpdatedAtMs",
      "mainCityId",
      "mainIslandId",
      "mainRegionId",
      "mainCityChangedAtMs",
      "globalStats",
      "kingPower",
      "cityCount",
    ].forEach(key => {
      if (currentProfile[key] !== undefined) merged[key] = currentProfile[key];
    });
  }
  return merged;
}

function applyOnlineProfileSnapshot(profile = null, fallbackPlayerName = "Ricky") {
  if (!state || !profile || typeof profile !== "object") return;
  state.playerName = cleanName(profile.playerName || profile.displayName) || fallbackPlayerName;
  state.flag = normalizeFlag(profile.flag);
  state.character = normalizeCharacterProgress(profile.character);
  state.upgrades = normalizeUpgrades(profile.upgrades, state.version || WORLD_SCHEMA_VERSION);
  state.shopItems = normalizeShopItems(profile.shopItems);
  state.itemEffects = normalizeItemEffects(profile.itemEffects);
  state.itemPurchaseCooldowns = normalizeItemPurchaseCooldowns(profile.itemPurchaseCooldowns);
  syncCharacterSkillPoints(state.character, state.upgrades, profile.character?.skillPoints);
  const profileGold = Number(profile.gold);
  state.gold = Math.max(0, Math.floor(Number.isFinite(profileGold) ? profileGold : TEST_STARTING_GOLD));
  state.daily = normalizeDailyCaptureTracker(profile.daily);
  state.harvestBonuses = enforceHarvestBonusActiveLimit(normalizeHarvestBonuses(profile.harvestBonuses));
  const harvestTimer = Number(profile.harvestSpawnTimer);
  state.harvestSpawnTimer = Number.isFinite(harvestTimer)
    ? clamp(harvestTimer, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS)
    : HARVEST_BONUS_INITIAL_SPAWN_SECONDS;
  state.harvestNextSpawnAtMs = normalizeTimestampMs(profile.harvestNextSpawnAtMs)
    || Date.now() + state.harvestSpawnTimer * 1000;
  state.harvestNextBonusType = normalizeHarvestBonusType(profile.harvestNextBonusType);
  state.scoutReports = normalizeScoutReports(profile.scoutReports);
  state.battleReports = normalizeBattleReports(profile.battleReports);
  state.marchPercent = normalizeMarchPercent(profile.marchPercent);
  selectedMarchPercent = state.marchPercent;
  lastSelectedOwnedCityId = getKnownCityId(profile.lastSelectedOwnedCityId) || lastSelectedOwnedCityId;
  state.mainCityChangedAtMs = normalizeTimestampMs(profile.mainCityChangedAtMs);
  state.gameSeconds = Math.max(0, Number(profile.localGameSeconds) || Number(profile.gameSeconds) || Number(state.gameSeconds) || 0);
  state.lastRealTimeMs = normalizeTimestampMs(profile.lastRealTimeMs) || state.lastRealTimeMs;
  lastAuthoritativeProfileRevisionMs = Math.max(
    lastAuthoritativeProfileRevisionMs,
    getAuthoritativeProfileRevisionMs(profile)
  );
  if (profile.globalStats) applyGlobalStatsSnapshot(profile.globalStats, { render: false });
}

function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return normalizeTimestampMs(value.toMillis());
  if (Number.isFinite(Number(value))) return normalizeTimestampMs(value);
  if (Number.isFinite(Number(value.seconds))) {
    return normalizeTimestampMs(Number(value.seconds) * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1_000_000));
  }
  return 0;
}

function getProfileGameSaveMs(profile = null) {
  if (!profile || typeof profile !== "object") return 0;
  return normalizeTimestampMs(profile.lastSeenAtMs)
    || normalizeTimestampMs(profile.lastRealTimeMs);
}

function getProfileLastSeenMs(profile = null) {
  if (!profile || typeof profile !== "object") return 0;
  return normalizeTimestampMs(profile.lastSeenAtMs)
    || normalizeTimestampMs(profile.lastRealTimeMs)
    || timestampToMs(profile.updatedAt);
}

function normalizeOfflineProductionCities(cities = []) {
  if (!Array.isArray(cities)) return [];
  const seen = new Set();
  return cities
    .map(city => {
      const id = getKnownCityId(city?.id);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      const base = getPlayableBaseCityById(id) || {};
      return {
        id,
        name: getCanonicalCityName(base, city),
        owner: "player",
        ownerKind: "player",
        ownerUid: city.ownerUid || getCurrentOnlineUid() || null,
        ownerName: city.ownerName || state?.playerName || "",
        ownerFlag: city.ownerFlag || state?.flag || null,
        ownerKingPower: normalizePowerValue(city.ownerKingPower) || getKingPower(),
        level: isStronghold(city) ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level ?? base.level),
        troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
        troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
        kind: city.kind || base.kind || "",
        strongholdType: city.strongholdType || base.strongholdType || "",
        bonus: city.bonus || base.bonus || "",
        bonusPercent: Number(city.bonusPercent ?? base.bonusPercent) || 0,
        size: isStronghold(city) || isStronghold(base) ? getStrongholdVisualSize({ size: base.size ?? city.size }) : undefined,
        regionId: city.regionId || base.regionId || getCityRegionId(id),
      };
    })
    .filter(Boolean);
}

function restoreOfflineProductionCitiesToLocalState(cities = []) {
  if (!state || !Array.isArray(state.cities)) return;
  const currentUid = getCurrentOnlineUid();
  const byId = new Map(normalizeOfflineProductionCities(cities).map(city => [city.id, city]));
  if (!byId.size) return;
  state.cities = state.cities.map(city => {
    const snapshot = byId.get(city.id);
    if (!snapshot || city.owner === "enemy") return city;
    return {
      ...city,
      owner: "player",
      ownerKind: "player",
      ownerUid: currentUid || snapshot.ownerUid || city.ownerUid || null,
      ownerName: state.playerName,
      ownerFlag: state.flag,
      ownerKingPower: getKingPower(),
      level: snapshot.level,
      troops: snapshot.troops,
      troopFloat: snapshot.troopFloat,
      investedGold: Math.max(0, Math.floor(Number(city.investedGold) || 0)),
      lastCapturedAt: city.lastCapturedAt ?? null,
      isMainCity: !isStronghold(city) && city.id === state.mainCityId,
      relinquishedAtMs: 0,
      relocatedAtMs: 0,
    };
  });
}

async function prepareOfflineProgressFromProfile(profile = null) {
  pendingOfflineProgressSeconds = 0;
  pendingOfflineProductionCities = [];
  pendingOfflineOwnedCityIds = null;
  if (hasServerEconomyApi()) return false;
  if (!state || !profile || !isCurrentResetProfile(profile)) return false;

  const productionCities = normalizeOfflineProductionCities(profile.offlineProductionCities);
  if (!productionCities.length) return false;
  const lastSeenAtMs = getProfileLastSeenMs(profile);
  const elapsed = getOfflineProgressSeconds({ lastRealTimeMs: lastSeenAtMs });
  if (elapsed <= 0) return false;

  pendingOfflineProgressSeconds = elapsed;
  pendingOfflineProductionCities = productionCities;
  restoreOfflineProductionCitiesToLocalState(productionCities);

  const api = getOnlineApi();
  if (api?.loadOwnedCitiesAcrossIslands && api?.isSignedIn?.()) {
    try {
      const islandIds = getRegionIds().map(getOnlineIslandId);
      const ownedCities = await withTimeout(
        api.loadOwnedCitiesAcrossIslands(islandIds),
        4500,
        "Owned city check is taking too long."
      );
      pendingOfflineOwnedCityIds = new Set((Array.isArray(ownedCities) ? ownedCities : []).map(city => getKnownCityId(city.id)).filter(Boolean));
    } catch (error) {
      console.warn("Could not check owned cities for offline summary", error);
    }
  }
  return true;
}

function queueOnlineSave() {
  const api = getOnlineApi();
  if (!api?.isConfigured?.() || !api?.isSignedIn?.()) return;
  onlineSaveQueued = true;
}

async function flushOnlineSave(force = false) {
  if (!state || onlineSaveInFlight) return false;
  const api = getOnlineApi();
  if (!api?.isConfigured?.() || !api?.isSignedIn?.()) return false;
  if (!force && !onlineSaveQueued) return false;

  onlineSaveInFlight = true;
  onlineSaveQueued = false;
  try {
    const cloudState = getPlayerCloudStateSnapshot();
    const writes = [api.savePlayerProfile(stripServerEconomyProfileFields(cloudState))];
    if (typeof api.saveGameSnapshot === "function") writes.push(api.saveGameSnapshot(cloudState, ONLINE_SAVE_SLOT));
    await Promise.all(writes);
    await syncOwnedCitiesToOnline();
    publishKingPowerLeaderboard();
    onlineLastSaveAt = Date.now();
    onlineLastError = "";
    updateOnlineUi();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    onlineSaveQueued = true;
    updateOnlineUi();
    console.warn("Cloud save failed", error);
    return false;
  } finally {
    onlineSaveInFlight = false;
  }
}

function getOnlinePresenceSnapshot() {
  const mainRegionId = state?.online?.mainRegionId || (state?.mainCityId ? getCityRegionId(state.mainCityId) : getActiveOnlineRegionId());
  const stats = getGlobalStatsSnapshot();
  const cityCount = hasUsableGlobalStats(stats) ? stats.totalCities : state ? getOwnedRegularCityCountForDisplay() : 0;
  return {
    displayName: state?.playerName || getOnlineApi()?.getUser?.()?.displayName || "Ruler",
    playerName: state?.playerName || "Ruler",
    flag: state?.flag || createDefaultFlag(),
    mainCityId: stats?.mainCityId || state?.mainCityId || "",
    mainRegionId: stats?.mainRegionId || mainRegionId,
    mainIslandId: stats?.mainIslandId || state?.online?.mainIslandId || getOnlineIslandId(mainRegionId),
    cityCount,
    kingPower: state ? getKingPower() : 0,
    kingPowerVersion: Math.max(KING_POWER_AUTHORITY_VERSION, Math.floor(Number(stats?.version) || 0)),
    updatedAtMs: Date.now(),
  };
}

function getKingPowerLeaderboardSnapshot() {
  const mainRegionId = state?.online?.mainRegionId || (state?.mainCityId ? getCityRegionId(state.mainCityId) : getActiveOnlineRegionId());
  const stats = getGlobalStatsSnapshot();
  const cityCount = hasUsableGlobalStats(stats) ? stats.totalCities : state ? getOwnedRegularCityCountForDisplay() : 0;
  return {
    displayName: state?.playerName || getOnlineApi()?.getUser?.()?.displayName || "Ruler",
    playerName: state?.playerName || "Ruler",
    flag: state?.flag || createDefaultFlag(),
    kingPower: getKingPower(),
    kingPowerVersion: Math.max(KING_POWER_AUTHORITY_VERSION, Math.floor(Number(stats?.version) || 0)),
    cityCount,
    mainCityId: stats?.mainCityId || state?.mainCityId || "",
    mainRegionId: stats?.mainRegionId || mainRegionId,
    mainIslandId: stats?.mainIslandId || state?.online?.mainIslandId || getOnlineIslandId(mainRegionId),
    updatedAtMs: Date.now(),
  };
}

function getLeaderboardEntrySignature(entry) {
  return [
    entry.playerName,
    entry.kingPower,
    entry.cityCount,
    entry.mainCityId,
    entry.mainRegionId,
    JSON.stringify(normalizeFlag(entry.flag)),
  ].join("|");
}

async function publishKingPowerLeaderboard({ force = false } = {}) {
  if (!state || leaderboardSaveInFlight) return false;
  if (!isOnlineWorldActive()) return false;
  if (usesServerEconomyAuthority()) {
    rememberCurrentPlayerIdentity();
    return false;
  }
  const api = getOnlineApi();
  if (!api?.saveKingPowerLeaderboardEntry || !api?.isSignedIn?.()) return false;
  const entry = getKingPowerLeaderboardSnapshot();
  const signature = getLeaderboardEntrySignature(entry);
  const needsStaleRefresh = Date.now() - leaderboardLastSaveAt >= LEADERBOARD_STALE_REFRESH_MS;
  if (!force && signature === leaderboardLastSignature && !needsStaleRefresh) return false;

  leaderboardSaveInFlight = true;
  try {
    await api.saveKingPowerLeaderboardEntry(entry);
    rememberCurrentPlayerIdentity();
    leaderboardLastSignature = signature;
    leaderboardLastSaveAt = Date.now();
    return true;
  } catch (error) {
    console.warn("Could not publish King Power leaderboard entry", error);
    return false;
  } finally {
    leaderboardSaveInFlight = false;
  }
}

function normalizePresence(raw) {
  if (!raw || typeof raw !== "object") return null;
  const uid = String(raw.uid || raw.id || "").trim();
  if (!uid) return null;
  return {
    uid,
    displayName: cleanName(raw.playerName || raw.displayName || "Ruler") || "Ruler",
    flag: raw.flag || null,
    mainCityId: String(raw.mainCityId || ""),
    mainRegionId: normalizeRegionId(raw.mainRegionId || getRegionIdFromOnlineIslandId(raw.mainIslandId)),
    mainIslandId: String(raw.mainIslandId || ""),
    cityCount: Math.max(0, Math.floor(Number(raw.cityCount) || 0)),
    kingPower: Math.max(0, Math.floor(Number(raw.kingPower) || 0)),
    kingPowerVersion: Math.max(0, Math.floor(Number(raw.kingPowerVersion) || 0)),
    updatedAtMs: Math.max(0, Number(raw.updatedAtMs) || 0),
  };
}

function normalizePlayerIdentity(raw = {}, fallbackUid = "") {
  if (!raw || typeof raw !== "object") return null;
  const uid = String(raw.uid || raw.ownerUid || raw.id || fallbackUid || "").trim();
  if (!uid) return null;
  return {
    uid,
    displayName: cleanName(raw.playerName || raw.displayName || raw.ownerName || raw.name || "") || "",
    flag: raw.flag || raw.ownerFlag || null,
    kingPower: normalizePowerValue(raw.kingPower ?? raw.ownerKingPower ?? raw.attackerKingPower),
    kingPowerVersion: Math.max(0, Math.floor(Number(raw.kingPowerVersion) || 0)),
    mainCityId: getKnownCityId(raw.mainCityId),
    mainRegionId: String(raw.mainRegionId || "").trim(),
    mainIslandId: String(raw.mainIslandId || "").trim(),
    updatedAtMs: normalizeTimestampMs(raw.updatedAtMs) || timestampToMs(raw.updatedAt),
  };
}

function getPlayerIdentitySignature(identity) {
  if (!identity) return "";
  return [
    identity.uid || "",
    identity.displayName || "",
    getFlagSignature(identity.flag),
    normalizePowerValue(identity.kingPower),
    Math.max(0, Math.floor(Number(identity.kingPowerVersion) || 0)),
    identity.mainCityId || "",
    identity.mainRegionId || "",
    normalizeTimestampMs(identity.updatedAtMs),
  ].join("|");
}

function rememberPlayerIdentity(raw = {}, options = {}) {
  const identity = normalizePlayerIdentity(raw);
  if (!identity) return false;
  const currentUid = getCurrentOnlineUid();
  if (currentUid && state && identity.uid === currentUid) {
    identity.displayName = state.playerName || identity.displayName || "Ruler";
    identity.flag = state.flag || identity.flag || createDefaultFlag();
    identity.kingPower = getKingPower();
    identity.kingPowerVersion = Math.max(identity.kingPowerVersion, KING_POWER_AUTHORITY_VERSION);
    identity.updatedAtMs = Math.max(identity.updatedAtMs || 0, Date.now());
  }

  const existing = playerIdentityCache.get(identity.uid) || null;
  const before = getPlayerIdentitySignature(existing);
  const force = Boolean(options.force);
  const existingIsAuthoritative = Boolean(existing?.authoritative);
  const identityIsNewer = !existing
    || force
    || (!existingIsAuthoritative && (
      !existing.updatedAtMs
      || !identity.updatedAtMs
      || identity.updatedAtMs >= existing.updatedAtMs
    ));
  const next = {
    uid: identity.uid,
    displayName: identityIsNewer
      ? identity.displayName || existing?.displayName || ""
      : existing?.displayName || identity.displayName || "",
    flag: identityIsNewer
      ? identity.flag || existing?.flag || null
      : existing?.flag || identity.flag || null,
    kingPower: identityIsNewer
      ? identity.kingPower
      : existing?.kingPower || 0,
    kingPowerVersion: identityIsNewer
      ? identity.kingPowerVersion
      : Math.max(0, Math.floor(Number(existing?.kingPowerVersion) || 0)),
    mainCityId: identityIsNewer
      ? identity.mainCityId || existing?.mainCityId || ""
      : existing?.mainCityId || identity.mainCityId || "",
    mainRegionId: identityIsNewer
      ? identity.mainRegionId || existing?.mainRegionId || ""
      : existing?.mainRegionId || identity.mainRegionId || "",
    mainIslandId: identityIsNewer
      ? identity.mainIslandId || existing?.mainIslandId || ""
      : existing?.mainIslandId || identity.mainIslandId || "",
    updatedAtMs: Math.max(existing?.updatedAtMs || 0, identity.updatedAtMs || 0),
    fetchedAtMs: force ? Date.now() : existing?.fetchedAtMs || 0,
    authoritative: existingIsAuthoritative || force,
  };
  playerIdentityCache.set(identity.uid, next);
  playerIdentityLookupMisses.delete(identity.uid);
  return before !== getPlayerIdentitySignature(next);
}

function rememberPlayerIdentities(rows = [], options = {}) {
  let changed = false;
  (Array.isArray(rows) ? rows : []).forEach(row => {
    if (rememberPlayerIdentity(row, options)) changed = true;
  });
  return changed;
}

function rememberOwnerIdentitiesFromRecords(records = []) {
  let changed = false;
  (Array.isArray(records) ? records : []).forEach(record => {
    if (!record || typeof record !== "object") return;
    const ownerUid = String(record.ownerUid || record.uid || "").trim();
    if (!ownerUid) return;
    if (rememberPlayerIdentity({
      uid: ownerUid,
      ownerName: record.ownerName,
      ownerFlag: record.ownerFlag,
      ownerKingPower: record.ownerKingPower ?? record.kingPower ?? record.attackerKingPower,
      kingPowerVersion: record.kingPowerVersion,
      updatedAtMs: normalizeTimestampMs(record.updatedAtMs) || timestampToMs(record.updatedAt),
    })) {
      changed = true;
    }
  });
  return changed;
}

function rememberCurrentPlayerIdentity() {
  const uid = getCurrentOnlineUid();
  if (!uid || !state) return false;
  return rememberPlayerIdentity({
    uid,
    playerName: state.playerName,
    flag: state.flag,
    kingPower: getKingPower(),
    kingPowerVersion: KING_POWER_AUTHORITY_VERSION,
    mainCityId: state.mainCityId || "",
    mainRegionId: state.online?.mainRegionId || getCityRegionId(state.mainCityId),
    mainIslandId: state.online?.mainIslandId || getOnlineIslandId(getCityRegionId(state.mainCityId)),
    updatedAtMs: Date.now(),
  }, { force: true });
}

function resolvePlayerIdentityForUid(uid, fallback = {}) {
  const ownerUid = String(uid || "").trim();
  const fallbackIdentity = normalizePlayerIdentity(fallback, ownerUid) || {};
  const currentUid = getCurrentOnlineUid();
  if (ownerUid && currentUid && ownerUid === currentUid && state) {
    return {
      uid: ownerUid,
      displayName: state.playerName || fallbackIdentity.displayName || "Ruler",
      flag: state.flag || fallbackIdentity.flag || createDefaultFlag(),
      kingPower: getCurrentPlayerIdentityKingPower(fallbackIdentity.kingPower),
      kingPowerVersion: KING_POWER_AUTHORITY_VERSION,
      mainCityId: state.mainCityId || fallbackIdentity.mainCityId || "",
      mainRegionId: state.online?.mainRegionId || fallbackIdentity.mainRegionId || "",
      mainIslandId: state.online?.mainIslandId || fallbackIdentity.mainIslandId || "",
      updatedAtMs: Date.now(),
    };
  }
  const cached = ownerUid ? playerIdentityCache.get(ownerUid) : null;
  const cachedPowerIsAuthoritative = Math.max(0, Math.floor(Number(cached?.kingPowerVersion) || 0)) >= KING_POWER_AUTHORITY_VERSION;
  return {
    uid: ownerUid,
    displayName: cached?.displayName || fallbackIdentity.displayName || "",
    flag: cached?.flag || fallbackIdentity.flag || null,
    kingPower: cachedPowerIsAuthoritative
      ? normalizePowerValue(cached.kingPower)
      : cached?.kingPower || fallbackIdentity.kingPower || 0,
    kingPowerVersion: Math.max(cached?.kingPowerVersion || 0, fallbackIdentity.kingPowerVersion || 0),
    mainCityId: cached?.mainCityId || fallbackIdentity.mainCityId || "",
    mainRegionId: cached?.mainRegionId || fallbackIdentity.mainRegionId || "",
    mainIslandId: cached?.mainIslandId || fallbackIdentity.mainIslandId || "",
    updatedAtMs: Math.max(cached?.updatedAtMs || 0, fallbackIdentity.updatedAtMs || 0),
  };
}

function applyCanonicalPlayerIdentityToRecord(record) {
  if (!record || typeof record !== "object") return false;
  const ownerUid = String(record.ownerUid || "").trim();
  if (!ownerUid) return false;
  const rawOwnerKind = record.ownerKind || record.owner || "player";
  if (rawOwnerKind !== "player" && record.owner !== "player" && record.owner !== "enemy") return false;
  const identity = resolvePlayerIdentityForUid(ownerUid, record);
  const nextName = identity.displayName || record.ownerName || "";
  const nextFlag = identity.flag || record.ownerFlag || null;
  const nextPower = identity.kingPowerVersion >= KING_POWER_AUTHORITY_VERSION
    ? normalizePowerValue(identity.kingPower)
    : normalizePowerValue(identity.kingPower) || normalizePowerValue(record.ownerKingPower);
  let changed = false;
  if ((record.ownerName || "") !== nextName) {
    record.ownerName = nextName;
    changed = true;
  }
  if (getFlagSignature(record.ownerFlag) !== getFlagSignature(nextFlag)) {
    record.ownerFlag = nextFlag;
    changed = true;
  }
  if (normalizePowerValue(record.ownerKingPower) !== nextPower) {
    record.ownerKingPower = nextPower;
    changed = true;
  }
  if (record.attackerKingPower !== undefined && normalizePowerValue(record.attackerKingPower) !== nextPower) {
    record.attackerKingPower = nextPower;
    changed = true;
  }
  return changed;
}

function queuePlayerIdentityLookupForUids(uids = []) {
  const api = getOnlineApi();
  if (!api?.loadPlayerIdentities || !api?.isSignedIn?.()) return;
  const currentUid = getCurrentOnlineUid();
  const now = Date.now();
  const uniqueUids = [...new Set((Array.isArray(uids) ? uids : [])
    .map(uid => String(uid || "").trim())
    .filter(uid => uid && uid !== currentUid))];
  uniqueUids.forEach(uid => {
    const cached = playerIdentityCache.get(uid);
    const missedAt = playerIdentityLookupMisses.get(uid) || 0;
    const fetchedAt = cached?.fetchedAtMs || cached?.updatedAtMs || 0;
    if (fetchedAt && now - fetchedAt < PLAYER_IDENTITY_CACHE_STALE_MS) return;
    if (missedAt && now - missedAt < PLAYER_IDENTITY_CACHE_STALE_MS) return;
    playerIdentityLookupQueue.add(uid);
  });
  if (!playerIdentityLookupQueue.size || playerIdentityLookupInFlight) return;
  window.setTimeout(refreshQueuedPlayerIdentities, 0);
}

function queuePlayerIdentityLookupForRecords(records = []) {
  if (!Array.isArray(records) || !records.length) return;
  rememberOwnerIdentitiesFromRecords(records);
  queuePlayerIdentityLookupForUids(records.map(record => record?.ownerUid || record?.uid).filter(Boolean));
}

async function refreshQueuedPlayerIdentities() {
  if (playerIdentityLookupInFlight) return;
  const api = getOnlineApi();
  if (!api?.loadPlayerIdentities || !api?.isSignedIn?.()) return;
  playerIdentityLookupInFlight = true;
  let changed = false;
  try {
    while (playerIdentityLookupQueue.size) {
      const batch = Array.from(playerIdentityLookupQueue).slice(0, PLAYER_IDENTITY_LOOKUP_BATCH_SIZE);
      batch.forEach(uid => playerIdentityLookupQueue.delete(uid));
      const rows = await api.loadPlayerIdentities(batch);
      const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizePlayerIdentity).filter(Boolean);
      const found = new Set(normalizedRows.map(row => row.uid));
      if (rememberPlayerIdentities(normalizedRows, { force: true })) changed = true;
      batch.forEach(uid => {
        if (!found.has(uid)) playerIdentityLookupMisses.set(uid, Date.now());
      });
    }
  } catch (error) {
    console.warn("Could not refresh player identities", error);
  } finally {
    playerIdentityLookupInFlight = false;
  }
  if (changed && canonicalizeVisiblePlayerIdentities()) {
    renderCities();
    renderPaths();
    renderArmies();
    updateIncomingAttackUi();
    updateOutgoingAttackUi();
  }
  if (playerIdentityLookupQueue.size) window.setTimeout(refreshQueuedPlayerIdentities, 0);
}

function canonicalizeVisiblePlayerIdentities() {
  let changed = false;
  if (state?.cities?.length) {
    state.cities.forEach(city => {
      if (applyCanonicalPlayerIdentityToRecord(city)) changed = true;
    });
  }
  if (onlineOwnedCitiesCache.length) {
    onlineOwnedCitiesCache.forEach(city => {
      if (applyCanonicalPlayerIdentityToRecord(city)) changed = true;
    });
  }
  if (onlineArmies.length) {
    onlineArmies.forEach(army => {
      if (applyCanonicalPlayerIdentityToRecord(army)) changed = true;
    });
  }
  onlineArmiesByIsland.forEach(armies => {
    (Array.isArray(armies) ? armies : []).forEach(army => {
      if (applyCanonicalPlayerIdentityToRecord(army)) changed = true;
    });
  });
  if (state?.attacks?.length) {
    state.attacks.forEach(attack => {
      if (applyCanonicalPlayerIdentityToRecord(attack)) changed = true;
    });
  }
  return changed;
}

function getActiveOnlinePlayers() {
  const now = Date.now();
  const activeByUid = new Map();
  for (const presence of onlinePresence) {
    if (!presence?.uid) continue;
    if (presence.updatedAtMs && now - presence.updatedAtMs > ONLINE_PRESENCE_STALE_SECONDS * 1000) continue;
    activeByUid.set(presence.uid, presence);
  }
  const currentUid = getCurrentOnlineUid();
  if (currentUid && (onlineWorldConnected || isOnlineWorldActive()) && !activeByUid.has(currentUid)) {
    activeByUid.set(currentUid, {
      ...getOnlinePresenceSnapshot(),
      uid: currentUid,
      updatedAtMs: now,
    });
  }
  return Array.from(activeByUid.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function updateOnlinePlayersUi() {
}

function updateIslandSwitcherUi() {
  if (!islandSwitchBtn) return;
  const show = Boolean(state);
  islandSwitchBtn.hidden = !show;
  if (!show) return;
  const regionId = getActiveOnlineRegionId();
  const label = getRegionLabel(regionId);
  if (islandSwitchLabel) islandSwitchLabel.textContent = "Map";
  islandSwitchBtn.title = `Map - viewing ${label}`;
  updateIslandMapTileSummariesInPlace();
}

function centerOnRegion(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  if (state) {
    state.activeRegionId = targetRegionId;
    if (state.online) {
      state.online.activeRegionId = targetRegionId;
      state.online.islandId = getOnlineIslandId(targetRegionId);
    }
  }
  onlineActiveRegionId = targetRegionId;
  syncMapSurfaceToActiveIsland(true);
  centerOnMap();
}

function getOwnedRegularCityCountsByRegionForDisplay() {
  const countsByRegion = new Map();
  const seenIds = new Set();
  const addCity = city => {
    const id = getKnownCityId(city?.id);
    if (!id || seenIds.has(id) || isStronghold(city)) return;
    seenIds.add(id);
    const regionId = getCityRegionId(city);
    countsByRegion.set(regionId, (countsByRegion.get(regionId) || 0) + 1);
  };
  onlineOwnedCitiesCache.forEach(addCity);
  if (state?.cities) playerRegularCities().forEach(addCity);
  return countsByRegion;
}

function getOwnedRegularCityCountForDisplay(regionId = null) {
  const hasRegionFilter = regionId !== null && regionId !== undefined && String(regionId || "").trim();
  const statsCount = getGlobalOwnedCityCountByRegion(hasRegionFilter ? regionId : null);
  if (statsCount !== null) return statsCount;
  const countsByRegion = getOwnedRegularCityCountsByRegionForDisplay();
  if (hasRegionFilter) {
    const targetRegionId = normalizeRegionId(regionId);
    return countsByRegion.get(targetRegionId) || 0;
  }
  let total = 0;
  countsByRegion.forEach(count => { total += count; });
  return total;
}

function getIslandOwnedCityCount(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  const cachedCount = getOwnedRegularCityCountForDisplay(targetRegionId);
  if (cachedCount > 0 || onlineOwnedCitiesCache.length) return cachedCount;
  return state ? playerRegularCities().filter(city => getCityRegionId(city) === targetRegionId).length : 0;
}

function getIslandSwitcherSummary(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  const statsOwnedCount = getGlobalOwnedCityCountByRegion(targetRegionId);
  const summary = getIslandOccupancySummary(targetRegionId);
  const ownedCount = statsOwnedCount !== null
    ? statsOwnedCount
    : summary
    ? Math.max(0, Math.floor(Number(summary.ownCityCount) || 0))
    : getIslandOwnedCityCount(targetRegionId);
  return `Your cities: ${formatNumber(ownedCount)}`;
}

function summarizeIslandOccupancy(regionId, cities = state?.cities || []) {
  const activeRegionId = normalizeRegionId(regionId);
  const currentUid = getCurrentOnlineUid();
  const owners = new Set();
  const rivalOwners = new Set();
  const regularCityCount = getRegularCityCapacity(activeRegionId);
  let playerHeldCityCount = 0;
  let ownCityCount = 0;
  let rivalCityCount = 0;

  cities.forEach(city => {
    if (!city || isStronghold(city) || getCityRegionId(city) !== activeRegionId) return;
    const ownership = getCityRecordOwnership(city, currentUid, { allowLocalPlayerFallback: true });
    const ownerUid = String(ownership.ownerUid || "");
    const isLocalPlayerCity = ownership.owner === "player";
    if (ownership.ownerKind !== "player" && !isLocalPlayerCity) return;

    playerHeldCityCount += 1;
    if (ownerUid) owners.add(ownerUid);
    if (isLocalPlayerCity || (currentUid && ownerUid === currentUid)) {
      ownCityCount += 1;
    } else {
      rivalCityCount += 1;
      if (ownerUid) rivalOwners.add(ownerUid);
    }
  });

  return {
    regionId: activeRegionId,
    islandId: getOnlineIslandId(activeRegionId),
    cityCount: regularCityCount,
    regularCityCount,
    playerHeldCityCount,
    neutralCityCount: Math.max(0, regularCityCount - playerHeldCityCount),
    ownCityCount,
    rivalCityCount,
    rulerCount: owners.size || (playerHeldCityCount > 0 ? 1 : 0),
    rivalRulerCount: rivalOwners.size || (rivalCityCount > 0 ? 1 : 0),
    updatedAtMs: Date.now(),
  };
}

function cacheIslandOccupancySummary(regionId, summary = null) {
  const activeRegionId = normalizeRegionId(regionId);
  const regularCityCount = Math.max(
    0,
    getRegularCityCapacity(activeRegionId),
    Math.floor(Number(summary?.regularCityCount) || 0),
    Math.floor(Number(summary?.cityCount) || 0)
  );
  const playerHeldCityCount = Math.max(0, Math.floor(Number(summary?.playerHeldCityCount) || 0));
  const neutralCityCount = getNeutralCityCountFromSummary(activeRegionId, {
    ...(summary || {}),
    regularCityCount,
    playerHeldCityCount,
  });
  const normalized = summary
    ? {
        regionId: activeRegionId,
        islandId: summary.islandId || getOnlineIslandId(activeRegionId),
        cityCount: Math.max(regularCityCount, Math.floor(Number(summary.cityCount) || 0)),
        regularCityCount,
        neutralCityCount,
        playerHeldCityCount,
        ownCityCount: Math.max(0, Math.floor(Number(summary.ownCityCount) || 0)),
        rivalCityCount: Math.max(0, Math.floor(Number(summary.rivalCityCount) || 0)),
        rulerCount: Math.max(0, Math.floor(Number(summary.rulerCount) || 0)),
        rivalRulerCount: Math.max(0, Math.floor(Number(summary.rivalRulerCount) || 0)),
        updatedAtMs: Math.max(0, Number(summary.updatedAtMs) || Date.now()),
      }
    : summarizeIslandOccupancy(activeRegionId);
  onlineIslandSummaries.set(activeRegionId, normalized);
  return normalized;
}

function updateIslandSummariesFromOwnedCityCache() {
  if (!onlineOwnedCitiesCache.length) return;
  const countsByRegion = new Map();
  for (const city of onlineOwnedCitiesCache) {
    if (!city || isStronghold(city)) continue;
    const regionId = getCityRegionId(city);
    countsByRegion.set(regionId, (countsByRegion.get(regionId) || 0) + 1);
  }
  getRegionIds().forEach(regionId => {
    const existing = onlineIslandSummaries.get(regionId) || {};
    onlineIslandSummaries.set(regionId, {
      regionId,
      islandId: getOnlineIslandId(regionId),
      cityCount: Math.max(0, Math.floor(Number(existing.cityCount) || 0)),
      regularCityCount: Math.max(0, getRegularCityCapacity(regionId), Math.floor(Number(existing.regularCityCount) || 0)),
      playerHeldCityCount: Math.max(
        Math.max(0, Math.floor(Number(existing.playerHeldCityCount) || 0)),
        Math.max(0, Math.floor(Number(existing.rivalCityCount) || 0)) + (countsByRegion.get(regionId) || 0)
      ),
      ownCityCount: countsByRegion.get(regionId) || 0,
      rivalCityCount: Math.max(0, Math.floor(Number(existing.rivalCityCount) || 0)),
      rulerCount: Math.max(0, Math.floor(Number(existing.rulerCount) || 0)),
      rivalRulerCount: Math.max(0, Math.floor(Number(existing.rivalRulerCount) || 0)),
      updatedAtMs: Date.now(),
    });
    const next = onlineIslandSummaries.get(regionId);
    next.neutralCityCount = getNeutralCityCountFromSummary(regionId, next);
  });
  rerenderIslandSwitcherModalIfOpen();
}

function getIslandOccupancySummary(regionId) {
  const activeRegionId = normalizeRegionId(regionId);
  if (state && activeRegionId === getActiveOnlineRegionId() && onlineCitiesLoaded) {
    return cacheIslandOccupancySummary(activeRegionId);
  }
  return onlineIslandSummaries.get(activeRegionId) || null;
}

function getIslandTileSummaryText(regionId) {
  return getIslandSwitcherSummary(regionId);
}

function getIslandTileAriaSummary(regionId) {
  return getIslandSwitcherSummary(regionId);
}

function rerenderIslandSwitcherModalIfOpen() {
  if (!modal.open || !modal.classList.contains("island-switcher-modal")) return;
  rememberIslandMapPickerView();
  updateIslandMapTileSummariesInPlace();
}

function updateIslandMapTileSummariesInPlace() {
  const picker = getIslandMapPickerElement();
  if (!picker) return false;
  const activeRegionId = getActiveOnlineRegionId();
  const homeRegionId = getMainCityRegionId();
  picker.querySelectorAll("[data-island-region]").forEach(button => {
    const regionId = normalizeRegionId(button.dataset.islandRegion);
    const summaryText = getIslandTileSummaryText(regionId);
    const summary = button.querySelector(".island-map-owned");
    if (summary && summary.textContent !== summaryText) summary.textContent = summaryText;

    const ariaParts = [getRegionLabel(regionId), getIslandTileAriaSummary(regionId)];
    if (regionId === activeRegionId) ariaParts.push("current map");
    if (regionId === homeRegionId) ariaParts.push("home island");
    button.setAttribute("aria-label", ariaParts.join(", "));
  });
  return true;
}

async function refreshOnlineIslandSummaries(force = false) {
  const api = getOnlineApi();
  if (onlineIslandSummaryRefreshInFlight || !api?.loadIslandCitySummary || !api?.isSignedIn?.()) return false;
  onlineIslandSummaryRefreshInFlight = true;
  try {
    const now = Date.now();
    const regions = getRegionIds();
    const staleRegions = regions
      .filter(regionId => force || !onlineIslandSummaries.get(regionId) || now - onlineIslandSummaries.get(regionId).updatedAtMs > 30000);
    if (!staleRegions.length) return true;
    for (const regionId of staleRegions) {
      if (mapSwitchLoading || onlineWorldLoading) break;
      try {
        const summary = await api.loadIslandCitySummary(getOnlineIslandId(regionId));
        if (summary) cacheIslandOccupancySummary(regionId, summary);
      } catch (error) {
        console.warn(`Could not load ${getRegionLabel(regionId)} ownership summary`, error);
      }
    }
    rerenderIslandSwitcherModalIfOpen();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    console.warn("Could not load island ownership summaries", error);
    return false;
  } finally {
    onlineIslandSummaryRefreshInFlight = false;
  }
}

async function refreshAllOwnedCities(force = false) {
  if (!state || onlineOwnedCitiesRefreshInFlight) return false;
  const api = getOnlineApi();
  if (!api?.loadOwnedCitiesAcrossIslands || !api?.isSignedIn?.()) {
    mergeOwnedCitySnapshots(playerCities().map(city => ({
      ...city,
      islandId: getOnlineIslandId(getCityRegionId(city)),
    })), { complete: false });
    return false;
  }
  const now = Date.now();
  if (!force && onlineOwnedCitiesCacheComplete && onlineOwnedCitiesCache.length && now - onlineOwnedCitiesCacheAt < ONLINE_OWNED_CITIES_REFRESH_MS) return true;

  onlineOwnedCitiesRefreshInFlight = true;
  try {
    const islandIds = getRegionIds().map(getOnlineIslandId);
    const owned = await withTimeout(
      api.loadOwnedCitiesAcrossIslands(islandIds),
      6500,
      "Owned city lookup is taking too long."
    );
    mergeOwnedCitySnapshots((Array.isArray(owned) ? owned : []).map(city => ({
      ...city,
      islandId: city.islandId || getOnlineIslandId(getCityRegionId(city)),
    })), { complete: true });
    renderHud();
    if (profileScreen?.classList.contains("open")) renderProfileScreen();
    if (modal.open && modal.classList.contains("city-list-modal")) renderCityListModal();
    if (modal.open && modal.classList.contains("island-switcher-modal")) rerenderIslandSwitcherModalIfOpen();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    console.warn("Could not load owned cities across islands", error);
    return false;
  } finally {
    onlineOwnedCitiesRefreshInFlight = false;
  }
}

const ISLAND_PICKER_TILE_WIDTH = 238;
const ISLAND_PICKER_TILE_HEIGHT = 179;
const ISLAND_PICKER_TILE_GAP = 34;
const ISLAND_PICKER_STAGE_PADDING = 260;
const ISLAND_PICKER_GRID_CELL_WORLD_SIZE = 2300;
const ISLAND_PICKER_MIN_ZOOM = 0.18;
const ISLAND_PICKER_MAX_ZOOM = 1;

function getIslandMapGridCoordinate(region) {
  const regionId = normalizeRegionId(region?.id);
  const map = getEditorMap(regionId);
  const explicitGridX = [map?.gridX, map?.region?.gridX, region?.gridX].find(value => Number.isFinite(Number(value)));
  const explicitGridY = [map?.gridY, map?.region?.gridY, region?.gridY].find(value => Number.isFinite(Number(value)));
  if (explicitGridX !== undefined && explicitGridY !== undefined) {
    return { gridX: Math.round(Number(explicitGridX)), gridY: Math.round(Number(explicitGridY)) };
  }

  const starterDefaults = {
    center: { gridX: 0, gridY: 0 },
    west: { gridX: -1, gridY: 0 },
    east: { gridX: 1, gridY: 0 },
    north: { gridX: 0, gridY: -1 },
    south: { gridX: 0, gridY: 1 },
  };
  if (starterDefaults[regionId]) return starterDefaults[regionId];

  const explicitWorldX = [map?.region?.x, region?.x].find(value => Number.isFinite(Number(value)));
  const explicitWorldY = [map?.region?.y, region?.y].find(value => Number.isFinite(Number(value)));
  if (explicitWorldX !== undefined && explicitWorldY !== undefined) {
    const cellSize = Math.max(500, Number(MAP_EDITOR_DATA?.globalSettings?.gridCellWorldSize) || ISLAND_PICKER_GRID_CELL_WORLD_SIZE);
    const worldWidth = Math.max(1000, Number(MAP_EDITOR_DATA?.globalSettings?.worldWidth) || WORLD_WIDTH);
    const worldHeight = Math.max(1000, Number(MAP_EDITOR_DATA?.globalSettings?.worldHeight) || WORLD_HEIGHT);
    return {
      gridX: Math.round((Number(explicitWorldX) - worldWidth / 2) / cellSize),
      gridY: Math.round((Number(explicitWorldY) - worldHeight / 2) / cellSize),
    };
  }

  const cellSize = Math.max(500, Number(MAP_EDITOR_DATA?.globalSettings?.gridCellWorldSize) || ISLAND_PICKER_GRID_CELL_WORLD_SIZE);
  return {
    gridX: Math.round(((Number(region?.x) || WORLD_WIDTH / 2) - WORLD_WIDTH / 2) / cellSize),
    gridY: Math.round(((Number(region?.y) || WORLD_HEIGHT / 2) - WORLD_HEIGHT / 2) / cellSize),
  };
}

function getIslandMapGridLayout() {
  const entries = WORLD_REGIONS.map(region => ({
    region,
    ...getIslandMapGridCoordinate(region),
  }));
  const xs = entries.map(entry => entry.gridX);
  const ys = entries.map(entry => entry.gridY);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const stepX = ISLAND_PICKER_TILE_WIDTH + ISLAND_PICKER_TILE_GAP;
  const stepY = ISLAND_PICKER_TILE_HEIGHT + ISLAND_PICKER_TILE_GAP;
  const stageWidth = ISLAND_PICKER_STAGE_PADDING * 2 + (maxX - minX + 1) * ISLAND_PICKER_TILE_WIDTH + (maxX - minX) * ISLAND_PICKER_TILE_GAP;
  const stageHeight = ISLAND_PICKER_STAGE_PADDING * 2 + (maxY - minY + 1) * ISLAND_PICKER_TILE_HEIGHT + (maxY - minY) * ISLAND_PICKER_TILE_GAP;
  return { entries, minX, minY, stepX, stepY, stageWidth, stageHeight };
}

function getIslandMapPosition(region) {
  const layout = getIslandMapGridLayout();
  const { gridX, gridY } = getIslandMapGridCoordinate(region);
  return {
    x: ISLAND_PICKER_STAGE_PADDING + (gridX - layout.minX) * layout.stepX + ISLAND_PICKER_TILE_WIDTH / 2,
    y: ISLAND_PICKER_STAGE_PADDING + (gridY - layout.minY) * layout.stepY + ISLAND_PICKER_TILE_HEIGHT / 2,
  };
}

function getIslandMapIconStyle(region) {
  const position = getIslandMapPosition(region);
  return [
    `--island-x:${formatPathNumber(position.x)}px`,
    `--island-y:${formatPathNumber(position.y)}px`,
    `--island-w:${ISLAND_PICKER_TILE_WIDTH}px`,
    `--island-h:${ISLAND_PICKER_TILE_HEIGHT}px`,
  ].join(";");
}

function getIslandMapPickerStyle() {
  const layout = getIslandMapGridLayout();
  const zoom = clampIslandMapPickerZoom(islandMapPickerViewState.zoom);
  return [
    `--island-grid-base-w:${Math.round(layout.stageWidth)}px`,
    `--island-grid-base-h:${Math.round(layout.stageHeight)}px`,
    `--island-grid-scaled-w:${formatPathNumber(layout.stageWidth * zoom)}px`,
    `--island-grid-scaled-h:${formatPathNumber(layout.stageHeight * zoom)}px`,
    `--island-grid-cell-w:${ISLAND_PICKER_TILE_WIDTH + ISLAND_PICKER_TILE_GAP}px`,
    `--island-grid-cell-h:${ISLAND_PICKER_TILE_HEIGHT + ISLAND_PICKER_TILE_GAP}px`,
    `--island-map-zoom:${formatPathNumber(zoom)}`,
  ].join(";");
}

function getIslandMapConnectionEdges() {
  const regionIds = new Set(getRegionIds());
  const edges = new Map();
  for (const map of getEditorMapEntries()) {
    const source = normalizeRegionId(map.id);
    if (!regionIds.has(source)) continue;
    for (const transition of getEditorPortalDefinitions(source)) {
      const target = getEdgeConnectionTargetRegionId(transition);
      if (!target || target === source || !regionIds.has(target)) continue;
      const key = [source, target].sort().join("::");
      if (!edges.has(key)) edges.set(key, { source, target });
    }
  }
  return Array.from(edges.values());
}

function renderIslandMapConnections() {
  const layout = getIslandMapGridLayout();
  const regionById = new Map(WORLD_REGIONS.map(region => [normalizeRegionId(region.id), region]));
  const lines = getIslandMapConnectionEdges().map(edge => {
    const source = regionById.get(edge.source);
    const target = regionById.get(edge.target);
    if (!source || !target) return "";
    const start = getIslandMapPosition(source);
    const end = getIslandMapPosition(target);
    return `<line class="island-map-connection" x1="${formatPathNumber(start.x)}" y1="${formatPathNumber(start.y)}" x2="${formatPathNumber(end.x)}" y2="${formatPathNumber(end.y)}"></line>`;
  }).filter(Boolean).join("");
  return `<svg class="island-map-connections" viewBox="0 0 ${Math.round(layout.stageWidth)} ${Math.round(layout.stageHeight)}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
}

function renderIslandMapTile(region, activeRegionId, homeRegionId) {
  const regionId = normalizeRegionId(region.id);
  const label = region.label || regionId;
  const summaryText = getIslandTileSummaryText(regionId);
  const isActive = regionId === activeRegionId;
  const isHome = regionId === homeRegionId;
  const previewSrc = getIslandPreviewArtSrc(regionId) || getIslandMapArtSrc(regionId);
  const ariaParts = [label, getIslandTileAriaSummary(regionId)];
  if (isActive) ariaParts.push("current map");
  if (isHome) ariaParts.push("home island");
  return `
    <button
      class="island-map-icon ${isActive ? "active" : ""} ${isHome ? "home" : ""} ${escapeHtml(region.palette || "heartland")}"
      data-island-region="${escapeHtml(regionId)}"
      style="${getIslandMapIconStyle(region)}"
      type="button"
      aria-label="${escapeHtml(ariaParts.join(", "))}"
    >
      <span class="island-map-thumb" aria-hidden="true">
        <img src="${escapeHtml(previewSrc)}" alt="" draggable="false" loading="lazy" decoding="async" fetchpriority="low" />
      </span>
      <span class="island-map-name">${escapeHtml(label)}</span>
      <span class="island-map-owned">${escapeHtml(summaryText)}</span>
      ${isActive ? `<span class="island-map-active-label">Current map</span>` : ""}
      ${isHome ? `<span class="island-map-home-label">Home map</span>` : ""}
    </button>
  `;
}

function renderIslandSwitcherModalContent() {
  const activeRegionId = getActiveOnlineRegionId();
  const homeRegionId = getMainCityRegionId();
  const zoom = clampIslandMapPickerZoom(islandMapPickerViewState.zoom);
  modalBody.innerHTML = `
    <div class="island-map-shell">
      <div class="island-map-picker" style="${getIslandMapPickerStyle()}" data-island-map-zoom="${zoom}" aria-label="Island map picker">
        <div class="island-map-stage">
          <div class="island-map-canvas-frame">
            <div class="island-map-canvas">
              ${renderIslandMapConnections()}
              ${WORLD_REGIONS.map(region => renderIslandMapTile(region, activeRegionId, homeRegionId)).join("")}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  if (!modal.open) modal.showModal();
  const picker = modalBody.querySelector(".island-map-picker");
  attachIslandMapPickerPan(picker);
  attachIslandMapPickerZoom(picker);
  if (!restoreIslandMapPickerView(picker)) {
    centerIslandMapPickerOnRegion(picker, activeRegionId || homeRegionId);
  }
  modalBody.querySelectorAll("[data-island-region]").forEach(button => {
    button.addEventListener("click", () => {
      if (picker?.dataset.justDragged === "true" || picker?.dataset.justActivated === "true") return;
      rememberIslandMapPickerView(picker);
      switchOnlineIsland(button.dataset.islandRegion, { fromMapPicker: true });
    });
  });
}

function getIslandMapPickerElement() {
  return modalBody?.querySelector?.(".island-map-picker") || null;
}

function clampIslandMapPickerZoom(value, minimumZoom = ISLAND_PICKER_MIN_ZOOM) {
  const parsed = Number(value);
  const minimum = Math.min(
    ISLAND_PICKER_MAX_ZOOM,
    Math.max(ISLAND_PICKER_MIN_ZOOM, Number(minimumZoom) || ISLAND_PICKER_MIN_ZOOM)
  );
  return Math.min(
    ISLAND_PICKER_MAX_ZOOM,
    Math.max(minimum, Number.isFinite(parsed) ? parsed : 1)
  );
}

function getIslandMapPickerFitZoom(picker) {
  if (!picker?.clientWidth || !picker?.clientHeight) return ISLAND_PICKER_MIN_ZOOM;
  const layout = getIslandMapGridLayout();
  const horizontalPadding = Math.min(28, picker.clientWidth * 0.08);
  const verticalPadding = Math.min(28, picker.clientHeight * 0.08);
  return clampIslandMapPickerZoom(Math.min(
    ISLAND_PICKER_MAX_ZOOM,
    (picker.clientWidth - horizontalPadding) / layout.stageWidth,
    (picker.clientHeight - verticalPadding) / layout.stageHeight
  ));
}

function getIslandMapPickerMinimumZoom(picker) {
  return getIslandMapPickerFitZoom(picker);
}

function getIslandMapPickerZoom(picker = getIslandMapPickerElement()) {
  return clampIslandMapPickerZoom(
    picker?.dataset?.islandMapZoom || islandMapPickerViewState.zoom,
    getIslandMapPickerMinimumZoom(picker)
  );
}

function setIslandMapPickerZoom(picker, value, {
  preserveCenter = true,
  remember = true,
  settleNextFrame = true,
  anchorClientX = null,
  anchorClientY = null,
  targetClientX = null,
  targetClientY = null,
} = {}) {
  if (!picker) return false;
  const zoom = clampIslandMapPickerZoom(value, getIslandMapPickerMinimumZoom(picker));
  const layout = getIslandMapGridLayout();
  const pickerBounds = picker.getBoundingClientRect();
  const canvasFrame = picker.querySelector(".island-map-canvas-frame");
  const previousFrameBounds = canvasFrame?.getBoundingClientRect();
  const anchorX = anchorClientX !== null && Number.isFinite(Number(anchorClientX))
    ? Number(anchorClientX)
    : pickerBounds.left + picker.clientWidth / 2;
  const anchorY = anchorClientY !== null && Number.isFinite(Number(anchorClientY))
    ? Number(anchorClientY)
    : pickerBounds.top + picker.clientHeight / 2;
  const targetX = targetClientX !== null && Number.isFinite(Number(targetClientX)) ? Number(targetClientX) : anchorX;
  const targetY = targetClientY !== null && Number.isFinite(Number(targetClientY)) ? Number(targetClientY) : anchorY;
  const anchorRatioX = previousFrameBounds?.width
    ? clamp((anchorX - previousFrameBounds.left) / previousFrameBounds.width, 0, 1)
    : 0.5;
  const anchorRatioY = previousFrameBounds?.height
    ? clamp((anchorY - previousFrameBounds.top) / previousFrameBounds.height, 0, 1)
    : 0.5;

  picker.dataset.islandMapZoom = String(zoom);
  picker.style.setProperty("--island-map-zoom", formatPathNumber(zoom));
  picker.style.setProperty("--island-grid-scaled-w", `${formatPathNumber(layout.stageWidth * zoom)}px`);
  picker.style.setProperty("--island-grid-scaled-h", `${formatPathNumber(layout.stageHeight * zoom)}px`);
  islandMapPickerViewState.zoom = zoom;

  const applyView = () => {
    if (preserveCenter) {
      const nextFrameBounds = canvasFrame?.getBoundingClientRect();
      const anchoredLeft = nextFrameBounds
        ? picker.scrollLeft + nextFrameBounds.left + nextFrameBounds.width * anchorRatioX - targetX
        : picker.scrollLeft;
      const anchoredTop = nextFrameBounds
        ? picker.scrollTop + nextFrameBounds.top + nextFrameBounds.height * anchorRatioY - targetY
        : picker.scrollTop;
      const next = clampIslandMapPickerScroll(
        picker,
        anchoredLeft,
        anchoredTop
      );
      picker.scrollLeft = next.left;
      picker.scrollTop = next.top;
    }
    if (remember) rememberIslandMapPickerView(picker);
  };
  applyView();
  if (settleNextFrame) requestAnimationFrame(applyView);
  return true;
}

function attachIslandMapPickerZoom(picker) {
  if (!picker || picker.dataset.zoomReady === "true") return;
  picker.dataset.zoomReady = "true";
  let wheelZoomFrame = 0;
  let wheelTargetZoom = getIslandMapPickerZoom(picker);
  let wheelAnchorX = null;
  let wheelAnchorY = null;
  let wheelZoomFrameAt = 0;

  const animateWheelZoom = timestamp => {
    wheelZoomFrame = 0;
    if (!picker.isConnected) return;
    const currentZoom = getIslandMapPickerZoom(picker);
    const elapsed = wheelZoomFrameAt ? Math.min(40, Math.max(8, timestamp - wheelZoomFrameAt)) : 16;
    const easing = 1 - Math.exp(-elapsed / 58);
    const difference = wheelTargetZoom - currentZoom;
    const finished = Math.abs(difference) < 0.0005;
    const nextZoom = finished ? wheelTargetZoom : currentZoom + difference * easing;
    setIslandMapPickerZoom(picker, nextZoom, {
      anchorClientX: wheelAnchorX,
      anchorClientY: wheelAnchorY,
      remember: false,
      settleNextFrame: false,
    });
    wheelZoomFrameAt = timestamp;
    if (!finished) {
      wheelZoomFrame = requestAnimationFrame(animateWheelZoom);
      return;
    }
    wheelTargetZoom = getIslandMapPickerZoom(picker);
    wheelZoomFrameAt = 0;
    rememberIslandMapPickerView(picker);
  };

  const queueWheelZoom = (value, anchorClientX = null, anchorClientY = null) => {
    wheelTargetZoom = clampIslandMapPickerZoom(value, getIslandMapPickerMinimumZoom(picker));
    wheelAnchorX = anchorClientX !== null && Number.isFinite(Number(anchorClientX)) ? Number(anchorClientX) : null;
    wheelAnchorY = anchorClientY !== null && Number.isFinite(Number(anchorClientY)) ? Number(anchorClientY) : null;
    if (!wheelZoomFrame) wheelZoomFrame = requestAnimationFrame(animateWheelZoom);
  };

  picker.addEventListener("wheel", event => {
    event.preventDefault();
    if (!wheelZoomFrame) wheelTargetZoom = getIslandMapPickerZoom(picker);
    const boundedDelta = clamp(Number(event.deltaY) || 0, -120, 120);
    const nextTargetZoom = clampIslandMapPickerZoom(
      wheelTargetZoom * Math.exp(-boundedDelta * 0.0016),
      getIslandMapPickerMinimumZoom(picker)
    );
    queueWheelZoom(nextTargetZoom, event.clientX, event.clientY);
  }, { passive: false });
  setIslandMapPickerZoom(picker, getIslandMapPickerZoom(picker), {
    preserveCenter: false,
    remember: false,
  });
}

function clampIslandMapPickerScroll(picker, scrollLeft, scrollTop) {
  const maxLeft = Math.max(0, (picker?.scrollWidth || 0) - (picker?.clientWidth || 0));
  const maxTop = Math.max(0, (picker?.scrollHeight || 0) - (picker?.clientHeight || 0));
  return {
    left: Math.min(Math.max(0, Number(scrollLeft) || 0), maxLeft),
    top: Math.min(Math.max(0, Number(scrollTop) || 0), maxTop),
  };
}

function rememberIslandMapPickerView(picker = getIslandMapPickerElement()) {
  if (!picker) return false;
  const clamped = clampIslandMapPickerScroll(picker, picker.scrollLeft, picker.scrollTop);
  islandMapPickerViewState.scrollLeft = clamped.left;
  islandMapPickerViewState.scrollTop = clamped.top;
  islandMapPickerViewState.zoom = getIslandMapPickerZoom(picker);
  islandMapPickerViewState.hasView = true;
  return true;
}

function restoreIslandMapPickerView(picker) {
  if (!picker || !islandMapPickerViewState.hasView) return false;
  setIslandMapPickerZoom(picker, islandMapPickerViewState.zoom, {
    preserveCenter: false,
    remember: false,
  });
  const apply = () => {
    const clamped = clampIslandMapPickerScroll(
      picker,
      islandMapPickerViewState.scrollLeft,
      islandMapPickerViewState.scrollTop
    );
    picker.scrollLeft = clamped.left;
    picker.scrollTop = clamped.top;
    rememberIslandMapPickerView(picker);
  };
  apply();
  requestAnimationFrame(apply);
  return true;
}

function updateIslandMapHomeMarkerInPlace(homeRegionId = getMainCityRegionId()) {
  const picker = getIslandMapPickerElement();
  if (!picker) return false;
  const activeRegionId = getActiveOnlineRegionId();
  const nextHomeRegionId = normalizeRegionId(homeRegionId);
  picker.querySelectorAll("[data-island-region]").forEach(button => {
    const regionId = normalizeRegionId(button.dataset.islandRegion);
    const isHome = regionId === nextHomeRegionId;
    const isActive = regionId === activeRegionId;
    button.classList.toggle("home", isHome);

    let homeLabel = button.querySelector(".island-map-home-label");
    if (isHome && !homeLabel) {
      homeLabel = document.createElement("span");
      homeLabel.className = "island-map-home-label";
      homeLabel.textContent = "Home map";
      button.appendChild(homeLabel);
    } else if (!isHome && homeLabel) {
      homeLabel.remove();
    }

    const ariaParts = [getRegionLabel(regionId), getIslandTileAriaSummary(regionId)];
    if (isActive) ariaParts.push("current map");
    if (isHome) ariaParts.push("home island");
    button.setAttribute("aria-label", ariaParts.join(", "));
  });
  return true;
}

async function refreshIslandMapHomeRegionOnceForOpen() {
  if (!state || islandMapHomeRefreshInFlight) return false;
  const api = getOnlineApi();
  if (!api?.loadPlayerProfile || !api?.isSignedIn?.()) return false;
  islandMapHomeRefreshInFlight = true;
  try {
    const profile = await withTimeout(api.loadPlayerProfile(), 3500, "Player profile lookup is taking too long.");
    if (!profile || !isCurrentResetProfile(profile)) return false;
    const homeRegionId = getStoredHomeRegionId(profile, { trustLocalState: false });
    if (!homeRegionId) return false;
    const mainCityId = getKnownCityId(profile.mainCityId);
    if (!state.online) state.online = {};
    state.online.mainRegionId = homeRegionId;
    state.online.mainIslandId = getOnlineIslandId(homeRegionId);
    if (mainCityId) {
      state.online.mainCityId = mainCityId;
      state.mainCityId = mainCityId;
    }
    updateIslandMapHomeMarkerInPlace(homeRegionId);
    updateIslandSwitcherUi();
    updateMainCityReturnButton();
    return true;
  } catch (error) {
    console.warn("Could not refresh home map marker", error);
    return false;
  } finally {
    islandMapHomeRefreshInFlight = false;
  }
}

function centerIslandMapPickerOnRegion(picker, regionId) {
  if (!picker || !regionId) return;
  const apply = () => {
    const target = [...picker.querySelectorAll("[data-island-region]")]
      .find(button => button.dataset.islandRegion === regionId);
    if (!target || !picker.clientWidth || !picker.clientHeight) return false;
    const pickerBounds = picker.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const centered = clampIslandMapPickerScroll(
      picker,
      picker.scrollLeft + targetBounds.left + targetBounds.width / 2 - pickerBounds.left - picker.clientWidth / 2,
      picker.scrollTop + targetBounds.top + targetBounds.height / 2 - pickerBounds.top - picker.clientHeight / 2
    );
    picker.scrollLeft = centered.left;
    picker.scrollTop = centered.top;
    rememberIslandMapPickerView(picker);
    return true;
  };
  if (!apply()) requestAnimationFrame(apply);
}

function getIslandMapPinchGeometry(pointers) {
  const points = Array.from(pointers?.values?.() || []).slice(0, 2);
  if (points.length < 2) return null;
  const [first, second] = points;
  return {
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
  };
}

function attachIslandMapPickerPan(picker) {
  if (!picker || picker.dataset.panReady === "true") return;
  picker.dataset.panReady = "true";
  const touchPointers = new Map();
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let moved = false;
  let tapRegionId = "";
  let pinchGeometry = null;
  let pendingPinchGeometry = null;
  let pinchZoomFrame = 0;

  picker.addEventListener("scroll", () => {
    rememberIslandMapPickerView(picker);
  }, { passive: true });

  const beginPan = (id, x, y, regionId = "") => {
    pointerId = id;
    startX = x;
    startY = y;
    startScrollLeft = picker.scrollLeft;
    startScrollTop = picker.scrollTop;
    moved = false;
    tapRegionId = regionId;
    picker.classList.add("panning");
  };

  const suppressTileActivation = () => {
    picker.dataset.justDragged = "true";
    window.setTimeout(() => {
      if (picker) delete picker.dataset.justDragged;
    }, 180);
  };

  const applyPendingPinchZoom = () => {
    pinchZoomFrame = 0;
    const nextGeometry = pendingPinchGeometry;
    pendingPinchGeometry = null;
    if (!pinchGeometry || !nextGeometry) return;
    const nextZoom = getIslandMapPickerZoom(picker) * (nextGeometry.distance / pinchGeometry.distance);
    setIslandMapPickerZoom(picker, nextZoom, {
      anchorClientX: pinchGeometry.centerX,
      anchorClientY: pinchGeometry.centerY,
      targetClientX: nextGeometry.centerX,
      targetClientY: nextGeometry.centerY,
      remember: false,
      settleNextFrame: false,
    });
    pinchGeometry = nextGeometry;
  };

  picker.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;
    const tile = event.target?.closest?.("[data-island-region]");
    picker.setPointerCapture?.(event.pointerId);
    if (event.pointerType === "touch") {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size >= 2) {
        pointerId = null;
        moved = true;
        tapRegionId = "";
        pinchGeometry = getIslandMapPinchGeometry(touchPointers);
        picker.classList.add("panning", "pinching");
        event.preventDefault();
        return;
      }
    }
    if (pointerId !== null) return;
    beginPan(event.pointerId, event.clientX, event.clientY, tile?.dataset?.islandRegion || "");
  });

  picker.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size >= 2) {
        const nextGeometry = getIslandMapPinchGeometry(touchPointers);
        pendingPinchGeometry = nextGeometry;
        if (!pinchZoomFrame) pinchZoomFrame = requestAnimationFrame(applyPendingPinchZoom);
        moved = true;
        tapRegionId = "";
        event.preventDefault();
        return;
      }
    }
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    if (moved) event.preventDefault();
    picker.scrollLeft = startScrollLeft - dx;
    picker.scrollTop = startScrollTop - dy;
    rememberIslandMapPickerView(picker);
  });

  const stopPan = event => {
    const wasPinching = picker.classList.contains("pinching");
    if (wasPinching && pinchZoomFrame) {
      cancelAnimationFrame(pinchZoomFrame);
      applyPendingPinchZoom();
    }
    if (event.pointerType === "touch") touchPointers.delete(event.pointerId);
    picker.releasePointerCapture?.(event.pointerId);
    if (wasPinching) {
      pinchGeometry = getIslandMapPinchGeometry(touchPointers);
      if (pinchGeometry) return;
      picker.classList.remove("pinching");
      rememberIslandMapPickerView(picker);
      suppressTileActivation();
      const remaining = touchPointers.entries().next().value;
      if (remaining) {
        const [remainingPointerId, point] = remaining;
        beginPan(remainingPointerId, point.x, point.y);
        moved = true;
        return;
      }
      pointerId = null;
      picker.classList.remove("panning");
      return;
    }
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    picker.classList.remove("panning");
    if (moved) {
      rememberIslandMapPickerView(picker);
      suppressTileActivation();
    } else if (tapRegionId) {
      const releasedTile = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-island-region]");
      if (releasedTile?.dataset?.islandRegion === tapRegionId) {
        picker.dataset.justActivated = "true";
        rememberIslandMapPickerView(picker);
        switchOnlineIsland(tapRegionId, { fromMapPicker: true });
        window.setTimeout(() => {
          if (picker) delete picker.dataset.justActivated;
        }, 180);
      }
    }
    tapRegionId = "";
  };

  picker.addEventListener("pointerup", stopPan);
  picker.addEventListener("pointercancel", stopPan);
}

function showIslandSwitcherModal() {
  if (!state) return;
  if (isMapInteractionBlocked()) {
    showToast("Finish loading the current island first.");
    return;
  }
  modal.classList.remove("battle-report-modal", "city-list-modal", "leaderboard-modal", "inventory-modal", "shop-modal", "incoming-attack-modal", "outgoing-attack-modal", "scout-report-modal", "offline-reward-modal");
  modal.classList.add("island-switcher-modal");
  modalTitle.textContent = "Map";
  renderIslandSwitcherModalContent();
  if (!modal.open) modal.showModal();
  refreshIslandMapHomeRegionOnceForOpen();
}

function prepareSelectionForIslandSwitch() {
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  if (sendMode && source?.owner === "player") {
    selectedTargetId = null;
    scoutNearbySourceId = null;
    regroupSourceId = null;
    return;
  }
  clearSelection(false);
}

async function switchOnlineIsland(regionId, { fromMapPicker = false } = {}) {
  const targetRegionId = normalizeRegionId(regionId);
  if (isMapInteractionBlocked()) {
    if (fromMapPicker) showToast("Finish loading the current island first.");
    return false;
  }
  if (!state) {
    await preloadIslandMap(targetRegionId);
    centerOnRegion(targetRegionId);
    if (modal.open) modal.close();
    return true;
  }
  if (targetRegionId === getActiveOnlineRegionId() && onlineWorldConnected) {
    if (modal.open) modal.close();
    syncMapSurfaceToActiveIsland();
    updateCameraTransform();
    return true;
  }

  if (!getOnlineApi()?.isSignedIn?.()) {
    setMapSwitchLoading(`Loading ${getRegionLabel(targetRegionId)}...`);
    prepareSelectionForIslandSwitch();
    if (fromMapPicker && modal.open) modal.close();
    try {
      const ready = await preloadIslandMap(targetRegionId);
      if (!ready) {
        showToast(`Could not load ${getRegionLabel(targetRegionId)} map art.`);
        return false;
      }
      state.activeRegionId = targetRegionId;
      onlineActiveRegionId = targetRegionId;
      updateIslandSwitcherUi();
      if (modal.open) modal.close();
      centerOnRegion(targetRegionId);
      renderAll();
      return true;
    } finally {
      clearMapSwitchLoading();
    }
  }

  const previousRegionId = getActiveOnlineRegionId();
  const previousLabel = getRegionLabel(previousRegionId);
  const targetLabel = getRegionLabel(targetRegionId);
  const homeRegionId = state.online?.mainRegionId || previousRegionId;
  let leftPreviousIsland = false;
  setMapSwitchLoading(`Loading ${targetLabel}...`);
  prepareSelectionForIslandSwitch();
  if (fromMapPicker && modal.open) modal.close();
  try {
    onlineStatusDetail.textContent = `Preparing ${targetLabel}...`;
    const mapReady = await preloadIslandMap(targetRegionId);
    if (!mapReady) {
      showToast(`Could not load ${targetLabel} map art.`);
      onlineStatusDetail.textContent = `${previousLabel} connected.`;
      return false;
    }

    onlineStatusDetail.textContent = `Leaving ${previousLabel}...`;
    try {
      await withTimeout(syncOwnedCitiesToOnline(true), 4500, `${previousLabel} city save is taking too long.`);
    } catch (error) {
      onlineLastError = error?.message || String(error);
      console.warn("Continuing island switch before city sync finished", error);
    }
    queueOnlineSave();
    saveGame();
    if (typeof onlineIslandUnsubscribe === "function") onlineIslandUnsubscribe();
    onlineIslandUnsubscribe = null;
    clearOnlineIslandArmySnapshots();
    leftPreviousIsland = true;
    onlinePresence = [];
    onlineCitiesLoaded = false;
    onlineWorldConnected = false;
    if (modal.open) modal.close();
    const connected = await connectOnlineIsland(targetRegionId, {
      claimHome: false,
      homeRegionId,
      activateOnFirstSnapshot: true,
    });
    if (connected) {
      centerOnRegion(targetRegionId);
      renderAll();
      return true;
    } else {
      if (leftPreviousIsland) {
        await connectOnlineIsland(previousRegionId, {
          claimHome: false,
          homeRegionId,
        });
      }
      centerOnRegion(previousRegionId);
      renderAll();
      showToast(`Could not load ${targetLabel}.`);
      return false;
    }
  } finally {
    clearMapSwitchLoading();
  }
}

function applyOnlinePresence(rawPresence) {
  if (!Array.isArray(rawPresence)) {
    onlinePresence = [];
    updateOnlinePlayersUi();
    return;
  }
  onlinePresence = rawPresence.map(normalizePresence).filter(Boolean);
  if (rememberPlayerIdentities(onlinePresence, { force: true }) && canonicalizeVisiblePlayerIdentities()) {
    renderCities();
    renderArmies();
    updateIncomingAttackUi();
    updateOutgoingAttackUi();
  }
  updateOnlinePlayersUi();
}

async function publishOnlinePresence(force = false) {
  if (onlinePresenceInFlight) return false;
  if (!isOnlineWorldActive()) return false;
  const api = getOnlineApi();
  if (!api?.savePresence) return false;
  const islandId = getActiveOnlineIslandId();
  onlinePresenceInFlight = true;
  try {
    await api.savePresence(islandId, getOnlinePresenceSnapshot());
    rememberCurrentPlayerIdentity();
    onlineLastError = "";
    updateOnlinePlayersUi();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    updateOnlineUi();
    console.warn("Could not sync online presence", error);
    return false;
  } finally {
    onlinePresenceInFlight = false;
  }
}

function handleOnlineSnapshotError(error, rejectInitialCities = null) {
  onlineLastError = error?.message || String(error);
  updateOnlineUi();
  updateOnlinePlayersUi();
  if (typeof rejectInitialCities === "function") rejectInitialCities(error);
  showToast(`${getRegionLabel(getActiveOnlineRegionId())} sync error.`);
  console.warn("Active island snapshot failed", error);
}

function normalizeGameServerMembership(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const serverId = String(raw.serverId || "").trim();
  const status = String(raw.status || "").trim().toLowerCase();
  if (serverId !== GAME_SERVER_ID || !["active", "waiting", "left", "expired", "session-replaced"].includes(status)) return null;
  return {
    serverId,
    serverName: String(raw.serverName || GAME_SERVER_NAME).trim() || GAME_SERVER_NAME,
    status,
    queuedAtMs: Math.max(0, Number(raw.queuedAtMs) || 0),
    admittedAtMs: Math.max(0, Number(raw.admittedAtMs) || 0),
    lastSeenAtMs: Math.max(0, Number(raw.lastSeenAtMs) || 0),
    updatedAtMs: Math.max(0, Number(raw.updatedAtMs) || 0),
  };
}

function hasActiveGameServerSlot() {
  return gameServerMembership?.serverId === GAME_SERVER_ID && gameServerMembership.status === "active";
}

function isWaitingForGameServerSlot() {
  return gameServerMembership?.serverId === GAME_SERVER_ID && gameServerMembership.status === "waiting";
}

function stopGameServerHeartbeat() {
  if (gameServerHeartbeatIntervalId) window.clearInterval(gameServerHeartbeatIntervalId);
  gameServerHeartbeatIntervalId = 0;
  gameServerHeartbeatInFlight = false;
}

async function heartbeatGameServerMembership() {
  if (gameServerHeartbeatInFlight || (!hasActiveGameServerSlot() && !isWaitingForGameServerSlot())) return false;
  const api = getOnlineApi();
  if (!api?.heartbeatGameServer || !api?.isSignedIn?.()) return false;
  gameServerHeartbeatInFlight = true;
  try {
    const result = await api.heartbeatGameServer(GAME_SERVER_ID);
    applyGameServerMembership(result);
    return true;
  } catch (error) {
    console.warn("Could not refresh Crownlands realm membership", error);
    return false;
  } finally {
    gameServerHeartbeatInFlight = false;
  }
}

function startGameServerHeartbeat() {
  if (gameServerHeartbeatIntervalId) return;
  gameServerHeartbeatIntervalId = window.setInterval(
    heartbeatGameServerMembership,
    GAME_SERVER_HEARTBEAT_SECONDS * 1000
  );
  heartbeatGameServerMembership();
}

function stopGameServerMembershipWatcher({ clear = true } = {}) {
  if (typeof gameServerMembershipUnsubscribe === "function") gameServerMembershipUnsubscribe();
  gameServerMembershipUnsubscribe = null;
  stopGameServerHeartbeat();
  if (clear) gameServerMembership = null;
}

function applyGameServerMembership(raw = null) {
  const membership = normalizeGameServerMembership(raw);
  gameServerMembership = membership;
  if (membership?.status === "active" || membership?.status === "waiting") startGameServerHeartbeat();
  else stopGameServerHeartbeat();
  updateOnlineUi();

  if (
    membership?.status === "active"
    && gameServerAutoEnter
    && !gameServerLaunchInFlight
    && setupScreen?.classList.contains("visible")
  ) {
    gameServerAutoEnter = false;
    window.setTimeout(() => startFromInput(false), 0);
  }
}

function watchGameServerMembership() {
  stopGameServerMembershipWatcher({ clear: true });
  const api = getOnlineApi();
  if (!api?.isSignedIn?.() || !api?.subscribeGameServerMembership) {
    updateOnlineUi();
    return;
  }
  gameServerMembershipUnsubscribe = api.subscribeGameServerMembership({
    onMembership: membership => applyGameServerMembership(membership),
    onError: error => {
      console.warn("Could not watch Crownlands realm membership", error);
      onlineLastError = error?.message || String(error);
      updateOnlineUi();
    },
  });
}

async function joinSelectedGameServer() {
  if (gameServerJoinInFlight) return false;
  const api = getOnlineApi();
  if (!api?.joinGameServer || !api?.isSignedIn?.()) throw new Error("Sign in before entering a Crownlands realm.");
  gameServerJoinInFlight = true;
  try {
    const result = await api.joinGameServer(GAME_SERVER_ID);
    applyGameServerMembership(result);
    if (result?.status === "waiting") {
      gameServerAutoEnter = true;
      return false;
    }
    return result?.status === "active";
  } finally {
    gameServerJoinInFlight = false;
  }
}

async function leaveSelectedGameServer() {
  const api = getOnlineApi();
  const shouldLeave = hasActiveGameServerSlot() || isWaitingForGameServerSlot();
  gameServerAutoEnter = false;
  if (!shouldLeave || !api?.leaveGameServer || !api?.isSignedIn?.()) {
    stopGameServerMembershipWatcher({ clear: true });
    return false;
  }
  try {
    await api.leaveGameServer(GAME_SERVER_ID);
    return true;
  } catch (error) {
    console.warn("Could not release Crownlands realm slot", error);
    return false;
  } finally {
    stopGameServerMembershipWatcher({ clear: true });
  }
}

function updateOnlineUi() {
  const api = getOnlineApi();
  updateOnlinePlayersUi();
  updateIslandSwitcherUi();
  if (!onlineStatusText || !onlineStatusDetail) return;

  const setRealmMenuState = (visible, waiting = false) => {
    if (serverRealmList) serverRealmList.hidden = !visible;
    if (serverQueueStatus) serverQueueStatus.hidden = !visible || !waiting;
    if (serverRealmBtn) {
      serverRealmBtn.disabled = !visible || waiting || gameServerJoinInFlight || gameServerLaunchInFlight;
      serverRealmBtn.classList.toggle("selected", visible);
      serverRealmBtn.setAttribute("aria-pressed", visible ? "true" : "false");
    }
  };

  if (!api) {
    setRealmMenuState(false);
    onlineStatusText.textContent = "Online unavailable";
    onlineStatusDetail.textContent = "Firebase client did not load.";
    if (googleSignInBtn) googleSignInBtn.disabled = true;
    if (enterKingdomBtn) enterKingdomBtn.hidden = true;
    if (googleSignOutBtn) googleSignOutBtn.hidden = true;
    return;
  }

  const configured = Boolean(api.isConfigured?.());
  const signedIn = Boolean(api.isSignedIn?.());
  const user = api.getUser?.();

  if (!configured) {
    setRealmMenuState(false);
    onlineStatusText.textContent = "Firebase needed";
    onlineStatusDetail.textContent = "Paste your Firebase web config into firebase-config.js to enable Google login.";
    if (googleSignInBtn) {
      googleSignInBtn.hidden = false;
      googleSignInBtn.disabled = true;
    }
    if (enterKingdomBtn) enterKingdomBtn.hidden = true;
    if (googleSignOutBtn) googleSignOutBtn.hidden = true;
    return;
  }

  if (onlineSessionReplaced) {
    setRealmMenuState(false);
    onlineStatusText.textContent = "Signed out";
    onlineStatusDetail.textContent = "This account opened on another device.";
    if (googleSignInBtn) {
      googleSignInBtn.hidden = false;
      googleSignInBtn.disabled = signedIn;
    }
    if (enterKingdomBtn) enterKingdomBtn.hidden = true;
    if (googleSignOutBtn) googleSignOutBtn.hidden = true;
    return;
  }

  if (signedIn) {
    const waitingForRealm = isWaitingForGameServerSlot();
    const realmIsActive = hasActiveGameServerSlot();
    setRealmMenuState(true, waitingForRealm);
    onlineStatusText.textContent = user?.displayName ? `Signed in: ${user.displayName}` : "Signed in";
    if (waitingForRealm) {
      onlineStatusDetail.textContent = `Waiting for an opening in ${GAME_SERVER_NAME}.`;
    } else if (onlineLastError) {
      onlineStatusDetail.textContent = `Online waiting: ${onlineLastError}`;
    } else if (realmIsActive) {
      onlineStatusDetail.textContent = `${GAME_SERVER_NAME} is ready. Press Enter Kingdom.`;
    } else if (usesServerEconomyAuthority() && serverEconomyLastSyncAt) {
      onlineStatusDetail.textContent = `${GAME_SERVER_NAME} is selected. Press Enter Kingdom.`;
    } else if (onlineLastSaveAt) {
      onlineStatusDetail.textContent = `${GAME_SERVER_NAME} is selected. Press Enter Kingdom.`;
    } else {
      onlineStatusDetail.textContent = `${GAME_SERVER_NAME} is selected. Press Enter Kingdom.`;
    }
    if (googleSignInBtn) googleSignInBtn.hidden = true;
    if (enterKingdomBtn) {
      enterKingdomBtn.hidden = waitingForRealm;
      enterKingdomBtn.disabled = waitingForRealm || gameServerJoinInFlight || gameServerLaunchInFlight;
    }
    if (googleSignOutBtn) {
      googleSignOutBtn.hidden = false;
      googleSignOutBtn.disabled = false;
    }
    return;
  }

  setRealmMenuState(false);
  onlineStatusText.textContent = "Sign in to play";
  onlineStatusDetail.textContent = "Use Google to load your kingdom.";
  if (googleSignInBtn) {
    googleSignInBtn.hidden = false;
    googleSignInBtn.disabled = false;
  }
  if (enterKingdomBtn) enterKingdomBtn.hidden = true;
  if (googleSignOutBtn) googleSignOutBtn.hidden = true;
}

async function handleGoogleSignIn() {
  const api = getOnlineApi();
  if (!api?.signInWithGoogle) {
    showToast("Firebase login is not ready yet.");
    return;
  }

  try {
    onlineSessionReplaced = false;
    if (googleSignInBtn) googleSignInBtn.disabled = true;
    await api.signInWithGoogle();
    onlineLastError = "";
    updateOnlineUi();
    if (state) {
      queueOnlineSave();
      await flushOnlineSave(true);
    }
    showToast(`Google connected. ${GAME_SERVER_NAME} is ready to join.`);
  } catch (error) {
    onlineLastError = error?.message || String(error);
    updateOnlineUi();
    showToast("Google sign-in failed.");
    console.warn("Google sign-in failed", error);
  } finally {
    if (googleSignInBtn && !api.isSignedIn?.()) googleSignInBtn.disabled = false;
  }
}

async function handleGoogleSignOut() {
  const api = getOnlineApi();
  if (!api?.signOut) return;
  try {
    onlineSessionReplaced = false;
    if (onlineArmySavePromises.size || onlineCityStateSavePromises.size) {
      showToast("Finishing army orders...");
      try {
        await waitForPendingOnlineWrites(5000);
      } catch (error) {
        onlineLastError = error?.message || String(error);
        console.warn("Continuing sign-out while some online writes are still pending", error);
      }
    }
    await flushOnlineSave(true);
    disconnectOnlineWorld();
    await leaveSelectedGameServer();
    await api.signOut();
    onlineLastSaveAt = 0;
    onlineLastError = "";
    updateOnlineUi();
    showToast("Signed out.");
  } catch (error) {
    onlineLastError = error?.message || String(error);
    updateOnlineUi();
    showToast("Could not sign out.");
  }
}

function handleOnlineSessionReplaced() {
  leaveSelectedGameServer();
  onlineSessionReplaced = true;
  onlineLastError = "";
  disconnectOnlineWorld();
  clearSelection(false);
  if (modal?.open) modal.close();
  closeProfileScreen();
  setSetupLoading(false);
  state = null;
  if (setupScreen) setupScreen.classList.add("visible");
  updateOnlineUi();
  showToast("Signed out. This account opened on another device.");
}

function getCurrentOnlineUid() {
  return getOnlineApi()?.getUser?.()?.uid || "";
}

function isOnlineWorldActive() {
  return Boolean(state?.online?.islandId && getOnlineApi()?.isSignedIn?.());
}

function queueOnlineIdentityRepair() {
  const api = getOnlineApi();
  if (
    onlineIdentityRepairCompleted
    || onlineIdentityRepairInFlight
    || !state
    || !isOnlineWorldActive()
    || !api?.syncPlayerIdentity
  ) {
    return;
  }

  onlineIdentityRepairInFlight = true;
  window.setTimeout(async () => {
    try {
      const repaired = await syncPlayerIdentityToAllOwnedCities({ forceLeaderboard: true });
      onlineIdentityRepairCompleted = Boolean(repaired);
      if (!repaired) console.warn("Player identity repair did not complete; it will retry next kingdom load.");
    } catch (error) {
      onlineIdentityRepairCompleted = false;
      console.warn("Could not repair player identity across owned cities", error);
    } finally {
      onlineIdentityRepairInFlight = false;
    }
  }, 0);
}

function disconnectOnlineWorld() {
  if (typeof onlineIslandUnsubscribe === "function") onlineIslandUnsubscribe();
  onlineIslandUnsubscribe = null;
  clearOnlineArmyWatchers();
  clearOnlineHeldCampWatcher();
  clearOnlineServerReportWatcher();
  clearOnlineGlobalStatsWatcher();
  clearOnlineCrownCitadelWatcher();
  appliedServerReportIds = new Set();
  lastAuthoritativeProfileRevisionMs = 0;
  lastReportDrivenEconomyRefreshAtMs = 0;
  onlinePresence = [];
  onlineCampStates = new Map();
  onlineHeldCampStates = new Map();
  resolvingRewardCampPayoutIds = new Set();
  deedCampHistoryCache.clear();
  deedCampHistoryRequests.clear();
  crownCitadelReignCache = [];
  crownCitadelReignRequest = null;
  onlineGlobalStats = null;
  onlineIslandSummaries = new Map();
  onlineIslandSummaryRefreshInFlight = false;
  onlineOwnedCitiesCache = [];
  onlineOwnedCitiesCacheAt = 0;
  onlineOwnedCitiesCacheComplete = false;
  onlineOwnedCitiesRefreshInFlight = false;
  onlinePresenceTimer = 0;
  onlinePresenceInFlight = false;
  harvestRelocationRetryAtMs = 0;
  overdueArmyResolveTimer = 0;
  pendingArmyRecoveryInFlight = false;
  onlineWorldConnected = false;
  onlineCitiesLoaded = false;
  onlineFreshClaimCityId = "";
  onlineWorldLoading = false;
  updateOnlinePlayersUi();
  updateIslandSwitcherUi();
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

function getScriptVersionFromDocument(doc) {
  const scripts = Array.from(doc?.querySelectorAll?.("script[src]") || []);
  const gameScript = scripts.find(script => String(script.getAttribute("src") || "").includes("game.js"));
  if (!gameScript) return "";
  try {
    const url = new URL(gameScript.getAttribute("src"), window.location.href);
    return url.searchParams.get("v") || "";
  } catch (_) {
    return "";
  }
}

function getBuildIdFromDocument(doc) {
  const metaBuild = String(doc?.querySelector?.('meta[name="crownlands-build"]')?.getAttribute("content") || "").trim();
  return metaBuild || getScriptVersionFromDocument(doc);
}

function getCurrentDocumentBuildId() {
  return getBuildIdFromDocument(document) || "dev";
}

function getUpdateCheckUrl() {
  const url = new URL("index.html", `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}`);
  url.searchParams.set("updateCheck", Date.now().toString());
  return url;
}

function getBuildIdFromHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    return getBuildIdFromDocument(doc);
  } catch (_) {
    return "";
  }
}

async function fetchDeployedBuildId() {
  const response = await fetch(getUpdateCheckUrl(), {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) return "";
  return getBuildIdFromHtml(await response.text());
}

async function checkForDeployedUpdate(force = false) {
  const api = getOnlineApi();
  if (updateCheckInFlight || !api?.isSignedIn?.()) return false;
  if (!force && document.visibilityState === "hidden") return false;
  updateCheckInFlight = true;
  try {
    const deployedBuildId = await fetchDeployedBuildId();
    if (!deployedBuildId || deployedBuildId === APP_BUILD_ID) return false;
    if (deployedBuildId === deployedUpdateAvailableBuildId && deployedUpdateNoticeShown) return false;
    await handleDeployedUpdate(deployedBuildId);
    return true;
  } catch (error) {
    console.warn("Could not check for Crownlands updates", error);
    return false;
  } finally {
    updateCheckInFlight = false;
  }
}

function updateDeploymentCheck(dt) {
  updateCheckTimer += dt;
  if (updateCheckTimer < UPDATE_CHECK_INTERVAL_SECONDS) return;
  updateCheckTimer = 0;
  checkForDeployedUpdate();
}

async function handleDeployedUpdate(deployedBuildId) {
  const nextBuildId = String(deployedBuildId || "").trim();
  if (!nextBuildId || nextBuildId === APP_BUILD_ID || deployedUpdateReloadInProgress) return;
  deployedUpdateReloadInProgress = true;
  deployedUpdateAvailableBuildId = String(deployedBuildId || "");
  deployedUpdateNoticeShown = true;
  showToast("Crownlands updated. Restarting the game...");
  if (onlineStatusDetail) onlineStatusDetail.textContent = "Installing the latest Crownlands update...";
  setSetupLoading(true, "Installing the latest Crownlands update...");
  setMapSwitchLoading("Installing update...");
  console.info("[Crownlands] New deployed build available.", {
    currentBuildId: APP_BUILD_ID,
    deployedBuildId: deployedUpdateAvailableBuildId,
  });

  if (state) {
    saveGame();
    try {
      await withTimeout(
        Promise.resolve(flushOnlineSave(true)),
        UPDATE_RELOAD_SAVE_TIMEOUT_MS,
        "Timed out while saving before the update reload.",
      );
    } catch (error) {
      console.warn("[Crownlands] Continuing update reload after save timeout.", error);
    }
  }

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      await registration?.update?.();
      registration?.waiting?.postMessage?.({ type: "SKIP_WAITING" });
    } catch (error) {
      console.warn("[Crownlands] Service worker update check failed before reload.", error);
    }
  }

  await new Promise(resolve => window.setTimeout(resolve, UPDATE_RELOAD_PAUSE_MS));
  const reloadUrl = new URL(window.location.href);
  reloadUrl.searchParams.set("build", nextBuildId);
  window.location.replace(reloadUrl.href);
}

function handleServiceWorkerUpdateMessage(event) {
  if (event?.data?.type !== "CROWNLANDS_UPDATE_READY") return;
  const buildId = String(event.data.buildId || "").trim();
  if (!buildId || buildId === APP_BUILD_ID) return;
  handleDeployedUpdate(buildId);
}

function readPendingOnlineArmyMovements() {
  try {
    const raw = localStorage.getItem(PENDING_ARMY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(entry => entry?.movement?.id) : [];
  } catch (error) {
    console.warn("Could not read pending army queue", error);
    return [];
  }
}

function writePendingOnlineArmyMovements(entries) {
  try {
    const cutoff = Date.now() - PENDING_ARMY_MAX_AGE_MS;
    const cleaned = (Array.isArray(entries) ? entries : [])
      .filter(entry => entry?.movement?.id && Math.max(0, Number(entry.updatedAtMs) || 0) >= cutoff)
      .slice(-40);
    if (cleaned.length) localStorage.setItem(PENDING_ARMY_STORAGE_KEY, JSON.stringify(cleaned));
    else localStorage.removeItem(PENDING_ARMY_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not save pending army queue", error);
  }
}

function rememberPendingOnlineArmyMovement(movement, regionIds = []) {
  const uid = getCurrentOnlineUid();
  if (!uid || !movement?.id) return;
  const entries = readPendingOnlineArmyMovements();
  const key = `${uid}:${movement.id}`;
  const nextEntry = {
    key,
    uid,
    movement,
    regionIds: [...new Set((regionIds.length ? regionIds : movement.routeRegionIds || []).map(normalizeRegionId).filter(Boolean))],
    updatedAtMs: Date.now(),
  };
  const nextEntries = entries.filter(entry => entry.key !== key);
  nextEntries.push(nextEntry);
  writePendingOnlineArmyMovements(nextEntries);
}

function forgetPendingOnlineArmyMovement(onlineId) {
  const uid = getCurrentOnlineUid();
  if (!uid || !onlineId) return;
  const key = `${uid}:${onlineId}`;
  writePendingOnlineArmyMovements(readPendingOnlineArmyMovements().filter(entry => entry.key !== key));
}

async function saveOnlineArmyMovementToRegions(movement, regionIds = []) {
  onlineLastError = "Direct army writes are disabled. Online military movement must go through the server.";
  console.warn("Blocked direct army movement write", { movementId: movement?.id, regionIds });
  return false;
}

async function waitForPendingOnlineWrites(timeoutMs = 4500) {
  const pending = [...onlineArmySavePromises, ...onlineCityStateSavePromises];
  if (!pending.length) return true;
  await withTimeout(Promise.allSettled(pending), timeoutMs, "Online orders are still syncing.");
  return true;
}

async function recoverPendingOnlineArmyMovements() {
  if (pendingArmyRecoveryInFlight) return false;
  if (!isOnlineWorldActive()) return false;
  const uid = getCurrentOnlineUid();
  if (!uid) return false;
  writePendingOnlineArmyMovements(readPendingOnlineArmyMovements().filter(entry => entry.uid !== uid));
  return false;
}

async function subscribeOnlineIslandWithInitialCities(api, islandId, handlers = {}, timeoutMs = ONLINE_INITIAL_CITY_LIST_TIMEOUT_MS, timeoutMessage = "City list is taking too long.") {
  let unsubscribe = null;
  let settled = false;
  const initialSnapshot = new Promise((resolve, reject) => {
    unsubscribe = api.subscribeIsland(islandId, {
      ...handlers,
      onCities: cities => {
        if (typeof handlers.onCities === "function") handlers.onCities(cities);
        if (!settled) {
          settled = true;
          resolve(cities);
        }
      },
      onError: (error, source) => {
        if (typeof handlers.onError === "function") handlers.onError(error, source);
        if (source === "cities" && !settled) {
          settled = true;
          reject(error);
        }
      },
    });
    if (typeof unsubscribe !== "function" && !settled) {
      settled = true;
      reject(new Error("Island subscription could not start."));
    }
  });

  try {
    const cities = await withTimeout(initialSnapshot, timeoutMs, timeoutMessage);
    if (!Array.isArray(cities)) throw new Error("City list did not load.");
    return unsubscribe;
  } catch (error) {
    const timedOut = String(error?.message || error) === timeoutMessage;
    if (timedOut && api?.loadIslandCities) {
      console.warn("Initial live city list timed out; using one-time city load while the listener catches up.", {
        islandId,
        timeoutMs,
      });
      try {
        const fallbackMessage = timeoutMessage.replace(" is taking too long.", " backup load is taking too long.");
        const cities = await withTimeout(
          api.loadIslandCities(islandId),
          Math.max(ONLINE_INITIAL_CITY_LIST_FALLBACK_TIMEOUT_MS, timeoutMs + 12000),
          fallbackMessage
        );
        if (!Array.isArray(cities)) throw new Error("City list did not load.");
        if (!settled) {
          settled = true;
          if (typeof handlers.onCities === "function") handlers.onCities(cities);
        }
        return unsubscribe;
      } catch (fallbackError) {
        if (typeof unsubscribe === "function") unsubscribe();
        throw fallbackError;
      }
    }
    if (typeof unsubscribe === "function") unsubscribe();
    throw error;
  }
}

async function setupOnlineWorld({ requireOnlineProfile = false } = {}) {
  const api = getOnlineApi();
  if (!state || !api?.isConfigured?.() || !api?.isSignedIn?.()) return false;

  if (onlineWorldConnected && isOnlineWorldActive()) return true;

  onlineLastError = "";
  updateOnlineUi();
  onlineStatusDetail.textContent = "Finding your home island...";
  let profile = null;
  let cloudSnapshot = null;
  const [profileResult, snapshotResult, statsResult] = await Promise.allSettled([
    api.loadPlayerProfile
      ? withTimeout(api.loadPlayerProfile(), 5000, "Player profile lookup is taking too long.")
      : Promise.resolve(null),
    api.loadGameSnapshot
      ? withTimeout(api.loadGameSnapshot(ONLINE_SAVE_SLOT), 5000, "Cloud player state lookup is taking too long.")
      : Promise.resolve(null),
    api.loadPlayerGlobalStats
      ? withTimeout(api.loadPlayerGlobalStats(), 5000, "Global stats lookup is taking too long.")
      : Promise.resolve(null),
  ]);
  const profileLoadFailed = profileResult.status === "rejected";
  if (profileResult.status === "fulfilled") profile = profileResult.value;
  else console.warn("Could not load online profile before island setup", profileResult.reason);
  if (snapshotResult.status === "fulfilled") cloudSnapshot = snapshotResult.value;
  else console.warn("Could not load cloud player state before island setup", snapshotResult.reason);
  if (profileLoadFailed && requireOnlineProfile) {
    console.warn("Continuing online setup without the player profile.");
  }
  profile = mergeOnlineProfileSources(profile, cloudSnapshot);

  const hasCurrentProfile = Boolean(profile);
  if (hasCurrentProfile) applyOnlineProfileSnapshot(profile, state.playerName);
  if (statsResult.status === "fulfilled" && statsResult.value) {
    applyGlobalStatsSnapshot(statsResult.value, { render: false });
  } else if (statsResult.status === "rejected") {
    console.warn("Could not load global kingdom stats before island setup", statsResult.reason);
  }
  if (hasCurrentProfile) await prepareOfflineProgressFromProfile(profile);
  let homeRegionId = await resolveHomeRegionIdForSetup(profile, { trustLocalState: hasCurrentProfile });
  let activeRegionId = homeRegionId;
  const mainIslandId = getOnlineIslandId(homeRegionId);
  const storedMainCityId = String(profile?.mainCityId
    || (hasCurrentProfile ? state.online?.mainCityId : "")
    || (hasCurrentProfile ? state.mainCityId : "")
    || "").trim();
  const mainCityId = getKnownCityId(storedMainCityId)
    || "";

  state.activeRegionId = activeRegionId;
  state.online = {
    worldId: ONLINE_WORLD_ID,
    islandId: getOnlineIslandId(activeRegionId),
    activeRegionId,
    mainIslandId,
    mainRegionId: homeRegionId,
    mainCityId,
    playerUid: getCurrentOnlineUid(),
  };
  state.mainCityId = mainCityId || "";
  normalizeSingleMainCityAssignment(state.mainCityId);
  let needsMainCityClaim = !storedMainCityId;

  const needsMainCityRepair = Number(profile?.mainCityAssignmentVersion || 0) < MAIN_CITY_ASSIGNMENT_VERSION;
  if (api.repairMainCityAssignment && needsMainCityRepair && (mainCityId || hasCurrentProfile)) {
    onlineStatusDetail.textContent = "Verifying your main city...";
    try {
      const repair = await withTimeout(
        api.repairMainCityAssignment({ mainCityId }),
        12000,
        "Main city repair is taking too long."
      );
      applyServerEconomyResult(repair);
      serverEconomyLastSyncAt = Date.now();
      const repairedMainCityId = getKnownCityId(repair?.currentUser?.mainCityId) || mainCityId;
      const repairedMainRegionId = normalizeRegionId(repair?.currentUser?.mainRegionId || homeRegionId);
      if (repairedMainCityId) {
        needsMainCityClaim = false;
        homeRegionId = repairedMainRegionId;
        activeRegionId = repairedMainRegionId;
        state.activeRegionId = activeRegionId;
        state.mainCityId = repairedMainCityId;
        state.online.islandId = getOnlineIslandId(activeRegionId);
        state.online.activeRegionId = activeRegionId;
        state.online.mainCityId = repairedMainCityId;
        state.online.mainRegionId = repairedMainRegionId;
        state.online.mainIslandId = repair?.currentUser?.mainIslandId || getOnlineIslandId(repairedMainRegionId);
        normalizeSingleMainCityAssignment(repairedMainCityId, { markDirty: false });
      }
    } catch (error) {
      console.warn("Could not verify main city during online setup", error);
    }
  }

  return connectOnlineIsland(activeRegionId, {
    claimHome: activeRegionId === homeRegionId && needsMainCityClaim,
    homeRegionId,
    profile,
  });
}

function startOnlineSetupInBackground() {
  const api = getOnlineApi();
  if (!state || !api?.isConfigured?.() || !api?.isSignedIn?.()) return;
  if (onlineSetupBackgroundInFlight || onlineWorldConnected) return;

  onlineSetupBackgroundInFlight = true;
  onlineLastError = "";
  updateOnlineUi();
  if (onlineStatusDetail) onlineStatusDetail.textContent = "Kingdom loaded. Connecting online in the background...";
  showToast("Kingdom loaded. Connecting online...");

  setupOnlineWorld()
    .then(async connected => {
      if (!state) return;
      if (!connected) {
        state.online = null;
        onlineWorldConnected = false;
        onlineCitiesLoaded = false;
        updateOnlineUi();
        showToast("Playing locally. Online setup will retry next time.");
        return;
      }

      rememberOwnedAttackSource(state.mainCityId || playerCities()[0]?.id);
      saveGame();
      await flushOnlineSave(true);
      renderAll();
      requestAnimationFrame(() => centerOnCity(selectedSourceId || state.mainCityId || playerCities()[0]?.id));
      showToast("Online world connected.");
    })
    .catch(error => {
      onlineLastError = error?.message || String(error);
      state.online = null;
      onlineWorldConnected = false;
      onlineCitiesLoaded = false;
      updateOnlineUi();
      showToast("Playing locally. Online setup is still having trouble.");
      console.warn("Background online setup failed", error);
    })
    .finally(() => {
      onlineSetupBackgroundInFlight = false;
    });
}

async function connectOnlineIsland(regionId, { claimHome = false, homeRegionId = null, profile = null, activateOnFirstSnapshot = false } = {}) {
  const api = getOnlineApi();
  if (!state || !api?.isConfigured?.() || !api?.isSignedIn?.()) return false;
  if (onlineWorldLoading) return false;

  onlineLastError = "";
  updateOnlineUi();
  const targetRegionId = normalizeRegionId(regionId);
  const islandId = getOnlineIslandId(targetRegionId);
  const homeRegion = normalizeRegionId(homeRegionId || state.online?.mainRegionId || targetRegionId);
  const mainIslandId = getOnlineIslandId(homeRegion);

  onlineWorldLoading = true;
  onlineCitiesLoaded = false;
  onlineWorldConnected = false;
  const nextOnlineState = {
    ...(state.online || {}),
    worldId: ONLINE_WORLD_ID,
    islandId,
    activeRegionId: targetRegionId,
    mainIslandId,
    mainRegionId: homeRegion,
    mainCityId: getKnownCityId(state.online?.mainCityId)
      || getKnownCityId(profile?.mainCityId)
      || getKnownCityId(state.mainCityId)
      || "",
    playerUid: getCurrentOnlineUid(),
  };
  if (!activateOnFirstSnapshot) {
    onlineActiveRegionId = targetRegionId;
    state.activeRegionId = targetRegionId;
  }
  state.online = activateOnFirstSnapshot
    ? {
        ...(state.online || {}),
        worldId: ONLINE_WORLD_ID,
        islandId: state.online?.islandId || getOnlineIslandId(getActiveOnlineRegionId()),
        activeRegionId: state.online?.activeRegionId || getActiveOnlineRegionId(),
        mainIslandId,
        mainRegionId: homeRegion,
        mainCityId: nextOnlineState.mainCityId,
        playerUid: getCurrentOnlineUid(),
        pendingIslandId: islandId,
        pendingRegionId: targetRegionId,
      }
    : nextOnlineState;

  onlineStatusDetail.textContent = `Loading ${getRegionLabel(targetRegionId)}...`;
  try {
    const mapArtReadyPromise = preloadIslandMap(targetRegionId, { fetchPriority: "high" });
    const seed = createOnlineIslandSeed(targetRegionId);
    onlineStatusDetail.textContent = `Preparing ${getRegionLabel(targetRegionId)} (${seed.cities.length} city slots)...`;
    const islandSetupPromise = api.ensureMainIsland && !verifiedOnlineIslandSeeds.has(targetRegionId)
      ? withTimeout(api.ensureMainIsland({
        islandId,
        regionId: targetRegionId,
      }), claimHome ? 20000 : 10000, `${getRegionLabel(targetRegionId)} setup is taking too long.`)
        .then(result => {
          verifiedOnlineIslandSeeds.add(targetRegionId);
          return result;
        })
      : Promise.resolve(true);

    const [, mapArtReady] = await Promise.all([islandSetupPromise, mapArtReadyPromise]);
    if (!mapArtReady) {
      console.warn(`Map art preload did not finish for ${targetRegionId}; rendering will retry it.`);
    }

    if (claimHome) {
      onlineStatusDetail.textContent = "Claiming your starting city...";
      const isNewHomeClaim = !getKnownCityId(nextOnlineState.mainCityId);
      const claim = await withTimeout(api.claimStartingCity({
        islandId,
        candidateCityIds: seed.claimCandidateIds,
        playerName: state.playerName,
        flag: state.flag,
        worldId: ONLINE_WORLD_ID,
        mainRegionId: targetRegionId,
        minimumNeutralCities: isNewHomeClaim ? MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES : 0,
      }), isNewHomeClaim ? 45000 : 20000, "Starting city claim is taking too long.");

      if (!claim?.cityId) throw new Error("No starting city was claimed.");
      const redirectedRegionId = claim?.redirected && claim?.islandId
        ? getRegionIdFromOnlineIslandId(claim.islandId)
        : "";
      if (redirectedRegionId && redirectedRegionId !== targetRegionId) {
        onlineStatusDetail.textContent = `Opening your ${getRegionLabel(redirectedRegionId)} main island...`;
        state.online.mainIslandId = claim.islandId;
        state.online.mainRegionId = redirectedRegionId;
        state.online.mainCityId = claim.cityId;
        state.mainCityId = claim.cityId;
        onlineWorldLoading = false;
        return connectOnlineIsland(redirectedRegionId, {
          claimHome: true,
          homeRegionId: redirectedRegionId,
          profile: {
            ...(profile || {}),
            mainIslandId: claim.islandId,
            mainRegionId: redirectedRegionId,
            mainCityId: claim.cityId,
          },
        });
      }
      state.online.mainIslandId = islandId;
      state.online.mainRegionId = targetRegionId;
      state.online.mainCityId = claim?.cityId || state.online.mainCityId || state.mainCityId;
      if (claim?.cityId) state.mainCityId = claim.cityId;
      onlineFreshClaimCityId = !claim?.alreadyClaimed && claim?.cityId ? claim.cityId : "";
      const claimedCity = claim?.cityId ? cityById(claim.cityId) : null;
      if (claimedCity) claimedCity.isMainCity = true;
      normalizeSingleMainCityAssignment(claim?.cityId || state.mainCityId, { markDirty: true });
      if (Math.max(0, Number(claim?.repairedMainCities) || 0) > 0) addLog(`${cityById(claim.cityId)?.name || "Your main city"} was restored. Main cities cannot be attacked.`);
      else if (claim?.alreadyClaimed) addLog(`Online ${getRegionLabel(targetRegionId)} connected. Your claimed city was restored.`);
      else if (claim?.cityId) addLog(`Online ${getRegionLabel(targetRegionId)} connected. ${cityById(claim.cityId)?.name || "A city"} joined your kingdom.`);
    }

    if (onlineIslandUnsubscribe) onlineIslandUnsubscribe();
    onlineIslandUnsubscribe = null;
    clearOnlineIslandArmySnapshots();
    onlinePresence = [];
    state.attacks = state.attacks.filter(attack => String(attack?.fromId || "") && String(attack?.toId || ""));

    const applyOnlineCityPayload = (onlineCities, { render = true } = {}) => {
      const firstCitiesSnapshot = !onlineCitiesLoaded;
      if (activateOnFirstSnapshot && firstCitiesSnapshot) {
        onlineActiveRegionId = targetRegionId;
        state.activeRegionId = targetRegionId;
        state.online = { ...(state.online || {}), ...nextOnlineState };
        delete state.online.pendingIslandId;
        delete state.online.pendingRegionId;
      }
      applyOnlineCities(onlineCities, targetRegionId);
      onlineCitiesLoaded = true;
      if (firstCitiesSnapshot && getActivePeaceShieldExpiresAtMs()) refreshOwnedCityItemEffectMetadata(true);
      const economyIsStale = !serverEconomyLastSyncAt
        || Date.now() - serverEconomyLastSyncAt >= SERVER_ECONOMY_SYNC_SECONDS * 1000;
      if (firstCitiesSnapshot && usesServerEconomyAuthority() && economyIsStale) {
        serverEconomySyncTimer = 0;
        refreshServerEconomy(true, { showOfflineRewards: true });
      } else if (pendingOfflineProgressSeconds > 0) {
        applyPendingOfflineProgress();
      }
      if (state?.mainCityId && getCityRegionId(state.mainCityId) === targetRegionId && cityById(state.mainCityId)?.owner !== "player") {
        const nextOwned = playerCities()[0];
        state.mainCityId = nextOwned?.id || state.mainCityId;
      }
      if (firstCitiesSnapshot) {
        onlineCitySyncTimer = 0;
        onlinePresenceTimer = 0;
      }
      if (render) {
        if (firstCitiesSnapshot) {
          renderAll();
        } else {
          renderHud();
          renderCities();
          renderPanel();
        }
      }
      onlineFreshClaimCityId = "";
    };

    onlineStatusDetail.textContent = `Opening ${getRegionLabel(targetRegionId)}...`;
    onlineIslandUnsubscribe = await subscribeOnlineIslandWithInitialCities(api, islandId, {
      onCities: onlineCities => {
        applyOnlineCityPayload(onlineCities);
      },
      onCamps: camps => {
        applyOnlineCamps(camps, targetRegionId);
      },
      onArmies: armies => {
        applyOnlineArmies(armies, islandId);
        renderArmies();
        updateIncomingAttackUi();
        updateOutgoingAttackUi();
      },
      onPresence: presence => {
        applyOnlinePresence(presence);
      },
      onError: (error, source) => {
        handleOnlineSnapshotError(error, null);
      },
    }, ONLINE_INITIAL_CITY_LIST_TIMEOUT_MS, `${getRegionLabel(targetRegionId)} city list is taking too long.`);

    onlineWorldConnected = true;
    onlineLastError = "";
    subscribeOnlineArmyWatchers(islandId);
    subscribeOnlineHeldCamps();
    subscribeOnlineServerReports();
    subscribeOnlineGlobalStats();
    subscribeOnlineCrownCitadel();
    await recoverPendingOnlineArmyMovements();
    await publishOnlinePresence(true);
    queueOnlineIdentityRepair();
    updateOnlinePlayersUi();
    updateIslandSwitcherUi();
    const activeCount = Math.max(1, getActiveOnlinePlayers().length);
    onlineStatusDetail.textContent = `${getRegionLabel(targetRegionId)} connected. ${formatNumber(activeCount)} ruler${activeCount === 1 ? "" : "s"} online here.`;
    showToast(`${getRegionLabel(targetRegionId)} connected.`);
    saveGame();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    if (state?.online?.pendingIslandId === islandId) {
      delete state.online.pendingIslandId;
      delete state.online.pendingRegionId;
    }
    if (!activateOnFirstSnapshot && state?.online?.islandId === islandId) state.online = null;
    disconnectOnlineWorld();
    updateOnlineUi();
    showToast(`Could not connect ${getRegionLabel(targetRegionId)}.`);
    console.warn("Online island setup failed", error);
    return false;
  } finally {
    onlineWorldLoading = false;
  }
}

function applyOnlineCities(onlineCities, regionId = getActiveOnlineRegionId()) {
  if (!state || !Array.isArray(onlineCities)) return;
  const byId = new Map(onlineCities.map(city => [city.id, city]));
  const currentUid = getCurrentOnlineUid();
  const localById = new Map(state.cities.map(city => [city.id, city]));
  const activeRegionId = normalizeRegionId(regionId);
  const inactiveCities = state.cities.filter(city => getCityRegionId(city) !== activeRegionId);
  const previousKingPowerOverride = currentPlayerIdentityKingPowerOverride;
  const currentPlayerKingPower = getKingPower();
  queuePlayerIdentityLookupForRecords(onlineCities);

  currentPlayerIdentityKingPowerOverride = currentPlayerKingPower;
  try {
    const activeCities = getPlayableBaseCitiesByRegion(activeRegionId).map(base => {
    const current = localById.get(base.id) || {};
    const online = byId.get(base.id) || {};
    const onlineOwnership = getCityRecordOwnership(online, currentUid);
    const ownerUid = onlineOwnership.ownerUid;
    const ownerName = onlineOwnership.ownerName;
    const ownerFlag = onlineOwnership.ownerFlag;
    const ownerKingPower = onlineOwnership.ownerKingPower;
    const ownerShieldExpiresAtMs = onlineOwnership.ownerShieldExpiresAtMs;
    const localOwner = onlineOwnership.owner;
    const normalizedOwnerKind = onlineOwnership.ownerKind;
    const currentIsLocalPlayerCity = current.owner === "player" && (!current.ownerUid || current.ownerUid === currentUid);
    const onlineBelongsToAnotherPlayer = normalizedOwnerKind === "player" && ownerUid && ownerUid !== currentUid;
    const onlineBelongsToCurrentPlayer = normalizedOwnerKind === "player" && ownerUid === currentUid;
    const isFreshClaimCity = onlineFreshClaimCityId === base.id;
    const keepLocalPlayerCity = currentIsLocalPlayerCity
      && !onlineBelongsToAnotherPlayer
      && !isFreshClaimCity
      && (onlineBelongsToCurrentPlayer || localDirtyCityIds.has(base.id));
    const troopFallback = getCityTroopFallback(base, keepLocalPlayerCity
      ? { owner: "player", ownerKind: "player", ownerUid: currentUid || current.ownerUid || ownerUid || null }
      : onlineOwnership);

    return {
      ...base,
      name: getCanonicalCityName(base, keepLocalPlayerCity ? current : online),
      owner: keepLocalPlayerCity ? "player" : OWNER[localOwner] ? localOwner : "neutral",
      ownerKind: keepLocalPlayerCity ? "player" : normalizedOwnerKind,
      ownerUid: keepLocalPlayerCity ? currentUid || current.ownerUid || ownerUid || null : ownerUid,
      ownerName: keepLocalPlayerCity ? state.playerName : ownerName,
      ownerFlag: keepLocalPlayerCity ? state.flag : ownerFlag,
      ownerKingPower: keepLocalPlayerCity ? currentPlayerKingPower : ownerKingPower,
      ownerShieldExpiresAtMs: isStronghold(base) ? 0 : (keepLocalPlayerCity || localOwner === "player") ? getActivePeaceShieldExpiresAtMs() : ownerShieldExpiresAtMs,
      level: isStronghold(base) ? getStrongholdDefenseLevel(base) : clampCityLevel(keepLocalPlayerCity ? current.level ?? online.level ?? base.level : online.level ?? current.level ?? base.level),
      troops: readCityTroops(keepLocalPlayerCity ? current.troops ?? online.troops : online.troops ?? current.troops, troopFallback),
      troopFloat: readCityTroopFloat(keepLocalPlayerCity ? current.troopFloat ?? current.troops ?? online.troopFloat ?? online.troops : online.troopFloat ?? current.troopFloat ?? online.troops ?? current.troops, troopFallback),
      defense: 1,
      investedGold: isStronghold(base) ? 0 : Math.max(0, Math.floor(Number(keepLocalPlayerCity ? current.investedGold ?? online.investedGold : online.investedGold ?? current.investedGold) || 0)),
      lastCapturedAt: keepLocalPlayerCity ? current.lastCapturedAt ?? online.lastCapturedAt ?? null : online.lastCapturedAt ?? current.lastCapturedAt ?? null,
      lastCapturedAtMs: normalizeTimestampMs(keepLocalPlayerCity
        ? current.lastCapturedAtMs ?? online.lastCapturedAtMs ?? current.lastCapturedAt ?? online.lastCapturedAt
        : online.lastCapturedAtMs ?? current.lastCapturedAtMs ?? online.lastCapturedAt ?? current.lastCapturedAt),
      isMainCity: !isStronghold(base) && (localOwner === "player" ? base.id === state.mainCityId : Boolean(online.isMainCity || current.isMainCity)),
      relinquishedAtMs: keepLocalPlayerCity || normalizedOwnerKind === "player" ? 0 : timestampToMs(online.relinquishedAtMs ?? current.relinquishedAtMs),
      relocatedAtMs: keepLocalPlayerCity || normalizedOwnerKind === "player" ? 0 : timestampToMs(online.relocatedAtMs ?? current.relocatedAtMs),
      startPool: base.startPool,
      regionId: base.regionId,
    };
    });
    state.cities = [...inactiveCities, ...activeCities];
  } finally {
    currentPlayerIdentityKingPowerOverride = previousKingPowerOverride;
  }
  state.activeRegionId = activeRegionId;
  if (state.online) {
    state.online.activeRegionId = activeRegionId;
    state.online.islandId = getOnlineIslandId(activeRegionId);
  }
  cacheIslandOccupancySummary(activeRegionId);
  canonicalizeVisiblePlayerIdentities();
  onlineOwnedCitiesCache = onlineOwnedCitiesCache.filter(city => getCityRegionId(city) !== activeRegionId);
  mergeOwnedCitySnapshots(playerCities()
    .filter(city => getCityRegionId(city) === activeRegionId)
    .map(city => ({
      ...city,
      islandId: getOnlineIslandId(activeRegionId),
    })));
  normalizeSingleMainCityAssignment(state.mainCityId);
  ensureLoadedMainCityForRegion(activeRegionId);
}

function normalizeOnlineCampState(raw = {}) {
  const id = String(raw.id || raw.campId || "").trim();
  if (!id) return null;
  const campType = String(raw.campType || "gold").toLowerCase();
  const base = WORLD_CAMPS.find(camp => camp.id === id) || {};
  const config = getRewardCampConfig({ ...base, ...raw, campType });
  if (!config) return null;
  return {
    ...raw,
    id,
    campId: id,
    regionId: normalizeRegionId(raw.regionId || raw.mapId || getRegionIdFromOnlineIslandId(raw.islandId)),
    kind: config.kind,
    campType: config.type,
    rewardType: config.rewardType,
    holdDurationMs: config.holdSeconds * 1000,
    holderUid: String(raw.holderUid || "").trim(),
    holderName: String(raw.holderName || "").slice(0, 40),
    holderFlag: raw.holderFlag || null,
    heldSinceMs: normalizeTimestampMs(raw.heldSinceMs),
    payoutAtMs: normalizeTimestampMs(raw.payoutAtMs),
    payoutPending: Boolean(raw.payoutPending),
    currentGarrison: Math.max(0, Math.floor(Number(raw.currentGarrison) || 0)),
    baseDefenders: Math.max(1, Math.floor(Number(raw.baseDefenders) || config.baseDefenders)),
    baseReward: Math.max(0, Math.floor(Number(raw.baseReward) || config.baseReward)),
    defenseLevel: Math.max(1, Math.floor(Number(raw.defenseLevel) || config.defenseLevel)),
    rewardSchedule: config.rewardSchedule,
    maxDailyRewards: config.maxDailyRewards,
    activeArmyIds: Array.isArray(raw.activeArmyIds) ? raw.activeArmyIds.map(String) : [],
    state: ["neutral", "held", "contested"].includes(raw.state) ? raw.state : raw.holderUid ? "held" : "neutral",
  };
}

function applyOnlineCamps(rawCamps, regionId = getActiveOnlineRegionId()) {
  const activeRegionId = normalizeRegionId(regionId);
  const normalizedCamps = (Array.isArray(rawCamps) ? rawCamps : [])
    .map(normalizeOnlineCampState)
    .filter(camp => camp && camp.regionId === activeRegionId);
  onlineCampStates = new Map(normalizedCamps.map(camp => [camp.id, camp]));
  const currentUid = getCurrentOnlineUid();
  onlineHeldCampStates = new Map([...onlineHeldCampStates]
    .filter(([, camp]) => camp.regionId !== activeRegionId));
  normalizedCamps.forEach(camp => {
    if (currentUid && camp.holderUid === currentUid) onlineHeldCampStates.set(camp.id, camp);
  });
  cityRenderSignature = "";
  renderCities(true);
  updateOutgoingAttackUi();
}

function applyOnlineHeldCamps(rawCamps = []) {
  const currentUid = getCurrentOnlineUid();
  onlineHeldCampStates = new Map((Array.isArray(rawCamps) ? rawCamps : [])
    .map(normalizeOnlineCampState)
    .filter(camp => camp && currentUid && camp.holderUid === currentUid)
    .map(camp => [camp.id, camp]));
  updateOutgoingAttackUi();
}

function getCampTargetById(campId) {
  const id = String(campId || "");
  const base = WORLD_CAMPS.find(camp => camp.id === id);
  if (!base) return null;
  const online = onlineCampStates.get(id) || onlineHeldCampStates.get(id) || {};
  const config = getRewardCampConfig({ ...base, ...online });
  if (!config) return null;
  const holderUid = String(online.holderUid || "").trim();
  const currentUid = getCurrentOnlineUid();
  const owner = holderUid ? (holderUid === currentUid ? "player" : "enemy") : "neutral";
  const onlineGarrison = Number(online.currentGarrison);
  const currentGarrison = Number.isFinite(onlineGarrison)
    ? Math.max(0, Math.floor(onlineGarrison))
    : Math.max(1, Math.floor(Number(online.baseDefenders) || config.baseDefenders));
  return {
    ...base,
    ...online,
    id,
    campId: id,
    name: config.name,
    kind: config.kind,
    targetType: "camp",
    campType: config.type,
    rewardType: config.rewardType,
    holdDurationMs: config.holdSeconds * 1000,
    rewardSchedule: config.rewardSchedule,
    maxDailyRewards: config.maxDailyRewards,
    owner,
    ownerKind: holderUid ? "player" : "neutral",
    ownerUid: holderUid || null,
    ownerName: online.holderName || (holderUid ? "Rival ruler" : "Neutral defenders"),
    ownerFlag: online.holderFlag || null,
    level: Math.max(1, Math.floor(Number(online.defenseLevel) || config.defenseLevel)),
    defenseLevel: Math.max(1, Math.floor(Number(online.defenseLevel) || config.defenseLevel)),
    troops: currentGarrison,
    troopFloat: currentGarrison,
    currentGarrison,
    baseDefenders: Math.max(1, Math.floor(Number(online.baseDefenders) || config.baseDefenders)),
    baseReward: Math.max(0, Math.floor(Number(online.baseReward) || config.baseReward)),
    payoutAtMs: normalizeTimestampMs(online.payoutAtMs),
    heldSinceMs: normalizeTimestampMs(online.heldSinceMs),
    payoutPending: Boolean(online.payoutPending),
    state: online.state || (holderUid ? "held" : "neutral"),
    isMainCity: false,
    ownerShieldExpiresAtMs: 0,
  };
}

function getArmyTargetById(targetId) {
  return cityById(targetId) || getCampTargetById(targetId);
}

function isRewardCampTarget(target) {
  return Boolean(target && getRewardCampConfig(target));
}

function adoptServerArmyMovement(rawMovement) {
  const movement = normalizeOnlineArmyMovement(rawMovement);
  if (!movement) return null;
  const current = onlineArmiesByIsland.get(PLAYER_RELEVANT_ARMIES_CACHE_KEY) || [];
  onlineArmiesByIsland.set(PLAYER_RELEVANT_ARMIES_CACHE_KEY, [
    ...current.filter(army => getOnlineArmyResolutionId(army) !== movement.id),
    movement,
  ]);
  rebuildOnlineArmies();
  adoptOwnOnlineArmies();
  renderPaths();
  renderArmies(true);
  updateOutgoingAttackUi();
  return movement;
}

async function requestDueRewardCampPayout(camp) {
  if (!camp?.id || camp.owner !== "player" || !camp.payoutPending || camp.payoutAtMs > Date.now()) return false;
  if (resolvingRewardCampPayoutIds.has(camp.id)) return false;
  const api = getOnlineApi();
  const resolvePayout = api?.resolveRewardCampPayout || api?.resolveGoldCampPayout;
  if (!resolvePayout) return false;
  resolvingRewardCampPayoutIds.add(camp.id);
  try {
    const result = await resolvePayout({ campId: camp.id, regionId: camp.regionId });
    applyServerArmyResult(result);
    if (result?.movement) adoptServerArmyMovement(result.movement);
    const config = getRewardCampConfig(result?.campType || camp);
    if (["paid", "no-eligible-city", "daily-limit"].includes(result?.status)) {
      if (config?.type === "deed") {
        deedCampHistoryCache.delete(getDeedCampHistoryCacheKey(camp));
      } else if (config && result.holderUid === getCurrentOnlineUid()) {
         const progress = cacheRewardCampProgress(config, {
           date: currentUtcDateKey(),
           count: result.dailyClaim,
           lastReward: result.reward,
           lastCampId: camp.id,
           lastClaimedAtMs: Date.now(),
           rewards: result.rewardsToday,
           maxDailyRewards: result.maxDailyRewards,
         });
        renderRewardCampProgressPanel(camp.id, config, progress);
      }
      const rewardMessage = config?.type === "deed"
        ? result.status === "daily-limit"
          ? "You already received a Deed Camp city today. The camp reset to neutral."
          : result.awardedCity
          ? `${config.name} reward: ${result.awardedCity.name} in ${result.awardedCity.regionName} is now yours.`
          : "No eligible neutral city was available. The Deed Camp reset to neutral."
        : config?.type === "items"
          ? result.status === "daily-limit"
            ? "Daily Relic Camp reward limit reached. The camp reset to neutral."
            : result.rewardItem
              ? `Relic Camp reward: ${result.rewardItem.itemName} (${result.rewardItem.rarity}) was added to your bag.`
              : "Relic Camp completed without an item reward."
        : result.reward > 0
          ? `${config?.name || camp.name} reward: +${formatNumber(result.reward)} ${result.rewardType || config?.rewardLabel || "reward"}`
          : `${config?.name || camp.name} daily reward limit reached.`;
      const returnMessage = result.returningTroops > 0
        ? ` ${formatNumber(result.returningTroops)} stationed troops are marching home.`
        : "";
      showToast(`${rewardMessage}${returnMessage}`);
    }
    return ["paid", "no-eligible-city", "daily-limit"].includes(result?.status);
  } catch (error) {
    console.warn("Could not resolve reward camp payout", error);
    return false;
  } finally {
    resolvingRewardCampPayoutIds.delete(camp.id);
  }
}

function ensureLoadedMainCityForRegion(regionId) {
  if (!state) return;
  const activeRegionId = normalizeRegionId(regionId);
  const homeRegionId = normalizeRegionId(state.online?.mainRegionId || (state.mainCityId ? getCityRegionId(state.mainCityId) : activeRegionId));
  if (activeRegionId !== homeRegionId) return;

  const currentMain = state.mainCityId ? cityById(state.mainCityId) : null;
  if (currentMain && !isStronghold(currentMain)) {
    restoreMainCityOwnership(currentMain);
    currentMain.isMainCity = true;
    if (state.online) {
      state.online.mainCityId = currentMain.id;
      state.online.mainRegionId = activeRegionId;
      state.online.mainIslandId = getOnlineIslandId(activeRegionId);
    }
    normalizeSingleMainCityAssignment(currentMain.id);
    return;
  }

  const fallbackMain = playerCities().find(city => city.isMainCity && !isStronghold(city))
    || playerCities().find(city => !isStronghold(city));
  if (!fallbackMain) return;
  state.mainCityId = fallbackMain.id;
  fallbackMain.isMainCity = true;
  if (state.online) {
    state.online.mainCityId = fallbackMain.id;
    state.online.mainRegionId = activeRegionId;
    state.online.mainIslandId = getOnlineIslandId(activeRegionId);
  }
  normalizeSingleMainCityAssignment(fallbackMain.id);
}

function restoreMainCityOwnership(city) {
  if (!state || !city || isStronghold(city)) return false;
  const uid = getCurrentOnlineUid();
  const foreignOwner = city.owner !== "player" || (uid && city.ownerUid && city.ownerUid !== uid);
  const needsRestore = foreignOwner || city.ownerKind !== "player" || city.ownerUid !== (uid || city.ownerUid || null);
  city.owner = "player";
  city.ownerKind = "player";
  city.ownerUid = uid || city.ownerUid || null;
  city.ownerName = state.playerName;
  city.ownerFlag = state.flag;
  city.ownerKingPower = getKingPower();
  city.ownerShieldExpiresAtMs = getActivePeaceShieldExpiresAtMs();
  city.isMainCity = true;
  if (foreignOwner) {
    city.troopFloat = 0;
    city.troops = 0;
  }
  if (needsRestore && isOnlineWorldActive()) {
    markOwnedCityChanged(city, false);
    syncCityStateToOnline(city);
    syncOwnedCitiesToOnline(true);
  }
  return needsRestore;
}

function getCityRecordOwnership(record = {}, currentUid = getCurrentOnlineUid(), { allowLocalPlayerFallback = false } = {}) {
  const rawOwnerKind = record.ownerKind || (record.owner === "player" || record.owner === "enemy" ? "player" : record.owner || "neutral");
  const ownerUid = String(record.ownerUid || "").trim();
  const hasPlayerOwner = Boolean(ownerUid) && (rawOwnerKind === "player" || record.owner === "player" || record.owner === "enemy");
  if (hasPlayerOwner) {
    const identity = resolvePlayerIdentityForUid(ownerUid, record);
    return {
      owner: ownerUid === currentUid ? "player" : "enemy",
      ownerKind: "player",
      ownerUid,
      ownerName: identity.displayName || record.ownerName || "",
      ownerFlag: identity.flag || record.ownerFlag || null,
      ownerKingPower: normalizePowerValue(identity.kingPower) || normalizePowerValue(record.ownerKingPower),
      ownerShieldExpiresAtMs: normalizeTimestampMs(record.ownerShieldExpiresAtMs),
      hasPlayerOwner: true,
    };
  }

  if (allowLocalPlayerFallback && record.owner === "player" && (!record.ownerUid || record.ownerUid === currentUid)) {
    const fallbackUid = currentUid || record.ownerUid || null;
    const identity = resolvePlayerIdentityForUid(fallbackUid, record);
    return {
      owner: "player",
      ownerKind: "player",
      ownerUid: fallbackUid,
      ownerName: identity.displayName || record.ownerName || state?.playerName || "",
      ownerFlag: identity.flag || record.ownerFlag || state?.flag || null,
      ownerKingPower: normalizePowerValue(identity.kingPower) || normalizePowerValue(record.ownerKingPower) || getKingPower(),
      ownerShieldExpiresAtMs: getActivePeaceShieldExpiresAtMs(),
      hasPlayerOwner: Boolean(fallbackUid),
    };
  }

  return {
    owner: "neutral",
    ownerKind: "neutral",
    ownerUid: null,
    ownerName: "",
    ownerFlag: null,
    ownerKingPower: 0,
    ownerShieldExpiresAtMs: 0,
    hasPlayerOwner: false,
  };
}

function markOwnedCityChanged(city, syncNow = true) {
  if (!state || !city || city.owner !== "player") return;
  localDirtyCityIds.add(city.id);
  city.ownerKind = "player";
  city.ownerUid = getCurrentOnlineUid() || city.ownerUid || null;
  city.ownerName = state.playerName;
  city.ownerFlag = state.flag;
  city.ownerKingPower = getKingPower();
  city.ownerShieldExpiresAtMs = isStronghold(city) ? 0 : getActivePeaceShieldExpiresAtMs();
  city.isMainCity = !isStronghold(city) && city.id === state.mainCityId;
  city.relinquishedAtMs = 0;
  city.relocatedAtMs = 0;
  if (syncNow && isOnlineWorldActive()) syncOwnedCitiesToOnline(true);
}

function toOnlineOwnedCity(city) {
  return {
    id: city.id,
    name: getCanonicalCityName(city),
    x: city.x,
    y: city.y,
    startPool: city.startPool || "",
    regionId: city.regionId || city.startPool || getCityRegionId(city),
    kind: city.kind || "",
    strongholdType: city.strongholdType || "",
    bonus: city.bonus || "",
    bonusPercent: Number(city.bonusPercent) || 0,
    size: isStronghold(city) ? getStrongholdVisualSize(city) : undefined,
    artSrc: isStronghold(city) ? getStrongholdArtSrc(city) : "",
    startTroops: isStronghold(city) ? getStrongholdStartTroops(city) : 0,
    ownerKind: "player",
    ownerUid: getCurrentOnlineUid(),
    ownerName: state.playerName,
    ownerFlag: state.flag,
    ownerKingPower: getKingPower(),
    ownerShieldExpiresAtMs: isStronghold(city) ? 0 : getActivePeaceShieldExpiresAtMs(),
    level: isStronghold(city) ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level),
    troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
    troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
    defense: 1,
    investedGold: isStronghold(city) ? 0 : Math.max(0, Math.floor(Number(city.investedGold) || 0)),
    lastCapturedAt: city.lastCapturedAt ?? null,
    isMainCity: !isStronghold(city) && (city.owner === "player" ? city.id === state.mainCityId : Boolean(city.isMainCity)),
    relinquishedAtMs: 0,
    relocatedAtMs: 0,
  };
}

function toOnlineCityState(city) {
  const currentUid = getCurrentOnlineUid();
  const ownerUid = city.owner === "player"
    ? currentUid || city.ownerUid || null
    : city.ownerUid || null;
  const hasPlayerOwner = Boolean(ownerUid) && (city.owner === "player" || city.owner === "enemy" || city.ownerKind === "player");
  const ownerKind = hasPlayerOwner ? "player" : "neutral";
  const ownerIdentity = hasPlayerOwner ? resolvePlayerIdentityForUid(ownerUid, city) : null;
  const ownerName = hasPlayerOwner
    ? city.owner === "player" ? state.playerName : ownerIdentity?.displayName || city.ownerName || ""
    : "";
  const ownerFlag = hasPlayerOwner
    ? city.owner === "player" ? state.flag : ownerIdentity?.flag || city.ownerFlag || null
    : null;
  const ownerKingPower = hasPlayerOwner
    ? city.owner === "player" ? getKingPower() : normalizePowerValue(ownerIdentity?.kingPower) || normalizePowerValue(city.ownerKingPower)
    : 0;
  const ownerShieldExpiresAtMs = hasPlayerOwner
    ? isStronghold(city) ? 0 : city.owner === "player" ? getActivePeaceShieldExpiresAtMs() : normalizeTimestampMs(city.ownerShieldExpiresAtMs)
    : 0;
  const relinquishedAtMs = hasPlayerOwner || isStronghold(city) ? 0 : timestampToMs(city.relinquishedAtMs);
  const relocatedAtMs = hasPlayerOwner || isStronghold(city) ? 0 : timestampToMs(city.relocatedAtMs);
  return {
    id: city.id,
    name: getCanonicalCityName(city),
    x: city.x,
    y: city.y,
    startPool: city.startPool || "",
    regionId: city.regionId || city.startPool || getCityRegionId(city),
    kind: city.kind || "",
    strongholdType: city.strongholdType || "",
    bonus: city.bonus || "",
    bonusPercent: Number(city.bonusPercent) || 0,
    size: isStronghold(city) ? getStrongholdVisualSize(city) : undefined,
    artSrc: isStronghold(city) ? getStrongholdArtSrc(city) : "",
    startTroops: isStronghold(city) ? getStrongholdStartTroops(city) : 0,
    ownerKind,
    ownerUid: hasPlayerOwner ? ownerUid : null,
    ownerName,
    ownerFlag,
    ownerKingPower,
    ownerShieldExpiresAtMs,
    level: isStronghold(city) ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level),
    troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
    troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
    defense: 1,
    investedGold: isStronghold(city) ? 0 : Math.max(0, Math.floor(Number(city.investedGold) || 0)),
    lastCapturedAt: city.lastCapturedAt ?? null,
    isMainCity: !isStronghold(city) && (city.owner === "player" ? city.id === state.mainCityId : Boolean(city.isMainCity)),
    relinquishedAtMs,
    relocatedAtMs,
  };
}

function syncSharedCityState(city) {
  if (!city || !isOnlineWorldActive()) return;
  if (usesServerEconomyAuthority() && (city.owner === "player" || city.ownerUid === getCurrentOnlineUid())) return;
  const api = getOnlineApi();
  if (!api?.saveCityState) return;
  const cityId = city.id;
  const ownedAtSave = city.owner === "player";
  const savePromise = api.saveCityState(getOnlineIslandId(getCityRegionId(city)), toOnlineCityState(city))
    .then(() => {
      if (ownedAtSave) localDirtyCityIds.delete(cityId);
    })
    .catch(error => {
      onlineLastError = error?.message || String(error);
      console.warn("Could not sync city battle state", error);
    })
    .finally(() => {
      onlineCityStateSavePromises.delete(savePromise);
    });
  onlineCityStateSavePromises.add(savePromise);
  return savePromise;
}

function syncCityStateToOnline(city) {
  if (!city || !isOnlineWorldActive()) return;
  syncSharedCityState(city);
}

async function syncOwnedCitiesToOnline(force = false) {
  if (!isOnlineWorldActive()) return false;
  if (usesServerEconomyAuthority()) return false;
  if (!onlineCitiesLoaded) {
    if (force) onlineCitySyncQueued = true;
    return false;
  }
  if (onlineCitySyncInFlight) {
    if (force) onlineCitySyncQueued = true;
    return false;
  }
  const api = getOnlineApi();
  if (!api?.savePlayerCities) return false;
  const currentUid = getCurrentOnlineUid();
  const activeRegionId = getActiveOnlineRegionId();
  const dirtyCityIds = new Set(localDirtyCityIds);
  if (!dirtyCityIds.size) return false;
  const cities = playerCities()
    .filter(city => !city.ownerUid || city.ownerUid === currentUid)
    .filter(city => getCityRegionId(city) === activeRegionId)
    .filter(city => dirtyCityIds.has(city.id))
    .map(toOnlineOwnedCity);
  if (!cities.length) return false;

  onlineCitySyncInFlight = true;
  try {
    await api.savePlayerCities(getActiveOnlineIslandId(), cities);
    cities.forEach(city => localDirtyCityIds.delete(city.id));
    mergeOwnedCitySnapshots(cities.map(city => ({
      ...city,
      islandId: getActiveOnlineIslandId(),
    })), { complete: false });
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    console.warn("Could not sync owned cities", error);
    return false;
  } finally {
    onlineCitySyncInFlight = false;
    if (onlineCitySyncQueued) {
      onlineCitySyncQueued = false;
      syncOwnedCitiesToOnline(true);
    }
  }
}

function normalizeArmyPath(points) {
  if (!Array.isArray(points)) return [];
  const cached = normalizedArmyPathCache.get(points);
  if (cached) return cached;
  const normalized = points
    .map(point => ({
      x: Number(point?.x),
      y: Number(point?.y),
    }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  normalizedArmyPathCache.set(points, normalized);
  normalizedArmyPathCache.set(normalized, normalized);
  return normalized;
}

function normalizeArmyPathSegments(segments) {
  if (!Array.isArray(segments)) return [];
  const cached = normalizedArmyPathSegmentsCache.get(segments);
  if (cached) return cached;
  const normalized = segments
    .map(segment => {
      const points = normalizeArmyPath(segment?.points);
      if (points.length < 2) return null;
      return {
        regionId: normalizeRegionId(segment.regionId),
        points,
        length: Math.max(0, Number(segment.length) || routeLength(points)),
      };
    })
    .filter(Boolean);
  normalizedArmyPathSegmentsCache.set(segments, normalized);
  normalizedArmyPathSegmentsCache.set(normalized, normalized);
  return normalized;
}

function getRouteSegments(route, fallbackRegionId = "") {
  const segments = normalizeArmyPathSegments(route?.segments);
  if (segments.length) return segments;
  const points = normalizeArmyPath(route?.points);
  if (points.length < 2) return [];
  return [{
    regionId: normalizeRegionId(fallbackRegionId || getActiveMapRegionId()),
    points,
    length: Math.max(0, Number(route?.length) || routeLength(points)),
  }];
}

function getMissionRouteSegments(mission) {
  const segments = normalizeArmyPathSegments(mission?.pathSegments);
  if (segments.length) return segments;
  const from = cityById(mission?.fromId);
  const to = getArmyTargetById(mission?.toId);
  const fromRegionId = from ? getCityRegionId(from) : (getKnownCityId(mission?.fromId) ? getCityRegionId(mission.fromId) : "");
  const toRegionId = to ? getCityRegionId(to) : mission?.targetRegionId ? normalizeRegionId(mission.targetRegionId) : "";
  const points = normalizeArmyPath(mission?.path);
  if (points.length >= 2 && fromRegionId === toRegionId) {
    return [{ regionId: fromRegionId, points, length: Math.max(0, Number(mission?.pathLength) || routeLength(points)) }];
  }
  return [];
}

function getMissionRegionIds(mission) {
  const ids = getMissionRouteSegments(mission).map(segment => segment.regionId);
  const fromRegionId = getKnownCityId(mission?.fromId) ? getCityRegionId(mission.fromId) : "";
  const target = getArmyTargetById(mission?.toId);
  const toRegionId = target ? getCityRegionId(target) : mission?.targetRegionId ? normalizeRegionId(mission.targetRegionId) : "";
  if (fromRegionId) ids.push(fromRegionId);
  if (toRegionId) ids.push(toRegionId);
  return [...new Set(ids.map(normalizeRegionId).filter(Boolean))];
}

function createOnlineArmyId(kind = "army") {
  const uidPart = String(getCurrentOnlineUid() || "player").replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "player";
  const kindPart = String(kind || "army").replace(/[^a-z0-9_-]/gi, "").slice(0, 16) || "army";
  return `${uidPart}_${kindPart}_${Date.now().toString(36)}_${attackIdCounter}`;
}

function prepareOnlineArmyMission(mission) {
  if (!mission || !isOnlineWorldActive() || mission.owner !== "player") return mission;
  const nowMs = Date.now();
  const source = cityById(mission.fromId);
  const target = getArmyTargetById(mission.toId);
  mission.onlineId = mission.onlineId || createOnlineArmyId(mission.kind);
  mission.ownerKind = "player";
  mission.ownerUid = getCurrentOnlineUid();
  mission.ownerName = state.playerName;
  mission.ownerFlag = state.flag;
  mission.ownerKingPower = getKingPower();
  mission.attackerKingPower = normalizePowerValue(mission.attackerKingPower) || mission.ownerKingPower;
  mission.defenderKingPower = normalizePowerValue(mission.defenderKingPower);
  mission.demoAttack = normalizeDemoAttackSnapshot(mission.demoAttack);
  mission.launchedAtMs = mission.launchedAtMs || nowMs;
  mission.arrivesAtMs = mission.arrivesAtMs || nowMs + Math.max(0, Number(mission.total) || 0) * 1000;
  mission.fromName = mission.fromName || source?.name || "";
  mission.toName = mission.toName || target?.name || "";
  mission.sourceRegionId = normalizeRegionId(mission.sourceRegionId || getCityRegionId(source || mission.fromId));
  mission.targetRegionId = normalizeRegionId(mission.targetRegionId || getCityRegionId(target || mission.toId));
  return mission;
}

function toOnlineArmyMovement(mission) {
  const onlineId = mission?.onlineId || "";
  if (!mission || !onlineId) return null;
  const from = cityById(mission.fromId);
  const to = getArmyTargetById(mission.toId);
  const pathSegments = getMissionRouteSegments(mission);
  return {
    id: onlineId,
    ownerKind: "player",
    ownerUid: mission.ownerUid || getCurrentOnlineUid(),
    ownerName: mission.ownerName || state.playerName,
    ownerFlag: mission.ownerFlag || state.flag,
    ownerKingPower: normalizePowerValue(mission.ownerKingPower) || getKingPower(),
    kind: mission.kind || "attack",
    targetType: mission.targetType === "camp" || isRewardCampTarget(to) ? "camp" : "city",
    fromId: mission.fromId,
    toId: mission.toId,
    fromName: from?.name || "",
    toName: to?.name || "",
    troops: Math.max(0, Math.floor(Number(mission.troops) || 0)),
    total: Math.max(0.1, Number(mission.total) || 0.1),
    path: normalizeArmyPath(mission.path),
    pathSegments,
    routeRegionIds: getMissionRegionIds(mission),
    pathLength: Math.max(0, Number(mission.pathLength) || pathSegments.reduce((total, segment) => total + segment.length, 0) || routeLength(normalizeArmyPath(mission.path))),
    targetOwnerAtLaunch: mission.targetOwnerAtLaunch || "neutral",
    requestedTroops: Math.max(0, Math.floor(Number(mission.requestedTroops) || 0)),
    attackerKingPower: normalizePowerValue(mission.attackerKingPower),
    defenderKingPower: normalizePowerValue(mission.defenderKingPower),
    demoAttack: normalizeDemoAttackSnapshot(mission.demoAttack),
    launchedAtMs: Math.max(0, Number(mission.launchedAtMs) || Date.now()),
    arrivesAtMs: Math.max(0, Number(mission.arrivesAtMs) || Date.now()),
    status: "active",
  };
}

function rollbackServerArmyMission(mission, reason = "") {
  if (!state || !mission) return;
  const onlineId = getOnlineArmyResolutionId(mission);
  const source = cityById(mission.fromId);
  if (source?.owner === "player") {
    const returned = Math.max(0, Math.floor(Number(mission.troops) || 0));
    source.troopFloat = Math.max(0, Number(source.troopFloat) || Number(source.troops) || 0) + returned;
    source.troops = Math.floor(source.troopFloat);
  }
  state.attacks = state.attacks.filter(attack => {
    if (onlineId && getOnlineArmyResolutionId(attack) === onlineId) return false;
    return attack.id !== mission.id;
  });
  forgetPendingOnlineArmyMovement(onlineId);
  onlineLastError = reason || "Server rejected the army order.";
  addLog(`Army order canceled by server${reason ? `: ${reason}` : "."}`);
  showToast(reason || "Server canceled that army order.");
  saveGame();
  renderAll();
}

function rejectServerArmyMission(mission, reason = "", options = {}) {
  if (options.optimistic) {
    rollbackServerArmyMission(mission, reason);
    return;
  }
  const onlineId = getOnlineArmyResolutionId(mission);
  if (onlineId) forgetPendingOnlineArmyMovement(onlineId);
  onlineLastError = reason || "Server rejected the army order.";
  addLog(`Army order rejected by server${reason ? `: ${reason}` : "."}`);
  showToast(reason || "Server rejected that army order.");
  renderAll();
}

function applyServerMovementToMission(mission, movement = null) {
  if (!mission || !movement) return;
  const movementKind = String(movement.kind || "");
  const launchedAtMs = normalizeTimestampMs(movement.launchedAtMs);
  const arrivesAtMs = normalizeTimestampMs(movement.arrivesAtMs);
  const rawRemaining = Number(movement.remaining);
  mission.onlineId = movement.id || mission.onlineId;
  if (["attack", "transfer", "scout"].includes(movementKind)) mission.kind = movementKind;
  mission.troops = Math.max(0, Math.floor(Number(movement.troops) || mission.troops || 0));
  mission.requestedTroops = Math.max(0, Math.floor(Number(movement.requestedTroops) || mission.requestedTroops || mission.troops || 0));
  mission.total = Math.max(0.1, Number(movement.total) || mission.total || 0.1);
  if (arrivesAtMs > 0) {
    mission.remaining = Math.max(0, (arrivesAtMs - Date.now()) / 1000);
  } else if (Number.isFinite(rawRemaining)) {
    mission.remaining = Math.max(0, rawRemaining);
  }
  mission.launchedAtMs = launchedAtMs || mission.launchedAtMs;
  mission.arrivesAtMs = arrivesAtMs || mission.arrivesAtMs;
  mission.swiftMarchUsedAtMs = normalizeTimestampMs(movement.swiftMarchUsedAtMs) || mission.swiftMarchUsedAtMs || 0;
  mission.swiftMarchOriginalArrivesAtMs = normalizeTimestampMs(movement.swiftMarchOriginalArrivesAtMs) || mission.swiftMarchOriginalArrivesAtMs || 0;
  mission.swiftMarchProgressAtUse = clamp(Number(movement.swiftMarchProgressAtUse) || mission.swiftMarchProgressAtUse || 0, 0, 1);
  mission.swiftMarchRemainingMultiplier = Math.max(0, Number(movement.swiftMarchRemainingMultiplier) || mission.swiftMarchRemainingMultiplier || 0);
  if (movement.returning !== undefined) mission.returning = Boolean(movement.returning);
  mission.returnReason = movement.returnReason || mission.returnReason || "";
  mission.recalledAtMs = normalizeTimestampMs(movement.recalledAtMs) || mission.recalledAtMs || 0;
  mission.recallOriginalArrivesAtMs = normalizeTimestampMs(movement.recallOriginalArrivesAtMs) || mission.recallOriginalArrivesAtMs || 0;
  mission.returnStartProgress = clamp(Number(movement.returnStartProgress) || mission.returnStartProgress || 0, 0, 1);
  mission.returnDestinationId = movement.returnDestinationId || mission.returnDestinationId || "";
  mission.returnDestinationRegionId = normalizeRegionId(movement.returnDestinationRegionId || mission.returnDestinationRegionId);
  mission.relinquishTransfer = Boolean(movement.relinquishTransfer || mission.relinquishTransfer);
  mission.campReturn = Boolean(movement.campReturn || mission.campReturn);
  mission.campRecall = Boolean(movement.campRecall || mission.campRecall);
  mission.attackerKingPower = normalizePowerValue(movement.attackerKingPower || mission.attackerKingPower);
  mission.defenderKingPower = normalizePowerValue(movement.defenderKingPower || mission.defenderKingPower);
  if (movement.demoAttack !== undefined) mission.demoAttack = normalizeDemoAttackSnapshot(movement.demoAttack);
  mission.targetType = movement.targetType === "camp" ? "camp" : mission.targetType || "city";
  if (movement.targetOwnerUid !== undefined) mission.targetOwnerUid = String(movement.targetOwnerUid || "");
  mission.fromName = movement.fromName || mission.fromName || "";
  mission.toName = movement.toName || mission.toName || "";
  mission.sourceRegionId = normalizeRegionId(movement.sourceRegionId || mission.sourceRegionId);
  mission.targetRegionId = normalizeRegionId(movement.targetRegionId || mission.targetRegionId);
  const movementRegionIds = Array.isArray(movement.routeRegionIds) ? movement.routeRegionIds : movement.onlineRegionIds;
  mission.onlineRegionIds = Array.isArray(movementRegionIds) ? movementRegionIds.map(normalizeRegionId).filter(Boolean) : mission.onlineRegionIds;
}

function addServerAcceptedMission(mission) {
  if (!state || !mission) return false;
  const onlineId = getOnlineArmyResolutionId(mission);
  if (onlineId && state.attacks.some(attack => getOnlineArmyResolutionId(attack) === onlineId)) return false;
  state.attacks.push(mission);
  return true;
}

function publishOnlineArmyMovement(mission, options = {}) {
  if (!isOnlineWorldActive() || mission?.owner !== "player") return Promise.resolve(false);
  const api = getOnlineApi();
  if (!usesServerArmyAuthority() || !api?.sendArmyOrder) {
    onlineLastError = "Online army orders require the Crownlands server.";
    showToast("Online army orders need the server connection. Try again after reconnecting.");
    return Promise.resolve(false);
  }
  prepareOnlineArmyMission(mission);
  const movement = toOnlineArmyMovement(mission);
  if (!movement) return Promise.resolve(false);
  const regionIds = movement.routeRegionIds?.length ? movement.routeRegionIds : getMissionRegionIds(mission);
  mission.onlineRegionIds = regionIds;
  const sourceRegionId = getCityRegionId(mission.fromId);
  const target = getArmyTargetById(mission.toId);
  const targetRegionId = normalizeRegionId(mission.targetRegionId || target?.regionId || getCityRegionId(mission.toId));
  mission.fromName = mission.fromName || movement.fromName || "";
  mission.toName = mission.toName || movement.toName || "";
  mission.sourceRegionId = normalizeRegionId(mission.sourceRegionId || sourceRegionId);
  mission.targetRegionId = targetRegionId;
  mission.serverPending = true;
  pendingOutgoingMissions.set(movement.id, mission);
  updateOutgoingAttackUi();

  const savePromise = api.sendArmyOrder({
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    army: {
      ...movement,
      sourceRegionId,
      targetRegionId,
      targetType: movement.targetType,
    },
    sourceRegionId,
    targetRegionId,
    routeRegionIds: regionIds,
  })
    .then(result => {
      if (result?.movement) applyServerMovementToMission(mission, result.movement);
      mission.peaceShieldDeactivated = Boolean(result?.peaceShieldDeactivated);
      mission.serverPending = false;
      applyServerArmyResult({
        currentUser: result?.currentUser,
        cityUpdates: Array.isArray(result?.cityUpdates)
          ? result.cityUpdates
          : result?.sourceCity ? [result.sourceCity] : [],
      });
      if (options.addLocalMissionOnAccept) addServerAcceptedMission(mission);
      pendingOutgoingMissions.delete(movement.id);
      onlineLastError = "";
      saveGame();
      renderAll();
      updateIncomingAttackUi();
      updateOutgoingAttackUi();
      return true;
    })
    .catch(error => {
      pendingOutgoingMissions.delete(movement.id);
      mission.serverPending = false;
      onlineLastError = error?.message || String(error);
      console.warn("Server rejected army movement", error);
      rejectServerArmyMission(mission, onlineLastError, options);
      return false;
    })
    .finally(() => {
      pendingOutgoingMissions.delete(movement.id);
      onlineArmySavePromises.delete(savePromise);
      updateOutgoingAttackUi();
    });
  onlineArmySavePromises.add(savePromise);
  return savePromise;
}

function deleteOnlineArmyMovement(mission) {
  if (!mission?.onlineId || mission.owner !== "player") return;
  forgetPendingOnlineArmyMovement(mission.onlineId);
}

function getOnlineArmyResolutionId(mission) {
  const id = mission?.onlineId || (typeof mission?.id === "string" ? mission.id : "");
  return String(id || "").trim();
}

function isOnlineArmyResolutionBlocked(mission) {
  const onlineId = getOnlineArmyResolutionId(mission);
  return Boolean(onlineId && (resolvedOnlineArmyIds.has(onlineId) || resolvingOnlineArmyIds.has(onlineId)));
}

function getOnlineArmyRemainingSeconds(army) {
  if (!army) return 0;
  if (Number.isFinite(army.arrivesAtMs) && army.arrivesAtMs > 0) {
    return (army.arrivesAtMs - Date.now()) / 1000;
  }
  return Number(army.remaining) || 0;
}

function isServerArmyNotArrivedError(error) {
  const message = String(error?.message || error || "");
  return /not arrived/i.test(message);
}

function deferServerArmyResolutionRetry(mission) {
  if (!mission) return;
  const remaining = getOnlineArmyRemainingSeconds(mission);
  const retrySeconds = Math.min(5, Math.max(0.5, Number.isFinite(remaining) && remaining > 0 ? remaining : 1));
  mission.remaining = Math.max(Number(mission.remaining) || 0, retrySeconds);
  mission.resolveRetryAtMs = Date.now() + Math.ceil(retrySeconds * 1000);
}

function resolveOnlineArmyOwner(army) {
  if (army?.ownerUid && army.ownerUid === getCurrentOnlineUid()) return "player";
  if (!army?.ownerUid) return "neutral";
  if (army?.ownerKind === "neutral") return "neutral";
  return "enemy";
}

function normalizeOnlineArmyMovement(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const ownerUid = String(raw.ownerUid || "").trim();
  const rawOwnerKind = raw.ownerKind || raw.owner || "player";
  if (rawOwnerKind !== "neutral" && !ownerUid) return null;
  const total = Math.max(0.1, Number(raw.total) || 0.1);
  const launchedAtMs = Math.max(0, Number(raw.launchedAtMs) || 0);
  const arrivesAtMs = Math.max(
    0,
    Number(raw.arrivesAtMs) || (launchedAtMs ? launchedAtMs + total * 1000 : Date.now() + total * 1000)
  );
  const path = normalizeArmyPath(raw.path);
  const pathSegments = normalizeArmyPathSegments(raw.pathSegments);
  const ownerIdentity = ownerUid ? resolvePlayerIdentityForUid(ownerUid, raw) : null;
  return {
    id,
    onlineId: id,
    owner: resolveOnlineArmyOwner(raw),
    ownerKind: ownerUid ? "player" : "neutral",
    ownerUid,
    ownerName: ownerIdentity?.displayName || raw.ownerName || "",
    ownerFlag: ownerIdentity?.flag || raw.ownerFlag || null,
    ownerKingPower: normalizePowerValue(ownerIdentity?.kingPower) || normalizePowerValue(raw.ownerKingPower),
    kind: ["attack", "transfer", "scout"].includes(raw.kind) ? raw.kind : "attack",
    targetType: raw.targetType === "camp" ? "camp" : "city",
    fromId: raw.fromId || "",
    toId: raw.toId || "",
    fromName: raw.fromName || "",
    toName: raw.toName || "",
    sourceRegionId: normalizeRegionId(raw.sourceRegionId),
    targetRegionId: normalizeRegionId(raw.targetRegionId),
    troops: Math.max(0, Math.floor(Number(raw.troops) || 0)),
    total,
    remaining: Math.max(0, (arrivesAtMs - Date.now()) / 1000),
    path,
    pathSegments,
    pathLength: Math.max(0, Number(raw.pathLength) || pathSegments.reduce((total, segment) => total + segment.length, 0) || routeLength(path)),
    targetOwnerAtLaunch: raw.targetOwnerAtLaunch || "neutral",
    targetOwnerUid: String(raw.targetOwnerUid || ""),
    requestedTroops: Math.max(0, Math.floor(Number(raw.requestedTroops) || 0)),
    attackerKingPower: normalizePowerValue(raw.attackerKingPower || raw.ownerKingPower),
    defenderKingPower: normalizePowerValue(raw.defenderKingPower),
    demoAttack: normalizeDemoAttackSnapshot(raw.demoAttack),
    launchedAtMs,
    arrivesAtMs,
    swiftMarchUsedAtMs: normalizeTimestampMs(raw.swiftMarchUsedAtMs),
    swiftMarchOriginalArrivesAtMs: normalizeTimestampMs(raw.swiftMarchOriginalArrivesAtMs),
    swiftMarchProgressAtUse: clamp(Number(raw.swiftMarchProgressAtUse) || 0, 0, 1),
    swiftMarchRemainingMultiplier: Math.max(0, Number(raw.swiftMarchRemainingMultiplier) || 0),
    returning: Boolean(raw.returning),
    returnReason: String(raw.returnReason || ""),
    recalledAtMs: normalizeTimestampMs(raw.recalledAtMs),
    recallOriginalArrivesAtMs: normalizeTimestampMs(raw.recallOriginalArrivesAtMs),
    returnStartProgress: clamp(Number(raw.returnStartProgress) || 0, 0, 1),
    returnDestinationId: String(raw.returnDestinationId || ""),
    returnDestinationRegionId: normalizeRegionId(raw.returnDestinationRegionId),
    relinquishTransfer: Boolean(raw.relinquishTransfer),
    campReturn: Boolean(raw.campReturn),
    campRecall: Boolean(raw.campRecall),
    status: raw.status || "active",
    onlineRegionIds: Array.isArray(raw.routeRegionIds) ? raw.routeRegionIds.map(normalizeRegionId) : [],
  };
}

function rebuildOnlineArmies() {
  const seen = new Set();
  onlineArmies = Array.from(onlineArmiesByIsland.values())
    .flat()
    .filter(army => {
      const key = String(army?.id || army?.onlineId || "");
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function clearOnlineArmyWatchers() {
  onlineArmyUnsubscribes.forEach(unsubscribe => {
    if (typeof unsubscribe === "function") unsubscribe();
  });
  onlineArmyUnsubscribes = [];
  onlineArmiesByIsland = new Map();
  onlineArmies = [];
  pendingOutgoingMissions = new Map();
}

function clearOnlineHeldCampWatcher() {
  if (typeof onlineHeldCampsUnsubscribe === "function") onlineHeldCampsUnsubscribe();
  onlineHeldCampsUnsubscribe = null;
  onlineHeldCampStates = new Map();
}

function purgeResolvedOnlineArmy(onlineId, { removeLocal = true } = {}) {
  const id = String(onlineId || "").trim();
  if (!id) return false;
  let changed = false;
  for (const [cacheKey, armies] of onlineArmiesByIsland) {
    const current = Array.isArray(armies) ? armies : [];
    const filtered = current.filter(army => getOnlineArmyResolutionId(army) !== id);
    if (filtered.length === current.length) continue;
    onlineArmiesByIsland.set(cacheKey, filtered);
    changed = true;
  }
  if (removeLocal && state?.attacks?.length) {
    const filtered = state.attacks.filter(army => getOnlineArmyResolutionId(army) !== id);
    if (filtered.length !== state.attacks.length) {
      state.attacks = filtered;
      changed = true;
    }
  }
  if (pendingOutgoingMissions.delete(id)) changed = true;
  forgetPendingOnlineArmyMovement(id);
  if (changed) rebuildOnlineArmies();
  return changed;
}

function clearOnlineIslandArmySnapshots() {
  const playerRelevantArmies = onlineArmiesByIsland.get(PLAYER_RELEVANT_ARMIES_CACHE_KEY);
  onlineArmiesByIsland = new Map();
  if (playerRelevantArmies?.length) {
    onlineArmiesByIsland.set(PLAYER_RELEVANT_ARMIES_CACHE_KEY, playerRelevantArmies);
  }
  rebuildOnlineArmies();
}

function clearOnlineServerReportWatcher() {
  if (typeof onlineServerReportsUnsubscribe === "function") onlineServerReportsUnsubscribe();
  onlineServerReportsUnsubscribe = null;
}

function getArmyRouteSummary(route, source, target) {
  const regionIds = getRouteSegments(route, getCityRegionId(source)).map(segment => segment.regionId);
  const sourceRegionId = getCityRegionId(source);
  const targetRegionId = getCityRegionId(target);
  if (sourceRegionId) regionIds.unshift(sourceRegionId);
  if (targetRegionId) regionIds.push(targetRegionId);
  const orderedRegionIds = regionIds
    .map(normalizeRegionId)
    .filter((regionId, index, values) => regionId && (index === 0 || regionId !== values[index - 1]));
  const portalCount = Math.max(0, orderedRegionIds.length - 1);
  const chain = orderedRegionIds.map(getRegionLabel).join(" -> ");
  return portalCount > 0
    ? `${portalCount} portal ${portalCount === 1 ? "crossing" : "crossings"}: ${chain}`
    : `Same-island route: ${chain || getRegionLabel(sourceRegionId)}`;
}

function clearOnlineGlobalStatsWatcher() {
  if (typeof onlineGlobalStatsUnsubscribe === "function") onlineGlobalStatsUnsubscribe();
  onlineGlobalStatsUnsubscribe = null;
}

function clearOnlineCrownCitadelWatcher() {
  if (typeof onlineCrownCitadelUnsubscribe === "function") onlineCrownCitadelUnsubscribe();
  onlineCrownCitadelUnsubscribe = null;
  onlineCrownCitadelSnapshot = null;
  onlineCrownCitadelLoaded = false;
}

async function loadServerReportsOnce() {
  const api = getOnlineApi();
  if (!state || !api?.loadServerReports || !api?.isSignedIn?.()) return false;
  try {
    const reports = await withTimeout(api.loadServerReports(120), 5000, "Server reports are taking too long.");
    return mergeServerReports(reports);
  } catch (error) {
    onlineLastError = error?.message || String(error);
    console.warn("Could not load server reports", error);
    return false;
  }
}

function subscribeOnlineServerReports() {
  const api = getOnlineApi();
  if (typeof onlineServerReportsUnsubscribe === "function") return;
  if (!state || !api?.subscribeServerReports || !api?.isSignedIn?.()) return;
  onlineServerReportsUnsubscribe = api.subscribeServerReports({
    onReports: reports => {
      const changed = mergeServerReports(reports);
      if (!changed || !usesServerEconomyAuthority()) return;
      const newestReportAtMs = (Array.isArray(reports) ? reports : []).reduce((latest, report) => (
        Math.max(latest, normalizeTimestampMs(report?.createdAtMs) || timestampToMs(report?.createdAt))
      ), 0);
      const latestKnownAccountAtMs = Math.max(
        lastAuthoritativeProfileRevisionMs,
        lastReportDrivenEconomyRefreshAtMs
      );
      if (newestReportAtMs <= latestKnownAccountAtMs) return;
      lastReportDrivenEconomyRefreshAtMs = newestReportAtMs;
      refreshServerEconomy(true);
    },
    onError: error => {
      onlineLastError = error?.message || String(error);
      clearOnlineServerReportWatcher();
      console.warn("Could not subscribe to server reports", error);
    },
  });
}

function subscribeOnlineGlobalStats() {
  const api = getOnlineApi();
  if (typeof onlineGlobalStatsUnsubscribe === "function") return;
  if (!state || !api?.subscribePlayerGlobalStats || !api?.isSignedIn?.()) return;
  onlineGlobalStatsUnsubscribe = api.subscribePlayerGlobalStats({
    onStats: stats => {
      if (stats) applyGlobalStatsSnapshot(stats);
    },
    onError: error => {
      clearOnlineGlobalStatsWatcher();
      console.warn("Could not subscribe to global kingdom stats", error);
    },
  });
}

function subscribeOnlineCrownCitadel() {
  const api = getOnlineApi();
  if (typeof onlineCrownCitadelUnsubscribe === "function") return;
  if (!state || !api?.subscribeCrownCitadel || !api?.isSignedIn?.()) return;
  onlineCrownCitadelUnsubscribe = api.subscribeCrownCitadel(
    getOnlineIslandId("center"),
    CROWN_CITADEL_ID,
    {
      onCitadel: citadel => {
        const previousHolderUid = getCrownCitadelHolderUid();
        onlineCrownCitadelSnapshot = citadel;
        onlineCrownCitadelLoaded = true;
        if (previousHolderUid !== getCrownCitadelHolderUid()) {
          crownCitadelReignCache = [];
          cityRenderSignature = "";
          renderCities(true);
          if (modalBody?.querySelector("[data-citadel-reign-panel]")) {
            void refreshCrownCitadelReignPanel({ force: true });
          }
        }
      },
      onError: error => {
        clearOnlineCrownCitadelWatcher();
        console.warn("Could not subscribe to Crown Citadel control", error);
      },
    }
  );
}

function subscribeOnlineHeldCamps() {
  const api = getOnlineApi();
  if (typeof onlineHeldCampsUnsubscribe === "function") return;
  if (!state || !api?.subscribePlayerCamps || !api?.isSignedIn?.()) return;
  onlineHeldCampsUnsubscribe = api.subscribePlayerCamps({
    onCamps: camps => applyOnlineHeldCamps(camps),
    onError: error => {
      clearOnlineHeldCampWatcher();
      console.warn("Could not subscribe to held camps", error);
    },
  });
}

function subscribeOnlineArmyWatchers() {
  const api = getOnlineApi();
  if (!api?.subscribePlayerArmies || !isOnlineWorldActive()) return;
  if (onlineArmyUnsubscribes.length) return;
  const unsubscribe = api.subscribePlayerArmies({
    onArmies: armies => {
      applyOnlineArmies(armies, PLAYER_RELEVANT_ARMIES_CACHE_KEY);
      renderArmies();
      updateIncomingAttackUi();
      updateOutgoingAttackUi();
    },
    onError: error => {
      console.warn("Could not subscribe to player-relevant armies", error);
    },
  });
  if (typeof unsubscribe === "function") onlineArmyUnsubscribes.push(unsubscribe);
}

function isOnlineArmyVisible(army) {
  if (!army || army.status !== "active") return false;
  const onlineId = getOnlineArmyResolutionId(army);
  if (onlineId && resolvedOnlineArmyIds.has(onlineId)) return false;
  if (!army.fromId || !army.toId) return false;
  if (army.ownerUid && army.ownerUid === getCurrentOnlineUid()) return true;
  return getOnlineArmyRemainingSeconds(army) > -ONLINE_ARMY_EXPIRY_GRACE_SECONDS;
}

function createLocalAttackFromOnlineArmy(army, remaining = getOnlineArmyRemainingSeconds(army)) {
  if (!army) return null;
  const uid = getCurrentOnlineUid();
  return {
    id: attackIdCounter++,
    onlineId: army.id,
    owner: "player",
    ownerKind: "player",
    ownerUid: uid,
    ownerName: army.ownerName || state.playerName,
    ownerFlag: army.ownerFlag || state.flag,
    ownerKingPower: normalizePowerValue(army.ownerKingPower),
    kind: army.kind,
    targetType: army.targetType === "camp" ? "camp" : "city",
    fromId: army.fromId,
    toId: army.toId,
    fromName: army.fromName || "",
    toName: army.toName || "",
    troops: army.troops,
    total: army.total,
    remaining: clamp(remaining, 0, army.total),
    path: army.path,
    pathSegments: army.pathSegments,
    pathLength: army.pathLength,
    targetOwnerAtLaunch: army.targetOwnerAtLaunch,
    requestedTroops: Math.max(0, Math.floor(Number(army.requestedTroops) || 0)),
    attackerKingPower: normalizePowerValue(army.attackerKingPower || army.ownerKingPower),
    defenderKingPower: normalizePowerValue(army.defenderKingPower),
    demoAttack: normalizeDemoAttackSnapshot(army.demoAttack),
    launchedAtMs: army.launchedAtMs,
    arrivesAtMs: army.arrivesAtMs,
    swiftMarchUsedAtMs: normalizeTimestampMs(army.swiftMarchUsedAtMs),
    swiftMarchOriginalArrivesAtMs: normalizeTimestampMs(army.swiftMarchOriginalArrivesAtMs),
    swiftMarchProgressAtUse: clamp(Number(army.swiftMarchProgressAtUse) || 0, 0, 1),
    swiftMarchRemainingMultiplier: Math.max(0, Number(army.swiftMarchRemainingMultiplier) || 0),
    returning: Boolean(army.returning),
    returnReason: String(army.returnReason || ""),
    recalledAtMs: normalizeTimestampMs(army.recalledAtMs),
    recallOriginalArrivesAtMs: normalizeTimestampMs(army.recallOriginalArrivesAtMs),
    returnStartProgress: clamp(Number(army.returnStartProgress) || 0, 0, 1),
    returnDestinationId: String(army.returnDestinationId || ""),
    returnDestinationRegionId: normalizeRegionId(army.returnDestinationRegionId),
    relinquishTransfer: Boolean(army.relinquishTransfer),
    campReturn: Boolean(army.campReturn),
    campRecall: Boolean(army.campRecall),
    sourceRegionId: army.sourceRegionId,
    targetRegionId: army.targetRegionId,
    onlineRegionIds: army.onlineRegionIds?.length ? army.onlineRegionIds : getMissionRegionIds(army),
  };
}

function restoreOnlineActiveRegionSnapshot(snapshot) {
  if (!state || !snapshot) return;
  onlineActiveRegionId = snapshot.onlineActiveRegionId;
  state.activeRegionId = snapshot.activeRegionId;
  if (state.online) {
    state.online.activeRegionId = snapshot.onlineState?.activeRegionId || snapshot.activeRegionId;
    state.online.islandId = snapshot.onlineState?.islandId || getOnlineIslandId(snapshot.activeRegionId);
  }
}

async function loadOnlineRegionCitiesForResolution(regionId) {
  const api = getOnlineApi();
  if (!state || !api?.loadIslandCities || !api?.isSignedIn?.()) return false;
  const targetRegionId = normalizeRegionId(regionId);
  const activeSnapshot = {
    activeRegionId: getActiveOnlineRegionId(),
    onlineActiveRegionId,
    onlineState: state.online ? {
      activeRegionId: state.online.activeRegionId,
      islandId: state.online.islandId,
    } : null,
  };

  const onlineCities = await withTimeout(
    api.loadIslandCities(getOnlineIslandId(targetRegionId)),
    ONLINE_REGION_CITY_RESOLUTION_TIMEOUT_MS,
    `${getRegionLabel(targetRegionId)} city list is taking too long.`
  );
  if (!Array.isArray(onlineCities)) return false;
  applyOnlineCities(onlineCities, targetRegionId);
  restoreOnlineActiveRegionSnapshot(activeSnapshot);
  return true;
}

function resolveOverdueOnlineArmy(army) {
  const onlineId = getOnlineArmyResolutionId(army);
  if (!onlineId || resolvingOnlineArmyIds.has(onlineId) || resolvedOnlineArmyIds.has(onlineId)) return;
  resolvingOnlineArmyIds.add(onlineId);
  resolveOverdueOnlineArmyAsync(army)
    .catch(error => {
      onlineLastError = error?.message || String(error);
      console.warn("Could not resolve overdue online army", error);
    })
    .finally(() => {
      resolvingOnlineArmyIds.delete(onlineId);
    });
}

async function resolveServerArmyMission(mission) {
  if (!usesServerArmyAuthority()) return false;
  const onlineId = getOnlineArmyResolutionId(mission);
  if (!onlineId || resolvedOnlineArmyIds.has(onlineId)) return false;
  const api = getOnlineApi();
  const routeRegionIds = mission.onlineRegionIds?.length
    ? mission.onlineRegionIds
    : getMissionRegionIds(mission);
  if (!routeRegionIds.length) return false;

  if (resolvingOnlineArmyIds.has(onlineId)) return false;
  resolvingOnlineArmyIds.add(onlineId);
  try {
    const result = await api.resolveArmyOrder({
      armyId: onlineId,
      routeRegionIds,
    });
    const shouldBackfillScoutReports = mission?.kind === "scout"
      && (!Array.isArray(result?.reports) || result.reports.length === 0);
    const resolutionComplete = result?.status === "resolved"
      || result?.status === "missing"
      || result?.status === "already-resolved";
    if (resolutionComplete) {
      resolvedOnlineArmyIds.add(onlineId);
    }
    applyServerArmyResult(result);
    if (resolutionComplete) purgeResolvedOnlineArmy(onlineId);
    if (result?.movement) adoptServerArmyMovement(result.movement);
    if (shouldBackfillScoutReports) {
      await loadServerReportsOnce();
    }
    mission.resolveRetryAtMs = 0;
    onlineLastError = "";
    saveGame();
    flushOnlineSave(true);
    renderAll();
    updateIncomingAttackUi();
    updateOutgoingAttackUi();
    return true;
  } catch (error) {
    if (isServerArmyNotArrivedError(error)) {
      deferServerArmyResolutionRetry(mission);
      return false;
    }
    onlineLastError = error?.message || String(error);
    console.warn("Could not resolve server army", error);
    return false;
  } finally {
    resolvingOnlineArmyIds.delete(onlineId);
  }
}

async function resolveOverdueOnlineArmyAsync(army) {
  if (!state) return false;
  const onlineId = getOnlineArmyResolutionId(army);
  if (!onlineId || resolvedOnlineArmyIds.has(onlineId)) return false;
  if (usesServerArmyAuthority()) {
    resolvingOnlineArmyIds.delete(onlineId);
    return resolveServerArmyMission(army);
  }
  onlineLastError = "Online army resolution requires the Crownlands server.";
  return false;
}

function adoptOwnOnlineArmies() {
  if (!state || !Array.isArray(onlineArmies)) return;
  const uid = getCurrentOnlineUid();
  if (!uid) return;
  const localArmiesByOnlineId = new Map(state.attacks
    .filter(attack => attack.onlineId)
    .map(attack => [String(attack.onlineId), attack]));
  const localOnlineIds = new Set(localArmiesByOnlineId.keys());
  for (const army of onlineArmies) {
    if (army.ownerUid !== uid || isOnlineArmyResolutionBlocked(army)) continue;
    const existingMission = localArmiesByOnlineId.get(String(army.id));
    if (existingMission) {
      applyServerMovementToMission(existingMission, army);
      continue;
    }
    const remaining = getOnlineArmyRemainingSeconds(army);
    if (remaining <= 0) {
      resolveOverdueOnlineArmy(army);
      continue;
    }
    const mission = createLocalAttackFromOnlineArmy(army, remaining);
    if (!mission) continue;
    state.attacks.push(mission);
    localOnlineIds.add(army.id);
  }
}

function retryOverdueOnlineArmyResolutions() {
  if (!state || !Array.isArray(onlineArmies)) return;
  if (!usesServerArmyAuthority()) return;
  const uid = getCurrentOnlineUid();
  if (!uid) return;
  onlineArmies
    .filter(army => !isOnlineArmyResolutionBlocked(army))
    .filter(army => getOnlineArmyRemainingSeconds(army) <= 0)
    .forEach(resolveOverdueOnlineArmy);
}

function applyOnlineArmies(rawArmies, islandId = getActiveOnlineIslandId()) {
  const normalizedIslandId = String(islandId || getActiveOnlineIslandId());
  if (!Array.isArray(rawArmies)) {
    onlineArmiesByIsland.delete(normalizedIslandId);
    rebuildOnlineArmies();
    return;
  }
  queuePlayerIdentityLookupForRecords(rawArmies);
  onlineArmiesByIsland.set(normalizedIslandId, rawArmies
    .map(normalizeOnlineArmyMovement)
    .filter(Boolean)
    .filter(isOnlineArmyVisible));
  rebuildOnlineArmies();
  adoptOwnOnlineArmies();
  retryOverdueOnlineArmyResolutions();
}

function getRenderableArmies() {
  if (!state) return [];
  if (renderableArmiesFrameCacheActive && renderableArmiesFrameCache) {
    return renderableArmiesFrameCache;
  }
  const localOnlineIds = new Set();
  const localArmies = state.attacks.map(attack => {
    if (attack.onlineId) localOnlineIds.add(attack.onlineId);
    return attack;
  });
  const remoteArmies = onlineArmies
    .filter(isOnlineArmyVisible)
    .filter(army => !(army.ownerUid === getCurrentOnlineUid() && localOnlineIds.has(army.id)))
    .map(army => {
      const identity = army.ownerUid ? resolvePlayerIdentityForUid(army.ownerUid, army) : null;
      const ownerKingPower = normalizePowerValue(identity?.kingPower) || normalizePowerValue(army.ownerKingPower);
      return {
        ...army,
        owner: resolveOnlineArmyOwner(army),
        ownerName: identity?.displayName || army.ownerName || "",
        ownerFlag: identity?.flag || army.ownerFlag || null,
        ownerKingPower,
        attackerKingPower: normalizePowerValue(army.attackerKingPower) || ownerKingPower,
        remaining: Math.max(0, getOnlineArmyRemainingSeconds(army)),
      };
    });
  const knownOnlineIds = new Set([...localArmies, ...remoteArmies]
    .map(getOnlineArmyResolutionId)
    .filter(Boolean));
  const pendingArmies = Array.from(pendingOutgoingMissions.values())
    .filter(mission => !knownOnlineIds.has(getOnlineArmyResolutionId(mission)))
    .map(mission => ({
      ...mission,
      owner: "player",
      remaining: Math.max(0, getOnlineArmyRemainingSeconds(mission)),
      serverPending: true,
    }));
  const renderableArmies = [...localArmies, ...remoteArmies, ...pendingArmies];
  if (renderableArmiesFrameCacheActive) renderableArmiesFrameCache = renderableArmies;
  return renderableArmies;
}

function getIncomingAttacks() {
  if (!state) return [];
  const seen = new Set();
  return getRenderableArmies()
    .map(attack => {
      if (!attack || attack.returning || !["attack", "scout"].includes(attack.kind) || attack.owner === "player") return null;
      const baseTarget = getArmyTargetById(attack.toId);
      const target = attack.targetType === "camp" && baseTarget && attack.targetOwnerUid === getCurrentOnlineUid()
        ? { ...baseTarget, owner: "player", ownerKind: "player", ownerUid: attack.targetOwnerUid }
        : baseTarget;
      if (!target || target.owner !== "player") return null;
      const remaining = Math.max(0, Number(attack.remaining) || 0);
      if (remaining <= 0) return null;
      const key = String(attack.onlineId || attack.id || `${attack.fromId}:${attack.toId}:${attack.launchedAtMs || ""}`);
      if (seen.has(key)) return null;
      seen.add(key);
      const source = cityById(attack.fromId);
      const attackerIdentity = attack.ownerUid ? resolvePlayerIdentityForUid(attack.ownerUid, attack) : null;
      return {
        ...attack,
        key,
        target,
        source,
        remaining,
        attackerName: attackerIdentity?.displayName || attack.ownerName || getBattleReportOwnerName(source, attack.owner),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.remaining - b.remaining);
}

function getOutgoingAttacks() {
  if (!state) return [];
  const seen = new Set();
  return getRenderableArmies()
    .map(attack => {
      if (!attack || !["attack", "scout", "transfer"].includes(attack.kind) || attack.owner !== "player") return null;
      const key = String(attack.onlineId || attack.id || `${attack.fromId}:${attack.toId}:${attack.launchedAtMs || ""}`);
      if (seen.has(key)) return null;
      seen.add(key);
      const remaining = Math.max(0, Number(attack.remaining) || 0);
      const isResolving = remaining <= 0 && Boolean(attack.onlineId) && !resolvedOnlineArmyIds.has(key);
      if (remaining <= 0 && !isResolving) return null;
      return {
        ...attack,
        key,
        target: getArmyTargetById(attack.toId),
        source: cityById(attack.fromId),
        remaining,
        isResolving,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.remaining - b.remaining);
}

function getIncomingUpgradeBlockers(cityOrId) {
  if (!state) return [];
  const cityId = getKnownCityId(typeof cityOrId === "object" ? cityOrId?.id : cityOrId);
  if (!cityId) return [];
  const seen = new Set();
  return getRenderableArmies()
    .map(attack => {
      if (!attack || attack.returning || attack.kind !== "attack") return null;
      if (getKnownCityId(attack.toId) !== cityId) return null;
      if (attack.owner === "player") return null;
      const remaining = Math.max(0, Number(attack.remaining) || 0);
      if (remaining <= 0) return null;
      const key = String(attack.onlineId || attack.id || `${attack.fromId}:${attack.toId}:${attack.launchedAtMs || ""}`);
      if (seen.has(key)) return null;
      seen.add(key);
      return { ...attack, key, remaining };
    })
    .filter(Boolean)
    .sort((a, b) => a.remaining - b.remaining);
}

function cityHasIncomingUpgradeBlocker(cityOrId) {
  return getIncomingUpgradeBlockers(cityOrId).length > 0;
}

function hardReset() {
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  location.reload();
}

function getPreferredPlayerName() {
  const api = getOnlineApi();
  return cleanName(playerNameInput?.value)
    || cleanName(api?.getUser?.()?.displayName)
    || "Ricky";
}

async function startFromInput(forceFresh = false) {
  if (gameServerLaunchInFlight) return;
  gameServerLaunchInFlight = true;
  const playerName = getPreferredPlayerName();
  const launchBtn = enterKingdomBtn || startBtn;
  const originalStartText = launchBtn?.textContent || "";
  const originalStatusDetail = onlineStatusDetail?.textContent || "";
  let shouldConnectOnline = false;
  let statusOverride = "";
  try {
    onlineSessionReplaced = false;
    if (launchBtn) {
      launchBtn.disabled = true;
      launchBtn.textContent = forceFresh ? "Creating..." : "Entering...";
    }
    if (freshBtn) freshBtn.disabled = true;
    setSetupLoading(true, forceFresh ? "Creating kingdom..." : "Entering kingdom...");
    await waitForSetupLoadingPaint();

    shouldConnectOnline = Boolean(getOnlineApi()?.isSignedIn?.());
    if (!shouldConnectOnline) {
      throw new Error("Sign in with Google to play online.");
    }
    const realmIsReady = await joinSelectedGameServer();
    if (!realmIsReady) {
      statusOverride = `Waiting for an opening in ${GAME_SERVER_NAME}.`;
      if (onlineStatusDetail) onlineStatusDetail.textContent = statusOverride;
      showToast(`${GAME_SERVER_NAME} is full. You joined the waiting list.`);
      return;
    }
    state = createOnlineEntryState(playerName);
    state.online = null;
    onlineWorldConnected = false;
    onlineCitiesLoaded = false;
    onlineIdentityRepairInFlight = false;
    onlineIdentityRepairCompleted = false;
    localDirtyCityIds = new Set();
    pendingOfflineProgressSeconds = 0;
    pendingOfflineProductionCities = [];
    state.lastRealTimeMs = Date.now();
    selectedMarchPercent = normalizeMarchPercent(state.marchPercent);

    if (onlineStatusDetail) onlineStatusDetail.textContent = "Loading your online city...";
    const connected = await setupOnlineWorld();
    if (!connected) throw new Error(onlineLastError || "Online city setup did not finish.");
    setupScreen.classList.remove("visible");
    clearSelection(false);
    rememberOwnedAttackSource(state.mainCityId || playerCities()[0]?.id);
    saveGame();
    renderAll();
    scheduleRouteWorkerWarmup();
    requestAnimationFrame(() => centerOnCity(selectedSourceId || state.mainCityId || playerCities()[0]?.id));
    flushOnlineSave(true);
    refreshPushAlertRegistration(true);
    showToast("Online kingdom loaded.");
  } catch (error) {
    onlineLastError = error?.message || String(error);
    statusOverride = shouldConnectOnline ? `Online setup failed: ${onlineLastError}` : onlineLastError;
    if (setupScreen?.classList.contains("visible")) {
      disconnectOnlineWorld();
      state = null;
    }
    updateOnlineUi();
    if (onlineStatusDetail) onlineStatusDetail.textContent = statusOverride;
    showToast(shouldConnectOnline ? "Online setup failed. Try again." : "Sign in with Google to play.");
    console.warn("Could not start Crown Lands", error);
  } finally {
    gameServerLaunchInFlight = false;
    setSetupLoading(false);
    if (setupScreen?.classList.contains("visible") && onlineStatusDetail && originalStatusDetail && !statusOverride) {
      onlineStatusDetail.textContent = originalStatusDetail;
    }
    if (launchBtn) {
      launchBtn.disabled = false;
      launchBtn.textContent = originalStartText || "Enter Kingdom";
    }
    if (freshBtn) freshBtn.disabled = false;
    updateOnlineUi();
  }
}

function cleanName(value) {
  return String(value || "")
    .replace(/[^a-z0-9 _.-]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PLAYER_NAME_MAX_LENGTH);
}

function getStateCityByIdCache() {
  if (!state?.cities) return null;
  if (
    stateCityByIdCache
    && stateCityByIdCacheSource === state.cities
    && stateCityByIdCacheSize === state.cities.length
  ) {
    return stateCityByIdCache;
  }
  stateCityByIdCacheSource = state.cities;
  stateCityByIdCacheSize = state.cities.length;
  stateCityByIdCache = new Map(state.cities.map(city => [city.id, city]));
  return stateCityByIdCache;
}

function cityById(id) {
  return getStateCityByIdCache()?.get(String(id || "")) || null;
}

function cityByIdSafe(cities, id) {
  if (state?.cities && cities === state.cities) return cityById(id);
  return Array.isArray(cities) ? cities.find(city => city.id === id) : null;
}

function playerCities() {
  return state.cities.filter(city => city.owner === "player");
}

function playerRegularCities() {
  return playerCities().filter(city => !isStronghold(city));
}

function normalizeOwnedCitySnapshot(raw = {}) {
  const id = getKnownCityId(raw.id);
  if (!id) return null;
  const base = getPlayableBaseCityById(id) || {};
  const regionId = normalizeRegionId(raw.regionId || base.regionId || raw.startPool || base.startPool);
  const ownerUid = String(raw.ownerUid || getCurrentOnlineUid() || "").trim();
  const ownerIdentity = ownerUid ? resolvePlayerIdentityForUid(ownerUid, raw) : null;
  const ownerFlag = ownerIdentity?.flag || raw.ownerFlag || (ownerUid === getCurrentOnlineUid() ? state?.flag : null);
  const troopFallback = getCityTroopFallback({ ...base, ...raw }, { owner: "player", ownerKind: "player", ownerUid });
  const knownMainCityId = getKnownCityId(state?.mainCityId);
  const isKnownMainCity = !isStronghold(raw) && !isStronghold(base)
    && (knownMainCityId ? id === knownMainCityId : Boolean(raw.isMainCity));
  return {
    ...base,
    ...raw,
    id,
    name: getCanonicalCityName(base, raw),
    owner: "player",
    ownerKind: "player",
    ownerUid: ownerUid || null,
    ownerName: ownerIdentity?.displayName || raw.ownerName || state?.playerName || "",
    ownerFlag,
    ownerKingPower: normalizePowerValue(ownerIdentity?.kingPower) || normalizePowerValue(raw.ownerKingPower),
    ownerShieldExpiresAtMs: isStronghold(raw) || isStronghold(base) ? 0 : normalizeTimestampMs(raw.ownerShieldExpiresAtMs),
    regionId,
    startPool: raw.startPool || base.startPool || regionId,
    islandId: raw.islandId || getOnlineIslandId(regionId),
    kind: raw.kind || base.kind || "",
    strongholdType: raw.strongholdType || base.strongholdType || "",
    bonus: raw.bonus || base.bonus || "",
    bonusPercent: Number(raw.bonusPercent ?? base.bonusPercent) || 0,
    size: isStronghold(raw) || isStronghold(base) ? getStrongholdVisualSize(isStronghold(base) ? base : raw) : undefined,
    level: isStronghold(raw) || isStronghold(base) ? getStrongholdDefenseLevel({ ...base, ...raw }) : clampCityLevel(raw.level ?? base.level),
    troops: readCityTroops(raw.troops, troopFallback),
    troopFloat: readCityTroopFloat(raw.troopFloat ?? raw.troops, troopFallback),
    defense: 1,
    investedGold: Math.max(0, Math.floor(Number(raw.investedGold) || 0)),
    lastCapturedAt: raw.lastCapturedAt ?? null,
    isMainCity: isKnownMainCity,
    relinquishedAtMs: 0,
    relocatedAtMs: 0,
  };
}

function mergeOwnedCitySnapshots(cities = [], { complete = false } = {}) {
  const merged = new Map();
  if (!complete) {
    onlineOwnedCitiesCache.forEach(city => {
      const normalized = normalizeOwnedCitySnapshot(city);
      if (normalized) merged.set(normalized.id, normalized);
    });
  }
  cities.forEach(city => {
    const normalized = normalizeOwnedCitySnapshot(city);
    if (normalized) merged.set(normalized.id, normalized);
  });
  onlineOwnedCitiesCache = Array.from(merged.values());
  normalizeSingleMainCityAssignment(state?.mainCityId || "");
  if (complete) {
    onlineOwnedCitiesCacheAt = Date.now();
    onlineOwnedCitiesCacheComplete = true;
  }
  updateIslandSummariesFromOwnedCityCache();
  updateOutgoingAttackUi();
  return onlineOwnedCitiesCache;
}

function getAllOwnedCitiesForDisplay() {
  const merged = new Map();
  onlineOwnedCitiesCache.forEach(city => {
    const normalized = normalizeOwnedCitySnapshot(city);
    if (normalized) merged.set(normalized.id, normalized);
  });
  if (state?.cities) {
    playerCities().forEach(city => {
      const normalized = normalizeOwnedCitySnapshot({
        ...city,
        islandId: getOnlineIslandId(getCityRegionId(city)),
      });
      if (normalized) merged.set(normalized.id, normalized);
    });
  }
  return Array.from(merged.values());
}

function getAllOwnedRegularCitiesForDisplay() {
  return getAllOwnedCitiesForDisplay().filter(city => !isStronghold(city));
}

function getOwnedCitySnapshotById(cityId) {
  const id = getKnownCityId(cityId);
  if (!id) return null;
  return getAllOwnedCitiesForDisplay().find(city => city.id === id) || null;
}

function ownedCities(owner) {
  return state.cities.filter(city => city.owner === owner);
}

function connected(cityA, cityB) {
  return Boolean(cityA && cityB && cityA.id !== cityB.id);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInEllipse(x, y, shape, padding = 0) {
  const cos = Math.cos(-shape.rot);
  const sin = Math.sin(-shape.rot);
  const dx = x - shape.x;
  const dy = y - shape.y;
  const xr = dx * cos - dy * sin;
  const yr = dx * sin + dy * cos;
  const rx = shape.rx + padding;
  const ry = shape.ry + padding;
  return ((xr * xr) / (rx * rx)) + ((yr * yr) / (ry * ry)) <= 1;
}

function isBaseLandPoint(x, y) {
  return isWorldLandPoint(x, y, 0);
}

function isWalkablePoint(x, y, padding = 0) {
  const samples = padding > 0
    ? [[0, 0], [padding, 0], [-padding, 0], [0, padding], [0, -padding]]
    : [[0, 0]];

  for (const [dx, dy] of samples) {
    if (!isBaseLandPoint(x + dx, y + dy)) return false;
  }

  if (getBitmapIslandRegionIdAtWorldPoint(x, y, padding)) {
    return !isBitmapTerrainBlockedPoint(x, y, padding);
  }

  return !TERRAIN_BLOCKERS.some(shape => {
    const extra = shape.type === "mountain" ? 20 : 10;
    return pointInEllipse(x, y, shape, padding + extra);
  });
}

function isBitmapRegionLandPoint(regionId, x, y, padding = 0) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const bounds = getIslandMapBounds(normalizedRegionId);
  const insideBounds = x >= bounds.left - padding
    && x <= bounds.right + padding
    && y >= bounds.top - padding
    && y <= bounds.bottom + padding;
  if (!insideBounds) return false;
  const point = worldToIslandImagePoint(normalizedRegionId, x, y);
  const dimensions = getIslandImageDimensions(normalizedRegionId);
  if (point.x < 0 || point.y < 0 || point.x > dimensions.width || point.y > dimensions.height) return false;
  const polygon = getIslandLandPolygon(normalizedRegionId);
  return polygon.length ? pointInPolygon(point.x, point.y, polygon) : true;
}

function isRegionLandPoint(x, y, regionId, padding = 0) {
  const normalizedRegionId = normalizeRegionId(regionId);
  if (BITMAP_ISLAND_IDS.includes(normalizedRegionId)) {
    return isBitmapRegionLandPoint(normalizedRegionId, x, y, padding);
  }
  const region = getRegionById(normalizedRegionId);
  return Boolean(region && pointInWorldRegion(x, y, region, padding));
}

function isBitmapTerrainBlockedForRegion(x, y, regionId, padding = 0) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const point = worldToIslandImagePoint(normalizedRegionId, x, y);
  return (IMAGE_TERRAIN_BLOCKERS[normalizedRegionId] || []).some(shape => pointInImageEllipse(point, shape, padding));
}

function isRegionWalkablePoint(x, y, regionId, padding = 0) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const samples = padding > 0
    ? [[0, 0], [padding, 0], [-padding, 0], [0, padding], [0, -padding]]
    : [[0, 0]];

  for (const [dx, dy] of samples) {
    if (!isRegionLandPoint(x + dx, y + dy, normalizedRegionId, 0)) return false;
  }

  if (BITMAP_ISLAND_IDS.includes(normalizedRegionId)) {
    return !isBitmapTerrainBlockedForRegion(x, y, normalizedRegionId, padding);
  }

  return !TERRAIN_BLOCKERS.some(shape => {
    if (normalizeRegionId(shape.regionId) !== normalizedRegionId) return false;
    const extra = shape.type === "mountain" ? 20 : 10;
    return pointInEllipse(x, y, shape, padding + extra);
  });
}


function isValidCityPlacementPoint(x, y) {
  if (!isWalkablePoint(x, y, 0)) return false;
  if (isWorldStrongholdReservePoint(x, y)) return false;
  for (const [dx, dy] of [[0, 0], [32, 0], [-32, 0], [0, 32], [0, -32], [24, 24], [-24, 24], [24, -24], [-24, -24]]) {
    if (!isBaseLandPoint(x + dx, y + dy)) return false;
  }
  if (getBitmapIslandRegionIdAtWorldPoint(x, y, 32)) {
    return !isBitmapTerrainBlockedPoint(x, y, 8) && !isBitmapNoCityTerrainPoint(x, y, 0);
  }
  for (const shape of [...TERRAIN_BLOCKERS, ...NO_CITY_TERRAIN]) {
    const extra = shape.type === "mountain" ? 70 : 62;
    if (pointInEllipse(x, y, shape, extra)) return false;
  }
  return true;
}

function isWalkableCell(gx, gy) {
  if (gx < 0 || gy < 0 || gx >= GRID_COLS || gy >= GRID_ROWS) return false;
  return isWalkablePoint(gx * GRID_SIZE + GRID_SIZE / 2, gy * GRID_SIZE + GRID_SIZE / 2, 0);
}

function isCampRouteObstacle(target = {}) {
  return Boolean(target.campType || target.targetType === "camp" || target.kind === "goldCamp" || target.kind === "warbandCamp");
}

function getRouteObstacleRadius(target = {}) {
  if (isCampRouteObstacle(target)) {
    return Math.max(ROUTE_STRONGHOLD_CLEARANCE, readVisualSize(target.size, DEFAULT_CAMP_VISUAL_SIZE) * 0.55);
  }
  if (isStronghold(target)) {
    return Math.max(ROUTE_STRONGHOLD_CLEARANCE, getStrongholdVisualSize(target) * 0.55);
  }
  return ROUTE_CITY_CLEARANCE;
}

function getRouteObstacleTargetsForRegion(regionId) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const targetsById = new Map();
  const addTarget = target => {
    const id = String(target?.id || "");
    if (!id || getCityRegionId(target) !== normalizedRegionId) return;
    targetsById.set(id, target);
  };
  getOnlineIslandBaseCities(normalizedRegionId).forEach(addTarget);
  WORLD_CAMPS.forEach(addTarget);
  (state?.cities || []).forEach(addTarget);
  return [...targetsById.values()];
}

function createRouteContext(regionId, source = null, target = null) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const ignoredIds = new Set([source?.id, target?.id].filter(Boolean));
  const obstacles = getRouteObstacleTargetsForRegion(normalizedRegionId)
    .filter(structure => !ignoredIds.has(structure.id))
    .map(structure => ({
      id: structure.id,
      x: structure.x,
      y: structure.y,
      radius: getRouteObstacleRadius(structure),
    }));
  return {
    regionId: normalizedRegionId,
    ignoredIds,
    obstacles,
    cacheKey: `structure-block:${normalizedRegionId}:${[...ignoredIds].sort().join(",")}`,
  };
}

function isRouteCityBlockedPoint(x, y, context, padding = 0) {
  if (!context?.obstacles?.length) return false;
  for (const obstacle of context.obstacles) {
    const radius = obstacle.radius + padding;
    const dx = obstacle.x - x;
    const dy = obstacle.y - y;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

function isRouteWalkablePointInRegion(x, y, regionId, context = null, padding = 0) {
  return isRegionWalkablePoint(x, y, regionId, padding)
    && !isRouteCityBlockedPoint(x, y, context, padding);
}

function isWalkableCellForRegion(gx, gy, regionId, context = null) {
  if (gx < 0 || gy < 0 || gx >= GRID_COLS || gy >= GRID_ROWS) return false;
  return isRouteWalkablePointInRegion(gx * GRID_SIZE + GRID_SIZE / 2, gy * GRID_SIZE + GRID_SIZE / 2, regionId, context, 0);
}

function worldToGrid(x, y) {
  return {
    gx: clamp(Math.floor(x / GRID_SIZE), 0, GRID_COLS - 1),
    gy: clamp(Math.floor(y / GRID_SIZE), 0, GRID_ROWS - 1),
  };
}

function gridToWorld(gx, gy) {
  return { x: gx * GRID_SIZE + GRID_SIZE / 2, y: gy * GRID_SIZE + GRID_SIZE / 2 };
}

function nearestWalkableCell(x, y) {
  const start = worldToGrid(x, y);
  if (isWalkableCell(start.gx, start.gy)) return start;

  for (let radius = 1; radius <= 12; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const gx = start.gx + dx;
        const gy = start.gy + dy;
        if (isWalkableCell(gx, gy)) return { gx, gy };
      }
    }
  }
  return null;
}

function nearestWalkableCellInRegion(x, y, regionId, context = null) {
  const start = worldToGrid(x, y);
  if (isWalkableCellForRegion(start.gx, start.gy, regionId, context)) return start;

  for (let radius = 1; radius <= 12; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const gx = start.gx + dx;
        const gy = start.gy + dy;
        if (isWalkableCellForRegion(gx, gy, regionId, context)) return { gx, gy };
      }
    }
  }
  return null;
}

function getRouteCellKey(cell) {
  return `${cell?.gx ?? -1},${cell?.gy ?? -1}`;
}

function getWalkableCellCandidatesInRegion(x, y, regionId, context = null, maxRadius = ROUTE_CELL_FALLBACK_RADIUS, maxCandidates = ROUTE_CELL_FALLBACK_CANDIDATES) {
  const start = worldToGrid(x, y);
  const seen = new Set();
  const candidates = [];
  const addCandidate = (gx, gy, radius) => {
    if (gx < 0 || gy < 0 || gx >= GRID_COLS || gy >= GRID_ROWS) return;
    const key = `${gx},${gy}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!isWalkableCellForRegion(gx, gy, regionId, context)) return;
    const point = gridToWorld(gx, gy);
    candidates.push({
      gx,
      gy,
      radius,
      distance: Math.hypot(point.x - x, point.y - y),
    });
  };

  addCandidate(start.gx, start.gy, 0);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        addCandidate(start.gx + dx, start.gy + dy, radius);
      }
    }
  }

  return candidates
    .sort((a, b) => a.distance - b.distance || a.radius - b.radius)
    .slice(0, maxCandidates)
    .map(({ gx, gy }) => ({ gx, gy }));
}

function linePassable(a, b) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const steps = Math.max(2, Math.ceil(distance / 22));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!isWalkablePoint(x, y, 6)) return false;
  }
  return true;
}

function linePassableInRegion(a, b, regionId, context = null) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const steps = Math.max(2, Math.ceil(distance / 22));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!isRouteWalkablePointInRegion(x, y, regionId, context, 6)) return false;
  }
  return true;
}

function gridEdgePassable(cx, cy, nx, ny) {
  const currentIndex = cy * GRID_COLS + cx;
  const nextIndex = ny * GRID_COLS + nx;
  const key = currentIndex < nextIndex ? `${currentIndex}|${nextIndex}` : `${nextIndex}|${currentIndex}`;
  if (routeEdgePassableCache.has(key)) return routeEdgePassableCache.get(key);
  if (routeEdgePassableCache.size > 400000) routeEdgePassableCache.clear();
  const passable = linePassable(gridToWorld(cx, cy), gridToWorld(nx, ny));
  routeEdgePassableCache.set(key, passable);
  return passable;
}

function gridEdgePassableInRegion(cx, cy, nx, ny, regionId, context = null) {
  const currentIndex = cy * GRID_COLS + cx;
  const nextIndex = ny * GRID_COLS + nx;
  const baseKey = currentIndex < nextIndex ? `${currentIndex}|${nextIndex}` : `${nextIndex}|${currentIndex}`;
  const key = `${normalizeRegionId(regionId)}:${context?.cacheKey || "terrain"}:${baseKey}`;
  if (routeEdgePassableCache.has(key)) return routeEdgePassableCache.get(key);
  if (routeEdgePassableCache.size > 400000) routeEdgePassableCache.clear();
  const passable = linePassableInRegion(gridToWorld(cx, cy), gridToWorld(nx, ny), regionId, context);
  routeEdgePassableCache.set(key, passable);
  return passable;
}

class RoutePriorityQueue {
  constructor() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }

  push(index, f) {
    const item = { index, f };
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (!this.items.length) return null;
    const top = this.items[0];
    const end = this.items.pop();
    if (this.items.length && end) {
      this.items[0] = end;
      this.sinkDown(0);
    }
    return top;
  }

  bubbleUp(index) {
    const item = this.items[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex];
      if (item.f >= parent.f) break;
      this.items[parentIndex] = item;
      this.items[index] = parent;
      index = parentIndex;
    }
  }

  sinkDown(index) {
    const length = this.items.length;
    const item = this.items[index];
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let swapIndex = -1;

      if (leftIndex < length && this.items[leftIndex].f < item.f) {
        swapIndex = leftIndex;
      }
      if (rightIndex < length) {
        const right = this.items[rightIndex];
        const left = swapIndex === -1 ? item : this.items[leftIndex];
        if (right.f < left.f) swapIndex = rightIndex;
      }
      if (swapIndex === -1) break;
      this.items[index] = this.items[swapIndex];
      this.items[swapIndex] = item;
      index = swapIndex;
    }
  }
}

function findGridRouteInRegion(start, goal, startPoint, endPoint, normalizedRegionId, routeContext = null, searchBudget = null) {
  if (!start || !goal) return null;
  const budget = searchBudget || { visited: 0, max: ROUTE_SEARCH_MAX_VISITED_CELLS };
  const startIndex = start.gy * GRID_COLS + start.gx;
  const goalIndex = goal.gy * GRID_COLS + goal.gx;
  const open = new RoutePriorityQueue();
  open.push(startIndex, 0);
  const gScore = new Map([[startIndex, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];

  while (open.length) {
    const current = open.pop();
    if (!current || closed.has(current.index)) continue;
    if (budget.visited >= budget.max) return null;
    if (current.index === goalIndex) {
      const route = buildRouteFromCells(cameFrom, current.index, startPoint, endPoint, normalizedRegionId, routeContext);
      route.segments = [{ regionId: normalizedRegionId, points: route.points.map(point => ({ x: point.x, y: point.y })), length: route.length }];
      return route;
    }

    closed.add(current.index);
    budget.visited += 1;
    const cx = current.index % GRID_COLS;
    const cy = Math.floor(current.index / GRID_COLS);
    const currentG = gScore.get(current.index) || 0;

    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkableCellForRegion(nx, ny, normalizedRegionId, routeContext)) continue;
      if (dx && dy && (!isWalkableCellForRegion(cx + dx, cy, normalizedRegionId, routeContext) || !isWalkableCellForRegion(cx, cy + dy, normalizedRegionId, routeContext))) continue;
      if (!gridEdgePassableInRegion(cx, cy, nx, ny, normalizedRegionId, routeContext)) continue;
      const nextIndex = ny * GRID_COLS + nx;
      if (closed.has(nextIndex)) continue;
      const tentative = currentG + cost;
      if (tentative >= (gScore.get(nextIndex) ?? Infinity)) continue;
      cameFrom.set(nextIndex, current.index);
      gScore.set(nextIndex, tentative);
      const h = Math.hypot(goal.gx - nx, goal.gy - ny);
      open.push(nextIndex, tentative + h);
    }
  }

  return null;
}

function getRoutePointId(point, fallback = "point") {
  return point?.id || `${fallback}:${Math.round(Number(point?.x) || 0)},${Math.round(Number(point?.y) || 0)}`;
}

function makeRoutePoint(id, point) {
  return {
    id,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
  };
}

function reverseRoute(route) {
  const reversed = cloneRoute(route);
  reversed.points.reverse();
  if (Array.isArray(reversed.segments)) {
    reversed.segments.reverse();
    reversed.segments.forEach(segment => segment.points.reverse());
  }
  return reversed;
}

function isBitmapRouteWorkerJob(job = null) {
  return Boolean(job?.regions && Object.values(job.regions).some(region => region?.isBitmap));
}

function rejectPendingRouteWorkerRequests(error) {
  routeWorkerRequests.forEach(request => {
    window.clearTimeout(request.timeoutId);
    request.reject(error);
  });
  routeWorkerRequests.clear();
}

function cancelPendingRouteWorkerRequests(message = "Route calculation canceled.") {
  if (!routeWorkerRequests.size) return;
  const error = new Error(message);
  error.routeCanceled = true;
  rejectPendingRouteWorkerRequests(error);
  routeWorker?.terminate?.();
  routeWorker = null;
}

function getRouteWorker() {
  if (routeWorkerUnavailable || typeof Worker === "undefined") return null;
  if (routeWorker) return routeWorker;
  try {
    const workerUrl = new URL("route-worker.js", window.location.href);
    workerUrl.searchParams.set("v", APP_BUILD_ID || "dev");
    routeWorker = new Worker(workerUrl, { name: "crownlands-route-worker" });
    routeWorker.addEventListener("message", event => {
      const message = event.data || {};
      if (message.type !== "route") return;
      const request = routeWorkerRequests.get(message.id);
      if (!request) return;
      window.clearTimeout(request.timeoutId);
      routeWorkerRequests.delete(message.id);
      if (message.ok) request.resolve(message.route || null);
      else request.reject(new Error(message.error || "Route worker failed."));
    });
    routeWorker.addEventListener("error", event => {
      routeWorkerUnavailable = true;
      const error = new Error(event.message || "Route worker error.");
      rejectPendingRouteWorkerRequests(error);
      routeWorker?.terminate?.();
      routeWorker = null;
    });
    return routeWorker;
  } catch (error) {
    routeWorkerUnavailable = true;
    console.warn("Route worker unavailable; falling back to main-thread routing.", error);
    return null;
  }
}

function scheduleRouteWorkerWarmup() {
  if (routeWorker || routeWorkerUnavailable || routeWorkerWarmupScheduled || typeof Worker === "undefined") return;
  routeWorkerWarmupScheduled = true;
  const warmup = () => {
    routeWorkerWarmupScheduled = false;
    if (!state || routeWorker || routeWorkerUnavailable) return;
    const worker = getRouteWorker();
    worker?.postMessage?.({ type: "warmup" });
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warmup, { timeout: 2500 });
  } else {
    window.setTimeout(warmup, 1200);
  }
}

function requestRouteFromWorker(job) {
  const worker = getRouteWorker();
  if (!worker) return Promise.reject(new Error("Route worker unavailable."));
  const id = ++routeWorkerRequestId;
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const timeoutError = new Error("Route calculation timed out.");
      timeoutError.routeTimedOut = true;
      rejectPendingRouteWorkerRequests(timeoutError);
      routeWorker?.terminate?.();
      routeWorker = null;
    }, ROUTE_WORKER_TIMEOUT_MS);
    routeWorkerRequests.set(id, { resolve, reject, timeoutId });
    worker.postMessage({ type: "route", id, job });
  });
}

async function findRouteAsync(source, target) {
  const cacheKey = getAsyncRouteCacheKey(source, target);
  const cachedRoute = cacheKey ? asyncRouteCache.get(cacheKey) : null;
  if (cachedRoute?.points?.length) return cloneRoute(cachedRoute);
  const reverseKey = getAsyncRouteCacheKey(target, source);
  const cachedReverseRoute = reverseKey ? asyncRouteCache.get(reverseKey) : null;
  if (cachedReverseRoute?.points?.length) {
    const route = reverseRoute(cachedReverseRoute);
    cacheAsyncRoute(cacheKey, route);
    return route;
  }
  const job = buildRouteWorkerJob(source, target);
  if (!job) return findRoute(source, target);
  try {
    const workerRoute = await requestRouteFromWorker(job);
    if (!workerRoute?.points?.length) return null;
    cacheAsyncRoute(cacheKey, workerRoute);
    return cloneRoute(workerRoute);
  } catch (error) {
    if (error?.routeCanceled) return null;
    if (error?.routeTimedOut || isBitmapRouteWorkerJob(job)) {
      console.warn("Route worker failed; route calculation canceled to keep the map responsive.", error);
      return null;
    }
    console.warn("Route worker failed; falling back to main-thread routing.", error);
    return findRoute(source, target);
  }
}

function getAsyncRouteCacheKey(source, target) {
  if (!source || !target) return "";
  const sourceRegionId = getCityRegionId(source);
  const targetRegionId = getCityRegionId(target);
  return `${sourceRegionId}:${getRoutePointId(source, "source")}:${Math.round(Number(source.x) || 0)},${Math.round(Number(source.y) || 0)}|${targetRegionId}:${getRoutePointId(target, "target")}:${Math.round(Number(target.x) || 0)},${Math.round(Number(target.y) || 0)}`;
}

function cacheAsyncRoute(cacheKey, route) {
  if (!cacheKey || !route?.points?.length) return;
  asyncRouteCache.delete(cacheKey);
  asyncRouteCache.set(cacheKey, cloneRoute(route));
  while (asyncRouteCache.size > ASYNC_ROUTE_CACHE_LIMIT) {
    asyncRouteCache.delete(asyncRouteCache.keys().next().value);
  }
}

function buildRouteWorkerJob(source, target) {
  if (!source || !target) return null;
  const legs = buildRouteWorkerLegs(source, target);
  if (!legs?.length) return null;
  const regionIds = [...new Set(legs.map(leg => normalizeRegionId(leg.regionId)))];
  const regions = Object.fromEntries(regionIds.map(regionId => [regionId, getRouteWorkerRegionData(regionId)]));
  const obstaclesByRegion = getRouteWorkerObstaclesByRegion(regionIds);
  return {
    defaultRegionId: getActiveMapRegionId(),
    constants: {
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      gridSize: GRID_SIZE,
      fallbackRadius: ROUTE_CELL_FALLBACK_RADIUS,
      fallbackCandidates: ROUTE_CELL_FALLBACK_CANDIDATES,
      fallbackPairLimit: ROUTE_CELL_FALLBACK_PAIR_LIMIT,
      searchMaxVisitedCells: ROUTE_SEARCH_MAX_VISITED_CELLS,
    },
    regions,
    obstaclesByRegion,
    legs,
  };
}

function buildRouteWorkerLegs(source, target) {
  const sourceRegionId = getCityRegionId(source);
  const targetRegionId = getCityRegionId(target);
  if (sourceRegionId === targetRegionId) {
    return [{
      regionId: sourceRegionId,
      start: makeRoutePoint(getRoutePointId(source, "source"), source),
      end: makeRoutePoint(getRoutePointId(target, "target"), target),
    }];
  }

  const chain = getPortalRouteRegionChain(sourceRegionId, targetRegionId);
  if (!chain?.length) return null;
  let current = makeRoutePoint(getRoutePointId(source, "source"), source);
  const legs = [];
  for (let index = 0; index < chain.length; index += 1) {
    const regionId = chain[index];
    const isLastRegion = index === chain.length - 1;
    const nextRegionId = isLastRegion ? "" : chain[index + 1];
    const sourcePortal = isLastRegion ? null : getEditorPortalForRoute(regionId, nextRegionId);
    const portalExitPoint = isLastRegion ? null : getPortalWorldPoint(regionId, nextRegionId, sourcePortal ? { portal: sourcePortal } : {});
    if (!isLastRegion && !portalExitPoint) return null;
    const segmentEnd = isLastRegion
      ? makeRoutePoint(getRoutePointId(target, "target"), target)
      : makeRoutePoint(`portal:${regionId}->${nextRegionId}:${sourcePortal?.id || "default"}`, portalExitPoint);
    if (!segmentEnd || !Number.isFinite(segmentEnd.x) || !Number.isFinite(segmentEnd.y)) return null;
    legs.push({ regionId, start: current, end: segmentEnd });

    if (!isLastRegion) {
      const arrivalPortal = sourcePortal ? getLinkedEditorArrivalPortal(regionId, nextRegionId, sourcePortal) : null;
      if (sourcePortal && getEditorPortalLinkId(sourcePortal) && !arrivalPortal) return null;
      const arrivalPoint = getPortalWorldPoint(nextRegionId, regionId, arrivalPortal ? { portal: arrivalPortal } : {});
      if (!arrivalPoint) return null;
      current = makeRoutePoint(`portal:${nextRegionId}<-${regionId}:${arrivalPortal?.id || "default"}`, arrivalPoint);
    }
  }
  return legs;
}

function getRouteWorkerRegionData(regionId) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const cached = routeWorkerRegionDataCache.get(normalizedRegionId);
  if (cached) return cached;
  const region = getRegionById(normalizedRegionId) || {};
  const bounds = getIslandMapBounds(normalizedRegionId);
  const isBitmap = BITMAP_ISLAND_IDS.includes(normalizedRegionId);
  const terrainShapes = isBitmap
    ? IMAGE_TERRAIN_BLOCKERS[normalizedRegionId] || []
    : TERRAIN_BLOCKERS.filter(shape => normalizeRegionId(shape.regionId) === normalizedRegionId);
  const data = {
    id: normalizedRegionId,
    isBitmap,
    region: sanitizeRouteWorkerRegion(region),
    bounds: sanitizeRouteWorkerBounds(bounds),
    dimensions: sanitizeRouteWorkerDimensions(getIslandImageDimensions(normalizedRegionId)),
    landPolygon: getIslandLandPolygon(normalizedRegionId).map(point => ({
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
    })),
    terrainBlockers: terrainShapes.map(sanitizeRouteWorkerTerrainShape),
  };
  routeWorkerRegionDataCache.set(normalizedRegionId, data);
  return data;
}

function sanitizeRouteWorkerRegion(region = {}) {
  return {
    id: normalizeRegionId(region.id),
    x: Number(region.x) || 0,
    y: Number(region.y) || 0,
    rx: Number(region.rx) || 0,
    ry: Number(region.ry) || 0,
    rot: Number(region.rot) || 0,
  };
}

function sanitizeRouteWorkerBounds(bounds = {}) {
  return {
    left: Number(bounds.left) || 0,
    top: Number(bounds.top) || 0,
    right: Number(bounds.right) || 0,
    bottom: Number(bounds.bottom) || 0,
    width: Math.max(1, Number(bounds.width) || 1),
    height: Math.max(1, Number(bounds.height) || 1),
  };
}

function sanitizeRouteWorkerDimensions(dimensions = {}) {
  return {
    width: Math.max(1, Number(dimensions.width) || 1),
    height: Math.max(1, Number(dimensions.height) || 1),
  };
}

function sanitizeRouteWorkerTerrainShape(shape = {}) {
  return {
    x: Number(shape.x) || 0,
    y: Number(shape.y) || 0,
    rx: Math.max(1, Number(shape.rx) || 1),
    ry: Math.max(1, Number(shape.ry) || 1),
    rot: Number(shape.rot) || 0,
    cos: Number.isFinite(Number(shape.cos)) ? Number(shape.cos) : Math.cos(-(Number(shape.rot) || 0)),
    sin: Number.isFinite(Number(shape.sin)) ? Number(shape.sin) : Math.sin(-(Number(shape.rot) || 0)),
    type: String(shape.type || ""),
    regionId: normalizeRegionId(shape.regionId),
  };
}

function getRouteWorkerObstaclesByRegion(regionIds = []) {
  const regionSet = new Set(regionIds.map(normalizeRegionId));
  return Object.fromEntries([...regionSet].map(regionId => [
    regionId,
    getRouteObstacleTargetsForRegion(regionId).map(target => ({
      id: target.id,
      x: Number(target.x) || 0,
      y: Number(target.y) || 0,
      radius: getRouteObstacleRadius(target),
    })),
  ]));
}

function findRoute(source, target) {
  const sourceRegionId = getCityRegionId(source);
  const targetRegionId = getCityRegionId(target);
  if (sourceRegionId !== targetRegionId) return findPortalRoute(source, target, sourceRegionId, targetRegionId);
  return findLandRoute(source, target, sourceRegionId);
}

function findPortalRoute(source, target, sourceRegionId = getCityRegionId(source), targetRegionId = getCityRegionId(target)) {
  const normalizedSourceRegionId = normalizeRegionId(sourceRegionId);
  const normalizedTargetRegionId = normalizeRegionId(targetRegionId);
  const cacheKey = `edge-transition-cityblock-v1:${normalizedSourceRegionId}:${normalizedTargetRegionId}:${getRoutePointId(source, "source")}|${getRoutePointId(target, "target")}`;
  const reverseKey = `edge-transition-cityblock-v1:${normalizedTargetRegionId}:${normalizedSourceRegionId}:${getRoutePointId(target, "target")}|${getRoutePointId(source, "source")}`;
  if (routeCache.has(cacheKey)) return cloneRoute(routeCache.get(cacheKey));
  if (routeCache.has(reverseKey)) {
    const reverse = reverseRoute(routeCache.get(reverseKey));
    routeCache.set(cacheKey, cloneRoute(reverse));
    return reverse;
  }

  const chain = getPortalRouteRegionChain(normalizedSourceRegionId, normalizedTargetRegionId);
  if (!chain?.length) return null;
  let current = makeRoutePoint(getRoutePointId(source, "source"), source);
  const segments = [];
  const points = [];
  let length = 0;

  for (let index = 0; index < chain.length; index += 1) {
    const regionId = chain[index];
    const isLastRegion = index === chain.length - 1;
    const nextRegionId = isLastRegion ? "" : chain[index + 1];
    const sourcePortal = isLastRegion ? null : getEditorPortalForRoute(regionId, nextRegionId);
    const portalExitPoint = isLastRegion ? null : getPortalWorldPoint(regionId, nextRegionId, sourcePortal ? { portal: sourcePortal } : {});
    if (!isLastRegion && !portalExitPoint) return null;
    const segmentEnd = isLastRegion
      ? makeRoutePoint(getRoutePointId(target, "target"), target)
      : makeRoutePoint(`portal:${regionId}->${nextRegionId}:${sourcePortal?.id || "default"}`, portalExitPoint);
    if (!segmentEnd || !Number.isFinite(segmentEnd.x) || !Number.isFinite(segmentEnd.y)) return null;

    const route = findLandRoute(current, segmentEnd, regionId);
    if (!route?.points?.length) return null;
    const segment = {
      regionId,
      points: route.points.map(point => ({ x: point.x, y: point.y })),
      length: route.length,
    };
    segments.push(segment);
    length += route.length;
    if (!points.length) points.push(...segment.points);
    else points.push(...segment.points.slice(1));

    if (!isLastRegion) {
      const arrivalPortal = sourcePortal ? getLinkedEditorArrivalPortal(regionId, nextRegionId, sourcePortal) : null;
      if (sourcePortal && getEditorPortalLinkId(sourcePortal) && !arrivalPortal) return null;
      const arrivalPoint = getPortalWorldPoint(nextRegionId, regionId, arrivalPortal ? { portal: arrivalPortal } : {});
      if (!arrivalPoint) return null;
      current = makeRoutePoint(`portal:${nextRegionId}<-${regionId}:${arrivalPortal?.id || "default"}`, arrivalPoint);
    }
  }

  const route = { points, segments, length };
  routeCache.set(cacheKey, cloneRoute(route));
  return route;
}

function findLandRoute(source, target, regionId = getCityRegionId(source)) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const routeContext = createRouteContext(normalizedRegionId, source, target);
  return findLandRouteWithContext(source, target, normalizedRegionId, routeContext);
}

function findLandRouteWithContext(source, target, normalizedRegionId, routeContext = null) {
  const cacheKey = `land-cityblock-v2:${normalizedRegionId}:${routeContext?.cacheKey || "terrain"}:${getRoutePointId(source, "source")}|${getRoutePointId(target, "target")}`;
  if (routeCache.has(cacheKey)) return cloneRoute(routeCache.get(cacheKey));
  const contextReverseKey = `land-cityblock-v2:${normalizedRegionId}:${routeContext?.cacheKey || "terrain"}:${getRoutePointId(target, "target")}|${getRoutePointId(source, "source")}`;
  if (routeCache.has(contextReverseKey)) {
    const reverse = reverseRoute(routeCache.get(contextReverseKey));
    routeCache.set(cacheKey, cloneRoute(reverse));
    return reverse;
  }

  const startPoint = { x: source.x, y: source.y };
  const endPoint = { x: target.x, y: target.y };
  if (linePassableInRegion(startPoint, endPoint, normalizedRegionId, routeContext)) {
    const direct = {
      points: [startPoint, endPoint],
      segments: [{ regionId: normalizedRegionId, points: [startPoint, endPoint], length: Math.hypot(source.x - target.x, source.y - target.y) }],
      length: Math.hypot(source.x - target.x, source.y - target.y),
    };
    routeCache.set(cacheKey, cloneRoute(direct));
    return direct;
  }

  const start = nearestWalkableCellInRegion(source.x, source.y, normalizedRegionId, routeContext);
  const goal = nearestWalkableCellInRegion(target.x, target.y, normalizedRegionId, routeContext);
  const triedCellPairs = new Set();
  const searchBudget = { visited: 0, max: ROUTE_SEARCH_MAX_VISITED_CELLS };
  const commitRoute = route => {
    if (!route) return null;
    routeCache.set(cacheKey, cloneRoute(route));
    return route;
  };
  const tryCells = (candidateStart, candidateGoal) => {
    if (!candidateStart || !candidateGoal) return null;
    const pairKey = `${getRouteCellKey(candidateStart)}|${getRouteCellKey(candidateGoal)}`;
    if (triedCellPairs.has(pairKey)) return null;
    triedCellPairs.add(pairKey);
    return findGridRouteInRegion(candidateStart, candidateGoal, startPoint, endPoint, normalizedRegionId, routeContext, searchBudget);
  };

  const primaryRoute = tryCells(start, goal);
  if (primaryRoute) return commitRoute(primaryRoute);

  const startCandidates = getWalkableCellCandidatesInRegion(source.x, source.y, normalizedRegionId, routeContext);
  const goalCandidates = getWalkableCellCandidatesInRegion(target.x, target.y, normalizedRegionId, routeContext);
  for (const startCandidate of startCandidates) {
    const route = tryCells(startCandidate, goal);
    if (route) return commitRoute(route);
  }
  for (const goalCandidate of goalCandidates) {
    const route = tryCells(start, goalCandidate);
    if (route) return commitRoute(route);
  }

  let pairAttempts = 0;
  for (const startCandidate of startCandidates) {
    for (const goalCandidate of goalCandidates) {
      if (pairAttempts >= ROUTE_CELL_FALLBACK_PAIR_LIMIT) return null;
      pairAttempts += 1;
      const route = tryCells(startCandidate, goalCandidate);
      if (route) return commitRoute(route);
    }
  }

  return null;
}

function buildRouteFromCells(cameFrom, currentIndex, startPoint, endPoint, regionId = "", context = null) {
  const cells = [];
  let current = currentIndex;
  cells.push(current);
  while (cameFrom.has(current)) {
    current = cameFrom.get(current);
    cells.push(current);
  }
  cells.reverse();

  let points = [startPoint, ...cells.map(index => gridToWorld(index % GRID_COLS, Math.floor(index / GRID_COLS))), endPoint];
  points = simplifyRoute(points, regionId, context);
  return { points, length: routeLength(points) };
}

function simplifyRoute(points, regionId = "", context = null) {
  if (points.length <= 2) return points;
  const simplified = [points[0]];
  let anchor = 0;
  const normalizedRegionId = regionId ? normalizeRegionId(regionId) : "";

  while (anchor < points.length - 1) {
    let next = points.length - 1;
    while (next > anchor + 1) {
      const passable = normalizedRegionId
        ? linePassableInRegion(points[anchor], points[next], normalizedRegionId, context)
        : linePassable(points[anchor], points[next]);
      if (passable) break;
      next--;
    }
    simplified.push(points[next]);
    anchor = next;
  }
  return simplified;
}

function routeLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

function cloneRoute(route) {
  return {
    length: route.length,
    points: route.points.map(point => ({ x: point.x, y: point.y })),
    segments: Array.isArray(route.segments)
      ? route.segments.map(segment => ({
          regionId: normalizeRegionId(segment.regionId),
          length: Number(segment.length) || routeLength(segment.points || []),
          points: (segment.points || []).map(point => ({ x: point.x, y: point.y })),
        }))
      : undefined,
  };
}

function pointAlongRoute(points, progress) {
  if (!Array.isArray(points) || points.length < 2) return { x: 0, y: 0 };
  const metrics = getPathMetrics(points);
  let wanted = metrics.total * clamp(progress, 0, 1);
  for (const segment of metrics.segments) {
    if (wanted <= segment.length) {
      const t = segment.length <= 0 ? 0 : wanted / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        y: segment.from.y + (segment.to.y - segment.from.y) * t,
      };
    }
    wanted -= segment.length;
  }
  return points[points.length - 1];
}

function getPathMetrics(points) {
  const cached = pathMetricCache.get(points);
  if (cached) return cached;
  let total = 0;
  const segments = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    total += length;
    segments.push({ from, to, length });
  }
  const metrics = { total, segments };
  pathMetricCache.set(points, metrics);
  return metrics;
}

function frame(now) {
  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  const dt = Math.min(rawDt, 0.25);
  renderableArmiesFrameCacheActive = true;
  renderableArmiesFrameCache = null;
  samplePerformancePanel(now);
  updateDeploymentCheck(dt);

  if (state && !isGamePausedByOutcome()) {
    simulationUpdateAccumulatorMs = Math.min(
      250,
      simulationUpdateAccumulatorMs + dt * 1000
    );
    if (simulationUpdateAccumulatorMs >= SIMULATION_UPDATE_INTERVAL_MS) {
      updateGame(simulationUpdateAccumulatorMs / 1000);
      simulationUpdateAccumulatorMs = 0;
    }
    saveTimer += dt;
    if (saveTimer >= SAVE_EVERY_SECONDS) {
      saveTimer = 0;
      if (!usesServerEconomyAuthority()) saveGame();
    }
    if (onlineSaveQueued) {
      onlineSaveTimer += dt;
      if (onlineSaveTimer >= ONLINE_SAVE_SECONDS) {
        onlineSaveTimer = 0;
        flushOnlineSave();
      }
    }
    if (isOnlineWorldActive()) {
      onlineCitySyncTimer += dt;
      if (onlineCitySyncTimer >= ONLINE_CITY_SYNC_SECONDS) {
        onlineCitySyncTimer = 0;
        syncOwnedCitiesToOnline();
      }
      if (usesServerEconomyAuthority()) {
        serverEconomySyncTimer += dt;
        if (serverEconomySyncTimer >= SERVER_ECONOMY_SYNC_SECONDS) {
          serverEconomySyncTimer = 0;
          refreshServerEconomy();
        }
      }
      onlinePresenceTimer += dt;
      if (onlinePresenceTimer >= ONLINE_PRESENCE_SECONDS) {
        onlinePresenceTimer = 0;
        publishOnlinePresence();
      }
      leaderboardSaveTimer += dt;
      if (leaderboardSaveTimer >= LEADERBOARD_SAVE_SECONDS) {
        leaderboardSaveTimer = 0;
        publishKingPowerLeaderboard();
      }
      overdueArmyResolveTimer += dt;
      if (overdueArmyResolveTimer >= ONLINE_ARMY_RESOLVE_RETRY_SECONDS) {
        overdueArmyResolveTimer = 0;
        recoverPendingOnlineArmyMovements();
        retryOverdueOnlineArmyResolutions();
      }
    }
  } else {
    simulationUpdateAccumulatorMs = 0;
  }

  if (state) {
    if (hasRenderableArmyWork() && now - lastArmyRenderTime > ARMY_RENDER_INTERVAL_MS) {
      renderArmies();
    }
    if (now - lastCityDynamicTextTime > CITY_DYNAMIC_TEXT_INTERVAL_MS) {
      lastCityDynamicTextTime = now;
      updateVisibleCityDynamicText();
    }
    if (now - lastHudRenderTime > HUD_RENDER_INTERVAL_MS) {
      lastHudRenderTime = now;
      renderHud();
    }
    if (now - lastHudStatusRenderTime > HUD_STATUS_RENDER_INTERVAL_MS) {
      lastHudStatusRenderTime = now;
      renderHudStatusPanels();
    }
    if (now - lastRenderTime > MAP_RENDER_INTERVAL_MS && now >= interactionRenderLockUntil) {
      lastRenderTime = now;
      renderPaths();
      renderCities();
      renderPanel();
    }
  }

  renderableArmiesFrameCacheActive = false;
  renderableArmiesFrameCache = null;
  requestAnimationFrame(frame);
}

function updateGame(dt) {
  state.gameSeconds += dt;
  updateEconomy(dt);
  updateHarvestBonuses(dt);
  updateAttacks(dt);
  checkGameOver();
}

function updateEconomy(dt) {
  if (usesServerEconomyAuthority()) return;
  for (const city of state.cities) {
    if (city.owner === "neutral") continue;
    if (isOnlineWorldActive() && city.owner !== "player") continue;
    const stats = getCityStats(city);
    const growth = stats.troopProductionPerSecond;
    city.troopFloat += growth * dt;
    city.troops = Math.floor(city.troopFloat);
  }

  const goldPerSecond = getGoldPerSecond();
  state.gold += goldPerSecond * dt;
}

function getGoldPerSecond(options = {}) {
  return playerCities().reduce((sum, city) => sum + getCityStats(city, options).goldProductionPerSecond, 0);
}

function getTroopProductionPerSecond() {
  return playerCities().reduce((sum, city) => sum + getCityStats(city).troopProductionPerSecond, 0);
}

function getHarvestBonusGoldReward() {
  const passiveGold = Math.floor(getGoldPerSecond({ includeTimedItemBoosts: false }) * HARVEST_BONUS_GOLD_SECONDS);
  return Math.max(HARVEST_BONUS_MIN_GOLD, passiveGold);
}

function getHarvestBonusTroopReward() {
  const passiveTroopsPerSecond = playerCities().reduce(
    (sum, city) => sum + getCityStats(city, { includeTimedItemBoosts: false }).troopProductionPerSecond,
    0
  );
  const passiveTroops = Math.floor(passiveTroopsPerSecond * HARVEST_BONUS_TROOP_SECONDS);
  return clamp(Math.max(HARVEST_BONUS_MIN_TROOPS, passiveTroops), HARVEST_BONUS_MIN_TROOPS, HARVEST_BONUS_MAX_TROOPS);
}

function getHarvestBonusIcon(type) {
  return normalizeHarvestBonusType(type) === "troops"
    ? `<img class="harvest-bonus-icon" src="${TROOP_PICKUP_ICON_SRC}" alt="" draggable="false">`
    : `<img class="harvest-bonus-icon" src="${GOLD_PICKUP_ICON_SRC}" alt="" draggable="false">`;
}

function getHarvestBonusDailyLimit(type) {
  return normalizeHarvestBonusType(type) === "troops"
    ? HARVEST_BONUS_DAILY_TROOP_LIMIT
    : HARVEST_BONUS_DAILY_GOLD_LIMIT;
}

function getHarvestBonusDailyCount(type, daily = ensureDailyCaptureTracker()) {
  return normalizeHarvestBonusType(type) === "troops"
    ? Math.max(0, Math.floor(Number(daily.harvestedTroopBonuses) || 0))
    : Math.max(0, Math.floor(Number(daily.harvestedGoldBonuses) || 0));
}

function getHarvestBonusRemaining(type, daily = ensureDailyCaptureTracker()) {
  const normalizedType = normalizeHarvestBonusType(type);
  const typeRemaining = getHarvestBonusDailyLimit(normalizedType) - getHarvestBonusDailyCount(normalizedType, daily);
  const totalRemaining = HARVEST_BONUS_DAILY_LIMIT - Math.max(0, Math.floor(Number(daily.harvestedBonuses) || 0));
  return Math.max(0, Math.min(typeRemaining, totalRemaining));
}

function canHarvestBonusType(type, daily = ensureDailyCaptureTracker()) {
  return getHarvestBonusRemaining(type, daily) > 0;
}

function getAlternateHarvestBonusType(type) {
  return normalizeHarvestBonusType(type) === "troops" ? "gold" : "troops";
}

function getNextAvailableHarvestBonusType(daily = ensureDailyCaptureTracker()) {
  const preferred = normalizeHarvestBonusType(state?.harvestNextBonusType);
  if (canHarvestBonusType(preferred, daily)) return preferred;
  const alternate = getAlternateHarvestBonusType(preferred);
  return canHarvestBonusType(alternate, daily) ? alternate : "";
}

function incrementHarvestBonusDailyCount(type, daily = ensureDailyCaptureTracker()) {
  const normalizedType = normalizeHarvestBonusType(type);
  if (normalizedType === "troops") {
    daily.harvestedTroopBonuses = clamp(
      Math.floor(Number(daily.harvestedTroopBonuses) || 0) + 1,
      0,
      HARVEST_BONUS_DAILY_TROOP_LIMIT,
    );
  } else {
    daily.harvestedGoldBonuses = clamp(
      Math.floor(Number(daily.harvestedGoldBonuses) || 0) + 1,
      0,
      HARVEST_BONUS_DAILY_GOLD_LIMIT,
    );
  }
  daily.harvestedBonuses = clamp(
    Math.floor(Number(daily.harvestedGoldBonuses) || 0) + Math.floor(Number(daily.harvestedTroopBonuses) || 0),
    0,
    HARVEST_BONUS_DAILY_LIMIT,
  );
  return daily.harvestedBonuses;
}

function getHarvestBonusTroopTargetCity() {
  return getMainRewardCity() || playerCities().find(city => getCityRegionId(city) === getActiveMapRegionId()) || playerCities()[0] || null;
}

function getActiveHarvestBonuses(regionId = getActiveMapRegionId()) {
  const activeRegionId = normalizeRegionId(regionId);
  return getAllActiveHarvestBonuses()
    .filter(bonus => normalizeRegionId(bonus.regionId) === activeRegionId);
}

function getAllActiveHarvestBonuses() {
  return normalizeHarvestBonuses(state?.harvestBonuses || []);
}

function hasAnyActiveHarvestBonus() {
  return getAllActiveHarvestBonuses().length >= HARVEST_BONUS_MAX_ACTIVE_PER_PLAYER;
}

function enforceHarvestBonusActiveLimit(bonuses) {
  return normalizeHarvestBonuses(bonuses)
    .sort((a, b) => (b.createdAtMs || b.createdAt) - (a.createdAtMs || a.createdAt))
    .slice(0, HARVEST_BONUS_MAX_ACTIVE_PER_PLAYER)
    .sort((a, b) => (a.createdAtMs || a.createdAt) - (b.createdAtMs || b.createdAt));
}

function getHarvestBonusOwnedCityAnchors(regionId) {
  const activeRegionId = normalizeRegionId(regionId);
  if (!state || !Array.isArray(state.cities)) return [];
  return state.cities
    .filter(city => city.owner === "player" && !isStronghold(city) && getCityRegionId(city) === activeRegionId);
}

function isHarvestBonusNearOwnedCity(x, y, regionId) {
  return getHarvestBonusOwnedCityAnchors(regionId)
    .some(city => Math.hypot(city.x - x, city.y - y) <= HARVEST_BONUS_CITY_SPAWN_MAX_DISTANCE);
}

function pruneExpiredHarvestBonuses() {
  if (!state) return;
  const now = Math.max(0, Number(state.gameSeconds) || 0);
  const activeRegionId = getActiveMapRegionId();
  const before = state.harvestBonuses?.length || 0;
  state.harvestBonuses = normalizeHarvestBonuses(state.harvestBonuses)
    .filter(bonus => (
      (bonus.createdAtMs
        ? Date.now() - bonus.createdAtMs <= HARVEST_BONUS_EXPIRE_SECONDS * 1000
        : now - bonus.createdAt <= HARVEST_BONUS_EXPIRE_SECONDS)
      && (
        normalizeRegionId(bonus.regionId) !== activeRegionId
        || (
          isHarvestBonusTerrainSafePoint(bonus.x, bonus.y, bonus.regionId)
          && isHarvestBonusNearOwnedCity(bonus.x, bonus.y, bonus.regionId)
        )
      )
    ));
  state.harvestBonuses = enforceHarvestBonusActiveLimit(state.harvestBonuses);
  if (state.harvestBonuses.length !== before) renderHarvestBonuses();
}

function getHarvestBonusCityClearance(city) {
  if (isStronghold(city)) {
    return Math.max(HARVEST_BONUS_CITY_CLEARANCE, getStrongholdVisualSize(city) * 0.65 + HARVEST_BONUS_STRONGHOLD_CLEARANCE_EXTRA);
  }
  return HARVEST_BONUS_CITY_CLEARANCE;
}

function getHarvestBonusCampClearance(camp) {
  const size = readVisualSize(camp?.size, DEFAULT_CAMP_VISUAL_SIZE);
  return Math.max(HARVEST_BONUS_CITY_CLEARANCE, size * 0.65 + HARVEST_BONUS_CAMP_CLEARANCE_EXTRA);
}

function isHarvestBonusFarFromCities(x, y, regionId) {
  return state.cities
    .filter(city => getCityRegionId(city) === regionId)
    .every(city => Math.hypot(city.x - x, city.y - y) >= getHarvestBonusCityClearance(city));
}

function isHarvestBonusFarFromCamps(x, y, regionId) {
  const activeRegionId = normalizeRegionId(regionId);
  return WORLD_CAMPS
    .filter(camp => normalizeRegionId(camp.regionId) === activeRegionId)
    .every(camp => Math.hypot(camp.x - x, camp.y - y) >= getHarvestBonusCampClearance(camp));
}

function isHarvestBonusFarFromTransitions(x, y, regionId) {
  const activeRegionId = getActiveMapRegionId();
  if (normalizeRegionId(regionId) !== activeRegionId) return true;
  return getActiveIslandTeleporters()
    .every(teleport => Math.hypot(teleport.worldPoint.x - x, teleport.worldPoint.y - y) >= HARVEST_BONUS_TRANSITION_CLEARANCE);
}

function isHarvestBonusFarFromOtherPickups(x, y, regionId) {
  return getActiveHarvestBonuses(regionId)
    .every(bonus => Math.hypot(bonus.x - x, bonus.y - y) >= HARVEST_BONUS_PICKUP_CLEARANCE);
}

function getHarvestBonusLandSampleOffsets(radius = HARVEST_BONUS_LAND_CLEARANCE) {
  const diagonal = radius * 0.707;
  const half = radius * 0.5;
  return [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [diagonal, diagonal],
    [-diagonal, diagonal],
    [diagonal, -diagonal],
    [-diagonal, -diagonal],
    [half, 0],
    [-half, 0],
    [0, half],
    [0, -half],
  ];
}

function isHarvestBonusFullyOnLand(x, y, regionId) {
  const activeRegionId = normalizeRegionId(regionId);
  for (const [dx, dy] of getHarvestBonusLandSampleOffsets()) {
    const sampleX = x + dx;
    const sampleY = y + dy;
    if (!isRegionLandPoint(sampleX, sampleY, activeRegionId, 0)) return false;
    if (!isRegionWalkablePoint(sampleX, sampleY, activeRegionId, 0)) return false;
  }
  return true;
}

function isHarvestBonusTerrainSafePoint(x, y, regionId) {
  const activeRegionId = normalizeRegionId(regionId);
  if (!isHarvestBonusFullyOnLand(x, y, activeRegionId)) return false;
  if (!isRegionWalkablePoint(x, y, activeRegionId, HARVEST_BONUS_TERRAIN_PADDING)) return false;
  if (!isValidCityPlacementPoint(x, y)) return false;
  return true;
}

function isValidHarvestBonusPoint(x, y, regionId) {
  const activeRegionId = normalizeRegionId(regionId);
  if (!isHarvestBonusNearOwnedCity(x, y, activeRegionId)) return false;
  if (!isHarvestBonusTerrainSafePoint(x, y, activeRegionId)) return false;
  if (!isHarvestBonusFarFromCities(x, y, activeRegionId)) return false;
  if (!isHarvestBonusFarFromCamps(x, y, activeRegionId)) return false;
  if (!isHarvestBonusFarFromTransitions(x, y, activeRegionId)) return false;
  if (!isHarvestBonusFarFromOtherPickups(x, y, activeRegionId)) return false;
  return true;
}

function createHarvestBonusPoint(regionId) {
  const activeRegionId = normalizeRegionId(regionId);
  const anchors = getHarvestBonusOwnedCityAnchors(activeRegionId);
  if (!anchors.length) return null;
  const radiusRange = HARVEST_BONUS_CITY_SPAWN_MAX_DISTANCE - HARVEST_BONUS_CITY_SPAWN_MIN_DISTANCE;
  for (let attempt = 0; attempt < 900; attempt += 1) {
    const city = anchors[Math.floor(Math.random() * anchors.length)];
    const angle = Math.random() * Math.PI * 2;
    const radius = HARVEST_BONUS_CITY_SPAWN_MIN_DISTANCE + Math.random() * Math.max(1, radiusRange);
    const x = city.x + Math.cos(angle) * radius;
    const y = city.y + Math.sin(angle) * radius;
    if (isValidHarvestBonusPoint(x, y, activeRegionId)) return { x, y };
  }
  return null;
}

function getHarvestSpawnDelaySeconds() {
  if (!state) return HARVEST_BONUS_INITIAL_SPAWN_SECONDS;
  const nextSpawnAtMs = normalizeTimestampMs(state.harvestNextSpawnAtMs);
  if (!nextSpawnAtMs) {
    const timer = Number(state.harvestSpawnTimer);
    return Number.isFinite(timer)
      ? clamp(Math.ceil(timer), 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS)
      : HARVEST_BONUS_INITIAL_SPAWN_SECONDS;
  }
  return clamp(Math.ceil(Math.max(0, nextSpawnAtMs - Date.now()) / 1000), 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS);
}

function setHarvestSpawnDelay(seconds = HARVEST_BONUS_SPAWN_INTERVAL_SECONDS) {
  if (!state) return;
  const delay = clamp(Math.ceil(Number(seconds) || 0), 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS);
  state.harvestSpawnTimer = delay;
  state.harvestNextSpawnAtMs = Date.now() + delay * 1000;
}

function createHarvestBonusRecord(regionId, type, point) {
  const activeRegionId = normalizeRegionId(regionId);
  const bonusType = normalizeHarvestBonusType(type);
  return {
    id: `harvest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: bonusType,
    regionId: activeRegionId,
    x: Math.round(point.x),
    y: Math.round(point.y),
    createdAt: Math.max(0, Number(state?.gameSeconds) || 0),
    createdAtMs: Date.now(),
  };
}

function spawnHarvestBonus(regionId = getActiveMapRegionId(), type = getNextAvailableHarvestBonusType()) {
  if (!state) return false;
  const daily = ensureDailyCaptureTracker();
  const bonusType = normalizeHarvestBonusType(type);
  if (!canHarvestBonusType(bonusType, daily)) return false;
  const activeRegionId = normalizeRegionId(regionId);
  if (hasAnyActiveHarvestBonus()) return false;
  const point = createHarvestBonusPoint(activeRegionId);
  if (!point) return false;
  state.harvestBonuses = normalizeHarvestBonuses(state.harvestBonuses);
  state.harvestBonuses.push(createHarvestBonusRecord(activeRegionId, bonusType, point));
  state.harvestBonuses = enforceHarvestBonusActiveLimit(state.harvestBonuses);
  return true;
}

function updateServerHarvestBonuses() {
  if (!state || harvestSpawnRequestInFlight) return;
  const api = getOnlineApi();
  if (!api?.reserveHarvestBonusSpawn) return;
  const daily = ensureDailyCaptureTracker();
  const activeBonus = getAllActiveHarvestBonuses()[0] || null;
  if (activeBonus) {
    const activeRegionId = getActiveMapRegionId();
    if (normalizeRegionId(activeBonus.regionId) === activeRegionId) {
      harvestRelocationRetryAtMs = 0;
      return;
    }
    if (Date.now() < harvestRelocationRetryAtMs) return;
    const point = createHarvestBonusPoint(activeRegionId);
    if (!point) {
      harvestRelocationRetryAtMs = Date.now() + HARVEST_BONUS_SERVER_RETRY_SECONDS * 1000;
      return;
    }
    const relocatedBonus = {
      ...activeBonus,
      regionId: activeRegionId,
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
    harvestSpawnRequestInFlight = true;
    api.reserveHarvestBonusSpawn({
      relocateActive: true,
      activeBonusId: activeBonus.id,
      type: activeBonus.type,
      regionId: activeRegionId,
      daily: normalizeDailyCaptureTracker(daily),
      bonus: relocatedBonus,
    }).then(result => {
      applyServerEconomyResult(result);
      if (result?.relocated || result?.spawned) renderHarvestBonuses();
      harvestRelocationRetryAtMs = 0;
    }).catch(error => {
      console.warn("Could not move harvest pickup to the current map", error);
      harvestRelocationRetryAtMs = Date.now() + HARVEST_BONUS_SERVER_RETRY_SECONDS * 1000;
    }).finally(() => {
      harvestSpawnRequestInFlight = false;
    });
    return;
  }
  harvestRelocationRetryAtMs = 0;
  if (daily.harvestedBonuses >= HARVEST_BONUS_DAILY_LIMIT) return;
  const nextType = getNextAvailableHarvestBonusType(daily);
  if (!nextType) return;
  if (hasAnyActiveHarvestBonus()) return;
  const delay = getHarvestSpawnDelaySeconds();
  state.harvestSpawnTimer = delay;
  if (delay > 0) return;

  const activeRegionId = getActiveMapRegionId();
  const point = createHarvestBonusPoint(activeRegionId);
  if (!point) {
    setHarvestSpawnDelay(HARVEST_BONUS_SERVER_RETRY_SECONDS);
    return;
  }
  const bonus = createHarvestBonusRecord(activeRegionId, nextType, point);
  harvestSpawnRequestInFlight = true;
  api.reserveHarvestBonusSpawn({
    type: nextType,
    regionId: activeRegionId,
    daily: normalizeDailyCaptureTracker(daily),
    bonus,
  }).then(result => {
    applyServerEconomyResult(result);
    if (result?.spawned) renderHarvestBonuses();
  }).catch(error => {
    console.warn("Could not reserve harvest pickup spawn", error);
    setHarvestSpawnDelay(HARVEST_BONUS_SERVER_RETRY_SECONDS);
  }).finally(() => {
    harvestSpawnRequestInFlight = false;
  });
}

function updateHarvestBonuses(dt) {
  if (!state || isGamePausedByOutcome() || onlineWorldLoading) return;
  const daily = ensureDailyCaptureTracker();
  pruneExpiredHarvestBonuses();
  if (usesServerEconomyAuthority()) {
    updateServerHarvestBonuses();
    return;
  }
  const activeBonus = getAllActiveHarvestBonuses()[0] || null;
  if (activeBonus) {
    const activeRegionId = getActiveMapRegionId();
    if (normalizeRegionId(activeBonus.regionId) !== activeRegionId && Date.now() >= harvestRelocationRetryAtMs) {
      const point = createHarvestBonusPoint(activeRegionId);
      if (point) {
        state.harvestBonuses = normalizeHarvestBonuses(state.harvestBonuses).map(bonus => (
          bonus.id === activeBonus.id
            ? { ...bonus, regionId: activeRegionId, x: Math.round(point.x), y: Math.round(point.y) }
            : bonus
        ));
        harvestRelocationRetryAtMs = 0;
        renderHarvestBonuses();
      } else {
        harvestRelocationRetryAtMs = Date.now() + HARVEST_BONUS_SERVER_RETRY_SECONDS * 1000;
      }
    }
    return;
  }
  harvestRelocationRetryAtMs = 0;
  if (daily.harvestedBonuses >= HARVEST_BONUS_DAILY_LIMIT) return;
  const nextType = getNextAvailableHarvestBonusType(daily);
  if (!nextType) return;
  if (hasAnyActiveHarvestBonus()) return;
  const activeRegionId = getActiveMapRegionId();
  state.harvestSpawnTimer = Math.max(0, Number(state.harvestSpawnTimer) || 0) - dt;
  state.harvestNextSpawnAtMs = Date.now() + state.harvestSpawnTimer * 1000;
  if (state.harvestSpawnTimer > 0) return;
  const spawned = spawnHarvestBonus(activeRegionId, nextType);
  setHarvestSpawnDelay(HARVEST_BONUS_SPAWN_INTERVAL_SECONDS);
  if (spawned) {
    state.harvestNextBonusType = getAlternateHarvestBonusType(nextType);
    renderHarvestBonuses();
  }
}

function resetHarvestSpawnTimer() {
  if (!state) return;
  setHarvestSpawnDelay(HARVEST_BONUS_SPAWN_INTERVAL_SECONDS);
}

async function collectHarvestBonus(bonusId) {
  if (!state || isGamePausedByOutcome()) return;
  const pendingId = String(bonusId || "");
  if (pendingHarvestBonusIds.has(pendingId)) return;
  state.harvestBonuses = normalizeHarvestBonuses(state.harvestBonuses);
  const index = state.harvestBonuses.findIndex(bonus => bonus.id === bonusId);
  if (index < 0) return;
  const bonus = state.harvestBonuses[index];
  const type = normalizeHarvestBonusType(bonus.type);
  const daily = ensureDailyCaptureTracker();
  if (!canHarvestBonusType(type, daily)) {
    showToast(`Daily ${type === "troops" ? "troop" : "gold"} harvest limit reached.`);
    return;
  }
  state.harvestBonuses.splice(index, 1);

  if (usesServerEconomyAuthority()) {
    const api = getOnlineApi();
    if (!api?.collectHarvestBonus) {
      state.harvestBonuses.splice(index, 0, bonus);
      showToast("Pickup collection needs the server update. Reload and try again.");
      renderHarvestBonuses();
      return;
    }

    pendingHarvestBonusIds.add(pendingId);
    renderHarvestBonuses();
    showToast(`Collecting ${type === "troops" ? "troops" : "gold"}...`);
    try {
      const result = await api.collectHarvestBonus({
        bonusId: bonus.id,
        type,
        regionId: normalizeRegionId(bonus.regionId),
        daily: normalizeDailyCaptureTracker(daily),
      });
      applyServerEconomyResult(result, { renderCities: false });
      const reward = Math.max(0, Math.floor(Number(result?.reward) || 0));
      const serverDaily = normalizeDailyCaptureTracker(result?.currentUser?.daily || state.daily);
      renderPanel();
      if (type === "troops") {
        const targetName = result?.targetCityName || getHarvestBonusTroopTargetCity()?.name || "main city";
        addLog(`Harvested stored troop production: ${formatNumber(reward)} troops to ${targetName}.`);
        showToast(`Harvested +${formatNumber(reward)} troops (${formatNumber(serverDaily.harvestedTroopBonuses)}/${HARVEST_BONUS_DAILY_TROOP_LIMIT})`);
      } else {
        showToast(`Harvested +${formatNumber(reward)} gold (${formatNumber(serverDaily.harvestedGoldBonuses)}/${HARVEST_BONUS_DAILY_GOLD_LIMIT})`);
      }
    } catch (error) {
      state.harvestBonuses = normalizeHarvestBonuses(state.harvestBonuses);
      if (!state.harvestBonuses.some(item => item.id === bonus.id)) {
        state.harvestBonuses.splice(Math.min(index, state.harvestBonuses.length), 0, bonus);
      }
      onlineLastError = error?.message || String(error);
      console.warn("Could not collect harvest bonus", error);
      renderHarvestBonuses();
      showToast(onlineLastError || "Could not collect pickup.");
    } finally {
      pendingHarvestBonusIds.delete(pendingId);
    }
    return;
  }

  if (type === "troops") {
    const troopReward = getHarvestBonusTroopReward();
    const rewardCity = getHarvestBonusTroopTargetCity();
    if (!rewardCity) {
      showToast("Claim a city before collecting troop bonuses.");
      state.harvestBonuses.splice(index, 0, bonus);
      return;
    }
    rewardCity.troopFloat = Math.max(0, Number(rewardCity.troopFloat) || rewardCity.troops || 0) + troopReward;
    rewardCity.troops = Math.floor(rewardCity.troopFloat);
    markOwnedCityChanged(rewardCity, getCityRegionId(rewardCity) === getActiveOnlineRegionId());
    incrementHarvestBonusDailyCount(type, daily);
    resetHarvestSpawnTimer();
    addLog(`Harvested stored troop production: ${formatNumber(troopReward)} troops to ${rewardCity.name}.`);
    saveGame();
    renderHud();
    renderCities();
    renderPanel();
    renderHarvestBonuses();
    showToast(`Harvested +${formatNumber(troopReward)} troops (${formatNumber(daily.harvestedTroopBonuses)}/${HARVEST_BONUS_DAILY_TROOP_LIMIT})`);
    return;
  }

  const goldReward = getHarvestBonusGoldReward();
  state.gold += goldReward;
  incrementHarvestBonusDailyCount(type, daily);
  resetHarvestSpawnTimer();
  saveGame();
  renderHud();
  renderHarvestBonuses();
  showToast(`Harvested +${formatNumber(goldReward)} gold (${formatNumber(daily.harvestedGoldBonuses)}/${HARVEST_BONUS_DAILY_GOLD_LIMIT})`);
}

function getOfflineProgressSeconds(snapshot = state) {
  const lastRealTimeMs = Math.max(0, Number(snapshot?.lastRealTimeMs) || 0);
  if (!lastRealTimeMs) return 0;
  const elapsed = (Date.now() - lastRealTimeMs) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 10) return 0;
  return clamp(elapsed, 0, MAX_OFFLINE_PROGRESS_SECONDS);
}

function createOfflineProductionSnapshot(snapshot = state) {
  if (!snapshot || !Array.isArray(snapshot.cities)) return [];
  const sourceCities = snapshot === state
    ? getAllOwnedCitiesForDisplay()
    : snapshot.cities.filter(city => city.owner === "player");
  return sourceCities
    .map(city => ({
      id: city.id,
      name: getCanonicalCityName(city),
      owner: "player",
      ownerKind: "player",
      ownerUid: city.ownerUid || getCurrentOnlineUid() || null,
      ownerName: city.ownerName || state?.playerName || "",
      ownerFlag: city.ownerFlag || state?.flag || null,
      regionId: city.regionId || city.startPool || getCityRegionId(city),
      level: isStronghold(city) ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level),
      troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
      troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
      kind: city.kind || "",
      strongholdType: city.strongholdType || "",
      bonus: city.bonus || "",
      bonusPercent: Number(city.bonusPercent) || 0,
      size: isStronghold(city) ? getStrongholdVisualSize(city) : undefined,
    }));
}

function isOfflineCityStillOwned(offlineCity) {
  const cityId = getKnownCityId(offlineCity?.id);
  if (!cityId) return false;
  if (pendingOfflineOwnedCityIds instanceof Set) return pendingOfflineOwnedCityIds.has(cityId);
  return cityById(cityId)?.owner === "player";
}

function restoreOfflineCityOwnership(offlineCity) {
  const currentCity = cityById(offlineCity?.id);
  if (!currentCity || currentCity.owner === "player") return currentCity;
  currentCity.owner = "player";
  currentCity.ownerKind = "player";
  currentCity.ownerUid = getCurrentOnlineUid() || offlineCity.ownerUid || null;
  currentCity.ownerName = state.playerName;
  currentCity.ownerFlag = state.flag;
  currentCity.level = offlineCity.level;
  currentCity.troops = Math.max(0, Math.floor(Number(offlineCity.troops) || 0));
  currentCity.troopFloat = Math.max(0, Number(offlineCity.troopFloat) || currentCity.troops);
  currentCity.isMainCity = !isStronghold(currentCity) && currentCity.id === state.mainCityId;
  return currentCity;
}

function applyPendingOfflineProgress() {
  if (!state || pendingOfflineProgressSeconds <= 0) return;
  const elapsed = pendingOfflineProgressSeconds;
  pendingOfflineProgressSeconds = 0;

  const productionCities = pendingOfflineProductionCities.length
    ? pendingOfflineProductionCities
    : createOfflineProductionSnapshot(state);
  pendingOfflineProductionCities = [];
  if (!productionCities.length) {
    pendingOfflineOwnedCityIds = null;
    return;
  }

  const goldGained = Math.floor(productionCities.reduce((sum, city) => sum + getCityStats(city).goldProductionPerSecond, 0) * elapsed);
  let troopsKeptInCities = 0;
  let troopsRalliedToMain = 0;
  const changedOwnedCities = new Set();
  const lostCities = [];
  const lostCityIds = new Set();
  for (const offlineCity of productionCities) {
    const stillOwned = isOfflineCityStillOwned(offlineCity);
    if (!stillOwned && !lostCityIds.has(offlineCity.id)) {
      lostCityIds.add(offlineCity.id);
      lostCities.push({
        id: offlineCity.id,
        name: offlineCity.name || offlineCity.id,
        regionId: offlineCity.regionId || getCityRegionId(offlineCity.id),
      });
    }

    const growth = getCityStats(offlineCity).troopProductionPerSecond * elapsed;
    if (growth <= 0) continue;
    const gained = Math.floor(growth);
    if (gained <= 0) continue;

    const currentCity = stillOwned ? restoreOfflineCityOwnership(offlineCity) : cityById(offlineCity.id);
    if (stillOwned && currentCity) {
      currentCity.troopFloat = Math.max(0, Number(currentCity.troopFloat) || currentCity.troops || 0) + gained;
      currentCity.troops = Math.floor(currentCity.troopFloat);
      changedOwnedCities.add(currentCity.id);
      troopsKeptInCities += gained;
    } else {
      troopsRalliedToMain += gained;
    }
  }
  const troopsGained = troopsKeptInCities + troopsRalliedToMain;
  if (goldGained > 0) state.gold += goldGained;
  const mainCity = getMainRewardCity();
  if (mainCity && troopsRalliedToMain > 0) {
    mainCity.troopFloat = Math.max(0, Number(mainCity.troopFloat) || mainCity.troops || 0) + troopsRalliedToMain;
    mainCity.troops = Math.floor(mainCity.troopFloat);
    changedOwnedCities.add(mainCity.id);
  }
  changedOwnedCities.forEach(cityId => {
    const city = cityById(cityId);
    if (city) markOwnedCityChanged(city, false);
  });
  state.gameSeconds += elapsed;
  pendingOfflineOwnedCityIds = null;

  if (goldGained > 0 || troopsGained > 0 || lostCities.length > 0) {
    const rallyText = troopsRalliedToMain > 0 ? ` ${formatNumber(troopsRalliedToMain)} troops from lost cities rallied to ${mainCity ? mainCity.name : "the main city"}.` : "";
    const lostText = lostCities.length ? ` Lost cities: ${lostCities.map(city => city.name).join(", ")}.` : "";
    addLog(`Offline production: +${formatNumber(goldGained)} gold and +${formatNumber(troopsGained)} troops.${rallyText}${lostText}`);
    showOfflineRewardsModal({
      goldGained,
      troopsGained,
      troopsKeptInCities,
      troopsRalliedToMain,
      elapsed,
      cityName: mainCity?.name || "main city",
      lostCities,
    });
    syncOwnedCitiesToOnline(true);
    saveGame();
    flushOnlineSave(true);
  }
}

function showOfflineRewardsModal({ goldGained = 0, troopsGained = 0, troopsKeptInCities = 0, troopsRalliedToMain = 0, elapsed = 0, cityName = "main city", lostCities = [] } = {}) {
  const lostList = Array.isArray(lostCities) ? lostCities : [];
  const lostSummary = lostList.length
    ? `<section class="offline-lost-cities"><span>Cities lost while away</span><strong>${formatNumber(lostList.length)}</strong><ul>${lostList.slice(0, 8).map(city => `<li>${escapeHtml(city.name || city.id)} <small>${escapeHtml(getRegionLabel(city.regionId || getCityRegionId(city.id)))}</small></li>`).join("")}</ul>${lostList.length > 8 ? `<small>+${formatNumber(lostList.length - 8)} more</small>` : ""}</section>`
    : `<section class="offline-lost-cities safe"><span>Cities lost while away</span><strong>0</strong><small>No cities were lost.</small></section>`;
  modal.classList.add("offline-reward-modal");
  modalTitle.textContent = "Welcome back";
  modalBody.innerHTML = `
    <div class="offline-reward-panel">
      <p>Your kingdom kept producing while you were away for ${formatDuration(elapsed)}.</p>
      <div class="offline-reward-grid">
        <div><span>Gold collected</span><strong>${formatNumber(goldGained)}</strong></div>
        <div><span>Troops produced</span><strong>${formatNumber(troopsGained)}</strong><small>${formatNumber(troopsKeptInCities)} stayed in their cities</small></div>
        <div><span>Rallied home</span><strong>${formatNumber(troopsRalliedToMain)}</strong><small>${troopsRalliedToMain > 0 ? `Sent to ${escapeHtml(cityName)}` : "No cities lost offline"}</small></div>
      </div>
      ${lostSummary}
      <button id="offlineCollectBtn" class="offline-collect-btn" type="button">Collect</button>
    </div>
  `;
  modalBody.querySelector("#offlineCollectBtn")?.addEventListener("click", () => modal.close());
  if (!modal.open) modal.showModal();
}

function updateAttacks(dt) {
  const completed = [];
  const completedOnlineIds = new Set();
  const nowMs = Date.now();
  for (const attack of state.attacks) {
    const onlineId = getOnlineArmyResolutionId(attack);
    if (onlineId && usesServerArmyAuthority()) {
      const authoritativeRemaining = getOnlineArmyRemainingSeconds(attack);
      if (authoritativeRemaining > 0) {
        attack.remaining = authoritativeRemaining;
      } else {
        attack.remaining = Math.min(0, authoritativeRemaining);
      }
    } else {
      attack.remaining -= dt;
    }
    if (attack.remaining <= 0) {
      const retryAtMs = Math.max(0, Number(attack.resolveRetryAtMs) || 0);
      const skipResolve = Boolean(onlineId && (
        completedOnlineIds.has(onlineId)
        || isOnlineArmyResolutionBlocked(attack)
        || retryAtMs > nowMs
      ));
      if (onlineId) {
        completedOnlineIds.add(onlineId);
      }
      completed.push({ attack, skipResolve });
    }
  }

  for (const entry of completed) {
    const { attack, skipResolve } = entry;
    const onlineId = getOnlineArmyResolutionId(attack);
    if (!skipResolve && onlineId && usesServerArmyAuthority()) {
      resolveServerArmyMission(attack);
    } else if (!skipResolve && !onlineId) {
      if (onlineId) resolvedOnlineArmyIds.add(onlineId);
      resolveAttack(attack);
    } else if (!skipResolve && onlineId) {
      onlineLastError = "Online army resolution requires the Crownlands server.";
    }
  }

  if (completed.length) {
    state.attacks = state.attacks.filter(attack => {
      if (attack.remaining > 0) return true;
      const onlineId = getOnlineArmyResolutionId(attack);
      return Boolean(onlineId && usesServerArmyAuthority() && !resolvedOnlineArmyIds.has(onlineId));
    });
  }
}

function identityMarksCityAsMain(city, identity = null) {
  if (!city || !identity?.mainCityId || getKnownCityId(city.id) !== getKnownCityId(identity.mainCityId)) {
    return false;
  }
  const identityRegionId = String(identity.mainRegionId || getRegionIdFromOnlineIslandId(identity.mainIslandId) || "").trim();
  return !identityRegionId || getCityRegionId(city) === normalizeRegionId(identityRegionId);
}

function isProtectedMainCity(city) {
  if (!city) return false;
  if (city.isMainCity || city.id === state?.mainCityId) return true;
  const ownerUid = String(city.ownerUid || "").trim();
  if (!ownerUid) return false;
  const cachedIdentity = playerIdentityCache.get(ownerUid);
  if (identityMarksCityAsMain(city, cachedIdentity)) return true;
  const presence = Array.isArray(onlinePresence)
    ? onlinePresence.find(entry => entry?.uid === ownerUid)
    : null;
  return identityMarksCityAsMain(city, presence);
}

function getMainCityAttackBlockReason(target, attackerOwner = "player", attackerOwnerUid = "") {
  if (!target || !isProtectedMainCity(target)) return "";
  if (isSameAttackOwner(target, attackerOwner, attackerOwnerUid)) return "";
  return `${target.name} is a main city and cannot be attacked.`;
}

function getMainCityScoutBlockReason(target, scoutOwner = "player", scoutOwnerUid = "") {
  if (!target || !isProtectedMainCity(target)) return "";
  if (isSameAttackOwner(target, scoutOwner, scoutOwnerUid)) return "";
  return `${target.name} is a main city and cannot be scouted.`;
}

function launchAttack(sourceId, targetId, percent, owner, exactTroops = null, options = {}) {
  const source = cityById(sourceId);
  const target = getArmyTargetById(targetId);
  if (!source || !target || isGamePausedByOutcome()) return false;
  if (source.owner !== owner) return false;
  if (source.id === target.id) return false;
  if (source.troops < 1) return false;
  if (owner === "player" && !canUseOnlineArmyOrders()) return false;

  const kind = target.owner === owner ? "transfer" : "attack";
  const campTarget = isRewardCampTarget(target);
  const mainCityBlockReason = kind === "attack" && !campTarget ? getMainCityAttackBlockReason(target, owner) : "";
  if (mainCityBlockReason) {
    if (owner === "player") showToast(mainCityBlockReason);
    return false;
  }

  const shieldBlockReason = kind === "attack" && !campTarget ? getPeaceShieldAttackBlockReason(target, owner) : "";
  if (shieldBlockReason) {
    if (owner === "player") showToast(shieldBlockReason);
    return false;
  }

  const neutralBlockReason = campTarget ? "" : getNeutralCaptureBlockReason(target, owner);
  if (neutralBlockReason) {
    if (owner === "player") showNeutralCaptureLimitModal(neutralBlockReason);
    return false;
  }

  const route = options.route?.points?.length ? cloneRoute(options.route) : findRoute(source, target);
  if (!route || !route.points.length) {
    if (owner === "player") showToast("No land route found around the terrain.");
    return false;
  }

  const requestedSend = exactTroops !== null && Number.isFinite(Number(exactTroops))
    ? clamp(Math.floor(Number(exactTroops)), 1, source.troops)
    : clamp(Math.floor(source.troops * percent), 1, source.troops);
  const demoAttack = kind === "attack"
    ? createDemoAttackSnapshot(source, target, requestedSend, owner)
    : null;
  const send = demoAttack?.active ? demoAttack.effectiveTroops : requestedSend;
  const duration = travelTime(source, target, owner, route.length, send, kind, { demoAttack });
  const mission = {
    id: attackIdCounter++,
    owner,
    kind,
    targetType: campTarget ? "camp" : "city",
    fromId: source.id,
    toId: target.id,
    troops: send,
    total: duration,
    remaining: duration,
    path: route.points,
    pathSegments: getRouteSegments(route, getCityRegionId(source)),
    pathLength: route.length,
    targetOwnerAtLaunch: target.owner,
    requestedTroops: requestedSend,
    attackerKingPower: demoAttack?.attackerKingPower || (owner === "player" ? getKingPower() : 0),
    defenderKingPower: demoAttack?.defenderKingPower || getCityOwnerKingPowerSnapshot(target),
    demoAttack,
  };
  prepareOnlineArmyMission(mission);

  if (owner === "player" && usesServerArmyAuthority()) {
    const launchKey = getServerArmyLaunchKey(source.id, target.id, kind);
    if (pendingServerArmyLaunchKeys.has(launchKey)) {
      showToast(`An order from ${source.name} to ${target.name} is already being sent.`);
      return false;
    }
    pendingServerArmyLaunchKeys.add(launchKey);
    publishOnlineArmyMovement(mission, { addLocalMissionOnAccept: true, optimistic: false })
      .then(accepted => {
        if (!accepted) return;
        const acceptedKind = mission.kind || kind;
        const acceptedTroops = Math.max(0, Math.floor(Number(mission.troops) || send));
        const acceptedDemoAttack = normalizeDemoAttackSnapshot(mission.demoAttack) || demoAttack;
        const peaceShieldDeactivated = Boolean(mission.peaceShieldDeactivated);
        if (acceptedKind === "transfer") {
          if (!options.silent) {
            addLog(`You moved ${formatNumber(acceptedTroops)} troops from ${source.name} to ${target.name}.`);
            showToast(`Reinforcements moving: ${source.name} \u2192 ${target.name}`);
          }
        } else {
          const demoText = acceptedDemoAttack ? ` ${getDemoAttackNotice(acceptedDemoAttack)}` : "";
          const shieldText = peaceShieldDeactivated ? " Royal Peace Shield deactivated." : "";
          addLog(`You sent ${formatNumber(acceptedTroops)} troops from ${source.name} to attack ${target.name}.${demoText}${shieldText}`);
          showToast(peaceShieldDeactivated
            ? "Shield dropped. Attack moving."
            : acceptedDemoAttack
              ? `Demo attack moving: ${formatNumber(acceptedTroops)} troops`
              : `Attack moving: ${source.name} \u2192 ${target.name}`);
        }
      })
      .finally(() => pendingServerArmyLaunchKeys.delete(launchKey));
    showToast("Sending army order to the server...");
    return true;
  }

  const peaceShieldDeactivated = owner === "player" && kind === "attack"
    ? deactivatePeaceShieldForPlayerAttack(target)
    : false;

  source.troopFloat = Math.max(0, source.troopFloat - send);
  source.troops = Math.floor(source.troopFloat);
  if (owner === "player") {
    markOwnedCityChanged(source, false);
    syncCityStateToOnline(source);
  }
  state.attacks.push(mission);
  publishOnlineArmyMovement(mission);
  if (isOnlineWorldActive() && owner === "player" && options.syncOwnedCities !== false && !usesServerArmyAuthority()) syncOwnedCitiesToOnline(true);

  if (owner === "player" && kind === "transfer") {
    if (!options.silent) {
      addLog(`You moved ${formatNumber(send)} troops from ${source.name} to ${target.name}.`);
      showToast(`Reinforcements moving: ${source.name} \u2192 ${target.name}`);
    }
  } else if (owner === "player") {
    const demoText = demoAttack ? ` ${getDemoAttackNotice(demoAttack)}` : "";
    const shieldText = peaceShieldDeactivated ? " Royal Peace Shield deactivated." : "";
    addLog(`You sent ${formatNumber(send)} troops from ${source.name} to attack ${target.name}.${demoText}${shieldText}`);
    showToast(peaceShieldDeactivated ? "Shield dropped. Attack moving." : demoAttack ? `Demo attack moving: ${formatNumber(send)} troops` : `Attack moving: ${source.name} \u2192 ${target.name}`);
  } else if (target.owner === "player") {
    addLog(`Enemy army is attacking ${target.name} with ${formatNumber(send)} troops.`);
    showToast(`Incoming attack on ${target.name}`);
  }

  return true;
}

function getTroopTravelBandIndex(troops) {
  const count = Math.max(1, Math.floor(Number(troops) || 1));
  const index = ARMY_TRAVEL_TROOP_BAND_LIMITS.findIndex(limit => count <= limit);
  return index >= 0 ? index : ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS.length - 1;
}

function getTroopTravelMultiplier(troops) {
  const index = getTroopTravelBandIndex(troops);
  return ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS[index] || 1;
}

function travelTime(source, target, owner, pathLength = null, troopCount = 1, kind = "attack", options = {}) {
  const distance = Number.isFinite(pathLength) && pathLength > 0
    ? pathLength
    : Math.hypot(source.x - target.x, source.y - target.y);
  const speed = owner === "player" ? skillMultiplier("marchOrders") * getStrongholdMarchSpeedMultiplier(owner) : 1;
  const kindMultiplier = ARMY_TRAVEL_KIND_MULTIPLIERS[kind] || ARMY_TRAVEL_KIND_MULTIPLIERS.attack;
  const troopMultiplier = getTroopTravelMultiplier(troopCount);
  const demoAttack = kind === "attack" ? normalizeDemoAttackSnapshot(options.demoAttack) : null;
  const demoMultiplier = demoAttack?.travelMultiplier || 1;
  const minSeconds = kind === "scout" ? ARMY_TRAVEL_SCOUT_MIN_SECONDS : ARMY_TRAVEL_MIN_SECONDS;
  return clamp(
    distance * ARMY_TRAVEL_SECONDS_PER_MAP_UNIT * kindMultiplier * troopMultiplier * demoMultiplier / Math.max(0.1, speed),
    minSeconds,
    ARMY_TRAVEL_MAX_SECONDS,
  );
}

function resolveAttack(attack) {
  const target = cityById(attack.toId);
  if (!target) return;

  if (
    isOnlineWorldActive()
    && attack.owner !== "player"
    && !(attack.ownerKind === "player" && attack.ownerUid)
  ) {
    console.warn("Ignored online combat without a player owner identity", attack);
    return;
  }

  if (attack.kind === "scout") {
    completeScoutMission(attack, target);
    return;
  }

  if (attack.kind === "transfer" && target.owner === attack.owner) {
    target.troopFloat += attack.troops;
    target.troops = Math.floor(target.troopFloat);
    if (attack.owner === "player") {
      markOwnedCityChanged(target);
      syncCityStateToOnline(target);
      addLog(`Reinforcements arrived at ${target.name}: +${formatNumber(attack.troops)} troops.`);
      showToast(`Reinforced ${target.name}`);
    }
    return;
  }

  const attackOwnerIdentity = attack.ownerUid ? resolvePlayerIdentityForUid(attack.ownerUid, attack) : null;
  const attackerName = attack.owner === "player" ? "You" : attackOwnerIdentity?.displayName || attack.ownerName || "Enemy";
  const oldOwner = target.owner;
  const defenderName = getBattleReportOwnerName(target, oldOwner);
  const attackerReportName = attack.owner === "player"
    ? getBattleReportOwnerName(null, attack.owner)
    : attackOwnerIdentity?.displayName || attack.ownerName || getBattleReportOwnerName(null, attack.owner);
  const attackSource = cityById(attack.fromId);
  const targetLevel = clampCityLevel(target.level);
  const defendersAtStart = Math.max(0, Math.floor(Number(target.troops) || 0));
  const targetStatsAtStart = getCityStats(target);
  const targetDefenseAtStart = targetStatsAtStart.totalDefense;
  const mainCityBlockReason = getMainCityAttackBlockReason(target, attack.owner, attack.ownerUid);
  if (mainCityBlockReason) {
    const returned = returnSurvivingAttackersToSource(attack, attack.troops, `${target.name} protected main city`);
    const returnText = returned > 0
      ? `${formatNumber(returned)} troops returned to their source city.`
      : "The attacking army could not enter the main city.";
    if (attack.owner === "player") {
      addBattleReport({
        type: "attack",
        outcome: "defeat",
        cityId: target.id,
        cityName: target.name,
        cityLevel: targetLevel,
        sentTroops: attack.troops,
        troopCount: defendersAtStart,
        survivors: returned,
        defendersLeft: defendersAtStart,
        attackerLosses: 0,
        defenderLosses: 0,
        totalDefense: targetDefenseAtStart,
        baseTotalDefense: targetStatsAtStart.baseTotalDefense,
        totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
        opponentName: defenderName,
        summary: `Main cities cannot be attacked. ${returnText}`,
      });
      showToast(`${target.name} is a main city. Troops returned.`);
    } else if (target.owner === "player") {
      addBattleReport({
        type: "defense",
        outcome: "held",
        cityId: target.id,
        cityName: target.name,
        cityLevel: targetLevel,
        sentTroops: attack.troops,
        troopCount: defendersAtStart,
        survivors: defendersAtStart,
        defendersLeft: defendersAtStart,
        attackerLosses: 0,
        defenderLosses: 0,
        totalDefense: targetDefenseAtStart,
        baseTotalDefense: targetStatsAtStart.baseTotalDefense,
        totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
        opponentName: attackerReportName,
        summary: `Main city protection blocked ${attackerReportName}'s attack. ${returnText}`,
      });
      showToast(`Main city protection blocked an attack on ${target.name}`);
    }
    addLog(`${mainCityBlockReason} ${returnText}`);
    return;
  }

  const shieldBlockReason = getPeaceShieldAttackBlockReason(target, attack.owner, attack.ownerUid);
  if (shieldBlockReason) {
    const returned = returnSurvivingAttackersToSource(attack, attack.troops, `${target.name} Royal Peace Shield`);
    const returnText = returned > 0
      ? `${formatNumber(returned)} troops returned to their source city.`
      : "The attacking army could not enter the shielded city.";
    if (attack.owner === "player") {
      addBattleReport({
        type: "attack",
        outcome: "defeat",
        cityId: target.id,
        cityName: target.name,
        cityLevel: targetLevel,
        sentTroops: attack.troops,
        troopCount: defendersAtStart,
        survivors: returned,
        defendersLeft: defendersAtStart,
        attackerLosses: 0,
        defenderLosses: 0,
        totalDefense: targetDefenseAtStart,
        baseTotalDefense: targetStatsAtStart.baseTotalDefense,
        totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
        opponentName: defenderName,
        summary: `Royal Peace Shield blocked the attack. ${returnText}`,
      });
      showToast(`${target.name} is shielded. Troops returned.`);
    } else if (target.owner === "player") {
      addBattleReport({
        type: "defense",
        outcome: "held",
        cityId: target.id,
        cityName: target.name,
        cityLevel: targetLevel,
        sentTroops: attack.troops,
        troopCount: defendersAtStart,
        survivors: defendersAtStart,
        defendersLeft: defendersAtStart,
        attackerLosses: 0,
        defenderLosses: 0,
        totalDefense: targetDefenseAtStart,
        baseTotalDefense: targetStatsAtStart.baseTotalDefense,
        totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
        opponentName: attackerReportName,
        summary: `Royal Peace Shield blocked ${attackerReportName}'s attack. ${returnText}`,
      });
      showToast(`Shield blocked an attack on ${target.name}`);
    }
    addLog(`${shieldBlockReason} ${returnText}`);
    return;
  }

  const neutralCapture = attack.owner === "player" && oldOwner === "neutral" && !isStronghold(target);
  const neutralBlockReason = neutralCapture ? getNeutralCaptureBlockReason(target, "player", attack.id) : "";
  if (neutralBlockReason) {
    const returned = returnSurvivingAttackersToSource(attack, attack.troops, `${target.name} neutral capture limit`);
    addBattleReport({
      type: "attack",
      outcome: "defeat",
      cityId: target.id,
      cityName: target.name,
      cityLevel: targetLevel,
      sentTroops: attack.troops,
      troopCount: defendersAtStart,
      survivors: returned,
      defendersLeft: defendersAtStart,
      attackerLosses: 0,
      defenderLosses: 0,
      totalDefense: targetDefenseAtStart,
      baseTotalDefense: targetStatsAtStart.baseTotalDefense,
      totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
      opponentName: defenderName,
      summary: `${neutralBlockReason} The attack was canceled and ${formatNumber(returned)} troops returned.`,
    });
    addLog(`${attackerName} could not attack ${target.name}. ${neutralBlockReason}`);
    showNeutralCaptureLimitModal(neutralBlockReason);
    return;
  }

  const demoAttack = isStronghold(target)
    ? null
    : normalizeDemoAttackSnapshot(attack.demoAttack)
      || createDemoAttackSnapshot(attackSource, target, attack.troops, attack.owner, {
        attackerKingPower: attack.attackerKingPower,
        defenderKingPower: attack.defenderKingPower,
      });
  const demoReportSuffix = getDemoAttackReportSuffix(demoAttack);
  const givenUpNeutralTarget = isGivenUpNeutralCity(target);
  const result = calculateCombatResult(attack.troops, attack.owner, target, { demoAttack });

  if (result.success) {
    const xpEfficiency = attack.owner === "player" ? (demoAttack || givenUpNeutralTarget ? 0 : getCaptureXpEfficiency(target, oldOwner)) : 1;
    const xpAward = attack.owner === "player" && !demoAttack && !givenUpNeutralTarget ? getCaptureXpAward(target, oldOwner, result.defenderLosses, attack.owner) : 0;
    if (attack.owner === "player") {
      target.owner = "player";
      target.ownerKind = "player";
      target.ownerUid = getCurrentOnlineUid() || target.ownerUid || null;
      target.ownerName = state.playerName;
      target.ownerFlag = state.flag;
    } else if (attack.ownerKind === "player" && attack.ownerUid) {
      const attackerIdentity = resolvePlayerIdentityForUid(attack.ownerUid, attack);
      target.owner = "enemy";
      target.ownerKind = "player";
      target.ownerUid = attack.ownerUid;
      target.ownerName = attackerIdentity.displayName || attack.ownerName || "Rival ruler";
      target.ownerFlag = attackerIdentity.flag || attack.ownerFlag || createDefaultFlag();
    } else {
      target.owner = attack.owner;
      target.ownerKind = attack.owner === "enemy" ? "enemy" : attack.owner;
      target.ownerUid = null;
      target.ownerName = OWNER[attack.owner]?.label || "";
      target.ownerFlag = null;
    }
    const levelDrop = dropCapturedCityLevel(target);
    target.troopFloat = result.survivors;
    target.troops = result.survivors;
    target.defense = 1;
    target.investedGold = 0;
    target.lastCapturedAt = state.gameSeconds;
    target.relinquishedAtMs = 0;
    target.relocatedAtMs = 0;
    if (neutralCapture) recordNeutralCapture();

    if (attack.owner === "player") {
      const savedAttackers = returnSavedTroops("fieldMedics", result.attackerLosses, `${target.name} attack`);
      addBattleReport({
        type: "attack",
        outcome: "victory",
        cityId: target.id,
        cityName: target.name,
        cityLevel: targetLevel,
        sentTroops: attack.troops,
        troopCount: defendersAtStart,
        survivors: result.survivors,
        defendersLeft: 0,
        attackerLosses: result.attackerLosses,
        defenderLosses: result.defenderLosses,
        totalDefense: targetDefenseAtStart,
        baseTotalDefense: targetStatsAtStart.baseTotalDefense,
        totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
        opponentName: defenderName,
        summary: `Captured with ${formatNumber(result.survivors)} survivors. ${formatCapturedCityLevelDrop(levelDrop)} +${formatNumber(xpAward)} XP.${demoReportSuffix}`,
      });
      addLog(`Victory: you captured ${target.name} with ${formatNumber(result.survivors)} survivors. ${formatNumber(savedAttackers)} troops recovered. ${formatCapturedCityLevelDrop(levelDrop)} XP efficiency ${Math.round(xpEfficiency * 100)}%.`);
      showToast(`Captured ${target.name}: +${formatNumber(xpAward)} XP`);
      addCharacterXp(xpAward, `${target.name} capture`);
    } else if (oldOwner === "player") {
      const savedDefenders = returnSavedTroops("fieldMedics", result.defenderLosses, `${target.name} defense`, target.id);
      const cappedDefenseHeldXp = applyDefenseOpponentXpMultiplier(
        getDefenseHeldXpAward(attack.troops, target),
        attack,
        target,
        demoAttack
      );
      const defenseLossXp = getPartialBattleXpAward(cappedDefenseHeldXp);
      addBattleReport({
        type: "defense",
        outcome: "lost",
        cityId: target.id,
        cityName: target.name,
        cityLevel: targetLevel,
        sentTroops: attack.troops,
        troopCount: defendersAtStart,
        survivors: result.survivors,
        defendersLeft: 0,
        attackerLosses: result.attackerLosses,
        defenderLosses: result.defenderLosses,
        totalDefense: targetDefenseAtStart,
        baseTotalDefense: targetStatsAtStart.baseTotalDefense,
        totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
        opponentName: attackerReportName,
        summary: `${target.name} was captured by ${attackerReportName}. ${formatCapturedCityLevelDrop(levelDrop)} +${formatNumber(defenseLossXp)} XP.${demoReportSuffix}`,
      });
      addLog(`Lost: the enemy captured ${target.name}. ${formatCapturedCityLevelDrop(levelDrop)} ${formatNumber(savedDefenders)} troops recovered, and you gained ${formatNumber(defenseLossXp)} XP.`);
      showToast(`You lost ${target.name}: +${formatNumber(defenseLossXp)} XP`);
      addCharacterXp(defenseLossXp, `${target.name} lost defense`);
    }
  } else {
    target.troopFloat = result.defendersLeft;
    target.troops = result.defendersLeft;

    if (attack.owner === "player") {
      const savedAttackers = returnSavedTroops("fieldMedics", result.attackerLosses, `${target.name} failed attack`);
      const failedAttackXp = demoAttack || givenUpNeutralTarget ? 0 : getFailedAttackXpAward(target, oldOwner, defendersAtStart, attack.owner);
      addBattleReport({
        type: "attack",
        outcome: "defeat",
        cityId: target.id,
        cityName: target.name,
        cityLevel: targetLevel,
        sentTroops: attack.troops,
        troopCount: defendersAtStart,
        survivors: 0,
        defendersLeft: result.defendersLeft,
        attackerLosses: result.attackerLosses,
        defenderLosses: result.defenderLosses,
        totalDefense: targetDefenseAtStart,
        baseTotalDefense: targetStatsAtStart.baseTotalDefense,
        totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
        opponentName: defenderName,
        summary: `${formatNumber(result.defendersLeft)} defenders remained. +${formatNumber(failedAttackXp)} XP.${demoReportSuffix}`,
      });
      addLog(`Defeat: your attack on ${target.name} failed. ${formatNumber(result.defendersLeft)} defenders remain. ${formatNumber(savedAttackers)} troops recovered, and you gained ${formatNumber(failedAttackXp)} XP.`);
      showToast(`Attack failed at ${target.name}: +${formatNumber(failedAttackXp)} XP`);
      addCharacterXp(failedAttackXp, `${target.name} failed attack`);
    } else if (oldOwner === "player") {
      const savedDefenders = returnSavedTroops("fieldMedics", result.defenderLosses, `${target.name} defense`);
      const defenseHeldXp = applyDefenseOpponentXpMultiplier(getDefenseHeldXpAward(attack.troops, target), attack, target, demoAttack);
      addBattleReport({
        type: "defense",
        outcome: "held",
        cityId: target.id,
        cityName: target.name,
        cityLevel: targetLevel,
        sentTroops: attack.troops,
        troopCount: defendersAtStart,
        survivors: 0,
        defendersLeft: result.defendersLeft,
        attackerLosses: result.attackerLosses,
        defenderLosses: result.defenderLosses,
        totalDefense: targetDefenseAtStart,
        baseTotalDefense: targetStatsAtStart.baseTotalDefense,
        totalDefenseBonus: targetStatsAtStart.totalDefenseBonus,
        opponentName: attackerReportName,
        summary: `${target.name} survived with ${formatNumber(result.defendersLeft)} defenders. +${formatNumber(defenseHeldXp)} XP.${demoReportSuffix}`,
      });
      addLog(`Defense held: ${target.name} survived the enemy attack.`);
      if (savedDefenders > 0) {
        addLog(`Field Medics recovered ${formatNumber(savedDefenders)} defenders to your main city.`);
      }
      showToast(`Defense held at ${target.name}`);
      addCharacterXp(defenseHeldXp, `${target.name} defense`);
    }
  }

  if (selectedSourceId && cityById(selectedSourceId)?.owner !== "player") {
    clearSelection(false);
  }
  if (isOnlineWorldActive()) {
    if (target.owner === "player") {
      markOwnedCityChanged(target, false);
    }
    syncCityStateToOnline(target);
    if (target.owner === "player") syncOwnedCitiesToOnline(true);
  }
}

function checkGameOver() {
  normalizeGameOverState();
}

function renderAll() {
  if (!state) return;
  const now = performance.now();
  lastHudRenderTime = now;
  lastHudStatusRenderTime = now;
  lastRenderTime = now;
  lastArmyRenderTime = 0;
  syncMapSurfaceToActiveIsland();
  updateCameraTransform();
  renderHud();
  renderHudStatusPanels();
  if (isCameraInteractionActive()) {
    queueDeferredMapRender();
    return;
  }
  renderHarvestBonuses();
  renderIslandTeleporters();
  renderPaths();
  renderCities(true);
  renderPanel();
  renderArmies(true);
}

function renderHud() {
  setTextIfChanged(lordNameText, state.playerName);
  ensureDailyCaptureTracker();
  state.character = normalizeCharacterProgress(state.character);
  state.flag = normalizeFlag(state.flag);
  setTextIfChanged(goldText, formatNumber(Math.floor(state.gold)));
  setTextIfChanged(characterLevelBadge, `Lv ${formatNumber(state.character.level)}`);
  setTextIfChanged(characterXpText, "");
  const flagSignature = getFlagSignature(state.flag);
  if (hudKingdomFlag && flagSignature !== lastHudFlagSignature) {
    lastHudFlagSignature = flagSignature;
    applyFlagToElement(hudKingdomFlag, state.flag);
  }
  const regularCityCount = getOwnedRegularCityCountForDisplay();
  setTextIfChanged(cityText, `${formatNumber(regularCityCount)} cities`);
  if (cityListBtn) cityListBtn.setAttribute("aria-label", `Open city list, ${formatNumber(regularCityCount)} cities owned`);

  if (!statusText) return;
  if (state.gameOver === "victory") {
    setTextIfChanged(statusText, "Victory");
  } else {
    setTextIfChanged(statusText, `+${getGoldPerSecond().toFixed(1)} gold/s`);
  }
}

function renderHudStatusPanels() {
  updateShieldStatusBadge();
  updateIslandSwitcherUi();
  updateIncomingAttackUi();
  updateOutgoingAttackUi();
  if (profileScreen?.classList.contains("open")) renderProfileScreen();
}

function updateTimedEffectStatusBadge(badge, timeElement, expiresAtMs, label) {
  if (!badge || !timeElement) return;
  const remainingSeconds = getPeaceShieldRemainingSeconds(expiresAtMs);
  if (!remainingSeconds) {
    badge.hidden = true;
    badge.title = "";
    badge.setAttribute("aria-label", `${label} inactive`);
    timeElement.textContent = "";
    return;
  }

  const remainingText = formatDuration(remainingSeconds);
  badge.hidden = false;
  timeElement.textContent = remainingText;
  badge.title = `${label} active: ${remainingText} remaining`;
  badge.setAttribute("aria-label", `${label} active, ${remainingText} remaining`);
}

function updateShieldStatusBadge() {
  updateTimedEffectStatusBadge(shieldStatusBadge, shieldStatusTime, getActivePeaceShieldExpiresAtMs(), "Royal Peace Shield");
  updateTimedEffectStatusBadge(warDrumsStatusBadge, warDrumsStatusTime, getActiveWarDrumsExpiresAtMs(), "War Drums");
  updateTimedEffectStatusBadge(taxDecreeStatusBadge, taxDecreeStatusTime, getActiveRoyalTaxDecreeExpiresAtMs(), "Royal Tax Decree");
  updateTimedEffectStatusBadge(veilStatusBadge, veilStatusTime, getActiveVeilOfSilenceExpiresAtMs(), "Veil of Silence");
  updateActiveItemEffectsStackDensity();
}

function updateActiveItemEffectsStackDensity() {
  if (!activeItemEffectsStack) return;
  const activeCount = Array.from(activeItemEffectsStack.querySelectorAll(".effect-status-badge"))
    .filter(badge => !badge.hidden)
    .length;
  activeItemEffectsStack.dataset.activeCount = String(activeCount);
  activeItemEffectsStack.classList.toggle("compact", activeCount > 2);
  activeItemEffectsStack.classList.toggle("dense", activeCount > 3);
}

function applyFlagToElement(element, flag) {
  if (!element) return;
  const normalized = normalizeFlag(flag);
  element.style.setProperty("--flag-primary", normalized.primary);
  element.style.setProperty("--flag-secondary", normalized.secondary);
  for (const option of FLAG_PATTERNS) element.classList.remove(`pattern-${option.key}`);
  element.classList.add(`pattern-${normalized.pattern}`);
  const symbol = FLAG_SYMBOLS.find(option => option.key === normalized.symbol) || FLAG_SYMBOLS[0];
  const symbolElement = element.querySelector(".flag-symbol");
  if (symbolElement) symbolElement.textContent = symbol.glyph;
}

function getCityOwnerFlag(city) {
  if (!city) return null;
  if (city.owner === "player") return state.flag;
  if (city.ownerKind === "player" && city.ownerUid) {
    const identity = resolvePlayerIdentityForUid(city.ownerUid, city);
    return identity.flag || city.ownerFlag || createDefaultFlag();
  }
  return null;
}

function renderCityOwnerFlag(city) {
  const flag = getCityOwnerFlag(city);
  if (flag) {
    return `<span class="kingdom-flag city-owner-flag city-kingdom-flag" aria-hidden="true"><span class="flag-symbol"></span></span>`;
  }
  return `<span class="city-owner-flag owner-flag" aria-hidden="true">${OWNER[city.owner]?.flag || OWNER.neutral.flag}</span>`;
}

function applyCityOwnerFlags(container, city) {
  const flag = getCityOwnerFlag(city);
  if (!flag) return;
  container.querySelectorAll(".city-kingdom-flag").forEach(element => applyFlagToElement(element, flag));
}

function getCityOwnerDisplayName(city) {
  if (!city) return "";
  if (city.owner === "player") return state.playerName;
  if (city.ownerKind === "player" && city.ownerUid) {
    const identity = resolvePlayerIdentityForUid(city.ownerUid, city);
    return identity.displayName || city.ownerName || "Rival ruler";
  }
  return OWNER[city.owner]?.label || "Unknown";
}

function getPlayerMarchingTroops() {
  if (!state || !Array.isArray(state.attacks)) return 0;
  return state.attacks
    .filter(attack => attack.owner === "player")
    .reduce((total, attack) => total + Math.max(0, Math.floor(Number(attack.troops) || 0)), 0);
}

function getCityKingPower(city) {
  if (!city || city.owner !== "player") return 0;
  return getCityInfrastructureKingPower(city) + getTroopKingPower(city.troops);
}

function getCachedKingPowerFallback() {
  const currentUid = getCurrentOnlineUid();
  const cachedIdentity = currentUid ? playerIdentityCache.get(currentUid) : null;
  const cachedIdentityPower = Math.max(0, Math.floor(Number(cachedIdentity?.kingPowerVersion) || 0)) >= KING_POWER_AUTHORITY_VERSION
    ? normalizePowerValue(cachedIdentity?.kingPower)
    : 0;
  return Math.max(0, normalizePowerValue(lastComputedKingPower), cachedIdentityPower);
}

function getCurrentPlayerIdentityKingPower(fallback = 0) {
  if (currentPlayerIdentityKingPowerOverride !== null) {
    return normalizePowerValue(currentPlayerIdentityKingPowerOverride);
  }
  return getKingPower() || normalizePowerValue(fallback);
}

function getKingPower() {
  if (!state || !Array.isArray(state.cities)) return 0;
  const globalStats = getGlobalStatsSnapshot();
  if (hasUsableGlobalStats(globalStats) && globalStats.version >= KING_POWER_AUTHORITY_VERSION) {
    lastComputedKingPower = normalizePowerValue(globalStats.kingPower);
    return lastComputedKingPower;
  }
  if (kingPowerCalculationInProgress) return getCachedKingPowerFallback();
  kingPowerCalculationInProgress = true;
  try {
    const ownedCities = getAllOwnedCitiesForDisplay();
    const infrastructurePower = ownedCities.reduce((total, city) => total + getCityInfrastructureKingPower(city), 0);
    const stationedTroops = ownedCities.reduce(
      (total, city) => total + Math.max(0, Math.floor(Number(city.troops) || 0)),
      0
    );
    const totalTroops = stationedTroops + getPlayerMarchingTroops();
    lastComputedKingPower = Math.max(0, Math.floor(infrastructurePower + getTroopKingPower(totalTroops)));
    return lastComputedKingPower;
  } finally {
    kingPowerCalculationInProgress = false;
  }
}

function getKingdomSummary() {
  const globalStats = getGlobalStatsSnapshot();
  if (hasUsableGlobalStats(globalStats)) {
    return {
      kingPower: globalStats.version >= KING_POWER_AUTHORITY_VERSION
        ? normalizePowerValue(globalStats.kingPower)
        : getKingPower(),
      baseKingPower: globalStats.version >= KING_POWER_AUTHORITY_VERSION
        ? normalizePowerValue(globalStats.baseKingPower ?? globalStats.kingPower)
        : getKingPower(),
      cities: Math.max(0, Math.floor(Number(globalStats.totalCities) || 0)),
      troops: Math.max(0, Math.floor(Number(globalStats.totalTroops) || 0))
        + Math.max(0, Math.floor(Number(globalStats.totalMarchingTroops) || 0)),
      gold: Math.floor(Number(state.gold) || 0),
      baseGoldProductionPerHour: Math.max(0, Math.floor(Number(globalStats.baseGoldPerHour) || 0)),
      goldProductionPerHour: Math.max(0, Math.floor(Number(globalStats.goldPerHour) || 0)),
      baseTroopProductionPerHour: Math.max(0, Math.floor(Number(globalStats.baseTroopPerHour) || 0)),
      troopProductionPerHour: Math.max(0, Math.floor(Number(globalStats.troopPerHour) || 0)),
    };
  }
  const cities = getAllOwnedCitiesForDisplay();
  const regularCities = cities.filter(city => !isStronghold(city));
  const marchingTroops = getPlayerMarchingTroops();
  const cityStats = cities.map(city => getCityStats(city));
  const baseInfrastructurePower = cities.reduce((total, city) => {
    const components = getCityInfrastructureKingPowerComponents(city, { includeStrongholdBoosts: false });
    return total + components.replacementPower + components.defensivePower;
  }, 0);
  const baseKingPower = Math.max(0, Math.floor(baseInfrastructurePower + getTroopKingPower(
    cities.reduce((total, city) => total + Math.max(0, Number(city.troops) || 0), marchingTroops)
  )));
  return {
    kingPower: getKingPower(),
    baseKingPower,
    cities: regularCities.length,
    troops: cities.reduce((total, city) => total + Math.max(0, Number(city.troops) || 0), marchingTroops),
    gold: Math.floor(state.gold),
    baseGoldProductionPerHour: cityStats.reduce((total, stats) => total + stats.baseGoldProductionPerHour, 0),
    goldProductionPerHour: cityStats.reduce((total, stats) => total + stats.goldProductionPerHour, 0),
    baseTroopProductionPerHour: cityStats.reduce((total, stats) => total + stats.baseTroopProductionPerHour, 0),
    troopProductionPerHour: cityStats.reduce((total, stats) => total + stats.troopProductionPerHour, 0),
  };
}

function getPushNotificationsPreference() {
  try {
    const saved = localStorage.getItem(PUSH_NOTIFICATIONS_PREF_KEY);
    if (saved === "on") return true;
    if (saved === "off") return false;
  } catch (error) {
    console.warn("Could not read notification preference", error);
  }
  return getOnlineApi()?.getNotificationPermission?.() === "granted";
}

function setPushNotificationsPreference(enabled) {
  try {
    localStorage.setItem(PUSH_NOTIFICATIONS_PREF_KEY, enabled ? "on" : "off");
  } catch (error) {
    console.warn("Could not save notification preference", error);
  }
}

function setPushAlertsStatus(text = "", visible = false) {
  if (!pushAlertsStatus) return;
  pushAlertsStatus.textContent = text;
  pushAlertsStatus.hidden = !visible;
}

function setPushAlertsOptionState(enabled, disabled = false) {
  if (!pushAlertsOffBtn || !pushAlertsOnBtn) return;
  pushAlertsOffBtn.classList.toggle("active", !enabled);
  pushAlertsOnBtn.classList.toggle("active", enabled);
  pushAlertsOffBtn.setAttribute("aria-pressed", String(!enabled));
  pushAlertsOnBtn.setAttribute("aria-pressed", String(enabled));
  pushAlertsOffBtn.disabled = disabled;
  pushAlertsOnBtn.disabled = disabled;
}

function updatePushAlertsUi() {
  if (!pushAlertsOffBtn || !pushAlertsOnBtn) return;
  const api = getOnlineApi();
  const signedIn = Boolean(api?.isSignedIn?.());
  const supported = Boolean(api?.isPushSupported?.());
  const permission = api?.getNotificationPermission?.() || "unsupported";
  const enabledPreference = getPushNotificationsPreference();

  if (!state || !signedIn) {
    setPushAlertsOptionState(false, true);
    setPushAlertsStatus("Offline", true);
    return;
  }
  if (!supported) {
    setPushAlertsOptionState(false, true);
    const hasVapidKey = Boolean(api?.hasNotificationVapidKey?.());
    const statusText = !window.isSecureContext ? "HTTPS required" : (!hasVapidKey ? "Missing key" : "Unavailable");
    setPushAlertsStatus(statusText, true);
    return;
  }
  if (permission === "denied") {
    setPushAlertsOptionState(false, false);
    pushAlertsOnBtn.disabled = true;
    setPushAlertsStatus("Blocked", true);
    return;
  }
  if (enabledPreference && permission === "granted") {
    setPushAlertsOptionState(true, false);
    setPushAlertsStatus("Notifications On", false);
    return;
  }
  setPushAlertsOptionState(false, false);
  setPushAlertsStatus("Notifications Off", false);
}

async function refreshPushAlertRegistration(silent = true) {
  const api = getOnlineApi();
  if (!state || !api?.registerPushNotifications || !api?.isSignedIn?.() || !getPushNotificationsPreference()) {
    updatePushAlertsUi();
    return false;
  }
  try {
    const result = await api.registerPushNotifications({ playerName: state.playerName || "Ruler" });
    updatePushAlertsUi();
    return Boolean(result?.enabled);
  } catch (error) {
    if (!silent) showToast(error?.message || "Could not enable notifications.");
    updatePushAlertsUi();
    return false;
  }
}

async function exitFullscreenForNotificationPrompt() {
  if (!document.fullscreenElement || !document.exitFullscreen) return false;
  try {
    await document.exitFullscreen();
    updateFullscreenButton();
    await new Promise(resolve => requestAnimationFrame(resolve));
    return true;
  } catch (error) {
    console.warn("Could not exit fullscreen before notification prompt", error);
    return false;
  }
}

async function setPushNotificationsEnabled(enabled) {
  const api = getOnlineApi();
  if (!api?.enablePushNotifications) {
    showToast("Notifications are not available here.");
    return;
  }
  setPushAlertsOptionState(getPushNotificationsPreference() && api?.getNotificationPermission?.() === "granted", true);
  try {
    if (!enabled) {
      setPushNotificationsPreference(false);
      if (api.disablePushNotifications) await api.disablePushNotifications();
      showToast("Notifications off.");
      return;
    }
    if (api?.getNotificationPermission?.() === "denied") {
      setPushNotificationsPreference(false);
      showToast("Notifications are blocked in this browser.");
      return;
    }
    if (!api?.hasNotificationVapidKey?.()) {
      setPushNotificationsPreference(false);
      showToast("Notifications are missing the web push key.");
      return;
    }
    let permission = api?.getNotificationPermission?.() || "unsupported";
    if (permission === "default" && api?.requestNotificationPermission) {
      if (document.fullscreenElement) await exitFullscreenForNotificationPrompt();
      permission = await api.requestNotificationPermission();
    }
    if (permission !== "granted") {
      setPushNotificationsPreference(false);
      showToast(permission === "denied" ? "Notifications are blocked in this browser." : "Notifications were not allowed.");
      return;
    }
    setPushNotificationsPreference(true);
    await api.enablePushNotifications({ playerName: state?.playerName || "Ruler", skipPermissionRequest: true });
    showToast("Notifications on.");
  } catch (error) {
    if (enabled) setPushNotificationsPreference(false);
    showToast(error?.message || "Could not update notifications.");
  } finally {
    updatePushAlertsUi();
  }
}

async function enablePushNotificationsFromSettings() {
  await setPushNotificationsEnabled(true);
}

async function disablePushNotificationsFromSettings() {
  await setPushNotificationsEnabled(false);
}

function handlePushMessage(event) {
  const detail = event?.detail || {};
  if (detail.type !== "incoming_army") return;
  const message = detail.body || (detail.kind === "scout" ? "Scout incoming." : "Attack incoming.");
  showToast(message);
  updateIncomingAttackUi();
}

function showProfileScreen() {
  if (!state || !profileScreen) return;
  profileScreen.classList.add("open");
  profileScreen.setAttribute("aria-hidden", "false");
  showProfileView();
}

function closeProfileScreen() {
  if (!profileScreen) return;
  profileScreen.classList.remove("open");
  profileScreen.classList.remove("skills-active", "settings-active", "flag-editor-active");
  profileScreen.setAttribute("aria-hidden", "true");
  flagDraft = null;
  activeProfileTab = "profile";
  cancelProfileNameEdit();
}

function showProfileView() {
  if (!profileView || !skillsView || !settingsView || !flagEditorView) return;
  activeProfileTab = "profile";
  profileScreen.classList.remove("skills-active", "settings-active", "flag-editor-active");
  profileView.hidden = false;
  skillsView.hidden = true;
  settingsView.hidden = true;
  flagEditorView.hidden = true;
  flagDraft = null;
  cancelProfileNameEdit();
  updateProfileTabHeader();
  renderProfileScreen();
}

function showProfileSkills() {
  if (!state || !profileView || !skillsView || !settingsView || !flagEditorView) return;
  activeProfileTab = "skills";
  profileScreen.classList.add("skills-active");
  profileScreen.classList.remove("settings-active", "flag-editor-active");
  profileView.hidden = true;
  skillsView.hidden = false;
  settingsView.hidden = true;
  flagEditorView.hidden = true;
  flagDraft = null;
  cancelProfileNameEdit();
  updateProfileTabHeader();
  renderProfileSkills();
}

function showProfileSettings() {
  if (!state || !profileView || !skillsView || !settingsView || !flagEditorView) return;
  activeProfileTab = "settings";
  profileScreen.classList.add("settings-active");
  profileScreen.classList.remove("skills-active", "flag-editor-active");
  profileView.hidden = true;
  skillsView.hidden = true;
  settingsView.hidden = false;
  flagEditorView.hidden = true;
  flagDraft = null;
  cancelProfileNameEdit();
  updateProfileTabHeader();
  updatePushAlertsUi();
}

function updateProfileTabHeader() {
  const showingSkills = activeProfileTab === "skills";
  const showingSettings = activeProfileTab === "settings";
  if (profileScreenTitle) profileScreenTitle.textContent = showingSettings ? "Settings" : showingSkills ? "Skills" : "Profile";
  if (profileTabBtn) {
    profileTabBtn.classList.toggle("active", !showingSkills && !showingSettings);
    profileTabBtn.setAttribute("aria-selected", String(!showingSkills && !showingSettings));
  }
  if (skillsTabBtn) {
    skillsTabBtn.classList.toggle("active", showingSkills);
    skillsTabBtn.setAttribute("aria-selected", String(showingSkills));
  }
  if (settingsTabBtn) {
    settingsTabBtn.classList.toggle("active", showingSettings);
    settingsTabBtn.setAttribute("aria-selected", String(showingSettings));
  }
}

function renderProfileScreen() {
  if (!state || !profileScreen?.classList.contains("open")) return;
  updateProfileTabHeader();
  state.character = normalizeCharacterProgress(state.character);
  state.flag = normalizeFlag(state.flag);
  const summary = getKingdomSummary();
  const globalStats = getGlobalStatsSnapshot();
  const hasMilitaryBreakdown = globalStats?.version >= KING_POWER_AUTHORITY_VERSION;
  const ownedCities = hasMilitaryBreakdown ? [] : getAllOwnedCitiesForDisplay();
  const fallbackComponents = hasMilitaryBreakdown ? [] : ownedCities.map(getCityInfrastructureKingPowerComponents);
  const armyPower = hasMilitaryBreakdown
    ? globalStats.armyPower
    : getTroopKingPower(summary.troops);
  const replacementPower = hasMilitaryBreakdown
    ? globalStats.replacementPower
    : fallbackComponents.reduce((total, component) => total + component.replacementPower, 0);
  const defensivePower = hasMilitaryBreakdown
    ? globalStats.defensivePower
    : fallbackComponents.reduce((total, component) => total + component.defensivePower, 0);
  const baseReplacementPower = hasMilitaryBreakdown
    ? globalStats.baseReplacementPower
    : ownedCities.reduce(
      (total, city) => total + getCityInfrastructureKingPowerComponents(
        city,
        { includeStrongholdBoosts: false }
      ).replacementPower,
      0
    );
  const baseDefensivePower = hasMilitaryBreakdown
    ? globalStats.baseDefensivePower
    : ownedCities.reduce(
      (total, city) => total + getCityInfrastructureKingPowerComponents(
        city,
        { includeStrongholdBoosts: false }
      ).defensivePower,
      0
    );
  const strongholdTroopBonusPercent = hasMilitaryBreakdown
    ? globalStats.strongholdTroopBonusPercent
    : getControlledStrongholdTroopBonusPercent("player");
  const defenseBonusTarget = ownedCities.find(city => city?.owner === "player" && !isStronghold(city));
  const strongholdDefenseBonusPercent = hasMilitaryBreakdown
    ? globalStats.strongholdDefenseBonusPercent
    : getControlledStrongholdCityDefenseBonusPercentForCity(defenseBonusTarget);
  const xpRequired = getXpRequiredForLevel(state.character.level);
  const xpProgress = clamp(state.character.xp / Math.max(1, xpRequired), 0, 1);

  if (profileNameText) profileNameText.textContent = state.playerName;
  if (profileLevelText) profileLevelText.textContent = `Level ${formatNumber(state.character.level)}`;
  if (profileXpLabel) profileXpLabel.textContent = `${formatNumber(state.character.xp)} / ${formatNumber(xpRequired)} XP`;
  if (profileXpFill) profileXpFill.style.width = `${Math.round(xpProgress * 100)}%`;
  if (profileKingPowerStat) {
    profileKingPowerStat.textContent = formatBaseAndBonusStat(summary.baseKingPower, summary.kingPower);
  }
  if (profileKingPowerBreakdown) {
    profileKingPowerBreakdown.textContent = `Army ${formatBaseAndBonusStat(armyPower, armyPower)} | Replacement ${formatBaseAndBonusStat(baseReplacementPower, replacementPower)} | Defense ${formatBaseAndBonusStat(baseDefensivePower, defensivePower)}`;
  }
  if (profileKingPowerStrongholdBonus) {
    const bonusParts = [];
    if (strongholdTroopBonusPercent > 0) bonusParts.push(`+${formatNumber(strongholdTroopBonusPercent)}% troop production`);
    if (strongholdDefenseBonusPercent > 0) bonusParts.push(`+${formatNumber(strongholdDefenseBonusPercent)}% defense`);
    profileKingPowerStrongholdBonus.hidden = bonusParts.length === 0;
    profileKingPowerStrongholdBonus.textContent = bonusParts.length ? `Strongholds: ${bonusParts.join(" | ")}` : "";
  }
  if (profileCitiesStat) profileCitiesStat.textContent = formatNumber(summary.cities);
  if (profileGoldStat) profileGoldStat.textContent = formatNumber(summary.gold);
  if (profileTroopsStat) profileTroopsStat.textContent = formatNumber(summary.troops);
  if (profileGoldProductionStat) {
    profileGoldProductionStat.textContent = formatBaseAndBonusStat(
      summary.baseGoldProductionPerHour,
      summary.goldProductionPerHour,
      "/h"
    );
  }
  if (profileTroopProductionStat) {
    profileTroopProductionStat.textContent = formatBaseAndBonusStat(
      summary.baseTroopProductionPerHour,
      summary.troopProductionPerHour,
      "/h"
    );
  }
  applyFlagToElement(profileKingdomFlag, state.flag);
  updatePushAlertsUi();
  if (activeProfileTab === "skills") renderProfileSkills();
}

function renderProfileSkills() {
  if (!state || !skillsView || skillsView.hidden) return;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  reconcileSkillPoints(state.character, state.upgrades);
  const points = Math.max(0, Math.floor(Number(state.character.skillPoints) || 0));
  const spentPoints = getSpentSkillPoints();
  const canResetSkills = !skillActionInFlight
    && spentPoints > 0;
  skillsView.innerHTML = `
    <div class="profile-skill-summary" aria-label="Hero skill progress">
      <div><span>Skill points</span><strong>${formatNumber(points)}</strong></div>
      <div><span>Points spent</span><strong>${formatNumber(spentPoints)}</strong></div>
    </div>
    <section class="profile-skill-reset">
      <div>
        <strong>Reset skills</strong>
        <small>Costs ${formatNumber(SKILL_RESET_COST)} gold and returns ${formatNumber(spentPoints)} spent ${spentPoints === 1 ? "point" : "points"}.</small>
      </div>
      <button id="resetSkillsBtn" type="button" ${canResetSkills ? "" : "disabled"}>Reset</button>
    </section>
    <div class="profile-skill-list">
      ${SKILL_ORDER.map(skillRow).join("")}
    </div>
  `;
  skillsView.querySelectorAll("button[data-skill]").forEach(buttonElement => {
    buttonElement.addEventListener("click", () => buySkill(buttonElement.dataset.skill));
  });
  skillsView.querySelector("#resetSkillsBtn")?.addEventListener("click", resetSkills);
}

function beginProfileNameEdit() {
  if (!state || !profileNameDisplay || !profileNameEditor) return;
  profileNameDisplay.hidden = true;
  profileNameEditor.hidden = false;
  profileNameInput.value = state.playerName;
  profileNameInput.focus();
  profileNameInput.select();
}

function cancelProfileNameEdit() {
  if (!profileNameDisplay || !profileNameEditor) return;
  profileNameDisplay.hidden = false;
  profileNameEditor.hidden = true;
}

async function saveProfileName() {
  if (!state) return;
  const nextName = cleanName(profileNameInput.value);
  if (!nextName) {
    showToast("Enter a ruler name.");
    return;
  }
  const previousName = state.playerName;
  state.playerName = nextName;
  const mainCity = state.mainCityId ? cityById(state.mainCityId) : null;
  if (mainCity?.name === `${previousName} Keep`) mainCity.name = `${nextName} Keep`;
  playerCities().forEach(city => {
    city.ownerName = nextName;
    markOwnedCityChanged(city, false);
  });
  rememberCurrentPlayerIdentity();
  cancelProfileNameEdit();
  saveGame();
  renderAll();
  renderProfileScreen();
  showToast("Ruler name saved. Updating your cities...");
  const [identityResult, cloudResult] = await Promise.allSettled([
    syncPlayerIdentityToAllOwnedCities({ forceLeaderboard: true }),
    flushOnlineSave(true),
  ]);
  const identitySynced = identityResult.status === "fulfilled" && identityResult.value;
  const cloudSaved = cloudResult.status === "fulfilled" && cloudResult.value;
  if (getOnlineApi()?.isSignedIn?.() && (!identitySynced || !cloudSaved)) {
    showToast("Ruler name saved. Online sync will retry.");
  } else {
    showToast("Ruler name updated everywhere.");
  }
}

function showFlagEditor() {
  if (!state || !profileView || !skillsView || !settingsView || !flagEditorView) return;
  activeProfileTab = "profile";
  profileScreen.classList.add("flag-editor-active");
  profileScreen.classList.remove("skills-active", "settings-active");
  flagDraft = normalizeFlag(state.flag);
  profileView.hidden = true;
  skillsView.hidden = true;
  settingsView.hidden = true;
  flagEditorView.hidden = false;
  updateProfileTabHeader();
  renderFlagEditor();
}

function renderFlagEditor() {
  if (!flagDraft) return;
  applyFlagToElement(flagEditorPreview, flagDraft);
  renderFlagSwatches(flagPrimaryColors, "primary");
  renderFlagSwatches(flagSecondaryColors, "secondary");

  flagPatternOptions.innerHTML = FLAG_PATTERNS.map(option => `<button type="button" data-flag-pattern="${option.key}" class="${flagDraft.pattern === option.key ? "active" : ""}">${option.label}</button>`).join("");
  flagPatternOptions.querySelectorAll("button[data-flag-pattern]").forEach(buttonElement => {
    buttonElement.addEventListener("click", () => {
      flagDraft.pattern = buttonElement.dataset.flagPattern;
      renderFlagEditor();
    });
  });

  flagSymbolOptions.innerHTML = FLAG_SYMBOLS.map(option => `<button type="button" data-flag-symbol="${option.key}" class="${flagDraft.symbol === option.key ? "active" : ""}" aria-label="${option.label}" title="${option.label}">${option.glyph}</button>`).join("");
  flagSymbolOptions.querySelectorAll("button[data-flag-symbol]").forEach(buttonElement => {
    buttonElement.addEventListener("click", () => {
      flagDraft.symbol = buttonElement.dataset.flagSymbol;
      renderFlagEditor();
    });
  });
}

function renderFlagSwatches(container, key) {
  if (!container || !flagDraft) return;
  container.innerHTML = FLAG_COLORS.map(color => `<button type="button" data-flag-color="${color}" class="${flagDraft[key] === color ? "active" : ""}" style="background:${color}" aria-label="Select ${color}"></button>`).join("");
  container.querySelectorAll("button[data-flag-color]").forEach(buttonElement => {
    buttonElement.addEventListener("click", () => {
      flagDraft[key] = buttonElement.dataset.flagColor;
      renderFlagEditor();
    });
  });
}

async function saveFlagEditor() {
  if (!state || !flagDraft) return;
  state.flag = normalizeFlag(flagDraft);
  playerCities().forEach(city => {
    city.ownerFlag = state.flag;
    markOwnedCityChanged(city, false);
  });
  saveGame();
  renderHud();
  renderCities(true);
  showProfileView();
  showToast("Kingdom flag saved. Updating your cities...");
  const [identitySynced, cloudSaved] = await Promise.all([
    syncPlayerIdentityToAllOwnedCities({ forceLeaderboard: true }),
    flushOnlineSave(true),
  ]);
  if (getOnlineApi()?.isSignedIn?.() && (!identitySynced || !cloudSaved)) {
    showToast("Flag saved. Online flag sync will retry.");
  } else {
    showToast("Kingdom flag updated everywhere.");
  }
}

function formatPathNumber(value) {
  return Number(value).toFixed(1);
}

function getMissionSegmentsForRegion(mission, regionId = getActiveMapRegionId()) {
  const activeRegionId = normalizeRegionId(regionId);
  const missionSegments = getMissionRouteSegments(mission);
  const totalLength = Math.max(0.1, missionSegments.reduce((total, segment) => (
    total + Math.max(0.1, Number(segment.length) || routeLength(segment.points))
  ), 0));
  let traversedLength = 0;
  const segments = missionSegments.map(segment => {
    const length = Math.max(0.1, Number(segment.length) || routeLength(segment.points));
    const routeSegment = {
      ...segment,
      length,
      routeStartProgress: traversedLength / totalLength,
      routeEndProgress: (traversedLength + length) / totalLength,
    };
    traversedLength += length;
    return routeSegment;
  }).filter(segment => segment.regionId === activeRegionId);
  if (segments.length) return segments;
  const from = cityById(mission?.fromId);
  const to = getArmyTargetById(mission?.toId);
  if (!from || !to || getCityRegionId(from) !== activeRegionId || getCityRegionId(to) !== activeRegionId) return [];
  const path = normalizeArmyPath(mission?.path);
  if (path.length >= 2) return [{
    regionId: activeRegionId,
    points: path,
    length: Math.max(0, Number(mission?.pathLength) || routeLength(path)),
    routeStartProgress: 0,
    routeEndProgress: 1,
  }];
  const route = findRoute(from, to);
  const fallbackSegments = getRouteSegments(route, activeRegionId);
  const fallbackTotalLength = Math.max(0.1, fallbackSegments.reduce((total, segment) => (
    total + Math.max(0.1, Number(segment.length) || routeLength(segment.points))
  ), 0));
  let fallbackTraversedLength = 0;
  return fallbackSegments.map(segment => {
    const length = Math.max(0.1, Number(segment.length) || routeLength(segment.points));
    const routeSegment = {
      ...segment,
      length,
      routeStartProgress: fallbackTraversedLength / fallbackTotalLength,
      routeEndProgress: (fallbackTraversedLength + length) / fallbackTotalLength,
    };
    fallbackTraversedLength += length;
    return routeSegment;
  }).filter(segment => segment.regionId === activeRegionId);
}

const MARCH_ROUTE_ENDPOINT_TAPER_DISTANCE = 240;

function getTaperedRouteWidth(progress, totalRouteLength) {
  const normalizedProgress = clamp(progress, 0, 1);
  const routeLength = Math.max(0.1, Number(totalRouteLength) || 0.1);
  const distanceFromEndpoint = Math.min(normalizedProgress, 1 - normalizedProgress) * routeLength;
  const taperProgress = clamp(distanceFromEndpoint / MARCH_ROUTE_ENDPOINT_TAPER_DISTANCE, 0, 1);
  const smoothTaper = taperProgress * taperProgress * (3 - 2 * taperProgress);
  return 0.35 + 6.25 * (1 - smoothTaper);
}

function buildTaperedRoutePolygon(points, routeStartProgress = 0, routeEndProgress = 1) {
  const mapPoints = normalizeArmyPath(points).map(point => worldToMapPoint(point));
  if (mapPoints.length < 2) return "";

  const metrics = getPathMetrics(mapPoints);
  if (metrics.total <= 0) return "";
  const progressSpan = Math.max(0.0001, routeEndProgress - routeStartProgress);
  const totalRouteLength = metrics.total / progressSpan;

  let coveredDistance = 0;
  const routePoints = mapPoints.map((point, index) => {
    if (index > 0) coveredDistance += metrics.segments[index - 1]?.length || 0;
    return { point, progress: coveredDistance / metrics.total };
  });

  // Long, straight routes still need interior points for the visible taper.
  [0.25, 0.5, 0.75].forEach(progress => {
    if (routePoints.some(entry => Math.abs(entry.progress - progress) < 0.015)) return;
    routePoints.push({ point: pointAlongRoute(mapPoints, progress), progress });
  });
  [0.25, 0.5, 0.75, 1].forEach(taperStep => {
    const taperProgress = (MARCH_ROUTE_ENDPOINT_TAPER_DISTANCE * taperStep) / totalRouteLength;
    [taperProgress, 1 - taperProgress].forEach(globalProgress => {
      if (globalProgress <= routeStartProgress || globalProgress >= routeEndProgress) return;
      const localProgress = (globalProgress - routeStartProgress) / progressSpan;
      if (routePoints.some(entry => Math.abs(entry.progress - localProgress) < 0.005)) return;
      routePoints.push({ point: pointAlongRoute(mapPoints, localProgress), progress: localProgress });
    });
  });
  routePoints.sort((a, b) => a.progress - b.progress);

  const left = [];
  const right = [];
  routePoints.forEach((entry, index) => {
    const previous = routePoints[Math.max(0, index - 1)].point;
    const next = routePoints[Math.min(routePoints.length - 1, index + 1)].point;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const tangentLength = Math.max(0.001, Math.hypot(dx, dy));
    const normalX = -dy / tangentLength;
    const normalY = dx / tangentLength;
    const globalProgress = routeStartProgress + (routeEndProgress - routeStartProgress) * entry.progress;
    const halfWidth = getTaperedRouteWidth(globalProgress, totalRouteLength) / 2;
    left.push({ x: entry.point.x + normalX * halfWidth, y: entry.point.y + normalY * halfWidth });
    right.push({ x: entry.point.x - normalX * halfWidth, y: entry.point.y - normalY * halfWidth });
  });

  return [...left, ...right.reverse()]
    .map(point => `${formatPathNumber(point.x)},${formatPathNumber(point.y)}`)
    .join(" ");
}

function isPersonalArmy(mission) {
  const currentUid = getCurrentOnlineUid();
  return mission?.owner === "player" || Boolean(currentUid && mission?.ownerUid === currentUid);
}

function getMissionPointAtProgress(mission, progress) {
  const segments = getMissionRouteSegments(mission);
  if (!segments.length) {
    const path = normalizeArmyPath(mission?.path);
    return path.length >= 2
      ? { regionId: getCityRegionId(mission?.fromId), point: pointAlongRoute(path, progress) }
      : null;
  }
  const totalLength = Math.max(0.1, Number(mission?.pathLength) || segments.reduce((total, segment) => total + segment.length, 0));
  let wanted = totalLength * clamp(progress, 0, 1);
  for (const segment of segments) {
    const length = Math.max(0.1, segment.length || routeLength(segment.points));
    if (wanted <= length) {
      return { regionId: segment.regionId, point: pointAlongRoute(segment.points, wanted / length) };
    }
    wanted -= length;
  }
  const lastSegment = segments[segments.length - 1];
  return { regionId: lastSegment.regionId, point: lastSegment.points[lastSegment.points.length - 1] };
}

function renderPaths() {
  if (isCameraInteractionActive()) {
    queueDeferredMapRender();
    return;
  }
  const armies = getRenderableArmies();
  const activeRegionId = getActiveMapRegionId();
  const visibleArmySegments = armies
    .map(attack => ({
      attack,
      segments: getMissionSegmentsForRegion(attack, activeRegionId),
    }))
    .filter(entry => entry.segments.length);
  const signature = [
    activeRegionId,
    visibleArmySegments
      .map(({ attack, segments }) => `${attack.id}:${attack.kind || ""}:${attack.owner || ""}:${attack.ownerUid || ""}:${attack.fromId}:${attack.toId}:${attack.pathLength || 0}:${segments.map(segment => segment.points.length).join(",")}`)
      .join("|"),
  ].join(";");
  if (signature === pathRenderSignature) return;
  pathRenderSignature = signature;
  pathsSvg.innerHTML = "";
  for (const { attack, segments } of visibleArmySegments) {
    const ownerClass = isPersonalArmy(attack) ? "player-route" : "enemy-route";
    const kindClass = attack.kind === "transfer"
      ? "transfer-route"
      : attack.kind === "scout"
        ? "scout-route"
        : "attack-route";
    for (const segment of segments) {
      const linePoints = segment.points.map(point => {
        const mapPoint = worldToMapPoint(point);
        return `${mapPoint.x},${mapPoint.y}`;
      }).join(" ");
      const ribbonPoints = buildTaperedRoutePolygon(
        segment.points,
        segment.routeStartProgress,
        segment.routeEndProgress,
      );
      if (ribbonPoints) {
        const ribbon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        ribbon.setAttribute("points", ribbonPoints);
        ribbon.classList.add("army-route-ribbon", ownerClass, kindClass);
        pathsSvg.appendChild(ribbon);
      }

      const flowLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      flowLine.setAttribute("points", linePoints);
      flowLine.classList.add("army-route-flow", ownerClass, kindClass);
      pathsSvg.appendChild(flowLine);
    }
  }
}

function getVisibleWorldBounds(margin = 420) {
  const mapBounds = getActiveMapBounds();
  if (!mapFrame) {
    return {
      left: mapBounds.left,
      top: mapBounds.top,
      right: mapBounds.right,
      bottom: mapBounds.bottom,
    };
  }
  if (mapViewportWidth <= 0 || mapViewportHeight <= 0) {
    const rect = mapFrame.getBoundingClientRect();
    mapViewportWidth = rect.width;
    mapViewportHeight = rect.height;
  }
  const worldMargin = margin / Math.max(zoom, 0.1);
  const viewport = { width: mapViewportWidth, height: mapViewportHeight };
  const offset = getMapViewportOffset(viewport, getActiveMapDimensions());
  return {
    left: mapBounds.left + camera.x - offset.x / Math.max(zoom, 0.1) - worldMargin,
    top: mapBounds.top + camera.y - offset.y / Math.max(zoom, 0.1) - worldMargin,
    right: mapBounds.left + camera.x + (mapViewportWidth - offset.x) / Math.max(zoom, 0.1) + worldMargin,
    bottom: mapBounds.top + camera.y + (mapViewportHeight - offset.y) / Math.max(zoom, 0.1) + worldMargin,
  };
}

function isPointInBounds(x, y, bounds) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function shouldRenderCityNode(city, bounds) {
  if (!city) return false;
  if (!isCityInActiveMap(city)) return false;
  if (city.id === selectedSourceId || city.id === selectedTargetId || city.id === state?.mainCityId) return true;
  if (scoutNearbySourceId && city.id === scoutNearbySourceId) return true;
  if (regroupSourceId && city.id === regroupSourceId) return true;
  return isPointInBounds(city.x, city.y, bounds);
}

function isCampInActiveMap(camp) {
  return camp && normalizeRegionId(camp.regionId) === getActiveMapRegionId();
}

function shouldRenderCampNode(camp, bounds) {
  return camp && isCampInActiveMap(camp) && (camp.id === selectedTargetId || isPointInBounds(camp.x, camp.y, bounds));
}

function getRewardCampCountdownSeconds(camp) {
  if (!camp?.payoutPending || !camp.payoutAtMs) return 0;
  return Math.max(0, Math.ceil((camp.payoutAtMs - Date.now()) / 1000));
}

function getRewardCampStatusText(camp) {
  if (!camp) return "Unavailable";
  if (!camp.ownerUid) return "Neutral defenders";
  const holder = camp.owner === "player" ? "You" : camp.ownerName || "Rival ruler";
  const countdown = getRewardCampCountdownSeconds(camp);
  if (camp.payoutPending && countdown <= 0) return `${holder} - payout ready`;
  const stateLabel = camp.state === "contested" ? "Contested" : "Held";
  return `${stateLabel} by ${holder} - ${formatDuration(countdown)}`;
}

function getFlagSignature(flag) {
  if (!flag) return "";
  const normalized = normalizeFlag(flag);
  return `${normalized.primary}:${normalized.secondary}:${normalized.pattern}:${normalized.symbol}`;
}

function getCityRenderSignature(visibleCities, visibleCamps = []) {
  const playerFlag = getFlagSignature(state.flag);
  const playerKingPower = getKingPower();
  const crownHolderUid = getCrownCitadelHolderUid();
  const upgradeBlockedTargets = new Set(getRenderableArmies()
    .filter(attack => attack?.kind === "attack" && attack.owner !== "player" && Math.max(0, Number(attack.remaining) || 0) > 0)
    .map(attack => getKnownCityId(attack.toId))
    .filter(Boolean));
  const cityTokens = visibleCities.map(city => {
    const report = city.owner === "player" ? null : getScoutReport(city.id);
    return [
      city.id,
      city.owner,
      city.ownerKind || "",
      city.ownerUid || "",
      city.ownerName || "",
      getFlagSignature(city.ownerFlag),
      getEnemyCityPowerBand(city, playerKingPower),
      city.kind || "",
      city.strongholdType || "",
      isStronghold(city) ? getStrongholdVisualSize(city) : "",
      isCityProtectedByPeaceShield(city) ? getCityPeaceShieldExpiresAtMs(city) : 0,
      city.level,
      city.owner === "player" && Math.floor(Number(city.troops) || 0) > 0 ? 1 : 0,
      city.isMainCity ? 1 : 0,
      upgradeBlockedTargets.has(getKnownCityId(city.id)) ? 1 : 0,
      report ? `${Math.floor(Number(report.troops) || 0)}:${report.expiresAt > state.gameSeconds ? 1 : 0}` : "",
    ].join(":");
  }).join("|");
  const campTokens = visibleCamps.map(camp => {
    const report = getScoutReport(camp.id);
    return [
      camp.id,
      camp.regionId,
      camp.campType,
      camp.x,
      camp.y,
      camp.artSrc,
      camp.size,
      camp.ownerUid || "",
      camp.ownerName || "",
      camp.currentGarrison || 0,
      camp.payoutAtMs || 0,
      camp.state || "neutral",
      report ? `${Math.floor(Number(report.troops) || 0)}:${report.expiresAt > state.gameSeconds ? 1 : 0}` : "",
    ].join(":");
  }).join("|");

  return [
    selectedSourceId || "",
    selectedTargetId || "",
    sendMode ? 1 : 0,
    scoutNearbySourceId || "",
    regroupSourceId || "",
    state.mainCityId || "",
    state.playerName || "",
    playerFlag,
    crownHolderUid,
    campTokens,
    cityTokens,
  ].join(";");
}

function updateVisibleCityDynamicText() {
  if (!state || !cityLayer) return;
  if (isCameraInteractionActive()) return;
  const playerKingPower = getKingPower();
  const campInfoCountdown = modalBody?.querySelector("[data-camp-info-countdown]");
  if (campInfoCountdown) {
    const camp = getCampTargetById(campInfoCountdown.dataset.campInfoCountdown);
    if (camp) {
      const countdown = getRewardCampCountdownSeconds(camp);
      campInfoCountdown.textContent = camp.payoutPending
        ? countdown > 0 ? formatDuration(countdown) : "Payout ready"
        : "Neutral";
    }
  }
  modalBody?.querySelectorAll("[data-citadel-reign-score]").forEach(score => {
    const totalHeldMs = Math.max(0, Number(score.dataset.totalHeldMs) || 0);
    const currentHeldSinceMs = Math.max(0, Number(score.dataset.currentHeldSinceMs) || 0);
    const liveHeldMs = currentHeldSinceMs > 0 ? Math.max(0, Date.now() - currentHeldSinceMs) : 0;
    score.textContent = formatDuration(Math.floor((totalHeldMs + liveHeldMs) / 1000));
  });
  cityLayer.querySelectorAll(".camp-node[data-camp-id]").forEach(node => {
    const camp = getCampTargetById(node.dataset.campId);
    if (!camp) return;
    const statusText = getRewardCampStatusText(camp);
    node.setAttribute("aria-label", `${camp.name}. ${statusText}. ${formatNumber(camp.baseReward)} ${getRewardCampConfig(camp)?.rewardLabel || "reward"} reward.`);
    const timer = node.querySelector(".gold-camp-active-timer");
    if (timer) {
      const countdown = getRewardCampCountdownSeconds(camp);
      timer.hidden = !camp.ownerUid;
      const status = timer.querySelector("small");
      const value = timer.querySelector("strong");
      if (status) status.textContent = camp.state === "contested" ? "Contested" : "Active";
      if (value) value.textContent = camp.payoutPending
        ? countdown > 0 ? formatDuration(countdown) : "Payout ready"
        : "Securing";
    }
    if (camp.owner === "player" && camp.payoutPending && camp.payoutAtMs <= Date.now()) void requestDueRewardCampPayout(camp);
  });
  cityLayer.querySelectorAll(".city-node").forEach(node => {
    const city = cityById(node.dataset.cityId);
    if (!city) return;
    const troops = Math.floor(Number(city.troops) || 0);
    if (node.dataset.troopTextValue === String(troops)) return;
    node.dataset.troopTextValue = String(troops);
    const playerCount = node.querySelector(".city-army-count");
    if (playerCount) playerCount.textContent = `${formatNumber(troops)} troops`;
    const scoutReport = city.owner === "player" ? null : getScoutReport(city.id);
    const knownTroops = city.owner === "player" ? troops : scoutReport?.troops;
    const ownerName = getCityOwnerDisplayName(city);
    const locationType = isStronghold(city) ? "Stronghold" : `Level ${city.level}`;
    const powerBandLabel = getEnemyCityPowerBandLabel(getEnemyCityPowerBand(city, playerKingPower));
    node.setAttribute("aria-label", `${city.name}. ${ownerName}. ${locationType}. ${knownTroops === undefined ? "Unknown troops" : `${formatNumber(knownTroops)} troops`}.${powerBandLabel ? ` ${powerBandLabel}.` : ""}`);
  });
}

function renderCities(force = false) {
  if (isCameraInteractionActive()) {
    queueDeferredMapRender();
    return;
  }
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  let scoutNearbySource = scoutNearbySourceId ? cityById(scoutNearbySourceId) : null;
  if (scoutNearbySourceId && scoutNearbySource?.owner !== "player") {
    scoutNearbySourceId = null;
    scoutNearbySource = null;
  }
  let regroupSource = regroupSourceId ? cityById(regroupSourceId) : null;
  if (regroupSourceId && regroupSource?.owner !== "player") {
    regroupSourceId = null;
    regroupSource = null;
  }
  const visibleBounds = getVisibleWorldBounds();
  const visibleCities = state.cities.filter(city => shouldRenderCityNode(city, visibleBounds));
  const visibleCamps = WORLD_CAMPS
    .map(camp => getCampTargetById(camp.id) || camp)
    .filter(camp => shouldRenderCampNode(camp, visibleBounds));
  const playerKingPower = getKingPower();
  updateMapDensityMode(visibleCities.length + visibleCamps.length);
  const signature = getCityRenderSignature(visibleCities, visibleCamps);
  if (!force && signature === cityRenderSignature) {
    updateVisibleCityDynamicText();
    return;
  }
  cityRenderSignature = signature;

  cityLayer.querySelectorAll(".scout-nearby-radius, .regroup-radius, .city-action-wheel, .gold-camp-action-wheel")
    .forEach(node => node.remove());
  const existingCampNodes = new Map([...cityLayer.querySelectorAll(".camp-node[data-render-camp-id]")]
    .map(node => [node.dataset.renderCampId, node]));
  const existingCityNodes = new Map([...cityLayer.querySelectorAll(".city-node[data-city-id]")]
    .map(node => [node.dataset.cityId, node]));
  if (scoutNearbySource) renderScoutNearbyRadius(scoutNearbySource);
  if (regroupSource) renderRegroupRadius(regroupSource);

  const cityFragment = document.createDocumentFragment();
  visibleCamps.forEach(camp => {
    const mapPoint = worldToMapPoint(camp);
    const interactiveRewardCamp = Boolean(getRewardCampConfig(camp));
    const existingCampNode = existingCampNodes.get(camp.id);
    const campNode = existingCampNode || document.createElement("button");
    existingCampNodes.delete(camp.id);
    campNode.type = "button";
    campNode.dataset.renderCampId = camp.id;
    if (interactiveRewardCamp) campNode.dataset.campId = camp.id;
    else delete campNode.dataset.campId;
    campNode.className = `camp-node camp-${camp.campType || "gold"} ${interactiveRewardCamp ? camp.owner || "neutral" : "decorative"}`;
    if (interactiveRewardCamp && camp.id === selectedTargetId) campNode.classList.add("selected");
    if (interactiveRewardCamp && sendMode && source) campNode.classList.add(camp.owner === "player" ? "supportable" : "attackable");
    campNode.style.left = `${mapPoint.x}px`;
    campNode.style.top = `${mapPoint.y}px`;
    campNode.style.setProperty("--camp-size", `${camp.size}px`);
    if (interactiveRewardCamp) {
      campNode.title = `${camp.name}. ${getRewardCampStatusText(camp)}.`;
      campNode.setAttribute("aria-label", `${camp.name}. ${getRewardCampStatusText(camp)}. ${formatNumber(camp.baseReward)} ${getRewardCampConfig(camp)?.rewardLabel || "reward"} reward.`);
      const countdown = getRewardCampCountdownSeconds(camp);
      const campHtml = `
        <img class="camp-art" src="${escapeHtml(camp.artSrc)}" alt="" draggable="false" />
        <span class="gold-camp-active-timer" ${camp.ownerUid ? "" : "hidden"}>
          <small>${camp.state === "contested" ? "Contested" : "Active"}</small>
          <strong>${camp.payoutPending ? countdown > 0 ? formatDuration(countdown) : "Payout ready" : "Securing"}</strong>
        </span>
        <span class="gold-camp-label">
          <strong>${escapeHtml(camp.name)}</strong>
        </span>`;
      if (campNode._renderContent !== campHtml) {
        campNode.innerHTML = campHtml;
        campNode._renderContent = campHtml;
      }
    } else {
      campNode.tabIndex = -1;
      campNode.setAttribute("aria-hidden", "true");
      const campHtml = `<img class="camp-art" src="${escapeHtml(camp.artSrc)}" alt="" draggable="false" />`;
      if (campNode._renderContent !== campHtml) {
        campNode.innerHTML = campHtml;
        campNode._renderContent = campHtml;
      }
    }
    if (!existingCampNode) cityFragment.appendChild(campNode);
  });
  visibleCities.forEach(city => {
    const mapPoint = worldToMapPoint(city);
    const stronghold = isStronghold(city);
    const existingCityNode = existingCityNodes.get(city.id);
    const btn = existingCityNode || document.createElement("button");
    existingCityNodes.delete(city.id);
    btn.type = "button";
    btn.dataset.cityId = city.id;
    const castleStage = getCastleStage(city.level);
    btn.className = `city-node ${OWNER[city.owner].css} castle-stage-${castleStage}`;
    const enemyPowerBand = getEnemyCityPowerBand(city, playerKingPower);
    if (enemyPowerBand) {
      btn.classList.add(`enemy-power-${enemyPowerBand}`);
      btn.dataset.enemyPowerBand = enemyPowerBand;
    } else {
      delete btn.dataset.enemyPowerBand;
    }
    if (stronghold) btn.classList.add("stronghold-node", `stronghold-${city.strongholdType || "generic"}`);
    const mainCity = !stronghold && (city.owner === "player"
      ? state.mainCityId ? city.id === state.mainCityId : Boolean(city.isMainCity)
      : Boolean(city.isMainCity));
    if (mainCity) btn.classList.add("main-city-node");
    const shielded = !stronghold && isCityProtectedByPeaceShield(city);
    if (shielded) btn.classList.add("peace-shielded");
    if (city.id === selectedSourceId) btn.classList.add("selected");
    if (city.id === selectedTargetId) btn.classList.add("targeted");
    if (scoutNearbySource?.id === city.id) btn.classList.add("scout-radius-source");
    if (regroupSource?.id === city.id) btn.classList.add("regroup-radius-source");
    if (scoutNearbySource && isNearbyScoutCandidate(scoutNearbySource, city)) btn.classList.add("scout-nearby-target");
    if (regroupSource && isNearbyRegroupCandidate(regroupSource, city)) btn.classList.add("regroup-target");
    if (sendMode && source && city.id !== source.id) {
      btn.classList.add(city.owner === "player" ? "supportable" : "attackable");
    }
    btn.style.left = `${mapPoint.x}px`;
    btn.style.top = `${mapPoint.y}px`;
    if (stronghold) btn.style.setProperty("--stronghold-size", `${getStrongholdVisualSize(city)}px`);
    else btn.style.removeProperty("--stronghold-size");
    const scoutReport = city.owner === "player" ? null : getScoutReport(city.id);
    const isSelectedForeign = city.owner !== "player" && city.id === selectedTargetId && !sendMode;
    const ownerName = getCityOwnerDisplayName(city);
    const ownerFlag = renderCityOwnerFlag(city);
    const crownBadge = cityOwnerHoldsCrownCitadel(city)
      ? `<span class="citadel-city-crown" title="Crown Citadel ruler" aria-label="Crown Citadel ruler">&#9819;</span>`
      : "";
    const rivalOwnerName = city.owner === "enemy" && ownerName && ownerName !== OWNER.enemy.label
      ? `<strong class="foreign-ruler-name foreign-ruler-name-inline">${escapeHtml(ownerName)}</strong>`
      : "";
    const cityLabel = city.owner === "player"
      ? `
        <span class="city-label player-city-label">
          ${crownBadge}
          <span class="player-city-banner">
            <span class="city-owner-column">
              ${ownerFlag}
              <span class="city-label-level">${formatNumber(city.level)}</span>
            </span>
            <span class="player-city-data">
              <strong class="city-ruler-name">${escapeHtml(state.playerName)}</strong>
              <span class="city-army-count">${formatNumber(city.troops)} troops</span>
              <strong class="city-name">${escapeHtml(city.name)}</strong>
            </span>
          </span>
        </span>`
      : isSelectedForeign
        ? `
        <span class="city-label foreign-city-label selected-foreign-label">
          ${crownBadge}
          <strong class="foreign-ruler-name">${escapeHtml(ownerName)}</strong>
          <span class="foreign-selected-banner">
            <span class="foreign-selected-level">${formatNumber(city.level)}</span>
            <span class="foreign-selected-crest">${ownerFlag}</span>
            <span class="foreign-selected-data">
              <strong class="city-name">${escapeHtml(city.name)}</strong>
              <span class="foreign-garrison ${scoutReport ? "revealed" : "unknown"}">${scoutReport ? formatNumber(scoutReport.troops) : "?"} troops</span>
            </span>
          </span>
        </span>`
        : `
        <span class="city-label foreign-city-label">
          ${crownBadge}
          ${rivalOwnerName}
          <strong class="city-name">${escapeHtml(city.name)}</strong>
          <span class="foreign-city-shield">
            ${ownerFlag}
            <span class="city-label-level">${formatNumber(city.level)}</span>
          </span>
        </span>`;
    const knownTroops = city.owner === "player" ? city.troops : scoutReport?.troops;
    const locationType = stronghold ? "Stronghold" : `Level ${city.level}`;
    const powerBandLabel = getEnemyCityPowerBandLabel(enemyPowerBand);
    const structureHtml = stronghold
      ? `
      <span class="stronghold-glow" aria-hidden="true"></span>
      <span class="stronghold-building" aria-hidden="true"><img class="stronghold-art" src="${getStrongholdArtSrc(city)}" alt="" draggable="false" /></span>`
      : `
      <span class="city-ring"></span>
      ${shielded ? `<span class="city-shield-field" aria-hidden="true"><img src="assets/royal-peace-shield-field.png?v=20260704-shield-badge" alt="" draggable="false" /></span>` : ""}
      <span class="city-castle stage-${castleStage}" aria-hidden="true"><img class="city-art" src="${getCastleAsset(castleStage)}" alt="" draggable="false" /></span>`;
    btn.setAttribute("aria-label", `${city.name}. ${ownerName}. ${locationType}. ${knownTroops === undefined ? "Unknown troops" : `${formatNumber(knownTroops)} troops`}.${powerBandLabel ? ` ${powerBandLabel}.` : ""}`);
    btn.title = powerBandLabel ? `${city.name} - ${powerBandLabel}` : city.name;
    const cityHtml = `
      ${structureHtml}
      ${cityLabel}
    `;
    if (btn._renderContent !== cityHtml) {
      btn.innerHTML = cityHtml;
      btn._renderContent = cityHtml;
      applyCityOwnerFlags(btn, city);
    }
    if (!existingCityNode) cityFragment.appendChild(btn);
  });
  existingCampNodes.forEach(node => node.remove());
  existingCityNodes.forEach(node => node.remove());
  cityLayer.appendChild(cityFragment);

  updateVisibleCityDynamicText();
  layoutCityLabels();
  const selectedForeign = selectedTargetId ? cityById(selectedTargetId) : null;
  const selectedCamp = selectedTargetId ? getCampTargetById(selectedTargetId) : null;
  if (selectedCamp && !sendMode) renderSelectedRewardCampWheel(selectedCamp);
  else if (selectedForeign && isStronghold(selectedForeign) && !sendMode) renderSelectedStrongholdWheel(selectedForeign);
  else if (selectedForeign && selectedForeign.owner !== "player" && !sendMode) renderSelectedForeignWheel(selectedForeign);
  else if (source?.owner === "player" && isStronghold(source) && !sendMode) renderSelectedStrongholdWheel(source);
  else if (source?.owner === "player" && !sendMode) renderSelectedCityWheel(source);
}

function renderScoutNearbyRadius(source) {
  const targets = getNearbyScoutCandidates(source);
  const mapPoint = worldToMapPoint(source);
  const radius = document.createElement("div");
  radius.className = "scout-nearby-radius";
  radius.style.left = `${mapPoint.x}px`;
  radius.style.top = `${mapPoint.y}px`;
  radius.style.width = `${SCOUT_NEARBY_RADIUS * 2}px`;
  radius.style.height = `${SCOUT_NEARBY_RADIUS * 2}px`;
  radius.innerHTML = `<span>${formatNumber(targets.length)} targets &middot; ${formatNumber(SCOUT_NEARBY_COST)}g</span>`;
  cityLayer.appendChild(radius);
}

function renderRegroupRadius(target) {
  const sources = getNearbyRegroupCandidates(target);
  const troops = sources.reduce((total, city) => total + Math.floor(Number(city.troops) || 0), 0);
  const mapPoint = worldToMapPoint(target);
  const radius = document.createElement("div");
  radius.className = "regroup-radius";
  radius.style.left = `${mapPoint.x}px`;
  radius.style.top = `${mapPoint.y}px`;
  radius.style.width = `${REGROUP_RADIUS * 2}px`;
  radius.style.height = `${REGROUP_RADIUS * 2}px`;
  radius.innerHTML = `<span>${formatNumber(sources.length)} cities &middot; ${formatNumber(troops)} troops &middot; ${formatNumber(REGROUP_COST)}g</span>`;
  cityLayer.appendChild(radius);
}

function renderSelectedCityWheel(city) {
  if (isStronghold(city)) return renderSelectedStrongholdWheel(city);
  const mapPoint = worldToMapPoint(city);
  const wheel = document.createElement("div");
  const levelCost = getLevelCost(city);
  const incomingUpgradeLocked = cityHasIncomingUpgradeBlocker(city);
  const levelDisabled = incomingUpgradeLocked || isStronghold(city) || !Number.isFinite(levelCost) || state.gold < levelCost;
  const levelButtonLabel = incomingUpgradeLocked
    ? `${city.name} cannot be leveled while an attack is incoming`
    : `Level up ${city.name}`;
  const levelCostLabel = incomingUpgradeLocked
    ? "Incoming"
    : isStronghold(city) ? "Fixed" : Number.isFinite(levelCost) ? `${formatNumber(levelCost)}g` : "Unavailable";
  const scoutNearbyActive = scoutNearbySourceId === city.id;
  const regroupActive = regroupSourceId === city.id;
  wheel.className = "city-action-wheel";
  wheel.style.left = `${mapPoint.x}px`;
  wheel.style.top = `${mapPoint.y}px`;
  wheel.innerHTML = `
    <span class="city-wheel-ring" aria-hidden="true"></span>
    <button class="city-wheel-action wheel-level" type="button" aria-label="${escapeHtml(levelButtonLabel)}" title="${escapeHtml(levelButtonLabel)}" ${levelDisabled ? "disabled" : ""}>
      <span class="wheel-icon" aria-hidden="true">\u265C\u2191</span>
      <span class="wheel-action-name">Level</span>
      <span class="wheel-cost">${levelCostLabel}</span>
    </button>
    <button class="city-wheel-action wheel-send" type="button" aria-label="Send troops from ${escapeHtml(city.name)}" ${city.troops < 1 ? "disabled" : ""}>
      <span class="wheel-icon" aria-hidden="true">\u2694</span>
      <span class="wheel-action-name">Send</span>
    </button>
    <button class="city-wheel-action wheel-info" type="button" aria-label="View ${escapeHtml(city.name)} information">
      <span class="wheel-icon" aria-hidden="true">i</span>
    </button>
    <button class="city-wheel-action wheel-scout-nearby ${scoutNearbyActive ? "armed" : ""}" type="button" aria-label="${scoutNearbyActive ? "Confirm scout nearby" : "Preview scout nearby"} from ${escapeHtml(city.name)}" ${city.troops < 1 ? "disabled" : ""}>
      <span class="wheel-icon" aria-hidden="true">&#8857;</span>
      <span class="wheel-action-name">${scoutNearbyActive ? "Send All" : "Nearby"}</span>
      <span class="wheel-cost">${formatNumber(SCOUT_NEARBY_COST)}</span>
    </button>
    <button class="city-wheel-action wheel-regroup ${regroupActive ? "armed" : ""}" type="button" aria-label="${regroupActive ? "Confirm regroup" : "Preview regroup"} to ${escapeHtml(city.name)}">
      <span class="wheel-icon" aria-hidden="true">&#8649;</span>
      <span class="wheel-action-name">${regroupActive ? "Confirm" : "Regroup"}</span>
      <span class="wheel-cost">${formatNumber(REGROUP_COST)}</span>
    </button>
  `;
  wheel.querySelector(".wheel-level").addEventListener("click", event => {
    event.stopPropagation();
    upgradeCity(city.id, 1);
  });
  wheel.querySelector(".wheel-send").addEventListener("click", event => {
    event.stopPropagation();
    beginSendMode(city.id);
  });
  wheel.querySelector(".wheel-info").addEventListener("click", event => {
    event.stopPropagation();
    showCityInfoModal(city.id);
  });
  wheel.querySelector(".wheel-scout-nearby").addEventListener("click", event => {
    event.stopPropagation();
    toggleScoutNearby(city.id);
  });
  wheel.querySelector(".wheel-regroup").addEventListener("click", event => {
    event.stopPropagation();
    toggleRegroup(city.id);
  });
  cityLayer.appendChild(wheel);
}

function renderSelectedForeignWheel(city) {
  if (isStronghold(city)) return renderSelectedStrongholdWheel(city);
  const mapPoint = worldToMapPoint(city);
  const wheel = document.createElement("div");
  const report = getScoutReport(city.id);
  const pendingScout = getPendingScoutMission(city.id);
  const scoutBlockReason = getMainCityScoutBlockReason(city, "player");
  const canScout = !scoutBlockReason && !pendingScout && playerCities().some(playerCity => playerCity.troops >= 1);
  const mainCityBlockReason = getMainCityAttackBlockReason(city, "player");
  const shieldBlockReason = getPeaceShieldAttackBlockReason(city, "player");
  const attackBlockLabel = mainCityBlockReason ? "Main City" : shieldBlockReason ? "Shielded" : "Attack";
  const canAttack = !mainCityBlockReason && !shieldBlockReason && playerCities().some(playerCity => playerCity.troops > 0);
  wheel.className = "city-action-wheel foreign-city-action-wheel";
  wheel.style.left = `${mapPoint.x}px`;
  wheel.style.top = `${mapPoint.y}px`;
  wheel.innerHTML = `
    <span class="city-wheel-ring" aria-hidden="true"></span>
    <button class="city-wheel-action wheel-scout" type="button" aria-label="${scoutBlockReason ? escapeHtml(scoutBlockReason) : `${pendingScout ? "Scout traveling to" : report ? "Scout again" : "Scout"} ${escapeHtml(city.name)}`}" ${canScout ? "" : "disabled"}>
      <span class="wheel-icon" aria-hidden="true">&#128301;</span>
      <span class="wheel-action-name">${scoutBlockReason ? "Main City" : pendingScout ? "Scouting" : report ? "Rescout" : "Scout"}</span>
    </button>
    <button class="city-wheel-action wheel-attack" type="button" aria-label="${mainCityBlockReason ? escapeHtml(mainCityBlockReason) : `Attack ${escapeHtml(city.name)}`}" ${canAttack ? "" : "disabled"}>
      <span class="wheel-icon" aria-hidden="true">&#9876;</span>
      <span class="wheel-action-name">${attackBlockLabel}</span>
    </button>
    <button class="city-wheel-action wheel-info" type="button" aria-label="View ${escapeHtml(city.name)} information">
      <span class="wheel-icon" aria-hidden="true">i</span>
    </button>
    ${report ? `
      <button class="city-wheel-action wheel-report" type="button" aria-label="Open scout report for ${escapeHtml(city.name)}">
        <span class="wheel-icon" aria-hidden="true">&#128221;</span>
        <span class="wheel-action-name">Report</span>
      </button>
    ` : ""}
  `;
  wheel.querySelector(".wheel-scout").addEventListener("click", event => {
    event.stopPropagation();
    scoutCity(city.id);
  });
  wheel.querySelector(".wheel-attack").addEventListener("click", event => {
    event.stopPropagation();
    attackForeignCity(city.id);
  });
  wheel.querySelector(".wheel-info").addEventListener("click", event => {
    event.stopPropagation();
    showCityInfoModal(city.id);
  });
  wheel.querySelector(".wheel-report")?.addEventListener("click", event => {
    event.stopPropagation();
    showScoutReportModal(city.id);
  });
  cityLayer.appendChild(wheel);
}

function renderSelectedStrongholdWheel(stronghold) {
  const mapPoint = worldToMapPoint(stronghold);
  const wheel = document.createElement("div");
  const owned = stronghold.owner === "player";
  const report = owned ? null : getScoutReport(stronghold.id);
  const pendingScout = owned ? null : getPendingScoutMission(stronghold.id);
  const availableSources = playerCities().filter(city => city.id !== stronghold.id && Math.floor(Number(city.troops) || 0) > 0);
  const canScout = !owned && !pendingScout && availableSources.length > 0;
  const canAttack = !owned && availableSources.length > 0;
  const canSend = owned && Math.floor(Number(stronghold.troops) || 0) > 0;
  const canReinforce = owned && availableSources.length > 0;
  const wheelSize = getStrongholdVisualSize(stronghold);
  const actionOffset = Math.max(86, Math.min(148, wheelSize * .62));

  wheel.className = "gold-camp-action-wheel stronghold-objective-action-wheel";
  if (isCrownCitadel(stronghold)) wheel.classList.add("crown-objective-action-wheel");
  wheel.style.left = `${mapPoint.x}px`;
  wheel.style.top = `${mapPoint.y}px`;
  wheel.style.setProperty("--camp-wheel-size", `${wheelSize}px`);
  wheel.style.setProperty("--camp-action-offset", `${actionOffset}px`);
  wheel.innerHTML = `
    <button class="gold-camp-wheel-action camp-scout-action" type="button" aria-label="${owned ? `Send troops from ${escapeHtml(stronghold.name)}` : pendingScout ? `Scout traveling to ${escapeHtml(stronghold.name)}` : report ? `Scout ${escapeHtml(stronghold.name)} again` : `Scout ${escapeHtml(stronghold.name)}`}" ${owned ? canSend ? "" : "disabled" : canScout ? "" : "disabled"}>
      <span aria-hidden="true">${owned ? "&#9876;" : "&#128301;"}</span>
      <strong>${owned ? "Send" : pendingScout ? "Scouting" : report ? "Rescout" : "Scout"}</strong>
    </button>
    <button class="gold-camp-wheel-action camp-info-action" type="button" aria-label="Open ${escapeHtml(stronghold.name)} information">
      <span aria-hidden="true">i</span>
      <strong>Info</strong>
    </button>
    <button class="gold-camp-wheel-action camp-order-action" type="button" aria-label="${owned ? "Reinforce" : "Attack"} ${escapeHtml(stronghold.name)}" ${owned ? canReinforce ? "" : "disabled" : canAttack ? "" : "disabled"}>
      <span aria-hidden="true">${owned ? "&#8649;" : "&#9876;"}</span>
      <strong>${owned ? "Reinforce" : "Attack"}</strong>
    </button>
    ${report ? `
      <button class="gold-camp-wheel-action camp-report-action" type="button" aria-label="Open scout report for ${escapeHtml(stronghold.name)}">
        <span aria-hidden="true">&#128221;</span>
        <strong>Report</strong>
      </button>
    ` : ""}`;

  wheel.querySelector(".camp-scout-action")?.addEventListener("click", event => {
    event.stopPropagation();
    if (owned) beginSendMode(stronghold.id);
    else scoutCity(stronghold.id);
  });
  wheel.querySelector(".camp-order-action")?.addEventListener("click", event => {
    event.stopPropagation();
    if (owned) beginStrongholdReinforcement(stronghold.id);
    else attackForeignCity(stronghold.id);
  });
  wheel.querySelector(".camp-info-action")?.addEventListener("click", event => {
    event.stopPropagation();
    showCityInfoModal(stronghold.id);
  });
  wheel.querySelector(".camp-report-action")?.addEventListener("click", event => {
    event.stopPropagation();
    showScoutReportModal(stronghold.id);
  });
  cityLayer.appendChild(wheel);
}

function beginStrongholdReinforcement(strongholdId) {
  const stronghold = cityById(strongholdId);
  if (!stronghold || !isStronghold(stronghold) || stronghold.owner !== "player") return;
  const sourceOption = findNearestOwnedSourceCandidate(stronghold, 1);
  if (!sourceOption) {
    showToast(`No other owned city with troops can reach ${stronghold.name}.`);
    return;
  }
  selectedSourceId = sourceOption.city.id;
  rememberOwnedAttackSource(sourceOption.city);
  selectedTargetId = stronghold.id;
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = true;
  selectedTroopAmount = clamp(Math.floor(sourceOption.city.troops / 2), 1, sourceOption.city.troops);
  renderSelectionChangeNow();
  showTroopSliderModal(sourceOption.city, stronghold);
}

function renderSelectedRewardCampWheel(camp) {
  const mapPoint = worldToMapPoint(camp);
  const wheel = document.createElement("div");
  const isHeldByPlayer = camp.owner === "player";
  const report = getScoutReport(camp.id);
  const pendingScout = getPendingScoutMission(camp.id);
  const canSend = playerCities().some(city => Math.floor(Number(city.troops) || 0) > 0);
  const canScout = !isHeldByPlayer && !pendingScout && canSend;
  const canRecall = isHeldByPlayer && camp.payoutPending && !rewardCampRecallRequests.has(camp.id);
  const wheelSize = Math.max(112, Number(camp.size) || 132);
  wheel.className = "gold-camp-action-wheel";
  wheel.style.left = `${mapPoint.x}px`;
  wheel.style.top = `${mapPoint.y}px`;
  wheel.style.setProperty("--camp-wheel-size", `${wheelSize}px`);
  wheel.style.setProperty("--camp-action-offset", `${Math.max(82, Math.min(116, wheelSize * .7))}px`);
  wheel.innerHTML = `
    <button class="gold-camp-wheel-action ${isHeldByPlayer ? "camp-recall-action" : "camp-scout-action"}" type="button" aria-label="${isHeldByPlayer ? `Recall stationed troops from ${escapeHtml(camp.name)}` : pendingScout ? `Scout traveling to ${escapeHtml(camp.name)}` : report ? `Scout ${escapeHtml(camp.name)} again` : `Scout ${escapeHtml(camp.name)}`}" ${isHeldByPlayer ? canRecall ? "" : "disabled" : canScout ? "" : "disabled"}>
      <span aria-hidden="true">${isHeldByPlayer ? "&#8630;" : "&#128301;"}</span>
      <strong>${isHeldByPlayer ? rewardCampRecallRequests.has(camp.id) ? "Recalling" : "Recall" : pendingScout ? "Scouting" : report ? "Rescout" : "Scout"}</strong>
    </button>
    <button class="gold-camp-wheel-action camp-info-action" type="button" aria-label="Open ${escapeHtml(camp.name)} information">
      <span aria-hidden="true">i</span>
      <strong>Info</strong>
    </button>
    <button class="gold-camp-wheel-action camp-order-action" type="button" aria-label="${isHeldByPlayer ? "Reinforce" : "Attack"} ${escapeHtml(camp.name)}" ${canSend ? "" : "disabled"}>
      <span aria-hidden="true">${isHeldByPlayer ? "&#8649;" : "&#9876;"}</span>
      <strong>${isHeldByPlayer ? "Reinforce" : "Attack"}</strong>
    </button>
    ${report ? `
      <button class="gold-camp-wheel-action camp-report-action" type="button" aria-label="Open scout report for ${escapeHtml(camp.name)}">
        <span aria-hidden="true">&#128221;</span>
        <strong>Report</strong>
      </button>
    ` : ""}`;
  wheel.querySelector(".camp-scout-action")?.addEventListener("click", event => {
    event.stopPropagation();
    scoutRewardCamp(camp.id);
  });
  wheel.querySelector(".camp-recall-action")?.addEventListener("click", event => {
    event.stopPropagation();
    showRecallRewardCampConfirm(camp.id);
  });
  wheel.querySelector(".camp-order-action")?.addEventListener("click", event => {
    event.stopPropagation();
    beginRewardCampOrder(camp.id);
  });
  wheel.querySelector(".camp-info-action")?.addEventListener("click", event => {
    event.stopPropagation();
    showRewardCampInfoModal(camp.id);
  });
  wheel.querySelector(".camp-report-action")?.addEventListener("click", event => {
    event.stopPropagation();
    showScoutReportModal(camp.id);
  });
  cityLayer.appendChild(wheel);
}

function showRecallRewardCampConfirm(campId) {
  const camp = getCampTargetById(campId);
  if (!camp || camp.owner !== "player" || !camp.payoutPending) {
    showToast("You no longer control that camp.");
    return;
  }
  const troops = Math.max(0, Math.floor(Number(camp.currentGarrison) || 0));
  const sourceName = String(camp.returnSourceCityName || "the city they came from");
  modalTitle.textContent = `Recall from ${camp.name}`;
  modalBody.innerHTML = `
    <div class="relinquish-warning">
      <strong>End this camp hold?</strong>
      <p>${formatNumber(troops)} stationed troops will leave ${escapeHtml(camp.name)} and march to ${escapeHtml(sourceName)}. If that city was lost, they will march to your main city instead.</p>
      <p>The camp will reset to neutral immediately and this hold will award no reward.</p>
      <div class="modal-actions">
        <button id="confirmRecallCampBtn" class="danger-action" type="button">Recall Troops</button>
        <button id="cancelRecallCampBtn" class="safe-action" type="button">Keep Holding</button>
      </div>
    </div>`;
  modalBody.querySelector("#cancelRecallCampBtn")?.addEventListener("click", () => modal.close());
  modalBody.querySelector("#confirmRecallCampBtn")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    const success = await recallRewardCampGarrison(camp.id);
    if (!success && modal.open) event.currentTarget.disabled = false;
  });
  if (!modal.open) modal.showModal();
}

async function recallRewardCampGarrison(campId) {
  if (!state || rewardCampRecallRequests.has(campId)) return false;
  const camp = getCampTargetById(campId);
  const api = getOnlineApi();
  if (!camp || camp.owner !== "player" || !camp.payoutPending) {
    showToast("You no longer control that camp.");
    return false;
  }
  if (!api?.recallRewardCampGarrison || !api?.isSignedIn?.()) {
    showToast("Camp recalls require the online Crownlands server.");
    return false;
  }

  rewardCampRecallRequests.add(campId);
  try {
    const result = await api.recallRewardCampGarrison({
      campId: camp.id,
      regionId: camp.regionId,
    });
    applyServerArmyResult(result);
    if (result?.movement) adoptServerArmyMovement(result.movement);
    const troops = Math.max(0, Math.floor(Number(result?.returningTroops) || 0));
    const destination = result?.returnDestinationName || "your city";
    addLog(`${formatNumber(troops)} troops withdrew from ${camp.name} and began marching to ${destination}.`);
    showToast(`${formatNumber(troops)} troops recalled from ${camp.name}.`);
    if (modal.open) modal.close();
    clearSelection(false);
    saveGame();
    renderAll();
    updateOutgoingAttackUi();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    console.warn("Could not recall reward camp garrison", error);
    showToast(error?.message || "Could not recall troops from that camp.");
    return false;
  } finally {
    rewardCampRecallRequests.delete(campId);
  }
}

function beginRewardCampOrder(campId) {
  const camp = getCampTargetById(campId);
  if (!camp) return;
  const sourceOption = findPreferredAttackSource(camp);
  if (!sourceOption) {
    showToast(`No owned city with troops can reach this ${camp.name}.`);
    return;
  }
  selectedSourceId = sourceOption.city.id;
  rememberOwnedAttackSource(sourceOption.city);
  selectedTargetId = camp.id;
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = true;
  selectedTroopAmount = clamp(Math.floor(sourceOption.city.troops / 2), 1, sourceOption.city.troops);
  renderSelectionChangeNow();
  showTroopSliderModal(sourceOption.city, camp);
}

function selectRewardCamp(campId) {
  if (!state || isGamePausedByOutcome()) return;
  const camp = getCampTargetById(campId);
  if (!camp) return;
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  if (sendMode && source?.owner === "player") {
    selectedTargetId = camp.id;
    renderSelectionChangeNow();
    showTroopSliderModal(source, camp);
    return;
  }
  selectedTargetId = camp.id;
  selectedSourceId = null;
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = false;
  renderSelectionChangeNow();
  requestAnimationFrame(() => centerOnCity(camp.id));
}

function getRewardCampProgressCacheKey(config) {
  const uid = getCurrentOnlineUid();
  return uid && config?.type ? `${uid}:${config.type}` : "";
}

function normalizeRewardCampProgress(config, raw = {}) {
  const today = currentUtcDateKey();
  const date = String(raw?.date || "").slice(0, 10);
  const count = date === today ? Math.max(0, Math.floor(Number(raw?.count) || 0)) : 0;
  const rewardsToday = date === today && Array.isArray(raw?.rewards)
    ? raw.rewards.slice(-Math.max(1, Math.floor(Number(config?.maxDailyRewards) || RELIC_CAMP_DAILY_REWARD_LIMIT))).map(entry => ({
        itemId: String(entry?.itemId || "").slice(0, 64),
        itemName: String(entry?.itemName || "Unknown item").slice(0, 80),
        rarity: String(entry?.rarity || "").slice(0, 24),
        awardedAtMs: normalizeTimestampMs(entry?.awardedAtMs || entry?.awardedAt),
        campId: String(entry?.campId || "").slice(0, 96),
        campName: String(entry?.campName || config?.name || "Relic Camp").slice(0, 80),
      })).filter(entry => entry.itemId)
    : [];
  return {
    campType: config?.type || "",
    date: today,
    count,
    lastReward: date === today ? Math.max(0, Math.floor(Number(raw?.lastReward) || 0)) : 0,
    lastCampId: date === today ? String(raw?.lastCampId || "") : "",
    lastClaimedAtMs: date === today ? normalizeTimestampMs(raw?.lastClaimedAtMs) : 0,
    rewards: rewardsToday,
    maxDailyRewards: Math.max(0, Math.floor(Number(raw?.maxDailyRewards) || config?.maxDailyRewards || 0)),
  };
}

function cacheRewardCampProgress(config, raw = {}) {
  const cacheKey = getRewardCampProgressCacheKey(config);
  const normalized = normalizeRewardCampProgress(config, raw);
  if (!cacheKey) return normalized;
  const previous = rewardCampProgressCache.get(cacheKey)?.progress;
  const progress = previous?.date === normalized.date && previous.count > normalized.count
    ? previous
    : normalized;
  rewardCampProgressCache.set(cacheKey, { progress, fetchedAtMs: Date.now() });
  return progress;
}

function getCachedRewardCampProgress(config) {
  const cacheKey = getRewardCampProgressCacheKey(config);
  if (!cacheKey) return null;
  const cached = rewardCampProgressCache.get(cacheKey) || null;
  if (cached?.progress?.date && cached.progress.date !== currentUtcDateKey()) {
    rewardCampProgressCache.delete(cacheKey);
    return null;
  }
  return cached;
}

async function loadRewardCampProgress(config) {
  const api = getOnlineApi();
  const cacheKey = getRewardCampProgressCacheKey(config);
  if (!cacheKey || !api?.isSignedIn?.() || !api?.loadRewardCampProgress) {
    throw new Error("Reward progress requires an online account.");
  }
  const cached = rewardCampProgressCache.get(cacheKey);
  if (cached?.progress?.date === currentUtcDateKey() && Date.now() - cached.fetchedAtMs < REWARD_CAMP_PROGRESS_CACHE_MS) {
    return cached.progress;
  }
  if (rewardCampProgressRequests.has(cacheKey)) return rewardCampProgressRequests.get(cacheKey);
  const request = api.loadRewardCampProgress(config.type)
    .then(raw => cacheRewardCampProgress(config, raw || {}))
    .finally(() => rewardCampProgressRequests.delete(cacheKey));
  rewardCampProgressRequests.set(cacheKey, request);
  return request;
}

function relicCampProgressMarkup(config, progress, status = "ready") {
  if (status === "loading") {
    return `<div class="camp-reward-loading"><span class="camp-reward-spinner" aria-hidden="true"></span><strong>Loading Relic Camp rewards...</strong></div>`;
  }
  if (status === "error") {
    return `<div class="camp-reward-loading error"><strong>Reward progress unavailable</strong><p>Your Relic Camp rewards are still tracked by the server. Reopen this panel once the connection is ready.</p></div>`;
  }
  const configuredMaxRewards = Number(config?.maxDailyRewards);
  const maxRewards = Math.max(
    0,
    Math.floor(Number.isFinite(configuredMaxRewards) ? configuredMaxRewards : RELIC_CAMP_DAILY_REWARD_LIMIT)
  );
  const claimed = clamp(Math.floor(Number(progress?.count) || 0), 0, maxRewards);
  const completed = maxRewards === 0 || claimed >= maxRewards;
  const progressPercent = maxRewards > 0 ? Math.round(claimed / maxRewards * 100) : 100;
  const drops = (Array.isArray(config?.itemDrops) ? config.itemDrops : RELIC_CAMP_DROP_TABLE).map(item => `
    <li class="relic-drop-row rarity-${escapeHtml(String(item.rarity || "common").toLowerCase())}">
      <span class="relic-drop-name"><strong>${escapeHtml(item.itemName)}</strong><small>${escapeHtml(item.rarity)}</small></span>
      <em>${formatNumber(item.chance)}%</em>
    </li>`).join("");
  const rewardsToday = Array.isArray(progress?.rewards) ? [...progress.rewards].reverse() : [];
  const history = rewardsToday.length
    ? rewardsToday.map(entry => {
        const awardedAtMs = normalizeTimestampMs(entry.awardedAtMs);
        const awardedAt = awardedAtMs
          ? new Date(awardedAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "Time unavailable";
        return `
          <li class="camp-reward-row claimed relic-reward-history-row">
            <span class="camp-reward-check" aria-hidden="true">&#10003;</span>
            <span class="camp-reward-copy"><small>${escapeHtml(entry.rarity || "Item reward")}</small><strong>${escapeHtml(entry.itemName || "Usable item")}</strong></span>
            <em>${escapeHtml(awardedAt)}</em>
          </li>`;
      }).join("")
    : `<li class="relic-reward-empty">No Relic Camp items earned today.</li>`;
  return `
    <div class="camp-reward-overview">
      <div><span>Today's rewards</span><strong>${claimed} / ${maxRewards} claimed</strong></div>
      <div><span>Eligibility</span><strong>${completed ? "Limit reached" : "Reward available"}</strong></div>
    </div>
    <div class="camp-reward-meter" role="progressbar" aria-label="Daily Relic Camp rewards" aria-valuemin="0" aria-valuemax="${maxRewards}" aria-valuenow="${claimed}"><span style="width:${progressPercent}%"></span></div>
    ${completed ? `<p class="relic-limit-message">Daily reward limit reached. You can still fight for this camp, but you will not receive another reward today.</p>` : ""}
    <h3 class="relic-reward-heading">Possible item drops</h3>
    <ul class="relic-drop-table">${drops}</ul>
    <h3 class="relic-reward-heading">Today's rewards</h3>
    <ol class="camp-reward-list relic-reward-history">${history}</ol>
    <p class="camp-reward-reset">Relic Camp rewards reset at 00:00 UTC.</p>`;
}

function getRewardCampEstimatedRewards(config) {
  const minimums = Array.isArray(config?.dailyRewards) ? config.dailyRewards : [];
  const rewardHours = Array.isArray(config?.rewardHours) ? config.rewardHours : [];
  const globalStats = normalizeGlobalStatsSnapshot(state?.globalStats);
  const hourlyRate = config?.rewardType === "troops"
    ? Math.max(0, Number(globalStats?.untimedTroopPerHour) || 0)
    : Math.max(0, Number(globalStats?.untimedGoldPerHour) || 0);
  return minimums.map((minimum, index) => Math.max(
    0,
    Math.floor(Number(minimum) || 0),
    Math.floor(hourlyRate * Math.max(0, Number(rewardHours[index]) || 0))
  ));
}

function rewardCampProgressMarkup(config, progress, status = "ready") {
  if (config?.type === "items") return relicCampProgressMarkup(config, progress, status);
  if (status === "loading") {
    return `<div class="camp-reward-loading"><span class="camp-reward-spinner" aria-hidden="true"></span><strong>Loading reward progress...</strong></div>`;
  }
  if (status === "error") {
    return `<div class="camp-reward-loading error"><strong>Reward progress unavailable</strong><p>Your rewards are still tracked by the server. Reopen this panel once the connection is ready.</p></div>`;
  }
  const rewards = getRewardCampEstimatedRewards(config);
  const minimums = Array.isArray(config?.dailyRewards) ? config.dailyRewards : [];
  const rewardHours = Array.isArray(config?.rewardHours) ? config.rewardHours : [];
  const claimed = clamp(Math.floor(Number(progress?.count) || 0), 0, rewards.length);
  const completed = claimed >= rewards.length;
  const nextReward = completed ? 0 : Math.max(0, Math.floor(Number(rewards[claimed]) || 0));
  const progressPercent = rewards.length > 0 ? Math.round(claimed / rewards.length * 100) : 0;
  const rows = rewards.map((reward, index) => {
    const isClaimed = index < claimed;
    const isNext = index === claimed;
    const rowState = isClaimed ? "claimed" : isNext ? "next" : "upcoming";
    const stateLabel = isClaimed ? "Claimed" : isNext ? "Next" : "Upcoming";
    return `
      <li class="camp-reward-row ${rowState}">
        <span class="camp-reward-check" aria-hidden="true">${isClaimed ? "&#10003;" : index + 1}</span>
        <span class="camp-reward-copy">
          <small>Claim ${index + 1}${rewardHours[index] ? ` &middot; ${formatNumber(rewardHours[index])}h base production` : ""}</small>
          <strong>${formatNumber(reward)} ${escapeHtml(config.rewardLabel)}</strong>
          ${reward > minimums[index] ? `<small>Current estimate; minimum ${formatNumber(minimums[index])}</small>` : ""}
        </span>
        <em>${stateLabel}</em>
      </li>`;
  }).join("");
  return `
    <div class="camp-reward-overview">
      <div><span>Today's progress</span><strong>${claimed} / ${rewards.length}</strong></div>
      <div><span>Next reward</span><strong>${completed ? "Complete" : `${formatNumber(nextReward)} ${escapeHtml(config.rewardLabel)}`}</strong></div>
    </div>
    <div class="camp-reward-meter" role="progressbar" aria-label="Daily camp reward progress" aria-valuemin="0" aria-valuemax="${rewards.length}" aria-valuenow="${claimed}"><span style="width:${progressPercent}%"></span></div>
    <ol class="camp-reward-list">${rows}</ol>
    <p class="camp-reward-reset">${completed ? "Further successful holds award 0 today. " : ""}The reward ladder resets at 00:00 UTC.</p>`;
}

function findRewardCampProgressPanel(campId) {
  return [...modalBody.querySelectorAll("[data-camp-reward-panel]")]
    .find(panel => panel.dataset.campRewardPanel === String(campId || "")) || null;
}

function renderRewardCampProgressPanel(campId, config, progress, status = "ready") {
  const panel = findRewardCampProgressPanel(campId);
  if (!panel) return;
  panel.innerHTML = rewardCampProgressMarkup(config, progress, status);
}

function refreshRewardCampProgressPanel(campId, config) {
  const cached = getCachedRewardCampProgress(config);
  renderRewardCampProgressPanel(campId, config, cached?.progress, cached ? "ready" : "loading");
  void loadRewardCampProgress(config)
    .then(progress => renderRewardCampProgressPanel(campId, config, progress))
    .catch(error => {
      console.warn("Could not load reward camp progress", error);
      if (!cached) renderRewardCampProgressPanel(campId, config, null, "error");
    });
}

function getDeedCampHistoryCacheKey(camp = {}) {
  return camp?.id ? `${normalizeRegionId(camp.regionId)}:${camp.id}` : "";
}

function getDeedCampHistoryCityName(entry = {}) {
  const cityId = getKnownCityId(entry.cityId);
  const base = cityId ? getPlayableBaseCityById(cityId) : null;
  if (base) return getCanonicalCityName(base, { id: cityId, regionId: entry.regionId });
  return String(entry.cityName || cityId || "Unknown city").slice(0, 80);
}

function deedCampHistoryMarkup(history = [], status = "ready") {
  if (status === "loading") {
    return `<div class="camp-reward-loading"><span class="camp-reward-spinner" aria-hidden="true"></span><strong>Loading reward history...</strong></div>`;
  }
  if (status === "error") {
    return `<div class="camp-reward-loading error"><strong>Reward history unavailable</strong><p>The server history was not changed. Reopen this tab once the connection is ready.</p></div>`;
  }
  if (!history.length) {
    return `<div class="camp-reward-loading deed-history-empty"><strong>No cities awarded yet</strong><p>Successful Deed Camp holds will appear here.</p></div>`;
  }
  return `
    <ol class="deed-camp-history-list">
      ${history.map(entry => {
        const awardedAtMs = normalizeTimestampMs(entry.awardedAtMs);
        const awardedAt = awardedAtMs ? new Date(awardedAtMs).toLocaleString() : "Award time unavailable";
        const cityName = getDeedCampHistoryCityName(entry);
        return `
          <li class="deed-camp-history-row">
            <span class="deed-history-city" aria-hidden="true">&#9813;</span>
            <span class="deed-history-copy">
              <strong>${escapeHtml(cityName)}</strong>
              <span>${escapeHtml(entry.regionName || getRegionLabel(entry.regionId))}</span>
              <small>Awarded to ${escapeHtml(entry.awardedToDisplayName || "Ruler")} &middot; ${escapeHtml(awardedAt)}</small>
            </span>
            <button class="battle-report-locate-btn deed-history-locate" type="button" data-deed-history-jump="${escapeHtml(entry.cityId)}" data-deed-history-region="${escapeHtml(entry.regionId)}" aria-label="Go to ${escapeHtml(cityName)}">&#8982;</button>
          </li>`;
      }).join("")}
    </ol>
    <p class="camp-reward-reset">Showing the latest ${formatNumber(history.length)} awards from this Deed Camp.</p>`;
}

function findDeedCampHistoryPanel(campId) {
  return [...modalBody.querySelectorAll("[data-deed-history-panel]")]
    .find(panel => panel.dataset.deedHistoryPanel === String(campId || "")) || null;
}

function bindDeedCampHistoryLocationButtons(panel) {
  panel?.querySelectorAll("[data-deed-history-jump]").forEach(button => {
    button.addEventListener("click", () => {
      void focusBattleReportTarget(
        button.dataset.deedHistoryJump,
        button.dataset.deedHistoryRegion || ""
      );
    });
  });
}

function renderDeedCampHistoryPanel(campId, history = [], status = "ready") {
  const panel = findDeedCampHistoryPanel(campId);
  if (!panel) return;
  panel.innerHTML = deedCampHistoryMarkup(history, status);
  if (status === "ready") bindDeedCampHistoryLocationButtons(panel);
}

function refreshDeedCampHistoryPanel(camp, { force = false } = {}) {
  const api = getOnlineApi();
  const cacheKey = getDeedCampHistoryCacheKey(camp);
  if (!cacheKey || !api?.isSignedIn?.() || !api?.loadRewardCampHistory) {
    renderDeedCampHistoryPanel(camp.id, [], "error");
    return;
  }
  const cached = deedCampHistoryCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.fetchedAtMs < REWARD_CAMP_PROGRESS_CACHE_MS) {
    renderDeedCampHistoryPanel(camp.id, cached.history);
    return;
  }
  renderDeedCampHistoryPanel(camp.id, cached?.history || [], cached ? "ready" : "loading");
  if (deedCampHistoryRequests.has(cacheKey)) return;
  const request = api.loadRewardCampHistory({
    islandId: getOnlineIslandId(camp.regionId),
    campId: camp.id,
    limitCount: 25,
  }).then(history => {
    const cleanHistory = Array.isArray(history) ? history.slice(0, 25) : [];
    deedCampHistoryCache.set(cacheKey, { history: cleanHistory, fetchedAtMs: Date.now() });
    renderDeedCampHistoryPanel(camp.id, cleanHistory);
    return cleanHistory;
  }).catch(error => {
    console.warn("Could not load Deed Camp reward history", error);
    if (!cached) renderDeedCampHistoryPanel(camp.id, [], "error");
  }).finally(() => deedCampHistoryRequests.delete(cacheKey));
  deedCampHistoryRequests.set(cacheKey, request);
}

function showRewardCampInfoModal(campId) {
  const camp = getCampTargetById(campId);
  if (!camp) {
    showToast("Reward camp state is unavailable.");
    return;
  }
  const config = getRewardCampConfig(camp);
  if (!config) return;
  const isDeedCamp = config.type === "deed";
  const isRelicCamp = config.type === "items";
  const holdMinutes = Math.floor(config.holdSeconds / 60);
  const rewardDestination = isDeedCamp
    ? "The awarded neutral city immediately becomes the holder's city without a battle or troop march."
    : isRelicCamp
      ? "One random usable item is added directly to the holder's bag when a rewarded hold completes."
    : config.rewardType === "troops"
    ? "The troop reward is delivered to the holder's main city."
    : "The gold reward is added directly to the holder's treasury.";
  const report = camp.owner === "player" ? null : getScoutReport(camp.id);
  const holderHasAccess = camp.owner === "player";
  const visibleStats = holderHasAccess || report
    ? (() => {
        const troops = holderHasAccess
          ? Math.max(0, Math.floor(Number(camp.currentGarrison) || 0))
          : Math.max(0, Math.floor(Number(report.troops) || 0));
        const liveStats = holderHasAccess ? getCityStats({ ...camp, troops, troopFloat: troops }) : null;
        const defenseLevel = holderHasAccess
          ? Math.max(1, Math.floor(Number(liveStats.level) || camp.defenseLevel || config.defenseLevel))
          : Math.max(1, Math.floor(Number(report.cityLevel) || camp.defenseLevel || config.defenseLevel));
        const defensePercent = holderHasAccess
          ? Math.max(0, Number(liveStats.defensePercent) || 0)
          : Math.max(0, Number(report.defensePercent) || 0);
        const troopDefense = holderHasAccess
          ? Math.floor(troops * (1 + defensePercent / 100))
          : Math.max(0, Math.floor(Number(report.troopDefense) || troops * (1 + defensePercent / 100)));
        return {
          troops,
          defenseLevel,
          defensePercent,
          troopDefense,
          baseFortifications: holderHasAccess
            ? Math.max(0, Math.floor(Number(liveStats.baseCityWalls) || 0))
            : Math.max(0, Math.floor(
              Number(report.baseCityWalls)
              || Math.max(0, (Number(report.cityWalls) || 0) - (Number(report.stoneworksBonus) || 0))
            )),
          fortifications: holderHasAccess
            ? Math.max(0, Math.floor(Number(liveStats.cityWalls) || 0))
            : Math.max(0, Math.floor(Number(report.cityWalls) || 0)),
          territoryDefensePercent: holderHasAccess
            ? Math.max(0, Number(liveStats.strongholdDefenseBonusPercent) || 0)
            : Math.max(0, Number(report.strongholdDefenseBonusPercent) || 0),
          totalDefense: holderHasAccess
            ? Math.max(0, Math.floor(Number(liveStats.totalDefense) || 0))
            : Math.max(0, Math.floor(Number(report.totalDefense) || 0)),
          baseTotalDefense: holderHasAccess
            ? Math.max(0, Math.floor(Number(liveStats.baseTotalDefense) || 0))
            : Math.max(0, Math.floor(
              Number(report.baseTotalDefense)
              || (troopDefense + Math.max(
                0,
                (Number(report.cityWalls) || 0) - (Number(report.stoneworksBonus) || 0)
              ))
            )),
        };
      })()
    : null;
  const countdown = getRewardCampCountdownSeconds(camp);
  const controller = camp.owner === "player" ? "You" : camp.ownerUid ? camp.ownerName || "Rival ruler" : "Neutral";
  const statsSourceLabel = holderHasAccess ? "Live holder stats" : report ? "Scout report snapshot" : "Scouting required";
  const reportRemaining = report ? Math.max(0, Math.ceil(report.expiresAt - state.gameSeconds)) : 0;
  const statsMarkup = visibleStats
    ? `
      <div class="gold-camp-info-grid camp-defense-grid">
        <div><span>Stationed troops</span><strong>${formatNumber(visibleStats.troops)}</strong></div>
        <div><span>Defense level</span><strong>${formatNumber(visibleStats.defenseLevel)}</strong></div>
        <div><span>Troop defense</span><strong>${formatNumber(visibleStats.troopDefense)}</strong><small>Level bonus +${formatNumber(visibleStats.defensePercent)}%</small></div>
        <div><span>Fortifications</span><strong>${formatBaseAndBonusStat(visibleStats.baseFortifications, visibleStats.fortifications)}</strong><small>Base walls and skill bonus</small></div>
        <div class="camp-total-defense"><span>Total defense</span><strong>${formatBaseAndBonusStat(visibleStats.baseTotalDefense, visibleStats.totalDefense)}</strong><small>${visibleStats.territoryDefensePercent > 0 ? `Stronghold +${formatNumber(visibleStats.territoryDefensePercent)}%` : "Base defense and active bonuses"}</small></div>
      </div>
      ${report ? `<p class="camp-scout-expiry">Scout snapshot expires in <strong>${formatDuration(reportRemaining)}</strong>. Reinforcements or battles after the scout arrived are not revealed.</p>` : ""}`
    : `
      <div class="camp-stats-locked">
        <span class="camp-stats-lock" aria-hidden="true">&#128274;</span>
        <strong>Camp defenses hidden</strong>
        <p>Scout this camp to reveal its stationed troops and defense stats.</p>
      </div>`;
  const rewardPanelMarkup = isDeedCamp
    ? `<div data-deed-history-panel="${escapeHtml(camp.id)}">${deedCampHistoryMarkup([], "loading")}</div>`
    : rewardCampProgressMarkup(config, null, "loading");
  const rewardConditionMarkup = isDeedCamp
    ? `<p class="deed-camp-condition">Hold this camp for ${formatNumber(holdMinutes)} minutes to receive one random eligible neutral gray city. A player can receive one Deed Camp city per UTC day. This remains separate from the normal neutral-city capture limit.</p>`
    : isRelicCamp
      ? `<p class="deed-camp-condition">Hold this camp for ${formatNumber(holdMinutes)} minutes to receive one random usable item. Up to ${formatNumber(config.maxDailyRewards || RELIC_CAMP_DAILY_REWARD_LIMIT)} Relic Camp item rewards can be earned per player each UTC day.</p>`
      : "";
  const estimatedCampRewards = !isDeedCamp && !isRelicCamp
    ? getRewardCampEstimatedRewards(config)
    : [];
  const rulesMarkup = isDeedCamp
    ? `
      <div class="gold-camp-description deed-camp-help">
        <strong>How it works</strong>
        <p>Capture and hold the Deed Camp for ${formatNumber(holdMinutes)} minutes. If you still control it when the timer ends, you are awarded one random eligible neutral gray city. Each player can receive one Deed Camp city per UTC day. This reward is separate from normal gray-city captures and can happen whether you are below, at, or above the normal neutral-city daily capture limit.</p>
        <p>Other players can attack and steal the camp before the timer finishes. If control changes, the public timer restarts for the new holder. The Reward History tab shows cities previously awarded by this camp.</p>
        <p>The awarded city is chosen automatically. No Deed Token or inventory item is given, and no battle XP is awarded because no battle happened for that city.</p>
        <p>The normal neutral-city capture limit still applies to regular attacks on gray cities. A Deed Camp reward does not use that limit and is granted whether the holder is below, at, or above it.</p>
        <p>After payout, stationed troops march back to their origin city, or to the holder's main city if the origin was lost. The camp then resets to neutral with its fixed defenders.</p>
      </div>`
    : isRelicCamp
      ? `
      <div class="gold-camp-description deed-camp-help">
        <strong>How it works</strong>
        <p>Capture and hold the Relic Camp for ${formatNumber(holdMinutes)} minutes. If you still control it when the public timer ends, you receive one random usable item based on rarity.</p>
        <p>You can earn up to ${formatNumber(config.maxDailyRewards || RELIC_CAMP_DAILY_REWARD_LIMIT)} Relic Camp item rewards per UTC day. After that, you can still attack, capture, reinforce, and hold the camp, but you will not receive another item until the daily reset.</p>
        <p>The reward is added directly to your bag. No relic fragments, gold, troops, battle XP, or leaderboard points are awarded by the payout.</p>
        <p>Other players can attack and steal this camp before payout. Royal Peace Shield does not protect camp ownership, and the camp does not count as a city or use neutral-city capture limits.</p>
        <p>After payout or a no-reward completion, stationed troops march back to their origin city, or to the holder's main city if the origin was lost. The camp resets to neutral with its fixed defenders.</p>
      </div>`
    : `
      <div class="gold-camp-description">
        <strong>How it works</strong>
        <p>Attack and capture this special objective, then hold it for ${formatNumber(holdMinutes)} minutes. Rewards scale with your kingdom's permanent base production, with a guaranteed minimum. The public timer begins when control changes and restarts if another ruler captures the camp before payout.</p>
        <p>${escapeHtml(rewardDestination)} When the timer ends, all stationed troops leave in a return march to their origin city, or to the holder's main city if the origin was lost. The camp then resets to neutral.</p>
        <p>Camps do not count as cities, cannot be shielded, allow unlimited stationed defenders, and ignore weaker-kingdom attack limits.</p>
        <p>Today's estimated rewards: ${estimatedCampRewards.map(value => `${formatNumber(value)} ${config.rewardLabel}`).join(", ")}. Further successful holds award 0 until the next UTC day.</p>
      </div>`;
  modalTitle.textContent = camp.name;
  modalBody.innerHTML = `
    <div class="gold-camp-info-panel">
      <div class="camp-info-tabs" role="tablist" aria-label="${escapeHtml(camp.name)} information">
        <button id="campStatsTab" class="camp-info-tab active" type="button" role="tab" aria-selected="true" aria-controls="campStatsPanel" data-camp-info-tab="stats">${isDeedCamp || isRelicCamp ? "Status" : "Stats"}</button>
        <button id="campRewardTab" class="camp-info-tab" type="button" role="tab" aria-selected="false" aria-controls="campRewardPanel" data-camp-info-tab="reward">${isDeedCamp ? "Reward History" : "Reward"}</button>
        <button id="campRulesTab" class="camp-info-tab camp-rules-tab" type="button" role="tab" aria-label="How this camp works" aria-selected="false" aria-controls="campRulesPanel" data-camp-info-tab="rules">?</button>
      </div>

      <section id="campStatsPanel" class="camp-info-tab-panel" role="tabpanel" aria-labelledby="campStatsTab" data-camp-info-panel="stats">
        <div class="camp-public-status">
          <div><span>Controller</span><strong>${escapeHtml(controller)}</strong></div>
          <div><span>Status</span><strong data-camp-info-countdown="${escapeHtml(camp.id)}">${camp.payoutPending ? countdown > 0 ? formatDuration(countdown) : "Payout ready" : "Neutral"}</strong></div>
          <small class="camp-stats-source">${escapeHtml(statsSourceLabel)}</small>
        </div>
        ${rewardConditionMarkup}
        ${statsMarkup}
      </section>

      <section id="campRewardPanel" class="camp-info-tab-panel" role="tabpanel" aria-labelledby="campRewardTab" data-camp-info-panel="reward" data-camp-reward-panel="${escapeHtml(camp.id)}" hidden>
        ${rewardPanelMarkup}
      </section>

      <section id="campRulesPanel" class="camp-info-tab-panel" role="tabpanel" aria-labelledby="campRulesTab" data-camp-info-panel="rules" hidden>
        ${rulesMarkup}
      </section>
    </div>`;
  const tabs = [...modalBody.querySelectorAll("[data-camp-info-tab]")];
  const panels = [...modalBody.querySelectorAll("[data-camp-info-panel]")];
  tabs.forEach(tab => tab.addEventListener("click", () => {
    const selectedTab = tab.dataset.campInfoTab;
    tabs.forEach(candidate => {
      const selected = candidate === tab;
      candidate.classList.toggle("active", selected);
      candidate.setAttribute("aria-selected", selected ? "true" : "false");
    });
    panels.forEach(panel => {
      panel.hidden = panel.dataset.campInfoPanel !== selectedTab;
    });
    if (isDeedCamp && selectedTab === "reward") refreshDeedCampHistoryPanel(camp, { force: true });
  }));
  if (!modal.open) modal.showModal();
  if (!isDeedCamp) refreshRewardCampProgressPanel(camp.id, config);
}

function showScoutReportModal(cityId) {
  const city = getArmyTargetById(cityId);
  const report = getScoutReport(cityId);
  if (!city || !report) {
    showToast("That scout report is no longer available.");
    if (state) renderAll();
    return;
  }
  const remaining = Math.max(0, Math.ceil(report.expiresAt - state.gameSeconds));
  const age = Math.max(0, Math.floor(state.gameSeconds - report.scoutedAt));
  const reportedOwner = OWNER[report.owner] ? report.owner : city.owner;
  const reportedOwnerName = report.ownerName || getCityOwnerDisplayName(city);
  const cityLevel = clampCityLevel(report.cityLevel || city.level);
  const defensePercent = Math.max(0, Number(report.defensePercent) || cityLevel * CITY_LEVEL_STATS.defensePercentPerLevel);
  const cityWalls = Math.max(0, Math.floor(Number(report.cityWalls) || getCityStats({ ...city, level: cityLevel, troops: report.troops }).cityWalls));
  const cityDefenseBonus = Math.max(0, Math.floor(Number(report.cityDefenseBonus) || report.troops * defensePercent / 100));
  const stoneworksBonus = Math.max(0, Math.floor(Number(report.stoneworksBonus) || 0));
  const baseCityWalls = Math.max(0, Math.floor(Number(report.baseCityWalls) || Math.max(0, cityWalls - stoneworksBonus)));
  const baseTotalDefense = Math.max(
    0,
    Math.floor(Number(report.baseTotalDefense) || report.troops + cityDefenseBonus + baseCityWalls)
  );
  modal.classList.add("scout-report-modal");
  modalTitle.textContent = "Detailed scout report";
  modalBody.innerHTML = `
    <div class="detailed-scout-report">
      <div class="scout-report-identities">
        <div class="scout-report-ruler player">
          <span id="scoutReportPlayerFlag" class="kingdom-flag scout-report-flag" aria-hidden="true"><span class="flag-symbol"></span></span>
          <div><strong>${escapeHtml(state.playerName)}</strong><small>Hero Lv ${formatNumber(state.character.level)}</small></div>
        </div>
        <div class="scout-report-mark" aria-label="Scout mission"><span aria-hidden="true">&#128301;</span><strong>Scout</strong><small>1 troop</small></div>
        <div class="scout-report-ruler enemy">
          <div><strong>${escapeHtml(reportedOwnerName)}</strong><small>City Lv ${formatNumber(cityLevel)}</small></div>
          <span class="scout-report-enemy-flag" aria-hidden="true">${OWNER[reportedOwner].flag}</span>
        </div>
      </div>

      <div class="scout-report-city"><span>${isRewardCampTarget(city) ? "Target camp" : "Target city"}</span><strong>${escapeHtml(city.name)}</strong><b>${isRewardCampTarget(city) ? `Level ${formatNumber(cityLevel)} defense` : `Level ${formatNumber(cityLevel)}`}</b></div>

      <div class="scout-report-overview">
        <div><span>Scouted troops</span><strong>${formatNumber(report.troops)}</strong></div>
        <div><span>Total defense</span><strong>${formatBaseAndBonusStat(baseTotalDefense, report.totalDefense)}</strong></div>
      </div>

      <section class="scout-report-section">
        <h3>Enemy defense</h3>
        <div class="scout-defense-breakdown">
          ${scoutBreakdownRow("&#9817;", "Troops", "Reported garrison", report.troops)}
          ${scoutBreakdownRow("&#128737;", "City defense", `Lv ${cityLevel} - +${formatNumber(defensePercent)}%`, cityDefenseBonus)}
          ${scoutBreakdownRow("&#10022;", "Stoneworks", `Lv ${report.stoneworksLevel || 0} - +${report.stoneworksPercent || 0}%`, stoneworksBonus)}
          ${scoutBreakdownRow("&#9819;", "City walls", `Lv ${cityLevel} base ${formatNumber(baseCityWalls)} (+${formatNumber(Math.max(0, cityWalls - baseCityWalls))})`, cityWalls)}
          <div class="scout-breakdown-total"><span>Total</span><strong>${formatBaseAndBonusStat(baseTotalDefense, report.totalDefense)}</strong></div>
        </div>
      </section>

      <div class="scout-skill-columns">
        <section class="scout-report-section">
          <h3>Enemy defense stats</h3>
          <div class="scout-skill-list">
            ${scoutSkillRow("Stoneworks", report.stoneworksLevel, report.stoneworksPercent)}
            ${scoutSkillRow("Field Medics", report.fieldMedicsLevel, report.fieldMedicsPercent)}
            ${scoutSkillRow("Guild Charters", report.guildChartersLevel, report.guildChartersPercent)}
          </div>
        </section>
        <section class="scout-report-section">
          <h3>Enemy attack stats</h3>
          <div class="scout-skill-list">
            ${scoutSkillRow("Swordmastery", report.swordmasteryLevel, report.swordmasteryPercent)}
            ${scoutSkillRow("March Orders", report.marchOrdersLevel, report.marchOrdersPercent)}
            ${scoutSkillRow("Tax Stewardship", report.taxStewardshipLevel, report.taxStewardshipPercent)}
            ${scoutSkillRow("Royal Granaries", report.royalGranariesLevel, report.royalGranariesPercent)}
            <div class="scout-skill-row base"><span>Base attack</span><strong>+${formatNumber(report.baseAttackPercent || 0)}%</strong></div>
          </div>
        </section>
      </div>

      <div class="scout-report-timing"><span>Report age: ${formatDuration(age)}</span><span>Expires in: ${formatDuration(remaining)}</span></div>
    </div>
  `;
  applyFlagToElement(modalBody.querySelector("#scoutReportPlayerFlag"), state.flag);
  if (!modal.open) modal.showModal();
}

function scoutBreakdownRow(icon, label, levelText, value) {
  return `<div class="scout-breakdown-row"><span class="scout-stat-icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong><small>${levelText}</small></span><b>${formatNumber(value)}</b></div>`;
}

function scoutSkillRow(label, level = 0, percent = 0) {
  return `<div class="scout-skill-row"><span>${label}</span><small>Lv ${formatNumber(level || 0)}</small><strong>+${formatNumber(percent || 0)}%</strong></div>`;
}

function findLastSelectedAttackSource(target) {
  const source = getLastSelectedOwnedAttackCity();
  if (!source || source.id === target.id || Math.floor(Number(source.troops) || 0) < 1) return null;
  const estimate = getRouteHeuristicDistance(source, target);
  return Number.isFinite(estimate) ? { city: source, estimate } : null;
}

function findPreferredAttackSource(target) {
  const rememberedSource = getLastSelectedOwnedAttackCity();
  if (rememberedSource) return findLastSelectedAttackSource(target);
  return findNearestOwnedSourceCandidate(target, 1);
}

function attackForeignCity(cityId) {
  const target = cityById(cityId);
  if (!target || target.owner === "player") return;
  const mainCityBlockReason = getMainCityAttackBlockReason(target, "player");
  if (mainCityBlockReason) {
    showToast(mainCityBlockReason);
    return;
  }
  const shieldBlockReason = getPeaceShieldAttackBlockReason(target, "player");
  if (shieldBlockReason) {
    showToast(shieldBlockReason);
    return;
  }
  const neutralBlockReason = getNeutralCaptureBlockReason(target, "player");
  if (neutralBlockReason) {
    showNeutralCaptureLimitModal(neutralBlockReason);
    return;
  }
  const sourceOption = findPreferredAttackSource(target);
  if (!sourceOption) {
    const rememberedSource = getLastSelectedOwnedAttackCity();
    showToast(rememberedSource
      ? `${rememberedSource.name} needs troops and a portal connection to attack this target.`
      : "No owned city with troops has a portal connection to this target.");
    return;
  }
  selectedSourceId = sourceOption.city.id;
  rememberOwnedAttackSource(sourceOption.city);
  selectedTargetId = target.id;
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = true;
  selectedTroopAmount = clamp(Math.floor(sourceOption.city.troops / 2), 1, sourceOption.city.troops);
  renderAll();
  showTroopSliderModal(sourceOption.city, target);
}

function layoutCityLabels() {
  if (isZoomInteractionActive()) return;
  const nodes = [...cityLayer.querySelectorAll(".city-node")]
    .sort((a, b) => {
      const ownerPriority = Number(b.classList.contains("player")) - Number(a.classList.contains("player"));
      if (ownerPriority) return ownerPriority;
      return (Number.parseFloat(b.style.top) || 0) - (Number.parseFloat(a.style.top) || 0);
    });
  const slots = ["top", "top-high", "top-higher", "top-highest", "top-tier-5", "top-tier-6"];
  const slotBottom = { top: 58, "top-high": 74, "top-higher": 90, "top-highest": 106, "top-tier-5": 122, "top-tier-6": 138 };
  const slotPenalty = { top: 0, "top-high": 8, "top-higher": 18, "top-highest": 32, "top-tier-5": 50, "top-tier-6": 72 };
  const spatialGrid = new Map();
  const gridSize = 220;
  const getGridKey = (x, y) => `${x}:${y}`;
  const getNearbyRects = rect => {
    const found = new Set();
    const minX = Math.floor(rect.left / gridSize) - 1;
    const maxX = Math.floor(rect.right / gridSize) + 1;
    const minY = Math.floor(rect.top / gridSize) - 1;
    const maxY = Math.floor(rect.bottom / gridSize) + 1;
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        (spatialGrid.get(getGridKey(x, y)) || []).forEach(other => found.add(other));
      }
    }
    return found;
  };
  const storeRect = rect => {
    const minX = Math.floor(rect.left / gridSize);
    const maxX = Math.floor(rect.right / gridSize);
    const minY = Math.floor(rect.top / gridSize);
    const maxY = Math.floor(rect.bottom / gridSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = getGridKey(x, y);
        const bucket = spatialGrid.get(key) || [];
        bucket.push(rect);
        spatialGrid.set(key, bucket);
      }
    }
  };

  for (const node of nodes) {
    const label = node.querySelector(".city-label");
    if (!label) continue;
    const cityX = Number.parseFloat(node.style.left) || 0;
    const cityY = Number.parseFloat(node.style.top) || 0;
    const labelWidth = Math.max(1, label.offsetWidth || 150);
    const labelHeight = Math.max(1, label.offsetHeight || 54);
    const availableSlots = cityY < 210 ? slots.slice(0, 2) : slots;
    let bestSlot = "top";
    let bestRect = null;
    let bestPenalty = Infinity;

    for (const slot of availableSlots) {
      const bottom = slotBottom[slot];
      const rect = {
        left: cityX - labelWidth / 2,
        right: cityX + labelWidth / 2,
        top: cityY - bottom - labelHeight,
        bottom: cityY - bottom,
      };
      let penalty = slotPenalty[slot];
      for (const other of getNearbyRects(rect)) {
        const overlapX = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left));
        const overlapY = Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
        penalty += overlapX * overlapY;
      }
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestSlot = slot;
        bestRect = rect;
      }
      if (penalty === 0) break;
    }

    for (const option of slots) label.classList.remove(`label-slot-${option}`);
    label.classList.add(`label-slot-${bestSlot}`);
    if (bestRect) storeRect(bestRect);
  }
}

function canViewArmyTroopAmount(attack) {
  if (!attack) return false;
  if (attack.kind !== "transfer") return true;
  return isPersonalArmy(attack);
}

function getArmyTokenId(attack) {
  return String(attack?.id || attack?.onlineId || `${attack?.fromId || "from"}-${attack?.toId || "to"}-${attack?.launchedAtMs || attack?.total || ""}`);
}

function getArmyByTokenId(tokenId) {
  const normalizedId = String(tokenId || "");
  if (!normalizedId) return null;
  return getRenderableArmies().find(attack => getArmyTokenId(attack) === normalizedId) || null;
}

function getArmyTokenParts(token) {
  if (token.armyTokenParts) return token.armyTokenParts;
  token.armyTokenParts = {
    icon: token.querySelector(".army-token-icon"),
    count: token.querySelector(".army-token-count"),
    time: token.querySelector(".army-token-time"),
    navigation: token.querySelector(".army-token-nav"),
    fromButton: token.querySelector('[data-army-endpoint="from"]'),
    toButton: token.querySelector('[data-army-endpoint="to"]'),
  };
  return token.armyTokenParts;
}

function updateArmyTokenNavigationSelection() {
  armyTokenCache.forEach((token, tokenId) => {
    const endpointInteractionDisabled = token.dataset.endpointInteractionDisabled === "true";
    const selected = tokenId === selectedArmyTokenId && !endpointInteractionDisabled;
    token.classList.toggle("selected", selected);
    const expanded = String(selected);
    if (token.getAttribute("aria-expanded") !== expanded) token.setAttribute("aria-expanded", expanded);
    const { navigation } = getArmyTokenParts(token);
    if (navigation) navigation.hidden = !selected;
  });
}

function getMarchEndpointInteractionClearance(target) {
  if (!target) return MARCH_ENDPOINT_INTERACTION_MIN_CLEARANCE;
  let visualSize = 64;
  if (isRewardCampTarget(target)) {
    visualSize = Math.max(visualSize, Number(target.size) || DEFAULT_CAMP_VISUAL_SIZE);
  } else if (isStronghold(target)) {
    visualSize = Math.max(visualSize, getStrongholdVisualSize(target));
  }
  return Math.max(
    MARCH_ENDPOINT_INTERACTION_MIN_CLEARANCE,
    visualSize * MARCH_ENDPOINT_INTERACTION_SIZE_RATIO,
  );
}

function isMarchInsideEndpointInteractionClearance(point, from, to) {
  if (!point) return false;
  const distanceToFrom = from ? Math.hypot(point.x - from.x, point.y - from.y) : Infinity;
  const distanceToTo = to ? Math.hypot(point.x - to.x, point.y - to.y) : Infinity;
  return distanceToFrom <= getMarchEndpointInteractionClearance(from)
    || distanceToTo <= getMarchEndpointInteractionClearance(to);
}

function getArmyEndpointDetails(attack, endpointKind = "to") {
  if (!attack) return null;
  const isSource = endpointKind === "from";
  const id = String((isSource ? attack.fromId : attack.toId) || "");
  if (!id) return null;
  const target = getArmyTargetById(id);
  const explicitRegionId = isSource ? attack.sourceRegionId : attack.targetRegionId;
  const regionId = target
    ? getCityRegionId(target)
    : normalizeRegionId(explicitRegionId || getCityRegionId(id));
  const fallbackName = isSource ? attack.fromName : attack.toName;
  return {
    id,
    name: target?.name || String(fallbackName || (isSource ? "Origin" : "Destination")),
    regionId,
  };
}

async function focusArmyEndpoint(tokenId, endpointKind = "to") {
  const attack = getArmyByTokenId(tokenId);
  const endpoint = getArmyEndpointDetails(attack, endpointKind);
  if (!endpoint) {
    showToast("That march endpoint is no longer available.");
    return;
  }

  selectedArmyTokenId = "";
  updateArmyTokenNavigationSelection();
  if (endpoint.regionId !== getActiveMapRegionId()) {
    const switched = await switchOnlineIsland(endpoint.regionId);
    if (!switched || endpoint.regionId !== getActiveMapRegionId()) return;
  }

  const target = getArmyTargetById(endpoint.id);
  if (!target) {
    showToast(`${endpoint.name} is no longer available.`);
    return;
  }
  requestAnimationFrame(() => {
    centerOnCity(target.id);
    showToast(`Viewing ${target.name}`);
  });
}

function createArmyTokenElement(attack) {
  const token = document.createElement("div");
  token.dataset.armyTokenId = getArmyTokenId(attack);
  token.setAttribute("role", "button");
  token.setAttribute("tabindex", "0");
  token.setAttribute("aria-expanded", "false");
  token.innerHTML = `
    <span class="army-token-icon"></span>
    <strong class="army-token-count"></strong>
    <small class="army-token-time"></small>
    <span class="army-token-nav" hidden>
      <button type="button" data-army-endpoint="from" title="Go to march origin" aria-label="Go to march origin"><span aria-hidden="true">&#8592;</span><small>From</small></button>
      <button type="button" data-army-endpoint="to" title="Go to march destination" aria-label="Go to march destination"><span aria-hidden="true">&#8594;</span><small>To</small></button>
    </span>`;
  getArmyTokenParts(token);
  token.addEventListener("click", event => {
    event.stopPropagation();
    if (suppressMapClick || token.dataset.endpointInteractionDisabled === "true") return;
    const endpointButton = event.target.closest("[data-army-endpoint]");
    if (endpointButton) {
      focusArmyEndpoint(token.dataset.armyTokenId, endpointButton.dataset.armyEndpoint);
      return;
    }
    selectedArmyTokenId = selectedArmyTokenId === token.dataset.armyTokenId
      ? ""
      : token.dataset.armyTokenId;
    updateArmyTokenNavigationSelection();
  });
  token.addEventListener("keydown", event => {
    if (event.target !== token || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    token.click();
  });
  return token;
}

function updateArmyTokenElement(token, attack, mapPoint, targetCity, endpointInteractionDisabled = false) {
  const ownerClass = isPersonalArmy(attack) ? OWNER.player.css : OWNER.enemy.css;
  const showTroops = canViewArmyTroopAmount(attack);
  const selected = !endpointInteractionDisabled && getArmyTokenId(attack) === selectedArmyTokenId;
  const className = `army-token ${ownerClass}${showTroops ? "" : " hidden-transfer"}${selected ? " selected" : ""}${endpointInteractionDisabled ? " endpoint-clearance" : ""}`;
  if (token.className !== className) token.className = className;
  token.dataset.endpointInteractionDisabled = String(endpointInteractionDisabled);
  token.tabIndex = endpointInteractionDisabled ? -1 : 0;
  token.setAttribute("aria-disabled", String(endpointInteractionDisabled));
  if (endpointInteractionDisabled && document.activeElement === token) token.blur();
  const expanded = String(selected);
  if (token.getAttribute("aria-expanded") !== expanded) token.setAttribute("aria-expanded", expanded);
  token.style.transform = `translate(${mapPoint.x}px, ${mapPoint.y}px) translate(-50%, -50%)`;

  const armyIcon = attack.kind === "scout" ? "\u{1F52D}" : attack.kind === "transfer" ? "\u265E" : "\u2694";
  const {
    icon: iconElement,
    count: countElement,
    time: timeElement,
    navigation,
    fromButton,
    toButton,
  } = getArmyTokenParts(token);
  if (iconElement && iconElement.textContent !== armyIcon) iconElement.textContent = armyIcon;
  if (countElement) {
    if (countElement.hidden === showTroops) countElement.hidden = !showTroops;
    if (showTroops) {
      const troopText = formatNumber(attack.troops);
      if (countElement.textContent !== troopText) countElement.textContent = troopText;
    }
  }
  if (timeElement) {
    const timeText = formatDuration(attack.remaining);
    if (timeElement.textContent !== timeText) timeElement.textContent = timeText;
  }
  if (navigation) navigation.hidden = !selected;
  if (fromButton) fromButton.disabled = endpointInteractionDisabled;
  if (toButton) toButton.disabled = endpointInteractionDisabled;
  const endpointSignature = `${attack.fromId || ""}:${attack.fromName || ""}:${attack.toId || ""}:${attack.toName || ""}`;
  if (token.dataset.armyEndpointSignature !== endpointSignature) {
    token.dataset.armyEndpointSignature = endpointSignature;
    const fromDetails = getArmyEndpointDetails(attack, "from");
    const toDetails = getArmyEndpointDetails(attack, "to");
    if (fromButton && fromDetails) {
      fromButton.title = `Go to ${fromDetails.name}`;
      fromButton.setAttribute("aria-label", `Go to ${fromDetails.name}`);
    }
    if (toButton && toDetails) {
      toButton.title = `Go to ${toDetails.name}`;
      toButton.setAttribute("aria-label", `Go to ${toDetails.name}`);
    }
  }
  const tokenLabel = endpointInteractionDisabled
    ? `${attack.kind || "Army"} march near an endpoint. Select the location beneath it.`
    : `${attack.kind || "Army"} march to ${targetCity?.name || attack.toName || "destination"}. Show route locations.`;
  if (token.getAttribute("aria-label") !== tokenLabel) token.setAttribute("aria-label", tokenLabel);
  if (attack.ownerName) {
    const titlePrefix = `${attack.ownerName}: ${attack.kind} to ${targetCity?.name || "target"}`;
    const title = showTroops ? titlePrefix : `${titlePrefix} - ${formatDuration(attack.remaining)} remaining`;
    if (token.title !== title) token.title = title;
  }
}

function hasRenderableArmyWork() {
  return Boolean((state?.attacks?.length || 0) || onlineArmies.length || armyTokenCache.size);
}

function renderArmies(force = false) {
  if (!state) return;
  if (isCameraInteractionActive()) {
    queueDeferredMapRender();
    return;
  }
  const now = performance.now();
  if (!force && now - lastArmyRenderTime < ARMY_RENDER_INTERVAL_MS) return;
  lastArmyRenderTime = now;
  const visibleBounds = getVisibleWorldBounds(240);
  const activeRegionId = getActiveMapRegionId();
  const fragment = document.createDocumentFragment();
  const visibleArmyTokenIds = new Set();
  let clearedEndpointSelection = false;
  for (const attack of getRenderableArmies()) {
    const from = getArmyTargetById(attack.fromId);
    const to = getArmyTargetById(attack.toId);
    if (!from || !to) continue;
    const progress = getArmyTravelProgress(attack);
    const segmentPoint = getMissionPointAtProgress(attack, progress);
    if (!segmentPoint || segmentPoint.regionId !== activeRegionId) continue;
    const point = segmentPoint.point;
    const x = point.x;
    const y = point.y;
    if (!isPointInBounds(x, y, visibleBounds)) continue;
    const mapPoint = worldToMapPoint(point);
    const tokenId = getArmyTokenId(attack);
    const endpointInteractionDisabled = isMarchInsideEndpointInteractionClearance(point, from, to);
    if (endpointInteractionDisabled && selectedArmyTokenId === tokenId) {
      selectedArmyTokenId = "";
      clearedEndpointSelection = true;
    }
    visibleArmyTokenIds.add(tokenId);
    let token = armyTokenCache.get(tokenId);
    if (!token) {
      token = createArmyTokenElement(attack);
      armyTokenCache.set(tokenId, token);
      fragment.appendChild(token);
    }
    updateArmyTokenElement(token, attack, mapPoint, to, endpointInteractionDisabled);
  }
  if (fragment.childNodes.length) armyLayer.appendChild(fragment);
  for (const [tokenId, token] of armyTokenCache) {
    if (visibleArmyTokenIds.has(tokenId)) continue;
    token.remove();
    armyTokenCache.delete(tokenId);
  }
  if (selectedArmyTokenId && !visibleArmyTokenIds.has(selectedArmyTokenId)) {
    selectedArmyTokenId = "";
  }
  if (clearedEndpointSelection) updateArmyTokenNavigationSelection();
  updateMapDensityMode(null, visibleArmyTokenIds.size);
}

function getArmyTravelProgress(army, nowMs = Date.now()) {
  const recalledAtMs = normalizeTimestampMs(army?.recalledAtMs);
  const returnArrivesAtMs = normalizeTimestampMs(army?.arrivesAtMs);
  if (army?.returning && recalledAtMs > 0 && returnArrivesAtMs > recalledAtMs) {
    const returnStartProgress = clamp(Number(army.returnStartProgress) || 0, 0, 1);
    const returnProgress = clamp((nowMs - recalledAtMs) / (returnArrivesAtMs - recalledAtMs), 0, 1);
    return returnStartProgress * (1 - returnProgress);
  }
  const swiftUsedAtMs = normalizeTimestampMs(army?.swiftMarchUsedAtMs);
  const arrivesAtMs = normalizeTimestampMs(army?.arrivesAtMs);
  if (swiftUsedAtMs > 0 && arrivesAtMs > swiftUsedAtMs && nowMs >= swiftUsedAtMs) {
    const progressAtUse = clamp(Number(army.swiftMarchProgressAtUse) || 0, 0, 1);
    const acceleratedProgress = clamp((nowMs - swiftUsedAtMs) / (arrivesAtMs - swiftUsedAtMs), 0, 1);
    return progressAtUse + (1 - progressAtUse) * acceleratedProgress;
  }
  const launchedAtMs = normalizeTimestampMs(army?.launchedAtMs);
  if (launchedAtMs > 0 && arrivesAtMs > launchedAtMs) {
    return clamp((nowMs - launchedAtMs) / (arrivesAtMs - launchedAtMs), 0, 1);
  }
  return clamp(1 - Math.max(0, Number(army?.remaining) || 0) / Math.max(0.1, Number(army?.total) || 0.1), 0, 1);
}

function ensurePerformancePanel() {
  if (performancePanel) return performancePanel;
  performancePanel = document.createElement("aside");
  performancePanel.className = "performance-panel";
  performancePanel.hidden = true;
  performancePanel.setAttribute("aria-live", "polite");
  document.body.appendChild(performancePanel);
  return performancePanel;
}

function getServiceWorkerDebugStatus() {
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (navigator.serviceWorker.controller) return "active";
  return "registered";
}

function getNeighborPreloadDebugText(regionId = getActiveMapRegionId()) {
  const neighbors = getConnectedIslandRegionIds(regionId);
  if (!neighbors.length) return "none";
  return neighbors
    .map(id => `${getRegionLabel(id)}:${preloadedMapRegions.has(id) ? "yes" : "no"}`)
    .join(", ");
}

function updatePerformancePanel(now = performance.now()) {
  if (!performancePanelVisible) return;
  const panel = ensurePerformancePanel();
  const activeRegionId = getActiveMapRegionId();
  const visibleCityMarkers = cityLayer?.querySelectorAll(".city-node").length || 0;
  const visibleCampMarkers = cityLayer?.querySelectorAll(".camp-node").length || 0;
  panel.hidden = false;
  panel.innerHTML = `
    <strong>Crownlands Perf</strong>
    <span>FPS: ${Math.round(performanceFps)}</span>
    <span>Region: ${escapeHtml(getRegionLabel(activeRegionId))}</span>
    <span>Cities: ${formatNumber(visibleCityMarkers)} visible</span>
    <span>Camps: ${formatNumber(visibleCampMarkers)} visible</span>
    <span>Army tokens: ${formatNumber(armyTokenCache.size)}</span>
    <span>Loaded images: ${formatNumber(loadedImageAssets.size)}</span>
    <span>Neighbors: ${escapeHtml(getNeighborPreloadDebugText(activeRegionId))}</span>
    <span>SW: ${escapeHtml(getServiceWorkerDebugStatus())}</span>
    <small>F8 toggles this panel</small>
  `;
}

function samplePerformancePanel(now) {
  performanceFrameCount += 1;
  if (now - performanceLastSampleTime < PERFORMANCE_PANEL_SAMPLE_MS) return;
  const elapsed = Math.max(1, now - performanceLastSampleTime);
  performanceFps = performanceFrameCount * 1000 / elapsed;
  performanceFrameCount = 0;
  performanceLastSampleTime = now;
  updatePerformancePanel(now);
}

function togglePerformancePanel(force = null) {
  performancePanelVisible = force === null ? !performancePanelVisible : Boolean(force);
  const panel = ensurePerformancePanel();
  panel.hidden = !performancePanelVisible;
  if (performancePanelVisible) updatePerformancePanel();
}

function renderPanel() {
  actionButtons.innerHTML = "";
  const source = selectedSourceId ? cityById(selectedSourceId) : null;

  if (commanderPanel) commanderPanel.classList.remove("visible");

  normalizeGameOverState();

  if (!source) {
    panelTitle.textContent = "";
    panelSubtitle.textContent = "";
    selectedInfo.innerHTML = "";
    return;
  }

  if (commanderPanel) commanderPanel.classList.add("visible");

  if (source.owner !== "player") {
    clearSelection(false);
    return renderPanel();
  }

  if (sendMode) {
    if (commanderPanel) commanderPanel.classList.remove("visible");
    return;
  }

  if (commanderPanel) commanderPanel.classList.remove("visible");
  return;
}

function releaseSelectionRenderDelay() {
  if (pinchState || activePointers.size >= 2 || mapFrame?.classList.contains("dragging")) return;
  interactionRenderLockUntil = 0;
  if (cameraInteractionSettleTimer) {
    window.clearTimeout(cameraInteractionSettleTimer);
    cameraInteractionSettleTimer = null;
  }
  mapFrame?.classList.remove("camera-moving", "zooming");
}

function renderSelectionChangeNow() {
  releaseSelectionRenderDelay();
  lastRenderTime = performance.now();
  renderCities();
  renderPanel();
}

function renderSendConfirmPanel(source, target) {
  if (!source || !target || source.id === target.id) {
    selectedTargetId = null;
    return renderPanel();
  }

  const isTransfer = target.owner === "player";
  const neutralBlockReason = getNeutralCaptureBlockReason(target, "player");
  const icon = isTransfer ? "\u265E" : "\u2694";
  const label = isTransfer ? "Move" : "Attack";
  const route = findRoute(source, target);
  const sendAmount = source.troops > 0 ? clamp(Math.floor(source.troops * selectedMarchPercent), 1, source.troops) : 0;
  let travel = route ? travelTime(source, target, "player", route.length, sendAmount, isTransfer ? "transfer" : "attack") : Infinity;
  let outcomeHtml = "";

  if (!isTransfer && route) {
    const preview = calculateBattlePreview(source, target, selectedMarchPercent);
    travel = preview.travel;
    const demoNotice = getDemoAttackNotice(preview.demoAttack);
    outcomeHtml = `
      <div class="send-outcome ${preview.success ? "win" : "lose"}">
        <strong>${preview.success ? "Likely Victory" : "Likely Defeat"}</strong>
        <span>${preview.label} - ${Math.round(preview.xpEfficiency * 100)}% XP</span>
        <small>${preview.success
          ? `Est. survivors: ${formatNumber(preview.survivors)} - ${preview.xpLabel} ${formatNumber(preview.captureXp)}`
          : `Est. defenders left: ${formatNumber(preview.defendersLeft)} - ${preview.xpLabel} ${formatNumber(preview.captureXp)}`}</small>
        ${demoNotice ? `<small>${escapeHtml(demoNotice)}</small>` : ""}
      </div>
    `;
  }


  panelTitle.textContent = `${icon} ${label} troops`;
  panelSubtitle.textContent = `${source.name} \u2192 ${target.name}`;
  selectedInfo.innerHTML = `
    <div class="send-confirm-card">
      <div class="send-icon">${icon}</div>
      <div class="send-main">
        <strong>${escapeHtml(source.name)} \u2192 ${escapeHtml(target.name)}</strong>
        <span>${formatPercent(selectedMarchPercent)} selected \u00B7 ${formatNumber(sendAmount)} troops</span>
        <span>${route ? `${formatDuration(travel)} travel \u00B7 ${formatNumber(route.length)} distance` : "No valid land route"}</span>
      </div>
    </div>
    ${outcomeHtml}
  `;

  renderMarchButtons();
  actionButtons.appendChild(button(`${icon} ${label}`, () => confirmSendOrder(), !route || sendAmount < 1, isTransfer ? "move-action" : "attack-action"));
  actionButtons.appendChild(button("Cancel", cancelSendMode, false, "secondary"));
}
function renderMarchButtons() {
  [0.25, 0.5, 0.8, 1].forEach(percent => {
    const isActive = selectedMarchPercent === percent;
    actionButtons.appendChild(button(`${formatPercent(percent)}`, () => setMarchPercent(percent), false, isActive ? "active-march" : "secondary"));
  });
}

function selectCity(id) {
  if (!state || isGamePausedByOutcome()) return;
  const clicked = cityById(id);
  if (!clicked) return;
  if (scoutNearbySourceId && scoutNearbySourceId !== clicked.id) scoutNearbySourceId = null;
  if (regroupSourceId && regroupSourceId !== clicked.id) regroupSourceId = null;
  const source = selectedSourceId ? cityById(selectedSourceId) : null;

  if (sendMode && source) {
    if (clicked.id === source.id) {
      showToast("Choose a different destination.");
      return;
    }
    if (clicked.owner === "neutral") {
      const neutralBlockReason = getNeutralCaptureBlockReason(clicked, "player");
      if (neutralBlockReason) {
        sendMode = false;
        selectedTargetId = null;
        renderSelectionChangeNow();
        showNeutralCaptureLimitModal(neutralBlockReason);
        return;
      }
    }
    const mainCityBlockReason = clicked.owner === "player" ? "" : getMainCityAttackBlockReason(clicked, "player");
    if (mainCityBlockReason) {
      sendMode = false;
      selectedTargetId = null;
      renderSelectionChangeNow();
      showToast(mainCityBlockReason);
      return;
    }
    const shieldBlockReason = getPeaceShieldAttackBlockReason(clicked, "player");
    if (shieldBlockReason) {
      sendMode = false;
      selectedTargetId = null;
      renderSelectionChangeNow();
      showToast(shieldBlockReason);
      return;
    }
    selectedTargetId = clicked.id;
    renderSelectionChangeNow();
    showTroopSliderModal(source, clicked);
    return;
  }

  if (clicked.owner === "player") {
    selectedSourceId = clicked.id;
    rememberOwnedAttackSource(clicked);
    selectedTargetId = null;
    sendMode = false;
    renderSelectionChangeNow();
    requestAnimationFrame(() => centerOnCity(clicked.id));
    return;
  }

  selectedTargetId = clicked.id;
  sendMode = false;
  renderSelectionChangeNow();
  requestAnimationFrame(() => centerOnCity(clicked.id));
}

function beginSendMode(sourceId) {
  const source = cityById(sourceId);
  if (!source || source.owner !== "player") return;
  if (source.troops < 1) {
    showToast("No troops available to send.");
    return;
  }
  selectedSourceId = source.id;
  rememberOwnedAttackSource(source);
  selectedTargetId = null;
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = true;
  selectedTroopAmount = clamp(Math.floor(source.troops / 2), 1, source.troops);
  renderSelectionChangeNow();
}

function showTroopSliderModal(source, target) {
  void showTroopSliderModalAsync(source, target);
}

async function showTroopSliderModalAsync(source, target) {
  if (!source || !target || source.owner !== "player" || source.id === target.id) return;
  if (source.troops < 1) {
    showToast("No troops available to send.");
    cancelSendMode();
    return;
  }

  const isTransfer = target.owner === "player";
  const campTarget = isRewardCampTarget(target);
  const needsDefenderPower = target.owner === "enemy" && !campTarget && !isStronghold(target);
  const mainCityBlockReason = isTransfer || campTarget ? "" : getMainCityAttackBlockReason(target, "player");
  if (mainCityBlockReason) {
    showToast(mainCityBlockReason);
    cancelSendMode();
    if (modal.open) modal.close();
    return;
  }
  const shieldBlockReason = isTransfer || campTarget ? "" : getPeaceShieldAttackBlockReason(target, "player");
  if (shieldBlockReason) {
    showToast(shieldBlockReason);
    cancelSendMode();
    if (modal.open) modal.close();
    return;
  }

  cancelPendingRouteWorkerRequests("A newer route was selected.");
  const requestId = ++activeTroopRouteRequestId;
  troopSliderActive = true;
  activeTroopSliderRoute = null;
  showTroopRouteLoadingModal(source, target, isTransfer);

  await waitForSetupLoadingPaint(0);
  const [route, defenderPower] = await Promise.all([
    findRouteAsync(source, target),
    needsDefenderPower ? ensureAuthoritativeCityOwnerKingPower(target) : Promise.resolve(0),
  ]);
  if (requestId !== activeTroopRouteRequestId) return;

  const freshSource = cityById(source.id);
  const freshTarget = getArmyTargetById(target.id);
  if (!freshSource || !freshTarget || freshSource.owner !== "player" || freshSource.id === freshTarget.id) {
    showToast("Order canceled. The map changed.");
    cancelSendMode();
    if (modal.open) modal.close();
    renderAll();
    return;
  }
  if (!modal.open || !modal.classList.contains("troop-slider-modal")) return;
  if (freshSource.troops < 1) {
    showToast("No troops available to send.");
    cancelSendMode();
    if (modal.open) modal.close();
    return;
  }
  if (
    freshTarget.owner === "enemy"
    && !isRewardCampTarget(freshTarget)
    && !isStronghold(freshTarget)
    && Math.max(
      normalizePowerValue(defenderPower),
      getAuthoritativeCityOwnerKingPowerSnapshot(freshTarget)
    ) <= 0
  ) {
    showToast("Could not verify that kingdom's attack limit. Try again.");
    cancelSendMode();
    if (modal.open) modal.close();
    return;
  }
  if (!route || !route.points.length) {
    showToast("No land route found around the terrain.");
    selectedTargetId = null;
    cancelSendMode();
    if (modal.open) modal.close();
    renderAll();
    return;
  }

  showTroopSliderModalWithRoute(freshSource, freshTarget, route);
}

function showTroopRouteLoadingModal(source, target, isTransfer) {
  const commandLabel = isTransfer ? "Transfer" : "Attack";
  const commandIcon = isTransfer ? "&#9822;" : "&#9876;";
  modal.classList.add("troop-slider-modal");
  modalTitle.textContent = `${commandLabel} troops`;
  modalBody.innerHTML = `
    <div class="troop-slider-panel ${isTransfer ? "transfer" : "attack"}">
      <div class="troop-route-summary">
        <div class="troop-route-city">
          <span>From</span>
          <strong>${escapeHtml(source.name)}</strong>
          <small>${escapeHtml(getRegionLabel(getCityRegionId(source)))} &middot; <b>${formatNumber(source.troops)}</b> available</small>
        </div>
        <div class="troop-command-icon" aria-hidden="true">${commandIcon}</div>
        <div class="troop-route-city destination">
          <span>To</span>
          <strong>${escapeHtml(target.name)}</strong>
          <small>${escapeHtml(getRegionLabel(getCityRegionId(target)))} &middot; ${isRewardCampTarget(target) ? (isTransfer ? `Your ${escapeHtml(target.name)}` : `${OWNER[target.owner].label} ${escapeHtml(target.name)}`) : isTransfer ? "Your city" : `${OWNER[target.owner].label} city`}</small>
        </div>
      </div>

      <div class="troop-slider-preview unknown route-loading-preview" role="status" aria-live="polite">
        <div><span>Route</span><strong>Calculating...</strong><small>Finding a land path around cities and terrain</small></div>
        <div><span>Orders</span><strong>Almost ready</strong><small>You can cancel while the route loads</small></div>
      </div>

      <div class="troop-slider-actions">
        <button id="troopSliderConfirm" class="troop-slider-confirm ${isTransfer ? "transfer" : "attack"}" type="button" disabled>
          <span aria-hidden="true">${commandIcon}</span>Calculating
        </button>
        <button id="troopSliderCancel" class="troop-slider-cancel" type="button">Cancel</button>
      </div>
    </div>
  `;
  modalBody.querySelector("#troopSliderCancel")?.addEventListener("click", () => modal.close());
  if (!modal.open) modal.showModal();
}

function getTroopSliderSendLimit(source, target) {
  const availableTroops = Math.max(0, Math.floor(Number(source?.troops) || 0));
  if (availableTroops < 1 || !target) return 0;
  const demoAttack = createDemoAttackSnapshot(source, target, availableTroops, "player");
  return demoAttack?.active
    ? clamp(Math.floor(Number(demoAttack.maxTroops) || 1), 1, availableTroops)
    : availableTroops;
}

function showTroopSliderModalWithRoute(source, target, route) {
  activeTroopSliderRoute = {
    sourceId: source.id,
    targetId: target.id,
    route: cloneRoute(route),
  };
  const isTransfer = target.owner === "player";
  const campTarget = isRewardCampTarget(target);
  const mainCityBlockReason = isTransfer || campTarget ? "" : getMainCityAttackBlockReason(target, "player");
  if (mainCityBlockReason) {
    showToast(mainCityBlockReason);
    cancelSendMode();
    if (modal.open) modal.close();
    return;
  }
  const shieldBlockReason = isTransfer || campTarget ? "" : getPeaceShieldAttackBlockReason(target, "player");
  if (shieldBlockReason) {
    showToast(shieldBlockReason);
    cancelSendMode();
    if (modal.open) modal.close();
    return;
  }
  const commandLabel = isTransfer ? "Transfer" : "Attack";
  const commandIcon = isTransfer ? "&#9822;" : "&#9876;";
  const shieldDropWarning = isTransfer ? "" : getPeaceShieldAttackWarning(target);
  const sliderSendLimit = getTroopSliderSendLimit(source, target);
  const demoLimited = sliderSendLimit < source.troops;
  selectedTroopAmount = clamp(selectedTroopAmount, 1, sliderSendLimit);
  troopSliderActive = true;
  modal.classList.add("troop-slider-modal");
  modalTitle.textContent = `${commandLabel} troops`;
  modalBody.innerHTML = `
    <div class="troop-slider-panel ${isTransfer ? "transfer" : "attack"}">
      <div class="troop-route-summary">
        <div class="troop-route-city">
          <span>From</span>
          <strong>${escapeHtml(source.name)}</strong>
          <small>${escapeHtml(getRegionLabel(getCityRegionId(source)))} &middot; <b id="troopSliderRemaining">${formatNumber(source.troops - selectedTroopAmount)}</b> of ${formatNumber(source.troops)} remain</small>
        </div>
        <div class="troop-command-icon" aria-hidden="true">${commandIcon}</div>
        <div class="troop-route-city destination">
          <span>To</span>
          <strong>${escapeHtml(target.name)}</strong>
          <small>${escapeHtml(getRegionLabel(getCityRegionId(target)))} &middot; ${campTarget ? (isTransfer ? `Your ${escapeHtml(target.name)}` : `${OWNER[target.owner].label} ${escapeHtml(target.name)}`) : isTransfer ? "Your city" : `${OWNER[target.owner].label} city`}</small>
        </div>
      </div>

      ${shieldDropWarning ? `<div class="shield-drop-warning" role="alert"><strong>Shield warning</strong><span>${escapeHtml(shieldDropWarning)}</span></div>` : ""}

      <div class="troop-slider-control">
        <div class="troop-slider-readout">
          <span>Troops to ${isTransfer ? "send" : "attack with"}</span>
          <strong id="troopSliderAmount">${formatNumber(selectedTroopAmount)}</strong>
        </div>
        <input id="troopAmountSlider" class="troop-amount-slider" type="range" min="1" max="${sliderSendLimit}" value="${selectedTroopAmount}" aria-label="Troops to ${isTransfer ? "transfer" : "attack with"}" />
        <div class="troop-slider-limits"><span>1</span><span id="troopSliderMaxLabel">${demoLimited ? "Protected max" : "Max"} ${formatNumber(sliderSendLimit)}</span></div>
      </div>

      <div id="troopSliderPreview" class="troop-slider-preview"></div>

      <div class="troop-slider-actions">
        <button id="troopSliderConfirm" class="troop-slider-confirm ${isTransfer ? "transfer" : "attack"}" type="button">
          <span aria-hidden="true">${commandIcon}</span>${commandLabel}
        </button>
        <button id="troopSliderCancel" class="troop-slider-cancel" type="button">Cancel</button>
      </div>
    </div>
  `;

  const slider = modalBody.querySelector("#troopAmountSlider");
  slider.addEventListener("input", () => {
    selectedTroopAmount = clamp(Math.floor(Number(slider.value)), 1, getTroopSliderSendLimit(source, target));
    updateTroopSliderModal(source, target, route);
  });
  modalBody.querySelector("#troopSliderConfirm").addEventListener("click", confirmTroopSliderOrder);
  modalBody.querySelector("#troopSliderCancel").addEventListener("click", () => modal.close());
  updateTroopSliderModal(source, target, route);
  if (!modal.open) modal.showModal();
}

function updateTroopSliderModal(source, target, route) {
  const slider = modalBody.querySelector("#troopAmountSlider");
  if (!slider || !source || !target) return;
  const routeSummary = getArmyRouteSummary(route, source, target);
  const sliderSendLimit = getTroopSliderSendLimit(source, target);
  const demoLimited = sliderSendLimit < source.troops;
  selectedTroopAmount = clamp(selectedTroopAmount, 1, sliderSendLimit);
  slider.max = String(sliderSendLimit);
  slider.value = selectedTroopAmount;
  const progress = sliderSendLimit <= 1 ? 100 : ((selectedTroopAmount - 1) / (sliderSendLimit - 1)) * 100;
  slider.style.setProperty("--slider-progress", `${progress}%`);
  modalBody.querySelector("#troopSliderAmount").textContent = formatNumber(selectedTroopAmount);
  modalBody.querySelector("#troopSliderRemaining").textContent = formatNumber(source.troops - selectedTroopAmount);
  const maxLabel = modalBody.querySelector("#troopSliderMaxLabel");
  if (maxLabel) maxLabel.textContent = `${demoLimited ? "Protected max" : "Max"} ${formatNumber(sliderSendLimit)}`;

  const travel = travelTime(source, target, "player", route.length, selectedTroopAmount, target.owner === "player" ? "transfer" : "attack");
  const previewEl = modalBody.querySelector("#troopSliderPreview");
  if (target.owner === "player") {
    previewEl.className = "troop-slider-preview transfer";
    previewEl.innerHTML = `
      <div><span>Arrival</span><strong>${formatNumber(target.troops + selectedTroopAmount)} troops</strong></div>
      <div><span>Travel time</span><strong>About ${formatDuration(travel)}</strong><small>${escapeHtml(routeSummary)}</small></div>
    `;
    return;
  }

  if (isRewardCampTarget(target)) {
    const report = getScoutReport(target.id);
    if (!report) {
      previewEl.className = "troop-slider-preview unknown";
      previewEl.innerHTML = `
        <div><span>Battle forecast</span><strong>Camp defenses hidden</strong><small>Scout report required</small></div>
        <div><span>Travel time</span><strong>About ${formatDuration(travel)}</strong><small>${escapeHtml(routeSummary)}</small><small>Attack is still available</small></div>
      `;
      return;
    }
    const scoutedTarget = { ...target, troops: report.troops, troopFloat: report.troops };
    const preview = calculateBattlePreviewForTroops(source, scoutedTarget, selectedTroopAmount, route);
    previewEl.className = `troop-slider-preview ${preview.success ? "win" : "lose"}`;
    previewEl.innerHTML = `
      <div><span>Scouted garrison</span><strong>${formatNumber(report.troops)} defenders</strong><small>Level ${formatNumber(report.cityLevel || target.defenseLevel)} defense</small></div>
      <div><span>Scouted forecast</span><strong>${preview.success ? "Likely capture" : "Likely defeat"}</strong><small>${preview.success ? `${formatNumber(preview.survivors)} estimated survivors` : `${formatNumber(preview.defendersLeft)} defenders estimated`} &middot; ${formatDuration(preview.travel)} travel</small><small>${escapeHtml(routeSummary)}</small></div>
    `;
    return;
  }

  const report = getScoutReport(target.id);
  if (!report) {
    const demoAttack = createDemoAttackSnapshot(source, target, selectedTroopAmount, "player");
    const effectiveTroops = demoAttack?.active ? demoAttack.effectiveTroops : selectedTroopAmount;
    const demoTravel = travelTime(source, target, "player", route.length, effectiveTroops, "attack", { demoAttack });
    const demoNotice = getDemoAttackNotice(demoAttack);
    previewEl.className = "troop-slider-preview unknown";
    previewEl.innerHTML = `
      <div><span>Battle forecast</span><strong>Garrison unknown</strong><small>Scout report required</small></div>
      <div><span>Travel time</span><strong>About ${formatDuration(demoTravel)}</strong><small>${escapeHtml(routeSummary)}</small><small>Attack is still available</small>${demoNotice ? `<small>${escapeHtml(demoNotice)}</small>` : ""}</div>
    `;
    return;
  }

  const scoutedTarget = { ...target, troops: report.troops, troopFloat: report.troops };
  const preview = calculateBattlePreviewForTroops(source, scoutedTarget, selectedTroopAmount, route);
  const demoNotice = getDemoAttackNotice(preview.demoAttack);
  previewEl.className = `troop-slider-preview ${preview.success ? "win" : "lose"}`;
  previewEl.innerHTML = `
    <div><span>Scouted forecast</span><strong>${preview.success ? "Likely victory" : "Likely defeat"}</strong><small>${preview.label}</small></div>
    <div><span>${preview.success ? "Estimated survivors" : "Defenders left"}</span><strong>${formatNumber(preview.success ? preview.survivors : preview.defendersLeft)}</strong><small>About ${formatDuration(preview.travel)} travel</small><small>${escapeHtml(routeSummary)}</small>${demoNotice ? `<small>${escapeHtml(demoNotice)}</small>` : ""}</div>
  `;
}

function confirmTroopSliderOrder() {
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  const target = selectedTargetId ? getArmyTargetById(selectedTargetId) : null;
  if (!source || !target || source.owner !== "player" || source.troops < 1) {
    troopSliderActive = false;
    activeTroopSliderRoute = null;
    modal.classList.remove("troop-slider-modal");
    if (modal.open) modal.close();
    clearSelection(false);
    renderAll();
    showToast("Order canceled. The map changed.");
    return;
  }

  selectedTroopAmount = clamp(selectedTroopAmount, 1, getTroopSliderSendLimit(source, target));
  const cachedRoute = activeTroopSliderRoute?.sourceId === source.id && activeTroopSliderRoute?.targetId === target.id
    ? activeTroopSliderRoute.route
    : null;
  if (!cachedRoute?.points?.length) {
    showToast("Route is still calculating.");
    return;
  }
  const launched = launchAttack(source.id, target.id, 1, "player", selectedTroopAmount, { route: cachedRoute });
  if (!launched) return;
  troopSliderActive = false;
  activeTroopSliderRoute = null;
  modal.classList.remove("troop-slider-modal");
  if (modal.open) modal.close();
  clearSelection(false);
  renderAll();
}

function cancelSendMode() {
  activeTroopRouteRequestId += 1;
  cancelPendingRouteWorkerRequests();
  sendMode = false;
  selectedTargetId = null;
  selectedTroopAmount = 1;
  activeTroopSliderRoute = null;
  renderAll();
}

function canRelinquishCity(city) {
  if (!state || !city || city.owner !== "player") return false;
  return isStronghold(city) || !isMainCityForList(city);
}

function getRelinquishDestinationPreview(city, { loadedOnly = false } = {}) {
  if (!state || !city) return null;
  const sourceRegionId = getCityRegionId(city);
  const candidates = (loadedOnly ? playerCities() : getAllOwnedCitiesForDisplay())
    .filter(candidate => candidate.id !== city.id)
    .filter(candidate => loadedOnly ? candidate.owner === "player" : true)
    .filter(candidate => !isStronghold(candidate))
    .map(candidate => {
      const sameRegion = getCityRegionId(candidate) === sourceRegionId;
      const distance = Math.hypot((Number(candidate.x) || 0) - (Number(city.x) || 0), (Number(candidate.y) || 0) - (Number(city.y) || 0));
      return { city: candidate, sameRegion, distance };
    })
    .sort((a, b) => {
      if (a.sameRegion !== b.sameRegion) return a.sameRegion ? -1 : 1;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return String(a.city.name || a.city.id).localeCompare(String(b.city.name || b.city.id));
    });
  return candidates[0]?.city || null;
}

function renderRelinquishCityAction(city) {
  if (!canRelinquishCity(city)) return "";
  return `
    <div class="relinquish-city-action-panel">
      <div class="relinquish-city-action-copy">
        <strong>Relinquish Castle</strong>
        <small>March stationed troops to your nearest friendly city and make this city neutral.</small>
      </div>
      <button id="relinquishCityBtn" class="relinquish-city-btn" type="button">Relinquish Castle</button>
    </div>
  `;
}

function bindRelinquishCityButton(city) {
  modalBody.querySelector("#relinquishCityBtn")?.addEventListener("click", () => showRelinquishCityConfirm(city.id));
}

function showRelinquishCityConfirm(cityId) {
  const city = cityById(cityId);
  if (!city) {
    showToast("That city is no longer available.");
    return;
  }
  if (!canRelinquishCity(city)) {
    showToast(isMainCityForList(city) ? "You cannot relinquish your main city." : "You can only relinquish your own cities.");
    return;
  }

  const troops = Math.max(0, Math.floor(Number(city.troops) || 0));
  const destination = getRelinquishDestinationPreview(city);
  const destinationLabel = destination ? destination.name : "your nearest friendly city";
  modal.classList.add("relinquish-city-modal");
  modalTitle.textContent = "Relinquish Castle";
  modalBody.innerHTML = `
    <div class="relinquish-warning">
      <strong>Give up ${escapeHtml(city.name)}?</strong>
      <p>You are giving up this city. ${formatNumber(troops)} stationed troops will march to ${escapeHtml(destinationLabel)}.</p>
      <p>${escapeHtml(city.name)} will become neutral and stay at level ${formatNumber(isStronghold(city) ? getStrongholdDefenseLevel(city) : city.level)}.</p>
      <div class="modal-actions">
        <button id="confirmRelinquishCityBtn" class="danger-action" type="button">Yes</button>
        <button id="cancelRelinquishCityBtn" class="safe-action" type="button">No</button>
      </div>
    </div>
  `;
  modalBody.querySelector("#cancelRelinquishCityBtn")?.addEventListener("click", () => modal.close());
  modalBody.querySelector("#confirmRelinquishCityBtn")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    const success = await relinquishCity(city.id);
    if (!success && modal.open) event.currentTarget.disabled = false;
  });
  if (!modal.open) modal.showModal();
}

function createRelinquishTransferMission(city, destination, route, troops, { online = true } = {}) {
  if (!state || !city || !destination || !route?.points?.length || troops < 1) return null;
  const duration = travelTime(city, destination, "player", route.length, troops, "transfer");
  const mission = {
    id: attackIdCounter++,
    owner: "player",
    kind: "transfer",
    fromId: city.id,
    toId: destination.id,
    troops,
    requestedTroops: troops,
    total: duration,
    remaining: duration,
    path: route.points,
    pathSegments: getRouteSegments(route, getCityRegionId(city)),
    pathLength: route.length,
    targetOwnerAtLaunch: "player",
    attackerKingPower: getKingPower(),
    defenderKingPower: getKingPower(),
    demoAttack: null,
    relinquishTransfer: true,
  };
  if (online) prepareOnlineArmyMission(mission);
  return mission;
}

function applyLocalRelinquishCity(city, destination, mission = null) {
  if (!state || !city || !destination) return false;
  const transferredTroops = Math.max(0, Math.floor(Number(city.troops) || 0));
  if (transferredTroops > 0 && !mission) return false;
  if (mission) state.attacks.push(mission);

  city.owner = "neutral";
  city.ownerKind = "neutral";
  city.ownerUid = null;
  city.ownerName = "";
  city.ownerFlag = null;
  city.ownerKingPower = 0;
  city.ownerShieldExpiresAtMs = 0;
  city.isMainCity = false;
  city.troops = 0;
  city.troopFloat = 0;
  city.investedGold = 0;
  city.relinquishedAtMs = Date.now();
  city.relocatedAtMs = 0;
  localDirtyCityIds.delete(city.id);
  syncCityStateToOnline(city);
  syncOwnedCitiesToOnline(true);
  return true;
}

async function relinquishCity(cityId) {
  const city = cityById(cityId);
  if (!city) {
    showToast("That city is no longer available.");
    return false;
  }
  if (!canRelinquishCity(city)) {
    showToast(isMainCityForList(city) ? "You cannot relinquish your main city." : "You can only relinquish your own cities.");
    return false;
  }

  const regionId = getCityRegionId(city);
  const inFlightKey = `${regionId}:${city.id}`;
  if (serverCityRelinquishInFlightIds.has(inFlightKey)) {
    showToast(`${city.name} is already being relinquished.`);
    return false;
  }

  serverCityRelinquishInFlightIds.add(inFlightKey);
  try {
    const serverAuthority = usesServerEconomyAuthority() && getOnlineApi()?.relinquishCity;
    const destination = getRelinquishDestinationPreview(city, { loadedOnly: !serverAuthority });
    if (!destination) {
      showToast("You need another friendly city to receive the troops.");
      return false;
    }

    const transferredTroops = Math.max(0, Math.floor(Number(city.troops) || 0));
    let route = null;
    let mission = null;
    if (transferredTroops > 0) {
      showToast(`Calculating march to ${destination.name}...`);
      route = await findRouteAsync(city, destination);
      if (!route?.points?.length) {
        showToast("No land and portal route was found to the nearest friendly city.");
        return false;
      }
      mission = createRelinquishTransferMission(city, destination, route, transferredTroops, { online: Boolean(serverAuthority) });
      if (!mission) {
        showToast("Could not prepare the relinquish march.");
        return false;
      }
    }

    if (serverAuthority) {
      const movement = mission ? toOnlineArmyMovement(mission) : null;
      const destinationRegionId = getCityRegionId(destination);
      if (mission && !movement) {
        showToast("Could not prepare the online relinquish march.");
        return false;
      }
      if (mission) mission.onlineRegionIds = movement.routeRegionIds;
      const result = await getOnlineApi().relinquishCity({
        cityId: city.id,
        regionId,
        destinationCityId: destination.id,
        destinationRegionId,
        army: movement ? {
          ...movement,
          sourceRegionId: regionId,
          targetRegionId: destinationRegionId,
          fromName: city.name,
          toName: destination.name,
        } : null,
        routeRegionIds: movement?.routeRegionIds || [],
      });
      applyServerEconomyResult(result);
      if (mission && result?.movement) {
        applyServerMovementToMission(mission, result.movement);
        addServerAcceptedMission(mission);
      }
      const acceptedTroops = Math.max(0, Math.floor(Number(result?.transferredTroops) || 0));
      const destinationName = result?.destinationCity?.name || destination.name || "the nearest friendly city";
      const travelText = result?.movement ? ` (${formatDuration(Number(result.movement.total) || mission?.total || 0)})` : "";
      addLog(acceptedTroops > 0
        ? `Relinquished ${city.name}. ${formatNumber(acceptedTroops)} troops are marching to ${destinationName}${travelText}.`
        : `Relinquished ${city.name}. No stationed troops needed to march.`);
      showToast(`${city.name} relinquished`);
      saveGame();
      if (modal.open) modal.close();
      clearSelection(false);
      renderAll();
      updateOutgoingAttackUi();
      return true;
    }

    if (!applyLocalRelinquishCity(city, destination, mission)) {
      showToast("Could not relinquish that city.");
      return false;
    }
    addLog(transferredTroops > 0
      ? `Relinquished ${city.name}. ${formatNumber(transferredTroops)} troops are marching to ${destination.name} (${formatDuration(mission.total)}).`
      : `Relinquished ${city.name}. No stationed troops needed to march.`);
    showToast(`${city.name} relinquished`);
    saveGame();
    if (modal.open) modal.close();
    clearSelection(false);
    renderAll();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    showToast(error?.message || "Could not relinquish city.");
    console.warn("City relinquish failed", error);
    renderAll();
    return false;
  } finally {
    serverCityRelinquishInFlightIds.delete(inFlightKey);
  }
}

function confirmSendOrder() {
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  const target = selectedTargetId ? getArmyTargetById(selectedTargetId) : null;
  if (!source || !target) return;
  const launched = launchAttack(source.id, target.id, selectedMarchPercent, "player");
  if (launched) {
    clearSelection(false);
    renderAll();
  }
}

function playerMarchTo(targetId) {
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  const target = cityById(targetId);
  if (!source || !target) return;

  if (target.owner === "player") {
    const launched = launchAttack(source.id, target.id, selectedMarchPercent, "player");
    if (launched) {
      selectedTargetId = null;
      renderAll();
    }
    return;
  }

  showAttackPreview(source, target);
}

function normalizeCrownCitadelReignEntry(raw = {}) {
  return {
    playerId: String(raw.playerId || raw.id || ""),
    playerName: cleanName(raw.playerName || raw.displayName || "Ruler") || "Ruler",
    worldId: String(raw.worldId || ""),
    resetGeneration: String(raw.resetGeneration || ""),
    totalHeldMs: Math.max(0, Math.floor(Number(raw.totalHeldMs) || 0)),
    currentHeldSinceMs: Math.max(0, Math.floor(Number(raw.currentHeldSinceMs) || 0)),
    isCurrentHolder: Boolean(raw.isCurrentHolder),
  };
}

function getCrownCitadelReignScoreMs(entry, nowMs = Date.now()) {
  const totalHeldMs = Math.max(0, Number(entry?.totalHeldMs) || 0);
  const currentHeldSinceMs = Math.max(0, Number(entry?.currentHeldSinceMs) || 0);
  return totalHeldMs + (currentHeldSinceMs > 0 ? Math.max(0, nowMs - currentHeldSinceMs) : 0);
}

function getRankedCrownCitadelReigns(entries = []) {
  const holder = getCrownCitadelControlSnapshot();
  const holderUid = getCrownCitadelHolderUid();
  const holderName = cleanName(holder?.ownerName || (holderUid === getCurrentOnlineUid() ? state?.playerName : "")) || "Ruler";
  const heldSinceMs = getCrownCitadelHeldSinceMs();
  const byPlayer = new Map((Array.isArray(entries) ? entries : [])
    .map(normalizeCrownCitadelReignEntry)
    .filter(entry => (!entry.worldId || entry.worldId === ONLINE_WORLD_ID)
      && (!entry.resetGeneration || entry.resetGeneration === RESET_GENERATION))
    .filter(entry => entry.playerId)
    .map(entry => [entry.playerId, {
      ...entry,
      currentHeldSinceMs: 0,
      isCurrentHolder: false,
    }]));

  if (holderUid) {
    const current = byPlayer.get(holderUid) || normalizeCrownCitadelReignEntry({
      playerId: holderUid,
      playerName: holderName,
    });
    byPlayer.set(holderUid, {
      ...current,
      playerName: holderName || current.playerName,
      currentHeldSinceMs: heldSinceMs || Math.max(0, Number(current.currentHeldSinceMs) || 0),
      isCurrentHolder: true,
    });
  }

  const nowMs = Date.now();
  return [...byPlayer.values()]
    .sort((a, b) => getCrownCitadelReignScoreMs(b, nowMs) - getCrownCitadelReignScoreMs(a, nowMs)
      || a.playerName.localeCompare(b.playerName))
    .slice(0, 100);
}

function crownCitadelReignLeaderboardMarkup(entries = [], status = "ready") {
  if (status === "loading") {
    return `<div class="citadel-reign-empty">Loading the Reign Ledger...</div>`;
  }
  if (status === "error") {
    return `<div class="citadel-reign-empty">The Reign Ledger could not be loaded right now.</div>`;
  }
  const ranked = getRankedCrownCitadelReigns(entries);
  if (!ranked.length) {
    return `<div class="citadel-reign-empty">No ruler has held the Crown Citadel yet.</div>`;
  }
  return `
    <div class="citadel-reign-heading">
      <span>Rank</span><span>Ruler</span><span>Time held</span>
    </div>
    <div class="citadel-reign-list">
      ${ranked.map((entry, index) => `
        <article class="citadel-reign-row ${entry.isCurrentHolder ? "current" : ""}">
          <strong class="citadel-reign-rank">#${formatNumber(index + 1)}</strong>
          <span class="citadel-reign-ruler">
            <strong>${escapeHtml(entry.playerName)}</strong>
            ${entry.isCurrentHolder ? `<small>Current Citadel ruler</small>` : ""}
          </span>
          <strong class="citadel-reign-time" data-citadel-reign-score data-total-held-ms="${entry.totalHeldMs}" data-current-held-since-ms="${entry.currentHeldSinceMs}">${formatDuration(Math.floor(getCrownCitadelReignScoreMs(entry) / 1000))}</strong>
        </article>`).join("")}
    </div>
    <p class="citadel-reign-note">Scores are cumulative. The current ruler's score continues rising until the Citadel changes hands.</p>`;
}

async function refreshCrownCitadelReignPanel({ force = false } = {}) {
  const panel = modalBody?.querySelector("[data-citadel-reign-panel]");
  if (!panel) return false;
  if (!force && crownCitadelReignCache.length) {
    panel.innerHTML = crownCitadelReignLeaderboardMarkup(crownCitadelReignCache);
    return true;
  }
  if (crownCitadelReignRequest) return crownCitadelReignRequest;
  const api = getOnlineApi();
  if (!api?.loadCrownCitadelReignLeaderboard || !api?.isSignedIn?.()) {
    panel.innerHTML = crownCitadelReignLeaderboardMarkup([]);
    return false;
  }
  panel.innerHTML = crownCitadelReignLeaderboardMarkup([], "loading");
  crownCitadelReignRequest = api.loadCrownCitadelReignLeaderboard(100)
    .then(entries => {
      crownCitadelReignCache = Array.isArray(entries) ? entries : [];
      const activePanel = modalBody?.querySelector("[data-citadel-reign-panel]");
      if (activePanel) activePanel.innerHTML = crownCitadelReignLeaderboardMarkup(crownCitadelReignCache);
      return true;
    })
    .catch(error => {
      console.warn("Could not load Crown Citadel Reign Ledger", error);
      const activePanel = modalBody?.querySelector("[data-citadel-reign-panel]");
      if (activePanel) activePanel.innerHTML = crownCitadelReignLeaderboardMarkup([], "error");
      return false;
    })
    .finally(() => {
      crownCitadelReignRequest = null;
    });
  return crownCitadelReignRequest;
}

function showCrownCitadelInfoModal(city) {
  const owned = city.owner === "player";
  const report = owned ? null : getScoutReport(city.id);
  const stats = getCityStats(city);
  const heldSinceMs = getCrownCitadelHeldSinceMs();
  const controller = city.owner === "neutral" ? "Neutral defenders" : getCityOwnerDisplayName(city);
  const visibleTroops = owned ? city.troops : report?.troops;
  const visibleDefense = owned ? stats.totalDefense : report?.totalDefense;
  const cachedLedgerMarkup = crownCitadelReignCache.length
    ? crownCitadelReignLeaderboardMarkup(crownCitadelReignCache)
    : crownCitadelReignLeaderboardMarkup([], "loading");

  modalTitle.textContent = `${city.name} - Stronghold`;
  modalBody.innerHTML = `
    <div class="gold-camp-info-panel crown-citadel-info-panel">
      <div class="camp-info-tabs citadel-info-tabs" role="tablist" aria-label="Crown Citadel information">
        <button id="citadelOverviewTab" class="camp-info-tab active" type="button" role="tab" aria-selected="true" aria-controls="citadelOverviewPanel" data-citadel-info-tab="overview">Overview</button>
        <button id="citadelReignsTab" class="camp-info-tab" type="button" role="tab" aria-selected="false" aria-controls="citadelReignsPanel" data-citadel-info-tab="reigns">Reign Ledger</button>
      </div>
      <section id="citadelOverviewPanel" class="camp-info-tab-panel" role="tabpanel" aria-labelledby="citadelOverviewTab" data-citadel-info-panel="overview">
        <div class="city-stat-panel modal-city-stats stronghold-stat-panel">
          <div class="stat-wide stronghold-status"><span>Controlled bonus</span><strong>${getCrownCitadelBonusLabel()}</strong><small>Replaces the controller's individual Stronghold bonuses.</small></div>
          <div class="stat-chip"><span>Controller</span><strong>${escapeHtml(controller)}</strong></div>
          <div class="stat-chip"><span>Current reign</span><strong ${heldSinceMs ? `data-citadel-reign-score data-total-held-ms="0" data-current-held-since-ms="${heldSinceMs}"` : ""}>${heldSinceMs ? formatDuration(Math.floor((Date.now() - heldSinceMs) / 1000)) : "Unclaimed"}</strong></div>
          <div class="stat-chip"><span>Troops stationed</span><strong>${visibleTroops === undefined ? "Unknown" : formatNumber(visibleTroops)}</strong></div>
          <div class="stat-chip"><span>Total defense</span><strong>${visibleDefense === undefined
            ? "Unknown"
            : owned
              ? formatBaseAndBonusStat(stats.baseTotalDefense, stats.totalDefense)
              : formatBaseAndBonusStat(report?.baseTotalDefense ?? visibleDefense, visibleDefense)}</strong></div>
          <div class="stat-chip"><span>Defense level</span><strong>${formatNumber(stats.level)}</strong><small>matches a level ${formatNumber(stats.level)} city</small></div>
          <div class="stat-chip"><span>Garrison limit</span><strong>Unlimited</strong></div>
          ${!owned && !report ? `<div class="stat-wide scout-required"><span>Defense report</span><strong>Scout to reveal</strong></div>` : ""}
          ${owned ? renderRelinquishCityAction(city) : ""}
        </div>
      </section>
      <section id="citadelReignsPanel" class="camp-info-tab-panel" role="tabpanel" aria-labelledby="citadelReignsTab" data-citadel-info-panel="reigns" hidden>
        <div class="citadel-reign-ledger" data-citadel-reign-panel>${cachedLedgerMarkup}</div>
      </section>
    </div>`;

  const tabs = [...modalBody.querySelectorAll("[data-citadel-info-tab]")];
  const panels = [...modalBody.querySelectorAll("[data-citadel-info-panel]")];
  tabs.forEach(tab => tab.addEventListener("click", () => {
    const selectedTab = tab.dataset.citadelInfoTab;
    tabs.forEach(candidate => {
      const selected = candidate === tab;
      candidate.classList.toggle("active", selected);
      candidate.setAttribute("aria-selected", selected ? "true" : "false");
    });
    panels.forEach(panel => {
      panel.hidden = panel.dataset.citadelInfoPanel !== selectedTab;
    });
    if (selectedTab === "reigns") refreshCrownCitadelReignPanel();
  }));
  if (owned) bindRelinquishCityButton(city);
  if (!modal.open) modal.showModal();
}

function showCityInfoModal(cityId) {
  const city = cityById(cityId);
  if (!city) return;
  const stronghold = isStronghold(city);
  if (isCrownCitadel(city)) {
    showCrownCitadelInfoModal(city);
    return;
  }
  if (city.owner !== "player") {
    const report = getScoutReport(city.id);
    const stats = getCityStats(city);
    const remaining = report ? Math.max(0, Math.ceil(report.expiresAt - state.gameSeconds)) : 0;
    const strongholdBonusLabel = stronghold ? getStrongholdBonusLabel(city) : "";
    const neutralStrongholdBase = stronghold && city.owner === "neutral"
      ? `<div class="stat-chip"><span>Neutral base</span><strong>${formatNumber(getStrongholdStartTroops(city))}</strong><small>one-time starting defenders</small></div>`
      : "";
    modalTitle.textContent = stronghold ? `${city.name} - Stronghold` : `${city.name} - Level ${city.level}`;
    modalBody.innerHTML = `
      <div class="city-stat-panel modal-city-stats">
        ${stronghold ? `<div class="stat-wide"><span>Stronghold bonus</span><strong>${strongholdBonusLabel}</strong><small>Bonus is active only for the current controller.</small></div>` : ""}
        <div class="stat-wide"><span>Owner</span><strong>${escapeHtml(getCityOwnerDisplayName(city))}</strong></div>
        <div class="stat-chip"><span>${stronghold ? "Defense level" : "City level"}</span><strong>${formatNumber(stats.level)}</strong></div>
        <div class="stat-chip"><span>Troops</span><strong>${report ? formatNumber(report.troops) : "Unknown"}</strong></div>
        <div class="stat-chip"><span>Total defense</span><strong>${report
          ? formatBaseAndBonusStat(report.baseTotalDefense ?? report.totalDefense, report.totalDefense)
          : "Unknown"}</strong></div>
        ${neutralStrongholdBase}
        ${report
          ? `<div class="stat-wide"><span>Scout report expires</span><strong>${formatDuration(remaining)}</strong></div>`
          : `<div class="stat-wide scout-required"><span>Scout report</span><strong>Not available</strong></div>`}
      </div>
    `;
    if (!modal.open) modal.showModal();
    return;
  }
  const stats = getCityStats(city);
  if (stronghold) {
    const strongholdBonusLabel = getStrongholdBonusLabel(city);
    const effectTargetLabel = isCrownCitadel(city)
      ? "All cities and marches"
      : isDefenseStronghold(city)
      ? "City defense"
      : isSpeedStronghold(city)
      ? "March time"
      : isTrainingStronghold(city)
        ? "Troop production"
        : "Gold production";
    const effectHelp = isCrownCitadel(city)
      ? "replaces other stronghold bonuses while active"
      : isDefenseStronghold(city)
      ? "boosts defending power, not attack power"
      : isSpeedStronghold(city)
      ? "reduces travel time, not attack power"
      : "boosts owned towns while held";
    modalTitle.textContent = `${city.name} - Stronghold`;
    modalBody.innerHTML = `
      <div class="city-stat-panel modal-city-stats stronghold-stat-panel">
        <div class="stat-wide stronghold-status"><span>Controlled bonus</span><strong>${strongholdBonusLabel}</strong><small>Active while you control this Stronghold.</small></div>
        <div class="stat-wide"><span>Total defense</span><strong>${formatBaseAndBonusStat(stats.baseTotalDefense, stats.totalDefense)}</strong><small>${getCityStatBonusSources(stats, "defense")}</small></div>
        <div class="stat-chip"><span>Owner</span><strong>${escapeHtml(getCityOwnerDisplayName(city))}</strong></div>
        <div class="stat-chip"><span>Troops stationed</span><strong>${formatNumber(city.troops)}</strong></div>
        <div class="stat-chip"><span>Defense level</span><strong>${formatNumber(stats.level)}</strong><small>matches a level ${formatNumber(stats.level)} city</small></div>
        <div class="stat-chip"><span>City walls</span><strong>${formatBaseAndBonusStat(stats.baseCityWalls, stats.cityWalls)}</strong><small>${getCityStatBonusSources(stats, "walls")}</small></div>
        <div class="stat-chip"><span>Garrison limit</span><strong>Unlimited</strong><small>station as many troops as you can send</small></div>
        <div class="stat-chip"><span>Effect target</span><strong>${effectTargetLabel}</strong><small>${effectHelp}</small></div>
        ${renderRelinquishCityAction(city)}
      </div>
    `;
    bindRelinquishCityButton(city);
    if (!modal.open) modal.showModal();
    return;
  }
  modalTitle.textContent = `${city.name} \u00B7 Level ${city.level}`;
  modalBody.innerHTML = `
    <div class="city-stat-panel modal-city-stats">
      <div class="stat-wide"><span>Total defense</span><strong>${formatBaseAndBonusStat(stats.baseTotalDefense, stats.totalDefense)}</strong><small>${getCityStatBonusSources(stats, "defense")}</small></div>
      <div class="stat-chip"><span>Troops</span><strong>${formatNumber(city.troops)}</strong></div>
      <div class="stat-chip"><span>Stoneworks</span><strong>${stats.stoneworksPercent}%</strong></div>
      <div class="stat-chip"><span>Defense</span><strong>${formatBaseAndBonusStat(stats.defensePercent, stats.defensePercent + stats.strongholdDefenseBonusPercent, "%")}</strong><small>${CITY_LEVEL_STATS.defensePercentPerLevel}% per level${stats.strongholdDefenseBonusPercent ? ` | Stronghold +${formatNumber(stats.strongholdDefenseBonusPercent)}%` : ""}</small></div>
      <div class="stat-chip"><span>Troops production</span><strong>${formatBaseAndBonusStat(stats.baseTroopProductionPerHour, stats.troopProductionPerHour, "/h")}</strong><small>${getCityStatBonusSources(stats, "troops")}</small></div>
      <div class="stat-chip"><span>City walls</span><strong>${formatBaseAndBonusStat(stats.baseCityWalls, stats.cityWalls)}</strong><small>${getCityStatBonusSources(stats, "walls")}</small></div>
      <div class="stat-chip"><span>Gold production</span><strong>${formatBaseAndBonusStat(stats.baseGoldProductionPerHour, stats.goldProductionPerHour, "/h")}</strong><small>${getCityStatBonusSources(stats, "gold")}</small></div>
    </div>
  `;
  const cooldownRemaining = getCaptureCooldownRemaining(city);
  const mainCityStatus = getMainCityChangeStatus(city);
  const mainCityBlock = mainCityStatus.isMain
    ? `
      <div class="stat-wide main-city-status">
        <span>Home status</span>
        <strong>Main city</strong>
      </div>`
    : `
      <div class="main-city-action-panel">
        <div class="main-city-action-copy">
          <strong>Move main city here</strong>
          <small>Fewer than ${MAIN_CITY_CHANGE_CITY_LIMIT} cities: once every 7 days. ${MAIN_CITY_CHANGE_CITY_LIMIT} or more: once every 14 days.</small>
        </div>
        <button id="changeMainCityBtn" class="main-city-change-btn" type="button"${mainCityStatus.canChange ? "" : " disabled"}>
          <span>Change main city</span>
          ${mainCityStatus.cooldownText ? `<small>${escapeHtml(mainCityStatus.cooldownText)}</small>` : ""}
        </button>
        ${!mainCityStatus.canChange && mainCityStatus.reason ? `<p class="main-city-change-reason">${escapeHtml(mainCityStatus.reason)}</p>` : ""}
      </div>`;
  modalTitle.textContent = `${city.name} - Level ${city.level}`;
  modalBody.innerHTML = `
    <div class="city-stat-panel modal-city-stats">
      ${mainCityBlock}
      ${renderCityLevelUpAction(city)}
      <div class="stat-wide"><span>Total defense</span><strong>${formatBaseAndBonusStat(stats.baseTotalDefense, stats.totalDefense)}</strong><small>${getCityStatBonusSources(stats, "defense")}</small></div>
      <div class="stat-chip"><span>Owner</span><strong>${escapeHtml(getCityOwnerDisplayName(city))}</strong></div>
      <div class="stat-chip"><span>Troops</span><strong>${formatNumber(city.troops)}</strong></div>
      <div class="stat-chip"><span>City defense</span><strong>${formatBaseAndBonusStat(stats.defensePercent, stats.defensePercent + stats.strongholdDefenseBonusPercent, "%")}</strong><small>${CITY_LEVEL_STATS.defensePercentPerLevel}% per level${stats.strongholdDefenseBonusPercent ? ` | Stronghold +${formatNumber(stats.strongholdDefenseBonusPercent)}%` : ""}</small></div>
      <div class="stat-chip"><span>City walls</span><strong>${formatBaseAndBonusStat(stats.baseCityWalls, stats.cityWalls)}</strong><small>${getCityStatBonusSources(stats, "walls")}</small></div>
      <div class="stat-chip"><span>Stoneworks</span><strong>${stats.stoneworksPercent}%</strong><small>Wall defense skill</small></div>
      <div class="stat-chip"><span>Troops production</span><strong>${formatBaseAndBonusStat(stats.baseTroopProductionPerHour, stats.troopProductionPerHour, "/h")}</strong><small>${getCityStatBonusSources(stats, "troops")}</small></div>
      <div class="stat-chip"><span>Gold production</span><strong>${formatBaseAndBonusStat(stats.baseGoldProductionPerHour, stats.goldProductionPerHour, "/h")}</strong><small>${getCityStatBonusSources(stats, "gold")}</small></div>
      <div class="stat-chip"><span>Invested gold</span><strong>${formatNumber(city.investedGold || 0)}</strong><small>Clears when captured</small></div>
      ${cooldownRemaining > 0 ? `<div class="stat-wide"><span>Capture XP cooldown</span><strong>${formatDuration(cooldownRemaining)}</strong></div>` : ""}
      ${renderRelinquishCityAction(city)}
    </div>
  `;
  modalBody.querySelector("#changeMainCityBtn")?.addEventListener("click", () => {
    void changeMainCity(city.id);
  });
  bindCityLevelUpButtons(city);
  bindRelinquishCityButton(city);
  if (!modal.open) modal.showModal();
}

function showCityListModal() {
  if (!state) return;
  modal.classList.add("city-list-modal");
  const refreshPromise = refreshAllOwnedCities(true);
  renderCityListModal();
  if (!modal.open) modal.showModal();
  void refreshPromise;
}

function renderCityListModal() {
  const cities = getSortedCityList();
  const regularCityCount = cities.filter(city => !isStronghold(city)).length;
  const globalStats = getGlobalStatsSnapshot();
  const displayCityCount = hasUsableGlobalStats(globalStats) ? globalStats.totalCities : regularCityCount;
  const rosterIsSyncing = onlineOwnedCitiesRefreshInFlight
    || (!onlineOwnedCitiesCacheComplete && displayCityCount > regularCityCount);
  const rosterCountLabel = rosterIsSyncing && displayCityCount > regularCityCount
    ? `${formatNumber(regularCityCount)} / ${formatNumber(displayCityCount)}`
    : formatNumber(displayCityCount);
  const pageCount = Math.max(1, Math.ceil(cities.length / CITY_LIST_PAGE_SIZE));
  cityListPage = clamp(cityListPage, 0, pageCount - 1);
  const start = cityListPage * CITY_LIST_PAGE_SIZE;
  const pageCities = cities.slice(start, start + CITY_LIST_PAGE_SIZE);
  modalTitle.textContent = "City list";
  modalBody.innerHTML = `
    <div class="city-list-panel">
      <div class="city-list-summary">
        <span>Owned across maps</span>
        <strong>${rosterCountLabel}</strong>
        ${rosterIsSyncing ? `<small class="city-list-syncing" role="status">Syncing full city roster...</small>` : ""}
      </div>
      <div class="city-list-toolbar" aria-label="City list filters">
        <button class="${cityListSortKey === "level" ? "active" : ""}" data-city-list-sort="level" type="button" aria-pressed="${cityListSortKey === "level"}">
          <span>Lv.</span><small>${getCityListSortLabel("level")}</small>
        </button>
        <button class="${cityListSortKey === "troops" ? "active" : ""}" data-city-list-sort="troops" type="button" aria-pressed="${cityListSortKey === "troops"}">
          <span>&#9817;</span><small>${getCityListSortLabel("troops")}</small>
        </button>
      </div>

      <div class="city-list-rows">
        ${pageCities.length
          ? pageCities.map(renderCityListRow).join("")
          : `<div class="city-list-empty">No cities owned yet.</div>`}
      </div>

      <div class="city-list-pager">
        <button data-city-list-page="prev" type="button" ${cityListPage <= 0 ? "disabled" : ""} aria-label="Previous city page">&#10094;</button>
        <strong>${formatNumber(cityListPage + 1)}/${formatNumber(pageCount)}</strong>
        <button data-city-list-page="next" type="button" ${cityListPage >= pageCount - 1 ? "disabled" : ""} aria-label="Next city page">&#10095;</button>
      </div>
    </div>
  `;

  modalBody.querySelectorAll("[data-city-list-sort]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.cityListSort;
      if (cityListSortKey === key) {
        cityListSortDirection = cityListSortDirection === "desc" ? "asc" : "desc";
      } else {
        cityListSortKey = key;
        cityListSortDirection = "desc";
      }
      cityListPage = 0;
      renderCityListModal();
    });
  });

  modalBody.querySelectorAll("[data-city-list-page]").forEach(button => {
    button.addEventListener("click", () => {
      cityListPage += button.dataset.cityListPage === "next" ? 1 : -1;
      renderCityListModal();
    });
  });

  modalBody.querySelectorAll("[data-city-list-jump]").forEach(button => {
    button.addEventListener("click", () => {
      focusCityListLocation(button.dataset.cityListJump);
    });
  });

  modalBody.querySelectorAll("[data-city-list-info]").forEach(button => {
    button.addEventListener("click", async () => {
      modal.classList.remove("city-list-modal");
      await openCityListInfo(button.dataset.cityListInfo);
    });
  });
}

async function focusCityListLocation(cityId) {
  const city = cityById(cityId) || getOwnedCitySnapshotById(cityId);
  if (!city) {
    showToast("That city is no longer available.");
    return;
  }
  const regionId = getCityRegionId(city);
  if (modal.open) modal.close();
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = false;
  selectedTargetId = null;
  if (regionId !== getActiveMapRegionId()) {
    await switchOnlineIsland(regionId);
    if (regionId !== getActiveMapRegionId()) return;
  }
  selectCity(city.id);
  showToast(`Viewing ${city.name}`);
}

async function openCityListInfo(cityId) {
  const city = cityById(cityId) || getOwnedCitySnapshotById(cityId);
  if (!city) {
    showToast("That city is no longer available.");
    return;
  }
  const regionId = getCityRegionId(city);
  if (regionId !== getActiveMapRegionId()) {
    if (modal.open) modal.close();
    const switched = await switchOnlineIsland(regionId);
    if (!switched || regionId !== getActiveMapRegionId()) return;
  }
  showCityInfoModal(city.id);
}

function getSortedCityList() {
  const cities = getAllOwnedCitiesForDisplay().slice();
  const mainCities = cities.filter(isMainCityForList);
  const otherCities = cities.filter(city => !isMainCityForList(city));
  otherCities.sort(compareCityListEntries);
  return [...mainCities.sort((a, b) => a.name.localeCompare(b.name)), ...otherCities];
}

function isMainCityForList(city) {
  if (!city) return false;
  if (isStronghold(city)) return false;
  if (state?.mainCityId) return city.id === state.mainCityId;
  return Boolean(city.isMainCity);
}

function compareCityListEntries(a, b) {
  const valueA = cityListSortKey === "troops" ? Math.floor(Number(a.troops) || 0) : clampCityLevel(a.level);
  const valueB = cityListSortKey === "troops" ? Math.floor(Number(b.troops) || 0) : clampCityLevel(b.level);
  const primary = cityListSortDirection === "desc" ? valueB - valueA : valueA - valueB;
  if (primary !== 0) return primary;
  const secondary = cityListSortKey === "troops"
    ? clampCityLevel(b.level) - clampCityLevel(a.level)
    : Math.floor(Number(b.troops) || 0) - Math.floor(Number(a.troops) || 0);
  if (secondary !== 0) return secondary;
  return a.name.localeCompare(b.name);
}

function getCityListSortLabel(key) {
  if (cityListSortKey !== key) return "Sort";
  if (key === "level") return cityListSortDirection === "desc" ? "High" : "Low";
  return cityListSortDirection === "desc" ? "Most" : "Fewest";
}

function renderCityListRow(city) {
  const isMain = isMainCityForList(city);
  const stronghold = isStronghold(city);
  const troops = Math.floor(Number(city.troops) || 0);
  const regionLabel = getRegionLabel(getCityRegionId(city));
  const statusLabel = stronghold ? getStrongholdShortBonusLabel(city) : isMain ? "Main city" : "";
  const locationLabel = statusLabel ? `${statusLabel} - ${regionLabel}` : regionLabel;
  return `
    <article class="city-list-row ${isMain ? "main-city" : ""} ${stronghold ? "stronghold-city-row" : ""}">
      <button class="city-list-locate" data-city-list-jump="${escapeHtml(city.id)}" type="button" aria-label="Center on ${escapeHtml(city.name)}">${isMain ? "&#8962;" : "&#128205;"}</button>
      <span class="city-list-art" aria-hidden="true">${stronghold ? `<img src="${getStrongholdArtSrc(city)}" alt="" draggable="false" />` : "&#127984;"}</span>
      <span class="city-list-level"><b>${stronghold ? "SH" : formatNumber(clampCityLevel(city.level))}</b></span>
      <strong class="city-list-troops">${formatNumber(troops)} <span aria-hidden="true">&#9817;</span></strong>
      <span class="city-list-name">${escapeHtml(city.name)}</span>
      <span class="city-list-main-label">${escapeHtml(locationLabel)}</span>
      <button class="city-list-info" data-city-list-info="${escapeHtml(city.id)}" type="button" aria-label="Open ${escapeHtml(city.name)} info">&#9432;</button>
    </article>
  `;
}

function getShopItemById(itemId) {
  return SHOP_ITEMS.find(item => item.id === itemId) || null;
}

function renderItemIcon(item, imageClass = "") {
  const label = item?.label || "?";
  if (item?.icon) {
    const classAttr = imageClass ? ` class="${escapeHtml(imageClass)}"` : "";
    return `<img${classAttr} src="${escapeHtml(item.icon)}" alt="" draggable="false" decoding="async" />`;
  }
  return `<span>${escapeHtml(label.slice(0, 1))}</span>`;
}

function renderShopItem(item, inventory) {
  const owned = Math.max(0, Math.floor(Number(inventory[item.id]) || 0));
  const cooldownText = getItemPurchaseCooldownText(item.id);
  const purchaseLimit = getItemDailyPurchaseLimit(item.id);
  const purchaseCount = getItemPurchaseCount(item.id);
  const canBuy = state && !shopPurchaseInFlight && !cooldownText && Math.floor(Number(state.gold) || 0) >= item.cost;
  const buyLabel = cooldownText ? "Cooldown" : "Buy";
  return `
    <article class="shop-item">
      <div class="shop-item-image-placeholder ${item.icon ? "has-image" : ""}" aria-hidden="true">
        ${renderItemIcon(item, "shop-item-image")}
      </div>
      <div class="shop-item-copy">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${formatNumber(item.cost)} gold</span>
        <small>Owned: ${formatNumber(owned)}</small>
        ${purchaseLimit > 0 ? `<small class="shop-item-purchase-limit">Purchased: ${formatNumber(purchaseCount)}/${formatNumber(purchaseLimit)} today (UTC)</small>` : ""}
        ${cooldownText ? `<small class="shop-item-cooldown">UTC reset in ${escapeHtml(cooldownText)}</small>` : ""}
        <small>${escapeHtml(item.description)}</small>
      </div>
      <button class="shop-buy-btn" data-shop-buy="${escapeHtml(item.id)}" type="button" ${canBuy ? "" : "disabled"}>${buyLabel}</button>
    </article>
  `;
}

function renderShopModal() {
  if (!state) return;
  const inventory = ensureShopItems();
  modalTitle.textContent = "Shop";
  modalBody.innerHTML = `
    <div class="shop-panel">
      <section class="shop-balance">
        <span>Gold available</span>
        <strong>${formatNumber(Math.floor(Number(state.gold) || 0))}</strong>
      </section>
      <div class="shop-items">
        ${SHOP_ITEMS.map(item => renderShopItem(item, inventory)).join("")}
      </div>
    </div>
  `;
  modalBody.querySelectorAll("[data-shop-buy]").forEach(button => {
    button.addEventListener("click", () => buyShopItem(button.dataset.shopBuy));
  });
}

function showShopModal() {
  if (!state) return;
  modal.classList.remove("battle-report-modal", "city-list-modal", "island-switcher-modal", "leaderboard-modal", "inventory-modal", "incoming-attack-modal", "outgoing-attack-modal");
  modal.classList.add("shop-modal");
  renderShopModal();
  if (!modal.open) modal.showModal();
}

async function buyShopItem(itemId) {
  if (!state) return;
  if (shopPurchaseInFlight) return;
  const item = getShopItemById(itemId);
  if (!item) return;
  const cooldownText = getItemPurchaseCooldownText(item.id);
  if (cooldownText) {
    showToast(`${item.label} resets at 00:00 UTC, in ${cooldownText}.`);
    renderShopModal();
    return;
  }
  const currentGold = Math.floor(Number(state.gold) || 0);
  if (currentGold < item.cost) {
    showToast(`${item.label} costs ${formatNumber(item.cost)} gold.`);
    renderShopModal();
    return;
  }

  shopPurchaseInFlight = true;
  renderShopModal();

  try {
    if (usesServerEconomyAuthority()) {
      const result = await getOnlineApi().purchaseShopItem({ itemId: item.id, cost: item.cost });
      applyServerEconomyResult(result);
      selectedInventoryItemId = item.id;
      addLog(`Bought ${item.label} for ${formatNumber(item.cost)} gold.`);
      saveGame();
      renderHud();
      showToast(`${item.label} added to Bag.`);
      return;
    }

    const inventory = ensureShopItems();
    state.gold = currentGold - item.cost;
    inventory[item.id] = Math.max(0, Math.floor(Number(inventory[item.id]) || 0)) + 1;
    recordItemPurchase(item.id);

    addLog(`Bought ${item.label} for ${formatNumber(item.cost)} gold.`);
    saveGame();
    renderHud();
    selectedInventoryItemId = item.id;
    showToast(`${item.label} added to Bag.`);
    const cloudSaved = await flushOnlineSave(true);
    if (!cloudSaved && getOnlineApi()?.isSignedIn?.()) {
      showToast(`${item.label} added to Bag. Cloud save will retry.`);
    }
  } catch (error) {
    showToast(error?.message || `Could not buy ${item.label}.`);
    console.warn("Shop purchase failed", error);
  } finally {
    shopPurchaseInFlight = false;
    if (modal.classList.contains("shop-modal")) renderShopModal();
  }
}

function getInventorySlotEntries() {
  const inventory = ensureShopItems();
  const entries = SHOP_ITEMS
    .map(item => ({
      ...item,
      count: Math.max(0, Math.floor(Number(inventory[item.id]) || 0)),
    }))
    .filter(item => item.count > 0)
    .slice(0, INVENTORY_SLOT_COUNT);

  while (entries.length < INVENTORY_SLOT_COUNT) entries.push(null);
  return entries;
}

function renderInventorySlot(entry, selectedItemId = "") {
  if (!entry) {
    return `
      <article class="inventory-slot empty">
        <span class="inventory-slot-empty">Empty</span>
      </article>
    `;
  }
  const selected = entry.id === selectedItemId;
  return `
    <button class="inventory-slot filled ${selected ? "selected" : ""}" data-inventory-select="${escapeHtml(entry.id)}" type="button" aria-pressed="${selected ? "true" : "false"}">
      <span class="inventory-slot-icon ${entry.icon ? "has-image" : ""}" aria-hidden="true">${renderItemIcon(entry, "inventory-slot-image")}</span>
      <strong class="inventory-slot-name">${escapeHtml(entry.label)}</strong>
      <span class="inventory-slot-count">x${formatNumber(entry.count)}</span>
    </button>
  `;
}

function getActiveItemEffectSummaryHtml() {
  const effects = [
    { label: "Peace Shield", expiresAtMs: getActivePeaceShieldExpiresAtMs() },
    { label: "War Drums", expiresAtMs: getActiveWarDrumsExpiresAtMs() },
    { label: "Royal Tax Decree", expiresAtMs: getActiveRoyalTaxDecreeExpiresAtMs() },
    { label: "Veil of Silence", expiresAtMs: getActiveVeilOfSilenceExpiresAtMs() },
  ].filter(effect => getPeaceShieldRemainingSeconds(effect.expiresAtMs) > 0);
  if (!effects.length) return "<small>No active item effects</small>";
  return effects.map(effect => (
    `<small>${escapeHtml(effect.label)} active: ${formatDuration(getPeaceShieldRemainingSeconds(effect.expiresAtMs))}</small>`
  )).join("");
}

function showInventoryModal() {
  if (!state) return;
  const slots = getInventorySlotEntries();
  const filledSlots = slots.filter(Boolean).length;
  const selectedEntry = slots.find(entry => entry?.id === selectedInventoryItemId) || null;
  if (!selectedEntry) selectedInventoryItemId = "";
  const selectedEntryActiveRemaining = selectedEntry ? getInventoryItemActiveRemainingSeconds(selectedEntry) : 0;
  const selectedEntryIsSwiftMarch = selectedEntry?.id === SWIFT_MARCH_ORDER_ITEM_ID;
  const selectedEntryIsRecallHorn = selectedEntry?.id === RECALL_HORN_ITEM_ID;
  const selectedEntryActionLabel = selectedEntryIsSwiftMarch || selectedEntryIsRecallHorn
    ? "View Marches"
    : selectedEntryActiveRemaining > 0 ? "Active" : "Use";
  const activeItemStatus = getActiveItemEffectSummaryHtml();
  modal.classList.remove("battle-report-modal", "city-list-modal", "island-switcher-modal", "leaderboard-modal", "shop-modal", "incoming-attack-modal", "outgoing-attack-modal");
  modal.classList.add("inventory-modal");
  modalTitle.textContent = "Bag";
  modalBody.innerHTML = `
    <div class="inventory-panel">
      <section class="inventory-summary">
        <span>Item slots ${activeItemStatus}</span>
        <strong>${formatNumber(filledSlots)}/${formatNumber(INVENTORY_SLOT_COUNT)}</strong>
      </section>
      <div class="inventory-slots">
        ${slots.map(entry => renderInventorySlot(entry, selectedInventoryItemId)).join("")}
      </div>
      <section class="inventory-selection">
        ${selectedEntry ? `
          <span class="inventory-selection-icon ${selectedEntry.icon ? "has-image" : ""}" aria-hidden="true">${renderItemIcon(selectedEntry, "inventory-selection-image")}</span>
          <div class="inventory-selection-copy">
            <strong>${escapeHtml(selectedEntry.label)}</strong>
            <small>${escapeHtml(selectedEntry.description)}</small>
            ${selectedEntryActiveRemaining > 0 ? `<small>Active: ${formatDuration(selectedEntryActiveRemaining)}</small>` : ""}
            <span>Owned: ${formatNumber(selectedEntry.count)}</span>
          </div>
          <button class="inventory-use-btn" data-inventory-use="${escapeHtml(selectedEntry.id)}" type="button" ${selectedEntryActiveRemaining > 0 ? "disabled" : ""}>${selectedEntryActionLabel}</button>
        ` : `
          <div class="inventory-selection-empty">
            <strong>Select an item</strong>
            <small>Tap an item slot, then press Use.</small>
          </div>
        `}
      </section>
    </div>
  `;
  modalBody.querySelectorAll("[data-inventory-select]").forEach(button => {
    button.addEventListener("click", () => {
      selectedInventoryItemId = button.dataset.inventorySelect || "";
      showInventoryModal();
    });
  });
  modalBody.querySelectorAll("[data-inventory-use]").forEach(button => {
    button.addEventListener("click", () => useInventoryItem(button.dataset.inventoryUse));
  });
  if (!modal.open) modal.showModal();
}

function useInventoryItem(itemId) {
  if (!state) return;
  const item = getShopItemById(itemId);
  if (!item) return;
  const activeRemainingSeconds = getInventoryItemActiveRemainingSeconds(item);
  if (activeRemainingSeconds > 0) {
    showToast(`${item.label} is already active for ${formatDuration(activeRemainingSeconds)}.`);
    if (modal?.open && modal.classList.contains("inventory-modal")) showInventoryModal();
    return;
  }
  if (item.id === ROYAL_PEACE_SHIELD_ITEM_ID) {
    useRoyalPeaceShield(item).catch(error => {
      console.warn("Royal Peace Shield activation failed", error);
      showToast(error?.message || "Could not activate Royal Peace Shield.");
      renderHud();
    });
    return;
  }
  if (item.id === WAR_DRUMS_ITEM_ID) {
    useWarDrums(item).catch(error => {
      console.warn("War Drums activation failed", error);
      showToast(error?.message || "Could not activate War Drums.");
      renderHud();
    });
    return;
  }
  if (item.id === ROYAL_TAX_DECREE_ITEM_ID) {
    useRoyalTaxDecree(item).catch(error => {
      console.warn("Royal Tax Decree activation failed", error);
      showToast(error?.message || "Could not activate Royal Tax Decree.");
      renderHud();
    });
    return;
  }
  if (item.id === VEIL_OF_SILENCE_ITEM_ID) {
    useVeilOfSilence(item).catch(error => {
      console.warn("Veil of Silence activation failed", error);
      showToast(error?.message || "Could not activate Veil of Silence.");
      renderHud();
    });
    return;
  }
  if (item.id === SWIFT_MARCH_ORDER_ITEM_ID) {
    const eligibleMarches = getOutgoingAttacks().filter(isSwiftMarchOrderEligible);
    if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
    if (!eligibleMarches.length) {
      showToast("No eligible troop transfers or Stronghold reinforcements are active.");
      return;
    }
    showOutgoingAttacksModal();
    return;
  }
  if (item.id === RECALL_HORN_ITEM_ID) {
    const eligibleMarches = getOutgoingAttacks().filter(isRecallHornEligible);
    if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
    if (!eligibleMarches.length) {
      showToast("No eligible troop marches are active.");
      return;
    }
    showOutgoingAttacksModal();
    return;
  }
  showToast(`${item.label} mechanics are coming next.`);
}

function consumeInventoryItem(item) {
  const inventory = ensureShopItems();
  const owned = Math.max(0, Math.floor(Number(inventory[item.id]) || 0));
  if (owned <= 0) {
    showToast(`You do not have ${item.label}.`);
    showInventoryModal();
    return null;
  }
  inventory[item.id] = owned - 1;
  if (inventory[item.id] <= 0 && selectedInventoryItemId === item.id) {
    selectedInventoryItemId = "";
  }
  return inventory;
}

async function useServerInventoryItem(item) {
  if (!item || !usesServerEconomyAuthority()) return false;
  const result = await getOnlineApi().activateInventoryItem({ itemId: item.id });
  applyServerEconomyResult(result);
  const expiresAtMs = normalizeTimestampMs(result?.expiresAtMs);
  if (item.id === ROYAL_PEACE_SHIELD_ITEM_ID) {
    addLog(`${item.label} activated. Your kingdom is protected for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}.`);
    updateShieldStatusBadge();
    renderCities(true);
    showToast(`${item.label} active: ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}`);
  } else if (item.id === WAR_DRUMS_ITEM_ID) {
    addLog(`${item.label} activated. Troop production increased by ${formatNumber(WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT)}% for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}.`);
    showToast(`${item.label} active: +${formatNumber(WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT)}% troops for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}`);
  } else if (item.id === ROYAL_TAX_DECREE_ITEM_ID) {
    addLog(`${item.label} activated. City gold production increased by ${formatNumber(ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT)}% for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}.`);
    showToast(`${item.label} active: +${formatNumber(ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT)}% city gold for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}`);
  } else if (item.id === VEIL_OF_SILENCE_ITEM_ID) {
    addLog(`${item.label} activated. Enemy scouts are blocked for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}.`);
    showToast(`${item.label} active: scouts blocked for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}`);
  }
  saveGame();
  renderHud();
  renderPanel();
  if (profileScreen?.classList.contains("open")) renderProfileScreen();
  if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
  return true;
}

async function useRoyalPeaceShield(item) {
  const currentExpiresAtMs = getActivePeaceShieldExpiresAtMs();
  if (currentExpiresAtMs > Date.now()) {
    showToast(`${item.label} is already active for ${formatDuration(getPeaceShieldRemainingSeconds(currentExpiresAtMs))}.`);
    return;
  }
  if (usesServerEconomyAuthority()) {
    await useServerInventoryItem(item);
    return;
  }
  if (!consumeInventoryItem(item)) return;
  const expiresAtMs = Date.now() + ROYAL_PEACE_SHIELD_DURATION_MS;
  const effects = ensureItemEffects();
  effects.shieldExpiresAtMs = expiresAtMs;
  refreshOwnedCityItemEffectMetadata(true);
  addLog(`${item.label} activated. Your kingdom is protected for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}.`);
  saveGame();
  renderHud();
  updateShieldStatusBadge();
  renderCities(true);
  if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
  showToast(`${item.label} active: ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}`);
  const [shieldSynced, cloudSaved] = await Promise.all([
    syncPeaceShieldToAllOwnedCities(expiresAtMs),
    flushOnlineSave(true),
  ]);
  if (!cloudSaved && getOnlineApi()?.isSignedIn?.()) {
    showToast(`${item.label} active. Cloud save will retry.`);
  } else if (!shieldSynced && getOnlineApi()?.isSignedIn?.()) {
    showToast(`${item.label} active. Shield sync will retry.`);
  }
}

async function useWarDrums(item) {
  const currentExpiresAtMs = getActiveWarDrumsExpiresAtMs();
  if (currentExpiresAtMs > Date.now()) {
    showToast(`${item.label} is already active for ${formatDuration(getPeaceShieldRemainingSeconds(currentExpiresAtMs))}.`);
    return;
  }
  if (usesServerEconomyAuthority()) {
    await useServerInventoryItem(item);
    return;
  }
  if (!consumeInventoryItem(item)) return;
  const expiresAtMs = Date.now() + WAR_DRUMS_DURATION_MS;
  const effects = ensureItemEffects();
  effects.warDrumsExpiresAtMs = expiresAtMs;

  addLog(`${item.label} activated. Troop production increased by ${formatNumber(WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT)}% for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}.`);
  saveGame();
  renderHud();
  renderPanel();
  if (profileScreen?.classList.contains("open")) renderProfileScreen();
  if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
  showToast(`${item.label} active: +${formatNumber(WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT)}% troops for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}`);
  const cloudSaved = await flushOnlineSave(true);
  if (!cloudSaved && getOnlineApi()?.isSignedIn?.()) {
    showToast(`${item.label} active. Cloud save will retry.`);
  }
}

async function useRoyalTaxDecree(item) {
  const currentExpiresAtMs = getActiveRoyalTaxDecreeExpiresAtMs();
  if (currentExpiresAtMs > Date.now()) {
    showToast(`${item.label} is already active for ${formatDuration(getPeaceShieldRemainingSeconds(currentExpiresAtMs))}.`);
    return;
  }
  if (usesServerEconomyAuthority()) {
    await useServerInventoryItem(item);
    return;
  }
  if (!consumeInventoryItem(item)) return;
  const expiresAtMs = Date.now() + ROYAL_TAX_DECREE_DURATION_MS;
  const effects = ensureItemEffects();
  effects.royalTaxDecreeExpiresAtMs = expiresAtMs;

  addLog(`${item.label} activated. City gold production increased by ${formatNumber(ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT)}% for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}.`);
  saveGame();
  renderHud();
  renderPanel();
  if (profileScreen?.classList.contains("open")) renderProfileScreen();
  if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
  showToast(`${item.label} active: +${formatNumber(ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT)}% city gold for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}`);
  const cloudSaved = await flushOnlineSave(true);
  if (!cloudSaved && getOnlineApi()?.isSignedIn?.()) {
    showToast(`${item.label} active. Cloud save will retry.`);
  }
}

async function useVeilOfSilence(item) {
  const currentExpiresAtMs = getActiveVeilOfSilenceExpiresAtMs();
  if (currentExpiresAtMs > Date.now()) {
    showToast(`${item.label} is already active for ${formatDuration(getPeaceShieldRemainingSeconds(currentExpiresAtMs))}.`);
    return;
  }
  if (usesServerEconomyAuthority()) {
    await useServerInventoryItem(item);
    return;
  }
  if (!consumeInventoryItem(item)) return;
  const expiresAtMs = Date.now() + VEIL_OF_SILENCE_DURATION_MS;
  const effects = ensureItemEffects();
  effects.veilOfSilenceExpiresAtMs = expiresAtMs;

  addLog(`${item.label} activated. Enemy scouts are blocked for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}.`);
  saveGame();
  renderHud();
  renderPanel();
  if (profileScreen?.classList.contains("open")) renderProfileScreen();
  if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
  showToast(`${item.label} active: scouts blocked for ${formatDuration(getPeaceShieldRemainingSeconds(expiresAtMs))}`);
  const cloudSaved = await flushOnlineSave(true);
  if (!cloudSaved && getOnlineApi()?.isSignedIn?.()) {
    showToast(`${item.label} active. Cloud save will retry.`);
  }
}

function showAttackPreview(source, target) {
  if (!source || !target || source.owner !== "player" || target.owner === "player") return;
  if (source.troops < 1) {
    showToast("No troops available to send.");
    return;
  }

  const mainCityBlockReason = getMainCityAttackBlockReason(target, "player");
  if (mainCityBlockReason) {
    showToast(mainCityBlockReason);
    return;
  }

  const shieldBlockReason = getPeaceShieldAttackBlockReason(target, "player");
  if (shieldBlockReason) {
    showToast(shieldBlockReason);
    return;
  }

  const neutralBlockReason = getNeutralCaptureBlockReason(target, "player");
  if (neutralBlockReason) {
    showNeutralCaptureLimitModal(neutralBlockReason);
    return;
  }

  const preview = calculateBattlePreview(source, target, selectedMarchPercent);
  if (!preview.path) {
    showToast("No land route found around the terrain.");
    return;
  }
  const demoNotice = getDemoAttackNotice(preview.demoAttack);
  const shieldDropWarning = getPeaceShieldAttackWarning(target);
  modalTitle.textContent = `Attack ${target.name}`;
  modalBody.innerHTML = `
    <div class="battle-preview ${preview.success ? "win" : "lose"}">
      <div class="battle-result"><strong>${preview.success ? "Likely Victory" : "Likely Defeat"}</strong><span>${preview.label}</span></div>
      <div class="stat-grid">
        <div class="stat-card"><strong>${formatNumber(preview.send)}</strong><small>troops to send</small></div>
        <div class="stat-card"><strong>${formatNumber(target.troops)}</strong><small>target troops</small></div>
        <div class="stat-card"><strong>${formatNumber(preview.attackPower)}</strong><small>attack power</small></div>
        <div class="stat-card"><strong>${formatNumber(preview.defensePower)}</strong><small>defense power</small></div>
      </div>
      <p><strong>${source.name}</strong> \u2192 <strong>${target.name}</strong> \u00B7 ${formatPercent(selectedMarchPercent)} march \u00B7 about ${formatDuration(preview.travel)} travel.</p>
      <p>Route distance: <strong>${formatNumber(preview.pathLength)}</strong> map units. Troops avoid water, lakes, mountains, cities, and strongholds. Swamp and forests are walkable.</p>
      <p>${preview.success
        ? `Expected capture with about <strong>${formatNumber(preview.survivors)}</strong> surviving troops.`
        : `Expected failure with about <strong>${formatNumber(preview.defendersLeft)}</strong> defenders left.`}</p>
      ${demoNotice ? `<p class="tiny-warning">${escapeHtml(demoNotice)}</p>` : ""}
      ${shieldDropWarning ? `<p class="shield-drop-warning"><strong>Shield warning</strong><span>${escapeHtml(shieldDropWarning)}</span></p>` : ""}
      <p class="tiny-warning">This is an estimate based on current numbers. Confirm launches using the current troop count.</p>
      <div class="modal-actions">
        <button id="confirmAttackBtn" class="danger-action" type="button">Attack</button>
        <button id="cancelAttackBtn" class="safe-action" type="button">Cancel</button>
      </div>
    </div>
  `;

  modalBody.innerHTML = `
    <div class="battle-preview ${preview.success ? "win" : "lose"}">
      <div class="battle-result"><strong>${preview.success ? "Likely Victory" : "Likely Defeat"}</strong><span>${preview.label} - ${Math.round(preview.xpEfficiency * 100)}% XP</span></div>
      <div class="stat-grid">
        <div class="stat-card"><strong>${formatNumber(preview.send)}</strong><small>troops to send</small></div>
        <div class="stat-card"><strong>${formatNumber(target.troops)}</strong><small>target troops</small></div>
        <div class="stat-card"><strong>${formatNumber(preview.attackPower)}</strong><small>attack power</small></div>
        <div class="stat-card"><strong>${formatNumber(preview.defensePower)}</strong><small>defense power</small></div>
        <div class="stat-card"><strong>${formatNumber(preview.captureXp)}</strong><small>${preview.xpLabel}</small></div>
        <div class="stat-card"><strong>${formatNumber(preview.attackerLosses)}</strong><small>est. attacker losses</small></div>
      </div>
      <p><strong>${escapeHtml(source.name)}</strong> to <strong>${escapeHtml(target.name)}</strong> - ${formatPercent(selectedMarchPercent)} march - about ${formatDuration(preview.travel)} travel.</p>
      <p>Route distance: <strong>${formatNumber(preview.pathLength)}</strong> map units. Troops avoid water, lakes, mountains, cities, and strongholds.</p>
      <p>${preview.success
        ? `Expected capture with about <strong>${formatNumber(preview.survivors)}</strong> surviving troops.`
        : `Expected failure with about <strong>${formatNumber(preview.defendersLeft)}</strong> defenders left.`}</p>
      ${demoNotice ? `<p class="tiny-warning">${escapeHtml(demoNotice)}</p>` : ""}
      ${shieldDropWarning ? `<p class="shield-drop-warning"><strong>Shield warning</strong><span>${escapeHtml(shieldDropWarning)}</span></p>` : ""}
      ${preview.cooldownRemaining > 0 ? `<p class="tiny-warning">Recent capture cooldown: XP is reduced for ${formatDuration(preview.cooldownRemaining)}.</p>` : ""}
      <p class="tiny-warning">This is an estimate based on current numbers. Confirm launches using the current troop count.</p>
      <div class="modal-actions">
        <button id="confirmAttackBtn" class="danger-action" type="button">Attack</button>
        <button id="cancelAttackBtn" class="safe-action" type="button">Cancel</button>
      </div>
    </div>
  `;

  modalBody.querySelector("#confirmAttackBtn").addEventListener("click", () => {
    modal.close();
    const currentSource = cityById(source.id);
    const currentTarget = cityById(target.id);
    if (!currentSource || !currentTarget || currentSource.owner !== "player" || currentTarget.owner === "player") {
      showToast("Attack canceled. The map changed.");
      renderAll();
      return;
    }
    const launched = launchAttack(currentSource.id, currentTarget.id, selectedMarchPercent, "player");
    if (launched) {
      selectedTargetId = null;
      renderAll();
    }
  });
  modalBody.querySelector("#cancelAttackBtn").addEventListener("click", () => modal.close());
  if (!modal.open) modal.showModal();
}

function setMarchPercent(percent) {
  selectedMarchPercent = normalizeMarchPercent(percent);
  if (state) {
    state.marchPercent = selectedMarchPercent;
    saveGame();
  }
  renderAll();
}

function clearSelection(shouldRender = true) {
  selectedSourceId = null;
  selectedTargetId = null;
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = false;
  if (shouldRender) renderAll();
}

function recruit(cityId) {
  const city = cityById(cityId);
  const cost = getRecruitCost(city);
  if (!city || state.gold < cost) return;
  state.gold -= cost;
  const amount = getRecruitAmount(city);
  city.troopFloat += amount;
  city.troops = Math.floor(city.troopFloat);
  markOwnedCityChanged(city);
  addLog(`Recruited ${formatNumber(amount)} troops at ${city.name}.`);
  showToast(`Recruited at ${city.name}`);
  saveGame();
  renderAll();
}

async function upgradeCity(cityId, levels = 1) {
  const city = cityById(cityId);
  if (!city) return;
  const requestedLevels = Math.max(1, Math.floor(Number(levels) || 1));
  if (city.owner !== "player") {
    showToast("You do not own that city.");
    renderAll();
    return;
  }
  if (isStronghold(city)) {
    showToast("Strongholds cannot be upgraded.");
    renderAll();
    return;
  }
  const incomingBlockers = getIncomingUpgradeBlockers(city.id);
  if (incomingBlockers.length) {
    showToast(`${city.name} cannot be upgraded while an attack is incoming. Arrival: ${formatDuration(incomingBlockers[0].remaining)}.`);
    renderAll();
    return;
  }
  if (usesServerEconomyAuthority()) {
    const inFlightKey = city.id;
    if (serverCityUpgradeInFlightIds.has(inFlightKey)) {
      showToast(`${city.name} upgrade is already processing.`);
      return;
    }
    serverCityUpgradeInFlightIds.add(inFlightKey);
    let totalUpgraded = 0;
    let totalSpent = 0;
    let totalTroopsAwarded = 0;
    try {
      let remainingLevels = requestedLevels;
      while (remainingLevels > 0) {
        const chunkLevels = Math.min(remainingLevels, SERVER_CITY_UPGRADE_LEVEL_CHUNK);
        const result = await getOnlineApi().upgradeCity({
          cityId: city.id,
          regionId: getCityRegionId(city),
          levels: chunkLevels,
        });
        applyServerEconomyResult(result);
        const upgraded = Math.max(0, Math.floor(Number(result?.upgraded) || chunkLevels));
        totalUpgraded += upgraded;
        totalSpent += Math.max(0, Math.floor(Number(result?.spentGold) || 0));
        totalTroopsAwarded += Math.max(0, Math.floor(Number(result?.troopsAwarded) || 0));
        remainingLevels -= upgraded;
        if (upgraded < chunkLevels) break;
      }
      const updatedCity = cityById(city.id) || city;
      const levelText = totalUpgraded > 1 ? `${formatNumber(totalUpgraded)} levels` : "1 level";
      addLog(`${updatedCity.name} upgraded ${levelText} to level ${formatNumber(updatedCity.level)}${totalSpent ? ` for ${formatNumber(totalSpent)} gold` : ""}.`);
      showToast(`${updatedCity.name} upgraded ${levelText}${totalTroopsAwarded ? ` · +${formatNumber(totalTroopsAwarded)} level-up troops` : ""}`);
      renderAll();
    } catch (error) {
      onlineLastError = error?.message || String(error);
      if (totalUpgraded > 0) {
        const updatedCity = cityById(city.id) || city;
        showToast(`${updatedCity.name} upgraded ${formatNumber(totalUpgraded)} level${totalUpgraded === 1 ? "" : "s"}`);
      } else {
        showToast(error?.message || "Could not upgrade city.");
      }
      console.warn("Server city upgrade failed", error);
      renderAll();
    } finally {
      serverCityUpgradeInFlightIds.delete(inFlightKey);
    }
    return;
  }
  let upgraded = 0;
  let xpAward = 0;
  while (upgraded < requestedLevels) {
    const cost = getLevelCost(city);
    if (!Number.isFinite(cost) || state.gold < cost) break;
    state.gold -= cost;
    city.investedGold = Math.max(0, Math.floor(Number(city.investedGold) || 0)) + cost;
    const nextLevel = clampCityLevel(city.level + 1);
    if (nextLevel <= city.level) break;
    city.level = nextLevel;
    xpAward += getCityUpgradeXpAward(city);
    upgraded += 1;
  }

  if (!upgraded) {
    showToast(Number.isFinite(getLevelCost(city)) ? "Not enough gold" : "That upgrade is outside the supported number range");
    renderAll();
    return;
  }

  addLog(`${city.name} upgraded to level ${city.level}.`);
  showToast(`${city.name} upgraded`);
  addCharacterXp(xpAward, `${city.name} upgrade`);
  markOwnedCityChanged(city);
  saveGame();
  renderAll();
}

function fortifyCity(cityId) {
  const city = cityById(cityId);
  if (!city) return;
  showToast("City defense now comes from city level. Use Level Up to improve walls and defense.");
}

function getRecruitAmount(city) {
  return Math.max(20, Math.floor(getCityStats(city).troopProductionPerHour / 2));
}

function getRecruitCost(city) {
  return Math.floor(25 + getCityStats(city).level * 5);
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

function getRawCityUpgradeCostAtLevel(currentLevel) {
  const startLevel = clampCityLevel(currentLevel);
  const targetLevel = startLevel + 1;
  if (!Number.isSafeInteger(targetLevel)) return Infinity;
  const cost = getMillionLordsPassiveGoldPerHour(startLevel)
    * getCityUpgradeTargetHours(startLevel);
  return Number.isFinite(cost) ? cost : Infinity;
}

function getCityUpgradeReductionPercent(city) {
  return city?.owner === "player"
    ? Math.min(85, getControlledStrongholdUpgradeCostReductionPercent("player") + getSkillPercent("guildCharters"))
    : 0;
}

function getCityUpgradeCostAtLevel(currentLevel, reductionPercent = 0) {
  const rawCost = getRawCityUpgradeCostAtLevel(currentLevel);
  if (!Number.isFinite(rawCost)) return Infinity;
  return Math.max(10, Math.floor(rawCost * (1 - Math.min(85, Math.max(0, reductionPercent)) / 100) + 0.000001));
}

function getMultiLevelCost(city, levels) {
  if (!city || isStronghold(city)) return Infinity;
  const startLevel = clampCityLevel(city.level);
  const levelCount = Math.max(0, Math.floor(Number(levels) || 0));
  const reductionPercent = getCityUpgradeReductionPercent(city);
  let totalCost = 0;
  for (let offset = 0; offset < levelCount; offset += 1) {
    const cost = getCityUpgradeCostAtLevel(startLevel + offset, reductionPercent);
    if (!Number.isFinite(cost) || !Number.isFinite(totalCost + cost)) return Infinity;
    totalCost += cost;
  }
  return totalCost;
}

function getLevelCost(city) {
  return getMultiLevelCost(city, 1);
}

function getAffordableCityUpgradeLevels(city, levelLimit = Number.POSITIVE_INFINITY) {
  if (!state || !city || city.owner !== "player" || isStronghold(city)) return 0;
  const currentLevel = clampCityLevel(city.level);
  const rawLimit = Number.isFinite(Number(levelLimit)) ? Math.floor(Number(levelLimit)) : Number.MAX_SAFE_INTEGER;
  const maxLevels = Math.max(0, rawLimit);
  const availableGold = Math.max(0, Math.floor(Number(state.gold) || 0));
  const reductionPercent = getCityUpgradeReductionPercent(city);
  let affordableLevels = 0;
  let spentGold = 0;
  while (affordableLevels < maxLevels) {
    const cost = getCityUpgradeCostAtLevel(currentLevel + affordableLevels, reductionPercent);
    if (!Number.isFinite(cost) || cost > availableGold - spentGold) break;
    spentGold += cost;
    affordableLevels += 1;
  }
  return affordableLevels;
}

function renderCityLevelUpButton({ label, levels, cost, disabled, reason }) {
  const safeLevels = Math.max(0, Math.floor(Number(levels) || 0));
  const costLabel = Number.isFinite(cost) && cost > 0 ? `${formatNumber(cost)}g` : (reason || "Unavailable");
  return `
    <button class="city-level-up-btn" data-city-upgrade-levels="${safeLevels}" type="button" ${disabled ? "disabled" : ""}>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(reason || costLabel)}</small>
    </button>`;
}

function renderCityLevelUpAction(city) {
  if (!city || city.owner !== "player" || isStronghold(city)) return "";
  const currentLevel = clampCityLevel(city?.level || 1);
  const incomingBlockers = city ? getIncomingUpgradeBlockers(city.id) : [];
  const inFlight = city ? serverCityUpgradeInFlightIds.has(city.id) : false;
  const baseDisabledReason = incomingBlockers.length
    ? "Incoming"
    : inFlight
      ? "Working"
      : "";
  const oneCost = getMultiLevelCost(city, 1);
  const fiveCost = getMultiLevelCost(city, 5);
  const affordableMax = baseDisabledReason ? 0 : getAffordableCityUpgradeLevels(city);
  const maxCost = affordableMax > 0 ? getMultiLevelCost(city, affordableMax) : Infinity;
  const nextLevelLabel = `Next: Lv ${formatNumber(currentLevel + 1)}`;
  const availableGold = Math.max(0, Math.floor(Number(state?.gold) || 0));
  const insufficientReason = Number.isFinite(oneCost) ? `Need ${formatNumber(oneCost)}g` : "Unavailable";

  return `
    <section class="city-level-up-panel">
      <div class="city-level-up-copy">
        <strong>Level up city</strong>
        <small>${escapeHtml(nextLevelLabel)} · Gold ${formatNumber(availableGold)}</small>
      </div>
      <div class="city-level-up-actions">
        ${renderCityLevelUpButton({
          label: "1 lvl",
          levels: 1,
          cost: oneCost,
          disabled: Boolean(baseDisabledReason) || availableGold < oneCost,
          reason: baseDisabledReason || (availableGold < oneCost ? insufficientReason : ""),
        })}
        ${renderCityLevelUpButton({
          label: "5 lvls",
          levels: 5,
          cost: fiveCost,
          disabled: Boolean(baseDisabledReason) || !Number.isFinite(fiveCost) || availableGold < fiveCost,
          reason: baseDisabledReason || (!Number.isFinite(fiveCost) ? "Unavailable" : availableGold < fiveCost ? `Need ${formatNumber(fiveCost)}g` : ""),
        })}
        ${renderCityLevelUpButton({
          label: "Max",
          levels: affordableMax,
          cost: maxCost,
          disabled: Boolean(baseDisabledReason) || affordableMax < 1,
          reason: baseDisabledReason || (affordableMax < 1 ? insufficientReason : `+${formatNumber(affordableMax)} · ${formatNumber(maxCost)}g`),
        })}
      </div>
    </section>`;
}

function bindCityLevelUpButtons(city) {
  modalBody.querySelectorAll("[data-city-upgrade-levels]").forEach(button => {
    button.addEventListener("click", async () => {
      const levels = Math.max(0, Math.floor(Number(button.dataset.cityUpgradeLevels) || 0));
      if (levels < 1) return;
      button.disabled = true;
      await upgradeCity(city.id, levels);
      const refreshedCity = cityById(city.id);
      if (refreshedCity && modal.open) showCityInfoModal(refreshedCity.id);
    });
  });
}

function getFortifyCost(city) {
  return Infinity;
}

function calculateBattlePreview(source, target, percent) {
  const requestedSend = clamp(Math.floor(source.troops * percent), 1, source.troops);
  return calculateBattlePreviewForTroops(source, target, requestedSend);
}

function calculateBattlePreviewForTroops(source, target, amount, knownRoute = null) {
  const requestedSend = clamp(Math.floor(amount), 1, source.troops);
  const demoAttack = createDemoAttackSnapshot(source, target, requestedSend, "player");
  const send = demoAttack?.active ? demoAttack.effectiveTroops : requestedSend;
  const result = calculateCombatResult(send, "player", target, { demoAttack });
  const givenUpNeutralTarget = isGivenUpNeutralCity(target);
  const xpEfficiency = demoAttack?.active || givenUpNeutralTarget ? 0 : getCaptureXpEfficiency(target, target.owner);
  const captureXp = demoAttack?.active || givenUpNeutralTarget
    ? 0
    : result.success
      ? getCaptureXpAward(target, target.owner, result.defenderLosses, "player")
      : getFailedAttackXpAward(target, target.owner, Math.max(0, Math.floor(Number(target.troops) || 0)), "player");
  const xpLabel = demoAttack?.active ? "attacker XP" : result.success ? "capture XP" : "defeat XP";
  const cooldownRemaining = getCaptureCooldownRemaining(target);
  let label = "Weak odds";
  if (result.ratio >= 1.35) label = "Overwhelming advantage";
  else if (result.ratio >= 1.12) label = "Good advantage";
  else if (result.ratio > 1) label = "Close win";
  else if (result.ratio >= .82) label = "Risky attack";
  if (demoAttack?.active) label = `${demoAttack.label}: ${label}`;
  const route = knownRoute || findRoute(source, target);
  const travel = route ? travelTime(source, target, "player", route.length, send, "attack", { demoAttack }) : Infinity;
  return {
    requestedSend,
    send,
    attackPower: result.attackPower,
    defensePower: result.defensePower,
    ratio: result.ratio,
    success: result.success,
    survivors: result.survivors,
    defendersLeft: result.defendersLeft,
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    xpEfficiency,
    captureXp,
    xpLabel,
    cooldownRemaining,
    label,
    demoAttack,
    travel,
    path: route?.points || null,
    pathLength: route?.length || 0,
  };
}

function estimateOutcome(source, target, percent) {
  return calculateBattlePreview(source, target, percent).label;
}

function showEmpireModal() {
  if (!state) {
    showToast("Start a map first.");
    return;
  }
  profileScreen.classList.add("open");
  profileScreen.setAttribute("aria-hidden", "false");
  showProfileSkills();
}

function skillRow(key) {
  const config = SKILL_CONFIG[key];
  const level = getSkillLevel(key);
  const percent = getSkillPercent(key);
  const capText = Number.isFinite(config.maxPercent) ? `, cap ${config.maxPercent}%` : "";
  const capped = isSkillAtCap(key);
  const disabled = skillActionInFlight || Math.max(0, Math.floor(Number(state.character?.skillPoints) || 0)) < 1 || capped ? "disabled" : "";
  const buttonLabel = capped ? "Max" : "+1";
  return `
    <div class="skill-row">
      <div><strong>${config.label} Lv ${level} - +${percent}%</strong><br><small>${config.description}${capText}</small></div>
      <button data-skill="${key}" ${disabled}>${buttonLabel}</button>
    </div>
  `;
}

async function buySkill(skill) {
  const config = SKILL_CONFIG[skill];
  if (!config) return;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  reconcileSkillPoints(state.character, state.upgrades);
  if (isSkillAtCap(skill)) {
    showToast(`${config.label} is capped at ${config.maxPercent}%.`);
    return;
  }
  if (state.character.skillPoints < 1) {
    showToast("Earn a hero level for another skill point.");
    return;
  }
  if (usesServerEconomyAuthority() && getOnlineApi()?.spendSkillPoint) {
    if (skillActionInFlight) return;
    skillActionInFlight = true;
    renderProfileSkills();
    try {
      const result = await getOnlineApi().spendSkillPoint({ skillId: skill });
      applyServerEconomyResult(result);
      addLog(`${config.label} improved to level ${getSkillLevel(skill)}.`);
      showToast(`${config.label} improved`);
    } catch (error) {
      console.warn("Could not spend skill point on server", error);
      showToast(error?.message || "Skill upgrade failed.");
    } finally {
      skillActionInFlight = false;
      renderAll();
    }
    return;
  }
  state.character.skillPoints -= 1;
  state.upgrades[skill] = getSkillLevel(skill) + 1;
  addLog(`${SKILL_CONFIG[skill].label} improved to level ${state.upgrades[skill]}.`);
  saveGame();
  renderAll();
}

async function resetSkills() {
  if (!state) return;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  const repairedPoints = reconcileSkillPoints(state.character, state.upgrades);
  const spentPoints = getSpentSkillPoints();
  if (spentPoints < 1 && !repairedPoints) {
    showToast("No spent skill points to reset.");
    renderProfileSkills();
    return;
  }
  if (usesServerEconomyAuthority() && getOnlineApi()?.resetSkills) {
    if (skillActionInFlight) return;
    skillActionInFlight = true;
    renderProfileSkills();
    try {
      const result = await getOnlineApi().resetSkills();
      applyServerEconomyResult(result);
      const resetCost = Number.isFinite(Number(result?.resetCost)) ? Math.max(0, Math.floor(Number(result.resetCost))) : SKILL_RESET_COST;
      const refundedPoints = Number.isFinite(Number(result?.spentPoints)) ? Math.max(0, Math.floor(Number(result.spentPoints))) : spentPoints;
      if (refundedPoints > 0) {
        addLog(`Skills reset for ${formatNumber(resetCost)} gold. Refunded ${formatNumber(refundedPoints)} skill ${refundedPoints === 1 ? "point" : "points"}.`);
        showToast(`Skills reset: +${formatNumber(refundedPoints)} points`);
      } else {
        addLog("Skill points repaired to match hero level.");
        showToast("Skill points repaired");
      }
    } catch (error) {
      console.warn("Could not reset skills on server", error);
      showToast(error?.message || "Skill reset failed.");
    } finally {
      skillActionInFlight = false;
      renderAll();
    }
    return;
  }
  const resetCost = spentPoints > 0 ? SKILL_RESET_COST : 0;
  const currentGold = Math.floor(Number(state.gold) || 0);
  if (currentGold < resetCost) {
    showToast(`Skill reset costs ${formatNumber(SKILL_RESET_COST)} gold.`);
    renderProfileSkills();
    return;
  }
  state.gold = currentGold - resetCost;
  state.character.skillPoints = getEarnedSkillPoints(state.character);
  state.upgrades = createDefaultSkills();
  if (spentPoints > 0) {
    addLog(`Skills reset for ${formatNumber(SKILL_RESET_COST)} gold. Refunded ${formatNumber(spentPoints)} skill ${spentPoints === 1 ? "point" : "points"}.`);
  } else {
    addLog("Skill points repaired to match hero level.");
  }
  saveGame();
  renderAll();
  showToast(spentPoints > 0 ? `Skills reset: +${formatNumber(spentPoints)} points` : "Skill points repaired");
}

function updateIncomingAttackUi() {
  if (!incomingAttackBtn) return;
  const incoming = getIncomingAttacks();
  incomingAttackBtn.hidden = incoming.length === 0;
  incomingAttackBtn.classList.toggle("active", incoming.length > 0);
  if (!incoming.length) {
    if (incomingAttackCount) incomingAttackCount.textContent = "0";
    if (incomingAttackTime) incomingAttackTime.textContent = "Incoming";
    if (modal.open && modal.classList.contains("incoming-attack-modal")) modal.close();
    return;
  }

  if (incomingAttackCount) incomingAttackCount.textContent = formatNumber(incoming.length);
  if (incomingAttackTime) incomingAttackTime.textContent = formatDuration(incoming[0].remaining);
  incomingAttackBtn.title = `${formatIncomingThreatSummary(incoming)} - soonest ${formatDuration(incoming[0].remaining)}`;
  incomingAttackBtn.setAttribute("aria-label", incomingAttackBtn.title);

  if (modal.open && modal.classList.contains("incoming-attack-modal")) {
    renderIncomingAttacksModalContent(incoming);
  }
}

function updateOutgoingAttackUi() {
  if (!outgoingAttackBtn) return;
  const operations = getActiveOperationsSnapshot();
  const total = operations.marches.length + operations.camps.length + operations.strongholds.length;
  outgoingAttackBtn.hidden = total === 0;
  outgoingAttackBtn.classList.toggle("active", total > 0);
  if (!total) {
    if (outgoingAttackCount) outgoingAttackCount.textContent = "0";
    if (outgoingAttackTime) outgoingAttackTime.textContent = "Marches";
    outgoingAttackBtn.removeAttribute("title");
    outgoingAttackBtn.setAttribute("aria-label", "Kingdom activity");
    if (modal.open && modal.classList.contains("outgoing-attack-modal")) modal.close();
    return;
  }

  const soonestCamp = operations.camps
    .filter(camp => camp.payoutAtMs > Date.now())
    .sort((a, b) => a.payoutAtMs - b.payoutAtMs)[0];
  const status = operations.marches.length
    ? operations.marches[0].serverPending ? "Sending" : formatDuration(operations.marches[0].remaining)
    : soonestCamp
      ? formatDuration(Math.max(0, Math.ceil((soonestCamp.payoutAtMs - Date.now()) / 1000)))
      : "Holdings";
  const titleParts = [];
  if (operations.marches.length) titleParts.push(formatOutgoingMissionSummary(operations.marches));
  if (operations.camps.length) titleParts.push(`${formatNumber(operations.camps.length)} held ${operations.camps.length === 1 ? "camp" : "camps"}`);
  if (operations.strongholds.length) titleParts.push(`${formatNumber(operations.strongholds.length)} held ${operations.strongholds.length === 1 ? "stronghold" : "strongholds"}`);
  if (outgoingAttackCount) outgoingAttackCount.textContent = formatNumber(total);
  if (outgoingAttackTime) outgoingAttackTime.textContent = status;
  outgoingAttackBtn.title = titleParts.join(" - ");
  outgoingAttackBtn.setAttribute("aria-label", outgoingAttackBtn.title);

  if (modal.open && modal.classList.contains("outgoing-attack-modal")) {
    renderOutgoingAttacksModalContent(operations);
  }
}

function getHeldCampsForActiveOperations() {
  const held = new Map(onlineHeldCampStates);
  const currentUid = getCurrentOnlineUid();
  onlineCampStates.forEach(camp => {
    if (currentUid && camp.holderUid === currentUid) held.set(camp.id, camp);
    else held.delete(camp.id);
  });
  return [...held.values()]
    .map(camp => getCampTargetById(camp.id))
    .filter(camp => camp?.owner === "player")
    .sort((a, b) => (a.payoutAtMs || Number.MAX_SAFE_INTEGER) - (b.payoutAtMs || Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name));
}

function getHeldStrongholdsForActiveOperations() {
  const held = new Map();
  onlineOwnedCitiesCache.forEach(city => {
    if (isStronghold(city)) held.set(city.id, city);
  });
  (state?.cities || []).forEach(city => {
    if (city.owner === "player" && isStronghold(city)) held.set(city.id, city);
  });
  return [...held.values()]
    .sort((a, b) => getRegionLabel(getCityRegionId(a)).localeCompare(getRegionLabel(getCityRegionId(b)))
      || a.name.localeCompare(b.name));
}

function getActiveOperationsSnapshot() {
  return {
    marches: getOutgoingAttacks(),
    camps: getHeldCampsForActiveOperations(),
    strongholds: getHeldStrongholdsForActiveOperations(),
  };
}

function getArmyKindCounts(missions) {
  return missions.reduce((counts, mission) => {
    if (mission.returning) counts.returns += 1;
    else if (mission.kind === "scout") counts.scouts += 1;
    else if (mission.kind === "transfer") counts.transfers += 1;
    else counts.attacks += 1;
    return counts;
  }, { attacks: 0, scouts: 0, transfers: 0, returns: 0 });
}

function getIncomingThreatCounts(incoming) {
  return getArmyKindCounts(incoming);
}

function formatIncomingThreatSummary(incoming) {
  const counts = getIncomingThreatCounts(incoming);
  const parts = [];
  if (counts.attacks) parts.push(`${formatNumber(counts.attacks)} incoming ${counts.attacks === 1 ? "attack" : "attacks"}`);
  if (counts.scouts) parts.push(`${formatNumber(counts.scouts)} incoming ${counts.scouts === 1 ? "scout" : "scouts"}`);
  return parts.join(", ") || "No incoming threats";
}

function formatOutgoingMissionSummary(outgoing) {
  const counts = getArmyKindCounts(outgoing);
  const parts = [];
  if (counts.attacks) parts.push(`${formatNumber(counts.attacks)} outgoing ${counts.attacks === 1 ? "attack" : "attacks"}`);
  if (counts.scouts) parts.push(`${formatNumber(counts.scouts)} outgoing ${counts.scouts === 1 ? "scout" : "scouts"}`);
  if (counts.transfers) parts.push(`${formatNumber(counts.transfers)} ${counts.transfers === 1 ? "troop transfer" : "troop transfers"}`);
  if (counts.returns) parts.push(`${formatNumber(counts.returns)} returning ${counts.returns === 1 ? "army" : "armies"}`);
  return parts.join(", ") || "No active marches";
}

function showIncomingAttacksModal() {
  const incoming = getIncomingAttacks();
  if (!incoming.length) {
    showToast("No incoming attacks or scouts right now.");
    updateIncomingAttackUi();
    return;
  }
  modal.classList.remove("outgoing-attack-modal");
  modal.classList.add("incoming-attack-modal");
  renderIncomingAttacksModalContent(incoming);
  if (!modal.open) modal.showModal();
}

function renderIncomingAttacksModalContent(incoming = getIncomingAttacks()) {
  if (!incoming.length) {
    modalTitle.textContent = "Incoming Threats";
    modalBody.innerHTML = `<div class="incoming-attack-empty">No active incoming attacks or scouts.</div>`;
    return;
  }

  modalTitle.textContent = incoming.length === 1 ? "Incoming Threat" : "Incoming Threats";
  const summary = formatIncomingThreatSummary(incoming);
  modalBody.innerHTML = `
    <div class="incoming-attack-panel">
      <div class="incoming-attack-summary">
        <strong>${formatNumber(incoming.length)}</strong>
        <span>${summary} ${incoming.length === 1 ? "is" : "are"} heading toward your cities.</span>
        <small>Soonest arrival: ${formatDuration(incoming[0].remaining)}</small>
      </div>
      <div class="incoming-attack-list">
        ${incoming.map(renderIncomingAttackCard).join("")}
      </div>
    </div>
  `;

  modalBody.querySelectorAll("[data-incoming-city]").forEach(button => {
    button.addEventListener("click", () => focusIncomingAttackCity(button.dataset.incomingCity));
  });
}

function renderIncomingAttackCard(attack) {
  const city = attack.target;
  const sourceName = attack.source?.name || "Unknown city";
  const regionName = getRegionLabel(getCityRegionId(city));
  const defense = getCityStats(city).totalDefense;
  const isScout = attack.kind === "scout";
  const threatLabel = isScout ? "Scout" : "Attack";
  const forceLabel = isScout ? "Scout" : "Attacker";
  const forceDetails = isScout
    ? `1 scout from ${escapeHtml(sourceName)}`
    : `${formatNumber(attack.troops)} troops from ${escapeHtml(sourceName)}`;
  return `
    <article class="incoming-attack-card ${isScout ? "incoming-scout-card" : ""}">
      <div class="incoming-attack-badge">
        <strong>${formatDuration(attack.remaining)}</strong>
        <small>${threatLabel}</small>
      </div>
      <div class="incoming-attack-city">
        <span>${escapeHtml(regionName)}</span>
        <strong>${escapeHtml(city.name)}</strong>
        <small>Lv ${formatNumber(city.level)} - ${formatNumber(city.troops)} troops - ${formatNumber(defense)} defense</small>
      </div>
      <div class="incoming-attack-force">
        <span>${forceLabel}</span>
        <strong>${escapeHtml(attack.attackerName || "Enemy")}</strong>
        <small>${forceDetails}</small>
      </div>
      <button class="incoming-attack-locate" data-incoming-city="${escapeHtml(city.id)}" type="button" aria-label="Go to ${escapeHtml(city.name)}">&#8982;</button>
    </article>
  `;
}

async function focusIncomingAttackCity(cityId) {
  const city = getArmyTargetById(cityId);
  if (!city) {
    showToast("That city is no longer available.");
    return;
  }
  const regionId = getCityRegionId(city);
  if (modal.open) modal.close();
  if (regionId !== getActiveMapRegionId()) {
    await switchOnlineIsland(regionId);
  }
  requestAnimationFrame(() => {
    centerOnCity(city.id);
    showToast(`Viewing ${city.name}`);
  });
}

function showOutgoingAttacksModal() {
  const operations = getActiveOperationsSnapshot();
  const total = operations.marches.length + operations.camps.length + operations.strongholds.length;
  if (!total) {
    showToast("No active marches or controlled objectives right now.");
    updateOutgoingAttackUi();
    return;
  }
  if (!operations[activeOperationsTab]?.length) {
    activeOperationsTab = operations.marches.length
      ? "marches"
      : operations.camps.length
        ? "camps"
        : "strongholds";
  }
  modal.classList.remove("incoming-attack-modal");
  modal.classList.add("outgoing-attack-modal");
  renderOutgoingAttacksModalContent(operations);
  if (!modal.open) modal.showModal();
}

function renderOutgoingAttacksModalContent(operations = getActiveOperationsSnapshot()) {
  const normalizedOperations = operations?.marches
    ? operations
    : { marches: Array.isArray(operations) ? operations : [], camps: getHeldCampsForActiveOperations(), strongholds: getHeldStrongholdsForActiveOperations() };
  const { marches, camps, strongholds } = normalizedOperations;
  const tabs = [
    { id: "marches", label: "Marches", count: marches.length },
    { id: "camps", label: "Camps", count: camps.length },
    { id: "strongholds", label: "Strongholds", count: strongholds.length },
  ];
  if (!tabs.some(tab => tab.id === activeOperationsTab)) activeOperationsTab = "marches";
  const panel = activeOperationsTab === "camps"
    ? renderHeldCampsOperationPanel(camps)
    : activeOperationsTab === "strongholds"
      ? renderHeldStrongholdsOperationPanel(strongholds)
      : renderMarchesOperationPanel(marches);

  modalTitle.textContent = "Kingdom Activity";
  modalBody.innerHTML = `
    <div class="active-operations-panel">
      <div class="active-operations-tabs" role="tablist" aria-label="Kingdom activity categories">
        ${tabs.map(tab => `
          <button class="active-operations-tab ${activeOperationsTab === tab.id ? "active" : ""}" data-active-operations-tab="${tab.id}" type="button" role="tab" aria-selected="${activeOperationsTab === tab.id}">
            <span>${tab.label}</span><strong>${formatNumber(tab.count)}</strong>
          </button>`).join("")}
      </div>
      <div class="active-operations-content" role="tabpanel" aria-label="${escapeHtml(tabs.find(tab => tab.id === activeOperationsTab)?.label || "Marches")}">
        ${panel}
      </div>
    </div>
  `;

  modalBody.querySelectorAll("[data-active-operations-tab]").forEach(button => {
    button.addEventListener("click", () => {
      activeOperationsTab = button.dataset.activeOperationsTab || "marches";
      renderOutgoingAttacksModalContent();
    });
  });
  modalBody.querySelectorAll("[data-outgoing-city]").forEach(button => {
    button.addEventListener("click", () => focusOutgoingAttackCity(button.dataset.outgoingCity));
  });
  modalBody.querySelectorAll("[data-operation-location]").forEach(button => {
    button.addEventListener("click", () => focusActiveOperationLocation({
      id: button.dataset.operationLocation,
      regionId: button.dataset.operationRegion,
      type: button.dataset.operationType,
    }));
  });
  modalBody.querySelectorAll("[data-swift-march-order]").forEach(button => {
    button.addEventListener("click", () => useSwiftMarchOrderOnMission(button.dataset.swiftMarchOrder));
  });
  modalBody.querySelectorAll("[data-recall-horn]").forEach(button => {
    button.addEventListener("click", () => useRecallHornOnMission(button.dataset.recallHorn));
  });
}

function renderMarchesOperationPanel(marches) {
  if (!marches.length) return `<div class="incoming-attack-empty">No active troop marches.</div>`;
  const summary = formatOutgoingMissionSummary(marches);
  return `
    <div class="incoming-attack-panel">
      <div class="incoming-attack-summary">
        <strong>${formatNumber(marches.length)}</strong>
        <span>${summary} ${marches.length === 1 ? "is" : "are"} traveling now.</span>
        <small>${marches[0].serverPending ? "Sending order to server" : marches[0].isResolving ? "Resolving arrived order" : `Soonest arrival: ${formatDuration(marches[0].remaining)}`}</small>
      </div>
      <div class="incoming-attack-list">${marches.map(renderOutgoingAttackCard).join("")}</div>
    </div>`;
}

function formatHeldCampReward(camp) {
  const config = getRewardCampConfig(camp);
  if (!config) return "Camp reward";
  if (config.rewardType === "city") return "1 random neutral city";
  if (config.rewardType === "item") return "1 random usable item";
  return `${formatNumber(config.baseReward)} ${config.rewardLabel}`;
}

function renderHeldCampsOperationPanel(camps) {
  if (!camps.length) return `<div class="incoming-attack-empty">You are not holding a camp.</div>`;
  const soonest = camps.find(camp => camp.payoutAtMs > Date.now());
  return `
    <div class="incoming-attack-panel">
      <div class="incoming-attack-summary active-objective-summary">
        <strong>${formatNumber(camps.length)}</strong>
        <span>${camps.length === 1 ? "One camp is" : `${formatNumber(camps.length)} camps are`} under your control.</span>
        <small>${soonest ? `Next camp reward: ${formatDuration(Math.max(0, Math.ceil((soonest.payoutAtMs - Date.now()) / 1000)))}` : "Camp reward state is syncing."}</small>
      </div>
      <div class="incoming-attack-list">${camps.map(renderHeldCampOperationCard).join("")}</div>
    </div>`;
}

function renderHeldCampOperationCard(camp) {
  const remaining = camp.payoutAtMs > 0 ? Math.max(0, Math.ceil((camp.payoutAtMs - Date.now()) / 1000)) : 0;
  const timerLabel = camp.payoutAtMs > 0 ? (remaining > 0 ? formatDuration(remaining) : "Resolving") : "Syncing";
  return `
    <article class="incoming-attack-card outgoing-attack-card active-objective-card held-camp-operation-card">
      <div class="incoming-attack-badge active-objective-badge"><strong>${timerLabel}</strong><small>Camp</small></div>
      <div class="incoming-attack-city">
        <span>${escapeHtml(getRegionLabel(getCityRegionId(camp)))}</span>
        <strong>${escapeHtml(camp.name)}</strong>
        <small>Hold reward: ${escapeHtml(formatHeldCampReward(camp))}</small>
      </div>
      <div class="incoming-attack-force">
        <span>Garrison</span>
        <strong>${formatNumber(camp.currentGarrison || camp.troops || 0)} troops</strong>
        <small>${camp.state === "contested" ? "Control contested" : "Controlled by you"}</small>
      </div>
      ${renderActiveOperationLocationButton(camp, "camp")}
    </article>`;
}

function renderHeldStrongholdsOperationPanel(strongholds) {
  if (!strongholds.length) return `<div class="incoming-attack-empty">You do not control a stronghold.</div>`;
  return `
    <div class="incoming-attack-panel">
      <div class="incoming-attack-summary active-objective-summary">
        <strong>${formatNumber(strongholds.length)}</strong>
        <span>${strongholds.length === 1 ? "One stronghold is" : `${formatNumber(strongholds.length)} strongholds are`} under your control.</span>
        <small>Stronghold bonuses remain active while you hold them.</small>
      </div>
      <div class="incoming-attack-list">${strongholds.map(renderHeldStrongholdOperationCard).join("")}</div>
    </div>`;
}

function renderHeldStrongholdOperationCard(stronghold) {
  return `
    <article class="incoming-attack-card outgoing-attack-card active-objective-card held-stronghold-operation-card">
      <div class="incoming-attack-badge active-objective-badge"><strong>Held</strong><small>Stronghold</small></div>
      <div class="incoming-attack-city">
        <span>${escapeHtml(getRegionLabel(getCityRegionId(stronghold)))}</span>
        <strong>${escapeHtml(stronghold.name)}</strong>
        <small>${escapeHtml(getStrongholdBonusLabel(stronghold))}</small>
      </div>
      <div class="incoming-attack-force">
        <span>Garrison</span>
        <strong>${formatNumber(stronghold.troops || 0)} troops</strong>
        <small>Level ${formatNumber(stronghold.level || getStrongholdDefenseLevel(stronghold))} defense</small>
      </div>
      ${renderActiveOperationLocationButton(stronghold, "stronghold")}
    </article>`;
}

function renderActiveOperationLocationButton(target, type) {
  return `<button class="incoming-attack-locate" data-operation-location="${escapeHtml(target.id)}" data-operation-region="${escapeHtml(getCityRegionId(target))}" data-operation-type="${escapeHtml(type)}" type="button" aria-label="Go to ${escapeHtml(target.name)}">&#8982;</button>`;
}

async function focusActiveOperationLocation({ id = "", regionId = "", type = "" } = {}) {
  const targetRegionId = normalizeRegionId(regionId);
  const knownTarget = type === "camp" ? getCampTargetById(id) : getOwnedCitySnapshotById(id) || cityById(id);
  if (!knownTarget) {
    showToast(`That ${type === "camp" ? "camp" : "stronghold"} is no longer available.`);
    return;
  }
  if (modal.open) modal.close();
  if (targetRegionId !== getActiveMapRegionId()) {
    const switched = await switchOnlineIsland(targetRegionId);
    if (!switched) {
      showToast(`Could not open ${getRegionLabel(targetRegionId)}.`);
      return;
    }
  }
  requestAnimationFrame(() => {
    centerOnCity(id);
    showToast(`Viewing ${knownTarget.name}`);
  });
}

function isSwiftMarchOrderEligible(mission) {
  if (!mission || mission.kind !== "transfer" || mission.targetType === "camp") return false;
  if (mission.serverPending || mission.isResolving || mission.returning || mission.relinquishTransfer || mission.swiftMarchUsedAtMs) return false;
  if (Math.max(0, Number(mission.remaining) || 0) <= 1) return false;
  const source = mission.source || cityById(mission.fromId) || getOwnedCitySnapshotById(mission.fromId) || getPlayableBaseCityById(mission.fromId);
  const target = mission.target || getArmyTargetById(mission.toId) || getOwnedCitySnapshotById(mission.toId) || getPlayableBaseCityById(mission.toId);
  if (!source || !target || isRewardCampTarget(target)) return false;
  const currentUid = getCurrentOnlineUid();
  const targetIsOwned = target.owner === "player"
    || (currentUid && String(target.ownerUid || mission.targetOwnerUid || "") === currentUid);
  if (!targetIsOwned) return false;
  if (isStronghold(target)) return true;
  return !isStronghold(source);
}

function isRecallHornEligible(mission) {
  if (!mission || mission.owner !== "player" || mission.kind === "scout" || mission.returning || mission.campReturn) return false;
  if (mission.serverPending || mission.isResolving) return false;
  if (!getOnlineArmyResolutionId(mission)) return false;
  return Math.max(0, Number(mission.remaining) || 0) > 1;
}

async function useSwiftMarchOrderOnMission(armyId = "") {
  const normalizedArmyId = String(armyId || "").trim();
  if (!normalizedArmyId || swiftMarchOrderRequests.has(normalizedArmyId)) return;
  const mission = getOutgoingAttacks().find(entry => getOnlineArmyResolutionId(entry) === normalizedArmyId);
  if (!mission || !isSwiftMarchOrderEligible(mission)) {
    showToast("That troop transfer or Stronghold reinforcement is no longer eligible for a Swift March Order.");
    renderOutgoingAttacksModalContent();
    return;
  }
  const inventory = ensureShopItems();
  if (Math.max(0, Math.floor(Number(inventory[SWIFT_MARCH_ORDER_ITEM_ID]) || 0)) <= 0) {
    showToast("You do not have a Swift March Order.");
    renderOutgoingAttacksModalContent();
    return;
  }
  const api = getOnlineApi();
  if (!usesServerArmyAuthority() || !api?.useSwiftMarchOrder) {
    showToast("Swift March Orders require the online Crownlands server.");
    return;
  }

  swiftMarchOrderRequests.add(normalizedArmyId);
  renderOutgoingAttacksModalContent();
  try {
    const result = await api.useSwiftMarchOrder({ armyId: normalizedArmyId });
    if (result?.currentUser) applyServerProfilePatch(result.currentUser);
    const localMission = state?.attacks?.find(entry => getOnlineArmyResolutionId(entry) === normalizedArmyId);
    if (localMission && result?.movement) applyServerMovementToMission(localMission, result.movement);
    onlineArmiesByIsland.forEach(armies => armies.forEach(army => {
      if (getOnlineArmyResolutionId(army) === normalizedArmyId && result?.movement) {
        applyServerMovementToMission(army, result.movement);
      }
    }));
    rebuildOnlineArmies();
    const secondsSaved = Math.max(0, Math.floor(Number(result?.secondsSaved) || 0));
    addLog(`Swift March Order used on the transfer to ${mission.toName || mission.target?.name || "your city"}.`);
    showToast(secondsSaved > 0
      ? `Swift March Order used. Arrival shortened by ${formatDuration(secondsSaved)}.`
      : "Swift March Order used.");
    saveGame();
    renderArmies(true);
    updateOutgoingAttackUi();
  } catch (error) {
    console.warn("Swift March Order activation failed", error);
    showToast(error?.message || "Could not use Swift March Order.");
  } finally {
    swiftMarchOrderRequests.delete(normalizedArmyId);
    if (modal?.open && modal.classList.contains("outgoing-attack-modal")) {
      renderOutgoingAttacksModalContent();
    }
  }
}

async function useRecallHornOnMission(armyId = "") {
  const normalizedArmyId = String(armyId || "").trim();
  if (!normalizedArmyId || recallHornRequests.has(normalizedArmyId)) return;
  const mission = getOutgoingAttacks().find(entry => getOnlineArmyResolutionId(entry) === normalizedArmyId);
  if (!mission || !isRecallHornEligible(mission)) {
    showToast("That troop march is no longer eligible for a Recall Horn.");
    renderOutgoingAttacksModalContent();
    return;
  }
  const inventory = ensureShopItems();
  if (Math.max(0, Math.floor(Number(inventory[RECALL_HORN_ITEM_ID]) || 0)) <= 0) {
    showToast("You do not have a Recall Horn.");
    renderOutgoingAttacksModalContent();
    return;
  }
  const api = getOnlineApi();
  if (!usesServerArmyAuthority() || !api?.useRecallHorn) {
    showToast("Recall Horns require the online Crownlands server.");
    return;
  }

  recallHornRequests.add(normalizedArmyId);
  renderOutgoingAttacksModalContent();
  try {
    const result = await api.useRecallHorn({ armyId: normalizedArmyId });
    applyServerArmyResult(result);
    const localMission = state?.attacks?.find(entry => getOnlineArmyResolutionId(entry) === normalizedArmyId);
    if (localMission && result?.movement) applyServerMovementToMission(localMission, result.movement);
    onlineArmiesByIsland.forEach(armies => armies.forEach(army => {
      if (getOnlineArmyResolutionId(army) === normalizedArmyId && result?.movement) {
        applyServerMovementToMission(army, result.movement);
      }
    }));
    rebuildOnlineArmies();
    const sourceName = mission.fromName || mission.source?.name || "its origin city";
    addLog(`Recall Horn used. ${formatNumber(mission.troops)} troops are returning to ${sourceName}.`);
    showToast(`Army recalled. Returning to ${sourceName} in ${formatDuration(result?.returnSeconds || mission.remaining)}.`);
    saveGame();
    renderArmies(true);
    updateIncomingAttackUi();
    updateOutgoingAttackUi();
  } catch (error) {
    console.warn("Recall Horn activation failed", error);
    showToast(error?.message || "Could not use Recall Horn.");
  } finally {
    recallHornRequests.delete(normalizedArmyId);
    if (modal?.open && modal.classList.contains("outgoing-attack-modal")) {
      renderOutgoingAttacksModalContent();
    }
  }
}

function renderOutgoingAttackCard(mission) {
  const city = mission.target;
  const sourceCity = mission.source;
  const sourceName = mission.source?.name || mission.fromName || "Unknown city";
  const originalTargetName = city?.name || mission.toName || "Unknown target";
  const isReturning = Boolean(mission.returning);
  const targetName = isReturning ? sourceName : originalTargetName;
  const regionName = getRegionLabel(isReturning
    ? sourceCity ? getCityRegionId(sourceCity) : normalizeRegionId(mission.returnDestinationRegionId || mission.sourceRegionId)
    : city ? getCityRegionId(city) : mission.targetRegionId || getCityRegionId(mission.toId));
  const ownerName = city ? getBattleReportOwnerName(city, city.owner) : "Unknown owner";
  const isScout = mission.kind === "scout";
  const isTransfer = mission.kind === "transfer";
  const isCampReturn = isTransfer && Boolean(mission.campReturn);
  const isReinforcement = isTransfer && Boolean(city && (isStronghold(city) || isRewardCampTarget(city)));
  const missionLabel = isReturning ? "Returning" : isScout ? "Scout" : isCampReturn ? "Camp Recall" : isReinforcement ? "Reinforce" : isTransfer ? "Transfer" : "Attack";
  const forceDetails = isScout
    ? `1 scout from ${escapeHtml(sourceName)}`
    : `${formatNumber(mission.troops)} troops from ${escapeHtml(sourceName)}`;
  const targetDetails = isReturning
    ? `Recalled before reaching ${escapeHtml(originalTargetName)}`
    : isCampReturn
    ? `Withdrawing stationed troops to ${escapeHtml(targetName)}`
    : isTransfer
    ? `${isReinforcement ? "Reinforcing" : "Moving troops to"} ${escapeHtml(targetName)}`
    : city
    ? `${escapeHtml(ownerName)} - ${formatNumber(city.troops)} troops`
    : "Target details are loading";
  const locateCity = isReturning ? sourceCity : city;
  const locateButton = locateCity
    ? `<button class="incoming-attack-locate" data-outgoing-city="${escapeHtml(locateCity.id)}" type="button" aria-label="Go to ${escapeHtml(locateCity.name)}">&#8982;</button>`
    : `<button class="incoming-attack-locate" type="button" aria-label="Target unavailable" disabled>&#8982;</button>`;
  const onlineId = getOnlineArmyResolutionId(mission);
  const itemActionBusy = swiftMarchOrderRequests.has(onlineId) || recallHornRequests.has(onlineId);
  const swiftItemCount = Math.max(0, Math.floor(Number(ensureShopItems()[SWIFT_MARCH_ORDER_ITEM_ID]) || 0));
  const swiftOrderButton = isSwiftMarchOrderEligible(mission) && swiftItemCount > 0
    ? `<button class="swift-march-order-btn" data-swift-march-order="${escapeHtml(onlineId)}" type="button" ${itemActionBusy ? "disabled" : ""}>${swiftMarchOrderRequests.has(onlineId) ? "Applying Swift Order..." : "Use Swift March Order"}</button>`
    : mission.swiftMarchUsedAtMs && !isReturning
      ? `<div class="swift-march-order-used">Swift March Order applied</div>`
      : "";
  const recallHornCount = Math.max(0, Math.floor(Number(ensureShopItems()[RECALL_HORN_ITEM_ID]) || 0));
  const recallHornButton = isRecallHornEligible(mission) && recallHornCount > 0
    ? `<button class="recall-horn-btn" data-recall-horn="${escapeHtml(onlineId)}" type="button" ${itemActionBusy ? "disabled" : ""}>${recallHornRequests.has(onlineId) ? "Sounding Recall..." : "Use Recall Horn"}</button>`
    : isReturning
      ? `<div class="recall-horn-status">Returning to ${escapeHtml(sourceName)}</div>`
      : "";
  const itemActions = swiftOrderButton || recallHornButton
    ? `<div class="march-item-actions">${swiftOrderButton}${recallHornButton}</div>`
    : "";

  return `
    <article class="incoming-attack-card outgoing-attack-card ${isReturning ? "outgoing-return-card" : isScout ? "outgoing-scout-card" : isTransfer ? "outgoing-transfer-card" : ""}">
      <div class="incoming-attack-badge">
        <strong>${mission.serverPending ? "Sending" : mission.isResolving ? "Resolving" : formatDuration(mission.remaining)}</strong>
        <small>${missionLabel}</small>
      </div>
      <div class="incoming-attack-city">
        <span>${escapeHtml(regionName)}</span>
        <strong>${escapeHtml(targetName)}</strong>
        <small>${targetDetails}</small>
      </div>
      <div class="incoming-attack-force">
        <span>Origin</span>
        <strong>${escapeHtml(sourceName)}</strong>
        <small>${forceDetails}</small>
      </div>
      ${locateButton}
      ${itemActions}
    </article>
  `;
}

async function focusOutgoingAttackCity(cityId) {
  const city = getArmyTargetById(cityId);
  if (!city) {
    showToast("That target is no longer available.");
    return;
  }
  const regionId = getCityRegionId(city);
  if (modal.open) modal.close();
  if (regionId !== getActiveMapRegionId()) {
    await switchOnlineIsland(regionId);
  }
  requestAnimationFrame(() => {
    centerOnCity(city.id);
    showToast(`Viewing ${city.name}`);
  });
}

function normalizeLeaderboardEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const uid = String(raw.uid || raw.id || "").trim();
  if (!uid) return null;
  const mainCityId = String(raw.mainCityId || "");
  const mainRegionId = normalizeRegionId(
    raw.mainRegionId
    || getRegionIdFromOnlineIslandId(raw.mainIslandId)
    || (getKnownCityId(mainCityId) ? getCityRegionId(mainCityId) : "")
    || raw.islandId
  );
  return {
    uid,
    displayName: cleanName(raw.playerName || raw.displayName || "Ruler") || "Ruler",
    flag: raw.flag || null,
    kingPower: Math.max(0, Math.floor(Number(raw.kingPower) || 0)),
    kingPowerVersion: Math.max(0, Math.floor(Number(raw.kingPowerVersion) || 0)),
    cityCount: Math.max(0, Math.floor(Number(raw.cityCount ?? raw.totalCities) || 0)),
    totalTroops: Math.max(0, Math.floor(Number(raw.totalTroops) || 0)),
    totalMarchingTroops: Math.max(0, Math.floor(Number(raw.totalMarchingTroops) || 0)),
    goldPerHour: Math.max(0, Math.floor(Number(raw.goldPerHour) || 0)),
    troopPerHour: Math.max(0, Math.floor(Number(raw.troopPerHour) || 0)),
    mainCityId,
    mainRegionId,
    updatedAtMs: normalizeTimestampMs(raw.updatedAtMs) || timestampToMs(raw.updatedAt),
  };
}

function getCurrentLeaderboardEntry() {
  const uid = getCurrentOnlineUid();
  if (!uid || !state) return null;
  return normalizeLeaderboardEntry({
    uid,
    ...getKingPowerLeaderboardSnapshot(),
  });
}

function mergeLeaderboardEntries(rows = []) {
  const byUid = new Map();
  const currentEntry = getCurrentLeaderboardEntry();
  if (currentEntry) byUid.set(currentEntry.uid, currentEntry);

  (Array.isArray(rows) ? rows : []).forEach(row => {
    const entry = normalizeLeaderboardEntry(row);
    if (!entry) return;
    const existing = byUid.get(entry.uid);
    const entryIsAuthoritative = entry.kingPowerVersion >= KING_POWER_AUTHORITY_VERSION;
    const existingIsAuthoritative = existing?.kingPowerVersion >= KING_POWER_AUTHORITY_VERSION;
    const shouldReplace = !existing
      || (entryIsAuthoritative && !existingIsAuthoritative)
      || (entryIsAuthoritative === existingIsAuthoritative && entry.updatedAtMs >= existing.updatedAtMs)
      || (!entryIsAuthoritative && !existingIsAuthoritative && entry.kingPower > existing.kingPower);
    if (shouldReplace) {
      byUid.set(entry.uid, entry);
    }
  });

  return Array.from(byUid.values())
    .sort((a, b) => (b.kingPower - a.kingPower) || (b.updatedAtMs - a.updatedAtMs) || a.displayName.localeCompare(b.displayName))
    .slice(0, KING_POWER_LEADERBOARD_LIMIT);
}

function formatLeaderboardAge(updatedAtMs) {
  const ageSeconds = Math.max(0, (Date.now() - normalizeTimestampMs(updatedAtMs)) / 1000);
  if (!updatedAtMs || ageSeconds < 45) return "just now";
  return `${formatDuration(ageSeconds)} ago`;
}

function renderLeaderboardRow(entry, index, currentUid) {
  const isCurrent = entry.uid === currentUid;
  return `
    <article class="leaderboard-row ${isCurrent ? "current" : ""}">
      <span class="leaderboard-rank">#${formatNumber(index + 1)}</span>
      <span class="kingdom-flag kingdom-flag-small leaderboard-flag" data-leaderboard-flag="${index}" aria-hidden="true"><span class="flag-symbol"></span></span>
      <div class="leaderboard-ruler">
        <strong>${escapeHtml(entry.displayName)}</strong>
        <small>${escapeHtml(getRegionLabel(entry.mainRegionId))} - ${formatNumber(entry.cityCount)} ${entry.cityCount === 1 ? "city" : "cities"}${isCurrent ? " - You" : ""}</small>
      </div>
      <div class="leaderboard-power">
        <strong>${formatNumber(entry.kingPower)}</strong>
        <small>${escapeHtml(formatLeaderboardAge(entry.updatedAtMs))}</small>
      </div>
    </article>
  `;
}

function renderLeaderboardRows(rows) {
  const list = modalBody?.querySelector("#leaderboardRows");
  if (!list) return;
  const currentUid = getCurrentOnlineUid();
  const entries = mergeLeaderboardEntries(rows);
  list.innerHTML = entries.length
    ? entries.map((entry, index) => renderLeaderboardRow(entry, index, currentUid)).join("")
    : `<div class="leaderboard-empty">No King Power scores have been published yet.</div>`;
  entries.forEach((entry, index) => {
    applyFlagToElement(list.querySelector(`[data-leaderboard-flag="${index}"]`), entry.flag || createDefaultFlag());
  });
}

function setLeaderboardStatus(message) {
  const status = modalBody?.querySelector("#leaderboardStatus");
  if (status) status.textContent = message;
}

async function refreshLeaderboardRows({ forcePublish = false } = {}) {
  const api = getOnlineApi();
  const list = modalBody?.querySelector("#leaderboardRows");
  const refreshBtn = modalBody?.querySelector("#leaderboardRefreshBtn");
  if (!list || !api?.loadKingPowerLeaderboard || !api?.isSignedIn?.()) {
    if (list) list.innerHTML = `<div class="leaderboard-empty">Sign in online to view King Power ranks.</div>`;
    return;
  }
  if (refreshBtn) refreshBtn.disabled = true;
  list.innerHTML = `<div class="leaderboard-empty">Loading King Power ranks...</div>`;
  setLeaderboardStatus("Loading global ranks...");
  try {
    let rows = [];
    let usedFallback = false;
    let globalError = null;
    try {
      await publishOnlinePresence(true);
      rows = await api.loadKingPowerLeaderboard(KING_POWER_LEADERBOARD_LIMIT);
      if (!rows.length) globalError = new Error("No global King Power rows were found.");
    } catch (error) {
      globalError = error;
      console.warn("Could not load King Power leaderboard; trying online presence fallback", error);
    }

    if (!rows.length && api?.loadKingPowerPresenceLeaderboard) {
      try {
        usedFallback = true;
        setLeaderboardStatus("Showing live online ranks.");
        const islandIds = getRegionIds().map(getOnlineIslandId);
        rows = await api.loadKingPowerPresenceLeaderboard(islandIds, KING_POWER_LEADERBOARD_LIMIT);
      } catch (fallbackError) {
        console.warn("Could not load presence leaderboard fallback", fallbackError);
      }
    }

    if (!modal.open || !modal.classList.contains("leaderboard-modal")) return;

    renderLeaderboardRows(rows);
    if (usedFallback) {
      setLeaderboardStatus(globalError ? "Live online ranks shown. Deploy Firestore rules for saved global ranks." : "Live online ranks shown.");
    } else {
      setLeaderboardStatus("Global King Power ranks.");
    }
    if (!mergeLeaderboardEntries(rows).length) {
      list.innerHTML = `<div class="leaderboard-empty">Could not load King Power ranks right now.</div>`;
    }
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function showLeaderboardModal() {
  if (!state) return;
  modal.classList.remove("battle-report-modal");
  modal.classList.add("leaderboard-modal");
  modalTitle.textContent = "King Power Ranks";
  modalBody.innerHTML = `
    <div class="leaderboard-panel">
      <div class="leaderboard-toolbar">
        <div>
          <strong>Top ${formatNumber(KING_POWER_LEADERBOARD_LIMIT)}</strong>
        </div>
        <button id="leaderboardRefreshBtn" type="button">Refresh</button>
      </div>
      <div id="leaderboardRows" class="leaderboard-list">
        <div class="leaderboard-empty">Loading King Power ranks...</div>
      </div>
    </div>
  `;
  modalBody.querySelector("#leaderboardRefreshBtn")?.addEventListener("click", () => {
    refreshLeaderboardRows({ forcePublish: true });
  });
  if (!modal.open) modal.showModal();
  refreshLeaderboardRows({ forcePublish: true });
}

function showLogModal() {
  if (!state) return;
  state.battleReports = normalizeBattleReports(state.battleReports);
  modal.classList.add("battle-report-modal");
  modalTitle.textContent = "Battle Reports";
  const filters = [
    { key: "all", label: "All" },
    { key: "attack", label: "Attacks" },
    { key: "defense", label: "Defenses" },
    { key: "scout", label: "Scouts" },
  ];
  const filteredReports = state.battleReports
    .filter(report => battleReportFilter === "all" || report.type === battleReportFilter)
    .slice()
    .sort(compareBattleReportsNewestFirst);

  modalBody.innerHTML = `
    <div class="battle-report-panel">
      <div class="battle-report-toolbar">
        <span>Filter</span>
        <div class="battle-report-filters">
          ${filters.map(filter => `
            <button class="${battleReportFilter === filter.key ? "active" : ""}" data-report-filter="${filter.key}" type="button">${filter.label}</button>
          `).join("")}
        </div>
      </div>
      <div class="battle-report-list">
        ${filteredReports.length
          ? filteredReports.map(renderBattleReportCard).join("")
          : `<div class="battle-report-empty">No ${battleReportFilter === "all" ? "battle" : battleReportFilter} reports yet.</div>`}
      </div>
    </div>
  `;

  modalBody.querySelectorAll("[data-report-filter]").forEach(button => {
    button.addEventListener("click", () => {
      battleReportFilter = button.dataset.reportFilter || "all";
      showLogModal();
    });
  });
  modalBody.querySelectorAll("[data-report-detail]").forEach(button => {
    button.addEventListener("click", () => showBattleReportDetail(button.dataset.reportDetail));
  });
  bindBattleReportJumpButtons();
  if (!modal.open) modal.showModal();
}

function renderBattleReportCard(report) {
  const badge = getBattleReportBadge(report);
  const age = formatDuration(Math.max(0, state.gameSeconds - report.createdAt));
  const troopValue = report.type === "scout"
    ? report.troopCount
    : (report.sentTroops || report.troopCount || report.defendersLeft);
  const opponent = report.opponentName || report.ownerName || "Unknown";
  const troopLabel = report.type === "scout" ? "reported" : "sent";
  const locateButton = renderBattleReportLocateButton(report);
  return `
    <article class="battle-report-card ${badge.tone}">
      <div class="battle-report-result">
        <strong>${badge.label}</strong>
        <small>${age} ago</small>
      </div>
      <div class="battle-report-city">
        <span>Lv ${formatNumber(report.cityLevel)}</span>
        <strong>${escapeHtml(report.cityName)}</strong>
      </div>
      <div class="battle-report-troops">
        <span aria-hidden="true">${report.type === "scout" ? "&#128301;" : "&#9817;"}</span>
        <strong>${formatNumber(troopValue)}</strong>
        <small>${troopLabel}</small>
      </div>
      <div class="battle-report-opponent">
        <strong>${escapeHtml(opponent)}</strong>
        <small>${escapeHtml(report.summary || getBattleReportSummary(report))}</small>
      </div>
      <div class="battle-report-actions">
        ${locateButton}
        <button class="battle-report-detail-btn" data-report-detail="${escapeHtml(report.id)}" type="button" aria-label="Open report details">&#128203;</button>
      </div>
    </article>
  `;
}

function renderBattleReportLocateButton(report, extraClass = "") {
  const cityId = getResolvableReportCityId(report?.cityId);
  if (!cityId) {
    return `<button class="battle-report-locate-btn ${extraClass}" type="button" aria-label="Target unavailable" disabled>&#8982;</button>`;
  }
  const loadedCity = getArmyTargetById(cityId);
  const regionId = report.regionId || getCityRegionId(loadedCity || cityId);
  const label = report.cityName || "target city";
  return `<button class="battle-report-locate-btn ${extraClass}" data-report-jump="${escapeHtml(cityId)}" data-report-region="${escapeHtml(regionId)}" type="button" aria-label="Go to ${escapeHtml(label)}">&#8982;</button>`;
}

function getResolvableReportCityId(cityId) {
  const value = String(cityId || "");
  if (!value) return "";
  return getKnownCityId(value) || (getArmyTargetById(value) ? value : "");
}

async function focusBattleReportTarget(cityId, regionId = "") {
  const targetCityId = getResolvableReportCityId(cityId);
  if (!targetCityId) {
    showToast("That target city is no longer available.");
    return;
  }
  const loadedCity = getArmyTargetById(targetCityId);
  const targetRegionId = normalizeRegionId(regionId || getCityRegionId(loadedCity || targetCityId));
  if (modal.open) modal.close();
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = false;
  selectedTargetId = null;
  if (targetRegionId !== getActiveMapRegionId()) {
    const switched = await switchOnlineIsland(targetRegionId);
    if (!switched || targetRegionId !== getActiveMapRegionId()) return;
  }
  if (getCampTargetById(targetCityId)) selectRewardCamp(targetCityId);
  else selectCity(targetCityId);
  const target = getArmyTargetById(targetCityId);
  showToast(target ? `Viewing ${target.name}` : "Viewing report target");
}

function bindBattleReportJumpButtons() {
  modalBody.querySelectorAll("[data-report-jump]").forEach(button => {
    button.addEventListener("click", () => {
      focusBattleReportTarget(button.dataset.reportJump, button.dataset.reportRegion || "");
    });
  });
}

function showBattleReportDetail(reportId) {
  const report = normalizeBattleReports(state?.battleReports || []).find(item => item.id === reportId);
  if (!report) {
    showToast("That report is no longer available.");
    showLogModal();
    return;
  }
  const badge = getBattleReportBadge(report);
  modal.classList.add("battle-report-modal");
  modalTitle.textContent = "Report Details";
  modalBody.innerHTML = `
    <div class="battle-report-detail ${badge.tone}">
      <button id="battleReportBackBtn" class="battle-report-back" type="button">Back to reports</button>
      <div class="battle-report-detail-head">
        <span>${badge.label}</span>
        <strong>${escapeHtml(report.cityName)}</strong>
        <small>Level ${formatNumber(report.cityLevel)} - ${formatDuration(Math.max(0, state.gameSeconds - report.createdAt))} ago</small>
        ${renderBattleReportLocateButton(report, "battle-report-locate-detail")}
      </div>
      <div class="battle-report-detail-grid">
        <div><span>Type</span><strong>${escapeHtml(getBattleReportTypeLabel(report.type))}</strong></div>
        <div><span>Opponent</span><strong>${escapeHtml(report.opponentName || report.ownerName || "Unknown")}</strong></div>
        <div><span>${report.type === "scout" ? "Scouted troops" : "Troops sent"}</span><strong>${formatNumber(report.type === "scout" ? report.troopCount : report.sentTroops)}</strong></div>
        <div><span>Total defense</span><strong>${formatBaseAndBonusStat(report.baseTotalDefense, report.totalDefense)}</strong></div>
        <div><span>Survivors</span><strong>${formatNumber(report.survivors)}</strong></div>
        <div><span>Defenders left</span><strong>${formatNumber(report.defendersLeft)}</strong></div>
        <div><span>Attackers lost</span><strong>${formatNumber(report.attackerLosses)}</strong></div>
        <div><span>Defenders lost</span><strong>${formatNumber(report.defenderLosses)}</strong></div>
        ${report.xpAwarded > 0 ? `<div><span>XP earned</span><strong>+${formatNumber(report.xpAwarded)}</strong></div>` : ""}
        ${report.goldAwarded > 0 ? `<div><span>Gold earned</span><strong>+${formatNumber(report.goldAwarded)}</strong></div>` : ""}
        ${report.troopsAwarded > 0 ? `<div><span>Level-up troops</span><strong>+${formatNumber(report.troopsAwarded)}</strong></div>` : ""}
      </div>
      <p>${escapeHtml(report.summary || getBattleReportSummary(report))}</p>
    </div>
  `;
  modalBody.querySelector("#battleReportBackBtn")?.addEventListener("click", showLogModal);
  bindBattleReportJumpButtons();
  if (!modal.open) modal.showModal();
}

function getBattleReportBadge(report) {
  if (report.type === "scout") return { label: "SCOUT", tone: "scout" };
  if (report.outcome === "victory") return { label: "VICTORY", tone: "victory" };
  if (report.outcome === "held") return { label: "VICTORY", tone: "victory" };
  return { label: "DEFEAT", tone: "defeat" };
}

function getBattleReportTypeLabel(type) {
  if (type === "attack") return "Attack report";
  if (type === "defense") return "Defense report";
  if (type === "scout") return "Scout report";
  return "Battle report";
}

function getBattleReportSummary(report) {
  if (report.type === "scout") return `${formatNumber(report.troopCount)} troops reported.`;
  if (report.outcome === "victory") return `Captured with ${formatNumber(report.survivors)} survivors.`;
  if (report.outcome === "held") return `${formatNumber(report.defendersLeft)} defenders held the city.`;
  if (report.outcome === "lost") return "The city was captured.";
  return `${formatNumber(report.defendersLeft)} defenders remained.`;
}

function showHelpModal() {
  modalTitle.textContent = "How this prototype works";
  modalBody.innerHTML = `
    <p>This is real-time, not turn-based. Gold, troop growth, player actions, and army travel keep running while the game is active.</p>
    <ul>
      <li>Drag empty land to move around the current island map.</li>
      <li>Use the mouse wheel on PC or pinch on phone to zoom in and out.</li>
      <li>Tap empty land to deselect your current city.</li>
      <li>Tap a blue city to select your source.</li>
      <li>Use the left button to level that exact city one level at a time.</li>
      <li>Use the center ! button to inspect that city's full stat panel.</li>
      <li>Use Send Troops, choose 25%, 50%, 80%, or 100%, then tap one destination city to launch immediately.</li>
      <li>Blue destinations receive transfers. Neutral and player-owned destinations receive attacks.</li>
      <li>There are no fixed roads. Active army routes appear only after troops are sent.</li>
      <li>Armies calculate the shortest land route around lakes, mountains, cities, and strongholds, then resolve when they arrive.</li>
      <li>Normal cities have no level cap. Upgrade cost rises 20% per level, with an extra doubling for each ten-level band above Level 100.</li>
      <li>The world has ${formatNumber(getRegionIds().length)} maps and ${formatNumber(ISLAND_CITY_COUNT)} total city slots.</li>
      <li>The center island keeps its middle clear for a future feature.</li>
      <li>New online players claim starting cities on starter maps with at least ${formatNumber(MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES)} neutral cities, then midgame maps, then endgame maps.</li>
      <li>Your main city starts with 200 troops. Gray cities start with 10 defending troops.</li>
      <li>Use Recruit, Level Up, and Skills to grow faster. Leveling increases walls, defense %, troop production, and gold production.</li>
      <li>Every signed-in player claims one starting city, then expands through neutral captures and player combat.</li>
    </ul>
  `;
  modalBody.innerHTML = `
    <p>Crownlands is real-time conquest: cities produce troops and gold while armies travel across terrain-aware routes.</p>
    <ul>
      <li>You start with one main city, 200 troops, and 100 gold.</li>
      <li>Neutral expansion has two limits: 30 neutral captures per local day, and neutral captures stop once you own 30 cities.</li>
      <li>After that, expand by attacking player-owned cities.</li>
      <li>Send Troops is single-click after setup: pick a march percent, then tap one destination to launch.</li>
      <li>Scout Nearby costs ${formatNumber(SCOUT_NEARBY_COST)} gold and covers the current map only.</li>
      <li>Regroup costs ${formatNumber(REGROUP_COST)} gold, previews a larger red radius, then sends all troops from nearby owned cities into the selected city.</li>
      <li>The top-right fullscreen button expands the game surface and the game disables page text selection while playing.</li>
      <li>City level creates victory points for combat value, while passive gold follows the Million Lords city production curve.</li>
      <li>City defense adds ${formatNumber(CITY_LEVEL_STATS.defensePercentPerLevel)}% soldier defense per city level, plus separate wall strength. Stoneworks increases the wall part of defense.</li>
      <li>Troop production is VP x 3, improved by Royal Granaries. Passive gold uses ML city production VP x ${formatNumber(MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP)}, improved by Tax Stewardship and stronghold bonuses.</li>
      <li>Army travel uses route distance plus troop-size bands. Larger armies march slower, scouts move as one troop, and March Orders reduces travel time.</li>
      <li>Glowing pickups appear near your owned cities on the current island during active play every three minutes, alternating between ten minutes of gold and troop production. Daily pickup limits are ${formatNumber(HARVEST_BONUS_DAILY_GOLD_LIMIT)} gold and ${formatNumber(HARVEST_BONUS_DAILY_TROOP_LIMIT)} troop pickups.</li>
      <li>Swordmastery boosts outgoing attack, Guild Charters reduces city upgrade cost, and Field Medics returns part of battle losses to your main city.</li>
      <li>Captured cities enter a one-hour XP cooldown. Attacking during cooldown still works, but capture XP is reduced.</li>
      <li>Main cities cannot be attacked. Use your main city as a protected home base while expanding from other cities.</li>
      <li>Demo Attacks protect weaker kingdoms: much stronger attackers send fewer effective troops, march slower, earn 0 XP, and defenders earn bonus XP.</li>
      <li>Shop items have UTC daily purchase limits. Reward Camp items are earned separately through contested objectives.</li>
    </ul>
  `;
  modal.showModal();
}

async function toggleFullscreen() {
  const fullscreenTarget = document.documentElement;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (fullscreenTarget.requestFullscreen) {
      await fullscreenTarget.requestFullscreen({ navigationUI: "hide" });
    } else {
      showToast("Fullscreen is not available in this browser.");
    }
  } catch (_) {
    showToast("Fullscreen is not available in this browser.");
  }
  updateFullscreenButton();
}

function updateFullscreenButton() {
  if (!fullscreenButtons.length) return;
  const isActive = Boolean(document.fullscreenElement);
  fullscreenButtons.forEach(button => {
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-label", isActive ? "Exit fullscreen" : "Enter fullscreen");
    button.innerHTML = isActive
      ? "<span class=\"fullscreen-glyph\" aria-hidden=\"true\">&times;</span>"
      : "<span class=\"fullscreen-glyph\" aria-hidden=\"true\">&#x26F6;</span>";
  });
}

function button(label, onClick, disabled = false, extraClass = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  if (extraClass) btn.classList.add(extraClass);
  btn.disabled = disabled;
  btn.addEventListener("click", onClick);
  return btn;
}

function addLog(message) {
  const stamped = `${formatClock(state.gameSeconds)} \u00B7 ${message}`;
  state.log.push(stamped);
  if (state.log.length > 80) state.log = state.log.slice(-80);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2100);
}

function formatNumber(value) {
  const n = Math.floor(Number(value) || 0);
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(n >= 10_000_000_000_000 ? 0 : 1)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.floor(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatBaseAndBonusStat(baseValue, totalValue, suffix = "") {
  const base = Math.max(0, Math.floor(Number(baseValue) || 0));
  const total = Math.max(base, Math.floor(Number(totalValue) || 0));
  const bonus = Math.max(0, total - base);
  return `${formatNumber(base)}${suffix} (+${formatNumber(bonus)}${suffix})`;
}

function getCityStatBonusSources(stats = {}, statType = "") {
  const sources = [];
  if (statType === "walls" || statType === "defense") {
    if (stats.stoneworksPercent > 0) sources.push(`Stoneworks +${formatNumber(stats.stoneworksPercent)}%`);
  }
  if (statType === "defense" && stats.strongholdDefenseBonusPercent > 0) {
    sources.push(`Stronghold +${formatNumber(stats.strongholdDefenseBonusPercent)}%`);
  }
  if (statType === "troops") {
    if (stats.royalGranariesPercent > 0) sources.push(`Royal Granaries +${formatNumber(stats.royalGranariesPercent)}%`);
    if (stats.strongholdTroopBonusPercent > 0) sources.push(`Stronghold +${formatNumber(stats.strongholdTroopBonusPercent)}%`);
    if (stats.warDrumsTroopBonusPercent > 0) sources.push(`War Drums +${formatNumber(stats.warDrumsTroopBonusPercent)}%`);
  }
  if (statType === "gold") {
    if (stats.taxStewardshipPercent > 0) sources.push(`Tax Stewardship +${formatNumber(stats.taxStewardshipPercent)}%`);
    if (stats.strongholdGoldBonusPercent > 0) sources.push(`Stronghold +${formatNumber(stats.strongholdGoldBonusPercent)}%`);
    if (stats.royalTaxDecreeGoldBonusPercent > 0) sources.push(`Royal Tax Decree +${formatNumber(stats.royalTaxDecreeGoldBonusPercent)}%`);
  }
  return sources.length ? `Bonus sources: ${sources.join(" | ")}` : "No active stat bonuses";
}

function formatDuration(seconds) {
  const raw = Math.max(0, Number(seconds) || 0);
  const total = Math.ceil(raw);
  if (raw >= 3600) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  }
  if (raw >= 60) {
    const underHourTotal = Math.min(total, 3599);
    const minutes = Math.floor(underHourTotal / 60);
    const secondsRemainder = underHourTotal % 60;
    return `${minutes}m ${secondsRemainder}s`;
  }
  return `${total}s`;
}

function formatClock(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function shortName(name) {
  return name.replace("First ", "").replace("hold", "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPercent(percent) {
  return `${Math.round(normalizeMarchPercent(percent) * 100)}%`;
}

function updateZoomPerformanceClasses() {
  if (!mapFrame) return;
  const shouldEnable = shouldUseLowZoomPerformance(lowZoomPerformanceEnabled, zoom);
  if (shouldEnable === lowZoomPerformanceEnabled) return;
  lowZoomPerformanceEnabled = shouldEnable;
  mapFrame.classList.toggle("low-zoom", shouldEnable);
}

function shouldUseLowZoomPerformance(currentlyEnabled, zoomLevel) {
  const threshold = currentlyEnabled
    ? LOW_ZOOM_PERFORMANCE_EXIT_THRESHOLD
    : LOW_ZOOM_PERFORMANCE_THRESHOLD;
  return Math.max(0, Number(zoomLevel) || 0) <= threshold;
}

function getZoomBoundsForViewport(frameRect = null, dimensions = null) {
  const rect = frameRect || mapFrame?.getBoundingClientRect();
  const mapDimensions = dimensions || getActiveMapDimensions();
  if (!rect || !mapDimensions?.width || !mapDimensions?.height) {
    return { min: MIN_ZOOM, max: MAX_ZOOM };
  }
  const coverZoom = Math.max(rect.width / mapDimensions.width, rect.height / mapDimensions.height);
  const min = Math.max(MIN_ZOOM, coverZoom);
  return {
    min,
    max: Math.max(MAX_ZOOM, min),
  };
}

function clampZoomForViewport(nextZoom, frameRect = null, dimensions = null) {
  const bounds = getZoomBoundsForViewport(frameRect, dimensions);
  return clamp(nextZoom, bounds.min, bounds.max);
}

function getMapViewportOffset(frameRect = null, dimensions = null) {
  const rect = frameRect || mapFrame?.getBoundingClientRect();
  const mapDimensions = dimensions || getActiveMapDimensions();
  if (!rect || !mapDimensions) return { x: 0, y: 0 };
  return {
    x: Math.max(0, (rect.width - mapDimensions.width * zoom) / 2),
    y: Math.max(0, (rect.height - mapDimensions.height * zoom) / 2),
  };
}

function isZoomInteractionActive() {
  return isCameraInteractionActive();
}

function hasActiveCameraGesture() {
  return Boolean(panState || pinchState || activePointers.size >= 2 || mapFrame?.classList.contains("dragging"));
}

function isCameraInteractionActive() {
  return Boolean(
    mapFrame?.classList.contains("camera-moving")
    || mapFrame?.classList.contains("zooming")
    || mapFrame?.classList.contains("dragging")
    || performance.now() < interactionRenderLockUntil
  );
}

function queueDeferredMapRender() {
  deferredMapRenderPending = true;
}

function flushDeferredMapRender() {
  if (!state || isCameraInteractionActive()) return;
  const shouldRender = deferredMapRenderPending;
  deferredMapRenderPending = false;
  lastRenderTime = performance.now();
  updateMainCityReturnButton();
  if (!shouldRender) return;
  pathRenderSignature = "";
  cityRenderSignature = "";
  renderHarvestBonuses();
  renderIslandTeleporters();
  renderPaths();
  renderCities(true);
  renderPanel();
  renderArmies(true);
}

function finishCameraInteraction() {
  if (!mapFrame) return;
  if (hasActiveCameraGesture()) {
    if (cameraInteractionSettleTimer) window.clearTimeout(cameraInteractionSettleTimer);
    cameraInteractionSettleTimer = window.setTimeout(finishCameraInteraction, PAN_RENDER_SETTLE_MS);
    return;
  }
  cameraInteractionSettleTimer = null;
  mapFrame.classList.remove("camera-moving", "zooming");
  interactionRenderLockUntil = 0;
  flushDeferredMapRender();
}

function markCameraInteraction({ zooming = false, settleMs = PAN_RENDER_SETTLE_MS } = {}) {
  if (!mapFrame) return;
  interactionRenderLockUntil = performance.now() + settleMs;
  mapFrame.classList.add("camera-moving");
  if (zooming) mapFrame.classList.add("zooming");
  if (cameraInteractionSettleTimer) window.clearTimeout(cameraInteractionSettleTimer);
  cameraInteractionSettleTimer = window.setTimeout(finishCameraInteraction, settleMs);
}

function markZoomInteraction() {
  markCameraInteraction({ zooming: true, settleMs: ZOOM_RENDER_SETTLE_MS });
}

function updateMainCityReturnButtonForCamera(rect = null) {
  if (isCameraInteractionActive()) {
    const now = performance.now();
    if (now - lastMainCityReturnCameraUpdateAt < MAIN_CITY_RETURN_CAMERA_THROTTLE_MS) return;
    lastMainCityReturnCameraUpdateAt = now;
  }
  updateMainCityReturnButton(rect);
}

function applyCameraTransform() {
  if (!mapWorld || !mapFrame) return;
  const rect = mapFrame.getBoundingClientRect();
  mapViewportWidth = rect.width;
  mapViewportHeight = rect.height;
  const dimensions = getActiveMapDimensions();
  zoom = clampZoomForViewport(zoom, rect, dimensions);
  updateZoomPerformanceClasses();
  const maxX = Math.max(0, dimensions.width - rect.width / zoom);
  const maxY = Math.max(0, dimensions.height - rect.height / zoom);
  camera.x = clamp(camera.x, 0, maxX);
  camera.y = clamp(camera.y, 0, maxY);
  const offset = getMapViewportOffset(rect, dimensions);
  mapWorld.style.transform = `translate3d(${offset.x - camera.x * zoom}px, ${offset.y - camera.y * zoom}px, 0) scale(${zoom})`;
  updateMainCityReturnButtonForCamera(rect);
}

function updateCameraTransform() {
  if (cameraTransformRaf) {
    cancelAnimationFrame(cameraTransformRaf);
    cameraTransformRaf = 0;
  }
  applyCameraTransform();
}

function scheduleCameraTransform() {
  if (cameraTransformRaf) return;
  cameraTransformRaf = requestAnimationFrame(() => {
    cameraTransformRaf = 0;
    applyCameraTransform();
  });
}

function centerOnMap() {
  if (!mapFrame) return;
  const rect = mapFrame.getBoundingClientRect();
  const dimensions = getActiveMapDimensions();
  zoom = clampZoomForViewport(zoom, rect, dimensions);
  const offset = getMapViewportOffset(rect, dimensions);
  camera.x = dimensions.width / 2 - (rect.width / 2 - offset.x) / zoom;
  camera.y = dimensions.height / 2 - (rect.height / 2 - offset.y) / zoom;
  updateCameraTransform();
}

function centerOnCity(cityId) {
  const city = getArmyTargetById(cityId);
  if (!city || !mapFrame) return;
  if (isRewardCampTarget(city) ? !isCampInActiveMap(city) : !isCityInActiveMap(city)) {
    centerOnMap();
    return;
  }
  const rect = mapFrame.getBoundingClientRect();
  const mapPoint = worldToMapPoint(city);
  const dimensions = getActiveMapDimensions();
  zoom = clampZoomForViewport(zoom, rect, dimensions);
  const offset = getMapViewportOffset(rect, dimensions);
  camera.x = mapPoint.x - (rect.width / 2 - offset.x) / zoom;
  camera.y = mapPoint.y - (rect.height / 2 - offset.y) / zoom;
  updateCameraTransform();
}

function getElementAvoidRect(element, viewRect, padding = 12) {
  if (!element || !viewRect) return null;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return null;
  return {
    left: rect.left - viewRect.left - padding,
    top: rect.top - viewRect.top - padding,
    right: rect.right - viewRect.left + padding,
    bottom: rect.bottom - viewRect.top + padding,
  };
}

function getMainCityReturnAvoidRects(viewRect) {
  return [
    document.querySelector(".profile-stack"),
    document.querySelector(".resource-bar"),
    inventoryBtn,
    shopBtn,
    cityListBtn,
    islandSwitchBtn,
    document.querySelector(".commander-panel.visible"),
    document.querySelector(".bottom-nav"),
    document.querySelector(".toast.visible"),
  ].map(element => getElementAvoidRect(element, viewRect)).filter(Boolean);
}

function getMainCityReturnButtonSize() {
  const rect = mainCityReturnBtn?.getBoundingClientRect();
  return {
    width: Math.max(36, Math.ceil(rect?.width || 42)),
    height: Math.max(36, Math.ceil(rect?.height || 42)),
  };
}

function setMainCityReturnHudMode(enabled) {
  if (!mainCityReturnBtn) return;
  const resourceBar = document.querySelector(".resource-bar");
  mainCityReturnBtn.classList.toggle("hud-home-return", Boolean(enabled));
  if (enabled) {
    if (resourceBar && mainCityReturnBtn.parentElement !== resourceBar) {
      const anchor = cityListBtn?.parentElement === resourceBar ? cityListBtn : resourceBar.firstChild;
      resourceBar.insertBefore(mainCityReturnBtn, anchor);
    }
    return;
  }
  if (gameView && mainCityReturnBtn.parentElement !== gameView) {
    gameView.insertBefore(mainCityReturnBtn, mapFrame);
  }
}

function getMainCityReturnRectAt(x, y, size, padding = 4) {
  return {
    left: x - size.width / 2 - padding,
    top: y - size.height / 2 - padding,
    right: x + size.width / 2 + padding,
    bottom: y + size.height / 2 + padding,
  };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isMainCityReturnPointClear(x, y, size, avoidRects) {
  const buttonRect = getMainCityReturnRectAt(x, y, size);
  return !avoidRects.some(rect => rectsOverlap(buttonRect, rect));
}

function findClearMainCityReturnPoint(preferred, bounds, size, avoidRects) {
  const start = {
    x: clamp(preferred.x, bounds.left, bounds.right),
    y: clamp(preferred.y, bounds.top, bounds.bottom),
  };
  if (isMainCityReturnPointClear(start.x, start.y, size, avoidRects)) return start;

  const candidates = [start];
  const step = 14;
  const addCandidate = (x, y) => {
    candidates.push({
      x: clamp(x, bounds.left, bounds.right),
      y: clamp(y, bounds.top, bounds.bottom),
    });
  };

  addCandidate(start.x, bounds.top);
  addCandidate(start.x, bounds.bottom);
  addCandidate(bounds.left, start.y);
  addCandidate(bounds.right, start.y);

  for (let x = bounds.left; x <= bounds.right; x += step) {
    addCandidate(x, bounds.top);
    addCandidate(x, bounds.bottom);
  }
  addCandidate(bounds.right, bounds.top);
  addCandidate(bounds.right, bounds.bottom);

  for (let y = bounds.top + step; y < bounds.bottom; y += step) {
    addCandidate(bounds.left, y);
    addCandidate(bounds.right, y);
  }

  candidates.sort((a, b) => {
    const da = Math.hypot(a.x - start.x, a.y - start.y);
    const db = Math.hypot(b.x - start.x, b.y - start.y);
    return da - db;
  });

  return candidates.find(candidate => isMainCityReturnPointClear(candidate.x, candidate.y, size, avoidRects)) || start;
}

function updateMainCityReturnButton(frameRect = null) {
  if (!mainCityReturnBtn || !gameView || !state || setupScreen?.classList.contains("visible")) {
    setMainCityReturnHudMode(false);
    if (mainCityReturnBtn) mainCityReturnBtn.hidden = true;
    return;
  }

  const mainCity = getMainCityReference();
  const rect = frameRect || mapFrame?.getBoundingClientRect();
  if (!mainCity || !rect) {
    setMainCityReturnHudMode(false);
    mainCityReturnBtn.hidden = true;
    return;
  }

  const homeRegionId = getMainCityRegionId();
  const isHomeIslandActive = homeRegionId === getActiveMapRegionId();
  if (!isHomeIslandActive) {
    setMainCityReturnHudMode(true);
    mainCityReturnBtn.hidden = false;
    mainCityReturnBtn.title = `Return to ${getRegionLabel(homeRegionId)}`;
    mainCityReturnBtn.style.removeProperty("left");
    mainCityReturnBtn.style.removeProperty("top");
    mainCityReturnBtn.style.removeProperty("--main-city-angle");
    return;
  }

  setMainCityReturnHudMode(false);
  mainCityReturnBtn.title = "Return to main city";
  const mainCityMapPoint = worldToMapPoint(mainCity);
  const offset = getMapViewportOffset(rect);
  const targetFrameX = offset.x + (mainCityMapPoint.x - camera.x) * zoom;
  const targetFrameY = offset.y + (mainCityMapPoint.y - camera.y) * zoom;
  const visibleMargin = 56;
  const isVisible = isHomeIslandActive
    && targetFrameX >= visibleMargin
    && targetFrameX <= rect.width - visibleMargin
    && targetFrameY >= visibleMargin
    && targetFrameY <= rect.height - visibleMargin;
  if (isVisible) {
    mainCityReturnBtn.hidden = true;
    return;
  }

  const viewRect = gameView.getBoundingClientRect();
  const frameLeft = rect.left - viewRect.left;
  const frameTop = rect.top - viewRect.top;
  const centerX = frameLeft + rect.width / 2;
  const centerY = frameTop + rect.height / 2;
  const targetX = frameLeft + targetFrameX;
  const targetY = frameTop + targetFrameY;
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) {
    mainCityReturnBtn.hidden = true;
    return;
  }

  const edgePadding = 32;
  const topPadding = 72;
  const left = frameLeft + edgePadding;
  const right = frameLeft + rect.width - edgePadding;
  const top = frameTop + topPadding;
  const bottom = frameTop + rect.height - edgePadding;
  const bounds = { left, right, top, bottom };
  const halfW = Math.max(1, (right - left) / 2);
  const halfH = Math.max(1, (bottom - top) / 2);
  const boxCenterX = (left + right) / 2;
  const boxCenterY = (top + bottom) / 2;
  const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  const preferred = {
    x: clamp(boxCenterX + dx * scale, left, right),
    y: clamp(boxCenterY + dy * scale, top, bottom),
  };
  const buttonSize = getMainCityReturnButtonSize();
  const avoidRects = getMainCityReturnAvoidRects(viewRect);
  const { x, y } = findClearMainCityReturnPoint(preferred, bounds, buttonSize, avoidRects);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  mainCityReturnBtn.hidden = false;
  mainCityReturnBtn.style.left = `${x}px`;
  mainCityReturnBtn.style.top = `${y}px`;
  mainCityReturnBtn.style.setProperty("--main-city-angle", `${angle}deg`);
}

async function returnToMainCity() {
  if (!state) return;
  const targetRegionId = getMainCityRegionId();
  if (targetRegionId !== getActiveMapRegionId()) {
    await switchOnlineIsland(targetRegionId);
    if (targetRegionId !== getActiveMapRegionId()) return;
  }
  const mainCity = getLoadedMainCity() || getMainCityReference();
  if (!mainCity) {
    showToast("No main city to return to.");
    return;
  }
  scoutNearbySourceId = null;
  regroupSourceId = null;
  sendMode = false;
  selectedSourceId = mainCity.owner === "player" ? mainCity.id : null;
  rememberOwnedAttackSource(mainCity);
  selectedTargetId = null;
  centerOnCity(mainCity.id);
  renderAll();
  showToast(`Returned to ${mainCity.name}`);
}

function screenToMap(clientX, clientY) {
  const rect = mapFrame.getBoundingClientRect();
  const offset = getMapViewportOffset(rect);
  return {
    x: camera.x + (clientX - rect.left - offset.x) / zoom,
    y: camera.y + (clientY - rect.top - offset.y) / zoom,
  };
}

function screenToWorld(clientX, clientY) {
  return mapToWorldPoint(screenToMap(clientX, clientY));
}

function setZoomAroundPoint(nextZoom, clientX, clientY) {
  const rect = mapFrame.getBoundingClientRect();
  const before = screenToMap(clientX, clientY);
  zoom = clampZoomForViewport(nextZoom, rect);
  const offset = getMapViewportOffset(rect);
  camera.x = before.x - (clientX - rect.left - offset.x) / zoom;
  camera.y = before.y - (clientY - rect.top - offset.y) / zoom;
  scheduleCameraTransform();
  markZoomInteraction();
}

function handleWheelZoom(event) {
  if (!state) return;
  event.preventDefault();
  if (isMapInteractionBlocked()) return;
  const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
  setZoomAroundPoint(zoom * factor, event.clientX, event.clientY);
}

function getPointerPair() {
  const points = [...activePointers.values()];
  if (points.length < 2) return null;
  return [points[0], points[1]];
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointBetween(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function beginPinch() {
  if (isMapInteractionBlocked()) return;
  const pair = getPointerPair();
  if (!pair) return;
  const [a, b] = pair;
  const mid = midpointBetween(a, b);
  cityTapState = null;
  campTapState = null;
  armyTapState = null;
  pinchState = {
    startDistance: Math.max(1, distanceBetween(a, b)),
    startZoom: zoom,
    mapPoint: screenToMap(mid.x, mid.y),
  };
  panState = null;
  suppressMapClick = true;
  mapFrame.classList.add("dragging");
  markZoomInteraction();
}

function updatePinch() {
  if (isMapInteractionBlocked()) return;
  const pair = getPointerPair();
  if (!pair || !pinchState) return;
  const [a, b] = pair;
  const mid = midpointBetween(a, b);
  const nextDistance = Math.max(1, distanceBetween(a, b));
  const scale = nextDistance / pinchState.startDistance;
  const rect = mapFrame.getBoundingClientRect();
  zoom = clampZoomForViewport(pinchState.startZoom * scale, rect);
  const offset = getMapViewportOffset(rect);
  camera.x = pinchState.mapPoint.x - (mid.x - rect.left - offset.x) / zoom;
  camera.y = pinchState.mapPoint.y - (mid.y - rect.top - offset.y) / zoom;
  scheduleCameraTransform();
  markZoomInteraction();
}

function isMapNodeInteractionTarget(target) {
  return Boolean(target?.closest(".city-node, .city-action-wheel, .camp-node, .gold-camp-action-wheel, .teleport-node, .harvest-bonus-node, .army-token"));
}

function isMapCommandInteractionTarget(target) {
  return Boolean(target?.closest(".city-wheel-action, .gold-camp-wheel-action, .teleport-node, .harvest-bonus-node, .army-token-nav button"));
}

function resolveCityTapButton(event) {
  if (!event || !cityLayer) return null;
  const clientX = Number(event.clientX);
  const clientY = Number(event.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return event.target?.closest?.(".city-node") || null;

  const directNode = event.target?.closest?.(".city-node") || null;
  const candidateNodes = [];
  const seenIds = new Set();
  const addCandidate = node => {
    if (!node || !cityLayer.contains(node) || seenIds.has(node.dataset.cityId)) return;
    seenIds.add(node.dataset.cityId);
    candidateNodes.push(node);
  };
  addCandidate(directNode);
  document.elementsFromPoint?.(clientX, clientY).forEach(element => addCandidate(element.closest?.(".city-node")));

  const worldPoint = screenToWorld(clientX, clientY);
  const distanceToNode = node => {
    const city = cityById(node?.dataset.cityId);
    return city ? Math.hypot(city.x - worldPoint.x, city.y - worldPoint.y) : Infinity;
  };
  if (candidateNodes.length > 1) {
    return candidateNodes.reduce((best, node) => distanceToNode(node) < distanceToNode(best) ? node : best);
  }
  if (directNode && !directNode.classList.contains("stronghold-node")) return directNode;

  const nearbyRadius = 44 / Math.max(0.1, zoom);
  let nearestCity = null;
  let nearestDistance = Infinity;
  (state?.cities || []).forEach(city => {
    if (!isCityInActiveMap(city)) return;
    const distance = Math.hypot(city.x - worldPoint.x, city.y - worldPoint.y);
    if (distance <= nearbyRadius && distance < nearestDistance) {
      nearestCity = city;
      nearestDistance = distance;
    }
  });
  if (nearestCity) {
    for (const child of cityLayer.children) {
      if (child.classList?.contains("city-node") && child.dataset.cityId === nearestCity.id) return child;
    }
  }

  return directNode || candidateNodes[0] || null;
}

function resolveCampTapButton(event) {
  if (!event || !cityLayer) return null;
  const campButton = event.target?.closest?.(".camp-node[data-camp-id]") || null;
  return campButton && cityLayer.contains(campButton) ? campButton : null;
}

function resolveArmyTapToken(event) {
  if (!event || !armyLayer) return null;
  const token = event.target?.closest?.(".army-token[data-army-token-id]") || null;
  return token && armyLayer.contains(token) && token.dataset.endpointInteractionDisabled !== "true" ? token : null;
}

function trackCityTap(event, cityButton = resolveCityTapButton(event)) {
  if (!cityButton || !cityLayer.contains(cityButton)) return null;
  cityTapState = {
    pointerId: event.pointerId,
    cityId: cityButton.dataset.cityId,
    x: event.clientX,
    y: event.clientY,
    selected: false,
  };
  return cityButton;
}

function trackCampTap(event, campButton = resolveCampTapButton(event)) {
  if (!campButton) return null;
  campTapState = {
    pointerId: event.pointerId,
    campId: campButton.dataset.campId,
    x: event.clientX,
    y: event.clientY,
  };
  return campButton;
}

function trackArmyTap(event, token = resolveArmyTapToken(event)) {
  if (!token) return null;
  armyTapState = {
    pointerId: event.pointerId,
    tokenId: token.dataset.armyTokenId,
    x: event.clientX,
    y: event.clientY,
  };
  return token;
}

function beginTrackedPan(event, startedOnMapNode = false) {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  mapFrame.setPointerCapture?.(event.pointerId);

  if (activePointers.size >= 2) {
    beginPinch();
    return;
  }

  panState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    cameraX: camera.x,
    cameraY: camera.y,
    moved: false,
    startedOnMapNode,
  };
  suppressMapClick = false;
  mapFrame.classList.add("dragging");
}

function startPan(event) {
  if (!state || event.button > 0 || isMapInteractionBlocked()) return;

  const isTouch = event.pointerType === "touch";
  const startedOnCommand = isMapCommandInteractionTarget(event.target);
  const armyToken = startedOnCommand ? null : resolveArmyTapToken(event);
  const cityButton = armyToken || startedOnCommand ? null : resolveCityTapButton(event);
  if (cityButton) trackCityTap(event, cityButton);
  if (armyToken) trackArmyTap(event, armyToken);
  const startedOnMapNode = Boolean(cityButton || armyToken) || isMapNodeInteractionTarget(event.target);

  if (isTouch && !startedOnCommand) event.preventDefault();

  if (startedOnCommand) {
    suppressMapClick = false;
    return;
  }

  beginTrackedPan(event, startedOnMapNode);
}

function movePan(event) {
  if (isMapInteractionBlocked()) return;
  if (event.pointerType === "touch" && (pinchState || panState || activePointers.has(event.pointerId))) {
    event.preventDefault();
  }
  if (activePointers.has(event.pointerId)) {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (pinchState && activePointers.size >= 2) {
    updatePinch();
    return;
  }

  if (!panState || panState.pointerId !== event.pointerId) return;
  const dx = event.clientX - panState.startX;
  const dy = event.clientY - panState.startY;
  const distance = Math.hypot(dx, dy);
  const movementThreshold = panState.startedOnMapNode ? MAP_TOUCH_PAN_THRESHOLD : 5;
  if (distance > movementThreshold) {
    panState.moved = true;
    if (cityTapState?.pointerId === event.pointerId) cityTapState = null;
    if (campTapState?.pointerId === event.pointerId) campTapState = null;
    if (armyTapState?.pointerId === event.pointerId) armyTapState = null;
  }
  if (panState.startedOnMapNode && !panState.moved) return;
  camera.x = panState.cameraX - dx / zoom;
  camera.y = panState.cameraY - dy / zoom;
  scheduleCameraTransform();
  markCameraInteraction();
}

function finishTrackedMapPointer(event, { renderPanelAfter = true } = {}) {
  const wasPinching = Boolean(pinchState);
  activePointers.delete(event.pointerId);

  if (panState && panState.pointerId === event.pointerId) {
    suppressMapClick = panState.moved;
    panState = null;
  } else if (wasPinching) {
    suppressMapClick = true;
  }

  if (activePointers.size < 2) pinchState = null;
  if (activePointers.size === 0) mapFrame.classList.remove("dragging");
  try {
    mapFrame.releasePointerCapture?.(event.pointerId);
  } catch {
    // Some browsers throw if capture was already released by the target element.
  }
  if (suppressMapClick) {
    window.setTimeout(() => { suppressMapClick = false; }, 80);
  }
  if (renderPanelAfter) renderPanel();
}

function trySelectTrackedCityTap(event, { requireSameTarget = false } = {}) {
  if (isMapInteractionBlocked()) return false;
  if (!cityTapState || cityTapState.pointerId !== event.pointerId) return false;
  const tapState = cityTapState;
  cityTapState = null;
  const moved = Math.hypot(event.clientX - tapState.x, event.clientY - tapState.y) > 12;
  if (moved) return false;
  if (requireSameTarget) {
    const cityButton = resolveCityTapButton(event);
    const sameCity = cityButton && cityLayer.contains(cityButton) && cityButton.dataset.cityId === tapState.cityId;
    if (!sameCity) return false;
  }
  const city = cityById(tapState.cityId);
  if (!city || !isCityInActiveMap(city)) return false;
  suppressMapClick = true;
  selectCity(tapState.cityId);
  window.setTimeout(() => { suppressMapClick = false; }, 80);
  return true;
}

function trySelectTrackedCampTap(event, { requireSameTarget = false } = {}) {
  if (isMapInteractionBlocked()) return false;
  if (!campTapState || campTapState.pointerId !== event.pointerId) return false;
  const tapState = campTapState;
  campTapState = null;
  const moved = Math.hypot(event.clientX - tapState.x, event.clientY - tapState.y) > 12;
  if (moved) return false;
  if (requireSameTarget) {
    const campButton = resolveCampTapButton(event);
    const sameCamp = campButton?.dataset.campId === tapState.campId;
    if (!sameCamp) return false;
  }
  const camp = getCampTargetById(tapState.campId);
  if (!camp || !isCampInActiveMap(camp)) return false;
  suppressMapClick = true;
  selectRewardCamp(tapState.campId);
  window.setTimeout(() => { suppressMapClick = false; }, 80);
  return true;
}

function trySelectTrackedArmyTap(event) {
  if (isMapInteractionBlocked()) return false;
  if (!armyTapState || armyTapState.pointerId !== event.pointerId) return false;
  const tapState = armyTapState;
  armyTapState = null;
  const moved = Math.hypot(event.clientX - tapState.x, event.clientY - tapState.y) > 12;
  if (moved || !getArmyByTokenId(tapState.tokenId)) return false;
  suppressMapClick = true;
  selectedArmyTokenId = selectedArmyTokenId === tapState.tokenId ? "" : tapState.tokenId;
  updateArmyTokenNavigationSelection();
  window.setTimeout(() => { suppressMapClick = false; }, 120);
  return true;
}

function endPan(event) {
  finishTrackedMapPointer(event, { renderPanelAfter: false });
  const selectedMapTarget = event.type === "pointerup"
    && (trySelectTrackedCityTap(event) || trySelectTrackedCampTap(event) || trySelectTrackedArmyTap(event));
  if (event.type !== "pointerup" && armyTapState?.pointerId === event.pointerId) armyTapState = null;
  if (!selectedMapTarget) renderPanel();
}

function preventNativeMapTouch(event) {
  if (!state || isMapInteractionBlocked()) return;
  event.preventDefault();
}

function handleMapClick(event) {
  if (isMapInteractionBlocked()) return;
  if (suppressMapClick) return;
  if (!event.target?.closest?.(".army-token") && selectedArmyTokenId) {
    selectedArmyTokenId = "";
    updateArmyTokenNavigationSelection();
  }
  if (event.target?.closest?.(".army-token")) return;
  if (resolveCityTapButton(event)) return;
  clearSelection();
}
function randomChoice(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function isInstalledAppDisplayMode() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.navigator?.standalone === true
  );
}

function updateInstallAppButton() {
  if (!installAppBtn) return;
  installAppBtn.hidden = !deferredInstallPrompt || isInstalledAppDisplayMode();
}

async function handleInstallAppClick() {
  if (!deferredInstallPrompt) return;
  installAppBtn.disabled = true;
  try {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallAppButton();
  } catch (error) {
    console.warn("[Crownlands] Install prompt failed.", error);
  } finally {
    installAppBtn.disabled = false;
  }
}

function registerPwaInstallPrompt() {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallAppButton();
    console.info("[Crownlands] Install prompt is ready.");
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallAppButton();
    console.info("[Crownlands] App installed.");
  });
  updateInstallAppButton();
}

function registerCrownlandsServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.info("[Crownlands] Service workers are not supported in this browser.");
    return;
  }

  navigator.serviceWorker.addEventListener("message", handleServiceWorkerUpdateMessage);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    checkForDeployedUpdate(true);
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      console.info("[Crownlands] Service worker registered.", registration.scope);

      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        checkForDeployedUpdate(true);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            checkForDeployedUpdate(true);
          }
        });
      });
    } catch (error) {
      console.warn("[Crownlands] Service worker registration failed.", error);
    }
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

if (startBtn) startBtn.addEventListener("click", () => startFromInput(false));
if (freshBtn) freshBtn.addEventListener("click", () => startFromInput(true));
if (googleSignInBtn) googleSignInBtn.addEventListener("click", handleGoogleSignIn);
if (enterKingdomBtn) enterKingdomBtn.addEventListener("click", () => startFromInput(false));
if (serverRealmBtn) serverRealmBtn.addEventListener("click", () => startFromInput(false));
if (googleSignOutBtn) googleSignOutBtn.addEventListener("click", handleGoogleSignOut);
if (installAppBtn) installAppBtn.addEventListener("click", handleInstallAppClick);
window.addEventListener("crownlands:online-ready", () => {
  updateOnlineUi();
  updatePushAlertsUi();
  if (getOnlineApi()?.isSignedIn?.()) watchGameServerMembership();
});
window.addEventListener("crownlands:auth", async () => {
  if (getOnlineApi()?.isSignedIn?.()) watchGameServerMembership();
  else stopGameServerMembershipWatcher({ clear: true });
  updateOnlineUi();
  refreshPushAlertRegistration(true);
  if (state) {
    queueOnlineSave();
    flushOnlineSave(true);
  }
});
window.addEventListener("crownlands:push-message", handlePushMessage);
window.addEventListener("crownlands:online-error", event => {
  onlineLastError = event.detail?.message || "Firebase could not start.";
  updateOnlineUi();
  updatePushAlertsUi();
});
window.addEventListener("crownlands:session-replaced", handleOnlineSessionReplaced);
if (playerNameInput) {
  playerNameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") startFromInput(false);
  });
}
fullscreenButtons.forEach(button => button.addEventListener("click", toggleFullscreen));
if (shopBtn) shopBtn.addEventListener("click", showShopModal);
if (islandSwitchBtn) islandSwitchBtn.addEventListener("click", showIslandSwitcherModal);
if (profileBtn) profileBtn.addEventListener("click", showProfileScreen);
if (profileCloseBtn) profileCloseBtn.addEventListener("click", closeProfileScreen);
if (profileTabBtn) profileTabBtn.addEventListener("click", showProfileView);
if (skillsTabBtn) skillsTabBtn.addEventListener("click", showProfileSkills);
if (settingsTabBtn) settingsTabBtn.addEventListener("click", showProfileSettings);
if (pushAlertsOffBtn) pushAlertsOffBtn.addEventListener("click", disablePushNotificationsFromSettings);
if (pushAlertsOnBtn) pushAlertsOnBtn.addEventListener("click", enablePushNotificationsFromSettings);
if (profileFlagBtn) profileFlagBtn.addEventListener("click", showFlagEditor);
if (profileNameEditBtn) profileNameEditBtn.addEventListener("click", beginProfileNameEdit);
if (profileNameSaveBtn) profileNameSaveBtn.addEventListener("click", saveProfileName);
if (profileNameCancelBtn) profileNameCancelBtn.addEventListener("click", cancelProfileNameEdit);
if (profileNameInput) {
  profileNameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") saveProfileName();
    if (event.key === "Escape") cancelProfileNameEdit();
  });
}
if (flagSaveBtn) flagSaveBtn.addEventListener("click", saveFlagEditor);
if (flagBackBtn) flagBackBtn.addEventListener("click", showProfileView);
if (flagExitBtn) flagExitBtn.addEventListener("click", closeProfileScreen);
clearSelectBtn.addEventListener("click", () => clearSelection());
cityLayer.addEventListener("pointerdown", event => {
  if (isMapInteractionBlocked()) return;
  const startedOnCommand = isMapCommandInteractionTarget(event.target);
  const cityButton = startedOnCommand ? null : resolveCityTapButton(event);
  const campButton = cityButton || startedOnCommand ? null : resolveCampTapButton(event);
  if (cityButton) trackCityTap(event, cityButton);
  else if (campButton) trackCampTap(event, campButton);
  if (event.target.closest(".city-node, .city-wheel-action, .camp-node, .gold-camp-wheel-action")) interactionRenderLockUntil = performance.now() + 600;
});
cityLayer.addEventListener("pointerup", event => {
  if (isMapInteractionBlocked()) return;
  if (campTapState?.pointerId === event.pointerId) {
    const campButton = resolveCampTapButton(event);
    const moved = Math.hypot(event.clientX - campTapState.x, event.clientY - campTapState.y) > 12;
    const sameCamp = campButton?.dataset.campId === campTapState.campId;
    if (!moved && sameCamp) {
      event.stopPropagation();
      finishTrackedMapPointer(event, { renderPanelAfter: false });
      trySelectTrackedCampTap(event, { requireSameTarget: true });
    } else {
      campTapState = null;
    }
    return;
  }
  if (!cityTapState || cityTapState.pointerId !== event.pointerId) return;
  const cityButton = resolveCityTapButton(event);
  const moved = Math.hypot(event.clientX - cityTapState.x, event.clientY - cityTapState.y) > 12;
  const sameCity = cityButton && cityLayer.contains(cityButton) && cityButton.dataset.cityId === cityTapState.cityId;
  if (!moved && sameCity) {
    event.stopPropagation();
    finishTrackedMapPointer(event, { renderPanelAfter: false });
    trySelectTrackedCityTap(event, { requireSameTarget: true });
  } else {
    cityTapState = null;
  }
});
cityLayer.addEventListener("pointercancel", event => {
  if (cityTapState?.pointerId === event.pointerId) cityTapState = null;
  if (campTapState?.pointerId === event.pointerId) campTapState = null;
  if (armyTapState?.pointerId === event.pointerId) armyTapState = null;
});
if (portalLayer) {
  portalLayer.addEventListener("pointerdown", event => {
    if (isMapInteractionBlocked()) return;
    if (!event.target.closest(".teleport-node")) return;
    event.stopPropagation();
    interactionRenderLockUntil = performance.now() + 600;
  });
}
cityLayer.addEventListener("click", event => {
  if (isMapInteractionBlocked()) return;
  if (suppressMapClick) return;
  if (event.target.closest(".city-wheel-action, .gold-camp-wheel-action")) return;
  const campButton = event.target.closest(".camp-node[data-camp-id]");
  if (campButton && cityLayer.contains(campButton)) {
    event.stopPropagation();
    cityTapState = null;
    campTapState = null;
    selectRewardCamp(campButton.dataset.campId);
    return;
  }
  const cityButton = resolveCityTapButton(event);
  if (!cityButton || !cityLayer.contains(cityButton)) return;
  event.stopPropagation();
  if (cityTapState?.selected && cityTapState.cityId === cityButton.dataset.cityId) {
    cityTapState = null;
    return;
  }
  cityTapState = null;
  campTapState = null;
  selectCity(cityButton.dataset.cityId);
});
const mapPointerEventOptions = { passive: false };
mapFrame.addEventListener("pointerdown", startPan, mapPointerEventOptions);
mapFrame.addEventListener("pointermove", movePan, mapPointerEventOptions);
mapFrame.addEventListener("pointerup", endPan, mapPointerEventOptions);
mapFrame.addEventListener("pointercancel", endPan, mapPointerEventOptions);
mapFrame.addEventListener("click", handleMapClick);
mapFrame.addEventListener("wheel", handleWheelZoom, { passive: false });
mapFrame.addEventListener("touchmove", preventNativeMapTouch, { passive: false });
mapFrame.addEventListener("gesturestart", preventNativeMapTouch, { passive: false });
mapFrame.addEventListener("gesturechange", preventNativeMapTouch, { passive: false });
mapFrame.addEventListener("gestureend", preventNativeMapTouch, { passive: false });
window.addEventListener("resize", updateCameraTransform);
document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    checkForDeployedUpdate(true);
    heartbeatGameServerMembership();
  }
});
window.addEventListener("online", () => {
  checkForDeployedUpdate(true);
  heartbeatGameServerMembership();
});
document.addEventListener("keydown", event => {
  if (event.key === "F8") {
    event.preventDefault();
    togglePerformancePanel();
    return;
  }
  if (event.key !== "Escape" || !profileScreen?.classList.contains("open")) return;
  if (event.target === profileNameInput) return;
  if (!flagEditorView.hidden) showProfileView();
  else closeProfileScreen();
});
logBtn.addEventListener("click", showLogModal);
if (leaderboardBtn) leaderboardBtn.addEventListener("click", showLeaderboardModal);
if (outgoingAttackBtn) outgoingAttackBtn.addEventListener("click", showOutgoingAttacksModal);
if (incomingAttackBtn) incomingAttackBtn.addEventListener("click", showIncomingAttacksModal);
if (inventoryBtn) inventoryBtn.addEventListener("click", showInventoryModal);
if (cityListBtn) cityListBtn.addEventListener("click", showCityListModal);
if (helpBtn) helpBtn.addEventListener("click", showHelpModal);
if (mainCityReturnBtn) mainCityReturnBtn.addEventListener("click", returnToMainCity);
closeModalBtn.addEventListener("click", () => modal.close());
modal.addEventListener("click", event => {
  if (event.target !== modal) return;
  event.preventDefault();
  event.stopPropagation();
  modal.close();
});
document.addEventListener("pointerdown", event => {
  if (!profileScreen?.classList.contains("open") || modal.open) return;
  if (profileScreen.contains(event.target) || profileBtn?.contains(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  closeProfileScreen();
}, true);
modal.addEventListener("close", () => {
  modal.classList.remove("troop-slider-modal");
  modal.classList.remove("scout-report-modal");
  modal.classList.remove("battle-report-modal");
  modal.classList.remove("offline-reward-modal");
  modal.classList.remove("city-list-modal");
  modal.classList.remove("island-switcher-modal");
  modal.classList.remove("leaderboard-modal");
  modal.classList.remove("shop-modal");
  modal.classList.remove("inventory-modal");
  modal.classList.remove("incoming-attack-modal");
  modal.classList.remove("outgoing-attack-modal");
  modal.classList.remove("relinquish-city-modal");
  setTimeout(showNextLevelUpReward, 0);
  if (!troopSliderActive) return;
  troopSliderActive = false;
  cancelSendMode();
});
if (levelUpRewardModal) {
  levelUpRewardModal.addEventListener("cancel", event => {
    event.preventDefault();
  });
  levelUpRewardModal.addEventListener("click", event => {
    if (event.target !== levelUpRewardModal) return;
    event.preventDefault();
    event.stopPropagation();
  });
  levelUpRewardModal.addEventListener("close", () => {
    levelUpRewardModal.classList.remove("revealed");
    activeLevelUpReward = null;
    setTimeout(showNextLevelUpReward, 0);
  });
}
if (collectLevelUpRewardsBtn) {
  collectLevelUpRewardsBtn.addEventListener("click", () => {
    if (!levelUpRewardModal?.open) return;
    levelUpRewardModal.classList.add("collecting");
    setTimeout(() => {
      levelUpRewardModal.classList.remove("collecting");
      levelUpRewardModal.close();
    }, 140);
  });
}

if (playerNameInput) playerNameInput.value = cleanName(getOnlineApi()?.getUser?.()?.displayName) || "Ricky";
applyWorldDimensions();
renderWorldMap();
renderIslandTeleporters();
updateFullscreenButton();
updateOnlineUi();
registerPwaInstallPrompt();
registerCrownlandsServiceWorker();
if (new URLSearchParams(window.location.search).has("perf")) togglePerformancePanel(true);
requestAnimationFrame(frame);
