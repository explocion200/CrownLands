# Gameplay Map Revert QA

## Root Cause

The Map UI and live gameplay do not use the same field. `renderIslandMapTile()` selects `thumbnailSrc`, while `getIslandMapArtSrc()` and `setImageMapBackground()` select `imageSrc`. The thumbnail references had already moved to restored content-fingerprinted files, but gameplay retained the same mutable pre/post-Pass-4A map URLs.

The service worker's cache-first implementation then called global `caches.match(request)`. That allowed an installed PWA to satisfy a current gameplay map request from any older Crownlands cache carrying Pass 4A bytes under the unchanged URL.

## Correction

- The 15 editable source masters remain the exact pre-Pass-4A files and match `docs/visual-qa/pass-4a/old-assets/` byte-for-byte.
- `tools/fingerprint-world-maps.js` creates byte-identical immutable runtime copies under `assets/worlds/world_01/maps/versioned/` and updates the authoritative world layouts, region data, map-editor runtime data, and `game.js` fallback map table.
- `assets/worlds/world_01/map-manifest.json` records source, runtime path, byte count, and full SHA-256 for all 15 maps.
- The production builder now fingerprints before copying and ships only the 15 immutable gameplay maps plus the map manifest.
- Service-worker cache-first and network-first lookup is scoped to the current `CACHE_NAME`; old Crownlands caches are deleted during activation.
- Source cache id: `20260812-pre-pass-4a-gameplay-maps-r2`.

No coordinates, objectives, blockers, routes, adjacency, dimensions, region IDs, world topology, troop movement, or gameplay rules changed.

## Automatic QA

- All 15 runtime files exist and each is byte-identical to both its restored source master and the archived pre-Pass-4A file.
- All 15 map-selector thumbnails use immutable fingerprints.
- All active gameplay mappings use immutable map fingerprints.
- `tools/qa-runtime-map-revert.js` installed a clean service worker, confirmed only the r2 Crownlands cache survived activation, fetched all 15 runtime maps through that worker with their expected byte counts, and rendered all 15 through the actual game map layer.

## Live Gameplay QA

- Authenticated gameplay on Ashenfen March loaded `assets/worlds/world_01/maps/versioned/region_14-14-1783024960400-7c8c938749c6.webp` behind cities, roads, map arrows, and HUD controls.
- Desktop 1440x900 passed with no clipping or missing background.
- Android landscape 844x390 passed with the same restored live background and responsive HUD.
- The actual gameplay renderer was exercised with controlled signed-out state for all 15 regions. For each region the harness rendered the world layer and asserted that its completed background image matched the region's immutable manifest URL. Crownlands Heart, North Frontier, and Southfields were captured at 1440x900; these captures include the real world background, cities, objectives, labels, navigation, and HUD rather than only the Map UI.
- The live realm reached its 50-player capacity while attempting additional authenticated region entries and placed the account in the realm waiting queue. The account was not forced through that online state; the controlled renderer captures and exact source/runtime/archive hash validation cover those representative maps.

## Remaining Review

The region capacity queue is an online realm-state behavior unrelated to map art. Dense labels on highly owned regions remain visually busy and were not changed because map coordinates and gameplay UI were out of scope.

## Final Test Record

- Gameplay map fingerprints: 15 maps / 8,927,742 bytes passed.
- Runtime synchronization, Pass 4A-R exact rollback, map loading, authoritative runtime, public content, animation, daily rewards, login resilience, audio delivery, patch notes, and instant economy validators passed.
- Server route parity: 1,050 cities, 15 maps, 1,050 local routes, 1,050 per-city cross-map routes, and 210 directed map chains passed.
- All-city routes: 1,050 cities, 32 portal transit routes, and 210 cross-map routes passed.
- Production artifact: 238 files / 21.35 MiB passed.
- JavaScript syntax and `git diff --check` passed.
- Known unrelated failure remains: `game.js` is 1606.4 KiB against the existing 1600 KiB source budget.
