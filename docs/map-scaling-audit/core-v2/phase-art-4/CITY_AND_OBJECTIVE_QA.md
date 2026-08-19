# ART-4 city and objective QA

| Map | Cities | Objective | Minimum spacing | Mean nearest neighbor | Preferred-spacing violations |
| --- | ---: | --- | ---: | ---: | ---: |
| North Support | 70 | none | 68.007 px | 79.498 px | 12 |
| Northeast Deed Camp | 60 | Deed `(704,533)` | 68.505 px | 80.454 px | 6 |
| Northeast Gold Camp | 55 | Gold `(742,550)` | 68.015 px | 90.591 px | 5 |
| Greybanner Hold | 60 | Greybanner `(724,543)` exact center | 68.622 px | 81.250 px | 7 |
| Northeast Holding Tower | 55 | reservation `(734,555)` | 70.036 px | 85.756 px | 0 |

All 300 city IDs are deterministic and unique. Every position passes authoritative road, blocker, transition, objective, perimeter, and 68 px hard-spacing validation. The 70 px value remains a preference, not a hard gate.

Static overlays use the actual current Crownlands city, Deed Camp, Gold Camp, and Greybanner assets. The Tower uses a QA-only reservation outline; no Tower artwork is baked into the candidate.
