# Local server backup schedule

Confirmed by the owner on October 18, 2026: run the encrypted server backup only
the day before a new season. Monthly seasons begin at 00:00 UTC on the first;
the backup runs at 00:00 UTC on the last day of the previous month, 24 hours
before rollover. `systemd` uses `*-*~1 00:00:00 UTC`, including leap February.
The next occurrence is October 31, 2026 at 00:00 UTC (October 30 at 8 p.m. EDT).

Ordinary merges and deployments must not start extra backups or full restore
drills. Additional manual backups require a separate owner request. This policy
supersedes the former daily local-server schedule; it does not modify season
reset rules, historical Firebase records, or game services.

## Storage and alerts

The existing encrypted local and Google Cloud copies, credentials, backup
sources, verification and retention remain unchanged. Existing snapshots are
not deleted by this schedule installation. Retention runs during successful
backups: 14 daily, 8 weekly and 6 monthly restore points, with overlapping rules.
These are retained snapshot periods, not a promise to create daily backups.

The existing `/backup-healthz` uptime check remains active. It requires a
successful local and enabled off-site copy for the last due backup, with three
hours to finish the existing two-hour service. A failed run, invalid status,
future timestamp, stale off-site copy or run exceeding two hours is unhealthy.
The current verified October 18 copy covers the transition until the October 31
deadline; health does not assume a missing backup exists.

There is no off-schedule reboot catch-up (`Persistent=false`). If the computer
is off at the scheduled time, the missed deadline alerts rather than creating
a backup after the season has started. A recovery may lose all progress since
the last successful copy, potentially most of a season. No timer change can
protect data that has not been backed up.

## Installation and verification

After the exact commit passes review and required checks, install
`tools/local-migration/preseason-backup.conf` as
`/etc/systemd/system/crownlands-backup.timer.d/preseason.conf` and
`tools/local-migration/backup_health.py` as
`/usr/local/lib/crownlands-backup/crownlands-backup-health.py` (root-owned 0644).
Retain the prior health script and any prior drop-in for rollback. Do not replace
the backup job, its service or the publisher. If a backup is already running,
wait for it to finish before changing the timer.

Reload systemd and restart only `crownlands-backup-health.service` and
`crownlands-backup.timer`. Verify the merged unit has a single monthly calendar,
no daily schedule or reboot catch-up, the expected next run and a successful
public backup health response. Compare backup status timestamps before/after to
verify installation did not run a backup. Confirm game and service health.
On failure, restore both previous files, reload systemd and restart those same
two units. A source merge alone does not prove this host configuration is active.

Run `node tools/test-preseason-backup.js` for focused calendar and alert tests.
Schedule-only changes do not require a new database export or full restore.
