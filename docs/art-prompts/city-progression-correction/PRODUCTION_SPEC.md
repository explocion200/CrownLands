# Crownlands City Progression Correction Production Spec

## Shared Contract

- Deliver exactly five isolated city stages in one coherent late-medieval Crownlands family.
- Use a consistent elevated three-quarter strategy-game camera, viewing direction, soft daylight, shadow direction, edge softness, masonry, timber, roof palette, heraldry, and road orientation.
- Architecture is grounded 14th-15th-century frontier construction: fieldstone, dressed stone, timber framing, limewashed plaster, oak, thatch, shingles, clay tile, iron fittings, and muted burgundy or faded-blue cloth.
- Show the same settlement developing from frontier holding to major fortified city. Increase height, density, defense, stone construction, prosperity, and authority at every stage.
- Keep the exterior silhouette compact and intentional. No exterior bushes, shrubs, detached trees, loose decorative terrain, scattered props, rectangular ground plates, or isolated alpha fragments.
- A short attached packed-earth road may cross the wall footprint at the gate. Work-yard details and limited vegetation may appear inside the defensive perimeter.
- No magic, glow, fantasy towers, perfect symmetry, modern objects, text, labels, level numbers, giant symbols, or atmospheric background.

## Stage Requirements

1. Stage 1: small timber hall, crude palisade, modest gate, sparse internal buildings.
2. Stage 2: stronger palisade and gate tower, more buildings, early stone, established work yard.
3. Stage 3: central stone keep, stronger wall system, towers, denser supporting settlement.
4. Stage 4: prosperous fortified town, substantial curtain walls, gatehouse, taller towers, civic hall, dense roofs.
5. Stage 5: unmistakable final city with layered fortifications, dominant elevated keep or administrative core, stronger gate complex, more towers and urban density. It must be taller and more substantial than Stage 4, not merely wider.

## Production Geometry

- Authoritative source: 768x768 RGBA PNG per stage.
- Visible source heights: 500, 555, 610, 645, and 750 pixels for Stages 1-5.
- Keep visible art centered horizontally and grounded 12 pixels above the bottom edge.
- Runtime derivative: fixed 256x256 transparent WebP canvas; transparent padding must not be trimmed.
- Existing runtime wrappers remain 66, 69, 72, 75, and 78 CSS pixels on desktop, and 61, 64, 67, 70, and 73 CSS pixels in compact landscape.

## Generation Record

The accepted source family was generated as a single five-stage horizontal chroma-key sheet using the approved Pass 3A city family as visual reference. Magenta was removed with the ImageGen chroma helper, each connected city was isolated, tiny alpha specks were removed, and all stages were normalized onto the fixed source canvases before installation.
