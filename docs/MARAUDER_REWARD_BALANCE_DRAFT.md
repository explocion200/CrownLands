# Approved Marauder reward balance — version 2

Solo Marauders cover levels 1–79, with a maximum item-drop chance of 70%. Clan bosses cover levels 80–100. This matches the current solo/boss classification and replaces the earlier suggested boundary at level 70. The owner approved the complete October 19 revision for implementation. The fixed tables and rules below define balance version 2. Implementation and validation do not establish deployment; the home-server backend must be installed and verified before the matching static release can publish. Existing version-1 spawns and armies keep their original rules.

**Approved October 19:** Keep the solo Gold/XP formulas, one-million solo defender maximum at 79, five-player boss design reference, two-to-five boss participants, 70% solo consumable ceiling and 60–90% boss Gear Box chances. Ease solo levels 11–78, use the 40M boss endpoint, derive boss XP from same-level Hero progression, enforce meaningful contributions, allow conditional Uncommon box upgrades and restore bosses after failed rallies.

## Later October 19 amendment: full rewards for each boss participant

The owner confirmed removing contribution minimums and giving **every launched member the full listed Gold and XP** on victory. This is departure reward policy 2, independent of NPC balance version 2. No level-table values or drop chances change. Two to five current clan members still participate, each with at least one troop and 10 stamina; no minimum defense/attack share or maximum contribution share remains. Casualties never remove an accepted member's reward.

For new departures, the boss table's historically named “Total Gold pool” and “Total XP pool” columns below now mean **Gold per member** and **XP per member**. Level 80 pays each member 33,997,243 Gold and 6,491,581 XP; level 100 pays each 271,977,950 Gold and 43,672,116 XP. A five-member win pays five times those amounts across the party, five times the old total. Hero level-up bonuses remain additional. Consumable and Gear Box rolls remain independent per member with unchanged odds and box contents.

The shared-pool derivations and contribution limits below document the initial balance release and remain applicable only to already-launched policy-1 armies. New policy-2 launches freeze the new policy on the rally and army. Missing saved policy means 1; unsupported or mismatched policies fail closed. Forming rallies against balance-version-2 targets adopt policy 2 at departure. Legacy balance-version-1 encounters, solo rewards, combat and respawn are unchanged. No NPC rewrite or new backup is part of this amendment. Implementation is approved; installation and verified publication remain pending.

## Fixed solo values

Each solo Marauder level has fixed full-strength defending troops, Gold, XP and item-drop chance. Use the table below as a level lookup. Player level, XP-bar progress, city levels, production, skills, equipment and bonuses do not alter these configured values. Future changes to city upgrade costs or Hero progression do not automatically change the table.

A victorious solo hunt pays the listed Gold and XP once. The drafted recipient-level XP-cap exemption now covers all solo levels 1–79; other battle types retain their current caps unless separately changed. This approved exemption supersedes version 1 for new spawns only; other battles retain their caps. Player level can neither increase nor reduce the listed solo payout. Existing Hero level-up Gold, troops and skill points still apply.

Defenders are the enemy's starting army, not a troop reward. Failed solo attacks retain their existing surviving-defender behavior; the boss-only recovery proposal is separate below. Failed or canceled hunts pay no victory rewards. Keep 10 stamina per hunt, the existing consumable pool and weights, combat calculation, respawn delays and once-only settlement.

## Calculations used to choose the fixed values

Gold remains one fifth of the undiscounted regular-city cost from level L to L + 1, rounded down. XP remains one fifth of the full Hero requirement from level L to L + 1, rounded down. These are one-time derivations from the documented source revision, not runtime dependencies on the player's state.

- `Gold[L] = floor(standardCityUpgradeCost(L) / 5)`
- `XP[L] = floor(getXpRequiredForLevel(L) / 5)`

The current Hero requirement through level 25 is `floor(150 + 65 * L + 35 * L ** 2.05)`; above 25 it is `floor(27469 * 1.1 ** (L - 25))`, subject to the existing safe-integer bound. Five rewards provide approximately one corresponding level's requirement, with up to four units missing due to rounding. Defeating a higher-level Marauder can award multiple Hero levels; those indirect rewards remain part of the overall economy review.

Gold and XP for levels 1–69 preserve their previous drafted numbers. Levels 70–79 now have a complete fixed solo entry, replacing the earlier review-only extension.

## Solo defending troops

