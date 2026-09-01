# Monthly shared realm

## Scheduled September activation

The one-shared-realm Core-expansion reset is armed for `2026-09-02T00:00:00Z`. Before that boundary, production continues to serve the July 2026 legacy generation and its existing island paths. The armed release uses `realmMode: monthly-shared`, `worldTopology: core-expansion-v1`, and `resetActivationHeld: false`.

At the boundary, activation must seed and verify all 25 permanent Core maps plus the first north-center New Lands map before `realmConfig/current` publishes the new generation. The previous generation is retained for pointer rollback. If the release gate is no longer green before the boundary, deploy a separately tested hold release instead of editing production data or the pointer manually.

## Target monthly shared model

After the hold is lifted through a separately tested and authorized release, the server will derive the active realm from UTC time:

- generation: `realm-YYYY-MM`
- world: `main-realm-YYYY-MM`
- shared realm storage partition: `shard_0001`
- dynamic starting-city capacity: 20 threshold-managed placements per generated New Lands map
- island: `world--shard--region`

Every player in a monthly generation is assigned to the same shared realm and can interact with every other current-generation player. `shard_0001` remains in document paths only as the canonical generation partition, preserving existing query and rules isolation without splitting the player population. The 25-map Core is never a starting-location pool. New and returning accounts without current-generation progression receive one server-authoritative city on an admitting New Lands map; retries reuse the same assignment.

Each New Lands map begins with 40 neutral regular cities. When an admitting map reaches 20 remaining neutral cities, it closes to new placement and the next two maps are prepared, verified, and activated together in clockwise order. Every outward layer begins at its north-center cardinal entrance, and the client discovers activated maps from the authoritative expansion-state subscription without a redeploy.

Existing players without `realmShardId` are treated as `legacy`. Never rename or migrate their island documents in place.

## Rollover after the hold is lifted

`activateMonthlyRealm` runs at `00:00 UTC` daily and derives the configured active generation. Before the armed boundary it retains the legacy identity. At or after the boundary, the scheduler and authenticated `getRealmInfo` use the same idempotent readiness and pointer-reconciliation path, so the first login can repair a missed scheduler run. Neither path deletes the prior generation.

The browser never calculates the active month. It calls `getRealmInfo`, adopts the server generation and canonical realm partition, then sends those values on every callable request. Firestore rules read `realmConfig/current` and the signed-in player's server-owned `realmShardId`.

## Deployment order

1. Deploy Firestore indexes and wait until they report ready.
2. Deploy Firestore rules and Functions.
3. Publish the client carrying the matching release ID and contract hash.
4. Sign in with a test account and confirm `getRealmInfo` returns the expected legacy or monthly identity.
5. Run `node tools/validate-realm-sharding.js` and the emulator gates before production promotion. The historical validator filename is retained, but it now rejects population sharding.

During the pre-September rollout, the matching client and server release must be published together while the legacy generation and island paths remain active. At the UTC boundary, clients refresh their identity through the server handshake.

## Verification

Check these documents after a test claim:

- `realmConfig/current` has `mode: monthly-shared`, `sharedRealmId: shard_0001`, the expected month, start/end timestamps, starting-city capacity, generation, and world.
- `realmGenerations/{generation}/expansion/current` contains the active and admitting New Lands IDs, the next activation ordinal, and no unresolved activation lease.
- Every `realmGenerations/{generation}/assignments/{uid}` is `claimed`, contains the player's city, and uses `shard_0001`.
- `realmGenerations/{generation}/shards/shard_0001` is the only active partition and its assignment count matches the generation count.
- `players/{uid}`, the main city, island, armies, leaderboard row, and clan data carry the same `realmShardId`.
- `gameServers/{server-generation}` contains bounded metadata; active players live in individual `members` documents and `waitingCount` remains zero.
- Core maps have no starting assignments, admitting maps never fall below the 20-neutral-city floor, and a threshold event activates exactly two connected maps once.

The deterministic validation creates 150 logical assignments and must report all 150 in `shard_0001`. The scale emulator separately joins and heartbeats 150 concurrent players without a waiting room.

## Recovery and override

If the monthly scheduler misses its run, invoke the admin-only `reconcileRealmConfig` callable or sign in and call `getRealmInfo`. Both are safe to repeat.

If the configured activation must be postponed before any monthly assignment exists, change `monthlyResetStartsAt` in `functions/release-config.json`, regenerate runtime data, update the release contract hash, and redeploy Functions, rules, and the client together. To keep legacy mode indefinitely, set `realmMode` to `legacy` in a new release.

After a player has received a monthly assignment, do not rename that generation, decrement `nextPlayerSequence`, or change `sharedRealmId`. Roll forward with a new release. Repair a single player by restoring their assignment document to `shard_0001` only after confirming their profile and main island use that same partition. Never create `shard_0002` to address capacity; add neutral starting-city inventory to the shared realm through a separately reviewed map expansion instead.

Do not delete prior generation data during rollover. Archive or expire it through a separately reviewed retention job only after backups and gameplay-retention requirements are satisfied.
