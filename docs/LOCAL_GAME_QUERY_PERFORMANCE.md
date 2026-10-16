# Local army query performance

## Diagnosis — October 16, 2026

Read-only production evidence after the worker connection repair found an army
query inside `prepareEconomyCollection` scanning 90,617 root army documents to
return zero matching active armies. `EXPLAIN (ANALYZE, BUFFERS)` measured 668.948
ms and 343,627 shared block accesses. The sampled owned-city and held-camp queries
already used their owner indexes (9.530 ms and 0.101 ms respectively).

The recent 30-minute application sample contained 17 troop sends (median 879 ms,
maximum 1,687 ms), 46 army resolutions (maximum 29,051 ms, with 18 transaction
attempts on that request), and 115 economy collections (median 1,886 ms). These
are observed samples, not latency guarantees or controlled before/after results.
Repeated scans lengthen serializable transactions and their conflict windows.
The long-lived services were healthy; keeping another instance warm does not
remove this database work.

The verified live realm was `main-realm-2026-10 / realm-2026-10 / shard_0001`.
Private diagnostic receipts are in the operator's
`~/.local/share/crownlands/query-performance-20261016` directory. They exclude
query literals, player identifiers and document contents.

## Change

`tools/local-postgres-army-indexes.js` installs two nonunique B-tree indexes on
canonical root army documents:

- `armies_owner_status_v1`: typed owner, status, world, generation and shard keys
  for active armies used by economy preparation, sends and arrivals.
- `armies_due_v1`: typed status, world, generation and arrival keys followed by
  the existing bytewise document-path order, for scheduled arrival scans and
  their cursor pagination.

The expressions exactly match `Store.compile`. The partial predicate excludes
island projection documents. World/generation/shard filtering remains in the
existing queries; the indexes also support future active realms. They do not
rewrite historical documents or change army travel, troop accounting, query
results, serializable isolation, retry limits or game rules. Runtime code and
the public client are unchanged.

The synthetic PostgreSQL fixture supplies 90,000 historical armies, 1,000 active
armies for unrelated owners, multiple realms/shards, projections, tied and
fractional arrival times. It checks index selection and block-read reduction,
unchanged result ordering and cursors, concurrent exact-once launch debits,
arrival status updates, repeat installation and wrong-index rejection.

## Operator rollout

This is an explicit database maintenance operation. A merge or static deployment
does **not** install these indexes. Obtain owner authorization before applying.
Run using the reviewed checkout, its Node 22 runtime and the database owner's
local PostgreSQL identity. No passwords or connection strings belong in a log.

```sh
node tools/local-postgres-army-indexes.js
node tools/local-postgres-army-indexes.js --apply EXPECTED_ACTIVE_EPOCH
```

The first command only inspects. The second checks the active authority epoch,
builds missing indexes one at a time with `CREATE INDEX CONCURRENTLY`, refreshes
planner statistics and verifies their exact definitions and validity. Existing
wrong or invalid indexes stop installation rather than being silently accepted
or removed. A session advisory lock prevents overlapping installer runs.
Statement and lock waits are bounded. The operator needs database-owner access;
the restricted game service receives no new privileges.

Concurrent builds allow game writes to continue but temporarily consume CPU and
disk bandwidth. A failed concurrent build can leave an invalid index, requiring
inspection and explicit cleanup before retrying. See PostgreSQL's
[concurrent index documentation](https://www.postgresql.org/docs/18/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY).

After installation, repeat the same read-only query plans and compare application
request durations, transaction attempts, worker backlog and service health. Run
the existing encrypted backup so the database dump includes the index definitions.
Do not generate production attacks to benchmark, reopen Firebase, or sign into
the owner's game session merely to test latency. If a rollback is needed, drop
only these two named indexes concurrently after verifying their definitions;
player data and runtime remain intact.
