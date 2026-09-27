# Rarity promotion visual checks

Captured from the real local game with synthetic gear and API stubs; no production account was used.

- All four officer screens: five rarities at 1440×900 and 568×320; earlier common states also cover 1024×768, 844×390 and 667×375.
- Result artwork decodes, rarity/level and Gold are correct, promotion controls remain inside the viewport, and confirmations preserve keyboard focus.
- Browser checks also cover duplicate clicks, an uncertain response retaining its request ID/quote, and obsolete-session responses being ignored.
- Run `node tools/validate-barracks-gear-browser.js` for the combined rarity scenarios; run the other officer browser validators for their existing interactions and layout.

The two images show Common 5 → Uncommon 1 on the smallest landscape fixture and Epic 5 → Legendary 1 on desktop. They use synthetic Gold and skills.

## Large inventory check

`node tools/validate-gear-inventory-browser.js` uses 2,000 synthetic items, a visible 844×390 dialog and 4× CPU throttling. It also scrolls to the final card and selects it using pointer input.

The first pricing implementation repeatedly recalculated city production even when authoritative pricing was present. Isolated dialog-content construction (dialog closed, not visible rendering) measured 16,053 / 14,725 / 14,663 ms. A per-render material index and shared price reduced that isolated work to 131 / 123 / 143 ms.

A separate visible-dialog measurement then exposed offscreen card layout: 2,281 / 2,223 / 2,015 ms despite the pricing fix. Deferring offscreen card layout reduced the same visible fixture to 657 / 695 / 747 ms in the final local run. Scrolling and selecting the final item passed. These are synthetic CPU-throttled build/layout timings; they exclude network completion and do not establish production or device-wide latency. The automated check enforces correct prices, bounded production reads, a visible dialog and reachable offscreen items, and records timings without a hardware-dependent threshold.
