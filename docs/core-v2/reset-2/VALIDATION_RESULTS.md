# RESET-2 validation results

- Exact RESET-2 validator: PASS — 5,000 players, 74,000 owned Common Gear instances, 32,500 equipped references, 8,000 duplicate-progression records, 125 Clans, 25 Core maps, and 1,480 Core cities.
- Exact isolated Firebase staging rehearsal: PASS — run `reset2-aug25-exact-candidate-v5`, 29,933 deterministic writes, remote paginated read-back, verified backup/restore, READY gate, and guarded pointer revision 12→13.
- Exact remote replay: PASS — same candidate/source hash, stable convergence, and redundant pointer cutover skipped.
- Full static release gate under Node 22.23.2: PASS — canonical data sync, zero-vulnerability production dependency audit, production lint, complete application suite, route parity, release validation, production build, and artifact validation.
- Fresh Firebase emulator suite under Node 22: PASS — all 17 files. The standard ports were occupied by a separate user worktree, so the complete suite ran on isolated loopback ports 9199/8180/5101 with the same rules, indexes, Functions source, and project test identity. The unrelated process was not stopped.
- Phase 0 benchmark harness/regression: PASS — deterministic isolation plus 253 assertions.
- Authoritative Phase 1 decision: PASS — 216 assertions.
- Phase 2 regression/capacity: PASS — 297 regression and 24 capacity assertions.
- Phase 3: PASS — 15 active regions and 25 reserved Core cells.
- Phase 4: PASS — five fixtures, 24-region Layer 1, 960 unique generated cities.
- Phase 5: PASS — 25 Core cells, deterministic WebP packages, 24-region ring, 40-city capacity.
- Phase 6E invariant gate: PASS — 10,000-map evidence remains intact and the pre-6F visual scale result remains correctly rejected.
- Phase 6F authoritative gate: PASS — 10,000 maps and road/theme decoupling remain valid.
- Core QA-1: PASS — 25 maps, 1,480 cities, 80 directed OPEN sides, 20 GATED sides, 40 reciprocal connections, zero diagonals.
- RESET-1: PASS — lifecycle, persistence, world, and main-city invariants preserved.
- Phase 9 environment guard: PASS — explicit staging target and mutation confirmation required; production target and unconfirmed destructive cleanup rejected.
- Production build/artifact: PASS — 262-file build (21.49 MiB); validated 263-file artifact (21.52 MiB).
- Production leakage scan: PASS — no RESET-2 namespace, synthetic identity, runtime guard marker, or candidate world ID in `dist`, `functions/index.js`, Firestore rules, or index configuration.
- Secret and machine-local-path scans: PASS — zero findings.
- `git diff --check`: PASS.
- Read-only production preflight: PASS for the locked live-world baseline and disabled reset controls. It made no writes.

Non-blocking test-environment observation: one realm-announcement emulator teardown emitted the existing Seasonal Achievement background-trigger error for a fixture account without a starting city after the foreground gate had passed. The suite continued and all 17 files passed; no RESET-2 source participates in that trigger. Track it as emulator-noise/runtime-hardening debt, not as reset evidence.

Production readiness blocker: the read-only preflight observed Firestore point-in-time recovery and delete protection disabled. A real reset remains NO-GO until the production backup policy is explicitly accepted/configured and a later authorized final production dress rehearsal passes.

No production deployment, merge, season switch, world mutation, player movement, generated-region activation, or commit/push occurred in RESET-2.
