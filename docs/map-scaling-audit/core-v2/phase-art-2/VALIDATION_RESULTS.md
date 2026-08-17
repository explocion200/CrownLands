# ART-2 validation results

## Geometry and scope

- Exactly five ART-2 candidates exist: Crown Citadel, Ironwatch, Southwest Holding Tower, Deed Camp, and West Support.
- Phase A `cities.json`, `composition.json`, `validation-receipt.json`, `map-clean.png`, and `map.webp` files are byte-identical to ART-1.
- All five B1 prototype directories remain unchanged; no B1 background was rebuilt.
- No new Core coordinate was generated.
- Candidate dimensions are exactly 1448×1086.
- Capacities remain 60/60/55/60/70.
- Locked city IDs and coordinates are unchanged and remain above the 68 px Core hard minimum.
- Objective coordinates/reservations, road sockets, cardinal topology, climates, adjacency, blockers, and transition definitions are unchanged.

## Runtime QA

The development-only Phase A.1 fixture was run with each candidate while continuing to consume the original definitions. Fifteen measurements cover all five maps at low, normal, and close zoom.

- Exact data city capacities: pass.
- Actual Citadel, Ironwatch, and Deed art overlays: pass.
- Holding Tower reservation-only overlay: pass.
- City, label, banner, troop-text, and objective collision counters: zero.
- Representative march routes: present at every measured zoom.
- Mouse tight-pair selection: reliable on all five maps.
- Touch tight-pair selection: reliable on all five maps.
- Selection rings and action states: captured for all five maps.
- Visual city/prop conflicts: zero after the Deed cluster correction.
- Road, transition, and perimeter obstructions: zero.

## Art gates

- Same art family as approved Crownlands structures: yes for all five.
- Materially better/more modern/coherent than each prototype: yes for all five.
- ART-1 simplicity and prop budget: pass.
- Literal edge barrier with road-only openings: pass.
- Shared camera, lighting, road, border, scale, and material language: pass.
- Center → West → Southwest/South climate progression: pass.

## Production safety

Production remains 15 maps, 1,050 cities, 210 directed chains, and zero generated ACTIVE regions. The approved generated-player-region asset manifest remains unchanged at `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`. No production runtime, Firebase data, map, city, ownership, spawn, topology, or rollout file was modified. Nothing was pushed, merged, activated, or deployed.

Final commands and results:

- `node tools/validate-core-v2-phase-art-2.js`: **PASS**
- Phase A.1 validator: **PASS**
- Phase B1 validator: **PASS**
- ART-1 validator: **PASS**
- production build: **PASS**, 262 files / 21.49 MiB
- production artifact validation: **PASS**, 263 files / 21.52 MiB
- Node syntax checks: **PASS**
- secret scan: **PASS**, zero matches
- machine-local path scan: **PASS**, zero matches
- production leakage scan: **PASS**, zero matches
- `git diff --check`: **PASS**
