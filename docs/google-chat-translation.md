# Google chat translation

Confirmed September 18, 2026: use Google Cloud Translation with a 500,000-source-character application allowance per UTC calendar month. Implementation does not change chat retention, moderation, membership or sending rules.

## Player behavior

Revised by explicit user approval on September 19: each confidently detected foreign-language message has its own Translate action targeting the device language. Translation occurs only after that row's action; Show original and Retry affect that row. Same-language, neutral and uncertain messages have no Translate action. Full and mini views share the selected result. The old global switch and stored automatic-translation preference are removed. Results carry Google's supplied attribution. Translated text remains in browser memory; account and membership changes clear it. The game-host Privacy page describes detection and translation.

## Server behavior

- `translateChatMessages` accepts 1–20 existing message IDs and a language. It requires authentication, the current realm, season participation and current clan membership for Clan Chat. Authorization and message visibility are checked before charging and again before returning results.
- Google receives authoritative text through the v3 NMT API with `text/plain`. Credentials stay on the backend. Emulator runs never call Google.
- The same callable accepts `operation: "detect"` for visible rows and uses Google's v3 `detectLanguage` with `text/plain`. Detection is cached independently of target language, uses a confidence threshold of 0.8 in the UI, and reserves source characters against the same monthly cap. It does not translate text. Provider detection requests have at most four concurrent calls under one eight-second deadline. No sender-locale guess or development phrase table enters production.
- `chatTranslationUsage/YYYY-MM` reserves Unicode code points before the external call, in the same transaction as cache leases. Its 500,000-character ceiling spans every player and realm. Failed/uncertain calls keep the reservation. Concurrent callers cannot exceed the cap or independently translate an active cache entry.
- `chatTranslationCache` keys include message path, source text and language. Its private cached translations expire within 24 hours; Global expiry is never extended. `cleanupExpiredChat` removes expired cache records using the root collection's default index. No client Firestore access is granted.
- `serverRateLimits/translation_UID` allows 30 requests per minute. Provider calls have an eight-second timeout, no automatic provider retry, and five maximum function instances. Retrying uses fresh authorization and the cache.
- The runtime service account needs `roles/cloudtranslate.user`; `translate.googleapis.com` must be enabled in the existing Firebase project. No API key or new paid third-party account is used.

## Validation and release

Run provider/client unit checks, browser interaction/layout checks, authenticated emulator access tests, and concurrent allowance/cache tests before `prepare-pr`. Deploy the new callable and the updated cleanup function before publishing the client adapter. Verify the callable's unauthenticated rejection, runtime identity, a synthetic Google translation, and the exact deployed web build. Do not send real player conversations in release probes.

The original Google integration was merged in PR #312. The individual-message interaction and detection extension are undergoing release validation on `codex/approved-ui-completion`; exact production evidence is recorded after deployment. The separately hosted public site and itch.io are not automatically updated by the game web deployment.

Focused evidence: provider/client checks, desktop and 844×390 / 568×320 browser checks, and the current shared-realm emulator test passed. The existing Firebase project's Translation API is enabled and its existing Functions runtime account has the Cloud Translation User role. A 15-character synthetic English-to-Spanish NMT request succeeded using the deployment account; runtime end-to-end verification follows deployment. No real chat text was sent by these checks.

Google attribution badges are unmodified files from [Google's official badge download](https://docs.cloud.google.com/static/translate/images/google-translate-attribution.zip), used under the [attribution requirements](https://docs.cloud.google.com/translate/attribution). API reference: [Translate text](https://docs.cloud.google.com/translate/docs/translate-text).
