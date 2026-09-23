# Main screen art — approval draft

Status: **DRAFT — not integrated into the production entry, not pushed or deployed.**

Branch: `codex/main-screen-art-draft`. Base: `7711dcaf8cd2d1cfc731edcae4358d409abc74b4`.

## Review

Start `node tools/map-benchmark/start-server.js 61704`, then open:

`http://127.0.0.1:61704/docs/visual-qa/main-screen-art/index.html?viewport=desktop`

Choose Desktop (1440 × 900), Mobile landscape (844 × 390), or Small landscape (568 × 320). The iframe uses actual CSS pixels without scaling. Current game / New artwork switches the same mounted HUD, so sizes, positions and map context can be compared directly. Try map zoom, the mini-chat arrow, and the active/quiet/protected examples. The artwork gallery below the map allows closer inspection.

This page mounts the repository's current real game through the existing loopback benchmark server, with its mock Firebase adapter and synthetic player/map/chat data. Production account services and the production entry are not used. Main navigation clicks show an appearance-preview message instead of entering account flows; the real chat toggle and map zoom still work. No new gameplay behavior is proposed.

## Audit and proposed treatment

| Main screen surface | Current source | Draft |
| --- | --- | --- |
| Bag | `hud-bag-192x192-8d79a1879913.webp` | Hand-inked leather satchel; transparent new raster |
| Shop | `hud-shop-192x192-631cf3c626d5.webp` | Matte brass scales, ledger; transparent new raster |
| Cities | `hud-city-list-192x192-29705553a45a.webp` | Limestone gateway, slate roof, parchment; transparent new raster |
| Maps | `hud-map-192x192-f330cd084a9f.webp` | Folded ink-and-wash map; transparent new raster |
| Leaderboards | `hud-leaderboard-192x192-8817d6f254ec.webp` | Crown and olive laurel, drawn in the newer SVG icon language |
| Daily Login | `daily-reward-160x160-9bd7a936016f.webp` | Existing approved `reward-daily-login-r1.svg` |
| Reports | `hud-report-192x192-21644b7390fb.webp` | Existing approved `battle-reports-ledger-r1.svg#dispatch` |
| Player flag frame | `hud-profile-frame-256x200-06acc18a9261.webp` | Flat brass/parchment frame; actual saved flag and level retained |
| Clan | Actual heraldry renderer | Keep complete saved heraldry and notification counts; restyle the surrounding tile |
| Gold, Home, Fullscreen, chat arrow | Existing HUD DOM and symbols | Warm parchment surface, brass edge, brown ink; same shapes and values |
| Active item indicators | Four recently approved shared item images | Keep artwork and passive vertical placement; parchment surrounds, legible dark timers |
| Incoming / Outgoing / unread counts | Existing movement stack | Muted brick red for danger, slate blue for outgoing, small red wax-colored notification badges |

The current root cause of the visual mismatch is the combination of glossy legacy HUD rasters and the shared burgundy HUD rule in `crownlands-palette.css`. This draft scopes overrides to `.hud-art-draft` and explicit main-screen IDs; it does not change the global palette or existing panel styles.

The restyle proposes changing the burgundy chat-toggle and active-item surrounds confirmed on September 20. This is presented for approval in response to the user's new request to restyle the main screen's red buttons. The authoritative Master Specification remains unchanged until that replacement is approved. The approved mini-chat 64px height, 360px cap, exact 72% brown background, arrow direction and individual translation behavior remain inherited from current main.

Map nodes, player/clan heraldry, pickup Gold/Troop artwork, 56px map action buttons, cooldown and retaliation rules, and all panel content remain unchanged. Existing shared rasters elsewhere in the game remain unchanged until the new draft is approved and reference replacements can be audited together.

## Artwork

The built-in `image_gen` tool produced four separate edits using each original HUD image as the subject and the live Core Expansion map as the style reference. Full prompts and original output filenames are recorded in `art/provenance.json`. The final workspace assets are `art/hud-{bag,shop,cities,map}-r1.webp`, 384 × 384 with preserved transparency, approximately 181 KiB combined. Only resizing and WebP encoding followed generation; no creative editing by a script. Full-resolution originals remain in the generator output directory.

The profile frame and leaderboard emblem are code-native SVGs, matching the existing vector icon system. The Daily Login and Reports assets reuse the current approved SVGs.

## Validation and boundaries

Run `node tools/validate-main-screen-art-draft-browser.js`.

- Compare every main button's bounds before/after at all three viewports.
- Verify visible hit targets, loaded artwork, preserved saved flag markup, unchanged timer width, unchanged mini-chat height/background and working expand/collapse.
- Verify changing map zoom to 220% does not resize the HUD.
- Show incoming/outgoing notices, all four active items, and no active items.
- Exercise the review shell's look, sample and native viewport controls; save screenshots and result JSON under ignored `release-artifacts/main-screen-art/`.
- Check page exceptions and image/script/stylesheet failures. The benchmark's pre-existing `/play/?updateCheck=...` fetch can return 404 because the local fixture server has no production `/play/` route; this is not an artwork request.

The smallest 568px viewport inherits an existing overlap between expanded mini-chat and the lower active-item indicators. This draft deliberately preserves the main game's geometry; it does not claim to fix that separate layout issue. It is visible in both looks. Desktop and 844px landscape remain the main approval views.

No backend or multiplayer mechanics are modified, so no emulator suite applies. Runtime integration, broader shared-asset replacement, PR checks, merge and deployment are pending design approval.
