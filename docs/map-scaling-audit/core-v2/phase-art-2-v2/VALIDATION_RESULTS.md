# ART-2 v2 validation results

The authoritative result is produced by `node tools/validate-core-v2-phase-art-2-v2.js`.

Validated invariants:

- exactly five separate ART-2 v2 background candidates;
- no new Core coordinates;
- 1448x1086 dimensions;
- capacities 60, 60, 55, 60, and 70;
- Phase A city, composition, validation, PNG, and WebP files byte-identical to the ART-1 base;
- Phase B1 prototype files unchanged;
- ART-2 current candidate PNG hashes unchanged;
- objective locations, road sockets, topology, blockers, transition zones, climate assignments, adjacency, and spawn rules unchanged through locked composition hashes;
- 68 px Core hard minimum spacing retained;
- 15 runtime samples across low, normal, and close zoom;
- zero reported city/label/banner/troop/objective collisions;
- mouse and touch tight-pair interaction reliable on all five maps;
- route elements present and cardinal OPEN/GATED counts valid;
- no production file change or artifact leakage;
- production remains 15 maps, 1,050 cities, 210 directed chains, and zero generated ACTIVE regions.

Visual gate answers are all YES. ART-2 v2 received explicit approval and is now the authoritative final standard for future Core art. This checkpoint does not replace production maps or automatically rebuild any other Core background.

## Final checkpoint gates

- ART-1 validator: PASS with the ART-2 work temporarily isolated from its historical scope check.
- ART-2 validator: PASS.
- ART-2 v2 validator: PASS; five approved final-style maps and five unchanged B1 maps.
- Core A.1 validator: PASS at approved commit `8909aeee24aa99ecb58851c41eccac36815b4a54`.
- Core B1 validator: PASS at approved commit `ef66754bab49a88bd694b9f55c5cc3ef1e0333b3`.
- Phase 0 regression: PASS, 253 checks.
- Authoritative Phase 1 decision: PASS, 216 checks.
- Phase 2 regression/capacity/decision: PASS, 297 / 24 / 146 checks.
- Phase 3 through Phase 6F authoritative validators: PASS.
- Phase 7 validator: PASS at approved commit `004f67c22b98ec107c86d16641cc073b9892d0e8`.
- Phase 8 validator: PASS at approved commit `dac3ef0d3758`.
- Phase 9 engineering validator: PASS at approved commit `99e56a8b1a40`; its previously documented physical-device, carrier-network, paging, and hosted-worker production-readiness blockers remain explicit and are not waived.
- Full static release gate: PASS, including zero-vulnerability production dependency audit, production lint, full application tests, and route parity.
- Route parity: PASS for 1,050 cities, 15 maps, 1,050 local routes, 1,050 per-city cross-map routes, and 210 directed map chains.
- Production build: PASS, 262 files / 21.49 MiB.
- Production artifact validation: PASS, 263 files / 21.52 MiB.
- Production leakage, embedded-secret, machine-local-path, trailing-whitespace, and Git diff checks: PASS.

The generated-player asset library remains 118 assets with manifest hash `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`. Production remains 15 maps, 1,050 cities, 210 directed chains, and zero generated ACTIVE regions.
