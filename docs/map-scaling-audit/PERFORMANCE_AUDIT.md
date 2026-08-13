# Crownlands map performance audit

Audit date: 2026-08-13

Audited revision: `6ce0d48` (`origin/main`)

## Conclusion

The present renderer is appropriate for the current 39–103-city regions and is likely still appropriate at a carefully controlled 100–150 cities per region. A Canvas/WebGL rewrite is not justified by the evidence. Current wins—one active map, keyed DOM reuse, viewport culling, cached route signatures, interaction throttling, and effect caps—address the expensive work correctly.

The more urgent costs are outside the renderer: synchronous all-world data at boot, service-worker precache headroom, decoded image retention, broad presence/activity feeds, and account-time seeding of every starter region. For denser regions, the missing capability is semantic LOD: low zoom currently removes effects but can still render every city, label, and control.

## Measurement method and limits

The audit combined source tracing, repository asset measurement, existing validation scripts, and direct checks of the deployed application at `https://crownland.netlify.app/play/`.

The browser session was not authenticated. It could therefore measure the signed-out shell, service-worker state, DOM composition, and built-in FPS panel, but not populated-region pan/zoom, marches, combat, or a large city set. The measurements below must not be treated as an authenticated gameplay stress test.

| Viewport | State | Built-in FPS sample | Warm/unthrottled navigation wall times | DOM after opening perf panel |
|---|---|---:|---|---:|
| 1,440 × 900 | Signed-out idle shell | 144 | 491, 347, 404 ms; median 404 ms | 576 elements |
| 844 × 390 | Signed-out idle shell | 140 | 402, 404, 75 ms; median 402 ms | 576 elements |

The 75 ms mobile result is a warm service-worker/cache outlier. The shell reported one loaded image, two neighbor links not yet preloaded, zero gameplay entities, and an active service worker. Its DOM included 47 buttons, 22 SVG elements, 20 images, and two teleporter nodes. The high idle FPS confirms there is no obvious shell-level frame bottleneck; it says little about a fully populated battle.

## Boot and transfer profile

| Item | Raw bytes | Estimated gzip | Estimated Brotli |
|---|---:|---:|---:|
| Present local script files | 2,336,573 | 435,404 | — |
| Local stylesheets | 586,956 | 105,524 | — |
| Present HTML + JS + CSS | 2,966,120 | 550,432 | 417,609 |
| Critical preloaded images | 294,052 | already compressed | already compressed |
| All-region `map-editor-data.js` alone | 350,214 | content-dependent | content-dependent |

The estimates compress each file independently and are not a captured network waterfall. They are useful for relative budgeting, not exact transfer accounting. Firebase modules, Google Fonts, runtime API responses, region imagery, and Firestore reads sit outside these local-source totals.

The browser executes a long synchronous script chain. The dominant local file is `game.js`, and `map-editor-data.js` adds every region and city even when a player uses one region. Moving layouts behind an asynchronously loaded region boundary will reduce parse/compile work as well as transfer size.

The service-worker install set is approximately 2.99 MiB against a 3 MiB project budget. Ten KiB of remaining headroom is not operationally safe: a small unreviewed asset or code growth can fail validation or encourage raising the budget without a caching design. The application shell and a minimal catalog belong in install precache; region layouts and maps belong in versioned runtime caches.

## Image and GPU-memory profile

All 15 active maps are 1,448 × 1,086 WebP files:

- Compressed full-map total: 8,927,742 bytes (8.51 MiB).
- Per-map compressed range: approximately 444–677 KiB.
- Compressed thumbnail total: 391,236 bytes (0.37 MiB).
- One decoded RGBA map: 6,290,112 bytes (about 6.0 MiB).
- Fifteen decoded full maps: 94,351,680 bytes (about 90 MiB).
- Fifteen decoded thumbnails: 7,938,000 bytes (about 7.57 MiB).
- All decoded full maps plus thumbnails: about 97.5 MiB.

The normal runtime does not intentionally retain all full-map `Image` objects. It shows one map and may warm two neighbors. That gives a practical decoded working set of roughly 6 MiB active or 18 MiB for active plus two neighbors, excluding browser duplication, compositing surfaces, and cache retention. Visiting many regions can still leave decoded assets in the browser cache toward the 90 MiB all-map total.

The current dimensions and one-map-at-a-time navigation do not require image tiling. Continue to publish one gameplay raster per region, plus a thumbnail and optional high-resolution derivative. Add an explicit runtime-cache quota/LRU policy before 60+ maps, and never preload arbitrary non-neighbors.

## DOM, culling, and LOD

The renderer's core approach is efficient:

- A transform moves a contained world layer rather than repositioning every entity.
- City/camp and army nodes are keyed and reused.
- Offscreen nodes are removed with 420 px and 240 px margins respectively.
- Route SVG is rebuilt only when the route signature changes.
- Camera input is frame-coalesced.
- City/path/map updates pause during active pan/zoom and settle afterward.

