# Deterministic WebP pipeline

The development baker uses Pillow through `tools/map-scaling-phase-5/bake_map.py`. The interpreter is supplied with `CROWNLANDS_MAP_PYTHON`; the pipeline fails closed when Pillow is unavailable.

Settings are fixed:

- map: opaque RGB WebP, `1448x1086`;
- thumbnail: LANCZOS resize of the completed map, opaque RGB WebP, `320x240`;
- quality: 82;
- method: 6;
- no city/objective/Gate overlays;
- required `PHASE 5 DEV COMPOSITE - NOT PRODUCTION ART` watermark.

Each package is baked twice to the same paths. The first and second map/thumbnail SHA-256 values must match. The package records renderer, Pillow version, quality, dimensions, mode, bytes, and hashes. Current QA maps are 19–24 KB and thumbnails are 2.5–3.1 KB; the validator caps development outputs at 1 MiB and 200 KiB respectively, below the production artifact's existing per-map scale.

These hashes are reproducible within the pinned generator/asset/encoder versions. Current rotated-geometry QA maps are 18.9–23.5 KB and thumbnails are 2.4–3.1 KB. Production publication should pin an explicit image-runtime container before treating cross-machine byte identity as a release contract.
