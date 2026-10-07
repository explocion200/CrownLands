# Estate artwork sources

The cohesive October 6 revision uses the built-in image_gen.imagegen tool and the user's uploaded atlas illustration, retained as reference-style.png. Its thin brown outlines, matte painted shading, olive grass, ochre timber, warm pale stone and burgundy details guide every scene layer. Character animation is deferred.

- terrain-cohesive-v2.png: selected 1448 × 1086 opaque ground painting. Terrain, curved worn roads, walls, decorative cottages and gardens are painted together. Runtime terrain.webp retains the normal regional-map dimensions, WebP quality 85. Layout corrections align the painting with the fixed site reservations.
- buildings-cohesive-v2.png: untouched transparent building atlas. The generator spaced its twenty buildings organically, so reviewed extraction bounds preserve whole towers, sails and yards. Each raw atlas pixel represents .30 logical-map pixels. Extraction and a uniform .60 delivery resize produce 2× images; their natural dimensions, recorded in sprite-sizes.json, are rendered at half delivery size. A lodge is not enlarged to the size of a keep.
- gatehouse-connectors-v2.png: transparent edit adding short masonry wings to connect the Gatehouse to the painted wall. Its original 59px logical height is retained; the towers and arch are not stretched.
- plots-cohesive-v2.png: two transparent painted state images, a surveyed rope/stake plot and an unfinished foundation/scaffold site. Runtime derivatives are 288 × 172; their ground boundary follows the reserved plot size.
- layout-guide.svg / layout-guide.png: development placement guide derived from the registry, road graph and cottage reservations. It guides painting and is not runtime scene art.

[build-estate-art.js](../../../tools/build-estate-art.js) performs only extraction, transparent trimming, resizing, WebP encoding and provenance recording with Sharp. It does not paint or generate raster artwork. Use the bundled Node dependency path for Sharp when running this development utility; no runtime dependency was added. [create-estate-layout-guide.js](../../../tools/create-estate-layout-guide.js) regenerates the reference SVG, which can be rasterized with Sharp.

[cohesive-v2-prompts.json](./cohesive-v2-prompts.json) retains the prompt set, including placement corrections and the Gatehouse edit. art-record.json records hashes and dimensions for all runtime art and source inputs; textual hashes use canonical UTF-8/LF. Runtime assets live under assets/inner-city-estate/ and load on estate entry, outside installation precaching. Source masters, references, prompts, utilities and review controls stay out of the production client.

The original terrain.png, buildings.png, actors.png, windmill-body.png and prompts.json remain archived as draft sources. Their actor atlas, SVG placeholders, geometric walls/roads and separate rotating sails are no longer used by the estate renderer.
