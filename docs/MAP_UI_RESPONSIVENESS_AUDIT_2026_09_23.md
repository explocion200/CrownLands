# Map responsiveness and service audit — September 23, 2026

Base: `23c0c6b9418842a73db4f7ffa48b43162926f310`. The read-only production check confirmed the September Core realm: `realm-2026-09`, `main-realm-2026-09`, `shard_0001`. No balance, travel, protection, ownership, reward, translation or retention rule changes.

## Confirmed causes and corrections

- **Selected Clan Tower camera work:** every camera update measured ten Tower/building/label rectangles after writing the map transform. Measure clearance once in world coordinates; pan needs no action style writes and zoom scales the cached offset. A rebuilt selection renews measurement after viewport, ownership or building updates. The approved 56px actions, 4px gaps and 8px clearance remain unchanged.
- **Building refresh churn:** every city redraw removed all Tower buildings and ground art. Reconcile by Tower/building identity, replace changed artwork/labels only, and remove structures leaving visibility or no longer present. Unchanged images, button focus and delegated actions survive refreshes.
- **Incoming march scans:** even targets loaded on the active map caused the entire owned-city roster to be normalized. Use the existing preferred active-map target first. Off-map roster lookups, private target fallback and ownership checks remain intact.
- **Scheduled cleanup memory failure:** production logged a memory-limit failure on `cleanupExpiredBulkOrderRequests-00082-jox` at 03:05 UTC. Cleanup fetched complete stored order responses alongside upgrade and notification receipts. Project only the expiry field needed for bulk telemetry and only references for other deletions. Give the single-instance receipt cleanup job 512MiB and concurrency one. Page limits, runtime budget, expiry predicates and deletion batch splitting are unchanged. The shared helper also affects chat-send receipt cleanup: deploy both `cleanupExpiredBulkOrderRequests` and `cleanupExpiredChat`.

## Controlled measurements

Fresh Chromium and Core loopback fixtures; no production player data or gameplay requests. Busy-map comparison: 100 cities, 50 marches, 844×390 mobile emulation, 4× CPU slowdown, three-second warm-up and ten-second CPU-profile samples. Results vary with host load and do not establish physical-phone or production frame rates.

| Measurement | Before | After |
| --- | ---: | ---: |
| Busy-map average FPS | 33.1 | 39.4 |
| Busy-map p95 frame duration | 90.3 ms | 76.5 ms |
| Busy-map maximum frame duration | 333.3 ms | 159.7 ms |
| Total long-task time in the sample | 6,845 ms | 5,535 ms |
| Tower geometry reads across 120 pans + 120 zoom updates | 2,400 | 0 |
| 30 Tower refreshes: removed building buttons | 120 | 0 |
| 30 Tower refreshes: synchronous duration at 4× CPU | 832.7 ms | 385.4 ms |

Camera bursts are synchronous stress diagnostics, not per-frame latency. Full-world style/layout work remains. The short 1.6-second benchmark immediately after startup produced unstable low idle FPS both before and after; it is not speedup evidence. Pan, zoom, five City Info cycles and region switch/return completed in both runs. Crowded-map long tasks and cold-load stalls are not claimed eliminated.

The new browser regression checks desktop and two landscape sizes, repeat geometry reads, pan style writes, action size/spacing/clearance, stable image/button identity and focus, level changes, construction and ownership cleanup. Existing Tower tests cover real mouse/touch actions, permissions and construction stages. Incoming-target tests cover 100 local targets without roster scans, fresh off-map state, captures and missing camps. The Firestore emulator regression observes actual projected query results for large expired receipts, preserves fresh/nonexpiring records and validates age telemetry and replay.

## Production health and verification limits

The two-hour log sample at 03:52 UTC returned ten error entries without truncation: the cleanup memory failure and its HTTP 500, seven translation HTTP 503s, and one Daily Mission worker HTTP 500. Translation and mission services were ACTIVE; this sample did not contain application exceptions explaining their failed requests. Do not attribute them to the renderer or claim this release fixes them.

The latest 500 operation records were truncated, not a two-hour census. Route previews had sampled p95 543ms and army launches p95 1,021ms; isolated army resolution and mission reroll samples took 12.5 and 13.1 seconds. Handler duration excludes transport/rendering and does not identify the cause. No speculative retry, timeout or scaling change was made to these services.

Raw local diagnostics: `release-artifacts/map-ui-responsiveness/`. Merge, web publication, affected Function revisions and local-main synchronization require independent verification, recorded in the final release handoff. Deployment alone does not prove the next scheduled cleanup completed or eliminate intermittent upstream failures.
