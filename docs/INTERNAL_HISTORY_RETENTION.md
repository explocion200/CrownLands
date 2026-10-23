# Seven-day internal debug history retention

Fourth approved performance update: `codex/internal-history-retention`.
The tool is implemented for the current PostgreSQL runtime. No live deletion or
file compaction is authorized by implementation, merging or installing this code.

## Scope and safeguards

`tools/maintain-internal-history.js` defaults to a **read-only dry run**. It never
writes the game `documents` table, accounts, personal reports, reward receipts,
gameplay event logs, public archives or archived-world records. Only internal
`changes` history and completed `work_jobs` debug payloads are maintenance targets.
Copies of old primary documents inside eligible debug history may be discarded;
the primary documents and their own retention rules remain untouched.

- A completed job is eligible only after its `finished_at` is older than seven
  days. Clear its event payload and old error code; retain its compact ID, unique
  job key, handler, kind, status, attempts and timestamps. Duplicate prevention
  remains intact. Missing completion timestamps are never eligible.
- A change requires both creation and dispatch to be older than seven days.
  Undispatched changes are preserved. Any reference from a pending, running or
  dead job protects its source; so does a completed job without a completion time
  or completed within the seven-day window. Handler payloads are never deleted
  before their dependent jobs finish.
- Each apply batch is SERIALIZABLE, contains at most 100 rows by default (200
  maximum), has a 250 ms lock timeout and a five-second statement timeout, and
  commits atomically. A blocked row stops the batch instead of skipping it and
  incorrectly advancing the checkpoint. Cancellation before commit rolls back
  even already-executed SQL. There is no hidden retry after an error.
- Stop on an unready/changed realm, missing/invalid indexes, an active job backlog
  over 1,000, timeout, serialization failure, cancellation or invalid checkpoint.
  Preserve the last successful checkpoint for operator review and resume.
- Dry-run batches default to 1,000 rows, with the same indexed boundaries and
  protected-source checks. Counters and stored-payload byte estimates accumulate
  in a local checkpoint. PostgreSQL timestamp precision is retained, including
  microseconds. Checkpoints bind schema, mode, realm and a fixed seven-day cutoff.
  A dry-run checkpoint cannot be reused for deletion. A fresh pass handles later
  eligibility; concurrent activity means estimates describe the scan, not a
  frozen whole-database inventory.

## Installation

An explicit `--prepare-indexes --confirm-schema <schema>` command prepares three
indexes concurrently, separately from worker startup: completed debug jobs by finish time/ID, processed
changes by dispatch time/ID, and job source-change references. Index creation has
short lock and bounded statement timeouts. Missing/invalid indexes cause the
maintenance tool to stop; a dry run never creates or repairs indexes. An interrupted
invalid index requires an explicit reviewed repair before cleanup. Runtime
installation remains subject to the publisher compatibility hold and separate
backend approval. Normal worker startup does not depend on these large history
indexes. No scheduled deletion job is enabled.

## Operator procedure

1. After separate live index-preparation approval, run `node tools/maintain-internal-history.js --prepare-indexes --confirm-schema migration_game_live`.
   Verify completion before maintenance. No worker restart is needed for this step.
2. Run `node tools/maintain-internal-history.js` for a default live-schema dry run.
   The default wall budget is 20 seconds/20 batches. It writes only an ignored,
   owner-readable local checkpoint under `release-artifacts/history-retention/`.
3. If incomplete, use `--resume <checkpoint>` with the same mode/schema until
   `complete: true`. Review eligible/protected rows and estimated bytes. The estimate
   covers stored payload bytes, not index overhead or guaranteed filesystem shrinkage.
4. Present the completed estimate and specific apply scope to the owner. **Request
   live cleanup permission before executing an apply run.**
5. After approval, start a separate checkpoint using `--apply --confirm-schema
   migration_game_live`. Resume that apply checkpoint with the same explicit flags.
   Review progress and service health between short runs; stop at the first error.

Use `--schema <isolated fixture schema>` for tests. `--max-batches` and `--seconds`
are bounded; neither increases the per-transaction limit. SIGINT/SIGTERM stops at
an atomic batch boundary. If a process dies after commit but before writing its
checkpoint, resume safely skips already compacted/deleted rows; progress may then
under-count prior work, so finish with a new dry run.

Deleting rows makes space reusable inside PostgreSQL. It does **not** immediately
shrink database files. VACUUM FULL, repacking and disruptive filesystem/storage
maintenance are separate reviewed operations and are not provided here.

## Validation and deployment status

Isolated PostgreSQL tests cover exact seven-day boundaries, microsecond cursors,
default CLI dry-run, resumed deletion, protected job references, primary/archive
preservation, compact unique identities, lock/backlog/realm/index checks and
cancellation both before and after a SQL mutation. Existing job and worker suites
cover unchanged dispatch, leases, restart/catch-up and installation initialization.
Required PR checks and production index installation are pending. No production
history has been deleted and no database compaction has been performed.
