# Phase 5 readiness

Phase 4 proves allocation, geometry-aware city placement, deterministic IDs, starting-candidate metadata, validation, and rollback. Phase 5 may begin only after review of this checkpoint.

The modular map asset composer will need:

- an approved terrain schema shared by composer, route engine, and city validator;
- modular land, coast, mountain, water, forest, road, and decoration assets;
- a deterministic composition version separate from the city generator version;
- visual collision bounds for cities, Camps, Strongholds, Citadel, Gates, and arrows;
- road-network generation that honors all four reserved edge corridors;
- a visual/geometry parity validator;
- deterministic WebP/thumbnail bake settings and content hashes;
- package signing/staging and atomic catalog publication design;
- accessibility/readability review at gameplay zoom levels;
- rollback and orphan-art cleanup for failed builds.

Known Phase 4 limitations are intentional: fixture terrain is synthetic, no production worker or storage transaction exists, candidate scoring has not been balanced against a real player-per-map target, capacity estimates remain approximate, and final art/road composition is absent. Reset migration, player placement, and real region activation also remain out of scope.

The Phase 3 reset boundary is unchanged: Flag, persistent clan identity/membership, and Common Gear remain the planned persistent progression; normal consumables and all world/ownership/march state remain seasonal. Phase 4 implements no reset migration.
