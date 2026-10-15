"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Stripe = require("../functions/node_modules/stripe");
const { Store } = require("../local-backend/store");
const { createProviderRehearsal, PURPOSE } = require("../local-backend/payment-provider-rehearsal");
const { readPrivate, listen } = require("./local-migration/rehearse_stripe_payments");

(async () => {
  const store = new Store({ schema: "migration_game_paytest_" + crypto.randomBytes(6).toString("hex") });
  const ownerUid = "synthetic-payment-owner", marker = crypto.randomBytes(16).toString("hex"), secret = "whsec_syntheticOnly123";
  const pack = { id: "crowns_1000", crowns: 1000, amountMinor: 499, currency: "usd", priceId: "price_synthetic" };
  let now = Date.now(), session, created = 0, expireCalls = 0, holdRead, readStarted;
  const options = { store, apiKey: "sk_test_syntheticOnly123", webhookSecret: secret, marker, ownerUid, expiresAt: new Date(now + 60000).toISOString(), now: () => now };
  class Provider {
    constructor(key, config) { assert.equal(key, options.apiKey); assert.equal(config.timeout, 10000); assert.equal(config.maxNetworkRetries, 0); }
    balance = { retrieve: async () => ({ livemode: false }) };
    prices = { retrieve: async () => ({ id: pack.priceId, active: true, livemode: false, type: "one_time", billing_scheme: "per_unit", unit_amount: 499, currency: "usd" }) };
    checkout = { sessions: {
      create: async (params, config) => {
        created++; assert.equal(params.metadata.purpose, PURPOSE); assert.equal(params.metadata.migrationMarker, marker);
        assert.match(config.idempotencyKey, /^crown-test-/);
        session = { id: "cs_test_synthetic123", livemode: false, mode: "payment", status: "open", payment_status: "unpaid", url: "https://checkout.stripe.com/c/pay/synthetic",
          client_reference_id: params.client_reference_id, metadata: params.metadata, currency: "usd", amount_total: 499,
          line_items: { has_more: false, data: [{ price: { id: pack.priceId }, quantity: 1, amount_total: 499 }] } };
        return structuredClone(session);
      }, retrieve: async () => { if (readStarted) readStarted(); if (holdRead) await holdRead; return structuredClone(session); }, expire: async () => { expireCalls++; session.status = "expired"; },
    } };
  }
  options.StripeClass = Provider;
  const runtime = createProviderRehearsal(options);
  const privateRoot = path.join(os.homedir(), ".local/share/crownlands");
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const directory = fs.mkdtempSync(path.join(privateRoot, "synthetic-payment-provider-"));
  const request = { requestId: "synthetic-request-123", packId: pack.id, expectedCrowns: 1000, expectedAmountMinor: 499, expectedCurrency: "usd" };
  function post(event) {
    const raw = JSON.stringify(event), signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret });
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: runtime.server.address().port, path: "/api/local-payments/stripe/test", method: "POST",
        headers: { Host: "playcrownlands.com", "Content-Type": "application/json", "Stripe-Signature": signature } }, res => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
      req.on("error", reject); req.end(raw);
    });
  }
  try {
    const keyFile = path.join(directory, "synthetic-key"); fs.writeFileSync(keyFile, "synthetic-only", { mode: 0o600 });
    assert.equal(readPrivate(keyFile), "synthetic-only"); fs.chmodSync(keyFile, 0o644); assert.throws(() => readPrivate(keyFile));
    assert.throws(() => readPrivate(__filename));
    const fakeCli = path.join(directory, "fake-cli");
    fs.writeFileSync(fakeCli, `#!${process.execPath}\nprocess.stdout.write('Ready! whsec_syntheticFixture123\\n'); setInterval(()=>{},1000);\n`, { mode: 0o700 });
    const forwarded = listen(fakeCli, { ...process.env }, 12345, "whsec_syntheticFixture123");
    await forwarded.ready; const exited = new Promise(resolve => forwarded.process.once("exit", resolve)); forwarded.process.kill("SIGTERM"); await exited;
    const wrongSecret = listen(fakeCli, { ...process.env }, 12345, "whsec_expectedOther123");
    await assert.rejects(wrongSecret.ready, /secret changed/);
    await store.initialize();
    await store.doc("serverConfig/crownPayments").set({ enabled: true, mode: "test", testerUids: [ownerUid], packs: [pack] });
    await store.doc("players/" + ownerUid).set({ crowns: 37 });
    for (const bad of [{ apiKey: "sk_live_forbidden123" }, { marker: "invalid" }, { expiresAt: new Date(now - 1).toISOString() }]) assert.throws(() => createProviderRehearsal({ ...options, ...bad }));
    assert.throws(() => runtime.create("another-account", request));
    await runtime.verifyProvider(); const checkout = await runtime.create(ownerUid, request);
    assert.equal(created, 1); assert.equal(checkout.order.mode, "test");
    await new Promise(resolve => runtime.server.listen(0, "127.0.0.1", resolve));
    session.status = "complete"; session.payment_status = "paid";
    const event = { id: "evt_synthetic", livemode: false, type: "checkout.session.completed", data: { object: structuredClone(session) } };
    // Existing Firebase test purpose and another local run are acknowledged but
    // never queried or credited by this private receiver.
    for (const metadata of [{ ...session.metadata, purpose: "crownlands_crowns_test" }, { ...session.metadata, migrationMarker: "0".repeat(32) }]) {
      assert.equal(await post({ ...event, data: { object: { ...session, metadata } } }), 200);
      assert.deepEqual(runtime.counts(), { verifiedOwnEvents: 0, reconciledEvents: 0 });
    }
    assert.equal(await post({ ...event, livemode: true }), 400);
    assert.equal(await post({ ...event, account: "acct_other" }), 400);
    assert.equal(await post(event), 200); assert.equal(await post(event), 200);
    assert.equal((await store.doc(`players/${ownerUid}/crownPaymentSandbox/state`).get()).data().crowns, 1000);
    assert.equal((await store.doc("players/" + ownerUid).get()).data().crowns, 37);
    assert.equal((await runtime.status(ownerUid, checkout.order.orderId)).order.status, "confirmed");
    session.metadata.migrationMarker = "0".repeat(32);
    assert.equal(await post(event), 500);
    await assert.rejects(runtime.expireSession(session.id)); assert.equal(expireCalls, 0);
    session.metadata.migrationMarker = marker; session.status = "open";
    await runtime.expireSession(session.id); assert.equal(expireCalls, 1);
    await runtime.create(ownerUid, { ...request, requestId: "stopping-checkout-123" });
    session.status = "complete"; session.payment_status = "paid";
    const nextEvent = { ...event, data: { object: structuredClone(session) } };
    let release; holdRead = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { readStarted = resolve; });
    const inFlight = post(nextEvent); await entered; runtime.stop(); release();
    assert.equal(await inFlight, 500); assert.equal(await post(nextEvent), 404);
    assert.equal((await store.doc(`players/${ownerUid}/crownPaymentSandbox/state`).get()).data().crowns, 1000);
    await assert.rejects(runtime.create(ownerUid, { ...request, requestId: "after-stop-123" }));
    const expiring = createProviderRehearsal(options); now += 60001;
    await assert.rejects(expiring.verifyProvider()); expiring.stop(); expiring.server.close();
    console.log("Test provider bridge: test keys only, isolated metadata/owner/schema, signed event filtering, provider evidence validation, duplicate delivery, unchanged playable Crowns and expiry/cleanup fences passed.");
  } finally { runtime.stop(); await new Promise(resolve => runtime.server.close(resolve)); await store.pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`); await store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error("Synthetic provider bridge test failed:", error.message); process.exitCode = 1; });
