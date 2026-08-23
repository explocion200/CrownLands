# Item Bag visual QA

This fixture uses the production Crownlands stylesheet cascade and the seven real Bag item types and optimized assets. Counts are expanded into individual presentation cards; the fixture does not invent Gold Boost or Troop Boost inventory records.

Required capture states:

- Desktop: All, selected Royal Peace Shield, actual Boosts category, and All page 2.
- 844×390: All page 1, All page 2, selected Royal Peace Shield, and Boosts.
- 540×320: selected Royal Peace Shield.

The fixture is visual-only. Authoritative consumption, timers, and projected-count behavior are covered by runtime validators and Firebase emulator tests.

## Verified results

- Desktop 1200×800: eight visible cards, no document or modal overflow.
- Landscape 844×390: eight visible cards, modal bottom 387.2px, selected panel bottom 379.6px, no document or modal overflow.
- Landscape 540×320: eight visible cards, modal bottom 317.2px, selected panel bottom 309.6px, Use button fully visible, no document or modal overflow.
- Page 2 contains the seven remaining cards with no artificial empty slots and clears the hidden selection.
- Boosts contains three War Drums and two Royal Tax Decrees as individual presentation cards.
- Arrow-key category navigation changes the selected tab and restores focus to the newly rendered tab.
- Browser console: no warnings or errors.

## Captures

| Viewport | State | Screenshot |
| --- | --- | --- |
| 1200×800 | All | `screenshots/desktop-all.png` |
| 1200×800 | Royal Peace Shield selected | `screenshots/desktop-peace-shield.png` |
| 1200×800 | All, page 2 | `screenshots/desktop-page-2.png` |
| 1200×800 | Boosts | `screenshots/desktop-boosts.png` |
| 844×390 | All | `screenshots/landscape-844-all.png` |
| 844×390 | Royal Peace Shield selected | `screenshots/landscape-844-peace-shield.png` |
| 844×390 | All, page 2 | `screenshots/landscape-844-page-2.png` |
| 844×390 | Boosts | `screenshots/landscape-844-boosts.png` |
| 540×320 | Royal Peace Shield selected | `screenshots/landscape-540-peace-shield.png` |
