# Local backend migration

Status: isolated snapshot, restore and account/storage adapter rehearsal, October 15, 2026. The live game still uses Firebase. This document describes the migration work; it does not establish feature parity or authorize a production cutover.

The website and game assets already run on the owner's Ubuntu computer. The requested next step is to host the authoritative game backend and account system there too. Keep existing gameplay, player identities, cities, balances, purchases, history, and recovery behavior intact.

## Current dependencies

| Component | Current implementation | Replacement work |
| --- | --- | --- |
| Identity | Firebase Auth; Google and email/password; linked accounts and verified-email gates | Local account/session service preserving Firebase UIDs and provider identities; Google OAuth; local password verification and email actions |
| Data and permissions | Firestore, client listeners/queries/writes, Admin SDK transactions, Firestore rules | Private PostgreSQL database; authenticated server APIs; subscriptions; explicit authorization equivalent to current rules |
| Game operations | `functions/index.js`: callable and HTTP endpoints, injected business services | Node.js service reusing tested game logic with new storage/transaction and request adapters |
| Background work | Cloud Scheduler and Firestore document triggers | Durable local job queue and transactional outbox; scheduled workers with retry, deduplication, leases and restart recovery |
| Purchases | Stripe test/live checkout and signed webhooks | Preserve order/event IDs and wallet idempotency; configure and test local webhook endpoints before routing events |
| Notifications | Firebase Cloud Messaging and its service worker | Standard Web Push and local subscriptions/outbox; browser push delivery still uses browser-operated infrastructure |
| Chat translation | Google Cloud Translation via cloud credentials | Owner chose to keep Google Translation; configure scoped credentials for the local runtime and verify chat translation before cutover |
| Recovery | Firestore PITR/backups; encrypted host backups stored locally and off site | Consistent PostgreSQL dumps or supported physical backups, tested restores, monitoring, and separate protected account/key exports |

The local server does not eliminate third-party Google sign-in, payment processing, email delivery, or off-site storage. Do not delete the Google Cloud project: it currently also contains the explicitly requested off-site host backups and monitoring.

## Repeatable discovery

Run with Node 22 and the existing authorized Google Cloud CLI session:

```sh
node tools/read-local-migration-inventory.js
```

The tool selects `.firebaserc`'s default project and reads the authoritative `realmConfig/current` pointer. It records deployed function metadata, source export classification, source/deployment name differences, scheduler metadata, bucket metadata, Auth provider counts, and immediate top-level Firestore document counts. The output is a new private directory under `~/.local/share/crownlands/firebase-migration-inventory-*`, outside the repository and web root.

Account requests explicitly omit email addresses, UIDs, passwords, hashes and provider account identifiers. Responses are reduced to allowlisted metadata and aggregates before writing. Hash configuration requests select only the algorithm, not signing keys or salts. Tokens and raw API failures are not logged. Failed reads, unreachable function regions, missing realm pointers and incomplete pagination fail the run.

This inventory is **not a data export or consistent snapshot**. Top-level counts exclude nested subcollections, including descendants whose parent documents do not exist. Counts may include historical data; do not infer live-world membership from collection names. Accounts can change during pagination. Scheduler discovery covers function regions. Bucket names do not prove bucket contents. Source classification covers today's top-level exports and direct aliases, not arbitrary JavaScript syntax.

## Local database preparation

Use Ubuntu's PostgreSQL 18 packages for the isolated `crownlands_migration` rehearsal database. Restrict the initial cluster to Unix sockets (`listen_addresses = ''`). The local operator role must not be a superuser, create roles/databases, or have replication privileges. Revoke public connection rights to the rehearsal database. Do not open a router/firewall database port.

This database is not attached to the game. Its isolated rehearsal schemas now contain a private player-data copy. Before deploying the application, use separate migration-owner and runtime roles, minimum privileges, a managed service identity, tested restart behavior and monitored backups. The operator role is for rehearsal, not a future web-server credential.

A filesystem copy of a running PostgreSQL data directory is not a sufficient database backup. Produce consistent dumps or use PostgreSQL's supported physical-backup mechanism. Include roles/configuration and recovery keys, and demonstrate a restore before storing authoritative player state locally.

## Completed rehearsal and limits

The October 15 rehearsal copied 901,316 documents at the fixed Firestore PITR read time `2026-10-15T11:44:00Z`, including nested records whose parents do not exist. The private export contains 310 accounts, 283 Google provider subjects and 28 password hashes. All 291 top-level player profiles have a corresponding imported account. The current pointer is `main-realm-2026-10 / realm-2026-10 / shard_0001`.

