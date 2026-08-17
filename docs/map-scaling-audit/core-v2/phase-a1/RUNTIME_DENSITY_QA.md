# Core v2 Phase A.1 runtime-density QA

## Decision

The five-map prototype slice passes runtime-density QA without coordinate changes or capacity reduction. All 305 approved city positions were exercised through the actual Crownlands renderer in a loopback-only development fixture with current city art, player and rival banners, neutral labels, troop text, selection/action UI, cardinal arrows/Gates, real objective art, and representative march routes.

The evidence-backed Core floor is **68 source-image pixels center-to-center at 1448×1086**. Do not place future Core cities below 68 px. Use 70 px as the preferred authoring target when terrain permits, but do not retroactively apply the generated-player-region 112 px rule to the permanent Core.

## Per-map result

| Prototype | Capacity | Low / normal / close | Runtime collisions | Objective clearance | Input | Decision |
|---|---:|---|---|---|---|---|
| Crown Citadel | 60 | PASS / PASS / PASS | 0 sprite, label, banner, troop, objective conflicts | Citadel remains dominant; action UI remains legible | Mouse + touch PASS at tightest pair | PASS |
| Ironwatch | 60 | PASS / PASS / PASS | 0 | Defense Stronghold remains distinct | Mouse + touch PASS | PASS |
| South-West Holding Tower | 55 | PASS / PASS / PASS | 0 | Development reservation ellipse remains clear; no Tower art created | Mouse + touch PASS | PASS |
| Deed Camp West-South | 60 | PASS / PASS / PASS | 0 | Actual Deed Camp and its runtime status remain distinct | Mouse + touch PASS | PASS |
| West Support | 70 | PASS / PASS / PASS | 0 | Not applicable; maximum-density interior stays readable | Mouse + touch PASS | PASS |

All 15 map/zoom measurements reported zero overlap among visible castle sprites, names, player banners, foreign labels, troop displays, and objective/reservation footprints. Existing low-zoom LOD suppresses most names and troop text while retaining cities, shields, ownership treatment, routes, and edge navigation. Normal and close zoom restore the detailed labels. Close-zoom action wheels can transiently cover part of a neighboring label in the tightest cluster, as they do elsewhere in the current runtime, but the selected outline and action target remain unambiguous and the neighbor remains independently selectable.

## Interaction and route result

For every map at low, normal, and close zoom, the harness centered the two tightest runtime cities and dispatched both mouse and `pointerType=touch` input through the real event path. All **30 mouse city probes** and **30 touch city probes** hit the intended city and produced the expected selected/targeted action state; no adjacent city was selected accidentally. Representative friendly and hostile march paths remained distinguishable by color and token treatment. Shared-corridor crossings are visually busy by design, but routes remain traceable and the existing LOD/culling behavior prevents a new density failure.

## Spacing summary

`p5` is the fifth percentile of per-city nearest-neighbor distance. Pair columns count unordered city pairs strictly under the threshold.

| Map | Min | p5 nearest | Median nearest | <70 | <75 | <80 | <90 | <100 | <112 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Crown Citadel | 68.542 | 68.593 | 79.474 | 3 | 10 | 18 | 39 | 54 | 71 |
| Ironwatch | 68.797 | 69.123 | 78.361 | 2 | 15 | 25 | 46 | 62 | 83 |
| South-West Holding Tower | 68.476 | 70.725 | 83.259 | 1 | 9 | 15 | 31 | 45 | 60 |
| Deed Camp West-South | 68.029 | 68.264 | 74.813 | 6 | 20 | 30 | 50 | 59 | 74 |
| West Support | 68.007 | 68.348 | 75.611 | 6 | 24 | 38 | 73 | 89 | 100 |

The complete nearest-neighbor arrays and tightest IDs are in `benchmark-results/map/core-v2-phase-a1/spacing-analysis.json`.

## Performance

Each profile is three 3.2-second actual-renderer samples at normal zoom with runtime labels and representative marches.

| Profile | Avg FPS | Sample range | Avg p95 frame | Max frame | Long tasks |
|---|---:|---:|---:|---:|---:|
| 55-city Tower reservation | 30.770 | 29.367–32.669 | 41.733 ms | 55.6 ms | 0 |
| 60-city Crown Citadel | 25.164 | 24.313–26.228 | 55.500 ms | 97.2 ms | 1 |
| 70-city Support | 30.066 | 29.315–31.561 | 46.300 ms | 55.5 ms | 0 |

The 70-city map does not introduce a density cliff: it matches the 55-city sample and outperforms the 60-city Citadel/objective sample in this browser capture surface. The Citadel is the watch item, not city count; the one observed long task did not repeat in the other two samples. Authoritative Phase 1/2 gates remain the regression decision rather than this side-pane capture cadence.

## Scope and artifacts

- Runtime fixture: `tools/core-v2-phase-a1/` (loopback-only, development-only).
- Measurements and screenshots: `benchmark-results/map/core-v2-phase-a1/`.
- Production sources are served read-only and altered only in memory to inject the fixture; no production runtime, Firebase, topology, city, spawn, or artwork file is modified.
- Exact capacities remain 60 / 60 / 55 / 60 / 70. The permanent 25-map Core and 1,480-city specification are unchanged.
- No remaining Core map was generated, no region was activated, and nothing was deployed, merged, committed, or pushed.

## Approval recommendation

Approve the five-map slice and allow the remaining 20 maps to proceed only in the next explicitly approved phase, using the 68 px hard Core floor, 70 px preferred target, and the locked objective-prop rulebook. Phase A.1 itself does not generate those maps.
