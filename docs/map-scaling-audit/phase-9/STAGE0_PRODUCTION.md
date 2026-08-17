# Future production Stage 0 — code only, controls OFF

This is a reviewed procedure, not authorization to deploy. Phase 9 did not run these commands.

## Preconditions

1. Phase 9 external blockers are closed and a separate production rollout approval names the exact commit and operator.
2. The production integration package has removed staging constants while retaining a deny-by-default project allowlist.
3. Production controls exist with all five values false and an approved break-glass rollback procedure.
4. A fresh read-only baseline preflight passes immediately before and after deployment.
5. The deploy target is independently displayed and confirmed as `crown-land-b15e0`; no staging credentials or synthetic IDs are present.

## Exact future command sequence

```powershell
$env:CROWNLANDS_PRODUCTION_PREFLIGHT_PROJECT_ID = 'crown-land-b15e0'
$env:CROWNLANDS_PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT = 'READ_ONLY_PRODUCTION_PREFLIGHT:crown-land-b15e0'
node tools/map-scaling-phase-9/production-baseline-preflight.js

# Separate approved Phase 10+ tooling must verify, without enabling:
# generatedWorldEnabled=false
# generationEnabled=false
# publicationEnabled=false
# activationEnabled=false
# expansionEnabled=false

firebase projects:list
firebase use crown-land-b15e0
firebase deploy --project crown-land-b15e0 --only functions:<approved-generated-world-functions>,firestore:indexes

node tools/map-scaling-phase-9/production-baseline-preflight.js
```

Security Rules and Storage Rules are intentionally not included in a code-only Stage 0 command until their production-wide compatibility is separately reviewed; deploying a whole rules file could affect unrelated live gameplay. Hosting, generated packages, region documents, city documents, topology, rollout controls, and production data are excluded.

The expected result is still exactly 15 maps, 1,050 city definitions, 210 directed chains, zero generated ACTIVE regions, no coordinate locks/packages, and all controls OFF. Any mismatch stops the rollout; it does not trigger an automated “fix.”

The current Phase 9 functions are staging-hard-coded and must not be deployed to production. Phase 10 planning must create the reviewed production integration boundary before Stage 0 can be executable.
