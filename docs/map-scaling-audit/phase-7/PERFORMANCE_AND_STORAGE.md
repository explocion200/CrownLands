# Performance and storage

The authoritative machine-readable receipts are `benchmark-results/map/phase-7/phase-7-results.json` and `road-cache-benchmark.json`. Timings are development-workstation measurements, not service-level guarantees.

## 128-region integration simulation

- regions: 128
- complete layers: 1 and 2
- generation wrapper average: approximately 34 ms
- generation wrapper p95: approximately 41 ms
- immutable upload average: approximately 0.17 ms
- hash verification average: approximately 0.77 ms
- metadata publication average: approximately 0.009 ms
- activation average: approximately 1.78 ms
- total simulator throughput: approximately 25 regions/s
- approximate process RSS growth: 181 MB

The wrapper reuses already-rendered approved Phase 6F raster bytes. It does not replace the offline raster baseline: 2,767.874 ms average and 3,413.631 ms p95 per map.

## Road presentation cache

The benchmark precomputed all 36 combinations (nine geometries × four themes) with the exact approved masked color-transfer algorithm. Uncached presentation generation averaged about 202 ms per combination. Warm cache lookup was byte-identical. The full uncompressed in-memory cache used about 197 MiB.

Recommendation: use the bounded cache only inside server/admin generation workers. A production worker can reduce memory by storing compressed/precomputed presentation files in shared immutable storage or maintaining an LRU. Foundation-specific road-opening harmonization still occurs per map, so image quality and sockets do not change.

## Storage projection

Based on actual Phase 6F map plus thumbnail bytes and planning allowances of 36 KiB package metadata plus 6 KiB receipts/index per region:

| Regions | Runtime map+thumbnail | Complete immutable package projection |
| ---: | ---: | ---: |
| 1,000 | 0.277 GiB | 0.317 GiB |
| 10,000 | 2.765 GiB | 3.166 GiB |
| 100,000 | 27.655 GiB | 31.660 GiB |

No image quality, map dimensions, or art assets changed.
