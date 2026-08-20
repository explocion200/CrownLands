# AUTO-RESET-1 final report

Status: development and isolated Firebase staging proof **PASS**. Production automatic reset remains **OFF / NO-GO** pending the explicit blockers below.

1. **Scheduler architecture:** separate Node 22 Firebase Functions codebase with prebuild, monthly reset, and catch-up Scheduler handlers; Firestore operation records and a distributed lease provide idempotency.
2. **Timezone:** `Etc/UTC`.
3. **Monthly schedule:** reset at `0 0 1 * *`; season boundaries are calendar-month boundaries.
4. **Prebuild:** hourly coordinator `0 * * * *`, recommended action at T-24 hours. T-6 and T-1 were tested but leave less repair headroom.
5. **State machine:** `SCHEDULED → PREBUILDING → PREBUILT → RESET_FREEZE → FINAL_SNAPSHOT → MIGRATING → VALIDATING → CUTOVER_READY → CUTTING_OVER → ACTIVE → OLD_SEASON_ARCHIVED`, with explicit failure states and post-cutover emergency containment.
6. **GO/NO-GO:** 39 hard checks cover environment, backup, Core, outer world, persistence, prohibited reset state, and security. One failure makes automatic cutover false.
7. **Retry policy:** maximum three attempts with exponential backoff for explicitly transient/idempotent failures only.
8. **Hard abort:** integrity mismatches never retry automatically; maintenance unwinds before cutover, the failed namespace is retained, and the old pointer remains authoritative.
9. **Reset lock:** deterministic operation ID plus a 15-minute Firestore lease. Duplicate delivery resumes or exits without duplicate worlds, migrations, cities, placements, or cutovers.
10. **Season ID:** sortable, unique `season-YYYY-MM`, derived from the UTC boundary.
11. **Maintenance:** read-only login remains available; world mutation, marches, captures, main-city relocation, placement, and activation freeze until success or safe abort.
12. **Downtime:** generation is removed from the freeze window. The latest local 5,000-player controller model measured `8.148 s`; the production-shaped Firebase rehearsal remains the network reference. No production SLA is claimed; WARNING is 15 minutes and CRITICAL is 30 minutes.
13. **Persistence:** exact allowlist migration passed for 5,000 players across four monthly transitions.
14. **Gear:** 74,000 owned Common Gear records, 32,500 equipped references, 8,000 duplicate-progression records; levels, upgrades, equipment changes, and duplicate progression survived without cumulative duplication.
15. **Clans:** 125 Clans retained stable identity, membership, leadership/roles, and Clanless state without duplicate creation.
16. **Flags:** exact player Flag/customization hashes remained stable across all transitions.
17. **Consumables:** zero Bag consumables migrated; all seasonal/world state reset.
18. **Core:** each candidate contains 25 spawn-ineligible Core maps, 1,480 cities, 17 current interactive objectives, valid topology, and immutable package hashes.
19. **Outer world:** required active capacity, exactly 40 cities per generated region, authoritative 15-NPC runtime threshold, and exactly two STANDBY regions validated.
20. **Main city:** server-authoritative exclusion for Citadel and all four Stronghold maps passed; old main-city assignments do not migrate.
21. **Successful scheduled staging reset:** actual Cloud Scheduler path passed with no manual intervention between prebuild dispatch and cutover; final state `OLD_SEASON_ARCHIVED`, pointer `season-2026-11` / `auto-reset-1-staging-world-2026-11`.
22. **Failed scheduled staging reset:** deliberate Gear-level mismatch reached `VALIDATION_FAILED`; cutover was denied and `season-2026-10` remained authoritative.
23. **Duplicate invocation:** harmless safe exit; no duplicate season data or pointer revision.
24. **Late scheduler:** +1 minute, +15 minutes, and +2 hours passed. The 15-minute watchdog keeps attempting the one current idempotent boundary after a delay and never chains skipped months silently.
25. **Multi-month simulation:** A→B→C→D→E passed with 5,000 production-shaped synthetic players.
26. **Archive:** old seasons become `RETIRED_READ_ONLY`, are not deleted, and initially retain for 30 days. Synthetic projection is 32,229,018 bytes/month and 386,748,216 bytes/12 months, excluding index/metadata overhead.
27. **Receipt:** immutable receipt includes operation/source/target/world IDs, scheduled and actual times, candidate and Core/topology hashes, player/Clan/Gear counts and checksum, city/objective counts, backup receipt, validation, cutover, archive, and final state. Latest rehearsal hash: `726ab25dae1ed576e7145f66b8764cdd3a9b30ef477e6696849bb850c7b528e2`.
28. **Kill switches:** independent prebuild/reset/migration/cutover/generation/publication/activation/expansion controls; tracked defaults are all engaged and all three feature flags are OFF.
29. **Alerting:** INFO for lifecycle progress, WARNING for transient retry/low standby/+1-minute delay/15-minute runtime, CRITICAL for integrity, backup, pagination, lock, pointer, scheduler, and >30-minute failures.
30. **PITR/delete protection:** enable Firestore PITR, delete protection, and daily backups retained at least seven days; verify a scheduled-backup restore before authorization. Estimated storage formula is about `$0.36 × average database GiB/month` for PITR plus seven daily backup copies, before operations/network.
31. **Still-authorized-separately:** recovery settings and backup schedule, production codebase deployment, production Scheduler creation, exact config/candidate installation, and deliberate feature/kill-switch enablement.
32. **September 1 readiness:** architecture and staging scheduler proof pass, but production remains NO-GO until RESET-2 is checkpointed, protection policy is approved/enabled and restore-tested, a fresh production preflight passes, and explicit enablement authorization is given.
33. **Files changed:** development-only `functions-auto-reset/`, `tools/core-v2-auto-reset-1/`, validator/rehearsal runner, `firebase.auto-reset.json`, docs, and compact receipts. RESET-2 work remains a separate uncommitted predecessor diff.
34. **Production leakage:** zero AUTO-RESET markers in `dist`, production Functions/runtime, maps/assets, rules, or indexes; secret and machine-local-path scans also returned zero findings.
35. **Exact production blockers:** PITR disabled, delete protection disabled, backup schedule/restore proof unapproved, production code/schedulers/config not deployed, flags OFF/kills ON, the receipt-backed staging prebuild/migration adapters must be wired to authorized production world-generation and transactional player-placement workers, current production preflight must be refreshed, and explicit production authorization has not been granted.

Production baseline remains 15 maps, 1,050 cities, 210 directed chains, zero generated ACTIVE regions, and the locked 118-asset manifest `701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f`.

No production deployment, active-season change, world mutation, player movement, generated-region activation, merge, commit, or push occurred. The separate AUTO-RESET codebase was deployed only to `crownlands-map-staging-2026` for the required scheduled rehearsal and remains disabled there after the proof.
