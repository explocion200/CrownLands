# Phase 4 fixture results

All results are development-only. Timings are local single-machine observations and are not production service-level objectives.

| Fixture | Result | NPC cities | Starting candidates | Evaluated / rejected | Deterministic hash |
| --- | --- | ---: | ---: | ---: | --- |
| Open | STANDBY | 40 | 4 | 668 / 628 | `9f34e7f1fdb1` |
| Forest-heavy | STANDBY | 40 | 4 | 2,108 / 2,068 | `00db39d51b1b` |
| Mountain-heavy | STANDBY | 40 | 4 | 1,365 / 1,325 | `2ce2f1e6e69c` |
| Road-heavy | STANDBY | 40 | 4 | 3,315 / 3,275 | `06010c3c8775` |
| Constrained invalid | ROLLED_BACK | 5 | 2 | 12,000 / 11,995 | `53965c73c0a4` |

The invalid map failed the exact-40 capacity requirement. It produced no publishable definition or catalog entry.

The complete development Layer 1 created 24/24 standby maps with exactly 960 total NPC cities: 40 per region. Every map produced four starting candidates. Its deterministic layer hash is `87c56230d2eaeee1b8f185f32b0472c16d92443a26ca14ec376e28e251b5892f`. All open connections were reciprocal, every missing outer neighbor remained gated, and the final region reopened the closing edge to the first region.

One measured complete-layer v2 run took 252.21 ms total: 10.08 ms per map on average, 5.53 ms minimum, and 22.58 ms maximum. It evaluated 93,389 candidate positions and rejected 92,429. The observed process-heap delta was approximately 4.84 MiB; garbage collection makes that number approximate.
