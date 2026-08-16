# Crownlands Map Scaling Phase 7

Phase 7 is a development-only production-integration architecture prototype. It proves how an approved Phase 6F generated region can move from allocation through immutable publication and explicit activation without changing the current production world.

The implementation and all receipts are under `tools/map-scaling-phase-7/` and `benchmark-results/map/phase-7/`. They are excluded from the production client artifact.

Locked inputs:

- approved Phase 6F commit base: `6885437d5bcf8856b3528cbdca139a48f47ae861`
- reusable art assets: 118
- asset-manifest SHA-256: `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`
- map: 1448×1086 WebP
- thumbnail: 320×240 WebP
- cities: exactly 40
- starting candidates: exactly four
- minimum city spacing: 112 px
- new-player threshold: authoritative current NPC count at least 15

Phase 7 does not deploy, publish to Firebase, activate a real region, change the 15 handcrafted maps, or begin Phase 8.

Documents:

- `ARCHITECTURE.md` — production integration boundaries and data flow
- `LIFECYCLE.md` — state machine and authoritative transitions
- `PACKAGE_STORAGE.md` — immutable package schema and paths
- `PUBLICATION_AND_ACTIVATION.md` — staged publication and separate activation
- `EDGE_CONTRACTS.md` — later-neighbor inheritance and runtime OPEN/GATED state
- `WORLD_EXPANSION_WORKER.md` — worker and controller responsibilities
- `STANDBY_BUFFER.md` — buffer-size evaluation and recommendation
- `CONCURRENCY_AND_RECOVERY.md` — collision, fault, retry, and restart behavior
- `ADMIN_SECURITY_OBSERVABILITY.md` — authorization and operational contract
- `CURRENT_WORLD_ADAPTER.md` — coexistence with the current handcrafted world
- `PERFORMANCE_AND_STORAGE.md` — measured integration and road-cache results
- `PHASE_8_READINESS.md` — recommendation and remaining work
- `VALIDATION_RESULTS.md` — authoritative validation ledger
