# Phase 6 readiness

Phase 5 proves the package, geometry, determinism, WebP, thumbnail, Core template, Tower safety, and preview architecture. It does not provide final production art.

Before Phase 6 production-art integration:

1. Preserve the locked Tower reservation coordinates `(-1,-1)`, `(1,-1)`, `(-1,1)`, `(1,1)`; Phase 6 must not repurpose them.
2. Commission the exact modular asset list in `ASSET_LIBRARY_SPEC.md` with sidecar geometry/transform metadata.
3. Pin a production image-encoder container/runtime.
4. Add polygon footprints and per-asset alpha masks while keeping vector geometry authoritative.
5. Build seam metadata for waterways, ridges, and palette continuity between neighbors.
6. Compare composed maps against the 15 current Crownlands WebPs for camera, palette, density, lighting, and medieval land-use quality.
7. Replace procedural primitives only after every asset passes perspective and transform review.
8. Add final Gate artwork as a runtime overlay; do not bake it.
9. Extend geometry/art parity to alpha-mask coverage, bridge/crossing sockets, and visual-route overlays.
10. Re-run exact-40 and output-budget gates across many deterministic seeds and full rings.

Phase 6 should integrate real modular art into the existing manifest/geometry pipeline. It must not activate regions, modify production maps, implement season reset, move cities, or silently regenerate a published package.

Later phases—not Phase 6 art production—must implement an administrative generation worker, immutable storage/publication, runtime generated-region loading, reset reconstruction, and production activation controls.
