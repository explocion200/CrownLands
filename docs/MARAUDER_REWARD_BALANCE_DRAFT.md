# Marauder reward balance draft

Solo Marauders cover levels 1–79, with a maximum item-drop chance of 70%. Clan bosses cover levels 80–100. This matches the current solo/boss classification and replaces the earlier suggested boundary at level 70. Keep this draft local until the complete balance package is ready for review and publication. Runtime behavior and the Master Specification are unchanged.

## Fixed solo values

Each solo Marauder level has fixed full-strength defending troops, Gold, XP and item-drop chance. Use the table below as a level lookup. Player level, XP-bar progress, city levels, production, skills, equipment and bonuses do not alter these configured values. Future changes to city upgrade costs or Hero progression do not automatically change the table.

A victorious solo hunt pays the listed Gold and XP once. The drafted recipient-level XP-cap exemption now covers all solo levels 1–79; other battle types retain their current caps unless separately changed. This is a proposed change to the current Master Specification and live settlement, which still applies its existing cap. Player level can neither increase nor reduce the listed solo payout. Existing Hero level-up Gold, troops and skill points still apply.

Defenders are the enemy's starting army, not a troop reward. Failed attacks retain their existing surviving-defender behavior. Failed or canceled hunts pay no victory rewards. Keep 10 stamina per hunt, the existing item pool and weights, combat mechanics, respawn rules and once-only settlement.

## Calculations used to choose the fixed values

Gold remains one fifth of the undiscounted regular-city cost from level L to L + 1, rounded down. XP remains one fifth of the full Hero requirement from level L to L + 1, rounded down. These are one-time derivations from the documented source revision, not runtime dependencies on the player's state.

- `Gold[L] = floor(standardCityUpgradeCost(L) / 5)`
- `XP[L] = floor(getXpRequiredForLevel(L) / 5)`

The current Hero requirement through level 25 is `floor(150 + 65 * L + 35 * L ** 2.05)`; above 25 it is `floor(27469 * 1.1 ** (L - 25))`, subject to the existing safe-integer bound. Five rewards provide approximately one corresponding level's requirement, with up to four units missing due to rounding. Defeating a higher-level Marauder can award multiple Hero levels; those indirect rewards remain part of the overall economy review.

Gold and XP for levels 1–69 preserve their previous drafted numbers. Levels 70–79 now have a complete fixed solo entry, replacing the earlier review-only extension.

## Solo defending troops

To extend the previous solo curve, this draft moves the same 1,000,000-troop maximum from level 69 to level 79. This is the working interpretation of recalculating the solo range. Preserve existing level 1–40 defenders, then grow geometrically from 100,000 at level 40 to 1,000,000 at level 79.

| Level anchor | Draft defending troops |
| ---: | ---: |
| 1 | 100 |
| 20 | 10,000 |
| 40 | 100,000 |
| 79 | 1,000,000 |

For levels 41–78 use `floor(100000 * 10 ** ((L - 40) / 39))`; level 79 is exactly 1,000,000. Freeze the resulting integers in the level table. The current live level-79 count is 10,000,000, so the proposed maximum is 90% lower.

## Solo item-drop chance

Keep the draft's 1% starting chance and spread the increase evenly to the requested 70% maximum at level 79. Round to the nearest 0.01 percentage point, stored as whole basis points: `itemChanceBps[L] = 100 + round(6900 * (L - 1) / 78)`. One basis point is 0.01%; 7,000 basis points is exactly 70%. These fixed chances replace the previous level-as-percent draft.

Each victory rolls once for at most one item. A level-79 win has a 70% chance of one item and a 30% chance of none. The chance is independent of player strength, troop count and previous drops. Preserve server-owned rolls and once-only settlement; retries cannot reroll or duplicate items. Gold and XP are awarded on victory regardless of the item result.

The current live solo curve runs from 2% to 10%; replacing it needs the coordinated balance release. A successful drop still chooses one consumable from this unchanged weighted pool:

