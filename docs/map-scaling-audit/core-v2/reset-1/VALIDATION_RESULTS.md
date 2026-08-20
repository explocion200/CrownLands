# RESET-1 validation results

- Development reset lifecycle: PASS — `PREPARING → INITIALIZING → VALIDATING → READY`.
- Core initialization: PASS — 25 maps, 1,480 unique cities, spawn-ineligible.
- Outer initialization: PASS — approved 118-asset hash, exact 40-city packages, one initially ACTIVE region for four synthetic players, two STANDBY packages.
- Persistence: PASS — four of four persistent before/after hashes match; strict Common Gear payload contains only schema, owned instances and equipped slots.
- Seasonal reset: PASS — cities, main city, attacks, marches, rallies, reinforcements, objectives, placement, seasonal progress and consumables reset.
- Main-city policy: PASS — 25 normal forbidden-path attempts plus five spoofed requests rejected across Citadel and all Stronghold maps.
- Normal Core gameplay: PASS — capture, ownership, reinforcement and attack remain allowed.
- Post-reset gameplay: PASS — login/access, new outer main city, persistent Flag/Clan/Common Gear/equipment, outer-to-outer and outer-to-Core travel, normal city capture/reinforcement/attack, all 17 current Camp/Stronghold/Citadel objective interactions and generated-region expansion.
- NPC threshold: PASS — placement at 15 leaves 14; next direct placement is rejected; region remains ACTIVE and gameplay topology is unchanged.
- Expansion: PASS — next clockwise STANDBY region activated, reciprocal Core/outer and outer/outer connections opened, replacement STANDBY package restored buffer to two.
- Rollback: PASS — pre-initialization, migration and post-pointer-switch scenarios retain recoverability.
- Idempotency: PASS — replay hashes match and duplicate city IDs remain zero.
- Firebase staging: PASS — 25 Core regions, 1,480 Core cities, 29 total regions, 1,640 total city documents and four player pairs verified.
- Firebase staging final run: PASS — `reset1-pre-september-2026-v8`, 1,696 data writes plus guarded lifecycle transitions, 14.419-second fresh run and 6.814-second identical replay; explicit FROZEN/READ_ONLY old-season states, player entry disabled until pointer cutover, update-time-guarded revision 7→8; replay receipt `28071b5d7a745d79a7b4e0fe9cbd5b369da86ef78c8e13af6649529056e2de82`.
- Full static release gate: PASS — dependency audit, production lint, full application tests, route parity, build and artifact validation.
- Firebase emulator suite: PASS — all 17 emulator files under Node 22, including economy concurrency.
- Phase 0–5, Phase 6E and Phase 6F authoritative result gates: PASS. Phase 6B/6C/6D and Phase 7/8/9 checkpoint-diff guards reject later RESET-1 paths by design; their locked source/data invariants were not changed or weakened. Core QA-1 authoritative validator remains PASS at 25 maps/1,480 cities/80 OPEN/20 GATED/zero diagonals.
- Secret scan, machine-local path scan and `git diff --check`: PASS.
- Production artifact leakage scan: PASS — no RESET-1 fixture, staging namespace, synthetic season ID or development-model marker appears in `dist/`.
- Fresh production read-only preflight: PASS — 15 maps, 1,050 city definitions, 210 directed chains, zero generated ACTIVE catalog entries and zero generated package/coordinate-lock documents.
- Production baseline: unchanged at 15 maps / 1,050 cities / 210 directed chains / zero generated ACTIVE regions.
- Generated-player library: unchanged at 118 assets, manifest `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`.
- Deployment/merge/production reset: not performed.

Known staging incident: the first remote verifier did not paginate beyond Firestore's 300-document page. It stopped before cutover. The paginated verifier then completed through the same deterministic operation ID and passed, proving safe resume behavior.
