"use strict";

const { fail, orderIdFor, safeCheckoutUrl } = require("./crown-payments");
const PURPOSE = "crownlands_crowns_live";
const RETURN_URL = "https://game.playcrownlands.com/crown-payment-return.html";
const SUPPORT_EMAIL = "crownlandsmail@gmail.com";
const sessionIdValid = id => typeof id === "string" && /^cs_live_[a-zA-Z0-9]+$/.test(id);

function configFor(raw) {
  // Deployment alone cannot enable purchases. Merchant/tax review and release approval
  // are explicit server-side launch gates, never supplied by the browser.
  if (raw?.enabled !== true || raw.mode !== "live" || raw.launchApproved !== true || raw.taxReviewed !== true) return null;
  if (raw.refundPolicy !== "manual_review" || raw.countryPolicy !== "worldwide"
      || raw.supportEmail !== SUPPORT_EMAIL || !Array.isArray(raw.packs) || raw.packs.length !== 1) {
    fail("failed-precondition", "Crown purchases need valid server configuration.");
  }
  const pack = raw.packs[0];
  if (pack?.id !== "crowns_1000" || pack.crowns !== 1000 || pack.amountMinor !== 499 || pack.currency !== "usd"
      || !/^price_[a-zA-Z0-9]+$/.test(pack.priceId || "")) fail("failed-precondition", "The Crown pack is not configured.");
  return { packs: [{ id: pack.id, priceId: pack.priceId, crowns: 1000, amountMinor: 499, currency: "usd" }] };
}

function validatePrice(price, order) {
  if (!price || price.livemode !== true || price.active !== true || price.type !== "one_time"
      || price.id !== order.priceId || price.unit_amount !== order.amountMinor || price.currency !== order.currency
      || price.billing_scheme !== "per_unit" || price.transform_quantity || price.tax_behavior !== "inclusive") {
    fail("failed-precondition", "The Stripe price does not match this Crown pack.");
  }
}

function validateSession(session, order) {
  const items = session.line_items, item = items?.data?.[0];
  if (!sessionIdValid(session.id) || session.livemode !== true || session.mode !== "payment"
      || session.client_reference_id !== order.id || session.metadata?.crownOrderId !== order.id
      || session.metadata?.purpose !== PURPOSE || (order.sessionId && order.sessionId !== session.id)
      || (order.paymentIntentId && order.paymentIntentId !== session.payment_intent)
      || session.currency !== order.currency || session.amount_total !== order.amountMinor
      || !items || items.has_more || items.data?.length !== 1 || item.price?.id !== order.priceId
      || item.price?.tax_behavior !== "inclusive" || item.quantity !== 1 || item.amount_total !== order.amountMinor
      || session.automatic_tax?.enabled !== true || session.total_details?.amount_discount !== 0
      || session.total_details?.amount_shipping !== 0) fail("failed-precondition", "Checkout does not match the saved Crown order.");
  if (session.payment_status === "paid" && (session.automatic_tax.status !== "complete"
      || session.consent?.terms_of_service !== "accepted" || !/^pi_[a-zA-Z0-9]+$/.test(session.payment_intent || ""))) {
    fail("failed-precondition", "The Crown payment needs verification.");
  }
}

function publicOrder(order) {
  return { orderId: order.id, packId: order.packId, crowns: order.crowns, amountMinor: order.amountMinor,
    currency: order.currency, status: order.status, mode: "live", requestId: order.requestId,
    createdAtMs: order.createdAtMs, confirmedAtMs: order.confirmedAtMs || null, expiresAtMs: order.expiresAtMs,
    reviewRequired: order.reviewRequired === true };
}

module.exports = { PURPOSE, RETURN_URL, SUPPORT_EMAIL, sessionIdValid, configFor, validatePrice, validateSession,
  publicOrder, fail, orderIdFor, safeCheckoutUrl };