Import into `crownlands_migration.migration_20261015` completed. A consistent custom-format PostgreSQL dump was restored and every column of every document, account and receipt was compared in both directions with `EXCEPT ALL`; there were no differences. The original schema was retained as `migration_20261015_before_restore`. The raw snapshot is approximately 6.0 GB; the compressed database dump is approximately 584 MB. These sizes describe this rehearsal, not future retention costs.

Private source pages, account/hash/OAuth exports, checksums, receipts and dump are under `~/.local/share/crownlands/firebase-rehearsal-20261015`, outside Git and the web root, with directory mode 0700 and files mode 0600. Do not paste their contents into logs, issues or pull requests. Firestore and Auth exports are **not atomic together**. This older rehearsal must never be switched into production as though it contained subsequent gameplay.

Repeat the read-only export into a new private directory, then import into a new isolated schema:

```sh
python3 tools/local-migration/export_snapshot.py /absolute/private/snapshot-directory
python3 tools/local-migration/import_rehearsal.py /absolute/private/snapshot-directory --schema migration_rehearsal --verify-restore
```

The exporter resumes a committed cursor at its original read time, verifies saved page hashes, adapts page size for large documents and checks final counts. It preserves raw Firestore typed values and fails closed on incomplete accounts, missing hash parameters, tenant configuration, changed read times, duplicate paths or corrupt files. An interrupted `.next` write is retained for operator inspection; do not delete private partial output blindly. The importer refuses an existing target schema and can only target the local Unix-socket rehearsal database.

`local-backend/` is an **unconnected rehearsal library**, not an installed production server:

- `values.js` and `store.js` cover typed values, bounded queries/cursors, nested projections, serializable transactions with retries, and atomic change records. Tests use real PostgreSQL for concurrent receipt deduplication, overlapping balance updates and rollback. This is not a full Firestore implementation: aggregation, bulk-writer compatibility, all complex query types, field indexes/performance, permission enforcement, subscriptions, trigger consumption and game parity remain unfinished. Unsupported operations fail explicitly.
- `passwords.js` verifies imported Firebase SCRYPT using the official public known-answer fixture. Successful local password sign-in preserves the UID and upgrades the private copy to a local scrypt record. No real player's password was requested or used for this test.
- `auth.js` covers opaque hashed sessions, revocation, disabled accounts, one-use verification/reset actions, private pending email records, rate limits, Google subject matching, OAuth state/cookie binding, nonce/PKCE checks, reauthentication, and password linking. Registration defaults off. Registration tests use synthetic accounts. Email-only matches never silently merge identities.
- `auth-http.js` supplies same-origin endpoints with secure HttpOnly session cookies, CSRF checks, bounded bodies/concurrency and generic errors. Its account-action page was visually checked at desktop and landscape-mobile sizes. The separate `rehearsal-server.js` command can run an expiring, LAN-only owner test; it cannot run the game or send account emails. Its installer is separate from the static publisher. Preparing a bundle does not install or start it.

Run the synthetic tests with Node 22, locked local dependencies and the isolated PostgreSQL database. They create uniquely named test schemas, never target the retained source schema, and clean up only their own fixtures:

```sh
pnpm --dir local-backend install --frozen-lockfile --ignore-scripts
node tools/test-local-migration-snapshot.js
node tools/test-local-postgres-import.js
node tools/test-local-document-values.js
node tools/test-local-postgres-store.js
node tools/test-local-password-compatibility.js
node tools/test-local-auth-service.js
node tools/test-local-auth-http.js
```

The release workflow installs the local dependencies and prepares a separate PostgreSQL database when the reviewed selection includes its integration tests. CI fixtures contain no production account data, credentials or email delivery. Production-host PostgreSQL 18.6 was used for the actual import/restore rehearsal; CI uses the runner distribution's PostgreSQL package as an additional compatibility check.

The existing Stripe credentials were read-only verified. Resend's sending domain and restricted key are ready, and the separately approved owner test email was delivered. The authentication outbox is not yet connected to email delivery. The owner-approved Google OAuth callback `https://playcrownlands.com/local-auth/google/callback` was saved and confirmed in Google Cloud Console; the existing Firebase callback remains. The installed private owner preview completed real Google OAuth sign-in on October 15: the original account UID was preserved and the matching imported player profile was found. This verifies account identity, not city gameplay or password login. No local Stripe webhook or local scheduler has been activated. The LAN-only copied game API is installed separately from the live backend. Existing monitoring and host backups remain in place; the new database still needs inclusion in scheduled consistent backups before cutover.

