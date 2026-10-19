# Marauder reward balance draft

This draft covers proposed Gold and Hero XP rewards and defending troops for Marauder levels 1–69. Keep this draft local until the full reward package is drafted and approved for publication. This document does not change runtime rewards or the approved Master Specification.

## Gold formula

For a Marauder at level L, award one fifth of the standard Gold cost to upgrade a regular city from level L to L + 1, rounded down to whole Gold:

`Gold = floor(standardCityUpgradeCost(L) / 5)`

For example, a level 20 Marauder references the level 20 to 21 city upgrade. Use the price before player skill, equipment or other discounts so each level has the same reward for every player. This current-level interpretation, undiscounted reference and rounding are draft assumptions for review. The requested one-fifth relationship replaces the existing geometric Gold anchors if the complete package is later approved.

The main table covers the previously requested levels 1–69. Levels 70–79 are an extension for review only; applying the formula to that range is still pending. Bosses at levels 80–100 are outside this draft. Item drops, stamina and combat mechanics are unchanged. The troop and XP changes below cover levels 1–69 only.

## XP formula

For a Marauder at level L, award one fifth of the XP required for a Hero at level L to advance to L + 1, rounded down to whole XP:

`XP = floor(getXpRequiredForLevel(L) / 5)`

The reference is the full requirement for that single Hero level, not cumulative lifetime XP or the player's remaining XP-bar gap. As with the Gold draft, match the Marauder's level to the reference Hero level. A Marauder's base reward therefore stays fixed for all players; a high-level player does not receive a larger base reward for defeating a level 1 enemy.

Keep the existing Hero progression curve: through level 25, the requirement is `floor(150 + 65 * L + 35 * L ** 2.05)`; above 25, it is `floor(27469 * 1.1 ** (L - 25))`, subject to the current safe-integer bound. Player levels and stored XP are not changed. This draft replaces the Master Specification's fixed Marauder XP anchors for levels 1–69 only.

Keep the existing server-authoritative battle XP cap. It does not reduce this 20% reward for a Hero at the same level as the defeated Marauder. A substantially lower-level Hero may receive less because the existing cap uses the recipient's Hero level. Five victories against the same-level Marauder give approximately one full level's requirement, with at most four XP missing due to rounding; after leveling up, the next Hero requirement is higher. Existing level-up Gold, troops and skill-point rewards still apply and should be included in the complete balance review.

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

## Balance effect

Level 1 falls from 100 to 5 Gold and level 20 falls from 5,000 to 537 Gold. Level 69 falls from 1,488,175 to 1,180,872 Gold. Five wins provide approximately one standard same-level city upgrade; rounding can leave a shortfall of up to four Gold. These totals exclude troop losses, other income and player upgrade discounts.

XP changes from 20 to 50 at level 1, from 500 to 3,542 at level 20, and from 15,434 to 364,041 at level 69. Gold rewards and the previously drafted troop curve remain unchanged.

## Levels 1 through 69

Current and draft troops are full-strength spawn counts; a surviving enemy can have fewer after combat. All monetary amounts are whole Gold. The city cost is for the listed level to the next level.

