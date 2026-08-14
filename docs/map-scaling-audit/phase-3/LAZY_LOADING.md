# Lazy region definitions

The production page no longer loads `assets/map-editor-data.js`. Startup loads the small catalog and only the required start/home region definition. Static city base records are built only for the active or requested region.

Definitions use `assets/worlds/world_01/regions/{region}.json`. A four-entry LRU bounds the in-memory static-definition cache. The active definition is protected; the least-recently used unprotected entry is evicted. Eviction also clears the corresponding derived static-city base. Evicted data is safe to fetch again because realtime ownership/player state is not stored in this cache.

After the active region is ready, at most two neighbor definitions are prefetched after a three-second delay. This is deliberately bounded and accompanies the existing map-image prefetch strategy.

Transitions await the target definition before changing the current region. A failed request leaves the player on the current map, clears the failed promise so retry is possible, and uses the existing toast/loading behavior. Starting gameplay also waits for the required home definition.

The service worker uses a separate build-scoped region-definition runtime cache capped at 8 requests. Map/thumbnail media has a separate 12-request cache. Neither grows with the total catalog.
