# Continuous world — Stage 1 private prototype

Owner approved October 20, 2026. This is a local, inspect-and-navigate demonstration, not a live-game release. No player accounts, production database, multiplayer feed, travel-rule changes, orders or rewards are involved.

The subsequent [private Stage 2 tests](CONTINUOUS_WORLD_STAGE_TWO_TESTS.md) add an optional full-catalog mode and document the latest rendering measurements. The original nine-section mode and its validation remain available; the historical measurements below describe the castle-sharpness update before that extension.

## Open it

From the repository, using Node 22:

```sh
node tools/map-benchmark/server.js --port=8799
```

Open <http://127.0.0.1:8799/__benchmark__/seamless/> on this computer. The server binds to loopback and rejects other Host names. Nothing needs to be installed in the game or exposed through the router. Stop the command with Ctrl+C when finished. The existing benchmark entry remains available separately.

Drag with the mouse or a finger; use the wheel, pinch or +/− controls to zoom. **Home** centers Stoneward at one-section fit. **Fit preview** shows all nine sections. Click/tap a castle, camp, tower, stronghold or Citadel to inspect its identity and fictional owner/troops. Select a moving patrol and choose **Follow**; dragging stops following. Arrow keys pan; Escape closes selection. Selection persists when the selected object leaves the viewport. There are no map-switch arrows or visible section borders.

For the separate stress fixture, append `?crowded=1`. It adds 240 sample patrols along the same six routes; it does not invent more cities or change the normal preview's placements.

## Scope and internal boundaries

- `tools/map-benchmark/seamless/model.js` owns pure projection, camera bounds, anchored zoom and polyline sampling. The plane is 4344 × 3258 logical pixels. Each section is 1448 × 1086; offsets are `(gridX + 2) × 1448`, `(gridY + 2) × 1086`. These are **preview coordinates**, not authoritative travel coordinates.
- `fixtures.js` reads the nine current `core-expansion-v1` catalog definitions with both grid coordinates in −2…0. It retains all 540 city identities/counts, seven landmarks, catalog scenery and the fixed October scenery layout. Ownership and troop counts are deterministic samples. Object identity is the pair `[sectionId, objectId]`; original `local` centers and their display footprints (`artLocal`) remain separate from `previewLocal` and the displayed world position. Six back-and-forth patrols follow exact painted road polylines through three horizontal and three vertical joins. The 12 internal reciprocal road joins are checked independently.
- `layout.js` implements the owner's request to spread fictional cities into the old 150–200-pixel edge inset. It expands each section's city distribution toward a 54-pixel inset, then picks deterministic clear positions nearest those targets. Castles now occupy 56×56 logical pixels instead of 42×42 (one-third larger), using the existing 256×256 artwork. Centers remain at least 88 pixels apart, including across joins. Road clearance includes the enlarged square's corner radius plus an 8-pixel buffer; scenery/objective rectangles retain a 10-pixel gap. The occupied range is x=54…1386 and y=54…1026 across the preview, with at least two cities within 110 pixels of each section side. Only preview coordinates move; no live travel coordinates or city records change.
- `assets.js` owns an asset queue with at most two requests/decode operations in flight. Visible thumbnails and terrain precede neighboring sections. Full-resolution terrain is limited to the nearest four eligible sections and released outside that set; overview uses thumbnails only. Sprites form a finite reusable cache. The original mode uses nine thumbnails; the full-catalog extension caps thumbnails at 16 and evicts distant ones. Failed loads retain the thumbnail and expose **Retry loading**. Aborted/obsolete results cannot restore evicted terrain or alter the camera.
- `preview.js` owns the DOM scene and input. Terrain nodes are fixed; detailed objects exist only inside the viewport plus 75 screen pixels. Overview retains city markers to show the distribution and omits scenery. Camera transforms update once per animation frame. Moving patrols use transforms; input never reconstructs the scene. Selection, follow state and asset residency are independent.
- The dedicated HTML loads only prototype code. Its CSP disallows external connections, frames, forms and workers. Assets use same-origin requests without credentials. The harness creates fictional fixture data from repository files, never from production services.
- Everything executable is under `tools/`, which the production build excludes. No production entry, public API, database schema, live world, server subscription or release contract is changed. The prototype URL is not a public game address.

## Artwork inspection

The original prototype's independently flipped textures exposed straight lines at several joins. `seamless/build-terrain.js` now composes the already-approved meadow painting and existing code-native road ribbons as one continuous private surface. Ground orientation alternates by grid parity so adjoining edges agree; one road mask and material phase covers the whole plane. This reuses existing artwork without generating a new painting. The result is cut into nine WebP tiles with two logical pixels of matching gutter on every side, closing fractional sampling gaps without stretching the image or moving routes. All 12 reciprocal joins and all four corners are covered.

Half-resolution thumbnails come from that same surface and contain no baked scenery, avoiding duplicate decorations during partial loading. Full images are 1452×1090 including gutters; thumbnails are 726×545. WebP quality 82 keeps all 18 files at 2.36 MiB. Browser pixel comparisons allow only small compression differences at corresponding gutters (mean channel difference below 3/255, maximum below 40/255). The measured worst mean is 2.12/255. Road-center samples independently confirm that paths are actually painted in all nine sections. There is no per-frame blending or mask pass.

