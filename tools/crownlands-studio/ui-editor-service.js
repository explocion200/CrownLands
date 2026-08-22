"use strict";

const UI_CONFIG_PATH = "ui-studio-config.json";
const BREAKPOINTS = new Set(["base", "desktop", "phone", "smallPhone"]);
const ANCHORS = new Set(["top-right", "top-left", "bottom-right", "bottom-left"]);
const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
const SAFE_SHADOW = /^[^;{}]{0,140}$/;

const THEME_COLORS = Object.freeze([
  { id: "parchment", label: "Parchment", value: "#D6C6A2", token: "--cl-parchment" },
  { id: "ivory", label: "Ivory", value: "#E7DDC4", token: "--cl-ivory" },
  { id: "light-brown", label: "Light Brown", value: "#B9A47A", token: "--cl-aged-parchment" },
  { id: "dark-brown", label: "Dark Walnut", value: "#34241B", token: "--cl-ink" },
  { id: "navy", label: "Navy", value: "#2D2B25", token: "--cl-iron-dark" },
  { id: "medieval-blue", label: "Medieval Blue", value: "#485869", token: "--cl-faded-indigo" },
  { id: "alert-red", label: "Alert Red", value: "#88482C", token: "--cl-rust" },
  { id: "clan-green", label: "Clan Green", value: "#55613D", token: "--cl-moss" },
  { id: "gold", label: "Gold", value: "#B48A3A", token: "--cl-royal-gold" },
  { id: "burgundy", label: "Burgundy", value: "#6E2F35", token: "--cl-burgundy" },
]);

const SCREENS = Object.freeze([
  ["player-profile", "Player Profile", true], ["clan-members", "Clan · Members", true], ["reports", "Reports", false],
  ["scout-report", "Scout Report", false], ["daily-login", "Daily Login", false], ["daily-missions", "Daily Missions", false],
  ["achievements", "Achievements", false], ["settings", "Settings", true], ["notifications", "Notifications", false],
  ["privacy", "Privacy", false], ["shop", "Shop", false], ["bag", "Bag", false], ["commander-panel", "Commander Panel", false],
].map(([id, name, noScrollExpected]) => ({ id, name, noScrollExpected })));

const COMPONENTS = Object.freeze([
  ["close-button", "Close Button", ["default", "hover", "pressed", "disabled"]],
  ["primary-button", "Primary Button", ["default", "hover", "pressed", "disabled"]],
  ["secondary-button", "Secondary Button", ["default", "hover", "pressed", "disabled"]],
  ["destructive-button", "Destructive Button", ["default", "hover", "pressed", "disabled"]],
  ["alert-button", "Alert Button", ["default", "hover", "pressed", "disabled"]],
  ["action-button", "Action Button", ["default", "hover", "pressed", "disabled"]],
  ["tab", "Tab", ["default", "selected", "hover"]],
  ["selected-tab", "Selected Tab", ["selected", "hover"]],
  ["modal-frame", "Modal Frame", ["default"]], ["panel-header", "Panel Header", ["default"]],
  ["text-input", "Text Input", ["default", "disabled"]], ["claim-button", "Claim Button", ["default", "hover", "disabled"]],
  ["progress-bar", "Progress Bar", ["default"]], ["badge", "Badge", ["default", "alert"]],
  ["icon-button", "Icon Button", ["default", "hover", "pressed", "disabled"]],
].map(([id, name, states]) => ({ id, name, states })));

const CLOSE_USAGES = Object.freeze([
  { id: "commander-panel-close", screenId: "commander-panel", screen: "Commander Panel", selector: "#clearSelectBtn", source: "index.html", localSource: "styles.css", standard: true, handler: "clearSelectBtn click handler" },
  { id: "player-profile-close", screenId: "player-profile", screen: "Player Profile / Clan / Settings", selector: "#profileCloseBtn", source: "index.html", localSource: "styles.css", standard: true, handler: "closeProfileScreen" },
  { id: "shared-modal-close", screenId: "shared-modal", screen: "Shared Modal (Reports, Scout Report, Daily Login, Daily Missions, Achievements, Shop, Bag)", selector: "#closeModalBtn", source: "index.html", localSource: "styles.css", standard: true, handler: "modal.close" },
  { id: "inner-castle-close", screenId: "inner-castle", screen: "Inner Castle", selector: ".inner-castle-modal .modal-close", source: "index.html", localSource: "styles.css:9844", standard: true, localOverride: true, handler: "modal.close" },
]);

