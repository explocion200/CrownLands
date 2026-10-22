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
- A transaction attempt reuses at most 128 direct document read promises under
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
  and fast expected skips do not add per-arrival logs. Existing job behavior is intact.
- The permanent worker's existing privacy filter retains the last 32 sanitized
  arrival samples in its private `handlerLogs.arrivalTimings` status. It accepts
  only fixed operations/outcomes and bounded numeric phases/counters, never raw
  handler output, identifiers, arbitrary keys or logged getters. Samples reset
  on worker restart and are not exposed in public responses.

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

The actual command scenarios were also measured with deterministic fictional
player IDs and starting-city/flag rolls, keeping route lengths comparable while
retaining random isolated schema names. A test-only observer counted actual
PostgreSQL document SELECT statements; it did not change transaction isolation or
outcomes. All three versions passed the same 216-call scenario assertions.

| Operation | Calls | Original queries | Batched-reader queries | Arrival-update queries |
|---|---:|---:|---:|---:|
| Resolve army | 108 | 2,453 | 2,373 | 1,655 |
| Send army | 20 | 325 | 315 | 313 |
| Join rally | 22 | 572 | 550 | 485 |
| Launch rally | 2 | 96 | 87 | 81 |

The 108 arrival calls used 244 transaction attempts in every version, including
normal multi-transaction work and deliberate duplicate arrivals. Arrival document
SELECTs fell 30.3% versus the batched-reader update, or 32.5% versus the original
code. This measures fixture database work, not a guaranteed latency improvement.
An initial comparison with random starting cities was discarded because its route
lengths differed. Sanitized measurements and the test-only observer are retained
under `release-artifacts/arrival-performance/`.

Integration checks additionally cover concurrent batch/direct reads, a 1,000-ref
batch exceeding the 128-entry retained cache, input order/duplicates/missing
documents, invalid batches without partial SQL and fresh READ COMMITTED batches.
Required GitHub checks and exact deployment identity are reported separately at
delivery. Controlled client loads do not establish production capacity.
