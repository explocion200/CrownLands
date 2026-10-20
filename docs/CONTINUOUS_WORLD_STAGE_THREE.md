# Stage 3: authenticated private area feed

This is the first Stage 3 implementation, authorized after the owner reported that the Stage 2 preview loaded and felt smooth on an Android phone. It remains an inspect-and-navigate test. It does not enable the continuous map in the live game.

## What runs

`tools/map-benchmark/seamless/stage-three-server.js` starts a separate loopback-only service, normally on port 8801. It creates a randomly named `migration_world3_*` schema in the existing isolated `crownlands_migration` database. The existing rehearsal `Store` rejects other database names, hosts and schema families. The service imports no production credentials, accounts, realm pointer, game state, email delivery or gameplay commands.

The 81 prepared `core-expansion-v1` definitions provide the same 3,720 fictional cities, approved preview positions, original catalog coordinates, layered artwork and sample road patrols used in Stage 2. This does not claim that all prepared sections are active in production. No city position, travel timing or ownership in the live game changes.

The test uses Crownlands' existing `AuthService`, local password hashing and database-backed revocable sessions. Two randomly credentialed `example.test` accounts are created in that schema. An explicit two-account visibility list restricts private sample armies; nearby geography does not grant access. This intentionally conservative fixture policy is **not** a completed implementation of every live clan, rally, scouting or reinforcement visibility rule. That projection requires separate parity tests before real game data can be attached.

## Snapshot and update contract

- A camera interest set contains at most 16 valid, unique section IDs. The server checks membership and realm identity independently of those IDs.
- The first request returns an atomic PostgreSQL snapshot, server epoch, revision and server-relative sample clock. Snapshot rows and journal watermark use one repeatable-read transaction.
- While the same areas remain loaded, one-second polling returns only changed objects, march descriptors and explicit removals. Route geometry is shared by route ID. Unchanged objects retain their identity in the client cache. Troop positions interpolate locally along their sample roads between replies.
- Reconnect uses the last epoch/revision. The journal retains 60 change revisions, and a response examines at most 256 events before falling back to a fresh snapshot. Repeated changes to a key collapse to its latest state while retaining the original visibility needed for removals.
- Area changes and returning from overview require fresh snapshots. Old requests are aborted and generation-checked; stale results cannot overwrite the new camera's area. A server epoch change resets the cursor and prepared route geometry. Cursors also identify the authenticated account; switching accounts in another tab forces a new snapshot and clears the former account’s inspector/follow state, including unloaded selections.
- Objects deleted or no longer visible in the subscribed area disappear; their selection and following state are cleared. Simply unloading an area preserves a last-received inspector. Auth expiry/revocation clears all cached private area data and offers sign-in again.
- Session validity is checked both before reading and before returning the result, including revocation during an in-flight request.

This is bounded delta polling, not an SSE/WebSocket deployment. There is no public subscription endpoint or backend migration. The prototype remains excluded from game packages.

## Running and stopping the private test

```sh
node tools/map-benchmark/seamless/stage-three-server.js --port=8801
```

For the crowded fixture, add `--crowded`. The normal/crowded realm is fixed at process start, rather than allowing a client to request arbitrary workloads.

Open `http://127.0.0.1:8801/__benchmark__/seamless/?catalog=full`. The temporary Rowan account is saved in `release-artifacts/seamless-stage-three-session/credentials-8801.json`, inside a mode-0700 folder with a mode-0600 file. Do not commit, publish or copy those credentials into a report. They are unrelated to the owner's real login. No Google, Firebase, Stripe or other account sign-in is needed.

The service binds only `127.0.0.1`, checks exact Host and Origin, serves an explicit asset allowlist, rejects game commands and outside paths, and uses a separate HttpOnly/SameSite cookie for each private port. HTTP is limited to this loopback development boundary; it is not a production authentication configuration. No LAN listener, firewall rule, router forward or live Caddy route is added.

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

## Remaining Stage 3 gates

1. Improve crowded rendering on constrained devices and repeat physical-phone testing of this authenticated path. The earlier Android report covered the sample Stage 2 path, not this login/data transport. Synthetic CPU slowdown is not an actual phone measurement.
2. Finish the remaining outer-section painted joins. This first Stage 3 change retains Stage 2 artwork; it does not regenerate or replace production terrain.
3. Implement and verify the full live visibility projection in an isolated realm, including clan/rally participants, incoming armies and reinforcement privacy, then exercise true game-state updates and reconnect/restart behavior. The current fixture realm proves the transport and auth boundary, not complete multiplayer parity.
4. Review network budgets, load shedding, production transport, rollout/rollback and explicit live-release authorization before attaching live player sessions. No production deployment or extra backup is part of this update.
