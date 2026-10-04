# Halloween map transition draft

Requested October 4, 2026, using the supplied painted medieval atlas as inspiration. Draft for visual review; no merge or deployment is authorized by these notes.

Painted charcoal bats and ochre autumn leaves sweep across an opaque parchment-and-aubergine dusk veil, then leave in the travel direction. Fine ink outlines, matte shading and muted colors follow the current illustrated map aesthetic. The existing four-direction cover/reveal sequence, map readiness, input guard, watchdog and cleanup remain in use. This adds no particles, animation timers, scenery placements, gameplay rules or backend changes.

## Artwork and restoration

- The original cloud PNG, optimized WebP, CSS, animation keyframes and explicit `theme: "clouds"` path remain intact. The existing low-priority cloud preload is retained for immediate restoration/comparison.
- The default theme is Halloween from October 1, 2026 at 00:00 UTC until November 1, 2026 at 00:00 UTC, exclusive. Each new transition checks the date. Clouds return automatically afterward; a transition already running retains its selected artwork. Future October seasons require a separate decision.
- `theme: "halloween"` or `theme: "clouds"` can override the date for local review. This is an animation-manager option, not a player setting or purchased skin.
- [bats-and-leaves.png](bats-and-leaves.png) is the preserved transparent source created with built-in `image_gen`. [prompt.json](prompt.json) records the final prompt and reference role. [asset.json](asset.json) records the production derivative and SHA-256.
- The single 512×512 alpha WebP is 32,516 bytes and is shared by both moving layers. It is requested when a Halloween transition begins, outside installation precaching. Decoded texture size is 1 MiB. The opaque veil remains available if that optional artwork fails.
- Production packaging reserves 36 KiB for this retained-cloud addition: exactly one Halloween tile below 32 KiB and 4 KiB for theme/style/URL integration. Both textures are required in the build; existing entry, offline-shell, prepared-world and total artifact caps remain fixed.
- The Halloween layers explicitly disable the cloud-only tint and screen blend, preserving dark ink outlines. Reduced motion hides bats/leaves and uses the existing stationary fade; Off creates no transition.

## Local review

Run `node tools/map-benchmark/server.js --port=8817`, then open `http://127.0.0.1:8817/docs/art-sources/halloween-map-transition/preview.html`.

The preview uses the real game with local synthetic map data. Choose either artwork, any cardinal direction and Full/Reduced/Off. Play replays cover/reveal; Hold cover pauses at the covered loading state until Reveal map or the existing watchdog. The preview does not navigate to a different map; production map-switch integration is covered separately by navigation validation. The local preview page is excluded from the production client.

## Validation

- `tools/validate-animation-system.js`: exact UTC boundaries (including the November cutoff and no automatic recurrence in 2027), automatic selection, preserved cloud override, fixed layer count and Full/Reduced/Off cleanup, plus the existing shared animation contracts.
- `tools/validate-halloween-map-transition-browser.js`: desktop 1440×900 and landscape mobile 844×390 (DPR 2), all four directions, held cover, early completion, dark outlines without cloud filters, retained clouds, Reduced/Off, superseding transitions, 30 cancellation cycles, missing-art fallback and local review controls. Screenshots and results are written to `release-artifacts/halloween-map-transition/`.
- `tools/validate-map-loading-browser.js`: real map-navigation dependency checks, delayed/failed definitions, artwork and city data, retries, stale sessions and current-topology traversal.
- Production packaging and asset budgets validate hashed artwork, retained clouds, service-worker references and cache sizes. Source PNGs and the preview are excluded from production.

Visual approval and physical-device motion review remain separate from synthetic browser checks. Deployment has not been performed.
