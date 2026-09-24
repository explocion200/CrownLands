# Scouting responsiveness

Status: implemented on `codex/scouting-responsiveness`; not merged or deployed.

## Behavior and boundaries

Scout and Scout Nearby show pending feedback without rebuilding the map. Accepted City/Tower scouts display their authoritative movement immediately; Tower state refresh runs separately and skips the shop. The response updates the personal garrison count. Nearby adopts its movements without redrawing paths/armies for each member of the batch.

Core planners reuse exact canonical terrain legs in an instance-local LRU, bounded by 256 entries and 32,768 points per planner. The existing eight-planner bound remains. Returned point arrays are independent copies. Cache keys include region and ordered endpoint coordinates/IDs; a new expansion planner starts empty. The canonical engine already has a lower-level cache; this additional cache avoids rebuilding route jobs and their terrain context for every candidate/retry.

Arrival handling retains two workers, rejects duplicate work across entry points, and applies 1/2/4/8-second transient backoff with 20% jitter. Early arrivals retain the existing bounded clock-skew retry. Authorization/invalid-request failures wait for a verified reconnect; session changes retire old work. Completed reports merge immediately and update affected controls and open report views together on the next frame, preserving focus/scroll. Fallback report reads share one request per session. Scout-triggered economy refreshes debounce for 250 ms, capped at one second, and skip revisions already covered by an authoritative response/profile.

Pending arrived scouts remain in the activity ledger with **Receiving report…**, while their map marker disappears at the existing arrival boundary. Reports are never opened automatically or synthesized from timers. The normal cloud-save queue remains active; each scout no longer forces an immediate profile write.

No callable payload/response, Firestore schema/rules, travel speed, costs, one-troop rule, source-selection tie-break, Veil/Tower permissions, report read/expiry rules, King Power accounting, instance configuration or one-minute offline scheduler changes. No archived-world implementation was changed.

## Validation and measurements

The reviewed `validation-plan.json` selects the new tests, affected movement/report/recovery dependencies and eight emulator suites. Required GitHub checks are Static validation, Multiplayer emulator validation and Validate.

Reproduce controlled evidence with Node 22:

```text
node tools/validate-scout-route-cache.js
node tools/validate-scout-responsiveness.js
node tools/validate-scout-responsiveness-browser.js
```

Artifacts are written under ignored `release-artifacts/scouting-responsiveness/`. Route benchmarks compare the branch merge base with current code using independent canonical-engine caches, identical 51-map fixtures, City/Tower same-map/cross-map routes, closest-origin retries and a 24-target Nearby batch. First-use samples share one Node process and are not Cloud Functions cold-start measurements.

Browser fixtures block production services, use an 80 ms simulated acknowledgment, and compare the actual baseline/current client functions. Desktop is 1440×900; mobile fixtures are 844×390 and 568×320 at 4× CPU throttle. They cover pending feedback, report receipt/presentation, arrival resolution, a failed background Tower refresh and a 24-report burst. Functional assertions are enforced everywhere. The 100/200 ms UI timing targets are enforced locally; shared CI runners record timings without treating their CPU contention as a product regression. These fixtures do not replace physical-device or post-deployment verification.

### Controlled browser results (September 24, 2026)

Measured p95 milliseconds, baseline → updated. Pending/launch/presentation have 10 samples per variant; arrival has five. Launch and arrival include the same simulated 80 ms server acknowledgment. Small samples describe this fixture, not an SLA.

| Fixture | Tap to pending | Launch completion | Report presentation | Arrival completion |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 482 → 36 | 482 → 88 | 84 → 13 | 139 → 90 |
| 844×390, 4× CPU | 217 → 55 | 574 → 157 | 263 → 93 | 467 → 117 |
| 568×320, 4× CPU | 218 → 60 | 457 → 133 | 392 → 124 | 418 → 115 |

The initial desktop sample includes startup contention; compare the recorded p50 values as well. A separate immediate-after-burst check took roughly 1.6 seconds on throttled mobile and confirmed correct receiving/report behavior; that stress sample is not hidden in the small steady-state arrival distribution. All 24 burst reports merged, map nodes remained attached, and report scroll/focus were preserved at every size. Route retry validation reused 1,404 legs with zero new terrain-leg calculations for the six-origin fixture; paths and closest-origin results matched exactly.

## Production verification after authorization

The read-only baseline verified the September 2026 shared realm and current deployed revisions. Existing logs combine army kinds, so their durations cannot be presented as scout-only baseline latency. No production scouting or data changes were performed.

Operational logs now include bounded scout stage/source/target/batch/candidate dimensions and cache counters, without identities, target IDs or intelligence. Existing transaction attempts and nested phase timings remain; route planning is inside transaction timing and must not be added to it. The read-only production diagnostic separates scout groups and outcomes from unclassified historical traffic.

After this PR receives separate merge/deploy authorization, deploy backend first and then the web clients, verify the named release channels and current realm, and compare scout-only request p50/p95, transaction attempts, errors and memory. Report sample counts and missing/insufficient evidence explicitly. Preserve current server capacity unless a later measured capacity decision is approved. Synchronize clean local main to origin/main and verify commit equality after merging.
