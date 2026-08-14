# Authoritative spawn readiness

A generated region reaches development `STANDBY` only when all checks pass:

1. purpose is `player_region`;
2. coordinate is outside the permanent Core;
3. clockwise coordinate and topology are valid;
4. all open connections have reciprocal neighbors;
5. all gated connections have no target;
6. region definition identity matches the allocation;
7. at least 15 NPC cities exist;
8. every city clears land, blockers, structures, roads, transitions, and other cities;
9. at least two suitable future starting-city candidates exist;
10. neutral initialization remains Level 1 with 10 troops.

A passing development catalog entry records `spawnReady: true` and `spawnEligible: true`, but also `lifecycle: standby`, `visibility: development_only`, `activationAllowed: false`, and `publicationBlocked: true`. The Phase 3 production server only accepts active catalog entries, so a Phase 4 draft cannot enter real spawn selection.

Starting-candidate metadata records nearby NPC count, edge distance, local usable-territory ratio, nearest road-corridor distance, a deterministic score, and the nearby NPC IDs. Candidates are separated enough to avoid stacked starts while remaining close enough for overlapping expansion interests.
