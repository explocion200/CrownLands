# Estate artwork sources

Created with the built-in `image_gen.imagegen` tool for the approved October 6, 2026 tiny-city estate. The user’s `inspiration art.png` established the fine umber outlines, subdued painted shading, olive terrain, ochre timber, pale stone and burgundy pennants. No external artist or game artwork was copied into the runtime.

- `terrain.png`: untouched 1448×1086 opaque generation. Runtime `terrain.webp` retains these dimensions, WebP quality 75.
- `buildings.png`: untouched 1402×1122 transparent 5×4 atlas. Cells use rounded boundaries at fifths/fourths, are independently trimmed, fitted into transparent 256×256 squares and encoded at WebP quality 88 / alpha quality 100. Cell order matches the estate building registry.
- `actors.png`: untouched 1774×887 transparent eight-frame/four-row atlas. Runtime `actors.webp` is 1024×512 at quality 78 / alpha quality 85, preserving its eight-column/four-row frame layout.
- `windmill-body.png`: transparent edit of the Windmill cell with its sails removed. Trim and transparent 256×256 fitting match the other building sprites. Wooden sails are the separate native SVG rotating layer.

Sharp performs only atlas extraction, transparent trimming, resizing and WebP encoding. The source generations remain intact. Survey stakes, scaffolding, road geometry, walls and wooden sails are native scene assets. Runtime files live in `assets/inner-city-estate/`. `art-record.json` records the exact source/runtime hashes and dimensions.

The complete prompts are retained in `prompts.json`. Runtime assets do not depend on a file under the Codex generated-image directory. Raw sources, prompts and review controls are excluded from the production package.
