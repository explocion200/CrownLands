"use strict";

const CORE_RADIUS = 2;
const CORE_MAP_COUNT = 25;
const FIRST_LAYER_MAP_COUNT = 24;
const NEW_LANDS_CITY_CAPACITY = 40;
const EXPANSION_THRESHOLD_NPC_CITIES = 20;
const EXPANSION_ACTIVATION_BATCH_SIZE = 2;
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
  PREPARED_CORE_REGION_NAMES,
  PREPARED_NEW_LANDS_REGION_NAMES,
  getClockwiseLayerCoordinates,
  getLayerMapCount,
  formatNewLandsRegionId,
  getRegionAtActivationOrdinal,
  createInitialExpansionState,
  normalizeExpansionState,
  buildActivationEventId,
  planThresholdActivation,
});
