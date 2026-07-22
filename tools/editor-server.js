const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const vm = require("vm");

const ROOT_DIR = path.resolve(__dirname, "..");
const EDITOR_DIR = path.join(__dirname, "map-editor");
const WORLD_CONFIG_PATH = path.join(ROOT_DIR, "world-config.js");
const WORLD_DATA_ROOT = path.join(ROOT_DIR, "assets", "worlds", "world_01");
const WORLD_LAYOUT_PATH = path.join(WORLD_DATA_ROOT, "world-layout.json");
const WORLD_REGIONS_DIR = path.join(WORLD_DATA_ROOT, "regions");
const WORLD_MAPS_DIR = path.join(WORLD_DATA_ROOT, "maps");
const MAP_EDITOR_DATA_PATH = path.join(ROOT_DIR, "assets", "map-editor-data.js");
const SERVER_WORLD_LAYOUT_PATH = path.join(ROOT_DIR, "functions", "world-layout.json");
const GITHUB_WORLD_CONFIG_URL = "https://raw.githubusercontent.com/explocion200/crownlands-game/main/world-config.js";
const HOST = "127.0.0.1";
const START_PORT = Number(process.env.PORT) || 8791;
const MAX_BODY_BYTES = 32 * 1024 * 1024;
const MAP_ASPECT_WIDTH = 4;
const MAP_ASPECT_HEIGHT = 3;
const MAP_ASPECT_RATIO = MAP_ASPECT_WIDTH / MAP_ASPECT_HEIGHT;
const MAP_ASPECT_TOLERANCE = 0.02;
const DEFAULT_MAP_WIDTH = 2048;
const DEFAULT_MAP_HEIGHT = 1536;
const ROOT_STATIC_FILES = new Set([
  "/firebaseClient.js",
  "/game.js",
  "/index.html",
  "/styles.css",
  "/world-config.js",
]);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendText(response, status, text) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0] || "");
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, "");
  const resolved = path.resolve(root, normalized);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

