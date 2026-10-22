# Server read performance — October 22, 2026

Implementation: `codex/server-read-performance`. Deployment is separate and requires
an authorized backend installation; merging does not mean this code is live.

The supported release uses local PostgreSQL and `core-expansion-v1`. This update
changes neither the world catalog nor archived generations, game rules, HTTP
contracts, authentication, pool sizes, admission/rate limits or polling frequency.

## Changes

- Store and transaction `getAll` issue one SQL statement on the proper connection,
  preserving input order, duplicates, missing snapshots, timestamps, the 1,000-ref
  bound, reference validation and read-before-write rules. Serializable isolation,
  retries, operation receipts and worker transaction guards remain intact.
- The production map reader selects only encoded fields required by public map
  presentation and fresh permission checks. Own garrisons use a separate fresh,
  projected read inside the existing read-only transaction. Explicit null values
  retain their encoding; no source document is added to a public response/cache.
- Unchanged public DTOs and route geometry reuse bounded section entries. Cache
  identity includes the stored document version, cosmetic skin and clock-driven
  shield state. Fresh scope and access checks precede reuse. Ownership dependencies
  and exact own counts remain fresh; the shared public cache stays at 750 ms.
- Cancelled area requests stop before starting a queued transaction or issuing
  subsequent private reads. An already-running shared public load finishes for
  other viewers. Cancelled viewers do not publish a cursor. Existing SQL deadlines
  and HTTP admission accounting remain the outer bounds.

## Validation and measurements

`test-local-postgres-world-read-performance.js` compares the actual production
reader's DTOs with the branch base against a disposable PostgreSQL fixture. It
covers cosmetics, shield repair/expiry, NPC defeat/respawn identity, capture,
fresh own troops, realm revocation and cancelled shared loads. The fixture includes
large unrelated private fields to verify SQL projection: 2,247,316 bytes became
1,089,656 bytes for that read (51.5% less). This is fixture transfer volume, not a
production bandwidth claim. Unchanged rows reused 7,710 DTOs in the test sequence.

The Store integration checks one-statement batching, empty/invalid/oversized
batches, snapshot independence, order/duplicates/missing records, concurrent
receipts and rollback. Selected game, authorization, transaction retry and worker
checks exercise affected shared dependencies. Firestore emulator checks cover
shared command semantics; PostgreSQL integration is the adapter authority.

The combined world/commands/chat load test accepts
`CROWNLANDS_WORLD_LOAD_PLAYERS=24`, `50` or `100` (default 24). Every actor settles
before teardown, and failed overload runs still produce a sanitized report.
The request retry/admission policy is unchanged; a failed 100-player run is a
capacity finding, not permission to increase concurrency. Results belong under
`release-artifacts/continuous-production/shared-load[-50|-100].json`.

Required PR checks, isolated 24/50/100 comparisons and release verification are
recorded in the delivery report. A browser FPS improvement and a synthetic load
result do not establish full multiplayer capacity.

## Compatible rollout

No database schema/index migration or player-data rewrite is required. Existing
clients and accepted journeys keep their current contract and timing. Prepare the
reviewed runtime package, complete installation preflight, then obtain applicable
backend installation approval. The automatic publisher's runtime fingerprint hold
must remain active until the installed game/worker code matches. Verify installed
identity, services, health and matching published build after installation. No
additional database backup is part of this change.
