# Phase 2 Scenario C Zoom Profile

## Outcome

The exact bottleneck was an inherited, continuously changing CSS custom property on `.map-world`:

```js
mapWorld.style.setProperty("--map-hit-size", `${44 / zoom}px`);
```

Only hit-target pseudo-elements consumed `--map-hit-size`, but changing it on the 3,400–3,700-node world root invalidated style across the contained map. Scenario C spent 2.81 seconds of the five-second desktop sample and 2.41 seconds of the mobile sample recalculating style. Layout was secondary; direct wheel event handling, route geometry, and map transforms were not the dominant costs.

## Method

The deterministic authenticated-equivalent Scenario C fixture was profiled at 150 cities and 100 marches. The focused test issued real wheel input every 120 ms for five seconds at 1440×900 desktop and 844×390 mobile landscape. It captured:

- CDP main-thread metrics and timeline events;
- frame rate, p95 frame time, and long tasks;
- function call/self time through the production zoom path;
- MutationObserver attribute, class, style, child-list, and target-family counts;
- DOM token-list, attribute, and custom-property operations;
- initial/final computed styles and map-level classes;
- network, heap, and realtime listener invariants.

The Blink build exposed `UpdateLayoutTree`, layout, paint, event, and function timing, but did not emit named invalidation-reason records from `blink.debug.invalidationTracking`. Selector attribution therefore combines the trace durations with exact mutation records, instrumented call stacks, computed styles, and production-source inspection rather than inventing unavailable reason labels.

Evidence: [pre-change profile](../../../benchmark-results/map/phase-2-zoom-profile-before.json) and [post-change profile](../../../benchmark-results/map/phase-2-zoom-profile-after.json).

## Pre-change main-thread profile

| Viewport | Zoom FPS | p95 frame | Task | Script | Style recalc | Layout | `UpdateLayoutTree` trace |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop | 17.7 | 180.6 ms | 3,900.7 ms | 469.5 ms | 2,809.8 ms | 56.2 ms | 2,856.3 ms |
| Mobile | 8.2 | 229.2 ms | 3,617.7 ms | 837.6 ms | 2,414.9 ms | 64.8 ms | 2,474.6 ms |

The isolated profiler itself changes absolute FPS versus the earlier full Phase 1 matrix because it adds MutationObserver, call wrappers, and trace collection. The before/after focused comparison uses the same profiler on both sides.

## Zoom event flow

1. `handleWheelZoom()` computes one multiplicative step.
2. `setZoomAroundPoint()` reads the frame and screen-to-map position, updates camera coordinates, schedules one camera RAF, and marks zoom interaction.
3. `markCameraInteraction()` queues deferred rendering and adds `.camera-moving` and `.zooming`. These classes changed only at gesture start/end; they did not thrash per wheel event.
4. `applyCameraTransform()` reads the frame, clamps zoom/camera, evaluates the stable low-zoom state, rewrites inherited `--map-hit-size`, writes the one `.map-world` transform, and evaluates the return-to-main-city control.
5. The inherited custom-property write invalidates the large descendant surface. The return-button geometry read then forces pending style work to complete on the same interaction path.
6. Normal city/path rendering is intended to defer until the gesture settles. Under severe stalls, however, the 260 ms settle timer can run between delayed wheel events. That caused repeated full render flushes, especially on mobile.

## Ranked pre-change JavaScript work

| Desktop self time | Calls | Self time | Mobile self time | Calls | Self time |
|---|---:|---:|---|---:|---:|
| `applyCameraTransform` | 22 | 112.7 ms | `renderCities` | 14 | 395.6 ms |
| `renderArmies` | 115 | 87.2 ms | `updateMainCityReturnButton` | 28 | 382.3 ms |
| `updateMainCityReturnButton` | 15 | 83.1 ms | `applyCameraTransform` | 14 | 353.3 ms |
| `renderCities` | 4 | 81.9 ms | `renderArmies` | 51 | 159.2 ms |
| `renderPaths` | 4 | 44.9 ms | `renderPaths` | 14 | 154.0 ms |

The mobile render calls were a consequence of missed gesture coalescing under the style stalls, not a design that intentionally rebuilds cities on each wheel event.

## Mutation evidence

| Viewport | Total mutations | Attribute | Child-list | Class | Style | Interaction settles |
|---|---:|---:|---:|---:|---:|---:|
| Desktop | 12,977 | 12,294 | 683 | 3,851 | 944 | 3 |
| Mobile | 40,585 | 37,378 | 3,207 | 17,262 | 1,589 | 14 |

The mobile sample rebuilt route SVG and re-applied city-label slot classes repeatedly after premature settle flushes. Examples included 2,044 removal attempts for every label slot family, 2,044 re-adds of `label-slot-top`, and thousands of unchanged accessibility/property writes during repeated city/army passes.

## Selector and component findings

The highest-impact surface was not one complex selector; it was inheritance from `.map-world` to the full map tree. Broad map-state selectors expanded the cost when the gesture began or ended:

- `.map-frame.camera-moving ...`
- `.map-frame.zooming ...`
- `.map-frame.low-zoom ...`
- `.map-frame.crowded-map ...`

These selectors cover terrain filters, route ribbons/flows, city rings, castles, shields, owner labels, action wheels, and army tokens. They changed only at boundaries, but each boundary invalidated high-cardinality descendants. Camp and teleporter zoom rules also retained expensive filters during zoom, contrary to the rest of the performance rules.

City labels were costly when a stalled gesture accidentally flushed a full render: ruler names, city names, troop text, clan tags, flags, and label-slot placement all participated. Route geometry was not regenerated during a healthy active gesture; it was regenerated only by those unintended settle flushes. Images stayed on their existing sources and scaled through the single world transform.

## Decision

The profile supported two scoped changes:

1. eliminate the continuous inherited property write and replace it with discrete hit-area values at semantic tier boundaries; and
2. use the same three tiers to remove secondary far-zoom detail while preserving strategic state.

No per-entity zoom transforms, city removal, route geometry rewrite, image swaps, `content-visibility`, dynamic region loading, or network changes were justified.
