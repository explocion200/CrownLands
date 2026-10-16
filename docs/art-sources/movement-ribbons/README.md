# Illustrated movement ribbons

Owner requested October 16, 2026: Reports, Outgoing and Incoming should use
parchment backgrounds like the named HUD icons; Outgoing uses the existing horse
and Incoming the crossed swords. The blank ribbon is shared; names, counts and
timers remain live HTML text. Existing targets, actions and holding rules remain.

- `blank-ribbon-v1.png`: untouched transparent master from built-in `image_gen`.
- `prompt.json`: exact edit prompt and approved Clan ribbon reference.
- `runtime-assets.json`: source/output hashes and WebP delivery metadata.
- Outgoing reuses `assets/icons/skills/atlas-v1/marchOrders.webp`, the approved
  horse from `docs/art-sources/skill-atlas-icons/marchOrders.png`.
- Incoming reuses `assets/optimized/report-attack-ink-384x384-1e1a12b255a7.webp`.
- Reports retains its existing emblem and unread badge.

The existing `tools/optimize-game-art.py` `build_asset` function scales the master
to a 196 × 76 transparent HUD canvas, quality 88. No creative postprocessing.
The manifest marks this as prepared delivery so later optimization retains the
reviewed encoding. CSS positions this single image under the live label rows;
the unpainted area around each icon stays transparent. Runtime image caching
handles these assets; they are not added to the installation precache.

`tools/validate-parchment-notices-browser.js` checks all visibility combinations,
decoded image identity and alpha, names/countdowns, target geometry, unread badge,
focus, pointer/keyboard/touch, transparent Chat and map zoom at 1440 × 900,
844 × 390 and 568 × 320. Screenshots and machine-readable results are written to
ignored `release-artifacts/movement-ribbons/`. A merge alone is not deployment.
