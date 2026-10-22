"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), vm = require("node:vm");
const { MessageChannel } = require("node:worker_threads");
const { prepare, inventory, publicConfiguration } = require("./local-migration/prepare_production_client");
const repo = path.resolve(__dirname, ".."), read = file => file === "local-client.js"
  ? require("./estate-delivery").minifyEstate(fs.readFileSync(path.join(repo, file), "utf8")) : fs.readFileSync(path.join(repo, file), "utf8");
const config = { mode: "production", protocol: 1, epoch: "a".repeat(32), publicKey: require("../local-backend/node_modules/web-push").generateVAPIDKeys().publicKey };
function storage() {
  const data = new Map([["save", "old Firebase save"], ["crownlands-private-rehearsal:save", "private save"]]);
  return { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), clear: () => data.clear() };
}
function browser() {
  return { location: { origin: "https://playcrownlands.com", pathname: "/play/" }, CROWNLANDS_LOCAL_BACKEND: { ...config },
    localStorage: storage(), sessionStorage: storage(), document: { hidden: false, createElement: () => ({}), head: { append: node => { assert.equal(node.src, "/world/bootstrap.js?v=continuous-v1"); } } }, setInterval, clearInterval, setTimeout, clearTimeout };
}
const run = (file, root) => vm.runInNewContext(read(file), { window: root });
async function main() {
  assert.equal(fs.readFileSync(path.join(repo, "dist/local-client.js"), "utf8"), read("local-client.js"), "Validate the exact production local transport");
  const root = browser(), original = root.localStorage;
  run("local-production.js", root);
  assert.equal(root.localStorage.getItem("save"), null);
  root.localStorage.setItem("save", "new local save");
  assert.equal(root.localStorage.length, 1); assert.equal(root.localStorage.key(0), "save");
  assert.equal(original.getItem("save"), "old Firebase save");
  assert.equal(original.getItem("crownlands-private-rehearsal:save"), "private save");
  const reloaded = browser(); reloaded.localStorage = original; run("local-production.js", reloaded);
  assert.equal(reloaded.localStorage.getItem("save"), "new local save"); reloaded.localStorage.clear(); assert.equal(original.length, 2);
  assert.equal(Object.getOwnPropertyDescriptor(root, "CROWNLANDS_LOCAL_BACKEND").writable, false);
  for (const change of [{ location: { origin: "https://attacker.test", pathname: "/play/" } }, { CROWNLANDS_LOCAL_BACKEND: { ...config, epoch: "bad" } }]) {
    assert.throws(() => run("local-production.js", { ...browser(), ...change }));
  }
  let authRequests = 0, gameRequests = 0, healthEpoch = "b".repeat(32);
  root.fetch = async (url, options) => {
    assert.equal(options.cache, "no-store"); assert.equal(options.headers["X-Crownlands-Deployment"], config.epoch);
    if (url.endsWith("/health")) return Response.json({ ready: true, rehearsal: false, protocol: 1, epoch: healthEpoch });
    if (url === "/local-auth/v1/session") { authRequests++; return Response.json({ csrf: "fixture", user: { uid: "fixture" }, authTime: 1 }); }
    assert(url.startsWith("/api/local-game/v1/")); gameRequests++;
    if (root.CROWNLANDS_WORLD_SESSION) {
      const input = JSON.parse(options.body).data;
      if (url.endsWith("/call/social")) {
        assert(!Object.hasOwn(input, "clientWorldProtocol")); assert(!Object.hasOwn(input, "clientWorldRevision"));
      } else {
        assert.equal(input.clientWorldProtocol, root.CROWNLANDS_WORLD_SESSION.protocol);
        assert.equal(input.clientWorldRevision, root.CROWNLANDS_WORLD_SESSION.revision);
      }
    }
    return Response.json({ result: { passed: true } });
  };
  run("local-client.js", root); const client = root.CrownlandsLocalBackend.create();
  await assert.rejects(client.auth.reload()); assert.equal(authRequests, 0); assert.equal(gameRequests, 0);
  healthEpoch = config.epoch; await client.auth.reload(); assert.equal(authRequests, 1);
  assert.equal((await client.functions.httpsCallable({}, "fixture")({})).data.passed, true); assert.equal(gameRequests, 1);
  root.CROWNLANDS_WORLD_SESSION = Object.freeze({ protocol: 1, revision: "a".repeat(64) });
  for (const action of ["status", "list", "history", "send", "friend", "presence", "unread"]) {
    await client.functions.httpsCallable({}, "social")({ action });
  }
  for (const name of require("../local-backend/world/service").MOVEMENT) await client.functions.httpsCallable({}, name)({});
  client.dispose();
  const invalid = browser(); run("local-client.js", invalid); assert.throws(() => invalid.CrownlandsLocalBackend.create());

  // Build a separate fixture artifact using the real static transport/worker.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cl-local-client-")), source = path.join(directory, "source"), candidate = path.join(directory, "candidate");
  try {
    fs.mkdirSync(path.join(source, "play"), { recursive: true });
    for (const name of ["local-production.js", "local-client.js", "local-web-push.js", "firebaseClient.js", "service-worker.js", "firebase-config.js"]) fs.writeFileSync(path.join(source, name), read(name));
    const html = '<meta name="crownlands-build" content="fixture"><script src="app-entry.js?v=fixture"></script><script src="firebase-config.js?v=fixture"></script><script src="firebaseClient.js?v=fixture"></script>';
    for (const name of ["index.html", "play/index.html"]) fs.writeFileSync(path.join(source, name), html);
    fs.writeFileSync(path.join(source, "artifact-manifest.json"), JSON.stringify({ files: inventory(source) }));
    const receipt = prepare({ source, destination: candidate, config });
    assert.equal(receipt.files.length, 9); assert.equal(receipt.buildId, "fixture-local-" + config.epoch);
    assert.throws(() => prepare({ source, destination: candidate, config }));
    assert.throws(() => publicConfiguration({ ...config, privateKey: "never include a credential" }));
    assert.equal(fs.readFileSync(path.join(source, "index.html"), "utf8"), html);
    const output = fs.readFileSync(path.join(candidate, "index.html"), "utf8");
    assert(output.indexOf("local-production.js") < output.indexOf("app-entry.js"));
    assert(output.includes(`content="${receipt.buildId}"`));
    assert(!fs.readFileSync(path.join(candidate, "firebase-config.js"), "utf8").includes("CROWNLANDS_FIREBASE_CONFIG"));

    const listeners = new Map(), shown = [], posted = [], opened = [], imported = [];
    const liveWindow = { url: "https://playcrownlands.com/play/", focus: async () => {}, postMessage: value => posted.push(value) };
    const privateWindow = { url: "https://playcrownlands.com/api/local-game/rehearsal/", postMessage: () => assert.fail("Public push reached private game") };
    const self = { location: new URL("https://playcrownlands.com/service-worker.js"), addEventListener: (name, fn) => listeners.set(name, fn),
      registration: { scope: "https://playcrownlands.com/", showNotification: async (...args) => shown.push(args) },
      clients: { matchAll: async () => [privateWindow, liveWindow], openWindow: async url => opened.push(url) } };
    vm.runInNewContext(fs.readFileSync(path.join(candidate, "service-worker.js"), "utf8"), { self, clients: self.clients, URL, importScripts: url => imported.push(url) });
    assert.equal(imported.length, 0, "The local worker must import no Firebase SDK or Firebase config");
    const fire = async (name, details) => { let promise; listeners.get(name)({ ...details, waitUntil: value => { promise = value; } }); await promise; };
    let status;
    await fire("message", { data: { type: "CROWNLANDS_LOCAL_PUSH_STATUS" }, ports: [{ postMessage: value => { status = value; } }] });
    assert.equal(status.epoch, config.epoch); assert.equal(status.publicKey, config.publicKey);
    const payload = { data: { type: "incoming_army", kind: "attack", armyId: "fixture", cityId: "city/#", url: "https://attacker.test/" }, expiresAt: Date.now() + 60000 };
    await fire("push", { data: { json: () => payload } }); assert.equal(shown.length, 1); assert.equal(posted.length, 1); assert.equal(posted[0].epoch, config.epoch);
    await fire("notificationclick", { notification: { data: shown[0][1].data, close() {} } }); assert.equal(posted.at(-1).type, "CROWNLANDS_NOTIFICATION_CLICK");
    self.clients.matchAll = async () => [privateWindow];
    await fire("notificationclick", { notification: { data: shown[0][1].data, close() {} } });
    assert.equal(new URL(opened[0]).pathname, "/play/"); assert.equal(new URL(opened[0]).searchParams.get("notificationCity"), "city/#");
    payload.expiresAt = Date.now() - 1; await fire("push", { data: { json: () => payload } }); assert.equal(shown.length, 1);
    await fire("notificationclick", { notification: { data: { ...shown[0][1].data, localEpoch: "wrong" }, close() {} } }); assert.equal(opened.length, 1);
    for (const name of ["/api/local-game/v1/read", "/local-auth/v1/session"]) {
      listeners.get("fetch")({ request: { method: "GET", headers: new Headers(), url: "https://playcrownlands.com" + name }, respondWith: () => assert.fail("Account/game response was cached") });
    }

    // An active old worker can share the same URL. Do not retire its subscription
    // until it proves it supports the intended native-push epoch and key.
    const pushRoot = browser(); run("local-production.js", pushRoot);
    let workerEpoch = "wrong", unsubscribed = 0;
    Object.assign(pushRoot, { isSecureContext: true, Notification: { permission: "granted" }, PushManager: {}, MessageChannel, atob, btoa });
    const registration = { scope: "https://playcrownlands.com/", active: { scriptURL: "https://playcrownlands.com/service-worker.js",
      postMessage: (_data, ports) => { ports[0].postMessage({ protocol: 1, epoch: workerEpoch, publicKey: config.publicKey }); ports[0].close(); } },
      pushManager: { getSubscription: async () => ({ unsubscribe: async () => { unsubscribed++; return true; } }) } };
    pushRoot.navigator = { serviceWorker: { addEventListener() {}, removeEventListener() {}, register: async (_url, options) => { assert.equal(options.scope, "/"); return registration; } } };
    run("local-web-push.js", pushRoot); const push = pushRoot.CrownlandsLocalPush.create();
    assert.equal(await push.isSupported(), true); await assert.rejects(push.getServiceWorkerRegistration()); assert.equal(unsubscribed, 0);
    workerEpoch = config.epoch; assert.equal(await push.getServiceWorkerRegistration(), registration); push.dispose();
    fs.appendFileSync(path.join(source, "local-client.js"), " ".repeat(32768));
    fs.writeFileSync(path.join(source, "artifact-manifest.json"), JSON.stringify({ files: inventory(source).filter(file => file.path !== "artifact-manifest.json") }));
    assert.throws(() => prepare({ source, destination: path.join(directory, "oversized"), config }), /32 KiB/);
    assert(!fs.existsSync(path.join(directory, "oversized")));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  console.log("Local production browser: separate artifact, early storage isolation, matching server identity, no Firebase fallback/imports, native worker handshake, safe clicks and uncached account/game routes passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
