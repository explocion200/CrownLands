# Phase 5 fixture results

All outputs are development-only and watermarked.

| Player fixture | Result | Cities | Starts | Map bytes | Package hash |
| --- | --- | ---: | ---: | ---: | --- |
| Agricultural | STANDBY | 40 | 4 | 21,028 | `f856da126b33` |
| Woodland | STANDBY | 40 | 4 | 18,912 | `3cdbab4e1951` |
| Rolling hills | STANDBY | 40 | 4 | 23,452 | `e021f369a73f` |
| Wetland | STANDBY | 40 | 4 | 19,144 | `7e661f6c201c` |
| Constrained invalid | ROLLED_BACK | 0 | 0 | no output | none |

All repeated terrain, city, starting-candidate, map, thumbnail, and package hashes matched. The constrained fixture failed exact-40 and minimum-start-candidate validation and emitted zero package files.

Topology fixtures also passed:

- two connected maps: 2/2 at exactly 40, reciprocal connection hash `5f6f7ab5840c`;
- three clockwise maps: 3/3 at exactly 40, hash `24460449e59b`;
- complete Layer 1: 24/24 at exactly 40, closing connection reciprocal, hash `743a9a6279b2`.

Core fixtures passed for 25 coordinates, 10 active maps, 15 reservations, one Citadel, four Strongholds, four Camps, and four Tower reservations. Tower relocation and overlap attempts were rejected.

Invalid mutations rejected duplicate city identity, missing output, oversized output, blocker/visual mismatch, and a second exit on one edge.

The local preview is `benchmark-results/map/phase-5/previews/index.html`. It overlays roads, blockers, all 40 cities, starting candidates, and OPEN/GATED labels, and includes a 5x5 Core overview.
