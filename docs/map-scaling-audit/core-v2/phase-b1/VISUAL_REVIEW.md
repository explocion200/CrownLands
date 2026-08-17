# Phase B1 visual and runtime review

## Art and climate

- Warband Camp and the northern Relic use the approved restrained light-winter family, without full snow cover.
- The transitional Relic uses western grass with North accents and a North-compatible top edge.
- The Tower keeps a cold-temperate interior while its west and south shared edges use approved West modules, preventing a hard seam toward the transitional Relic and Aurum Keep.
- Aurum Keep remains predominantly western/temperate and visually open around the exact-centered Stronghold.
- The two Relic maps have different foundation, road, composition, and raster hashes while retaining the same objective language.
- Decoration stays within the locked four-accent limit. No map exceeds the Phase A.1 prop budget.

## Runtime renderer

The loopback fixture uses the real Crownlands renderer with the production service worker disabled only in the served development copy. Each B1 map was inspected at low, normal, and close zoom.

- 15/15 region/zoom measurements retained the exact authoritative city count.
- Low zoom rendered all `55 / 55 / 55 / 55 / 60` cities; normal and close use the existing viewport culling behavior.
- All recorded castle, label, banner, foreign-label, troop-text, and objective-versus-city collision counts were zero.
- Ten mouse and ten touch probes across the tightest pairs hit and activated the intended city.
- Representative marches and route elements were present on every map.
- Runtime OPEN plus GATED edge presentations totaled exactly four cardinal sides for every map.
- Camp and Aurum overlays use current Crownlands objective art. The Tower uses only a development reservation outline.

## Objective placement

- Aurum Keep: `(724,543)`, offset `0.000 px` from center.
- Warband Camp: `(700,535)`, offset `25.298 px`.
- Northern Relic: `(742,526)`, offset `24.759 px`.
- Transitional Relic: `(706,556)`, offset `22.204 px`.
- Tower reservation: `(736,552)`, offset `15.000 px`.

All objective, road, blocker, transition, and border-clearance checks passed.

## Performance watch

In the same in-app browser run, Aurum Keep averaged `60.258 fps` across the three zoom presets; the locked Citadel comparison averaged `31.939 fps`. These browser samples are comparative diagnostic evidence, not a change to any global threshold. The Citadel remains the existing watch item and is not a Phase B1 blocker.
