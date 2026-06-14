const STORAGE_KEY = "crownlands-realtime-v20";
const LEGACY_STORAGE_KEYS = ["crownlands-realtime-v19", "crownlands-realtime-v18", "crownlands-realtime-v17", "crownlands-realtime-v16", "crownlands-realtime-v15", "realm-lords-realtime-v14", "realm-lords-realtime-v13", "realm-lords-realtime-v12", "realm-lords-realtime-v11", "realm-lords-realtime-v10", "realm-lords-realtime-v9", "realm-lords-realtime-v8", "realm-lords-realtime-v7", "realm-lords-realtime-v6", "realm-lords-realtime-v5", "realm-lords-realtime-v4", "realm-lords-realtime-v3"];
const SAVE_EVERY_SECONDS = 1.5;
const WORLD_WIDTH = 2800;
const WORLD_HEIGHT = 1575;
const GRID_SIZE = 40;
const GRID_COLS = Math.ceil(WORLD_WIDTH / GRID_SIZE);
const GRID_ROWS = Math.ceil(WORLD_HEIGHT / GRID_SIZE);
const DEFAULT_MARCH_PERCENT = 0.5;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.75;
const WHEEL_ZOOM_STEP = 1.12;
const MAX_CITY_LEVEL = 100;
const DAILY_NEUTRAL_CAPTURE_LIMIT = 30;
const PLAYER_START_TROOPS = 50;
const PLAYER_SLOT_START_TROOPS = 50;
const NPC_START_TROOPS = 50;
const NEUTRAL_START_TROOPS = 10;
const TEST_STARTING_GOLD = 100000000;
const ISLAND_CITY_COUNT = 100;
const START_POOLS = ["p1", "p2", "p3", "npc"];
const BASE_TROOP_ATTACK_POWER = 2;
const CHARACTER_START_LEVEL = 1;
const CHARACTER_START_XP = 0;
const CITY_UPGRADE_XP_BASE = 18;
const CITY_UPGRADE_XP_PER_LEVEL = 4;
const CAPTURE_XP_BASE = 120;
const CAPTURE_XP_PER_CITY_LEVEL = 45;
const CAPTURE_XP_PER_DEFENDER = 1.5;
const ENEMY_CAPTURE_XP_BONUS = 300;
const DEFENSE_HELD_XP_BASE = 80;
const DEFENSE_HELD_XP_PER_ATTACKER = 0.45;
const CITY_LEVEL_STATS = {
  cityPowerBase: 20,
  cityPowerPerLevel: 2,
  defensePercentBase: 3,
  defensePercentPerLevel: 3,
  cityWallsBase: 70,
  cityWallsPerLevel: 14,
  troopProductionBasePerHour: 40,
  troopProductionPerLevelPerHour: 5,
  goldProductionBasePerHour: 100,
  goldProductionPerLevelPerHour: 12,
  guardianPercentBase: 0,
};



function getCastleStage(level) {
  if (level >= 100) return 5;
  if (level >= 75) return 4;
  if (level >= 50) return 3;
  if (level >= 25) return 2;
  return 1;
}

