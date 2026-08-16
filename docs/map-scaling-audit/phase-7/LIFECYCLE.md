# Region lifecycle

Authoritative states:

`ALLOCATED → GENERATING → VALIDATING → STANDBY → PUBLISHING → PUBLISHED → ACTIVE`

`FAILED` is reserved for an explicitly rejected unpublished attempt or a terminal diagnostic state.

## State meaning

- `ALLOCATED`: the unique clockwise coordinate is reserved; no package is visible.
- `GENERATING`: a controlled worker is producing a deterministic package.
- `VALIDATING`: the complete package is checked before storage eligibility.
- `STANDBY`: all files exist as a validated candidate, but the region is not discoverable or active.
- `PUBLISHING`: immutable uploads and staged authoritative metadata are being prepared.
- `PUBLISHED`: one atomic marker makes the complete package discoverable; it is still inactive and spawn-ineligible.
- `ACTIVE`: a separate transaction has initialized exactly 40 neutral city ownership records and enabled gameplay.
- `FAILED`: no catalog publication or activation marker exists.

Only server/admin authority may transition these states. `PUBLISHED` is not equivalent to `ACTIVE`. A failed publish returns to `STANDBY`; an activation failure leaves the region `PUBLISHED` with no partially initialized cities.

## Spawn lifecycle

Activation starts with 40 authoritative neutral cities. The current NPC count is recomputed inside the serialized claim operation. A claim with 15 NPC cities remaining is allowed and leaves 14. The next new-player claim is rejected. Existing players, ownership, travel, topology, and activity remain intact.
