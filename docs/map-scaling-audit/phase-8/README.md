# Crownlands Map Scaling Phase 8

Phase 8 hardens the approved Phase 7 generated-world architecture in a local production-equivalent staging harness. It does not add production runtime code, change the approved generator or 118-asset library, write Firebase production data, activate a production region, merge, deploy, or push.

Decision: the architecture is ready for an isolated Firebase staging-project implementation and Stage 0 rollout preparation. It is not yet authorized for production deployment or generated-region activation.

Locked production baseline:

- 15 maps
- 1,050 cities
- 210 directed map chains
- zero generated ACTIVE production regions
- 118 approved generation assets
- asset-manifest SHA-256 `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`

The authoritative rollout feature flag remains OFF. Generation may run only in explicit development/staging administration. Publication and activation require separate approvals, and all expansion kill switches preserve normal gameplay on already-active maps.

Evidence is under `benchmark-results/map/phase-8/`. The executable harness is `tools/run-map-scaling-phase-8.js`; the checkpoint gate is `tools/validate-map-scaling-phase-8.js`.
