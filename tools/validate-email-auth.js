"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8").replace(/\r\n/g, "\n");
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  let observer, serial = 0;
  const calls = [], events = [], sent = [], store = new Map();
  const auth = { currentUser: null }, database = {};
  const window = { CROWNLANDS_FIREBASE_CONFIG: { apiKey: "test", authDomain: "test", projectId: "test", appId: "test" },
    CROWNLANDS_REALM_CONFIG: { resetGeneration: "test", worldId: "test-world" },
    crypto: { randomUUID: () => `fixture-${++serial}` },
    localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    dispatchEvent: event => events.push(event), addEventListener() {}, setTimeout, clearTimeout };
  const user = (uid, provider = "password", verified = false) => ({ uid, email: `${uid}@example.test`, emailVerified: verified,
    displayName: "", providerData: [{ providerId: provider }], provider });
  const modules = {
    app: { initializeApp: () => ({}) },
    auth: { getAuth: () => auth, GoogleAuthProvider: class {}, onAuthStateChanged: (_, fn) => { observer = fn; }, getRedirectResult: async () => null,
      getIdTokenResult: async u => ({ signInProvider: u.provider, claims: { email_verified: u.emailVerified, auth_time: Date.now() / 1000 } }),
      getIdToken: async () => "fixture-token", reload: async () => {},
      sendEmailVerification: async (_u, options) => { sent.push(options.url); },
      sendPasswordResetEmail: async (_a, _email, options) => { sent.push(options.url); },
      signOut: async () => { auth.currentUser = null; observer(null); },
      EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
      linkWithCredential: async (u, credential) => { assert.equal(credential.email, u.email); u.providerData.push({ providerId: "password" }); return { user: u }; },
      reauthenticateWithPopup: async u => ({ user: u }),
    },
    firestore: { getFirestore: () => database, doc: (...parts) => parts.slice(1).join("/"), onSnapshot: () => () => {} },
    functions: { getFunctions: () => ({}), httpsCallable: (_f, name) => async payload => {
      calls.push({ name, payload }); return { data: name === "getRealmInfo" ? { resetGeneration: "test", worldId: "test-world" }
        : name === "joinGameServer" ? { status: "active", activeSession: { id: payload.sessionId, version: 2, revision: 1 } } : { ok: true } };
    } },
  };
  modules.auth.createUserWithEmailAndPassword = async () => { const u = user("email-player"); auth.currentUser = u; observer(u); return { user: u }; };
  modules.auth.signInWithEmailAndPassword = modules.auth.createUserWithEmailAndPassword;
  const hooks = "window.hooks = { client, acceptAuthUser, load: value => { loadModules = async () => value; } };";
  vm.runInNewContext(source.replace(/\n  init\(\);\n\}\)\(\);\s*$/, `\n${hooks}\n})();`), {
    window, navigator: { userAgent: "test" }, console: { warn() {} }, performance, URL, URLSearchParams, Event,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, setTimeout, clearTimeout });
  window.hooks.load(modules);
  const api = window.CrownlandsOnline;
  const login = async u => { auth.currentUser = u; observer(u); await tick(); await tick(); };
  return { api, auth, modules, calls, events, sent, user, login, client: window.hooks.client, hooks: window.hooks, store };
}

