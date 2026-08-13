# Crownlands Pass 3A Shared Visual Specification

This is the shared production direction used for the seven Pass 3A core world assets. It exists so the login background, five city stages, and Crown Citadel read as one Crownlands civilization rather than unrelated medieval illustrations.

## World Language

- Historical anchor: fictional 1350-1500 Western and Central European frontier kingdom.
- Core feeling: beautiful, prosperous, fragile, weathered, labor-intensive, inhabited.
- Lighting: soft natural daylight with light haze, warm but not cinematic, realistic ambient shadows.
- Weather: dry enough for readability, with damp earth, smoke haze, road wear, and light atmospheric softness.
- Palette: parchment, warm earth, ochre, rust, timber brown, charcoal, moss green, faded blue, burgundy, weathered gray, muted brass.
- Avoid: neon color, purple magic, polished fantasy gold, cinematic rim light, dragons, magical skies, battlefield carnage, grimdark ruin.

## Architecture

- Common materials: rough fieldstone, dressed stone on important structures, oak timber framing, wattle and daub, limewashed plaster, thatch, wood shingles, occasional clay roof tile, packed earth, straw, iron fittings, muted brass, cloth banners, leather, rope.
- Common wear: cracked plaster, rain staining, soot, repaired roofs, patched walls, crooked timber, worn roads, muddy cart tracks, faded dye, hand-painted banners.
- Crownlands shapes: strong stone foundations, steep practical roofs, small shuttered windows, chimneys, heavy oak gates, iron hardware, burgundy/faded-blue/ochre cloth accents.
- Important places get better masonry and restrained royal detailing. Ordinary places stay more timber, plaster, thatch, and earth.

## Map Asset Camera

- City stages and Crown Citadel: elevated strategy-game asset view, roughly 35-45 degree camera pitch, looking from south/southwest toward north/northeast.
- Perspective: readable map-token perspective, not orthographic elevation and not low-angle concept art.
- Ground treatment: transparent production assets with only a small integrated dirt/grass base and road approach where useful.
- Shadow treatment: soft contact shadow cast down/right, consistent across all city stages and the Citadel.
- Detail level: strong silhouettes first; small lived-in details second.
- Relative scale: each stage increases footprint, density, stone construction, and defensive complexity while preserving the same settlement DNA.

## City Progression DNA

- Recurring central road approach entering from the lower/front side.
- Recurring central hall/keep line: timber hall in Stage 1, improved hall/watch in Stage 2, stone keep in Stage 3, fortified civic/noble center in Stage 4, major civic/noble core in Stage 5.
- Recurring material progression: timber/palisade -> timber plus fieldstone -> stone keep plus partial walls -> full stone town wall -> dense fortified city.
- Recurring accents: restrained burgundy and faded blue cloth banners, not shiny gold.
- Human activity: smoke, carts, sheds, markets, workshops, woodpiles, storage yards, and roads imply labor without turning the tokens into busy miniatures.

## Login Background Composition

- Source master: 1448x1086 JPG.
- Composition: believable late-medieval Crownlands landscape with a fortified settlement, road, farmland, travelers/wagons, smoke, timber buildings, stone construction, banners, and working countryside.
- UI safe areas: no baked title/logo/text; keep important architecture away from the central login card and mobile-landscape control stack; allow clean readability at center and lower-center.
- Mood: inviting but contested, prosperous and fortified, not magical or apocalyptic.

## Transparency And Output

- City/Citadel generated as a shared sheet with a flat chroma-key background, then key-matted and cleaned into transparent PNG source masters.
- Source masters replace the existing authoritative runtime filenames.
- Optimized WebP derivatives are regenerated from source masters, not hand-created independently.
