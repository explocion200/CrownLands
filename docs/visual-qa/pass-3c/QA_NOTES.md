# Crownlands Pass 3C QA Notes

## Reviewed

- Approved Pass 3A city stages and Crown Citadel.
- Approved Pass 3B Strongholds before and after fixed-canvas normalization.
- Existing camp source assets and new Pass 3C camp source assets.
- Actual map placements:
  - Gold Camp: Graywood Hollow.
  - Relic Camp: Greenrook Vale.
  - Deed Camp: Stonebrook Farms.
  - Warband Camp: Goldmere Plains.
- Runtime map-object sizing in `game.js`, `styles.css`, server layout seed cleaning, map editor defaults, and authoritative route validation.
- Optimized manifest output and alpha-preserving fixed-layout pipeline.

## Objective Scale Standard

| Class | Source canvas | Optimized runtime canvas | Runtime display size |
| --- | ---: | ---: | ---: |
| City stages | Natural source/derivative aspect | 256px max natural aspect | 66/69/72/75/78px desktop, 61/64/67/70/73px compact mobile |
| Camps | 640x640 PNG | 384x384 WebP | 132x132px |
| Strongholds | 640x640 PNG | 384x384 WebP | 154x154px |
| Crown Citadel | Pass 3A transparent master | 384x384 WebP | 260x260px |

Transparent padding is intentional for Camps, Strongholds, and the Crown Citadel. The optimizer now preserves that padding for fixed-layout asset categories.

## Accepted Production Art

- `assets/camps/gold.png`: merchant/tax convoy camp.
- `assets/camps/troops.png`: temporary Warband camp.
- `assets/camps/items.png`: guarded Relic shrine camp.
- `assets/camps/deed.png`: charter/deed administration camp.

## Candidate Art Rejected Or Corrected

- No full alternate Camp sheet was rejected. The first generated Camp family matched the approved Crownlands camera, daylight, material culture, sibling relationship, and role readability after inspection.
- The generated sheet required crop extraction, chroma-key removal, alpha cleanup, and fixed 640x640 canvas placement before production install.
- The old Camp sources were rejected because they read more like small fortified circular sites and shared less of the temporary camp/objective language required for Pass 3C.

## Role Readability

- Gold reads through wagons, chests, crates, a counting table, guarded goods, and restrained merchant-yard detail rather than giant coins or gold coating.
- Warband reads through military tents, banners, racks, soldiers, campfire activity, and a compact muster layout rather than a large sword symbol.
- Relic reads through a guarded shrine/pavilion, pale cloth, candles, attendants, and a protected central object without blue or purple magic.
- Deed reads through a heraldic pavilion, documents, survey stakes, records, wax seals, and administrative props rather than glowing parchment.

## Objective Hierarchy QA

- The objective-scale sheet shows City Stage 1/3/5 below Camp scale, Camps as a consistent 132px class, Strongholds as a consistent 154px class, and Crown Citadel as a dominant 260px royal class.
- All four Camps have comparable visual mass and ground footprint.
- All four Strongholds now share identical source and optimized canvases. Their visible silhouettes differ by function without drifting into different gameplay size classes.
- The hierarchy reads correctly: Camp < Stronghold < Crown Citadel.

## Gameplay Map QA

- Gold Camp on Graywood Hollow sits naturally on the road crossing and remains readable against the forested valley terrain.
- Relic Camp on Greenrook Vale is readable in the open grass/road intersection and avoids magical effects.
- Deed Camp on Stonebrook Farms aligns well with the road/farm crossing and remains distinct from Relic through administrative props.
- Warband Camp on Goldmere Plains sits cleanly at the central road point and reads as a military camp at gameplay size.
- No map coordinates were changed. The composites include selection-ring and action-wheel clearance approximations; no unavoidable overlap was found.

## Optimization QA

- `tools/optimize-game-art.py` now has fixed-layout categories for `camp-object`, `stronghold-object`, and `citadel-object`.
- Optimized Camps and Strongholds retain 384x384 transparent canvases instead of being tightly cropped.
- `tools/validate-map-object-scale.js` checks source dimensions, optimized dimensions, alpha, layout sizes, runtime constants, CSS sizes, and editor defaults.

## Source And Runtime Sizes

| Asset | Old source bytes | New source bytes | Old optimized bytes | New optimized bytes |
| --- | ---: | ---: | ---: | ---: |
| Gold Camp | 1,835,824 | 375,093 | 39,814 | 35,328 |
| Warband Camp | 1,970,865 | 360,955 | 43,168 | 38,100 |
| Relic Camp | 1,943,127 | 383,558 | 43,946 | 36,376 |
| Deed Camp | 2,016,267 | 349,305 | 46,536 | 35,070 |
| Gold Stronghold | 590,786 | 593,622 | 58,444 | 49,778 |
| Training Stronghold | 627,493 | 630,406 | 61,228 | 52,542 |
| Speed Stronghold | 596,085 | 599,176 | 59,908 | 50,334 |
| Defense Stronghold | 658,132 | 661,462 | 63,902 | 53,752 |

Stronghold source bytes increased slightly from transparent padding normalization. Optimized Stronghold bytes decreased after fixed-canvas regeneration.

## Development QA Files

- `docs/visual-qa/pass-3c/objective-scale.html`
- `docs/visual-qa/pass-3c/objective-scale.png`
- `docs/visual-qa/pass-3c/old-new-camps-comparison.png`
- `docs/visual-qa/pass-3c/map-qa-region-6-camp.png`
- `docs/visual-qa/pass-3c/map-qa-region-7-camp.png`
- `docs/visual-qa/pass-3c/map-qa-region-9-camp.png`
- `docs/visual-qa/pass-3c/map-qa-region-10-camp.png`

## Remaining Issues

- Regional maps remain older terrain art. The new Camps fit their placements, but the later map-art pass should harmonize roads, fields, and terrain brushwork with the newer structure assets.
- Inner Castle hub/buildings, officer portraits, consumables, pickups, loading ring/crown, peace shield field, HUD bitmap icons, and map transition raster remain future replacement targets.
- `tools/validate-asset-performance-budgets.js` still reports the existing `game.js` source-size guardrail issue: 1604.2 KiB vs 1600 KiB.
