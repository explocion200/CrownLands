# Crownlands RESET-2 operator runbook

Status: development/staging candidate only. This document does not authorize a production reset.

Candidate: `reset2-candidate-2e68667049a02b05`
Source bundle: `2e68667049a02b05fef2e1d5d706de26b7075b32b13c42af4c0f5f6ee5811ebd`
Approved base: `3ee9918dd43231eafffc0858649f4ae5a57b97b7`
Target staging project: `crownlands-map-staging-2026`
Forbidden production project during rehearsal: `crown-land-b15e0`

## Operating rules

- One named reset operator owns the run; a second operator independently confirms every GO decision.
- Production remains NO-GO until this RESET-2 checkpoint is approved and a later explicitly authorized production dress rehearsal passes.
- Before cutover, every failure leaves the old season authoritative. Mark the candidate attempt `ABORTED`; never repair a partial candidate in place without a new receipt.
- Cutover requires the exact candidate hash, `READY`, the expected old pointer, and an update-time precondition.
- Published map packages are immutable and are never regenerated during restore.
- Maintenance behavior is `READ_ONLY_LOGIN`: login/read is allowed; all world-changing actions are blocked.
- The old season is retained read-only for 30 days. Cleanup requires a separate reviewed task after backup and recovery obligations expire.

## Required environment

The staging rehearsal command requires all three explicit guards:

```powershell
$env:CROWNLANDS_PHASE9_TARGET_PROJECT_ID='crownlands-map-staging-2026'
$env:CROWNLANDS_PRODUCTION_PROJECT_ID='crown-land-b15e0'
$env:CROWNLANDS_PHASE9_MUTATION_CONFIRMATION='PHASE9_STAGING_MUTATION:crownlands-map-staging-2026'
node tools/run-core-v2-reset-2-staging.js
```

The read-only production preflight requires a different acknowledgement and exposes no mutation method:

```powershell
$env:CROWNLANDS_PRODUCTION_PREFLIGHT_PROJECT_ID='crown-land-b15e0'
$env:CROWNLANDS_PRODUCTION_PREFLIGHT_ACKNOWLEDGEMENT='READ_ONLY_PRODUCTION_PREFLIGHT:crown-land-b15e0'
node tools/run-core-v2-reset-2-production-preflight.js
```

## Exact execution checklist

