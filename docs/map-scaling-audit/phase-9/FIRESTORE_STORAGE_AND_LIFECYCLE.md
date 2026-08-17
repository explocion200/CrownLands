# Firestore, Storage, and lifecycle

The default staging Firestore database is native mode in `nam5`, pessimistic concurrency, seven-day PITR, and delete protection enabled. A daily managed backup schedule retains backups for seven days.

The lifecycle exercised against real Firestore was:

`ALLOCATED → GENERATING → VALIDATING → STANDBY → PUBLISHING → PUBLISHED → ACTIVE`

Allocation uses coordinate-lock and region-document creation in one transaction. Publication first verifies all nine object hashes and metadata, then atomically writes the immutable publication marker, four edge contracts, and PUBLISHED lifecycle. Activation performs all reads before writes and atomically creates exactly 40 current-generation city ownership records, publishes runtime topology/catalog state, and opens reciprocal edges only to existing ACTIVE/Core neighbors.

The first three clockwise player regions were published and activated. The next two remain STANDBY, preserving the target buffer of two. All three ACTIVE packages have four edge-contract documents; no OPEN edge has a hidden destination. City IDs were unique across all five generated packages.

The Storage bucket is `crownlands-map-staging-2026.firebasestorage.app` in `US-EAST1`, with uniform bucket-level access and versioning enabled. Packages use:

`generated-worlds/v1/worlds/{world}/seasons/{season}/regions/{region}/packages/{packageHash}/…`

Five packages produced 45 objects totaling 1,899,161 bytes. Publication verified nine objects per package. An `ifGenerationMatch=0` overwrite was rejected. Published objects use content-addressed URLs and `Cache-Control: public, max-age=31536000, immutable`; an ETag conditional request returned 304.

Runtime OPEN/GATED state, ownership, and current NPC count stay outside immutable package hashes. The claim transaction derives `currentNpcCityCount` from current-generation ownership records. A claim at 15 NPC cities succeeded and left 14; the next placement was rejected while existing ownership and travel remained valid.
