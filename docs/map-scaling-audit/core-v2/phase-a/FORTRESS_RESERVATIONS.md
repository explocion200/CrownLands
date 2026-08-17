# Future outer Fortress reservations

Generated player-region packages may eventually include immutable `objectiveReservations[]` entries with `type = FORTRESS`. Phase A defines reservation architecture only; it adds no Fortress art, capture rules, garrison rules, live visibility, or production data.

Layer 1 has 24 generated-region coordinates. The recommended four reservations occupy clockwise slots 2, 8, 14, and 20:

| Slot | Coordinate |
|---:|---|
| 2 | `(-1,-3)` |
| 8 | `(3,-1)` |
| 14 | `(1,3)` |
| 20 | `(-3,1)` |

This yields one reservation per six maps, no cardinal adjacency, and even ring distribution. Future layers must derive a deterministic non-zero slot offset and reject radial alignment with the preceding layer.

A reservation must pass pre-publication clearance against all 40 cities, every road segment, blockers, transition zones, edge barriers, and other objectives. It remains invisible to live players. Once a package is published, the reservation is immutable with that package.
