"use strict";

const crypto = require("node:crypto");

// Sandbox only. Live keys, prices, events and wallet writes are deliberately unsupported.
const RETURN_URL = "https://game.playcrownlands.com/crown-payment-return.html";
const CURRENCIES = new Set(["usd", "eur", "gbp", "cad", "aud"]);
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const validId = value => typeof value === "string" && /^[a-zA-Z0-9_-]{8,96}$/.test(value);

function configFor(raw, uid) {
  if (raw?.enabled !== true || raw.mode !== "test" || !Array.isArray(raw.testerUids) || !raw.testerUids.includes(uid)) return null;
  if (!Array.isArray(raw.packs) || !raw.packs.length || raw.packs.length > 8) return null;
  const ids = new Set();
  const packs = raw.packs.map(pack => {
    if (!pack || !/^[a-z0-9_-]{1,40}$/.test(pack.id || "") || ids.has(pack.id)
        || !/^price_[a-zA-Z0-9]+$/.test(pack.priceId || "")
        || !Number.isSafeInteger(pack.crowns) || pack.crowns < 1 || pack.crowns > 1000000
        || !Number.isSafeInteger(pack.amountMinor) || pack.amountMinor < 1 || pack.amountMinor > 10000000
        || !CURRENCIES.has(pack.currency)) fail("failed-precondition", "Crown test packs need valid server configuration.");
    ids.add(pack.id);
    return { id: pack.id, priceId: pack.priceId, crowns: pack.crowns, amountMinor: pack.amountMinor, currency: pack.currency };
  });
  return { packs };
}

function orderIdFor(uid, requestId) {
  if (!validId(requestId)) fail("invalid-argument", "A valid checkout request ID is required.");
  return crypto.createHash("sha256").update(uid + ":" + requestId).digest("hex");
}

function validatePrice(price, pack) {
  if (!price || price.livemode !== false || price.active !== true || price.type !== "one_time"
      || price.id !== pack.priceId || price.unit_amount !== pack.amountMinor || price.currency !== pack.currency
      || price.billing_scheme !== "per_unit" || price.transform_quantity) {
    fail("failed-precondition", "The Stripe test price does not match this Crown pack.");
  }
}

function safeCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.port && !url.username && !url.password;
  } catch { return false; }
}

function validateSession(session, order) {
  const items = session.line_items;
  if (session.livemode !== false || session.mode !== "payment" || session.client_reference_id !== order.id
      || session.metadata?.crownOrderId !== order.id || session.metadata?.purpose !== "crownlands_crowns_test"
      || (order.sessionId && order.sessionId !== session.id)
      || session.currency !== order.currency || session.amount_total !== order.amountMinor
      || !items || items.has_more || items.data?.length !== 1
      || items.data[0].price?.id !== order.priceId || items.data[0].quantity !== 1
      || items.data[0].amount_total !== order.amountMinor) {
    fail("failed-precondition", "Checkout does not match the saved Crown test order.");
  }
}

function publicOrder(order) {
  return { orderId: order.id, packId: order.packId, crowns: order.crowns, amountMinor: order.amountMinor,
    currency: order.currency, status: order.status, mode: "test", requestId: order.requestId, createdAtMs: order.createdAtMs,
    confirmedAtMs: order.confirmedAtMs || null, expiresAtMs: order.expiresAtMs };
}

module.exports = { RETURN_URL, configFor, orderIdFor, validatePrice, validateSession, safeCheckoutUrl, publicOrder, fail };
