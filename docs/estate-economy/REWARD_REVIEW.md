# Estate reward and whole-account review

Review date: October 7, 2026. **The implemented presentation can pass validation while the proposed economy still fails reward readiness.** No live estate economy or player data is exercised here. This report audits the existing draft; recommendations below do not silently change approved gameplay or the cost tables.

Reproduce with `node tools/validate-estate-reward-review.js --write`. The existing economy validator independently reproduces the source level tables. This second review consumes those exact 2,000 prices and checks effective benefits, shared-account production, visits, storage, prerequisites, material conservation and reward incentives.

## Findings that block accepting gameplay balance

1. **Officer buildings have 95 upgrades each without a new usable benefit.** Their four rarity gates are useful destinations, but a progress bar alone does not satisfy useful rewards at every step. Existing two-copy Gear rules are confirmed and must not be replaced. Legendary L1 still represents 1,048,576 Common L1 equivalents if built entirely from Common copies; existing Uncommon acquisition changes the mix but does not establish attainable late-tier rewards. Propose a separate, approved per-level reward/acquisition track and test actual drop supply before enforcing building gates.

2. **A fresh account does not have the supporting factories assumed by the 1/3/6/10-season calibration.** The first paid material upgrades can take several days at Level 1 production. Funding all twenty buildings competes for the same stock. The full-account cohorts below replace any implication that a fresh estate follows twenty independent reference tracks. Decide whether the target remains a developed-estate resource equivalent or whether an onboarding cost ramp and revised allocation are needed; preserve total band budgets if redistributing early bills.

3. **Most shop levels give no effective benefit.** With only 0.25/0.5/1-hour presets, the increasing per-order cap changes ordinary offers only at Levels 34 and 100. A Level 1 player can already buy four quarter-hour packs for the same 20 Crowns/day as Level 100. Raising the cap only reduces clicks. A custom quantity would remove rounding gaps but would not make ten seasons of investment valuable. Recommend meaningful earned catalog/value or estate-service benefits, including a reason for free players to upgrade; retain the shared purchase cap and obtain approval for any changed paid advantage.

4. **Great Hall 96–100 has no mechanical reward.** Hall 95 already allows every other site to reach 100 under Hall+5. Propose a final Hall mastery reward or a revised late cap that reaches 100 only at Hall 100, without adding unapproved world-combat or production bonuses.

5. **Higher quest tiers can be strictly worse for material gathering.** All tiers share the same 0.5/1.2/2.4-hour material reward. Rare+ adds a Tool fee without increasing that reward. The only tier-scaled reward is XP, which becomes useless when the party is maxed. Do not launch with a permanently better Common quest strategy: design bounded tier-specific rewards and rerun the material budget.

6. **Champion training does not match the multi-season goal yet.** The current XP curve totals 21,780 XP, only 68.06 Legendary quest-hours before recovery if an eligible party can carry a recruit. Stored ceiling-blocked XP and recruits starting up to Level 50 further shorten training. Decide the intended champion training horizon, revise XP and recruit head starts together, and test veteran/new-champion parties.

7. **Quest income is large enough to invalidate the construction-only timing claim.** Three continuously rotated 8-hour parties can add 90% of one selected resource's base production (100.8% with +12% meals), before caps and visits. Spending 50% of that boosted income is not the audited 50% of factory output. Treat expeditions as part of the shared budget, not an unmodeled extra.

8. **Gold reservations across a reset lack an executable contract.** The draft retains funded queues while world Gold resets. A later-stage server design must bind paid/reserved Gold to durable job receipts and define cancellation/refunds without duplicating current-season Gold. No UI or arithmetic fixture proves this production behavior.

9. **The material loop has no durable endgame purpose yet.** After the chosen buildings and champions reach their caps, expeditions mostly produce more building materials, while officer Gear still uses its separate Gold/copy economy. Full warehouses and Food spent to gather unneeded materials are not lasting rewards. Propose optional estate mastery, cosmetic projects or approved acquisition contracts with repeatable material demand; avoid adding an upkeep tax or unapproved army bonuses simply to consume surplus.

