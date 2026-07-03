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
const RESET_GENERATION = "fresh-2026-07-03-profile-reset";
const STORAGE_KEY = `crownlands-realtime-${RESET_GENERATION}`;
const PENDING_ARMY_STORAGE_KEY = `crownlands-pending-armies-${RESET_GENERATION}`;
const PUSH_NOTIFICATIONS_PREF_KEY = "crownlands-push-notifications";
const LEGACY_STORAGE_KEYS = [];
const SAVE_EVERY_SECONDS = 30;
const ONLINE_SAVE_SECONDS = 20;
const ONLINE_SAVE_SLOT = `default-${RESET_GENERATION}`;
const ONLINE_WORLD_ID = `main-${RESET_GENERATION}`;
const ONLINE_LEGACY_ISLAND_ID = ONLINE_WORLD_ID;
const DEFAULT_ONLINE_REGION_ID = WORLD_REGIONS.find(isStarterRegion)?.id
  || WORLD_REGIONS.find(region => region.id === "west")?.id
  || WORLD_REGIONS[0]?.id
  || "center";
const ONLINE_CITY_SYNC_SECONDS = 20;
const ONLINE_PRESENCE_SECONDS = 30;
const ONLINE_PRESENCE_STALE_SECONDS = 90;
const SERVER_ECONOMY_SYNC_SECONDS = 15;
const LEADERBOARD_SAVE_SECONDS = 60;
const LEADERBOARD_STALE_REFRESH_MS = 5 * 60 * 1000;
const KING_POWER_LEADERBOARD_LIMIT = 100;
const ONLINE_OWNED_CITIES_REFRESH_MS = 15 * 1000;
const ONLINE_ARMY_EXPIRY_GRACE_SECONDS = 8;
const ONLINE_ARMY_RESOLVE_RETRY_SECONDS = 5;
const PENDING_ARMY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_SECONDS = 45;
const SETUP_LOADING_MIN_MS = 180;
const IMAGE_PRELOAD_TIMEOUT_MS = 15000;
const HUD_RENDER_INTERVAL_MS = 250;
const MAP_RENDER_INTERVAL_MS = 1600;
const CITY_LIST_PAGE_SIZE = 5;
const INVENTORY_SLOT_COUNT = 5;
const SHOP_ITEMS = [
  {
    id: "shield_12h",
    label: "Royal Peace Shield",
    description: "Protects your cities for 12 hours. Attacking another player cancels it. Strongholds are excluded.",
    cost: 175_000,
    icon: "assets/royal-peace-shield-icon.png",
  },
  {
    id: "war_drums_30m",
    legacyIds: ["troop_boost_1h"],
    label: "War Drums",
    description: "Increases troop production by 25% for 30 minutes.",
    cost: 25_000,
    icon: "assets/war-drums-icon.png",
  },
  {
    id: "veil_of_silence_30m",
    legacyIds: ["anti_scout_1h"],
    label: "Veil of Silence",
    description: "Blocks enemy scouting for 30 minutes.",
    cost: 40_000,
    icon: "assets/veil-of-silence-icon.png",
  },
  {
    id: "swift_march_order",
    label: "Swift March Order",
    description: "Speeds up one troop transfer between owned cities only.",
    cost: 55_000,
    icon: "assets/swift-march-order-icon.png",
  },
  {
    id: "recall_horn",
    label: "Recall Horn",
    description: "Cancels one active march before it reaches the target.",
    cost: 90_000,
    icon: "assets/recall-horn-icon.png",
  },
];
const ROYAL_PEACE_SHIELD_ITEM_ID = "shield_12h";
const ROYAL_PEACE_SHIELD_DURATION_MS = 12 * 60 * 60 * 1000;
const WAR_DRUMS_ITEM_ID = "war_drums_30m";
const WAR_DRUMS_DURATION_MS = 30 * 60 * 1000;
const WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT = 25;

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
const MAIN_CITY_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
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
const ZOOM_RENDER_SETTLE_MS = 260;
const LOW_ZOOM_PERFORMANCE_THRESHOLD = 0.72;
const ISLAND_MAP_PADDING = 560;
const TROOP_PICKUP_ICON_SRC = "assets/troop-pickup.png?v=20260702-troop-pickup-art";
const GOLD_PICKUP_ICON_SRC = "assets/gold-pickup.png?v=20260702-gold-pickup-art";
const MAP_SWITCH_ARROW_ICON_SRC = "assets/map-switch-arrow.png?v=20260702-map-arrow-bigger";
const DEFAULT_PORTAL_VISUAL_SIZE = 92;
const MIN_PORTAL_VISUAL_SIZE = 60;
const EDGE_TRANSITION_ROUTE_INSET_MIN = 24;
const EDGE_TRANSITION_ROUTE_INSET_MAX = 58;
const EDGE_TRANSITION_ARROW_INSET_MIN = 96;
const EDGE_TRANSITION_ARROW_INSET_MAX = 180;
const DEFAULT_STRONGHOLD_VISUAL_SIZE = 154;
const MIN_STRONGHOLD_VISUAL_SIZE = 80;
const GOLD_STRONGHOLD_ID = "west_gold_stronghold";
const GOLD_STRONGHOLD_NAME = "Gold Stronghold";
const GOLD_STRONGHOLD_ART_SRC = "assets/gold-stronghold.png?v=20260703-gold-stronghold-art";
const GOLD_STRONGHOLD_BONUS_PERCENT = 15;
const GOLD_STRONGHOLD_LEVEL = 50;
const GOLD_STRONGHOLD_START_TROOPS = 50000000;
const TRAINING_STRONGHOLD_ID = "north_training_stronghold";
const TRAINING_STRONGHOLD_NAME = "Training Stronghold";
const TRAINING_STRONGHOLD_ART_SRC = "assets/training-stronghold.png?v=20260703-training-stronghold-art";
const TRAINING_STRONGHOLD_BONUS_PERCENT = 15;
const TRAINING_STRONGHOLD_LEVEL = 50;
const TRAINING_STRONGHOLD_START_TROOPS = 50000000;
const SPEED_STRONGHOLD_ID = "east_speed_stronghold";
const SPEED_STRONGHOLD_NAME = "Speed Stronghold";
const SPEED_STRONGHOLD_ART_SRC = "assets/speed-stronghold.png?v=20260703-speed-stronghold-art";
const SPEED_STRONGHOLD_BONUS_PERCENT = 15;
const SPEED_STRONGHOLD_LEVEL = 50;
const SPEED_STRONGHOLD_START_TROOPS = 50000000;
const DEFENSE_STRONGHOLD_ID = "south_defense_stronghold";
const DEFENSE_STRONGHOLD_NAME = "Defense Stronghold";
const DEFENSE_STRONGHOLD_ART_SRC = "assets/defense-stronghold.png?v=20260703-defense-stronghold-art";
const DEFENSE_STRONGHOLD_BONUS_PERCENT = 15;
const DEFENSE_STRONGHOLD_LEVEL = 50;
const DEFENSE_STRONGHOLD_START_TROOPS = 50000000;
const CROWN_CITADEL_ID = "center_crown_citadel";
const CROWN_CITADEL_NAME = "Crown Citadel";
const CROWN_CITADEL_ART_SRC = "assets/crown-citadel.png?v=20260703-crown-citadel-art";
const CROWN_CITADEL_GOLD_BONUS_PERCENT = 10;
const CROWN_CITADEL_TROOP_BONUS_PERCENT = 10;
const CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT = 8;
const CROWN_CITADEL_DEFENSE_BONUS_PERCENT = 8;
const CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT = 8;
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
const WEST_ISLAND_ART_SRC = "assets/west-island.png";
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
const NORTH_ISLAND_ART_SRC = "assets/north-island.png";
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
const EAST_ISLAND_ART_SRC = "assets/east-island.png";
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
const SOUTH_ISLAND_ART_SRC = "assets/south-island.png";
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
const CENTER_ISLAND_ART_SRC = "assets/center-island.png";
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
const MAX_CITY_LEVEL = 100;
const MILLION_LORDS_CITY_COST_BASE = 50;
const MILLION_LORDS_CITY_COST_GROWTH = 1.2;
const MILLION_LORDS_CITY_PRODUCTION_VP_BASE = 20;
const MILLION_LORDS_CITY_PRODUCTION_VP_GROWTH = 1.115;
const MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP = 15;
const DAILY_NEUTRAL_CAPTURE_LIMIT = 30;
const HARVEST_BONUS_DAILY_LIMIT = 200;
const HARVEST_BONUS_DAILY_GOLD_LIMIT = 100;
const HARVEST_BONUS_DAILY_TROOP_LIMIT = 100;
const HARVEST_BONUS_TYPES = ["gold", "troops"];
const HARVEST_BONUS_SPAWN_INTERVAL_SECONDS = 60;
const HARVEST_BONUS_INITIAL_SPAWN_SECONDS = 60;
const HARVEST_BONUS_MAX_ACTIVE_PER_ISLAND = 1;
const HARVEST_BONUS_EXPIRE_SECONDS = 1800;
const HARVEST_BONUS_GOLD_SECONDS = 180;
const HARVEST_BONUS_MIN_GOLD = 300;
const HARVEST_BONUS_TROOP_SECONDS = 300;
const HARVEST_BONUS_MIN_TROOPS = 50;
const HARVEST_BONUS_MAX_TROOPS = 2500;
const HARVEST_BONUS_CITY_CLEARANCE = 132;
const HARVEST_BONUS_TRANSITION_CLEARANCE = 148;
const HARVEST_BONUS_PICKUP_CLEARANCE = 116;
const HARVEST_BONUS_TERRAIN_PADDING = 22;
const HARVEST_BONUS_LAND_CLEARANCE = 64;
const HARVEST_BONUS_CITY_SPAWN_MIN_DISTANCE = 170;
const HARVEST_BONUS_CITY_SPAWN_MAX_DISTANCE = 420;
const NEUTRAL_CITY_COUNT_LIMIT = 30;
const PLAYER_START_TROOPS = 50;
const PLAYER_SLOT_START_TROOPS = 50;
const NEUTRAL_START_TROOPS = 10;
const TEST_STARTING_GOLD = 500;
const ISLAND_CITY_COUNT = WORLD_REGIONS.reduce((total, region) => total + (region.id === "center" ? CENTER_REGION_CITY_COUNT : REGION_CITY_COUNT), 0);
const SCOUT_REPORT_SECONDS = 120;
const SCOUT_NEARBY_COST = 10000;
const SCOUT_NEARBY_RADIUS = 420;
const REGROUP_COST = 20000;
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
const LEVEL_UP_TROOP_REWARD_BASE = 50;
const LEVEL_UP_TROOP_REWARD_MULTIPLIER = 1.15;
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
const BATTLE_XP_LEVEL_REQUIREMENT_CAP_MULTIPLIER = 3;
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
  defensePercentPerLevel: 3,
  cityWallsBase: 30,
  cityWallsPerLevel: 32,
  troopProductionPerVictoryPoint: 3,
  goldProductionPerMillionLordsVp: MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP,
};
const KING_POWER_PER_TROOP = 1;
const KING_POWER_PER_CITY_VP = 10;
const SKILL_RESET_COST = 10_000;

const SKILL_CONFIG = {
  striker: { label: "Striker", percentPerLevel: 2, description: "Attack combat bonus for outgoing armies." },
  fearless: { label: "Fearless", percentPerLevel: 2, maxPercent: 75, description: "Saves a share of attacking losses back to your main city." },
  brave: { label: "Brave", percentPerLevel: 2, maxPercent: 75, description: "Saves a share of defending losses back to your main city." },
  guardian: { label: "Guardian", percentPerLevel: 3, description: "Defending troop bonus in your cities." },
  prosperous: { label: "Prosperous", percentPerLevel: 3, description: "Gold production bonus from your cities." },
  recruiter: { label: "Recruiter", percentPerLevel: 3, description: "Extra troop production based on city VP." },
  rusher: { label: "Rusher", percentPerLevel: 5, description: "Army travel speed bonus." },
  scavenger: { label: "Scavenger", percentPerLevel: 2, description: "Bonus gold for troops killed while attacking." },
  salvager: { label: "Salvager", percentPerLevel: 2, description: "Bonus gold for troops killed while defending." },
  cautious: { label: "Cautious", percentPerLevel: 1, maxPercent: 50, description: "Refunds a share of your invested city gold when a city is lost." },
};

const SKILL_ORDER = ["striker", "fearless", "brave", "guardian", "prosperous", "recruiter", "rusher", "scavenger", "salvager", "cautious"];

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
  const version = "v=20260702-city-level-art";
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

function getPortalVisualSize(portal) {
  return Math.max(MIN_PORTAL_VISUAL_SIZE, Math.floor(Number(portal?.size) || DEFAULT_PORTAL_VISUAL_SIZE));
}

function getStrongholdVisualSize(city) {
  return Math.max(MIN_STRONGHOLD_VISUAL_SIZE, Math.floor(Number(city?.size) || DEFAULT_STRONGHOLD_VISUAL_SIZE));
}

function applyCityActionWheelSizing(wheel, city) {
  if (!wheel || !isStronghold(city)) return;
  const strongholdSize = getStrongholdVisualSize(city);
  const targetWidth = Math.round(strongholdSize * 0.961);
  const targetHeight = Math.round(strongholdSize * 0.896);
  const wheelWidth = targetWidth + Math.max(144, Math.round(strongholdSize * 0.62));
  const wheelHeight = targetHeight + Math.max(128, Math.round(strongholdSize * 0.54));
  const ringWidth = targetWidth + Math.max(42, Math.round(strongholdSize * 0.18));
  const ringHeight = targetHeight + Math.max(34, Math.round(strongholdSize * 0.14));

  wheel.classList.add("stronghold-action-wheel");
  if (isCrownCitadel(city)) wheel.classList.add("crown-action-wheel");
  wheel.style.setProperty("--wheel-width", `${wheelWidth}px`);
  wheel.style.setProperty("--wheel-height", `${wheelHeight}px`);
  wheel.style.setProperty("--wheel-ring-width", `${ringWidth}px`);
  wheel.style.setProperty("--wheel-ring-height", `${ringHeight}px`);
  wheel.style.setProperty("--wheel-side-top", `${Math.round((wheelHeight - 62) / 2)}px`);
  wheel.style.setProperty("--wheel-info-left", `${Math.round((wheelWidth - 58) / 2)}px`);
  wheel.style.setProperty("--wheel-translate-y", "-55%");
}

function isGoldStronghold(city) {
  return isStronghold(city) && (city.strongholdType === "gold" || city.id === GOLD_STRONGHOLD_ID);
}

function isTrainingStronghold(city) {
  return isStronghold(city) && (city.strongholdType === "training" || city.id === TRAINING_STRONGHOLD_ID);
}

function isSpeedStronghold(city) {
  return isStronghold(city) && (city.strongholdType === "speed" || city.id === SPEED_STRONGHOLD_ID);
}

function isDefenseStronghold(city) {
  return isStronghold(city) && (city.strongholdType === "defense" || city.id === DEFENSE_STRONGHOLD_ID);
}

function isCrownCitadel(city) {
  return isStronghold(city) && (city.strongholdType === "crown" || city.id === CROWN_CITADEL_ID);
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
  if (Number.isFinite(Number(city?.bonusPercent))) return Math.max(0, Math.floor(Number(city.bonusPercent) || 0));
  if (isCrownCitadel(city)) return CROWN_CITADEL_GOLD_BONUS_PERCENT;
  if (isDefenseStronghold(city)) return DEFENSE_STRONGHOLD_BONUS_PERCENT;
  if (isSpeedStronghold(city)) return SPEED_STRONGHOLD_BONUS_PERCENT;
  if (isTrainingStronghold(city)) return TRAINING_STRONGHOLD_BONUS_PERCENT;
  return isGoldStronghold(city) ? GOLD_STRONGHOLD_BONUS_PERCENT : 0;
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
    city.name = city.name || base.name;
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
const routeCache = new Map();
const routeEdgePassableCache = new Map();
const pathMetricCache = new WeakMap();
const ROUTE_CELL_FALLBACK_RADIUS = 32;
const ROUTE_CELL_FALLBACK_CANDIDATES = 24;
const ROUTE_CELL_FALLBACK_PAIR_LIMIT = 16;
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
let scoutNearbySourceId = null;
let regroupSourceId = null;
let camera = { x: 0, y: 0 };
let zoom = 1;
let panState = null;
let activePointers = new Map();
let pinchState = null;
let zoomSettleTimer = null;
let suppressMapClick = false;
let lastFrameTime = performance.now();
let lastRenderTime = 0;
let lastHudRenderTime = 0;
let saveTimer = 0;
let onlineSaveTimer = 0;
let onlineSaveQueued = false;
let onlineSaveInFlight = false;
let onlineLastSaveAt = 0;
let onlineLastError = "";
let onlineArmySavePromises = new Set();
let onlineCityStateSavePromises = new Set();
let pendingServerArmyLaunchKeys = new Set();
let onlineIslandUnsubscribe = null;
let onlineWorldLoading = false;
let onlineWorldConnected = false;
let onlineCitiesLoaded = false;
let onlineFreshClaimCityId = "";
let onlineActiveRegionId = DEFAULT_ONLINE_REGION_ID;
let mapSwitchLoading = false;
let onlineSetupBackgroundInFlight = false;
let onlineCitySyncTimer = 0;
let onlineCitySyncInFlight = false;
let onlineCitySyncQueued = false;
let onlineArmies = [];
let onlineArmiesByIsland = new Map();
let onlineArmyUnsubscribes = [];
let onlineServerReportsUnsubscribe = null;
let appliedServerReportIds = new Set();
let resolvingOnlineArmyIds = new Set();
let resolvedOnlineArmyIds = new Set();
let onlinePresence = [];
let onlineIslandSummaries = new Map();
let onlineIslandSummaryRefreshInFlight = false;
let onlineOwnedCitiesCache = [];
let onlineOwnedCitiesCacheAt = 0;
let onlineOwnedCitiesCacheComplete = false;
let onlineOwnedCitiesRefreshInFlight = false;
let onlinePresenceTimer = 0;
let onlinePresenceInFlight = false;
let serverEconomySyncTimer = 0;
let serverEconomyRefreshInFlight = false;
let serverEconomyRefreshQueued = false;
let serverEconomyLastSyncAt = 0;
let serverEconomyLastToastAt = 0;
let leaderboardSaveTimer = 0;
let leaderboardSaveInFlight = false;
let leaderboardLastSignature = "";
let leaderboardLastSaveAt = 0;
let overdueArmyResolveTimer = 0;
let pendingArmyRecoveryInFlight = false;
let shopPurchaseInFlight = false;
let serverCityUpgradeInFlightIds = new Set();
let serverCityRelinquishInFlightIds = new Set();
let mainCityRelocationInFlight = false;
let selectedInventoryItemId = "";
let updateCheckTimer = 0;
let updateCheckInFlight = false;
let updateRefreshInProgress = false;
const islandImageLoadPromises = new Map();
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
let renderedMapRegionId = "";
let renderedMapBoundsSignature = "";
let interactionRenderLockUntil = 0;
let cityRenderSignature = "";
let pathRenderSignature = "";
let cityTapState = null;

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
const profileCitiesStat = document.getElementById("profileCitiesStat");
const profileGoldStat = document.getElementById("profileGoldStat");
const profileTroopsStat = document.getElementById("profileTroopsStat");
const profileGoldProductionStat = document.getElementById("profileGoldProductionStat");
const profileTroopProductionStat = document.getElementById("profileTroopProductionStat");
const pushAlertsBtn = document.getElementById("pushAlertsBtn");
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
  const base = getPlayableBaseCities().find(city => city.id === cityId);
  return normalizeRegionId(base?.regionId || base?.startPool);
}

function getKnownCityId(cityId) {
  const value = String(cityId || "");
  if (!value) return "";
  return getPlayableBaseCities().some(city => city.id === value) ? value : "";
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
  const normalizedRegionId = normalizeRegionId(regionId);
  return getPlayableBaseCities().filter(city => getCityRegionId(city) === normalizedRegionId);
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

function getStrongholdConfigForType(type) {
  const strongholdType = String(type || "gold").trim().toLowerCase();
  if (strongholdType === "crown") {
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
  if (strongholdType === "training") {
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
  if (strongholdType === "speed") {
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
  if (strongholdType === "defense") {
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
        size: Math.max(MIN_STRONGHOLD_VISUAL_SIZE, Math.floor(Number(objective?.size) || DEFAULT_STRONGHOLD_VISUAL_SIZE)),
      }));
    });
  }
  return hasAnyEditorObjectives ? slots : null;
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
  const visualSize = Math.max(MIN_STRONGHOLD_VISUAL_SIZE, Math.floor(Number(size) || DEFAULT_STRONGHOLD_VISUAL_SIZE));
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
  if (isStronghold(source)) return String(source.name || fallbackRecord.name || source.id || "Stronghold");
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

function preloadImage(src) {
  const imageSrc = String(src || "");
  if (!imageSrc) return Promise.resolve(false);
  if (islandImageLoadPromises.has(imageSrc)) return islandImageLoadPromises.get(imageSrc);

  const promise = new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const finish = success => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (!success) islandImageLoadPromises.delete(imageSrc);
      resolve(success);
    };
    const timeoutId = window.setTimeout(() => finish(false), IMAGE_PRELOAD_TIMEOUT_MS);
    image.decoding = "async";
    image.loading = "eager";
    image.onload = () => {
      const decodePromise = typeof image.decode === "function" ? image.decode().catch(() => {}) : Promise.resolve();
      decodePromise.finally(() => finish(true));
    };
    image.onerror = () => finish(false);
    image.src = imageSrc;
  });
  islandImageLoadPromises.set(imageSrc, promise);
  return promise;
}

