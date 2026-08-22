# PROD-READY-1 production-capable adapters

The adapter version is `crownlands-prod-ready-1-adapters-v1`. It is server/admin-only, candidate-bound, environment-bound, and control-bound. Production execution additionally requires a per-operation authorization token. Merely deploying the code cannot generate, migrate, place, publish, activate, or cut over anything.

## Generation

The generation adapter validates the exact Phase 7 deterministic immutable-package schema and content-addressed package-hash basis before it writes. It requires the `phase6f-road-geometry-decoupling-v1` algorithm, `phase6d-macro-variation-v1` asset library, locked 118-asset manifest, exactly 40 unique city definitions at 112 px minimum spacing, four valid starting candidates, a clockwise Layer 1+ allocation, four cardinal immutable edge contracts, a non-Core coordinate, and `productionActivated=false`.

The coordinate lock, compact package metadata, region record, 40 authoritative NPC city records, and 40 global city-ID locks are created atomically. Raster buffers and the immutable object package are not copied into Firestore. If an existing cardinal neighbor is `PUBLISHED` or `ACTIVE`, the later package must inherit the earlier package's source edge contract exactly. Layer 1 clockwise slots `2`, `8`, `14`, and `20` must carry the locked invisible, immutable Fortress reservation and clearance receipt; other Layer 1 slots reject an unexpected Fortress. Identical replay is harmless; conflicting packages, city IDs, coordinates, reservations, or inherited contracts reject before any write. The resulting lifecycle is only `STANDBY`; publication and activation remain separately authorized.

## Persistence migration

Players are read in document-ID order with deterministic cursors and pages capped at 500 (default 300). Only these values are written to the isolated season-migration namespace:

- Flag/customization;
- Clan ID, name, tag, and role;
- Common Gear schema, owned instances, equipped references, levels, acquisition/upgrade data, and duplicate/progression identity.

Bag consumables and all seasonal/world data are excluded. Every record receives before/after checksums. A page receipt makes replay idempotent; any checksum or cursor mismatch aborts.

Clan identity documents are migrated through a separate strict field allowlist. Clan member records are reconstructed from the already-migrated authoritative player `clanId`/`clanRole` values, cross-checked against the Clan leader, and written idempotently. This intentionally excludes stale denormalized source member documents instead of reviving phantom memberships.

## Starting-city placement

Placement is one Firestore transaction. It reads the ACTIVE player region, requested city, prior player placement, and authoritative current-generation NPC query before any write. It requires a non-Core 40-city player region and `currentNpcCityCount >= 15`. Placement at 15 is permitted and produces 14 with subsequent spawn eligibility false; the next new placement is rejected. Existing players, ownership, travel, and ACTIVE lifecycle are not changed by that threshold.

The player placement record makes replay idempotent, and concurrent assignment of the same starting city allows exactly one winner. Citadel, Greybanner, Aurum, Swiftgate, and Ironwatch remain forbidden as main-city regions.

## Validation result

The isolated Firestore emulator passed:

- deterministic STANDBY generation and replay;
- exact Phase 7 package hash/schema and locked generator/asset inputs;
- compact Firestore metadata with no raw raster/package buffers;
- atomic initialization of 40 NPC cities and 40 global city-ID locks;
- successful published-neighbor edge inheritance and rejection of an incorrect inherited contract;
- required Layer 1 Fortress reservations and missing-reservation rejection;
- conflicting duplicate and Core-coordinate rejection;
- 601 players in deterministic pages `300 / 300 / 1`;
- seven Clans and 400 authoritative member records, with idempotent replay and cross-record role checks;
- allowlist stripping, checksums, and page replay;
- exactly 40 cities and four candidates;
- placement at 15, rejection at 14;
- concurrent duplicate prevention;
- restricted main-city rejection.

RESET-2 continues to provide the 5,000-player pagination/capacity stress evidence. No production adapter was invoked.
