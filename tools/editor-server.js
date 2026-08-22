const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const vm = require("vm");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { getCanonicalLayoutCityName } = require("./city-name-utils");
const { buildRegionCatalog } = require("../region-catalog");
const { createProjectFileService } = require("./crownlands-studio/project-file-service");
const { createUiEditorService } = require("./crownlands-studio/ui-editor-service");
const execFileAsync = promisify(execFile);
const OPTIMIZED_ASSET_PATHS = new Map(
  require("../assets/optimized/manifest.json").assets.map(asset => [asset.source, asset.output]),
);

const ROOT_DIR = path.resolve(__dirname, "..");
const EDITOR_DIR = path.join(__dirname, "map-editor");
const WORLD_CONFIG_PATH = path.join(ROOT_DIR, "world-config.js");
const ECONOMY_CONFIG_PATH = path.join(ROOT_DIR, "economy-config.js");
const UI_LAYOUT_CONFIG_PATH = path.join(ROOT_DIR, "ui-layout-config.js");
const SERVER_ECONOMY_CONFIG_PATH = path.join(ROOT_DIR, "functions", "economy-config.json");
const DEFAULT_ECONOMY_CONFIG = require("../functions/economy-config.json");
const WORLD_DATA_ROOT = path.join(ROOT_DIR, "assets", "worlds", "world_01");
const WORLD_LAYOUT_PATH = path.join(WORLD_DATA_ROOT, "world-layout.json");
const WORLD_REGIONS_DIR = path.join(WORLD_DATA_ROOT, "regions");
const WORLD_THUMBNAILS_DIR = path.join(WORLD_DATA_ROOT, "thumbnails");
const WORLD_MAPS_DIR = path.join(WORLD_DATA_ROOT, "maps");
const MAP_EDITOR_DATA_PATH = path.join(ROOT_DIR, "assets", "map-editor-data.js");
const SERVER_WORLD_LAYOUT_PATH = path.join(ROOT_DIR, "functions", "world-layout.json");
const QA_SEED_PATH = path.join(ROOT_DIR, "tools", "crownlands-studio", "qa-seed.json");
const QA_STORE_PATH = path.join(ROOT_DIR, ".crownlands-studio", "qa-issues.json");
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
const DEFAULT_STRONGHOLD_VISUAL_SIZE = 154;
const DEFAULT_CAMP_VISUAL_SIZE = 132;
const CROWN_CITADEL_VISUAL_SIZE = 260;
const EDITOR_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "form-action 'self'",
].join("; ");
const PROJECT_FILES = createProjectFileService(ROOT_DIR, {
  readExact: [
    "world-config.js",
    "economy-config.js",
    "functions/economy-config.json",
    "functions/world-layout.json",
    "ui-layout-config.js",
    "ui-studio-config.json",
    "index.html",
    "styles.css",
    "interface-theme.css",
    "game.js",
    "assets/map-editor-data.js",
    "assets/worlds/world_01/world-layout.json",
    "tools/crownlands-studio/qa-seed.json",
    ".crownlands-studio/qa-issues.json",
  ],
  writeExact: [
    "world-config.js",
    "economy-config.js",
    "functions/economy-config.json",
    "functions/world-layout.json",
    "ui-layout-config.js",
    "ui-studio-config.json",
    "assets/map-editor-data.js",
    "assets/worlds/world_01/world-layout.json",
    ".crownlands-studio/qa-issues.json",
  ],
  readPrefixes: [
    "assets/worlds/world_01/regions",
    "assets/worlds/world_01/maps",
  ],
  writePrefixes: [
    "assets/worlds/world_01/regions",
    "assets/worlds/world_01/maps",
  ],
});
const UI_EDITOR = createUiEditorService(PROJECT_FILES);
const ROOT_STATIC_FILES = new Set([
  "/about.html",
  "/game-rules.html",
  "/how-to-play.html",
  "/privacy.html",
  "/roadmap.css",
  "/roadmap-data.js",
  "/roadmap.html",
  "/roadmap.js",
  "/robots.txt",
  "/sitemap.xml",
  "/site-info.css",
  "/support.html",
  "/animation-manager.js",
  "/audio-manager.js",
  "/firebaseClient.js",
  "/game.js",
  "/instant-economy-actions.js",
  "/index.html",
  "/interface-theme.css",
  "/styles.css",
  "/world-config.js",
  "/economy-config.js",
  "/ui-layout-config.js",
  "/ui-layout-runtime.js",
  "/ui-studio-config.json",
  "/ui-component-runtime.js",
]);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"],
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
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

