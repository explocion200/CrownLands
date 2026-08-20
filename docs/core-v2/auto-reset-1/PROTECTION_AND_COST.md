# Production recovery protection

AUTO-RESET-1 does not change production configuration. The last read-only preflight found Firestore PITR and database delete protection disabled, so automatic production enablement remains blocked.

Before authorization:

1. Enable Firestore PITR and verify its seven-day recovery window.
2. Enable database delete protection.
3. Configure a daily Firestore backup with at least seven-day retention, and require a completed backup receipt covering the source season before reset freeze can proceed.
4. Retain the monthly cutover audit receipt permanently and the retired season read-only for an initial 30 days.
5. Perform and time a staging restore from a real scheduled backup before production enablement.

Google documents that PITR provides one-minute recovery points for up to seven days, scheduled backups can be daily or weekly with retention up to 14 weeks, and delete protection prevents database deletion until explicitly disabled. See [Firestore disaster recovery](https://docs.cloud.google.com/firestore/native/docs/disaster-recovery), [backup schedules](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/backups/schedules/create), and [database delete protection](https://cloud.google.com/firestore/docs/manage-databases).

At the current published `nam5` Standard-edition rates, PITR is approximately $0.15 per average database GiB-month, backup storage approximately $0.03 per retained backup GiB-month, and a restore $0.20 per restored GiB. A daily seven-day backup policy averages roughly seven retained copies, about $0.21 per database GiB-month; PITR plus that backup policy is therefore roughly `$0.36 × average database GiB` per month, before operation/network charges. These are formula estimates, not a Crownlands invoice; actual database/index size must be measured immediately before authorization. See [Firestore pricing](https://cloud.google.com/firestore/pricing).

Exact production changes requiring separate authorization are: database PITR enablement, database delete-protection enablement, backup-schedule creation/retention, deployment of the `auto-reset` codebase to `crown-land-b15e0`, creation of production scheduler jobs, installation of the exact candidate/config document, and switching all three feature flags/required kill switches to their approved production values.
