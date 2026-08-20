"use strict";

const POLICY_VERSION = "core-v2-main-city-policy-v1";

const FORBIDDEN_CORE_MAIN_CITY_REGIONS = Object.freeze({
  "core-v2-crown-citadel-p0-p0": "Crown Citadel",
  "core-v2-greybanner-hold-p0-m1": "Greybanner Hold",
  "core-v2-aurum-keep-m1-p0": "Aurum Keep",
  "core-v2-swiftgate-p1-p0": "Swiftgate",
  "core-v2-ironwatch-p0-p1": "Ironwatch",
});

function normalizeRegionId(value = "") {
  return String(value || "").trim().toLowerCase();
}

function getAuthoritativeCityRegionId(city = {}, fallbackRegionId = "") {
  return normalizeRegionId(
    city.regionId
      || city.startPool
      || city.mapId
      || city.region?.id
      || fallbackRegionId,
  );
}

function getForbiddenMainCityReason(city = {}, fallbackRegionId = "") {
  const regionId = getAuthoritativeCityRegionId(city, fallbackRegionId);
  const objectiveName = FORBIDDEN_CORE_MAIN_CITY_REGIONS[regionId];
  if (!objectiveName) return null;
  return Object.freeze({
    code: "forbidden-core-main-city-region",
    regionId,
    objectiveName,
    message: `A main city cannot be located on the ${objectiveName} Core map.`,
  });
}

function isForbiddenMainCityRegion(regionId = "") {
  return Boolean(FORBIDDEN_CORE_MAIN_CITY_REGIONS[normalizeRegionId(regionId)]);
}

function isEligibleMainCityLocation(city = {}, fallbackRegionId = "") {
  return !getForbiddenMainCityReason(city, fallbackRegionId);
}

module.exports = Object.freeze({
  POLICY_VERSION,
  FORBIDDEN_CORE_MAIN_CITY_REGIONS,
  normalizeRegionId,
  getAuthoritativeCityRegionId,
  getForbiddenMainCityReason,
  isForbiddenMainCityRegion,
  isEligibleMainCityLocation,
});
