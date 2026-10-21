# Stage 3: authenticated private area feed

This private Stage 3 implementation includes the owner-requested mobile, terrain and visibility follow-up to the initial authenticated-feed milestone. It remains an inspect-and-navigate test. It does not enable the continuous map in the live game.

## What runs

`tools/map-benchmark/seamless/stage-three-server.js` starts a separate loopback-only service, normally on port 8801. It creates a randomly named `migration_world3_*` schema in the existing isolated `crownlands_migration` database. The existing rehearsal `Store` rejects other database names, hosts and schema families. The service imports no production credentials, accounts, realm pointer, game state, email delivery or gameplay commands.

The 81 prepared `core-expansion-v1` definitions provide the same 3,720 fictional cities, approved preview positions, original catalog coordinates, layered artwork and sample road patrols used in Stage 2. This does not claim that all prepared sections are active in production. No city position, travel timing or ownership in the live game changes.

The test uses Crownlands' existing `AuthService`, local password hashing and database-backed revocable sessions. Two randomly credentialed `example.test` accounts are created in that schema. The adapter now evaluates the existing `Access` engine inside the same PostgreSQL snapshot as its fixture rows. The two-account list is only a candidate prefilter; it cannot grant access. Fictional current-realm profiles, memberships and tower state provide actual permission dependencies. A strict map-field allowlist excludes credentials, inventories, combat forecasts, private reports and arbitrary added source fields. Other owners' exact counts are omitted; public army estimates/hidden counts are tested using the current server's pure `createArmyPublicProjection` producer.

`test-local-postgres-world-visibility.js` covers 24 cases: own/enemy/clan-only private armies, rally participants and defenders, public attacks/reinforcements/transfers, incoming views, stationed reinforcement owner/host/outsider, forming clan rallies, tower garrisons, foreign generation/shard/island, and own/expired/other-player scouting. It additionally tests ownership loss, tower ownership and clan-membership revocation without a map-row event, intelligence expiry during unchanged polls and restart recovery. This validates the read-only map projection against the current rules, not a full game-command or combat migration. Source rows, accounts and changes are fictional; no production export was used.

## Snapshot and update contract

- A camera interest set contains at most 16 valid, unique section IDs. The server checks membership and realm identity independently of those IDs.
- The first request returns an atomic PostgreSQL snapshot, server epoch, revision and server-relative sample clock. Snapshot rows and journal watermark use one repeatable-read transaction.
- While the same areas remain loaded, one-second polling returns only changed objects, march descriptors and explicit removals. Route geometry is shared by route ID. Unchanged objects retain their identity in the client cache. Troop positions interpolate locally along their sample roads between replies.
- Reconnect uses the last epoch/revision. The journal retains 60 change revisions, and a response examines at most 256 events before falling back to a fresh snapshot. Repeated changes to a key collapse to its latest state while retaining the original visibility needed for removals.
- Small camera movements retain the existing area window while it covers the viewport plus a prefetch margin. This avoids repeatedly downloading full snapshots when nearby section rankings change. Area changes and returning from overview require fresh snapshots. Old requests are aborted and generation-checked; stale results cannot overwrite the new camera's area. A server epoch change resets the cursor and prepared route geometry. Cursors also identify the authenticated account; switching accounts in another tab forces a new snapshot and clears the former account’s inspector/follow state, including unloaded selections. Permission-document changes and scout expiry also change the scope epoch, forcing an authoritative snapshot and clearing offscreen private inspectors. The rehearsal uses a global permission-document journal watermark; a future production adapter must replace that with targeted dependencies.
- Objects deleted or no longer visible in the subscribed area disappear; their selection and following state are cleared. Simply unloading an area preserves a last-received inspector. Auth expiry/revocation clears all cached private area data and offers sign-in again.
- Session validity is checked both before reading and before returning the result, including revocation during an in-flight request.

This is bounded delta polling, not an SSE/WebSocket deployment. There is no public subscription endpoint or backend migration. The prototype remains excluded from game packages.

## Running and stopping the private test

```sh
node tools/map-benchmark/seamless/stage-three-server.js --port=8801
```

For the crowded fixture, add `--crowded`. The normal/crowded realm is fixed at process start, rather than allowing a client to request arbitrary workloads.

