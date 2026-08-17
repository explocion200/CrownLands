# Recovery and orphan cleanup

The recovery drill ran only with every rollout control OFF and the separate destructive staging confirmation present.

It deleted and restored the ACTIVE region record, catalog entry, immutable package record, a claimed ownership record, and an edge contract. Lifecycle, package identity, ownership, contract hash, and publication marker were verified after restoration. It then made a published map object unavailable, recovered its archived generation through the backup service account, restored the identical bytes/metadata, and confirmed retained object versions. The package was never regenerated.

A real named Firestore clone was created from the default database PITR snapshot. The recovered ACTIVE region/package identity was read from the clone. Clone delete protection was then disabled and the named clone was deleted. The protected default database was never deleted.

Orphan policy is implemented as:

- GENERATING: 24 hours
- abandoned upload: 168 hours
- FAILED, ROLLED_BACK, or superseded unpublished: 720 hours

Every cleanup evaluates lifecycle, age, immutable state, and publication-marker presence before eligibility. PUBLISHING, PUBLISHED, and ACTIVE are always protected. The real staging dry run inspected 30 region records, protected all 28 ACTIVE records, selected zero deletion candidates, deleted nothing, and wrote an operator receipt. Destructive execution would require the second project-bound cleanup confirmation.
