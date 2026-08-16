# Road-cache strategy

The Phase 7 cache contains 36 geometry/theme presentations and consumes approximately 196.98 MiB uncompressed per process. Phase 8 evaluated 512 sequential region records with a process-local 12-entry LRU.

Results:

- byte-identical presentation hashes: PASS
- LRU maximum modeled footprint: 65.66 MiB
- representative hit rate: 49.22%
- deterministic reconstruction on miss: PASS
- network dependency: none

Recommendation: use a process-local bounded LRU with 12 entries. A full per-process cache creates avoidable memory pressure. A shared cache saves worker memory but adds latency, authentication, availability, and cache-service failure modes; it is not justified for 36 deterministic combinations.

The cache changes neither road sockets nor road width, rendering style, map hashes, edge contracts, or the 118-asset manifest.
