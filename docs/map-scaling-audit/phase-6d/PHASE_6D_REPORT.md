# Phase 6D — Macro-Variation Expansion

## Scope and safety

Phase 6D is a development-only expansion and benchmark. It does not publish or activate generated regions, change the 15 production maps or 1,050 production city definitions, change Firebase data, alter player spawning, or modify the locked Phase 6B library. All generated packages are explicitly inactive and non-publishable.

## Locked expansion

The reusable library increased from 86 to exactly 118 assets:

| Family | Phase 6B | Added | Phase 6D total |
| --- | ---: | ---: | ---: |
| Foundation plates | 4 | 8 | 12 |
| Perimeter barriers | 32 | 16 | 48 |
| Internal road modules | 0 | 8 | 8 |
| Other locked assets | 50 | 0 | 50 |
| **Total** | **86** | **32** | **118** |

Each North, East, South, and West family now has three foundation plates. Each family receives four alternate full-side edge segments and two internal-road modules. The existing road presentation remains available, producing nine distinct internal road geometries across the four themes. No interior accent was added and the approved four-accent composition density remains unchanged.

## 1,000-map result

The authoritative study generated 1,000 deterministic packages: 280 North, 252 East, 247 South, and 221 West. Every package contains a 1448×1086 WebP, a 320×240 thumbnail, exactly 40 cities, exactly four starting candidates, four aligned cardinal road sockets, and edge-touching barriers. There were zero exact duplicate plans, rasters, WebPs, city layouts, or complete packages.

Near-duplicate pairs at or above 0.965 fell from 35,849 to 630 (98.24%). Pairs above 0.98 fell from 5,191 to 67 (98.71%). The highest score fell from 0.999471 to 0.997667. Maps appearing in at least one flagged pair fell from 1,000 to 570.

The feasibility-first city selector eliminated the Phase 6C retry tail: zero maps required retries, compared with 680 maps and 3,831 retries previously. All 1,000 maps passed with at least 112 px city separation and no final failures.

## Decision

The 118-asset library is sufficient for the measured 1,000-map target and is ready for production-integration planning. It is not yet proven sufficient for 10,000 maps: the conservative exposure gate remains false because 57% of the 1,000-map sample appears in at least one flagged pair. No further art is recommended now. A direct 10,000-map development benchmark should be an integration-planning gate before production activation.

This is a macro-repetition result, not an art-style change. The approved Crownlands style, directional identities, open interior, restrained decoration, edge barriers, and cardinal road sockets remain locked.
