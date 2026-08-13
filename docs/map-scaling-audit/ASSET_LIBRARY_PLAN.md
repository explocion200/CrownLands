# Crownlands map asset library plan

Audit date: 2026-08-13

Status: design recommendation only.

## Recommendation

Use a hybrid library: a compact, versioned set of curated biome modules and handcrafted hero landmarks, assembled by a deterministic offline compositor into baked region rasters. This preserves Crownlands' illustrated style and current one-image runtime while avoiding a hand-painted full-map requirement for every expansion.

Do not ship a giant asset catalog to the client and do not switch the world to runtime procedural/vector rendering. The client should receive only the active region's baked image, static layout, and small nearby/overview derivatives.

## Current inventory and behavior

The 15 active gameplay maps are 1,448 × 1,086 WebPs totaling 8.51 MiB compressed. Individual maps are 444–677 KiB and fit the existing 750 KiB budget. The 15 420 × 315 thumbnails total 0.37 MiB. Decoded, one gameplay raster is about 6.0 MiB; all 15 maps plus thumbnails are about 97.5 MiB.

The runtime loads one active map and opportunistically decodes up to two graph neighbors after an idle delay. This is a good delivery model. The build retains editable source art and optimized/versioned runtime derivatives in the repository, but production excludes the editable sources. Existing optimized runtime art is about 2.29 MiB derived from approximately 71.80 MiB of source masters, demonstrating why source and delivery tiers must remain separate.

## Delivery strategy comparison

| Strategy | Performance / runtime cost | Consistency and download | Complexity and ability to scale | Verdict |
|---|---|---|---|---|
| A. Fully baked, individually authored raster maps | Excellent runtime: one decoded image | Most handcrafted consistency, but complete files grow linearly and reuse is low | Simple client; high art effort/storage per map makes many regions slow to produce | Retain for hero/premium regions, not the only expansion system |
| B. Tile-based runtime map | Can fetch only visible tiles for very large maps, but increases requests, scheduling, seams, layers, and draw/composite work | Reusable tiles can reduce source size but repetition threatens the painted identity | Highest client/runtime complexity; arbitrary generation is possible but present region size gets little benefit | Not recommended at current 1,448 × 1,086 scale |
| C. Hybrid modular generation → baked WebP | Same excellent runtime profile as A after generation | Curated modules and review preserve identity; shipped output is one compact map | Generator/compositor costs are offline; reuse supports many regions and paint-over remains possible | Recommended |

A giant catalog of complete baked maps remains a useful supplemental strategy, while a fully procedural/vector runtime renderer is an even larger visual and technical departure than Option B and is not recommended.

## Library structure

Organize source assets by meaning and compatibility, not by individual region:

```text
map-library/
  palettes/
  biomes/
    grasslands/
      terrain/
      coast-and-water/
      roads-and-bridges/
      vegetation/
      settlements/
      decoration/
    desert/
    snow/
  landmarks/
    objectives/
    camps/
    portals/
    hero/
  atmospherics/
  masks-and-rules/
  manifests/
```

Each module manifest should include:

- Stable asset ID and semantic tags.
- Source dimensions, color space, alpha, anchor, safe overlap, and bleed.
- Compatible biome/palette versions and allowed rotations/scales.
- Gameplay exclusion/occlusion mask where relevant.
- License/provenance and author.
- Source hash, pipeline version, and approved runtime derivatives.
- Rarity/maximum-repeat rules so procedural maps do not look tiled.

Hero objectives such as a capital, citadel, or deed landmark remain handcrafted. The generator reserves their footprint and composes ordinary terrain around them.

## Required modular asset set

| Family | Initial modules |
|---|---|
| Base terrain | Grassland, farmland, forest floor, swamp, hills, mountain/rocky ground, riverbank, coastline, clear/open city ground |
| Roads | Straight, gentle/tight curve, T/Y/cross junction, city approach, edge exit, bridge approach, ford, causeway, worn path |
| Water | River straights/curves/junctions, stream, lake interior/edge, shoreline/coast transitions, marsh water, bridge/ford masks |
| Environment | Woodland clusters, individual trees, farm plots/rows, hedges, fences/gates, rocks/boulders, reeds, hay/carts, dirt paths, ruins and small non-interactive props |
| Elevation/blockers | Mountain ridges, cliffs, rocky rises, impassable forest/swamp variants, matching route mask and no-city mask pieces |
| Regional identity | Agricultural, woodland, frontier, hill-country, marshland, trade-corridor palettes and decoration rules |
| Interactive landmark sockets | City clearings, gold/troop/item/deed camp clearings, resource Stronghold footprints, Crown Citadel footprint, objective approach zones; the interactive art itself remains runtime/data-driven |
| Connections | North/south/east/west open-edge compositions, closed-edge compositions, road continuation/bleed, arrow-safe area, reciprocal seam metadata |
| Atmosphere | Clouds/haze, sunlight/shadow, water treatment, edge vignette, color grade, seasonal accents with strict repetition/contrast rules |
| Review/masks | Walkable, route-blocked, no-city, UI-safe, label-safe, landmark exclusion, water, and edge-zone masks plus diagnostic overlays |

## Source, generation, and runtime tiers

### Source tier

Keep lossless or high-quality masters, layered working files, masks, and metadata. These may be large and should not enter the site build, service worker, or runtime asset directory. If repository size becomes burdensome, move source masters to versioned object storage or an artifact system while retaining manifests/hashes in source control.

### Generation tier

Use normalized working derivatives—consistent color space, scale, bleed, alpha mode, and palette. The offline compositor consumes only pinned library versions. Generated intermediate layers and review overlays are retained as build artifacts, not shipped to players.

### Runtime tier

Publish immutable content-addressed outputs:

