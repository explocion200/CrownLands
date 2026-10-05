"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Stripe = require("../functions/node_modules/stripe");
const P = require("../functions/crown-payments");
const { createCrownPaymentsWebhook } = require("../functions/crown-payments-http");
const { createCrownPaymentsService } = require("../functions/crown-payments-service");

async function verifyCheckoutApiContract() {
  const pack = { id: "fixture", priceId: "price_fixture", crowns: 1000, amountMinor: 499, currency: "usd" };
  const records = new Map([["serverConfig/crownPayments", { enabled: true, mode: "test", testerUids: ["owner"], packs: [pack] }]]);
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
      value = { id: pack.priceId, livemode: false, active: true, type: "one_time", billing_scheme: "per_unit", unit_amount: 499, currency: "usd" };
    } else {
      assert.equal(new URL(url).pathname, "/v1/checkout/sessions");
      assert.equal(options.method, "POST");
      const headers = new Headers(options.headers), params = new URLSearchParams(options.body);
      // Exercise the installed SDK's outgoing HTTP header, not only a fake SDK argument.
      assert.equal(headers.get("stripe-version"), "2026-08-26.dahlia");
      assert.equal(params.get("payment_method_types[0]"), "card");
      assert.equal(params.get("payment_method_types[1]"), null);
      const id = params.get("client_reference_id");
      assert.equal(headers.get("idempotency-key"), `crown-test-${id}`);
      assert.equal(params.get("adaptive_pricing[enabled]"), "false");
      creations++;
      value = { id: "cs_test_contract", livemode: false, mode: "payment", client_reference_id: id,
        metadata: { crownOrderId: params.get("metadata[crownOrderId]"), purpose: params.get("metadata[purpose]") },
        currency: "usd", amount_total: 499, status: "open", payment_status: "unpaid", url: "https://checkout.stripe.com/c/pay/cs_test_contract",
        line_items: { has_more: false, data: [{ price: { id: pack.priceId }, quantity: 1, amount_total: 499 }] } };
    }
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  }) });
  const service = createCrownPaymentsService({ db, stripe: () => stripe });
  const result = await service.create("owner", { requestId: "checkout_contract_001", packId: pack.id,
    expectedCrowns: 1000, expectedAmountMinor: 499, expectedCurrency: "usd" });
  assert.equal(creations, 1);
  assert.equal(result.order.status, "awaiting_payment");
  assert.equal(result.order.crowns, 1000);
  assert.equal(result.url, "https://checkout.stripe.com/c/pay/cs_test_contract");
  assert.equal(records.get("players/owner/crownPaymentSandbox/state").crowns, undefined);
}

async function main() {
  await verifyCheckoutApiContract();
  const pack = { id: "fixture", priceId: "price_fixture", crowns: 600, amountMinor: 499, currency: "usd" };
  const config = { enabled: true, mode: "test", testerUids: ["owner"], packs: [pack] };
  assert.equal(P.configFor(undefined, "owner"), null);
  assert.equal(P.configFor({ ...config, mode: "live" }, "owner"), null);
  assert.equal(P.configFor(config, "other"), null);
  assert.deepEqual(P.configFor(config, "owner").packs, [pack]);
  for (const bad of [{ crowns: 0 }, { crowns: 1.5 }, { amountMinor: -1 }, { currency: "xxx" }, { priceId: "evil" }]) {
    assert.throws(() => P.configFor({ ...config, packs: [{ ...pack, ...bad }] }, "owner"));
  }
  assert.throws(() => P.configFor({ ...config, packs: [pack, pack] }, "owner"));
  assert.throws(() => P.orderIdFor("owner", "../invalid"));
  assert.notEqual(P.orderIdFor("owner", "request_123"), P.orderIdFor("other", "request_123"));
  const price = { id: pack.priceId, livemode: false, active: true, type: "one_time", billing_scheme: "per_unit", unit_amount: 499, currency: "usd" };
  P.validatePrice(price, pack);
  for (const bad of [{ livemode: true }, { active: false }, { type: "recurring" }, { unit_amount: 0 }, { currency: "eur" }, { transform_quantity: { divide_by: 2 } }]) assert.throws(() => P.validatePrice({ ...price, ...bad }, pack));
  assert(P.safeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_fixture"));
  for (const url of ["javascript:alert(1)", "https://checkout.stripe.com.evil.test/", "https://user@checkout.stripe.com/", "https://checkout.stripe.com:444/", "/checkout"]) assert.equal(P.safeCheckoutUrl(url), false);

  const secret = "whsec_crown_unit_test_fixture";
  const event = { id: "evt_fixture", type: "checkout.session.completed", livemode: false,
    data: { object: { id: "cs_test_fixture", metadata: { purpose: "crownlands_crowns_test" } } } };
  let calls = 0, fail = false;
  const handler = createCrownPaymentsWebhook({
    verify: (body, signature) => Stripe.webhooks.constructEvent(body, signature, secret),
    reconcile: async id => { assert.equal(id, "cs_test_fixture"); calls++; if (fail) throw Error("temporary outage"); },
  });
  async function send(value, signatureOverride, method = "POST") {
    const payload = JSON.stringify(value), rawBody = Buffer.from(payload);
    const signature = signatureOverride ?? Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const response = { code: 0, set() { return this; }, status(code) { this.code = code; return this; }, send(body) { this.body = body; } };
    await handler({ method, rawBody, get: () => signature }, response);
    return response;
  }
  assert.equal((await send(event, "invalid")).code, 400); assert.equal(calls, 0);
  assert.equal((await send({ ...event, livemode: true })).code, 400);
  assert.equal((await send({ ...event, account: "acct_other" })).code, 400);
  assert.equal((await send(event, undefined, "GET")).code, 405);
  const stale = Stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(event), secret, timestamp: 1 });
  assert.equal((await send(event, stale)).code, 400);
  assert.equal((await send({ ...event, type: "customer.created" })).code, 200); assert.equal(calls, 0);
  assert.equal((await send(event)).code, 200); assert.equal(calls, 1);
  fail = true; assert.equal((await send(event)).code, 500);
  const root = path.resolve(__dirname, "..");
  const service = fs.readFileSync(path.join(root, "functions/crown-payments-service.js"), "utf8");
  assert(!service.includes("/cosmetics/state"), "Sandbox payments must have no playable wallet write path");
  const functions = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
  assert(functions.includes('defineSecret("STRIPE_CROWNS_TEST_SECRET_KEY")'));
  console.log("Crown payments: SDK Checkout API contract, configuration, quote validation, sandbox boundary, safe redirects, signed/stale/forged webhooks and retry status passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
