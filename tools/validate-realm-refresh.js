"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8").replace(/\r\n/g, "\n");
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const calls = [];
  const window = {
    CROWNLANDS_REALM_CONFIG: { releaseId: "test-release", resetGeneration: "realm-test", worldId: "main-realm-test" },
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    crypto: { randomUUID: () => "test-installation" },
    dispatchEvent() {}, addEventListener() {}, setTimeout, clearTimeout,
  };
  const context = { window, navigator: { userAgent: "test-browser" }, console, performance, Event,
    CustomEvent: class {}, URL, URLSearchParams, Uint32Array, Math, Map, Set };
  vm.runInNewContext(fs.readFileSync(path.join(root, "cosmetics-client.js"), "utf8"), context);
  vm.runInNewContext(source.replace(/\n  init\(\);\n\}\)\(\);\s*$/,
    "\n  window.realmRefreshClient = client;\n})();"), context);
  const client = window.realmRefreshClient;
  Object.assign(client, { configured: true, ready: true, db: {}, auth: {}, functions: {}, user: { uid: "test-user" }, initPromise: Promise.resolve() });
  client.modules = { functions: { httpsCallable: (_instance, name) => payload => new Promise((resolve, reject) => {
    calls.push({ name, payload, resolve: data => resolve({ data }), reject });
  }) } };
  const realm = revision => ({ releaseId: "test-release", resetGeneration: "realm-test", worldId: "main-realm-test",
    coreExpansion: { revision, activeRegionIds: revision > 1 ? ["new-lands-l01-p001"] : [] } });
  return { api: window.CrownlandsOnline, calls, client, realm };
}

async function main() {
  const f = fixture();
  const old = f.api.getRealmInfo();
  const shared = f.api.getRealmInfo();
  await tick();
  assert.equal(f.calls.length, 1, "Ordinary concurrent realm discovery must share one request.");
  const fresh = f.api.getRealmInfo({ force: true });
  await tick();
  assert.equal(f.calls.length, 2, "A forced map refresh joined a request sampled before the map opened.");
  f.calls[0].resolve(f.realm(1));
  assert.equal((await old).coreExpansion.revision, 1);
  assert.equal((await shared).coreExpansion.revision, 1);
  const latest = f.api.getRealmInfo();
  await tick();
  assert.equal(f.calls.length, 2, "An older request cleared the newer in-flight refresh.");
  f.calls[1].resolve(f.realm(2));
  assert.equal((await fresh).coreExpansion.revision, 2);
  assert.equal((await latest).coreExpansion.revision, 2);

  const failed = f.api.getRealmInfo({ force: true });
  const failedResult = assert.rejects(failed, /Fixture unavailable/);
  await tick();
  f.calls[2].reject(new Error("Fixture unavailable"));
  await failedResult;
  const retry = f.api.getRealmInfo({ force: true });
  await tick();
  assert.equal(f.calls.length, 4, "A failed forced refresh prevented a retry.");
  f.calls[3].resolve(f.realm(3));
  assert.equal((await retry).coreExpansion.revision, 3);
  assert.equal(f.client.realmInfoPromise, null);

  const signedOut = f.api.getRealmInfo({ force: true });
  const staleResult = assert.rejects(signedOut, /earlier game session/);
  await tick();
  f.client.user = null;
  f.calls[4].resolve(f.realm(4));
  await staleResult;
  assert.equal(f.client.realmInfoPromise, null, "A canceled refresh must release its pending request.");

  const expansionSource = fs.readFileSync(path.join(root, "game.js"), "utf8").replace(/\r\n/g, "\n");
  const start = expansionSource.indexOf("function applyCoreExpansionRealmState(");
  const end = expansionSource.indexOf("\nfunction getRegionLabel(", start);
  assert(start >= 0 && end > start, "The production expansion-state handler was not found.");
  const registrations = [];
  const game = { CORE_EXPANSION_TOPOLOGY_ACTIVE: true, RESET_GENERATION: "realm-test", ONLINE_WORLD_ID: "main-realm-test",
    appliedCoreExpansionState: null, ACTIVE_WORLD_REGION_IDS: new Set(["core"]), STATIC_ACTIVE_WORLD_REGION_IDS: new Set(["core"]),
    registerCoreExpansionRegions: regions => { registrations.push(regions); return false; }, normalizeRegionId: id => id,
    updateIslandSwitcherUi() {}, modal: { open: false }, renderIslandSwitcherModalContent() {}, Math, Number, Set };
  vm.createContext(game);
  vm.runInContext(expansionSource.slice(start, end), game);
  const opened = f.realm(9);
  assert.equal(game.applyCoreExpansionRealmState(opened), opened.coreExpansion);
  assert(game.ACTIVE_WORLD_REGION_IDS.has("new-lands-l01-p001"));
  const stale = f.realm(1);
  stale.coreExpansion.regions = [{ id: "obsolete-descriptor" }];
  assert.equal(game.applyCoreExpansionRealmState(stale), opened.coreExpansion, "A late response replaced the newest expansion metadata.");
  assert.equal(registrations.length, 1, "A late response registered outdated map descriptors.");
  game.applyCoreExpansionRealmState({ resetGeneration: "realm-test", worldId: "main-realm-test" });
  assert(game.ACTIVE_WORLD_REGION_IDS.has("new-lands-l01-p001"), "A partial realm response cleared open maps.");
  const nextRealm = { resetGeneration: "realm-next", worldId: "main-realm-next", coreExpansion: { revision: 1, activeRegionIds: [] } };
  game.applyCoreExpansionRealmState(nextRealm);
  assert.deepEqual([...game.ACTIVE_WORLD_REGION_IDS], ["core"], "A new realm inherited maps from an earlier generation.");
  console.log("Realm refresh passed: ordinary deduplication, forced freshness, overlapping cleanup, failure/retry and session isolation.");
  console.log("Expansion ordering passed: late/partial responses preserve current maps and metadata; new realms may start at a lower revision.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
