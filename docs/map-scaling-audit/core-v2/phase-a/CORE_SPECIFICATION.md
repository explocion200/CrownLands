# Final 5×5 Core specification

## Exact grid

| y / x | -2 | -1 | 0 | 1 | 2 |
|---:|---|---|---|---|---|
| -2 | Warband Camp | Relic Camp | North Support | Deed Camp | Gold Camp |
| -1 | Relic Camp | Holding Tower | Greybanner Hold | Holding Tower | Deed Camp |
| 0 | West Support | Aurum Keep | Crown Citadel | Swiftgate | East Support |
| 1 | Deed Camp | Holding Tower | Ironwatch | Holding Tower | Relic Camp |
| 2 | Gold Camp | Deed Camp | South Support | Relic Camp | Warband Camp |

## Counts and capacity

| Type | Maps | Cities/map | Total |
|---|---:|---:|---:|
| Support | 4 | 70 | 280 |
| Deed Camp | 4 | 60 | 240 |
| Relic Camp | 4 | 55 | 220 |
| Warband Camp | 2 | 55 | 110 |
| Gold Camp | 2 | 55 | 110 |
| Holding Tower | 4 | 55 | 220 |
| Stronghold | 4 | 60 | 240 |
| Crown Citadel | 1 | 60 | 60 |
| **Total** | **25** | — | **1,480** |

The four Holding Tower coordinates are locked at `(-1,-1)`, `(1,-1)`, `(-1,1)`, and `(1,1)`.

## Topology

Every cardinally adjacent Core pair is `OPEN` and reciprocal. Every outward-facing side retains the fixed midpoint road socket but is runtime `GATED` until an outer neighbor exists. There are no diagonal connections. OPEN/GATED state stays outside map artwork.

All maps use the Phase 6 sockets: North `(724,0)`, East `(1448,543)`, South `(724,1086)`, West `(0,543)`.

## Climate

The north edge is light winter, east is tropical/lush, south is dry frontier, west is grassy/temperate, and the center is balanced Crownlands. Intermediate rows and columns are transition territories. In the Phase A slice, Ironwatch and the South-West Tower use an approved grassy foundation with approved dry accents, plus narrow deterministic shared-edge tint bands. This avoids a hard biome cut while keeping the southward change legible.
