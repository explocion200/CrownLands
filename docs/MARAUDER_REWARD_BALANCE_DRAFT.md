# Marauder reward balance draft

This draft covers proposed Gold and Hero XP rewards, defending troops and item-drop chances for Marauder levels 1–69. Keep this draft local until the full reward package is drafted and approved for publication. This document does not change runtime rewards or the approved Master Specification.

## Fixed values by Marauder level

Each Marauder level from 1 through 69 has one fixed set of full-strength defending troops, Gold, XP and item-drop chance, as listed below. The listed numbers are the draft balance values. Use a level lookup; do not recalculate them from the attacking player's level, XP bar, city levels, production, skills, equipment or bonuses. Future edits to city upgrade costs or Hero XP requirements must not automatically change these Marauder values. Changing them requires a deliberate balance revision.

A successful solo hunt awards the listed Gold and XP once, regardless of the player's Hero level. For this drafted range, do not apply the recipient-level battle XP cap to the Marauder XP payout. This supersedes the previous draft's cap-retention assumption and would replace the Master Specification's current Marauder-cap rule for levels 1–69 when the complete package is implemented. Other battles, levels 70–79 and bosses retain their current rules pending their own decisions.

Troops means the enemy's full-strength starting defenders, not troops awarded to the player. Preserve surviving defender losses after failed attacks; the fixed starting count applies to fresh spawns. Failed or canceled hunts do not award these victory rewards. The existing item pool and item-selection weights, stamina, ordinary combat mechanics and Hero level-up rewards remain unchanged. The item-drop frequency is drafted below.

## Gold calculation used for this draft

The fixed Gold values were calculated once as one fifth of the standard Gold cost to upgrade a regular city from level L to L + 1, rounded down to whole Gold:

`Gold = floor(standardCityUpgradeCost(L) / 5)`

For example, a level 20 Marauder references the level 20 to 21 city upgrade. Use the price before player skill, equipment or other discounts so each level has the same reward for every player. These references explain how the fixed values were selected; they are not runtime dependencies. The requested one-fifth relationship replaces the existing geometric Gold anchors if the complete package is later approved.

The main table covers the previously requested levels 1–69. Levels 70–79 are an extension for review only; applying the formula to that range is still pending. Bosses at levels 80–100 are outside this draft. Stamina and combat mechanics are unchanged. The troop, XP and item-drop changes below cover levels 1–69 only.

## XP calculation used for this draft

The fixed XP values were calculated once as one fifth of the XP required for a Hero at level L to advance to L + 1, rounded down to whole XP:

`XP = floor(getXpRequiredForLevel(L) / 5)`

The reference is the full requirement for that single Hero level, not cumulative lifetime XP or the player's remaining XP-bar gap. As with the Gold draft, match the Marauder's level to the reference Hero level. A Marauder's reward stays fixed for all players; Hero level does not increase or decrease the listed payout.

Keep the existing Hero progression curve: through level 25, the requirement is `floor(150 + 65 * L + 35 * L ** 2.05)`; above 25, it is `floor(27469 * 1.1 ** (L - 25))`, subject to the current safe-integer bound. Player levels and stored XP are not changed. This draft replaces the Master Specification's fixed Marauder XP anchors for levels 1–69 only.

The fixed XP payout uses no recipient-level reduction for Marauders 1–69. At the current progression curve, five victories against a Marauder matching the Hero's starting level give approximately that full level's requirement, with at most four XP missing due to rounding. Leveling up does not change that Marauder's payout. A lower-level Hero defeating a higher-level Marauder receives the full listed XP and may gain multiple levels. Existing level-up Gold, troops and skill points still apply and belong in the complete balance review.

## Defending troops

The owner requested a maximum of 1,000,000 defending troops at level 69. For this draft, preserve the existing level 1–40 counts and stretch the geometric growth from 100,000 at level 40 to 1,000,000 at level 69. This proposed interpolation keeps early opponents unchanged and makes later levels increase steadily without reaching the cap early.

