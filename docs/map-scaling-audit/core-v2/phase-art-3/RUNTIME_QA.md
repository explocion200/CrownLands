# Runtime QA

The candidates were loaded through the real Crownlands renderer using a loopback-only Phase B1 fixture adapter. Production code and data were not modified.

For every ART-3 map the browser run captured low, normal, and close zoom plus a selected/action state. It exercised the current city stages, names, player banners, foreign labels, shields, representative marches/routes, map arrows/Gates, Camps, Aurum Keep, and the Tower reservation outline.

Results:

- 15 zoom measurements;
- authoritative city counts `55/55/55/55/60` in every measurement;
- all five objectives/reservations rendered at their locked coordinates;
- zero castle, name, banner, foreign-label, troop-text, or objective/city collisions;
- all four cardinal edges represented as OPEN arrows or GATED edges on every map;
- mouse and touch probes succeeded for the tightest city pair on all five maps;
- representative routes rendered on all five maps.

The low-zoom performance samples ranged from 51.83 to 90.98 measured frames/second in the in-app QA browser. This is a visual-candidate comparison, not a new production performance threshold; the background swap does not change renderer architecture or gameplay density.