const REGISTRY = Object.freeze({
  schemaVersion: 1,
  themeColors: THEME_COLORS,
  screens: SCREENS,
  components: COMPONENTS.map(component => component.id === "close-button" ? { ...component, usages: CLOSE_USAGES } : component),
  closeButton: {
    source: "ui-studio-config.json",
    runtime: "ui-component-runtime.js",
    sharedSelector: ".cl-shared-close",
    usages: CLOSE_USAGES,
    implementationCount: 4,
    migratedCount: 4,
  },
});

const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: 1,
  globalComponents: {
    "close-button": {
      version: 1,
      states: {
        default: { width: 40, height: 40, backgroundColor: "#2B2925", borderColor: "#45443E", borderWidth: 1, borderRadius: 3, iconColor: "#E7DDC4", iconSize: 16, iconStrokeWidth: 3, opacity: 1, shadow: "0 6px 14px rgba(0, 0, 0, .30)", padding: 0, defaultTop: 10, defaultRight: 11 },
        hover: { backgroundColor: "#59534A", iconColor: "#E7DDC4" },
        pressed: { backgroundColor: "#17130F", iconColor: "#D6C6A2" },
        disabled: { opacity: .5 },
      },
      responsive: {},
    },
  },
  screenOverrides: {},
  elementOverrides: {},
  sharedMigrations: {},
  noScrollScreens: ["player-profile", "clan-members", "settings"],
});

const clone = value => JSON.parse(JSON.stringify(value));
const number = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const safeColor = (value, fallback) => SAFE_COLOR.test(String(value || "").trim()) ? String(value).trim().toUpperCase() : fallback;

function sanitizeCloseState(raw = {}, fallback = {}, state = "default") {
  const result = {};
  if (state === "default") {
    result.width = number(raw.width, fallback.width, 24, 72);
    result.height = number(raw.height, fallback.height, 24, 72);
    result.borderColor = safeColor(raw.borderColor, fallback.borderColor);
    result.borderWidth = number(raw.borderWidth, fallback.borderWidth, 0, 6);
    result.borderRadius = number(raw.borderRadius, fallback.borderRadius, 0, 999);
    result.iconSize = number(raw.iconSize, fallback.iconSize, 8, 40);
    result.iconStrokeWidth = number(raw.iconStrokeWidth, fallback.iconStrokeWidth, 1, 6);
    result.shadow = SAFE_SHADOW.test(String(raw.shadow ?? fallback.shadow)) ? String(raw.shadow ?? fallback.shadow) : fallback.shadow;
    result.padding = number(raw.padding, fallback.padding, 0, 20);
    result.defaultTop = number(raw.defaultTop, fallback.defaultTop, -64, 128);
    result.defaultRight = number(raw.defaultRight, fallback.defaultRight, -64, 128);
  }
  if (["default", "hover", "pressed"].includes(state)) {
    result.backgroundColor = safeColor(raw.backgroundColor, fallback.backgroundColor);
    result.iconColor = safeColor(raw.iconColor, fallback.iconColor);
  }
  if (["default", "disabled"].includes(state)) result.opacity = number(raw.opacity, fallback.opacity, .1, 1);
  return result;
}

function sanitizePosition(raw = {}) {
  return {
    anchor: ANCHORS.has(raw.anchor) ? raw.anchor : "top-right",
    top: number(raw.top, 0, -128, 512),
    right: number(raw.right, 0, -128, 512),
    bottom: number(raw.bottom, 0, -128, 512),
    left: number(raw.left, 0, -128, 512),
    x: number(raw.x, 0, -1000, 1000),
    y: number(raw.y, 0, -1000, 1000),
  };
}

const GENERIC_RANGES = Object.freeze({
  opacity: [.1, 1], fontSize: [8, 96], fontWeight: [100, 900], lineHeight: [.5, 4], letterSpacing: [-10, 30],
  borderWidth: [0, 16], borderRadius: [0, 999], width: [0, 2400], height: [0, 2400], minWidth: [0, 2400], maxWidth: [0, 2400], minHeight: [0, 2400], maxHeight: [0, 2400],
  paddingTop: [0, 300], paddingRight: [0, 300], paddingBottom: [0, 300], paddingLeft: [0, 300], marginTop: [-300, 300], marginRight: [-300, 300], marginBottom: [-300, 300], marginLeft: [-300, 300], gap: [0, 300],
  top: [-1200, 1200], right: [-1200, 1200], bottom: [-1200, 1200], left: [-1200, 1200], x: [-1200, 1200], y: [-1200, 1200], iconSize: [4, 512],
});

