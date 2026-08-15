# Phase 6D Repetition Results

## Direct comparison

| Measure | Phase 6C | Phase 6D | Change |
| --- | ---: | ---: | ---: |
| Pairs ≥ 0.965 | 35,849 | 630 | −98.24% |
| Pairs > 0.98 | 5,191 | 67 | −98.71% |
| Maps in a flagged pair | 1,000 | 570 | −43.0% |
| Highest similarity | 0.999471 | 0.997667 | improved |
| Foundation presentations | 8 | 1,000 deterministic / 48 plate-transform | expanded |
| Perimeter combinations | 4 | 64 | expanded |
| Road geometries | 1 | 9 | expanded |
| Exact final-map duplicates | 0 | 0 | preserved |

The analysis preserves the Phase 6C thresholds and combines perceptual, structural, low-resolution color, and composition-feature measures. It does not count random pixel noise as meaningful variety.

The top 25 Phase 6D pairs, before/after Phase 6C comparisons, repeated-foundation, repeated-edge, repeated-road, city-overlay, directional, transition, and sequential-run galleries are in `benchmark-results/map/phase-6d/study/gallery/`.

Among same-theme comparisons, maps sharing a foundation asset averaged 0.8790 visual similarity (p95 0.9431); maps sharing the same plate and transform averaged 0.8885 (p95 0.9529). Pairs sharing a complete perimeter combination averaged 0.9055 (p95 0.9646), while pairs sharing road geometry averaged 0.9093 (p95 0.9536). The 4,000 inspected corners produced 64 theme/corner/treatment signatures; the most common signature represented 2.0% of corners. These measures accompany the visual comparison galleries rather than relying on exact hashes alone.

Interior accent plans remained unique across the 1,000 maps without increasing the approved sparse density.
