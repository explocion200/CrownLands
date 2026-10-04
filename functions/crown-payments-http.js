"use strict";

const EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired"]);

function createCrownPaymentsWebhook({ verify, reconcile }) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") { res.set("Allow", "POST"); res.status(405).send("Method not allowed"); return; }
    let event;
    try { event = verify(req.rawBody, req.get("stripe-signature")); }
    catch { res.status(400).send("Invalid Stripe signature"); return; }
    if (event.livemode !== false || event.account) { res.status(400).send("Only direct test payments are supported"); return; }
    if (!EVENTS.has(event.type) || event.data?.object?.metadata?.purpose !== "crownlands_crowns_test") {
      res.status(200).send("Ignored"); return;
    }
    try {
      await reconcile(event.data.object.id);
      res.status(200).send("Received");
    } catch {
      // Stripe retries. Never acknowledge a failed wallet transaction or log payment payloads.
      console.error("Crown test payment reconciliation failed");
      res.status(500).send("Reconciliation pending");
    }
  };
}

module.exports = { createCrownPaymentsWebhook };
