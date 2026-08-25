# Crownlands player flags — visual QA

Open `docs/visual-qa/player-flags/index.html` through the local HTTP server. The page loads the production stylesheet cascade and SVG sprite, then checks every one of the 60 Primary/Accent/Icon swatches against its computed `background-color`.

The matrix includes all 14 patterns, all 24 heraldic symbols, own/clan/weaker/equal/stronger/neutral city relationships, two cities sharing one owner flag, a live ownership-change control, and six legacy/corruption fallbacks.

Use `mobile.html` for the bounded mobile-frame comparison. Required viewport checks:

- Desktop: 1440 × 900
- Mobile portrait: 390 × 844
- Mobile landscape: 844 × 390

The status banner must report `PASS`, the document must have no horizontal overflow, and the chosen flag colors must remain unchanged by relationship styling.

## HUD profile frame containment

The production profile frame has a rounded transparent aperture, while the HUD flag previously painted to a larger square box beneath it. The renderer already contained oversized pattern layers inside the flag box, but that box did not match the aperture, so color remained visible in the frame's antialiased inner corners.

The HUD-only rule now clips the flag to a percentage-based rounded inset. The outer `.profile-button` remains unclipped so the ornate frame, drop shadow, level badge, and focus treatment keep their full paint area. Generic flags on cities, profiles, reports, and leaderboards are unchanged.

Open `hud-frame-responsive.html` to review all 14 patterns with alternating stored v1/v2 flags at desktop, narrow landscape, and mobile portrait sizes. The production visual fixture reports `PASS · 69 computed visual checks`.

- `screenshots/hud-frame-before-live.png`: live-game HUD before the fix.
- `screenshots/hud-frame-after-desktop.png`: production renderer and frame after the fix, all patterns and both stored versions.
- `screenshots/hud-frame-after-narrow.png`: compact landscape media-query result.
- `screenshots/hud-frame-after-mobile.png`: portrait wrapping result.