Open `http://127.0.0.1:8801/__benchmark__/seamless/?catalog=full`. The temporary Rowan account is saved in `release-artifacts/seamless-stage-three-session/credentials-8801.json`, inside a mode-0700 folder with a mode-0600 file. Do not commit, publish or copy those credentials into a report. They are unrelated to the owner's real login. No Google, Firebase, Stripe or other account sign-in is needed.

The service binds only `127.0.0.1`, checks exact Host and Origin, serves an explicit asset allowlist, rejects game commands and outside paths, and uses a separate HttpOnly/SameSite cookie for each private port. HTTP is limited to this loopback development boundary; it is not a production authentication configuration. The default stays loopback-only. An explicitly started phone mode is available below; it does not add a router forward or live Caddy route.

The process expires within two hours. Normal expiry or SIGINT/SIGTERM closes connections, drops only its randomly named fixture schema and removes its credential file. A force-killed process or host crash cannot run cleanup; any leftover `migration_world3_*` schema contains fictional data only and must be identified before manual removal. The script does not sweep or delete other rehearsal schemas. Restarting creates fresh credentials and a new epoch.

## Validation

`tools/test-local-postgres-world-stream.js` covers database isolation, password sessions, wrong realm/area/Host/Origin, forbidden routes and writes, two-account army visibility, incremental ownership, removals, missed updates, retention/oversized-delta fallback, epoch recovery, unchanged object identity, malformed packets, obsolete area results, revocation during a read, cross-account cursor isolation, expiry/listener shutdown and schema cleanup. No test emails are sent.

`tools/test-local-postgres-world-browser.js` exercises the actual sign-in page and private HTTP service at 1440×900, 844×390 and 568×320. It checks selection and camera stability during updates, authoritative deletion, cross-boundary follow and visibility loss, overview/cache restoration, offline and throttled reconnect, native simulated touch, repeated area eviction with retained heap/DOM/listener bounds, and revoked-session recovery. It records frame times, response sizes and screenshots under `release-artifacts/seamless-stage-three/`. It asserts no outside requests or runtime exceptions.

The shared renderer also receives the existing nine-section and full-catalog regression tests, including all internal joins, corners, zoom anchoring, image failures, delayed requests, drag suppression, artwork sharpness and residency bounds. Production artifact validation confirms the tool-only code is excluded. These changes do not alter the live game authority, so no game emulator suite is newly required; the required GitHub emulator gate still runs its selected-check decision.

The representative 16-area integration test measured an initial snapshot of about 1.04 MB and a three-change delta of about 6.9 KB (over 99% less data for that update). Empty polls carry only the envelope. These figures do not represent a bandwidth guarantee under continuous rapid panning: entering a new area still needs a snapshot.

## Initial measured rendering results

Measured 2026-10-20T23:51:00.496Z with Chrome/153.0.8010.12, six-second navigation windows in the existing headless software-rendering harness. Normal/crowded catalog fixtures contain 144/1,728 patrols before the two-account visibility filter; this account receives only its authorized subset. These are not directly comparable to Stage 2's all-armies-visible figures, and do not establish physical-phone or multiplayer capacity.

| Viewport | Scene | CPU slowdown | FPS | 95th-percentile frame |
| --- | --- | --- | --- | --- |
| 1440×900 | Normal | 1× | 59.8 | 16.7 ms |
| 1440×900 | Crowded | 1× | 60 | 16.7 ms |
| 1440×900 | Normal | 4× | 52 | 33.4 ms |
| 1440×900 | Crowded | 4× | 45.9 | 50 ms |
| 844×390 | Normal | 4× | 46.9 | 50 ms |
| 844×390 | Crowded | 4× | 40.7 | 50 ms |
| 568×320 | Normal | 4× | 48 | 50 ms |
| 568×320 | Crowded | 4× | 42.5 | 50.1 ms |

Desktop met approximately 60 FPS. Constrained cases remain below that target, so the renderer gate remains open. Four repeated corner-to-corner area trips kept heap, DOM nodes and listeners within the test bounds. No outside requests or runtime exceptions were observed. Later validator runs replace the local report and may show normal host-load variation.

## Mobile and terrain follow-up

Scenery and patrol artwork now use two viewport-sized Canvas 2D batches with reusable sprite images/stamps. Castle artwork and native object buttons remain DOM elements; patrols retain native keyboard/click targets and canvas focus/selection rings. No WebGL conversion was introduced. Decorative details smaller than eight screen pixels are skipped; camera motion, exact object identity, follow and selection are preserved. Terrain remains in its existing image layers. The expensive scene reconciliation is no longer repeated merely because a patrol moved.

