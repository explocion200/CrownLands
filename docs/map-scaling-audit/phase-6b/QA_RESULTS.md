# Phase 6B QA results

## Eight-map review set

| Sample | Direction | Cities | Starting candidates | Map WebP | City placement | Total composition |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| West A | grassy | 40 | 4 | 296.3 KiB | 1,127 ms | 4,438 ms |
| West B | grassy | 40 | 4 | 294.6 KiB | 307 ms | 3,604 ms |
| North A | light winter | 40 | 4 | 396.5 KiB | 574 ms | 4,043 ms |
| North B | light winter | 40 | 4 | 395.9 KiB | 531 ms | 4,052 ms |
| East A | tropical | 40 | 4 | 361.1 KiB | 487 ms | 3,868 ms |
| East B | tropical | 40 | 4 | 351.2 KiB | 3,827 ms | 7,123 ms |
| South A | dry frontier | 40 | 4 | 284.5 KiB | 2,412 ms | 5,620 ms |
| South B | dry frontier | 40 | 4 | 284.0 KiB | 1,530 ms | 4,730 ms |

The total time includes two complete raster passes. Every repeated clean PNG, map WebP, and thumbnail WebP matched byte-for-byte.

## Locked-style checks

Interior mean-color distance from the corresponding approved master ranged from 3.7 to 7.4 RGB units, well inside the 48-unit guardrail. Every plan used only assets from its directional family. QA-only current Castle, Gold Camp, Training Stronghold, and Crown Citadel overlays were rendered for all eight maps and remain absent from clean maps.

## Barrier and road checks

All 32 sample sides passed the literal outer-pixel contact test. The mean difference between the outermost barrier bands and the bare foundation ranged from 13.8 to 34.7, proving that the barrier—not an empty terrain margin—occupies the image boundary. Every map has exactly one road opening on each cardinal side.

## Readability and city checks

Each map uses four interior accents, matching the approved simple density. All 320 city IDs are unique. All 40 positions per map passed authoritative land, blocker, road, transition, and spacing validation. Four future starting-city candidates were identified per sample.

## Repeated-use checks

Directional A/B pairs share the same locked asset family but produce different plan, city, and raster hashes. Mean pairwise pixel differences were West 4.392, North 4.936, East 4.835, and South 3.733. The repeated barrier and road modules remain visually coherent; variation comes from foundation transform, accent selection, placement, scale, and city seed.

## Review artifacts

- `qa-clean-contact-sheet.png`: all eight clean maps.
- `qa-40-cities-contact-sheet.png`: all eight 40-city overlays.
- `qa-asset-library-contact-sheet.png`: representative library modules.
- Each sample contains four edge close-ups, four road-opening close-ups, a boundary-contact proof, a structure compatibility render, and a machine-readable QA receipt.
