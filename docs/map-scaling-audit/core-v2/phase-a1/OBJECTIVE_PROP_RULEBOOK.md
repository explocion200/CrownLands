# Core v2 objective prop rulebook

This is a hard, deliberately small rulebook for the remaining permanent-Core compositions. It preserves the approved simple Crownlands style. A cluster is one visually coherent group; scattering its pieces does not turn it into multiple “minor” accents.

## Global limits

- **Major thematic clusters:** maximum **1** per map.
- **Medium prop clusters:** maximum **2** per map. A map may use a third medium cluster only when it has no major cluster.
- **Existing accent budget:** thematic props replace modules within the current four-accent composition budget; they are never added on top of it. Phase A.1 adds no interior accent assets.
- **Edge/corner concentration:** a major cluster belongs at an edge or corner unless it is the map's authoritative objective. At most two corners may carry medium-or-larger treatment, and no prop may obstruct a road socket, transition zone, or literal edge barrier.
- **City clearance:** reserve the current 64×64 runtime city footprint plus **24 px of clear visual space** to the opaque footprint of any thematic prop. Props may not cover a label anchor, selection ring, or interaction target.
- **Objective clearance:** no standalone prop enters the objective influence ellipse (`radiusX/radiusY` plus the specification's `influenceClearance`). Where a future objective has only a visual footprint, preserve at least **32 px** beyond that footprint. Integrated ground treatment that is part of the approved objective art is the only exception.
- **Objective-area decoration:** no additional major or medium cluster inside the influence ellipse. Outside it, at most two low-contrast ground traces may reinforce the objective without competing with its silhouette or label.
- **Central clutter:** the central 30% of map width and height remains free of major/medium props unless occupied by the authoritative objective. Road junctions stay visually open. No market scene, army scene, full village, quarry, dense ruin field, or forest wall may fill the center.
- **Roads and transitions:** preserve the Phase A road, blocker, perimeter, and Gate/Arrow clearance envelopes. Decorative traces may approach a road but may not hide its readable path.
- **Runtime separation:** cities, objectives, Gates, arrows, labels, banners, troops, selection UI, and march lines remain runtime objects and are never baked into map artwork.

## Map-type cues

| Map type | Allowed restrained cue | Hard prohibition |
|---|---|---|
| Warband | Battlefield traces only: one broken barricade group, churned earth, or a few discarded shields | No giant battle scene, formed army, siege tableau, or corpse field |
| Deed | One small hamlet/settlement cluster maximum, supported by at most one light field treatment | No full town, continuous street, or second settlement |
| Relic | One restrained ruin or sacred-stone cluster | No glowing fantasy ruin, magical field, or sprawling temple complex |
| Gold | Mining cues concentrated at an edge: small cut, carts, timbers, or exposed stone | No central quarry, open-pit takeover, or industrial district |
| Tower | Sparse battlefield/defensive traces outside the reservation | The Holding Tower reservation and its approach stay completely clear; no Tower art is baked early |
| Greybanner | Light mustering/training cues such as one drill patch or target group | No permanent army camp or parade filling the interior |
| Ironwatch | Restrained defensive terrain: low earthwork, stone outcrop, or one barricade group | Nothing may compete with the Stronghold silhouette or close its approaches |
| Swiftgate | Movement identity comes primarily from the approved road geometry; one roadside wayfinding cue is optional | No extra road exits, plaza, or dense roadside settlement |
| Aurum | Productive terrain through light fields/orchard treatment within the existing accent budget | No urban market, palace estate, or central prop mass |
| Citadel | Royal prestige through symmetry, maintained approaches, and low-contrast grounds | No additional major cluster; no decorative skyline competing with the Citadel |
| Support | Minimal special props; at most one medium edge cue | No major cluster and no reduction in city readability |

## Review gate

A Core composition fails before visual review if it exceeds a cluster count, violates city/objective/road clearance, adds rather than replaces accent density, or requires runtime information to be baked into art. The correction order remains coordinate/layout redistribution, open-terrain use, decoration removal or movement, objective-safe widening, road-adjacent revision, then art-safe blocker revision—never city-capacity reduction.
