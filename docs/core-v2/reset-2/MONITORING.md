# RESET-2 monitoring and kill-switch policy

Poll every 30 seconds during PREPARING, INITIALIZING, VALIDATING, READY, and the first post-cutover observation window.

| Metric | Warning | Critical | Required response |
|---|---:|---:|---|
| reset lifecycle age | 900 s | 1,800 s | Stop advancing lifecycle; inspect the active stage and transaction errors. |
| migration page without progress | 120 s | 300 s | Engage migration switch; verify cursor and last committed page. |
| persistent mismatch count | 1 | 1 | Immediate NO-GO; retain old pointer. |
| Gear mismatch count | 1 | 1 | Immediate NO-GO; retain old pointer. |
| Clan mismatch count | 1 | 1 | Immediate NO-GO; retain old pointer. |
| flag mismatch count | 1 | 1 | Immediate NO-GO; retain old pointer. |
| unexpected consumable persistence | 1 | 1 | Immediate NO-GO; do not mark READY. |
| Core initialization failure | 1 | 1 | Engage bootstrap/cutover switches; mark candidate ABORTED. |
| starting-city failure rate | 0.1% | 1% | Stop placement; inspect capacity and authoritative NPC counts. |
| pointer update failures | 1 | 1 | Do not retry blindly; re-read pointer and precondition. |
| Firebase transaction error rate | 1% | 5% | Reduce/stop migration batches; preserve committed receipts. |
| STANDBY region count | below 2 | below 1 | Stop placements if capacity is unsafe; repair queue without changing order. |
| generated-region queue age | 300 s | 900 s | Engage generation/expansion switch and investigate worker health. |

Seven independent kill switches cover bootstrap, migration, cutover, generation, publication, activation, and expansion. All default engaged. Reset, season cutover, and automatic reset default OFF. Stopping these systems must not interrupt gameplay already active on published regions.

The reset dashboard must also expose: candidate ID/hash, environment/project, current lifecycle, expected/actual page and player counts, backup/restore status, Core/outer counts, READY receipt hash, pointer revision, Function errors, and old-season archive state.

Production launch remains blocked if point-in-time recovery/backup policy is not explicitly accepted by the operator. The 2026-08-20 read-only preflight observed Firestore native mode with point-in-time recovery disabled and delete protection disabled; this is not a Crownlands data mutation, but it is a production-readiness decision that must be closed before a real reset.
