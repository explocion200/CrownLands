# Crownlands Pass 4A QA Notes

## Scope And Standard

- Replaced all 15 active regional backgrounds at the authoritative 1448x1086 opaque WebP contract.
- Retained all region IDs, coordinates, capacities, map objects, edge intervals, adjacency, and gameplay data.
- Regenerated 15 editable 320x240 thumbnails and 15 matching immutable content-hashed thumbnails.
- Retained the five legacy `*-island.webp` filenames because `tools/map-editor/editor.js` uses them as compatibility fallbacks; synchronized their bytes to the matching active royal maps.
- Replaced the cloud transition with neutral natural mist at 1254x1254 RGBA source and 448x448 RGBA runtime.
- Candidate workflow used built-in ImageGen with the approved Crownlands family as reference. Rejected variants remain in `rejected-candidates/` with reason-bearing filenames.

Every region below passed: source dimensions, one road per open edge, no road on closed edges, reciprocal data connection, runtime coordinate overlay, thumbnail generation, and neighboring-lighting/scale review.

## Per-Region Checklist

| Region | Source | N / E / S / W | Terrain and land use | Road / closed-edge QA | Runtime and thumbnail QA |
| --- | --- | --- | --- | --- | --- |
| Crownlands Heart | `center-crownlands-heart-1783019616021.webp` | N North / E East / S South / W West | Highest cultivation; strip fields, orchards, pasture, drainage and central trade roads; moderate woodland/water; low relief. | Four single irregular exits; no geometric objective plaza. Matches all royal neighbors in road scale/daylight. | 100-city and Crown Citadel overlay readable; thumbnail complete. |
| West Marches | `west-west-2-1783019399438.webp` | closed / E Heart / closed / closed | Rough grazed western valley, rocky ridge, managed woodland, stream; modest farming; medium relief. | One east route only; north/south/west blocked by ridge and woodland. | City/Gold Stronghold overlay readable; thumbnail complete. |
| East Reach | `east-east-4-1783020191215.webp` | closed / closed / closed / W Heart | Prosperous grain and orchard country with gray-green brook, hedges and trade-road wear; low relief. | One west route only; other sides closed by wooded, rocky drainage margins. | City/Speed Stronghold overlay readable; thumbnail complete. |
| North Frontier | `north-north-1-1783019201680.webp` | closed / closed / S Heart / closed | Cold stony upland, conifer/mixed woodland, sparse pasture and exposed gray rock; high woodland/elevation. | One south valley road; north/east/west naturally sealed by ridge and dense forest. | City/Defense Stronghold overlay readable; thumbnail complete. |
| Southfields | `south-south-5-1783020401484.webp` | N Heart / closed / S Lowroad / closed | Productive pasture, grain strips, orchard, hedges and shallow drainage; moderate farming, low relief. | One north and one south route; east/west closed by rocky wooded margins. | City/Training Stronghold overlay readable; thumbnail complete. |
| Graywood Hollow | `region_6-6-1783021585258.webp` | closed / E Greenrook / S Bandit / closed | Dense mixed forest, logging clearings, coppice, damp creek and scattered pasture; low farming, high woodland. | Single high-east and south exits; north/west continuous mountain woodland. | City/Gold Camp overlay readable; thumbnail complete. |
| Greenrook Vale | `region_7-7-1783022207943.webp` | closed / E Lowroad / S Ironfall / W Graywood | Managed river vale, pasture, orchards, coppice and timber bridges; medium farming/woodland, low relief. | One west/east/south road; north closed by dense woodland. | City/Deed Camp overlay readable; thumbnail complete. |
| Lowroad Vale | `region_8-8-1783022783978.webp` | N Southfields / E Stonebrook / S Redbanner / W Greenrook | Broad worn low road, mixed farms, hay meadow, hedges and shallow streams; high farming, modest woodland. | Four single exits through an offset route network rather than a perfect crossroads. | Dense city overlay readable; starter capacity preserved; thumbnail complete. |
| Stonebrook Farms | `region_9-9-1783023202200.webp` | closed / E Goldmere / S Ashenfen / W Lowroad | Worked strip fields, pasture, orchard, drainage and stony brook crossings; high farming, low relief. | One west/east/south route; north closed by managed woodland. | City/Relic Camp overlay readable; thumbnail complete. |
| Goldmere Plains | `region_10-10-1783023599661.webp` | closed / closed / S Relic / W Stonebrook | Wealth shown through grain fields, pasture and maintained routes, not gold coloring; high farming, rocky margins. | One west and one south route; north/east blocked by wooded ridge/drainage. | City/Warband Camp overlay readable; thumbnail complete. |
| Bandit Wastes | `region_11-11-1783024323781.webp` | N Graywood / E Ironfall / closed / closed | Poor scrub, eroded tracks, rough grazing, abandoned field edges and thorn; low farming/woodland, medium relief. | One north and one east route; south/west sealed by broken ridge and thorn. | City overlay readable without post-apocalyptic treatment; thumbnail complete. |
| Ironfall Hills | `region_12-12-1783024478267.webp` | N Greenrook / E Redbanner / closed / W Bandit | Rounded stony hills, gray outcrops, pasture, coppice and small quarry traces; low farming, high elevation. | One north/east/west route; south blocked by rocky forested ridge. | City overlay readable over rock field; thumbnail complete. |
| Redbanner Fields | `region_13-13-1783024786859.webp` | N Lowroad / E Ashenfen / closed / W Ironfall | Open grain strips, pasture, hedges and worn mustering/trade roads; high farming, low relief. | One north/east/west route; south closed by wooded low ridge. | City overlay readable; no red filter or fake objective; thumbnail complete. |
| Ashenfen March | `region_14-14-1783024960400.webp` | N Stonebrook / E Relic / closed / W Redbanner | Gray-green fen, reeds, raised pasture, willow/alder, drainage and timber causeways; low farming, high water. | One north/east/west causeway; south closed by deep marsh and wet woodland. | City overlay remains legible over wetland; thumbnail complete. |
| Relic Vale | `region_15-15-1783025218871.webp` | N Goldmere / closed / closed / W Ashenfen | Secluded managed valley, pasture, boundary stones, brook and one modest roadside shrine; medium woodland/farming, medium relief. | One north and one west route; east/south sealed by wooded slopes. | City overlay readable; shrine does not mimic an objective; thumbnail complete. |

