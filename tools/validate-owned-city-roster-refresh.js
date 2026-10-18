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
    ONLINE_OWNED_CITIES_REFRESH_MS: 10000, ONLINE_OWNED_CITIES_LOOKUP_TIMEOUT_MS: 1000,
    window: { setTimeout, clearTimeout }, console: { warn() {} },
    getCurrentOnlineUid: () => c.uid,
    getRegionIds: () => ["core-v2-home", "core-v2-north"],
    getOnlineIslandId: id => `${c.ONLINE_WORLD_ID}--${c.REALM_SHARD_ID}--${id}`,
    getOnlineApi: () => ({ isSignedIn: () => true, loadOwnedCitiesAcrossIslands: () => {
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
    renderHud() {}, renderCityListModal() {},
  };
  vm.createContext(c);
  for (const name of ["getOnlineRequestScope", "getOnlineSessionRequestScope", "withTimeout", "refreshAllOwnedCities"]) {
    vm.runInContext(extract(name), c);
  }
  return { c, calls, merges };
}
async function main() {
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
  console.log("Validated roster refresh isolation across same-account reconnects, invalid/empty replies, failure/retry, and map changes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
