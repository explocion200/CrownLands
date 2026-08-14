# Startup before/after

The before run is the approved Phase 2 `A/desktop` artifact from 2026-08-13. The after run is the `A/desktop` row from the final fresh Phase 3 authenticated full matrix on the same machine. Time and heap are informative single-run observations, not claimed statistical improvements.

| Measure | Before Phase 3 | After Phase 3 |
| --- | ---: | ---: |
| Region definitions present at startup | 15 | 1 |
| Static city definitions present at startup | 1,050 | 50 in Scenario A's active region |
| Static world definition payload | 336,631-byte full `map-editor-data.js` | 52,970 raw bytes for browser catalog + production Region 11 definition; 74,671 including shared catalog runtime |
| Benchmark transferred catalog/definition bytes | not previously instrumented | 50,051 encoded bytes, including benchmark catalog adapter and one region definition |
| Region-definition requests by ready | not separately requested | 1 |
| Active-region ready | 1,031.4 ms | 905.7 ms |
| CDP JS heap after scenario | 6,384,624 bytes (6.09 MiB) | 7,984,780 bytes (7.61 MiB) |

At initial readiness the Phase 3 debug snapshot reported 15 catalog entries, one loaded definition, 50 loaded city definitions, no definition failures, and cache limit 4. Startup did not request definitions for the other 1,000 current city records. A neighbor switch and return completed with no console error and exercised on-demand loads.

The raw production comparison uses the exact tracked pre-Phase-3 editor bundle and built Phase 3 artifacts. The benchmark fixture trims each definition to the selected load scenario, which is why its transferred Region 11 JSON is smaller than the full production Region 11 definition.