Keep the previous draft's 1,000,000-troop maximum at level 79 and preserve existing levels 1–10. Ease the middle of the curve: level 20 falls from 10,000 to 5,000 defenders, level 40 from 100,000 to 50,000, and level 60 from 325,702 to 232,361. All levels 11–78 become easier while their Gold, XP and drop chances stay identical to the previous draft. This reduces the time needed to replace troop losses without changing the requested one-fifth reward formulas.

| Level anchor | Draft defending troops |
| ---: | ---: |
| 1 | 100 |
| 10 | 885 |
| 20 | 5,000 |
| 40 | 50,000 |
| 79 | 1,000,000 |

Use each anchor exactly. Between adjacent anchors `(a, A)` and `(b, B)` above level 10, use `floor(A * (B / A) ** ((L - a) / (b - a)))`. Levels 1–10 retain the source Marauder module's values. Freeze all resulting integers in the level table. The source release's level-79 count is 10,000,000, so the approved maximum remains 90% lower than that source value. No live NPC has been changed.

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
| 11 | 1,052 | 93 | 1,127 | 9.85% |
| 12 | 1,251 | 116 | 1,327 | 10.73% |
| 13 | 1,487 | 143 | 1,543 | 11.62% |
| 14 | 1,769 | 175 | 1,777 | 12.50% |
| 15 | 2,103 | 213 | 2,028 | 13.38% |
| 16 | 2,501 | 258 | 2,296 | 14.27% |
| 17 | 2,974 | 314 | 2,581 | 15.15% |
| 18 | 3,536 | 375 | 2,884 | 16.04% |
| 19 | 4,205 | 449 | 3,204 | 16.92% |
| 20 | 5,000 | 537 | 3,542 | 17.81% |
| 21 | 5,610 | 640 | 3,897 | 18.69% |
| 22 | 6,294 | 757 | 4,270 | 19.58% |
| 23 | 7,062 | 896 | 4,660 | 20.46% |
| 24 | 7,924 | 1,056 | 5,068 | 21.35% |
| 25 | 8,891 | 1,243 | 5,493 | 22.23% |
| 26 | 9,976 | 1,464 | 6,043 | 23.12% |
| 27 | 11,193 | 1,713 | 6,647 | 24% |
| 28 | 12,559 | 2,008 | 7,312 | 24.88% |
| 29 | 14,091 | 2,347 | 8,043 | 25.77% |
| 30 | 15,811 | 2,740 | 8,847 | 26.65% |
| 31 | 17,740 | 3,191 | 9,732 | 27.54% |
| 32 | 19,905 | 3,712 | 10,705 | 28.42% |
| 33 | 22,334 | 4,315 | 11,776 | 29.31% |
| 34 | 25,059 | 5,013 | 12,954 | 30.19% |
| 35 | 28,117 | 5,813 | 14,249 | 31.08% |
| 36 | 31,547 | 6,731 | 15,674 | 31.96% |
| 37 | 35,397 | 7,784 | 17,241 | 32.85% |
| 38 | 39,716 | 9,005 | 18,966 | 33.73% |
| 39 | 44,562 | 10,398 | 20,862 | 34.62% |
| 40 | 50,000 | 12,002 | 22,948 | 35.50% |
| 41 | 53,992 | 13,840 | 25,243 | 36.38% |
| 42 | 58,302 | 15,937 | 27,768 | 37.27% |
| 43 | 62,957 | 18,349 | 30,545 | 38.15% |
| 44 | 67,984 | 21,116 | 33,599 | 39.04% |
| 45 | 73,412 | 24,273 | 36,959 | 39.92% |
| 46 | 79,273 | 27,885 | 40,655 | 40.81% |
| 47 | 85,602 | 32,014 | 44,721 | 41.69% |
| 48 | 92,437 | 36,738 | 49,193 | 42.58% |
| 49 | 99,817 | 42,137 | 54,112 | 43.46% |
| 50 | 107,787 | 48,288 | 59,523 | 44.35% |
| 51 | 116,393 | 55,670 | 65,476 | 45.23% |
| 52 | 125,686 | 65,402 | 72,023 | 46.12% |
| 53 | 135,720 | 77,474 | 79,226 | 47% |
| 54 | 146,556 | 92,211 | 87,148 | 47.88% |
| 55 | 158,258 | 109,993 | 95,863 | 48.77% |
| 56 | 170,893 | 131,299 | 105,449 | 49.65% |
| 57 | 184,537 | 156,750 | 115,994 | 50.54% |
| 58 | 199,271 | 186,994 | 127,594 | 51.42% |
| 59 | 215,181 | 222,843 | 140,353 | 52.31% |
| 60 | 232,361 | 265,185 | 154,389 | 53.19% |
| 61 | 250,913 | 315,101 | 169,828 | 54.08% |
| 62 | 270,947 | 373,804 | 186,810 | 54.96% |
| 63 | 292,579 | 442,716 | 205,491 | 55.85% |
| 64 | 315,939 | 523,447 | 226,041 | 56.73% |
| 65 | 341,164 | 617,870 | 248,645 | 57.62% |
| 66 | 368,403 | 728,178 | 273,509 | 58.50% |
| 67 | 397,816 | 856,799 | 300,860 | 59.38% |
| 68 | 429,578 | 1,006,615 | 330,946 | 60.27% |
| 69 | 463,876 | 1,180,872 | 364,041 | 61.15% |
| 70 | 500,913 | 1,383,329 | 400,445 | 62.04% |
| 71 | 540,906 | 1,618,274 | 440,490 | 62.92% |
| 72 | 584,092 | 1,890,702 | 484,539 | 63.81% |
| 73 | 630,727 | 2,206,170 | 532,993 | 64.69% |
| 74 | 681,084 | 2,571,209 | 586,292 | 65.58% |
| 75 | 735,463 | 2,993,242 | 644,921 | 66.46% |
| 76 | 794,183 | 3,480,661 | 709,414 | 67.35% |
| 77 | 857,591 | 4,043,230 | 780,355 | 68.23% |
| 78 | 926,062 | 4,691,949 | 858,391 | 69.12% |
| 79 | 1,000,000 | 5,439,559 | 944,230 | 70% |

