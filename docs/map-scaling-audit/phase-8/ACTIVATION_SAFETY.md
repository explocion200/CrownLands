# Activation safety

Activation preflight requires:

- publication marker and immutable package
- matching package hash
- all immutable objects reachable and hash-valid
- exactly 40 ready city definitions
- four valid cardinal topology edges
- valid published edge inheritance
- PUBLISHED/inactive catalog entry
- unique reserved coordinate
- separate activation approval

Eleven injected activation failures covered failure before activation, Firestore timeout, transaction failure, failure after non-authoritative city staging, catalog delay, package-hash mismatch, missing map, missing thumbnail, invalid city count, conflicting edge contract, and coordinate conflict.

Every fault left the package PUBLISHED/inactive with zero visible ownership records and zero activation markers. A successful retry initialized exactly 40 records; a duplicate retry was idempotent. No partial ACTIVE region became visible.

Runtime GATED-to-OPEN topology changes occur only after successful activation and never mutate the immutable package hash.