const OWNER = {
  player: { label: "You", css: "player", flag: "◆" },
  player2: { label: "Player 2", css: "player2", flag: "Ⅱ" },
  player3: { label: "Player 3", css: "player3", flag: "Ⅲ" },
  enemy: { label: "NPC", css: "enemy", flag: "▲" },
  neutral: { label: "Neutral", css: "neutral", flag: "•" },
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
    "startPool": "npc"
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
    "startPool": "npc"
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
    "startPool": "npc"
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
    "startPool": "npc"
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
    "startPool": "npc"
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

const TERRAIN_BLOCKERS = [
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

const NO_CITY_TERRAIN = [
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

const routeCache = new Map();


let state;
let selectedSourceId = null;
let selectedTargetId = null;
let sendMode = false;
let selectedMarchPercent = DEFAULT_MARCH_PERCENT;
let camera = { x: 0, y: 0 };
let zoom = 1;
let panState = null;
let activePointers = new Map();
let pinchState = null;
let suppressMapClick = false;
let lastFrameTime = performance.now();
let lastRenderTime = 0;
let saveTimer = 0;
let toastTimer = null;
let attackIdCounter = 1;

const setupScreen = document.getElementById("setupScreen");
const playerNameInput = document.getElementById("playerName");
const startBtn = document.getElementById("startBtn");
const freshBtn = document.getElementById("freshBtn");
const lordNameText = document.getElementById("lordNameText");
const statusText = document.getElementById("statusText");
const goldText = document.getElementById("goldText");
const cityText = document.getElementById("cityText");
const neutralCapText = document.getElementById("neutralCapText");
const characterLevelBadge = document.getElementById("characterLevelBadge");
const characterXpText = document.getElementById("characterXpText");
const pauseBtn = document.getElementById("pauseBtn");
const mapFrame = document.getElementById("mapFrame");
const mapWorld = document.getElementById("mapWorld");
const pathsSvg = document.getElementById("pathsSvg");
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
const empireBtn = document.getElementById("empireBtn");
const logBtn = document.getElementById("logBtn");
const helpBtn = document.getElementById("helpBtn");

function cloneBaseCities(playerName) {
  const island = createIslandStartLayout(playerName);
  return island.cities;
}

function createIslandStartLayout(playerName) {
  const cities = BASE_CITIES.map(city => ({
    ...city,
    owner: "neutral",
    level: 1,
    troops: NEUTRAL_START_TROOPS,
    defense: 1,
    troopFloat: NEUTRAL_START_TROOPS,
  }));

  const startIds = pickStartCities(cities);
  const assignments = [
    { key: "player", owner: "player", name: `${playerName} Keep`, troops: PLAYER_START_TROOPS },
    { key: "player2", owner: "player2", name: "Player 2 Keep", troops: PLAYER_SLOT_START_TROOPS },
    { key: "player3", owner: "player3", name: "Player 3 Keep", troops: PLAYER_SLOT_START_TROOPS },
    { key: "npc", owner: "enemy", name: "NPC Stronghold", troops: NPC_START_TROOPS },
  ];

  for (const slot of assignments) {
    const city = cities.find(item => item.id === startIds[slot.key]);
    if (!city) continue;
    city.owner = slot.owner;
    city.name = slot.name;
    city.troops = slot.troops;
    city.troopFloat = slot.troops;
    city.level = 1;
    city.defense = 1;
  }

  return { cities, startIds };
}

function pickStartCities(cities) {
  const fallbackAnchors = {
    player: { x: 560, y: 1220, pool: "p1" },
    player2: { x: 660, y: 310, pool: "p2" },
    player3: { x: 2350, y: 470, pool: "p3" },
    npc: { x: 2230, y: 1180, pool: "npc" },
  };

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

function newGame(playerName) {
  const island = createIslandStartLayout(playerName);
  return {
    version: 20,
    playerName,
    character: createCharacterProgress(),
    gold: TEST_STARTING_GOLD,
    gameSeconds: 0,
    paused: false,
    aiCooldown: 5.5,
    upgrades: { attack: 0, income: 0, defense: 0, speed: 0 },
    daily: { date: currentLocalDateKey(), neutralCaptures: 0 },
    marchPercent: DEFAULT_MARCH_PERCENT,
    mainCityId: island.startIds.player,
    islandSlots: island.startIds,
    cities: island.cities,
    attacks: [],
    log: [`Island conquest started with ${ISLAND_CITY_COUNT} cities. Player 1, Player 2, Player 3, and the NPC are spread across the island.`],
    gameOver: null,
  };
}

function normalizeUpgrades(upgrades, sourceVersion = 6) {
  const defaults = { attack: 0, income: 0, defense: 0, speed: 0 };
  const normalized = { ...defaults };

  for (const key of Object.keys(defaults)) {
    const value = Number(upgrades?.[key]);
    if (!Number.isFinite(value)) continue;

    // Version 3 stored skills as direct multipliers: 1, 1.08, 1.16, etc.
    // Version 4+ stores skills as clean levels: 0, 1, 2, etc.
    if (Number(sourceVersion) <= 3 && value >= 1) {
      const gain = key === "speed" ? 0.06 : 0.08;
      normalized[key] = Math.max(0, Math.round((value - 1) / gain));
    } else if (value >= 0) {
      normalized[key] = Math.floor(value);
    }
  }

  return normalized;
}
function normalizeMarchPercent(value) {
  const percent = Number(value);
  const allowed = [0.25, 0.5, 0.8, 1];
  return allowed.includes(percent) ? percent : DEFAULT_MARCH_PERCENT;
}


function createCharacterProgress() {
  return { level: CHARACTER_START_LEVEL, xp: CHARACTER_START_XP };
}

function normalizeCharacterProgress(character) {
  const normalized = createCharacterProgress();
  if (character && typeof character === "object") {
    normalized.level = Math.max(1, Math.floor(Number(character.level) || CHARACTER_START_LEVEL));
    normalized.xp = Math.max(0, Math.floor(Number(character.xp) || CHARACTER_START_XP));
  }

  // If an old save somehow has enough stored XP, cleanly apply all earned levels.
  while (normalized.xp >= getXpRequiredForLevel(normalized.level)) {
    normalized.xp -= getXpRequiredForLevel(normalized.level);
    normalized.level += 1;
  }
  return normalized;
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
  return Math.floor(10 + current * 2 + Math.pow(current, 1.15));
}

function getMainRewardCity() {
  const main = state?.mainCityId ? cityById(state.mainCityId) : null;
  return main?.owner === "player" ? main : playerCities()[0] || null;
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
    }

    addLog(`Hero leveled to ${state.character.level}. Reward: ${formatNumber(totalGoldReward)} gold and ${formatNumber(totalTroopReward)} troops to ${mainCity ? mainCity.name : "the main city"}.`);
    showToast(`Hero Lv ${state.character.level}: +${formatNumber(totalGoldReward)} gold, +${formatNumber(totalTroopReward)} troops`);
  }
}

function getCaptureXpAward(target, oldOwner, defendersAtStart) {
  const level = clampCityLevel(target?.level);
  const defenderXp = Math.floor(Math.max(0, Number(defendersAtStart) || 0) * CAPTURE_XP_PER_DEFENDER);
  const ownerBonus = oldOwner === "enemy" ? ENEMY_CAPTURE_XP_BONUS : 0;
  return Math.floor(CAPTURE_XP_BASE + level * CAPTURE_XP_PER_CITY_LEVEL + defenderXp + ownerBonus);
}

function getCityUpgradeXpAward(city) {
  return Math.floor(CITY_UPGRADE_XP_BASE + clampCityLevel(city?.level) * CITY_UPGRADE_XP_PER_LEVEL);
}

function getDefenseHeldXpAward(attackingTroops) {
  return Math.floor(DEFENSE_HELD_XP_BASE + Math.max(0, Number(attackingTroops) || 0) * DEFENSE_HELD_XP_PER_ATTACKER);
}

function skillMultiplier(skill) {
  const level = Math.max(0, Number(state?.upgrades?.[skill]) || 0);
  const gains = { attack: 0.08, income: 0.14, defense: 0.08, speed: 0.06 };
  return Number((1 + level * gains[skill]).toFixed(2));
}

function clampCityLevel(level) {
  return clamp(Math.floor(Number(level) || 1), 1, MAX_CITY_LEVEL);
}

function getCityStats(city) {
  const level = clampCityLevel(city?.level);
  const step = level - 1;
  const defensePercent = CITY_LEVEL_STATS.defensePercentBase + step * CITY_LEVEL_STATS.defensePercentPerLevel;
  const cityWalls = CITY_LEVEL_STATS.cityWallsBase + step * CITY_LEVEL_STATS.cityWallsPerLevel;
  const guardianPercent = CITY_LEVEL_STATS.guardianPercentBase;
  const troopProductionPerHour = CITY_LEVEL_STATS.troopProductionBasePerHour + step * CITY_LEVEL_STATS.troopProductionPerLevelPerHour;
  const goldProductionPerHour = CITY_LEVEL_STATS.goldProductionBasePerHour + step * CITY_LEVEL_STATS.goldProductionPerLevelPerHour;
  const cityPower = CITY_LEVEL_STATS.cityPowerBase + step * CITY_LEVEL_STATS.cityPowerPerLevel;
  const troopDefense = Math.floor((Number(city?.troops) || 0) * (1 + defensePercent / 100));
  const totalDefense = Math.floor(cityWalls + troopDefense + cityWalls * (guardianPercent / 100));

  return {
    level,
    cityPower,
    defensePercent,
    cityWalls,
    guardianPercent,
    troopProductionPerHour,
    goldProductionPerHour,
    troopProductionPerSecond: troopProductionPerHour / 3600,
    goldProductionPerSecond: goldProductionPerHour / 3600,
    totalDefense,
  };
}

function getBattleDefensePower(city) {
  const stats = getCityStats(city);
  const ownerBoost = city.owner === "player" ? skillMultiplier("defense") : 1;
  return stats.totalDefense * ownerBoost;
}

function getAttackPower(troops, owner) {
  const ownerBoost = owner === "player" ? skillMultiplier("attack") : 1.04;
  return troops * BASE_TROOP_ATTACK_POWER * ownerBoost;
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
      loaded.version = 20;
      loaded.character = normalizeCharacterProgress(loaded.character);
      loaded.upgrades = normalizeUpgrades(loaded.upgrades, 8);
      loaded.marchPercent = normalizeMarchPercent(loaded.marchPercent);
      loaded.daily = normalizeDailyCaptureTracker(loaded.daily);
      const savedCitiesAreCurrent = Array.isArray(loaded.cities)
        && loaded.cities.length === BASE_CITIES.length
        && BASE_CITIES.every(base => loaded.cities.some(city => city.id === base.id));
      if (!savedCitiesAreCurrent) {
        const island = createIslandStartLayout(loaded.playerName || "Ricky");
        loaded.cities = island.cities;
        loaded.mainCityId = island.startIds.player;
        loaded.islandSlots = island.startIds;
        loaded.attacks = [];
        loaded.log = Array.isArray(loaded.log) ? loaded.log : [];
        loaded.log.push("0:00 · Island layout upgraded to the medieval island art Version 17 map.");
      }
      loaded.cities.forEach(city => {
        const base = BASE_CITIES.find(item => item.id === city.id);
        if (base) {
          city.x = base.x;
          city.y = base.y;
          city.startPool = base.startPool;
        }
        delete city.adj;
        city.owner = OWNER[city.owner] ? city.owner : "neutral";
        city.level = clampCityLevel(city.level);
        city.defense = 1;
        city.troops = Math.max(0, Math.floor(Number(city.troops) || 0));
        city.troopFloat = Number.isFinite(city.troopFloat) ? Math.max(0, city.troopFloat) : city.troops;
      });
      if (!loaded.mainCityId || cityByIdSafe(loaded.cities, loaded.mainCityId)?.owner !== "player") {
        loaded.mainCityId = loaded.cities.find(city => city.owner === "player")?.id || null;
      }
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
        }
      });
      loaded.paused = false;
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
    return { date: today, neutralCaptures: 0 };
  }
  return {
    date: today,
    neutralCaptures: clamp(Math.floor(Number(daily.neutralCaptures) || 0), 0, DAILY_NEUTRAL_CAPTURE_LIMIT),
  };
}

