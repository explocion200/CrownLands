"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const controller = fs.readFileSync(path.join(root, "instant-economy-actions.js"), "utf8");
function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const end = start + source.slice(start).search(/^}\r?$/m) + 1;
  return source.slice(start, end);
}

// Execute the real identity, normalization, cache, ordering, and upgrade helpers
// together: a permissive getKnownCityId stub hides unloaded-map regressions.
const regions = ["core-v2-home", "core-v2-north", "core-v2-east", "core-v2-west", "core-v2-south"];
const roster = Array.from({ length: 42 }, (_, index) => ({
  id: `core_${index.toString(16).padStart(18, "0")}`,
  islandId: `main-realm-2026-09--shard_0001--${regions[index % regions.length]}`,
  regionId: regions[index % regions.length],
  ownerUid: "fixture-player",
  owner: "player",
  name: `City ${index + 1}`,
  level: 10 + index,
  troops: 100,
}));
let armies = [];
const context = {
  console,
  CORE_EXPANSION_TOPOLOGY_ACTIVE: true,
  REGION_CATALOG_RUNTIME: require(path.join(root, "region-catalog.js")),
  REGION_CATALOG_SUMMARIES_BY_ID: new Map(regions.map(id => [id, { id }])),
  WORLD_REGION_IDS: regions,
  state: { cities: [roster[0]], mainCityId: roster[0].id, playerName: "Fixture" },
  onlineOwnedCitiesCache: [],
  onlineOwnedCitiesCacheComplete: false,
  onlineOwnedCitiesCacheAt: 0,
  cityListSessionOrderKeys: [],
  localDirtyCityIds: new Set(),
  cleanEditorRegionId: id => String(id || "").toLowerCase(),
  normalizeRegionId: id => regions.includes(id) ? id : regions[0],
  getPlayableBaseCityById: () => null,
  getDynamicNewLandsCityIdentity: () => null,
  getRegionIdFromOnlineIslandId: id => id.split("--")[2] || "",
  getOnlineIslandId: id => `main-realm-2026-09--shard_0001--${id}`,
  getCurrentOnlineUid: () => "fixture-player",
  getActiveMapRegionId: () => regions[0],
  getCityRegionId: city => city?.regionId || regions[0],
  cityById: id => context.state.cities.find(city => city.id === id),
  playerCities: () => context.state.cities.filter(city => city.owner === "player"),
  resolvePlayerIdentityForUid: () => null,
  getCityTroopFallback: () => 0,
  getCanonicalCityName: (base, raw) => raw.name,
  normalizePowerValue: value => Number(value) || 0,
  normalizeTimestampMs: value => Number(value) || 0,
  readCityTroops: value => Number(value) || 0,
  readCityTroopFloat: value => Number(value) || 0,
  clampCityLevel: value => Math.max(1, Number(value) || 1),
  isStronghold: city => city?.kind === "stronghold",
  getStrongholdVisualSize: () => 1,
  getStrongholdDefenseLevel: city => city.level,
  getGlobalStatsSnapshot: () => ({ totalCities: roster.length }),
  hasUsableGlobalStats: () => true,
  normalizeSingleMainCityAssignment() {},
  updateIslandSummariesFromOwnedCityCache() {},
  updateOutgoingAttackUi() {},
  getRenderableArmies: () => armies,
};
vm.createContext(context);
for (const name of [
  "getKnownCityId", "normalizeOwnedCitySnapshot", "getOwnedCityCacheKey",
  "getOwnedCityRosterCompletenessIssues", "validateCompleteOwnedCityRoster",
  "mergeOwnedCitySnapshots", "getAllOwnedCitiesForDisplay",
  "getOwnedCitySnapshotById", "getOwnedCitySnapshotForUpgrade",
  "getCityListRowKey", "resetCityListSessionOrder", "reconcileCityListSessionOrder",
  "applyServerCityUpdateToOwnedCache", "getIncomingUpgradeBlockers",
]) vm.runInContext(functionSource(game, name), context);
vm.runInContext(functionSource(controller, "getCityUpgradeActionKey"), context);

