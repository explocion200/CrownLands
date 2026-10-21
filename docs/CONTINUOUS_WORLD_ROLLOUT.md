# Continuous-world backend/client rollout

Prepared October 21, 2026 for the owner's request to connect authenticated areas, actual movements and remaining actions, then coordinate the backend/client release. This is a deployment contract and readiness record, **not an activation receipt**. The human pilot was waived, not passed.

## Verified starting state

- Release topology: `core-expansion-v1` in both configurations.
- Authoritative pointer: `main-realm-2026-10`, generation `realm-2026-10`, shard `shard_0001`, ready. Recheck before installation; tests use an independently generated 112-section world.
- Observed public client: `eff59a7b2414a3ada0f74cf16881cb00de2713f2`, local PostgreSQL mode.
- Publisher: `held`, candidate `f060085ca45cd292ebfc0f8bfdac47ef9cb49a20`, reason `Backend change held for migration: backend`.
- Compared with that live commit, executable compatibility changes are `functions/index.js`, `local-backend/platform.js` and `local-backend/game-http.js`, plus generated release identity. Data and dependency versions are unchanged. Recompute this inventory against the exact merged candidate; this list does not replace installation/fingerprint validation.

## Compatibility before activation

**Compatibility installation:** review the complete merged difference from the installed runtime; require the exact PR head's Static validation, Multiplayer emulator validation and Validate checks. Build from that immutable merge, stage the runtime with installed locked dependencies, and test normal draft-disabled handlers. Use the existing publisher lock, protected-file checks, activation epoch and before/after hashes. Record rollback copies of changed code and release metadata, stop game/worker for replacement, restart and check health/queues. Update approved fingerprints only after installed bytes match. Let the signed publisher activate the matching static client and verify its public build identity. This phase alone does **not** publish a continuous map.

**Continuous-world activation:** needs a production-ready package and server provider satisfying the prerequisites below. Keep ordinary gameplay on the current map until that pair is ready. Never copy the fictional-account test harness into the live runtime.

## Outstanding public-activation prerequisites

1. Promote renderer, terrain delivery, reader and pathfinder into audited, fingerprinted production modules. The client currently excludes them, the permanent service supplies no `worldData`, and `privateWorldRouting` accepts only disposable worldtest schemas. These boundaries remain enforced.
2. Replace pilot-only candidates with current player/clan membership, active sections and fresh ownership. The fixture's two named players and disposal assumptions must not reach production.
3. Handle catalog growth and season replacement. The private reader returns 409 and clears data when its catalog signature changes, and supports at most 256 sections. Live service must rebuild/version catalog and terrain, refresh clients without operator restarts and define a tested scale limit.
4. Add a capability/revision handshake for display geometry, travel policy and qualified bulk actions. Old tabs must not silently use old-range candidates against new policy; new tabs must not fall back to old travel after failed previews. Require refresh or reject incompatible new commands recoverably. Test old/new artifact combinations.
5. Measure representative simultaneous **commands plus area feeds**, especially closest-source scouting, admission/retries and database time. Two-account HUD tests and a bounded worker burst are not public capacity approval. The earlier larger dispersed reader cohort still had material deferrals.

The private HUD action tests and fresh-process saved-route test provide evidence for their stated scope. They do not satisfy the missing production provider, packaging, protocol or capacity checks.

## Activation and rollback order

After those prerequisites pass, stage the server with activation off and the matching signed client. Verify current realm, active-section digest, installed dependency hashes and disclosure rules. Enable authoritative routing only with the matching client capability available; stale tabs must refresh before new-policy commands. Verify deployed sign-in, bounded area reads, movements, all command classes and browser errors against the public build identity. Observe health, worker queues, p95/p99 command latency and 429/503 rates against the pre-change baseline before widening exposure.

Accepted armies retain saved paths, routing version, geometry ID and launch/arrival times. Never rewrite city coordinates or in-flight routes to fit the display. Fresh-process tests settle both route versions without the draft provider. Production must also render both explicitly, including old endpoints at original positions, through a flag rollback.

On a disclosure error, missing target, accumulating queue, sustained retry/latency regression or artifact mismatch, stop new continuous-mode commands and restore the compatible presentation. Continue accepted marches on their recorded geometry. Restore previous code/policy/release metadata only if it supports every accepted order version; never restore a database snapshot as an application rollback. Uptime, backups, translation, payments and authentication configuration remain outside this change. No extra database backup is requested.
