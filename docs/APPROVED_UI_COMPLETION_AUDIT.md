# Approved UI completion audit

Audited September 19, 2026 against `origin/main` at `2fb3c41652bd838d2c6ce43b5456c6bc379682ad`. Integration branch: `codex/approved-ui-completion`. The user authorized implementation, required validation, push, merge and production deployment. This document records source integration; final live evidence is recorded in the release handoff after deployment.

## Gaps found and integrated

1. `codex/boosts-and-chat-draft`, commits `89861e36f` and `18b2968bc`: eight preview files had never entered the actual game. Both original commits are retained on this branch. `active-boosts-ui.js/css`, real HUD controls and the game entry now mount the approved list/detail screen with the existing four item illustrations, live deadlines, exact production values, empty states and expiry. The persistent HUD uses the existing editable layout configuration.
2. Mini Chat's previous arrow and exact brown 72% gradient are restored in the actual Chat UI. Per-message controls replace the channel-wide switch. Full and mini views share each chosen result. Originals survive pending/failed translations; retries and Google attribution belong to the individual row. The short landscape preview can sit above the navigation row when there is insufficient width beside it.
3. The existing Google callable now supports authoritative message-language detection. Visible rows are checked; same-language, neutral and uncertain messages do not get Translate controls. Detection does not translate. Explicit clicks submit one message ID for translation into the device language. Both operations use the same private authorization, cache, rate limit and 500,000-character monthly reservation. Account, membership, channel and language changes invalidate pending work. No development phrase dictionary ships.
4. `codex/report-location-navigation`, commit `dce093f02`: the requested unloaded-map report fix was never merged. It is now integrated with its validator. The recorded region resolves uncached Core city IDs, navigation waits for the correct map, and a failure retains the report with useful feedback. Successful arrival confirms the target still exists on that map. It does not bypass online authority or promise fresh data without a connection.

## Earlier approved work retained in main

The audit examined 34 relevant local branches, their change inventories, approved preview folders, actual game entry/runtime references and the merge history. Squash-merged branches can still appear unmerged in Git; branch ancestry alone is not evidence of missing work. Except for the gaps above, the following approved batches have their runtime integration in current main. Their existing validation remains part of the release gates.

