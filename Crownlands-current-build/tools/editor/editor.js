const palettes = ["heartland", "pine", "marsh", "woodland", "golden"];
const EDITOR_BUILD_ID = "github-map-autoload-2026-06-29";
const AUTO_IMPORT_KEY = `crownlands-editor-${EDITOR_BUILD_ID}`;

let config = null;
let selected = { type: "region", id: "" };
let dirty = false;
let drag = null;
let showCities = true;

const elements = {
  filePath: document.getElementById("filePath"),
  statusText: document.getElementById("statusText"),
  worldFields: document.getElementById("worldFields"),
  regionList: document.getElementById("regionList"),
  bridgeList: document.getElementById("bridgeList"),
  inspectorTitle: document.getElementById("inspectorTitle"),
  inspectorBody: document.getElementById("inspectorBody"),
  jsonPreview: document.getElementById("jsonPreview"),
  mapSvg: document.getElementById("mapSvg"),
  saveBtn: document.getElementById("saveBtn"),
  reloadBtn: document.getElementById("reloadBtn"),
  githubImportBtn: document.getElementById("githubImportBtn"),
  previewBtn: document.getElementById("previewBtn"),
  addRegionBtn: document.getElementById("addRegionBtn"),
  addBridgeBtn: document.getElementById("addBridgeBtn"),
  cityPreviewToggle: document.getElementById("cityPreviewToggle"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setStatus(message, tone = "") {
  elements.statusText.textContent = message;
  elements.statusText.className = tone;
}

function describeConfigSource(prefix) {
  if (!config) return prefix;
  return `${prefix} Map version ${config.version}, ${config.regions.length} islands, ${config.landBridges.length} bridges.`;
}

function markDirty() {
  dirty = true;
  setStatus("Unsaved changes", "save-dirty");
}

async function loadConfig() {
  setStatus("Loading world-config.js...");
  const response = await fetch("/api/world-config", { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load config: ${response.status}`);
  const payload = await response.json();
  config = payload.config;
  elements.filePath.textContent = payload.path || "world-config.js";
  selected = { type: "region", id: config.regions[0]?.id || "" };
  dirty = false;
  render();
  setStatus(describeConfigSource("Loaded local map."), "save-ok");
}

async function saveConfig() {
  if (!config) return;
  setStatus("Saving world-config.js...");
  const response = await fetch("/api/world-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Save failed: ${response.status}`);
  config = payload.config;
  dirty = false;
  render();
  setStatus("Saved world-config.js", "save-ok");
}

async function importGithubConfig(options = {}) {
  const force = Boolean(options.force);
  const automatic = Boolean(options.automatic);
  if (!force && !automatic && dirty && !window.confirm("Download the GitHub map and replace your unsaved local editor changes?")) return;
  setStatus("Downloading GitHub map...");
  const response = await fetch("/api/world-config/import-github", { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `GitHub download failed: ${response.status}`);
  config = payload.config;
  elements.filePath.textContent = payload.path || "world-config.js";
  selected = { type: "region", id: config.regions[0]?.id || "" };
  dirty = false;
  render();
  localStorage.setItem(AUTO_IMPORT_KEY, "1");
  setStatus(describeConfigSource("Downloaded GitHub map into world-config.js."), "save-ok");
}

async function bootEditor() {
  const params = new URLSearchParams(window.location.search);
  const forcedGithub = params.get("github") === "1";
  const skipGithub = params.get("local") === "1";
  const alreadyImported = localStorage.getItem(AUTO_IMPORT_KEY) === "1";

  if (!skipGithub && (forcedGithub || !alreadyImported)) {
    await importGithubConfig({ force: true, automatic: true });
    return;
  }

  await loadConfig();
}

function field(label, value, attrs = {}) {
  const type = attrs.type || "number";
  const step = attrs.step ? ` step="${attrs.step}"` : "";
  const min = attrs.min !== undefined ? ` min="${attrs.min}"` : "";
  const max = attrs.max !== undefined ? ` max="${attrs.max}"` : "";
  const scope = attrs.scope ? ` data-scope="${attrs.scope}"` : "";
  const id = attrs.id ? ` data-id="${escapeHtml(attrs.id)}"` : "";
  const fieldName = attrs.field ? ` data-field="${attrs.field}"` : "";
  const point = attrs.point ? ` data-point="${attrs.point}"` : "";
  const wide = attrs.wide ? " wide" : "";
  return `
    <label class="field${wide}">
      <span>${escapeHtml(label)}</span>
      <input type="${type}" value="${escapeHtml(value)}"${step}${min}${max}${scope}${id}${fieldName}${point}>
    </label>
  `;
}

function selectField(label, value, options, attrs = {}) {
  const scope = attrs.scope ? ` data-scope="${attrs.scope}"` : "";
  const id = attrs.id ? ` data-id="${escapeHtml(attrs.id)}"` : "";
  const fieldName = attrs.field ? ` data-field="${attrs.field}"` : "";
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select${scope}${id}${fieldName}>
        ${options.map(option => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function render() {
  if (!config) return;
  renderWorldFields();
  renderLists();
  renderInspector();
  renderMap();
  elements.jsonPreview.textContent = JSON.stringify(config, null, 2);
}

function renderWorldFields() {
  elements.worldFields.innerHTML = [
    field("Version", config.version, { scope: "world", field: "version", min: 1 }),
    field("City count", config.cityCountPerRegion, { scope: "world", field: "cityCountPerRegion", min: 1, max: 250 }),
    field("Width", config.width, { scope: "world", field: "width", min: 1000 }),
    field("Height", config.height, { scope: "world", field: "height", min: 1000 }),
    field("Grid size", config.gridSize, { scope: "world", field: "gridSize", min: 20 }),
    field("Reserve", config.strongholdReserveRatio, { scope: "world", field: "strongholdReserveRatio", step: "0.01", min: 0, max: 0.8 }),
    field("Name", config.name, { type: "text", scope: "world", field: "name", wide: true }),
  ].join("");
}

function renderLists() {
  elements.regionList.innerHTML = config.regions.map(region => `
    <button class="list-item ${selected.type === "region" && selected.id === region.id ? "active" : ""}" data-select-type="region" data-select-id="${escapeHtml(region.id)}" type="button">
      <span><strong>${escapeHtml(region.label)}</strong><small>${escapeHtml(region.id)} - ${Math.round(region.x)}, ${Math.round(region.y)}</small></span>
      <b>${escapeHtml(region.palette)}</b>
    </button>
  `).join("");

  elements.bridgeList.innerHTML = config.landBridges.map(bridge => `
    <button class="list-item ${selected.type === "bridge" && selected.id === bridge.id ? "active" : ""}" data-select-type="bridge" data-select-id="${escapeHtml(bridge.id)}" type="button">
      <span><strong>${escapeHtml(bridge.id)}</strong><small>${Math.round(bridge.from.x)}, ${Math.round(bridge.from.y)} to ${Math.round(bridge.to.x)}, ${Math.round(bridge.to.y)}</small></span>
      <b>${Math.round(bridge.width)}</b>
    </button>
  `).join("");
}

function renderInspector() {
  const item = getSelectedItem();
  if (!item) {
    elements.inspectorTitle.textContent = "Selection";
    elements.inspectorBody.innerHTML = `<p class="empty-state">Select an island or bridge to edit it.</p>`;
    return;
  }

  if (selected.type === "region") {
    elements.inspectorTitle.textContent = `Island: ${item.label}`;
    elements.inspectorBody.innerHTML = [
      field("ID", item.id, { type: "text", scope: "region", id: item.id, field: "id", wide: true }),
      field("Label", item.label, { type: "text", scope: "region", id: item.id, field: "label", wide: true }),
      field("X", item.x, { scope: "region", id: item.id, field: "x" }),
      field("Y", item.y, { scope: "region", id: item.id, field: "y" }),
      field("Radius X", item.rx, { scope: "region", id: item.id, field: "rx", min: 100 }),
      field("Radius Y", item.ry, { scope: "region", id: item.id, field: "ry", min: 100 }),
      field("City area X", item.cityRx, { scope: "region", id: item.id, field: "cityRx", min: 50 }),
      field("City area Y", item.cityRy, { scope: "region", id: item.id, field: "cityRy", min: 50 }),
      field("Rotation", item.rot, { scope: "region", id: item.id, field: "rot", step: "0.01" }),
      selectField("Palette", item.palette, palettes, { scope: "region", id: item.id, field: "palette" }),
      `<button class="danger" data-delete-type="region" data-delete-id="${escapeHtml(item.id)}" type="button">Delete Island</button>`,
    ].join("");
    return;
  }

  elements.inspectorTitle.textContent = `Bridge: ${item.id}`;
  elements.inspectorBody.innerHTML = [
    field("ID", item.id, { type: "text", scope: "bridge", id: item.id, field: "id", wide: true }),
    field("From X", item.from.x, { scope: "bridge-point", id: item.id, point: "from", field: "x" }),
    field("From Y", item.from.y, { scope: "bridge-point", id: item.id, point: "from", field: "y" }),
    field("To X", item.to.x, { scope: "bridge-point", id: item.id, point: "to", field: "x" }),
    field("To Y", item.to.y, { scope: "bridge-point", id: item.id, point: "to", field: "y" }),
    field("Width", item.width, { scope: "bridge", id: item.id, field: "width", min: 40 }),
    `<button class="danger" data-delete-type="bridge" data-delete-id="${escapeHtml(item.id)}" type="button">Delete Bridge</button>`,
  ].join("");
}

function getSelectedItem() {
  if (!config) return null;
  if (selected.type === "region") return config.regions.find(region => region.id === selected.id) || null;
  if (selected.type === "bridge") return config.landBridges.find(bridge => bridge.id === selected.id) || null;
  return null;
}

function renderMap() {
  const width = Math.max(1, asNumber(config.width, 10000));
  const height = Math.max(1, asNumber(config.height, 7600));
  const cities = showCities ? generateCityPreview(config) : [];
  elements.mapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  elements.mapSvg.innerHTML = `
    <defs>
      <pattern id="grid" width="500" height="500" patternUnits="userSpaceOnUse">
        <path d="M 500 0 L 0 0 0 500" class="sea-grid"></path>
      </pattern>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#grid)"></rect>
    ${config.landBridges.map(renderBridge).join("")}
    ${config.regions.map(renderRegion).join("")}
    ${cities.map(renderCityDot).join("")}
    ${renderSelectionMarker()}
  `;
}

function degrees(rad) {
  return (asNumber(rad, 0) * 180 / Math.PI).toFixed(2);
}

function renderBridge(bridge) {
  const active = selected.type === "bridge" && selected.id === bridge.id;
  return `
    <g data-map-type="bridge" data-map-id="${escapeHtml(bridge.id)}">
      <line class="bridge-shore" x1="${bridge.from.x}" y1="${bridge.from.y}" x2="${bridge.to.x}" y2="${bridge.to.y}" stroke-width="${bridge.width + 80}"></line>
      <line class="bridge" x1="${bridge.from.x}" y1="${bridge.from.y}" x2="${bridge.to.x}" y2="${bridge.to.y}" stroke-width="${bridge.width}"></line>
      <circle class="bridge-point" data-map-type="bridge-point" data-map-id="${escapeHtml(bridge.id)}" data-point="from" cx="${bridge.from.x}" cy="${bridge.from.y}" r="${active ? 62 : 46}"></circle>
      <circle class="bridge-point" data-map-type="bridge-point" data-map-id="${escapeHtml(bridge.id)}" data-point="to" cx="${bridge.to.x}" cy="${bridge.to.y}" r="${active ? 62 : 46}"></circle>
    </g>
  `;
}

function renderRegion(region) {
  const rot = degrees(region.rot);
  const active = selected.type === "region" && selected.id === region.id;
  const reserveRatio = getReserveRatio(region);
  return `
    <g data-map-type="region" data-map-id="${escapeHtml(region.id)}">
      <ellipse class="region-shore" cx="${region.x}" cy="${region.y}" rx="${region.rx}" ry="${region.ry}" transform="rotate(${rot} ${region.x} ${region.y})"></ellipse>
      <ellipse class="region-land ${escapeHtml(region.palette)} ${active ? "active" : ""}" cx="${region.x}" cy="${region.y}" rx="${region.rx}" ry="${region.ry}" transform="rotate(${rot} ${region.x} ${region.y})" data-map-type="region" data-map-id="${escapeHtml(region.id)}"></ellipse>
      <ellipse class="city-envelope" cx="${region.x}" cy="${region.y}" rx="${region.cityRx}" ry="${region.cityRy}" transform="rotate(${rot} ${region.x} ${region.y})"></ellipse>
      <ellipse class="reserve-zone" cx="${region.x}" cy="${region.y}" rx="${region.cityRx * reserveRatio}" ry="${region.cityRy * reserveRatio}" transform="rotate(${rot} ${region.x} ${region.y})"></ellipse>
      <text class="region-label" x="${region.x}" y="${region.y - region.ry * 0.06}">${escapeHtml(region.label)}</text>
    </g>
  `;
}

function renderCityDot(city) {
  return `<circle class="city-dot ${city.regionId === "center" ? "center" : ""}" cx="${city.x}" cy="${city.y}" r="28"></circle>`;
}

function renderSelectionMarker() {
  const item = getSelectedItem();
  if (!item) return "";
  if (selected.type === "region") {
    return `<ellipse class="selection-marker" cx="${item.x}" cy="${item.y}" rx="${item.rx + 85}" ry="${item.ry + 85}" transform="rotate(${degrees(item.rot)} ${item.x} ${item.y})"></ellipse>`;
  }
  const midX = (item.from.x + item.to.x) / 2;
  const midY = (item.from.y + item.to.y) / 2;
  return `<circle class="selection-marker" cx="${midX}" cy="${midY}" r="${Math.max(110, item.width)}"></circle>`;
}

function generateCityPreview(world) {
  const count = Math.max(1, Math.floor(asNumber(world.cityCountPerRegion, 50)));
  return world.regions.flatMap(region => generateRegionCities(world, region, count));
}

function generateRegionCities(world, region, count) {
  const random = mulberry32(hashString(`editor:${world.version}:${region.id}`));
  const cities = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const minSpacing = region.id === "center" ? 132 : 112;
  const relaxedSpacing = region.id === "center" ? 88 : 76;
  for (let index = 0; index < count; index += 1) {
    const candidate = findCityPoint(region, cities, random, goldenAngle, index, minSpacing)
      || findCityPoint(region, cities, random, goldenAngle, index, relaxedSpacing)
      || fallbackCityPoint(region, random);
    cities.push({ ...candidate, regionId: region.id });
  }
  return cities;
}

function findCityPoint(region, existing, random, goldenAngle, index, spacing) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const reserveRatio = getReserveRatio(region);
    const ring = reserveRatio + (1 - reserveRatio) * Math.sqrt((index + 0.65) / 55);
    const jitter = 0.86 + random() * 0.18;
    const angle = index * goldenAngle + attempt * 0.51 + asNumber(region.rot, 0);
    const point = {
      x: Math.round(region.x + Math.cos(angle) * region.cityRx * ring * jitter + (random() - 0.5) * 85),
      y: Math.round(region.y + Math.sin(angle) * region.cityRy * ring * jitter + (random() - 0.5) * 85),
    };
    if (!pointInRegion(point.x, point.y, region, -42)) continue;
    if (pointInReserve(point.x, point.y, region)) continue;
    if (existing.some(city => Math.hypot(city.x - point.x, city.y - point.y) < spacing)) continue;
    return point;
  }
  return null;
}

function fallbackCityPoint(region, random) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const radius = getReserveRatio(region) + random() * (1 - getReserveRatio(region));
    const point = {
      x: Math.round(region.x + Math.cos(angle) * region.cityRx * radius),
      y: Math.round(region.y + Math.sin(angle) * region.cityRy * radius),
    };
    if (pointInRegion(point.x, point.y, region, -36) && !pointInReserve(point.x, point.y, region)) return point;
  }
  return { x: Math.round(region.x), y: Math.round(region.y + region.cityRy * 0.45) };
}

function getReserveRatio(region) {
  return Math.max(0, Math.min(0.8, asNumber(region.strongholdReserveRatio, asNumber(config.strongholdReserveRatio, 0.3))));
}

function pointInRegion(x, y, region, padding = 0) {
  const rot = -asNumber(region.rot, 0);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const dx = x - region.x;
  const dy = y - region.y;
  const xr = dx * cos - dy * sin;
  const yr = dx * sin + dy * cos;
  const rx = Math.max(1, region.cityRx + padding);
  const ry = Math.max(1, region.cityRy + padding);
  return (xr * xr) / (rx * rx) + (yr * yr) / (ry * ry) <= 1;
}

function pointInReserve(x, y, region) {
  const ratio = getReserveRatio(region);
  if (ratio <= 0) return false;
  const inner = { ...region, cityRx: region.cityRx * ratio, cityRy: region.cityRy * ratio };
  return pointInRegion(x, y, inner, 0);
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function updateField(target) {
  const scope = target.dataset.scope;
  const fieldName = target.dataset.field;
  if (!scope || !fieldName) return;

  const value = target.type === "number" ? asNumber(target.value, 0) : target.value;
  if (scope === "world") {
    config[fieldName] = fieldName === "version" || fieldName === "cityCountPerRegion" || fieldName === "width" || fieldName === "height" || fieldName === "gridSize"
      ? Math.round(value)
      : value;
  }

  if (scope === "region") {
    const region = config.regions.find(item => item.id === target.dataset.id);
    if (!region) return;
    if (fieldName === "id") {
      const nextId = cleanId(value, region.id);
      updateRegionId(region.id, nextId);
      selected = { type: "region", id: nextId };
    } else {
      region[fieldName] = target.type === "number" ? value : value;
    }
  }

  if (scope === "bridge") {
    const bridge = config.landBridges.find(item => item.id === target.dataset.id);
    if (!bridge) return;
    if (fieldName === "id") {
      const nextId = cleanId(value, bridge.id);
      bridge.id = nextId;
      selected = { type: "bridge", id: nextId };
    } else {
      bridge[fieldName] = Math.round(value);
    }
  }

  if (scope === "bridge-point") {
    const bridge = config.landBridges.find(item => item.id === target.dataset.id);
    const point = target.dataset.point;
    if (!bridge || !bridge[point]) return;
    bridge[point][fieldName] = Math.round(value);
  }

  markDirty();
  render();
}

function cleanId(value, fallback) {
  return String(value || fallback).trim().replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || fallback;
}

function updateRegionId(oldId, nextId) {
  const region = config.regions.find(item => item.id === oldId);
  if (!region) return;
  region.id = nextId;
}

function addRegion() {
  const index = config.regions.length + 1;
  const region = {
    id: `region-${index}`,
    label: `Region ${index}`,
    x: Math.round(config.width / 2),
    y: Math.round(config.height / 2),
    rx: 1000,
    ry: 800,
    cityRx: 760,
    cityRy: 580,
    rot: 0,
    palette: "heartland",
  };
  config.regions.push(region);
  selected = { type: "region", id: region.id };
  markDirty();
  render();
}

function addBridge() {
  const index = config.landBridges.length + 1;
  const bridge = {
    id: `bridge-${index}`,
    from: { x: Math.round(config.width / 2 - 300), y: Math.round(config.height / 2) },
    to: { x: Math.round(config.width / 2 + 300), y: Math.round(config.height / 2) },
    width: 320,
  };
  config.landBridges.push(bridge);
  selected = { type: "bridge", id: bridge.id };
  markDirty();
  render();
}

function deleteSelected(type, id) {
  if (type === "region") {
    config.regions = config.regions.filter(region => region.id !== id);
    selected = { type: "region", id: config.regions[0]?.id || "" };
  }
  if (type === "bridge") {
    config.landBridges = config.landBridges.filter(bridge => bridge.id !== id);
    selected = { type: "bridge", id: config.landBridges[0]?.id || "" };
  }
  markDirty();
  render();
}

function svgPoint(event) {
  const point = elements.mapSvg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(elements.mapSvg.getScreenCTM().inverse());
}

function beginDrag(event) {
  const target = event.target.closest("[data-map-type]");
  if (!target || !config) return;
  const type = target.dataset.mapType;
  const id = target.dataset.mapId;
  if (!id) return;
  const point = svgPoint(event);
  if (type === "region") {
    const region = config.regions.find(item => item.id === id);
    if (!region) return;
    selected = { type: "region", id };
    drag = { type: "region", id, start: point, origin: { x: region.x, y: region.y } };
  } else if (type === "bridge" || type === "bridge-point") {
    const bridge = config.landBridges.find(item => item.id === id);
    if (!bridge) return;
    selected = { type: "bridge", id };
    drag = {
      type: type === "bridge-point" ? "bridge-point" : "bridge",
      id,
      pointName: target.dataset.point || "",
      start: point,
      origin: clone(bridge),
    };
  }
  elements.mapSvg.setPointerCapture(event.pointerId);
  render();
}

function moveDrag(event) {
  if (!drag || !config) return;
  const point = svgPoint(event);
  const dx = point.x - drag.start.x;
  const dy = point.y - drag.start.y;
  if (drag.type === "region") {
    const region = config.regions.find(item => item.id === drag.id);
    if (!region) return;
    region.x = Math.round(drag.origin.x + dx);
    region.y = Math.round(drag.origin.y + dy);
  }
  if (drag.type === "bridge") {
    const bridge = config.landBridges.find(item => item.id === drag.id);
    if (!bridge) return;
    bridge.from.x = Math.round(drag.origin.from.x + dx);
    bridge.from.y = Math.round(drag.origin.from.y + dy);
    bridge.to.x = Math.round(drag.origin.to.x + dx);
    bridge.to.y = Math.round(drag.origin.to.y + dy);
  }
  if (drag.type === "bridge-point") {
    const bridge = config.landBridges.find(item => item.id === drag.id);
    if (!bridge || !bridge[drag.pointName]) return;
    bridge[drag.pointName].x = Math.round(drag.origin[drag.pointName].x + dx);
    bridge[drag.pointName].y = Math.round(drag.origin[drag.pointName].y + dy);
  }
  markDirty();
  render();
}

function endDrag(event) {
  if (!drag) return;
  if (elements.mapSvg.hasPointerCapture(event.pointerId)) elements.mapSvg.releasePointerCapture(event.pointerId);
  drag = null;
}

document.addEventListener("input", event => {
  if (event.target.matches("input[data-scope], select[data-scope]")) updateField(event.target);
});

document.addEventListener("click", event => {
  const selectButton = event.target.closest("[data-select-type]");
  if (selectButton) {
    selected = { type: selectButton.dataset.selectType, id: selectButton.dataset.selectId };
    render();
    return;
  }
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    deleteSelected(deleteButton.dataset.deleteType, deleteButton.dataset.deleteId);
  }
});

elements.addRegionBtn.addEventListener("click", addRegion);
elements.addBridgeBtn.addEventListener("click", addBridge);
elements.reloadBtn.addEventListener("click", () => loadConfig().catch(error => setStatus(error.message, "save-error")));
elements.githubImportBtn.addEventListener("click", () => importGithubConfig().catch(error => setStatus(error.message, "save-error")));
elements.saveBtn.addEventListener("click", () => saveConfig().catch(error => setStatus(error.message, "save-error")));
elements.previewBtn.addEventListener("click", () => window.open("/game/", "_blank"));
elements.cityPreviewToggle.addEventListener("change", event => {
  showCities = event.target.checked;
  renderMap();
});
elements.mapSvg.addEventListener("pointerdown", beginDrag);
elements.mapSvg.addEventListener("pointermove", moveDrag);
elements.mapSvg.addEventListener("pointerup", endDrag);
elements.mapSvg.addEventListener("pointercancel", endDrag);

window.addEventListener("beforeunload", event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

bootEditor().catch(error => setStatus(error.message, "save-error"));
