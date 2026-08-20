"use strict";

const COMMON_GEAR = require("./functions/common-gear.js");

const CONTRACT_VERSION = 2;

const PERSISTENT_PLAYER_FIELDS = Object.freeze([
  "flag",
  "gear",
  "clanId",
  "clanName",
  "clanTag",
  "clanRole",
]);

const CONSUMABLE_FIELDS = Object.freeze([
  "shopItems",
  "itemEffects",
  "itemPurchaseCooldowns",
  "commonGearBoxes",
  "lastOpenRequestId",
  "lastOpenReceipt",
  "shopPurchase",
]);

const SEASONAL_WORLD_FIELDS = Object.freeze([
  "worldId",
  "resetGeneration",
  "mainIslandId",
  "mainRegionId",
  "mainCityId",
  "cities",
  "attacks",
  "rallies",
  "reinforcements",
  "harvestBonuses",
  "scoutReports",
  "battleReports",
  "daily",
  "dailyLoginReward",
  "gold",
  "goldFloat",
  "character",
  "upgrades",
  "skillPresets",
  "seasonalAchievements",
  "objectiveProgress",
  "regionActivation",
  "placement",
]);

const PERSISTENT_GEAR_FIELDS = Object.freeze([
  "schemaVersion",
  "instances",
  "equipped",
]);

const PERSISTENT_GEAR_INSTANCE_FIELDS = Object.freeze([
  "instanceId",
  "gearKey",
  "buildingId",
  "slot",
  "rarity",
  "level",
  "acquiredAtMs",
  "upgradedAtMs",
]);

const CLAN_PERSISTENT_PATHS = Object.freeze([
  "clans/{clanId}",
  "clans/{clanId}/members/{uid}",
  "players/{uid}.clanId",
  "players/{uid}.clanRole",
]);

const CLAN_SEASONAL_PATHS = Object.freeze([
  "clans/{clanId}/rallies/*",
  "clans/{clanId}/rallyState/{resetGeneration}",
  "clans/{clanId}/worldBenefits/{resetGeneration}",
  "clans/{clanId}/questProgress/*",
  "clans/{clanId}/giftActivity/{resetGeneration}",
  "clanLeaderboards/{resetGeneration}/entries/{clanId}",
]);

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function extractPersistentPlayerProgression(profile = {}) {
  const persistent = {};
  for (const field of PERSISTENT_PLAYER_FIELDS) {
    if (field === "gear") continue;
    if (profile[field] !== undefined) persistent[field] = cloneJson(profile[field]);
  }
  persistent.gear = extractPersistentCommonGear(profile.gear);
  return persistent;
}

function extractPersistentCommonGear(rawGear = {}) {
  const normalized = COMMON_GEAR.normalizeState(rawGear);
  const instances = Object.fromEntries(Object.entries(normalized.instances).map(([instanceId, instance]) => [
    instanceId,
    Object.fromEntries(PERSISTENT_GEAR_INSTANCE_FIELDS.map(field => [field, cloneJson(instance[field])])),
  ]));
  return {
    schemaVersion: normalized.schemaVersion,
    instances,
    equipped: cloneJson(normalized.equipped),
  };
}

function validatePersistentCommonGear(gear = {}) {
  const errors = [];
  const keys = Object.keys(gear || {});
  for (const key of keys) {
    if (!PERSISTENT_GEAR_FIELDS.includes(key)) errors.push(`gear.${key} is not on the reset allowlist.`);
  }
  if (gear.schemaVersion !== COMMON_GEAR.SCHEMA_VERSION) errors.push("Common Gear schema version is invalid.");
  if (!gear.instances || typeof gear.instances !== "object" || Array.isArray(gear.instances)) {
    errors.push("Common Gear instances are missing.");
  }
  if (!gear.equipped || typeof gear.equipped !== "object" || Array.isArray(gear.equipped)) {
    errors.push("Equipped Common Gear is missing.");
  }
  const instances = gear.instances && typeof gear.instances === "object" ? gear.instances : {};
  for (const instance of Object.values(instances)) {
    if (instance?.rarity !== COMMON_GEAR.RARITY) errors.push("Only Common Gear instances may persist.");
    for (const key of Object.keys(instance || {})) {
      if (!PERSISTENT_GEAR_INSTANCE_FIELDS.includes(key)) errors.push(`Common Gear instance field ${key} is not on the reset allowlist.`);
    }
  }
  for (const slots of Object.values(gear.equipped && typeof gear.equipped === "object" ? gear.equipped : {})) {
    for (const instanceId of Object.values(slots && typeof slots === "object" ? slots : {})) {
      if (instanceId && !instances[instanceId]) errors.push(`Equipped Common Gear ${instanceId} is not owned.`);
    }
  }
  return errors;
}

function validatePersistentPayload(payload = {}) {
  const errors = [];
  for (const field of CONSUMABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) errors.push(`${field} is a seasonal consumable field.`);
  }
  for (const field of SEASONAL_WORLD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) errors.push(`${field} is seasonal/world state.`);
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "flag")) errors.push("Persistent reset payload is missing flag.");
  if (!Object.prototype.hasOwnProperty.call(payload, "gear")) errors.push("Persistent reset payload is missing Common Gear.");
  else errors.push(...validatePersistentCommonGear(payload.gear));
  if (!Object.prototype.hasOwnProperty.call(payload, "clanId")) errors.push("Persistent reset payload is missing clan membership identity.");
  return errors;
}

module.exports = Object.freeze({
  CONTRACT_VERSION,
  PERSISTENT_PLAYER_FIELDS,
  CONSUMABLE_FIELDS,
  SEASONAL_WORLD_FIELDS,
  PERSISTENT_GEAR_FIELDS,
  PERSISTENT_GEAR_INSTANCE_FIELDS,
  CLAN_PERSISTENT_PATHS,
  CLAN_SEASONAL_PATHS,
  extractPersistentPlayerProgression,
  extractPersistentCommonGear,
  validatePersistentCommonGear,
  validatePersistentPayload,
});
