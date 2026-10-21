# Continuous-world production integration

Prepared October 21, 2026 on `codex/continuous-world-production`. The owner approved completing production integration and a coordinated backend/client rollout; the hands-on gameplay pilot remains waived. This document records the implementation and reproducible checks, not a deployment receipt.

## Runtime contract

`local-backend/world/` supplies current-realm catalog discovery, a bounded authenticated reader, versioned background pathfinding and terrain composition. `world/` supplies the lazily loaded production camera and the existing game's controls. No benchmark server, fictional players, operator grants or development routes enter the published package. Frozen templates contain approved geometry/art paths only. Source paintings are byte-identical copies required by the installed runtime, which does not carry the repository's development artwork directories.

The installed game and worker explicitly receive `continuousWorld: {protocol: 1, enabled: false|true}` in their protected configuration. Only the permanent deployment capability can construct the provider. Firebase and ordinary local platforms retain their previous behavior. The optional camera waits for the existing login/section load to finish. Disabled mode continues legacy gameplay and prewarms terrain in the background. Enabled movement calls require protocol 1 and the current catalog revision; stale tabs receive a recoverable refresh error. A queued client request cannot acquire a newer revision after waiting for an admission slot.

The existing city IDs, saved coordinates, troop costs, speed formulas, ownership checks and transaction/idempotency rules remain authoritative. Display positions use the approved wider layout. New routes cross passable adjoining edges, carry `continuous-world-v1` and a geometry identity, and settle from saved paths/times. Existing legacy and draft-version routes remain readable and resolvable. Closest-source scouting prunes only candidates whose safe straight-line lower bound already exceeds the best complete route, retaining tie rules.

Map reads use a separate read-only two-connection pool, no more than four HTTP admission slots, at most 16 sections per request, bounded public caches and fresh permission checks for exact own counts. Each viewer may have one background area read and one foreground Nearby/Regroup read, so normal polling cannot cancel a bulk-action selection; both share the same connection and global admission bounds. Chat long polling retains its independent admission path. The browser keeps four full terrain images, 16 thumbnails and two image requests in flight, culls offscreen objects, and updates camera transforms once per frame. Native Location and Home controls resolve an unloaded castle's exact display position after its area arrives; manual camera input cancels a pending recenter.

## Changing worlds and artwork

Catalog revision includes the current world, generation, shard, active sections, protocol and travel policy. Expansion prepares a replacement reader and artwork, rejects obsolete commands, then remounts the client automatically. Camera position is preserved relative to its section, as is qualified selection once fresh authorized data arrives. Generation changes clear private state; retired profiles cannot keep using the new realm. Saved city documents are never repositioned.

Terrain is composed in a worker from the approved meadow, dirt material and roads. A fixed atlas origin and two-pixel gutters avoid repainting distant sections when the world grows. Warm starts verify cached content hashes; corruption is regenerated. Current and previous artwork generations are retained, with obsolete files removed. An asset failure does not stop camera movement.

The tested catalog ceiling is 512 sections. At 480 sections the existing game-health report becomes unhealthy, allowing the existing failure alerts to flag capacity review before reaching that ceiling. Catalog preparation failure or stale enabled state also makes game health unhealthy. This is a tested implementation limit, not unlimited multiplayer capacity.

## Validation

Run Node 22 and the focused validation plan. Principal suites:

- `tools/test-local-postgres-production-world.js`: actual packaged/minified production modules in two authenticated game browsers, one shared HTTP server, native controls and real PostgreSQL commands; gold/troop/Crown pickups, attacks, scouting, Nearby, Regroup, NPCs, recall, reinforcement, rally authorization, failure recovery, exact/hidden visibility, generated-map refresh, logout and desktop/landscape layouts.
- `tools/test-local-postgres-world-service.js`: 24 synthetic accounts sharing one server over 112 sections, overlapping/dispersed area reads, scouting and chat, protocol rejection, current ownership, catalog growth, season changes and retired membership. Raster composition is excluded from this load measurement and tested separately.
- `tools/test-local-postgres-production-routes.js`: 216 real-handler calls, old/new route settlement after a fresh backend restart with the feature disabled, retries without troop loss, recall/rejoin and rally lifecycle cases.
- `tools/validate-production-world.js`: 512-section geometry, coordinate/anchored zoom checks, closest-source pruning, approved-art identity, all 202 seams and 91 corners in the 112-section catalog, cache repair and growth locality.
- `tools/test-local-postgres-permanent.js`: independent PostgreSQL cluster, actual restricted roles and authority fencing, all six permanent services, disabled world capability and normal authenticated read/save behavior.
- Existing client, HTTP, chat, renderer and selected multiplayer emulator suites remain in `validation-plan.json`.

One isolated 24-player run measured p95 area reads around 58 ms, commands 85 ms and chat 95 ms, with no admission retries. Two-account browser runs measured approximately 60 FPS and 16.7–16.8 ms p95 frames at 1440×900, 844×390 and 568×320; mobile sizes use 4× CPU throttling. These are bounded synthetic tests on this computer, not a real-player capacity guarantee. Latest machine-readable reports and screenshots are written under `release-artifacts/continuous-production/` and kept with the installation evidence.

## Release order and rollback

1. Require current main ancestry and the exact PR head's three checks. Build an immutable payload and compare every changed installed file, release contract and runtime/dependency fingerprint. Recheck the current realm and healthy services.
2. Under the existing publisher lock, retain code/config/release rollback copies, install the reviewed runtime plus its locked Sharp dependency, and restart game/worker with the feature disabled. No player-data migration or additional database backup occurs.
3. Check restricted-service startup and terrain warmup. Approve new publisher fingerprints only after installed bytes match; publish the matching static client and verify its public build ID and world modules.
4. Enable matching game/worker configuration, restart briefly, verify the prepared catalog and public/authenticated transport, and observe health, worker queues and request timing.
5. On a regression, disable the world feature and let clients refresh back to the compatible presentation. Keep the new saved-route-compatible runtime so accepted marches settle unchanged. Restore older code only before any continuous-world order could have been accepted. Never restore a player database as a code rollback.

The operator installation receipt, verified public build ID and live service status determine whether this is deployed. A merge alone does not.
