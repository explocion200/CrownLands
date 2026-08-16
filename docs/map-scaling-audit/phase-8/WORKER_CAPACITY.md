# Worker capacity

The model uses the measured Phase 6D full-generation baseline: 2.468 seconds average, 3.036 seconds p95, and 4.382 seconds maximum. The Phase 8 pre-rendered package adapter averaged about 31 ms and does not replace the full-generation timing for capacity planning.

| Workers | Modeled maps/s | P95 drain for 10 maps | Approx. peak memory | CPU pressure | Contention |
| ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 0.41 | 30.4 s | 194 MiB | 45% | Low |
| 2 | 0.75 | 16.5 s | 387 MiB | 90% | Low |
| 4 | 1.17 | 10.5 s | 775 MiB | 100% | Moderate |
| 8 | 1.46 | 8.4 s | 1,549 MiB | 100% | High |

Recommended default: two workers with a serialized coordinate lease. Twenty-four rehearsal allocations produced 24 unique coordinates and no collisions. Four or eight workers add limited frontier value while materially increasing memory, CPU saturation, storage-write bursts, and lock contention.

Scale queue consumers only when the oldest job exceeds ten minutes. Do not use worker concurrency to create speculative production regions beyond the reviewed STANDBY target.
