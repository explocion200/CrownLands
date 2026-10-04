"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createCrownPaymentsService } = require("../crown-payments-service");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error("Emulator only");
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();

async function main() {
  const nonce = crypto.randomBytes(6).toString("hex"), uid = `crown-test-${nonce}`;
  const pack = { id: "fixture", priceId: "price_fixture", crowns: 600, amountMinor: 499, currency: "usd" };
  const configRef = db.doc("serverConfig/crownPayments"), previousConfig = await configRef.get();
  const sessions = new Map(), keys = new Map(); let clock = Date.now(), loseResponse = false, tamper = null, earlyWebhook = false;
  const fake = { prices: { retrieve: async id => ({ id, livemode: false, active: true, type: "one_time", billing_scheme: "per_unit", unit_amount: 499, currency: "usd" }) }, checkout: { sessions: {
    create: async (params, options) => {
      let session = keys.get(options.idempotencyKey);
      if (!session) {
        session = { id: `cs_test_${keys.size + 1}`, livemode: false, mode: "payment", client_reference_id: params.client_reference_id,
          metadata: params.metadata, currency: "usd", amount_total: 499, payment_status: "unpaid", status: "open",
          url: "https://checkout.stripe.com/c/pay/fixture", line_items: { has_more: false, data: [{ price: { id: "price_fixture" }, quantity: 1, amount_total: 499 }] } };
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
  const service = createCrownPaymentsService({ db, stripe: () => fake, now: () => clock });
  const request = { requestId: "test_request_0001", packId: "fixture", expectedAmountMinor: 499, expectedCurrency: "usd", expectedCrowns: 600 };
  const realRef = db.doc(`players/${uid}/cosmetics/state`), sandboxRef = db.doc(`players/${uid}/crownPaymentSandbox/state`);
  const realWallet = { version: 1, crowns: 29, owned: { halloween_city: true }, equipped: { city: "halloween_city" }, revision: 4, pickupDay: "2026-10-04", crownPickups: 9 };
  try {
    await configRef.set({ enabled: false });
    assert.equal((await service.catalog(uid)).enabled, false);
    await assert.rejects(service.create(uid, request), /not enabled/);
    await configRef.set({ enabled: true, mode: "test", testerUids: [uid], packs: [pack] });
    await realRef.set(realWallet);
    assert.equal((await service.catalog("stranger")).enabled, false);
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
    await assert.rejects(service.create(uid, { ...request, requestId: "different_request" }), /existing test checkout/);
    await assert.rejects(service.status("stranger", order.orderId), /not found/);
    await service.reconcile(sessionId); assert.equal((await sandboxRef.get()).data().crowns, undefined);
    for (const bad of [{ livemode: true }, { amount_total: 1 }, { currency: "eur" }, { client_reference_id: "other" },
      { line_items: { has_more: true, data: [] } }, { line_items: { has_more: false, data: [{ price: { id: "price_other" }, quantity: 1, amount_total: 499 }] } }]) {
      tamper = bad; await assert.rejects(service.reconcile(sessionId), /does not match/);
    }
    tamper = null;
    Object.assign(sessions.get(sessionId), { payment_status: "paid", status: "complete", url: null });
    await Promise.all(Array.from({ length: 12 }, () => service.reconcile(sessionId)));
    assert.equal((await sandboxRef.get()).data().crowns, 600);
    assert.equal((await service.status(uid, order.orderId)).order.status, "confirmed");
    assert.equal((await service.create(uid, request)).url, null);
    assert.deepEqual((await realRef.get()).data(), realWallet, "Sandbox never changes Crowns, ownership or pickup allowance");
    // A browser reset/season transition cannot replay the permanent test receipt.
    await service.reconcile(sessionId); assert.equal((await sandboxRef.get()).data().crowns, 600);
    const next = await service.create(uid, { ...request, requestId: "test_request_0002" });
    Object.assign(sessions.get("cs_test_2"), { status: "expired" });
    assert.equal((await service.status(uid, next.order.orderId)).order.status, "expired");
    assert.equal((await sandboxRef.get()).data().crowns, 600);
    loseResponse = true;
    await assert.rejects(service.create(uid, { ...request, requestId: "test_request_0003" }), /Response lost/);
    const orphan = (await service.catalog(uid)).latestOrder;
    clock += 61 * 60 * 1000;
    assert.equal((await service.status(uid, orphan.orderId)).order.status, "expired");
    earlyWebhook = true;
    const raced = await service.create(uid, { ...request, requestId: "test_request_0004" });
    assert.equal(raced.order.status, "confirmed", "A webhook before creation returns must keep its confirmed receipt");
    assert.equal(raced.url, null);
    assert.equal((await sandboxRef.get()).data().crowns, 1200);
    const overflow = await service.create(uid, { ...request, requestId: "test_request_0005" });
    await sandboxRef.set({ crowns: Number.MAX_SAFE_INTEGER }, { merge: true });
    Object.assign(sessions.get("cs_test_5"), { payment_status: "paid", status: "complete", url: null });
    await assert.rejects(service.status(uid, overflow.order.orderId), /cannot accept/);
    assert.equal((await sandboxRef.get()).data().crowns, Number.MAX_SAFE_INTEGER);
    assert.equal((await db.doc(`crownPaymentTestOrders/${overflow.order.orderId}`).get()).data().status, "awaiting_payment");
    assert.deepEqual((await realRef.get()).data(), realWallet);
    await assert.rejects(service.reconcile("cs_live_bad"), /Only Stripe test/);
    const authResponse = await signUpVerifiedPlayer(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `crown-${nonce}@example.test`, password: `Crown-${nonce}!`, returnSecureToken: true }),
    });
    const auth = await authResponse.json(); assert(authResponse.ok);
    for (const path of [`crownPaymentTestOrders/${order.orderId}`, `players/${auth.localId}/crownPaymentSandbox/state`, "serverConfig/crownPayments"]) {
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
    const endpoint = `http://${hub.functions.host}:${hub.functions.port}/${projectId}/us-central1/getCrownPaymentCatalog`;
    const unauthenticated = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: {} }) });
    assert.equal(unauthenticated.status, 401);
    const outsider = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${auth.idToken}` }, body: JSON.stringify({ data: {} }) });
    assert.equal(outsider.status, 200); assert.equal((await outsider.json()).result.enabled, false);
    await configRef.set({ testerUids: [uid, auth.localId] }, { merge: true });
    const allowed = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${auth.idToken}` }, body: JSON.stringify({ data: {} }) });
    assert.equal(allowed.status, 200); assert.equal((await allowed.json()).result.enabled, true);
    for (const credentials of [{ email: `unverified-${nonce}@example.test`, password: `Crown-${nonce}!` }, {}]) {
      const signup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...credentials, returnSecureToken: true }),
      });
      const player = await signup.json(); assert(signup.ok);
      await configRef.set({ testerUids: [player.localId] }, { merge: true });
      const rejected = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${player.idToken}` }, body: JSON.stringify({ data: {} }) });
      assert.equal(rejected.status, 403, "Even allowlisted unverified/anonymous accounts cannot use checkout");
    }
    console.log("Crown payment emulator passed: lost-response recovery, concurrent idempotency, owner isolation, forged prices, sandbox isolation, expiry, wallet atomicity, callable auth and client-write denial.");
  } finally {
    if (previousConfig.exists) await configRef.set(previousConfig.data()); else await configRef.delete();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
