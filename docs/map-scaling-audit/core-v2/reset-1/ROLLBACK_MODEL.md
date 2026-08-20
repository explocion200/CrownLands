# Rollback and abort model

Before the active pointer changes, any failure marks the replacement season `ABORTED`. The current pointer and old season remain unchanged. Partial replacement data is retained for diagnosis; it is not authoritative or player-visible.

After the pointer changes, rollback restores the old world/season pointer with a monotonic revision, marks the new season aborted/retired, and keeps both datasets. It never tries to merge new ownership back into the old season and never deletes either season as part of the emergency action.

The deterministic operation ID and input receipt hash make retries idempotent. Reusing an operation ID with different input is rejected. Replaying identical input produces identical season, city and receipt hashes and does not duplicate city IDs or ownership.

Validated faults:

- failure before Core initialization: old pointer retained;
- failure during player migration: old pointer retained and no partial player cutover;
- failure after pointer switch: old pointer restored, new season marked aborted;
- verification pagination fault in real staging: pointer remained on the synthetic old season; identical replay completed safely.

Operators must not improvise cleanup during a failed reset. Preserve evidence, force rollout controls OFF, restore/retain the old pointer, and follow the production checklist.
