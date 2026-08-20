# RESET-1 final review report

1. **Reset architecture:** versioned old/new seasons; build, validate and seal the replacement before an atomic active-pointer switch. No delete-first reset.
2. **World/season identity:** synthetic source `crownlands_world_2026_summer/season_2026_summer`; replacement `crownlands_world_2026_september/season_2026_september`; schema `core-v2-reset-1-v1`.
3. **Persistence allowlist:** contract v2 copies an explicitly constructed payload; it never copies a player document wholesale.
4. **Persistent fields/categories:** `flag`; `clanId`, `clanName`, `clanTag`, `clanRole`; Gear `schemaVersion`, `instances`, `equipped`; each Gear instance is limited to `instanceId`, `gearKey`, `buildingId`, `slot`, `rarity`, `level`, `acquiredAtMs`, `upgradedAtMs`.
5. **Seasonal reset categories:** world/season identity, main/starting city, cities/ownership, attacks, marches, rallies, reinforcements, objectives, region activation, placement, achievements, Gold, daily state, Bag items/effects/cooldowns and other world-scoped progress.
6. **Common Gear inventory:** PASS; owned Common Gear sets and duplicate instances match before/after.
7. **Equipped Gear:** PASS; every equipped slot still references the same owned instance.
8. **Gear levels/upgrades:** PASS; level and acquisition/upgrade progression timestamps match.
9. **Clan:** PASS for a leader, two members across two clans, and a clanless control; identity/membership persists without duplicate clan creation.
10. **Flag:** PASS; all four distinct custom Flags match.
11. **Consumables:** PASS; normal Bag items, Common Gear boxes, opening/shop receipts, effects and cooldowns are absent from the replacement payload.
12. **Core bootstrap:** PASS; exactly 25 permanent, spawn-ineligible Core regions.
13. **Core cities:** PASS; exactly 1,480 globally unique initialized NPC cities.
14. **Objectives:** PASS; 12 Camps plus four Strongholds and Crown Citadel initialize fresh; four Tower reservations remain non-interactive reservations.
15. **Outer player world:** initial sizing formula is `ceil(expectedPopulation / 26)` ACTIVE 40-city packages; four synthetic players required one ACTIVE package.
16. **STANDBY buffer:** PASS; two initially, and two again after expansion replenishment.
17. **Synthetic cases:** A clan member with equipped/upgraded Gear and march; B clan leader with high-level Gear/objective/rallies/reinforcements; C clanless with minimal Gear/Bag items/cities; D clan member with a substantial equipped build and old main city.
18. **Before/after receipts:** four of four persistent hashes match; final local input receipt `427ae5b9db8c8b9b1d443632597bc5518c10bb4b2df4ef1884c273bf7ca2f04c`.
19. **Main-city restriction:** shared server policy is enforced by direct change, canonical repair, reset restore, returning-player restore and starting-city assignment; authoritative city region wins over spoofed client input.
20. **Citadel rejection:** PASS through all five pathways plus malformed spoofing.
21. **Stronghold rejection:** Greybanner, Aurum, Swiftgate and Ironwatch each reject through all five pathways plus malformed spoofing.
22. **Normal Core conquest:** PASS; concrete controls captured, owned, reinforced and attacked from normal cities on all five restricted maps, while main-city designation still rejected.
23. **15-NPC boundary:** PASS; authoritative count 15 permits placement and leaves 14; the next placement rejects without removing players, closing travel or changing ACTIVE state.
24. **Clockwise activation:** PASS; `phase6d_region_0002` activates after `phase6d_region_0001`, retains its immutable approved package/40 cities, opens reciprocal outer/Core edges and triggers buffer replacement.
25. **Idempotency:** PASS; deterministic local replays match, duplicate city IDs are zero, and the original staging pagination incident resumed safely under the same operation ID.
26. **Rollback/abort:** PASS for faults before Core initialization, during migration and immediately after pointer switch; the old season remains/restores authoritative and partial data stays non-authoritative.
27. **Archive:** after successful switch the old synthetic season becomes read-only `ARCHIVED`; records are retained, not deleted.
28. **Duration:** final fresh Firebase staging rehearsal took 14.419 seconds; its identical replay took 6.814 seconds. Each verified 1,696 data documents plus guarded control transitions and exhaustive pagination.
29. **Defects:** the first `v1` verifier stopped at Firestore's 300-document page before cutover. Pagination was corrected and safe replay proved. No open RESET-1 architecture/staging blocker remains. Historical phase validators with checkpoint-only diff guards correctly reject later RESET paths and were not weakened.
30. **Production checklist:** the exact operator checklist is in `PRODUCTION_RESET_CHECKLIST.md`, covering pre-window backup/baselines, freeze/snapshot/build/migrate/validate/READY/cutover, after-reset verification, monitoring and rollback.
31. **September 1 go/no-go:** current status is **NO-GO** for the real reset until production integration, an exact-candidate August 25 rerun, current backup/export receipts, production-shaped sizing and explicit two-person operator approval are complete.
32. **Production leakage:** zero development fixture/staging identifiers in the production client artifact; fresh read-only production preflight remains 15 maps/1,050 cities/210 directed chains/zero generated ACTIVE regions. No production write occurred.
33. **Files changed:** three intentional runtime/contract-manifest files, one new server policy, three reset tools, one compatibility validator update, one staging API precondition enhancement, two receipt files and nine RESET-1 documents. No production map, city, ownership, topology or asset file changed.
34. **August 25 readiness:** the rehearsal architecture, guarded runner, receipts, validation and checklist are ready for the scheduled exact-candidate rehearsal.
35. **Remaining rehearsal blockers:** no implementation blocker for the rehearsal. Operational prerequisites remain: freeze the exact candidate, confirm operator credentials, produce current backups/read-only production-shaped input and obtain rehearsal approval.

RESET-1 did not run the real production reset, deploy, merge, commit or push.
