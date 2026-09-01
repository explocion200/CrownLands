"use strict";

const CORE_RADIUS = 2;
const CORE_MAP_COUNT = 25;
const FIRST_LAYER_MAP_COUNT = 24;
const NEW_LANDS_CITY_CAPACITY = 40;
const EXPANSION_THRESHOLD_NPC_CITIES = 20;
const EXPANSION_ACTIVATION_BATCH_SIZE = 2;
const MAX_NEW_LANDS_REGIONS = 4095;
const ACTIVATION_RECEIPT_LIMIT = 256;
const TOPOLOGY_VERSION = "core-expansion-v1";
const PREPARED_CORE_REGION_NAMES = Object.freeze({
  "core-v2-warband-camp-m2-m2": "Frostwolf March",
  "core-v2-relic-camp-north-west-m1-m2": "Ravenscar",
  "core-v2-north-support-p0-m2": "Highwinter Vale",
  "core-v2-deed-camp-north-east-p1-m2": "Dawncrest",
  "core-v2-gold-camp-north-east-p2-m2": "Gilded Moor",
  "core-v2-relic-camp-west-north-m2-m1": "Elderglen",
  "core-v2-north-west-holding-tower-m1-m1": "Stoneward",
  "core-v2-greybanner-hold-p0-m1": "Greybanner Hold",
  "core-v2-north-east-holding-tower-p1-m1": "Lionwatch",
  "core-v2-deed-camp-east-north-p2-m1": "Kingsbridge",
  "core-v2-west-support-m2-p0": "Westwych",
  "core-v2-aurum-keep-m1-p0": "Aurum Keep",
  "core-v2-crown-citadel-p0-p0": "Crown Citadel",
  "core-v2-swiftgate-p1-p0": "Swiftgate",
  "core-v2-east-support-p2-p0": "Eastmarch",
  "core-v2-deed-camp-west-south-m2-p1": "Thornmere",
  "core-v2-south-west-holding-tower-m1-p1": "Oakwatch",
  "core-v2-ironwatch-p0-p1": "Ironwatch",
  "core-v2-south-east-holding-tower-p1-p1": "Roseguard",
  "core-v2-relic-camp-east-south-p2-p1": "Emberfen",
  "core-v2-gold-camp-south-west-m2-p2": "Goldmere",
  "core-v2-deed-camp-south-west-m1-p2": "Brambleford",
  "core-v2-south-support-p0-p2": "Southhaven",
  "core-v2-relic-camp-south-east-p1-p2": "Brightmere",
  "core-v2-warband-camp-south-east-p2-p2": "Redwolf Reach",
});
const PREPARED_NEW_LANDS_REGION_NAMES = Object.freeze([
  "Northgate March",
  "Frostmere",
  "Highwatch Vale",
  "Ravenstone",
  "Eastwall Reach",
  "Kingsroad March",
  "Redwych",
  "Ashford Vale",
  "Emberfield",
  "Sunward Ford",
  "Goldbarrow",
  "Southwatch",
  "Dunmere",
  "Blackthorn Reach",
  "Westervale",
  "Stoneford",
  "Greyfen",
  "Oakshield",
  "Briar March",
  "Wolfpine",
  "Alderwatch",
  "Moorhaven",
  "Crownsward",
  "Ironwood Vale",
  "Wintergate",
  "Silverbrook",
  "Windermere",
  "Northreach",
  "Coldharbor March",
  "Whitecliff",
  "Falconmere",
  "Dawnwatch",
  "Sunfield Reach",
  "Roseford",
  "Eastmere",
  "Amberwick",
  "Goldcrest Vale",
  "Greenbarrow",
  "Fairhaven March",
  "Summerholt",
  "Brightwater",
  "Stormwatch",
  "Darkwater Reach",
  "Hollowfen",
  "Nightwood",
  "Blackmere",
  "Westwatch",
  "Flintbarrow",
  "Stonehaven",
  "Wyvern's Rest",
  "Thornwall",
  "Mistwood Vale",
  "Greyhaven",
  "Frostford",
  "Wintermere",
  "Northwood",
]);
const DYNAMIC_NAME_PREFIXES = Object.freeze([
  "Alder", "Ashen", "Barrow", "Black", "Briar", "Bright", "Cedar", "Cold",
  "Crow", "Dawn", "Dun", "Elder", "Ember", "Fair", "Falcon", "Flint",
  "Frost", "Gilded", "Green", "Grey", "Hart", "High", "Iron", "King's",
  "Mist", "Night", "Oak", "Raven", "Red", "Silver", "Stone", "White",
]);
const DYNAMIC_NAME_ROOTS = Object.freeze([
  "barrow", "brook", "cliff", "crest", "fen", "field", "ford", "gate",
  "glen", "haven", "heath", "hill", "holt", "keep", "mere", "moor",
  "pine", "reach", "rest", "ridge", "scar", "shield", "stone", "vale",
  "wall", "watch", "water", "wick", "wood", "wych", "ward", "march",
]);
const DYNAMIC_NAME_SUFFIXES = Object.freeze([
  "Abbey", "Crossing", "Crownland", "Downs", "Fells", "Forest", "Hold", "Hundred",
  "March", "Meadows", "Moor", "Pass", "Reach", "Riding", "Shire", "Vale",
  "Ward", "Watch", "Weald", "Wilds", "Wold", "Wood", "Barony", "Bailiwick",
  "Demesne", "Earldom", "Manor", "Palatinate", "Province", "Stead", "Terrace", "Wardenry",
]);

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function ringRadius(layer = 1) {
  return CORE_RADIUS + Math.max(1, integer(layer, 1));
}

