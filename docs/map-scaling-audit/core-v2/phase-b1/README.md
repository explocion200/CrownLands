# Crownlands Core v2 Phase B1

Phase B1 is a development-only west / northwest Core visual batch. It adds exactly five review prototypes and 280 normal-city positions; it does not publish or activate any map.

| Coordinate | Map | Exact cities | Core spacing | Objective policy |
|---|---|---:|---:|---|
| `(-2,-2)` | Warband Camp | 55 | 69.354 px minimum | near center at `(700,535)` |
| `(-1,-2)` | Relic Camp North-West | 55 | 68.264 px minimum | near center at `(742,526)` |
| `(-2,-1)` | Relic Camp West-North | 55 | 68.352 px minimum | near center at `(706,556)` |
| `(-1,-1)` | North-West Holding Tower | 55 | 68.768 px minimum | reservation near center at `(736,552)` |
| `(-1,0)` | Aurum Keep | 60 | 70.000 px minimum | exact center at `(724,543)` |

The maps reuse the locked 118-asset Crownlands library. No new production asset, runtime, Firebase, city, spawn, ownership, or topology file is introduced. All clean maps are `1448×1086` opaque WebPs with `320×240` thumbnails. Cities, Camp/Stronghold art, the Tower reservation, labels, routes, arrows/Gates, and selection UI remain runtime or QA overlays and are not baked into the clean map.

The west-to-north transition uses approved West and North modules with narrow deterministic 96 px edge bands. Three shared-edge substitutions align the transitional Relic and Tower with the already established neighboring climate family without changing road socket geometry or creating new artwork.

Primary review artifacts:

- `benchmark-results/map/core-v2-phase-b1/gallery/b1-five-map-review-board.png`
- `benchmark-results/map/core-v2-phase-b1/gallery/runtime-review-board.png`
- `benchmark-results/map/core-v2-phase-b1/gallery/west-north-climate-transition.png`
- `benchmark-results/map/core-v2-phase-b1/gallery/neighbor-edge-continuity.png`
- `benchmark-results/map/core-v2-phase-b1/gallery/relic-comparison.png`
- `benchmark-results/map/core-v2-phase-b1/gallery/objective-placement-proof.png`
- per-map diagnostic and runtime images under `benchmark-results/map/core-v2-phase-b1/prototypes/<map>/`

Batch 2 has not started.
