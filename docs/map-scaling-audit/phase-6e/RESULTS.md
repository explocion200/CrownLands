# Phase 6E Results

## Scale and allocation

- Maps: 10,000
- Highest layer: 48
- Complete layers: 1–47
- Layer 48: 224/400 maps; last allocation `(27, 50)`, clockwise slot 223
- North: 2,592
- East: 2,496
- South: 2,515
- West: 2,397

## Exactness and similarity

- Duplicate composition plans: 0
- Duplicate raw rasters: 0
- Duplicate WebPs: 0
- Duplicate city layouts: 0
- Duplicate complete packages: 0
- Pairs `>= 0.965`: 65,106 of 12,504,657 (0.5207%)
- Pairs `> 0.98`: 7,046 (0.0563%)
- Pairs `> 0.99`: 733 (0.0059%)
- Highest similarity: 0.999634 (`region-4707` / `region-8603`, West)
- Maps in a flagged pair: 9,844 (98.44%)
- Nearest-neighbor similarity: median 0.982, p95 0.993, p99 0.997

Compared with Phase 6D, the near-pair rate increased 3.62% and the high-pair rate increased 5.35%. The large rise in flagged-map participation is expected from the tenfold candidate pool, but the gallery confirms that the highest pairs are recognizably similar rather than metric-only false positives.

## Macro usage

- Foundations: all 12 used; most-used plate 894 times (8.94%)
- Foundation/transform presentations: all 48 used; maximum 247 times (2.47%)
- Full perimeter combinations: 64; maximum 201 times (2.01%)
- Corner signatures: 64; maximum 699 of 40,000 corner presentations
- Road geometries: all 9 used
- Shared baseline road: 3,293 maps (32.93%)
- Accent sets: 100; maximum 203 times (2.03%)
- Accent placement plans: 10,000 unique

Road reuse is the dominant failure signal: 64,759 of 65,106 flagged pairs share a road geometry, and every top-ten pair shares its foundation plate, perimeter combination, and road geometry. Visual review finds foundation and perimeter variety acceptable in the full random gallery, while the repeated road skeleton remains conspicuous.

## Cities and reliability

- Total cities: 400,000 unique IDs
- Exactly 40 cities per map: pass
- Exactly four starting candidates per map: pass
- Unique city layouts: 10,000
- Minimum spacing: 112 px
- Average local density: 5.532 neighbors within 240 px
- Candidate positions evaluated: 8,354,496
- Candidate positions rejected: 7,954,496
- Maps requiring retries: 0
- Total retries: 0
- Failures: 0

## Neighbors and transitions

- Cardinal neighbor pairs tested: 19,788
- Reciprocal topology: pass
- Road sockets: pass
- Perimeter compatibility: pass
- Direction-transition pairs: 376
- North↔East 96 px bands: 95/95 pass
- North↔West 96 px bands: 93/93 pass
- East↔South pairs: 95, identity/cohesion pass
- South↔West pairs: 93, identity/cohesion pass

## Performance and storage

- Per-map generation: average 2.343 s, median 2.330 s, p95 2.617 s, p99 2.799 s, max 3.643 s
- Effective throughput: 3.247 maps/s across eight workers
- Allocation: 178.832 s
- Plan/city wall time: 89.838 s
- Raster wall time: 2,989.692 s
- Total benchmark: 3,316.880 s (55m 16.9s)
- Approximate generation-process peak: 2.23 GiB
- Observed render process-tree working set during the run: approximately 1.93 GiB; this is a live observation, not an instrumented absolute peak
- WebP average: 289,488 bytes; p95 374,155; max 403,688
- Map WebPs: 2,894,884,338 bytes
- Thumbnails: 180,828,368 bytes
- Runtime maps + thumbnails: 3,075,712,706 bytes (2.86 GiB)
- Projected runtime storage at 100,000 maps: 30,757,127,060 bytes (28.64 GiB)
- Compact manifest: 105,794,930 bytes
- QA gallery: 15,681,041 bytes
- Complete retained development evidence at analysis: 3.20 GiB
