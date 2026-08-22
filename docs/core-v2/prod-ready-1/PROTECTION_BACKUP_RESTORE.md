# PROD-READY-1 recovery protection

## Verified baseline

- Project: `crown-land-b15e0`
- Database: `(default)` in `nam5`
- PITR: `POINT_IN_TIME_RECOVERY_DISABLED`
- Version retention: `3600s`
- Database delete protection: `DELETE_PROTECTION_DISABLED`
- Backup schedules: none
- READY production backups: none

The observation was read-only. No gameplay or infrastructure mutation was performed.

## Proposed protection policy

The recommended starting policy is:

- enable Firestore PITR;
- enable Firestore database delete protection;
- create one DAILY backup schedule;
- retain daily backups for 35 days;
- require a READY backup whose snapshot precedes reset freeze before every reset;
- retain old season data as `RETIRED_READ_ONLY` for 30 days;
- do not configure automatic old-season deletion.

PITR retains up to seven days after the window matures. A 35-day daily-backup retention period covers the prior monthly boundary, reset day, and immediate post-reset observation period while the old season remains archived. Firestore chooses the time of each daily backup, so the reset coordinator must validate a completed pre-freeze backup rather than assume a wall-clock run time.

## Cost model

PITR storage, each retained backup, and restore operations are billable and have no free tier. The exact dollar estimate requires the measured production database or backup GiB and must not be guessed. The model is:

- PITR: average database GiB × PITR GiB-month rate;
- daily backups: each backup GiB × retained fraction of the month × backup GiB-month rate;
- restore rehearsal: source backup GiB × restore rate, plus storage/usage for the isolated named database while retained.

Official references: [Firestore PITR](https://docs.cloud.google.com/firestore/native/docs/pitr), [scheduled backups and restore](https://docs.cloud.google.com/firestore/native/docs/backups), and [Firestore pricing](https://cloud.google.com/firestore/pricing).

## Authorization boundary

The configuration tool defaults to dry-run and requires all of:

1. `--execute`;
2. the exact project `crown-land-b15e0`;
3. the exact authorization string emitted by the dry run.

The current required authorization is:

`AUTHORIZE_PRODUCTION_RECOVERY_PROTECTION:crown-land-b15e0:(default):PITR+DELETE_PROTECTION+DAILY_BACKUP_35D`

This authorization was not supplied during PROD-READY-1, so the protection change was not performed.

## Rollback and operational implications

- Disabling PITR stops access to the seven-day PITR window. PITR data already produced ages out according to the service policy.
- Disabling database delete protection permits deleting the database resource again. Delete protection does not prevent ordinary document deletion.
- Removing the backup schedule stops future backups. It does not delete retained backups.
- Deleting a backup is a separate destructive action and is never part of the rollback tool.

## Actual backup and restore gate

There is not yet a READY production backup, so an actual restore cannot be honestly marked pass. Once a production backup exists, the guarded restore tool will restore it only to a new `prod-ready-restore-*` named database. It will never target `(default)`, will verify representative player, Clan, Common Gear, city/world, and season/control records, and will retain the named database for review. Deletion of the restore database requires a separate destructive authorization. The source backup is never deleted or altered.
