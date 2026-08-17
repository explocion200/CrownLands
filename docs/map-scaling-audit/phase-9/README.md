# Phase 9 — Real Firebase staging implementation

Phase 9 implements and exercises the generated-world control plane in the isolated Firebase project `crownlands-map-staging-2026`. The production project is `crown-land-b15e0`; every staging mutator rejects that project and requires an explicit staging confirmation. Destructive cleanup and recovery additionally require a second exact confirmation.

The real rehearsal created only synthetic staging state: a 25-cell Core, three ACTIVE generated regions, two STANDBY packages, 200 deterministic city definitions, and synthetic identities. All five rollout controls were returned to OFF. Production stayed at 15 maps, 1,050 city definitions, 210 directed chains, and zero generated ACTIVE regions.

Phase 9 is not a production-readiness PASS yet. Required Android and iPhone physical-device runs were unavailable, moderate/slow network results are deterministic throttling over real staging responses rather than carrier-field tests, external paging destinations were not authorized, and full raster generation was run by the two-worker benchmark adapter rather than a deployed cloud composer worker. These are explicit blockers, not waived gates.

Evidence is under `docs/map-scaling-audit/phase-9/results/`. Staging code and tools are under `tools/map-scaling-phase-9/`. Nothing in this phase is imported by the production runtime or copied into `dist/`.

The consolidated gate record is in `VALIDATION_RESULTS.md`.
