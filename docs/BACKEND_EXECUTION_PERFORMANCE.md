# Backend execution performance

Third ordered performance update, branch `codex/backend-execution-performance`.
Implementation and isolated tests do not establish a live installation.

- Warm area/options requests reuse the prepared terrain reader. The reader still
  loads current realm, profile and expansion together inside its own fresh read
  snapshot. Deployment fencing remains fresh. Catalog/command revisions and
  retired membership still reject stale clients. Existing 750 ms public-section
  coalescing and per-viewer troop authorization remain separate and unchanged.
- Document mutations and before/after journal entries use batches of at most 32
  rows. Existing ordered advisory locks, SERIALIZABLE callback transactions,
  preconditions, receipts and atomic commits remain. Blind batches retain their
  existing READ COMMITTED locking contract. No-op documents produce no journal
  entry. Chat notifications are coalesced per topic in the same commit.
- Change dispatch reads path/identity/nullness metadata first. Only actual job
  execution loads immutable source payloads. Job insertion is batched while
  dispatch marking and duplicate keys remain atomic; there is no high-ID cursor
  that could skip an earlier transaction committing late.
- An in-memory schedule-minute cache advances only after durable cursors commit
  and every schedule catches up. Restart/failure/long catch-up re-read the durable
  cursors. Worker concurrency, leases, timeouts and committed travel times remain.
- Historical complete/dead job totals use two transactionally maintained rows.
  Initial installation counts existing rows once under a short-timeout job-table
  lock, then installs a status trigger. Subsequent health checks query these rows
  and the indexed pending/running set. Rollbacks, requeues and deletes update the
  totals atomically. No completed history is scanned every five seconds.
- Arrival diagnostics include every scheduled outcome, including fast successes
  and skips. Fixed histogram buckets and counters aggregate since process start;
  only 32 recent numeric samples remain. Queue delay starts at the recorded arrival
  deadline; transaction retries/backoff, reads and writes are separate dimensions.
  Durations are capped at 1,000,000 ms; the last bucket includes that capped tail.
  Phase durations can overlap and must not be summed as exclusive wall time.
  No player/order identity, SQL, snapshots or raw error text is retained.

## Validation

Focused PostgreSQL checks cover batching across chunk boundaries, before/after
snapshots, journal failure rolling back documents and receipts, concurrent
idempotency, retries, worker leases/fencing, durable catch-up, historical counter
backfill/rollback/restart and metadata dispatch. Shared timing tests prove async
isolation and bounded all-outcome aggregation. The combined real-cookie workload
includes areas, general subscriptions, held chat, route previews and scouts at
25, 50 and 100 fictional players, counting attempts, failures and exhausted retries.
An isolated PostgreSQL repeat on this host (legacy full-watch responses, before
combining update 2) passed all three player counts:

| Players | Completed requests | Map 429 retries | Exhausted / failed | Command p95 | Map p95 / max, including retries |
|---|---|---|---|---|---|
| 25 | 390 | 1 | 0 / 0 | 99 ms | 72 ms / 10.1 s |
| 50 | 740 | 9 | 0 / 0 | 170 ms | 83 ms / 10.3 s |
| 100 | 1,440 | 47 | 0 / 0 | 195 ms | 10.1 s / 20.5 s |

The four-request world admission bound and two database-reader connections remain
unchanged. At 100 players, map overload delays are a material limitation even
though commands stayed responsive and all requests eventually succeeded. Retry
latency is included, not discarded from percentiles. This is a short synthetic
local workload, not internet latency or sustained production capacity. The final
combined protocol run and required PR checks remain pending before merge.

## Rollout

The current PostgreSQL runtime requires a coordinated, separately authorized
installation. The only new state is the compact internal job-status table/trigger;
no player record or archived world is rewritten. Bootstrap has a two-second lock
timeout and must fail safely if another operator holds the job table. The initial
historical count is a one-time migration cost; inspect installation timing. Use
the existing runtime fingerprint and publisher compatibility hold. Install the
backend, verify game/worker health and runtime identity, then publish its matching
client. This update does not delete history or compact database files.
