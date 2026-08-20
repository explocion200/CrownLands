# AUTO-RESET-1 validation results

Status: PASS in development and the isolated Firebase staging scheduler path. Production enablement remains blocked and OFF.

- Authoritative runtime: Node `22.23.2`.
- UTC calendar tests: PASS for September, October, November, December, January/year rollover, February, and leap-year February.
- State machine: PASS; 10 legal transitions exercised and four illegal transitions rejected.
- Automatic GO/NO-GO: PASS; all 39 hard checks green on the success candidate.
- Forced integrity failure: PASS; Gear-level mismatch reached `VALIDATION_FAILED`, no pointer cutover occurred, and maintenance unwound.
- Duplicate scheduler invocation: PASS; safe exit with zero duplicate reset, migration, region, city, or starting-city creation.
- Late starts: PASS at +1 minute, +15 minutes, and +2 hours.
- Missing PREBUILT candidate: PASS; reset aborted before freeze and the current season continued.
- Bounded retry: PASS; two transient prebuild failures converged on attempt three and one transient final-snapshot failure converged without weakening validation.
- Multi-month simulation: PASS for A→B→C→D→E with 5,000 players, stable Clan identity/membership, exact Flag persistence, exact Common Gear inventory/equipment/level/upgrade/duplicate progression, and zero consumable/world-state persistence.
- Prebuild development timings (5,000 players): T-24 `422.855 ms`, T-6 `421.132 ms`, T-1 `423.243 ms`; T-24 remains the operational recommendation because timing headroom, not CPU time, is the safety constraint.
- Measured development freeze model: 30 players `43.287 ms`; 5,000 players `8,148.449 ms`. These are local controller measurements, not production network downtime guarantees. RESET-2’s production-shaped staging timings remain the network reference.
- Scheduled staging hard-failure path: PASS (`VALIDATION_FAILED`).
- Scheduled staging success path: PASS (`OLD_SEASON_ARCHIVED`), no human intervention between scheduled prebuild and cutover; the atomic pointer changed both season and world identity.
- Staging defect correction: PASS; an initially stale target-world binding was stopped at `CUTOVER_FAILED`, then corrected and covered by assertions requiring the new world ID and audited prior world ID.
- Immutable scheduled staging receipt: PASS for every required audit field; benchmark receipt `726ab25dae1ed576e7145f66b8764cdd3a9b30ef477e6696849bb850c7b528e2`.
- Staging controls after rehearsal: all three automatic flags OFF; all eight kill switches ON; normal UTC cron schedules restored.
- RESET-2 exact-candidate source bundle: unchanged, `2e68667049a02b05fef2e1d5d706de26b7075b32b13c42af4c0f5f6ee5811ebd`.
- Synthetic archived-season model: approximately `32,229,018` bytes per 5,000-player season and `386,748,216` bytes across 12 retained monthly snapshots. This excludes Firestore index/metadata overhead and is not a production billing measurement.
- Production baseline: 15 maps, 1,050 cities, 210 directed chains, zero generated ACTIVE regions.
- Generated-player art: 118 assets; locked manifest unchanged.
- Fresh Firebase emulator suite: PASS, all 17 files under Node 22 (including economy concurrency).
- Full static release gate: PASS (dependency audit, lint, full application tests, route parity, production build, and artifact validation).
- Phase 0/1/2 authoritative gates: PASS (253 / 216 / 297 regression + 24 capacity + 146 decision checks).
- Phase 3/4/5/6E/6F and Phase 9 environment guard: PASS. Historical Phase 7–9 diff-scope guards remain immutable checkpoint guards and were not broadened to accept later reset paths.
- RESET-1 / RESET-2 / Core QA-1: PASS; 25 Core maps, 1,480 Core cities, persistence allowlist, main-city restrictions, and exact RESET-2 candidate identity preserved.
- Production artifact: PASS (263 files, 21.52 MiB); AUTO-RESET leakage, secret, and machine-local-path scans returned zero findings; `git diff --check` passed.
- Production deployment/mutation: none.
