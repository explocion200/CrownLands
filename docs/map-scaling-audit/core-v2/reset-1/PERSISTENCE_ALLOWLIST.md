# Persistence allowlist

RESET-1 uses an allowlist, not a denylist. `reset-persistence-contract.js` contract version 2 extracts only:

- player Flag customization;
- clan identity and membership references: `clanId`, `clanName`, `clanTag`, `clanRole`;
- owned Common Gear instances;
- equipped Common Gear slots;
- Common Gear instance level, upgrade timestamp and duplicate instances that directly encode Gear progression.

The persisted Gear payload contains exactly `schemaVersion`, `instances` and `equipped`. Normal consumables do not persist. Unopened Common Gear boxes, box-opening receipts, shop-purchase state and new-marker UI state are excluded by the strict RESET-1 interpretation.

The following are rebuilt or reset:

- main/starting city and all city ownership;
- NPC state, attacks, marches, rallies and reinforcements;
- Camps, Strongholds, Citadel, Tower reservations and seasonal objective control;
- activated regions, player placement and seasonal achievements;
- Gold, daily missions and daily-login state;
- Peace Shield, War Drums, Tax Decree, Veil of Silence, Swift March, Recall Horn and every normal Bag consumable/effect/cooldown.

Clan documents and membership survive as persistent identity. Clan rallies, seasonal benefits, objectives, quest progress, gifts and seasonal leaderboard state do not.

Four synthetic players with different Flags, two clans, equipped and unequipped Common Gear, upgraded Gear, unopened boxes, consumables, old cities, active marches, attacks, rallies, reinforcements and objectives passed before/after hash verification. Persistent hashes matched; reset fields did not carry forward.
