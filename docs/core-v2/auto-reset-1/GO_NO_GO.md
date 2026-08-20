# Automatic GO / NO-GO contract

`CUTOVER_READY` requires every hard check to pass. There is no warning override and no manual approval bypass inside the automatic path.

The 39 machine checks cover:

- environment identity, active source season, scheduled invocation, lock identity, and exact candidate version;
- completed backup, valid backup receipt, and approved recovery protection;
- exactly 25 Core maps, 1,480 Core cities, 17 objectives, locked package hash, objective coordinates, reciprocal topology, and Core `spawnEligible=false`;
- sufficient active outer capacity, exactly 40 cities per generated region, exactly two STANDBY regions, immutable edge contracts, and clockwise allocation;
- exact player pagination count and byte/checksum-equivalent Flag, Clan, owned/equipped Common Gear, levels, upgrades, and duplicate progression;
- zero migrated Bag consumables, ownership, marches, rallies, reinforcements, objective ownership, old main-city assignments, or other prohibited seasonal state;
- server-authoritative main-city restrictions, environment guard, and zero unauthorized cutover paths.

Any failed check sets `automaticCutoverAllowed=false`. The final failure rehearsal deliberately changed `persistence.gearLevelsMatch` and reached `VALIDATION_FAILED`; the pointer remained on `season-2026-10` and maintenance unwound safely.

Fresh starting cities are always in eligible ACTIVE outer regions. The claim transaction derives current NPC ownership authoritatively. A claim at 15 NPC cities may leave 14; the next claim is rejected without closing the region or affecting travel or ownership. Expansion then activates the next approved clockwise PUBLISHED package while preserving the two-region STANDBY buffer.
