# ART-4 runtime QA — externally deferred

Static runtime composites passed for all five maps using current city and objective assets. The overlays verify 55-, 60-, and 70-city density, objective dominance, city-safe pockets, road readability, and perimeter clearance.

An isolated loopback fixture was prepared for all five ART-4 maps plus available locked neighbors. It is development-only and does not modify Firebase or production state.

The fixture served successfully at `http://127.0.0.1:8816/__core_b1__/` and returned HTTP 200. A fresh in-app Browser session nevertheless reported a saved local-origin permission block. Per browser-safety rules, no alternate port, hostname, browser surface, or raw CDP workaround was attempted. This is an external Codex Browser permission failure, not a Crownlands failure.

```yaml
interactiveRuntimeQA:
  status: DEFERRED_EXTERNAL_TOOL_BLOCK
  blocker: CODEX_BROWSER_LOCAL_ORIGIN_PERMISSION
  productionBlocking: true
  artProductionBlocking: false
```

ART-4 is approved for a development art checkpoint from its static review, exact geometry validation, current-asset composites, road/topology validation, objective placement, spacing, climate continuity, artifact validation, and the established runtime evidence from the first ten approved Core maps. Interactive runtime QA is explicitly **deferred**, not passed.

No candidate art, gameplay geometry, runtime source, or production state changed during the failed Browser attempts. Only this checkpoint documentation and the blocker receipt record the outcome.

## Mandatory future production gate

Before Core v2 may replace production maps, enter live-world migration, activate, or be used for a season reset, run a final consolidated interactive QA pass across all 25 finished Core maps. It must include the five deferred ART-4 maps and cover:

- low, normal, and close zoom;
- mouse and touch-equivalent city selection;
- labels, banners, troop text, selection rings, and action wheels;
- friendly and hostile routes;
- objective artwork;
- OPEN/GATED edges;
- 55-, 60-, and 70-city densities;
- representative performance profiling.

The machine-readable evidence is preserved in `benchmark-results/map/core-v2-phase-art-4/browser-blocker-receipt.json`.
