# Monthly sharded realms

## Live model

Crownlands keeps the July 2026 realm and its existing island document paths unchanged until the configured activation time. Starting at `2026-09-01T00:00:00Z`, the server derives the active realm from UTC time:

- generation: `realm-YYYY-MM`
- world: `main-realm-YYYY-MM`
- shard: `shard_0001`, `shard_0002`, and so on
- shard capacity: 50 kingdom assignments
- island: `world--shard--region`

The 50-player value is a placement limit, not a global online limit. Every authenticated join is active. A single Firestore transaction gives a new monthly player a permanent sequence and shard; retries reuse the assignment. Player 51 opens `shard_0002`, player 101 opens `shard_0003`, and islands are seeded lazily when the first kingdom in that shard claims a city.

Existing players without `realmShardId` are treated as `legacy`. Never rename or migrate their island documents in place.

## Rollover

`activateMonthlyRealm` runs at `00:00 UTC` on the first day of each month. It only reconciles `realmConfig/current`; it does not delete the prior generation or pre-create every island. `getRealmInfo` performs the same idempotent reconciliation, so the first login repairs a missed scheduler run.

The browser never calculates the active month. It calls `getRealmInfo`, adopts the server generation and shard, then sends those values on every callable request. Firestore rules read `realmConfig/current` and the signed-in player's server-owned `realmShardId`.

## Deployment order

1. Deploy Firestore indexes and wait until they report ready.
2. Deploy Firestore rules and Functions.
3. Publish the client carrying the matching release ID and contract hash.
4. Sign in with a test account and confirm `getRealmInfo` returns the expected legacy or monthly identity.
5. Run `node tools/validate-realm-sharding.js` and the emulator gates before production promotion.

During the pre-September rollout, the new release ID changes but the legacy generation and island paths remain active. At the UTC boundary, clients refresh their identity through the server handshake.

## Verification

Check these documents after a test claim:

- `realmConfig/current` has the expected month, start/end timestamps, capacity, generation, and world.
- `realmGenerations/{generation}` increments `nextPlayerSequence` once per new assignment.
- `realmGenerations/{generation}/assignments/{uid}` is `claimed` and contains the player's shard and city.
- `realmGenerations/{generation}/shards/{shard}` never exceeds 50 assignments.
- `players/{uid}`, the main city, island, armies, leaderboard row, and clan data carry the same `realmShardId`.
- `gameServers/{server-generation}` contains bounded metadata; active players live in individual `members` documents and `waitingCount` remains zero.

The deterministic validation creates 120 logical assignments and must report `50/50/20` across three shards.

## Recovery and override

If the monthly scheduler misses its run, invoke the admin-only `reconcileRealmConfig` callable or sign in and call `getRealmInfo`. Both are safe to repeat.

If the configured activation must be postponed before any monthly assignment exists, change `monthlyResetStartsAt` in `functions/release-config.json`, regenerate runtime data, update the release contract hash, and redeploy Functions, rules, and the client together. To keep legacy mode indefinitely, set `realmMode` to `legacy` in a new release.

After a player has received a monthly assignment, do not rename that generation, change its capacity, decrement `nextPlayerSequence`, or reuse its shard IDs. Roll forward with a new release. Repair a single player by restoring their assignment document to the shard already recorded on their profile and main island.

Do not delete prior generation data during rollover. Archive or expire it through a separately reviewed retention job only after backups and gameplay-retention requirements are satisfied.
