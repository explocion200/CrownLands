# Region catalog

`region-catalog.js` is the shared derivation and validation runtime. Generated catalog data is published to the browser as `assets/worlds/world_01/region-catalog.js` and to Functions as `functions/region-catalog.json`. The source JSON is retained for build/editor validation but excluded from the production client.

Each active entry includes stable ID and display name; `gridX`/`gridY`; explicit purpose; `permanentCore`; `spawnEligible`; `spawnReady`; `worldLayer`; `clockwiseOrderIndex`; lifecycle; four coordinate-derived connection states; map, thumbnail, and lazy definition paths; capacity; NPC/city/camp/objective counts; and compatibility geometry needed by the current UI. Core reservations separately describe inactive permanent coordinates without pretending a region exists.

Accepted purposes are `core_citadel`, `core_stronghold`, `core_camp`, `core_support`, and `player_region`. Reservations use `reservedPurpose: core_holding_or_support`; they are not active regions and cannot leak into spawn selection.

Lifecycle currently distinguishes `active` catalog regions from `reserved` core cells. Future provisioning should add an inactive lifecycle only with explicit server semantics and validator coverage.

Catalog validation enforces unique IDs and coordinates, valid purpose/layer combinations, core no-spawn, the 25 core reservations, active assets and definitions, reciprocal cardinal connections, deterministic clockwise indices, dynamic bounds, and player-region NPC metadata.
