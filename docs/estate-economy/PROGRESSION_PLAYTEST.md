# Inner Castle progression playtest

Review of the shipped economy, October 8, 2026. Reproduce with `node tools/validate-estate-progression-playtest.js`; use `--write` to refresh this report. These are isolated runtime-rule journeys, not authenticated production or physical-device results.

## Fresh-account assumptions

Start with six Level 1 buildings, fourteen unbuilt plots, zero materials and 100 Gold. Main City raw income stays at 285 Gold/hour; no city/Hero improvements, outside Gold rewards, purchases, grants or Crowns are assumed. Build the raw and Food chains first, recruit two Common champions, take two-hour Stone expeditions, fund one Common Treasury commission when affordable, then spread upgrades across the estate. All costs, deposits, Hall gates, builders, production, storage, XP ceilings and recovery use the shipped runtime. Five-minute active visits last six hours in one scenario; the other visits every eight hours from the start. These voluntary policies are examples, not optimal routes or automatic starts.

## First-day and first-week results

| Event (hours from first entry) | Active first six hours, then 3 visits/day | 3 visits/day throughout |
|---|---:|---:|
| Timber production begins | 0.07 | 0.07 |
| Food production begins | 0.93 | 24.1 |
| Two champions recruited | 1.75 | 40 |
| First quest launched | 1.75 | 40 |
| First quest rewards claimed | 3.75 | 56 |
| All twenty buildings completed | 4.92 | 112 |
| Great Hall Level 2 completed | 5.07 | 112.15 |
| Guild Level 2 completed | 48.15 | Beyond day 7 |
| First Common commission funded | 2.5 | 16 |
| First commission ready | Beyond day 7 | Beyond day 7 |

| Scenario | Day | Completed buildings | Lowest / highest built level | Completed upgrades above Level 1 | Expeditions launched |
|---|---:|---:|---|---:|---:|
| Active start | 1 | 20 / 20 | 1 / 2 | 9 | 5 |
| Active start | 7 | 20 / 20 | 2 / 3 | 27 | 12 |
| 3 daily visits | 1 | 9 / 20 | 1 / 1 | 0 | 0 |
| 3 daily visits | 7 | 20 / 20 | 1 / 2 | 7 | 11 |

## Reward and pacing findings

- First construction activates a usable service or production chain after a short accepted timer. All fourteen first builds cost 1,335 Gold in total; cash competes with recruitment and world spending. Long intervals between visits delay the next explicit start even when a builder is free.
- The first Hall upgrade requires 6 Timber and 18 Stone, then a nine-minute base timer. Processing and commissions compete for these same resources; review the external bill and production ledgers rather than treating gross factory capacity as available stock.
- At Guild Level 1, a Common champion can bank only 4 XP. A two-hour quest advertises only retainable credit, and further quests at that ceiling may give zero new XP until the Guild grows. Raising the Guild allows banked training to advance; rewards and permanent ownership still matter. This training gate is a player-playtest priority.
- Level 1 officer commissions take seven days after funding. Early commissioning offers a permanent goal, but is not an immediate first-session reward. Existing Gear acquisition and two-copy upgrades remain available under their existing rules.
- The existing six long-term shared-account cohorts finish all twenty Level 100 buildings in 2,110–2,351 simulated days. This is an assumption-dependent route estimate, not a player forecast. Individual 1/3/6/10-season reference budgets use developed support and 50% production; twenty projects share one stockpile. No cost, timer, reward or persistence change is approved by this review.

## Signed-in QA and physical-device checklist

Use an owner-approved dedicated QA account; record the build, starting building levels, visit cadence and outcomes without credentials, private IDs or account exports. Never edit server clocks or grant production stock to accelerate a test.

1. Enter from Main City, fit the estate, select unbuilt Forester’s Lodge, inspect Gold-only Build requirements and confirm. Reopen while running; Build remains until accepted Level 1 completion. Check the fixed bottom caption and curved countdown.
2. Complete Quarry and the Food chain as funds/builders allow. Open resource ledgers, verify source rates/capacity and processing recipes, and navigate each blocker. Background/resume and reload should retain construction, deposits and balances.
3. Review Hall Level 2, make a partial deposit, reopen, complete its material credit, then explicitly start. Confirm the exact bill, seasonal Gold, busy-builder handling, no queue and once-only spending. Check current/next benefits and completion notice.
4. Build Guild Master, recruit two offers at Alehouse, check active/bench capacity, power and the Guild XP ceiling. Review and launch a two-hour quest with real Food. Wait for the accepted deadline; check recovery, quoted XP, claimable materials, a second claim/retry, and partial claims if storage is full.
5. Review and fund a Treasury commission only when its recipe is available. Return from Manage Gear using Back, X and Escape/system Back; preserve camera/selection. Review accepted ready time and claim when actually finished; check inventory and normal Gear upgrade fees/copies.
6. On a physical phone in landscape, pan/pinch, select through the directory, deposit using the keyboard, background/resume and use Android system Back. Verify readable resource counters, fixed labels, touch targets and no horizontal page overflow at both ordinary and small landscape sizes.
7. Record first-day/week achievements, blocked minutes and whether the next useful reward is understandable. Classify signed-in, real-device and satisfaction results separately from fixture/browser/model checks. Monthly persistence needs a real reset or the existing reset emulator; a local serialization check alone is not a reset test.

## itch.io release gate

Prepare from the exact currently verified web runtime, preserving its release manifest, active Core topology, all estate art and service scripts. Verify references, worker scope, desktop/small-landscape startup and backend compatibility before upload. Check the actual public Run game iframe and matching assets after publication; Butler channel status alone is insufficient. Record upload/build identity and update the Master Specification only after verification. See the separate [production playtest and release record](PLAYTEST_RELEASE_RECORD.md) for performed checks and remaining manual steps; simulation results above do not establish those outcomes.
