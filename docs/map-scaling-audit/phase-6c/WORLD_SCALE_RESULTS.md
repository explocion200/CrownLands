# Phase 6C World-Scale Results

## Exact uniqueness

All 1,000 normalized composition plans, lossless raster encodings, WebPs, city layouts, and full package hashes are unique. Exact duplication is not the limiting factor.

The macro systems repeat heavily:

- 8 foundation presentations: four plates, each unmodified or horizontally flipped; the most common appears on 14.5% of all maps.
- 4 perimeter presentations: one fixed frame per theme; the North frame appears on 28% of all maps.
- 1 road geometry across all 1,000 maps.
- 4 road-art presentations, one per theme.
- 99 accent sets, but 1,000 unique accent placement plans.

## Near duplication

Of 125,377 same-theme pairs, 35,849 (28.593%) meet the 0.965 review threshold and 5,191 (4.140%) exceed 0.98. Every map appears in at least one flagged pair. The most similar pair scores 0.999471 visual similarity.

The gallery confirms that sparse accents create micro-variation, but the repeated foundation landmarks, edge silhouette, and central cross-road dominate recognition. The North family is most affected, with 20,202 flagged pairs; West is least affected, with 1,041.

## City generation

- Exactly 40 cities on every map
- Exactly four starting candidates on every map
- 40,000 globally unique generated city IDs
- 1,000 unique city-coordinate layouts
- Global minimum spacing: 112 pixels
- Average per-map minimum spacing: 112.233 pixels
- Average maximum pair distance: 1,230.032 pixels
- Average local density: 5.331 cities within 240 pixels
- Zero final map-generation failures
- 680 maps required at least one seed retry; 3,831 retries total
- No whole map was rejected for a visual/blocker conflict

The successful output is valid, but the 68% retry incidence and 123.154-second maximum per-map generation time create an offline-worker tail that should be bounded before production operations.

## Neighbor and transition results

All 1,925 cardinal neighbor pairs have aligned cardinal road anchors and compatible edge geometry. Complete Layer 1, complete Layer 2, 25-map sequential, and 100-map sequential galleries pass.

The four climate transitions remain recognizably Crownlands, but North/East and North/West are visually abrupt. Cross-theme average mean-color distance is 72.463 versus 0.580 within a theme. A deterministic narrow edge-band transition profile is recommended at those borders while preserving the primary theme selected by the locked classifier.

## Performance and storage

- Average generation: 5.916 seconds per map
- p95 generation: 15.001 seconds
- Maximum generation: 123.154 seconds
- Average map WebP: 344,381 bytes
- p95 map WebP: 406,357 bytes
- Maximum map WebP: 409,102 bytes
- Maps plus thumbnails for 1,000: 365,603,464 bytes (348.67 MiB)
- Complete development packages for 1,000: 417,645,274 bytes (398.30 MiB)
- Projected maps plus thumbnails for 10,000: 3.41 GiB
- Projected complete packages for 10,000: 3.89 GiB
- Eight-worker wall clock: 833.93 seconds