## Private owner sign-in preview

`tools/local-migration/prepare_auth_preview.js` prepares a fresh private installation bundle from a clean, reviewed commit. It selects exactly one named owner account and its matching top-level player profile from the retained PostgreSQL copy, preserves the UID and Google subject, and creates a new `migration_auth_preview_*` schema. It copies no gameplay records into the running account service. The source schemas remain untouched.

The installer requires Ubuntu administrator authentication. It verifies bundle hashes and the previous Caddy configuration, creates a dedicated noninteractive OS account and PostgreSQL role with access only to the preview tables, installs a root-owned Node 22 runtime, and loads the private configuration through systemd credentials. The runtime cannot create schema objects, read the retained export directory, or administer PostgreSQL. The normal game remains on Firebase. Caddy is backed up and restored if the new service/route health checks fail; partial installation files and the copied schema are retained for inspection instead of deleted blindly.

The HTTPS entry is `/local-auth/rehearsal` on the main domain. Both Caddy and the process restrict it to loopback and the configured home LAN (`192.168.1.0/24`); the process binds only `127.0.0.1:9190` and accepts the client address only from its loopback proxy. Reset, verification-email, registration, password-linking, gameplay and worker routes are unavailable. The preview expires two days after preparation and fails closed after expiry. It reports only whether the signed-in account retained its ID and matched its imported profile; it does not establish gameplay parity.

After the preview's real Google/password sign-in checks, stop `crownlands-auth-rehearsal.service`. Before preparing a replacement, inspect the retained service/configuration rather than rerunning its one-time installer. A production account deployment needs its own reviewed installation, current data, backup coverage and full acceptance gates below. No player should use the old preview as a live account system.

## Game runtime and durable work rehearsal

The `functions/platform.js` boundary keeps the original Firebase SDK exports as its default. Only an explicit `CROWNLANDS_BACKEND=postgres-rehearsal` and a separate `migration_game_*` schema select the local adapter. Existing business handlers are unchanged. All 150 exports register locally: 121 callables, three HTTP handlers, ten document triggers and sixteen schedules. Loading them starts no HTTP listener, timers or jobs. Secrets, push delivery and cloud translation credentials are disabled in this isolated adapter; that is a rehearsal boundary, not an approved removal of those features. The owner chose to retain Google Cloud Translation during migration.

Actual PostgreSQL tests exercise the unchanged realm initializer (81 fixture maps, 3,725 cities and 12 camps), authentication/release rejection, the PvP trigger's receipt-based deduplication, season closing fences, deterministic rankings and concurrent season reward claims. These synthetic tests do not alter the retained player snapshot. Callback transactions remain serializable. Blind writes/batches lock every target key, including missing keys, before applying their atomic write under READ COMMITTED; this avoids false predicate conflicts during independent parallel map initialization while preserving concurrent merges/increments, conditional versions and create-only uniqueness.

`local-backend/jobs.js` prepares a transactional outbox and bounded durable queue. Each committed change is acknowledged individually in the same transaction that creates its trigger jobs: a sequence-number high-water mark would lose lower IDs that commit later. Handlers receive immutable before/after snapshots. A retained lease token is checked and locked inside every game write transaction; reclaimed or timed-out workers cannot commit later writes. Jobs run at least once, so the existing business receipts remain necessary. Safe error codes, attempt counts and dead-letter state are retained without error payloads. No queue worker is installed or running against player data.

Scheduling covers the actual interval/daily-cron forms, preserves the Citadel's New York wall time through DST, records each invocation's original scheduleTime, and resumes missed minutes in bounded batches without silently discarding history. A new schedule starts at its initialization minute; a schedule-definition change requires cursor review. Rehearsal execution serializes invocations of the same handler. Load testing, long-outage/realm-boundary recovery, dead-letter alerts, queue retention and production service installation remain acceptance work.

```sh
node tools/test-local-postgres-game.js
node tools/test-local-postgres-jobs.js
```

The live browser still uses Firebase. The owner-only game transport and browser adapter below are prepared for rehearsal. Full permission/workflow parity, account email delivery, replacement purchase/push endpoints, consistent scheduled database backups and end-to-end game tests must be completed before any production cutover.

