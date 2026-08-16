# Concurrency, failure, and recovery

## Enforced uniqueness

- One region ID maps to one coordinate.
- One coordinate maps to one region ID.
- One published region maps to one immutable package hash.
- City IDs are deterministic and globally unique in the simulated world.
- Publication and activation markers make duplicate jobs idempotent.

The test suite rejected a coordinate collision, a same-ID/different-coordinate collision, a different package publication, and an immutable file overwrite. Concurrent publication and activation each produced one transition and one idempotent response.

## Failure injection

- worker crash after map encoding: no stored or visible package
- crash after immutable upload: orphan content quarantined; no marker or visible region
- publication transaction failure: no catalog/topology/city commit
- package validator failure: no upload or publication
- activation transaction failure: remains PUBLISHED; zero city ownership records
- invalid 39-city package: rejected before STANDBY/publication visibility
- stale neighbor edge contract: rejected

## Recovery policy

- `ALLOCATED`: resume generation.
- `GENERATING` or `VALIDATING`: return to `ALLOCATED` and retry deterministically.
- `STANDBY`: retain validated package and await approval.
- `PUBLISHING` with marker: honor the marker and recover as `PUBLISHED`.
- `PUBLISHING` without marker: remove staged metadata and return to `STANDBY` or `ALLOCATED`.
- `PUBLISHED` and `ACTIVE`: never infer rollback or regenerate.

An unpublished versioned retry reuses the same coordinate, changes the retry salt, and produces a different immutable package hash. That operation is forbidden after publication.
