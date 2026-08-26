(function () {
  const WORLD_API = "/api/world-data";
  const ECONOMY_API = "/api/economy-data";
  const MAP_IMAGE_API = "/api/map-image";
  const SIDES = ["north", "south", "east", "west"];
  const OPPOSITE_SIDE = { north: "south", south: "north", east: "west", west: "east" };
  const WORLD_GRID_CELL = 128;
  const MIN_REGION_ZOOM = 0.15;
  const MAX_REGION_ZOOM = 3;
  const MAP_ASPECT_WIDTH = 4;
  const MAP_ASPECT_HEIGHT = 3;
  const MAP_ASPECT_RATIO = MAP_ASPECT_WIDTH / MAP_ASPECT_HEIGHT;
  const MAP_ASPECT_TOLERANCE = 0.02;
  const DEFAULT_MAP_WIDTH = 2048;
  const DEFAULT_MAP_HEIGHT = 1536;
  const DEFAULT_STRONGHOLD_VISUAL_SIZE = 154;
  const DEFAULT_CAMP_VISUAL_SIZE = 132;
  const CROWN_CITADEL_VISUAL_SIZE = 260;
  const CITY_UI_LABEL_WIDTH = 190;
  const CITY_UI_LABEL_HEIGHT = 64;
  const CITY_UI_LABEL_OFFSET = 58;
  const MAP_SWITCH_ARROW_ICON_SRC = "/assets/map-switch-arrow.png?v=20260812-global-hud-pass-3g-r1";
  const CITY_UI_MARKER_FOOTPRINT = 72;
  const CITY_EDITOR_MAX_GAME_SCALE = 1;
  const CITY_VICTORY_POINT_FORMULA = Object.freeze({
    base: 6,
    perLevel: 4,
    exponent: 1.35,
    exponentScale: 2,
  });
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
  const CITY_EDITOR_OWNER_UI = Object.freeze({
    player: { key: "player", label: "You", flag: "\u25C6" },
    player2: { key: "player2", label: "Player 2", flag: "\u2161" },
    player3: { key: "player3", label: "Player 3", flag: "\u2162" },
    enemy: { key: "enemy", label: "Enemy", flag: "\u265C" },
    neutral: { key: "neutral", label: "Neutral", flag: "\u2022" },
  });
  const CITY_CASTLE_ASSETS = Object.freeze({
    1: "assets/castles/shack.png?v=20260704-firebase-castles",
    2: "assets/castles/fort.png?v=20260704-firebase-castles",
    3: "assets/castles/keep.png?v=20260704-firebase-castles",
    4: "assets/castles/castle.png?v=20260704-firebase-castles",
    5: "assets/castles/city.png?v=20260704-firebase-castles",
  });
  const HERO_REWARD_EARLY_END_LEVEL = 50;
  const HERO_REWARD_MID_END_LEVEL = 100;
  const ECONOMY_CITY_PREVIEW_LEVELS = [1, 25, 50, 75, 100, 125, 150];
  const ECONOMY_FORTIFICATION_PREVIEW_LEVELS = [1, 25, 50, 75, 100, 150, 200, 500];
  const ECONOMY_REWARD_PREVIEW_LEVELS = [2, 10, 25, 50, 51, 75, 100, 101, 125, 150, 200];
  const CAMP_UI_FOOTPRINT_PAD = { x: 34, top: 30, bottom: 18 };
  const STRONGHOLD_UI_FOOTPRINT_PAD = { x: 58, top: 78, bottom: 42 };
  const CROWN_UI_FOOTPRINT_PAD = { x: 84, top: 116, bottom: 56 };
  const REGION_TYPES = ["starter", "midgame", "endgame", "activity", "crownlands_main"];
  const EDGE_TYPES = ["road", "valley", "pass", "river_crossing", "open_field", "forest_break", "bridge"];
  const CAMP_TYPES = ["gold", "troops", "items", "deed"];
  const STRONGHOLD_TYPES = [
    "crown_citadel",
    "gold_stronghold",
    "troop_stronghold",
    "defense_stronghold",
    "march_speed_stronghold",
    "upgrade_discount_stronghold",
  ];
  const STRONGHOLD_DEFAULTS = {
    crown_citadel: {
      name: "Crown Citadel",
      bonusType: "crownDominion",
      bonusAmount: 10,
      level: 100,
      troops: 50000000,
      artSrc: "assets/crown-citadel.png?v=20260703-crown-citadel-art",
      size: CROWN_CITADEL_VISUAL_SIZE,
    },
    gold_stronghold: {
      name: "Aurum Keep",
      bonusType: "goldProduction",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/gold-stronghold.png",
      size: DEFAULT_STRONGHOLD_VISUAL_SIZE,
    },
    troop_stronghold: {
      name: "Greybanner Hold",
      bonusType: "troopProduction",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/training-stronghold.png",
      size: DEFAULT_STRONGHOLD_VISUAL_SIZE,
    },
    defense_stronghold: {
      name: "Ironwatch",
      bonusType: "cityDefense",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/defense-stronghold.png",
      size: DEFAULT_STRONGHOLD_VISUAL_SIZE,
    },
    march_speed_stronghold: {
      name: "Swiftgate",
      bonusType: "marchSpeed",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/speed-stronghold.png",
      size: DEFAULT_STRONGHOLD_VISUAL_SIZE,
    },
    upgrade_discount_stronghold: {
      name: "Upgrade Discount Stronghold",
      bonusType: "upgradeCostReduction",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/gold-stronghold.png",
      size: DEFAULT_STRONGHOLD_VISUAL_SIZE,
    },
  };
  const CAMP_DEFAULTS = {
    gold: {
      name: "Gold Camp",
      artSrc: "assets/camps/gold.png",
      size: DEFAULT_CAMP_VISUAL_SIZE,
    },
    troops: {
      name: "Warband Camp",
      artSrc: "assets/camps/troops.png",
      size: DEFAULT_CAMP_VISUAL_SIZE,
    },
    items: {
      name: "Relic Camp",
      artSrc: "assets/camps/items.png",
      size: DEFAULT_CAMP_VISUAL_SIZE,
    },
    deed: {
      name: "Deed Camp",
      artSrc: "assets/camps/deed.png",
      size: DEFAULT_CAMP_VISUAL_SIZE,
    },
  };
  const CAMP_REWARD_DEFAULTS = {
    gold: [
      { minimumReward: 20000, productionHours: 0.5 },
      { minimumReward: 40000, productionHours: 1 },
      { minimumReward: 60000, productionHours: 1.5 },
      { minimumReward: 80000, productionHours: 2 },
    ],
    troops: [
      { minimumReward: 10000, productionHours: 0.5 },
      { minimumReward: 20000, productionHours: 1 },
      { minimumReward: 30000, productionHours: 1.5 },
      { minimumReward: 40000, productionHours: 2 },
    ],
  };

  function hashEditorCityName(value = "") {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function getEditorCityNameIndex(cityId = "", fallbackIndex = 0) {
    const match = String(cityId || "").match(/_(\d+)$/);
    if (match) return Math.max(0, Math.floor(Number(match[1]) || 1) - 1);
    return Math.max(0, Math.floor(Number(fallbackIndex) || 0));
  }

  function generateEditorCityName(regionId = "", index = 0, cityId = "") {
    const normalizedRegionId = String(regionId || "center").trim().toLowerCase() || "center";
    const cityIndex = getEditorCityNameIndex(cityId, index);
    const prefixes = [...new Set([
      ...MEDIEVAL_CITY_PREFIXES,
      ...(MEDIEVAL_REGION_PREFIXES[normalizedRegionId] || []),
    ])];
    const comboCount = prefixes.length * MEDIEVAL_CITY_SUFFIXES.length;
    const offset = hashEditorCityName(`medieval-city:${normalizedRegionId}`) % comboCount;
    const comboIndex = (cityIndex * 487 + offset) % comboCount;
    const prefix = prefixes[comboIndex % prefixes.length];
    const suffix = MEDIEVAL_CITY_SUFFIXES[
      Math.floor(comboIndex / prefixes.length) % MEDIEVAL_CITY_SUFFIXES.length
    ];
    const title = MEDIEVAL_CITY_TITLES[
      (cityIndex * 191 + offset) % MEDIEVAL_CITY_TITLES.length
    ];
    return cityIndex % 5 === 0 ? `${prefix}${suffix} ${title}` : `${prefix}${suffix}`;
  }

  function getEditorCanonicalCityName(value = "", regionId = "", index = 0, cityId = "") {
    const configuredName = String(value || "").trim();
    const isPlaceholder = !configuredName
      || /\d/.test(configuredName)
      || /^city(?:\s+|[-_])\d+$/i.test(configuredName)
      || configuredName.toLowerCase() === String(cityId || "").trim().toLowerCase();
    return isPlaceholder
      ? generateEditorCityName(regionId, index, cityId)
      : configuredName.slice(0, 80);
  }
  const SHOP_ITEM_EDITOR = [
    { id: "shield_12h", label: "Royal Peace Shield", detail: "City protection. No percentage bonus.", duration: true },
    { id: "war_drums_30m", label: "War Drums", detail: "Troop production bonus.", duration: true, bonus: true },
    { id: "royal_tax_decree_30m", label: "Royal Tax Decree", detail: "Gold production bonus.", duration: true, bonus: true },
    { id: "veil_of_silence_30m", label: "Veil of Silence", detail: "Blocks enemy scouting. No percentage bonus.", duration: true },
    { id: "swift_march_order", label: "Swift March Order", detail: "Single-use march effect. No percentage bonus." },
    { id: "recall_horn", label: "Recall Horn", detail: "Single-use recall. No percentage bonus." },
  ];
  const SKILL_EDITOR = [
    { id: "swordmastery", label: "Swordmastery" },
    { id: "shieldwallDiscipline", label: "Shieldwall Discipline" },
    { id: "stoneworks", label: "Stoneworks" },
    { id: "taxStewardship", label: "Tax Stewardship" },
    { id: "royalGranaries", label: "Royal Granaries" },
    { id: "guildCharters", label: "Guild Charters" },
    { id: "marchOrders", label: "March Orders" },
    { id: "fieldMedics", label: "Field Medics" },
  ];

  function readVisualSize(value, fallback) {
    const parsed = Math.floor(Number(value));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const fallbackSize = Math.floor(Number(fallback));
    return Number.isFinite(fallbackSize) && fallbackSize > 0 ? fallbackSize : 1;
  }

  const elements = {
    worldModeBtn: document.getElementById("worldModeBtn"),
    regionModeBtn: document.getElementById("regionModeBtn"),
    economyModeBtn: document.getElementById("economyModeBtn"),
    gameUiModeBtn: document.getElementById("gameUiModeBtn"),
    editorBody: document.getElementById("editorBody"),
    addRegionBtn: document.getElementById("addRegionBtn"),
    addCityBtn: document.getElementById("addCityBtn"),
    addStrongholdBtn: document.getElementById("addStrongholdBtn"),
    addCampBtn: document.getElementById("addCampBtn"),
    addEdgeBtn: document.getElementById("addEdgeBtn"),
    deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
    validateBtn: document.getElementById("validateBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    saveBtn: document.getElementById("saveBtn"),
    uploadRegionImageBtn: document.getElementById("uploadRegionImageBtn"),
    toggleGridBtn: document.getElementById("toggleGridBtn"),
    toggleCitiesBtn: document.getElementById("toggleCitiesBtn"),
    toggleStrongholdsBtn: document.getElementById("toggleStrongholdsBtn"),
    toggleCampsBtn: document.getElementById("toggleCampsBtn"),
    toggleConnectionsBtn: document.getElementById("toggleConnectionsBtn"),
    toggleUiBoundsBtn: document.getElementById("toggleUiBoundsBtn"),
    importFileInput: document.getElementById("importFileInput"),
    regionImageFileInput: document.getElementById("regionImageFileInput"),
    strongholdTypeSelect: document.getElementById("strongholdTypeSelect"),
    campTypeSelect: document.getElementById("campTypeSelect"),
    edgeTypeSelect: document.getElementById("edgeTypeSelect"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomLabel: document.getElementById("zoomLabel"),
    workspaceKicker: document.getElementById("workspaceKicker"),
    workspaceTitle: document.getElementById("workspaceTitle"),
    worldView: document.getElementById("worldView"),
    worldGrid: document.getElementById("worldGrid"),
    worldConnectionLayer: document.getElementById("worldConnectionLayer"),
    regionView: document.getElementById("regionView"),
    economyView: document.getElementById("economyView"),
    gameUiView: document.getElementById("gameUiView"),
    economySections: document.getElementById("economySections"),
    contextTools: document.getElementById("contextTools"),
    regionViewport: document.getElementById("regionViewport"),
    regionCanvas: document.getElementById("regionCanvas"),
    regionImage: document.getElementById("regionImage"),
    markerLayer: document.getElementById("markerLayer"),
    edgeLayer: document.getElementById("edgeLayer"),
    worldIdInput: document.getElementById("worldIdInput"),
    worldNameInput: document.getElementById("worldNameInput"),
    worldNameLabel: document.getElementById("worldNameLabel"),
    selectionTitle: document.getElementById("selectionTitle"),
    selectionForm: document.getElementById("selectionForm"),
    validationSummary: document.getElementById("validationSummary"),
    validationList: document.getElementById("validationList"),
    countSummary: document.getElementById("countSummary"),
    regionCountStat: document.getElementById("regionCountStat"),
    cityCountStat: document.getElementById("cityCountStat"),
    strongholdCountStat: document.getElementById("strongholdCountStat"),
    campCountStat: document.getElementById("campCountStat"),
    edgeCountStat: document.getElementById("edgeCountStat"),
    statusBar: document.getElementById("statusBar"),
  };

  const state = {
    layout: null,
    regions: [],
    economy: null,
    editorMode: "world",
    tool: "select",
    activeRegionId: "",
    selected: null,
    zoom: 0.5,
    dirty: false,
    validation: [],
    toggles: {
      grid: true,
      cities: true,
      strongholds: true,
      camps: true,
      connections: true,
      uiBounds: true,
    },
    draggingMarker: null,
    draggingEdge: null,
    draggingEdgeArrow: null,
    draggingRegion: null,
    panning: null,
    imagePreviewBusters: {},
    skipNextCanvasClick: false,
    skipNextWorldClick: false,
    lastRegionClick: null,
    edgeArrowOverrides: {},
  };

  function setStatus(message, kind = "") {
    elements.statusBar.textContent = message;
    elements.statusBar.dataset.kind = kind;
  }

  function slugify(value, fallback = "item") {
    return String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback;
  }

  function titleFromId(value) {
    return String(value || "region")
      .split(/[-_]+/)
      .filter(Boolean)
      .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ") || "Region";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isFourThreeDimensions(width, height) {
    const safeWidth = Number(width) || 0;
    const safeHeight = Number(height) || 0;
    if (safeWidth <= 0 || safeHeight <= 0) return false;
    return Math.abs((safeWidth / safeHeight) - MAP_ASPECT_RATIO) <= MAP_ASPECT_TOLERANCE;
  }

  function cleanMapDimensions(width, height) {
    const safeWidth = Math.max(256, Math.round(Number(width) || DEFAULT_MAP_WIDTH));
    const safeHeight = Math.max(256, Math.round(Number(height) || DEFAULT_MAP_HEIGHT));
    if (isFourThreeDimensions(safeWidth, safeHeight)) {
      return { width: safeWidth, height: safeHeight };
    }
    return { width: DEFAULT_MAP_WIDTH, height: DEFAULT_MAP_HEIGHT };
  }

  function syncRegionAspectFromField(region, field) {
    if (!region) return;
    if (field === "height") {
      region.height = Math.max(256, Math.round(Number(region.height) || DEFAULT_MAP_HEIGHT));
      region.width = Math.max(256, Math.round(region.height * MAP_ASPECT_RATIO));
      return;
    }
    region.width = Math.max(256, Math.round(Number(region.width) || DEFAULT_MAP_WIDTH));
    region.height = Math.max(256, Math.round(region.width / MAP_ASPECT_RATIO));
  }

  function roundNorm(value) {
    return Math.round(clamp(Number(value) || 0, 0, 1) * 1000) / 1000;
  }

  function getEdgeCenter(edge) {
    const start = Number(edge?.start) || 0;
    const end = Number(edge?.end) || start;
    return roundNorm((Math.min(start, end) + Math.max(start, end)) / 2);
  }

  function getDefaultEdgeArrowPoint(edge, side = edge?.side || "north") {
    const center = getEdgeCenter(edge);
    const inset = 0.12;
    if (side === "north") return { xNorm: center, yNorm: inset };
    if (side === "south") return { xNorm: center, yNorm: 1 - inset };
    if (side === "west") return { xNorm: inset, yNorm: center };
    return { xNorm: 1 - inset, yNorm: center };
  }

  function getEdgeArrowPoint(edge) {
    const fallback = getDefaultEdgeArrowPoint(edge, edge?.side);
    return {
      xNorm: Number.isFinite(Number(edge?.arrowXNorm)) ? roundNorm(edge.arrowXNorm) : fallback.xNorm,
      yNorm: Number.isFinite(Number(edge?.arrowYNorm)) ? roundNorm(edge.arrowYNorm) : fallback.yNorm,
    };
  }

  function setDefaultEdgeArrowPosition(edge, side = edge?.side || "north") {
    const point = getDefaultEdgeArrowPoint(edge, side);
    edge.arrowXNorm = point.xNorm;
    edge.arrowYNorm = point.yNorm;
  }

  function getEdgeArrowOverrideKey(regionId, side, edge) {
    return `${slugify(regionId, "region")}::${side}::${slugify(edge?.id, "edge")}`;
  }

  function setEdgeArrowPosition(region, side, edge, point) {
    if (!region || !edge || !point) return;
    const nextPoint = {
      xNorm: roundNorm(point.xNorm),
      yNorm: roundNorm(point.yNorm),
    };
    edge.arrowXNorm = nextPoint.xNorm;
    edge.arrowYNorm = nextPoint.yNorm;
    state.edgeArrowOverrides[getEdgeArrowOverrideKey(region.id, side, edge)] = nextPoint;
  }

  function applyEdgeArrowOverrides(regions = state.regions) {
    regions.forEach(region => {
      SIDES.forEach(side => {
        (region.edgeConnections[side] || []).forEach(edge => {
          const override = state.edgeArrowOverrides[getEdgeArrowOverrideKey(region.id, side, edge)];
          if (!override) return;
          edge.arrowXNorm = override.xNorm;
          edge.arrowYNorm = override.yNorm;
        });
      });
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  function resolveAssetPath(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
  }

  function appendPreviewBust(src, buster) {
    if (!src || !buster || /^(data:|blob:)/i.test(src)) return src;
    return `${src}${src.includes("?") ? "&" : "?"}editorPreview=${encodeURIComponent(buster)}`;
  }

  function resolveRegionPreviewPath(region) {
    return appendPreviewBust(resolveAssetPath(region?.imagePath), state.imagePreviewBusters[region?.id]);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function currentRegion() {
    return getRegion(state.activeRegionId) || state.regions[0] || null;
  }

  function getRegion(regionId) {
    const id = slugify(regionId, "");
    return state.regions.find(region => region.id === id) || null;
  }

  function getRegionSummary(region) {
    const dimensions = cleanMapDimensions(region.width, region.height);
    return {
      id: region.id,
      name: region.name,
      type: region.type,
      gridX: Math.round(Number(region.gridX) || 0),
      gridY: Math.round(Number(region.gridY) || 0),
      width: dimensions.width,
      height: dimensions.height,
      imagePath: region.imagePath || "",
      thumbnailPath: region.thumbnailPath || "",
      cityCapacity: Math.max(0, Math.floor(Number(region.cityCapacity) || 0)),
      regionPath: region.regionPath || `assets/worlds/world_01/regions/${region.id}.json`,
    };
  }

  function normalizeEdgeConnections(edgeConnections = {}) {
    return SIDES.reduce((result, side) => {
      result[side] = Array.isArray(edgeConnections[side])
        ? edgeConnections[side].map((zone, index) => {
            const edge = {
              id: slugify(zone.id, `${side}_connection_${index + 1}`),
              side,
              start: roundNorm(Math.min(Number(zone.start) || 0, Number(zone.end) || 1)),
              end: roundNorm(Math.max(Number(zone.start) || 0, Number(zone.end) || 1)),
              type: EDGE_TYPES.includes(zone.type) ? zone.type : "road",
              connectsToRegionId: slugify(zone.connectsToRegionId || "", ""),
              intentionalOuter: Boolean(zone.intentionalOuter),
              notes: String(zone.notes || ""),
            };
            edge.arrowXNorm = Number.isFinite(Number(zone.arrowXNorm)) ? roundNorm(zone.arrowXNorm) : getDefaultEdgeArrowPoint(edge, side).xNorm;
            edge.arrowYNorm = Number.isFinite(Number(zone.arrowYNorm)) ? roundNorm(zone.arrowYNorm) : getDefaultEdgeArrowPoint(edge, side).yNorm;
            return edge;
          })
        : [];
      return result;
    }, {});
  }

  function normalizeRegion(rawRegion = {}, index = 0) {
    const id = slugify(rawRegion.id, `region_${index + 1}`);
    const type = REGION_TYPES.includes(rawRegion.type) ? rawRegion.type : (id === "center" ? "crownlands_main" : "starter");
    const dimensions = cleanMapDimensions(rawRegion.width || rawRegion.imageWidth, rawRegion.height || rawRegion.imageHeight);
    const region = {
      id,
      name: String(rawRegion.name || rawRegion.label || titleFromId(id)),
      type,
      gridX: Math.round(Number(rawRegion.gridX) || 0),
      gridY: Math.round(Number(rawRegion.gridY) || 0),
      width: dimensions.width,
      height: dimensions.height,
      imagePath: String(rawRegion.imagePath || rawRegion.imageSrc || ""),
      thumbnailPath: String(rawRegion.thumbnailPath || rawRegion.thumbnailSrc || ""),
      cityCapacity: Math.max(0, Math.floor(Number(rawRegion.cityCapacity) || (type === "crownlands_main" ? 100 : 50))),
      cities: [],
      strongholds: [],
      camps: [],
      edgeConnections: normalizeEdgeConnections(rawRegion.edgeConnections),
      notes: String(rawRegion.notes || ""),
    };
    if (rawRegion.compatRegion) region.compatRegion = rawRegion.compatRegion;
    region.regionPath = rawRegion.regionPath || `assets/worlds/world_01/regions/${region.id}.json`;
    region.cities = (Array.isArray(rawRegion.cities) ? rawRegion.cities : []).map((city, cityIndex) => normalizeCity(city, cityIndex, region));
    region.strongholds = (Array.isArray(rawRegion.strongholds) ? rawRegion.strongholds : []).map((stronghold, strongholdIndex) => normalizeStronghold(stronghold, strongholdIndex, region));
    region.camps = (Array.isArray(rawRegion.camps) ? rawRegion.camps : []).map((camp, campIndex) => normalizeCamp(camp, campIndex, region));
    return region;
  }

  function normalizeCity(city = {}, index = 0, region) {
    const id = slugify(city.id, `${region.id}_city_${String(index + 1).padStart(3, "0")}`);
    return {
      id,
      name: getEditorCanonicalCityName(city.name, region.id, index, id),
      regionId: region.id,
      xNorm: roundNorm(city.xNorm ?? ((Number(city.x) || 0) / region.width)),
      yNorm: roundNorm(city.yNorm ?? ((Number(city.y) || 0) / region.height)),
      level: Math.max(1, Math.floor(Number(city.level) || 1)),
      owner: String(city.owner || "neutral"),
      startType: String(city.startType || "neutral"),
      troops: Math.max(0, Math.floor(Number(city.troops) || 10)),
    };
  }

  function normalizeStronghold(stronghold = {}, index = 0, region) {
    const strongholdType = STRONGHOLD_TYPES.includes(stronghold.strongholdType || stronghold.type)
      ? stronghold.strongholdType || stronghold.type
      : (region.type === "crownlands_main" ? "crown_citadel" : "gold_stronghold");
    const defaults = STRONGHOLD_DEFAULTS[strongholdType] || STRONGHOLD_DEFAULTS.gold_stronghold;
    return {
      id: slugify(stronghold.id, `${region.id}_${strongholdType}_${index + 1}`),
      name: String(stronghold.name || defaults.name),
      regionId: region.id,
      xNorm: roundNorm(stronghold.xNorm ?? ((Number(stronghold.x) || 0) / region.width)),
      yNorm: roundNorm(stronghold.yNorm ?? ((Number(stronghold.y) || 0) / region.height)),
      strongholdType,
      bonusType: String(stronghold.bonusType || stronghold.bonus || defaults.bonusType),
      bonusAmount: Math.max(0, Math.floor(Number(stronghold.bonusAmount ?? stronghold.bonusPercent) || defaults.bonusAmount)),
      startingOwner: String(stronghold.startingOwner || stronghold.owner || "neutral"),
      level: Math.max(1, Math.floor(Number(stronghold.level) || defaults.level)),
      troops: Math.max(0, Math.floor(Number(stronghold.troops ?? stronghold.startTroops) || defaults.troops)),
      artSrc: String(stronghold.artSrc || defaults.artSrc),
      size: readVisualSize(stronghold.size, defaults.size),
      flipX: Boolean(stronghold.flipX),
      notes: String(stronghold.notes || ""),
    };
  }

  function normalizeCamp(camp = {}, index = 0, region) {
    const campType = CAMP_TYPES.includes(camp.campType || camp.type)
      ? camp.campType || camp.type
      : "gold";
    const defaults = CAMP_DEFAULTS[campType] || CAMP_DEFAULTS.gold;
    const normalized = {
      id: slugify(camp.id, `${region.id}_${campType}_camp_${index + 1}`),
      name: String(camp.name || defaults.name),
      regionId: region.id,
      xNorm: roundNorm(camp.xNorm ?? ((Number(camp.x) || 0) / region.width)),
      yNorm: roundNorm(camp.yNorm ?? ((Number(camp.y) || 0) / region.height)),
      campType,
      artSrc: String(camp.artSrc || defaults.artSrc),
      size: readVisualSize(camp.size, defaults.size),
      flipX: Boolean(camp.flipX),
      notes: String(camp.notes || ""),
    };
    if (campType === "gold" || campType === "troops") {
      const fallback = CAMP_REWARD_DEFAULTS[campType];
      const source = Array.isArray(camp.rewardSchedule) && camp.rewardSchedule.length
        ? camp.rewardSchedule
        : fallback;
      normalized.rewardSchedule = source.slice(0, 12).map(entry => ({
        minimumReward: Math.max(0, Math.floor(Number(entry?.minimumReward) || 0)),
        productionHours: Math.max(0.01, Number(entry?.productionHours) || 1),
      }));
    }
    if (campType === "items") {
      const rawMaxDailyRewards = Number(camp.maxDailyRewards);
      normalized.maxDailyRewards = Math.max(
        0,
        Math.floor(Number.isFinite(rawMaxDailyRewards) ? rawMaxDailyRewards : 2)
      );
    }
    return normalized;
  }

  function normalizeBundle(data = {}) {
    const rawLayout = data.layout || {};
    const rawRegions = Array.isArray(data.regions) ? data.regions : [];
    const regions = rawRegions.map(normalizeRegion);
    const layout = {
      worldId: slugify(rawLayout.worldId, "world_01"),
      worldName: String(rawLayout.worldName || "Crownlands World 01"),
      schemaVersion: Math.max(1, Math.floor(Number(rawLayout.schemaVersion) || 1)),
      updatedAt: rawLayout.updatedAt || new Date().toISOString(),
      globalSettings: {
        defaultMapWidth: cleanMapDimensions(rawLayout.globalSettings?.defaultMapWidth, rawLayout.globalSettings?.defaultMapHeight).width,
        defaultMapHeight: cleanMapDimensions(rawLayout.globalSettings?.defaultMapWidth, rawLayout.globalSettings?.defaultMapHeight).height,
        minimumCitySpacing: Number(rawLayout.globalSettings?.minimumCitySpacing) || 0.045,
        worldWidth: Math.max(1000, Math.floor(Number(rawLayout.globalSettings?.worldWidth) || 10000)),
        worldHeight: Math.max(1000, Math.floor(Number(rawLayout.globalSettings?.worldHeight) || 7600)),
        gridCellWorldSize: Math.max(500, Math.floor(Number(rawLayout.globalSettings?.gridCellWorldSize) || 2300)),
      },
      regions: [],
    };
    layout.regions = regions.map(getRegionSummary);
    return { layout, regions };
  }

  function createFallbackWorld() {
    return normalizeBundle({
      layout: {
        worldId: "world_01",
        worldName: "Crownlands World 01",
        globalSettings: {},
      },
      regions: [
        { id: "center", name: "Crownlands Heart", type: "crownlands_main", gridX: 0, gridY: 0, width: DEFAULT_MAP_WIDTH, height: DEFAULT_MAP_HEIGHT, imagePath: "assets/center-island.webp", cityCapacity: 100 },
        { id: "west", name: "West Marches", type: "starter", gridX: -1, gridY: 0, width: DEFAULT_MAP_WIDTH, height: DEFAULT_MAP_HEIGHT, imagePath: "assets/west-island.webp", cityCapacity: 50 },
      ],
    });
  }

  async function loadWorldData() {
    try {
      const response = await fetch(WORLD_API, { cache: "no-store" });
      if (!response.ok) throw new Error(`World data failed: ${response.status}`);
      const data = normalizeBundle(await response.json());
      state.layout = data.layout;
      state.regions = data.regions;
      state.activeRegionId = state.regions[0]?.id || "";
      setStatus("Loaded world data.");
    } catch (error) {
      const fallback = createFallbackWorld();
      state.layout = fallback.layout;
      state.regions = fallback.regions;
      state.activeRegionId = state.regions[0]?.id || "";
      setStatus(`Loaded fallback world data. ${error.message || error}`);
    }
  }

  async function loadEconomyData() {
    const response = await fetch(ECONOMY_API, { cache: "no-store" });
    if (!response.ok) throw new Error(`Economy data failed: ${response.status}`);
    const payload = await response.json();
    state.economy = payload.config;
  }

  function buildSavePayload() {
    materializeEdgeArrowPositions();
    state.layout.regions = state.regions.map(getRegionSummary);
    state.layout.updatedAt = new Date().toISOString();
    return {
      layout: deepClone(state.layout),
      regions: deepClone(state.regions),
    };
  }

  function countCamps(regions = []) {
    return regions.reduce((total, region) => total + (Array.isArray(region.camps) ? region.camps.length : 0), 0);
  }

  function materializeEdgeArrowPositions(regions = state.regions) {
    applyEdgeArrowOverrides(regions);
    regions.forEach(region => {
      SIDES.forEach(side => {
        (region.edgeConnections[side] || []).forEach(edge => {
          edge.side = side;
          const point = getEdgeArrowPoint(edge);
          edge.arrowXNorm = point.xNorm;
          edge.arrowYNorm = point.yNorm;
        });
      });
    });
  }

  async function saveWorldData(options = {}) {
    const payload = buildSavePayload();
    const expectedCampCount = countCamps(payload.regions);
    const response = await fetch(WORLD_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Save failed: ${response.status}`);
    }
    const data = normalizeBundle(await response.json());
    const savedCampCount = countCamps(data.regions);
    if (savedCampCount < expectedCampCount) {
      throw new Error(`Save response only returned ${savedCampCount} of ${expectedCampCount} camps. Keep this editor tab open, restart the local editor server with .\\tools\\start-editor.ps1, then click Save to Game again. If you need to reload first, use Export JSON so your unsaved camps are not lost.`);
    }
    state.layout = data.layout;
    state.regions = data.regions;
    applyEdgeArrowOverrides(state.regions);
    state.dirty = false;
    setStatus("Saved JSON world files and game compatibility data.");
    if (options.renderAfter !== false) render();
  }

  async function saveEconomyData(options = {}) {
    if (!state.economy) throw new Error("Economy configuration is not loaded.");
    const response = await fetch(ECONOMY_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: state.economy }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Economy save failed: ${response.status}`);
    }
    const payload = await response.json();
    state.economy = payload.config;
    state.dirty = false;
    if (options.renderAfter !== false) render();
  }

  async function saveAllData() {
    elements.saveBtn.disabled = true;
    setStatus("Saving map, economy, and HUD layout configuration...", "busy");
    try {
      const results = await Promise.allSettled([
        saveWorldData({ renderAfter: false }),
        saveEconomyData({ renderAfter: false }),
        window.CrownlandsHudEditor.save(),
      ]);
      const labels = ["Map", "Economy", "HUD layout"];
      const failures = results.map((result, index) => result.status === "rejected" ? `${labels[index]}: ${result.reason?.message || result.reason}` : "").filter(Boolean);
      if (failures.length) throw new Error(`Some data did not save. ${failures.join(" | ")}`);
      state.dirty = false;
      setStatus("Saved map, browser/Firebase economy, and responsive HUD layouts.", "success");
      render();
    } finally {
      elements.saveBtn.disabled = false;
    }
  }

  function markDirty(message = "", kind = "") {
    state.dirty = true;
    if (message) setStatus(message, kind);
  }

  function setEditorMode(mode) {
    state.editorMode = ["world", "region", "economy", "gameui"].includes(mode) ? mode : "world";
    state.tool = "select";
    window.CrownlandsHudEditor?.setActive(state.editorMode === "gameui");
    render();
  }

  function setTool(tool) {
    if (tool !== "select") state.editorMode = "region";
    state.tool = tool;
    if (!currentRegion() && state.regions[0]) state.activeRegionId = state.regions[0].id;
    setStatus(tool === "select" ? "Select mode." : `${titleFromId(tool)} placement mode.`);
    render();
  }

  function selectRegion(regionId) {
    setSelectedRegion(regionId);
    render();
  }

  function editRegion(regionId) {
    const region = getRegion(regionId);
    if (!region) return;
    state.activeRegionId = region.id;
    state.selected = { kind: "region", regionId: region.id };
    state.editorMode = "region";
    state.tool = "select";
    state.lastRegionClick = null;
    setStatus(`Editing ${region.name}.`);
    render();
  }

  function setSelectedRegion(regionId) {
    state.activeRegionId = regionId;
    state.selected = { kind: "region", regionId };
  }

  function selectGridCell(gridX, gridY) {
    state.editorMode = "world";
    state.tool = "select";
    state.selected = {
      kind: "gridCell",
      gridX: Math.round(Number(gridX) || 0),
      gridY: Math.round(Number(gridY) || 0),
    };
    setStatus(`Selected empty grid cell ${state.selected.gridX}, ${state.selected.gridY}.`);
    render();
  }

  function selectCity(regionId, index) {
    state.activeRegionId = regionId;
    state.selected = { kind: "city", regionId, index };
    render();
  }

  function selectStronghold(regionId, index) {
    state.activeRegionId = regionId;
    state.selected = { kind: "stronghold", regionId, index };
    render();
  }

  function selectCamp(regionId, index) {
    state.activeRegionId = regionId;
    state.selected = { kind: "camp", regionId, index };
    render();
  }

  function selectEdge(regionId, side, index) {
    setSelectedEdge(regionId, side, index);
    render();
  }

  function setSelectedEdge(regionId, side, index) {
    state.activeRegionId = regionId;
    state.selected = { kind: "edge", regionId, side, index };
  }

  function getSelectedItem() {
    if (!state.selected) return null;
    if (state.selected.kind === "gridCell") return state.selected;
    const region = getRegion(state.selected.regionId);
    if (!region) return null;
    if (state.selected.kind === "region") return region;
    if (state.selected.kind === "city") return region.cities[state.selected.index] || null;
    if (state.selected.kind === "stronghold") return region.strongholds[state.selected.index] || null;
    if (state.selected.kind === "camp") return region.camps[state.selected.index] || null;
    if (state.selected.kind === "edge") return region.edgeConnections[state.selected.side]?.[state.selected.index] || null;
    return null;
  }

  function render() {
    if (!state.layout) return;
    renderToolbar();
    renderWorldFields();
    renderCounts();
    renderWorkspace();
    renderInspector();
  }

  function renderToolbar() {
    elements.worldModeBtn.classList.toggle("active", state.editorMode === "world");
    elements.regionModeBtn.classList.toggle("active", state.editorMode === "region");
    elements.economyModeBtn.classList.toggle("active", state.editorMode === "economy");
    elements.gameUiModeBtn.classList.toggle("active", state.editorMode === "gameui");
    elements.editorBody.classList.toggle("economy-mode", state.editorMode === "economy");
    elements.editorBody.classList.toggle("game-ui-mode", state.editorMode === "gameui");
    elements.contextTools.classList.toggle("economy-mode", state.editorMode === "economy");
    document.querySelector(".editor-toolbar")?.classList.toggle("economy-mode", state.editorMode === "economy");
    document.querySelector(".editor-toolbar")?.classList.toggle("game-ui-mode", state.editorMode === "gameui");
    elements.addCityBtn.classList.toggle("active", state.tool === "city");
    elements.addStrongholdBtn.classList.toggle("active", state.tool === "stronghold");
    elements.addCampBtn.classList.toggle("active", state.tool === "camp");
    elements.addEdgeBtn.classList.toggle("active", state.tool === "edge");
    elements.addRegionBtn.classList.toggle("active", state.selected?.kind === "gridCell");
    elements.toggleGridBtn.classList.toggle("active", state.toggles.grid);
    elements.toggleCitiesBtn.classList.toggle("active", state.toggles.cities);
    elements.toggleStrongholdsBtn.classList.toggle("active", state.toggles.strongholds);
    elements.toggleCampsBtn.classList.toggle("active", state.toggles.camps);
    elements.toggleConnectionsBtn.classList.toggle("active", state.toggles.connections);
    elements.toggleUiBoundsBtn.classList.toggle("active", state.toggles.uiBounds);
    elements.deleteSelectedBtn.disabled = !state.selected || state.selected.kind === "gridCell";
    elements.uploadRegionImageBtn.disabled = state.editorMode !== "region" || !currentRegion();
    elements.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function renderWorldFields() {
    if (document.activeElement !== elements.worldIdInput) elements.worldIdInput.value = state.layout.worldId;
    if (document.activeElement !== elements.worldNameInput) elements.worldNameInput.value = state.layout.worldName;
    elements.worldNameLabel.textContent = state.layout.worldName;
  }

  function renderCounts() {
    const cityCount = state.regions.reduce((total, region) => total + region.cities.length, 0);
    const strongholdCount = state.regions.reduce((total, region) => total + region.strongholds.length, 0);
    const campCount = state.regions.reduce((total, region) => total + region.camps.length, 0);
    const edgeCount = state.regions.reduce((total, region) => total + SIDES.reduce((sum, side) => sum + region.edgeConnections[side].length, 0), 0);
    elements.regionCountStat.textContent = String(state.regions.length);
    elements.cityCountStat.textContent = String(cityCount);
    elements.strongholdCountStat.textContent = String(strongholdCount);
    elements.campCountStat.textContent = String(campCount);
    elements.edgeCountStat.textContent = String(edgeCount);
    elements.countSummary.textContent = `${state.regions.length} regions`;
  }

  function renderWorkspace() {
    elements.workspaceKicker.textContent = state.editorMode === "world"
      ? "World Layout"
      : state.editorMode === "region"
        ? "Region Edit"
        : state.editorMode === "economy" ? "Balance Configuration" : "Responsive HUD Layout";
    elements.workspaceTitle.textContent = state.editorMode === "world"
      ? state.layout.worldName
      : state.editorMode === "region"
        ? currentRegion()?.name || "No region selected"
        : state.editorMode === "economy" ? "Crownlands Economy" : "Main Game UI";
    elements.worldView.classList.toggle("hidden", state.editorMode !== "world");
    elements.regionView.classList.toggle("hidden", state.editorMode !== "region");
    elements.economyView.classList.toggle("hidden", state.editorMode !== "economy");
    elements.gameUiView.classList.toggle("hidden", state.editorMode !== "gameui");
    if (state.editorMode === "world") renderWorldGrid();
    else if (state.editorMode === "region") renderRegionEditor();
    else if (state.editorMode === "economy") renderEconomySections();
  }

  function economyNumberInput(path, label, value, options = {}) {
    const step = options.step ?? 1;
    const min = options.min ?? 0;
    const suffix = options.suffix ? `<small>${escapeHtml(options.suffix)}</small>` : "";
    const description = options.description
      ? `<small class="economy-field-description">${escapeHtml(options.description)}</small>`
      : "";
    return `
      <label class="${description ? "economy-explained-field" : ""}">
        <span>${escapeHtml(label)}</span>
        <input data-economy-path="${escapeHtml(path)}" type="number" min="${min}" step="${step}" value="${escapeHtml(value)}" />
        ${suffix}
        ${description}
      </label>
    `;
  }

  function readEconomyNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeEconomyPreviewLevel(value) {
    return Math.max(1, Math.floor(readEconomyNumber(value, 1)));
  }

  function getEconomyPreviewVictoryPoints(level) {
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    const formula = CITY_VICTORY_POINT_FORMULA;
    return Math.floor(
      formula.base
        + normalizedLevel * formula.perLevel
        + Math.pow(normalizedLevel, formula.exponent) * formula.exponentScale
    );
  }

  function getEconomyPreviewGoldCurveUnits(level, economy = state.economy) {
    const config = economy?.cityEconomy || {};
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    const endgameStartLevel = normalizeEconomyPreviewLevel(config.goldEndgameStartLevel);
    const curveLevel = Math.min(normalizedLevel, endgameStartLevel);
    const base = Math.max(0, readEconomyNumber(config.productionVpBase));
    const growth = Math.max(0, readEconomyNumber(config.productionVpGrowth));
    const rawUnits = base * Math.pow(growth, curveLevel - 1);
    if (!Number.isFinite(rawUnits)) return Number.MAX_SAFE_INTEGER;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(rawUnits + 0.000001)));
  }

  function getEconomyPreviewGoldPerHour(level, economy = state.economy) {
    const config = economy?.cityEconomy || {};
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    const endgameStartLevel = normalizeEconomyPreviewLevel(config.goldEndgameStartLevel);
    const goldPerUnit = Math.max(0, readEconomyNumber(config.goldPerProductionVp));
    const endgameGrowth = Math.max(0, readEconomyNumber(config.goldEndgameGrowth));
    const endgameMultiplier = normalizedLevel > endgameStartLevel
      ? Math.pow(endgameGrowth, normalizedLevel - endgameStartLevel)
      : 1;
    const rawGold = getEconomyPreviewGoldCurveUnits(normalizedLevel, economy)
      * goldPerUnit
      * endgameMultiplier;
    if (!Number.isFinite(rawGold)) return Number.MAX_SAFE_INTEGER;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(rawGold)));
  }

  function getEconomyPreviewUpgradeTargetHours(level, economy = state.economy) {
    const config = economy?.cityEconomy || {};
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    const earlyEndLevel = normalizeEconomyPreviewLevel(config.upgradeEarlyEndLevel);
    const midEndLevel = Math.max(earlyEndLevel + 1, normalizeEconomyPreviewLevel(config.upgradeMidEndLevel));
    const earlyStartHours = Math.max(0, readEconomyNumber(config.upgradeEarlyStartHours));
    const earlyEndHours = Math.max(0, readEconomyNumber(config.upgradeEarlyEndHours));
    const midEndHours = Math.max(0, readEconomyNumber(config.upgradeMidEndHours));
    const level150Hours = Math.max(0, readEconomyNumber(config.upgradeLevel150Hours));
    const maximumHours = Math.max(0, readEconomyNumber(config.upgradeMaximumHours));
    if (normalizedLevel <= earlyEndLevel) {
      const progress = (normalizedLevel - 1) / Math.max(1, earlyEndLevel - 1);
      return earlyStartHours
        + (earlyEndHours - earlyStartHours) * Math.pow(progress, 1.35);
    }
    if (normalizedLevel <= midEndLevel) {
      const progress = (normalizedLevel - earlyEndLevel) / Math.max(1, midEndLevel - earlyEndLevel);
      return earlyEndHours
        + (midEndHours - earlyEndHours) * Math.pow(progress, 1.4);
    }
    const endgameProgress = (normalizedLevel - midEndLevel) / Math.max(1, 150 - midEndLevel);
    return Math.min(
      maximumHours,
      midEndHours + (level150Hours - midEndHours) * Math.pow(endgameProgress, 1.5)
    );
  }

  function getEconomyPreviewUpgradeCost(level, economy = state.economy) {
    const rawCost = getEconomyPreviewGoldPerHour(level, economy)
      * getEconomyPreviewUpgradeTargetHours(level, economy);
    if (!Number.isFinite(rawCost)) return Number.MAX_SAFE_INTEGER;
    return Math.max(10, Math.floor(rawCost + 0.000001));
  }

  function getEconomyPreviewBaseWall(level, economy = state.economy) {
    const config = economy?.cityEconomy || {};
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    const levelOffset = normalizedLevel - 1;
    const base = Math.max(0, readEconomyNumber(config.wallDefenseBase, 200));
    const perLevel = Math.max(0, readEconomyNumber(config.wallDefensePerLevel, 28858));
    const walls = base + perLevel * levelOffset;
    if (!Number.isFinite(walls)) return Number.MAX_SAFE_INTEGER;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(walls)));
  }

  function getEconomyPreviewRepairMinutes(level, economy = state.economy) {
    const config = economy?.siegeCombat || {};
    return Math.max(1, Math.round(
      Math.max(1, readEconomyNumber(config.repairBaseMinutes, 15))
        + normalizeEconomyPreviewLevel(level)
          * Math.max(0, readEconomyNumber(config.repairMinutesPerLevel, 0.3))
    ));
  }

  function getEconomyPreviewHeroGoldUpgradeShare(level, economy = state.economy) {
    const config = economy?.levelRewards || {};
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    const earlyShare = Math.max(0, readEconomyNumber(config.goldEarlyUpgradeShare));
    const midShare = Math.max(0, readEconomyNumber(config.goldMidUpgradeShare));
    if (normalizedLevel <= HERO_REWARD_EARLY_END_LEVEL) return earlyShare;
    if (normalizedLevel <= HERO_REWARD_MID_END_LEVEL) {
      const progress = (normalizedLevel - HERO_REWARD_EARLY_END_LEVEL)
        / (HERO_REWARD_MID_END_LEVEL - HERO_REWARD_EARLY_END_LEVEL);
      return earlyShare + (midShare - earlyShare) * progress;
    }
    return Math.max(0, readEconomyNumber(config.goldEndgameUpgradeShare));
  }

  function getEconomyPreviewHeroGoldProductionHours(level, economy = state.economy) {
    const config = economy?.levelRewards || {};
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    const earlyHours = Math.max(0, readEconomyNumber(config.goldEarlyProductionHours));
    const midHours = Math.max(0, readEconomyNumber(config.goldMidProductionHours));
    if (normalizedLevel <= HERO_REWARD_EARLY_END_LEVEL) return earlyHours;
    if (normalizedLevel <= HERO_REWARD_MID_END_LEVEL) {
      const progress = (normalizedLevel - HERO_REWARD_EARLY_END_LEVEL)
        / (HERO_REWARD_MID_END_LEVEL - HERO_REWARD_EARLY_END_LEVEL);
      return earlyHours + (midHours - earlyHours) * progress;
    }
    return Math.max(0, readEconomyNumber(config.goldEndgameProductionHours));
  }

  function getEconomyPreviewHeroGoldFloor(level, economy = state.economy) {
    const config = economy?.levelRewards || {};
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    return Math.max(0, readEconomyNumber(config.goldFloorBase))
      + normalizedLevel * Math.max(0, readEconomyNumber(config.goldFloorPerLevel))
      + Math.pow(
        normalizedLevel,
        Math.max(0, readEconomyNumber(config.goldFloorExponent))
      ) * Math.max(0, readEconomyNumber(config.goldFloorExponentScale));
  }

  function getEconomyPreviewHeroTroopHours(level, economy = state.economy) {
    const config = economy?.levelRewards || {};
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    if (normalizedLevel <= HERO_REWARD_EARLY_END_LEVEL) {
      return Math.max(0, readEconomyNumber(config.troopEarlyBaseHours))
        + normalizedLevel * Math.max(0, readEconomyNumber(config.troopEarlyHoursPerLevel));
    }
    if (normalizedLevel <= HERO_REWARD_MID_END_LEVEL) {
      return Math.max(0, readEconomyNumber(config.troopMidBaseHours))
        + (normalizedLevel - HERO_REWARD_EARLY_END_LEVEL)
          * Math.max(0, readEconomyNumber(config.troopMidHoursPerLevel));
    }
    const endgameHours = Math.max(0, readEconomyNumber(config.troopEndgameBaseHours))
      + (normalizedLevel - HERO_REWARD_MID_END_LEVEL)
        * Math.max(0, readEconomyNumber(config.troopEndgameHoursPerLevel));
    return Math.min(
      Math.max(0, readEconomyNumber(config.troopMaximumHours)),
      endgameHours
    );
  }

  function getEconomyPreviewHeroLevelReward(level, economy = state.economy) {
    const normalizedLevel = normalizeEconomyPreviewLevel(level);
    const referenceCityLevel = Math.max(1, normalizedLevel - 1);
    const goldFloor = getEconomyPreviewHeroGoldFloor(normalizedLevel, economy);
    const goldFromUpgradeShare = getEconomyPreviewUpgradeCost(referenceCityLevel, economy)
      * getEconomyPreviewHeroGoldUpgradeShare(normalizedLevel, economy);
    const goldFromProductionHours = getEconomyPreviewGoldPerHour(normalizedLevel, economy)
      * getEconomyPreviewHeroGoldProductionHours(normalizedLevel, economy);
    const gold = Math.floor(Math.max(
      goldFloor,
      Math.min(goldFromUpgradeShare, goldFromProductionHours)
    ));
    const troopHours = getEconomyPreviewHeroTroopHours(normalizedLevel, economy);
    const baseTroopsPerHour = getEconomyPreviewVictoryPoints(normalizedLevel)
      * Math.max(0, readEconomyNumber(economy?.cityEconomy?.troopsPerVictoryPoint));
    return {
      gold,
      troopHours,
      troops: Math.floor(Math.max(50, baseTroopsPerHour * troopHours)),
    };
  }

  function formatEconomyPreviewNumber(value, maximumFractionDigits = 0) {
    if (!Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(Number(value));
  }

  function buildCityEconomyPreviewRows(economy = state.economy) {
    return ECONOMY_CITY_PREVIEW_LEVELS.map(level => {
      const victoryPoints = getEconomyPreviewVictoryPoints(level);
      const troopsPerHour = victoryPoints
        * Math.max(0, readEconomyNumber(economy?.cityEconomy?.troopsPerVictoryPoint));
      return `
        <tr>
          <td>${level}</td>
          <td>${formatEconomyPreviewNumber(victoryPoints)}</td>
          <td>${formatEconomyPreviewNumber(troopsPerHour)}</td>
          <td>${formatEconomyPreviewNumber(getEconomyPreviewGoldPerHour(level, economy))}</td>
          <td>${formatEconomyPreviewNumber(getEconomyPreviewUpgradeTargetHours(level, economy), 1)} h</td>
          <td>${formatEconomyPreviewNumber(getEconomyPreviewUpgradeCost(level, economy))}</td>
        </tr>
      `;
    }).join("");
  }

  function buildLevelRewardPreviewRows(economy = state.economy) {
    return ECONOMY_REWARD_PREVIEW_LEVELS.map(level => {
      const reward = getEconomyPreviewHeroLevelReward(level, economy);
      return `
        <tr>
          <td>${level}</td>
          <td>${formatEconomyPreviewNumber(reward.gold)}</td>
          <td>${formatEconomyPreviewNumber(reward.troopHours, 1)} h</td>
          <td>${formatEconomyPreviewNumber(reward.troops)}</td>
          <td>+1</td>
        </tr>
      `;
    }).join("");
  }

  function buildFortificationPreviewRows(economy = state.economy) {
    const stoneworksMaximum = Math.max(0, readEconomyNumber(economy?.skills?.stoneworks?.maxPercent, 0));
    return ECONOMY_FORTIFICATION_PREVIEW_LEVELS.map(level => {
      const baseWall = getEconomyPreviewBaseWall(level, economy);
      const maximumWall = Math.floor(baseWall * (1 + stoneworksMaximum / 100));
      return `
        <tr>
          <td>${level}</td>
          <td>${formatEconomyPreviewNumber(baseWall)}</td>
          <td>${formatEconomyPreviewNumber(maximumWall)}</td>
          <td>${formatEconomyPreviewNumber(getEconomyPreviewRepairMinutes(level, economy) * 0.2, 1)} min</td>
          <td>${formatEconomyPreviewNumber(getEconomyPreviewRepairMinutes(level, economy))} min</td>
        </tr>
      `;
    }).join("");
  }

  function updateEconomyBreakdownPreviews() {
    if (!state.economy) return;
    const cityPreview = elements.economySections.querySelector('[data-economy-preview="cities"]');
    const fortificationPreview = elements.economySections.querySelector('[data-economy-preview="fortifications"]');
    const rewardPreview = elements.economySections.querySelector('[data-economy-preview="level-rewards"]');
    if (cityPreview) cityPreview.innerHTML = buildCityEconomyPreviewRows(state.economy);
    if (fortificationPreview) fortificationPreview.innerHTML = buildFortificationPreviewRows(state.economy);
    if (rewardPreview) rewardPreview.innerHTML = buildLevelRewardPreviewRows(state.economy);
  }

  function renderEconomySections() {
    if (!state.economy) {
      elements.economySections.innerHTML = `<section class="economy-section"><p class="helper-text">Economy data is unavailable. Restart the local Game Editor server and reload this page.</p></section>`;
      return;
    }
    const economy = state.economy;
    const shopRows = SHOP_ITEM_EDITOR.map(item => {
      const config = economy.shopItems[item.id];
      return `
        <tr>
          <td><strong>${escapeHtml(item.label)}</strong><br><small>${escapeHtml(item.detail)}</small></td>
          <td><input aria-label="${escapeHtml(item.label)} gold cost" data-economy-path="shopItems.${item.id}.cost" type="number" min="0" step="1000" value="${config.cost}" /></td>
          <td><input aria-label="${escapeHtml(item.label)} daily purchase cap" data-economy-path="shopItems.${item.id}.dailyPurchaseLimit" type="number" min="0" step="1" value="${config.dailyPurchaseLimit}" /></td>
          <td>${item.duration ? `<input aria-label="${escapeHtml(item.label)} effect duration in minutes" data-economy-path="shopItems.${item.id}.effectDurationMinutes" type="number" min="0.1" step="0.1" value="${config.effectDurationMinutes}" />` : "Single use"}</td>
          <td>${item.bonus ? `<input aria-label="${escapeHtml(item.label)} percentage bonus" data-economy-path="shopItems.${item.id}.bonusPercent" type="number" min="0" step="0.1" value="${config.bonusPercent}" />` : "Not applicable"}</td>
        </tr>
      `;
    }).join("");
    const skillCards = SKILL_EDITOR.map(skill => {
      const config = economy.skills[skill.id];
      return `
        <article class="economy-card">
          <h3>${escapeHtml(skill.label)}</h3>
          <div class="economy-grid">
            ${economyNumberInput(`skills.${skill.id}.percentPerLevel`, "Bonus per skill point (%)", config.percentPerLevel, { step: 0.1 })}
            ${economyNumberInput(`skills.${skill.id}.maxPercent`, "Maximum bonus (%)", config.maxPercent, { step: 0.1 })}
          </div>
        </article>
      `;
    }).join("");
    const campCards = ["gold", "troops", "items", "deed"].map(campType => {
      const config = economy.camps[campType];
      const title = campType === "troops" ? "Warband Camp" : campType === "items" ? "Relic Camp" : campType === "deed" ? "Deed Camp" : "Gold Camp";
      const schedule = Array.isArray(config.rewardSchedule)
        ? config.rewardSchedule.map((reward, index) => `
            <div class="camp-reward-row">
              <strong>${index + 1}</strong>
              ${economyNumberInput(`camps.${campType}.rewardSchedule.${index}.minimumReward`, `Minimum ${campType === "gold" ? "gold" : "troops"}`, reward.minimumReward)}
              ${economyNumberInput(`camps.${campType}.rewardSchedule.${index}.productionHours`, "Production hours", reward.productionHours, { step: 0.1 })}
              <span></span>
            </div>
          `).join("")
        : "";
      return `
        <article class="economy-card">
          <h3>${title} defaults</h3>
          <p>All camps reset with a fixed 20,000-troop neutral garrison. Camps have no level or walls, and each stationed troop contributes exactly 1.00 defense power.</p>
          <div class="economy-grid">
            ${economyNumberInput(`camps.${campType}.holdMinutes`, "Hold timer (minutes)", config.holdMinutes, { step: 0.1 })}
            ${campType === "items" && Number.isFinite(Number(config.maxDailyRewards))
              ? economyNumberInput(`camps.${campType}.maxDailyRewards`, "Items per UTC day", config.maxDailyRewards)
              : ""}
          </div>
          ${schedule ? `<div class="camp-reward-editor">${schedule}</div>` : ""}
        </article>
      `;
    }).join("");
    elements.economySections.innerHTML = `
      <section class="economy-section wide">
        <div class="economy-section-heading">
          <div><span>Shop</span><strong>Item prices and daily limits</strong></div>
          <p>The daily purchase cap is the shop cooldown measured per UTC day. Percentage inputs only appear for items that provide a percentage bonus.</p>
        </div>
        <table class="economy-table">
          <thead><tr><th>Item</th><th>Gold cost</th><th>Purchases per UTC day</th><th>Effect minutes</th><th>Bonus %</th></tr></thead>
          <tbody>${shopRows}</tbody>
        </table>
      </section>
      <section class="economy-section">
        <div class="economy-section-heading">
          <div><span>Map pickups</span><strong>Spawn timing and awards</strong></div>
          <p>Award production minutes multiply the player's permanent production rate. Daily caps reset at UTC midnight.</p>
        </div>
        <div class="economy-grid">
          ${economyNumberInput("pickups.initialSpawnDelayMinutes", "Initial spawn delay (minutes)", economy.pickups.initialSpawnDelayMinutes, { step: 0.1 })}
          ${economyNumberInput("pickups.respawnAfterCollectionMinutes", "Respawn after collection (minutes)", economy.pickups.respawnAfterCollectionMinutes, { step: 0.1 })}
          ${economyNumberInput("pickups.expireMinutes", "Pickup expires after (minutes)", economy.pickups.expireMinutes, { step: 0.1 })}
          ${economyNumberInput("pickups.goldAwardProductionMinutes", "Gold award production (minutes)", economy.pickups.goldAwardProductionMinutes, { step: 0.1 })}
          ${economyNumberInput("pickups.troopAwardProductionMinutes", "Troop award production (minutes)", economy.pickups.troopAwardProductionMinutes, { step: 0.1 })}
          ${economyNumberInput("pickups.dailyTotalCap", "All pickups daily cap", economy.pickups.dailyTotalCap)}
          ${economyNumberInput("pickups.dailyGoldCap", "Gold pickups daily cap", economy.pickups.dailyGoldCap)}
          ${economyNumberInput("pickups.dailyTroopCap", "Troop pickups daily cap", economy.pickups.dailyTroopCap)}
          ${economyNumberInput("pickups.maxActivePerPlayer", "Maximum active pickups", economy.pickups.maxActivePerPlayer)}
          ${economyNumberInput("pickups.minimumGold", "Minimum gold award", economy.pickups.minimumGold)}
          ${economyNumberInput("pickups.minimumTroops", "Minimum troop award", economy.pickups.minimumTroops)}
        </div>
      </section>
      <section class="economy-section">
        <div class="economy-section-heading">
          <div><span>Player actions</span><strong>Strategic gold costs</strong></div>
          <p>These are authoritative costs checked by the game and Firebase Functions.</p>
        </div>
        <div class="economy-grid">
          ${economyNumberInput("playerCosts.nearbyScoutGold", "Scout nearby cost (gold)", economy.playerCosts.nearbyScoutGold)}
          ${economyNumberInput("playerCosts.regroupGold", "Regroup cost (gold)", economy.playerCosts.regroupGold)}
          ${economyNumberInput("playerCosts.skillResetGold", "Reset skills cost (gold)", economy.playerCosts.skillResetGold)}
          ${economyNumberInput("playerCosts.skillPresetApplyGold", "Apply skill preset cost (gold)", economy.playerCosts.skillPresetApplyGold)}
        </div>
      </section>
      <section class="economy-section wide">
        <div class="economy-section-heading">
          <div><span>Cities</span><strong>What city levels produce and what upgrades cost</strong></div>
          <p>These settings control one regular city's base production and its base cost to reach the next city level. Skills, items, and strongholds apply later as bonuses or discounts.</p>
        </div>
        <div class="economy-callout important">
          <strong>Yes, Victory Points are used—but “Production VP” was a misleading label.</strong>
          <p><b>Visible Victory Points (VP)</b> are shown in the game and are calculated from city level: <code>floor(6 + 4 × level + 2 × level^1.35)</code>. VP sets base troop production and contributes to battle and capture XP. Gold uses a separate, hidden curve value; the gold fields below now call it a <b>gold curve unit</b> so the two are not confused.</p>
        </div>
        <div class="economy-breakdown-grid">
          <article class="economy-breakdown-card">
            <div class="economy-breakdown-heading">
              <span>Visible VP → troops</span>
              <strong>Actual in-game Victory Points</strong>
              <p>The VP curve itself is fixed in game code. This multiplier is the editable part of troop production.</p>
            </div>
            <div class="economy-fixed-formula">
              <span>Fixed formula</span>
              <code>VP = floor(6 + 4 × level + 2 × level^1.35)</code>
              <small>Also contributes to the XP value of fighting over a city. It does not calculate city gold.</small>
            </div>
            ${economyNumberInput(
              "cityEconomy.troopsPerVictoryPoint",
              "Troops/hour per visible VP",
              economy.cityEconomy.troopsPerVictoryPoint,
              {
                step: 0.1,
                description: "Base troops per hour for one city = that city's visible VP × this value. Royal Granaries, strongholds, and War Drums multiply the result afterward.",
              }
            )}
          </article>
          <article class="economy-breakdown-card">
            <div class="economy-breakdown-heading">
              <span>Gold per city</span>
              <strong>Internal gold curve</strong>
              <p>Before endgame: gold curve units = floor(base × growth^(city level − 1)); base gold/hour = units × gold per unit.</p>
            </div>
            <div class="economy-explained-grid">
              ${economyNumberInput(
                "cityEconomy.productionVpBase",
                "Level 1 gold curve units",
                economy.cityEconomy.productionVpBase,
                {
                  step: 0.001,
                  description: "Internal gold-only starting value at city level 1. This is not visible VP and does not affect troops or battle XP.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.productionVpGrowth",
                "Gold curve multiplier per level",
                economy.cityEconomy.productionVpGrowth,
                {
                  step: 0.001,
                  description: "Multiplies the internal gold units for every city level up to the endgame switch. For example, 1.115 means roughly +11.5% per level.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.goldPerProductionVp",
                "Gold/hour per curve unit",
                economy.cityEconomy.goldPerProductionVp,
                {
                  step: 0.1,
                  description: "Converts the hidden gold curve units into one city's base gold per hour before skills, items, and stronghold bonuses.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.goldEndgameStartLevel",
                "Stop the main gold curve at level",
                economy.cityEconomy.goldEndgameStartLevel,
                {
                  description: "This level still uses the main curve. Starting with the next level, the curve is frozen here and the endgame multiplier takes over.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.goldEndgameGrowth",
                "Endgame gold multiplier per level",
                economy.cityEconomy.goldEndgameGrowth,
                {
                  step: 0.001,
                  description: "Applied once for every city level above the switch level. For example, 1.08 means +8% base gold per additional endgame level.",
                }
              )}
            </div>
          </article>
          <article class="economy-breakdown-card full">
            <div class="economy-breakdown-heading">
              <span>Upgrade cost</span>
              <strong>Base gold/hour × target hours</strong>
              <p>The cost to upgrade a city from its current level to the next is that city's base gold/hour multiplied by the target hours from this curve. Upgrade skills and strongholds discount the result afterward.</p>
            </div>
            <div class="economy-explained-grid three">
              ${economyNumberInput(
                "cityEconomy.upgradeEarlyEndLevel",
                "Early phase ends at city level",
                economy.cityEconomy.upgradeEarlyEndLevel,
                {
                  description: "The target-hour curve runs from the Level 1 value to the Early-end value across levels 1 through this level.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.upgradeEarlyStartHours",
                "Target hours at city level 1",
                economy.cityEconomy.upgradeEarlyStartHours,
                {
                  step: 0.1,
                  description: "A value of 0.1 prices the level 1→2 upgrade at 6 minutes of that level 1 city's base gold production.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.upgradeEarlyEndHours",
                "Target hours at early phase end",
                economy.cityEconomy.upgradeEarlyEndHours,
                {
                  step: 0.1,
                  description: "Base-production hours used to price the next upgrade when the city reaches the early phase endpoint.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.upgradeMidEndLevel",
                "Mid phase ends at city level",
                economy.cityEconomy.upgradeMidEndLevel,
                {
                  description: "Between the early and mid endpoints, target hours rise smoothly toward the Mid-end target hours.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.upgradeMidEndHours",
                "Target hours at mid phase end",
                economy.cityEconomy.upgradeMidEndHours,
                {
                  step: 0.1,
                  description: "Base-production hours used to price the next upgrade at the midgame endpoint.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.upgradeLevel150Hours",
                "Target hours at city level 150",
                economy.cityEconomy.upgradeLevel150Hours,
                {
                  step: 0.1,
                  description: "Endgame pacing target. A ten-city kingdom with equal production earns this base cost in roughly one tenth of these hours before spending or bonuses.",
                }
              )}
              ${economyNumberInput(
                "cityEconomy.upgradeMaximumHours",
                "Maximum target hours",
                economy.cityEconomy.upgradeMaximumHours,
                {
                  step: 0.1,
                  description: "Hard ceiling on the production-hour part of any one-city upgrade cost, even above level 150.",
                }
              )}
            </div>
          </article>
          <article class="economy-breakdown-card full">
            <div class="economy-breakdown-heading">
              <span>Soldiers and walls</span>
              <strong>Separate troop defense and wall layers</strong>
              <p>Every defending soldier uses the same base power plus Shieldwall and objective support. City level affects only the wall and repair time.</p>
            </div>
            <div class="economy-fixed-formula">
              <span>Soldier formula</span>
              <code>troops × defense base × (1 + Shieldwall% + personal objective% + shared clan objective%)</code>
              <small>Objectives and Shieldwall add against the soldier base. They never multiply each other or increase the wall.</small>
            </div>
            <div class="economy-fixed-formula">
              <span>Wall formula</span>
              <code>base + per-level growth × (level − 1)</code>
              <small>Stoneworks alone multiplies the resulting wall. Reinforcements bring their own soldier-defense package, not additional walls.</small>
            </div>
            <div class="economy-fixed-formula">
              <span>Repair formula</span>
              <code>full window = round(base + level × minutes per level); added time = full window × hit damage ÷ full wall power</code>
              <small>Later hits extend the running deadline only by their own damage. Every ownership or neutral handoff preserves active repair progress.</small>
            </div>
            <div class="economy-explained-grid three">
              ${economyNumberInput(
                "troopCombat.baseAttackPowerPerTroop",
                "Base attack power per soldier",
                economy.troopCombat.baseAttackPowerPerTroop,
                { step: 0.01, description: "Swordmastery adds its percentage against this attack base. Attack power is locked when the march launches." }
              )}
              ${economyNumberInput(
                "troopCombat.baseDefensePowerPerTroop",
                "Base defense power per soldier",
                economy.troopCombat.baseDefensePowerPerTroop,
                { step: 0.01, description: "Shieldwall and objective percentages add against this defense base. City level is not part of troop defense." }
              )}
              ${economyNumberInput(
                "cityEconomy.wallDefenseBase",
                "Level 1 base wall power",
                economy.cityEconomy.wallDefenseBase,
                { description: "Flat wall power before level growth and Stoneworks. Objective bonuses never affect it." }
              )}
              ${economyNumberInput(
                "cityEconomy.wallDefensePerLevel",
                "Wall power per level",
                economy.cityEconomy.wallDefensePerLevel,
                { step: 1, description: "Adds this much wall power for every level after Level 1." }
              )}
              ${economyNumberInput(
                "siegeCombat.repairBaseMinutes",
                "Base wall repair minutes",
                economy.siegeCombat.repairBaseMinutes,
                { step: 0.1, description: "Flat minutes included in the full-breach repair window before damage scaling." }
              )}
              ${economyNumberInput(
                "siegeCombat.repairMinutesPerLevel",
                "Repair minutes per city level",
                economy.siegeCombat.repairMinutesPerLevel,
                { step: 0.01, description: "Adds this many minutes per level to the full-breach window. Partial hits add the matching damage share." }
              )}
              ${economyNumberInput(
                "siegeCombat.meaningfulWallDamagePercent",
                "Damage required to persist (%)",
                economy.siegeCombat.meaningfulWallDamagePercent,
                { step: 0.1, description: "Hits below this share of the full wall do not change integrity or reset the timer unless they finish the breach." }
              )}
              ${economyNumberInput(
                "siegeCombat.intactWallDefenderLossCapPercent",
                "Defender loss cap while wall holds (%)",
                economy.siegeCombat.intactWallDefenderLossCapPercent,
                { step: 0.1, description: "Maximum garrison losses from an attack that fails to breach the wall." }
              )}
            </div>
            <div class="economy-preview-panel">
              <div class="economy-preview-heading">
                <div><span>Live preview</span><strong>Wall strength and damage-scaled repair</strong></div>
                <p>Maximum wall includes the current Stoneworks cap. Objective defense bonuses are not included.</p>
              </div>
              <div class="economy-preview-scroll">
                <table class="economy-preview-table">
                  <thead><tr><th>City level</th><th>Base wall</th><th>Max Stoneworks wall</th><th>20% hit adds</th><th>Full breach</th></tr></thead>
                  <tbody data-economy-preview="fortifications">${buildFortificationPreviewRows(economy)}</tbody>
                </table>
              </div>
            </div>
          </article>
        </div>
        <div class="economy-preview-panel">
          <div class="economy-preview-heading">
            <div><span>Live preview</span><strong>One regular city, before bonuses</strong></div>
            <p>Editing any city setting updates this table immediately. “Next upgrade” means upgrading from the listed city level to the next one.</p>
          </div>
          <div class="economy-preview-scroll">
            <table class="economy-preview-table">
              <thead>
                <tr><th>City level</th><th>Visible VP</th><th>Base troops/hour</th><th>Base gold/hour</th><th>Target hours</th><th>Next upgrade gold</th></tr>
              </thead>
              <tbody data-economy-preview="cities">${buildCityEconomyPreviewRows(economy)}</tbody>
            </table>
          </div>
        </div>
      </section>
      <section class="economy-section wide">
        <div class="economy-section-heading">
          <div><span>Skills</span><strong>Bonus per point and caps</strong></div>
          <p>These values apply to the eight active Crownlands skills. Shieldwall Discipline mirrors Swordmastery for defending soldiers.</p>
        </div>
        <div class="economy-grid">${skillCards}</div>
      </section>
      <section class="economy-section wide">
        <div class="economy-section-heading">
          <div><span>Level rewards</span><strong>What the player gets when the hero gains a level</strong></div>
          <p>This is hero XP progression, not a city upgrade. The reward is calculated once for every hero level crossed, including when one XP award gains multiple levels.</p>
        </div>
        <div class="economy-callout">
          <strong>Every hero level always grants three things.</strong>
          <p><b>+1 skill point</b> (fixed in code), <b>gold</b> added to the player's balance, and <b>troops</b> added to the player's main city. These inputs change only the gold and troop amounts. They do not change XP requirements, battle XP, the skill point count, or city-level rewards.</p>
        </div>
        <div class="economy-callout formula">
          <strong>Why changing one gold field may not change the final reward</strong>
          <p>Hero-level gold is the <b>greater</b> of the configurable minimum and the <b>smaller</b> of two limits: <code>reference city upgrade cost × upgrade share</code> and <code>base gold/hour × production hours</code>. Increasing one limit has no effect while the other limit is still lower.</p>
        </div>
        <div class="economy-breakdown-grid">
          <article class="economy-breakdown-card">
            <div class="economy-breakdown-heading">
              <span>Gold minimum</span>
              <strong>Guaranteed floor at every hero level</strong>
              <p>The floor is base + (new hero level × gold per level) + (new hero level raised to the exponent × exponent scale). The final reward can be higher when both gold limits allow it.</p>
            </div>
            <div class="economy-explained-grid">
              ${economyNumberInput(
                "levelRewards.goldFloorBase",
                "Base gold floor",
                economy.levelRewards.goldFloorBase,
                {
                  step: 1,
                  description: "Flat gold included in the guaranteed minimum for every hero level.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.goldFloorPerLevel",
                "Gold floor per hero level",
                economy.levelRewards.goldFloorPerLevel,
                {
                  step: 1,
                  description: "Linear gold added to the guaranteed minimum for each new hero level.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.goldFloorExponent",
                "Gold floor exponent",
                economy.levelRewards.goldFloorExponent,
                {
                  step: 0.01,
                  description: "Controls how the curved part of the minimum accelerates at higher levels.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.goldFloorExponentScale",
                "Gold floor exponent scale",
                economy.levelRewards.goldFloorExponentScale,
                {
                  step: 1,
                  description: "Multiplies the curved part of the guaranteed minimum.",
                }
              )}
            </div>
          </article>
          <article class="economy-breakdown-card">
            <div class="economy-breakdown-heading">
              <span>Gold limit 1</span>
              <strong>Share of a reference city upgrade</strong>
              <p>The reference cost is the base cost to upgrade a city from hero level − 1 to that hero level, with no discounts. Decimal shares mean 0.75 = 75%.</p>
            </div>
            <div class="economy-explained-grid">
              ${economyNumberInput(
                "levelRewards.goldEarlyUpgradeShare",
                "Upgrade share through hero level 50",
                economy.levelRewards.goldEarlyUpgradeShare,
                {
                  step: 0.01,
                  description: "Used for every hero level gained up to and including level 50. Example: 0.75 limits gold to 75% of the reference city upgrade.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.goldMidUpgradeShare",
                "Upgrade share at hero level 100",
                economy.levelRewards.goldMidUpgradeShare,
                {
                  step: 0.01,
                  description: "Levels 51–100 smoothly move from the level-50 share to this level-100 endpoint; this is not a flat midgame value.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.goldEndgameUpgradeShare",
                "Upgrade share after hero level 100",
                economy.levelRewards.goldEndgameUpgradeShare,
                {
                  step: 0.01,
                  description: "Flat share used for every hero level gained from 101 onward.",
                }
              )}
            </div>
          </article>
          <article class="economy-breakdown-card">
            <div class="economy-breakdown-heading">
              <span>Gold limit 2</span>
              <strong>Hours of one reference city's gold</strong>
              <p>This limit uses the base gold/hour of a city whose city level equals the new hero level. It excludes skills, items, and strongholds.</p>
            </div>
            <div class="economy-explained-grid">
              ${economyNumberInput(
                "levelRewards.goldEarlyProductionHours",
                "Gold hours through hero level 50",
                economy.levelRewards.goldEarlyProductionHours,
                {
                  step: 0.1,
                  description: "Limits the reward to this many hours of the reference city's base gold production through hero level 50.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.goldMidProductionHours",
                "Gold hours at hero level 100",
                economy.levelRewards.goldMidProductionHours,
                {
                  step: 0.1,
                  description: "Levels 51–100 smoothly increase or decrease from the level-50 hours to this level-100 endpoint.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.goldEndgameProductionHours",
                "Gold hours after hero level 100",
                economy.levelRewards.goldEndgameProductionHours,
                {
                  step: 0.1,
                  description: "Flat production-hour limit used for every hero level gained from 101 onward.",
                }
              )}
            </div>
          </article>
          <article class="economy-breakdown-card full">
            <div class="economy-breakdown-heading">
              <span>Troops → main city</span>
              <strong>Reference troop production × reward hours</strong>
              <p>The reference troop rate is the base production of a city whose level equals the new hero level: visible VP × Troops/hour per VP. Skills, items, and strongholds are excluded. The final reward has a minimum of 50 troops.</p>
            </div>
            <div class="economy-explained-grid three">
              ${economyNumberInput(
                "levelRewards.troopEarlyBaseHours",
                "Early base troop hours",
                economy.levelRewards.troopEarlyBaseHours,
                {
                  step: 0.1,
                  description: "For hero levels through 50: reward hours = this base + (new hero level × early hours per level).",
                }
              )}
              ${economyNumberInput(
                "levelRewards.troopEarlyHoursPerLevel",
                "Early troop hours added per level",
                economy.levelRewards.troopEarlyHoursPerLevel,
                {
                  step: 0.01,
                  description: "Slope for levels through 50. At level 50, 4 base + (50 × 0.4) produces 24 reward hours.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.troopMidBaseHours",
                "Midgame base troop hours",
                economy.levelRewards.troopMidBaseHours,
                {
                  step: 0.1,
                  description: "For levels 51–100: reward hours = this base + ((new hero level − 50) × midgame hours per level).",
                }
              )}
              ${economyNumberInput(
                "levelRewards.troopMidHoursPerLevel",
                "Midgame troop hours added per level",
                economy.levelRewards.troopMidHoursPerLevel,
                {
                  step: 0.01,
                  description: "Slope applied to each hero level above 50 through level 100. With 24 base and 0.48 per level, level 100 grants 48 reward hours.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.troopEndgameBaseHours",
                "Endgame base troop hours",
                economy.levelRewards.troopEndgameBaseHours,
                {
                  step: 0.1,
                  description: "For levels 101+: reward hours = this base + ((new hero level − 100) × endgame hours per level).",
                }
              )}
              ${economyNumberInput(
                "levelRewards.troopEndgameHoursPerLevel",
                "Endgame troop hours added per level",
                economy.levelRewards.troopEndgameHoursPerLevel,
                {
                  step: 0.01,
                  description: "Slope applied to every hero level above 100 until the maximum reward hours ceiling is reached.",
                }
              )}
              ${economyNumberInput(
                "levelRewards.troopMaximumHours",
                "Maximum troop reward hours",
                economy.levelRewards.troopMaximumHours,
                {
                  step: 0.1,
                  description: "Hard ceiling on the troop-production hours used for one hero-level reward.",
                }
              )}
            </div>
          </article>
        </div>
        <div class="economy-preview-panel">
          <div class="economy-preview-heading">
            <div><span>Live preview</span><strong>Reward when each hero level is reached</strong></div>
            <p>Gold goes to the player balance. Troops go to the main city. Calculations use the current city settings above and exclude all temporary or ownership bonuses.</p>
          </div>
          <div class="economy-preview-scroll">
            <table class="economy-preview-table">
              <thead>
                <tr><th>Hero level reached</th><th>Gold to balance</th><th>Troop reward hours</th><th>Troops to main city</th><th>Skill points</th></tr>
              </thead>
              <tbody data-economy-preview="level-rewards">${buildLevelRewardPreviewRows(economy)}</tbody>
            </table>
          </div>
        </div>
      </section>
      <section class="economy-section wide">
        <div class="economy-section-heading">
          <div><span>Camps</span><strong>Default camp rewards</strong></div>
          <p>Placed Gold, Warband, and Relic Camps can override their daily rewards from the Region Edit inspector.</p>
        </div>
        <div class="economy-grid">${campCards}</div>
      </section>
    `;
  }

  function getGridBounds() {
    const xs = state.regions.map(region => Number(region.gridX) || 0);
    const ys = state.regions.map(region => Number(region.gridY) || 0);
    return {
      minX: Math.min(-1, ...xs) - 1,
      maxX: Math.max(1, ...xs) + 1,
      minY: Math.min(-1, ...ys) - 1,
      maxY: Math.max(1, ...ys) + 1,
    };
  }

  function renderWorldGrid() {
    const bounds = getGridBounds();
    const cell = WORLD_GRID_CELL;
    const cols = bounds.maxX - bounds.minX + 1;
    const rows = bounds.maxY - bounds.minY + 1;
    elements.worldView.classList.toggle("hide-grid", !state.toggles.grid);
    elements.worldGrid.style.width = `${cols * cell}px`;
    elements.worldGrid.style.height = `${rows * cell}px`;
    elements.worldGrid.innerHTML = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "grid-connection-layer");
    svg.setAttribute("viewBox", `0 0 ${cols * cell} ${rows * cell}`);
    elements.worldGrid.appendChild(svg);

    const occupiedCells = new Set(state.regions.map(region => `${region.gridX},${region.gridY}`));
    for (let gridY = bounds.minY; gridY <= bounds.maxY; gridY += 1) {
      for (let gridX = bounds.minX; gridX <= bounds.maxX; gridX += 1) {
        if (occupiedCells.has(`${gridX},${gridY}`)) continue;
        const cellButton = document.createElement("button");
        cellButton.type = "button";
        cellButton.className = `grid-cell ${state.selected?.kind === "gridCell" && state.selected.gridX === gridX && state.selected.gridY === gridY ? "selected" : ""}`;
        cellButton.style.left = `${(gridX - bounds.minX) * cell}px`;
        cellButton.style.top = `${(gridY - bounds.minY) * cell}px`;
        cellButton.dataset.gridX = String(gridX);
        cellButton.dataset.gridY = String(gridY);
        cellButton.title = `Empty grid cell ${gridX}, ${gridY}`;
        cellButton.innerHTML = `<span>${gridX}, ${gridY}</span>`;
        cellButton.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          selectGridCell(gridX, gridY);
        });
        elements.worldGrid.appendChild(cellButton);
      }
    }

    state.regions.forEach(region => {
      const left = (region.gridX - bounds.minX) * cell + 8;
      const top = (region.gridY - bounds.minY) * cell + 8;
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = [
        "region-tile",
        state.selected?.kind === "region" && state.selected.regionId === region.id ? "selected" : "",
        state.draggingRegion?.regionId === region.id ? "dragging" : "",
      ].filter(Boolean).join(" ");
      tile.style.left = `${left}px`;
      tile.style.top = `${top}px`;
      tile.dataset.regionId = region.id;
      tile.innerHTML = `
        <img src="${escapeHtml(resolveRegionPreviewPath(region))}" alt="" draggable="false" />
        <span class="region-tile-meta">
          <strong>${escapeHtml(region.name)}</strong>
          <small>${escapeHtml(region.id)} (${region.gridX}, ${region.gridY})</small>
          <small>${region.cities.length} ${region.cities.length === 1 ? "city" : "cities"} placed</small>
        </span>
        ${SIDES.map(side => `<span class="edge-dot ${side} ${hasNeighbor(region, side) ? "connected" : ""}"></span>`).join("")}
      `;
      tile.addEventListener("pointerdown", event => startRegionTileDrag(event, region.id));
      tile.addEventListener("click", event => {
        if (state.skipNextWorldClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        selectRegion(region.id);
      });
      tile.addEventListener("dblclick", event => {
        if (state.skipNextWorldClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        editRegion(region.id);
      });
      elements.worldGrid.appendChild(tile);
    });

    renderWorldConnectionLines(svg, bounds, cell);
  }

  function renderWorldConnectionLines(svg, bounds, cell) {
    if (!state.toggles.connections) return;
    const seen = new Set();
    state.regions.forEach(region => {
      ["east", "south"].forEach(side => {
        const neighbor = getNeighbor(region, side);
        if (!neighbor) return;
        const key = [region.id, neighbor.id].sort().join(":");
        if (seen.has(key)) return;
        seen.add(key);
        const ax = (region.gridX - bounds.minX) * cell + cell / 2;
        const ay = (region.gridY - bounds.minY) * cell + cell / 2;
        const bx = (neighbor.gridX - bounds.minX) * cell + cell / 2;
        const by = (neighbor.gridY - bounds.minY) * cell + cell / 2;
        const ok = hasMatchingConnection(region, neighbor, side);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", ax);
        line.setAttribute("y1", ay);
        line.setAttribute("x2", bx);
        line.setAttribute("y2", by);
        line.setAttribute("stroke", ok ? "#61b66d" : "#d8564b");
        line.setAttribute("stroke-width", ok ? "5" : "3");
        line.setAttribute("stroke-dasharray", ok ? "0" : "8 8");
        svg.appendChild(line);
      });
    });
  }

  function hasNeighbor(region, side) {
    return Boolean(getNeighbor(region, side));
  }

  function getNeighbor(region, side) {
    const dx = side === "east" ? 1 : side === "west" ? -1 : 0;
    const dy = side === "south" ? 1 : side === "north" ? -1 : 0;
    return state.regions.find(other => other.gridX === region.gridX + dx && other.gridY === region.gridY + dy) || null;
  }

  function hasMatchingConnection(region, neighbor, side) {
    const zones = region.edgeConnections[side] || [];
    const oppositeZones = neighbor.edgeConnections[OPPOSITE_SIDE[side]] || [];
    if (!zones.length || !oppositeZones.length) return false;
    return zones.some(zone => {
      const center = (zone.start + zone.end) / 2;
      return oppositeZones.some(other => Math.abs(center - ((other.start + other.end) / 2)) <= 0.18);
    });
  }

  function isGridCellOccupied(gridX, gridY, excludeRegionId = "") {
    return state.regions.some(region =>
      region.id !== excludeRegionId
      && Number(region.gridX) === Number(gridX)
      && Number(region.gridY) === Number(gridY)
    );
  }

  function updateWorldTileSelection(regionId) {
    elements.worldGrid.querySelectorAll(".region-tile").forEach(tile => {
      tile.classList.toggle("selected", tile.dataset.regionId === regionId);
    });
  }

  function startRegionTileDrag(event, regionId) {
    if (state.editorMode !== "world" || event.button !== 0) return;
    const region = getRegion(regionId);
    if (!region) return;
    event.preventDefault();
    event.stopPropagation();

    const now = performance.now();
    const isDoubleClick = state.lastRegionClick?.regionId === region.id
      && now - state.lastRegionClick.time <= 450
      && !state.skipNextWorldClick;
    state.lastRegionClick = { regionId: region.id, time: now };
    if (isDoubleClick) {
      editRegion(region.id);
      return;
    }

    setSelectedRegion(region.id);
    updateWorldTileSelection(region.id);
    state.draggingRegion = {
      regionId: region.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startGridX: Number(region.gridX) || 0,
      startGridY: Number(region.gridY) || 0,
      lastGridX: Number(region.gridX) || 0,
      lastGridY: Number(region.gridY) || 0,
      moved: false,
    };
    event.currentTarget.classList.add("dragging");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    renderToolbar();
    renderInspector();
  }

  function handleRegionTileDrag(event) {
    if (!state.draggingRegion || state.draggingRegion.pointerId !== event.pointerId) return;
    const region = getRegion(state.draggingRegion.regionId);
    if (!region) {
      state.draggingRegion = null;
      return;
    }
    const deltaX = Math.round((event.clientX - state.draggingRegion.startX) / WORLD_GRID_CELL);
    const deltaY = Math.round((event.clientY - state.draggingRegion.startY) / WORLD_GRID_CELL);
    const nextGridX = state.draggingRegion.startGridX + deltaX;
    const nextGridY = state.draggingRegion.startGridY + deltaY;
    if (nextGridX === state.draggingRegion.lastGridX && nextGridY === state.draggingRegion.lastGridY) return;
    state.draggingRegion.moved = true;
    if (isGridCellOccupied(nextGridX, nextGridY, region.id)) {
      setStatus(`Grid cell ${nextGridX}, ${nextGridY} already has a region.`);
      return;
    }
    region.gridX = nextGridX;
    region.gridY = nextGridY;
    state.draggingRegion.lastGridX = nextGridX;
    state.draggingRegion.lastGridY = nextGridY;
    markDirty();
    renderWorldGrid();
    renderInspector();
    renderCounts();
    event.preventDefault();
  }

  function stopRegionTileDrag(event) {
    if (!state.draggingRegion || (event && state.draggingRegion.pointerId !== event.pointerId)) return;
    const wasMoved = state.draggingRegion.moved;
    const region = getRegion(state.draggingRegion.regionId);
    state.draggingRegion = null;
    state.skipNextWorldClick = wasMoved;
    if (wasMoved) state.lastRegionClick = null;
    renderWorldGrid();
    renderInspector();
    if (wasMoved && region) setStatus(`Moved ${region.name} to ${region.gridX}, ${region.gridY}.`);
    window.setTimeout(() => { state.skipNextWorldClick = false; }, 140);
  }

  function renderRegionEditor() {
    const region = currentRegion();
    if (!region) {
      elements.regionImage.removeAttribute("src");
      elements.markerLayer.innerHTML = "";
      elements.edgeLayer.innerHTML = "";
      return;
    }
    elements.regionCanvas.style.width = `${Math.round(region.width * state.zoom)}px`;
    elements.regionCanvas.style.height = `${Math.round(region.height * state.zoom)}px`;
    elements.regionImage.src = resolveRegionPreviewPath(region);
    elements.regionImage.alt = `${region.name} map`;
    elements.regionView.classList.toggle("hide-cities", !state.toggles.cities);
    elements.regionView.classList.toggle("hide-strongholds", !state.toggles.strongholds);
    elements.regionView.classList.toggle("hide-camps", !state.toggles.camps);
    elements.regionView.classList.toggle("hide-connections", !state.toggles.connections);
    elements.regionView.classList.toggle("hide-ui-bounds", !state.toggles.uiBounds);
    renderRegionMarkers(region);
    renderEdgeZones(region);
  }

  function renderRegionMarkers(region) {
    elements.markerLayer.innerHTML = "";
    const cityUiGuide = getSelectedCityUiGuide(region);
    region.cities.forEach((city, index) => {
      const marker = createMarker("city", city, index, region);
      const isSelectedGuide = index === cityUiGuide.selectedIndex;
      const isOverlapPeer = cityUiGuide.overlapIndexes.has(index);
      const castleStage = getEditorCityCastleStage(city.level);
      const ownerUi = getEditorCityOwnerUi(city.owner);
      marker.classList.add(`castle-stage-${castleStage}`, `owner-${ownerUi.key}`);
      marker.dataset.castleStage = String(castleStage);
      marker.dataset.owner = ownerUi.key;
      marker.classList.toggle("ui-overlap", isSelectedGuide && cityUiGuide.overlapIndexes.size > 0);
      marker.classList.toggle("ui-overlap-peer", isOverlapPeer);
      marker.innerHTML = renderEditorCityMarker(city, castleStage, ownerUi);
      if (isSelectedGuide && cityUiGuide.overlapIndexes.size > 0) {
        marker.title = `${city.name} - name/level UI overlaps ${cityUiGuide.overlapIndexes.size} nearby ${cityUiGuide.overlapIndexes.size === 1 ? "city" : "cities"}`;
      } else if (isOverlapPeer) {
        marker.title = `${city.name} - name/level UI overlaps the selected city`;
      }
      elements.markerLayer.appendChild(marker);
    });
    region.strongholds.forEach((stronghold, index) => {
      elements.markerLayer.appendChild(createUiFootprint("stronghold", stronghold, index, region));
      const marker = createMarker("stronghold", stronghold, index, region);
      marker.classList.toggle("crown", stronghold.strongholdType === "crown_citadel");
      marker.dataset.strongholdType = stronghold.strongholdType;
      marker.innerHTML = `<img class="${stronghold.flipX ? "editor-art-flip-x" : ""}" src="${escapeHtml(resolveAssetPath(stronghold.artSrc))}" alt="" draggable="false" decoding="async" />`;
      elements.markerLayer.appendChild(marker);
    });
    region.camps.forEach((camp, index) => {
      elements.markerLayer.appendChild(createUiFootprint("camp", camp, index, region));
      const marker = createMarker("camp", camp, index, region);
      marker.dataset.campType = camp.campType;
      marker.innerHTML = `<img class="${camp.flipX ? "editor-art-flip-x" : ""}" src="${escapeHtml(resolveAssetPath(camp.artSrc))}" alt="" draggable="false" decoding="async" />`;
      elements.markerLayer.appendChild(marker);
    });
  }

  function getEditorCityCastleStage(level) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    if (normalizedLevel >= 100) return 5;
    if (normalizedLevel >= 75) return 4;
    if (normalizedLevel >= 50) return 3;
    if (normalizedLevel >= 25) return 2;
    return 1;
  }

  function getEditorCityOwnerUi(owner) {
    return CITY_EDITOR_OWNER_UI[String(owner || "").trim()] || CITY_EDITOR_OWNER_UI.neutral;
  }

  function renderEditorCityMarker(city, castleStage, ownerUi) {
    const level = Math.max(1, Math.floor(Number(city.level) || 1));
    const troops = Math.max(0, Math.floor(Number(city.troops) || 0));
    const ownerFlag = `<span class="editor-city-owner-flag" aria-hidden="true">${escapeHtml(ownerUi.flag)}</span>`;
    const cityLabel = ownerUi.key === "player"
      ? `
        <span class="editor-city-label editor-player-city-label" aria-hidden="true">
          <span class="editor-player-city-banner">
            <span class="editor-city-owner-column">
              ${ownerFlag}
              <span class="editor-city-label-level">${escapeHtml(level)}</span>
            </span>
            <span class="editor-player-city-data">
              <strong class="editor-city-ruler-name">${escapeHtml(ownerUi.label)}</strong>
              <span class="editor-city-army-count">${escapeHtml(troops)} troops</span>
              <strong class="editor-city-name">${escapeHtml(city.name)}</strong>
            </span>
          </span>
        </span>`
      : `
        <span class="editor-city-label editor-foreign-city-label" aria-hidden="true">
          ${ownerUi.key === "neutral" ? "" : `<strong class="editor-foreign-ruler-name">${escapeHtml(ownerUi.label)}</strong>`}
          <strong class="editor-city-name">${escapeHtml(city.name)}</strong>
          <span class="editor-foreign-city-shield">
            ${ownerFlag}
            <span class="editor-city-label-level">${escapeHtml(level)}</span>
          </span>
        </span>`;
    return `
      <span class="editor-city-ring" aria-hidden="true"></span>
      <span class="editor-city-castle stage-${castleStage}" aria-hidden="true">
        <img class="editor-city-art" src="${escapeHtml(resolveAssetPath(CITY_CASTLE_ASSETS[castleStage] || CITY_CASTLE_ASSETS[1]))}" alt="" draggable="false" decoding="async" />
      </span>
      ${cityLabel}
    `;
  }

  function getSelectedCityUiGuide(region) {
    const cities = Array.isArray(region?.cities) ? region.cities : [];
    const selectedIndex = state.selected?.kind === "city" && state.selected.regionId === region.id
      ? state.selected.index
      : -1;
    const overlapIndexes = new Set();
    const selectedCity = cities[selectedIndex];
    if (!selectedCity) return { selectedIndex: -1, overlapIndexes };
    const selectedLabelRect = getCityUiLabelRect(selectedCity, region);

    for (let index = 0; index < cities.length; index += 1) {
      if (index === selectedIndex) continue;
      if (cityUiLabelsOverlap(selectedLabelRect, getCityUiLabelRect(cities[index], region))) {
        overlapIndexes.add(index);
      }
    }
    return { selectedIndex, overlapIndexes };
  }

  function getCityUiLabelRect(city, region) {
    const centerX = Number(city.xNorm) * region.width;
    const centerY = Number(city.yNorm) * region.height;
    const bottom = centerY - CITY_UI_LABEL_OFFSET;
    return {
      left: centerX - CITY_UI_LABEL_WIDTH / 2,
      right: centerX + CITY_UI_LABEL_WIDTH / 2,
      top: bottom - CITY_UI_LABEL_HEIGHT,
      bottom,
    };
  }

  function cityUiLabelsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function getUiFootprintDimensions(kind, item) {
    if (kind === "city") {
      return {
        width: CITY_UI_LABEL_WIDTH,
        top: CITY_UI_LABEL_OFFSET + CITY_UI_LABEL_HEIGHT,
        bottom: CITY_UI_MARKER_FOOTPRINT / 2,
      };
    }
    if (kind === "camp") {
      const size = getMarkerVisualBaseSize(kind, item);
      return {
        width: size + CAMP_UI_FOOTPRINT_PAD.x,
        top: Math.round(size * 0.62 + CAMP_UI_FOOTPRINT_PAD.top),
        bottom: Math.round(size * 0.44 + CAMP_UI_FOOTPRINT_PAD.bottom),
      };
    }
    const size = getMarkerVisualBaseSize(kind, item);
    const isCrown = item.strongholdType === "crown_citadel";
    const pad = isCrown ? CROWN_UI_FOOTPRINT_PAD : STRONGHOLD_UI_FOOTPRINT_PAD;
    return {
      width: Math.max(isCrown ? 340 : 240, Math.round(size * (isCrown ? 1.36 : 1.28) + pad.x)),
      top: Math.round(size * (isCrown ? 1.18 : 0.96) + pad.top),
      bottom: Math.round(size * 0.38 + pad.bottom),
    };
  }

  function createUiFootprint(kind, item, index, region) {
    const dimensions = getUiFootprintDimensions(kind, item);
    const footprint = document.createElement("div");
    const isCrown = kind === "stronghold" && item.strongholdType === "crown_citadel";
    footprint.className = `ui-footprint ${kind}${isCrown ? " crown" : ""}`;
    footprint.dataset.kind = kind;
    footprint.dataset.index = String(index);
    footprint.dataset.label = isCrown ? "Crown + label area" : `${titleFromId(kind)} UI area`;
    footprint.style.left = `${item.xNorm * 100}%`;
    footprint.style.top = `${item.yNorm * 100}%`;
    footprint.style.width = `${Math.round(dimensions.width * state.zoom)}px`;
    footprint.style.height = `${Math.round((dimensions.top + dimensions.bottom) * state.zoom)}px`;
    footprint.style.transform = `translate(-50%, -${Math.round(dimensions.top * state.zoom)}px)`;
    footprint.title = `${item.name} ${footprint.dataset.label}`;
    return footprint;
  }

  function createMarker(kind, item, index, region) {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `map-marker ${kind} ${isSelected(kind, region.id, index) ? "selected" : ""}`;
    marker.style.left = `${item.xNorm * 100}%`;
    marker.style.top = `${item.yNorm * 100}%`;
    marker.title = item.name;
    applyMarkerVisualSize(marker, kind, item);
    marker.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
      state.draggingMarker = { kind, regionId: region.id, index, pointerId: event.pointerId };
      if (kind === "city") selectCity(region.id, index);
      else if (kind === "camp") selectCamp(region.id, index);
      else selectStronghold(region.id, index);
    });
    return marker;
  }

  function applyMarkerVisualSize(marker, kind, item) {
    if (kind === "city") {
      const gameScale = Math.min(CITY_EDITOR_MAX_GAME_SCALE, Math.max(MIN_REGION_ZOOM, state.zoom));
      marker.style.setProperty("--editor-city-scale", String(gameScale));
      return;
    }
    if (kind !== "stronghold" && kind !== "camp") return;
    const size = getMarkerVisualBaseSize(kind, item);
    marker.style.setProperty("--marker-base-size", `${size}px`);
    marker.style.setProperty("--marker-size", `${Math.max(1, size * state.zoom)}px`);
    marker.dataset.visualSize = String(size);
  }

  function getMarkerVisualBaseSize(kind, item) {
    const defaultSize = kind === "camp"
      ? (CAMP_DEFAULTS[item.campType]?.size || CAMP_DEFAULTS.gold.size)
      : (STRONGHOLD_DEFAULTS[item.strongholdType]?.size || STRONGHOLD_DEFAULTS.gold_stronghold.size);
    return readVisualSize(item.size, defaultSize);
  }

  function renderEdgeZones(region) {
    elements.edgeLayer.innerHTML = "";
    SIDES.forEach(side => {
      region.edgeConnections[side].forEach((zone, index) => {
        const zoneEl = document.createElement("button");
        zoneEl.type = "button";
        zoneEl.className = `edge-zone ${side} ${isSelected("edge", region.id, index, side) ? "selected" : ""}`;
        if (side === "north" || side === "south") {
          zoneEl.style.left = `${zone.start * 100}%`;
          zoneEl.style.width = `${Math.max(0.01, zone.end - zone.start) * 100}%`;
        } else {
          zoneEl.style.top = `${zone.start * 100}%`;
          zoneEl.style.height = `${Math.max(0.01, zone.end - zone.start) * 100}%`;
        }
        zoneEl.title = `${side} ${zone.type}`;
        zoneEl.addEventListener("pointerdown", event => {
          event.preventDefault();
          event.stopPropagation();
          setSelectedEdge(region.id, side, index);
          state.draggingEdge = {
            regionId: region.id,
            side,
            index,
            pointerId: event.pointerId,
            width: Math.max(0.02, zone.end - zone.start),
          };
          renderToolbar();
          renderInspector();
          renderEdgeZones(region);
        });
        elements.edgeLayer.appendChild(zoneEl);
        elements.edgeLayer.appendChild(createEdgeSwitchArrow(region, zone, side, index));
      });
    });
  }

  function getEdgeArrowGlyph(side) {
    if (side === "north") return "↑";
    if (side === "south") return "↓";
    if (side === "west") return "←";
    return "→";
  }

  function createEdgeSwitchArrow(region, zone, side, index) {
    const point = getEdgeArrowPoint(zone);
    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = `edge-switch-arrow ${side} ${isSelected("edge", region.id, index, side) ? "selected" : ""}`;
    arrow.style.left = `${point.xNorm * 100}%`;
    arrow.style.top = `${point.yNorm * 100}%`;
    arrow.title = `Player map switch arrow to ${zone.connectsToRegionId || "connected region"}`;
    arrow.innerHTML = `<img class="edge-switch-arrow-icon" src="${MAP_SWITCH_ARROW_ICON_SRC}" alt="" draggable="false" decoding="async" aria-hidden="true" />`;
    arrow.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
      setSelectedEdge(region.id, side, index);
      state.draggingEdgeArrow = {
        regionId: region.id,
        side,
        index,
        pointerId: event.pointerId,
      };
      arrow.setPointerCapture?.(event.pointerId);
      renderToolbar();
      renderInspector();
      renderEdgeZones(region);
    });
    return arrow;
  }

  function isSelected(kind, regionId, index, side = "") {
    return state.selected?.kind === kind
      && state.selected.regionId === regionId
      && state.selected.index === index
      && (!side || state.selected.side === side);
  }

  function getNormPointFromEvent(event) {
    const rect = elements.regionCanvas.getBoundingClientRect();
    return {
      xNorm: roundNorm((event.clientX - rect.left) / Math.max(1, rect.width)),
      yNorm: roundNorm((event.clientY - rect.top) / Math.max(1, rect.height)),
    };
  }

  function isEventInsideRegionCanvas(event) {
    const rect = elements.regionCanvas.getBoundingClientRect();
    return event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
  }

  function getNearestEdgeSide(point) {
    const distances = {
      north: point.yNorm,
      south: 1 - point.yNorm,
      west: point.xNorm,
      east: 1 - point.xNorm,
    };
    return Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
  }

  function getEdgePosition(side, point) {
    return side === "north" || side === "south" ? point.xNorm : point.yNorm;
  }

  function setEdgeRange(edge, center, width = 0.16) {
    const safeWidth = clamp(Number(width) || 0.16, 0.02, 1);
    let start = Number(center) - safeWidth / 2;
    let end = Number(center) + safeWidth / 2;
    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > 1) {
      start -= end - 1;
      end = 1;
    }
    edge.start = roundNorm(start);
    edge.end = roundNorm(end);
  }

  function isGeneratedEdgeNote(note) {
    const value = String(note || "").trim();
    return !value || value === "Outer wilderness edge" || value.startsWith("Connects to ");
  }

  function updateEdgeNeighborFields(edge, region, side, replaceGeneratedNote = true) {
    const neighbor = getNeighbor(region, side);
    const shouldReplaceNote = replaceGeneratedNote && isGeneratedEdgeNote(edge.notes);
    edge.side = side;
    edge.connectsToRegionId = neighbor?.id || "";
    edge.intentionalOuter = !neighbor;
    if (shouldReplaceNote) edge.notes = neighbor ? `Connects to ${neighbor.name}` : "Outer wilderness edge";
  }

  function placeFromEvent(event) {
    const region = currentRegion();
    if (!region) return;
    const point = getNormPointFromEvent(event);
    if (state.tool === "city") addCity(region, point);
    if (state.tool === "stronghold") addStronghold(region, point);
    if (state.tool === "camp") addCamp(region, point);
    if (state.tool === "edge") addEdgeConnection(region, point);
  }

  function addRegion() {
    const occupied = new Set(state.regions.map(region => `${region.gridX},${region.gridY}`));
    let gridX = state.selected?.kind === "gridCell" ? state.selected.gridX : 0;
    let gridY = state.selected?.kind === "gridCell" ? state.selected.gridY : 0;
    if (occupied.has(`${gridX},${gridY}`)) {
      if (state.selected?.kind === "gridCell") {
        setStatus(`Grid cell ${gridX}, ${gridY} already has a region.`);
        return;
      }
      while (occupied.has(`${gridX},${gridY}`)) gridX += 1;
    }
    const index = state.regions.length + 1;
    const id = uniqueId(state.regions, `region_${index}`);
    const region = normalizeRegion({
      id,
      name: titleFromId(id),
      type: "starter",
      gridX,
      gridY,
      width: state.layout.globalSettings.defaultMapWidth,
      height: state.layout.globalSettings.defaultMapHeight,
      imagePath: "",
      cityCapacity: 50,
      cities: [],
      strongholds: [],
      camps: [],
      edgeConnections: {},
    }, index);
    state.regions.push(region);
    state.activeRegionId = region.id;
    state.selected = { kind: "region", regionId: region.id };
    markDirty(`Added region ${region.name} at ${gridX}, ${gridY}.`);
    render();
  }

  function addCity(region, point) {
    const id = uniqueId(region.cities, `${region.id}_city_${String(region.cities.length + 1).padStart(3, "0")}`);
    const city = normalizeCity({
      id,
      name: generateEditorCityName(region.id, region.cities.length, id),
      xNorm: point.xNorm,
      yNorm: point.yNorm,
      level: 1,
      owner: "neutral",
      startType: "neutral",
      troops: 10,
    }, region.cities.length, region);
    region.cities.push(city);
    state.selected = { kind: "city", regionId: region.id, index: region.cities.length - 1 };
    markDirty(`Added city at ${city.xNorm}, ${city.yNorm}.`);
    render();
  }

  function addStronghold(region, point) {
    const requestedType = elements.strongholdTypeSelect.value || "gold_stronghold";
    const strongholdType = requestedType === "crown_citadel" || region.type === "crownlands_main"
      ? requestedType
      : requestedType;
    const defaults = STRONGHOLD_DEFAULTS[strongholdType] || STRONGHOLD_DEFAULTS.gold_stronghold;
    const stronghold = normalizeStronghold({
      id: uniqueId(region.strongholds, `${region.id}_${strongholdType}`),
      name: defaults.name,
      xNorm: point.xNorm,
      yNorm: point.yNorm,
      strongholdType,
      bonusType: defaults.bonusType,
      bonusAmount: defaults.bonusAmount,
      startingOwner: "neutral",
      level: defaults.level,
      troops: defaults.troops,
      artSrc: defaults.artSrc,
      size: defaults.size,
      flipX: false,
    }, region.strongholds.length, region);
    region.strongholds.push(stronghold);
    state.selected = { kind: "stronghold", regionId: region.id, index: region.strongholds.length - 1 };
    markDirty(`Added ${stronghold.name}.`);
    render();
  }

  function addCamp(region, point) {
    const campType = CAMP_TYPES.includes(elements.campTypeSelect.value) ? elements.campTypeSelect.value : "gold";
    const defaults = CAMP_DEFAULTS[campType] || CAMP_DEFAULTS.gold;
    const economyDefaults = state.economy?.camps?.[campType] || {};
    const camp = normalizeCamp({
      id: uniqueId(region.camps, `${region.id}_${campType}_camp`),
      name: defaults.name,
      xNorm: point.xNorm,
      yNorm: point.yNorm,
      campType,
      artSrc: defaults.artSrc,
      size: defaults.size,
      flipX: false,
      rewardSchedule: economyDefaults.rewardSchedule,
      maxDailyRewards: economyDefaults.maxDailyRewards,
    }, region.camps.length, region);
    region.camps.push(camp);
    state.selected = { kind: "camp", regionId: region.id, index: region.camps.length - 1 };
    markDirty(`Added ${camp.name}.`);
    render();
  }

  function addEdgeConnection(region, point) {
    const side = getNearestEdgeSide(point);
    const along = getEdgePosition(side, point);
    const neighbor = getNeighbor(region, side);
    const zone = {
      id: uniqueId(region.edgeConnections[side], `${side}_${elements.edgeTypeSelect.value || "road"}`),
      side,
      start: 0,
      end: 0,
      type: elements.edgeTypeSelect.value || "road",
      connectsToRegionId: neighbor?.id || "",
      intentionalOuter: !neighbor,
      notes: neighbor ? `Connects to ${neighbor.name}` : "Outer wilderness edge",
    };
    setEdgeRange(zone, along, 0.16);
    setDefaultEdgeArrowPosition(zone, side);
    region.edgeConnections[side].push(zone);
    state.selected = { kind: "edge", regionId: region.id, side, index: region.edgeConnections[side].length - 1 };
    markDirty(`Added ${side} edge connection.`);
    render();
  }

  function uniqueId(collection, baseId) {
    const used = new Set(collection.map(item => item.id));
    let candidate = slugify(baseId, "item");
    if (!used.has(candidate)) return candidate;
    let index = 2;
    while (used.has(`${candidate}_${index}`)) index += 1;
    return `${candidate}_${index}`;
  }

  function deleteSelected() {
    if (!state.selected) return;
    const region = getRegion(state.selected.regionId);
    if (!region) return;
    if (state.selected.kind === "region") {
      state.regions = state.regions.filter(item => item.id !== region.id);
      state.activeRegionId = state.regions[0]?.id || "";
    } else if (state.selected.kind === "city") {
      region.cities.splice(state.selected.index, 1);
    } else if (state.selected.kind === "stronghold") {
      region.strongholds.splice(state.selected.index, 1);
    } else if (state.selected.kind === "camp") {
      region.camps.splice(state.selected.index, 1);
    } else if (state.selected.kind === "edge") {
      region.edgeConnections[state.selected.side].splice(state.selected.index, 1);
    }
    state.selected = null;
    markDirty("Deleted selected item.");
    render();
  }

  function renderInspector() {
    const item = getSelectedItem();
    if (!item) {
      elements.selectionTitle.textContent = "None";
      elements.selectionForm.className = "selection-form empty";
      elements.selectionForm.textContent = "Select a grid cell, region, city, stronghold, camp, or edge connection.";
      renderValidationList();
      return;
    }
    elements.selectionForm.className = "selection-form";
    if (state.selected.kind === "gridCell") renderGridCellForm(item);
    if (state.selected.kind === "region") renderRegionForm(item);
    if (state.selected.kind === "city") renderCityForm(item, getRegion(state.selected.regionId));
    if (state.selected.kind === "stronghold") renderStrongholdForm(item, getRegion(state.selected.regionId));
    if (state.selected.kind === "camp") renderCampForm(item, getRegion(state.selected.regionId));
    if (state.selected.kind === "edge") renderEdgeForm(item, getRegion(state.selected.regionId));
    renderValidationList();
  }

  function optionList(values, selected) {
    return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(titleFromId(value))}</option>`).join("");
  }

  function renderGridCellForm(cell) {
    elements.selectionTitle.textContent = `Grid ${cell.gridX}, ${cell.gridY}`;
    elements.selectionForm.innerHTML = `
      <div class="form-grid">
        <label><span>Grid X</span><input value="${cell.gridX}" readonly /></label>
        <label><span>Grid Y</span><input value="${cell.gridY}" readonly /></label>
        <p class="wide helper-text">Click Add Region to place a new region in this empty square.</p>
      </div>
    `;
  }

  function renderRegionForm(region) {
    elements.selectionTitle.textContent = region.name;
    elements.selectionForm.innerHTML = `
      <div class="form-grid">
        <label class="wide"><span>Region ID</span><input data-field="id" data-commit="change" value="${escapeHtml(region.id)}" /></label>
        <label class="wide"><span>Name</span><input data-field="name" value="${escapeHtml(region.name)}" /></label>
        <label><span>Type</span><select data-field="type">${optionList(REGION_TYPES, region.type)}</select></label>
        <label><span>Cities Placed</span><input value="${region.cities.length}" readonly /></label>
        <label><span>Camps Placed</span><input value="${region.camps.length}" readonly /></label>
        <label><span>City Capacity</span><input data-field="cityCapacity" type="number" min="0" value="${region.cityCapacity}" /></label>
        <label><span>Grid X</span><input data-field="gridX" type="number" value="${region.gridX}" /></label>
        <label><span>Grid Y</span><input data-field="gridY" type="number" value="${region.gridY}" /></label>
        <label><span>Width</span><input data-field="width" type="number" min="256" value="${region.width}" /></label>
        <label><span>Height</span><input data-field="height" type="number" min="256" value="${region.height}" /></label>
        <label class="wide"><span>Map Image Path</span><input data-field="imagePath" value="${escapeHtml(region.imagePath)}" /></label>
        <label class="wide"><span>Notes</span><textarea data-field="notes">${escapeHtml(region.notes)}</textarea></label>
      </div>
    `;
  }

  function renderCityForm(city, region) {
    const px = Math.round(city.xNorm * region.width);
    const py = Math.round(city.yNorm * region.height);
    elements.selectionTitle.textContent = city.name;
    elements.selectionForm.innerHTML = `
      <div class="form-grid">
        <label class="wide"><span>City ID</span><input data-field="id" value="${escapeHtml(city.id)}" /></label>
        <label class="wide"><span>Name</span><input data-field="name" value="${escapeHtml(city.name)}" /></label>
        <label><span>Region ID</span><input value="${escapeHtml(region.id)}" readonly /></label>
        <label><span>Level</span><input data-field="level" type="number" min="1" max="100" value="${city.level}" /></label>
        <label><span>xNorm</span><input data-field="xNorm" type="number" min="0" max="1" step="0.001" value="${city.xNorm}" /></label>
        <label><span>yNorm</span><input data-field="yNorm" type="number" min="0" max="1" step="0.001" value="${city.yNorm}" /></label>
        <label><span>Pixel X</span><input value="${px}" readonly /></label>
        <label><span>Pixel Y</span><input value="${py}" readonly /></label>
        <label><span>Owner</span><input data-field="owner" value="${escapeHtml(city.owner)}" /></label>
        <label><span>Start Type</span><input data-field="startType" value="${escapeHtml(city.startType)}" /></label>
        <label class="wide"><span>Starting Troops</span><input data-field="troops" type="number" min="0" value="${city.troops}" /></label>
      </div>
    `;
  }

  function renderStrongholdForm(stronghold, region) {
    const px = Math.round(stronghold.xNorm * region.width);
    const py = Math.round(stronghold.yNorm * region.height);
    elements.selectionTitle.textContent = stronghold.name;
    elements.selectionForm.innerHTML = `
      <div class="form-grid">
        <label class="wide"><span>Stronghold ID</span><input data-field="id" value="${escapeHtml(stronghold.id)}" /></label>
        <label class="wide"><span>Name</span><input data-field="name" value="${escapeHtml(stronghold.name)}" /></label>
        <label class="wide"><span>Stronghold Type</span><select data-field="strongholdType">${optionList(STRONGHOLD_TYPES, stronghold.strongholdType)}</select></label>
        <label><span>Bonus Type</span><input data-field="bonusType" value="${escapeHtml(stronghold.bonusType)}" /></label>
        <label><span>Bonus Amount</span><input data-field="bonusAmount" type="number" min="0" value="${stronghold.bonusAmount}" /></label>
        <label><span>Level</span><input data-field="level" type="number" min="1" max="100" value="${stronghold.level}" /></label>
        <label><span>Troops</span><input data-field="troops" type="number" min="0" value="${stronghold.troops}" /></label>
        <label><span>xNorm</span><input data-field="xNorm" type="number" min="0" max="1" step="0.001" value="${stronghold.xNorm}" /></label>
        <label><span>yNorm</span><input data-field="yNorm" type="number" min="0" max="1" step="0.001" value="${stronghold.yNorm}" /></label>
        <label><span>Pixel X</span><input value="${px}" readonly /></label>
        <label><span>Pixel Y</span><input value="${py}" readonly /></label>
        <label><span>Starting Owner</span><input data-field="startingOwner" value="${escapeHtml(stronghold.startingOwner)}" /></label>
        <label><span>Visual Size</span><input data-field="size" type="number" min="1" value="${stronghold.size}" /></label>
        <label class="wide check-row"><input data-field="flipX" type="checkbox" ${stronghold.flipX ? "checked" : ""} /><span>Flip image horizontally (X axis)</span></label>
        <label class="wide"><span>Art Path</span><input data-field="artSrc" value="${escapeHtml(stronghold.artSrc)}" /></label>
        <label class="wide"><span>Notes</span><textarea data-field="notes">${escapeHtml(stronghold.notes)}</textarea></label>
      </div>
    `;
  }

  function renderCampForm(camp, region) {
    const px = Math.round(camp.xNorm * region.width);
    const py = Math.round(camp.yNorm * region.height);
    const rewardEditor = camp.campType === "gold" || camp.campType === "troops"
      ? `
        <div class="camp-reward-editor">
          <p class="helper-text">Each row is one reward available per UTC day. The payout is the greater of the minimum reward or the player's listed production hours.</p>
          ${(camp.rewardSchedule || []).map((reward, index) => `
            <div class="camp-reward-row">
              <strong>${index + 1}</strong>
              <label><span>Minimum ${camp.campType === "gold" ? "Gold" : "Troops"}</span><input data-camp-reward-index="${index}" data-camp-reward-field="minimumReward" type="number" min="0" step="1" value="${reward.minimumReward}" /></label>
              <label><span>Production Hours</span><input data-camp-reward-index="${index}" data-camp-reward-field="productionHours" type="number" min="0.01" step="0.1" value="${reward.productionHours}" /></label>
              <button type="button" data-camp-action="remove-reward" data-camp-reward-index="${index}" aria-label="Remove daily reward ${index + 1}">&times;</button>
            </div>
          `).join("")}
          <button type="button" data-camp-action="add-reward">Add Daily Reward</button>
        </div>
      `
      : camp.campType === "items"
        ? `<label class="wide"><span>Items Awarded Per UTC Day</span><input data-field="maxDailyRewards" type="number" min="0" step="1" value="${camp.maxDailyRewards}" /></label>`
        : `<p class="wide helper-text">Deed Camp rewards remain one neutral city deed and are not edited as gold, troops, or relic items.</p>`;
    elements.selectionTitle.textContent = camp.name;
    elements.selectionForm.innerHTML = `
      <div class="form-grid">
        <label class="wide"><span>Camp ID</span><input data-field="id" value="${escapeHtml(camp.id)}" /></label>
        <label class="wide"><span>Name</span><input data-field="name" value="${escapeHtml(camp.name)}" /></label>
        <label class="wide"><span>Camp Type</span><select data-field="campType">${optionList(CAMP_TYPES, camp.campType)}</select></label>
        <label><span>Region ID</span><input value="${escapeHtml(region.id)}" readonly /></label>
        <label><span>xNorm</span><input data-field="xNorm" type="number" min="0" max="1" step="0.001" value="${camp.xNorm}" /></label>
        <label><span>yNorm</span><input data-field="yNorm" type="number" min="0" max="1" step="0.001" value="${camp.yNorm}" /></label>
        <label><span>Pixel X</span><input value="${px}" readonly /></label>
        <label><span>Pixel Y</span><input value="${py}" readonly /></label>
        <label><span>Visual Size</span><input data-field="size" type="number" min="1" value="${camp.size}" /></label>
        <label class="wide check-row"><input data-field="flipX" type="checkbox" ${camp.flipX ? "checked" : ""} /><span>Flip image horizontally (X axis)</span></label>
        <label class="wide"><span>Art Path</span><input data-field="artSrc" value="${escapeHtml(camp.artSrc)}" /></label>
        <label class="wide"><span>Notes</span><textarea data-field="notes">${escapeHtml(camp.notes)}</textarea></label>
        ${rewardEditor}
      </div>
    `;
  }

  function renderEdgeForm(edge, region) {
    const neighbor = getNeighbor(region, edge.side);
    const arrowPoint = getEdgeArrowPoint(edge);
    elements.selectionTitle.textContent = `${titleFromId(edge.side)} ${titleFromId(edge.type)}`;
    elements.selectionForm.innerHTML = `
      <div class="form-grid">
        <label class="wide"><span>Connection ID</span><input data-field="id" value="${escapeHtml(edge.id)}" /></label>
        <label><span>Side</span><select data-field="side">${optionList(SIDES, edge.side)}</select></label>
        <label><span>Type</span><select data-field="type">${optionList(EDGE_TYPES, edge.type)}</select></label>
        <label><span>Start</span><input data-field="start" type="number" min="0" max="1" step="0.001" value="${edge.start}" /></label>
        <label><span>End</span><input data-field="end" type="number" min="0" max="1" step="0.001" value="${edge.end}" /></label>
        <label><span>Arrow X</span><input data-field="arrowXNorm" type="number" min="0" max="1" step="0.001" value="${arrowPoint.xNorm}" /></label>
        <label><span>Arrow Y</span><input data-field="arrowYNorm" type="number" min="0" max="1" step="0.001" value="${arrowPoint.yNorm}" /></label>
        <label class="wide"><span>Connects To Region ID</span><input data-field="connectsToRegionId" value="${escapeHtml(edge.connectsToRegionId || neighbor?.id || "")}" /></label>
        <label class="wide check-row"><input data-field="intentionalOuter" type="checkbox" ${edge.intentionalOuter ? "checked" : ""} /><span>Intentional outer fog / wilderness edge</span></label>
        <p class="wide helper-text">Drag the blue strip to move the hidden troop crossing. Drag the arrow to move the visible map-switch icon players tap.</p>
        <label class="wide"><span>Notes</span><textarea data-field="notes">${escapeHtml(edge.notes)}</textarea></label>
      </div>
    `;
  }

  function renderValidationList() {
    const errors = state.validation.filter(item => item.level === "error").length;
    const warnings = state.validation.filter(item => item.level === "warning").length;
    if (!state.validation.length) {
      elements.validationSummary.textContent = "Not checked";
      elements.validationList.textContent = "Press Validate Game when you want a full map and economy check.";
      return;
    }
    elements.validationSummary.textContent = errors ? `${errors} errors` : warnings ? `${warnings} warnings` : "Clean";
    elements.validationList.innerHTML = state.validation
      .map(item => `<div class="validation-item ${item.level === "error" ? "error" : item.level === "ok" ? "ok" : ""}">${escapeHtml(item.text)}</div>`)
      .join("");
  }

  function handleWorldFieldInput(event) {
    const target = event.target;
    if (target === elements.worldIdInput) state.layout.worldId = slugify(target.value, "world_01");
    if (target === elements.worldNameInput) state.layout.worldName = target.value;
    markDirty();
    renderCounts();
  }

  function handleSelectionInput(event) {
    const target = event.target;
    if (target.dataset.campRewardIndex !== undefined && target.dataset.campRewardField) {
      updateCampRewardInput(target);
      return;
    }
    const field = target.dataset.field;
    if (!field || !state.selected) return;
    const item = getSelectedItem();
    const region = getRegion(state.selected.regionId);
    if (!item || !region) return;
    const value = target.type === "checkbox" ? target.checked : target.value;
    const shouldDefer = target.dataset.commit === "change" && event.type !== "change";
    updateSelectedField(item, field, value, { commit: !shouldDefer });
    markDirty();
    renderWorkspace();
    renderCounts();
  }

  function handleSelectionChange(event) {
    const target = event.target;
    if (target.dataset.campRewardIndex !== undefined && target.dataset.campRewardField) {
      updateCampRewardInput(target);
      return;
    }
    const field = target.dataset.field;
    if (!field || !state.selected) return;
    const item = getSelectedItem();
    if (!item) return;
    updateSelectedField(item, field, target.type === "checkbox" ? target.checked : target.value, { commit: true });
    markDirty();
    render();
  }

  function updateSelectedField(item, field, value, options = {}) {
    if (options.commit === false) return;
    if (state.selected.kind === "region") {
      updateRegionField(item, field, value);
      return;
    }
    if (state.selected.kind === "edge" && field === "side") {
      moveEdgeToSide(value);
      return;
    }
    if (["xNorm", "yNorm", "start", "end", "arrowXNorm", "arrowYNorm"].includes(field)) item[field] = roundNorm(value);
    else if (field === "size") item[field] = readVisualSize(value, item.size);
    else if (["level", "troops", "bonusAmount", "maxDailyRewards"].includes(field)) item[field] = Math.max(0, Math.floor(Number(value) || 0));
    else if (field === "strongholdType") applyStrongholdType(item, value);
    else if (field === "campType") applyCampType(item, value);
    else if (field === "intentionalOuter" || field === "flipX") item[field] = Boolean(value);
    else item[field] = String(value);
    if (state.selected.kind === "city") item.regionId = state.selected.regionId;
    if (state.selected.kind === "stronghold") item.regionId = state.selected.regionId;
    if (state.selected.kind === "camp") item.regionId = state.selected.regionId;
    if (state.selected.kind === "edge") {
      item.side = state.selected.side;
      if (item.start > item.end) [item.start, item.end] = [item.end, item.start];
    }
  }

  function updateRegionField(region, field, value) {
    if (field === "id") {
      const nextId = slugify(value, region.id);
      if (!nextId || (nextId !== region.id && getRegion(nextId))) {
        setStatus("Region ID must be unique.");
        return;
      }
      renameRegion(region, nextId);
      return;
    }
    if (["gridX", "gridY", "cityCapacity", "width", "height"].includes(field)) {
      region[field] = Math.max(field === "cityCapacity" ? 0 : 1, Math.floor(Number(value) || 0));
      if (field === "width" || field === "height") {
        syncRegionAspectFromField(region, field);
        setStatus(`${region.name} map size locked to 4:3 (${region.width} x ${region.height}).`);
      }
    } else {
      region[field] = String(value);
    }
    if (field === "type" && region.type === "crownlands_main" && region.cityCapacity < 100) region.cityCapacity = 100;
  }

  function renameRegion(region, nextId) {
    const oldId = region.id;
    region.id = nextId;
    region.regionPath = `assets/worlds/world_01/regions/${nextId}.json`;
    region.cities.forEach(city => { city.regionId = nextId; });
    region.strongholds.forEach(stronghold => { stronghold.regionId = nextId; });
    region.camps.forEach(camp => { camp.regionId = nextId; });
    state.regions.forEach(other => {
      SIDES.forEach(side => {
        other.edgeConnections[side].forEach(zone => {
          if (zone.connectsToRegionId === oldId) zone.connectsToRegionId = nextId;
        });
      });
    });
    state.activeRegionId = nextId;
    if (state.selected) state.selected.regionId = nextId;
  }

  function applyStrongholdType(stronghold, type) {
    const nextType = STRONGHOLD_TYPES.includes(type) ? type : "gold_stronghold";
    const defaults = STRONGHOLD_DEFAULTS[nextType] || STRONGHOLD_DEFAULTS.gold_stronghold;
    stronghold.strongholdType = nextType;
    stronghold.name = defaults.name;
    stronghold.bonusType = defaults.bonusType;
    stronghold.bonusAmount = defaults.bonusAmount;
    stronghold.level = defaults.level;
    stronghold.troops = defaults.troops;
    stronghold.artSrc = defaults.artSrc;
    stronghold.size = defaults.size;
  }

  function applyCampType(camp, type) {
    const nextType = CAMP_TYPES.includes(type) ? type : "gold";
    const defaults = CAMP_DEFAULTS[nextType] || CAMP_DEFAULTS.gold;
    camp.campType = nextType;
    camp.name = defaults.name;
    camp.artSrc = defaults.artSrc;
    camp.size = defaults.size;
    delete camp.rewardSchedule;
    delete camp.maxDailyRewards;
    if (nextType === "gold" || nextType === "troops") {
      const economyDefaults = state.economy?.camps?.[nextType]?.rewardSchedule || CAMP_REWARD_DEFAULTS[nextType];
      camp.rewardSchedule = deepClone(economyDefaults);
    }
    if (nextType === "items") {
      camp.maxDailyRewards = Math.max(0, Math.floor(Number(state.economy?.camps?.items?.maxDailyRewards) || 2));
    }
  }

  function updateCampRewardInput(target) {
    const camp = getSelectedItem();
    if (state.selected?.kind !== "camp" || !camp || !Array.isArray(camp.rewardSchedule)) return;
    const index = Math.max(0, Math.floor(Number(target.dataset.campRewardIndex) || 0));
    const reward = camp.rewardSchedule[index];
    if (!reward) return;
    if (target.dataset.campRewardField === "minimumReward") {
      reward.minimumReward = Math.max(0, Math.floor(Number(target.value) || 0));
    }
    if (target.dataset.campRewardField === "productionHours") {
      reward.productionHours = Math.max(0.01, Number(target.value) || 0.01);
    }
    markDirty("Updated this camp's daily reward schedule.");
  }

  function handleCampRewardAction(event) {
    const button = event.target.closest("[data-camp-action]");
    if (!button || state.selected?.kind !== "camp") return;
    const camp = getSelectedItem();
    if (!camp || !Array.isArray(camp.rewardSchedule)) return;
    if (button.dataset.campAction === "add-reward" && camp.rewardSchedule.length < 12) {
      const previous = camp.rewardSchedule[camp.rewardSchedule.length - 1] || { minimumReward: 0, productionHours: 1 };
      camp.rewardSchedule.push({
        minimumReward: Math.max(0, Math.floor(Number(previous.minimumReward) || 0)),
        productionHours: Math.max(0.01, Number(previous.productionHours) || 1),
      });
    }
    if (button.dataset.campAction === "remove-reward" && camp.rewardSchedule.length > 1) {
      const index = Math.max(0, Math.floor(Number(button.dataset.campRewardIndex) || 0));
      camp.rewardSchedule.splice(index, 1);
    }
    markDirty(`Updated ${camp.name}'s daily reward count.`);
    renderInspector();
  }

  function moveEdgeRecord(region, fromSide, fromIndex, nextSide, options = {}) {
    const side = SIDES.includes(nextSide) ? nextSide : fromSide;
    const edge = region?.edgeConnections[fromSide]?.[fromIndex];
    if (!edge) return null;
    if (side === fromSide) return { edge, side, index: fromIndex };
    region.edgeConnections[fromSide].splice(fromIndex, 1);
    region.edgeConnections[side].push(edge);
    const index = region.edgeConnections[side].length - 1;
    if (options.updateNeighbor) {
      updateEdgeNeighborFields(edge, region, side);
      setDefaultEdgeArrowPosition(edge, side);
    } else {
      edge.side = side;
    }
    return { edge, side, index };
  }

  function moveEdgeToSide(nextSide) {
    const side = SIDES.includes(nextSide) ? nextSide : state.selected.side;
    if (side === state.selected.side) return;
    const region = getRegion(state.selected.regionId);
    const moved = moveEdgeRecord(region, state.selected.side, state.selected.index, side, { updateNeighbor: true });
    if (!moved) return;
    state.selected.side = moved.side;
    state.selected.index = moved.index;
  }

  function validateWorld() {
    const results = [];
    const regionIds = new Map();
    const gridCells = new Map();
    const cityIds = new Map();
    const strongholdIds = new Map();
    const campIds = new Map();

    state.regions.forEach(region => {
      addCheck(results, region.id, "error", `Region has an ID: ${region.name}`);
      if (regionIds.has(region.id)) results.push({ level: "error", text: `Duplicate region ID: ${region.id}` });
      regionIds.set(region.id, region);
      if (!Number.isFinite(Number(region.gridX)) || !Number.isFinite(Number(region.gridY))) results.push({ level: "error", text: `${region.name} needs gridX/gridY.` });
      const cellKey = `${region.gridX},${region.gridY}`;
      if (gridCells.has(cellKey)) results.push({ level: "error", text: `${region.name} overlaps ${gridCells.get(cellKey).name} at grid ${cellKey}.` });
      gridCells.set(cellKey, region);
      if (!region.imagePath) results.push({ level: "error", text: `${region.name} needs a map image path.` });
      if (!isFourThreeDimensions(region.width, region.height)) results.push({ level: "error", text: `${region.name} map size must stay 4:3, such as ${DEFAULT_MAP_WIDTH} x ${DEFAULT_MAP_HEIGHT}.` });
      if (region.cities.length > region.cityCapacity) results.push({ level: "warning", text: `${region.name} has ${region.cities.length} cities over capacity ${region.cityCapacity}.` });
      if (region.type === "crownlands_main" && region.cityCapacity < 100) results.push({ level: "warning", text: `${region.name} is Crownlands main and should allow 100 cities.` });
      if (region.type !== "crownlands_main" && (region.cityCapacity < 50 || region.cityCapacity > 60)) results.push({ level: "warning", text: `${region.name} standard capacity should be around 50-60.` });

      region.cities.forEach(city => {
        if (cityIds.has(city.id)) results.push({ level: "error", text: `Duplicate city ID: ${city.id}` });
        cityIds.set(city.id, city);
        if (!isNormInside(city.xNorm, city.yNorm)) results.push({ level: "error", text: `${city.name} is outside map bounds.` });
      });
      checkCitySpacing(results, region);

      region.strongholds.forEach(stronghold => {
        if (strongholdIds.has(stronghold.id)) results.push({ level: "error", text: `Duplicate stronghold ID: ${stronghold.id}` });
        strongholdIds.set(stronghold.id, stronghold);
        if (!isNormInside(stronghold.xNorm, stronghold.yNorm)) results.push({ level: "error", text: `${stronghold.name} is outside map bounds.` });
        if (stronghold.strongholdType === "crown_citadel" && region.type !== "crownlands_main") {
          results.push({ level: "warning", text: `${stronghold.name} is a Crown Citadel outside a crownlands_main region.` });
        }
      });

      region.camps.forEach(camp => {
        if (campIds.has(camp.id)) results.push({ level: "error", text: `Duplicate camp ID: ${camp.id}` });
        campIds.set(camp.id, camp);
        if (!CAMP_TYPES.includes(camp.campType)) results.push({ level: "error", text: `${camp.name} has an unknown camp type.` });
        if (!isNormInside(camp.xNorm, camp.yNorm)) results.push({ level: "error", text: `${camp.name} is outside map bounds.` });
        if (!camp.artSrc) results.push({ level: "warning", text: `${camp.name} needs a camp image path.` });
        if ((camp.campType === "gold" || camp.campType === "troops") && (!Array.isArray(camp.rewardSchedule) || !camp.rewardSchedule.length)) {
          results.push({ level: "error", text: `${camp.name} needs at least one daily reward.` });
        }
        (camp.rewardSchedule || []).forEach((reward, index) => {
          if (Number(reward.minimumReward) < 0 || Number(reward.productionHours) <= 0) {
            results.push({ level: "error", text: `${camp.name} reward ${index + 1} needs a non-negative minimum and positive production hours.` });
          }
        });
      });
    });

    state.regions.forEach(region => {
      SIDES.forEach(side => validateEdgeSide(results, region, side));
      ["east", "south"].forEach(side => {
        const neighbor = getNeighbor(region, side);
        if (!neighbor) return;
        if (!hasMatchingConnection(region, neighbor, side)) {
          results.push({ level: "warning", text: `${region.name} ${side} edge should match ${neighbor.name} ${OPPOSITE_SIDE[side]} edge.` });
        }
      });
    });
    validateEconomy(results);
    const hudIssues = window.CrownlandsHudEditor?.validate() || [];
    hudIssues.forEach(text => results.push({ level: "warning", text }));

    if (!results.some(item => item.level === "error" || item.level === "warning")) {
      results.push({ level: "ok", text: "Game map, economy, and HUD layout validation passed." });
    }
    state.validation = results;
    renderValidationList();
    setStatus("Game validation complete.");
  }

  function validateEconomy(results) {
    const economy = state.economy;
    if (!economy) {
      results.push({ level: "error", text: "Economy configuration is not loaded." });
      return;
    }
    SHOP_ITEM_EDITOR.forEach(item => {
      const config = economy.shopItems?.[item.id];
      if (!config) {
        results.push({ level: "error", text: `${item.label} is missing economy settings.` });
        return;
      }
      if (Number(config.cost) < 0) results.push({ level: "error", text: `${item.label} cost cannot be negative.` });
      if (Number(config.dailyPurchaseLimit) < 0) results.push({ level: "error", text: `${item.label} daily purchase cap cannot be negative.` });
      if (item.duration && Number(config.effectDurationMinutes) <= 0) results.push({ level: "error", text: `${item.label} effect duration must be positive.` });
      if (item.bonus && Number(config.bonusPercent) < 0) results.push({ level: "error", text: `${item.label} bonus cannot be negative.` });
    });
    const pickups = economy.pickups || {};
    if (Number(pickups.initialSpawnDelayMinutes) <= 0) results.push({ level: "error", text: "Pickup initial spawn delay must be positive." });
    if (Number(pickups.respawnAfterCollectionMinutes) <= 0) results.push({ level: "error", text: "Pickup collection respawn delay must be positive." });
    if (Number(pickups.goldAwardProductionMinutes) <= 0 || Number(pickups.troopAwardProductionMinutes) <= 0) {
      results.push({ level: "error", text: "Pickup production awards must be positive." });
    }
    if (Number(pickups.dailyGoldCap) + Number(pickups.dailyTroopCap) > Number(pickups.dailyTotalCap)) {
      results.push({ level: "warning", text: "Gold and troop pickup caps exceed the combined daily pickup cap." });
    }
    ["gold", "troops"].forEach(campType => {
      const schedule = economy.camps?.[campType]?.rewardSchedule;
      if (!Array.isArray(schedule) || !schedule.length) {
        results.push({ level: "error", text: `${campType === "gold" ? "Gold" : "Warband"} Camp defaults need at least one daily reward.` });
      }
    });
  }

  function addCheck(results, condition, level, text) {
    if (!condition) results.push({ level, text });
  }

  function isNormInside(xNorm, yNorm) {
    return Number.isFinite(Number(xNorm)) && Number.isFinite(Number(yNorm)) && xNorm >= 0 && xNorm <= 1 && yNorm >= 0 && yNorm <= 1;
  }

  function checkCitySpacing(results, region) {
    const minSpacing = Number(state.layout.globalSettings.minimumCitySpacing) || 0.045;
    for (let i = 0; i < region.cities.length; i += 1) {
      for (let j = i + 1; j < region.cities.length; j += 1) {
        const a = region.cities[i];
        const b = region.cities[j];
        const distance = Math.hypot(a.xNorm - b.xNorm, a.yNorm - b.yNorm);
        if (cityUiLabelsOverlap(getCityUiLabelRect(a, region), getCityUiLabelRect(b, region))) {
          results.push({ level: "warning", text: `${a.name} and ${b.name} have overlapping name/level UI in ${region.name}.` });
        } else if (distance < minSpacing) {
          results.push({ level: "warning", text: `${a.name} and ${b.name} are closer than minimum spacing in ${region.name}.` });
        }
      }
    }
  }

  function validateEdgeSide(results, region, side) {
    const neighbor = getNeighbor(region, side);
    const zones = region.edgeConnections[side] || [];
    zones.forEach(zone => {
      if (zone.start < 0 || zone.end > 1 || zone.start >= zone.end) results.push({ level: "error", text: `${region.name} ${side} connection ${zone.id} has invalid start/end.` });
      const arrow = getEdgeArrowPoint(zone);
      if (!isNormInside(arrow.xNorm, arrow.yNorm)) results.push({ level: "error", text: `${region.name} ${side} connection ${zone.id} has an arrow outside map bounds.` });
      if (!neighbor && !zone.intentionalOuter) results.push({ level: "warning", text: `${region.name} ${side} connection leads to empty grid. Mark as outer wilderness if intentional.` });
      if (neighbor && zone.connectsToRegionId && zone.connectsToRegionId !== neighbor.id) {
        results.push({ level: "warning", text: `${region.name} ${side} connection points to ${zone.connectsToRegionId}, but adjacent region is ${neighbor.id}.` });
      }
    });
  }

  function exportJson() {
    const payload = {
      ...buildSavePayload(),
      economy: deepClone(state.economy),
      uiLayout: window.CrownlandsHudEditor?.getConfig(),
    };
    downloadJson(`${state.layout.worldId || "world"}-bundle.json`, payload);
    setStatus("Exported map, economy, and HUD layout JSON bundle.");
  }

  function downloadJson(filename, value) {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importJsonFile(file) {
    if (!file) return;
    const text = await file.text();
    const imported = JSON.parse(text);
    const data = normalizeBundle(imported);
    state.layout = data.layout;
    state.regions = data.regions;
    if (imported.economy && typeof imported.economy === "object") state.economy = imported.economy;
    if (imported.uiLayout && typeof imported.uiLayout === "object") window.CrownlandsHudEditor?.replaceConfig(imported.uiLayout);
    state.activeRegionId = state.regions[0]?.id || "";
    state.selected = null;
    state.validation = [];
    markDirty(`Imported ${file.name}.`);
    render();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
  }

  function readImageDimensions(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(dimensions);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image dimensions."));
      };
      image.src = url;
    });
  }

  async function uploadRegionImageFile(file) {
    if (!file) return;
    const region = currentRegion();
    if (!region || state.editorMode !== "region") {
      setStatus("Open a region in Region Edit before uploading a map image.", "error");
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setStatus("Map image must be a JPG, PNG, or WebP file.", "error");
      return;
    }
    setStatus(`Uploading ${file.name}...`, "busy");
    const [dataUrl, dimensions] = await Promise.all([
      readFileAsDataUrl(file),
      readImageDimensions(file),
    ]);
    if (!isFourThreeDimensions(dimensions.width, dimensions.height)) {
      setStatus(`Upload blocked: map image must be 4:3, such as ${DEFAULT_MAP_WIDTH} x ${DEFAULT_MAP_HEIGHT}. ${file.name} is ${dimensions.width} x ${dimensions.height}.`, "error");
      return;
    }
    const response = await fetch(MAP_IMAGE_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        regionId: region.id,
        previousImagePath: region.imagePath || "",
        filename: file.name,
        mimeType: file.type,
        base64: dataUrl.split(",")[1] || "",
        width: dimensions.width,
        height: dimensions.height,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error || `Upload failed: ${response.status}`;
      if (response.status === 404 && /unknown api route/i.test(message)) {
        throw new Error("Map upload needs the local editor server. Run .\\tools\\start-editor.ps1 from the repo, then open http://127.0.0.1:8791/editor/ and upload again.");
      }
      throw new Error(message);
    }
    region.imagePath = payload.imagePath;
    if (payload.width > 0) region.width = payload.width;
    if (payload.height > 0) region.height = payload.height;
    state.imagePreviewBusters[region.id] = payload.fileName || Date.now();
    state.selected = { kind: "region", regionId: region.id };
    const replacementText = payload.replacedImagePath ? " Replaced the previous uploaded map image." : "";
    markDirty(`Uploaded map image for ${region.name}.${replacementText} Preview updated. Click Save to Game to store it.`, "success");
    render();
  }

  function getRegionMarkerCollection(region, kind) {
    if (!region) return null;
    if (kind === "city") return region.cities;
    if (kind === "stronghold") return region.strongholds;
    if (kind === "camp") return region.camps;
    return null;
  }

  function handleMarkerDrag(event) {
    if (!state.draggingMarker) return;
    const region = getRegion(state.draggingMarker.regionId);
    const collection = getRegionMarkerCollection(region, state.draggingMarker.kind);
    const item = collection?.[state.draggingMarker.index];
    if (!item) return;
    const point = getNormPointFromEvent(event);
    item.xNorm = point.xNorm;
    item.yNorm = point.yNorm;
    markDirty();
    renderRegionEditor();
  }

  function stopMarkerDrag() {
    if (!state.draggingMarker) return;
    state.draggingMarker = null;
    renderInspector();
  }

  function handleEdgeDrag(event) {
    if (!state.draggingEdge || state.draggingEdge.pointerId !== event.pointerId) return;
    const region = getRegion(state.draggingEdge.regionId);
    if (!region) return;
    const point = getNormPointFromEvent(event);
    const nextSide = getNearestEdgeSide(point);
    let side = state.draggingEdge.side;
    let index = state.draggingEdge.index;
    let edge = region.edgeConnections[side]?.[index] || null;
    if (!edge) {
      state.draggingEdge = null;
      return;
    }
    if (nextSide !== side) {
      const moved = moveEdgeRecord(region, side, index, nextSide, { updateNeighbor: true });
      if (!moved) return;
      edge = moved.edge;
      side = moved.side;
      index = moved.index;
      state.draggingEdge.side = side;
      state.draggingEdge.index = index;
      setSelectedEdge(region.id, side, index);
    }
    setEdgeRange(edge, getEdgePosition(side, point), state.draggingEdge.width);
    markDirty();
    renderRegionEditor();
    event.preventDefault();
  }

  function stopEdgeDrag(event) {
    if (!state.draggingEdge || (event && state.draggingEdge.pointerId !== event.pointerId)) return;
    state.draggingEdge = null;
    state.skipNextCanvasClick = true;
    renderInspector();
    window.setTimeout(() => { state.skipNextCanvasClick = false; }, 140);
  }

  function handleEdgeArrowDrag(event) {
    if (!state.draggingEdgeArrow || state.draggingEdgeArrow.pointerId !== event.pointerId) return;
    const region = getRegion(state.draggingEdgeArrow.regionId);
    const edge = region?.edgeConnections[state.draggingEdgeArrow.side]?.[state.draggingEdgeArrow.index];
    if (!edge) {
      state.draggingEdgeArrow = null;
      return;
    }
    const point = getNormPointFromEvent(event);
    setEdgeArrowPosition(region, state.draggingEdgeArrow.side, edge, point);
    state.draggingEdgeArrow.lastPoint = point;
    markDirty();
    renderRegionEditor();
    event.preventDefault();
  }

  function stopEdgeArrowDrag(event) {
    if (!state.draggingEdgeArrow || (event && state.draggingEdgeArrow.pointerId !== event.pointerId)) return;
    const drag = state.draggingEdgeArrow;
    const region = getRegion(drag.regionId);
    const edge = region?.edgeConnections[drag.side]?.[drag.index];
    if (edge && drag.lastPoint) {
      setEdgeArrowPosition(region, drag.side, edge, drag.lastPoint);
      materializeEdgeArrowPositions([region]);
      markDirty();
    }
    state.draggingEdgeArrow = null;
    state.skipNextCanvasClick = true;
    renderInspector();
    window.setTimeout(() => { state.skipNextCanvasClick = false; }, 140);
  }

  function startRegionPan(event) {
    if (event.button !== 0 || event.target.closest(".map-marker, .edge-zone, .edge-switch-arrow")) return;
    state.panning = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: elements.regionViewport.scrollLeft,
      top: elements.regionViewport.scrollTop,
      moved: false,
    };
    elements.regionViewport.classList.add("panning");
    elements.regionViewport.setPointerCapture?.(event.pointerId);
  }

  function handleRegionPan(event) {
    if (!state.panning || state.panning.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.panning.x;
    const dy = event.clientY - state.panning.y;
    if (Math.hypot(dx, dy) > 6) state.panning.moved = true;
    elements.regionViewport.scrollLeft = state.panning.left - dx;
    elements.regionViewport.scrollTop = state.panning.top - dy;
    event.preventDefault();
  }

  function stopRegionPan(event) {
    if (!state.panning || state.panning.pointerId !== event.pointerId) return;
    const wasMoved = state.panning.moved;
    const shouldPlace = !wasMoved && state.tool !== "select" && isEventInsideRegionCanvas(event);
    state.skipNextCanvasClick = wasMoved || shouldPlace;
    state.panning = null;
    elements.regionViewport.classList.remove("panning");
    elements.regionViewport.releasePointerCapture?.(event.pointerId);
    if (shouldPlace) placeFromEvent(event);
    window.setTimeout(() => { state.skipNextCanvasClick = false; }, 140);
  }

  function setRegionZoom(nextZoom, anchorEvent = null) {
    const next = clamp(Math.round(Number(nextZoom) * 100) / 100, MIN_REGION_ZOOM, MAX_REGION_ZOOM);
    if (next === state.zoom) return;
    const viewport = elements.regionViewport;
    const rect = viewport.getBoundingClientRect();
    const anchorX = anchorEvent ? anchorEvent.clientX - rect.left : viewport.clientWidth / 2;
    const anchorY = anchorEvent ? anchorEvent.clientY - rect.top : viewport.clientHeight / 2;
    const mapX = (viewport.scrollLeft + anchorX) / state.zoom;
    const mapY = (viewport.scrollTop + anchorY) / state.zoom;
    state.zoom = next;
    render();
    viewport.scrollLeft = mapX * state.zoom - anchorX;
    viewport.scrollTop = mapY * state.zoom - anchorY;
  }

  function zoomRegion(delta, anchorEvent = null) {
    setRegionZoom(state.zoom + delta, anchorEvent);
  }

  function handleRegionWheelZoom(event) {
    if (state.editorMode !== "region") return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const step = state.zoom < 1 ? 0.1 : 0.2;
    zoomRegion(direction * step, event);
  }

  function setNestedEconomyValue(path, value) {
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length || !state.economy) return;
    let target = state.economy;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = /^\d+$/.test(parts[index]) ? Number(parts[index]) : parts[index];
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      target = target[key];
    }
    const last = /^\d+$/.test(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
    target[last] = Math.max(0, Number(value) || 0);
  }

  function handleEconomyInput(event) {
    const input = event.target.closest("[data-economy-path]");
    if (!input) return;
    setNestedEconomyValue(input.dataset.economyPath, input.value);
    updateEconomyBreakdownPreviews();
    markDirty("Economy value changed. Save to Game writes both client and Firebase configuration.");
  }

  function bindEvents() {
    elements.worldModeBtn.addEventListener("click", () => setEditorMode("world"));
    elements.regionModeBtn.addEventListener("click", () => setEditorMode("region"));
    elements.economyModeBtn.addEventListener("click", () => setEditorMode("economy"));
    elements.gameUiModeBtn.addEventListener("click", () => setEditorMode("gameui"));
    elements.addRegionBtn.addEventListener("click", addRegion);
    elements.addCityBtn.addEventListener("click", () => setTool(state.tool === "city" ? "select" : "city"));
    elements.addStrongholdBtn.addEventListener("click", () => setTool(state.tool === "stronghold" ? "select" : "stronghold"));
    elements.addCampBtn.addEventListener("click", () => setTool(state.tool === "camp" ? "select" : "camp"));
    elements.addEdgeBtn.addEventListener("click", () => setTool(state.tool === "edge" ? "select" : "edge"));
    elements.deleteSelectedBtn.addEventListener("click", deleteSelected);
    elements.validateBtn.addEventListener("click", validateWorld);
    elements.exportBtn.addEventListener("click", exportJson);
    elements.importBtn.addEventListener("click", () => {
      if (!state.dirty || window.confirm("Importing will replace your unsaved editor changes. Continue?")) elements.importFileInput.click();
    });
    elements.saveBtn.addEventListener("click", () => saveAllData().catch(error => setStatus(error.message || String(error), "error")));
    elements.importFileInput.addEventListener("change", event => {
      importJsonFile(event.target.files?.[0]).catch(error => setStatus(error.message || String(error), "error"));
      event.target.value = "";
    });
    elements.uploadRegionImageBtn.addEventListener("click", () => elements.regionImageFileInput.click());
    elements.regionImageFileInput.addEventListener("change", event => {
      uploadRegionImageFile(event.target.files?.[0]).catch(error => setStatus(error.message || String(error), "error"));
      event.target.value = "";
    });
    elements.toggleGridBtn.addEventListener("click", () => toggleView("grid"));
    elements.toggleCitiesBtn.addEventListener("click", () => toggleView("cities"));
    elements.toggleStrongholdsBtn.addEventListener("click", () => toggleView("strongholds"));
    elements.toggleCampsBtn.addEventListener("click", () => toggleView("camps"));
    elements.toggleConnectionsBtn.addEventListener("click", () => toggleView("connections"));
    elements.toggleUiBoundsBtn.addEventListener("click", () => toggleView("uiBounds"));
    elements.zoomOutBtn.addEventListener("click", () => zoomRegion(state.zoom <= 1 ? -0.1 : -0.2));
    elements.zoomInBtn.addEventListener("click", () => zoomRegion(state.zoom < 1 ? 0.1 : 0.2));
    elements.worldIdInput.addEventListener("input", handleWorldFieldInput);
    elements.worldNameInput.addEventListener("input", handleWorldFieldInput);
    elements.selectionForm.addEventListener("input", handleSelectionInput);
    elements.selectionForm.addEventListener("change", handleSelectionChange);
    elements.selectionForm.addEventListener("click", handleCampRewardAction);
    elements.economySections.addEventListener("input", handleEconomyInput);
    elements.economySections.addEventListener("change", handleEconomyInput);
    elements.regionCanvas.addEventListener("click", event => {
      if (event.target.closest(".map-marker, .edge-zone, .edge-switch-arrow") || state.skipNextCanvasClick || state.tool === "select") return;
      placeFromEvent(event);
    });
    elements.regionImage.addEventListener("error", () => {
      const src = elements.regionImage.getAttribute("src") || "";
      if (src) setStatus(`Could not load map preview image: ${src}`, "error");
    });
    elements.regionViewport.addEventListener("pointerdown", startRegionPan);
    elements.regionViewport.addEventListener("pointermove", handleRegionPan);
    elements.regionViewport.addEventListener("pointerup", stopRegionPan);
    elements.regionViewport.addEventListener("pointercancel", stopRegionPan);
    elements.regionViewport.addEventListener("wheel", handleRegionWheelZoom, { passive: false });
    window.addEventListener("pointermove", handleMarkerDrag);
    window.addEventListener("pointerup", stopMarkerDrag);
    window.addEventListener("pointermove", handleEdgeDrag);
    window.addEventListener("pointerup", stopEdgeDrag);
    window.addEventListener("pointercancel", stopEdgeDrag);
    window.addEventListener("pointermove", handleEdgeArrowDrag);
    window.addEventListener("pointerup", stopEdgeArrowDrag);
    window.addEventListener("pointercancel", stopEdgeArrowDrag);
    window.addEventListener("pointermove", handleRegionTileDrag);
    window.addEventListener("pointerup", stopRegionTileDrag);
    window.addEventListener("pointercancel", stopRegionTileDrag);
    window.addEventListener("keydown", handleKeydown);
  }

  function toggleView(key) {
    state.toggles[key] = !state.toggles[key];
    render();
  }

  function handleKeydown(event) {
    const tag = event.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (event.key === "Delete") {
      deleteSelected();
      event.preventDefault();
    } else if (event.key === "Escape") {
      state.selected = null;
      state.tool = "select";
      render();
    } else if (event.key.toLowerCase() === "c") {
      setTool("city");
    } else if (event.key.toLowerCase() === "s") {
      setTool("stronghold");
    } else if (event.key.toLowerCase() === "e") {
      setTool("edge");
    } else if (event.key.toLowerCase() === "p") {
      setTool("camp");
    } else if (event.key.toLowerCase() === "g") {
      toggleView("grid");
    } else if (event.key.toLowerCase() === "u") {
      toggleView("uiBounds");
    }
  }

  async function init() {
    bindEvents();
    await Promise.all([
      loadWorldData(),
      loadEconomyData(),
      window.CrownlandsHudEditor.init({
        onDirty: message => markDirty(message),
        onStatus: setStatus,
        setMode: setEditorMode,
      }),
    ]);
    render();
  }

  init().catch(error => {
    console.error(error);
    setStatus(error.message || String(error));
  });
})();
