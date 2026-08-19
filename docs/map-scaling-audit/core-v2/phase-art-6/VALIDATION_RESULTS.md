# ART-6 validation results

Development receipts lock exactly five South-row coordinates and 295 new cities. After the batch, the complete Core representation is 25 maps / 1,480 cities.

Visual approval is `APPROVED_LOCKED`. ART-2 v2 through ART-6 now form the authoritative final-art standard for all 25 permanent Core maps. This approval does not clear the deferred interactive runtime gate.

Static/art gates:

- ART-6 geometry and city validation: PASS
- actual city/objective composites: PASS
- 1448×1086 maps and 320×240 thumbnails: PASS
- city spacing / blockers / roads / transitions: PASS
- cardinal topology / reciprocal connections / outward gates: PASS
- production leakage: PASS — zero findings in the production artifact
- interactive browser runtime QA: DEFERRED_EXTERNAL_TOOL_BLOCK (production-blocking)

Repository-wide gates:

- Full static release gate: PASS under required Node 22 — dependency audit (zero known production vulnerabilities), lint, full application tests, route parity, production build and artifact validation.
- Route parity: PASS — 1,050 live cities / 15 maps / 1,050 local routes / 1,050 per-city cross-map routes / 210 directed chains.
- Production build: PASS — 262 files / 21.49 MiB.
- Production artifact: PASS — 263 files / 21.52 MiB.
- Fresh Firebase emulator suite: PASS — all 17 discovered files under Node 22, with no pre-execution port conflict. No assertion or threshold changed.
- Phase 0 regression: PASS, 253 checks.
- Phase 1 authoritative decision: PASS, 216 checks.
- Phase 2 regression/capacity/decision: PASS, 297 / 24 / 146 checks.
- Phase 3, Phase 4, player-region capacity, Phase 5, Phase 6A directional, Phase 6B, Phase 6C, Phase 6D, Phase 6E and Phase 6F: PASS.
- Prior 20 Core source/geometry/candidate invariants: PASS, byte-unchanged from approved base `47b2e81d11370554af57fb8098f31da24b345d4d`.
- Production leakage, secret pattern, machine-local path and `git diff --check`: PASS, zero findings.
- Generated-player library: unchanged at 118 assets; manifest SHA-256 `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`.
- Production baseline: unchanged at 15 maps / 1,050 cities / 210 directed chains / zero generated ACTIVE regions.

Historical Phase 7–9 and earlier Core validators retain their checkpoint-specific diff-scope guards; they were not weakened to accept the new ART-6 paths. Their production architecture is protected through the current release gate, the ART-6 locked-source checks and direct production baseline/hash verification.

This phase does not authorize publication or production integration.
