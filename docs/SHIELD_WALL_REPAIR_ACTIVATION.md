# Peace Shield after wall repair

Branch: `codex/shield-wall-repair-activation`.
Implementation status: tested locally; merge and deployment verified separately.

## Root cause and correction

Neutral attacks preserve the attacker's Peace Shield. Successful capture previously
saved `ownerShieldExpiresAtMs: 0`, so that city could remain unprotected after its
walls repaired, despite its owner's active item. A read-only aggregate audit of
the current October realm found this mismatch; a disposable PostgreSQL capture
reproduced the zero timer before the fix.

Capture now stores the new owner's remaining item deadline. Authoritative attack
dispatch (city and Tower origins), arrival and daily safe-target evaluation use
the current owner's profile instead of trusting a potentially missing/stale city
copy. The area reader projects only current-realm shield deadlines alongside its
existing bounded cosmetics lookup. Its cache includes derived eligibility, so
repair completion and account cancellation produce updates without city writes.

The 12-hour deadline is not extended. Damaged cities remain attackable until
exactly 100% integrity; there is no new mid-route reversal. Previous-owner shields
are not inherited. Main City, Stronghold, Camp, Tower, retaliation and offensive
cancellation rules remain unchanged.

## Validation

- Reproduced failure: real neutral capture retained the owner's active item but
  wrote zero to the newly captured city. The new regression now passes.
- Shared PostgreSQL/emulator cases cover capture, retry, offline repaired-city
  dispatch rejection, attacks launched during repair but blocked at arrival,
  unchanged expiry, and cancellation despite stale city metadata.
- Existing shield policy tests cover exact repair/expiry boundaries, later wall
  damage, ownership changes, exclusions and activation reversals.
- Actual authenticated area packets and browser rendering tested with two
  fictional viewers at 1440×900, 844×390 and 568×320, minimum/maximum zoom,
  missing city timer, repair, selected Attack/Shielded controls, cancellation, capture, neutral exclusion, failed
  polling and skewed phone clock. Evidence: `release-artifacts/city-shields/`.
- Reader tests cover world/generation/shard isolation, private-field projection,
  profile-only changes, expiry, no writes and unchanged DTO reuse. A local
  16-section, three-owner, 20-refresh run measured about 43 ms median / 48 ms p95,
  with one bounded owner batch per refresh. This is a fixture measurement, not
  a production-capacity claim. Existing reader optimization parity is retained
  against its pinned pre-optimization reference.

## Compatible rollout

The active target is the locally authoritative PostgreSQL game, current monthly
`core-expansion-v1` realm. The audited pointer was `main-realm-2026-10`,
`realm-2026-10`, `shard_0001`; recheck it during installation. Archived generations
are untouched. There is no schema migration, public API change, new field in the
client packet, data-repair script or extra database backup.

After all required exact-head checks and merge, synchronize clean local main.
Prepare the merged backend/runtime package and run installation preflight. Keep
the publisher's compatibility hold until a separately authorized backend
installation updates and verifies the game and worker. Then allow the matching
signed client package through the normal publisher. Verify API health, backend
fingerprints and published build identity before claiming this fix is live.
No backend installation is authorized by this document.
