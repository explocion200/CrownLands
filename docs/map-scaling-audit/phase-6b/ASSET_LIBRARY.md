# Phase 6B modular asset library

Phase 6B converts the approved Phase 6A directional slices into a deterministic, reusable raster library. It is a production-quality candidate, but it is deliberately stored under the development-only benchmark tree and is not referenced by the live client, Firebase Functions, or production world data.

## Locked source

The four approved Phase 6A v3 directional maps remain the art source of truth. Their hashes are recorded in `asset-manifest.json`. Barrier, road, vegetation, rock, farmland, and hill modules are deterministic raster derivatives of those masters. Four opaque open-ground foundations and two optional pond sources were created for Phase 6B using the corresponding approved master as the edit target; the final prompts preserved camera, lighting, texture scale, palette, and Crownlands painterly finish while removing map-specific objects.

## Exact inventory

| Family | Count |
| --- | ---: |
| Opaque directional foundations | 4 |
| Boundary-touching perimeter barrier segments | 32 |
| Cardinal road-opening modules | 16 |
| Mixed edge variants | 8 |
| Interior accents | 26 |
| **Total raster assets** | **86** |

Interior accents include 4 farmland, 4 rock, 4 low-hill, 4 woodland/temperate vegetation, 2 winter vegetation, 2 tropical vegetation, 2 dry vegetation, 2 subtle ground accents, and 2 optional water features.

Directional coverage is West 22, North 21, East 22, and South 21 assets. West and East have one optional light-water module each; water is intentionally absent from North and South in this first library because it is not needed to establish those locked themes.

## Edge and road contract

Each theme supplies eight barrier segments: two segments on each cardinal side. The outer alpha edge remains fully opaque and sits on source pixel 0 or the final pixel of the 1448×1086 image. Only inward and overlap seams are feathered. This makes a floating barrier impossible when the modules are placed at their manifest anchors.

Each theme also supplies one North, East, South, and West road-opening module. The road opening reaches the literal image boundary and overlaps adjacent barrier segments. No OPEN/GATED state is baked into these modules.

## Gate support

`gate-support.json` records the exact four edge anchors and references the existing provisional Gate overlay. OPEN continues to show a runtime arrow, while GATED shows the runtime Gate treatment. The clean map background remains immutable in both states.

## Transparency model

Foundations are opaque RGB PNGs. Extracted raster modules are RGBA ground patches with deterministic feather masks. They do not depend on fragile subject cutouts or chroma-key edges; each module carries a small amount of matching terrain under the feature, which keeps reuse painterly and stable.