function ensureDailyCaptureTracker() {
  if (!state) return { date: currentLocalDateKey(), neutralCaptures: 0 };
  state.daily = normalizeDailyCaptureTracker(state.daily);
  return state.daily;
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
  return {
    capturesToday: daily.neutralCaptures,
    pending,
    cityCount: owned,
    remainingToday: Math.max(0, DAILY_NEUTRAL_CAPTURE_LIMIT - daily.neutralCaptures - pending),
  };
}

function getNeutralCaptureBlockReason(target, owner = "player", excludeAttackId = null) {
  if (owner !== "player" || target?.owner !== "neutral") return "";
  const status = neutralCaptureStatus(excludeAttackId);
  if (status.remainingToday <= 0) {
    return `You cannot conquer more neutral towns today. Daily neutral capture limit reached: ${DAILY_NEUTRAL_CAPTURE_LIMIT}/${DAILY_NEUTRAL_CAPTURE_LIMIT}.`;
  }
  return "";
}

function showNeutralCaptureLimitModal(message) {
  const status = neutralCaptureStatus();
  modalTitle.textContent = "Neutral town limit reached";
  modalBody.innerHTML = `
    <div class="send-outcome lose">
      <strong>You cannot conquer more neutral towns today.</strong>
      <span>${escapeHtml(message)}</span>
      <small>${status.capturesToday}/${DAILY_NEUTRAL_CAPTURE_LIMIT} neutral captures used today. You can still attack NPC or player-owned cities and move troops between your owned cities.</small>
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function startFromInput(forceFresh = false) {
  const playerName = cleanName(playerNameInput.value) || readSavedName() || "Ricky";
  const saved = forceFresh ? null : loadGame();
  state = saved || newGame(playerName);
  if (!saved) state.playerName = playerName;
  selectedMarchPercent = normalizeMarchPercent(state.marchPercent);
  setupScreen.classList.remove("visible");
  clearSelection(false);
  saveGame();
  renderAll();
  requestAnimationFrame(() => centerOnCity(selectedSourceId || state.mainCityId || playerCities()[0]?.id));
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

function enemyCities() {
  return state.cities.filter(city => city.owner === "enemy");
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
  const gx = Math.floor(x / GRID_SIZE);
  const gy = Math.floor(y / GRID_SIZE);
  return gy >= 0
    && gy < WALKABLE_TERRAIN_ROWS.length
    && gx >= 0
    && gx < WALKABLE_TERRAIN_ROWS[gy].length
    && WALKABLE_TERRAIN_ROWS[gy][gx] === "1";
}

function isWalkablePoint(x, y, padding = 0) {
  const samples = padding > 0
    ? [[0, 0], [padding, 0], [-padding, 0], [0, padding], [0, -padding]]
    : [[0, 0]];

  for (const [dx, dy] of samples) {
    if (!isBaseLandPoint(x + dx, y + dy)) return false;
  }

  return !TERRAIN_BLOCKERS.some(shape => {
    const extra = shape.type === "mountain" ? 20 : 10;
    return pointInEllipse(x, y, shape, padding + extra);
  });
}


function isValidCityPlacementPoint(x, y) {
  if (!isWalkablePoint(x, y, 0)) return false;
  for (const [dx, dy] of [[0, 0], [32, 0], [-32, 0], [0, 32], [0, -32], [24, 24], [-24, 24], [24, -24], [-24, -24]]) {
    if (!isBaseLandPoint(x + dx, y + dy)) return false;
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

function findRoute(source, target) {
  const cacheKey = `${source.id}|${target.id}`;
  const reverseKey = `${target.id}|${source.id}`;
  if (routeCache.has(cacheKey)) return cloneRoute(routeCache.get(cacheKey));
  if (routeCache.has(reverseKey)) {
    const reverse = cloneRoute(routeCache.get(reverseKey));
    reverse.points.reverse();
    routeCache.set(cacheKey, cloneRoute(reverse));
    return reverse;
  }

  const startPoint = { x: source.x, y: source.y };
  const endPoint = { x: target.x, y: target.y };
  if (linePassable(startPoint, endPoint)) {
    const direct = { points: [startPoint, endPoint], length: Math.hypot(source.x - target.x, source.y - target.y) };
    routeCache.set(cacheKey, cloneRoute(direct));
    return direct;
  }

  const start = nearestWalkableCell(source.x, source.y);
  const goal = nearestWalkableCell(target.x, target.y);
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
      const route = buildRouteFromCells(cameFrom, current.index, startPoint, endPoint);
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
      if (!isWalkableCell(nx, ny)) continue;
      if (dx && dy && (!isWalkableCell(cx + dx, cy) || !isWalkableCell(cx, cy + dy))) continue;
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

function buildRouteFromCells(cameFrom, currentIndex, startPoint, endPoint) {
  const cells = [];
  let current = currentIndex;
  cells.push(current);
  while (cameFrom.has(current)) {
    current = cameFrom.get(current);
    cells.push(current);
  }
  cells.reverse();

  let points = [startPoint, ...cells.map(index => gridToWorld(index % GRID_COLS, Math.floor(index / GRID_COLS))), endPoint];
  points = simplifyRoute(points);
  return { points, length: routeLength(points) };
}

function simplifyRoute(points) {
  if (points.length <= 2) return points;
  const simplified = [points[0]];
  let anchor = 0;

  while (anchor < points.length - 1) {
    let next = points.length - 1;
    while (next > anchor + 1 && !linePassable(points[anchor], points[next])) next--;
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
  };
}

function pointAlongRoute(points, progress) {
  if (!Array.isArray(points) || points.length < 2) return { x: 0, y: 0 };
  const total = routeLength(points);
  let wanted = total * clamp(progress, 0, 1);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (wanted <= segment) {
      const t = segment <= 0 ? 0 : wanted / segment;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    wanted -= segment;
  }
  return points[points.length - 1];
}

function frame(now) {
  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  const dt = Math.min(rawDt, 0.25);

  if (state && !state.paused && !state.gameOver) {
    updateGame(dt);
    saveTimer += dt;
    if (saveTimer >= SAVE_EVERY_SECONDS) {
      saveTimer = 0;
      saveGame();
    }
  }

  if (state) {
    renderArmies();
    if (now - lastRenderTime > 250) {
      lastRenderTime = now;
      renderAll();
    }
  }

  requestAnimationFrame(frame);
}

function updateGame(dt) {
  state.gameSeconds += dt;
  updateEconomy(dt);
  updateAttacks(dt);
  updateEnemyAI(dt);
  checkGameOver();
}

function updateEconomy(dt) {
  for (const city of state.cities) {
    if (city.owner === "neutral") continue;
    const stats = getCityStats(city);
    const ownerBoost = city.owner === "player" ? skillMultiplier("income") : 1;
    const growth = stats.troopProductionPerSecond * ownerBoost;
    city.troopFloat += growth * dt;
    city.troops = Math.floor(city.troopFloat);
  }

  const goldPerSecond = getGoldPerSecond();
  state.gold += goldPerSecond * dt;
}

function getGoldPerSecond() {
  return playerCities().reduce((sum, city) => sum + getCityStats(city).goldProductionPerSecond, 0) * skillMultiplier("income");
}

function updateAttacks(dt) {
  const completed = [];
  for (const attack of state.attacks) {
    attack.remaining -= dt;
    if (attack.remaining <= 0) completed.push(attack);
  }

  for (const attack of completed) {
    resolveAttack(attack);
  }

  if (completed.length) {
    state.attacks = state.attacks.filter(attack => attack.remaining > 0);
  }
}

function updateEnemyAI(dt) {
  state.aiCooldown -= dt;
  if (state.aiCooldown > 0) return;

  const enemies = enemyCities()
    .filter(city => city.troops > Math.max(30, city.level * 10))
    .sort((a, b) => b.troops - a.troops);

  let launched = false;
  for (const source of enemies) {
    const possible = state.cities
      .filter(target => target.id !== source.id && target.owner !== "enemy")
      .sort((a, b) => aiTargetScore(source, b) - aiTargetScore(source, a));

    for (const target of possible.slice(0, 8)) {
      const percent = target.owner === "player" ? 0.7 : 0.85;
      if (launchAttack(source.id, target.id, percent, "enemy")) {
        launched = true;
        break;
      }
    }
    if (launched) break;
  }

  state.aiCooldown = launched ? randomBetween(7.5, 12.5) : randomBetween(3.5, 5.5);
}

function aiTargetScore(source, city) {
  const distance = Math.hypot(source.x - city.x, source.y - city.y);
  const ownerScore = city.owner === "player" ? 900 : 220;
  return ownerScore + city.level * 9 - city.troops * 0.035 - distance * 0.12;
}

function targetPriority(city) {
  if (city.owner === "player") return 1000 + city.level * 8 + city.troops * 0.05;
  return city.level * 10 - city.troops * 0.03;
}

function launchAttack(sourceId, targetId, percent, owner) {
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

  const send = clamp(Math.floor(source.troops * percent), 1, source.troops);
  const kind = target.owner === owner ? "transfer" : "attack";

  source.troopFloat = Math.max(0, source.troopFloat - send);
  source.troops = Math.floor(source.troopFloat);

  const duration = travelTime(source, target, owner, route.length);
  state.attacks.push({
    id: attackIdCounter++,
    owner,
    kind,
    fromId: source.id,
    toId: target.id,
    troops: send,
    total: duration,
    remaining: duration,
    path: route.points,
    pathLength: route.length,
    targetOwnerAtLaunch: target.owner,
  });

  if (owner === "player" && kind === "transfer") {
    addLog(`You moved ${formatNumber(send)} troops from ${source.name} to ${target.name}.`);
    showToast(`Reinforcements moving: ${source.name} → ${target.name}`);
  } else if (owner === "player") {
    addLog(`You sent ${formatNumber(send)} troops from ${source.name} to attack ${target.name}.`);
    showToast(`Attack moving: ${source.name} → ${target.name}`);
  } else if (target.owner === "player") {
    addLog(`NPC army is attacking ${target.name} with ${formatNumber(send)} troops.`);
    showToast(`Incoming attack on ${target.name}`);
  }

  return true;
}

function travelTime(source, target, owner, pathLength = null) {
  const distance = Number.isFinite(pathLength) && pathLength > 0
    ? pathLength
    : Math.hypot(source.x - target.x, source.y - target.y);
  const speed = owner === "player" ? skillMultiplier("speed") : 1;
  return clamp(distance * 0.014 / speed, 3.5, 42);
}

function resolveAttack(attack) {
  const target = cityById(attack.toId);
  if (!target) return;

  if (attack.kind === "transfer" && target.owner === attack.owner) {
    target.troopFloat += attack.troops;
    target.troops = Math.floor(target.troopFloat);
    if (attack.owner === "player") {
      addLog(`Reinforcements arrived at ${target.name}: +${formatNumber(attack.troops)} troops.`);
      showToast(`Reinforced ${target.name}`);
    }
    return;
  }

  const attackerName = attack.owner === "player" ? "You" : "NPC";
  const oldOwner = target.owner;
  const defendersAtStart = Math.max(0, Math.floor(Number(target.troops) || 0));
  const attackPower = getAttackPower(attack.troops, attack.owner);
  const defensePower = getBattleDefensePower(target);

  if (attackPower > defensePower) {
    const neutralCapture = attack.owner === "player" && oldOwner === "neutral";
    const neutralBlockReason = neutralCapture ? getNeutralCaptureBlockReason(target, "player", attack.id) : "";
    if (neutralBlockReason) {
      target.troopFloat = Math.max(1, target.troopFloat);
      target.troops = Math.floor(target.troopFloat);
      addLog(`${attackerName} defeated the defenders at ${target.name}, but could not capture it. ${neutralBlockReason}`);
      if (attack.owner === "player") showNeutralCaptureLimitModal(neutralBlockReason);
      else showToast(neutralBlockReason);
      return;
    }

    const attackerBoost = attack.owner === "player" ? skillMultiplier("attack") : 1.04;
    const leftoverPower = attackPower - defensePower * 0.68;
    const survivors = Math.max(1, Math.floor(leftoverPower / Math.max(BASE_TROOP_ATTACK_POWER * attackerBoost, 1)));
    target.owner = attack.owner;
    target.troopFloat = survivors;
    target.troops = survivors;
    target.defense = 1;
    if (neutralCapture) recordNeutralCapture();

    if (attack.owner === "player") {
      addLog(`Victory: you captured ${target.name} with ${formatNumber(survivors)} survivors.`);
      showToast(`Captured ${target.name}`);
      addCharacterXp(getCaptureXpAward(target, oldOwner, defendersAtStart), `${target.name} capture`);
    } else if (oldOwner === "player") {
      addLog(`Lost: the NPC captured ${target.name}.`);
      showToast(`You lost ${target.name}`);
    }
  } else {
    const defenderLeft = Math.max(1, Math.floor((defensePower - attackPower * 0.52) / Math.max(1 + getCityStats(target).defensePercent / 100, 1)));
    target.troopFloat = defenderLeft;
    target.troops = defenderLeft;

    if (attack.owner === "player") {
      addLog(`Defeat: your attack on ${target.name} failed. ${formatNumber(defenderLeft)} defenders remain.`);
      showToast(`Attack failed at ${target.name}`);
    } else if (oldOwner === "player") {
      addLog(`Defense held: ${target.name} survived the NPC attack.`);
      showToast(`Defense held at ${target.name}`);
      addCharacterXp(getDefenseHeldXpAward(attack.troops), `${target.name} defense`);
      showToast(`${target.name} defended successfully`);
    }
  }

  if (selectedSourceId && cityById(selectedSourceId)?.owner !== "player") {
    clearSelection(false);
  }
}

function checkGameOver() {
  if (state.gameOver) return;
  if (playerCities().length === 0) {
    state.gameOver = "defeat";
    addLog("Defeat: you lost your final city.");
    showToast("Defeat. Start a fresh map to retry.");
  } else if (enemyCities().length === 0) {
    state.gameOver = "victory";
    addLog("Victory: the NPC kingdom was defeated.");
    showToast("Victory. The NPC kingdom was defeated.");
  }
}

function renderAll() {
  if (!state) return;
  updateCameraTransform();
  renderHud();
  renderPaths();
  renderCities();
  renderPanel();
  renderArmies();
}

function renderHud() {
  if (lordNameText) lordNameText.textContent = state.playerName;
  ensureDailyCaptureTracker();
  state.character = normalizeCharacterProgress(state.character);
  goldText.textContent = formatNumber(Math.floor(state.gold));
  if (characterLevelBadge) characterLevelBadge.textContent = `Lv ${formatNumber(state.character.level)}`;
  if (characterXpText) characterXpText.textContent = "";
  cityText.textContent = `${playerCities().length}`;
  pauseBtn.textContent = state.paused ? "▶" : "Ⅱ";

  if (!statusText) return;
  if (state.gameOver === "victory") {
    statusText.textContent = "Victory";
  } else if (state.gameOver === "defeat") {
    statusText.textContent = "Defeat";
  } else if (state.paused) {
    statusText.textContent = "Paused";
  } else {
    statusText.textContent = `+${getGoldPerSecond().toFixed(1)} gold/s`;
  }
}

function renderPaths() {
  pathsSvg.innerHTML = "";
  for (const attack of state.attacks) {
    const from = cityById(attack.fromId);
    const to = cityById(attack.toId);
    if (!from || !to) continue;
    let path = Array.isArray(attack.path) && attack.path.length >= 2 ? attack.path : null;
    if (!path) {
      const route = findRoute(from, to);
      path = route?.points || [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
      attack.path = path;
      attack.pathLength = route?.length || routeLength(path);
    }

    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", path.map(point => `${point.x},${point.y}`).join(" "));
    polyline.classList.add("army-route", attack.owner === "player" ? "player-route" : "enemy-route");
    if (attack.kind === "transfer") polyline.classList.add("transfer-route");
    pathsSvg.appendChild(polyline);
  }
}

function renderCities() {
  const source = selectedSourceId ? cityById(selectedSourceId) : null;
  cityLayer.innerHTML = "";

  state.cities.forEach(city => {
    const btn = document.createElement("button");
    btn.type = "button";
    const castleStage = getCastleStage(city.level);
    btn.className = `city-node ${OWNER[city.owner].css} castle-stage-${castleStage}`;
    if (city.id === selectedSourceId) btn.classList.add("selected");
    if (city.id === selectedTargetId) btn.classList.add("targeted");
    if (sendMode && source && city.id !== source.id) {
      btn.classList.add(city.owner === "player" ? "supportable" : "attackable");
    }
    btn.style.left = `${city.x}px`;
    btn.style.top = `${city.y}px`;
    const stats = getCityStats(city);
    btn.setAttribute("aria-label", `${city.name}. ${OWNER[city.owner].label}. Level ${city.level}. ${formatNumber(city.troops)} troops. ${formatNumber(stats.totalDefense)} total defense.`);
    btn.innerHTML = `
      <span class="city-ring"></span>
      <span class="city-castle stage-${castleStage}" aria-hidden="true"></span>
      <span class="city-level">${city.level}</span>
      <span class="city-label">
        <span class="flag">${OWNER[city.owner].flag}</span>
        <span><strong>${escapeHtml(shortName(city.name))}</strong><span>${formatNumber(city.troops)}</span></span>
      </span>
    `;
    btn.addEventListener("click", event => {
      event.stopPropagation();
      selectCity(city.id);
    });
    cityLayer.appendChild(btn);
  });
}

function renderArmies() {
  if (!state) return;
  armyLayer.innerHTML = "";
  for (const attack of state.attacks) {
    const from = cityById(attack.fromId);
    const to = cityById(attack.toId);
    if (!from || !to) continue;
    const progress = clamp(1 - attack.remaining / attack.total, 0, 1);
    const path = Array.isArray(attack.path) && attack.path.length >= 2 ? attack.path : [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
    const point = pointAlongRoute(path, progress);
    const x = point.x;
    const y = point.y;
    const token = document.createElement("div");
    token.className = `army-token ${OWNER[attack.owner].css}`;
    token.style.left = `${x}px`;
    token.style.top = `${y}px`;
    const armyIcon = attack.kind === "transfer" ? "👟" : "⚔";
    token.innerHTML = `<span>${armyIcon}</span><strong>${formatNumber(attack.troops)}</strong><small>${Math.ceil(attack.remaining)}s</small>`;
    armyLayer.appendChild(token);
  }
}

function renderPanel() {
  actionButtons.innerHTML = "";
  const source = selectedSourceId ? cityById(selectedSourceId) : null;

  if (commanderPanel) commanderPanel.classList.remove("visible");

  if (state.gameOver) {
    if (commanderPanel) commanderPanel.classList.add("visible");
    panelTitle.textContent = state.gameOver === "victory" ? "NPC defeated" : "Kingdom defeated";
    panelSubtitle.textContent = state.gameOver === "victory" ? "You defeated the NPC kingdom." : "You lost your final city.";
    selectedInfo.innerHTML = state.gameOver === "victory"
      ? `<strong>Victory.</strong> Start fresh to test the loop again.`
      : `<strong>Defeat.</strong> The NPC took your last city.`;
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

  if (sendMode && selectedTargetId) {
    return renderSendConfirmPanel(source, cityById(selectedTargetId));
  }

  if (sendMode) {
    panelTitle.textContent = "Choose destination";
    panelSubtitle.textContent = `${source.name} · ${formatNumber(source.troops)} troops ready`;
    selectedInfo.innerHTML = `
      <div class="send-choose-card">
        <strong>Send troops from ${escapeHtml(source.name)}</strong>
        <p>Tap any other city on the island. Blue cities use the shoe icon for movement. Neutral, NPC, Player 2, or Player 3 cities use swords for an attack.</p>
      </div>
    `;
    actionButtons.appendChild(button("Cancel Send", cancelSendMode, false, "secondary"));
    actionButtons.appendChild(button("Center Source", () => centerOnCity(source.id), false, "secondary"));
    return;
  }

  const stats = getCityStats(source);
  const levelCost = getLevelCost(source);
  const disabledLevel = source.level >= MAX_CITY_LEVEL || state.gold < levelCost;

  panelTitle.textContent = source.name;
  panelSubtitle.textContent = `Level ${source.level}/${MAX_CITY_LEVEL} · ${formatNumber(source.troops)} troops`;
  selectedInfo.innerHTML = `
    <div class="selected-mini">
      <div><span>Defense</span><strong>${formatNumber(stats.totalDefense)}</strong></div>
      <div><span>Gold</span><strong>${formatNumber(stats.goldProductionPerHour)}/h</strong></div>
      <div><span>Troops</span><strong>${formatNumber(stats.troopProductionPerHour)}/h</strong></div>
    </div>
  `;

  const row = document.createElement("div");
  row.className = "city-action-row";
  row.appendChild(button(`Level Up\n${formatNumber(levelCost)}g`, () => upgradeCity(source.id, 1), disabledLevel, "level-action"));
  row.appendChild(button("!", () => showCityInfoModal(source.id), false, "info-action"));
  row.appendChild(button("Send Troops", () => beginSendMode(source.id), source.troops < 1, "send-action"));
  actionButtons.appendChild(row);
}

function renderSendConfirmPanel(source, target) {
  if (!source || !target || source.id === target.id) {
    selectedTargetId = null;
    return renderPanel();
  }

  const isTransfer = target.owner === "player";
  const neutralBlockReason = getNeutralCaptureBlockReason(target, "player");
  const icon = isTransfer ? "👟" : "⚔️";
  const label = isTransfer ? "Move" : "Attack";
  const route = findRoute(source, target);
  const sendAmount = source.troops > 0 ? clamp(Math.floor(source.troops * selectedMarchPercent), 1, source.troops) : 0;
  const travel = route ? travelTime(source, target, "player", route.length) : Infinity;
  let outcomeHtml = "";

  if (!isTransfer && route) {
    const preview = calculateBattlePreview(source, target, selectedMarchPercent);
    outcomeHtml = `
      <div class="send-outcome ${preview.success ? "win" : "lose"}">
        <strong>${preview.success ? "Likely Victory" : "Likely Defeat"}</strong>
        <span>${preview.label}</span>
        <small>${preview.success
          ? `Est. survivors: ${formatNumber(preview.survivors)}`
          : `Est. defenders left: ${formatNumber(preview.defendersLeft)}`}</small>
      </div>
    `;
  }


  panelTitle.textContent = `${icon} ${label} troops`;
  panelSubtitle.textContent = `${source.name} → ${target.name}`;
  selectedInfo.innerHTML = `
    <div class="send-confirm-card">
      <div class="send-icon">${icon}</div>
      <div class="send-main">
        <strong>${escapeHtml(source.name)} → ${escapeHtml(target.name)}</strong>
        <span>${formatPercent(selectedMarchPercent)} selected · ${formatNumber(sendAmount)} troops</span>
        <span>${route ? `${Math.ceil(travel)}s travel · ${formatNumber(route.length)} distance` : "No valid land route"}</span>
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
    return;
  }

  if (clicked.owner === "player") {
    selectedSourceId = clicked.id;
    selectedTargetId = null;
    sendMode = false;
    renderAll();
    return;
  }

  showToast("Select a blue city first, then press Send Troops.");
}

