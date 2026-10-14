"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
function source(text, name, indent = "") {
  const start = text.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, name);
  const end = start + text.slice(start).search(new RegExp(`^${indent}}\\r?$`, "m")) + indent.length + 1;
  return text.slice(start, end);
}

let scope = "ruler:october:shard:1", rows = [], calls = 0, request;
const warnings = [];
const regions = ["home", "lost", "unvisited"];
const context = {
  console: { warn: (...args) => warnings.push(args) },
  Date, Map, Set,
  ONLINE_OWNED_CITIES_REFRESH_MS: 15000,
  ONLINE_OWNED_CITIES_LOOKUP_TIMEOUT_MS: 15000,
  onlineIslandSummaries: new Map(), onlineIslandSummaryRefreshInFlight: false,
  onlineIslandSummaryRefreshAt: 0,
  onlineOwnedCitiesCache: [], onlineOwnedCitiesCacheComplete: false, onlineOwnedCitiesCacheAt: 1,
  onlineCitiesLoaded: true,
  state: { cities: [{ id: "home-city", regionId: "home", owner: "player", ownerUid: "ruler" }] },
  stats: { updatedAtMs: 1, totalCities: 2, cityCountsByRegion: { home: 1, lost: 1 } },
  normalizeRegionId: id => id,
  getRegionIds: () => regions,
  getOnlineIslandId: id => "october--shard--" + id,
  getActiveMapRegionId: () => "home",
  getActiveOnlineRegionId: () => "home",
  getCurrentOnlineUid: () => "ruler",
  getOnlineSessionRequestScope: () => scope,
  getGlobalStatsSnapshot: () => context.stats,
  hasUsableGlobalStats: stats => !!stats,
  CORE_EXPANSION_TOPOLOGY_ACTIVE: true,
  REGION_CATALOG_RUNTIME: require(path.join(root, "region-catalog.js")),
  REGION_CATALOG_SUMMARIES_BY_ID: new Map(regions.map(id => [id, { id }])),
  WORLD_REGION_IDS: regions,
  cleanEditorRegionId: id => String(id || "").toLowerCase(),
  getPlayableBaseCityById: () => null,
  getDynamicNewLandsCityIdentity: () => null,
  getCityRegionId: city => city.regionId,
  isStronghold: city => city.kind === "stronghold",
  getRegularCityCapacity: () => 100,
  getNeutralCityCountFromSummary: () => 99,
  playerRegularCities: () => context.state.cities.filter(city => city.owner === "player" && city.kind !== "stronghold"),
  getCityRecordOwnership: city => city,
  formatNumber: String,
  rerenderIslandSwitcherModalIfOpen: () => { context.renders++; },
  renders: 0,
  withTimeout: promise => promise,
  normalizeOwnedCitySnapshot: city => city.id && regions.includes(city.regionId) ? city : null,
  getOnlineApi: () => ({ isSignedIn: () => true, loadOwnedCitiesAcrossIslands: (ids, options) => {
    calls++;
    assert.deepEqual(Array.from(ids), regions.map(id => "october--shard--" + id));
    assert.equal(options.serverOnly, true);
    return request ? request() : Promise.resolve(rows);
  } }),
};
vm.createContext(context);
for (const name of ["getKnownCityId", "getOwnedCityCacheKey", "getGlobalOwnedCityCountByRegion", "getOwnedRegularCityCountsByRegionForDisplay",
  "getOwnedRegularCityCountForDisplay", "getIslandSwitcherSummary", "summarizeIslandOccupancy",
  "cacheIslandOccupancySummary", "getIslandOccupancySummary", "updateIslandSummariesFromOwnedCityCache",
  "refreshOnlineIslandSummaries"]) vm.runInContext(source(game, name), context);

