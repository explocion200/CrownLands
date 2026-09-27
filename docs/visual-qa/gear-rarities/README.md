# Rarity promotion visual checks

Captured from the real local game with synthetic gear and API stubs; no production account was used.

- All four officer screens: five rarities at 1440×900 and 568×320; earlier common states also cover 1024×768, 844×390 and 667×375.
- Result artwork decodes, rarity/level and Gold are correct, promotion controls remain inside the viewport, and confirmations preserve keyboard focus.
- Browser checks also cover duplicate clicks, an uncertain response retaining its request ID/quote, and obsolete-session responses being ignored.
- Run `node tools/validate-barracks-gear-browser.js` for the combined rarity scenarios; run the other officer browser validators for their existing interactions and layout.

The two images show Common 5 → Uncommon 1 on the smallest landscape fixture and Epic 5 → Legendary 1 on desktop. They use synthetic Gold and skills.

## Large inventory check

`node tools/validate-gear-inventory-browser.js` uses 2,000 synthetic items, an 844×390 viewport and 4× CPU throttling. The first implementation took 16,053 / 14,725 / 14,663 ms to build and lay out the officer screen. The pricing preview unnecessarily recalculated city production for every bag group, even when authoritative pricing was present. One per-render material index and shared price now avoid that repeated work. The same local fixture measured 131 / 123 / 143 ms after the fix. These are synthetic render/layout timings, not production latency or network measurements. The automated check enforces the pricing read bound and records timings without a hardware-dependent timing threshold.
