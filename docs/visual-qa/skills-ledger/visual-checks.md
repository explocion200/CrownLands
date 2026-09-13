# Skills draft review checks

Checked September 13, 2026 in the Codex in-app browser against the local repository preview server. These are draft checks, not production or multiplayer certification.

## Layout and assets

- Desktop 1440 × 900: all eight skill cards visible; no card scroll overflow; enlarged illustrated icons, current/cap/level values, next bonus, and point controls visible.
- Three-column landscape 844 × 390: all eight skills remain in their desktop groups with compact cards and a shared scrollbar. The area has 213 px of visible height and 392 px of content. At its 179 px maximum scroll position, Field Medics and Guild Charters are fully reachable. Header, preset tabs, totals, and actions remain fixed above it. All three category headings stay visible.
- Small landscape 568 × 320: all eight cards are 122 px tall with no internal overflow or overlapping values/controls. At the 259 px maximum scroll position, Field Medics and Guild Charters are fully inside the window. The first row's complete controls fit at the top. Hero level remains visible. Preset editing and Apply confirmation fit were checked in the initial draft.
- Intermediate landscape 740 × 360: the dialog measures 716 × 336 px; every card fits without internal overflow or overlapping values/controls. Narrower columns place the current bonus above the stepper while retaining 44 px button columns.
- All 13 image instances in the revised preview reported loaded with nonzero natural width. New March Orders and Stoneworks emblems were visually inspected in the desktop cards and gallery. No browser warnings or errors were recorded.
- Default, saved, dirty, locked, empty, applied/selected, maximum, no-points, and insufficient-Gold states inspected through the review controls and local interactions.

## Interaction evidence

- Established live build: 69 spent / 6 unspent at Hero 76. Editing War Council to 60 spent and saving via Save & continue left the live build at 69 spent / 6 unspent.
- Dirty preset disabled Apply. Applying the saved Border Wardens example displayed a 32,400 Gold confirmation, marked its tab `selected applied`, and changed Current Build to 60 spent / 15 unspent.
- Free Reset returned all 60 points, leaving 0 spent / 75 unspent and preserving the saved preset.
- Veteran: 145 spent / 5 unspent. Removing Swordmastery's final level returned two points (143 / 7); adding it restored 145 / 5 and disabled further addition at maximum.
- All-points-spent example displayed zero unspent and disabled additions. Hero 10 example displayed four locked presets and 7 spent / 2 unspent.
- Insufficient-Gold example disabled Apply and displayed `Need 32,400 Gold · have 1,200`.
- Cancel retained an unsaved name. Discard restored the original preset. Close and Open Skills worked in the initial draft.
- Three-column scroll behavior: increasing Guild Charters while scrolled to the bottom changed 69 spent / 6 unspent to 70 spent / 5 unspent and retained scroll position 179 px. Reset example restored the sample and returned to the top. Keyboard scrolling was exercised; wheel scrolling was also verified in the earlier shared-scroll revision. Desktop keeps its existing three-column layout.

Production save/sync, server-side enforcement, real account balances, multiplayer effects, and deployment remain outside this isolated draft. Integration requires the repository's normal validation workflow after approval.
