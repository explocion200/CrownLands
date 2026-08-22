# PROD-READY-1 validation results

## Authoritative results

- PROD-READY-1: PASS as a readiness validator; `34 PASS / 0 FAIL / 5 NOT_YET_CONFIGURED`. Production readiness remains false.
- RESET-2: PASS on a fresh 5,000-player run, including `17` deterministic pages, `5,000` unique placements, failure injection, and identical replay. The historical checkpoint-scope guard was not changed.
- AUTO-RESET-1: PASS on a fresh four-transition, 5,000-player local model with production controls OFF.
- Production adapters: PASS in a dedicated Firestore emulator through the Firebase adapter factory. The exact Phase 7 package schema/hash basis, locked generator and 118-asset manifest, metadata-only immutable storage, transactional 40-city/global-ID initialization, published-neighbor edge inheritance, scheduled Layer 1 Fortress reservations, conflicting inheritance/reservation rejection, `300/300/1` player pagination, Clan identity/member migration, allowlist/checksum replay, `15 -> 14` placement, concurrency, and main-city restrictions passed.
- Final scheduled staging rehearsal: PASS. The exact PROD-READY-1 candidate reached `OLD_SEASON_ARCHIVED`; the deliberate validation failure reached `VALIDATION_FAILED` and left the old season authoritative. Staging controls were disabled afterward.
- Fresh production preflight: PASS, read-only, at `2026-08-22T03:28:44.387Z`. It recorded 11 authoritative player Clan memberships and two stale conflicting denormalized Clan-member documents; all 11 authoritative memberships have matching member records and roles. The migration adapter excludes the stale records without mutating production.

## Application and Firebase gates

- Full static release gate: PASS.
- Production dependency audit: PASS, no known vulnerabilities.
- Production lint and full application tests: PASS.
- Route parity: PASS — 1,050 cities, 15 maps, 1,050 local routes, 1,050 cross-map routes, and 210 directed chains.
- Production build: PASS — 262 files, approximately 21.49 MiB.
- Production artifact validation: PASS — 263 files, approximately 21.52 MiB.
- Node 22 Firebase emulator suite: PASS — all 17 emulator files. The known prior economy-concurrency assertion did not recur.
- Auto-reset package lint: PASS.
- Auto-reset production dependency audit: PASS, no known vulnerabilities.

## Recovery gates

- PITR: `NOT_YET_CONFIGURED`; production remains `POINT_IN_TIME_RECOVERY_DISABLED`.
- Database delete protection: `NOT_YET_CONFIGURED`; production remains `DELETE_PROTECTION_DISABLED`.
- Daily backup schedule: `NOT_YET_CONFIGURED`; guarded 35-day daily policy prepared.
- Completed READY backup: `NOT_YET_CONFIGURED`; none observed.
- Isolated real restore: `NOT_YET_CONFIGURED`; cannot run until a READY backup exists and exact restore authorization is supplied.

The production-protection and restore tools were executed in dry-run/read-only mode only. No infrastructure or gameplay mutation occurred.

## Safety scans

- Production leakage scan: PASS — no PROD-READY-1 source or receipt marker is present in the production artifact.
- Secret scan: PASS — zero credential-pattern findings in PROD-READY-1 files.
- Machine-local path scan: PASS — zero machine-local path findings in PROD-READY-1 files.
- `git diff --check`: PASS.

Production remains 15 maps, 1,050 cities, 210 directed chains, zero generated ACTIVE regions, and zero Core v2 records. The exact candidate was deployed only to isolated staging for the required scheduled rehearsal. No production code was deployed and no production scheduler/config was enabled.
