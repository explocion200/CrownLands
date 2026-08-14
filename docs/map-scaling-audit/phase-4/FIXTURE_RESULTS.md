# Phase 4 fixture results

All results are development-only. Timings are local single-machine observations and are not production service-level objectives.

| Fixture | Result | NPC cities | Starting candidates | Evaluated / rejected | Deterministic hash |
| --- | --- | ---: | ---: | ---: | --- |
| Open | STANDBY | 32 | 4 | 282 / 250 | `6c5d16e91ab1` |
| Forest-heavy | STANDBY | 26 | 3 | 15,188 / 15,162 | `4fb858d37914` |
| Mountain-heavy | STANDBY | 24 | 4 | 826 / 802 | `86ecb81deb9a` |
| Road-heavy | STANDBY | 22 | 4 | 208 / 186 | `7eec7b286ee3` |
| Constrained invalid | ROLLED_BACK | 4 | 1 | 12,000 / 11,996 | `106f5ecf2ef0` |

The invalid map failed both the 15-city requirement and the two-starting-candidate requirement. It produced no publishable definition or catalog entry.

The complete development Layer 1 created 24/24 standby maps with 624 total NPC cities. Individual maps contained 22–32 cities and at least two starting candidates. Its deterministic layer hash is `fe7f059676c8f93b894e13451217db22d0e8175ff5921056b6c2c96b54fa577c`. All open connections were reciprocal, every missing outer neighbor remained gated, and the final region reopened the closing edge to the first region.

One measured complete-layer run took 132.16 ms total: 5.09 ms per map on average, 3.79 ms minimum, and 7.41 ms maximum. It evaluated 20,862 candidate positions and rejected 20,238. The observed process-heap delta was approximately 1.20 MiB; garbage collection makes that number approximate.