async function serveFile(response, filePath) {
  try {
    const stats = await fsp.stat(filePath);
    const finalPath = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const data = await fsp.readFile(finalPath);
    const headers = {
      "content-type": MIME_TYPES.get(path.extname(finalPath).toLowerCase()) || "application/octet-stream",
      "cache-control": "no-store",
    };
    const editorRelative = path.relative(EDITOR_DIR, finalPath);
    if (path.extname(finalPath).toLowerCase() === ".html" && !editorRelative.startsWith("..") && !path.isAbsolute(editorRelative)) {
      headers["content-security-policy"] = EDITOR_CONTENT_SECURITY_POLICY;
    }
    response.writeHead(200, headers);
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
  const source = await PROJECT_FILES.readText("world-config.js");
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
  await PROJECT_FILES.writeTextAtomic("world-config.js", body);
  return safe;
}

function cleanRewardSchedule(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source.slice(0, 12).map(entry => ({
    minimumReward: Math.max(0, Math.floor(number(entry?.minimumReward, 0, 0, 1_000_000_000_000))),
    productionHours: number(entry?.productionHours, 1, 0.01, 720),
  }));
}

function sanitizeEconomyConfig(config = {}) {
  const fallback = DEFAULT_ECONOMY_CONFIG;
  const cleanSectionNumber = (section, key, min, max) => number(
    config?.[section]?.[key],
    fallback?.[section]?.[key],
    min,
    max
  );
  const itemIds = Object.keys(fallback.shopItems);
  const skillIds = Object.keys(fallback.skills);
  const campTypes = Object.keys(fallback.camps);
  return {
    ...fallback,
    ...config,
    schemaVersion: Math.max(1, Math.floor(number(config.schemaVersion, fallback.schemaVersion, 1, 1000))),
    updatedAt: new Date().toISOString(),
    shopItems: Object.fromEntries(itemIds.map(itemId => {
      const item = config.shopItems?.[itemId] || {};
      const itemFallback = fallback.shopItems[itemId];
      const safe = {
        cost: Math.max(0, Math.floor(number(item.cost, itemFallback.cost, 0, 1_000_000_000_000))),
        dailyPurchaseLimit: Math.max(0, Math.floor(number(item.dailyPurchaseLimit, itemFallback.dailyPurchaseLimit, 0, 100))),
      };
      if (Number.isFinite(Number(itemFallback.effectDurationMinutes))) {
        safe.effectDurationMinutes = number(item.effectDurationMinutes, itemFallback.effectDurationMinutes, 0.1, 43_200);
      }
      if (Number.isFinite(Number(itemFallback.bonusPercent))) {
        safe.bonusPercent = number(item.bonusPercent, itemFallback.bonusPercent, 0, 1000);
      }
      return [itemId, safe];
    })),
    pickups: {
      spawnIntervalMinutes: cleanSectionNumber("pickups", "spawnIntervalMinutes", 0.1, 1440),
      expireMinutes: cleanSectionNumber("pickups", "expireMinutes", 0.1, 1440),
      goldAwardProductionMinutes: cleanSectionNumber("pickups", "goldAwardProductionMinutes", 0, 1440),
      troopAwardProductionMinutes: cleanSectionNumber("pickups", "troopAwardProductionMinutes", 0, 1440),
      dailyTotalCap: Math.floor(cleanSectionNumber("pickups", "dailyTotalCap", 0, 10000)),
      dailyGoldCap: Math.floor(cleanSectionNumber("pickups", "dailyGoldCap", 0, 10000)),
      dailyTroopCap: Math.floor(cleanSectionNumber("pickups", "dailyTroopCap", 0, 10000)),
      maxActivePerPlayer: Math.floor(cleanSectionNumber("pickups", "maxActivePerPlayer", 0, 100)),
      minimumGold: Math.floor(cleanSectionNumber("pickups", "minimumGold", 0, 1_000_000_000)),
      minimumTroops: Math.floor(cleanSectionNumber("pickups", "minimumTroops", 0, 1_000_000_000)),
    },
    cityEconomy: Object.fromEntries(Object.keys(fallback.cityEconomy).map(key => [
      key,
      cleanSectionNumber("cityEconomy", key, 0, 1_000_000),
    ])),
    troopCombat: Object.fromEntries(Object.keys(fallback.troopCombat || {}).map(key => [
      key,
      cleanSectionNumber("troopCombat", key, 0, 1_000_000),
    ])),
    siegeCombat: Object.fromEntries(Object.keys(fallback.siegeCombat || {}).map(key => [
      key,
      cleanSectionNumber("siegeCombat", key, 0, 1_000_000),
    ])),
    playerCosts: Object.fromEntries(Object.keys(fallback.playerCosts).map(key => [
      key,
      Math.floor(cleanSectionNumber("playerCosts", key, 0, 1_000_000_000_000)),
    ])),
    skills: Object.fromEntries(skillIds.map(skillId => {
      const skill = config.skills?.[skillId] || {};
      const skillFallback = fallback.skills[skillId];
      return [skillId, {
        percentPerLevel: number(skill.percentPerLevel, skillFallback.percentPerLevel, 0, 100),
        maxPercent: number(skill.maxPercent, skillFallback.maxPercent, 0, 1000),
      }];
    })),
    levelRewards: Object.fromEntries(Object.keys(fallback.levelRewards).map(key => [
      key,
      cleanSectionNumber("levelRewards", key, 0, 1000),
    ])),
    camps: Object.fromEntries(campTypes.map(campType => {
      const camp = config.camps?.[campType] || {};
      const campFallback = fallback.camps[campType];
      const safe = {
        holdMinutes: number(camp.holdMinutes, campFallback.holdMinutes, 0.1, 10080),
        baseDefenders: 20_000,
      };
      if (Array.isArray(campFallback.rewardSchedule)) {
        safe.rewardSchedule = cleanRewardSchedule(camp.rewardSchedule, campFallback.rewardSchedule);
      }
      if (Number.isFinite(Number(campFallback.maxDailyRewards))) {
        safe.maxDailyRewards = Math.max(0, Math.floor(number(camp.maxDailyRewards, campFallback.maxDailyRewards, 0, 100)));
      }
      return [campType, safe];
    })),
  };
}

async function readEconomyConfig() {
  return sanitizeEconomyConfig(await readJsonFile(SERVER_ECONOMY_CONFIG_PATH, DEFAULT_ECONOMY_CONFIG));
}

async function writeEconomyConfig(config) {
  const safe = sanitizeEconomyConfig(config);
  const browserBody = `window.CROWNLANDS_ECONOMY_CONFIG = ${JSON.stringify(safe, null, 2)};\n`;
  await PROJECT_FILES.writeJsonAtomic("functions/economy-config.json", safe);
  await PROJECT_FILES.writeTextAtomic("economy-config.js", browserBody);
  return safe;
}

const UI_LAYOUT_PRESETS = {
  landscapeTablet: { label: "Landscape / Tablet", width: 844, height: 390 },
  desktop: { label: "Desktop", width: 1440, height: 900 },
};
const UI_LAYOUT_COMPONENT_IDS = new Set([
  "profile", "fullscreen", "inventory", "shop", "activeEffects", "cityList",
  "islandSwitch", "returnHome", "commanderPanel", "outgoingMarch",
  "incomingMarch", "reportsNav",
]);
const UI_LAYOUT_ANCHORS = new Set([
  "topLeft", "topCenter", "topRight", "centerLeft", "center", "centerRight",
  "bottomLeft", "bottomCenter", "bottomRight",
]);

function sanitizeUiLayoutConfig(config = {}) {
  if (Number(config.schemaVersion) !== 1) {
    throw new Error("HUD layout schemaVersion must be 1.");
  }
  const incomingPresets = config.presets;
  if (!incomingPresets || typeof incomingPresets !== "object" || Array.isArray(incomingPresets)) {
    throw new Error("HUD layout presets must be an object.");
  }
  const presets = {};
  for (const [presetId, defaults] of Object.entries(UI_LAYOUT_PRESETS)) {
    const source = incomingPresets[presetId] || {};
    const sourceComponents = source.components || {};
    if (typeof sourceComponents !== "object" || Array.isArray(sourceComponents)) {
      throw new Error(`${presetId} components must be an object.`);
    }
    const unknown = Object.keys(sourceComponents).find(id => !UI_LAYOUT_COMPONENT_IDS.has(id));
    if (unknown) throw new Error(`Unsupported HUD component: ${unknown}.`);
    const components = {};
    for (const [id, raw] of Object.entries(sourceComponents)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`${id} layout must be an object.`);
      }
      const anchor = String(raw.anchor || "topLeft");
      if (!UI_LAYOUT_ANCHORS.has(anchor)) throw new Error(`Unsupported anchor for ${id}: ${anchor}.`);
      components[id] = {
        anchor,
        offsetX: Math.round(number(raw.offsetX, 0, -defaults.width * 2, defaults.width * 2)),
        offsetY: Math.round(number(raw.offsetY, 0, -defaults.height * 2, defaults.height * 2)),
        width: Math.round(number(raw.width, 48, 24, defaults.width)),
        height: Math.round(number(raw.height, 48, 24, defaults.height)),
        visible: raw.visible !== false,
        zIndex: Math.round(number(raw.zIndex, 20, 0, 999)),
      };
    }
    presets[presetId] = { ...defaults, components };
  }
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), presets };
}

