# Skill point system v2 reset

This release replaces the legacy skill-key migration with the canonical eight-skill point model. Every current-realm player is reset once to empty skill allocations and empty preset slots. Hero level and XP are preserved, and unspent points are recalculated as `Hero Level - 1`.

## Safety model

- `players/{uid}.skillPointSystemVersion` is the idempotency marker. Version `2` is current.
- The first authoritative sync settles production through the reset timestamp, then clears skills and presets in the same transaction.
- Before the reset commits, the old skill state is copied to `maintenanceBackups/skill-point-system-v2/players/{uid}`.
- Canonical skill maps are replaced as whole fields, removing legacy nested keys such as `attack`, `income`, `striker`, and `guardian`.
- The normal client save path cannot write the reset marker, skill allocations, presets, or legacy reset credits.
- Current v2 profiles always normalize legacy reset credits to zero, and `enforceSkillPointSystemState` removes any credit reintroduced by an older deployed callable bundle.
- `resetAllPlayerSkills` is admin-only, defaults to a dry run, processes at most 100 profiles per page, and requires the exact confirmation value `skill-point-system-v2` before applying changes.
- Bulk reset and rollback operations enter each target player's assigned realm shard before settling production or reading city state.

## Deployment

1. Deploy Firestore rules and Functions first.
2. Verify `getRealmInfo` reports `skillPointSystemVersion: 2`.
3. Invoke `resetAllPlayerSkills` with `dryRun: true` and a conservative page size. Review `wouldReset`, skipped profiles, and errors.
4. Invoke the same page with `dryRun: false` and `confirm: "skill-point-system-v2"`.
5. Continue with the returned `nextCursor` until `hasMore` is false. Retry only error entries; successful players are protected by the version marker.
6. Deploy the web client after the server reports version `2`.
7. Confirm a migrated account has zero assigned skills, four empty presets, and `Hero Level - 1` unspent points.

Players who sign in before the bulk pass reaches them are migrated by `syncSkillPointSystem`, using the same transaction and backup path.

## Rollback

Use the admin-only `rollbackPlayerSkillPointSystem` callable with the player UID and `confirm: "skill-point-system-v2"`. It settles current production, restores the normalized backed-up allocation and presets, recalculates remaining points, keeps legacy reset credits at zero, and records `skillPointSystemRollbackAtMs`. Rollback is intentionally per player so a backup can be inspected before it is restored.

The backup contains only skill-related fields. Inventory, currency, cities, account identity, achievements, settings, and other progression are never part of the reset patch.
