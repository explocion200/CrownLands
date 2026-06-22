const WORLD_CONFIG = window.CROWNLANDS_WORLD_CONFIG || {};
const WORLD_SCHEMA_VERSION = Number(WORLD_CONFIG.version) || 23;
const WORLD_REGIONS = Array.isArray(WORLD_CONFIG.regions) ? WORLD_CONFIG.regions : [];
const LAND_BRIDGES = Array.isArray(WORLD_CONFIG.landBridges) ? WORLD_CONFIG.landBridges : [];
const REGION_CITY_COUNT = Math.max(1, Math.floor(Number(WORLD_CONFIG.cityCountPerRegion) || 50));
const RESET_GENERATION = "fresh-2026-06-21";
const STORAGE_KEY = `crownlands-realtime-${RESET_GENERATION}`;
const LEGACY_STORAGE_KEYS = [];
const SAVE_EVERY_SECONDS = 1.5;
const ONLINE_SAVE_SECONDS = 8;
const ONLINE_SAVE_SLOT = `default-${RESET_GENERATION}`;
const ONLINE_WORLD_ID = `main-${RESET_GENERATION}`;
const ONLINE_LEGACY_ISLAND_ID = ONLINE_WORLD_ID;
const DEFAULT_ONLINE_REGION_ID = WORLD_REGIONS.find(region => region.id === "west")?.id || WORLD_REGIONS[0]?.id || "center";
const ONLINE_CITY_SYNC_SECONDS = 6;
const ONLINE_PRESENCE_SECONDS = 10;
const ONLINE_PRESENCE_STALE_SECONDS = 90;
const ONLINE_ARMY_EXPIRY_GRACE_SECONDS = 8;
const HUD_RENDER_INTERVAL_MS = 250;
const MAP_RENDER_INTERVAL_MS = 1600;
const CITY_LIST_PAGE_SIZE = 5;
const MAIN_CITY_CHANGE_CITY_LIMIT = 30;
const MAIN_CITY_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_OFFLINE_PROGRESS_SECONDS = 7 * 24 * 60 * 60;
const WORLD_WIDTH = Math.max(1, Math.floor(Number(WORLD_CONFIG.width) || 10000));
const WORLD_HEIGHT = Math.max(1, Math.floor(Number(WORLD_CONFIG.height) || 7600));
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
const WEST_ISLAND_ART_SRC = "assets/west-island.png";
const WEST_ISLAND_IMAGE_WIDTH = 1024;
const WEST_ISLAND_IMAGE_HEIGHT = 1536;
const WEST_CENTER_TELEPORT_IMAGE_POINT = { x: 802, y: 795 };
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
const NORTH_ISLAND_IMAGE_WIDTH = 1448;
const NORTH_ISLAND_IMAGE_HEIGHT = 1086;
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
const EAST_ISLAND_IMAGE_WIDTH = 1086;
const EAST_ISLAND_IMAGE_HEIGHT = 1448;
const EAST_CENTER_TELEPORT_IMAGE_POINT = { x: 305, y: 760 };
const EAST_ISLAND_RESERVED_CIRCLES = [
  { x: 540, y: 605, r: 125 },
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
const SOUTH_ISLAND_IMAGE_WIDTH = 1446;
const SOUTH_ISLAND_IMAGE_HEIGHT = 1087;
const SOUTH_CENTER_TELEPORT_IMAGE_POINT = { x: 724, y: 205 };
const SOUTH_ISLAND_RESERVED_CIRCLES = [
  { x: SOUTH_CENTER_TELEPORT_IMAGE_POINT.x, y: SOUTH_CENTER_TELEPORT_IMAGE_POINT.y, r: 92 },
  { x: 724, y: 550, r: 145 },
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
const CENTER_ISLAND_IMAGE_WIDTH = 1254;
const CENTER_ISLAND_IMAGE_HEIGHT = 1254;
const CENTER_ISLAND_TELEPORTS = [
  { id: "center-west", label: "West", targetRegionId: "west", point: { x: 210, y: 610 } },
  { id: "center-north", label: "North", targetRegionId: "north", point: { x: 625, y: 156 } },
  { id: "center-east", label: "East", targetRegionId: "east", point: { x: 1028, y: 610 } },
  { id: "center-south", label: "South", targetRegionId: "south", point: { x: 625, y: 1018 } },
];
const CENTER_ISLAND_RESERVED_CIRCLES = [
  { x: 625, y: 610, r: 140 },
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
const BITMAP_ISLAND_IDS = ["west", "north", "east", "south", "center"];
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
const HARVEST_BONUS_MAX_ACTIVE_PER_ISLAND = 6;
const HARVEST_BONUS_EXPIRE_SECONDS = 1800;
const HARVEST_BONUS_GOLD_SECONDS = 300;
const HARVEST_BONUS_MIN_GOLD = 500;
const HARVEST_BONUS_TROOP_SECONDS = 3600;
const HARVEST_BONUS_MIN_TROOPS = 50;
const HARVEST_BONUS_CITY_CLEARANCE = 132;
const HARVEST_BONUS_PORTAL_CLEARANCE = 148;
const HARVEST_BONUS_PICKUP_CLEARANCE = 116;
const HARVEST_BONUS_TERRAIN_PADDING = 22;
const HARVEST_BONUS_LAND_CLEARANCE = 64;
const NEUTRAL_CITY_COUNT_LIMIT = 30;
const PLAYER_START_TROOPS = 50;
const PLAYER_SLOT_START_TROOPS = 50;
const NEUTRAL_START_TROOPS = 10;
const TEST_STARTING_GOLD = 500;
const ISLAND_CITY_COUNT = WORLD_REGIONS.reduce((total, region) => total + (region.id === "center" ? CENTER_REGION_CITY_COUNT : REGION_CITY_COUNT), 0);
const SCOUT_REPORT_SECONDS = 120;
const SCOUT_NEARBY_COST = 1000;
const SCOUT_NEARBY_RADIUS = 420;
const BASE_TROOP_ATTACK_POWER = 2;
const ARMY_TRAVEL_SECONDS_PER_MAP_UNIT = 0.18;
const ARMY_TRAVEL_MIN_SECONDS = 30;
const ARMY_TRAVEL_MAX_SECONDS = 1800;
const ARMY_TRAVEL_KIND_MULTIPLIERS = { scout: 0.75, transfer: 0.95, attack: 1 };
const ARMY_TRAVEL_TROOP_BAND_LIMITS = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000];
const ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS = [1, 1.18, 1.38, 1.62, 1.9, 2.24, 2.62, 3.06, 3.5];
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
];
const FLAG_SYMBOLS = [
  { key: "crown", label: "Crown", glyph: "\u265B" },
  { key: "castle", label: "Castle", glyph: "\u265C" },
  { key: "star", label: "Star", glyph: "\u2726" },
  { key: "swords", label: "Swords", glyph: "\u2694" },
];



function getCastleStage(level) {
  if (level >= 100) return 5;
  if (level >= 75) return 4;
  if (level >= 50) return 3;
  if (level >= 25) return 2;
  return 1;
}

function getCastleAsset(stage) {
  const assets = {
    1: "assets/castles/shack.png",
    2: "assets/castles/fort.png",
    3: "assets/castles/keep.png",
    4: "assets/castles/castle.png",
    5: "assets/castles/city.png",
  };
  return assets[stage] || assets[1];
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


let state;
let selectedSourceId = null;
let lastSelectedOwnedCityId = null;
let selectedTargetId = null;
let sendMode = false;
let selectedMarchPercent = DEFAULT_MARCH_PERCENT;
let selectedTroopAmount = 1;
let troopSliderActive = false;
let scoutNearbySourceId = null;
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
let onlineIslandUnsubscribe = null;
let onlineWorldLoading = false;
let onlineWorldConnected = false;
let onlineCitiesLoaded = false;
let onlineFreshClaimCityId = "";
let onlineActiveRegionId = DEFAULT_ONLINE_REGION_ID;
let onlineCitySyncTimer = 0;
let onlineCitySyncInFlight = false;
let onlineCitySyncQueued = false;
let onlineArmies = [];
let onlineArmiesByIsland = new Map();
let onlineArmyUnsubscribes = [];
let onlinePresence = [];
let onlinePresenceTimer = 0;
let onlinePresenceInFlight = false;
let pendingOfflineProgressSeconds = 0;
let pendingOfflineProductionCities = [];
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
const neutralCapText = document.getElementById("neutralCapText");
const characterLevelBadge = document.getElementById("characterLevelBadge");
const characterXpText = document.getElementById("characterXpText");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const mainCityReturnBtn = document.getElementById("mainCityReturnBtn");
const profileBtn = document.getElementById("profileBtn");
const hudKingdomFlag = document.getElementById("hudKingdomFlag");
const profileScreen = document.getElementById("profileScreen");
const profileCloseBtn = document.getElementById("profileCloseBtn");
const profileScreenTitle = document.getElementById("profileScreenTitle");
const profileTabBtn = document.getElementById("profileTabBtn");
const skillsTabBtn = document.getElementById("skillsTabBtn");
const profileView = document.getElementById("profileView");
const skillsView = document.getElementById("skillsView");
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
const profileCitiesStat = document.getElementById("profileCitiesStat");
const profileGoldStat = document.getElementById("profileGoldStat");
const profileTroopsStat = document.getElementById("profileTroopsStat");
const profileGoldProductionStat = document.getElementById("profileGoldProductionStat");
const profileTroopProductionStat = document.getElementById("profileTroopProductionStat");
const flagEditorPreview = document.getElementById("flagEditorPreview");
const flagPrimaryColors = document.getElementById("flagPrimaryColors");
const flagSecondaryColors = document.getElementById("flagSecondaryColors");
const flagPatternOptions = document.getElementById("flagPatternOptions");
const flagSymbolOptions = document.getElementById("flagSymbolOptions");
const flagSaveBtn = document.getElementById("flagSaveBtn");
const flagBackBtn = document.getElementById("flagBackBtn");
const flagExitBtn = document.getElementById("flagExitBtn");
const mapFrame = document.getElementById("mapFrame");
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

function westImagePointToWorld(point) {
  const bounds = getIslandMapBounds("west");
  return {
    x: bounds.left + (Number(point?.x) || 0) / WEST_ISLAND_IMAGE_WIDTH * bounds.width,
    y: bounds.top + (Number(point?.y) || 0) / WEST_ISLAND_IMAGE_HEIGHT * bounds.height,
  };
}

function worldToWestImagePoint(pointOrX, yValue = null) {
  const bounds = getIslandMapBounds("west");
  const worldX = typeof pointOrX === "object" ? Number(pointOrX?.x) || 0 : Number(pointOrX) || 0;
  const worldY = typeof pointOrX === "object" ? Number(pointOrX?.y) || 0 : Number(yValue) || 0;
  return {
    x: (worldX - bounds.left) / bounds.width * WEST_ISLAND_IMAGE_WIDTH,
    y: (worldY - bounds.top) / bounds.height * WEST_ISLAND_IMAGE_HEIGHT,
  };
}

function isWestIslandLandPoint(x, y) {
  const point = worldToWestImagePoint(x, y);
  if (point.x < 0 || point.y < 0 || point.x > WEST_ISLAND_IMAGE_WIDTH || point.y > WEST_ISLAND_IMAGE_HEIGHT) return false;
  return pointInPolygon(point.x, point.y, WEST_ISLAND_LAND_POLYGON);
}

function northImagePointToWorld(point) {
  const bounds = getIslandMapBounds("north");
  return {
    x: bounds.left + (Number(point?.x) || 0) / NORTH_ISLAND_IMAGE_WIDTH * bounds.width,
    y: bounds.top + (Number(point?.y) || 0) / NORTH_ISLAND_IMAGE_HEIGHT * bounds.height,
  };
}

function worldToNorthImagePoint(pointOrX, yValue = null) {
  const bounds = getIslandMapBounds("north");
  const worldX = typeof pointOrX === "object" ? Number(pointOrX?.x) || 0 : Number(pointOrX) || 0;
  const worldY = typeof pointOrX === "object" ? Number(pointOrX?.y) || 0 : Number(yValue) || 0;
  return {
    x: (worldX - bounds.left) / bounds.width * NORTH_ISLAND_IMAGE_WIDTH,
    y: (worldY - bounds.top) / bounds.height * NORTH_ISLAND_IMAGE_HEIGHT,
  };
}

function isNorthIslandLandPoint(x, y) {
  const point = worldToNorthImagePoint(x, y);
  if (point.x < 0 || point.y < 0 || point.x > NORTH_ISLAND_IMAGE_WIDTH || point.y > NORTH_ISLAND_IMAGE_HEIGHT) return false;
  return pointInPolygon(point.x, point.y, NORTH_ISLAND_LAND_POLYGON);
}

function eastImagePointToWorld(point) {
  const bounds = getIslandMapBounds("east");
  return {
    x: bounds.left + (Number(point?.x) || 0) / EAST_ISLAND_IMAGE_WIDTH * bounds.width,
    y: bounds.top + (Number(point?.y) || 0) / EAST_ISLAND_IMAGE_HEIGHT * bounds.height,
  };
}

function worldToEastImagePoint(pointOrX, yValue = null) {
  const bounds = getIslandMapBounds("east");
  const worldX = typeof pointOrX === "object" ? Number(pointOrX?.x) || 0 : Number(pointOrX) || 0;
  const worldY = typeof pointOrX === "object" ? Number(pointOrX?.y) || 0 : Number(yValue) || 0;
  return {
    x: (worldX - bounds.left) / bounds.width * EAST_ISLAND_IMAGE_WIDTH,
    y: (worldY - bounds.top) / bounds.height * EAST_ISLAND_IMAGE_HEIGHT,
  };
}

function isEastIslandLandPoint(x, y) {
  const point = worldToEastImagePoint(x, y);
  if (point.x < 0 || point.y < 0 || point.x > EAST_ISLAND_IMAGE_WIDTH || point.y > EAST_ISLAND_IMAGE_HEIGHT) return false;
  return pointInPolygon(point.x, point.y, EAST_ISLAND_LAND_POLYGON);
}

function southImagePointToWorld(point) {
  const bounds = getIslandMapBounds("south");
  return {
    x: bounds.left + (Number(point?.x) || 0) / SOUTH_ISLAND_IMAGE_WIDTH * bounds.width,
    y: bounds.top + (Number(point?.y) || 0) / SOUTH_ISLAND_IMAGE_HEIGHT * bounds.height,
  };
}

function worldToSouthImagePoint(pointOrX, yValue = null) {
  const bounds = getIslandMapBounds("south");
  const worldX = typeof pointOrX === "object" ? Number(pointOrX?.x) || 0 : Number(pointOrX) || 0;
  const worldY = typeof pointOrX === "object" ? Number(pointOrX?.y) || 0 : Number(yValue) || 0;
  return {
    x: (worldX - bounds.left) / bounds.width * SOUTH_ISLAND_IMAGE_WIDTH,
    y: (worldY - bounds.top) / bounds.height * SOUTH_ISLAND_IMAGE_HEIGHT,
  };
}

function isSouthIslandLandPoint(x, y) {
  const point = worldToSouthImagePoint(x, y);
  if (point.x < 0 || point.y < 0 || point.x > SOUTH_ISLAND_IMAGE_WIDTH || point.y > SOUTH_ISLAND_IMAGE_HEIGHT) return false;
  return pointInPolygon(point.x, point.y, SOUTH_ISLAND_LAND_POLYGON);
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
  if (regionId === "west") return worldToWestImagePoint(pointOrX, yValue);
  if (regionId === "north") return worldToNorthImagePoint(pointOrX, yValue);
  if (regionId === "east") return worldToEastImagePoint(pointOrX, yValue);
  if (regionId === "south") return worldToSouthImagePoint(pointOrX, yValue);
  if (regionId === "center") return worldToCenterImagePoint(pointOrX, yValue);
  return { x: 0, y: 0 };
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
  const bounds = getIslandMapBounds("center");
  return {
    x: bounds.left + (Number(point?.x) || 0) / CENTER_ISLAND_IMAGE_WIDTH * bounds.width,
    y: bounds.top + (Number(point?.y) || 0) / CENTER_ISLAND_IMAGE_HEIGHT * bounds.height,
  };
}

function worldToCenterImagePoint(pointOrX, yValue = null) {
  const bounds = getIslandMapBounds("center");
  const worldX = typeof pointOrX === "object" ? Number(pointOrX?.x) || 0 : Number(pointOrX) || 0;
  const worldY = typeof pointOrX === "object" ? Number(pointOrX?.y) || 0 : Number(yValue) || 0;
  return {
    x: (worldX - bounds.left) / bounds.width * CENTER_ISLAND_IMAGE_WIDTH,
    y: (worldY - bounds.top) / bounds.height * CENTER_ISLAND_IMAGE_HEIGHT,
  };
}

function isCenterIslandLandPoint(x, y) {
  const point = worldToCenterImagePoint(x, y);
  if (point.x < 0 || point.y < 0 || point.x > CENTER_ISLAND_IMAGE_WIDTH || point.y > CENTER_ISLAND_IMAGE_HEIGHT) return false;
  return pointInPolygon(point.x, point.y, CENTER_ISLAND_LAND_POLYGON);
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

function getOuterRegionIds() {
  const outer = getRegionIds().filter(regionId => regionId !== "center");
  return outer.length ? outer : getRegionIds();
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
  const regions = getOuterRegionIds();
  if (!regions.length) return DEFAULT_ONLINE_REGION_ID;
  const uid = getCurrentOnlineUid() || getOnlineApi()?.getUser?.()?.email || "guest";
  return regions[hashString(uid) % regions.length] || DEFAULT_ONLINE_REGION_ID;
}

function resolveHomeRegionId(profile = null) {
  const profileRegion = normalizeRegionId(profile?.mainRegionId || getRegionIdFromOnlineIslandId(profile?.mainIslandId));
  if (profile?.mainRegionId || getRegionIdFromOnlineIslandId(profile?.mainIslandId)) return profileRegion;
  const profileMainCityId = getKnownCityId(profile?.mainCityId);
  if (profileMainCityId) return getCityRegionId(profileMainCityId);
  if (state?.online?.mainRegionId) return normalizeRegionId(state.online.mainRegionId);
  const onlineMainCityId = getKnownCityId(state?.online?.mainCityId);
  if (onlineMainCityId) return getCityRegionId(onlineMainCityId);
  if (state?.online?.mainIslandId) return normalizeRegionId(getRegionIdFromOnlineIslandId(state.online.mainIslandId));
  const savedMainCityId = getKnownCityId(state?.mainCityId);
  if (savedMainCityId) return getCityRegionId(savedMainCityId);
  return pickStartingRegionId();
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
  return cities;
}

function getRegionCityCount(region) {
  return region?.id === "center" ? CENTER_REGION_CITY_COUNT : REGION_CITY_COUNT;
}

function generateRegionCitySlots(region, count) {
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

function generateCityName(region, index) {
  const stems = {
    center: ["Crown", "High", "Stone", "River", "Kings", "Queens", "Iron", "Gold", "Bright", "Elder", "Lion", "Oak", "Raven", "Silver", "Wolf", "Star", "Red", "White", "Dawn", "Ember"],
    north: ["Frost", "Pine", "North", "Snow", "White", "Grey", "Winter", "Ice", "Wolf", "Raven", "Cold", "Storm", "Hawk", "Stone", "Ash", "Briar", "Moon", "Cloud", "Cedar", "Peak"],
    south: ["South", "Salt", "Sun", "Marsh", "Reed", "Pearl", "Green", "Bay", "Moss", "Willow", "Rose", "Clear", "Mist", "Rain", "Bloom", "Hearth", "Warm", "Sable", "Drift", "Tide"],
    west: ["West", "Oak", "Thorn", "Fox", "Ash", "Briar", "Crow", "Dusky", "Wild", "Wood", "Hart", "Moss", "Wolf", "Amber", "Black", "Copper", "Shade", "Glen", "Fern", "Old"],
    east: ["East", "Sun", "Gold", "Dawn", "Bright", "Lion", "Falcon", "Red", "Rose", "Clear", "Wind", "Star", "Light", "Pearl", "Hawk", "Blue", "Kings", "Queens", "Sea", "Ivory"],
  };
  const suffixes = ["haven", "ford", "wick", "mere", "watch", "gate", "rest", "fall", "brook", "hollow"];
  const regionStems = stems[region.id] || stems.center;
  const stem = regionStems[index % regionStems.length];
  const suffix = suffixes[Math.floor(index / regionStems.length) % suffixes.length];
  return `${stem}${suffix}`;
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
  const westBounds = getIslandMapBounds("west");
  const isInsideWestMap = x >= westBounds.left - padding
    && x <= westBounds.right + padding
    && y >= westBounds.top - padding
    && y <= westBounds.bottom + padding;
  if (isInsideWestMap && isWestIslandLandPoint(x, y)) return true;
  const northBounds = getIslandMapBounds("north");
  const isInsideNorthMap = x >= northBounds.left - padding
    && x <= northBounds.right + padding
    && y >= northBounds.top - padding
    && y <= northBounds.bottom + padding;
  if (isInsideNorthMap && isNorthIslandLandPoint(x, y)) return true;
  const eastBounds = getIslandMapBounds("east");
  const isInsideEastMap = x >= eastBounds.left - padding
    && x <= eastBounds.right + padding
    && y >= eastBounds.top - padding
    && y <= eastBounds.bottom + padding;
  if (isInsideEastMap && isEastIslandLandPoint(x, y)) return true;
  const southBounds = getIslandMapBounds("south");
  const isInsideSouthMap = x >= southBounds.left - padding
    && x <= southBounds.right + padding
    && y >= southBounds.top - padding
    && y <= southBounds.bottom + padding;
  if (isInsideSouthMap && isSouthIslandLandPoint(x, y)) return true;
  const centerBounds = getIslandMapBounds("center");
  const isInsideCenterMap = x >= centerBounds.left - padding
    && x <= centerBounds.right + padding
    && y >= centerBounds.top - padding
    && y <= centerBounds.bottom + padding;
  if (isInsideCenterMap && isCenterIslandLandPoint(x, y)) return true;
  return WORLD_REGIONS.some(region => !["west", "north", "east", "south", "center"].includes(region.id) && pointInWorldRegion(x, y, region, padding))
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

function renderWorldMap() {
  if (!mapBg) return;
  const bounds = getActiveMapBounds();
  mapBg.classList.toggle("west-image-map", bounds.regionId === "west");
  mapBg.classList.toggle("north-image-map", bounds.regionId === "north");
  mapBg.classList.toggle("east-image-map", bounds.regionId === "east");
  mapBg.classList.toggle("south-image-map", bounds.regionId === "south");
  mapBg.classList.toggle("center-image-map", bounds.regionId === "center");
  if (bounds.regionId === "west") {
    mapBg.innerHTML = `<img class="island-art-map west-island-art" src="${WEST_ISLAND_ART_SRC}" alt="" draggable="false" />`;
    return;
  }
  if (bounds.regionId === "north") {
    mapBg.innerHTML = `<img class="island-art-map north-island-art" src="${NORTH_ISLAND_ART_SRC}" alt="" draggable="false" />`;
    return;
  }
  if (bounds.regionId === "east") {
    mapBg.innerHTML = `<img class="island-art-map east-island-art" src="${EAST_ISLAND_ART_SRC}" alt="" draggable="false" />`;
    return;
  }
  if (bounds.regionId === "south") {
    mapBg.innerHTML = `<img class="island-art-map south-island-art" src="${SOUTH_ISLAND_ART_SRC}" alt="" draggable="false" />`;
    return;
  }
  if (bounds.regionId === "center") {
    mapBg.innerHTML = `<img class="island-art-map center-island-art" src="${CENTER_ISLAND_ART_SRC}" alt="" draggable="false" />`;
    return;
  }
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
    buttonElement.type = "button";
    buttonElement.className = `teleport-node ${teleport.className || ""}`.trim();
    buttonElement.dataset.targetRegion = teleport.targetRegionId;
    buttonElement.style.left = `${portalPoint.x}px`;
    buttonElement.style.top = `${portalPoint.y}px`;
    buttonElement.setAttribute("aria-label", `Teleport to ${getRegionLabel(teleport.targetRegionId)}`);
    buttonElement.innerHTML = `
      <span class="teleport-ring" aria-hidden="true"></span>
      <span class="teleport-symbol" aria-hidden="true">&#10022;</span>
      <span class="teleport-label">${escapeHtml(teleport.label)}</span>
    `;
    buttonElement.addEventListener("click", event => {
      event.stopPropagation();
      if (onlineWorldLoading) return;
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

function getActiveIslandTeleporters() {
  const activeRegionId = getActiveMapRegionId();
  if (activeRegionId === "west") {
    return [{
      label: "Center",
      targetRegionId: "center",
      worldPoint: westImagePointToWorld(WEST_CENTER_TELEPORT_IMAGE_POINT),
      className: "center-teleport-node",
    }];
  }
  if (activeRegionId === "north") {
    return [{
      label: "Center",
      targetRegionId: "center",
      worldPoint: northImagePointToWorld(NORTH_CENTER_TELEPORT_IMAGE_POINT),
      className: "center-teleport-node",
    }];
  }
  if (activeRegionId === "east") {
    return [{
      label: "Center",
      targetRegionId: "center",
      worldPoint: eastImagePointToWorld(EAST_CENTER_TELEPORT_IMAGE_POINT),
      className: "center-teleport-node",
    }];
  }
  if (activeRegionId === "south") {
    return [{
      label: "Center",
      targetRegionId: "center",
      worldPoint: southImagePointToWorld(SOUTH_CENTER_TELEPORT_IMAGE_POINT),
      className: "center-teleport-node",
    }];
  }
  if (activeRegionId === "center") {
    return CENTER_ISLAND_TELEPORTS.map(teleport => ({
      label: teleport.label,
      targetRegionId: teleport.targetRegionId,
      worldPoint: centerImagePointToWorld(teleport.point),
      className: `center-${teleport.targetRegionId}-teleport-node`,
    }));
  }
  return [];
}

function getCenterTeleportForRegion(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  return CENTER_ISLAND_TELEPORTS.find(teleport => teleport.targetRegionId === targetRegionId) || null;
}

function getPortalWorldPoint(regionId, targetRegionId = "center") {
  const fromRegionId = normalizeRegionId(regionId);
  const toRegionId = normalizeRegionId(targetRegionId);
  if (fromRegionId === "west" && toRegionId === "center") return westImagePointToWorld(WEST_CENTER_TELEPORT_IMAGE_POINT);
  if (fromRegionId === "north" && toRegionId === "center") return northImagePointToWorld(NORTH_CENTER_TELEPORT_IMAGE_POINT);
  if (fromRegionId === "east" && toRegionId === "center") return eastImagePointToWorld(EAST_CENTER_TELEPORT_IMAGE_POINT);
  if (fromRegionId === "south" && toRegionId === "center") return southImagePointToWorld(SOUTH_CENTER_TELEPORT_IMAGE_POINT);
  if (fromRegionId === "center") {
    const teleport = getCenterTeleportForRegion(toRegionId);
    if (teleport) return centerImagePointToWorld(teleport.point);
  }
  return null;
}

function getPortalRouteRegionChain(fromRegionId, toRegionId) {
  const sourceRegionId = normalizeRegionId(fromRegionId);
  const targetRegionId = normalizeRegionId(toRegionId);
  if (sourceRegionId === targetRegionId) return [sourceRegionId];
  if (sourceRegionId === "center" || targetRegionId === "center") return [sourceRegionId, targetRegionId];
  return [sourceRegionId, "center", targetRegionId];
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
  const cities = getPlayableBaseCities().map(city => ({
    ...city,
    owner: "neutral",
    level: 1,
    troops: NEUTRAL_START_TROOPS,
    defense: 1,
    troopFloat: NEUTRAL_START_TROOPS,
    investedGold: 0,
    lastCapturedAt: null,
    isMainCity: false,
  }));

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
  }

  return { cities, startIds };
}

function pickStartCities(cities) {
  const fallbackAnchors = getStartCityAnchors();

  const used = new Set();
  const result = {};

  for (const [key, config] of Object.entries(fallbackAnchors)) {
    const pool = cities.filter(city => city.startPool === config.pool && !used.has(city.id));
    let chosen = randomChoice(pool);
    if (!chosen) {
      const available = cities
        .filter(city => !used.has(city.id))
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
      .filter(city => city.startPool === config.pool && !used.has(city.id))
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
  const cities = baseCities.map(city => ({
    ...city,
    ownerKind: "neutral",
    ownerUid: null,
    ownerName: "",
    ownerFlag: null,
    level: 1,
    troops: NEUTRAL_START_TROOPS,
    troopFloat: NEUTRAL_START_TROOPS,
    defense: 1,
    investedGold: 0,
    lastCapturedAt: null,
    isMainCity: false,
  }));

  return {
    regionId: normalizeRegionId(regionId),
    cities,
    startIds,
    claimCandidateIds: getOnlineClaimCandidateIds(cities, startIds),
  };
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
  const outerCities = cities.filter(city => city.regionId !== "center");
  const centerCities = cities.filter(city => city.regionId === "center");

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
    flag: createDefaultFlag(),
    gold: TEST_STARTING_GOLD,
    gameSeconds: 0,
    lastRealTimeMs: Date.now(),
    upgrades: createDefaultSkills(),
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
  if (main?.owner === "player" && main.id !== excludeCityId) return main;
  return playerCities().find(city => city.id !== excludeCityId) || null;
}

function getLoadedMainCity() {
  if (!state?.mainCityId) return null;
  const main = cityById(state.mainCityId);
  return main?.owner === "player" ? main : null;
}

function getMainCityReference() {
  if (!state?.mainCityId) return null;
  const loaded = cityById(state.mainCityId);
  if (loaded?.owner === "player") return loaded;
  if (loaded && getCityRegionId(loaded) === getActiveMapRegionId()) return null;
  const base = getPlayableBaseCities().find(city => city.id === state.mainCityId);
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
  const ownedCount = state ? playerCities().length : 0;
  const isMain = isMainCityForList(city);
  let reason = "";

  if (!state) reason = "Game is not ready.";
  else if (!city) reason = "City is not available.";
  else if (city.owner !== "player") reason = "Only owned cities can become your main city.";
  else if (isMain) reason = "This city is already your main city.";
  else if (ownedCount >= MAIN_CITY_CHANGE_CITY_LIMIT) reason = `You can only move your main city while you own fewer than ${MAIN_CITY_CHANGE_CITY_LIMIT} cities.`;
  else if (cooldownMs > 0) reason = `Main city can change again in ${cooldownText}.`;

  return {
    canChange: Boolean(state && city && city.owner === "player" && !isMain && ownedCount < MAIN_CITY_CHANGE_CITY_LIMIT && cooldownMs <= 0),
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
  const level = clampCityLevel(target?.level);
  const defenderXp = Math.floor(Math.max(0, Number(defendersAtStart) || 0) * CAPTURE_XP_PER_DEFENDER);
  const ownerBonus = oldOwner === "enemy" ? ENEMY_CAPTURE_XP_BONUS : 0;
  const baseXp = CAPTURE_XP_BASE + level * CAPTURE_XP_PER_CITY_LEVEL + defenderXp + ownerBonus;
  const efficiency = attackerOwner === "player" ? getCaptureXpEfficiency(target, oldOwner) : 1;
  return Math.floor(baseXp * efficiency);
}

function getCityUpgradeXpAward(city) {
  return Math.floor(CITY_UPGRADE_XP_BASE + clampCityLevel(city?.level) * CITY_UPGRADE_XP_PER_LEVEL);
}

function getDefenseHeldXpAward(attackingTroops) {
  return Math.floor(DEFENSE_HELD_XP_BASE + Math.max(0, Number(attackingTroops) || 0) * DEFENSE_HELD_XP_PER_ATTACKER);
}

function getPartialBattleXpAward(fullWinXp) {
  return Math.floor(Math.max(0, Number(fullWinXp) || 0) * FAILED_BATTLE_XP_RATE);
}

function getFailedAttackXpAward(target, oldOwner, defendersAtStart, attackerOwner = "player") {
  return getPartialBattleXpAward(getCaptureXpAward(target, oldOwner, defendersAtStart, attackerOwner));
}

function getLostDefenseXpAward(attackingTroops) {
  return getPartialBattleXpAward(getDefenseHeldXpAward(attackingTroops));
}

function getCaptureXpEfficiency(target, oldOwner = target?.owner) {
  if (!target || !state) return 1;
  const heroLevel = Math.max(1, Math.floor(Number(state.character?.level) || 1));
  const empirePressure = 48 + heroLevel * 20 + playerCities().length * 2;
  const targetScore = getCityXpScore(target, oldOwner);
  const strengthEfficiency = clamp(0.35 + targetScore / Math.max(1, empirePressure), 0.25, 2);
  const cooldownMultiplier = getCaptureCooldownRemaining(target) > 0 ? RECENT_CAPTURE_XP_MULTIPLIER : 1;
  return Number(clamp(strengthEfficiency * cooldownMultiplier, 0.05, 2).toFixed(2));
}

function getCityXpScore(target, oldOwner = target?.owner) {
  const stats = getCityStats(target);
  const ownerBonus = oldOwner === "enemy" ? 45 : oldOwner === "neutral" ? 10 : 60;
  return stats.victoryPoints + Math.max(0, Number(target?.troops) || 0) * 0.5 + ownerBonus;
}

function getCaptureCooldownRemaining(city) {
  if (!state || !city || city.lastCapturedAt === null || city.lastCapturedAt === undefined) return 0;
  const capturedAt = Number(city.lastCapturedAt);
  if (!Number.isFinite(capturedAt)) return 0;
  const elapsed = Math.max(0, state.gameSeconds - capturedAt);
  return Math.max(0, CAPTURE_XP_COOLDOWN_SECONDS - elapsed);
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
  const level = clampCityLevel(city?.level);
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
  const baseTroopProductionPerHour = victoryPoints * CITY_LEVEL_STATS.troopProductionPerVictoryPoint;
  const recruiterBonusPerHour = victoryPoints * recruiterPercent / 100;
  const troopProductionPerHour = baseTroopProductionPerHour + recruiterBonusPerHour;
  const millionLordsProductionVp = getMillionLordsCityProductionVp(level);
  const baseGoldProductionPerHour = getMillionLordsPassiveGoldPerHour(level);
  const goldProductionPerHour = baseGoldProductionPerHour * (1 + prosperousPercent / 100);
  const troopDefense = Math.floor((Number(city?.troops) || 0) * (1 + defensePercent / 100) * (1 + guardianPercent / 100));
  const totalDefense = Math.floor(cityWalls + troopDefense);

  return {
    level,
    victoryPoints,
    cityPower: victoryPoints,
    defensePercent,
    cityWalls,
    guardianPercent,
    recruiterPercent,
    prosperousPercent,
    baseTroopProductionPerHour,
    recruiterBonusPerHour,
    troopProductionPerHour,
    millionLordsProductionVp,
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

function calculateCombatResult(attackTroops, attackOwner, target) {
  const troops = Math.max(0, Math.floor(Number(attackTroops) || 0));
  const defendersAtStart = Math.max(0, Math.floor(Number(target?.troops) || 0));
  const attackPower = getAttackPower(troops, attackOwner);
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

function loadGame() {
  const keysToTry = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

  for (const key of keysToTry) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const loaded = JSON.parse(raw);
      if (!loaded || !Array.isArray(loaded.cities)) continue;

      const sourceSaveVersion = Number(loaded.version) || 0;
      const savedSkillPoints = loaded.character?.skillPoints;
      loaded.version = WORLD_SCHEMA_VERSION;
      loaded.character = normalizeCharacterProgress(loaded.character);
      loaded.upgrades = normalizeUpgrades(loaded.upgrades, sourceSaveVersion);
      syncCharacterSkillPoints(loaded.character, loaded.upgrades, savedSkillPoints);
      loaded.flag = normalizeFlag(loaded.flag);
      loaded.marchPercent = normalizeMarchPercent(loaded.marchPercent);
      loaded.daily = normalizeDailyCaptureTracker(loaded.daily);
      normalizeHarvestState(loaded);
      loaded.scoutReports = normalizeScoutReports(loaded.scoutReports);
      loaded.battleReports = normalizeBattleReports(loaded.battleReports);
      loaded.mainCityChangedAtMs = normalizeTimestampMs(loaded.mainCityChangedAtMs);
      const playableBases = getPlayableBaseCities();
      const savedCitiesAreCurrent = Array.isArray(loaded.cities)
        && loaded.cities.length === playableBases.length
        && playableBases.every(base => loaded.cities.some(city => city.id === base.id));
      if (!savedCitiesAreCurrent) {
        const island = createIslandStartLayout(loaded.playerName || "Ricky");
        loaded.cities = island.cities;
        loaded.mainCityId = island.startIds.player;
        loaded.islandSlots = island.startIds;
        loaded.attacks = [];
        loaded.log = Array.isArray(loaded.log) ? loaded.log : [];
        loaded.log.push("0:00 - World layout upgraded to the five-island 250-city map.");
      }
      loaded.cities.forEach(city => {
        const base = playableBases.find(item => item.id === city.id);
        if (base) {
          city.x = base.x;
          city.y = base.y;
          city.startPool = base.startPool;
          if (city.id === loaded.mainCityId && city.name === `${loaded.playerName} Keep`) city.name = base.name;
        }
        delete city.adj;
        city.owner = OWNER[city.owner] ? city.owner : "neutral";
        if (city.owner === "enemy" && city.ownerKind !== "player") {
          city.owner = "neutral";
          city.ownerKind = "neutral";
          city.ownerUid = null;
          city.ownerName = "";
          city.ownerFlag = null;
        } else if (city.owner !== "enemy" && city.ownerKind !== "player") {
          city.ownerKind = city.owner;
        }
        city.level = clampCityLevel(city.level);
        city.defense = 1;
        city.troops = Math.max(0, Math.floor(Number(city.troops) || 0));
        city.troopFloat = Number.isFinite(city.troopFloat) ? Math.max(0, city.troopFloat) : city.troops;
        city.investedGold = Math.max(0, Math.floor(Number(city.investedGold) || 0));
        city.isMainCity = Boolean(city.isMainCity || city.id === loaded.mainCityId);
        if (city.lastCapturedAt === null || city.lastCapturedAt === undefined || city.lastCapturedAt === "") {
          city.lastCapturedAt = null;
        } else {
          const capturedAt = Number(city.lastCapturedAt);
          city.lastCapturedAt = Number.isFinite(capturedAt) ? capturedAt : null;
        }
      });
      if (!loaded.mainCityId || cityByIdSafe(loaded.cities, loaded.mainCityId)?.owner !== "player") {
        loaded.mainCityId = loaded.cities.find(city => city.owner === "player" && city.isMainCity)?.id
          || loaded.cities.find(city => city.owner === "player")?.id
          || null;
      }
      loaded.cities.forEach(city => {
        city.isMainCity = Boolean(city.owner === "player" && city.id === loaded.mainCityId);
      });
      loaded.attacks = Array.isArray(loaded.attacks) ? loaded.attacks : [];
      if (sourceSaveVersion < 17) {
        loaded.attacks = [];
      }
      loaded.attacks.forEach(attack => {
        attack.targetOwnerAtLaunch = attack.targetOwnerAtLaunch || loaded.cities.find(city => city.id === attack.toId)?.owner || "neutral";
        if (!Array.isArray(attack.path) || attack.path.length < 2) {
          const from = loaded.cities.find(city => city.id === attack.fromId);
          const to = loaded.cities.find(city => city.id === attack.toId);
          const route = from && to ? findRoute(from, to) : null;
          attack.path = route?.points || [];
          attack.pathLength = route?.length || 0;
          attack.pathSegments = getRouteSegments(route, from ? getCityRegionId(from) : "");
        } else {
          attack.path = normalizeArmyPath(attack.path);
          attack.pathSegments = normalizeArmyPathSegments(attack.pathSegments);
        }
      });
      loaded.gameOver = loaded.gameOver || null;
      loaded.log = Array.isArray(loaded.log) ? loaded.log : [];
      loaded.gold = Math.max(TEST_STARTING_GOLD, Number(loaded.gold) || 0);
      attackIdCounter = Math.max(1, ...loaded.attacks.map(attack => Number(attack.id) || 1)) + 1;
      return loaded;
    } catch (error) {
      console.warn("Could not load save", key, error);
    }
  }

  return null;
}

function normalizeOnlineGameSnapshot(snapshot, fallbackPlayerName = "Ricky") {
  try {
    const loaded = JSON.parse(JSON.stringify(snapshot));
    if (!loaded || !Array.isArray(loaded.cities)) return null;

    const sourceSaveVersion = Number(loaded.version) || 0;
    const savedSkillPoints = loaded.character?.skillPoints;
      loaded.version = WORLD_SCHEMA_VERSION;
    loaded.playerName = cleanName(loaded.playerName) || fallbackPlayerName;
    loaded.character = normalizeCharacterProgress(loaded.character);
    loaded.upgrades = normalizeUpgrades(loaded.upgrades, sourceSaveVersion);
    syncCharacterSkillPoints(loaded.character, loaded.upgrades, savedSkillPoints);
    loaded.flag = normalizeFlag(loaded.flag);
    loaded.marchPercent = normalizeMarchPercent(loaded.marchPercent);
    loaded.daily = normalizeDailyCaptureTracker(loaded.daily);
    normalizeHarvestState(loaded);
    loaded.scoutReports = normalizeScoutReports(loaded.scoutReports);
    loaded.battleReports = normalizeBattleReports(loaded.battleReports);
    loaded.mainCityChangedAtMs = normalizeTimestampMs(loaded.mainCityChangedAtMs);

    const playableBases = getPlayableBaseCities();
    const activeRegionId = normalizeRegionId(loaded.activeRegionId || loaded.online?.activeRegionId || DEFAULT_ONLINE_REGION_ID);
    const activeBases = getOnlineIslandBaseCities(activeRegionId);
    const savedCitiesAreFullWorld = loaded.cities.length === playableBases.length
      && playableBases.every(base => loaded.cities.some(city => city.id === base.id));
    const savedCitiesAreActiveIsland = loaded.cities.length === activeBases.length
      && activeBases.every(base => loaded.cities.some(city => city.id === base.id));
    if (!savedCitiesAreFullWorld && !savedCitiesAreActiveIsland) {
      const island = createIslandStartLayout(loaded.playerName || fallbackPlayerName);
      loaded.cities = island.cities;
      loaded.mainCityId = island.startIds.player;
      loaded.islandSlots = island.startIds;
      loaded.attacks = [];
      loaded.log = Array.isArray(loaded.log) ? loaded.log : [];
      loaded.log.push("0:00 - Cloud save layout was updated to the five-island 250-city map.");
    }

    const basesForLoadedCities = savedCitiesAreActiveIsland ? activeBases : playableBases;
    loaded.cities.forEach(city => {
      const base = basesForLoadedCities.find(item => item.id === city.id) || playableBases.find(item => item.id === city.id);
      if (base) {
        city.x = base.x;
        city.y = base.y;
        city.startPool = base.startPool;
        city.regionId = base.regionId;
      }
      delete city.adj;
      city.owner = OWNER[city.owner] ? city.owner : "neutral";
      if (city.owner === "enemy" && city.ownerKind !== "player") {
        city.owner = "neutral";
        city.ownerKind = "neutral";
        city.ownerUid = null;
        city.ownerName = "";
        city.ownerFlag = null;
      } else if (city.owner !== "enemy" && city.ownerKind !== "player") {
        city.ownerKind = city.owner;
      }
      city.level = clampCityLevel(city.level);
      city.defense = 1;
      city.troops = Math.max(0, Math.floor(Number(city.troops) || 0));
      city.troopFloat = Number.isFinite(city.troopFloat) ? Math.max(0, city.troopFloat) : city.troops;
      city.investedGold = Math.max(0, Math.floor(Number(city.investedGold) || 0));
      city.isMainCity = Boolean(city.isMainCity || city.id === loaded.mainCityId);
      if (city.lastCapturedAt === null || city.lastCapturedAt === undefined || city.lastCapturedAt === "") {
        city.lastCapturedAt = null;
      } else {
        const capturedAt = Number(city.lastCapturedAt);
        city.lastCapturedAt = Number.isFinite(capturedAt) ? capturedAt : null;
      }
    });

    if (!loaded.mainCityId || cityByIdSafe(loaded.cities, loaded.mainCityId)?.owner !== "player") {
      loaded.mainCityId = loaded.cities.find(city => city.owner === "player" && city.isMainCity)?.id
        || loaded.cities.find(city => city.owner === "player")?.id
        || null;
    }
    loaded.cities.forEach(city => {
      city.isMainCity = Boolean(city.owner === "player" && city.id === loaded.mainCityId);
    });
    loaded.attacks = Array.isArray(loaded.attacks) ? loaded.attacks : [];
    loaded.attacks.forEach(attack => {
      attack.targetOwnerAtLaunch = attack.targetOwnerAtLaunch || loaded.cities.find(city => city.id === attack.toId)?.owner || "neutral";
      if (!Array.isArray(attack.path) || attack.path.length < 2) {
        const from = loaded.cities.find(city => city.id === attack.fromId);
        const to = loaded.cities.find(city => city.id === attack.toId);
        const route = from && to ? findRoute(from, to) : null;
        attack.path = route?.points || [];
        attack.pathLength = route?.length || 0;
        attack.pathSegments = getRouteSegments(route, from ? getCityRegionId(from) : "");
      } else {
        attack.path = normalizeArmyPath(attack.path);
        attack.pathSegments = normalizeArmyPathSegments(attack.pathSegments);
      }
    });
    loaded.gameOver = loaded.gameOver || null;
    loaded.log = Array.isArray(loaded.log) ? loaded.log : [];
    loaded.gold = Math.max(TEST_STARTING_GOLD, Number(loaded.gold) || 0);
    loaded.gameSeconds = Math.max(0, Number(loaded.gameSeconds) || 0);
    loaded.activeRegionId = activeRegionId;
    if (loaded.online) {
      loaded.online.activeRegionId = normalizeRegionId(loaded.online.activeRegionId || activeRegionId);
      loaded.online.islandId = loaded.online.islandId || getOnlineIslandId(loaded.online.activeRegionId);
    }
    attackIdCounter = Math.max(1, ...loaded.attacks.map(attack => Number(attack.id) || 1)) + 1;
    return loaded;
  } catch (error) {
    console.warn("Could not normalize cloud save", error);
    return null;
  }
}

async function loadOnlineGame(playerName) {
  const api = getOnlineApi();
  if (!api?.isConfigured?.() || !api?.isSignedIn?.()) return null;
  try {
    const snapshot = await api.loadGameSnapshot(ONLINE_SAVE_SLOT);
    return normalizeOnlineGameSnapshot(snapshot, playerName);
  } catch (error) {
    onlineLastError = error?.message || String(error);
    updateOnlineUi();
    console.warn("Could not load cloud save", error);
    return null;
  }
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
  snapshot.harvestBonuses = normalizeHarvestBonuses(snapshot.harvestBonuses);
  const timer = Number(snapshot.harvestSpawnTimer);
  snapshot.harvestSpawnTimer = Number.isFinite(timer)
    ? clamp(timer, 0, HARVEST_BONUS_SPAWN_INTERVAL_SECONDS)
    : HARVEST_BONUS_INITIAL_SPAWN_SECONDS;
  snapshot.harvestNextBonusType = normalizeHarvestBonusType(snapshot.harvestNextBonusType);
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
        summary: String(report.summary || "").slice(0, 120),
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
  launchScoutMission(source, target, sourceOption.route);
  if (isOnlineWorldActive()) syncOwnedCitiesToOnline(true);
  addLog(`One scout left ${source.name} for ${target.name}.`);
  saveGame();
  renderAll();
  showToast(`Scout moving from ${source.name} to ${target.name}`);
}

function launchScoutMission(source, target, route) {
  if (!source || !target || source.owner !== "player" || source.troops < 1 || !route?.points?.length) return null;
  source.troopFloat = Math.max(0, (Number(source.troopFloat) || source.troops) - 1);
  source.troops = Math.floor(source.troopFloat);
  markOwnedCityChanged(source, false);
  syncCityStateToOnline(source);
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
  if (isOnlineWorldActive()) syncOwnedCitiesToOnline(true);
  addLog(`${source.name} dispatched ${formatNumber(options.length)} nearby scouts for ${formatNumber(SCOUT_NEARBY_COST)} gold.`);
  saveGame();
  renderAll();
  showToast(`${formatNumber(options.length)} scouts dispatched from ${source.name}`);
}

function getPendingScoutMission(cityId) {
  return state?.attacks?.find(attack => attack.owner === "player" && attack.kind === "scout" && attack.toId === cityId) || null;
}

function findNearestOwnedSource(target, minimumTroops = 1) {
  return playerCities()
    .filter(city => Math.floor(Number(city.troops) || 0) >= minimumTroops && city.id !== target.id)
    .map(city => ({ city, route: findRoute(city, target) }))
    .filter(option => option.route?.points?.length)
    .sort((a, b) => a.route.length - b.route.length)[0] || null;
}

function findNearestScoutSource(target) {
  return findNearestOwnedSource(target, 1);
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
  if (city?.ownerKind === "player" && city.ownerName) return city.ownerName;
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
    return attack.targetOwnerAtLaunch === "neutral" || (!attack.targetOwnerAtLaunch && target?.owner === "neutral");
  }).length;
}

function neutralCaptureStatus(excludeAttackId = null) {
  const daily = ensureDailyCaptureTracker();
  const pending = pendingNeutralCaptureCount("player", excludeAttackId);
  const owned = playerCities().length;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueOnlineSave();
}

function getOnlineApi() {
  return window.CrownlandsOnline || null;
}

function getSerializableGameState() {
  if (!state) return null;
  return JSON.parse(JSON.stringify(state));
}

function getPlayerProfileSnapshot() {
  const profileName = state?.playerName || cleanName(playerNameInput?.value) || "Ricky";
  const activeRegionId = state ? getActiveOnlineRegionId() : DEFAULT_ONLINE_REGION_ID;
  const mainRegionId = state?.online?.mainRegionId || (state?.mainCityId ? getCityRegionId(state.mainCityId) : activeRegionId);
  const activeIslandId = state?.online?.islandId || getOnlineIslandId(activeRegionId);
  return {
    resetGeneration: RESET_GENERATION,
    cloudSaveSlot: ONLINE_SAVE_SLOT,
    worldId: ONLINE_WORLD_ID,
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
    cityCount: state ? playerCities().length : 0,
    gold: state ? Math.floor(Number(state.gold) || 0) : 0,
    localGameSeconds: state ? Number(state.gameSeconds) || 0 : 0,
  };
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
    await api.savePlayerProfile(getPlayerProfileSnapshot());
    await api.saveGameSnapshot(getSerializableGameState(), ONLINE_SAVE_SLOT);
    await syncOwnedCitiesToOnline();
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
  return {
    displayName: state?.playerName || getOnlineApi()?.getUser?.()?.displayName || "Ruler",
    playerName: state?.playerName || "Ruler",
    flag: state?.flag || createDefaultFlag(),
    mainCityId: state?.mainCityId || "",
    cityCount: state ? playerCities().length : 0,
    updatedAtMs: Date.now(),
  };
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
    cityCount: Math.max(0, Math.floor(Number(raw.cityCount) || 0)),
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
  return state ? playerCities().filter(city => getCityRegionId(city) === targetRegionId).length : 0;
}

function getIslandPreviewArtSrc(regionId) {
  const targetRegionId = normalizeRegionId(regionId);
  if (targetRegionId === "west") return WEST_ISLAND_ART_SRC;
  if (targetRegionId === "north") return NORTH_ISLAND_ART_SRC;
  if (targetRegionId === "east") return EAST_ISLAND_ART_SRC;
  if (targetRegionId === "south") return SOUTH_ISLAND_ART_SRC;
  if (targetRegionId === "center") return CENTER_ISLAND_ART_SRC;
  return CENTER_ISLAND_ART_SRC;
}

function getIslandSwitcherSummary(regionId) {
  const ownedCount = getIslandOwnedCityCount(regionId);
  return `${formatNumber(ownedCount)} ${ownedCount === 1 ? "city" : "cities"} owned`;
}

function getIslandMapIconStyle(region) {
  const layout = {
    center: { x: 50, y: 50, w: 25, h: 31 },
    north: { x: 50, y: 18, w: 32, h: 24 },
    south: { x: 50, y: 82, w: 32, h: 24 },
    west: { x: 20, y: 50, w: 24, h: 37 },
    east: { x: 80, y: 50, w: 24, h: 37 },
  }[normalizeRegionId(region.id)];
  const x = layout ? layout.x : clamp((Number(region.x) || 0) / WORLD_WIDTH * 100, 8, 92);
  const y = layout ? layout.y : clamp((Number(region.y) || 0) / WORLD_HEIGHT * 100, 8, 92);
  const width = layout ? layout.w : clamp((Number(region.rx) || 800) * 2 / WORLD_WIDTH * 120, 18, 34);
  const height = layout ? layout.h : clamp((Number(region.ry) || 800) * 2 / WORLD_HEIGHT * 112, 16, 30);
  const rot = ((Number(region.rot) || 0) * 180 / Math.PI).toFixed(2);
  return `--island-x:${formatPathNumber(x)}%;--island-y:${formatPathNumber(y)}%;--island-w:${formatPathNumber(width)}%;--island-h:${formatPathNumber(height)}%;--island-rot:${rot}deg;`;
}

function renderIslandMapTile(region, activeRegionId, homeRegionId) {
  const regionId = normalizeRegionId(region.id);
  const label = region.label || regionId;
  const ownedText = getIslandSwitcherSummary(regionId);
  const isActive = regionId === activeRegionId;
  const isHome = regionId === homeRegionId;
  const ariaParts = [label, ownedText];
  if (isActive) ariaParts.push("current map");
  if (isHome) ariaParts.push("home island");
  return `
    <button
      class="island-map-icon ${isActive ? "active" : ""} ${isHome ? "home" : ""} ${escapeHtml(region.palette || "heartland")}"
      data-island-region="${escapeHtml(regionId)}"
      style="${getIslandMapIconStyle(region)}"
      type="button"
      ${onlineWorldLoading ? "disabled" : ""}
      aria-label="${escapeHtml(ariaParts.join(", "))}"
    >
      <span class="island-map-thumb" aria-hidden="true">
        <img src="${escapeHtml(getIslandPreviewArtSrc(regionId))}" alt="" draggable="false" />
      </span>
      <span class="island-map-name">${escapeHtml(label)}</span>
      <span class="island-map-owned">${escapeHtml(ownedText)}</span>
      ${isActive ? `<span class="island-map-active-label">Current</span>` : ""}
      ${isHome ? `<span class="island-map-home-label">Home</span>` : ""}
    </button>
  `;
}

function showIslandSwitcherModal() {
  if (!state) return;
  modal.classList.add("island-switcher-modal");
  modalTitle.textContent = "Map";
  const activeRegionId = getActiveOnlineRegionId();
  const homeRegionId = getMainCityRegionId();
  modalBody.innerHTML = `
    <div class="island-map-picker" aria-label="Island map picker">
      <span class="island-map-connector north" aria-hidden="true"></span>
      <span class="island-map-connector south" aria-hidden="true"></span>
      <span class="island-map-connector west" aria-hidden="true"></span>
      <span class="island-map-connector east" aria-hidden="true"></span>
      ${WORLD_REGIONS.map(region => renderIslandMapTile(region, activeRegionId, homeRegionId)).join("")}
    </div>
  `;
  if (!modal.open) modal.showModal();
  modalBody.querySelectorAll("[data-island-region]").forEach(button => {
    button.addEventListener("click", () => switchOnlineIsland(button.dataset.islandRegion));
  });
}

function prepareSelectionForIslandSwitch() {
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  if (sendMode && source?.owner === "player") {
    selectedTargetId = null;
    scoutNearbySourceId = null;
    return;
  }
  clearSelection(false);
}

async function switchOnlineIsland(regionId) {
  if (onlineWorldLoading) return;
  const targetRegionId = normalizeRegionId(regionId);
  if (!state) {
    centerOnRegion(targetRegionId);
    if (modal.open) modal.close();
    return;
  }
  if (targetRegionId === getActiveOnlineRegionId() && onlineWorldConnected) {
    if (modal.open) modal.close();
    centerOnRegion(targetRegionId);
    return;
  }

  if (!getOnlineApi()?.isSignedIn?.()) {
    state.activeRegionId = targetRegionId;
    onlineActiveRegionId = targetRegionId;
    prepareSelectionForIslandSwitch();
    updateIslandSwitcherUi();
    if (modal.open) modal.close();
    centerOnRegion(targetRegionId);
    renderAll();
    return;
  }

  const previousLabel = getRegionLabel(getActiveOnlineRegionId());
  const targetLabel = getRegionLabel(targetRegionId);
  onlineStatusDetail.textContent = `Leaving ${previousLabel}...`;
  await syncOwnedCitiesToOnline(true);
  await flushOnlineSave(true);
  if (typeof onlineIslandUnsubscribe === "function") onlineIslandUnsubscribe();
  onlineIslandUnsubscribe = null;
  clearOnlineArmyWatchers();
  onlinePresence = [];
  onlineCitiesLoaded = false;
  onlineWorldConnected = false;
  prepareSelectionForIslandSwitch();
  pathsSvg.innerHTML = "";
  if (harvestLayer) harvestLayer.innerHTML = "";
  armyLayer.innerHTML = "";
  cityLayer.innerHTML = "";
  if (modal.open) modal.close();
  const connected = await connectOnlineIsland(targetRegionId, {
    claimHome: false,
    homeRegionId: state.online?.mainRegionId || targetRegionId,
  });
  if (connected) {
    centerOnRegion(targetRegionId);
    renderAll();
  } else {
    showToast(`Could not load ${targetLabel}.`);
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
    onlineStatusText.textContent = "Guest mode";
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
      onlineStatusDetail.textContent = `Cloud save waiting: ${onlineLastError}`;
    } else if (onlineLastSaveAt) {
      onlineStatusDetail.textContent = `Cloud save ready. Last synced ${new Date(onlineLastSaveAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Press Enter Kingdom.`;
    } else {
      onlineStatusDetail.textContent = "Cloud save ready. Press Enter Kingdom to join the game.";
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
    disconnectOnlineWorld();
    await flushOnlineSave(true);
    await api.signOut();
    onlineLastSaveAt = 0;
    onlineLastError = "";
    updateOnlineUi();
    showToast("Signed out. Guest local save is still available.");
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
  onlinePresence = [];
  onlinePresenceTimer = 0;
  onlinePresenceInFlight = false;
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

async function setupOnlineWorld() {
  const api = getOnlineApi();
  if (!state || !api?.isConfigured?.() || !api?.isSignedIn?.()) return false;

  if (onlineWorldConnected && isOnlineWorldActive()) return true;

  onlineStatusDetail.textContent = "Finding your home island...";
  let profile = null;
  try {
    if (api.loadPlayerProfile) {
      profile = await withTimeout(api.loadPlayerProfile(), 8000, "Player profile lookup is taking too long.");
    }
  } catch (error) {
    console.warn("Could not load online profile before island setup", error);
  }

  const homeRegionId = resolveHomeRegionId(profile);
  const activeRegionId = homeRegionId;
  const mainIslandId = getOnlineIslandId(homeRegionId);
  const mainCityId = getKnownCityId(profile?.mainCityId)
    || getKnownCityId(state.online?.mainCityId)
    || getKnownCityId(state.mainCityId)
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

async function connectOnlineIsland(regionId, { claimHome = false, homeRegionId = null, profile = null } = {}) {
  const api = getOnlineApi();
  if (!state || !api?.isConfigured?.() || !api?.isSignedIn?.()) return false;
  if (onlineWorldLoading) return false;

  const targetRegionId = normalizeRegionId(regionId);
  const islandId = getOnlineIslandId(targetRegionId);
  const homeRegion = normalizeRegionId(homeRegionId || state.online?.mainRegionId || targetRegionId);
  const mainIslandId = getOnlineIslandId(homeRegion);

  onlineWorldLoading = true;
  onlineCitiesLoaded = false;
  onlineWorldConnected = false;
  onlineActiveRegionId = targetRegionId;
  state.activeRegionId = targetRegionId;
  state.online = {
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

  onlineStatusDetail.textContent = `Loading ${getRegionLabel(targetRegionId)}...`;
  try {
    const seed = createOnlineIslandSeed(targetRegionId);
    onlineStatusDetail.textContent = `Preparing ${getRegionLabel(targetRegionId)} (${seed.cities.length} city slots)...`;
    await withTimeout(api.ensureMainIsland({
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
    }), 16000, `${getRegionLabel(targetRegionId)} setup is taking too long.`);

    if (claimHome) {
      onlineStatusDetail.textContent = "Claiming your starting city...";
      const claim = await withTimeout(api.claimStartingCity({
        islandId,
        candidateCityIds: seed.claimCandidateIds,
        playerName: state.playerName,
        flag: state.flag,
        worldId: ONLINE_WORLD_ID,
        mainRegionId: targetRegionId,
      }), 12000, "Starting city claim is taking too long.");

      if (!claim?.cityId) throw new Error("No starting city was claimed.");
      state.online.mainIslandId = islandId;
      state.online.mainRegionId = targetRegionId;
      state.online.mainCityId = claim?.cityId || state.online.mainCityId || state.mainCityId;
      if (claim?.cityId) state.mainCityId = claim.cityId;
      onlineFreshClaimCityId = !claim?.alreadyClaimed && claim?.cityId ? claim.cityId : "";
      const claimedCity = claim?.cityId ? cityById(claim.cityId) : null;
      if (claimedCity) claimedCity.isMainCity = true;
      if (claim?.alreadyClaimed) addLog(`Online ${getRegionLabel(targetRegionId)} connected. Your claimed city was restored.`);
      else if (claim?.cityId) addLog(`Online ${getRegionLabel(targetRegionId)} connected. ${cityById(claim.cityId)?.name || "A city"} joined your kingdom.`);
    }

    if (onlineIslandUnsubscribe) onlineIslandUnsubscribe();
    onlineIslandUnsubscribe = null;
    clearOnlineArmyWatchers();
    onlinePresence = [];
    state.attacks = state.attacks.filter(attack => getKnownCityId(attack.fromId) && getKnownCityId(attack.toId));
    let initialCitiesReady = false;
    let resolveInitialCities = () => {};
    let rejectInitialCities = () => {};
    const initialCitiesPromise = withTimeout(new Promise((resolve, reject) => {
      resolveInitialCities = () => {
        if (initialCitiesReady) return;
        initialCitiesReady = true;
        resolve();
      };
      rejectInitialCities = error => {
        if (initialCitiesReady) return;
        initialCitiesReady = true;
        reject(error);
      };
    }), 12000, `${getRegionLabel(targetRegionId)} city sync did not start. Check Firestore rules for islands/${islandId}/cities.`);
    onlineStatusDetail.textContent = `Opening ${getRegionLabel(targetRegionId)}...`;
    subscribeOnlineArmyWatchers(islandId);
    onlineIslandUnsubscribe = api.subscribeIsland(islandId, {
      onCities: onlineCities => {
        const firstCitiesSnapshot = !onlineCitiesLoaded;
        applyOnlineCities(onlineCities, targetRegionId);
        onlineCitiesLoaded = true;
        if (pendingOfflineProgressSeconds > 0) applyPendingOfflineProgress();
        if (state?.mainCityId && getCityRegionId(state.mainCityId) === targetRegionId && cityById(state.mainCityId)?.owner !== "player") {
          const nextOwned = playerCities()[0];
          state.mainCityId = nextOwned?.id || state.mainCityId;
        }
        if (firstCitiesSnapshot) {
          syncOwnedCitiesToOnline(true);
          publishOnlinePresence(true);
        }
        renderAll();
        resolveInitialCities();
        onlineFreshClaimCityId = "";
      },
      onArmies: armies => {
        applyOnlineArmies(armies, islandId);
        renderPaths();
        renderArmies();
        updateIncomingAttackUi();
      },
      onPresence: presence => {
        applyOnlinePresence(presence);
      },
      onError: (error, source) => {
        const shouldRejectInitial = source === "cities" && !initialCitiesReady;
        handleOnlineSnapshotError(error, shouldRejectInitial ? rejectInitialCities : null);
      },
    });

    await initialCitiesPromise;
    onlineWorldConnected = true;
    await publishOnlinePresence(true);
    updateOnlinePlayersUi();
    updateIslandSwitcherUi();
    const activeCount = Math.max(1, getActiveOnlinePlayers().length);
    onlineStatusDetail.textContent = `${getRegionLabel(targetRegionId)} connected. ${formatNumber(activeCount)} ruler${activeCount === 1 ? "" : "s"} online here.`;
    showToast(`${getRegionLabel(targetRegionId)} connected.`);
    saveGame();
    return true;
  } catch (error) {
    onlineLastError = error?.message || String(error);
    if (state?.online?.islandId === islandId) state.online = null;
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
        return {
          ...base,
          owner: "neutral",
          ownerKind: "neutral",
          ownerUid: null,
          ownerName: "",
          ownerFlag: null,
          level: clampCityLevel(base.level),
          troops: Math.max(0, Math.floor(Number(base.troops) || NEUTRAL_START_TROOPS)),
          troopFloat: Math.max(0, Number(base.troops) || NEUTRAL_START_TROOPS),
          defense: 1,
          investedGold: 0,
          lastCapturedAt: null,
          isMainCity: base.id === state.mainCityId,
          startPool: base.startPool,
          regionId: base.regionId,
        };
      }
      const owner = OWNER[current.owner] ? current.owner : "neutral";
      return {
        ...base,
        name: current.name || base.name,
        owner,
        ownerKind: current.ownerKind || (owner === "player" ? "player" : owner === "enemy" ? "enemy" : "neutral"),
        ownerUid: current.ownerUid || null,
        ownerName: current.ownerName || "",
        ownerFlag: current.ownerFlag || null,
        level: clampCityLevel(current.level ?? base.level),
        troops: Math.max(0, Math.floor(Number(current.troops ?? base.troops) || 0)),
        troopFloat: Math.max(0, Number(current.troopFloat ?? current.troops ?? base.troops) || 0),
        defense: 1,
        investedGold: Math.max(0, Math.floor(Number(current.investedGold) || 0)),
        lastCapturedAt: current.lastCapturedAt ?? null,
        isMainCity: owner === "player" ? base.id === state.mainCityId : Boolean(current.isMainCity),
        startPool: base.startPool,
        regionId: base.regionId,
      };
    }
    const current = localById.get(base.id) || {};
    const online = byId.get(base.id) || {};
    const ownerKind = online.ownerKind || online.owner || current.ownerKind || "neutral";
    const ownerUid = online.ownerUid || null;
    const ownerName = online.ownerName || "";
    const ownerFlag = online.ownerFlag || null;
    const localOwner = ownerKind === "player"
      ? ownerUid === currentUid ? "player" : "enemy"
      : ownerKind === "enemy" ? "enemy" : "neutral";
    const normalizedOwnerKind = ownerKind === "player" || ownerKind === "enemy" ? ownerKind : "neutral";
    const currentIsLocalPlayerCity = current.owner === "player" && (!current.ownerUid || current.ownerUid === currentUid);
    const onlineBelongsToAnotherPlayer = ownerKind === "player" && ownerUid && ownerUid !== currentUid;
    const onlineBelongsToCurrentPlayer = ownerKind === "player" && ownerUid === currentUid;
    const isFreshClaimCity = onlineFreshClaimCityId === base.id;
    const keepLocalPlayerCity = currentIsLocalPlayerCity
      && !onlineBelongsToAnotherPlayer
      && !isFreshClaimCity
      && (onlineBelongsToCurrentPlayer || localDirtyCityIds.has(base.id));

    return {
      ...base,
      name: keepLocalPlayerCity ? current.name || online.name || base.name : online.name || current.name || base.name,
      owner: keepLocalPlayerCity ? "player" : OWNER[localOwner] ? localOwner : "neutral",
      ownerKind: keepLocalPlayerCity ? "player" : normalizedOwnerKind,
      ownerUid: keepLocalPlayerCity ? currentUid || current.ownerUid || ownerUid || null : ownerUid,
      ownerName: keepLocalPlayerCity ? state.playerName : ownerName,
      ownerFlag: keepLocalPlayerCity ? state.flag : ownerFlag,
      level: clampCityLevel(keepLocalPlayerCity ? current.level ?? online.level ?? base.level : online.level ?? current.level ?? base.level),
      troops: Math.max(0, Math.floor(Number(keepLocalPlayerCity ? current.troops ?? online.troops ?? base.troops : online.troops ?? current.troops ?? base.troops) || 0)),
      troopFloat: Math.max(0, Number(keepLocalPlayerCity ? current.troopFloat ?? current.troops ?? online.troopFloat ?? online.troops ?? base.troops : online.troopFloat ?? current.troopFloat ?? online.troops ?? current.troops ?? base.troops) || 0),
      defense: 1,
      investedGold: Math.max(0, Math.floor(Number(keepLocalPlayerCity ? current.investedGold ?? online.investedGold : online.investedGold ?? current.investedGold) || 0)),
      lastCapturedAt: keepLocalPlayerCity ? current.lastCapturedAt ?? online.lastCapturedAt ?? null : online.lastCapturedAt ?? current.lastCapturedAt ?? null,
      isMainCity: localOwner === "player" ? base.id === state.mainCityId : Boolean(online.isMainCity || current.isMainCity),
      startPool: base.startPool,
      regionId: base.regionId,
    };
  });
  state.activeRegionId = activeRegionId;
  if (state.online) {
    state.online.activeRegionId = activeRegionId;
    state.online.islandId = getOnlineIslandId(activeRegionId);
  }
  ensureLoadedMainCityForRegion(activeRegionId);
}

function ensureLoadedMainCityForRegion(regionId) {
  if (!state) return;
  const activeRegionId = normalizeRegionId(regionId);
  const homeRegionId = normalizeRegionId(state.online?.mainRegionId || (state.mainCityId ? getCityRegionId(state.mainCityId) : activeRegionId));
  if (activeRegionId !== homeRegionId) return;

  const currentMain = state.mainCityId ? cityById(state.mainCityId) : null;
  if (currentMain?.owner === "player") {
    currentMain.isMainCity = true;
    if (state.online) {
      state.online.mainCityId = currentMain.id;
      state.online.mainRegionId = activeRegionId;
      state.online.mainIslandId = getOnlineIslandId(activeRegionId);
    }
    return;
  }

  const fallbackMain = playerCities().find(city => city.isMainCity) || playerCities()[0];
  if (!fallbackMain) return;
  state.mainCityId = fallbackMain.id;
  fallbackMain.isMainCity = true;
  if (state.online) {
    state.online.mainCityId = fallbackMain.id;
    state.online.mainRegionId = activeRegionId;
    state.online.mainIslandId = getOnlineIslandId(activeRegionId);
  }
}

function markOwnedCityChanged(city, syncNow = true) {
  if (!state || !city || city.owner !== "player") return;
  localDirtyCityIds.add(city.id);
  city.ownerKind = "player";
  city.ownerUid = getCurrentOnlineUid() || city.ownerUid || null;
  city.ownerName = state.playerName;
  city.ownerFlag = state.flag;
  city.isMainCity = city.id === state.mainCityId;
  if (syncNow && isOnlineWorldActive()) syncOwnedCitiesToOnline(true);
}

function toOnlineOwnedCity(city) {
  return {
    id: city.id,
    name: city.name,
    x: city.x,
    y: city.y,
    startPool: city.startPool || "",
    regionId: city.regionId || city.startPool || getCityRegionId(city),
    ownerKind: "player",
    ownerUid: getCurrentOnlineUid(),
    ownerName: state.playerName,
    ownerFlag: state.flag,
    level: clampCityLevel(city.level),
    troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
    troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
    defense: 1,
    investedGold: Math.max(0, Math.floor(Number(city.investedGold) || 0)),
    lastCapturedAt: city.lastCapturedAt ?? null,
    isMainCity: city.owner === "player" ? city.id === state.mainCityId : Boolean(city.isMainCity),
  };
}

function toOnlineCityState(city) {
  return {
    id: city.id,
    name: city.name,
    x: city.x,
    y: city.y,
    startPool: city.startPool || "",
    regionId: city.regionId || city.startPool || getCityRegionId(city),
    ownerKind: city.ownerKind || (city.owner === "player" ? "player" : city.owner === "enemy" ? "enemy" : city.owner || "neutral"),
    ownerUid: city.ownerKind === "player" ? city.ownerUid || null : null,
    ownerName: city.ownerName || "",
    ownerFlag: city.ownerFlag || null,
    level: clampCityLevel(city.level),
    troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
    troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
    defense: 1,
    investedGold: Math.max(0, Math.floor(Number(city.investedGold) || 0)),
    lastCapturedAt: city.lastCapturedAt ?? null,
    isMainCity: city.owner === "player" ? city.id === state.mainCityId : Boolean(city.isMainCity),
  };
}

function syncSharedCityState(city) {
  if (!city || !isOnlineWorldActive()) return;
  const api = getOnlineApi();
  if (!api?.saveCityState) return;
  api.saveCityState(getOnlineIslandId(getCityRegionId(city)), toOnlineCityState(city)).catch(error => {
    onlineLastError = error?.message || String(error);
    console.warn("Could not sync city battle state", error);
  });
}

function syncCityStateToOnline(city) {
  if (!city || !isOnlineWorldActive()) return;
  syncSharedCityState(city);
}

async function syncOwnedCitiesToOnline(force = false) {
  if (!isOnlineWorldActive()) return false;
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
  const cities = playerCities()
    .filter(city => !city.ownerUid || city.ownerUid === currentUid)
    .filter(city => getCityRegionId(city) === activeRegionId)
    .map(toOnlineOwnedCity);
  if (!cities.length && !force) return false;

  onlineCitySyncInFlight = true;
  try {
    await api.savePlayerCities(getActiveOnlineIslandId(), cities);
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
    launchedAtMs: Math.max(0, Number(mission.launchedAtMs) || Date.now()),
    arrivesAtMs: Math.max(0, Number(mission.arrivesAtMs) || Date.now()),
    status: "active",
  };
}

function publishOnlineArmyMovement(mission) {
  if (!isOnlineWorldActive() || mission?.owner !== "player") return;
  const api = getOnlineApi();
  if (!api?.saveArmyMovement) return;
  prepareOnlineArmyMission(mission);
  const movement = toOnlineArmyMovement(mission);
  if (!movement) return;
  const regionIds = movement.routeRegionIds?.length ? movement.routeRegionIds : getMissionRegionIds(mission);
  mission.onlineRegionIds = regionIds;
  regionIds.forEach(regionId => {
    api.saveArmyMovement(getOnlineIslandId(regionId), movement).catch(error => {
      onlineLastError = error?.message || String(error);
      console.warn("Could not sync army movement", error);
    });
  });
}

function deleteOnlineArmyMovement(mission) {
  if (!mission?.onlineId || mission.owner !== "player") return;
  const api = getOnlineApi();
  if (!api?.deleteArmyMovement) return;
  const regionIds = mission.onlineRegionIds?.length ? mission.onlineRegionIds : getMissionRegionIds(mission);
  regionIds.forEach(regionId => {
    api.deleteArmyMovement(getOnlineIslandId(regionId), mission.onlineId).catch(error => {
      onlineLastError = error?.message || String(error);
      console.warn("Could not delete army movement", error);
    });
  });
}

function getOnlineArmyRemainingSeconds(army) {
  if (!army) return 0;
  if (Number.isFinite(army.arrivesAtMs) && army.arrivesAtMs > 0) {
    return (army.arrivesAtMs - Date.now()) / 1000;
  }
  return Number(army.remaining) || 0;
}

function resolveOnlineArmyOwner(army) {
  if (army?.ownerUid && army.ownerUid === getCurrentOnlineUid()) return "player";
  if (army?.ownerKind === "neutral") return "neutral";
  return "enemy";
}

function normalizeOnlineArmyMovement(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
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
    ownerKind: raw.ownerKind || raw.owner || "player",
    ownerUid: raw.ownerUid || "",
    ownerName: raw.ownerName || "",
    ownerFlag: raw.ownerFlag || null,
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

function subscribeOnlineArmyWatchers(activeIslandId) {
  clearOnlineArmyWatchers();
  const api = getOnlineApi();
  if (!api?.subscribeIsland || !isOnlineWorldActive()) return;
  const activeId = String(activeIslandId || getActiveOnlineIslandId());
  const islandIds = [...new Set(getRegionIds().map(getOnlineIslandId).filter(Boolean))]
    .filter(islandId => islandId !== activeId);

  islandIds.forEach(islandId => {
    const unsubscribe = api.subscribeIsland(islandId, {
      onArmies: armies => {
        applyOnlineArmies(armies, islandId);
        renderPaths();
        renderArmies();
        updateIncomingAttackUi();
      },
    });
    if (typeof unsubscribe === "function") onlineArmyUnsubscribes.push(unsubscribe);
  });
}

function isOnlineArmyVisible(army) {
  if (!army || army.status !== "active") return false;
  if (!army.fromId || !army.toId) return false;
  return getOnlineArmyRemainingSeconds(army) > -ONLINE_ARMY_EXPIRY_GRACE_SECONDS;
}

function adoptOwnOnlineArmies() {
  if (!state || !Array.isArray(onlineArmies)) return;
  const uid = getCurrentOnlineUid();
  if (!uid) return;
  const localOnlineIds = new Set(state.attacks.map(attack => attack.onlineId).filter(Boolean));
  for (const army of onlineArmies) {
    if (army.ownerUid !== uid || localOnlineIds.has(army.id)) continue;
    const remaining = getOnlineArmyRemainingSeconds(army);
    if (remaining <= 0) continue;
    state.attacks.push({
      id: attackIdCounter++,
      onlineId: army.id,
      owner: "player",
      ownerKind: "player",
      ownerUid: uid,
      ownerName: army.ownerName || state.playerName,
      ownerFlag: army.ownerFlag || state.flag,
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
      launchedAtMs: army.launchedAtMs,
      arrivesAtMs: army.arrivesAtMs,
      onlineRegionIds: army.onlineRegionIds,
    });
    localOnlineIds.add(army.id);
  }
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
    .filter(isOnlineArmyVisible));
  rebuildOnlineArmies();
  adoptOwnOnlineArmies();
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
      if (!attack || attack.kind !== "attack" || attack.owner === "player") return null;
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

function hardReset() {
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  location.reload();
}

function readSavedName() {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.playerName) return cleanName(parsed.playerName);
    } catch (_) {}
  }
  return "";
}

function getPreferredPlayerName() {
  const api = getOnlineApi();
  return cleanName(playerNameInput?.value)
    || cleanName(api?.getUser?.()?.displayName)
    || readSavedName()
    || "Ricky";
}

async function startFromInput(forceFresh = false) {
  const playerName = getPreferredPlayerName();
  const launchBtn = enterKingdomBtn || startBtn;
  const originalStartText = launchBtn?.textContent || "";
  try {
    if (launchBtn) {
      launchBtn.disabled = true;
      launchBtn.textContent = forceFresh ? "Creating..." : "Entering...";
    }
    if (freshBtn) freshBtn.disabled = true;

    const onlineSaved = forceFresh ? null : await loadOnlineGame(playerName);
    const saved = onlineSaved || (forceFresh ? null : loadGame());
    state = saved || newGame(playerName);
    if (!saved) state.playerName = playerName;
    if (state.mainCityId) state.activeRegionId = getCityRegionId(state.mainCityId);
    localDirtyCityIds = new Set();
    pendingOfflineProgressSeconds = getOfflineProgressSeconds(state);
    pendingOfflineProductionCities = pendingOfflineProgressSeconds > 0 ? createOfflineProductionSnapshot(state) : [];
    state.lastRealTimeMs = Date.now();
    selectedMarchPercent = normalizeMarchPercent(state.marchPercent);
    const requiresOnlineWorld = Boolean(getOnlineApi()?.isSignedIn?.());
    const onlineConnected = requiresOnlineWorld ? await setupOnlineWorld() : false;
    if (requiresOnlineWorld && !onlineConnected) return;
    if (!onlineConnected) applyPendingOfflineProgress();
    setupScreen.classList.remove("visible");
    clearSelection(false);
    rememberOwnedAttackSource(state.mainCityId || playerCities()[0]?.id);
    saveGame();
    renderAll();
    requestAnimationFrame(() => centerOnCity(selectedSourceId || state.mainCityId || playerCities()[0]?.id));
  } finally {
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
  if (normalizedRegionId === "west") return isWestIslandLandPoint(x, y);
  if (normalizedRegionId === "north") return isNorthIslandLandPoint(x, y);
  if (normalizedRegionId === "east") return isEastIslandLandPoint(x, y);
  if (normalizedRegionId === "south") return isSouthIslandLandPoint(x, y);
  if (normalizedRegionId === "center") return isCenterIslandLandPoint(x, y);
  return false;
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

function isWalkableCellForRegion(gx, gy, regionId) {
  if (gx < 0 || gy < 0 || gx >= GRID_COLS || gy >= GRID_ROWS) return false;
  return isRegionWalkablePoint(gx * GRID_SIZE + GRID_SIZE / 2, gy * GRID_SIZE + GRID_SIZE / 2, regionId, 0);
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

function nearestWalkableCellInRegion(x, y, regionId) {
  const start = worldToGrid(x, y);
  if (isWalkableCellForRegion(start.gx, start.gy, regionId)) return start;

  for (let radius = 1; radius <= 12; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const gx = start.gx + dx;
        const gy = start.gy + dy;
        if (isWalkableCellForRegion(gx, gy, regionId)) return { gx, gy };
      }
    }
  }
  return null;
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

function linePassableInRegion(a, b, regionId) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const steps = Math.max(2, Math.ceil(distance / 22));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!isRegionWalkablePoint(x, y, regionId, 6)) return false;
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

function gridEdgePassableInRegion(cx, cy, nx, ny, regionId) {
  const currentIndex = cy * GRID_COLS + cx;
  const nextIndex = ny * GRID_COLS + nx;
  const baseKey = currentIndex < nextIndex ? `${currentIndex}|${nextIndex}` : `${nextIndex}|${currentIndex}`;
  const key = `${normalizeRegionId(regionId)}:${baseKey}`;
  if (routeEdgePassableCache.has(key)) return routeEdgePassableCache.get(key);
  if (routeEdgePassableCache.size > 400000) routeEdgePassableCache.clear();
  const passable = linePassableInRegion(gridToWorld(cx, cy), gridToWorld(nx, ny), regionId);
  routeEdgePassableCache.set(key, passable);
  return passable;
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
  const cacheKey = `portal:${normalizedSourceRegionId}:${normalizedTargetRegionId}:${getRoutePointId(source, "source")}|${getRoutePointId(target, "target")}`;
  const reverseKey = `portal:${normalizedTargetRegionId}:${normalizedSourceRegionId}:${getRoutePointId(target, "target")}|${getRoutePointId(source, "source")}`;
  if (routeCache.has(cacheKey)) return cloneRoute(routeCache.get(cacheKey));
  if (routeCache.has(reverseKey)) {
    const reverse = reverseRoute(routeCache.get(reverseKey));
    routeCache.set(cacheKey, cloneRoute(reverse));
    return reverse;
  }

  const chain = getPortalRouteRegionChain(normalizedSourceRegionId, normalizedTargetRegionId);
  let current = makeRoutePoint(getRoutePointId(source, "source"), source);
  const segments = [];
  const points = [];
  let length = 0;

  for (let index = 0; index < chain.length; index += 1) {
    const regionId = chain[index];
    const isLastRegion = index === chain.length - 1;
    const portalExitPoint = isLastRegion ? null : getPortalWorldPoint(regionId, chain[index + 1]);
    if (!isLastRegion && !portalExitPoint) return null;
    const segmentEnd = isLastRegion
      ? makeRoutePoint(getRoutePointId(target, "target"), target)
      : makeRoutePoint(`portal:${regionId}->${chain[index + 1]}`, portalExitPoint);
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
      const arrivalPoint = getPortalWorldPoint(chain[index + 1], regionId);
      if (!arrivalPoint) return null;
      current = makeRoutePoint(`portal:${chain[index + 1]}<-${regionId}`, arrivalPoint);
    }
  }

  const route = { points, segments, length };
  routeCache.set(cacheKey, cloneRoute(route));
  return route;
}

function findLandRoute(source, target, regionId = getCityRegionId(source)) {
  const normalizedRegionId = normalizeRegionId(regionId);
  const cacheKey = `land:${normalizedRegionId}:${getRoutePointId(source, "source")}|${getRoutePointId(target, "target")}`;
  const reverseKey = `land:${normalizedRegionId}:${getRoutePointId(target, "target")}|${getRoutePointId(source, "source")}`;
  if (routeCache.has(cacheKey)) return cloneRoute(routeCache.get(cacheKey));
  if (routeCache.has(reverseKey)) {
    const reverse = reverseRoute(routeCache.get(reverseKey));
    routeCache.set(cacheKey, cloneRoute(reverse));
    return reverse;
  }

  const startPoint = { x: source.x, y: source.y };
  const endPoint = { x: target.x, y: target.y };
  if (linePassableInRegion(startPoint, endPoint, normalizedRegionId)) {
    const direct = {
      points: [startPoint, endPoint],
      segments: [{ regionId: normalizedRegionId, points: [startPoint, endPoint], length: Math.hypot(source.x - target.x, source.y - target.y) }],
      length: Math.hypot(source.x - target.x, source.y - target.y),
    };
    routeCache.set(cacheKey, cloneRoute(direct));
    return direct;
  }

  const start = nearestWalkableCellInRegion(source.x, source.y, normalizedRegionId);
  const goal = nearestWalkableCellInRegion(target.x, target.y, normalizedRegionId);
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
      const route = buildRouteFromCells(cameFrom, current.index, startPoint, endPoint, normalizedRegionId);
      route.segments = [{ regionId: normalizedRegionId, points: route.points.map(point => ({ x: point.x, y: point.y })), length: route.length }];
      routeCache.set(cacheKey, cloneRoute(route));
      return route;
    }

    closed.add(current.index);
    const cx = current.index % GRID_COLS;
    const cy = Math.floor(current.index / GRID_COLS);
    const currentG = gScore.get(current.index) || 0;

    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkableCellForRegion(nx, ny, normalizedRegionId)) continue;
      if (dx && dy && (!isWalkableCellForRegion(cx + dx, cy, normalizedRegionId) || !isWalkableCellForRegion(cx, cy + dy, normalizedRegionId))) continue;
      if (!gridEdgePassableInRegion(cx, cy, nx, ny, normalizedRegionId)) continue;
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

function buildRouteFromCells(cameFrom, currentIndex, startPoint, endPoint, regionId = "") {
  const cells = [];
  let current = currentIndex;
  cells.push(current);
  while (cameFrom.has(current)) {
    current = cameFrom.get(current);
    cells.push(current);
  }
  cells.reverse();

  let points = [startPoint, ...cells.map(index => gridToWorld(index % GRID_COLS, Math.floor(index / GRID_COLS))), endPoint];
  points = simplifyRoute(points, regionId);
  return { points, length: routeLength(points) };
}

function simplifyRoute(points, regionId = "") {
  if (points.length <= 2) return points;
  const simplified = [points[0]];
  let anchor = 0;
  const normalizedRegionId = regionId ? normalizeRegionId(regionId) : "";

  while (anchor < points.length - 1) {
    let next = points.length - 1;
    while (next > anchor + 1) {
      const passable = normalizedRegionId
        ? linePassableInRegion(points[anchor], points[next], normalizedRegionId)
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

  if (state && !state.gameOver) {
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
      onlinePresenceTimer += dt;
      if (onlinePresenceTimer >= ONLINE_PRESENCE_SECONDS) {
        onlinePresenceTimer = 0;
        publishOnlinePresence();
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
  return Math.max(HARVEST_BONUS_MIN_TROOPS, passiveTroops);
}

function getHarvestBonusIcon(type) {
  return normalizeHarvestBonusType(type) === "troops" ? "&#9817;" : "&#129689;";
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

function pruneExpiredHarvestBonuses() {
  if (!state) return;
  const now = Math.max(0, Number(state.gameSeconds) || 0);
  const before = state.harvestBonuses?.length || 0;
  state.harvestBonuses = normalizeHarvestBonuses(state.harvestBonuses)
    .filter(bonus => (
      now - bonus.createdAt <= HARVEST_BONUS_EXPIRE_SECONDS
      && isHarvestBonusTerrainSafePoint(bonus.x, bonus.y, bonus.regionId)
    ));
  if (state.harvestBonuses.length !== before) renderHarvestBonuses();
}

function isHarvestBonusFarFromCities(x, y, regionId) {
  return state.cities
    .filter(city => getCityRegionId(city) === regionId)
    .every(city => Math.hypot(city.x - x, city.y - y) >= HARVEST_BONUS_CITY_CLEARANCE);
}

function isHarvestBonusFarFromPortals(x, y, regionId) {
  const activeRegionId = getActiveMapRegionId();
  if (normalizeRegionId(regionId) !== activeRegionId) return true;
  return getActiveIslandTeleporters()
    .every(teleport => Math.hypot(teleport.worldPoint.x - x, teleport.worldPoint.y - y) >= HARVEST_BONUS_PORTAL_CLEARANCE);
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
  if (!isHarvestBonusTerrainSafePoint(x, y, activeRegionId)) return false;
  if (!isHarvestBonusFarFromCities(x, y, activeRegionId)) return false;
  if (!isHarvestBonusFarFromPortals(x, y, activeRegionId)) return false;
  if (!isHarvestBonusFarFromOtherPickups(x, y, activeRegionId)) return false;
  return true;
}

function createHarvestBonusPoint(regionId) {
  const activeRegionId = normalizeRegionId(regionId);
  const bounds = getIslandMapBounds(activeRegionId);
  const margin = Math.max(128, HARVEST_BONUS_LAND_CLEARANCE * 2);
  for (let attempt = 0; attempt < 700; attempt += 1) {
    const x = bounds.left + margin + Math.random() * Math.max(1, bounds.width - margin * 2);
    const y = bounds.top + margin + Math.random() * Math.max(1, bounds.height - margin * 2);
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
  if (!state || state.gameOver || onlineWorldLoading) return;
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

function collectHarvestBonus(bonusId) {
  if (!state || state.gameOver) return;
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
    addLog(`Harvested one hour of troop production: ${formatNumber(troopReward)} troops to ${rewardCity.name}.`);
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
  return snapshot.cities
    .filter(city => city.owner === "player")
    .map(city => ({
      id: city.id,
      name: city.name,
      owner: "player",
      level: clampCityLevel(city.level),
      troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
      troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
    }));
}

function applyPendingOfflineProgress() {
  if (!state || pendingOfflineProgressSeconds <= 0) return;
  const elapsed = pendingOfflineProgressSeconds;
  pendingOfflineProgressSeconds = 0;

  const productionCities = pendingOfflineProductionCities.length
    ? pendingOfflineProductionCities
    : createOfflineProductionSnapshot(state);
  pendingOfflineProductionCities = [];
  if (!productionCities.length) return;

  const goldGained = Math.floor(productionCities.reduce((sum, city) => sum + getCityStats(city).goldProductionPerSecond, 0) * elapsed);
  let troopsKeptInCities = 0;
  let troopsRalliedToMain = 0;
  const changedOwnedCities = new Set();
  for (const offlineCity of productionCities) {
    const growth = getCityStats(offlineCity).troopProductionPerSecond * elapsed;
    if (growth <= 0) continue;
    const gained = Math.floor(growth);
    if (gained <= 0) continue;

    const currentCity = cityById(offlineCity.id);
    if (currentCity?.owner === "player") {
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

  if (goldGained > 0 || troopsGained > 0) {
    const rallyText = troopsRalliedToMain > 0 ? ` ${formatNumber(troopsRalliedToMain)} troops from lost cities rallied to ${mainCity ? mainCity.name : "the main city"}.` : "";
    addLog(`Offline production: +${formatNumber(goldGained)} gold and +${formatNumber(troopsGained)} troops.${rallyText}`);
    showOfflineRewardsModal({
      goldGained,
      troopsGained,
      troopsKeptInCities,
      troopsRalliedToMain,
      elapsed,
      cityName: mainCity?.name || "main city",
    });
    syncOwnedCitiesToOnline(true);
    saveGame();
  }
}

function showOfflineRewardsModal({ goldGained = 0, troopsGained = 0, troopsKeptInCities = 0, troopsRalliedToMain = 0, elapsed = 0, cityName = "main city" } = {}) {
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
      <button id="offlineCollectBtn" class="offline-collect-btn" type="button">Collect</button>
    </div>
  `;
  modalBody.querySelector("#offlineCollectBtn")?.addEventListener("click", () => modal.close());
  if (!modal.open) modal.showModal();
}

function updateAttacks(dt) {
  const completed = [];
  for (const attack of state.attacks) {
    attack.remaining -= dt;
    if (attack.remaining <= 0) completed.push(attack);
  }

  for (const attack of completed) {
    resolveAttack(attack);
    deleteOnlineArmyMovement(attack);
  }

  if (completed.length) {
    state.attacks = state.attacks.filter(attack => attack.remaining > 0);
  }
}

function isProtectedMainCity(city) {
  return Boolean(city && (city.isMainCity || city.id === state?.mainCityId));
}

function launchAttack(sourceId, targetId, percent, owner, exactTroops = null) {
  const source = cityById(sourceId);
  const target = cityById(targetId);
  if (!source || !target || state.gameOver) return false;
  if (source.owner !== owner) return false;
  if (source.id === target.id) return false;
  if (source.troops < 1) return false;

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

  const send = exactTroops !== null && Number.isFinite(Number(exactTroops))
    ? clamp(Math.floor(Number(exactTroops)), 1, source.troops)
    : clamp(Math.floor(source.troops * percent), 1, source.troops);
  const kind = target.owner === owner ? "transfer" : "attack";

  source.troopFloat = Math.max(0, source.troopFloat - send);
  source.troops = Math.floor(source.troopFloat);
  if (owner === "player") {
    markOwnedCityChanged(source, false);
    syncCityStateToOnline(source);
  }

  const duration = travelTime(source, target, owner, route.length, send, kind);
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
  };
  prepareOnlineArmyMission(mission);
  state.attacks.push(mission);
  publishOnlineArmyMovement(mission);
  if (isOnlineWorldActive() && owner === "player") syncOwnedCitiesToOnline(true);

  if (owner === "player" && kind === "transfer") {
    addLog(`You moved ${formatNumber(send)} troops from ${source.name} to ${target.name}.`);
    showToast(`Reinforcements moving: ${source.name} \u2192 ${target.name}`);
  } else if (owner === "player") {
    addLog(`You sent ${formatNumber(send)} troops from ${source.name} to attack ${target.name}.`);
    showToast(`Attack moving: ${source.name} \u2192 ${target.name}`);
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

function travelTime(source, target, owner, pathLength = null, troopCount = 1, kind = "attack") {
  const distance = Number.isFinite(pathLength) && pathLength > 0
    ? pathLength
    : Math.hypot(source.x - target.x, source.y - target.y);
  const speed = owner === "player" ? skillMultiplier("rusher") : 1;
  const kindMultiplier = ARMY_TRAVEL_KIND_MULTIPLIERS[kind] || ARMY_TRAVEL_KIND_MULTIPLIERS.attack;
  const troopMultiplier = getTroopTravelMultiplier(troopCount);
  return clamp(
    distance * ARMY_TRAVEL_SECONDS_PER_MAP_UNIT * kindMultiplier * troopMultiplier / Math.max(0.1, speed),
    ARMY_TRAVEL_MIN_SECONDS,
    ARMY_TRAVEL_MAX_SECONDS,
  );
}

function resolveAttack(attack) {
  const target = cityById(attack.toId);
  if (!target) return;

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

  const attackerName = attack.owner === "player" ? "You" : "Enemy";
  const oldOwner = target.owner;
  const defenderName = getBattleReportOwnerName(target, oldOwner);
  const attackerReportName = getBattleReportOwnerName(null, attack.owner);
  const targetLevel = clampCityLevel(target.level);
  const defendersAtStart = Math.max(0, Math.floor(Number(target.troops) || 0));
  const targetDefenseAtStart = getCityStats(target).totalDefense;
  const result = calculateCombatResult(attack.troops, attack.owner, target);

  if (result.success) {
    const neutralCapture = attack.owner === "player" && oldOwner === "neutral";
    const neutralBlockReason = neutralCapture ? getNeutralCaptureBlockReason(target, "player", attack.id) : "";
    if (neutralBlockReason) {
      target.troopFloat = Math.max(1, target.troopFloat);
      target.troops = Math.floor(target.troopFloat);
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
          summary: neutralBlockReason,
        });
      }
      addLog(`${attackerName} defeated the defenders at ${target.name}, but could not capture it. ${neutralBlockReason}`);
      if (attack.owner === "player") showNeutralCaptureLimitModal(neutralBlockReason);
      else showToast(neutralBlockReason);
      return;
    }

    if (isProtectedMainCity(target) && oldOwner !== attack.owner) {
      target.troopFloat = 0;
      target.troops = 0;
      target.lastCapturedAt = state.gameSeconds;
      if (oldOwner === "player") {
        markOwnedCityChanged(target);
        syncCityStateToOnline(target);
        addBattleReport({
          type: "defense",
          outcome: "held",
          cityId: target.id,
          cityName: target.name,
          cityLevel: targetLevel,
          sentTroops: attack.troops,
          troopCount: defendersAtStart,
          survivors: 0,
          defendersLeft: 0,
          attackerLosses: result.attackerLosses,
          defenderLosses: result.defenderLosses,
          totalDefense: targetDefenseAtStart,
          opponentName: attackerReportName,
          summary: "Main city protected. Garrison was destroyed, but the city held.",
        });
        addLog(`${target.name} is your main city and cannot be captured, but its defending army was destroyed.`);
        showToast(`${target.name} held. Garrison destroyed.`);
      } else {
        syncSharedCityState(target);
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
            defendersLeft: 0,
            attackerLosses: result.attackerLosses,
            defenderLosses: result.defenderLosses,
            totalDefense: targetDefenseAtStart,
            opponentName: defenderName,
            summary: "Protected main city. Garrison destroyed, but ownership did not change.",
          });
        }
        addLog(`${attackerName} destroyed the garrison at ${target.name}, but main cities cannot be captured.`);
        if (attack.owner === "player") showToast(`${target.name} held as a protected main city.`);
      }
      return;
    }

    const xpEfficiency = attack.owner === "player" ? getCaptureXpEfficiency(target, oldOwner) : 1;
    const xpAward = attack.owner === "player" ? getCaptureXpAward(target, oldOwner, result.defenderLosses, attack.owner) : 0;
    const cautiousRefund = oldOwner === "player" && attack.owner !== "player" ? grantCautiousRefund(target) : 0;

    target.owner = attack.owner;
    if (attack.owner === "player") {
      target.ownerKind = "player";
      target.ownerUid = getCurrentOnlineUid() || target.ownerUid || null;
      target.ownerName = state.playerName;
      target.ownerFlag = state.flag;
    } else {
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
        summary: `Captured with ${formatNumber(result.survivors)} survivors. ${formatCapturedCityLevelDrop(levelDrop)} +${formatNumber(xpAward)} XP.`,
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
      const defenseLossXp = getLostDefenseXpAward(attack.troops);
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
        summary: `${target.name} was captured by ${attackerReportName}. ${formatCapturedCityLevelDrop(levelDrop)} +${formatNumber(defenseLossXp)} XP.`,
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
      const failedAttackXp = getFailedAttackXpAward(target, oldOwner, defendersAtStart, attack.owner);
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
        summary: `${formatNumber(result.defendersLeft)} defenders remained. +${formatNumber(failedAttackXp)} XP.`,
      });
      addLog(`Defeat: your attack on ${target.name} failed. ${formatNumber(result.defendersLeft)} defenders remain. ${formatNumber(savedAttackers)} attackers regrouped, ${formatNumber(scavengedGold)} gold was recovered, and you gained ${formatNumber(failedAttackXp)} XP.`);
      showToast(`Attack failed at ${target.name}: +${formatNumber(failedAttackXp)} XP`);
      addCharacterXp(failedAttackXp, `${target.name} failed attack`);
    } else if (oldOwner === "player") {
      const savedDefenders = returnSavedTroops("brave", result.defenderLosses, `${target.name} defense`);
      const salvagedGold = grantKillGold("salvager", result.killedAttackers, `${target.name} defense`);
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
        summary: `${target.name} survived with ${formatNumber(result.defendersLeft)} defenders.`,
      });
      addLog(`Defense held: ${target.name} survived the enemy attack.`);
      if (savedDefenders > 0 || salvagedGold > 0) {
        addLog(`Defense rewards: ${formatNumber(savedDefenders)} defenders regrouped and ${formatNumber(salvagedGold)} gold was salvaged.`);
      }
      showToast(`Defense held at ${target.name}`);
      addCharacterXp(getDefenseHeldXpAward(attack.troops), `${target.name} defense`);
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
  if (state.gameOver) return;
  if (isOnlineWorldActive() && playerCities().length === 0) return;
  if (playerCities().length === 0) {
    state.gameOver = "defeat";
    addLog("Defeat: you lost your final city.");
    showToast("Defeat. Start a fresh map to retry.");
  }
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
  cityText.textContent = `${playerCities().length}`;
  updateIslandSwitcherUi();
  updateIncomingAttackUi();

  if (!statusText) return;
  if (state.gameOver === "victory") {
    statusText.textContent = "Victory";
  } else if (state.gameOver === "defeat") {
    statusText.textContent = "Defeat";
  } else {
    statusText.textContent = `+${getGoldPerSecond().toFixed(1)} gold/s`;
  }

  if (profileScreen?.classList.contains("open")) renderProfileScreen();
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
  if (city.ownerKind === "player") return city.ownerFlag || createDefaultFlag();
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
  if (city.ownerKind === "player" && city.ownerName) return city.ownerName;
  return OWNER[city.owner]?.label || "Unknown";
}

function getKingdomSummary() {
  const cities = playerCities();
  const marchingTroops = state.attacks
    .filter(attack => attack.owner === "player")
    .reduce((total, attack) => total + Math.max(0, Number(attack.troops) || 0), 0);
  return {
    cities: cities.length,
    troops: cities.reduce((total, city) => total + Math.max(0, Number(city.troops) || 0), marchingTroops),
    gold: Math.floor(state.gold),
    goldProductionPerHour: cities.reduce((total, city) => total + getCityStats(city).goldProductionPerHour, 0),
    troopProductionPerHour: cities.reduce((total, city) => total + getCityStats(city).troopProductionPerHour, 0),
  };
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
  profileScreen.classList.remove("skills-active", "flag-editor-active");
  profileScreen.setAttribute("aria-hidden", "true");
  flagDraft = null;
  activeProfileTab = "profile";
  cancelProfileNameEdit();
}

function showProfileView() {
  if (!profileView || !skillsView || !flagEditorView) return;
  activeProfileTab = "profile";
  profileScreen.classList.remove("skills-active", "flag-editor-active");
  profileView.hidden = false;
  skillsView.hidden = true;
  flagEditorView.hidden = true;
  flagDraft = null;
  cancelProfileNameEdit();
  updateProfileTabHeader();
  renderProfileScreen();
}

function showProfileSkills() {
  if (!state || !profileView || !skillsView || !flagEditorView) return;
  activeProfileTab = "skills";
  profileScreen.classList.add("skills-active");
  profileScreen.classList.remove("flag-editor-active");
  profileView.hidden = true;
  skillsView.hidden = false;
  flagEditorView.hidden = true;
  flagDraft = null;
  cancelProfileNameEdit();
  updateProfileTabHeader();
  renderProfileSkills();
}

function updateProfileTabHeader() {
  const showingSkills = activeProfileTab === "skills";
  if (profileScreenTitle) profileScreenTitle.textContent = showingSkills ? "Skills" : "Profile";
  if (profileTabBtn) {
    profileTabBtn.classList.toggle("active", !showingSkills);
    profileTabBtn.setAttribute("aria-selected", String(!showingSkills));
  }
  if (skillsTabBtn) {
    skillsTabBtn.classList.toggle("active", showingSkills);
    skillsTabBtn.setAttribute("aria-selected", String(showingSkills));
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
  if (profileCitiesStat) profileCitiesStat.textContent = formatNumber(summary.cities);
  if (profileGoldStat) profileGoldStat.textContent = formatNumber(summary.gold);
  if (profileTroopsStat) profileTroopsStat.textContent = formatNumber(summary.troops);
  if (profileGoldProductionStat) profileGoldProductionStat.textContent = `${formatNumber(summary.goldProductionPerHour)}/h`;
  if (profileTroopProductionStat) profileTroopProductionStat.textContent = `${formatNumber(summary.troopProductionPerHour)}/h`;
  applyFlagToElement(profileKingdomFlag, state.flag);
  if (activeProfileTab === "skills") renderProfileSkills();
}

function renderProfileSkills() {
  if (!state || !skillsView || skillsView.hidden) return;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  const points = Math.max(0, Math.floor(Number(state.character.skillPoints) || 0));
  skillsView.innerHTML = `
    <div class="profile-skill-summary" aria-label="Hero skill progress">
      <div><span>Skill points</span><strong>${formatNumber(points)}</strong></div>
      <div><span>Points spent</span><strong>${formatNumber(getSpentSkillPoints())}</strong></div>
    </div>
    <div class="profile-skill-list">
      ${SKILL_ORDER.map(skillRow).join("")}
    </div>
  `;
  skillsView.querySelectorAll("button[data-skill]").forEach(buttonElement => {
    buttonElement.addEventListener("click", () => buySkill(buttonElement.dataset.skill));
  });
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
  if (!state || !profileView || !skillsView || !flagEditorView) return;
  activeProfileTab = "profile";
  profileScreen.classList.add("flag-editor-active");
  profileScreen.classList.remove("skills-active");
  flagDraft = normalizeFlag(state.flag);
  profileView.hidden = true;
  skillsView.hidden = true;
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
  return isPointInBounds(city.x, city.y, bounds);
}

function getFlagSignature(flag) {
  if (!flag) return "";
  const normalized = normalizeFlag(flag);
  return `${normalized.primary}:${normalized.secondary}:${normalized.pattern}:${normalized.symbol}`;
}

function getCityRenderSignature(visibleCities) {
  const playerFlag = getFlagSignature(state.flag);
  const cityTokens = visibleCities.map(city => {
    const report = city.owner === "player" ? null : getScoutReport(city.id);
    return [
      city.id,
      city.owner,
      city.ownerKind || "",
      city.ownerUid || "",
      city.ownerName || "",
      getFlagSignature(city.ownerFlag),
      city.level,
      Math.floor(Number(city.troops) || 0),
      city.isMainCity ? 1 : 0,
      report ? `${Math.floor(Number(report.troops) || 0)}:${report.expiresAt > state.gameSeconds ? 1 : 0}` : "",
    ].join(":");
  }).join("|");

  return [
    selectedSourceId || "",
    selectedTargetId || "",
    sendMode ? 1 : 0,
    scoutNearbySourceId || "",
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
  if (scoutNearbySource?.owner !== "player") {
    scoutNearbySourceId = null;
    scoutNearbySource = null;
  }
  const visibleBounds = getVisibleWorldBounds();
  const visibleCities = state.cities.filter(city => shouldRenderCityNode(city, visibleBounds));
  const signature = getCityRenderSignature(visibleCities);
  if (!force && signature === cityRenderSignature) return;
  cityRenderSignature = signature;

  cityLayer.innerHTML = "";
  if (scoutNearbySource) renderScoutNearbyRadius(scoutNearbySource);

  visibleCities.forEach(city => {
    const mapPoint = worldToMapPoint(city);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.cityId = city.id;
    const castleStage = getCastleStage(city.level);
    btn.className = `city-node ${OWNER[city.owner].css} castle-stage-${castleStage}`;
    if (city.id === selectedSourceId) btn.classList.add("selected");
    if (city.id === selectedTargetId) btn.classList.add("targeted");
    if (scoutNearbySource?.id === city.id) btn.classList.add("scout-radius-source");
    if (scoutNearbySource && isNearbyScoutCandidate(scoutNearbySource, city)) btn.classList.add("scout-nearby-target");
    if (sendMode && source && city.id !== source.id) {
      btn.classList.add(city.owner === "player" ? "supportable" : "attackable");
    }
    btn.style.left = `${mapPoint.x}px`;
    btn.style.top = `${mapPoint.y}px`;
    const scoutReport = city.owner === "player" ? null : getScoutReport(city.id);
    const isSelectedForeign = city.owner !== "player" && city.id === selectedTargetId && !sendMode;
    const ownerName = getCityOwnerDisplayName(city);
    const ownerFlag = renderCityOwnerFlag(city);
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
          <strong class="city-name">${escapeHtml(city.name)}</strong>
          <span class="foreign-city-shield">
            ${ownerFlag}
            <span class="city-label-level">${city.level}</span>
          </span>
        </span>`;
    const knownTroops = city.owner === "player" ? city.troops : scoutReport?.troops;
    btn.setAttribute("aria-label", `${city.name}. ${ownerName}. Level ${city.level}. ${knownTroops === undefined ? "Unknown troops" : `${formatNumber(knownTroops)} troops`}.`);
    btn.innerHTML = `
      <span class="city-ring"></span>
      <span class="city-castle stage-${castleStage}" aria-hidden="true"><img class="city-art" src="${getCastleAsset(castleStage)}" alt="" draggable="false" /></span>
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

function renderSelectedCityWheel(city) {
  const mapPoint = worldToMapPoint(city);
  const wheel = document.createElement("div");
  const levelCost = getLevelCost(city);
  const levelDisabled = city.level >= MAX_CITY_LEVEL || state.gold < levelCost;
  const scoutNearbyActive = scoutNearbySourceId === city.id;
  const nearbyCount = scoutNearbyActive ? getNearbyScoutCandidates(city).length : 0;
  wheel.className = "city-action-wheel";
  wheel.style.left = `${mapPoint.x}px`;
  wheel.style.top = `${mapPoint.y}px`;
  wheel.innerHTML = `
    <span class="city-wheel-ring" aria-hidden="true"></span>
    <button class="city-wheel-action wheel-level" type="button" aria-label="Level up ${escapeHtml(city.name)}" ${levelDisabled ? "disabled" : ""}>
      <span class="wheel-icon" aria-hidden="true">\u265C\u2191</span>
      <span class="wheel-action-name">Level</span>
      <span class="wheel-cost">${city.level >= MAX_CITY_LEVEL ? "MAX" : `${formatNumber(levelCost)}g`}</span>
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
      <span class="wheel-cost">${scoutNearbyActive ? nearbyCount : "1k"}</span>
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
  cityLayer.appendChild(wheel);
}

function renderSelectedForeignWheel(city) {
  const mapPoint = worldToMapPoint(city);
  const wheel = document.createElement("div");
  const report = getScoutReport(city.id);
  const pendingScout = getPendingScoutMission(city.id);
  const canScout = !pendingScout && playerCities().some(playerCity => playerCity.troops >= 1);
  const canAttack = playerCities().some(playerCity => playerCity.troops > 0);
  wheel.className = "city-action-wheel foreign-city-action-wheel";
  wheel.style.left = `${mapPoint.x}px`;
  wheel.style.top = `${mapPoint.y}px`;
  wheel.innerHTML = `
    <span class="city-wheel-ring" aria-hidden="true"></span>
    <button class="city-wheel-action wheel-scout" type="button" aria-label="${pendingScout ? "Scout traveling to" : report ? "Scout again" : "Scout"} ${escapeHtml(city.name)}" ${canScout ? "" : "disabled"}>
      <span class="wheel-icon" aria-hidden="true">&#128301;</span>
      <span class="wheel-action-name">${pendingScout ? "Scouting" : report ? "Rescout" : "Scout"}</span>
    </button>
    <button class="city-wheel-action wheel-attack" type="button" aria-label="Attack ${escapeHtml(city.name)}" ${canAttack ? "" : "disabled"}>
      <span class="wheel-icon" aria-hidden="true">&#9876;</span>
      <span class="wheel-action-name">Attack</span>
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
  if (rememberedSource) return findLastSelectedAttackSource(target);
  return findNearestOwnedSource(target, 1);
}

function attackForeignCity(cityId) {
  const target = cityById(cityId);
  if (!target || target.owner === "player") return;
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
    token.innerHTML = `<span>${armyIcon}</span><strong>${formatNumber(attack.troops)}</strong><small>${Math.ceil(attack.remaining)}s</small>`;
    if (attack.ownerName) token.title = `${attack.ownerName}: ${attack.kind} to ${to.name}`;
    armyLayer.appendChild(token);
  }
}

function renderPanel() {
  actionButtons.innerHTML = "";
  const source = selectedSourceId ? cityById(selectedSourceId) : null;

  if (commanderPanel) commanderPanel.classList.remove("visible");

  if (state.gameOver) {
    if (commanderPanel) commanderPanel.classList.add("visible");
    panelTitle.textContent = "Kingdom defeated";
    panelSubtitle.textContent = "You lost your final city.";
    selectedInfo.innerHTML = `<strong>Defeat.</strong> Start fresh to retry.`;
    actionButtons.appendChild(button("Fresh Map", hardReset, false, "danger"));
    return;
  }

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
  const travel = route ? travelTime(source, target, "player", route.length, sendAmount, isTransfer ? "transfer" : "attack") : Infinity;
  let outcomeHtml = "";

  if (!isTransfer && route) {
    const preview = calculateBattlePreview(source, target, selectedMarchPercent);
    outcomeHtml = `
      <div class="send-outcome ${preview.success ? "win" : "lose"}">
        <strong>${preview.success ? "Likely Victory" : "Likely Defeat"}</strong>
        <span>${preview.label} - ${Math.round(preview.xpEfficiency * 100)}% XP</span>
        <small>${preview.success
          ? `Est. survivors: ${formatNumber(preview.survivors)} - ${preview.xpLabel} ${formatNumber(preview.captureXp)}`
          : `Est. defenders left: ${formatNumber(preview.defendersLeft)} - ${preview.xpLabel} ${formatNumber(preview.captureXp)}`}</small>
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
  if (!state || state.gameOver) return;
  const clicked = cityById(id);
  if (!clicked) return;
  if (scoutNearbySourceId && scoutNearbySourceId !== clicked.id) scoutNearbySourceId = null;
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
  const commandLabel = isTransfer ? "Transfer" : "Attack";
  const commandIcon = isTransfer ? "&#128095;" : "&#9876;";
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
    previewEl.className = "troop-slider-preview unknown";
    previewEl.innerHTML = `
      <div><span>Battle forecast</span><strong>Garrison unknown</strong><small>Scout report required</small></div>
      <div><span>Travel time</span><strong>About ${formatDuration(travel)}</strong><small>Attack is still available</small></div>
    `;
    return;
  }

  const scoutedTarget = { ...target, troops: report.troops, troopFloat: report.troops };
  const preview = calculateBattlePreviewForTroops(source, scoutedTarget, selectedTroopAmount, route);
  previewEl.className = `troop-slider-preview ${preview.success ? "win" : "lose"}`;
  previewEl.innerHTML = `
    <div><span>Scouted forecast</span><strong>${preview.success ? "Likely victory" : "Likely defeat"}</strong><small>${preview.label}</small></div>
    <div><span>${preview.success ? "Estimated survivors" : "Defenders left"}</span><strong>${formatNumber(preview.success ? preview.survivors : preview.defendersLeft)}</strong><small>About ${formatDuration(travel)} travel</small></div>
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
  if (city.owner !== "player") {
    const report = getScoutReport(city.id);
    const stats = getCityStats(city);
    const remaining = report ? Math.max(0, Math.ceil(report.expiresAt - state.gameSeconds)) : 0;
    modalTitle.textContent = `${city.name} - Level ${city.level}`;
    modalBody.innerHTML = `
      <div class="city-stat-panel modal-city-stats">
        <div class="stat-wide"><span>Owner</span><strong>${escapeHtml(getCityOwnerDisplayName(city))}</strong></div>
        <div class="stat-chip"><span>City level</span><strong>${formatNumber(city.level)}</strong></div>
        <div class="stat-chip"><span>Victory points</span><strong>${formatNumber(stats.victoryPoints)}</strong></div>
        <div class="stat-chip"><span>Troops</span><strong>${report ? formatNumber(report.troops) : "Unknown"}</strong></div>
        <div class="stat-chip"><span>Total defense</span><strong>${report ? formatNumber(report.totalDefense) : "Unknown"}</strong></div>
        ${report
          ? `<div class="stat-wide"><span>Scout report expires</span><strong>${formatDuration(remaining)}</strong></div>`
          : `<div class="stat-wide scout-required"><span>Scout report</span><strong>Not available</strong></div>`}
      </div>
    `;
    if (!modal.open) modal.showModal();
    return;
  }
  const stats = getCityStats(city);
  modalTitle.textContent = `${city.name} \u00B7 Level ${city.level}`;
  modalBody.innerHTML = `
    <div class="city-stat-panel modal-city-stats">
      <div class="stat-wide"><span>Total defense</span><strong>${formatNumber(stats.totalDefense)}</strong></div>
      <div class="stat-chip"><span>Troops</span><strong>${formatNumber(city.troops)}</strong></div>
      <div class="stat-chip"><span>Guardian</span><strong>${stats.guardianPercent}%</strong></div>
      <div class="stat-chip"><span>City power</span><strong>${formatNumber(stats.cityPower)}</strong><small>+${CITY_LEVEL_STATS.victoryPointsPerLevel}/level</small></div>
      <div class="stat-chip"><span>Defense</span><strong>${stats.defensePercent}%</strong><small>+${CITY_LEVEL_STATS.defensePercentPerLevel}%/level</small></div>
      <div class="stat-chip"><span>Troops production</span><strong>${formatNumber(stats.troopProductionPerHour)}/h</strong><small>VP x ${CITY_LEVEL_STATS.troopProductionPerVictoryPoint}</small></div>
      <div class="stat-chip"><span>City walls</span><strong>${formatNumber(stats.cityWalls)}</strong><small>+${CITY_LEVEL_STATS.cityWallsPerLevel}/level</small></div>
      <div class="stat-chip"><span>Gold production</span><strong>${formatNumber(stats.goldProductionPerHour)}/h</strong><small>ML ${formatNumber(stats.millionLordsProductionVp)} x ${CITY_LEVEL_STATS.goldProductionPerMillionLordsVp}</small></div>
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
      <div class="stat-chip"><span>City defense</span><strong>${stats.defensePercent}%</strong><small>${CITY_LEVEL_STATS.defensePercentPerLevel}% per level</small></div>
      <div class="stat-chip"><span>City walls</span><strong>${formatNumber(stats.cityWalls)}</strong><small>Level-based static defense</small></div>
      <div class="stat-chip"><span>Guardian</span><strong>${stats.guardianPercent}%</strong><small>Player defense skill</small></div>
      <div class="stat-chip"><span>Troops production</span><strong>${formatNumber(stats.troopProductionPerHour)}/h</strong><small>VP x ${CITY_LEVEL_STATS.troopProductionPerVictoryPoint} + Recruiter</small></div>
      <div class="stat-chip"><span>Gold production</span><strong>${formatNumber(stats.goldProductionPerHour)}/h</strong><small>ML ${formatNumber(stats.millionLordsProductionVp)} x ${CITY_LEVEL_STATS.goldProductionPerMillionLordsVp} + Prosperous</small></div>
      <div class="stat-chip"><span>Invested gold</span><strong>${formatNumber(city.investedGold || 0)}</strong><small>Cautious can refund part</small></div>
      ${cooldownRemaining > 0 ? `<div class="stat-wide"><span>Capture XP cooldown</span><strong>${formatDuration(cooldownRemaining)}</strong></div>` : ""}
    </div>
  `;
  modalBody.querySelector("#changeMainCityBtn")?.addEventListener("click", () => changeMainCity(city.id));
  if (!modal.open) modal.showModal();
}

function showCityListModal() {
  if (!state) return;
  modal.classList.add("city-list-modal");
  renderCityListModal();
  if (!modal.open) modal.showModal();
}

function renderCityListModal() {
  const cities = getSortedCityList();
  const pageCount = Math.max(1, Math.ceil(cities.length / CITY_LIST_PAGE_SIZE));
  cityListPage = clamp(cityListPage, 0, pageCount - 1);
  const start = cityListPage * CITY_LIST_PAGE_SIZE;
  const pageCities = cities.slice(start, start + CITY_LIST_PAGE_SIZE);
  modalTitle.textContent = "City list";
  modalBody.innerHTML = `
    <div class="city-list-panel">
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
      const cityId = button.dataset.cityListJump;
      modal.close();
      selectCity(cityId);
    });
  });

  modalBody.querySelectorAll("[data-city-list-info]").forEach(button => {
    button.addEventListener("click", () => {
      modal.classList.remove("city-list-modal");
      showCityInfoModal(button.dataset.cityListInfo);
    });
  });
}

function getSortedCityList() {
  const cities = playerCities().slice();
  const mainCities = cities.filter(isMainCityForList);
  const otherCities = cities.filter(city => !isMainCityForList(city));
  otherCities.sort(compareCityListEntries);
  return [...mainCities.sort((a, b) => a.name.localeCompare(b.name)), ...otherCities];
}

function isMainCityForList(city) {
  if (!city) return false;
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
  const troops = Math.floor(Number(city.troops) || 0);
  return `
    <article class="city-list-row ${isMain ? "main-city" : ""}">
      <button class="city-list-locate" data-city-list-jump="${escapeHtml(city.id)}" type="button" aria-label="Center on ${escapeHtml(city.name)}">${isMain ? "&#8962;" : "&#128205;"}</button>
      <span class="city-list-art" aria-hidden="true">&#127984;</span>
      <span class="city-list-level"><b>${formatNumber(clampCityLevel(city.level))}</b></span>
      <strong class="city-list-troops">${formatNumber(troops)} <span aria-hidden="true">&#9817;</span></strong>
      <span class="city-list-name">${escapeHtml(city.name)}</span>
      <span class="city-list-main-label">${isMain ? "Main city" : ""}</span>
      <button class="city-list-info" data-city-list-info="${escapeHtml(city.id)}" type="button" aria-label="Open ${escapeHtml(city.name)} info">&#9432;</button>
    </article>
  `;
}

function showAttackPreview(source, target) {
  if (!source || !target || source.owner !== "player" || target.owner === "player") return;
  if (source.troops < 1) {
    showToast("No troops available to send.");
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
      <p>Route distance: <strong>${formatNumber(preview.pathLength)}</strong> map units. Troops avoid water, lakes, and mountains. Swamp and forests are walkable.</p>
      <p>${preview.success
        ? `Expected capture with about <strong>${formatNumber(preview.survivors)}</strong> surviving troops.`
        : `Expected failure with about <strong>${formatNumber(preview.defendersLeft)}</strong> defenders left.`}</p>
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
      <p>Route distance: <strong>${formatNumber(preview.pathLength)}</strong> map units. Troops avoid water, lakes, and mountains.</p>
      <p>${preview.success
        ? `Expected capture with about <strong>${formatNumber(preview.survivors)}</strong> surviving troops.`
        : `Expected failure with about <strong>${formatNumber(preview.defendersLeft)}</strong> defenders left.`}</p>
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

function upgradeCity(cityId, levels = 1) {
  const city = cityById(cityId);
  if (!city) return;
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
  if (!city || city.level >= MAX_CITY_LEVEL) return Infinity;
  const startLevel = clampCityLevel(city.level);
  const levelCount = Math.max(0, Math.floor(Number(levels) || 0));
  const targetLevel = clamp(startLevel + levelCount, startLevel, MAX_CITY_LEVEL);
  if (targetLevel <= startLevel) return 0;
  const totalCost = MILLION_LORDS_CITY_COST_BASE * (
    Math.pow(MILLION_LORDS_CITY_COST_GROWTH, targetLevel - 1)
    - Math.pow(MILLION_LORDS_CITY_COST_GROWTH, startLevel - 1)
  );
  return Math.max(0, Math.floor(totalCost + 0.000001));
}

function getLevelCost(city) {
  return getMultiLevelCost(city, 1);
}

function getFortifyCost(city) {
  return Infinity;
}

function calculateBattlePreview(source, target, percent) {
  const send = clamp(Math.floor(source.troops * percent), 1, source.troops);
  return calculateBattlePreviewForTroops(source, target, send);
}

function calculateBattlePreviewForTroops(source, target, amount, knownRoute = null) {
  const send = clamp(Math.floor(amount), 1, source.troops);
  const result = calculateCombatResult(send, "player", target);
  const xpEfficiency = getCaptureXpEfficiency(target, target.owner);
  const captureXp = result.success
    ? getCaptureXpAward(target, target.owner, result.defenderLosses, "player")
    : getFailedAttackXpAward(target, target.owner, Math.max(0, Math.floor(Number(target.troops) || 0)), "player");
  const xpLabel = result.success ? "capture XP" : "defeat XP";
  const cooldownRemaining = getCaptureCooldownRemaining(target);
  let label = "Weak odds";
  if (result.ratio >= 1.35) label = "Overwhelming advantage";
  else if (result.ratio >= 1.12) label = "Good advantage";
  else if (result.ratio > 1) label = "Close win";
  else if (result.ratio >= .82) label = "Risky attack";
  const route = knownRoute || findRoute(source, target);
  const travel = route ? travelTime(source, target, "player", route.length, send, "attack") : Infinity;
  return {
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
      <div class="stat-card"><strong>${playerCities().length}</strong><small>cities owned</small></div>
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
  incomingAttackBtn.title = `${formatNumber(incoming.length)} incoming ${incoming.length === 1 ? "attack" : "attacks"} - soonest ${formatDuration(incoming[0].remaining)}`;
  incomingAttackBtn.setAttribute("aria-label", incomingAttackBtn.title);

  if (modal.open && modal.classList.contains("incoming-attack-modal")) {
    renderIncomingAttacksModalContent(incoming);
  }
}

function showIncomingAttacksModal() {
  const incoming = getIncomingAttacks();
  if (!incoming.length) {
    showToast("No incoming attacks right now.");
    updateIncomingAttackUi();
    return;
  }
  modal.classList.add("incoming-attack-modal");
  renderIncomingAttacksModalContent(incoming);
  if (!modal.open) modal.showModal();
}

function renderIncomingAttacksModalContent(incoming = getIncomingAttacks()) {
  if (!incoming.length) {
    modalTitle.textContent = "Incoming Attacks";
    modalBody.innerHTML = `<div class="incoming-attack-empty">No active incoming attacks.</div>`;
    return;
  }

  modalTitle.textContent = incoming.length === 1 ? "Incoming Attack" : "Incoming Attacks";
  modalBody.innerHTML = `
    <div class="incoming-attack-panel">
      <div class="incoming-attack-summary">
        <strong>${formatNumber(incoming.length)}</strong>
        <span>${incoming.length === 1 ? "army is" : "armies are"} marching on your cities.</span>
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
  return `
    <article class="incoming-attack-card">
      <div class="incoming-attack-badge">
        <strong>${formatDuration(attack.remaining)}</strong>
        <small>arrival</small>
      </div>
      <div class="incoming-attack-city">
        <span>${escapeHtml(regionName)}</span>
        <strong>${escapeHtml(city.name)}</strong>
        <small>Lv ${formatNumber(city.level)} - ${formatNumber(city.troops)} troops - ${formatNumber(defense)} defense</small>
      </div>
      <div class="incoming-attack-force">
        <span>Attacker</span>
        <strong>${escapeHtml(attack.attackerName || "Enemy")}</strong>
        <small>${formatNumber(attack.troops)} troops from ${escapeHtml(sourceName)}</small>
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
      <li>Armies calculate the shortest land route around lakes and mountains, then resolve when they arrive.</li>
      <li>All cities start at Level 1 and can upgrade to Level 100.</li>
      <li>The world has five island maps and ${formatNumber(ISLAND_CITY_COUNT)} total city slots.</li>
      <li>The center island keeps its middle clear for a future feature.</li>
      <li>New online players claim starting cities on the outer islands first; the center island is a fallback once those are full.</li>
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
      <li>Scout Nearby costs ${formatNumber(SCOUT_NEARBY_COST)} gold, covers the current island only, and never routes scouts through portals.</li>
      <li>The top-right fullscreen button expands the game surface and the game disables page text selection while playing.</li>
      <li>City level creates victory points for combat value, while passive gold follows the Million Lords city production curve.</li>
      <li>City defense is level x 3%, plus wall strength and any Guardian skill bonus for your defending troops.</li>
      <li>Troop production is VP x 3, with Recruiter adding more production from VP. Passive gold uses the Million Lords level curve x 15, with Prosperous added on top.</li>
      <li>Army travel uses route distance plus troop-size bands. Larger armies march slower, scouts move as one troop, and Rusher reduces travel time.</li>
      <li>Glowing pickups appear on the current island during active play once per minute, alternating between gold and troop-hour rewards. Daily pickup limits are ${formatNumber(HARVEST_BONUS_DAILY_GOLD_LIMIT)} gold and ${formatNumber(HARVEST_BONUS_DAILY_TROOP_LIMIT)} troop pickups.</li>
      <li>Prosperous boosts gold, Rusher boosts travel speed, and Striker boosts attacking combat power.</li>
      <li>Fearless saves some attacking losses, Brave saves some defending losses, Scavenger and Salvager recover gold from kills, and Cautious refunds some invested gold when you lose a city.</li>
      <li>Captured cities enter a one-hour XP cooldown. Attacking during cooldown still works, but capture XP is reduced.</li>
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
  if (!fullscreenBtn) return;
  const isActive = Boolean(document.fullscreenElement);
  fullscreenBtn.classList.toggle("active", isActive);
  fullscreenBtn.setAttribute("aria-label", isActive ? "Exit fullscreen" : "Enter fullscreen");
  fullscreenBtn.innerHTML = isActive ? "&times;" : "<span aria-hidden=\"true\">&#x26F6;</span>";
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
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (total >= 3600) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.ceil((total % 3600) / 60);
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  }
  if (total >= 60) return `${Math.ceil(total / 60)}m`;
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
  zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
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
      const anchor = islandSwitchBtn || resourceBar.firstChild;
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
  zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
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
  const pair = getPointerPair();
  if (!pair || !pinchState) return;
  const [a, b] = pair;
  const mid = midpointBetween(a, b);
  const nextDistance = Math.max(1, distanceBetween(a, b));
  const scale = nextDistance / pinchState.startDistance;
  const rect = mapFrame.getBoundingClientRect();
  zoom = clamp(pinchState.startZoom * scale, MIN_ZOOM, MAX_ZOOM);
  const offset = getMapViewportOffset(rect);
  camera.x = pinchState.mapPoint.x - (mid.x - rect.left - offset.x) / zoom;
  camera.y = pinchState.mapPoint.y - (mid.y - rect.top - offset.y) / zoom;
  updateCameraTransform();
  markZoomInteraction();
}

function startPan(event) {
  if (!state || event.button > 0) return;

  // City taps must stay owned by the city button.
  // V6 was capturing the pointer on mapFrame before this check, which could
  // steal the final click from blue cities after zoom/pan was added.
  if (event.target.closest(".city-node, .city-action-wheel, .teleport-node, .harvest-bonus-node")) {
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
window.addEventListener("crownlands:online-ready", updateOnlineUi);
window.addEventListener("crownlands:auth", async () => {
  updateOnlineUi();
  if (state) {
    queueOnlineSave();
    flushOnlineSave(true);
  }
});
window.addEventListener("crownlands:online-error", event => {
  onlineLastError = event.detail?.message || "Firebase could not start.";
  updateOnlineUi();
});
if (playerNameInput) {
  playerNameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") startFromInput(false);
  });
}
if (fullscreenBtn) fullscreenBtn.addEventListener("click", toggleFullscreen);
if (islandSwitchBtn) islandSwitchBtn.addEventListener("click", showIslandSwitcherModal);
if (profileBtn) profileBtn.addEventListener("click", showProfileScreen);
if (profileCloseBtn) profileCloseBtn.addEventListener("click", closeProfileScreen);
if (profileTabBtn) profileTabBtn.addEventListener("click", showProfileView);
if (skillsTabBtn) skillsTabBtn.addEventListener("click", showProfileSkills);
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
    if (!event.target.closest(".teleport-node")) return;
    event.stopPropagation();
    interactionRenderLockUntil = performance.now() + 600;
  });
}
cityLayer.addEventListener("click", event => {
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
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !profileScreen?.classList.contains("open")) return;
  if (event.target === profileNameInput) return;
  if (!flagEditorView.hidden) showProfileView();
  else closeProfileScreen();
});
logBtn.addEventListener("click", showLogModal);
if (incomingAttackBtn) incomingAttackBtn.addEventListener("click", showIncomingAttacksModal);
if (cityListBtn) cityListBtn.addEventListener("click", showCityListModal);
if (helpBtn) helpBtn.addEventListener("click", showHelpModal);
if (mainCityReturnBtn) mainCityReturnBtn.addEventListener("click", returnToMainCity);
closeModalBtn.addEventListener("click", () => modal.close());
modal.addEventListener("close", () => {
  modal.classList.remove("troop-slider-modal");
  modal.classList.remove("scout-report-modal");
  modal.classList.remove("battle-report-modal");
  modal.classList.remove("offline-reward-modal");
  modal.classList.remove("city-list-modal");
  modal.classList.remove("island-switcher-modal");
  modal.classList.remove("incoming-attack-modal");
  if (!troopSliderActive) return;
  troopSliderActive = false;
  cancelSendMode();
});

const saved = loadGame();
const savedName = saved?.playerName || readSavedName();
if (playerNameInput) playerNameInput.value = savedName || "Ricky";
applyWorldDimensions();
renderWorldMap();
renderIslandTeleporters();
updateFullscreenButton();
updateOnlineUi();
requestAnimationFrame(frame);
