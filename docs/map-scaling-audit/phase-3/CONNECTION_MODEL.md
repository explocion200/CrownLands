# Cardinal connection model

Every catalog cell has four potential cardinal sides: north, east, south, and west. Diagonals are never considered.

- `open`: an active region exists at the adjacent coordinate and the reverse edge points back to the source.
- `gated`: there is no active region at that coordinate. It has no destination and cannot be clicked or traversed.

Connections are derived from coordinates, not maintained as a second handwritten topology. Inserting a region into a vacant coordinate converts each touching gate to an open edge on both regions. Ring closure therefore requires no special-case patch.

The current client keeps its existing arrow and edge positioning for open connections. A gated side renders a non-interactive Gate using the existing optimized gatehouse asset; it has no hidden destination or transition handler. No new or final Gate artwork was created. A dedicated edge-gate art review remains open.

The Phase 3 validator compares the derived result with every current manual edge definition, checks reciprocal adjacency, rejects diagonals, tests missing-neighbor gates, tests gate-to-open conversion, and tests ring closure.