The risk appears when the viewport encompasses the whole region. The culling margins are specified in screen pixels and, at low zoom or on a small display, can include nearly all entities. A future 150-city region can therefore produce roughly 150 city/camp nodes plus nested labels and controls even when the details are unreadable.

Crowded and low-zoom modes currently disable shadows, filters, and some infinite effects. They should become semantic LOD tiers:

| Tier | Suggested visibility |
|---|---|
| High zoom | Full city markers, labels, actions, routes, effects |
| Medium zoom | Markers plus priority labels; simplified routes and effects |
| Low zoom | Clusters, owned/threat/objective markers, no ordinary labels or controls |

Retain the DOM renderer while targeting no more than about 200 simultaneous city/camp nodes and 100 army tokens. Consider Canvas only for route/particle layers or if measurements show more than 300 simultaneously visible entities, repeated long-frame failures, or march density that cannot be controlled through clustering.

## Main loop, timers, and animation

The continuous `requestAnimationFrame` loop itself is not the issue; the work inside it is cadence-limited. Simulation runs at 10 Hz, armies around 7.1 Hz, HUD at 4 Hz, city text around 1.7 Hz, status at 1 Hz, and general map updates every 1.6 seconds. Existing validation reports 300 simulation passes across a representative interval versus 1,800 naïve per-frame scans—an 83% reduction.

Army rendering also reuses a computed snapshot. The project's synthetic validator measured a representative improvement from 166.1 ms to 44.4 ms. That benchmark is environment-specific and should be treated as regression evidence, not end-user latency.

Animation safeguards are mature: simultaneous effects and particles are capped, duplicate events are suppressed, cleanup is watched, page hide clears effects, and full/reduced/off modes exist. The main stylesheets still contain 73 keyframe blocks, 91 animation declarations, and 30 declarations containing `infinite`. Many are inexpensive transforms/opacity effects, but each perpetual effect should have an owner, visibility guard, and reduced/off behavior. Avoid permanent `will-change`; the current gesture-scoped use is correct.

Distributed timers are more of an energy/network concern than a frame-time concern. Presence, update checks, heartbeats, leaderboards, economy, missions, clan views, rewards, and modal countdowns can wake independently. Consolidate minute-level background work behind a visibility-aware scheduler and pause display-only countdowns when their UI is closed.

### Static timer/animation inventory

A repository scan of first-party runtime/function JavaScript and CSS (excluding dependencies) found these lexical call sites:

| Mechanism | Call sites | Interpretation |
|---|---:|---|
| `requestAnimationFrame(...)` | 31, all in `game.js` | One persistent main frame loop plus many one-shot/coalescing UI/camera schedules; not 31 independent clocks |
| `setInterval(...)` | 6, all in `game.js` | Server heartbeat; clan-join countdown; clan gift/name countdown; relinquish countdown; daily mission countdown; rewarded-ad shop countdown |
| `setTimeout(...)` | 79 across 10 files | Mostly one-shot animation cleanup, debounce, timeout, retry, UTC-boundary, camera-settle, toast, and async yielding; a smaller subset reschedules |
| Web Animations `.animate(...)` | 0 | Not used |
| CSS `@keyframes` | 75 across three stylesheets | 73 are in the two principal stylesheets; 30 declarations there contain `infinite` |

Recurring timeout families include presence query refresh, Firebase stream retry, active-session retry, online-save/foreground recovery, and daily-login/daily-mission/seasonal UTC boundary rescheduling. Animation-manager timeouts are bounded record cleanup/reveal timers rather than global loops. The six intervals are created/stopped by feature lifecycle functions; the main frame loop continues while the app is active, while visibility/page-hide handlers reduce or clear several animation/recovery paths. This is a source audit, not proof that all call sites are simultaneously active.

## March and battle scaling

March tokens update at a bounded cadence and are culled. Route paths use signatures and performance-mode CSS removes their infinite flow animation. Those choices make tens of visible marches plausible.

Movement is not streamed as continuous coordinates from Firebase. The server stores a canonical path/path-segment set, total/path length, `launchedAtMs`, and `arrivesAtMs`. At each ~140 ms army render, the client computes progress as `(now - launched)/(arrival - launched)`, clamps it to 0–1, maps it by cumulative segment length, and interpolates along the polyline. Recall reverses from `returnStartProgress`; Swift March interpolates the remaining fraction from `swiftMarchProgressAtUse` to the new arrival. Firebase snapshots change mission state/timestamps/path, not per-frame position.

Lifecycle: route preview → authoritative `sendArmyOrder` transaction → canonical army plus region/player projections → region/player listeners adopt the order → local timestamp/path interpolation → client resolution request at/after arrival → idempotent server combat/transfer/capture/reinforcement/camp resolution → canonical/projection/report updates. A scheduled one-minute resolver is the offline/backstop path.

The next limits are:

