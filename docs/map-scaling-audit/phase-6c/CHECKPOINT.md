# Phase 6C Approved Checkpoint

Phase 6C is an approved, completed, development-only benchmark of the unchanged Phase 6B 86-asset library. It generated 1,000 player-region packages without publishing or activating any region.

## Locked evidence

- Directional distribution: North 280, East 252, South 247, West 221.
- Zero exact duplicate composition plans, lossless rasters, WebPs, city layouts, or complete packages.
- 35,849 same-theme pairs met the `>= 0.965` visual-similarity review threshold.
- 5,191 pairs exceeded `0.98`; every map appeared in at least one flagged pair.
- Highest observed visual similarity: `0.999471`.
- The library provides only eight foundation presentations, four complete perimeter presentations, and one internal road geometry across all 1,000 maps.
- Interior accent variety is sufficient: 99 accent sets and 1,000 unique accent-placement plans at the approved restrained density.
- All 1,000 city layouts are unique, with exactly 40 cities and four starting candidates per map.
- Zero final generation failures; 680 maps required retries and 3,831 retries occurred in total.
- Generation time: 5.916 seconds average, 15.001 seconds p95, and 123.154 seconds maximum.
- Map WebP size: 344,381 bytes average, 406,357 bytes p95, and 409,102 bytes maximum.
- Maps plus thumbnails require 348.67 MiB per 1,000 maps and approximately 3.41 GiB per 10,000 maps.
- Complete development packages project to approximately 3.89 GiB per 10,000 maps.
- North/East and North/West boundaries require a smoother deterministic edge-band transition treatment.

## Approved interpretation

The Crownlands composer architecture is viable. The approved art style, open-map simplicity, readability, city placement, directional identities, and restrained interior accents remain correct.

Phase 6C is not an art-style failure. Its specific unresolved issue is macro repetition in foundations, perimeter frames, and internal road geometry.

The evidence-based next library target remains 118 assets:

- 8 additional foundations
- 16 additional edge/perimeter segments
- 8 additional internal-road modules
- 0 additional interior accents

No macro-variation assets are part of this checkpoint. They require a separately approved Phase 6D.

## Safety boundary

No production map, runtime, Firebase data, player spawn logic, city ownership, world topology, or active region changed. No Layer 1 player region was published. Nothing was deployed or merged.