function beginSendMode(sourceId) {
  const source = cityById(sourceId);
  if (!source || source.owner !== "player") return;
  if (source.troops < 1) {
    showToast("No troops available to send.");
    return;
  }
  selectedSourceId = source.id;
  selectedTargetId = null;
  sendMode = true;
  showToast("Choose a destination city.");
  renderAll();
}

function cancelSendMode() {
  sendMode = false;
  selectedTargetId = null;
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
  const stats = getCityStats(city);
  modalTitle.textContent = `${city.name} · Level ${city.level}`;
  modalBody.innerHTML = `
    <div class="city-stat-panel modal-city-stats">
      <div class="stat-wide"><span>Total defense</span><strong>${formatNumber(stats.totalDefense)}</strong></div>
      <div class="stat-chip"><span>Troops</span><strong>${formatNumber(city.troops)}</strong></div>
      <div class="stat-chip"><span>Guardian</span><strong>${stats.guardianPercent}%</strong></div>
      <div class="stat-chip"><span>City power</span><strong>${formatNumber(stats.cityPower)}</strong><small>+${CITY_LEVEL_STATS.cityPowerPerLevel}/level</small></div>
      <div class="stat-chip"><span>Defense</span><strong>${stats.defensePercent}%</strong><small>+${CITY_LEVEL_STATS.defensePercentPerLevel}%/level</small></div>
      <div class="stat-chip"><span>Troops production</span><strong>${formatNumber(stats.troopProductionPerHour)}/h</strong><small>+${CITY_LEVEL_STATS.troopProductionPerLevelPerHour}/level</small></div>
      <div class="stat-chip"><span>City walls</span><strong>${formatNumber(stats.cityWalls)}</strong><small>+${CITY_LEVEL_STATS.cityWallsPerLevel}/level</small></div>
      <div class="stat-chip"><span>Gold production</span><strong>${formatNumber(stats.goldProductionPerHour)}/h</strong><small>+${CITY_LEVEL_STATS.goldProductionPerLevelPerHour}/level</small></div>
    </div>
  `;
  if (!modal.open) modal.showModal();
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
      <p><strong>${source.name}</strong> → <strong>${target.name}</strong> · ${formatPercent(selectedMarchPercent)} march · about ${Math.ceil(preview.travel)}s travel.</p>
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
  addLog(`Recruited ${formatNumber(amount)} troops at ${city.name}.`);
  showToast(`Recruited at ${city.name}`);
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
  let cost = 0;
  let tempLevel = clampCityLevel(city.level);
  for (let i = 0; i < levels && tempLevel < MAX_CITY_LEVEL; i += 1) {
    cost += Math.floor(10 * tempLevel);
    tempLevel += 1;
  }
  return cost;
}

