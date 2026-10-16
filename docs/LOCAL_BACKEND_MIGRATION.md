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

The existing Stripe credentials were read-only verified. Resend's sending domain and restricted key are ready, and the separately approved owner test email was delivered. The authentication outbox has passed one explicitly approved owner recovery-email delivery and password sign-in test; continuous delivery and failure monitoring remain unfinished. The owner-approved Google OAuth callback `https://playcrownlands.com/local-auth/google/callback` was saved and confirmed in Google Cloud Console; the existing Firebase callback remains. The installed private owner preview completed real Google OAuth sign-in on October 15: the original account UID was preserved and the matching imported player profile was found. The subsequent owner password-recovery test also preserved that identity and loaded the same 41 copied cities. No local Stripe webhook has been activated; the private worker service runs only against the isolated game copy. The LAN-only copied game API is installed separately from the live backend. Existing monitoring remains in place. The private account/game schemas are now included in scheduled consistent encrypted backups, with the actual restore and off-site results below.

## Private owner sign-in preview

`tools/local-migration/prepare_auth_preview.js` prepares a fresh private installation bundle from a clean, reviewed commit. It selects exactly one named owner account and its matching top-level player profile from the retained PostgreSQL copy, preserves the UID and Google subject, and creates a new `migration_auth_preview_*` schema. It copies no gameplay records into the running account service. The source schemas remain untouched.

The installer requires Ubuntu administrator authentication. It verifies bundle hashes and the previous Caddy configuration, creates a dedicated noninteractive OS account and PostgreSQL role with access only to the preview tables, installs a root-owned Node 22 runtime, and loads the private configuration through systemd credentials. The runtime cannot create schema objects, read the retained export directory, or administer PostgreSQL. The normal game remains on Firebase. Caddy is backed up and restored if the new service/route health checks fail; partial installation files and the copied schema are retained for inspection instead of deleted blindly.

The HTTPS entry is `/local-auth/rehearsal` on the main domain. Both Caddy and the process restrict it to loopback and the configured home LAN (`192.168.1.0/24`); the process binds only `127.0.0.1:9190` and accepts the client address only from its loopback proxy. Reset, verification-email, registration, password-linking, gameplay and worker routes are unavailable. The preview expires two days after preparation and fails closed after expiry. It reports only whether the signed-in account retained its ID and matched its imported profile; it does not establish gameplay parity.

After the preview's real Google/password sign-in checks, stop `crownlands-auth-rehearsal.service`. Before preparing a replacement, inspect the retained service/configuration rather than rerunning its one-time installer. A production account deployment needs its own reviewed installation, current data, backup coverage and full acceptance gates below. No player should use the old preview as a live account system.

## Game runtime and durable work rehearsal

The `functions/platform.js` boundary keeps the original Firebase SDK exports as its default. Only an explicit `CROWNLANDS_BACKEND=postgres-rehearsal` and a separate `migration_game_*` schema select the local adapter. Existing business handlers are unchanged. All 150 exports register locally: 121 callables, three HTTP handlers, ten document triggers and sixteen schedules. Loading them starts no HTTP listener, timers or jobs. Secrets, push delivery and cloud translation credentials are disabled by default in this isolated adapter; the bounded optional translation preview is described below. This is a rehearsal boundary, not an approved removal of those features. The owner chose to retain Google Cloud Translation during migration.

Actual PostgreSQL tests exercise the unchanged realm initializer (81 fixture maps, 3,725 cities and 12 camps), authentication/release rejection, the PvP trigger's receipt-based deduplication, season closing fences, deterministic rankings and concurrent season reward claims. These synthetic tests do not alter the retained player snapshot. Callback transactions remain serializable. Blind writes/batches lock every target key, including missing keys, before applying their atomic write under READ COMMITTED; this avoids false predicate conflicts during independent parallel map initialization while preserving concurrent merges/increments, conditional versions and create-only uniqueness.

`local-backend/jobs.js` prepares a transactional outbox and bounded durable queue. Each committed change is acknowledged individually in the same transaction that creates its trigger jobs: a sequence-number high-water mark would lose lower IDs that commit later. Handlers receive immutable before/after snapshots. A retained lease token is checked and locked inside every game write transaction; reclaimed or timed-out workers cannot commit later writes. Jobs run at least once, so the existing business receipts remain necessary. Safe error codes, attempt counts and dead-letter state are retained without error payloads. A separate expiring worker service now runs only against the private copied game; the live authoritative worker deployment is unchanged.

Scheduling covers the actual interval/daily-cron forms, preserves the Citadel's New York wall time through DST, records each invocation's original scheduleTime, and resumes missed minutes in bounded batches without silently discarding history. A new schedule starts at its initialization minute; a schedule-definition change requires cursor review. Rehearsal execution serializes invocations of the same handler. Load testing, long-outage/realm-boundary recovery, dead-letter alerts, queue retention and production service installation remain acceptance work.

```sh
node tools/test-local-postgres-game.js
node tools/test-local-postgres-jobs.js
```

The live browser still uses Firebase. The owner-only game transport and browser adapter below are prepared for rehearsal. Full permission/workflow parity, production account email delivery, replacement purchase/push endpoints, production backup configuration and end-to-end game tests must be completed before any production cutover.

## Private game interface and preview

`access.js` ports the current Firestore rule conditions into application permissions. The live published rules were read and compared with the repository on October 15; their LF-normalized SHA-256 is `2a941faa654b27c18ab45bd4a9dd2c88e035a8ad6912baef8bc9a86554fb4040`. The permission test pins that source and the protected profile field lists. Authorization reads share the game transaction, including current realm, player profile, clan membership and cosmetic entitlement. Unknown records default to denied. Query authorization checks constraints before reading, including empty queries, then checks returned documents. The port deliberately requires explicit current realm/shard filters for collection queries; legacy-query compatibility and complete differential rule coverage are not established.

`client-data.js` bounds typed writes, transactions, query sizes and response bytes. Browser inputs cannot impersonate internal document references, choose arbitrary query SQL, grant membership, overwrite economic fields or replace protected active sessions. Conditional updates retain document versions. `game-http.js` exposes only registered callables and authenticated data operations under `/api/local-game/v1/`. It uses the existing local HttpOnly cookie, strict origin/CSRF, a proxy-overwritten source IP, owner/LAN/expiry gates, rate and concurrency bounds, redacted errors, and execution deadlines. Every transaction checks its guard again before committing; timed-out work cannot commit late mutations. A timed-out handler keeps its concurrency slot until it stops.

