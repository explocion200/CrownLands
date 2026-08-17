# Core v2 Phase A.1 validation results

## Runtime-density evidence

- Actual Crownlands renderer: PASS on all five development-only fixtures.
- Exact capacities: PASS — `60 / 60 / 55 / 60 / 70`.
- Low/normal/close zoom coverage: PASS — 15/15 measurements.
- Sprite, label, banner, troop-display, and objective/reservation collision probes: PASS — zero recorded conflicts in all 15 measurements.
- Tightest-pair input coverage: PASS — 30 mouse and 30 touch city probes selected their intended target.
- Objective presentation: PASS — Crown Citadel, Ironwatch, and Deed Camp use current runtime art; Holding Tower uses reservation visualization only.
- Representative marches and cardinal edge UI: PASS.
- Core spacing: PASS — all five maps stay at or above the evidence-backed 68 px source-image floor.
- Performance profiles: completed with three samples each for Tower 55, Citadel 60, and Support 70. The 70-city map showed no density cliff.

## Application and map regressions

- Core v2 Phase A validator: PASS — 25 maps, 1,480 exact capacity, approved topology/reservations, five prototypes only, production baseline unchanged.
- Core v2 Phase A.1 validator: PASS.
- Dependency audit: PASS — no known production vulnerabilities.
- Production lint: PASS.
- Full application tests: PASS.
- Route parity: PASS — 1,050 cities, 15 maps, 1,050 local city routes, 1,050 per-city cross-map routes, and 210 directed map chains.
- Production build: PASS — 262 build inputs / 21.49 MiB.
- Production artifact validation: PASS — 263 files / 21.52 MiB.
- Phase 0 regression: PASS — 253 checks.
- Phase 1 authoritative decision: PASS — 216 checks.
- Phase 2 regression: PASS — 297 checks.
- Phase 2 capacity: PASS — 24 checks.
- Phase 2 authoritative decision: PASS — 146 checks.
- `git diff --check`: PASS.
- Production artifact leakage scan: PASS.
- Approved asset-manifest hash remains `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`.

No validation threshold was changed.

## Safety

Tracked production/shared file changes are zero. Production remains 15 maps, 1,050 cities, 210 directed map chains, and zero generated ACTIVE regions. The test server binds only to `127.0.0.1`, disables the production service worker in memory, and injects fixture state only into its served copy of the runtime.

No deployment, merge, commit, push, publication, generated-region activation, Firebase production mutation, or remaining-Core-map generation occurred.
