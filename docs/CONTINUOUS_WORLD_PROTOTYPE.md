# Continuous world — Stage 1 private prototype

Owner approved October 20, 2026. This is a local, inspect-and-navigate demonstration, not a live-game release. No player accounts, production database, multiplayer feed, travel-rule changes, orders or rewards are involved.

## Open it

From the repository, using Node 22:

```sh
node tools/map-benchmark/server.js --port=8799
```

Open <http://127.0.0.1:8799/__benchmark__/seamless/> on this computer. The server binds to loopback and rejects other Host names. Nothing needs to be installed in the game or exposed through the router. Stop the command with Ctrl+C when finished. The existing benchmark entry remains available separately.

Drag with the mouse or a finger; use the wheel, pinch or +/− controls to zoom. **Home** centers Stoneward at one-section fit. **Fit preview** shows all nine sections. Click/tap a castle, camp, tower, stronghold or Citadel to inspect its identity and fictional owner/troops. Select a moving patrol and choose **Follow**; dragging stops following. Arrow keys pan; Escape closes selection. Selection persists when the selected object leaves the viewport. There are no map-switch arrows or visible section borders.

For the separate stress fixture, append `?crowded=1`. It adds 240 sample patrols along the same six routes; it does not invent more cities or change placements.

## Scope and internal boundaries

- `tools/map-benchmark/seamless/model.js` owns pure projection, camera bounds, anchored zoom and polyline sampling. The plane is 4344 × 3258 logical pixels. Each section is 1448 × 1086; offsets are `(gridX + 2) × 1448`, `(gridY + 2) × 1086`. These are **preview coordinates**, not authoritative travel coordinates.
- `fixtures.js` reads the nine current `core-expansion-v1` catalog definitions with both grid coordinates in −2…0. It retains all 540 city identities and positions, seven landmarks, catalog scenery and the fixed October scenery layout. Ownership and troop counts are deterministic samples. Object identity is the pair `[sectionId, objectId]`; original local positions remain separate. Six back-and-forth patrols follow exact painted road polylines through three horizontal and three vertical joins. The 12 internal reciprocal road joins are checked independently.
- `assets.js` owns an asset queue with at most two requests/decode operations in flight. Visible thumbnails and terrain precede neighboring sections. Full-resolution terrain is limited to the nearest four eligible sections and released outside that set; overview uses thumbnails only. Sprites and nine thumbnails form a finite reusable cache. Failed loads retain the thumbnail and expose **Retry images**. Aborted/obsolete results cannot restore evicted terrain or alter the camera.
- `preview.js` owns the DOM scene and input. Terrain nodes are fixed; detailed objects exist only inside the viewport plus 75 screen pixels, with castles/scenery omitted at overview. Camera transforms update once per animation frame. Moving patrols use transforms; input never reconstructs the scene. Selection, follow state and asset residency are independent.
- The dedicated HTML loads only prototype code. Its CSP disallows external connections, frames, forms and workers. Assets use same-origin requests without credentials. The harness creates fictional fixture data from repository files, never from production services.
- Everything executable is under `tools/`, which the production build excludes. No production entry, public API, database schema, live world, server subscription or release contract is changed. The prototype URL is not a public game address.

## Artwork inspection

All 12 internal edges have coincident terrain geometry and matching road endpoints; all four four-section corners meet. A fixed one-logical-pixel edge overlap closes fractional compositor cracks without changing object or road coordinates. Source images and source layouts are unchanged.

The current painted textures are **not seamless tiles**. At close range, meadow grain/brightness changes remain at several joins (notably Stoneward–Greybanner and Aurum–Citadel); road shoulder texture and tangent changes can also reveal a join despite matching road centers. Full-detail to thumbnail transitions are visible when more than four tiles occupy the viewport. These are documented artwork/LOD limits, not missing terrain. Later artwork work can harmonize edge strips; Stage 1 intentionally does not regenerate the map set.

## Validation

```sh
node tools/validate-seamless-world.js
node tools/validate-map-benchmark.js
# Set CHROME_PATH if Chrome/Chromium is not installed in a standard location.
node tools/validate-seamless-world-browser.js
```

The browser validator uses the existing dependency-free CDP harness and real mouse/touch input. It checks 1440×900, 844×390 and 568×320; exact selection, drag suppression, pinch/wheel anchors, camera bounds, Home/overview, all seams/corners, follow/cancel, resize, failure/retry, delayed loads, repeated crossings, rapid zoom and stable DOM/listener counts after garbage collection. It fails on external browser requests or runtime exceptions. Pure tests also reject obsolete results and prove the four-image/two-request caps.

Screenshots and machine-readable timings are written to ignored `release-artifacts/seamless-world/`. The reviewed validation plan additionally runs the production build/artifact exclusion check and the existing benchmark regression validator. No emulator suites are applicable because there are no server-authoritative changes.

## Performance and review limits

Measurements are local headless Chromium frame intervals during continuous panning and zooming, with normal (six patrols) and crowded (240 patrols) fixtures. Fourfold CPU throttling is a synthetic stress test, not a physical phone result. The measured results below record the final rendering implementation before PR validation. This prototype does not measure networked multiplayer capacity, server subscriptions or real-device GPU memory.

Measured 2026-10-20T21:46:26.347Z with Chrome/153.0.8010.12 on the home server. Each case records 2.5 seconds after asset warm-up, while continuously panning and zooming.

| Viewport | Patrols | CPU slowdown | Mean FPS | Frame p50 / p95 / max (ms) | JS work p95 (ms) |
| --- | ---: | ---: | ---: | --- | ---: |
| 1440×900 | 6 | 1× | 60 | 16.7 / 16.7 / 16.8 | 1.2 |
| 1440×900 | 240 | 1× | 60 | 16.7 / 16.8 / 16.8 | 2.1 |
| 1440×900 | 6 | 4× | 59.6 | 16.7 / 16.8 / 33.4 | 4.4 |
| 1440×900 | 240 | 4× | 46.9 | 16.7 / 33.4 / 33.4 | 10.5 |
| 844×390 | 6 | 4× | 58.8 | 16.7 / 16.8 / 49.9 | 5.4 |
| 844×390 | 240 | 4× | 43.8 | 16.7 / 33.4 / 66.7 | 9.6 |
| 568×320 | 6 | 4× | 59.2 | 16.7 / 16.8 / 33.3 | 5.7 |
| 568×320 | 240 | 4× | 42.2 | 16.7 / 33.4 / 83.3 | 8.9 |

The unthrottled desktop target is met for both fixtures. Normal scenes remain close to 60 FPS under throttling; crowded/throttled scenes do not meet that target (roughly 42–47 FPS in this run). This is a Stage 2 density/renderer budget to resolve before enabling a large multiplayer view. Frame timing varies with other work on this live host; CI timings are functional diagnostics, not a comparable hardware benchmark. The fixed-size terrain and transform-scaled labels/patrols avoid repeated layout work during zoom.

Across the tests, full terrain residency never exceeded four images and image loading never exceeded two simultaneous tasks. Full terrain is approximately 24 MiB decoded (four 1448×1086 RGBA images), excluding thumbnails, sprites and browser-managed caches. No outside requests or runtime exceptions were observed. Returning to the same frozen scene after 40 rapid view changes restored the same node/listener counts; CDP garbage-collected node/listener totals also remained bounded.

Before Stage 2, review the visual seams and mobile navigation, then design the authoritative visible-area feed and gradual gameplay integration. The existing live game continues to use its current map interface.
