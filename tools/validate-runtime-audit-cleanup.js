"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const source = read("functions/index.js");
function section(start, end) {
  const offset = source.indexOf(start), last = source.indexOf(end, offset);
  assert(offset >= 0 && last > offset, `Missing source boundaries: ${start}`);
  return source.slice(offset, last);
}
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

async function validateClanPower() {
  const identity = {resetGeneration: "audit-generation", worldId: "audit-world"};
  const records = new Map([
    ["players/player", {...identity, clanId: "clan"}],
    ["players/player/stats/global", {...identity, kingPower: 200}],
    ["clans/clan", {...identity, totalKingPower: 1000}],
    ["clans/clan/members/player", {...identity, kingPower: 0, lastLoginAtMs: 300}],
  ]);
  let reads = 0, writes = 0;
  const doc = name => ({path: name});
  const tx = {
    get: async ref => { reads++; return {ref, exists: records.has(ref.path), data: () => records.get(ref.path)}; },
    set: (ref, data) => { writes++; records.set(ref.path, {...records.get(ref.path), ...data}); },
  };
  const context = vm.createContext({
    exports: {}, db: {doc}, RESET_GENERATION: identity.resetGeneration, ONLINE_WORLD_ID: identity.worldId,
    safeString: value => String(value || ""), safeNumber: (value, fallback) => Number(value) || fallback,
    onDocumentWritten: (_options, handler) => handler, withDocumentRealmShard: handler => handler,
    runTransactionWithInfrastructureRetry: callback => callback(tx),
    FieldValue: {serverTimestamp: () => 1}, playerGlobalStatsRef: uid => doc(`players/${uid}/stats/global`),
    leaderboardEntryRef: uid => doc(`leaderboard/${uid}`), clanIdentityPatch: () => ({}),
    writeClanLeaderboard: (transaction, id, clan, patch) => transaction.set(doc(`clanLeaderboard/${id}`), {...clan, ...patch}),
    getPlayerLastLoginAtMs: data => data.lastLoginAtMs || 0,
  });
  vm.runInContext(section("exports.rebuildClanPowerOnPlayerStats =", "exports.createClanRally ="), context);
  const snapshot = data => ({exists: true, data: () => ({...identity, ...data})});
  const event = (before, after) => ({params: {uid: "player"}, data: {before: snapshot({kingPower: before}), after: snapshot({kingPower: after})}});
  const handler = context.exports.rebuildClanPowerOnPlayerStats;
  await handler(event(100, 200));
  assert.equal(records.get("clans/clan").totalKingPower, 1200, "Other members' contributions are retained");
  writes = 0;
  await handler(event(0, 100));
  await handler(event(100, 200));
  assert.equal(records.get("clans/clan").totalKingPower, 1200, "Old and repeated events cannot overwrite newer stats");
  assert.equal(writes, 0, "Already reconciled events perform no writes");
  records.get("players/player/stats/global").kingPower = 50;
  await handler(event(200, 50));
  assert.equal(records.get("clans/clan").totalKingPower, 1050, "Legitimate decreases are applied");
  assert.equal(records.get("clanLeaderboard/clan").totalKingPower, 1050);
  reads = 0;
  await handler(event(50, 50));
  assert.equal(reads, 0, "Unchanged power does not perform database reads");
  writes = 0;
  records.get("players/player/stats/global").resetGeneration = "archived";
  await handler(event(50, 90));
  assert.equal(writes, 0, "A current event cannot update archived current stats");
  records.get("players/player/stats/global").resetGeneration = identity.resetGeneration;
  records.get("clans/clan/members/player").status = "removed";
  await handler(event(50, 90));
  assert.equal(writes, 0, "Removed members are ignored");
  delete records.get("clans/clan/members/player").status;
  vm.runInContext(section("exports.syncClanIdentityOnMembershipChange =", "exports.rebuildClanPowerOnPlayerStats ="), context);
  await context.exports.syncClanIdentityOnMembershipChange({params: {uid: "player"}, data: {
    before: snapshot({clanId: "clan", lastLoginAtMs: 100}), after: snapshot({clanId: "clan", lastLoginAtMs: 200}),
  }});
  assert.equal(writes, 0, "An old login cannot regress membership timestamps or trigger writes");
}

function validateEconomyWrites() {
  const writes = [];
  const context = vm.createContext({
    LEGACY_SHOP_ITEM_IDS: ["old_item"], FieldValue: {serverTimestamp: () => 1, delete: () => "DELETE"},
    writeGlobalStatsFromEconomy: () => null, safeNumber: (value, fallback) => Number(value) || fallback,
  });
  vm.runInContext(section("function addLegacyShopItemDeletes(", "function normalizeItemEffects("), context);
  vm.runInContext(section("function writePreparedEconomy(", "async function writeCurrentOwnerPatches("), context);
  const transaction = {set: (_ref, data) => writes.push(data), update: (_ref, data) => writes.push(data)};
  const economy = {cityPatches: [], profileRef: {}, profilePatch: {}, profileSnap: {exists: true}, profileBefore: {shopItems: {}}};
  context.writePreparedEconomy(transaction, economy);
  assert.equal(writes.length, 1, "Modern economy updates write the profile once");
  writes.length = 0;
  economy.profileBefore.shopItems.old_item = 2;
  context.writePreparedEconomy(transaction, economy);
  assert.equal(writes.length, 2, "Legacy inventory still receives its required cleanup");
  assert.equal(writes[1]["shopItems.old_item"], "DELETE");
}

