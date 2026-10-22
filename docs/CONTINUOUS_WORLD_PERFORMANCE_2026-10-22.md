# Continuous-world performance, October 22, 2026

Status: implementation on `codex/map-pan-performance`; not yet verified deployed.

The approved work preserves the current artwork, labels, flags, shields, selected
controls, movement paths, zoom limits and gameplay. The live backend is the local
PostgreSQL service, and the supported topology is `core-expansion-v1`.

## Map rendering

Camera transforms remain synchronized with animation frames. An ordered spatial
index limits object searches to intersecting cells; nearby terrain prioritization
sorts only the current area window. Retired visible elements can be reused, with
at most 512 detached nodes. Unloaded/unauthorized objects are removed from the
pool. Account/realm permission changes and disposal clear retained state.

Label measurements survive culling when their complete displayed content matches.
The cache holds at most 2,048 entries and 16 placement results. Resizing and font
loading invalidate measurements. Changes to level, ownership, displayed troops,
selection, shields, scenery clearance and controls still update their presentation.
Formatting a troop count identically no longer rebuilds its entire banner.

Scenery uses one overscanned, viewport-sized canvas. At a fixed zoom, pans can move
the existing drawing through the compositor; content, asset, viewport or scale
changes redraw it. The drawing is never enlarged from a lower zoom. Its maximum
allocation is 48 MiB; unusually large viewports use direct drawing. Terrain keeps
the existing four full images, sixteen thumbnails and two concurrent requests.
Sprite retention is bounded by requested art plus 64 recently used assets; active
art is never dropped to meet an arbitrary cache count. March timers update when
their displayed second changes, while positions remain frame-synchronous.

An initial experiment with many world-aligned scenery tiles increased raster work
and memory churn in the crowded test. It was replaced with the single viewport
drawing. Camera raster hints are removed before changing zoom, preserving sharp
close-up artwork instead of permanently caching the first displayed scale.

## Reproducible checks

`tools/test-local-postgres-map-pan-performance.js` runs the actual authenticated
renderer against a disposable PostgreSQL schema and fictional accounts. Browser
requests are intercepted; no production game endpoint or player data is used.
Both versions traverse the same sinusoidal route centered on Stoneward, warmed
once before measurement. Crowded scenes deliberately use long names and varied
city stages throughout the nine central maps. `--normal` retains ordinary fixture
ownership. Viewports are 844×390 and 568×320 at four-times CPU throttling, and
1440×900 without throttling, all at DPR 2, at Home and minimum zoom.

Run `--baseline=12540859d998ed867ffb05c30560890dd24579b7` for the old renderer;
the default tests the built `dist/world` package. `--source` is diagnostic only.
Set `CROWNLANDS_MAP_SOAK_SECONDS=1800` for the 30-minute run. Optional
`CROWNLANDS_MAP_TRACE=1` collects diagnostic trace durations; traced runs must not
be used for final comparisons. Reports and screenshots are under the ignored
`release-artifacts/map-pan-performance/` directory. Do not run heavy tests in
parallel with measured browser routes.

The pure cache validator checks indexed-query parity, delayed/failed loads,
obsolete results, retention, drawing resolution and cleanup. Existing packaged
world and selected-city tests cover actual mouse/touch input, selection, levels,
flag attachment, privacy, actions, paths, pickups and shields.

### Measured built-client results

Measured on this Linux desktop with Chrome for Testing 153.0.8010.12 (Playwright Chromium 1243),
DPR 2, the same warmed routes and no profiler or parallel test load. The desktop
also hosts the game services, so these are controlled local comparisons, not an
isolated hardware certification. Crowded fixture:

| Viewport / CPU / zoom | Old FPS | New FPS | Old p95 frame | New p95 frame | Old/new p95 renderer work |
|---|---:|---:|---:|---:|---:|
| 844×390 / 4× / home | 12.7 | 23.3 | 166.7 ms | 116.6 ms | 85.9 / 20.0 ms |
| 844×390 / 4× / min | 4.8 | 5.7 | 383.3 ms | 349.9 ms | 206.8 / 59.1 ms |
| 568×320 / 4× / home | 18.8 | 34.2 | 150.0 ms | 83.4 ms | 79.6 / 13.6 ms |
| 568×320 / 4× / min | 6.1 | 9.8 | 383.2 ms | 216.8 ms | 223.7 / 38.4 ms |
| 1440×900 / 1× / home | 57.9 | 60.0 | 16.8 ms | 16.8 ms | 8.2 / 3.1 ms |
| 1440×900 / 1× / min | 45.0 | 54.5 | 33.4 ms | 33.3 ms | 16.7 / 5.6 ms |

The four-times-throttled crowded phone target **was not met**. Renderer work
fell substantially, but browser paint/compositing still causes visible stalls in
this stress simulation. Do not call this a completed 60-FPS mobile solution.
The normal fixture's desktop minimum view measured 58.9 FPS, p95 16.8 ms.
No new physical-Android result has been collected for this change.

The drawing used at most 28.6 MB at the measured sizes. Asset limits, node-pool
bounds, font invalidation, live name refresh and returning-node identity checks
passed. Selected banner checks passed desktop and both landscape sizes. The
30-minute soak and remaining required gates are pending at this point.
A simulated browser result does not establish physical-phone FPS or full
multiplayer capacity.

## Subsequent server updates

Implement true batched document reads and bounded public-field projection while
retaining fresh authorization/own counts and the existing 750 ms shared cache.
Then instrument and shorten slow arrival transactions, proving retries and
simultaneous outcomes in isolated tests before considering any scheduling change.
These are separate reviewed branches and backend installations. No schema/index,
worker-concurrency, public API or gameplay change is authorized by a map-only merge.
