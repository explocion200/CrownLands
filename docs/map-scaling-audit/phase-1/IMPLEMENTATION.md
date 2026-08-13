# Phase 1 implementation

Date: 2026-08-13

## Outcome

Phase 1 removes the nonlinear client display calculation that made march-heavy
maps unusable. The production change is intentionally small: current-player
King Power is calculated once for a display batch and shared by the march,
status, and city consumers in that batch.

No gameplay, route, server, realtime, or network behavior changed.

## Production change

`game.js` now owns a bounded display-only King Power snapshot:

- `kingPowerRenderFrameCacheActive` identifies a display batch.
- `kingPowerRenderFrameCache` stores one numeric result after the first
  `getKingPower()` call in that batch.
- `withKingPowerRenderFrameCache()` establishes and clears the batch with a
  `try/finally` boundary.
- the main animation frame starts the batch only after simulation work has run;
  it always clears the value before requesting the next frame;
- direct `renderHudStatusPanels()`, `renderCities()`, and `renderArmies()` calls
  use the same bounded helper so startup and realtime-triggered rendering do not
  reintroduce the repeated calculation outside the animation frame.

The snapshot is not a gameplay cache. It is never consulted across frames, is
not persisted, has no time-to-live, owns no entity collection, and cannot grow.
Simulation, server results, and other state changes occur before the display
batch begins or in a later batch.

## Why this fixes a march problem

The map fixture has no authoritative global-stat document, so resolving the
current player's identity falls back to local King Power. Before this change,
each remote march identity resolution could normalize every owned city and
recompute every city's infrastructure statistics. HUD incoming/outgoing status,
city signatures, and march tokens asked for equivalent identity data multiple
times in the same frame.

At 100 cities / 50 marches, the pre-change 10-second profile executed
`getCityStats()` 62,640 times and spent 13.5 seconds of self time there. After
the change, it executed 1,980 times and spent 0.48 seconds there. HUD status
refresh average time fell from 1,863.7 ms to 12.4 ms.

## Route and token decisions

Profiling showed that the existing march drawing architecture should be kept:

- `renderArmies()` averaged 7.4 ms before the change;
- `renderPaths()` averaged 0.325 ms;
- route geometry already has a stable signature and is not rebuilt per frame;
- all routes already share one SVG;
- path length/segment metrics already use a `WeakMap` keyed by the route point
  array;
- token elements are retained in a keyed cache and updated in place;
- movement already uses transform writes and time-based interpolation;
- position writes already run on the 140 ms march cadence, while HUD status and
  countdown work runs on the existing slower cadence;
- camera/low-zoom/crowded states already disable route filters and dash
  animation.

No new route cache, SVG simplification, culling rule, movement cap, or CSS
containment change was added because the measured route/token work was not the
primary bottleneck. Existing caches remain bounded by object lifetime or are
pruned with march state.

## DOM, SVG, and animation changes

| Surface | Before | After |
|---|---:|---:|
| DOM nodes per march | 15.32 descendants | 15.32 descendants |
| Scenario B march tokens | 50 | 50 |
| Route nodes per march | 2 | 2 |
| Scenario B route nodes | 100 | 100 |
| Application persistent animation loops | 1 | 1 |
| March visual update interval | 140 ms | 140 ms |

There are no production DOM, SVG, route-style, icon, or animation-loop changes.
Visual identity and all semantic route classes remain intact.

## Benchmark infrastructure added

- `profile:map:marches` records an isolated Scenario B function profile.
- `profile:map:marches:before` preserves a named pre-change capture.
- `benchmark:map:phase1` writes the full A-E post-change matrix without
  replacing the Phase 0 baseline.
- `benchmark:map:phase1:verify` records two additional nominal A/B/D runs.
- `benchmark:map:phase1:verify:a-desktop` supplies two extra A desktop samples
  for the variable zoom long-task control.
- `validate:map-phase1` applies the unchanged Phase 0 thresholds using the
  documented median-run policy and checks fixture, DOM, realtime, network, and
  memory invariants.
- loopback-only visual QA query controls can request 1/10/25/50/100 marches or
  a five-kind mission sample. They do not exist in production code.

The benchmark continues to reject production backend access and exact-count
fixture failures.