| Level anchor | Draft defending troops |
| ---: | ---: |
| 1 | 100 |
| 20 | 10,000 |
| 40 | 100,000 |
| 69 | 1,000,000 |

For levels 41–68, use `floor(100000 * 10 ** ((level - 40) / 29))`; level 69 is exactly 1,000,000. Levels 1–40 retain the current geometric interpolation between their anchors. The cap applies to full-strength counts within this drafted level 1–69 range. Level 70–79 troop balancing and boss balancing remain pending; no population level range is changed.

This replaces the Master Specification's current level-60 anchor of 1,000,000 defenders within the draft. The live level-69 count is 2,976,351; the proposed 1,000,000 is approximately 66.4% lower. The Master Specification and runtime remain unchanged until the complete package is ready.

## Item-drop chance

The owner specified a 69% chance of an item drop at Marauder level 69. The proposed intermediate curve is one percentage point per level: level 1 is 1%, level 20 is 20%, and level 69 is 69%. Treat this level-based progression as part of the draft for review; only the level-69 endpoint was explicitly specified. Store the listed chance with the fixed values for each level.

For drafted levels 1–69, `itemDropChance = level / 100`. Each successful hunt has one chance to drop at most one item. Level 69 therefore has a 69% chance of exactly one item and a 31% chance of no item. Chances do not depend on the player, the number of troops sent or previous drops. A failed or canceled hunt awards no item. Preserve server-owned random draws and once-only settlement so retries cannot reroll the result or duplicate an item.

This draft replaces the current Master Specification's solo drop curve only for levels 1–69. At level 69, the existing chance is approximately 8.97%; at level 1 it is 2%. Levels 70–79 and bosses retain their current rules pending separate balancing; their eventual transition needs review before the full package is released.

Keep the current weighted consumable pool. A successful drop selects one item using the weights below, rather than rolling separately for every item.

| Item | Share of successful drops | Chance per level 69 victory |
| --- | ---: | ---: |
| War Drums | 35% | 24.15% |
| Veil of Silence | 25% | 17.25% |
| Swift March Order | 18% | 12.42% |
| Royal Tax Decree | 12% | 8.28% |
| Recall Horn | 8% | 5.52% |
| Peace Shield | 2% | 1.38% |

The last column totals 69%; the remaining 31% is no item. Item quantities remain one per successful drop. The player receives the fixed Gold and XP on victory whether or not the item roll succeeds.

## Balance effect

Level 1 falls from 100 to 5 Gold and level 20 falls from 5,000 to 537 Gold. Level 69 falls from 1,488,175 to 1,180,872 Gold. Five wins provide approximately one standard same-level city upgrade; rounding can leave a shortfall of up to four Gold. These totals exclude troop losses, other income and player upgrade discounts.

XP changes from 20 to 50 at level 1, from 500 to 3,542 at level 20, and from 15,434 to 364,041 at level 69. Gold rewards and the previously drafted troop curve remain unchanged.

## Fixed values for levels 1 through 69

All Gold and XP values below are the full victory payout. Defenders are the full-strength spawn count. Item chance is the probability of one item on victory. These values are fixed independently of the attacking player.

