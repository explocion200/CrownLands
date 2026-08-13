# Phase 2 Before and After

## Focused Scenario C zoom trace

| Viewport | Metric | Before | After | Change |
|---|---|---:|---:|---:|
| Desktop | Zoom FPS | 17.7 | 106.5 | 6.00× |
| Desktop | p95 frame | 180.6 ms | 13.9 ms | −92.3% |
| Desktop | Style recalculation | 2,809.8 ms | 211.2 ms | −92.5% |
| Desktop | Layout | 56.2 ms | 3.9 ms | −93.0% |
| Desktop | Script | 469.5 ms | 726.8 ms | +54.8% raw; 29 vs 22 processed wheels |
| Desktop | Total mutations | 12,977 | 11,568 | −10.9% |
| Desktop | Class mutations | 3,851 | 496 | −87.1% |
| Mobile | Zoom FPS | 8.2 | 111.4 | 13.65× |
| Mobile | p95 frame | 229.2 ms | 14.0 ms | −93.9% |
| Mobile | Style recalculation | 2,414.9 ms | 175.5 ms | −92.7% |
| Mobile | Layout | 64.8 ms | 2.9 ms | −95.4% |
| Mobile | Script | 837.6 ms | 731.8 ms | −12.6%, while processing 31 vs 14 wheels |
| Mobile | Total mutations | 40,585 | 9,255 | −77.2% |
| Mobile | Class mutations | 17,262 | 480 | −97.2% |

Raw script duration is not normalized for input throughput or profiling overhead. Desktop processed 32% more wheel events after the fix; mobile processed 121% more. Style/layout and frame-time reductions are the decisive result.

## Full A–E matrix

Values are idle / pan / zoom FPS. “Before” is the verified Phase 1 after-optimization run; “after” is the fresh Phase 2 matrix.

| Scenario | Viewport | Before | After |
|---|---|---:|---:|
| A | Desktop | 115.0 / 141.5 / 79.4 | 124.5 / 142.7 / 128.7 |
| A | Mobile | 110.9 / 142.6 / 92.4 | 124.4 / 140.3 / 126.6 |
| B | Desktop | 79.4 / 140.0 / 23.3 | 115.9 / 142.3 / 117.6 |
| B | Mobile | 80.7 / 137.2 / 48.3 | 113.8 / 137.1 / 119.6 |
| C | Desktop | 34.6 / 134.5 / 6.3 | 82.4 / 125.5 / 111.2 |
| C | Mobile | 30.7 / 124.1 / 6.2 | 83.9 / 131.0 / 106.9 |
| D | Desktop | 115.1 / 138.5 / 42.0 | 131.6 / 140.1 / 129.8 |
| D | Mobile | 117.2 / 137.4 / 51.7 | 131.5 / 140.4 / 135.5 |
| E | Desktop | 66.0 / 138.5 / 9.4 | 122.5 / 141.7 / 124.4 |
| E | Mobile | 45.5 / 136.3 / 7.6 | 120.0 / 141.0 / 129.7 |

Machine evidence: [Phase 2 JSON](../../../benchmark-results/map/phase-2-after.json), [machine table](../../../benchmark-results/map/phase-2-after.md), [budget assessment](../../../benchmark-results/map/phase-2-budget-assessment.json), and [142-check decision](../../../benchmark-results/map/phase-2-decision.json).

## Capacity gate

The unchanged Scenario C zoom requirements are 15 FPS desktop and 10 FPS mobile. The full Phase 2 results are 111.2 and 106.9 FPS respectively. All 24 capacity checks and 281 regression checks pass.

## DOM and memory

LOD changes computed display only; they do not construct or destroy tier-specific subtrees.

| Scenario | Phase 1 total/map DOM | Phase 2 total/map DOM | Phase 2 heap desktop/mobile |
|---|---:|---:|---:|
| A | 1,707 / 1,100 | 1,707 / 1,100 | 6.1 / 8.2 MiB |
| B | 2,774 / 2,167 | 2,774 / 2,167 | 7.2 / 7.8 MiB |
| C | 4,276 / 3,669 | 4,276 / 3,669 | 8.5 / 10.0 MiB |
| D | 1,908 / 1,301 | 1,908 / 1,301 | 6.3 / 4.6 MiB |
| E | 3,008 / 2,401 | 3,008 / 2,401 | 5.5 / 6.2 MiB |

Scenario C remains below the nominal 16 MiB JS-heap budget. No prepared duplicate LOD trees exist.

## Realtime and network

Every completed profile ends with exactly 17 realtime listeners and zero duplicates, including after neighboring-region switch and return. The loopback benchmark recorded zero production-backend requests, no zoom polling, and no streamed coordinates. Browser request, transfer, asset-request, and image-memory budgets pass.

## Diagnostic limitations

The B and C mobile-landscape 4× CPU profiles exceeded their existing isolated 180-second watchdog and are recorded as unavailable. They are not assigned synthetic metrics and are not required primary Scenario C gates. All nominal A–E profiles, A/D/E control 4× profiles, regression assessment, and capacity assessment completed.
