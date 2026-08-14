# Phase 6A terrain vertical slice

The approval slice is a development-only 1448x1086 opaque RGB map generated with the built-in image-generation workflow using three approved Crownlands maps plus current city and Stronghold artwork as visual references.

Its identity uses four restrained ideas: broad meadow/pasture, limited field strips, concentrated western woodland, and eastern/southeastern rocky hills. It avoids a central plaza, objective pad, large settlement, repeated stamp pattern, and decorative saturation.

All four edges are naturally closed by forest, ridge, mixed vegetation, and haze. Each cardinal side has one deliberate muddy-road passage. OPEN/GATED state is not baked into the map: the QA preview demonstrates a runtime arrow or provisional Gate overlay on the unchanged road opening.

## Modular edge-treatment evaluation

The slice evaluates three edge families without turning them into a visible frame:

- **Forest:** the north and northwest use overlapping tree-line masses with restrained haze. This provides the strongest closure and should support several silhouettes/density variants so repeated maps do not look stamped.
- **Hill/rock:** the east and southeast mix low ridges, exposed stone, and woodland pockets. Rock should remain terrain-scale and must not compete with Strongholds or city silhouettes.
- **Mixed vegetation:** the west and south combine tree groups, scrub, riverbank/low ground, and haze. This gives softer closure while still preventing open playable ground from visually running off-map.

Each family needs modular left approach, road funnel, right approach, corner transition, and non-road span pieces. The road funnel is a visual module only: the authoritative corridor remains geometry data, and OPEN/GATED overlays remain runtime state. The Phase 6A source proves the visual treatment and compatibility; it does not yet publish or mass-produce a complete reusable edge library.

The authoritative QA geometry is manually authored independently of painted pixels. It reserves the four road corridors, blocks the major forest/ridge masses, produces exactly 40 city positions, and identifies starting candidates. This geometry is for art approval only and is not published or activated.
