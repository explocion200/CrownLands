# Crownlands Pass 3B QA Notes

## Reviewed

- Approved Pass 3A Stage 5 city and Crown Citadel as the primary style reference.
- Existing Gold, Training, Speed, and Defense Stronghold assets.
- Actual regional maps and objective placements:
  - Gold: West Marches.
  - Training: North Frontier.
  - Speed: East Reach.
  - Defense: Southfields.
- Runtime Stronghold sizing and label placement.
- Gameplay-scale hierarchy comparison against Stage 5 city and Crown Citadel.

## Performance Guardrail Precheck

`game.js` was inspected before artwork. It is 1,642,718 normalized bytes, or 1604.2 KiB, which is 4,318 bytes over the 1600 KiB budget. Static search found many low-reference helpers, but that is not safe proof of dead code because the runtime uses indirect state, event handlers, validators, and generated UI paths. No safe cleanup was made during this raster pass. The issue remains documented separately from art validation.

## Accepted Production Art

- `assets/gold-stronghold.png`: fortified treasury and merchant yard.
- `assets/training-stronghold.png`: fortified barracks and drill-yard complex.
- `assets/speed-stronghold.png`: fortified cavalry/courier relay and stable yard.
- `assets/defense-stronghold.png`: layered defensive fortress.

## Candidate Art Rejected Or Corrected

- No full sheet was rejected. The first generated sheet matched the Pass 3A camera, material family, role readability, and hierarchy well enough to proceed.
- The generated sheet still required chroma-key removal, crop extraction, alpha validation, and connected-component cleanup before production install.
- The old production assets were rejected for the new direction because they read too pristine, too blue/gold, and too palace-like compared with the approved Pass 3A architecture.

## Architectural Cohesion

- All four Strongholds share the approved Crownlands late-medieval fieldstone, dressed-stone, timber, clay tile, burgundy banner, dirt-road, and soft daylight language.
- Camera pitch and perspective match the Pass 3A city progression better than the previous Strongholds.
- The Strongholds feel specialized and important without becoming more royal than Crown Citadel.

## Role Readability

- Gold reads through treasury/counting-house massing, merchant courtyard, wagons, crates, barrels, and better masonry rather than gold plating.
- Training reads through drill-yard layout, barracks, targets, practice lines, and equipment-yard details.
- Speed reads through stables, horse yard, courier movement, open gate, and a broad road approach.
- Defense reads through thicker walls, towers, layered entrance, and earthwork/controlled-approach cues.

## Gameplay Map QA

- Gold on West Marches: sits cleanly on the existing stone platform, covers the older pad, and remains readable against the mountain-valley terrain.
- Training on North Frontier: compact enough for the map scale and readable despite the busier mountain backdrop.
- Speed on East Reach: road approach is visible and works with the surrounding road network.
- Defense on Southfields: strongest silhouette of the four and still fits the existing central platform/road cluster.
- No objective coordinates were changed.

## Marker And UI Compatibility

- Runtime source paths were updated in `game.js`, `assets/map-editor-data.js`, and `functions/world-layout.json`.
- Public guide card references were updated.
- Existing Stronghold node dimensions, labels, selection rings, owner markers, bonuses, garrison displays, action wheels, held-objective UI, reinforcement UI, reports, and map navigation logic were not changed.

## Source And Optimized Sizes

| Asset | Old source bytes | New source bytes | Old optimized bytes | New optimized bytes |
| --- | ---: | ---: | ---: | ---: |
| Gold Stronghold | 2,178,335 | 590,786 | 48,128 | 58,444 |
| Training Stronghold | 1,839,410 | 627,493 | 39,720 | 61,228 |
| Speed Stronghold | 1,660,980 | 596,085 | 39,614 | 59,908 |
| Defense Stronghold | 2,564,322 | 658,132 | 42,432 | 63,902 |

The source masters are substantially smaller than the previous PNG masters. The optimized WebP derivatives are larger than the prior derivatives because the new art preserves more irregular structure and transparent detail, but each remains within the objective-asset category budget checked before the known `game.js` source-entry failure.

## Final Validation

- `git diff --check`: passed with line-ending warnings only.
- `node --check game.js`: passed.
- `node --check assets/map-editor-data.js`: passed.
- `tools/build-production-client.js`: passed; stamped build `f4604e98824d`, 234 files, 21.53 MiB.
- `tools/validate-map-image-loading.js`: passed; 391,236 thumbnail bytes vs 8,927,742 full-map bytes.
- `tools/validate-runtime.js`: passed; validated 15 maps and the server-authoritative world manifest.
- `tools/validate-production-artifact.js`: passed; 235 files, 21.55 MiB.
- `tools/validate-public-site-content.js`: passed.
- `tools/validate-animation-system.js`: passed.
- `tools/validate-daily-login-rewards.js`: passed.
- `tools/validate-login-resilience.js`: passed.
- `tools/validate-audio-delivery.js`: passed.
- `tools/validate-patch-notes.js`: passed.
- `tools/validate-instant-economy-actions.js`: passed.
- `tools/validate-asset-performance-budgets.js`: failed only on the known `game.js` source-entry guardrail: 1604.2 KiB vs 1600 KiB.

## Remaining Issues

- The four camps remain old art and are now the most visible map-objective mismatch.
- Regional maps are still older terrain art and should be addressed in a later dedicated map pass.
- `tools/validate-asset-performance-budgets.js` still fails on the pre-existing `game.js` source-size budget, not on the new Stronghold art.
