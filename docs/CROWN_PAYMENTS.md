# Stripe Crown checkout foundation

The October 4, 2026 request selected Stripe for future Crown purchases. This change prepares a **sandbox-only** checkout while the merchant account is being created. It does not authorize live payments, settle pack prices, change the cosmetics-only rule or deploy anything.

## Current behavior

- Shop → Skins displays **Test Crown checkout** only for accounts explicitly listed in the server's sandbox configuration. Other accounts see the existing shop.
- A selected pack opens Stripe-hosted Checkout in a new tab. The game remains open. The return page instructs the tester to return to the game and check the order; a redirect never grants currency.
- The server owns pack amounts, price IDs, currency and Crown quantities. It checks Stripe's price and payment against the saved order. New checkouts require a signed-in, non-anonymous account; email/password accounts must be verified.
- A stable, account-bound request ID and Stripe idempotency key recover uncertain creation responses. One outstanding checkout per account prevents competing requests from creating multiple unpaid checkouts. Sessions expire after one hour; creation retries stop after 20 minutes and never reuse an expired provider key.
- A signed webhook and authenticated status checks reconcile the same saved order. Only a complete, paid session can credit the separate test wallet, once, including concurrent retries. Pending, failed or expired checkout does not grant currency. Failed reconciliation returns an error so Stripe retries.
- Live keys, prices, sessions, events and connected-account events are rejected. The only wallet path is `players/{uid}/crownPaymentSandbox/state`; playable balances in `players/{uid}/cosmetics/state` are never changed.
- Orders live in `crownPaymentTestOrders/{orderId}`. Clients cannot read or write these records directly, nor configure packs or test wallets. Owner-checked callables return minimal order details. Payment card, billing address and email data remain with Stripe and are not copied into Firestore or logs.
- Only cards are enabled for this first sandbox flow. Delayed-success/failed event types are handled defensively, without granting unpaid orders. Refund/dispute handling and live payment methods remain launch work.

## Account and sandbox setup

1. The owner creates the merchant account at <https://dashboard.stripe.com/register> and completes Stripe's business/identity steps directly.
2. In Stripe's sandbox/test environment, create one-time, per-unit Prices for the packs selected by the owner. No pack prices in tests are approved commercial offers. Supported initial currencies are USD, EUR, GBP, CAD and AUD, all represented in minor units.
3. Store the test secret key as Firebase Secret Manager secret `STRIPE_CROWNS_TEST_SECRET_KEY`. Store the test webhook signing secret as `STRIPE_CROWNS_TEST_WEBHOOK_SECRET`. Use the provider/hosting secret tools; never paste secrets into chat, source files or PRs. The server accepts only `sk_test_` keys.
4. After an authorized backend deployment, register the `stripeCrownTestWebhook` HTTPS endpoint in the same Stripe sandbox for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Copy the endpoint signing secret into secure configuration. For local integration, Stripe CLI forwarding has its own signing secret.
5. Configure `serverConfig/crownPayments` privately, with `enabled: true`, `mode: "test"`, `testerUids` containing only designated test accounts, and a `packs` array. Each pack requires `id`, `priceId`, `crowns`, `amountMinor` and lowercase `currency`. This configuration is absent/disabled by default; the change never creates production records or secrets.
6. Test successful, declined, cancelled and expired checkout; disconnect/retry; duplicate webhook delivery; and sign-out/account switching. Verify test receipts and the unchanged playable Crown wallet. Automated fixtures mock Stripe because no merchant account is configured yet; an actual Stripe sandbox payment remains required.

## Before any live launch

The owner must confirm packs, amounts, selling currency, business country, customer support/refund terms and intended selling markets. Establish how refunds, partial refunds, chargebacks and already-spent Crowns are handled; configure applicable tax collection and required disclosures. This change intentionally cannot accept real payments until that separate live implementation and its tests are complete. Account verification and real sandbox verification are also required. Keep the provider credentials and sandbox records separate from live records.

No automatic refund, purchase reversal, real-money debit or production wallet migration is performed. Existing free Crown pickups, cosmetic ownership, seasonal persistence and skin pricing remain unchanged.

## Validation

- `node tools/test-crown-payments.js`: server configuration/price boundaries, Stripe signature verification, stale/forged/live events, redirect validation and webhook retry behavior.
- `node tools/validate-crown-payments-browser.js`: desktop and landscape-mobile flow, blocked popups, uncertain creation, same-order recovery, payment states, malicious URLs and late account responses.
- `functions/test/emulator-crown-payments.js`: actual Firestore transactions/rules, concurrent completion and creation, forged offers, owner isolation, expiry, auth, and no playable wallet mutation.
- Existing cosmetic and production-build checks protect current Shop behavior and delivery.

References: [Stripe Checkout](https://docs.stripe.com/payments/checkout), [fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted), [webhook signatures](https://docs.stripe.com/webhooks/signature), [sandbox testing](https://docs.stripe.com/testing).
