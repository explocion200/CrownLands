# Core v2 Phase B1 validation results

## Phase B1 gates

- Phase B1 validator: PASS — exact approved five coordinates, exact `55 / 55 / 55 / 55 / 60` capacities, 280 unique city IDs, and no sixth prototype.
- City placement: PASS — all maps meet the 68 px hard minimum; Aurum reaches the 70 px preference.
- Objective policy: PASS — Aurum exact-centered; Camps and Tower within the approved 48 px near-center limit.
- Clearance and art parity: PASS — zero city/objective, city/road, city/blocker, or city/transition conflicts; all maps and thumbnails have the locked dimensions.
- Topology: PASS — 16 directed open connections from the five B1 coordinates, reciprocal and cardinal-only in the authoritative Core specification.
- Climate continuity: PASS — four transition profiles and three explicit shared-edge treatments; 96 px bands remain at or below 0.24 maximum strength.
- Relic differentiation: PASS — composition and raster hashes differ.
- Runtime QA: PASS — 15 zoom rows, 10 mouse probes, 10 touch probes, representative routes, objective overlays, and zero recorded visual collisions.
- Production leakage: PASS — the production artifact contains no `core-v2-phase-b1` or `core_b1_` marker.

## Application and historical map gates

- Full static release gate: PASS — dependency audit, production lint, full application tests, route parity, production build, release-gate validation, and artifact validation.
- Fresh Firebase emulator suite: PASS — all 17 isolated emulator files passed; the economy-concurrency gate passed in the complete run without the historical transient assertion.
- Route parity: PASS — 1,050 cities, 15 maps, 1,050 local routes, 1,050 per-city cross-map routes, and 210 directed map chains.
- Phase 0 regression: PASS — 253 checks.
- Phase 1 authoritative decision: PASS — 216 checks.
- Phase 2 regression/capacity/decision: PASS — 297 / 24 / 146 checks.
- Phase 3, 4, player-region capacity, 5, 6A, directional 6A, 6B, 6C, 6D, 6E, and 6F validators: PASS.
- Core v2 Phase A.1 runtime validator: PASS. The Phase A clean-checkpoint validator remains preserved at its approved checkpoint because its diff-scope assertion intentionally rejects later approved Phase A.1/B1 work.
- Phase 7–9 clean-checkpoint validators remain preserved at their exact approved commits; their checkpoint-specific diff scopes intentionally reject later Core work.

## Production safety

Production remains exactly 15 maps, 1,050 city definitions, 210 directed map chains, and zero generated ACTIVE regions. The approved asset-manifest hash remains `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`.

No deployment, merge, publication, generated-region activation, Firebase production mutation, or Batch 2 generation occurred. The Phase B1 commit and branch push are checkpoint-only operations performed after the final validation matrix passes.
