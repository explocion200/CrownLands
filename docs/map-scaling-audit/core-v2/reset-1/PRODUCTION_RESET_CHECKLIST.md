# Production reset checklist

## Seven days to 24 hours before

- Obtain explicit reset approval, maintenance window and rollback owner.
- Re-run the staging rehearsal against the exact release candidate on 2026-08-25.
- Capture read-only production counts, hashes, active pointer and backup identifiers.
- Confirm 25 Core packages, 1,480 unique Core cities, objective rules, 118-asset hash and sufficient outer capacity for the real population.
- Confirm two STANDBY packages and at least two generation workers available.
- Validate the strict persistence allowlist against a production-shaped export without writing production.
- Confirm all generation/publication/activation/expansion controls and the production rollout flag are OFF.

## Maintenance start

- Announce maintenance and stop new sessions/world mutations.
- Record final active pointer revision and quiescence receipt.
- Snapshot persistent player/clan/Common Gear data and produce per-player before hashes.
- Do not delete, truncate or overwrite the old season.

## Build replacement

- Create a new world/season path and operation ID.
- Transition `PREPARING` → `INITIALIZING`.
- Initialize 25 Core maps, 1,480 cities, exact objective types and topology.
- Initialize only required ACTIVE player regions plus two STANDBY packages.
- Migrate allowlisted identity/progression and assign fresh outer-region main cities.
- Transition to `VALIDATING`; run capacity, topology, objective, package, security, persistence and spawn-threshold validators.
- Compare every before/after persistence hash and prove all seasonal fields reset.

## Cutover

- Require two-person READY approval and a sealed validation receipt.
- Atomically compare-and-set the active pointer revision.
- Verify new logins, returning players, main-city restrictions, routes, objectives and NPC threshold.
- Mark the old season RETIRED/ARCHIVED and read-only; keep it available.
- Keep rollout controls OFF unless separately approved.

## Abort / rollback

- Before pointer switch: mark new season ABORTED and leave old pointer untouched.
- After pointer switch: restore old pointer revision, stop writes to new season and mark it ABORTED/RETIRED.
- Never copy new seasonal ownership back into the old season.
- Preserve all receipts and partial data for incident review.
