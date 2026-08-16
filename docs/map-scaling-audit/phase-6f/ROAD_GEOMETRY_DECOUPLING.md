# Road Geometry Decoupling

## Model

Road geometry now controls path shape, bends, branches, junction position, and internal alignment. Theme treatment controls palette and seasonal presentation. Geometry selection uses a theme-independent SHA-256-derived starting index across the nine approved shapes. Ranked feasibility candidates rotate deterministically through the remaining shapes; topology and city feasibility retain veto power.

For an internal road module, the renderer retains the selected asset's alpha mask and geometry while applying deterministic masked color transfer from an approved road module belonging to the destination theme. This uses existing assets only and does not introduce noise or decorative density.

The baseline plan continues to use the destination theme's four approved road-opening modules. Every plan retains the fixed cardinal sockets at North `(724,0)`, East `(1448,543)`, South `(724,1086)`, and West `(0,543)` with 44 px half-width.

## 10,000-map distribution

| Geometry | Total | Share | North | East | South | West |
|---|---:|---:|---:|---:|---:|---:|
| base | 1,135 | 11.35% | 293 | 281 | 291 | 270 |
| east-v2 | 1,136 | 11.36% | 276 | 286 | 300 | 274 |
| east-v3 | 1,158 | 11.58% | 316 | 309 | 268 | 265 |
| north-v2 | 1,083 | 10.83% | 272 | 279 | 263 | 269 |
| north-v3 | 1,063 | 10.63% | 284 | 238 | 287 | 254 |
| south-v2 | 1,155 | 11.55% | 281 | 278 | 298 | 298 |
| south-v3 | 1,068 | 10.68% | 265 | 266 | 283 | 254 |
| west-v2 | 1,101 | 11.01% | 300 | 286 | 260 | 255 |
| west-v3 | 1,101 | 11.01% | 305 | 273 | 265 | 258 |

All nine geometries appear in all four themes. No geometry exceeds 11.58%; perfect 11.11% balancing is neither forced nor required.
