# Stripe Crown checkout foundation

The October 4, 2026 request selected Stripe for future Crown purchases and approved a **sandbox-only** checkout foundation. On October 5, the owner authorized connecting that sandbox while keeping checkout disabled, then confirmed the first pack: **1,000 Crowns for US$4.99**. That offer is configured in the sandbox; live payments remain unapproved and the cosmetics-only rule is unchanged.

## Current behavior

- Shop → Skins displays **Test Crown checkout** only for accounts explicitly listed in the server's sandbox configuration. Other accounts see the existing shop.
- A selected pack opens Stripe-hosted Checkout in a new tab. The game remains open. The return page instructs the tester to return to the game and check the order; a redirect never grants currency.
- The server owns pack amounts, price IDs, currency and Crown quantities. It checks Stripe's price and payment against the saved order. New checkouts require a signed-in, non-anonymous account; email/password accounts must be verified.
- A stable, account-bound request ID and Stripe idempotency key recover uncertain creation responses. One outstanding checkout per account prevents competing requests from creating multiple unpaid checkouts. Sessions expire after one hour; creation retries stop after 20 minutes and never reuse an expired provider key.
- A signed webhook and authenticated status checks reconcile the same saved order. Only a complete, paid session can credit the separate test wallet, once, including concurrent retries. Pending, failed or expired checkout does not grant currency. Failed reconciliation returns an error so Stripe retries.
- Live keys, prices, sessions, events and connected-account events are rejected. The only wallet path is `players/{uid}/crownPaymentSandbox/state`; playable balances in `players/{uid}/cosmetics/state` are never changed.
- Orders live in `crownPaymentTestOrders/{orderId}`. Clients cannot read or write these records directly, nor configure packs or test wallets. Owner-checked callables return minimal order details. Payment card, billing address and email data remain with Stripe and are not copied into Firestore or logs.
- Only cards are enabled for this first sandbox flow. Delayed-success/failed event types are handled defensively, without granting unpaid orders. Refund/dispute handling and live payment methods remain launch work.

## Verified connection — October 5, 2026

- The Crownlands Stripe sandbox is connected to Firebase project `crown-land-b15e0`. Its test API key authenticated against the selected Stripe account. The test key and webhook signing secret are stored in Secret Manager under the names below; no credential values belong in this document or the repository.
- Only `getCrownPaymentCatalog`, `createCrownCheckout`, `getCrownCheckoutStatus` and `stripeCrownTestWebhook` were deployed from merged source commit `83424189a3e82bf8cf2a02dcecbe1c207b72b0c1`. All four were verified `ACTIVE` on Node.js 22 at `2026-10-05T19:23:19Z`, with the required secret versions bound. Existing functions and the authoritative current-realm pointer matched the pre-deployment baseline.
- The active sandbox webhook sends exactly the four Checkout events listed below to `https://us-central1-crown-land-b15e0.cloudfunctions.net/stripeCrownTestWebhook`. Its event API version is `2026-08-26.dahlia`; this does not change the account-wide API version. Server-side Stripe requests use the existing SDK's `2026-09-30.endive` version, which authenticated successfully.
- `serverConfig/crownPayments` exists with `enabled: false`, `mode: "test"` and an empty `testerUids` array. Its initial empty pack list now contains the owner-approved offer below. **Checkout remains disabled.** No designated testers, purchase orders or wallet credits were created by this setup.
- The three callables rejected unauthenticated requests with HTTP 401. The webhook rejected an invalid signature with HTTP 400 and accepted a signed probe without Crown-order metadata with HTTP 200 (`Ignored`). This verifies the deployed handler and signing-secret binding; an actual Stripe-generated delivery and complete sandbox purchase are still unverified.
- The focused payment unit and desktop/landscape-mobile browser checks passed. The deployment's runtime-data and manifest checks and its 29 callable authentication-guard probes also passed. The original implementation's required GitHub checks passed in PR #444; no runtime code changed for this connection.

## Approved first Crown pack — October 5, 2026

