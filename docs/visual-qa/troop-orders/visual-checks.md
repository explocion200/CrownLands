# Troop Orders draft checks

Checked September 15, 2026 in the local in-app browser. Synthetic UI fixtures only; no production account or server operations.

## Current revision: origin and destination city levels

- Added compact `Lv. 64` and `Lv. 82` badges to the From and To route headings for attacks. The fixture levels match the reused keep/castle stage ranges. City levels are separately labeled for accessibility.
- Checked attack, long names, Camp and unavailable-intelligence samples at desktop 1440 × 900, landscape 844 × 390 and small landscape 568 × 320 (12 combinations). Badges fit within their location panels, no horizontal overflow occurred, and the fixed action footer stayed inside the dialog.
- Both city badges remain available without scouting. Camp attacks show only the origin city level. Displayed own-army totals remain unchanged.
- Visually inspected standard desktop and mobile landscape. Node.js 22 syntax and whitespace checks passed. No runtime gameplay or release changes.

## Previous revision: requested attack-power breakdown

- Compared the draft own-power helper against the current server `createAttackCombatSnapshot` function extracted from `functions/index.js`: 216 vectors covered 0/1/3/17/999/120,000/750,000/1,234,567,890/4,294,967,295 troops, 0/2/40/60% Swordmastery, and no equipped weapon or Common weapon levels 1–5. All totals and per-troop values matched the server arithmetic; raw source contributions summed to the pre-rounding result within floating-point tolerance. This is arithmetic validation with controlled inputs, not a production-server invocation.
- Default displayed total: 1,323,281. Moving the slider to 1,250,000 troops updated base to 1,562,500, Swordmastery to +625,000, weapon to +17,968.75 and total to 2,205,468.
- No-buff and stored-unequipped-sword examples both show 937,500 total and +0 weapon power. Maximum skill/weapon shows 1,514,062. One-troop rounding shows final power 1 and fractional weapon contribution +0.003125. Long-army total remains fully shown as 2,178,240,720.
- Checked 13 relevant examples across all three sizes (39 combinations): no missing displayed art, horizontal overflow, overflowing power cells or clipped/footer buttons under 44px. Friendly orders, Rallies and blocked home bases do not gain an attack-power card; unknown enemy intelligence still shows own power.
- After the layout refinement, rechecked the expanded standard, long, stored and rounding examples at all three sizes (12 combinations). All passed for artwork, cell overflow and accessible fixed actions. All nine standard effect/item rows loaded and showed +0 direct attack power; stored gear had one explicit unequipped row; the empty loadout had none.
- Desktop puts selection, own power and enemy forecast side by side. Mobile uses one scrolling body with the power breakdown and a full-width expandable two-column effect list below the compact order. Scrolling reached every contribution and the final Royal Peace Shield row while Attack/Cancel remained visible.
- Final desktop standard fits its 455px body without scrolling; the complete own-power card and Other buffs & items control are visible. Visual inspection covered desktop own-power sources and expanded effects, mobile full power card and item list. Browser warnings/errors were empty. JavaScript syntax and whitespace checks passed at the final checkpoint.

## Original draft baseline

The checks below describe the previous fourteen-example draft before the requested power breakdown. New attack content adds scrolling on mobile; the current revision above supersedes the original no-scroll assertion for attacks.

| Viewport | Dialog | Fourteen examples |
| --- | --- | --- |
| Desktop 1440 × 900 | 1100 × 620 | Passed |
| Landscape 844 × 390 | 820 × 366 | Passed |
| Small landscape 568 × 320 | 556 × 308 | Passed |

- All 42 viewport/sample combinations showed the selected state. No horizontal content overflow, missing displayed images or clipped action buttons. All visible footer buttons were at least 44 × 44 pixels.
- Standard desktop and 844px landscape orders fit without scrolling. Long landscape names needed three additional vertical pixels. Dense Reinforcement details and small-landscape orders scroll within the fixed window while the action bar stays visible.
- Changed the mobile forecast to two compact columns after visual inspection so its Travel bonus and Travel time fit with the standard 844px landscape order. Confirmed the resulting standard body is 244px with no overflow.
- Long sample preserved 1,234,567,890 selected troops and 4,294,967,295 available; names wrap and the scouted defense value remains in full.
- Small-landscape Transfer slider End selected 1,250,000 troops, left 0 at source, and displayed 1,435,000 on arrival (185,000 existing). Swift March On changed the sample 8m 12s / 24% to 4m 6s / 148%, without changing inventory. The toggle was reachable by scrolling.
- Transfer action produced a clearly labeled draft receipt with source, destination, quantity and item choice. No game action occurred.
- Rally numeric entry of 12,345 synchronized range, selected quantity, leader-force summary and source remainder of 1,237,655.
- Route-unavailable example disabled Attack. Try again restored the mock route and enabled Attack. Calculating-route examples remained blocked; protected home-base samples hid the Attack action.
- Cancel closed the dialog and Open Troop Orders reopened it. Browser warning/error logs were empty.
- Visually inspected desktop attack, mobile landscape attack, and small-landscape long-label layouts.
- Node.js 22 syntax checks passed for `preview.js` and `review.js`. Whitespace checks passed.

No full game validation, multiplayer emulator run or deployment check was performed for this isolated draft. Physical-device and authoritative gameplay verification remain part of the eventual approved integration/release.
