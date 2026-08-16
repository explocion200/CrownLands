# Production integration architecture

## Boundary

Generation is a controlled server/admin operation. It never runs in the browser or normal map-render loop. The Phase 7 worker consumes an allocated coordinate plus the approved Phase 6F deterministic record and produces a complete STANDBY package.

The prototype uses an emulator store with transaction mutexes and content-addressed object paths. A production implementation should map these boundaries to a server worker, immutable object storage, and authoritative Firebase transactions without changing their contracts.

## Data flow

1. The controller reads only the lightweight region catalog.
2. It allocates the next clockwise coordinate outside the permanent 5×5 Core.
3. The worker rebuilds and validates the approved composition, 40 cities, four starting candidates, blockers, roads, edge contracts, map, and thumbnail.
4. The package remains STANDBY and undiscoverable.
5. An administrator explicitly approves publication.
6. Assets upload to immutable versioned paths and are hash-verified.
7. One publication transaction exposes catalog entry, region definition, cities, topology template, and publication marker together.
8. A separate administrator action activates the published package and atomically initializes authoritative city ownership.
9. Runtime neighbor state may change GATED to OPEN without changing package files or hashes.

## Source-of-truth split

- Immutable: package identity, map, thumbnail, region definition, city definitions, blockers, roads, edge contracts, generator metadata, validation receipt, package manifest.
- Mutable authoritative runtime state: lifecycle, current ownership, spawn eligibility, active topology, OPEN/GATED state, player assignment.
- Client: consumes published/active definitions lazily; it never chooses coordinates, creates packages, activates regions, or derives the NPC threshold from static metadata.

## Lazy loading

Startup reads a lightweight combined catalog. Definitions, cities, topology, and map bytes are excluded. The bounded definition cache is four regions in the prototype. Neighbor travel fetches the destination definition on demand.

The 128-region simulation produced a 118,121-byte combined startup catalog and a 14,994-byte first generated-region definition payload. No map bytes or full definitions were included at startup.
