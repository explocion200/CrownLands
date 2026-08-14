# Deterministic city placement

Phase 4 uses authoritative local-map geometry. A region definition supplies map bounds, a land polygon, terrain/blocker ellipses, prohibited forest/no-city shapes, Camps, Strongholds, Crown Citadel reservations, and road corridors. Image pixels are explicitly rejected as the sole terrain authority.

The generator proposes continuous, seeded positions. Early candidates are spread across usable land; later candidates are biased toward several accepted neighborhood anchors with radial jitter. This produces contested clusters with readable spacing instead of a chessboard or a maximum-distance packing.

Each candidate is rejected if it violates any of these checks:

- map bounds or the authoritative land polygon;
- 96-pixel edge clearance;
- water, mountain, impassable, forest, swamp, or other no-city blocker plus 42 pixels of blocker clearance and the city radius;
- Camp, Stronghold, or Crown Citadel clearance;
- any of four potential edge transition zones;
- any current or future road corridor;
- 112-pixel minimum center-to-center separation from another city.

Generation stops only after exactly 40 valid city positions have been placed or the candidate-evaluation budget is exhausted. Forty is the player-region capacity, not a configurable target. A draft with 39 or fewer valid positions fails validation and rolls back; the 15-NPC threshold is a later runtime placement rule and cannot make an incomplete definition pass.

Generated neutral cities use existing initialization: Level 1, 10 troops, neutral ownership, and defense value 1. Phase 4 does not change combat, economy, defender, production, or upgrade formulas.
