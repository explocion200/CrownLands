# Permanent 25-cell core

The permanent core is the coordinate square `-2..2` on both axes. Every one of its 25 cells is reserved, has `worldLayer: 0`, and is non-spawnable. Phase 3 does not activate the 15 unbuilt cells and does not invent IDs, definitions, cities, objectives, or art for them.

Current production coordinates are unchanged:

| ID | Name | Coordinate | Purpose |
| --- | --- | --- | --- |
| `center` | Crownlands Heart | `(0, 0)` | `core_citadel` |
| `north` | North Frontier | `(0, -1)` | `core_stronghold` |
| `east` | East Reach | `(1, 0)` | `core_stronghold` |
| `south` | Southfields | `(0, 1)` | `core_stronghold` |
| `west` | West Marches | `(-1, 0)` | `core_stronghold` |
| `region_6` | Graywood Hollow | `(-2, 2)` | `core_camp` |
| `region_7` | Greenrook Vale | `(-1, 2)` | `core_camp` |
| `region_8` | Lowroad Vale | `(0, 2)` | `core_support` |
| `region_9` | Stonebrook Farms | `(1, 2)` | `core_camp` |
| `region_10` | Goldmere Plains | `(2, 2)` | `core_camp` |

The southern line remains Graywood Hollow → Greenrook Vale → Lowroad Vale → Stonebrook Farms → Goldmere Plains, with Lowroad Vale directly south of Southfields. Graywood keeps Gold Camp and Goldmere keeps Warband Camp.

The 15 empty cells are reservations: all five cells at `y=-2`; `(-2,-1)`, `(-1,-1)`, `(1,-1)`, `(2,-1)`; `(-2,0)`, `(2,0)`; and `(-2,1)`, `(-1,1)`, `(1,1)`, `(2,1)`. Their provisional reserved purpose is `core_holding_or_support`. This supports future northern/eastern/western groups and shared corners without duplicate maps. Holding Tower design and final purpose assignment remain future work.

The development fixture can materialize all 25 cells to prove representation and no-spawn enforcement. Those synthetic records are not production catalog entries.
