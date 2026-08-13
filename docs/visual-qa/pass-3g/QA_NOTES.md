# Pass 3G Visual QA Notes

## Scope

Pass 3G replaces the global HUD bitmap family, profile plaque, Daily Rewards mark, map-switch arrow, loading ring/crown, favicon, and normal/maskable PWA identity. It also consolidates global interaction, unread, timer, military warning, resource, loading, and map-transition presentation. No gameplay, Firebase, economy, operation timing, map coordinates, item behavior, or server rule was changed.

## Production Art Review

Accepted:

- Leaderboard: three ranked heraldic standards on a parchment record.
- City List: compact settlement gate and steward record.
- Map: folded parchment with roads and settlement marks, no GPS pin.
- Shop: merchant scale and market goods.
- Bag: leather quartermaster satchel.
- Reports: folded military dispatch and dark wax seal.
- Achievements: deed parchment and heraldic honor seal.
- Daily Rewards: steward calendar and burgundy wax claim mark.
- Profile: compact oak/iron ruler plaque.
- Map switch: light carved directional sign.
- Loading: engraved iron ring and unified hammered crown.
- PWA identity: crown over a stone gate on weathered burgundy cloth.

Rejected:

- The first City List generation was rejected because it became a miniature settlement scene rather than a compact readable record icon. A second candidate with a single gate/ledger silhouette was generated and installed.

The accepted source candidates are archived in `generated-candidates/`; old production art is archived in `old-assets/` for development comparison only.

## Cohesion Review

1. Late-medieval read: Pass. Objects use oak, parchment, leather, iron, wax, cloth, and restrained brass.
2. Shiny gold: Pass. Gilt is limited to crown/royal identity and small hardware.
3. Modern glass UI: Pass. Global surfaces use physical depth and opaque material families.
4. Rounded cards: Pass. HUD controls are squared or minimally rounded.
5. Physical materials: Pass. Icon subjects and interaction states read as handled objects.
6. Icon cohesion: Pass. Shared warm light, elevated object view, edge wear, and detail density.
7. Fantasy mobile-game residue: Reduced substantially. Regional maps and the retained transition-cloud raster remain outside this icon family.
8. Text readability: Pass at desktop and Android landscape; timers use compact system numerals.
9. Button clarity: Pass. Pressed, selected, unread, active, disabled, and warning states remain distinguishable.
10. Mobile landscape: Pass at 844x390 with no horizontal/vertical overflow in the state board or live entry screen.

## Glyph Audit

- Removed the remaining CSS Unicode clan-search marker and replaced it with a CSS-drawn lens.
- Updated Crown and Gold sprite forms to match the new crown/coin language.
- Retained code-native attack, transfer, scout, reports, fullscreen, sound, and navigation SVGs because their silhouettes are clearer than raster replacements at tiny sizes.
- Scout remains a historically grounded eye/watcher mark; no telescope is used.
- Fullscreen and sound retain familiar functional metaphors but share the Crownlands line weight and `currentColor` state system.
- Main runtime emoji scan passed for sword, horse, telescope, crown, shield, castle, scroll, music, and speaker emoji.

## Screenshots

- `01-login-desktop.png`: live signed-out app at 1440x900.
- `02-hud-desktop.png`: production-asset HUD state board at 1440x900, including selected city, active effects, outgoing marches, incoming attack, gold, and Citadel warning.
- `03-hud-android-landscape.png`: same state board at 844x390.
- `04-loading-transition-pwa.png`: loading seal, regional mist treatment, favicon, normal icon, and maskable preview.
- `05-login-android-landscape.png`: live signed-out app at 844x390.
- `old-asset-contact.jpg` and `new-asset-contact.jpg`: family-level source comparison.

The QA browser was not authenticated to Firebase, so live authenticated HUD states were represented by the development-only state board using the actual optimized production files and final state colors. The live login/entry screen was reviewed directly.

## Responsive Results

Desktop 1440x900:

- No broken images.
- HUD state board occupies a stable 16:9 map frame.
- Military warning remains visually stronger than normal navigation.
- City selection, effects, map actions, and operation controls do not overlap.

Android landscape 844x390:

- Page, runtime frame, and live login report exactly 844x390 with no overflow.
- Ruler plaque remains readable; touch controls remain 44-52px in the state board.
- Selected city remains central and unobstructed.
- Effects, map actions, Reports, Marches, Incoming, and Citadel timer do not collide.

## Dimensions And Payload

- Standard HUD runtime: 192x192 RGBA WebP.
- Daily runtime: 160x160 RGBA WebP.
- Profile runtime: 256x200 RGBA WebP.
- Map-switch runtime: 192x212 RGBA WebP.
- Loading runtime: two 256x256 RGBA WebPs.
- PWA/favicons: opaque 32, 192, and 512px PNG derivatives from a 1254px master.

The 12 HUD/loading source masters changed from 14,387,181 to 13,057,444 bytes (-1,329,737; -9.2%). Their combined optimized runtime payload changed from 172,770 to 134,048 bytes (-38,722; -22.4%). The four PWA normal/maskable files changed from 439,851 to 406,204 bytes (-33,647; -7.6%); the editable 1254px PWA master is excluded from production.

## Remaining Issues

- Regional maps and generated thumbnails remain the largest old raster family.
- `assets/map-transition-clouds.png` is retained. New CSS makes it natural/desaturated mist, but it should eventually be regenerated alongside the map family.
- Low-frequency public/help-page art and editor-only visual controls were not a Pass 3G target.
- The unrelated `game.js` source-size guard remains approximately 1604.6 KiB against a 1600 KiB budget.
- Two pre-existing route-helper lint warnings remain outside this visual pass.