function getClockwiseLayerCoordinates(layer = 1) {
  const normalizedLayer = Math.max(1, integer(layer, 1));
  const radius = ringRadius(normalizedLayer);
  const coordinates = [];

  // Start at the north-center cardinal entrance so the first map in every
  // layer has a direct south road into the immediately inner layer.
  for (let x = 0; x <= radius; x += 1) {
    coordinates.push({ gridX: x, gridY: -radius });
  }
  for (let y = -radius + 1; y <= radius; y += 1) {
    coordinates.push({ gridX: radius, gridY: y });
  }
  for (let x = radius - 1; x >= -radius; x -= 1) {
    coordinates.push({ gridX: x, gridY: radius });
  }
  for (let y = radius - 1; y >= -radius; y -= 1) {
    coordinates.push({ gridX: -radius, gridY: y });
  }
  for (let x = -radius + 1; x < 0; x += 1) {
    coordinates.push({ gridX: x, gridY: -radius });
  }
  return Object.freeze(coordinates.map((coordinate, clockwiseOrderIndex) => Object.freeze({
    ...coordinate,
    worldLayer: normalizedLayer,
    clockwiseOrderIndex,
  })));
}

function getLayerMapCount(layer = 1) {
  return getClockwiseLayerCoordinates(layer).length;
}

function formatNewLandsRegionId(layer, clockwiseOrderIndex) {
  return `new-lands-l${String(layer).padStart(2, "0")}-p${String(clockwiseOrderIndex + 1).padStart(3, "0")}`;
}

function getActivationOrdinalForLayerPosition(layer, clockwiseOrderIndex) {
  const normalizedLayer = Math.max(1, integer(layer, 1));
  const normalizedPosition = Math.max(0, integer(clockwiseOrderIndex));
  const layerCount = getLayerMapCount(normalizedLayer);
  if (normalizedPosition >= layerCount) {
    throw new Error("New Lands position exceeds its layer boundary.");
  }
  const precedingLayerCount = 4 * (normalizedLayer - 1) * (normalizedLayer + 4);
  return precedingLayerCount + normalizedPosition;
}

function parseNewLandsRegionId(regionId = "") {
  const match = /^new-lands-l(\d{2,5})-p(\d{3,6})$/.exec(String(regionId || "").trim().toLowerCase());
  if (!match) return null;
  const worldLayer = integer(match[1]);
  const clockwiseOrderIndex = integer(match[2]) - 1;
  if (worldLayer < 1 || clockwiseOrderIndex < 0 || clockwiseOrderIndex >= getLayerMapCount(worldLayer)) return null;
  const activationOrdinal = getActivationOrdinalForLayerPosition(worldLayer, clockwiseOrderIndex);
  if (activationOrdinal >= MAX_NEW_LANDS_REGIONS) return null;
  const coordinate = getClockwiseLayerCoordinates(worldLayer)[clockwiseOrderIndex];
  return Object.freeze({
    id: formatNewLandsRegionId(worldLayer, clockwiseOrderIndex),
    activationOrdinal,
    ...coordinate,
  });
}

