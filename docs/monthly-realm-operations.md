# Monthly shared realm

## Production reset hold

The September reset is paused until the Pending Core 5x5 world and expanding northern New Lands are implemented, validated, and explicitly approved for release. Production is configured with `realmMode: legacy`, so crossing `2026-09-01T00:00:00Z` does not change the active generation or world. The July 2026 realm and its existing island document paths remain active.

Do not restore `monthly-shared` mode merely to meet the former September boundary. The corrected reset release must include the approved 25-map Core, the northward expansion topology, server-authoritative capacity transitions, and complete migration and rollback gates.

## Target monthly shared model

After the hold is lifted through a separately tested and authorized release, the server will derive the active realm from UTC time:

- generation: `realm-YYYY-MM`
- world: `main-realm-YYYY-MM`
- shared realm storage partition: `shard_0001`
- physical starting-city capacity: 363 kingdoms across the five current starter islands
- island: `world--shard--region`

Every player in a monthly generation is assigned to the same shared realm and can interact with every other current-generation player. `shard_0001` remains in document paths only as the canonical generation partition, preserving existing query and rules isolation without splitting the player population. A single Firestore transaction gives each new monthly player a permanent sequence in that partition; retries reuse the assignment. The five starter islands (`region_11` through `region_15`) are seeded lazily and provide 363 neutral regular cities in the current layout. When those cities are exhausted, claiming fails explicitly instead of opening another realm.

Existing players without `realmShardId` are treated as `legacy`. Never rename or migrate their island documents in place.

## Rollover after the hold is lifted

`activateMonthlyRealm` runs at `00:00 UTC` on the first day of each month. While `realmMode` is `legacy`, it keeps the current legacy identity and cannot activate a monthly generation. After an approved release restores monthly mode, it only reconciles `realmConfig/current`; it does not delete the prior generation or pre-create every island. `getRealmInfo` performs the same idempotent reconciliation, so the first login repairs a missed scheduler run.

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
- `realmGenerations/{generation}` increments `nextPlayerSequence` once per new assignment.
- Every `realmGenerations/{generation}/assignments/{uid}` is `claimed`, contains the player's city, and uses `shard_0001`.
- `realmGenerations/{generation}/shards/shard_0001` is the only active partition and its assignment count matches the generation count.
- `players/{uid}`, the main city, island, armies, leaderboard row, and clan data carry the same `realmShardId`.
- `gameServers/{server-generation}` contains bounded metadata; active players live in individual `members` documents and `waitingCount` remains zero.

The deterministic validation creates 150 logical assignments and must report all 150 in `shard_0001`. The scale emulator separately joins and heartbeats 150 concurrent players without a waiting room.

## Recovery and override

If the monthly scheduler misses its run, invoke the admin-only `reconcileRealmConfig` callable or sign in and call `getRealmInfo`. Both are safe to repeat.

If the configured activation must be postponed before any monthly assignment exists, change `monthlyResetStartsAt` in `functions/release-config.json`, regenerate runtime data, update the release contract hash, and redeploy Functions, rules, and the client together. To keep legacy mode indefinitely, set `realmMode` to `legacy` in a new release.

After a player has received a monthly assignment, do not rename that generation, decrement `nextPlayerSequence`, or change `sharedRealmId`. Roll forward with a new release. Repair a single player by restoring their assignment document to `shard_0001` only after confirming their profile and main island use that same partition. Never create `shard_0002` to address capacity; add neutral starting-city inventory to the shared realm through a separately reviewed map expansion instead.

Do not delete prior generation data during rollover. Archive or expire it through a separately reviewed retention job only after backups and gameplay-retention requirements are satisfied.