## Revised boss draft for levels 80 through 100

Bosses remain in Core maps. Use five players including the leader as the balance reference, with two to five unique clan members allowed to launch. Other rally types and their limits remain unchanged. These approved rules supersede the earlier brainstorm for version-2 spawns only.

### Fixed five-player defenders

Start at five times the level-79 solo's one-million defenders and grow smoothly to 40 million at level 100:

`bossDefenders[L] = floor(5000000 * 8 ** ((L - 80) / 20))`

Use the exact endpoints 5,000,000 and 40,000,000. The upper end is eight times the entry boss, replacing the prior sixteen-fold curve ending at 80 million. Actual party size, player level, equipment and bonuses never rescale the configured boss. Two to four players face the same full-strength defenders; fewer players must carry more of the fight. An equal five-way defender reference is D / 5, not a requirement to send exactly that many troops.

### Gold, XP and fixed level lookup

Retain the 25% Gold premium per configured defender over the level-79 solo:

`bossGold[L] = floor(5439559 * bossDefenders[L] * 5 / 4000000)`

Change boss XP to five reference players each earning one quarter of the full same-level Hero requirement:

`bossXP[L] = floor(5 * getXpRequiredForLevel(L) / 4)`

Compute both pools with integer arithmetic and freeze the level values below. These are one-time reference calculations, not dependencies on players' current levels, production or XP-bar progress. Gold remains proportional to the full-strength combat burden; XP no longer grows from 22.7% to 54.1% of the matching Hero requirement per equal contributor. Five equal contributors receive approximately 25% each, subject only to integer remainder allocation. Solo XP stays at approximately 20% of its same-level requirement.

Gold and XP are shared totals. Divide each by departure-snapshotted effective attack power using deterministic largest-remainder allocation; the leader gets no extra share. The approved NPC XP-cap exemption remains necessary to deliver these fixed shares and is not a change to other battle types. A smaller winning party divides the same pools: the 25% comparison is for five equal contributors, not a universal cap per player. Two equal contributors receive approximately 62.5% of the same-level requirement each, reflecting the greater individual burden. More members cannot increase the Gold/XP pool.