| Item | Share of successful drops | Chance per level 79 solo victory |
| --- | ---: | ---: |
| War Drums | 35% | 24.50% |
| Veil of Silence | 25% | 17.50% |
| Swift March Order | 18% | 12.60% |
| Royal Tax Decree | 12% | 8.40% |
| Recall Horn | 8% | 5.60% |
| Peace Shield | 2% | 1.40% |

The final column totals 70%; the remaining 30% is no item.

## Fixed solo values for levels 1 through 79

Gold and XP are full solo victory payouts. Troops are full-strength starting defenders.

| Marauder level | Defending troops | Gold | XP | Item chance |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 100 | 5 | 50 | 1% |
| 2 | 127 | 7 | 84 | 1.88% |
| 3 | 162 | 10 | 135 | 2.77% |
| 4 | 206 | 14 | 202 | 3.65% |
| 5 | 263 | 20 | 284 | 4.54% |
| 6 | 335 | 26 | 383 | 5.42% |
| 7 | 428 | 35 | 499 | 6.31% |
| 8 | 545 | 45 | 631 | 7.19% |
| 9 | 695 | 59 | 779 | 8.08% |
| 10 | 885 | 74 | 945 | 8.96% |
| 11 | 1,128 | 93 | 1,127 | 9.85% |
| 12 | 1,438 | 116 | 1,327 | 10.73% |
| 13 | 1,832 | 143 | 1,543 | 11.62% |
| 14 | 2,335 | 175 | 1,777 | 12.50% |
| 15 | 2,976 | 213 | 2,028 | 13.38% |
| 16 | 3,792 | 258 | 2,296 | 14.27% |
| 17 | 4,832 | 314 | 2,581 | 15.15% |
| 18 | 6,158 | 375 | 2,884 | 16.04% |
| 19 | 7,847 | 449 | 3,204 | 16.92% |
| 20 | 10,000 | 537 | 3,542 | 17.81% |
| 21 | 11,220 | 640 | 3,897 | 18.69% |
| 22 | 12,589 | 757 | 4,270 | 19.58% |
| 23 | 14,125 | 896 | 4,660 | 20.46% |
| 24 | 15,848 | 1,056 | 5,068 | 21.35% |
| 25 | 17,782 | 1,243 | 5,493 | 22.23% |
| 26 | 19,952 | 1,464 | 6,043 | 23.12% |
| 27 | 22,387 | 1,713 | 6,647 | 24% |
| 28 | 25,118 | 2,008 | 7,312 | 24.88% |
| 29 | 28,183 | 2,347 | 8,043 | 25.77% |
| 30 | 31,622 | 2,740 | 8,847 | 26.65% |
| 31 | 35,481 | 3,191 | 9,732 | 27.54% |
| 32 | 39,810 | 3,712 | 10,705 | 28.42% |
| 33 | 44,668 | 4,315 | 11,776 | 29.31% |
| 34 | 50,118 | 5,013 | 12,954 | 30.19% |
| 35 | 56,234 | 5,813 | 14,249 | 31.08% |
| 36 | 63,095 | 6,731 | 15,674 | 31.96% |
| 37 | 70,794 | 7,784 | 17,241 | 32.85% |
| 38 | 79,432 | 9,005 | 18,966 | 33.73% |
| 39 | 89,125 | 10,398 | 20,862 | 34.62% |
| 40 | 100,000 | 12,002 | 22,948 | 35.50% |
| 41 | 106,081 | 13,840 | 25,243 | 36.38% |
| 42 | 112,533 | 15,937 | 27,768 | 37.27% |
| 43 | 119,377 | 18,349 | 30,545 | 38.15% |
| 44 | 126,638 | 21,116 | 33,599 | 39.04% |
| 45 | 134,339 | 24,273 | 36,959 | 39.92% |
| 46 | 142,510 | 27,885 | 40,655 | 40.81% |
| 47 | 151,177 | 32,014 | 44,721 | 41.69% |
| 48 | 160,371 | 36,738 | 49,193 | 42.58% |
| 49 | 170,125 | 42,137 | 54,112 | 43.46% |
| 50 | 180,472 | 48,288 | 59,523 | 44.35% |
| 51 | 191,448 | 55,670 | 65,476 | 45.23% |
| 52 | 203,091 | 65,402 | 72,023 | 46.12% |
| 53 | 215,443 | 77,474 | 79,226 | 47% |
| 54 | 228,546 | 92,211 | 87,148 | 47.88% |
| 55 | 242,446 | 109,993 | 95,863 | 48.77% |
| 56 | 257,191 | 131,299 | 105,449 | 49.65% |
| 57 | 272,833 | 156,750 | 115,994 | 50.54% |
| 58 | 289,426 | 186,994 | 127,594 | 51.42% |
| 59 | 307,029 | 222,843 | 140,353 | 52.31% |
| 60 | 325,702 | 265,185 | 154,389 | 53.19% |
| 61 | 345,510 | 315,101 | 169,828 | 54.08% |
| 62 | 366,524 | 373,804 | 186,810 | 54.96% |
| 63 | 388,815 | 442,716 | 205,491 | 55.85% |
| 64 | 412,462 | 523,447 | 226,041 | 56.73% |
| 65 | 437,547 | 617,870 | 248,645 | 57.62% |
| 66 | 464,158 | 728,178 | 273,509 | 58.50% |
| 67 | 492,388 | 856,799 | 300,860 | 59.38% |
| 68 | 522,334 | 1,006,615 | 330,946 | 60.27% |
| 69 | 554,102 | 1,180,872 | 364,041 | 61.15% |
| 70 | 587,801 | 1,383,329 | 400,445 | 62.04% |
| 71 | 623,550 | 1,618,274 | 440,490 | 62.92% |
| 72 | 661,474 | 1,890,702 | 484,539 | 63.81% |
| 73 | 701,703 | 2,206,170 | 532,993 | 64.69% |
| 74 | 744,380 | 2,571,209 | 586,292 | 65.58% |
| 75 | 789,652 | 2,993,242 | 644,921 | 66.46% |
| 76 | 837,677 | 3,480,661 | 709,414 | 67.35% |
| 77 | 888,623 | 4,043,230 | 780,355 | 68.23% |
| 78 | 942,668 | 4,691,949 | 858,391 | 69.12% |
| 79 | 1,000,000 | 5,439,559 | 944,230 | 70% |

