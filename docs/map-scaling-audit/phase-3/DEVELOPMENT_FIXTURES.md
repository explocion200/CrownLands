# Development fixtures

`tools/fixtures/map-scaling-phase-3.js` produces synthetic topology and reset cases. `tools/validate-map-scaling-phase-3.js` checks them alongside the generated production catalog.

Covered cases:

1. complete 25-cell core representation and all cells non-spawnable;
2. Layer 1 region outside the core;
3. stable north-west-anchor clockwise ordering;
4. partial and complete rings, next-layer transition, and closure;
5. gated missing edge and open existing edge;
6. reciprocal gate-to-open conversion when a neighbor appears;
7. Region 26+ discovery without a client enumeration;
8. unique IDs/coordinates, valid layers/purposes, assets, thumbnails, definitions, dynamic bounds, and no diagonals;
9. Flag, clan identity, and Common Gear extraction from mixed profile/world input;
10. consumable and seasonal/world data exclusion.

The production artifact validator rejects fixture paths/markers, source catalog JSON, the editor bundle, and development authentication/profiling code. The production catalog contains only the existing 15 active regions; no synthetic Region 16+, completed-core, ring, gate, or reset profile is shipped.