async function main() {
  const f = fixture(); await f.api.init();
  await assert.rejects(f.api.signInWithEmail("test@example.test", "short", { create: true }), { code: "auth/weak-password" });
  await f.api.signInWithEmail("test@example.test", "long test password", { create: true });
  assert.equal(f.api.isSignedIn(), false); assert.equal(f.api.getUser(), null);
  assert.equal(f.api.getAuthUser().uid, "email-player");
  assert.equal(f.calls.length, 0, "Unverified signup started a game operation.");
  assert.equal(f.sent.length, 1);
  await assert.rejects(f.api.sendVerificationEmail(), { code: "auth/resend-cooldown" });
  await assert.rejects(f.api.joinGameServer(), /Sign in|still connecting/);
  assert.equal(f.calls.length, 0);
  f.auth.currentUser.emailVerified = true;
  await f.api.refreshEmailVerification(); await tick();
  assert.equal(f.api.isSignedIn(), true);
  assert.equal(f.calls.filter(c => c.name === "joinGameServer").length, 1);
  const session = f.client.activeSessionId;
  await f.api.refreshEmailVerification(); await tick();
  assert.equal(f.calls.filter(c => c.name === "joinGameServer").length, 1, "Verification refresh took over the session again.");
  assert.equal(f.client.activeSessionId, session);
  assert(![...f.store.values()].some(value => String(value).includes("password")), "Password leaked into storage.");

  await f.api.signOut();
  const stalled = deferred();
  const create = f.modules.auth.createUserWithEmailAndPassword;
  f.modules.auth.createUserWithEmailAndPassword = async (...args) => { await stalled.promise; return create(...args); };
  const first = f.api.signInWithEmail("test@example.test", "long test password", { create: true });
  await assert.rejects(f.api.signInWithEmail("test@example.test", "long test password", { create: true }), { code: "auth/operation-pending" });
  await assert.rejects(f.api.signInWithGoogle(), { code: "auth/operation-pending" });
  stalled.resolve(); await first; await f.api.signOut();

  const google = f.user("existing-kingdom", "google.com", true);
  await f.login(google);
  const before = f.calls.filter(c => c.name === "joinGameServer").length, beforeSession = f.client.activeSessionId;
  await f.api.reauthenticateGoogleForPassword();
  await f.api.addEmailPassword("a linked password"); await tick();
  assert.equal(f.api.getUser().uid, "existing-kingdom");
  assert(f.api.getAuthUser().providerIds.includes("google.com"));
  assert(f.api.getAuthUser().providerIds.includes("password"));
  assert.equal(f.calls.filter(c => c.name === "joinGameServer").length, before);
  assert.equal(f.client.activeSessionId, beforeSession);
  assert(!f.calls.some(c => /savePlayer|claim.*City|updatePlayerIdentity/i.test(c.name)));
  await f.api.sendPasswordRecovery(google.email);
  assert.equal(f.sent.at(-1), "https://playcrownlands.com/play/");

  const reload = deferred(); f.modules.auth.reload = () => reload.promise;
  const oldRefresh = f.api.refreshEmailVerification(); await tick();
  const replacement = f.user("another-account", "google.com", true); await f.login(replacement);
  reload.resolve(); await assert.rejects(oldRefresh, { code: "auth/user-mismatch" });
  assert.equal(f.api.getUser().uid, replacement.uid);

  // The existing stalled-Google-popup recovery must still be usable while
  // other duplicate authentication operations remain blocked.
  await f.api.signOut();
  const popup = deferred();
  f.modules.auth.signInWithPopup = () => popup.promise;
  let redirects = 0;
  f.modules.auth.signInWithRedirect = async () => { redirects++; };
  const popupAttempt = f.api.signInWithGoogle(); await tick();
  assert(f.api.canResumeGoogleRedirect());
  await f.api.signInWithGoogleRedirect();
  assert.equal(redirects, 1);
  popup.resolve({ user: replacement });
  await assert.rejects(popupAttempt, { code: "auth/operation-superseded" });
  assert.equal(f.api.getUser(), null, "A superseded popup restored an obsolete user.");

  // Both wrappers must reject before the realm lookup, including handlers that
  // inspect request.auth directly rather than calling requireAuth.
  const backend = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
  const extract = name => { const start = backend.indexOf(`function ${name}(`); const end = backend.indexOf("\n}", start); assert(start >= 0 && end > start); return backend.slice(start, end + 2); };
  let reads = 0, handlers = 0;
  const context = { firebaseOnCall: (_options, handler) => handler, HttpsError: class extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } },
    resolveCallableRealmContext: async () => { reads++; return {}; }, REALM_REQUEST_CONTEXT: { run: (_context, operation) => operation() },
    OPERATION_TIMING: { run: operation => operation(), measure: (_name, operation) => operation(), snapshot: () => ({}) },
    logOperation() {}, operationResultMetrics: () => ({}) };
  vm.createContext(context);
  vm.runInContext(["requireVerifiedEmailSession", "onCall", "timedCallable"].map(extract).join("\n"), context);
  for (const callable of [context.onCall({}, async () => { handlers++; }), context.timedCallable("test", {}, async () => { handlers++; })]) {
    await assert.rejects(callable({ auth: { uid: "unverified", token: { firebase: { sign_in_provider: "password" } } } }), error => error.code === "permission-denied" && error.details.reason === "email-verification-required");
    assert.equal(reads, 0); assert.equal(handlers, 0);
  }
  for (const token of [{ email_verified: true, firebase: { sign_in_provider: "password" } }, { firebase: { sign_in_provider: "google.com" } }, { firebase: { sign_in_provider: "custom" } }]) context.requireVerifiedEmailSession({ auth: { uid: "allowed", token } });
  console.log("Email auth passed: verification gate, duplicate operations, same-UID linking, session preservation, recovery, stale callbacks, both backend wrappers.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
