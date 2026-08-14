# Phase 5 composer architecture

Phase 5 keeps two map families deliberately separate.

| Family | Source | Cities | Objectives | Spawn behavior |
| --- | --- | ---: | --- | --- |
| Permanent Core | Fixed handcrafted template | Existing fixed definitions or zero for reservations | Fixed Citadel, Strongholds, Camps, future Towers | Always false |
| Outer player region | Deterministic generator outside Layer 0 | Exactly 40 | None | Development STANDBY only; future runtime threshold uses authoritative ownership |

The local-only player pipeline is:

```text
clockwise allocation
  -> phase5 seed
  -> macro terrain plan
  -> authoritative vector blockers + derived QA mask
  -> exactly one potential road per cardinal edge
  -> Phase 4 v2 exact-40 city placement
  -> starting-candidate analysis
  -> procedural QA composition
  -> geometry/art parity
  -> deterministic 1448x1086 WebP + 320x240 thumbnail
  -> immutable development package
  -> STANDBY
```

`tools/map-scaling-phase-5/` owns this pipeline. It is not imported by `game.js`, `index.html`, Firebase Functions, the production catalog, or the production build. Output lives under `benchmark-results/map/phase-5/` and is watermarked `NOT PRODUCTION ART`.

The composer never bakes cities, Strongholds, Camps, the Citadel, arrows, or Gates into a player-region background. Cities remain runtime objects. The four roads are baked; GATED/OPEN state remains a runtime overlay so adding a neighbor does not regenerate the WebP.

Versions are pinned separately:

- generator: `phase5-composer-v1`;
- terrain plan: `phase5-terrain-plan-v1`;
- asset library: `phase5-dev-placeholder-library-v1`;
- Core package: `permanent-core-template-v1`.

The seed includes world, season, region, coordinate, generator version, asset-library version, and explicit retry salt. A published package would retain all versions and hashes and would never be silently regenerated.
