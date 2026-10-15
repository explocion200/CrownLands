"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { subscription } = require("../local-backend/web-push");
const keys = require("../local-backend/node_modules/web-push").generateVAPIDKeys();
const base = "https://playcrownlands.com/api/local-game/rehearsal/";
const browserKey = crypto.createECDH("prime256v1"); browserKey.generateKeys();
const run = (file, context) => vm.runInNewContext(fs.readFileSync(require.resolve("../" + file), "utf8"), context);
(async () => {
  let subscribed = 0, unsubscribed = 0, current = null, messages = 0, registrations = 0;
  const events = new Map(), manager = {
    getSubscription: async () => current,
    subscribe: async options => {
      subscribed++; assert.equal(options.userVisibleOnly, true);
      current = { options, toJSON: () => ({ endpoint: "https://fcm.googleapis.com/wp/browser_fixture", keys: { p256dh: browserKey.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } }),
        unsubscribe: async () => { unsubscribed++; current = null; return true; } }; return current;
    },
  };
  const reg = { scope: base, active: { scriptURL: base + "local-push-worker.js" }, pushManager: manager };
  const root = { location: { origin: "https://playcrownlands.com", pathname: "/api/local-game/rehearsal/" }, isSecureContext: true, Notification: { permission: "granted" }, PushManager: {},
    CROWNLANDS_LOCAL_BACKEND: { mode: "rehearsal" }, CROWNLANDS_LOCAL_PUSH: { publicKey: keys.publicKey, expiresAt: new Date(Date.now() + 600000).toISOString() },
    atob, btoa, setTimeout, clearTimeout,
    navigator: { serviceWorker: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
      register: async (url, options) => { registrations++; assert.equal(url, reg.active.scriptURL); assert.equal(options.scope, "/api/local-game/rehearsal/"); return reg; }, getRegistration: async () => reg } },
  };
  run("local-web-push.js", { window: root });
  const client = root.CrownlandsLocalPush.create(); assert.equal(await client.isSupported(), true); assert.equal(registrations, 0);
  const registration = await client.getServiceWorkerRegistration();
  const token = await client.getToken({}, { serviceWorkerRegistration: registration, vapidKey: keys.publicKey });
  assert(subscription(token, keys.publicKey)); assert.equal(subscribed, 1);
  await client.getToken({}, { serviceWorkerRegistration: registration, vapidKey: keys.publicKey }); assert.equal(subscribed, 1);
  client.onMessage({}, () => messages++);
  events.get("message")({ source: { scriptURL: "https://playcrownlands.com/play/service-worker.js" }, data: { type: "CROWNLANDS_LOCAL_PUSH", payload: {} } }); assert.equal(messages, 0);
  events.get("message")({ source: reg.active, data: { type: "CROWNLANDS_LOCAL_PUSH", payload: {} } }); assert.equal(messages, 1);
  await client.deleteToken(); assert.equal(unsubscribed, 1);
  root.Notification.permission = "denied"; await assert.rejects(client.getToken({}, { serviceWorkerRegistration: registration, vapidKey: keys.publicKey })); assert.equal(subscribed, 1);
  root.Notification.permission = "granted";
  root.CROWNLANDS_LOCAL_PUSH.expiresAt = new Date(Date.now() - 1).toISOString(); assert.equal(await client.isSupported(), false); await assert.rejects(client.getServiceWorkerRegistration());
  root.CROWNLANDS_LOCAL_PUSH.expiresAt = new Date(Date.now() + 600000).toISOString(); root.location.pathname = "/play/";
  assert.equal(await client.isSupported(), false); await assert.rejects(client.getServiceWorkerRegistration());
  client.dispose(); assert.equal(events.size, 0);

  const workerEvents = new Map(), shown = [], opened = [], forwarded = [];
  const privateWindow = { url: base, focus: async () => {}, postMessage: message => forwarded.push(message) };
  const liveWindow = { url: "https://playcrownlands.com/play/", postMessage: () => assert.fail("Private notification reached live game") };
  const self = { addEventListener: (name, fn) => workerEvents.set(name, fn), skipWaiting: async () => {},
    registration: { scope: base, showNotification: async (...args) => shown.push(args) },
    clients: { claim: async () => {}, matchAll: async () => [liveWindow, privateWindow], openWindow: async url => opened.push(url) } };
  run("local-push-worker.js", { self, URL }); assert.equal(workerEvents.has("fetch"), false);
  const payload = { data: { type: "incoming_army", kind: "attack", armyId: "fixture", title: "Attack incoming", body: "Synthetic private test", url: "https://evil.test" }, expiresAt: Date.now() + 60000 };
  const fire = async (name, value) => { let pending; workerEvents.get(name)({ ...value, waitUntil: promise => { pending = promise; } }); await pending; };
  await fire("push", { data: { json: () => payload } }); assert.equal(shown.length, 1); assert.equal(forwarded.length, 1);
  assert.equal(shown[0][1].data.url, base); assert.equal(shown[0][1].renotify, false);
  await fire("notificationclick", { notification: { close: () => {}, data: shown[0][1].data } }); assert.equal(opened.length, 0); assert.equal(forwarded.at(-1).type, "CROWNLANDS_NOTIFICATION_CLICK");
  self.clients.matchAll = async () => [liveWindow]; await fire("notificationclick", { notification: { close: () => {}, data: shown[0][1].data } }); assert.deepEqual(opened, [base]);
  await fire("notificationclick", { notification: { close: () => {}, data: { ...shown[0][1].data, cityId: "city/#", targetRegionId: "region#" } } });
  assert.equal(new URL(opened.at(-1)).searchParams.get("notificationCity"), "city/#"); assert.equal(new URL(opened.at(-1)).pathname, "/api/local-game/rehearsal/");
  payload.expiresAt = Date.now() - 1; await fire("push", { data: { json: () => payload } }); assert.equal(shown.length, 1);
  payload.expiresAt = Date.now() + 60000; self.registration.scope = "https://playcrownlands.com/";
  await fire("push", { data: { json: () => payload } }); assert.equal(shown.length, 1);
  console.log("Private Web Push browser contract: scoped worker/subscription, permission/expiry, encrypted token compatibility, foreground isolation, safe clicks and no live cache interception passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
