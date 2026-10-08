# Persistent estate — arithmetic and timing review

PROPOSED values; no live player data. Reproduce with node tools/validate-estate-economy-draft.js --write. Previous seasonal rebuilding and all-twenty completion estimates are superseded.

## Focused building reference

Each row runs one building from L1 to L100 with one available construction slot, affordable Gold, zero starting materials, immediate voluntary deposits and 50% of each resource's net production. The Builders' Yard uses its own completed level for its self-upgrade discount; other rows compare Yard 1 and 100. Supporting production/storage uses the fixed band reference level (13 / 38 / 63 / 88). That infrastructure is an external assumption: these runs do not build or pay for it. Ten-minute ticks preserve stock through construction and season boundaries. Gathering continues during timers and reference storage caps apply. The other 50% is outside this model. No quests, Crown deliveries, missed visits or competing projects are modeled.

The working timer proposal treats the 1 / 3 / 6 / 10 seasons as approximate total progression targets. This checks the combined collection/construction effect, not two durations added together. Rounding and the final construction step can finish slightly beyond a nominal boundary. Exact timer allocation is proposed; a fixed resource bill is not a calendar lock.

| Building | L25 days | L50 days | L75 days | L100 days | L100 with Builders 100 |
|---|---:|---:|---:|---:|---:|
| Great Hall | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Treasury | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Barracks | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Gatehouse | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Royal Stables | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Alehouse | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Guild Master | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Forester’s Lodge | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Quarry | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Mine | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Farmstead | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Storehouse | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Granary | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Sawmill | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Smithy | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Workshop | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Windmill | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Builders’ Yard | 30.24 | 90.57 | 180.88 | 301.16 | 301.16 |
| Wagon Yard | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |
| Market | 30.26 | 90.65 | 181.08 | 301.53 | 301.08 |

## Checks

- All twenty registry buildings persist. First-build prerequisites are acyclic, and Level 1 is Gold-only.
- All 100 levels have positive whole nondecreasing material/Gold bills and timers. Individual bills sum exactly to band totals; inputs enter at their stated levels.
- Each band matches its 1 / 2 / 3 / 4-season resource budget within 0.001 season of rounding. Combined focused timing stays within two days of each nominal cumulative target.
- Factory input/output conservation holds at all 100 matched levels. Matched storage retains at least 24 hours of gross Timber/Grain; uneven infrastructure still requires testing.
- Draft ledger fixtures for all twenty sites cover partial deposits, costs above starter storage, invalid/insufficient/excess amounts, atomic rejection, replayed receipts, stale-generation writes, retained loose stocks, deposits, champions and expeditions, retained funded jobs and once-only completion. These are design fixtures, not implemented backend tests.

## Limits and next validation

- Supporting infrastructure is not free. Twenty buildings cannot each independently spend the same 50% of an account's production. Projects share stocks and construction slots; no completion date for the full twenty-building estate is claimed.
- The production references assume a developed supply chain. A building supplied by weaker factories takes longer; saved advanced factories and stockpiles can fund a lower building faster. Prices never chase player income.
- Bootstrap, Gold competition, the Hall ceiling, actual visits, storage congestion, unused feedstocks, quests and paid supply concentration require a combined account simulation and playtesting. Table rows are individual reference tracks, not fresh-account promises.
- All estate queues, stocks, expedition rewards, recovery deadlines, shop receipts and limits carry. Migration must settle elapsed work once; it must not reset daily allowances or refresh recruitment. World Gold, world cities and Hero progression retain their existing realm reset rules.
- Persistent factories create veteran advantages. Estate materials and champion expeditions currently propose no direct world troop, wall or city-production bonuses. Officer Gear follows existing rules; cross-season fairness still needs review.
- Champion XP pacing may be too fast for this building horizon. Existing two-copy Gear progression requires 1,048,576 Common L1 equivalents per Legendary L1 item. Slower buildings do not solve acquisition or champion balance.
- Arithmetic and draft persistence checks pass. Full gameplay balance and production persistence are not implemented or validated by this document.
