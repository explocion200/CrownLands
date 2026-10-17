# Friends and private messages

Approved behavior is recorded in section 14 of the Master Development Specification. The feature lives on the home server; it does not enable Firebase hosting, database writes, or messaging.

Players open Friends or Messages inside Realm Chat. Add Friend and Message are also available from another player's profile. Friends can message immediately. Other players may send one message request; its recipient accepts or declines before further messages. Accepting a conversation does not add a friend. Friendship does not change combat rules.

Private alerts start off and have a separate Messages switch. They reveal no message text. Browser permission, the account preference, and this browser's private-alert registration must all permit delivery. Attack alerts retain their existing setting. Signing out removes this browser's subscriptions. The operator can review reported messages through a protected server command, not a player-facing admin screen.

## Storage and privacy

- `socialConfiguration/current` is the server-only feature gate. Missing or `enabled:false` disables social calls and private alerts.
- `socialPairs` stores canonical two-participant relationships and sequences. Its `privateMessages` subcollection expires after 90 days. Pair IDs are hashes of sorted user IDs; hashing is not the access control. Every operation checks authenticated participation.
- `socialAccounts` holds persistent preferences, friend counts, restrictions and rate counters. Its `contacts` and `inbox` projections provide bounded paginated lists without private text. `socialReceipts` deduplicates writes for 90 days.
- Only each account's opaque `signals/current` document is readable through the generic client data bridge. Pair, inbox, account, message, report and receipt writes are server-only. One shared chat update request carries Global, Clan and the own-account signal; it holds no PostgreSQL connection while waiting.
- Report evidence contains the selected incoming message and up to five preceding messages. `socialReports` evidence expires 90 days after reporting. `socialOperatorAudit` records operator action metadata without message text. Reports never impose automatic punishment.
- The existing encrypted PostgreSQL backup includes these documents. Physical backup copies age out under the existing backup retention policy; UI/API expiry applies even before bounded cleanup has removed an expired document.
- Translation requires an explicit per-message click. Only that text is sent to Google, using the existing shared monthly allowance. Translation cache expiry cannot exceed message expiry. No private-message language auto-detection occurs.
- Presence exposes online/offline only to accepted, unblocked friends, based on an active current-realm heartbeat within three minutes. No location, last-seen history or message read receipt is exposed.

## Operator commands

Run `tools/social-operator.js` from the reviewed source with Node 22, the PostgreSQL operator identity, and database `crownlands_migration` over the local Unix socket. The CLI verifies the protected active-server control and requires the database user `postgres`. Do not run it as a game service or expose it through HTTP.

`list` returns at most 50 open report IDs, reasons and timestamps. `review REPORT_ID --output /absolute/private/report.json` writes evidence to a new mode-0600 file, refusing replacement and symlinks. Review the file privately and delete the temporary copy after use; exported evidence is outside automatic report expiry.

`dismiss REPORT_ID --reason "An explanatory operator decision"` records a dismissal. `restrict REPORT_ID --hours 24 --reason "An explanatory operator decision"` temporarily blocks the reported account from sending private messages and friend requests. Zero hours removes the private restriction; the maximum is 720 hours. All decisions are recorded with operator and deployment epoch. No currency, combat data, or public-chat ban is changed by this tool.

## Coordinated installation and rollback

The additive callable changes the backend source fingerprint; the shared update transport and push sender change the local runtime fingerprint. A merge alone is insufficient. The configured publisher must hold the new client until both installed fingerprints are reviewed and updated.

1. Require exact merged source, passing required GitHub checks, an unchanged active epoch and current-realm pointer, healthy permanent services, and a successful recent encrypted backup/restore receipt. Lock and pause publication during installation.
2. Run `tools/local-postgres-social-indexes.js --apply EXPECTED_ACTIVE_EPOCH` under the PostgreSQL operator. It adds ten concurrent partial indexes with an advisory lock and verifies exact definitions. It does not change player rows or initialize a world. No game startup or publisher runs this migration automatically.
3. Keep `socialConfiguration/current.enabled` false while installing the exact reviewed `functions` and `local-backend` files. Preserve root ownership and the existing service-account directory access. Restart game, worker and push; verify health, jobs, chat listener, authorization and isolated fixture tests against the installed code.
4. Record the new backend and runtime fingerprints only after those checks pass. Preserve the previous static release and policy, with an explicitly compatible local rollback candidate. Enable the feature with an operator transaction and resume the publisher. Verify the merged build ID and new modules over HTTPS on both game URLs under `/play/`.
5. Make a fresh encrypted backup and verify the database restore using the existing backup tooling. Check game/worker/push health and that no new dead jobs appeared.

If installation fails before publishing, restore the prior source and policy, disable the gate, and restore the previous static release. Do not restore player data. Additive indexes can remain. After players have used the feature, disable the gate and roll back the compatible client/runtime together while retaining all social records for repair. Never restore Firebase authority.

## Verification

`test-local-postgres-social.js` and `emulator-social.js` exercise the same relationship, rate, pagination, privacy, retention and report scenarios against independent synthetic stores. `test-local-social-integration.js` checks real PostgreSQL notifications, 50 idle social subscriptions, bounded query pools, delivery timing, operator evidence/restrictions, send/block races and manual translation. It benchmarks a small authoritative transaction with a 3 ms timing-noise allowance; it is not an internet latency guarantee.

`test-private-notifications.js` covers separate alert categories, legacy attack opt-in, token rotation, concurrent toggles, logout and privacy. Existing chat, notification, local adapter and translation suites protect affected shared behavior. `validate-social-browser.js` exercises the actual UI at desktop 1440×900 and landscape 844×390/568×320, including plain-text rendering, a 90-day expiry deadline, shared player flags, sending, translation and account cleanup. Build checks verify the offline shell includes both new modules.
