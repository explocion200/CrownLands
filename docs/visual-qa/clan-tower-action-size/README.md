# Approved Clan Tower action size

Branch: `codex/clan-tower-action-size-review`. Base: `aa8659da92aeee5770e6df13e3fbee5d480e1474`.

The user selected **56 × 56 CSS pixels** on September 23, 2026 after comparing 56px, 64px and 72px. This matches the game's existing setting: 4px gaps, 8px clearance beneath building labels, and an inverse camera transform keeping the controls constant at every map zoom on desktop and mobile landscape. The confirmed size is recorded in the Master Specification. No production runtime, gameplay, backend or styling changes are necessary.

## Review

Run `node tools/map-benchmark/start-server.js 61704`, then open:

`http://127.0.0.1:61704/docs/visual-qa/clan-tower-action-size/index.html?viewport=landscape&sample=rival&size=56&zoom=40`

Move the map zoom slider to see the approved 56px controls remain fixed. Switch between the current window, 1440 × 900 desktop, 844 × 390 mobile landscape, and 568 × 320 small landscape. Rival towers show Scout–Info–Rally Attack; owned towers show Store–Info–Send. The full-window link opens the approved size and selected zoom without the review controls. The unapproved size options have been removed; older comparison URLs now show 56px.

The preview does not scale its iframes to fit. Fixed viewports scroll when necessary. Measurements report `getBoundingClientRect()` dimensions in CSS pixels; view with browser zoom at 100%. Physical pixels depend on the device's pixel density. Actual map zoom respects the game's viewport cover limit (approximately 45% minimum at 1440 × 900 on this sample), and its current value is displayed.

The earlier Clan Castle review applied a CSS scale to the entire preview when it exceeded the available width, so it was not a reliable 1:1 button-size reference. This review reuses the actual game and the existing mock Clan Castle fixture. Following approval, the comparison's layout override was removed entirely: measurements now read the unchanged production controls. Icons, labels, colors and building art/placement are preserved. The camera recenters the row when using the zoom controls to keep the actions visible. A preview-only observer updates the measurement readout after camera transforms without replacing game functions.

## Focused verification

`node tools/validate-clan-tower-action-size-browser.js` passed all nine combinations of the approved 56px production controls across three viewport sizes and three zoom requests (40%, 70%, 100%, constrained to the game's normal bounds), with no browser exceptions. It checks measured size invariance, 4px spacing, 8px building-label clearance, visible/unobscured control centers, action ordering, normal map-art scaling, the absence of preview sizing overrides, old comparison URLs, and the actual review's zoom control and untransformed iframe. The earlier 27-combination comparison passed before the user selected 56px. Local evidence is in ignored `release-artifacts/clan-tower-action-size/`.

A read-only public-source check on September 23 verified that both `playcrownlands.com` and `game.playcrownlands.com` serve build `aa8659da92aeee5770e6df13e3fbee5d480e1474`. Their `game.js`, `holding-tower-ui.css`, `clan-tower-details-ui.css` and `action-buttons.css` hashes match the unchanged production sources exercised in the browser checks. The selected 56px behavior is already present in those published assets. This was source verification, not an authenticated production interaction or a new deployment.

The size decision is complete. The repository PR workflow validates this review and records the approval; merging/deployment are separate release actions. No backend deployment is needed.