| Marauder level | Current troops | Draft troops | City upgrade cost | Current Gold | Draft Gold | Gold change |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 100 | 100 | 28 | 100 | 5 | -95.0% |
| 2 | 127 | 127 | 37 | 122 | 7 | -94.3% |
| 3 | 162 | 162 | 52 | 150 | 10 | -93.3% |
| 4 | 206 | 206 | 74 | 185 | 14 | -92.4% |
| 5 | 263 | 263 | 101 | 227 | 20 | -91.2% |
| 6 | 335 | 335 | 133 | 279 | 26 | -90.7% |
| 7 | 428 | 428 | 177 | 343 | 35 | -89.8% |
| 8 | 545 | 545 | 229 | 422 | 45 | -89.3% |
| 9 | 695 | 695 | 295 | 519 | 59 | -88.6% |
| 10 | 885 | 885 | 371 | 637 | 74 | -88.4% |
| 11 | 1,128 | 1,128 | 467 | 783 | 93 | -88.1% |
| 12 | 1,438 | 1,438 | 584 | 962 | 116 | -87.9% |
| 13 | 1,832 | 1,832 | 717 | 1,183 | 143 | -87.9% |
| 14 | 2,335 | 2,335 | 877 | 1,453 | 175 | -88.0% |
| 15 | 2,976 | 2,976 | 1,068 | 1,785 | 213 | -88.1% |
| 16 | 3,792 | 3,792 | 1,293 | 2,194 | 258 | -88.2% |
| 17 | 4,832 | 4,832 | 1,570 | 2,695 | 314 | -88.3% |
| 18 | 6,158 | 6,158 | 1,876 | 3,312 | 375 | -88.7% |
| 19 | 7,847 | 7,847 | 2,245 | 4,069 | 449 | -89.0% |
| 20 | 10,000 | 10,000 | 2,685 | 5,000 | 537 | -89.3% |
| 21 | 11,220 | 11,220 | 3,202 | 5,610 | 640 | -88.6% |
| 22 | 12,589 | 12,589 | 3,785 | 6,294 | 757 | -88.0% |
| 23 | 14,125 | 14,125 | 4,482 | 7,062 | 896 | -87.3% |
| 24 | 15,848 | 15,848 | 5,282 | 7,924 | 1,056 | -86.7% |
| 25 | 17,782 | 17,782 | 6,216 | 8,891 | 1,243 | -86.0% |
| 26 | 19,952 | 19,952 | 7,324 | 9,976 | 1,464 | -85.3% |
| 27 | 22,387 | 22,387 | 8,568 | 11,193 | 1,713 | -84.7% |
| 28 | 25,118 | 25,118 | 10,042 | 12,559 | 2,008 | -84.0% |
| 29 | 28,183 | 28,183 | 11,737 | 14,091 | 2,347 | -83.3% |
| 30 | 31,622 | 31,622 | 13,702 | 15,811 | 2,740 | -82.7% |
| 31 | 35,481 | 35,481 | 15,959 | 17,740 | 3,191 | -82.0% |
| 32 | 39,810 | 39,810 | 18,563 | 19,905 | 3,712 | -81.4% |
| 33 | 44,668 | 44,668 | 21,575 | 22,334 | 4,315 | -80.7% |
| 34 | 50,118 | 50,118 | 25,065 | 25,059 | 5,013 | -80.0% |
| 35 | 56,234 | 56,234 | 29,067 | 28,117 | 5,813 | -79.3% |
| 36 | 63,095 | 63,095 | 33,658 | 31,547 | 6,731 | -78.7% |
| 37 | 70,794 | 70,794 | 38,920 | 35,397 | 7,784 | -78.0% |
| 38 | 79,432 | 79,432 | 45,026 | 39,716 | 9,005 | -77.3% |
| 39 | 89,125 | 89,125 | 51,992 | 44,562 | 10,398 | -76.7% |
| 40 | 100,000 | 100,000 | 60,011 | 50,000 | 12,002 | -76.0% |
| 41 | 112,201 | 108,263 | 69,201 | 56,100 | 13,840 | -75.3% |
| 42 | 125,892 | 117,210 | 79,685 | 62,946 | 15,937 | -74.7% |
| 43 | 141,253 | 126,896 | 91,745 | 70,626 | 18,349 | -74.0% |
| 44 | 158,489 | 137,382 | 105,583 | 79,244 | 21,116 | -73.4% |
| 45 | 177,827 | 148,735 | 121,366 | 88,913 | 24,273 | -72.7% |
| 46 | 199,526 | 161,026 | 139,428 | 99,763 | 27,885 | -72.0% |
| 47 | 223,872 | 174,332 | 160,074 | 111,936 | 32,014 | -71.4% |
| 48 | 251,188 | 188,739 | 183,690 | 125,594 | 36,738 | -70.7% |
| 49 | 281,838 | 204,335 | 210,685 | 140,919 | 42,137 | -70.1% |
| 50 | 316,227 | 221,221 | 241,440 | 158,113 | 48,288 | -69.5% |
| 51 | 354,813 | 239,502 | 278,352 | 177,406 | 55,670 | -68.6% |
| 52 | 398,107 | 259,294 | 327,013 | 199,053 | 65,402 | -67.1% |
| 53 | 446,683 | 280,721 | 387,370 | 223,341 | 77,474 | -65.3% |
| 54 | 501,187 | 303,919 | 461,055 | 250,593 | 92,211 | -63.2% |
| 55 | 562,341 | 329,034 | 549,966 | 281,170 | 109,993 | -60.9% |
| 56 | 630,957 | 356,224 | 656,498 | 315,478 | 131,299 | -58.4% |
| 57 | 707,945 | 385,662 | 783,750 | 353,972 | 156,750 | -55.7% |
| 58 | 794,328 | 417,531 | 934,974 | 397,164 | 186,994 | -52.9% |
| 59 | 891,250 | 452,035 | 1,114,217 | 445,625 | 222,843 | -50.0% |
| 60 | 1,000,000 | 489,390 | 1,325,925 | 500,000 | 265,185 | -47.0% |
| 61 | 1,128,837 | 529,831 | 1,575,508 | 564,418 | 315,101 | -44.2% |
| 62 | 1,274,274 | 573,615 | 1,869,020 | 637,137 | 373,804 | -41.3% |
| 63 | 1,438,449 | 621,016 | 2,213,580 | 719,224 | 442,716 | -38.4% |
| 64 | 1,623,776 | 672,335 | 2,617,238 | 811,888 | 523,447 | -35.5% |
| 65 | 1,832,980 | 727,895 | 3,089,350 | 916,490 | 617,870 | -32.6% |
| 66 | 2,069,138 | 788,046 | 3,640,890 | 1,034,569 | 728,178 | -29.6% |
| 67 | 2,335,721 | 853,167 | 4,283,998 | 1,167,860 | 856,799 | -26.6% |
| 68 | 2,636,650 | 923,670 | 5,033,077 | 1,318,325 | 1,006,615 | -23.6% |
| 69 | 2,976,351 | 1,000,000 | 5,904,362 | 1,488,175 | 1,180,872 | -20.6% |

