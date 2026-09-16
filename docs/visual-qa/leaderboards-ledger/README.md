# Leaderboards ledger draft

Status: **DRAFT — awaiting visual approval**. Branch: `codex/leaderboard-ledger-draft`.

Review `/docs/visual-qa/leaderboards-ledger/index.html?viewport=desktop&section=players`. Viewports are 1440 × 900, 844 × 390 and 568 × 320; no portrait game layout. This isolated draft never imports the game or Firebase client and never changes accounts, scores, ranking order, storage, or production styles.

## Scope

Top 100 Kingdoms and Top Clans use the approved parchment, olive, ink and restrained brass language. The window matches the 1200 × 700 desktop military ledgers. Mobile landscape uses the available viewport with a fixed header, tabs, standing summary, column headings and footer surrounding a scrolling list.

Kingdom rows preserve rank, flag, clickable ruler/clan identity, home map, city count, full King Power and score age. Clan rows preserve rank, clickable heraldry/name/tag, membership count and full combined power. Current entries use an olive highlight. Find my rank scrolls to the current entry; no unpublished local entry is added when absent. Small landscape folds home map, cities and membership beneath the identity. Existing packaged flag charges and the real pure clan heraldry renderer supply the draft art.

All 100 entries are fictional in-memory fixtures. Tabs, keyboard tab navigation, Refresh, current-rank scrolling, Close/Escape/Reopen and profile-link notices are interactive. Long-label/large-number, unranked, loading, empty, signed-out and error examples are available. Refresh simulates recovery. Profile links disclose their preview scope; they do not access real accounts. No new archives, rewards, filters, score formula, tie-break or gameplay rules are proposed.

## Inspected contracts

- Master Specification section 13 (Leaderboards & Rankings), plus the Art Bible. Active boards rank by saved King Power; final-season archives remain a separate planned feature.
- `game.js`: `renderLeaderboardRow`, `renderLeaderboardRows`, `setLeaderboardTab`, `refreshLeaderboardRows`, `refreshClanLeaderboardRows`, `showLeaderboardModal`.
- `tools/validate-leaderboard-tabs.js`: current-shard authoritative queries, no local unpublished injection, tab loading, active-tab refresh and accessible selection.
- Current client/server release contracts both use `core-expansion-v1`. This is a presentation-only draft, with no production realm reads or edits required.

Production integration will retain the existing authoritative loaders, sorting, identity handling, error states and score-age formatting. The existing validator encodes the old slate surface and will need an intentional presentation update alongside integration. No Master Specification rule was changed for this unapproved draft.

Required release validation and `prepare-pr` are deferred until design approval and runtime integration. This draft is not a release candidate and is not merged or deployed.
