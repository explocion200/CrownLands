"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
function extract(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^}`, "m"));
  assert(match, `Missing ${name}`);
  return match[0];
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const calls = [], merges = [];
  const c = {
    state: {}, uid: "owner", ONLINE_WORLD_ID: "main-realm-2026-10",
    RESET_GENERATION: "realm-2026-10", REALM_SHARD_ID: "shard_0001", onlineSessionGeneration: 1,
    onlineOwnedCitiesRefreshInFlight: false, onlineOwnedCitiesCacheComplete: false,
    onlineOwnedCitiesCacheAt: 0, onlineOwnedCitiesRefreshError: "", onlineLastError: "",
    onlineOwnedCitiesRefreshAt: 0, onlineOwnedCitiesRefreshRequested: false,
    onlineOwnedCitiesOwnershipRevision: 0, onlineGlobalStats: null, lastComputedKingPower: 0,
    now: 100000, signedIn: true, document: { hidden: false }, navigator: { onLine: true },
    Date: { now: () => c.now },
    ONLINE_OWNED_CITIES_REFRESH_MS: 10000, ONLINE_OWNED_CITIES_LOOKUP_TIMEOUT_MS: 1000,
    window: { setTimeout, clearTimeout }, console: { warn() {} },
    getCurrentOnlineUid: () => c.uid,
    getRegionIds: () => ["core-v2-home", "core-v2-north"],
    getOnlineIslandId: id => `${c.ONLINE_WORLD_ID}--${c.REALM_SHARD_ID}--${id}`,
    getOnlineApi: () => ({ isSignedIn: () => c.signedIn, loadOwnedCitiesAcrossIslands: (islands, options) => {
      assert.equal(options.serverOnly, true, "Ownership reads must bypass a stale offline cache");
      const call = deferred(); calls.push(call); return call.promise;
    } }),
    playerCities: () => [], getCityRegionId: city => city.regionId,
    validateCompleteOwnedCityRoster: cities => ({ cities, complete: true }),
    mergeOwnedCitySnapshots: (cities, options) => {
      merges.push({ cities, ...options });
      if (options.complete) { c.onlineOwnedCitiesCacheComplete = true; c.onlineOwnedCitiesCacheAt = Date.now(); }
    },
    profileScreen: null,
    modal: { open: true, classList: { contains: name => name === "city-list-modal" } },
    renderHud() {}, renderCityListModal() {}, renderCities() {}, updateIslandSwitcherUi() {},
    normalizeGlobalStatsSnapshot: raw => raw, getGlobalStatsSnapshot: () => c.onlineGlobalStats,
    rememberPlayerIdentity() {},
  };
  vm.createContext(c);
  for (const name of ["getOnlineRequestScope", "getOnlineSessionRequestScope", "withTimeout", "refreshAllOwnedCities",
    "getOwnedCityOwnershipSignature", "refreshOwnedCityRosterIfNeeded", "applyGlobalStatsSnapshot"]) {
    vm.runInContext(extract(name), c);
  }
  return { c, calls, merges };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  // Real global-stat notifications invalidate the roster only for ownership
  // changes. Production ticks must not turn the one-second UI clock into polls.
  for (const change of [
    { totalCities: 3, cityCountsByRegion: { home: 2, north: 1 } },
    { totalCities: 1, cityCountsByRegion: { home: 1 } },
    { cityCountsByRegion: { home: 1, north: 1 } },
    { strongholdCount: 1 },
  ]) {
    const { c, calls, merges } = fixture();
    c.modal.open = false;
    const original = { uid: "owner", totalCities: 2, strongholdCount: 0,
      cityCountsByRegion: { home: 2 }, updatedAtMs: 100 };
    c.onlineGlobalStats = c.state.globalStats = original;
    c.onlineOwnedCitiesCacheComplete = true;
    c.applyGlobalStatsSnapshot({ ...original, ...change, updatedAtMs: 101 });
    assert.equal(c.onlineOwnedCitiesCacheComplete, false);
    c.refreshOwnedCityRosterIfNeeded();
    assert.equal(calls.length, 1, "Ownership change must refresh even with the list closed");
    c.refreshOwnedCityRosterIfNeeded();
    assert.equal(calls.length, 1, "Repeated timer ticks must coalesce the ownership refresh");
    calls[0].resolve([{ id: "new-owner-roster" }]);
    await flush();
    assert.equal(merges[0].complete, true);
    assert.equal(c.onlineOwnedCitiesCacheComplete, true);
    c.applyGlobalStatsSnapshot({ ...c.onlineGlobalStats, totalTroops: 200, updatedAtMs: 102 });
    c.applyGlobalStatsSnapshot({ ...c.onlineGlobalStats,
      cityCountsByRegion: Object.fromEntries(Object.entries(c.onlineGlobalStats.cityCountsByRegion).reverse()), updatedAtMs: 103 });
    c.applyGlobalStatsSnapshot({ ...original, updatedAtMs: 99 });
    c.applyGlobalStatsSnapshot({ ...original, uid: "other", totalCities: 10, updatedAtMs: 104 });
    c.refreshOwnedCityRosterIfNeeded();
    assert.equal(calls.length, 1, "Unrelated, reordered, stale or foreign stats must not refresh the roster");
  }
  {
    const { c, calls, merges } = fixture();
    c.applyGlobalStatsSnapshot({ uid: "owner", totalCities: 2, cityCountsByRegion: { home: 2 } });
    const stale = c.refreshAllOwnedCities(true);
    c.applyGlobalStatsSnapshot({ uid: "owner", totalCities: 1, cityCountsByRegion: { home: 1 } });
    calls[0].resolve([{ id: "lost-city" }, { id: "kept-city" }]);
    assert.equal(await stale, false, "A roster started before an ownership event must not be accepted");
    assert.equal(merges.length, 0);
    assert.equal(c.onlineOwnedCitiesRefreshRequested, true);
    c.refreshOwnedCityRosterIfNeeded();
    calls[1].resolve([{ id: "kept-city" }]);
    await flush();
    assert.equal(merges.length, 1);
    assert.equal(merges[0].cities.length, 1);
    assert.equal(merges[0].complete, true);
  }
  {
    const { c, calls, merges } = fixture();
    c.refreshOwnedCityRosterIfNeeded();
    calls[0].resolve([{ id: "old-city" }]);
    await flush();
    // Same-count swaps have no count notification. Refresh the open list at a
    // bounded cadence, including after a failed read, without clearing rows.
    c.now += c.ONLINE_OWNED_CITIES_REFRESH_MS - 1;
    c.refreshOwnedCityRosterIfNeeded();
    assert.equal(calls.length, 1);
    c.now++;
    c.refreshOwnedCityRosterIfNeeded();
    calls[1].reject(Error("temporarily unavailable"));
    await flush();
    for (let tick = 0; tick < 10; tick++) c.refreshOwnedCityRosterIfNeeded();
    assert.equal(calls.length, 2, "Failed reads must not retry every timer tick");
    assert.equal(merges.length, 1, "A failed refresh must preserve the previous rows");
    c.now += c.ONLINE_OWNED_CITIES_REFRESH_MS;
    for (const [target, key, value] of [
      [c.modal, "open", false], [c.document, "hidden", true],
      [c.navigator, "onLine", false], [c, "signedIn", false],
    ]) {
      const old = target[key]; target[key] = value;
      c.refreshOwnedCityRosterIfNeeded();
      assert.equal(calls.length, 2, `Refresh was not paused by ${key}`);
      target[key] = old;
    }
    c.refreshOwnedCityRosterIfNeeded();
    calls[2].resolve([{ id: "replacement-city" }]);
    await flush();
    assert.equal(merges.length, 2);
    assert.equal(merges[1].cities[0].id, "replacement-city");
    assert.equal(merges[1].complete, true, "A verified roster replaces old ownership rather than appending");
    assert.equal(c.onlineOwnedCitiesRefreshError, "");
  }
  // A reconnect for the SAME account/realm must supersede old reads, including
  // their catch/finally paths. Account-and-realm identity alone cannot do that.
  for (const failure of [false, true]) for (const currentFinishesFirst of [false, true]) {
    const { c, calls, merges } = fixture();
    const old = c.refreshAllOwnedCities(true);
    c.onlineSessionGeneration++;
    c.onlineOwnedCitiesRefreshInFlight = false; // disconnectOnlineWorld's reset
    const current = c.refreshAllOwnedCities(true);
    const finishCurrent = async () => {
      calls[1].resolve([{ id: "current-owned-city" }]);
      assert.equal(await current, true);
    };
    if (currentFinishesFirst) await finishCurrent();
    if (failure) calls[0].reject(Error("old connection failed"));
    else calls[0].resolve([{ id: "lost-before-reconnect" }]);
    assert.equal(await old, false, "An old same-account session must not accept a roster");
    assert.equal(merges.length, currentFinishesFirst ? 1 : 0, "Old-session rows replaced the new session's roster");
    assert.equal(c.onlineOwnedCitiesRefreshInFlight, !currentFinishesFirst, "Old finally changed the new request's lock");
    assert.equal(c.onlineOwnedCitiesRefreshError, "", "Old failure replaced the current request status");
    if (!currentFinishesFirst) await finishCurrent();
    assert.equal(merges.length, 1);
    assert.equal(merges[0].cities[0].id, "current-owned-city");
    assert.equal(c.onlineOwnedCitiesCacheComplete, true);
    assert.equal(c.onlineOwnedCitiesRefreshInFlight, false);
  }
  for (const response of [null, undefined, {}, { cities: [] }]) {
    const { c, calls, merges } = fixture();
    const pending = c.refreshAllOwnedCities(true);
    calls[0].resolve(response);
    assert.equal(await pending, false, "Invalid response was presented as a complete empty roster");
    assert.equal(merges.length, 0, "Invalid data must not erase saved rows");
    assert.equal(c.onlineOwnedCitiesCacheComplete, false);
    assert(c.onlineOwnedCitiesRefreshError);
    assert.equal(c.onlineOwnedCitiesRefreshInFlight, false);
  }
  for (const failure of ["denied", "timeout", "incomplete"]) {
    const { c, calls, merges } = fixture();
    if (failure === "timeout") c.ONLINE_OWNED_CITIES_LOOKUP_TIMEOUT_MS = 5;
    if (failure === "incomplete") c.validateCompleteOwnedCityRoster = cities => ({ cities, complete: false, error: "count mismatch" });
    const pending = c.refreshAllOwnedCities(true);
    if (failure === "denied") calls[0].reject(Error("denied"));
    if (failure === "incomplete") calls[0].resolve([{ id: "saved" }]);
    assert.equal(await pending, false);
    assert(c.onlineOwnedCitiesRefreshError);
    assert.equal(c.onlineOwnedCitiesCacheComplete, false);
    assert.equal(c.onlineOwnedCitiesRefreshInFlight, false);
    assert(merges.every(merge => merge.complete === false));
    const retry = c.refreshAllOwnedCities(true);
    c.validateCompleteOwnedCityRoster = cities => ({ cities, complete: true });
    calls[1].resolve([]);
    assert.equal(await retry, true, "A verified empty roster must remove formerly owned cities");
    assert.equal(c.onlineOwnedCitiesRefreshError, "");
    assert.equal(c.onlineOwnedCitiesCacheComplete, true);
  }
  const { c, calls } = fixture();
  const pending = c.refreshAllOwnedCities(true);
  assert.equal(await c.refreshAllOwnedCities(true), false);
  assert.equal(calls.length, 1, "Opening twice duplicated the full-roster request");
  c.state.activeRegionId = "core-v2-north";
  calls[0].resolve([{ id: "home" }, { id: "north" }]);
  assert.equal(await pending, true, "Switching maps must not invalidate a world-wide roster");
  console.log("Validated ownership-triggered and bounded open-list refresh, in-flight ownership changes, reconnect isolation, invalid/empty replies, retry, and map changes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
