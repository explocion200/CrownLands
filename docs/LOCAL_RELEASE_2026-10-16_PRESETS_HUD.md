# Local web release — October 16, 2026, 20:00 UTC

The owner authorized installing the pending backend and publishing the approved
updates. Build `16512ad423ae6bc37f07ff6b326056e6347c1b9c` is **LIVE — WEB** at
[playcrownlands.com/play/](https://playcrownlands.com/play/) and
[game.playcrownlands.com/play/](https://game.playcrownlands.com/play/).
This record does not claim an itch.io publication.

## Published changes

- [PR #585](https://github.com/explocion200/CrownLands/pull/585): applying a saved
  skill preset costs exactly 10 Crowns. Saving and renaming remain free; Gold is
  unchanged. Old Gold confirmations and stale saved builds are rejected, while
  retries cannot charge twice or reapply an earlier build.
- [PR #586](https://github.com/explocion200/CrownLands/pull/586): labeled Leaderboard,
  Clan, Daily and Inner Castle images retain the original button sizes and actions.
  Clan continues to show the player's saved shield.
- [PR #587](https://github.com/explocion200/CrownLands/pull/587): correct the local
  document-size check that blocked army resolution for report-heavy profiles.
  The 1 MiB document budget now uses logical storage sizes rather than inflated
  typed JSON wrappers, following the documented
  [size calculation](https://firebase.google.com/docs/firestore/storage-size).
  No report-pruning workaround or manual player-data rewrite was used.
- Seven matching website guides/rules pages from
  [website PR #31](https://github.com/explocion200/crownlands-website/pull/31)
  were published with their reviewed 10-Crown wording.

## Verified authority and deployment

The active realm remained `main-realm-2026-10 / realm-2026-10 / shard_0001`
and `core-expansion-v1`. The existing local epoch and account/payment/provider
configuration were preserved. No database schema migration or Firebase deployment
was performed.

The installed backend source fingerprint is
`1bc62fcef78ad394baac88fb89bd436f5974f15d9fc2898b0c6c941fc8c75118`;
the local runtime fingerprint is
`71ac7617709190f531f4957c8be61069ed9ac4ba7bb56f7f18a09e8de2184583`.
Preparation verified 97 unchanged installed source files, the exact changed files,
the GitHub artifact attestation and the full 1,178-file local game inventory.
The installed static transformer and publisher programs were unchanged.

An operator-controlled release installed the backend, ran the actual installed
code against synthetic PostgreSQL fixtures, restarted all six permanent services
and published the matching client and guides. Automatic publishing then verified
and activated `auto-16512ad423ae6bc37f07ff6b326056e6347c1b9c` at 20:00:00 UTC.
The automatic rollback target is the compatible operator release, not an old
Gold-price or Firebase backend. Exact HTTPS checks passed on both hostnames,
including the four new artwork files, stylesheet, client logic, service worker
and public build identity. All seven website page hashes matched.

The first installer attempt restored the previous files before publication when
a temporary test folder was inaccessible under the private default umask. The
corrected folder permissions passed both fixture tests before retry. Once the new
client was public, the installer would preserve Crown semantics and hold for
repair on failure rather than restore a Gold handler behind Crown confirmations.

## Validation and recovery

The exact repair head `c427d72156618a19701389b106ab4f492fa08504` passed local
syntax/lint/build/artifact checks, value/storage/game/job PostgreSQL suites,
new document-size boundary/rollback tests and atomic 10-Crown preset tests.
The three required [GitHub checks](https://github.com/explocion200/CrownLands/actions/runs/38957642326)
passed, including the selected preset emulator suite. The prior HUD desktop and
landscape-mobile checks passed on PR #586; no visual code changed in the repair.
Synthetic tests did not spend a player's Crowns.

Read-only diagnosis reproduced the original size rejection and verified eight
failing resolutions reached write preparation with the correction. After
activation, the backlog drained without manual data changes. Five bounded
serialization failures occurred during catch-up; subsequent processing left zero
due/overdue current-realm army documents and no pending or dead jobs. Diagnostics
were preserved before restarting the worker to clear its latched historical
failure counter and observe steady operation.

Detailed receipts remain private under
`~/.local/share/crownlands/publish-preset-hud-20261016` and
`/var/lib/crownlands-transfer/release-update-16512ad423ae6bc37f07ff6b326056e6347c1b9c-v2`.
Google Cloud monitoring, encrypted off-site backups and the permanent
translation-only IAM grant remain enabled. Google sign-in, Stripe and Resend
retain their existing external integrations.

A signed-in live preset purchase was not executed by the operator. Actual
installed-code fixture tests verify the wallet/allocation transaction; real
players must still confirm each 10-Crown application. Existing open game tabs
should refresh to load the released client.
