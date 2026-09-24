# PC and mobile audit findings — September 24, 2026

The audit found reproducible client defects and performance budget failures. It did not establish that every device or production operation is healthy. Nothing has been merged or deployed to production, and no player data has been repaired by this task.

Baseline game: `a01303edf61d350cdd3a9363d308edf2945acbdc`. Measurement harness: `d7e4182c1394a934591dfde7a723278b026015b4`. Runtime fixes are separate from [audit tooling PR #353](https://github.com/explocion200/CrownLands/pull/353).

## Fixes and their evidence

| Change | Reproduction and result | Scope |
|---|---|---|
| Defer nine optional screen styles | Installation cache: 4,639,033 → 4,332,416 normalized bytes; 306,617 bytes saved and 16,512 bytes below the unchanged 4,348,928-byte limit. Before the fix, optional CSS loaded before those screens opened; the candidate verifies zero initial requests for those nine sheets. | [PR #355](https://github.com/explocion200/CrownLands/pull/355), `codex/defer-optional-ui-assets`. At final commit `551af44`, all 19 selected local validators, ESLint, dependency audit, build and web/itch artifact checks passed. The new regressions are registered in the nightly/full gate. CSS loads on opening Bag, Shop, Clan/Treasury, Tower building screens and Help. Shared requests, 15-second timeout, explicit retry, account/view guards and visited-screen offline cache reuse are covered. Unvisited optional screens require a connection for their first stylesheet load. All artwork and gameplay rules remain unchanged. |
| Preserve a newly reopened Help dialog | An old queued native close event could remove the class/readiness state of a newly opened Help view. An actual browser regression reproduced it. | Cleanup now uses the existing synchronous modal-close lifecycle. Immediate close/reopen, delayed Help-to-Bag handoff and failed-load retry pass at 1440×900, 844×390 and 568×320. |
| Respond to sustained severe animation pressure | The old sampler reset whenever a foreground frame exceeded 250 ms. A regression with repeated 500 ms frames fails against baseline and passes against the fix. | [PR #354](https://github.com/explocion200/CrownLands/pull/354), `codex/sustained-animation-pressure`, commit `5ae539b`. Cap each frame's contribution instead of discarding it. One stall cannot trigger reduction; explicit Full/Reduced/Off, system reduced motion, inactive periods and healthy recovery remain covered. This is not a claim of a universal FPS gain. |
| Make audit failures trustworthy | Old reports mixed historical conclusions with new evidence, used the legacy 17-listener count for Core, and could omit failed profiles. Two static fixtures were stale after earlier application changes. | PR #353 requires all eight startup cases and 45 matrix profiles, retains unavailable/failed results and uses Core's existing 18-listener budget. Gear target-helper and extracted Treasury fixtures are corrected without weakening gameplay assertions. |

The deferred-screen browser fixtures now wait for real screen/image readiness before asserting controls. Fixed sleeps previously assumed eager loading. Existing purchase/donation/upgrade authority, duplicate submission, stale-session, navigation and visual assertions are retained.

PR readiness requires the latest head to be current with `main` and all three required GitHub checks to pass: Static validation, Multiplayer emulator validation and Validate. The linked PRs show the current status; successful targeted checks do not resolve the broader audit failures below. No server-authoritative code changed, so the per-PR emulator checks explain that no affected emulator suites are selected; the two explicit full 49-suite runs provide the separate mechanics audit evidence.

## Measured baseline

All 45 profiles completed: three repetitions of scenarios A–E on desktop, landscape mobile and landscape with 4× CPU throttling. All eight startup/recovery cases passed. Source inputs stayed unchanged. There were zero uncaught game errors, duplicate listeners or synthetic requests to production backends. The final result correctly **fails performance budgets**.

| Finding | Baseline evidence | What it means |
|---|---|---|
| Startup/request footprint | 196–209 browser requests against the current Core limit of 130; 58 stylesheet requests. Map requests 20–24 against 14. | Real budget failures. Deferred styles address part of this footprint; they do not remove all request overhead. |
| DOM footprint | A: 2,115 nodes vs 1,900; B: 3,182 vs 3,000; D: 2,316 vs 2,100; E: 3,416 vs 3,250. | Review unnecessary hidden UI/map markup before changing budgets. The selected fixes do not claim to resolve this. |
| Decoded images | 17,347,840–17,495,296 bytes estimated (16.54–16.69 MiB) vs 12 MiB. | An image-dimension estimate, not measured GPU allocation. Retain approved art; profile appropriate delivery sizes and off-screen residency separately. |
| Heavy rendering | C/desktop idle FPS: 4.3, 16.6, 34.2 across repetitions; two repetitions fail C capacity. B/desktop fails one repetition. 4× zoom medians range roughly 1.1–2.5 FPS across scenarios. | Significant variation and poor throttled zoom. C's 150 cities is capacity stress beyond current 40–70-city map layouts; E's 50 cities/100 marches also represents busy-map pressure. Headless CPU throttling is not physical-phone performance. |
| Forced style work | 4× zoom spends roughly 4.2–6.7 seconds in style recalculation during nominal five-second actions. A separate diagnostic points to camera updates and return-button geometry reads. | A profiling lead, not enough evidence for a broad camera rewrite. Preserve map targeting, zoom geometry and art while investigating read/write ordering and selector cost. |

Environment: Windows 10.0.26200 x64, Node 22.23.2, Chrome 153.0.8010.48, i7-9750H / 12 logical CPUs, 17.1 GB physical memory. The user's other applications remained running; this is not a dedicated benchmark host. One measurement browser ran at a time. Brief separate worktree build/install work occurred during baseline repetitions 1/2; repetition 3 had no concurrent audit browser/build workload. Retain all repetitions and report medians/ranges, not selected best runs.

## Matching candidate comparison

The candidate completed all 45 profiles and eight startup/recovery cases. The same executable harness digest was retained and inputs stayed unchanged. No profile failed execution; there were no uncaught errors, duplicate listeners or recorded synthetic production requests. Acceptance still **fails `matrixBudgets`**. The [complete comparison](COMPARISON.md) retains all 15 profile medians, idle ranges, footprint measurements and every repetition's failure counts.

Every candidate profile loaded 49 stylesheets, compared with 58 before. Median response bytes fell in all 15 profiles; DOM rose by one node from the added loader script and decoded-image estimates were unchanged. Requests, DOM, decoded-image and heavy-rendering budgets remain open. Frame rates moved in both directions. In particular C/desktop idle was 4.6, 4.7 and 5.0 FPS versus 4.3, 16.6 and 34.2 before. Do not infer that fewer stylesheets resolved crowded-map or throttled-zoom lag.

A six-run alternating C/desktop diagnostic did not reproduce a consistent regression: baseline idle 26.6 / 56.6 / 56.0 FPS; candidate 26.9 / 59.8 / 56.3. Both first runs moved Auto from Full to Reduced; the remaining runs stayed Full. Inputs were unchanged and no runtime error appeared. This probe kept the original sample durations/actions but filtered to one scenario and captured motion state immediately before/after idle. Repeated-scene and starting-condition differences mean it is diagnostic evidence, not a replacement for the original failing matrix or proof of a speed improvement.

All 180 neighbor/return results across the 90 full-matrix profiles returned success. The union of external hosts was only `data:`, `fonts.googleapis.com` and `fonts.gstatic.com`, independently confirming that those matrix runs did not attempt Firebase/Cloud Run endpoints even before the stricter URL counter was added.

Candidate measurement ran without another audit browser/build/load job. Only small report/source reads and read-only production diagnostic requests ran alongside it. Windows power scheme was observed as Balanced before the candidate; baseline power state was not recorded, and no power setting was changed by this task. These limits preclude a controlled laboratory or statistical-significance claim.

## Long sessions, recovery and browsers

- Desktop and landscape mobile each completed 60 minutes, 50 requested map transitions, 100 city-dialog cycles, 20 foreground cycles and 10 reconnect/offline cycles. Both passed: no runtime errors, duplicate listeners, production backend requests or interval growth. Each settled at 18 listeners and two intervals. Last-half retained heap grew 283,360 bytes (desktop) and 282,352 bytes (mobile), below the unchanged 10 MiB minimum limit. DOM, pending RAF and timeout samples showed no continuing growth.
- Those two runs were concurrent **lifecycle/memory stress**, not reference FPS. They predate the final source-digest enhancement; game runtime stayed at baseline. Do not describe them as a frozen final-harness receipt.
- Heap samples cover retained JavaScript objects after forced garbage collection. They do not measure total browser, native image-decoder or GPU memory, and cannot prove those layers are leak-free.
- Baseline Chrome, Edge and WebKit passed four layouts each, including dialog interaction, switching, recovery and portrait/landscape roundtrip. Firefox failed to launch with `spawn UNKNOWN` before gameplay; Firefox coverage is **unverified**. Windows WebKit is not a physical iPhone test.
- The combined candidate also passed all four layouts in Chrome 153.0.8010.48, Edge 153.0.4234.48 and WebKit 26.6 (12 cases). Source inputs remained unchanged. Firefox again failed to launch before any gameplay case, so the overall compatibility command correctly returned a failing status for that missing coverage.
- The isolated candidate 4× run completed 30 minutes and all ten batches (50 requested map transitions, 100 dialog cycles, 20 foreground cycles and ten reconnect/offline cycles). All acceptance checks passed: no runtime errors, duplicate listeners, production calls or interval growth. Eleven samples show 18 listeners, two intervals, one timeout and one pending RAF. Last-half retained heap grew 542,024 bytes (0.52 MiB), below 10 MiB. DOM settled at 1,911 nodes by minute 18; earlier increments follow the visible march count, matching the baseline pattern. Measured source inputs remained unchanged.
- The candidate is a validation-only detached checkout of style commit `1758abe`, with exactly `animation-manager.js` from `5ae539b`. The intentionally dirty source and both commit identities are recorded in `release-artifacts/stability-audit-candidate/composition.json`. Harness input digest `385733ec2cb558dd754d4770d6240e8d39798a0f9cad131f5b4312065e46f789` matches the baseline; only report Markdown changed in the harness checkout. Subsequent style-PR test-script registration does not change the measured browser implementation.
- Development 4× probes timed out during lifecycle work and remain retained failures. The passing isolated candidate run changes both runtime and test contention, so it cannot alone attribute those earlier failures to either factor. The matching candidate matrix, focused desktop follow-up and available-engine compatibility cases completed.
- The original lifecycle helper incremented its transition count after a resolved call without asserting the destination. Those long-session receipts therefore prove 50 **requested** transitions per profile. The final harness adds success/destination assertions and explicit production-function URL blocking/counting; old receipts are not retroactively relabeled. Matrix reports separately retain the actual neighbor/return results.
- Final harness `379f4cd` passed all eight startup/recovery cases with unchanged inputs. The cold-desktop lifecycle probe verified five successful switches and return to the starting region, three foreground cycles and two reconnect cycles. It retained 18 listeners with no duplicates, no interval growth, no unexpected runtime errors and no synthetic production requests. A separate A/desktop quick probe verified neighbor/return success with the stricter destination assertions and network blocking. These short functional probes validate the new checks; they do not replace the repeated matrix or long-session measurements. Their outputs remain partial coverage, and quick-run FPS is not a new comparative baseline.
- A subsequent tooling-only change applies the tested token-refresh endpoint guard to compatibility and soak runners as well. Its regression rejects Firebase auth/data and both function generations while permitting loopback assets and fonts. An actual Chrome interception probe at `8f69152` blocked all six endpoint classes and forwarded no request. Recorded browser measurements retain their original harness identities.

## Server and mechanics

Both explicit full emulator runs passed all 49 suites:

- [Baseline run 36012723093](https://github.com/explocion200/CrownLands/actions/runs/36012723093). The first checkout timed out before testing; the rerun provides the successful emulator receipt.
- [Final run 36026718571](https://github.com/explocion200/CrownLands/actions/runs/36026718571), animation commit `5ae539b`: full emulator command passed at 16:51 UTC. Backend code is unchanged by both runtime fixes.

Both overall workflows failed at the existing Gear static fixture (`validate-gear-bonus-gameplay.js`, missing target helper in its sandbox), which is repaired in PR #353. Required targeted PR checks and a complete audit are distinct results.

Read-only observations at audit time: current realm `main-realm-2026-09`, generation `realm-2026-09`, shared realm `shard_0001`, topology `core-expansion-v1`; 120 ACTIVE Node22 functions. Public web build matched baseline; backend source label was `4ff04191079d2f98205240d588deb958a2b18a6e`. This task did not deploy those versions.

Cloud Monitoring request-count pagination completed for both one-day and seven-day windows ending September 24 at 16:00 UTC. Totals across all revisions were 74,626 and 591,357. Current revisions account for 9,697 requests in each window because they have less than a day's exposure; these are not seven days of current-release operation.

| Current-revision status | Count |
|---|---:|
| 200 | 7,740 |
| 204 | 1,918 |
| 401 | 33 |
| 500 | 2 |
| 503 | 4 |

The two 500s were in `applydailymissionevent-00078-zin` (826 requests); four 503s in `translatechatmessages-00006-dov` (76 requests). The earlier complete one-day ERROR-severity query contained five current-revision HTTP error records and no application exception payload for them. The windows differ, and the application details actually arrived at DEFAULT severity. A complete targeted follow-up found:

- Translation: all four failures have `crownlands_operation` outcome `error`, code `unavailable`; maximum logged duration 695 ms. These are controlled application availability responses, not evidence of a process crash. The existing code uses this response for a pending shared translation lease, unavailable usage state or provider failure. The logs do not distinguish which of those subcases occurred. All 42 successful requests also have matching operation records.
- Missions: both errors and both stacks match the source-defined scheduled-maintenance guard in `prepareEconomyCollection`. Retry is enabled. A masked, read-only lookup of those two event receipts found both processed in the current realm/generation; the longest event-to-processing delay was 25,423 ms. Only receipt/generation fields were read; no event IDs, account payloads or document names are exported. This proves these events were subsequently handled, not a replay of every account balance calculation.

The mission worker already has 512 MiB and concurrency eight. These observed errors do not justify another memory increase or bypassing the maintenance guard. The audit collector now includes known DEFAULT-severity application failures and supports a current-revision filter, while preserving record counts rather than mislabeling them as unique failed requests. The new log request path suppresses request/response body debug logging as well as raw artifact exports.

Request counts include all methods/triggers, including OPTIONS; they count requests reaching containers and exclude platform rejections before the container. They are not a POST-only gameplay error rate or proof of zero crashes. See [Cloud Run metric definitions](https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z) and the [time-series API](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.timeSeries/list).

Cloud Logging HTTP/timing queries were truncated by API errors. Preserve their partial status. In 10,000 partial timing records, current-revision samples include:

| Operation | Samples | Observed timing |
|---|---:|---|
| sendArmyOrder | 10 | p50 1,329 ms, maximum 21,836 ms; route planning maximum 20,121 ms; maximum two transaction attempts |
| previewArmyRoute | 51 | p50 511 ms, p95 2,758 ms, maximum 9,613 ms; route planning maximum 8,920 ms |
| getClanTowerShop | 69 | p50 1,377 ms, p95 3,163 ms; transaction p95 2,931 ms |
| collectEconomy | 138 | p50 881 ms, p95 2,096 ms |

These small incomplete samples cannot establish whole-game p95, a seven-day SLO, cold starts or a specific crash cause.

A later targeted follow-up completed pagination for seven current revisions in both requested windows, ending at 17:42:14 UTC. Each window contains the same 1,794 POST request records, 14 error records and 752 operation-timing records because these revisions were deployed around 12:26 UTC that day. This supplies about five hours of current-release exposure, **not seven days of operation**. It does not change the earlier broad query's partial status.

| Current revision operation | POST samples / status | HTTP p50 / p95 / maximum (ms) | Application evidence |
|---|---|---|---|
| sendArmyOrder | 35 / all 200 | 1,048 / 7,990 / 21,928 | Route planning p50 6, p95 7,125, maximum 20,121 ms; maximum two transaction attempts. |
| previewArmyRoute | 81 / all 200 | 515 / 2,317 / 9,621 | Route planning p50 27, p95 1,781, maximum 8,920 ms; maximum two attempts. |
| collectEconomy | 315 / all 200 | 1,100 / 2,304 / 6,905 | Transaction p95 2,067 ms; maximum two attempts. |
| getClanTowerShop | 228 / all 200 | 1,220 / 2,650 / 4,801 | Transaction p95 2,363 ms; maximum two attempts. |
| resolveArmyOrder | 42 / all 200 | 1,141 / 2,027 / 2,925 | Transaction p95 1,878 ms; maximum three attempts. |
| translateChatMessages | 51 / 47×200, 4×503 | 638 / 3,999 / 5,131 | Same four controlled unavailable responses. HTTP duration includes work outside the application timer; no cold-start cause inferred. |
| applyDailyMissionEvent | 1,042 / 1,039×200, 3×500 | 518 / 2,178 / 10,310 | Three maintenance-guard failures. Masked lookup found all three corresponding receipts processed; maximum delay remains 25,423 ms. |

Phase timers can overlap (route planning occurs inside a transaction); do not add their percentiles or treat them as a mutually exclusive timing breakdown. Completed pagination means all matching available logs were read, not that logging can prove the absence of every possible failure. A 35-request launch sample is still small.

The broader application-error follow-up through 17:47 UTC completed its one-day query (300 records across all revisions). Current revisions contributed 29 records: six mission records, eight translation records and 15 controlled `unauthenticated` operation outcomes. No current-revision memory-limit category appeared in this query. The seven-day query reached its explicit 20,000-record cap and is **partial**; it cannot support a seven-day all-clear. The metric collector separately completed both windows ending at 17:00 UTC: 72,580 / 591,668 total container requests, with 11,343 on current revisions in either window. These later windows must not be mixed with the 16:00 count table above.

Synthetic opposite-Core-corner route planning measured approximately 2,895 ms cold and 51 ms repeated, visiting 287 terrain legs, during concurrent diagnostic work. Existing bounded route and graph caches already operate; adding another cache or changing travel rules would be speculative.

## Remaining work and release boundaries

1. Both isolated reruns passed: City List completed four viewport/state/navigation checks and clean exit in 31.8 seconds; legacy server route parity covered 1,185 cities across 20 maps, 1,185 local routes, 1,185 cross-map routes and 380 directed map chains in 298.9 seconds. The latter exceeds the earlier 240-second execution watchdog and passed the bounded 15-minute rerun; it is a correctness check, not a game latency budget. The current-world implementation and archived data were unchanged. Keep both original execution failures as retained receipts. The stricter final audit checks also passed actual browser probes as described above.
2. Rendering follow-up: profile camera/style work under busy current-world maps, then make one bounded change with targeting/zoom regressions and repeated comparisons. Treat synthetic above-capacity C separately from common gameplay.
3. Server follow-up: profile the specific expensive route paths and distinguish translation lease/provider subcases before changing runtime limits, transactions or retry behavior. The three observed mission failures were maintenance deferrals with verified processed receipts; do not remove that guard or acknowledge an unprocessed event to suppress a 500. Preserve authoritative receipts and travel rules.
4. Static guardrails remain open: after installation bytes pass, the asset validator detects older HUD derivatives without current client references (Bag/Shop now use the approved ink artwork). Review obsolete manifest/build inventory separately; do not exempt unused files merely to pass. Baseline `game.js` is 1,892,323 normalized bytes against 1,881,088 allowed. No budget was raised or assertion removed to force green checks.
5. Physical Android/iOS, real app installation/update, OS suspension, Wi-Fi/cellular handoff, hardware orientation/fullscreen and authenticated production/itch gameplay remain **unverified**. Use the [device checklist](RUNBOOK.md#physical-device-handoff). Production gameplay requires a separately authorized QA account and actions.
6. Merge/deployment requires separate authorization. Verify release fingerprints, affected live smoke checks and fresh errors after deployment; do not infer live status from a merge or reset player storage/data for verification.

## Raw evidence index

Local paths are relative to `release-artifacts/stability-audit-baseline/` in the audit checkout. Raw artifacts are ignored by Git; the report contains only aggregate evidence.

| Artifact | Coverage |
|---|---|
| `final-matrix/audit.json`, `matrix/matrix-r1.json`–`r3.json`, `summary.json` | Final frozen baseline: 45 profiles and eight startup cases; execution complete, budgets fail. |
| `baseline-ci.log`, `baseline-ci-failures.log`, `final-ci-static.log`, `final-ci-emulators.log` | Explicit full CI evidence and known static failure. |
| `remaining-static.json` | 89 continuation validators: 87 pass, two fail on the same install-cache excess. |
| `browser-static.json` | 25 planned browser/static continuations: 23 pass; City List cleanup and legacy route-parity watchdog fail execution. |
| `isolated-reruns/results.json` and corresponding logs | Both isolated continuations passed, including process exit. City List: 31.8 seconds. Legacy server-route parity: 298.9 seconds, with the same assertions and unchanged world data. |
| `compatibility-final/compatibility.json` | Chrome/Edge/WebKit 12 layouts pass; Firefox unverified. |
| `soak-full/soak.json`, `desktop.json`, `mobile.json` | Successful concurrent 60/60-minute lifecycle/memory runs. |
| `soak-probe/`, `soak-probe-4x/`, `soak-final-4x/`, `soak-full-4x/` | Development, interrupted and timed-out probes; not substitutes for required final duration. |
| `production-final/production.json` | Realm/function metadata and aggregate log windows, with partial/unavailable flags. Old HTTP sample includes OPTIONS. |
| `operation-timings/production.json` | Allowlisted phase timing from incomplete 10,000-entry sample. |
| `platform-counts/counts.json` | Complete hourly aggregate query pagination for 1/7 days; method limitations above. |
| `platform-counts-17/counts.json`, `application-errors-followup/production.json` | Later complete metric windows, complete one-day application-error query and capped/partial seven-day application-error query. |
| `production-error-followup/summary.json`, `mission-maintenance.json`, `mission-receipts.json` | Complete queries of the two affected revisions, safe error classification and masked confirmation that both mission events were subsequently processed. |
| `current-operation-followup/production.json`, `mission-receipts.json` | Complete pagination for seven current revisions through 17:42 UTC: POST-only HTTP and phase timings, including the third maintenance deferral and all three processed receipts. Draft collector, identical query/aggregation behavior to its final promoted version. |
| `collector-validation/requests/counts.json`, `collector-validation/errors-quoted/production.json` | Final promoted CLI entry points: both count windows complete; scoped error query complete with 14 records. An earlier unquoted PowerShell revision argument was safely rejected; its metadata-only receipt remains in `collector-validation/errors/`. |
| `final-network-guard/receipt.json` | Actual Chrome interception probe: six backend/token endpoint classes blocked, zero requests forwarded. |
| `route-profile.json`, `zoom-profile/diagnostic.json` | Diagnostic profiling leads, not isolated acceptance claims. |

The tooling PR also corrects idle-sampling starvation caused by host-side sleeps: a calibration moved from near-zero to 60.9 FPS when the same sample awaited the clock inside the browser. That is a measurement correction, not a game speed improvement. The fixture server now reuses immutable scenarios instead of rebuilding world data for every asset request. Reports retain original failures and source identity rather than inheriting historical prose.

Candidate artifacts are under `release-artifacts/stability-audit-candidate/`: `final-matrix/` (45 profiles/eight startup cases), `soak-4x/` (30-minute run), `c-desktop-control/` (six alternating diagnostics and runner hash), `compatibility-final/` (12 passes/Firefox unverified), `final-harness-startup/` and `final-harness-map/` (final stricter assertion probes), and `composition.json` (the exact combined runtime).
