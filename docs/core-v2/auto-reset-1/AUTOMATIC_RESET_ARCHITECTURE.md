# AUTO-RESET-1 architecture

AUTO-RESET-1 is a separate Node 22 Firebase Functions codebase. It does not change or invalidate the exact RESET-2 candidate bundle. Production deployment and enablement are separate future operations.

## Schedule

- Authoritative timezone: `Etc/UTC`.
- Season identity: `season-YYYY-MM`, derived from the UTC first-of-month boundary.
- Reset: `0 0 1 * *` (00:00 UTC on the first).
- Prebuild coordinator: `0 * * * *`; it acts only when the computed prebuild time is due.
- Catch-up watchdog: `*/15 * * * *`; after the first boundary minute it keeps attempting the one current calendar boundary idempotently until that operation succeeds or hard-aborts. It never runs multiple missed months back-to-back.
- Recommended prebuild lead: T-24 hours. T-6 and T-1 are valid but provide materially less time for bounded retries, diagnosis, capacity repair, and alert response.

Month arithmetic uses calendar months, never fixed day counts. Tests cover September through January, year rollover, February, and leap-year February.

## State machine

`SCHEDULED → PREBUILDING → PREBUILT → RESET_FREEZE → FINAL_SNAPSHOT → MIGRATING → VALIDATING → CUTOVER_READY → CUTTING_OVER → ACTIVE → OLD_SEASON_ARCHIVED`

Failure states are `PREBUILD_FAILED`, `RESET_ABORTED`, `MIGRATION_FAILED`, `VALIDATION_FAILED`, `CUTOVER_FAILED`, and `POST_CUTOVER_EMERGENCY`. Every transition is allowlisted. Examples such as `PREBUILDING → ACTIVE` and `VALIDATION_FAILED → CUTTING_OVER` are rejected.

The prebuild creates and validates the non-player-dependent world before the boundary: the immutable Core package, 25 Core region definitions, 1,480 Core city definitions, 17 current objectives, required active outer capacity, and exactly two STANDBY regions. Player entry stays disabled.

At the boundary the controller freezes world mutation, records the final backup/snapshot receipt, migrates only allowlisted player state, validates the complete candidate, and performs one compare-and-set pointer transaction. The old season remains authoritative until that transaction succeeds.

After cutover, automatic smoke gates run before expansion continues. A post-cutover smoke failure enters `POST_CUTOVER_EMERGENCY`; it stops further placement/expansion, preserves both datasets, alerts, and does not destructively roll player ownership backward.

## Locking and retries

The deterministic operation identity hashes source season, target season, scheduled boundary, and candidate version. A distributed 15-minute lease serializes work. Duplicate Scheduler delivery either resumes the same operation or exits successfully; it cannot create a second season, migration, starting-city assignment, or pointer transition.

Transient failures (`aborted`, `deadline-exceeded`, `resource-exhausted`, `unavailable`, temporary Storage/worker errors) receive at most three idempotent attempts with exponential backoff. Integrity mismatches never retry automatically. They hard-abort, unwind maintenance when the pointer is unchanged, retain the failed namespace for diagnosis, emit a CRITICAL alert, and leave the old season active.

## Maintenance and archive

`SEASON_RESET_IN_PROGRESS` provides read-only login and blocks city capture, world-bound upgrades, march/rally/reinforcement creation, objective capture, main-city relocation, player placement, and normal region activation. Success reopens the new season. Pre-cutover failure reopens the old season.

The replaced season becomes `RETIRED_READ_ONLY`. The starting retention recommendation is 30 days. AUTO-RESET-1 never automatically deletes an old season.

## Runtime controls

The authoritative config owns `monthlySeasonResetEnabled`, `automaticPrebuildEnabled`, and `automaticCutoverEnabled`, plus independent kill switches for prebuild, reset, migration, cutover, generation, publication, activation, and expansion. The tracked production defaults set all three feature flags OFF and all eight kill switches ON. The scheduler does not depend on a browser or Crownlands Studio.
