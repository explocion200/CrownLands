# Matching NPC attack reports — October 13, 2026

The authorized merge and coordinated deployment of [PR #548](https://github.com/explocion200/CrownLands/pull/548) is **LIVE — WEB AND FIREBASE**. Marauder and clan-boss attacks now use the ordinary parchment report window: fixed navigation, section shortcuts, forces, bonuses, Gear effects, rewards and rally results. Neutral defenders use NPC artwork and wall-free 1.00 defense. Actual encounters persist one private battle-time snapshot shared only with participating attackers. Each recipient retains their own credited loot, capped XP, recovery and level-up receipt. Unavailable targets and historical reports preserve recorded information without inventing battles or missing statistics. Combat, loot, stamina, paid refills, road placement, scouting, report retention and permissions are unchanged.

## Verified identity

| Item | Value |
|---|---|
| Feature branch / merged PR | `codex/marauder-matching-battle-reports`, #548 |
| Game build | `b372622f7a20ecf2a74e5854621f6bf579125e1b` |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `1ae77b11fe9c6b65c6ffb574c3010a93f76acf11b978b95c9d408859871b20a7` |
| Client source SHA-256 | `9efb853c2b83ce70df163c5c2f39c65f6d1271efbd64cb92829f2de8e93e8814` |
| Netlify deployment | `6ace5905f5efd8609987f114` |
| Web publication | October 13, 12:24 p.m. Eastern (`2026-10-13T16:24:11.914Z`) |
| Firebase project | `crown-land-b15e0` |
| World / generation / shard | `main-realm-2026-10` / `realm-2026-10` / `shard_0001` |
| Placement / combat / balance versions | 4 / 1 / 1 |
| Existing spawning/refill flag restored | `2026-10-13T16:25:09.101Z` |

The manual Netlify publication hold remains enabled. The [road respawn release](MARAUDER_ROAD_RESPAWN_RELEASE_2026-10-13.md) retains historical population-transition evidence.

## Validation and deployment

- `Static validation`, `Multiplayer emulator validation` and `Validate` passed for feature head `67faa8eb3a3b54633ef5fb29178c870cc92946fa` in [run 38426003624](https://github.com/explocion200/CrownLands/actions/runs/38426003624). `prepare-pr` passed the affected-test plan: seven selected static validators plus the marauder real-combat emulator in CI. Settlement coverage includes saved departure power, victories/defeats, each participant's private history, participant-only snapshot reads, replay immutability, no PvP credit and no scout/refund snapshots.
- Source and exact built modules passed 48 report browser cases: eight scenarios at 1440×900, 844×390 and 568×320 for each variant, including twenty-member rallies, historical/failed snapshots, unavailable targets, personal rewards, NPC artwork, keyboard focus, navigation and scrolling. Existing normal reports and hunt/refill drafts passed focused checks. Existing production formatting/local-name minification delivers the two report/NPC modules; all asset ceilings remain unchanged.
- Clean local `main` was synchronized after merge, equal to `origin/main` with divergence `0 0`. The full-commit-stamped production artifact passed validation: 1,158 files including inventory, 179 resources per entry, and 1,157 matching staged inventory entries. Twenty-one staged and 61 public comparisons passed, including changed report modules/styles and release identities across the primary game and retained compatibility hosts.
- Six staged and six public cold-load/reload cases passed at three sizes with isolated browser profiles, no runtime exceptions and no missing game assets. Another 24 isolated report cases passed using the exact published minified report/NPC scripts fetched from the primary domain. These used synthetic reports in the benchmark harness, not a player's production history. Desktop and smallest-landscape screenshots were inspected.
- All 149 Functions are ACTIVE on Node 22. The deployment encountered HTTP 429 mutation-rate limits, then completed built-in retries without a second deployment. All six deployed source-hash cohorts match the merged manifest and inspected runtime sources, including changed settlement code. Timestamp, source archive and state checks established completion independently of CLI status. The 29-callable access audit and unauthenticated realm/stamina/refill guards passed.
- Existing Firestore rules match SHA-256 `17f686a05f6f92676dc5ce93345cbe609b19c4754dd94461907304052dd58b0a`; both NPC indexes are READY. No rules/index changes were needed or deployed. Authenticated `getRealmInfo` verified the exact release/build, October identity and Core-expansion topology before publication and before restoring the flag. Temporary verification Auth accounts were deleted without creating player profiles or assignments.

## Population and observation

The existing October spawning/paid-refill flag was held at `2026-10-13T16:16:08.230Z` and restored after matching client/backend checks. Existing targets and committed marches remained valid. Verification performed no administrative population rewrite, player battle or purchase.

Read-only inspection at `2026-10-13T16:25:13.913Z` verified all 82 current maps: 25 Core and 57 active New Lands, including 28 closed-admission maps. There were 25 bosses and 114 solos, with no wrong-territory enemies, cap/slot/level violations, spacing violations or blocked slots. All 62 policy-4 road spawns passed road, inset, clearance and route checks. All 77 retained legacy targets matched this release's paused baseline identities and positions. Map activation advanced normally from the previous 81-map snapshot.

Initial bounded monitoring through `2026-10-13T16:25:16.992Z` inspected 14 service-log entries and found zero HTTP server errors and zero error-severity entries. The battle sample was truncated at 101 records and found no new sampled settlement; the refill sample found no new purchase. These samples do not prove the absence of other battles or establish long-term economy, availability, traffic or billing behavior.

Live signed-in report delivery/new encounter settlement, refill/refund transactions, existing-profile navigation, installed apps/physical devices and long-term economy/backend-cost monitoring remain verification limits. No continuing monitor was scheduled. Sanitized receipts/screenshots remain under ignored `release-artifacts/marauders/report-deployment/`.

Web and Firebase are verified at the runtime build above. itch.io was not republished and needs separately authorized matching publication. This release-record follow-up changes documentation only and does not redeploy the runtime.