All 81 private terrain pairs now use the approved meadow and dirt material, matching reflected ground edges, globally phased roads and two-pixel neighbor gutters. The builder renders one bounded patch at a time instead of a 127-megapixel intermediate. The original live artwork is untouched. The private files total about 21.2 MiB on disk; residency still caps at four full images, 16 thumbnails and two concurrent requests. The overview atlas was rebuilt from these files. All 144 full/thumbnail joins pass (worst mean channel difference 2.15/255), and 5,089 road-center samples pass. The shared browser checks cover all 64 four-section corners and retain castle detail at DPR 1 and 2 (about 0.97 of the native reference).

Representative follow-up run, same Chrome/153 headless harness and six-second navigation workload:

| Viewport | Normal, 4× CPU slowdown | Crowded, 4× CPU slowdown | Crowded frame p95 |
| --- | --- | --- | --- |
| 1440×900 | 55.8 FPS | 49.4 FPS | 33.4 ms |
| 844×390 | 59.5 FPS | 51.4 FPS | 33.4 ms |
| 568×320 | 58.8 FPS | 55.8 FPS | 33.3 ms |

Both desktop scenes measured 60 FPS without CPU slowdown. The earlier same-host authenticated run measured 39.1/41.6 FPS for crowded landscape sizes. These are illustrative repeated-run measurements with host-load variation, not a capacity guarantee. Final validators replace `release-artifacts/seamless-stage-three/report.json` and record snapshots/bytes during motion as well as frame timing. Retained heap, DOM/listeners, image bounds, delayed/failed loading and offline recovery are checked again. Physical Android measurements remain distinct from synthetic slowdown.

## Authenticated Android check

Start only when the owner is ready, using this computer's verified private interface:

```sh
node tools/map-benchmark/seamless/stage-three-server.js --host=192.168.1.145 --port=8800 --crowded
```

This explicit mode binds that interface, accepts only its subnet and exact Host/Origin, serves only allowlisted preview routes/assets, and expires in one hour. **Enter sample world** creates a session for the fixed fictional Rowan account through the existing auth service; it never asks for or accepts a real Crownlands login. The ordinary loopback mode does not expose this shortcut. Production sessions, email and game commands remain inaccessible. Any temporary host-firewall opening must be subnet/port-specific, expire with the test and be removed afterward. No public forwarding is needed.

On Android Chrome in landscape, pan, pinch, select a castle, follow a patrol across a section edge, use Home and Fit preview, then press **Measure 10s** while navigating. Record phone model, displayed FPS/p95 and any input delay. Sign out/re-enter and confirm recovery. `test-local-postgres-world-phone.js` verifies the authenticated LAN mode on a separate loopback address, denied external routes/origins, logout and load shedding; it does not substitute for the actual phone check.

## Readiness and rollout boundary

The private code and automated visibility/terrain gates can be merged independently of a live launch. The following remain explicit release gates:

1. Finish the updated authenticated physical Android check (the previous owner feedback was for Stage 2). Crowded synthetic cases improved but do not uniformly reach 60 FPS.
2. A separately reviewed production adapter must map current active-realm documents and **public** movement routes into these DTOs, use targeted permission dependencies, implement compressed snapshots/deltas and enforce per-account/aggregate budgets under multi-client load. The fixture service is not a production service: it knows two fictional accounts, uses HTTP only inside a private test boundary, and uses conservative map inspectors. Do not expose its rehearsal endpoints publicly or attach player sessions to it.
3. Proposed rollout: owner-only read-only preview first; then a small opt-in cohort with monitored frame/network/authority errors. Keep the section-based map as the default and provide an immediate feature-flag rollback. No city coordinates, travel rules, commands or data migrations in that first rollout. Pause on a visibility mismatch, growing queues, repeated snapshot fallback or degraded phone input; stop the new reader and return to the existing map.
4. Proposed budgets for review: <=16 areas, four full textures/two image requests; one in-flight area read per account; <=4 MiB decoded snapshot; target <=64 KiB ordinary delta with fresh-snapshot fallback for larger batches; idle polling no more than once/second and suspended while hidden. The private service now sheds overlapping reads with 429/Retry-After instead of building a database queue. Its measurements validate the two-account rehearsal, not aggregate live-player throughput.
5. Explicit production-release authorization after those checks. No production database, installed game service, live route or backup was changed by this work.