10. **A full champion roster has no replacement/bench contract.** Recruitment checks the 24-champion maximum, but the draft defines no safe bench, dismissal or quality-improvement route. A player who filled the roster early can lose the benefit of newly unlocked recruits. Prefer separating permanent champion ownership from the active expedition roster, with clear activation limits; exact ownership/bench rules require design before implementation and must preserve acquired champions.

## Effective level rewards

Counts cover the 99 upgrades from Level 1 to 100. A changed stat is only a potential benefit: a faster processor is useful only when its inputs and demand support it, and storage matters when headroom is needed. No-benefit counts exclude aesthetic progress indicators.

| Building | Upgrades with a changed usable rule | Upgrades with no changed usable rule |
|---|---:|---:|
| Great Hall | 94 | 5 |
| Treasury | 4 | 95 |
| Barracks | 4 | 95 |
| Gatehouse | 4 | 95 |
| Royal Stables | 4 | 95 |
| Alehouse | 99 | 0 |
| Guild Master | 99 | 0 |
| Forester’s Lodge | 99 | 0 |
| Quarry | 99 | 0 |
| Mine | 99 | 0 |
| Farmstead | 99 | 0 |
| Storehouse | 99 | 0 |
| Granary | 99 | 0 |
| Sawmill | 99 | 0 |
| Smithy | 99 | 0 |
| Workshop | 99 | 0 |
| Windmill | 99 | 0 |
| Builders’ Yard | 99 | 0 |
| Wagon Yard | 4 | 95 |
| Market | 2 | 97 |

## Shared-account cohorts

Illustrative policies, not optimal play or live forecasts. Start with the actual six completed sites, fourteen unbuilt plots, zero materials, 100 Gold, 285 Gold/hour and a modeled 100-Gold restart every 30 days. All construction prices, actual producer levels and capacities come from the draft. Source and factory output settles in recipe order every ten minutes, pausing for missing input/full storage without destroying inputs. Buildings keep producing at the old level while upgrading.

At each visit, build/upgrade the lowest-level eligible site, breaking ties in favor of sources, storage and processing. Fund one next-level project at a time; spend every available material on construction, with no competing world Gold spend, recruitment, quests, meals or Crown purchases. Earn builder slots normally; require Hall+5. Start affordable work when a slot is available, without prequeued batches. This is one reproducible shared-budget policy, not the former assumption of free supporting factories. A five-minute step run reproduces the three-visits cohort's day-300 levels.

| Visits/day | All 20 first built, day | All 20 at 25, day | All 20 at 50, day | All 20 at 75, day | All 20 at 100, day |
|---|---:|---:|---:|---:|---:|
| 3 | 4.34 | 264.92 | 712.1 | 1,372.92 | 2,249.38 |
| 1 | 13.01 | 353.25 | 801.43 | 1,462.59 | 2,338.71 |

| Cohort / day | Hall | Treasury | Forester | Quarry | Storehouse | Builders' Yard | Lowest / highest building |
|---|---:|---:|---:|---:|---:|---:|---|
| 3 visits / 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 / 1 |
| 3 visits / 7 | 1 | 1 | 2 | 2 | 1 | 1 | 1 / 2 |
| 3 visits / 30 | 2 | 2 | 3 | 3 | 3 | 2 | 2 / 3 |
| 3 visits / 90 | 6 | 5 | 6 | 6 | 6 | 6 | 5 / 6 |
| 3 visits / 180 | 14 | 14 | 15 | 15 | 14 | 14 | 14 / 15 |
| 3 visits / 300 | 26 | 26 | 27 | 27 | 27 | 27 | 26 / 27 |
| 1 visits / 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 / 1 |
| 1 visits / 7 | 1 | 1 | 1 | 1 | 1 | 0 | 0 / 1 |
| 1 visits / 30 | 1 | 1 | 2 | 2 | 2 | 2 | 1 / 2 |
| 1 visits / 90 | 4 | 4 | 5 | 5 | 5 | 4 | 4 / 5 |
| 1 visits / 180 | 9 | 8 | 9 | 9 | 9 | 9 | 8 / 9 |
| 1 visits / 300 | 19 | 19 | 20 | 20 | 20 | 20 | 19 / 20 |

These cohorts use 100% of available materials for estate building. Keeping half for other activities, choosing a different construction order, pausing processors, queuing funded work or adding quests changes the outcome. No date here is a hard wait requirement or an account-wide promise. Stored inventory and factories carry through every simulated rollover. Material and Gold conservation are asserted across the full run.

