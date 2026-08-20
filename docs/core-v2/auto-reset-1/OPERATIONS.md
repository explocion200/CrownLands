# Operations, observability, and September readiness

## Alerts

INFO records normal prebuild start/completion, freeze start, cutover, and archive. WARNING records transient retries, a STANDBY buffer below two, a scheduler delay beyond one minute, or a reset exceeding 15 minutes. CRITICAL records prebuild/backup/migration failures, pagination stalls beyond five minutes, any persistence mismatch, prohibited consumable persistence, Core/city/topology/objective mismatch, lock conflict, pointer failure, missed scheduler boundary, runtime beyond 30 minutes, or post-cutover smoke failure.

Each reset writes one immutable receipt containing operation ID, source/target seasons, scheduled and actual times, candidate version, Core hash, player/Clan/Gear counts and Gear checksum, city/objective counts, backup receipt, all validation results, pointer transaction, archive result, and final status. It excludes unnecessary sensitive player payloads.

## Missed scheduler behavior

The 15-minute watchdog detects a stale boundary and attempts one idempotent catch-up operation. Tests at +1 minute, +15 minutes, and +2 hours converge to the same operation without duplicate migration or cutover. It never silently skips a month and never chains multiple monthly resets automatically.

If the candidate is not PREBUILT at 00:00 UTC, the controller does not enter maintenance and does not cut over. Current gameplay continues and a CRITICAL alert is emitted.

## Downtime

Prebuild removes Core/world generation from the freeze window. The remaining work is the final snapshot, strict allowlist migration, validation, atomic pointer transaction, and smoke gates. Development benchmarks cover 30 and 5,000 players; the RESET-2 remote production-shaped rehearsal remains the authoritative network-shaped reference. T-24 is recommended so the freeze never begins without a validated candidate.

## September readiness

The calendar/state/lock/controller design and scheduled staging proof are ready. September production enablement is still NO-GO until RESET-2 is checkpointed, AUTO-RESET-1 is reviewed/checkpointed, PITR/delete protection/backup policy is explicitly approved and verified, a real backup restore drill passes, a fresh read-only production preflight passes, production scheduler/IAM configuration is reviewed, and the user explicitly authorizes production deployment and enablement.

Crownlands Studio is not a dependency and is out of scope.
