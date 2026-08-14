# Permanent Core package

The Core template is fixed data, not player-map generator input. It contains all 25 coordinates from `(-2,-2)` through `(2,2)`, with 10 current handcrafted active maps and 15 protected reservations. Every cell records `spawnEligible: false`, `spawnReady: false`, and `playerRegionGenerationAllowed: false`.

Current handcrafted Core cells are pinned as follows:

| Coordinate | Region | Configuration |
| --- | --- | --- |
| `0,0` | `center` / Crownlands Heart | Crown Citadel |
| `0,-1` | `north` / North Frontier | Training Stronghold |
| `1,0` | `east` / East Reach | March-speed Stronghold |
| `0,1` | `south` / Southfields | Defense Stronghold |
| `-1,0` | `west` / West Marches | Gold Stronghold |
| `-2,2` | `region_6` / Graywood Hollow | Gold Camp |
| `-1,2` | `region_7` / Greenrook Vale | Relic Camp |
| `0,2` | `region_8` / Lowroad Vale | Core support |
| `1,2` | `region_9` / Stonebrook Farms | City Deed Camp |
| `2,2` | `region_10` / Goldmere Plains | Warband Camp |

The package references each active map asset, thumbnail, region definition, topology, objectives, Camps, city count, and a hash of published city coordinates. It does not copy fake maps into the 15 empty cells.

## Objective pins

- `center_crown_citadel` remains at pixel `(710,498)` in `center`.
- Strongholds remain `north_training_stronghold`, `east_speed_stronghold`, `south_defense_stronghold`, and `west_gold_stronghold` in their existing regions.
- Camps remain `region_6_gold_camp`, `region_7_items_camp`, `region_9_deed_camp`, and `region_10_troops_camp`.

## Holding Tower reservations

The approved Phase 5 development template locks the four empty inner diagonals for future Tower maps:

- northwest `(-1,-1)`;
- northeast `(1,-1)`;
- southwest `(-1,1)`;
- southeast `(1,1)`.

This coordinate set is now a locked Core invariant (`phase5-approved-v1`). These cells may not be reused by the clockwise player-region allocator, populated with normal cities, or published as normal player regions. The remaining 11 empty cells stay `core_holding_or_support` reservations.

Tower activation is accepted only at a reserved Tower coordinate, with no normal cities, no player-region package, and no city relocation. Tests reject relocation lists, changed published coordinates, and Tower footprints that overlap published cities.

## Future season reconstruction

The later reset workflow should load the immutable Core package, verify its package and source hashes, restore all 25 coordinate records, load only configured handcrafted maps, restore fixed objectives, initialize seasonal objective ownership, keep all Core cells non-spawnable, then attach the configured outer player layer. Persistent Flag, Clan identity/membership, and Common Gear restoration happens later. Consumables are excluded. Phase 5 implements none of those writes or migrations; it supplies the package and validators only.
