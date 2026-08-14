# Recommended map-generation order

The safest Crownlands pipeline is:

```text
clockwise topology allocation
→ authoritative terrain geometry and blocker configuration
→ four potential edge transitions and road corridors
→ Camps / Strongholds / Citadel reservations
→ deterministic NPC city placement
→ route, spacing, capacity, and spawn-readiness validation
→ visual map composition
→ immutable WebP and thumbnail bake
→ final package validation
→ atomic standby publication
```

City placement can happen before final painted artwork, but not before authoritative terrain, blockers, structures, and road corridors exist. The final art composer should consume the same geometry used by the placement validator so visual and functional terrain cannot drift.

The alternative—drawing a map first and extracting blockers from pixels—is less safe. It makes gameplay authority dependent on art interpretation and complicates deterministic regeneration. Pixel analysis may be used as a QA comparison, never as the only source of placement truth.

Phase 4 creates no terrain sprites, road art, final Gate art, map WebPs, thumbnails, or production packages.

The eventual immutable package should bind one catalog entry, region definition, city definitions, topology, blocker/road data, map WebP, thumbnail WebP, validation receipt, generator version, seed hash, and configuration hash. Publication must verify those hashes as one unit rather than allowing catalog data and art to arrive independently.