| Boss level | Defending troops | Total Gold pool | Total XP pool | Consumable chance per player | Any Gear Box chance per player |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 80 | 5,000,000 | 33,997,243 | 6,491,581 | 80% | 60% |
| 81 | 5,547,847 | 37,722,301 | 7,140,740 | 81% | 61.5% |
| 82 | 6,155,722 | 41,855,516 | 7,854,813 | 82% | 63% |
| 83 | 6,830,201 | 46,441,601 | 8,640,295 | 83% | 64.5% |
| 84 | 7,578,582 | 51,530,179 | 9,504,325 | 84% | 66% |
| 85 | 8,408,964 | 57,176,319 | 10,454,757 | 85% | 67.5% |
| 86 | 9,330,329 | 63,441,093 | 11,500,232 | 86% | 69% |
| 87 | 10,352,649 | 70,392,306 | 12,650,256 | 87% | 70.5% |
| 88 | 11,486,983 | 78,105,152 | 13,915,281 | 88% | 72% |
| 89 | 12,745,606 | 86,663,094 | 15,306,810 | 89% | 73.5% |
| 90 | 14,142,135 | 96,158,722 | 16,837,491 | 90% | 75% |
| 91 | 15,691,681 | 106,694,780 | 18,521,240 | 91% | 76.5% |
| 92 | 17,411,011 | 118,385,276 | 20,373,365 | 92% | 78% |
| 93 | 19,318,726 | 131,356,687 | 22,410,701 | 93% | 79.5% |
| 94 | 21,435,469 | 145,749,372 | 24,651,771 | 94% | 81% |
| 95 | 23,784,142 | 161,719,054 | 27,116,948 | 95% | 82.5% |
| 96 | 26,390,158 | 179,438,526 | 29,828,643 | 96% | 84% |
| 97 | 29,281,713 | 199,099,506 | 32,811,507 | 97% | 85.5% |
| 98 | 32,490,095 | 220,914,735 | 36,092,658 | 98% | 87% |
| 99 | 36,050,018 | 245,120,249 | 39,701,923 | 99% | 88.5% |
| 100 | 40,000,000 | 271,977,950 | 43,672,116 | 100% | 90% |

With five equal contributors, level 80 awards each 6,799,448 Gold and 1,298,316 XP before remainders; three members receive one additional Gold and one receives one additional XP. At level 100 each receives 54,395,590 Gold and 8,734,423 XP, with one additional XP assigned once. Those are shares, not additional rewards on top of the pools.

### Participation and contribution limits

Replace the earlier 5%-of-defense minimum and universal 70% maximum with these approved launch requirements. Let D be configured full-strength defense, S the assembled rally's total effective attack power, and P one member's effective attack power:

- Two to five unique clan members including the leader, with inbound and assembled members sharing the same five reserved slots.
- Every participant supplies at least 10% of D and at least 10% of S: `10 * P >= D` and `10 * P >= S`.
- No member exceeds the party-size maximum below. All comparisons use exact integer arithmetic and departure combat bonuses.

| Assembled players | Maximum attack share from one player | Example accepted shares |
| ---: | ---: | --- |
| 2 | 70% | 70 / 30 |
| 3 | 55% | 55 / 30 / 15 |
| 4 | 45% | 45 / 25 / 15 / 15 |
| 5 | 40% | 40 / 15 / 15 / 15 / 15 |

The examples meet share limits; each must also meet the full-defense floor and have enough combined power to win. Equal contributions are allowed for every party size. A five-member 70 / 7.5 / 7.5 / 7.5 / 7.5 group fails; token contributions also fail. Larger troop counts do not bypass the relative minimum.

Show current and required power, each member's share, forecast casualties and reward estimates before launch. Joins, withdrawals or troop edits can change the minimum share and maximum allowed share; update readiness immediately and explain who needs to adjust. Validate membership, slots, both minimums and the maximum atomically before stamina spending. Do not silently remove anyone or reduce their army. Known losing forecasts remain clearly warned rather than making contribution eligibility a promise of victory. Lock eligibility and reward weights with the departure snapshot; settlement cannot disqualify an accepted member because of casualties or later equipment changes. Existing cancellation, recall, refund and departure-snapshot rules otherwise apply.

### Consumables and Gear Boxes are separate rewards

Solos retain one consumable roll and no Gear Boxes. For bosses, each qualifying participant has one consumable roll with chance L% for levels 80–100, stored as `itemChanceBps[L] = 100 * L`. Keep the six existing consumable weights. Level 100 guarantees one consumable per participant. At most five consumables can be awarded to a five-player rally.

Keep the requested independent 60–90% Gear Box roll: `gearBoxChanceBps[L] = 6000 + 150 * (L - 80)`. At most one box per qualifying participant, independent of whether a consumable drops. A player can receive both. A boss victory never guarantees a box, even at level 100.

To give higher bosses a modest equipment-quality benefit, use a second, conditional rarity roll only when the box roll succeeds:

`uncommonGivenBoxBps[L] = 50 * (L - 80)`

