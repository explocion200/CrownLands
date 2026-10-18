# Location button artwork

The owner approved the generated medieval folded-map and burgundy-pennant icon on October 18, 2026, then requested square buttons throughout the game without increasing the existing rows or panels.

`location-map-flag-v1.png` is the unchanged approved source. `delivery.json` records the transparent 192 × 192 WebP made with the existing `tools/optimize-game-art.py` `build_asset` pipeline (HUD category, quality 88). The 14.4 KiB delivery asset loads on demand; the source PNG is not shipped in the game package.

`location-buttons.css` draws the artwork inside fixed button dimensions. Destination names and action handlers remain in their existing screens. `tools/validate-location-buttons-browser.js` compares rendered geometry against the previous screen styling at desktop and landscape-mobile sizes, checks image decoding/transparency and writes review screenshots under ignored `release-artifacts/location-buttons/`.
