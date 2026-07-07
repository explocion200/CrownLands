(function () {
  const WORLD_API = "/api/world-data";
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
  const MAP_SWITCH_ARROW_ICON_SRC = "/assets/map-switch-arrow.png?v=20260702-map-arrow-bigger";
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
      size: 260,
    },
    gold_stronghold: {
      name: "Aurum Keep",
      bonusType: "goldProduction",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/gold-stronghold.png",
      size: 154,
    },
    troop_stronghold: {
      name: "Greybanner Hold",
      bonusType: "troopProduction",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/training-stronghold.png",
      size: 154,
    },
    defense_stronghold: {
      name: "Ironwatch",
      bonusType: "cityDefense",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/defense-stronghold.png",
      size: 154,
    },
    march_speed_stronghold: {
      name: "Swiftgate",
      bonusType: "marchSpeed",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/speed-stronghold.png",
      size: 154,
    },
    upgrade_discount_stronghold: {
      name: "Upgrade Discount Stronghold",
      bonusType: "upgradeCostReduction",
      bonusAmount: 8,
      level: 50,
      troops: 50000000,
      artSrc: "assets/gold-stronghold.png",
      size: 154,
    },
  };
  const CAMP_DEFAULTS = {
    gold: {
      name: "Gold Camp",
      artSrc: "assets/camps/gold.png",
      size: 132,
    },
    troops: {
      name: "Troop Camp",
      artSrc: "assets/camps/troops.png",
      size: 132,
    },
    items: {
      name: "Item Camp",
      artSrc: "assets/camps/items.png",
      size: 132,
    },
    deed: {
      name: "City Deed Camp",
      artSrc: "assets/camps/deed.png",
      size: 132,
    },
  };

  function readVisualSize(value, fallback) {
    const parsed = Math.floor(Number(value));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const fallbackSize = Math.floor(Number(fallback));
    return Number.isFinite(fallbackSize) && fallbackSize > 0 ? fallbackSize : 1;
  }

  const elements = {
    worldModeBtn: document.getElementById("worldModeBtn"),
    regionModeBtn: document.getElementById("regionModeBtn"),
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
    return {
      id: slugify(city.id, `${region.id}_city_${String(index + 1).padStart(3, "0")}`),
      name: String(city.name || `City ${index + 1}`),
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
      notes: String(stronghold.notes || ""),
    };
  }

  function normalizeCamp(camp = {}, index = 0, region) {
    const campType = CAMP_TYPES.includes(camp.campType || camp.type)
      ? camp.campType || camp.type
      : "gold";
    const defaults = CAMP_DEFAULTS[campType] || CAMP_DEFAULTS.gold;
    return {
      id: slugify(camp.id, `${region.id}_${campType}_camp_${index + 1}`),
      name: String(camp.name || defaults.name),
      regionId: region.id,
      xNorm: roundNorm(camp.xNorm ?? ((Number(camp.x) || 0) / region.width)),
      yNorm: roundNorm(camp.yNorm ?? ((Number(camp.y) || 0) / region.height)),
      campType,
      artSrc: String(camp.artSrc || defaults.artSrc),
      size: readVisualSize(camp.size, defaults.size),
      notes: String(camp.notes || ""),
    };
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

  async function saveWorldData() {
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
    render();
  }

  function markDirty(message = "", kind = "") {
    state.dirty = true;
    if (message) setStatus(message, kind);
  }

  function setEditorMode(mode) {
    state.editorMode = mode === "region" ? "region" : "world";
    state.tool = "select";
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
    elements.workspaceKicker.textContent = state.editorMode === "world" ? "World Layout" : "Region Edit";
    elements.workspaceTitle.textContent = state.editorMode === "world"
      ? state.layout.worldName
      : currentRegion()?.name || "No region selected";
    elements.worldView.classList.toggle("hidden", state.editorMode !== "world");
    elements.regionView.classList.toggle("hidden", state.editorMode !== "region");
    if (state.editorMode === "world") renderWorldGrid();
    else renderRegionEditor();
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
    renderRegionMarkers(region);
    renderEdgeZones(region);
  }

  function renderRegionMarkers(region) {
    elements.markerLayer.innerHTML = "";
    region.cities.forEach((city, index) => {
      const marker = createMarker("city", city, index, region);
      marker.textContent = String((index + 1) % 10);
      elements.markerLayer.appendChild(marker);
    });
    region.strongholds.forEach((stronghold, index) => {
      const marker = createMarker("stronghold", stronghold, index, region);
      marker.classList.toggle("crown", stronghold.strongholdType === "crown_citadel");
      marker.dataset.strongholdType = stronghold.strongholdType;
      marker.innerHTML = `<img src="${escapeHtml(resolveAssetPath(stronghold.artSrc))}" alt="" draggable="false" decoding="async" />`;
      elements.markerLayer.appendChild(marker);
    });
    region.camps.forEach((camp, index) => {
      const marker = createMarker("camp", camp, index, region);
      marker.dataset.campType = camp.campType;
      marker.innerHTML = `<img src="${escapeHtml(resolveAssetPath(camp.artSrc))}" alt="" draggable="false" decoding="async" />`;
      elements.markerLayer.appendChild(marker);
    });
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
      if (kind === "city") selectCity(region.id, index);
      else if (kind === "camp") selectCamp(region.id, index);
      else selectStronghold(region.id, index);
      state.draggingMarker = { kind, regionId: region.id, index, pointerId: event.pointerId };
      marker.setPointerCapture?.(event.pointerId);
    });
    return marker;
  }

  function applyMarkerVisualSize(marker, kind, item) {
    if (kind !== "stronghold" && kind !== "camp") return;
    const defaultSize = kind === "camp"
      ? (CAMP_DEFAULTS[item.campType]?.size || CAMP_DEFAULTS.gold.size)
      : (STRONGHOLD_DEFAULTS[item.strongholdType]?.size || STRONGHOLD_DEFAULTS.gold_stronghold.size);
    const size = readVisualSize(item.size, defaultSize);
    marker.style.setProperty("--marker-base-size", `${size}px`);
    marker.style.setProperty("--marker-size", `${Math.max(1, size * state.zoom)}px`);
    marker.dataset.visualSize = String(size);
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
    const city = normalizeCity({
      id: uniqueId(region.cities, `${region.id}_city_${String(region.cities.length + 1).padStart(3, "0")}`),
      name: `City ${region.cities.length + 1}`,
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
    }, region.strongholds.length, region);
    region.strongholds.push(stronghold);
    state.selected = { kind: "stronghold", regionId: region.id, index: region.strongholds.length - 1 };
    markDirty(`Added ${stronghold.name}.`);
    render();
  }

  function addCamp(region, point) {
    const campType = CAMP_TYPES.includes(elements.campTypeSelect.value) ? elements.campTypeSelect.value : "gold";
    const defaults = CAMP_DEFAULTS[campType] || CAMP_DEFAULTS.gold;
    const camp = normalizeCamp({
      id: uniqueId(region.camps, `${region.id}_${campType}_camp`),
      name: defaults.name,
      xNorm: point.xNorm,
      yNorm: point.yNorm,
      campType,
      artSrc: defaults.artSrc,
      size: defaults.size,
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
        <label class="wide"><span>Art Path</span><input data-field="artSrc" value="${escapeHtml(stronghold.artSrc)}" /></label>
        <label class="wide"><span>Notes</span><textarea data-field="notes">${escapeHtml(stronghold.notes)}</textarea></label>
      </div>
    `;
  }

  function renderCampForm(camp, region) {
    const px = Math.round(camp.xNorm * region.width);
    const py = Math.round(camp.yNorm * region.height);
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
        <label class="wide"><span>Art Path</span><input data-field="artSrc" value="${escapeHtml(camp.artSrc)}" /></label>
        <label class="wide"><span>Notes</span><textarea data-field="notes">${escapeHtml(camp.notes)}</textarea></label>
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
      elements.validationList.textContent = "Press Validate World when you want a full check.";
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
    else if (["level", "troops", "bonusAmount"].includes(field)) item[field] = Math.max(0, Math.floor(Number(value) || 0));
    else if (field === "strongholdType") applyStrongholdType(item, value);
    else if (field === "campType") applyCampType(item, value);
    else if (field === "intentionalOuter") item[field] = Boolean(value);
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

    if (!results.some(item => item.level === "error" || item.level === "warning")) {
      results.push({ level: "ok", text: "World validation passed." });
    }
    state.validation = results;
    renderValidationList();
    setStatus("World validation complete.");
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
        if (distance < minSpacing) {
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
    const payload = buildSavePayload();
    downloadJson(`${state.layout.worldId || "world"}-bundle.json`, payload);
    setStatus("Exported JSON bundle.");
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
    const data = normalizeBundle(JSON.parse(text));
    state.layout = data.layout;
    state.regions = data.regions;
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

  function bindEvents() {
    elements.worldModeBtn.addEventListener("click", () => setEditorMode("world"));
    elements.regionModeBtn.addEventListener("click", () => setEditorMode("region"));
    elements.addRegionBtn.addEventListener("click", addRegion);
    elements.addCityBtn.addEventListener("click", () => setTool(state.tool === "city" ? "select" : "city"));
    elements.addStrongholdBtn.addEventListener("click", () => setTool(state.tool === "stronghold" ? "select" : "stronghold"));
    elements.addCampBtn.addEventListener("click", () => setTool(state.tool === "camp" ? "select" : "camp"));
    elements.addEdgeBtn.addEventListener("click", () => setTool(state.tool === "edge" ? "select" : "edge"));
    elements.deleteSelectedBtn.addEventListener("click", deleteSelected);
    elements.validateBtn.addEventListener("click", validateWorld);
    elements.exportBtn.addEventListener("click", exportJson);
    elements.importBtn.addEventListener("click", () => elements.importFileInput.click());
    elements.saveBtn.addEventListener("click", () => saveWorldData().catch(error => setStatus(error.message || String(error), "error")));
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
    elements.zoomOutBtn.addEventListener("click", () => zoomRegion(state.zoom <= 1 ? -0.1 : -0.2));
    elements.zoomInBtn.addEventListener("click", () => zoomRegion(state.zoom < 1 ? 0.1 : 0.2));
    elements.worldIdInput.addEventListener("input", handleWorldFieldInput);
    elements.worldNameInput.addEventListener("input", handleWorldFieldInput);
    elements.selectionForm.addEventListener("input", handleSelectionInput);
    elements.selectionForm.addEventListener("change", handleSelectionChange);
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
    }
  }

  async function init() {
    bindEvents();
    await loadWorldData();
    render();
  }

  init().catch(error => {
    console.error(error);
    setStatus(error.message || String(error));
  });
})();
