# Clan Tower troop accounting

The server maintained each player's `towerGarrisonTroops` when troops entered or left a Clan Tower, but omitted that counter from `createGlobalStatsSnapshot`. Arrival removed an army from the marching total without adding its stationed troops to army power. Each stationed troop therefore lost its normal two points of King Power; those underestimated stats propagated to player and clan rankings.

The correction includes personally attributed Tower troops in the canonical military total, army power, stationed power, stats and leaderboard projections. It preserves the existing King Power version 11 formula and adds no Tower building or wall bonus. The owner's profile troop count includes stationed Tower troops, reinforcements and reserved rally troops, so changing deployment does not hide owned troops. Public profiles retain their existing estimated troop ranges.

Tower counters are accepted only for the current Core topology, world, generation and shard. Tower movements use the same guarded counter when adding or subtracting troops. Client profile creation and updates cannot set the counter or its generation. Actual casualties still reduce power; movement, capture survivors, returns and rally reservations count each troop once.

## Release and existing players

Read-only verification on September 24, 2026 confirmed the production pointer in `crown-land-b15e0`: world `main-realm-2026-09`, generation `realm-2026-09`, shared shard `shard_0001`. Runtime configuration selects Core expansion. No production player records were changed during this fix.

Deploy the server and Firestore rules before the web client. The normal authoritative economy refresh recalculates affected player power with the corrected formula; its existing stats trigger updates clan member and clan leaderboard totals. For immediate correction of saved/offline player scores, an authorized release operator should enumerate only current-world/current-generation/current-shard profiles with current Tower garrisons and run the existing per-player authoritative stats rebuild under that realm context. Recheck the current pointer before doing so. Do not add troops, grant compensating power, modify archived profiles, or use the unscoped first-page bulk recalculation as a migration.

Focused regression coverage reproduces the original 400-troop / 800-power drop, checks count conservation and realm guards, tests actual Tower capture, withdrawal, reinforcement, retries, rally reservations, defense and clan departure in the emulator, blocks forged profile counters, and verifies displayed totals on desktop and landscape mobile. This document does not claim deployment.
