# Backup and disaster recovery

Required controls:

- Firestore managed daily backup, seven-day PITR, and quarterly restore rehearsal.
- Storage object versioning, daily manifest inventory, and weekly package-hash audit.
- Versioned Core template, asset manifest, rollout gate, IAM policy, and alert configuration.
- Target RPO: one hour. Target RTO: four hours, subject to measured staging restore tests.

Recovery order:

1. Engage expansion, publication, and activation kill switches.
2. Restore world/season identity and permanent Core configuration.
3. Restore publication markers, immutable manifests, and edge contracts.
4. Restore and hash-verify immutable assets by package hash/version.
5. Restore lifecycle catalog and runtime topology.
6. Restore current-generation city ownership.
7. Reconcile ACTIVE markers without regenerating published packages.
8. Validate placement and normal gameplay before releasing switches.

Published packages are recovered by hash/version. They are never silently regenerated as part of disaster recovery or code rollback.