function getLevelCost(city) {
  return getMultiLevelCost(city, 1);
}

function getFortifyCost(city) {
  return Infinity;
}

function calculateBattlePreview(source, target, percent) {
  const send = clamp(Math.floor(source.troops * percent), 1, source.troops);
  const attackBoost = skillMultiplier("attack");
  const attackPower = getAttackPower(send, "player");
  const defensePower = getBattleDefensePower(target);
  const ratio = attackPower / Math.max(1, defensePower);
  const success = attackPower > defensePower;
  const survivors = success ? Math.max(1, Math.floor((attackPower - defensePower * 0.68) / Math.max(BASE_TROOP_ATTACK_POWER * attackBoost, 1))) : 0;
  const defendersLeft = success ? 0 : Math.max(1, Math.floor((defensePower - attackPower * 0.52) / Math.max(1 + getCityStats(target).defensePercent / 100, 1)));
  let label = "Weak odds";
  if (ratio >= 1.35) label = "Overwhelming advantage";
  else if (ratio >= 1.12) label = "Good advantage";
  else if (ratio > 1) label = "Close win";
  else if (ratio >= .82) label = "Risky attack";
  const route = findRoute(source, target);
  const travel = route ? travelTime(source, target, "player", route.length) : Infinity;
  return { send, attackPower, defensePower, ratio, success, survivors, defendersLeft, label, travel, path: route?.points || null, pathLength: route?.length || 0 };
}