const verified = context.validateCompleteOwnedCityRoster(roster);
assert.equal(verified.complete, true, verified.error);
context.mergeOwnedCitySnapshots(verified.cities, { complete: true });
assert.equal(context.onlineOwnedCitiesCacheComplete, true);
assert.equal(context.getAllOwnedCitiesForDisplay().length, 42, "Unloaded cities collapsed in the cache.");
assert.equal(context.getKnownCityId(roster[1].id), "", "An opaque ID without a map must remain unverified.");
assert.equal(context.getKnownCityId(roster[1].id, "unknown-region"), "");

for (const city of roster) {
  const key = `${city.regionId}:${city.id}`;
  assert.equal(context.getOwnedCityCacheKey(city), key);
  assert.equal(context.getCityListRowKey(city), key);
  assert.equal(context.getCityUpgradeActionKey(city.id, city.regionId), key);
  assert.equal(context.getCityUpgradeActionKey(city), key);
  assert.equal(context.getOwnedCitySnapshotForUpgrade(city.id, city.regionId)?.level, city.level);
}
const initialOrder = context.reconcileCityListSessionOrder(context.getAllOwnedCitiesForDisplay());
assert.equal(initialOrder.length, 42);
assert.deepEqual(
  Array.from(context.reconcileCityListSessionOrder([...initialOrder].reverse()), city => city.id),
  Array.from(initialOrder, city => city.id),
  "Automatic refresh changed cross-map row positions or pages."
);

const offMap = roster[1];
assert.equal(context.applyServerCityUpdateToOwnedCache({
  id: offMap.id, regionId: offMap.regionId, ownerUid: offMap.ownerUid, level: 60,
}), true);
assert.equal(context.getOwnedCitySnapshotForUpgrade(offMap.id, offMap.regionId).level, 60);
assert.equal(context.state.cities[0].level, roster[0].level, "An off-map confirmation changed the active city.");
const sameIdElsewhere = { ...offMap, regionId: regions[2], islandId: context.getOnlineIslandId(regions[2]) };
context.mergeOwnedCitySnapshots([sameIdElsewhere]);
assert.notEqual(context.getOwnedCityCacheKey(offMap), context.getOwnedCityCacheKey(sameIdElsewhere));
assert.equal(context.applyServerCityUpdateToOwnedCache({
  id: offMap.id, regionId: offMap.regionId, ownerUid: "different-player",
}), true);
assert.equal(context.getOwnedCitySnapshotForUpgrade(offMap.id, offMap.regionId), null);
assert.equal(context.getOwnedCitySnapshotForUpgrade(sameIdElsewhere.id, sameIdElsewhere.regionId).level, offMap.level);

armies = [{ id: "attack", kind: "attack", toId: offMap.id, targetRegionId: offMap.regionId, owner: "enemy", remaining: 30 }];
assert.equal(context.getIncomingUpgradeBlockers(offMap).length, 1, "An off-map incoming attack did not block upgrading.");
assert.equal(context.getIncomingUpgradeBlockers(sameIdElsewhere).length, 0, "A different map inherited an attack blocker.");
assert.equal(context.validateCompleteOwnedCityRoster(roster.slice(1)).complete, false);
assert.equal(context.validateCompleteOwnedCityRoster([...roster, roster[1]]).complete, false);
assert.equal(context.validateCompleteOwnedCityRoster(roster.map((city, index) => index === 1
  ? { ...city, islandId: city.islandId.replace("shard_0001", "shard_0002") } : city)).complete, false);
const staleMetadata = roster.map((city, index) => index === 1 ? { ...city, regionId: regions[0] } : city);
assert.equal(context.validateCompleteOwnedCityRoster(staleMetadata).complete, true);
assert.equal(context.validateCompleteOwnedCityRoster(staleMetadata).cities[1].regionId, offMap.regionId);
context.mergeOwnedCitySnapshots(roster.filter(city => city.id !== offMap.id), { complete: true });
assert.equal(context.getOwnedCitySnapshotForUpgrade(offMap.id, offMap.regionId), null, "A completed sync retained a lost city.");

