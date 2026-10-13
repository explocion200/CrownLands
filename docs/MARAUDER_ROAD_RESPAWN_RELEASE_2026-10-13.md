# Separated road marauder respawns — October 13, 2026

The authorized merge and coordinated deployment of [PR #546](https://github.com/explocion200/CrownLands/pull/546) is **LIVE — WEB AND FIREBASE**. New and replacement NPC centers use many possible painted-road locations inside the 20% edge inset. They preserve terrain, scenery, building/objective clearance and reachable routes. Each New Lands map has at most two active solos: one uniform level 1–10 beginner and one equally initialized medium/high slot that alternates levels 11–39 and 40–79 on replacement. Each Core map retains one level 80–100 boss slot.

Active NPC centers stay at least 25% of the shorter map side apart, with a 128-world-unit minimum. Replacements move at least 128 units from their previous point and remain separated from other active camps. Solo/boss cooldowns remain two/thirty minutes. Blocked slots wait for bounded maintenance retries; building clearance is unchanged. Artwork, city-style target controls, stamina, proportional Crown refill pricing, rewards and combat remain included.

## Verified identity

| Item | Value |
|---|---|
| Feature branch / merged PR | `codex/marauder-road-only-spawns`, #546 |
| Game build | `6946e9bd78a0a7d97a12fefe746bd8b44be26926` |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `e930645b55ce4f6c6dffef8589c24b7d98bb0bc9cd56a773602eb9bccc73fc32` |
| Client source SHA-256 | `75165cb0e378b26e58898ed09d5a7e2b530a1317073eb0591075f86315a5c0ca` |
| Netlify deployment | `6ace3ae0b097d0dbb6f2ad07` |
| Web publication | October 13, 10:27 a.m. Eastern (`2026-10-13T14:27:52.200Z`) |
| Firebase project | `crown-land-b15e0` |
| World / generation / shard | `main-realm-2026-10` / `realm-2026-10` / `shard_0001` |
| Placement / combat / balance versions | 4 / 1 / 1 |
| Existing population/refill flag restored | `2026-10-13T14:28:59.208Z` |

The manual web publication hold remains enabled. This deployment changes only the current October realm population policy; archived generations were not reconciled. The preceding [controls release](MARAUDER_CONTROLS_RELEASE_2026-10-13.md) and [initial stamina release](MARAUDER_STAMINA_RELEASE_2026-10-12.md) retain historical deployment and purchase-disclosure evidence.

## Validation and deployment

- `Static validation`, `Multiplayer emulator validation` and `Validate` passed for feature head `084bb25a68dc51a4dea0dbc4c4741c6da256477c` in [run 38401337059](https://github.com/explocion200/CrownLands/actions/runs/38401337059). `prepare-pr` passed its affected-test plan: terrain, shared rules and browser placement validators, with population and real-combat emulator coverage in CI. The emulators exercised retirement, replacement identities, concurrent reconciliation and exact-once stamina/consumable refunds with full troop returns and no loot.
- Clean local `main` was synchronized and verified after merge, equal to `origin/main` with divergence `0 0`. The merged production artifact passed validation: 1,158 files including inventory, 179 resources per entry, and 1,157 matching staged inventory entries.
- Nineteen staged and 55 public file comparisons passed across the immutable Netlify deployment, `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. Six staged and six public cold-load/reload cases passed at 1440×900, 844×390 and 568×320 with an isolated browser profile per viewport, no runtime exceptions and no failed game assets. An initial staging comparison failed because the local stamp used a short commit while Netlify used the full commit; rebuilding with the full `COMMIT_REF` resolved that artifact-context mismatch before publication.
- All 149 Functions are ACTIVE on Node 22. Twenty-four updates remained stale after the initial quota-limited batch; two targeted batches of twelve completed them. All six deployed source-hash cohorts match the merged manifest and inspected shared sources, including road geometry, population, combat entry points, stamina and routing. The CLI's initial zero exit did not establish success; source/timestamp verification and retries established completion. The 29-callable access audit and unauthenticated realm/stamina/refill guards passed.
- Existing Firestore rules match SHA-256 `17f686a05f6f92676dc5ce93345cbe609b19c4754dd94461907304052dd58b0a`; both NPC indexes are READY. No rules/index changes were required or deployed.
- Authenticated `getRealmInfo` verified the release/build, current October pointer and Core-expansion topology before publication and again before restoration of spawning/refills. Temporary Auth accounts were deleted without creating player profiles or assignments. Verification initiated no live battle or purchase and spent no player's Crowns.

## Population transition

The user explicitly approved removing extras and refunding affected marches rather than waiting for old targets to be defeated. The deployment temporarily paused the existing `marauderPopulation/realm-2026-10--shard_0001` flag at `2026-10-13T14:09:35.543Z`, preserving its other fields. The flag was restored only after matching client/backend verification. Natural stamina recovery and permanent refill allowances were unchanged.

Bounded ordinary maintenance retired obsolete slots, incompatible levels and too-close targets, preserving eligible survivors. Retired/replaced immutable identities resolve committed marches through the existing invalid-encounter path: return all troops, refund stamina up to 100 and applicable consumables exactly once, with no loot or XP. Real production refund settlement was not manufactured or claimed by release verification.

The fresh paused baseline at `2026-10-13T14:17:55.316Z` contained 24 bosses and 669 solos. At `2026-10-13T14:32:28.202Z`, read-only inspection passed:

- All 81 current maps have placement policy 4: 25 Core and 56 active New Lands, including 30 closed-admission maps.
- There are 25 bosses and 110 solos. Zero solos are in Core and zero bosses are in New Lands. Every map satisfies its one-boss/two-solo cap, slot levels, unique spawn identities and separation.
- All 56 new policy-4 road spawns satisfy painted-road coordinates, edge inset, terrain/scenery/building/objective clearance and reachable routes.
- All 79 retained legacy targets match the fresh baseline's immutable identities and positions. Their original placement remains the approved preservation exception until ordinary replacement; they were not moved onto roads.
- Two solo slots are blocked and retry naturally. The snapshot includes 562 retired public records, hidden from active map subscriptions and due-respawn scheduling. Retired canonical slots replaced with new identities need not remain separate records, so this is not a count of all retired encounters.

## Monitoring and limits

Initial monitoring through `2026-10-13T14:32:31.095Z` inspected 43 service-log entries across population, arrival, solo dispatch and stamina services: zero HTTP server errors and zero error-severity entries. Five population maintenance summaries were observed. The bounded battle sample was truncated at 101 records and found no new sampled settlement; the refill sample found no new purchase. These samples do not prove the absence of other battles or establish live refund settlement, long-term rewards, traffic or billing cost.

Actual signed-in refill/refund settlement, naturally defeated replacement cycles, repeated existing-profile navigation, installed-app/physical-device behavior and long-term loss/reward/refund/availability/backend-cost monitoring remain follow-up checks. No continuing monitor was scheduled. Sanitized deployment receipts and screenshots remain under ignored `release-artifacts/marauders/road-deployment/`.

Web and Firebase are verified at the runtime build above. itch.io was not republished; its older incompatible client needs a separately authorized matching publication. This release-record follow-up changes documentation only and does not redeploy the runtime.