`local-client.js` supplies the existing client's modular auth/data/callable interface only when explicitly selected at `/api/local-game/rehearsal/`. Its listeners share one bounded polling request (1.5 seconds visible, 10 seconds hidden); individual permission failures terminate only the affected listener. It discards old-session responses and preserves typed timestamps, cursors, document parents, transforms and optimistic transaction retries. This is polling, not Firestore streaming; load, responsiveness, network recovery and complete gameplay parity still require acceptance testing. Firebase remains the default client. Push and external purchase operations are unavailable in the private preview; this does not remove them from the live game.

The game preview preparation tool creates a fresh `migration_game_preview_*` schema from the retained snapshot and compares every source row before any preview-only adjustments. Direct import creates no historical trigger deliveries. It preserves the network HMAC, then adapts the copied ingress configuration to the local trusted proxy. The HMAC is the only integration secret available to this preview. Background workers were disabled for the initial inspection. The separate expiring worker service described below now runs against this copied schema; complete time-based gameplay parity remains unverified. The source snapshot and live Firestore remain unchanged.

Its separate Ubuntu installer checks hashes, the existing account configuration and unchanged Caddy configuration, grants a dedicated runtime role access only to the copied game tables and necessary account/session/rate-limit tables, and installs root-owned files with systemd credentials. A failed routing/health check restores Caddy and stops the preview. Installation is an explicit administrator step, separate from the static publisher. The preview uses the existing account session and expires with that private sign-in service. No production backend routing changes. The private build isolates browser storage, disables PWA registration and ads, uses a private update URL, and marks itself as a test. Its CSP prevents browser connections to Firebase. Live service-worker code also excludes local account routes and responses marked private/no-store from caching.

```sh
node tools/test-local-postgres-access.js
node tools/test-local-postgres-game-http.js
node tools/test-local-browser-client.js
node tools/test-local-postgres-game-preview.js
```

These tests use synthetic PostgreSQL accounts/data. They verify negative permissions, allowed scoped queries and edits, immutable source copies, transaction conflicts, independent listeners, stale-session rejection, late-write fencing, private static-file boundaries and browser-storage isolation. The private game preview was installed on October 15 and real Google sign-in loaded the owner's 41 copied cities, resources, clan and chat history. Initial desktop/landscape rendering passed. This is not complete gameplay parity. Interactive testing found that a roughly 584 KB imported save exceeded the original 256 KiB proxy/API request limit. The installed repair permits up to 2 MiB for authenticated writes while keeping callables and reads at 256 KiB, preserving per-value, document and write-count limits. A synthetic 600 KB HTTP save and oversized-write rejection pass. Safe operational diagnostics include only the operation category, status and allowlisted database error code. The separate `update_game_preview.py` repair checks the installed files/configuration, changes only the private route, and restores the runtime and proxy configuration if health checks fail. After the repair, the actual browser save persisted locally and a copied main-city upgrade from level 90 to 91 produced one authoritative city change record. Startup also exposed excess parallel requests; the browser adapter now queues at most six active and 128 waiting game requests, with stale-session/disposal rejection. Its 30-request burst and queue-bound tests pass. The queue repair is installed; renewed Google kingdom entry loaded all 41 cities without new browser warnings. Required GitHub checks passed on commit `258931b`. Current-scale query timings, complete provider/worker tests and cutover remain outstanding.

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
- Resend is configured for `mail.playcrownlands.com`, with a privately saved sending-only key restricted to that domain. Its owner test email was delivered. One approved private recovery email and password sign-in succeeded; the continuous private owner-mail service passed installation/startup/restart. Production delivery and external failure alerts remain separate work. No paid plan was added.

## References

