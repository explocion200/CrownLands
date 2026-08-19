# ART-6 ImageGen record

The built-in `image_gen` tool was used in edit mode, once per final background. Each call used the deterministic ART-6 geometry draft as the first/edit target plus approved Core maps as visual references.

Every prompt locked: 1448×1086 composition; all four midpoint sockets; original internal route topology; literal edge barriers; broad city-safe negative space; thin rutted medieval roads; elevated three-quarter painterly Crownlands rendering; no cities, objectives, labels, UI, Gates, arrows, icons, or other baked runtime objects.

Map-specific prompt deltas:

- **Southwest Gold:** warm dry western resource frontier, edge-weighted mine cuts/supports/cart traces, calm objective area (706,555), no central quarry or literal gold.
- **South Deed:** warm dry settled countryside, one small off-center cottage/farm cluster, compacted Camp area (708,553), settlement subordinate to runtime cities.
- **South Support:** clean 70-city stress surface, dry grass/soil variation and subtle agricultural/drainage traces, minimum prop density.
- **South Relic:** dry sacred southern terrain with restrained eastern olive vegetation, one distinct eroded ruin/burial terrace, calm Camp area (742,555), no magic.
- **Southeast Warband:** dry southeast military frontier, limited churned earth/broken fence/supply traces, occupied Camp area (740,539), no armies, bodies, tent city, or siege works.

Generated PNGs were copied from the built-in tool output directory into `benchmark-results/map/core-v2-phase-art-6/candidates/<map>/map-final-candidate.png`, then encoded by the repository QA renderer into final WebP and thumbnail artifacts.
