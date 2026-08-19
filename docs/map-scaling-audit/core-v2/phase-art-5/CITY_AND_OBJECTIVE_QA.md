# City and objective QA

| Map | Cities | Minimum observed spacing | Preferred-spacing exceptions | Objective |
|---|---:|---:|---:|---|
| East Deed Camp | 60 | 68.066 px | 6 | Deed `(742,533)` |
| Swiftgate | 60 | 68.000 px | 11 | Swiftgate `(724,543)` exact center |
| East Support | 70 | 68.096 px | 6 | none |
| SE Holding Tower | 55 | 68.352 px | 14 | reservation `(736,555)` |
| East / Southeast Relic Camp | 55 | 68.096 px | 2 | Relic `(746,558)` |

All 300 city IDs are deterministic and unique within the ART-5 batch. All maps retain the 68 px hard minimum; 70 px remains preferred where terrain permits. Validation reports zero city/objective, city/blocker, city/road and city/transition conflicts, valid geometry/art parity, and four aligned cardinal sockets per map.

Static composites use the current Crownlands city and objective assets. They confirm that Swiftgate remains dominant and centered, the East Deed settlement is subordinate, East Support remains legible at 70 cities, the Tower reservation has no artificial pad, and the eastern Relic terrain does not compete with its runtime Camp.
