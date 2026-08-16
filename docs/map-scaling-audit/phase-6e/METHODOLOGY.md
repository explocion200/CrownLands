# Phase 6E Methodology

## Deterministic world sample

The study extends the exact Phase 6D development world and season inputs. It allocates 10,000 regions in the approved clockwise order outside the permanent 5×5 Core. Layers 1–47 are complete. Layer 48 contains 224 of 400 coordinates, ending at clockwise slot 223 and coordinate `(27, 50)`.

Generation continues to use the Phase 6D composer and Phase 4 authoritative constraints:

- 1448×1086 map and 320×240 thumbnail
- exactly 40 cities and four starting candidates
- 112 px minimum spacing
- authoritative blockers, transition clearance, road clearance, and perimeter clearance
- one fixed socket per cardinal edge
- development-only `STANDBY` output
- bounded deterministic retry limit of 30

No generator threshold was weakened.

## Compact retention

Temporary composition plans are written into eight JSONL shards, rendered, and removed after successful analysis. Retained evidence consists of flat WebP and thumbnail directories, a compact manifest, compressed numeric visual features, nearest-neighbor records, receipts, and the sampled QA gallery. No redundant PNG or per-map JSON package tree is retained.

## Similarity

The analyzer evaluates all 12,504,657 same-theme pairs—no random pair sampling. It uses the same Phase 6D weighted metrics:

- 64-bit difference hash
- 64-bit perceptual DCT hash
- 64-bit average hash
- 16×12 structural similarity
- 16×12 RGB root-mean-square similarity

The matrix is processed in deterministic 96-row blocks. It retains counts, histograms, each map's exact same-theme nearest neighbor, and the 25 highest-similarity pairs rather than materializing all pair records.

Thresholds are unchanged at `>= 0.965` and `> 0.98`; Phase 6E also records `> 0.99`.

## Determinism

A deterministic 62-map subset covers early, middle, and late layers plus all four themes. It is regenerated independently and compared for composition plan, city definitions, city layout, raw raster, WebP, thumbnail, and complete package hash.

The first 1,000 inputs also reproduce the Phase 6D sample. In the 10,000-world context, 997/1,000 remain byte-identical; three boundary records receive newly available neighbor transition context and therefore change composition/raster hashes while retaining identical city layouts. Phase 7 planning must preserve immutable published packages rather than regenerate them when neighbors are later added.
