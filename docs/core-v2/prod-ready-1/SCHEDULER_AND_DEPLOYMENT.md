# Scheduler, deployment, and freeze plan

## Prepared schedule

Production jobs are not created or enabled by PROD-READY-1.

| Job | Intended schedule | Time zone | Current production state |
| --- | --- | --- | --- |
| Monthly reset | `0 0 1 * *` | UTC | absent/OFF |
| T-24h prebuild | hourly coordinator | UTC | absent/OFF |
| Watchdog/catch-up | `*/15 * * * *` | UTC | absent/OFF |

Season IDs remain `season-YYYY-MM`. Duplicate invocation is guarded by deterministic operation identity, leases, receipts, and atomic pointer comparison.

## Safe production defaults

- `monthlySeasonResetEnabled=false`
- `automaticPrebuildEnabled=false`
- `automaticCutoverEnabled=false`
- generation, publication, activation, expansion, migration, reset, and cutover kill switches engaged

Production currently has no automatic-reset functions or reset scheduler jobs. A future code deployment must preserve these OFF defaults.

## Deployment stages — not executed

0. Deploy production-capable code with every automation flag OFF and every kill switch engaged.
1. Run a fresh read-only baseline and compare it with the frozen candidate.
2. Verify PITR, delete protection, the 35-day daily backup schedule, a completed pre-freeze backup, and the isolated restore receipt.
3. Verify adapter versions, Firestore indexes, service authority, candidate hashes, and disabled controls.
4. Under separate authorization, enable only the hourly T-24h prebuild coordinator.
5. Under separate authorization, enable the monthly UTC reset job and 15-minute watchdog.
6. Under separate authorization and fresh 39-check GO evidence, enable automatic cutover.

## Reset-sensitive freeze

Changing any item below creates a new candidate and repeats the affected gates:

- persistence migration or Player/Clan/Flag/Common Gear schema: allowlist, pagination, checksum, emulator, and both scheduled staging paths;
- Core package or world bootstrap: complete Core validators, candidate hashes, READY checks, and both staging paths;
- generated-region generator or published edge contracts: generation adapter, package hashes, topology, and both staging paths;
- player placement, 15-NPC rule, or main-city restriction: concurrency, boundary, security, and both staging paths;
- READY validation or automatic GO/NO-GO: all 39 checks and deliberate-failure staging path;
- season pointer, scheduler, or reset lock: duplicate invocation, lease, atomic pointer, scheduled success, and scheduled failure.

The frozen candidate is invalid until those repeats pass.

## Old world

The old season is `RETIRED_READ_ONLY` for an initial 30 days and is not deleted at cutover. Automatic old-season deletion remains unconfigured.
