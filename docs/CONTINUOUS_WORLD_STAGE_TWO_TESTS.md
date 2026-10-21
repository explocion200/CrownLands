# Continuous world — private Stage 2 testing

Owner-approved testing extension, October 20, 2026. This remains a loopback-only, fictional inspect/navigation preview. No live accounts, database, authentication, combat, travel, reward or public-serving changes are included.

## Access and scope

Run `node tools/map-benchmark/server.js --port=8799` with Node 22. Open <http://127.0.0.1:8799/__benchmark__/seamless/?catalog=full>; append `&crowded=1` for the crowded fixture. The original nine-section preview remains at `/__benchmark__/seamless/`.

The full mode covers the current `core-expansion-v1` repository catalog: **81 prepared sections, 3,720 cities and 8,244 total objects**, on a 13,032×9,774 logical-pixel plane. These are prepared definitions, not a count of currently generated live maps. No production realm pointer or player data is read. Section offsets are `(gridX + 4) × 1448`, `(gridY + 4) × 1086`. Original IDs/local coordinates are retained separately from the existing private city-spreading layout. All cities remain in their original sections.

The normal fixture has 144 patrols, one across each adjoining east/south road pair; the crowded fixture has 1,728 across those same routes. Only nearby route data and visible actors are loaded/drawn. Every five seconds the fictional feed changes one castle's ownership/troops per loaded section and troop counts. This is a transport simulation, not a production game subscription.

## Loading, rendering and recovery

- The initial catalog response contains metadata, counts and terrain URLs, not all object/route records. A single cancellable area request loads up to 16 nearest visible/neighbor sections. `catalog-feed.js` supplies immutable fixtures; `feed.js` handles area-set generations, revisions, cancellation, timeout, retry and eviction independently from camera/selection.
- Each response deduplicates route geometry shared by crowded patrols. A new area set aborts the old request. Late area-set responses or older revisions cannot overwrite the current dataset. Disconnection retains the last received data, marks it stale, and leaves navigation available. Retry, the next five-second poll or an online event recovers without moving the camera.
- An unloaded selected object retains one inspector snapshot; it is labeled **last received**. Re-entering that area refreshes its owner and troop count. Following retains the chosen route across area loading; manual movement cancels following.
- Full terrain stays capped at four images, thumbnails at 16, and image fetch/decode concurrency at two. Distant thumbnails/full terrain are revoked and removed from image nodes. Sprites are shared in a finite catalog cache. At overview zoom, detailed objects, area records and thumbnails are released; a 304,320-byte, 1620×1215 atlas provides the whole ground overview. When each section is narrower than 90 screen pixels, retain only the readable Stoneward home label instead of 81 illegible name fragments; section names return as the user zooms in.
- `build-catalog-overview.js` only resizes/composes existing approved artwork. Its manifest hashes source images, catalog and composition code. The nine privately recomposed sections retain their matching gutters. The other 72 sections use their existing catalog artwork: their painted color/road joins have **not** been reauthored or certified seamless. All tile rectangles are gap-free; that geometric result is distinct from texture matching.
- Moving troop markers have their own screen-space layer. The camera transform still updates each frame, while object/asset reconciliation runs every 120ms or sooner when the 75px culling margin, zoom, selection, images or area updates require it. This avoids rebuilding visibility/asset plans for each tiny camera movement. The world has no permanent low-resolution raster hint; native castle detail is retained.

## Reproduce validation

```sh
node tools/validate-seamless-world.js
node tools/validate-seamless-catalog.js
node tools/validate-map-benchmark.js
node tools/validate-seamless-phone-preview.js
# Set CHROME_PATH to Chrome/Chromium if needed.
node tools/validate-seamless-world-browser.js
CROWNLANDS_SEAMLESS_SOAK_SECONDS=180 node tools/validate-seamless-catalog-browser.js
```