## Boss brainstorm for levels 80 through 100

The owner selected a minimum of two and maximum of five clan members per boss rally, including the leader: one leader plus up to four allies. This draft decision replaces the current Master Specification's 20-member boss limit; runtime behavior remains unchanged until the complete package is implemented. Keep the existing Core-only boss placement. Solo levels 70–79 remain in New Lands, and other rally types retain their existing limits. Other boss mechanics and numbers below remain proposals for discussion.

### Meaningful contributions

Require every participant to bring effective attack power of at least 5% of the boss's configured full-strength defense. Do not use 5% of the rally total, so another member joining does not raise that participant's minimum. Also require no individual to contribute more than 70% of the assembled rally's total attack power; other members must collectively contribute at least 30%. For two people, 70/30 or 50/50 qualifies, while 99/1 does not. Combat bonuses count toward effective attack power.

Show the required troops for each member's own combat bonuses, their contribution share, forecast losses and estimated payout before launch. Reserve at most five active participant slots, counting inbound and assembled members together. Recheck the two-to-five assembled-member requirement and contribution rules before launch and stamina spending, with all launch checks atomic. If members withdraw during assembly, recheck readiness. At least two members does not itself guarantee victory. Stronger members may reduce their committed force or wait for more help if the 70% limit prevents launch; this restriction needs playtesting with unequal-strength clans.

### Fixed pools with a rally premium

Start with 2,000,000 defenders at level 80 and double every five boss levels, reaching 32,000,000 at level 100. For intermediate levels the proposed calculation is `floor(2000000 * 16 ** ((L - 80) / 20))`. Rewards use the revised level-79 solo as their reference, with a 25% premium per configured defender:

`bossPool = floor(level79SoloReward * bossDefenders / 1000000 * 1.25)`

Calculate Gold and XP separately, then freeze each boss level's totals. This is a first balance estimate, not evidence that the rewards cover every player's losses. Bosses do not grow stronger when more members join, and additional members do not increase the total Gold or XP pool.

