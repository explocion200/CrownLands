# Phase 6B ImageGen source record

The built-in ImageGen tool was used in edit mode. No CLI/API fallback and no model-native transparency were used. Each output was copied into the project before composition.

## Foundation prompt template

The following template was applied separately to the approved West, North, East, and South Phase 6A masters, with the bracketed directional language replaced by the corresponding locked profile:

> Use case: stylized-concept. Asset type: opaque reusable Crownlands player-region base terrain foundation. Transform the approved [DIRECTION / THEME] map into a seamless open-ground foundation plate for modular map composition. Image 1 is the locked edit target and exact style source of truth. Preserve Image 1's painterly grounded medieval strategy-game terrain, camera angle, texture scale, lighting, regional character, and restrained realism exactly. Create edge-to-edge open regional ground with subtle natural variation only; mostly quiet readable playable terrain. Remove only the perimeter barrier, all four roads, rocks, vegetation, fields, landmarks, and distinct props. Keep the same world, palette, camera, lighting, and texture character. Opaque image; no text; no watermark. Avoid borders, roads, cities, objectives, buildings, tiling seams, busy decoration, and style drift.

Regional clauses were retained verbatim in intent:

- West: grassy temperate open ground.
- North: cold-temperate pale grass with subtle light-winter frost; not tundra.
- East: rich green tropical-frontier ground; not jungle.
- South: sun-baked earth and sparse dry grass; not sand-dune desert.

Saved project sources:

- `tools/map-scaling-phase-6b/source/foundations/west-grassy.png`
- `tools/map-scaling-phase-6b/source/foundations/north-light-winter.png`
- `tools/map-scaling-phase-6b/source/foundations/east-tropical.png`
- `tools/map-scaling-phase-6b/source/foundations/south-dry-frontier.png`

## Optional pond prompts

West:

> Use case: precise-object-edit. Asset type: opaque feather-ready Crownlands interior terrain accent source. Add one small shallow natural meadow pond centered in the image, occupying about 18% of image width and 12% of image height, with a restrained irregular shoreline and a few sparse reeds. Image 1 is the locked West grassy foundation and exact style source. Change only the small central pond area; preserve all surrounding ground, painterly camera, lighting, palette, texture scale, and Crownlands art language. No road, border, structures, text, or watermark. Keep most of the image open ground so the center can be cropped as a reusable patch. Avoid a large lake, river, waterfall, bright fantasy water, dense plants, bridge, props, city, building, and style drift.

East:

> Use case: precise-object-edit. Asset type: opaque feather-ready Crownlands interior terrain accent source. Add one small shallow tropical-frontier pond centered in the image, occupying about 18% of image width and 12% of image height, with a restrained irregular shoreline and only a few sparse low lush plants. Image 1 is the locked East tropical foundation and exact style source. Change only the small central pond area; preserve all surrounding ground, painterly camera, lighting, palette, texture scale, and Crownlands art language. Keep the pond grounded and readable, not jungle. No road, border, structures, text, or watermark. Keep most of the image open ground so the center can be cropped as a reusable patch. Avoid a large lake, river, waterfall, bright fantasy water, dense rainforest, oversized palms, bridge, props, city, building, and style drift.

Saved project sources:

- `tools/map-scaling-phase-6b/source/water/west-meadow-pond.png`
- `tools/map-scaling-phase-6b/source/water/east-tropical-pond.png`
