# ART-5 validation results

- ART-5 validator: **PASS_STATIC_VISUAL_REVIEW** — five maps, 300 unique city IDs, 20 finished candidates, 1,185 represented cities, 295 cities remaining.
- Exact coordinates/capacities: **PASS** — `(2,-1)/(1,0)/(2,0)/(1,1)/(2,1)` and `60/60/70/55/55`.
- Objective placement: **PASS** — Swiftgate exact `(724,543)`; Camps and Tower reservation retain approved near-center coordinates.
- City geometry: **PASS** — 68 px hard minimum retained; zero objective, blocker, road or transition conflicts.
- Topology/art parity: **PASS** — cardinal-only, four aligned midpoint sockets, reciprocal connections within the ART-5 batch, and GATED outward East edges.
- Static actual-asset review: **PASS** — city and objective composites, 70-city Support review, roads, perimeter, objective integration, climate and 20-map family boards.
- Full static release gate: **PASS** — zero-vulnerability production dependency audit, production lint, full application tests and route parity.
- Route parity: **PASS** — 1,050 cities, 15 live maps, 1,050 local routes, 1,050 per-city cross-map routes and 210 directed chains.
- Production build: **PASS** — 262 files / 21.49 MiB.
- Production artifact validation: **PASS** — 263 files / 21.52 MiB.
- Fresh Firebase emulator suite: **PASS** — the first monolithic attempt reproduced the previously documented transient economy-concurrency assertion (`The gear upgrade did not consume its Level 1 duplicate`); the exact economy-concurrency test passed immediately in isolation, and a fresh complete Node 22 rerun then passed all 17 discovered emulator files. No assertion or threshold was weakened.
- Phase 0 regression: **PASS**, 253 checks.
- Phase 1 authoritative decision: **PASS**, 216 checks. The optional historical raw Phase 1 diagnostic still reports its four already-known zoom misses and is not the authoritative decision gate; no threshold changed.
- Phase 2 regression/capacity/decision: **PASS**, 297 / 24 / 146 checks.
- Phase 3, Phase 4, player-region capacity, Phase 5, Phase 6A directional, Phase 6B, Phase 6C, Phase 6D, Phase 6E and Phase 6F validators: **PASS**.
- Production leakage, secret-pattern, machine-local-path and `git diff --check` scans: **PASS**, zero findings.
- Prior 15 final-art geometry/candidate files: **byte-unchanged** from checkpoint `996e54c279c442592bb31dfea032097d80fc7d0a`.
- Generated-player asset library: **unchanged**, 118 assets; manifest hash `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`.
- Production baseline: **unchanged**, 15 maps / 1,050 cities / 210 directed chains / zero generated ACTIVE regions.

Interactive Browser QA is intentionally **not a pass**. It remains `DEFERRED_EXTERNAL_TOOL_BLOCK` / `CODEX_BROWSER_LOCAL_ORIGIN_PERMISSION`, production-blocking and art-production-nonblocking. No Browser FPS, mouse/touch or live zoom result is claimed. The consolidated interactive review of all 25 finished maps remains mandatory before production use.
