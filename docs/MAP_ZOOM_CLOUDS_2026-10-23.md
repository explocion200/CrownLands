# Connected-map zoom limit and sparse clouds

The owner requested a safer wide view to reduce crowded-map lag, with a few
translucent moving clouds and faint ground shadows. This client-only change
supersedes the older 60% fitted-view limit and the previous performance task's
instruction to leave zoom limits unchanged. Backend authority and data are unchanged.

## Presentation

- Minimum zoom is 140% of single-section fit at viewport heights up to 500 px,
  85% at 900 px or above, with linear interpolation between. Whole-world fit
  remains a floor for small catalogs. Home clamps to the new minimum when needed;
  maximum zoom remains three times single-section fit.
- Wheel, pinch, buttons, saved-view restoration, navigation and resize use the
  same camera clamp. Connected panning, route coordinates, hit targets, labels,
  shields, pickups and native UI sizes retain their existing behavior.
- Two cloud patches on narrow screens, three at widths of 1000 px or more.
  Maximum cloud opacity is 32%; shadows are 12%. Soft masks feather the existing
  `assets/optimized/map-transition-clouds-448x448-a17eebc9852d.webp` texture.
  No new artwork, world data, asset pipeline or backend capability is required.
  The reviewed lazy-module inventory adds `world/atmosphere.js`; the measured
  3,352-byte runtime/style increase has a separate 3,584-byte allowance without
  expanding installation precaching or existing artwork budgets.
- Paired shadows project into the rebased ground surface below castles/banners.
  Cloud wisps sit below native HUD/action overlays. All weather nodes ignore input.
- Patches fade out by 1.8 times minimum zoom. Full animates, Reduced freezes drift,
  Off hides both layers; the existing system/adaptive mode remains authoritative.
  Hidden tabs and opaque windows pause the existing renderer, including weather.
- Six reusable patch nodes total; no separate animation loop, blur filters,
  world-sized weather textures, subscriptions or scene-index entries.
- Compare cached input style values rather than CSSOM serialization, so rounded
  dimensions/transforms do not trigger identical writes every frame. Cosmetic
  module failure or an older cached bootstrap leaves the map usable without clouds.

## Reproduction and evidence

Use Node 22 and the repository dependencies. These browser tests intercept all
HTTP requests and create disposable PostgreSQL schemas with fictional accounts;
they do not connect a browser to production game data.

```sh
node tools/test-local-postgres-map-pan-performance.js --baseline=becb251de6ccedefc023a3f7ff64db3e2c06e72e --zoom-survey
CROWNLANDS_MAP_SOAK_SECONDS=300 node tools/test-local-postgres-map-pan-performance.js --source --repeats=2 --min-only
node tools/test-local-postgres-map-pan-performance.js --source --repeats=2 --min-only --clouds-off
node tools/test-local-postgres-map-pan-performance.js --source --min-only --normal
node tools/test-local-postgres-production-world.js
node tools/validate-map-atmosphere.js
```

Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`. Build the current
production client before packaged tests. Benchmark reports/screenshots are under
`release-artifacts/map-pan-performance/`; visual interaction checks are under
`release-artifacts/continuous-production/`. Measurements use desktop 1440×900 and
844×390 / 568×320 landscape simulations with four-times CPU throttling and DPR 2.
These are controlled browser simulations, not physical-phone or multiplayer-capacity
claims. The comparison forces Full animation to measure moving-cloud cost.

The initial distance survey used the source renderer at base
`becb251de6ccedefc023a3f7ff64db3e2c06e72e`, before adding clouds. Each point
warms and samples the same panning route for 6.5 seconds apiece, without tracing:

| Viewport / throttle | Old 60% fit FPS / p95 | Selected fit | Selected FPS / p95 |
| --- | --- | --- | --- |
| 1440×900 / 1× | 56.3 / 33.3 ms | 85% | 59.5 / 16.7 ms |
| 844×390 / 4× | 8.6 / 250 ms | 140% | 47.9 / 33.4 ms |
| 568×320 / 4× | 13.7 / 183.3 ms | 140% | 50.8 / 33.4 ms |

The intermediate 120% phone fit left less headroom (41.8 and 34.4 FPS);
140% retains more of the map than 160% while providing a larger improvement.
This is a measured fixed zoom policy, not a universal device-performance guarantee.

Final source measurements at the new minimum, after caching CSS input values:

| Viewport / throttle | Crowded, clouds moving (two runs) | Crowded, clouds disabled (two runs) | Normal, clouds moving |
| --- | --- | --- | --- |
| 1440×900 / 1× | 57.2–58.6 FPS; p95 16.8 ms | 59.4–59.7 FPS; p95 16.7–16.8 ms | 60.0 FPS; p95 16.8 ms |
| 844×390 / 4× | 39.2–39.8 FPS; p95 50.0–50.1 ms | 44.2–44.7 FPS; p95 49.9–50.0 ms | 50.2 FPS; p95 33.4 ms |
| 568×320 / 4× | 47.5–48.3 FPS; p95 33.4 ms | 49.7–51.0 FPS; p95 33.4 ms | 52.2 FPS; p95 33.4 ms |

All these average frame rates exceed the 30 FPS crowded-mobile target. The
844×390 crowded case still misses the stricter 33.4 ms p95 target, even without
clouds; occasional expensive frames remain. Weather has a measurable cost,
especially in the larger throttled viewport. Neither clouds nor a closer camera
constitute a complete fix for the remaining DOM/paint bottleneck.

The final five-minute repeated-section-crossing soak passed. Across ten samples,
map listeners stayed at 19, weather patches at six, full-resolution terrain images
at four, active object nodes at no more than 93 and retained object nodes at no
more than 273. All cache-bound assertions, subsequent access-revocation checks
and browser error checks passed. This is a five-minute stability check, not a
physical-phone measurement or a longer multiplayer soak.

The targeted tests cover pure camera/atmosphere contracts, real packaged-map
mouse/touch input, floor/maximum preservation on resize, routes, proportional
troop/pickup/objective controls, shields, access revocation, reduced/off motion,
opaque-window suspension, idle style-write suppression, disposal and optional
module failure. They reuse the isolated production-world fixture; no gameplay
emulator suite is required because no authoritative code or rules changed.

Implementation alone does not establish a live deployment. This update requires only the existing
compatible static publisher, with no server restart, migration or player-data rewrite.
