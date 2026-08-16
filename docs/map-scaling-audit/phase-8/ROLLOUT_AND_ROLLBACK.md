# First production rollout and rollback

## Controlled stages

0. Deploy code with generated-world feature flag OFF. Roll back code only; world remains unchanged.
1. Verify 15 maps, 1,050 cities, 210 directed chains, zero generated ACTIVE regions, and the asset hash. Stop on drift.
2. Generate the first package and retain STANDBY. Reject or version-retry the unpublished package at the same coordinate if needed.
3. Publish the immutable package but keep it inactive. If unhealthy, disable activation and retain the published package/marker.
4. Admin verifies assets, hashes, 40 city definitions, sockets, edges, catalog, backups, and alerts. Keep PUBLISHED/inactive on failure.
5. Enable only the scoped rollout gate and atomically activate the first region. On failure, engage activation/expansion switches and preserve ownership.
6. Monitor one complete health window. Stop expansion on alerts; already-active gameplay continues.
7. Prepare the next clockwise region only after health approval. Keep it STANDBY until separately reviewed.

## Rollback boundaries

Code rollback and world-data rollback are separate. Ordinary code rollback never deletes world data. PUBLISHED packages remain immutable. If an ACTIVE region has ownership, rollback preserves players, cities, and package references; corrective world changes require a separately reviewed versioned migration.

Before PUBLISHED, a package can be rejected or retried with an explicit retry salt at the same coordinate. After PUBLISHED, there is no silent regeneration path.
