# Troop accounting consistency

This carries the remaining accounting corrections from PR #350 onto the current
implementation, preserving the Tower ownership, generation, shard and safe-count
guards shipped in PR #351. It does not change the existing two-power-per-troop rule,
combat balance, replacement power, defensive power, or player identity.

## Corrected paths

- Newly dispatched marches use the canonical movement's realm scope before the
  transaction calculates King Power. City and Tower departures therefore remain
  counted without waiting for a later economy refresh.
- Camp transfer and combat calculations include the pending Camp patch. Arriving
  troops count immediately, and captured Camps leave the former holder's total.
- Stats rebuild and identity repair read profiles, cities, Camps, marches and clan
  benefits in the same transaction that publishes stats. A conflicting troop move
  retries those reads. Identity repair now includes held Camps.
- Existing identity-change and current-owner projection guards remain in place.
  Player names, flags, troop ownership and archived realms are not rewritten.

## Validation and rollout

Stats authority advances from version 11 to 12 to invalidate stale snapshots through
the existing refresh paths. There is no mass player-data migration. Deploy and verify
the backend before publishing the version-12 client; old clients can consume the newer
server stats during rollout. Deployment status must be verified separately from merge.

The executable accounting regression covers all six troop categories, dispatch and
arrival conservation, Camp capture, duplicate/rally exclusion, foreign-realm Tower
counters, public/client totals and both repair paths with a retried transaction.
The Tower lifecycle emulator additionally checks persisted stats during withdrawals,
reinforcements, repairs, canceled attacks, Camp capture and Camp transfers, alongside
the previously shipped Tower lifecycle assertions. The validation plan selects the
affected movement, rally, economy, identity, protection and realm dependencies.
