# Rarity promotion visual checks

Captured from the real local game with synthetic gear and API stubs; no production account was used.

- All four officer screens: five rarities at 1440×900 and 568×320; earlier common states also cover 1024×768, 844×390 and 667×375.
- Result artwork decodes, rarity/level and Gold are correct, promotion controls remain inside the viewport, and confirmations preserve keyboard focus.
- Browser checks also cover duplicate clicks, an uncertain response retaining its request ID/quote, and obsolete-session responses being ignored.
- Run `node tools/validate-barracks-gear-browser.js` for the combined rarity scenarios; run the other officer browser validators for their existing interactions and layout.

The two images show Common 5 → Uncommon 1 on the smallest landscape fixture and Epic 5 → Legendary 1 on desktop. They use synthetic Gold and skills.
