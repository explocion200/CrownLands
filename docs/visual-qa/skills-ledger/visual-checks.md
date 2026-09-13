# Skills draft review checks

Checked September 13, 2026 in the Codex in-app browser against the local repository preview server. These are draft checks, not production or multiplayer certification.

## Layout and assets

- Desktop 1440 × 900: all eight skill cards visible; no card scroll overflow; enlarged illustrated icons, current/cap/level values, next bonus, and point controls visible.
- Landscape 844 × 390: Attack, Defense, and Utility switch correctly; group cards and bottom controls fit without scrolling.
- Small landscape 568 × 320: Current Build and preset editor fit; Hero level remains visible; point controls are 44 px tall with 44 px button columns. Apply confirmation fits in the viewport.
- All 16 image instances in the direct preview reported loaded with nonzero natural width. No browser warnings or errors were recorded for the tested preview.
- Default, saved, dirty, locked, empty, applied/selected, maximum, no-points, and insufficient-Gold states inspected through the review controls and local interactions.

## Interaction evidence

- Established live build: 69 spent / 6 unspent at Hero 76. Editing War Council to 60 spent and saving via Save & continue left the live build at 69 spent / 6 unspent.
- Dirty preset disabled Apply. Applying the saved Border Wardens example displayed a 32,400 Gold confirmation, marked its tab `selected applied`, and changed Current Build to 60 spent / 15 unspent.
- Free Reset returned all 60 points, leaving 0 spent / 75 unspent and preserving the saved preset.
- Veteran: 145 spent / 5 unspent. Removing Swordmastery's final level returned two points (143 / 7); adding it restored 145 / 5 and disabled further addition at maximum.
- All-points-spent example displayed zero unspent and disabled additions. Hero 10 example displayed four locked presets and 7 spent / 2 unspent.
- Insufficient-Gold example disabled Apply and displayed `Need 32,400 Gold · have 1,200`.
- Cancel retained an unsaved name. Discard restored the original preset. Close and Open Skills worked. Category switching preserved the selected build.

Production save/sync, server-side enforcement, real account balances, multiplayer effects, and deployment remain outside this isolated draft. Integration requires the repository's normal validation workflow after approval.
