(function () {
  const CORE_MAP_IDS = ["west", "north", "east", "south", "center"];
  const DEFAULT_IMAGE_ROOT = "../../";
  const DEFAULT_PORTAL_SIZE = 96;
  const DEFAULT_OBJECTIVE_SIZE = 154;
  const DEFAULT_CROWN_OBJECTIVE_SIZE = 260;
  const MIN_PORTAL_SIZE = 48;
  const MIN_OBJECTIVE_SIZE = 80;
  const STRONGHOLD_TYPES = {
    gold: {
      name: "Gold Stronghold",
      artSrc: "assets/gold-stronghold.png",
      bonus: "goldProduction",
      bonusPercent: 15,
      level: 30,
      troops: 10000,
    },
    training: {
      name: "Training Stronghold",
      artSrc: "assets/training-stronghold.png",
      bonus: "troopProduction",
      bonusPercent: 15,
      level: 30,
      troops: 10000,
    },
    speed: {
      name: "Speed Stronghold",
      artSrc: "assets/speed-stronghold.png",
      bonus: "marchSpeed",
      bonusPercent: 15,
      level: 30,
      troops: 10000,
    },
    defense: {
      name: "Defense Stronghold",
      artSrc: "assets/defense-stronghold.png",
      bonus: "cityDefense",
      bonusPercent: 15,
      level: 30,
      troops: 10000,
    },
    crown: {
      name: "Crown Citadel",
      artSrc: "assets/crown-citadel.png?v=20260630-citadel-art",
      bonus: "crownDominion",
      bonusPercent: 10,
      level: 100,
      troops: 50000000,
    },
  };

  const elements = {
    mapCountLabel: document.getElementById("mapCountLabel"),
    addMapBtn: document.getElementById("addMapBtn"),
    mapList: document.getElementById("mapList"),
    modeButtons: [...document.querySelectorAll("[data-mode]")],
    portalTargetSelect: document.getElementById("portalTargetSelect"),
    openProjectBtn: document.getElementById("openProjectBtn"),
    applyBtn: document.getElementById("applyBtn"),
    canvasWrap: document.querySelector(".canvas-wrap"),
    mapCanvas: document.getElementById("mapCanvas"),
    mapImage: document.getElementById("mapImage"),
    markerLayer: document.getElementById("markerLayer"),
    statusBar: document.getElementById("statusBar"),
    currentMapTitle: document.getElementById("currentMapTitle"),
    mapLabelInput: document.getElementById("mapLabelInput"),
    mapImagePathInput: document.getElementById("mapImagePathInput"),
    uploadMapImageBtn: document.getElementById("uploadMapImageBtn"),
    mapImageInput: document.getElementById("mapImageInput"),
    newMapImageInput: document.getElementById("newMapImageInput"),
    selectionTitle: document.getElementById("selectionTitle"),
    selectionForm: document.getElementById("selectionForm"),
    deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
    mapStats: document.getElementById("mapStats"),
    cityCountStat: document.getElementById("cityCountStat"),
    portalCountStat: document.getElementById("portalCountStat"),
    objectiveCountStat: document.getElementById("objectiveCountStat"),
  };

  const state = {
    maps: [],
    currentId: "",
    mode: "select",
    selected: null,
    dragging: null,
    panning: null,
    skipNextCanvasClick: false,
    renderedMapId: "",
    viewportByMap: new Map(),
    projectDir: null,
    dirty: false,
  };

  function setStatus(message) {
    elements.statusBar.textContent = message;
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "island";
  }

  function titleFromId(value) {
    return String(value || "island")
      .split(/[-_]+/)
      .filter(Boolean)
      .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ") || "Island";
  }

  function pad(value, length = 3) {
    return String(value).padStart(length, "0");
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function currentMap() {
    return state.maps.find(map => map.id === state.currentId) || state.maps[0] || null;
  }

  function getMapById(id) {
    const targetId = slugify(id);
    return state.maps.find(map => map.id === targetId) || null;
  }

  function getPortalById(map, portalId) {
    const targetId = String(portalId || "");
    return map?.portals?.find(portal => portal.id === targetId) || null;
  }

  function markDirty() {
    state.dirty = true;
  }

  function cleanPoint(point) {
    return {
      x: Math.max(0, Math.round(Number(point?.x) || 0)),
      y: Math.max(0, Math.round(Number(point?.y) || 0)),
    };
  }

  function normalizeMap(rawMap) {
    const id = slugify(rawMap.id);
    const label = rawMap.label || rawMap.name || titleFromId(id);
    const imageWidth = Math.max(1, Math.floor(Number(rawMap.imageWidth || rawMap.width || rawMap.image?.width) || 1200));
    const imageHeight = Math.max(1, Math.floor(Number(rawMap.imageHeight || rawMap.height || rawMap.image?.height) || 1200));
    return {
      id,
      label,
      imageSrc: rawMap.imageSrc || rawMap.image?.src || "",
      thumbnailSrc: rawMap.thumbnailSrc || rawMap.thumbSrc || rawMap.previewSrc || "",
      imageWidth,
      imageHeight,
      region: rawMap.region ? { ...rawMap.region, id, label } : buildEditorRegion(id, label, state.maps.length),
      landPolygon: Array.isArray(rawMap.landPolygon) ? rawMap.landPolygon.map(cleanPoint) : [],
      cities: Array.isArray(rawMap.cities) ? rawMap.cities.map((city, index) => ({
        id: String(city.id || `${id}_${pad(index + 1)}`),
        name: String(city.name || generateCityName(id, index)),
        x: Math.round(Number(city.x ?? city.point?.x) || 0),
        y: Math.round(Number(city.y ?? city.point?.y) || 0),
        level: Math.max(1, Math.floor(Number(city.level) || 1)),
        troops: Math.max(0, Math.floor(Number(city.troops) || 10)),
      })) : [],
      portals: Array.isArray(rawMap.portals) ? rawMap.portals.map((portal, index) => ({
        id: String(portal.id || `${id}-portal-${index + 1}`),
        label: String(portal.label || titleFromId(portal.targetRegionId || portal.target || "center")),
        targetRegionId: slugify(portal.targetRegionId || portal.target || "center"),
        targetPortalId: String(portal.targetPortalId || portal.targetPortal || portal.linkedPortalId || portal.connectedPortalId || ""),
        x: Math.round(Number(portal.x ?? portal.point?.x) || 0),
        y: Math.round(Number(portal.y ?? portal.point?.y) || 0),
        size: Math.max(MIN_PORTAL_SIZE, Math.floor(Number(portal.size) || DEFAULT_PORTAL_SIZE)),
      })) : [],
      objectives: Array.isArray(rawMap.objectives) ? rawMap.objectives.map((objective, index) => normalizeObjective(id, objective, index)) : [],
    };
  }

  function normalizeObjective(regionId, objective, index) {
    const type = slugify(objective.type || objective.strongholdType || "gold");
    const defaults = STRONGHOLD_TYPES[type] || STRONGHOLD_TYPES.gold;
    return {
      id: String(objective.id || `${regionId}_${type}_stronghold_${index + 1}`),
      name: String(objective.name || defaults.name),
      type,
      bonus: String(objective.bonus || defaults.bonus),
      bonusPercent: Math.max(0, Math.floor(Number(objective.bonusPercent) || defaults.bonusPercent)),
      level: Math.max(1, Math.floor(Number(objective.level) || defaults.level)),
      troops: Math.max(0, Math.floor(Number(objective.troops || objective.startTroops) || defaults.troops)),
      artSrc: String(objective.artSrc || defaults.artSrc),
      x: Math.round(Number(objective.x ?? objective.point?.x) || 0),
      y: Math.round(Number(objective.y ?? objective.point?.y) || 0),
      size: Math.max(MIN_OBJECTIVE_SIZE, Math.floor(Number(objective.size) || DEFAULT_OBJECTIVE_SIZE)),
    };
  }

  function buildEditorRegion(id, label, index) {
    const config = window.CROWNLANDS_WORLD_CONFIG || {};
    const width = Math.max(2000, Math.floor(Number(config.width) || 10000));
    const height = Math.max(1600, Math.floor(Number(config.height) || 7600));
    const angle = -Math.PI / 2 + index * 0.78;
    const rx = Math.max(900, Math.round(width * 0.11));
    const ry = Math.max(760, Math.round(height * 0.12));
    return {
      id,
      label,
      x: Math.round(width / 2 + Math.cos(angle) * width * 0.34),
      y: Math.round(height / 2 + Math.sin(angle) * height * 0.34),
      rx,
      ry,
      cityRx: Math.round(rx * 0.82),
      cityRy: Math.round(ry * 0.76),
      rot: 0,
      palette: "heartland",
    };
  }

  function pathForEditor(src) {
    const value = String(src || "");
    if (!value) return "";
    if (/^(blob:|data:|https?:)/i.test(value)) return value;
    if (value.startsWith("../../")) return value;
    if (value.startsWith("../")) return value;
    return `${DEFAULT_IMAGE_ROOT}${value.replace(/^\.?\//, "")}`;
  }

  function getMapPreviewSrc(map) {
    return map?._previewSrc || pathForEditor(map.thumbnailSrc || map.imageSrc);
  }

  function generateCityName(regionId, index) {
    const stems = {
      center: ["Crown", "High", "Stone", "River", "Kings", "Queens", "Iron", "Gold", "Bright", "Elder", "Lion", "Oak", "Raven", "Silver", "Wolf", "Star", "Red", "White", "Dawn", "Ember"],
      north: ["Frost", "Pine", "North", "Snow", "White", "Grey", "Winter", "Ice", "Wolf", "Raven", "Cold", "Storm", "Hawk", "Stone", "Ash", "Briar", "Moon", "Cloud", "Cedar", "Peak"],
      south: ["South", "Salt", "Sun", "Marsh", "Reed", "Pearl", "Green", "Bay", "Moss", "Willow", "Rose", "Clear", "Mist", "Rain", "Bloom", "Hearth", "Warm", "Sable", "Drift", "Tide"],
      west: ["West", "Oak", "Thorn", "Fox", "Ash", "Briar", "Crow", "Dusky", "Wild", "Wood", "Hart", "Moss", "Wolf", "Amber", "Black", "Copper", "Shade", "Glen", "Fern", "Old"],
      east: ["East", "Sun", "Gold", "Dawn", "Bright", "Lion", "Falcon", "Red", "Rose", "Clear", "Wind", "Star", "Light", "Pearl", "Hawk", "Blue", "Kings", "Queens", "Sea", "Ivory"],
    };
    const suffixes = ["haven", "ford", "wick", "mere", "watch", "gate", "rest", "fall", "brook", "hollow"];
    const regionStems = stems[regionId] || stems.center;
    const stem = regionStems[index % regionStems.length];
    const suffix = suffixes[Math.floor(index / regionStems.length) % suffixes.length];
    return `${stem}${suffix}`;
  }

  function extractConstLiteral(source, name) {
    const marker = `const ${name}`;
    const start = source.indexOf(marker);
    if (start < 0) return "";
    const equals = source.indexOf("=", start);
    if (equals < 0) return "";
    let cursor = equals + 1;
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    const opener = source[cursor];
    const closer = opener === "[" ? "]" : opener === "{" ? "}" : "";
    if (!closer) {
      const end = source.indexOf(";", cursor);
      return end > cursor ? source.slice(cursor, end).trim() : "";
    }
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = cursor; i < source.length; i += 1) {
      const char = source[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === "\"" || char === "'" || char === "`") {
        quote = char;
        continue;
      }
      if (char === opener) depth += 1;
      if (char === closer) {
        depth -= 1;
        if (depth === 0) return source.slice(cursor, i + 1);
      }
    }
    return "";
  }

  function evaluateLiteral(literal, fallback) {
    if (!literal) return fallback;
    try {
      return Function(`"use strict"; return (${literal});`)();
    } catch (error) {
      console.warn("Could not parse map literal", error);
      return fallback;
    }
  }

  function extractArray(source, name) {
    const value = evaluateLiteral(extractConstLiteral(source, name), []);
    return Array.isArray(value) ? value : [];
  }

  function extractObject(source, name) {
    const value = evaluateLiteral(extractConstLiteral(source, name), {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function extractNumber(source, name, fallback) {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`));
    return match ? Number(match[1]) : fallback;
  }

  function extractString(source, name, fallback) {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*["']([^"']+)["']\\s*;`));
    return match ? match[1] : fallback;
  }

  function buildSeedMapsFromGameSource(source) {
    const regions = new Map((window.CROWNLANDS_WORLD_CONFIG?.regions || []).map(region => [region.id, region]));
    const specs = [
      {
        id: "west",
        prefix: "WEST",
        cityPoints: "WEST_ISLAND_CITY_POINTS",
        landPolygon: "WEST_ISLAND_LAND_POLYGON",
        portals: [{ id: "west-center", label: "Center", targetRegionId: "center", targetPortalId: "center-west", pointConst: "WEST_CENTER_TELEPORT_IMAGE_POINT" }],
        objectives: [{ id: "west_gold_stronghold", type: "gold", pointConst: "WEST_GOLD_STRONGHOLD_IMAGE_POINT" }],
      },
      {
        id: "north",
        prefix: "NORTH",
        cityPoints: "NORTH_ISLAND_CITY_POINTS",
        landPolygon: "NORTH_ISLAND_LAND_POLYGON",
        portals: [{ id: "north-center", label: "Center", targetRegionId: "center", targetPortalId: "center-north", pointConst: "NORTH_CENTER_TELEPORT_IMAGE_POINT" }],
        objectives: [{ id: "north_training_stronghold", type: "training", pointConst: "NORTH_TRAINING_STRONGHOLD_IMAGE_POINT" }],
      },
      {
        id: "east",
        prefix: "EAST",
        cityPoints: "EAST_ISLAND_CITY_POINTS",
        landPolygon: "EAST_ISLAND_LAND_POLYGON",
        portals: [{ id: "east-center", label: "Center", targetRegionId: "center", targetPortalId: "center-east", pointConst: "EAST_CENTER_TELEPORT_IMAGE_POINT" }],
        objectives: [{ id: "east_speed_stronghold", type: "speed", pointConst: "EAST_SPEED_STRONGHOLD_IMAGE_POINT" }],
      },
      {
        id: "south",
        prefix: "SOUTH",
        cityPoints: "SOUTH_ISLAND_CITY_POINTS",
        landPolygon: "SOUTH_ISLAND_LAND_POLYGON",
        portals: [{ id: "south-center", label: "Center", targetRegionId: "center", targetPortalId: "center-south", pointConst: "SOUTH_CENTER_TELEPORT_IMAGE_POINT" }],
        objectives: [{ id: "south_defense_stronghold", type: "defense", pointConst: "SOUTH_DEFENSE_STRONGHOLD_IMAGE_POINT" }],
      },
      {
        id: "center",
        prefix: "CENTER",
        cityPoints: "CENTER_ISLAND_CITY_POINTS",
        landPolygon: "CENTER_ISLAND_LAND_POLYGON",
        centerPortals: "CENTER_ISLAND_TELEPORTS",
        objectives: [{ id: "center_crown_citadel", type: "crown", pointConst: "CENTER_CROWN_CITADEL_IMAGE_POINT" }],
      },
    ];

    return specs.map((spec, mapIndex) => {
      const artPrefix = `${spec.prefix}_ISLAND`;
      const region = regions.get(spec.id) || buildEditorRegion(spec.id, titleFromId(spec.id), mapIndex);
      const cityPoints = extractArray(source, spec.cityPoints);
      const portals = spec.centerPortals
        ? extractArray(source, spec.centerPortals).map(portal => ({
            id: portal.id,
            label: portal.label,
            targetRegionId: portal.targetRegionId,
            targetPortalId: `${portal.targetRegionId}-center`,
            x: Number(portal.point?.x) || 0,
            y: Number(portal.point?.y) || 0,
            size: DEFAULT_PORTAL_SIZE,
          }))
        : spec.portals.map(portal => {
            const point = extractObject(source, portal.pointConst);
            return {
              id: portal.id,
              label: portal.label,
              targetRegionId: portal.targetRegionId,
              targetPortalId: portal.targetPortalId || "",
              x: Number(point.x) || 0,
              y: Number(point.y) || 0,
              size: DEFAULT_PORTAL_SIZE,
            };
          });
      const objectives = spec.objectives.map((objective, index) => {
        const point = extractObject(source, objective.pointConst);
        const defaults = STRONGHOLD_TYPES[objective.type] || STRONGHOLD_TYPES.gold;
        return normalizeObjective(spec.id, {
          id: objective.id,
          type: objective.type,
          name: defaults.name,
          artSrc: defaults.artSrc,
          bonus: defaults.bonus,
          bonusPercent: defaults.bonusPercent,
          level: defaults.level,
          troops: defaults.troops,
          x: Number(point.x) || 0,
          y: Number(point.y) || 0,
          size: objective.type === "crown" ? DEFAULT_CROWN_OBJECTIVE_SIZE : DEFAULT_OBJECTIVE_SIZE,
        }, index);
      });

      return normalizeMap({
        id: spec.id,
        label: region.label || titleFromId(spec.id),
        imageSrc: extractString(source, `${artPrefix}_ART_SRC`, `assets/${spec.id}-island.png`),
        thumbnailSrc: extractString(source, `${artPrefix}_THUMB_SRC`, ""),
        imageWidth: extractNumber(source, `${artPrefix}_IMAGE_WIDTH`, 1200),
        imageHeight: extractNumber(source, `${artPrefix}_IMAGE_HEIGHT`, 1200),
        region: deepClone(region),
        landPolygon: extractArray(source, spec.landPolygon),
        cities: cityPoints.map((point, index) => ({
          id: `${spec.id}_${pad(index + 1)}`,
          name: generateCityName(spec.id, index),
          x: point.x,
          y: point.y,
          level: 1,
          troops: 10,
        })),
        portals,
        objectives,
      });
    });
  }

  function buildFallbackMaps() {
    const regions = window.CROWNLANDS_WORLD_CONFIG?.regions || [];
    return regions.map((region, index) => normalizeMap({
      id: region.id || `island-${index + 1}`,
      label: region.label || titleFromId(region.id),
      imageSrc: CORE_MAP_IDS.includes(region.id) ? `assets/${region.id}-island.png` : "",
      imageWidth: 1200,
      imageHeight: 1200,
      region,
      cities: [],
      portals: [],
      objectives: [],
    }));
  }

  async function loadMaps() {
    const savedMaps = window.CROWNLANDS_MAP_EDITOR_DATA?.maps;
    if (Array.isArray(savedMaps) && savedMaps.length) {
      state.maps = savedMaps.map(normalizeMap);
      setStatus("Loaded saved editor map data.");
      return;
    }
    try {
      const response = await fetch(`../../game.js?seed=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      state.maps = buildSeedMapsFromGameSource(source);
      setStatus("Loaded current hardcoded maps as editable data.");
    } catch (error) {
      console.warn("Could not parse game.js map data", error);
      state.maps = buildFallbackMaps();
      setStatus("Loaded basic maps. Run this editor from a local server for full seeding.");
    }
  }

  function render() {
    if (!state.currentId && state.maps.length) state.currentId = state.maps[0].id;
    renderMapList();
    renderPortalTargets();
    renderCanvas();
    renderInspector();
  }

  function renderMapList() {
    elements.mapCountLabel.textContent = String(state.maps.length);
    elements.mapList.innerHTML = state.maps.map(map => `
      <button class="map-list-btn ${map.id === state.currentId ? "active" : ""}" type="button" data-map-id="${map.id}">
        <span class="map-list-thumb"><img src="${escapeHtml(getMapPreviewSrc(map))}" alt="" draggable="false" /></span>
        <span class="map-list-meta">
          <strong>${escapeHtml(map.label)}</strong>
          <small>${map.cities.length} cities / ${map.portals.length} portals</small>
          <small>${escapeHtml(map.id)}</small>
        </span>
      </button>
    `).join("");
    elements.mapList.querySelectorAll("[data-map-id]").forEach(button => {
      button.addEventListener("click", () => {
        saveViewportForCurrentMap();
        state.currentId = button.dataset.mapId;
        state.selected = null;
        render();
      });
    });
  }

  function renderPortalTargets() {
    const map = currentMap();
    elements.portalTargetSelect.innerHTML = state.maps
      .filter(item => !map || item.id !== map.id)
      .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
      .join("");
  }

  function renderCanvas() {
    const map = currentMap();
    if (!map) return;
    const previousMapId = state.renderedMapId;
    elements.mapCanvas.style.width = `${Math.max(320, Math.round(Number(map.imageWidth) || 1200))}px`;
    elements.mapCanvas.style.aspectRatio = `${Math.max(1, Math.round(Number(map.imageWidth) || 1200))} / ${Math.max(1, Math.round(Number(map.imageHeight) || 1200))}`;
    elements.mapImage.src = getMapPreviewSrc(map);
    elements.mapImage.alt = `${map.label} map`;
    elements.currentMapTitle.textContent = map.label;
    elements.markerLayer.innerHTML = "";
    renderMarkers(map, "city", map.cities);
    renderMarkers(map, "portal", map.portals);
    renderMarkers(map, "objective", map.objectives);
    state.renderedMapId = map.id;
    if (previousMapId !== map.id) requestAnimationFrame(() => restoreViewportForMap(map.id));
  }

  function renderMarkers(map, type, items) {
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `marker ${type} ${isSelected(type, index) ? "selected" : ""}`;
      button.dataset.type = type;
      button.dataset.index = String(index);
      button.style.left = `${(Number(item.x) || 0) / map.imageWidth * 100}%`;
      button.style.top = `${(Number(item.y) || 0) / map.imageHeight * 100}%`;
      if (type === "portal" || type === "objective") {
        button.style.setProperty("--marker-size", `${getMarkerPreviewSize(type, item)}px`);
      }
      button.title = markerTitle(type, item);
      button.innerHTML = `<span>${markerGlyph(type, index)}</span>`;
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
        selectMarker(type, index);
        startDrag(event, type, index);
      });
      elements.markerLayer.appendChild(button);
    });
  }

  function getMarkerPreviewSize(type, item) {
    if (type === "portal") {
      const size = Math.max(MIN_PORTAL_SIZE, Math.floor(Number(item?.size) || DEFAULT_PORTAL_SIZE));
      return Math.max(20, Math.min(74, Math.round(size * 0.45)));
    }
    if (type === "objective") {
      const size = Math.max(MIN_OBJECTIVE_SIZE, Math.floor(Number(item?.size) || DEFAULT_OBJECTIVE_SIZE));
      return Math.max(28, Math.min(96, Math.round(size * 0.31)));
    }
    return 28;
  }

  function markerGlyph(type, index) {
    if (type === "portal") return "P";
    if (type === "objective") return "S";
    return String((index + 1) % 10);
  }

  function markerTitle(type, item) {
    if (type === "portal") {
      const targetPortal = getPortalById(getMapById(item.targetRegionId), item.targetPortalId);
      const linked = targetPortal ? ` via ${targetPortal.id}` : "";
      return `${item.label} to ${titleFromId(item.targetRegionId)}${linked}`;
    }
    if (type === "objective") return item.name;
    return item.name;
  }

  function isSelected(type, index) {
    return state.selected?.type === type && state.selected.index === index;
  }

  function selectMarker(type, index) {
    state.selected = { type, index };
    render();
  }

  function startDrag(event, type, index) {
    state.dragging = { type, index };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function handlePointerMove(event) {
    if (!state.dragging) return;
    const map = currentMap();
    const item = getSelectedItem();
    if (!map || !item) return;
    const point = getImagePointFromEvent(event, map);
    item.x = point.x;
    item.y = point.y;
    markDirty();
    renderCanvas();
    renderInspector();
  }

  function stopDrag() {
    window.removeEventListener("pointermove", handlePointerMove);
    state.dragging = null;
  }

  function saveViewportForCurrentMap() {
    const map = currentMap();
    if (!map || !elements.canvasWrap) return;
    state.viewportByMap.set(map.id, {
      left: elements.canvasWrap.scrollLeft,
      top: elements.canvasWrap.scrollTop,
    });
  }

  function restoreViewportForMap(mapId) {
    if (!elements.canvasWrap) return;
    const saved = state.viewportByMap.get(mapId);
    if (saved) {
      elements.canvasWrap.scrollLeft = saved.left;
      elements.canvasWrap.scrollTop = saved.top;
      return;
    }
    elements.canvasWrap.scrollLeft = Math.max(0, elements.mapCanvas.offsetLeft + elements.mapCanvas.offsetWidth / 2 - elements.canvasWrap.clientWidth / 2);
    elements.canvasWrap.scrollTop = Math.max(0, elements.mapCanvas.offsetTop + elements.mapCanvas.offsetHeight / 2 - elements.canvasWrap.clientHeight / 2);
  }

  function startCanvasPan(event) {
    if (!elements.canvasWrap || event.button !== 0 || event.target.closest(".marker")) return;
    state.panning = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: elements.canvasWrap.scrollLeft,
      top: elements.canvasWrap.scrollTop,
      moved: false,
    };
    elements.canvasWrap.classList.add("panning");
    elements.canvasWrap.setPointerCapture?.(event.pointerId);
  }

  function handleCanvasPan(event) {
    if (!state.panning || state.panning.pointerId !== event.pointerId || !elements.canvasWrap) return;
    const dx = event.clientX - state.panning.x;
    const dy = event.clientY - state.panning.y;
    if (Math.hypot(dx, dy) > 3) state.panning.moved = true;
    elements.canvasWrap.scrollLeft = state.panning.left - dx;
    elements.canvasWrap.scrollTop = state.panning.top - dy;
    event.preventDefault();
  }

  function stopCanvasPan(event) {
    if (!state.panning || state.panning.pointerId !== event.pointerId) return;
    state.skipNextCanvasClick = state.panning.moved;
    if (state.skipNextCanvasClick) {
      window.setTimeout(() => {
        state.skipNextCanvasClick = false;
      }, 160);
    }
    state.panning = null;
    elements.canvasWrap?.classList.remove("panning");
    saveViewportForCurrentMap();
  }

  function getImagePointFromEvent(event, map) {
    const rect = elements.mapImage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) * map.imageWidth;
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) * map.imageHeight;
    return {
      x: Math.round(Math.max(0, Math.min(map.imageWidth, x))),
      y: Math.round(Math.max(0, Math.min(map.imageHeight, y))),
    };
  }

  function getSelectedItem() {
    const map = currentMap();
    if (!map || !state.selected) return null;
    const collection = getCollectionForType(map, state.selected.type);
    return collection?.[state.selected.index] || null;
  }

  function getCollectionForType(map, type) {
    if (type === "city") return map.cities;
    if (type === "portal") return map.portals;
    if (type === "objective") return map.objectives;
    return null;
  }

  function renderInspector() {
    const map = currentMap();
    if (!map) return;
    elements.mapLabelInput.value = map.label;
    elements.mapImagePathInput.value = map.imageSrc;
    elements.cityCountStat.textContent = String(map.cities.length);
    elements.portalCountStat.textContent = String(map.portals.length);
    elements.objectiveCountStat.textContent = String(map.objectives.length);
    elements.mapStats.textContent = `${map.cities.length} cities`;

    const item = getSelectedItem();
    elements.deleteSelectedBtn.disabled = !item;
    if (!item || !state.selected) {
      elements.selectionTitle.textContent = "None";
      elements.selectionForm.className = "selection-form empty";
      elements.selectionForm.textContent = "Select a marker or add one to edit it.";
      return;
    }
    elements.selectionTitle.textContent = state.selected.type;
    elements.selectionForm.className = "selection-form";
    if (state.selected.type === "city") renderCityForm(item);
    if (state.selected.type === "portal") renderPortalForm(item);
    if (state.selected.type === "objective") renderObjectiveForm(item);
  }

  function renderCityForm(item) {
    elements.selectionForm.innerHTML = `
      ${textField("id", "ID", item.id)}
      ${textField("name", "Name", item.name)}
      <div class="field-row">${numberField("x", "X", item.x)}${numberField("y", "Y", item.y)}</div>
    `;
    bindSelectionInputs(item);
  }

  function renderPortalForm(item) {
    const map = currentMap();
    const targetMap = getMapById(item.targetRegionId);
    const targetPortalOptions = getConnectableTargetPortals(map, item);
    const hasSelectedTargetPortal = targetPortalOptions.some(portal => portal.id === item.targetPortalId);
    elements.selectionForm.innerHTML = `
      ${textField("id", "ID", item.id)}
      ${textField("label", "Label", item.label)}
      <label><span>Target</span><select data-field="targetRegionId">
        ${state.maps.filter(target => target.id !== map.id).map(target => `<option value="${escapeHtml(target.id)}" ${target.id === item.targetRegionId ? "selected" : ""}>${escapeHtml(target.label)}</option>`).join("")}
      </select></label>
      <label><span>Connected portal</span><select data-field="targetPortalId" ${targetPortalOptions.length ? "" : "disabled"}>
        <option value="">Unlinked</option>
        ${!hasSelectedTargetPortal && item.targetPortalId ? `<option value="${escapeHtml(item.targetPortalId)}" selected>Missing: ${escapeHtml(item.targetPortalId)}</option>` : ""}
        ${targetPortalOptions.map(portal => `<option value="${escapeHtml(portal.id)}" ${portal.id === item.targetPortalId ? "selected" : ""}>${escapeHtml(portal.id)} - ${escapeHtml(portal.label || targetMap?.label || "Portal")}</option>`).join("")}
      </select></label>
      <div class="field-row">${numberField("x", "X", item.x)}${numberField("y", "Y", item.y)}</div>
      ${numberField("size", "Size", item.size, MIN_PORTAL_SIZE)}
    `;
    bindSelectionInputs(item);
  }

  function getConnectableTargetPortals(sourceMap, portal) {
    const targetMap = getMapById(portal.targetRegionId);
    if (!sourceMap || !targetMap) return [];
    return targetMap.portals.filter(targetPortal => slugify(targetPortal.targetRegionId) === sourceMap.id);
  }

  function getDefaultTargetPortalId(portal) {
    return getConnectableTargetPortals(currentMap(), portal)[0]?.id || "";
  }

  function syncPortalConnection(portal) {
    const sourceMap = currentMap();
    const targetMap = getMapById(portal.targetRegionId);
    if (!sourceMap || !targetMap) {
      portal.targetPortalId = "";
      return;
    }
    const targetPortal = getPortalById(targetMap, portal.targetPortalId);
    if (!targetPortal) {
      portal.targetPortalId = "";
      return;
    }
    targetPortal.targetRegionId = sourceMap.id;
    targetPortal.targetPortalId = portal.id;
  }

  function clearPortalConnection(portal) {
    const sourceMap = currentMap();
    const targetMap = getMapById(portal?.targetRegionId);
    const targetPortal = getPortalById(targetMap, portal?.targetPortalId);
    if (sourceMap && targetPortal?.targetPortalId === portal?.id) targetPortal.targetPortalId = "";
  }

  function renderObjectiveForm(item) {
    elements.selectionForm.innerHTML = `
      ${textField("id", "ID", item.id)}
      ${textField("name", "Name", item.name)}
      <label><span>Type</span><select data-field="type">
        ${Object.keys(STRONGHOLD_TYPES).map(type => `<option value="${type}" ${type === item.type ? "selected" : ""}>${titleFromId(type)}</option>`).join("")}
      </select></label>
      ${textField("artSrc", "Icon path", item.artSrc)}
      <div class="field-row">${numberField("x", "X", item.x)}${numberField("y", "Y", item.y)}</div>
      <div class="field-row">${numberField("bonusPercent", "Bonus %", item.bonusPercent)}${numberField("troops", "Defenders", item.troops)}</div>
      ${numberField("size", "Size", item.size, MIN_OBJECTIVE_SIZE)}
    `;
    bindSelectionInputs(item);
  }

  function textField(field, label, value) {
    return `<label><span>${label}</span><input data-field="${field}" value="${escapeHtml(value)}" /></label>`;
  }

  function numberField(field, label, value, min = null) {
    const minAttr = Number.isFinite(Number(min)) ? ` min="${Number(min)}"` : "";
    return `<label><span>${label}</span><input data-field="${field}" type="number"${minAttr} value="${Number(value) || 0}" /></label>`;
  }

  function bindSelectionInputs(item) {
    elements.selectionForm.querySelectorAll("[data-field]").forEach(input => {
      const update = () => {
        const field = input.dataset.field;
        if (state.selected?.type === "portal" && field === "targetRegionId") {
          clearPortalConnection(item);
          item.targetRegionId = slugify(input.value);
          item.targetPortalId = getDefaultTargetPortalId(item);
          syncPortalConnection(item);
          markDirty();
          render();
          return;
        }
        if (state.selected?.type === "portal" && field === "targetPortalId") {
          clearPortalConnection(item);
          item.targetPortalId = input.value;
          syncPortalConnection(item);
          markDirty();
          render();
          return;
        }
        if (state.selected?.type === "portal" && field === "id") {
          const previousId = item.id;
          item.id = input.value;
          const targetPortal = getPortalById(getMapById(item.targetRegionId), item.targetPortalId);
          if (targetPortal?.targetPortalId === previousId) targetPortal.targetPortalId = item.id;
          markDirty();
          renderCanvas();
          return;
        }
        if (field === "size") item[field] = normalizeSizeForType(state.selected?.type, input.value);
        else if (["x", "y", "bonusPercent", "troops", "level"].includes(field)) item[field] = Math.round(Number(input.value) || 0);
        else item[field] = input.value;
        if (field === "type" && STRONGHOLD_TYPES[item.type]) {
          const defaults = STRONGHOLD_TYPES[item.type];
          item.bonus = defaults.bonus;
          item.name = item.name || defaults.name;
          item.artSrc = item.artSrc || defaults.artSrc;
        }
        markDirty();
        renderCanvas();
      };
      input.addEventListener(input.tagName === "SELECT" ? "change" : "input", update);
    });
  }

  function normalizeSizeForType(type, value) {
    const size = Math.round(Number(value) || 0);
    if (type === "portal") return Math.max(MIN_PORTAL_SIZE, size || DEFAULT_PORTAL_SIZE);
    if (type === "objective") return Math.max(MIN_OBJECTIVE_SIZE, size || DEFAULT_OBJECTIVE_SIZE);
    return size;
  }

  function addCity(point) {
    const map = currentMap();
    const nextNumber = map.cities.length + 1;
    const city = {
      id: nextUniqueId(map.cities, `${map.id}_${pad(nextNumber)}`),
      name: generateCityName(map.id, map.cities.length),
      x: point.x,
      y: point.y,
      level: 1,
      troops: 10,
    };
    map.cities.push(city);
    state.selected = { type: "city", index: map.cities.length - 1 };
    markDirty();
    setStatus(`Added city at ${point.x}, ${point.y}.`);
    render();
  }

  function addPortal(point) {
    const map = currentMap();
    const targetRegionId = elements.portalTargetSelect.value || state.maps.find(item => item.id !== map.id)?.id || "";
    if (!targetRegionId || targetRegionId === map.id) {
      setStatus("Choose another map as the portal target.");
      return;
    }
    const targetMap = state.maps.find(item => item.id === targetRegionId);
    const portal = {
      id: nextUniqueId(map.portals, `${map.id}-${targetRegionId}`),
      label: targetMap?.label || titleFromId(targetRegionId),
      targetRegionId,
      targetPortalId: "",
      x: point.x,
      y: point.y,
      size: DEFAULT_PORTAL_SIZE,
    };
    map.portals.push(portal);
    if (targetMap) {
      let reversePortal = targetMap.portals.find(existing => existing.targetRegionId === map.id && (!existing.targetPortalId || existing.targetPortalId === portal.id));
      if (!reversePortal) {
        reversePortal = {
          id: nextUniqueId(targetMap.portals, `${targetMap.id}-${map.id}`),
          label: map.label,
          targetRegionId: map.id,
          targetPortalId: portal.id,
          x: Math.round(targetMap.imageWidth / 2),
          y: Math.round(targetMap.imageHeight / 2),
          size: DEFAULT_PORTAL_SIZE,
        };
        targetMap.portals.push(reversePortal);
      }
      portal.targetPortalId = reversePortal.id;
      reversePortal.targetPortalId = portal.id;
    }
    state.selected = { type: "portal", index: map.portals.length - 1 };
    markDirty();
    setStatus(`Added portal to ${targetMap?.label || targetRegionId}.`);
    render();
  }

  function addObjective(point) {
    const map = currentMap();
    const type = map.id === "center" ? "crown" : map.id === "north" ? "training" : map.id === "east" ? "speed" : map.id === "south" ? "defense" : "gold";
    const defaults = STRONGHOLD_TYPES[type];
    const objective = normalizeObjective(map.id, {
      id: nextUniqueId(map.objectives, `${map.id}_${type}_stronghold`),
      type,
      name: defaults.name,
      x: point.x,
      y: point.y,
      size: type === "crown" ? DEFAULT_CROWN_OBJECTIVE_SIZE : DEFAULT_OBJECTIVE_SIZE,
    }, map.objectives.length);
    map.objectives.push(objective);
    state.selected = { type: "objective", index: map.objectives.length - 1 };
    markDirty();
    setStatus(`Added ${objective.name}.`);
    render();
  }

  function nextUniqueId(collection, baseId) {
    const used = new Set(collection.map(item => item.id));
    if (!used.has(baseId)) return baseId;
    let index = 2;
    while (used.has(`${baseId}_${index}`)) index += 1;
    return `${baseId}_${index}`;
  }

  function deleteSelected() {
    const map = currentMap();
    if (!map || !state.selected) return;
    const collection = getCollectionForType(map, state.selected.type);
    if (!collection) return;
    if (state.selected.type === "portal") clearPortalConnection(collection[state.selected.index]);
    collection.splice(state.selected.index, 1);
    state.selected = null;
    markDirty();
    setStatus("Deleted selected marker.");
    render();
  }

  function setMode(mode) {
    state.mode = mode;
    elements.modeButtons.forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
    setStatus(`Mode: ${titleFromId(mode)}.`);
  }

  async function fileToImageInfo(file) {
    const previewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.src = previewUrl;
    await image.decode().catch(() => {});
    return {
      previewUrl,
      width: image.naturalWidth || 1200,
      height: image.naturalHeight || 1200,
    };
  }

  function extensionForFile(file) {
    const match = String(file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = match ? match[1] : "png";
    return ["png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "png";
  }

  async function setMapImageFile(map, file) {
    if (!map || !file) return;
    const info = await fileToImageInfo(file);
    const ext = extensionForFile(file);
    map._pendingImageFile = file;
    map._previewSrc = info.previewUrl;
    map.imageWidth = info.width;
    map.imageHeight = info.height;
    map.imageSrc = `assets/custom-maps/${map.id}-map.${ext}`;
    map.thumbnailSrc = "";
    markDirty();
    setStatus(`Loaded image for ${map.label}.`);
    render();
  }

  async function addMapFromFile(file) {
    if (!file) return;
    const baseName = String(file.name || "new-map").replace(/\.[^.]+$/, "");
    let id = slugify(window.prompt("Map ID", baseName) || baseName);
    if (state.maps.some(map => map.id === id)) {
      let suffix = 2;
      while (state.maps.some(map => map.id === `${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    const label = titleFromId(id);
    const info = await fileToImageInfo(file);
    const ext = extensionForFile(file);
    const map = normalizeMap({
      id,
      label,
      imageSrc: `assets/custom-maps/${id}-map.${ext}`,
      imageWidth: info.width,
      imageHeight: info.height,
      region: buildEditorRegion(id, label, state.maps.length),
      cities: [],
      portals: [],
      objectives: [],
    });
    map._pendingImageFile = file;
    map._previewSrc = info.previewUrl;
    state.maps.push(map);
    state.currentId = map.id;
    state.selected = null;
    markDirty();
    setStatus(`Added ${label}.`);
    render();
  }

  async function openProjectFolder() {
    if (!window.showDirectoryPicker) {
      setStatus("Folder writing needs Chrome or Edge on localhost. Use the download fallback after Apply.");
      return null;
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    try {
      await handle.getFileHandle("game.js");
    } catch (error) {
      setStatus("Selected folder does not look like the Crown Lands project root.");
      return null;
    }
    state.projectDir = handle;
    setStatus("Project folder connected.");
    return handle;
  }

  async function getDirectoryHandle(root, segments, create = true) {
    let current = root;
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment, { create });
    }
    return current;
  }

  async function writeFile(root, path, value) {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    const dir = await getDirectoryHandle(root, parts, true);
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(value);
    await writable.close();
  }

  function buildExportData() {
    const versionStamp = Number(new Date().toISOString().replace(/\D/g, "").slice(0, 12));
    return {
      version: Math.max(versionStamp, Number(window.CROWNLANDS_WORLD_CONFIG?.version) || 0),
      updatedAt: new Date().toISOString(),
      maps: state.maps.map(map => ({
        id: map.id,
        label: map.label,
        imageSrc: map.imageSrc,
        thumbnailSrc: map.thumbnailSrc || "",
        imageWidth: map.imageWidth,
        imageHeight: map.imageHeight,
        region: map.region ? { ...map.region, id: map.id, label: map.label } : buildEditorRegion(map.id, map.label, 0),
        landPolygon: map.landPolygon.map(cleanPoint),
        cities: map.cities.map(city => ({
          id: city.id,
          name: city.name,
          x: Math.round(Number(city.x) || 0),
          y: Math.round(Number(city.y) || 0),
          level: Math.max(1, Math.floor(Number(city.level) || 1)),
          troops: Math.max(0, Math.floor(Number(city.troops) || 10)),
        })),
        portals: map.portals.map(portal => ({
          id: portal.id,
          label: portal.label,
          targetRegionId: portal.targetRegionId,
          targetPortalId: portal.targetPortalId || "",
          x: Math.round(Number(portal.x) || 0),
          y: Math.round(Number(portal.y) || 0),
          size: Math.max(MIN_PORTAL_SIZE, Math.floor(Number(portal.size) || DEFAULT_PORTAL_SIZE)),
        })),
        objectives: map.objectives.map(objective => ({
          id: objective.id,
          name: objective.name,
          type: objective.type,
          bonus: objective.bonus,
          bonusPercent: Math.max(0, Math.floor(Number(objective.bonusPercent) || 0)),
          level: Math.max(1, Math.floor(Number(objective.level) || 30)),
          troops: Math.max(0, Math.floor(Number(objective.troops) || 10000)),
          artSrc: objective.artSrc,
          x: Math.round(Number(objective.x) || 0),
          y: Math.round(Number(objective.y) || 0),
          size: Math.max(MIN_OBJECTIVE_SIZE, Math.floor(Number(objective.size) || DEFAULT_OBJECTIVE_SIZE)),
        })),
      })),
    };
  }

  function buildDataFileText() {
    return `window.CROWNLANDS_MAP_EDITOR_DATA = ${JSON.stringify(buildExportData(), null, 2)};\n`;
  }

  function downloadTextFile(fileName, text) {
    const blob = new Blob([text], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function applyToGame() {
    const dataText = buildDataFileText();
    if (!state.projectDir && window.showDirectoryPicker) {
      await openProjectFolder();
    }
    if (!state.projectDir) {
      downloadTextFile("map-editor-data.js", dataText);
      setStatus("Downloaded map data. Open the project folder to write directly next time.");
      return;
    }
    for (const map of state.maps) {
      if (!map._pendingImageFile || !map.imageSrc) continue;
      await writeFile(state.projectDir, map.imageSrc, map._pendingImageFile);
      delete map._pendingImageFile;
      delete map._previewSrc;
    }
    await writeFile(state.projectDir, "assets/map-editor-data.js", dataText);
    state.dirty = false;
    setStatus("Uploaded map changes to assets/map-editor-data.js.");
  }

  function bindEvents() {
    elements.modeButtons.forEach(button => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    elements.canvasWrap?.addEventListener("pointerdown", startCanvasPan);
    elements.canvasWrap?.addEventListener("pointermove", handleCanvasPan);
    elements.canvasWrap?.addEventListener("pointerup", stopCanvasPan);
    elements.canvasWrap?.addEventListener("pointercancel", stopCanvasPan);
    elements.mapCanvas.addEventListener("click", event => {
      if (event.target.closest(".marker")) return;
      if (state.skipNextCanvasClick) {
        state.skipNextCanvasClick = false;
        return;
      }
      const map = currentMap();
      if (!map || state.mode === "select") return;
      const point = getImagePointFromEvent(event, map);
      if (state.mode === "city") addCity(point);
      if (state.mode === "portal") addPortal(point);
      if (state.mode === "objective") addObjective(point);
    });
    elements.mapLabelInput.addEventListener("input", () => {
      const map = currentMap();
      if (!map) return;
      map.label = elements.mapLabelInput.value || titleFromId(map.id);
      if (map.region) map.region.label = map.label;
      markDirty();
      renderMapList();
      elements.currentMapTitle.textContent = map.label;
    });
    elements.mapImagePathInput.addEventListener("input", () => {
      const map = currentMap();
      if (!map) return;
      map.imageSrc = elements.mapImagePathInput.value.trim();
      delete map._previewSrc;
      markDirty();
      renderCanvas();
    });
    elements.uploadMapImageBtn.addEventListener("click", () => elements.mapImageInput.click());
    elements.mapImageInput.addEventListener("change", event => {
      setMapImageFile(currentMap(), event.target.files?.[0]);
      event.target.value = "";
    });
    elements.addMapBtn.addEventListener("click", () => elements.newMapImageInput.click());
    elements.newMapImageInput.addEventListener("change", event => {
      addMapFromFile(event.target.files?.[0]);
      event.target.value = "";
    });
    elements.deleteSelectedBtn.addEventListener("click", deleteSelected);
    elements.openProjectBtn.addEventListener("click", () => {
      openProjectFolder().catch(error => setStatus(error.message || String(error)));
    });
    elements.applyBtn.addEventListener("click", () => {
      applyToGame().catch(error => {
        console.error(error);
        setStatus(error.message || String(error));
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

  async function init() {
    bindEvents();
    await loadMaps();
    render();
  }

  init().catch(error => {
    console.error(error);
    setStatus(error.message || String(error));
  });
}());
