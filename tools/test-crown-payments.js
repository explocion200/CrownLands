"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Stripe = require("../functions/node_modules/stripe");
const P = require("../functions/crown-payments");
const { createCrownPaymentsWebhook } = require("../functions/crown-payments-http");

async function main() {
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
  console.log("Crown payments: configuration, quote validation, sandbox boundary, safe redirects, signed/stale/forged webhooks and retry status passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
