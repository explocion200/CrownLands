# Crown-refill-only stamina

Confirmed October 22, 2026. Implementation is not deployment. The installed
runtime was inspected using synthetic input: a saved value of 50 became 100
after one day, and a refill at 70 cost 9 Crowns. Both shared backend rules and
client projections still implemented passive recovery.

## Rules and persistence

- Initialize new permanent stamina state once at 100. Preserve existing saved
  values; never reset on login, midnight, map/profile changes or season changes.
- Remove passive recovery entirely. Retain the old timestamp/schema so existing
  accounts remain readable; it no longer grants points.
- Refill any non-full bar to 100 for exactly 30 Crowns, once per UTC day.
  Full bars and insufficient wallets cannot purchase. Midnight restores only
  the purchase allowance, never stamina.
- Reject positive adjustments through the hunt-change reducer. Invalid,
  defeated, retired, missing or replaced NPCs cannot refund stamina, including
  already-launched hunts settling after installation. Preserve troop returns
  and eligible march-item refunds. Historical refund reports remain historical.
- Refill offer version 3 rejects old or stale reviews before spending. Replay
  existing version 1/2/3 receipts without another charge or restoration.
  Existing atomic wallet debit, allowance, receipt and concurrency guards remain.

## Compatibility and deployment

Current supported topology: `core-expansion-v1`, `monthly-shared`,
`postgres-local`; authoritative pointer inspected read-only as
`main-realm-2026-10` / `realm-2026-10` / `shard_0001`.
No schema migration, archived-world changes, account rewrite or new database
backup is required. Do not change stored player balances to undo prior recovery.

The automatic publisher must hold the new client until the separately authorized
backend installation verifies `functions/index.js`, `functions/marauder-rules.js`
and the matching generated release manifest/source fingerprint (including the
population comment change). Install through the established protected workflow
with previous runtime rollback, game/worker restart, isolated PostgreSQL tests,
health/realm checks and compatibility verification. Do not bypass publisher holds.
Then publish the matching static client and verify the build on both game hosts.
Older clients may still display projected recovery, but version-2 purchases must
be rejected by the new server; refresh to the matching client for correct display.

## Targeted validation

- Shared rule tests: all balances 0–100, long offline intervals, no recovery
  deadlines, daily rollover and rejected positive adjustments.
- Shared transaction cases run on PostgreSQL and the emulator: exact prices,
  affordability, full bars, atomic concurrent spending, duplicate requests,
  old receipt replays, stale/forged offers, profile replacement, midnight,
  Crown credits and hunts racing refills, disabled purchases and no refunds.
- PostgreSQL real callables: old timestamps, refill and dispatch retries,
  unavailable-target settlement and duplicate settlement without restoration.
- Existing Marauder combat and live-payment emulator suites: solo/boss
  invalid-target settlement, returns, march-item refunds and wallet credit races.
- Actual HUD subscription recovery and desktop/landscape browser checks:
  fixed price, no passive projection, readable explanation, preserved hunt drafts,
  Crown Shop return and no automatic purchase on opening or receiving Crowns.

Local validation passed: shared Marauder rules, stamina HUD reconnection,
isolated PostgreSQL transaction/callable integration, production-client build,
and source/production browser checks at 1440×900, 844×390 and 568×320.
The selected emulator suites and required exact-head GitHub checks remain the
merge gate. Backend installation and the deployed client identity must be
verified separately before marking this live.
