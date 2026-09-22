"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const game = read("game.js");
const flags = require("../functions/playerFlagConfig");
const originalFlag = flags.toStoredFlag({ ...flags.DEFAULT_FLAG, symbol: "lion" }, "a");
const editedFlag = { ...originalFlag, version: 2, symbol: "oak-tree" };
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function extract(name) {
  const start = game.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const tail = game.slice(start);
  const next = tail.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? tail : tail.slice(0, next + 1);
}

function firebaseHarness() {
  const window = { CROWNLANDS_REALM_CONFIG: { resetGeneration: "realm-test", worldId: "main-test" },
    CrownlandsPlayerFlags: flags, addEventListener() {}, dispatchEvent() {} };
  const context = { window, console, URL, URLSearchParams, Map, Set, Date, Promise, navigator: {} };
  const source = read("firebaseClient.js").replace(/\n  init\(\);\n\}\)\(\);\s*$/, "\nwindow.clientForTest = client;\n})();");
  vm.runInNewContext(source, context);
  const client = window.clientForTest;
  Object.assign(client, { user: { uid: "account-a" }, configured: true, ready: true, db: {}, initPromise: Promise.resolve() });
  let profile = { playerName: "Saved Ruler", flag: originalFlag, resetGeneration: "realm-test", worldId: "main-test" };
  let get = async () => ({ exists: () => true, data: () => plain(profile) });
  const writes = [];
  client.modules = { firestore: {
    doc: (_db, ...parts) => parts.join("/"),
    serverTimestamp: () => "server-time", deleteField: () => "DELETE",
    getDoc: () => { throw Error("Profile loading used the local cache."); },
    getDocFromServer: () => get(),
    setDoc: async (ref, data) => { writes.push({ ref, data: plain(data) }); },
    runTransaction: async (_db, body) => body({ get: () => get(), update: (ref, patch) => {
      writes.push({ ref, data: plain(patch) }); profile = { ...profile, ...patch };
    } }),
  } };
  return { api: window.CrownlandsOnline, client, writes, profile: () => profile, setProfile: p => { profile = p; }, get: fn => { get = fn; } };
}

async function testFirebaseBoundary() {
  const f = firebaseHarness();
  await f.api.savePlayerProfile({ playerName: "Startup", flag: editedFlag, displayName: "Login Name", identityRevision: 99, marchPercent: 50 });
  for (const field of ["playerName", "flag", "displayName", "identityRevision"]) assert.ok(!(field in f.writes[0].data), `Autosave writes ${field}.`);
  await f.api.saveGameSnapshot({ playerName: "Startup", flag: editedFlag, identityRevision: 99 }, "default-realm-test");
  assert.equal(f.writes[1].data.playerName, "DELETE");
  assert.equal(f.writes[1].data.state.flag, "DELETE", "A save slot retained a competing identity copy.");
  assert.equal((await f.api.loadPlayerProfile()).playerName, "Saved Ruler");

  const first = await f.api.savePlayerIdentity({ flag: editedFlag }, 0);
  assert.equal(first.identityRevision, 1);
  assert.equal(first.playerName, "Saved Ruler", "Flag editing renamed the ruler.");
  const count = f.writes.length;
  const retry = await f.api.savePlayerIdentity({ flag: editedFlag }, 0);
  assert.equal(retry.identityRevision, 1);
  assert.equal(f.writes.length, count, "Retry applied the same edit again.");
  await assert.rejects(f.api.savePlayerIdentity({ playerName: "Stale draft" }, 0), /another session/);
  assert.equal(f.profile().playerName, "Saved Ruler");
  const renamed = await f.api.savePlayerIdentity({ playerName: "Chosen Name" }, 1);
  assert.deepEqual(plain(renamed.flag), editedFlag, "Renaming discarded the saved flag.");
  assert.equal(renamed.identityRevision, 2);

  const pending = deferred();
  f.get(() => pending.promise);
  const loading = f.api.loadPlayerProfile();
  const editing = f.api.savePlayerIdentity({ playerName: "Old Account" }, 2);
  await Promise.resolve(); await Promise.resolve();
  f.client.user = { uid: "account-b" };
  pending.resolve({ exists: () => true, data: () => f.profile() });
  await assert.rejects(loading, /account changed/);
  await assert.rejects(editing, /account changed/);
  assert.equal(f.profile().playerName, "Chosen Name", "An account switch allowed a delayed edit.");

  const initPending = deferred(); f.client.initPromise = initPending.promise;
  const beforeInit = f.api.savePlayerProfile({ marchPercent: 10 });
  f.client.user = { uid: "account-c" }; initPending.resolve();
  assert.equal(await beforeInit, false, "A save was retargeted to a different account during initialization.");
}

