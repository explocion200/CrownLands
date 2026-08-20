# Core v2 QA-1 validation results

- Browser permission diagnosis: `CODEX_BROWSER_PERMISSION_STATE_DEFECT`; localhost fixture remained healthy at HTTP 200, while the supported local-origin control permission remained contradictory.
- Staging fallback: PASS — `crownlands-map-staging-2026` is distinct from production `crown-land-b15e0`; the fixture is host-guarded, development-only, and served from an expiring preview channel.
- Browser progressive gate on staging: PASS — title, URL, DOM inspection, and harmless development control action.
- Complete renderer sweep: PASS — 25 maps and 1,480 cities; all capacities matched.
- Interaction: PASS — mouse and touch-equivalent tight-pair selection on all 25 maps, with action acknowledgement and independent city targeting.
- Objectives: PASS — all 17 runtime Camps/Strongholds/Citadel opened the correct action wheel; all four Tower reservations remained non-interactive development overlays.
- Topology: PASS — 80 directed OPEN sides, 40 reciprocal connections, 20 outward GATED sides, zero diagonals, and a complete circuit returning to Crown Citadel.
- Zoom/LOD: PASS — low, normal, and close presets on all 25 maps.
- Routes and Map UI: PASS — friendly/hostile routes on all maps; 25 Map UI tiles and 40 internal connections.
- Collision review: PASS for cities, labels, banners, troop text, routes, and all real objectives. One cosmetic development-only Tower reservation ellipse graze remains documented.
- Climate continuity: PASS — representative North, West, East, South, and central maps remain one Crownlands visual family.
- Representative warm performance: PASS — nine low-zoom samples averaged 138.216 FPS; minimum 132.834 FPS; average p95 10.211 ms; maximum observed p95 13.9 ms; zero long tasks.
- Citadel watch: PASS — 143.539 FPS, 7.1 ms p95, 13.9 ms maximum frame, zero long tasks in the clean warm sample.
- Lazy loading/cache: PASS — configured maximum 8; observed size 5, two hits, zero failures. Prior 25-map traversal and authoritative cache validators preserve bounded eviction behavior.
- QA-1 validator: PASS — exact maps, cities, type counts, centered objectives, spacing, connections, Gates, and zero diagonals.
- Production build: PASS — 262 files / 21.49 MiB.
- Artifact validation: PASS — 263 files / 21.52 MiB.
- Production leakage: PASS — no QA-1 marker is present in `dist`.
- Production baseline: unchanged at 15 maps / 1,050 cities / 210 directed chains / zero generated ACTIVE regions.

During QA execution, no production integration, merge, production write, or production deployment occurred. The approved evidence is checkpointed only after the final validation described below.

## Final checkpoint rerun

- Runtime: Node `v22.23.2`.
- Full static release gate: PASS — canonical-data parity, zero-vulnerability production dependency audit, production lint, full application tests, route parity, deployment stamp verification, release-gate validation, production build, and artifact validation.
- Route parity: PASS — 1,050 production cities, 15 maps, 1,050 local routes, 1,050 per-city cross-map routes, and 210 directed map chains.
- Fresh Firebase emulator suite: PASS — all 17 automatically discovered files under Node 22, including economy concurrency in the complete run. The first invocation encountered a pre-execution Auth/Firestore port conflict; the listeners had exited before inspection, and the immediate fresh rerun passed without changing any assertion.
- Phase 0 benchmark/regression: PASS — 253 regression checks.
- Authoritative Phase 1 decision: PASS — 216 checks.
- Phase 2 regression/capacity/decision: PASS — 297 / 24 / 146 checks.
- Phase 3, Phase 4, player-region capacity, Phase 5, Phase 6A, Phase 6A directional, Phase 6B, Phase 6C, Phase 6D, Phase 6E, and Phase 6F: PASS.
- Phase 9 environment guard: PASS — staging `crownlands-map-staging-2026` and production `crown-land-b15e0` remain distinct; production targets are rejected and mutations require explicit confirmation.
- Complete Core capacity/topology/objective validation: PASS — 25 maps, 1,480 unique cities, exact type/capacity counts, 80 directed OPEN sides, 40 reciprocal connections, 20 outward GATED sides, zero diagonals, five centered Citadel/Stronghold objectives, and four near-center Tower reservations.
- Generated-player library: unchanged at 118 assets; manifest SHA-256 `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`.
- Historical Phase 7–9 and ART checkpoint validators retain their intentional checkpoint-diff/base guards. They were not weakened to accept later QA paths; their production invariants are covered by the current release gate, Phase 9 environment guard, unchanged tracked production/Core files, and the complete QA-1 validator.
