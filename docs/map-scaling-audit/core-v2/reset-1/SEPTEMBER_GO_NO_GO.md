# September 1 go/no-go

Status after RESET-1: **NO-GO for production reset**. The architecture and staging rehearsal pass, but production integration, release approval, final production-shaped population sizing and the scheduled 2026-08-25 rehearsal are still required.

## GO requires all of the following

- Exact release commit and immutable Core/outer package hashes approved.
- Fresh staging rehearsal on the exact candidate passes without unresolved data defects.
- Production read-only baseline and backup/export receipts are current.
- Strict allowlist comparison passes for every account, including empty/malformed legacy profiles.
- All forbidden Core main-city paths and malformed requests reject server-side.
- Normal Core conquest and travel remain allowed.
- Exact 25/1,480 Core validation and 40-city/15-NPC outer rules pass.
- Real expected population fits available ACTIVE capacity, with two STANDBY packages preserved.
- Rollback owner, two-person cutover approval and maintenance communications are ready.
- No open severity-1/2 issues; all release gates, emulator suites and route parity pass.

## NO-GO triggers

- Any production/staging identity ambiguity or missing backup.
- Any mismatch in Core counts, IDs, topology, objectives, package hashes or asset hash.
- Any persistence field outside the allowlist, missing allowed progression, or clan inconsistency.
- Any ability to make a Citadel/Stronghold-map city the main city.
- Any Core spawn placement, 15-NPC boundary failure or STANDBY shortage.
- Any pointer CAS failure, non-idempotent retry, unresolved security failure or release regression.

September 1 must be an explicit operator decision. RESET-1 does not schedule or execute it automatically.
