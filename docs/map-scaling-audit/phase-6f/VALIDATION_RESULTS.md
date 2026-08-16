# Validation Results

Phase 6F authoritative validation covers:

- all 36 geometry/theme combinations
- locked 118-asset manifest and unchanged hash
- 10,000-map distribution and exact-duplicate checks
- exactly 40 cities, four starting candidates, 112 px spacing, and unique city IDs
- deterministic regeneration
- short-world versus expanded-world immutable packages
- published edge contracts and inherited constraints
- reciprocal topology, sockets, OPEN/GATED targets, perimeters, and transition bands
- sampled road-focused visual review

The Phase 6F validator passes.

Final validation:

- frozen dependency install: pass
- production dependency audit: pass, no known vulnerabilities
- lint: pass
- full tests: pass
- route parity: pass, 1,050 cities / 210 directed map chains
- production build: pass, 262 files / 21.49 MiB
- production artifact: pass, 263 files / 21.52 MiB
- Phase 0 regression: pass, 253 checks
- authoritative Phase 1 decision: pass, 216 checks
- Phase 2 regression/capacity/decision: pass, 297 / 24 / 146 checks
- Phase 3–6F validators: pass
- isolated economy-concurrency emulator gate: pass
- fresh complete Firebase emulator suite: pass, 17/17 files
- production leakage scan: pass
- `git diff --check`: pass

The first monolithic emulator invocation hit the previously observed transient assertion `The gear upgrade did not consume its Level 1 duplicate.` It passed immediately in isolation, and a fresh complete 17-file emulator rerun passed. The transient is recorded and was not hidden or used to weaken a test.

The expected audio unlock validation logs an intentionally simulated `EncodingError`; its validation suite passed.
