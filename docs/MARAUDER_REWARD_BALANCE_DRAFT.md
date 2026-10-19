# Marauder reward balance draft

Gold is the first part of the proposed reward rebalance. Keep this draft local until the full reward package is drafted and approved for publication. This document does not change runtime rewards or the approved Master Specification.

## Gold formula

For a Marauder at level L, award one fifth of the standard Gold cost to upgrade a regular city from level L to L + 1, rounded down to whole Gold:

`Gold = floor(standardCityUpgradeCost(L) / 5)`

For example, a level 20 Marauder references the level 20 to 21 city upgrade. Use the price before player skill, equipment or other discounts so each level has the same reward for every player. This current-level interpretation, undiscounted reference and rounding are draft assumptions for review. The requested one-fifth relationship replaces the existing geometric Gold anchors if the complete package is later approved.

The main table covers the previously requested levels 1–69. Levels 70–79 are an extension for review only; applying the formula to that range is still pending. Bosses at levels 80–100 are outside this draft. XP, item drops, stamina, defenders and combat are unchanged.

## Balance effect

Level 1 falls from 100 to 5 Gold and level 20 falls from 5,000 to 537 Gold. Level 69 falls from 1,488,175 to 1,180,872 Gold. Five wins provide approximately one standard same-level city upgrade; rounding can leave a shortfall of up to four Gold. These totals exclude troop losses, other income and player upgrade discounts.

## Levels 1 through 69

All amounts below are whole Gold. The city cost is for the listed level to the next level.

| Marauder level | City upgrade cost | Current Gold | Draft Gold | Change |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 28 | 100 | 5 | -95.0% |
| 2 | 37 | 122 | 7 | -94.3% |
| 3 | 52 | 150 | 10 | -93.3% |
| 4 | 74 | 185 | 14 | -92.4% |
| 5 | 101 | 227 | 20 | -91.2% |
| 6 | 133 | 279 | 26 | -90.7% |
| 7 | 177 | 343 | 35 | -89.8% |
| 8 | 229 | 422 | 45 | -89.3% |
| 9 | 295 | 519 | 59 | -88.6% |
| 10 | 371 | 637 | 74 | -88.4% |
| 11 | 467 | 783 | 93 | -88.1% |
| 12 | 584 | 962 | 116 | -87.9% |
| 13 | 717 | 1,183 | 143 | -87.9% |
| 14 | 877 | 1,453 | 175 | -88.0% |
| 15 | 1,068 | 1,785 | 213 | -88.1% |
| 16 | 1,293 | 2,194 | 258 | -88.2% |
| 17 | 1,570 | 2,695 | 314 | -88.3% |
| 18 | 1,876 | 3,312 | 375 | -88.7% |
| 19 | 2,245 | 4,069 | 449 | -89.0% |
| 20 | 2,685 | 5,000 | 537 | -89.3% |
| 21 | 3,202 | 5,610 | 640 | -88.6% |
| 22 | 3,785 | 6,294 | 757 | -88.0% |
| 23 | 4,482 | 7,062 | 896 | -87.3% |
| 24 | 5,282 | 7,924 | 1,056 | -86.7% |
| 25 | 6,216 | 8,891 | 1,243 | -86.0% |
| 26 | 7,324 | 9,976 | 1,464 | -85.3% |
| 27 | 8,568 | 11,193 | 1,713 | -84.7% |
| 28 | 10,042 | 12,559 | 2,008 | -84.0% |
| 29 | 11,737 | 14,091 | 2,347 | -83.3% |
| 30 | 13,702 | 15,811 | 2,740 | -82.7% |
| 31 | 15,959 | 17,740 | 3,191 | -82.0% |
| 32 | 18,563 | 19,905 | 3,712 | -81.4% |
| 33 | 21,575 | 22,334 | 4,315 | -80.7% |
| 34 | 25,065 | 25,059 | 5,013 | -80.0% |
| 35 | 29,067 | 28,117 | 5,813 | -79.3% |
| 36 | 33,658 | 31,547 | 6,731 | -78.7% |
| 37 | 38,920 | 35,397 | 7,784 | -78.0% |
| 38 | 45,026 | 39,716 | 9,005 | -77.3% |
| 39 | 51,992 | 44,562 | 10,398 | -76.7% |
| 40 | 60,011 | 50,000 | 12,002 | -76.0% |
| 41 | 69,201 | 56,100 | 13,840 | -75.3% |
| 42 | 79,685 | 62,946 | 15,937 | -74.7% |
| 43 | 91,745 | 70,626 | 18,349 | -74.0% |
| 44 | 105,583 | 79,244 | 21,116 | -73.4% |
| 45 | 121,366 | 88,913 | 24,273 | -72.7% |
| 46 | 139,428 | 99,763 | 27,885 | -72.0% |
| 47 | 160,074 | 111,936 | 32,014 | -71.4% |
| 48 | 183,690 | 125,594 | 36,738 | -70.7% |
| 49 | 210,685 | 140,919 | 42,137 | -70.1% |
| 50 | 241,440 | 158,113 | 48,288 | -69.5% |
| 51 | 278,352 | 177,406 | 55,670 | -68.6% |
| 52 | 327,013 | 199,053 | 65,402 | -67.1% |
| 53 | 387,370 | 223,341 | 77,474 | -65.3% |
| 54 | 461,055 | 250,593 | 92,211 | -63.2% |
| 55 | 549,966 | 281,170 | 109,993 | -60.9% |
| 56 | 656,498 | 315,478 | 131,299 | -58.4% |
| 57 | 783,750 | 353,972 | 156,750 | -55.7% |
| 58 | 934,974 | 397,164 | 186,994 | -52.9% |
| 59 | 1,114,217 | 445,625 | 222,843 | -50.0% |
| 60 | 1,325,925 | 500,000 | 265,185 | -47.0% |
| 61 | 1,575,508 | 564,418 | 315,101 | -44.2% |
| 62 | 1,869,020 | 637,137 | 373,804 | -41.3% |
| 63 | 2,213,580 | 719,224 | 442,716 | -38.4% |
| 64 | 2,617,238 | 811,888 | 523,447 | -35.5% |
| 65 | 3,089,350 | 916,490 | 617,870 | -32.6% |
| 66 | 3,640,890 | 1,034,569 | 728,178 | -29.6% |
| 67 | 4,283,998 | 1,167,860 | 856,799 | -26.6% |
| 68 | 5,033,077 | 1,318,325 | 1,006,615 | -23.6% |
| 69 | 5,904,362 | 1,488,175 | 1,180,872 | -20.6% |