function getNewLandsRegionName(activationOrdinal = 0) {
  const ordinal = Math.max(0, integer(activationOrdinal));
  if (ordinal >= MAX_NEW_LANDS_REGIONS) {
    throw new Error("New Lands name ordinal exceeds the supported expansion range.");
  }
  if (PREPARED_NEW_LANDS_REGION_NAMES[ordinal]) return PREPARED_NEW_LANDS_REGION_NAMES[ordinal];
  const prefixIndex = ordinal % DYNAMIC_NAME_PREFIXES.length;
  const rootIndex = Math.floor(ordinal / DYNAMIC_NAME_PREFIXES.length) % DYNAMIC_NAME_ROOTS.length;
  const suffixIndex = Math.floor(ordinal / (DYNAMIC_NAME_PREFIXES.length * DYNAMIC_NAME_ROOTS.length));
  return `${DYNAMIC_NAME_PREFIXES[prefixIndex]}${DYNAMIC_NAME_ROOTS[rootIndex]} ${DYNAMIC_NAME_SUFFIXES[suffixIndex]}`;
}

function getRegionAtActivationOrdinal(ordinal = 0) {
  let remaining = Math.max(0, integer(ordinal));
  if (remaining >= MAX_NEW_LANDS_REGIONS) {
    throw new Error("New Lands activation ordinal exceeds the supported expansion range.");
  }
  for (let layer = 1; layer <= 10000; layer += 1) {
    const coordinates = getClockwiseLayerCoordinates(layer);
    if (remaining < coordinates.length) {
      const coordinate = coordinates[remaining];
      return Object.freeze({
        id: formatNewLandsRegionId(layer, coordinate.clockwiseOrderIndex),
        purpose: "player_region",
        permanentCore: false,
        cityCapacity: NEW_LANDS_CITY_CAPACITY,
        activationOrdinal: Math.max(0, integer(ordinal)),
        name: getNewLandsRegionName(ordinal),
        ...coordinate,
      });
    }
    remaining -= coordinates.length;
  }
  throw new Error("New Lands activation ordinal exceeds the supported topology range.");
}

function createInitialExpansionState(resetGeneration = "") {
  const first = getRegionAtActivationOrdinal(0);
  return Object.freeze({
    schemaVersion: 2,
    topologyVersion: TOPOLOGY_VERSION,
    resetGeneration: String(resetGeneration || ""),
    activeRegionIds: Object.freeze([first.id]),
    admittingRegionIds: Object.freeze([first.id]),
    nextActivationOrdinal: 1,
    activationReceipts: Object.freeze({}),
    pendingActivation: null,
    queuedActivationSources: Object.freeze([]),
    revision: 1,
  });
}

function normalizeExpansionState(state = {}) {
  const activeRegionIds = [...new Set((Array.isArray(state.activeRegionIds) ? state.activeRegionIds : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))];
  const admittingRegionIds = [...new Set((Array.isArray(state.admittingRegionIds) ? state.admittingRegionIds : [])
    .map(value => String(value || "").trim())
    .filter(value => value && activeRegionIds.includes(value)))];
  const pendingSourceRegionId = String(state.pendingActivation?.sourceRegionId || "").trim();
  const pendingRegionIds = [...new Set((Array.isArray(state.pendingActivation?.regionIds)
    ? state.pendingActivation.regionIds
    : []).map(value => String(value || "").trim()).filter(value => parseNewLandsRegionId(value)))];
  const pendingActivation = pendingSourceRegionId && pendingRegionIds.length === EXPANSION_ACTIVATION_BATCH_SIZE
    ? {
        eventId: String(state.pendingActivation?.eventId || "").trim(),
        sourceRegionId: pendingSourceRegionId,
        regionIds: pendingRegionIds,
        startActivationOrdinal: Math.max(0, integer(state.pendingActivation?.startActivationOrdinal)),
        nextActivationOrdinal: Math.max(0, integer(state.pendingActivation?.nextActivationOrdinal)),
        thresholdRevision: Math.max(0, integer(state.pendingActivation?.thresholdRevision)),
        createdAtMs: Math.max(0, integer(state.pendingActivation?.createdAtMs)),
      }
    : null;
  const queuedActivationSources = (Array.isArray(state.queuedActivationSources)
    ? state.queuedActivationSources
    : []).map(entry => ({
      eventId: String(entry?.eventId || "").trim(),
      sourceRegionId: String(entry?.sourceRegionId || "").trim(),
      thresholdRevision: Math.max(0, integer(entry?.thresholdRevision)),
      createdAtMs: Math.max(0, integer(entry?.createdAtMs)),
    })).filter(entry => entry.eventId && entry.sourceRegionId);
  return {
    schemaVersion: 2,
    topologyVersion: TOPOLOGY_VERSION,
    resetGeneration: String(state.resetGeneration || ""),
    activeRegionIds,
    admittingRegionIds,
    nextActivationOrdinal: Math.max(activeRegionIds.length, integer(state.nextActivationOrdinal, activeRegionIds.length)),
    activationReceipts: state.activationReceipts && typeof state.activationReceipts === "object"
      ? { ...state.activationReceipts }
      : {},
    pendingActivation,
    queuedActivationSources,
    revision: Math.max(0, integer(state.revision)),
  };
}