function estimateOutcome(source, target, percent) {
  return calculateBattlePreview(source, target, percent).label;
}

function showEmpireModal() {
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

function skillRow(label, key, description, cost) {
  const level = Number(state.upgrades[key]) || 0;
  const multiplier = skillMultiplier(key).toFixed(2).replace(/\.00$/, "");
  const disabled = state.gold < cost ? "disabled" : "";
  return `
    <div class="skill-row">
      <div><strong>${label} Lv ${level} · x${multiplier}</strong><br><small>${description}</small></div>
      <button data-skill="${key}" ${disabled}>${formatNumber(cost)}</button>
    </div>
  `;
}

function buySkill(skill) {
  const cost = getSkillCost(skill);
  if (state.gold < cost) return;
  state.gold -= cost;
  state.upgrades[skill] = Math.max(0, Number(state.upgrades[skill]) || 0) + 1;
  addLog(`Empire skill improved: ${skill} is now level ${state.upgrades[skill]}.`);
  saveGame();
  showEmpireModal();
  renderAll();
}

function getSkillCost(skill) {
  const level = Math.max(0, Number(state.upgrades[skill]) || 0);
  return Math.floor(450 * Math.pow(level + 1, 1.85));
}

function showLogModal() {
  modalTitle.textContent = "Battle Log";
  const entries = state.log.slice(-18).reverse();
  modalBody.innerHTML = entries.length
    ? `<ul>${entries.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p>No events yet.</p>`;
  modal.showModal();
}

function showHelpModal() {
  modalTitle.textContent = "How this prototype works";
  modalBody.innerHTML = `
    <p>This is real-time, not turn-based. Gold, troop growth, enemy decisions, and army travel keep running while the game is unpaused.</p>
    <ul>
      <li>Drag empty land to move around the larger map.</li>
      <li>Use the mouse wheel on PC or pinch on phone to zoom in and out.</li>
      <li>Tap empty land to deselect your current city.</li>
      <li>Tap a blue city to select your source.</li>
      <li>Use the left button to level that exact city one level at a time.</li>
      <li>Use the center ! button to inspect that city's full stat panel.</li>
      <li>Use Send Troops, then tap a destination city.</li>
      <li>Choose 25%, 50%, 80%, or 100%, then press the shoe icon for transfers or swords for attacks.</li>
      <li>There are no fixed roads. Active army routes appear only after troops are sent.</li>
      <li>Armies calculate the shortest land route around lakes and mountains, then resolve when they arrive.</li>
      <li>All cities start at Level 1 and can upgrade to Level 100.</li>
      <li>Your main city starts with 50 troops. Gray cities start with 10 defending troops. Player 2, Player 3, and the NPC each start with one city on far sides of the island.</li>
      <li>Use Recruit, Level Up, and Skills to grow faster. Leveling increases walls, defense %, troop production, and gold production.</li>
      <li>For this local prototype, the NPC is the active AI. Player 2 and Player 3 are placeholder real-player slots until multiplayer is added.</li>
    </ul>
  `;
  modal.showModal();
}

function togglePause() {
  if (!state || state.gameOver) return;
  state.paused = !state.paused;
  showToast(state.paused ? "Paused" : "Resumed");
  renderAll();
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
  const stamped = `${formatClock(state.gameSeconds)} · ${message}`;
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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.floor(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
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

function updateCameraTransform() {
  if (!mapWorld || !mapFrame) return;
  const rect = mapFrame.getBoundingClientRect();
  zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const maxX = Math.max(0, WORLD_WIDTH - rect.width / zoom);
  const maxY = Math.max(0, WORLD_HEIGHT - rect.height / zoom);
  camera.x = clamp(camera.x, 0, maxX);
  camera.y = clamp(camera.y, 0, maxY);
  mapWorld.style.transform = `translate3d(${-camera.x * zoom}px, ${-camera.y * zoom}px, 0) scale(${zoom})`;
}

function centerOnCity(cityId) {
  const city = cityById(cityId);
  if (!city || !mapFrame) return;
  const rect = mapFrame.getBoundingClientRect();
  camera.x = city.x - rect.width / (2 * zoom);
  camera.y = city.y - rect.height / (2 * zoom);
  updateCameraTransform();
}

function screenToWorld(clientX, clientY) {
  const rect = mapFrame.getBoundingClientRect();
  return {
    x: camera.x + (clientX - rect.left) / zoom,
    y: camera.y + (clientY - rect.top) / zoom,
  };
}

function setZoomAroundPoint(nextZoom, clientX, clientY) {
  const rect = mapFrame.getBoundingClientRect();
  const before = screenToWorld(clientX, clientY);
  zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  camera.x = before.x - (clientX - rect.left) / zoom;
  camera.y = before.y - (clientY - rect.top) / zoom;
  updateCameraTransform();
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
    worldPoint: screenToWorld(mid.x, mid.y),
  };
  panState = null;
  suppressMapClick = true;
  mapFrame.classList.add("dragging");
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
  camera.x = pinchState.worldPoint.x - (mid.x - rect.left) / zoom;
  camera.y = pinchState.worldPoint.y - (mid.y - rect.top) / zoom;
  updateCameraTransform();
}

function startPan(event) {
  if (!state || event.button > 0) return;

  // City taps must stay owned by the city button.
  // V6 was capturing the pointer on mapFrame before this check, which could
  // steal the final click from blue cities after zoom/pan was added.
  if (event.target.closest(".city-node")) {
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
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomChoice(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

startBtn.addEventListener("click", () => startFromInput(false));
freshBtn.addEventListener("click", () => startFromInput(true));
playerNameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") startFromInput(false);
});
pauseBtn.addEventListener("click", togglePause);
clearSelectBtn.addEventListener("click", () => clearSelection());
mapFrame.addEventListener("pointerdown", startPan);
mapFrame.addEventListener("pointermove", movePan);
mapFrame.addEventListener("pointerup", endPan);
mapFrame.addEventListener("pointercancel", endPan);
mapFrame.addEventListener("click", handleMapClick);
mapFrame.addEventListener("wheel", handleWheelZoom, { passive: false });
window.addEventListener("resize", updateCameraTransform);
empireBtn.addEventListener("click", showEmpireModal);
logBtn.addEventListener("click", showLogModal);
if (helpBtn) helpBtn.addEventListener("click", showHelpModal);
closeModalBtn.addEventListener("click", () => modal.close());

const saved = loadGame();
const savedName = saved?.playerName || readSavedName();
playerNameInput.value = savedName || "Ricky";
requestAnimationFrame(frame);
