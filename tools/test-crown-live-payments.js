"use strict";
const assert = require("node:assert/strict");
const Stripe = require("../functions/node_modules/stripe");
const P = require("../functions/crown-live-payments");
const { createLiveCrownPaymentsWebhook } = require("../functions/crown-live-payments-http");
const { createLiveCrownPaymentsService } = require("../functions/crown-live-payments-service");

async function verifyCheckoutApiContract() {
  const pack = { id: "crowns_1000", priceId: "price_fixture", crowns: 1000, amountMinor: 499, currency: "usd" };
  const records = new Map([["serverConfig/crownLivePayments", { enabled: true, mode: "live", launchApproved: true, taxReviewed: true, refundPolicy: "manual_review", countryPolicy: "worldwide", supportEmail: P.SUPPORT_EMAIL, packs: [pack] }]]);
  const snapshot = key => ({ exists: records.has(key), data: () => structuredClone(records.get(key)) });
  const db = {
    doc: key => ({ key, get: async () => snapshot(key) }),
    runTransaction: async action => action({ get: async ref => snapshot(ref.key),
      create: (ref, value) => { assert(!records.has(ref.key)); records.set(ref.key, structuredClone(value)); },
      set: (ref, value, options) => records.set(ref.key, options?.merge ? { ...records.get(ref.key), ...structuredClone(value) } : structuredClone(value)),
    }),
  };
  let creations = 0;
  const stripe = new Stripe("sk_test_crown_contract_fixture", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async (url, options) => {
    let value;
    if (new URL(url).pathname === "/v1/prices/price_fixture") {
      value = { id: pack.priceId, livemode: true, active: true, type: "one_time", billing_scheme: "per_unit", tax_behavior: "inclusive", unit_amount: 499, currency: "usd" };
    } else {
      assert.equal(new URL(url).pathname, "/v1/checkout/sessions");
      assert.equal(options.method, "POST");
      const headers = new Headers(options.headers), params = new URLSearchParams(options.body);
      // Exercise the installed SDK's outgoing HTTP header, not only a fake SDK argument.
      assert.equal(headers.get("stripe-version"), "2026-08-26.dahlia");
      assert.equal(params.get("payment_method_types[0]"), "card");
      assert.equal(params.get("payment_method_types[1]"), null);
      const id = params.get("client_reference_id");
      assert.equal(headers.get("idempotency-key"), `crown-live-${id}`);
      assert.equal(params.get("adaptive_pricing[enabled]"), "false");
      assert.equal(params.get("automatic_tax[enabled]"), "true");
      assert.equal(params.get("billing_address_collection"), "required");
      assert.equal(params.get("consent_collection[terms_of_service]"), "required");
      assert.equal(params.get("payment_intent_data[metadata][purpose]"), P.PURPOSE);
      assert.equal(params.get("payment_intent_data[metadata][crownOrderId]"), id);
      creations++;
      value = { id: "cs_live_contract", livemode: true, mode: "payment", client_reference_id: id,
        metadata: { crownOrderId: params.get("metadata[crownOrderId]"), purpose: params.get("metadata[purpose]") },
        automatic_tax: { enabled: true }, total_details: { amount_discount: 0, amount_shipping: 0 }, currency: "usd", amount_total: 499, status: "open", payment_status: "unpaid", url: "https://checkout.stripe.com/c/pay/cs_live_contract",
        line_items: { has_more: false, data: [{ price: { id: pack.priceId, tax_behavior: "inclusive" }, quantity: 1, amount_total: 499 }] } };
    }
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  }) });
  const service = createLiveCrownPaymentsService({ db, stripe: () => stripe });
  const result = await service.create("owner", { requestId: "checkout_contract_001", packId: pack.id,
    expectedCrowns: 1000, expectedAmountMinor: 499, expectedCurrency: "usd" });
  assert.equal(creations, 1);
  assert.equal(result.order.status, "awaiting_payment");
  assert.equal(result.order.crowns, 1000);
  assert.equal(result.url, "https://checkout.stripe.com/c/pay/cs_live_contract");
  assert.equal(records.has("players/owner/crownPaymentSandbox/state"), false);
  assert.equal(records.has("players/owner/cosmetics/state"), false);
}

