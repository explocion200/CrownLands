# Game stability audit — 27 September 2026

## Scope and evidence

Reviewed the active `core-expansion-v1` client/server implementation, release contract,
arrival and report lifecycle, map rendering, routing, reconnects, authentication,
combat/gear/economy validations, and current production request/error aggregates.
Baseline: `639b31dbe6b1ff7e35916e1514af493225d4a406` (PR #373).
This is a broad automated and source review, not proof that every device or gameplay
sequence is free of bugs. No production player data was changed.

Raw local evidence lives in `release-artifacts/game-audit-2026-09-27/` (ignored).
The production collector stores aggregated diagnostics without player identifiers.

## Corrections

1. **Arrival retry storms:** non-scout arrivals did not share the scout retry map.
   Repeated countdown/snapshot entry points could immediately resubmit failed calls.
   All arrival kinds now share per-session, per-army request ownership and bounded
   1/2/4/8-second backoff with jitter. Early-arrival delays survive replacement
   snapshots. Authorization/invalid-request failures wait for reconnect. An old
   session's completion cannot clear a new session's request lock. Server authority,
   the two-worker scout queue, travel durations, troops and King Power are unchanged.
2. **Moving-map repaint cost:** viewport-resident army tokens declare transform
   compositing. Existing offscreen-token removal bounds retained token elements;
   map geometry, icon size, navigation, and scouting-eye behavior are unchanged.
3. **Regression coverage drift:** update VM fixtures to load the real shared gear
   caps, assert the approved 50% wall-repair cap, accept the durable launch adapter's
   pending callback, and compare actual client/server release IDs. Optional Clan
   styles remain lazy-loaded. Both installation-cache validators now share the
   existing byte limit; no budget is increased. First-time onboarding uses a
   verified Auth Emulator account, while email-auth tests retain unverified gates.
   The animation test recognizes the shared report-read wrapper.

## Observations before the fix

- Eight startup/recovery fixtures passed, with no uncaught errors or duplicate
  listeners. Cold/warm desktop readiness was 2.27/1.39 seconds; slow-network,
  4x-CPU mobile readiness was 43.77 seconds. These are local synthetic fixtures.
- The 15-profile map matrix completed. Crowded desktop scenarios B/C were below
  capacity targets. DOM, request-count and decoded-image estimates also exceeded
  several existing budgets. Budgets were not relaxed.
- A controlled ABBA compositor experiment on scenario C (150 cities, 100 marches)
  improved desktop idle FPS from roughly 14 to over 100, and normal mobile from
  roughly 20 to over 110. The 4x-CPU mobile case remained roughly 7–9 FPS. Short
  synthetic samples are evidence of rendering improvement, not production FPS.
- Current-revision production collection returned 1,675 POST requests, 611 error
  records and 811 timing records, with complete pagination. Although the query
  requested one day, those revisions had only about 25 minutes of exposure.
  No HTTP 5xx appeared in that window. `resolveArmyOrder` had 541 HTTP 400s among
  560 requests, matching failed-precondition operation counts. Logs do not reveal
  the exact condition, so these counts do not prove one exclusive cause.
- Only four successful scout launch/arrival timings were present. They cannot
  establish production p95 improvements. Non-scout route planning remains a
  separate performance concern (14 successful sends; route p95 about 13.86 s).
- The broad static inventory ran 121 checks: 111 initially passed and ten exposed
  stale assertions or missing VM dependencies. Each failure was reviewed against
  current implementation and confirmed design before correcting its fixture.

## Release acceptance and remaining work

`validation-plan.json` selects retry/session, report, recovery, map/browser, combat,
asset and onboarding dependencies for this diff. Require all three GitHub checks
on the final head; also run the manual full release gate for this broad audit.
Release evidence and exact-head CI results belong in the PR/release record.

Run the post-change map matrix, browser compatibility and bounded lifecycle soak
with isolated local backends; record results without upgrading synthetic checks to
physical-device claims. A short soak cannot establish multi-hour memory stability.
Verify the deployed frontend build on all web hosts and compatibility with the
unchanged backend contract. These fixes require no backend runtime deployment.

Remaining priorities are dense-map CPU work on slow phones, startup asset/request
cost, and slow non-scout terrain routing. Physical Android/iOS, installed-PWA
suspension, authenticated real-network recovery and longer production sampling
still need verification. There is no claim that all performance budgets now pass.
