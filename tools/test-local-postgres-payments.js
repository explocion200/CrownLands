"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");
const Stripe = require("../functions/node_modules/stripe");
const { Store } = require("../local-backend/store");
const { createPaymentWebhookServer } = require("../local-backend/payment-webhooks");
const { createLiveCrownPaymentsService } = require("../functions/crown-live-payments-service");
const { createCrownPaymentsService } = require("../functions/crown-payments-service");
const P = require("../functions/crown-live-payments");
const pause = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

(async () => {
  const store = new Store({ schema: "migration_game_pay_test_" + crypto.randomBytes(6).toString("hex") });
  const uid = "fixture-owner", secret = "whsec_local_synthetic_fixture", servers = [];
  const pack = { id: "crowns_1000", priceId: "price_fixture", crowns: 1000, amountMinor: 499, currency: "usd" };
  const request = { requestId: "fixture_request_001", packId: pack.id, expectedAmountMinor: 499, expectedCurrency: "usd", expectedCrowns: 1000 };
  const walletRef = store.doc(`players/${uid}/cosmetics/state`);
  const wallet = { version: 1, crowns: 29, revision: 4, owned: { halloween_city: true }, equipped: { city: "halloween_city" }, crownPickups: 9 };
  let clock = Date.now(), retrieveFailure = false, waitRetrieve, enteredRetrieve, lostCreateResponse = false;
  const fixtures = {};
  for (const mode of ["live", "test"]) {
    const live = mode === "live", sessions = new Map(), keys = new Map();
    const client = {
      prices: { retrieve: async id => ({ id, livemode: live, active: true, type: "one_time", billing_scheme: "per_unit", unit_amount: 499, currency: "usd", tax_behavior: "inclusive" }) },
      checkout: { sessions: {
        create: async (params, options) => {
          assert.equal(options.apiVersion, "2026-08-26.dahlia");
          let session = keys.get(options.idempotencyKey);
          if (!session) {
            session = { id: `cs_${mode}_fixture${keys.size + 1}`, livemode: live, mode: "payment", client_reference_id: params.client_reference_id,
              metadata: params.metadata, payment_intent: `pi_fixture${keys.size + 1}`, automatic_tax: { enabled: true, status: "complete" },
              consent: { terms_of_service: "accepted" }, total_details: { amount_discount: 0, amount_shipping: 0 }, currency: "usd", amount_total: 499,
              payment_status: "unpaid", status: "open", url: "https://checkout.stripe.com/c/pay/fixture",
              line_items: { has_more: false, data: [{ price: { id: pack.priceId, tax_behavior: "inclusive" }, quantity: 1, amount_total: 499 }] } };
            sessions.set(session.id, session); keys.set(options.idempotencyKey, session);
          }
          if (lostCreateResponse) { lostCreateResponse = false; throw Error("Synthetic lost response"); }
          return structuredClone(session);
        },
        retrieve: async id => {
          if (enteredRetrieve) enteredRetrieve.resolve();
          if (waitRetrieve) await waitRetrieve.promise;
          if (retrieveFailure) throw Error("Synthetic sensitive provider error must stay private");
          return structuredClone(sessions.get(id));
        },
      } },
      paymentIntents: { retrieve: async id => {
        const session = [...sessions.values()].find(value => value.payment_intent === id);
        return { id, metadata: session.metadata, livemode: live, amount: 499, currency: "usd" };
      } },
    };
    const service = (live ? createLiveCrownPaymentsService : createCrownPaymentsService)({ db: store, stripe: () => client, now: () => clock });
    fixtures[mode] = { service, sessions, keys };
  }
  const { live, test } = fixtures;
  const config = () => ({ store, expiresAt: new Date(clock + 3600000).toISOString(), now: () => clock,
    live: { ...live.service, verify: (rawBody, signature) => Stripe.webhooks.constructEvent(rawBody, signature, secret) },
    test: { ...test.service, verify: (rawBody, signature) => Stripe.webhooks.constructEvent(rawBody, signature, secret) } });
  const open = async options => {
    const server = createPaymentWebhookServer({ ...config(), ...options }); servers.push(server);
    server.listen(0, "127.0.0.1"); await once(server, "listening"); return server;
  };
  const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const event = (session, overrides = {}) => ({ id: "evt_fixture", object: "event", livemode: session.livemode,
    type: "checkout.session.completed", data: { object: session }, ...overrides });
  const send = (server, value, options = {}) => new Promise((resolve, reject) => {
    const payload = options.payload ?? JSON.stringify(value, null, 2); // Signature must preserve whitespace.
    const signature = options.signature ?? Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: options.timestamp });
    const headers = { Host: "playcrownlands.com", "Content-Type": "application/json", "Stripe-Signature": signature, ...options.headers };
    if (options.omitSignature) delete headers["Stripe-Signature"];
    const req = http.request({ host: "127.0.0.1", port: server.address().port,
      path: options.path ?? "/api/local-payments/stripe/live", method: options.method ?? "POST",
      headers }, res => {
      let body = ""; res.on("data", chunk => { body += chunk; }); res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    if (options.partial) req.write(payload.slice(0, 1)); else req.end(payload);
  });
  try {
    await store.initialize();
    for (const bad of [{ expiresAt: new Date(clock - 1).toISOString() }, { maxConcurrent: 0 }, { requestBudgetMs: Infinity }, { bodyBudgetMs: 0 }, { live: {}, test: undefined }]) {
      assert.throws(() => createPaymentWebhookServer({ ...config(), ...bad }));
    }
    await store.doc("serverConfig/crownLivePayments").set({ enabled: true, mode: "live", launchApproved: true, taxReviewed: true,
      refundPolicy: "manual_review", countryPolicy: "worldwide", supportEmail: P.SUPPORT_EMAIL, packs: [pack] });
    await store.doc("serverConfig/crownPayments").set({ enabled: true, mode: "test", testerUids: [uid], packs: [pack] });
    await walletRef.set(wallet);
    lostCreateResponse = true;
    await assert.rejects(live.service.create(uid, request), /lost response/);
    const creates = await Promise.all(Array.from({ length: 4 }, () => live.service.create(uid, request)));
    assert.equal(live.keys.size, 1); assert.equal(new Set(creates.map(value => value.order.orderId)).size, 1);
    const session = live.sessions.get("cs_live_fixture1"), orderId = creates[0].order.orderId;
    await assert.rejects(live.service.status("other-owner", orderId), /not found/);
    let server = await open();
    assert.equal((await send(server, event(session))).status, 200);
    assert.deepEqual((await walletRef.get()).data(), wallet, "An unpaid checkout cannot credit Crowns");
    for (const [value, options, status] of [
      [event(session), { signature: "invalid" }, 400], [event(session), { timestamp: 1 }, 400],
      [event(session), { omitSignature: true }, 400],
      [event(session), { signature: ["one", "two"] }, 400],
      [event(session, { livemode: false }), {}, 400], [event(session, { account: "acct_other" }), {}, 400],
      [event(session), { headers: { Host: "other.example" } }, 421],
      [event(session), { method: "GET" }, 405], [event(session), { path: "/api/local-payments/stripe/live?extra=1" }, 404],
      [event(session), { headers: { "Content-Encoding": "gzip" } }, 415],
      [event(session), { headers: { "Content-Type": "text/plain" } }, 415],
      [event(session), { payload: "x".repeat(262145) }, 413],
      [event(session), { payload: "null" }, 500],
    ]) assert.equal((await send(server, value, options)).status, status);
    const originalPayload = JSON.stringify(event(session));
    assert.equal((await send(server, event(session), { payload: originalPayload + " ", signature: Stripe.webhooks.generateTestHeaderString({ payload: originalPayload, secret }) })).status, 400);
    Object.assign(session, { payment_status: "paid", status: "complete", url: null });
    session.amount_total = 1;
    assert.equal((await send(server, event(session))).status, 500);
    assert.deepEqual((await walletRef.get()).data(), wallet, "Signed events still require matching provider payment evidence");
    session.amount_total = 499;
    retrieveFailure = true;
    const failed = await send(server, event(session)); assert.equal(failed.status, 500); assert(!failed.body.includes("sensitive"));
    assert.deepEqual((await walletRef.get()).data(), wallet); retrieveFailure = false;
    const duplicates = await Promise.all(Array.from({ length: 12 }, () => send(server, event(session))));
    for (const response of duplicates) {
      assert([200, 503].includes(response.status));
      if (response.status === 503) assert.equal((await send(server, event(session))).status, 200);
    }
    assert.deepEqual((await walletRef.get()).data(), { ...wallet, crowns: 1029, revision: 5 });
    await close(server); server = await open();
    assert.equal((await send(server, event(session))).status, 200, "Receipt survives HTTP service restart");
    assert.equal((await walletRef.get()).data().crowns, 1029);
    const changes = await store.pool.query(`SELECT count(*)::int AS n FROM ${store.schema}.changes WHERE path=$1`, [walletRef.path]);
    assert.equal(changes.rows[0].n, 2, "Only initialization and one credit change were committed");

    // Signed refunds are recorded once for manual review, without subtracting funds.
    const refund = event(session, { id: "evt_refund", type: "refund.created", data: { object: { id: "re_fixture", payment_intent: session.payment_intent, status: "pending" } } });
    assert.deepEqual(await Promise.all(Array.from({ length: 4 }, () => send(server, refund).then(value => value.status))), [200, 200, 200, 200]);
    assert.equal((await store.doc("crownPaymentReviews/evt_refund").get()).data().status, "pending_manual_review");
    assert.equal((await walletRef.get()).data().crowns, 1029);

    // Test purchases stay in the sandbox wallet even through the native HTTP route.
    await test.service.create(uid, request); const testSession = test.sessions.get("cs_test_fixture1");
    Object.assign(testSession, { payment_status: "paid", status: "complete", url: null });
    const testPath = "/api/local-payments/stripe/test";
    assert.equal((await send(server, event(session), { path: testPath })).status, 400);
    assert.equal((await send(server, event(testSession))).status, 400);
    assert.equal((await send(server, event(testSession), { path: testPath })).status, 200);
    assert.equal((await send(server, event(testSession), { path: testPath })).status, 200);
    assert.equal((await store.doc(`players/${uid}/crownPaymentSandbox/state`).get()).data().crowns, 1000);
    assert.equal((await walletRef.get()).data().crowns, 1029);

    // A provider call outliving the HTTP deadline retains its admission slot and
    // cannot commit a late credit. A later retry performs the one valid credit.
    await live.service.create(uid, { ...request, requestId: "fixture_request_002" });
    const lateSession = live.sessions.get("cs_live_fixture2"); Object.assign(lateSession, { payment_status: "paid", status: "complete", url: null });
    const lateSettled = pause();
    const bounded = await open({ maxConcurrent: 1, requestBudgetMs: 40, bodyBudgetMs: 40,
      live: { ...config().live, reconcile: async id => { try { return await live.service.reconcile(id); } finally { lateSettled.resolve(); } } } });
    const slow = await send(bounded, event(lateSession), { partial: true }); assert.equal(slow.status, 408);
    waitRetrieve = pause(); enteredRetrieve = pause();
    const late = send(bounded, event(lateSession)); await enteredRetrieve.promise;
    assert.equal((await late).status, 504);
    assert.equal((await send(bounded, event(lateSession))).status, 503);
    waitRetrieve.resolve(); waitRetrieve = null; enteredRetrieve = null;
    // Wait for the actual handler settlement, then check the durable state.
    await lateSettled.promise;
    await close(bounded);
    assert.equal((await walletRef.get()).data().crowns, 1029);
    const concurrentCredit = await Promise.all([
      send(server, event(lateSession)),
      store.runTransaction(async transaction => {
        const current = (await transaction.get(walletRef)).data();
        transaction.update(walletRef, { crowns: current.crowns + 7, revision: current.revision + 1 });
      }),
    ]);
    assert.equal(concurrentCredit[0].status, 200);
    assert.equal((await walletRef.get()).data().crowns, 2036, "Concurrent game credit and payment both survive");
    await send(server, event(lateSession)); assert.equal((await walletRef.get()).data().crowns, 2036);

    const overflow = await live.service.create(uid, { ...request, requestId: "fixture_request_003" });
    const overflowSession = live.sessions.get("cs_live_fixture3"); Object.assign(overflowSession, { payment_status: "paid", status: "complete", url: null });
    await walletRef.update({ crowns: Number.MAX_SAFE_INTEGER });
    assert.equal((await send(server, event(overflowSession))).status, 500);
    assert.equal((await walletRef.get()).data().crowns, Number.MAX_SAFE_INTEGER);
    assert.equal((await store.doc(`crownPaymentOrders/${overflow.order.orderId}`).get()).data().status, "awaiting_payment", "Credit failure cannot commit the order receipt");
    clock += 3600001;
    assert.equal((await send(server, event(session))).status, 404);
    console.log("Local PostgreSQL payments: raw signed HTTP, mode isolation, duplicate/restart receipts, refund review, retry failure, bounded body/deadline and late-credit fencing passed using synthetic providers only.");
  } finally {
    if (waitRetrieve) waitRetrieve.resolve();
    for (const server of servers) if (server.listening) await close(server);
    await store.pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`); await store.close();
  }
})().catch(error => { console.error("Local payment fixture failed:", error); process.exitCode = 1; });
