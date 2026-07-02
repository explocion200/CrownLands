(function () {
  const WORLD_API = "/api/world-data";
  const SIDES = ["north", "south", "east", "west"];
  const OPPOSITE_SIDE = { north: "south", south: "north", east: "west", west: "east" };
  const REGION_TYPES = ["starter", "midgame", "endgame", "activity", "crownlands_main"];
  const EDGE_TYPES = ["road", "valley", "pass", "river_crossing", "open_field", "forest_break", "bridge"];
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
      artSrc: "assets/crown-citadel.png?v=20260630-citadel-art",
      size: 260,
    },
    gold_stronghold: {
      name: "Gold Stronghold",
      bonusType: "goldProduction",
      bonusAmount: 15,
      level: 50,
      troops: 50000000,
      artSrc: "assets/gold-stronghold.png",
      size: 154,
    },
    troop_stronghold: {
      name: "Troop Stronghold",
      bonusType: "troopProduction",
      bonusAmount: 15,
      level: 50,
      troops: 50000000,
      artSrc: "assets/training-stronghold.png",
      size: 154,
    },
    defense_stronghold: {
      name: "Defense Stronghold",
      bonusType: "cityDefense",
      bonusAmount: 15,
      level: 50,
      troops: 50000000,
      artSrc: "assets/defense-stronghold.png",
      size: 154,
    },
    march_speed_stronghold: {
      name: "March Speed Stronghold",
      bonusType: "marchSpeed",
      bonusAmount: 15,
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

  const elements = {
    worldModeBtn: document.getElementById("worldModeBtn"),
    regionModeBtn: document.getElementById("regionModeBtn"),
    addRegionBtn: document.getElementById("addRegionBtn"),
    editRegionBtn: document.getElementById("editRegionBtn"),
    addCityBtn: document.getElementById("addCityBtn"),
    addStrongholdBtn: document.getElementById("addStrongholdBtn"),
    addEdgeBtn: document.getElementById("addEdgeBtn"),
    deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
    validateBtn: document.getElementById("validateBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    saveBtn: document.getElementById("saveBtn"),
    toggleGridBtn: document.getElementById("toggleGridBtn"),
    toggleCitiesBtn: document.getElementById("toggleCitiesBtn"),
    toggleStrongholdsBtn: document.getElementById("toggleStrongholdsBtn"),
    toggleConnectionsBtn: document.getElementById("toggleConnectionsBtn"),
    importFileInput: document.getElementById("importFileInput"),
    strongholdTypeSelect: document.getElementById("strongholdTypeSelect"),
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
      connections: true,
    },
    draggingMarker: null,
    draggingEdge: null,
    panning: null,
    skipNextCanvasClick: false,
  };

  function setStatus(message) {
    elements.statusBar.textContent = message;
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

  function roundNorm(value) {
    return Math.round(clamp(Number(value) || 0, 0, 1) * 1000) / 1000;
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
    return {
      id: region.id,
      name: region.name,
      type: region.type,
      gridX: Math.round(Number(region.gridX) || 0),
      gridY: Math.round(Number(region.gridY) || 0),
      width: Math.max(256, Math.round(Number(region.width) || 2048)),
      height: Math.max(256, Math.round(Number(region.height) || 2048)),
      imagePath: region.imagePath || "",
      cityCapacity: Math.max(0, Math.floor(Number(region.cityCapacity) || 0)),
      regionPath: region.regionPath || `assets/worlds/world_01/regions/${region.id}.json`,
    };
  }

  function normalizeEdgeConnections(edgeConnections = {}) {
    return SIDES.reduce((result, side) => {
      result[side] = Array.isArray(edgeConnections[side])
        ? edgeConnections[side].map((zone, index) => ({
            id: slugify(zone.id, `${side}_connection_${index + 1}`),
            side,
            start: roundNorm(Math.min(Number(zone.start) || 0, Number(zone.end) || 1)),
            end: roundNorm(Math.max(Number(zone.start) || 0, Number(zone.end) || 1)),
            type: EDGE_TYPES.includes(zone.type) ? zone.type : "road",
            connectsToRegionId: slugify(zone.connectsToRegionId || "", ""),
            intentionalOuter: Boolean(zone.intentionalOuter),
            notes: String(zone.notes || ""),
          }))
        : [];
      return result;
    }, {});
  }

  function normalizeRegion(rawRegion = {}, index = 0) {
    const id = slugify(rawRegion.id, `region_${index + 1}`);
    const type = REGION_TYPES.includes(rawRegion.type) ? rawRegion.type : (id === "center" ? "crownlands_main" : "starter");
    const width = Math.max(256, Math.round(Number(rawRegion.width || rawRegion.imageWidth) || 2048));
    const height = Math.max(256, Math.round(Number(rawRegion.height || rawRegion.imageHeight) || 2048));
    const region = {
      id,
      name: String(rawRegion.name || rawRegion.label || titleFromId(id)),
      type,
      gridX: Math.round(Number(rawRegion.gridX) || 0),
      gridY: Math.round(Number(rawRegion.gridY) || 0),
      width,
      height,
      imagePath: String(rawRegion.imagePath || rawRegion.imageSrc || ""),
      cityCapacity: Math.max(0, Math.floor(Number(rawRegion.cityCapacity) || (type === "crownlands_main" ? 100 : 50))),
      cities: [],
      strongholds: [],
      edgeConnections: normalizeEdgeConnections(rawRegion.edgeConnections),
      notes: String(rawRegion.notes || ""),
    };
    if (rawRegion.compatRegion) region.compatRegion = rawRegion.compatRegion;
    region.regionPath = rawRegion.regionPath || `assets/worlds/world_01/regions/${region.id}.json`;
    region.cities = (Array.isArray(rawRegion.cities) ? rawRegion.cities : []).map((city, cityIndex) => normalizeCity(city, cityIndex, region));
    region.strongholds = (Array.isArray(rawRegion.strongholds) ? rawRegion.strongholds : []).map((stronghold, strongholdIndex) => normalizeStronghold(stronghold, strongholdIndex, region));
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
      size: Math.max(80, Math.floor(Number(stronghold.size) || defaults.size)),
      notes: String(stronghold.notes || ""),
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
        defaultMapWidth: Math.max(256, Math.floor(Number(rawLayout.globalSettings?.defaultMapWidth) || 2048)),
        defaultMapHeight: Math.max(256, Math.floor(Number(rawLayout.globalSettings?.defaultMapHeight) || 2048)),
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
        { id: "center", name: "Crownlands Heart", type: "crownlands_main", gridX: 0, gridY: 0, width: 1254, height: 1254, imagePath: "assets/center-island.png", cityCapacity: 100 },
        { id: "west", name: "West Marches", type: "starter", gridX: -1, gridY: 0, width: 1024, height: 1536, imagePath: "assets/west-island.png", cityCapacity: 50 },
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
    state.layout.regions = state.regions.map(getRegionSummary);
    state.layout.updatedAt = new Date().toISOString();
    return {
      layout: deepClone(state.layout),
      regions: deepClone(state.regions),
    };
  }

  async function saveWorldData() {
    const payload = buildSavePayload();
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
    state.layout = data.layout;
    state.regions = data.regions;
    state.dirty = false;
    setStatus("Saved JSON world files and game compatibility data.");
    render();
  }

  function markDirty(message = "") {
    state.dirty = true;
    if (message) setStatus(message);
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
    state.activeRegionId = regionId;
    state.selected = { kind: "region", regionId };
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
    const region = getRegion(state.selected.regionId);
    if (!region) return null;
    if (state.selected.kind === "region") return region;
    if (state.selected.kind === "city") return region.cities[state.selected.index] || null;
    if (state.selected.kind === "stronghold") return region.strongholds[state.selected.index] || null;
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
    elements.addEdgeBtn.classList.toggle("active", state.tool === "edge");
    elements.toggleGridBtn.classList.toggle("active", state.toggles.grid);
    elements.toggleCitiesBtn.classList.toggle("active", state.toggles.cities);
    elements.toggleStrongholdsBtn.classList.toggle("active", state.toggles.strongholds);
    elements.toggleConnectionsBtn.classList.toggle("active", state.toggles.connections);
    elements.deleteSelectedBtn.disabled = !state.selected;
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
    const edgeCount = state.regions.reduce((total, region) => total + SIDES.reduce((sum, side) => sum + region.edgeConnections[side].length, 0), 0);
    elements.regionCountStat.textContent = String(state.regions.length);
    elements.cityCountStat.textContent = String(cityCount);
    elements.strongholdCountStat.textContent = String(strongholdCount);
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
    const cell = 128;
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

    state.regions.forEach(region => {
      const left = (region.gridX - bounds.minX) * cell + 8;
      const top = (region.gridY - bounds.minY) * cell + 8;
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = `region-tile ${state.selected?.kind === "region" && state.selected.regionId === region.id ? "selected" : ""}`;
      tile.style.left = `${left}px`;
      tile.style.top = `${top}px`;
      tile.dataset.regionId = region.id;
      tile.innerHTML = `
        <img src="${escapeHtml(resolveAssetPath(region.imagePath))}" alt="" draggable="false" />
        <span class="region-tile-meta">
          <strong>${escapeHtml(region.name)}</strong>
          <small>${escapeHtml(region.id)} (${region.gridX}, ${region.gridY})</small>
          <small>${region.cities.length}/${region.cityCapacity} cities</small>
        </span>
        ${SIDES.map(side => `<span class="edge-dot ${side} ${hasNeighbor(region, side) ? "connected" : ""}"></span>`).join("")}
      `;
      tile.addEventListener("click", () => selectRegion(region.id));
      tile.addEventListener("dblclick", () => {
        state.activeRegionId = region.id;
        setEditorMode("region");
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
    elements.regionImage.src = resolveAssetPath(region.imagePath);
    elements.regionImage.alt = `${region.name} map`;
    elements.regionView.classList.toggle("hide-cities", !state.toggles.cities);
    elements.regionView.classList.toggle("hide-strongholds", !state.toggles.strongholds);
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
      marker.textContent = stronghold.strongholdType === "crown_citadel" ? "C" : "S";
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
    marker.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
      if (kind === "city") selectCity(region.id, index);
      else selectStronghold(region.id, index);
      state.draggingMarker = { kind, regionId: region.id, index, pointerId: event.pointerId };
      marker.setPointerCapture?.(event.pointerId);
    });
    return marker;
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
      });
    });
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
    if (state.tool === "edge") addEdgeConnection(region, point);
  }

  function addRegion() {
    const occupied = new Set(state.regions.map(region => `${region.gridX},${region.gridY}`));
    let gridX = 0;
    let gridY = 0;
    while (occupied.has(`${gridX},${gridY}`)) gridX += 1;
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
      edgeConnections: {},
    }, index);
    state.regions.push(region);
    state.activeRegionId = region.id;
    state.selected = { kind: "region", regionId: region.id };
    markDirty(`Added region ${region.name}.`);
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
      elements.selectionForm.textContent = "Select a region, city, stronghold, or edge connection.";
      renderValidationList();
      return;
    }
    elements.selectionForm.className = "selection-form";
    if (state.selected.kind === "region") renderRegionForm(item);
    if (state.selected.kind === "city") renderCityForm(item, getRegion(state.selected.regionId));
    if (state.selected.kind === "stronghold") renderStrongholdForm(item, getRegion(state.selected.regionId));
    if (state.selected.kind === "edge") renderEdgeForm(item, getRegion(state.selected.regionId));
    renderValidationList();
  }

  function optionList(values, selected) {
    return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(titleFromId(value))}</option>`).join("");
  }

  function renderRegionForm(region) {
    elements.selectionTitle.textContent = region.name;
    elements.selectionForm.innerHTML = `
      <div class="form-grid">
        <label class="wide"><span>Region ID</span><input data-field="id" data-commit="change" value="${escapeHtml(region.id)}" /></label>
        <label class="wide"><span>Name</span><input data-field="name" value="${escapeHtml(region.name)}" /></label>
        <label><span>Type</span><select data-field="type">${optionList(REGION_TYPES, region.type)}</select></label>
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
        <label><span>Visual Size</span><input data-field="size" type="number" min="80" value="${stronghold.size}" /></label>
        <label class="wide"><span>Art Path</span><input data-field="artSrc" value="${escapeHtml(stronghold.artSrc)}" /></label>
        <label class="wide"><span>Notes</span><textarea data-field="notes">${escapeHtml(stronghold.notes)}</textarea></label>
      </div>
    `;
  }

  function renderEdgeForm(edge, region) {
    const neighbor = getNeighbor(region, edge.side);
    elements.selectionTitle.textContent = `${titleFromId(edge.side)} ${titleFromId(edge.type)}`;
    elements.selectionForm.innerHTML = `
      <div class="form-grid">
        <label class="wide"><span>Connection ID</span><input data-field="id" value="${escapeHtml(edge.id)}" /></label>
        <label><span>Side</span><select data-field="side">${optionList(SIDES, edge.side)}</select></label>
        <label><span>Type</span><select data-field="type">${optionList(EDGE_TYPES, edge.type)}</select></label>
        <label><span>Start</span><input data-field="start" type="number" min="0" max="1" step="0.001" value="${edge.start}" /></label>
        <label><span>End</span><input data-field="end" type="number" min="0" max="1" step="0.001" value="${edge.end}" /></label>
        <label class="wide"><span>Connects To Region ID</span><input data-field="connectsToRegionId" value="${escapeHtml(edge.connectsToRegionId || neighbor?.id || "")}" /></label>
        <label class="wide check-row"><input data-field="intentionalOuter" type="checkbox" ${edge.intentionalOuter ? "checked" : ""} /><span>Intentional outer fog / wilderness edge</span></label>
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
    if (["xNorm", "yNorm", "start", "end"].includes(field)) item[field] = roundNorm(value);
    else if (["level", "troops", "bonusAmount", "size"].includes(field)) item[field] = Math.max(0, Math.floor(Number(value) || 0));
    else if (field === "strongholdType") applyStrongholdType(item, value);
    else if (field === "intentionalOuter") item[field] = Boolean(value);
    else item[field] = String(value);
    if (state.selected.kind === "city") item.regionId = state.selected.regionId;
    if (state.selected.kind === "stronghold") item.regionId = state.selected.regionId;
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

  function moveEdgeRecord(region, fromSide, fromIndex, nextSide, options = {}) {
    const side = SIDES.includes(nextSide) ? nextSide : fromSide;
    const edge = region?.edgeConnections[fromSide]?.[fromIndex];
    if (!edge) return null;
    if (side === fromSide) return { edge, side, index: fromIndex };
    region.edgeConnections[fromSide].splice(fromIndex, 1);
    region.edgeConnections[side].push(edge);
    const index = region.edgeConnections[side].length - 1;
    if (options.updateNeighbor) updateEdgeNeighborFields(edge, region, side);
    else edge.side = side;
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

    state.regions.forEach(region => {
      addCheck(results, region.id, "error", `Region has an ID: ${region.name}`);
      if (regionIds.has(region.id)) results.push({ level: "error", text: `Duplicate region ID: ${region.id}` });
      regionIds.set(region.id, region);
      if (!Number.isFinite(Number(region.gridX)) || !Number.isFinite(Number(region.gridY))) results.push({ level: "error", text: `${region.name} needs gridX/gridY.` });
      const cellKey = `${region.gridX},${region.gridY}`;
      if (gridCells.has(cellKey)) results.push({ level: "error", text: `${region.name} overlaps ${gridCells.get(cellKey).name} at grid ${cellKey}.` });
      gridCells.set(cellKey, region);
      if (!region.imagePath) results.push({ level: "error", text: `${region.name} needs a map image path.` });
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

  function handleMarkerDrag(event) {
    if (!state.draggingMarker) return;
    const region = getRegion(state.draggingMarker.regionId);
    const collection = state.draggingMarker.kind === "city" ? region?.cities : region?.strongholds;
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

  function startRegionPan(event) {
    if (state.tool !== "select" || event.button !== 0 || event.target.closest(".map-marker, .edge-zone")) return;
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
    state.skipNextCanvasClick = state.panning.moved;
    state.panning = null;
    elements.regionViewport.classList.remove("panning");
    window.setTimeout(() => { state.skipNextCanvasClick = false; }, 140);
  }

  function zoomRegion(delta) {
    state.zoom = clamp(Math.round((state.zoom + delta) * 100) / 100, 0.25, 1.5);
    render();
  }

  function bindEvents() {
    elements.worldModeBtn.addEventListener("click", () => setEditorMode("world"));
    elements.regionModeBtn.addEventListener("click", () => setEditorMode("region"));
    elements.addRegionBtn.addEventListener("click", addRegion);
    elements.editRegionBtn.addEventListener("click", () => setEditorMode("region"));
    elements.addCityBtn.addEventListener("click", () => setTool(state.tool === "city" ? "select" : "city"));
    elements.addStrongholdBtn.addEventListener("click", () => setTool(state.tool === "stronghold" ? "select" : "stronghold"));
    elements.addEdgeBtn.addEventListener("click", () => setTool(state.tool === "edge" ? "select" : "edge"));
    elements.deleteSelectedBtn.addEventListener("click", deleteSelected);
    elements.validateBtn.addEventListener("click", validateWorld);
    elements.exportBtn.addEventListener("click", exportJson);
    elements.importBtn.addEventListener("click", () => elements.importFileInput.click());
    elements.saveBtn.addEventListener("click", () => saveWorldData().catch(error => setStatus(error.message || String(error))));
    elements.importFileInput.addEventListener("change", event => {
      importJsonFile(event.target.files?.[0]).catch(error => setStatus(error.message || String(error)));
      event.target.value = "";
    });
    elements.toggleGridBtn.addEventListener("click", () => toggleView("grid"));
    elements.toggleCitiesBtn.addEventListener("click", () => toggleView("cities"));
    elements.toggleStrongholdsBtn.addEventListener("click", () => toggleView("strongholds"));
    elements.toggleConnectionsBtn.addEventListener("click", () => toggleView("connections"));
    elements.zoomOutBtn.addEventListener("click", () => zoomRegion(-0.1));
    elements.zoomInBtn.addEventListener("click", () => zoomRegion(0.1));
    elements.worldIdInput.addEventListener("input", handleWorldFieldInput);
    elements.worldNameInput.addEventListener("input", handleWorldFieldInput);
    elements.selectionForm.addEventListener("input", handleSelectionInput);
    elements.selectionForm.addEventListener("change", handleSelectionChange);
    elements.regionCanvas.addEventListener("click", event => {
      if (event.target.closest(".map-marker, .edge-zone") || state.skipNextCanvasClick || state.tool === "select") return;
      placeFromEvent(event);
    });
    elements.regionViewport.addEventListener("pointerdown", startRegionPan);
    elements.regionViewport.addEventListener("pointermove", handleRegionPan);
    elements.regionViewport.addEventListener("pointerup", stopRegionPan);
    elements.regionViewport.addEventListener("pointercancel", stopRegionPan);
    window.addEventListener("pointermove", handleMarkerDrag);
    window.addEventListener("pointerup", stopMarkerDrag);
    window.addEventListener("pointermove", handleEdgeDrag);
    window.addEventListener("pointerup", stopEdgeDrag);
    window.addEventListener("pointercancel", stopEdgeDrag);
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
