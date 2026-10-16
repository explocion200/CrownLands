# Named bottom-right HUD images

The owner requested the same illustrated image-button treatment as the approved
top HUD for the four bottom-right controls: **Bag**, **Shop**, **Cities**, **Map**.
Names are incorporated into parchment ribbons; the existing illustrations remain
recognizable. No additional text row, larger target or rearrangement is introduced.

The built-in `image_gen` tool edited each existing icon using the approved Daily
button as a ribbon/style reference. The generated RGBA originals are retained
byte-for-byte here as `bag-button.png`, `shop-button.png`, `cities-button.png` and
`map-button.png`. [prompts.json](prompts.json) records every exact prompt and input
reference. No CLI image-generation fallback was used.

Four 192 × 192 WebP derivatives were prepared with the existing
`tools/optimize-game-art.py` `build_asset` delivery function, quality 92, preserving
the full square canvas and alpha. [runtime-assets.json](runtime-assets.json)
records the source/delivery hashes and dimensions. The combined runtime payload
is 91,982 bytes, bounded at 92 KiB with the existing 32 KiB per-image cap.
The source PNGs are excluded from production. Images use the existing runtime
cache rather than increasing installation preload. The versioned HUD stylesheet
also stays in the offline shell.

Production keeps the original button IDs, handlers, accessible names, dynamic city
count, current-map tooltip and conditional Map visibility. Window headers retain
their original unlabeled artwork. The top HUD's dynamic clan shield and reward
badges remain unchanged. The transparent background/focus styling is shared with
the approved top buttons; positioning and dimensions remain in the original CSS.

Before this change, the synthetic production benchmark measured 64 × 64 targets
at 1440 × 900 and 844 × 390; at 568 × 320 its fine-pointer layout measured
56 × 64. Preserve those existing values, 76px horizontal steps and a 12px bottom
inset. Coarse-pointer, fullscreen and cutout cases are checked independently.

Validation uses `tools/validate-main-screen-art-browser.js` for desktop and both
landscape widths, decoded images/alpha, ribbon containment, original geometry,
mouse/keyboard/touch actions, visible focus, current clan shields and existing
Inner Castle behavior. `tools/validate-hud-screen-edge-browser.js` covers 18
window/fullscreen/cutout configurations; `tools/validate-map-picker-input.js`
covers Map interactions and preventing accidental Shop/Bag activation.
Asset budgets and the production artifact check verify the delivery files and
source exclusion. Screenshots/results are saved under the ignored
`release-artifacts/main-screen-art-game/` and `release-artifacts/hud-screen-edge/`.

No backend, player data, world topology or gameplay rules change, so no emulator
suite is required. A merged PR is not proof of live deployment; verify the public
deployment identity and publisher receipt after automatic publication.
