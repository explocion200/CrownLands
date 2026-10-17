"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { createService, cacheKey } = require("../functions/chat-translation");
const fail = (code, message, details) => Object.assign(Error(message), { code, details });

(async () => {
  const db = new Store({ schema: "migration_game_smooth_" + crypto.randomBytes(5).toString("hex") });
  try {
    await db.initialize();
    const ref = db.doc("projections/fixture");
    await ref.set({ total: 10, label: "same" });
    let attempts = 0;
    await db.runTransaction(async tx => {
      attempts++;
      const snapshot = await tx.get(ref);
      await ref.update({ total: 11 });
      tx.update(ref, { label: snapshot.data().label });
    }, { maxAttempts: 1 });
    assert.equal(attempts, 1, "An unchanged projection must not conflict with an unrelated field update");
    assert.deepEqual((await ref.get()).data(), { total: 11, label: "same" });
    assert.equal((await db.pool.query(`SELECT count(*) FROM ${db.schema}.changes WHERE path=$1`, [ref.path])).rows[0].count, "2", "No-op produced an outbox event");
    // A genuinely stale write must still abort, including all accompanying writes.
    const receipt = db.doc("receipts/conflict");
    await assert.rejects(db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      await ref.update({ total: 12 });
      tx.update(ref, { total: snapshot.data().total + 5 }); tx.create(receipt, { done: true });
    }, { maxAttempts: 1 }), { code: "aborted" });
    assert.equal((await ref.get()).data().total, 12); assert.equal((await receipt.get()).exists, false);

    const access = db.doc("translationAccess/fixture"); await access.set({ allowed: true });
    const now = () => Date.UTC(2030, 0, 1);
    const authorize = async tx => {
      if (!(await tx.get(access)).data().allowed) throw fail("permission-denied", "Revoked");
      return { messageCollection: "translationMessages", isVisible: message => message.visible };
    };
    const id = "a".repeat(40), message = db.doc("translationMessages/" + id);
    await message.set({ text: "Bonjour", visible: true });
    const request = uid => ({ auth: { uid }, data: { channel: "clan", clanId: "fixture", messageIds: [id], targetLanguage: "en" } });
    const reasons = [], waits = []; let calls = 0, release, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    const options = { db, authorize, now, fail, diagnostic: reason => reasons.push(reason) };
    const first = createService({ ...options, provider: async texts => {
      calls++; assert.deepEqual(texts, ["Bonjour"]); entered(); await blocked; return ["Hello"];
    }})(request("first"));
    await ready;
    // Independent service instances share only PostgreSQL, like separate processes.
    const second = createService({ ...options, provider: async () => { throw Error("Duplicate provider request"); },
      wait: async ms => { waits.push(ms); release(); await first; }
    })(request("second"));
    const results = await Promise.all([first, second]);
    assert.deepEqual(results[0], results[1]); assert.equal(calls, 1); assert.deepEqual(waits, [20]);
    assert.equal((await db.doc("chatTranslationUsage/2030-01").get()).data().reservedCharacters, 7);
    assert.equal((await db.doc("serverRateLimits/translation_second").get()).data().count, 1);
    assert.deepEqual(reasons, []);

    const cache = db.doc("chatTranslationCache/" + cacheKey(message.path, "Bonjour", "en"));
    await cache.set({ state: "pending", leaseUntilMs: now() + 30000, owner: "fixture" });
    const revoked = createService({ ...options, provider: async () => { throw Error("Unexpected provider"); },
      wait: async () => { await access.update({ allowed: false }); } });
    await assert.rejects(revoked(request("revoked")), { code: "permission-denied" });
    await access.update({ allowed: true });
    const bounded = [];
    const timeout = createService({ ...options, provider: async () => { throw Error("Unexpected provider"); }, wait: async ms => bounded.push(ms) });
    await assert.rejects(timeout(request("timeout")), error => error.code === "unavailable" && error.details.reason === "translation-pending");
    assert.deepEqual(bounded, [20, 40, 80, 160, 320, 640]); assert.deepEqual(reasons, ["pending-timeout"]);
    assert.equal((await db.doc("chatTranslationUsage/2030-01").get()).data().reservedCharacters, 7);
    assert.equal((await db.doc("serverRateLimits/translation_timeout").get()).exists, false);
    // A deleted source must be rejected after waiting even if its cache becomes ready.
    const deleted = createService({ ...options, provider: async () => { throw Error("Unexpected provider"); }, wait: async () => {
      await message.delete(); await cache.set({ state: "ready", text: "Secret stale result", expiresAtMs: now() + 1000 });
    }});
    await assert.rejects(deleted(request("deleted")), { code: "not-found" });
    console.log("Smoothness: no-op projection avoids a false conflict; real stale writes/receipts still abort. Independent translation readers share one reservation/result with bounded waiting, per-caller rate limits, revoked-access/deletion checks and private-safe diagnostics.");
  } finally {
    await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
