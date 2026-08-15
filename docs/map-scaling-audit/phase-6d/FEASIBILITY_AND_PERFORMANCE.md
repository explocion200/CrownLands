# Phase 6D Feasibility and Performance

## Deterministic feasibility path

For each coordinate the generator builds six deterministic macro candidates. Before expensive city work it estimates usable capacity after map bounds, perimeter, cardinal transition corridors, and blockers. Feasible candidates are ranked deterministically. City selection uses a densely jittered candidate pool and a conflict graph at the locked 112 px minimum separation. The legacy generator remains a bounded fallback.

The retry limit is 30. A region that cannot meet every hard rule still fails closed and cannot become authoritative or active. Phase 6D does not weaken city count, spacing, blocker, road-transition, or bounds validation.

## Results

| Measure | Phase 6C | Phase 6D |
| --- | ---: | ---: |
| Maps requiring retry | 680 | 0 |
| Total retries | 3,831 | 0 |
| Final failures | 0 | 0 |
| Average time/map | 5.916 s | 2.468 s |
| p50 time/map | not recorded | 2.421 s |
| p95 time/map | 15.001 s | 3.036 s |
| Maximum time/map | 123.154 s | 4.382 s |

Average map WebP size was 293,474 bytes; p95 was 375,505 bytes and maximum was 401,428 bytes. Maps plus thumbnails project to 311,792,012 bytes (297.35 MiB) per 1,000 and 3,117,920,120 bytes (2.90 GiB) per 10,000. Complete development packages project to 3,703,924,630 bytes (3.45 GiB) per 10,000.
