# Full Battle Report draft checks

Checked September 14, 2026 in the Codex in-app browser using the repository's local preview server. These checks cover an isolated design draft, not production integration or multiplayer behavior.

## Layout

- Inspected all 13 examples at 1440 × 900, 844 × 390, and 568 × 320: 39 states passed the final DOM layout and asset checks.
- Window outer dimensions are 1200 × 700, 820 × 366, and 556 × 308 respectively, matching the approved Reports list dimensions.
- The scrolling report has 517, 229, and 175 pixels of visible height respectively. Loading content fits without scrolling at each size.
- No horizontal scroll overflow or overflowing content elements were detected in the final pass, including long ruler/holding names and eight-digit army totals. Large totals were checked within both summary cards and comparison rows.
- All displayed image elements loaded with nonzero natural width. Existing external SVG symbol references were visually inspected in the summary and section headings.
- Every report button retained at least 44 pixels of height. The three header icon/back controls remain accessible while the content scrolls.
- Desktop and landscape summary, force comparison, defeat shield, rewards, and long-name layouts received visual inspection. Existing parchment/olive/brass/burgundy styling is reused.

## States and interactions

- Defensive defeat and Citadel city loss use `battle-reports-ledger-r1.svg#defense-defeat`; held defense uses `#defense`. Explicit outcome wording remains visible.
- All seven rally section shortcuts worked at 568 × 320. Each brought its corresponding content into the viewport, maintained the fixed header, and showed the correct selected shortcut.
- The rally rows retain all four participant metrics and creator/participant labels.
- Camps omit the wall section and wall power row; their no-level/no-wall and 1.00 defense labels remain visible. The recorded item reward uses the updated Common Gear Box artwork.
- History and unavailable-detail examples retain supplied summary information and explicitly mark unknown base/attack power and combat bonuses as “Not recorded.” Gear sections are absent when no recorded Gear effects exist.
- Expanding “Defense changed after scouting” displayed all supplied changes and the existing forecast/arrival explanation. The disclosure remains keyboard operable through native details/summary semantics.
- Reports, map, and ruler buttons announced their intended draft actions in the review footer. They did not invoke production navigation or services.
- Close removed the dialog's open state; Open Battle Report restored it. Reset example restored the selected sample and scroll position zero.
- Browser console contained no warnings or errors after final review. Both draft JavaScript files passed `node --check`.

## Approved production integration checks

Checked September 14, 2026 using the actual game entry point with local benchmark services and synthetic snapshots from `runtime-fixture.js`.

- All 16 runtime examples passed at 1440 × 900, 844 × 390, and 568 × 320 (48 states): no horizontal content overflow, broken images, or header/section buttons smaller than 44 × 44. Window dimensions match the isolated draft and Reports list.
- The actual saved-flag renderer, viewer-oriented side models, bonus/Gear helper, conditional rewards, and legacy/unavailable fallback render through the new presentation module.
- Defense defeat and Citadel loss retained red shields; held defense retained olive. Camp Gold, troops, item/quantity, and Deed city/location rewards rendered without wall sections or duplicated generic rewards. The Common Gear Box uses the updated chest art.
- Every rally section shortcut at the smallest landscape size scrolled to the correct section, focused its heading, selected the matching shortcut, and kept the header fixed. Rewards remain reachable.
- The existing forecast disclosure expanded with the actual before/after garrison, reinforcement, and total-defense values and arrival-time explanation; no overflow was detected.
- Back returned to the existing Reports ledger. Map navigation and Close closed the dialog and removed the detail style scope. The shared profile-link helper and saved-flag hooks are retained.
- The only observed browser warnings were the three deliberately unavailable-snapshot examples during the state matrix. No unexpected errors were observed.
- `validate-report-system.js` passed with the new focused renderer coverage: settled values, escaping, viewer order, missing historical statistics, Gear/recovery, rally rows, all Camp reward types, defeat shield, age/navigation hooks, and loading. Existing scout lifecycle, UI contrast, and clan-objective battle validations also passed.

No physical device, authenticated production account, server battle calculation, or production snapshot loading was exercised in this local review. Required release checks and published-build evidence are recorded in the release artifacts after completion.