async function main() {
  // Active server city records override a stale positive or zero aggregate.
  context.state.cities = [];
  assert.equal(context.getIslandSwitcherSummary("home"), "Your cities: 0");
  context.state.cities = [{ id: "home-city", regionId: "home", owner: "player", ownerUid: "ruler", ownerKind: "player" }];
  context.stats.cityCountsByRegion.home = 0;
  assert.equal(context.getIslandSwitcherSummary("home"), "Your cities: 1");

  // An old visited-map object cannot resurrect a holding omitted by the roster.
  context.state.cities.push({ id: "old-city", regionId: "lost", owner: "player" });
  assert.equal(context.getOwnedRegularCityCountsByRegionForDisplay().get("lost"), undefined);
  context.onlineIslandSummaries.set("lost", { ownCityCount: 1 });
  context.onlineOwnedCitiesCacheComplete = true;
  context.updateIslandSummariesFromOwnedCityCache();
  assert.equal(context.getIslandSwitcherSummary("lost"), "Your cities: 0");

  // Opaque Core IDs must retain their canonical map while it is unloaded.
  const offMapCity = { id: "core_0123456789abcdef01", regionId: "unvisited", ownerUid: "ruler" };
  assert.equal(context.getKnownCityId(offMapCity.id), "");
  context.onlineOwnedCitiesCache = [offMapCity];
  context.updateIslandSummariesFromOwnedCityCache();
  assert.equal(context.getIslandSwitcherSummary("unvisited"), "Your cities: 1");
  context.onlineOwnedCitiesCache = [];
  context.onlineOwnedCitiesCacheComplete = false;

  // A fresh server roster resolves off-map losses even if aggregate totals lag.
  // Recent cache summaries must not suppress the first server-only lookup.
  regions.forEach(id => context.onlineIslandSummaries.set(id, { ownCityCount: 1, ownedCitiesVerifiedAtMs: Date.now() - 1 }));
  rows = [{ id: "home-city", regionId: "home", ownerUid: "ruler" },
    { id: "lost_stronghold", regionId: "lost", ownerUid: "ruler", kind: "stronghold" }];
  assert.equal(await context.refreshOnlineIslandSummaries(), true);
  assert.equal(calls, 1);
  assert.equal(context.getIslandSwitcherSummary("lost"), "Your cities: 0");
  assert.equal(context.getIslandSwitcherSummary("unvisited"), "Your cities: 0");
  context.onlineOwnedCitiesCache = [{ id: "lost_stale", regionId: "lost", ownerUid: "ruler" }];
  context.onlineOwnedCitiesCacheComplete = true;
  context.updateIslandSummariesFromOwnedCityCache();
  assert.equal(context.getIslandSwitcherSummary("lost"), "Your cities: 0", "An older roster revived a cleared count.");
  context.onlineOwnedCitiesCache = [];
  context.onlineOwnedCitiesCacheComplete = false;
  assert.equal(await context.refreshOnlineIslandSummaries(), true);
  assert.equal(calls, 1, "Repeated opens inside the freshness window repeated the query.");

  // A newer aggregate can update an off-map count while the Atlas stays open.
  context.stats.updatedAtMs = Date.now() + 1;
  assert.equal(context.getIslandSwitcherSummary("lost"), "Your cities: 1");
  context.stats.updatedAtMs = 1;

  // A successful empty query is definitive. Errors and malformed rows are not.
  rows = [];
  assert.equal(await context.refreshOnlineIslandSummaries(true), true);
  assert.equal(context.getIslandSwitcherSummary("lost"), "Your cities: 0");
  const snapshot = JSON.stringify([...context.onlineIslandSummaries]);
  for (const invalid of [null, [{ id: "unknown", regionId: "outside", ownerUid: "ruler" }],
    [{ id: "lost_foreign", regionId: "lost", ownerUid: "someone-else" }],
    [{ id: "lost_dup", regionId: "lost", ownerUid: "ruler" }, { id: "lost_dup", regionId: "lost", ownerUid: "ruler" }]]) {
    rows = invalid;
    assert.equal(await context.refreshOnlineIslandSummaries(true), false);
    assert.equal(JSON.stringify([...context.onlineIslandSummaries]), snapshot);
  }
  request = () => Promise.reject(Error("offline"));
  assert.equal(await context.refreshOnlineIslandSummaries(true), false);
  assert.equal(JSON.stringify([...context.onlineIslandSummaries]), snapshot);

  // Concurrent opens coalesce, newer city updates win, and old sessions cannot write.
  let finish;
  request = () => new Promise(resolve => { finish = resolve; });
  let pending = context.refreshOnlineIslandSummaries(true);
  const callCount = calls;
  assert.equal(await context.refreshOnlineIslandSummaries(true), false);
  assert.equal(calls, callCount);
  context.onlineIslandSummaries.set("lost", { ownCityCount: 2, ownedCitiesVerifiedAtMs: Date.now() + 2 });
  finish([]);
  await pending;
  assert.equal(context.getIslandSwitcherSummary("lost"), "Your cities: 2");
  pending = context.refreshOnlineIslandSummaries(true);
  scope += ":new-session";
  context.onlineIslandSummaries = new Map();
  context.onlineIslandSummaryRefreshInFlight = true;
  finish(rows = []);
  assert.equal(await pending, false);
  assert.equal(context.onlineIslandSummaries.size, 0);
  assert.equal(context.onlineIslandSummaryRefreshInFlight, true, "Old request reset a new session's in-flight flag.");

  // The connector must really use the server read, not persistent offline cache.
  let ordinaryReads = 0, serverReads = 0;
  const doc = { id: "city", data: () => ({ ownerUid: "ruler", regionId: "stale-region" }), ref: { parent: { parent: { id: "canonical-island" } } } };
  const firestore = {
    collectionGroup: () => "cities", query: (...args) => args, where: (...args) => args,
    getDocs: async () => { ordinaryReads++; return { docs: [doc] }; },
    getDocsFromServer: async () => { serverReads++; return { docs: [] }; },
  };
  const connector = { init: async () => {}, requireSignedIn: () => "ruler",
    RESET_GENERATION: "october", ONLINE_WORLD_ID: "world", getRealmShardQueryConstraints: () => [],
    client: { db: {}, modules: { firestore } } };
  vm.createContext(connector);
  vm.runInContext(source(clientSource, "loadOwnedCitiesAcrossIslands", "  "), connector);
  assert.equal((await connector.loadOwnedCitiesAcrossIslands([]))[0].islandId, "canonical-island");
  assert.equal((await connector.loadOwnedCitiesAcrossIslands([], { serverOnly: true })).length, 0);
  assert.equal(ordinaryReads, 1); assert.equal(serverReads, 1);
  firestore.getDocsFromServer = async () => { throw Error("server unreachable"); };
  await assert.rejects(connector.loadOwnedCitiesAcrossIslands([], { serverOnly: true }), /server unreachable/);
  assert.equal(ordinaryReads, 1, "Failed server lookup fell back to stale cache.");
  console.log("Validated map counts after loss/capture, empty and partial rosters, stale visited maps/aggregates, server-only reads, bounded refresh and session/race guards.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
