# Estate economy draft — arithmetic review

PROPOSED, not live balance. Reproduce with `node tools/validate-estate-economy-draft.js --write`. No player data was used.

## Production and upgrade demand

All processors run continuously at the same level as extractors. Net rates deduct Timber, Ore, Grain, Planks and Iron used by recipes. A portfolio wave means one upgrade for each of all twenty buildings, including the six proposed double-cost permanent buildings. Stock waiting time is max(demand/net output); it excludes stored inventory, jobs, Gold, quests and differing factory levels.

| Level | Timber/h | Stone/h | Ore/h | Grain/h | Planks/h | Iron/h | Tools/h | Food/h | Material wait for one portfolio wave |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 44.0 | 80.0 | 12.0 | 32.0 | 16.0 | 12.0 | 4.0 | 24.0 | 0.00h |
| 10 | 107.4 | 195.2 | 29.3 | 78.1 | 39.0 | 29.3 | 9.8 | 58.6 | 1.30h |
| 25 | 213.0 | 387.2 | 58.1 | 154.9 | 77.4 | 58.1 | 19.4 | 116.2 | 3.49h |
| 50 | 389.0 | 707.2 | 106.1 | 282.9 | 141.4 | 106.1 | 35.4 | 212.2 | 5.62h |
| 75 | 565.0 | 1027.2 | 154.1 | 410.9 | 205.4 | 154.1 | 51.4 | 308.2 | 8.34h |
| 100 | 741.0 | 1347.2 | 202.1 | 538.9 | 269.4 | 202.1 | 67.4 | 404.2 | 11.67h |

## Construction/stock simulation

Ten-minute ticks, all sites already L1, zero initial stocks, auto factories, capacity limits, one active job per building, 1/2/3 building slots at Builders' Yard 1/10/50, a Hall+5 ceiling for seasonal buildings and no seasonal Hall ceiling for permanent buildings. Balanced/seasonal-first policies make decisions every tick. Three-visits policies use the seasonal-first priority, confirm prepaid batches of up to five levels only every eight hours, and hold at most thirty jobs; queued jobs run offline without another payment. Every cost is spent when queued. Gold is assumed affordable; no quests, Crown supplies, recruiting, meals, startup or missed visits are modeled. The monthly-reset variant clears stocks and unfinished jobs and returns all fourteen seasonal sites to L1 every thirty days, retaining completed levels of all six permanent buildings. It abstracts rebuilding L1 sites and old-generation refund handling; production must use six starter buildings for new accounts, retain a constructed Guild Master as a seventh completed site for returning guild owners, and reject prepaid jobs crossing a reset. Other policies run uninterrupted. These are design estimates, not measured player completion promises. Milestones are first reach dates from the model start; the monthly-reset first seasonal-100 milestone is not a claim of preserving those levels. The three-visits result exposes the difference between arithmetic affordability and practical session pacing.

| Policy | Hall 25 / 50 / 75 / 100 (days) | All seasonal 25 / 50 / 75 / 100 (days) | All 20 at 100 (days) |
|---|---|---|---:|
| balanced | 3.41 / 10.92 / 20.22 / 34.31 | 3.58 / 11.30 / 20.60 / 34.86 | 34.86 |
| seasonal-first | 2.02 / 6.47 / 12.96 / 23.35 | 2.11 / 6.70 / 13.19 / 23.76 | 32.06 |
| three-visits | 3.49 / 8.49 / 16.24 / 27.01 | 4.13 / 9.54 / 16.53 / 27.08 | 35.22 |
| three-visits-monthly-reset | 3.49 / 8.49 / 16.24 / 27.01 | 4.13 / 9.54 / 16.53 / 27.08 | 56.25 |

## Gold funding constraint

At a constant raw Main City rate of 285 Gold/hour, these totals sum the separately rounded Level 2 through target-level fees. They exclude first builds, recruiting, quests, Gear crafting, world upgrades and rebuilding after resets. The last two columns are Gold-only funding lower bounds, with all Main City income allocated to the estate. Gold accrues while materials/jobs advance, so do not add these days to the construction model. Higher kingdom income can fund projects sooner; spending only half of a single Main City's income doubles these lower bounds. Changing Main City level also changes future quotes and requires a time-varying funding model.

| Target across buildings | 14 seasonal Gold | All 20 Gold | Seasonal funding at 1 Main City income (days) | All 20 funding at 1 Main City income (days) |
|---:|---:|---:|---:|---:|
| 25 | 10,027 | 19,227 | 1.47 | 2.81 |
| 50 | 36,038 | 69,236 | 5.27 | 10.12 |
| 75 | 86,270 | 165,906 | 12.61 | 24.26 |
| 100 | 169,131 | 325,403 | 24.73 | 47.57 |

The funding table is a separate lower bound; the material/queue estimates assume affordable Gold and cannot establish newcomer pacing while normal world progression competes for that income. The intended reward is useful selected milestones, not compulsory maximuming of every site. Validate low-income cohorts and tune Gold fees before shipping; the affordable-Gold simulation is a construction estimate only.

## Checks and limits

- All twenty registries match; the four officer buildings, Guild Master and Alehouse persist, leaving fourteen seasonal buildings. No Level 1 prerequisite cycle exists, and Level 1 needs no crafted input.
- Costs and production are monotonic through all 100 levels. Every single upgrade fits previous-level storage. Matched-level storage holds at least 24 hours of gross Timber/Grain production; heavily uneven levels can still fill earlier.
- Factory recipes leave positive net output in every resource. Input-starved or output-full processors stop consuming inputs in the model.
- Crown supplies share one production-hour equivalent per UTC day, at most 4.17% of 24-hour output for the selected material under the quoted reference rate. This is a local-material bound, not a measured PvP fairness result or total progress guarantee.
- Full monthly maximum across every seasonal building is not a required objective. Compare the simulation against 30 days and tune progression before shipping; a seasonal-first strategy is faster for seasonal systems while all six permanent building tracks carry between resets.
- Existing two-copy Gear rules still require 1,048,576 Common L1 equivalents for one Legendary L1 piece. Building milestones alone do not solve acquisition. New higher-tier drops or targeted-copy sources require a separately confirmed Gear decision; existing items and earned access must be grandfathered.
- Champion XP, recovery, retained recruitment and quest rewards are not simulated. Permanent parties with three slots need separate fresh-season and multi-season tests against rebuilt supply chains; the current XP curve is unvalidated and may train carried recruits too quickly.
- These checks establish arithmetic consistency only. Human playtesting must measure Gold competition, quest/meal sinks, return frequency, decision fatigue, perceived rewards and monthly restart appeal. No claim that the whole economy is validated is made.
