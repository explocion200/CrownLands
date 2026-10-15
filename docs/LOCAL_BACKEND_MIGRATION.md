# Local backend migration

Status: discovery and local database preparation, October 15, 2026. The live game still uses Firebase. This document describes the migration work; it does not establish feature parity or authorize a production cutover.

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
| Chat translation | Google Cloud Translation via cloud credentials | Separate dependency decision: retain the service initially or evaluate a local translator against existing quality/latency requirements |
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

This initial database is not attached to the game and has no player import. Before deploying the application, use separate migration-owner and runtime roles, minimum privileges, a managed service identity, tested restart behavior and monitored backups. The operator role is for rehearsal, not a future web-server credential.

A filesystem copy of a running PostgreSQL data directory is not a sufficient database backup. Produce consistent dumps or use PostgreSQL's supported physical-backup mechanism. Include roles/configuration and recovery keys, and demonstrate a restore before storing authoritative player state locally.

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
- Stripe dashboard access will be needed when registering/testing the replacement purchase webhooks. Existing secret names identify the credentials to transfer privately; never put their values in source control or transcripts.
- Choose a transactional email provider or an existing suitable SMTP service for verification and password-reset delivery. Any sender-domain verification uses Name.com DNS. Do not add a paid plan before pricing is reviewed with the owner.

## References

- [Firebase Auth export and hash parameters](https://firebase.google.com/docs/cli/auth). Exported hashes are not plaintext passwords, and password portability requires the matching algorithm and parameters.
- [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite). The emulators are development tools, not the production self-hosted replacement.
- [PostgreSQL connection settings](https://www.postgresql.org/docs/18/runtime-config-connection.html). An empty `listen_addresses` restricts connections to Unix sockets.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html). Transaction retry and consistency must be explicitly implemented and tested.