- **1,000 Crowns for US$4.99**, a one-time purchase. The server pack ID is `crowns_1000`, with `crowns: 1000`, `amountMinor: 499` and `currency: "usd"`.
- Stripe sandbox product `prod_crownlands_test_1000_usd_499` and Price `price_1UNHy7KuUcvmAfUIaLSRGoLk` were created for this offer. The price is active, one-time, per-unit and `livemode: false`; it is stored in the private server pack configuration.
- Verification at `2026-10-05T19:54:40Z` confirmed the Stripe amount/currency match the saved pack and the existing runtime accepts its shape. The disabled configuration returns no payment catalog, its tester list remains empty, and the current-realm pointer was unchanged. No function deployment was needed for this pack configuration.
- Halloween City remains **600 Crowns**. One 1,000-Crown pack would cover that skin with 400 Crowns left, once live payments are separately implemented and authorized. Sandbox purchases only credit the separate test wallet and cannot fund skin purchases.
- Designating a tester, enabling sandbox checkout and completing an actual test purchase remain pending. This pricing approval does not enable live payments or establish refund/dispute terms. Local operational evidence is saved under `release-artifacts/crown-payments/pack-verification.json` (ignored, not committed).

## Account and sandbox setup

1. The owner has supplied the Stripe account. Any remaining business/identity requirements for live payments must be completed directly in Stripe and verified before a live launch.
2. The approved 1,000-Crown / US$4.99 one-time, per-unit Price is configured in Stripe's sandbox/test environment. Additional packs require owner confirmation; test-fixture prices are not approved commercial offers. Supported initial currencies are USD, EUR, GBP, CAD and AUD, all represented in minor units.
3. The test secret key is stored as Firebase Secret Manager secret `STRIPE_CROWNS_TEST_SECRET_KEY`, and the webhook signing secret as `STRIPE_CROWNS_TEST_WEBHOOK_SECRET`. Use the provider/hosting secret tools for future updates; never paste secrets into chat, source files or PRs. The server accepts only `sk_test_` keys.
4. The `stripeCrownTestWebhook` HTTPS endpoint is deployed and registered in the same Stripe sandbox for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Its signing secret is securely configured. For local integration, Stripe CLI forwarding has its own signing secret.
5. Once the owner designates test accounts and authorizes a sandbox purchase, update `serverConfig/crownPayments` privately with `enabled: true`, `mode: "test"` and the approved `testerUids`, preserving the configured pack. Each pack requires `id`, `priceId`, `crowns`, `amountMinor` and lowercase `currency`. The October 5 connection and pack configuration leave checkout disabled.
6. Test successful, declined, cancelled and expired checkout; disconnect/retry; duplicate webhook delivery; and sign-out/account switching. Verify test receipts and the unchanged playable Crown wallet. Automated fixtures mock Stripe; an actual Stripe sandbox payment remains required.

## Before any live launch

The first pack's amount and selling currency are confirmed above. The owner must still confirm any additional packs, business country, customer support/refund terms and intended selling markets. Establish how refunds, partial refunds, chargebacks and already-spent Crowns are handled; configure applicable tax collection and required disclosures. This change intentionally cannot accept real payments until that separate live implementation and its tests are complete. Account verification and real sandbox verification are also required. Keep the provider credentials and sandbox records separate from live records.

No automatic refund, purchase reversal, real-money debit or production wallet migration is performed. Existing free Crown pickups, cosmetic ownership, seasonal persistence and skin pricing remain unchanged.

## Validation

- `node tools/test-crown-payments.js`: server configuration/price boundaries, Stripe signature verification, stale/forged/live events, redirect validation and webhook retry behavior.
- `node tools/validate-crown-payments-browser.js`: desktop and landscape-mobile flow, blocked popups, uncertain creation, same-order recovery, payment states, malicious URLs and late account responses.
- `functions/test/emulator-crown-payments.js`: actual Firestore transactions/rules, concurrent completion and creation, forged offers, owner isolation, expiry, auth, and no playable wallet mutation.
- Existing cosmetic and production-build checks protect current Shop behavior and delivery.

References: [Stripe Checkout](https://docs.stripe.com/payments/checkout), [fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted), [webhook signatures](https://docs.stripe.com/webhooks/signature), [sandbox testing](https://docs.stripe.com/testing).
