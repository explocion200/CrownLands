# Crownlands Pass 3A QA Notes

## Reviewed

- Art Bible alignment for the seven Pass 3A assets.
- Shared production spec in `docs/art-prompts/pass-3a/SHARED_VISUAL_SPEC.md`.
- Old vs new source masters for the login background, five city stages, and Crown Citadel.
- Gameplay-size optimized previews for Stage 1 through Stage 5 and Crown Citadel.
- Actual-map composites on Crownlands Heart and Redbanner Fields.
- Login UI screenshots at 1280x720 desktop and 915x412 mobile landscape.

## Accepted Production Art

- `assets/game-menu-background.jpg`: late-medieval Crownlands landscape with settlement, farmland, roads, smoke, and safe UI space.
- `assets/castles/shack.png`: Stage 1 frontier holding.
- `assets/castles/fort.png`: Stage 2 fortified village.
- `assets/castles/keep.png`: Stage 3 keep settlement.
- `assets/castles/castle.png`: Stage 4 fortified town.
- `assets/castles/city.png`: Stage 5 major Crownlands city.
- `assets/crown-citadel.png`: Crown Citadel.

## Candidate Art Rejected Or Corrected

- Initial city/Citadel sheet `call_bLrgipsW7pb9NrcELybe4tj4.png` was rejected for install because it used an olive gradient background instead of clean matte-ready transparency.
- Refined city/Citadel sheet `call_SnGtkrF662cA5zEzyPpN9rCP.png` was accepted only after chroma-key removal, crop extraction, and connected-component cleanup.
- Initial login background `call_ZWCGOyGsuzd5KICYm7bNDH5w.png` was refined because the lower-center composition was too busy behind the login UI.
- An intermediate alpha cleanup was rejected because a small Citadel fragment and one Stage 3 flag fragment survived outside the main silhouettes.

## Cohesion QA

- The five city stages now share camera pitch, road orientation, daylight, ground treatment, material palette, and settlement DNA.
- Progression reads as timber frontier holding -> fortified village -> keep settlement -> fortified town -> major city.
- Stage 3 is the main transition point from frontier settlement to stone-defended town, which matches the requested progression philosophy.
- Stage 1 remains readable at gameplay scale, though it is naturally the quietest silhouette.

## Citadel QA

- The Crown Citadel reads as the highest expression of the same civilization rather than a separate magical palace.
- It uses the same stone/timber/tile/burgundy language as Stage 5, with more layered walls, a stronger gate, and higher-status masonry.
- It avoids bright gold glow and keeps royal identity to banners, quality stonework, and restrained trim.

## Login QA

- Desktop 1280x720: title, sign-in panel, public navigation, fullscreen, music, Discord, and info panel remain readable.
- Mobile landscape 915x412: controls remain usable; title is compact and sits above the sign-in panel without blocking buttons.
- The background contains no baked Crownlands logo, labels, buttons, or UI text.
- The safe area works, but the mobile landscape layout remains dense because the login screen already has many required controls.

## Gameplay Map QA

- Crownlands Heart composite: city/Citadel assets sit naturally over the terrain, roads, farms, and central routes without hard matte boxes.
- Redbanner Fields composite: palette still reads cleanly on warmer/drier terrain; Citadel remains visible without glowing.
- Regional maps were not repainted. The new structures expose that future map art should eventually use slightly less high-fantasy brush detail around mountains and road intersections.

## Remaining Issues

- Four role Strongholds still use older art and should be next.
- Camps, Inner Castle, officer portraits, consumables, pickups, loading ring/crown, and map transition raster still need future passes.
- Authenticated live-game HUD/profile/shop QA still needs a signed-in browser automation session or manual production review.
- `tools/validate-asset-performance-budgets.js` still fails on the existing `game.js` source-entry budget: 1604.2 KiB vs 1600 KiB. The new optimized art files are within their category budgets, and `tools/validate-production-artifact.js` passes with a 21.48 MiB artifact.

## Validation Results

- `git diff --check`: passed; Git printed CRLF normalization warnings only.
- `node --check game.js`: passed.
- `node --check service-worker.js`: passed.
- `node --check tools/validate-map-image-loading.js`: passed.
- `node --check tools/validate-login-resilience.js`: passed.
- `node tools/validate-map-image-loading.js`: passed.
- `node tools/validate-runtime.js`: passed.
- `node tools/validate-daily-login-rewards.js`: passed.
- `node tools/validate-public-site-content.js`: passed.
- `node tools/validate-animation-system.js`: passed.
- `node tools/build-production-client.js`: passed; built `dist` with 234 files at 21.46 MiB before artifact stamping.
- `node tools/validate-production-artifact.js`: passed; validated 235 files at 21.48 MiB.
- `node tools/validate-login-resilience.js`: passed.
- `node tools/validate-audio-delivery.js`: passed.
- `node tools/validate-patch-notes.js`: passed.
- `node tools/validate-instant-economy-actions.js`: passed.
- `node tools/validate-asset-performance-budgets.js`: failed only on `game.js` source size, 1604.2 KiB vs 1600 KiB.
