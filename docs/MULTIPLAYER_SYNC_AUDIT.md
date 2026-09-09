# Multiplayer synchronization audit

The September 9, 2026 follow-up to the missing-report correction audits report delivery, outgoing and incoming attacks, reinforcements, rallies, and reward progress. The current-realm pointer was verified as `realm-2026-09` / `main-realm-2026-09` / `shard_0001`, using `core-expansion-v1`. No archived generation or production player data is modified.

## Findings and corrections

| Area | Finding | Correction or evidence |
| --- | --- | --- |
| Reports | A failed or cached read could leave an empty history looking final. A late failed read could also invalidate a successful live response. | Show loading/reconnecting status and Retry; retain saved reports; distinguish waiting from an authoritative empty result; prefer server reads and ignore superseded completions. |
| Daily Missions and Achievements | Listener errors retained the subscribed cycle ID, preventing the same cycle from resubscribing. Foreground restart omitted both listeners. | Clear failed subscriptions, request recovery, and restart both reward listeners on resume. An actual-function regression reproduced the blocked retry before the fix. |
| Reward refreshes | Overlapping forced reads could apply older same-session results; retired requests could change replacement-session error/loading presentation. | Require the current game-session scope and current request identity in success, failure, and cleanup handlers. |
| Live callbacks | Audited reinforcement, rally, reward, clan, objective, and activity subscriptions lacked explicit guards against callbacks after stopping or changing session/realm. | A shared snapshot wrapper retires callbacks after unsubscribe, account/session activation change, or realm change. This is defensive isolation, not evidence of a reproduced Firebase SDK race. |
| Attacks, reinforcements, rallies | Current queries already constrain generation, world, shard, status, and the applicable owner or recipient. | Authenticated emulator queries execute the actual client functions; foreign-shard and archived records are excluded. Every audited collection query is checked against a matching repository index. No rules or indexes change in this update. |
| Session authority | Callable requests already check account, realm, and session activation before and after the server call. | Preserve those guards and idempotent mutation receipts. This update does not resubmit battles or claims during recovery. |

## Validation coverage

- `tools/validate-multiplayer-sync.js`, included by the realtime-health gate, executes the actual reward and report functions against controlled delayed requests, listener errors, stopped callbacks, account/session changes, and realm rollover. It verifies latest-request precedence, successful-live-read precedence, report status, and the published-read probe's failure conditions.
- `functions/test/emulator-report-delivery-rules.js` uses Auth and Firestore emulators with the actual security rules and client query constructors. It covers reports, outgoing/incoming armies, contributed/held reinforcements, forming rallies, global stats, Daily Missions, and Achievements. It also checks report privacy, the original rejected unsharded report query, reconnect, authoritative reads, and stopped callbacks.
- Existing login, subscription-scope, report/scout lifecycle, and full multiplayer emulator gates cover map subscription replacement, foreground recovery, session takeover, and mutation receipts. `prepare-pr` selects Full for this change; required GitHub checks remain separate merge gates.
- The actual Reports modal renderer and CSS were inspected in a controlled browser fixture at desktop and landscape-phone sizes. Retry transitions through loading to synchronized history. This is browser viewport testing, not physical iOS/Android testing or a production network outage drill.

## Published verification

After authorized deployment, verify the full merged commit in the public release manifest and compare the deployed client assets with the validated production artifact on web and itch.io.

Then open the published game in an already signed-in existing account and run the expression printed by:

```text
node tools/verify-published-report-read.js <full merged commit>
```

The command only prints an expression; printing it is not a passing smoke test. Execute that expression through the supported browser developer runtime with `awaitPromise` and `returnByValue`, and inspect its result. The probe requires the exact build, reads reports from the server, waits for a non-cached live snapshot, verifies realm identity, and closes its subscription. Its receipt contains build/realm identity, counts, and time without account IDs or report contents. It performs no claims, profile writes, or battle actions. A failed build check, read, realm check, or live-read timeout blocks claiming authenticated delivery was verified.

Deployment receipts and final release status belong in the release handoff. This document alone does not establish that the update is live.
