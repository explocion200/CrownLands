# ART-1 Validation Results

## Final result

`node tools/validate-core-v2-phase-art-1.js` — **PASS**

The validator confirmed:

- branch `codex/core-v2`, based directly on approved checkpoint `ef66754bab49a88bd694b9f55c5cc3ef1e0333b3`;
- nine non-empty development reference boards plus one derived review overview;
- eight required art-direction documents;
- exactly ten existing prototypes, with all ten pinned `map.webp` SHA-256 values unchanged;
- all 30 city/composition/validation definition files byte-identical to the approved base;
- exactly five Phase A and five Phase B1 prototype directories;
- zero additional Core maps and zero final-map-shaped ART-1 packages;
- 25-map / 1,480-city Core specification remains documented and unchanged;
- 68 px hard / 70 px preferred Core spacing and 112 px outer spacing remain locked;
- no file outside the three ART-1 development-only paths changed;
- production baseline remains 15 maps / 1,050 cities / 210 directed chains / 0 generated ACTIVE regions;
- generator asset-manifest SHA-256 remains `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`;
- zero production-artifact references to ART-1 files.

## Raster QA

All ten PNGs opened and verified successfully. The nine boards are RGB raster studies between 1402×1122 and 1536×1024; two use a 1448×1086 review canvas but remain unmistakable four-panel reference boards and contain no final map package, city definition, thumbnail, or publication metadata. The overview is a derived 1500×1101 RGB contact sheet.

Visual inspection confirmed that every board:

- retains an open playable interior or open objective influence area;
- uses the same grounded painterly structure-led material family;
- keeps regional identity restrained;
- contains no baked city, Camp, Stronghold, Citadel, Holding Tower, Gate, arrow, label, or UI;
- is presented as cropped studies rather than a production-ready map.

The first Camp and Tower drafts were intentionally rejected and replaced before locking. The final Camp board uses perimeter-biased Gold mining and a small Deed settlement; the final Tower board uses broken contested-earth traces rather than a neat ring-road motif.

## Supplemental scans

- Core Phase A specification/slice/topology/production assertions: **PASS** at the `8909aeee…` checkpoint. The original Phase A runner's legacy phase-local diff guard reports the co-committed, approved Phase A.1 files as later scope; the compatibility run filtered only those known A.1 path names from that one scope-list assertion. No topology, capacity, spacing, artifact, production, or asset threshold was filtered or weakened.
- Core Phase A.1 validator: **PASS** at `8909aeee…` — exact capacities, 15 runtime measurements, zero recorded collisions, 30 mouse plus 30 touch probes, and ≥68 px spacing.
- Core Phase B1 validator: **PASS** at `ef66754b…` — five exact maps, reciprocal cardinal topology, shared-edge treatments, runtime interaction probes, production baseline, and pinned raster hashes.
- Node syntax check: **PASS**
- `git diff --check`: **PASS**
- ART-1 text trailing-whitespace scan: **PASS**
- machine-local absolute-path scan: **PASS**
- private-key/API-token pattern scan: **PASS**
- production runtime/artifact leakage scan: **PASS**, zero matches

## Production safety

No runtime, Firebase, live-map, city, ownership, topology, spawn, rollout, generator-asset, or production-artifact file changed. No deployment, merge, generated-region activation, or final-art production occurred.
