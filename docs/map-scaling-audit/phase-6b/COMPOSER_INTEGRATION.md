# Phase 6B composer integration

The Phase 6B composer is an offline development/server-side layer over the established Phase 4 and Phase 5 generation architecture.

## Pipeline

1. Resolve the directional family from the requested region profile.
2. Derive a SHA-256 seed from world, season, region, coordinate, generator version, library version, direction, variant, and retry salt.
3. Select one directional foundation.
4. Place eight boundary-touching barrier segments.
5. Place exactly four cardinal road-opening modules.
6. Select and place four restrained interior accents.
7. Create authoritative blocker geometry from the selected visual accents.
8. Run the Phase 4 authoritative city generator until exactly 40 valid city positions exist or fail without publication.
9. Render the 1448×1086 map and 320×240 thumbnail twice and require matching hashes.
10. Write an inactive development STANDBY receipt and QA package.

The asset renderer is Pillow-based and runs only in offline tooling. It is not imported by normal map rendering, Firebase Functions, or the production client.

## Geometry/art parity

Every blocking accent has a matching `geometryRef`, center, and ellipse footprint. Every cardinal road module has a matching authoritative centerline and side. The road count validator requires exactly one North, East, South, and West exit. Eight barrier modules must touch the literal image boundary.

The city generator consumes vector land, blocker, road, and transition geometry. It never infers placement validity from pixels. The visual assets are a rendering of that authoritative plan.

## Directional profiles

- North: `north_light_winter`
- East: `east_tropical`
- South: `south_dry_frontier`
- West: `west_grassy`

The composer prohibits cross-theme asset selection. Foundation transforms and deterministic accent choices provide variation without changing the locked regional family.

## Capacity and spawn rules

Every generated player-region fixture contains exactly 40 city positions. The region cannot reach development STANDBY without all 40. The 15-NPC rule remains runtime-only and is not used as a generation target. No sample is spawn-ready or production-active.

## Publication boundary

All code is under `tools/map-scaling-phase-6b/`. All raster outputs and receipts are under `benchmark-results/map/phase-6b/`. No production manifest references these paths. The production artifact and leakage checks must continue to reject any appearance of these paths under `dist/` or Firebase Functions.