function buildActivationEventId(resetGeneration, sourceRegionId, thresholdRevision = 0) {
  const generation = String(resetGeneration || "").trim();
  const source = String(sourceRegionId || "").trim();
  if (!generation || !source) throw new Error("Expansion activation requires a generation and source region.");
  return `${generation}:${source}:${EXPANSION_THRESHOLD_NPC_CITIES}:${Math.max(0, integer(thresholdRevision))}`;
}

function planThresholdActivation({
  state,
  resetGeneration = "",
  sourceRegionId = "",
  remainingNpcCities,
  thresholdRevision = 0,
} = {}) {
  const current = normalizeExpansionState(state);
  const generation = String(resetGeneration || current.resetGeneration || "").trim();
  if (!generation || current.resetGeneration !== generation) {
    throw new Error("Expansion state does not match the active reset generation.");
  }
  const source = String(sourceRegionId || "").trim();
  if (!current.admittingRegionIds.includes(source)) {
    return Object.freeze({ changed: false, reason: "source-not-admitting", state: Object.freeze(current), activatedRegions: Object.freeze([]) });
  }
  if (integer(remainingNpcCities, -1) !== EXPANSION_THRESHOLD_NPC_CITIES) {
    return Object.freeze({ changed: false, reason: "threshold-not-reached", state: Object.freeze(current), activatedRegions: Object.freeze([]) });
  }

  const eventId = buildActivationEventId(generation, source, thresholdRevision);
  if (current.activationReceipts[eventId]) {
    return Object.freeze({
      changed: false,
      reason: "already-activated",
      eventId,
      state: Object.freeze(current),
      activatedRegions: Object.freeze([]),
    });
  }
  if (current.pendingActivation) {
    if (current.queuedActivationSources.some(entry => entry.eventId === eventId)) {
      return Object.freeze({
        changed: false,
        reason: "already-queued",
        eventId,
        state: Object.freeze(current),
        activatedRegions: Object.freeze([]),
        preparedRegions: Object.freeze([]),
      });
    }
    const queued = {
      eventId,
      sourceRegionId: source,
      thresholdRevision: Math.max(0, integer(thresholdRevision)),
      createdAtMs: Date.now(),
    };
    const next = {
      ...current,
      admittingRegionIds: current.admittingRegionIds.filter(regionId => regionId !== source),
      queuedActivationSources: [...current.queuedActivationSources, queued],
      revision: current.revision + 1,
    };
    return Object.freeze({
      changed: true,
      reason: "activation-queued",
      eventId,
      state: Object.freeze(next),
      activatedRegions: Object.freeze([]),
      preparedRegions: Object.freeze([]),
    });
  }

  const preparedRegions = [];
  const startActivationOrdinal = current.nextActivationOrdinal;
  let nextActivationOrdinal = current.nextActivationOrdinal;
  while (preparedRegions.length < EXPANSION_ACTIVATION_BATCH_SIZE) {
    const candidate = getRegionAtActivationOrdinal(nextActivationOrdinal);
    nextActivationOrdinal += 1;
    if (current.activeRegionIds.includes(candidate.id)) continue;
    preparedRegions.push(candidate);
  }
  const preparedIds = preparedRegions.map(region => region.id);
  const next = {
    ...current,
    admittingRegionIds: current.admittingRegionIds.filter(regionId => regionId !== source),
    nextActivationOrdinal,
    pendingActivation: {
      eventId,
      sourceRegionId: source,
      regionIds: preparedIds,
      startActivationOrdinal,
      nextActivationOrdinal,
      thresholdRevision: Math.max(0, integer(thresholdRevision)),
      createdAtMs: Date.now(),
    },
    revision: current.revision + 1,
  };
  return Object.freeze({
    changed: true,
    reason: "threshold-preparing",
    eventId,
    state: Object.freeze(next),
    activatedRegions: Object.freeze([]),
    preparedRegions: Object.freeze(preparedRegions),
  });
}

