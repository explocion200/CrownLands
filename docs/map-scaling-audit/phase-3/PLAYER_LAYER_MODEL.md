# Player-layer model

Layer 0 is the permanent `5×5` core. Layer `n >= 1` is the one-cell-wide square ring at Chebyshev distance `2 + n` from `(0,0)`. The formulas have no fixed maximum layer.

Traversal uses the north-west corner as the deterministic anchor. In screen coordinates it proceeds east across the north edge, south down the east edge, west across the south edge, and north up the west edge. The start coordinate, coordinate list, and `clockwiseOrderIndex` are derived by `region-catalog.js` and validated independently.

A ring is complete only when every coordinate in that layer has an active catalog region. Until then, `getNextClockwiseCoordinate` returns the first missing coordinate in traversal order and returns `null` at closure. The higher-level `getNextPlayerExpansionCoordinate` then advances to the north-west anchor of the next layer. Adding the final region naturally opens every cardinal contact, including the ring-closing contact, through coordinate-derived reciprocal topology.

The current Regions 11–15 are existing Layer 1 production regions at `y=3`; their positions, names, and topology are unchanged. Their order indices are derived from the complete Layer 1 traversal rather than renumbered to a local five-item list.

Phase 3 calculates and validates placement order only. It does not allocate, activate, populate, or generate any future region.
