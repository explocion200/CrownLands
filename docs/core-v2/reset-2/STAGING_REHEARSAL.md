# RESET-2 exact-candidate staging rehearsal

## Decision

The exact RESET-2 candidate passed a fresh isolated Firebase staging rehearsal and an exact remote replay. This is evidence for the August 25 technical test window; it does not authorize the September production reset.

Candidate ID: `reset2-candidate-2e68667049a02b05`
Source bundle: `2e68667049a02b05fef2e1d5d706de26b7075b32b13c42af4c0f5f6ee5811ebd`
Core package: `core-v2-qa1-approved-25-map-final-art-v1` / `4b7c6d8137c494f95b8eb3d8050af0be0224508d897293bb79e31ec8829b647a`
Generated world: `generated-worlds-v1-phase6f-road-decoupled`
Asset manifest: `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`
Functions candidate: `crownlands-functions-node22-reset2-disabled-v1`

## Measured result

- 5,000 deterministic synthetic/anonymized production-shaped players: 1,000 sparse and 1,000 heavy.
- 125 Clans, 4,285 memberships, 715 Clanless players; zero duplicates/orphans/losses.
- 74,000 owned Common Gear, 32,500 equipped, and 8,000 duplicate-progression records; hashes exact.
- 5,000 exact flag/customization records; zero mismatches.
- Zero consumable or seasonal/world state survivors.
- Pagination cases 299/300/301/500/1,000/2,500/5,000 passed; 5,000 required 17 pages; zero skipped, duplicated, or stale-cursor records.
- Backup `reset2-backup-2e68667049a02b05` validated 5,000 players and 125 Clans. Isolated restore hashes matched and no published package was regenerated.
- New world: 25 Core regions, 1,480 Core cities, 17 current objectives, 194 active outer regions, two STANDBY regions, 9,320 total cities, zero duplicate city IDs, and zero reciprocal-topology errors.
- 5,000 unique fresh starting cities, all outside Core.
- Main-city restriction: all 40 combinations of eight server paths and five forbidden Core regions rejected; 20 normal capture/own/reinforce/attack controls allowed.
- 15 NPC placement succeeded and left 14; the next placement rejected while the region remained ACTIVE; next clockwise region activated and the buffer returned to two.
- READY blocked entry before validation and enabled it only after the isolated pointer cutover.
- Fresh cutover used Firestore update-time precondition from revision 12 to 13. Replay matched the exact candidate and skipped a redundant cutover.
- All 12 required failure injections preserved the old pointer and hid partial state.

Fresh rehearsal duration: 637.607 s. Exact replay duration: 283.264 s.

Fresh stage timings were approximately: local candidate 25.604 s; freeze 0.180 s; source 50.818 s; backup 46.392 s; restore 44.803 s; restore validation 10.861 s; migration 334.541 s; world initialization 107.751 s; remote validation 12.412 s; pointer transaction 0.129 s.

Replay stage timings were approximately: local candidate 30.671 s; freeze 0.199 s; source 38.996 s; backup 34.025 s; restore 33.066 s; restore validation 10.191 s; migration 105.051 s; world initialization 13.896 s; remote validation 13.395 s. Replay performed 29,933 deterministic staging writes and no pointer write.

## Safe aborted attempts

Four development failures were deliberately retained as evidence. v1 and v2 exceeded Firestore transaction/index expansion limits during source snapshot, v3 exposed an invalid restore document path, and v4 exposed receipt metadata contaminating a Clan hash comparison. Every attempt was marked `ABORTED`, remained pre-cutover, kept the old season authoritative, exposed no partial season, and targeted no production project. v5 corrected these development-only rehearsal defects and passed fresh plus replay.

## Read-only production preflight

The preflight used only GET and Firestore read-query operations against `crown-land-b15e0`. It observed 15 maps, 1,050 cities, 210 directed chains, zero generated ACTIVE regions, zero Core v2 records, 30 player records, four Clan records, and 303 Common Gear instances across 11 players. The 118-asset hash remained exact. Reset and generated-world control documents were not provisioned and therefore effectively OFF. All 750 observed deployed indexes reported READY.

Firestore reported point-in-time recovery and delete protection disabled. The staging backup/restore procedure passed, but production backup policy/configuration must be explicitly approved before a real reset.

## Decision status

- August 25 technical dress-rehearsal readiness: READY for review.
- September reset: NO-GO. Remaining blockers are checkpoint approval, a later expressly authorized final production dress rehearsal, operator approval of production backup/PITR policy, reset-window scheduling/staffing, and an explicit production execution authorization.
- No production data was written, no production pointer moved, no real player moved, and nothing was deployed or merged.
