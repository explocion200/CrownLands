# Device, network, and Studio QA

## Desktop and Studio

The deployed Studio is `https://crownlands-map-staging-2026.web.app/`. Desktop Chrome visual/DOM inspection passed. The title and permanent banner identify `Crownlands Studio — STAGING`, the exact staging project, and `NEVER PRODUCTION`. Tokens are memory-only. The interface exposes controls, lifecycle inspection, region selection, package hashes, 40-city overlays, road sockets/edge contracts, publication approval, activation approval, refresh, and STOP EXPANSION.

The authenticated staging workflow was exercised during the real rehearsal. A later unauthenticated reload correctly returned to “Not connected” rather than persisting credentials.

## Network

Real staging Storage endpoints were used through an authenticated synthetic-player session. A 326,452-byte map loaded in 575.17 ms on the available connection. A conditional repeat returned 304 with zero body bytes. A second-region transition loaded 319,164 bytes in 753.12 ms. A forced failed request returned 403 and the immediate retry recovered with HTTP 200 in 831.49 ms.

Moderate and slow profiles used deterministic client-side delay/throughput throttling over real staging HTTP responses: 5 Mbps plus 150 ms latency completed in 1,191.91 ms; 1 Mbps plus 400 ms latency completed in 3,470.62 ms. These are reproducible lab measurements, not carrier-field tests.

## Required physical devices — blocked

No Android handset or iPhone was attached/available to this environment. Login, load, pan, zoom, city selection, 40-city readability, marches, region transition, Gate/Arrow, reload, PWA, and offline/cache behavior therefore remain unverified on required physical mobile devices. Emulator/browser automation is not counted as a substitute. Phase 9 cannot be declared production-ready until those runs and real mobile-network measurements pass.