- SVG path count and label/control detail when many armies converge.
- Projection writes for every region crossed by a long route.
- Canonical army resolution work when many arrivals fall into the same scheduler minute.
- Report/activity fan-out after large battles.

Recommended stress cases are 25, 50, and 100 visible armies, including overlapping routes, arrival bursts, camera movement, and background/foreground recovery. Record p50/p95 frame duration, long tasks, DOM/SVG counts, Firestore reads/writes, and resolver lag. The scheduler should have an explicit SLO such as 99% of due armies resolved within two minutes even if the client is offline.

## Network and realtime costs

The active-region scope prevents world size from directly multiplying gameplay listeners. However, a typical session still reaches approximately 17 streams with player/session state and the mid-20s with clan/social surfaces. The most suspicious recurring costs are:

- Presence: up to 200 recent documents, rebound about every 60 seconds.
- Realm activity: up to 250 global records rather than a region/topic feed.
- Reports: up to 120 records.
- Active-region cities: currently 39–103, potentially 150+ initial documents.
- Dirty owned-city synchronization at a 20-second cadence.

The first three should be paged or interest-scoped rather than kept as broad live windows. Presence should normally expose a region-scoped visible set plus aggregate counts, not re-read the realm's recent 200 every minute.

### Activity by interaction

Authenticated DevTools traffic could not be captured without using a player account, so this table distinguishes code-proven behavior from unmeasured traffic. Camera movement itself is local and should not issue Firestore queries.

| Action | Expected/code-proven traffic | Audit observation |
|---|---|---|
| Open signed-out game | Shell/assets, Firebase modules/auth setup, service-worker requests | Live warm shell navigation measured; one image reported loaded by the built-in panel |
| Enter region | Map image/decode, ensure/seed compatibility call, city/camp/army/presence snapshots, player streams | Not exercised while authenticated |
| Move/zoom camera | Local transforms, culling, DOM/SVG updates | No designed network dependency |
| Switch region | Fetch/decode map if cold, unsubscribe old region, subscribe new region, optionally warm two neighbors | Source-verified; authenticated request counts not captured |
| Select city | Local state/UI; point reads/callables only for features that require refreshed authority | Not exercised while authenticated |
| Launch march | Route preview callable, order callable, then canonical/projection listener updates | Source-verified; no live battle capture |
| View reports | Existing last-120 live stream and/or server report backfill after some scout resolutions | Not exercised while authenticated |

The service worker prevents duplicate transfer for an exact hashed image URL after first fetch, but a newly versioned URL is intentionally a new object. The periodic update check, presence/heartbeat publishing, leaderboard work, and broad live feeds are higher-priority network targets than camera rendering.

## Bottleneck ranking

| Priority | Bottleneck | Current impact | 60+ region / 150-city impact |
|---:|---|---|---|
| 1 | All-region layout synchronously loaded by every client | 350 KiB source plus parse/compile | Grows with every region/city |
| 2 | All starter regions ensured on new account | Seeds 363 current city docs | Linear account-time read/write amplification |
| 3 | Broad presence and realm-activity windows | Recurring document reads | Scales with concurrency/activity |
| 4 | No semantic LOD at low zoom | Mostly hidden by current density | Can render every city/label/control |
| 5 | Service-worker precache at 2.99 MiB | Almost no budget headroom | Discourages modular runtime caching |
| 6 | Unbounded runtime image cache | Usually modest in one session | Visits across 60 maps can retain substantial decoded memory |
| 7 | Long-route projection writes | Small current route graph | Write amplification grows with route length |
| 8 | Fixed deployed server manifest | Operational, not frame cost | Region activation requires deploy/restart |

## Recommended performance budgets

- Initial service-worker install precache: target under 2.5 MiB, hard cap 3 MiB.
- Initial world catalog: under 50 KiB compressed at 60 regions.
- Lazy region layout: target 50 KiB compressed; hard cap 100 KiB.
- Gameplay map: at or below 750 KiB compressed and 8 MiB decoded.
- Thumbnail: target at or below 35 KiB; fetch only viewport/nearby picker items.
- Active plus two neighbor decoded maps: target under 24 MiB.
- Simultaneous city/camp DOM nodes: target under 200.
- Simultaneous army tokens: target under 100 before clustering/aggregation.
- Base gameplay realtime listeners: target 15 or fewer, excluding explicitly opened clan/social panels.
- Frame pacing: p95 at or below 16.7 ms on target desktop and 33.3 ms on target mobile during representative pan/zoom; no repeated >50 ms long tasks.

## Validation status

The existing asset performance, bottleneck, realtime health, live subscription scope, map image loading, animation system, and runtime/map-manifest validators all passed during this audit. Those checks provide good regression coverage, but they are static or synthetic. Add an authenticated, deterministic populated-region benchmark before calling the 100–150-city target proven.

See [REALTIME_AUDIT.md](./REALTIME_AUDIT.md) for listener details and [RECOMMENDED_PHASES.md](./RECOMMENDED_PHASES.md) for the order of work.