## First-upgrade wait at an undeveloped supply chain

Assume all sources/processors are already Level 1, empty stock, an available slot and 50% of sustainable net production. This isolates the material wait for Level 2, excluding first builds, competing projects and construction. Pausing unneeded processors can improve raw-material waits; the table is not a minimum.

| Building | Material wait for Level 2, hours |
|---|---:|
| Great Hall | 83.43 |
| Treasury | 83.43 |
| Barracks | 83.43 |
| Gatehouse | 83.43 |
| Royal Stables | 83.41 |
| Alehouse | 83.41 |
| Guild Master | 83.43 |
| Forester’s Lodge | 83.41 |
| Quarry | 83.41 |
| Mine | 83.41 |
| Farmstead | 83.41 |
| Storehouse | 83.43 |
| Granary | 83.41 |
| Sawmill | 83.41 |
| Smithy | 83.43 |
| Workshop | 83.43 |
| Windmill | 83.41 |
| Builders’ Yard | 83.43 |
| Wagon Yard | 83.41 |
| Market | 83.41 |

## Quest and supply checks

| Concurrent 8-hour parties with continuous rotation | Food/day as % of daily Food output | Tool/day for Rare+ as % of daily Tools | Extra output of one chosen resource/day |
|---|---:|---:|---:|
| 1 | 15% | 5% | 30% |
| 2 | 30% | 10% | 60% |
| 3 | 45% | 15% | 90% |

These are ceiling scenarios using enough rested champions, immediate claiming, space for rewards and all reward budget on one material. Recovery does not enforce a per-account launch gap when alternate parties are available. Three rotating parties use twelve active champions and can be supported by the final roster of twenty-four. Fees round up in actual quotes. Meals add their own Food fees. Longer expeditions give 0.30 resource-hour per real hour; two-hour quests give 0.25. Tier fees need a commensurate reward at the same duration.

- Two Uncommon Level 25 champions have power 62 and meet the 60-point tier threshold. Four Epic Level 75 champions have power 524 and meet the 320-point Epic requirement. Four Rare Level 100 champions reach 600, so Legendary-quality recruitment is not mandatory for Legendary quests. These thresholds are feasible, but feasibility does not establish reward value.
- The full twenty-building Level 2–100 table consumes 317,882 Tools, equal to only 196.63 days of Level 100 Workshop net output. Production upgrades remain potentially useful for quests or speeding early supply, but long-term processor demand needs a sink/allocation review. This quantity is not an upgrade payback calculation.
- The one-hour Crown allowance is 4.17% of one resource's daily factory output, shared across both stores. It is not 4.17% for every resource. If all paid supply goes to the chosen building while only half of free output is allocated there, it adds up to 8.33% to that allocated material budget before other limits. Spending across a reset must not renew the UTC-day allowance.

## Recommended acceptance criteria

- Show a real current/next benefit on every paid level. Officer sub-milestone rewards, late Hall rewards and shop utility need explicit designs before claiming this passes.
- Keep the approved 1/3/6/10-season per-building resource direction. Reconcile a shared-account cohort, an early-session cost ramp and quest income with that direction before freezing prices. Exact recommendations remain proposals; this review does not alter the existing 2,000 bills.
- Give every quest tier a reason to choose it after champion XP is capped. Cap total quest contribution to the construction budget; maintain an affordable Food reserve and a free no-meal option.
- Tie champion training and recruitment head starts to a separately chosen multi-season horizon. Do not silently change settled officer Gear copy rules or grant new world combat bonuses.
- Before gameplay release, implement and test authoritative material settlement, deposits, costs, queues, replay-safe completion, cross-season migration, champion actions and shop spending. The current estate UI is presentation, not that backend.

## Verification scope

This audit asserts generated-price completeness, nonnegative/capped inventories, recipe and deposit conservation, valid construction transitions, shared resources/earned builder slots, persistent estate state and simulation-step stability. Its successful execution means the review is reproducible; it deliberately reports unresolved reward failures. Separately run the existing estate browser suite against the delivered production script for selection, counters, navigation, camera, small-landscape layout and cleanup. Those fixtures cannot certify live saved economy transactions or physical-device touch behavior.
