"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  let depth = 0, end = source.indexOf("(", start);
  do { if (source[end] === "(") depth++; if (source[end] === ")") depth--; end++; } while (depth);
  end = source.indexOf("{", end); depth = 0;
  do { if (source[end] === "{") depth++; if (source[end] === "}") depth--; end++; } while (depth);
  return source.slice(start, end);
}
const identity = { worldId: "current-core", resetGeneration: "current-season", realmShardId: "shared" };
const context = vm.createContext({
  RESET_GENERATION: identity.resetGeneration, ONLINE_WORLD_ID: identity.worldId,
  GLOBAL_PLAYER_STATS_VERSION: 11, KING_POWER_ARMY_TROOP_VALUE: 2,
  safeString: (value, max) => String(value ?? "").slice(0, max),
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  getOwnerUid: value => value.ownerUid,
  getCityEntryIslandId: entry => entry.city.islandId,
  getOnlineIslandId: () => "current-island",
  isCurrentWorldIslandId: value => value === "current-island",
  getRegionIdFromOnlineIslandId: () => "core", normalizeRegionId: value => value,
  getCurrentRealmShardId: () => identity.realmShardId,
  REALM_TOPOLOGY: { normalizeRealmShardId: value => value },
  isHoldingTowerWorldActive: () => true,
  getOwnedStrongholdBonuses: () => ({}), normalizeItemEffects: () => ({}),
  getStaticActiveServerRegionIds: () => new Set(["core"]),
  getCityProductionStats: () => ({}),
  getCityInfrastructurePowerComponents: () => ({ replacementPower: 100, defensivePower: 20, sustainableTroopPerHour: 10 }),
  isStronghold: () => false, clampCityLevel: () => 1,
  isCurrentWorldArmy: army => army.worldId === identity.worldId && army.resetGeneration === identity.resetGeneration,
  getObjectiveTroopDefenseBonusPercent: () => 0,
  normalizeCharacterProgress: () => ({level: 1}),
  FieldValue: { serverTimestamp: () => null },
});
const functions = ["getTroopKingPower", "getArmyStatsKey", "getTotalMilitaryTroopsFromGlobalStats", "getProfileTowerGarrisonTroops", "createGlobalStatsSnapshot"];
vm.runInContext(functions.map(name => extract(server, name)).join("\n"), context);
function snapshot({ city = 1000, tower = 0, marching = 0, rally = 0, reinforcement = 0, profile = {}, extraArmies = [] } = {}) {
  return context.createGlobalStatsSnapshot({
    uid: "owner", nowMs: 12345,
    profile: { ...identity, towerGarrisonTroops: tower, towerGarrisonResetGeneration: identity.resetGeneration,
      committedRallyTroops: rally, rallyResetGeneration: identity.resetGeneration,
      stationedReinforcementTroops: reinforcement, reinforcementResetGeneration: identity.resetGeneration, ...profile },
    cityEntries: [{city: {ownerUid: "owner", islandId: "current-island", regionId: "core", troops: city}}],
    activeArmies: [{...identity, id: "march", status: "active", ownerUid: "owner", troops: marching}, ...extraArmies],
  });
}
const base = snapshot();
const stationed = snapshot({city: 600, tower: 400});
assert.equal(stationed.kingPower, base.kingPower, "Stationing troops in a Clan Tower must not remove their King Power.");
assert.equal(stationed.totalTowerTroops, 400);
assert.equal(stationed.towerTroopPower, 800);
assert.equal(stationed.totalMilitaryTroops, 1000);
assert.equal(stationed.stationedTroopPower, 2000);
for (const step of [
  {city: 600, marching: 400}, // City -> Tower.
  {city: 600, tower: 250, marching: 150}, // Tower -> city or attack.
  {city: 750, tower: 250}, // Withdrawal arrival.
  {city: 600, tower: 250, rally: 150, extraArmies: [{...identity, id: "rally", ownerUid: "owner", status: "active", rallyAttack: true, troops: 150}]},
  {city: 600, reinforcement: 150, tower: 250},
]) assert.equal(snapshot(step).kingPower, base.kingPower, "Moving an army must count each troop exactly once.");
assert.equal(snapshot({city: 600, tower: 300}).kingPower, base.kingPower - 200, "Only real casualties reduce army power.");
assert.equal(snapshot({city: 600, tower: 0, marching: 400}).kingPower, base.kingPower, "Clan departure preserves returning troops.");
for (const profile of [
  {towerGarrisonResetGeneration: "archived"}, {towerGarrisonResetGeneration: ""},
  {worldId: "archived"}, {resetGeneration: "archived"}, {realmShardId: "other"},
]) assert.equal(snapshot({tower: 400, profile}).kingPower, base.kingPower, "Archived or foreign Tower troops must not contribute.");
context.isHoldingTowerWorldActive = () => false;
assert.equal(snapshot({tower: 400}).kingPower, base.kingPower, "Inactive topology must ignore Tower counters.");
context.isHoldingTowerWorldActive = () => true;
for (const tower of [-1, NaN, Infinity]) assert.equal(snapshot({tower}).totalTowerTroops, 0);
assert.equal(snapshot({tower: 4.9}).totalTowerTroops, 4);
assert.equal(snapshot({tower: Number.MAX_SAFE_INTEGER}).armyPower, Number.MAX_SAFE_INTEGER);

const display = vm.createContext({client: {user: {uid: "owner"}}, state: {gold: 10},
  hasUsableGlobalStats: () => true, KING_POWER_AUTHORITY_VERSION: 11,
  getCurrentOnlineUid: () => "owner", normalizeRegionId: value => value,
  getKnownCityId: value => value || "", getRegionIdFromOnlineIslandId: () => "core",
  normalizeTimestampMs: value => Number(value) || 0,
  normalizePowerValue: value => Math.max(0, Math.floor(Number(value) || 0))});
vm.runInContext([extract(client, "timestampToMs"), extract(client, "cleanGlobalStats"), extract(game, "normalizeGlobalStatsSnapshot"), extract(game, "getKingdomSummary")].join("\n"), display);
const cleaned = display.normalizeGlobalStatsSnapshot(display.cleanGlobalStats(stationed));
assert.equal(cleaned.totalTowerTroops, 400);
display.getGlobalStatsSnapshot = () => cleaned;
assert.equal(display.getKingdomSummary().troops, 1000, "The profile troop total must include the player's Tower troops.");
assert.equal(display.getKingdomSummary().kingPower, base.kingPower);
const deployedRally = display.normalizeGlobalStatsSnapshot(display.cleanGlobalStats(snapshot({city: 600, tower: 200, rally: 100, reinforcement: 100})));
display.getGlobalStatsSnapshot = () => deployedRally;
assert.equal(display.getKingdomSummary().troops, 1000, "Tower-origin rally troops and reinforcements remain in the profile total.");
console.log("Clan Tower King Power passed: conservation, personal attribution, current realm/generation, casualties, safe counts, and client totals.");