## Private game interface and preview

`access.js` ports the current Firestore rule conditions into application permissions. The live published rules were read and compared with the repository on October 15; their LF-normalized SHA-256 is `2a941faa654b27c18ab45bd4a9dd2c88e035a8ad6912baef8bc9a86554fb4040`. The permission test pins that source and the protected profile field lists. Authorization reads share the game transaction, including current realm, player profile, clan membership and cosmetic entitlement. Unknown records default to denied. Query authorization checks constraints before reading, including empty queries, then checks returned documents. The port deliberately requires explicit current realm/shard filters for collection queries; legacy-query compatibility and complete differential rule coverage are not established.

`client-data.js` bounds typed writes, transactions, query sizes and response bytes. Browser inputs cannot impersonate internal document references, choose arbitrary query SQL, grant membership, overwrite economic fields or replace protected active sessions. Conditional updates retain document versions. `game-http.js` exposes only registered callables and authenticated data operations under `/api/local-game/v1/`. It uses the existing local HttpOnly cookie, strict origin/CSRF, a proxy-overwritten source IP, owner/LAN/expiry gates, rate and concurrency bounds, redacted errors, and execution deadlines. Every transaction checks its guard again before committing; timed-out work cannot commit late mutations. A timed-out handler keeps its concurrency slot until it stops.

`local-client.js` supplies the existing client's modular auth/data/callable interface only when explicitly selected at `/api/local-game/rehearsal/`. Its listeners share one bounded polling request (1.5 seconds visible, 10 seconds hidden); individual permission failures terminate only the affected listener. It discards old-session responses and preserves typed timestamps, cursors, document parents, transforms and optimistic transaction retries. This is polling, not Firestore streaming; load, responsiveness, network recovery and complete gameplay parity still require acceptance testing. Firebase remains the default client. Push and external purchase operations are unavailable in the private preview; this does not remove them from the live game.

The game preview preparation tool creates a fresh `migration_game_preview_*` schema from the retained snapshot and compares every source row before any preview-only adjustments. Direct import creates no historical trigger deliveries. It preserves the network HMAC, then adapts the copied ingress configuration to the local trusted proxy. The HMAC is the only integration secret available to this preview. Background workers remain disabled for this first interactive inspection; time-based gameplay is not yet validated. The source snapshot and live Firestore remain unchanged.

Its separate Ubuntu installer checks hashes, the existing account configuration and unchanged Caddy configuration, grants a dedicated runtime role access only to the copied game tables and necessary account/session/rate-limit tables, and installs root-owned files with systemd credentials. A failed routing/health check restores Caddy and stops the preview. Installation is an explicit administrator step, separate from the static publisher. The preview uses the existing account session and expires with that private sign-in service. No production backend routing changes. The private build isolates browser storage, disables PWA registration and ads, uses a private update URL, and marks itself as a test. Its CSP prevents browser connections to Firebase. Live service-worker code also excludes local account routes and responses marked private/no-store from caching.

```sh
node tools/test-local-postgres-access.js
node tools/test-local-postgres-game-http.js
node tools/test-local-browser-client.js
node tools/test-local-postgres-game-preview.js
```

These tests use synthetic PostgreSQL accounts/data. They verify negative permissions, allowed scoped queries and edits, immutable source copies, transaction conflicts, independent listeners, stale-session rejection, late-write fencing, private static-file boundaries and browser-storage isolation. The private game preview was installed on October 15 and real Google sign-in loaded the owner's 41 copied cities, resources, clan and chat history. Initial desktop/landscape rendering passed. This is not complete gameplay parity. Interactive testing found that a roughly 584 KB imported save exceeded the original 256 KiB proxy/API request limit. The installed repair permits up to 2 MiB for authenticated writes while keeping callables and reads at 256 KiB, preserving per-value, document and write-count limits. A synthetic 600 KB HTTP save and oversized-write rejection pass. Safe operational diagnostics include only the operation category, status and allowlisted database error code. The separate `update_game_preview.py` repair checks the installed files/configuration, changes only the private route, and restores the runtime and proxy configuration if health checks fail. After the repair, the actual browser save persisted locally and a copied main-city upgrade from level 90 to 91 produced one authoritative city change record. Startup also exposed excess parallel requests; the browser adapter now queues at most six active and 128 waiting game requests, with stale-session/disposal rejection. Its 30-request burst and queue-bound tests pass; installation and renewed startup inspection are pending. Current-scale query timings, complete provider/worker tests and cutover remain outstanding.

