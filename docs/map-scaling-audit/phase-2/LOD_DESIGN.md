# Phase 2 Semantic Zoom Detail Design

## Design goals

The map keeps one DOM and one world transform. Detail changes only when crossing a hysteretic boundary, never for every wheel delta. All 150 Scenario C cities and all 100 march routes remain represented; there are no duplicate far/medium/close DOM trees.

## Thresholds and hysteresis

| Transition | Threshold |
|---|---:|
| Enter far from medium | zoom ≤ 0.52 |
| Exit far to medium | zoom ≥ 0.58 |
| Enter close from medium | zoom ≥ 0.84 |
| Exit close to medium | zoom ≤ 0.76 |

The asymmetric bands prevent rapid class flipping around a boundary. The production `getMapDetailLevel()` function is executed directly by the Phase 2 validator at both sides of every threshold.

## Detail tiers

| Content | Far | Medium | Close |
|---|---|---|---|
| Existing city art and ownership shield/color | Visible | Visible | Visible |
| Main city, selected/targeted city, Stronghold/Citadel | Full exception | Full exception | Full |
| Peace Shield marker | Visible, static performance treatment | Visible | Visible |
| Generic ruler/data row and non-critical city names | Hidden | Visible | Visible |
| City troop/garrison text | Hidden except critical exceptions | Hidden except selected/targeted | Visible |
| City level/owner marker | Visible | Visible | Visible |
| March token | Visible | Visible | Visible |
| March troop count and timer | Hidden except selected token | Visible | Visible |
| Route ribbon/relationship color | Visible | Visible | Visible |
| Secondary animated route flow | Hidden | Visible | Visible |
| Camps and teleporters | Visible | Visible | Visible |

Far zoom is deliberately a strategic view: ownership, protection, selection, objectives, and movement remain readable without rendering every text field. Medium restores identity and route-flow detail but still suppresses city troop/garrison text when it is least readable. Close retains the existing full presentation.

## Discrete interaction targets

The hit target remains accessible without a continuous inherited calculation:

- far: 110 px in map coordinates;
- medium: 84 px;
- close: 58 px.

At the associated scales these remain near or above the intended 44 screen-pixel target. The value changes once when a detail tier changes rather than on every camera frame.

## Preserve-versus-hide rules

Far city rules explicitly exclude `.selected`, `.targeted`, `.main-city-node`, and `.stronghold-node`. Far march rules exclude `.army-token.selected`. Route-flow suppression does not suppress `.army-route-ribbon`, so relationship color and route geometry remain present. Peace Shield art is not hidden; only animation/filter cost is reduced by the existing low-zoom/crowded/camera-moving rules.

## Architecture choices

Existing nodes are hidden with tier CSS rather than destroyed and recreated. The profile showed that repeated construction/removal was precisely what made a stalled gesture worse. One map-level class change at a measured boundary is cheaper and leaves event targets, accessibility labels, game state, and caches intact.

No new `content-visibility` or layer-wide containment was added. Moving tokens and overflow-heavy selection/action UI make those properties risky, while removal of the inherited invalidation already clears the gate. Existing `.map-world` containment and army-token containment remain in place.

No city art, coordinates, gameplay data, route data, march state, or objective data changes are part of the production design.
