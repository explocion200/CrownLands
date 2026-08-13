# Phase 2 Implementation

## Production changes

Production changes are limited to `game.js` and `styles.css`.

### Tier state

`updateZoomPerformanceClasses()` now maintains one of `detail-far`, `detail-medium`, or `detail-close` on `#mapFrame`. It uses `getMapDetailLevel()` and the four hysteresis thresholds documented in [LOD_DESIGN.md](LOD_DESIGN.md). If the tier does not change, it performs no tier class write.

The existing `low-zoom` and `crowded-map` states remain intact.

### Removed continuous invalidation

`applyCameraTransform()` no longer writes inherited `--map-hit-size` on every camera frame. The property is static per tier in CSS. Zoom still uses the existing single `translate3d(...) scale(...)` transform on `.map-world`; no per-city or per-march zoom transforms were introduced.

### Deferred geometry work

`updateMainCityReturnButtonForCamera()` now defers its geometry calculation while a camera interaction is active. `flushDeferredMapRender()` already updates the button at settle, so behavior remains current without forcing style completion during each zoom frame.

`layoutCityLabels()` skips collision-slot calculation in far detail. It still runs in medium and close detail, and selected/main/objective exceptions remain visible through CSS.

### Semantic CSS

Far detail hides secondary city identity/data text, generic garrison text, march counts/timers, and route flows. Medium hides only city troop/garrison text. Close detail is unchanged. Selected/targeted/main/objective city nodes and selected march tokens are explicit exceptions.

Camera-moving/zooming/low-zoom camp and teleporter rules now remove their node-level drop-shadow filters during the gesture. The markers remain visible and their settled appearance is unchanged.

## Development-only benchmark changes

The loopback harness gained:

- a focused `--profile-zoom` Scenario C mode;
- CDP trace stream summarization;
- zoom function/DOM operation/MutationObserver instrumentation;
- Phase 2 full-matrix and budget entry points;
- exact-viewport visual QA shells;
- visual-only shield, objective, selection, and 100-march fixtures;
- a Phase 2 decision validator.

These files do not ship into the game runtime and make no production Firebase requests.

## Explicit non-changes

- no gameplay, combat, economy, city ownership, coordinate, route, march, or objective mechanic changes;
- no Firebase schema, listener, polling, or network changes;
- no reduction of Scenario C load;
- no new artwork or image source swapping;
- no dynamic region catalog, topology, generator, expansion, or asset composer;
- no weakening of existing budgets;
- no duplicate DOM tree or LOD cache.

## Verification commands

```text
pnpm run profile:map:zoom:before
pnpm run profile:map:zoom
pnpm run benchmark:map:phase2 -- --fresh
pnpm run validate:map-budgets:phase2
pnpm run validate:map-capacity:phase2
pnpm run validate:map-phase2
```

The production client build, server lint/tests, Phase 0/1 decision validators, and artifact validator are also part of final validation.
