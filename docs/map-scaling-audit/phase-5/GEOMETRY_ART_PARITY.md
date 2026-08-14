# Geometry/art parity

Every authoritative blocker and road owns a stable ID. Visual composition elements reference that ID through `geometryRef`. Validation requires:

- one visual footprint for every blocker;
- matching center/radii within one pixel for current ellipse blockers;
- identical road point lists and widths within one pixel;
- exactly one visual/gameplay road at each cardinal edge;
- no city, Camp, Stronghold, Citadel, arrow, or Gate art in the baked base map;
- opaque output at the required dimensions;
- map and thumbnail output hashes and byte budgets.

The renderer derives QA primitives from the same geometry, so water, mountains, dense forest, marsh, and roads cannot drift independently. This is semantic parity, not permission to infer gameplay from pixels.

Mutation tests prove rejection of a shifted blocker visual, duplicate North exit, duplicate city ID, missing baked output, and output over budget. The constrained terrain fixture fails exact-40 validation and produces no WebP or package.

Production-art parity will also require per-asset alpha-footprint masks and sampled coverage tolerances. That work depends on the real Phase 6 assets and is a known limitation of the procedural QA renderer.
