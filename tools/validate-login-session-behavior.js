"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../firebaseClient.js"), "utf8").replace(/\r\n/g, "\n");
const wait = () => new Promise(resolve => setImmediate(resolve));
function storage(seed = {}) { const values = new Map(Object.entries(seed)); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; }
function fixture({ local = storage(), session = storage(), offset = 0 } = {}) {
  const events = [], watchers = [], calls = [], timers = new Map(); let serial = 0, signOuts = 0;
  const window = { CROWNLANDS_REALM_CONFIG: { resetGeneration: "realm-test", worldId: "main-realm-test" },
    localStorage: local, sessionStorage: session, crypto: { randomUUID: () => `session-${++serial}` },
    dispatchEvent: event => events.push(event), addEventListener() {},
    setTimeout: (callback, delay) => { const id = ++serial; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id) };
  const context = { window, navigator: { userAgent: "test-browser" }, console: { warn() {} }, performance,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    Event, URL, URLSearchParams, Uint32Array, Math, Map, Set,
    Date: class extends Date { static now() { return Date.now() + offset; } } };
  const hooks = "window.testHooks = { client, init, setModules: modules => { loadModules = async () => modules; }, activateCurrentSession, startActiveSessionWatcher, stopActiveSessionWatcher, resetActiveSessionActivation, signOutForSessionReplacement, prepareExplicitSessionLogin, subscribeGameServerMembership, callServerFunction };";
  vm.runInNewContext(source.replace(/\n  init\(\);\n\}\)\(\);\s*$/, `\n${hooks}\n})();`), context);
  const h = window.testHooks, c = h.client;
  Object.assign(c, { configured: true, ready: true, db: {}, auth: {}, functions: {}, user: { uid: "account" }, initPromise: Promise.resolve() });
  let operation = async (name, payload) => name === "getRealmInfo" ? { resetGeneration: "realm-test", worldId: "main-realm-test" }
    : { status: "active", activeSession: { version: 2, id: payload.sessionId, revision: 1, loginAtMs: 123, installationId: payload.installationId } };
  c.modules = { firestore: { doc: (...parts) => parts.slice(1).join("/"), onSnapshot: (ref, options, callback) => {
    assert.equal(options.includeMetadataChanges, true); const watcher = { ref, callback, stopped: false }; watchers.push(watcher); return () => { watcher.stopped = true; };
  } }, auth: { signOut: async () => { signOuts++; } }, functions: { httpsCallable: (_instance, name) => async payload => {
    calls.push({ name, payload }); return { data: await operation(name, payload) };
  } } };
  const emit = (watcher, activeSession, metadata = {}) => watcher.callback({ exists: () => true,
    data: () => ({ activeSession }), metadata: { fromCache: false, hasPendingWrites: false, ...metadata } });
  const boot = async () => {
    let onAuth;
    const modules = c.modules;
    modules.app = { initializeApp: () => ({}) };
    modules.firestore.getFirestore = () => ({});
    modules.functions.getFunctions = () => ({});
    Object.assign(modules.auth, { getAuth: () => ({}), GoogleAuthProvider: class {},
      onAuthStateChanged: (_auth, callback) => { onAuth = callback; },
      getRedirectResult: async () => null,
      signInWithPopup: async () => { const user = { uid: "account" }; onAuth(user); return { user }; } });
    window.CROWNLANDS_FIREBASE_CONFIG = { apiKey: "test", authDomain: "test", projectId: "test", appId: "test" };
    c.initPromise = null; c.user = null; h.setModules(modules); await h.init();
    assert(onAuth, "The real Firebase startup did not register its auth observer.");
    return onAuth;
  };
  return { h, c, window, watchers, events, calls, timers, emit, boot, operation: fn => { operation = fn; }, signOuts: () => signOuts };
}
async function main() {
  const f = fixture({ offset: -86400000 });
  await Promise.all([f.h.activateCurrentSession(), f.h.activateCurrentSession()]);
  assert.equal(f.calls.filter(call => call.name === "joinGameServer").length, 1, "Concurrent login triggers submitted twice.");
  assert.equal(f.c.activeSessionSnapshot.loginAtMs, 123, "A device clock replaced the accepted server timestamp.");
  const watcher = f.watchers.at(-1), own = f.c.activeSessionSnapshot;
  f.emit(watcher, { version: 2, id: "old", revision: 99, loginAtMs: Date.now() + 86400000 }, { fromCache: true });
  f.emit(watcher, { version: 2, id: "old", revision: 99 }, { hasPendingWrites: true });
  f.emit(watcher, { version: 2, id: "old", revision: 0 });
  assert.equal(f.signOuts(), 0, "An old, cached, or pending snapshot signed out the winning login.");
  f.h.startActiveSessionWatcher("account");
  f.emit(watcher, { version: 2, id: "stale-callback", revision: 99 });
  assert.equal(f.signOuts(), 0, "A disposed watcher signed out the current login.");
  f.emit(f.watchers.at(-1), { version: 2, id: "new-device", revision: own.revision + 1 });
  await wait();
  assert.equal(f.signOuts(), 1, "A confirmed new device did not sign out the old one.");
  assert.equal(f.c.user, null);
  assert.equal(f.events.filter(event => event.type === "crownlands:session-replaced").length, 1);

  const shared = storage({ "crownlands-game-installation-id-v1": "installation-shared-test-browser" });
  const a = fixture({ local: shared }), b = fixture({ local: shared });
  await a.h.activateCurrentSession(); await b.h.activateCurrentSession();
  a.emit(a.watchers.at(-1), { version: 2, id: "other-tab", revision: 2, installationId: "installation-shared-test-browser" });
  await wait();
  assert.equal(a.c.user, null, "The replaced tab kept its game session.");
  assert.equal(a.signOuts(), 0, "The replaced tab cleared Firebase auth shared with the winning tab.");
  assert.equal(b.c.user.uid, "account", "The winning tab lost authentication.");
  const oldId = a.c.activeSessionId;
  await a.h.prepareExplicitSessionLogin();
  assert.notEqual(a.c.activeSessionId, oldId, "Explicit re-login reused a revoked attempt.");
  assert.equal(a.c.sessionReplacedUid, "");

  const membership = fixture(); await membership.h.activateCurrentSession(); let deliveries = [];
  const stop = membership.h.subscribeGameServerMembership({ onMembership: value => deliveries.push(value) });
  const watch = membership.watchers.at(-1);
  const notify = (sessionId, metadata = {}) => watch.callback({ exists: () => true, data: () => ({ sessionId, resetGeneration: "realm-test", worldId: "main-realm-test", status: "active" }), metadata });
  notify("old-device"); assert.equal(deliveries.at(-1), null, "Another device's membership opened gameplay.");
  notify(membership.c.activeSessionId); assert.equal(deliveries.at(-1).status, "active");
  stop(); const count = deliveries.length; notify(membership.c.activeSessionId); assert.equal(deliveries.length, count);

  const retry = fixture(); let attempts = 0;
  retry.operation(async (name, payload) => {
    if (name === "getRealmInfo") return {};
    attempts++;
    if (attempts === 1) throw Object.assign(new Error("No instance available"), { code: "functions/unavailable" });
    return { status: "active", activeSession: { version: 2, id: payload.sessionId, revision: 1, loginAtMs: 456 } };
  });
  assert.equal(await retry.h.activateCurrentSession(), null);
  assert.equal(retry.timers.size, 1, "Transient admission failure has no bounded backoff retry.");
  const failedId = retry.calls.at(-1).payload.sessionId;
  const timer = [...retry.timers.values()][0]; retry.timers.clear(); timer.callback(); await wait(); await wait();
  assert.equal(retry.c.activeSessionSnapshot.loginAtMs, 456);
  assert.equal(retry.calls.at(-1).payload.sessionId, failedId, "A retry changed the idempotency key.");

  const late = fixture(); let finish;
  late.operation(async (name, payload) => name === "getRealmInfo" ? {} : new Promise(resolve => { finish = () => resolve({ status: "active", activeSession: { version: 2, id: payload.sessionId, revision: 1 } }); }));
  const pending = late.h.activateCurrentSession(); await wait();
  late.h.resetActiveSessionActivation(""); late.c.user = null; finish(); await pending;
  assert.equal(late.c.activeSessionSnapshot, null, "A late response restored a signed-out session.");
  assert.equal(late.watchers.length, 0);

  const blocked = fixture({ session: { getItem() { throw Error("Storage blocked"); }, setItem() { throw Error("Storage blocked"); } } });
  await blocked.h.activateCurrentSession();
  assert.equal(blocked.c.activeSessionSnapshot.version, 2, "Storage blocking prevented a first login.");

  const startup = fixture(); const onAuth = await startup.boot();
  onAuth({ uid: "account" }); await wait(); await wait();
  assert.equal(startup.c.activeSessionSnapshot?.version, 2, "First auth startup raced realm discovery and canceled admission.");
  startup.emit(startup.watchers.at(-1), { version: 2, id: "newer-tab", revision: 2, installationId: startup.c.activeSessionSnapshot.installationId });
  await wait(); const before = startup.calls.length;
  onAuth({ uid: "account" }); await wait();
  assert.equal(startup.c.user, null, "Shared Firebase auth revived a retired tab.");
  assert.equal(startup.calls.length, before, "A retired tab retried admission after shared auth changed.");
  await startup.window.CrownlandsOnline.signInWithGoogle();
  assert.equal(startup.c.activeSessionSnapshot?.version, 2, "An explicit Google login could not take the account back.");
  console.log("Login session behavior passed: cache/clock skew, disposal, device and shared-tab takeover, replay IDs, admission retry, late responses, and blocked storage.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
