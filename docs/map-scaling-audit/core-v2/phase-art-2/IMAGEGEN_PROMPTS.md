# ART-2 ImageGen record

The built-in ImageGen tool was used in edit/generation mode. ART-1 structure assets, approved Phase A road overlays, and the locked Phase A compositions were used as references. Old regional backgrounds were not used as the visual source of truth.

The common final prompt contract was:

> Create a clean 1448×1086 Crownlands Core background in the ART-1 structure-led painterly late-medieval style. Keep an elevated three-quarter/orthographic camera, soft daylight, restrained earth/moss/timber/weathered-stone materials, calm playable interior, narrow natural barrier on the literal image edge, and only the four locked road openings. Preserve the supplied road geometry and leave every locked city and objective footprint clear. Do not bake cities, objectives, Camps, Strongholds, Citadel, Towers, labels, arrows, gates, units, UI, or magical effects.

Map-specific direction:

- Crown Citadel: prosperous central kingdom, ceremonial approaches, maintained countryside, restrained estate land treatment.
- Ironwatch: defensive rocky ground, subtle ridges, modest earthworks, hardened approaches, limited old wall traces.
- Southwest Holding Tower: contested dry ground, worn battlefield traces and earthworks, clean near-center reservation, no Tower art.
- Deed Camp: settled frontier with one small off-center subordinate cottage/farm cluster, leaving the Camp reservation and city footprints clear.
- West Support: clean temperate grassland with minimal farmland, orchard, woodland, and maximum 70-city readability.

The Deed candidate received two focused edit passes. The first reduced the oversized settlement. The second used the actual locked city/objective overlay only as a clearance guide, removed the conflicting cluster, and rebuilt a compact cluster near `(1140,340)` without changing roads or baking overlays.

Generated source images were copied into versioned development-only candidate paths. The original generated-image outputs were left in the tool-managed location.
