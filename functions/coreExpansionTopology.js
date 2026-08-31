"use strict";

const CORE_RADIUS = 2;
const CORE_MAP_COUNT = 25;
const FIRST_LAYER_MAP_COUNT = 24;
const NEW_LANDS_CITY_CAPACITY = 40;
const EXPANSION_THRESHOLD_NPC_CITIES = 20;
const EXPANSION_ACTIVATION_BATCH_SIZE = 2;
const TOPOLOGY_VERSION = "core-expansion-v1";

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
  for (let x = -radius; x <= radius; x += 1) {
    coordinates.push({ gridX: x, gridY: -radius });
  }
  for (let y = -radius + 1; y <= radius; y += 1) {
    coordinates.push({ gridX: radius, gridY: y });
  }
  for (let x = radius - 1; x >= -radius; x -= 1) {
    coordinates.push({ gridX: x, gridY: radius });
  }
  for (let y = radius - 1; y > -radius; y -= 1) {
    coordinates.push({ gridX: -radius, gridY: y });
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

function getRegionAtActivationOrdinal(ordinal = 0) {
  let remaining = Math.max(0, integer(ordinal));
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
    schemaVersion: 1,
    topologyVersion: TOPOLOGY_VERSION,
    resetGeneration: String(resetGeneration || ""),
    activeRegionIds: Object.freeze([first.id]),
    admittingRegionIds: Object.freeze([first.id]),
    nextActivationOrdinal: 1,
    activationReceipts: Object.freeze({}),
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
  return {
    schemaVersion: 1,
    topologyVersion: TOPOLOGY_VERSION,
    resetGeneration: String(state.resetGeneration || ""),
    activeRegionIds,
    admittingRegionIds,
    nextActivationOrdinal: Math.max(activeRegionIds.length, integer(state.nextActivationOrdinal, activeRegionIds.length)),
    activationReceipts: state.activationReceipts && typeof state.activationReceipts === "object"
      ? { ...state.activationReceipts }
      : {},
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

  const activatedRegions = [];
  let nextActivationOrdinal = current.nextActivationOrdinal;
  while (activatedRegions.length < EXPANSION_ACTIVATION_BATCH_SIZE) {
    const candidate = getRegionAtActivationOrdinal(nextActivationOrdinal);
    nextActivationOrdinal += 1;
    if (current.activeRegionIds.includes(candidate.id)) continue;
    activatedRegions.push(candidate);
  }
  const activatedIds = activatedRegions.map(region => region.id);
  const next = {
    ...current,
    activeRegionIds: [...current.activeRegionIds, ...activatedIds],
    admittingRegionIds: [
      ...current.admittingRegionIds.filter(regionId => regionId !== source),
      ...activatedIds,
    ],
    nextActivationOrdinal,
    activationReceipts: {
      ...current.activationReceipts,
      [eventId]: {
        sourceRegionId: source,
        remainingNpcCities: EXPANSION_THRESHOLD_NPC_CITIES,
        activatedRegionIds: activatedIds,
        nextActivationOrdinal,
      },
    },
    revision: current.revision + 1,
  };
  return Object.freeze({
    changed: true,
    reason: "threshold-activated",
    eventId,
    state: Object.freeze(next),
    activatedRegions: Object.freeze(activatedRegions),
  });
}

module.exports = Object.freeze({
  CORE_RADIUS,
  CORE_MAP_COUNT,
  FIRST_LAYER_MAP_COUNT,
  NEW_LANDS_CITY_CAPACITY,
  EXPANSION_THRESHOLD_NPC_CITIES,
  EXPANSION_ACTIVATION_BATCH_SIZE,
  TOPOLOGY_VERSION,
  getClockwiseLayerCoordinates,
  getLayerMapCount,
  formatNewLandsRegionId,
  getRegionAtActivationOrdinal,
  createInitialExpansionState,
  normalizeExpansionState,
  buildActivationEventId,
  planThresholdActivation,
});
