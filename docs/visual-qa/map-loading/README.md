# Map loading verification

## Fix

Map navigation previously awaited an uncached region definition before setting its loading state. During that wait the map accepted another navigation request, and the player received no loading feedback. A definition request also had no deadline, so a stalled connection could keep the request pending indefinitely.

Navigation now sets the existing loading state before requesting the definition. Repeated navigation is blocked immediately; the existing loading panel appears after its short delay. The source map remains connected during this stage. Failed requests release the lock, keep the current map, and permit another attempt. A changed game state or session cancels navigation after the definition arrives.

Region definition downloads now abort after 15 seconds, including a stalled response body. The loader clears the failed pending request so retry can fetch again. Map art and authoritative city snapshots still gate the destination becoming ready. No gameplay rules, backend code, map assets, or world data changed.

## Browser regression coverage

`tools/validate-map-loading-browser.js` uses the real navigation, renderer and region loader against the loopback benchmark API. Its city snapshots and failure responses are synthetic.

- At 1440 × 900, 844 × 390 and 568 × 320: early loading feedback, repeated requests, visible loading panel, definition errors, stalled headers and response bodies, failed artwork, delayed or failed city snapshots, successful retries, source-map recovery, and session replacement during the definition request.
- Normal outward/return navigation checks listener duplication and retired snapshots. Destination art must match the active region before a visit passes.
- Desktop traverses all 25 Core maps and 56 active New Lands maps, then revisits the first map. Each mobile size samples seven maps across Core and both New Lands layers, then revisits the first map. These visits verify city identities and counts after cache eviction and enforce the configured definition-cache limit.
- The timeout tests accelerate the clock while checking that the production deadline is 15,000 ms. Other navigation timings describe the local fixture, not production network performance.

Related validators cover Home navigation, map image loading and decoding, map-picker pointer/touch gestures, map interactions, city reconciliation, and asset budgets. The selected checks and dependency reasons are in `validation-plan.json`.

Generated browser evidence is under the ignored `release-artifacts/map-loading/` directory: `browser-validation.json` and loading-panel screenshots for all three viewport sizes.

## Read-only production asset audit — October 2, 2026

The current realm pointer identified world `main-realm-2026-10`, generation `realm-2026-10`, shared realm `shard_0001`. The active release uses `core-expansion-v1`; the current generation listed 56 active New Lands maps in addition to the 25 Core maps.

At 13:44 UTC, all 81 active maps' published definitions, full map images and thumbnails matched the production artifact for build `9e419506bfad7f909581ad032dcc3d342d2681e3`. Images were compared by binary SHA-256; definition JSON used SHA-256 after normalizing line endings. The local receipt is `release-artifacts/map-loading/production-scope.json`.

This confirms published asset completeness. Authenticated production map switching was not exercised; browser navigation uses synthetic snapshots. This branch has not been merged or deployed, and the production audit predates this fix.
