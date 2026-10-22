# Clan Shop personal allowance repair — October 22, 2026

Implementation is not proof of deployment. This fix requires an approved local
backend installation; the normal publisher must retain its compatibility hold
until that installation is verified.

## Cause and behavior

The shared Shop handler wrote `clanShopUsage` through a recursively merged player
update. After midnight UTC, purchasing one item replaced the date but preserved
yesterday's counts for the other items. The purchase response showed those items
available; refreshing then showed their allowance exhausted.

Shop writes now replace the complete usage map in the same transaction as Gold,
inventory and the operation receipt. Member, Officer and Leader purchases use
the same personal allowances. Building permissions, completed Shop unlocks,
one-hour membership probation, personal Gold prices, independent main-Shop
limits and the rolling 72-hour Shield cooldown are unchanged.

Already affected records recover once, when their owner next uses an authorized
Clan Shop request. Version-2 usage reconstructs today's counts and the original
Shield deadline from that player's successful private purchase receipts. Only
the current realm/generation/shard counts. Reads cover the last 72 hours, are
bounded to 97 receipts, and stop with a support message above 96 rather than
guessing. Normal limits permit fewer than half that number in this interval.
Retries do not spend again or replenish legitimate purchases. Subsequent reads
use the corrected counters without another receipt query.

No public endpoint, database schema, background player scan, inventory grant,
Gold refund, archived-world edit or bulk player-data rewrite is required. The
existing local PostgreSQL transaction adapter implements the field replacement.

## Validation and rollout

- `tools/test-local-postgres-clan-shop.js`: actual current-realm commands against
  a disposable PostgreSQL schema; four fictional users covering all clan roles,
  all seven items, daily/season rollover, receipt-based recovery, original Shield
  deadline, wrong-season/future/previous-day receipt filtering, retries,
  concurrent final purchases, ownership, probation, affordability and main-Shop
  independence.
- `functions/test/emulator-holding-tower-lifecycle.js`: affected shared server
  lifecycle and Shop transaction behavior, including complete-map replacement
  and recovery, runs in required CI.
- `tools/validate-clan-shop-browser.js`: ordinary member without a garrison buys
  every item up to its limit; upgrades stay restricted. Desktop 1440×900 and
  landscape 844×390 / 568×320, retry and eligibility states, fixed purchase footer.
- `tools/validate-clan-tower-buildings.js`: catalogue levels, quantities, reset
  arithmetic, prices/durations and shared construction dependencies.

Review exact-head required CI, merge, synchronize main, then prepare a protected
runtime installation of the changed `functions/index.js` and generated release
manifest. Existing clients use the same request/response contract. Obtain
backend installation authorization before changing protected service files or
activating lazy allowance repair. Validate installed fingerprints and isolated
Shop command tests, restart game/worker, check health, and only then update the
publisher compatibility fingerprint. No additional database backup is requested.
Verify the exact public client build before reporting deployment.
