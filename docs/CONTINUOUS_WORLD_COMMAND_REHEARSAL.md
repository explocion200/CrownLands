# Private continuous-world command rehearsal

The proposed open-edge planner now runs through the real game command handlers in disposable PostgreSQL schemas with fictional players. This is development testing, not an installed game mode or an authorized production migration. The current release remains `core-expansion-v1`; a bounded read confirmed 112 active sections in `main-realm-2026-10--shard_0001` before implementation. Tests use an independently generated 112-section fixture and never copy player records.

## Authority and isolation

`tools/map-benchmark/seamless/command-routing.js` adapts the existing worker planner and spread display layout to the server's per-section game-coordinate format. The server still resolves actual source/target records, canonical endpoints, ownership, troops, bonuses, cooldowns, costs and arrival timestamps. Client-supplied paths or ETAs do not choose the accepted route. Every new segment carries `routingVersion: open-world-draft-v1` and a SHA-256 geometry identity. Section IDs remain part of every coordinate identity, including generated sections sharing an artwork template.

The optional capability can only be passed directly to `createPlatform` for a `migration_game_worldtest_<12 hex characters>` schema. Neither `fromEnvironment`, the permanent PostgreSQL adapter nor Firebase supplies it. There is no public endpoint or runtime switch. The planner, its assets and fixtures remain in development-only `tools/`. Normal deployments keep the current planner; this change only makes movement factories await route calculation and preserves optional saved geometry metadata.

Route work stays on worker threads, with four admitted requests per world and a 128-result cache. Up to two catalog versions are retained; inactive workers can be evicted. Busy, timed-out or budget-exhausted requests fail explicitly without falling back to a different geometry. Tests verify failed launches commit neither an army nor a troop deduction. Scout origins use the same eligibility and stable tie rules, with sequential private candidate searches; production's current optimized scout search remains unchanged.

## Transition contract

Old unversioned armies retain their original segments and accepted launch/arrival timestamps. Launch retries return that existing order even after the private provider is enabled. Already issued new-version armies likewise continue on their saved geometry after the provider is disabled. A Recall Horn reverses the traveled portion of the recorded route and retains its geometry identity. Returns that require a newly computed destination route use the currently selected policy. No test rewrites existing route geometry to the new layout.

This is a server persistence contract. The production renderer and the final rollout controls still need to support both coordinate/display policies deliberately; old castle endpoints can differ from the wider preview's displayed city centers. A geometry identity identifies a saved route, not a production archive/migration facility.

## Validation evidence

Run `node tools/test-local-postgres-world-commands.js` for real callable-handler tests. It creates and removes only its random worldtest schema. Coverage includes old/new activation and rollback, forged path/ETA rejection, unauthorized ownership, closest-source scouting, attacks, transfers, simultaneous player launches, allied reinforcement and stationed recall, intermediate-map projections, duplicate arrivals, worker failure rollback and Recall Horns. The shared three-player rally suite adds assembly, launch/cancellation races, repeated withdrawal/rejoin, captured origins and fourteen safe-return cases. The baseline rally suite also runs without the private provider. Generated starting sections are resolved through the current map factory in the expanded-world fixture.

GitHub's initial slower-runner test exposed a long route exhausting the unchanged 700 ms search budget. The draft planner now visits each crossed obstacle bucket once instead of repeatedly scanning neighboring buckets. An independent brute-force collision oracle checks 3,000 random segments plus exact bucket corners, axis-aligned paths, reverse directions and sub-pixel clearance boundaries. Existing routes and all 202 section joins are rechecked.

Run `node tools/validate-world-command-routing.js` for 32 longer current-layout journeys, projected endpoints, immutable/cache-stable geometry, catalog changes, eviction, overload and retry. Development measurements on the home computer were approximately 33 ms median / 155 ms p95 / 183 ms maximum for the draft route calls. An eight-request burst admitted four and returned retry errors for four; the admitted batch finished in about 195 ms. Event-loop delay during that worker-only burst was about 10.1 ms p95 at 10 ms sampling resolution. These short samples are not a multiplayer capacity promise. Old-planner comparison calculations and fixture initialization are excluded from the burst's event-loop measurement.

For those 32 longer journeys, distance changed from −10.3% to +4.6%, with a median of −2.6%. The earlier 765 travel-formula checks still cover troop bands, kinds and speed multipliers; short edge-to-edge journeys can change more than this longer-route sample. No speed, reward, troop cost or economy constant was adjusted. Results are written to ignored `release-artifacts/continuous-command-rehearsal/{commands,routing}.json` and can change with hardware/load.

The required review plan includes current-policy multiplayer emulator suites covering world travel, bulk orders, rallies, relinquishment, Towers, camps and Marauder combat because their shared route factories now await results. The existing Tower lifecycle fixture needed its missing location-share mount stub to execute that dependency check; no player-facing Tower UI was changed. No new browser interaction or artwork is introduced by this server-only rehearsal.

## Remaining gates before live use

- Review the travel-distance balance and confirm the intended speed policy. Keeping current speed constants is the tested proposal, not a promise that every journey becomes faster.
- Scout Nearby and Regroup now use the wider layout in the isolated gameplay pilot, including adjoining sections; current live rules remain unchanged. Placement/admission behavior and integration into the production client still need review.
- The command-aware private renderer has automated two-player coverage for old/new route labels, generated maps, departure/arrival anchors and failures/retries. The owner waived the hands-on player pilot on October 21; it was not run. Production UI integration remains separate. See [the gameplay pilot report](CONTINUOUS_WORLD_GAMEPLAY_PILOT.md).
- Bound and optimize worst-case scout candidate searches and transaction time under a larger representative command load. Four-request admission deliberately protects the private worker; the final production capacity/retry experience is still a release gate.
- Prepare an explicit, reviewed backend/client activation and rollback contract, including saved geometry availability, monitoring and package compatibility. Do not install or enable open routing just because this PR merges. No production data, services, client package, grants or backups were changed by the rehearsal.
