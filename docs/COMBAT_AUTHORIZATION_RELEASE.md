# Offensive shield cooldown and city retaliation

Confirmed behavior: September 19, 2026. Branch: `codex/offensive-shield-retaliation`.
Release status: implementation and validation in progress; deployment has not yet been verified.

## Scope and integration

The server checks cooldowns in `activateInventoryItem`, creates them in successful `sendArmyOrder`, `sendHoldingTowerArmyOrder`, and `launchClanRally` transactions, and does not create them in combat resolution. Rally contributions receive cooldowns at combined dispatch, including contributors other than the caller. Neutral objectives, scouting and friendly troop movements retain their existing behavior.

The existing Protected Assault/Protected Raid formulas remain the default. `previewArmyProtection` and actual launch may instead validate an explicitly selected, owner-private retaliation record for one regular city. Normal Main City, Peace Shield, clan and anti-farming checks still run. Tower-origin attacks use the same protection builder and check Main City, shield and clan restrictions at dispatch.

Successful regular-city conquest creates retaliation only when the displaced ruler's authoritative power would protect the capturer under the existing inverse power-ratio rule. A server-generated capture ID includes the resolving army and immutable city document path. The city and permission are written in the capture transaction. The launch transaction reads the permission, validates its realm/actor/target/deadline/status, and marks it used together with march creation. A trusted snapshot on that original outbound march preserves the exception at arrival. Current ownership and elapsed travel do not invalidate it. Rerouted returns and unrelated destinations cannot reuse the snapshot.

## Persistence and security

| Location | Fields | Purpose |
| --- | --- | --- |
| `players/{uid}` | `peaceShieldCooldownExpiresAtMs`, `peaceShieldCooldownResetGeneration` | Server-owned activation deadline; old seasons are ignored. |
| `players/{uid}/retaliationWindows/{captureId}` | `originalOwnerUid`, `capturerUid`, `cityId`, `regionId`, `cityPath`, `cityName`, `capturedAtMs`, `expiresAtMs`, `status`, `usedAtMs`, `usedArmyId`, `sourceArmyId`, world/reset/shard identity | One private permission per qualifying capture. Clients can read their current realm records but cannot write them. Expired records are safely ignored. |
| Regular city | `retaliationAbandonLocks` map of capturer UID to expiration | Retains independent capturer restrictions across ownership changes; checks only the current owner's entry. Consumption does not shorten a lock. Expired entries are pruned on subsequent qualifying captures. |
| Server-created attack march | `retaliationAuthorization` | Committed exact-target launch receipt; expiration applies to dispatch, not arrival. |

The private available-record query has a composite index for reset generation, world, realm shard and status. It has no count limit that could hide independent opportunities. The HUD filters expiration against the existing server-adjusted clock and preserves native expandable-list state while updating countdowns. The timers never use browser storage as authority.

No production data migration or backfill is required. Only captures after backend deployment create permissions. Existing active Peace Shields are not removed by this update. Previously dispatched attacks do not receive retroactive cooldowns.

## Validation

- `tools/validate-combat-authorization.js`: offensive-only classification including clan-held objectives, exact expiration boundaries, reset scope, monotonic concurrent deadlines, exact-city/realm/actor permissions, consumed records, changing ownership, capturer-specific locks, trusted arrival snapshots and UI countdowns.
- `functions/test/emulator-combat-authorization.js`: real authenticated low/high conquests on the current core topology, persisted 15-minute cooldowns, no defender cooldown, failed item activation without consumption, grant creation, preview/cap exception, exact-city enforcement, insufficient troops, shields/Main City protection, third-player conquest, simultaneous launch contention, idempotent retry, used/expired grants, long travel, independent captures, abandon rejection/expiry, normal transfers, shield activation after expiry, and Firestore private reads/forbidden writes.
- `functions/test/emulator-rally-lifecycle.js`: additional assertions cover no cooldown for formation/join/failed launch, individual cooldowns for actual PvP contributors and unchanged existing shield retention.
- The combat emulator also dispatches against neutral and player-held Camps, Gold Strongholds and the Crown Citadel; launches five-contributor Gold/Citadel/Clan Tower Rallies; checks every contributor and defender; verifies scouting isolation and Tower-origin retaliation.
- `tools/validate-combat-timers-browser.js`: actual game fixture at 1440×900, 844×390 and 568×320; placement beneath Gold, all twelve entries accessible, bounded scrolling, no Chat overlap, popover hit testing, single-city identity, independent expiration, account clearing, and reconstruction from authoritative timestamps.
- Full repository lint, static validation, production build and multiplayer gates must pass before merge. Required GitHub checks and deployment evidence will be recorded separately when available.

The browser fixture and emulator use isolated test accounts/state. They do not simulate a production-player takeover or modify live player records.

Focused checks passed before PR preparation: full repository lint; combat policy; the authenticated combat emulator; the three-size timer browser fixture; and existing validators for King Power protection, authoritative orders, relinquishment, shields, Rallies, inventory, subscriptions, transaction retries, retargeting and Clan Towers. This JavaScript repository has no separate TypeScript typecheck script; syntax and ESLint checks are its configured code checks.

## Changed-file groups

- Backend authority: `functions/index.js`, `functions/combat-authorization.js`.
- Private persistence and query access: `firestore.rules`, `firestore.indexes.json`, `firebaseClient.js`.
- Player feedback and timers: `game.js`, `combat-timers-ui.js`, `combat-timers-ui.css`, `instant-economy-actions.js`, `index.html`.
- Release packaging and source fingerprint: `tools/build-production-client.js`, `tools/validate-production-artifact.js`, `tools/generate-release-manifest.js`.
- Validation: `functions/package.json`, `functions/test/run-emulator-gates.js`, `functions/test/emulator-combat-authorization.js`, `functions/test/emulator-rally-lifecycle.js`, `tools/validate-combat-authorization.js`, `tools/validate-combat-timers-browser.js`.
- Confirmed design and release notes: the Master Development Specification and this document.