| Marauder level | Defending troops | Gold | XP | Item chance |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 100 | 5 | 50 | 1% |
| 2 | 127 | 7 | 84 | 2% |
| 3 | 162 | 10 | 135 | 3% |
| 4 | 206 | 14 | 202 | 4% |
| 5 | 263 | 20 | 284 | 5% |
| 6 | 335 | 26 | 383 | 6% |
| 7 | 428 | 35 | 499 | 7% |
| 8 | 545 | 45 | 631 | 8% |
| 9 | 695 | 59 | 779 | 9% |
| 10 | 885 | 74 | 945 | 10% |
| 11 | 1,128 | 93 | 1,127 | 11% |
| 12 | 1,438 | 116 | 1,327 | 12% |
| 13 | 1,832 | 143 | 1,543 | 13% |
| 14 | 2,335 | 175 | 1,777 | 14% |
| 15 | 2,976 | 213 | 2,028 | 15% |
| 16 | 3,792 | 258 | 2,296 | 16% |
| 17 | 4,832 | 314 | 2,581 | 17% |
| 18 | 6,158 | 375 | 2,884 | 18% |
| 19 | 7,847 | 449 | 3,204 | 19% |
| 20 | 10,000 | 537 | 3,542 | 20% |
| 21 | 11,220 | 640 | 3,897 | 21% |
| 22 | 12,589 | 757 | 4,270 | 22% |
| 23 | 14,125 | 896 | 4,660 | 23% |
| 24 | 15,848 | 1,056 | 5,068 | 24% |
| 25 | 17,782 | 1,243 | 5,493 | 25% |
| 26 | 19,952 | 1,464 | 6,043 | 26% |
| 27 | 22,387 | 1,713 | 6,647 | 27% |
| 28 | 25,118 | 2,008 | 7,312 | 28% |
| 29 | 28,183 | 2,347 | 8,043 | 29% |
| 30 | 31,622 | 2,740 | 8,847 | 30% |
| 31 | 35,481 | 3,191 | 9,732 | 31% |
| 32 | 39,810 | 3,712 | 10,705 | 32% |
| 33 | 44,668 | 4,315 | 11,776 | 33% |
| 34 | 50,118 | 5,013 | 12,954 | 34% |
| 35 | 56,234 | 5,813 | 14,249 | 35% |
| 36 | 63,095 | 6,731 | 15,674 | 36% |
| 37 | 70,794 | 7,784 | 17,241 | 37% |
| 38 | 79,432 | 9,005 | 18,966 | 38% |
| 39 | 89,125 | 10,398 | 20,862 | 39% |
| 40 | 100,000 | 12,002 | 22,948 | 40% |
| 41 | 108,263 | 13,840 | 25,243 | 41% |
| 42 | 117,210 | 15,937 | 27,768 | 42% |
| 43 | 126,896 | 18,349 | 30,545 | 43% |
| 44 | 137,382 | 21,116 | 33,599 | 44% |
| 45 | 148,735 | 24,273 | 36,959 | 45% |
| 46 | 161,026 | 27,885 | 40,655 | 46% |
| 47 | 174,332 | 32,014 | 44,721 | 47% |
| 48 | 188,739 | 36,738 | 49,193 | 48% |
| 49 | 204,335 | 42,137 | 54,112 | 49% |
| 50 | 221,221 | 48,288 | 59,523 | 50% |
| 51 | 239,502 | 55,670 | 65,476 | 51% |
| 52 | 259,294 | 65,402 | 72,023 | 52% |
| 53 | 280,721 | 77,474 | 79,226 | 53% |
| 54 | 303,919 | 92,211 | 87,148 | 54% |
| 55 | 329,034 | 109,993 | 95,863 | 55% |
| 56 | 356,224 | 131,299 | 105,449 | 56% |
| 57 | 385,662 | 156,750 | 115,994 | 57% |
| 58 | 417,531 | 186,994 | 127,594 | 58% |
| 59 | 452,035 | 222,843 | 140,353 | 59% |
| 60 | 489,390 | 265,185 | 154,389 | 60% |
| 61 | 529,831 | 315,101 | 169,828 | 61% |
| 62 | 573,615 | 373,804 | 186,810 | 62% |
| 63 | 621,016 | 442,716 | 205,491 | 63% |
| 64 | 672,335 | 523,447 | 226,041 | 64% |
| 65 | 727,895 | 617,870 | 248,645 | 65% |
| 66 | 788,046 | 728,178 | 273,509 | 66% |
| 67 | 853,167 | 856,799 | 300,860 | 67% |
| 68 | 923,670 | 1,006,615 | 330,946 | 68% |
| 69 | 1,000,000 | 1,180,872 | 364,041 | 69% |