## Migration sequence and acceptance gates

1. **Inventory and recovery foundation.** Prove the live realm from production, inventory nested data and dependencies, establish private storage, and validate dump/restore with synthetic fixtures. Verify available disk capacity and recovery time. No source data deletions or live routing changes.
2. **Export/import rehearsal.** Export Auth users and required password-hash parameters privately; preserve exact UIDs, Google subject IDs, verification/disabled state, claims, linked providers and creation metadata. Export Firestore at an explicit consistent read time, including required subcollections, references, timestamps, bytes, 64-bit integers and special numeric values. Build resumable imports with manifests, counts and checksums. Treat PostgreSQL JSONB staging as an import format, not automatic Firestore query/transaction compatibility. Preserve financial receipts, deduplication keys and historical entitlements; scope active-world changes to the verified current realm.
3. **Account service.** Verify Firebase SCRYPT compatibility with synthetic known-password fixtures before claiming password portability. Preserve identity mappings rather than matching accounts solely by email. Support email verification, password reset, Google linking/reauthentication, neutral account-discovery responses, disabled accounts, rate limits and session revocation. New authentication must preserve the single-active-game-session contract and account-to-city ownership. Do not ask players to send passwords to an operator.
4. **Game API and realtime data.** Port request authentication, realm/session guards, error contracts and Firestore rule permissions. Reuse business services where possible. Validate atomic economy changes, idempotency, conflicting transactions and retry behavior against the current implementation. Replace direct browser database operations with server-authorized APIs and scoped subscriptions; reject stale realm/session responses.
5. **Workers and integrations.** Port all scheduled jobs and trigger handlers, preserving timezone/DST behavior, due-work recovery, job leases and receipt-based deduplication. Prove that two worker instances or restarts cannot duplicate awards, charges or battles. Test Stripe signatures/replays, purchase reconciliation, email actions, translation and browser notifications. Keep rehearsal workers from charging, sending production messages or mutating Firebase.
6. **End-to-end rehearsal.** Test a private copy of the current realm with Google and password accounts, city ownership, resource accrual, construction, armies/combat, clans/chat, rewards, realm transitions, purchases, multiple-device takeover and installed-app updates. Compare representative state/results; run affected integration suites against PostgreSQL, not just Firebase emulators. Exercise process/host restart, network loss, database restore and queued-work recovery. Existing production remains the authoritative writer throughout rehearsal.
7. **Reviewed cutover.** Once the user authorizes the tested release, schedule a short maintenance window, stop new authoritative writes and account changes, drain/fence old workers, reconcile pending payments, take a final consistent snapshot, verify import totals and identities, then switch the client/API and start local workers. Record a cutover boundary and endpoint versions. Never run both backends as independent authoritative writers.
8. **Observe and retire.** Verify production logins, purchases, economy and worker execution plus off-site recovery. A rollback after local writes requires preserving/reconciling those writes and payment events; switching URLs back to an older Firebase snapshot would lose progress. Keep the recovery source until the agreed rollback period ends. Retire Firebase services individually only after every remaining dependency is accounted for.

## Account access

- Existing Google Cloud/Firebase access is sufficient for discovery. Later it must allow private Auth/hash export, Firestore export and OAuth configuration. Preserve Google sign-in through the existing Google project or an explicitly chosen replacement project.
- GitHub is needed for the reviewed code changes; no additional hosting account is required for PostgreSQL or Node.js.
- Ubuntu administrator authentication is needed for system packages and services; enter it in the operating-system prompt, never in chat.
- Existing Stripe server credentials are usable; dashboard sign-in is not currently a blocker. Register/test replacement purchase webhooks only after their local handlers are ready. Never put keys or webhook secrets in source control or transcripts.
- Resend is configured for `mail.playcrownlands.com`, with a privately saved sending-only key restricted to that domain. Its owner test email was delivered. Integrating account email actions remains separate work; no paid plan was added.

## References

- [Firebase Auth export and hash parameters](https://firebase.google.com/docs/cli/auth). Exported hashes are not plaintext passwords, and password portability requires the matching algorithm and parameters.
- [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite). The emulators are development tools, not the production self-hosted replacement.
- [PostgreSQL connection settings](https://www.postgresql.org/docs/18/runtime-config-connection.html). An empty `listen_addresses` restricts connections to Unix sockets.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html). Transaction retry and consistency must be explicitly implemented and tested.
