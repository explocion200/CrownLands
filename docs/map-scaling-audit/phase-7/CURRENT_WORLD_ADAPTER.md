# Current handcrafted-world adapter

The adapter exposes the existing catalog through the same lazy-loading surface as future generated regions while preserving current assets and definitions unchanged.

Validated current state:

- 15 production maps
- 1,050 production city definitions
- 210 directed inter-map chains
- zero ACTIVE generated regions
- permanent 25-coordinate Core remains reserved and spawn-ineligible
- Holding Tower reservations remain locked

The adapter returns handcrafted catalog references and combines them with published generated catalog entries. It does not run the generic player-region generator for the Core, create the ten missing Core artworks, rename region IDs, renumber cities, or alter current topology.

Startup does not eagerly load either current or generated region definitions. Existing current-world region definitions, map assets, travel behavior, and city ownership remain authoritative for the handcrafted world.

Phase 7 performs no Firebase write. The current-world adapter is read-only validation code.
