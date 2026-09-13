# Skills draft review checks

Checked September 13, 2026 in the Codex in-app browser against the local repository preview server. These are draft checks, not production or multiplayer certification.

## Layout and assets

- Desktop 1440 × 900: all eight skill cards visible; no card scroll overflow; enlarged illustrated icons, current/cap/level values, next bonus, and point controls visible.
- Three-column landscape 844 × 390: all eight skills remain in their desktop groups with compact cards and a shared scrollbar. The area has 213 px of visible height and 392 px of content. At its 179 px maximum scroll position, Field Medics and Guild Charters are fully reachable. Header, preset tabs, totals, and actions remain fixed above it. All three category headings stay visible.
- Small landscape 568 × 320: all eight cards are 122 px tall with no internal overflow or overlapping values/controls. At the 259 px maximum scroll position, Field Medics and Guild Charters are fully inside the window. The first row's complete controls fit at the top. Hero level remains visible. Preset editing and Apply confirmation fit were checked in the initial draft.
- Intermediate landscape 740 × 360: the dialog measures 716 × 336 px; every card fits without internal overflow or overlapping values/controls. Narrower columns place the current bonus above the stepper while retaining 44 px button columns.
- The latest category headings contain only Attack, Defense, and Utility, with zero header images. Desktop and both landscape sizes were checked; the three-column layout and small-screen card fit are preserved.
- All 10 image instances in the latest preview reported loaded with nonzero natural width. Swordmastery's connected blade/hilt was visually inspected in the cards and gallery. March Orders and Stoneworks were inspected during their earlier revisions. No browser warnings or errors were recorded.
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

## Approved integration checks — September 13, 2026

The actual game was exercised through the localhost benchmark fixture with mock services, using the existing Skills handlers.

- Desktop 1440 × 900: all eight illustrated cards fit; title, close action, and name-only disciplines remain readable.
- Landscape 844 × 390 and 568 × 320: three columns, compact cards, fixed controls, and shared scrolling inspected. At the bottom, Guild Charters incremented successfully while the last row and all discipline names remained visible.
- Live Swordmastery increment changed 69/6 to 70/5 spent/unspent; minus restored the weighted point.
- Saved a renamed Battle Council preset with 60 assigned points, then applied it through the existing Gold confirmation. The preset became Active with burgundy selection and a gold outline.
- Insufficient Gold displayed Need 32K Gold / have 1.2K and disabled Apply.
- Veteran Swordmastery refund returned two points (145/5 to 143/7); adding the final level restored them. Free Reset returned all 150 earned points and kept War Council saved.
- Leaving Skills removed its scoped class and restored the Profile ledger.
- Focused validators passed for Skills, preset costs/refunds/affordability, Profile theme, and bounded asset size. The release workflow records the required repository and GitHub gates separately.

No production account was used for a spending mutation. Backend authority is covered by the required emulator gates; live deployment verification checks published build identity and assets.