function sanitizeGenericProperties(raw = {}) {
  const result = {};
  for (const property of ["color", "backgroundColor", "borderColor"]) if (raw[property] != null) result[property] = safeColor(raw[property], "#000000");
  for (const [property, [min, max]] of Object.entries(GENERIC_RANGES)) if (raw[property] != null) result[property] = number(raw[property], 0, min, max);
  if (["left", "center", "right", "justify"].includes(raw.textAlign)) result.textAlign = raw.textAlign;
  if (["relative", "absolute", "static"].includes(raw.position)) result.position = raw.position;
  if (["solid", "dashed", "dotted", "double", "none"].includes(raw.borderStyle)) result.borderStyle = raw.borderStyle;
  if (raw.textShadow != null && SAFE_SHADOW.test(String(raw.textShadow))) result.textShadow = String(raw.textShadow);
  return result;
}

function sanitizeUiConfig(raw = {}) {
  if (Number(raw.schemaVersion || 1) !== 1) throw new Error("UI Studio config schemaVersion must be 1.");
  const defaults = DEFAULT_CONFIG.globalComponents["close-button"];
  const close = raw.globalComponents?.["close-button"] || {};
  const states = {};
  for (const state of ["default", "hover", "pressed", "disabled"]) states[state] = sanitizeCloseState(close.states?.[state] || {}, defaults.states[state], state);
  const responsive = {};
  for (const breakpoint of ["desktop", "phone", "smallPhone"]) {
    if (close.responsive?.[breakpoint]) responsive[breakpoint] = sanitizeCloseState(close.responsive[breakpoint], states.default, "default");
  }
  const validScreenIds = new Set([...SCREENS.map(screen => screen.id), "shared-modal", "inner-castle"]);
  const screenOverrides = {};
  for (const [screenId, components] of Object.entries(raw.screenOverrides || {}).slice(0, 100)) {
    if (!validScreenIds.has(screenId) || !components?.["close-button"]) continue;
    screenOverrides[screenId] = { "close-button": sanitizePosition(components["close-button"]) };
  }
  const elementOverrides = {};
  for (const [key, record] of Object.entries(raw.elementOverrides || {}).slice(0, 500)) {
    if (!/^[a-z0-9:_-]{1,180}$/i.test(key) || !validScreenIds.has(record?.screenId) || !/^[a-z0-9:_-]{1,100}$/i.test(record?.elementId || "")) continue;
    const safe = { screenId: record.screenId, elementId: record.elementId };
    for (const breakpoint of BREAKPOINTS) if (record[breakpoint]) safe[breakpoint] = sanitizeGenericProperties(record[breakpoint]);
    elementOverrides[key] = safe;
  }
  const sharedMigrations = {};
  for (const usage of CLOSE_USAGES) sharedMigrations[usage.id] = Boolean(raw.sharedMigrations?.[usage.id] ?? usage.standard);
  const noScrollScreens = [...new Set((Array.isArray(raw.noScrollScreens) ? raw.noScrollScreens : []).filter(id => validScreenIds.has(id)))].slice(0, 50);
  return { schemaVersion: 1, globalComponents: { "close-button": { version: Math.max(1, Math.floor(number(close.version, 1, 1, 9999))), states, responsive } }, screenOverrides, elementOverrides, sharedMigrations, noScrollScreens };
}

