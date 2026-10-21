# Continuous world: normal game UI rehearsal

October 21, 2026. The hands-on player pilot remains waived. This is the first normal-game integration milestone, not public activation or completion of the production integration gate.

## What works

The existing `index.html` HUD, city information, castle/camp/objective action menus and troop-order dialog can sit over the continuous renderer. The loopback benchmark adds a shadow-root map surface and a development adapter to the existing game runtime; production entry points never load either. The nine Core sections retain catalog IDs and original gameplay coordinates while displaying the wider castle layout. A click resolves the selected section through the game's existing loading path, then selects the original object ID. Section loads are serialized; only the latest click can activate controls. Dragging belongs to the continuous camera. Switching the active gameplay section preserves an armed order's source and does not reset that camera.

Native action controls remain screen-sized, are kept inside the viewport, and the small camera controls avoid the bottom HUD. Home and normal location focusing project into the continuous scene. Account/session changes dispose the surface, pending selection and listeners and restore the regular renderer. Towers retain the read-only prototype inspector and sample patrols retain Follow.

A real-handler automated test opens the actual city information and Send controls, chooses a target in another section, adjusts the normal troop slider, gets authoritative route previews, confirms the attack and verifies the saved march in a disposable PostgreSQL world. The adapter supplies a fixed fictional acting account; requests cannot select a production account. This test also exposed an existing accepted-attack notification error: a missing optional protection snapshot was treated as a non-normal protection mode, then its `label` was dereferenced. The normal client now handles that absent snapshot as an ordinary accepted attack. No combat rules changed.

## Isolation and current limits

The ordinary preview is an **interface rehearsal using static fictional snapshots**. It cannot submit orders: the optional command transport is installed only by the automated test with a fresh sample schema and a per-process nonce. Same-origin POST, a bounded body and the existing pilot command allowlist protect that test endpoint. It is loopback-only and the test removes its own schema on completion. No real account, service, route, backup or production database is changed. External font links are omitted from this private page so its network traffic remains local.

The authenticated area feed and live march reconciliation still run in the separate read-only/gameplay prototypes. They are **not yet attached to this normal-HUD surface**. The sample patrols here are not the marches submitted by the command test. Scout Nearby/Regroup HUD buttons are deliberately disabled until that surface has the authoritative adjoining-section candidate feed; submitting the old same-section candidates would give the wrong wider-world result. Their server behavior and separate pilot controls remain tested and unchanged. Tower commands, full NPC/objective parity, recovery-journal integration and old/new march rendering remain part of the next integration pass. Current HUD resources in this rehearsal are sample values, not a view of the owner's account.

## Validation

- `node tools/validate-continuous-game-ui.js`: exact section-plus-ID matching, rapid queued selections, obsolete responses, session loss, cancellation, disposal/error recovery, all 540 catalog castle identities/original coordinates, private endpoint denial, package exclusion and null/normal/raid accepted-attack messages.
- `CHROME_PATH=... node tools/test-local-postgres-native-world-ui.js`: original city dialog, Send/source retention across sections, real preview/attack persistence, mobile control bounds, touch-event isolation, session teardown and zero external requests/browser exceptions. Requires the existing local test PostgreSQL and Node 22; it creates/drops only its own random worldtest schema.
- Existing seamless-world browser regression: all seams/corners, mouse/touch, anchored zoom, selection/follow, resize, failed/delayed image recovery and bounded residency. Existing catalog, map benchmark, authoritative-order, pending-departure and command-routing validators also pass.

Normal-HUD scene on this desktop, with nine sections and viewport culling:

| Viewport | CPU throttle | FPS | p95 frame |
| --- | --- | --- | --- |
| 1440 × 900 | 1× | 60.0 | 16.7 ms |
| 844 × 390 | 4× | 59.3 | 16.7 ms |
| 568 × 320 | 4× | 59.3 | 16.7 ms |

The continuous renderer’s full-terrain cache stayed at four; its concurrent image requests stayed at two. The legacy game still performs its own section-art preparation during selection; unifying those loaders is also needed before claiming a four-image bound for the complete production client. Screenshots and machine-readable results are in ignored `release-artifacts/continuous-native-ui/`. These short automated camera samples measure rendering and this one order flow, not multiplayer capacity. The separate renderer's crowded 4× CPU regression measured approximately 47–53 FPS with p95 around 33.4 ms; it did not sustain 60 FPS under that stress. No new physical-phone test or human pilot was performed.

## Open the interface preview

```sh
node tools/map-benchmark/server.js --port=8803
```

Open `http://127.0.0.1:8803/__benchmark__/?nativeWorld=1`. This uses sample data and has no command capability. The regular benchmark and standalone continuous preview retain their existing entry points.

## Before public activation

Complete the authenticated area-feed/march integration and remaining action coverage in this normal HUD, then test representative command load, route compatibility through restart/rollback and a coordinated backend/client installation. Recheck the authoritative current realm before production-specific work. A merge of this rehearsal does not publish a continuous world. Only the small accepted-attack notification fix is eligible for the existing compatible static publisher.
