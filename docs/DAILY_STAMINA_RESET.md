# Daily UTC stamina reset

Confirmed October 22, 2026. Implemented on `codex/daily-stamina-reset`.
Deployment is pending a validated merge and separately authorized backend installation.

## Rule

At 00:00 UTC, stamina resets to 100 for free. Each account may also explicitly
buy one refill to 100 for 30 Crowns per UTC day. A full bar cannot be purchased.
No gradual recovery, accumulated missed-day grants, hunt refunds or recall refunds.
Solo hunts cost 10; boss rallies cost 20 per assembled member at launch.

## Authority and compatibility

The current local PostgreSQL backend uses the shared stamina service in
`functions/`; this is not a Firebase deployment. The active topology remains
`core-expansion-v1`. No realm catalog, archived world, accepted march or public
API contract changes.

Private state version 1 gains `dailyResetDay` (YYYY-MM-DD). The server resolves
the day's entitlement during authenticated state reads and successful departures.
Reset and departure debit share the existing transaction; concurrent devices and
hunts cannot reset twice or erase accepted costs. Read-only rally readiness can
preview the entitlement without writing. No all-player midnight scan or new job.
Offline players get the current day's bar on return, never stacked missed days.

Legacy records missing the marker use their last initialization/refill day, or
their paid-use day if newer. A past day receives today's reset on first access;
a record initialized/refilled today retains its already-spent balance. Existing
paid usage survives adoption. The marker is persisted through normal authorized
operations; no production data rewrite or extra database backup is required.

Refill offer version 4 rejects stale reviews before spending. Existing committed
receipt versions still replay their original receipt without another charge or
paid grant. An independent new-day reset may accompany a replay. Wallet changes,
stamina changes and crossing midnight invalidate an uncommitted review.

The HUD uses the server clock and the existing UI tick to request one authoritative
refresh at the daily boundary. Hidden tabs refresh on becoming visible. Failures
retry at most once per 30 seconds; requests are coalesced. There is no additional
normal-day polling, optimistic local grant or per-account interval. Subscription
revision checks and session identity prevent stale replies overwriting a reset
or another account. The refill panel shows the 00:00 UTC reset countdown.

## Validation

Selected local checks passed during implementation:

- `tools/validate-marauder-rules.js`: boundary math, backward clock, cap, no client
  prediction, existing reward and combat rules.
- `tools/test-local-postgres-stamina.js`: isolated real PostgreSQL transactions
  and actual local callables; midnight races, one paid allowance, receipt retry,
  wallet competition, legacy adoption, profile guards, no refunds, solo dispatch,
  read-only boss readiness and atomic boss launch after a missed reset.
- `tools/test-stamina-daily-reset-ui.js`: midnight with delayed/failed responses,
  bounded retry, hidden/offline catch-up, incorrect device clock, stale snapshots
  and account switching.
- `tools/test-stamina-display-recovery.js`: actual local transport/HUD recovery,
  deduplication and authorization revocation with no extra normal-day requests.
- `tools/validate-marauders-browser.js`: source and production UI at 1440×900,
  844×390 and 568×320, including the reset text, scroll/fixed footer, explicit
  paid review, keyboard/touch and retained hunt drafts. Screenshots are generated
  under ignored `release-artifacts/marauders/` using fictional data.

The committed validation plan also selects stamina-refill, marauder-combat and
live-Crown-payment emulator suites for shared transaction, command, privacy and
wallet dependencies. Their exact-head GitHub results must pass before merge;
local execution above is not a claim that CI or deployment has completed.

## Rollout

1. Review the complete diff, pass the selected checks and merge through the normal
   workflow. Synchronize clean local main. The publisher must retain its backend
   compatibility hold while the installed service differs.
2. Prepare the exact merged `functions/marauder-rules.js`,
   `functions/stamina-service.js` and regenerated release manifest. Verify the
   currently installed hashes, approved main commit, active realm/epoch and
   service health. Re-run isolated integration checks against the candidate.
3. With backend installation authorization, briefly stop the game and worker,
   install the reviewed files, restart and verify health. Only then record the
   actual compatible source fingerprint in the existing publisher policy. Do
   not change the authority epoch, adapter code, accounts or database schema.
4. Release the matching signed client through the configured publisher. Verify
   both entry points, actual served asset hashes, deployment commit and matching
   game/auth epoch. A merge or uploaded package alone is not deployment proof.

Retain code/configuration rollback material under the existing installer rules.
Before any post-activation rollback, account for the additive state marker and
offer version; restoring old code removes daily entitlement until reinstalled.
No player-data rollback is part of this change. Real-player midnight observation
remains a post-installation check; controlled-clock coverage verifies the boundary
without waiting for or manipulating the production clock.