## XP by level

The Hero requirement is for the listed level to the next level. Draft XP is the base victory award before any recipient-level cap.

| Marauder level | Hero XP needed | Current XP | Draft XP |
| ---: | ---: | ---: | ---: |
| 1 | 250 | 20 | 50 |
| 2 | 424 | 23 | 84 |
| 3 | 677 | 28 | 135 |
| 4 | 1,010 | 33 | 202 |
| 5 | 1,423 | 39 | 284 |
| 6 | 1,918 | 46 | 383 |
| 7 | 2,495 | 55 | 499 |
| 8 | 3,155 | 65 | 631 |
| 9 | 3,899 | 77 | 779 |
| 10 | 4,727 | 91 | 945 |
| 11 | 5,639 | 108 | 1,127 |
| 12 | 6,636 | 128 | 1,327 |
| 13 | 7,719 | 152 | 1,543 |
| 14 | 8,887 | 180 | 1,777 |
| 15 | 10,141 | 214 | 2,028 |
| 16 | 11,482 | 253 | 2,296 |
| 17 | 12,909 | 300 | 2,581 |
| 18 | 14,423 | 356 | 2,884 |
| 19 | 16,024 | 422 | 3,204 |
| 20 | 17,712 | 500 | 3,542 |
| 21 | 19,487 | 541 | 3,897 |
| 22 | 21,351 | 587 | 4,270 |
| 23 | 23,302 | 636 | 4,660 |
| 24 | 25,342 | 689 | 5,068 |
| 25 | 27,469 | 747 | 5,493 |
| 26 | 30,215 | 810 | 6,043 |
| 27 | 33,237 | 878 | 6,647 |
| 28 | 36,561 | 951 | 7,312 |
| 29 | 40,217 | 1,031 | 8,043 |
| 30 | 44,239 | 1,118 | 8,847 |
| 31 | 48,663 | 1,211 | 9,732 |
| 32 | 53,529 | 1,313 | 10,705 |
| 33 | 58,882 | 1,423 | 11,776 |
| 34 | 64,770 | 1,542 | 12,954 |
| 35 | 71,247 | 1,671 | 14,249 |
| 36 | 78,372 | 1,811 | 15,674 |
| 37 | 86,209 | 1,963 | 17,241 |
| 38 | 94,830 | 2,128 | 18,966 |
| 39 | 104,313 | 2,306 | 20,862 |
| 40 | 114,744 | 2,500 | 22,948 |
| 41 | 126,219 | 2,679 | 25,243 |
| 42 | 138,841 | 2,871 | 27,768 |
| 43 | 152,725 | 3,077 | 30,545 |
| 44 | 167,997 | 3,298 | 33,599 |
| 45 | 184,797 | 3,535 | 36,959 |
| 46 | 203,277 | 3,789 | 40,655 |
| 47 | 223,605 | 4,061 | 44,721 |
| 48 | 245,965 | 4,352 | 49,193 |
| 49 | 270,562 | 4,665 | 54,112 |
| 50 | 297,618 | 5,000 | 59,523 |
| 51 | 327,380 | 5,358 | 65,476 |
| 52 | 360,118 | 5,743 | 72,023 |
| 53 | 396,130 | 6,155 | 79,226 |
| 54 | 435,743 | 6,597 | 87,148 |
| 55 | 479,317 | 7,071 | 95,863 |
| 56 | 527,249 | 7,578 | 105,449 |
| 57 | 579,974 | 8,122 | 115,994 |
| 58 | 637,971 | 8,705 | 127,594 |
| 59 | 701,768 | 9,330 | 140,353 |
| 60 | 771,945 | 10,000 | 154,389 |
| 61 | 849,140 | 10,494 | 169,828 |
| 62 | 934,054 | 11,012 | 186,810 |
| 63 | 1,027,459 | 11,556 | 205,491 |
| 64 | 1,130,205 | 12,127 | 226,041 |
| 65 | 1,243,226 | 12,726 | 248,645 |
| 66 | 1,367,549 | 13,355 | 273,509 |
| 67 | 1,504,304 | 14,015 | 300,860 |
| 68 | 1,654,734 | 14,708 | 330,946 |
| 69 | 1,820,207 | 15,434 | 364,041 |

