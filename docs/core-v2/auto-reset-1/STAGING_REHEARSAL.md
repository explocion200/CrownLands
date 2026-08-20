# Scheduled staging rehearsal

Project isolation:

- staging: `crownlands-map-staging-2026`
- production (forbidden): `crown-land-b15e0`
- source evidence: RESET-2 exact-candidate staging run `reset2-aug25-exact-candidate-v5`, 5,000 synthetic players

The separate `auto-reset` codebase was deployed only to staging. Cloud Scheduler invoked the actual scheduled prebuild and reset functions; the successful path received no manual call or intervention between scheduled dispatch and cutover.

The deliberate failure candidate prebuilt successfully, then failed the hard Gear-level check. Final state was `VALIDATION_FAILED`; `automaticCutoverAllowed=false`; the active pointer remained on `season-2026-10`; maintenance returned to an aborted/off state.

The first world-pointer verification exposed a staging-only integration defect: the season changed but the world ID would have remained stale. The fail-safe integrity guard stopped that candidate at `CUTOVER_FAILED`, no pointer change occurred, and an immutable failure receipt was recorded. The candidate schema and atomic transaction were corrected so the target world ID is mandatory and the prior world ID is retained for audit.

The final valid candidate then prebuilt and reset on a separate deterministic operation ID. Final state was `OLD_SEASON_ARCHIVED`; the pointer moved atomically to both `season-2026-11` and `auto-reset-1-staging-world-2026-11`; the old season became `RETIRED_READ_ONLY`; no old-season deletion occurred. Its immutable receipt contains scheduled and actual times, target world, Core/topology hashes, player/Clan/Gear counts and checksum, city/objective counts, backup receipt, GO/NO-GO evidence, cutover result, archive result, and final status.

Receipt hash: `726ab25dae1ed576e7145f66b8764cdd3a9b30ef477e6696849bb850c7b528e2`.

After the rehearsal:

- `monthlySeasonResetEnabled=false`
- `automaticPrebuildEnabled=false`
- `automaticCutoverEnabled=false`
- all eight staging kill switches engaged
- prebuild cron restored to `0 * * * *`
- reset cron restored to `0 0 1 * *`
- catch-up cron restored to `*/15 * * * *`
- production was not a deployment or mutation target
