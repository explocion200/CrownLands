# Crownlands player flags — visual QA

Open `docs/visual-qa/player-flags/index.html` through the local HTTP server. The page loads the production stylesheet cascade and SVG sprite, then checks every one of the 60 Primary/Accent/Icon swatches against its computed `background-color`.

The matrix includes all 14 patterns, all 24 heraldic symbols, own/clan/weaker/equal/stronger/neutral city relationships, two cities sharing one owner flag, a live ownership-change control, and six legacy/corruption fallbacks.

Use `mobile.html` for the bounded mobile-frame comparison. Required viewport checks:

- Desktop: 1440 × 900
- Mobile portrait: 390 × 844
- Mobile landscape: 844 × 390

The status banner must report `PASS`, the document must have no horizontal overflow, and the chosen flag colors must remain unchanged by relationship styling.