function preloadIslandMap(regionId) {
  return preloadImage(getIslandMapArtSrc(regionId));
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
    if (mapBg.dataset.imageRegion === bounds.regionId && mapBg.dataset.imageSrc === islandArtSrc && mapBg.firstElementChild?.tagName === "IMG") return;
    mapBg.dataset.imageRegion = bounds.regionId;
    mapBg.dataset.imageSrc = islandArtSrc;
    mapBg.innerHTML = `<img class="island-art-map ${escapeHtml(bounds.regionId)}-island-art" src="${escapeHtml(islandArtSrc)}" alt="" draggable="false" decoding="async" loading="eager" fetchpriority="high" />`;
    return;
  }
  delete mapBg.dataset.imageRegion;
  delete mapBg.dataset.imageSrc;
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

  return {
    regionId: normalizeRegionId(regionId),
    cities,
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
  if (!api?.ensureMainIsland) return createOnlineIslandSeed(regionId);
  const targetRegionId = normalizeRegionId(regionId);
  const seed = createOnlineIslandSeed(targetRegionId);
  await withTimeout(api.ensureMainIsland({
    islandId: getOnlineIslandId(targetRegionId),
    cities: seed.cities,
    meta: getOnlineIslandSeedMeta(targetRegionId, seed),
  }), timeoutMs, `${getRegionLabel(targetRegionId)} setup is taking too long.`);
  return seed;
}

function getRelocationSpawnRegionCandidates() {
  return getNewPlayerSpawnRegionIds().map(regionId => {
    const seed = createOnlineIslandSeed(regionId);
    return {
      regionId: normalizeRegionId(regionId),
      islandId: getOnlineIslandId(regionId),
      cityIds: seed.claimCandidateIds,
    };
  }).filter(candidate => candidate.cityIds.length);
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
    daily: { date: currentLocalDateKey(), neutralCaptures: 0, harvestedBonuses: 0, harvestedGoldBonuses: 0, harvestedTroopBonuses: 0 },
    harvestBonuses: [],
    harvestSpawnTimer: HARVEST_BONUS_INITIAL_SPAWN_SECONDS,
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
    const legacyCount = (item.legacyIds || []).reduce((total, legacyId) => (
      total + Math.max(0, Math.floor(Number(items[legacyId]) || 0))
    ), 0);
    normalized[item.id] = Math.max(0, Math.floor(Number(items[item.id]) || 0)) + legacyCount;
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
  return {
    [ROYAL_PEACE_SHIELD_ITEM_ID]: { lastPurchasedAtMs: 0 },
  };
}