| Boss level | Defending troops | Total Gold pool | Total XP pool | Personal item chance |
| ---: | ---: | ---: | ---: | ---: |
| 80 | 2,000,000 | 13,598,897 | 2,360,575 | 80% |
| 85 | 4,000,000 | 27,197,795 | 4,721,150 | 85% |
| 90 | 8,000,000 | 54,395,590 | 9,442,300 | 90% |
| 95 | 16,000,000 | 108,791,180 | 18,884,600 | 95% |
| 100 | 32,000,000 | 217,582,360 | 37,769,200 | 100% |

Gold and XP are shared totals for the victorious rally, not per-member awards. Divide them by each member's snapshotted effective attack-power contribution with integer remainder handling that preserves the total. A 70/30 split receives 70% and 30%; the leader gets no automatic extra share. To preserve those exact payouts, the proposed boss rule would exempt these shares from the recipient-level XP cap, as in the solo draft. That additional boss-cap change is part of this brainstorm only.

At level 80, two equal contributors would each receive approximately 6,799,448 Gold and 1,180,287 XP, with any remaining whole unit assigned once. The premium is 25% above one level-79 solo payout per person, while the full boss has twice the defenders.

With five equal contributors at the proposed level-100 boss, each would receive 43,516,472 Gold and 7,553,840 XP, plus one item on victory. The 32,000,000 total defenders and those reward pools remain unapproved first-pass values. Reaching five members alone does not establish that the party is strong enough to win.

### Personal item rolls

Propose one personal roll for each qualifying participant: level 80 gives 80%, level 85 gives 85%, and level 100 guarantees one item per participant. Reuse the same weighted consumable pool and at most one item per participant. This replaces the current single-item maximum for the entire victorious boss rally. With five members maximum, a victory can award at most five items total; at level 100 every qualifying participant gets one. Failed or canceled hunts receive no items.

### Review before choosing boss values

Reassess the proposed 2M–32M defender curve and reward pools specifically for parties of two, three, four and five; no tier may assume access to more than five members. Compare attack bonuses, expected losses, casualty recovery, stamina and replacement time before approving those values. Test the 5% contribution floor and 70% ceiling against both strong and developing clan members. Account for indirect Hero level-up rewards and total item output. Also review weakened bosses after failed attacks: the live rules preserve surviving defenders and only the victorious rally earns loot, so a finishing rally can face less risk than the configured full-strength pool suggests. The full-strength minimum contributions remain in this proposal; no additional wound, healing or earlier-damage payout policy is approved.

## Sources and verification

The calculation source is repository base `439e9083b87c6a3f5d29e205ef64706270b3bee7`:

- [Server](../functions/index.js): city upgrade costs, Hero level requirements, current XP caps, boss readiness, contribution snapshots and casualty allocation.
- [Client](../game.js): matching Hero XP requirements.
- [Economy configuration](../functions/economy-config.json) and [battle guide calculator](../battle-guide-calculations.js): independent city-cost cross-check.
- [Marauder rules](../functions/marauder-rules.js): current troops, weighted item pool, allocation and rewards.
- [Master Specification](CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md): current solo/boss boundary, combat, rally eligibility, rewards and persistence.

All 79 solo Gold costs match the extracted server functions and battle guide. All 79 Hero requirements match server and client. Relevant installed functions, constants, economy configuration and the Marauder module match those inputs. Gold/XP preserve the previous level 1–69 draft; early defenders preserve levels 1–40. Every proposed solo value increases with level, the troop maximum is exactly 1,000,000 at 79, and chances start at 1% and end at 70% without exceeding the cap. The six item weights sum to 100%; weighted level-79 drops total 70%.

All 21 proposed boss levels were checked for increasing positive integer defenders and pools, exact endpoint values and 80–100% personal item chances. Integer arithmetic calculates reward pools without floating-point payout rounding. These are arithmetic and document checks only; no runtime, battle simulation, production mutation, merge or publication has occurred.

The boss-party limit is two to five members including the leader, scoped only to bosses. The five-way level-100 reward example conserves both pools exactly, and the proposed personal-drop maximum is five items. All existing solo rows and proposed boss-tier totals remain unchanged; five-member combat feasibility has not yet been simulated.
