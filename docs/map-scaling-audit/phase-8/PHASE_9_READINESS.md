# Phase 9 readiness

Phase 8 supports proceeding only to a reviewed staging-project implementation and Stage 0 code-deployment preparation. It does not authorize deployment or activation.

Blockers before the first real production deployment:

1. Provision an isolated Firebase staging project/bucket and rerun Phase 8 against real Firestore, Storage, Functions, IAM, and CDN.
2. Implement and review production IAM/Security Rules for generation, publication, activation, edge contracts, hashes, lifecycle, and feature controls.
3. Provision the authoritative rollout flag and kill switches with default OFF.
4. Configure managed backup, PITR, Storage versioning, manifest inventory, restore drills, budgets, dashboards, and paging.
5. Complete physical mobile-device/network/image-decode QA against staged generated maps.
6. Confirm real billing region, bucket class, CDN, logging volume, and operator ownership.
7. Approve a Stage 0 code-only deployment window and rollback runbook.

Recommended Phase 9: production-equivalent Firebase staging implementation and Stage 0 deployment rehearsal only. Do not automatically activate generated regions.