That is a 0–10% chance to replace the Common Box with one Uncommon Box, increasing by 0.5 percentage points per boss level. It never adds a second box. Common Boxes keep three Level-1 Common pieces; Uncommon Boxes keep one Level-1 Uncommon and two Level-1 Common pieces. Do not change either box's opening rules, invent a new box type, or award Rare/Epic/Legendary equipment directly. The first two chance columns below distinguish the unconditional box roll from the conditional rarity upgrade:

| Boss level | Any Gear Box | Uncommon upgrade if a box drops | Common Box per victory | Uncommon Box per victory | No box |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 80 | 60% | 0% | 60% | 0% | 40% |
| 85 | 67.5% | 2.5% | 65.8125% | 1.6875% | 32.5% |
| 90 | 75% | 5% | 71.25% | 3.75% | 25% |
| 95 | 82.5% | 7.5% | 76.3125% | 6.1875% | 17.5% |
| 100 | 90% | 10% | 81% | 9% | 10% |

At level 100 the mutually exclusive results are 81% Common Box, 9% Uncommon Box and 10% no box. The independent consumable is guaranteed at that level. With five members, level 80 averages three Common Boxes per win; level 100 averages 4.05 Common and 0.45 Uncommon Boxes, still only 4.5 boxes and 13.5 equipment pieces total on average. An individual victory can award at most five boxes in total, not five of each rarity.

An Uncommon Level-1 piece normally takes 32 matching Common Level-1 inputs and 6,010,000 crafting Gold along the full path. Therefore one Uncommon Box represents 34 Common Level-1 material equivalents, although random families/slots make this only a material-count comparison, not guaranteed usable upgrades. The approved level-100 full-party average is 27.45 material equivalents versus nine at level 80. This is stronger than Common-only rewards without matching the eight-fold defender increase entirely through permanent gear. Higher bosses primarily offer more Gold/XP per stamina; easier bosses may remain more efficient for Common pieces per troop lost.

Do not overlook persistent output: twelve successful level-100 fights with sufficient troops and targets would average 1.08 Uncommon Boxes and 32.4 total equipment pieces per participant. This is a theoretical daily-recovery scenario, not observed gameplay or a promised attainable rate. It excludes additional paid-refill/banked-stamina hunts. The modest rarity chance still materially expands the previous Daily Login-only Uncommon Box source under the owner’s October 19 approval; there is no new daily drop cap.

### Full-strength bosses after a failed rally

Use this approved boss-only recovery rule: after a failed, non-canceled combat, restore that same boss to its configured full-strength defenders atomically with settlement before another arrival resolves. Keep the actual combat losses in the failed rally's report, explain the boss recovery, and award that failed attempt no loot. Preserve the boss's identity, level and reward configuration. Scouts, canceled marches and retries cannot cause a separate heal or modify a different spawn.

This makes every new successful boss attempt pay the full combat risk instead of allowing a different clan or a token follow-up army to collect the full pool from a nearly defeated boss. Do not add exclusive clan claims or historical damage payouts in this version. Failed solo attacks continue to leave surviving defenders. Defeated bosses still use the existing 30-minute respawn delay. A later army finding the boss already defeated follows the existing unavailable-target return/refund rules.

This deliberately changes the Master Specification's persistent boss wounds. It also means an underpowered clan cannot chip down a boss over several losing attempts. Show the rule in scouting, rally preparation and the defeat report. The owner approved this tradeoff with the complete package on October 19.

## Offline combat and economy checks

The October 19 analysis executed the repository's extracted NPC combat calculation and rally-loss allocation in an isolated process, without loading the server or connecting to the database. It covered all 100 drafted levels with four attack/recovery profiles and three attacking-force sizes: 1,200 arithmetic scenarios. The profiles use +0% attack / 0% recovery, +50% / 24%, +100% / 50%, and the +200% / 90% cap stress case. This checks the proposed numbers against current combat math; it is not a live gameplay, networking, migration or fairness test.

For a successful wall-free NPC attack, gross losses are approximately `0.68 * defenders / attackPowerPerTroop`, subject to the existing floors and minimum-survivor behavior. More troops at unchanged combat bonuses mostly reduce the percentage lost; they do not materially reduce the absolute losses. Recovery then returns its configured fraction. Preserve this combat rule for all targets rather than quietly adding special damage or recovery bonuses to this balance change.

