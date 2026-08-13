# Pass 4A Regional World Map Production Specifications

These specifications extend `docs/CROWNLANDS_ART_BIBLE.md`. The authoritative edge positions come from `assets/worlds/world_01/regions/*.json`; they must not be inferred from the old paintings.

## Shared World Standard

- Use case: historical-scene.
- Asset type: Crownlands regional strategy-game background.
- Final source/runtime size: 1448x1086 opaque WebP, 4:3.
- Camera: the same high, slightly oblique strategy-map viewpoint on every region; no horizon and no isometric board edge.
- Scale: roads, fields, bridges, woodland, ridges, and human traces remain consistent between maps. Runtime city, Camp, Stronghold, and Citadel assets must read clearly over the terrain.
- Lighting: soft hazy daylight from the upper left, lightly overcast, realistic ambient shadows, restrained atmospheric depth.
- Palette: muted earth, ochre, moss, olive, straw, weathered gray, charcoal rock, soil brown, gray-green water, faded grass.
- Terrain: inhabited late-medieval countryside shaped by farming, grazing, drainage, forestry, roads, bridges, mills, fences, carts, and labor.
- Roads: muddy, rutted, irregular, naturally branching inside a region. Exactly one road reaches each declared open edge and no road reaches a closed edge.
- Open edge: a natural road, valley path, bridge approach, or forest route continues beyond the frame at the documented normalized coordinate.
- Closed edge: dense woodland, rocky ridge, marsh, steep slope, or other believable terrain blocks travel without a dark artificial vignette.
- Gameplay safe space: keep terrain texture quieter around runtime object coordinates without making circles, plazas, pads, foundations, campsites, or perfect clearings.
- No baked UI, text, labels, arrows, borders, cities, castles, camps, strongholds, Citadel, marker rings, smoke frame, magical effects, turquoise water, fantasy peaks, or giant monuments.
- The old map is an edit/composition reference only. Repaint its old fantasy-arena treatment completely while preserving the declared edge routes and broad gameplay breathing room.

## Regional Specifications

### Crownlands Heart (`center`)

- File: `assets/worlds/world_01/maps/center-crownlands-heart-1783019616021.webp`.
- Role: cultivated political and agricultural core, prosperous but not urbanized.
- Terrain: rolling managed lowland, strip fields, orchards, pasture, drainage, hedges, small streams, roadside activity.
- Roads: four practical trunk roads meeting through irregular rural junctions.
- Open exits: north x 0.509; east y 0.486; south x 0.496; west y 0.458.
- Closed exits: none.
- Avoid: central stone circle, Citadel foundation, perfect radial road wheel, city skyline.

### West Marches (`west`)

- File: `assets/worlds/world_01/maps/west-west-2-1783019399438.webp`.
- Role: rough western endgame march guarding river and upland approaches.
- Terrain: grazed valley, rocky western/northern ridges, managed woodland, rain-dark soil, narrow river with modest bridge or ford.
- Open exit: east y 0.480.
- Closed exits: north, south, west blocked by ridge and thick woodland.
- Avoid: square objective foundation and empty lawn.

### East Reach (`east`)

- File: `assets/worlds/world_01/maps/east-east-4-1783020191215.webp`.
- Role: prosperous eastern trade countryside and grain route.
- Terrain: broad fields, orchards, low wooded ridges, gray-green stream, cart pull-offs and hedges.
- Open exit: west y 0.487.
- Closed exits: north, east, south blocked by wooded slopes and wet ground.
- Avoid: objective square and bright yellow monoculture.

### North Frontier (`north`)

- File: `assets/worlds/world_01/maps/north-north-1-1783019201680.webp`.
- Role: colder fortified frontier valley without snow-fantasy treatment.
- Terrain: stony upland grass, conifer and mixed woodland, exposed gray rock, sparse pasture, charcoal burns or logging traces.
- Open exit: south x 0.497.
- Closed exits: north, east, west blocked by believable rocky highland and dense woodland.
- Avoid: symmetrical mountain bowl, snow wall, decorative fantasy spikes.

### Southfields (`south`)

- File: `assets/worlds/world_01/maps/south-south-5-1783020401484.webp`.
- Role: productive transition from royal core to southern road network.
- Terrain: pasture, grain strips, hedges, orchards, shallow drainage, modest mill stream.
- Open exits: north x 0.400; south x 0.513.
- Closed exits: east and west blocked by woodland belts and wet slopes.
- Avoid: central objective square and uniform grass.

### Graywood Hollow (`region_6`)

- File: `assets/worlds/world_01/maps/region_6-6-1783021585258.webp`.
- Role: wooded midgame hollow shaped by forestry and charcoal work.
- Terrain: dense mixed forest, coppiced sections, logging clearings, damp ground, small creek, scattered pasture.
- Open exits: east y 0.170; south x 0.442.
- Closed exits: north and west blocked by deep forest and rocky slope.
- Avoid: two roads reaching one edge or empty central arena.

### Greenrook Vale (`region_7`)

