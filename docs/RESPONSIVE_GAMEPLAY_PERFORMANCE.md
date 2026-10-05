# Responsive gameplay performance review

## Gameplay health follow-up (October 4, 2026)

`codex/gameplay-smoothness` starts at `7a440f33e350ed6798e2d04c0c386fb198e183b6` (PR #451). This update is authorized for implementation and PR review only. It has not been merged or deployed. The read-only current-realm check confirmed `main-realm-2026-10`, `realm-2026-10`, `shard_0001`, with the existing `core-expansion-v1` release contract.

The health audit found long scout transaction tails and repeated style recalculation on crowded maps. Automatic scouts now omit Tower/garrison reads when authoritative clan membership cannot qualify. Launches defer unrelated optional production checkpoints; city departures checkpoint their deducted, projected balance atomically. City scout settlement checkpoints its source/target even below the routine interval, retaining mandatory main-city repairs and all projected kingdom production, reports, protections and receipts. Routine economy collection still checkpoints the kingdom. Shared profile reads/writes remain; production latency improvement must be measured after an authorized deployment.

March motion now updates a lightweight position shell. The existing token retains labels, hit areas, accessibility, selection and endpoint controls. Crowded maps scan the roster/labels every 400 ms instead of 140 ms; exact route-clock motion continues each display frame, and forced renders remain immediate. Covered-map route/city drawing pauses while settlement and visible dialog updates continue. Unchanged camp labels/progress avoid repeated writes. Token construction lives in the already-loaded Marches presentation module, retaining existing entrypoint budgets.

Eight optional screen stylesheets (310,970 source bytes) load when their existing script group opens: four Gear screens, Daily Login, Quests, Achievements and Battle Report details. Startup avoids those eight requests. This is source payload, not compressed production transfer savings. Shared loading, retry and stale-view ownership remain in place. The log parser now retains the already-emitted economy-preparation phase and route-evaluation/pruning counts without private payloads.

Local dense-march comparison used 120 orders, 80 visible tokens, identical mocked server authority, the base/current rendering functions, and a 144 Hz Windows Chrome host. Both retired-skin preference values exercise today's default renderer. Four-second samples are diagnostic, not device guarantees:

| Emulated profile | Base average FPS | Updated average FPS | Base / updated p95 frame time |
| --- | --- | --- | --- |
| Desktop, normal CPU | 136–137 | 138–139 | 7.1 / 7.1 ms |
| Landscape, normal CPU, DPR 2 | 134–137 | 137 | 7.1–7.2 / 7.1 ms |
| Desktop, 4× CPU slowdown | 14–19 | 45–55 | 139–160 / 35–49 ms |
| Landscape, 4× CPU slowdown, DPR 2 | 10–11 | 41–48 | 139–146 / 49–63 ms |

Dense throttled style time fell about 80%. Spikes remain above a 33 ms frame budget, so this does not establish a consistent 30 FPS floor on physical phones. The A/B rendering test uses current screen styles in both versions; it isolates rendering changes and is not a startup A/B test. Local receipts and screenshots are under ignored `release-artifacts/march-frame-performance/`; the original audit and diagnostic traces are under `release-artifacts/health-check-2026-10-04/`.

Regression coverage checks subpixel route accuracy, pending-to-confirmed movement, culling cleanup, selection/clicks, covered-map resume, optional stylesheet failure/retry, desktop/landscape screen layout, and asset budgets. Selected emulators cover scouting/Veil/replay and production accounting, Tower origins, world travel and concurrent economy operations. `validation-plan.json` records the exact selected gates; PR checks establish their final outcome. Physical-phone verification and live scout/economy p95 measurements remain release follow-up work.

## Scope

`codex/responsive-gameplay-performance` starts from main `61bc30a4d846f1779cfb81299e4887ccb8db5245` (PR #254). The user authorized all ten proposed performance areas, internal review, normal PR merge, and production deployment after checks. The current `core-expansion-v1` release contract is unchanged. This update changes client presentation and scheduling; it does not alter backend gameplay, world topology, costs, cooldowns, routes, permissions, or intended travel time.

## Findings and implementation

| Area | Confirmed finding and response |
| --- | --- |
| Touch and zoom | Pinch calculation scheduled a second animation frame for the camera. It now paints in the coalesced pinch frame. After a pinch, the remaining finger previously had no pan state; it now continues dragging from the current camera position. Tap tolerances, hit areas, pointer cancellation, and click suppression remain intact. |
| Action feedback | Direct scouting reserved its target internally but did not show pending feedback during the callable. City, Stronghold, and Camp scout controls now show Sending, remain disabled while pending, and recover on completion/failure. A presentation exception cannot strand this lock. Dialog/profile controls also acknowledge presses without moving their hit areas. Existing attack pending marches, batch scout feedback, atomic upgrade projection, and reward-claim feedback remain in use. |
| Map switching | Art and lazy region definitions can load together. Once verified city data is connected, presence delivery runs through its existing guarded background path without blocking map readiness. Loading text distinguishes connection and city-data stages. Existing previous-map recovery and bounded neighbor preloading remain intact. |
| Initial loading | Saved game/global-stat reads previously waited for skill synchronization. Independent reads now start together; the authoritative profile still waits for skill migration. The signed-out shell no longer fetches an unused default map before the player's map is known. Four unreachable functions belonging to the replaced command panel were removed after a repository-wide reference audit; the active troop dialog is unchanged. Existing asset-size budgets were retained. |
| Chat | Every incoming update recreated the displayed message rows and a hidden quick preview. The controller now reuses unchanged rows, changes only affected rows, shares its time formatter, preserves reading anchors/focus, and skips hidden or unchanged preview work. Native close events arriving after reopening no longer change the reopened mode. |
| Menus | The Shop rebuilt its item carousel every second during the ad cooldown, replacing focused controls. Countdown ticks now patch only availability text. Existing menu shells, independent report delivery, City List row reconciliation, inventory pagination, and immediate attack-panel hydration remain intact. |
| Slower devices | Automatic mode previously depended only on reduced-motion preference and was then converted into an explicit mode by the game UI. It now stays automatic when the player has no saved choice, reduces decorative effects after two sustained slow sampling windows, and recovers after five healthy windows. Hidden/startup gaps do not trigger degradation. Explicit settings still win. |
| Loading/retry feedback | Existing bounded retries and actionable failures are retained. Map-stage text and pending scout controls expose actual progress without fabricated percentages or premature success. |
| Foreground return | Fresh economy presentation previously waited for the entire refresh group, including presence. It now paints when authoritative economy is ready; independent refreshes still complete and report their own results. The final redundant full-map repaint is removed. Account/world/region checks prevent stale presentation. |
| Server confirmation | The previous release's two-worker scout settlement queue and receipt-based retry protection remain unchanged. Added bounded, local request-duration diagnostics (50 records, operation/duration/success only) to separate server-response time from UI work. Production logs show occasional slow route previews, but the available aggregate timings do not identify their cause. No new production server-latency improvement is claimed, and no speculative backend capacity, balance, or scheduler changes were made. |

## Controlled measurements

Measurements use the repository's loopback browser fixture and current game code, with no production player data or Firebase gameplay requests. Baseline uses main `61bc30a`; after uses this branch. Results vary by machine load. The synthetic burst reports cumulative synchronous work, not the latency of one real message. The deliberately delayed operations isolate dependency ordering; they are not estimates of normal network latency.

| Scenario, desktop / 844×390 landscape | Before | After, representative runs |
| --- | ---: | ---: |
| 100 individual chat updates, starting with 80 messages | 5,388 / 5,545 ms | 158 / 156 ms |
| Chat rows inserted / removed during that burst | 13,050 / 12,950 | 100 / 0 |
| 30 Shop cooldown ticks | 200 / 155 ms | 0.4 / 0.1 ms |
| Independent skill/saved-state phase, each given a 300 ms delay | 619 / 607 ms | 305 / 303 ms |
| Map switch with an injected 2,000 ms presence delay | about 2,930–3,150 ms | about 1,185–1,225 ms in settled runs; one disk-busy first switch was 1,977 ms |
| Pinch camera update | second scheduled frame | first scheduled frame |
| Existing chat rows and Shop focus | replaced | preserved |

These observations do not establish physical-device frame rates or authenticated production latency. The existing multi-scout improvement from PR #254 remains the measured server-settlement baseline; intended scouting travel remains separate and unchanged.

A read-only production log query at 18:28 UTC succeeded after an earlier HTTP 429 quota rejection. It sampled the latest 1,000 matching operation entries within the preceding 24 hours and was truncated; it is not a census of that entire interval. Successful route previews (232 samples) had p50 173 ms, p95 5,069 ms, and maximum 15,840 ms; army orders (77 samples) had p50 803 ms and p95 1,922 ms. Army resolution (106 successful samples) had p50 849 ms and p95 3,698 ms, with two separate failures. These are handler execution times, excluding transport and display delay. The preview already reads its independent documents together within an authoritative transaction. The sampled tail does not distinguish route computation, data access, contention, or infrastructure delay, and no production mutation was performed to investigate it.

## Regression coverage and review

- `tools/validate-responsive-browser.js`: desktop, landscape, and a 4× CPU landscape diagnostic; startup read ordering, first-frame pinch, remaining-finger drag, immediate scout pending state and presentation failure cleanup, stable Shop focus, delayed presence/map switching without duplicate listeners, 100 independent chat updates, edit/delete/reopen behavior, hidden previews, and screenshots. `--baseline-root=<checkout>` runs the same measurements against an unmodified checkout.
- `tools/validate-responsive-runtime.js`: bounded diagnostics, preservation of results/errors and authority payloads, no payload/identity/result retention, immutable diagnostic copies, and unchanged authoritative clock sampling.
- Extended animation checks: sustained slowdown, recovery hysteresis, explicit Full preference, system reduced motion, and background-gap rejection.
- Extended foreground checks: a stalled presence request cannot delay fresh economy painting or cause a duplicate full-map repaint. Existing tests cover heartbeat timeouts, retries, welcome-back ordering, and realtime recovery.
- Existing chat retention, report delivery, route parity, map input, login, asset budget, desktop/landscape smoke, and multiplayer emulator gates protect integration with the previous release.

Internal review checked the complete branch diff for authority/balance changes, unrelated removals, stale callbacks, locks, UI focus, expiry/access behavior, cancellation, adaptive-mode oscillation, and startup dependency ordering. Review found and corrected the scouting presentation-exception lock risk and the queued chat-close race. Removed command-panel functions have no remaining runtime, HTML, or validator references. No asset or dependency versions were upgraded and no existing performance budget was raised.

## Mobile interruption audit (2026-09-08)

An interrupted map gesture could survive backgrounding with its tracked pointers,
pinch, and dragging state intact. Pointer capture also sends cancellation to the
map frame rather than the city layer, bypassing that layer's city/camp tap cleanup.
Island switching previously cleared pointers but retained pending taps and pinch
animation work. All three interruptions now cancel the complete gesture, release
captures safely, suppress the trailing click, and clear deferred gesture callbacks
and camera locks. A new touch starts normally; lifting one finger during an
uninterrupted pinch still continues as a drag.

Controlled regression coverage now includes native Chromium touch input interrupted
by a verified browser freeze and a fresh drag after resume. The browser harness
disables focus emulation while freezing and asserts that the actual freeze event
was delivered; focus emulation otherwise prevents this lifecycle transition.
Cancellation and island-switch tests also cover pending city, camp, and army taps,
including capture that the browser has already released.

The browser matrix covers 1440×900, 844×390, and 568×320, plus a 4× CPU diagnostic
at 844×390. Attack, transfer, rally creation, and rally contribution dialogs are
checked for travel details and reachable action buttons. Existing checks exercise
scout pending feedback, map-stable reports, failed-report reconnect retries, route
previews, Shop focus, and Chat history/reopening. Rally form checks use local
fixtures; server rally lifecycle and settlement remain covered by the required
multiplayer emulator gates. These checks do not establish physical iOS/Android
behavior or authenticated production latency. This audit changes client gesture
handling and validation only; release status is recorded in the final handoff.

## Troop rendering review (2026-10-02)

Crowded-map traces identified repeated inline transform updates as the main source
of style work. March display coordinates now round to a quarter device pixel and
reuse the previous transform until that displayed position changes. Exact route
coordinates, departure/arrival times, recall progress and the 150 ms acceptance
blend remain unchanged. Label refreshes no longer overwrite motion transforms;
map bounds are resolved once per movement pass. Passive troop rendering pauses
behind the profile or a dialog and while the document is hidden, then catches up
to the current clock. Server reconciliation continues independently.

The controlled comparison against `a1b75d4` used 120 synthetic marches, with 80
rendered and 40 culled, at desktop and landscape-mobile sizes. At normal CPU speed,
main-thread task time per second fell 56–66%, style time fell 86–92%, and p95 frame
time after the change was 7.1 ms. The host runs near 144 Hz. Four-times CPU
throttling still produced 146–153 ms p95 frame times despite improvement; this
overloaded case remains a performance limit. These are browser measurements,
not physical phone or production results.

`tools/validate-march-frame-performance-browser.js` checks display error, redundant
style writes, speed/recall/region changes and covered-map catch-up. Its optional
`--baseline a1b75d4` comparison uses identical online-authority render paths; the
underlying fixture otherwise defaults to legacy local economy. The saved inputs,
limitations and measurements are in
`docs/visual-qa/halloween-troops/performance-review.json`. Physical mobile testing
of dense battles remains advisable before claiming smooth performance there.

## Release procedure and limits

The branch must pass the repository's complete `prepare-pr` flow, production build, and required GitHub checks (`Static validation`, `Multiplayer emulator validation`, `Validate`) against current main. Normal merge is followed by the established Netlify Git deployment and safe public desktop/landscape smoke checks at `https://playcrownlands.com/play/`, including the merged commit in release metadata and loaded scripts. This release requires no Functions, rules, indexes, cleanup migration, or production data changes. The backend contract remains compatible with the deployed PR #254 backend.

The final PR and release handoff record actual gate, merge, deployment, and live-smoke outcomes. Physical mobile hardware and authenticated production mutation timings require a controlled QA session; emulator/browser results must not be presented as that evidence.

## City-only cosmetics revision (October 2, 2026)

The city-only catalog retires troop skins, city flag frames, paid flag icons and bundles. Production entries and service-worker installs no longer load the troop renderer or its atlas. Historical art sources remain outside the production artifact. Stale local/public equipment cannot recreate troop or frame decorations.

City bats animate around at most four visible cities on desktop or three on landscape mobile, plus one selected preview. Motion stops behind overlays, offscreen, during camera movement, in crowded/distant views and under reduced/off settings. The Halloween castle shadow is applied to its still image, so bat movement no longer repaints the entire filtered castle group. Existing march frame pacing and covered-map safeguards remain in place.

Validation covers city purchase/Apply/Default, preserved historical entitlements, retired purchase/Apply rejection, default march information and privacy, desktop/mobile layout, city animation budgets and production exclusion of retired assets. Browser CPU throttling is a useful stress check; physical mobile frame rates require device verification before release.

This catalog revision requires coordinated client and Functions deployment after authorization. The earlier rendering-only release procedure does not cover the new server catalog restrictions. No bulk account migration or refund is part of this change.
