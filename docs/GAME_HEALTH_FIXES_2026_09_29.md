# Game health fixes — September 29, 2026

Base: `02b0a4c6fb366602604254c5f0a9ee42af6d9531` (PR #395).
These changes require a separately verified deployment.

## Map switching

The login stylesheet used `body:has(#setupScreen.visible)` to hide the portrait
rotation warning. Chrome's invalidation trace showed ordinary city updates
invalidating the entire body subtree, including during map changes. The trace
recorded 26 body subtree invalidations during a neighboring-map switch and return.

The login screen and rotation warning are siblings. Targeting the warning with
`#setupScreen.visible ~ .rotate-warning` preserves its visibility rules while
removing the document-wide dependency on descendant changes.

Chrome at 844×390 with 4× CPU slowdown, using the isolated scenario A fixture:

| Measurement | Before | After |
| --- | ---: | ---: |
| Traced switch out / back | 11.02 / 6.51 s | 3.08 / 2.53 s |
| Traced style recalculation, whole scenario | 15.97 s | 1.75 s |
| Responsive interaction suite switch out / back | 10.84 / 8.89 s | 2.19 / 2.08 s |

These are local emulations and individual runs, not production or physical-phone
latency guarantees. Trace instrumentation adds overhead. The earlier responsive
baseline is from the preceding health audit on the same base. Network-limited
startup remains dependent on connection speed and asset downloads.

The responsive suite passed map switching, pickups, touch/freeze recovery,
reconnects, route previews, shop node/focus stability and incremental chat updates
at desktop, landscape, short landscape and 4× slowdown. The login layout suite
passed 56 cases, including portrait sign-in and the restored portrait gameplay
warning. Portrait and short-landscape screenshots were also inspected.

## Heartbeat and update recovery

Regular update polling previously awaited the deployed-page fetch without a
deadline. Update installation also awaited service-worker lookup and update
without a deadline. A stalled promise could prevent future checks or hold a
compatibility-recovery reload indefinitely. Polling now releases its lock after
10 seconds; service-worker preparation allows the existing reload to proceed
after 3 seconds. Existing save bounds and duplicate-reload protection remain.

Session activation now applies the accepted response's realm identity before
publishing `session-ready`, consistent with the ordinary join path. The adapter
regression test covers an admission response with a different shard and verifies
the next request carries the accepted shard. This is a consistency guard; it does
not establish that production admission changed shards during the audit.

The previous production audit found compatibility rejections before any heartbeat
transaction began. Those logs contain no client build or rejected scope, so they
cannot establish the cause of each historical request. Already-running old
clients must refresh to receive these fixes. Verify the rejection rate and update
recovery after deployment; do not relax server compatibility checks.

## Reward ads: remaining setup

`playcrownlands.com` is now in the client host allowlist. This allowlist does not
establish approval or inventory in Google Ad Manager. Production still has no
rewarded ad unit path, so the client cannot use a test unit on the public site.

Read-only checks on September 29 found:

- The Firebase web app's reCAPTCHA Enterprise App Check configuration has no site key.
- `serverConfig/rewardedAds` is absent, so rewards remain disabled on the server.
- Listing reCAPTCHA keys returned HTTP 403; existing keys could not be inspected.

To finish, obtain the real `/NETWORK_CODE/AD_UNIT_CODE` from Ad Manager and
configure App Check for the approved game domains. Then verify the Token Verifier
role, intent TTL, frequency caps, consent setup and controlled-account completion
before enabling the server switch. See [Firebase setup](../FIREBASE_SETUP.md).
No production settings or player data were changed by this update.

The AdSense publisher script and `/ads.txt` were verified present during the
preceding audit. They are separate from Google Ad Manager rewarded inventory.

Local evidence: `release-artifacts/health-fixes/` (ignored traces and logs),
`release-artifacts/performance/after-interactions.json`, and
`release-artifacts/illustrated-login/layout-report.json`.
