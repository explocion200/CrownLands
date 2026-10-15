"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const webpush = require("../local-backend/node_modules/web-push");
const { Store } = require("../local-backend/store");
const { WebPushSender, subscription, endpoint, PREFIX } = require("../local-backend/web-push");
const { WebPushLoop, budgetPath } = require("../local-backend/web-push-loop");
const { incomingArmyData } = require("../functions/notification-delivery");

(async () => {
  const keys = webpush.generateVAPIDKeys(), recipient = crypto.createECDH("prime256v1"); recipient.generateKeys();
  const auth = crypto.randomBytes(16), expiresAt = new Date(Date.now() + 3600000).toISOString();
  const encode = (url, key = keys.publicKey, dh = recipient.getPublicKey().toString("base64url"), secret = auth.toString("base64url")) =>
    PREFIX + Buffer.from(JSON.stringify([url, dh, secret, key])).toString("base64url");
  const token = encode("https://fcm.googleapis.com/fcm/send/fixture_browser");
  const data = { defenderUid: "push-owner", armyId: "fixture-army", title: "Attack incoming", body: "Synthetic private test.", kind: "attack", troopEstimateMin: "10", troopEstimateMax: "20", url: "https://evil.test/" };
  let requests = 0, mode = "ok", captured;
  const fetchImpl = async (url, options) => {
    requests++; captured = { url, options }; assert.equal(options.redirect, "error"); assert(options.signal instanceof AbortSignal);
    if (mode === "throw") throw Error("secret endpoint and credential must not escape");
    if (mode === "block") return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(Error("private network failure")), { once: true }));
    return new Response(null, { status: mode === "gone" ? 410 : mode === "retry" ? 503 : 201 });
  };
  const createSender = () => new WebPushSender({ keys, expiresAt, fetchImpl });
  let sender = createSender(), loop;
  const schema = "migration_game_preview_" + crypto.randomBytes(6).toString("hex"), store = new Store({ schema });
  const scope = { schema, ownerUid: data.defenderUid, notBefore: Date.now() - 1000, expiresAt, attemptLimit: 5, reservationId: crypto.randomBytes(16).toString("hex"), publicKey: keys.publicKey };
  try {
    assert.equal(subscription(token, keys.publicKey).endpoint, "https://fcm.googleapis.com/fcm/send/fixture_browser");
    assert(token.length > 300); assert(encode("https://fcm.googleapis.com/wp/" + "a".repeat(700)).length > 512);
    for (const value of ["http://fcm.googleapis.com/wp/abc", "https://localhost/wp/abc", "https://127.0.0.1/wp/abc", "https://fcm.googleapis.com.evil.test/wp/abc",
      "https://user@fcm.googleapis.com/wp/abc", "https://fcm.googleapis.com:8443/wp/abc", "https://fcm.googleapis.com/wp/abc#x", "https://fcm.googleapis.com/wp/abc?url=http://localhost", "https://fcm.googleapis.com/wp/../admin"]) assert.throws(() => endpoint(value));
    for (const value of [token + "=", "firebase-token", encode("https://fcm.googleapis.com/wp/x", webpush.generateVAPIDKeys().publicKey), encode("https://fcm.googleapis.com/wp/x", keys.publicKey, "invalid"), encode("https://fcm.googleapis.com/wp/x", keys.publicKey, recipient.getPublicKey().toString("base64url"), "invalid")]) assert.throws(() => subscription(value, keys.publicKey));
    assert.throws(() => new WebPushSender({ keys: { ...keys, privateKey: webpush.generateVAPIDKeys().privateKey }, expiresAt }));
    await sender.send(token, data, { topic: "fixture" });
    assert.equal(captured.options.headers["Content-Encoding"], "aes128gcm");
    assert.match(captured.options.headers.Authorization, /^vapid t=/);
    assert(!captured.options.body.includes(Buffer.from(data.body)));
    // Independently decrypt RFC 8291 payload with the browser's key, verifying
    // real encryption rather than a mocked library call or opaque byte check.
    const body = captured.options.body, salt = body.subarray(0, 16), serverKey = body.subarray(21, 21 + body[20]);
    const secret = recipient.computeSecret(serverKey);
    const ikm = Buffer.from(crypto.hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), recipient.getPublicKey(), serverKey]), 32));
    const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
    const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
    const encrypted = body.subarray(21 + body[20]), decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
    decipher.setAuthTag(encrypted.subarray(-16));
    const plaintext = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
    assert.equal(plaintext.at(-1), 2);
    const decoded = JSON.parse(plaintext.subarray(0, -1).toString());
    assert.deepEqual(decoded.data, { ...incomingArmyData(data), url: "/api/local-game/rehearsal/" });
    mode = "throw"; await assert.rejects(sender.send(token, data, { topic: "fixture" }), error => error.message === "Browser notification delivery is unavailable." && !JSON.stringify(error).includes("secret"));
    mode = "ok"; const before = requests;
    await assert.rejects(sender.send(token, data, { topic: "fixture", reserve: async () => { sender.stop(); } }), { code: "push-stopped" }); assert.equal(requests, before);
    sender = createSender(); requests = 0;
    await store.initialize(); await store.doc(budgetPath(scope)).create({ ...scope, attempts: 0 });
    const register = async (id, value, overrides = {}) => store.doc(`players/${data.defenderUid}/notificationTokens/${id}`).set({ uid: data.defenderUid, enabled: true, token: value,
      installationId: "fixture-installation-123456789", lastSeenAtMs: Date.now(), ...overrides });
    await register("a", token); await register("b", encode("https://updates.push.services.mozilla.com/wpush/v2/fixture"));
    await register("firebase", "existing-firebase-token-preserved"); await register("stale", token, { lastSeenAtMs: scope.notBefore - 1 });
    await register("different-key", encode("https://fcm.googleapis.com/wp/other", webpush.generateVAPIDKeys().publicKey));
    const issue = async (id, overrides = {}) => { const ref = store.doc("serverNotificationOutbox/" + id); await ref.create({ type: "incoming_army", status: "pending", notification: data, createdAtMs: Date.now(), expiresAtMs: Date.now() + 60000, ...overrides }); return ref; };
    const old = await issue("old", { createdAtMs: scope.notBefore - 1 });
    const other = await issue("other", { notification: { ...data, defenderUid: "not-owner" } });
    const item = await issue("new");
    sender.fetch = async (...args) => { mode = requests === 1 ? "retry" : "ok"; return fetchImpl(...args); };
    loop = new WebPushLoop({ store, sender, scope });
    await Promise.all([loop.tick(), loop.tick()]); assert.equal(requests, 2);
    assert.deepEqual((await item.get()).data().completedTokenIds, ["a"]); assert.equal((await item.get()).data().status, "pending");
    await loop.tick(); assert.equal(requests, 3); assert.equal((await item.get()).data().status, "delivered");
    await loop.tick(); assert.equal(requests, 3);
    assert.equal((await old.get()).data().status, "pending"); assert.equal((await other.get()).data().status, "pending");
    loop.stop(); sender = createSender(); loop = new WebPushLoop({ store, sender, scope });
    await loop.tick(); assert.equal(requests, 3, "A process restart retains completed delivery receipts");
    mode = "gone"; const gone = await issue("gone"); await loop.tick();
    assert.equal((await gone.get()).data().status, "skipped");
    assert.equal((await store.doc(`players/${data.defenderUid}/notificationTokens/a`).get()).exists, false);
    assert.equal((await store.doc(`players/${data.defenderUid}/notificationTokens/firebase`).get()).exists, true);
    assert.equal((await store.doc(budgetPath(scope)).get()).data().attempts, 5);
    await issue("over-limit"); await loop.tick(); assert.equal(requests, 5); assert.equal(loop.stopped, true);
    assert.equal(JSON.stringify(await loop.status()).includes(data.defenderUid), false);
    // Expiry/stop during transport aborts its signal and preserves the budget;
    // there is no unbounded pending retry after shutdown.
    sender = createSender(); mode = "block";
    const blocked = sender.send(token, data, { topic: "fixture" });
    await new Promise(resolve => setImmediate(resolve)); sender.stop(); await assert.rejects(blocked);
    console.log("Local Web Push: real payload decryption, endpoint/key rejection, owner scope, copied-token isolation, partial retry, restart receipts, gone-token cleanup, durable attempt cap and shutdown passed.");
  } finally { loop?.stop(); sender.stop(); await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await store.close(); }
})().catch(() => { console.error("Local Web Push validation failed; sensitive request data suppressed."); process.exitCode = 1; });