async function main() {
  await verifyCheckoutApiContract();
  const pack = { id: "crowns_1000", priceId: "price_fixture", crowns: 1000, amountMinor: 499, currency: "usd" };
  const config = { enabled: true, mode: "live", launchApproved: true, taxReviewed: true, refundPolicy: "manual_review", countryPolicy: "worldwide", supportEmail: P.SUPPORT_EMAIL, packs: [pack] };
  assert.deepEqual(P.configFor(config).packs, [pack]);
  for (const bad of [undefined, {}, { ...config, enabled: false }, { ...config, mode: "test" }, { ...config, launchApproved: false }, { ...config, taxReviewed: false }]) assert.equal(P.configFor(bad), null);
  for (const bad of [{ supportEmail: "" }, { refundPolicy: "none" }, { countryPolicy: "US" }, { packs: [{ ...pack, crowns: 999 }] }, { packs: [{ ...pack, amountMinor: 500 }] }]) assert.throws(() => P.configFor({ ...config, ...bad }));
  const price = { id: pack.priceId, active: true, livemode: true, type: "one_time", unit_amount: 499, currency: "usd", billing_scheme: "per_unit", tax_behavior: "inclusive" };
  P.validatePrice(price, pack);
  for (const bad of [{ livemode: false }, { unit_amount: 0 }, { tax_behavior: "exclusive" }, { tax_behavior: "unspecified" }, { active: false }, { type: "recurring" }]) assert.throws(() => P.validatePrice({ ...price, ...bad }, pack));
  const order = { ...pack, id: "a".repeat(64), priceId: price.id, sessionId: "cs_live_fixture" };
  const session = { id: order.sessionId, livemode: true, mode: "payment", client_reference_id: order.id,
    metadata: { purpose: P.PURPOSE, crownOrderId: order.id }, currency: "usd", amount_total: 499,
    line_items: { has_more: false, data: [{ price, quantity: 1, amount_total: 499 }] },
    total_details: { amount_discount: 0, amount_shipping: 0 }, automatic_tax: { enabled: true, status: "complete" },
    payment_status: "paid", status: "complete", consent: { terms_of_service: "accepted" }, payment_intent: "pi_fixture" };
  P.validateSession(session, order);
  for (const bad of [{ livemode: false }, { id: "cs_test_fixture" }, { amount_total: 500 }, { currency: "eur" },
    { client_reference_id: "other" }, { consent: {} }, { payment_intent: null }, { automatic_tax: { enabled: true, status: "failed" } },
    { automatic_tax: { enabled: false } }, { total_details: { amount_discount: 1, amount_shipping: 0 } }, { line_items: { has_more: true, data: [] } }]) assert.throws(() => P.validateSession({ ...session, ...bad }, order));
  const secret = "whsec_live_unit_fixture";
  let deliveries = 0, reviews = 0, fail = false;
  const handler = createLiveCrownPaymentsWebhook({ verify: (body, signature) => Stripe.webhooks.constructEvent(body, signature, secret),
    reconcile: async () => { if (fail) throw Error("temporary failure"); deliveries++; }, review: async () => { if (fail) throw Error("temporary failure"); reviews++; } });
  const event = { id: "evt_fixture", livemode: true, type: "checkout.session.completed", data: { object: session } };
  async function send(value, signatureOverride, method = "POST") {
    const payload = JSON.stringify(value), signature = signatureOverride ?? Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = { code: 0, set() { return this; }, status(code) { this.code = code; return this; }, send() {} };
    await handler({ method, rawBody: Buffer.from(payload), get: () => signature }, res); return res.code;
  }
  assert.equal(await send(event, "invalid"), 400);
  assert.equal(await send(event, Stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(event), secret, timestamp: 1 })), 400);
  assert.equal(await send({ ...event, livemode: false }), 400);
  assert.equal(await send({ ...event, account: "acct_other" }), 400);
  assert.equal(await send(event, undefined, "GET"), 405);
  assert.equal(await send(event), 200); assert.equal(deliveries, 1);
  for (const type of ["refund.created", "refund.updated", "refund.failed", "charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed", "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated"]) assert.equal(await send({ ...event, type }), 200);
  assert.equal(reviews, 9);
  fail = true;
  assert.equal(await send(event), 500);
  assert.equal(await send({ ...event, type: "refund.created" }), 500);
  assert.equal(await send({ ...event, data: { object: { ...session, metadata: { purpose: "crownlands_crowns_test" } } } }), 200);
  console.log("Live Crown payments: approved offer and launch gates, SDK contract, inclusive tax, payment evidence, mode isolation, signed webhook routing and retry failures passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