## Levels 70 through 79 for review

These rows show the same formula beyond the original requested range. They are not an approved scope extension.

| Marauder level | City upgrade cost | Current Gold | Draft Gold | Change |
| ---: | ---: | ---: | ---: | ---: |
| 70 | 6,916,648 | 1,679,909 | 1,383,329 | -17.7% |
| 71 | 8,091,374 | 1,896,345 | 1,618,274 | -14.7% |
| 72 | 9,453,510 | 2,140,666 | 1,890,702 | -11.7% |
| 73 | 11,030,852 | 2,416,465 | 2,206,170 | -8.7% |
| 74 | 12,856,049 | 2,727,797 | 2,571,209 | -5.7% |
| 75 | 14,966,211 | 3,079,241 | 2,993,242 | -2.8% |
| 76 | 17,403,309 | 3,475,963 | 3,480,661 | +0.1% |
| 77 | 20,216,150 | 3,923,799 | 4,043,230 | +3.0% |
| 78 | 23,459,748 | 4,429,333 | 4,691,949 | +5.9% |
| 79 | 27,197,796 | 5,000,000 | 5,439,559 | +8.8% |

## Sources and verification

Calculated from repository base `439e9083b87c6a3f5d29e205ef64706270b3bee7`:

- [City upgrade calculation](../functions/index.js): `getCityUpgradeCost`, `getCityUpgradeTargetHours`, and passive Gold production helpers.
- [Economy configuration](../functions/economy-config.json): the city production and upgrade curves.
- [Current Marauder rewards](../functions/marauder-rules.js): `balance` and Gold anchors.
- [Battle guide calculator](../battle-guide-calculations.js): independent existing implementation used to cross-check every city cost.
- [Master Specification](CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md): Camps and World Objectives, Marauders and Clan Bosses.

All 79 calculations agree with the extracted server functions and the existing battle guide calculator. The relevant installed server functions, constants, economy configuration and Marauder reward module match the repository inputs. All proposed amounts are positive, strictly increase with level, and satisfy the one-fifth rule with whole-Gold rounding.
