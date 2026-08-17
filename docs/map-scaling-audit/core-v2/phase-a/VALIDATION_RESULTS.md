# Core v2 Phase A validation results

## Phase A

- Core specification validator: PASS — 25 coordinates, exact type counts, 1,480 cities, fixed Tower coordinates, non-spawnable Core contract, reciprocal cardinal topology, and valid outer gates.
- Five-map slice validator: PASS — exact capacities `60 / 60 / 55 / 60 / 70`, connected adjacency, edge sockets, geometry/art parity, and zero city conflicts with objectives, blockers, roads, transitions, or bounds.
- Fortress architecture validator: PASS — four reservations across the 24-map Layer 1 ring, one per six clockwise slots, no cardinal adjacency, and no Core coordinate use.
- Asset manifest: PASS — the approved 118-asset library is unchanged at `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`.

## Application and historical regression gates

- Full static release gate: PASS — dependency audit, production lint, full application tests, route parity, production build, release gate, and artifact validation.
- Phase 0 regression and benchmark gates: PASS.
- Phase 1 authoritative decision gate: PASS.
- Phase 2 regression, capacity, and decision gates: PASS.
- Phase 3, 4, 5, 6A, 6B, 6C, 6D, 6E, and 6F validators: PASS.
- Phase 7, 8, and 9 validators: PASS at their exact approved checkpoint commits. These validators intentionally assert checkpoint-specific diff scopes, so they were run in temporary detached worktrees rather than against the later Core v2 workspace.
- Phase 9's pre-existing staging readiness status remains `BLOCKED_REQUIRED_QA` for its physical Android/iPhone/carrier, paging, and cloud-raster-capacity checks; that historical status was not changed or represented as a Core v2 failure.
- Fresh Firebase emulator coverage: PASS across the complete gate set. The known economy-concurrency duplicate-consumption assertion occurred once during the combined run, passed immediately when rerun in isolation, and all subsequent gates passed. No threshold or assertion was changed.

## Safety and hygiene

- Production baseline: PASS — 15 maps, 1,050 cities, 210 directed chains, and zero generated ACTIVE regions.
- Production leakage scan: PASS — no Core v2 marker or artifact is present in the production build or runtime paths.
- Secret scan: PASS.
- Machine-local path scan: PASS.
- Trailing-whitespace scan: PASS.
- `git diff --check`: PASS.
- Tracked production/shared files changed: zero.

No deployment, publication, activation, merge, push, season reset, or Firebase production mutation occurred.
