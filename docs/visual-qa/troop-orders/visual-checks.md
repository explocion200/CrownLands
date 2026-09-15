# Troop Orders draft checks

Checked September 15, 2026 in the local in-app browser. Synthetic UI fixtures only; no production account or server operations.

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
