"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createLiveCrownPaymentsService } = require("../crown-live-payments-service");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error("Emulator only");
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();

async function main() {
  const nonce = crypto.randomBytes(6).toString("hex"), uid = `crown-test-${nonce}`;
  const pack = { id: "crowns_1000", priceId: "price_fixture", crowns: 1000, amountMinor: 499, currency: "usd" };
  const configRef = db.doc("serverConfig/crownLivePayments"), previousConfig = await configRef.get();
  const sessions = new Map(), keys = new Map(); let clock = Date.now(), loseResponse = false, tamper = null, earlyWebhook = false;
  const fake = { prices: { retrieve: async id => ({ id, livemode: true, active: true, type: "one_time", billing_scheme: "per_unit", unit_amount: 499, currency: "usd", tax_behavior: "inclusive" }) }, checkout: { sessions: {
    create: async (params, options) => {
      assert.equal(options.apiVersion, "2026-08-26.dahlia", "Card-only checkout requires the supported pre-Endive API contract");
      assert.deepEqual(params.payment_method_types, ["card"]);
      assert.equal(params.automatic_tax.enabled, true);
      assert.equal(params.consent_collection.terms_of_service, "required");
      assert.equal(params.shipping_address_collection, undefined, "Digital purchases have no country allowlist");
      let session = keys.get(options.idempotencyKey);
      if (!session) {
        session = { id: `cs_live_${keys.size + 1}`, livemode: true, mode: "payment", client_reference_id: params.client_reference_id,
          metadata: params.metadata, payment_intent: `pi_fixture${keys.size + 1}`, automatic_tax: { enabled: true, status: "complete" }, consent: { terms_of_service: "accepted" }, total_details: { amount_discount: 0, amount_shipping: 0 }, currency: "usd", amount_total: 499, payment_status: "unpaid", status: "open",
          url: "https://checkout.stripe.com/c/pay/fixture", line_items: { has_more: false, data: [{ price: { id: "price_fixture", tax_behavior: "inclusive" }, quantity: 1, amount_total: 499 }] } };
        keys.set(options.idempotencyKey, session); sessions.set(session.id, session);
      }
      if (loseResponse) { loseResponse = false; throw Error("Response lost after Stripe created the checkout"); }
      if (earlyWebhook) {
        earlyWebhook = false;
        const staleResponse = structuredClone(session);
        Object.assign(session, { payment_status: "paid", status: "complete", url: null });
        await service.reconcile(session.id);
        return staleResponse;
      }
      return structuredClone(session);
    },
    retrieve: async id => ({ ...structuredClone(sessions.get(id)), ...(tamper || {}) }),
  } } };
  const service = createLiveCrownPaymentsService({ db, stripe: () => fake, now: () => clock });
  const request = { requestId: "test_request_0001", packId: "crowns_1000", expectedAmountMinor: 499, expectedCurrency: "usd", expectedCrowns: 1000 };
  const realRef = db.doc(`players/${uid}/cosmetics/state`), sandboxRef = db.doc(`players/${uid}/crownPaymentSandbox/state`);
  const realWallet = { version: 1, crowns: 29, owned: { halloween_city: true }, equipped: { city: "halloween_city" }, revision: 4, pickupDay: "2026-10-04", crownPickups: 9 };
  try {
    await configRef.set({ enabled: false });
    assert.equal((await service.catalog(uid)).enabled, false);
    await assert.rejects(service.create(uid, request), /not enabled/);
    await configRef.set({ enabled: true, mode: "live", launchApproved: true, taxReviewed: true, refundPolicy: "manual_review", countryPolicy: "worldwide", supportEmail: "crownlandsmail@gmail.com", packs: [pack] });
    await realRef.set(realWallet);
    assert.equal((await service.catalog("stranger")).enabled, true);
    await assert.rejects(service.create(uid, { ...request, expectedAmountMinor: 1 }), /changed/);
    await assert.rejects(service.create(uid, { ...request, expectedCrowns: 100000 }), /changed/);
    loseResponse = true;
    await assert.rejects(service.create(uid, request), /Response lost/);
    const recovered = (await service.catalog(uid)).latestOrder;
    assert.equal(recovered.requestId, request.requestId); assert.equal(recovered.status, "creating");
    const retries = await Promise.all(Array.from({ length: 8 }, () => service.create(uid, request)));
    assert.equal(keys.size, 1); assert.equal(new Set(retries.map(result => result.order.orderId)).size, 1);
    const order = retries[0].order, sessionId = [...sessions.keys()][0];
    assert.equal(order.status, "awaiting_payment");
    await assert.rejects(service.create(uid, { ...request, requestId: "different_request" }), /existing checkout/);
    await assert.rejects(service.status("stranger", order.orderId), /not found/);
    await service.reconcile(sessionId); assert.deepEqual((await realRef.get()).data(), realWallet);
    for (const bad of [{ livemode: false }, { amount_total: 1 }, { currency: "eur" }, { client_reference_id: "other" },
      { line_items: { has_more: true, data: [] } }, { line_items: { has_more: false, data: [{ price: { id: "price_other" }, quantity: 1, amount_total: 499 }] } }]) {
      tamper = bad; await assert.rejects(service.reconcile(sessionId), /does not match/);
    }
    tamper = null;
    Object.assign(sessions.get(sessionId), { payment_status: "paid", status: "complete", url: null });
    await Promise.all(Array.from({ length: 12 }, () => service.reconcile(sessionId)));
    assert.equal((await realRef.get()).data().crowns, 1029);
    assert.equal((await service.status(uid, order.orderId)).order.status, "confirmed");
    assert.equal((await service.create(uid, request)).url, null);
    assert.deepEqual((await realRef.get()).data(), { ...realWallet, crowns: 1029, revision: 5 }, "Credit preserves ownership, equipment and pickup allowance");
    assert.equal((await sandboxRef.get()).exists, false, "Live payments never touch the sandbox wallet");
    // A browser reset/season transition cannot replay the permanent test receipt.
    await service.reconcile(sessionId); assert.equal((await realRef.get()).data().crowns, 1029);
    const next = await service.create(uid, { ...request, requestId: "test_request_0002" });
    Object.assign(sessions.get("cs_live_2"), { status: "expired" });
    assert.equal((await service.status(uid, next.order.orderId)).order.status, "expired");
    assert.equal((await realRef.get()).data().crowns, 1029);
    loseResponse = true;
    await assert.rejects(service.create(uid, { ...request, requestId: "test_request_0003" }), /Response lost/);
    const orphan = (await service.catalog(uid)).latestOrder;
    clock += 61 * 60 * 1000;
    assert.equal((await service.status(uid, orphan.orderId)).order.status, "expired");
    earlyWebhook = true;
    const raced = await service.create(uid, { ...request, requestId: "test_request_0004" });
    assert.equal(raced.order.status, "confirmed", "A webhook before creation returns must keep its confirmed receipt");
    assert.equal(raced.url, null);
    assert.equal((await realRef.get()).data().crowns, 2029);
    const cosmeticService = require("../cosmetics-service").createCosmeticsService({ db,
      HttpsError: class extends Error {}, runTransaction: action => db.runTransaction(action), assertCurrentPlayerProfile() {} });
    const prior = (await realRef.get()).data();
    const concurrent = await service.create(uid, { ...request, requestId: "concurrent_wallet" });
    Object.assign(sessions.get("cs_live_5"), { payment_status: "paid", status: "complete", url: null });
    await realRef.set({ ...prior, owned: {}, crowns: 2029 });
    await Promise.all([
      service.reconcile("cs_live_5"),
      cosmeticService.purchase(uid, { requestId: "skin_purchase_0001", offerId: "halloween_city", expectedPrice: 600, catalogVersion: 1 }, Date.UTC(2026, 9, 5)),
      db.runTransaction(async transaction => { const snap = await transaction.get(realRef); transaction.set(realRef, require("../cosmetics").collectCrown(snap.data(), Date.UTC(2026, 9, 5))); }),
    ]);
    assert.equal((await realRef.get()).data().crowns, 2430);
    assert.equal((await realRef.get()).data().owned.halloween_city, true);
    assert.equal((await service.status(uid, concurrent.order.orderId)).order.status, "confirmed");
    const overflow = await service.create(uid, { ...request, requestId: "test_request_0005" });
    await realRef.set({ crowns: Number.MAX_SAFE_INTEGER }, { merge: true });
    Object.assign(sessions.get("cs_live_6"), { payment_status: "paid", status: "complete", url: null });
    await assert.rejects(service.status(uid, overflow.order.orderId), /cannot accept/);
    assert.equal((await realRef.get()).data().crowns, Number.MAX_SAFE_INTEGER);
    assert.equal((await db.doc(`crownPaymentOrders/${overflow.order.orderId}`).get()).data().status, "awaiting_payment");
    await assert.rejects(service.reconcile("cs_test_bad"), /Only Stripe live/);
    const originalIntent = { id: "pi_fixture1", metadata: { purpose: "crownlands_crowns_live", crownOrderId: order.orderId }, livemode: true, amount: 499, currency: "usd" };
    fake.paymentIntents = { retrieve: async () => structuredClone(originalIntent) };
    const reviewEvent = { id: `evt_${nonce}`, type: "refund.created", data: { object: { id: "re_fixture", payment_intent: "pi_fixture1", status: "pending" } } };
    const beforeReview = (await realRef.get()).data();
    await Promise.all(Array.from({ length: 5 }, () => service.review(reviewEvent)));
    assert.deepEqual((await realRef.get()).data(), beforeReview, "Manual review never deducts Crowns");
    assert.equal((await service.status(uid, order.orderId)).order.reviewRequired, true);
    assert.equal((await db.doc(`crownPaymentReviews/${reviewEvent.id}`).get()).data().status, "pending_manual_review");
    const deniedBeforePayment = await service.create(`review-${nonce}`, request);
    originalIntent.id = "pi_fixture7"; originalIntent.metadata.crownOrderId = deniedBeforePayment.order.orderId;
    await service.review({ ...reviewEvent, id: `evt_pre${nonce}`, type: "charge.dispute.created", data: { object: { id: "dp_fixture", payment_intent: "pi_fixture7", status: "needs_response" } } });
    Object.assign(sessions.get("cs_live_7"), { status: "complete", payment_status: "paid", url: null });
    await service.reconcile("cs_live_7");
    assert.equal((await db.doc(`players/review-${nonce}/cosmetics/state`).get()).exists, false, "Pre-delivery dispute holds fulfillment for manual review");
    const authResponse = await signUpVerifiedPlayer(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `crown-${nonce}@example.test`, password: `Crown-${nonce}!`, returnSecureToken: true }),
    });
    const auth = await authResponse.json(); assert(authResponse.ok);
    for (const path of [`crownPaymentOrders/${order.orderId}`, `players/${auth.localId}/crownPayments/state`, `crownPaymentReviews/evt_fixture${nonce}`, "serverConfig/crownLivePayments"]) {
      const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
        method: "PATCH", headers: { authorization: `Bearer ${auth.idToken}`, "content-type": "application/json" }, body: JSON.stringify({ fields: { crowns: { integerValue: "100000" } } }),
      });
      assert.equal(response.status, 403, `Client cannot write ${path}`);
      const read = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
        headers: { authorization: `Bearer ${auth.idToken}` },
      });
      assert.equal(read.status, 403, `Client cannot read ${path}`);
    }
    const hub = await (await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`)).json();
    const endpoint = `http://${hub.functions.host}:${hub.functions.port}/${projectId}/us-central1/getLiveCrownPaymentCatalog`;
    const unauthenticated = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: {} }) });
    assert.equal(unauthenticated.status, 401);
    const outsider = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${auth.idToken}` }, body: JSON.stringify({ data: {} }) });
    assert.equal(outsider.status, 200); assert.equal((await outsider.json()).result.enabled, true);

    const allowed = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${auth.idToken}` }, body: JSON.stringify({ data: {} }) });
    assert.equal(allowed.status, 200); assert.equal((await allowed.json()).result.enabled, true);
    for (const credentials of [{ email: `unverified-${nonce}@example.test`, password: `Crown-${nonce}!` }, {}]) {
      const signup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...credentials, returnSecureToken: true }),
      });
      const player = await signup.json(); assert(signup.ok);

      const rejected = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${player.idToken}` }, body: JSON.stringify({ data: {} }) });
      assert.equal(rejected.status, 403, "Unverified/anonymous accounts cannot use checkout");
    }
    console.log("Live Crown payment emulator passed: lost-response recovery, concurrent idempotency, owner isolation, forged prices, live/test isolation, expiry, wallet atomicity, callable auth and client-write denial.");
  } finally {
    if (previousConfig.exists) await configRef.set(previousConfig.data()); else await configRef.delete();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
