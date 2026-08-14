# Deterministic terrain plan

The macro terrain plan precedes city placement and artwork. Profiles are neighboring expressions of one kingdom, not fantasy biomes:

- `agricultural`: open ground, woodlot, pond, small rocky area;
- `woodland`: several dense forest blockers and a central coppice;
- `rolling_hills`: rocky ridges with open valleys;
- `wetland`: marshes, pond, reeds, and dry buildable ground;
- `trade_corridor`: supported by the engine for later fixtures, emphasizing road access.

The seed is:

```text
sha256(worldId | seasonId | regionId | gridX | gridY |
       generatorVersion | assetLibraryVersion | retrySalt)
```

The output records land polygon, authoritative vector blockers, crossings, exactly four edge-road definitions, internal road branches, transition zones, palette, visual selections, blocker mask, and hashes. Phase 4 v2 city placement consumes the vector geometry; it never reads painted pixels.

## Pixel/gameplay conversion

Generated regional backgrounds are always `1448x1086`. The package also records a map-local gameplay plane of `13000x17000`:

```text
gameplayX = pixelX * 13000 / 1448
gameplayY = pixelY * 17000 / 1086
pixelX    = gameplayX * 1448 / 13000
pixelY    = gameplayY * 1086 / 17000
```

Both pixel and gameplay coordinates are stored for generated cities. Existing production conversion and routing code is unchanged; activation of generated packages will require an explicit later runtime adapter and parity testing.

Neighbor cohesion currently guarantees matching cardinal road sockets at each edge and a shared palette/art family. It does not attempt seamless panorama stitching. Future versions can deterministically coordinate waterways, ridges, and profile choice using neighboring coordinate-derived seam metadata.
