# Production-like staging architecture

The Phase 8 harness mirrors the Phase 7 server contract without connecting to production:

- Firestore: isolated transactional maps for allocation locks, lifecycle, publication markers, catalog, topology, city definitions, and current-generation ownership.
- Storage: isolated immutable, content-addressed objects rooted at `generated-worlds/v1/worlds/{world}/seasons/{season}/regions/{region}/packages/{packageHash}/`.
- Functions/runtime: controlled Node worker and controller; generation never runs in the client render loop.
- Authentication: authenticated `crownlands_map_admin` authority, required audience, staging-bound environment, request schema, control revision, and idempotency key.
- Studio: explicit publication and activation approval stages.
- Client: hierarchical catalog, on-demand definitions, content-addressed map URLs, and bounded four-region cache.

The environment name is `phase8-production-equivalent-staging`. Requests targeting production are rejected even when the actor otherwise has the admin role. The feature gate defaults OFF; staging rehearsal is a separate non-production permission.

This is production-equivalent logic, not a real staging Firebase project. Provisioning that project and rerunning these receipts against real Firestore, Storage, IAM, Functions, CDN, and devices is a blocker before deployment.
