# Phase 4 readiness

Phase 3 supplies catalog schema, permanent-core reservations, deterministic rings, reciprocal edges, no-spawn authority, lazy loading, bounded caches, fixtures, and reset boundaries. It does not activate new world content.

Before real outer-layer allocation:

- approve the activation trigger/capacity policy and catalog lifecycle transaction;
- choose the production starting anchor if north-west should change;
- require complete-ring sequencing and concurrency/idempotency controls;
- create and approve real region IDs, names, map art, thumbnails, definitions, and final Gate art;
- validate server/client catalog publication atomically.

Before city auto-population:

- design obstacle-aware deterministic coordinate placement and minimum separation;
- define neutral-city levels/troops/capacity mix;
- require at least 15 valid NPC cities before `spawnReady`;
- add route/connectivity, collision, rollback, and repeated-run fixtures;
- keep objective placement manual and outside this generator.

Before the full reset migration:

- version the persistent payload and dry-run extraction;
- preserve Flag, validate/reconcile clan membership, and restore Common Gear;
- change the current fresh-profile path, which presently resets Gear and omits clan fields;
- explicitly exclude/wipe consumables and all world/objective/march state;
- build and validate all 25 real core maps before placement;
- add backups, resumable idempotent jobs, per-player receipts, reconciliation, and rollback;
- test returning/new player placement only in spawn-ready player regions.

Recommended Phase 4 scope is an offline, development-only outer-layer allocator and NPC-city placement prototype with deterministic fixtures and no production activation. Server reset migration should remain a separately reviewed phase.
