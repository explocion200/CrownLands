"use strict";
const Stripe = require("../functions/node_modules/stripe");
const { createCrownPaymentsService } = require("../functions/crown-payments-service");
const { createPaymentWebhookServer } = require("./payment-webhooks");
const { Store } = require("./store");
const PURPOSE = "crownlands_local_migration_test";

// Only an operator-created disposable payment schema and test API key are
// supported. The distinct provider purpose makes existing Firebase webhooks
// ignore these receipts; playable Crown wallets never receive test credit.
function createProviderRehearsal({ store, apiKey, webhookSecret, marker, ownerUid, expiresAt, StripeClass = Stripe, now = Date.now }) {
  const expiry = Date.parse(expiresAt);
  if (!(store instanceof Store) || !/^migration_game_paytest_[a-f0-9]{12}$/.test(store.schema)
    || !/^sk_test_[A-Za-z0-9]{8,200}$/.test(apiKey || "") || !/^whsec_[A-Za-z0-9]{8,200}$/.test(webhookSecret || "")
    || !/^[a-f0-9]{32}$/.test(marker || "") || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid || "")
    || !Number.isFinite(expiry) || expiry <= now() || expiry > now() + 3600000) throw Error("An expiring test-only provider rehearsal is required");
  const client = new StripeClass(apiKey, { timeout: 10000, maxNetworkRetries: 0, apiVersion: "2026-08-26.dahlia" });
  let stopped = false;
  const guard = async () => { if (stopped || now() >= expiry) throw Error("Test provider rehearsal stopped"); };
  const belongs = session => session?.livemode === false && session.metadata?.purpose === PURPOSE && session.metadata?.migrationMarker === marker;
  function normalize(session) {
    if (!belongs(session)) throw Error("Provider session is outside the private test");
    return { ...session, metadata: { ...session.metadata, purpose: "crownlands_crowns_test" } };
  }
  const provider = {
    prices: { retrieve: async id => { await guard(); return client.prices.retrieve(id); } },
    checkout: { sessions: {
      create: async (params, options) => {
        await guard();
        if (params.metadata?.purpose !== "crownlands_crowns_test") throw Error("Unexpected test checkout contract");
        return normalize(await client.checkout.sessions.create({ ...params,
          metadata: { ...params.metadata, purpose: PURPOSE, migrationMarker: marker } }, options));
      },
      retrieve: async (id, options) => {
        await guard();
        if (!/^cs_test_[A-Za-z0-9]+$/.test(id || "")) throw Error("Only a test session may be retrieved");
        return normalize(await client.checkout.sessions.retrieve(id, options));
      },
    } },
  };
  const service = createCrownPaymentsService({ db: store, stripe: () => provider, now });
  let verifiedOwnEvents = 0, reconciledEvents = 0;
  const server = createPaymentWebhookServer({ store, expiresAt, now, isEnabled: () => !stopped, test: {
    verify: (body, signature) => {
      const event = Stripe.webhooks.constructEvent(body, signature, webhookSecret);
      if (!belongs(event.data?.object)) return { ...event, type: "migration.unrelated" };
      verifiedOwnEvents++;
      return { ...event, data: { ...event.data, object: normalize(event.data.object) } };
    },
    reconcile: async id => { await guard(); const result = await service.reconcile(id); reconciledEvents++; return result; },
  } });
  const own = uid => { if (uid !== ownerUid) throw Error("Only the copied owner may create a test order"); };
  return {
    server,
    async verifyProvider() { await guard(); if ((await client.balance.retrieve()).livemode !== false) throw Error("Test-mode provider required"); },
    create: (uid, request) => { own(uid); return store.withTransactionGuard(guard, () => service.create(uid, request)); },
    status: (uid, id) => { own(uid); return store.withTransactionGuard(guard, () => service.status(uid, id)); },
    counts: () => ({ verifiedOwnEvents, reconciledEvents }),
    stop: () => { stopped = true; },
    async expireSession(id) {
      if (!/^cs_test_[A-Za-z0-9]+$/.test(id || "")) throw Error("Only a test session may be expired");
      const session = await client.checkout.sessions.retrieve(id);
      if (!belongs(session)) throw Error("Only this rehearsal's checkout may be expired");
      if (session.status === "open") await client.checkout.sessions.expire(id);
    },
  };
}
module.exports = { createProviderRehearsal, PURPOSE };