function luminance(hex) {
  const source = String(hex || "").replace("#", "");
  if (![3, 6].includes(source.length)) return null;
  const full = source.length === 3 ? [...source].map(value => value + value).join("") : source;
  const channels = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  if (first == null || second == null) return null;
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

function validateUiConfig(raw) {
  const config = sanitizeUiConfig(raw);
  const close = config.globalComponents["close-button"].states.default;
  const ratio = contrastRatio(close.iconColor, close.backgroundColor);
  const warnings = [];
  const errors = [];
  if (ratio != null && ratio < 3) warnings.push({ code: "close-icon-contrast", message: `Close Button icon contrast is ${ratio.toFixed(2)}:1; 3:1 or higher is recommended.`, componentId: "close-button" });
  for (const [screenId, components] of Object.entries(config.screenOverrides)) {
    const position = components["close-button"];
    if (Math.abs(position.x) > 96 || Math.abs(position.y) > 96) warnings.push({ code: "close-position-offset", message: `${screenId} has a large Close Button offset.`, screenId, componentId: "close-button" });
  }
  if (!CLOSE_USAGES.every(usage => usage.source && usage.localSource)) errors.push({ code: "source-map", message: "A Close Button usage is missing source mapping." });
  return { ok: errors.length === 0, checkedAt: new Date().toISOString(), contrast: { closeButton: ratio == null ? null : Number(ratio.toFixed(2)), status: ratio == null || ratio < 3 ? "warning" : "passed" }, errors, warnings, checks: ["schema", "shared component registry", "source mapping", "close-button contrast", "local override bounds", "responsive overrides"] };
}

function createUiEditorService(projectFiles) {
  if (!projectFiles) throw new Error("UI editor service requires the protected project file service.");
  async function read() {
    const stored = await projectFiles.readJson(UI_CONFIG_PATH, clone(DEFAULT_CONFIG));
    return sanitizeUiConfig(stored);
  }
  async function audit() {
    const [indexSource, stylesSource, gameSource] = await Promise.all([projectFiles.readText("index.html"), projectFiles.readText("styles.css"), projectFiles.readText("game.js")]);
    const findings = [];
    for (const usage of CLOSE_USAGES) {
      const id = usage.selector.startsWith("#") ? usage.selector.slice(1) : "closeModalBtn";
      if (!indexSource.includes(`id="${id}"`) && id !== "closeModalBtn") findings.push({ severity: "High", kind: "missing", usageId: usage.id, screenId: usage.screenId, message: `${usage.screen} Close Button markup was not found.` });
    }
    if (!/id="closeModalBtn"[^>]+cl-shared-close/.test(indexSource)) findings.push({ severity: "Medium", kind: "legacy", usageId: "shared-modal-close", screenId: "shared-modal", message: "Shared modal close control is not marked as the shared Close Button component." });
    if (!/id="profileCloseBtn"[^>]+cl-shared-close/.test(indexSource)) findings.push({ severity: "Medium", kind: "legacy", usageId: "player-profile-close", screenId: "player-profile", message: "Profile Close Button is not marked as shared." });
    if (!/id="clearSelectBtn"[^>]+cl-shared-close/.test(indexSource)) findings.push({ severity: "Medium", kind: "legacy", usageId: "commander-panel-close", screenId: "commander-panel", message: "Commander Panel Close Button is not marked as shared." });
    if (/\.inner-castle-modal\s+\.modal-close\s*\{[\s\S]{0,220}?width:\s*44px/.test(stylesSource)) findings.push({ severity: "Low", kind: "local-override", usageId: "inner-castle-close", screenId: "inner-castle", message: "Inner Castle has a legacy 44px local size override; keep only its position override after visual review." });
    for (const expected of ["profileCloseBtn", "closeModalBtn", "clearSelectBtn"]) if (!gameSource.includes(expected)) findings.push({ severity: "High", kind: "handler", message: `${expected} is not referenced by the game runtime.` });
    return { checkedAt: new Date().toISOString(), implementations: REGISTRY.closeButton.implementationCount, migrated: REGISTRY.closeButton.migratedCount, usages: CLOSE_USAGES, findings };
  }
  async function getWorkspace() {
    const [config, closeAudit] = await Promise.all([read(), audit()]);
    return { schemaVersion: 1, config, defaults: clone(DEFAULT_CONFIG), registry: REGISTRY, audit: closeAudit, validation: validateUiConfig(config) };
  }
  async function save(raw) {
    const config = sanitizeUiConfig(raw);
    const validation = validateUiConfig(config);
    if (!validation.ok) throw new Error(`UI configuration did not pass validation: ${validation.errors.map(error => error.message).join(" ")}`);
    config.globalComponents["close-button"].version += 1;
    const write = await projectFiles.writeJsonAtomic(UI_CONFIG_PATH, config);
    return { config, validation: validateUiConfig(config), changedFiles: [UI_CONFIG_PATH], backupPath: write.backupPath };
  }
  return Object.freeze({ read, audit, getWorkspace, validate: validateUiConfig, save });
}

module.exports = { COMPONENTS, DEFAULT_CONFIG, REGISTRY, THEME_COLORS, UI_CONFIG_PATH, contrastRatio, createUiEditorService, sanitizeUiConfig, validateUiConfig };
