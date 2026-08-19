# ART-4 validation results

The ART-4 validator confirms:

- exactly five new coordinates: `(0,-2)`, `(1,-2)`, `(2,-2)`, `(0,-1)`, `(1,-1)`;
- exact capacities `70/60/55/60/55`, totaling 300;
- 15 final-art Core candidates and 880 represented Core cities after this batch;
- the other ten Core coordinates remain absent from ART-4;
- deterministic unique city IDs and minimum spacing at or above 68 px;
- Greybanner remains exact center `(724,543)`;
- Camp and Tower reservations remain near center;
- four cardinal road sockets, Core topology, spawn-ineligible status, and permanent-Core rules remain intact;
- 1448×1086 PNG/WebP candidates and 320×240 thumbnails;
- literal-edge barrier, prop-rule, city/objective clearance, and visual-family review pass;
- the first ten final-art candidate files remain unchanged;
- the 118-asset generated-region library and manifest hash remain unchanged;
- production remains 15 maps, 1,050 cities, 210 directed chains, and zero generated ACTIVE regions;
- no production artifact references ART-4.

Fresh interactive Browser QA is `DEFERRED_EXTERNAL_TOOL_BLOCK` because the external Codex Browser permission layer rejected the healthy HTTP-200 local fixture. No workaround was used. This is not a Crownlands failure, is not recorded as a runtime pass, and remains production-blocking while allowing later development art production after this checkpoint.

## Final review run

- ART-4 validator: `PASS_STATIC_VISUAL_REVIEW`; interactive runtime QA separately records `DEFERRED_EXTERNAL_TOOL_BLOCK`.
- Full application pretest and test chain: PASS.
- Production JavaScript syntax checks and ESLint: PASS. ESLint was invoked from an existing offline workspace installation because this worktree's pnpm executable links were unavailable; the files linted were the current ART-4 worktree files.
- Route parity: PASS — 1,050 cities, 15 production maps, 1,050 local routes, 1,050 cross-map routes, and 210 directed chains.
- Production build: PASS — 262 files, 21.49 MiB.
- Production artifact validation: PASS — 263 files, 21.52 MiB.
- Phase 0 regression: PASS (253 assertions).
- Phase 1 authoritative decision gate: PASS (216 assertions).
- Phase 2 regression/capacity/decision: PASS (297 / 24 / 146 assertions).
- Phase 3, Phase 4, player-region capacity, Phase 5, Phase 6A directional, Phase 6B, Phase 6C, Phase 6D, Phase 6E, and Phase 6F validators: PASS.
- Phase 7, Phase 8, and Phase 9 scripts: checkpoint-specific diff-scope guards reject the new untracked ART-4 development paths. This is an expected scope-guard result, not a runtime or architecture assertion failure; no threshold was changed.
- Prior Core A.1/B1/ART-2-v2/ART-3 scripts: their checkpoint-specific diff-scope guards likewise reject ART-4 paths. ART-4 independently verifies the approved first-ten file set is byte-unchanged from checkpoint `d42f8590054bcfa22328dd06b0bc6b167d8de20a`.
- Dependency audit: not freshly resolved because registry access was blocked by the network sandbox. The lockfile is unchanged.
- Production leakage, secret-pattern, machine-local-path, and whitespace scans: PASS.
- `git diff --check`: PASS.

No validator threshold was weakened. No tracked production file changed, no generated region was activated, and no deployment or merge occurred. The mandatory final consolidated interactive QA gate across all 25 finished Core maps is preserved in `RUNTIME_QA.md` and `BROWSER_BLOCKER_RECEIPT.md`.
