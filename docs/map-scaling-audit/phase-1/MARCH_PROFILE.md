# Phase 1 march and route profile

Date: 2026-08-13

## Scope and method

This is the required pre-change profile for Map Scaling Phase 1. It uses the
authenticated Phase 0 harness, its fixed seed (`crownlands-map-phase-0-v1`),
and Scenario B (100 cities / 50 marches) on the same reference desktop and
Chrome major as the Phase 0 baseline. The measured window is 10 seconds of
idle map activity. The profile-only wrappers are enabled by the benchmark
query parameter and are not active in a normal game session.

Machine-readable evidence is stored in
`benchmark-results/map/phase-1-profile-before.json`.

## Pre-change result

| Metric | Result |
|---|---:|
| Initial authenticated-equivalent region ready | 1,785.6 ms |
| Frames sampled | 6 |
| Idle FPS | 0.52 |
| Median frame time | 1,895.8 ms |
| p95 frame time | 2,222.2 ms |
| Long tasks | 6 |
| Long-task time | 11,573 ms |
| Longest task | 2,221 ms |
| Chrome main-thread task time | 13,481.5 ms |
| Chrome script time | 13,400.6 ms |
| Chrome layout time | 5.1 ms |
| Chrome style-recalculation time | 35.8 ms |

The failure is JavaScript work, not layout or style churn.

## Ranked call evidence

Inclusive timings can overlap because the profiler records nested calls.
Self time identifies where the CPU is actually spent.

| Function | Calls | Total | Self | Average |
|---|---:|---:|---:|---:|
| `getCityStats` | 62,640 | 13,518.6 ms | 13,518.6 ms | 0.216 ms |
| `resolvePlayerIdentityForUid` | 131,984 | 15,539.0 ms | 1,718.7 ms | 0.118 ms |
| `renderHudStatusPanels` | 8 | 14,909.3 ms | 122.4 ms | 1,863.7 ms |
| `getCityRenderSignature` | 8 | 395.3 ms | 4.2 ms | 49.4 ms |
| `renderCities` | 8 | 400.3 ms | 1.9 ms | 50.0 ms |
| `renderArmies` | 8 | 59.5 ms | 3.4 ms | 7.4 ms |
| `updateArmyTokenElement` | 400 | 39.0 ms | 17.1 ms | 0.098 ms |
| `getArmyTroopDisplayText` | 800 | 20.6 ms | 20.5 ms | 0.026 ms |
| `renderPaths` | 8 | 2.6 ms | 0.6 ms | 0.325 ms |
| `getMissionPointAtProgress` | 400 | 2.0 ms | 1.6 ms | 0.005 ms |

## Root cause

The Phase 0 conclusion that the collapse was in march drawing was too broad.
The direct march renderer and shared route SVG are already inexpensive at the
Scenario B density. The nonlinear interaction is in display-side status and
identity computation:

1. `renderHudStatusPanels()` refreshes incoming and outgoing operation status.
2. Those status functions scan the renderable marches several times.
3. `getRenderableRemoteArmy()` resolves each march owner's identity.
4. Resolving the signed-in player's identity asks for `getKingPower()`.
5. Without an authoritative global-stat snapshot in the fixture, every call to
   `getKingPower()` normalizes all owned cities and recomputes infrastructure
   power with `getCityStats()`.
6. `getCityStats()` also evaluates controlled-objective bonuses over the city
   collection, magnifying the repeated city-by-march work.

The result is repeated equivalent King Power work during a single animation
frame. It does not change between the HUD, city signature, and march token
consumers in that frame, but it is recalculated for each consumer.

## March and route architecture traced

- One application `requestAnimationFrame` loop drives simulation and display.
- March token positions update on the existing 140 ms cadence (about 7 Hz), not
  on every animation frame.
- Route geometry uses one shared SVG and a stable signature; Scenario B has 100
  route SVG nodes for 50 marches (ribbon plus flow line per route).
- Route point metrics are cached by route point array.
- March token elements are retained and updated rather than recreated. Scenario
  B has 50 tokens and 766 token-descendant nodes (15.32 per token).
- Existing crowded-map CSS already removes the costly march transition/shadow.
- There is one persistent application animation loop and 17 realtime listeners.

## Optimization decision

The Phase 1 implementation will cache the current player's King Power only for
the display portion of one animation frame. The cache will begin after gameplay
simulation has run and will be discarded at the end of the frame. This removes
equivalent repeated UI calculation while preserving:

- server and gameplay authority;
- march timing, movement, pathfinding, and arrival behavior;
- identity and King Power semantics between frames;
- network requests, subscriptions, and payloads;
- the existing march and route DOM structure.

No route simplification, token removal, animation downgrade, culling change, or
gameplay throttle is justified by the profile.