The manifest records source and output hashes; the focused validator rejects stale terrain. Rebuild only these private files with Sharp available:

```sh
CROWNLANDS_SHARP_MODULE=/absolute/path/to/sharp node tools/map-benchmark/seamless/build-terrain.js
```

This does not write production backgrounds, thumbnails, catalogs or gameplay inputs. At extreme zoom the repeated meadow motifs can be recognized, and reduced-detail sections can be softer while loading; these are remaining art/LOD limitations rather than the former straight section-color breaks.

The castle visibility update also removes a permanent `will-change: transform` hint from the world container. Chromium was retaining its initial low-scale raster, then enlarging that flattened image at high zoom: even 256-pixel castle sources and vector text became blurry. Allowing normal rasterization restores their detail at the current zoom without creating additional sprites or increasing terrain residency. The terrain painting still has its original finite resolution; removing this rendering blur does not invent new ground detail at maximum zoom.

## Validation

```sh
node tools/validate-seamless-world.js
node tools/validate-map-benchmark.js
# Set CHROME_PATH if Chrome/Chromium is not installed in a standard location.
node tools/validate-seamless-world-browser.js
```

The browser validator uses the existing dependency-free CDP harness and real mouse/touch input. It checks 1440×900, 844×390 and 568×320; exact selection, drag suppression, pinch/wheel anchors, camera bounds, Home/overview, all seams/corners, authored pixel joins and painted road centers, follow/cancel, resize, failure/retry, delayed loads, repeated crossings, rapid zoom and stable DOM/listener counts after garbage collection. After overview→Home→maximum zoom, screenshot pixels are compared with the same castle rendered directly at its final screen size, at display densities 1× and 2×. The zoomed sprite must retain at least 85% of the reference's edge detail and have sufficient source pixels. The measured ratios are 0.97 at both densities. A negative-control run that restored the old raster hint failed at 0.45, confirming this check detects the reported blur. It fails on external browser requests or runtime exceptions. Pure tests also verify preserved identities/source coordinates, enlarged marker dimensions, full-footprint city distribution and road/object/city clearances across boundaries, reject obsolete results and prove the four-image/two-request caps.

Screenshots and machine-readable timings are written to ignored `release-artifacts/seamless-world/`. The reviewed validation plan additionally runs the production build/artifact exclusion check and the existing benchmark regression validator. No emulator suites are applicable because there are no server-authoritative changes.

## Performance and review limits

Measurements are local headless Chromium frame intervals during continuous panning and zooming, with normal (six patrols) and crowded (240 patrols) fixtures. Fourfold CPU throttling is a synthetic stress test, not a physical phone result. The measured results below record the final rendering implementation before PR validation. This prototype does not measure networked multiplayer capacity, server subscriptions or real-device GPU memory.

Measured 2026-10-20T22:23:20.523Z with Chrome/153.0.8010.12 on the home server. Each case records 2.5 seconds after asset warm-up, while continuously panning and zooming.

| Viewport | Patrols | CPU slowdown | Mean FPS | Frame p50 / p95 / max (ms) | JS work p95 (ms) |
| --- | ---: | ---: | ---: | --- | ---: |
| 1440×900 | 6 | 1× | 60 | 16.7 / 16.8 / 16.8 | 1.2 |
| 1440×900 | 240 | 1× | 60 | 16.7 / 16.8 / 16.8 | 2.1 |
| 1440×900 | 6 | 4× | 59.2 | 16.7 / 16.8 / 33.4 | 6.8 |
| 1440×900 | 240 | 4× | 36.6 | 33.2 / 50 / 66.7 | 14.4 |
| 844×390 | 6 | 4× | 58 | 16.7 / 16.8 / 66.6 | 6.1 |
| 844×390 | 240 | 4× | 36.5 | 33.3 / 50 / 83.4 | 10.9 |
| 568×320 | 6 | 4× | 57.6 | 16.7 / 16.8 / 50 | 6.3 |
| 568×320 | 240 | 4× | 32.9 | 33.3 / 50 / 99.9 | 11.9 |

The unthrottled desktop target is met for both fixtures. Normal scenes run roughly 57–60 FPS under throttling; crowded/throttled scenes do not meet that target (roughly 33–37 FPS in this run). This is a Stage 2 density/renderer budget to resolve before enabling a large multiplayer view. Frame timing varies with other work on this live host; CI timings are functional diagnostics, not a comparable hardware benchmark. The fixed-size terrain and transform-scaled labels/patrols avoid repeated layout work during zoom; the world can now reraster at its current scale to retain native sprite/text detail. Cities are now visible at overview and more edge cities are visible during section crossings; this adds detail to the original fixture. The new layout is ready for private visual review, while the crowded/mobile stress budget remains a gate before live continuous-world gameplay.

Across the tests, full terrain residency never exceeded four images and image loading never exceeded two simultaneous tasks. Full terrain is approximately 24.2 MiB decoded (four 1452×1090 RGBA images), plus 13.6 MiB for all nine half-resolution thumbnails, excluding sprites and browser-managed caches. No outside requests or runtime exceptions were observed. Returning to the same frozen scene after 40 rapid view changes restored the same node/listener counts; CDP garbage-collected node/listener totals also remained bounded.

Before Stage 2, review the visual seams and mobile navigation, then design the authoritative visible-area feed and gradual gameplay integration. The existing live game continues to use its current map interface.
