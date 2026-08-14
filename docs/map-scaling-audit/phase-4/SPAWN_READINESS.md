# Authoritative spawn readiness

A generated region reaches development `STANDBY` only when all checks pass:

1. purpose is `player_region`;
2. coordinate is outside the permanent Core;
3. clockwise coordinate and topology are valid;
4. all open connections have reciprocal neighbors;
5. all gated connections have no target;
6. region definition identity matches the allocation;
7. exactly 40 valid city positions exist;
8. every city clears land, blockers, structures, roads, transitions, and other cities;
9. at least two suitable future starting-city candidates exist;
10. neutral initialization remains Level 1 with 10 troops.

A passing development catalog entry records `generationReady: true`, `cityCapacity: 40`, and `initialNpcCityCount: 40`. Because STANDBY is not ACTIVE, its runtime `spawnReady` and `spawnEligible` values remain false alongside `visibility: development_only`, `activationAllowed: false`, and `publicationBlocked: true`.

Runtime eligibility is derived server-side for each placement attempt. The region must be ACTIVE, non-core, a valid `player_region`, and have reciprocal valid topology. The claim transaction reads the authoritative current-generation city ownership documents and requires `currentNpcCityCount >= 15`; static catalog metadata alone cannot authorize placement. Falling below 15 blocks only future placement and does not remove players, close the region, alter travel, reset ownership, or deactivate gameplay.

Starting-candidate metadata records nearby NPC count, edge distance, local usable-territory ratio, nearest road-corridor distance, a deterministic score, and the nearby NPC IDs. Candidates are separated enough to avoid stacked starts while remaining close enough for overlapping expansion interests.