function workerFixture(fetcher) {
  const stores = new Map(), timers = new Map(), events = new Map(), background = [];
  let sequence = 0;
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {match: async request => store.get(request.url || request)?.clone(),
      put: async (request, response) => store.set(request.url || request, response.clone()),
      keys: async () => [...store.keys()], delete: async key => store.delete(key)};
  };
  const context = vm.createContext({URL, Request, Response, console, importScripts() {}, fetch: fetcher,
    setTimeout: callback => { const id = ++sequence; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
    self: {location: new URL("https://game.test/service-worker.js"), addEventListener: (name, fn) => events.set(name, fn)},
    caches: {open: async name => cache(name)},
  });
  vm.runInContext(read("service-worker.js"), context);
  return {context, cache, timers, events, background,
    names: vm.runInContext("[CACHE_NAME, RUNTIME_CACHE_NAME]", context),
    event: {waitUntil: promise => background.push(promise)},
  };
}

async function validateCache() {
  const request = new Request("https://game.test/game.js?v=release");
  for (const status of [200, 403, 404, 500, 503]) {
    const fixture = workerFixture(async () => new Response("network", {status}));
    await fixture.cache(fixture.names[0]).put(request, new Response("current"));
    const response = await fixture.context.networkFirst(request, null, fixture.event);
    assert.equal(response.status, status >= 500 ? 200 : status);
    assert.equal(await response.text(), status >= 500 ? "current" : "network");
    await Promise.all(fixture.background);
    assert.equal(fixture.timers.size, 0);
  }
  const offline = workerFixture(async () => {throw Error("offline");});
  await offline.cache("crownlands-cache-old-build").put(request, new Response("stale"));
  await assert.rejects(offline.context.networkFirst(request, null, offline.event), /offline/);
  await offline.cache(offline.names[1]).put(request, new Response("visited"));
  assert.equal(await (await offline.context.networkFirst(request, null, offline.event)).text(), "visited");
  let finish;
  const slow = workerFixture(() => new Promise(resolve => {finish = resolve;}));
  await slow.cache(slow.names[0]).put(request, new Response("cached"));
  const pending = slow.context.networkFirst(request, null, slow.event);
  [...slow.timers.values()].forEach(callback => callback());
  assert.equal(await (await pending).text(), "cached", "A stalled network does not hold a cached screen");
  finish(new Response("refreshed"));
  await Promise.all(slow.background);
  assert.equal(await (await slow.cache(slow.names[1]).match(request)).text(), "refreshed");
  let intercepted = false;
  slow.events.get("fetch")({request: new Request("https://game.test/api/private"), respondWith() {intercepted = true;}});
  assert.equal(intercepted, false, "API requests are never recovered from the asset cache");
}

async function validateDeferredCode() {
  const html = read("index.html"), worker = read("service-worker.js");
  const entries = [...html.matchAll(/data-optional-ui-script="([^"]+)" data-src="([^"]+)"/g)]
    .map(([, group, src]) => ({dataset: {optionalUiScript: group, src}}));
  assert.equal(entries.length, 17);
  for (const entry of entries) {
    assert(fs.existsSync(path.join(root, entry.dataset.src.split("?")[0])));
    assert(!worker.includes(`"/${entry.dataset.src}"`), "Optional scripts must not be precached at startup");
  }
  const injected = [], timers = new Map(); let timerId = 0;
  function node() {
    return {style: {}, children: [], listeners: {}, hidden: false, setAttribute() {},
      append(...children) {this.children.push(...children);}, replaceChildren(...children) {this.children = children;},
      contains(child) {return this.children.includes(child);}, addEventListener(name, fn) {this.listeners[name] = fn;}, remove() {},
    };
  }
  const context = vm.createContext({document: {querySelectorAll: () => entries, createElement: node,
    head: {append: script => injected.push(script)}},
    setTimeout: callback => {const id = ++timerId; timers.set(id, callback); return id;}, clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(read("optional-ui-styles.js"), context);
  const host = node(); let old = 0, latest = 0;
  assert.equal(context.ensureOptionalUiScripts("help", host, () => old++), false);
  context.ensureOptionalUiScripts("help", host, () => latest++);
  await settle(); assert.equal(injected.length, 1);
  assert.match(injected[0].src, /help-handbook-content/);
  injected[0].onload(); await settle(); assert.equal(injected.length, 2);
  injected[1].onload(); await settle(); assert.equal(old, 0); assert.equal(latest, 1);
  assert.equal(context.ensureOptionalUiScripts("help", host, () => latest++), true);
  context.ensureOptionalUiScripts("shop", host, () => latest++); await settle();
  injected[2].onerror(); await settle();
  assert.equal(host.children[0].children[1].hidden, false);
  host.children[0].children[1].listeners.click(); await settle();
  assert.equal(injected.length, 4, "Failed requests can be retried");
  host.replaceChildren(node()); injected[3].onload(); await settle();
  assert.equal(latest, 1, "Late code cannot replace another view");
  context.ensureOptionalUiScripts("bag", host, () => latest++); await settle();
  [...timers.values()].forEach(callback => callback()); await settle();
  host.children[0].children[1].listeners.click(); await settle();
  assert.equal(injected.length, 5, "A timed-out script must not execute twice on retry");
  injected[4].onload(); await settle(); assert.equal(latest, 2);
  assert.equal(timers.size, 0);
}

(async () => {
  await validateClanPower();
  validateEconomyWrites();
  await validateCache();
  await validateDeferredCode();
  console.log("Runtime cleanup passed: ordered/duplicate clan events, no-op writes, legacy migration, build-scoped cache recovery, ordered optional scripts, retries and stale-view protection.");
})().catch(error => {console.error(error); process.exitCode = 1;});
