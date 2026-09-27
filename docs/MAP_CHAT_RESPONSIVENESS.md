# Map and chat responsiveness

Branch: `codex/map-chat-responsiveness`, based on `fa568a338ef78567810f7b31462f6bf541752844`.

## Changes

The Map button overview rebuilt the whole grid 249 times while opening the
25-map browser fixture. Zoom input also recalculated unchanged world bounds.
One geometry snapshot now serves each opening and is replaced when the live
realm region set changes. Panning updates only the camera transform. Zoom
indicator variables update on the small trim elements instead of invalidating
styles across every map card and SVG. Artwork, labels, navigation and map rules
are preserved.

Chat now returns the canonical message after its server transaction commits.
The sender can display that confirmation immediately, without waiting for the
Firestore listener to deliver the same message. Realtime echoes reconcile by
ID; edits, removals, access failures, account changes and clan changes take
precedence over stale acknowledgements. Replayed receipts contain no message
body. Older backend responses remain supported. Drafting stays enabled during
sending, and a response cannot erase a newer draft. Submission remains locked
until completion and the existing three-second cooldown remains unchanged.

The Main City authorization read starts as soon as the profile arrives, while
independent restriction, rate and receipt reads continue. All reads and writes
remain in the same authoritative transaction.

## Evidence and limits

Local Chromium fixture measurements use synthetic data and the existing game
runtime. The batches measure synchronous camera work, not physical-device FPS.
Timings vary with machine load; structural regression checks enforce the work
reduction without imposing a machine-dependent time threshold.

| Scenario | Before, desktop / 844×390 | After, representative run |
| --- | --- | --- |
| Open 25-map overview | 499 / 470 ms | 215 / 176 ms |
| Whole-grid calculations during opening | 249 / 249 | 1 / 1 |
| 60 pan updates | 4,608 / 4,166 ms | 2.1 / 1.2 ms |
| 30 zoom updates | 2,835 / 2,760 ms | 369 / 272 ms |
| Grid calculations during gestures | 750 / 750 | 0 / 0 |

Browser coverage includes 1440×900, 844×390 and 568×320, desktop/touch input,
zoom-stable map indicators, reopening, newly active regions, and confirmed chat
delivery while listener delivery is deliberately withheld. Chat cases include
duplicate submission, cooldown rejection, failed drafts, older backend replies,
realtime edits/removal, moderation before acknowledgement and stale sessions.
The scheduling test verifies overlapping reads, restriction gating and waiting
for commit. The selected chat emulator suite verifies stored message parity,
identity, membership, current-season participation, cooldowns, idempotency,
retention and direct-write denial.

A read-only production query at 2026-09-27 14:26 UTC covered the preceding day
(11,744 operation entries, no truncation). The newest `sendChatMessage` revision
had only two samples: 754 and 842 ms of handler execution. The previous revision
had 34 samples, p50 385 ms and p95 793 ms. These exclude client/network display
delay and cannot establish current tail latency or a production improvement.
The current realm pointer was `realm-2026-09`, shared realm `shard_0001`; client
and backend release contracts use `core-expansion-v1`. No world data changed.

## Release

The fix requires the web client and `sendChatMessage` Function to be published
after explicit authorization. Backend-first publication supports existing
clients; the new client also accepts older responses. No rules, indexes,
migration or production data update is required. A merge alone does not make
these changes live. Authenticated production timing and physical mobile
smoothness remain post-deployment checks.