The full-catalog browser validator defaults to at least 30 seconds of repeated full-world trips after an initial warm-up trip for focused CI. The local extended run requests at least 180 seconds. Each complete trip visits every section, then returns to the same frozen home scene for garbage collection and DOM/listener/heap comparison. It verifies all 144 joins and 64 four-section corners, exact selection, ownership/troop updates, selection eviction/reload, troop following, overview release, actual simulated-network offline/reconnect behavior, a delayed obsolete request, and native touch at 844×390 and 568×320. The shared nine-section suite also verifies image failure/retry/delay, wheel/pinch anchors, drag suppression, fast zoom changes, source-pixel joins and DPR 1/2 sprite sharpness. Both reject outside requests and browser runtime exceptions. The pure suite checks every catalog identity/original position, city/object clearances, malformed subscriptions, revision ordering and cache bounds.

Evidence is saved locally under ignored `release-artifacts/seamless-catalog/` and `release-artifacts/seamless-world/`. Production artifact validation checks that these tool-only entry points/assets remain excluded from published packages. No emulator suites apply: there is no server-authoritative implementation change.

## Measured results

Measured 2026-10-20T22:58:27.724Z with Chrome/153.0.8010.12 on the home server. Each full-catalog case records six seconds of continuous panning/zooming with normal (144 total) or crowded (1,728 total) patrol fixtures; nearby subsets are loaded. Headless Chromium uses the existing software-rendering test configuration, and 4× CPU slowdown is a synthetic limit, not a physical phone result. Other host activity can affect timing.

| Viewport | Fixture | CPU slowdown | Mean FPS | Frame p50 / p95 / max (ms) | JS work p95 (ms) |
| --- | --- | ---: | ---: | --- | ---: |
| 1440×900 | Normal | 1× | 60 | 16.7 / 16.8 / 16.8 | 2 |
| 1440×900 | Crowded | 1× | 60 | 16.7 / 16.8 / 16.8 | 2.6 |
| 1440×900 | Normal | 4× | 54.5 | 16.7 / 33.3 / 50.1 | 8.3 |
| 1440×900 | Crowded | 4× | 43.5 | 16.7 / 50 / 66.7 | 11.3 |
| 844×390 | Normal | 4× | 49.6 | 16.7 / 33.4 / 66.7 | 10.6 |
| 844×390 | Crowded | 4× | 36.2 | 16.7 / 50 / 316.6 | 15.1 |
| 568×320 | Normal | 4× | 51.2 | 16.7 / 33.4 / 50.1 | 10.5 |
| 568×320 | Crowded | 4× | 39.1 | 16.7 / 50 / 100 | 14.2 |

The unthrottled desktop target is met. The full-world throttled cases do **not** meet 60 FPS, especially crowded landscape scenes. In the comparable original nine-section regression, reducing repeated reconciliation improved crowded/throttled results from approximately 33–36 FPS in the initial run to 42–47 FPS; this is an improvement, not a completed mobile performance gate. Both density scenarios keep individual castle/troop markers.

After an initial warm-up trip, the extended test completed 5 further visits to every section over 201.4 seconds. Each return restored 224 home-scene objects, unchanged listener counts and 9.06–9.13 MiB retained JavaScript heap after garbage collection. This is bounded memory over the measured period, not proof of indefinite stability or GPU memory usage. No browser runtime exceptions or outside requests occurred. Full terrain, thumbnail and image-request peaks remained within 4, 16 and 2 respectively.

The largest recorded area response was 1.29 MiB (1,347,870 bytes including HTTP overhead). This makes incremental production updates a priority even though the local test recovers correctly from a 200ms-latency, 250KB/s download connection and from offline mode.

The extended evidence is retained as `release-artifacts/seamless-catalog/extended-report.json`; `report.json` may be replaced by shorter subsequent focused-validation runs. The nine-section comparison is retained in `nine-section-regression.json`. The owner subsequently tested the full-catalog preview on an Android phone on home Wi-Fi and reported “Loads and feels smooth.” This is a qualitative result, without a phone model, instrumented FPS or separate crowded-mode confirmation. The temporary LAN endpoint and firewall rule were removed afterward.