function normalizeItemPurchaseCooldowns(cooldowns = {}) {
  const normalized = createDefaultItemPurchaseCooldowns();
  const shieldCooldown = cooldowns?.[ROYAL_PEACE_SHIELD_ITEM_ID] || {};
  normalized[ROYAL_PEACE_SHIELD_ITEM_ID].lastPurchasedAtMs = timestampToMs(
    shieldCooldown.lastPurchasedAtMs || shieldCooldown.lastPurchasedAt
  );
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

function createDefaultItemEffects() {
  return {
    shieldExpiresAtMs: 0,
    warDrumsExpiresAtMs: 0,
  };
}

function normalizeItemEffects(effects = {}) {
  return {
    shieldExpiresAtMs: timestampToMs(effects?.shieldExpiresAtMs || effects?.shieldExpiresAt),
    warDrumsExpiresAtMs: timestampToMs(effects?.warDrumsExpiresAtMs || effects?.warDrumsExpiresAt || effects?.troopBoostExpiresAtMs || effects?.troopBoostExpiresAt),
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

function deactivatePeaceShieldForPlayerAttack(target) {
  if (!state || !isAnotherPlayerOwnedCity(target)) return false;
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
  if (!remaining || !isAnotherPlayerOwnedCity(target)) return "";
  return `Royal Peace Shield active: attacking ${target.name} will drop your shield with ${formatDuration(remaining)} remaining.`;
}

function createOnlineEntryState(playerName) {
  const entry = newGame(playerName);
  entry.mainCityId = "";
  entry.cities = getPlayableBaseCities().map(createNeutralCityFromBase);
  entry.attacks = [];
  entry.log = ["Connecting to the live Crownlands world."];
  return entry;
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

  normalized.striker = Math.max(normalized.striker, oldAttack);
  normalized.prosperous = Math.max(normalized.prosperous, oldIncome);
  normalized.recruiter = Math.max(normalized.recruiter, oldIncome);
  normalized.guardian = Math.max(normalized.guardian, oldDefense);
  normalized.rusher = Math.max(normalized.rusher, oldSpeed);

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
  const savedPoints = Number(rawSkillPoints);
  if (Number.isFinite(savedPoints)) {
    character.skillPoints = Math.max(0, Math.floor(savedPoints));
    return;
  }

  const earnedPoints = Math.max(0, Math.floor(Number(character.level) || 1) - 1);
  character.skillPoints = Math.max(0, earnedPoints - getSpentSkillPoints(upgrades));
}

function getSpentSkillPoints(upgrades = state?.upgrades) {
  return SKILL_ORDER.reduce((total, key) => total + Math.max(0, Math.floor(Number(upgrades?.[key]) || 0)), 0);
}

function getXpRequiredForLevel(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
  return Math.floor(150 + current * 65 + Math.pow(current, 2.05) * 35);
}

function getLevelUpGoldReward(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
  return Math.floor(250 + current * 60 + Math.pow(current, 1.25) * 25);
}

function getLevelUpTroopReward(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
  return Math.floor(LEVEL_UP_TROOP_REWARD_BASE * Math.pow(LEVEL_UP_TROOP_REWARD_MULTIPLIER, current - 1));
}

function getMainRewardCity(excludeCityId = null) {
  const main = state?.mainCityId ? cityById(state.mainCityId) : null;
  if (main?.owner === "player" && main.id !== excludeCityId && !isStronghold(main)) return main;
  return playerRegularCities().find(city => city.id !== excludeCityId) || null;
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
  const base = getPlayableBaseCities().find(city => city.id === state.mainCityId);
  if (isStronghold(base)) return null;
  return base ? { ...base, owner: "player", isMainCity: true } : null;
}

function getMainCityRegionId() {
  return normalizeRegionId(state?.mainCityId ? getCityRegionId(state.mainCityId) : state?.online?.mainRegionId || getActiveOnlineRegionId());
}

function getMainCityChangeCooldownRemainingMs(now = Date.now()) {
  if (!state) return 0;
  const lastChangedAt = normalizeTimestampMs(state.mainCityChangedAtMs);
  if (!lastChangedAt) return 0;
  const currentTime = Math.max(0, Number(now) || Date.now());
  const elapsed = Math.max(0, currentTime - Math.min(lastChangedAt, currentTime));
  return Math.max(0, MAIN_CITY_CHANGE_COOLDOWN_MS - elapsed);
}

function getMainCityChangeStatus(city, now = Date.now()) {
  const cooldownMs = getMainCityChangeCooldownRemainingMs(now);
  const cooldownText = cooldownMs > 0 ? formatDuration(Math.ceil(cooldownMs / 1000)) : "";
  const ownedCount = state ? getAllOwnedRegularCitiesForDisplay().length : 0;
  const isMain = isMainCityForList(city);
  let reason = "";

  if (!state) reason = "Game is not ready.";
  else if (!city) reason = "City is not available.";
  else if (city.owner !== "player") reason = "Only owned cities can become your main city.";
  else if (isStronghold(city)) reason = "Strongholds cannot become your main city.";
  else if (isMain) reason = "This city is already your main city.";
  else if (ownedCount >= MAIN_CITY_CHANGE_CITY_LIMIT) reason = `You can only move your main city while you own fewer than ${MAIN_CITY_CHANGE_CITY_LIMIT} cities.`;
  else if (cooldownMs > 0) reason = `Main city can change again in ${cooldownText}.`;

  return {
    canChange: Boolean(state && city && city.owner === "player" && !isStronghold(city) && !isMain && ownedCount < MAIN_CITY_CHANGE_CITY_LIMIT && cooldownMs <= 0),
    cooldownMs,
    cooldownText,
    ownedCount,
    isMain,
    reason,
  };
}

function changeMainCity(cityId) {
  if (!state) return false;
  const city = cityById(cityId);
  const status = getMainCityChangeStatus(city);
  if (!status.canChange) {
    if (status.reason) showToast(status.reason);
    if (city) showCityInfoModal(city.id);
    return false;
  }

  const previousMain = getLoadedMainCity() || (state.mainCityId ? cityById(state.mainCityId) : null);
  state.cities.forEach(item => {
    item.isMainCity = item.id === city.id;
  });
  city.isMainCity = true;
  state.mainCityId = city.id;
  state.mainCityChangedAtMs = Date.now();

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
  }
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

function getLostDefenseXpAward(attackingTroops, target = null) {
  return getPartialBattleXpAward(getDefenseHeldXpAward(attackingTroops, target));
}

function getCaptureXpEfficiency(target, oldOwner = target?.owner) {
  if (!target || !state) return 1;
  const pvpMultiplier = getPvpOpponentPowerXpMultiplier(target, oldOwner, "player");
  const cooldownMultiplier = getCaptureCooldownRemaining(target) > 0 ? RECENT_CAPTURE_XP_MULTIPLIER : 1;
  if (pvpMultiplier !== null) return Number(clamp(pvpMultiplier * cooldownMultiplier, 0, 2).toFixed(2));

  const heroLevel = Math.max(1, Math.floor(Number(state.character?.level) || 1));
  const empirePressure = 48 + heroLevel * 20 + getAllOwnedRegularCitiesForDisplay().length * 2;
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
  if (isStronghold(target)) return null;
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

function capBattleXpForCurrentLevel(xp) {
  const base = Math.max(0, Math.floor(Number(xp) || 0));
  if (!state?.character) return base;
  const heroLevel = Math.max(1, Math.floor(Number(state.character.level) || 1));
  const cap = Math.max(250, Math.floor(getXpRequiredForLevel(heroLevel) * BATTLE_XP_LEVEL_REQUIREMENT_CAP_MULTIPLIER));
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

function getPresenceKingPowerByUid(uid) {
  const ownerUid = String(uid || "").trim();
  if (!ownerUid || !Array.isArray(onlinePresence)) return 0;
  const presence = onlinePresence.find(entry => entry?.uid === ownerUid);
  return normalizePowerValue(presence?.kingPower);
}

function getCityPowerFloor(city) {
  if (!city) return 0;
  const stats = getCityStats(city);
  const troopPower = Math.max(0, Math.floor(Number(city.troops) || 0)) * KING_POWER_PER_TROOP;
  const cityPower = Math.max(0, Math.floor(Number(stats.victoryPoints) || 0)) * KING_POWER_PER_CITY_VP;
  return troopPower + cityPower;
}

function getCityOwnerKingPowerSnapshot(city) {
  if (!city) return 0;
  const currentUid = getCurrentOnlineUid();
  if (city.owner === "player" && (!city.ownerUid || city.ownerUid === currentUid)) return getKingPower();
  const stored = normalizePowerValue(city.ownerKingPower);
  if (stored > 0) return stored;
  const presence = getPresenceKingPowerByUid(city.ownerUid);
  if (presence > 0) return presence;
  return getCityPowerFloor(city);
}

function getDemoAttackTier(powerRatio) {
  const ratio = Number(powerRatio) || 0;
  return DEMO_ATTACK_TIERS.find(tier => ratio >= tier.minRatio) || null;
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
  const defenderKingPower = Math.max(1, normalizePowerValue(overrides.defenderKingPower ?? getCityOwnerKingPowerSnapshot(target)));
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
  return Math.max(0, Math.floor(Number(state?.upgrades?.[skill]) || 0));
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
  return state.cities.find(city => city.owner === owner && isCrownCitadel(city)) || null;
}

function getControlledStrongholdGoldBonusPercent(owner = "player") {
  if (getControlledCrownCitadel(owner)) return CROWN_CITADEL_GOLD_BONUS_PERCENT;
  if (!state || !Array.isArray(state.cities)) return 0;
  return state.cities.reduce((total, city) => {
    if (city.owner !== owner || !isGoldStronghold(city)) return total;
    return total + getStrongholdBonusPercent(city);
  }, 0);
}

function getControlledStrongholdTroopBonusPercent(owner = "player") {
  if (getControlledCrownCitadel(owner)) return CROWN_CITADEL_TROOP_BONUS_PERCENT;
  if (!state || !Array.isArray(state.cities)) return 0;
  return state.cities.reduce((total, city) => {
    if (city.owner !== owner || !isTrainingStronghold(city)) return total;
    return total + getStrongholdBonusPercent(city);
  }, 0);
}

function getControlledStrongholdMarchSpeedPercent(owner = "player") {
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
  return state.cities.find(city => isCrownCitadel(city) && getCityControllerKey(city) === controllerKey) || null;
}

function getControlledStrongholdCityDefenseBonusPercentForCity(target) {
  if (!state || !Array.isArray(state.cities)) return 0;
  const targetControllerKey = getCityControllerKey(target);
  if (!targetControllerKey) return 0;
  if (getControlledCrownCitadelForControllerKey(targetControllerKey)) return CROWN_CITADEL_DEFENSE_BONUS_PERCENT;
  return state.cities.reduce((total, city) => {
    if (!isDefenseStronghold(city) || getCityControllerKey(city) !== targetControllerKey) return total;
    return total + getStrongholdBonusPercent(city);
  }, 0);
}

function getControlledStrongholdUpgradeCostReductionPercent(owner = "player") {
  return getControlledCrownCitadel(owner) ? CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT : 0;
}

function clampCityLevel(level) {
  return clamp(Math.floor(Number(level) || 1), 1, MAX_CITY_LEVEL);
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

function getCityStats(city) {
  const stronghold = isStronghold(city);
  const level = stronghold ? getStrongholdDefenseLevel(city) : clampCityLevel(city?.level);
  const step = level - 1;
  const victoryPoints = Math.floor(
    CITY_LEVEL_STATS.victoryPointsBase
    + level * CITY_LEVEL_STATS.victoryPointsPerLevel
    + Math.pow(level, CITY_LEVEL_STATS.victoryPointsExponent) * CITY_LEVEL_STATS.victoryPointsExponentScale
  );
  const defensePercent = level * CITY_LEVEL_STATS.defensePercentPerLevel;
  const cityWalls = CITY_LEVEL_STATS.cityWallsBase + step * CITY_LEVEL_STATS.cityWallsPerLevel;
  const guardianPercent = city?.owner === "player" ? getSkillPercent("guardian") : 0;
  const recruiterPercent = city?.owner === "player" ? getSkillPercent("recruiter") : 0;
  const prosperousPercent = city?.owner === "player" ? getSkillPercent("prosperous") : 0;
  const strongholdGoldBonusPercent = !stronghold && city?.owner === "player" ? getControlledStrongholdGoldBonusPercent("player") : 0;
  const strongholdTroopBonusPercent = !stronghold && city?.owner === "player" ? getControlledStrongholdTroopBonusPercent("player") : 0;
  const strongholdDefenseBonusPercent = !stronghold ? getControlledStrongholdCityDefenseBonusPercentForCity(city) : 0;
  const warDrumsTroopBonusPercent = !stronghold && city?.owner === "player" ? getWarDrumsTroopProductionBonusPercent() : 0;
  const baseTroopProductionPerHour = stronghold ? 0 : victoryPoints * CITY_LEVEL_STATS.troopProductionPerVictoryPoint;
  const recruiterBonusPerHour = stronghold ? 0 : victoryPoints * recruiterPercent / 100;
  const troopProductionPerHour = (baseTroopProductionPerHour + recruiterBonusPerHour)
    * (1 + strongholdTroopBonusPercent / 100)
    * (1 + warDrumsTroopBonusPercent / 100);
  const millionLordsProductionVp = getMillionLordsCityProductionVp(level);
  const rawGoldProductionPerHour = stronghold ? 0 : getMillionLordsPassiveGoldPerHour(level);
  const baseGoldProductionPerHour = rawGoldProductionPerHour;
  const goldProductionPerHour = baseGoldProductionPerHour * (1 + prosperousPercent / 100) * (1 + strongholdGoldBonusPercent / 100);
  const troopDefense = Math.floor((Number(city?.troops) || 0) * (1 + defensePercent / 100) * (1 + guardianPercent / 100));
  const baseTotalDefense = Math.floor(cityWalls + troopDefense);
  const strongholdDefenseBonus = Math.floor(baseTotalDefense * strongholdDefenseBonusPercent / 100);
  const totalDefense = baseTotalDefense + strongholdDefenseBonus;

  return {
    level,
    victoryPoints,
    cityPower: victoryPoints,
    defensePercent,
    cityWalls,
    guardianPercent,
    recruiterPercent,
    prosperousPercent,
    strongholdGoldBonusPercent,
    strongholdTroopBonusPercent,
    strongholdDefenseBonusPercent,
    strongholdDefenseBonus,
    warDrumsTroopBonusPercent,
    baseTroopProductionPerHour,
    recruiterBonusPerHour,
    troopProductionPerHour,
    millionLordsProductionVp,
    rawGoldProductionPerHour,
    baseGoldProductionPerHour,
    goldProductionPerHour,
    troopProductionPerSecond: troopProductionPerHour / 3600,
    goldProductionPerSecond: goldProductionPerHour / 3600,
    totalDefense,
  };
}

function getBattleDefensePower(city) {
  const stats = getCityStats(city);
  return stats.totalDefense;
}

function getAttackPower(troops, owner) {
  const ownerBoost = owner === "player" ? skillMultiplier("striker") : 1.04;
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
  const attackerBoost = attackOwner === "player" ? skillMultiplier("striker") : 1.04;
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

function grantKillGold(skill, killedTroops, reason) {
  const percent = getSkillPercent(skill);
  const killed = Math.max(0, Math.floor(Number(killedTroops) || 0));
  if (percent <= 0 || killed <= 0) return 0;
  const gold = Math.floor(killed * KILL_GOLD_BASE * percent / 100);
  if (gold <= 0) return 0;
  state.gold += gold;
  addLog(`${SKILL_CONFIG[skill].label}: recovered ${formatNumber(gold)} gold from ${reason}.`);
  return gold;
}

function grantCautiousRefund(city) {
  const percent = getSkillPercent("cautious");
  const invested = Math.max(0, Math.floor(Number(city?.investedGold) || 0));
  if (percent <= 0 || invested <= 0) return 0;
  const refund = Math.floor(invested * percent / 100);
  if (refund <= 0) return 0;
  state.gold += refund;
  addLog(`Cautious: refunded ${formatNumber(refund)} gold from lost investment in ${city.name}.`);
  return refund;
}

function currentLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDailyCaptureTracker(daily) {
  const today = currentLocalDateKey();
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
  if (!state) return { date: currentLocalDateKey(), neutralCaptures: 0, harvestedBonuses: 0, harvestedGoldBonuses: 0, harvestedTroopBonuses: 0 };
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
  snapshot.harvestNextBonusType = normalizeHarvestBonusType(snapshot.harvestNextBonusType);
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
  for (const [cityId, report] of Object.entries(reports)) {
    const troops = Math.max(0, Math.floor(Number(report?.troops) || 0));
    const totalDefense = Math.max(0, Math.floor(Number(report?.totalDefense) || 0));
    const scoutedAt = Math.max(0, Number(report?.scoutedAt) || 0);
    const expiresAt = Math.max(0, Number(report?.expiresAt) || 0);
    if (expiresAt <= scoutedAt) continue;
    normalized[cityId] = { ...report, troops, totalDefense, scoutedAt, expiresAt };
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
      const fallbackOutcome = type === "scout" ? "scout" : "defeat";
      const outcome = ["victory", "defeat", "held", "lost", "scout"].includes(report.outcome)
        ? report.outcome
        : fallbackOutcome;
      return {
        id: String(report.id || `report_${Math.random().toString(36).slice(2)}`),
        type,
        outcome,
        createdAt: Math.max(0, Number(report.createdAt) || 0),
        cityId: String(report.cityId || ""),
        cityName: String(report.cityName || "Unknown city").slice(0, 40),
        cityLevel: clampCityLevel(report.cityLevel || 1),
        troopCount: Math.max(0, Math.floor(Number(report.troopCount) || 0)),
        sentTroops: Math.max(0, Math.floor(Number(report.sentTroops) || 0)),
        survivors: Math.max(0, Math.floor(Number(report.survivors) || 0)),
        defendersLeft: Math.max(0, Math.floor(Number(report.defendersLeft) || 0)),
        attackerLosses: Math.max(0, Math.floor(Number(report.attackerLosses) || 0)),
        defenderLosses: Math.max(0, Math.floor(Number(report.defenderLosses) || 0)),
        totalDefense: Math.max(0, Math.floor(Number(report.totalDefense) || 0)),
        opponentName: String(report.opponentName || "").slice(0, 40),
        ownerName: String(report.ownerName || "").slice(0, 40),
        summary: String(report.summary || "").slice(0, 220),
      };
    })
    .filter(Boolean)
    .slice(-120);
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
  if (!canUseOnlineArmyOrders()) return null;
  const duration = travelTime(source, target, "player", route.length, 1, "scout");
  const mission = {
    id: attackIdCounter++,
    owner: "player",
    kind: "scout",
    fromId: source.id,
    toId: target.id,
    troops: 1,
    total: duration,
    remaining: duration,
    path: route.points,
    pathSegments: getRouteSegments(route, getCityRegionId(source)),
    pathLength: route.length,
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
  const candidates = playerCities()
    .filter(city => Math.floor(Number(city.troops) || 0) >= minimumTroops && city.id !== target.id)
    .map(city => ({ city, estimate: getRouteHeuristicDistance(city, target) }))
    .filter(option => Number.isFinite(option.estimate))
    .sort((a, b) => a.estimate - b.estimate);

  let checked = 0;
  for (const option of candidates) {
    if (checked >= maxRouteChecks) break;
    checked += 1;
    const route = findRoute(option.city, target);
    if (route?.points?.length) return { city: option.city, route };
  }
  return null;
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
    target.troopFloat = Math.max(0, Number(target.troopFloat) || target.troops || 0) + 1;
    target.troops = Math.floor(target.troopFloat);
    addLog(`The scout joined your garrison at ${target.name}.`);
    return;
  }
  state.scoutReports = normalizeScoutReports(state.scoutReports);
  const report = createScoutReportSnapshot(target);
  state.scoutReports[target.id] = report;
  addBattleReport({
    type: "scout",
    outcome: "scout",
    cityId: target.id,
    cityName: target.name,
    cityLevel: report.cityLevel,
    troopCount: report.troops,
    totalDefense: report.totalDefense,
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
  const cityAdjustedDefense = Math.floor(baseTroopDefense * (1 + stats.defensePercent / 100));
  const troopDefense = Math.floor(cityAdjustedDefense * (1 + stats.guardianPercent / 100));
  const ownerUsesPlayerSkills = target.owner === "player";
  const skillSnapshot = {};
  for (const skill of ["guardian", "brave", "cautious", "striker", "fearless", "scavenger"]) {
    const level = ownerUsesPlayerSkills ? getSkillLevel(skill) : 0;
    const config = SKILL_CONFIG[skill];
    const rawPercent = level * config.percentPerLevel;
    skillSnapshot[`${skill}Level`] = level;
    skillSnapshot[`${skill}Percent`] = Number.isFinite(config.maxPercent) ? Math.min(rawPercent, config.maxPercent) : rawPercent;
  }
  return {
    troops: baseTroopDefense,
    totalDefense: Math.floor(stats.totalDefense),
    owner: target.owner,
    ownerName: getCityOwnerDisplayName(target),
    cityLevel: stats.level,
    defensePercent: stats.defensePercent,
    cityWalls: stats.cityWalls,
    troopDefense,
    cityDefenseBonus: Math.max(0, cityAdjustedDefense - baseTroopDefense),
    guardianBonus: Math.max(0, troopDefense - cityAdjustedDefense),
    baseAttackPercent: target.owner === "enemy" ? 4 : 0,
    ...skillSnapshot,
    scoutedAt: state.gameSeconds,
    expiresAt: state.gameSeconds + SCOUT_REPORT_SECONDS,
  };
}

function getBattleReportOwnerName(city, owner = city?.owner) {
  if (owner === "player") return state?.playerName || "You";
  if (city?.ownerKind === "player" && city.ownerUid && city.ownerName) return city.ownerName;
  if (city?.ownerKind === "player" && city.ownerUid) return "Rival ruler";
  return OWNER[owner]?.label || "Unknown";
}

function addBattleReport(report) {
  if (!state) return;
  state.battleReports = normalizeBattleReports(state.battleReports);
  const entry = normalizeBattleReports([{
    id: `report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: state.gameSeconds,
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
    const target = cityById(attack.toId);
    if (isStronghold(target)) return false;
    return attack.targetOwnerAtLaunch === "neutral" || (!attack.targetOwnerAtLaunch && target?.owner === "neutral");
  }).length;
}

function neutralCaptureStatus(excludeAttackId = null) {
  const daily = ensureDailyCaptureTracker();
  const pending = pendingNeutralCaptureCount("player", excludeAttackId);
  const owned = getAllOwnedRegularCitiesForDisplay().length;
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

function hasMainCityRelocationApi() {
  const api = getOnlineApi();
  return Boolean(isOnlineWorldActive() && api?.isSignedIn?.() && api?.relocateMainCity && api?.ensureMainIsland);
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

function mergeServerReports(reports = []) {
  if (!state || !Array.isArray(reports) || !reports.length) return false;
  let changed = false;
  state.battleReports = normalizeBattleReports(state.battleReports);
  state.scoutReports = normalizeScoutReports(state.scoutReports);
  const existingIds = new Set(state.battleReports.map(report => report.id));
  for (const rawReport of reports) {
    const normalized = normalizeServerBattleReport(rawReport);
    if (!normalized || existingIds.has(normalized.id) || appliedServerReportIds.has(normalized.id)) continue;
    state.battleReports.push(normalized);
    existingIds.add(normalized.id);
    appliedServerReportIds.add(normalized.id);
    if (rawReport.type === "scout" && rawReport.cityId && rawReport.scoutReport) {
      const scoutReport = normalizeServerScoutReport(rawReport.scoutReport);
      if (scoutReport) state.scoutReports[rawReport.cityId] = scoutReport;
    }
    if (rawReport.characterAfter || Number.isFinite(Number(rawReport.goldAfter))) {
      applyServerProfilePatch({
        character: rawReport.characterAfter,
        gold: rawReport.goldAfter,
      });
    }
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

function applyServerProfilePatch(patch = null) {
  if (!state || !patch || typeof patch !== "object") return false;
  let changed = false;
  if (patch.character) {
    state.character = normalizeCharacterProgress(patch.character);
    syncCharacterSkillPoints(state.character, state.upgrades, patch.character?.skillPoints);
    changed = true;
  }
  if (Number.isFinite(Number(patch.gold))) {
    state.gold = Math.max(0, Math.floor(Number(patch.gold) || 0));
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
  if (changed) {
    saveGame();
    renderHud();
    if (profileScreen?.classList.contains("open")) renderProfileScreen();
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
      city.ownerKind = ownerUid ? "player" : "neutral";
      city.ownerUid = ownerUid || null;
      city.owner = ownerUid && currentUid && ownerUid === currentUid ? "player" : ownerUid ? "enemy" : "neutral";
      city.ownerName = update.ownerName || "";
      city.ownerFlag = update.ownerFlag || null;
      city.ownerKingPower = normalizePowerValue(update.ownerKingPower);
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
  if (changed) renderAll();
  return changed || cacheChanged;
}

function applyServerArmyResult(result = null) {
  if (!result || typeof result !== "object") return false;
  let changed = false;
  if (Array.isArray(result.reports)) changed = mergeServerReports(result.reports) || changed;
  if (Array.isArray(result.cityUpdates)) changed = applyServerCityUpdates(result.cityUpdates) || changed;
  if (result.currentUser) changed = applyServerProfilePatch(result.currentUser) || changed;
  return changed;
}

function applyServerEconomyResult(result = null, options = {}) {
  if (!result || typeof result !== "object") return false;
  let changed = false;
  if (result.currentUser) changed = applyServerProfilePatch(result.currentUser) || changed;
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
    saveGame();
    renderHud();
    renderCities(true);
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
    cityCount: state ? getAllOwnedRegularCitiesForDisplay().length : 0,
    kingPower: state ? getKingPower() : 0,
    gold: state ? Math.floor(Number(state.gold) || 0) : 0,
    daily: state ? normalizeDailyCaptureTracker(state.daily) : normalizeDailyCaptureTracker(null),
    harvestBonuses: state ? normalizeHarvestBonuses(state.harvestBonuses) : [],
    harvestSpawnTimer: Number.isFinite(harvestTimer)
      ? clamp(harvestTimer, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS)
      : HARVEST_BONUS_INITIAL_SPAWN_SECONDS,
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
    ["gold", "goldFloat", "shopItems", "itemEffects", "itemPurchaseCooldowns", "economyUpdatedAtMs"].forEach(key => {
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
  state.harvestNextBonusType = normalizeHarvestBonusType(profile.harvestNextBonusType);
  state.scoutReports = normalizeScoutReports(profile.scoutReports);
  state.battleReports = normalizeBattleReports(profile.battleReports);
  state.marchPercent = normalizeMarchPercent(profile.marchPercent);
  selectedMarchPercent = state.marchPercent;
  lastSelectedOwnedCityId = getKnownCityId(profile.lastSelectedOwnedCityId) || lastSelectedOwnedCityId;
  state.mainCityChangedAtMs = normalizeTimestampMs(profile.mainCityChangedAtMs);
  state.gameSeconds = Math.max(0, Number(profile.localGameSeconds) || Number(profile.gameSeconds) || Number(state.gameSeconds) || 0);
  state.lastRealTimeMs = normalizeTimestampMs(profile.lastRealTimeMs) || state.lastRealTimeMs;
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
      const base = getPlayableBaseCities().find(city => city.id === id) || {};
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
        size: isStronghold(city) || isStronghold(base) ? getStrongholdVisualSize({ size: city.size ?? base.size }) : undefined,
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
    await api.savePlayerProfile(stripServerEconomyProfileFields(cloudState));
    if (typeof api.saveGameSnapshot === "function") {
      await api.saveGameSnapshot(cloudState, ONLINE_SAVE_SLOT);
    }
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
  return {
    displayName: state?.playerName || getOnlineApi()?.getUser?.()?.displayName || "Ruler",
    playerName: state?.playerName || "Ruler",
    flag: state?.flag || createDefaultFlag(),
    mainCityId: state?.mainCityId || "",
    mainRegionId,
    mainIslandId: state?.online?.mainIslandId || getOnlineIslandId(mainRegionId),
    cityCount: state ? getAllOwnedRegularCitiesForDisplay().length : 0,
    kingPower: state ? getKingPower() : 0,
    updatedAtMs: Date.now(),
  };
}

function getKingPowerLeaderboardSnapshot() {
  const mainRegionId = state?.online?.mainRegionId || (state?.mainCityId ? getCityRegionId(state.mainCityId) : getActiveOnlineRegionId());
  return {
    displayName: state?.playerName || getOnlineApi()?.getUser?.()?.displayName || "Ruler",
    playerName: state?.playerName || "Ruler",
    flag: state?.flag || createDefaultFlag(),
    kingPower: getKingPower(),
    cityCount: state ? getAllOwnedRegularCitiesForDisplay().length : 0,
    mainCityId: state?.mainCityId || "",
    mainRegionId,
    mainIslandId: state?.online?.mainIslandId || getOnlineIslandId(mainRegionId),
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
  const api = getOnlineApi();
  if (!api?.saveKingPowerLeaderboardEntry || !api?.isSignedIn?.()) return false;
  const entry = getKingPowerLeaderboardSnapshot();
  const signature = getLeaderboardEntrySignature(entry);
  const needsStaleRefresh = Date.now() - leaderboardLastSaveAt >= LEADERBOARD_STALE_REFRESH_MS;
  if (!force && signature === leaderboardLastSignature && !needsStaleRefresh) return false;

  leaderboardSaveInFlight = true;
  try {
    await api.saveKingPowerLeaderboardEntry(entry);
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
    updatedAtMs: Math.max(0, Number(raw.updatedAtMs) || 0),
  };
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

function getIslandOwnedCityCount(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  const cachedCount = getAllOwnedRegularCitiesForDisplay()
    .filter(city => getCityRegionId(city) === targetRegionId).length;
  if (cachedCount > 0 || onlineOwnedCitiesCache.length) return cachedCount;
  return state ? playerRegularCities().filter(city => getCityRegionId(city) === targetRegionId).length : 0;
}

function getIslandSwitcherSummary(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  const summary = getIslandOccupancySummary(targetRegionId);
  const ownedCount = summary
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
  renderIslandSwitcherModalContent();
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
    if (modal.open && modal.classList.contains("island-switcher-modal")) renderIslandSwitcherModalContent();
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
  return `--island-grid-stage-w:${Math.round(layout.stageWidth)}px;--island-grid-stage-h:${Math.round(layout.stageHeight)}px;--island-grid-cell-w:${ISLAND_PICKER_TILE_WIDTH + ISLAND_PICKER_TILE_GAP}px;--island-grid-cell-h:${ISLAND_PICKER_TILE_HEIGHT + ISLAND_PICKER_TILE_GAP}px;`;
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
  const previewSrc = getIslandMapArtSrc(regionId) || getIslandPreviewArtSrc(regionId);
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
  modalBody.innerHTML = `
    <div class="island-map-picker" style="${getIslandMapPickerStyle()}" aria-label="Island map picker">
      <div class="island-map-stage">
        <div class="island-map-canvas">
          ${renderIslandMapConnections()}
          ${WORLD_REGIONS.map(region => renderIslandMapTile(region, activeRegionId, homeRegionId)).join("")}
        </div>
      </div>
    </div>
  `;
  if (!modal.open) modal.showModal();
  const picker = modalBody.querySelector(".island-map-picker");
  attachIslandMapPickerPan(picker);
  centerIslandMapPickerOnRegion(picker, activeRegionId || homeRegionId);
  modalBody.querySelectorAll("[data-island-region]").forEach(button => {
    button.addEventListener("click", () => {
      if (picker?.dataset.justDragged === "true" || picker?.dataset.justActivated === "true") return;
      switchOnlineIsland(button.dataset.islandRegion, { fromMapPicker: true });
    });
  });
}

function centerIslandMapPickerOnRegion(picker, regionId) {
  if (!picker || !regionId) return;
  requestAnimationFrame(() => {
    const target = [...picker.querySelectorAll("[data-island-region]")]
      .find(button => button.dataset.islandRegion === regionId);
    if (!target) return;
    picker.scrollLeft = target.offsetLeft + target.offsetWidth / 2 - picker.clientWidth / 2;
    picker.scrollTop = target.offsetTop + target.offsetHeight / 2 - picker.clientHeight / 2;
  });
}

function attachIslandMapPickerPan(picker) {
  if (!picker || picker.dataset.panReady === "true") return;
  picker.dataset.panReady = "true";
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let moved = false;
  let tapRegionId = "";

  picker.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;
    const tile = event.target?.closest?.("[data-island-region]");
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = picker.scrollLeft;
    startScrollTop = picker.scrollTop;
    moved = false;
    tapRegionId = tile?.dataset?.islandRegion || "";
    picker.classList.add("panning");
    picker.setPointerCapture?.(event.pointerId);
  });

  picker.addEventListener("pointermove", event => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    if (moved) event.preventDefault();
    picker.scrollLeft = startScrollLeft - dx;
    picker.scrollTop = startScrollTop - dy;
  });

  const stopPan = event => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    picker.classList.remove("panning");
    picker.releasePointerCapture?.(event.pointerId);
    if (moved) {
      picker.dataset.justDragged = "true";
      window.setTimeout(() => {
        if (picker) delete picker.dataset.justDragged;
      }, 120);
    } else if (tapRegionId) {
      const releasedTile = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-island-region]");
      if (releasedTile?.dataset?.islandRegion === tapRegionId) {
        picker.dataset.justActivated = "true";
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
  refreshOnlineIslandSummaries();
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
    centerOnRegion(targetRegionId);
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
    clearOnlineArmyWatchers();
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

function updateOnlineUi() {
  const api = getOnlineApi();
  updateOnlinePlayersUi();
  updateIslandSwitcherUi();
  if (!onlineStatusText || !onlineStatusDetail) return;

  if (!api) {
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

  if (signedIn) {
    onlineStatusText.textContent = user?.displayName ? `Signed in: ${user.displayName}` : "Signed in";
    if (onlineLastError) {
      onlineStatusDetail.textContent = `Online waiting: ${onlineLastError}`;
    } else if (usesServerEconomyAuthority() && serverEconomyLastSyncAt) {
      onlineStatusDetail.textContent = `Online ready. Server economy synced ${new Date(serverEconomyLastSyncAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    } else if (onlineLastSaveAt) {
      onlineStatusDetail.textContent = `Online ready. Last synced ${new Date(onlineLastSaveAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Press Enter Kingdom.`;
    } else {
      onlineStatusDetail.textContent = "Online ready. Press Enter Kingdom to join the game.";
    }
    if (googleSignInBtn) googleSignInBtn.hidden = true;
    if (enterKingdomBtn) {
      enterKingdomBtn.hidden = false;
      enterKingdomBtn.disabled = false;
    }
    if (googleSignOutBtn) {
      googleSignOutBtn.hidden = false;
      googleSignOutBtn.disabled = false;
    }
    return;
  }

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
    if (googleSignInBtn) googleSignInBtn.disabled = true;
    await api.signInWithGoogle();
    onlineLastError = "";
    updateOnlineUi();
    if (state) {
      queueOnlineSave();
      await flushOnlineSave(true);
    }
    showToast("Google connected. Press Enter Kingdom to play.");
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

function getCurrentOnlineUid() {
  return getOnlineApi()?.getUser?.()?.uid || "";
}

function isOnlineWorldActive() {
  return Boolean(state?.online?.islandId && getOnlineApi()?.isSignedIn?.());
}

function disconnectOnlineWorld() {
  if (typeof onlineIslandUnsubscribe === "function") onlineIslandUnsubscribe();
  onlineIslandUnsubscribe = null;
  clearOnlineArmyWatchers();
  clearOnlineServerReportWatcher();
  appliedServerReportIds = new Set();
  onlinePresence = [];
  onlineIslandSummaries = new Map();
  onlineIslandSummaryRefreshInFlight = false;
  onlineOwnedCitiesCache = [];
  onlineOwnedCitiesCacheAt = 0;
  onlineOwnedCitiesCacheComplete = false;
  onlineOwnedCitiesRefreshInFlight = false;
  onlinePresenceTimer = 0;
  onlinePresenceInFlight = false;
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
  if (updateRefreshInProgress || updateCheckInFlight || !api?.isSignedIn?.()) return false;
  if (!force && document.visibilityState === "hidden") return false;
  updateCheckInFlight = true;
  try {
    const deployedBuildId = await fetchDeployedBuildId();
    if (!deployedBuildId || deployedBuildId === APP_BUILD_ID) return false;
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
  if (updateRefreshInProgress) return;
  updateCheckTimer += dt;
  if (updateCheckTimer < UPDATE_CHECK_INTERVAL_SECONDS) return;
  updateCheckTimer = 0;
  checkForDeployedUpdate();
}

async function handleDeployedUpdate(deployedBuildId) {
  if (updateRefreshInProgress) return;
  updateRefreshInProgress = true;
  showToast("New update detected. Relogging...");
  if (onlineStatusDetail) onlineStatusDetail.textContent = "New update detected. Relog required.";
  setSetupLoading(true, "New update detected. Relogging...");
  if (modal.open) modal.close();

  try {
    await waitForPendingOnlineWrites(5000);
  } catch (error) {
    console.warn("Continuing update reload while online writes are still pending", error);
  }

  try {
    await flushOnlineSave(true);
  } catch (error) {
    console.warn("Could not finish cloud save before update reload", error);
  }

  const api = getOnlineApi();
  try {
    disconnectOnlineWorld();
    if (api?.isSignedIn?.() && api?.signOut) await api.signOut();
  } catch (error) {
    console.warn("Could not sign out before update reload", error);
  }

  window.setTimeout(() => {
    window.location.reload();
  }, 700);
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

async function subscribeOnlineIslandWithInitialCities(api, islandId, handlers = {}, timeoutMs = 9000, timeoutMessage = "City list is taking too long.") {
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
  let profileLoadFailed = false;
  try {
    if (api.loadPlayerProfile) {
      profile = await withTimeout(api.loadPlayerProfile(), 5000, "Player profile lookup is taking too long.");
    }
  } catch (error) {
    profileLoadFailed = true;
    console.warn("Could not load online profile before island setup", error);
  }
  try {
    if (api.loadGameSnapshot) {
      cloudSnapshot = await withTimeout(api.loadGameSnapshot(ONLINE_SAVE_SLOT), 5000, "Cloud player state lookup is taking too long.");
    }
  } catch (error) {
    console.warn("Could not load cloud player state before island setup", error);
  }
  if (profileLoadFailed && requireOnlineProfile) {
    console.warn("Continuing online setup without the player profile.");
  }
  profile = mergeOnlineProfileSources(profile, cloudSnapshot);

  const hasCurrentProfile = Boolean(profile);
  if (hasCurrentProfile) applyOnlineProfileSnapshot(profile, state.playerName);
  if (hasCurrentProfile) await prepareOfflineProgressFromProfile(profile);
  const homeRegionId = await resolveHomeRegionIdForSetup(profile, { trustLocalState: hasCurrentProfile });
  const activeRegionId = homeRegionId;
  const mainIslandId = getOnlineIslandId(homeRegionId);
  const mainCityId = getKnownCityId(profile?.mainCityId)
    || (hasCurrentProfile ? getKnownCityId(state.online?.mainCityId) : "")
    || (hasCurrentProfile ? getKnownCityId(state.mainCityId) : "")
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

  return connectOnlineIsland(activeRegionId, {
    claimHome: activeRegionId === homeRegionId,
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
    const seed = createOnlineIslandSeed(targetRegionId);
    onlineStatusDetail.textContent = `Preparing ${getRegionLabel(targetRegionId)} (${seed.cities.length} city slots)...`;
    const islandSetupPromise = api.ensureMainIsland
      ? withTimeout(api.ensureMainIsland({
        islandId,
        cities: seed.cities,
        meta: {
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
        },
      }), claimHome ? 20000 : 10000, `${getRegionLabel(targetRegionId)} setup is taking too long.`)
      : Promise.resolve(false);

    if (claimHome) {
      await islandSetupPromise;
    } else {
      islandSetupPromise.catch(error => {
        onlineLastError = error?.message || String(error);
        updateOnlineUi();
        console.warn(`${getRegionLabel(targetRegionId)} background setup is still pending`, error);
      });
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
      }), 12000, "Starting city claim is taking too long.");

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
      if (claim?.repairedMainCity) addLog(`${cityById(claim.cityId)?.name || "Your main city"} was restored. Main cities cannot be attacked.`);
      else if (claim?.alreadyClaimed) addLog(`Online ${getRegionLabel(targetRegionId)} connected. Your claimed city was restored.`);
      else if (claim?.cityId) addLog(`Online ${getRegionLabel(targetRegionId)} connected. ${cityById(claim.cityId)?.name || "A city"} joined your kingdom.`);
    }

    if (onlineIslandUnsubscribe) onlineIslandUnsubscribe();
    onlineIslandUnsubscribe = null;
    clearOnlineArmyWatchers();
    onlinePresence = [];
    state.attacks = state.attacks.filter(attack => getKnownCityId(attack.fromId) && getKnownCityId(attack.toId));

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
      if (firstCitiesSnapshot && usesServerEconomyAuthority()) {
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
      if (render) renderAll();
      onlineFreshClaimCityId = "";
    };

    onlineStatusDetail.textContent = `Opening ${getRegionLabel(targetRegionId)}...`;
    onlineIslandUnsubscribe = await subscribeOnlineIslandWithInitialCities(api, islandId, {
      onCities: onlineCities => {
        applyOnlineCityPayload(onlineCities);
      },
      onArmies: armies => {
        applyOnlineArmies(armies, islandId);
        renderPaths();
        renderCities(true);
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
    }, 9000, `${getRegionLabel(targetRegionId)} city list is taking too long.`);

    onlineWorldConnected = true;
    onlineLastError = "";
    subscribeOnlineArmyWatchers(islandId);
    subscribeOnlineServerReports();
    loadServerReportsOnce();
    await recoverPendingOnlineArmyMovements();
    await publishOnlinePresence(true);
    refreshAllOwnedCities(true);
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

  state.cities = getPlayableBaseCities().map(base => {
    const isActiveRegionCity = getCityRegionId(base) === activeRegionId;
    if (!isActiveRegionCity) {
      const current = localById.get(base.id);
      if (!current) {
        const troopFallback = getCityTroopFallback(base);
        return {
          ...base,
          owner: "neutral",
          ownerKind: "neutral",
          ownerUid: null,
          ownerName: "",
          ownerFlag: null,
          ownerKingPower: 0,
          ownerShieldExpiresAtMs: 0,
          level: clampCityLevel(base.level),
          troops: readCityTroops(base.troops, troopFallback),
          troopFloat: readCityTroopFloat(base.troopFloat ?? base.troops, troopFallback),
          defense: 1,
          investedGold: 0,
          lastCapturedAt: null,
          isMainCity: !isStronghold(base) && base.id === state.mainCityId,
          relinquishedAtMs: 0,
          relocatedAtMs: 0,
          startPool: base.startPool,
          regionId: base.regionId,
        };
      }
      const currentOwnership = getCityRecordOwnership(current, currentUid, { allowLocalPlayerFallback: true });
      const troopFallback = getCityTroopFallback(base, currentOwnership);
      return {
        ...base,
        name: getCanonicalCityName(base, current),
        owner: currentOwnership.owner,
        ownerKind: currentOwnership.ownerKind,
        ownerUid: currentOwnership.ownerUid,
        ownerName: currentOwnership.ownerName,
        ownerFlag: currentOwnership.ownerFlag,
        ownerKingPower: currentOwnership.ownerKingPower,
        ownerShieldExpiresAtMs: currentOwnership.ownerShieldExpiresAtMs,
        level: isStronghold(base) ? getStrongholdDefenseLevel(base) : clampCityLevel(current.level ?? base.level),
        troops: readCityTroops(current.troops, troopFallback),
        troopFloat: readCityTroopFloat(current.troopFloat ?? current.troops, troopFallback),
        defense: 1,
        investedGold: isStronghold(base) ? 0 : Math.max(0, Math.floor(Number(current.investedGold) || 0)),
        lastCapturedAt: current.lastCapturedAt ?? null,
        isMainCity: !isStronghold(base) && (currentOwnership.owner === "player" ? base.id === state.mainCityId : Boolean(current.isMainCity)),
        relinquishedAtMs: currentOwnership.owner === "player" ? 0 : timestampToMs(current.relinquishedAtMs),
        relocatedAtMs: currentOwnership.owner === "player" ? 0 : timestampToMs(current.relocatedAtMs),
        startPool: base.startPool,
        regionId: base.regionId,
      };
    }
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
      ownerKingPower: keepLocalPlayerCity ? getKingPower() : ownerKingPower,
      ownerShieldExpiresAtMs: isStronghold(base) ? 0 : (keepLocalPlayerCity || localOwner === "player") ? getActivePeaceShieldExpiresAtMs() : ownerShieldExpiresAtMs,
      level: isStronghold(base) ? getStrongholdDefenseLevel(base) : clampCityLevel(keepLocalPlayerCity ? current.level ?? online.level ?? base.level : online.level ?? current.level ?? base.level),
      troops: readCityTroops(keepLocalPlayerCity ? current.troops ?? online.troops : online.troops ?? current.troops, troopFallback),
      troopFloat: readCityTroopFloat(keepLocalPlayerCity ? current.troopFloat ?? current.troops ?? online.troopFloat ?? online.troops : online.troopFloat ?? current.troopFloat ?? online.troops ?? current.troops, troopFallback),
      defense: 1,
      investedGold: isStronghold(base) ? 0 : Math.max(0, Math.floor(Number(keepLocalPlayerCity ? current.investedGold ?? online.investedGold : online.investedGold ?? current.investedGold) || 0)),
      lastCapturedAt: keepLocalPlayerCity ? current.lastCapturedAt ?? online.lastCapturedAt ?? null : online.lastCapturedAt ?? current.lastCapturedAt ?? null,
      isMainCity: !isStronghold(base) && (localOwner === "player" ? base.id === state.mainCityId : Boolean(online.isMainCity || current.isMainCity)),
      relinquishedAtMs: keepLocalPlayerCity || normalizedOwnerKind === "player" ? 0 : timestampToMs(online.relinquishedAtMs ?? current.relinquishedAtMs),
      relocatedAtMs: keepLocalPlayerCity || normalizedOwnerKind === "player" ? 0 : timestampToMs(online.relocatedAtMs ?? current.relocatedAtMs),
      startPool: base.startPool,
      regionId: base.regionId,
    };
  });
  state.activeRegionId = activeRegionId;
  if (state.online) {
    state.online.activeRegionId = activeRegionId;
    state.online.islandId = getOnlineIslandId(activeRegionId);
  }
  cacheIslandOccupancySummary(activeRegionId);
  onlineOwnedCitiesCache = onlineOwnedCitiesCache.filter(city => getCityRegionId(city) !== activeRegionId);
  mergeOwnedCitySnapshots(playerCities()
    .filter(city => getCityRegionId(city) === activeRegionId)
    .map(city => ({
      ...city,
      islandId: getOnlineIslandId(activeRegionId),
    })));
  ensureLoadedMainCityForRegion(activeRegionId);
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
    return {
      owner: ownerUid === currentUid ? "player" : "enemy",
      ownerKind: "player",
      ownerUid,
      ownerName: record.ownerName || "",
      ownerFlag: record.ownerFlag || null,
      ownerKingPower: normalizePowerValue(record.ownerKingPower),
      ownerShieldExpiresAtMs: normalizeTimestampMs(record.ownerShieldExpiresAtMs),
      hasPlayerOwner: true,
    };
  }

  if (allowLocalPlayerFallback && record.owner === "player" && (!record.ownerUid || record.ownerUid === currentUid)) {
    return {
      owner: "player",
      ownerKind: "player",
      ownerUid: currentUid || record.ownerUid || null,
      ownerName: record.ownerName || state?.playerName || "",
      ownerFlag: record.ownerFlag || state?.flag || null,
      ownerKingPower: normalizePowerValue(record.ownerKingPower) || getKingPower(),
      ownerShieldExpiresAtMs: getActivePeaceShieldExpiresAtMs(),
      hasPlayerOwner: Boolean(currentUid || record.ownerUid),
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
  const ownerName = hasPlayerOwner
    ? city.owner === "player" ? state.playerName : city.ownerName || ""
    : "";
  const ownerFlag = hasPlayerOwner
    ? city.owner === "player" ? state.flag : city.ownerFlag || null
    : null;
  const ownerKingPower = hasPlayerOwner
    ? city.owner === "player" ? getKingPower() : normalizePowerValue(city.ownerKingPower)
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
  return points
    .map(point => ({
      x: Number(point?.x),
      y: Number(point?.y),
    }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function normalizeArmyPathSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments
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
  const to = cityById(mission?.toId);
  const fromRegionId = from ? getCityRegionId(from) : (getKnownCityId(mission?.fromId) ? getCityRegionId(mission.fromId) : "");
  const toRegionId = to ? getCityRegionId(to) : (getKnownCityId(mission?.toId) ? getCityRegionId(mission.toId) : "");
  const points = normalizeArmyPath(mission?.path);
  if (points.length >= 2 && fromRegionId === toRegionId) {
    return [{ regionId: fromRegionId, points, length: Math.max(0, Number(mission?.pathLength) || routeLength(points)) }];
  }
  return [];
}

function getMissionRegionIds(mission) {
  const ids = getMissionRouteSegments(mission).map(segment => segment.regionId);
  const fromRegionId = getKnownCityId(mission?.fromId) ? getCityRegionId(mission.fromId) : "";
  const toRegionId = getKnownCityId(mission?.toId) ? getCityRegionId(mission.toId) : "";
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
  return mission;
}

function toOnlineArmyMovement(mission) {
  const onlineId = mission?.onlineId || "";
  if (!mission || !onlineId) return null;
  const from = cityById(mission.fromId);
  const to = cityById(mission.toId);
  const pathSegments = getMissionRouteSegments(mission);
  return {
    id: onlineId,
    ownerKind: "player",
    ownerUid: mission.ownerUid || getCurrentOnlineUid(),
    ownerName: mission.ownerName || state.playerName,
    ownerFlag: mission.ownerFlag || state.flag,
    ownerKingPower: normalizePowerValue(mission.ownerKingPower) || getKingPower(),
    kind: mission.kind || "attack",
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
  mission.onlineId = movement.id || mission.onlineId;
  if (["attack", "transfer", "scout"].includes(movementKind)) mission.kind = movementKind;
  mission.troops = Math.max(0, Math.floor(Number(movement.troops) || mission.troops || 0));
  mission.requestedTroops = Math.max(0, Math.floor(Number(movement.requestedTroops) || mission.requestedTroops || mission.troops || 0));
  mission.total = Math.max(0.1, Number(movement.total) || mission.total || 0.1);
  mission.remaining = Math.max(0, (Number(movement.arrivesAtMs) - Date.now()) / 1000) || mission.total;
  mission.launchedAtMs = normalizeTimestampMs(movement.launchedAtMs) || mission.launchedAtMs;
  mission.arrivesAtMs = normalizeTimestampMs(movement.arrivesAtMs) || mission.arrivesAtMs;
  mission.attackerKingPower = normalizePowerValue(movement.attackerKingPower || mission.attackerKingPower);
  mission.defenderKingPower = normalizePowerValue(movement.defenderKingPower || mission.defenderKingPower);
  if (movement.demoAttack !== undefined) mission.demoAttack = normalizeDemoAttackSnapshot(movement.demoAttack);
  mission.onlineRegionIds = Array.isArray(movement.routeRegionIds) ? movement.routeRegionIds.map(normalizeRegionId).filter(Boolean) : mission.onlineRegionIds;
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
  const targetRegionId = getCityRegionId(mission.toId);

  const savePromise = api.sendArmyOrder({
    worldId: ONLINE_WORLD_ID,
    resetGeneration: RESET_GENERATION,
    army: {
      ...movement,
      sourceRegionId,
      targetRegionId,
    },
    sourceRegionId,
    targetRegionId,
    routeRegionIds: regionIds,
  })
    .then(result => {
      if (result?.movement) applyServerMovementToMission(mission, result.movement);
      applyServerArmyResult({
        currentUser: result?.currentUser,
        cityUpdates: result?.sourceCity ? [result.sourceCity] : [],
      });
      if (options.addLocalMissionOnAccept) addServerAcceptedMission(mission);
      onlineLastError = "";
      saveGame();
      renderAll();
      updateIncomingAttackUi();
      updateOutgoingAttackUi();
      return true;
    })
    .catch(error => {
      onlineLastError = error?.message || String(error);
      console.warn("Server rejected army movement", error);
      rejectServerArmyMission(mission, onlineLastError, options);
      return false;
    })
    .finally(() => {
      onlineArmySavePromises.delete(savePromise);
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
  return {
    id,
    onlineId: id,
    owner: resolveOnlineArmyOwner(raw),
    ownerKind: ownerUid ? "player" : "neutral",
    ownerUid,
    ownerName: raw.ownerName || "",
    ownerFlag: raw.ownerFlag || null,
    ownerKingPower: normalizePowerValue(raw.ownerKingPower),
    kind: ["attack", "transfer", "scout"].includes(raw.kind) ? raw.kind : "attack",
    fromId: raw.fromId || "",
    toId: raw.toId || "",
    troops: Math.max(0, Math.floor(Number(raw.troops) || 0)),
    total,
    remaining: Math.max(0, (arrivesAtMs - Date.now()) / 1000),
    path,
    pathSegments,
    pathLength: Math.max(0, Number(raw.pathLength) || pathSegments.reduce((total, segment) => total + segment.length, 0) || routeLength(path)),
    targetOwnerAtLaunch: raw.targetOwnerAtLaunch || "neutral",
    requestedTroops: Math.max(0, Math.floor(Number(raw.requestedTroops) || 0)),
    attackerKingPower: normalizePowerValue(raw.attackerKingPower || raw.ownerKingPower),
    defenderKingPower: normalizePowerValue(raw.defenderKingPower),
    demoAttack: normalizeDemoAttackSnapshot(raw.demoAttack),
    launchedAtMs,
    arrivesAtMs,
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
}

function clearOnlineServerReportWatcher() {
  if (typeof onlineServerReportsUnsubscribe === "function") onlineServerReportsUnsubscribe();
  onlineServerReportsUnsubscribe = null;
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
  clearOnlineServerReportWatcher();
  if (!state || !api?.subscribeServerReports || !api?.isSignedIn?.()) return;
  onlineServerReportsUnsubscribe = api.subscribeServerReports({
    onReports: reports => {
      mergeServerReports(reports);
    },
    onError: error => {
      onlineLastError = error?.message || String(error);
      console.warn("Could not subscribe to server reports", error);
    },
  });
}

function subscribeOnlineArmyWatchers(activeIslandId) {
  const api = getOnlineApi();
  if (!api?.subscribeIsland || !isOnlineWorldActive()) return;
  const activeId = String(activeIslandId || getActiveOnlineIslandId());
  const activeArmies = onlineArmiesByIsland.get(activeId) || [];
  clearOnlineArmyWatchers();
  if (activeArmies.length) {
    onlineArmiesByIsland.set(activeId, activeArmies);
    rebuildOnlineArmies();
  }
  const islandIds = [...new Set(getRegionIds().map(getOnlineIslandId).filter(Boolean))]
    .filter(islandId => islandId !== activeId);

  islandIds.forEach(islandId => {
    const unsubscribe = api.subscribeIsland(islandId, {
      onArmies: armies => {
        applyOnlineArmies(armies, islandId);
        renderPaths();
        renderCities(true);
        renderArmies();
        updateIncomingAttackUi();
        updateOutgoingAttackUi();
      },
    });
    if (typeof unsubscribe === "function") onlineArmyUnsubscribes.push(unsubscribe);
  });
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
    fromId: army.fromId,
    toId: army.toId,
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
    9000,
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
    if (result?.status === "resolved" || result?.status === "missing" || result?.status === "already-resolved") {
      resolvedOnlineArmyIds.add(onlineId);
    }
    applyServerArmyResult(result);
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
  const localOnlineIds = new Set(state.attacks.map(attack => attack.onlineId).filter(Boolean));
  for (const army of onlineArmies) {
    if (army.ownerUid !== uid || localOnlineIds.has(army.id) || isOnlineArmyResolutionBlocked(army)) continue;
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
  const localOnlineIds = new Set();
  const localArmies = state.attacks.map(attack => {
    if (attack.onlineId) localOnlineIds.add(attack.onlineId);
    return attack;
  });
  const remoteArmies = onlineArmies
    .filter(isOnlineArmyVisible)
    .filter(army => !(army.ownerUid === getCurrentOnlineUid() && localOnlineIds.has(army.id)))
    .map(army => ({
      ...army,
      owner: resolveOnlineArmyOwner(army),
      remaining: Math.max(0, getOnlineArmyRemainingSeconds(army)),
    }));
  return [...localArmies, ...remoteArmies];
}

function getIncomingAttacks() {
  if (!state) return [];
  const seen = new Set();
  return getRenderableArmies()
    .map(attack => {
      if (!attack || !["attack", "scout"].includes(attack.kind) || attack.owner === "player") return null;
      const target = cityById(attack.toId);
      if (!target || target.owner !== "player") return null;
      const remaining = Math.max(0, Number(attack.remaining) || 0);
      if (remaining <= 0) return null;
      const key = String(attack.onlineId || attack.id || `${attack.fromId}:${attack.toId}:${attack.launchedAtMs || ""}`);
      if (seen.has(key)) return null;
      seen.add(key);
      const source = cityById(attack.fromId);
      return {
        ...attack,
        key,
        target,
        source,
        remaining,
        attackerName: attack.ownerName || getBattleReportOwnerName(source, attack.owner),
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
      if (!attack || !["attack", "scout"].includes(attack.kind) || attack.owner !== "player") return null;
      const key = String(attack.onlineId || attack.id || `${attack.fromId}:${attack.toId}:${attack.launchedAtMs || ""}`);
      if (seen.has(key)) return null;
      seen.add(key);
      const remaining = Math.max(0, Number(attack.remaining) || 0);
      const isResolving = remaining <= 0 && Boolean(attack.onlineId) && !resolvedOnlineArmyIds.has(key);
      if (remaining <= 0 && !isResolving) return null;
      return {
        ...attack,
        key,
        target: cityById(attack.toId),
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
      if (!attack || attack.kind !== "attack") return null;
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
  const playerName = getPreferredPlayerName();
  const launchBtn = enterKingdomBtn || startBtn;
  const originalStartText = launchBtn?.textContent || "";
  const originalStatusDetail = onlineStatusDetail?.textContent || "";
  let shouldConnectOnline = false;
  let statusOverride = "";
  try {
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
    state = createOnlineEntryState(playerName);
    state.online = null;
    onlineWorldConnected = false;
    onlineCitiesLoaded = false;
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
    setSetupLoading(false);
    if (setupScreen?.classList.contains("visible") && onlineStatusDetail && originalStatusDetail && !statusOverride) {
      onlineStatusDetail.textContent = originalStatusDetail;
    }
    if (launchBtn) {
      launchBtn.disabled = false;
      launchBtn.textContent = originalStartText || "Enter Kingdom";
    }
    if (freshBtn) freshBtn.disabled = false;
  }
}

function cleanName(value) {
  return String(value || "").replace(/[^a-z0-9 _.-]/gi, "").trim().slice(0, 18);
}

function cityById(id) {
  return state.cities.find(city => city.id === id);
}

function cityByIdSafe(cities, id) {
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
  const base = getPlayableBaseCities().find(city => city.id === id) || {};
  const regionId = normalizeRegionId(raw.regionId || base.regionId || raw.startPool || base.startPool);
  const ownerUid = String(raw.ownerUid || getCurrentOnlineUid() || "").trim();
  const ownerFlag = raw.ownerFlag || (ownerUid === getCurrentOnlineUid() ? state?.flag : null);
  const troopFallback = getCityTroopFallback({ ...base, ...raw }, { owner: "player", ownerKind: "player", ownerUid });
  return {
    ...base,
    ...raw,
    id,
    name: getCanonicalCityName(base, raw),
    owner: "player",
    ownerKind: "player",
    ownerUid: ownerUid || null,
    ownerName: raw.ownerName || state?.playerName || "",
    ownerFlag,
    ownerKingPower: normalizePowerValue(raw.ownerKingPower),
    ownerShieldExpiresAtMs: isStronghold(raw) || isStronghold(base) ? 0 : normalizeTimestampMs(raw.ownerShieldExpiresAtMs),
    regionId,
    startPool: raw.startPool || base.startPool || regionId,
    islandId: raw.islandId || getOnlineIslandId(regionId),
    kind: raw.kind || base.kind || "",
    strongholdType: raw.strongholdType || base.strongholdType || "",
    bonus: raw.bonus || base.bonus || "",
    bonusPercent: Number(raw.bonusPercent ?? base.bonusPercent) || 0,
    size: isStronghold(raw) || isStronghold(base) ? getStrongholdVisualSize({ ...base, ...raw }) : undefined,
    level: isStronghold(raw) || isStronghold(base) ? getStrongholdDefenseLevel({ ...base, ...raw }) : clampCityLevel(raw.level ?? base.level),
    troops: readCityTroops(raw.troops, troopFallback),
    troopFloat: readCityTroopFloat(raw.troopFloat ?? raw.troops, troopFallback),
    defense: 1,
    investedGold: Math.max(0, Math.floor(Number(raw.investedGold) || 0)),
    lastCapturedAt: raw.lastCapturedAt ?? null,
    isMainCity: !isStronghold(raw) && !isStronghold(base) && (raw.id === state?.mainCityId || Boolean(raw.isMainCity)),
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
  if (complete) {
    onlineOwnedCitiesCacheAt = Date.now();
    onlineOwnedCitiesCacheComplete = true;
  }
  updateIslandSummariesFromOwnedCityCache();
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

function createRouteContext(regionId, source = null, target = null, options = {}) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const ignoredIds = new Set([source?.id, target?.id].filter(Boolean));
  const ignoreCityObstacles = Boolean(options.ignoreCityObstacles);
  const obstacles = ignoreCityObstacles ? [] : state?.cities
    ?.filter(city => getCityRegionId(city) === normalizedRegionId && !ignoredIds.has(city.id))
    .map(city => ({
      id: city.id,
      x: city.x,
      y: city.y,
      radius: isStronghold(city) ? Math.max(ROUTE_STRONGHOLD_CLEARANCE, getStrongholdVisualSize(city) * 0.55) : ROUTE_CITY_CLEARANCE,
    })) || [];
  return {
    regionId: normalizedRegionId,
    ignoredIds,
    obstacles,
    ignoreCityObstacles,
    cacheKey: `${ignoreCityObstacles ? "terrain-only" : "cityblock"}:${normalizedRegionId}:${[...ignoredIds].sort().join(",")}`,
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

function findGridRouteInRegion(start, goal, startPoint, endPoint, normalizedRegionId, routeContext = null) {
  if (!start || !goal) return null;
  const startIndex = start.gy * GRID_COLS + start.gx;
  const goalIndex = goal.gy * GRID_COLS + goal.gx;
  const open = [{ index: startIndex, f: 0 }];
  const gScore = new Map([[startIndex, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];

  while (open.length) {
    open.sort((a, b) => b.f - a.f);
    const current = open.pop();
    if (!current || closed.has(current.index)) continue;
    if (current.index === goalIndex) {
      const route = buildRouteFromCells(cameFrom, current.index, startPoint, endPoint, normalizedRegionId, routeContext);
      route.segments = [{ regionId: normalizedRegionId, points: route.points.map(point => ({ x: point.x, y: point.y })), length: route.length }];
      return route;
    }

    closed.add(current.index);
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
      open.push({ index: nextIndex, f: tentative + h });
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
  const primaryRoute = findLandRouteWithContext(source, target, normalizedRegionId, routeContext);
  if (primaryRoute) return primaryRoute;
  if (routeContext.obstacles.length) {
    const terrainOnlyContext = createRouteContext(normalizedRegionId, source, target, { ignoreCityObstacles: true });
    const terrainOnlyRoute = findLandRouteWithContext(source, target, normalizedRegionId, terrainOnlyContext);
    if (terrainOnlyRoute) return terrainOnlyRoute;
  }
  return null;
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
    return findGridRouteInRegion(candidateStart, candidateGoal, startPoint, endPoint, normalizedRegionId, routeContext);
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
  updateDeploymentCheck(dt);

  if (state && !isGamePausedByOutcome()) {
    updateGame(dt);
    saveTimer += dt;
    if (saveTimer >= SAVE_EVERY_SECONDS) {
      saveTimer = 0;
      saveGame();
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
  }

  if (state) {
    renderArmies();
    if (now - lastHudRenderTime > HUD_RENDER_INTERVAL_MS) {
      lastHudRenderTime = now;
      renderHud();
      updateOnlinePlayersUi();
    }
    if (now - lastRenderTime > MAP_RENDER_INTERVAL_MS && now >= interactionRenderLockUntil) {
      lastRenderTime = now;
      renderPaths();
      renderCities();
      renderPanel();
    }
  }

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

function getGoldPerSecond() {
  return playerCities().reduce((sum, city) => sum + getCityStats(city).goldProductionPerSecond, 0);
}

function getTroopProductionPerSecond() {
  return playerCities().reduce((sum, city) => sum + getCityStats(city).troopProductionPerSecond, 0);
}

function getHarvestBonusGoldReward() {
  const passiveGold = Math.floor(getGoldPerSecond() * HARVEST_BONUS_GOLD_SECONDS);
  return Math.max(HARVEST_BONUS_MIN_GOLD, passiveGold);
}

function getHarvestBonusTroopReward() {
  const passiveTroops = Math.floor(getTroopProductionPerSecond() * HARVEST_BONUS_TROOP_SECONDS);
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
  return normalizeHarvestBonuses(state?.harvestBonuses || [])
    .filter(bonus => normalizeRegionId(bonus.regionId) === activeRegionId);
}

function enforceHarvestBonusActiveLimit(bonuses) {
  const keptByRegion = new Map();
  normalizeHarvestBonuses(bonuses)
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach(bonus => {
      const regionId = normalizeRegionId(bonus.regionId);
      const current = keptByRegion.get(regionId) || [];
      if (current.length >= HARVEST_BONUS_MAX_ACTIVE_PER_ISLAND) return;
      current.push(bonus);
      keptByRegion.set(regionId, current);
    });
  return Array.from(keptByRegion.values())
    .flat()
    .sort((a, b) => a.createdAt - b.createdAt);
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
  const before = state.harvestBonuses?.length || 0;
  state.harvestBonuses = normalizeHarvestBonuses(state.harvestBonuses)
    .filter(bonus => (
      now - bonus.createdAt <= HARVEST_BONUS_EXPIRE_SECONDS
      && isHarvestBonusTerrainSafePoint(bonus.x, bonus.y, bonus.regionId)
      && isHarvestBonusNearOwnedCity(bonus.x, bonus.y, bonus.regionId)
    ));
  state.harvestBonuses = enforceHarvestBonusActiveLimit(state.harvestBonuses);
  if (state.harvestBonuses.length !== before) renderHarvestBonuses();
}

function isHarvestBonusFarFromCities(x, y, regionId) {
  return state.cities
    .filter(city => getCityRegionId(city) === regionId)
    .every(city => Math.hypot(city.x - x, city.y - y) >= HARVEST_BONUS_CITY_CLEARANCE);
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

function spawnHarvestBonus(regionId = getActiveMapRegionId(), type = getNextAvailableHarvestBonusType()) {
  if (!state) return false;
  const daily = ensureDailyCaptureTracker();
  const bonusType = normalizeHarvestBonusType(type);
  if (!canHarvestBonusType(bonusType, daily)) return false;
  const activeRegionId = normalizeRegionId(regionId);
  if (getActiveHarvestBonuses(activeRegionId).length >= HARVEST_BONUS_MAX_ACTIVE_PER_ISLAND) return false;
  const point = createHarvestBonusPoint(activeRegionId);
  if (!point) return false;
  state.harvestBonuses = normalizeHarvestBonuses(state.harvestBonuses);
  state.harvestBonuses.push({
    id: `harvest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: bonusType,
    regionId: activeRegionId,
    x: Math.round(point.x),
    y: Math.round(point.y),
    createdAt: Math.max(0, Number(state.gameSeconds) || 0),
  });
  return true;
}

function updateHarvestBonuses(dt) {
  if (!state || isGamePausedByOutcome() || onlineWorldLoading) return;
  const daily = ensureDailyCaptureTracker();
  pruneExpiredHarvestBonuses();
  if (daily.harvestedBonuses >= HARVEST_BONUS_DAILY_LIMIT) return;
  const nextType = getNextAvailableHarvestBonusType(daily);
  if (!nextType) return;
  const activeRegionId = getActiveMapRegionId();
  if (getActiveHarvestBonuses(activeRegionId).length >= HARVEST_BONUS_MAX_ACTIVE_PER_ISLAND) return;
  state.harvestSpawnTimer = Math.max(0, Number(state.harvestSpawnTimer) || 0) - dt;
  if (state.harvestSpawnTimer > 0) return;
  const spawned = spawnHarvestBonus(activeRegionId, nextType);
  state.harvestSpawnTimer = HARVEST_BONUS_SPAWN_INTERVAL_SECONDS;
  if (spawned) {
    state.harvestNextBonusType = getAlternateHarvestBonusType(nextType);
    renderHarvestBonuses();
  }
}

function resetHarvestSpawnTimer() {
  if (!state) return;
  state.harvestSpawnTimer = HARVEST_BONUS_SPAWN_INTERVAL_SECONDS;
}

function collectHarvestBonus(bonusId) {
  if (!state || isGamePausedByOutcome()) return;
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
        attack.remaining -= dt;
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

function isProtectedMainCity(city) {
  return Boolean(city && (city.isMainCity || city.id === state?.mainCityId));
}

function getMainCityAttackBlockReason(target, attackerOwner = "player", attackerOwnerUid = "") {
  if (!target || !isProtectedMainCity(target)) return "";
  if (isSameAttackOwner(target, attackerOwner, attackerOwnerUid)) return "";
  return `${target.name} is a main city and cannot be attacked.`;
}

function launchAttack(sourceId, targetId, percent, owner, exactTroops = null, options = {}) {
  const source = cityById(sourceId);
  const target = cityById(targetId);
  if (!source || !target || isGamePausedByOutcome()) return false;
  if (source.owner !== owner) return false;
  if (source.id === target.id) return false;
  if (source.troops < 1) return false;
  if (owner === "player" && !canUseOnlineArmyOrders()) return false;

  const kind = target.owner === owner ? "transfer" : "attack";
  const mainCityBlockReason = kind === "attack" ? getMainCityAttackBlockReason(target, owner) : "";
  if (mainCityBlockReason) {
    if (owner === "player") showToast(mainCityBlockReason);
    return false;
  }

  const shieldBlockReason = kind === "attack" ? getPeaceShieldAttackBlockReason(target, owner) : "";
  if (shieldBlockReason) {
    if (owner === "player") showToast(shieldBlockReason);
    return false;
  }

  const neutralBlockReason = getNeutralCaptureBlockReason(target, owner);
  if (neutralBlockReason) {
    if (owner === "player") showNeutralCaptureLimitModal(neutralBlockReason);
    return false;
  }

  const route = findRoute(source, target);
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
        if (acceptedKind === "transfer") {
          if (!options.silent) {
            addLog(`You moved ${formatNumber(acceptedTroops)} troops from ${source.name} to ${target.name}.`);
            showToast(`Reinforcements moving: ${source.name} \u2192 ${target.name}`);
          }
        } else {
          const demoText = acceptedDemoAttack ? ` ${getDemoAttackNotice(acceptedDemoAttack)}` : "";
          addLog(`You sent ${formatNumber(acceptedTroops)} troops from ${source.name} to attack ${target.name}.${demoText}`);
          showToast(acceptedDemoAttack ? `Demo attack moving: ${formatNumber(acceptedTroops)} troops` : `Attack moving: ${source.name} \u2192 ${target.name}`);
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
  const speed = owner === "player" ? skillMultiplier("rusher") * getStrongholdMarchSpeedMultiplier(owner) : 1;
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

  const attackerName = attack.owner === "player" ? "You" : attack.ownerName || "Enemy";
  const oldOwner = target.owner;
  const defenderName = getBattleReportOwnerName(target, oldOwner);
  const attackerReportName = attack.owner === "player"
    ? getBattleReportOwnerName(null, attack.owner)
    : attack.ownerName || getBattleReportOwnerName(null, attack.owner);
  const attackSource = cityById(attack.fromId);
  const targetLevel = clampCityLevel(target.level);
  const defendersAtStart = Math.max(0, Math.floor(Number(target.troops) || 0));
  const targetDefenseAtStart = getCityStats(target).totalDefense;
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
        opponentName: attackerReportName,
        summary: `Royal Peace Shield blocked ${attackerReportName}'s attack. ${returnText}`,
      });
      showToast(`Shield blocked an attack on ${target.name}`);
    }
    addLog(`${shieldBlockReason} ${returnText}`);
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
    const neutralCapture = attack.owner === "player" && oldOwner === "neutral" && !isStronghold(target);
    const neutralBlockReason = neutralCapture ? getNeutralCaptureBlockReason(target, "player", attack.id) : "";
    if (neutralBlockReason) {
      if (givenUpNeutralTarget) {
        target.troopFloat = 0;
        target.troops = 0;
      } else {
        target.troopFloat = Math.max(1, target.troopFloat);
        target.troops = Math.floor(target.troopFloat);
      }
      if (attack.owner === "player") {
        addBattleReport({
          type: "attack",
          outcome: "defeat",
          cityId: target.id,
          cityName: target.name,
          cityLevel: targetLevel,
          sentTroops: attack.troops,
          troopCount: defendersAtStart,
          survivors: result.survivors,
          defendersLeft: target.troops,
          attackerLosses: result.attackerLosses,
          defenderLosses: result.defenderLosses,
          totalDefense: targetDefenseAtStart,
          opponentName: defenderName,
          summary: `${neutralBlockReason}${demoReportSuffix}`,
        });
      }
      addLog(`${attackerName} defeated the defenders at ${target.name}, but could not capture it. ${neutralBlockReason}`);
      if (attack.owner === "player") showNeutralCaptureLimitModal(neutralBlockReason);
      else showToast(neutralBlockReason);
      return;
    }

    const xpEfficiency = attack.owner === "player" ? (demoAttack || givenUpNeutralTarget ? 0 : getCaptureXpEfficiency(target, oldOwner)) : 1;
    const xpAward = attack.owner === "player" && !demoAttack && !givenUpNeutralTarget ? getCaptureXpAward(target, oldOwner, result.defenderLosses, attack.owner) : 0;
    const cautiousRefund = oldOwner === "player" && attack.owner !== "player" ? grantCautiousRefund(target) : 0;

    if (attack.owner === "player") {
      target.owner = "player";
      target.ownerKind = "player";
      target.ownerUid = getCurrentOnlineUid() || target.ownerUid || null;
      target.ownerName = state.playerName;
      target.ownerFlag = state.flag;
    } else if (attack.ownerKind === "player" && attack.ownerUid) {
      target.owner = "enemy";
      target.ownerKind = "player";
      target.ownerUid = attack.ownerUid;
      target.ownerName = attack.ownerName || "Rival ruler";
      target.ownerFlag = attack.ownerFlag || createDefaultFlag();
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
      const savedAttackers = returnSavedTroops("fearless", result.attackerLosses, `${target.name} attack`);
      const scavengedGold = grantKillGold("scavenger", result.killedDefenders, `${target.name} attack`);
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
        opponentName: defenderName,
        summary: `Captured with ${formatNumber(result.survivors)} survivors. ${formatCapturedCityLevelDrop(levelDrop)} +${formatNumber(xpAward)} XP.${demoReportSuffix}`,
      });
      addLog(`Victory: you captured ${target.name} with ${formatNumber(result.survivors)} survivors. ${formatCapturedCityLevelDrop(levelDrop)} XP efficiency ${Math.round(xpEfficiency * 100)}%.`);
      if (scavengedGold > 0) {
        showToast(`Captured ${target.name}: +${formatNumber(xpAward)} XP, +${formatNumber(scavengedGold)} gold`);
      } else {
        showToast(`Captured ${target.name}: +${formatNumber(xpAward)} XP`);
      }
      addCharacterXp(xpAward, `${target.name} capture`);
    } else if (oldOwner === "player") {
      const savedDefenders = returnSavedTroops("brave", result.defenderLosses, `${target.name} defense`, target.id);
      const salvagedGold = grantKillGold("salvager", result.killedAttackers, `${target.name} defense`);
      const defenseLossXp = applyDefenseOpponentXpMultiplier(getLostDefenseXpAward(attack.troops, target), attack, target, demoAttack);
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
        opponentName: attackerReportName,
        summary: `${target.name} was captured by ${attackerReportName}. ${formatCapturedCityLevelDrop(levelDrop)} +${formatNumber(defenseLossXp)} XP.${demoReportSuffix}`,
      });
      addLog(`Lost: the enemy captured ${target.name}. ${formatCapturedCityLevelDrop(levelDrop)} ${formatNumber(savedDefenders)} defenders escaped, ${formatNumber(cautiousRefund + salvagedGold)} gold was recovered, and you gained ${formatNumber(defenseLossXp)} XP.`);
      showToast(`You lost ${target.name}: +${formatNumber(defenseLossXp)} XP`);
      addCharacterXp(defenseLossXp, `${target.name} lost defense`);
    }
  } else {
    target.troopFloat = result.defendersLeft;
    target.troops = result.defendersLeft;

    if (attack.owner === "player") {
      const savedAttackers = returnSavedTroops("fearless", result.attackerLosses, `${target.name} failed attack`);
      const scavengedGold = grantKillGold("scavenger", result.killedDefenders, `${target.name} failed attack`);
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
        opponentName: defenderName,
        summary: `${formatNumber(result.defendersLeft)} defenders remained. +${formatNumber(failedAttackXp)} XP.${demoReportSuffix}`,
      });
      addLog(`Defeat: your attack on ${target.name} failed. ${formatNumber(result.defendersLeft)} defenders remain. ${formatNumber(savedAttackers)} attackers regrouped, ${formatNumber(scavengedGold)} gold was recovered, and you gained ${formatNumber(failedAttackXp)} XP.`);
      showToast(`Attack failed at ${target.name}: +${formatNumber(failedAttackXp)} XP`);
      addCharacterXp(failedAttackXp, `${target.name} failed attack`);
    } else if (oldOwner === "player") {
      const savedDefenders = returnSavedTroops("brave", result.defenderLosses, `${target.name} defense`);
      const salvagedGold = grantKillGold("salvager", result.killedAttackers, `${target.name} defense`);
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
        opponentName: attackerReportName,
        summary: `${target.name} survived with ${formatNumber(result.defendersLeft)} defenders. +${formatNumber(defenseHeldXp)} XP.${demoReportSuffix}`,
      });
      addLog(`Defense held: ${target.name} survived the enemy attack.`);
      if (savedDefenders > 0 || salvagedGold > 0) {
        addLog(`Defense rewards: ${formatNumber(savedDefenders)} defenders regrouped and ${formatNumber(salvagedGold)} gold was salvaged.`);
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
  lastRenderTime = now;
  syncMapSurfaceToActiveIsland();
  updateCameraTransform();
  renderHud();
  renderHarvestBonuses();
  renderIslandTeleporters();
  renderPaths();
  renderCities(true);
  renderPanel();
  renderArmies();
}

function renderHud() {
  if (lordNameText) lordNameText.textContent = state.playerName;
  ensureDailyCaptureTracker();
  state.character = normalizeCharacterProgress(state.character);
  state.flag = normalizeFlag(state.flag);
  goldText.textContent = formatNumber(Math.floor(state.gold));
  if (characterLevelBadge) characterLevelBadge.textContent = `Lv ${formatNumber(state.character.level)}`;
  if (characterXpText) characterXpText.textContent = "";
  applyFlagToElement(hudKingdomFlag, state.flag);
  const regularCityCount = getAllOwnedRegularCitiesForDisplay().length;
  if (cityText) cityText.textContent = `${formatNumber(regularCityCount)} cities`;
  if (cityListBtn) cityListBtn.setAttribute("aria-label", `Open city list, ${formatNumber(regularCityCount)} cities owned`);
  updateShieldStatusBadge();
  updateIslandSwitcherUi();
  updateIncomingAttackUi();
  updateOutgoingAttackUi();

  if (!statusText) return;
  if (state.gameOver === "victory") {
    statusText.textContent = "Victory";
  } else {
    statusText.textContent = `+${getGoldPerSecond().toFixed(1)} gold/s`;
  }

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
  if (city.ownerKind === "player" && city.ownerUid) return city.ownerFlag || createDefaultFlag();
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
  if (city.ownerKind === "player" && city.ownerUid && city.ownerName) return city.ownerName;
  if (city.ownerKind === "player" && city.ownerUid) return "Rival ruler";
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
  const stats = getCityStats(city);
  const troopPower = Math.max(0, Math.floor(Number(city.troops) || 0)) * KING_POWER_PER_TROOP;
  const cityPower = Math.max(0, Math.floor(Number(stats.victoryPoints) || 0)) * KING_POWER_PER_CITY_VP;
  return troopPower + cityPower;
}

function getKingPower() {
  if (!state || !Array.isArray(state.cities)) return 0;
  const stationedPower = getAllOwnedCitiesForDisplay().reduce((total, city) => total + getCityKingPower(city), 0);
  const marchingPower = getPlayerMarchingTroops() * KING_POWER_PER_TROOP;
  return Math.max(0, Math.floor(stationedPower + marchingPower));
}

function getKingdomSummary() {
  const cities = getAllOwnedCitiesForDisplay();
  const regularCities = cities.filter(city => !isStronghold(city));
  const marchingTroops = getPlayerMarchingTroops();
  return {
    kingPower: getKingPower(),
    cities: regularCities.length,
    troops: cities.reduce((total, city) => total + Math.max(0, Number(city.troops) || 0), marchingTroops),
    gold: Math.floor(state.gold),
    goldProductionPerHour: cities.reduce((total, city) => total + getCityStats(city).goldProductionPerHour, 0),
    troopProductionPerHour: cities.reduce((total, city) => total + getCityStats(city).troopProductionPerHour, 0),
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

function updatePushAlertsUi() {
  if (!pushAlertsBtn || !pushAlertsStatus) return;
  const api = getOnlineApi();
  const signedIn = Boolean(api?.isSignedIn?.());
  const supported = Boolean(api?.isPushSupported?.());
  const permission = api?.getNotificationPermission?.() || "unsupported";
  const enabledPreference = getPushNotificationsPreference();
  pushAlertsBtn.classList.remove("enabled");
  pushAlertsBtn.hidden = false;
  pushAlertsStatus.hidden = false;

  if (!state || !signedIn) {
    pushAlertsBtn.textContent = "Notifications Off";
    pushAlertsStatus.textContent = "Offline";
    pushAlertsBtn.disabled = true;
    return;
  }
  if (!supported) {
    pushAlertsBtn.textContent = "Notifications Off";
    pushAlertsStatus.textContent = "Unavailable";
    pushAlertsBtn.disabled = true;
    return;
  }
  pushAlertsBtn.removeAttribute("title");
  if (permission === "denied") {
    pushAlertsBtn.textContent = "Notifications Blocked";
    pushAlertsStatus.textContent = "Blocked";
    pushAlertsBtn.disabled = true;
    return;
  }
  if (enabledPreference && permission === "granted") {
    pushAlertsBtn.textContent = "Notifications On";
    pushAlertsStatus.textContent = "Notifications On";
    pushAlertsBtn.classList.add("enabled");
    pushAlertsBtn.disabled = false;
    return;
  }
  pushAlertsBtn.textContent = "Notifications Off";
  pushAlertsStatus.textContent = "Notifications Off";
  pushAlertsBtn.disabled = false;
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
    if (!silent) showToast(error?.message || "Could not enable battle alerts.");
    updatePushAlertsUi();
    return false;
  }
}

async function togglePushNotifications() {
  const api = getOnlineApi();
  if (!api?.enablePushNotifications) {
    showToast("Notifications are not available here.");
    return;
  }
  if (pushAlertsBtn) pushAlertsBtn.disabled = true;
  try {
    if (getPushNotificationsPreference() && api?.getNotificationPermission?.() === "granted") {
      setPushNotificationsPreference(false);
      if (api.disablePushNotifications) await api.disablePushNotifications();
      showToast("Notifications off.");
      return;
    }
    setPushNotificationsPreference(true);
    await api.enablePushNotifications({ playerName: state?.playerName || "Ruler" });
    showToast("Notifications on.");
  } catch (error) {
    setPushNotificationsPreference(false);
    showToast(error?.message || "Could not update notifications.");
  } finally {
    updatePushAlertsUi();
  }
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
  const xpRequired = getXpRequiredForLevel(state.character.level);
  const xpProgress = clamp(state.character.xp / Math.max(1, xpRequired), 0, 1);

  if (profileNameText) profileNameText.textContent = state.playerName;
  if (profileLevelText) profileLevelText.textContent = `Level ${formatNumber(state.character.level)}`;
  if (profileXpLabel) profileXpLabel.textContent = `${formatNumber(state.character.xp)} / ${formatNumber(xpRequired)} XP`;
  if (profileXpFill) profileXpFill.style.width = `${Math.round(xpProgress * 100)}%`;
  if (profileKingPowerStat) profileKingPowerStat.textContent = formatNumber(summary.kingPower);
  if (profileCitiesStat) profileCitiesStat.textContent = formatNumber(summary.cities);
  if (profileGoldStat) profileGoldStat.textContent = formatNumber(summary.gold);
  if (profileTroopsStat) profileTroopsStat.textContent = formatNumber(summary.troops);
  if (profileGoldProductionStat) profileGoldProductionStat.textContent = `${formatNumber(summary.goldProductionPerHour)}/h`;
  if (profileTroopProductionStat) profileTroopProductionStat.textContent = `${formatNumber(summary.troopProductionPerHour)}/h`;
  applyFlagToElement(profileKingdomFlag, state.flag);
  updatePushAlertsUi();
  if (activeProfileTab === "skills") renderProfileSkills();
}

function renderProfileSkills() {
  if (!state || !skillsView || skillsView.hidden) return;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  const points = Math.max(0, Math.floor(Number(state.character.skillPoints) || 0));
  const spentPoints = getSpentSkillPoints();
  const canResetSkills = spentPoints > 0 && Math.floor(Number(state.gold) || 0) >= SKILL_RESET_COST;
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

function saveProfileName() {
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
  cancelProfileNameEdit();
  saveGame();
  syncOwnedCitiesToOnline(true);
  renderAll();
  renderProfileScreen();
  showToast("Ruler name updated.");
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

function saveFlagEditor() {
  if (!state || !flagDraft) return;
  state.flag = normalizeFlag(flagDraft);
  saveGame();
  syncOwnedCitiesToOnline(true);
  flushOnlineSave(true).then(saved => {
    if (!saved && getOnlineApi()?.isSignedIn?.()) showToast("Flag saved locally. Cloud save will retry.");
  });
  renderHud();
  showProfileView();
  showToast("Kingdom flag saved.");
}

function formatPathNumber(value) {
  return Number(value).toFixed(1);
}

function getMissionSegmentsForRegion(mission, regionId = getActiveMapRegionId()) {
  const activeRegionId = normalizeRegionId(regionId);
  const segments = getMissionRouteSegments(mission).filter(segment => segment.regionId === activeRegionId);
  if (segments.length) return segments;
  const from = cityById(mission?.fromId);
  const to = cityById(mission?.toId);
  if (!from || !to || getCityRegionId(from) !== activeRegionId || getCityRegionId(to) !== activeRegionId) return [];
  const path = normalizeArmyPath(mission?.path);
  if (path.length >= 2) return [{ regionId: activeRegionId, points: path, length: Math.max(0, Number(mission?.pathLength) || routeLength(path)) }];
  const route = findRoute(from, to);
  return getRouteSegments(route, activeRegionId).filter(segment => segment.regionId === activeRegionId);
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
      .map(({ attack, segments }) => `${attack.id}:${attack.kind || ""}:${attack.owner || ""}:${attack.fromId}:${attack.toId}:${attack.pathLength || 0}:${segments.map(segment => segment.points.length).join(",")}`)
      .join("|"),
  ].join(";");
  if (signature === pathRenderSignature) return;
  pathRenderSignature = signature;
  pathsSvg.innerHTML = "";
  for (const { attack, segments } of visibleArmySegments) {
    for (const segment of segments) {
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", segment.points.map(point => {
        const mapPoint = worldToMapPoint(point);
        return `${mapPoint.x},${mapPoint.y}`;
      }).join(" "));
      polyline.classList.add("army-route", attack.owner === "player" ? "player-route" : "enemy-route");
      if (attack.kind === "transfer") polyline.classList.add("transfer-route");
      if (attack.kind === "scout") polyline.classList.add("scout-route");
      pathsSvg.appendChild(polyline);
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
  const rect = mapFrame.getBoundingClientRect();
  const worldMargin = margin / Math.max(zoom, 0.1);
  const offset = getMapViewportOffset(rect, getActiveMapDimensions());
  return {
    left: mapBounds.left + camera.x - offset.x / Math.max(zoom, 0.1) - worldMargin,
    top: mapBounds.top + camera.y - offset.y / Math.max(zoom, 0.1) - worldMargin,
    right: mapBounds.left + camera.x + (rect.width - offset.x) / Math.max(zoom, 0.1) + worldMargin,
    bottom: mapBounds.top + camera.y + (rect.height - offset.y) / Math.max(zoom, 0.1) + worldMargin,
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

function getFlagSignature(flag) {
  if (!flag) return "";
  const normalized = normalizeFlag(flag);
  return `${normalized.primary}:${normalized.secondary}:${normalized.pattern}:${normalized.symbol}`;
}

function getCityRenderSignature(visibleCities) {
  const playerFlag = getFlagSignature(state.flag);
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
      city.kind || "",
      city.strongholdType || "",
      isStronghold(city) ? getStrongholdVisualSize(city) : "",
      isCityProtectedByPeaceShield(city) ? getCityPeaceShieldExpiresAtMs(city) : 0,
      city.level,
      Math.floor(Number(city.troops) || 0),
      city.isMainCity ? 1 : 0,
      upgradeBlockedTargets.has(getKnownCityId(city.id)) ? 1 : 0,
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
    cityTokens,
  ].join(";");
}

function renderCities(force = false) {
  if (!force && isZoomInteractionActive()) return;
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
  const signature = getCityRenderSignature(visibleCities);
  if (!force && signature === cityRenderSignature) return;
  cityRenderSignature = signature;

  cityLayer.innerHTML = "";
  if (scoutNearbySource) renderScoutNearbyRadius(scoutNearbySource);
  if (regroupSource) renderRegroupRadius(regroupSource);

  visibleCities.forEach(city => {
    const mapPoint = worldToMapPoint(city);
    const stronghold = isStronghold(city);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.cityId = city.id;
    const castleStage = getCastleStage(city.level);
    btn.className = `city-node ${OWNER[city.owner].css} castle-stage-${castleStage}`;
    if (stronghold) btn.classList.add("stronghold-node", `stronghold-${city.strongholdType || "generic"}`);
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
    const scoutReport = city.owner === "player" ? null : getScoutReport(city.id);
    const isSelectedForeign = city.owner !== "player" && city.id === selectedTargetId && !sendMode;
    const ownerName = getCityOwnerDisplayName(city);
    const ownerFlag = renderCityOwnerFlag(city);
    const rivalOwnerName = city.owner === "enemy" && ownerName && ownerName !== OWNER.enemy.label
      ? `<strong class="foreign-ruler-name foreign-ruler-name-inline">${escapeHtml(ownerName)}</strong>`
      : "";
    const cityLabel = city.owner === "player"
      ? `
        <span class="city-label player-city-label">
          <span class="player-city-banner">
            <span class="city-owner-column">
              ${ownerFlag}
              <span class="city-label-level">${city.level}</span>
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
          <strong class="foreign-ruler-name">${escapeHtml(ownerName)}</strong>
          <span class="foreign-selected-banner">
            <span class="foreign-selected-level">${city.level}</span>
            <span class="foreign-selected-crest">${ownerFlag}</span>
            <span class="foreign-selected-data">
              <strong class="city-name">${escapeHtml(city.name)}</strong>
              <span class="foreign-garrison ${scoutReport ? "revealed" : "unknown"}">${scoutReport ? formatNumber(scoutReport.troops) : "?"} troops</span>
            </span>
          </span>
        </span>`
        : `
        <span class="city-label foreign-city-label">
          ${rivalOwnerName}
          <strong class="city-name">${escapeHtml(city.name)}</strong>
          <span class="foreign-city-shield">
            ${ownerFlag}
            <span class="city-label-level">${city.level}</span>
          </span>
        </span>`;
    const knownTroops = city.owner === "player" ? city.troops : scoutReport?.troops;
    const locationType = stronghold ? "Stronghold" : `Level ${city.level}`;
    const structureHtml = stronghold
      ? `
      <span class="stronghold-glow" aria-hidden="true"></span>
      <span class="stronghold-building" aria-hidden="true"><img class="stronghold-art" src="${getStrongholdArtSrc(city)}" alt="" draggable="false" /></span>`
      : `
      <span class="city-ring"></span>
      ${shielded ? `<span class="city-shield-field" aria-hidden="true"><img src="assets/royal-peace-shield-field.png?v=20260630-global-owned-shield-fix" alt="" draggable="false" /></span>` : ""}
      <span class="city-castle stage-${castleStage}" aria-hidden="true"><img class="city-art" src="${getCastleAsset(castleStage)}" alt="" draggable="false" /></span>`;
    btn.setAttribute("aria-label", `${city.name}. ${ownerName}. ${locationType}. ${knownTroops === undefined ? "Unknown troops" : `${formatNumber(knownTroops)} troops`}.`);
    btn.innerHTML = `
      ${structureHtml}
      ${cityLabel}
    `;
    applyCityOwnerFlags(btn, city);
    cityLayer.appendChild(btn);
  });

  layoutCityLabels();
  const selectedForeign = selectedTargetId ? cityById(selectedTargetId) : null;
  if (selectedForeign && selectedForeign.owner !== "player" && !sendMode) renderSelectedForeignWheel(selectedForeign);
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
  const mapPoint = worldToMapPoint(city);
  const wheel = document.createElement("div");
  const levelCost = getLevelCost(city);
  const incomingUpgradeLocked = cityHasIncomingUpgradeBlocker(city);
  const levelDisabled = incomingUpgradeLocked || isStronghold(city) || city.level >= MAX_CITY_LEVEL || state.gold < levelCost;
  const levelButtonLabel = incomingUpgradeLocked
    ? `${city.name} cannot be leveled while an attack is incoming`
    : `Level up ${city.name}`;
  const levelCostLabel = incomingUpgradeLocked
    ? "Incoming"
    : isStronghold(city) ? "Fixed" : city.level >= MAX_CITY_LEVEL ? "MAX" : `${formatNumber(levelCost)}g`;
  const scoutNearbyActive = scoutNearbySourceId === city.id;
  const regroupActive = regroupSourceId === city.id;
  wheel.className = "city-action-wheel";
  applyCityActionWheelSizing(wheel, city);
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
  const mapPoint = worldToMapPoint(city);
  const wheel = document.createElement("div");
  const report = getScoutReport(city.id);
  const pendingScout = getPendingScoutMission(city.id);
  const canScout = !pendingScout && playerCities().some(playerCity => playerCity.troops >= 1);
  const mainCityBlockReason = getMainCityAttackBlockReason(city, "player");
  const shieldBlockReason = getPeaceShieldAttackBlockReason(city, "player");
  const attackBlockLabel = mainCityBlockReason ? "Main City" : shieldBlockReason ? "Shielded" : "Attack";
  const canAttack = !mainCityBlockReason && !shieldBlockReason && playerCities().some(playerCity => playerCity.troops > 0);
  wheel.className = "city-action-wheel foreign-city-action-wheel";
  applyCityActionWheelSizing(wheel, city);
  wheel.style.left = `${mapPoint.x}px`;
  wheel.style.top = `${mapPoint.y}px`;
  wheel.innerHTML = `
    <span class="city-wheel-ring" aria-hidden="true"></span>
    <button class="city-wheel-action wheel-scout" type="button" aria-label="${pendingScout ? "Scout traveling to" : report ? "Scout again" : "Scout"} ${escapeHtml(city.name)}" ${canScout ? "" : "disabled"}>
      <span class="wheel-icon" aria-hidden="true">&#128301;</span>
      <span class="wheel-action-name">${pendingScout ? "Scouting" : report ? "Rescout" : "Scout"}</span>
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

function showScoutReportModal(cityId) {
  const city = cityById(cityId);
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
  const guardianBonus = Math.max(0, Math.floor(Number(report.guardianBonus) || 0));
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

      <div class="scout-report-city"><span>Target city</span><strong>${escapeHtml(city.name)}</strong><b>Level ${formatNumber(cityLevel)}</b></div>

      <div class="scout-report-overview">
        <div><span>Scouted troops</span><strong>${formatNumber(report.troops)}</strong></div>
        <div><span>Total defense</span><strong>${formatNumber(report.totalDefense)}</strong></div>
      </div>

      <section class="scout-report-section">
        <h3>Enemy defense</h3>
        <div class="scout-defense-breakdown">
          ${scoutBreakdownRow("&#9817;", "Troops", "Reported garrison", report.troops)}
          ${scoutBreakdownRow("&#128737;", "City defense", `Lv ${cityLevel} - +${formatNumber(defensePercent)}%`, cityDefenseBonus)}
          ${scoutBreakdownRow("&#10022;", "Guardian", `Lv ${report.guardianLevel || 0} - +${report.guardianPercent || 0}%`, guardianBonus)}
          ${scoutBreakdownRow("&#9819;", "City walls", `Lv ${cityLevel}`, cityWalls)}
          <div class="scout-breakdown-total"><span>Total</span><strong>${formatNumber(report.totalDefense)}</strong></div>
        </div>
      </section>

      <div class="scout-skill-columns">
        <section class="scout-report-section">
          <h3>Enemy defense stats</h3>
          <div class="scout-skill-list">
            ${scoutSkillRow("Guardian", report.guardianLevel, report.guardianPercent)}
            ${scoutSkillRow("Brave", report.braveLevel, report.bravePercent)}
            ${scoutSkillRow("Cautious", report.cautiousLevel, report.cautiousPercent)}
          </div>
        </section>
        <section class="scout-report-section">
          <h3>Enemy attack stats</h3>
          <div class="scout-skill-list">
            ${scoutSkillRow("Striker", report.strikerLevel, report.strikerPercent)}
            ${scoutSkillRow("Fearless", report.fearlessLevel, report.fearlessPercent)}
            ${scoutSkillRow("Scavenger", report.scavengerLevel, report.scavengerPercent)}
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
  const route = findRoute(source, target);
  return route?.points?.length ? { city: source, route } : null;
}

function findPreferredAttackSource(target) {
  const rememberedSource = getLastSelectedOwnedAttackCity();
  if (rememberedSource) return findLastSelectedAttackSource(target) || findNearestOwnedSource(target, 1);
  return findNearestOwnedSource(target, 1);
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
      ? `${rememberedSource.name} needs troops and a valid route to attack this target.`
      : "No owned city with troops can reach this target.");
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
  const placed = [];
  const slots = ["top", "top-high", "top-higher", "top-highest", "top-tier-5", "top-tier-6"];
  const slotPenalty = { top: 0, "top-high": 8, "top-higher": 18, "top-highest": 32, "top-tier-5": 50, "top-tier-6": 72 };

  for (const node of nodes) {
    const label = node.querySelector(".city-label");
    if (!label) continue;
    const cityY = Number.parseFloat(node.style.top) || 0;
    const availableSlots = cityY < 210 ? slots.slice(0, 2) : slots;
    let bestSlot = "top";
    let bestPenalty = Infinity;

    for (const slot of availableSlots) {
      for (const option of slots) label.classList.remove(`label-slot-${option}`);
      label.classList.add(`label-slot-${slot}`);
      const rect = label.getBoundingClientRect();
      let penalty = slotPenalty[slot];
      for (const other of placed) {
        const overlapX = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left));
        const overlapY = Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
        penalty += overlapX * overlapY;
      }
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestSlot = slot;
      }
      if (penalty === 0) break;
    }

    for (const option of slots) label.classList.remove(`label-slot-${option}`);
    label.classList.add(`label-slot-${bestSlot}`);
    placed.push(label.getBoundingClientRect());
  }
}

function canViewArmyTroopAmount(attack) {
  if (!attack) return false;
  if (attack.kind !== "transfer") return true;
  if (attack.owner === "player") return true;
  const ownerUid = String(attack.ownerUid || "").trim();
  const currentUid = getCurrentOnlineUid();
  return Boolean(ownerUid && currentUid && ownerUid === currentUid);
}

function renderArmies() {
  if (!state) return;
  if (isZoomInteractionActive()) return;
  armyLayer.innerHTML = "";
  const visibleBounds = getVisibleWorldBounds(240);
  const activeRegionId = getActiveMapRegionId();
  for (const attack of getRenderableArmies()) {
    const from = cityById(attack.fromId);
    const to = cityById(attack.toId);
    if (!from || !to) continue;
    const progress = clamp(1 - attack.remaining / attack.total, 0, 1);
    const segmentPoint = getMissionPointAtProgress(attack, progress);
    if (!segmentPoint || segmentPoint.regionId !== activeRegionId) continue;
    const point = segmentPoint.point;
    const x = point.x;
    const y = point.y;
    if (!isPointInBounds(x, y, visibleBounds)) continue;
    const mapPoint = worldToMapPoint(point);
    const token = document.createElement("div");
    token.className = `army-token ${(OWNER[attack.owner] || OWNER.enemy).css}`;
    token.style.left = `${mapPoint.x}px`;
    token.style.top = `${mapPoint.y}px`;
    const armyIcon = attack.kind === "scout" ? "\u{1F52D}" : attack.kind === "transfer" ? "\u{1F45F}" : "\u2694";
    const showTroops = canViewArmyTroopAmount(attack);
    token.classList.toggle("hidden-transfer", !showTroops);
    token.innerHTML = showTroops
      ? `<span>${armyIcon}</span><strong>${formatNumber(attack.troops)}</strong><small>${formatDuration(attack.remaining)}</small>`
      : `<span>${armyIcon}</span><small>${formatDuration(attack.remaining)}</small>`;
    if (attack.ownerName) {
      const titlePrefix = `${attack.ownerName}: ${attack.kind} to ${to.name}`;
      token.title = showTroops ? titlePrefix : `${titlePrefix} - ${formatDuration(attack.remaining)} remaining`;
    }
    armyLayer.appendChild(token);
  }
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

function renderSendConfirmPanel(source, target) {
  if (!source || !target || source.id === target.id) {
    selectedTargetId = null;
    return renderPanel();
  }

  const isTransfer = target.owner === "player";
  const neutralBlockReason = getNeutralCaptureBlockReason(target, "player");
  const icon = isTransfer ? "\u{1F45F}" : "\u2694";
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
        renderAll();
        showNeutralCaptureLimitModal(neutralBlockReason);
        return;
      }
    }
    const mainCityBlockReason = clicked.owner === "player" ? "" : getMainCityAttackBlockReason(clicked, "player");
    if (mainCityBlockReason) {
      sendMode = false;
      selectedTargetId = null;
      renderAll();
      showToast(mainCityBlockReason);
      return;
    }
    const shieldBlockReason = getPeaceShieldAttackBlockReason(clicked, "player");
    if (shieldBlockReason) {
      sendMode = false;
      selectedTargetId = null;
      renderAll();
      showToast(shieldBlockReason);
      return;
    }
    selectedTargetId = clicked.id;
    renderAll();
    showTroopSliderModal(source, clicked);
    return;
  }

  if (clicked.owner === "player") {
    selectedSourceId = clicked.id;
    rememberOwnedAttackSource(clicked);
    selectedTargetId = null;
    sendMode = false;
    renderAll();
    requestAnimationFrame(() => centerOnCity(clicked.id));
    return;
  }

  selectedTargetId = clicked.id;
  sendMode = false;
  renderAll();
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
  renderAll();
}

function showTroopSliderModal(source, target) {
  if (!source || !target || source.owner !== "player" || source.id === target.id) return;
  if (source.troops < 1) {
    showToast("No troops available to send.");
    cancelSendMode();
    return;
  }

  const route = findRoute(source, target);
  if (!route || !route.points.length) {
    showToast("No land route found around the terrain.");
    selectedTargetId = null;
    renderAll();
    return;
  }

  const isTransfer = target.owner === "player";
  const mainCityBlockReason = isTransfer ? "" : getMainCityAttackBlockReason(target, "player");
  if (mainCityBlockReason) {
    showToast(mainCityBlockReason);
    cancelSendMode();
    return;
  }
  const shieldBlockReason = isTransfer ? "" : getPeaceShieldAttackBlockReason(target, "player");
  if (shieldBlockReason) {
    showToast(shieldBlockReason);
    cancelSendMode();
    return;
  }
  const commandLabel = isTransfer ? "Transfer" : "Attack";
  const commandIcon = isTransfer ? "&#128095;" : "&#9876;";
  const shieldDropWarning = isTransfer ? "" : getPeaceShieldAttackWarning(target);
  selectedTroopAmount = clamp(selectedTroopAmount, 1, source.troops);
  troopSliderActive = true;
  modal.classList.add("troop-slider-modal");
  modalTitle.textContent = `${commandLabel} troops`;
  modalBody.innerHTML = `
    <div class="troop-slider-panel ${isTransfer ? "transfer" : "attack"}">
      <div class="troop-route-summary">
        <div class="troop-route-city">
          <span>From</span>
          <strong>${escapeHtml(source.name)}</strong>
          <small><b id="troopSliderRemaining">${formatNumber(source.troops - selectedTroopAmount)}</b> remain</small>
        </div>
        <div class="troop-command-icon" aria-hidden="true">${commandIcon}</div>
        <div class="troop-route-city destination">
          <span>To</span>
          <strong>${escapeHtml(target.name)}</strong>
          <small>${isTransfer ? "Your city" : `${OWNER[target.owner].label} city`}</small>
        </div>
      </div>

      ${shieldDropWarning ? `<div class="shield-drop-warning" role="alert"><strong>Shield warning</strong><span>${escapeHtml(shieldDropWarning)}</span></div>` : ""}

      <div class="troop-slider-control">
        <div class="troop-slider-readout">
          <span>Troops to ${isTransfer ? "send" : "attack with"}</span>
          <strong id="troopSliderAmount">${formatNumber(selectedTroopAmount)}</strong>
        </div>
        <input id="troopAmountSlider" class="troop-amount-slider" type="range" min="1" max="${source.troops}" value="${selectedTroopAmount}" aria-label="Troops to ${isTransfer ? "transfer" : "attack with"}" />
        <div class="troop-slider-limits"><span>1</span><span>Max ${formatNumber(source.troops)}</span></div>
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
    selectedTroopAmount = clamp(Math.floor(Number(slider.value)), 1, source.troops);
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
  selectedTroopAmount = clamp(selectedTroopAmount, 1, source.troops);
  slider.value = selectedTroopAmount;
  const progress = source.troops <= 1 ? 100 : ((selectedTroopAmount - 1) / (source.troops - 1)) * 100;
  slider.style.setProperty("--slider-progress", `${progress}%`);
  modalBody.querySelector("#troopSliderAmount").textContent = formatNumber(selectedTroopAmount);
  modalBody.querySelector("#troopSliderRemaining").textContent = formatNumber(source.troops - selectedTroopAmount);

  const travel = travelTime(source, target, "player", route.length, selectedTroopAmount, target.owner === "player" ? "transfer" : "attack");
  const previewEl = modalBody.querySelector("#troopSliderPreview");
  if (target.owner === "player") {
    previewEl.className = "troop-slider-preview transfer";
    previewEl.innerHTML = `
      <div><span>Arrival</span><strong>${formatNumber(target.troops + selectedTroopAmount)} troops</strong></div>
      <div><span>Travel time</span><strong>About ${formatDuration(travel)}</strong></div>
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
      <div><span>Travel time</span><strong>About ${formatDuration(demoTravel)}</strong><small>Attack is still available</small>${demoNotice ? `<small>${escapeHtml(demoNotice)}</small>` : ""}</div>
    `;
    return;
  }

  const scoutedTarget = { ...target, troops: report.troops, troopFloat: report.troops };
  const preview = calculateBattlePreviewForTroops(source, scoutedTarget, selectedTroopAmount, route);
  const demoNotice = getDemoAttackNotice(preview.demoAttack);
  previewEl.className = `troop-slider-preview ${preview.success ? "win" : "lose"}`;
  previewEl.innerHTML = `
    <div><span>Scouted forecast</span><strong>${preview.success ? "Likely victory" : "Likely defeat"}</strong><small>${preview.label}</small></div>
    <div><span>${preview.success ? "Estimated survivors" : "Defenders left"}</span><strong>${formatNumber(preview.success ? preview.survivors : preview.defendersLeft)}</strong><small>About ${formatDuration(preview.travel)} travel</small>${demoNotice ? `<small>${escapeHtml(demoNotice)}</small>` : ""}</div>
  `;
}

function confirmTroopSliderOrder() {
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  const target = selectedTargetId ? cityById(selectedTargetId) : null;
  if (!source || !target || source.owner !== "player" || source.troops < 1) {
    troopSliderActive = false;
    modal.classList.remove("troop-slider-modal");
    if (modal.open) modal.close();
    clearSelection(false);
    renderAll();
    showToast("Order canceled. The map changed.");
    return;
  }

  selectedTroopAmount = clamp(selectedTroopAmount, 1, source.troops);
  const launched = launchAttack(source.id, target.id, 1, "player", selectedTroopAmount);
  if (!launched) return;
  troopSliderActive = false;
  modal.classList.remove("troop-slider-modal");
  if (modal.open) modal.close();
  clearSelection(false);
  renderAll();
}

function cancelSendMode() {
  sendMode = false;
  selectedTargetId = null;
  selectedTroopAmount = 1;
  renderAll();
}

function canRelocateMainCity(city) {
  return Boolean(state && city && city.owner === "player" && !isStronghold(city) && isMainCityForList(city));
}

function renderRelocateMainCityAction(city) {
  if (!canRelocateMainCity(city)) return "";
  return `
    <div class="relocate-main-city-action-panel">
      <div class="relocate-main-city-action-copy">
        <strong>Relocate main city</strong>
        <small>Give up this main city and claim a new neutral city using starter, midgame, then endgame spawn rules.</small>
      </div>
      <button id="relocateMainCityBtn" class="relocate-main-city-btn" type="button">Relocate</button>
    </div>
  `;
}

function bindRelocateMainCityButton(city) {
  modalBody.querySelector("#relocateMainCityBtn")?.addEventListener("click", () => showRelocateMainCityConfirm(city.id));
}

function showRelocateMainCityConfirm(cityId) {
  const city = cityById(cityId);
  if (!canRelocateMainCity(city)) {
    showToast("Only your current main city can relocate.");
    return;
  }
  if (!hasMainCityRelocationApi()) {
    showToast("Sign in online before relocating your main city.");
    return;
  }

  const troops = Math.max(0, Math.floor(Number(city.troops) || 0));
  modal.classList.add("relocate-main-city-modal");
  modalTitle.textContent = "Relocate Main City";
  modalBody.innerHTML = `
    <div class="relocate-main-warning">
      <strong>Relocate from ${escapeHtml(city.name)}?</strong>
      <p>Your current main city will become neutral at level ${formatNumber(city.level)}.</p>
      <p>${formatNumber(troops)} stationed troops will move to the new main city. Your other cities stay yours.</p>
      <p>The new city is chosen from starter maps first, then midgame maps, then endgame maps, and must be on a map with at least ${formatNumber(MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES)} neutral cities.</p>
      <div class="modal-actions">
        <button id="confirmRelocateMainCityBtn" class="danger-action" type="button">Yes</button>
        <button id="cancelRelocateMainCityBtn" class="safe-action" type="button">No</button>
      </div>
    </div>
  `;
  modalBody.querySelector("#cancelRelocateMainCityBtn")?.addEventListener("click", () => modal.close());
  modalBody.querySelector("#confirmRelocateMainCityBtn")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    const success = await relocateMainCity(city.id);
    if (!success && modal.open) event.currentTarget.disabled = false;
  });
  if (!modal.open) modal.showModal();
}

async function relocateMainCity(cityId) {
  if (!state || mainCityRelocationInFlight) return false;
  const city = cityById(cityId);
  if (!canRelocateMainCity(city)) {
    showToast("Only your current main city can relocate.");
    return false;
  }
  if (!hasMainCityRelocationApi()) {
    showToast("Sign in online before relocating your main city.");
    return false;
  }

  mainCityRelocationInFlight = true;
  try {
    showToast("Finding a new main city...");
    const targetRegionId = await pickAvailableStartingRegionId();
    if (!targetRegionId) {
      throw new Error(`No starter, midgame, or endgame map has ${MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES} neutral cities available.`);
    }
    await ensureOnlineIslandSeeded(targetRegionId, 20000);
    const result = await getOnlineApi().relocateMainCity({
      currentCityId: city.id,
      currentRegionId: getCityRegionId(city),
      regionCandidates: getRelocationSpawnRegionCandidates(),
      minimumNeutralCities: MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES,
      playerName: state.playerName,
      flag: state.flag,
      ownerKingPower: getKingPower(),
      worldId: ONLINE_WORLD_ID,
    });
    applyServerEconomyResult(result);

    const newMain = result?.newMainCity || {};
    const newRegionId = normalizeRegionId(newMain.regionId || targetRegionId);
    const newCityId = getKnownCityId(newMain.id) || state.mainCityId;
    if (newCityId) state.mainCityId = newCityId;
    if (state.online) {
      state.online.mainCityId = newCityId;
      state.online.mainRegionId = newRegionId;
      state.online.mainIslandId = newMain.islandId || getOnlineIslandId(newRegionId);
    }
    onlineOwnedCitiesCacheComplete = false;

    const movedTroops = Math.max(0, Math.floor(Number(result?.transferredTroops) || 0));
    addLog(`Main city relocated from ${city.name} to ${newMain.name || "a new city"}. ${formatNumber(movedTroops)} troops moved.`);
    showToast(`Main city relocated to ${newMain.name || "new city"}`);
    if (modal.open) modal.close();
    clearSelection(false);
    await refreshAllOwnedCities(true);
    if (newRegionId && newRegionId !== getActiveOnlineRegionId()) {
      await connectOnlineIsland(newRegionId, {
        claimHome: false,
        homeRegionId: newRegionId,
        profile: {
          mainIslandId: state.online?.mainIslandId || getOnlineIslandId(newRegionId),
          mainRegionId: newRegionId,
          mainCityId: newCityId,
        },
      });
    } else {
      renderAll();
      if (newCityId) centerOnCity(newCityId);
    }
    publishOnlinePresence(true);
    flushOnlineSave(true);
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    showToast(error?.message || "Could not relocate main city.");
    console.warn("Main city relocation failed", error);
    renderAll();
    return false;
  } finally {
    mainCityRelocationInFlight = false;
  }
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
        <small>Move stationed troops to your nearest friendly city and make this city neutral.</small>
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
      <p>You are giving up this city. ${formatNumber(troops)} stationed troops will move to ${escapeHtml(destinationLabel)}.</p>
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

function applyLocalRelinquishCity(city, destination) {
  if (!state || !city || !destination) return false;
  const transferredTroops = Math.max(0, Math.floor(Number(city.troops) || 0));
  destination.troopFloat = Math.max(0, Number(destination.troopFloat) || Number(destination.troops) || 0) + transferredTroops;
  destination.troops = Math.floor(destination.troopFloat);
  markOwnedCityChanged(destination, false);

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
    if (usesServerEconomyAuthority() && getOnlineApi()?.relinquishCity) {
      const result = await getOnlineApi().relinquishCity({ cityId: city.id, regionId });
      applyServerEconomyResult(result);
      const transferredTroops = Math.max(0, Math.floor(Number(result?.transferredTroops) || 0));
      const destinationName = result?.destinationCity?.name || getRelinquishDestinationPreview(city)?.name || "the nearest friendly city";
      addLog(`Relinquished ${city.name}. ${formatNumber(transferredTroops)} troops moved to ${destinationName}.`);
      showToast(`${city.name} relinquished`);
      if (modal.open) modal.close();
      clearSelection(false);
      renderAll();
      return true;
    }

    const destination = getRelinquishDestinationPreview(city, { loadedOnly: true });
    if (!destination) {
      showToast("You need another friendly city to receive the troops.");
      return false;
    }
    const transferredTroops = Math.max(0, Math.floor(Number(city.troops) || 0));
    applyLocalRelinquishCity(city, destination);
    addLog(`Relinquished ${city.name}. ${formatNumber(transferredTroops)} troops moved to ${destination.name}.`);
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
  const target = selectedTargetId ? cityById(selectedTargetId) : null;
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

function showCityInfoModal(cityId) {
  const city = cityById(cityId);
  if (!city) return;
  const stronghold = isStronghold(city);
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
        <div class="stat-chip"><span>Victory points</span><strong>${formatNumber(stats.victoryPoints)}</strong></div>
        <div class="stat-chip"><span>Troops</span><strong>${report ? formatNumber(report.troops) : "Unknown"}</strong></div>
        <div class="stat-chip"><span>Total defense</span><strong>${report ? formatNumber(report.totalDefense) : "Unknown"}</strong></div>
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
        <div class="stat-wide"><span>Total defense</span><strong>${formatNumber(stats.totalDefense)}</strong></div>
        <div class="stat-chip"><span>Owner</span><strong>${escapeHtml(getCityOwnerDisplayName(city))}</strong></div>
        <div class="stat-chip"><span>Troops stationed</span><strong>${formatNumber(city.troops)}</strong></div>
        <div class="stat-chip"><span>Defense level</span><strong>${formatNumber(stats.level)}</strong><small>matches a level ${formatNumber(stats.level)} city</small></div>
        <div class="stat-chip"><span>City walls</span><strong>${formatNumber(stats.cityWalls)}</strong></div>
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
      <div class="stat-wide"><span>Total defense</span><strong>${formatNumber(stats.totalDefense)}</strong></div>
      <div class="stat-chip"><span>Troops</span><strong>${formatNumber(city.troops)}</strong></div>
      <div class="stat-chip"><span>Guardian</span><strong>${stats.guardianPercent}%</strong></div>
      <div class="stat-chip"><span>City power</span><strong>${formatNumber(stats.cityPower)}</strong><small>+${CITY_LEVEL_STATS.victoryPointsPerLevel}/level</small></div>
      <div class="stat-chip"><span>Defense</span><strong>${stats.defensePercent}%</strong><small>+${CITY_LEVEL_STATS.defensePercentPerLevel}%/level${stats.strongholdDefenseBonusPercent ? ` + Stronghold ${formatNumber(stats.strongholdDefenseBonusPercent)}%` : ""}</small></div>
      <div class="stat-chip"><span>Troops production</span><strong>${formatNumber(stats.troopProductionPerHour)}/h</strong>${stats.warDrumsTroopBonusPercent ? `<small>War Drums +${formatNumber(stats.warDrumsTroopBonusPercent)}%</small>` : ""}</div>
      <div class="stat-chip"><span>City walls</span><strong>${formatNumber(stats.cityWalls)}</strong><small>+${CITY_LEVEL_STATS.cityWallsPerLevel}/level</small></div>
      <div class="stat-chip"><span>Gold production</span><strong>${formatNumber(stats.goldProductionPerHour)}/h</strong></div>
    </div>
  `;
  const cooldownRemaining = getCaptureCooldownRemaining(city);
  const mainCityStatus = getMainCityChangeStatus(city);
  const mainCityBlock = mainCityStatus.isMain
    ? `
      <div class="stat-wide main-city-status">
        <span>Home status</span>
        <strong>Main city</strong>
      </div>
      ${renderRelocateMainCityAction(city)}`
    : `
      <div class="main-city-action-panel">
        <div class="main-city-action-copy">
          <strong>Move main city here</strong>
          <small>Allowed while you own fewer than ${MAIN_CITY_CHANGE_CITY_LIMIT} cities. Once every 24 hours.</small>
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
      <div class="stat-wide"><span>Total defense</span><strong>${formatNumber(stats.totalDefense)}</strong></div>
      <div class="stat-chip"><span>Owner</span><strong>${escapeHtml(getCityOwnerDisplayName(city))}</strong></div>
      <div class="stat-chip"><span>Troops</span><strong>${formatNumber(city.troops)}</strong></div>
      <div class="stat-chip"><span>Victory points</span><strong>${formatNumber(stats.victoryPoints)}</strong><small>Drives growth and XP value</small></div>
      <div class="stat-chip"><span>City defense</span><strong>${stats.defensePercent}%</strong><small>${CITY_LEVEL_STATS.defensePercentPerLevel}% per level${stats.strongholdDefenseBonusPercent ? ` + Stronghold ${formatNumber(stats.strongholdDefenseBonusPercent)}%` : ""}</small></div>
      <div class="stat-chip"><span>City walls</span><strong>${formatNumber(stats.cityWalls)}</strong><small>Level-based static defense</small></div>
      <div class="stat-chip"><span>Guardian</span><strong>${stats.guardianPercent}%</strong><small>Player defense skill</small></div>
      <div class="stat-chip"><span>Troops production</span><strong>${formatNumber(stats.troopProductionPerHour)}/h</strong>${stats.warDrumsTroopBonusPercent ? `<small>War Drums +${formatNumber(stats.warDrumsTroopBonusPercent)}%</small>` : ""}</div>
      <div class="stat-chip"><span>Gold production</span><strong>${formatNumber(stats.goldProductionPerHour)}/h</strong></div>
      <div class="stat-chip"><span>Invested gold</span><strong>${formatNumber(city.investedGold || 0)}</strong><small>Cautious can refund part</small></div>
      ${cooldownRemaining > 0 ? `<div class="stat-wide"><span>Capture XP cooldown</span><strong>${formatDuration(cooldownRemaining)}</strong></div>` : ""}
      ${renderRelinquishCityAction(city)}
    </div>
  `;
  modalBody.querySelector("#changeMainCityBtn")?.addEventListener("click", () => changeMainCity(city.id));
  bindRelocateMainCityButton(city);
  bindRelinquishCityButton(city);
  if (!modal.open) modal.showModal();
}

function showCityListModal() {
  if (!state) return;
  modal.classList.add("city-list-modal");
  renderCityListModal();
  if (!modal.open) modal.showModal();
  refreshAllOwnedCities();
}

function renderCityListModal() {
  const cities = getSortedCityList();
  const regularCityCount = getAllOwnedRegularCitiesForDisplay().length;
  const pageCount = Math.max(1, Math.ceil(cities.length / CITY_LIST_PAGE_SIZE));
  cityListPage = clamp(cityListPage, 0, pageCount - 1);
  const start = cityListPage * CITY_LIST_PAGE_SIZE;
  const pageCities = cities.slice(start, start + CITY_LIST_PAGE_SIZE);
  modalTitle.textContent = "City list";
  modalBody.innerHTML = `
    <div class="city-list-panel">
      <div class="city-list-summary">
        <span>Owned across maps</span>
        <strong>${formatNumber(regularCityCount)}</strong>
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
  const canBuy = state && !shopPurchaseInFlight && Math.floor(Number(state.gold) || 0) >= item.cost;
  return `
    <article class="shop-item">
      <div class="shop-item-image-placeholder ${item.icon ? "has-image" : ""}" aria-hidden="true">
        ${renderItemIcon(item, "shop-item-image")}
      </div>
      <div class="shop-item-copy">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${formatNumber(item.cost)} gold</span>
        <small>Owned: ${formatNumber(owned)}</small>
        <small>${escapeHtml(item.description)}</small>
      </div>
      <button class="shop-buy-btn" data-shop-buy="${escapeHtml(item.id)}" type="button" ${canBuy ? "" : "disabled"}>Buy</button>
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
            <span>Owned: ${formatNumber(selectedEntry.count)}</span>
          </div>
          <button class="inventory-use-btn" data-inventory-use="${escapeHtml(selectedEntry.id)}" type="button">Use</button>
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
  }
  saveGame();
  renderHud();
  renderPanel();
  if (profileScreen?.classList.contains("open")) renderProfileScreen();
  if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
  return true;
}

async function useRoyalPeaceShield(item) {
  if (usesServerEconomyAuthority()) {
    await useServerInventoryItem(item);
    return;
  }
  if (!consumeInventoryItem(item)) return;
  const now = Date.now();
  const currentExpiresAtMs = getActivePeaceShieldExpiresAtMs();
  const startsAtMs = Math.max(now, currentExpiresAtMs);
  const expiresAtMs = startsAtMs + ROYAL_PEACE_SHIELD_DURATION_MS;
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
  if (usesServerEconomyAuthority()) {
    await useServerInventoryItem(item);
    return;
  }
  if (!consumeInventoryItem(item)) return;
  const now = Date.now();
  const currentExpiresAtMs = getActiveWarDrumsExpiresAtMs();
  const startsAtMs = Math.max(now, currentExpiresAtMs);
  const expiresAtMs = startsAtMs + WAR_DRUMS_DURATION_MS;
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
    try {
      const result = await getOnlineApi().upgradeCity({
        cityId: city.id,
        regionId: getCityRegionId(city),
        levels,
      });
      applyServerEconomyResult(result);
      const updatedCity = cityById(city.id) || city;
      addLog(`${updatedCity.name} upgraded to level ${formatNumber(updatedCity.level)}.`);
      showToast(`${updatedCity.name} upgraded`);
      renderAll();
    } catch (error) {
      onlineLastError = error?.message || String(error);
      showToast(error?.message || "Could not upgrade city.");
      console.warn("Server city upgrade failed", error);
      renderAll();
    } finally {
      serverCityUpgradeInFlightIds.delete(inFlightKey);
    }
    return;
  }
  let upgraded = 0;
  let xpAward = 0;
  while (upgraded < levels && city.level < MAX_CITY_LEVEL) {
    const cost = getLevelCost(city);
    if (state.gold < cost) break;
    state.gold -= cost;
    city.investedGold = Math.max(0, Math.floor(Number(city.investedGold) || 0)) + cost;
    city.level = clampCityLevel(city.level + 1);
    xpAward += getCityUpgradeXpAward(city);
    upgraded += 1;
  }

  if (!upgraded) {
    showToast(city.level >= MAX_CITY_LEVEL ? `${city.name} is max level` : "Not enough gold");
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

function getMultiLevelCost(city, levels) {
  if (isStronghold(city)) return Infinity;
  if (!city || city.level >= MAX_CITY_LEVEL) return Infinity;
  const startLevel = clampCityLevel(city.level);
  const levelCount = Math.max(0, Math.floor(Number(levels) || 0));
  const targetLevel = clamp(startLevel + levelCount, startLevel, MAX_CITY_LEVEL);
  if (targetLevel <= startLevel) return 0;
  const totalCost = MILLION_LORDS_CITY_COST_BASE * (
    Math.pow(MILLION_LORDS_CITY_COST_GROWTH, targetLevel - 1)
    - Math.pow(MILLION_LORDS_CITY_COST_GROWTH, startLevel - 1)
  );
  const upgradeReductionPercent = city?.owner === "player" ? getControlledStrongholdUpgradeCostReductionPercent("player") : 0;
  const discountedCost = totalCost * (1 - upgradeReductionPercent / 100);
  return Math.max(0, Math.floor(discountedCost + 0.000001));
}

function getLevelCost(city) {
  return getMultiLevelCost(city, 1);
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

function showLegacyEmpireModal() {
  const attackCost = getSkillCost("attack");
  const incomeCost = getSkillCost("income");
  const defenseCost = getSkillCost("defense");
  const speedCost = getSkillCost("speed");
  modalTitle.textContent = "Empire Skills";
  modalBody.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><strong>${formatNumber(Math.floor(state.gold))}</strong><small>gold available</small></div>
      <div class="stat-card"><strong>+${getGoldPerSecond().toFixed(1)}/s</strong><small>gold income</small></div>
      <div class="stat-card"><strong>${getAllOwnedRegularCitiesForDisplay().length}</strong><small>cities owned</small></div>
    </div>
    ${skillRow("Attack", "attack", "Army attack power", attackCost)}
    ${skillRow("Income", "income", "Gold and troop growth", incomeCost)}
    ${skillRow("Defense", "defense", "Player city defense", defenseCost)}
    ${skillRow("March", "speed", "Army travel speed", speedCost)}
  `;
  modalBody.querySelectorAll("button[data-skill]").forEach(btn => {
    btn.addEventListener("click", () => buySkill(btn.dataset.skill));
  });
  if (!modal.open) modal.showModal();
}

function legacySkillRow(label, key, description, cost) {
  const level = Number(state.upgrades[key]) || 0;
  const multiplier = skillMultiplier(key).toFixed(2).replace(/\.00$/, "");
  const disabled = state.gold < cost ? "disabled" : "";
  return `
    <div class="skill-row">
      <div><strong>${label} Lv ${level} \u00B7 x${multiplier}</strong><br><small>${description}</small></div>
      <button data-skill="${key}" ${disabled}>${formatNumber(cost)}</button>
    </div>
  `;
}

function legacyBuySkill(skill) {
  const cost = getSkillCost(skill);
  if (state.gold < cost) return;
  state.gold -= cost;
  state.upgrades[skill] = Math.max(0, Number(state.upgrades[skill]) || 0) + 1;
  addLog(`Empire skill improved: ${skill} is now level ${state.upgrades[skill]}.`);
  saveGame();
  showEmpireModal();
  renderAll();
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
  const disabled = Math.max(0, Math.floor(Number(state.character?.skillPoints) || 0)) < 1 || capped ? "disabled" : "";
  const buttonLabel = capped ? "Max" : "+1";
  return `
    <div class="skill-row">
      <div><strong>${config.label} Lv ${level} - +${percent}%</strong><br><small>${config.description}${capText}</small></div>
      <button data-skill="${key}" ${disabled}>${buttonLabel}</button>
    </div>
  `;
}

function buySkill(skill) {
  const config = SKILL_CONFIG[skill];
  if (!config) return;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  if (isSkillAtCap(skill)) {
    showToast(`${config.label} is capped at ${config.maxPercent}%.`);
    return;
  }
  if (state.character.skillPoints < 1) {
    showToast("Earn a hero level for another skill point.");
    return;
  }
  state.character.skillPoints -= 1;
  state.upgrades[skill] = getSkillLevel(skill) + 1;
  addLog(`${SKILL_CONFIG[skill].label} improved to level ${state.upgrades[skill]}.`);
  saveGame();
  renderAll();
}

function resetSkills() {
  if (!state) return;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  const spentPoints = getSpentSkillPoints();
  if (spentPoints < 1) {
    showToast("No spent skill points to reset.");
    renderProfileSkills();
    return;
  }
  const currentGold = Math.floor(Number(state.gold) || 0);
  if (currentGold < SKILL_RESET_COST) {
    showToast(`Skill reset costs ${formatNumber(SKILL_RESET_COST)} gold.`);
    renderProfileSkills();
    return;
  }
  state.gold = currentGold - SKILL_RESET_COST;
  state.character.skillPoints = Math.max(0, Math.floor(Number(state.character.skillPoints) || 0)) + spentPoints;
  state.upgrades = createDefaultSkills();
  addLog(`Skills reset for ${formatNumber(SKILL_RESET_COST)} gold. Refunded ${formatNumber(spentPoints)} skill ${spentPoints === 1 ? "point" : "points"}.`);
  saveGame();
  renderAll();
  showToast(`Skills reset: +${formatNumber(spentPoints)} points`);
}

function getSkillCost(skill) {
  const level = Math.max(0, Number(state.upgrades[skill]) || 0);
  return Math.floor(450 * Math.pow(level + 1, 1.85));
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
  const outgoing = getOutgoingAttacks();
  outgoingAttackBtn.hidden = outgoing.length === 0;
  outgoingAttackBtn.classList.toggle("active", outgoing.length > 0);
  if (!outgoing.length) {
    if (outgoingAttackCount) outgoingAttackCount.textContent = "0";
    if (outgoingAttackTime) outgoingAttackTime.textContent = "Outgoing";
    outgoingAttackBtn.removeAttribute("title");
    outgoingAttackBtn.setAttribute("aria-label", "Outgoing armies");
    if (modal.open && modal.classList.contains("outgoing-attack-modal")) modal.close();
    return;
  }

  const soonest = formatDuration(outgoing[0].remaining);
  if (outgoingAttackCount) outgoingAttackCount.textContent = formatNumber(outgoing.length);
  if (outgoingAttackTime) outgoingAttackTime.textContent = soonest;
  outgoingAttackBtn.title = `${formatOutgoingMissionSummary(outgoing)} - soonest ${soonest}`;
  outgoingAttackBtn.setAttribute("aria-label", outgoingAttackBtn.title);

  if (modal.open && modal.classList.contains("outgoing-attack-modal")) {
    renderOutgoingAttacksModalContent(outgoing);
  }
}

function getArmyKindCounts(missions) {
  return missions.reduce((counts, mission) => {
    if (mission.kind === "scout") counts.scouts += 1;
    else counts.attacks += 1;
    return counts;
  }, { attacks: 0, scouts: 0 });
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
  return parts.join(", ") || "No outgoing armies";
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
  const city = cityById(cityId);
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
  const outgoing = getOutgoingAttacks();
  if (!outgoing.length) {
    showToast("No outgoing attacks or scouts right now.");
    updateOutgoingAttackUi();
    return;
  }
  modal.classList.remove("incoming-attack-modal");
  modal.classList.add("outgoing-attack-modal");
  renderOutgoingAttacksModalContent(outgoing);
  if (!modal.open) modal.showModal();
}

function renderOutgoingAttacksModalContent(outgoing = getOutgoingAttacks()) {
  if (!outgoing.length) {
    modalTitle.textContent = "Outgoing Armies";
    modalBody.innerHTML = `<div class="incoming-attack-empty">No active outgoing attacks or scouts.</div>`;
    return;
  }

  modalTitle.textContent = outgoing.length === 1 ? "Outgoing Army" : "Outgoing Armies";
  const summary = formatOutgoingMissionSummary(outgoing);
  modalBody.innerHTML = `
    <div class="incoming-attack-panel">
      <div class="incoming-attack-summary">
        <strong>${formatNumber(outgoing.length)}</strong>
        <span>${summary} ${outgoing.length === 1 ? "is" : "are"} traveling now.</span>
        <small>${outgoing[0].isResolving ? "Resolving arrived order" : `Soonest arrival: ${formatDuration(outgoing[0].remaining)}`}</small>
      </div>
      <div class="incoming-attack-list">
        ${outgoing.map(renderOutgoingAttackCard).join("")}
      </div>
    </div>
  `;

  modalBody.querySelectorAll("[data-outgoing-city]").forEach(button => {
    button.addEventListener("click", () => focusOutgoingAttackCity(button.dataset.outgoingCity));
  });
}

function renderOutgoingAttackCard(mission) {
  const city = mission.target;
  const sourceName = mission.source?.name || "Unknown city";
  const targetName = city?.name || "Unknown target";
  const regionName = getRegionLabel(city ? getCityRegionId(city) : getCityRegionId(mission.toId));
  const ownerName = city ? getBattleReportOwnerName(city, city.owner) : "Unknown owner";
  const isScout = mission.kind === "scout";
  const missionLabel = isScout ? "Scout" : "Attack";
  const forceDetails = isScout
    ? `1 scout from ${escapeHtml(sourceName)}`
    : `${formatNumber(mission.troops)} troops from ${escapeHtml(sourceName)}`;
  const targetDetails = city
    ? `${escapeHtml(ownerName)} - ${formatNumber(city.troops)} troops`
    : "Target details are loading";
  const locateButton = city
    ? `<button class="incoming-attack-locate" data-outgoing-city="${escapeHtml(city.id)}" type="button" aria-label="Go to ${escapeHtml(city.name)}">&#8982;</button>`
    : `<button class="incoming-attack-locate" type="button" aria-label="Target unavailable" disabled>&#8982;</button>`;

  return `
    <article class="incoming-attack-card outgoing-attack-card ${isScout ? "outgoing-scout-card" : ""}">
      <div class="incoming-attack-badge">
        <strong>${mission.isResolving ? "Resolving" : formatDuration(mission.remaining)}</strong>
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
    </article>
  `;
}

async function focusOutgoingAttackCity(cityId) {
  const city = cityById(cityId);
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
    cityCount: Math.max(0, Math.floor(Number(raw.cityCount) || 0)),
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
    if (!existing || entry.kingPower > existing.kingPower || entry.updatedAtMs > existing.updatedAtMs) {
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
  setLeaderboardStatus("Publishing your score...");
  try {
    let rows = [];
    let usedFallback = false;
    let globalError = null;
    try {
      await publishOnlinePresence(true);
      const published = await publishKingPowerLeaderboard({ force: forcePublish });
      rows = await api.loadKingPowerLeaderboard(KING_POWER_LEADERBOARD_LIMIT);
      if (!published && !rows.length) {
        globalError = new Error("King Power leaderboard entry was not published.");
      }
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
    .reverse();

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
      <button class="battle-report-detail-btn" data-report-detail="${escapeHtml(report.id)}" type="button" aria-label="Open report details">&#128203;</button>
    </article>
  `;
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
      </div>
      <div class="battle-report-detail-grid">
        <div><span>Type</span><strong>${escapeHtml(getBattleReportTypeLabel(report.type))}</strong></div>
        <div><span>Opponent</span><strong>${escapeHtml(report.opponentName || report.ownerName || "Unknown")}</strong></div>
        <div><span>${report.type === "scout" ? "Scouted troops" : "Troops sent"}</span><strong>${formatNumber(report.type === "scout" ? report.troopCount : report.sentTroops)}</strong></div>
        <div><span>Total defense</span><strong>${formatNumber(report.totalDefense)}</strong></div>
        <div><span>Survivors</span><strong>${formatNumber(report.survivors)}</strong></div>
        <div><span>Defenders left</span><strong>${formatNumber(report.defendersLeft)}</strong></div>
        <div><span>Attackers lost</span><strong>${formatNumber(report.attackerLosses)}</strong></div>
        <div><span>Defenders lost</span><strong>${formatNumber(report.defenderLosses)}</strong></div>
      </div>
      <p>${escapeHtml(report.summary || getBattleReportSummary(report))}</p>
    </div>
  `;
  modalBody.querySelector("#battleReportBackBtn")?.addEventListener("click", showLogModal);
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
      <li>All cities start at Level 1 and can upgrade to Level 100.</li>
      <li>The world has ${formatNumber(getRegionIds().length)} maps and ${formatNumber(ISLAND_CITY_COUNT)} total city slots.</li>
      <li>The center island keeps its middle clear for a future feature.</li>
      <li>New online players claim starting cities on starter maps with at least ${formatNumber(MIN_NEW_PLAYER_SPAWN_NEUTRAL_CITIES)} neutral cities, then midgame maps, then endgame maps.</li>
      <li>Your main city starts with 50 troops. Gray cities start with 10 defending troops.</li>
      <li>Use Recruit, Level Up, and Skills to grow faster. Leveling increases walls, defense %, troop production, and gold production.</li>
      <li>Every signed-in player claims one starting city, then expands through neutral captures and player combat.</li>
    </ul>
  `;
  modalBody.innerHTML = `
    <p>Crownlands is real-time conquest: cities produce troops and gold while armies travel across terrain-aware routes.</p>
    <ul>
      <li>You start with one main city, 50 troops, and 500 gold.</li>
      <li>Neutral expansion has two limits: 30 neutral captures per local day, and neutral captures stop once you own 30 cities.</li>
      <li>After that, expand by attacking player-owned cities.</li>
      <li>Send Troops is single-click after setup: pick a march percent, then tap one destination to launch.</li>
      <li>Scout Nearby costs ${formatNumber(SCOUT_NEARBY_COST)} gold and covers the current map only.</li>
      <li>Regroup costs ${formatNumber(REGROUP_COST)} gold, previews a larger red radius, then sends all troops from nearby owned cities into the selected city.</li>
      <li>The top-right fullscreen button expands the game surface and the game disables page text selection while playing.</li>
      <li>City level creates victory points for combat value, while passive gold follows the Million Lords city production curve.</li>
      <li>City defense is level x 3%, plus wall strength and any Guardian skill bonus for your defending troops.</li>
      <li>Troop production is VP x 3, with Recruiter adding more production from VP. Passive gold uses ML city production VP x ${formatNumber(MILLION_LORDS_PASSIVE_GOLD_PER_CITY_VP)}, with Prosperous and Stronghold bonuses added on top.</li>
      <li>Army travel uses route distance plus troop-size bands. Larger armies march slower, scouts move as one troop, and Rusher reduces travel time.</li>
      <li>Glowing pickups appear near your owned cities on the current island during active play once per minute, alternating between gold and stored troop-production rewards. Daily pickup limits are ${formatNumber(HARVEST_BONUS_DAILY_GOLD_LIMIT)} gold and ${formatNumber(HARVEST_BONUS_DAILY_TROOP_LIMIT)} troop pickups.</li>
      <li>Prosperous boosts gold, Rusher boosts travel speed, and Striker boosts attacking combat power.</li>
      <li>Fearless saves some attacking losses, Brave saves some defending losses, Scavenger and Salvager recover gold from kills, and Cautious refunds some invested gold when you lose a city.</li>
      <li>Captured cities enter a one-hour XP cooldown. Attacking during cooldown still works, but capture XP is reduced.</li>
      <li>Main cities cannot be attacked. Use your main city as a protected home base while expanding from other cities.</li>
      <li>Demo Attacks protect weaker kingdoms: much stronger attackers send fewer effective troops, march slower, earn 0 XP, and defenders earn bonus XP.</li>
      <li>Items and advisors are intentionally not included in this prototype pass.</li>
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
    button.innerHTML = isActive ? "&times;" : "<span aria-hidden=\"true\">&#x26F6;</span>";
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
  mapFrame.classList.toggle("low-zoom", zoom <= LOW_ZOOM_PERFORMANCE_THRESHOLD);
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
  return Boolean(mapFrame?.classList.contains("zooming"));
}

function markZoomInteraction() {
  if (!mapFrame) return;
  interactionRenderLockUntil = performance.now() + ZOOM_RENDER_SETTLE_MS;
  mapFrame.classList.add("zooming");
  if (zoomSettleTimer) window.clearTimeout(zoomSettleTimer);
  zoomSettleTimer = window.setTimeout(() => {
    zoomSettleTimer = null;
    mapFrame.classList.remove("zooming");
    cityRenderSignature = "";
    if (!state) return;
    renderPaths();
    renderCities(true);
    renderPanel();
    renderArmies();
  }, ZOOM_RENDER_SETTLE_MS);
}

function updateCameraTransform() {
  if (!mapWorld || !mapFrame) return;
  const rect = mapFrame.getBoundingClientRect();
  const dimensions = getActiveMapDimensions();
  zoom = clampZoomForViewport(zoom, rect, dimensions);
  updateZoomPerformanceClasses();
  const maxX = Math.max(0, dimensions.width - rect.width / zoom);
  const maxY = Math.max(0, dimensions.height - rect.height / zoom);
  camera.x = clamp(camera.x, 0, maxX);
  camera.y = clamp(camera.y, 0, maxY);
  const offset = getMapViewportOffset(rect, dimensions);
  mapWorld.style.transform = `translate3d(${offset.x - camera.x * zoom}px, ${offset.y - camera.y * zoom}px, 0) scale(${zoom})`;
  updateMainCityReturnButton(rect);
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
  const city = cityById(cityId);
  if (!city || !mapFrame) return;
  if (!isCityInActiveMap(city)) {
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
  updateCameraTransform();
  markZoomInteraction();
  renderPanel();
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
  updateCameraTransform();
  markZoomInteraction();
}

function isMapNodeInteractionTarget(target) {
  return Boolean(target?.closest(".city-node, .city-action-wheel, .teleport-node, .harvest-bonus-node"));
}

function startPan(event) {
  if (!state || event.button > 0 || isMapInteractionBlocked()) return;

  const startedOnMapNode = isMapNodeInteractionTarget(event.target);
  if (startedOnMapNode && event.pointerType === "touch") {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    mapFrame.setPointerCapture?.(event.pointerId);
    if (activePointers.size >= 2) {
      cityTapState = null;
      beginPinch();
    } else {
      suppressMapClick = false;
    }
    return;
  }

  if (startedOnMapNode) {
    suppressMapClick = false;
    return;
  }

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
  };
  suppressMapClick = false;
  mapFrame.classList.add("dragging");
}

function movePan(event) {
  if (isMapInteractionBlocked()) return;
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
  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) panState.moved = true;
  camera.x = panState.cameraX - dx / zoom;
  camera.y = panState.cameraY - dy / zoom;
  updateCameraTransform();
}

function endPan(event) {
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
  mapFrame.releasePointerCapture?.(event.pointerId);
  if (suppressMapClick) {
    window.setTimeout(() => { suppressMapClick = false; }, 80);
  }
  renderPanel();
}

function handleMapClick(event) {
  if (isMapInteractionBlocked()) return;
  if (suppressMapClick) return;
  if (event.target.closest(".city-node")) return;
  clearSelection();
}
function randomChoice(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

if (startBtn) startBtn.addEventListener("click", () => startFromInput(false));
if (freshBtn) freshBtn.addEventListener("click", () => startFromInput(true));
if (googleSignInBtn) googleSignInBtn.addEventListener("click", handleGoogleSignIn);
if (enterKingdomBtn) enterKingdomBtn.addEventListener("click", () => startFromInput(false));
if (googleSignOutBtn) googleSignOutBtn.addEventListener("click", handleGoogleSignOut);
window.addEventListener("crownlands:online-ready", () => {
  updateOnlineUi();
  updatePushAlertsUi();
});
window.addEventListener("crownlands:auth", async () => {
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
if (pushAlertsBtn) pushAlertsBtn.addEventListener("click", togglePushNotifications);
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
  const cityButton = event.target.closest(".city-node");
  if (cityButton && cityLayer.contains(cityButton)) {
    cityTapState = {
      pointerId: event.pointerId,
      cityId: cityButton.dataset.cityId,
      x: event.clientX,
      y: event.clientY,
      selected: false,
    };
  }
  if (event.target.closest(".city-node, .city-wheel-action")) interactionRenderLockUntil = performance.now() + 600;
});
cityLayer.addEventListener("pointerup", event => {
  if (isMapInteractionBlocked()) return;
  if (!cityTapState || cityTapState.pointerId !== event.pointerId) return;
  const cityButton = event.target.closest(".city-node");
  const moved = Math.hypot(event.clientX - cityTapState.x, event.clientY - cityTapState.y) > 12;
  const sameCity = cityButton && cityLayer.contains(cityButton) && cityButton.dataset.cityId === cityTapState.cityId;
  if (!moved && sameCity) {
    event.stopPropagation();
    cityTapState.selected = true;
    suppressMapClick = true;
    selectCity(cityTapState.cityId);
    window.setTimeout(() => { suppressMapClick = false; }, 80);
  } else {
    cityTapState = null;
  }
});
cityLayer.addEventListener("pointercancel", event => {
  if (cityTapState?.pointerId === event.pointerId) cityTapState = null;
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
  const cityButton = event.target.closest(".city-node");
  if (!cityButton || !cityLayer.contains(cityButton)) return;
  event.stopPropagation();
  if (cityTapState?.selected && cityTapState.cityId === cityButton.dataset.cityId) {
    cityTapState = null;
    return;
  }
  cityTapState = null;
  selectCity(cityButton.dataset.cityId);
});
mapFrame.addEventListener("pointerdown", startPan);
mapFrame.addEventListener("pointermove", movePan);
mapFrame.addEventListener("pointerup", endPan);
mapFrame.addEventListener("pointercancel", endPan);
mapFrame.addEventListener("click", handleMapClick);
mapFrame.addEventListener("wheel", handleWheelZoom, { passive: false });
window.addEventListener("resize", updateCameraTransform);
document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForDeployedUpdate(true);
});
window.addEventListener("online", () => checkForDeployedUpdate(true));
document.addEventListener("keydown", event => {
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
  modal.classList.remove("relocate-main-city-modal");
  if (!troopSliderActive) return;
  troopSliderActive = false;
  cancelSendMode();
});

if (playerNameInput) playerNameInput.value = cleanName(getOnlineApi()?.getUser?.()?.displayName) || "Ricky";
applyWorldDimensions();
renderWorldMap();
renderIslandTeleporters();
updateFullscreenButton();
updateOnlineUi();
requestAnimationFrame(frame);