async function serveFile(response, filePath) {
  try {
    const stats = await fsp.stat(filePath);
    const finalPath = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const data = await fsp.readFile(finalPath);
    response.writeHead(200, {
      "content-type": MIME_TYPES.get(path.extname(finalPath).toLowerCase()) || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(data);
  } catch (error) {
    sendText(response, 404, "Not found");
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function readWorldConfig() {
  const source = await fsp.readFile(WORLD_CONFIG_PATH, "utf8");
  return parseWorldConfigSource(source, "world-config.js");
}

function parseWorldConfigSource(source, filename = "world-config.js") {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename, timeout: 1000 });
  return sanitizeWorldConfig(context.window.CROWNLANDS_WORLD_CONFIG || {});
}

function cleanString(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 80);
}

function cleanId(value, fallback) {
  return cleanString(value, fallback).replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || fallback;
}

function number(value, fallback, min = -Infinity, max = Infinity) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanVisualSize(value, fallback) {
  const parsed = Math.floor(Number(value));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const fallbackSize = Math.floor(Number(fallback));
  return Number.isFinite(fallbackSize) && fallbackSize > 0 ? fallbackSize : 1;
}

function isFourThreeDimensions(width, height) {
  const safeWidth = Number(width) || 0;
  const safeHeight = Number(height) || 0;
  if (safeWidth <= 0 || safeHeight <= 0) return false;
  return Math.abs((safeWidth / safeHeight) - MAP_ASPECT_RATIO) <= MAP_ASPECT_TOLERANCE;
}

function cleanMapDimensions(width, height) {
  const safeWidth = Math.floor(number(width, DEFAULT_MAP_WIDTH, 256, 8192));
  const safeHeight = Math.floor(number(height, DEFAULT_MAP_HEIGHT, 256, 8192));
  if (isFourThreeDimensions(safeWidth, safeHeight)) {
    return { width: safeWidth, height: safeHeight };
  }
  return { width: DEFAULT_MAP_WIDTH, height: DEFAULT_MAP_HEIGHT };
}

function sanitizeWorldConfig(config) {
  const safe = {
    version: Math.max(1, Math.floor(number(config.version, 23))),
    name: cleanString(config.name, "Five Island Crownlands"),
    width: Math.floor(number(config.width, 10000, 1000, 50000)),
    height: Math.floor(number(config.height, 7600, 1000, 50000)),
    gridSize: Math.floor(number(config.gridSize, 50, 20, 400)),
    cityCountPerRegion: Math.floor(number(config.cityCountPerRegion, 50, 1, 250)),
    strongholdReserveRatio: number(config.strongholdReserveRatio, 0.3, 0, 0.8),
    regions: [],
    landBridges: [],
  };

  const regions = Array.isArray(config.regions) ? config.regions : [];
  safe.regions = regions.map((region, index) => {
    const id = cleanId(region.id, `region-${index + 1}`);
    return {
      id,
      label: cleanString(region.label, id),
      x: Math.round(number(region.x, safe.width / 2, 0, safe.width)),
      y: Math.round(number(region.y, safe.height / 2, 0, safe.height)),
      rx: Math.round(number(region.rx, 1000, 100, safe.width)),
      ry: Math.round(number(region.ry, 800, 100, safe.height)),
      cityRx: Math.round(number(region.cityRx, region.rx || 800, 50, safe.width)),
      cityRy: Math.round(number(region.cityRy, region.ry || 600, 50, safe.height)),
      rot: number(region.rot, 0, -Math.PI, Math.PI),
      palette: cleanId(region.palette, "heartland"),
    };
  });

  const bridges = Array.isArray(config.landBridges) ? config.landBridges : [];
  safe.landBridges = bridges.map((bridge, index) => ({
    id: cleanId(bridge.id, `bridge-${index + 1}`),
    from: {
      x: Math.round(number(bridge.from?.x, safe.width / 2, 0, safe.width)),
      y: Math.round(number(bridge.from?.y, safe.height / 2, 0, safe.height)),
    },
    to: {
      x: Math.round(number(bridge.to?.x, safe.width / 2, 0, safe.width)),
      y: Math.round(number(bridge.to?.y, safe.height / 2, 0, safe.height)),
    },
    width: Math.round(number(bridge.width, 360, 40, 2000)),
  }));

  return safe;
}

async function writeWorldConfig(config) {
  const safe = sanitizeWorldConfig(config);
  const body = `window.CROWNLANDS_WORLD_CONFIG = ${JSON.stringify(safe, null, 2)};\n`;
  const tempPath = `${WORLD_CONFIG_PATH}.tmp`;
  await fsp.writeFile(tempPath, body, "utf8");
  await fsp.rename(tempPath, WORLD_CONFIG_PATH);
  return safe;
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function normalizePathForJson(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function regionFilePath(regionId) {
  return path.join(WORLD_REGIONS_DIR, `${cleanId(regionId, "region")}.json`);
}

function publicRegionPath(regionId) {
  return `assets/worlds/world_01/regions/${cleanId(regionId, "region")}.json`;
}

function publicMapImagePath(filename) {
  return `assets/worlds/world_01/maps/${filename}`;
}

function uploadedMapImagePathForRegion(imagePath, regionId) {
  const normalized = normalizePathForJson(imagePath);
  const mapsPrefix = "assets/worlds/world_01/maps/";
  if (!normalized.startsWith(mapsPrefix)) return null;
  const fileName = normalized.slice(mapsPrefix.length);
  const expectedPrefix = `${cleanId(regionId, "region")}-`;
  if (!fileName || fileName.includes("/") || fileName.includes("..") || !fileName.startsWith(expectedPrefix)) {
    return null;
  }
  const mapsRoot = path.resolve(WORLD_MAPS_DIR);
  const filePath = path.resolve(WORLD_MAPS_DIR, fileName);
  const relativePath = path.relative(mapsRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return {
    fileName,
    filePath,
    imagePath: publicMapImagePath(fileName),
  };
}

async function deletePreviousUploadedMapImage(previousImagePath, regionId, nextFilePath) {
  const previous = uploadedMapImagePathForRegion(previousImagePath, regionId);
  if (!previous) return null;
  if (nextFilePath && path.resolve(previous.filePath) === path.resolve(nextFilePath)) return null;
  try {
    await fsp.unlink(previous.filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return previous;
}

function cleanUploadExtension(filename, mimeType = "") {
  const extension = path.extname(String(filename || "")).toLowerCase();
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  if (allowed.has(extension)) return extension;
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

async function writeMapImageUpload(payload = {}) {
  const regionId = cleanId(payload.regionId, "region");
  const extension = cleanUploadExtension(payload.filename, payload.mimeType);
  if (!extension) throw new Error("Map image must be a JPG, PNG, or WebP file.");
  if (!isFourThreeDimensions(payload.width, payload.height)) {
    throw new Error("Map image must be 4:3, such as 2048 x 1536.");
  }
  const encoded = String(payload.base64 || "").replace(/^data:[^,]+,/, "");
  if (!encoded) throw new Error("Map image upload is empty.");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("Map image upload could not be decoded.");
  const dimensions = cleanMapDimensions(payload.width, payload.height);
  const baseName = cleanId(path.basename(String(payload.filename || "map"), extension), "map").slice(0, 48);
  const fileName = `${regionId}-${baseName}-${Date.now()}${extension}`;
  await fsp.mkdir(WORLD_MAPS_DIR, { recursive: true });
  const filePath = path.join(WORLD_MAPS_DIR, fileName);
  await fsp.writeFile(filePath, buffer);
  const replacedImage = await deletePreviousUploadedMapImage(payload.previousImagePath, regionId, filePath);
  return {
    fileName,
    imagePath: publicMapImagePath(fileName),
    filePath,
    replacedImagePath: replacedImage?.imagePath || "",
    width: dimensions.width,
    height: dimensions.height,
  };
}

function getSideConnections(edgeConnections, side) {
  return Array.isArray(edgeConnections?.[side]) ? edgeConnections[side] : [];
}

function cleanNorm(value, fallback = 0) {
  return number(value, fallback, 0, 1);
}

function defaultEdgeArrowPoint(side, start, end) {
  const center = cleanNorm((Math.min(start, end) + Math.max(start, end)) / 2, 0.5);
  const inset = 0.12;
  if (side === "north") return { x: center, y: inset };
  if (side === "south") return { x: center, y: 1 - inset };
  if (side === "west") return { x: inset, y: center };
  return { x: 1 - inset, y: center };
}

function cleanEdgeZone(zone, index, side) {
  const start = cleanNorm(zone.start, 0);
  const end = cleanNorm(zone.end, 1);
  const arrowFallback = defaultEdgeArrowPoint(side, start, end);
  return {
    id: cleanId(zone.id, `${side}_connection_${index + 1}`),
    side,
    start: Math.min(start, end),
    end: Math.max(start, end),
    type: cleanId(zone.type, "road"),
    connectsToRegionId: cleanId(zone.connectsToRegionId, ""),
    arrowXNorm: cleanNorm(zone.arrowXNorm, arrowFallback.x),
    arrowYNorm: cleanNorm(zone.arrowYNorm, arrowFallback.y),
    intentionalOuter: Boolean(zone.intentionalOuter),
    notes: cleanString(zone.notes, "").slice(0, 240),
  };
}

function normalizeEdgeConnections(edgeConnections = {}) {
  return ["north", "south", "east", "west"].reduce((result, side) => {
    result[side] = getSideConnections(edgeConnections, side).map((zone, index) => cleanEdgeZone(zone, index, side));
    return result;
  }, {});
}

function cleanWorldRegionSummary(region) {
  const id = cleanId(region.id, "region");
  const dimensions = cleanMapDimensions(region.width || region.imageWidth, region.height || region.imageHeight);
  return {
    id,
    name: cleanString(region.name || region.label, titleCase(id)),
    type: cleanId(region.type, "starter"),
    gridX: Math.round(number(region.gridX, 0, -1000, 1000)),
    gridY: Math.round(number(region.gridY, 0, -1000, 1000)),
    width: dimensions.width,
    height: dimensions.height,
    imagePath: normalizePathForJson(region.imagePath || region.imageSrc),
    cityCapacity: Math.floor(number(region.cityCapacity, region.type === "crownlands_main" ? 100 : 50, 0, 500)),
    regionPath: normalizePathForJson(region.regionPath || publicRegionPath(id)),
  };
}

function titleCase(value) {
  return String(value || "region")
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Region";
}

function cleanCity(city, index, region) {
  const xNorm = cleanNorm(city.xNorm ?? (Number(city.x) / Math.max(1, Number(region.width) || 1)), 0.5);
  const yNorm = cleanNorm(city.yNorm ?? (Number(city.y) / Math.max(1, Number(region.height) || 1)), 0.5);
  return {
    id: cleanId(city.id, `${region.id}_city_${String(index + 1).padStart(3, "0")}`),
    name: cleanString(city.name, `City ${index + 1}`),
    regionId: region.id,
    xNorm,
    yNorm,
    level: Math.max(1, Math.floor(number(city.level, 1, 1, 100))),
    owner: cleanId(city.owner, "neutral"),
    startType: cleanId(city.startType, "neutral"),
    troops: Math.max(0, Math.floor(number(city.troops, 10, 0, 1000000000))),
  };
}

function cleanStronghold(stronghold, index, region) {
  const type = cleanId(stronghold.strongholdType || stronghold.type, region.type === "crownlands_main" ? "crown_citadel" : "gold_stronghold");
  const xNorm = cleanNorm(stronghold.xNorm ?? (Number(stronghold.x) / Math.max(1, Number(region.width) || 1)), 0.5);
  const yNorm = cleanNorm(stronghold.yNorm ?? (Number(stronghold.y) / Math.max(1, Number(region.height) || 1)), 0.5);
  const defaults = getStrongholdDefaults(type);
  return {
    id: cleanId(stronghold.id, `${region.id}_${type}_${index + 1}`),
    name: cleanString(stronghold.name, defaults.name),
    regionId: region.id,
    xNorm,
    yNorm,
    strongholdType: type,
    bonusType: cleanId(stronghold.bonusType || stronghold.bonus || defaults.bonusType, defaults.bonusType),
    bonusAmount: Math.max(0, Math.floor(number(stronghold.bonusAmount ?? stronghold.bonusPercent, defaults.bonusAmount, 0, 1000))),
    startingOwner: cleanId(stronghold.startingOwner || stronghold.owner, "neutral"),
    level: Math.max(1, Math.floor(number(stronghold.level, defaults.level, 1, 100))),
    troops: Math.max(0, Math.floor(number(stronghold.troops ?? stronghold.startTroops, defaults.troops, 0, 1000000000))),
    artSrc: normalizePathForJson(stronghold.artSrc || defaults.artSrc),
    size: cleanVisualSize(stronghold.size, defaults.size),
    notes: cleanString(stronghold.notes, "").slice(0, 240),
  };
}

function cleanCamp(camp, index, region) {
  const type = cleanCampType(camp.campType || camp.type);
  const defaults = getCampDefaults(type);
  const xNorm = cleanNorm(camp.xNorm ?? (Number(camp.x) / Math.max(1, Number(region.width) || 1)), 0.5);
  const yNorm = cleanNorm(camp.yNorm ?? (Number(camp.y) / Math.max(1, Number(region.height) || 1)), 0.5);
  return {
    id: cleanId(camp.id, `${region.id}_${type}_camp_${index + 1}`),
    name: cleanString(camp.name, defaults.name),
    regionId: region.id,
    xNorm,
    yNorm,
    campType: type,
    artSrc: normalizePathForJson(camp.artSrc || defaults.artSrc),
    size: cleanVisualSize(camp.size, defaults.size),
    notes: cleanString(camp.notes, "").slice(0, 240),
  };
}

function getStrongholdDefaults(type) {
  const normalized = cleanId(type, "gold_stronghold");
  const defaults = {
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
  return defaults[normalized] || defaults.gold_stronghold;
}

function cleanCampType(type) {
  const value = cleanId(type, "gold");
  return ["gold", "troops", "items", "deed"].includes(value) ? value : "gold";
}

function getCampDefaults(type) {
  const normalized = cleanCampType(type);
  const defaults = {
    gold: {
      name: "Gold Camp",
      artSrc: "assets/camps/gold.png",
      size: 132,
    },
    troops: {
      name: "Warband Camp",
      artSrc: "assets/camps/troops.png",
      size: 132,
    },
    items: {
      name: "Item Camp",
      artSrc: "assets/camps/items.png",
      size: 132,
    },
    deed: {
      name: "Deed Camp",
      artSrc: "assets/camps/deed.png",
      size: 132,
    },
  };
  return defaults[normalized] || defaults.gold;
}

function normalizeRegionDocument(rawRegion) {
  const summary = cleanWorldRegionSummary(rawRegion);
  const region = {
    ...summary,
    cities: [],
    strongholds: [],
    camps: [],
    edgeConnections: normalizeEdgeConnections(rawRegion.edgeConnections),
    notes: cleanString(rawRegion.notes, "").slice(0, 500),
  };
  region.cities = (Array.isArray(rawRegion.cities) ? rawRegion.cities : []).map((city, index) => cleanCity(city, index, region));
  region.strongholds = (Array.isArray(rawRegion.strongholds) ? rawRegion.strongholds : []).map((stronghold, index) => cleanStronghold(stronghold, index, region));
  region.camps = (Array.isArray(rawRegion.camps) ? rawRegion.camps : []).map((camp, index) => cleanCamp(camp, index, region));
  if (rawRegion.compatRegion && typeof rawRegion.compatRegion === "object") {
    region.compatRegion = rawRegion.compatRegion;
  }
  return region;
}

function normalizeWorldBundle(payload = {}) {
  const rawLayout = payload.layout || payload.worldLayout || payload;
  const rawRegions = Array.isArray(payload.regions)
    ? payload.regions
    : Array.isArray(rawLayout.regions)
      ? rawLayout.regions.map(region => payload.regionData?.[region.id] || region)
      : [];
  const regions = rawRegions.map(normalizeRegionDocument);
  const layout = {
    worldId: cleanId(rawLayout.worldId, "world_01"),
    worldName: cleanString(rawLayout.worldName, "Crownlands World 01"),
    schemaVersion: Math.max(1, Math.floor(number(rawLayout.schemaVersion, 1, 1, 1000))),
    updatedAt: new Date().toISOString(),
    globalSettings: {
      defaultMapWidth: cleanMapDimensions(rawLayout.globalSettings?.defaultMapWidth, rawLayout.globalSettings?.defaultMapHeight).width,
      defaultMapHeight: cleanMapDimensions(rawLayout.globalSettings?.defaultMapWidth, rawLayout.globalSettings?.defaultMapHeight).height,
      minimumCitySpacing: number(rawLayout.globalSettings?.minimumCitySpacing, 0.045, 0.005, 0.25),
      worldWidth: Math.floor(number(rawLayout.globalSettings?.worldWidth, 10000, 1000, 100000)),
      worldHeight: Math.floor(number(rawLayout.globalSettings?.worldHeight, 7600, 1000, 100000)),
      gridCellWorldSize: Math.floor(number(rawLayout.globalSettings?.gridCellWorldSize, 2300, 500, 10000)),
    },
    regions: regions.map(cleanWorldRegionSummary),
  };
  return { layout, regions };
}

async function readWorldData() {
  const layout = await readJsonFile(WORLD_LAYOUT_PATH, null);
  if (!layout) return buildWorldDataFromMapEditorData();
  const regions = [];
  for (const summary of Array.isArray(layout.regions) ? layout.regions : []) {
    const filePath = regionFilePath(summary.id);
    const region = await readJsonFile(filePath, null);
    regions.push(region ? { ...summary, ...region } : summary);
  }
  return normalizeWorldBundle({ layout, regions });
}

async function buildWorldDataFromMapEditorData() {
  const source = await fsp.readFile(MAP_EDITOR_DATA_PATH, "utf8").catch(() => "");
  const context = { window: {} };
  if (source) {
    vm.createContext(context);
    vm.runInContext(source, context, { filename: "map-editor-data.js", timeout: 1000 });
  }
  const data = context.window.CROWNLANDS_MAP_EDITOR_DATA || {};
  const maps = Array.isArray(data.maps) ? data.maps : [];
  const regions = maps.map((map, index) => {
    const id = cleanId(map.id, `region-${index + 1}`);
    const sourceWidth = Math.max(1, Number(map.imageWidth || map.width) || DEFAULT_MAP_WIDTH);
    const sourceHeight = Math.max(1, Number(map.imageHeight || map.height) || DEFAULT_MAP_HEIGHT);
    const dimensions = cleanMapDimensions(sourceWidth, sourceHeight);
    const region = {
      id,
      name: cleanString(map.label || map.name, titleCase(id)),
      gridX: Math.round(number(map.gridX, id === "west" ? -1 : id === "east" ? 1 : 0)),
      gridY: Math.round(number(map.gridY, id === "north" ? -1 : id === "south" ? 1 : 0)),
      type: id === "center" ? "crownlands_main" : "starter",
      cityCapacity: id === "center" ? 100 : 50,
      width: dimensions.width,
      height: dimensions.height,
      imagePath: normalizePathForJson(map.imageSrc || map.image?.src),
      compatRegion: map.region || null,
      cities: (Array.isArray(map.cities) ? map.cities : []).map((city, cityIndex) => ({
        id: city.id || `${id}_city_${String(cityIndex + 1).padStart(3, "0")}`,
        name: city.name || `City ${cityIndex + 1}`,
        xNorm: cleanNorm(city.xNorm ?? ((Number(city.x) || 0) / sourceWidth), 0.5),
        yNorm: cleanNorm(city.yNorm ?? ((Number(city.y) || 0) / sourceHeight), 0.5),
        level: Math.max(1, Math.floor(Number(city.level) || 1)),
        owner: "neutral",
        startType: "neutral",
        troops: Math.max(0, Math.floor(Number(city.troops) || 10)),
      })),
      strongholds: (Array.isArray(map.objectives) ? map.objectives : []).map((objective, objectiveIndex) => ({
        id: objective.id || `${id}_stronghold_${objectiveIndex + 1}`,
        name: objective.name || "Stronghold",
        xNorm: cleanNorm(objective.xNorm ?? ((Number(objective.x) || 0) / sourceWidth), 0.5),
        yNorm: cleanNorm(objective.yNorm ?? ((Number(objective.y) || 0) / sourceHeight), 0.5),
        strongholdType: expandStrongholdType(objective.strongholdType || objective.type),
        bonusType: objective.bonus || getStrongholdDefaults(expandStrongholdType(objective.strongholdType || objective.type)).bonusType,
        bonusAmount: Number(objective.bonusPercent) || getStrongholdDefaults(expandStrongholdType(objective.strongholdType || objective.type)).bonusAmount,
        startingOwner: "neutral",
        level: objective.level,
        troops: objective.troops || objective.startTroops,
        artSrc: objective.artSrc,
        size: objective.size,
      })),
      camps: (Array.isArray(map.camps) ? map.camps : []).map((camp, campIndex) => ({
        id: camp.id || `${id}_${cleanCampType(camp.campType || camp.type)}_camp_${campIndex + 1}`,
        name: camp.name,
        xNorm: cleanNorm(camp.xNorm ?? ((Number(camp.x) || 0) / sourceWidth), 0.5),
        yNorm: cleanNorm(camp.yNorm ?? ((Number(camp.y) || 0) / sourceHeight), 0.5),
        campType: cleanCampType(camp.campType || camp.type),
        artSrc: camp.artSrc,
        size: camp.size,
        notes: camp.notes,
      })),
      edgeConnections: { north: [], south: [], east: [], west: [] },
    };
    return region;
  });
  return normalizeWorldBundle({
    worldId: "world_01",
    worldName: "Crownlands World 01",
    globalSettings: {},
    regions,
  });
}

function expandStrongholdType(type) {
  const value = cleanId(type, "gold");
  if (value === "crown" || value === "crown_citadel") return "crown_citadel";
  if (value === "training" || value === "troop" || value === "troop_stronghold") return "troop_stronghold";
  if (value === "speed" || value === "march_speed" || value === "march_speed_stronghold") return "march_speed_stronghold";
  if (value === "defense" || value === "defense_stronghold") return "defense_stronghold";
  if (value === "upgrade_discount" || value === "upgrade_discount_stronghold") return "upgrade_discount_stronghold";
  return "gold_stronghold";
}

function compactStrongholdType(type) {
  const value = expandStrongholdType(type);
  if (value === "crown_citadel") return "crown";
  if (value === "troop_stronghold") return "training";
  if (value === "march_speed_stronghold") return "speed";
  if (value === "defense_stronghold") return "defense";
  if (value === "upgrade_discount_stronghold") return "upgradeDiscount";
  return "gold";
}

function buildCompatibilityRegion(layout, region) {
  const compatRegion = region.compatRegion && typeof region.compatRegion === "object" ? region.compatRegion : {};
  const cellSize = Math.max(500, Number(layout.globalSettings?.gridCellWorldSize) || 2300);
  const worldWidth = Math.max(1000, Number(layout.globalSettings?.worldWidth) || 10000);
  const worldHeight = Math.max(1000, Number(layout.globalSettings?.worldHeight) || 7600);
  const aspect = Math.max(0.2, (Number(region.width) || 2048) / Math.max(1, Number(region.height) || 2048));
  const defaultRx = aspect >= 1 ? Math.round(cellSize * 0.46) : Math.round(cellSize * 0.36);
  const defaultRy = aspect >= 1 ? Math.round(cellSize * 0.36) : Math.round(cellSize * 0.46);
  const rx = Math.max(1, Math.round(number(compatRegion.rx, defaultRx, 1, 100000)));
  const ry = Math.max(1, Math.round(number(compatRegion.ry, defaultRy, 1, 100000)));
  return {
    ...compatRegion,
    id: region.id,
    label: region.name,
    gridX: region.gridX,
    gridY: region.gridY,
    x: Math.round(worldWidth / 2 + Number(region.gridX) * cellSize),
    y: Math.round(worldHeight / 2 + Number(region.gridY) * cellSize),
    rx,
    ry,
    cityRx: Math.max(1, Math.round(number(compatRegion.cityRx, Math.round(rx * 0.82), 1, 100000))),
    cityRy: Math.max(1, Math.round(number(compatRegion.cityRy, Math.round(ry * 0.76), 1, 100000))),
    rot: Number.isFinite(Number(compatRegion.rot)) ? Number(compatRegion.rot) : 0,
    palette: compatRegion.palette || (region.type === "crownlands_main" ? "heartland" : "woodland"),
  };
}

function buildCompatibilityMapData(layout, regions) {
  return {
    version: Number(new Date().toISOString().replace(/\D/g, "").slice(0, 12)),
    updatedAt: new Date().toISOString(),
    worldId: layout.worldId,
    worldName: layout.worldName,
    globalSettings: layout.globalSettings || {},
    maps: regions.map(region => ({
      id: region.id,
      label: region.name,
      gridX: region.gridX,
      gridY: region.gridY,
      type: region.type,
      cityCapacity: region.cityCapacity,
      imageSrc: region.imagePath,
      thumbnailSrc: region.thumbnailPath || "",
      imageWidth: region.width,
      imageHeight: region.height,
      region: buildCompatibilityRegion(layout, region),
      cities: region.cities.map(city => ({
        id: city.id,
        name: city.name,
        x: Math.round(city.xNorm * region.width),
        y: Math.round(city.yNorm * region.height),
        xNorm: city.xNorm,
        yNorm: city.yNorm,
        level: city.level,
        troops: city.troops,
        owner: city.owner,
        startType: city.startType,
      })),
      objectives: region.strongholds.map(stronghold => {
        const gameType = compactStrongholdType(stronghold.strongholdType);
        return {
          id: stronghold.id,
          name: stronghold.name,
          x: Math.round(stronghold.xNorm * region.width),
          y: Math.round(stronghold.yNorm * region.height),
          xNorm: stronghold.xNorm,
          yNorm: stronghold.yNorm,
          type: gameType,
          strongholdType: gameType,
          sourceStrongholdType: stronghold.strongholdType,
          bonus: stronghold.bonusType,
          bonusPercent: stronghold.bonusAmount,
          level: stronghold.level,
          troops: stronghold.troops,
          startTroops: stronghold.troops,
          artSrc: stronghold.artSrc,
          size: stronghold.size,
        };
      }),
      camps: region.camps.map(camp => ({
        id: camp.id,
        name: camp.name,
        x: Math.round(camp.xNorm * region.width),
        y: Math.round(camp.yNorm * region.height),
        xNorm: camp.xNorm,
        yNorm: camp.yNorm,
        type: camp.campType,
        campType: camp.campType,
        artSrc: camp.artSrc,
        size: camp.size,
        notes: camp.notes,
      })),
      edgeConnections: region.edgeConnections,
    })),
  };
}

async function writeWorldData(payload) {
  const bundle = normalizeWorldBundle(payload);
  await fsp.mkdir(WORLD_REGIONS_DIR, { recursive: true });
  const normalizedRegions = bundle.regions.map(normalizeRegionDocument);
  const layout = {
    ...bundle.layout,
    regions: normalizedRegions.map(cleanWorldRegionSummary),
    updatedAt: new Date().toISOString(),
  };
  for (const region of normalizedRegions) {
    await fsp.writeFile(regionFilePath(region.id), `${JSON.stringify(region, null, 2)}\n`, "utf8");
  }
  await fsp.writeFile(WORLD_LAYOUT_PATH, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
  const compatibilityData = buildCompatibilityMapData(layout, normalizedRegions);
  await fsp.writeFile(MAP_EDITOR_DATA_PATH, `window.CROWNLANDS_MAP_EDITOR_DATA = ${JSON.stringify(compatibilityData, null, 2)};\n`, "utf8");
  await fsp.mkdir(path.dirname(SERVER_WORLD_LAYOUT_PATH), { recursive: true });
  await fsp.writeFile(SERVER_WORLD_LAYOUT_PATH, `${JSON.stringify(compatibilityData, null, 2)}\n`, "utf8");
  return { layout, regions: normalizedRegions, compatibilityData };
}

async function downloadGithubWorldConfig() {
  const sourceUrl = `${GITHUB_WORLD_CONFIG_URL}?t=${Date.now()}`;
  const response = await fetch(sourceUrl, {
    headers: {
      "accept": "text/plain",
      "user-agent": "crownlands-local-editor",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub map download failed: ${response.status} ${response.statusText}`);
  }
  const source = await response.text();
  const config = parseWorldConfigSource(source, "github-world-config.js");
  const saved = await writeWorldConfig(config);
  return { config: saved, sourceUrl: GITHUB_WORLD_CONFIG_URL };
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/world-data" && request.method === "GET") {
    const data = await readWorldData();
    sendJson(response, 200, {
      ...data,
      paths: {
        worldLayout: WORLD_LAYOUT_PATH,
        regions: WORLD_REGIONS_DIR,
        compatibilityData: MAP_EDITOR_DATA_PATH,
      },
    });
    return;
  }

  if (pathname === "/api/world-data" && request.method === "POST") {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const data = await writeWorldData(payload);
    sendJson(response, 200, {
      ok: true,
      ...data,
      paths: {
        worldLayout: WORLD_LAYOUT_PATH,
        regions: WORLD_REGIONS_DIR,
        compatibilityData: MAP_EDITOR_DATA_PATH,
      },
    });
    return;
  }

  if (pathname === "/api/map-image" && request.method === "POST") {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const image = await writeMapImageUpload(payload);
    sendJson(response, 200, { ok: true, ...image });
    return;
  }

  if (pathname === "/api/map-image") {
    sendJson(response, 405, {
      error: "Map image uploads must be sent from the local editor page. Run .\\tools\\start-editor.ps1 and open http://127.0.0.1:8791/editor/.",
    });
    return;
  }

  if (pathname === "/api/world-config" && request.method === "GET") {
    const config = await readWorldConfig();
    sendJson(response, 200, { config, path: WORLD_CONFIG_PATH });
    return;
  }

  if (pathname === "/api/world-config" && request.method === "POST") {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const config = await writeWorldConfig(payload.config);
    sendJson(response, 200, { ok: true, config, path: WORLD_CONFIG_PATH });
    return;
  }

  if (pathname === "/api/world-config/import-github" && request.method === "POST") {
    const result = await downloadGithubWorldConfig();
    sendJson(response, 200, { ok: true, path: WORLD_CONFIG_PATH, ...result });
    return;
  }

  sendJson(response, 404, { error: "Unknown API route." });
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${HOST}`);
      const pathname = url.pathname;

      if (pathname.startsWith("/api/")) {
        await handleApi(request, response, pathname);
        return;
      }

      if (pathname === "/" || pathname === "/editor") {
        response.writeHead(302, { location: "/editor/" });
        response.end();
        return;
      }

      if (pathname === "/tools/editor" || pathname === "/tools/editor/" || pathname.startsWith("/tools/editor/")) {
        response.writeHead(302, { location: "/editor/" });
        response.end();
        return;
      }

      if (pathname === "/tools/map-editor" || pathname === "/tools/map-editor/") {
        response.writeHead(302, { location: "/editor/" });
        response.end();
        return;
      }

      if (pathname.startsWith("/tools/map-editor/")) {
        const editorPath = pathname.replace(/^\/tools\/map-editor\/?/, "");
        response.writeHead(302, { location: `/editor/${editorPath}` });
        response.end();
        return;
      }

      if (pathname.startsWith("/editor/")) {
        const filePath = safeJoin(EDITOR_DIR, pathname.replace(/^\/editor\/?/, ""));
        if (!filePath) {
          sendText(response, 403, "Forbidden");
          return;
        }
        await serveFile(response, filePath);
        return;
      }

      if (pathname.startsWith("/assets/") || ROOT_STATIC_FILES.has(pathname)) {
        const filePath = safeJoin(ROOT_DIR, pathname);
        if (!filePath) {
          sendText(response, 403, "Forbidden");
          return;
        }
        await serveFile(response, filePath);
        return;
      }

      if (pathname === "/game" || pathname === "/game/") {
        await serveFile(response, path.join(ROOT_DIR, "index.html"));
        return;
      }

      if (pathname.startsWith("/game/")) {
        const filePath = safeJoin(ROOT_DIR, pathname.replace(/^\/game\/?/, ""));
        if (!filePath) {
          sendText(response, 403, "Forbidden");
          return;
        }
        await serveFile(response, filePath);
        return;
      }

      sendText(response, 404, "Not found");
    } catch (error) {
      sendJson(response, 500, { error: error.message || String(error) });
    }
  });
}

function listenWithFallback(server, port) {
  server.once("error", error => {
    if (error.code === "EADDRINUSE" && port < START_PORT + 20) {
      listenWithFallback(createServer(), port + 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    console.log(`Crownlands editor running at http://${HOST}:${port}/editor/`);
    console.log(`Game preview running at http://${HOST}:${port}/game/`);
  });
}

listenWithFallback(createServer(), START_PORT);
