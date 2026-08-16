# Phase 8 readiness

## Decision

Phase 7 supports proceeding to a separate production rollout and migration planning phase after review. It does not authorize deployment or activation.

The architecture gates passed for deterministic package creation, immutable versioned storage, staged atomic publication, separate atomic activation, edge-contract inheritance, GATED→OPEN without rebake, authoritative spawn threshold, idempotency, collision rejection, recovery, lazy loading, current-world coexistence, and a 128-region multi-layer simulation.

## Remaining work for Phase 8 planning

- choose concrete Firebase collections, transaction boundaries, indexes, and Security Rules
- choose object-storage retention, orphan cleanup, backups, and lifecycle policies
- define worker queue, leases, timeouts, retry budgets, and operational ownership
- define admin authentication, approval audit log, two-person controls if desired, and break-glass policy
- validate staging with real Firebase emulators and storage emulator wiring rather than the in-memory reference store
- define canary publication/activation, monitoring, rollback, and incident procedures
- define cost budgets and alarms for storage, egress, functions, and Firestore
- define current-world migration sequencing without changing the handcrafted 15-map topology
- retain package generator binaries/configuration by version for long-term reproducibility

Phase 8 must not silently regenerate published maps, treat PUBLISHED as ACTIVE, or move spawn eligibility into static map metadata.

## Locked conclusion

The 118-asset library remains sufficient. No new foundation, perimeter, road, or accent art is justified by Phase 7. Published package immutability and existing-edge-wins inheritance remain mandatory.
