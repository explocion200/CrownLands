# Battle Reports list draft

Local approval draft on `codex/battle-reports-ledger-draft`, based on `22ebbcd17400b70d506b21cfc137b45866e8fec4`. No production UI, gameplay, release configuration, or Master Specification changes.

Open `/docs/visual-qa/battle-reports-ledger/index.html?viewport=desktop` using the existing preview server (`node tools/map-benchmark/start-server.js 61703`). Review desktop 1440×900, mobile landscape 844×390, and small landscape 568×320. No portrait design is proposed.

## Scope and sources

The list is the first approval step. Full battle and scout detail screens will be reviewed later within this UI update. Filter, ruler, clan, full-report, and map actions in this draft use example data and report intended navigation in the outer review footer. They do not call the game or backend. Loading and Retry are in-memory examples; all names, flags, numbers, and timestamps are illustrative. Relative ages and expiry displays are fixed to the sample so a review can be repeated.

Inspected `game.js`: `showLogModal`, `renderBattleReportCard`, `getBattleReportBadge`, `renderBattleReportLocateButton`, `renderRealmActivityCard`, `setOnlineReportSyncState`, `getUnreadReportCount`, and `markLoadedReportsViewed`. Master Specification: Scouting and reports. Retained fields:

- All / Attack / Defense / Scout / Realm Activity filters and newest-first ordering. Realm Activity remains conditional on runtime support.
- Exact outcome meanings, report age, successful scout expiry, level or Camp target label, target name, troop value and its `sent` / `reported` / `troops seen` qualifier, opponent identity/flag, location and full-report actions. Unresolvable targets retain a disabled map action.
- Realm Activity retains objective art, proclamation title/time, herald/body/closing, player/clan identities, objective/type, location, and View Location.
- Loading/reconnecting remain distinct from authoritative empty history; reconnecting retains saved rows and Retry.
- Existing retention remains 24 hours for attack/defense and 10 minutes for successful scout intelligence.

“New” is a proposed visual highlight of arrivals at the start of this visit. It does not introduce per-report unread persistence: the existing game acknowledges loaded reports when the list opens. Closing and reopening the example clears visit highlights. Actual read-watermark behavior stays with the production handler at integration.

New repo-native SVGs depict a forged sword, shield, hooded scout, castle standard, and wax-sealed dispatch, using the established ink/olive/brass/burgundy palette. Existing objective illustrations and Royal Bailey background are reused. No new raster art or external image-generation service is used.

The window follows the approved maximum 1200×700 size. Desktop and landscape keep five information columns with 44px map/report controls; navigation stays fixed above the vertical list. Small landscape moves the report count into the title area and removes repeated column headings to give the scrollable list more room. The draft changes no live rules and requires design approval before production integration or release.
