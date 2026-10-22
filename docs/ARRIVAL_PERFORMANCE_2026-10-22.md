# Arrival performance — October 22, 2026

Implementation branch: `codex/arrival-performance`. Not verified deployed.
This follows the separate batched-read/map-reader update and requires a compatible,
explicitly authorized local backend installation. No schema/data migration or new
backup is required; the publisher compatibility hold must not be bypassed.

## Scope

The current local PostgreSQL backend and Core continuous-world routes remain
authoritative. This change preserves accepted route geometry, timing, combat,
rewards, retries, receipts, authorization, season fences and worker lease guards.
It does not change scheduler frequency, arrival concurrency, database isolation,
request limits or active/archived world topology.

- Independent arrival candidate, source/target, rally-assembly and participant
  profile/stat reads use existing `getAll` batches.
- A transaction attempt reuses at most 1,000 direct document read promises under
  SERIALIZABLE isolation. Queries are never cached, READ COMMITTED reads are not
  cached, and read-before-write validation still runs for a cached key. A retry
  creates a fresh cache. Snapshot `data()` returns independent decoded values.
- Diagnostics separately count document read statements/rows, database transaction
  attempts, serialization failures, deadlocks, actual adapter retries and document
  cache hits. Read, connection wait, commit and retry-backoff durations supplement
  existing request phases. Counters are bounded and accept only fixed names and
  numeric values; no SQL, account/order identity or payload is recorded.
- Scheduled arrivals get isolated timing contexts. Only arrivals taking at least
  500 ms and unexpected failures add a sanitized timing record. Fast successes
  and expected skips do not add per-arrival logs. Existing job behavior is intact.

`documentReads` in the older phase timing is a duration in milliseconds, not a
count of documents. `transactionAttempts` can include multiple normal game
transactions in one request, so it is not a serialization retry count.

## Validation

A preliminary actual-command probe found 133 repeated document requests among
2,232 document requests over 108 arrival calls, including duplicate RPCs and
rally-return cases. These are synthetic fixture counts, not production averages.

Targeted checks cover cache bounds and same-snapshot behavior; query execution;
retry freshness and exactly-once receipts; genuine PostgreSQL serialization
failures/deadlocks; lost-lease/business-error refusal; scheduler result parity and
sanitized concurrent diagnostics. Actual continuous-world command tests cover
attacks, scouts, reinforcements, recalls, accepted old/new routes, process restart,
duplicate arrivals, rally rejoin/cancellation and captured-origin return cases.

Timing and query-count comparisons, required GitHub checks and exact deployment
identity are reported separately at delivery. Microbenchmarks and controlled
client loads must not be presented as demonstrated production capacity.