- File: `assets/worlds/world_01/maps/region_7-7-1783022207943.webp`.
- Role: green river vale with managed woodland and modest farming.
- Terrain: gray-green brook, timber bridges, pasture, orchards, coppice, damp meadow.
- Open exits: west y 0.424; east y 0.442; south x 0.466.
- Closed exit: north blocked by wooded rise.
- Avoid: bright glossy water and perfect crossroads.

### Lowroad Vale (`region_8`)

- File: `assets/worlds/world_01/maps/region_8-8-1783022783978.webp`.
- Role: central midgame road junction and starter-capable cultivated vale.
- Terrain: broad worn low road, mixed farms, hay meadows, hedges, shallow stream, quiet woodland edges.
- Open exits: north x 0.520; east y 0.474; south x 0.500; west y 0.467.
- Closed exits: none.
- Avoid: perfect radial junction, giant clearing, or visual clutter under dense city coordinates.

### Stonebrook Farms (`region_9`)

- File: `assets/worlds/world_01/maps/region_9-9-1783023202200.webp`.
- Role: worked agricultural district organized around a stony brook.
- Terrain: strip fields, fences, pasture, orchard, drainage channels, gray stone bridge and ford.
- Open exits: west y 0.325; east y 0.441; south x 0.541.
- Closed exit: north blocked by dense managed woodland.
- Avoid: decorative stone ring and mirror-symmetric rivers.

### Goldmere Plains (`region_10`)

- File: `assets/worlds/world_01/maps/region_10-10-1783023599661.webp`.
- Role: wealthy grain and trade plain; wealth shown by cultivation, not gold terrain.
- Terrain: straw fields, grazing, wagons, wind or water mill where plausible, hedges, low rocky margins.
- Open exits: west y 0.416; south x 0.450.
- Closed exits: north and east blocked by wooded ridge and marshy drainage.
- Avoid: literal gold color cast, coin-shaped fields, objective circle.

### Bandit Wastes (`region_11`)

- File: `assets/worlds/world_01/maps/region_11-11-1783024323781.webp`.
- Role: harsh starter frontier degraded by poor soil and insecurity, but not post-apocalyptic.
- Terrain: scrub, eroded tracks, rough grazing, abandoned field edges, thorn, exposed soil, scattered working holdings.
- Open exits: north x 0.439; east y 0.528.
- Closed exits: south and west blocked by broken ridge and dense thorn woodland.
- Avoid: desert biome, ruins everywhere, orange wasteland filter.

### Ironfall Hills (`region_12`)

- File: `assets/worlds/world_01/maps/region_12-12-1783024478267.webp`.
- Role: mineral-bearing starter uplands with practical quarry and charcoal traces.
- Terrain: rounded stony hills, gray outcrops, scrub, pasture, coppice, small quarry scars, muddy cart routes.
- Open exits: north x 0.504; east y 0.437; west y 0.425.
- Closed exit: south blocked by steep rocky ridge.
- Avoid: giant mine, lava, fantasy cliffs, metallic landscape.

### Redbanner Fields (`region_13`)

- File: `assets/worlds/world_01/maps/region_13-13-1783024786859.webp`.
- Role: open starter farming country and mustering landscape.
- Terrain: grain strips, pasture, hedges, worn military/trade road, small burgundy cloth way banner used sparingly.
- Open exits: north x 0.493; east y 0.467; west y 0.461.
- Closed exit: south blocked by wooded low ridge.
- Avoid: red terrain filter, battlefield debris, giant banners, objective plaza.

### Ashenfen March (`region_14`)

- File: `assets/worlds/world_01/maps/region_14-14-1783024960400.webp`.
- Role: wet starter march crossed by maintained causeways.
- Terrain: gray-green fen water, reeds, muddy banks, raised pasture, willow/alder, timber causeways and drainage.
- Open exits: north x 0.523; east y 0.410; west y 0.411.
- Closed exit: south blocked by deep marsh and dense wet woodland.
- Avoid: magical swamp glow, blue haze, roads disappearing into closed south edge.

### Relic Vale (`region_15`)

- File: `assets/worlds/world_01/maps/region_15-15-1783025218871.webp`.
- Role: secluded starter vale with subtle historical/religious land use.
- Terrain: wooded valley, pasture, old boundary stones, modest roadside shrine away from runtime markers, narrow gray-green brook.
- Open exits: north x 0.473; west y 0.499.
- Closed exits: east and south blocked by wooded slopes.
- Avoid: glowing relic, ritual ring, magical sacred light, monumental ruins.

## Transition Mist

- File: `assets/map-transition-clouds.png`.
- Source canvas: 1254x1254 RGBA; runtime derivative remains 448x448 RGBA WebP.
- Natural low cloud and thin valley mist with irregular translucent edges and open transparent gaps.
- Soft gray, ivory, and faint green-gray only; no spiral, particles, magical glow, lightning, text, or decorative ring.
- It must support a fast sub-second regional transition and keep enough transparency to reveal physical map movement.
