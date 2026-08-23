(function initializeClanHeraldryConfig(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.CrownlandsClanHeraldryConfig = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createClanHeraldryConfig() {
  "use strict";

  const LEGACY_VERSION = 1;
  const CURRENT_VERSION = 2;
  const CURRENT_ART_SET_VERSION = 1;
  const SUPPORTED_VERSIONS = Object.freeze([LEGACY_VERSION, CURRENT_VERSION]);
  const SUPPORTED_ART_SET_VERSIONS = Object.freeze([CURRENT_ART_SET_VERSION]);
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  const COLORS = freezeOptions([
    ["#7a2638", "Castilian Crimson"], ["#a84432", "Madder Brick"],
    ["#6e2025", "Oxblood"], ["#d8bd78", "Old Gold"],
    ["#c69a45", "Heraldic Gold"], ["#eee1bd", "Parchment"],
    ["#f2e2bf", "Ivory"], ["#19201d", "Iron Black"],
    ["#303436", "Charcoal"], ["#253f3a", "Forest Green"],
    ["#4e5637", "Deep Olive"], ["#24445f", "Royal Blue"],
    ["#547a9a", "Faded Azure"], ["#5c3566", "Royal Purple"],
    ["#b7c3bf", "Silver"], ["#8a5835", "Leather Brown"],
  ], ([value, label]) => ({ value, label }));

  const SHAPES = freezeOptions([
    ["heater", "Heater", "M12 8H88V50Q86 78 50 99Q14 78 12 50Z"],
    ["castilian", "Castilian", "M9 8Q50 1 91 8V57Q88 83 50 100Q12 83 9 57Z"],
    ["kite", "Kite", "M17 7Q50 1 83 7V43Q79 73 50 103Q21 73 17 43Z"],
    ["round", "Round", "M11 9Q50 0 89 9V60Q86 90 50 99Q14 90 11 60Z"],
  ], ([key, label, path]) => ({ key, label, path }));

  const DIVISIONS = freezeOptions([
    ["solid", "Solid Field"], ["pale", "Per Pale · Vertical Split"],
    ["fess", "Per Fess · Horizontal Split"], ["quartered", "Quartered"],
    ["stripes", "Paly · Vertical Stripes"], ["bend", "Bend · Diagonal Band"],
    ["saltire", "Saltire"], ["chevron", "Chevron"],
  ], ([key, label]) => ({ key, label }));

  const CHARGE_LAYOUTS = freezeOptions([
    ["center", "Single"], ["paired", "Paired"],
    ["quartered", "Alternating Quarters"], ["chief", "Chief and Base"],
  ], ([key, label]) => ({ key, label }));
  const TRIMS = freezeOptions([["plain", "Plain Edge"], ["double", "Double Trim"], ["riveted", "Riveted Trim"]], ([key, label]) => ({ key, label }));
  const FINISHES = freezeOptions([["polished", "Polished"], ["weathered", "Weathered"], ["battleworn", "Battle-worn"]], ([key, label]) => ({ key, label }));

  const CHARGES = Object.freeze([
    charge("none", "None", { available: true, selectable: true, provenance: "system" }),
    charge("crown", "Crown", { provenance: "player-source" }),
    charge("lion", "Lion Rampant", { provenance: "player-source" }),
    charge("eagle", "Heraldic Eagle", { provenance: "player-source" }),
    charge("double-eagle", "Double Eagle", { artworkPending: true }),
    charge("griffin", "Griffin", { artworkPending: true }),
    charge("dragon", "Dragon", { provenance: "player-source" }),
    charge("wolf", "Wolf", { provenance: "player-source" }),
    charge("stag", "Stag", { provenance: "player-source" }),
    charge("bear", "Bear", { provenance: "player-source" }),
    charge("raven", "Raven", { artworkPending: true }),
    charge("crossed-swords", "Crossed Swords", { provenance: "player-source" }),
    charge("helm", "Great Helm", { artworkPending: true }),
    charge("gauntlet", "Gauntlet", { provenance: "player-source" }),
    charge("castle", "Castle", { artworkPending: true }),
    charge("fleur-de-lis", "Fleur-de-lis", { provenance: "player-source" }),
    charge("oak-tree", "Oak Tree", { provenance: "player-source" }),
    charge("war-horn", "War Horn", { provenance: "clan-exclusive" }),
    charge("battering-ram", "Battering Ram", { provenance: "clan-exclusive" }),
    charge("fortress-keep", "Fortress Keep", { provenance: "clan-exclusive" }),
    charge("watchtower", "Watchtower", { provenance: "clan-exclusive" }),
    charge("portcullis", "Portcullis Gate", { provenance: "clan-exclusive" }),
  ]);

  const COLOR_VALUES = Object.freeze(COLORS.map(option => option.value));
  const SHAPE_KEYS = keys(SHAPES);
  const DIVISION_KEYS = keys(DIVISIONS);
  const CHARGE_LAYOUT_KEYS = keys(CHARGE_LAYOUTS);
  const TRIM_KEYS = keys(TRIMS);
  const FINISH_KEYS = keys(FINISHES);
  const CHARGE_KEYS = keys(CHARGES);
  const SELECTABLE_CHARGES = Object.freeze(CHARGES.filter(option => option.selectable));
  const SELECTABLE_CHARGE_KEYS = keys(SELECTABLE_CHARGES);
  const PENDING_CHARGE_KEYS = Object.freeze(CHARGES.filter(option => option.artworkPending).map(option => option.key));
  const SHAPE_BY_KEY = new Map(SHAPES.map(option => [option.key, option]));
  const CHARGE_BY_KEY = new Map(CHARGES.map(option => [option.key, option]));

  const DEFAULT_V1 = Object.freeze({
    version: 1, shape: "castilian", division: "quartered", primary: "#7a2638",
    secondary: "#d8bd78", borderColor: "#d8bd78", charge: "castle",
    secondaryCharge: "lion", chargeColor: "#19201d", secondaryChargeColor: "#7a2638",
    chargeLayout: "quartered", trim: "double", finish: "weathered",
  });
  const DEFAULT_V2 = Object.freeze({
    version: 2, artSetVersion: 1, shape: "castilian", division: "quartered",
    primary: "#7a2638", secondary: "#d8bd78", borderColor: "#d8bd78",
    charge: "crown", secondaryCharge: "lion", chargeColor: "#19201d",
    secondaryChargeColor: "#7a2638", chargeLayout: "center", trim: "double",
    finish: "weathered",
  });
  const V2_SCHEMA_EXAMPLE = Object.freeze({
    version: 2, artSetVersion: 1, shape: "castilian", division: "quartered",
    primary: "#7a2638", secondary: "#d8bd78", borderColor: "#d8bd78",
    charge: "castle", secondaryCharge: "lion", chargeColor: "#19201d",
    secondaryChargeColor: "#7a2638", chargeLayout: "center", trim: "double",
    finish: "weathered",
  });
  const V2_KEYS = Object.freeze(Object.keys(DEFAULT_V2));

  function freezeOptions(rows, mapper) { return Object.freeze(rows.map(row => Object.freeze(mapper(row)))); }
  function keys(options) { return Object.freeze(options.map(option => option.key)); }
  function charge(key, label, metadata = {}) {
    const artworkPending = metadata.artworkPending === true;
    const available = key === "none" || !artworkPending;
    return Object.freeze({
      key, label, artworkPending, available,
      selectable: metadata.selectable !== false && available,
      provenance: metadata.provenance || "pending",
      fullSymbolId: key === "none" ? "" : `clan-charge-v1-full-${key}`,
      microSymbolId: key === "none" ? "" : `clan-charge-v1-micro-${key}`,
    });
  }
  function isRecord(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
  function normalizeHex(value, fallback) {
    const color = String(value || "").trim().toLowerCase();
    return HEX_COLOR.test(color) ? color : fallback;
  }
  function normalizeChoice(value, allowed, fallback) {
    const key = String(value || "").trim().toLowerCase();
    return allowed.includes(key) ? key : fallback;
  }
  function getVersion(value) {
    if (!isRecord(value)) return LEGACY_VERSION;
    return Number(value.version) === CURRENT_VERSION ? CURRENT_VERSION : LEGACY_VERSION;
  }
  function normalizeHeraldryRevision(value) {
    const revision = Number(value);
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
  }
  function normalizeV1(value = null, legacyBanner = null) {
    const source = isRecord(value) ? value : isRecord(legacyBanner) ? legacyBanner : {};
    const legacyPatternMap = { split: "pale", diagonal: "bend", band: "fess", cross: "quartered", chief: "fess" };
    const legacySymbolMap = { tower: "castle", cross: "fleur", star: "sun", moon: "sun", knight: "swords", diamond: "fleur", spire: "fleur" };
    const v1Charges = ["none", "castle", "lion", "eagle", "crown", "swords", "fleur", "sun"];
    return {
      version: 1,
      shape: normalizeChoice(source.shape, SHAPE_KEYS, DEFAULT_V1.shape),
      division: normalizeChoice(legacyPatternMap[source.pattern] || source.division || source.pattern, DIVISION_KEYS, DEFAULT_V1.division),
      primary: normalizeHex(source.primary, DEFAULT_V1.primary),
      secondary: normalizeHex(source.secondary, DEFAULT_V1.secondary),
      borderColor: normalizeHex(source.borderColor, DEFAULT_V1.borderColor),
      charge: normalizeChoice(legacySymbolMap[source.symbol] || source.charge || source.symbol, v1Charges, DEFAULT_V1.charge),
      secondaryCharge: normalizeChoice(source.secondaryCharge, v1Charges, DEFAULT_V1.secondaryCharge),
      chargeColor: normalizeHex(source.chargeColor, DEFAULT_V1.chargeColor),
      secondaryChargeColor: normalizeHex(source.secondaryChargeColor, DEFAULT_V1.secondaryChargeColor),
      chargeLayout: normalizeChoice(source.chargeLayout, CHARGE_LAYOUT_KEYS, DEFAULT_V1.chargeLayout),
      trim: normalizeChoice(source.trim, TRIM_KEYS, DEFAULT_V1.trim),
      finish: normalizeChoice(source.finish, FINISH_KEYS, DEFAULT_V1.finish),
    };
  }
  function normalizeV2ForRead(value = null) {
    const source = isRecord(value) ? value : {};
    const chargeValue = normalizeChoice(source.charge, CHARGE_KEYS, DEFAULT_V2.charge);
    const secondaryValue = normalizeChoice(source.secondaryCharge, CHARGE_KEYS, DEFAULT_V2.secondaryCharge);
    return {
      version: CURRENT_VERSION,
      artSetVersion: normalizeChoice(Number(source.artSetVersion), SUPPORTED_ART_SET_VERSIONS, CURRENT_ART_SET_VERSION),
      shape: normalizeChoice(source.shape, SHAPE_KEYS, DEFAULT_V2.shape),
      division: normalizeChoice(source.division, DIVISION_KEYS, DEFAULT_V2.division),
      primary: normalizeHex(source.primary, DEFAULT_V2.primary),
      secondary: normalizeHex(source.secondary, DEFAULT_V2.secondary),
      borderColor: normalizeHex(source.borderColor, DEFAULT_V2.borderColor),
      charge: chargeValue,
      secondaryCharge: secondaryValue,
      chargeColor: normalizeHex(source.chargeColor, DEFAULT_V2.chargeColor),
      secondaryChargeColor: normalizeHex(source.secondaryChargeColor, DEFAULT_V2.secondaryChargeColor),
      chargeLayout: normalizeChoice(source.chargeLayout, CHARGE_LAYOUT_KEYS, DEFAULT_V2.chargeLayout),
      trim: normalizeChoice(source.trim, TRIM_KEYS, DEFAULT_V2.trim),
      finish: normalizeChoice(source.finish, FINISH_KEYS, DEFAULT_V2.finish),
    };
  }
  function normalizeForRead(value = null, legacyBanner = null) {
    return getVersion(value) === CURRENT_VERSION ? normalizeV2ForRead(value) : normalizeV1(value, legacyBanner);
  }
  function validateV2Write(value, options = {}) {
    const errors = [];
    if (!isRecord(value)) return Object.freeze({ ok: false, errors: Object.freeze(["Shield must be an object."]), value: null });
    const inputKeys = Object.keys(value);
    for (const key of V2_KEYS) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`Missing field: ${key}.`);
    for (const key of inputKeys) if (!V2_KEYS.includes(key)) errors.push(`Unknown field: ${key}.`);
    if (value.version !== CURRENT_VERSION) errors.push("version must be 2.");
    if (!SUPPORTED_ART_SET_VERSIONS.includes(value.artSetVersion)) errors.push("Unsupported artSetVersion.");
    validateId("shape", value.shape, SHAPE_KEYS, errors);
    validateId("division", value.division, DIVISION_KEYS, errors);
    validateId("chargeLayout", value.chargeLayout, CHARGE_LAYOUT_KEYS, errors);
    validateId("trim", value.trim, TRIM_KEYS, errors);
    validateId("finish", value.finish, FINISH_KEYS, errors);
    for (const field of ["charge", "secondaryCharge"]) {
      const metadata = CHARGE_BY_KEY.get(value[field]);
      if (!metadata || !metadata.selectable) errors.push(`${field} is unavailable in art set 1.`);
    }
    const existing = normalizeV2ForRead(options.existing);
    for (const field of ["primary", "secondary", "borderColor", "chargeColor", "secondaryChargeColor"]) {
      const candidate = String(value[field] || "").trim().toLowerCase();
      if (!HEX_COLOR.test(candidate)) errors.push(`${field} must be a six-digit hex color.`);
      else if (!COLOR_VALUES.includes(candidate) && candidate !== existing[field]) errors.push(`${field} must use the named v2 palette or preserve its existing legacy value.`);
    }
    const normalized = errors.length ? null : normalizeV2ForRead(value);
    return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), value: normalized && Object.freeze(normalized) });
  }
  function validateId(field, value, allowed, errors) { if (!allowed.includes(value)) errors.push(`Invalid ${field}.`); }
  function createV2DraftFromV1(value = null, legacyBanner = null) {
    const v1 = normalizeV1(value, legacyBanner);
    const mapping = { swords: "crossed-swords", fleur: "fleur-de-lis", castle: "none", sun: "none" };
    return normalizeV2ForRead({ ...v1, version: 2, artSetVersion: 1, charge: mapping[v1.charge] || v1.charge, secondaryCharge: mapping[v1.secondaryCharge] || v1.secondaryCharge });
  }
  function colorLuminance(value) {
    const color = normalizeHex(value, DEFAULT_V2.primary);
    const channels = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16) / 255)
      .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  function getContrastRatio(left, right) {
    const a = colorLuminance(left); const b = colorLuminance(right);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  function getContrastWarnings(value = null) {
    const shield = normalizeV2ForRead(value);
    const fieldContrast = getContrastRatio(shield.primary, shield.secondary);
    const primaryChargeContrast = Math.min(getContrastRatio(shield.chargeColor, shield.primary), getContrastRatio(shield.chargeColor, shield.secondary));
    const secondaryChargeContrast = Math.min(getContrastRatio(shield.secondaryChargeColor, shield.primary), getContrastRatio(shield.secondaryChargeColor, shield.secondary));
    const borderContrast = Math.min(getContrastRatio(shield.borderColor, shield.primary), getContrastRatio(shield.borderColor, shield.secondary));
    const microRecognizability = CHARGE_BY_KEY.get(shield.charge)?.available === true && primaryChargeContrast >= 2;
    const warnings = [];
    if (fieldContrast < 1.35) warnings.push("Field colors may blend together.");
    if (primaryChargeContrast < 2.25) warnings.push("Primary charge may be hard to read.");
    if (shield.chargeLayout !== "center" && secondaryChargeContrast < 2.25) warnings.push("Secondary charge may be hard to read.");
    if (borderContrast < 1.35) warnings.push("Border may blend into the field.");
    if (!microRecognizability) warnings.push("Micro-size recognition needs review.");
    return Object.freeze({ fieldContrast, primaryChargeContrast, secondaryChargeContrast, borderContrast, microRecognizability, warnings: Object.freeze(warnings) });
  }
  function getRenderVariant(width) { return Number(width) < 45 ? "micro" : "full"; }
  function getShape(value) { return SHAPE_BY_KEY.get(value) || SHAPE_BY_KEY.get(DEFAULT_V2.shape); }
  function getCharge(value) { return CHARGE_BY_KEY.get(value) || CHARGE_BY_KEY.get(DEFAULT_V2.charge); }

  return Object.freeze({
    LEGACY_VERSION, CURRENT_VERSION, CURRENT_ART_SET_VERSION, SUPPORTED_VERSIONS,
    SUPPORTED_ART_SET_VERSIONS, COLORS, COLOR_VALUES, SHAPES, SHAPE_KEYS, DIVISIONS,
    DIVISION_KEYS, CHARGE_LAYOUTS, CHARGE_LAYOUT_KEYS, TRIMS, TRIM_KEYS, FINISHES,
    FINISH_KEYS, CHARGES, CHARGE_KEYS, SELECTABLE_CHARGES, SELECTABLE_CHARGE_KEYS,
    PENDING_CHARGE_KEYS, DEFAULT_V1, DEFAULT_V2, V2_SCHEMA_EXAMPLE, V2_KEYS, getVersion,
    normalizeHeraldryRevision, normalizeV1, normalizeV2ForRead, normalizeForRead,
    validateV2Write, createV2DraftFromV1, colorLuminance, getContrastRatio,
    getContrastWarnings, getRenderVariant, getShape, getCharge,
  });
});