## Decision and remaining gates

This validates the private area-loading approach and identifies what still needs work before live gameplay integration. A merge of this test harness does not enable a continuous live map.

1. Initial physical-phone check completed with the owner’s smoothness confirmation; repeat it after material renderer or authenticated-feed changes. CDP touch input, viewport sizes and CPU throttling do not measure a phone's GPU, thermal limits, memory pressure or browser chrome. This computer's preview stays loopback-only; a phone cannot open its `127.0.0.1` URL directly. For the owner’s Android phone on home Wi-Fi, use the separate, explicitly started `phone-server.js` described below. Keep the unrestricted benchmark server on loopback and add no public router forward.
2. Improve the crowded/throttled rendering budget further before a large real multiplayer scene. Preserve readable individual markers; evaluate a dedicated renderer or measured level-of-detail approach using this fixture rather than claiming that desktop FPS proves mobile capacity.
3. Replace the synthetic whole-area snapshots with an authenticated, authorized production feed using initial snapshots plus versioned deltas, resumable reconnects and explicit deletion/movement handling. The current five-second JSON snapshots intentionally expose payload and allocation costs; they are not the final production wire format. Establish bandwidth/rate/security limits before attaching live accounts.
4. Audit/compose the remaining terrain seams using the approved art workflow, and verify actual player placements, travel semantics, visibility and rollout/rollback controls in a separate approved stage.

The first authenticated fixture-feed milestone is tracked in [Stage 3](CONTINUOUS_WORLD_STAGE_THREE.md).

No live game services are restarted, no production data changes, and no extra database backup is created by these tests.

## Temporary Android home-Wi-Fi test

The owner selected an Android phone on the same home Wi-Fi. This optional server is separate from `server.js`; it does not proxy the unrestricted repository server. Start it only for the test:

```sh
node tools/map-benchmark/seamless/phone-server.js --host=192.168.1.145 --port=8800 --minutes=60
```

The specified address must belong to a private interface on this computer. Only clients in that interface's IPv4 subnet are accepted, with the exact expected Host and same-origin browser requests. The server exposes the preview HTML, five named browser files, the exact image assets referenced by the fictional catalog, and three read-only fixture/catalog/area endpoints. All other repository files and live routes return 404. No accounts, cookies, passwords or game commands are used. An exact-origin marker in the served HTML permits this intentional phone connection without enabling arbitrary-host copies of the normal loopback preview. CSP blocks outside connections, frames and forms. The process closes active connections and its listener after at most 60 minutes; it also closes on SIGTERM/SIGINT.

If the host firewall blocks the test port, use only an explicitly temporary rule from the home subnet to this exact interface/address/port. Schedule its deletion before adding the rule, and remove it when testing finishes. Do not open the router or bind the benchmark server to all interfaces. The phone server itself never changes the firewall.

On Android Chrome, keep Wi-Fi on, open the printed `?catalog=full` link, turn landscape, pan through several sections, pinch in/out, tap a castle and follow a sample patrol. Check that dragging stops following and Home restores Stoneward. Try `&crowded=1` separately and report the phone model and visible stuttering or loading problems. This is a physical interaction check, not an instrumented FPS measurement. All displayed ownership and troops are fictional. The owner completed this initial check and reported “Loads and feels smooth”; the account-free endpoint has since been closed.

`validate-seamless-phone-preview.js` checks allowlisted image/data delivery, all major forbidden file/API routes, invalid subscriptions, non-read methods, foreign Host/Origin, cross-site fetch rejection, expiry and actual listener shutdown. A headless mobile browser loads the full scene through a nondefault loopback address to exercise the phone-origin bootstrap and verifies zero failed assets, outside requests or runtime exceptions. This verifies the server path, not actual Wi-Fi connectivity or phone performance.