| Approved work | Existing PRs | Runtime evidence |
| --- | --- | --- |
| City Details, medieval icons, desktop width, owned-city castle access | [277](https://github.com/explocion200/CrownLands/pull/277), [278](https://github.com/explocion200/CrownLands/pull/278), [279](https://github.com/explocion200/CrownLands/pull/279) | `city-details-ui.js/css`, `city-list-ui.css`, game ownership checks |
| Compact City List/Details, matching windows and landscape columns | [280](https://github.com/explocion200/CrownLands/pull/280), [281](https://github.com/explocion200/CrownLands/pull/281) | City modules and scoped reinforcement spacing |
| Royal Bailey, six aligned buildings/signs, larger landscape art, all six interiors | [282](https://github.com/explocion200/CrownLands/pull/282) | `inner-castle-ui.css`, game building definitions and packaged approved art |
| Treasury, gray Common items, Master of Coin and existing gold symbol | [283](https://github.com/explocion200/CrownLands/pull/283) | `treasury-gear-ui.css`, Common Gear runtime and approved sprite |
| Barracks / static War Captain | [284](https://github.com/explocion200/CrownLands/pull/284) | `barracks-gear-ui.css` and approved officer art |
| Gatehouse / Defensive Commander | [285](https://github.com/explocion200/CrownLands/pull/285) | `gatehouse-gear-ui.css` and approved officer art |
| Royal Stables / Cavalry Master with horse | [286](https://github.com/explocion200/CrownLands/pull/286) | `royal-stables-gear-ui.css` and approved officer art |
| Animated, clickable Common Gear Box with repeat opening | [287](https://github.com/explocion200/CrownLands/pull/287) | `common-gear-box-ui.js/css` and authoritative inventory handling |
| Bag and updated chest | [288](https://github.com/explocion200/CrownLands/pull/288) | `item-bag-ui.js/css`, canonical chest asset |
| Shop and medieval item illustrations | [289](https://github.com/explocion200/CrownLands/pull/289) | `shop-ui.js/css`, shared item definitions and six approved illustrations |
| Persistent randomized 28-day Daily Login, weekly rewards and Gear Boxes | [290](https://github.com/explocion200/CrownLands/pull/290) | `daily-login-ui.js/css`, `functions/dailyLoginRewards.js` |
| Quests and the three medieval reward-navigation icons | [291](https://github.com/explocion200/CrownLands/pull/291) | `quests-ui.js/css`, game navigation and shared assets |
| Achievements / Player Profile | [292](https://github.com/explocion200/CrownLands/pull/292), [293](https://github.com/explocion200/CrownLands/pull/293) | `achievements-ui.css`, `player-profile-ui.css` |
| Skills, revised artwork and compact three-discipline landscape view | [295](https://github.com/explocion200/CrownLands/pull/295) | `skills-ledger-ui.css`, approved skill art and game skill rendering |
| Full Clan ledger / Settings | [296](https://github.com/explocion200/CrownLands/pull/296), [297](https://github.com/explocion200/CrownLands/pull/297) | `clan-ledger-ui.css`, `settings-ledger-ui.css` |
| Battle Report list, red defeat shields, full detail, pickup/report corrections | [298](https://github.com/explocion200/CrownLands/pull/298), [299](https://github.com/explocion200/CrownLands/pull/299), [300](https://github.com/explocion200/CrownLands/pull/300) | Report ledger/detail modules and corrected pickup pending presentation |
| Scout Reports | [301](https://github.com/explocion200/CrownLands/pull/301) | `scout-report-ui.js/css` and shared report actions |
| Kingdom Activity Marches, Rallies, Reinforcements | [302](https://github.com/explocion200/CrownLands/pull/302), [303](https://github.com/explocion200/CrownLands/pull/303), [305](https://github.com/explocion200/CrownLands/pull/305) | Three activity modules and styles |
| Activity Camps/Strongholds; Troop Orders, battle-only forecast, city levels, swords/banner slider | [306](https://github.com/explocion200/CrownLands/pull/306) | `objectives-activity-ui.js/css`, `troop-orders-ui.js/css`, approved slider SVGs |
| Leaderboards, larger Map Atlas, special frames/resource icons, four Strongholds/Citadel details | [308](https://github.com/explocion200/CrownLands/pull/308) | `kingdom-ledgers-ui.js/css`, `stronghold-details-ui.js/css` |
| All Camp details and Relic chest; Clan Towers, flags/garrison and Wall & Veil presentation | [309](https://github.com/explocion200/CrownLands/pull/309) | `camp-details-ui.js/css`, `clan-tower-details-ui.js/css`; troop actions remain outside the details UI |
| Gold/troop restyled shared artwork and Welcome Back city-loss totals | [310](https://github.com/explocion200/CrownLands/pull/310) | Canonical pickup assets and runtime reward references |
| Chat ledger, Hero Level-Up and Welcome Back drafts | [311](https://github.com/explocion200/CrownLands/pull/311) | `chat-ledger-ui.css`, `reward-ledger-ui.js/css`; row translation supersedes the older global interaction |
| Existing Google translation integration | [312](https://github.com/explocion200/CrownLands/pull/312) | `chat-translation.js`, `functions/chat-translation.js`; reused and extended by this release |
| Peace Shield cooldown and exact-city retaliation | [314](https://github.com/explocion200/CrownLands/pull/314) | `combat-timers-ui.js/css`, authoritative combat helpers, rules, private grants and index |

## Preservation and exclusions

- The deployed combat policy, capture grants, one-use march transaction, abandon restrictions, 15-minute timers and Firestore protections are preserved. The report navigation patch changes only presentation/navigation paths in `game.js`.
- No original draft branch, archived worktree, unrelated work or player data was discarded. Historical drafts remain as references even after their functionality is integrated.
- The early broad UI foundation was explicitly reverted in favor of one-at-a-time review. It is not pending approved work to reapply.
- The Clan Tower Veil purchase/use mechanics were explicitly deferred by the user. This audit integrates its approved UI, not those deferred balance/mechanic changes.
- Separate Crownlands Studio work, old Citadel implementation branches, archived worlds, main-site publishing and itch.io release parity are outside this conversation's approved game-web draft integration.

## Validation and release acceptance

- Focused provider/client tests cover real request shapes, detection confidence/neutral suppression, one-message translation, original restoration, local retry/quota feedback, account/channel/language isolation, caches, timeout and batching.
- Authenticated emulator coverage extends the existing Google service checks with detection authorization, private caches shared across device languages, and one combined monthly reservation for detection and translation.
- The actual game browser fixture checks all four boosts, countdown/empty states, full and mini chat at desktop, 844×390 and 568×320, exact background opacity, original arrow, keyboard/focus behavior, per-message translation, unsafe text rendering, preserved reward screens and visible actions.
- The report navigation validator exercises 1,480 uncached Core cities, report types, Camps, New Lands and map-load recovery. Existing combat timer and combat emulator checks remain required.
- Run `prepare-pr`, require all three GitHub checks, merge, verify exact production web build/assets and affected backend source packages, then synchronize and verify local main. Record actual outcomes, PR and any outstanding work in the final release checklist. Do not infer live completion from this pre-release source document.
