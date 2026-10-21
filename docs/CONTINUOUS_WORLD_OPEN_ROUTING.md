# Private open-world spacing and routing draft

The owner approved developing wider city placement and travel across any passable adjoining edge on October 21, 2026. Branch: `codex/continuous-world-open-routing`. This milestone is a private experiment, not installation of a new live movement system.

## Verified scope

The source release contracts both select `core-expansion-v1`. A fresh restricted read verified current realm `main-realm-2026-10`, shard `shard_0001`, with 112 active sections. All 4,960 current ordinary cities matched a template slot within 0.312 artwork pixels; no duplicate slots or omitted objects were found. Only these aggregate results were retained. No archived realm or production record was modified.

The opt-in `--open-world` reader mode assigns each matching city the same wider display position used by the approved sample prototype. Matching uses the original template coordinate, not player ownership or a guess from the city name. Original IDs, game positions and artwork-local coordinates remain separate from displayed positions. Generated New Lands use their authoritative template with their own grid offset. Ownership changes do not reshuffle cities. Unknown future positions remain visible with a review label and cannot be used as draft route endpoints.

Landmarks and decorative artwork keep their current positions. The same 54-pixel city edge inset and 88-pixel spacing remain. Each of the 112 sections has cities near every edge; no extra cities were created. The existing owner reader without `--open-world` remains available with original positions.

## Proposed routes

Select a location, press **Start route**, select another location and press **Route here**. A light route line shows the result. **Animate test** and **Follow test** demonstrate a 12-second movement; that duration is explicitly not a game ETA. Dragging cancels following. Clear discards the route and aborts outstanding requests. Late results cannot restore a cleared route. Realm, membership or session loss clears the draft UI.

The new route endpoint exists only inside the authenticated private reader. It accepts two public object identities and the current realm, not client geometry, distances, speeds or arrival times. Endpoints and access are checked freshly before and after routing; deleted locations and revoked access cannot receive a result. All gameplay commands remain rejected. The response contains only public endpoint labels, route geometry and draft distances, never exact troop counts or account fields.

The private server worker uses direct lines where unobstructed and bounded Theta* with line-of-sight smoothing for detours. Section edges do not impose portals or road gates. It prevents crossing inactive land, diagonal corner shortcuts between disconnected sections and structure footprints. Decorative scenery is not turned into new gameplay blockers. Structure clearance is derived from the displayed artwork; this proposed clearance still needs gameplay review before replacing live collision geometry. This is a near-shortest path experiment on an 18.1-pixel search grid, not a proof of globally optimal continuous geometry.

One worker handles routing separately from area refreshes. At most four requests wait/run, successful results have a 128-entry cache, and each search is bounded by 50,000 visited nodes and a 700 ms search budget. Worker failure/timeout fails closed; there is no fallback straight line through obstacles. A per-viewer one-second rate limit also applies. These bounds deliberately return a retry/budget message rather than blocking map navigation. Larger scale routing throughput still requires testing before production integration.

## Existing marches and timing

Recorded live marches are labeled **Existing march · original route**. They keep every original path point and launch/arrival timestamp. In the wider-layout draft their original city endpoints can therefore differ from the moved display castle; those are existing-order traces, not examples of the new route. New test routes terminate at the displayed city positions. The eventual rollout needs a deliberate transition for old in-flight routes; this preview does not silently move, accelerate, recall or resend an army.

All tested current section coordinate scales are equal, approximately 2.23480663 game map units per artwork pixel. Draft distances use that existing scale. A validator reads the current ordinary travel formula directly from `functions/index.js` and compares scout, attack, transfer, reinforcement and rally-join timings across all troop-band boundaries and three speed multipliers (765 cases). No economy or travel constant was changed.

For an illustrative 1,000-troop attack with no speed bonus, development measurements were:

| Journey | Current distance | Draft distance | Current duration | Draft duration |
|---|---:|---:|---:|---:|
| Neighboring edge cities | 1,045 units | 473 units | 169 s | 76 s |
| Two cities within one section | 2,059 units | 2,458 units | 332 s | 397 s |
| Across the Core | 16,016 units | 11,613 units | 2,586 s | 1,875 s |

These examples demonstrate that open crossings can shorten travel while spreading cities can lengthen local trips. They are not a promise that every trip is faster, and not actual orders or personalized ETAs. Review this balance before a live switch. Existing march timers remain unchanged.

## Validation and delivery

Focused tests cover all 4,960 template city placements, 202 adjacent section edges, off-center horizontal/vertical crossings, four-section corners, missing land, obstacle detours, invalid/blocked endpoints, search budgets, bounded worker admission/cache, immutable source records, preserved recorded march timers, deleted endpoints and in-flight revocation. Sixteen longer current-world route samples cross up to 15 sections. Two independent fictional browser identities test ownership privacy, route selection, stale-result suppression, mouse/touch controls, following, mobile panels and authentication expiry. Desktop and landscape 844×390/568×320 measurements include Chrome's 4× CPU slowdown on the mobile cases.

Local results and screenshots are under ignored `release-artifacts/continuous-open-routing/`: `routing.json`, `travel.json`, `browser.json`, and `reader-*.png`. They are development evidence, not published game assets. Production artifact validation excludes this toolchain. Merge does not install or expose it.

Development measurements after the idle-overlay optimization: 60.0 FPS / 16.7 ms p95 at 1440×900; 58.2 FPS / 16.8 ms at 844×390; 59.5 FPS / 16.8 ms at 568×320. Both mobile sizes used 4× CPU slowdown. These six-second browser samples are not new physical-phone results. They had zero browser errors or external requests, four full terrain images, sixteen thumbnails, two concurrent asset requests, and a stable 24 listeners including the five draft controls. Sixteen longer route samples took roughly 28–587 ms in a development run with browser QA partly overlapping; these are not production throughput measurements. Selected checks replace local short-run reports with their latest results.

The actual owner-only draft was inspected in Codex: spread city positions and a Stoneward-to-Greybanner Hold route crossing away from the road connection. The image is retained locally as `owner-open-route.png`. No real march was sent.

Start a separately authorized, expiring owner-only session using the existing restricted grant and `live-server.js --grant=<private-file> --port=8803 --open-world`. Keep the loopback binding and grant expiry/cleanup described in [the reader instructions](CONTINUOUS_WORLD_LIVE_READER.md). Do not paste the private key into a URL, report or Git. This work adds no public proxy or LAN route and leaves the deferred player pilot disabled.

Before live use: review the wider layout and distance balance; test longer/adversarial journeys and multi-player routing throughput; integrate the reviewed planner into every server-authoritative attack, scout, transfer, reinforcement, return and rally path; version routes/geometry and transition already-dispatched orders; validate authenticated gameplay and coordinate compatibility; then obtain and verify a coordinated backend/client rollout. The current live movement system is unchanged.
