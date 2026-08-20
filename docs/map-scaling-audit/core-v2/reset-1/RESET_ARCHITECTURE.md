# RESET-1 architecture

RESET-1 uses versioned worlds and seasons. It never deletes or overwrites the active season before the replacement is complete.

The locked order is:

1. `PREPARING`: freeze the reset input, capture player before-snapshots, verify the production baseline read-only, and create a unique operation ID.
2. `INITIALIZING`: build the new season under a separate world/season path. Initialize the complete 25-map Core, all 1,480 Core cities, objectives and Tower reservations. Add only the ACTIVE outer capacity required for the reset population plus two immutable STANDBY packages.
3. `VALIDATING`: validate capacity, IDs, topology, objective placement, packages, authoritative spawn eligibility, persistence payloads and security policy. Migrate players into new outer starting cities.
4. `READY`: seal the validation receipt. No player can enter before this state.
5. Atomically change the active-season pointer.
6. Mark the prior season `RETIRED`/`ARCHIVED` and read-only. Retain it for audit and rollback.

The rehearsal uses `crownlands_world_2026_summer/season_2026_summer` as the synthetic old season and `crownlands_world_2026_september/season_2026_september` as the synthetic replacement. Published outer-region package hashes and the approved asset-manifest hash remain immutable. Ownership, OPEN/GATED state and the active-season pointer remain mutable runtime records outside package hashes.

The sizing model permits 26 new-player placements per fresh 40-city player region: a placement is allowed when the authoritative transaction observes 15 NPC cities and leaves 14. The next placement in that region is rejected. ACTIVE capacity is `ceil(expected reset population / 26)`; the recommended STANDBY buffer remains two.

Production project `crown-land-b15e0` is never a reset target in RESET-1. The executable rehearsal accepts only `crownlands-map-staging-2026` through the existing Phase 9 environment guard and explicit mutation confirmation.
