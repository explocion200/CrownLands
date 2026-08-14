# Spawn architecture

Functions now derives starter candidates from the server-side catalog. A candidate must be active, `purpose: player_region`, `permanentCore: false`, `spawnEligible: true`, `spawnReady: true`, and have at least `minimumSpawnNpcCities` neutral/NPC cities. The server constant and catalog metadata set that future minimum to 15.

All 25 core coordinates are authoritatively non-spawnable. Core maps remain accessible for travel and objectives; no-spawn is not no-access.

Current candidates remain exactly Regions 11–15. Each already exceeds 15 NPC cities, so present placement behavior and ordering remain compatible. Catalog selection is sorted by layer, clockwise order, then stable ID and no longer depends on a manually maintained starter-map list.

Phase 3 validates readiness metadata but does not place cities, create neutral records, activate new layers, or migrate/reset players. Future activation must validate the full region definition and authoritative neutral-city availability before setting `spawnReady`.