function finalizePendingActivation({ state, eventId = "", readyRegionIds = [] } = {}) {
  const current = normalizeExpansionState(state);
  const pending = current.pendingActivation;
  if (!pending || pending.eventId !== String(eventId || "").trim()) {
    return Object.freeze({ changed: false, reason: "pending-activation-mismatch", state: Object.freeze(current), activatedRegions: Object.freeze([]) });
  }
  const ready = new Set((Array.isArray(readyRegionIds) ? readyRegionIds : []).map(value => String(value || "").trim()));
  if (!pending.regionIds.every(regionId => ready.has(regionId))) {
    return Object.freeze({ changed: false, reason: "regions-not-ready", state: Object.freeze(current), activatedRegions: Object.freeze([]) });
  }
  const activatedRegions = pending.regionIds.map(regionId => getRegionAtActivationOrdinal(
    parseNewLandsRegionId(regionId).activationOrdinal
  ));
  const queuedActivationSources = [...current.queuedActivationSources];
  const queued = queuedActivationSources.shift() || null;
  let nextActivationOrdinal = current.nextActivationOrdinal;
  let nextPendingActivation = null;
  if (queued) {
    const regionIds = [];
    const startActivationOrdinal = nextActivationOrdinal;
    while (regionIds.length < EXPANSION_ACTIVATION_BATCH_SIZE) {
      const candidate = getRegionAtActivationOrdinal(nextActivationOrdinal);
      nextActivationOrdinal += 1;
      if (current.activeRegionIds.includes(candidate.id) || pending.regionIds.includes(candidate.id)) continue;
      regionIds.push(candidate.id);
    }
    nextPendingActivation = {
      ...queued,
      regionIds,
      startActivationOrdinal,
      nextActivationOrdinal,
    };
  }
  const activationReceipts = Object.fromEntries([
    ...Object.entries(current.activationReceipts),
    [pending.eventId, {
      sourceRegionId: pending.sourceRegionId,
      remainingNpcCities: EXPANSION_THRESHOLD_NPC_CITIES,
      activatedRegionIds: pending.regionIds,
      nextActivationOrdinal: pending.nextActivationOrdinal,
    }],
  ].slice(-ACTIVATION_RECEIPT_LIMIT));
  const next = {
    ...current,
    activeRegionIds: [...new Set([...current.activeRegionIds, ...pending.regionIds])],
    admittingRegionIds: [...new Set([...current.admittingRegionIds, ...pending.regionIds])],
    activationReceipts,
    nextActivationOrdinal,
    pendingActivation: nextPendingActivation,
    queuedActivationSources,
    revision: current.revision + 1,
  };
  return Object.freeze({
    changed: true,
    reason: "threshold-activated",
    eventId: pending.eventId,
    state: Object.freeze(next),
    activatedRegions: Object.freeze(activatedRegions),
    nextPendingActivation: nextPendingActivation ? Object.freeze({ ...nextPendingActivation }) : null,
  });
}

function rollbackPendingActivation({ state, eventId = "" } = {}) {
  const current = normalizeExpansionState(state);
  const pending = current.pendingActivation;
  if (!pending || pending.eventId !== String(eventId || "").trim()) {
    return Object.freeze({ changed: false, reason: "pending-activation-mismatch", state: Object.freeze(current) });
  }
  const next = {
    ...current,
    admittingRegionIds: [...new Set([...current.admittingRegionIds, pending.sourceRegionId])],
    nextActivationOrdinal: pending.startActivationOrdinal,
    pendingActivation: null,
    queuedActivationSources: [],
    revision: current.revision + 1,
  };
  return Object.freeze({ changed: true, reason: "activation-rolled-back", state: Object.freeze(next) });
}

module.exports = Object.freeze({
  CORE_RADIUS,
  CORE_MAP_COUNT,
  FIRST_LAYER_MAP_COUNT,
  NEW_LANDS_CITY_CAPACITY,
  EXPANSION_THRESHOLD_NPC_CITIES,
  EXPANSION_ACTIVATION_BATCH_SIZE,
  MAX_NEW_LANDS_REGIONS,
  ACTIVATION_RECEIPT_LIMIT,
  TOPOLOGY_VERSION,
  PREPARED_CORE_REGION_NAMES,
  PREPARED_NEW_LANDS_REGION_NAMES,
  getClockwiseLayerCoordinates,
  getLayerMapCount,
  formatNewLandsRegionId,
  getActivationOrdinalForLayerPosition,
  parseNewLandsRegionId,
  getNewLandsRegionName,
  getRegionAtActivationOrdinal,
  createInitialExpansionState,
  normalizeExpansionState,
  buildActivationEventId,
  planThresholdActivation,
  finalizePendingActivation,
  rollbackPendingActivation,
});