async function readUiLayoutConfig() {
  const source = await PROJECT_FILES.readText("ui-layout-config.js");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "ui-layout-config.js", timeout: 1000 });
  return sanitizeUiLayoutConfig(context.window.CROWNLANDS_UI_LAYOUT_CONFIG || {});
}

async function writeUiLayoutConfig(config) {
  const safe = sanitizeUiLayoutConfig(config);
  const body = `window.CROWNLANDS_UI_LAYOUT_CONFIG = ${JSON.stringify(safe, null, 2)};\n`;
  await PROJECT_FILES.writeTextAtomic("ui-layout-config.js", body);
  return safe;
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await PROJECT_FILES.readText(PROJECT_FILES.relativeFromAbsolute(filePath)));
  } catch (error) {
    if (error.code === "ENOENT" || error.cause?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizePathForJson(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function browserAssetPath(value) {
  const normalized = normalizePathForJson(value);
  return OPTIMIZED_ASSET_PATHS.get(normalized.split("?")[0]) || normalized;
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
  await PROJECT_FILES.removeFile(PROJECT_FILES.relativeFromAbsolute(previous.filePath));
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
  const filePath = path.join(WORLD_MAPS_DIR, fileName);
  await PROJECT_FILES.writeAtomic(publicMapImagePath(fileName), buffer, { backup: false });
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
    thumbnailPath: normalizePathForJson(region.thumbnailPath || region.thumbnailSrc),
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
  const id = cleanId(city.id, `${region.id}_city_${String(index + 1).padStart(3, "0")}`);
  return {
    id,
    name: cleanString(getCanonicalLayoutCityName({ ...city, id }, region.id, index), "Alderwatch"),
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
    flipX: Boolean(stronghold.flipX),
    notes: cleanString(stronghold.notes, "").slice(0, 240),
  };
}

function cleanCamp(camp, index, region) {
  const type = cleanCampType(camp.campType || camp.type);
  const defaults = getCampDefaults(type);
  const xNorm = cleanNorm(camp.xNorm ?? (Number(camp.x) / Math.max(1, Number(region.width) || 1)), 0.5);
  const yNorm = cleanNorm(camp.yNorm ?? (Number(camp.y) / Math.max(1, Number(region.height) || 1)), 0.5);
  const cleaned = {
    id: cleanId(camp.id, `${region.id}_${type}_camp_${index + 1}`),
    name: cleanString(camp.name, defaults.name),
    regionId: region.id,
    xNorm,
    yNorm,
    campType: type,
    artSrc: normalizePathForJson(camp.artSrc || defaults.artSrc),
    size: cleanVisualSize(camp.size, defaults.size),
    flipX: Boolean(camp.flipX),
    notes: cleanString(camp.notes, "").slice(0, 240),
  };
  if (type === "gold" || type === "troops") {
    const defaults = DEFAULT_ECONOMY_CONFIG.camps[type].rewardSchedule;
    cleaned.rewardSchedule = cleanRewardSchedule(camp.rewardSchedule, defaults);
  }
  if (type === "items") {
    cleaned.maxDailyRewards = Math.max(0, Math.floor(number(
      camp.maxDailyRewards,
      DEFAULT_ECONOMY_CONFIG.camps.items.maxDailyRewards,
      0,
      100
    )));
  }
  return cleaned;
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
    updatedAt: (() => {
      const parsed = Date.parse(String(rawLayout.updatedAt || ""));
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
    })(),
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
  if (!Array.isArray(layout.regions) || !layout.regions.length) {
    const regionFiles = await fsp.readdir(WORLD_REGIONS_DIR, { withFileTypes: true }).catch(() => []);
    const recoveredRegions = [];
    for (const entry of regionFiles) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue;
      const region = await readJsonFile(path.join(WORLD_REGIONS_DIR, entry.name), null);
      if (!region?.id) continue;
      const thumbnailFileName = `${cleanId(region.id, "region")}-thumb.webp`;
      if (await fileExists(path.join(WORLD_THUMBNAILS_DIR, thumbnailFileName))) {
        region.thumbnailPath = normalizePathForJson(
          path.posix.join("assets", "worlds", "world_01", "thumbnails", thumbnailFileName)
        );
      }
      recoveredRegions.push(region);
    }
    recoveredRegions.sort((left, right) => (
      number(left.gridY, 0) - number(right.gridY, 0)
      || number(left.gridX, 0) - number(right.gridX, 0)
      || String(left.id).localeCompare(String(right.id))
    ));
    if (recoveredRegions.length) return normalizeWorldBundle({ layout, regions: recoveredRegions });
    return buildWorldDataFromMapEditorData();
  }
  const regions = [];
  for (const summary of Array.isArray(layout.regions) ? layout.regions : []) {
    const filePath = regionFilePath(summary.id);
    const region = await readJsonFile(filePath, null);
    const merged = region ? { ...summary, ...region } : { ...summary };
    if (!merged.thumbnailPath && !merged.thumbnailSrc) {
      const thumbnailFileName = `${cleanId(merged.id, "region")}-thumb.webp`;
      const thumbnailFilePath = path.join(WORLD_THUMBNAILS_DIR, thumbnailFileName);
      if (await fileExists(thumbnailFilePath)) {
        merged.thumbnailPath = normalizePathForJson(
          path.posix.join("assets", "worlds", "world_01", "thumbnails", thumbnailFileName)
        );
      }
    }
    regions.push(merged);
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
      thumbnailPath: normalizePathForJson(map.thumbnailSrc),
      compatRegion: map.region || null,
      cities: (Array.isArray(map.cities) ? map.cities : []).map((city, cityIndex) => ({
        id: city.id || `${id}_city_${String(cityIndex + 1).padStart(3, "0")}`,
        name: getCanonicalLayoutCityName({
          ...city,
          id: city.id || `${id}_city_${String(cityIndex + 1).padStart(3, "0")}`,
        }, id, cityIndex),
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
        flipX: Boolean(objective.flipX),
      })),
      camps: (Array.isArray(map.camps) ? map.camps : []).map((camp, campIndex) => ({
        id: camp.id || `${id}_${cleanCampType(camp.campType || camp.type)}_camp_${campIndex + 1}`,
        name: camp.name,
        xNorm: cleanNorm(camp.xNorm ?? ((Number(camp.x) || 0) / sourceWidth), 0.5),
        yNorm: cleanNorm(camp.yNorm ?? ((Number(camp.y) || 0) / sourceHeight), 0.5),
        campType: cleanCampType(camp.campType || camp.type),
        artSrc: camp.artSrc,
        size: camp.size,
        flipX: Boolean(camp.flipX),
        notes: camp.notes,
        rewardSchedule: camp.rewardSchedule,
        maxDailyRewards: camp.maxDailyRewards,
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
  const updatedAt = (() => {
    const parsed = Date.parse(String(layout.updatedAt || ""));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "1970-01-01T00:00:00.000Z";
  })();
  const catalog = buildRegionCatalog(layout, regions);
  const catalogById = new Map(catalog.regions.map(region => [region.id, region]));
  return {
    version: Number(updatedAt.replace(/\D/g, "").slice(0, 12)),
    updatedAt,
    worldId: layout.worldId,
    worldName: layout.worldName,
    globalSettings: layout.globalSettings || {},
    maps: regions.map(region => ({
      ...catalogById.get(region.id),
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
          artSrc: browserAssetPath(stronghold.artSrc),
          size: stronghold.size,
          flipX: Boolean(stronghold.flipX),
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
        artSrc: browserAssetPath(camp.artSrc),
        size: camp.size,
        flipX: Boolean(camp.flipX),
        notes: camp.notes,
        rewardSchedule: camp.rewardSchedule,
        maxDailyRewards: camp.maxDailyRewards,
      })),
      edgeConnections: region.edgeConnections,
    })),
  };
}

async function writeWorldData(payload) {
  const bundle = normalizeWorldBundle(payload);
  const normalizedRegions = bundle.regions.map(normalizeRegionDocument);
  const layout = {
    ...bundle.layout,
    regions: normalizedRegions.map(cleanWorldRegionSummary),
    updatedAt: new Date().toISOString(),
  };
  for (const region of normalizedRegions) {
    await PROJECT_FILES.writeJsonAtomic(publicRegionPath(region.id), region);
  }
  await PROJECT_FILES.writeJsonAtomic("assets/worlds/world_01/world-layout.json", layout);
  const compatibilityData = buildCompatibilityMapData(layout, normalizedRegions);
  await PROJECT_FILES.writeTextAtomic("assets/map-editor-data.js", `window.CROWNLANDS_MAP_EDITOR_DATA = ${JSON.stringify(compatibilityData, null, 2)};\n`);
  await PROJECT_FILES.writeJsonAtomic("functions/world-layout.json", compatibilityData);
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

const QA_STATUSES = new Set(["Open", "In Progress", "Fixed", "Verified", "Ignored", "Won't Fix"]);
const QA_SEVERITIES = new Set(["Low", "Medium", "High", "Critical"]);
const QA_CATEGORIES = new Set(["Visual", "Layout", "Component", "Gameplay / Functional Bug", "Performance"]);

function sanitizeQaStore(value = {}) {
  if (Number(value.schemaVersion || 1) !== 1) throw new Error("QA store schemaVersion must be 1.");
  const sourceIssues = Array.isArray(value.issues) ? value.issues : [];
  const seenIds = new Set();
  const issues = sourceIssues.slice(0, 1000).map((raw, index) => {
    const fallbackId = `qa-issue-${index + 1}`;
    let id = cleanId(raw?.id, fallbackId).slice(0, 100);
    while (seenIds.has(id)) id = `${id}-${index + 1}`;
    seenIds.add(id);
    const categories = (Array.isArray(raw?.categories) ? raw.categories : [raw?.category])
      .map(category => cleanString(category, ""))
      .filter(category => QA_CATEGORIES.has(category));
    return {
      id,
      title: cleanString(raw?.title, `QA issue ${index + 1}`).slice(0, 160),
      categories: categories.length ? [...new Set(categories)] : ["Visual"],
      affected: cleanString(raw?.affected, "Unspecified").slice(0, 180),
      component: cleanString(raw?.component, "").slice(0, 160),
      description: String(raw?.description || "").trim().slice(0, 5000),
      expected: String(raw?.expected || "").trim().slice(0, 3000),
      severity: QA_SEVERITIES.has(raw?.severity) ? raw.severity : "Medium",
      status: QA_STATUSES.has(raw?.status) ? raw.status : "Open",
      notes: String(raw?.notes || "").trim().slice(0, 10000),
      relevantFiles: (Array.isArray(raw?.relevantFiles) ? raw.relevantFiles : [])
        .map(file => normalizePathForJson(file).slice(0, 240))
        .filter(Boolean)
        .slice(0, 40),
      createdAt: String(raw?.createdAt || new Date().toISOString()),
      updatedAt: String(raw?.updatedAt || new Date().toISOString()),
    };
  });
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), issues };
}

async function readQaStore() {
  const local = await readJsonFile(QA_STORE_PATH, null);
  if (local) return sanitizeQaStore(local);
  return sanitizeQaStore(await readJsonFile(QA_SEED_PATH, { schemaVersion: 1, issues: [] }));
}

async function writeQaStore(value) {
  const safe = sanitizeQaStore(value);
  await PROJECT_FILES.writeJsonAtomic(".crownlands-studio/qa-issues.json", safe);
  return safe;
}

async function readStudioContext() {
  let branch = "";
  try {
    const result = await execFileAsync("git", ["-C", ROOT_DIR, "branch", "--show-current"], {
      windowsHide: true,
      timeout: 3000,
    });
    branch = String(result.stdout || "").trim();
  } catch {
    branch = "";
  }
  return {
    projectName: path.basename(ROOT_DIR),
    projectRoot: ROOT_DIR,
    branch,
    desktop: process.env.CROWNLANDS_STUDIO_DESKTOP === "1",
  };
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/studio-context" && request.method === "GET") {
    sendJson(response, 200, await readStudioContext());
    return;
  }

  if (pathname === "/api/ui-editor" && request.method === "GET") {
    sendJson(response, 200, await UI_EDITOR.getWorkspace());
    return;
  }

  if (pathname === "/api/ui-editor/audit" && request.method === "GET") {
    sendJson(response, 200, await UI_EDITOR.audit());
    return;
  }

  if (pathname === "/api/ui-editor/validate" && request.method === "POST") {
    const rawBody = await readBody(request);
    sendJson(response, 200, UI_EDITOR.validate(JSON.parse(rawBody || "{}")));
    return;
  }

  if (pathname === "/api/ui-editor/save" && request.method === "POST") {
    const rawBody = await readBody(request);
    sendJson(response, 200, await UI_EDITOR.save(JSON.parse(rawBody || "{}")));
    return;
  }

  if (pathname === "/api/qa-issues" && request.method === "GET") {
    sendJson(response, 200, await readQaStore());
    return;
  }

  if (pathname === "/api/qa-issues" && request.method === "POST") {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    sendJson(response, 200, await writeQaStore(payload));
    return;
  }

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

  if (pathname === "/api/economy-data" && request.method === "GET") {
    const config = await readEconomyConfig();
    sendJson(response, 200, {
      config,
      paths: {
        browser: ECONOMY_CONFIG_PATH,
        server: SERVER_ECONOMY_CONFIG_PATH,
      },
    });
    return;
  }

  if (pathname === "/api/economy-data" && request.method === "POST") {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const config = await writeEconomyConfig(payload.config || payload);
    sendJson(response, 200, {
      ok: true,
      config,
      paths: {
        browser: ECONOMY_CONFIG_PATH,
        server: SERVER_ECONOMY_CONFIG_PATH,
      },
    });
    return;
  }

  if (pathname === "/api/ui-layout-data" && request.method === "GET") {
    const config = await readUiLayoutConfig();
    sendJson(response, 200, { config, path: UI_LAYOUT_CONFIG_PATH });
    return;
  }

  if (pathname === "/api/ui-layout-data" && request.method === "POST") {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const config = await writeUiLayoutConfig(payload.config || payload);
    sendJson(response, 200, { ok: true, config, path: UI_LAYOUT_CONFIG_PATH });
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

      if (pathname.startsWith("/assets/") || pathname.startsWith("/audio/") || ROOT_STATIC_FILES.has(pathname)) {
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
    console.log(`Crownlands Game Editor running at http://${HOST}:${port}/editor/`);
    console.log(`Game preview running at http://${HOST}:${port}/game/`);
  });
}

if (require.main === module) {
  listenWithFallback(createServer(), START_PORT);
}

module.exports = {
  buildCompatibilityMapData,
  createServer,
  handleApi,
  readWorldData,
  readQaStore,
  sanitizeQaStore,
};
