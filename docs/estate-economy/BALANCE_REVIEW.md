# Persistent estate — arithmetic and timing review

Approved reference values; no live player data. Reproduce with node tools/validate-estate-economy-draft.js --write. Previous seasonal rebuilding and all-twenty completion estimates are superseded.

## Focused building reference

Each row runs one building from L1 to L100 with one available construction slot, affordable Gold, zero starting materials, immediate voluntary deposits and 50% of each resource's net production. The Builders' Yard uses its own completed level for its self-upgrade discount; other rows compare Yard 1 and 100. Supporting production/storage uses the fixed band reference level (13 / 38 / 63 / 88). That infrastructure is an external assumption: these runs do not build or pay for it. Ten-minute ticks preserve stock through construction and season boundaries. Gathering continues during timers and reference storage caps apply. The other 50% is outside this model. No quests, Crown deliveries, missed visits or competing projects are modeled.

The approved reference treats the 1 / 3 / 6 / 10 seasons as approximate total progression targets. This checks the combined collection/construction effect, not two durations added together. Rounding and the final construction step can finish slightly beyond a nominal boundary. Exact timer allocation is approved; a fixed resource bill is not a calendar lock.

| Building | L25 days | L50 days | L75 days | L100 days | L100 with Builders 100 |
|---|---:|---:|---:|---:|---:|
| Great Hall | 30.31 | 90.68 | 181.12 | 301.57 | 301.10 |
| Treasury | 30.31 | 90.68 | 181.12 | 301.57 | 301.10 |
| Barracks | 30.31 | 90.68 | 181.12 | 301.57 | 301.10 |
| Gatehouse | 30.31 | 90.68 | 181.12 | 301.57 | 301.10 |
| Royal Stables | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Alehouse | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Guild Master | 30.31 | 90.68 | 181.12 | 301.57 | 301.10 |
| Forester’s Lodge | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Quarry | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Mine | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Farmstead | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Storehouse | 30.31 | 90.68 | 181.12 | 301.57 | 301.10 |
| Granary | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Sawmill | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Smithy | 30.31 | 90.68 | 181.12 | 301.57 | 301.10 |
| Workshop | 30.31 | 90.68 | 181.12 | 301.57 | 301.10 |
| Windmill | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Builders’ Yard | 30.28 | 90.59 | 180.91 | 301.18 | 301.18 |
| Wagon Yard | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |
| Market | 30.31 | 90.68 | 181.11 | 301.56 | 301.10 |

## Checks

- All twenty registry buildings persist. First-build prerequisites are acyclic, and Level 1 is Gold-only.
- All 100 levels have positive whole nondecreasing material/Gold bills and timers. Individual bills sum exactly to unchanged band totals; inputs enter at their stated levels. Draft 4 reduces the Level 2 material wait below one hour at half of Level 1 net output; construction still takes at least the original first-build duration.
- Each band matches its 1 / 2 / 3 / 4-season resource budget within 0.001 season of rounding. Combined focused timing stays within two days of each nominal cumulative target.
- Factory input/output conservation holds at all 100 matched levels. Matched storage retains at least 24 hours of gross Timber/Grain; the shared-account review separately exercises uneven infrastructure.
- Draft ledger fixtures for all twenty sites cover partial deposits, costs above starter storage, invalid/insufficient/excess amounts, atomic rejection, replayed receipts, stale-generation writes, retained loose stocks, deposits, champions and expeditions, retained funded jobs and once-only completion. These are design fixtures, not implemented backend tests.

## Limits and next validation

- Supporting infrastructure is not free. Twenty buildings cannot each independently spend the same 50% of an account's production. Projects share stocks and construction slots; no completion date for the full twenty-building estate is claimed.
- The production references assume a developed supply chain. A building supplied by weaker factories takes longer; saved advanced factories and stockpiles can fund a lower building faster. Prices never chase player income.
- Bootstrap, Gold competition, the Hall ceiling, actual visits, storage congestion, quests and paid supply concentration are modeled in REWARD_REVIEW.md; pacing still requires playtesting. Table rows are individual reference tracks, not fresh-account promises.
- All estate queues, stocks, expedition rewards, recovery deadlines, shop receipts and limits carry. Migration must settle elapsed work once; it must not reset daily allowances or refresh recruitment. World Gold, world cities and Hero progression retain their existing realm reset rules.
- Persistent factories create veteran advantages. Estate materials and champion expeditions provide no direct world troop, wall or city-production bonuses. Officer Gear follows existing rules; cross-season fairness still needs review.
- See README.md and READINESS_PLAN.md for the approved reward/XP/quest/queue repairs and their pending-release implementation. Material-funded commissions supplement the unchanged two-copy Gear system. Champion training and optional activities are included in the shared-account review.
- Arithmetic and model persistence checks pass. Runtime transaction, emulator and browser tests are separate evidence; this reference alone does not certify deployment or player satisfaction.
