# Phase 1 before/after results

Date: 2026-08-13

## Decision

The Phase 1 decision gate passes 216 checks. Scenario B now passes its existing
supported-load budget using three post-change nominal runs. Scenario C now
initializes reliably, but its zoom result remains below the existing C capacity
threshold; Phase 1 does not claim C is production-ready.

Machine-readable evidence:

- `benchmark-results/map/phase-1-profile-before.json`
- `benchmark-results/map/phase-1-profile-after.json`
- `benchmark-results/map/phase-1-after.json`
- `benchmark-results/map/phase-1-verification.json`
- `benchmark-results/map/phase-1-verification-a-desktop.json`
- `benchmark-results/map/phase-1-decision.json`

## Focused Scenario B profile

Both samples use the same 100-city / 50-march fixture and a 10-second desktop
idle window.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| FPS | 0.52 | 65.96 | 127x |
| Median frame time | 1,895.8 ms | 7.0 ms | -99.6% |
| p95 frame time | 2,222.2 ms | 69.3 ms | -96.9% |
| Long tasks | 6 | 0 | -100% |
| Script time | 13,400.6 ms | 1,042.6 ms | -92.2% |
| `renderHudStatusPanels()` average | 1,863.7 ms | 12.4 ms | -99.3% |
| `getCityStats()` calls | 62,640 | 1,980 | -96.8% |
| `getCityStats()` self time | 13,518.6 ms | 476.6 ms | -96.5% |
| `resolvePlayerIdentityForUid()` calls | 131,984 | 11,159 | -91.5% |
| `renderArmies()` average | 7.4 ms | 5.9 ms | improved |
| March tokens / route nodes | 50 / 100 | 50 / 100 | unchanged |
| Active listeners | 17 | 17 | unchanged |
| Browser requests / transfer | 64 / 5,849,434 B | 64 / 5,850,282 B | unchanged in practice |
| Used JS heap | 7.07 MiB | 5.70 MiB | -1.37 MiB |

The post-change profile executes far more frames and therefore accumulates more
style/layout sampling opportunities. The relevant result is that script no
longer monopolizes the main thread and no long task occurs in the sample.

## Nominal performance

A, B, and D are medians. B and D use three post-change runs. A desktop uses a
five-run median because its zoom long-task count crossed the threshold in a
noisy three-run set; A mobile uses three. C and E are the full isolated matrix
run because C is an initialization target and E is a secondary diagnostic.

FPS values are idle / pan / zoom.

| Scenario | Profile | Phase 0 | Phase 1 | Idle p95 | Ready | Result |
|---|---|---:|---:|---:|---:|---|
| A 50/25 | Desktop | 82.6 / 111.6 / 73.8 | 115.0 / 141.7 / 90.1 | 20.8 ms | 1.34 s | Pass regression floors |
| A 50/25 | Mobile | 80.1 / 112.7 / 58.9 | 110.9 / 142.4 / 93.1 | 14.1 ms | 1.59 s | Pass regression floors |
| B 100/50 | Desktop | 0.64 / 0.61 / 0.58 | 79.4 / 140.0 / 23.3 | 55.4 ms | 1.96 s | Pass capacity gate |
| B 100/50 | Mobile | 0.45 / 0.47 / 0.46 | 88.7 / 138.2 / 54.0 | 34.9 ms | 2.22 s | Pass capacity gate |
| C 150/100 | Desktop | unavailable | 34.6 / 134.5 / 6.3 | 97.2 ms | 2.67 s | Initializes; zoom gate red |
| C 150/100 | Mobile | unavailable | 30.7 / 124.1 / 6.2 | 76.3 ms | 2.09 s | Initializes; zoom gate red |
| D 100/0 | Desktop | 119.3 / 141.4 / 73.6 | 121.8 / 140.9 / 59.5 | 7.1 ms | 2.21 s | Pass regression floors |
| D 100/0 | Mobile | 119.6 / 132.1 / 71.4 | 117.2 / 137.4 / 59.3 | 7.2 ms | 2.32 s | Pass regression floors |
| E 50/100 | Desktop | 22.8 / 35.7 / 8.0 | 66.0 / 138.5 / 9.4 | 62.5 ms | 1.61 s | Pass regression floors; 2.9x idle |
| E 50/100 | Mobile | 11.8 / 21.5 / 2.5 | 45.5 / 136.3 / 7.6 | 55.6 ms | 1.61 s | Pass regression floors; 3.9x idle |

### Scenario B gate detail

| Profile | Existing minimum idle/pan/zoom | Phase 1 median | Idle p95 maximum / actual | Ready maximum / actual |
|---|---:|---:|---:|---:|
| Desktop | 30 / 30 / 20 | 79.4 / 140.0 / 23.3 | 100 / 55.4 ms | 15 / 1.96 s |
| Mobile | 24 / 24 / 15 | 88.7 / 138.2 / 54.0 | 150 / 34.9 ms | 15 / 2.22 s |

### Scenario C limitation

C clears its initialization, idle, pan, and idle-p95 requirements. It fails only
the current zoom FPS requirements: desktop 6.3 vs 15 and mobile 6.2 vs 10. The
remaining C zoom trace is dominated by style recalculation across the much
larger rendered surface. Broad map LOD/dynamic-region work was out of Phase 1
scope and was not started.

## Synthetic 4x CPU diagnostics

| Scenario | Phase 0 | Phase 1 | Status |
|---|---:|---:|---|
| A mobile 4x | 0.42 / 0.40 / 0.47 | 29.5 / 34.0 / 2.7 | Completed; large idle/pan recovery |
| B mobile 4x | 0.07 / 0.07 / 0.07 | unavailable | Full workflow exceeded 180 s |
| C mobile 4x | unavailable | unavailable | Full workflow exceeded 180 s |
| D mobile 4x | 13.2 / 12.4 / 1.6 | 18.8 / 12.1 / 1.8 | Completed |
| E mobile 4x | unavailable | 3.3 / 19.1 / 1.6 | Completed |

These are DevTools throttling diagnostics, not physical Android acceptance
results. No unavailable value is replaced with a synthetic number.

## DOM, realtime, network, and memory

- Scenario B remains 2,774 total DOM nodes, 2,167 map nodes, 50 march tokens,
  and 100 SVG route paths in the full matrix.
- All successful full profiles have exactly 17 active listeners, zero duplicate
  keys, and 17 listeners after the region-switch round trip.
- Every successful profile made zero production Firebase/Auth requests. Browser
  requests remain at or below 80 and encoded transfer below 8 MiB.
- Used JS heap remains below the 16 MiB nominal and 24 MiB throttled budgets.
  Scenario B's full run used 4.90 MiB; its repeat-run variation remained bounded
  and the production cache itself stores only one number.
- The decision validator passes all 216 Phase 1 checks without weakening a
  Phase 0 threshold.
