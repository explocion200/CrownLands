# Continuous world: authenticated normal-game interface

October 21, 2026. This milestone connects real local authentication, area reads, command handlers and persisted marches to the existing HUD in isolated tests. The human pilot was waived, not performed. Public activation remains held by the production integration requirements below.

## Connected behavior

The normal `index.html`, `firebaseClient.js` local facade, `local-client.js`, session cookies, CSRF checks, request queue, recovery journal and PostgreSQL callable handlers run together. The continuous camera displays the active catalog, including generated sections. The test creates two fictional accounts and its own disposable schema; it does not copy production accounts or records.

Authenticated snapshots/deltas and saved marches replace static scene data. Own counts remain exact; other players' private counts are absent. Selection resolves section plus object ID through regular section subscriptions. Cross-section selection preserves an armed source without resetting the camera. Old/new marches use their saved geometry and times; recalls retain return progress. Troops offer Follow, and dragging cancels it.

Native city, NPC, camp, stronghold, Citadel and Tower controls remain in use. Scout Nearby and Regroup get section-qualified candidates from the authenticated test service and submit existing request IDs and costs. Tower defaults match the normal server before an unclaimed Tower has a database record. Area failures remove stale controls while navigation remains available. Session, realm and permission changes clear private data and invalidate pending selection.

Optional `world/catalog`, `world/areas` and `world/options` handlers share existing authentication, host/CSRF/epoch checks, body bounds and deadlines, with a final session recheck before returning data. They return **404 without an installed reader**. Polling has separate 90/account/minute and 600/IP/minute quotas and at most four of twelve admission slots, preserving ordinary action capacity. Canceled queued reads are removed before dispatch; response status survives the facade so authorization loss cannot appear as a recoverable network error.

The mounted surface suppresses new terrain/scenery work in the hidden legacy renderer and restores its functions on disposal. The continuous renderer retains four full terrain images and two concurrent requests. Initial legacy boot images may remain cached; this is not a four-image limit on total browser memory.

## Tests

`tools/test-local-postgres-native-auth-world.js` intercepts every browser request into an in-process harness. API requests use real loopback HTTP servers; none reaches the public game. Fixture schemas are removed on completion. Run with Node 22, the existing local test PostgreSQL and `CHROME_PATH=/path/to/chrome node tools/test-local-postgres-native-auth-world.js`.

- UI clicks: city Send, cross-section target, troop slider/confirmation, saved movement, Follow/drag, Activity recall, Nearby/Regroup, NPC information/hunt, and camp/stronghold/Citadel/Tower information.
- Normal authenticated client/real handlers: reinforcement arrival and stationed return; rally create/join/withdraw/cancel/launch; unauthorized launch; worker failure and same-ID retry without duplicate deductions; ownership loss and sign-out.
- Recovery: area failure removes controls; retry retains the session. No external requests or browser exceptions are accepted.
- HTTP/client regressions: CSRF/owner/origin denial, malformed input, absent reader, independent quotas, queued cancellation and in-flight session revocation.
- Existing renderer/bridge regressions: seams/corners, delayed/failed assets, zoom/touch, rapid exact selection, cancellation and disposal. Private command tests also settle saved old/new marches in a **fresh backend process without the draft provider**, retaining geometry and timestamps.

The expanded authenticated run measured 60.0 FPS at 1440×900, 58.3 FPS at 844×390 and 59.3 FPS at 568×320, with p95 frames of 16.7–16.8 ms. Mobile sizes used 4× CPU throttling. The renderer kept at most four full images/two concurrent requests while two sessions received updates. These short samples measure this computer and fixture, not multiplayer capacity or a new phone test. Reruns and screenshots are saved in ignored `release-artifacts/continuous-native-auth/`.

## Preview and release boundaries

The ordinary inspect-only preview remains `node tools/map-benchmark/server.js --port=8803`, then `http://127.0.0.1:8803/__benchmark__/?nativeWorld=1`. It has static sample data and no commands. The authenticated harness is test-only and opens no publicly reachable site.

Production entry points do not import the renderer. The permanent service installs no area reader, and permanent routing rejects the disposable draft capability. A merge cannot enable open-world travel. See [the rollout contract](CONTINUOUS_WORLD_ROLLOUT.md) for the installed identity, compatibility release and outstanding activation gates.
