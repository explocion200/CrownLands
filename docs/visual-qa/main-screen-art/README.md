# Main screen art — approved design

Status: **APPROVED — integrated into the actual game on the feature branch; merge and deployment pending.**

Branch: `codex/main-screen-art-draft`. Base: `7711dcaf8cd2d1cfc731edcae4358d409abc74b4`.

## Review

Start `node tools/map-benchmark/start-server.js 61704`, then open:

`http://127.0.0.1:61704/docs/visual-qa/main-screen-art/index.html?viewport=desktop`

Choose Desktop (1440 × 900), Mobile landscape (844 × 390), or Small landscape (568 × 320). The iframe uses actual CSS pixels without scaling. Current game / Restyled artwork switches the same mounted HUD, so sizes, positions and map context can be compared directly. Try map zoom, the mini-chat arrow, and the active/quiet/protected examples. The artwork gallery below the map allows closer inspection.

The user requested retaining the original red backgrounds and top icon designs. The current revision restores the exact inherited main-screen colors and surfaces, and redraws the original ornate top artwork in the map's illustrated style. The earlier parchment controls and simplified top emblems are superseded.

This page mounts the repository's current real game through the existing loopback benchmark server, with its mock Firebase adapter and synthetic player/map/chat data. Production account services and the production entry are not used. Main navigation clicks show an appearance-preview message instead of entering account flows; the real chat toggle and map zoom still work. No new gameplay behavior is proposed.

## Audit and proposed treatment

| Main screen surface | Current source | Draft |
| --- | --- | --- |
| Bag | `hud-bag-192x192-8d79a1879913.webp` | Hand-inked leather satchel; transparent new raster |
| Shop | `hud-shop-192x192-631cf3c626d5.webp` | Matte brass scales, ledger; transparent new raster |
| Cities | `hud-city-list-192x192-29705553a45a.webp` | Limestone gateway, slate roof, parchment; transparent new raster |
| Maps | `hud-map-192x192-f330cd084a9f.webp` | Folded ink-and-wash map; transparent new raster |
| Leaderboards | `hud-leaderboard-192x192-8817d6f254ec.webp` | Same ornate crown medallion, blue heraldic field, gold laurel and small shield; ink-and-wash redraw |
| Daily Login | `daily-reward-160x160-9bd7a936016f.webp` | Same standing gilt calendar with crown page, blue ribbons and gold coins; ink-and-wash redraw |
| Reports | `hud-report-192x192-21644b7390fb.webp` | Existing approved `battle-reports-ledger-r1.svg#dispatch` |
| Player flag frame | `hud-profile-frame-256x200-06acc18a9261.webp` | Same decorated brass frame with slate inlay, side banners and tassels; transparent illustrated redraw; actual flag and level retained |
| Clan | Actual heraldry renderer | Original complete saved heraldry, original red tile and notification counts |
| Gold, Home, Fullscreen, chat arrow | Existing HUD DOM and symbols | Original backgrounds, colors, borders, labels, shapes and values |
| Active item indicators | Four recently approved shared item images | Original artwork, passive vertical placement, burgundy surrounds and timers |
| Incoming / Outgoing / unread counts | Existing movement stack | Original red/blue surfaces and notification styling |

The remaining mismatch is the glossy rendering of legacy HUD artwork. The user wants the existing burgundy surfaces in `crownlands-palette.css` retained. The revised draft therefore overrides artwork only, scoped to `.hud-art-draft`; the original button background gradients, borders, text colors and dimensions are inherited unchanged.

The September 20 burgundy chat-toggle and active-item surrounds remain as approved. The mini-chat 64px height, 360px cap, exact 72% brown background, arrow direction and individual translation behavior remain inherited from current main. This pending artwork draft changes no authoritative gameplay or presentation rule.

Map nodes, player/clan heraldry, pickup Gold/Troop artwork, 56px map action buttons, cooldown and retaliation rules, and all panel content remain unchanged. This approval covers main-screen artwork; other panels and public-site references retain their current images.

## Actual-game integration

`index.html` loads `main-screen-art-ui.css` and the seven approved WebP files, copied byte-for-byte into `assets/optimized/hud-*-ink-*`. The stylesheet is scoped to `body.hud-illustrated` and changes only image rendering and the player frame. Main-screen Reports uses the existing dispatch SVG. The service worker precaches the component and art; the production builder and artifact validator require them. No gameplay JavaScript or backend code changes.

The local review fixture explicitly restores the legacy assets for Current game, so it remains a before/after reference after integration. It never supplies the production runtime implementation.

## Artwork

The built-in `image_gen` tool produced seven separate edits using each original HUD image as the subject and the live Core Expansion map as the style reference. Full prompts and original output filenames are recorded in `art/provenance.json` and `art/top-art-provenance.json`. Final workspace assets are `art/hud-{bag,shop,cities,map,leaderboard,daily-reward}-r1.webp` at 384 × 384, and `art/hud-profile-frame-r1.webp` at 512 × 400, with preserved transparency. Only resizing and WebP encoding followed generation; no creative editing by a script. Full-resolution originals remain in the generator output directory.

Reports reuses the existing approved dispatch SVG. The simplified profile/leaderboard SVGs and generic Daily Login calendar from the first draft have been removed from the current proposal.

## Validation and boundaries

Run `node tools/validate-main-screen-art-draft-browser.js` and `node tools/validate-main-screen-art-browser.js`.

- Compare every main button's bounds before/after at all three viewports.
- Compare original and draft computed backgrounds, text colors and borders; preserve the original red surfaces exactly.
- Verify visible hit targets, loaded artwork, preserved saved flag markup, unchanged timer width, unchanged mini-chat height/background and working expand/collapse.
- Verify changing map zoom to 220% does not resize the HUD.
- Show incoming/outgoing notices, all four active items, and no active items.
- Exercise the review shell's look, sample and native viewport controls; save screenshots and result JSON under ignored `release-artifacts/main-screen-art/`.
- Check page exceptions and image/script/stylesheet failures. The benchmark's pre-existing `/play/?updateCheck=...` fetch can return 404 because the local fixture server has no production `/play/` route; this is not an artwork request.
- The actual-game validator loads the production entry without the preview fixture, verifies all runtime art matches approved bytes, exercises pointer clicks on Bag, Shop, Cities, Maps, Leaderboards, Daily Login, Reports and Profile, tests the chat arrow and map zoom, and compares geometry/colors with the art skin toggled. All three viewports pass; screenshots and result JSON are under `release-artifacts/main-screen-art-game/`.

The smallest 568px viewport inherits an existing overlap between expanded mini-chat and the lower active-item indicators. This draft deliberately preserves the main game's geometry; it does not claim to fix that separate layout issue. It is visible in both looks. Desktop and 844px landscape remain the main approval views.

No backend or multiplayer mechanics are modified, so no emulator suite applies. Design approval is recorded in the Master Specification. Required PR checks must pass before merge; production deployment remains unverified until explicitly authorized and completed.
