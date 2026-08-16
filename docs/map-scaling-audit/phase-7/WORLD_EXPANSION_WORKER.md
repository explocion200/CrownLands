# World-expansion worker and controller

## Worker

The development worker wraps approved Phase 6F outputs in the production package contract. It:

- rebuilds the Phase 6F composition plan and verifies its composition hash
- verifies geometry/art parity
- reconstructs the stable 40 dynamic city definitions and four starting candidates
- validates 112 px minimum spacing
- reads the approved WebP and thumbnail and verifies their hashes and formats
- emits four immutable edge contracts
- emits component files, receipt, manifest, and content-addressed package hash

The same input generated the same package hash and map bytes in duplicate-job tests. A simulated crash after map encoding created no STANDBY, PUBLISHED, or ACTIVE artifact.

## Controller

The controller:

- uses the approved clockwise allocator outside the permanent 25-coordinate Core
- reserves coordinates transactionally
- dispatches deterministic generation
- maintains a configurable STANDBY buffer
- orders publication and activation by layer and clockwise slot
- never auto-publishes or auto-activates

The 128-region emulator run completed Layer 1 (24), Layer 2 (32), Layer 3 (40), and 32 positions of Layer 4. It created 128 unique coordinates, 128 unique region IDs, 128 unique package hashes, and 5,120 unique city IDs.

The controller does not select player placements. The authoritative spawn claim evaluates ACTIVE topology and current-generation ownership inside the transaction.
