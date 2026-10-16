# Illustrated movement ribbons

**Retired October 16, 2026:** The owner requested the previous flat parchment
button style again, keeping only the horse and crossed-swords icon changes.
The delivery image is archived here as `retired-ribbon-196x76.webp`; its
optimized manifest entry has been removed. The source master, prompt and
historical delivery hashes also remain here for reference.
These documentation assets are not shipped. The browser validator now writes
results to `release-artifacts/restored-notice-style/` and checks the restored
parchment surfaces plus the retained icons and interactions.

Original request, October 16, 2026: Reports, Outgoing and Incoming should use
parchment backgrounds like the named HUD icons; Outgoing uses the existing horse
and Incoming the crossed swords. The blank ribbon is shared; names, counts and
timers remain live HTML text. Existing targets, actions and holding rules remain.

- `blank-ribbon-v1.png`: untouched transparent master from built-in `image_gen`.
- `prompt.json`: exact edit prompt and approved Clan ribbon reference.
- `runtime-assets.json`: historical source/output hashes and WebP delivery metadata.
- Outgoing reuses `assets/icons/skills/atlas-v1/marchOrders.webp`, the approved
  horse from `docs/art-sources/skill-atlas-icons/marchOrders.png`.
- Incoming reuses `assets/optimized/report-attack-ink-384x384-1e1a12b255a7.webp`.
- Reports retains its existing emblem and unread badge.

The existing `tools/optimize-game-art.py` `build_asset` function scales the master
to a 196 × 76 transparent HUD canvas, quality 88. No creative postprocessing.
The original manifest marked this as prepared delivery. CSS positioned this
single image under the live label rows, with transparent space around each icon.
Runtime image caching handled the artwork without installation precaching.

The original `tools/validate-parchment-notices-browser.js` checked all visibility combinations,
decoded image identity and alpha, names/countdowns, target geometry, unread badge,
focus, pointer/keyboard/touch, transparent Chat and map zoom at 1440 × 900,
844 × 390 and 568 × 320. Original screenshots and machine-readable results were written to
ignored `release-artifacts/movement-ribbons/`. A merge alone is not deployment.