## Connected Edge QA

All 18 reciprocal pairs are shown in `edge-pairs/` and `edge-pair-contact.jpg`:

- Royal: Center-East, Center-South, West-Center, North-Center.
- Royal to midgame: South-Lowroad.
- Midgame belt: Graywood-Greenrook, Greenrook-Lowroad, Lowroad-Stonebrook, Stonebrook-Goldmere.
- Midgame to starter: Graywood-Bandit, Greenrook-Ironfall, Lowroad-Redbanner, Stonebrook-Ashenfen, Goldmere-Relic.
- Starter belt: Bandit-Ironfall, Ironfall-Redbanner, Redbanner-Ashenfen, Ashenfen-Relic.

Every pair passed one corresponding route, compatible apparent altitude, road width, painterly detail, natural daylight and world palette. Some terrain changes intentionally mark frontier geography; no pair reads as a floating-island seam or magical portal.

## Rejected Candidates

- Crownlands Heart v1: too many baked hamlets; v2: perfect geometric crossroad.
- North Frontier v1: a track approached the closed north side.
- Southfields v1: north route drifted too far from the authoritative target band.
- Graywood v1: east exit too low; Greenrook v1: fog frame and exit drift; Lowroad v1: geometric crossroads.
- Stonebrook v1/v2: west/south exit drift; Goldmere v1: route suggested a closed north exit.
- Bandit v1 and Relic v1: roads leaked through their closed south sides.
- Transition mist magenta v1: pink key spill; green v2: nonuniform key/artifacts. The accepted generated silhouette was alpha-extracted and neutralized to ivory/weathered gray while preserving transparency.

## Runtime, Desktop, And Mobile

- `runtime-overlay-contact.jpg` shows all 15 maps with authoritative coordinates and current runtime size classes.
- City, Camp, Stronghold, Citadel, route, label, selection, and owner-marker spacing was preserved because no coordinates or object sizing changed.
- `desktop-1440x900.png` passes desktop gallery layout and full-world readability.
- `android-landscape-844x390.png` passes exact Android-landscape gallery framing without overflow or overlap.
- Authenticated live multiplayer state was unavailable in the local QA browser. Overlay QA therefore uses production map files, authoritative region coordinates, current optimized object art, and actual 66/132/154/200px map size classes rather than fabricated coordinates.

## Performance

- Active map payload: 8,927,742 -> 4,486,884 bytes (49.7% smaller).
- Normal thumbnail payload: 391,236 -> 187,148 bytes (52.2% smaller).
- Every map remains below the existing 750 KiB per-file mobile budget.
- Stale immutable thumbnails are removed; exactly 15 active versioned files remain.
- PWA cache/build version: `20260812-regional-maps-pass-4a-r1`.

## Remaining

- No active old-style regional map or map-picker thumbnail remains.
- Rollback copies intentionally remain under this development-only QA directory.
- The local production build still reports the pre-existing `game.js` source budget overage and two pre-existing unused route-helper lint warnings; Pass 4A did not modify gameplay code.
