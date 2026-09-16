# Map Selector draft checks

Checked September 15, 2026 in the local browser preview.

- 61 active map IDs were verified through read-only current-realm pointer and expansion-state GETs. Source checks confirm unique grid positions, reciprocal cardinal edges, and existing thumbnail/landmark asset files. The rendered draft contains 61 tiles and 106 connection lines.
- Desktop 1440 × 900, landscape 844 × 390, and small landscape 568 × 320 fit within their viewports. Navigation controls do not overflow. Core and frontier samples remain legible at opening zoom.
- Current/Home shortcut centering keeps the target tile fully visible. Current and Home labels coexist on the same map in that example.
- Whole realm fits all 61 tile bounds within the landscape canvas. This is an overview: labels are read at closer zoom or in the fixed full-name detail footer.
- Mouse drag changed the camera without opening a map; a distinct subsequent click opened exactly one map. Direct selection, return to selector, keyboard ArrowRight neighbor navigation and Enter selection passed. Selection leaves the fixture city counts unchanged.
- Mouse wheel zoom changed 68% to 39.3%; Zoom in changed that to 48.8%. Close/Reopen passed. No console warnings or errors were recorded.
- Unknown counts show Syncing. Simulated map-load failure leaves the original map and atlas open, records zero successful entries and shows retry guidance.
- Syntax checks passed for the draft scripts. All changes are confined to the new atlas draft and the approved Leaderboards draft’s status notes.

The draft includes pointer-based touch pan/pinch handling. Native touch/pinch validation remains for device review: the in-app browser does not support `Input.dispatchTouchEvent`, so no successful pinch test is claimed here. Runtime camera integration still requires the established map-picker interaction gate.

No production browser session, game account, orders, player holdings or realm data were changed. Full release validation, PR creation, merge and deployment are deferred until approval and runtime integration.

## Larger artwork and clearer feature trims

- Rechecked desktop 1440 × 900 and landscape 844 × 390 / 568 × 320 after the thumbnail/caption adjustment. Thumbnail area is 126 pixels high at normal detail zoom (previously 100); all 61 captions fit within the unchanged tile bounds, and the landscape toolbar does not overflow.
- Green Tower outer frames, gold Camp inner frames and red Stronghold/Citadel frames remain distinct in close and Whole realm views. The corresponding text badges and legend swatches use the same colors. Thumbnail SVG registration and asset references are unchanged.
- Clicking the Tower badge on Lionwatch opened exactly one local map preview; Return and Reset example restored the standard desktop draft. The atlas still has 61 tiles and 106 connection lines. Browser error/warning logs were empty.
- `node --check docs/visual-qa/map-selector-atlas/preview.js` and `git diff --check` passed. This revision changes presentation only; the previous device pinch-testing limitation remains.

## Medieval ornamental frames

- Reviewed the green battlement, brass Camp and crimson/gold royal frames at desktop 1440 × 900 and landscape 844 × 390 / 568 × 320. Lower-corner ornaments were tightened to leave counts and feature badges visible. All 61 captions fit and the small-landscape toolbar does not overflow.
- The 21 feature overlays have `pointer-events: none`; plain maps retain their existing frame. Whole realm hides fine SVG ornament while retaining the feature-color trims.
- A small-landscape click check initially opened Kingsbridge when clicking partially visible Lionwatch: pointer-induced focus centered the tile before the click completed. The draft now skips focus centering while a pointer is active. Repeating that exact click opened Lionwatch once; keyboard ArrowRight still centered/focused Lionwatch and Enter opened it correctly.
- `node --check` passed for `frames.js` and `preview.js`; `git diff --check` passed. Browser warning/error logs were empty. The standard desktop draft was restored for review. Native device pinch review and production integration remain pending.

## Stronghold specialization crests

- Per the user's clarification, Stronghold icons represent their bonuses. Verified the existing Strongholds-ledger icons: troop helmet for Greybanner Hold, gold coin for Aurum Keep, marching standard for Swiftgate and shield for Ironwatch. Existing SVG files were reused without modification.
- The rendered atlas has four specialization icons and one royal crown crest, on Crown Citadel. Desktop and 844 × 390 landscape were reviewed after the icon substitution. Borders, captions and layout are unchanged from the prior desktop and both-landscape checks.
- Syntax and whitespace checks passed. The standard desktop draft was restored. No runtime integration or release was performed.
