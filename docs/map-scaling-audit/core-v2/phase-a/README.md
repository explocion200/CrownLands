# Crownlands Core v2 Phase A

Core v2 Phase A is a development-only specification and five-map visual prototype. It does not replace, publish, or activate any current production region.

The final permanent Core is locked as 25 handcrafted `1448×1086` maps with exactly 1,480 normal city positions. Every Core map is permanent and `spawnEligible = false`; the outer-region `currentNpcCityCount >= 15` placement rule does not apply to Core maps.

Only these five prototype maps were rendered:

| Coordinate | Map | Type | Exact cities | Climate/art profile |
|---|---|---:|---:|---|
| `(0,0)` | Crown Citadel | Crown Citadel | 60 | balanced center |
| `(0,1)` | Ironwatch | Stronghold | 60 | center-to-south transition |
| `(-1,1)` | South-West Holding Tower | Holding Tower | 55 | west/south transition |
| `(-2,1)` | Deed Camp West-South | Deed Camp | 60 | west/south transition |
| `(-2,0)` | West Support | Support | 70 | grassy west |

The approved 118-asset Phase 6 library remains unchanged. The prototypes reuse approved foundations, barriers, road modules, and accents. Cities, objectives, reservations, road diagnostics, and blocker shapes appear only in QA overlays; they are not baked into clean maps.

Review artifacts:

- `benchmark-results/map/core-v2-phase-a/gallery/five-map-review-board.png`
- `benchmark-results/map/core-v2-phase-a/gallery/neighbor-transitions.png`
- per-map QA under `benchmark-results/map/core-v2-phase-a/prototypes/<map>/qa/`

The authoritative development package is `benchmark-results/map/core-v2-phase-a/core-v2-package-spec.json`. It contains the full 25-coordinate plan, not 25 rendered maps.
