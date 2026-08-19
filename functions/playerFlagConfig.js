(function initializeCrownlandsPlayerFlags(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.CrownlandsPlayerFlags = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCrownlandsPlayerFlags() {
  "use strict";

  const LEGACY_VERSION = 1;
  const CURRENT_VERSION = 2;
  const SUPPORTED_VERSIONS = Object.freeze([LEGACY_VERSION, CURRENT_VERSION]);

  const COLORS = Object.freeze([
    Object.freeze({ value: "#A52A2A", label: "Crimson", family: "red" }),
    Object.freeze({ value: "#6E2025", label: "Oxblood", family: "red" }),
    Object.freeze({ value: "#722F37", label: "Burgundy", family: "red" }),
    Object.freeze({ value: "#315A8A", label: "Royal Blue", family: "blue" }),
    Object.freeze({ value: "#243447", label: "Deep Navy", family: "blue" }),
    Object.freeze({ value: "#547A9A", label: "Faded Azure", family: "blue" }),
    Object.freeze({ value: "#355E3B", label: "Forest Green", family: "green" }),
    Object.freeze({ value: "#667A4A", label: "Moss Green", family: "green" }),
    Object.freeze({ value: "#4E5637", label: "Dark Olive", family: "green" }),
    Object.freeze({ value: "#C69A45", label: "Heraldic Gold", family: "gold" }),
    Object.freeze({ value: "#B58A3B", label: "Old Gold", family: "gold" }),
    Object.freeze({ value: "#B98232", label: "Ochre", family: "gold" }),
    Object.freeze({ value: "#F2E2BF", label: "Ivory", family: "light" }),
    Object.freeze({ value: "#DDD0AE", label: "Bone", family: "light" }),
    Object.freeze({ value: "#B9B4A8", label: "Silver / Light Stone", family: "light" }),
    Object.freeze({ value: "#303436", label: "Charcoal", family: "dark" }),
    Object.freeze({ value: "#4A3428", label: "Dark Brown", family: "dark" }),
    Object.freeze({ value: "#202426", label: "Blackened Iron", family: "dark" }),
    Object.freeze({ value: "#66536F", label: "Royal Purple", family: "purple" }),
    Object.freeze({ value: "#4E354F", label: "Deep Plum", family: "purple" }),
  ]);

  const PATTERNS = Object.freeze([
    Object.freeze({ key: "split", label: "Vertical Split" }),
    Object.freeze({ key: "diagonal", label: "Diagonal Split" }),
    Object.freeze({ key: "band", label: "Horizontal Band" }),
    Object.freeze({ key: "cross", label: "Cross" }),
    Object.freeze({ key: "saltire", label: "Saltire" }),
    Object.freeze({ key: "chevron", label: "Chevron" }),
    Object.freeze({ key: "quartered", label: "Quartered" }),
    Object.freeze({ key: "pale", label: "Vertical Band" }),
    Object.freeze({ key: "chief", label: "Top Band" }),
    Object.freeze({ key: "bend", label: "Diagonal Band" }),
    Object.freeze({ key: "fess", label: "Horizontal Split" }),
    Object.freeze({ key: "pile", label: "Heraldic Pile" }),
    Object.freeze({ key: "canton", label: "Corner Block" }),
    Object.freeze({ key: "invertedChevron", label: "Inverted Chevron" }),
  ]);

  const SYMBOLS = Object.freeze([
    Object.freeze({ key: "crown", label: "Crown", icon: "flag-crown" }),
    Object.freeze({ key: "lion", label: "Lion Rampant", icon: "flag-lion" }),
    Object.freeze({ key: "eagle", label: "Eagle", icon: "flag-eagle" }),
    Object.freeze({ key: "double-eagle", label: "Double-Headed Eagle", icon: "flag-double-eagle" }),
    Object.freeze({ key: "wolf", label: "Wolf Head", icon: "flag-wolf" }),
    Object.freeze({ key: "stag", label: "Stag / Hart", icon: "flag-stag" }),
    Object.freeze({ key: "boar", label: "Boar", icon: "flag-boar" }),
    Object.freeze({ key: "bear", label: "Bear", icon: "flag-bear" }),
    Object.freeze({ key: "horse", label: "Horse", icon: "flag-horse" }),
    Object.freeze({ key: "dragon", label: "Dragon", icon: "flag-dragon" }),
    Object.freeze({ key: "griffin", label: "Griffin", icon: "flag-griffin" }),
    Object.freeze({ key: "raven", label: "Raven", icon: "flag-raven" }),
    Object.freeze({ key: "falcon", label: "Falcon", icon: "flag-falcon" }),
    Object.freeze({ key: "serpent", label: "Serpent", icon: "flag-serpent" }),
    Object.freeze({ key: "crossed-swords", label: "Crossed Swords", icon: "flag-crossed-swords" }),
    Object.freeze({ key: "battle-axe", label: "Battle Axe", icon: "flag-battle-axe" }),
    Object.freeze({ key: "war-hammer", label: "War Hammer", icon: "flag-war-hammer" }),
    Object.freeze({ key: "spearhead", label: "Spearhead", icon: "flag-spearhead" }),
    Object.freeze({ key: "gauntlet", label: "Gauntlet / Armored Fist", icon: "flag-gauntlet" }),
    Object.freeze({ key: "tower", label: "Tower", icon: "flag-tower" }),
    Object.freeze({ key: "castle-gate", label: "Castle Gate", icon: "flag-castle-gate" }),
    Object.freeze({ key: "fleur-de-lis", label: "Fleur-de-lis", icon: "flag-fleur-de-lis" }),
    Object.freeze({ key: "oak-tree", label: "Oak Tree", icon: "flag-oak-tree" }),
    Object.freeze({ key: "sunburst", label: "Sunburst", icon: "flag-sunburst" }),
    Object.freeze({ key: "cross", label: "Cross Pattée", icon: "flag-cross" }),
    Object.freeze({ key: "moon", label: "Crescent Moon", icon: "flag-moon" }),
    Object.freeze({ key: "diamond", label: "Heraldic Lozenge", icon: "flag-diamond" }),
    Object.freeze({ key: "guardian", label: "Guardian Shield", icon: "flag-guardian" }),
    Object.freeze({ key: "banner", label: "Forked War Banner", icon: "flag-banner" }),
    Object.freeze({ key: "helm", label: "Great Helm", icon: "flag-helm" }),
  ]);

  const COLOR_VALUES = Object.freeze(COLORS.map(option => option.value));
  const PATTERN_KEYS = Object.freeze(PATTERNS.map(option => option.key));
  const SYMBOL_KEYS = Object.freeze(SYMBOLS.map(option => option.key));
  const COLOR_BY_VALUE = new Map(COLORS.map(option => [option.value, option]));
  const SYMBOL_BY_KEY = new Map(SYMBOLS.map(option => [option.key, option]));
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  const LEGACY_SYMBOL_MAP = Object.freeze({
    crown: "crown",
    castle: "tower",
    "flag-castle": "tower",
    "cl-icon-flag-castle": "tower",
    star: "sunburst",
    "flag-star": "sunburst",
    swords: "crossed-swords",
    attack: "crossed-swords",
    "crossed-weapons": "crossed-swords",
    fleur: "fleur-de-lis",
    "flag-fleur": "fleur-de-lis",
    sun: "sunburst",
    "flag-sun": "sunburst",
    knight: "horse",
    "warhorse": "horse",
    "flag-horse": "horse",
    tower: "tower",
    "flag-tower": "tower",
    spire: "spearhead",
    "flag-spearhead": "spearhead",
    keep: "castle-gate",
    "royal-keep": "castle-gate",
  });

  const DEFAULT_FLAG = Object.freeze({
    version: CURRENT_VERSION,
    primary: "#315A8A",
    secondary: "#C69A45",
    symbolColor: "#F2E2BF",
    pattern: "diagonal",
    symbol: "crown",
  });

  function stableHash(value = "") {
    const text = String(value || "crownlands-player-flag");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function selectStable(values, stableKey, salt = "") {
    if (!values.length) return null;
    return values[stableHash(`${stableKey || "anonymous"}:${salt}`) % values.length];
  }

  function normalizeHexColor(value) {
    const color = String(value || "").trim();
    return HEX_COLOR.test(color) ? color.toUpperCase() : "";
  }

  function getFlagVersion(flag = null) {
    if (!flag || typeof flag !== "object" || Array.isArray(flag)) return LEGACY_VERSION;
    const version = Number(flag.version);
    return SUPPORTED_VERSIONS.includes(version) ? version : LEGACY_VERSION;
  }

  function firstValue(source, keys) {
    for (const key of keys) {
      if (source && Object.prototype.hasOwnProperty.call(source, key)) return source[key];
    }
    return undefined;
  }

  function normalizePattern(value, stableKey = "") {
    const candidate = String(value || "").trim();
    return PATTERN_KEYS.includes(candidate)
      ? candidate
      : selectStable(PATTERN_KEYS, stableKey, `pattern:${candidate}`) || DEFAULT_FLAG.pattern;
  }

  function normalizeSymbol(value, stableKey = "") {
    const candidate = String(value || "").trim();
    if (SYMBOL_KEYS.includes(candidate)) return candidate;
    const legacy = LEGACY_SYMBOL_MAP[candidate.toLowerCase()];
    if (legacy && SYMBOL_KEYS.includes(legacy)) return legacy;
    return selectStable(SYMBOL_KEYS, stableKey, `symbol:${candidate}`) || DEFAULT_FLAG.symbol;
  }

  function createDeterministicFlag(stableKey = "", version = CURRENT_VERSION) {
    const primary = selectStable(COLOR_VALUES, stableKey, "primary") || DEFAULT_FLAG.primary;
    const secondaryChoices = COLOR_VALUES.filter(color => color !== primary);
    return {
      version: SUPPORTED_VERSIONS.includes(Number(version)) ? Number(version) : CURRENT_VERSION,
      primary,
      secondary: selectStable(secondaryChoices, stableKey, "secondary") || DEFAULT_FLAG.secondary,
      symbolColor: selectStable(["#F2E2BF", "#DDD0AE", "#202426", "#303436"], stableKey, "symbolColor") || DEFAULT_FLAG.symbolColor,
      pattern: selectStable(PATTERN_KEYS, stableKey, "pattern") || DEFAULT_FLAG.pattern,
      symbol: selectStable(SYMBOL_KEYS, stableKey, "symbol") || DEFAULT_FLAG.symbol,
    };
  }

  function normalizeFlag(flag = null, stableKey = "") {
    const source = flag && typeof flag === "object" && !Array.isArray(flag) ? flag : {};
    const version = getFlagVersion(source);
    const fallback = createDeterministicFlag(stableKey, version);
    const primary = normalizeHexColor(firstValue(source, ["primary", "primaryColor", "fieldColor", "background"])) || fallback.primary;
    const secondary = normalizeHexColor(firstValue(source, ["secondary", "accent", "accentColor", "secondaryColor", "patternColor"])) || fallback.secondary;
    const symbolColor = normalizeHexColor(firstValue(source, ["symbolColor", "iconColor", "chargeColor", "emblemColor"])) || DEFAULT_FLAG.symbolColor;
    const pattern = normalizePattern(firstValue(source, ["pattern", "patternId"]), stableKey);
    const symbol = normalizeSymbol(firstValue(source, ["symbol", "symbolId", "icon", "emblem"]), stableKey);
    return { version, primary, secondary, symbolColor, pattern, symbol };
  }

  function toStoredFlag(flag = null, stableKey = "", options = {}) {
    const normalized = normalizeFlag(flag, stableKey);
    const requestedVersion = Number(options.version);
    const version = SUPPORTED_VERSIONS.includes(requestedVersion) ? requestedVersion : normalized.version;
    const stored = {
      primary: normalized.primary,
      secondary: normalized.secondary,
      symbolColor: normalized.symbolColor,
      pattern: normalized.pattern,
      symbol: normalized.symbol,
    };
    if (version >= CURRENT_VERSION) stored.version = CURRENT_VERSION;
    return stored;
  }

  function createVersion2Flag(flag = null, stableKey = "") {
    return normalizeFlag({ ...toStoredFlag(flag, stableKey, { version: CURRENT_VERSION }), version: CURRENT_VERSION }, stableKey);
  }

  function colorLuminance(value) {
    const color = normalizeHexColor(value) || DEFAULT_FLAG.primary;
    const channels = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16) / 255)
      .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function getContrastRatio(left, right) {
    const leftLuminance = colorLuminance(left);
    const rightLuminance = colorLuminance(right);
    return (Math.max(leftLuminance, rightLuminance) + 0.05) / (Math.min(leftLuminance, rightLuminance) + 0.05);
  }

  function getContrastWarnings(flag = null, stableKey = "") {
    const normalized = normalizeFlag(flag, stableKey);
    const fieldContrast = getContrastRatio(normalized.primary, normalized.secondary);
    const symbolContrast = Math.min(
      getContrastRatio(normalized.symbolColor, normalized.primary),
      getContrastRatio(normalized.symbolColor, normalized.secondary)
    );
    const warnings = [];
    if (fieldContrast < 1.35) warnings.push("Background and pattern colors may blend together.");
    if (symbolContrast < 2.25) warnings.push("The symbol may be hard to read at map size.");
    return Object.freeze({ fieldContrast, symbolContrast, warnings: Object.freeze(warnings) });
  }

  function randomIndex(length, randomInt) {
    if (length <= 1) return 0;
    if (typeof randomInt === "function") return Math.max(0, Math.min(length - 1, Math.floor(randomInt(length))));
    return Math.floor(Math.random() * length);
  }

  function createRandomFlag(randomInt = null) {
    const primary = COLOR_VALUES[randomIndex(COLOR_VALUES.length, randomInt)] || DEFAULT_FLAG.primary;
    const readableSecondaryChoices = COLOR_VALUES.filter(color => color !== primary && getContrastRatio(color, primary) >= 1.45);
    const secondaryChoices = readableSecondaryChoices.length ? readableSecondaryChoices : COLOR_VALUES.filter(color => color !== primary);
    const secondary = secondaryChoices[randomIndex(secondaryChoices.length, randomInt)] || DEFAULT_FLAG.secondary;
    const symbolChoices = ["#F2E2BF", "#DDD0AE", "#202426", "#303436"]
      .map(color => ({ color, contrast: Math.min(getContrastRatio(color, primary), getContrastRatio(color, secondary)) }))
      .sort((left, right) => right.contrast - left.contrast);
    const readableSymbolChoices = symbolChoices.filter(option => option.contrast >= 2.5);
    const symbolPool = readableSymbolChoices.length ? readableSymbolChoices : symbolChoices.slice(0, 1);
    return {
      version: CURRENT_VERSION,
      primary,
      secondary,
      symbolColor: symbolPool[randomIndex(symbolPool.length, randomInt)]?.color || DEFAULT_FLAG.symbolColor,
      pattern: PATTERN_KEYS[randomIndex(PATTERN_KEYS.length, randomInt)] || DEFAULT_FLAG.pattern,
      symbol: SYMBOL_KEYS[randomIndex(SYMBOL_KEYS.length, randomInt)] || DEFAULT_FLAG.symbol,
    };
  }

  function getColorOption(value) {
    return COLOR_BY_VALUE.get(normalizeHexColor(value)) || null;
  }

  function getSymbol(value, stableKey = "") {
    return SYMBOL_BY_KEY.get(normalizeSymbol(value, stableKey)) || SYMBOLS[0];
  }

  function getSymbolOutline(symbolColor) {
    const color = normalizeHexColor(symbolColor) || DEFAULT_FLAG.symbolColor;
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return luminance > 0.54 ? "rgba(32, 36, 38, .82)" : "rgba(242, 226, 191, .72)";
  }

  return Object.freeze({
    LEGACY_VERSION,
    CURRENT_VERSION,
    SUPPORTED_VERSIONS,
    COLORS,
    COLOR_VALUES,
    PATTERNS,
    PATTERN_KEYS,
    SYMBOLS,
    SYMBOL_KEYS,
    LEGACY_SYMBOL_MAP,
    DEFAULT_FLAG,
    normalizeHexColor,
    getFlagVersion,
    normalizePattern,
    normalizeSymbol,
    normalizeFlag,
    toStoredFlag,
    createVersion2Flag,
    createDeterministicFlag,
    createRandomFlag,
    getColorOption,
    getSymbol,
    getSymbolOutline,
    colorLuminance,
    getContrastRatio,
    getContrastWarnings,
    stableHash,
  });
});
