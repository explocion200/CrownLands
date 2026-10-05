"use strict";
const { PURPOSE } = require("./crown-live-payments");
const CHECKOUT_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired"]);
const REVIEW_EVENTS = new Set(["refund.created", "refund.updated", "refund.failed", "charge.refunded",
  "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
  "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated"]);

function createLiveCrownPaymentsWebhook({ verify, reconcile, review }) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") { res.set("Allow", "POST"); res.status(405).send("Method not allowed"); return; }
    let event;
    try { event = verify(req.rawBody, req.get("stripe-signature")); }
    catch { res.status(400).send("Invalid Stripe signature"); return; }
    if (event.livemode !== true || event.account) { res.status(400).send("Only direct live payments are supported"); return; }
    try {
      if (CHECKOUT_EVENTS.has(event.type) && event.data?.object?.metadata?.purpose === PURPOSE) await reconcile(event.data.object.id);
      else if (REVIEW_EVENTS.has(event.type)) await review(event);
      res.status(200).send("Received");
    } catch {
      console.error("Crown payment reconciliation pending");
      res.status(500).send("Reconciliation pending");
    }
  };
}
module.exports = { createLiveCrownPaymentsWebhook };
