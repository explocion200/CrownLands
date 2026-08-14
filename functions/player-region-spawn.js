"use strict";

const PLAYER_REGION_CITY_CAPACITY = 40;
const MINIMUM_NPC_CITIES_FOR_SPAWN = 15;
const DIRECTIONS = Object.freeze({
  north: Object.freeze({ opposite: "south" }),
  east: Object.freeze({ opposite: "west" }),
  south: Object.freeze({ opposite: "north" }),
  west: Object.freeze({ opposite: "east" }),
});

function cleanId(value) {
  return String(value || "").trim();
}

function isStructurallyEligiblePlayerRegion(region = {}, regions = []) {
  if (cleanId(region.purpose).toLowerCase() !== "player_region") return false;
  if (region.permanentCore === true) return false;
  if (cleanId(region.lifecycle).toLowerCase() !== "active") return false;

  const regionsById = new Map((Array.isArray(regions) ? regions : [])
    .map(entry => [cleanId(entry?.id), entry])
    .filter(([id]) => id));
  for (const [side, direction] of Object.entries(DIRECTIONS)) {
    const connection = region.connections?.[side];
    if (!connection || !["open", "gated"].includes(connection.state)) return false;
    const targetRegionId = cleanId(connection.targetRegionId);
    if (connection.state === "gated") {
      if (targetRegionId) return false;
      continue;
    }
    const neighbor = regionsById.get(targetRegionId);
    if (!neighbor) return false;
    const reciprocal = neighbor.connections?.[direction.opposite];
    if (reciprocal?.state !== "open" || cleanId(reciprocal.targetRegionId) !== cleanId(region.id)) {
      return false;
    }
  }
  return true;
}

function countAuthoritativeNpcCities({
  cityOwnershipState = [],
  regularCityIds = [],
  resetGeneration = "",
} = {}) {
  const allowedIds = new Set((Array.isArray(regularCityIds) ? regularCityIds : [])
    .map(cleanId)
    .filter(Boolean));
  const requiredGeneration = cleanId(resetGeneration);
  return (Array.isArray(cityOwnershipState) ? cityOwnershipState : []).filter(city => {
    const cityId = cleanId(city?.id);
    if (!cityId || (allowedIds.size && !allowedIds.has(cityId))) return false;
    if (requiredGeneration && cleanId(city?.resetGeneration) !== requiredGeneration) return false;
    if (city?.kind === "stronghold" || city?.isStronghold === true || cleanId(city?.strongholdType)) return false;
    return !cleanId(city?.ownerUid);
  }).length;
}

function derivePlayerRegionSpawnEligibility({
  region = {},
  regions = [],
  cityOwnershipState = [],
  regularCityIds = [],
  resetGeneration = "",
  ownershipStateAuthoritative = false,
  minimumNpcCitiesForSpawn = MINIMUM_NPC_CITIES_FOR_SPAWN,
} = {}) {
  const minimumNpcCities = Math.max(
    MINIMUM_NPC_CITIES_FOR_SPAWN,
    Math.floor(Number(minimumNpcCitiesForSpawn) || MINIMUM_NPC_CITIES_FOR_SPAWN),
  );
  const topologyValid = isStructurallyEligiblePlayerRegion(region, regions);
  const currentNpcCityCount = ownershipStateAuthoritative
    ? countAuthoritativeNpcCities({ cityOwnershipState, regularCityIds, resetGeneration })
    : 0;
  const reasons = [];
  if (cleanId(region.purpose).toLowerCase() !== "player_region") reasons.push("not_player_region");
  if (region.permanentCore === true) reasons.push("permanent_core");
  if (cleanId(region.lifecycle).toLowerCase() !== "active") reasons.push("not_active");
  if (!topologyValid) reasons.push("invalid_topology");
  if (!ownershipStateAuthoritative) reasons.push("ownership_state_not_authoritative");
  if (ownershipStateAuthoritative && currentNpcCityCount < minimumNpcCities) reasons.push("npc_city_threshold");
  const spawnEligible = reasons.length === 0;
  return Object.freeze({
    regionId: cleanId(region.id),
    spawnEligible,
    spawnReady: spawnEligible,
    currentNpcCityCount,
    minimumNpcCitiesForSpawn: minimumNpcCities,
    ownershipStateAuthoritative: ownershipStateAuthoritative === true,
    topologyValid,
    reasons: Object.freeze(reasons),
  });
}

module.exports = Object.freeze({
  PLAYER_REGION_CITY_CAPACITY,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
  DIRECTIONS,
  isStructurallyEligiblePlayerRegion,
  countAuthoritativeNpcCities,
  derivePlayerRegionSpawnEligibility,
});
