# Estate economy draft — arithmetic review

PROPOSED, not live balance. Reproduce with `node tools/validate-estate-economy-draft.js --write`. No player data was used.

## Production and upgrade demand

All processors run continuously at the same level as extractors. Net rates deduct Timber, Ore, Grain, Planks and Iron used by recipes. A portfolio wave means one upgrade for each of all twenty buildings, including double-cost permanent officers. Stock waiting time is max(demand/net output); it excludes stored inventory, jobs, Gold, quests and differing factory levels.

| Level | Timber/h | Stone/h | Ore/h | Grain/h | Planks/h | Iron/h | Tools/h | Food/h | Material wait for one portfolio wave |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 44.0 | 80.0 | 12.0 | 32.0 | 16.0 | 12.0 | 4.0 | 24.0 | 0.00h |
| 10 | 107.4 | 195.2 | 29.3 | 78.1 | 39.0 | 29.3 | 9.8 | 58.6 | 1.19h |
| 25 | 213.0 | 387.2 | 58.1 | 154.9 | 77.4 | 58.1 | 19.4 | 116.2 | 3.23h |
| 50 | 389.0 | 707.2 | 106.1 | 282.9 | 141.4 | 106.1 | 35.4 | 212.2 | 5.18h |
| 75 | 565.0 | 1027.2 | 154.1 | 410.9 | 205.4 | 154.1 | 51.4 | 308.2 | 7.68h |
| 100 | 741.0 | 1347.2 | 202.1 | 538.9 | 269.4 | 202.1 | 67.4 | 404.2 | 10.74h |

## Construction/stock simulation

Ten-minute ticks, all sites already L1, zero initial stocks, auto factories, capacity limits, one active job per building, 1/2/3 building slots at Builders' Yard 1/10/50, a Hall+5 ceiling for seasonal buildings and no seasonal Hall ceiling for permanent officers. Balanced/seasonal-first policies make decisions every tick. Three-visits policies use the seasonal-first priority, confirm prepaid batches of up to five levels only every eight hours, and hold at most thirty jobs; queued jobs run offline without another payment. Every cost is spent when queued. Gold is assumed affordable; no quests, Crown supplies, recruiting, meals, startup or missed visits are modeled. The monthly-reset variant clears stocks and unfinished jobs and returns all sixteen seasonal sites to L1 every thirty days, retaining only completed officer levels. It abstracts rebuilding L1 sites and old-generation refund handling; production must follow the six-completed/fourteen-unbuilt baseline and reject prepaid jobs crossing a reset. Other policies run uninterrupted. These are design estimates, not measured player completion promises. Milestones are first reach dates from the model start; the monthly-reset first seasonal-100 milestone is not a claim of preserving those levels. The three-visits result exposes the difference between arithmetic affordability and practical session pacing.

| Policy | Hall 25 / 50 / 75 / 100 (days) | All seasonal 25 / 50 / 75 / 100 (days) | All 20 at 100 (days) |
|---|---|---|---:|
| balanced | 3.22 / 10.16 / 18.71 / 31.62 | 3.38 / 10.50 / 19.06 / 32.10 | 32.10 |
| seasonal-first | 2.33 / 7.28 / 14.06 / 24.61 | 2.43 / 7.54 / 14.30 / 25.02 | 30.34 |
| three-visits | 3.90 / 9.46 / 17.24 / 27.79 | 4.72 / 10.22 / 17.39 / 27.79 | 33.30 |
| three-visits-monthly-reset | 3.90 / 9.46 / 17.24 / 27.79 | 4.72 / 10.22 / 17.39 / 27.79 | 57.92 |

## Gold funding constraint

At a constant raw Main City rate of 285 Gold/hour, these totals sum the separately rounded Level 2 through target-level fees. They exclude first builds, recruiting, quests, Gear crafting, world upgrades and rebuilding after resets. The last two columns are Gold-only funding lower bounds, with all Main City income allocated to the estate. Gold accrues while materials/jobs advance, so do not add these days to the construction model. Higher kingdom income can fund projects sooner; spending only half of a single Main City's income doubles these lower bounds. Changing Main City level also changes future quotes and requires a time-varying funding model.

| Target across buildings | 16 seasonal Gold | All 20 Gold | Seasonal funding at 1 Main City income (days) | All 20 funding at 1 Main City income (days) |
|---:|---:|---:|---:|---:|
| 25 | 11,696 | 17,588 | 1.71 | 2.57 |
| 50 | 42,037 | 63,289 | 6.15 | 9.25 |
| 75 | 100,635 | 151,611 | 14.71 | 22.17 |
| 100 | 197,303 | 297,327 | 28.85 | 43.47 |

A newcomer relying on one Main City's income cannot reproduce the 27.79-day seasonal material/queue result while also funding normal world progression. The intended reward is useful selected milestones, not compulsory maximuming of every site. Validate low-income cohorts and tune Gold fees before shipping; the affordable-Gold simulation is a construction estimate only.

## Checks and limits

- All twenty registries match; four officer tracks persist. No Level 1 prerequisite cycle exists, and Level 1 needs no crafted input.
- Costs and production are monotonic through all 100 levels. Every single upgrade fits previous-level storage. Matched-level storage holds at least 24 hours of gross Timber/Grain production; heavily uneven levels can still fill earlier.
- Factory recipes leave positive net output in every resource. Input-starved or output-full processors stop consuming inputs in the model.
- Crown supplies share one production-hour equivalent per UTC day, at most 4.17% of 24-hour output for the selected material under the quoted reference rate. This is a local-material bound, not a measured PvP fairness result or total progress guarantee.
- Full monthly maximum across every seasonal building is not a required objective. Compare the simulation against 30 days and tune progression before shipping; a seasonal-first strategy is faster for seasonal systems while officer progression carries between resets.
- Existing two-copy Gear rules still require 1,048,576 Common L1 equivalents for one Legendary L1 piece. Building milestones alone do not solve acquisition. New higher-tier drops or targeted-copy sources require a separately confirmed Gear decision; existing items and earned access must be grandfathered.
- These checks establish arithmetic consistency only. Human playtesting must measure Gold competition, quest/meal sinks, return frequency, decision fatigue, perceived rewards and monthly restart appeal. No claim that the whole economy is validated is made.
