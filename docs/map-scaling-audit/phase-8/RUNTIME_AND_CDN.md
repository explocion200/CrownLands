# Runtime performance and CDN behavior

The Phase 8 hierarchical catalog was tested with 10,000 generated entries plus the 15 handcrafted maps.

- startup payload: approximately 4.2 KiB
- Layer 1 page: approximately 5.9 KiB
- definitions at startup: none
- city definitions at startup: none
- map bytes at startup: none
- on-demand cache limit: four regions
- local definition-switch p95: below 1 ms

Startup contains the current/nearby region set and layer summaries; full generated catalog entries are paged. No all-world city or map preload is permitted.

Immutable maps and thumbnails use package-hash paths and the planned header `public, max-age=31536000, immutable`. File ETags are their SHA-256 hashes. Mutable catalog metadata references only content-addressed assets and uses revalidation/no-cache semantics. A published hash cannot be replaced.

The local planning gate passes, but real mobile devices, network latency, image decode, GPU memory, CDN behavior, and map switching must be rehearsed in an isolated deployed staging project before production.
