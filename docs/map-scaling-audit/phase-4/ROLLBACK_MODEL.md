# Failure and retry model

The prototype lifecycle is:

```text
ALLOCATED → GENERATING → VALIDATING
                           ├─ PASS → STANDBY
                           └─ FAIL → ROLLED_BACK
```

`STANDBY` is still development-only and cannot activate itself. `ROLLED_BACK` has no catalog entry, authoritative definition, or publication package. Its preview exists only for diagnostics.

The invalid fixture records a deterministic failure receipt, its rejected-position counts, validation errors, seed/version metadata, and `coordinateReusable: true`. The allocator receives no failed catalog entry, so the same clockwise coordinate remains the next coordinate. A retry requires an explicit revised `seedSalt` or configuration revision and starts again at `ALLOCATED`.

The worker must never skip the failed coordinate to continue clockwise. A future persistent implementation needs a compare-and-set allocation lease, idempotency key, artifact staging area, signed validation receipt, and atomic catalog publication transaction. None of those production writes are implemented in Phase 4.
