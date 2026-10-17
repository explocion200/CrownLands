"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), crypto = require("node:crypto");
const { notificationData } = require("../functions/notification-delivery");
const { PermanentPush } = require("../local-backend/permanent-push");
const webpush = require("../local-backend/node_modules/web-push"), { PREFIX } = require("../local-backend/web-push");
(async () => {
  // Execute the real browser registration functions, including serialized changes
  // and installation-token replacement, against an in-memory browser transport.
  const source = fs.readFileSync(require.resolve("../firebaseClient.js"), "utf8"), records = new Map();
  const installationId = "fixture-installation-123456", ref = id => ({ id }), snapshot = () => ({ docs: [...records].map(([id, value]) => ({ id, ref: ref(id), data: () => value })) });
  const firestore = { doc: (...args) => ref(args.at(-1)), collection: () => "tokens", getDocs: async () => snapshot(), serverTimestamp: Date.now,
    setDoc: async (r, value, options) => { records.set(r.id, { ...(options?.merge ? records.get(r.id) : {}), ...value }); }, deleteDoc: async r => { records.delete(r.id); } };
  let token = "first-browser-token", deleted = 0, permission = "granted";
  const messaging = { getToken: async () => token, deleteToken: async () => { deleted++; } };
  const client = { modules: { firestore, messaging }, messaging: {}, db: {}, user: {}, notificationToken: "", notificationTokenId: "" };
  const context = { console, Promise, Date, LOCAL: true, client, navigator: { userAgent: "fixture", serviceWorker: {} }, window: { isSecureContext: true, Notification: {}, PushManager: {} },
    requireSignedIn: () => "fixture", getGameInstallationId: () => installationId, hashText: async t => t, cleanPlayerName: () => "Fixture", init: async () => {},
    getNotificationVapidKey: () => "key", getNotificationPermission: () => permission, requestNotificationPermission: async () => permission,
    isPushSupported: () => true, loadMessagingModule: async () => messaging, ensureMessaging: async () => ({}), getServiceWorkerRegistration: async () => ({}),
    setPushRegistrationState: status => ({ status, enabled: status === "enabled" }) };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("  async function saveNotificationToken"), source.indexOf("  function sanitizeForFirestore")), context);
  await context.enablePushNotifications({ category: "private" });
  assert.equal(records.get(token).privateEnabled, true); assert.equal(records.get(token).armyEnabled, false);
  await context.disablePushNotifications(); assert.equal(records.size, 1); assert.equal(deleted, 0);
  await context.enablePushNotifications(); assert.equal(records.get(token).armyEnabled, true);
  await context.disablePushNotifications({ category: "private" }); assert.equal(records.get(token).armyEnabled, true); assert.equal(records.get(token).privateEnabled, false);
  token = "rotated-browser-token";
  await Promise.all([context.enablePushNotifications({ category: "private" }), context.disablePushNotifications()]);
  assert.equal(records.size, 1); assert.equal(records.get(token).privateEnabled, true); assert.equal(records.get(token).armyEnabled, false);
  await context.disablePushNotifications({ all: true }); assert.equal(records.size, 0); assert.equal(deleted, 1);
  records.set("legacy-token", { uid: "fixture", token: "legacy-token", enabled: true, installationId }); token = "next-token";
  await context.enablePushNotifications({ category: "private" }); assert.equal(records.get(token).armyEnabled, true, "Existing attack opt-in must survive token rotation");
  await context.disablePushNotifications({ all: true }); permission = "denied";
  await assert.rejects(context.enablePushNotifications({ category: "private" })); assert.equal(records.size, 0);

  // Exercise the real permanent sender with valid synthetic browser keys. No
  // network request is made and no production subscription is read or written.
  const keys = webpush.generateVAPIDKeys(), dh = crypto.createECDH("prime256v1"); dh.generateKeys();
  const pushToken = PREFIX + Buffer.from(JSON.stringify(["https://fcm.googleapis.com/fcm/send/fixture", dh.getPublicKey().toString("base64url"), crypto.randomBytes(16).toString("base64url"), keys.publicKey])).toString("base64url");
  let delivered = 0, eligible = true, settings = { uid: "fixture", enabled: true, token: pushToken, armyEnabled: false, privateEnabled: true };
  const doc = { id: "token", data: () => settings, ref: { get: async () => ({ exists: true, data: () => settings }) } };
  const query = { where() { return this; }, limit() { return this; }, get: async () => ({ docs: [doc] }) };
  const push = Object.assign(Object.create(PermanentPush.prototype), { deployment: { assertActive: async () => {} }, keys, social: { pushEligible: async () => eligible }, store: { collection: () => query }, sender: { send: async () => { delivered++; return { accepted: true }; } } });
  const privateMessage = { type: "private_message", recipientUid: "fixture", conversationId: "a".repeat(40), messageId: "b".repeat(40), text: "Never disclose this", body: "Never disclose this" };
  const data = notificationData(privateMessage); assert(!JSON.stringify(data).includes("Never disclose")); assert.equal(data.url, "/play/");
  await push.send(privateMessage); assert.equal(delivered, 1);
  await push.send({ defenderUid: "fixture", armyId: "army" }); assert.equal(delivered, 1, "Private-only token must not get attack alerts");
  settings = { ...settings, armyEnabled: true, privateEnabled: false };
  await push.send(privateMessage); assert.equal(delivered, 1);
  await push.send({ defenderUid: "fixture", armyId: "army" }); assert.equal(delivered, 2);
  settings = { ...settings, privateEnabled: true }; eligible = false;
  await push.send(privateMessage); assert.equal(delivered, 2, "Read, block or preference change cancels delivery");
  console.log("Private/attack category isolation, legacy opt-in, rotation, simultaneous settings, logout, denied permission and redacted delivery passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