- Thumbnail: 420 × 315, WebP, target <= 35 KiB.
- Gameplay: 1,448 × 1,086, WebP and optionally AVIF, hard cap 750 KiB.
- Optional high resolution: 2,048 × 1,536, loaded only by explicit device/quality policy.
- Layout/metadata JSON separate from imagery.

Provide WebP as the universal baseline. AVIF may be negotiated when it materially improves size without degrading illustrated edges/textures or increasing decode cost on target mobile devices. Do not publish AVIF solely because it is newer; compare actual quality, transfer, and decode measurements.

## Why not tiles yet

The client displays one bounded region at a time and its current raster is only 1,448 × 1,086. A tile pyramid would add request scheduling, seam, cache, and fallback complexity without reducing the decoded footprint of a fully visible region. Continue with one gameplay raster per region.

Revisit tiling only if regions become several times larger, users pan across a continuous multi-region surface, high-resolution zoom exposes source detail, or real measurements show unacceptable full-image transfer/decode. At that point use immutable level/x/y URLs and a bounded visible-tile cache; do not combine a tile migration with the first dynamic-region migration.

## Composition rules for quality

- Use biome-specific density and clustering rules rather than uniform random stamping.
- Maintain edge bleed and palette normalization to prevent visible seams.
- Limit repetition by spatial cooldown and per-region maximum counts.
- Reserve negative space around interactive markers and labels.
- Render roads/bridges after terrain but before foreground decoration.
- Apply atmospherics consistently at the final composite stage.
- Keep gameplay masks and entity coordinates authoritative outside the raster.
- Generate low/medium/high-zoom review images at target desktop and mobile viewports.
- Allow a final non-destructive paint-over layer while preserving generated metadata and version history.

## Delivery and caching

The world catalog points to content-hashed layout/map/thumbnail URLs. Recommended policies:

- HTML and catalog pointer: network-first or short-lived with offline fallback.
- Versioned catalog and layouts: cache-first with revalidation; immutable by hash.
- Versioned map assets: immutable cache-first/CDN.
- Service-worker install cache: shell only, never all region imagery/layouts.
- Runtime region cache: explicit LRU/quota, pin active map, retain a small recent set, and evict old versions first.
- Neighbor warming: at most two, low priority, idle-only, respecting data saver, connection class, visibility, and memory policy.
- Picker thumbnails: virtualized and loaded only for visible/near-visible entries.

At 60 regions with current averages, compressed gameplay maps would total roughly 34 MiB, which is perfectly reasonable on a CDN but inappropriate for install precache or eager client loading. Decoded simultaneously, they would approach 360 MiB before thumbnails; bounded loading is mandatory.

## Budgets and gates

| Artifact/runtime cost | Target | Hard gate |
|---|---:|---:|
| Gameplay raster compressed | <= 650 KiB preferred | <= 750 KiB |
| Gameplay raster decoded | <= 8 MiB | <= 8 MiB unless explicitly approved |
| Thumbnail compressed | <= 30 KiB preferred | <= 35 KiB |
| Active + two neighbors decoded | <= 24 MiB | Device-policy fallback if exceeded |
| Lazy region layout compressed | <= 50 KiB | <= 100 KiB |
| 60-region catalog compressed | <= 30 KiB preferred | <= 50 KiB |
| Service-worker install precache | <= 2.5 MiB | <= 3 MiB |
| Initial region image requests | 1 gameplay map | Never all regions |

Budgets should be checked on the final encoded files and decoded dimensions. Add perceptual comparison against the approved reference so a size win cannot silently destroy texture readability.

## Naming and versioning

Identity and presentation must be separate:

- Stable asset/module ID is opaque and never renamed.
- Human slug/display name can change.
- Every source and derivative has a content hash.
- Module manifest has an explicit schema version and compatible compositor range.
- A region records its exact library, compositor, encoder, layout, and asset versions.
- Runtime URLs include content hashes; changing bytes creates a new URL.
- Old assets remain available through the maximum rollback/in-flight-order retention period.

Avoid overwriting a URL in place. It produces service-worker/CDN ambiguity and makes a catalog rollback visually inconsistent.

## Workflow and ownership

1. Artist adds or updates a source module and metadata.
2. Pipeline validates provenance, dimensions, alpha, masks, palette, and naming.
3. Review contact approves the module into a numbered library release.
4. Generator pins that release and produces a draft region.
5. Automated quality, size, topology, and viewport checks run.
6. Reviewer approves or edits/paints over the draft.
7. Pipeline publishes content-hashed runtime assets and diagnostics.
8. Region lifecycle can seed and move the approved artifact to standby.

Assign explicit owners for art quality, gameplay topology, pipeline/build integrity, and live activation. The generator must not make one person implicitly responsible for all four.

## Repository hygiene

Source-world maps and versioned runtime maps currently duplicate about 8.9 MB, with another duplicate thumbnail set around 391 KB. This is acceptable while small and production correctly excludes sources, but a 60-region library will amplify repository clone and CI costs. Keep manifests, compact editor inputs, and review metadata in Git; consider external versioned storage for large layered masters and generated intermediates. Runtime derivatives can remain in deploy artifacts/CDN rather than being duplicated across source and generated paths indefinitely.

## Adoption path

1. Formalize manifests and budgets around the current art; do not change visuals.
2. Extract a small grasslands/starter module set from existing approved sources.
3. Reconstruct one existing non-hero region and compare it visually/performance-wise.
4. Generate one new test region, allow editor correction, and measure reviewer effort.
5. Publish it through the standby lifecycle.
6. Add biomes and module variety only after repetition/seam metrics and player feedback are acceptable.

This sequence validates whether the hybrid library actually reduces map-production effort before committing the whole art pipeline.