The following synthetic comparison assumes five nearly equal armies whose total raw troops equal the boss defenders, and each player owning 30 cities all at the boss's level with base troop production. It excludes production skills/gear, mixed city levels, travel time, army availability and other wars. Base means no attack or recovery bonuses; Trained means +50% attack and 24% recovery; Veteran means +100% attack and 50% recovery. Each cell is approximately one player's net troop loss followed by replacement hours; rounding can differ by one troop among participants.

| Boss level | Base loss / replacement hours | Trained loss / replacement hours | Veteran loss / replacement hours |
| ---: | ---: | ---: | ---: |
| 80 | 544,000 / 1.26 h | 275,627 / 0.64 h | 136,000 / 0.31 h |
| 90 | 1,538,665 / 3.07 h | 779,590 / 1.56 h | 384,666 / 0.77 h |
| 100 | 4,352,000 / 7.62 h | 2,205,014 / 3.86 h | 1,088,000 / 1.91 h |

At level 100 the trained case replaces about 2.21M troops in 3.86 hours; the veteran case replaces about 1.09M in 1.91 hours. The latter is close to the two-hour natural stamina cost of one hunt, but this is an illustrative economy target, not evidence that the current player population has that production or equipment. Fewer/lower-level cities take longer. Compare actual consenting test accounts and mixed clan forces before approving the endpoint.

The solo revision also halves gross losses at levels 20 and 40. With no bonuses and one same-level city's base production, replacing those losses takes about 1.01 hours at 20 and 4.41 hours at 40, versus 2.01 and 8.83 previously. Multiple cities reduce that time. Level 79 retains the previous one-million-defender endpoint; solo Gold, XP and item odds are unchanged at every level.

## Review and eventual implementation boundaries

The revised package preserves the requested solo formulas and drop endpoints while trading lower defenders for a controlled boss XP curve and stricter participation. Remaining review points are actual troop replacement times, low-level Heroes earning large fixed NPC XP and level-up rewards, unequal clan composition, persistent equipment growth and the loss of boss attrition tactics. The XP exemption, two-to-five boss limit, personal loot, NPC Gear Box sources including Uncommon, and failed-boss recovery differ from the current Master Specification; the October 19 Master Specification amendment confirms these differences for version 2 while retaining version-1 compatibility.

For the approved package, use immutable versioned NPC balance values on new/replacement spawns. Do not rewrite existing NPCs or armies in flight: their defender counts, XP rules, loot rules and failed-battle behavior must remain consistent with their recorded version through settlement. Preserve server-owned random rolls and atomic once-only grants; retries must not reroll a box, rarity or consumable, duplicate rewards, heal a later spawn or change credited shares. Existing inventory limits must retain awards safely when immediate opening is unavailable. Implementation is authorized. Ready pull requests may merge under the owner’s standing approval. Protected backend installation and production-data changes still require their applicable authorization; no bulk NPC rewrite or new database backup is part of this release.

## Sources and verification

The calculation source remains repository base `439e9083b87c6a3f5d29e205ef64706270b3bee7`:

- [Server](../functions/index.js): Hero requirements, current XP caps, wall-free NPC combat, departure snapshots, casualty allocation/recovery and settlement.
- [Client](../game.js): matching Hero XP requirements verified during the earlier draft.
- [Economy configuration](../functions/economy-config.json) and [battle guide calculator](../battle-guide-calculations.js): same-level city costs and synthetic base troop production.
- [Marauder rules](../functions/marauder-rules.js): preserved levels 1–10, six-item pool and deterministic integer pool allocation.
- [Common Gear](../functions/common-gear.js) and [Master Specification](CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md): existing box contents, two-input progression, crafting costs, rarity caps and current gameplay rules.

All 79 solo Gold/XP/item entries preserve the prior draft and match their calculation sources. Defenders increase at every level, preserve 1–10 and 79, and are lower at every level 11–78. All 21 boss rows have increasing positive integer defenders, Gold and XP, exact 5M/40M endpoints, approximately 25% matching-level Hero XP per equal five-way share, preserved 80–100% consumables and 60–90% box odds. The 0–10% conditional Uncommon curve, mutually exclusive box outcomes, expected piece/material counts and five-box maximum were checked separately.

Offline calculations covered 1,200 current-combat scenarios, reward-pool conservation for equal two-to-five parties and an unequal five-person party, and accepted/rejected contribution examples. That earlier arithmetic-only revision did not edit runtime code or deploy anything. Implementation validation is recorded separately in the pull request. Earlier installed-source comparisons remain historical; these calculations do not claim a fresh production audit or prove live gameplay balance.
