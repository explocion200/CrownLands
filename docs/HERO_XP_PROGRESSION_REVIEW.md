# Beginner Hero XP and later progression

Reviewed October 18, 2026 against base `d47252f3eb2c53eed6e865d802a391526fd4238a`.
The installed `functions/index.js` matched that source. The read-only current
realm pointer was `main-realm-2026-10 / realm-2026-10 / shard_0001`; the release
contract selects `core-expansion-v1`. Current regular neutral-city aggregates
confirmed Level 1 with zero defenders. No player records were changed for this review.

## Confirmed beginner target

The owner confirmed Level 15 by 30 total owned cities: the starting Main City
plus 29 eligible NPC captures, with upgrades and other XP providing additional
progress. The old capture-only model earned 2,473 XP, ending at Level 5 with
112 XP toward Level 6. Reaching Level 15 requires 48,859 cumulative XP.

The owner clarified that this should be a bonus for the **first 29 eligible NPC
captures**, rather than a reward that stops at Hero Level 15. Each capture keeps
its normal battle XP and receives an additional scheduled beginner bonus. The
29 bonuses total exactly 48,859 XP. Their cumulative amount follows the existing
Level 1–15 curve at `14*n/29` levels above Level 1 after capture `n`, interpolating
within each level and rounding down. Consecutive differences give each award.
This grows the bonus gradually: 120 XP on capture 1, 1,364 on capture 15 and
4,291 on capture 29. Other activities never reduce these bonuses.

| Total cities | Eligible captures | Hero level with normal capture XP, no other activities |
| --- | --- | --- |
| 1 | 0 | 1 |
| 5 | 4 | 3 |
| 10 | 9 | 5 |
| 15 | 14 | 8 |
| 20 | 19 | 10 |
| 25 | 24 | 12 |
| 29 | 28 | 14 |
| 30 | 29 | 15 |

With current empty Level 1 neutral targets, the full journey gives 51,089 XP:
48,859 in bonuses plus 2,230 ordinary XP, finishing Level 15 with 2,230 XP toward
Level 16. The normal skill-point, Gold and Main City troop rewards apply once.
Failed, protected, non-capturing, abandoned, relocated, player-target and objective
attacks do not consume a bonus. Reaching Level 15 through other activities does
not end the first-29 entitlement. A stored server-only character counter survives
skill operations, logout and lost cities; replay and concurrent transactions
cannot replenish or duplicate its rewards.

Fresh starting-city claims initialize this seasonal counter. Existing profiles
without it retain normal XP: their historical captures are not inferred from
current ownership, and there is no retroactive grant. No new table or bulk data
migration is introduced. The new field is inside the already protected character
state; client writes remain forbidden. A future catch-up decision would need
separate eligibility rules and owner approval.

## Later curve — review only, unchanged

`getXpRequiredForLevel(L)` is the XP from Level L to L+1. Through Level 25 it is
`floor(150 + 65L + 35L^2.05)`. Beyond that it is
`floor(27,469 × 1.10^(L-25))`. Level requirements roughly double every 7.3 levels.

| Hero level | XP for next level | Cumulative XP to reach this level |
| --- | ---: | ---: |
| 15 | 10,141 | 48,859 |
| 20 | 17,712 | 113,838 |
| 25 | 27,469 | 221,032 |
| 30 | 44,239 | 388,731 |
| 50 | 297,618 | 2,922,517 |
| 75 | 3,224,609 | 32,192,412 |
| 100 | 34,937,693 | 349,323,248 |
| 150 | 4,101,365,691 | 41,013,603,194 |

The later curve needs a coordinated earning-rate review, not an isolated change
to its exponent:

- Each newly developed city level awards 0.5% of the Hero XP requirement at that
  **city's source level**. Reducing the Hero formula also reduces city-upgrade XP.
  At matching Hero/city levels, 30 eligible single-level city upgrades provide
  about 15% of a Hero level, before individual floors. Higher-level cities yield
  much more XP relative to a lower-level Hero.
- Hunting XP grows more slowly than late Hero requirements. A Level 50 hunt
  offers 5,000 XP, versus 297,618 for Hero Level 50→51. At Level 75 those values
  are 20,614 versus 3,224,609. A Level 100 boss offers a 200,000 XP pool versus
  34,937,693 for Hero Level 100→101. Those are roughly 60, 157 and 175 full pools
  respectively; rally sharing, availability, losses and stamina further affect
  actual pacing. These are comparisons, not time-to-level promises.
- PvP XP depends on defeated troops, target level and relative King Power. Its
  per-battle cap is 100% of the current level requirement through Hero Level 50,
  tapering to 50% at 100 and 35% at 150. Those percentages are caps, not guaranteed
  awards. Preset unlocks remain at Levels 25, 50, 75 and 100.

Recommendation: retain Levels 15–25 for now and review active-player seasonal
progress plus city-development, hunt and PvP earnings together before adjusting
later levels. An 8% post-25 alternative would require 188,120 XP at Level 50,
1,288,340 at 75 and 8,823,167 at 100, but must also preserve intentional city-XP
rates, saved progress and level-up Gold/troop economics. That alternative is
**not approved or implemented** in this change.

## Validation and release boundary

The source-based validator compares server and client awards across Levels
1–200, exclusion cases, fixed first-29 bonuses, independent extra XP and persisted counters. The shared synthetic
capture journey runs on PostgreSQL and the current-realm combat emulator suite,
including failed/abandoned captures, 29 actual settlements, duplicate and
concurrent resolution, 14 skill points, level-up rewards, counter tampering and the
ownership cap. Losing a city after bonus 29 does not restore eligibility.
Desktop and landscape-mobile browser checks exercise the real attack preview.

The backend must be installed and verified separately before the configured
publisher releases the matching client. A merged PR is not proof of deployment.
