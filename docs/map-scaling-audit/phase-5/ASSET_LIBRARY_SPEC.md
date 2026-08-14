# Modular asset library and Phase 6 production-art specification

The repository currently has 15 finished, baked regional WebPs and thumbnails, not a reusable terrain-piece library. Runtime city/objective sprites are separate gameplay objects and are not terrain-composer assets. The optimized Inner Castle gatehouse is usable only as the provisional development Gate overlay; it is not final edge-Gate artwork.

Phase 5 therefore records 45 schema entries but marks every terrain entry `productionReady: false`. QA WebPs use simple procedural primitives and carry a permanent development watermark.

Every production source should use the existing Crownlands north-up, fixed top-down/oblique painterly camera, no horizon, consistent soft northwest light, grounded 14th–15th-century materials, and earthy palette. Large pieces need generous transparent bleed and no baked city/objective shadows.

## Exact production art required for Phase 6

| Family | Required variants | Source size | Alpha | Expected footprint | Safe transforms | Overlap behavior |
| --- | ---: | --- | --- | --- | --- | --- |
| Base terrain | 7: meadow, grassland, farmland, worn dirt, mud, rock, wet ground | `2048x1536` | Opaque | Full 4:3 map or seamless full-map layer | No arbitrary rotation; color adjustment only within approved palette | Mutually exclusive base, blended by masks |
| Farmland | 20: 6 strip fields, 4 fenced fields, 3 pasture, 3 orchard, 2 hay fields, 2 field-edge transitions | `1024x1024` | RGBA | `240–620px` wide | 0/180°, horizontal mirror where composition stays plausible, 0.85–1.15 scale | May overlap ground/hedges; never roads, exits, or blockers without a designed edge |
| Forest | 32: 6 small, 6 medium, 4 large, 8 edges, 4 dense blockers, 4 coppice/logging | `1024x1024` | RGBA | `120–520px` | 0/90/180/270° for clusters, horizontal mirror, 0.85–1.15 scale | Can layer edge over cluster; dense footprint must match blocker geometry |
| Hedges | 18: 6 straight, 4 curves, 4 junctions, 4 gates/gaps | `768x768` | RGBA | `100–420px` linear | Cardinal rotations, horizontal mirror, 0.8–1.25 scale | May meet fields/fences/roads at explicit gaps; cannot cross city zones |
| Water | 38: 6 streams, 6 rivers, 8 bends, 8 bank sections, 4 pond/lake edges, 6 reed banks | `1024x1024` | RGBA | `180–760px` | Cardinal rotations, mirror only when light/shadows remain valid, 0.9–1.1 scale | Banks/reeds may overlap water; crossings only at authored bridge/ford sockets |
| Hills | 20: 8 individual hills, 6 clusters, 6 foothills | `1024x1024` | RGBA | `180–620px` | 0/180°, horizontal mirror, 0.9–1.1 scale | Soft overlap with terrain/forest edges; gameplay blocker only when metadata says so |
| Mountains | 20: 8 mountain masses, 6 rocky ridges, 6 cliffs | `1024x1024` | RGBA | `240–700px` | 0/180°, horizontal mirror, 0.9–1.08 scale | Visual mass must cover its authoritative blocker; no road overlap except designed pass |
| Blockers | 14 additional silhouettes: 4 dense forest, 4 marsh, 3 impassable water, 3 scree/rock | `1024x1024` plus matching vector footprint | RGBA | `180–620px` | Only transforms explicitly recorded with matching transformed geometry | Must never visually understate the gameplay footprint |
| Roads | 30: 6 straight, 8 shallow curves, 8 strong curves, 8 junctions | `1024x1024` | RGBA | `160–800px` linear | Cardinal rotations, mirror, 0.85–1.15 scale | Pieces blend end-to-end; no unplanned blocker crossings or duplicate edge exits |
| Bridges/fords | 24: 6 bridges, 8 bridge approaches, 4 fords, 6 ford approaches | `1024x1024` | RGBA | `180–520px` | Cardinal rotations, horizontal mirror if lighting permits, 0.9–1.1 scale | Must align road and water sockets and create an explicit traversable crossing |
| Decoration | 58: 8 fences, 6 hay, 6 carts, 6 timber, 8 rocks, 6 reeds, 4 farm details, 4 mills, 10 roadside details | `512x512` or `768x768` | RGBA | `30–240px` | Metadata-specific cardinal rotation/mirror, 0.85–1.15 scale | Decorative only; cannot obscure transitions, roads, cities, or blocker meaning |
| Road-edge treatment | 12: 3 authored treatments for each cardinal edge | `768x768` | RGBA | `250–520px` extending through edge bleed | Cardinal orientation only; no free rotation | Exactly one socket per side; must remain clear for Gate/arrow overlays |
| Gate treatment | 8: 2 grounded Gate variants for each cardinal orientation | `768x768` | RGBA | `180–360px` overlay | Orientation-specific; no mirror unless separately approved | Runtime overlay only; never baked into base WebP; must not hide arrow hit area |

Source masters should be at least twice the final expected footprint for clean 1448×1086 downsampling. Art deliveries need a sidecar manifest containing asset ID, anchor, visual and gameplay footprints, draw order, compatible profiles, overlap rules, and approved transforms. Arbitrary perspective warp, nonuniform scale, hue shifting, and free-angle rotation are prohibited.
