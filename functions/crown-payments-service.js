"use strict";

const P = require("./crown-payments");

function createCrownPaymentsService({ db, stripe, now = Date.now }) {
  const orderRef = id => db.doc(`crownPaymentTestOrders/${id}`);
  const walletRef = uid => db.doc(`players/${uid}/crownPaymentSandbox/state`);
  const configRef = db.doc("serverConfig/crownPayments");
  const requireOrderId = id => {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) P.fail("invalid-argument", "Choose a saved Crown test order.");
    return id;
  };
  async function owned(uid, id) {
    const snap = await orderRef(requireOrderId(id)).get();
    if (!snap.exists || snap.data().uid !== uid) P.fail("not-found", "Crown test order not found.");
    return snap.data();
  }
  async function catalog(uid) {
    const config = P.configFor((await configRef.get()).data(), uid);
    if (!config) return { enabled: false, mode: "test", packs: [] };
    const wallet = (await walletRef(uid).get()).data() || {};
    const latest = wallet.latestOrderId ? await owned(uid, wallet.latestOrderId) : null;
    return { enabled: true, mode: "test", packs: config.packs.map(({ priceId, ...pack }) => pack),
      latestOrder: latest ? P.publicOrder(latest) : null };
  }
  async function create(uid, request = {}) {
    const id = P.orderIdFor(uid, request.requestId);
    const config = P.configFor((await configRef.get()).data(), uid);
    if (!config) P.fail("failed-precondition", "Crown test checkout is not enabled for this account.");
    const pack = config.packs.find(entry => entry.id === request.packId);
    if (!pack || pack.amountMinor !== request.expectedAmountMinor || pack.currency !== request.expectedCurrency
        || pack.crowns !== request.expectedCrowns) P.fail("failed-precondition", "This Crown pack changed. Review the current offer.");
    const signature = JSON.stringify(pack);
    const order = await db.runTransaction(async transaction => {
      const [existing, wallet] = await Promise.all([transaction.get(orderRef(id)), transaction.get(walletRef(uid))]);
      if (existing.exists) {
        if (existing.data().uid !== uid || existing.data().signature !== signature) P.fail("invalid-argument", "That checkout request was already used for another offer.");
        return existing.data();
      }
      const previousId = wallet.data()?.latestOrderId;
      if (previousId) {
        const previous = (await transaction.get(orderRef(previousId))).data();
        if (previous && !["confirmed", "expired"].includes(previous.status) && previous.expiresAtMs > now()) {
          P.fail("failed-precondition", "Check your existing test checkout before starting another.");
        }
      }
      const value = { uid, packId: pack.id, ...pack, id, requestId: request.requestId, signature, status: "creating", mode: "test",
        createdAtMs: now(), expiresAtMs: now() + 60 * 60 * 1000, sessionId: "" };
      transaction.create(orderRef(id), value);
      transaction.set(walletRef(uid), { latestOrderId: id }, { merge: true });
      return value;
    });
    if (["confirmed", "expired"].includes(order.status)) return { order: P.publicOrder(order), url: null };
    const client = stripe();
    let session;
    if (order.sessionId) {
      session = await client.checkout.sessions.retrieve(order.sessionId, { expand: ["line_items"] });
    } else {
      // Never reuse an expired Stripe idempotency key or change its original parameters.
      if (now() - order.createdAtMs > 20 * 60 * 1000) P.fail("failed-precondition", "This checkout needs checking before it can be retried.");
      P.validatePrice(await client.prices.retrieve(order.priceId), order);
      session = await client.checkout.sessions.create({
        mode: "payment", payment_method_types: ["card"], line_items: [{ price: order.priceId, quantity: 1 }],
        client_reference_id: id, metadata: { crownOrderId: id, purpose: "crownlands_crowns_test" },
        success_url: P.RETURN_URL, cancel_url: P.RETURN_URL, expires_at: Math.floor(order.expiresAtMs / 1000),
        allow_promotion_codes: false, adaptive_pricing: { enabled: false },
        expand: ["line_items"],
      }, { idempotencyKey: `crown-test-${id}` });
    }
    if (!/^cs_test_[a-zA-Z0-9]+$/.test(session.id || "")) P.fail("failed-precondition", "Only Stripe test sessions are supported.");
    P.validateSession(session, order);
    if (session.url && !P.safeCheckoutUrl(session.url)) P.fail("failed-precondition", "Stripe returned an invalid checkout address.");
    const saved = await db.runTransaction(async transaction => {
      const current = (await transaction.get(orderRef(id))).data();
      if (current.sessionId && current.sessionId !== session.id) P.fail("failed-precondition", "This order already has a checkout.");
      const next = { ...current, sessionId: session.id,
        status: current.status === "confirmed" ? "confirmed" : session.status === "expired" ? "expired" : "awaiting_payment" };
      transaction.set(orderRef(id), next);
      return next;
    });
    if (session.payment_status === "paid") return { order: await reconcile(session.id), url: null };
    return { order: P.publicOrder(saved), url: saved.status === "awaiting_payment" ? session.url : null };
  }
  async function reconcile(sessionId) {
    if (!/^cs_test_[a-zA-Z0-9]+$/.test(sessionId || "")) P.fail("invalid-argument", "Only Stripe test sessions are supported.");
    const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
    const id = requireOrderId(session.metadata?.crownOrderId);
    return db.runTransaction(async transaction => {
      const snap = await transaction.get(orderRef(id));
      if (!snap.exists) P.fail("not-found", "Crown test order not found.");
      const order = snap.data();
      P.validateSession(session, order);
      if (order.status === "confirmed") return P.publicOrder(order);
      if (session.status !== "complete" || session.payment_status !== "paid") {
        if (session.status === "expired") {
          transaction.update(orderRef(id), { status: "expired", sessionId });
          order.status = "expired";
        }
        return P.publicOrder(order);
      }
      const wallet = (await transaction.get(walletRef(order.uid))).data() || {};
      const balance = wallet.crowns || 0;
      if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isSafeInteger(balance + order.crowns)) {
        P.fail("resource-exhausted", "The test wallet cannot accept this order.");
      }
      const confirmed = { ...order, sessionId, status: "confirmed", confirmedAtMs: now() };
      transaction.set(walletRef(order.uid), { crowns: balance + order.crowns }, { merge: true });
      transaction.set(orderRef(id), confirmed);
      return P.publicOrder(confirmed);
    });
  }
  async function status(uid, id) {
    let order = await owned(uid, id);
    if (!order.sessionId && order.expiresAtMs <= now() && order.status === "creating") {
      order = await db.runTransaction(async transaction => {
        const current = (await transaction.get(orderRef(id))).data();
        if (current.status === "creating" && !current.sessionId) {
          current.status = "expired";
          transaction.update(orderRef(id), { status: "expired" });
        }
        return current;
      });
    }
    return { order: order.sessionId && !["confirmed", "expired"].includes(order.status)
      ? await reconcile(order.sessionId) : P.publicOrder(order) };
  }
  return { catalog, create, status, reconcile };
}

module.exports = { createCrownPaymentsService };
