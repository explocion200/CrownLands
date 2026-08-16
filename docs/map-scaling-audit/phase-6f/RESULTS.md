# Phase 6F Results

## Scale and correctness

- Maps: 10,000 through partial Layer 48
- Themes: North 2,592; East 2,496; South 2,515; West 2,397
- Exact duplicate compositions, raw rasters, WebPs, city layouts, and packages: zero
- Cities: 400,000 unique IDs; 10,000 unique layouts
- Every map: exactly 40 cities and four starting candidates
- Minimum spacing: 112 px; average local density: 5.536
- Retries: zero; failures: zero
- Independent deterministic regeneration: 62/62 byte/hash identical
- Cardinal neighbor pairs: 19,788; transition pairs: 376
- Reciprocal topology, sockets, perimeters, OPEN/GATED targets, and transition bands: pass

## Visual comparison

| Measure | Phase 6E | Phase 6F | Change |
|---|---:|---:|---:|
| Pairs ≥ 0.965 | 65,106 | 32,767 | -49.671% |
| Pairs > 0.98 | 7,046 | 3,158 | -55.180% |
| Pairs > 0.99 | 733 | 341 | -53.479% |
| Highest similarity | 0.999634 | 0.999318 | improved |
| Maps in ≥0.965 pairs | 98.44% | 91.41% | improved |
| Baseline road share | 32.93% | 11.35% | -65.533% |

Phase 6F evaluates all 12,504,657 same-theme pairs. The Phase 6F rates are 0.2620% at ≥0.965, 0.0253% above 0.98, and 0.0027% above 0.99. Nearest-neighbor similarity averages 0.977 with p95 0.991 and p99 0.996.

## Performance and storage

- Average/p50/p95/p99/max: 2.868 / 2.781 / 3.515 / 4.669 / 7.152 seconds per map
- Effective throughput: 2.665 maps/second
- Total benchmark: 4,049.700 seconds (67m 29.7s)
- Approximate peak generation worker RSS: 2,662,285,312 bytes
- Approximate peak render process-tree RSS: 2,985,689,088 bytes
- Average/p95/max WebP: 279,434 / 356,015 / 402,720 bytes
- Runtime maps plus thumbnails: 2,969,427,340 bytes (2.765 GiB)
- Projected runtime storage for 100,000: 29,694,273,400 bytes (27.655 GiB)
- Compact manifest: 146,479,853 bytes
- Sampled QA gallery: 32,199,159 bytes

Masked road-skin transfer makes average generation 22.42% slower than Phase 6E, while average WebP size is 3.47% smaller. This remains acceptable for offline generation. Caching the 36 geometry/theme skin presentations is a production-planning optimization opportunity; correctness does not depend on it.