| Step | Action / command | Target | Expected result and verification | GO condition | NO-GO condition | Abort / rollback |
|---|---|---|---|---|---|---|
| 1 | Assign primary and confirming operators; open incident channel and timestamped log. | Operator process | Two named operators and writable audit log. | Both acknowledge scope and production prohibition. | Missing operator, log, or authority. | Do not enter maintenance. |
| 2 | Run `git rev-parse HEAD`, candidate validator, and source-hash comparison. | Reviewed candidate checkout | Base SHA and candidate/source hashes exactly match this document and receipt. | Every hash exact. | Any reset-affecting source changed. | Stop; create a new candidate and repeat RESET-2. |
| 3 | Run the read-only production preflight command above. | Production, read-only | 15 maps, 1,050 cities, 210 directed chains, 0 generated ACTIVE, 0 Core v2 records; reset controls effectively OFF. | Baseline exact and no mutation method available. | Any baseline drift, wrong project, unexpected generated/Core data, controls enabled. | Stop; investigate without writes. |
| 4 | Verify backup prerequisites, storage quota, credentials, required indexes, Functions candidate, kill switches, and database protection configuration. | Intended target | All dependencies available; reset/cutover/automatic flags OFF; all kill switches engaged until explicitly released. | All checks green and backup destination writable. | PITR/backup policy unresolved, missing index/function/config, insufficient quota. | Stop before maintenance. |
| 5 | Enable `READ_ONLY_LOGIN` maintenance and engage bootstrap/migration/cutover/generation/publication/activation/expansion kill switches. | Intended target | Login/read works; capture, upgrade, march, rally, reinforcement, objective capture, main-city relocation, placement, and region activation are rejected. | Every mutation probe blocked. | Any world mutation succeeds. | Re-engage controls; if state changed, reconcile before continuing. |
| 6 | Freeze old-season mutations and read expected active pointer plus update time. | Old season | `mutationState=FROZEN`; old world/season identity and revision recorded. | Snapshot is stable and pointer matches preflight. | Concurrent mutation or pointer drift. | Keep old season authoritative; remove maintenance only after audit. |
| 7 | Execute backup of pointer/reset metadata, persistent player progression, Clans, Gear, old catalog, ownership, objectives, and topology. | Backup namespace/storage | Backup ID, start/end time, object counts, and immutable manifest written. | Backup completes with expected counts and hash. | Missing/partial backup or hash mismatch. | Mark attempt ABORTED; do not initialize/cut over. |
| 8 | Perform isolated restore and compare canonical player/Clan/Gear/pointer/world hashes. | Isolated restore namespace | 5,000/5,000 player snapshots and 125/125 Clans restored; hashes equal; no package regeneration. | Every restore hash exact. | Any mismatch or regenerated published package. | Mark ABORTED; retain old pointer; fix backup/restore procedure. |
| 9 | Record before-migration persistence and seasonal-reset checksums in 300-document pages. | Frozen old season | All pages advance; each player once; no stale/repeated cursor. | Counts/checksums equal preflight/snapshot. | Skip, duplicate, stale cursor, or page failure. | Mark ABORTED; old season remains authoritative. |
| 10 | Create new season with `status=INITIALIZING`, `playerEntryEnabled=false`. | New isolated season | New identity exists but is not reachable by players. | Entry remains disabled. | Any partial world becomes visible. | Mark ABORTED; leave pointer unchanged. |
| 11 | Initialize exact immutable Core v2 package and 25 Core region records. | New season | 25 regions; all Core `spawnEligible=false`; package hash exact. | Counts/hash exact. | Count/hash/topology mismatch. | Mark ABORTED. |
| 12 | Initialize 1,480 Core city records and 17 current objectives. | New season | Unique IDs; 1,480 cities; 17 objectives; centered/near-center policies intact. | Every validator passes. | Duplicate/missing ID, city count, objective, or placement error. | Mark ABORTED. |
| 13 | Initialize only population-required outer regions plus two validated STANDBY regions. | New season | 40 cities per outer region; clockwise catalog; reciprocal cardinal edges; immutable edge contracts. | Required active capacity and exactly two STANDBY packages. | Capacity unavailable, package/hash failure, topology error. | Mark ABORTED; retain failed coordinate for retry. |
| 14 | Migrate the strict allowlist in deterministic 300-document pages and bounded writes. | New season players/Clans | Flag, Clan, owned/equipped Common Gear and Gear progression copied exactly. | Persistent hashes exact; no duplicates/orphans. | Any Gear, Clan, flag, page, or checksum mismatch. | Mark ABORTED; leave pointer unchanged. |
| 15 | Reset all seasonal/world fields and assign fresh outer-world starting cities. | New season | Consumables/world state absent; 5,000 unique starting cities; all outside Core. | Zero survivors, duplicates, or Core placements. | Any forbidden survivor or invalid placement. | Mark ABORTED. |
| 16 | Test main-city restrictions through all eight paths and normal Core gameplay controls. | New season | 40/40 forbidden-main-city attempts rejected; 20/20 capture/own/reinforce/attack controls allowed. | Exact results. | Any server path accepts a forbidden main city or blocks normal conquest. | Mark ABORTED. |
| 17 | Test 15→14 NPC boundary and expansion queue. | New season | Placement at 15 succeeds; remaining 14 rejects next placement; region stays ACTIVE; next clockwise region activates; buffer replenishes to two. | Threshold and queue exact. | Stale metadata controls decision, gameplay closes, coordinate hole, or buffer lost. | Mark ABORTED. |
| 18 | Set lifecycle to `VALIDATING`; run capacity, topology, objective, asset, persistence, pagination, queue, and environment gates. | New season | All receipts PASS; player entry remains disabled. | Zero blocking mismatch. | Any warning requiring human interpretation or any failed hard gate. | Mark ABORTED. |
| 19 | Set `READY` only after the complete validation receipt hash is stored. | New season | `READY`, exact candidate, 25/1,480/17 counts, two STANDBY; entry still disabled. | All values exact. | Missing receipt/hash/count. | Mark ABORTED; do not cut over. |
| 20 | Re-read active pointer and compare to the frozen expected value/update time. | Control pointer | Old world/season and revision still exact. | No concurrent cutover or drift. | Pointer changed. | Abort candidate; old/current pointer remains authoritative. |
| 21 | Execute one conditional pointer update with expected update time and exact candidate hash. | Control pointer | Revision increments once and references READY candidate. | Transaction succeeds exactly once. | Precondition/transaction failure. | Old season remains authoritative; investigate and retry only under a new reviewed attempt. |
| 22 | Enable new-season entry, keep all unrelated generated-world controls separately governed, archive old season read-only. | New and old seasons | New entry enabled only after pointer; old season `ARCHIVED/READ_ONLY`, retained 30 days. | Pointer, entry, and archive state consistent. | Split-brain, old mutations, or premature deletion. | Engage kill switches; do not delete either season; follow incident plan. |
| 23 | Run synthetic login, city assignment, Gear/Clan/flag/consumable checks, Core gameplay checks, and monitoring smoke tests. | Active candidate | Exact checksums and placement rules remain valid through runtime paths. | All smoke tests pass. | Any runtime mismatch. | Engage appropriate kill switch; preserve ownership; decide pointer rollback only under reviewed incident procedure. |
| 24 | Replay the exact candidate operation. | Same candidate | Stable convergence; no duplicate cities/objectives/Gear/Clans/starts/regions; no second pointer cutover. | Receipt says replayed and redundant cutover skipped. | Duplicate or divergent receipt. | Mark rehearsal failed; do not recommend production. |
| 25 | Close run with final receipt, monitoring handoff, backup retention, and operator sign-off. | Audit/operations | Immutable receipts and evidence locations recorded; alerts staffed. | Both operators sign. | Missing evidence or active alert. | Maintain maintenance/kill-switch posture appropriate to state. |

## Post-cutover incident rule

Code rollback must never erase active ownership. If a defect appears after cutover, first engage the narrowest kill switch, preserve both worlds and all receipts, and triage whether the active pointer can safely remain. A pointer rollback is a separately authorized transaction and requires verification that the archived season can accept traffic without losing writes made after cutover.

## Cleanup after 30 days

Old-world cleanup is not part of reset-day execution. Open a separate reviewed task, verify the retention deadline, legal/support obligations, backup hashes, and absence of rollback dependencies, then delete only the explicit archived season paths using the destructive-confirmation guard. Published immutable packages may remain content-addressed for audit/deduplication.
