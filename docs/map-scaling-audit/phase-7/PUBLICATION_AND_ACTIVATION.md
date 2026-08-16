# Atomic publication and activation

## Publication

Publication is explicit and staged:

1. Validate the complete STANDBY package.
2. Validate inheritance from every already-published cardinal neighbor.
3. Upload all immutable files.
4. Verify stored hashes.
5. Stage catalog entry, topology template, exactly 40 city definitions, and asset references.
6. Commit the catalog, topology, cities, immutable package record, and publication marker in one transaction.

The publication marker is the visibility boundary. Before that marker, a partial region is undiscoverable. The emulator fault suite interrupts after asset upload, during the publication transaction, and at validation. All three leave zero published regions, zero visible definitions, and zero active regions. Uploaded orphan objects are quarantined for diagnostic cleanup; they are not authoritative.

## Activation

Activation is a separate explicit transaction:

1. Require a valid PUBLISHED marker.
2. Re-verify package files and edge inheritance.
3. Initialize exactly 40 current-generation neutral ownership records idempotently.
4. Mark the catalog ACTIVE.
5. Record the activation marker.
6. Open reciprocal connections to already-active cardinal neighbors.

An injected activation-transaction failure leaves the package PUBLISHED and initializes zero ownership records. Concurrent duplicate activation returns one successful transition and one idempotent result.

## Rollback

Unpublished STANDBY packages can be rejected or retried at the same coordinate using a new versioned retry salt. Published packages are immutable; rollback after publication requires a separately reviewed versioned migration, never an overwrite.
