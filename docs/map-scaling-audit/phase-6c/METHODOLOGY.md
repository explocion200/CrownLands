# Phase 6C Methodology

Phase 6C evaluates the approved Phase 6B library without modifying its 86 assets, its directional classifier, or the locked Phase 6A visual style. All generated packages are development-only, inactive, unpublished, and outside production manifests.

## World sample

- 1,000 clockwise player-region allocations outside the permanent 25-cell Core
- Complete Layer 1 (24 maps) and Layer 2 (32 maps)
- Partial expansion through Layer 14
- Locked dominant-axis classifier; exact diagonal ties remain North/South
- Distribution: North 280, East 252, South 247, West 221

Each package records its coordinate, layer, theme, deterministic artwork and city seeds, foundation and transform, eight barrier modules, four road-opening modules, four restrained accents, 40-city layout, four starting candidates, composition hashes, raster hashes, timing, and storage.

## Duplicate and similarity methods

Exact checks use normalized visual composition hashes, lossless PNG-equivalent hashes, WebP hashes, road geometry/presentation hashes, city-coordinate hashes, and complete package hashes. Region IDs and seed metadata are excluded from the normalized visual hash so they cannot create false uniqueness.

Near-duplicate analysis evaluates all 125,377 same-theme pairs with multiple deterministic signals:

- 64-bit difference hash
- 64-bit DCT perceptual hash
- 64-bit average hash
- 16×12 structural similarity
- 16×12 RGB root-mean-square similarity
- normalized composition-feature similarity

The development flag threshold is 0.965 combined visual similarity; 0.98 is reported separately as high similarity. These flags are review candidates, not claims that every pair is pixel-identical.

## City and neighbor measurements

City spacing is measured pairwise. Local density is the average number of other cities within 240 pixels. Cardinal-neighbor analysis covers all 1,925 neighbor pairs in the sample and separately measures the 103 cross-theme pairs. Road compatibility requires the same centered cardinal edge anchors and one opening per side.
