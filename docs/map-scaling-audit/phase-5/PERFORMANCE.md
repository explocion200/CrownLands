# Phase 5 generation performance

Measured locally with deterministic double-baking per package:

| Profile | Terrain plan | 40-city placement | Composition + two WebP bakes | Total | Approx. heap delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agricultural | 5.65 ms | 20.96 ms | 1,567.46 ms | 1,609.53 ms | -0.61 MiB |
| Woodland | 7.80 ms | 19.21 ms | 1,557.24 ms | 1,598.08 ms | -0.61 MiB |
| Rolling hills | 7.68 ms | 21.83 ms | 1,552.53 ms | 1,598.80 ms | 0.79 MiB |
| Wetland | 8.24 ms | 21.32 ms | 2,253.23 ms | 2,295.06 ms | 2.25 MiB |

Average complete package time was 1,775.37 ms; maximum was 2,295.06 ms. Four maps totaled 82,536 bytes and four thumbnails 10,904 bytes. Aggregate observed heap delta was approximately 1.81 MiB; garbage collection makes heap deltas approximate.

The 24-map topology fixture uses geometry/city generation without WebP baking. It raises only the offline candidate-evaluation ceiling to 400,000 so difficult deterministic seeds can find the 40th valid city without weakening separation, blocker, road, or transition rules.

Generation is offline/server-side and never part of client rendering. Current cost is dominated by spawning the Python encoder twice. A persistent worker/container can reduce overhead later; correctness and deterministic receipts take priority.
