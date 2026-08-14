# Reset persistence boundary

`reset-persistence-contract.js` provides a testable extraction contract. It is architecture and fixtures only; it does not run a reset or migrate data.

## Persists

- Flag customization from the player profile.
- Clan identity/membership references: `clanId`, `clanName`, `clanTag`, and `clanRole`, backed by `clans/{clanId}` and `clans/{clanId}/members/{uid}`.
- Common Gear from `players/{uid}.gear`: owned instances, equipped slots, levels/upgrades, duplicate progression, and unopened Common Gear boxes needed to reconstruct that subsystem.

The audit found no Common Gear city/region/world-object reference. It is normalized from the root profile `gear` field.

## Explicitly seasonal / excluded

Normal Bag consumables and effects are excluded: `shopItems`, `itemEffects`, and `itemPurchaseCooldowns`. Cities, starting city, ownership, NPC state, camps, Strongholds, Citadel, marches, rallies, reinforcements, operations, and active layer state are also not persistent identity progression.

Clan identity may persist, but seasonal clan relationships do not: `clans/{id}/rallies/*`, reset-generation rally state and world benefits, quest progress, gift activity, objective control, and clan leaderboard entries.

## Current blockers for the later reset migration

The existing `createFreshResetPlayerProfile` already preserves the Flag but initializes Common Gear with `COMMON_GEAR.createDefaultState()` and does not copy clan identity fields. A full reset migration must restore validated Gear and clan membership after fresh seasonal state is built, reconcile missing/disbanded clan records, and explicitly wipe consumables. Phase 3 intentionally does not alter that live mechanic.
