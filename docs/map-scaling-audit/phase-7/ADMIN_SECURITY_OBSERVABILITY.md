# Admin, security, and observability

## Minimal admin contract

The Phase 7 contract intentionally avoids a large Studio redesign. An authorized map administrator can inspect the Core, outer rings, lifecycle, map preview, 40 cities, four starting candidates, blockers, roads, edge contracts, package hash, validation receipt, generator version, and asset-library version.

Explicit actions:

- generate an unpublished package
- reject an unpublished package
- retry an unpublished package with a versioned salt
- approve publication
- approve activation

Normal players cannot generate, publish, activate, rewrite packages, alter edge contracts or package hashes, choose coordinates, force OPEN topology, or bypass the authoritative NPC threshold. The emulator rejected an allocation attempted with a normal-player role.

## Observability

Structured events cover allocation, generation start/end, validation, publication start, immutable upload, hash verification, publication, activation, GATED→OPEN, simulated spawn claims, rejection/retry, and recovery.

Measured timing series cover generation, asset upload, hash verification, metadata publication, activation, catalog reads, definition fetches, and transitions. Failure code, lifecycle, outcome, and retry count are recorded.

No event contains user profile data, email, authentication token, player inventory, clan data, or raw player identifiers. The simulated claim logger stores only the region and event type; player tokens are one-way hashed before test ownership assignment and are never included in observability events.
