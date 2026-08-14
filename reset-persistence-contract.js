"use strict";

const CONTRACT_VERSION = 1;

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
    if (profile[field] !== undefined) persistent[field] = cloneJson(profile[field]);
  }
  return persistent;
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
  if (!Object.prototype.hasOwnProperty.call(payload, "clanId")) errors.push("Persistent reset payload is missing clan membership identity.");
  return errors;
}

module.exports = Object.freeze({
  CONTRACT_VERSION,
  PERSISTENT_PLAYER_FIELDS,
  CONSUMABLE_FIELDS,
  SEASONAL_WORLD_FIELDS,
  CLAN_PERSISTENT_PATHS,
  CLAN_SEASONAL_PATHS,
  extractPersistentPlayerProgression,
  validatePersistentPayload,
});