- [Firebase Auth export and hash parameters](https://firebase.google.com/docs/cli/auth). Exported hashes are not plaintext passwords, and password portability requires the matching algorithm and parameters.
- [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite). The emulators are development tools, not the production self-hosted replacement.
- [PostgreSQL connection settings](https://www.postgresql.org/docs/18/runtime-config-connection.html). An empty `listen_addresses` restricts connections to Unix sockets.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html). Transaction retry and consistency must be explicitly implemented and tested.

## Finite background-worker rehearsal

`tools/local-migration/rehearse_workers.js PRIVATE_GAME_BUNDLE 120` prepares a consistent private dump of the copied game schema, then runs a bounded two-worker loop for at most the requested interval plus shutdown grace. It requires a clean committed Node 22 workspace and an unexpired `migration_game_preview_*` configuration. This is an operator rehearsal, not a system-service installation or a production deployment. The 26 background-handler inventory is checked; the incoming-notification delivery trigger is omitted from this disposable copy, so its events are not delivered or replayed later from this rehearsal queue. The other 25 game handlers retain their existing logic. External credentials remain disabled except the existing network HMAC. Handler log payloads are suppressed; only aggregate counts, allowlisted static labels/codes and numeric outcome counts are saved privately. Unknown labels/codes, identifiers, messages and stack payloads are not retained. A timeout retains its execution slot until the underlying handler settles, and stopping/expiry fences subsequent writes. Three finite copied-world runs completed 331 jobs with no remaining failed/backlogged jobs. The final run distinguished the pinned PostgreSQL driver deprecation notice from game errors.

The first 120-second copied-world run completed 164 jobs across 11 handlers, all on their first attempt, with no pending/running/dead jobs and no loop failures. One handler logged an error despite its job completing; allowlisted diagnostics were added to investigate this before continuous operation. The pre-worker dump is retained privately. The private game startup queue repair was installed and checked: 41 copied cities loaded without new browser warnings/errors. Neither result proves full gameplay parity or changes the authoritative live backend.

A second finite run cleared another 96 jobs without army/reward failures. Diagnostics reproduce the installed PostgreSQL driver’s concurrent-query deprecation notice, which Node emits through console.error; only that exact static notice is categorized as a runtime warning. The driver remains pinned at its tested version. The classified copied-world run recorded zero handler errors and zero loop failures.

`prepare_worker_preview.js` prepares a separate expiring worker service against the already tested private game copy. Its Ubuntu installer verifies the installed game configuration and network HMAC hashes, takes a consistent dump, grants a dedicated role only copied-game document/outbox/job permissions, and checks startup plus restart before enabling it. The worker cannot read other migration schemas, create schema objects, access the home directory, or open internet sockets; systemd supplies private credentials and an aggregate status directory. It stops at the existing preview expiry. There is no public worker route, provider delivery or production cutover. These controls support private testing; production queue alerts, retention, restore recovery and complete workload parity remain required.


On October 15 the private worker service was installed and passed actual startup and restart checks. A preparation directory inherited mode 0700 and initially blocked service entry; the scoped repair verified installed hashes and made only the program directory traversable (0755), preserving root-only credentials. Required GitHub checks passed on `78c8f9d`. The worker remains restricted to the expiring private copy.

## Consistent database backup and recovery preparation

`postgres_backup.py` exports one PostgreSQL snapshot shared by both private account and game schemas. It records per-table row counts and SHA-256 fingerprints of every row in primary-key order using the same snapshot as `pg_dump`. Concurrent writes can continue without mixing account and game snapshots. Archives and manifests are private; private SQL diagnostics never enter normal logs. The selected scopes fail closed if new tables lack primary keys or installed account/game targets disagree. This currently protects the migration previews, not a future production database selected implicitly. See PostgreSQL's [shared dump snapshots](https://www.postgresql.org/docs/18/app-pgdump.html) and [transaction snapshot requirements](https://www.postgresql.org/docs/18/sql-set-transaction.html).

The backup installer first restores the actual archive into a newly created, restricted temporary database as the existing non-superuser owner and compares every table fingerprint. Successful disposable copies are removed; a failed copy and its private diagnostic target receipt are preserved. Only after this check does it add snapshot preparation before the existing Restic backup, include installed account/game/worker configuration and runtime files, and start the existing backup service. Encryption, cloud destination, daily schedule, retention and failure-alert endpoint are unchanged. A database snapshot failure prevents that backup from being reported successful. Synthetic tests prove snapshot isolation during concurrent writes, full row recovery, sequence restoration and rejection of damaged archives. Actual installation, full restore and the first verified off-site copy are separate acceptance steps.

These are daily recovery snapshots. They do not yet provide point-in-time recovery between runs; recovery-time and recovery-point targets, worker replay after restoration, off-computer custody of the Restic recovery password and the final fresh-data migration remain cutover gates.


The backup installer completed the real restore on October 15: all 903,819 rows across 11 private account/game tables matched. The first scheduled-service run then captured another consistent snapshot and completed both encrypted local and off-site backups; the service exited successfully and the existing backup-health endpoint reported current backups. These results cover the current private copy and installed rehearsal configuration. The final production target will need its own explicit backup configuration and recovery check.

## Account email delivery rehearsal

`local-backend/auth-mail.js` adds an explicitly invoked account-outbox dispatcher; importing it starts no process and sends nothing. Preparation must initialize its separate delivery table with schema-owner access. Runtime delivery claims one pending message with a lease, freezes the exact provider payload before sending, and reuses the same idempotency key after network ambiguity or process failure. Lease tokens fence late local acknowledgements. Retries stop at eight attempts or the one-hour action lifetime, which is shorter than [Resend's idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys). Successful API acceptance is recorded as accepted, not proof of inbox delivery.

Before each claim, the dispatcher checks the action token, purpose, current account address, disabled state and expiry. Consumed and superseded links are discarded. URL-bearing payloads are cleared on acceptance, terminal failure or supersession. A link invalidated while its email is already in flight can still arrive, but cannot change the account. The Resend rehearsal transport requires an explicit recipient allowlist, uses a fixed verified sender domain and API endpoint, rejects redirects, bounds requests, and retains only fixed error codes. It does not include arbitrary provider errors in logs. Synthetic tests cover concurrent workers, a crash between provider acceptance and local acknowledgement, immutable retries, expired/consumed actions, stale leases and recipient/URL rejection. The approved private owner recovery email was accepted by Resend and completed by the owner. The database confirms one-use token consumption, a new password session and the preserved original identity. That email was a controlled operator delivery; the continuous private service described below was installed afterward without sending another email.


`update_auth_action_preview.py` prepares a checksum-guarded update to the existing one-account sign-in service. Its explicit `allowEmailActionTest` flag enables only the private action page and one-use action submission; registration, password linking and browser email-request routes stay blocked. The account service gains only SELECT/DELETE on its own action table, while its existing account/session permissions handle consumption. The update retains the same LAN, origin, CSRF and expiry controls; restart failure restores source, configuration and added privileges. The preview page distinguishes the copied account from live Firebase and returns to the private sign-in test. Desktop (1365×768) and landscape (844×390, with vertical scrolling and no horizontal overflow) visual checks passed on synthetic content.

After that protected update is installed, `rehearse_account_email.js` can send exactly one explicitly approved owner password-recovery test through the recipient-restricted Resend transport. It requires a clean committed workspace, a fresh private receipt directory, an unexpired preview with exactly one matching verified account, no existing pending mail, and a verified private action page. It records provider acceptance privately; actual inbox receipt and completion remain human checks. Do not run it without the owner's specific approval for that test email. The owner enters and submits the new private-test password themselves; never read or transmit it through the operator. The live Firebase account and original export are unaffected.


The private action update was installed on October 15. The owner completed the approved recovery email and password sign-in in the browser. The account remained a single record with its original UID and matching profile. Reloading the private game with that password session loaded all 41 copied cities and retained the earlier level-91 test upgrade. This tests recovery for the copied owner account, not password compatibility for every imported player or live Firebase changes. No new email was sent during verification. The delivery table added after the earlier 11-table restore was included in the subsequent verified 12-table cloud recovery check below.

### Continuous private account-mail service

`auth-mail-loop.js` and `auth-mail-rehearsal.js` prepare a separate, expiring single-delivery worker. Stop and expiry abort an in-flight Resend request, retain its durable retry receipt, and prevent another request after a delayed database claim. A restart uses the existing frozen message and provider idempotency key. Transient database failures, terminal delivery failures and a pending queue older than five minutes make its aggregate private status unhealthy. Status contains counts and timestamps only. This status file is operational evidence; it is not yet connected to an external outage alert.

The runtime role can read a projection containing only account UID, address and disabled state, read action validation columns, update existing mail statuses and manage delivery leases/receipts. It cannot read password hashes or sessions, create messages, alter accounts/actions, create schema objects or read other migration schemas. Preparation initializes the projection; runtime startup never creates tables. The service has no listener, receives its domain-restricted Resend key through systemd credentials, and remains restricted to the copied owner's address and the existing preview expiry. Browser registration and email-request routes remain blocked.

`prepare_mail_preview.js ORIGINAL_AUTH_BUNDLE PRIVATE_RESEND_KEY NEW_PRIVATE_BUNDLE OWNER_EMAIL` requires a clean committed workspace, one matching copied owner and no pending mail. `install_mail_preview.py` checks the entire installed account configuration, creates the restricted Ubuntu/PostgreSQL identities, tests fresh startup and restart, and adds only the new runtime/configuration/unit paths to the existing encrypted backups. A failed install removes only its newly created service and grants, preserving accounts and mail records. No installer test message is queued or sent. Real protected installation and restricted-role startup are operational acceptance checks; production delivery, external failure alerts, non-owner account flows and the final cutover remain separate gates.

`tools/test-local-postgres-mail-service.js` exercises the actual PostgreSQL outbox with synthetic transport: empty-queue behavior, no password material in the projection, service restart without replay, bounded concurrent sends, cancellation, stop/expiry during database waits and provider I/O, durable retry recovery, private status, unsafe-role refusal and installer rollback. The existing dispatcher suite continues to exercise frozen payloads, leases, provider failure and token lifecycle. No real email is sent by either suite.

The installer explicitly sets traversable permissions on both the top-level program directory and its descendants after creation. Tests use an actual `umask 077`, which otherwise masks `mkdir(mode=0755)` to `0700`; credential directories remain private. A failed first start demonstrated the rollback before this permission correction.

The corrected service from `d865cc4` was installed and enabled on October 15. Actual startup/restart passed; all 575 installed program/dependency files matched the prepared bundle, and restricted-role checks confirmed the expected account/session/action/schema boundaries. The queue had zero pending or failed messages and retained only the earlier accepted owner test. No new email was sent. The subsequent cloud recovery check described below includes this service and its delivery table. All required GitHub checks passed on that commit.

## Native payment webhook rehearsal

`local-backend/payment-webhooks.js` prepares an explicitly invoked, expiring native Node HTTP adapter for the existing live/test payment handlers. It requires a separate `migration_game_*` store and supplied verification/reconciliation functions; importing it starts no listener or provider request. It accepts only loopback connections with the canonical Host and exact mode-specific path, rejects duplicate signature headers and encoded/oversized bodies, and preserves the raw bytes for [Stripe signature verification](https://docs.stripe.com/events/manage-webhook-endpoints#signature-errors). A bounded request count and body/deadline timers limit pending work. A timed-out provider operation retains its slot and its transaction guard rejects a later credit. Failed reconciliation returns a retryable failure; successful responses follow the existing atomic order/wallet receipt.

`node tools/test-local-postgres-payments.js` uses real PostgreSQL, native loopback HTTP, the installed Stripe SDK's test signature generator/verifier, and synthetic provider/account/order fixtures only. It covers missing/invalid/expired/tampered signatures, wrong mode/account/host/path, duplicate headers, body bounds, incomplete uploads, paid versus unpaid evidence, lost checkout responses, concurrent/restarted webhook replay, one credit/change record, refund-review deduplication, isolated test-wallet credit, provider failure, overflow rollback and concurrent game credits. A stalled provider test proves no credit after the request deadline, followed by successful retry. Existing Firebase payment suites remain selected as independent evidence for unchanged business logic.

No payment listener, public route, real checkout or new Stripe destination was installed or activated by these tests. Existing preview credentials remain HMAC-only. Provider connectivity, endpoint-specific secrets, restricted production service installation, outstanding-payment reconciliation, refund/dispute ordering acceptance and a controlled Stripe test-mode end-to-end delivery remain required before routing live payments here.

### Provider-connected disposable payment test

`payment-provider-rehearsal.js` restricts provider connectivity to a test secret key, one designated owner, a fresh `migration_game_paytest_*` schema and a maximum one-hour lifetime. It reuses the existing test payment service and native signed HTTP adapter, while adding a distinct Stripe metadata purpose and per-run marker. Existing Firebase test webhooks ignore that purpose; the local receiver ignores other tests. Retrieved provider sessions must match both markers before they can be reconciled. Shutdown and request/preview expiry fence later database commits. Only the separate sandbox wallet receives test credit.

`rehearse_stripe_payments.js` is an explicitly invoked operator tool. It requires a clean validated commit, the still-valid owner preview, private test credentials and the previously approved 1,000-Crown/US$4.99 test offer. It copies only the test configuration and owner profile into a new disposable schema, starts a temporary loopback receiver, and uses [Stripe CLI forwarding](https://docs.stripe.com/cli/listen) for signed provider events without changing existing external endpoints. The CLI key is supplied through its documented environment variable; signing secrets and unrelated CLI event details are never printed or saved in logs. The prepared Checkout URL and receipts stay in a private directory. The operator must use Stripe's test payment details only.

The operator waits for automatic webhook fulfillment before checking order status, verifies exactly 1,000 test Crowns and an unchanged copied playable profile, then repeats status checks to detect duplicate credit. Stop/expiry closes forwarding and the listener and expires only an open Checkout belonging to this run. Ambiguous cleanup is marked for review and retained receipts must be inspected before retrying. The temporary forwarding test does not prove public HTTPS webhook routing, install a production payment service or authorize a live payment cutover. Synthetic PostgreSQL/provider/HTTP tests verify marker isolation, signature/mode boundaries, provider evidence checks, replay safety and shutdown while a provider response is delayed.


Owner acceptance found building artwork obscured in Inner Castle. The images loaded successfully; the shared layered button theme painted opaque rectangles over the transparent building hit targets. The palette now excludes those targets from generic button styling. The existing private repair can include that one stylesheet with source checksums and rollback protection. Desktop/landscape verification and installation are recorded separately; this does not change building progress or authoritative gameplay.

On October 15, the provider-connected sandbox run at `03e4278` completed using Stripe’s published test card and synthetic billing details. One signed provider event automatically fulfilled the isolated order before any status reconciliation was invoked. PostgreSQL recorded exactly 1,000 test Crowns; three subsequent status checks added none, and the copied playable profile was byte-for-byte unchanged. The temporary listener and CLI forwarding stopped successfully. Existing Stripe endpoints and live payment routing were unchanged. All required GitHub checks passed on `03e4278`. This verifies temporary provider forwarding, not the eventual public payment service.

Recovery review found the original host-wide `node_modules` exclusion also omitted installed service dependencies. The backup installer now scopes this exclusion to development/setup directories under `/home/project-server`, preserving every other exclusion, including private backup credentials and caches. An actual encrypted Restic fixture backup/restore verifies that nested installed dependencies survive while development dependencies and separately excluded credentials stay absent.

The repair at `e06ad9f` was installed on October 15 after Ubuntu authentication. A fresh encrypted local/cloud backup completed. The cloud snapshot was restored into a separate restricted location and temporary PostgreSQL database: all 907,901 rows across 12 tables matched, including account-mail delivery; 47,066 installed runtime, dependency, configuration and service-unit files matched contents and modes. The temporary database was removed after verification. Private recovery evidence is retained under `/var/backups/crownlands/recovery-check-20261015T184412Z`. All required GitHub checks passed. Daily snapshots still do not supply point-in-time recovery; off-computer custody of the recovery password and a fresh final-data cutover backup remain required.

## Bounded Google Translation preview

`chat-translation-rehearsal.js` prepares an optional provider for the private game. The original Firebase provider remains the default. The local game must explicitly enable the test and supply a separate systemd credential matching the existing owner, copied schema and expiry. General Firebase credentials, messaging and payment secrets remain unavailable through the local platform. Workers receive no translation credential.

The private copy must not get a second 500,000-character allowance while the live Firebase game is active. Before activation, the operator reserves exactly the prepared allowance (at most 1,000 source Unicode characters) in the live `chatTranslationUsage/YYYY-MM` transaction and records an idempotent receipt under `chatTranslationRehearsals`. `reserve_translation_allowance.js PRIVATE_BUNDLE --reserve-approved-allowance` performs that production write and therefore requires the owner's explicit approval; the flag alone is not permission. It uses the signed-in operator only for setup. The runtime never connects to Firestore. Its matching local receipt is created once; retries, failures and restarts never reset or refund usage. Both detection and translation spend this small allocation, while shared-service cache hits do not. The original authorization, message visibility, source-text selection and post-response access rechecks remain in use.

The proposed dedicated identity is `crownlands-local-translation@crown-land-b15e0.iam.gserviceaccount.com`, with only `cloudtranslate.generalModels.predict`, `cloudtranslate.languageDetectionModels.predict` and `serviceusage.services.use`, and an IAM binding ending at the preview expiry. These permissions follow Google's [Translation access controls](https://docs.cloud.google.com/translate/docs/access-control) and [billing-project authentication requirements](https://docs.cloud.google.com/docs/authentication/rest). No player-data, account, backup, payment or email privileges are needed. The key is kept out of Git, served only through a private systemd credential and used with the cloud-translation OAuth scope. Token exchange and translation destinations are pinned; redirects and automatic retries are disabled. Two local operations can run concurrently, with bounded token/provider I/O and stop/expiry checks before and after waits. Errors retain no key, token, message or provider response body.

`update_translation_preview.py prepare ORIGINAL_GAME_BUNDLE PREVIOUS_REPAIR NEW_BUNDLE` captures the exact installed runtime/configuration/unit hashes and prepares a new, disabled update. After allowance approval and credential provisioning, `install NEW_BUNDLE` updates only the private game service, checks startup/restart and HTTPS health, and rolls back files/configuration/unit on failure. It never changes Caddy routing or extends the preview expiry. Rollback does not refund the source allowance. After a database restore, do not reuse an old allowance: revoke the old credential, review retained source receipts and reserve a fresh bounded allocation before enabling translation. Otherwise restoring a lower local usage counter could spend the same reservation twice.

The synthetic PostgreSQL suite verifies atomic source/local reservations, collision/retry handling, Unicode accounting, concurrent limits, no refund/reset, JWT signing and Google request shape, private source/cache access, authorization after a delayed response, and stop/expiry during token/database waits. Installer fixtures verify changed-file refusal, private credentials and rollback. These tests send no real requests. Dedicated cloud access, a synthetic provider probe, installed preview verification and eventual production allowance continuity remain operational gates.


## Private browser notifications without Firebase Messaging

A separate, optional `crownlands-push-rehearsal` service uses the standard Web Push protocol with a locally generated VAPID signing key. It requires no Firebase project or new provider account. Browsers still use their vendor's delivery infrastructure. The existing public Firebase client and service worker remain the default until cutover.

The private browser adapter registers `local-push-worker.js` only under `/api/local-game/rehearsal/`, with no fetch interception or cache. It uses the existing Settings permission/registration controls and device-bound token documents, replacing only the opaque token value with a versioned native subscription. The copied owner is the sole permitted recipient. Only fresh subscriptions matching the new key and outbox entries created after preparation are eligible. Copied Firebase tokens and historical outbox entries are ignored. Public game storage, worker, manifest and routing are unchanged. Cold and warm notification clicks preserve city/region targets within the private game.

Payload construction is shared with the unchanged Firebase notification handler. The local dispatcher retains its durable outbox lease and per-device delivery receipts, removes only confirmed expired subscriptions, and bounds provider requests to eight seconds without redirects. The encrypted request is addressed only to explicit Google, Mozilla or Apple browser-push endpoints. Provider errors/bodies, subscription URLs, authentication secrets and signing keys are excluded from logs/status. Acceptance by a browser vendor is not proof that a device displayed the alert; an interrupted response may require a repeat attempt, with a stable notification tag/topic limiting duplicates.

`prepare_push_preview.js ORIGINAL_GAME_BUNDLE VERIFIED_TRANSLATION_BUNDLE NEW_PRIVATE_BUNDLE` captures installed client/configuration hashes, generates the private key, and creates a non-resettable five-attempt PostgreSQL reservation. It starts no service and sends nothing. After approval, the prepared installer adds the separate service, checks its startup/restart before publishing the private client, and adds the new runtime/key/unit to encrypted backup sources. The existing game worker keeps its network isolation and receives no push key. The notification role has document/change-write access only to the copied game schema, with no authentication-schema, scheduler, DDL or cloud-credential access. Application scope limits delivery to the owner; this is a private acceptance service, not the final production privilege model. Changed files abort installation and failures restore the private client and remove the newly created service/role. The test expires with the private game and stops when its five attempts are consumed.

Automated tests decrypt a real encrypted payload, reject unsafe destinations and mismatched keys, verify partial retries and restart receipts against PostgreSQL, and exercise permission, scope, expiry, click handling and installer recovery using fixtures. They send no real notifications. Actual browser permission and displayed-notification confirmation remain required before acceptance; Safari/Firefox/mobile delivery and production subscription migration must be checked before cutover. Restoring an old backup must not refill this test allowance: disable the restored service and prepare a fresh bounded scope/key before any further test.

## Permanent services and payment ingress

The owner requested permanent services, failure alerts and payment routing on October 15. `prepare_permanent_services.js NEW_PRIVATE_BUNDLE` packages the committed runtime, separate systemd identities/credentials and an empty permanent database target. The protected installer verifies checksums and the previous Caddy/backup configurations, tests startup and restart, and enables automatic startup. Six account/game/worker/mail/push/payment processes remain in **standby** until a separately reviewed fresh-data cutover. Standby opens no player ports, database connections or provider operations. These services have no test expiry; the existing private rehearsal retains its expiry and copied data.

The permanent targets are `migration_auth_live` and `migration_game_live`. Runtime roles cannot create objects or change the administrator-owned `crownlands_control.deployment` row. A root-owned activation file and matching database epoch must both permit activity. Database statement triggers fence writes, with shared row locks preventing an authority change from completing ahead of an in-flight transaction. Activation additionally requires snapshot and Firebase-writer-fence receipt hashes. There is deliberately no activation/import command in this installer. A restored installation must remain stopped and in standby until its receipts, provider state and authority have been reconciled; restoring old active configuration alone is not a safe recovery procedure.

Root collects database/disk, worker backlog/lease/schedule/handler errors, account-mail failures, notification delivery, payment retries and service health every 30 seconds. The public `/service-healthz/{database,workers,email,notifications,payments,services}` routes expose only a generic ready/unhealthy response; stale or missing collection fails closed. During standby the worker/mail/notification checks cover the private rehearsal. After activation they cover the permanent services. External Google uptime checks and email policies must be created and verified after these HTTPS routes pass installation checks. They retain the existing operator channel; the local monitor is not relied upon to email during a power or internet outage.

`/api/payments/stripe/test` and `/api/payments/stripe/live` are the stable local ingress destinations. The receiver verifies the existing Stripe signing secrets, mode and account before forwarding the unchanged signed bytes to exactly one authority. Standby forwards to the current Firebase webhook; active forwards to the local loopback payment service; maintenance returns a retryable failure. It acknowledges only an upstream success, bounds requests and concurrency, rejects redirects, and persists only hashed pending event identities for failure alerts across restarts. Another event's success cannot clear a failed event. Provider data, signature headers and event bodies are never logged. Local test/live payment logic retains the existing independent wallets and idempotency receipts, including manual-review refund/dispute handling.

Routing installation does not change Stripe automatically. Verify signed, non-purchase probes through the public routes first; then update the existing test endpoint URL, verify delivery, and update the existing live endpoint URL. Retain endpoint IDs, signing secrets, API versions and subscribed event types, and save the old metadata privately for rollback. Do not create parallel independent fulfillment writers or replay a real payment as a routing test. At final cutover, put ingress into maintenance, wait for its in-flight count to reach zero, stop/fence Firebase writers, take and verify the fresh snapshot including pending payment orders, then activate the matching local epoch and reconcile outstanding deliveries. A DNS or webhook URL change alone does not complete payment-authority migration.

Backups explicitly include the two permanent schemas and control receipts alongside the preview, plus installed runtime files, credentials and units. Installation verifies all-row recovery into a separate restricted database before extending the existing encrypted backup and starting a new cloud copy. Existing schedules, retention and destination remain unchanged. Independent-cluster tests start all six permanent roles, exercise restricted privileges, and prove standby and concurrent write fencing without using player data or real external credentials.

Remaining cutover work includes the production browser/auth/push configuration, expiring Translation IAM conversion and allowance continuity, complete gameplay and pending-purchase reconciliation, the fresh snapshot/Firebase writer fence, and off-computer custody of the recovery password. Neither installing standby services nor changing Stripe's ingress URL makes the local game authoritative.

## Production browser candidate

`prepare_production_client.js BUILT_DIST PUBLIC_CONFIG NEW_CANDIDATE` prepares a separate local production artifact and checksum receipt. The public configuration contains only `mode: "production"`, `protocol: 1`, the permanent activation epoch, and its native-push public key. The normal build and automatic publisher still select Firebase. This preparer neither installs files nor changes routing, credentials, player data or authority. Reject private configuration fields, links, changed inventories and an existing destination; retain partial output for inspection if preparation stops.

The candidate loads its immutable local configuration before other game scripts. It retains the canonical `/play/` installed-app identity and starts a separate, epoch-stable device-storage namespace; old Firebase and private-preview saves remain preserved but are never automatically uploaded into the new backend. Both account and game health endpoints must confirm the same protocol and epoch before authentication begins. Every account/game API request carries that epoch, and permanent services reject a missing or different value. Maintenance still closes the root/database authority fence. Google returns to `/play/`; production recovery/verification pages use the matching account service and return to the game.

The production service worker imports no Firebase SDK. It keeps existing PWA caching and launch behavior, excludes account/game responses from caches, and handles native notifications with bounded expiry and same-origin game clicks. Before replacing an existing Firebase subscription, the browser asks the active worker to confirm its local protocol, epoch and public key; matching script URLs alone do not prove the worker has updated. The candidate uses a distinct, matching HTML/worker build identity so an existing installed app sees a real update without a reload loop. Private notifications remain scoped to their separate rehearsal worker.

Tests cover separate artifact generation, immutable storage isolation, incompatible-backend refusal, native worker handshakes and click destinations. An independent PostgreSQL cluster exercises the actual production browser adapter against restricted account/game roles: password sign-in, reading and saving a profile, rejected economy/cross-player writes, maintenance fencing and logout. Desktop and landscape-mobile browser checks use synthetic account responses and send no provider messages. This does not replace real production Google/password, installed-app upgrade and multi-browser notification acceptance after a fenced fresh-data transfer. Installed standby runtime files must be updated to this tested protocol as part of the reviewed cutover bundle; passing source tests is not installation evidence.

## Source controls and final snapshot preparation

The project owner already has permanent Owner access. An attempted permanent
`roles/iam.denyAdmin` grant was rejected: Google permits that role only at an
[organization](https://docs.cloud.google.com/iam/docs/roles-permissions/iam#iam.denyAdmin),
and this project has no organization parent. No new IAM grant succeeded. The
transfer must use the owner's existing service-management permissions; creating
an organization is not a prerequisite for this approach.

`prepare_firebase_freeze.py NEW_PRIVATE_DIRECTORY` only reads current metadata.
It captures the 150 deployed functions and matching Cloud Run invocation
policies, 16 schedules, API key restrictions, published rules, project IAM and
the three reviewed game service accounts. It rejects unexpected identities,
bypassed Cloud Run invocation checks, unrestricted keys, missing pagination and
other inventory drift. Original rules and restrictions remain in the private
plan for recovery. It never downloads an API key string or changes access.

`firebase_transfer_controls.py PRIVATE_PLAN_DIRECTORY close|fence|rollback`
is a separately guarded control-plane procedure. It requires fresh root-owned
maintenance and drained-payment receipts tied to that exact plan and the
installed epoch, stopped automatic publishing, and a matching maintenance
proxy. **The final activation/import procedure remains separate; do not
manufacture receipts to bypass these checks.** Closing pauses schedules, blocks the old account APIs, publishes
deny-all client rules, and removes public invocation while preserving internal
event-drain identities. Fencing requires at least ten minutes after closure
and disables only the reviewed game runtime/Admin SDK identities. Owner,
Google-managed service agents, Translation, monitoring and backup services are
retained. Do not use retained administrative identities to deploy or import
while the source is being drained.

Every request is journaled before submission and read back afterward. A lost
acknowledgement is reconciled by reads; an unresolved request is not repeated.
Rollback restores only this attempt's controls, preserves previously paused
schedules and refuses concurrent policy drift. It requires fresh evidence that
the local game has never been activated. After local authoritative writes,
recovery requires data reconciliation rather than reopening the old source.
Neither a ten-minute wait nor successful control-plane changes proves all
sources have stopped writing: the journal deliberately keeps `sourceFrozen`
false. Actual client/runtime denial, propagation, stable account/data reads,
pending trigger work and outstanding payments must still be verified before
the final snapshot and single-authority switch.

`export_snapshot.py --read-time UTC_MINUTE` permits the reviewed post-freeze
PITR minute. It rejects changing an existing snapshot's read time and retains
the default rehearsal timestamp when no explicit value is supplied. Full Auth
exports are still separate reads; verify stability across the stopped-source
boundary. A rehearsal snapshot must never substitute for the final copy.

`verify_final_snapshot.py PLAN_DIRECTORY SNAPSHOT_DIRECTORY NEW_OUTPUT_DIRECTORY
--read-time LATER_UTC_MINUTE` provides the separate read-only comparison. It
requires the completed, unreversed control journal and current protected
maintenance evidence. It rereads all 171 controls, deployment/key/job inventories,
the exact deny rules and project permissions before and after comparison, and
rejects automatic TTL deletion policies using the provider's default page size
and complete bounded pagination. Deployment comparison treats only the order
of Eventarc attribute filters as irrelevant; every filter value, operator,
duplicate and other deployment field remains checked. Eventarc requires
[all filters to match](https://docs.cloud.google.com/eventarc/standard/docs/workflows/route-trigger-eventarc).
Every exported typed document,
including its original creation/update versions, must match a complete second
Firestore scan at the later fixed minute. A new private Auth export must match
every account, password parameter and Google provider setting. Different account
pagination order is allowed; duplicate identities are rejected. Changed data,
lost maintenance, incomplete streams and partial key operations produce no
success receipt. Output contains counts and hashes; private account payloads
remain in private directories. The observation gap is not a token-revocation
guarantee, and this receipt does not authorize activation: actual client/runtime
denial and queued event/payment reconciliation are still required.

`import_final_schema.py SNAPSHOT_DIRECTORY VERIFICATION_DIRECTORY --schema
migration_final_HEX12` is the protected copy step after the final snapshot has
been imported into a unique staging schema and independently restored. It
requires matching current root maintenance and plan identity, exact fresh
account-provider/hash settings, a snapshot manifest digest in the staging
receipt, and empty permanent tables. One database transaction locks the source
and its retained pre-restore copy, compares every row, copies all documents and
accounts, and compares the targets again. Existing data or a prior activation
is never overwritten. The original typed values and Translation usage ledger
are copied unchanged. No historical triggers or schedules are enqueued.

The copy records only the snapshot verification digest. It deliberately leaves
the Firebase-fence receipt and activation timestamp unset, with the root and
database gates in maintenance. Final scheduler cursors, the reviewed ingress
configuration, recovery verification and source-fence evidence belong to the
separate activation step. If the process stops after its database commit, retain
the populated target and reconcile the recorded digest; do not clear it to retry.

### Final handover checks and activation

The reviewed final-copy and local publisher preparation at `72c325f` is installed
in standby. Its first operational attempt rolled back because a loopback health
probe omitted the required `Host: playcrownlands.com` header. The corrected
installer passed all six real health checks and preserved the prior candidate.
No maintenance, source freeze, production import or local activation occurred
as part of that installation.

`handover_checks.py` classifies current-realm receipt backlogs without editing
archived data. Purchase orders are global: the live collection is
`crownPaymentOrders`, and the separate test collection is
`crownPaymentTestOrders`. Any unfinished purchase, manual payment review,
unprocessed current-realm reward/battle receipt, missing subscription metric,
nonzero backlog or unsuccessful scheduler result prevents handover. Ten event
subscriptions must each have two recent zero observations after fencing;
missing metrics are never treated as zero. Profile-change triggers additionally
depend on this queue drain because the final document cannot reconstruct their
original before/after event.

`verify_handover_payments.js SNAPSHOT NEW_RECEIPT` verifies page checksums and
reads Stripe's existing endpoints and each saved Checkout. It uses the unchanged
game purchase validators, requires settled matching provider results, and creates
no Checkout, charge, refund or webhook event. Its receipt binds the complete
source snapshot manifest, preventing reuse of an older preflight payment list.

`verify_source_handover.py PLAN SNAPSHOT COMPARISON BASELINE PAYMENTS NEW_OUTPUT`
rereads all source controls, verifies the exact snapshot's pending-event inventory,
compares the subscription configuration and checks actual account/API/runtime
denials. Baseline reads must have succeeded before closure. For client rules,
it fetches the published ruleset before and after Google's rules evaluator tests
30 denied read/write contexts, including 20 authenticated contexts with ordinary
and administrator claims. Only the exact unconditional deny-all source is
accepted, after at least ten minutes from completed closure. This is explicitly
recorded as a published-rules evaluation, not an observed signed-in browser
request; it works when existing player sessions have already closed without
reopening authentication. The independent runtime denial, source controls and
full stable-data comparison remain required. See the official
[rules evaluator](https://firebase.google.com/docs/reference/rules/rest/v1/projects/test)
and [listener propagation guidance](https://firebase.google.com/docs/firestore/security/get-started).
It retains
fresh scheduler results and derives reviewed local cursors only from paused,
successfully completed HTTP jobs. Cloud Scheduler's `lastAttemptTime` alone is
not completion evidence; its corresponding successful status and a quiet interval
are also required. Daily cron schedules retain their timezone; the existing
local interval scheduler resumes on its UTC minute boundaries. See Google's
[job field definitions](https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs).
The command holds the source-control lock, checks again at the end and writes
its success receipt last. It performs no source mutation, import or activation.

`activate_local_transfer.py PLAN SNAPSHOT COMPARISON BASELINE --schema
migration_final_HEX12` is the separate administrator operation after maintenance,
source fencing, final export/comparison and staging restoration. It checks the
protected client and publisher identities, obtains fresh handover evidence,
copies into empty permanent targets and seeds reviewed schedule cursors. The
only configuration delta uses the normal typed store to set verified single-hop
proxy ingress when that protection is enabled; the other fields and historical
records remain intact. It then prepares the local release, completes an encrypted
off-site backup, independently restores every backed-up table, compares the still
closed permanent target, and repeats source/payment checks before activation.

The database receipt, root epoch, local client, service startup and HTTPS routes
form a journaled sequence. Failure keeps maintenance and all data, receipts and
activation timestamps; it never restores Firebase authority. A lost commit
response therefore requires inspecting the retained journal, never clearing the
target or rerunning the initial import. Successful publication still requires
real production login/save, browser-update, notification and payment acceptance
and a fresh backup of the active installation. The command's preparation and
synthetic tests do not establish that the production transfer has occurred.

The permanent game service also provides the website's public historical
`/api/season-rankings` through the existing sanitized archive reader. It
preserves public fields and cache rules, rejects duplicate parameters and
stops during maintenance. `prepare_cutover_routes.js` produces separate Caddy
maintenance/active candidates without installing them; the active candidate
replaces the remaining Firebase rankings proxy and routes account/game APIs
to the permanent services. The live routes and publisher still require their
reviewed activation update.

### Protected maintenance preparation

`install_transfer_maintenance.py prepare CANDIDATE NEW_BUNDLE` prepares an
initial-standby installation from a separately checked production candidate.
The installer validates the exact four server protocol updates against their
installed and reviewed checksums, backs them up, restarts only the six standby
services, and requires all six health endpoints to pass. It adds the protected
helper, configuration and receipts to encrypted-backup coverage. Installation
does not edit the live Caddy configuration, change Firebase, pause publication,
start the maintenance timer or produce an authorizing receipt. Changed targets
are preserved for review; a standby installation failure restores its runtime
files before reporting failure.

The first protected installation exposed the operator's private `umask 077`:
creating a nominally `0644` file did not make it readable by service accounts,
and the original rollback had the same defect. Atomic writes now explicitly set
the requested mode on the open file, and public program/receipt directories have
explicit traversal permissions. Private configurations remain `0600`/`0700`.
Success and rollback fixtures run under `umask 077`, and installation checks
actual read access as each of the six runtime identities before starting them.

Once the remaining import, reconciliation and activation workflow is ready,
the separate root command `transfer_maintenance.py begin PRIVATE_PLAN_FILE`
begins player-visible maintenance. It binds a fresh source plan to the installed
epoch, checks that permanent tables are empty and have never been active,
persists its attempt, pauses and disables automatic publication, and waits for
the publisher's existing lock and inactive state. It never kills an in-progress
publication. The database fence and root phase close local authority and payment
forwarding before the validated maintenance Caddy route is installed. A failed
or interrupted transition stays closed; this helper cannot activate the local
game or automatically reopen Firebase.

The installed timer runs a root-owned `check` every 15 seconds during
maintenance, including after a reboot. It requires the database and root phase
to agree, `activated_at` to remain absent, the publisher to be stopped, reviewed
runtime hashes, fresh maintenance status from all six services, and actual
HTTPS 503/no-store responses for the game, account, game API and rankings routes.
The payment receiver must report zero in-flight requests in a fresh observation
after maintenance started. Pending payment hashes are retained and represented
only by a count in the public receipt; draining does not prove fulfillment.
Both root-owned receipts are removed if any check fails. These attestations
authorize only the separately journaled source controls, not final source
quiescence, data import or local activation.

Offline fault tests cover drift, interrupted transitions, publication overlap,
stale or unfinished payment drain, retained delivery failures, wrong plans,
receipt withdrawal and protected-file boundaries. The independent PostgreSQL
fixture executes the actual maintenance SQL, rejects nonempty initial targets
and any previously activated authority, and confirms source rows survive a
rejected transition. No test contacts a payment provider or modifies live data.
