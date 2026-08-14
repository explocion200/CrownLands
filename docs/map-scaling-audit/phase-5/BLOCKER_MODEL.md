# Blocker model

Phase 5 chooses a hybrid model:

1. **Authoritative vector geometry** is the source of truth for city placement, road/crossing validation, package hashes, and future route integration.
2. **Derived raster blocker mask** is a deterministic acceleration and QA artifact, never an authority source.
3. **Painted blocker art** references the vector geometry by stable `geometryRef` and must cover the same footprint within tolerance.

Current prototype blockers are deterministic ellipses because the Phase 4 validator already handles expanded rotated ellipses. The schema is versioned so production mountain/forest/water silhouettes can add polygons later without changing the authority hierarchy.

The RLE mask is `181x136`, row-major, and carries its own hash plus `derivedFromAuthoritativeVectorGeometry: true` and `authoritativeForPlacement: false`. Raster-only placement and image-pixel inference are explicitly rejected.

Crossings must be explicit. Water remains blocked unless a bridge or ford defines both visual art and a matching traversable geometry socket. A painted bridge with no crossing, a crossing with no painted bridge/ford, or a road through an unapproved blocker fails parity validation.