## Levels 70 through 79 for review

These rows show the proposed Gold formula beyond the original requested range. They are not an approved scope extension. Troops in this section are current live counts for reference only; new troop, XP and item-drop curves above level 69 have not been drafted.

| Marauder level | Current troops only | City upgrade cost | Current Gold | Draft Gold | Change |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 70 | 3,359,818 | 6,916,648 | 1,679,909 | 1,383,329 | -17.7% |
| 71 | 3,792,690 | 8,091,374 | 1,896,345 | 1,618,274 | -14.7% |
| 72 | 4,281,332 | 9,453,510 | 2,140,666 | 1,890,702 | -11.7% |
| 73 | 4,832,930 | 11,030,852 | 2,416,465 | 2,206,170 | -8.7% |
| 74 | 5,455,594 | 12,856,049 | 2,727,797 | 2,571,209 | -5.7% |
| 75 | 6,158,482 | 14,966,211 | 3,079,241 | 2,993,242 | -2.8% |
| 76 | 6,951,927 | 17,403,309 | 3,475,963 | 3,480,661 | +0.1% |
| 77 | 7,847,599 | 20,216,150 | 3,923,799 | 4,043,230 | +3.0% |
| 78 | 8,858,667 | 23,459,748 | 4,429,333 | 4,691,949 | +5.9% |
| 79 | 10,000,000 | 27,197,796 | 5,000,000 | 5,439,559 | +8.8% |

## Sources and verification

Calculated from repository base `439e9083b87c6a3f5d29e205ef64706270b3bee7`:

- [City upgrade calculation](../functions/index.js): `getCityUpgradeCost`, `getCityUpgradeTargetHours`, and passive Gold production helpers.
- [Hero XP calculation](../functions/index.js): `getXpRequiredForLevel`, `getBattleXpLevelCapRate`, `capBattleXpForHeroLevel` and the Marauder settlement cap call. The [client progression calculation](../game.js) supplies matching level requirements.
- [Economy configuration](../functions/economy-config.json): the city production and upgrade curves.
- [Current Marauder rewards](../functions/marauder-rules.js): `balance`, Gold/XP/defender anchors, `ITEMS` weights and item selection in `rewards`.
- [Battle guide calculator](../battle-guide-calculations.js): independent existing implementation used to cross-check every city cost.
- [Master Specification](CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md): Camps and World Objectives, Marauders and Clan Bosses.

The 69 fixed Gold values and ten additional Gold calculations for review agree with the source-revision server functions and battle guide calculator. The relevant installed server functions, constants, economy configuration and Marauder reward module match the repository inputs. All proposed Gold amounts are positive, strictly increase with level, and satisfy the one-fifth rule with whole-Gold rounding.

The live troop reference values were verified against the current server reward module and its installed copy. All 69 proposed troop counts are positive whole numbers, increase strictly with level and stay at or below 1,000,000. Levels 1–40 are unchanged, and level 69 reaches exactly 1,000,000. Gold calculations are unchanged by this troop revision.

The 69 fixed XP values were verified against matching server/client level requirements and the installed server inputs at the documented source revision. They are positive whole numbers, increase strictly and equal one fifth of those full same-level requirements rounded down. The fixed table preserves every previously drafted troop, Gold and XP number. The cap exemption is a draft policy change only; the live settlement still applies its existing recipient-level cap.

All 69 proposed drop chances equal their Marauder level as a percentage, increase by one percentage point, stay within 0–100%, and end at exactly 69%. The fixed troop, Gold and XP values were preserved. The six existing item weights sum to 100%; their unconditional level-69 probabilities sum to 69%, with 31% no drop. The item pool and its installed copy match. These are draft calculations, not a live drop-system change.
