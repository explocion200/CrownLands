# Approved estate economy — shared-account review

Owner approval: October 8, 2026. Runtime implementation is pending release. This report uses the actual estate rules, not production player data. Regenerate with node tools/validate-estate-reward-review.js --write.

## Rewards at every level

Every one of the 1,980 upgrades changes a usable rule. Actual value depends on supply, demand and player choices; a changed number is not a playtest.

| Building | Changing upgrades | Level 100 benefit |
|---|---:|---|
| Great Hall | 99 | Other buildings may reach Level 100 |
| Treasury | 99 | legendary commissions · 72.0 hours |
| Barracks | 99 | legendary commissions · 72.0 hours |
| Gatehouse | 99 | legendary commissions · 72.0 hours |
| Royal Stables | 99 | legendary commissions · 72.0 hours |
| Alehouse | 99 | legendary recruits · 35.00% faster recovery |
| Guild Master | 99 | Champion Level 100 · 24 active roster |
| Forester’s Lodge | 99 | 1684.00 timber/hour capacity |
| Quarry | 99 | 1347.20 stone/hour capacity |
| Mine | 99 | 1010.40 ore/hour capacity |
| Farmstead | 99 | 1347.20 grain/hour capacity |
| Storehouse | 99 | 180,200 capacity per building material |
| Granary | 99 | 155,400 capacity per food stock |
| Sawmill | 99 | 336.80 planks/hour capacity |
| Smithy | 99 | 269.44 iron/hour capacity |
| Workshop | 99 | 67.36 tools/hour capacity |
| Windmill | 99 | 404.16 food/hour capacity |
| Builders’ Yard | 99 | 3 builders · 30.00% shorter new contracts |
| Wagon Yard | 99 | 81,500 capacity per building material |
| Market | 99 | 61,200 capacity per food stock |

## Shared-account cohorts

Start with the actual six Level 1 buildings, fourteen plots, no materials, 100 Gold and 285 raw Main City Gold/hour. Model Gold restarting at 100 every 30 days while all estate state persists. Earn all supporting producers, storage, Hall levels and builder slots. Settle continuous production exactly at storage/reserve boundaries and construction completions. Every cohort uses the same whole-unit runtime prices and nonrefundable funded queues.

At each visit, fund affordable lowest-target work, prioritizing Hall/sources/processing/storage at ties. When no bill fits, keep one next-level deposit project; no future income is spent automatically. Use all available estate materials for these chosen activities. This is a reproducible policy, not optimal play or a forecast for twenty independently funded buildings.

Services cohorts recruit into the active roster, launch the highest eligible eight-hour quests, choose meals only when affordable/valid, retain recovery/XP/parcel deadlines and collect what fits. Commission cohorts fund selected head-family pieces for all four officers when affordable. Claims stop at the real 2,000-item bag limit; this model does not assume free Gear upgrades or Gold sufficient to pay item fees. Crown cohorts assume an external optional budget of at most 20 Crowns/day, with the actual shared supply allowance, level/preset/source/capacity gates. No recurring purchase is automatic gameplay.

| Visits/day | Optional activities | All 20 built, day | All 25 | All 50 | All 75 | All 100 |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Construction | 4 | 178 | 628 | 1,289 | 2,166 |
| 3 | Construction | 1.33 | 175.67 | 624.67 | 1,286 | 2,163.67 |
| 1 | Quests/meals | 4 | 178 | 623 | 1,273 | 2,130 |
| 3 | Quests/meals | 1.33 | 174 | 611 | 1,245.67 | 2,069.33 |
| 3 | Quests/meals + commissions | 1.33 | 181.33 | 637.33 | 1,303.33 | 2,178.33 |
| 3 | Quests/meals + commissions + Crown supplies | 1.33 | 174.67 | 612 | 1,251.67 | 2,091.67 |

| Cohort | Day 30: lowest / highest | Day 300: lowest / highest | Launched quests | Commissioned pieces claimed | Crowns spent |
|---|---|---|---:|---:|---:|
| 1 | 9 / 13 | 30 / 31 | 0 | 0 | 0 |
| 2 | 10 / 14 | 30 / 31 | 0 | 0 | 0 |
| 3 | 9 / 13 | 30 / 31 | 5228 | 0 | 0 |
| 4 | 10 / 14 | 30 / 31 | 13818 | 0 | 0 |
| 5 | 10 / 13 | 30 / 31 | 14570 | 1946 | 0 |
| 6 | 10 / 12 | 30 / 31 | 13977 | 1869 | 41,840 |

## Interpreting the results

The approved 1/3/6/10-season targets are per-building material equivalents at 50% reference production, with paid supporting infrastructure. They do not promise that a whole estate reaches 100 in ten calendar seasons. The shared Hall gate, competing construction, supply levels, deposits, queues and optional activities change the actual route. These cohorts spend 100% of materials across their selected estate activities; saving half elsewhere takes longer.

Optional commissions intentionally exchange progression speed for permanent Gear. A free player can earn the same resource chains, storage and construction slots. Crown supplies cannot buy rarity gates, extra builders, champions or timer skips; the modeled throughput is shared across stores. Quests add at most 2.17728 normalized resource-hours/day (9.072% of one resource's daily reference output before recovery/rounding), never that amount for every material. Crown supplies add at most one shared hour/day. These caps bound input; they do not prove PvP fairness or optimal bottleneck value.

The champion curve requires 19,800 XP from 1 to 100: at most 28 XP/hour, or 707.14 eligible quest-hours before Guild limits, recovery and party requirements. Recruits start no higher than 10. At a training ceiling, the quote shows only XP that can be retained. Higher quest tiers never lower whole-unit material returns at equal supply/duration, and no Rare+ Tool fee applies.

One officer's eight-slot Legendary Level 5 set needs 128 Legendary Level 1 commissioned pieces after unlock, or 384 commission-days at Level 100, plus the unchanged two-copy upgrade and fixed Gold fees. Inventory space and claiming matter. Full bags retain pending commissions safely; unused materials are never taxed away.

## Release evidence and limits

Unit tests independently compare all 2,000 runtime bills/timers with the reviewed tables and test recipe conservation, reserve/cap boundaries, long-absence partition equivalence, frozen contracts and partial parcels. The estate emulator checks real currency transactions, replay, concurrency, migration, quests, shops and denied client writes. Browser tests exercise desktop and landscape panels, confirmation, retry, camera/selection preservation, Gear round trips and cleanup. Required PR checks and production deployment are separate gates. A physical-device/account playtest remains necessary for pacing and touch feel; mathematical checks alone do not establish player satisfaction.