// Drive +1, +5, and MAX through the real queue with a simulated authoritative
// response, without loading or switching to the target map.
const requests = [];
const warnings = [];
Object.assign(context, {
  console: { ...console, warn: (...args) => warnings.push(args) },
  SERVER_CITY_UPGRADE_LEVEL_CHUNK: 25,
  verifiedRealmInfo: { capabilities: { instantEconomyActionsVersion: 1, cityUpgradeModesVersion: 1 } },
  selectedSourceId: "",
  SHOP_ITEMS: [],
  goldText: null,
  setTextIfChanged() {},
  window: { setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
  modal: { open: false, classList: { contains: () => false } },
  getCityUpgradeCostAtLevel: () => 100,
  getCityUpgradeReductionPercent: () => 0,
  getCityVfxSnapshot: city => ({ level: city.level }),
  usesServerEconomyAuthority: () => true,
  formatNumber: String,
  formatDuration: String,
  rejectGameAction(message) { throw new Error(message); },
  addLog() {}, showToast() {}, playGameSound() {}, playCityUpgradeAnimation() {}, saveGame() {},
  applyServerEconomyResult(result) {
    context.state.gold = result.currentUser.gold;
    result.cityUpdates.forEach(update => assert.equal(context.applyServerCityUpdateToOwnedCache(update), true));
  },
  getOnlineApi: () => ({ upgradeCity: async request => {
    requests.push(request);
    const city = context.getOwnedCitySnapshotForUpgrade(request.cityId, request.regionId);
    const upgraded = request.mode === "max" ? Math.floor(context.state.gold / 100) : request.levels;
    return {
      upgraded, finalLevel: city.level + upgraded, spentGold: upgraded * 100,
      currentUser: { gold: context.state.gold - upgraded * 100 },
      cityUpdates: [{ id: city.id, regionId: request.regionId, ownerUid: city.ownerUid, level: city.level + upgraded }],
    };
  } }),
});
vm.runInContext(controller, context, { filename: "instant-economy-actions.js" });
const queueValidation = (async () => {
  armies = [];
  for (const [mode, levels, expectedLevels] of [["exact", 1, 1], ["exact", 5, 5], ["max", 0, 6]]) {
    context.mergeOwnedCitySnapshots(roster, { complete: true });
    context.state.gold = 650;
    const before = offMap.level;
    assert.equal(context.upgradeCity(offMap.id, levels, { mode, regionId: offMap.regionId }), true);
    assert.equal(context.getProjectedGold(), 650 - expectedLevels * 100);
    assert.equal(context.getProjectedCityForInstantActions(offMap).level, before + expectedLevels);
    assert.equal(context.getPendingCityUpgradeCount(offMap.id, offMap.regionId), expectedLevels);
    await context.flushInstantEconomyActions();
    assert.equal(requests.at(-1).regionId, offMap.regionId);
    assert.equal(requests.at(-1).cityId, offMap.id);
    assert(requests.at(-1).requestId);
    assert.equal(context.getOwnedCitySnapshotForUpgrade(offMap.id, offMap.regionId).level, before + expectedLevels);
    assert.equal(context.getPendingCityUpgradeCount(offMap.id, offMap.regionId), 0);
    assert.equal(context.state.cities.length, 1, "Upgrade loaded the target map.");
    assert.equal(context.state.cities[0].level, roster[0].level);
  }
  assert.deepEqual(warnings, [], "Cross-map upgrade raised a presentation or settlement warning.");
  console.log("Validated 42 unloaded-map cities, stable rows, +1/+5/MAX submission and settlement, ownership loss, and attack blockers.");
})();
queueValidation.catch(error => { console.error(error); process.exitCode = 1; });