async function testGameBoundary() {
  const writes = [];
  const api = { isConfigured: () => true, isSignedIn: () => true,
    savePlayerProfile: async p => { writes.push(p); return true; },
    saveGameSnapshot: async p => { writes.push(p); return true; } };
  const s = { console: { warn() {} }, Date, Promise,
    state: { playerName: "Startup", flag: editedFlag }, uid: "account-a", onlineWorldConnected: false,
    onlineProfileReady: null, onlineSessionGeneration: 1, RESET_GENERATION: "realm-test", ONLINE_WORLD_ID: "main-test",
    ONLINE_SAVE_SLOT: "default-realm-test", onlineSaveInFlight: false, onlineSavePromise: null, onlineSaveQueued: false,
    onlineSaveGeneration: 1, onlineSaveRetryAtMs: 0, onlineSaveTargets: { profile: { queued: false }, snapshot: { queued: false } },
    getOnlineApi: () => api, getCurrentOnlineUid: () => s.uid, getPlayerCloudStateSnapshot: () => s.state,
    stripServerEconomyProfileFields: p => p, clearOnlineSaveRetry() {}, syncOwnedCitiesToOnline: async () => {},
    publishKingPowerLeaderboard() {}, updateOnlineUi() {}, isPermanentOnlineSaveError: () => false, scheduleOnlineSaveRetry() {},
    isCurrentResetProfile: p => p.resetGeneration === "realm-test", getProfileGameSaveMs: p => p.lastSeenAtMs || 0,
    hasServerEconomyApi: () => true };
  s.onlineIdentityEditInFlight = false;
  s.normalizeFlag = flag => flag;
  vm.createContext(s);
  for (const name of ["canSaveOnlineProfile", "markOnlineProfileReady", "queueOnlineSave", "flushOnlineSave", "mergeOnlineProfileSources", "saveOnlinePlayerIdentity"]) vm.runInContext(extract(name), s);
  s.queueOnlineSave(); assert.equal(await s.flushOnlineSave(true), false);
  assert.equal(writes.length, 0, "A forced auth/update save persisted startup state.");
  const saved = { resetGeneration: "realm-test", playerName: "Saved Ruler", flag: originalFlag, identityRevision: 4, gold: 500, lastSeenAtMs: 100 };
  const cached = { ...saved, playerName: "Startup", flag: editedFlag, identityRevision: 0, gold: 0, lastSeenAtMs: 9999999999 };
  const merged = s.mergeOnlineProfileSources(saved, cached);
  assert.equal(merged.playerName, saved.playerName); assert.deepEqual(plain(merged.flag), originalFlag);
  assert.equal(merged.identityRevision, 4); assert.equal(merged.gold, 500);
  assert.equal(s.mergeOnlineProfileSources(null, cached), null, "A snapshot impersonated a confirmed profile.");
  s.state = merged; s.markOnlineProfileReady();
  assert.equal(await s.flushOnlineSave(true), false, "An unfinished map connection allowed saving.");
  s.onlineWorldConnected = true; s.queueOnlineSave();
  assert.equal(await s.flushOnlineSave(), true); assert.equal(writes.length, 2);
  s.uid = "account-b"; assert.equal(await s.flushOnlineSave(true), false);
  s.uid = "account-a"; s.onlineSessionGeneration++; assert.equal(await s.flushOnlineSave(true), false);
  s.markOnlineProfileReady(); s.RESET_GENERATION = "next-season"; assert.equal(await s.flushOnlineSave(true), false);
  s.RESET_GENERATION = "realm-test"; s.state = { ...s.state }; assert.equal(await s.flushOnlineSave(true), false);
  assert.equal(writes.length, 2, "A changed account/session/realm/state could reuse the old save permission.");
  s.markOnlineProfileReady();
  const edit = deferred(); api.savePlayerIdentity = () => edit.promise;
  const saving = s.saveOnlinePlayerIdentity({ playerName: "Previous Session" });
  s.state = { playerName: "New Session", flag: editedFlag };
  edit.resolve({ playerName: "Previous Session", flag: originalFlag, identityRevision: 5 });
  await assert.rejects(saving, /session changed/);
  assert.equal(s.state.playerName, "New Session", "An old edit callback replaced a new session's identity.");
}

Promise.resolve().then(testFirebaseBoundary).then(testGameBoundary)
  .then(() => console.log("Player identity safety passed: startup saves, stale snapshots, server reads, explicit edits, conflict/retry and account/session/realm guards."))
  .catch(error => { console.error(error); process.exitCode = 1; });