## Levels 70 through 79 for review

These rows show the proposed Gold formula beyond the original requested range. They are not an approved scope extension. Troops in this section are current live counts for reference only; new troop and XP curves above level 69 have not been drafted.

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
- [Current Marauder rewards](../functions/marauder-rules.js): `balance` and Gold anchors.
- [Battle guide calculator](../battle-guide-calculations.js): independent existing implementation used to cross-check every city cost.
- [Master Specification](CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md): Camps and World Objectives, Marauders and Clan Bosses.

All 79 Gold calculations agree with the extracted server functions and the existing battle guide calculator. The relevant installed server functions, constants, economy configuration and Marauder reward module match the repository inputs. All proposed Gold amounts are positive, strictly increase with level, and satisfy the one-fifth rule with whole-Gold rounding.

All 79 current troop counts match the current server reward module and its installed copy. All 69 proposed troop counts are positive whole numbers, increase strictly with level and stay at or below 1,000,000. Levels 1–40 are unchanged, and level 69 reaches exactly 1,000,000. Gold calculations are unchanged by this troop revision.

All 69 XP requirements agree between the server and client. The relevant XP and cap functions and constants match the installed server. Proposed XP rewards are positive whole numbers, increase strictly, and equal one fifth of the full same-level requirement rounded down. Each proposed reward passes the existing cap without reduction for a same-level Hero.
