# Clan Tower action size review

Branch: `codex/clan-tower-action-size-review`. Base: `aa8659da92aeee5770e6df13e3fbee5d480e1474`.

The user asked to see the true size of Scout, Info and Rally controls while zooming, and to choose a size before applying it. No new size is approved yet. Production remains at the previously approved 56 × 56 CSS pixels, with 4px gaps and 8px clearance beneath building labels. No gameplay, production styling, master-spec decision or release changes are included.

## Review

Run `node tools/map-benchmark/start-server.js 61704`, then open:

`http://127.0.0.1:61704/docs/visual-qa/clan-tower-action-size/index.html?viewport=landscape&sample=rival&size=56&zoom=40`

Choose 56px (current), 64px or 72px and move the map zoom slider. Switch between the current window, 1440 × 900 desktop, 844 × 390 mobile landscape, and 568 × 320 small landscape. Rival towers show Scout–Info–Rally Attack; owned towers show Store–Info–Send. The full-window link opens the selected size and zoom without the review controls.

The preview does not scale its iframes to fit. Fixed viewports scroll when necessary. Measurements report `getBoundingClientRect()` dimensions in CSS pixels; view with browser zoom at 100%. Physical pixels depend on the device's pixel density. Actual map zoom respects the game's viewport cover limit (approximately 45% minimum at 1440 × 900 on this sample), and its current value is displayed.

The earlier Clan Castle review applied a CSS scale to the entire preview when it exceeded the available width, so it was not a reliable 1:1 button-size reference. The production Tower row already uses an inverse camera transform to keep its 56px dimensions constant. This review reuses the actual game and the existing mock Clan Castle fixture, with a benchmark-only layout wrapper for the two unapproved size options. It preserves the inverse transform, action handlers, icons, labels, colors and building art/placement. The camera recenters the row when using the size/zoom controls to keep the comparison visible.

## Focused verification

`node tools/validate-clan-tower-action-size-browser.js` passed: 27 combinations across three viewport sizes, three button sizes, and three zoom requests (40%, 70%, 100%, constrained to the game's normal bounds). It checks measured size invariance, 4px spacing, 8px building-label clearance, visible/unobscured control centers, action ordering, normal map-art scaling, and the actual chooser's controls and untransformed iframe. No browser exceptions were recorded. Screenshots were reviewed for desktop and landscape views. Local evidence is in ignored `release-artifacts/clan-tower-action-size/`.

This is a local draft pending the user's size choice. No PR, merge or deployment has been performed for it. The release validation/PR workflow will run when the chosen production update is ready.
