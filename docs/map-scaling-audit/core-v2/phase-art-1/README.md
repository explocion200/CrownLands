# Crownlands Core v2 Phase ART-1

Phase ART-1 locks the visual language for the permanent 5×5 Core before any additional Core map is produced. It is a development-only art-direction checkpoint based on the current approved Crownlands city progression, Camps, Strongholds, and Crown Citadel—not on legacy production backgrounds or the Phase A/B1 terrain rasters.

## Decision

The final Core environment is grounded late-medieval Crownlands: polished painterly terrain, slightly dimensional natural materials, restrained earthy color, readable open play space, narrow edge-touching barriers, worn roads, and sparse purpose-specific details. Runtime cities and objectives remain the visual focus.

The art direction is ready for visual approval. Final map production remains blocked until that approval is explicit.

## Locked invariants

- Permanent Core: exactly 25 maps and 1,480 city positions.
- Core spawn eligibility: always false.
- Core city spacing: 68 px hard minimum; 70 px preferred where terrain permits.
- Outer generated player-region spacing: unchanged at 112 px.
- Objective placement: Citadel and Strongholds exact center; Camps, Holding Towers, and future outer Fortresses near center.
- Decoration: at most one major thematic cluster plus two medium clusters, or three medium clusters when no major cluster exists.
- Central 30%: largely clear except for the authoritative centered or near-centered objective.
- Perimeter: a narrow natural barrier begins at the literal image edge; roads are the controlled openings.
- No cities, objectives, Gates, arrows, labels, or UI are baked into map backgrounds.

## Deliverables

- [ART_SOURCE_OF_TRUTH.md](ART_SOURCE_OF_TRUTH.md): direct analysis of the approved structure assets.
- [CORE_ART_DIRECTION.md](CORE_ART_DIRECTION.md): final terrain, camera, light, color, density, perimeter, road, climate, and transition rules.
- [TERRITORY_PROFILES.md](TERRITORY_PROFILES.md): objective and Support-map territory language.
- [REFERENCE_BOARDS.md](REFERENCE_BOARDS.md): index of the nine controlled visual studies.
- [IMAGEGEN_PROMPTS.md](IMAGEGEN_PROMPTS.md): reference roles and prompt briefs used for the boards.
- [PROTOTYPE_CLASSIFICATION.md](PROTOTYPE_CLASSIFICATION.md): A/B/C assessment of all ten Phase A/B1 prototypes.
- [VALIDATION_RESULTS.md](VALIDATION_RESULTS.md): development-scope and production-safety evidence.

## Scope guard

No Batch 2/3/4 map, final Core background, city plan, objective, runtime file, Firebase file, production asset, or publication artifact is part of ART-1. The nine boards are cropped environment studies and cannot be activated as maps.
